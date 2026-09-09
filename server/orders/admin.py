"""
orders/admin.py — Django Admin registration for Sprint 10 orders models.
"""
from django.contrib import admin
from orders.models import (
    Order,
    VendorOrder,
    OrderItem,
    OrderStatusHistory,
    Cancellation,
    Invoice,
    IdempotencyKey,
    OutboxEvent,
)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    fields = ["variant", "warehouse", "quantity", "unit_price", "line_subtotal", "fulfilment_status"]
    readonly_fields = ["line_subtotal"]


class VendorOrderInline(admin.StackedInline):
    model = VendorOrder
    extra = 0
    fields = ["vendor", "status", "subtotal", "shipping_amount", "commission_amount", "vendor_net_amount"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_number", "customer", "is_guest_order", "status", "grand_total", "placed_at"]
    list_filter = ["status", "is_guest_order", "placed_at"]
    search_fields = ["order_number", "customer__email", "guest_email"]
    inlines = [VendorOrderInline]


@admin.register(VendorOrder)
class VendorOrderAdmin(admin.ModelAdmin):
    list_display = ["id", "order", "vendor", "status", "subtotal", "commission_amount", "vendor_net_amount"]
    list_filter = ["status", "vendor"]
    search_fields = ["order__order_number", "vendor__display_name"]
    inlines = [OrderItemInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ["id", "vendor_order", "variant_sku_snapshot", "quantity", "unit_price", "fulfilment_status", "warehouse"]
    list_filter = ["fulfilment_status", "warehouse"]
    search_fields = ["variant_sku_snapshot", "product_title_snapshot"]


@admin.register(OrderStatusHistory)
class OrderStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ["order", "vendor_order", "from_status", "to_status", "changed_by", "created_at"]
    list_filter = ["to_status"]
    search_fields = ["order__order_number"]


@admin.register(Cancellation)
class CancellationAdmin(admin.ModelAdmin):
    list_display = ["order_item", "cancelled_by", "created_at", "refund_reference"]
    search_fields = ["order_item__variant_sku_snapshot", "reason"]


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ["invoice_number", "order", "created_at"]
    search_fields = ["invoice_number", "order__order_number"]


@admin.register(IdempotencyKey)
class IdempotencyKeyAdmin(admin.ModelAdmin):
    list_display = ["key", "user", "endpoint", "status_code", "created_at", "expires_at"]
    search_fields = ["key", "endpoint"]


@admin.register(OutboxEvent)
class OutboxEventAdmin(admin.ModelAdmin):
    list_display = ["event_type", "status", "retry_count", "published_at", "created_at"]
    list_filter = ["status", "event_type"]
    search_fields = ["event_type"]
