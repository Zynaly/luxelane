"""
cart_and_pricing/tests.py — Sprint 8 unit tests.
"""
import datetime
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User, RoleEnum, Address
from vendors.models import Vendor, VendorPolicy
from catalog.models import Category, Product, ProductVariant
from warehouse.models import Warehouse, Inventory
from cart_and_pricing.models import (
    Cart,
    CartItem,
    CartStatus,
    Coupon,
    CouponUsage,
    TaxRate,
    TaxRule,
    DiscountType,
    CouponScope,
)
from cart_and_pricing.services import cart as cart_service
from cart_and_pricing.services import pricing as pricing_service


def make_user(email, role=RoleEnum.CUSTOMER, **kwargs):
    return User.objects.create_user(password="Pass1234!", email=email, role=role, **kwargs)


def auth(client, user):
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


def make_vendor(owner, display_name="Maison Horlogerie"):
    v = Vendor.objects.create(
        owner_user=owner,
        legal_name="Maison Horlogerie LLC",
        display_name=display_name,
        slug=display_name.lower().replace(" ", "-"),
        status="active",
    )
    VendorPolicy.objects.get_or_create(vendor=v)
    return v


def make_variant(vendor, sku, price="100.00", is_active=True, category=None):
    if not category:
        category, _ = Category.objects.get_or_create(name="Timepieces", slug="timepieces")
    product = Product.objects.create(
        vendor=vendor,
        category=category,
        title=f"Luxury Item {sku}",
        slug=sku.lower(),
        status="published",
        is_active=is_active,
        base_price=Decimal(price),
    )
    return ProductVariant.objects.create(
        product=product,
        sku=sku,
        price=Decimal(price),
        weight_kg=Decimal("0.5"),
        length_cm=Decimal("10"),
        width_cm=Decimal("10"),
        height_cm=Decimal("5"),
        is_active=is_active,
    )


# ── Cart Resolution & Session Tests ───────────────────────────────────────────

class CartResolutionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user("cart_user@test.com")

    def test_guest_cart_resolution_via_header(self):
        self.client.credentials(HTTP_X_SESSION_KEY="guest-sess-abc-123")
        resp = self.client.get("/api/v1/cart/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["session_key"], "guest-sess-abc-123")
        self.assertIsNone(resp.data["user"])

    def test_authenticated_user_cart_resolution(self):
        auth(self.client, self.user)
        resp = self.client.get("/api/v1/cart/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["user"], self.user.id)


# ── Cart Item Operations Tests ────────────────────────────────────────────────

class CartItemOperationsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("item_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.variant = make_variant(self.vendor, "SKU-CART-1", price="150.00")
        self.client.credentials(HTTP_X_SESSION_KEY="sess-items-1")

    def test_add_item_to_cart(self):
        resp = self.client.post("/api/v1/cart/items/", {
            "variant_id": str(self.variant.id),
            "quantity": 2,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["items"]), 1)
        self.assertEqual(resp.data["items"][0]["quantity"], 2)
        self.assertEqual(resp.data["items"][0]["price_snapshot"], "150.00")
        self.assertEqual(resp.data["items"][0]["line_subtotal"], "300.00")

    def test_add_duplicate_item_increments_quantity(self):
        self.client.post("/api/v1/cart/items/", {"variant_id": str(self.variant.id), "quantity": 1}, format="json")
        resp = self.client.post("/api/v1/cart/items/", {"variant_id": str(self.variant.id), "quantity": 3}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["items"]), 1)
        self.assertEqual(resp.data["items"][0]["quantity"], 4)

    def test_update_item_quantity(self):
        add_resp = self.client.post("/api/v1/cart/items/", {"variant_id": str(self.variant.id), "quantity": 1}, format="json")
        item_id = add_resp.data["items"][0]["id"]

        resp = self.client.patch(f"/api/v1/cart/items/{item_id}/", {"quantity": 5}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["quantity"], 5)

    def test_delete_item_from_cart(self):
        add_resp = self.client.post("/api/v1/cart/items/", {"variant_id": str(self.variant.id), "quantity": 1}, format="json")
        item_id = add_resp.data["items"][0]["id"]

        del_resp = self.client.delete(f"/api/v1/cart/items/{item_id}/")
        self.assertEqual(del_resp.status_code, 204)

        cart_resp = self.client.get("/api/v1/cart/")
        self.assertEqual(len(cart_resp.data["items"]), 0)


# ── Cart Merge Tests ──────────────────────────────────────────────────────────

class CartMergeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user("merge_user@test.com")
        self.owner = make_user("merge_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.v1 = make_variant(self.vendor, "SKU-M-1", price="100.00")
        self.v2 = make_variant(self.vendor, "SKU-M-2", price="200.00")

    def test_merge_guest_cart_into_authenticated_user_cart(self):
        # 1. Guest adds item v1 (qty 2)
        self.client.credentials(HTTP_X_SESSION_KEY="guest-merge-sess")
        self.client.post("/api/v1/cart/items/", {"variant_id": str(self.v1.id), "quantity": 2}, format="json")

        # 2. User already has v1 (qty 1) and v2 (qty 1) in their account
        user_cart = Cart.objects.create(user=self.user, status=CartStatus.ACTIVE)
        CartItem.objects.create(cart=user_cart, variant=self.v1, quantity=1, price_snapshot=Decimal("100.00"))
        CartItem.objects.create(cart=user_cart, variant=self.v2, quantity=1, price_snapshot=Decimal("200.00"))

        # 3. User logs in and calls merge with the guest session key header
        auth(self.client, self.user)
        self.client.credentials(
            HTTP_AUTHORIZATION=self.client._credentials["HTTP_AUTHORIZATION"],
            HTTP_X_SESSION_KEY="guest-merge-sess",
        )

        resp = self.client.post("/api/v1/cart/merge/")
        self.assertEqual(resp.status_code, 200)

        # v1 should now have 1 + 2 = 3 quantity
        v1_item = next(i for i in resp.data["items"] if i["variant_sku"] == "SKU-M-1")
        self.assertEqual(v1_item["quantity"], 3)
        self.assertEqual(len(resp.data["items"]), 2)

        # Guest cart marked CONVERTED
        guest_cart = Cart.objects.get(session_key="guest-merge-sess")
        self.assertEqual(guest_cart.status, CartStatus.CONVERTED)


# ── Pricing & Coupon Calculation Tests ────────────────────────────────────────

class PricingCalculationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("price_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.cat1 = Category.objects.create(name="Watches", slug="watches")
        self.cat2 = Category.objects.create(name="Leather", slug="leather")

        self.v1 = make_variant(self.vendor, "SKU-P-1", price="100.00", category=self.cat1)
        self.v2 = make_variant(self.vendor, "SKU-P-2", price="200.00", category=self.cat2)

        self.cart = Cart.objects.create(session_key="price-sess")
        CartItem.objects.create(cart=self.cart, variant=self.v1, quantity=2, price_snapshot=Decimal("100.00")) # 200
        CartItem.objects.create(cart=self.cart, variant=self.v2, quantity=1, price_snapshot=Decimal("200.00")) # 200 -> Subtotal 400

    def test_subtotal_calculation(self):
        breakdown = pricing_service.calculate(self.cart)
        self.assertEqual(breakdown["subtotal"], "400.00")
        self.assertEqual(breakdown["grand_total"], "400.00")

    def test_global_percent_coupon(self):
        now = timezone.now()
        coupon = Coupon.objects.create(
            code="SUMMER20",
            discount_type=DiscountType.PERCENT,
            discount_value=Decimal("20.00"),
            scope=CouponScope.ALL,
            valid_from=now - datetime.timedelta(days=1),
            valid_to=now + datetime.timedelta(days=30),
            is_active=True,
        )
        self.cart.applied_coupon = coupon
        self.cart.save()

        breakdown = pricing_service.calculate(self.cart)
        self.assertEqual(breakdown["subtotal"], "400.00")
        self.assertEqual(breakdown["discount_total"], "80.00")  # 20% of 400 = 80
        self.assertEqual(breakdown["grand_total"], "320.00")

    def test_scoped_category_coupon(self):
        now = timezone.now()
        coupon = Coupon.objects.create(
            code="WATCH50",
            discount_type=DiscountType.PERCENT,
            discount_value=Decimal("50.00"),
            scope=CouponScope.CATEGORY,
            scope_target_id=self.cat1.id,  # Applies only to Watches (v1 subtotal = 200)
            valid_from=now - datetime.timedelta(days=1),
            valid_to=now + datetime.timedelta(days=30),
            is_active=True,
        )
        self.cart.applied_coupon = coupon
        self.cart.save()

        breakdown = pricing_service.calculate(self.cart)
        self.assertEqual(breakdown["discount_total"], "100.00")  # 50% of 200 = 100
        self.assertEqual(breakdown["grand_total"], "300.00")

    def test_min_cart_value_enforcement(self):
        now = timezone.now()
        coupon = Coupon.objects.create(
            code="VIP1000",
            discount_type=DiscountType.FIXED,
            discount_value=Decimal("100.00"),
            min_cart_value=Decimal("1000.00"),
            valid_from=now - datetime.timedelta(days=1),
            valid_to=now + datetime.timedelta(days=30),
            is_active=True,
        )
        self.cart.applied_coupon = coupon
        self.cart.save()

        breakdown = pricing_service.calculate(self.cart)
        self.assertEqual(breakdown["discount_total"], "0.00")
        self.assertEqual(breakdown["grand_total"], "400.00")


# ── Cart Coupon & Summary Endpoints Tests ─────────────────────────────────────

class CartCouponEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("cp_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.variant = make_variant(self.vendor, "SKU-CP-1", price="50.00")

        now = timezone.now()
        self.coupon = Coupon.objects.create(
            code="LUXE10",
            discount_type=DiscountType.PERCENT,
            discount_value=Decimal("10.00"),
            valid_from=now - datetime.timedelta(days=1),
            valid_to=now + datetime.timedelta(days=30),
            is_active=True,
        )
        self.client.credentials(HTTP_X_SESSION_KEY="coupon-sess-1")
        self.client.post("/api/v1/cart/items/", {"variant_id": str(self.variant.id), "quantity": 2}, format="json")

    def test_apply_and_remove_coupon(self):
        resp = self.client.post("/api/v1/cart/apply-coupon/", {"code": "LUXE10"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["applied_coupon_code"], "LUXE10")
        self.assertEqual(resp.data["price_breakdown"]["discount_total"], "10.00")

        # Remove coupon
        del_resp = self.client.delete("/api/v1/cart/remove-coupon/")
        self.assertEqual(del_resp.status_code, 200)
        self.assertIsNone(del_resp.data["applied_coupon_code"])

    def test_coupon_validate_preview_endpoint(self):
        resp = self.client.post("/api/v1/coupons/validate/", {
            "code": "LUXE10",
            "subtotal": "500.00",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["is_valid"])
        self.assertEqual(resp.data["estimated_discount"], "50.00")


# ── Cart Validation Tests ─────────────────────────────────────────────────────

class CartValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("val_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.variant = make_variant(self.vendor, "SKU-VAL-1", price="250.00")

        self.wh = Warehouse.objects.create(name="London Hub", is_active=True)
        Inventory.objects.create(warehouse=self.wh, variant=self.variant, on_hand=10)

        self.cart = Cart.objects.create(session_key="val-sess")
        self.item = CartItem.objects.create(
            cart=self.cart,
            variant=self.variant,
            quantity=5,
            price_snapshot=Decimal("250.00"),
        )
        self.client.credentials(HTTP_X_SESSION_KEY="val-sess")

    def test_cart_valid_when_prices_and_stock_match(self):
        resp = self.client.get("/api/v1/cart/validate/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["is_valid"])
        self.assertEqual(len(resp.data["issues"]), 0)

    def test_cart_detects_price_drift(self):
        # Merchant raises price to 300.00
        self.variant.price = Decimal("300.00")
        self.variant.save()

        resp = self.client.get("/api/v1/cart/validate/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["is_valid"])
        self.assertEqual(resp.data["issues"][0]["issue_type"], "price_changed")

    def test_cart_detects_out_of_stock(self):
        # Customer requests 15 units, only 10 available
        self.item.quantity = 15
        self.item.save()

        resp = self.client.get("/api/v1/cart/validate/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["is_valid"])
        self.assertEqual(resp.data["issues"][0]["issue_type"], "out_of_stock")


# ── Tax Quote Tests ───────────────────────────────────────────────────────────

class TaxQuoteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        TaxRate.objects.create(country="US", state="NY", rate_pct=Decimal("8.875"))
        TaxRate.objects.create(country="GB", state="", rate_pct=Decimal("20.00"))

    def test_tax_quote_endpoint(self):
        resp = self.client.post("/api/v1/checkout/tax-quote/", {
            "country": "GB",
            "subtotal": "500.00",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["rate_pct"], "20.00")
        self.assertEqual(resp.data["tax_amount"], "100.00")


# ── Admin Coupon CRUD Tests ───────────────────────────────────────────────────

class AdminCouponTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("admin_cp@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.customer = make_user("cust_cp@test.com", role=RoleEnum.CUSTOMER)

    def test_admin_can_create_coupon(self):
        auth(self.client, self.admin)
        now = timezone.now()
        resp = self.client.post("/api/v1/admin/coupons/", {
            "code": "BLACKFRIDAY",
            "discount_type": "percent",
            "discount_value": "30.00",
            "scope": "all",
            "valid_from": now.isoformat(),
            "valid_to": (now + datetime.timedelta(days=7)).isoformat(),
            "is_active": True,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["code"], "BLACKFRIDAY")

    def test_customer_forbidden_from_admin_coupons(self):
        auth(self.client, self.customer)
        resp = self.client.get("/api/v1/admin/coupons/")
        self.assertEqual(resp.status_code, 403)
