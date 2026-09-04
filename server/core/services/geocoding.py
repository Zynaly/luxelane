"""
core/services/geocoding.py — Geocoding adapter for address normalization and coordinate lookup.
"""
from decimal import Decimal
import re


class GeocodingAdapter:
    """
    Geocoding adapter stub.
    Normalizes address components and assigns deterministic/mock coordinates
    (ADR-03: Address Coordinates).
    In production, swap or delegate to Google Maps Geocoding / Radar API.
    """

    # Approximate default coordinates for common regions/cities
    CITY_COORDINATES = {
        "new york": (Decimal("40.712776"), Decimal("-74.005974")),
        "los angeles": (Decimal("34.052235"), Decimal("-118.243683")),
        "chicago": (Decimal("41.878113"), Decimal("-87.629799")),
        "houston": (Decimal("29.760427"), Decimal("-95.369804")),
        "phoenix": (Decimal("33.448376"), Decimal("-112.074036")),
        "london": (Decimal("51.507351"), Decimal("-0.127758")),
        "paris": (Decimal("48.856613"), Decimal("2.352222")),
        "toronto": (Decimal("43.653225"), Decimal("-79.383186")),
    }

    DEFAULT_COORDS = (Decimal("37.774929"), Decimal("-122.419418"))  # San Francisco fallback

    @classmethod
    def validate_and_normalize(cls, data: dict) -> dict:
        line1 = (data.get("line1") or "").strip().title()
        line2 = (data.get("line2") or "").strip().title()
        city = (data.get("city") or "").strip().title()
        state = (data.get("state") or "").strip().upper()
        country = (data.get("country") or "US").strip().upper()
        postal_code = (data.get("postal_code") or "").strip()

        # Coordinate resolution
        city_lower = city.lower()
        lat, lng = cls.CITY_COORDINATES.get(city_lower, cls.DEFAULT_COORDS)

        # Basic postal code normalization (US 5-digit or standard)
        clean_zip = re.sub(r"[^\w\s-]", "", postal_code).strip()

        return {
            "line1": line1,
            "line2": line2,
            "city": city,
            "state": state,
            "country": country,
            "postal_code": clean_zip,
            "latitude": lat,
            "longitude": lng,
            "is_deliverable": bool(line1 and city and country and clean_zip),
        }
