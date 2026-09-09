"""
warehouse/urls.py — Sprint 6: Warehouse & Inventory Core URL routing.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from warehouse.views import (
    WarehouseViewSet,
    WarehouseStaffViewSet,
    WarehouseInventoryViewSet,
    InventoryAdjustView,
    InventoryBulkUpdateView,
    StockMovementViewSet,
    StockTransferViewSet,
    PurchaseOrderViewSet,
    PurchaseOrderReceiveView,
    LowStockView,
    VariantAvailabilityView,
    AllocationPreviewView,
    AdminInventoryReservationViewSet,
)


from orders.views import WarehouseOrdersViewSet


# ── Warehouse router ──────────────────────────────────────────────────────────
warehouse_router = DefaultRouter()
warehouse_router.register(r"", WarehouseViewSet, basename="warehouse")

# ── Nested sub-endpoints under /warehouses/{id}/ ──────────────────────────────
warehouse_urlpatterns = [
    path("<uuid:warehouse_id>/inventory/", WarehouseInventoryViewSet.as_view({"get": "list"}), name="warehouse-inventory-list"),
    path("<uuid:warehouse_id>/orders/", WarehouseOrdersViewSet.as_view({"get": "list"}), name="warehouse-orders-queue"),
    path("<uuid:warehouse_id>/staff/", WarehouseStaffViewSet.as_view({"get": "list", "post": "create"}), name="warehouse-staff-list"),
    path("<uuid:warehouse_id>/staff/<uuid:pk>/", WarehouseStaffViewSet.as_view({"get": "retrieve", "delete": "destroy"}), name="warehouse-staff-detail"),
    path("", include(warehouse_router.urls)),
]

# ── Inventory actions router / endpoints ──────────────────────────────────────
inventory_urlpatterns = [
    path("adjust/", InventoryAdjustView.as_view(), name="inventory-adjust"),
    path("bulk-update/", InventoryBulkUpdateView.as_view(), name="inventory-bulk-update"),
    path("low-stock/", LowStockView.as_view(), name="inventory-low-stock"),
    path("allocate/preview/", AllocationPreviewView.as_view(), name="inventory-allocate-preview"),
    path("variant/<uuid:id>/availability/", VariantAvailabilityView.as_view(), name="variant-availability"),
]


# ── Stock movement router ─────────────────────────────────────────────────────
movement_router = DefaultRouter()
movement_router.register(r"", StockMovementViewSet, basename="stock-movement")
stock_movement_urlpatterns = movement_router.urls

# ── Stock transfer router ─────────────────────────────────────────────────────
transfer_router = DefaultRouter()
transfer_router.register(r"", StockTransferViewSet, basename="stock-transfer")
stock_transfer_urlpatterns = transfer_router.urls

# ── Purchase order router ─────────────────────────────────────────────────────
po_router = DefaultRouter()
po_router.register(r"", PurchaseOrderViewSet, basename="purchase-order")
purchase_order_urlpatterns = [
    path("<uuid:id>/receive/", PurchaseOrderReceiveView.as_view(), name="purchase-order-receive"),
    path("", include(po_router.urls)),
]

# ── Admin Inventory Reservation router (Sprint 7) ─────────────────────────────
admin_reservation_router = DefaultRouter()
admin_reservation_router.register(r"inventory-reservations", AdminInventoryReservationViewSet, basename="admin-inventory-reservation")
warehouse_admin_urls = admin_reservation_router.urls

