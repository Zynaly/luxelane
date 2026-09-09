"""
catalog/serializers.py — Sprint 4 & 5: Catalog Core, Moderation, Variants, Attributes & Wishlist.
"""
import re
from decimal import Decimal
from rest_framework import serializers

from catalog.models import (
    Category, Brand, Product, ProductImage, ProductTag,
    BulkImportJob, ProductStatus,
    ProductAttribute, ProductAttributeValue,
    ProductVariant, ProductVariantAttribute,
    Wishlist,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    """Generate a slug from a name."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _unique_slug(model_class, name: str, exclude_id=None) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = base
    i = 1
    qs = model_class.objects.all()
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    while qs.filter(slug=slug).exists():
        slug = f"{base}-{i}"
        i += 1
    return slug


# ── Category ─────────────────────────────────────────────────────────────────

class CategorySerializer(serializers.ModelSerializer):
    """
    Public read. Recursive children for tree display.
    Admin write uses AdminCategorySerializer (same fields, writable).
    """
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id", "parent", "name", "slug", "icon_url",
            "is_active", "level", "children",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "level", "created_at", "updated_at"]

    def get_children(self, obj):
        """Recursively serialize active children."""
        qs = obj.get_children().filter(is_deleted=False)
        return CategorySerializer(qs, many=True, context=self.context).data


class AdminCategorySerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(max_length=150, required=False, allow_blank=True)

    class Meta:
        model = Category
        fields = [
            "id", "parent", "name", "slug", "icon_url",
            "is_active", "level", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "level", "created_at", "updated_at"]

    def create(self, validated_data):
        if not validated_data.get("slug"):
            validated_data["slug"] = _unique_slug(Category, validated_data["name"])
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "name" in validated_data and not validated_data.get("slug"):
            validated_data["slug"] = _unique_slug(Category, validated_data["name"], exclude_id=instance.id)
        return super().update(instance, validated_data)


# ── Brand ─────────────────────────────────────────────────────────────────────

class BrandSerializer(serializers.ModelSerializer):
    """Public read serializer for brands."""
    class Meta:
        model = Brand
        fields = ["id", "name", "slug", "logo_url", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]


class AdminBrandSerializer(serializers.ModelSerializer):
    """Admin write serializer for brands."""
    slug = serializers.SlugField(max_length=150, required=False, allow_blank=True)

    class Meta:
        model = Brand
        fields = ["id", "name", "slug", "logo_url", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        if not validated_data.get("slug"):
            validated_data["slug"] = _unique_slug(Brand, validated_data["name"])
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "name" in validated_data and not validated_data.get("slug"):
            validated_data["slug"] = _unique_slug(Brand, validated_data["name"], exclude_id=instance.id)
        return super().update(instance, validated_data)


# ── Product Images & Tags ─────────────────────────────────────────────────────

class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image_url", "sort_order", "is_primary", "variant"]
        read_only_fields = ["id"]


class ProductTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTag
        fields = ["id", "tag"]
        read_only_fields = ["id"]


# ── Product Attributes & Values (Sprint 5) ────────────────────────────────────

class ProductAttributeValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductAttributeValue
        fields = ["id", "attribute", "value"]
        read_only_fields = ["id"]


class ProductAttributeSerializer(serializers.ModelSerializer):
    """
    Public read / Admin write for attributes.
    Includes nested values and optional writable values list.
    """
    values = serializers.SerializerMethodField()
    values_write = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        write_only=True,
    )
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = ProductAttribute
        fields = [
            "id", "name", "category", "category_name",
            "values", "values_write",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_values(self, obj):
        vals = obj.values.filter(is_deleted=False).order_by("value")
        return [{"id": str(v.id), "value": v.value} for v in vals]

    def create(self, validated_data):
        values_write = validated_data.pop("values_write", [])
        attr = super().create(validated_data)
        for val_str in values_write:
            val_str = val_str.strip()
            if val_str:
                ProductAttributeValue.objects.get_or_create(attribute=attr, value=val_str)
        return attr

    def update(self, instance, validated_data):
        values_write = validated_data.pop("values_write", None)
        attr = super().update(instance, validated_data)
        if values_write is not None:
            for val_str in values_write:
                val_str = val_str.strip()
                if val_str:
                    ProductAttributeValue.objects.get_or_create(attribute=attr, value=val_str)
        return attr


# ── Product Variants (Sprint 5) ────────────────────────────────────────────────

class VariantAttributeItemSerializer(serializers.Serializer):
    attribute_id   = serializers.CharField(source="attribute_value.attribute.id", read_only=True)
    attribute_name = serializers.CharField(source="attribute_value.attribute.name", read_only=True)
    value_id       = serializers.CharField(source="attribute_value.id", read_only=True)
    value          = serializers.CharField(source="attribute_value.value", read_only=True)


class ProductVariantSerializer(serializers.ModelSerializer):
    attributes = VariantAttributeItemSerializer(
        source="variant_attributes",
        many=True,
        read_only=True,
    )
    attribute_value_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
    )
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id", "product", "sku", "barcode", "price", "compare_at_price",
            "weight_kg", "length_cm", "width_cm", "height_cm",
            "is_active", "attributes", "attribute_value_ids", "images",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "product", "created_at", "updated_at"]

    def create(self, validated_data):
        attr_ids = validated_data.pop("attribute_value_ids", [])
        variant = super().create(validated_data)
        for aid in attr_ids:
            try:
                val = ProductAttributeValue.objects.get(id=aid)
                ProductVariantAttribute.objects.get_or_create(variant=variant, attribute_value=val)
            except ProductAttributeValue.DoesNotExist:
                pass
        return variant

    def update(self, instance, validated_data):
        attr_ids = validated_data.pop("attribute_value_ids", None)
        variant = super().update(instance, validated_data)
        if attr_ids is not None:
            instance.variant_attributes.all().delete()
            for aid in attr_ids:
                try:
                    val = ProductAttributeValue.objects.get(id=aid)
                    ProductVariantAttribute.objects.get_or_create(variant=instance, attribute_value=val)
                except ProductAttributeValue.DoesNotExist:
                    pass
        return variant


class ProductVariantGenerateSerializer(serializers.Serializer):
    """
    POST /products/{id}/variants/generate/
    Accepts list of attribute groups (each group contains list of value UUIDs).
    Computes Cartesian product and auto-generates SKUs.
    """
    attribute_groups = serializers.ListField(
        child=serializers.ListField(child=serializers.UUIDField()),
        help_text="List of attribute value UUID lists grouped by attribute",
    )
    base_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    sku_prefix = serializers.CharField(max_length=32, required=False, allow_blank=True)


# ── Product — Public List (lightweight) ───────────────────────────────────────

class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight product serializer for catalog browsing & search."""
    primary_image       = serializers.SerializerMethodField()
    vendor_display_name = serializers.CharField(source="vendor.display_name", read_only=True)
    category_name       = serializers.CharField(source="category.name", read_only=True)
    brand_name          = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "title", "slug", "base_price",
            "primary_image", "vendor_display_name", "category_name", "brand_name",
            "rating_avg", "rating_count", "status", "is_active", "created_at",
        ]

    def get_primary_image(self, obj):
        img = obj.images.filter(is_primary=True, is_deleted=False).first()
        if not img:
            img = obj.images.filter(is_deleted=False).first()
        return img.image_url if img else None

    def get_brand_name(self, obj):
        return obj.brand.name if obj.brand else None


