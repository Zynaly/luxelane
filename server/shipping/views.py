"""
shipping/views.py — DRF Views and ViewSets for Sprint 9: Shipping Rates & Packing.
"""
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart_and_pricing.services import cart as cart_service
from core.permissions import IsPlatformAdmin, IsVendorMember
from shipping.models import Carrier, CarrierCredential, ShippingZone, ShippingRateCard, RateQuote
from shipping.serializers import (
    CarrierSerializer,
    AdminCarrierCredentialSerializer,
    ShippingZoneSerializer,
    ShippingRateCardSerializer,
    RateQuoteRequestSerializer,
    RateQuoteResponseSerializer,
)
from shipping.services import rates as rates_service


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
