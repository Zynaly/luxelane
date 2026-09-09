from django.test import TestCase
from rest_framework.test import APIClient
from decimal import Decimal
from django.utils import timezone

from accounts.models import User, RoleEnum
from vendors.models import Vendor, VendorStatus, VendorPolicy
from catalog.models import Category, Product, ProductVariant
from warehouse.models import Warehouse, Inventory
from orders.models import Order, OrderStatus, VendorOrder, VendorOrderStatus, OrderItem, OrderItemFulfilmentStatus
from core.models import ExportJob, ExportJobStatus


def auth(client, user):
    from rest_framework_simplejwt.tokens import RefreshToken
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


class Sprint15AdminReportingAndExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="platform_rep@luxelane.com",
            password="SecurePassword123!",
            role=RoleEnum.PLATFORM_ADMIN,
        )
        self.finance_admin = User.objects.create_user(
            email="fin_rep@luxelane.com",
            password="SecurePassword123!",
            role=RoleEnum.FINANCE_ADMIN,
        )
        self.customer = User.objects.create_user(
            email="cust_rep@luxelane.com",
            password="SecurePassword123!",
            role=RoleEnum.CUSTOMER,
        )
        self.vendor_owner = User.objects.create_user(
            email="vend_rep@luxelane.com",
            password="SecurePassword123!",
            role=RoleEnum.VENDOR_OWNER,
        )

        self.vendor = Vendor.objects.create(
            owner_user=self.vendor_owner,
            legal_name="Reporting Maison Ltd.",
            display_name="Reporting Maison",
            slug="reporting-maison",
            status=VendorStatus.ACTIVE,
        )
        VendorPolicy.objects.get_or_create(vendor=self.vendor)

        self.category = Category.objects.create(name="Fine Bags", slug="fine-bags")
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            title="Birkin Crocodile 30",
            slug="birkin-croc-30",
            base_price=Decimal("45000.00"),
            status="approved",
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="BIRKIN-CROC-30",
            price=Decimal("45000.00"),
            is_active=True,
        )

        self.warehouse = Warehouse.objects.create(name="Geneva Vault", is_active=True)
        self.inventory = Inventory.objects.create(
            variant=self.variant,
            warehouse=self.warehouse,
            on_hand=3,
            reserved_cache=0,
        )

        self.order = Order.objects.create(
            customer=self.customer,
            order_number="ORD-20260909-REP001",
            currency="USD",
            subtotal=Decimal("45000.00"),
            tax_total=Decimal("0.00"),
            shipping_total=Decimal("200.00"),
            grand_total=Decimal("45200.00"),
            status=OrderStatus.DELIVERED,
        )
        self.vendor_order = VendorOrder.objects.create(
            order=self.order,
            vendor=self.vendor,
            subtotal=Decimal("45000.00"),
            shipping_amount=Decimal("200.00"),
            commission_amount=Decimal("4500.00"),
            commission_pct_applied=Decimal("10.00"),
            vendor_net_amount=Decimal("40700.00"),
            status=VendorOrderStatus.DELIVERED,
        )
        self.order_item = OrderItem.objects.create(
            vendor_order=self.vendor_order,
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=1,
            unit_price=Decimal("45000.00"),
            line_subtotal=Decimal("45000.00"),
            fulfilment_status=OrderItemFulfilmentStatus.DELIVERED,
        )

    def test_admin_dashboard_stats_endpoint(self):
        """Platform Admin retrieves dashboard KPIs; Customer is forbidden."""
        # Customer forbidden
        auth(self.client, self.customer)
        resp_cust = self.client.get("/api/v1/admin/dashboard/stats/")
        self.assertEqual(resp_cust.status_code, 403)

        # Admin allowed
        auth(self.client, self.admin)
        resp = self.client.get("/api/v1/admin/dashboard/stats/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("gmv", resp.data)
        self.assertIn("active_vendors", resp.data)
        self.assertIn("orders_today", resp.data)
        self.assertIn("ledger_drift_flag", resp.data)
        self.assertGreaterEqual(resp.data["active_vendors"], 1)
        self.assertEqual(Decimal(resp.data["gmv"]), Decimal("45200.00"))

    def test_admin_sales_report_endpoint(self):
        """Admin retrieves sales aggregate report over date range."""
        auth(self.client, self.finance_admin)
        resp = self.client.get("/api/v1/admin/reports/sales/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("gross_sales", resp.data)
        self.assertIn("total_orders", resp.data)
        self.assertIn("commission_total", resp.data)
        self.assertIn("daily_breakdown", resp.data)
        self.assertEqual(resp.data["total_orders"], 1)
        self.assertEqual(Decimal(resp.data["gross_sales"]), Decimal("45200.00"))

    def test_admin_inventory_report_endpoint(self):
        """Admin retrieves inventory summary including low-stock skus and warehouse levels."""
        auth(self.client, self.admin)
        resp = self.client.get("/api/v1/admin/reports/inventory/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("total_skus", resp.data)
        self.assertIn("total_units_on_hand", resp.data)
        self.assertIn("low_stock_skus", resp.data)
        self.assertIn("warehouses", resp.data)
        self.assertEqual(resp.data["total_units_on_hand"], 3)
        self.assertEqual(resp.data["low_stock_skus"], 1)

    def test_admin_vendor_performance_report_endpoint(self):
        """Admin retrieves vendor performance metrics and GMV rankings."""
        auth(self.client, self.admin)
        resp = self.client.get("/api/v1/admin/reports/vendor-performance/")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data), 1)
        vendor_row = resp.data[0]
        self.assertEqual(vendor_row["vendor_id"], str(self.vendor.id))
        self.assertEqual(Decimal(vendor_row["gmv"]), Decimal("45000.00"))
        self.assertEqual(vendor_row["order_count"], 1)

    def test_admin_export_enqueue_and_poll_status(self):
        """Admin creates an export job, and polls status until completion."""
        auth(self.client, self.admin)
        create_resp = self.client.post(
            "/api/v1/admin/exports/orders/",
            {"format": "csv"},
            format="json",
        )
        self.assertEqual(create_resp.status_code, 202)
        self.assertIn("id", create_resp.data)
        job_id = create_resp.data["id"]

        # Poll status
        poll_resp = self.client.get(f"/api/v1/admin/exports/orders/{job_id}/")
        self.assertEqual(poll_resp.status_code, 200)
        self.assertEqual(poll_resp.data["status"], ExportJobStatus.DONE)
        self.assertIn("order_number", poll_resp.data["result_json"])