# ── Product — Public Detail (full) ───────────────────────────────────────────

class ProductDetailSerializer(serializers.ModelSerializer):
    """Full serializer for public product detail view including variants."""
    images        = ProductImageSerializer(many=True, read_only=True)
    tags          = ProductTagSerializer(many=True, read_only=True)
    variants      = ProductVariantSerializer(many=True, read_only=True)
    vendor_info   = serializers.SerializerMethodField()
    category_info = serializers.SerializerMethodField()
    brand_info    = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "title", "slug", "description", "base_price",
            "status", "is_active",
            "rating_avg", "rating_count",
            "images", "tags", "variants",
            "vendor_info", "category_info", "brand_info",
            "created_at", "updated_at",
        ]

    def get_vendor_info(self, obj):
        return {
            "id": str(obj.vendor.id),
            "display_name": obj.vendor.display_name,
            "slug": obj.vendor.slug,
        }

    def get_category_info(self, obj):
        return {
            "id": str(obj.category.id),
            "name": obj.category.name,
            "slug": obj.category.slug,
        }

    def get_brand_info(self, obj):
        if obj.brand:
            return {
                "id": str(obj.brand.id),
                "name": obj.brand.name,
                "slug": obj.brand.slug,
            }
        return None


# ── Product — Vendor Write ────────────────────────────────────────────────────

