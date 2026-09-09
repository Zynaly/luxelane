"""
cart_and_pricing/urls.py — Routing for Cart, Coupons, Tax Quotes, and Admin Coupons.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from cart_and_pricing.views import (
    CartView,
    CartItemViewSet,
    CartMergeView,
    CartApplyCouponView,
    CartRemoveCouponView,
    CartSummaryView,
    CartValidateView,
    CouponViewSet,
    CouponValidateView,
    AdminCouponViewSet,
    TaxQuoteView,
)

# ── Cart URL Patterns ─────────────────────────────────────────────────────────
cart_urlpatterns = [
    path("", CartView.as_view(), name="cart-detail"),
    path("items/", CartItemViewSet.as_view({"post": "create"}), name="cart-item-add"),
    path("items/<uuid:pk>/", CartItemViewSet.as_view({"patch": "partial_update", "delete": "destroy"}), name="cart-item-detail"),
    path("merge/", CartMergeView.as_view(), name="cart-merge"),
    path("apply-coupon/", CartApplyCouponView.as_view(), name="cart-apply-coupon"),
    path("remove-coupon/", CartRemoveCouponView.as_view(), name="cart-remove-coupon"),
    path("summary/", CartSummaryView.as_view(), name="cart-summary"),
    path("validate/", CartValidateView.as_view(), name="cart-validate"),
]

# ── Public Coupon URL Patterns ────────────────────────────────────────────────
coupon_router = DefaultRouter()
coupon_router.register(r"", CouponViewSet, basename="coupon")

coupon_urlpatterns = [
    path("validate/", CouponValidateView.as_view(), name="coupon-validate"),
    path("", include(coupon_router.urls)),
]

# ── Checkout Tax Quote URL Patterns ───────────────────────────────────────────
tax_urlpatterns = [
    path("tax-quote/", TaxQuoteView.as_view(), name="checkout-tax-quote"),
]

# ── Admin Coupon URL Patterns ─────────────────────────────────────────────────
admin_coupon_router = DefaultRouter()
admin_coupon_router.register(r"coupons", AdminCouponViewSet, basename="admin-coupon")
cart_admin_urls = admin_coupon_router.urls
