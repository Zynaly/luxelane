"""
vendors/tasks.py — Asynchronous and periodic Celery tasks for vendor payouts (Sprint 15).
"""
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="vendors.run_payout_batch_task")
def run_payout_batch_task(vendor_id: str, period_start_str: str, period_end_str: str):
    """
    Asynchronously processes a payout batch for a specific vendor.
    """
    from vendors.models import Vendor
    from vendors.services.payouts import payout_service
    import datetime

    try:
        vendor = Vendor.objects.get(id=vendor_id)
        start_date = datetime.date.fromisoformat(period_start_str)
        end_date = datetime.date.fromisoformat(period_end_str)

        payout = payout_service.run_payout_batch(
            vendor=vendor,
            period_start=start_date,
            period_end=end_date,
        )
        return {"success": True, "payout_id": str(payout.id) if payout else None}
    except Exception as exc:
        logger.error(f"Error running payout batch task for vendor {vendor_id}: {exc}")
        return {"success": False, "error": str(exc)}


@shared_task(name="vendors.run_all_due_payouts_task")
def run_all_due_payouts_task():
    """
    Periodic Celery beat task to sweep and settle all mature vendor payouts.
    """
    from vendors.services.payouts import payout_service
    payouts = payout_service.run_all_due_payouts()
    logger.info(f"run_all_due_payouts_task completed: {len(payouts)} payouts generated.")
    return {"generated_count": len(payouts)}
