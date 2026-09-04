"""
notifications/admin.py — Admin registration for notifications models.
"""
from django.contrib import admin
from notifications.models import Notification, NotificationTemplate, NotificationPreference


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = ("code", "channel", "subject", "created_at")
    search_fields = ("code", "subject")
    list_filter = ("channel",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "template_code", "channel", "status", "sent_at", "read_at", "created_at")
    list_filter = ("channel", "status")
    search_fields = ("user__email", "template_code")


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "channel", "category", "is_enabled")
    list_filter = ("channel", "category", "is_enabled")
    search_fields = ("user__email",)
