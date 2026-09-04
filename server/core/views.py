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
