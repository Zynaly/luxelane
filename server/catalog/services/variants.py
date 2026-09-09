"""
catalog/services/variants.py — Cartesian product generator for product variants.
"""
import itertools
from decimal import Decimal
from django.db import transaction
from django.utils.text import slugify

from catalog.models import (
    Product,
    ProductVariant,
    ProductAttributeValue,
    ProductVariantAttribute,
)


def generate_variant_matrix(
    product: Product,
    attribute_groups: list[list[str]],
    base_price: Decimal | None = None,
    sku_prefix: str | None = None,
) -> list[ProductVariant]:
    """
    Generates a Cartesian matrix of ProductVariants from selected attribute values.
    
    :param product: The parent Product instance.
    :param attribute_groups: A list of value ID lists grouped by attribute,
                             e.g. [[color_1, color_2], [size_1, size_2, size_3]]
    :param base_price: Default price for the new variants (defaults to product.base_price)
    :param sku_prefix: Custom prefix for generated SKUs.
    :return: List of created ProductVariant instances.
    """
    if not attribute_groups:
        return []

    # Clean empty lists
    valid_groups = [g for g in attribute_groups if g]
    if not valid_groups:
        return []

    # Retrieve all attribute values efficiently
    flat_ids = [val_id for group in valid_groups for val_id in group]
    values_by_id = {
        str(v.id): v
        for v in ProductAttributeValue.objects.filter(id__in=flat_ids).select_related("attribute")
    }

    # Verify each group has valid objects
    resolved_groups = []
    for g in valid_groups:
        resolved = [values_by_id[str(val_id)] for val_id in g if str(val_id) in values_by_id]
        if resolved:
            resolved_groups.append(resolved)

    if not resolved_groups:
        return []

    price = base_price if base_price is not None else product.base_price

    # Generate SKU prefix
    if not sku_prefix:
        vendor_slug = getattr(product.vendor, "slug", "VEND")[:4].upper()
        prod_slug = product.slug[:6].upper()
        sku_prefix = f"{vendor_slug}-{prod_slug}"

    combinations = list(itertools.product(*resolved_groups))
    created_variants = []

    with transaction.atomic():
        # Get existing SKUs for this product to prevent collisions
        existing_skus = set(
            ProductVariant.objects.filter(product=product).values_list("sku", flat=True)
        )

        for combo in combinations:
            # Build slug suffix from attribute values: e.g. "NAVY-XL"
            combo_parts = [slugify(val.value).upper()[:8] for val in combo]
            suffix = "-".join(combo_parts)
            raw_sku = f"{sku_prefix}-{suffix}"[:64]

            # Ensure SKU uniqueness
            sku = raw_sku
            counter = 1
            while sku in existing_skus:
                sku = f"{raw_sku[:58]}-{counter}"
                counter += 1
            existing_skus.add(sku)

            variant = ProductVariant.objects.create(
                product=product,
                sku=sku,
                price=price,
                is_active=True,
            )

            for val in combo:
                ProductVariantAttribute.objects.create(
                    variant=variant,
                    attribute_value=val,
                )

            created_variants.append(variant)

    return created_variants
