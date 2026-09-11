"""
shipping/models.py — Sprint 9 Models: Carrier, CarrierCredential, ShippingZone, ShippingRateCard, RateQuote.
"""
from decimal import Decimal
import uuid
from django.db import models
from django.utils import timezone
from core.models import BaseModel


class CarrierStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    COMING_SOON = "coming_soon", "Coming Soon"
    DISABLED = "disabled", "Disabled"


class Carrier(BaseModel):
    """Supported logistics carrier / fulfillment provider (e.g. DHL, UPS, USPS, FedEx, TCS, Vendor Self)."""
    code = models.CharField(max_length=50, unique=True, help_text="Unique identifier e.g. fedex, tcs, vendor_delivery, fake")
    name = models.CharField(max_length=100)
    status = models.CharField(
        max_length=20,
        choices=CarrierStatus.choices,
        default=CarrierStatus.ACTIVE,
        help_text="Operational status (active, coming_soon, disabled)"
    )
    is_active = models.BooleanField(default=True)
    tracking_url_template = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="URL template with {tracking_number} placeholder"
    )

    @property
    def is_enabled(self) -> bool:
        return self.is_active and self.status == CarrierStatus.ACTIVE

    class Meta:
        verbose_name = "Carrier"
        verbose_name_plural = "Carriers"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class CarrierCredential(BaseModel):
    """Encrypted carrier API credentials per platform or scoped to an individual vendor."""
    carrier = models.ForeignKey(Carrier, on_delete=models.CASCADE, related_name="credentials")
    vendor = models.ForeignKey(
        "vendors.Vendor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="carrier_credentials",
        help_text="Null indicates platform-wide master credential"
    )
    credentials_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="Encrypted JSON token/API key payload"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Carrier Credential"
        verbose_name_plural = "Carrier Credentials"
        unique_together = ("carrier", "vendor")

    def __str__(self):
        owner = self.vendor.display_name if self.vendor else "Platform Master"
        return f"{self.carrier.name} Credentials ({owner})"


class ShippingZone(BaseModel):
    """Geographic shipping destination grouping (e.g. Domestic US, North America, Global)."""
    name = models.CharField(max_length=100, unique=True)
    countries = models.JSONField(
        default=list,
        help_text="List of ISO 2-letter uppercase country codes e.g. ['US', 'CA', 'GB']"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Shipping Zone"
        verbose_name_plural = "Shipping Zones"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def matches_country(self, country_code: str) -> bool:
        if not country_code:
            return False
        normalized = country_code.strip().upper()
        return normalized in [c.strip().upper() for c in (self.countries or [])] or "*" in self.countries


class ShippingRateCard(BaseModel):
    """Configured shipping rate rule for a zone, either platform-standard or vendor-specific."""
    zone = models.ForeignKey(ShippingZone, on_delete=models.CASCADE, related_name="rate_cards")
    vendor = models.ForeignKey(
        "vendors.Vendor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="shipping_rate_cards",
        help_text="Null indicates platform standard rate card"
    )
    service_level = models.CharField(max_length=50, default="standard", help_text="e.g. standard, express, white_glove")
    base_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    per_kg_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    min_days = models.PositiveIntegerField(default=3)
    max_days = models.PositiveIntegerField(default=7)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Shipping Rate Card"
        verbose_name_plural = "Shipping Rate Cards"
        ordering = ["base_rate"]

    def __str__(self):
        owner = self.vendor.display_name if self.vendor else "Platform"
        return f"{self.zone.name} - {self.service_level} (${self.base_rate} + ${self.per_kg_rate}/kg) [{owner}]"

    def calculate_cost(self, weight_kg: Decimal) -> Decimal:
        weight = Decimal(str(weight_kg)) if weight_kg and weight_kg > 0 else Decimal("0.00")
        return (self.base_rate + (self.per_kg_rate * weight)).quantize(Decimal("0.01"))


class RateQuote(BaseModel):
    """Persisted, unredeemed/redeemed rate quote returned to a customer during checkout with a 24h TTL."""
    cart_or_order_ref = models.UUIDField(db_index=True, help_text="Cart ID or Order ID reference")
    carrier = models.ForeignKey(Carrier, on_delete=models.CASCADE, related_name="quotes")
    service_level = models.CharField(max_length=50, help_text="ground, express, overnight, white_glove")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    quote_id = models.CharField(max_length=120, unique=True, db_index=True)
    estimated_days = models.PositiveIntegerField(default=3)
    expires_at = models.DateTimeField()
    redeemed = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Rate Quote"
        verbose_name_plural = "Rate Quotes"
        ordering = ["amount"]

    def __str__(self):
        status = "Redeemed" if self.redeemed else ("Expired" if self.is_expired else "Valid")
        return f"{self.carrier.name} {self.service_level} - ${self.amount} ({status})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    @classmethod
    def generate_quote_id(cls, carrier_code: str) -> str:
        return f"rq_{carrier_code}_{uuid.uuid4().hex[:12]}"


# ── Sprint 13 Models: Shipments, Packages, Items & Tracking ──────────────────

class ShipmentStatus(models.TextChoices):
    LABEL_CREATED = "label_created", "Label Created"
    PICKED_UP = "picked_up", "Picked Up"
    IN_TRANSIT = "in_transit", "In Transit"
    OUT_FOR_DELIVERY = "out_for_delivery", "Out For Delivery"
    DELIVERED = "delivered", "Delivered"
    FAILED_ATTEMPT = "failed_attempt", "Failed Delivery Attempt"
    EXCEPTION = "exception", "Delivery Exception"
    CANCELLED = "cancelled", "Cancelled"
    RETURNED = "returned", "Returned"


class Shipment(BaseModel):
    """
    Physical shipment fulfilling one or more items of an Order / VendorOrder.
    """
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="shipments",
    )
    vendor_order = models.ForeignKey(
        "orders.VendorOrder",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="shipments",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shipments",
    )
    carrier = models.ForeignKey(
        Carrier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shipments",
    )
    tracking_number = models.CharField(max_length=128, db_index=True)
    tracking_url = models.URLField(blank=True, default="")
    label_url = models.URLField(blank=True, default="")
    label_format = models.CharField(max_length=20, default="PDF")
    rate_quote = models.ForeignKey(
        RateQuote,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shipments",
    )
    is_self_shipped = models.BooleanField(default=False)
    status = models.CharField(
        max_length=30,
        choices=ShipmentStatus.choices,
        default=ShipmentStatus.LABEL_CREATED,
        db_index=True,
    )
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Shipment"
        verbose_name_plural = "Shipments"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Shipment {self.tracking_number} ({self.status}) [{self.order.order_number}]"


