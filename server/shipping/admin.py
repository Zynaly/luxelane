"""
shipping/admin.py — Django Admin registration for Sprint 9 models.
"""
from django.contrib import admin
from shipping.models import (
    Carrier,
    CarrierCredential,
    ShippingZone,
    ShippingRateCard,
    RateQuote,
)


@admin.register(Carrier)
class CarrierAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "code"]


@admin.register(CarrierCredential)
class CarrierCredentialAdmin(admin.ModelAdmin):
    list_display = ["carrier", "vendor", "is_active", "created_at"]
    list_filter = ["is_active", "carrier"]
    search_fields = ["carrier__name", "vendor__name"]


@admin.register(ShippingZone)
class ShippingZoneAdmin(admin.ModelAdmin):
    list_display = ["name", "countries", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name"]


@admin.register(ShippingRateCard)
class ShippingRateCardAdmin(admin.ModelAdmin):
    list_display = ["zone", "service_level", "base_rate", "per_kg_rate", "vendor", "is_active"]
    list_filter = ["is_active", "service_level", "zone"]
    search_fields = ["zone__name", "vendor__name", "service_level"]


@admin.register(RateQuote)
class RateQuoteAdmin(admin.ModelAdmin):
    list_display = ["quote_id", "carrier", "service_level", "amount", "currency", "redeemed", "expires_at"]
    list_filter = ["redeemed", "carrier", "service_level"]
    search_fields = ["quote_id", "cart_or_order_ref"]
