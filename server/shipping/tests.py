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


# ── Sprint 13: Shipment Fulfillment, Tracking & Delivery Cascade Tests ────────

from accounts.models import Address
from orders.models import (
    Order,
    OrderStatus,
    VendorOrder,
    VendorOrderStatus,
    OrderItem,
    OrderItemFulfilmentStatus,
)
from warehouse.models import (
    Warehouse,
    Inventory,
    InventoryReservation,
    ReservationStatus,
)
from shipping.models import (
    Shipment,
    ShipmentPackage,
    ShipmentItem,
    ShipmentTrackingEvent,
    ShipmentStatus,
)
from shipping.services.shipment_service import shipment_service
from payments.models import EscrowHold, EscrowStatus


class Sprint13ShipmentTests(APITestCase):
    def setUp(self):
        # Users
        self.admin = User.objects.create_user(
            email="s13_admin@luxelane.com",
            password="Password123!",
            role="platform_admin",
        )
        self.customer = User.objects.create_user(
            email="s13_customer@luxelane.com",
            password="Password123!",
            role="customer",
        )
        self.vendor_a_user = User.objects.create_user(
            email="s13_vendor_a@luxelane.com",
            password="Password123!",
            role="vendor_owner",
        )
        self.vendor_b_user = User.objects.create_user(
            email="s13_vendor_b@luxelane.com",
            password="Password123!",
            role="vendor_owner",
        )

        # Vendors
        self.vendor_a = Vendor.objects.create(
            owner_user=self.vendor_a_user,
            legal_name="Maison Horlogerie LLC",
            display_name="Maison Horlogerie",
            slug="maison-horlogerie",
            status="active",
        )
        VendorStaff.objects.create(
            vendor=self.vendor_a,
            user=self.vendor_a_user,
            staff_role="manager",
            is_active=True,
        )

        self.vendor_b = Vendor.objects.create(
            owner_user=self.vendor_b_user,
            legal_name="Luggage & Leather Ltd",
            display_name="Luggage & Leather",
            slug="luggage-leather",
            status="active",
        )
        VendorStaff.objects.create(
            vendor=self.vendor_b,
            user=self.vendor_b_user,
            staff_role="manager",
            is_active=True,
        )

        # Catalog
        self.category = Category.objects.create(name="Haute Horlogerie", slug="haute-horlogerie", is_active=True)
        self.brand = Brand.objects.create(name="Vacheron", slug="vacheron")
        self.product = Product.objects.create(
            vendor=self.vendor_a,
            category=self.category,
            brand=self.brand,
            title="Tourbillon Grand Complication",
            slug="tourbillon-grand-complication",
            base_price=Decimal("5000.00"),
            status="approved",
            is_active=True,
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TOURB-01",
            price=Decimal("5000.00"),
            weight_kg=Decimal("1.500"),
            is_active=True,
        )

        # Warehouse & Stock
        self.warehouse = Warehouse.objects.create(
            name="Geneva Vault 1",
            is_active=True,
        )
        self.inventory = Inventory.objects.create(
            warehouse=self.warehouse,
            variant=self.variant,
            on_hand=10,
            reserved_cache=2,
        )
        self.reservation = InventoryReservation.objects.create(
            inventory=self.inventory,
            quantity=2,
            status=ReservationStatus.COMMITTED,
            expires_at=timezone.now() + timedelta(hours=2),
        )

        # Shipping setup
        self.carrier = Carrier.objects.create(
            name="DHL Express",
            code="dhl",
            is_active=True,
            tracking_url_template="https://track.dhl.com/{tracking_number}",
        )

        # Order & VendorOrder
        self.address = Address.objects.create(
            user=self.customer,
            line1="Rue du Rhone 42",
            city="Geneva",
            state="Geneva",
            country="CH",
            postal_code="1204",
        )
        self.order = Order.objects.create(
            order_number=f"ORD-S13-{uuid.uuid4().hex[:6].upper()}",
            customer=self.customer,
            shipping_address=self.address,
            status=OrderStatus.CONFIRMED,
            subtotal=Decimal("10000.00"),
            grand_total=Decimal("10000.00"),
        )
        self.vendor_order = VendorOrder.objects.create(
            order=self.order,
            vendor=self.vendor_a,
            subtotal=Decimal("10000.00"),
            commission_amount=Decimal("1000.00"),
            vendor_net_amount=Decimal("9000.00"),
            status=VendorOrderStatus.CONFIRMED,
        )
        self.order_item = OrderItem.objects.create(
            vendor_order=self.vendor_order,
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=2,
            unit_price=Decimal("5000.00"),
            line_subtotal=Decimal("10000.00"),
            fulfilment_status=OrderItemFulfilmentStatus.ALLOCATED,
        )
        self.escrow_hold = EscrowHold.objects.create(
            vendor_order=self.vendor_order,
            vendor=self.vendor_a,
            gross_amount=Decimal("10000.00"),
            commission_amount=Decimal("1000.00"),
            net_vendor_amount=Decimal("9000.00"),
            currency="USD",
            status=EscrowStatus.HELD,
        )

    def test_shipment_creation_and_stock_consumption(self):
        url = "/api/v1/shipping/shipments/"
        self.client.force_authenticate(user=self.vendor_a_user)

        payload = {
            "order_id": str(self.order.id),
            "vendor_order_id": str(self.vendor_order.id),
            "warehouse_id": str(self.warehouse.id),
            "carrier_id": str(self.carrier.id),
            "items": [
                {
                    "order_item_id": str(self.order_item.id),
                    "quantity": 2,
                }
            ],
            "packages": [
                {
                    "package_sequence": 1,
                    "weight_kg": "1.500",
                    "length_cm": "20.00",
                    "width_cm": "15.00",
                    "height_cm": "10.00",
                }
            ],
        }

        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.data

        # Verify shipment details
        self.assertEqual(data["status"], ShipmentStatus.LABEL_CREATED)
        self.assertTrue(data["tracking_number"].startswith("DHL"))
        self.assertIn("https://track.dhl.com/", data["tracking_url"])
        self.assertTrue(data["label_url"].endswith(".pdf"))
        self.assertEqual(len(data["packages"]), 1)
        self.assertEqual(len(data["items"]), 1)
        self.assertGreaterEqual(len(data["tracking_events"]), 1)

        # Verify physical stock deduction
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.on_hand, 8)
        self.assertEqual(self.inventory.reserved_cache, 0)

        # Verify order item and order status
        self.order_item.refresh_from_db()
        self.assertEqual(self.order_item.fulfilment_status, OrderItemFulfilmentStatus.SHIPPED)

        self.vendor_order.refresh_from_db()
        self.assertEqual(self.vendor_order.status, VendorOrderStatus.SHIPPED)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.SHIPPED)

    def test_digital_label_and_rate_quote_redemption(self):
        # Create quote
        quote = RateQuote.objects.create(
            cart_or_order_ref=self.order.id,
            carrier=self.carrier,
            service_level="express",
            amount=Decimal("45.00"),
            quote_id=RateQuote.generate_quote_id(self.carrier.code),
            expires_at=timezone.now() + timedelta(hours=24),
            redeemed=False,
        )

        shipment = shipment_service.create_shipment(
            order=self.order,
            vendor_order=self.vendor_order,
            warehouse=self.warehouse,
            carrier=self.carrier,
            rate_quote=quote,
            items_data=[{"order_item_id": str(self.order_item.id), "quantity": 2}],
        )

        quote.refresh_from_db()
        self.assertTrue(quote.redeemed)

        # Fetch label via API
        self.client.force_authenticate(user=self.vendor_a_user)
        label_url = f"/api/v1/shipping/shipments/{shipment.id}/label/"
        resp = self.client.post(label_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("label_url", resp.data)
        self.assertEqual(resp.data["label_format"], "PDF")

    def test_self_ship_manual_tracking(self):
        self.client.force_authenticate(user=self.vendor_a_user)
        url = "/api/v1/shipping/shipments/"
        payload = {
            "order_id": str(self.order.id),
            "vendor_order_id": str(self.vendor_order.id),
            "is_self_shipped": True,
            "tracking_number": "LOCAL-COURIER-9988",
            "tracking_url": "https://localcourier.ch/track/9988",
            "items": [{"order_item_id": str(self.order_item.id), "quantity": 2}],
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["is_self_shipped"])
        self.assertEqual(resp.data["tracking_number"], "LOCAL-COURIER-9988")
        self.assertEqual(resp.data["tracking_url"], "https://localcourier.ch/track/9988")

    def test_public_tracking_endpoint(self):
        shipment = shipment_service.create_shipment(
            order=self.order,
            vendor_order=self.vendor_order,
            warehouse=self.warehouse,
            carrier=self.carrier,
            items_data=[{"order_item_id": str(self.order_item.id), "quantity": 2}],
        )

        track_url = f"/api/v1/shipping/track/{shipment.tracking_number}/"
        # Public lookup without authentication
        resp = self.client.get(track_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["tracking_number"], shipment.tracking_number)
        self.assertEqual(resp.data["status"], ShipmentStatus.LABEL_CREATED)
        self.assertGreaterEqual(len(resp.data["events"]), 1)

        # 404 for unknown tracking number
        resp_404 = self.client.get("/api/v1/shipping/track/NON-EXISTENT-TRK/")
        self.assertEqual(resp_404.status_code, status.HTTP_404_NOT_FOUND)

    def test_carrier_webhook_and_delivery_cascade(self):
        shipment = shipment_service.create_shipment(
            order=self.order,
            vendor_order=self.vendor_order,
            warehouse=self.warehouse,
            carrier=self.carrier,
            items_data=[{"order_item_id": str(self.order_item.id), "quantity": 2}],
        )

        webhook_url = "/api/v1/shipping/carrier-webhook/"
        payload = {
            "tracking_number": shipment.tracking_number,
            "status": "delivered",
            "description": "Parcel delivered to front desk signed by J. Dupont.",
            "location": "Geneva, CH",
        }

        resp = self.client.post(webhook_url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["received"])

        # Check cascading effects
        shipment.refresh_from_db()
        self.assertEqual(shipment.status, ShipmentStatus.DELIVERED)
        self.assertIsNotNone(shipment.delivered_at)

        self.order_item.refresh_from_db()
        self.assertEqual(self.order_item.fulfilment_status, OrderItemFulfilmentStatus.DELIVERED)

        self.vendor_order.refresh_from_db()
        self.assertEqual(self.vendor_order.status, VendorOrderStatus.DELIVERED)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.DELIVERED)

        # Check Escrow hold release scheduling
        self.escrow_hold.refresh_from_db()
        self.assertEqual(self.escrow_hold.status, EscrowStatus.ELIGIBLE_FOR_RELEASE)
        self.assertIsNotNone(self.escrow_hold.eligible_at)
        # Should be scheduled approximately 7 days from now
        diff = (self.escrow_hold.eligible_at - timezone.now()).days
        self.assertIn(diff, [6, 7])

    def test_shipment_cancel_pre_pickup(self):
        shipment = shipment_service.create_shipment(
            order=self.order,
            vendor_order=self.vendor_order,
            warehouse=self.warehouse,
            carrier=self.carrier,
            items_data=[{"order_item_id": str(self.order_item.id), "quantity": 2}],
        )

        cancel_url = f"/api/v1/shipping/shipments/{shipment.id}/cancel/"
        self.client.force_authenticate(user=self.vendor_a_user)
        resp = self.client.post(cancel_url, {"reason": "Incorrect packing box used."}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], ShipmentStatus.CANCELLED)

        shipment.refresh_from_db()
        self.assertEqual(shipment.status, ShipmentStatus.CANCELLED)

        self.order_item.refresh_from_db()
        self.assertEqual(self.order_item.fulfilment_status, OrderItemFulfilmentStatus.ALLOCATED)

        # Cannot cancel again
        resp_fail = self.client.post(cancel_url, {"reason": "Already cancelled."})
        self.assertEqual(resp_fail.status_code, status.HTTP_400_BAD_REQUEST)

    def test_vendor_shipments_access_scoping(self):
        shipment = shipment_service.create_shipment(
            order=self.order,
            vendor_order=self.vendor_order,
            warehouse=self.warehouse,
            carrier=self.carrier,
            items_data=[{"order_item_id": str(self.order_item.id), "quantity": 2}],
        )

        url = "/api/v1/shipping/vendor/me/shipments/"

        # Vendor A sees their shipment
        self.client.force_authenticate(user=self.vendor_a_user)
        resp_a = self.client.get(url)
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)
        results_a = resp_a.data.get("results", resp_a.data)
        self.assertEqual(len(results_a), 1)
        self.assertEqual(results_a[0]["id"], str(shipment.id))

        # Vendor B sees none
        self.client.force_authenticate(user=self.vendor_b_user)
        resp_b = self.client.get(url)
        self.assertEqual(resp_b.status_code, status.HTTP_200_OK)
        results_b = resp_b.data.get("results", resp_b.data)
        self.assertEqual(len(results_b), 0)

