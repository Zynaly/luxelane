"""
core/urls/admin.py — Platform Admin Reporting & Export URLs (Sprint 15).
"""
from django.urls import path
from core.views import (
    AdminDashboardStatsView,
    AdminReportViewSet,
    AdminExportView,
    AdminExportStatusView,
)

admin_urlpatterns = [
    path("dashboard/stats/", AdminDashboardStatsView.as_view(), name="admin-dashboard-stats"),
    path("reports/sales/", AdminReportViewSet.as_view({"get": "sales"}), name="admin-reports-sales"),
    path("reports/inventory/", AdminReportViewSet.as_view({"get": "inventory"}), name="admin-reports-inventory"),
    path("reports/vendor-performance/", AdminReportViewSet.as_view({"get": "vendor_performance"}), name="admin-reports-vendor-performance"),
    path("exports/<str:resource>/", AdminExportView.as_view(), name="admin-export-create"),
    path("exports/<str:resource>/<uuid:job_id>/", AdminExportStatusView.as_view(), name="admin-export-status"),
]
