"""
orders/views.py — DRF Views and ViewSets for Sprint 10: Orders & Checkout Orchestration.
"""
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cart_and_pricing.services import cart as cart_service
from core.permissions import (
    IsPlatformAdmin,
    IsFinanceAdmin,
    IsPlatformOrFinanceAdmin,
    IsVendorMember,
    IsWarehouseMember,
)
from orders.models import (
    Order,
    VendorOrder,
    OrderItem,
    OrderStatus,
    VendorOrderStatus,
    OrderItemFulfilmentStatus,
    OrderStatusHistory,
    Cancellation,
    Invoice,
)
from orders.serializers import (
    PlaceOrderSerializer,
    OrderListSerializer,
    OrderDetailSerializer,
    VendorOrderSerializer,
    WarehouseOrderItemSerializer,
    OrderCancelSerializer,
    OrderItemCancelSerializer,
    InvoiceSerializer,
    OrderTrackRequestSerializer,
    OrderTrackResponseSerializer,
)
from orders.services import orchestration as orchestration_service
from warehouse.services import reservation as reservation_service


def _get_user_vendor(user):
    if not user or not user.is_authenticated:
        return None
    if hasattr(user, "vendor"):
        return user.vendor
    staff = getattr(user, "vendor_staff_roles", None)
    if staff:
        staff_row = staff.filter(is_active=True).first()
        if staff_row:
            return staff_row.vendor
    return None


# ── Place Order Orchestration Endpoint ────────────────────────────────────────

class PlaceOrderView(APIView):
    """
    POST /checkout/place-order/ — Core transactional checkout orchestration.
    Accepts Idempotency-Key header.
    Validates bag, redeems RateQuote, reserves inventory, splits into VendorOrders,
    executes payment charge, confirms order, and writes OutboxEvent.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PlaceOrderSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": {"code": "INVALID_DATA", "message": "Invalid order payload.", "field_errors": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        cart_id = data.get("cart_id")

        # Resolve Cart
        cart = None
        if cart_id:
            from cart_and_pricing.models import Cart
            cart = Cart.objects.filter(id=cart_id).first()
        if not cart:
            cart = cart_service.get_or_create_cart(request)

        idempotency_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")

        response_data = orchestration_service.place_order(
            cart=cart,
            shipping_address_data=data.get("shipping_address") or {},
            billing_address_data=data.get("billing_address") or None,
            shipping_address_id=str(data.get("shipping_address_id")) if data.get("shipping_address_id") else None,
            billing_address_id=str(data.get("billing_address_id")) if data.get("billing_address_id") else None,
            rate_quote_id=data["rate_quote_id"],
            user=request.user,
            guest_email=data.get("guest_email", "").strip(),
            guest_phone=data.get("guest_phone", "").strip(),
            payment_method=data.get("payment_method", "fake"),
            idempotency_key=idempotency_key,
            endpoint=request.path,
        )

        return Response(response_data, status=status.HTTP_201_CREATED)


# ── Customer Order ViewSet ────────────────────────────────────────────────────

class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /orders/ — Customer's own order history.
    GET /orders/{id}/ — Order detail with vendor order breakdown and status history.
    """
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Order.objects.filter(customer=self.request.user)
            .prefetch_related("vendor_orders__items", "vendor_orders__vendor", "status_history")
            .select_related("invoice")
        )

    def get_serializer_class(self):
        if self.action == "list":
            return OrderListSerializer
        return OrderDetailSerializer


# ── Order Cancellation Endpoints ──────────────────────────────────────────────

