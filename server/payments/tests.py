import json
import uuid
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Address
from catalog.models import Category, Brand, Product, ProductVariant
from warehouse.models import Warehouse, Inventory, InventoryReservation, ReservationStatus
from cart_and_pricing.models import Cart, CartItem
from shipping.models import Carrier, RateQuote
from orders.models import Order, OrderStatus, VendorOrder, VendorOrderStatus, OrderItem, OrderItemFulfilmentStatus
from payments.models import (
    PaymentAttempt,
    PaymentAttemptStatus,
    Transaction,
    TransactionType,
    TransactionStatus,
    SavedCard,
    WebhookEvent,
    WebhookSource,
    WebhookStatus,
    PaymentGateway,
)
from payments.tasks import process_webhook_event

User = get_user_model()


class PaymentsAppTests(APITestCase):
    def setUp(self):
        # 1. Users
        self.customer = User.objects.create_user(
            email="patron_pay@luxelane.com",
            password="SecurePassword123!",
            role="customer",
        )
        self.other_customer = User.objects.create_user(
            email="other_patron@luxelane.com",
            password="SecurePassword123!",
            role="customer",
        )
        self.finance_admin = User.objects.create_user(
            email="finance@luxelane.com",
            password="SecurePassword123!",
            role="finance_admin",
        )
        self.platform_admin = User.objects.create_user(
            email="platform_admin@luxelane.com",
            password="SecurePassword123!",
            role="platform_admin",
        )
        self.vendor_owner = User.objects.create_user(
            email="vendor_pay@luxelane.com",
            password="SecurePassword123!",
            role="vendor_owner",
        )

        from vendors.models import Vendor
        self.vendor = Vendor.objects.create(
            owner_user=self.vendor_owner,
            legal_name="Maison Pay Vendome",
            display_name="Maison Pay",
            status="active",
        )

        # 2. Catalog & Inventory Setup
        self.category = Category.objects.create(name="Horology", slug="horology")
        self.brand = Brand.objects.create(name="Patek", slug="patek")
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            brand=self.brand,
            title="Nautilus 5711",
            slug="nautilus-5711",
            base_price=Decimal("35000.00"),
            status="active",
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="PP-5711-BLU",
            price=Decimal("35000.00"),
            is_active=True,
        )

        self.warehouse = Warehouse.objects.create(
            name="Geneva Atelier Hub",
            is_active=True,
        )
        self.inventory = Inventory.objects.create(
            variant=self.variant,
            warehouse=self.warehouse,
            on_hand=10,
            reserved_cache=0,
        )

        # 3. Create Sample Order
        self.order = Order.objects.create(
            customer=self.customer,
            order_number="ORD-20260909-PAY001",
            currency="USD",
            subtotal=Decimal("35000.00"),
            shipping_total=Decimal("150.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("35150.00"),
            status=OrderStatus.PENDING_PAYMENT,
            shipping_address_snapshot={"line1": "Rue du Rhone 42", "city": "Geneva", "country": "CH"},
        )
        self.vendor_order = VendorOrder.objects.create(
            order=self.order,
            vendor=self.vendor,
            subtotal=Decimal("35000.00"),
            shipping_amount=Decimal("150.00"),
            commission_amount=Decimal("3500.00"),
            commission_pct_applied=Decimal("10.00"),
            vendor_net_amount=Decimal("31500.00"),
            status=VendorOrderStatus.PENDING,
        )
        self.order_item = OrderItem.objects.create(
            vendor_order=self.vendor_order,
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=1,
            unit_price=Decimal("35000.00"),
            line_subtotal=Decimal("35000.00"),
            fulfilment_status=OrderItemFulfilmentStatus.ALLOCATED,
        )

        # Hold reservation
        self.reservation = InventoryReservation.objects.create(
            inventory=self.inventory,
            quantity=1,
            status=ReservationStatus.HELD,
            expires_at=timezone.now() + timedelta(minutes=15),
        )

    def test_payment_methods_list(self):
        """Customer retrieves available gateways and saved cards."""
        # Create a saved card for customer
        SavedCard.objects.create(
            user=self.customer,
            gateway="stripe",
            gateway_payment_method_id="pm_tok_123",
            brand="Mastercard",
            last4="8888",
            exp_month=11,
            exp_year=2029,
            is_default=True,
        )

        self.client.force_authenticate(user=self.customer)
        url = "/api/v1/payments/methods/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("available_gateways", resp.data)
        self.assertIn("saved_cards", resp.data)
        self.assertEqual(len(resp.data["saved_cards"]), 1)
        self.assertEqual(resp.data["saved_cards"][0]["last4"], "8888")

    def test_saved_cards_crud(self):
        """Customer can save, list, and delete tokenized cards."""
        self.client.force_authenticate(user=self.customer)

        # 1. Create
        url = "/api/v1/payments/cards/"
        payload = {
            "gateway": "stripe",
            "payment_method_id": "pm_tok_visa_4242",
            "brand": "Visa",
            "last4": "4242",
            "exp_month": 12,
            "exp_year": 2028,
            "is_default": True,
        }
        create_resp = self.client.post(url, payload, format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        card_id = create_resp.data["id"]

        # 2. List
        list_resp = self.client.get(url)
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get("results", list_resp.data)
        self.assertEqual(len(results), 1)

        # 3. Isolation: other customer cannot see this card
        self.client.force_authenticate(user=self.other_customer)
        other_resp = self.client.get(url)
        other_results = other_resp.data.get("results", other_resp.data)
        self.assertEqual(len(other_results), 0)

        # 4. Delete
        self.client.force_authenticate(user=self.customer)
        del_resp = self.client.delete(f"/api/v1/payments/cards/{card_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(SavedCard.objects.filter(id=card_id).count(), 0)

    def test_stripe_create_payment_intent(self):
        """Owner can initiate a Stripe PaymentIntent for their order."""
        self.client.force_authenticate(user=self.customer)
        url = "/api/v1/payments/stripe/create-payment-intent/"
        payload = {"order_id": str(self.order.id)}

        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("client_secret", resp.data)
        self.assertIn("payment_intent_id", resp.data)

        # Verify PaymentAttempt created in DB
        attempt = PaymentAttempt.objects.filter(order=self.order).first()
        self.assertIsNotNone(attempt)
        self.assertEqual(attempt.gateway, PaymentGateway.STRIPE)
        self.assertEqual(attempt.status, PaymentAttemptStatus.REQUIRES_ACTION)

        # Other user cannot initiate intent for this order
        self.client.force_authenticate(user=self.other_customer)
        resp_forbidden = self.client.post(url, payload, format="json")
        self.assertEqual(resp_forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_stripe_confirm_payment(self):
        """In-session Stripe confirmation transitions order to confirmed and commits holds."""
        self.client.force_authenticate(user=self.customer)

        # Create intent first
        intent_resp = self.client.post(
            "/api/v1/payments/stripe/create-payment-intent/",
            {"order_id": str(self.order.id)},
            format="json",
        )
        pi_id = intent_resp.data["payment_intent_id"]

        # Confirm payment
        confirm_resp = self.client.post(
            "/api/v1/payments/stripe/confirm/",
            {"payment_intent_id": pi_id},
            format="json",
        )
        self.assertEqual(confirm_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_resp.data["status"], "succeeded")

        # Verify Order is confirmed
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

        # Verify Transaction recorded
        txn = Transaction.objects.filter(gateway_transaction_id=pi_id).first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.status, TransactionStatus.SUCCEEDED)
        self.assertEqual(txn.type, TransactionType.CAPTURE)

    def test_stripe_webhook_ingest_and_deduplication(self):
        """Webhook verifies, deduplicates, and triggers async processing."""
        pi_id = f"pi_mock_webhook_{uuid.uuid4().hex[:12]}"
        attempt = PaymentAttempt.objects.create(
            order=self.order,
            gateway=PaymentGateway.STRIPE,
            amount=self.order.grand_total,
            currency="USD",
            status=PaymentAttemptStatus.REQUIRES_ACTION,
            gateway_attempt_id=pi_id,
        )

        payload = {
            "id": f"evt_test_{uuid.uuid4().hex[:12]}",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": pi_id,
                    "amount": 3515000,
                    "currency": "usd",
                    "status": "succeeded",
                }
            },
        }

        url = "/api/v1/payments/stripe/webhook/"
        # Unauthenticated public signed endpoint
        resp = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data.get("received"))

        # Check WebhookEvent created
        event = WebhookEvent.objects.filter(provider_event_id=payload["id"]).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.source, WebhookSource.STRIPE)

        # Execute task worker directly to test asynchronous handler
        process_webhook_event(str(event.id))

        event.refresh_from_db()
        self.assertEqual(event.status, WebhookStatus.PROCESSED)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

        # Duplicate webhook ingestion with same provider_event_id returns 200 without creating new row
        resp2 = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(WebhookEvent.objects.filter(provider_event_id=payload["id"]).count(), 1)

    def test_authorizenet_charge_flow(self):
        """Authorize.Net opaque token charge confirms order and logs transaction."""
        self.client.force_authenticate(user=self.customer)
        url = "/api/v1/payments/authorize-net/charge/"
        payload = {
            "order_id": str(self.order.id),
            "opaque_data_descriptor": "COMMON.ACCEPT.INAPP.PAYMENT",
            "opaque_data_value": "eyJjb2RlIjoiNTBfMl8wNjAw...==",
        }

        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data.get("success"))
        self.assertIn("transaction_id", resp.data)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

        txn = Transaction.objects.filter(gateway_transaction_id=resp.data["transaction_id"]).first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.status, TransactionStatus.SUCCEEDED)

    def test_admin_transactions_and_webhook_replay(self):
        """Finance admin lists transactions; Platform admin replays failed webhook."""
        # 1. Customer cannot access admin transactions
        self.client.force_authenticate(user=self.customer)
        resp_cust = self.client.get("/api/v1/admin/transactions/")
        self.assertEqual(resp_cust.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Finance Admin can view transactions
        self.client.force_authenticate(user=self.finance_admin)
        Transaction.objects.create(
            order=self.order,
            gateway_transaction_id="txn_admin_test_001",
            type=TransactionType.CAPTURE,
            amount=self.order.grand_total,
            currency="USD",
            status=TransactionStatus.SUCCEEDED,
        )
        resp_admin = self.client.get("/api/v1/admin/transactions/")
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp_admin.data["results"]), 1)

        # 3. Platform Admin can trigger webhook replay
        self.client.force_authenticate(user=self.platform_admin)
        event = WebhookEvent.objects.create(
            source=WebhookSource.STRIPE,
            provider_event_id=f"evt_replay_{uuid.uuid4().hex[:8]}",
            raw_payload={"type": "payment_intent.succeeded"},
            status=WebhookStatus.FAILED,
        )

        replay_resp = self.client.post(f"/api/v1/admin/webhooks/{event.id}/replay/")
        self.assertEqual(replay_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(replay_resp.data["replay_count"], 1)

        event.refresh_from_db()
        self.assertEqual(event.replay_count, 1)
