"""
catalog/views.py — Sprint 4 & 5: Catalog Core, Moderation, Variants, Attributes & Search.

Architecture:
  CategoryViewSet             : Public read / AdminCategoryViewSet for PlatformAdmin
  BrandViewSet                : Public read / AdminBrandViewSet for PlatformAdmin
  ProductViewSet              : Public approved list/detail; IsVendorMember write
  ProductSearchView           : Full-text search + django-filter + 60s Redis cached facets
  ProductRelatedView          : Public recommendations in same category
  VendorMyProductsViewSet     : IsVendorMember — all statuses, own vendor
  ProductVariantViewSet       : Nested /products/{product_id}/variants/
  ProductVariantGenerateView  : POST /products/{id}/variants/generate/ (Cartesian matrix)
  ProductAttributeViewSet     : Public read / PlatformAdmin write
  WishlistViewSet             : IsAuthenticated owner wishlist CRUD
  AdminProductListView        : IsPlatformAdmin — all products
  AdminProductModerationView  : IsPlatformAdmin — approve/reject
  VendorProductBulkImportView : IsVendorMember — CSV bulk import
  BulkImportStatusView        : IsVendorMember — poll import status
"""
import hashlib
import json
import uuid
from decimal import Decimal
from django.db.models import Count, Min, Max, Q
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, generics, mixins, viewsets, filters
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from drf_spectacular.utils import extend_schema, OpenApiParameter

from core.permissions import IsVendorMember, IsPlatformAdmin
from core.models import AuditLog
from catalog.models import (
    Category, Brand, Product, ProductImage, ProductTag,
    BulkImportJob, BulkImportJobStatus, ProductStatus,
    ProductAttribute, ProductAttributeValue,
    ProductVariant, ProductVariantAttribute,
    Wishlist,
)
from catalog.serializers import (
    CategorySerializer, AdminCategorySerializer,
    BrandSerializer, AdminBrandSerializer,
    ProductListSerializer, ProductDetailSerializer, ProductWriteSerializer,
    AdminProductListSerializer, AdminProductModerationSerializer,
    BulkImportJobSerializer,
    ProductAttributeSerializer, ProductAttributeValueSerializer,
    ProductVariantSerializer, ProductVariantGenerateSerializer,
    WishlistSerializer,
)
from catalog.services.variants import generate_variant_matrix
from vendors.models import Vendor, VendorStaff


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_vendor_for_user(user) -> Vendor:
    """Resolve Vendor from vendor_owner or vendor_staff membership."""
    if user.role == "vendor_owner":
        return get_object_or_404(Vendor, owner_user=user, is_deleted=False)
    staff = get_object_or_404(VendorStaff, user=user, is_active=True, is_deleted=False)
    return staff.vendor


def _get_cached_or_compute(cache_key: str, timeout: int, compute_func):
    """Safely retrieves from Django cache with fallback if cache backend is unavailable."""
    try:
        from django.core.cache import cache
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        result = compute_func()
        cache.set(cache_key, result, timeout=timeout)
        return result
    except Exception:
        return compute_func()


# ── Category Views ────────────────────────────────────────────────────────────

@extend_schema(tags=["Catalog — Categories"])
class CategoryViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """GET /categories/ — returns root categories with recursive children."""
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "slug"]

    def get_queryset(self):
        return (
            Category.objects.root_nodes()
            .filter(is_deleted=False, is_active=True)
            .prefetch_related("children")
        )


@extend_schema(tags=["Admin — Categories"])
class AdminCategoryViewSet(viewsets.ModelViewSet):
    """CRUD /admin/categories/ — IsPlatformAdmin."""
    serializer_class = AdminCategorySerializer
    permission_classes = [IsPlatformAdmin]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["name", "slug"]
    filterset_fields = ["is_active", "parent"]

    def get_queryset(self):
        return Category.objects.filter(is_deleted=False).order_by("tree_id", "lft")


# ── Brand Views ───────────────────────────────────────────────────────────────

