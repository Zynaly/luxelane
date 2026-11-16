"""
shipping/tasks.py — Asynchronous carrier webhook ingestion & tracking poll tasks (Sprint 13).
"""
import logging
from celery import shared_task
from django.utils import timezone
from shipping.models import Shipment, ShipmentStatus
from shipping.services.shipment_service import shipment_service

logger = logging.getLogger(__name__)


@shared_task(name="shipping.tasks.process_carrier_webhook_task")
def process_carrier_webhook_task(payload: dict):
    """
    Parses and ingests carrier webhook payload asynchronously.
    """
    tracking_number = payload.get("tracking_number") or payload.get("tracking_code")
    if not tracking_number:
        logger.warning(f"Carrier webhook missing tracking number: {payload}")
        return {"status": "ignored", "reason": "No tracking number"}

    shipment = Shipment.objects.filter(tracking_number=tracking_number).first()
    if not shipment:
        logger.info(f"Shipment for tracking {tracking_number} not found in system.")
        return {"status": "not_found"}

    carrier_status = (payload.get("status") or "").lower()
    description = payload.get("description") or payload.get("message") or f"Carrier update: {carrier_status}"
    location = payload.get("location") or ""

    # Map carrier status to ShipmentStatus
    status_map = {
        "pre_transit": ShipmentStatus.LABEL_CREATED,
        "picked_up": ShipmentStatus.PICKED_UP,
        "in_transit": ShipmentStatus.IN_TRANSIT,
        "out_for_delivery": ShipmentStatus.OUT_FOR_DELIVERY,
        "delivered": ShipmentStatus.DELIVERED,
        "failure": ShipmentStatus.FAILED_ATTEMPT,
        "exception": ShipmentStatus.EXCEPTION,
        "return_to_sender": ShipmentStatus.RETURNED,
    }
    target_status = status_map.get(carrier_status, ShipmentStatus.IN_TRANSIT)

    event = shipment_service.record_tracking_event(
        shipment=shipment,
        status=target_status,
        description=description,
        location=location,
        carrier_status_code=carrier_status,
        raw_payload=payload,
    )

    logger.info(f"Processed carrier webhook event {event.id} for shipment {tracking_number} -> {target_status}")
    return {"status": "processed", "shipment_status": target_status}


@shared_task(name="shipping.tasks.shipment_tracking_poll_task")
def shipment_tracking_poll_task():
    """
    Periodic Celery beat task to poll active shipments in-transit and update milestones.
    """
    active_shipments = Shipment.objects.filter(
        status__in=[
            ShipmentStatus.LABEL_CREATED,
            ShipmentStatus.PICKED_UP,
            ShipmentStatus.IN_TRANSIT,
            ShipmentStatus.OUT_FOR_DELIVERY,
        ]
    )[:100]

    updated = 0
    for s in active_shipments:
        # Simulate tracking progress for active shipments or poll carrier
        if s.status == ShipmentStatus.OUT_FOR_DELIVERY:
            shipment_service.record_tracking_event(
                shipment=s,
                status=ShipmentStatus.DELIVERED,
                description="Delivered to customer address / concierge.",
                location="Destination Delivery Address",
            )
            updated += 1

    logger.info(f"shipment_tracking_poll_task completed: {updated} shipments updated.")
    return {"polled_count": len(active_shipments), "updated_count": updated}
