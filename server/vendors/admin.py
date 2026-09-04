"""
vendors/admin.py — Django admin for all vendor models.
"""
from django.contrib import admin
from vendors.models import (
    Vendor, VendorStaff, VendorDocument,
    VendorBankAccount, VendorPolicy, CommissionRule,
)


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display  = ["display_name", "legal_name", "status", "owner_user", "rating_avg", "created_at"]
    list_filter   = ["status"]
    search_fields = ["display_name", "legal_name", "owner_user__email"]
    readonly_fields = ["id", "slug", "rating_avg", "total_ratings", "created_at", "updated_at"]
    ordering      = ["-created_at"]


@admin.register(VendorStaff)
class VendorStaffAdmin(admin.ModelAdmin):
    list_display  = ["vendor", "user", "staff_role", "is_active", "created_at"]
    list_filter   = ["staff_role", "is_active"]
    search_fields = ["vendor__display_name", "user__email"]


@admin.register(VendorDocument)
class VendorDocumentAdmin(admin.ModelAdmin):
    list_display  = ["vendor", "doc_type", "status", "created_at"]
    list_filter   = ["doc_type", "status"]
    search_fields = ["vendor__display_name"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(VendorBankAccount)
class VendorBankAccountAdmin(admin.ModelAdmin):
    list_display  = ["vendor", "bank_name", "account_holder", "account_type", "is_primary"]
    list_filter   = ["account_type", "is_primary"]
    search_fields = ["vendor__display_name", "account_holder"]
    readonly_fields = ["id", "created_at", "updated_at"]

    def get_fields(self, request, obj=None):
        fields = super().get_fields(request, obj)
        # Show masked account number in admin
        return fields


@admin.register(VendorPolicy)
class VendorPolicyAdmin(admin.ModelAdmin):
    list_display  = ["vendor", "return_window_days", "updated_at"]
    search_fields = ["vendor__display_name"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(CommissionRule)
class CommissionRuleAdmin(admin.ModelAdmin):
    list_display  = ["vendor", "rate_pct", "effective_from", "effective_to", "is_active"]
    list_filter   = ["is_active"]
    search_fields = ["vendor__display_name"]
    readonly_fields = ["id", "created_at", "updated_at"]
