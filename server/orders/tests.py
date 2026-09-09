"""
orders/tests.py — Comprehensive unit tests for Sprint 10: Orders & Checkout Orchestration.
"""
from decimal import Decimal
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Address
from catalog.models import Category, Brand, Product, ProductVariant
from cart_and_pricing.models import Cart, CartItem
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
from shipping.models import Carrier, ShippingZone, ShippingRateCard, RateQuote
from vendors.models import Vendor, VendorStaff, CommissionRule
from warehouse.models import Warehouse, Inventory

User = get_user_model()


class OrdersOrchestrationTests(APITestCase):
    def setUp(self):
        # 1. Users
        self.customer = User.objects.create_user(
            email="shopper_order@luxelane.com",
            password="Password123!",
            first_name="Lady",
            last_name="Shopper",
            role="customer",
        )
        self.vendor_owner_a = User.objects.create_user(
            email="vendor_a@luxelane.com",
            password="Password123!",
            first_name="Hans",
            last_name="Wilsdorf",
            role="vendor_owner",
        )
        self.vendor_owner_b = User.objects.create_user(
            email="vendor_b@luxelane.com",
            password="Password123!",
            first_name="Louis",
            last_name="Cartier",
            role="vendor_owner",
        )
        self.admin = User.objects.create_user(
            email="platform_admin_order@luxelane.com",
            password="Password123!",
            first_name="Platform",
            last_name="Director",
            role="platform_admin",
        )

        # 2. Vendors
        self.vendor_a = Vendor.objects.create(
            owner_user=self.vendor_owner_a,
            legal_name="Atelier Horology A SA",
            display_name="Atelier Horology",
            slug="atelier-horology-a",
            status="active",
        )
        VendorStaff.objects.create(vendor=self.vendor_a, user=self.vendor_owner_a, staff_role="manager", is_active=True)

        self.vendor_b = Vendor.objects.create(
            owner_user=self.vendor_owner_b,
            legal_name="Maison Joaillerie B SAS",
            display_name="Maison Joaillerie",
            slug="maison-joaillerie-b",
            status="active",
        )
        VendorStaff.objects.create(vendor=self.vendor_b, user=self.vendor_owner_b, staff_role="manager", is_active=True)

        # Commission Rule
        CommissionRule.objects.create(
            vendor=self.vendor_a,
            rate_pct=Decimal("15.00"),
            effective_from=timezone.now().date(),
            is_active=True,
        )

        # 3. Warehouse & Inventory
        self.warehouse_address = Address.objects.create(
            user=self.admin,
            label="Geneva Vault",
            line1="Rue du Rhone 42",
            city="Geneva",
            country="CH",
            postal_code="1204",
        )
        self.warehouse = Warehouse.objects.create(
            name="Central Alpine Vault",
            address=self.warehouse_address,
            is_active=True,
            sla_hours=24,
        )

        # 4. Catalog Products & Variants
        self.category = Category.objects.create(name="Horlogerie", slug="horlogerie-ord", is_active=True)
        self.brand_a = Brand.objects.create(name="Geneva Atelier", slug="geneva-ord")
        self.product_a = Product.objects.create(
            vendor=self.vendor_a,
            category=self.category,
            brand=self.brand_a,
            title="Perpetual Royal Chronograph",
            slug="perpetual-royal-chrono",
            base_price=Decimal("1500.00"),
            status="approved",
            is_active=True,
        )
        self.variant_a = ProductVariant.objects.create(
            product=self.product_a,
            sku="ROYAL-CHRONO-PLAT",
            price=Decimal("1500.00"),
            weight_kg=Decimal("0.80"),
            is_active=True,
        )
        # Stock inventory
        self.inventory_a = Inventory.objects.create(
            warehouse=self.warehouse,
            variant=self.variant_a,
            on_hand=10,
            reserved_cache=0,
        )

        # Product B
        self.product_b = Product.objects.create(
            vendor=self.vendor_b,
            category=self.category,
            title="Diamond Baguette Cuff",
            slug="diamond-baguette-cuff",
            base_price=Decimal("2500.00"),
            status="approved",
            is_active=True,
        )
        self.variant_b = ProductVariant.objects.create(
            product=self.product_b,
            sku="DIAMOND-CUFF-01",
            price=Decimal("2500.00"),
            weight_kg=Decimal("0.30"),
            is_active=True,
        )
        self.inventory_b = Inventory.objects.create(
            warehouse=self.warehouse,
            variant=self.variant_b,
            on_hand=5,
            reserved_cache=0,
        )

        # 5. Shipping Carrier & RateQuote
        self.carrier = Carrier.objects.create(code="dhl_express", name="DHL Express Worldwide", is_active=True)
        self.rate_quote = RateQuote.objects.create(
            cart_or_order_ref=uuid.uuid4(),
            carrier=self.carrier,
            service_level="express",
            amount=Decimal("45.00"),
            quote_id=f"rq_dhl_{uuid.uuid4().hex[:8]}",
            expires_at=timezone.now() + timedelta(hours=24),
            redeemed=False,
        )

        # 6. Customer Cart
        self.cart = Cart.objects.create(user=self.customer, status="active")
        self.cart_item_a = CartItem.objects.create(
            cart=self.cart,
            variant=self.variant_a,
            quantity=1,
            price_snapshot=Decimal("1500.00"),
        )
        self.cart_item_b = CartItem.objects.create(
            cart=self.cart,
            variant=self.variant_b,
            quantity=1,
            price_snapshot=Decimal("2500.00"),
        )

    def test_place_order_multi_vendor_success(self):
        url = "/api/v1/checkout/place-order/"
        self.client.force_authenticate(user=self.customer)

        payload = {
            "cart_id": str(self.cart.id),
            "rate_quote_id": self.rate_quote.quote_id,
            "shipping_address": {
                "line1": "740 Park Avenue",
                "city": "New York",
                "state": "NY",
                "country": "US",
                "postal_code": "10021",
            },
            "payment_method": "fake",
        }

        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.data

        self.assertIn("order_number", data)
        self.assertEqual(data["status"], OrderStatus.CONFIRMED)
        self.assertEqual(data["item_count"], 2)

        # Verify DB Order
        order = Order.objects.get(order_number=data["order_number"])
        self.assertEqual(order.customer, self.customer)
        self.assertEqual(order.status, OrderStatus.CONFIRMED)
        self.assertEqual(order.subtotal, Decimal("4000.00"))
        self.assertEqual(order.shipping_total, Decimal("45.00"))
        self.assertEqual(order.grand_total, Decimal("4045.00"))

        # Verify Multi-vendor split (2 VendorOrders)
        self.assertEqual(order.vendor_orders.count(), 2)

        vo_a = order.vendor_orders.get(vendor=self.vendor_a)
        self.assertEqual(vo_a.subtotal, Decimal("1500.00"))
        self.assertEqual(vo_a.commission_pct_applied, Decimal("15.00"))
        self.assertEqual(vo_a.commission_amount, Decimal("225.00"))
        self.assertEqual(vo_a.vendor_net_amount, Decimal("1275.00"))
        self.assertEqual(vo_a.items.count(), 1)

        vo_b = order.vendor_orders.get(vendor=self.vendor_b)
        self.assertEqual(vo_b.subtotal, Decimal("2500.00"))
        self.assertEqual(vo_b.commission_pct_applied, Decimal("10.00"))  # Default
        self.assertEqual(vo_b.commission_amount, Decimal("250.00"))
        self.assertEqual(vo_b.vendor_net_amount, Decimal("2250.00"))
        self.assertEqual(vo_b.items.count(), 1)

        # Verify OrderItems
        for vo in order.vendor_orders.all():
            for it in vo.items.all():
                self.assertEqual(it.fulfilment_status, OrderItemFulfilmentStatus.ALLOCATED)
                self.assertEqual(it.warehouse, self.warehouse)

        # Verify RateQuote is redeemed
        self.rate_quote.refresh_from_db()
        self.assertTrue(self.rate_quote.redeemed)

        # Verify Cart is converted
        self.cart.refresh_from_db()
        self.assertEqual(self.cart.status, "converted")

        # Verify Invoice exists
        self.assertTrue(Invoice.objects.filter(order=order).exists())

        # Verify OutboxEvent
        self.assertTrue(OutboxEvent.objects.filter(event_type="order.placed").exists())

    def test_idempotency_key_replay(self):
        url = "/api/v1/checkout/place-order/"
        self.client.force_authenticate(user=self.customer)
        idempotency_key = f"idem_{uuid.uuid4().hex}"

        payload = {
            "cart_id": str(self.cart.id),
            "rate_quote_id": self.rate_quote.quote_id,
            "shipping_address": {
                "line1": "740 Park Avenue",
                "city": "New York",
                "state": "NY",
                "country": "US",
                "postal_code": "10021",
            },
        }

        # First request
        resp1 = self.client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=idempotency_key)
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        order_num_1 = resp1.data["order_number"]

        # Replay duplicate request with same Idempotency-Key
        resp2 = self.client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=idempotency_key)
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED)
        order_num_2 = resp2.data["order_number"]

        # Must return the exact same order snapshot without creating a second order
        self.assertEqual(order_num_1, order_num_2)
        self.assertEqual(Order.objects.count(), 1)

    def test_guest_checkout_and_public_tracking(self):
        url = "/api/v1/checkout/place-order/"
        # Unauthenticated client
        self.client.logout()

        payload = {
            "cart_id": str(self.cart.id),
            "rate_quote_id": self.rate_quote.quote_id,
            "guest_email": "guest_aristocrat@luxelane.com",
            "guest_phone": "+12125550199",
            "shipping_address": {
                "line1": "100 Ocean Drive",
                "city": "Miami",
                "state": "FL",
                "country": "US",
                "postal_code": "33139",
            },
        }

        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        order_number = resp.data["order_number"]

        # Track order as public guest
        track_url = "/api/v1/orders/track/"
        track_resp = self.client.post(track_url, {
            "order_number": order_number,
            "email_or_phone": "guest_aristocrat@luxelane.com",
        }, format="json")

        self.assertEqual(track_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(track_resp.data["order_number"], order_number)
        self.assertEqual(track_resp.data["status"], OrderStatus.CONFIRMED)
        self.assertEqual(track_resp.data["item_count"], 2)

    def test_customer_order_cancellation(self):
        # Create an existing confirmed order
        order = Order.objects.create(
            customer=self.customer,
            order_number=Order.generate_order_number(),
            subtotal=Decimal("1500.00"),
            grand_total=Decimal("1500.00"),
            status=OrderStatus.CONFIRMED,
        )
        vo = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor_a,
            subtotal=Decimal("1500.00"),
            vendor_net_amount=Decimal("1275.00"),
            status=VendorOrderStatus.CONFIRMED,
        )

        cancel_url = f"/api/v1/orders/{order.id}/cancel/"
        self.client.force_authenticate(user=self.customer)

        resp = self.client.post(cancel_url, {"reason": "Changed my mind before shipping."}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        order.refresh_from_db()
        vo.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CANCELLED)
        self.assertEqual(vo.status, VendorOrderStatus.CANCELLED)

    def test_vendor_my_orders_scoping(self):
        # Create order for Vendor A and order for Vendor B
        order = Order.objects.create(
            customer=self.customer,
            order_number=Order.generate_order_number(),
            subtotal=Decimal("4000.00"),
            grand_total=Decimal("4000.00"),
            status=OrderStatus.CONFIRMED,
        )
        vo_a = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor_a,
            subtotal=Decimal("1500.00"),
            vendor_net_amount=Decimal("1275.00"),
            status=VendorOrderStatus.CONFIRMED,
        )
        vo_b = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor_b,
            subtotal=Decimal("2500.00"),
            vendor_net_amount=Decimal("2250.00"),
            status=VendorOrderStatus.CONFIRMED,
        )

        url = "/api/v1/vendors/me/orders/"
        self.client.force_authenticate(user=self.vendor_owner_a)

        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)

        # Vendor A only sees their own VendorOrder
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], str(vo_a.id))
        self.assertEqual(Decimal(results[0]["subtotal"]), Decimal("1500.00"))

    def test_admin_orders_list(self):
        Order.objects.create(
            customer=self.customer,
            order_number=Order.generate_order_number(),
            subtotal=Decimal("1000.00"),
            grand_total=Decimal("1000.00"),
            status=OrderStatus.CONFIRMED,
        )

        url = "/api/v1/admin/orders/"
        self.client.force_authenticate(user=self.admin)

        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertGreaterEqual(len(results), 1)
