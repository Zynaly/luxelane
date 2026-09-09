"""
orders/services/orchestration.py — Core Checkout and Order Placement Orchestration Engine.

Handles:
- Idempotency validation & replay
- Cart and price snapshot verification
- RateQuote validation and redemption
- Multi-warehouse inventory reservation hold
- Multi-vendor order tree creation with frozen commissions
- Gateway payment execution (FakeGateway)
- Reservation commitment on payment success
- Invoice generation and OutboxEvent emission
"""
import logging
import uuid
from decimal import Decimal
from datetime import timedelta
from typing import Dict, Any, Optional

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Address
from cart_and_pricing.models import Cart
from cart_and_pricing.services import cart as cart_service
from cart_and_pricing.services import pricing as pricing_service
from orders.models import (
    Order,
    VendorOrder,
    OrderItem,
    OrderStatus,
    VendorOrderStatus,
    OrderItemFulfilmentStatus,
    OrderStatusHistory,
    Invoice,
    IdempotencyKey,
    OutboxEvent,
)
from payments.gateways.fake import FakeGateway
from shipping.models import RateQuote
from vendors.models import CommissionRule
from warehouse.models import Inventory
from warehouse.services import reservation as reservation_service

logger = logging.getLogger(__name__)


def calculate_vendor_commission(vendor, category, amount: Decimal) -> tuple[Decimal, Decimal]:
    """
    Returns (commission_pct, commission_amount) using CommissionRule hierarchy:
    1. Vendor-specific rule
    2. Platform default rule
    3. 10% standard fallback
    """
    rule = CommissionRule.objects.filter(vendor=vendor, is_active=True).first()
    if not rule:
        rule = CommissionRule.objects.filter(vendor__isnull=True, is_active=True).first()

    rate_pct = rule.rate_pct if rule else Decimal("10.00")
    commission_amount = (amount * (rate_pct / Decimal("100.00"))).quantize(Decimal("0.01"))
    return rate_pct, commission_amount


