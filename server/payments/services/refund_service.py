"""
payments/services/refund_service.py — Refund processing service supporting
instant wallet refunds and administrative order refunds with ledger posting (Sprint 14).
"""
import uuid
from decimal import Decimal
from typing import Optional
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from orders.models import Order, OrderStatus, ReturnRequest, ReturnStatus
from payments.models import Refund, RefundMethod, RefundStatus
from payments.services.ledger import ledger_service, LedgerAccountType


class RefundService:
    @classmethod
    def process_instant_refund(
        cls,
        return_request: ReturnRequest,
        performed_by = None,
    ) -> Refund:
        """
        Bypasses waiting for physical parcel return by crediting the customer's
        wallet store credit directly.
        """
        if return_request.status not in (ReturnStatus.REQUESTED, ReturnStatus.APPROVED):
            raise ValidationError(
                {"status": f"Cannot process instant refund for return in status '{return_request.status}'."}
            )

        order_item = return_request.order_item
        vendor_order = order_item.vendor_order
        order = vendor_order.order
        refund_amount = order_item.line_subtotal

        with transaction.atomic():
            # Deposit store credit to user wallet
            entry_group_id = ledger_service.post_wallet_deposit(
                user=return_request.user,
                amount=refund_amount,
                memo=f"Instant wallet refund for RMA {return_request.id.hex[:8]}",
            )

            refund = Refund.objects.create(
                order=order,
                vendor_order=vendor_order,
                return_request=return_request,
                amount=refund_amount,
                currency=order.currency,
                method=RefundMethod.WALLET,
                status=RefundStatus.SUCCEEDED,
                reason=f"Instant RMA refund for {order_item.variant_sku_snapshot}",
                ledger_entry_group_id=entry_group_id,
                processed_by=performed_by,
            )

            return_request.status = ReturnStatus.CLOSED
            return_request.closed_at = timezone.now()
            return_request.save(update_fields=["status", "closed_at", "updated_at"])

        return refund

    @classmethod
    def process_order_refund(
        cls,
        order: Order,
        amount: Decimal,
        reason: str = "",
        method: str = RefundMethod.ORIGINAL_PAYMENT,
        processed_by = None,
    ) -> Refund:
        """
        Processes a full or partial administrative refund for an order.
        Validates that refund amount does not exceed captured amount minus already refunded.
        """
        amount = Decimal(str(amount)).quantize(Decimal("0.01"))
        if amount <= Decimal("0.00"):
            raise ValidationError({"amount": "Refund amount must be positive."})

        # Calculate already refunded total
        already_refunded = (
            Refund.objects.filter(order=order, status=RefundStatus.SUCCEEDED).aggregate(
                total=Sum("amount")
            )["total"]
            or Decimal("0.00")
        )

        max_allowed = order.grand_total - already_refunded
        if amount > max_allowed:
            raise ValidationError(
                {"amount": f"Requested refund of ${amount} exceeds refundable balance of ${max_allowed}."}
            )

        with transaction.atomic():
            entry_group_id = None
            if method == RefundMethod.WALLET and order.customer:
                entry_group_id = ledger_service.post_wallet_deposit(
                    user=order.customer,
                    amount=amount,
                    memo=f"Refund for order {order.order_number}: {reason}",
                )
            else:
                # Post balanced cash refund ledger entry
                entries = [
                    {
                        "account": "platform_revenue_commission",
                        "account_type": LedgerAccountType.PLATFORM_REVENUE_COMMISSION,
                        "amount": amount,
                        "memo": f"Reversal for order {order.order_number} refund",
                    },
                    {
                        "account": "platform_cash",
                        "account_type": LedgerAccountType.PLATFORM_CASH,
                        "amount": -amount,
                        "memo": f"Cash outflow for order {order.order_number} refund",
                    },
                ]
                entry_group_id = ledger_service.post(
                    entries=entries,
                    reference_type="order_refund",
                    reference_id=order.id,
                    memo=reason or f"Refund for order {order.order_number}",
                )

            refund = Refund.objects.create(
                order=order,
                amount=amount,
                currency=order.currency,
                method=method,
                status=RefundStatus.SUCCEEDED,
                reason=reason,
                ledger_entry_group_id=entry_group_id,
                processed_by=processed_by,
                gateway_refund_id=f"REF_{uuid.uuid4().hex[:12].upper()}",
            )

            # Update order status if fully refunded
            if already_refunded + amount >= order.grand_total:
                order.status = OrderStatus.REFUNDED
                order.save(update_fields=["status", "updated_at"])

        return refund


refund_service = RefundService()
