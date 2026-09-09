"""
shipping/serializers.py — Serializers for Carriers, Credentials, Zones, Rate Cards, and Rate Quotes.
"""
from rest_framework import serializers

from shipping.models import Carrier, CarrierCredential, ShippingZone, ShippingRateCard, RateQuote
from accounts.models import Address
from cart_and_pricing.models import Cart


class CarrierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Carrier
        fields = ["id", "code", "name", "is_active", "tracking_url_template", "created_at"]
        read_only_fields = fields


class AdminCarrierCredentialSerializer(serializers.ModelSerializer):
    carrier_name = serializers.CharField(source="carrier.name", read_only=True)
    carrier_code = serializers.CharField(source="carrier.code", read_only=True)
    vendor_name  = serializers.CharField(source="vendor.display_name", read_only=True, allow_null=True)

    class Meta:
        model = CarrierCredential
        fields = [
            "id", "carrier", "carrier_code", "carrier_name",
            "vendor", "vendor_name", "credentials_encrypted",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "carrier_code", "carrier_name", "vendor_name", "created_at", "updated_at"]
        extra_kwargs = {
            "credentials_encrypted": {"write_only": True}
        }

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["has_credentials"] = bool(instance.credentials_encrypted)
        return ret


class ShippingZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingZone
        fields = ["id", "name", "countries", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ShippingRateCardSerializer(serializers.ModelSerializer):
    zone_name   = serializers.CharField(source="zone.name", read_only=True)
    vendor_name = serializers.CharField(source="vendor.display_name", read_only=True, allow_null=True)

    class Meta:
        model = ShippingRateCard
        fields = [
            "id", "zone", "zone_name", "vendor", "vendor_name",
            "service_level", "base_rate", "per_kg_rate",
            "min_days", "max_days", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "zone_name", "vendor_name", "created_at", "updated_at"]


class RateQuoteResponseSerializer(serializers.ModelSerializer):
    carrier_code = serializers.CharField(source="carrier.code", read_only=True)
    carrier_name = serializers.CharField(source="carrier.name", read_only=True)

    class Meta:
        model = RateQuote
        fields = [
            "id", "cart_or_order_ref", "carrier_code", "carrier_name",
            "service_level", "amount", "currency", "quote_id",
            "estimated_days", "expires_at", "redeemed", "metadata",
        ]
        read_only_fields = fields


class RateQuoteRequestSerializer(serializers.Serializer):
    cart_id             = serializers.UUIDField(required=False, allow_null=True)
    shipping_address_id = serializers.UUIDField(required=False, allow_null=True)
    country             = serializers.CharField(max_length=3, required=False, default="US")
    state               = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    city                = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    postal_code         = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    line1               = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


# ── Sprint 13 Serializers: Shipments, Packages, Tracking ──────────────────────

from shipping.models import Shipment, ShipmentPackage, ShipmentItem, ShipmentTrackingEvent


class ShipmentTrackingEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipmentTrackingEvent
        fields = [
            "id",
            "status",
            "carrier_status_code",
            "description",
            "location",
            "event_timestamp",
            "raw_payload",
            "created_at",
        ]
        read_only_fields = fields


class ShipmentPackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipmentPackage
        fields = [
            "id",
            "package_sequence",
            "weight_kg",
            "length_cm",
            "width_cm",
            "height_cm",
            "tracking_number",
            "created_at",
        ]
        read_only_fields = fields


class ShipmentItemSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="order_item.variant.sku", read_only=True)
    product_name = serializers.CharField(source="order_item.variant.product.title", read_only=True)

    class Meta:
        model = ShipmentItem
        fields = [
            "id",
            "package",
            "order_item",
            "sku",
            "product_name",
            "quantity",
            "created_at",
        ]
        read_only_fields = fields


class ShipmentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    vendor_name = serializers.CharField(source="vendor_order.vendor.display_name", read_only=True, allow_null=True)
    carrier_name = serializers.CharField(source="carrier.name", read_only=True, allow_null=True)
    packages = ShipmentPackageSerializer(many=True, read_only=True)
    items = ShipmentItemSerializer(many=True, read_only=True)
    tracking_events = ShipmentTrackingEventSerializer(many=True, read_only=True)

    class Meta:
        model = Shipment
        fields = [
            "id",
            "order",
            "order_number",
            "vendor_order",
            "vendor_name",
            "warehouse",
            "carrier",
            "carrier_name",
            "tracking_number",
            "tracking_url",
            "label_url",
            "label_format",
            "rate_quote",
            "is_self_shipped",
            "status",
            "shipped_at",
            "delivered_at",
            "packages",
            "items",
            "tracking_events",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ShipmentItemInputSerializer(serializers.Serializer):
    order_item_id = serializers.UUIDField(required=True)
    quantity = serializers.IntegerField(min_value=1, default=1)


class ShipmentPackageInputSerializer(serializers.Serializer):
    package_sequence = serializers.IntegerField(default=1)
    weight_kg = serializers.DecimalField(max_digits=8, decimal_places=3, default="0.500")
    length_cm = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    width_cm = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    height_cm = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    tracking_number = serializers.CharField(max_length=128, required=False, allow_blank=True)


class ShipmentCreateSerializer(serializers.Serializer):
    order_id = serializers.UUIDField(required=True)
    vendor_order_id = serializers.UUIDField(required=False, allow_null=True)
    warehouse_id = serializers.UUIDField(required=False, allow_null=True)
    carrier_id = serializers.UUIDField(required=False, allow_null=True)
    rate_quote_id = serializers.CharField(required=False, allow_blank=True, default="")
    tracking_number = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    tracking_url = serializers.URLField(required=False, allow_blank=True, default="")
    is_self_shipped = serializers.BooleanField(default=False)
    items = ShipmentItemInputSerializer(many=True, required=True)
    packages = ShipmentPackageInputSerializer(many=True, required=False)


class CarrierWebhookSerializer(serializers.Serializer):
    tracking_number = serializers.CharField(max_length=128, required=True)
    status = serializers.CharField(max_length=64, required=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    location = serializers.CharField(required=False, allow_blank=True, default="")

