"""
orders/models.py — Sprint 10 Models: Order, VendorOrder, OrderItem, OrderStatusHistory, Cancellation, Invoice, IdempotencyKey, OutboxEvent.
"""
from decimal import Decimal
import uuid
from django.db import models
from django.utils import timezone
from core.models import BaseModel


# ── Status Choices ────────────────────────────────────────────────────────────

class OrderStatus(models.TextChoices):
    PENDING_PAYMENT     = "pending_payment",     "Pending Payment"
    CONFIRMED           = "confirmed",           "Confirmed"
    PARTIALLY_SHIPPED   = "partially_shipped",   "Partially Shipped"
    SHIPPED             = "shipped",             "Shipped"
    PARTIALLY_DELIVERED = "partially_delivered", "Partially Delivered"
    DELIVERED           = "delivered",           "Delivered"
    CANCELLED           = "cancelled",           "Cancelled"
    REFUNDED            = "refunded",            "Refunded"


class VendorOrderStatus(models.TextChoices):
    PENDING          = "pending",          "Pending"
    CONFIRMED        = "confirmed",        "Confirmed"
    PACKED           = "packed",           "Packed"
    SHIPPED          = "shipped",          "Shipped"
    DELIVERED        = "delivered",        "Delivered"
    CANCELLED        = "cancelled",        "Cancelled"
    RETURN_REQUESTED = "return_requested", "Return Requested"
    REFUNDED         = "refunded",         "Refunded"


class OrderItemFulfilmentStatus(models.TextChoices):
    PENDING   = "pending",   "Pending"
    ALLOCATED = "allocated", "Allocated"
    PACKED    = "packed",    "Packed"
    SHIPPED   = "shipped",   "Shipped"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"
    RETURNED  = "returned",  "Returned"


# ── Core Order Models ─────────────────────────────────────────────────────────

class Order(BaseModel):
    """Platform master order representing a customer purchase across one or multiple vendors."""
    customer = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
        help_text="Null for guest checkout"
    )
    order_number = models.CharField(max_length=64, unique=True, db_index=True)
    shipping_address = models.ForeignKey(
        "accounts.Address",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+"
    )
    billing_address = models.ForeignKey(
        "accounts.Address",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+"
    )
    shipping_address_snapshot = models.JSONField(default=dict, blank=True)
    billing_address_snapshot = models.JSONField(default=dict, blank=True)

    currency = models.CharField(max_length=3, default="USD")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    shipping_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    status = models.CharField(
        max_length=30,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING_PAYMENT,
        db_index=True
    )
    placed_at = models.DateTimeField(auto_now_add=True)
    coupon = models.ForeignKey(
        "cart_and_pricing.Coupon",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders"
    )

    is_guest_order = models.BooleanField(default=False)
    guest_email = models.EmailField(blank=True, default="")
    guest_phone = models.CharField(max_length=30, blank=True, default="")

    class Meta:
        verbose_name = "Order"
        verbose_name_plural = "Orders"
        ordering = ["-placed_at"]
        indexes = [
            models.Index(fields=["status", "placed_at"]),
            models.Index(fields=["guest_email"]),
        ]

    def __str__(self):
        return f"Order {self.order_number} ({self.status})"

    @classmethod
    def generate_order_number(cls) -> str:
        date_str = timezone.now().strftime("%Y%m%d")
        rand_suffix = uuid.uuid4().hex[:6].upper()
        return f"ORD-{date_str}-{rand_suffix}"


