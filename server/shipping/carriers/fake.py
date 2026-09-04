"""
shipping/carriers/fake.py — FakeCarrier stub.

Used in development and tests when settings.SHIPPING_PROVIDER == 'fake'.
Returns dummy rate quotes and tracking events.
"""
import uuid
from dataclasses import dataclass, field
from typing import List, Optional
from decimal import Decimal


@dataclass
class RateOption:
    carrier_code: str
    service_level: str
    amount: Decimal
    quote_id: str
    currency: str = "USD"
    estimated_days: int = 3


@dataclass
class TrackingEvent:
    status_code: str
    description: str
    occurred_at: str  # ISO 8601


@dataclass
class LabelResult:
    success: bool
    tracking_number: str
    label_url: str
    raw_response: dict
    error_message: Optional[str] = None


class FakeCarrier:
    """Simulates a multi-carrier shipping provider for development and testing."""

    CARRIER_CODE = "fake"

    def get_rates(self, from_address: dict, to_address: dict, parcels: List[dict]) -> List[RateOption]:
        """Return a fixed set of fake rate options."""
        return [
            RateOption(
                carrier_code="fake_ground",
                service_level="ground",
                amount=Decimal("5.99"),
                quote_id=f"fq_ground_{uuid.uuid4().hex[:8]}",
                estimated_days=5,
            ),
            RateOption(
                carrier_code="fake_express",
                service_level="express",
                amount=Decimal("15.99"),
                quote_id=f"fq_express_{uuid.uuid4().hex[:8]}",
                estimated_days=2,
            ),
        ]

    def purchase_label(self, quote_id: str, from_address: dict, to_address: dict, parcel: dict) -> LabelResult:
        """Return a fake label with a dummy tracking number."""
        tracking = f"FAKE{uuid.uuid4().hex[:12].upper()}"
        return LabelResult(
            success=True,
            tracking_number=tracking,
            label_url=f"https://fake-carrier.example.com/labels/{tracking}.pdf",
            raw_response={"quote_id": quote_id, "tracking_number": tracking},
        )

    def get_tracking(self, tracking_number: str) -> List[TrackingEvent]:
        """Return a fake in-transit tracking event."""
        return [
            TrackingEvent(
                status_code="in_transit",
                description="Package is on its way",
                occurred_at="2026-01-01T10:00:00Z",
            )
        ]

    def void_label(self, tracking_number: str) -> bool:
        return True
