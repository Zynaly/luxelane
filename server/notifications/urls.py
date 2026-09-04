"""
notifications/urls.py — Notification endpoints.
Mounted at /api/v1/notifications/ in config/api_router.py
"""
from django.urls import path, include
from rest_framework.routers import SimpleRouter
from notifications.views import NotificationViewSet, NotificationPreferenceViewSet

router = SimpleRouter()
router.register("preferences", NotificationPreferenceViewSet, basename="notification-preference")
router.register("", NotificationViewSet, basename="notification")

urlpatterns = [
    path("", include(router.urls)),
]
