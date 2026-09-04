"""
core/permissions.py — Project-wide DRF permission classes.

Per spec §3 (Roles → Object Permission Matrix):
  - No django-guardian; coarse role + membership-table scoping only.
  - Every permission class is explicit; no blanket ModelViewSet permissions.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS


# ── Helper ────────────────────────────────────────────────────────────────────
def _role(request):
    return getattr(request.user, "role", None)


# ── Admin roles ───────────────────────────────────────────────────────────────
class IsSuperAdmin(BasePermission):
    """Only super_admin. Bypasses all object checks."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and _role(request) == "super_admin")


class IsPlatformAdmin(BasePermission):
    """super_admin or platform_admin."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) in ("super_admin", "platform_admin")
        )


class IsFinanceAdmin(BasePermission):
    """super_admin or finance_admin — ledger, refunds, payouts, escrow."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) in ("super_admin", "finance_admin")
        )


class IsPlatformOrFinanceAdmin(BasePermission):
    """super_admin, platform_admin, or finance_admin."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) in ("super_admin", "platform_admin", "finance_admin")
        )


# ── Vendor ────────────────────────────────────────────────────────────────────
class IsVendorMember(BasePermission):
    """
    User must be vendor_owner or vendor_staff.
    Queryset scoping to own vendor is done via ScopedToVendorMixin (Sprint 3).
    """
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) in ("vendor_owner", "vendor_staff")
        )


class IsVendorOwner(BasePermission):
    """Only vendor_owner (not staff)."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) == "vendor_owner"
        )


# ── Warehouse ─────────────────────────────────────────────────────────────────
class IsWarehouseMember(BasePermission):
    """warehouse_manager or warehouse_staff."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) in ("warehouse_manager", "warehouse_staff")
        )


class IsWarehouseManager(BasePermission):
    """Only warehouse_manager."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) == "warehouse_manager"
        )


# ── Delivery agent ────────────────────────────────────────────────────────────
class IsAssignedDeliveryAgent(BasePermission):
    """
    delivery_agent role. Object-level check (assigned to this shipment/COD)
    is enforced in the view's get_object() queryset filter.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and _role(request) == "delivery_agent"
        )


# ── Object owner ─────────────────────────────────────────────────────────────
class IsObjectOwner(BasePermission):
    """
    Object belongs to the requesting user.
    Checks obj.user_id == request.user.id  OR  obj.customer_id == request.user.id.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user_id = request.user.id
        return (
            getattr(obj, "user_id", None) == user_id
            or getattr(obj, "customer_id", None) == user_id
        )


# ── Read-only public ──────────────────────────────────────────────────────────
class IsAuthenticatedOrReadOnly(BasePermission):
    """Public GET; authenticated for mutation."""
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)
