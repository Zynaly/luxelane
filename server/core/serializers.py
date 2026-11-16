from django.db import models
from rest_framework import serializers


class PresignedUploadPurpose(models.TextChoices):
    AVATAR          = "avatar",          "Avatar"
    VENDOR_DOCUMENT = "vendor_document", "Vendor Document"
    PRODUCT_IMAGE   = "product_image",   "Product Image"
    REVIEW_MEDIA    = "review_media",    "Review Media"


class PresignedUploadRequestSerializer(serializers.Serializer):
    """Request for a presigned PUT upload URL."""
    content_type = serializers.CharField(max_length=100)
    size_bytes   = serializers.IntegerField(min_value=1)
    purpose      = serializers.ChoiceField(choices=PresignedUploadPurpose.choices)
    filename     = serializers.CharField(max_length=255, required=False, allow_blank=True)


class PresignedUploadResponseSerializer(serializers.Serializer):
    """Response containing presigned PUT URL and destination URL."""
    upload_url   = serializers.URLField()
    file_url     = serializers.URLField()
    key          = serializers.CharField()
    content_type = serializers.CharField()
    expires_at   = serializers.DateTimeField()


# ── Sprint 15: Reporting & Export Serializers ─────────────────────────────────

from core.models import ExportJob


class AdminDashboardStatsSerializer(serializers.Serializer):
    gmv                   = serializers.CharField()
    active_vendors        = serializers.IntegerField()
    orders_today          = serializers.IntegerField()
    pending_payouts_count = serializers.IntegerField()
    pending_payouts_amount= serializers.CharField()
    ledger_drift_flag     = serializers.BooleanField()
    total_customers       = serializers.IntegerField()
    total_products        = serializers.IntegerField()


class AdminSalesReportSerializer(serializers.Serializer):
    start_date       = serializers.CharField()
    end_date         = serializers.CharField()
    total_orders     = serializers.IntegerField()
    gross_sales      = serializers.CharField()
    net_subtotal     = serializers.CharField()
    shipping_total   = serializers.CharField()
    tax_total        = serializers.CharField()
    discount_total   = serializers.CharField()
    commission_total = serializers.CharField()
    daily_breakdown  = serializers.ListField(child=serializers.DictField())


class AdminInventoryReportSerializer(serializers.Serializer):
    total_skus          = serializers.IntegerField()
    total_units_on_hand = serializers.IntegerField()
    total_units_reserved= serializers.IntegerField()
    low_stock_skus      = serializers.IntegerField()
    out_of_stock_skus   = serializers.IntegerField()
    warehouses          = serializers.ListField(child=serializers.DictField())


class AdminVendorPerformanceReportSerializer(serializers.Serializer):
    vendor_id             = serializers.CharField()
    display_name          = serializers.CharField()
    legal_name            = serializers.CharField()
    status                = serializers.CharField()
    rating_avg            = serializers.CharField()
    order_count           = serializers.IntegerField()
    gmv                   = serializers.CharField()
    commission_paid       = serializers.CharField()
    net_earned            = serializers.CharField()
    return_requests_count = serializers.IntegerField()


class ExportJobSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)

    class Meta:
        model = ExportJob
        fields = [
            "id",
            "resource",
            "format",
            "status",
            "file_url",
            "result_json",
            "error_message",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ExportRequestSerializer(serializers.Serializer):
    format = serializers.ChoiceField(choices=["csv", "json"], default="csv")

