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


from shipping.models import Shipment, ShipmentPackage, ShipmentItem, ShipmentTrackingEvent


class ShipmentPackageInline(admin.TabularInline):
    model = ShipmentPackage
    extra = 0


class ShipmentItemInline(admin.TabularInline):
    model = ShipmentItem
    extra = 0


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    list_display = ["tracking_number", "order", "vendor_order", "carrier", "status", "is_self_shipped", "shipped_at", "delivered_at"]
    list_filter = ["status", "is_self_shipped", "carrier"]
    search_fields = ["tracking_number", "order__order_number"]
    inlines = [ShipmentPackageInline, ShipmentItemInline]


@admin.register(ShipmentTrackingEvent)
class ShipmentTrackingEventAdmin(admin.ModelAdmin):
    list_display = ["shipment", "status", "location", "event_timestamp", "carrier_status_code"]
    list_filter = ["status"]
    search_fields = ["shipment__tracking_number", "description", "location"]

