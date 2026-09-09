"""
shipping/tests.py — Comprehensive unit tests for Sprint 9: Shipping Rates & Packing.
"""
from decimal import Decimal
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Category, Brand, Product, ProductVariant
from cart_and_pricing.models import Cart, CartItem
from shipping.models import (
    Carrier,
    CarrierCredential,
    ShippingZone,
    ShippingRateCard,
    RateQuote,
)
from shipping.services import rates as rates_service
from vendors.models import Vendor, VendorStaff

User = get_user_model()


class ShippingModelAndServiceTests(APITestCase):
    def setUp(self):
        self.carrier = Carrier.objects.create(
            code="fake",
            name="Fake Carrier Express",
            is_active=True,
            tracking_url_template="https://track.fakecarrier.com/{tracking_number}",
        )
        self.zone_us = ShippingZone.objects.create(
            name="Domestic US",
            countries=["US"],
            is_active=True,
        )
        self.rate_card_std = ShippingRateCard.objects.create(
            zone=self.zone_us,
            service_level="standard",
            base_rate=Decimal("10.00"),
            per_kg_rate=Decimal("2.50"),
            min_days=3,
            max_days=5,
            is_active=True,
        )

    def test_zone_matching(self):
        self.assertTrue(self.zone_us.matches_country("US"))
        self.assertTrue(self.zone_us.matches_country("us "))
        self.assertFalse(self.zone_us.matches_country("CA"))
        self.assertFalse(self.zone_us.matches_country(""))

    def test_rate_card_cost_calculation(self):
        # 10.00 + (2.50 * 2.0) = 15.00
        cost = self.rate_card_std.calculate_cost(Decimal("2.00"))
        self.assertEqual(cost, Decimal("15.00"))

        # Zero weight
        cost_zero = self.rate_card_std.calculate_cost(Decimal("0.00"))
        self.assertEqual(cost_zero, Decimal("10.00"))

    def test_rate_quote_expiration(self):
        unexpired_quote = RateQuote.objects.create(
            cart_or_order_ref=uuid.uuid4(),
            carrier=self.carrier,
            service_level="express",
            amount=Decimal("25.00"),
            quote_id=RateQuote.generate_quote_id(self.carrier.code),
            expires_at=timezone.now() + timedelta(hours=24),
        )
        self.assertFalse(unexpired_quote.is_expired)

        expired_quote = RateQuote.objects.create(
            cart_or_order_ref=uuid.uuid4(),
            carrier=self.carrier,
            service_level="express",
            amount=Decimal("25.00"),
            quote_id=RateQuote.generate_quote_id(self.carrier.code),
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.assertTrue(expired_quote.is_expired)

    def test_rates_service_get_quotes_with_fanout(self):
        cart_ref = uuid.uuid4()
        dest = {"country": "US", "state": "NY", "postal_code": "10001"}

        quotes = rates_service.get_quotes(
            cart_or_items=[],
            destination=dest,
            cart_or_order_ref=cart_ref,
        )

        self.assertGreaterEqual(len(quotes), 1)
        # All quotes must be persisted in DB
        for q in quotes:
            self.assertEqual(q.cart_or_order_ref, cart_ref)
            self.assertFalse(q.redeemed)
            self.assertFalse(q.is_expired)
            self.assertTrue(RateQuote.objects.filter(id=q.id).exists())


class ShippingAPITests(APITestCase):
    def setUp(self):
        # Users
        self.admin_user = User.objects.create_user(
            email="admin_shipping@luxelane.com",
            password="Password123!",
            first_name="Admin",
            last_name="Shipping",
            role="platform_admin",
        )
        self.customer_user = User.objects.create_user(
            email="customer_shipping@luxelane.com",
            password="Password123!",
            first_name="Customer",
            last_name="Shipping",
            role="customer",
        )
        self.vendor_owner = User.objects.create_user(
            email="vendor_owner_ship@luxelane.com",
            password="Password123!",
            first_name="Vendor",
            last_name="Ship",
            role="vendor_owner",
        )
        self.vendor = Vendor.objects.create(
            owner_user=self.vendor_owner,
            legal_name="Atelier Shipping Partner LLC",
            display_name="Atelier Shipping Partner",
            slug="atelier-shipping-partner",
            status="active",
        )
        VendorStaff.objects.create(
            vendor=self.vendor,
            user=self.vendor_owner,
            staff_role="manager",
            is_active=True,
        )

        # Shipping core
        self.carrier = Carrier.objects.create(
            code="fake",
            name="Fake Carrier",
            is_active=True,
        )
        self.zone = ShippingZone.objects.create(
            name="Domestic US",
            countries=["US"],
            is_active=True,
        )
        self.rate_card = ShippingRateCard.objects.create(
            zone=self.zone,
            service_level="standard",
            base_rate=Decimal("12.00"),
            per_kg_rate=Decimal("1.50"),
            is_active=True,
        )

        # Product & Cart
        self.category = Category.objects.create(name="Horology", slug="horology-ship", is_active=True)
        self.brand = Brand.objects.create(name="Geneva Time", slug="geneva-time-ship")
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            brand=self.brand,
            title="Chronograph Precision",
            slug="chronograph-precision-ship",
            base_price=Decimal("1200.00"),
            status="approved",
            is_active=True,
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="CHRONO-SHIP-01",
            price=Decimal("1200.00"),
            weight_kg=Decimal("1.20"),
            is_active=True,
        )
        self.cart = Cart.objects.create(user=self.customer_user, status="active")
        self.cart_item = CartItem.objects.create(
            cart=self.cart,
            variant=self.variant,
            quantity=2,
            price_snapshot=Decimal("1200.00"),
        )

    def test_public_carrier_list(self):
        url = "/api/v1/shipping/carriers/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]["code"], "fake")

    def test_checkout_rates_view_public_guest(self):
        url = "/api/v1/checkout/rates/"
        payload = {
            "cart_id": str(self.cart.id),
            "country": "US",
            "state": "CA",
            "city": "Beverly Hills",
            "postal_code": "90210",
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        quotes = resp.data
        self.assertIsInstance(quotes, list)
        self.assertGreaterEqual(len(quotes), 1)

        # Verify persisted fields
        first_quote = quotes[0]
        self.assertIn("quote_id", first_quote)
        self.assertIn("amount", first_quote)
        self.assertIn("carrier_name", first_quote)
        self.assertIn("service_level", first_quote)

        # Confirm DB row exists
        self.assertTrue(RateQuote.objects.filter(quote_id=first_quote["quote_id"]).exists())

    def test_shipping_rate_card_crud_permissions(self):
        url = "/api/v1/shipping/rate-cards/"

        # Unauthenticated cannot create
        resp = self.client.post(url, {"zone": str(self.zone.id), "base_rate": "15.00"})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Platform Admin can create platform rate card
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(url, {
            "zone": str(self.zone.id),
            "service_level": "express",
            "base_rate": "35.00",
            "per_kg_rate": "5.00",
            "min_days": 1,
            "max_days": 2,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(resp.data["base_rate"]), Decimal("35.00"))

    def test_admin_carrier_credentials_scoping(self):
        url = "/api/v1/admin/shipping/carrier-credentials/"

        # Create credentials for vendor and for platform
        cred_platform = CarrierCredential.objects.create(
            carrier=self.carrier,
            vendor=None,
            credentials_encrypted="enc_plat_token",
            is_active=True,
        )
        cred_vendor = CarrierCredential.objects.create(
            carrier=self.carrier,
            vendor=self.vendor,
            credentials_encrypted="enc_vendor_token",
            is_active=True,
        )

        # Vendor Member can only see their vendor's credentials
        self.client.force_authenticate(user=self.vendor_owner)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], str(cred_vendor.id))
        # Masked write-only credentials
        self.assertNotIn("credentials_encrypted", results[0])
        self.assertTrue(results[0]["has_credentials"])

        # Platform Admin sees all
        self.client.force_authenticate(user=self.admin_user)
        resp_admin = self.client.get(url)
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        results_admin = resp_admin.data.get("results", resp_admin.data)
        self.assertEqual(len(results_admin), 2)
