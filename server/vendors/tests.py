"""
vendors/tests.py — Sprint 3 unit tests.
Tests cover: application, me endpoint, storefront, staff CRUD,
bank accounts, documents, policy, admin status update, document review,
commission rules.
"""
import datetime
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from accounts.models import User, RoleEnum
from vendors.models import Vendor, VendorStaff, VendorDocument, VendorBankAccount, VendorPolicy, CommissionRule


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_user(email, role=RoleEnum.CUSTOMER, **kwargs):
    return User.objects.create_user(password="Pass1234!", email=email, role=role, **kwargs)


def make_vendor(owner, display_name="LuxBrand", status="active"):
    vendor = Vendor.objects.create(
        owner_user=owner,
        legal_name="Lux Brands Ltd.",
        display_name=display_name,
        slug=display_name.lower().replace(" ", "-"),
        status=status,
    )
    VendorPolicy.objects.get_or_create(vendor=vendor)
    return vendor


def auth(client, user):
    from rest_framework_simplejwt.tokens import RefreshToken
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


# ── VendorApplicationView ─────────────────────────────────────────────────────

class VendorApplicationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/v1/vendors/apply/"

    def test_customer_can_apply(self):
        user = make_user("apply@test.com", role=RoleEnum.CUSTOMER)
        auth(self.client, user)
        resp = self.client.post(self.url, {
            "legal_name": "Apply Co.", "display_name": "ApplyBrand",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertIn("vendor_id", resp.data)
        user.refresh_from_db()
        self.assertEqual(user.role, RoleEnum.VENDOR_OWNER)

    def test_duplicate_application_rejected(self):
        owner = make_user("dupe@test.com", role=RoleEnum.VENDOR_OWNER)
        make_vendor(owner)
        auth(self.client, owner)
        resp = self.client.post(self.url, {
            "legal_name": "Dupe Co.", "display_name": "DupeBrand",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_unauthenticated_cannot_apply(self):
        resp = self.client.post(self.url, {"legal_name": "X", "display_name": "Y"})
        self.assertEqual(resp.status_code, 401)


# ── VendorMeViewSet ───────────────────────────────────────────────────────────

class VendorMeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        auth(self.client, self.owner)

    def test_get_own_vendor(self):
        resp = self.client.get("/api/v1/vendors/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["slug"], self.vendor.slug)

    def test_patch_own_vendor(self):
        resp = self.client.patch("/api/v1/vendors/me/", {"description": "Luxury goods."}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["description"], "Luxury goods.")

    def test_customer_cannot_access_me(self):
        customer = make_user("cust@test.com")
        auth(self.client, customer)
        resp = self.client.get("/api/v1/vendors/me/")
        self.assertEqual(resp.status_code, 403)


# ── VendorStorefrontView ──────────────────────────────────────────────────────

class VendorStorefrontTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("front@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner, status="active")

    def test_public_can_view_storefront(self):
        url = f"/api/v1/vendors/{self.vendor.slug}/storefront/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["slug"], self.vendor.slug)

    def test_pending_vendor_not_visible(self):
        owner2 = make_user("pend@test.com", role=RoleEnum.VENDOR_OWNER)
        v2 = make_vendor(owner2, display_name="Pending Biz", status="pending")
        resp = self.client.get(f"/api/v1/vendors/{v2.slug}/storefront/")
        self.assertEqual(resp.status_code, 404)


# ── VendorStaffViewSet ────────────────────────────────────────────────────────

class VendorStaffTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("staffowner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        auth(self.client, self.owner)

    def test_create_staff_member(self):
        staff_user = make_user("staff@test.com", role=RoleEnum.VENDOR_STAFF)
        resp = self.client.post("/api/v1/vendors/me/staff/", {
            "user": str(staff_user.id),
            "staff_role": "support",
            "is_active": True,
        }, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_list_staff(self):
        resp = self.client.get("/api/v1/vendors/me/staff/")
        self.assertEqual(resp.status_code, 200)


# ── VendorBankAccountViewSet ──────────────────────────────────────────────────

class VendorBankAccountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("bank@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        auth(self.client, self.owner)

    def test_create_bank_account(self):
        resp = self.client.post("/api/v1/vendors/me/bank-accounts/", {
            "account_holder": "Lux Owner",
            "bank_name": "First National",
            "account_number": "123456789012",
            "routing_number": "021000021",
            "account_type": "checking",
            "is_primary": True,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        # account number must be masked in response
        self.assertIn("****", resp.data["account_number"])
        self.assertNotIn("123456789012", resp.data["account_number"])

    def test_list_bank_accounts(self):
        resp = self.client.get("/api/v1/vendors/me/bank-accounts/")
        self.assertEqual(resp.status_code, 200)

    def test_vendor_staff_cannot_access_bank_accounts(self):
        staff_user = make_user("bankstaff@test.com", role=RoleEnum.VENDOR_STAFF)
        auth(self.client, staff_user)
        resp = self.client.get("/api/v1/vendors/me/bank-accounts/")
        self.assertEqual(resp.status_code, 403)


# ── VendorDocumentViewSet ─────────────────────────────────────────────────────

class VendorDocumentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("doc@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        auth(self.client, self.owner)

    def test_upload_document(self):
        resp = self.client.post("/api/v1/vendors/me/documents/", {
            "doc_type": "tax_certificate",
            "file_url": "https://cdn.luxelane.com/docs/tax.pdf",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["status"], "pending")

    def test_list_documents(self):
        resp = self.client.get("/api/v1/vendors/me/documents/")
        self.assertEqual(resp.status_code, 200)


# ── VendorPolicyView ──────────────────────────────────────────────────────────

class VendorPolicyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("policy@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        auth(self.client, self.owner)

    def test_get_policy(self):
        resp = self.client.get("/api/v1/vendors/me/policy/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["return_window_days"], 30)

    def test_update_policy(self):
        resp = self.client.patch("/api/v1/vendors/me/policy/", {
            "return_window_days": 14,
            "return_policy_text": "No returns after 14 days.",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["return_window_days"], 14)


# ── AdminVendorViewSet ────────────────────────────────────────────────────────

class AdminVendorTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.owner = make_user("vendoradm@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner, status="pending")
        auth(self.client, self.admin)

    def test_list_vendors(self):
        resp = self.client.get("/api/v1/admin/vendors/")
        self.assertEqual(resp.status_code, 200)

    def test_retrieve_vendor(self):
        resp = self.client.get(f"/api/v1/admin/vendors/{self.vendor.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("legal_name", resp.data)

    def test_approve_vendor(self):
        resp = self.client.patch(
            f"/api/v1/admin/vendors/{self.vendor.id}/status/",
            {"status": "active"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.status, "active")

    def test_reject_vendor_requires_reason(self):
        resp = self.client.patch(
            f"/api/v1/admin/vendors/{self.vendor.id}/status/",
            {"status": "rejected"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_reject_vendor_with_reason(self):
        resp = self.client.patch(
            f"/api/v1/admin/vendors/{self.vendor.id}/status/",
            {"status": "rejected", "rejection_reason": "Incomplete KYC."},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.vendor.refresh_from_db()
        self.assertEqual(self.vendor.status, "rejected")

    def test_non_admin_cannot_list(self):
        auth(self.client, self.owner)
        resp = self.client.get("/api/v1/admin/vendors/")
        self.assertEqual(resp.status_code, 403)


# ── AdminVendorDocumentReviewView ─────────────────────────────────────────────

class AdminDocumentReviewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("docadm@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.owner = make_user("docowner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.doc = VendorDocument.objects.create(
            vendor=self.vendor,
            doc_type="tax_certificate",
            file_url="https://cdn.example.com/doc.pdf",
        )
        auth(self.client, self.admin)

    def test_approve_document(self):
        url = f"/api/v1/admin/vendors/{self.vendor.id}/documents/{self.doc.id}/review/"
        resp = self.client.patch(url, {"status": "approved"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.status, "approved")

    def test_reject_document_with_note(self):
        url = f"/api/v1/admin/vendors/{self.vendor.id}/documents/{self.doc.id}/review/"
        resp = self.client.patch(url, {"status": "rejected", "reviewer_note": "Image blurry."}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.status, "rejected")
        self.assertEqual(self.doc.reviewer_note, "Image blurry.")


# ── AdminCommissionRuleViewSet ────────────────────────────────────────────────

class AdminCommissionRuleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("commadm@test.com", role=RoleEnum.PLATFORM_ADMIN)
        auth(self.client, self.admin)

    def test_create_platform_default_rule(self):
        resp = self.client.post("/api/v1/admin/commission-rules/", {
            "vendor": None,
            "rate_pct": "15.00",
            "effective_from": "2026-01-01",
            "is_active": True,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.data["vendor"])

    def test_list_commission_rules(self):
        resp = self.client.get("/api/v1/admin/commission-rules/")
        self.assertEqual(resp.status_code, 200)


# ── Sprint 15: Vendor Payouts & Analytics Tests ───────────────────────────────

class Sprint15VendorPayoutAndAnalyticsTests(TestCase):
    def setUp(self):
        from decimal import Decimal
        from accounts.models import User, RoleEnum
        from catalog.models import Category, Brand, Product, ProductVariant
        from warehouse.models import Warehouse
        from orders.models import Order, OrderStatus, VendorOrder, VendorOrderStatus, OrderItem, OrderItemFulfilmentStatus
        from payments.models import EscrowHold, EscrowStatus
        from vendors.models import PayoutAdjustment, PayoutAdjustmentReason

        self.client = APIClient()
        self.vendor_owner = make_user("payout_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.other_vendor_owner = make_user("other_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.finance_admin = make_user("fin_admin@test.com", role=RoleEnum.FINANCE_ADMIN)
        self.customer = make_user("payout_cust@test.com", role=RoleEnum.CUSTOMER)

        self.vendor = make_vendor(self.vendor_owner, display_name="Maison Horlogerie")
        self.other_vendor = make_vendor(self.other_vendor_owner, display_name="Maison Haute")

        self.category = Category.objects.create(name="Horology", slug="horology-payout")
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            title="Skeleton Tourbillon",
            slug="skeleton-tourbillon",
            base_price=Decimal("25000.00"),
            status="approved",
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="SKEL-TOURB-01",
            price=Decimal("25000.00"),
            is_active=True,
        )

        self.order = Order.objects.create(
            customer=self.customer,
            order_number="ORD-20260909-PO001",
            currency="USD",
            subtotal=Decimal("25000.00"),
            grand_total=Decimal("25000.00"),
            status=OrderStatus.CONFIRMED,
        )
        self.vendor_order = VendorOrder.objects.create(
            order=self.order,
            vendor=self.vendor,
            subtotal=Decimal("25000.00"),
            commission_amount=Decimal("2500.00"),
            commission_pct_applied=Decimal("10.00"),
            vendor_net_amount=Decimal("22500.00"),
            status=VendorOrderStatus.DELIVERED,
        )
        self.order_item = OrderItem.objects.create(
            vendor_order=self.vendor_order,
            variant=self.variant,
            quantity=1,
            unit_price=Decimal("25000.00"),
            line_subtotal=Decimal("25000.00"),
            fulfilment_status=OrderItemFulfilmentStatus.DELIVERED,
        )

        # Create mature released escrow hold
        self.escrow_hold = EscrowHold.objects.create(
            vendor_order=self.vendor_order,
            vendor=self.vendor,
            gross_amount=Decimal("25000.00"),
            commission_amount=Decimal("2500.00"),
            net_vendor_amount=Decimal("22500.00"),
            currency="USD",
            status=EscrowStatus.RELEASED,
        )

    def test_admin_process_payout_and_double_entry_ledger(self):
        """Admin processes vendor payout: creates VendorPayout, attaches line items, posts balanced ledger."""
        from decimal import Decimal
        from accounts.models import LedgerEntry
        from vendors.models import VendorPayoutStatus

        auth(self.client, self.finance_admin)
        url = f"/api/v1/admin/vendors/{self.vendor.id}/payouts/process/"
        today = datetime.date.today()
        payload = {
            "period_start": str(today - datetime.timedelta(days=7)),
            "period_end": str(today + datetime.timedelta(days=1)),
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Decimal(resp.data["net_amount"]), Decimal("22500.00"))
        self.assertEqual(resp.data["status"], VendorPayoutStatus.PAID)
        self.assertEqual(len(resp.data["line_items"]), 1)

        # Verify ledger balanced
        group_id = resp.data["ledger_entry_group_id"]
        entries = LedgerEntry.objects.filter(entry_group_id=group_id)
        self.assertEqual(entries.count(), 2)
        self.assertEqual(sum(e.amount for e in entries), Decimal("0.00"))

    def test_payout_idempotency_returns_existing_payout(self):
        """Re-running payout for same vendor and period returns existing payout without duplicating."""
        from vendors.services.payouts import payout_service

        today = datetime.date.today()
        start = today - datetime.timedelta(days=7)
        end = today + datetime.timedelta(days=1)

        p1 = payout_service.run_payout_batch(self.vendor, start, end)
        self.assertIsNotNone(p1)

        # Second call returns p1 directly
        p2 = payout_service.run_payout_batch(self.vendor, start, end)
        self.assertEqual(p1.id, p2.id)

    def test_payout_with_clawback_adjustment(self):
        """Clawback adjustment reduces net payable amount."""
        from decimal import Decimal
        from vendors.models import PayoutAdjustment, PayoutAdjustmentReason
        from vendors.services.payouts import payout_service

        PayoutAdjustment.objects.create(
            vendor=self.vendor,
            amount=Decimal("-500.00"),
            reason=PayoutAdjustmentReason.POST_RELEASE_REFUND,
            note="Customer concession clawback",
        )

        today = datetime.date.today()
        payout = payout_service.run_payout_batch(
            self.vendor,
            today - datetime.timedelta(days=7),
            today + datetime.timedelta(days=1),
        )
        self.assertIsNotNone(payout)
        self.assertEqual(payout.gross_amount, Decimal("22500.00"))
        self.assertEqual(payout.adjustments_total, Decimal("-500.00"))
        self.assertEqual(payout.net_amount, Decimal("22000.00"))

    def test_vendor_my_payouts_scoping(self):
        """Vendor owner lists own payouts; other vendor cannot see them."""
        from vendors.services.payouts import payout_service

        today = datetime.date.today()
        payout_service.run_payout_batch(
            self.vendor,
            today - datetime.timedelta(days=7),
            today + datetime.timedelta(days=1),
        )

        # Owner gets own payouts
        auth(self.client, self.vendor_owner)
        resp = self.client.get("/api/v1/vendors/me/payouts/")
        self.assertEqual(resp.status_code, 200)
        items = resp.data.get("results", resp.data)
        self.assertEqual(len(items), 1)

        # Other vendor owner gets empty list
        auth(self.client, self.other_vendor_owner)
        other_resp = self.client.get("/api/v1/vendors/me/payouts/")
        self.assertEqual(other_resp.status_code, 200)
        other_items = other_resp.data.get("results", other_resp.data)
        self.assertEqual(len(other_items), 0)

        # Customer forbidden
        auth(self.client, self.customer)
        cust_resp = self.client.get("/api/v1/vendors/me/payouts/")
        self.assertEqual(cust_resp.status_code, 403)

    def test_vendor_analytics_endpoint(self):
        """Vendor owner retrieves revenue time-series and top products analytics."""
        auth(self.client, self.vendor_owner)
        resp = self.client.get("/api/v1/vendors/me/analytics/?days=30")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("revenue_by_day", resp.data)
        self.assertIn("top_products", resp.data)
        self.assertIn("order_count", resp.data)
        self.assertIn("return_rate", resp.data)
        self.assertEqual(resp.data["order_count"], 1)

    def test_admin_process_all_due_payouts(self):
        """Admin triggers batch payout for all eligible vendors."""
        auth(self.client, self.finance_admin)
        url = "/api/v1/admin/payouts/process/"
        today = datetime.date.today()
        payload = {
            "period_start": str(today - datetime.timedelta(days=7)),
            "period_end": str(today + datetime.timedelta(days=1)),
            "process_all": True,
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertIn("payouts", resp.data)
        self.assertGreaterEqual(resp.data["count"], 1)

