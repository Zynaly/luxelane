"""
API v1 router — include each app's urls as sprints are completed.
Uncomment each line as the corresponding sprint is finished.
"""
from django.urls import path, include

urlpatterns = [
    # Sprint 0 — no domain endpoints (health is at root level)

    # Sprint 1 — Identity & RBAC
    path("auth/",  include("accounts.urls.auth")),
    path("users/", include("accounts.urls.users")),
    path("admin/", include("accounts.urls.admin")),

    # Sprint 2 — Addresses / Notifications
    # path("addresses/", include("accounts.urls.addresses")),
    # path("notifications/", include("notifications.urls")),
    # path("media/", include("core.urls.media")),

    # Sprint 3 — Vendors
    # path("vendors/", include("vendors.urls")),

    # Sprint 4 — Catalog
    # path("categories/", include("catalog.urls.categories")),
    # path("brands/", include("catalog.urls.brands")),
    # path("products/", include("catalog.urls.products")),

    # Sprint 5 — Variants / Search / Wishlist
    # (variants are nested under products — no new prefix)
    # path("wishlist/", include("catalog.urls.wishlist")),

    # Sprint 6 — Warehouse / Inventory
    # path("warehouses/", include("warehouse.urls")),
    # path("inventory/", include("warehouse.urls.inventory")),
    # path("stock-movements/", include("warehouse.urls.stock")),
    # path("stock-transfers/", include("warehouse.urls.transfers")),
    # path("purchase-orders/", include("warehouse.urls.purchase_orders")),

    # Sprint 8 — Cart / Pricing
    # path("cart/", include("cart_and_pricing.urls.cart")),
    # path("coupons/", include("cart_and_pricing.urls.coupons")),
    # path("checkout/", include("cart_and_pricing.urls.checkout")),

    # Sprint 9 — Shipping
    # path("shipping/", include("shipping.urls")),

    # Sprint 10 — Orders
    # path("orders/", include("orders.urls")),
    # path("checkout/", include("orders.urls.checkout")),

    # Sprint 11 — Payments
    # path("payments/", include("payments.urls")),

    # Sprint 12 — Wallet / COD / Ledger
    # path("wallet/", include("payments.urls.wallet")),

    # Sprint 13 — Shipments / Tracking
    # path("shipments/", include("shipping.urls.shipments")),

    # Sprint 14 — Returns / Refunds / Reviews
    # path("returns/", include("shipping.urls.returns")),
    # path("reviews/", include("catalog.urls.reviews")),

    # Sprint 15 — Payouts / Admin Reporting
    # (already nested under vendors/ and admin/ above)

    # Admin namespace (shared across all sprints)
    # path("admin/", include("core.urls.admin")),
]
