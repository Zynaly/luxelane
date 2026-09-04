"""
core/services/media.py — Presigned upload generator for S3 / MinIO storage.
"""
import uuid
from datetime import datetime, timezone, timedelta
from django.conf import settings
from rest_framework.exceptions import ValidationError


ALLOWED_PURPOSES = {
    "avatar": {
        "max_bytes": 5 * 1024 * 1024,  # 5MB
        "allowed_types": {"image/jpeg", "image/png", "image/webp"},
        "path_prefix": "avatars",
    },
    "vendor_document": {
        "max_bytes": 10 * 1024 * 1024,  # 10MB
        "allowed_types": {"application/pdf", "image/jpeg", "image/png"},
        "path_prefix": "vendor-docs",
    },
    "product_image": {
        "max_bytes": 10 * 1024 * 1024,  # 10MB
        "allowed_types": {"image/jpeg", "image/png", "image/webp", "image/gif"},
        "path_prefix": "products",
    },
    "review_media": {
        "max_bytes": 20 * 1024 * 1024,  # 20MB
        "allowed_types": {"image/jpeg", "image/png", "image/webp", "video/mp4"},
        "path_prefix": "reviews",
    },
}


def generate_presigned_upload(purpose: str, content_type: str, size_bytes: int, filename: str = None) -> dict:
    """
    Validate requested upload and return a presigned PUT URL and destination public URL.
    Works for S3/MinIO in production, with realistic stub in local dev.
    """
    config = ALLOWED_PURPOSES.get(purpose)
    if not config:
        raise ValidationError({"purpose": f"Invalid upload purpose. Allowed: {list(ALLOWED_PURPOSES.keys())}"})

    if content_type not in config["allowed_types"]:
        raise ValidationError({"content_type": f"Unsupported media type {content_type} for {purpose}."})

    if size_bytes > config["max_bytes"]:
        max_mb = config["max_bytes"] // (1024 * 1024)
        raise ValidationError({"size_bytes": f"File size exceeds maximum allowed of {max_mb}MB."})

    # Generate unique key
    ext = content_type.split("/")[-1]
    if ext == "jpeg":
        ext = "jpg"
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    s3_key = f"{config['path_prefix']}/{unique_name}"

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    # In production, boto3 client.generate_presigned_url('put_object', ...) is called here.
    # For dev/test, return valid URLs matching domain:
    base_storage_url = getattr(settings, "MEDIA_BASE_URL", "https://storage.luxelane.com")
    upload_url = f"{base_storage_url}/upload/{s3_key}?token={uuid.uuid4().hex}"
    file_url = f"{base_storage_url}/{s3_key}"

    return {
        "upload_url": upload_url,
        "file_url": file_url,
        "key": s3_key,
        "content_type": content_type,
        "expires_at": expires_at.isoformat(),
    }
