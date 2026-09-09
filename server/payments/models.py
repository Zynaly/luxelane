import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from core.models import BaseModel


class PaymentGateway(models.TextChoices):
    STRIPE = "stripe", "Stripe"
    AUTHORIZE_NET = "authorize_net", "Authorize.Net"
    FAKE = "fake", "FakeGateway (Sandbox)"
    COD = "cod", "Cash on Delivery"


class PaymentAttemptStatus(models.TextChoices):
    INITIATED = "initiated", "Initiated"
    REQUIRES_ACTION = "requires_action", "Requires Action (3DS)"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled"


class TransactionType(models.TextChoices):
    AUTHORIZATION = "authorization", "Authorization"
    CAPTURE = "capture", "Capture"
    REFUND = "refund", "Refund"
    VOID = "void", "Void"


class TransactionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"


class WebhookSource(models.TextChoices):
    STRIPE = "stripe", "Stripe"
    AUTHORIZE_NET = "authorize_net", "Authorize.Net"
    EASYPOST = "easypost", "EasyPost / Shippo"
    CARRIER_DHL = "carrier_dhl", "DHL Express"
    CARRIER_UPS = "carrier_ups", "UPS"
    CARRIER_USPS = "carrier_usps", "USPS"
    CARRIER_FEDEX = "carrier_fedex", "FedEx"


class WebhookStatus(models.TextChoices):
    RECEIVED = "received", "Received"
    PROCESSED = "processed", "Processed"
    FAILED = "failed", "Failed"


class PaymentAttempt(BaseModel):
    """
    Records an individual payment intent or gateway charge attempt for an order.
    """
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="payment_attempts",
    )
    gateway = models.CharField(
        max_length=30,
        choices=PaymentGateway.choices,
        default=PaymentGateway.FAKE,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default="USD")
    status = models.CharField(
        max_length=30,
        choices=PaymentAttemptStatus.choices,
        default=PaymentAttemptStatus.INITIATED,
        db_index=True,
    )
    client_secret = models.CharField(max_length=255, blank=True, default="")
    gateway_attempt_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    error_message = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Payment Attempt"
        verbose_name_plural = "Payment Attempts"

    def __str__(self):
        return f"{self.order.order_number} — {self.gateway} — {self.status} (${self.amount})"


class Transaction(models.Model):
    """
    Append-only immutable financial audit ledger for payments, refunds, and authorizations.
    No soft-delete.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        on_delete=models.CASCADE,
        related_name="transactions",
        null=True,
        blank=True,
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    gateway_transaction_id = models.CharField(max_length=255, db_index=True)
    type = models.CharField(
        max_length=30,
        choices=TransactionType.choices,
        default=TransactionType.CAPTURE,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default="USD")
    status = models.CharField(
        max_length=30,
        choices=TransactionStatus.choices,
        default=TransactionStatus.PENDING,
        db_index=True,
    )
    raw_response = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Transaction"
        verbose_name_plural = "Transactions"

    def __str__(self):
        return f"Txn {self.gateway_transaction_id} — {self.type} {self.status} (${self.amount})"


class SavedCard(BaseModel):
    """
    Tokenized card representation stored for customer convenience.
    Never stores raw PAN, CVV, or track data.
    """
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="saved_cards",
    )
    gateway = models.CharField(max_length=50, default="stripe")
    gateway_payment_method_id = models.CharField(max_length=255)
    gateway_customer_id = models.CharField(max_length=255, blank=True, default="")
    brand = models.CharField(max_length=30, default="Visa")
    last4 = models.CharField(max_length=4)
    exp_month = models.IntegerField()
    exp_year = models.IntegerField()
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_default", "-created_at"]
        verbose_name = "Saved Card"
        verbose_name_plural = "Saved Cards"

    def __str__(self):
        return f"{self.user.email} — {self.brand} •••• {self.last4} ({self.exp_month}/{self.exp_year})"


class WebhookEvent(models.Model):
    """
    Append-only raw webhook event store for Stripe, Authorize.Net, carriers, etc.
    No soft-delete. Deduplicates on provider_event_id.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    source = models.CharField(
        max_length=30,
        choices=WebhookSource.choices,
        db_index=True,
    )
    provider_event_id = models.CharField(max_length=255, unique=True, db_index=True)
    event_type = models.CharField(max_length=100, blank=True, default="")
    raw_payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=30,
        choices=WebhookStatus.choices,
        default=WebhookStatus.RECEIVED,
        db_index=True,
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    replay_count = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Webhook Event"
        verbose_name_plural = "Webhook Events"

    def __str__(self):
        return f"Webhook [{self.source}] {self.provider_event_id} ({self.status})"


class EscrowStatus(models.TextChoices):
    HELD = "held", "Held"
    ELIGIBLE_FOR_RELEASE = "eligible_for_release", "Eligible For Release"
    RELEASED = "released", "Released"
    DISPUTED = "disputed", "Disputed"
    REFUNDED = "refunded", "Refunded"


class CODStatus(models.TextChoices):
    PENDING = "pending", "Pending Collection"
    OTP_SENT = "otp_sent", "OTP Sent to Customer"
    COLLECTED = "collected", "Collected & Verified"
    FAILED = "failed", "Collection Failed"
    CANCELLED = "cancelled", "Cancelled"


class EscrowHold(BaseModel):
    """
    Escrow Hold for a specific VendorOrder.
    Locks net vendor earnings until the customer delivery & return period passes.
    """
    vendor_order = models.OneToOneField(
        "orders.VendorOrder",
        on_delete=models.CASCADE,
        related_name="escrow_hold",
    )
    vendor = models.ForeignKey(
        "vendors.Vendor",
        on_delete=models.CASCADE,
        related_name="escrow_holds",
    )
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2)
    net_vendor_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    status = models.CharField(
        max_length=30,
        choices=EscrowStatus.choices,
        default=EscrowStatus.HELD,
        db_index=True,
    )
    held_at = models.DateTimeField(auto_now_add=True)
    eligible_at = models.DateTimeField(null=True, blank=True, db_index=True)
    released_at = models.DateTimeField(null=True, blank=True)
    release_reference = models.CharField(max_length=100, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-held_at"]
        verbose_name = "Escrow Hold"
        verbose_name_plural = "Escrow Holds"

    def __str__(self):
        return f"EscrowHold {self.vendor_order.order.order_number} ({self.vendor.display_name}) - {self.status} (${self.net_vendor_amount})"


class CODCollection(BaseModel):
    """
    Tracks Cash on Delivery collection, delivery agent OTP verification,
    and subsequent remittance into the platform double-entry ledger.
    """
    order = models.OneToOneField(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="cod_collection",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    status = models.CharField(
        max_length=30,
        choices=CODStatus.choices,
        default=CODStatus.PENDING,
        db_index=True,
    )
    otp_code = models.CharField(max_length=6, blank=True, default="")
    otp_generated_at = models.DateTimeField(null=True, blank=True)
    otp_attempts = models.IntegerField(default=0)
    collected_at = models.DateTimeField(null=True, blank=True)
    collected_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="collected_cods",
    )
    receipt_number = models.CharField(max_length=64, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "COD Collection"
        verbose_name_plural = "COD Collections"

    def __str__(self):
        return f"CODCollection {self.order.order_number} - {self.status} (${self.amount})"

