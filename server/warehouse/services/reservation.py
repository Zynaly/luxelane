"""
warehouse/services/reservation.py — Inventory reservation lifecycle service.

Handles concurrency-safe holds during checkout, status transitions (HELD -> COMMITTED,
HELD -> RELEASED, HELD -> EXPIRED), and automated sweeping of expired holds.
"""
import datetime
import uuid
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from warehouse.models import Inventory, InventoryReservation, ReservationStatus


def reserve(
    inventory: Inventory,
    quantity: int,
    cart_item_id: uuid.UUID | None = None,
    order_item_id: uuid.UUID | None = None,
    ttl_minutes: int = 15,
) -> InventoryReservation:
    """
    Creates a temporary reservation hold (HELD) on inventory for the given quantity.
    Increments Inventory.reserved_cache without deducting from on_hand.
    """
    if quantity <= 0:
        raise ValidationError({"quantity": "Reservation quantity must be strictly positive."})

    with transaction.atomic():
        locked_inv = Inventory.objects.select_for_update().get(id=inventory.id)

        if locked_inv.available < quantity:
            raise ValidationError(
                {
                    "quantity": (
                        f"Insufficient available stock for SKU '{locked_inv.variant.sku}'. "
                        f"Requested: {quantity}, Available: {locked_inv.available} "
                        f"(On-hand: {locked_inv.on_hand}, Reserved: {locked_inv.reserved_cache})."
                    )
                }
            )

        locked_inv.reserved_cache += quantity
        locked_inv.save(update_fields=["reserved_cache", "updated_at"])

        expires_at = timezone.now() + datetime.timedelta(minutes=ttl_minutes)
        reservation = InventoryReservation.objects.create(
            inventory=locked_inv,
            cart_item_id=cart_item_id,
            order_item_id=order_item_id,
            quantity=quantity,
            status=ReservationStatus.HELD,
            expires_at=expires_at,
        )

    inventory.refresh_from_db()
    return reservation


def commit(reservation: InventoryReservation) -> InventoryReservation:
    """
    Transitions a HELD reservation to COMMITTED upon successful payment/checkout.
    Note: The actual stock deduction (on_hand decrement) happens when the order is fulfilled.
    """
    with transaction.atomic():
        locked_res = InventoryReservation.objects.select_for_update().get(id=reservation.id)

        if locked_res.status != ReservationStatus.HELD:
            raise ValidationError(
                {"status": f"Cannot commit reservation in status '{locked_res.status}'. Only HELD reservations can be committed."}
            )

        locked_res.status = ReservationStatus.COMMITTED
        locked_res.save(update_fields=["status", "updated_at"])

    reservation.refresh_from_db()
    return reservation


def release(reservation: InventoryReservation, reason: str = "Released") -> InventoryReservation:
    """
    Releases a HELD reservation back to general availability by decrementing reserved_cache.
    Sets reservation status to RELEASED.
    """
    with transaction.atomic():
        locked_res = InventoryReservation.objects.select_for_update().get(id=reservation.id)

        if locked_res.status == ReservationStatus.HELD:
            locked_inv = Inventory.objects.select_for_update().get(id=locked_res.inventory_id)
            locked_inv.reserved_cache = max(0, locked_inv.reserved_cache - locked_res.quantity)
            locked_inv.save(update_fields=["reserved_cache", "updated_at"])

            locked_res.status = ReservationStatus.RELEASED
            locked_res.save(update_fields=["status", "updated_at"])

    reservation.refresh_from_db()
    return reservation


def sweep_expired_reservations() -> int:
    """
    Scans for expired HELD reservations, decrements reserved_cache on their inventory records,
    and transitions their status to EXPIRED.
    Returns the number of swept reservations.
    """
    expired_reservations = InventoryReservation.objects.filter(
        status=ReservationStatus.HELD,
        expires_at__lte=timezone.now(),
    )

    swept_count = 0
    for res in expired_reservations:
        with transaction.atomic():
            locked_res = (
                InventoryReservation.objects.select_for_update()
                .filter(id=res.id, status=ReservationStatus.HELD)
                .first()
            )
            if not locked_res:
                continue

            locked_inv = Inventory.objects.select_for_update().get(id=locked_res.inventory_id)
            locked_inv.reserved_cache = max(0, locked_inv.reserved_cache - locked_res.quantity)
            locked_inv.save(update_fields=["reserved_cache", "updated_at"])

            locked_res.status = ReservationStatus.EXPIRED
            locked_res.save(update_fields=["status", "updated_at"])
            swept_count += 1

    return swept_count
