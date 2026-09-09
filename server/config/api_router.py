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
from warehouse.urls import (
    warehouse_urlpatterns,
    inventory_urlpatterns,
    stock_movement_urlpatterns,
    stock_transfer_urlpatterns,
    purchase_order_urlpatterns,
    warehouse_admin_urls,
)
from cart_and_pricing.urls import (
    cart_urlpatterns,
    coupon_urlpatterns,
    tax_urlpatterns,
    cart_admin_urls,
)

# Merge all admin sub-patterns into a single list to avoid multiple path("admin/") conflicts
combined_admin_urls = vendor_admin_urls + catalog_admin_urls + warehouse_admin_urls + cart_admin_urls


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

    # Sprint 6 & 7 — Warehouse & Inventory Core
    path("warehouses/", include((warehouse_urlpatterns, "warehouses"))),
    path("inventory/", include((inventory_urlpatterns, "inventory"))),
    path("stock-movements/", include((stock_movement_urlpatterns, "stock-movements"))),
    path("stock-transfers/", include((stock_transfer_urlpatterns, "stock-transfers"))),
    path("purchase-orders/", include((purchase_order_urlpatterns, "purchase-orders"))),

    # Sprint 8 — Cart, Pricing & Promotions
    path("cart/", include((cart_urlpatterns, "cart"))),
    path("coupons/", include((coupon_urlpatterns, "coupons"))),
    path("checkout/", include((tax_urlpatterns, "checkout"))),

    # All admin sub-patterns merged under a single admin/ prefix
    path("admin/", include((combined_admin_urls, "admin-api"))),
]

