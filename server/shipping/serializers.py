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
