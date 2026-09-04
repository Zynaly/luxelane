"""LuxeLane — root URL configuration."""
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core.views import HealthCheckView, ReadinessCheckView

urlpatterns = [
    # ── Health / Readiness (infra) ────────────────────────────────────────────
    path("healthz/", HealthCheckView.as_view(), name="healthz"),
    path("readyz/", ReadinessCheckView.as_view(), name="readyz"),

    # ── Django admin ──────────────────────────────────────────────────────────
    path("django-admin/", admin.site.urls),

    # ── OpenAPI ───────────────────────────────────────────────────────────────
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

    # ── API v1 ────────────────────────────────────────────────────────────────
    path("api/v1/", include("config.api_router")),
]
