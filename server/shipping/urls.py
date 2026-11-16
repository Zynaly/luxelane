"""
shipping/urls.py — URLs for Carriers, Zones, Rate Cards, Credentials, Checkout Rates, Shipments, and Tracking.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from shipping.views import (
    CarrierViewSet,
    AdminCarrierCredentialViewSet,
    ShippingZoneViewSet,
    ShippingRateCardViewSet,
    CheckoutRatesView,
    ShipmentViewSet,
    VendorMyShipmentsViewSet,
    ShipmentLabelView,
    ShipmentCancelView,
    ShipmentTrackView,
    CarrierWebhookView,
)

# Public & standard shipping routers
shipping_router = DefaultRouter()
shipping_router.register(r"carriers", CarrierViewSet, basename="carrier")
shipping_router.register(r"zones", ShippingZoneViewSet, basename="shipping-zone")
shipping_router.register(r"rate-cards", ShippingRateCardViewSet, basename="shipping-rate-card")
shipping_router.register(r"shipments", ShipmentViewSet, basename="shipment")
shipping_router.register(r"vendor/me/shipments", VendorMyShipmentsViewSet, basename="vendor-my-shipment")

shipping_urlpatterns = [
    path("shipments/<uuid:pk>/label/", ShipmentLabelView.as_view(), name="shipment-label"),
    path("shipments/<uuid:pk>/cancel/", ShipmentCancelView.as_view(), name="shipment-cancel"),
    path("track/<str:tracking_number>/", ShipmentTrackView.as_view(), name="shipment-track"),
    path("carrier-webhook/", CarrierWebhookView.as_view(), name="carrier-webhook"),
    path("", include(shipping_router.urls)),
]

# Checkout rates endpoint: /checkout/rates/
checkout_shipping_urlpatterns = [
    path("rates/", CheckoutRatesView.as_view(), name="checkout-rates"),
]

# Admin carrier credentials: /admin/shipping/carrier-credentials/
admin_credential_router = DefaultRouter()
admin_credential_router.register(r"shipping/carrier-credentials", AdminCarrierCredentialViewSet, basename="admin-carrier-credential")

shipping_admin_urls = [
    path("", include(admin_credential_router.urls)),
]

# Default package urlpatterns
urlpatterns = [
    path("", include(shipping_urlpatterns)),
    path("checkout/rates/", CheckoutRatesView.as_view(), name="checkout-rates-direct"),
]

