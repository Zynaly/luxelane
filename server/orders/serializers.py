"""
orders/serializers.py — DRF Serializers for Sprint 10: Orders & Checkout Orchestration.
"""
from rest_framework import serializers

from orders.models import (
    Order,
    VendorOrder,
    OrderItem,
    OrderStatusHistory,
    Cancellation,
    Invoice,
)


# ── Checkout Request Serializer ───────────────────────────────────────────────

class PlaceOrderSerializer(serializers.Serializer):
    cart_id             = serializers.UUIDField(required=False, allow_null=True)
    shipping_address_id = serializers.UUIDField(required=False, allow_null=True)
    billing_address_id  = serializers.UUIDField(required=False, allow_null=True)
    shipping_address    = serializers.DictField(required=False, default=dict)
    billing_address     = serializers.DictField(required=False, default=dict)
    rate_quote_id       = serializers.CharField(max_length=120, required=True)
    payment_method      = serializers.CharField(max_length=50, required=False, default="fake")
    guest_email         = serializers.EmailField(required=False, allow_blank=True, default="")
    guest_phone         = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")


# ── Line Item Serializers ─────────────────────────────────────────────────────

class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "id", "variant", "variant_sku_snapshot", "product_title_snapshot",
            "quantity", "unit_price", "line_subtotal", "fulfilment_status",
            "warehouse", "created_at",
        ]
        read_only_fields = fields


class WarehouseOrderItemSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="vendor_order.order.order_number", read_only=True)
    vendor_name  = serializers.CharField(source="vendor_order.vendor.display_name", read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            "id", "order_number", "vendor_name", "variant_sku_snapshot",
            "product_title_snapshot", "quantity", "unit_price",
            "fulfilment_status", "warehouse", "created_at",
        ]
        read_only_fields = fields


# ── Vendor Order Serializer ───────────────────────────────────────────────────

class VendorOrderSerializer(serializers.ModelSerializer):
    vendor_name  = serializers.CharField(source="vendor.display_name", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    items        = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = VendorOrder
        fields = [
            "id", "order", "order_number", "vendor", "vendor_name",
            "subtotal", "shipping_amount", "commission_amount",
            "vendor_net_amount", "commission_pct_applied", "status",
            "items", "created_at", "updated_at",
        ]
        read_only_fields = fields


# ── Status History Serializer ─────────────────────────────────────────────────

class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.get_full_name", read_only=True, default="System")

    class Meta:
        model = OrderStatusHistory
        fields = [
            "id", "from_status", "to_status", "changed_by_name",
            "note", "created_at",
        ]
        read_only_fields = fields


# ── Order Overview & Detail Serializers ───────────────────────────────────────

class OrderListSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "status", "grand_total",
            "currency", "placed_at", "item_count", "is_guest_order",
        ]
        read_only_fields = fields

    def get_item_count(self, obj) -> int:
        return sum(
            item.quantity
            for vo in obj.vendor_orders.all()
            for item in vo.items.all()
        )


class OrderDetailSerializer(serializers.ModelSerializer):
    vendor_orders  = VendorOrderSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True, default=None)
    invoice_pdf    = serializers.CharField(source="invoice.pdf_url", read_only=True, default=None)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "status", "subtotal", "discount_total",
            "shipping_total", "tax_total", "grand_total", "currency",
            "placed_at", "shipping_address_snapshot", "billing_address_snapshot",
            "is_guest_order", "guest_email", "guest_phone",
            "vendor_orders", "status_history", "invoice_number", "invoice_pdf",
        ]
        read_only_fields = fields


# ── Cancellation Serializers ──────────────────────────────────────────────────

class OrderCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=True)


class OrderItemCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=True)


# ── Invoice Serializer ────────────────────────────────────────────────────────

class InvoiceSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)

    class Meta:
        model = Invoice
        fields = ["id", "order_number", "invoice_number", "pdf_url", "created_at"]
        read_only_fields = fields


# ── Order Tracking Serializer (Public Guest Lookup) ───────────────────────────

class OrderTrackRequestSerializer(serializers.Serializer):
    order_number   = serializers.CharField(max_length=64, required=True)
    email_or_phone = serializers.CharField(max_length=100, required=True)


class OrderTrackResponseSerializer(serializers.ModelSerializer):
    item_count    = serializers.SerializerMethodField()
    status_label  = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Order
        fields = [
            "order_number", "status", "status_label", "placed_at",
            "item_count", "grand_total", "currency",
        ]
        read_only_fields = fields

    def get_item_count(self, obj) -> int:
        return sum(
            item.quantity
            for vo in obj.vendor_orders.all()
            for item in vo.items.all()
        )


# ── Sprint 14: Return Request & RMA Serializers ─────────────────────────────

from orders.models import ReturnRequest, ReturnShipment


class ReturnShipmentSerializer(serializers.ModelSerializer):
    carrier_name = serializers.CharField(source="carrier.name", read_only=True, allow_null=True)

    class Meta:
        model = ReturnShipment
        fields = [
            "id",
            "carrier",
            "carrier_name",
            "tracking_number",
            "tracking_url",
            "label_url",
            "created_at",
        ]
        read_only_fields = fields


class ReturnRequestSerializer(serializers.ModelSerializer):
    order_id = serializers.UUIDField(source="order_item.vendor_order.order.id", read_only=True)
    order_number = serializers.CharField(source="order_item.vendor_order.order.order_number", read_only=True)
    order_item_sku = serializers.CharField(source="order_item.variant_sku_snapshot", read_only=True)
    product_title = serializers.CharField(source="order_item.product_title_snapshot", read_only=True)
    quantity = serializers.IntegerField(source="order_item.quantity", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    return_shipment = ReturnShipmentSerializer(read_only=True)

    class Meta:
        model = ReturnRequest
        fields = [
            "id",
            "order_id",
            "order_number",
            "order_item",
            "order_item_sku",
            "product_title",
            "quantity",
            "user",
            "user_email",
            "reason",
            "evidence_media",
            "status",
            "rejection_reason",
            "return_shipment",
            "requested_at",
            "closed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReturnRequestCreateSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=True)
    evidence_media = serializers.ListField(
        child=serializers.URLField(),
        required=False,
        default=list,
    )


class ReturnDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"], required=True)
    rejection_reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class ReturnReceiveSerializer(serializers.Serializer):
    condition = serializers.ChoiceField(choices=["restockable", "damaged"], default="restockable")
    action = serializers.ChoiceField(choices=["restock", "write_off"], default="restock")
    warehouse_id = serializers.UUIDField(required=False, allow_null=True)

