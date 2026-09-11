"""
payments/services/ledger.py — Double-entry accounting engine (Sprint 12).

Enforces strict double-entry principles:
Every posting group must have sum(amounts) == 0.00 (DR positive, CR negative).
Immutable, append-only entries.
"""
from decimal import Decimal
import uuid
import logging
from typing import List, Dict, Any, Optional, Union
from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from accounts.models import LedgerAccount, LedgerAccountType, LedgerEntry, User
from payments.models import EscrowHold, EscrowStatus, CODCollection

logger = logging.getLogger(__name__)


class LedgerService:
    @staticmethod
    def get_or_create_account(
        account_key: str,
        account_type: str,
        owner_user: Optional[User] = None,
        owner_vendor_id: Optional[uuid.UUID] = None,
        currency: str = "USD",
    ) -> LedgerAccount:
        """
        Retrieves or creates a system or user-specific LedgerAccount.
        """
        account, _ = LedgerAccount.objects.get_or_create(
            account_key=account_key,
            defaults={
                "account_type": account_type,
                "owner_user": owner_user,
                "owner_vendor_id": owner_vendor_id,
                "currency": currency,
            },
        )
        return account

    @staticmethod
    def get_account_balance(account_or_key: Union[LedgerAccount, str]) -> Decimal:
        """
        Calculates the net balance of an account (sum of signed entries).
        """
        if isinstance(account_or_key, str):
            account = LedgerAccount.objects.filter(account_key=account_or_key).first()
            if not account:
                return Decimal("0.00")
        else:
            account = account_or_key

        res = account.entries.aggregate(total=Sum("amount"))["total"]
        return res or Decimal("0.00")

    @classmethod
    def post(
        cls,
        entries: List[Dict[str, Any]],
        reference_type: str,
        reference_id: Optional[uuid.UUID] = None,
        memo: str = "",
    ) -> uuid.UUID:
        """
        Posts an atomic, balanced group of double-entry ledger records.
        Asserts that the sum of amounts equals Decimal('0.00').
        """
        if not entries:
            raise ValidationError({"ledger": "Cannot post an empty set of ledger entries."})

        total_sum = Decimal("0.00")
        resolved_entries = []

        for item in entries:
            acc = item["account"]
            if isinstance(acc, str):
                acc_type = item.get("account_type", LedgerAccountType.PLATFORM_CASH)
                user = item.get("owner_user")
                vendor_id = item.get("owner_vendor_id")
                acc = cls.get_or_create_account(acc, acc_type, owner_user=user, owner_vendor_id=vendor_id)

            raw_amount = item["amount"]
            amount = Decimal(str(raw_amount)).quantize(Decimal("0.01"))
            total_sum += amount
            resolved_entries.append({
                "account": acc,
                "amount": amount,
                "memo": item.get("memo", memo),
            })

        if total_sum != Decimal("0.00"):
            raise ValidationError(
                {"ledger": f"Unbalanced ledger entries: sum of amounts must be 0.00 (got {total_sum})."}
            )

        entry_group_id = uuid.uuid4()

        with transaction.atomic():
            for it in resolved_entries:
                LedgerEntry.objects.create(
                    account=it["account"],
                    amount=it["amount"],
                    entry_group_id=entry_group_id,
                    reference_type=reference_type,
                    reference_id=reference_id,
                    memo=it["memo"],
                )

        logger.info(
            f"Posted ledger entry group {entry_group_id} [{reference_type}] with {len(resolved_entries)} entries."
        )
        return entry_group_id

    @classmethod
    def post_order_payment(cls, order, gateway_name: str = "stripe") -> uuid.UUID:
        """
        Records order capture:
        DR: Platform Cash (+order.grand_total)
        CR: Platform Revenue Commission (-commission_total)
        CR: Vendor Escrow (-net_vendor_amount for each vendor order)
        CR: Tax / Shipping remainder
        """
        entries = []
        entries.append({
            "account": "platform_cash",
            "account_type": LedgerAccountType.PLATFORM_CASH,
            "amount": order.grand_total,
            "memo": f"Customer capture for order {order.order_number} via {gateway_name}",
        })

        total_commission = Decimal("0.00")
        for vo in order.vendor_orders.all():
            commission = vo.commission_amount
            net_vendor = vo.subtotal - commission
            total_commission += commission

            entries.append({
                "account": f"vendor_escrow:{vo.vendor_id}",
                "account_type": LedgerAccountType.VENDOR_ESCROW,
                "owner_vendor_id": vo.vendor_id,
                "amount": -net_vendor,
                "memo": f"Escrow hold for vendor {vo.vendor.display_name} (Order {order.order_number})",
            })

            EscrowHold.objects.update_or_create(
                vendor_order=vo,
                defaults={
                    "vendor": vo.vendor,
                    "gross_amount": vo.subtotal,
                    "commission_amount": commission,
                    "net_vendor_amount": net_vendor,
                    "currency": order.currency,
                    "status": EscrowStatus.HELD,
                },
            )

        platform_remainder = order.grand_total - sum(abs(e["amount"]) for e in entries if e["amount"] < 0)

        if platform_remainder > Decimal("0.00"):
            entries.append({
                "account": "platform_revenue_commission",
                "account_type": LedgerAccountType.PLATFORM_REVENUE_COMMISSION,
                "amount": -platform_remainder,
                "memo": f"Platform revenue & commission for order {order.order_number}",
            })

        return cls.post(
            entries=entries,
            reference_type="order_capture",
            reference_id=order.id,
            memo=f"Order {order.order_number} settlement",
        )

    @classmethod
    def post_escrow_release(cls, escrow_hold: EscrowHold, reference: str = "") -> uuid.UUID:
        """
        Releases funds from Vendor Escrow to Vendor Payable:
        DR: Vendor Escrow (+net_vendor_amount, reducing liability)
        CR: Vendor Payable (-net_vendor_amount, increasing payable liability)
        """
        vendor_id = escrow_hold.vendor_id
        amount = escrow_hold.net_vendor_amount

        entries = [
            {
                "account": f"vendor_escrow:{vendor_id}",
                "account_type": LedgerAccountType.VENDOR_ESCROW,
                "owner_vendor_id": vendor_id,
                "amount": amount,
                "memo": f"Release escrow hold for order {escrow_hold.vendor_order.order.order_number}",
            },
            {
                "account": f"vendor_payable:{vendor_id}",
                "account_type": LedgerAccountType.VENDOR_PAYABLE,
                "owner_vendor_id": vendor_id,
                "amount": -amount,
                "memo": f"Funds payable to vendor {escrow_hold.vendor.display_name}",
            },
        ]

        return cls.post(
            entries=entries,
            reference_type="escrow_release",
            reference_id=escrow_hold.id,
            memo=reference or f"Escrow release for order {escrow_hold.vendor_order.order.order_number}",
        )

    @classmethod
    def post_vendor_payout(cls, payout, memo: str = "") -> uuid.UUID:
        """
        Disburses settled funds to vendor via external transfer:
        DR: Vendor Payable (+net_amount, reducing liability)
        CR: Platform Cash (-net_amount, reducing cash balance)
        """
        vendor_id = payout.vendor_id
        amount = payout.net_amount

        entries = [
            {
                "account": f"vendor_payable:{vendor_id}",
                "account_type": LedgerAccountType.VENDOR_PAYABLE,
                "owner_vendor_id": vendor_id,
                "amount": amount,
                "memo": f"Disbursement settlement for payout {payout.id}",
            },
            {
                "account": "platform_cash",
                "account_type": LedgerAccountType.PLATFORM_CASH,
                "amount": -amount,
                "memo": f"Payout transfer to {payout.vendor.display_name}",
            },
        ]

        return cls.post(
            entries=entries,
            reference_type="payout",
            reference_id=payout.id,
            memo=memo or f"Payout disbursement for {payout.vendor.display_name}",
        )


    @classmethod
    def post_wallet_deposit(cls, user: User, amount: Decimal, memo: str = "Store credit deposit") -> uuid.UUID:
        """
        Adds store credit to a customer's wallet:
        DR: Platform Cash (+amount)
        CR: Customer Wallet (-amount, liability to customer)
        """
        entries = [
            {
                "account": "platform_cash",
                "account_type": LedgerAccountType.PLATFORM_CASH,
                "amount": amount,
                "memo": f"Wallet top-up for {user.email}",
            },
            {
                "account": f"customer_wallet:{user.id}",
                "account_type": LedgerAccountType.CUSTOMER_WALLET,
                "owner_user": user,
                "amount": -amount,
                "memo": memo,
            },
        ]
        return cls.post(entries=entries, reference_type="wallet_deposit", reference_id=user.id, memo=memo)

    @classmethod
    def post_cod_collection(cls, cod_collection: CODCollection, collected_by: Optional[User] = None) -> uuid.UUID:
        """
        Records Cash on Delivery receipt:
        DR: Platform Cash (+amount)
        CR: COD Receivable (-amount)
        """
        entries = [
            {
                "account": "platform_cash",
                "account_type": LedgerAccountType.PLATFORM_CASH,
                "amount": cod_collection.amount,
                "memo": f"COD collection for order {cod_collection.order.order_number}",
            },
            {
                "account": f"cod_receivable:{cod_collection.order.id}",
                "account_type": LedgerAccountType.COD_RECEIVABLE,
                "amount": -cod_collection.amount,
                "memo": f"COD receipt settled (Agent: {collected_by.email if collected_by else 'System'})",
            },
        ]
        return cls.post(
            entries=entries,
            reference_type="cod_settlement",
            reference_id=cod_collection.id,
            memo=f"COD collected for {cod_collection.order.order_number}",
        )

    @classmethod
    def reconcile(cls) -> Dict[str, Any]:
        """
        Audits double-entry ledger balance integrity across all accounts.
        Overall platform net sum must equal 0.00.
        """
        all_entries = LedgerEntry.objects.all()
        total_debits = all_entries.filter(amount__gt=0).aggregate(s=Sum("amount"))["s"] or Decimal("0.00")
        total_credits = all_entries.filter(amount__lt=0).aggregate(s=Sum("amount"))["s"] or Decimal("0.00")
        net_balance = total_debits + total_credits

        is_balanced = net_balance == Decimal("0.00")
        accounts_count = LedgerAccount.objects.count()
        entries_count = all_entries.count()

        return {
            "is_balanced": is_balanced,
            "total_debits": str(total_debits),
            "total_credits": str(abs(total_credits)),
            "net_discrepancy": str(net_balance),
            "accounts_count": accounts_count,
            "entries_count": entries_count,
        }


ledger_service = LedgerService()
