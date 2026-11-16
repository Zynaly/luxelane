"""
core/services/reporting.py — Administrative Reporting & Export Engine (Sprint 15).
Computes platform KPIs, executive sales/inventory/vendor reports, and handles
asynchronous data export jobs.
"""
import io
import csv
import json
import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from django.db.models import Sum, Count, Avg, Q
from django.utils import timezone

from core.models import ExportJob, ExportJobStatus
from accounts.models import User, RoleEnum
from vendors.models import Vendor, VendorStatus, VendorPayout, VendorPayoutStatus
from catalog.models import Product, ProductStatus, ProductVariant
from warehouse.models import Inventory, Warehouse
from orders.models import Order, OrderStatus, VendorOrder, VendorOrderStatus, OrderItem, ReturnRequest
from payments.services.ledger import ledger_service


class ReportingService:
    @classmethod
    def get_admin_dashboard_stats(cls) -> Dict[str, Any]:
        """
        Computes platform-wide executive dashboard metrics.
        """
        today = timezone.now().date()

        # GMV: confirmed, fulfilled, delivered orders
        confirmed_orders = Order.objects.filter(
            status__in=[
                OrderStatus.CONFIRMED,
                OrderStatus.PARTIALLY_SHIPPED,
                OrderStatus.SHIPPED,
                OrderStatus.PARTIALLY_DELIVERED,
                OrderStatus.DELIVERED,
            ]
        )
        gmv_val = confirmed_orders.aggregate(total=Sum("grand_total"))["total"] or Decimal("0.00")

        # Active vendors
        active_vendors = Vendor.objects.filter(status=VendorStatus.ACTIVE).count()

        # Orders placed today
        orders_today = Order.objects.filter(created_at__date=today).count()

        # Pending payouts
        pending_payouts_qs = VendorPayout.objects.filter(
            status__in=[VendorPayoutStatus.SCHEDULED, VendorPayoutStatus.PROCESSING]
        )
        pending_payouts_count = pending_payouts_qs.count()
        pending_payouts_amount = (
            pending_payouts_qs.aggregate(total=Sum("net_amount"))["total"] or Decimal("0.00")
        )

        # Ledger drift check
        try:
            recon = ledger_service.reconcile()
            ledger_drift_flag = not recon.get("is_balanced", True)
        except Exception:
            ledger_drift_flag = False

        # Additional quick stats
        total_customers = User.objects.filter(role=RoleEnum.CUSTOMER).count()
        total_approved_products = Product.objects.filter(status=ProductStatus.APPROVED, is_deleted=False).count()

        return {
            "gmv": str(gmv_val),
            "active_vendors": active_vendors,
            "orders_today": orders_today,
            "pending_payouts_count": pending_payouts_count,
            "pending_payouts_amount": str(pending_payouts_amount),
            "ledger_drift_flag": ledger_drift_flag,
            "total_customers": total_customers,
            "total_products": total_approved_products,
        }

    @classmethod
    def get_sales_report(
        cls,
        start_date: Optional[datetime.date] = None,
        end_date: Optional[datetime.date] = None,
    ) -> Dict[str, Any]:
        """
        Aggregates sales performance across orders over a designated window.
        """
        today = timezone.now().date()
        if not end_date:
            end_date = today
        if not start_date:
            start_date = end_date - datetime.timedelta(days=30)

        orders_qs = Order.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        ).exclude(status=OrderStatus.CANCELLED)

        totals = orders_qs.aggregate(
            gross=Sum("grand_total"),
            subtotal=Sum("subtotal"),
            shipping=Sum("shipping_total"),
            tax=Sum("tax_total"),
            discount=Sum("discount_total"),
            count=Count("id"),
        )

        vendor_orders_qs = VendorOrder.objects.filter(
            order__created_at__date__gte=start_date,
            order__created_at__date__lte=end_date,
        ).exclude(status=VendorOrderStatus.CANCELLED)
        commissions = vendor_orders_qs.aggregate(comm=Sum("commission_amount"))["comm"] or Decimal("0.00")

        # Daily timeline breakdown
        daily_breakdown = (
            orders_qs.values("created_at__date")
            .annotate(
                order_count=Count("id"),
                sales=Sum("grand_total"),
            )
            .order_by("created_at__date")
        )

        return {
            "start_date": str(start_date),
            "end_date": str(end_date),
            "total_orders": totals["count"] or 0,
            "gross_sales": str(totals["gross"] or Decimal("0.00")),
            "net_subtotal": str(totals["subtotal"] or Decimal("0.00")),
            "shipping_total": str(totals["shipping"] or Decimal("0.00")),
            "tax_total": str(totals["tax"] or Decimal("0.00")),
            "discount_total": str(totals["discount"] or Decimal("0.00")),
            "commission_total": str(commissions),
            "daily_breakdown": [
                {
                    "date": str(row["created_at__date"]),
                    "order_count": row["order_count"],
                    "sales": str(row["sales"] or Decimal("0.00")),
                }
                for row in daily_breakdown
            ],
        }

    @classmethod
    def get_inventory_report(cls) -> Dict[str, Any]:
        """
        Aggregates inventory health, stock levels, and warehouse allocations.
        """
        inventories = Inventory.objects.all()
        totals = inventories.aggregate(
            total_on_hand=Sum("on_hand"),
            total_reserved=Sum("reserved_cache"),
            sku_count=Count("variant", distinct=True),
        )

        low_stock_items = inventories.filter(on_hand__gt=0, on_hand__lte=5).count()
        out_of_stock_items = inventories.filter(on_hand=0).count()

        # Warehouse breakdown
        warehouse_stats = []
        for wh in Warehouse.objects.filter(is_active=True):
            wh_inv = inventories.filter(warehouse=wh).aggregate(
                on_hand=Sum("on_hand"),
                reserved=Sum("reserved_cache"),
                skus=Count("variant", distinct=True),
            )
            warehouse_stats.append({
                "warehouse_id": str(wh.id),
                "name": wh.name,
                "on_hand": wh_inv["on_hand"] or 0,
                "reserved": wh_inv["reserved"] or 0,
                "sku_count": wh_inv["skus"] or 0,
            })

        return {
            "total_skus": totals["sku_count"] or 0,
            "total_units_on_hand": totals["total_on_hand"] or 0,
            "total_units_reserved": totals["total_reserved"] or 0,
            "low_stock_skus": low_stock_items,
            "out_of_stock_skus": out_of_stock_items,
            "warehouses": warehouse_stats,
        }

    @classmethod
    def get_vendor_performance_report(cls) -> List[Dict[str, Any]]:
        """
        Ranks and evaluates all vendors by volume, GMV, fulfillment, returns, and rating.
        """
        vendors = Vendor.objects.filter(is_deleted=False).select_related("owner_user")
        results = []

        for v in vendors:
            orders = VendorOrder.objects.filter(vendor=v).exclude(status=VendorOrderStatus.CANCELLED)
            stats = orders.aggregate(
                order_count=Count("id"),
                gmv=Sum("subtotal"),
                commission=Sum("commission_amount"),
                net=Sum("vendor_net_amount"),
            )

            returns_count = ReturnRequest.objects.filter(order_item__vendor_order__vendor=v).count()

            results.append({
                "vendor_id": str(v.id),
                "display_name": v.display_name,
                "legal_name": v.legal_name,
                "status": v.status,
                "rating_avg": str(v.rating_avg),
                "order_count": stats["order_count"] or 0,
                "gmv": str(stats["gmv"] or Decimal("0.00")),
                "commission_paid": str(stats["commission"] or Decimal("0.00")),
                "net_earned": str(stats["net"] or Decimal("0.00")),
                "return_requests_count": returns_count,
            })

        results.sort(key=lambda x: Decimal(x["gmv"]), reverse=True)
        return results

    @classmethod
    def run_export(cls, job: ExportJob) -> ExportJob:
        """
        Executes export data extraction and serialization.
        """
        job.status = ExportJobStatus.PROCESSING
        job.save(update_fields=["status", "updated_at"])

        try:
            resource = job.resource.lower()
            data_rows = []

            if resource == "orders":
                orders = Order.objects.all().order_by("-created_at")[:500]
                for o in orders:
                    data_rows.append({
                        "order_number": o.order_number,
                        "created_at": o.created_at.isoformat(),
                        "status": o.status,
                        "grand_total": str(o.grand_total),
                        "currency": o.currency,
                        "customer_email": o.customer.email if o.customer else "guest",
                    })

            elif resource == "products":
                products = Product.objects.filter(is_deleted=False).select_related("vendor", "category")[:500]
                for p in products:
                    data_rows.append({
                        "id": str(p.id),
                        "title": p.title,
                        "vendor": p.vendor.display_name,
                        "category": p.category.name if p.category else "",
                        "base_price": str(p.base_price),
                        "status": p.status,
                        "rating_avg": str(p.rating_avg),
                    })

            elif resource == "vendors":
                vendors = Vendor.objects.filter(is_deleted=False)[:500]
                for v in vendors:
                    data_rows.append({
                        "id": str(v.id),
                        "display_name": v.display_name,
                        "legal_name": v.legal_name,
                        "status": v.status,
                        "rating_avg": str(v.rating_avg),
                    })

            elif resource == "payouts":
                payouts = VendorPayout.objects.all().select_related("vendor")[:500]
                for po in payouts:
                    data_rows.append({
                        "id": str(po.id),
                        "vendor": po.vendor.display_name,
                        "period_start": str(po.period_start),
                        "period_end": str(po.period_end),
                        "gross_amount": str(po.gross_amount),
                        "net_amount": str(po.net_amount),
                        "status": po.status,
                        "external_transfer_id": po.external_transfer_id,
                    })

            elif resource == "sales":
                report = cls.get_sales_report()
                data_rows = report.get("daily_breakdown", [])

            else:
                data_rows = [{"info": f"Resource '{resource}' export not supported."}]

            # Format output
            if job.format == "csv" and data_rows and isinstance(data_rows[0], dict):
                output = io.StringIO()
                writer = csv.DictWriter(output, fieldnames=list(data_rows[0].keys()))
                writer.writeheader()
                writer.writerows(data_rows)
                job.result_json = output.getvalue()
            else:
                job.result_json = json.dumps(data_rows, indent=2)

            job.status = ExportJobStatus.DONE
            job.file_url = f"/api/v1/admin/exports/{job.resource}/{job.id}/"
            job.save(update_fields=["status", "result_json", "file_url", "updated_at"])

        except Exception as exc:
            job.status = ExportJobStatus.FAILED
            job.error_message = str(exc)
            job.save(update_fields=["status", "error_message", "updated_at"])

        return job


reporting_service = ReportingService()
