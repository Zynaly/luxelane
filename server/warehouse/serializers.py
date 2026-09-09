"""
warehouse/serializers.py — Sprint 6: Warehouse & Inventory Core serializers.
"""
from rest_framework import serializers

from warehouse.models import (
    Warehouse,
    WarehouseStaff,
    Inventory,
    StockMovement,
    StockTransfer,
    StockTransferItem,
    PurchaseOrder,
    PurchaseOrderItem,
    StaffRole,
    MovementType,
    TransferStatus,
    POStatus,
)
from catalog.models import ProductVariant


# ── Warehouse ─────────────────────────────────────────────────────────────────

class WarehouseSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.display_name", read_only=True)

    class Meta:
        model = Warehouse
        fields = [
            "id", "vendor", "vendor_name", "name", "address",
            "latitude", "longitude", "service_radius_km", "sla_hours",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class WarehouseStaffSerializer(serializers.ModelSerializer):
    user_name  = serializers.CharField(source="user.get_full_name", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = WarehouseStaff
        fields = [
            "id", "warehouse", "user", "staff_role",
            "user_name", "user_email", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "warehouse", "created_at", "updated_at"]


# ── Inventory ─────────────────────────────────────────────────────────────────

class InventorySerializer(serializers.ModelSerializer):
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    variant_sku    = serializers.CharField(source="variant.sku", read_only=True)
    product_title  = serializers.CharField(source="variant.product.title", read_only=True)
    available      = serializers.IntegerField(read_only=True)

    class Meta:
        model = Inventory
        fields = [
            "id", "warehouse", "warehouse_name", "variant", "variant_sku",
            "product_title", "on_hand", "reserved_cache", "available",
            "reorder_threshold", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "on_hand", "reserved_cache", "available", "created_at", "updated_at"]


class InventoryAdjustSerializer(serializers.Serializer):
    variant_id     = serializers.UUIDField()
    warehouse_id   = serializers.UUIDField()
    quantity_delta = serializers.IntegerField()
    movement_type  = serializers.ChoiceField(choices=MovementType.choices, default=MovementType.MANUAL_ADJUSTMENT)
    reason         = serializers.CharField(required=False, allow_blank=True)


class InventoryBulkUpdateSerializer(serializers.Serializer):
    items = InventoryAdjustSerializer(many=True)


# ── Stock Movement ────────────────────────────────────────────────────────────

class StockMovementSerializer(serializers.ModelSerializer):
    variant_sku       = serializers.CharField(source="inventory.variant.sku", read_only=True)
    warehouse_name    = serializers.CharField(source="inventory.warehouse.name", read_only=True)
    performed_by_name = serializers.CharField(source="performed_by.get_full_name", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id", "inventory", "variant_sku", "warehouse_name",
            "quantity_delta", "movement_type", "reason",
            "reference_id", "performed_by", "performed_by_name", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ── Stock Transfer ────────────────────────────────────────────────────────────

class StockTransferItemSerializer(serializers.ModelSerializer):
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)

    class Meta:
        model = StockTransferItem
        fields = ["id", "variant", "variant_sku", "quantity"]
        read_only_fields = ["id"]


class StockTransferSerializer(serializers.ModelSerializer):
    items               = StockTransferItemSerializer(many=True, read_only=True)
    from_warehouse_name = serializers.CharField(source="from_warehouse.name", read_only=True)
    to_warehouse_name   = serializers.CharField(source="to_warehouse.name", read_only=True)
    requested_by_name   = serializers.CharField(source="requested_by.get_full_name", read_only=True)
    approved_by_name    = serializers.CharField(source="approved_by.get_full_name", read_only=True)

    class Meta:
        model = StockTransfer
        fields = [
            "id", "from_warehouse", "from_warehouse_name",
            "to_warehouse", "to_warehouse_name",
            "status", "requested_by", "requested_by_name",
            "approved_by", "approved_by_name",
            "notes", "items", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "requested_by", "approved_by", "created_at", "updated_at"]

    def create(self, validated_data):
        items_data = self.context["request"].data.get("items", [])
        transfer = super().create(validated_data)
        for item in items_data:
            variant_id = item.get("variant") or item.get("variant_id")
            quantity = int(item.get("quantity", 0))
            if variant_id and quantity > 0:
                StockTransferItem.objects.create(
                    transfer=transfer,
                    variant_id=variant_id,
                    quantity=quantity,
                )
        return transfer


# ── Purchase Order ────────────────────────────────────────────────────────────

class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = ["id", "variant", "variant_sku", "qty_ordered", "qty_received", "unit_cost"]
        read_only_fields = ["id"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items          = PurchaseOrderItemSerializer(many=True, read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "warehouse", "warehouse_name", "status",
            "supplier_name", "notes", "items", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        items_data = self.context["request"].data.get("items", [])
        po = super().create(validated_data)
        for item in items_data:
            variant_id = item.get("variant") or item.get("variant_id")
            qty_ordered = int(item.get("qty_ordered", 0))
            unit_cost = item.get("unit_cost", "0.00")
            if variant_id and qty_ordered > 0:
                PurchaseOrderItem.objects.create(
                    po=po,
                    variant_id=variant_id,
                    qty_ordered=qty_ordered,
                    unit_cost=unit_cost,
                )
        return po


class PurchaseOrderReceiveItemSerializer(serializers.Serializer):
    item_id      = serializers.UUIDField()
    qty_received = serializers.IntegerField(min_value=1)


class PurchaseOrderReceiveSerializer(serializers.Serializer):
    items = PurchaseOrderReceiveItemSerializer(many=True)


# ── Variant Availability ──────────────────────────────────────────────────────

class WarehouseStockAvailability(serializers.Serializer):
    warehouse_id   = serializers.CharField()
    warehouse_name = serializers.CharField()
    on_hand        = serializers.IntegerField()
    reserved       = serializers.IntegerField()
    available      = serializers.IntegerField()


class VariantAvailabilitySerializer(serializers.Serializer):
    variant_id      = serializers.CharField()
    sku             = serializers.CharField()
    total_available = serializers.IntegerField()
    by_warehouse    = WarehouseStockAvailability(many=True)
