"""
cart_and_pricing/views.py — Cart, Items, Coupons, Pricing, and Tax endpoints.
"""
from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, mixins, generics, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError
from drf_spectacular.utils import extend_schema

from core.permissions import IsPlatformAdmin
from catalog.models import ProductVariant
from cart_and_pricing.models import Cart, CartItem, CartStatus, Coupon, TaxRate, DiscountType
from cart_and_pricing.services import cart as cart_service
from cart_and_pricing.services import pricing as pricing_service
from cart_and_pricing.serializers import (
    CartSerializer,
    CartItemSerializer,
    CartItemAddSerializer,
    CartItemUpdateSerializer,
    PriceBreakdownSerializer,
    ApplyCouponSerializer,
    CouponValidateSerializer,
    CouponSerializer,
    AdminCouponSerializer,
    CartValidateResponseSerializer,
    TaxQuoteRequestSerializer,
    TaxQuoteResponseSerializer,
)


# ── Cart Views ────────────────────────────────────────────────────────────────

@extend_schema(tags=["Cart"])
class CartView(generics.RetrieveAPIView):
    """
    GET /cart/
    Resolves or creates the active shopping cart for the current session or user.
    """
    permission_classes = [AllowAny]
    serializer_class = CartSerializer

    def get_object(self):
        return cart_service.get_or_create_cart(self.request)


@extend_schema(tags=["Cart — Items"])
class CartItemViewSet(mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    POST /cart/items/          — Add variant to cart with price snapshot
    PATCH /cart/items/{id}/    — Update quantity
    DELETE /cart/items/{id}/   — Remove item from cart
    """
    permission_classes = [AllowAny]
    serializer_class = CartItemSerializer

    def get_queryset(self):
        cart = cart_service.get_or_create_cart(self.request)
        return cart.items.all().select_related("variant", "variant__product")

    @extend_schema(request=CartItemAddSerializer, responses={200: CartSerializer})
    def create(self, request, *args, **kwargs):
        serializer = CartItemAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        cart = cart_service.get_or_create_cart(request)
        variant = get_object_or_404(ProductVariant, id=data["variant_id"], is_deleted=False)

        if not variant.is_active or not (variant.product and variant.product.is_active):
            raise ValidationError({"variant_id": "This product variant is currently inactive or unapproved."})

        item, created = CartItem.objects.get_or_create(
            cart=cart,
            variant=variant,
            defaults={
                "quantity": data["quantity"],
                "price_snapshot": variant.price,
            },
        )
        if not created:
            item.quantity += data["quantity"]
            item.save(update_fields=["quantity", "updated_at"])

        return Response(CartSerializer(cart, context={"request": request}).data, status=status.HTTP_200_OK)

    @extend_schema(request=CartItemUpdateSerializer, responses={200: CartItemSerializer})
    def partial_update(self, request, *args, **kwargs):
        item = self.get_object()
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item.quantity = serializer.validated_data["quantity"]
        item.save(update_fields=["quantity", "updated_at"])

        return Response(CartItemSerializer(item).data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Cart"])
class CartMergeView(APIView):
    """
    POST /cart/merge/
    Merges guest cart items into authenticated user cart post-login.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: CartSerializer})
    def post(self, request):
        user = request.user
        session_key = request.headers.get("X-Session-Key") or getattr(request.session, "session_key", None)

        user_cart = Cart.objects.filter(user=user, status=CartStatus.ACTIVE).first()
        if not user_cart:
            user_cart = Cart.objects.create(user=user, status=CartStatus.ACTIVE)

        if session_key:
            guest_cart = Cart.objects.filter(session_key=session_key, user=None, status=CartStatus.ACTIVE).first()
            if guest_cart:
                user_cart = cart_service.merge_carts(guest_cart, user_cart)

        return Response(CartSerializer(user_cart, context={"request": request}).data, status=status.HTTP_200_OK)


@extend_schema(tags=["Cart — Coupons"])
class CartApplyCouponView(APIView):
    """
    POST /cart/apply-coupon/
    Validates and applies a coupon code to the current shopping cart.
    """
    permission_classes = [AllowAny]

    @extend_schema(request=ApplyCouponSerializer, responses={200: CartSerializer})
    def post(self, request):
        serializer = ApplyCouponSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"].strip()

        coupon = Coupon.objects.filter(code__iexact=code, is_active=True).first()
        if not coupon:
            raise ValidationError({"code": "Coupon code not recognized or expired."})

        now = timezone.now()
        if coupon.valid_from > now or coupon.valid_to < now:
            raise ValidationError({"code": "This coupon code is not currently valid."})

        cart = cart_service.get_or_create_cart(request)
        cart.applied_coupon = coupon
        cart.save(update_fields=["applied_coupon", "updated_at"])

        return Response(CartSerializer(cart, context={"request": request}).data, status=status.HTTP_200_OK)


@extend_schema(tags=["Cart — Coupons"])
class CartRemoveCouponView(APIView):
    """
    DELETE /cart/remove-coupon/
    Detaches any applied coupon from the current cart.
    """
    permission_classes = [AllowAny]

    @extend_schema(responses={200: CartSerializer})
    def delete(self, request):
        cart = cart_service.get_or_create_cart(request)
        cart.applied_coupon = None
        cart.save(update_fields=["applied_coupon", "updated_at"])
        return Response(CartSerializer(cart, context={"request": request}).data, status=status.HTTP_200_OK)


