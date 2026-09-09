"""catalog/admin.py — Django admin registration for Sprint 4 models."""
from django.contrib import admin
from mptt.admin import MPTTModelAdmin

from catalog.models import (
    Category, Brand, Product, ProductImage, ProductTag, BulkImportJob,
    Review, ReviewMedia, ReviewReply, ProductQuestion, ProductAnswer
)


@admin.register(Category)
class CategoryAdmin(MPTTModelAdmin):
    list_display = ["name", "slug", "parent", "is_active", "level"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}
    mptt_level_indent = 20


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "created_at"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    fields = ["image_url", "sort_order", "is_primary"]


class ProductTagInline(admin.TabularInline):
    model = ProductTag
    extra = 0
    fields = ["tag"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["title", "vendor", "category", "status", "base_price", "is_active", "created_at"]
    list_filter = ["status", "is_active", "category"]
    search_fields = ["title", "slug", "vendor__display_name"]
    readonly_fields = ["slug", "search_vector", "rating_avg", "rating_count", "created_at", "updated_at"]
    inlines = [ProductImageInline, ProductTagInline]


@admin.register(BulkImportJob)
class BulkImportJobAdmin(admin.ModelAdmin):
    list_display = ["job_id", "vendor", "status", "total_rows", "processed_rows", "created_at"]
    list_filter = ["status"]
    readonly_fields = ["job_id", "created_at", "updated_at"]


class ReviewMediaInline(admin.TabularInline):
    model = ReviewMedia
    extra = 0


class ReviewReplyInline(admin.StackedInline):
    model = ReviewReply
    extra = 0


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["id", "product", "user", "rating", "is_verified_purchase", "moderation_status", "created_at"]
    list_filter = ["rating", "is_verified_purchase", "moderation_status"]
    search_fields = ["title", "comment", "user__email", "product__title"]
    inlines = [ReviewMediaInline, ReviewReplyInline]


class ProductAnswerInline(admin.TabularInline):
    model = ProductAnswer
    extra = 0


@admin.register(ProductQuestion)
class ProductQuestionAdmin(admin.ModelAdmin):
    list_display = ["id", "product", "user", "question", "is_approved", "created_at"]
    list_filter = ["is_approved"]
    search_fields = ["question", "user__email", "product__title"]
    inlines = [ProductAnswerInline]

