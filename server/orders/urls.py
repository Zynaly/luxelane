"""
orders/urls.py — Routing for Orders, Checkout Place-Order, Vendor Orders, Warehouse Queue, and Admin Orders.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from orders.views import (
    PlaceOrderView,
    OrderViewSet,
    OrderCancelView,
    OrderItemCancelView,
    InvoiceView,
    OrderTrackView,
    VendorMyOrdersViewSet,
    WarehouseOrdersViewSet,
    AdminOrderViewSet,
    ReturnRequestCreateView,
    ReturnRequestViewSet,
    ReturnDecisionView,
    ReturnReceiveView,
    InstantRefundView,
)

# ── Customer Orders Patterns (/orders/...) ────────────────────────────────────
customer_order_router = DefaultRouter()
customer_order_router.register(r"", OrderViewSet, basename="order")

order_urlpatterns = [
    path("track/", OrderTrackView.as_view(), name="order-track"),
    path("<uuid:pk>/cancel/", OrderCancelView.as_view(), name="order-cancel"),
    path("<uuid:id>/items/<uuid:item_id>/cancel/", OrderItemCancelView.as_view(), name="order-item-cancel"),
    path("<uuid:id>/items/<uuid:item_id>/return/", ReturnRequestCreateView.as_view(), name="order-item-return"),
    path("<uuid:id>/invoice/", InvoiceView.as_view(), name="order-invoice"),
    path("", include(customer_order_router.urls)),
]

# ── Reverse Logistics / Returns Patterns (/returns/...) ───────────────────────
returns_router = DefaultRouter()
returns_router.register(r"", ReturnRequestViewSet, basename="return-request")

returns_urlpatterns = [
    path("<uuid:id>/decision/", ReturnDecisionView.as_view(), name="return-decision"),
    path("<uuid:id>/receive/", ReturnReceiveView.as_view(), name="return-receive"),
    path("<uuid:id>/instant-refund/", InstantRefundView.as_view(), name="return-instant-refund"),
    path("", include(returns_router.urls)),
]

# ── Checkout Orchestration (/checkout/place-order/) ───────────────────────────
checkout_order_urlpatterns = [
    path("place-order/", PlaceOrderView.as_view(), name="checkout-place-order"),
]

# ── Vendor Portal Orders (/vendors/me/orders/...) ─────────────────────────────
vendor_order_urlpatterns = [
    path("me/orders/", VendorMyOrdersViewSet.as_view({"get": "list"}), name="vendor-my-orders-list"),
    path("me/orders/<uuid:pk>/", VendorMyOrdersViewSet.as_view({"get": "retrieve"}), name="vendor-my-orders-detail"),
]

# ── Warehouse Allocation Queue (/warehouses/{warehouse_id}/orders/) ───────────
warehouse_order_urlpatterns = [
    path("<uuid:warehouse_id>/orders/", WarehouseOrdersViewSet.as_view({"get": "list"}), name="warehouse-orders-queue"),
]

# ── Platform Admin Orders (/admin/orders/...) ─────────────────────────────────
admin_order_router = DefaultRouter()
admin_order_router.register(r"orders", AdminOrderViewSet, basename="admin-order")
orders_admin_urls = admin_order_router.urls

# Default urlpatterns
urlpatterns = [
    path("", include(order_urlpatterns)),
]
