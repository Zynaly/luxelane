"""
catalog/urls_vendor.py — Vendor my-products URL patterns.
Mounted at /api/v1/vendors/me/products/ via vendors/urls.py.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from catalog.views import (
    VendorMyProductsViewSet,
    VendorProductBulkImportView,
    BulkImportStatusView,
)

router = DefaultRouter()
router.register(r"", VendorMyProductsViewSet, basename="vendor-product")

# Bulk import URLs must be listed BEFORE the router to avoid uuid conflict
urlpatterns = [
    path("bulk-import/", VendorProductBulkImportView.as_view(), name="vendor-product-bulk-import"),
    path("bulk-import/<uuid:job_id>/", BulkImportStatusView.as_view(), name="vendor-product-bulk-import-status"),
] + router.urls
