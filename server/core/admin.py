from django.contrib import admin
from core.models import AuditLog, Setting, ExportJob


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["action", "actor", "target_model", "target_id", "created_at"]
    list_filter = ["action", "target_model"]
    search_fields = ["action", "actor__email", "target_model"]
    readonly_fields = ["id", "actor", "action", "target_model", "target_id", "before", "after", "ip_address", "created_at"]


@admin.register(Setting)
class SettingAdmin(admin.ModelAdmin):
    list_display = ["key", "is_feature_flag", "updated_at"]
    list_filter = ["is_feature_flag"]
    search_fields = ["key", "description"]


@admin.register(ExportJob)
class ExportJobAdmin(admin.ModelAdmin):
    list_display = ["id", "resource", "format", "status", "created_by", "created_at"]
    list_filter = ["status", "resource", "format"]
    search_fields = ["resource", "created_by__email"]
    readonly_fields = ["id", "created_at", "updated_at"]

