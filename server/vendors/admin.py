"""
vendors/admin.py — Django admin for all vendor models.
"""
from django.contrib import admin
from vendors.models import (
    Vendor, VendorStaff, VendorDocument,
    VendorBankAccount, VendorPolicy, CommissionRule,
    VendorPayout, PayoutLineItem, PayoutAdjustment,
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


class PayoutLineItemInline(admin.TabularInline):
    from vendors.models import PayoutLineItem
    model = PayoutLineItem
    extra = 0
    readonly_fields = ["vendor_order", "amount", "created_at"]


class PayoutAdjustmentInline(admin.TabularInline):
    from vendors.models import PayoutAdjustment
    model = PayoutAdjustment
    extra = 0
    readonly_fields = ["amount", "reason", "source_reference_id", "created_at"]


@admin.register(VendorPayout)
class VendorPayoutAdmin(admin.ModelAdmin):
    from vendors.models import VendorPayout
    list_display = ["id", "vendor", "period_start", "period_end", "net_amount", "status", "disbursed_at", "created_at"]
    list_filter = ["status", "period_start", "period_end"]
    search_fields = ["vendor__display_name", "external_transfer_id"]
    readonly_fields = ["id", "gross_amount", "adjustments_total", "net_amount", "ledger_entry_group_id", "created_at", "updated_at"]
    inlines = [PayoutLineItemInline, PayoutAdjustmentInline]


@admin.register(PayoutAdjustment)
class PayoutAdjustmentAdmin(admin.ModelAdmin):
    from vendors.models import PayoutAdjustment
    list_display = ["id", "vendor", "payout", "amount", "reason", "created_at"]
    list_filter = ["reason"]
    search_fields = ["vendor__display_name", "note"]
    readonly_fields = ["id", "created_at", "updated_at"]

