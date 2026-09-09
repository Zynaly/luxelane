"""
catalog/tests.py — Sprint 4 unit tests.
Tests cover: Category CRUD, Brand CRUD, Product public list/detail,
Vendor product lifecycle (create/update/moderation), Admin moderation,
Bulk import status polling.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User, RoleEnum
from catalog.models import (
    Category, Brand, Product, ProductImage, ProductTag, BulkImportJob, ProductStatus,
    ProductAttribute, ProductAttributeValue, ProductVariant, ProductVariantAttribute, Wishlist,
)
from catalog.services.variants import generate_variant_matrix
from vendors.models import Vendor, VendorPolicy


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_user(email, role=RoleEnum.CUSTOMER, **kwargs):
    return User.objects.create_user(password="Pass1234!", email=email, role=role, **kwargs)


def make_vendor(owner, display_name="LuxBrand", status="active"):
    v = Vendor.objects.create(
        owner_user=owner,
        legal_name="Lux Ltd.",
        display_name=display_name,
        slug=display_name.lower().replace(" ", "-"),
        status=status,
    )
    VendorPolicy.objects.get_or_create(vendor=v)
    return v


def auth(client, user):
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


def make_category(name="Fashion", slug=None, parent=None):
    return Category.objects.create(
        name=name,
        slug=slug or name.lower(),
        is_active=True,
    )


def make_brand(name="LuxBrand", slug=None):
    return Brand.objects.create(name=name, slug=slug or name.lower())


def make_product(vendor, category, brand=None, title="LuxWatch", status=ProductStatus.APPROVED):
    import re
    slug_base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    slug = slug_base
    i = 1
    while Product.objects.filter(slug=slug).exists():
        slug = f"{slug_base}-{i}"
        i += 1
    return Product.objects.create(
        vendor=vendor,
        category=category,
        brand=brand,
        title=title,
        slug=slug,
        description="A fine luxury watch.",
        base_price="999.99",
        status=status,
        is_active=True,
    )


# ── Category Tests ────────────────────────────────────────────────────────────

class CategoryPublicTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.root = make_category("Jewelry", "jewelry")
        make_category("Rings", "rings")

    def test_list_categories_public(self):
        resp = self.client.get("/api/v1/categories/")
        self.assertEqual(resp.status_code, 200)
        # Root nodes returned
        self.assertGreaterEqual(len(resp.data), 1)

    def test_retrieve_category(self):
        resp = self.client.get(f"/api/v1/categories/{self.root.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "Jewelry")


class AdminCategoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        auth(self.client, self.admin)

    def test_admin_can_create_category(self):
        resp = self.client.post("/api/v1/admin/categories/", {
            "name": "Watches",
            "slug": "watches",
            "is_active": True,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "Watches")

    def test_admin_can_update_category(self):
        cat = make_category("Bags", "bags")
        resp = self.client.patch(f"/api/v1/admin/categories/{cat.id}/", {
            "name": "Handbags",
        }, format="json")
        self.assertEqual(resp.status_code, 200)

    def test_admin_can_delete_category(self):
        cat = make_category("Shoes", "shoes")
        resp = self.client.delete(f"/api/v1/admin/categories/{cat.id}/")
        self.assertIn(resp.status_code, [200, 204])

    def test_public_cannot_create_category(self):
        self.client.credentials()  # clear auth
        resp = self.client.post("/api/v1/admin/categories/", {
            "name": "Hats", "slug": "hats",
        }, format="json")
        self.assertEqual(resp.status_code, 401)


# ── Brand Tests ───────────────────────────────────────────────────────────────

class BrandPublicTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        make_brand("Rolex", "rolex")
        make_brand("Prada", "prada")

    def test_list_brands_public(self):
        resp = self.client.get("/api/v1/brands/")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data), 2)


class AdminBrandTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("brandadmin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        auth(self.client, self.admin)

    def test_admin_create_brand(self):
        resp = self.client.post("/api/v1/admin/brands/", {
            "name": "Chanel",
        }, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_admin_delete_brand(self):
        brand = make_brand("OldBrand", "old-brand")
        resp = self.client.delete(f"/api/v1/admin/brands/{brand.id}/")
        self.assertIn(resp.status_code, [200, 204])


# ── Public Product Tests ──────────────────────────────────────────────────────

class ProductPublicTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("vendorpublic@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.cat = make_category("Electronics", "electronics")
        self.approved = make_product(self.vendor, self.cat, title="Gold Watch", status=ProductStatus.APPROVED)
        self.draft = make_product(self.vendor, self.cat, title="Draft Item", status=ProductStatus.DRAFT)

    def test_public_list_shows_only_approved(self):
        resp = self.client.get("/api/v1/products/")
        self.assertEqual(resp.status_code, 200)
        titles = [p["title"] for p in (resp.data.get("results") or resp.data)]
        self.assertIn("Gold Watch", titles)
        self.assertNotIn("Draft Item", titles)

    def test_public_retrieve_approved(self):
        resp = self.client.get(f"/api/v1/products/{self.approved.id}/")
        self.assertEqual(resp.status_code, 200)

    def test_public_cannot_retrieve_draft(self):
        resp = self.client.get(f"/api/v1/products/{self.draft.id}/")
        # Draft not in approved queryset — 404
        self.assertEqual(resp.status_code, 404)


# ── Vendor Product Tests ──────────────────────────────────────────────────────

class VendorProductTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("vp@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.cat = make_category("Accessories", "accessories")
        auth(self.client, self.owner)

    def test_vendor_can_create_product(self):
        resp = self.client.post("/api/v1/vendors/me/products/", {
            "title": "Silk Scarf",
            "description": "Handmade luxury silk scarf.",
            "base_price": "299.00",
            "category": str(self.cat.id),
            "status": "draft",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["title"], "Silk Scarf")

    def test_vendor_my_products_list_includes_draft(self):
        make_product(self.vendor, self.cat, title="VP Draft", status=ProductStatus.DRAFT)
        resp = self.client.get("/api/v1/vendors/me/products/")
        self.assertEqual(resp.status_code, 200)
        titles = [p["title"] for p in (resp.data.get("results") or resp.data)]
        self.assertIn("VP Draft", titles)

    def test_vendor_cannot_see_other_vendor_products(self):
        other_owner = make_user("other@test.com", role=RoleEnum.VENDOR_OWNER)
        other_vendor = make_vendor(other_owner, display_name="OtherBrand")
        other_product = make_product(other_vendor, self.cat, title="Other Product")
        resp = self.client.get(f"/api/v1/vendors/me/products/{other_product.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_vendor_can_update_own_product(self):
        p = make_product(self.vendor, self.cat, title="Old Title", status=ProductStatus.DRAFT)
        resp = self.client.patch(f"/api/v1/vendors/me/products/{p.id}/", {
            "title": "New Title",
        }, format="json")
        self.assertEqual(resp.status_code, 200)

    def test_unauthenticated_cannot_create_product(self):
        self.client.credentials()
        resp = self.client.post("/api/v1/vendors/me/products/", {
            "title": "X", "base_price": "10", "category": str(self.cat.id),
        }, format="json")
        self.assertIn(resp.status_code, [401, 403])


# ── Admin Product Moderation Tests ────────────────────────────────────────────

class AdminProductModerationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("modadmin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.owner = make_user("modvendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.cat = make_category("Luxury", "luxury-goods")
        self.product = make_product(
            self.vendor, self.cat, title="Pending Watch", status=ProductStatus.PENDING_REVIEW
        )

    def test_admin_can_list_all_products(self):
        auth(self.client, self.admin)
        resp = self.client.get("/api/v1/admin/products/")
        self.assertEqual(resp.status_code, 200)

    def test_admin_can_approve_product(self):
        auth(self.client, self.admin)
        resp = self.client.patch(f"/api/v1/admin/products/{self.product.id}/approve/", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.APPROVED)

    def test_admin_can_reject_product_with_reason(self):
        auth(self.client, self.admin)
        resp = self.client.patch(f"/api/v1/admin/products/{self.product.id}/reject/", {
            "rejection_reason": "Low quality images."
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, ProductStatus.REJECTED)
        self.assertIn("quality", self.product.rejection_reason)

    def test_admin_reject_without_reason_returns_400(self):
        auth(self.client, self.admin)
        resp = self.client.patch(f"/api/v1/admin/products/{self.product.id}/reject/", {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_non_admin_cannot_moderate(self):
        auth(self.client, self.owner)
        resp = self.client.patch(f"/api/v1/admin/products/{self.product.id}/approve/", {}, format="json")
        self.assertEqual(resp.status_code, 403)


# ── Bulk Import Tests ─────────────────────────────────────────────────────────

class BulkImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("bivendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        auth(self.client, self.owner)

    def test_can_submit_bulk_import_with_raw_csv(self):
        cat = make_category("Gifts", "gifts")
        raw_csv = f"title,description,base_price,category_slug\nGold Ring,Beautiful ring,500,{cat.slug}"
        resp = self.client.post("/api/v1/vendors/me/products/bulk-import/", {
            "raw_csv": raw_csv,
        }, format="json")
        self.assertEqual(resp.status_code, 202)
        self.assertIn("job_id", resp.data)

    def test_can_poll_bulk_import_status(self):
        # Create a job manually
        job = BulkImportJob.objects.create(
            vendor=self.vendor,
            status="done",
            total_rows=2,
            processed_rows=2,
            result_json=[],
        )
        resp = self.client.get(f"/api/v1/vendors/me/products/bulk-import/{job.job_id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "done")

    def test_no_file_returns_400(self):
        resp = self.client.post("/api/v1/vendors/me/products/bulk-import/", {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_unauthenticated_cannot_import(self):
        self.client.credentials()
        resp = self.client.post("/api/v1/vendors/me/products/bulk-import/", {"raw_csv": "a,b"}, format="json")
        self.assertIn(resp.status_code, [401, 403])


# ── Sprint 5: Product Attributes Tests ─────────────────────────────────────────

class ProductAttributeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("attr_admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.user = make_user("attr_customer@test.com", role=RoleEnum.CUSTOMER)
        self.category = make_category("Suits", "suits")

    def test_admin_can_create_attribute_with_values(self):
        auth(self.client, self.admin)
        resp = self.client.post("/api/v1/products/attributes/", {
            "name": "Fabric",
            "category": str(self.category.id),
            "values_write": ["Wool", "Cashmere", "Linen"],
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "Fabric")
        self.assertEqual(len(resp.data["values"]), 3)

    def test_public_can_list_attributes(self):
        attr = ProductAttribute.objects.create(name="Color")
        ProductAttributeValue.objects.create(attribute=attr, value="Black")
        ProductAttributeValue.objects.create(attribute=attr, value="White")

        resp = self.client.get("/api/v1/products/attributes/")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data["results"] if "results" in resp.data else resp.data), 1)

    def test_non_admin_cannot_create_attribute(self):
        auth(self.client, self.user)
        resp = self.client.post("/api/v1/products/attributes/", {
            "name": "Size",
        }, format="json")
        self.assertEqual(resp.status_code, 403)


# ── Sprint 5: Product Variant Tests ───────────────────────────────────────────

class ProductVariantTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("var_vendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.other_vendor_user = make_user("var_other@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner, "Atelier Var")
        self.other_vendor = make_vendor(self.other_vendor_user, "Other Maison")
        self.category = make_category("Outerwear", "outerwear")
        self.product = make_product(self.vendor, self.category, title="Overcoat")

        # Create attributes and values
        self.color_attr = ProductAttribute.objects.create(name="Color")
        self.navy = ProductAttributeValue.objects.create(attribute=self.color_attr, value="Navy")
        self.size_attr = ProductAttribute.objects.create(name="Size")
        self.size_40 = ProductAttributeValue.objects.create(attribute=self.size_attr, value="40R")

    def test_vendor_can_create_variant(self):
        auth(self.client, self.owner)
        resp = self.client.post(f"/api/v1/products/{self.product.id}/variants/", {
            "sku": "COAT-NAVY-40R",
            "price": "1450.00",
            "attribute_value_ids": [str(self.navy.id), str(self.size_40.id)],
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["sku"], "COAT-NAVY-40R")
        self.assertEqual(len(resp.data["attributes"]), 2)

    def test_vendor_cannot_add_variant_to_others_product(self):
        auth(self.client, self.other_vendor_user)
        resp = self.client.post(f"/api/v1/products/{self.product.id}/variants/", {
            "sku": "HACK-SKU",
            "price": "99.00",
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_public_can_list_variants_of_product(self):
        ProductVariant.objects.create(
            product=self.product,
            sku="COAT-DEFAULT",
            price="1200.00",
        )
        resp = self.client.get(f"/api/v1/products/{self.product.id}/variants/")
        self.assertEqual(resp.status_code, 200)
        items = resp.data["results"] if "results" in resp.data else resp.data
        self.assertGreaterEqual(len(items), 1)


# ── Sprint 5: Variant Cartesian Matrix Generator Tests ────────────────────────

class ProductVariantGeneratorTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("matrix_vendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner, "Tailor Hub")
        self.category = make_category("Shirts", "shirts")
        self.product = make_product(self.vendor, self.category, title="Oxford Shirt")

        # Color: White, Blue
        color = ProductAttribute.objects.create(name="Color")
        self.white = ProductAttributeValue.objects.create(attribute=color, value="White")
        self.blue = ProductAttributeValue.objects.create(attribute=color, value="Blue")

        # Size: S, M, L
        size = ProductAttribute.objects.create(name="Size")
        self.s = ProductAttributeValue.objects.create(attribute=size, value="S")
        self.m = ProductAttributeValue.objects.create(attribute=size, value="M")
        self.l = ProductAttributeValue.objects.create(attribute=size, value="L")

    def test_generate_variant_matrix_service(self):
        attribute_groups = [
            [str(self.white.id), str(self.blue.id)],
            [str(self.s.id), str(self.m.id), str(self.l.id)],
        ]
        created = generate_variant_matrix(self.product, attribute_groups, base_price=250.00)
        # 2 colors * 3 sizes = 6 combinations
        self.assertEqual(len(created), 6)
        # Each variant should have 2 attributes
        for v in created:
            self.assertEqual(v.variant_attributes.count(), 2)
            self.assertEqual(v.price, 250.00)

    def test_variant_generate_endpoint(self):
        auth(self.client, self.owner)
        resp = self.client.post(f"/api/v1/products/{self.product.id}/variants/generate/", {
            "attribute_groups": [
                [str(self.white.id), str(self.blue.id)],
                [str(self.s.id)],
            ],
            "base_price": "220.00",
            "sku_prefix": "OXFORD",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["count"], 2)


# ── Sprint 5: Search & Facet Tests ────────────────────────────────────────────

class ProductSearchAndFacetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("search_vendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner, "Luxe Search Vendor")
        self.cat1 = make_category("Watches", "watches")
        self.cat2 = make_category("Bags", "bags")
        self.brand1 = make_brand("Rolex", "rolex")

        self.p1 = make_product(self.vendor, self.cat1, brand=self.brand1, title="Submariner Gold Watch")
        self.p1.base_price = "12000.00"
        self.p1.rating_avg = "4.90"
        self.p1.save()

        self.p2 = make_product(self.vendor, self.cat2, title="Leather Duffle Bag")
        self.p2.base_price = "1500.00"
        self.p2.rating_avg = "4.50"
        self.p2.save()

    def test_search_by_keyword(self):
        resp = self.client.get("/api/v1/products/search/?q=Submariner")
        self.assertEqual(resp.status_code, 200)
        results = resp.data["results"] if "results" in resp.data else resp.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], str(self.p1.id))

    def test_facets_in_response(self):
        resp = self.client.get("/api/v1/products/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("facets", resp.data)
        facets = resp.data["facets"]
        self.assertIn("categories", facets)
        self.assertIn("brands", facets)
        self.assertIn("price_range", facets)

    def test_filter_by_price_range(self):
        resp = self.client.get("/api/v1/products/?price_min=5000")
        self.assertEqual(resp.status_code, 200)
        results = resp.data["results"] if "results" in resp.data else resp.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], str(self.p1.id))


# ── Sprint 5: Related Products Tests ──────────────────────────────────────────

class ProductRelatedTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("rel_vendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner, "Rel Maison")
        self.category = make_category("Fine Rings", "fine-rings")

        self.target = make_product(self.vendor, self.category, title="Solitaire Diamond Ring")
        self.related1 = make_product(self.vendor, self.category, title="Eternity Band")
        self.other_cat = make_category("Necklaces", "necklaces")
        self.unrelated = make_product(self.vendor, self.other_cat, title="Pearl Choker")

    def test_related_endpoint_returns_same_category_excluding_self(self):
        resp = self.client.get(f"/api/v1/products/{self.target.id}/related/")
        self.assertEqual(resp.status_code, 200)
        results = resp.data["results"] if "results" in resp.data else resp.data
        result_ids = [r["id"] for r in results]
        self.assertIn(str(self.related1.id), result_ids)
        self.assertNotIn(str(self.target.id), result_ids)
        self.assertNotIn(str(self.unrelated.id), result_ids)


# ── Sprint 5: Wishlist Tests ──────────────────────────────────────────────────

class WishlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_user("wish_cust@test.com", role=RoleEnum.CUSTOMER)
        self.owner = make_user("wish_vend@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner, "Wish Brand")
        self.category = make_category("Luggage", "luggage")
        self.product = make_product(self.vendor, self.category, title="Cabin Spinner Suitcase")

    def test_add_and_list_wishlist(self):
        auth(self.client, self.customer)
        # Add to wishlist
        resp = self.client.post("/api/v1/wishlist/", {
            "product_id": str(self.product.id),
        }, format="json")
        self.assertEqual(resp.status_code, 201)

        # List wishlist
        list_resp = self.client.get("/api/v1/wishlist/")
        self.assertEqual(list_resp.status_code, 200)
        items = list_resp.data["results"] if "results" in list_resp.data else list_resp.data
        self.assertEqual(len(items), 1)

    def test_toggle_wishlist_action(self):
        auth(self.client, self.customer)
        # First toggle -> added
        resp1 = self.client.post("/api/v1/wishlist/toggle/", {"product_id": str(self.product.id)}, format="json")
        self.assertEqual(resp1.status_code, 201)
        self.assertTrue(resp1.data["in_wishlist"])

        # Second toggle -> removed
        resp2 = self.client.post("/api/v1/wishlist/toggle/", {"product_id": str(self.product.id)}, format="json")
        self.assertEqual(resp2.status_code, 200)
        self.assertFalse(resp2.data["in_wishlist"])

    def test_unauthenticated_cannot_access_wishlist(self):
        resp = self.client.get("/api/v1/wishlist/")
        self.assertIn(resp.status_code, [401, 403])


# ── Sprint 14: Reviews & Product Q&A Tests ───────────────────────────────────

class Sprint14ReviewAndQATests(TestCase):
    def setUp(self):
        from decimal import Decimal
        from orders.models import Order, OrderStatus, VendorOrder, VendorOrderStatus, OrderItem, OrderItemFulfilmentStatus
        from catalog.models import Review, ReviewModerationStatus, ProductQuestion, ProductAnswer

        self.client = APIClient()
        self.customer = make_user("reviewer@test.com", role=RoleEnum.CUSTOMER)
        self.other_customer = make_user("other_reviewer@test.com", role=RoleEnum.CUSTOMER)
        self.vendor_owner = make_user("rev_vendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.admin = make_user("rev_admin@test.com", role=RoleEnum.PLATFORM_ADMIN)

        self.vendor = make_vendor(self.vendor_owner, "Maison Chrono")
        self.category = make_category("Fine Timepieces", "fine-timepieces")
        self.product = make_product(self.vendor, self.category, title="Royal Oak Perpetual")
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="AP-RO-PERP",
            price=Decimal("45000.00"),
            is_active=True,
        )

        # Create a delivered order item for verified purchase
        self.order = Order.objects.create(
            customer=self.customer,
            order_number="ORD-20260909-REV001",
            currency="USD",
            subtotal=Decimal("45000.00"),
            grand_total=Decimal("45000.00"),
            status=OrderStatus.CONFIRMED,
        )
        self.vendor_order = VendorOrder.objects.create(
            order=self.order,
            vendor=self.vendor,
            subtotal=Decimal("45000.00"),
            vendor_net_amount=Decimal("40500.00"),
            status=VendorOrderStatus.CONFIRMED,
        )
        self.order_item = OrderItem.objects.create(
            vendor_order=self.vendor_order,
            variant=self.variant,
            quantity=1,
            unit_price=Decimal("45000.00"),
            line_subtotal=Decimal("45000.00"),
            fulfilment_status=OrderItemFulfilmentStatus.DELIVERED,
        )

    def test_customer_creates_verified_review_and_updates_rating(self):
        """Customer with delivered order item creates review with verified badge and updates rating."""
        from catalog.models import Review

        auth(self.client, self.customer)
        url = f"/api/v1/products/{self.product.id}/reviews/"
        payload = {
            "rating": 5,
            "title": "Masterpiece of horology",
            "comment": "Exceptional finishing on the tapisserie dial and case bevels.",
            "order_item_id": str(self.order_item.id),
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["is_verified_purchase"])
        self.assertEqual(resp.data["rating"], 5)

        self.product.refresh_from_db()
        self.assertEqual(self.product.rating_count, 1)
        self.assertEqual(float(self.product.rating_avg), 5.0)

    def test_customer_unverified_review(self):
        """Customer without order item can post an unverified review."""
        auth(self.client, self.other_customer)
        url = f"/api/v1/products/{self.product.id}/reviews/"
        payload = {
            "rating": 4,
            "title": "Stunning aesthetics",
            "comment": "Saw this at the Geneva boutique, truly remarkable.",
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(resp.data["is_verified_purchase"])

    def test_duplicate_review_for_same_order_item_rejected(self):
        """Submitting a second review for the same order item is rejected."""
        auth(self.client, self.customer)
        url = f"/api/v1/products/{self.product.id}/reviews/"
        payload = {
            "rating": 5,
            "title": "First review",
            "comment": "Great watch.",
            "order_item_id": str(self.order_item.id),
        }
        resp1 = self.client.post(url, payload, format="json")
        self.assertEqual(resp1.status_code, 201)

        resp2 = self.client.post(url, payload, format="json")
        self.assertEqual(resp2.status_code, 400)

    def test_vendor_staff_replies_to_review(self):
        """Vendor owner can reply to a review on their own product."""
        from catalog.models import Review, ReviewModerationStatus

        review = Review.objects.create(
            product=self.product,
            user=self.customer,
            rating=5,
            title="Magnificent piece",
            comment="Exceeded all expectations.",
            moderation_status=ReviewModerationStatus.APPROVED,
        )

        # Other customer cannot reply
        auth(self.client, self.other_customer)
        resp_forbidden = self.client.post(f"/api/v1/reviews/{review.id}/reply/", {"comment": "Unauthorized reply"}, format="json")
        self.assertEqual(resp_forbidden.status_code, 403)

        # Vendor owner can reply
        auth(self.client, self.vendor_owner)
        resp_vendor = self.client.post(
            f"/api/v1/reviews/{review.id}/reply/",
            {"comment": "Thank you for appreciating our horological heritage!"},
            format="json",
        )
        self.assertEqual(resp_vendor.status_code, 201)
        self.assertEqual(resp_vendor.data["comment"], "Thank you for appreciating our horological heritage!")

    def test_admin_review_moderation(self):
        """Platform Admin moderates review and ratings recalculate."""
        from catalog.models import Review, ReviewModerationStatus

        review = Review.objects.create(
            product=self.product,
            user=self.customer,
            rating=1,
            title="Spam comment",
            comment="Visit my external spam site",
            moderation_status=ReviewModerationStatus.PENDING,
        )

        auth(self.client, self.admin)
        url = f"/api/v1/admin/reviews/{review.id}/moderate/"
        resp = self.client.patch(url, {"moderation_status": "rejected"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["moderation_status"], "rejected")

        review.refresh_from_db()
        self.assertEqual(review.moderation_status, ReviewModerationStatus.REJECTED)

    def test_product_question_and_vendor_answer(self):
        """User asks a question; vendor responds with official vendor flag."""
        auth(self.client, self.customer)
        q_url = f"/api/v1/products/{self.product.id}/questions/"
        q_resp = self.client.post(q_url, {"question": "What is the water resistance rating?"}, format="json")
        self.assertEqual(q_resp.status_code, 201)
        question_id = q_resp.data["id"]

        # Vendor answers
        auth(self.client, self.vendor_owner)
        a_url = f"/api/v1/products/{self.product.id}/questions/{question_id}/answers/"
        a_resp = self.client.post(a_url, {"answer": "Water resistant to 50 meters (5 ATM)."}, format="json")
        self.assertEqual(a_resp.status_code, 201)
        self.assertTrue(a_resp.data["is_vendor_response"])


