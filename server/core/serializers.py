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
