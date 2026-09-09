"""
catalog/tasks.py — Sprint 4: Celery tasks for bulk product import.
"""
import csv
import io
import logging
from decimal import Decimal, InvalidOperation

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def process_bulk_import(self, job_id: str):
    """
    Celery task: reads CSV data stored in BulkImportJob, creates products.

    CSV expected columns (all strings):
      title, description, base_price, category_slug, brand_slug (optional),
      sku (unused in S4 — logged for tracking), tags (comma-separated)

    Updates BulkImportJob.status, processed_rows, result_json.
    """
    from catalog.models import (
        BulkImportJob, BulkImportJobStatus, Product, ProductStatus,
        Category, Brand, ProductTag,
    )
    import re

    try:
        job = BulkImportJob.objects.get(job_id=job_id)
    except BulkImportJob.DoesNotExist:
        logger.error("BulkImportJob %s not found", job_id)
        return

    job.status = BulkImportJobStatus.PROCESSING
    job.save(update_fields=["status", "updated_at"])

    results = []
    processed = 0

    try:
        csv_text = job.result_json  # raw CSV stored as string in result_json during upload stub
        if isinstance(csv_text, str):
            rows = list(csv.DictReader(io.StringIO(csv_text)))
        else:
            rows = csv_text  # already parsed list (from test/mock)

        job.total_rows = len(rows)
        job.save(update_fields=["total_rows", "updated_at"])

        for i, row in enumerate(rows, start=1):
            row_errors = []
            title = (row.get("title") or "").strip()
            description = (row.get("description") or "").strip()
            price_str = (row.get("base_price") or "").strip()
            category_slug = (row.get("category_slug") or "").strip()
            brand_slug = (row.get("brand_slug") or "").strip()
            sku = (row.get("sku") or "").strip()
            tags_raw = (row.get("tags") or "").strip()

            # Validate required fields
            if not title:
                row_errors.append("title is required")
            try:
                base_price = Decimal(price_str)
                if base_price < 0:
                    row_errors.append("base_price must be non-negative")
            except (InvalidOperation, ValueError):
                base_price = None
                row_errors.append(f"base_price '{price_str}' is invalid")

            category = None
            if category_slug:
                try:
                    category = Category.objects.get(slug=category_slug, is_deleted=False)
                except Category.DoesNotExist:
                    row_errors.append(f"category_slug '{category_slug}' not found")
            else:
                row_errors.append("category_slug is required")

            brand = None
            if brand_slug:
                try:
                    brand = Brand.objects.get(slug=brand_slug, is_deleted=False)
                except Brand.DoesNotExist:
                    row_errors.append(f"brand_slug '{brand_slug}' not found (skipping brand)")

            if row_errors:
                results.append({"row_number": i, "sku": sku, "status": "error", "errors": row_errors})
                processed += 1
                job.processed_rows = processed
                job.save(update_fields=["processed_rows", "updated_at"])
                continue

            # Generate unique slug
            slug_base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
            slug = slug_base
            counter = 1
            while Product.objects.filter(slug=slug).exists():
                slug = f"{slug_base}-{counter}"
                counter += 1

            product = Product.objects.create(
                vendor=job.vendor,
                category=category,
                brand=brand,
                title=title,
                slug=slug,
                description=description,
                base_price=base_price,
                status=ProductStatus.PENDING_REVIEW,
            )

            # Create tags
            for tag in tags_raw.split(","):
                tag = tag.strip().lower()
                if tag:
                    ProductTag.objects.get_or_create(product=product, tag=tag)

            results.append({"row_number": i, "sku": sku, "status": "success", "errors": []})
            processed += 1
            job.processed_rows = processed
            job.save(update_fields=["processed_rows", "updated_at"])

        job.status = BulkImportJobStatus.DONE
        job.result_json = results
        job.save(update_fields=["status", "result_json", "updated_at"])

    except Exception as exc:
        logger.exception("BulkImport job %s failed: %s", job_id, exc)
        job.status = BulkImportJobStatus.FAILED
        job.error_message = str(exc)
        job.result_json = results
        job.save(update_fields=["status", "error_message", "result_json", "updated_at"])
        raise self.retry(exc=exc, countdown=30)
