"""
cart_and_pricing/models.py — Sprint 8: Cart, Pricing & Promotions models.

Models:
  - Cart: Shopping cart (guest session_key or authenticated user FK)
  - CartItem: Line items with variant reference and immutable price snapshot
  - Coupon: Scoped promotion coupons with discount rules and usage caps
  - CouponUsage: Usage audit records tracking coupon redemptions
  - TaxRate: Geolocation-based tax rates (country, state, rate_pct)
  - TaxRule: Category-specific tax rate overrides
"""
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from core.models import BaseModel


# ── Status Choices ────────────────────────────────────────────────────────────

class CartStatus(models.TextChoices):
    ACTIVE    = "active",    "Active"
    CONVERTED = "converted", "Converted"
    ABANDONED = "abandoned", "Abandoned"


class DiscountType(models.TextChoices):
    PERCENT = "percent", "Percent"
    FIXED   = "fixed",   "Fixed"


class CouponScope(models.TextChoices):
    ALL      = "all",      "All Items"
    CATEGORY = "category", "Category Target"
    PRODUCT  = "product",  "Product Target"
    VENDOR   = "vendor",   "Vendor Target"


# ── Coupon ────────────────────────────────────────────────────────────────────

class Coupon(BaseModel):
    """
    Promotional voucher supporting global or scoped discounts.
    """
    code                 = models.CharField(max_length=30, unique=True, db_index=True)
    discount_type        = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.PERCENT)
    discount_value       = models.DecimalField(max_digits=12, decimal_places=2)
    scope                = models.CharField(max_length=15, choices=CouponScope.choices, default=CouponScope.ALL)
    scope_target_id      = models.UUIDField(null=True, blank=True)
    min_cart_value       = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    usage_limit_total    = models.PositiveIntegerField(null=True, blank=True)
    usage_limit_per_user = models.PositiveIntegerField(null=True, blank=True)
    valid_from           = models.DateTimeField(db_index=True)
    valid_to             = models.DateTimeField(db_index=True)
    is_active            = models.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["code", "is_active"]),
            models.Index(fields=["valid_from", "valid_to"]),
        ]

    def __str__(self):
        val = f"{self.discount_value}%" if self.discount_type == DiscountType.PERCENT else f"${self.discount_value}"
        return f"{self.code} ({val} off)"


class CouponUsage(BaseModel):
    """
    Audit record of a coupon applied to an order or cart checkout.
    """
    coupon   = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name="usages", db_index=True)
    user     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coupon_usages", db_index=True)
    order_id = models.UUIDField(null=True, blank=True, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["coupon", "user"]),
        ]

    def __str__(self):
        return f"Usage of {self.coupon.code} by {self.user}"


# ── Cart & CartItem ───────────────────────────────────────────────────────────

class Cart(BaseModel):
    """
    Shopping cart persistent session. Supports guest sessions (via session_key)
    and authenticated users (via user FK).
    """
    user           = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="carts",
        db_index=True,
    )
    session_key    = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    status         = models.CharField(max_length=15, choices=CartStatus.choices, default=CartStatus.ACTIVE, db_index=True)
    applied_coupon = models.ForeignKey(
        Coupon,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="carts",
    )

    class Meta(BaseModel.Meta):
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["session_key", "status"]),
        ]

    def __str__(self):
        owner = self.user.email if self.user else f"Guest ({self.session_key})"
        return f"Cart {self.id} — {owner} ({self.status})"


class CartItem(BaseModel):
    """
    Item within a shopping cart. Stores a price snapshot taken at the time
    of addition to detect price drift during validation.
    """
    cart           = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items", db_index=True)
    variant        = models.ForeignKey("catalog.ProductVariant", on_delete=models.CASCADE, related_name="cart_items", db_index=True)
    quantity       = models.PositiveIntegerField(default=1)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta(BaseModel.Meta):
        unique_together = [("cart", "variant")]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.quantity}x {self.variant.sku} in Cart {self.cart_id}"

    @property
    def line_subtotal(self) -> Decimal:
        return Decimal(str(self.price_snapshot)) * self.quantity


# ── Tax ───────────────────────────────────────────────────────────────────────

class TaxRate(BaseModel):
    """
    Jurisdiction tax rate based on country and optional state/province.
    """
    country  = models.CharField(max_length=3, db_index=True)
    state    = models.CharField(max_length=50, blank=True, default="", db_index=True)
    rate_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))

    class Meta(BaseModel.Meta):
        ordering = ["country", "state"]
        unique_together = [("country", "state")]

    def __str__(self):
        loc = f"{self.state}, {self.country}" if self.state else self.country
        return f"{loc}: {self.rate_pct}%"


class TaxRule(BaseModel):
    """
    Category-specific tax rate override.
    """
    category = models.ForeignKey(
        "catalog.Category",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="tax_rules",
    )
    tax_rate = models.ForeignKey(TaxRate, on_delete=models.CASCADE, related_name="rules")

    class Meta(BaseModel.Meta):
        unique_together = [("category", "tax_rate")]

    def __str__(self):
        cat_name = self.category.name if self.category else "All Categories"
        return f"{cat_name} -> {self.tax_rate}"
