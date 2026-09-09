"""
shipping/models.py — Sprint 9 Models: Carrier, CarrierCredential, ShippingZone, ShippingRateCard, RateQuote.
"""
from decimal import Decimal
import uuid
from django.db import models
from django.utils import timezone
from core.models import BaseModel


class Carrier(BaseModel):
    """Supported logistics carrier / fulfillment provider (e.g. DHL, UPS, USPS, FedEx, Fake, White-Glove)."""
    code = models.CharField(max_length=50, unique=True, help_text="Unique identifier e.g. dhl, ups, usps, fedex, fake, vendor_self")
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    tracking_url_template = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="URL template with {tracking_number} placeholder"
    )

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
