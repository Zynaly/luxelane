"""
warehouse/services/stock.py — Core stock mutation services.
All writes to Inventory.on_hand and reserved_cache MUST pass through this module.
"""
import uuid
from django.db import transaction
from rest_framework.exceptions import ValidationError

from warehouse.models import Inventory, StockMovement, MovementType


def adjust(
    inventory: Inventory,
    quantity_delta: int,
    movement_type: str = MovementType.MANUAL_ADJUSTMENT,
    reason: str = "",
    reference_id: uuid.UUID | None = None,
    performed_by = None,
) -> StockMovement:
    """
    Adjusts stock level up or down on an Inventory record and logs a StockMovement.
    """
    if quantity_delta == 0:
        raise ValidationError({"quantity_delta": "Quantity delta cannot be zero."})

    if movement_type == MovementType.MANUAL_ADJUSTMENT and not reason.strip():
        raise ValidationError({"reason": "A reason is mandatory for manual stock adjustments."})

    with transaction.atomic():
        # Lock row for update
        locked_inventory = Inventory.objects.select_for_update().get(id=inventory.id)

        new_on_hand = locked_inventory.on_hand + quantity_delta
        if new_on_hand < 0:
            raise ValidationError(
                {"quantity_delta": f"Cannot reduce stock below 0. Current on_hand: {locked_inventory.on_hand}, requested delta: {quantity_delta}"}
            )

        locked_inventory.on_hand = new_on_hand
        locked_inventory.save(update_fields=["on_hand", "updated_at"])

        movement = StockMovement.objects.create(
            inventory=locked_inventory,
            quantity_delta=quantity_delta,
            movement_type=movement_type,
            reason=reason,
            reference_id=reference_id,
            performed_by=performed_by,
        )

    inventory.refresh_from_db()
    return movement


def consume(
    inventory: Inventory,
    quantity: int,
    reference_id: uuid.UUID | None = None,
    performed_by = None,
) -> StockMovement:
    """
    Consumes reserved stock on order fulfillment (decrements on_hand and reserved_cache).
    """
    if quantity <= 0:
        raise ValidationError({"quantity": "Consumed quantity must be positive."})

    with transaction.atomic():
        locked = Inventory.objects.select_for_update().get(id=inventory.id)
        if locked.on_hand < quantity:
            raise ValidationError({"quantity": f"Insufficient stock. Available: {locked.on_hand}, requested: {quantity}"})

        locked.on_hand -= quantity
        locked.reserved_cache = max(0, locked.reserved_cache - quantity)
        locked.save(update_fields=["on_hand", "reserved_cache", "updated_at"])

        movement = StockMovement.objects.create(
            inventory=locked,
            quantity_delta=-quantity,
            movement_type=MovementType.RESERVATION_CONSUMED,
            reason="Order fulfillment consumption",
            reference_id=reference_id,
            performed_by=performed_by,
        )

    inventory.refresh_from_db()
    return movement


def consume_reservation(
    reservation,
    performed_by = None,
) -> StockMovement:
    """
    Consumes a committed stock reservation on order fulfillment/shipment dispatch:
    Decrements Inventory.on_hand and reserved_cache, and logs StockMovement.
    """
    return consume(
        inventory=reservation.inventory,
        quantity=reservation.quantity,
        reference_id=reservation.id,
        performed_by=performed_by,
    )



def restock(
    inventory: Inventory,
    quantity: int,
    reason: str = "Return restock",
    reference_id: uuid.UUID | None = None,
    performed_by = None,
) -> StockMovement:
    """
    Restocks returned or un-shipped items back into active on_hand inventory.
    """
    if quantity <= 0:
        raise ValidationError({"quantity": "Restock quantity must be positive."})

    with transaction.atomic():
        locked = Inventory.objects.select_for_update().get(id=inventory.id)
        locked.on_hand += quantity
        locked.save(update_fields=["on_hand", "updated_at"])

        movement = StockMovement.objects.create(
            inventory=locked,
            quantity_delta=quantity,
            movement_type=MovementType.RETURN_RESTOCK,
            reason=reason,
            reference_id=reference_id,
            performed_by=performed_by,
        )

    inventory.refresh_from_db()
    return movement

