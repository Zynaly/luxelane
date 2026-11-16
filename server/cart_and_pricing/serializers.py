"""
cart_and_pricing/serializers.py — Serializers for Cart, Items, Coupons, Pricing, and Tax Quotes.
"""
from decimal import Decimal
from rest_framework import serializers

from cart_and_pricing.models import (
    Cart,
    CartItem,
    Coupon,
    CouponUsage,
    TaxRate,
    TaxRule,
    DiscountType,
    CouponScope,
)
from cart_and_pricing.services import pricing as pricing_service
from catalog.models import ProductVariant


# ── Cart Items ────────────────────────────────────────────────────────────────

class CartItemAddSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity   = serializers.IntegerField(min_value=1, default=1)


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class CartItemSerializer(serializers.ModelSerializer):
    variant_sku    = serializers.CharField(source="variant.sku", read_only=True)
    product_title  = serializers.CharField(source="variant.product.title", read_only=True)
    product_name   = serializers.CharField(source="variant.product.title", read_only=True)
    product_id     = serializers.CharField(source="variant.product.id", read_only=True)
    product_image  = serializers.SerializerMethodField()
    unit_price     = serializers.CharField(source="price_snapshot", read_only=True)
    current_price  = serializers.CharField(source="variant.price", read_only=True)
    variant_name   = serializers.SerializerMethodField()
    line_subtotal  = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            "id", "variant", "variant_sku", "product_title", "product_name",
            "product_id", "product_image", "unit_price",
            "quantity", "price_snapshot", "current_price", "variant_name", "line_subtotal",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "price_snapshot", "created_at", "updated_at"]

    def get_line_subtotal(self, obj) -> str:
        return str(obj.line_subtotal)

    def get_product_image(self, obj) -> str | None:
        if not obj.variant:
            return None
        var_img = obj.variant.images.filter(is_deleted=False).first()
        if var_img and var_img.image_url:
            return var_img.image_url
        if obj.variant.product:
            prod_img = obj.variant.product.images.filter(is_primary=True, is_deleted=False).first()
            if not prod_img:
                prod_img = obj.variant.product.images.filter(is_deleted=False).first()
            if prod_img and prod_img.image_url:
                return prod_img.image_url
        return None

    def get_variant_name(self, obj) -> str:
        if not obj.variant:
            return ""
        attrs = [f"{a.attribute_value.attribute.name}: {a.attribute_value.value}" for a in obj.variant.variant_attributes.all()]
        return ", ".join(attrs) if attrs else (obj.variant.sku or "")


# ── Pricing Breakdown ─────────────────────────────────────────────────────────

class PriceBreakdownSerializer(serializers.Serializer):
    subtotal            = serializers.CharField()
    discount_total      = serializers.CharField()
    tax_total           = serializers.CharField()
    tax_rate_pct        = serializers.CharField()
    shipping_total      = serializers.CharField()
    grand_total         = serializers.CharField()
    currency            = serializers.CharField()
    applied_coupon_code = serializers.CharField(allow_null=True)
    item_count          = serializers.IntegerField()


# ── Coupon Serializers ────────────────────────────────────────────────────────

class CouponSerializer(serializers.ModelSerializer):
    """Public read-only coupon overview."""
    class Meta:
        model = Coupon
        fields = [
            "id", "code", "discount_type", "discount_value",
            "scope", "min_cart_value", "valid_from", "valid_to", "is_active",
        ]
        read_only_fields = fields


class AdminCouponSerializer(serializers.ModelSerializer):
    """Platform Admin full coupon CRUD serializer."""
    usage_count = serializers.IntegerField(source="usages.count", read_only=True)

    class Meta:
        model = Coupon
        fields = [
            "id", "code", "discount_type", "discount_value",
            "scope", "scope_target_id", "min_cart_value",
            "usage_limit_total", "usage_limit_per_user", "usage_count",
            "valid_from", "valid_to", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "usage_count", "created_at", "updated_at"]


class ApplyCouponSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=30)


class CouponValidateSerializer(serializers.Serializer):
    code     = serializers.CharField(max_length=30)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0.00"))


# ── Cart Serializer ───────────────────────────────────────────────────────────

class CartSerializer(serializers.ModelSerializer):
    items               = CartItemSerializer(many=True, read_only=True)
    applied_coupon_code = serializers.CharField(source="applied_coupon.code", read_only=True, allow_null=True, default=None)
    price_breakdown     = serializers.SerializerMethodField()
    subtotal            = serializers.SerializerMethodField()
    item_count          = serializers.SerializerMethodField()
    discount_amount     = serializers.SerializerMethodField()
    grand_total         = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = [
            "id", "user", "session_key", "status",
            "applied_coupon", "applied_coupon_code",
            "items", "price_breakdown",
            "subtotal", "item_count", "discount_amount", "grand_total",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_price_breakdown(self, obj) -> dict:
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        return pricing_service.calculate(obj, user=user)

    def get_subtotal(self, obj) -> str:
        bd = self.get_price_breakdown(obj)
        return str(bd.get("subtotal", "0.00"))

    def get_item_count(self, obj) -> int:
        bd = self.get_price_breakdown(obj)
        return int(bd.get("item_count", 0))

    def get_discount_amount(self, obj) -> str:
        bd = self.get_price_breakdown(obj)
        return str(bd.get("discount_total", "0.00"))

    def get_grand_total(self, obj) -> str:
        bd = self.get_price_breakdown(obj)
        return str(bd.get("grand_total", "0.00"))


# ── Cart Validation & Tax Quote Serializers ───────────────────────────────────

class CartValidateResponseSerializer(serializers.Serializer):
    is_valid = serializers.BooleanField()
    issues   = serializers.ListField(child=serializers.DictField())


class TaxQuoteRequestSerializer(serializers.Serializer):
    address_id = serializers.UUIDField(required=False, allow_null=True)
    country    = serializers.CharField(max_length=3, required=False)
    state      = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    subtotal   = serializers.DecimalField(max_digits=12, decimal_places=2)


class TaxQuoteResponseSerializer(serializers.Serializer):
    country    = serializers.CharField()
    state      = serializers.CharField()
    rate_pct   = serializers.CharField()
    tax_amount = serializers.CharField()
