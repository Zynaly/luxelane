"""
catalog/models.py — Sprint 4 & 5: Catalog Core, Moderation, Variants, Attributes & Wishlist.

Models:
  Category (MPTT), Brand, Product, ProductImage, ProductTag, BulkImportJob,
  ProductAttribute, ProductAttributeValue, ProductVariant, ProductVariantAttribute,
  Wishlist
"""
import uuid
from django.conf import settings
from django.db import models
from django.contrib.postgres.search import SearchVectorField
from django.contrib.postgres.indexes import GinIndex
from mptt.models import MPTTModel, TreeForeignKey

from core.models import BaseModel


# ── Category (MPTT tree) ──────────────────────────────────────────────────────

class Category(MPTTModel, BaseModel):
    """
    Hierarchical product category using django-mptt.
    MPTT auto-adds: lft, rght, tree_id, level.
    Public read; admin write only.
    """
    parent = TreeForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        db_index=True,
    )
    name      = models.CharField(max_length=150)
    slug      = models.SlugField(max_length=150, unique=True, db_index=True)
    icon_url  = models.URLField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class MPTTMeta:
        order_insertion_by = ["name"]

    class Meta(BaseModel.Meta):
        verbose_name_plural = "categories"
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return self.name


# ── Brand ─────────────────────────────────────────────────────────────────────

class Brand(BaseModel):
    """A product brand / house. Optional association on Product."""
    name     = models.CharField(max_length=150, unique=True)
    slug     = models.SlugField(max_length=150, unique=True, db_index=True)
    logo_url = models.URLField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["name"]

    def __str__(self):
        return self.name


# ── Product status choices ─────────────────────────────────────────────────────

class ProductStatus(models.TextChoices):
    DRAFT          = "draft",           "Draft"
    PENDING_REVIEW = "pending_review",  "Pending Review"
    APPROVED       = "approved",        "Approved"
    REJECTED       = "rejected",        "Rejected"
    ARCHIVED       = "archived",        "Archived"


# ── Product ───────────────────────────────────────────────────────────────────

class Product(BaseModel):
    """
    A vendor's product listing.
    Status FSM: draft → pending_review → approved / rejected → archived.
    search_vector is updated via a Celery task or DB trigger (Sprint 5 enhances this).
    """
    vendor   = models.ForeignKey(
        "vendors.Vendor",
        on_delete=models.CASCADE,
        related_name="products",
        db_index=True,
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
        db_index=True,
    )
    brand = models.ForeignKey(
        Brand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )
    title            = models.CharField(max_length=255)
    slug             = models.SlugField(max_length=255, unique=True, db_index=True)
    description      = models.TextField(blank=True)
    status           = models.CharField(
        max_length=20,
        choices=ProductStatus.choices,
        default=ProductStatus.DRAFT,
        db_index=True,
    )
    rejection_reason = models.TextField(blank=True)
    base_price       = models.DecimalField(max_digits=12, decimal_places=2)
    # Full-text search — GIN indexed, populated by update_search_vector task
    search_vector    = SearchVectorField(null=True, blank=True)
    # Denormalised rating — updated by Celery task in Sprint 14
    rating_avg       = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    rating_count     = models.PositiveIntegerField(default=0)
    is_active        = models.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["vendor", "status"]),
            models.Index(fields=["category"]),
            models.Index(fields=["is_active"]),
            GinIndex(fields=["search_vector"], name="product_search_gin"),
        ]

    def __str__(self):
        return f"{self.title} ({self.status})"


# ── Attributes & Values (Sprint 5) ─────────────────────────────────────────────

class ProductAttribute(BaseModel):
    """
    Product attribute type (e.g. 'Color', 'Size', 'Material').
    Can optionally be scoped to a specific category or global (null category).
    """
    name     = models.CharField(max_length=100)
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attributes",
        db_index=True,
    )

    class Meta(BaseModel.Meta):
        ordering = ["name"]
        unique_together = [("name", "category")]

    def __str__(self):
        return f"{self.name} ({self.category.name if self.category else 'Global'})"


class ProductAttributeValue(BaseModel):
    """
    A specific value for a ProductAttribute (e.g. 'Navy Blue', 'XL', 'Cashmere').
    """
    attribute = models.ForeignKey(
        ProductAttribute,
        on_delete=models.CASCADE,
        related_name="values",
        db_index=True,
    )
    value = models.CharField(max_length=100)

    class Meta(BaseModel.Meta):
        ordering = ["value"]
        unique_together = [("attribute", "value")]

    def __str__(self):
        return f"{self.attribute.name}: {self.value}"


# ── Product Variants (Sprint 5) ────────────────────────────────────────────────

class ProductVariant(BaseModel):
    """
    Sellable SKU under a parent Product.
    Holds inventory SKU, price override, and physical dimensions for shipping.
    """
    product          = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="variants",
        db_index=True,
    )
    sku              = models.CharField(max_length=64, db_index=True)
    barcode          = models.CharField(max_length=64, blank=True, null=True)
    price            = models.DecimalField(max_digits=12, decimal_places=2)
    compare_at_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    weight_kg        = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    length_cm        = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    width_cm         = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    height_cm        = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    is_active        = models.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["created_at"]
        unique_together = [("product", "sku")]
        indexes = [
            models.Index(fields=["product", "is_active"]),
            models.Index(fields=["sku"]),
        ]

    def __str__(self):
        return f"{self.sku} (${self.price})"


