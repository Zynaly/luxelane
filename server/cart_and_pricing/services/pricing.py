"""
cart_and_pricing/services/pricing.py — Real-time price breakdown and discount calculation engine.
"""
from decimal import Decimal
from django.utils import timezone
from cart_and_pricing.models import Cart, DiscountType, CouponScope, TaxRate, TaxRule


def calculate(cart: Cart, shipping_address=None, user=None) -> dict:
    """
    Computes real-time financial breakdown for a shopping cart:
    - subtotal from item line totals
    - coupon discount evaluation based on dates, caps, min cart value, and scopes
    - destination tax rates with category rule overrides
    - final grand total
    """
    items = list(
        cart.items.select_related(
            "variant",
            "variant__product",
            "variant__product__category",
            "variant__product__vendor",
        ).all()
    )

    subtotal = sum((item.line_subtotal for item in items), Decimal("0.00"))
    discount_total = Decimal("0.00")
    applied_coupon = cart.applied_coupon

    now = timezone.now()
    eval_user = user or cart.user

    # ── Evaluate Coupon ───────────────────────────────────────────────────────
    if applied_coupon and applied_coupon.is_active:
        is_valid = True

        # Date validity window
        if applied_coupon.valid_from > now or applied_coupon.valid_to < now:
            is_valid = False

        # Min cart subtotal requirement
        if is_valid and applied_coupon.min_cart_value and subtotal < applied_coupon.min_cart_value:
            is_valid = False

        # Global usage limit
        if is_valid and applied_coupon.usage_limit_total is not None:
            if applied_coupon.usages.count() >= applied_coupon.usage_limit_total:
                is_valid = False

        # Per-user usage limit
        if is_valid and eval_user and applied_coupon.usage_limit_per_user is not None:
            user_usages = applied_coupon.usages.filter(user=eval_user).count()
            if user_usages >= applied_coupon.usage_limit_per_user:
                is_valid = False

        if is_valid:
            # Determine eligible subtotal based on scope
            eligible_subtotal = Decimal("0.00")

            if applied_coupon.scope == CouponScope.ALL:
                eligible_subtotal = subtotal

            elif applied_coupon.scope == CouponScope.CATEGORY:
                for itm in items:
                    cat_id = getattr(itm.variant.product, "category_id", None)
                    if cat_id and str(cat_id) == str(applied_coupon.scope_target_id):
                        eligible_subtotal += itm.line_subtotal

            elif applied_coupon.scope == CouponScope.PRODUCT:
                for itm in items:
                    if str(itm.variant.product_id) == str(applied_coupon.scope_target_id):
                        eligible_subtotal += itm.line_subtotal

            elif applied_coupon.scope == CouponScope.VENDOR:
                for itm in items:
                    ven_id = getattr(itm.variant.product, "vendor_id", None)
                    if ven_id and str(ven_id) == str(applied_coupon.scope_target_id):
                        eligible_subtotal += itm.line_subtotal

            if eligible_subtotal > Decimal("0.00"):
                if applied_coupon.discount_type == DiscountType.PERCENT:
                    calc_disc = (eligible_subtotal * applied_coupon.discount_value) / Decimal("100.00")
                    discount_total = round(calc_disc, 2)
                else:  # FIXED
                    discount_total = min(eligible_subtotal, applied_coupon.discount_value)

    discount_total = min(subtotal, discount_total)

    # ── Tax Rate Resolution ───────────────────────────────────────────────────
    tax_total = Decimal("0.00")
    tax_rate_pct = Decimal("0.00")

    if shipping_address:
        country = getattr(shipping_address, "country", "") or ""
        state = getattr(shipping_address, "state", "") or ""

        # Exact match (country + state)
        matched_rate = TaxRate.objects.filter(country__iexact=country, state__iexact=state, is_deleted=False).first()
        if not matched_rate:
            # Country-level fallback
            matched_rate = TaxRate.objects.filter(country__iexact=country, state="", is_deleted=False).first()

        if matched_rate:
            tax_rate_pct = matched_rate.rate_pct

            # Calculate item by item to support category TaxRule overrides
            taxable_ratio = (subtotal - discount_total) / subtotal if subtotal > Decimal("0.00") else Decimal("1.00")

            for itm in items:
                cat_override = TaxRule.objects.filter(
                    category=getattr(itm.variant.product, "category", None),
                    is_deleted=False,
                ).select_related("tax_rate").first()

                effective_pct = cat_override.tax_rate.rate_pct if cat_override else tax_rate_pct
                item_taxable = itm.line_subtotal * taxable_ratio
                tax_total += round((item_taxable * effective_pct) / Decimal("100.00"), 2)

    shipping_total = Decimal("0.00")
    grand_total = max(Decimal("0.00"), subtotal - discount_total + tax_total + shipping_total)

    return {
        "subtotal": str(subtotal),
        "discount_total": str(discount_total),
        "tax_total": str(tax_total),
        "tax_rate_pct": str(tax_rate_pct),
        "shipping_total": str(shipping_total),
        "grand_total": str(grand_total),
        "currency": "USD",
        "applied_coupon_code": applied_coupon.code if (applied_coupon and discount_total > Decimal("0.00")) else None,
        "item_count": sum((i.quantity for i in items), 0),
    }
