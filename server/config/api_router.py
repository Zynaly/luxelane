"""
API v1 router — include each app's urls as sprints are completed.
"""
from django.urls import path, include
from vendors.urls import admin_urlpatterns as vendor_admin_urls
from catalog.urls import (
    category_urlpatterns,
    brand_urlpatterns,
    product_urlpatterns,
    wishlist_urlpatterns,
    admin_urlpatterns as catalog_admin_urls,
)

# Merge all admin sub-patterns into a single list to avoid multiple path("admin/") conflicts
combined_admin_urls = vendor_admin_urls + catalog_admin_urls

urlpatterns = [
    # Sprint 0 — no domain endpoints (health is at root level)

    # Sprint 1 — Identity & RBAC
    path("auth/",  include("accounts.urls.auth")),
    path("users/", include("accounts.urls.users")),
    path("admin/", include("accounts.urls.admin")),

    # Sprint 2 — Addresses / Notifications / Media
    path("addresses/", include("accounts.urls.addresses")),
    path("notifications/", include("notifications.urls")),
    path("media/", include("core.urls.media")),

    # Sprint 3 — Vendors
    path("vendors/", include("vendors.urls")),

    # Sprint 4 & 5 — Catalog (public endpoints)
    path("categories/", include((category_urlpatterns, "categories"))),
    path("brands/", include((brand_urlpatterns, "brands"))),
    path("products/", include((product_urlpatterns, "products"))),
    path("wishlist/", include((wishlist_urlpatterns, "wishlist"))),

    # All admin sub-patterns (Sprint 3 + Sprint 4/5) merged under a single admin/ prefix
    path("admin/", include((combined_admin_urls, "admin-api"))),
]
