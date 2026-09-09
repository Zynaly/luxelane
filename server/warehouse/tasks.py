"""
warehouse/tasks.py — Celery periodic tasks for inventory operations.
"""
from celery import shared_task
from warehouse.services.reservation import sweep_expired_reservations


@shared_task(name="warehouse.sweep_expired_reservations")
def sweep_expired_reservations_task() -> str:
    """
    Periodic Celery task (run every 60s via Celery Beat) to release
    expired HELD reservations and restore reserved_cache.
    """
    swept_count = sweep_expired_reservations()
    return f"Swept {swept_count} expired inventory reservations."
