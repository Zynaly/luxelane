"""core app — BaseModel, AuditLog, Setting, shared utilities."""
import uuid
from django.db import models


class BaseModel(models.Model):
    """
    Abstract base class inherited by EVERY model in the project.
    Fields per spec §0:
      - id          : UUID primary key
      - created_at  : auto timestamp on create
      - updated_at  : auto timestamp on update
      - is_deleted  : soft-delete flag (never set on append-only/financial models)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def soft_delete(self):
        """Soft-delete this instance instead of removing from DB."""
        self.is_deleted = True
        self.save(update_fields=["is_deleted", "updated_at"])


class SoftDeleteManager(models.Manager):
    """Default manager that excludes soft-deleted rows."""
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class AllObjectsManager(models.Manager):
    """Manager that includes soft-deleted rows (for admin / recovery)."""
    pass


# ── AuditLog ─────────────────────────────────────────────────────────────────
class AuditLog(models.Model):
    """
    Append-only audit trail. No soft-delete — never mutated after write.
    Written via core.middleware.AuditLogMiddleware on admin-role mutating requests.
    actor FK is migrated to a real FK in Sprint 1 once accounts.User exists.
    """
    actor_id = models.UUIDField(null=True, db_index=True)  # raw UUID; FK wired in Sprint 1
    action = models.CharField(max_length=100, db_index=True)  # e.g. "vendor.approved"
    target_model = models.CharField(max_length=100)
    target_id = models.UUIDField(null=True)
    before = models.JSONField(null=True)
    after = models.JSONField(null=True)
    ip_address = models.GenericIPAddressField(null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["target_model", "target_id"]),
            models.Index(fields=["actor_id"]),
        ]

    def __str__(self):
        return f"{self.action} by {self.actor_id} on {self.target_model}:{self.target_id}"


# ── Setting (feature flags + platform config) ─────────────────────────────────
class Setting(models.Model):
    """
    Key-value store for platform settings and feature flags.
    Toggle via AdminSettingViewSet (Sprint 16).
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    is_feature_flag = models.BooleanField(default=False)
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return f"{self.key}={'🚩' if self.is_feature_flag else '⚙️'} {self.value}"
