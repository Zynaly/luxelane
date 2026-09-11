"""
shipping/services/rates.py — Shipping rate quoting engine with parallel carrier fan-out and flat-rate fallback.
"""
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from datetime import timedelta
from decimal import Decimal
from typing import List, Dict, Any, Optional

from django.conf import settings
from django.db import models
from django.utils import timezone

from shipping.models import Carrier, ShippingZone, ShippingRateCard, RateQuote
from shipping.carriers.fake import FakeCarrier

logger = logging.getLogger(__name__)

CARRIER_TIMEOUT_SECONDS = 2.0


def calculate_cart_weight(cart_or_items) -> Decimal:
    """Compute total weight in kg from a Cart instance or list of items."""
    total_weight = Decimal("0.00")

    if hasattr(cart_or_items, "items"):
        item_list = cart_or_items.items.all()
    elif isinstance(cart_or_items, list):
        item_list = cart_or_items
    else:
        return Decimal("1.00")  # Default minimum parcel weight

    for item in item_list:
        qty = getattr(item, "quantity", 1)
        variant = getattr(item, "variant", None)
        item_weight = None
        if variant:
            item_weight = getattr(variant, "weight_kg", None)
        if not item_weight or item_weight <= 0:
            item_weight = Decimal("0.50")  # Default 500g per luxury item
        total_weight += Decimal(str(item_weight)) * Decimal(str(qty))

    return total_weight if total_weight > 0 else Decimal("1.00")


def _get_carrier_quotes_worker(carrier: Carrier, from_addr: dict, to_addr: dict, parcels: list) -> List[dict]:
    """Worker task executed in a worker thread to fetch rates from a single carrier."""
    # Check if FakeCarrier should be used
    is_fake = (
        carrier.code == "fake"
        or getattr(settings, "SHIPPING_PROVIDER", "fake") == "fake"
        or not carrier.credentials.filter(is_active=True).exists()
    )

    if is_fake:
        fake_adapter = FakeCarrier()
        rate_options = fake_adapter.get_rates(from_addr, to_addr, parcels)
        results = []
        for opt in rate_options:
            results.append({
                "carrier": carrier,
                "carrier_code": carrier.code,
                "carrier_name": carrier.name,
                "service_level": opt.service_level,
                "amount": opt.amount,
                "currency": opt.currency,
                "estimated_days": opt.estimated_days,
                "quote_id": opt.quote_id,
                "metadata": {"provider": "fake_carrier"},
            })
        return results

    # Live Carrier Integration (EasyPost / Shippo / Carrier API) placeholder
    # In live environments, credentials from CarrierCredential would be used here.
    return []


