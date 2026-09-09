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
    gateways = serializers.ListField(child=serializers.DictField(), required=False)
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


# ── Sprint 12: Ledger, Escrow, Wallet & COD Serializers ───────────────────────

from accounts.models import LedgerAccount, LedgerEntry
from payments.models import EscrowHold, CODCollection
from payments.services.ledger import ledger_service


class LedgerEntrySerializer(serializers.ModelSerializer):
    account_key = serializers.CharField(source="account.account_key", read_only=True)

    class Meta:
        model = LedgerEntry
        fields = [
            "id",
            "account",
            "account_key",
            "amount",
            "entry_group_id",
            "reference_type",
            "reference_id",
            "memo",
            "created_at",
        ]
        read_only_fields = fields


class LedgerAccountSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()

    class Meta:
        model = LedgerAccount
        fields = [
            "id",
            "account_key",
            "account_type",
            "owner_user",
            "owner_vendor_id",
            "currency",
            "balance",
            "created_at",
        ]
        read_only_fields = fields

    def get_balance(self, obj) -> str:
        return str(ledger_service.get_account_balance(obj))


class EscrowHoldSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.display_name", read_only=True)
    order_number = serializers.CharField(source="vendor_order.order.order_number", read_only=True)

    class Meta:
        model = EscrowHold
        fields = [
            "id",
            "vendor_order",
            "vendor",
            "vendor_name",
            "order_number",
            "gross_amount",
            "commission_amount",
            "net_vendor_amount",
            "currency",
            "status",
            "held_at",
            "eligible_at",
            "released_at",
            "release_reference",
            "notes",
        ]
        read_only_fields = fields


class CODCollectionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    collected_by_name = serializers.CharField(source="collected_by.get_full_name", read_only=True)

    class Meta:
        model = CODCollection
        fields = [
            "id",
            "order",
            "order_number",
            "amount",
            "currency",
            "status",
            "otp_attempts",
            "collected_at",
            "collected_by",
            "collected_by_name",
            "receipt_number",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class CODVerifyOTPSerializer(serializers.Serializer):
    otp_code = serializers.CharField(max_length=6, min_length=6, required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# ── Sprint 14: Refund Serializers ───────────────────────────────────────────

from payments.models import Refund, RefundMethod, RefundStatus


class RefundSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    processed_by_email = serializers.CharField(source="processed_by.email", read_only=True, allow_null=True)

    class Meta:
        model = Refund
        fields = [
            "id",
            "order",
            "order_number",
            "vendor_order",
            "return_request",
            "amount",
            "currency",
            "method",
            "status",
            "reason",
            "ledger_entry_group_id",
            "processed_by",
            "processed_by_email",
            "gateway_refund_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class OrderRefundCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0.01)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    method = serializers.ChoiceField(
        choices=RefundMethod.choices,
        default=RefundMethod.ORIGINAL_PAYMENT,
    )


