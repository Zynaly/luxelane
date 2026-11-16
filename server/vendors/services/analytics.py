"""
vendors/services/analytics.py — Vendor Analytics Service (Sprint 15).
Calculates revenue time-series, top-performing products, order velocity,
and return rates.
"""
import datetime
from decimal import Decimal
from typing import Dict, Any
from django.db.models import Sum, Count, F
from django.utils import timezone

from vendors.models import Vendor
from orders.models import VendorOrder, VendorOrderStatus, OrderItem, ReturnRequest


class VendorAnalyticsService:
    @classmethod
    def get_analytics(cls, vendor: Vendor, days: int = 30) -> Dict[str, Any]:
        """
        Computes aggregate performance indicators for a vendor.
        """
        now = timezone.now()
        start_date = (now - datetime.timedelta(days=days)).date()

        vendor_orders = VendorOrder.objects.filter(
            vendor=vendor,
            created_at__date__gte=start_date,
        ).exclude(status=VendorOrderStatus.CANCELLED)

        # 1. Total summary KPIs
        totals = vendor_orders.aggregate(
            gross_sum=Sum("subtotal"),
            net_sum=Sum("vendor_net_amount"),
            orders_total=Count("id"),
        )
        gross_revenue = totals["gross_sum"] or Decimal("0.00")
        net_revenue = totals["net_sum"] or Decimal("0.00")
        order_count = totals["orders_total"] or 0

        # 2. Revenue by Day (time series)
        revenue_map = {}
        # Pre-fill all days with 0.00
        for i in range(days + 1):
            d = (start_date + datetime.timedelta(days=i)).isoformat()
            revenue_map[d] = Decimal("0.00")

        daily_qs = (
            vendor_orders.values("created_at__date")
            .annotate(daily_net=Sum("vendor_net_amount"), daily_orders=Count("id"))
            .order_by("created_at__date")
        )
        for row in daily_qs:
            d_str = row["created_at__date"].isoformat()
            revenue_map[d_str] = row["daily_net"] or Decimal("0.00")

        revenue_by_day = [{"date": k, "revenue": str(v)} for k, v in sorted(revenue_map.items())]

        # 3. Top Products
        order_items = OrderItem.objects.filter(
            vendor_order__vendor=vendor,
            vendor_order__created_at__date__gte=start_date,
        ).exclude(vendor_order__status=VendorOrderStatus.CANCELLED)

        top_products_qs = (
            order_items.values(
                "variant__product__id",
                "variant__product__title",
                "variant__product__slug",
            )
            .annotate(
                units_sold=Sum("quantity"),
                total_revenue=Sum("line_subtotal"),
            )
            .order_by("-total_revenue")[:5]
        )

        top_products = [
            {
                "product_id": str(p["variant__product__id"]),
                "title": p["variant__product__title"],
                "slug": p["variant__product__slug"],
                "units_sold": p["units_sold"] or 0,
                "revenue": str(p["total_revenue"] or Decimal("0.00")),
            }
            for p in top_products_qs
        ]

        # 4. Return Rate calculation
        total_items_count = order_items.count()
        returned_items_count = ReturnRequest.objects.filter(
            order_item__vendor_order__vendor=vendor,
            created_at__date__gte=start_date,
        ).count()

        return_rate_pct = Decimal("0.00")
        if total_items_count > 0:
            return_rate_pct = Decimal(
                str((returned_items_count / total_items_count) * 100)
            ).quantize(Decimal("0.01"))

        return {
            "period_days": days,
            "order_count": order_count,
            "gross_revenue": str(gross_revenue),
            "net_revenue": str(net_revenue),
            "return_rate": f"{return_rate_pct}%",
            "revenue_by_day": revenue_by_day,
            "top_products": top_products,
        }


vendor_analytics_service = VendorAnalyticsService()
