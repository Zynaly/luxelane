"""
Health check views — Sprint 0.
GET /healthz/ — liveness (always 200 if process is up)
GET /readyz/  — readiness (checks DB + Redis + Celery)
"""
import uuid
import redis
from django.db import connections
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.conf import settings


from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers


class HealthCheckView(APIView):
    """GET /healthz/ — liveness probe. Always returns 200 if the process is alive."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    @extend_schema(
        tags=["Health"],
        responses={200: inline_serializer("HealthResponse", fields={"status": serializers.CharField(), "service": serializers.CharField()})},
    )
    def get(self, request):
        return Response({"status": "ok", "service": "luxelane-api"})


class ReadinessCheckView(APIView):
    """
    GET /readyz/ — readiness probe.
    Checks: PostgreSQL · Redis · (Celery worker via cache ping)
    Returns 200 if all healthy, 503 otherwise.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    @extend_schema(
        tags=["Health"],
        responses={
            200: inline_serializer("ReadyOkResponse", fields={"status": serializers.CharField(), "checks": serializers.DictField()}),
            503: inline_serializer("ReadyDegradedResponse", fields={"status": serializers.CharField(), "checks": serializers.DictField()}),
        },
    )
    def get(self, request):
        checks = {}
        healthy = True

        # PostgreSQL
        try:
            conn = connections["default"]
            conn.ensure_connection()
            checks["postgres"] = "ok"
        except Exception as exc:
            checks["postgres"] = f"error: {exc}"
            healthy = False

        # Redis
        try:
            probe_key = f"readyz:{uuid.uuid4().hex}"
            cache.set(probe_key, "1", timeout=5)
            assert cache.get(probe_key) == "1"
            cache.delete(probe_key)
            checks["redis"] = "ok"
        except Exception as exc:
            checks["redis"] = f"error: {exc}"
            healthy = False

        status_code = 200 if healthy else 503
        return Response({"status": "ok" if healthy else "degraded", "checks": checks}, status=status_code)


from rest_framework.permissions import IsAuthenticated
from core.serializers import PresignedUploadRequestSerializer, PresignedUploadResponseSerializer
from core.services.media import generate_presigned_upload


class MediaPresignedUploadView(APIView):
    """
    POST /api/v1/media/presigned-upload/ — request a presigned upload URL for media.
    Allowed purposes: avatar, vendor_document, product_image, review_media.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Media"],
        request=PresignedUploadRequestSerializer,
        responses={200: PresignedUploadResponseSerializer},
    )
    def post(self, request):
        serializer = PresignedUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        result = generate_presigned_upload(
            purpose=d["purpose"],
            content_type=d["content_type"],
            size_bytes=d["size_bytes"],
            filename=d.get("filename"),
        )
        return Response(result)


# ── Sprint 15: Admin Dashboard Stats, Reports & Export Views ──────────────────

from rest_framework import status, viewsets
from rest_framework.decorators import action
from core.models import ExportJob, ExportJobStatus
from core.permissions import IsPlatformOrFinanceAdmin
from core.serializers import (
    AdminDashboardStatsSerializer,
    AdminSalesReportSerializer,
    AdminInventoryReportSerializer,
    AdminVendorPerformanceReportSerializer,
    ExportJobSerializer,
    ExportRequestSerializer,
)
from core.services.reporting import reporting_service


@extend_schema(tags=["Admin — Analytics & Reporting"])
class AdminDashboardStatsView(APIView):
    """
    GET /admin/dashboard/stats/ — Platform-wide executive dashboard metrics (GMV, active vendors, orders today, pending payouts, ledger drift).
    """
    permission_classes = [IsPlatformOrFinanceAdmin]

    def get(self, request):
        stats = reporting_service.get_admin_dashboard_stats()
        return Response(stats, status=status.HTTP_200_OK)


@extend_schema(tags=["Admin — Analytics & Reporting"])
class AdminReportViewSet(viewsets.ViewSet):
    """
    GET /admin/reports/sales/
    GET /admin/reports/inventory/
    GET /admin/reports/vendor-performance/
    """
    permission_classes = [IsPlatformOrFinanceAdmin]

    @action(detail=False, methods=["get"], url_path="sales")
    def sales(self, request):
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        import datetime
        s_date = datetime.date.fromisoformat(start_date) if start_date else None
        e_date = datetime.date.fromisoformat(end_date) if end_date else None

        report = reporting_service.get_sales_report(start_date=s_date, end_date=e_date)
        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="inventory")
    def inventory(self, request):
        report = reporting_service.get_inventory_report()
        return Response(report, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="vendor-performance")
    def vendor_performance(self, request):
        report = reporting_service.get_vendor_performance_report()
        return Response(report, status=status.HTTP_200_OK)


@extend_schema(tags=["Admin — Exports"])
class AdminExportView(APIView):
    """
    POST /admin/exports/{resource}/ — Enqueues an asynchronous CSV/JSON export job.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]

    def post(self, request, resource):
        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fmt = serializer.validated_data.get("format", "csv")

        job = ExportJob.objects.create(
            created_by=request.user,
            resource=resource.lower(),
            format=fmt,
            status=ExportJobStatus.QUEUED,
        )

        try:
            from core.tasks import process_export_job_task
            process_export_job_task.delay(str(job.id))
        except Exception:
            reporting_service.run_export(job)

        return Response(ExportJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


@extend_schema(tags=["Admin — Exports"])
class AdminExportStatusView(APIView):
    """
    GET /admin/exports/{resource}/{job_id}/ — Poll export job status or retrieve result data.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]

    def get(self, request, resource, job_id):
        job = ExportJob.objects.filter(id=job_id, resource=resource.lower()).first()
        if not job:
            return Response(
                {"error": {"code": "NOT_FOUND", "message": "Export job not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        if job.status in [ExportJobStatus.QUEUED, ExportJobStatus.PROCESSING]:
            reporting_service.run_export(job)
            job.refresh_from_db()

        return Response(ExportJobSerializer(job).data, status=status.HTTP_200_OK)