class OrderCancelView(APIView):
    """
    POST /orders/{id}/cancel/ — Customer can cancel their order if not yet shipped.
    Releases all inventory reservations and sets order/vendor_orders to cancelled.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        serializer = OrderCancelSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"error": {"code": "INVALID_DATA", "message": "Reason is required.", "field_errors": serializer.errors}}, status=status.HTTP_400_BAD_REQUEST)

        order = Order.objects.filter(id=pk, customer=request.user).first()
        if not order:
            raise NotFound("Order not found.")

        # Check if already shipped
        if order.status in [OrderStatus.SHIPPED, OrderStatus.DELIVERED]:
            raise ValidationError({"error": "Cannot cancel an order that has already shipped or been delivered."})

        if order.status == OrderStatus.CANCELLED:
            return Response({"message": "Order is already cancelled."}, status=status.HTTP_200_OK)

        reason = serializer.validated_data["reason"]
        old_status = order.status

        # Transition order and sub-orders
        order.status = OrderStatus.CANCELLED
        order.save(update_fields=["status", "updated_at"])

        for vo in order.vendor_orders.all():
            vo.status = VendorOrderStatus.CANCELLED
            vo.save(update_fields=["status", "updated_at"])
            for it in vo.items.all():
                it.fulfilment_status = OrderItemFulfilmentStatus.CANCELLED
                it.save(update_fields=["fulfilment_status", "updated_at"])

        OrderStatusHistory.objects.create(
            order=order,
            from_status=old_status,
            to_status=OrderStatus.CANCELLED,
            changed_by=request.user,
            note=f"Cancelled by customer: {reason}",
        )

        return Response({"message": "Order has been cancelled successfully.", "order_number": order.order_number}, status=status.HTTP_200_OK)


class OrderItemCancelView(APIView):
    """
    POST /orders/{id}/items/{item_id}/cancel/ — Cancel a specific line item.
    Callable by order customer or vendor member.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id, item_id):
        serializer = OrderItemCancelSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"error": {"code": "INVALID_DATA", "message": "Reason is required.", "field_errors": serializer.errors}}, status=status.HTTP_400_BAD_REQUEST)

        order_item = (
            OrderItem.objects.filter(id=item_id, vendor_order__order_id=id)
            .select_related("vendor_order__order", "vendor_order__vendor")
            .first()
        )
        if not order_item:
            raise NotFound("Order line item not found.")

        # Permission check: must be order owner or vendor owner/staff
        is_owner = order_item.vendor_order.order.customer == request.user
        vendor = _get_user_vendor(request.user)
        is_vendor = vendor and order_item.vendor_order.vendor == vendor

        if not (is_owner or is_vendor):
            raise PermissionDenied("You do not have permission to cancel this line item.")

        reason = serializer.validated_data["reason"]

        order_item.fulfilment_status = OrderItemFulfilmentStatus.CANCELLED
        order_item.save(update_fields=["fulfilment_status", "updated_at"])

        Cancellation.objects.create(
            order_item=order_item,
            reason=reason,
            cancelled_by=request.user,
        )

        return Response({"message": "Order item cancelled.", "item_id": str(order_item.id)}, status=status.HTTP_200_OK)


# ── Invoice View ──────────────────────────────────────────────────────────────

