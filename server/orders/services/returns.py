"""
orders/services/returns.py — Reverse logistics service for return requests (RMA),
approval decisions, escrow freezing, label generation, and warehouse return receiving (Sprint 14).
"""
import uuid
from datetime import timedelta
from typing import List, Optional, Dict, Any
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from orders.models import (
    OrderItem,
    OrderItemFulfilmentStatus,
    ReturnRequest,
    ReturnStatus,
    ReturnShipment,
)
from payments.models import EscrowHold, EscrowStatus
from warehouse.models import Warehouse, Inventory
from warehouse.services.stock import restock


class ReturnService:
    @classmethod
    def create_return_request(
        cls,
        order_item: OrderItem,
        user,
        reason: str,
        evidence_media: Optional[List[str]] = None,
    ) -> ReturnRequest:
        """
        Validates customer ownership and return policy window, then creates an RMA ReturnRequest.
        """
        if not reason:
            raise ValidationError({"reason": "Return reason is required."})

        # Validate customer ownership
        order = order_item.vendor_order.order
        if order.customer != user:
            raise ValidationError({"order_item": "You can only request returns for items in your own orders."})

        # Validate delivered fulfillment status
        if order_item.fulfilment_status not in (OrderItemFulfilmentStatus.DELIVERED, OrderItemFulfilmentStatus.SHIPPED):
            raise ValidationError(
                {"order_item": f"Cannot return an item in fulfillment status '{order_item.fulfilment_status}'. Item must be delivered."}
            )

        # Validate active duplicate returns
        existing_rma = ReturnRequest.objects.filter(
            order_item=order_item,
            status__in=[ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.ITEM_RECEIVED],
        ).first()
        if existing_rma:
            raise ValidationError({"order_item": f"An active return request already exists for this item (RMA: {existing_rma.id})."})

        # Validate VendorPolicy.return_window_days
        vendor = order_item.vendor_order.vendor
        policy = getattr(vendor, "policies", None)
        return_window_days = getattr(policy, "return_window_days", 30) if policy else 30

        # Reference delivery timestamp from order_item or latest shipment
        delivered_date = order_item.updated_at
        latest_shipment_item = order_item.shipment_items.select_related("shipment").first()
        if latest_shipment_item and latest_shipment_item.shipment.delivered_at:
            delivered_date = latest_shipment_item.shipment.delivered_at

        if timezone.now() - delivered_date > timedelta(days=return_window_days):
            raise ValidationError(
                {"order_item": f"The return window of {return_window_days} days for this vendor has expired."}
            )

        with transaction.atomic():
            rma = ReturnRequest.objects.create(
                order_item=order_item,
                user=user,
                reason=reason,
                evidence_media=evidence_media or [],
                status=ReturnStatus.REQUESTED,
            )
            order_item.fulfilment_status = OrderItemFulfilmentStatus.RETURN_REQUESTED
            order_item.save(update_fields=["fulfilment_status", "updated_at"])

        return rma

    @classmethod
    def decide_return(
        cls,
        return_request: ReturnRequest,
        decision: str,
        user = None,
        rejection_reason: str = "",
    ) -> ReturnRequest:
        """
        Processes vendor approval or rejection.
        Approval generates a return shipment label and freezes escrow on the VendorOrder.
        """
        if return_request.status != ReturnStatus.REQUESTED:
            raise ValidationError(
                {"status": f"Cannot decide on return request in status '{return_request.status}'. Only 'requested' can be decided."}
            )

        decision = decision.lower().strip()
        if decision not in ("approve", "reject"):
            raise ValidationError({"decision": "Decision must be either 'approve' or 'reject'."})

        with transaction.atomic():
            if decision == "approve":
                return_request.status = ReturnStatus.APPROVED
                return_request.save(update_fields=["status", "updated_at"])

                # Generate return parcel shipment & label
                trk_number = f"RET{uuid.uuid4().hex[:10].upper()}"
                ReturnShipment.objects.create(
                    return_request=return_request,
                    tracking_number=trk_number,
                    tracking_url=f"https://track.luxelane.com/{trk_number}",
                    label_url=f"https://api.luxelane.com/media/labels/return_{uuid.uuid4().hex[:12]}.pdf",
                )

                # Freeze vendor escrow hold
                vo = return_request.order_item.vendor_order
                hold = getattr(vo, "escrow_hold", None)
                if hold:
                    hold.frozen_by_rma = return_request
                    hold.status = EscrowStatus.DISPUTED
                    hold.save(update_fields=["frozen_by_rma", "status", "updated_at"])

            elif decision == "reject":
                return_request.status = ReturnStatus.REJECTED
                return_request.rejection_reason = rejection_reason or "Return rejected by vendor."
                return_request.closed_at = timezone.now()
                return_request.save(update_fields=["status", "rejection_reason", "closed_at", "updated_at"])

                # Revert order item fulfillment status
                order_item = return_request.order_item
                order_item.fulfilment_status = OrderItemFulfilmentStatus.DELIVERED
                order_item.save(update_fields=["fulfilment_status", "updated_at"])

        return return_request

    @classmethod
    def receive_return(
        cls,
        return_request: ReturnRequest,
        condition: str = "restockable",
        action: str = "restock",
        warehouse: Optional[Warehouse] = None,
        performed_by = None,
    ) -> ReturnRequest:
        """
        Processes physical parcel receipt at warehouse.
        Restocks inventory if condition is restockable.
        """
        if return_request.status not in (ReturnStatus.APPROVED, ReturnStatus.ITEM_RECEIVED):
            raise ValidationError(
                {"status": f"Cannot receive return in status '{return_request.status}'. Return must be 'approved'."}
            )

        with transaction.atomic():
            order_item = return_request.order_item
            order_item.fulfilment_status = OrderItemFulfilmentStatus.RETURNED
            order_item.save(update_fields=["fulfilment_status", "updated_at"])

            if action == "restock" and condition == "restockable":
                wh = warehouse or order_item.warehouse or Warehouse.objects.filter(is_active=True).first()
                if wh:
                    inv = Inventory.objects.filter(warehouse=wh, variant=order_item.variant).first()
                    if inv:
                        restock(
                            inventory=inv,
                            quantity=order_item.quantity,
                            reason=f"Return restock for RMA {return_request.id}",
                            reference_id=return_request.id,
                            performed_by=performed_by,
                        )

                return_request.status = ReturnStatus.RESTOCKED
            else:
                return_request.status = ReturnStatus.WRITTEN_OFF

            return_request.closed_at = timezone.now()
            return_request.save(update_fields=["status", "closed_at", "updated_at"])

        return return_request


return_service = ReturnService()