def place_order(
    cart: Cart,
    shipping_address_data: Dict[str, Any],
    rate_quote_id: str,
    user=None,
    billing_address_data: Optional[Dict[str, Any]] = None,
    shipping_address_id: Optional[str] = None,
    billing_address_id: Optional[str] = None,
    guest_email: str = "",
    guest_phone: str = "",
    payment_method: str = "fake",
    idempotency_key: Optional[str] = None,
    endpoint: str = "/api/v1/checkout/place-order/",
) -> Dict[str, Any]:
    """
    The central checkout orchestration pipeline.
    """
    # 1. Idempotency Check & Replay
    if idempotency_key:
        cached_key = IdempotencyKey.objects.filter(
            key=idempotency_key,
            expires_at__gt=timezone.now(),
        ).first()
        if cached_key:
            logger.info(f"Replaying cached order response for idempotency key {idempotency_key}")
            return cached_key.response_snapshot

    # 2. Cart Validation
    if not cart or not cart.items.exists():
        raise ValidationError({"cart": "Cannot place order with an empty shopping bag."})

    val_result = cart_service.validate_cart(cart)
    if not val_result.get("is_valid", False):
        issues = val_result.get("issues", [])
        raise ValidationError({
            "cart": "Your shopping bag has changed or has stock issues. Please review your bag.",
            "issues": issues,
        })

    # 3. Rate Quote Verification
    rate_quote = RateQuote.objects.filter(quote_id=rate_quote_id).first()
    if not rate_quote or rate_quote.is_expired:
        raise ValidationError({"rate_quote_id": "The selected shipping rate quote is invalid or expired."})

    if rate_quote.redeemed:
        raise ValidationError({"rate_quote_id": "The selected shipping rate quote has already been redeemed."})

    # 4. Server-side Financials Calculation (Never trust client prices)
    auth_user = user if (user and user.is_authenticated) else None
    breakdown = pricing_service.calculate(cart, user=auth_user)

    subtotal = Decimal(str(breakdown["subtotal"]))
    discount_total = Decimal(str(breakdown["discount_total"]))
    tax_total = Decimal(str(breakdown["tax_total"]))
    shipping_total = rate_quote.amount
    grand_total = (subtotal - discount_total + shipping_total + tax_total).quantize(Decimal("0.01"))

    # 5. Resolve Addresses & Snapshots
    shipping_addr_obj = None
    if shipping_address_id:
        shipping_addr_obj = Address.objects.filter(id=shipping_address_id).first()

    billing_addr_obj = None
    if billing_address_id:
        billing_addr_obj = Address.objects.filter(id=billing_address_id).first()

    ship_snap = {
        "line1": shipping_address_data.get("line1") or (shipping_addr_obj.line1 if shipping_addr_obj else ""),
        "line2": shipping_address_data.get("line2") or (shipping_addr_obj.line2 if shipping_addr_obj else ""),
        "city": shipping_address_data.get("city") or (shipping_addr_obj.city if shipping_addr_obj else ""),
        "state": shipping_address_data.get("state") or (shipping_addr_obj.state if shipping_addr_obj else ""),
        "country": shipping_address_data.get("country") or (shipping_addr_obj.country if shipping_addr_obj else "US"),
        "postal_code": shipping_address_data.get("postal_code") or (shipping_addr_obj.postal_code if shipping_addr_obj else ""),
    }
    bill_snap = billing_address_data or ship_snap

    is_guest = not (user and user.is_authenticated)
    effective_email = (user.email if (user and user.is_authenticated) else guest_email) or ""
    user_phone = getattr(user, "phone", "") or getattr(user, "phone_number", "") or ""
    effective_phone = (guest_phone or user_phone or "")
    if effective_phone is None:
        effective_phone = ""
    if effective_email is None:
        effective_email = ""

    if is_guest and not effective_email:
        raise ValidationError({"guest_email": "An email address is required for guest checkout."})

    # 6. Smart Allocation & Atomic Inventory Reservation
    created_reservations = []
    item_allocations = {}  # cart_item.id -> (Inventory, Warehouse)

    try:
        cart_items = list(cart.items.select_related("variant", "variant__product", "variant__product__vendor"))
        for item in cart_items:
            # Find candidate warehouse with available stock
            candidate_inv = (
                Inventory.objects.filter(
                    variant=item.variant,
                    warehouse__is_active=True,
                )
                .select_related("warehouse")
                .first()
            )

            if not candidate_inv or candidate_inv.available < item.quantity:
                # Fallback to any inventory record for this variant
                candidate_inv = Inventory.objects.filter(variant=item.variant).select_related("warehouse").first()

            if not candidate_inv or candidate_inv.available < item.quantity:
                raise ValidationError({
                    "stock": f"Insufficient available stock for item '{item.variant.product.title}' ({item.variant.sku})."
                })

            res = reservation_service.reserve(
                inventory=candidate_inv,
                quantity=item.quantity,
                cart_item_id=item.id,
            )
            created_reservations.append(res)
            item_allocations[item.id] = (candidate_inv, candidate_inv.warehouse)

    except Exception as exc:
        # Release any reservations created so far
        for res in created_reservations:
            try:
                reservation_service.release(res, reason="Checkout reservation aborted")
            except Exception:
                pass
        if isinstance(exc, ValidationError):
            raise exc
        logger.error(f"Failed to reserve inventory during checkout: {exc}")
        raise ValidationError({"error": "Unable to lock atelier inventory for order. Please try again."})

    # 7. Atomic Database Transaction: Order Tree Creation
    try:
        with transaction.atomic():
            order_number = Order.generate_order_number()

            order = Order.objects.create(
                customer=auth_user,
                order_number=order_number,
                shipping_address=shipping_addr_obj,
                billing_address=billing_addr_obj or shipping_addr_obj,
                shipping_address_snapshot=ship_snap,
                billing_address_snapshot=bill_snap,
                currency="USD",
                subtotal=subtotal,
                discount_total=discount_total,
                shipping_total=shipping_total,
                tax_total=tax_total,
                grand_total=grand_total,
                status=OrderStatus.PENDING_PAYMENT,
                coupon=cart.applied_coupon,
                is_guest_order=is_guest,
                guest_email=effective_email,
                guest_phone=effective_phone,
            )

            # Group items by Vendor
            vendor_groups: Dict[Any, list] = {}
            for item in cart_items:
                v = item.variant.product.vendor
                vendor_groups.setdefault(v, []).append(item)

            # Distribute shipping proportionally or evenly among vendor orders
            num_vendors = len(vendor_groups)
            per_vendor_shipping = (shipping_total / Decimal(str(num_vendors))).quantize(Decimal("0.01"))

            created_order_items = []
            for vendor, v_items in vendor_groups.items():
                v_subtotal = sum(Decimal(str(it.line_subtotal)) for it in v_items)
                comm_pct, comm_amt = calculate_vendor_commission(
                    vendor=vendor,
                    category=v_items[0].variant.product.category,
                    amount=v_subtotal,
                )
                v_net = (v_subtotal - comm_amt).quantize(Decimal("0.01"))

                vendor_order = VendorOrder.objects.create(
                    order=order,
                    vendor=vendor,
                    subtotal=v_subtotal,
                    shipping_amount=per_vendor_shipping,
                    commission_amount=comm_amt,
                    vendor_net_amount=v_net,
                    commission_pct_applied=comm_pct,
                    status=VendorOrderStatus.PENDING,
                )

                for item in v_items:
                    inv, warehouse = item_allocations[item.id]
                    order_item = OrderItem.objects.create(
                        vendor_order=vendor_order,
                        variant=item.variant,
                        warehouse=warehouse,
                        quantity=item.quantity,
                        unit_price=item.price_snapshot,
                        line_subtotal=item.line_subtotal,
                        product_title_snapshot=item.variant.product.title,
                        variant_sku_snapshot=item.variant.sku,
                        fulfilment_status=OrderItemFulfilmentStatus.ALLOCATED,
                    )
                    created_order_items.append(order_item)

            # Initial Status History
            OrderStatusHistory.objects.create(
                order=order,
                from_status="",
                to_status=OrderStatus.PENDING_PAYMENT,
                changed_by=auth_user,
                note="Order initialized via checkout orchestration.",
            )

            # Mark rate quote as redeemed
            rate_quote.redeemed = True
            rate_quote.save(update_fields=["redeemed", "updated_at"])

            # Mark Cart as converted
            cart.status = "converted"
            cart.save(update_fields=["status", "updated_at"])

            # 8. Payment Processing Execution (FakeGateway / Provider)
            gateway = FakeGateway()
            charge_result = gateway.charge(
                amount=int(grand_total * 100),
                currency="USD",
                payment_method_id="fake_card",
                order_id=order.order_number,
            )

            if not charge_result.success:
                raise ValidationError({"payment": f"Payment authorization failed: {charge_result.error_message}"})

            # 9. Commit on Payment Success
            order.status = OrderStatus.CONFIRMED
            order.save(update_fields=["status", "updated_at"])

            for vo in order.vendor_orders.all():
                vo.status = VendorOrderStatus.CONFIRMED
                vo.save(update_fields=["status", "updated_at"])

            # Transition reservations to COMMITTED
            for res in created_reservations:
                reservation_service.commit(res)

            # Audit status history transition
            OrderStatusHistory.objects.create(
                order=order,
                from_status=OrderStatus.PENDING_PAYMENT,
                to_status=OrderStatus.CONFIRMED,
                changed_by=auth_user,
                note=f"Payment succeeded ({charge_result.gateway_transaction_id}). Order confirmed.",
            )

            # Generate Invoice
            inv_number = Invoice.generate_invoice_number(order.order_number)
            Invoice.objects.create(
                order=order,
                invoice_number=inv_number,
                pdf_url=f"/api/v1/orders/{order.id}/invoice/pdf/",
            )

            # Emit OutboxEvent for asynchronous downstream integrations
            OutboxEvent.objects.create(
                event_type="order.placed",
                payload={
                    "order_id": str(order.id),
                    "order_number": order.order_number,
                    "customer_email": effective_email,
                    "grand_total": str(order.grand_total),
                    "placed_at": order.placed_at.isoformat(),
                },
            )

    except Exception as exc:
        # Release inventory holds on failure
        for res in created_reservations:
            try:
                reservation_service.release(res, reason="Order transaction failed")
            except Exception:
                pass
        raise exc

    # 10. Build Response Snapshot
    response_data = {
        "id": str(order.id),
        "order_number": order.order_number,
        "status": order.status,
        "grand_total": str(order.grand_total),
        "placed_at": order.placed_at.isoformat(),
        "item_count": sum(it.quantity for it in cart_items),
        "invoice_number": inv_number,
        "shipping_carrier": rate_quote.carrier.name,
        "shipping_service": rate_quote.service_level,
    }

    # 11. Idempotency Persistence
    if idempotency_key:
        IdempotencyKey.objects.create(
            key=idempotency_key,
            user=auth_user,
            endpoint=endpoint,
            response_snapshot=response_data,
            status_code=201,
            expires_at=timezone.now() + timedelta(hours=24),
        )

    return response_data
