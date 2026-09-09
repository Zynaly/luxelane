from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart_and_pricing.services import cart as cart_service
from core.permissions import IsPlatformAdmin, IsVendorMember
from shipping.models import (
    Carrier,
    CarrierCredential,
    ShippingZone,
    ShippingRateCard,
    RateQuote,
    Shipment,
    ShipmentStatus,
    ShipmentTrackingEvent,
)
from shipping.serializers import (
    CarrierSerializer,
    AdminCarrierCredentialSerializer,
    ShippingZoneSerializer,
    ShippingRateCardSerializer,
    RateQuoteRequestSerializer,
    RateQuoteResponseSerializer,
    ShipmentSerializer,
    ShipmentCreateSerializer,
    ShipmentTrackingEventSerializer,
    CarrierWebhookSerializer,
)
from shipping.services import rates as rates_service
from shipping.services.shipment_service import shipment_service
from shipping.tasks import process_carrier_webhook_task
from orders.models import Order, VendorOrder
from warehouse.models import Warehouse


# ── Public Carrier Directory ──────────────────────────────────────────────────

class CarrierViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /shipping/carriers/ — List active shipping carriers (Public).
    GET /shipping/carriers/{id}/ — Carrier details.
    """
    queryset = Carrier.objects.filter(is_active=True)
    serializer_class = CarrierSerializer
    permission_classes = [AllowAny]


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


# ── Admin & Vendor Carrier Credentials ────────────────────────────────────────

class AdminCarrierCredentialViewSet(viewsets.ModelViewSet):
    """
    CRUD /admin/shipping/carrier-credentials/ — Manage API credentials.
    PlatformAdmin manages all (including master); VendorMember manages their own vendor's credentials.
    """
    serializer_class = AdminCarrierCredentialSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return CarrierCredential.objects.none()

        role = getattr(user, "role", "")
        if role in ["super_admin", "platform_admin"]:
            return CarrierCredential.objects.all().select_related("carrier", "vendor")

        vendor = _get_user_vendor(user)
        if vendor:
            return CarrierCredential.objects.filter(vendor=vendor).select_related("carrier", "vendor")

        return CarrierCredential.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        role = getattr(user, "role", "")
        if role not in ["super_admin", "platform_admin"]:
            vendor = _get_user_vendor(user)
            if vendor:
                serializer.save(vendor=vendor)
                return
        serializer.save()


# ── Shipping Zones ────────────────────────────────────────────────────────────

class ShippingZoneViewSet(viewsets.ModelViewSet):
    """
    GET /shipping/zones/ — Public or Authenticated read list of zones.
    POST/PUT/DELETE /shipping/zones/ — PlatformAdmin only.
    """
    queryset = ShippingZone.objects.all()
    serializer_class = ShippingZoneSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [AllowAny()]
        return [IsPlatformAdmin()]


# ── Shipping Rate Cards ───────────────────────────────────────────────────────

class ShippingRateCardViewSet(viewsets.ModelViewSet):
    """
    CRUD /shipping/rate-cards/ — Configure flat-rate rules.
    VendorMember manages own vendor's cards; PlatformAdmin manages platform-wide (vendor=None) & all.
    """
    serializer_class = ShippingRateCardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return ShippingRateCard.objects.none()

        role = getattr(user, "role", "")
        if role in ["super_admin", "platform_admin"]:
            qs = ShippingRateCard.objects.all().select_related("zone", "vendor")
            vendor_id = self.request.query_params.get("vendor_id")
            if vendor_id:
                qs = qs.filter(vendor_id=vendor_id)
            return qs

        vendor = _get_user_vendor(user)
        if vendor:
            from django.db.models import Q
            return ShippingRateCard.objects.filter(
                Q(vendor=vendor) | Q(vendor__isnull=True)
            ).select_related("zone", "vendor")

        return ShippingRateCard.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        role = getattr(user, "role", "")
        if role not in ["super_admin", "platform_admin"]:
            vendor = _get_user_vendor(user)
            if vendor:
                serializer.save(vendor=vendor)
                return
        serializer.save()


# ── Checkout Rates (Fan-out Engine) ───────────────────────────────────────────

class CheckoutRatesView(APIView):
    """
    POST /checkout/rates/ — Live multi-carrier rate quotation.
    Fans out to carrier adapters with a 2-second timeout and falls back to configured rate cards.
    Persists returned options as RateQuote records with 24-hour TTL.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RateQuoteRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"error": {"code": "INVALID_DATA", "message": "Invalid rate request.", "field_errors": serializer.errors}}, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        cart_id = data.get("cart_id")

        # Resolve Cart
        cart = None
        if cart_id:
            from cart_and_pricing.models import Cart
            cart = Cart.objects.filter(id=cart_id).first()

        if not cart:
            cart = cart_service.get_or_create_cart(request)

        # Resolve Destination
        destination = {}
        shipping_address_id = data.get("shipping_address_id")
        if shipping_address_id:
            addr = Address.objects.filter(id=shipping_address_id).first()
            if addr:
                destination = addr

        if not destination:
            destination = {
                "country": data.get("country") or "US",
                "state": data.get("state") or "",
                "city": data.get("city") or "",
                "postal_code": data.get("postal_code") or "",
                "line1": data.get("line1") or "",
            }

        # Fan-out through rates service
        quotes = rates_service.get_quotes(
            cart_or_items=cart,
            destination=destination,
            cart_or_order_ref=cart.id if cart else None,
        )

        response_serializer = RateQuoteResponseSerializer(quotes, many=True)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


