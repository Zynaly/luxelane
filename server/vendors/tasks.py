"""
vendors/tasks.py — Celery task stubs for Sprint 3.
Real implementation wired in prod; safe no-ops in dev.
"""
try:
    from config.celery_app import app as celery_app

    @celery_app.task(name="vendors.create_stripe_connect_account", bind=True, max_retries=3)
    def create_stripe_connect_account(self, vendor_id: str):
        """
        Triggered when a Vendor is approved (status → active).
        In prod: calls Stripe Connect API to create an Express account.
        In dev: logs and returns immediately.
        """
        import logging
        logger = logging.getLogger(__name__)
        logger.info(
            "[STUB] create_stripe_connect_account called for vendor_id=%s. "
            "Stripe integration wired in Sprint 11.",
            vendor_id,
        )

except Exception:
    # Celery not configured yet; define a plain callable so imports don't break
    class _StubTask:
        def delay(self, *args, **kwargs):
            pass

    create_stripe_connect_account = _StubTask()
