"""
shipping/services/shipment_service.py — Shipment fulfillment, label generation,
stock consumption, tracking milestones, and delivery cascade (Sprint 13).
"""
import uuid
from decimal import Decimal
from typing import Optional, List, Dict, Any
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from shipping.models import (
    Carrier,
    RateQuote,
    Shipment,
    ShipmentStatus,
    ShipmentPackage,
    ShipmentItem,
    ShipmentTrackingEvent,
)
from orders.models import (
    Order,
    OrderStatus,
    VendorOrder,
    VendorOrderStatus,
    OrderItem,
    OrderItemFulfilmentStatus,
)
from warehouse.models import InventoryReservation, ReservationStatus
from warehouse.services.stock import consume, consume_reservation
from payments.services.escrow import escrow_service


class ShipmentService:
    @staticmethod
    def generate_tracking_number(carrier_code: str = "dhl") -> str:
        code = carrier_code.upper().replace("_", "")[:4]
        return f"{code}{uuid.uuid4().hex[:12].upper()}"

    @classmethod
    def create_shipment(
        cls,
        order: Order,
        vendor_order: Optional[VendorOrder] = None,
        warehouse = None,
        carrier: Optional[Carrier] = None,
        items_data: Optional[List[Dict[str, Any]]] = None,
        packages_data: Optional[List[Dict[str, Any]]] = None,
        rate_quote: Optional[RateQuote] = None,
        tracking_number: str = "",
        tracking_url: str = "",
        is_self_shipped: bool = False,
        label_url: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Shipment:
        """
        Creates a new Shipment with Packages and Items, consumes allocated inventory
        reservations, updates OrderItem and VendorOrder statuses, and records initial tracking event.
        """
        if not items_data:
            raise ValidationError({"items": "Shipment must contain at least one item."})

        # Resolve carrier if not passed directly
        if not carrier:
            if rate_quote:
                carrier = rate_quote.carrier
            else:
                carrier = Carrier.objects.filter(is_active=True).first()

        carrier_code = carrier.code if carrier else "vendor_self"
        final_tracking_number = tracking_number or cls.generate_tracking_number(carrier_code)

        if carrier and carrier.tracking_url_template and not tracking_url:
            final_tracking_url = carrier.tracking_url_template.replace("{tracking_number}", final_tracking_number)
        else:
            final_tracking_url = tracking_url or f"https://track.luxelane.com/{final_tracking_number}"

        final_label_url = label_url
        if not final_label_url and not is_self_shipped:
            final_label_url = f"https://api.luxelane.com/media/labels/lbl_{uuid.uuid4().hex[:16]}.pdf"

        with transaction.atomic():
            # If a rate quote is provided, redeem it
            if rate_quote and not rate_quote.redeemed:
                rate_quote.redeemed = True
                rate_quote.save(update_fields=["redeemed", "updated_at"])

            shipment = Shipment.objects.create(
                order=order,
                vendor_order=vendor_order,
                warehouse=warehouse,
                carrier=carrier,
                tracking_number=final_tracking_number,
                tracking_url=final_tracking_url,
                label_url=final_label_url,
                rate_quote=rate_quote,
                is_self_shipped=is_self_shipped,
                status=ShipmentStatus.LABEL_CREATED,
                metadata=metadata or {},
            )

            # Create Packages
            created_packages = []
            if packages_data:
                for idx, pkg in enumerate(packages_data, start=1):
                    p = ShipmentPackage.objects.create(
                        shipment=shipment,
                        package_sequence=pkg.get("package_sequence", idx),
                        weight_kg=Decimal(str(pkg.get("weight_kg", "0.500"))),
                        length_cm=Decimal(str(pkg["length_cm"])) if pkg.get("length_cm") else None,
                        width_cm=Decimal(str(pkg["width_cm"])) if pkg.get("width_cm") else None,
                        height_cm=Decimal(str(pkg["height_cm"])) if pkg.get("height_cm") else None,
                        tracking_number=pkg.get("tracking_number") or final_tracking_number,
                    )
                    created_packages.append(p)
            else:
                default_pkg = ShipmentPackage.objects.create(
                    shipment=shipment,
                    package_sequence=1,
                    weight_kg=Decimal("1.000"),
                    tracking_number=final_tracking_number,
                )
                created_packages.append(default_pkg)

            # Create Shipment Items & Consume Reservations
            for it in items_data:
                order_item_id = it.get("order_item_id")
                qty = it.get("quantity", 1)
                order_item = OrderItem.objects.select_for_update().get(id=order_item_id)

                ShipmentItem.objects.create(
                    shipment=shipment,
                    package=created_packages[0] if created_packages else None,
                    order_item=order_item,
                    quantity=qty,
                )

                # Consume committed inventory hold
                res = InventoryReservation.objects.filter(
                    inventory__variant=order_item.variant,
                    status=ReservationStatus.COMMITTED,
                ).first()

                if res:
                    consume_reservation(res)

                order_item.fulfilment_status = OrderItemFulfilmentStatus.SHIPPED
                order_item.save(update_fields=["fulfilment_status", "updated_at"])

            # Update VendorOrder status if all items are shipped
            if vendor_order:
                all_vo_items = vendor_order.items.all()
                if all(item.fulfilment_status in (OrderItemFulfilmentStatus.SHIPPED, OrderItemFulfilmentStatus.DELIVERED) for item in all_vo_items):
                    vendor_order.status = VendorOrderStatus.SHIPPED
                    vendor_order.save(update_fields=["status", "updated_at"])

            # Update Master Order status
            all_order_items = OrderItem.objects.filter(vendor_order__order=order)
            if all(item.fulfilment_status in (OrderItemFulfilmentStatus.SHIPPED, OrderItemFulfilmentStatus.DELIVERED) for item in all_order_items):
                order.status = OrderStatus.SHIPPED
            else:
                order.status = OrderStatus.PARTIALLY_SHIPPED
            order.save(update_fields=["status", "updated_at"])

            # Initial tracking milestone
            ShipmentTrackingEvent.objects.create(
                shipment=shipment,
                status=ShipmentStatus.LABEL_CREATED,
                description="Shipping label created; awaiting carrier pickup.",
                location=(warehouse.address.city if warehouse and getattr(warehouse, "address", None) else getattr(warehouse, "name", "Atelier Warehouse")) if warehouse else "Atelier Warehouse",
                event_timestamp=timezone.now(),
            )

        return shipment

    @classmethod
    def record_tracking_event(
        cls,
        shipment: Shipment,
        status: str,
        description: str,
        location: str = "",
        carrier_status_code: str = "",
        event_timestamp = None,
        raw_payload: Optional[Dict[str, Any]] = None,
    ) -> ShipmentTrackingEvent:
        """
        Records an append-only tracking milestone and updates shipment / order hierarchy.
        """
        ts = event_timestamp or timezone.now()

        with transaction.atomic():
            event = ShipmentTrackingEvent.objects.create(
                shipment=shipment,
                status=status,
                carrier_status_code=carrier_status_code,
                description=description,
                location=location,
                event_timestamp=ts,
                raw_payload=raw_payload or {},
            )

            shipment.status = status
            if status in (ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT) and not shipment.shipped_at:
                shipment.shipped_at = ts

            if status == ShipmentStatus.DELIVERED:
                cls.cascade_delivery(shipment, delivered_at=ts)
            else:
                shipment.save(update_fields=["status", "shipped_at", "updated_at"])

        return event

    @classmethod
    def cascade_delivery(cls, shipment: Shipment, delivered_at = None) -> None:
        """
        Cascades carrier delivered milestone:
        1. Updates Shipment delivered_at.
        2. Updates OrderItem.fulfilment_status = DELIVERED.
        3. Updates VendorOrder.status = DELIVERED.
        4. Schedules EscrowHold release (escrow_service.schedule_release).
        5. Updates master Order.status = DELIVERED (or PARTIALLY_DELIVERED).
        """
        dt = delivered_at or timezone.now()
        shipment.status = ShipmentStatus.DELIVERED
        shipment.delivered_at = dt
        shipment.save(update_fields=["status", "delivered_at", "updated_at"])

        for it in shipment.items.all():
            it.order_item.fulfilment_status = OrderItemFulfilmentStatus.DELIVERED
            it.order_item.save(update_fields=["fulfilment_status", "updated_at"])

        vo = shipment.vendor_order
        if vo:
            all_vo_items = vo.items.all()
            if all(item.fulfilment_status == OrderItemFulfilmentStatus.DELIVERED for item in all_vo_items):
                vo.status = VendorOrderStatus.DELIVERED
                vo.save(update_fields=["status", "updated_at"])
                # Schedule vendor escrow payout release
                escrow_service.schedule_release(vo, delay_days=7)

        order = shipment.order
        all_order_items = OrderItem.objects.filter(vendor_order__order=order)
        if all(item.fulfilment_status == OrderItemFulfilmentStatus.DELIVERED for item in all_order_items):
            order.status = OrderStatus.DELIVERED
        else:
            order.status = OrderStatus.PARTIALLY_DELIVERED
        order.save(update_fields=["status", "updated_at"])

    @classmethod
    def cancel_shipment(cls, shipment: Shipment, reason: str = "") -> Shipment:
        """
        Voids / cancels a pre-pickup shipment label.
        """
        if shipment.status not in (ShipmentStatus.LABEL_CREATED,):
            raise ValidationError(
                {"status": f"Cannot cancel shipment in status '{shipment.status}'. Only un-dispatched shipments can be cancelled."}
            )

        with transaction.atomic():
            shipment.status = ShipmentStatus.CANCELLED
            shipment.save(update_fields=["status", "updated_at"])

            ShipmentTrackingEvent.objects.create(
                shipment=shipment,
                status=ShipmentStatus.CANCELLED,
                description=f"Shipment label voided / cancelled. {reason}".strip(),
                event_timestamp=timezone.now(),
            )

            # Revert order item status to allocated
            for it in shipment.items.all():
                it.order_item.fulfilment_status = OrderItemFulfilmentStatus.ALLOCATED
                it.order_item.save(update_fields=["fulfilment_status", "updated_at"])

        return shipment


shipment_service = ShipmentService()