class ProductVariantAttribute(BaseModel):
    """
    Associates a variant with a specific attribute value (e.g. Variant X has Color=Navy).
    """
    variant         = models.ForeignKey(
        ProductVariant,
        on_delete=models.CASCADE,
        related_name="variant_attributes",
        db_index=True,
    )
    attribute_value = models.ForeignKey(
        ProductAttributeValue,
        on_delete=models.CASCADE,
        related_name="variant_associations",
        db_index=True,
    )

    class Meta(BaseModel.Meta):
        unique_together = [("variant", "attribute_value")]

    def __str__(self):
        return f"{self.variant.sku} → {self.attribute_value}"


# ── ProductImage ──────────────────────────────────────────────────────────────

class ProductImage(BaseModel):
    """
    Images associated with a product, optionally tied to a specific variant.
    """
    product    = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    variant    = models.ForeignKey(
        ProductVariant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="images",
    )
    image_url  = models.URLField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_primary = models.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["sort_order", "created_at"]

    def __str__(self):
        return f"Image for {self.product_id} (sort={self.sort_order})"


# ── ProductTag ────────────────────────────────────────────────────────────────

class ProductTag(BaseModel):
    """Free-form tag applied to a product (for search facets in Sprint 5)."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="tags")
    tag     = models.CharField(max_length=50, db_index=True)

    class Meta(BaseModel.Meta):
        unique_together = [("product", "tag")]
        ordering = ["tag"]

    def __str__(self):
        return f"{self.tag} → {self.product_id}"


# ── Wishlist (Sprint 5) ───────────────────────────────────────────────────────

class Wishlist(BaseModel):
    """
    Customer wishlist item linking user to desired products.
    """
    user    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wishlists",
        db_index=True,
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="wishlisted_by",
        db_index=True,
    )

    class Meta(BaseModel.Meta):
        unique_together = [("user", "product")]
        ordering = ["-created_at"]

    def __str__(self):
        return f"Wishlist: {self.user_id} → {self.product.title}"


# ── BulkImportJob ─────────────────────────────────────────────────────────────

class BulkImportJobStatus(models.TextChoices):
    QUEUED     = "queued",     "Queued"
    PROCESSING = "processing", "Processing"
    DONE       = "done",       "Done"
    FAILED     = "failed",     "Failed"


class BulkImportJob(BaseModel):
    """
    Tracks the status of a vendor CSV/XLSX product bulk-import Celery task.
    Created on POST /vendors/me/products/bulk-import/; polled via GET.
    """
    job_id            = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    vendor            = models.ForeignKey(
        "vendors.Vendor",
        on_delete=models.CASCADE,
        related_name="bulk_import_jobs",
    )
    status            = models.CharField(
        max_length=20,
        choices=BulkImportJobStatus.choices,
        default=BulkImportJobStatus.QUEUED,
        db_index=True,
    )
    original_filename = models.CharField(max_length=255, blank=True)
    total_rows        = models.PositiveIntegerField(default=0)
    processed_rows    = models.PositiveIntegerField(default=0)
    result_json       = models.JSONField(default=list)
    error_message     = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"BulkImport {self.job_id} ({self.status})"


# ── Sprint 14: Reviews, Ratings & Product Q&A ─────────────────────────────────

class ReviewModerationStatus(models.TextChoices):
    PENDING  = "pending",  "Pending Moderation"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class Review(BaseModel):
    """
    Customer product review with rating, optional media, and verified purchase indicator.
    """
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    order_item = models.OneToOneField(
        "orders.OrderItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review",
    )
    rating = models.PositiveSmallIntegerField(
        choices=[(1, "1 Star"), (2, "2 Stars"), (3, "3 Stars"), (4, "4 Stars"), (5, "5 Stars")],
        db_index=True,
    )
    title = models.CharField(max_length=200)
    comment = models.TextField()
    is_verified_purchase = models.BooleanField(default=False)
    moderation_status = models.CharField(
        max_length=20,
        choices=ReviewModerationStatus.choices,
        default=ReviewModerationStatus.APPROVED,
        db_index=True,
    )

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["product", "moderation_status"]),
        ]

    def __str__(self):
        return f"{self.rating}★ Review for {self.product.title} by {self.user.email}"


class ReviewMedia(BaseModel):
    """
    User-uploaded photos or videos attached to a product review.
    """
    review = models.ForeignKey(
        Review,
        on_delete=models.CASCADE,
        related_name="media",
    )
    media_url = models.URLField()
    media_type = models.CharField(max_length=20, default="image")

    class Meta(BaseModel.Meta):
        ordering = ["created_at"]

    def __str__(self):
        return f"Media for Review {self.review.id.hex[:8]}"


class ReviewReply(BaseModel):
    """
    Official vendor reply to a customer product review (max one per review).
    """
    review = models.OneToOneField(
        Review,
        on_delete=models.CASCADE,
        related_name="reply",
    )
    vendor_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_replies",
    )
    comment = models.TextField()

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"Vendor Reply to Review {self.review.id.hex[:8]}"


class ProductQuestion(BaseModel):
    """
    Customer question posted on a product detail page.
    """
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="product_questions",
    )
    question = models.TextField()
    is_approved = models.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"Q: {self.question[:50]}... ({self.product.title})"


class ProductAnswer(BaseModel):
    """
    Vendor or community answer to a customer product question.
    """
    question = models.ForeignKey(
        ProductQuestion,
        on_delete=models.CASCADE,
        related_name="answers",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="product_answers",
    )
    answer = models.TextField()
    is_vendor_response = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ["created_at"]

    def __str__(self):
        return f"A by {self.user.email}: {self.answer[:50]}..."