class InvoiceView(APIView):
    """
    GET /orders/{id}/invoice/ — View invoice receipt details.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        order = Order.objects.filter(id=id).select_related("invoice", "customer").first()
        if not order:
            raise NotFound("Order not found.")

        role = getattr(request.user, "role", "")
        if order.customer != request.user and role not in ["super_admin", "platform_admin", "finance_admin"]:
            raise PermissionDenied("You do not have permission to view this invoice.")

        invoice = getattr(order, "invoice", None)
        if not invoice:
            # Generate invoice on demand if missing
            invoice = Invoice.objects.create(
                order=order,
                invoice_number=Invoice.generate_invoice_number(order.order_number),
                pdf_url=f"/api/v1/orders/{order.id}/invoice/pdf/",
            )

        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_200_OK)


# ── Public Guest Order Tracking ───────────────────────────────────────────────

class OrderTrackView(APIView):
    """
    POST /orders/track/ — Public order lookup by order number and email or phone.
    Returns tracking status without leaking customer PII or financial details.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OrderTrackRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": {"code": "INVALID_DATA", "message": "Order number and email or phone required.", "field_errors": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order_number = serializer.validated_data["order_number"].strip().upper()
        contact = serializer.validated_data["email_or_phone"].strip().lower()

        order = (
            Order.objects.filter(order_number__iexact=order_number)
            .filter(
                Q(guest_email__iexact=contact)
                | Q(customer__email__iexact=contact)
                | Q(guest_phone__icontains=contact)
                | Q(customer__phone__icontains=contact)
            )
            .first()
        )

        if not order:
            return Response(
                {"error": {"code": "ORDER_NOT_FOUND", "message": "No order found matching the provided order number and contact information."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(OrderTrackResponseSerializer(order).data, status=status.HTTP_200_OK)


# ── Vendor My Orders ViewSet ──────────────────────────────────────────────────

class VendorMyOrdersViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /vendors/me/orders/ — List VendorOrders for the authenticated vendor.
    GET /vendors/me/orders/{id}/ — VendorOrder details.
    """
    permission_classes = [IsAuthenticated, IsVendorMember]
    serializer_class = VendorOrderSerializer

    def get_queryset(self):
        vendor = _get_user_vendor(self.request.user)
        if not vendor:
            return VendorOrder.objects.none()
        return (
            VendorOrder.objects.filter(vendor=vendor)
            .select_related("order", "vendor")
            .prefetch_related("items")
        )


# ── Warehouse Orders (Picking Queue) ──────────────────────────────────────────

class WarehouseOrdersViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /warehouses/{id}/orders/ — List OrderItems allocated to warehouse for picking/packing.
    """
    permission_classes = [IsAuthenticated, IsWarehouseMember]
    serializer_class = WarehouseOrderItemSerializer

    def get_queryset(self):
        warehouse_id = self.kwargs.get("warehouse_id")
        return (
            OrderItem.objects.filter(warehouse_id=warehouse_id)
            .select_related("vendor_order__order", "vendor_order__vendor", "warehouse")
            .order_by("-created_at")
        )


# ── Admin Order Management ViewSet ────────────────────────────────────────────

class AdminOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /admin/orders/ — PlatformAdmin & FinanceAdmin full orders overview.
    GET /admin/orders/{id}/ — Full order detail.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]
    serializer_class = OrderDetailSerializer

    def get_queryset(self):
        qs = (
            Order.objects.all()
            .prefetch_related("vendor_orders__items", "vendor_orders__vendor", "status_history")
            .select_related("customer", "invoice")
        )
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


# ── Sprint 14: Return Requests & Reverse Logistics Views ─────────────────────

from orders.models import ReturnRequest, ReturnShipment, ReturnStatus
from orders.serializers import (
    ReturnRequestSerializer,
    ReturnRequestCreateSerializer,
    ReturnDecisionSerializer,
    ReturnReceiveSerializer,
)
from orders.services.returns import return_service


class ReturnRequestCreateView(APIView):
    """
    POST /orders/{id}/items/{item_id}/return/ — Customer initiates an RMA return request.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id, item_id):
        serializer = ReturnRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order_item = (
            OrderItem.objects.filter(id=item_id, vendor_order__order_id=id)
            .select_related("vendor_order__order", "vendor_order__vendor")
            .first()
        )
        if not order_item:
            raise NotFound("Order item not found.")

        rma = return_service.create_return_request(
            order_item=order_item,
            user=request.user,
            reason=serializer.validated_data["reason"],
            evidence_media=serializer.validated_data.get("evidence_media"),
        )
        return Response(ReturnRequestSerializer(rma).data, status=status.HTTP_201_CREATED)


class ReturnRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /returns/ — List RMA return requests scoped to customer, vendor staff, or admin.
    GET /returns/{id}/ — Retrieve RMA return details.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ReturnRequestSerializer

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, "role", "")
        if role in ["super_admin", "platform_admin", "finance_admin"]:
            return ReturnRequest.objects.all().select_related(
                "order_item__vendor_order__order", "user", "return_shipment"
            )

        vendor = _get_user_vendor(user)
        if vendor:
            return ReturnRequest.objects.filter(
                order_item__vendor_order__vendor=vendor
            ).select_related("order_item__vendor_order__order", "user", "return_shipment")

        return ReturnRequest.objects.filter(user=user).select_related(
            "order_item__vendor_order__order", "user", "return_shipment"
        )


class ReturnDecisionView(APIView):
    """
    PATCH /returns/{id}/decision/ — Vendor approves or rejects an RMA.
    Approval creates ReturnShipment and freezes escrow.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        serializer = ReturnDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        rma = ReturnRequest.objects.filter(id=id).select_related(
            "order_item__vendor_order__vendor", "order_item__vendor_order"
        ).first()
        if not rma:
            raise NotFound("Return request not found.")

        user = request.user
        role = getattr(user, "role", "")
        if role not in ["super_admin", "platform_admin", "finance_admin"]:
            vendor = _get_user_vendor(user)
            if not vendor or rma.order_item.vendor_order.vendor != vendor:
                raise PermissionDenied("You do not have permission to decide on this return request.")

        updated_rma = return_service.decide_return(
            return_request=rma,
            decision=serializer.validated_data["decision"],
            user=user,
            rejection_reason=serializer.validated_data.get("rejection_reason", ""),
        )
        return Response(ReturnRequestSerializer(updated_rma).data, status=status.HTTP_200_OK)


class ReturnReceiveView(APIView):
    """
    POST /returns/{id}/receive/ — Warehouse receives returned package and restocks/writes off.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        serializer = ReturnReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        rma = ReturnRequest.objects.filter(id=id).select_related(
            "order_item__vendor_order__vendor", "order_item__variant"
        ).first()
        if not rma:
            raise NotFound("Return request not found.")

        warehouse = None
        wh_id = serializer.validated_data.get("warehouse_id")
        if wh_id:
            from warehouse.models import Warehouse
            warehouse = Warehouse.objects.filter(id=wh_id).first()

        updated_rma = return_service.receive_return(
            return_request=rma,
            condition=serializer.validated_data.get("condition", "restockable"),
            action=serializer.validated_data.get("action", "restock"),
            warehouse=warehouse,
            performed_by=request.user,
        )
        return Response(ReturnRequestSerializer(updated_rma).data, status=status.HTTP_200_OK)


class InstantRefundView(APIView):
    """
    POST /returns/{id}/instant-refund/ — Vendor or Finance Admin issues immediate wallet store credit refund.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        rma = ReturnRequest.objects.filter(id=id).select_related(
            "order_item__vendor_order__order", "order_item__vendor_order__vendor"
        ).first()
        if not rma:
            raise NotFound("Return request not found.")

        user = request.user
        role = getattr(user, "role", "")
        if role not in ["super_admin", "platform_admin", "finance_admin"]:
            vendor = _get_user_vendor(user)
            if not vendor or rma.order_item.vendor_order.vendor != vendor:
                raise PermissionDenied("You do not have permission to issue instant refund for this return.")

        from payments.services.refund_service import refund_service
        from payments.serializers import RefundSerializer

        refund = refund_service.process_instant_refund(
            return_request=rma,
            performed_by=user,
        )
        return Response(RefundSerializer(refund).data, status=status.HTTP_200_OK)

