"""
catalog/urls.py — Sprint 4 & 5: Catalog URL routing.

Public endpoints:
  /categories/
  /brands/
  /products/
  /products/search/
  /products/attributes/
  /products/{id}/related/
  /products/{product_id}/variants/
  /products/{id}/variants/generate/
  /wishlist/
  /vendors/me/products/   (via vendors/urls.py include)

Admin endpoints (registered in config/api_router.py via admin_urlpatterns):
  /admin/categories/
  /admin/brands/
  /admin/products/
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from catalog.views import (
    CategoryViewSet,
    BrandViewSet,
    ProductViewSet,
    ProductSearchView,
    ProductRelatedView,
    ProductVariantViewSet,
    ProductVariantGenerateView,
    ProductAttributeViewSet,
    WishlistViewSet,
    VendorMyProductsViewSet,
    AdminCategoryViewSet,
    AdminBrandViewSet,
    AdminProductListView,
    AdminProductModerationView,
    VendorProductBulkImportView,
    BulkImportStatusView,
    ProductReviewViewSet,
    ReviewReplyView,
    AdminReviewModerationView,
    ProductQuestionViewSet,
    ProductAnswerView,
)

# ── Category router ───────────────────────────────────────────────────────────
category_router = DefaultRouter()
category_router.register(r"", CategoryViewSet, basename="category")
category_urlpatterns = category_router.urls

# ── Brand router ──────────────────────────────────────────────────────────────
brand_router = DefaultRouter()
brand_router.register(r"", BrandViewSet, basename="brand")
brand_urlpatterns = brand_router.urls

# ── Attribute router ──────────────────────────────────────────────────────────
attribute_router = DefaultRouter()
attribute_router.register(r"", ProductAttributeViewSet, basename="product-attribute")

# ── Product router & patterns ─────────────────────────────────────────────────
product_router = DefaultRouter()
product_router.register(r"", ProductViewSet, basename="product")

product_urlpatterns = [
    # Attributes nested under products prefix
    path("attributes/", include(attribute_router.urls)),
    # Dedicated search endpoint
    path("search/", ProductSearchView.as_view(), name="product-search"),
    # Related products
    path("<uuid:id>/related/", ProductRelatedView.as_view(), name="product-related"),
    # Variant Cartesian generator
    path("<uuid:id>/variants/generate/", ProductVariantGenerateView.as_view(), name="product-variant-generate"),
    # Variants CRUD nested under product
    path("<uuid:product_id>/variants/", ProductVariantViewSet.as_view({"get": "list", "post": "create"}), name="product-variants-list"),
    path("<uuid:pid>/variants/<uuid:pk>/", ProductVariantViewSet.as_view({"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}), name="product-variant-detail"),
    # Reviews & Questions (Sprint 14)
    path("<uuid:product_id>/reviews/", ProductReviewViewSet.as_view({"get": "list", "post": "create"}), name="product-reviews-list"),
    path("<uuid:product_id>/questions/", ProductQuestionViewSet.as_view({"get": "list", "post": "create"}), name="product-questions-list"),
    path("<uuid:pid>/questions/<uuid:id>/answers/", ProductAnswerView.as_view(), name="product-question-answers"),
    # Base product router (list, retrieve, create, update, delete)
    path("", include(product_router.urls)),
]

# ── Review patterns (/reviews/...) ────────────────────────────────────────────
review_urlpatterns = [
    path("<uuid:id>/reply/", ReviewReplyView.as_view(), name="review-reply"),
]

# ── Wishlist router ───────────────────────────────────────────────────────────
wishlist_router = DefaultRouter()
wishlist_router.register(r"", WishlistViewSet, basename="wishlist")
wishlist_urlpatterns = wishlist_router.urls

# ── Vendor my-products patterns (included by vendors/urls.py) ─────────────────
vendor_product_router = DefaultRouter()
vendor_product_router.register(r"", VendorMyProductsViewSet, basename="vendor-product")

vendor_product_urlpatterns = [
    path("bulk-import/", VendorProductBulkImportView.as_view(), name="vendor-product-bulk-import"),
    path("bulk-import/<uuid:job_id>/", BulkImportStatusView.as_view(), name="vendor-product-bulk-import-status"),
] + vendor_product_router.urls

# ── Admin patterns (imported by config/api_router.py as admin_urlpatterns) ───
admin_category_router = DefaultRouter()
admin_category_router.register(r"categories", AdminCategoryViewSet, basename="admin-category")

admin_brand_router = DefaultRouter()
admin_brand_router.register(r"brands", AdminBrandViewSet, basename="admin-brand")

admin_urlpatterns = [
    *admin_category_router.urls,
    *admin_brand_router.urls,
    path("products/", AdminProductListView.as_view(), name="admin-product-list"),
    path("products/<uuid:id>/approve/", AdminProductModerationView.as_view(), {"action_type": "approve"}, name="admin-product-approve"),
    path("products/<uuid:id>/reject/", AdminProductModerationView.as_view(), {"action_type": "reject"}, name="admin-product-reject"),
    path("reviews/<uuid:id>/moderate/", AdminReviewModerationView.as_view(), name="admin-review-moderate"),
]
