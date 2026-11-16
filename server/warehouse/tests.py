"""
warehouse/tests.py — Sprint 6 unit tests.
Tests cover:
  - Warehouse creation and staff assignment
  - Stock services (adjust, consume, restock)
  - Inventory adjust & bulk update endpoints
  - Stock transfers with approve & complete workflows
  - Purchase order creation and line-item receiving
  - Low-stock and public variant availability queries
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User, RoleEnum
from vendors.models import Vendor, VendorPolicy
from catalog.models import Category, Product, ProductVariant
from warehouse.models import (
    Warehouse, WarehouseStaff, Inventory, StockMovement,
    StockTransfer, StockTransferItem, PurchaseOrder, PurchaseOrderItem,
    InventoryReservation,
    StaffRole, MovementType, TransferStatus, POStatus, ReservationStatus,
)
from warehouse.services import stock as stock_service
from warehouse.services import reservation as reservation_service
from warehouse.services import allocation as allocation_service



def make_user(email, role=RoleEnum.CUSTOMER, **kwargs):
    return User.objects.create_user(password="Pass1234!", email=email, role=role, **kwargs)


def auth(client, user):
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


def make_vendor(owner, display_name="Maison Luxe"):
    v = Vendor.objects.create(
        owner_user=owner,
        legal_name="Maison Luxe LLC",
        display_name=display_name,
        slug=display_name.lower().replace(" ", "-"),
        status="active",
    )
    VendorPolicy.objects.get_or_create(vendor=v)
    return v


def make_variant(vendor, sku="LUXE-TEST-SKU", price="500.00"):
    cat = Category.objects.create(name="Accessories", slug=f"acc-{sku.lower()}")
    prod = Product.objects.create(
        vendor=vendor,
        category=cat,
        title="Luxury Silk Scarf",
        slug=f"silk-scarf-{sku.lower()}",
        base_price=price,
        status="approved",
        is_active=True,
    )
    return ProductVariant.objects.create(
        product=prod,
        sku=sku,
        price=price,
        is_active=True,
    )


# ── Warehouse & Staff Tests ───────────────────────────────────────────────────

class WarehouseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("wh_admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.vendor_user = make_user("wh_vendor@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.vendor_user)

    def test_admin_can_create_platform_warehouse(self):
        auth(self.client, self.admin)
        resp = self.client.post("/api/v1/warehouses/", {
            "name": "Central Hub Paris",
            "service_radius_km": "75.00",
            "sla_hours": 12,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "Central Hub Paris")
        self.assertIsNone(resp.data["vendor"])

    def test_vendor_can_create_vendor_warehouse(self):
        auth(self.client, self.vendor_user)
        resp = self.client.post("/api/v1/warehouses/", {
            "name": "Maison Atelier Depot",
            "service_radius_km": "30.00",
            "sla_hours": 24,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(str(resp.data["vendor"]), str(self.vendor.id))

    def test_staff_assignment(self):
        auth(self.client, self.admin)
        wh = Warehouse.objects.create(name="Milan Hub")
        staff_user = make_user("wh_worker@test.com", role=RoleEnum.WAREHOUSE_STAFF)

        resp = self.client.post(f"/api/v1/warehouses/{wh.id}/staff/", {
            "user": str(staff_user.id),
            "staff_role": "manager",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["staff_role"], "manager")


# ── Stock Services Unit Tests ─────────────────────────────────────────────────

class StockServiceTests(TestCase):
    def setUp(self):
        self.owner = make_user("stock_vend@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.wh = Warehouse.objects.create(name="Geneva Hub")
        self.variant = make_variant(self.vendor, "SKU-GENEVA-1")
        self.inv = Inventory.objects.create(warehouse=self.wh, variant=self.variant, on_hand=50, reserved_cache=10)

    def test_adjust_positive(self):
        movement = stock_service.adjust(self.inv, quantity_delta=25, reason="Batch restock")
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.on_hand, 75)
        self.assertEqual(movement.quantity_delta, 25)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_adjust_negative_success(self):
        movement = stock_service.adjust(self.inv, quantity_delta=-20, reason="Damaged items written off")
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.on_hand, 30)
        self.assertEqual(movement.quantity_delta, -20)

    def test_adjust_negative_fails_when_exceeding_stock(self):
        with self.assertRaises(Exception):
            stock_service.adjust(self.inv, quantity_delta=-100, reason="Over-deduction")

    def test_consume_reserved_stock(self):
        movement = stock_service.consume(self.inv, quantity=5)
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.on_hand, 45)
        self.assertEqual(self.inv.reserved_cache, 5)
        self.assertEqual(movement.movement_type, MovementType.RESERVATION_CONSUMED)

    def test_restock(self):
        movement = stock_service.restock(self.inv, quantity=10, reason="Customer RMA return")
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.on_hand, 60)
        self.assertEqual(movement.movement_type, MovementType.RETURN_RESTOCK)


# ── Inventory Endpoints Tests ─────────────────────────────────────────────────

class InventoryEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("inv_admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.owner = make_user("inv_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.wh = Warehouse.objects.create(name="London Vault")
        self.v1 = make_variant(self.vendor, "SKU-LDN-1")
        self.v2 = make_variant(self.vendor, "SKU-LDN-2")
        auth(self.client, self.admin)

    def test_adjust_endpoint(self):
        resp = self.client.post("/api/v1/inventory/adjust/", {
            "warehouse_id": str(self.wh.id),
            "variant_id": str(self.v1.id),
            "quantity_delta": 40,
            "reason": "Initial pallet inbound",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["current_on_hand"], 40)
        self.assertEqual(resp.data["available"], 40)

    def test_bulk_update_endpoint(self):
        resp = self.client.post("/api/v1/inventory/bulk-update/", {
            "items": [
                {"warehouse_id": str(self.wh.id), "variant_id": str(self.v1.id), "quantity_delta": 15, "reason": "Restock A"},
                {"warehouse_id": str(self.wh.id), "variant_id": str(self.v2.id), "quantity_delta": 30, "reason": "Restock B"},
            ]
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 2)

    def test_low_stock_view(self):
        # Create one low stock (on_hand 3 <= threshold 5) and one normal stock (on_hand 50 > threshold 10)
        Inventory.objects.create(warehouse=self.wh, variant=self.v1, on_hand=3, reorder_threshold=5)
        Inventory.objects.create(warehouse=self.wh, variant=self.v2, on_hand=50, reorder_threshold=10)

        resp = self.client.get("/api/v1/inventory/low-stock/")
        self.assertEqual(resp.status_code, 200)
        items = resp.data["results"] if "results" in resp.data else resp.data
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["variant_sku"], "SKU-LDN-1")


# ── Stock Transfer Tests ──────────────────────────────────────────────────────

class StockTransferTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("transfer_admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.owner = make_user("transfer_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.wh_from = Warehouse.objects.create(name="Origin Hub")
        self.wh_to = Warehouse.objects.create(name="Destination Hub")
        self.variant = make_variant(self.vendor, "SKU-XFER-1")

        # Give origin warehouse 100 items
        inv_from = Inventory.objects.create(warehouse=self.wh_from, variant=self.variant, on_hand=100)
        auth(self.client, self.admin)

    def test_transfer_lifecycle(self):
        # 1. Create transfer request for 25 units
        create_resp = self.client.post("/api/v1/stock-transfers/", {
            "from_warehouse": str(self.wh_from.id),
            "to_warehouse": str(self.wh_to.id),
            "notes": "Rebalancing stock",
            "items": [
                {"variant": str(self.variant.id), "quantity": 25}
            ]
        }, format="json")
        self.assertEqual(create_resp.status_code, 201)
        transfer_id = create_resp.data["id"]

        # 2. Approve transfer
        app_resp = self.client.patch(f"/api/v1/stock-transfers/{transfer_id}/approve/")
        self.assertEqual(app_resp.status_code, 200)
        self.assertEqual(app_resp.data["status"], TransferStatus.APPROVED)

        # 3. Complete transfer
        comp_resp = self.client.patch(f"/api/v1/stock-transfers/{transfer_id}/complete/")
        self.assertEqual(comp_resp.status_code, 200)
        self.assertEqual(comp_resp.data["status"], TransferStatus.COMPLETED)

        # 4. Verify stock balances
        from_inv = Inventory.objects.get(warehouse=self.wh_from, variant=self.variant)
        to_inv = Inventory.objects.get(warehouse=self.wh_to, variant=self.variant)
        self.assertEqual(from_inv.on_hand, 75)
        self.assertEqual(to_inv.on_hand, 25)


# ── Purchase Order Tests ──────────────────────────────────────────────────────

class PurchaseOrderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("po_admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.owner = make_user("po_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.wh = Warehouse.objects.create(name="Receiving Depot")
        self.variant = make_variant(self.vendor, "SKU-PO-ITEM-1")
        auth(self.client, self.admin)

    def test_po_create_and_receive(self):
        # Create PO for 50 units
        create_resp = self.client.post("/api/v1/purchase-orders/", {
            "warehouse": str(self.wh.id),
            "supplier_name": "Tuscan Leather Guild",
            "items": [
                {"variant": str(self.variant.id), "qty_ordered": 50, "unit_cost": "120.00"}
            ]
        }, format="json")
        self.assertEqual(create_resp.status_code, 201)
        po_id = create_resp.data["id"]
        item_id = create_resp.data["items"][0]["id"]

        # Receive 50 units
        rec_resp = self.client.post(f"/api/v1/purchase-orders/{po_id}/receive/", {
            "items": [
                {"item_id": item_id, "qty_received": 50}
            ]
        }, format="json")
        self.assertEqual(rec_resp.status_code, 200)
        self.assertEqual(rec_resp.data["status"], POStatus.RECEIVED)

        # Verify inventory has 50 on_hand
        inv = Inventory.objects.get(warehouse=self.wh, variant=self.variant)
        self.assertEqual(inv.on_hand, 50)


# ── Public Variant Availability Tests ─────────────────────────────────────────

class VariantAvailabilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user("avail_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.variant = make_variant(self.vendor, "SKU-AVAIL-1")

        # Warehouse 1: 20 on hand, 5 reserved -> 15 available
        wh1 = Warehouse.objects.create(name="WH North", is_active=True)
        Inventory.objects.create(warehouse=wh1, variant=self.variant, on_hand=20, reserved_cache=5)

        # Warehouse 2: 30 on hand, 0 reserved -> 30 available
        wh2 = Warehouse.objects.create(name="WH South", is_active=True)
        Inventory.objects.create(warehouse=wh2, variant=self.variant, on_hand=30, reserved_cache=0)

    def test_public_can_query_variant_availability(self):
        resp = self.client.get(f"/api/v1/inventory/variant/{self.variant.id}/availability/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["sku"], "SKU-AVAIL-1")
        self.assertEqual(resp.data["total_available"], 45)  # 15 + 30
        self.assertEqual(len(resp.data["by_warehouse"]), 2)


# ── Sprint 7: Inventory Reservation Tests ─────────────────────────────────────

class InventoryReservationTests(TestCase):
    def setUp(self):
        self.owner = make_user("res_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.variant = make_variant(self.vendor, "SKU-RES-1")
        self.wh = Warehouse.objects.create(name="Milan Hub", is_active=True)
        self.inv = Inventory.objects.create(
            warehouse=self.wh,
            variant=self.variant,
            on_hand=50,
            reserved_cache=0,
        )

    def test_reserve_success(self):
        res = reservation_service.reserve(self.inv, quantity=10, ttl_minutes=15)
        self.assertEqual(res.status, ReservationStatus.HELD)
        self.assertEqual(res.quantity, 10)
        self.assertIsNotNone(res.expires_at)

        # Inventory reserved_cache incremented, on_hand untouched
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.on_hand, 50)
        self.assertEqual(self.inv.reserved_cache, 10)
        self.assertEqual(self.inv.available, 40)

    def test_reserve_insufficient_stock(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            reservation_service.reserve(self.inv, quantity=60)

    def test_commit_reservation(self):
        res = reservation_service.reserve(self.inv, quantity=15)
        committed = reservation_service.commit(res)
        self.assertEqual(committed.status, ReservationStatus.COMMITTED)

    def test_release_reservation(self):
        res = reservation_service.reserve(self.inv, quantity=20)
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.available, 30)

        released = reservation_service.release(res)
        self.assertEqual(released.status, ReservationStatus.RELEASED)

        self.inv.refresh_from_db()
        self.assertEqual(self.inv.reserved_cache, 0)
        self.assertEqual(self.inv.available, 50)

    def test_sweep_expired_reservations(self):
        import datetime
        from django.utils import timezone

        res = reservation_service.reserve(self.inv, quantity=25)
        # Manually backdate expires_at to simulate expiry
        res.expires_at = timezone.now() - datetime.timedelta(minutes=5)
        res.save(update_fields=["expires_at"])

        swept_count = reservation_service.sweep_expired_reservations()
        self.assertEqual(swept_count, 1)

        res.refresh_from_db()
        self.assertEqual(res.status, ReservationStatus.EXPIRED)

        self.inv.refresh_from_db()
        self.assertEqual(self.inv.reserved_cache, 0)
        self.assertEqual(self.inv.available, 50)


# ── Sprint 7: Smart Routing & Allocation Tests ────────────────────────────────

class SmartAllocationRoutingTests(TestCase):
    def setUp(self):
        self.owner = make_user("alloc_owner@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.v1 = make_variant(self.vendor, "SKU-ALLOC-1")
        self.v2 = make_variant(self.vendor, "SKU-ALLOC-2")

        # Warehouse London (51.5074, -0.1278)
        self.wh_london = Warehouse.objects.create(
            name="London Vault",
            latitude=51.5074,
            longitude=-0.1278,
            is_active=True,
        )
        # Warehouse Paris (48.8566, 2.3522)
        self.wh_paris = Warehouse.objects.create(
            name="Paris Atelier",
            latitude=48.8566,
            longitude=2.3522,
            is_active=True,
        )

    def test_haversine_distance(self):
        # Distance London to Paris is approximately 343 km
        dist = allocation_service.haversine_distance(51.5074, -0.1278, 48.8566, 2.3522)
        self.assertAlmostEqual(dist, 343.5, delta=10.0)

    def test_single_source_fulfillment_chosen_nearest(self):
        # London has both items: 10x v1, 10x v2
        Inventory.objects.create(warehouse=self.wh_london, variant=self.v1, on_hand=10)
        Inventory.objects.create(warehouse=self.wh_london, variant=self.v2, on_hand=10)

        # Paris also has both: 20x v1, 20x v2
        Inventory.objects.create(warehouse=self.wh_paris, variant=self.v1, on_hand=20)
        Inventory.objects.create(warehouse=self.wh_paris, variant=self.v2, on_hand=20)

        # Destination in UK (near London): (51.5000, -0.1000)
        res = allocation_service.preview(
            items=[{"variant_id": str(self.v1.id), "quantity": 5}, {"variant_id": str(self.v2.id), "quantity": 5}],
            destination_coords=(51.5000, -0.1000),
        )
        self.assertTrue(res["feasible"])
        self.assertEqual(res["total_splits"], 1)
        self.assertEqual(res["splits"][0]["warehouse_id"], str(self.wh_london.id))

    def test_multi_facility_split_when_single_warehouse_cannot_fulfill(self):
        # London has 5x v1, 0x v2
        Inventory.objects.create(warehouse=self.wh_london, variant=self.v1, on_hand=5)
        # Paris has 0x v1, 10x v2
        Inventory.objects.create(warehouse=self.wh_paris, variant=self.v2, on_hand=10)

        res = allocation_service.preview(
            items=[{"variant_id": str(self.v1.id), "quantity": 5}, {"variant_id": str(self.v2.id), "quantity": 5}],
            destination_coords=(51.5000, -0.1000),
        )
        self.assertTrue(res["feasible"])
        self.assertEqual(res["total_splits"], 2)

    def test_unfeasible_deficit(self):
        # Total network only has 3x v1
        Inventory.objects.create(warehouse=self.wh_london, variant=self.v1, on_hand=3)

        res = allocation_service.preview(
            items=[{"variant_id": str(self.v1.id), "quantity": 10}],
            destination_coords=(51.5000, -0.1000),
        )
        self.assertFalse(res["feasible"])
        self.assertEqual(len(res["unallocated"]), 1)
        self.assertEqual(res["unallocated"][0]["deficit"], 7)


# ── Sprint 7: Allocation & Reservation Endpoints Tests ────────────────────────

class AllocationEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user("alloc_user@test.com", role=RoleEnum.CUSTOMER)
        self.admin = make_user("alloc_admin@test.com", role=RoleEnum.PLATFORM_ADMIN)
        self.owner = make_user("alloc_vend@test.com", role=RoleEnum.VENDOR_OWNER)
        self.vendor = make_vendor(self.owner)
        self.v1 = make_variant(self.vendor, "SKU-API-ALLOC-1")
        self.wh = Warehouse.objects.create(name="Milan Hub", is_active=True, latitude=45.4642, longitude=9.1900)
        self.inv = Inventory.objects.create(warehouse=self.wh, variant=self.v1, on_hand=30)
        auth(self.client, self.user)

    def test_allocation_preview_endpoint(self):
        resp = self.client.post("/api/v1/inventory/allocate/preview/", {
            "items": [{"variant_id": str(self.v1.id), "quantity": 5}],
            "latitude": 45.4600,
            "longitude": 9.1800,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["feasible"])
        self.assertEqual(resp.data["total_splits"], 1)

    def test_admin_reservation_list_access(self):
        # Create a reservation
        reservation_service.reserve(self.inv, quantity=5)

        # Customer access forbidden
        resp = self.client.get("/api/v1/admin/inventory-reservations/")
        self.assertEqual(resp.status_code, 403)

        # Admin access granted
        auth(self.client, self.admin)
        resp = self.client.get("/api/v1/admin/inventory-reservations/")
        self.assertEqual(resp.status_code, 200)
        data = resp.data.get("results", resp.data)
        self.assertGreaterEqual(len(data), 1)