class VendorOrder(BaseModel):
    """Vendor-scoped fulfillment sub-order. Orders with items from multiple vendors split into separate VendorOrders."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="vendor_orders")
    vendor = models.ForeignKey("vendors.Vendor", on_delete=models.PROTECT, related_name="vendor_orders")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    shipping_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    vendor_net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    commission_pct_applied = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))

    status = models.CharField(
        max_length=30,
        choices=VendorOrderStatus.choices,
        default=VendorOrderStatus.PENDING,
        db_index=True
    )
    escrow_hold_id = models.UUIDField(null=True, blank=True, help_text="Reference to Sprint 12 EscrowHold")

    class Meta:
        verbose_name = "Vendor Order"
        verbose_name_plural = "Vendor Orders"
        ordering = ["-created_at"]

    def __str__(self):
        return f"VO-{self.vendor.display_name} for {self.order.order_number} ({self.status})"


class OrderItem(BaseModel):
    """Individual line item allocated to a specific warehouse and fulfillment queue."""
    vendor_order = models.ForeignKey(VendorOrder, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.ProductVariant", on_delete=models.PROTECT, related_name="order_items")
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="allocated_order_items"
    )
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    line_subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    product_title_snapshot = models.CharField(max_length=255, blank=True, default="")
    variant_sku_snapshot = models.CharField(max_length=100, blank=True, default="")

    fulfilment_status = models.CharField(
        max_length=30,
        choices=OrderItemFulfilmentStatus.choices,
        default=OrderItemFulfilmentStatus.PENDING,
        db_index=True
    )

    class Meta:
        verbose_name = "Order Item"
        verbose_name_plural = "Order Items"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.quantity}x {self.variant_sku_snapshot} ({self.fulfilment_status})"


class OrderStatusHistory(BaseModel):
    """Immutable audit trail for order and vendor sub-order lifecycle status changes."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_history")
    vendor_order = models.ForeignKey(
        VendorOrder,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="status_history"
    )
    from_status = models.CharField(max_length=50)
    to_status = models.CharField(max_length=50)
    changed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+"
    )
    note = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Order Status History"
        verbose_name_plural = "Order Status Histories"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.order.order_number}: {self.from_status} -> {self.to_status}"


class Cancellation(BaseModel):
    """Record of an order item cancellation request with reason and refund tracking."""
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name="cancellations")
    reason = models.TextField()
    cancelled_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+"
    )
    refund_reference = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        verbose_name = "Order Item Cancellation"
        verbose_name_plural = "Order Item Cancellations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Cancellation for Item {self.order_item.id}: {self.reason[:40]}"


class Invoice(BaseModel):
    """Customer invoice receipt generated post-checkout."""
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="invoice")
    invoice_number = models.CharField(max_length=64, unique=True, db_index=True)
    pdf_url = models.URLField(blank=True, default="")

    class Meta:
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"

    def __str__(self):
        return f"{self.invoice_number} for {self.order.order_number}"

    @classmethod
    def generate_invoice_number(cls, order_number: str) -> str:
        return f"INV-{order_number.replace('ORD-', '')}"


# ── Idempotency & Transactional Outbox (No Soft-Delete) ───────────────────────

class IdempotencyKey(models.Model):
    """Prevents duplicate financial charges and duplicate order placements within 24 hours."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    key = models.CharField(max_length=255, unique=True, db_index=True)
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+"
    )
    endpoint = models.CharField(max_length=255)
    response_snapshot = models.JSONField()
    status_code = models.IntegerField(default=200)
    expires_at = models.DateTimeField()

    class Meta:
        verbose_name = "Idempotency Key"
        verbose_name_plural = "Idempotency Keys"
        indexes = [
            models.Index(fields=["key", "expires_at"]),
        ]

    def __str__(self):
        return f"IdempotencyKey({self.key})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at


class OutboxEvent(models.Model):
    """Reliable event publishing pattern for downstream asynchronous consumers."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    event_type = models.CharField(max_length=100, db_index=True)
    payload = models.JSONField()
    status = models.CharField(
        max_length=20,
        default="pending",
        choices=[("pending", "Pending"), ("published", "Published"), ("failed", "Failed")],
        db_index=True
    )
    published_at = models.DateTimeField(null=True, blank=True)
    retry_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Outbox Event"
        verbose_name_plural = "Outbox Events"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event_type} ({self.status})"
