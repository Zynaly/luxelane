"""
cart_and_pricing/services/cart.py — Cart lifecycle, session resolution, merging and validation.
"""
import uuid
from decimal import Decimal
from django.db import transaction
from django.utils.crypto import get_random_string

from cart_and_pricing.models import Cart, CartItem, CartStatus
from warehouse.models import Inventory


def get_or_create_cart(request) -> Cart:
    """
    Resolves the active cart for the incoming request:
    1. Authenticated user -> Cart(user=request.user, status=active)
    2. Guest user -> Cart(session_key=..., user=None, status=active)
    """
    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        cart = Cart.objects.filter(user=user, status=CartStatus.ACTIVE).first()
        if not cart:
            cart = Cart.objects.create(user=user, status=CartStatus.ACTIVE)
        return cart

    # Guest user: resolve from header or Django session
    session_key = request.headers.get("X-Session-Key")
    if not session_key and hasattr(request, "session"):
        if not request.session.session_key:
            request.session.create()
        session_key = request.session.session_key

    if not session_key:
        session_key = get_random_string(32)

    cart = Cart.objects.filter(session_key=session_key, user=None, status=CartStatus.ACTIVE).first()
    if not cart:
        cart = Cart.objects.create(session_key=session_key, user=None, status=CartStatus.ACTIVE)
    return cart


def merge_carts(guest_cart: Cart, user_cart: Cart) -> Cart:
    """
    Merges guest cart items into an authenticated user's cart post-login.
    Marks the guest cart as CONVERTED.
    """
    if guest_cart.id == user_cart.id:
        return user_cart

    with transaction.atomic():
        guest_items = list(guest_cart.items.select_related("variant").all())

        for g_item in guest_items:
            existing_user_item = user_cart.items.filter(variant=g_item.variant).first()
            if existing_user_item:
                existing_user_item.quantity += g_item.quantity
                existing_user_item.save(update_fields=["quantity", "updated_at"])
                g_item.delete()
            else:
                g_item.cart = user_cart
                g_item.save(update_fields=["cart", "updated_at"])

        # Retain coupon if user cart had none
        if guest_cart.applied_coupon and not user_cart.applied_coupon:
            user_cart.applied_coupon = guest_cart.applied_coupon
            user_cart.save(update_fields=["applied_coupon", "updated_at"])

        guest_cart.status = CartStatus.CONVERTED
        guest_cart.save(update_fields=["status", "updated_at"])

    return user_cart


def validate_cart(cart: Cart) -> dict:
    """
    Validates cart line items prior to checkout:
    - Price changes (current variant.price vs price_snapshot)
    - Available stock availability across network
    - Inactive product or variant status
    """
    items = list(cart.items.select_related("variant", "variant__product").all())
    issues = []

    for itm in items:
        v = itm.variant
        p = getattr(v, "product", None)

        # 1. Product or variant active status
        if not v.is_active or not (p and p.is_active):
            issues.append({
                "item_id": str(itm.id),
                "variant_id": str(v.id),
                "issue_type": "product_inactive",
                "message": f"'{p.title if p else v.sku}' is no longer active or available.",
            })
            continue

        # 2. Price drift detection
        current_price = Decimal(str(v.price))
        snapshot_price = Decimal(str(itm.price_snapshot))
        if current_price != snapshot_price:
            issues.append({
                "item_id": str(itm.id),
                "variant_id": str(v.id),
                "issue_type": "price_changed",
                "message": f"Price for '{p.title}' changed from ${snapshot_price} to ${current_price}.",
                "old_price": str(snapshot_price),
                "new_price": str(current_price),
            })

        # 3. Network inventory availability check
        invs = Inventory.objects.filter(variant=v, is_deleted=False, warehouse__is_active=True)
        total_available = sum((max(0, inv.on_hand - inv.reserved_cache) for inv in invs), 0)

        if total_available < itm.quantity:
            issues.append({
                "item_id": str(itm.id),
                "variant_id": str(v.id),
                "issue_type": "out_of_stock",
                "message": f"Insufficient stock for '{v.sku}'. Requested: {itm.quantity}, Available: {total_available}.",
                "requested": itm.quantity,
                "available": total_available,
            })

    return {
        "is_valid": len(issues) == 0,
        "issues": issues,
    }
