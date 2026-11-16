"""
notifications/models.py — Sprint 2: Notifications, templates, and preferences.
"""
from django.db import models
from django.conf import settings
from core.models import BaseModel


class NotificationChannel(models.TextChoices):
    EMAIL  = "email",  "Email"
    SMS    = "sms",    "SMS"
    PUSH   = "push",   "Push"
    IN_APP = "in_app", "In-App"


class NotificationStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    SENT   = "sent",   "Sent"
    FAILED = "failed", "Failed"
    READ   = "read",   "Read"


class NotificationCategory(models.TextChoices):
    TRANSACTIONAL = "transactional", "Transactional"
    MARKETING     = "marketing",     "Marketing"


class NotificationTemplate(BaseModel):
    """Notification message templates with variable interpolation."""
    code          = models.CharField(max_length=100, unique=True)  # e.g. "order_confirmed", "otp_login"
    channel       = models.CharField(max_length=20, choices=NotificationChannel.choices)
    subject       = models.CharField(max_length=255, null=True, blank=True)
    body_template = models.TextField()

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} ({self.channel})"


class Notification(BaseModel):
    """User notifications log/inbox."""
    user          = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    channel       = models.CharField(max_length=20, choices=NotificationChannel.choices)
    template_code = models.CharField(max_length=100)
    payload       = models.JSONField(default=dict, blank=True)
    status        = models.CharField(max_length=20, choices=NotificationStatus.choices, default=NotificationStatus.QUEUED)
    sent_at       = models.DateTimeField(null=True, blank=True)
    read_at       = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"Notification({self.template_code}) → {self.user_id} [{self.status}]"


class NotificationPreference(BaseModel):
    """Per-user opt-in/opt-out preferences per channel & category."""
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preferences")
    channel    = models.CharField(max_length=20, choices=NotificationChannel.choices)
    category   = models.CharField(max_length=30, choices=NotificationCategory.choices, default=NotificationCategory.TRANSACTIONAL)
    is_enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ["channel", "category"]
        unique_together = [("user", "channel", "category")]

    def __str__(self):
        return f"{self.user_id}: {self.channel}/{self.category}={'ON' if self.is_enabled else 'OFF'}"
