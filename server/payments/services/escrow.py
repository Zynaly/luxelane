"""
payments/services/escrow.py — Vendor Escrow Hold management service (Sprint 12).
"""
import datetime
import logging
from typing import Optional
from django.utils import timezone
from django.db import transaction
from rest_framework.exceptions import ValidationError

from payments.models import EscrowHold, EscrowStatus
from payments.services.ledger import ledger_service

logger = logging.getLogger(__name__)


class EscrowService:
    @staticmethod
    def create_hold(vendor_order) -> EscrowHold:
        """
        Initializes an EscrowHold for a confirmed VendorOrder.
        """
        commission = vendor_order.commission_amount
        net_vendor = vendor_order.subtotal - commission

        hold, _ = EscrowHold.objects.update_or_create(
            vendor_order=vendor_order,
            defaults={
                "vendor": vendor_order.vendor,
                "gross_amount": vendor_order.subtotal,
                "commission_amount": commission,
                "net_vendor_amount": net_vendor,
                "currency": vendor_order.order.currency,
                "status": EscrowStatus.HELD,
            },
        )
        return hold

    @staticmethod
    def schedule_release(vendor_order, delay_days: int = 7) -> EscrowHold:
        """
        Schedules escrow eligibility once the order item is delivered.
        eligible_at is set to delivered_at + return_window_days (default 7 days).
        """
        hold = getattr(vendor_order, "escrow_hold", None)
        if not hold:
            hold = EscrowService.create_hold(vendor_order)

        hold.eligible_at = timezone.now() + datetime.timedelta(days=delay_days)
        hold.status = EscrowStatus.ELIGIBLE_FOR_RELEASE
        hold.save(update_fields=["eligible_at", "status", "updated_at"])
        return hold

    @staticmethod
    def release_hold(escrow_hold: EscrowHold, reference: str = "") -> EscrowHold:
        """
        Transitions an eligible EscrowHold to RELEASED and posts ledger entry
        transferring liability from Vendor Escrow to Vendor Payable.
        """
        if escrow_hold.status == EscrowStatus.RELEASED:
            return escrow_hold

        if escrow_hold.status not in (EscrowStatus.HELD, EscrowStatus.ELIGIBLE_FOR_RELEASE):
            raise ValidationError(
                {"status": f"Cannot release escrow in status '{escrow_hold.status}'."}
            )

        with transaction.atomic():
            escrow_hold.status = EscrowStatus.RELEASED
            escrow_hold.released_at = timezone.now()
            escrow_hold.release_reference = reference or f"ESCROW_REL_{escrow_hold.id.hex[:8].upper()}"
            escrow_hold.save(update_fields=["status", "released_at", "release_reference", "updated_at"])

            # Post double-entry transfer
            ledger_service.post_escrow_release(escrow_hold, reference=escrow_hold.release_reference)

        logger.info(f"Released escrow hold {escrow_hold.id} for vendor {escrow_hold.vendor.display_name}.")
        return escrow_hold

    @classmethod
    def release_eligible_escrows(cls) -> int:
        """
        Sweeps and releases all holds that have exceeded their eligibility timestamp.
        """
        now = timezone.now()
        eligible_holds = EscrowHold.objects.filter(
            status__in=[EscrowStatus.HELD, EscrowStatus.ELIGIBLE_FOR_RELEASE],
            eligible_at__isnull=False,
            eligible_at__lte=now,
        )

        count = 0
        for hold in eligible_holds:
            try:
                cls.release_hold(hold, reference="AUTO_CRON_RELEASE")
                count += 1
            except Exception as exc:
                logger.error(f"Error auto-releasing escrow hold {hold.id}: {exc}")

        return count


escrow_service = EscrowService()
