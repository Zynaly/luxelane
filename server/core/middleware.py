"""
core.middleware — project-wide middleware.

AuditLogMiddleware : Writes AuditLog rows on mutating requests by admin roles.
RequestIdMiddleware: Attaches a unique X-Request-ID to every request/response.
"""
import uuid
import threading

# Thread-local storage for request-id propagation
_local = threading.local()


def get_current_request_id() -> str:
    return getattr(_local, "request_id", "")


class RequestIdMiddleware:
    """Attach a unique UUID to every request for log correlation."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        _local.request_id = request_id
        request.request_id = request_id

        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response


class AuditLogMiddleware:
    """
    Write AuditLog entries for mutating requests made by admin-role users.
    Full implementation will be completed in Sprint 2 once the accounts app
    and User model exist. Stub here so it can be listed in MIDDLEWARE from Sprint 0.
    """

    AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    ADMIN_ROLES = {
        "super_admin",
        "platform_admin",
        "finance_admin",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Full audit logging wired in Sprint 2 when accounts.User exists.
        user = getattr(request, "user", None)
        if (
            user
            and user.is_authenticated
            and request.method in self.AUDIT_METHODS
            and getattr(user, "role", None) in self.ADMIN_ROLES
        ):
            self._write_log(request, response)

        return response

    def _write_log(self, request, response):
        """Write an AuditLog row. Silently swallows errors to never break requests."""
        try:
            from core.models import AuditLog  # noqa: PLC0415 — deferred import
            AuditLog.objects.create(
                actor_id=request.user.id,
                action=f"{request.method}:{request.path}",
                target_model="",
                target_id=None,
                before=None,
                after=None,
                ip_address=self._get_ip(request),
            )
        except Exception:
            pass  # never let audit logging crash a request

    @staticmethod
    def _get_ip(request) -> str:
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")
