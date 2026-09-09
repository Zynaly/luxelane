from django.contrib import admin
from warehouse.models import (
    Warehouse, WarehouseStaff, Inventory, StockMovement,
    StockTransfer, StockTransferItem, PurchaseOrder, PurchaseOrderItem,
)


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ("name", "vendor", "service_radius_km", "sla_hours", "is_active")
    list_filter = ("is_active", "vendor")
    search_fields = ("name",)


@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ("warehouse", "variant", "on_hand", "reserved_cache", "available")
    list_filter = ("warehouse",)
    search_fields = ("variant__sku", "warehouse__name")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("inventory", "quantity_delta", "movement_type", "performed_by", "created_at")
    list_filter = ("movement_type", "created_at")
    readonly_fields = ("id", "created_at", "inventory", "quantity_delta", "movement_type", "reason", "reference_id", "performed_by")


@admin.register(StockTransfer)
class StockTransferAdmin(admin.ModelAdmin):
    list_display = ("id", "from_warehouse", "to_warehouse", "status", "created_at")
    list_filter = ("status",)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("id", "warehouse", "supplier_name", "status", "created_at")
    list_filter = ("status", "warehouse")