# ── Sprint 13 Views: Shipments, Packages, Labels & Tracking ──────────────────

class ShipmentViewSet(viewsets.ModelViewSet):
    """
    CRUD /shipping/shipments/ — Manage shipments.
    Supports list, retrieve, and create (with reservation consumption).
    """
    serializer_class = ShipmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Shipment.objects.none()

        role = getattr(user, "role", "")
        if role in ["super_admin", "platform_admin"]:
            return Shipment.objects.all().select_related(
                "order", "vendor_order", "carrier", "warehouse"
            ).prefetch_related("packages", "items", "tracking_events")

        vendor = _get_user_vendor(user)
        if vendor:
            return Shipment.objects.filter(vendor_order__vendor=vendor).select_related(
                "order", "vendor_order", "carrier", "warehouse"
            ).prefetch_related("packages", "items", "tracking_events")

        # Customer viewing own order shipments
        return Shipment.objects.filter(order__customer=user).select_related(
            "order", "vendor_order", "carrier", "warehouse"
        ).prefetch_related("packages", "items", "tracking_events")

    def create(self, request, *args, **kwargs):
        serializer = ShipmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        order_id = data["order_id"]
        order = Order.objects.filter(id=order_id).first()
        if not order:
            return Response(
                {"error": {"code": "NOT_FOUND", "message": "Order not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        vendor_order = None
        vo_id = data.get("vendor_order_id")
        if vo_id:
            vendor_order = VendorOrder.objects.filter(id=vo_id).first()
            if not vendor_order:
                return Response(
                    {"error": {"code": "NOT_FOUND", "message": "VendorOrder not found."}},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Authorization check for vendor
        user = request.user
        role = getattr(user, "role", "")
        if role not in ["super_admin", "platform_admin"]:
            vendor = _get_user_vendor(user)
            if vendor_order and vendor_order.vendor != vendor:
                return Response(
                    {"error": {"code": "FORBIDDEN", "message": "Not authorized to ship this vendor order."}},
                    status=status.HTTP_403_FORBIDDEN,
                )

        warehouse = None
        wh_id = data.get("warehouse_id")
        if wh_id:
            warehouse = Warehouse.objects.filter(id=wh_id).first()

        carrier = None
        carrier_id = data.get("carrier_id")
        if carrier_id:
            carrier = Carrier.objects.filter(id=carrier_id).first()

        rate_quote = None
        rq_id = data.get("rate_quote_id")
        if rq_id:
            rate_quote = RateQuote.objects.filter(id=rq_id).first()

        shipment = shipment_service.create_shipment(
            order=order,
            vendor_order=vendor_order,
            warehouse=warehouse,
            carrier=carrier,
            items_data=data.get("items"),
            packages_data=data.get("packages"),
            rate_quote=rate_quote,
            tracking_number=data.get("tracking_number", ""),
            tracking_url=data.get("tracking_url", ""),
            is_self_shipped=data.get("is_self_shipped", False),
        )

        out_serializer = ShipmentSerializer(shipment)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)


class VendorMyShipmentsViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /shipping/vendor/me/shipments/ — Vendor shipment dashboard list/detail.
    """
    serializer_class = ShipmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        vendor = _get_user_vendor(user)
        if not vendor:
            return Shipment.objects.none()
        return Shipment.objects.filter(vendor_order__vendor=vendor).select_related(
            "order", "vendor_order", "carrier", "warehouse"
        ).prefetch_related("packages", "items", "tracking_events")


class ShipmentLabelView(APIView):
    """
    POST /shipping/shipments/{id}/label/ — Purchase/regenerate digital carrier label.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        shipment = Shipment.objects.filter(id=pk).first()
        if not shipment:
            return Response({"error": {"code": "NOT_FOUND", "message": "Shipment not found."}}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        role = getattr(user, "role", "")
        if role not in ["super_admin", "platform_admin"]:
            vendor = _get_user_vendor(user)
            if shipment.vendor_order and shipment.vendor_order.vendor != vendor:
                return Response({"error": {"code": "FORBIDDEN", "message": "Not authorized for this shipment."}}, status=status.HTTP_403_FORBIDDEN)

        if not shipment.label_url:
            import uuid
            shipment.label_url = f"https://api.luxelane.com/media/labels/lbl_{uuid.uuid4().hex[:16]}.pdf"
            shipment.save(update_fields=["label_url", "updated_at"])

        return Response({
            "shipment_id": str(shipment.id),
            "label_url": shipment.label_url,
            "label_format": shipment.label_format,
            "tracking_number": shipment.tracking_number,
        }, status=status.HTTP_200_OK)


class ShipmentCancelView(APIView):
    """
    POST /shipping/shipments/{id}/cancel/ — Cancel/void pre-pickup shipment label.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        shipment = Shipment.objects.filter(id=pk).first()
        if not shipment:
            return Response({"error": {"code": "NOT_FOUND", "message": "Shipment not found."}}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        role = getattr(user, "role", "")
        if role not in ["super_admin", "platform_admin"]:
            vendor = _get_user_vendor(user)
            if shipment.vendor_order and shipment.vendor_order.vendor != vendor:
                return Response({"error": {"code": "FORBIDDEN", "message": "Not authorized for this shipment."}}, status=status.HTTP_403_FORBIDDEN)

        reason = request.data.get("reason", "")
        try:
            shipment = shipment_service.cancel_shipment(shipment, reason=reason)
            return Response(ShipmentSerializer(shipment).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": {"code": "CANCEL_FAILED", "message": str(e)}}, status=status.HTTP_400_BAD_REQUEST)


class ShipmentTrackView(APIView):
    """
    GET /shipping/track/{tracking_number}/ — Public shipment tracking timeline.
    """
    permission_classes = [AllowAny]

    def get(self, request, tracking_number):
        shipment = Shipment.objects.filter(tracking_number=tracking_number).select_related(
            "carrier", "warehouse", "order"
        ).prefetch_related("packages", "items", "tracking_events").first()

        if not shipment:
            return Response({"error": {"code": "NOT_FOUND", "message": "Tracking number not found."}}, status=status.HTTP_404_NOT_FOUND)

        events_data = ShipmentTrackingEventSerializer(shipment.tracking_events.all(), many=True).data

        return Response({
            "tracking_number": shipment.tracking_number,
            "status": shipment.status,
            "carrier": shipment.carrier.name if shipment.carrier else "Self-Shipped",
            "carrier_code": shipment.carrier.code if shipment.carrier else "vendor_self",
            "shipped_at": shipment.shipped_at,
            "delivered_at": shipment.delivered_at,
            "tracking_url": shipment.tracking_url,
            "events": events_data,
        }, status=status.HTTP_200_OK)


class CarrierWebhookView(APIView):
    """
    POST /shipping/carrier-webhook/ — Ingests carrier status push webhook.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CarrierWebhookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = serializer.validated_data
        try:
            process_carrier_webhook_task.delay(payload)
        except Exception:
            process_carrier_webhook_task(payload)

        return Response({"received": True, "tracking_number": payload["tracking_number"]}, status=status.HTTP_200_OK)