class ShipmentPackage(BaseModel):
    """
    Physical parcel package container within a shipment.
    """
    shipment = models.ForeignKey(
        Shipment,
        on_delete=models.CASCADE,
        related_name="packages",
    )
    package_sequence = models.PositiveIntegerField(default=1)
    weight_kg = models.DecimalField(max_digits=8, decimal_places=3, default=Decimal("0.500"))
    length_cm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    width_cm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    tracking_number = models.CharField(max_length=128, blank=True, default="")

    class Meta:
        verbose_name = "Shipment Package"
        verbose_name_plural = "Shipment Packages"
        ordering = ["package_sequence"]

    def __str__(self):
        return f"Package #{self.package_sequence} for {self.shipment.tracking_number} ({self.weight_kg}kg)"


class ShipmentItem(BaseModel):
    """
    Linkage between a Shipment / Package and a specific OrderItem.
    """
    shipment = models.ForeignKey(
        Shipment,
        on_delete=models.CASCADE,
        related_name="items",
    )
    package = models.ForeignKey(
        ShipmentPackage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items",
    )
    order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.CASCADE,
        related_name="shipment_items",
    )
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        verbose_name = "Shipment Item"
        verbose_name_plural = "Shipment Items"
        ordering = ["-created_at"]

    def __str__(self):
        return f"ShipmentItem {self.order_item.variant.sku} x {self.quantity}"


class ShipmentTrackingEvent(models.Model):
    """
    Immutable, append-only chronological log of tracking milestones.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    shipment = models.ForeignKey(
        Shipment,
        on_delete=models.CASCADE,
        related_name="tracking_events",
    )
    status = models.CharField(
        max_length=30,
        choices=ShipmentStatus.choices,
    )
    carrier_status_code = models.CharField(max_length=64, blank=True, default="")
    description = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True, default="")
    event_timestamp = models.DateTimeField(default=timezone.now)
    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Shipment Tracking Event"
        verbose_name_plural = "Shipment Tracking Events"
        ordering = ["-event_timestamp"]

    def __str__(self):
        return f"{self.shipment.tracking_number} — {self.status} at {self.location}"

