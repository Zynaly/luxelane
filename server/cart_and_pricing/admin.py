from django.contrib import admin
from cart_and_pricing.models import Cart, CartItem, Coupon, CouponUsage, TaxRate, TaxRule


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "session_key", "status", "applied_coupon", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["user__email", "session_key"]
    inlines = [CartItemInline]


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ["code", "discount_type", "discount_value", "scope", "is_active", "valid_from", "valid_to"]
    list_filter = ["discount_type", "scope", "is_active"]
    search_fields = ["code"]


@admin.register(CouponUsage)
class CouponUsageAdmin(admin.ModelAdmin):
    list_display = ["coupon", "user", "order_id", "created_at"]
    search_fields = ["coupon__code", "user__email"]


@admin.register(TaxRate)
class TaxRateAdmin(admin.ModelAdmin):
    list_display = ["country", "state", "rate_pct"]
    list_filter = ["country"]


@admin.register(TaxRule)
class TaxRuleAdmin(admin.ModelAdmin):
    list_display = ["category", "tax_rate"]