class ProductWriteSerializer(serializers.ModelSerializer):
    """
    Vendor create/update. Forces status=pending_review on submit.
    Accepts nested images and tags for create.
    """
    images = ProductImageSerializer(many=True, required=False)
    tags   = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Product
        fields = [
            "id", "title", "slug", "description", "base_price",
            "category", "brand",
            "images", "tags",
            "status", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def validate_status(self, value):
        """Vendor can only set draft or pending_review."""
        allowed = {ProductStatus.DRAFT, ProductStatus.PENDING_REVIEW}
        if value not in allowed:
            raise serializers.ValidationError(
                f"Vendors may only set status to: {', '.join(allowed)}"
            )
        return value

    def create(self, validated_data):
        images_data = validated_data.pop("images", [])
        tags_data   = validated_data.pop("tags", [])
        validated_data["slug"] = _unique_slug(Product, validated_data["title"])
        product = Product.objects.create(**validated_data)
        for img in images_data:
            ProductImage.objects.create(product=product, **img)
        for tag in tags_data:
            ProductTag.objects.get_or_create(product=product, tag=tag.lower().strip())
        return product

    def update(self, instance, validated_data):
        images_data = validated_data.pop("images", None)
        tags_data   = validated_data.pop("tags", None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if images_data is not None:
            instance.images.filter(is_deleted=False).update(is_deleted=True)
            for img in images_data:
                ProductImage.objects.create(product=instance, **img)
        if tags_data is not None:
            instance.tags.all().delete()
            for tag in tags_data:
                ProductTag.objects.get_or_create(product=instance, tag=tag.lower().strip())
        return instance


# ── Admin Product List ────────────────────────────────────────────────────────

class AdminProductListSerializer(serializers.ModelSerializer):
    """Admin sees all statuses + vendor name."""
    primary_image       = serializers.SerializerMethodField()
    vendor_display_name = serializers.CharField(source="vendor.display_name", read_only=True)
    category_name       = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "title", "slug", "base_price",
            "status", "rejection_reason",
            "primary_image", "vendor_display_name", "category_name",
            "is_active", "created_at", "updated_at",
        ]

    def get_primary_image(self, obj):
        img = obj.images.filter(is_primary=True, is_deleted=False).first()
        if not img:
            img = obj.images.filter(is_deleted=False).first()
        return img.image_url if img else None


# ── Admin Product Moderation ──────────────────────────────────────────────────

class AdminProductModerationSerializer(serializers.ModelSerializer):
    """PATCH /admin/products/{id}/approve|reject/ — changes status + writes AuditLog."""
    class Meta:
        model = Product
        fields = ["status", "rejection_reason"]

    def validate(self, data):
        status = data.get("status")
        if status == ProductStatus.REJECTED and not data.get("rejection_reason"):
            raise serializers.ValidationError(
                {"rejection_reason": "A rejection reason is required when rejecting a product."}
            )
        return data


# ── Bulk Import ───────────────────────────────────────────────────────────────

class BulkImportRowResultSerializer(serializers.Serializer):
    """Read-only — returned within BulkImportJobSerializer.result_json."""
    row_number = serializers.IntegerField()
    sku        = serializers.CharField(allow_blank=True)
    status     = serializers.ChoiceField(choices=["success", "error"])
    errors     = serializers.ListField(child=serializers.CharField(), required=False)


class BulkImportJobSerializer(serializers.ModelSerializer):
    """GET /vendors/me/products/bulk-import/{job_id}/ — poll job status."""
    results = serializers.SerializerMethodField()

    class Meta:
        model = BulkImportJob
        fields = [
            "job_id", "status", "original_filename",
            "total_rows", "processed_rows",
            "results", "error_message",
            "created_at", "updated_at",
        ]

    def get_results(self, obj):
        return obj.result_json


# ── Wishlist (Sprint 5) ───────────────────────────────────────────────────────

class WishlistSerializer(serializers.ModelSerializer):
    product    = ProductListSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_deleted=False),
        source="product",
        write_only=True,
    )

    class Meta:
        model = Wishlist
        fields = ["id", "product", "product_id", "created_at"]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        user = self.context["request"].user
        product = validated_data["product"]
        wishlist_item, _ = Wishlist.objects.get_or_create(user=user, product=product)
        return wishlist_item