@extend_schema(tags=["Catalog — Brands"])
class BrandViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """GET /brands/ — public read."""
    serializer_class = BrandSerializer
    permission_classes = [AllowAny]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "slug"]

    def get_queryset(self):
        return Brand.objects.filter(is_deleted=False)


@extend_schema(tags=["Admin — Brands"])
class AdminBrandViewSet(viewsets.ModelViewSet):
    """CRUD /admin/brands/ — IsPlatformAdmin."""
    serializer_class = AdminBrandSerializer
    permission_classes = [IsPlatformAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "slug"]

    def get_queryset(self):
        return Brand.objects.filter(is_deleted=False)


# ── Product Views (Public) ────────────────────────────────────────────────────

@extend_schema(tags=["Catalog — Products"])
class ProductViewSet(viewsets.ModelViewSet):
    """
    Public:
      GET /products/       — approved + active products only
      GET /products/{id}/  — approved + active product detail
    Authenticated Vendor:
      POST   /products/         — create (status forced to pending_review)
      PUT/PATCH /products/{id}/ — update own product
      DELETE /products/{id}/    — soft delete own product
    """
    filter_backends = [filters.SearchFilter, DjangoFilterBackend, filters.OrderingFilter]
    search_fields = ["title", "description", "tags__tag"]
    filterset_fields = ["category", "brand", "vendor"]
    ordering_fields = ["base_price", "rating_avg", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        if self.action in ("list", "retrieve") and not (
            self.request.user and self.request.user.is_authenticated
            and getattr(self.request.user, "role", None) in ("vendor_owner", "vendor_staff")
        ):
            return (
                Product.objects.filter(
                    status=ProductStatus.APPROVED,
                    is_active=True,
                    is_deleted=False,
                )
                .select_related("vendor", "category", "brand")
                .prefetch_related("images", "tags", "variants", "variants__variant_attributes__attribute_value__attribute")
            )
        return (
            Product.objects.filter(is_deleted=False)
            .select_related("vendor", "category", "brand")
            .prefetch_related("images", "tags", "variants", "variants__variant_attributes__attribute_value__attribute")
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductWriteSerializer
        if self.action == "retrieve":
            return ProductDetailSerializer
        return ProductListSerializer

    def list(self, request, *args, **kwargs):
        view = ProductSearchView()
        view.request = request
        view.args = args
        view.kwargs = kwargs
        view.format_kwarg = self.format_kwarg
        return view.list(request, *args, **kwargs)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsVendorMember()]
        return [AllowAny()]

    def perform_create(self, serializer):
        vendor = _get_vendor_for_user(self.request.user)
        serializer.save(vendor=vendor)

    def perform_update(self, serializer):
        product = self.get_object()
        vendor = _get_vendor_for_user(self.request.user)
        if product.vendor_id != vendor.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only edit your own products.")
        serializer.save()

    def perform_destroy(self, instance):
        vendor = _get_vendor_for_user(self.request.user)
        if instance.vendor_id != vendor.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only delete your own products.")
        instance.soft_delete()


# ── Product Search & Faceted Discovery (Sprint 5) ─────────────────────────────

@extend_schema(tags=["Catalog — Products"])
class ProductSearchView(generics.ListAPIView):
    """
    GET /products/ (with search, filtering, and Redis-cached facets)
    Query params:
      q, category, brand, vendor, price_min, price_max, rating_min, attribute_value
    """
    serializer_class = ProductListSerializer
    permission_classes = [AllowAny]
    ordering_fields = ["base_price", "rating_avg", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = (
            Product.objects.filter(
                status=ProductStatus.APPROVED,
                is_active=True,
                is_deleted=False,
            )
            .select_related("vendor", "category", "brand")
            .prefetch_related("images")
        )

        params = self.request.query_params

        # Full-text / keyword search
        q = params.get("q") or params.get("search")
        if q:
            q_clean = q.strip()
            qs = qs.filter(
                Q(title__icontains=q_clean) |
                Q(description__icontains=q_clean) |
                Q(tags__tag__icontains=q_clean) |
                Q(brand__name__icontains=q_clean) |
                Q(category__name__icontains=q_clean)
            ).distinct()

        # Taxonomy filters
        category = params.get("category")
        if category:
            qs = qs.filter(Q(category__id=category) | Q(category__slug=category))

        brand = params.get("brand")
        if brand:
            qs = qs.filter(Q(brand__id=brand) | Q(brand__slug=brand))

        vendor = params.get("vendor")
        if vendor:
            qs = qs.filter(Q(vendor__id=vendor) | Q(vendor__slug=vendor))

        # Price range
        price_min = params.get("price_min")
        if price_min:
            try:
                qs = qs.filter(base_price__gte=Decimal(price_min))
            except Exception:
                pass

        price_max = params.get("price_max")
        if price_max:
            try:
                qs = qs.filter(base_price__lte=Decimal(price_max))
            except Exception:
                pass

        # Rating filter
        rating_min = params.get("rating_min")
        if rating_min:
            try:
                qs = qs.filter(rating_avg__gte=Decimal(rating_min))
            except Exception:
                pass

        # Variant attribute filter
        attribute_value = params.get("attribute_value")
        if attribute_value:
            qs = qs.filter(variants__variant_attributes__attribute_value_id=attribute_value).distinct()

        # Ordering
        sort = params.get("ordering") or params.get("sort")
        if sort:
            sort_map = {
                "price_asc": "base_price",
                "price_desc": "-base_price",
                "rating": "-rating_avg",
                "newest": "-created_at",
            }
            order_field = sort_map.get(sort, sort)
            qs = qs.order_by(order_field)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        # Build facet cache key
        query_str = json.dumps(dict(request.query_params), sort_keys=True)
        cache_hash = hashlib.md5(query_str.encode("utf-8")).hexdigest()
        facet_cache_key = f"catalog:facets:{cache_hash}"

        def compute_facets():
            base_qs = queryset
            # Categories with counts
            category_counts = list(
                base_qs.values("category__id", "category__name", "category__slug")
                .annotate(count=Count("id"))
                .order_by("-count")[:15]
            )
            # Brands with counts
            brand_counts = list(
                base_qs.exclude(brand=None)
                .values("brand__id", "brand__name", "brand__slug")
                .annotate(count=Count("id"))
                .order_by("-count")[:15]
            )
            # Price bounds
            price_agg = base_qs.aggregate(min_price=Min("base_price"), max_price=Max("base_price"))
            return {
                "categories": [
                    {"id": str(c["category__id"]), "name": c["category__name"], "slug": c["category__slug"], "count": c["count"]}
                    for c in category_counts if c["category__id"]
                ],
                "brands": [
                    {"id": str(b["brand__id"]), "name": b["brand__name"], "slug": b["brand__slug"], "count": b["count"]}
                    for b in brand_counts if b["brand__id"]
                ],
                "price_range": {
                    "min": float(price_agg["min_price"]) if price_agg["min_price"] is not None else 0.0,
                    "max": float(price_agg["max_price"]) if price_agg["max_price"] is not None else 0.0,
                },
                "total_results": base_qs.count(),
            }

        facets = _get_cached_or_compute(facet_cache_key, timeout=60, compute_func=compute_facets)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            res = self.get_paginated_response(serializer.data)
            res.data["facets"] = facets
            return res

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            "count": len(serializer.data),
            "results": serializer.data,
            "facets": facets,
        })


