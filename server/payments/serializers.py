"""
payments/serializers.py — DRF serializers for payment intents, charges, saved cards,
and admin transactions.
"""
from rest_framework import serializers
from payments.models import SavedCard, Transaction, PaymentAttempt, WebhookEvent
from orders.models import Order


class SavedCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedCard
        fields = [
            "id",
            "brand",
            "last4",
            "exp_month",
            "exp_year",
            "gateway",
            "is_default",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SaveCardCreateSerializer(serializers.Serializer):
    gateway = serializers.CharField(max_length=50, default="stripe")
    payment_method_id = serializers.CharField(max_length=255)
    brand = serializers.CharField(max_length=30, default="Visa")
    last4 = serializers.CharField(max_length=4)
    exp_month = serializers.IntegerField(min_value=1, max_value=12)
    exp_year = serializers.IntegerField(min_value=2024, max_value=2099)
    is_default = serializers.BooleanField(default=False)


class PaymentMethodsResponseSerializer(serializers.Serializer):
    available_gateways = serializers.ListField(child=serializers.CharField())
    saved_cards = SavedCardSerializer(many=True)


class StripeCreateIntentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField(required=True)


class StripeConfirmSerializer(serializers.Serializer):
    payment_intent_id = serializers.CharField(required=True, max_length=255)


class AuthorizeNetChargeSerializer(serializers.Serializer):
    order_id = serializers.UUIDField(required=True)
    opaque_data_descriptor = serializers.CharField(required=True, max_length=100)
    opaque_data_value = serializers.CharField(required=True)


class AdminTransactionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "order",
            "order_number",
            "payment_attempt",
            "gateway_transaction_id",
            "type",
            "amount",
            "currency",
            "status",
            "raw_response",
            "created_at",
        ]
        read_only_fields = fields


class WebhookEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookEvent
        fields = [
            "id",
            "source",
            "provider_event_id",
            "event_type",
            "status",
            "processed_at",
            "replay_count",
            "error_message",
            "created_at",
        ]
        read_only_fields = fields
