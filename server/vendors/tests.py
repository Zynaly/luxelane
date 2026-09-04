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
