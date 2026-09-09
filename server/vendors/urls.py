"""
vendors/urls.py — Sprint 3 + Sprint 4 vendor URL patterns.
Mounted at /api/v1/ in config/api_router.py as:
  path("vendors/", include("vendors.urls"))
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from vendors.views import (
    VendorApplicationView,
    VendorMeViewSet,
    VendorStorefrontView,
    VendorStaffViewSet,
    VendorBankAccountViewSet,
    VendorDocumentViewSet,
    VendorPolicyView,
    AdminVendorViewSet,
    AdminVendorStatusUpdateView,
    AdminVendorDocumentReviewView,
    AdminCommissionRuleViewSet,
)

# ── Vendor-facing routes (/api/v1/vendors/) ───────────────────────────────────
urlpatterns = [
    # Public
    path("apply/",                   VendorApplicationView.as_view(),  name="vendor-apply"),
    path("<slug:slug>/storefront/",  VendorStorefrontView.as_view(),   name="vendor-storefront"),

    # Authenticated vendor owner/staff
    path(
        "me/",
        VendorMeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "put": "update"}),
        name="vendor-me",
    ),
    path(
        "me/staff/",
        VendorStaffViewSet.as_view({"get": "list", "post": "create"}),
        name="vendor-staff-list",
    ),
    path(
        "me/staff/<uuid:pk>/",
        VendorStaffViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}),
        name="vendor-staff-detail",
    ),
    path(
        "me/bank-accounts/",
        VendorBankAccountViewSet.as_view({"get": "list", "post": "create"}),
        name="vendor-bank-list",
    ),
    path(
        "me/bank-accounts/<uuid:pk>/",
        VendorBankAccountViewSet.as_view({"get": "retrieve", "delete": "destroy"}),
        name="vendor-bank-detail",
    ),
    path(
        "me/documents/",
        VendorDocumentViewSet.as_view({"get": "list", "post": "create"}),
        name="vendor-document-list",
    ),
    path(
        "me/policy/",
        VendorPolicyView.as_view(),
        name="vendor-policy",
    ),
    # Sprint 4 — Vendor products (lazy include to avoid circular imports)
    path("me/products/", include("catalog.urls_vendor")),
    # Sprint 10 — Vendor orders
    path("", include("orders.urls_vendor")),
]

# ── Admin vendor routes (injected under /api/v1/admin/) ───────────────────────
admin_urlpatterns = [
    path(
        "vendors/",
        AdminVendorViewSet.as_view({"get": "list"}),
        name="admin-vendor-list",
    ),
    path(
        "vendors/<uuid:pk>/",
        AdminVendorViewSet.as_view({"get": "retrieve"}),
        name="admin-vendor-detail",
    ),
    path(
        "vendors/<uuid:pk>/status/",
        AdminVendorStatusUpdateView.as_view(),
        name="admin-vendor-status",
    ),
    path(
        "vendors/<uuid:vid>/documents/<uuid:pk>/review/",
        AdminVendorDocumentReviewView.as_view(),
        name="admin-vendor-document-review",
    ),
    path(
        "commission-rules/",
        AdminCommissionRuleViewSet.as_view({"get": "list", "post": "create"}),
        name="admin-commission-list",
    ),
    path(
        "commission-rules/<uuid:pk>/",
        AdminCommissionRuleViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="admin-commission-detail",
    ),
]