def get_quotes(
    cart_or_items,
    destination: Any,
    vendor=None,
    cart_or_order_ref: Optional[uuid.UUID] = None,
) -> List[RateQuote]:
    """
    Fan-out to active shipping carriers (with 2s timeout) + zone flat-rate cards fallback.
    Persists and returns RateQuote instances.
    """
    # 1. Destination parsing
    dest_dict = {}
    if hasattr(destination, "country"):
        dest_dict = {
            "country": destination.country,
            "state": destination.state,
            "city": destination.city,
            "postal_code": destination.postal_code,
            "line1": destination.line1,
        }
    elif isinstance(destination, dict):
        dest_dict = destination
    else:
        dest_dict = {"country": "US"}

    country_code = (dest_dict.get("country") or "US").strip().upper()
    weight_kg = calculate_cart_weight(cart_or_items)

    from_addr = {"country": "US", "postal_code": "10001", "city": "New York"}
    parcels = [{"weight": float(weight_kg), "predefined_package": "Parcel"}]

    # Reference UUID
    if not cart_or_order_ref:
        if hasattr(cart_or_items, "id"):
            cart_or_order_ref = cart_or_items.id
        else:
            cart_or_order_ref = uuid.uuid4()

    expires_at = timezone.now() + timedelta(hours=24)
    quote_candidates: List[dict] = []

    # 2. Parallel Carrier Fan-out (2s strict timeout)
    active_carriers = list(Carrier.objects.filter(is_active=True))

    if active_carriers:
        futures = {}
        with ThreadPoolExecutor(max_workers=min(len(active_carriers), 5)) as executor:
            for carrier in active_carriers:
                future = executor.submit(_get_carrier_quotes_worker, carrier, from_addr, dest_dict, parcels)
                futures[future] = carrier

            try:
                for future in as_completed(futures, timeout=CARRIER_TIMEOUT_SECONDS):
                    carrier = futures[future]
                    try:
                        rates = future.result()
                        quote_candidates.extend(rates)
                    except Exception as exc:
                        logger.warning(f"Carrier {carrier.code} failed to return rates: {exc}")
            except TimeoutError:
                logger.warning(f"Carrier fan-out exceeded strict {CARRIER_TIMEOUT_SECONDS}s timeout. Falling back to rate cards.")

    # 3. Zone Flat-Rate Cards Fallback
    matching_zones = [
        zone for zone in ShippingZone.objects.filter(is_active=True)
        if zone.matches_country(country_code)
    ]

    rate_card_filter = {"zone__in": matching_zones, "is_active": True}
    if vendor:
        rate_cards = ShippingRateCard.objects.filter(models.Q(vendor=vendor) | models.Q(vendor__isnull=True), **rate_card_filter)
    else:
        rate_cards = ShippingRateCard.objects.filter(vendor__isnull=True, **rate_card_filter)

    # If no live carrier quotes returned or to provide standard flat rate options
    default_carrier = Carrier.objects.filter(is_active=True).first()
    if not default_carrier:
        default_carrier, _ = Carrier.objects.get_or_create(
            code="luxelane_concierge",
            defaults={"name": "LuxeLane White-Glove Concierge", "is_active": True},
        )

    for card in rate_cards:
        amount = card.calculate_cost(weight_kg)
        quote_candidates.append({
            "carrier": default_carrier,
            "carrier_code": default_carrier.code,
            "carrier_name": default_carrier.name,
            "service_level": card.service_level,
            "amount": amount,
            "currency": "USD",
            "estimated_days": card.min_days,
            "quote_id": RateQuote.generate_quote_id(default_carrier.code),
            "metadata": {
                "rate_card_id": str(card.id),
                "zone": card.zone.name,
                "weight_kg": str(weight_kg),
                "is_rate_card_fallback": True,
            },
        })

    # 4. Shipment by Vendor (Active & Enabled) + FedEx/TCS (Coming Soon)
    vendor_carrier = Carrier.objects.filter(code="vendor_delivery").first()
    if not vendor_carrier:
        vendor_carrier = default_carrier

    # Always provide active 'Shipment by Vendor' quote
    if vendor_carrier:
        # Check if rate card or calculated cost is available
        vendor_amount = Decimal("15.00")
        if rate_cards.exists():
            vendor_amount = rate_cards.first().calculate_cost(weight_kg)

        quote_candidates.insert(0, {
            "carrier": vendor_carrier,
            "carrier_code": "vendor_delivery",
            "carrier_name": "Shipment by Vendor",
            "service_level": "Standard Delivery (Vendor Direct)",
            "amount": vendor_amount,
            "currency": "USD",
            "estimated_days": 3,
            "quote_id": RateQuote.generate_quote_id("vendor_delivery"),
            "metadata": {
                "status": "active",
                "is_enabled": True,
                "description": "Fulfillment and shipping directly by the vendor atelier",
            },
        })

    # Option for FedEx (Coming Soon)
    fedex_carrier = Carrier.objects.filter(code="fedex").first()
    if fedex_carrier:
        quote_candidates.append({
            "carrier": fedex_carrier,
            "carrier_code": "fedex",
            "carrier_name": "FedEx",
            "service_level": "Priority Courier",
            "amount": Decimal("0.00"),
            "currency": "USD",
            "estimated_days": 2,
            "quote_id": RateQuote.generate_quote_id("fedex"),
            "metadata": {
                "status": "coming_soon",
                "is_enabled": False,
                "badge": "Coming Soon",
                "description": "FedEx global courier integration arriving soon.",
            },
        })

    # Option for TCS (Coming Soon)
    tcs_carrier = Carrier.objects.filter(code="tcs").first()
    if tcs_carrier:
        quote_candidates.append({
            "carrier": tcs_carrier,
            "carrier_code": "tcs",
            "carrier_name": "TCS Express",
            "service_level": "Express Courier",
            "amount": Decimal("0.00"),
            "currency": "USD",
            "estimated_days": 3,
            "quote_id": RateQuote.generate_quote_id("tcs"),
            "metadata": {
                "status": "coming_soon",
                "is_enabled": False,
                "badge": "Coming Soon",
                "description": "TCS domestic courier integration arriving soon.",
            },
        })

    # Fallback if candidates are still empty
    if not quote_candidates:
        quote_candidates.append({
            "carrier": default_carrier,
            "carrier_code": default_carrier.code,
            "carrier_name": default_carrier.name,
            "service_level": "standard",
            "amount": Decimal("15.00"),
            "currency": "USD",
            "estimated_days": 5,
            "quote_id": RateQuote.generate_quote_id(default_carrier.code),
            "metadata": {"emergency_fallback": True},
        })

    # 4. Persist RateQuote records
    persisted_quotes: List[RateQuote] = []
    for cand in quote_candidates:
        # Guarantee unique quote_id
        qid = cand.get("quote_id")
        if not qid or RateQuote.objects.filter(quote_id=qid).exists():
            qid = RateQuote.generate_quote_id(cand.get("carrier_code", "ship"))

        rq = RateQuote.objects.create(
            cart_or_order_ref=cart_or_order_ref,
            carrier=cand["carrier"],
            service_level=cand["service_level"],
            amount=cand["amount"],
            currency=cand.get("currency", "USD"),
            quote_id=qid,
            estimated_days=cand.get("estimated_days", 3),
            expires_at=expires_at,
            redeemed=False,
            metadata=cand.get("metadata", {}),
        )
        persisted_quotes.append(rq)

    return persisted_quotes
