"""
orders/urls_vendor.py — Vendor portal order routes mounted under /api/v1/vendors/.
"""
from django.urls import path
from orders.views import VendorMyOrdersViewSet

urlpatterns = [
    path("me/orders/", VendorMyOrdersViewSet.as_view({"get": "list"}), name="vendor-my-orders-list"),
    path("me/orders/<uuid:pk>/", VendorMyOrdersViewSet.as_view({"get": "retrieve"}), name="vendor-my-orders-detail"),
]
