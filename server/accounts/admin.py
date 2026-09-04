from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from accounts.models import User, OTPVerification, SocialAccount, Address, LedgerAccount, LedgerEntry


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "phone", "role", "is_verified", "is_active", "is_staff", "created_at")
    list_filter = ("role", "is_verified", "is_active", "is_staff")
    search_fields = ("email", "phone", "first_name", "last_name")
    ordering = ("-created_at",)
    fieldsets = (
        (None, {"fields": ("email", "phone", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "avatar_url")}),
        ("Permissions & Roles", {"fields": ("role", "is_verified", "two_factor_enabled", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "last_login_at")}),
    )


@admin.register(OTPVerification)
class OTPVerificationAdmin(admin.ModelAdmin):
    list_display = ("destination", "purpose", "expires_at", "attempts", "consumed_at", "created_at")
    list_filter = ("purpose", "consumed_at")
    search_fields = ("destination",)


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "provider", "provider_uid", "created_at")
    search_fields = ("user__email", "provider_uid")


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("user", "label", "city", "country", "type", "is_default")
    search_fields = ("user__email", "label", "city")


@admin.register(LedgerAccount)
class LedgerAccountAdmin(admin.ModelAdmin):
    list_display = ("account_key", "account_type", "currency", "owner_user", "created_at")
    list_filter = ("account_type", "currency")
    search_fields = ("account_key",)


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = ("account", "amount", "entry_group_id", "reference_type", "created_at")
    list_filter = ("reference_type",)
    search_fields = ("account__account_key", "reference_type")

