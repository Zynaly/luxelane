"""
notifications/views.py — Sprint 2: Notifications and preferences views.
"""
from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers

from core.permissions import IsObjectOwner
from notifications.models import Notification, NotificationPreference
from notifications.serializers import NotificationSerializer, NotificationPreferenceSerializer
from notifications.services import mark_read


@extend_schema(tags=["Notifications"])
class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    User notifications inbox.
    GET /api/v1/notifications/ — list notifications for current user.
    POST /api/v1/notifications/{id}/read/ — mark a notification as read.
    """
    permission_classes = [IsAuthenticated, IsObjectOwner]
    serializer_class   = NotificationSerializer
    queryset           = Notification.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return Notification.objects.none()
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")

    @extend_schema(
        request=None,
        responses={200: inline_serializer("NotificationReadResponse", fields={"detail": serializers.CharField()})},
    )
    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        success = mark_read(notification_id=pk, user=request.user)
        if not success:
            return Response({"detail": "Notification not found or already read."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"detail": "Notification marked as read."}, status=status.HTTP_200_OK)


@extend_schema(tags=["Notifications"])
class NotificationPreferenceViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    User notification preferences.
    GET /api/v1/notifications/preferences/ — list preferences.
    POST /api/v1/notifications/preferences/ — create or update preference.
    PUT/PATCH /api/v1/notifications/preferences/{id}/ — update single preference.
    """
    permission_classes = [IsAuthenticated, IsObjectOwner]
    serializer_class   = NotificationPreferenceSerializer
    queryset           = NotificationPreference.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return NotificationPreference.objects.none()
        return NotificationPreference.objects.filter(user=self.request.user).order_by("channel", "category")
