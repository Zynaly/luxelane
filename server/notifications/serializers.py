"""
notifications/serializers.py — Serializers for notifications and user preferences.
"""
from rest_framework import serializers
from notifications.models import Notification, NotificationPreference, NotificationChannel, NotificationCategory


class NotificationSerializer(serializers.ModelSerializer):
    """Read-only serializer for notification list."""
    class Meta:
        model  = Notification
        fields = [
            "id", "channel", "template_code", "payload", "status",
            "sent_at", "read_at", "created_at",
        ]
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """Notification preference read/update."""
    class Meta:
        model  = NotificationPreference
        fields = ["id", "channel", "category", "is_enabled"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        user = self.context["request"].user
        pref, _ = NotificationPreference.objects.update_or_create(
            user=user,
            channel=validated_data["channel"],
            category=validated_data.get("category", NotificationCategory.TRANSACTIONAL),
            defaults={"is_enabled": validated_data.get("is_enabled", True)},
        )
        return pref
