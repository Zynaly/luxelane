"""
vendors/serializers.py — Sprint 3: Vendors, KYC, Staff, Commission serializers.
"""
import re
from rest_framework import serializers
from vendors.models import (
    Vendor, VendorStaff, VendorDocument, VendorBankAccount,
    VendorPolicy, CommissionRule, VendorStatus,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_slug(name: str) -> str:
    slug_base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = slug_base
    counter = 1
    while Vendor.objects.filter(slug=slug).exists():
        slug = f"{slug_base}-{counter}"
        counter += 1
    return slug


# ── Vendor Application (write) ────────────────────────────────────────────────

class VendorApplicationSerializer(serializers.ModelSerializer):
    """
    POST /vendors/apply/ — authenticated user applies to become a vendor.
    Creates Vendor(status=pending) + upgrades user role to vendor_owner.
    """
    class Meta:
        model = Vendor
        fields = [
            "legal_name", "display_name", "description",
            "tax_id", "support_email", "support_phone",
        ]

    def validate(self, data):
        user = self.context["request"].user
        if hasattr(user, "vendor"):
            raise serializers.ValidationError("You already have a vendor account.")
        return data

    def create(self, validated_data):
        user = self.context["request"].user
        from django.db import transaction
        with transaction.atomic():
            slug = _make_slug(validated_data["display_name"])
            vendor = Vendor.objects.create(
                owner_user=user,
                slug=slug,
                status=VendorStatus.PENDING,
                **validated_data,
            )
            # Auto-create policy with defaults
            VendorPolicy.objects.create(vendor=vendor)
            # Promote user role
            from accounts.models import RoleEnum
            user.role = RoleEnum.VENDOR_OWNER
            user.save(update_fields=["role"])
        return vendor


# ── Vendor Me (read/update own profile) ──────────────────────────────────────

class VendorMeSerializer(serializers.ModelSerializer):
    """GET/PATCH /vendors/me/ — vendor owner reads/updates own vendor profile."""
    class Meta:
        model = Vendor
        fields = [
            "id", "legal_name", "display_name", "slug", "status",
            "description", "tax_id", "support_email", "support_phone",
            "logo_url", "banner_url", "rating_avg", "total_ratings",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "status", "rating_avg", "total_ratings", "created_at", "updated_at"]


# ── Vendor Storefront (public) ────────────────────────────────────────────────

class VendorStorefrontSerializer(serializers.ModelSerializer):
    """Public-facing vendor profile. Returned by GET /vendors/{slug}/storefront/."""
    class Meta:
        model = Vendor
        fields = [
            "id", "display_name", "slug", "description",
            "logo_url", "banner_url", "rating_avg", "total_ratings",
            "support_email", "support_phone",
        ]


# ── VendorStaff ───────────────────────────────────────────────────────────────

class VendorStaffSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_name  = serializers.SerializerMethodField()

    class Meta:
        model = VendorStaff
        fields = ["id", "user", "user_email", "user_name", "staff_role", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_user_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.email


# ── VendorDocument ────────────────────────────────────────────────────────────

class VendorDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorDocument
        fields = ["id", "doc_type", "file_url", "status", "reviewer_note", "created_at"]
        read_only_fields = ["id", "status", "reviewer_note", "created_at"]


# ── VendorBankAccount ─────────────────────────────────────────────────────────

class VendorBankAccountSerializer(serializers.ModelSerializer):
    """
    Full account_number on write; masked '**** XXXX' on read.
    """
    class Meta:
        model = VendorBankAccount
        fields = [
            "id", "account_holder", "bank_name", "account_number",
            "routing_number", "account_type", "is_primary", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {
            "account_number": {"write_only": False},  # controlled via to_representation
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        raw = data.get("account_number", "") or ""
        # Mask everything except last 4 digits
        if len(raw) > 4:
            data["account_number"] = f"**** {raw[-4:]}"
        else:
            data["account_number"] = "**** ****"
        return data

    def create(self, validated_data):
        vendor = self.context["vendor"]
        # Ensure only one primary per vendor
        if validated_data.get("is_primary"):
            VendorBankAccount.objects.filter(vendor=vendor, is_primary=True).update(is_primary=False)
        return VendorBankAccount.objects.create(vendor=vendor, **validated_data)


# ── VendorPolicy ──────────────────────────────────────────────────────────────

class VendorPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorPolicy
        fields = [
            "id", "return_window_days", "return_policy_text",
            "shipping_policy_text", "cancellation_policy_text",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ── Admin: Vendor (full read) ─────────────────────────────────────────────────

class AdminVendorSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source="owner_user.email", read_only=True)
    owner_name  = serializers.SerializerMethodField()

    class Meta:
        model = Vendor
        fields = [
            "id", "legal_name", "display_name", "slug", "status",
            "description", "tax_id", "support_email", "support_phone",
            "logo_url", "banner_url", "rating_avg", "total_ratings",
            "rejection_reason", "owner_email", "owner_name",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_owner_name(self, obj):
        u = obj.owner_user
        return f"{u.first_name} {u.last_name}".strip() or str(u.email)


# ── Admin: Vendor Status Update ───────────────────────────────────────────────

class AdminVendorStatusSerializer(serializers.Serializer):
    status           = serializers.ChoiceField(choices=["active", "suspended", "rejected"])
    rejection_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        if data["status"] == "rejected" and not data.get("rejection_reason"):
            raise serializers.ValidationError({"rejection_reason": "Required when rejecting a vendor."})
        return data


# ── Admin: Document Review ────────────────────────────────────────────────────

class AdminVendorDocumentReviewSerializer(serializers.Serializer):
    status        = serializers.ChoiceField(choices=["approved", "rejected"])
    reviewer_note = serializers.CharField(required=False, allow_blank=True)


# ── Admin: Commission Rule ────────────────────────────────────────────────────

class AdminCommissionRuleSerializer(serializers.ModelSerializer):
    vendor_name = serializers.SerializerMethodField()

    class Meta:
        model = CommissionRule
        fields = [
            "id", "vendor", "vendor_name", "rate_pct",
            "effective_from", "effective_to", "is_active", "note",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_vendor_name(self, obj):
        return obj.vendor.display_name if obj.vendor_id else "Platform Default"