# ── Sprint 14: Reviews, Ratings & Product Q&A Serializers ───────────────────

from catalog.models import (
    Review,
    ReviewMedia,
    ReviewReply,
    ReviewModerationStatus,
    ProductQuestion,
    ProductAnswer,
)


class ReviewMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewMedia
        fields = ["id", "media_url", "media_type", "created_at"]
        read_only_fields = fields


class ReviewReplySerializer(serializers.ModelSerializer):
    vendor_staff_name = serializers.CharField(source="vendor_staff.get_full_name", read_only=True)

    class Meta:
        model = ReviewReply
        fields = ["id", "vendor_staff", "vendor_staff_name", "comment", "created_at"]
        read_only_fields = fields


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    media = ReviewMediaSerializer(many=True, read_only=True)
    reply = ReviewReplySerializer(read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "product",
            "user",
            "user_name",
            "order_item",
            "rating",
            "title",
            "comment",
            "is_verified_purchase",
            "moderation_status",
            "media",
            "reply",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "user",
            "user_name",
            "is_verified_purchase",
            "moderation_status",
            "media",
            "reply",
            "created_at",
            "updated_at",
        ]


class ReviewCreateSerializer(serializers.Serializer):
    order_item_id = serializers.UUIDField(required=False, allow_null=True)
    rating = serializers.IntegerField(min_value=1, max_value=5, required=True)
    title = serializers.CharField(max_length=200, required=True)
    comment = serializers.CharField(required=True)
    media_urls = serializers.ListField(
        child=serializers.URLField(),
        required=False,
        default=list,
    )


class ReviewReplyCreateSerializer(serializers.Serializer):
    comment = serializers.CharField(required=True)


class AdminReviewModerationSerializer(serializers.Serializer):
    moderation_status = serializers.ChoiceField(
        choices=ReviewModerationStatus.choices,
        required=True,
    )


class ProductAnswerSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = ProductAnswer
        fields = ["id", "question", "user", "user_name", "answer", "is_vendor_response", "created_at"]
        read_only_fields = fields


class ProductQuestionSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    answers = ProductAnswerSerializer(many=True, read_only=True)

    class Meta:
        model = ProductQuestion
        fields = ["id", "product", "user", "user_name", "question", "is_approved", "answers", "created_at"]
        read_only_fields = fields


class ProductQuestionCreateSerializer(serializers.Serializer):
    question = serializers.CharField(required=True)


class ProductAnswerCreateSerializer(serializers.Serializer):
    answer = serializers.CharField(required=True)