@extend_schema(tags=["Cart — Pricing"])
class CartSummaryView(APIView):
    """
    GET /cart/summary/
    Returns price breakdown only without modifying any line items.
    """
    permission_classes = [AllowAny]

    @extend_schema(responses={200: PriceBreakdownSerializer})
    def get(self, request):
        cart = cart_service.get_or_create_cart(request)
        breakdown = pricing_service.calculate(cart, user=request.user if request.user.is_authenticated else None)
        return Response(PriceBreakdownSerializer(breakdown).data, status=status.HTTP_200_OK)


@extend_schema(tags=["Cart — Pricing"])
class CartValidateView(APIView):
    """
    GET /cart/validate/
    Pre-checkout integrity check ensuring price snapshots match active prices
    and requested quantities are available across fulfillment facilities.
    """
    permission_classes = [AllowAny]

    @extend_schema(responses={200: CartValidateResponseSerializer})
    def get(self, request):
        cart = cart_service.get_or_create_cart(request)
        result = cart_service.validate_cart(cart)
        return Response(CartValidateResponseSerializer(result).data, status=status.HTTP_200_OK)


# ── Public Coupon Views ───────────────────────────────────────────────────────

@extend_schema(tags=["Coupons"])
class CouponViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET /coupons/
    Lists publicly discoverable active promotions.
    """
    permission_classes = [AllowAny]
    serializer_class = CouponSerializer

    def get_queryset(self):
        now = timezone.now()
        return Coupon.objects.filter(is_active=True, valid_to__gte=now).order_by("-valid_from")


@extend_schema(tags=["Coupons"])
class CouponValidateView(APIView):
    """
    POST /coupons/validate/
    Previews coupon validity and expected discount value without attaching to cart.
    """
    permission_classes = [AllowAny]

    @extend_schema(request=CouponValidateSerializer)
    def post(self, request):
        serializer = CouponValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"].strip()
        subtotal = serializer.validated_data.get("subtotal", Decimal("0.00"))

        coupon = Coupon.objects.filter(code__iexact=code, is_active=True).first()
        if not coupon:
            return Response({"is_valid": False, "message": "Invalid or expired coupon."}, status=status.HTTP_200_OK)

        now = timezone.now()
        if coupon.valid_from > now or coupon.valid_to < now:
            return Response({"is_valid": False, "message": "Coupon promotion window has ended."}, status=status.HTTP_200_OK)

        if coupon.min_cart_value and subtotal < coupon.min_cart_value:
            return Response(
                {
                    "is_valid": False,
                    "message": f"Requires minimum subtotal of ${coupon.min_cart_value}.",
                    "min_cart_value": str(coupon.min_cart_value),
                },
                status=status.HTTP_200_OK,
            )

        # Estimate discount
        discount_preview = (
            (subtotal * coupon.discount_value) / Decimal("100.00")
            if coupon.discount_type == DiscountType.PERCENT
            else coupon.discount_value
        )

        return Response(
            {
                "is_valid": True,
                "code": coupon.code,
                "discount_type": coupon.discount_type,
                "discount_value": str(coupon.discount_value),
                "scope": coupon.scope,
                "estimated_discount": str(round(discount_preview, 2)),
            },
            status=status.HTTP_200_OK,
        )


# ── Platform Admin Coupon ViewSet ─────────────────────────────────────────────

@extend_schema(tags=["Admin — Coupons"])
class AdminCouponViewSet(viewsets.ModelViewSet):
    """
    Full administrative CRUD for promotional coupons.
    """
    permission_classes = [IsPlatformAdmin]
    serializer_class = AdminCouponSerializer
    queryset = Coupon.objects.all().order_by("-created_at")
    filterset_fields = ["discount_type", "scope", "is_active"]
    search_fields = ["code"]


# ── Tax Quote View ────────────────────────────────────────────────────────────

@extend_schema(tags=["Checkout — Tax"])
class TaxQuoteView(APIView):
    """
    POST /checkout/tax-quote/
    Calculates estimated sales tax or VAT based on destination jurisdiction.
    """
    permission_classes = [AllowAny]

    @extend_schema(request=TaxQuoteRequestSerializer, responses={200: TaxQuoteResponseSerializer})
    def post(self, request):
        serializer = TaxQuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        country = data.get("country", "")
        state = data.get("state", "")
        subtotal = data["subtotal"]

        if data.get("address_id"):
            try:
                from accounts.models import Address
                addr = Address.objects.filter(id=data["address_id"]).first()
                if addr:
                    country = addr.country
                    state = getattr(addr, "state", "") or ""
            except Exception:
                pass

        matched_rate = TaxRate.objects.filter(country__iexact=country, state__iexact=state, is_deleted=False).first()
        if not matched_rate:
            matched_rate = TaxRate.objects.filter(country__iexact=country, state="", is_deleted=False).first()

        rate_pct = matched_rate.rate_pct if matched_rate else Decimal("0.00")
        tax_amount = round((subtotal * rate_pct) / Decimal("100.00"), 2)

        return Response(
            {
                "country": country,
                "state": state,
                "rate_pct": str(rate_pct),
                "tax_amount": str(tax_amount),
            },
            status=status.HTTP_200_OK,
        )