# ── Product Related Recommendations (Sprint 5) ────────────────────────────────

@extend_schema(tags=["Catalog — Products"])
class ProductRelatedView(generics.ListAPIView):
    """
    GET /products/{id}/related/
    Returns approved products in the same category, excluding self, ordered by rating.
    """
    serializer_class = ProductListSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        product_id = self.kwargs.get("id")
        product = get_object_or_404(Product, Q(id=product_id) | Q(slug=product_id), is_deleted=False)
        return (
            Product.objects.filter(
                category=product.category,
                status=ProductStatus.APPROVED,
                is_active=True,
                is_deleted=False,
            )
            .exclude(id=product.id)
            .select_related("vendor", "category", "brand")
            .prefetch_related("images")
            .order_by("-rating_avg", "-created_at")[:8]
        )


# ── Vendor My Products ────────────────────────────────────────────────────────

@extend_schema(tags=["Vendor — Products"])
class VendorMyProductsViewSet(viewsets.ModelViewSet):
    """
    GET/POST /vendors/me/products/
    GET/PUT/PATCH/DELETE /vendors/me/products/{id}/
    Includes ALL statuses for the authenticated vendor's merchandise.
    """
    permission_classes = [IsAuthenticated, IsVendorMember]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend, filters.OrderingFilter]
    search_fields = ["title", "slug"]
    filterset_fields = ["status", "category", "brand", "is_active"]
    ordering_fields = ["base_price", "created_at", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        vendor = _get_vendor_for_user(self.request.user)
        return (
            Product.objects.filter(vendor=vendor, is_deleted=False)
            .select_related("category", "brand")
            .prefetch_related("images", "tags", "variants", "variants__variant_attributes__attribute_value__attribute")
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductWriteSerializer
        if self.action == "retrieve":
            return ProductDetailSerializer
        return ProductListSerializer

    def perform_create(self, serializer):
        vendor = _get_vendor_for_user(self.request.user)
        serializer.save(vendor=vendor)


# ── Product Variants ViewSet (Sprint 5) ────────────────────────────────────────

@extend_schema(tags=["Catalog — Variants"])
class ProductVariantViewSet(viewsets.ModelViewSet):
    """
    CRUD variants nested under a product:
      GET /products/{product_id}/variants/       — list variants
      POST /products/{product_id}/variants/      — create variant (vendor owner)
      GET /products/{pid}/variants/{id}/         — retrieve variant
      PATCH /products/{pid}/variants/{id}/       — update variant (vendor owner)
      DELETE /products/{pid}/variants/{id}/      — delete variant (vendor owner)
    """
    serializer_class = ProductVariantSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsVendorMember()]
        return [AllowAny()]

    def get_queryset(self):
        product_id = self.kwargs.get("product_id") or self.kwargs.get("pid")
        qs = ProductVariant.objects.filter(is_deleted=False).select_related("product")
        if product_id:
            qs = qs.filter(Q(product__id=product_id) | Q(product__slug=product_id))
        return qs.prefetch_related("variant_attributes__attribute_value__attribute", "images")

    def perform_create(self, serializer):
        product_id = self.kwargs.get("product_id") or self.kwargs.get("pid")
        product = get_object_or_404(Product, Q(id=product_id) | Q(slug=product_id), is_deleted=False)
        vendor = _get_vendor_for_user(self.request.user)
        if product.vendor_id != vendor.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only add variants to your own products.")
        serializer.save(product=product)

    def perform_update(self, serializer):
        variant = self.get_object()
        vendor = _get_vendor_for_user(self.request.user)
        if variant.product.vendor_id != vendor.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only modify variants of your own products.")
        serializer.save()

    def perform_destroy(self, instance):
        vendor = _get_vendor_for_user(self.request.user)
        if instance.product.vendor_id != vendor.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only delete variants of your own products.")
        instance.soft_delete()


# ── Product Variant Generator View (Sprint 5) ──────────────────────────────────

@extend_schema(tags=["Catalog — Variants"])
class ProductVariantGenerateView(APIView):
    """
    POST /products/{id}/variants/generate/
    Accepts: { attribute_groups: [[val_uuid, val_uuid], [val_uuid, val_uuid]], base_price?: 120.00, sku_prefix?: "LUXE" }
    Generates cartesian product combinations of variants.
    """
    permission_classes = [IsAuthenticated, IsVendorMember]

    def post(self, request, id=None):
        product = get_object_or_404(Product, Q(id=id) | Q(slug=id), is_deleted=False)
        vendor = _get_vendor_for_user(request.user)
        if product.vendor_id != vendor.id:
            return Response(
                {"error": {"code": "FORBIDDEN", "message": "You can only generate variants for your own products."}},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ProductVariantGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        attribute_groups = serializer.validated_data["attribute_groups"]
        base_price = serializer.validated_data.get("base_price")
        sku_prefix = serializer.validated_data.get("sku_prefix")

        created_variants = generate_variant_matrix(
            product=product,
            attribute_groups=attribute_groups,
            base_price=base_price,
            sku_prefix=sku_prefix,
        )

        output_serializer = ProductVariantSerializer(created_variants, many=True)
        return Response(
            {
                "detail": f"Successfully generated {len(created_variants)} variants.",
                "count": len(created_variants),
                "variants": output_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


# ── Product Attributes ViewSet (Sprint 5) ─────────────────────────────────────

@extend_schema(tags=["Catalog — Attributes"])
class ProductAttributeViewSet(viewsets.ModelViewSet):
    """
    GET /products/attributes/          — public read
    GET /products/attributes/{id}/     — public read
    POST/PUT/PATCH/DELETE              — PlatformAdmin only
    """
    serializer_class = ProductAttributeSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["name"]
    filterset_fields = ["category"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsPlatformAdmin()]
        return [AllowAny()]

    def get_queryset(self):
        return ProductAttribute.objects.filter(is_deleted=False).prefetch_related("values")

    @action(detail=True, methods=["post"], url_path="values", permission_classes=[IsPlatformAdmin])
    def add_value(self, request, pk=None):
        attribute = self.get_object()
        value_str = request.data.get("value", "").strip()
        if not value_str:
            return Response({"error": "Value cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
        val, created = ProductAttributeValue.objects.get_or_create(attribute=attribute, value=value_str)
        return Response(ProductAttributeValueSerializer(val).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# ── Wishlist ViewSet (Sprint 5) ───────────────────────────────────────────────

@extend_schema(tags=["Customer — Wishlist"])
class WishlistViewSet(viewsets.ModelViewSet):
    """
    Customer Wishlist management:
      GET /wishlist/          — list authenticated user's wishlist
      POST /wishlist/         — add item { product_id: "..." }
      DELETE /wishlist/{id}/  — delete by wishlist item id
      POST /wishlist/remove/  — delete by product_id { product_id: "..." }
    """
    serializer_class = WishlistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Wishlist.objects.filter(user=self.request.user, is_deleted=False)
            .select_related("product", "product__vendor", "product__category", "product__brand")
            .prefetch_related("product__images")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["post"], url_path="toggle")
    def toggle(self, request):
        """Toggle product in/out of wishlist in a single request."""
        product_id = request.data.get("product_id")
        if not product_id:
            return Response({"error": "product_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        product = get_object_or_404(Product, id=product_id, is_deleted=False)
        item = Wishlist.objects.filter(user=request.user, product=product).first()
        if item:
            item.delete()
            return Response({"in_wishlist": False, "detail": "Removed from wishlist."})
        Wishlist.objects.create(user=request.user, product=product)
        return Response({"in_wishlist": True, "detail": "Added to wishlist."}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="remove")
    def remove_by_product(self, request):
        product_id = request.data.get("product_id")
        deleted_count, _ = Wishlist.objects.filter(user=request.user, product_id=product_id).delete()
        return Response({"deleted": deleted_count > 0})


# ── Admin Product Moderation Views ────────────────────────────────────────────

@extend_schema(tags=["Admin — Products"])
class AdminProductListView(generics.ListAPIView):
    """GET /admin/products/ — IsPlatformAdmin."""
    serializer_class = AdminProductListSerializer
    permission_classes = [IsPlatformAdmin]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend, filters.OrderingFilter]
    search_fields = ["title", "slug", "vendor__display_name"]
    filterset_fields = ["status", "category", "brand", "vendor", "is_active"]
    ordering_fields = ["created_at", "base_price", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return (
            Product.objects.filter(is_deleted=False)
            .select_related("vendor", "category", "brand")
            .prefetch_related("images")
        )


@extend_schema(tags=["Admin — Products"])
class AdminProductModerationView(APIView):
    """
    PATCH /admin/products/{id}/approve/
    PATCH /admin/products/{id}/reject/
    """
    permission_classes = [IsPlatformAdmin]

    def patch(self, request, id=None, action_type=None):
        product = get_object_or_404(Product, id=id, is_deleted=False)

        if action_type == "approve":
            new_status = ProductStatus.APPROVED
            rejection_reason = ""
        elif action_type == "reject":
            new_status = ProductStatus.REJECTED
            rejection_reason = request.data.get("rejection_reason", "").strip()
            if not rejection_reason:
                return Response(
                    {"error": {"code": "VALIDATION_ERROR", "message": "rejection_reason is required."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            return Response(
                {"error": {"code": "INVALID_ACTION", "message": "Action must be 'approve' or 'reject'."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = product.status
        product.status = new_status
        product.rejection_reason = rejection_reason
        product.save()

        AuditLog.objects.create(
            actor=request.user,
            action=f"product.{action_type}",
            target_model="catalog.Product",
            target_id=product.id,
            before={"status": old_status},
            after={"status": new_status, "rejection_reason": rejection_reason},
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        return Response(
            {
                "detail": f"Product {action_type}d successfully.",
                "product_id": str(product.id),
                "status": product.status,
                "rejection_reason": product.rejection_reason,
            },
            status=status.HTTP_200_OK,
        )


# ── Bulk Import Views ─────────────────────────────────────────────────────────

@extend_schema(tags=["Vendor — Products"])
class VendorProductBulkImportView(APIView):
    """
    POST /vendors/me/products/bulk-import/
    Enqueues catalog.tasks.process_bulk_import
    """
    permission_classes = [IsAuthenticated, IsVendorMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        vendor = _get_vendor_for_user(request.user)
        uploaded_file = request.FILES.get("file")
        raw_csv = request.data.get("raw_csv", "")
        original_filename = ""

        if uploaded_file:
            original_filename = uploaded_file.name
            csv_data = uploaded_file.read().decode("utf-8-sig", errors="replace")
        elif raw_csv:
            csv_data = raw_csv
            original_filename = "inline.csv"
        else:
            return Response(
                {"error": {"code": "NO_FILE", "message": "Provide a CSV file or raw_csv string."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        job = BulkImportJob.objects.create(
            vendor=vendor,
            status=BulkImportJobStatus.QUEUED,
            original_filename=original_filename,
            result_json=csv_data,
        )

        from catalog.tasks import process_bulk_import
        process_bulk_import.delay(str(job.job_id))

        return Response(
            {
                "detail": "Bulk import queued.",
                "job_id": str(job.job_id),
                "status": job.status,
            },
            status=status.HTTP_202_ACCEPTED,
        )


@extend_schema(tags=["Vendor — Products"])
class BulkImportStatusView(generics.RetrieveAPIView):
    """GET /vendors/me/products/bulk-import/{job_id}/ — poll job status."""
    serializer_class = BulkImportJobSerializer
    permission_classes = [IsAuthenticated, IsVendorMember]
    lookup_field = "job_id"

    def get_queryset(self):
        vendor = _get_vendor_for_user(self.request.user)
        return BulkImportJob.objects.filter(vendor=vendor, is_deleted=False)


# ── Sprint 14: Reviews & Product Q&A Views ───────────────────────────────────

from catalog.models import (
    Review,
    ReviewReply,
    ReviewModerationStatus,
    ProductQuestion,
    ProductAnswer,
)
from catalog.serializers import (
    ReviewSerializer,
    ReviewCreateSerializer,
    ReviewReplySerializer,
    ReviewReplyCreateSerializer,
    AdminReviewModerationSerializer,
    ProductQuestionSerializer,
    ProductQuestionCreateSerializer,
    ProductAnswerSerializer,
    ProductAnswerCreateSerializer,
)
from catalog.services.reviews import review_service
from core.permissions import IsPlatformAdmin


class ProductReviewViewSet(viewsets.ModelViewSet):
    """
    GET /products/{product_id}/reviews/ — List approved customer reviews.
    POST /products/{product_id}/reviews/ — Submit customer review (verified purchase check).
    """
    serializer_class = ReviewSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_queryset(self):
        product_id = self.kwargs.get("product_id")
        qs = Review.objects.filter(moderation_status=ReviewModerationStatus.APPROVED)
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs.select_related("user", "reply__vendor_staff").prefetch_related("media")

    def create(self, request, *args, **kwargs):
        product_id = self.kwargs.get("product_id")
        product = Product.objects.filter(id=product_id, is_deleted=False).first()
        if not product:
            return Response({"error": {"code": "NOT_FOUND", "message": "Product not found."}}, status=status.HTTP_404_NOT_FOUND)

        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        review = review_service.create_review(
            product=product,
            user=request.user,
            rating=data["rating"],
            title=data["title"],
            comment=data["comment"],
            order_item_id=data.get("order_item_id"),
            media_urls=data.get("media_urls"),
        )
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class ReviewReplyView(APIView):
    """
    POST /reviews/{id}/reply/ — Vendor staff replies to customer review.
    """
    permission_classes = [IsAuthenticated, IsVendorMember]

    def post(self, request, id):
        review = Review.objects.filter(id=id).select_related("product__vendor").first()
        if not review:
            return Response({"error": {"code": "NOT_FOUND", "message": "Review not found."}}, status=status.HTTP_404_NOT_FOUND)

        vendor = _get_vendor_for_user(request.user)
        if not vendor or review.product.vendor != vendor:
            return Response({"error": {"code": "FORBIDDEN", "message": "You can only reply to reviews for your own products."}}, status=status.HTTP_403_FORBIDDEN)

        serializer = ReviewReplyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reply = review_service.reply_to_review(
            review=review,
            vendor_staff=request.user,
            comment=serializer.validated_data["comment"],
        )
        return Response(ReviewReplySerializer(reply).data, status=status.HTTP_201_CREATED)


class AdminReviewModerationView(APIView):
    """
    PATCH /admin/reviews/{id}/moderate/ — Platform Admin approves or rejects review.
    """
    permission_classes = [IsPlatformAdmin]

    def patch(self, request, id):
        review = Review.objects.filter(id=id).first()
        if not review:
            return Response({"error": {"code": "NOT_FOUND", "message": "Review not found."}}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminReviewModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_review = review_service.moderate_review(
            review=review,
            status=serializer.validated_data["moderation_status"],
        )
        return Response(ReviewSerializer(updated_review).data, status=status.HTTP_200_OK)


class ProductQuestionViewSet(viewsets.ModelViewSet):
    """
    GET /products/{product_id}/questions/ — Public list of approved questions.
    POST /products/{product_id}/questions/ — Authenticated user posts question.
    """
    serializer_class = ProductQuestionSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_queryset(self):
        product_id = self.kwargs.get("product_id")
        qs = ProductQuestion.objects.filter(is_approved=True)
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs.select_related("user").prefetch_related("answers__user")

    def create(self, request, *args, **kwargs):
        product_id = self.kwargs.get("product_id")
        product = Product.objects.filter(id=product_id, is_deleted=False).first()
        if not product:
            return Response({"error": {"code": "NOT_FOUND", "message": "Product not found."}}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductQuestionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question = ProductQuestion.objects.create(
            product=product,
            user=request.user,
            question=serializer.validated_data["question"],
            is_approved=True,
        )
        return Response(ProductQuestionSerializer(question).data, status=status.HTTP_201_CREATED)


class ProductAnswerView(APIView):
    """
    POST /products/{pid}/questions/{id}/answers/ — Vendor or community answers question.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pid, id):
        question = ProductQuestion.objects.filter(id=id, product_id=pid).select_related("product__vendor").first()
        if not question:
            return Response({"error": {"code": "NOT_FOUND", "message": "Question not found."}}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductAnswerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vendor = _get_vendor_for_user(request.user)
        is_vendor = vendor and question.product.vendor == vendor

        answer = ProductAnswer.objects.create(
            question=question,
            user=request.user,
            answer=serializer.validated_data["answer"],
            is_vendor_response=bool(is_vendor),
        )
        return Response(ProductAnswerSerializer(answer).data, status=status.HTTP_201_CREATED)

