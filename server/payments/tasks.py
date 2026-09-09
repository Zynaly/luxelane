"""
payments/tasks.py — Asynchronous Celery tasks for webhook processing & event pipelines.
"""
import logging
from django.utils import timezone
from django.db import transaction
from config.celery_app import app as celery_app
from payments.models import (
    WebhookEvent,
    WebhookStatus,
    PaymentAttempt,
    PaymentAttemptStatus,
    Transaction,
    TransactionType,
    TransactionStatus,
    PaymentGateway,
)
from orders.services.orchestration import confirm_order_payment

logger = logging.getLogger(__name__)


@celery_app.task(name="payments.process_webhook_event", bind=True, max_retries=3)
def process_webhook_event(self, event_id: str):
    """
    Asynchronously processes a raw WebhookEvent payload.
    Deduplicates on provider_event_id and executes order confirmation / hold commits.
    """
    event = WebhookEvent.objects.filter(id=event_id).first()
    if not event:
        logger.error(f"WebhookEvent {event_id} not found.")
        return

    if event.status == WebhookStatus.PROCESSED:
        logger.info(f"WebhookEvent {event.provider_event_id} has already been processed.")
        return

    try:
        payload = event.raw_payload or {}
        source = event.source

        if source == "stripe":
            event_type = payload.get("type", event.event_type)
            data_obj = payload.get("data", {}).get("object", {})

            if event_type in ("payment_intent.succeeded", "charge.succeeded"):
                pi_id = data_obj.get("id") if event_type == "payment_intent.succeeded" else data_obj.get("payment_intent")
                if not pi_id and data_obj.get("id", "").startswith("ch_"):
                    pi_id = data_obj.get("id")

                if pi_id:
                    attempt = (
                        PaymentAttempt.objects.filter(gateway_attempt_id=pi_id, gateway=PaymentGateway.STRIPE)
                        .select_related("order")
                        .first()
                    )

                    if attempt:
                        with transaction.atomic():
                            attempt.status = PaymentAttemptStatus.SUCCEEDED
                            attempt.save(update_fields=["status", "updated_at"])

                            # Record transaction if not exists
                            if not Transaction.objects.filter(gateway_transaction_id=pi_id).exists():
                                Transaction.objects.create(
                                    payment_attempt=attempt,
                                    order=attempt.order,
                                    gateway_transaction_id=pi_id,
                                    type=TransactionType.CAPTURE,
                                    amount=attempt.amount,
                                    currency=attempt.currency,
                                    status=TransactionStatus.SUCCEEDED,
                                    raw_response=payload,
                                )

                            confirm_order_payment(
                                order=attempt.order,
                                gateway_transaction_id=pi_id,
                                gateway_name="stripe",
                            )

            elif event_type in ("payment_intent.payment_failed", "charge.failed"):
                pi_id = data_obj.get("id")
                if pi_id:
                    attempt = PaymentAttempt.objects.filter(gateway_attempt_id=pi_id).first()
                    if attempt:
                        attempt.status = PaymentAttemptStatus.FAILED
                        attempt.error_message = data_obj.get("last_payment_error", {}).get("message", "Payment failed")
                        attempt.save(update_fields=["status", "error_message", "updated_at"])

        elif source == "authorize_net":
            event_type = payload.get("eventType", event.event_type)
            payload_obj = payload.get("payload", {})
            trans_id = payload_obj.get("id")

            if event_type in ("net.authorize.payment.authcapture.created", "net.authorize.payment.capture.created"):
                if trans_id:
                    attempt = PaymentAttempt.objects.filter(gateway_attempt_id=trans_id).select_related("order").first()
                    if attempt:
                        with transaction.atomic():
                            attempt.status = PaymentAttemptStatus.SUCCEEDED
                            attempt.save(update_fields=["status", "updated_at"])

                            if not Transaction.objects.filter(gateway_transaction_id=trans_id).exists():
                                Transaction.objects.create(
                                    payment_attempt=attempt,
                                    order=attempt.order,
                                    gateway_transaction_id=trans_id,
                                    type=TransactionType.CAPTURE,
                                    amount=attempt.amount,
                                    currency=attempt.currency,
                                    status=TransactionStatus.SUCCEEDED,
                                    raw_response=payload,
                                )

                            confirm_order_payment(
                                order=attempt.order,
                                gateway_transaction_id=trans_id,
                                gateway_name="authorize_net",
                            )

        # Mark event as successfully processed
        event.status = WebhookStatus.PROCESSED
        event.processed_at = timezone.now()
        event.error_message = ""
        event.save(update_fields=["status", "processed_at", "error_message"])

    except Exception as exc:
        logger.exception(f"Error processing WebhookEvent {event_id}: {exc}")
        event.status = WebhookStatus.FAILED
        event.error_message = str(exc)
        event.replay_count += 1
        event.save(update_fields=["status", "error_message", "replay_count"])
        raise self.retry(exc=exc, countdown=10)
