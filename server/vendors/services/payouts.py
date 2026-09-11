"""
vendors/services/payouts.py — Vendor Payout Settlement Service (Sprint 15).
Idempotent batch processing, mature escrow sweeping, adjustment deduction,
and double-entry ledger disbursement.
"""
import uuid
import datetime
import logging
from decimal import Decimal
from typing import Optional, List
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from vendors.models import (
    Vendor,
    VendorStatus,
    VendorPayout,
    VendorPayoutStatus,
    PayoutLineItem,
    PayoutAdjustment,
)
from payments.models import EscrowHold, EscrowStatus
from payments.services.escrow import escrow_service
from payments.services.ledger import ledger_service

logger = logging.getLogger(__name__)


class PayoutService:
    @classmethod
    def run_payout_batch(
        cls,
        vendor: Vendor,
        period_start: datetime.date,
        period_end: datetime.date,
        performed_by = None,
    ) -> Optional[VendorPayout]:
        """
        Processes a payout batch for a vendor over a designated settlement period.
        Guaranteed idempotent by (vendor, period_start, period_end).
        """
        # 1. Idempotency check: return existing if already processing or paid
        existing = VendorPayout.objects.filter(
            vendor=vendor,
            period_start=period_start,
            period_end=period_end,
            status__in=[VendorPayoutStatus.PROCESSING, VendorPayoutStatus.PAID],
        ).first()
        if existing:
            logger.info(f"Payout already exists for {vendor.display_name} for period {period_start} to {period_end}.")
            return existing

        # 2. Release any mature eligible holds for this vendor that are past eligible_at
        mature_holds = EscrowHold.objects.filter(
            vendor=vendor,
            status__in=[EscrowStatus.HELD, EscrowStatus.ELIGIBLE_FOR_RELEASE],
            eligible_at__isnull=False,
            eligible_at__lte=timezone.now(),
            frozen_by_rma__isnull=True,
        ).exclude(status=EscrowStatus.DISPUTED)

        for hold in mature_holds:
            try:
                escrow_service.release_hold(hold, reference=f"BATCH_SWEEP_{vendor.id}")
            except Exception as exc:
                logger.error(f"Error releasing hold {hold.id} during payout sweep: {exc}")

        # 3. Find all RELEASED holds up to period_end that haven't been attached to an active payout
        released_holds = (
            EscrowHold.objects.filter(
                vendor=vendor,
                status=EscrowStatus.RELEASED,
                vendor_order__created_at__date__lte=period_end,
            )
            .exclude(
                vendor_order__payout_line_items__payout__status__in=[
                    VendorPayoutStatus.PAID,
                    VendorPayoutStatus.PROCESSING,
                ]
            )
            .select_related("vendor_order", "vendor_order__order")
        )

        # 4. Gathers unattached adjustments for this vendor
        unattached_adjustments = PayoutAdjustment.objects.filter(
            vendor=vendor,
            payout__isnull=True,
        )

        if not released_holds.exists() and not unattached_adjustments.exists():
            logger.info(f"No eligible funds or adjustments to settle for {vendor.display_name}.")
            return None

        # 5. Compute gross, adjustments, net amount
        gross_amount = sum(
            (Decimal(str(h.net_vendor_amount)) for h in released_holds),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))

        adjustments_total = sum(
            (Decimal(str(a.amount)) for a in unattached_adjustments),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))

        raw_net = gross_amount + adjustments_total
        net_amount = max(Decimal("0.00"), raw_net).quantize(Decimal("0.01"))

        # 6. Execute atomic settlement and ledger disbursement
        with transaction.atomic():
            payout = VendorPayout.objects.create(
                vendor=vendor,
                period_start=period_start,
                period_end=period_end,
                gross_amount=gross_amount,
                adjustments_total=adjustments_total,
                net_amount=net_amount,
                status=VendorPayoutStatus.PAID if net_amount > 0 else VendorPayoutStatus.PAID,
                disbursed_at=timezone.now(),
                external_transfer_id=f"TR_{uuid.uuid4().hex[:12].upper()}",
            )

            # Attach line items
            for hold in released_holds:
                PayoutLineItem.objects.create(
                    payout=payout,
                    vendor_order=hold.vendor_order,
                    amount=hold.net_vendor_amount,
                )

            # Link adjustments
            unattached_adjustments.update(payout=payout)

            # Post double-entry disbursement
            if net_amount > Decimal("0.00"):
                entry_group_id = ledger_service.post_vendor_payout(
                    payout=payout,
                    memo=f"Settlement payout {payout.id.hex[:8]} for {vendor.display_name}",
                )
                payout.ledger_entry_group_id = entry_group_id
                payout.save(update_fields=["ledger_entry_group_id"])

        logger.info(
            f"Successfully created payout {payout.id} for {vendor.display_name}: "
            f"Gross ${gross_amount}, Adj ${adjustments_total}, Net ${net_amount}."
        )
        return payout

    @classmethod
    def run_all_due_payouts(
        cls,
        period_start: Optional[datetime.date] = None,
        period_end: Optional[datetime.date] = None,
        performed_by = None,
    ) -> List[VendorPayout]:
        """
        Sweeps all active vendors and generates payouts for those with eligible funds.
        """
        today = timezone.now().date()
        if not period_end:
            period_end = today
        if not period_start:
            period_start = period_end - datetime.timedelta(days=14)

        active_vendors = Vendor.objects.filter(status=VendorStatus.ACTIVE)
        created_payouts = []

        for vendor in active_vendors:
            try:
                payout = cls.run_payout_batch(
                    vendor=vendor,
                    period_start=period_start,
                    period_end=period_end,
                    performed_by=performed_by,
                )
                if payout:
                    created_payouts.append(payout)
            except Exception as exc:
                logger.error(f"Error running payout batch for vendor {vendor.id}: {exc}")

        return created_payouts


payout_service = PayoutService()
