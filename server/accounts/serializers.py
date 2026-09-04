"""
accounts/serializers.py — Sprint 1: Identity & RBAC serializers.
"""
import re
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import User, OTPVerification, OTPPurpose, RoleEnum
from accounts.services import otp as otp_service


# ── Helpers ───────────────────────────────────────────────────────────────────
E164_RE = re.compile(r"^\+[1-9]\d{1,14}$")


def _validate_e164(phone: str):
    if not E164_RE.match(phone):
        raise serializers.ValidationError("Phone must be in E.164 format, e.g. +12125551234")
    return phone


# ── Register ──────────────────────────────────────────────────────────────────
class UserRegisterSerializer(serializers.ModelSerializer):
    password   = serializers.CharField(write_only=True, min_length=8)
    email      = serializers.EmailField(required=False, allow_blank=True)
    phone      = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model  = User
        fields = ["email", "phone", "password", "first_name", "last_name"]

    def validate(self, data):
        if not data.get("email") and not data.get("phone"):
            raise serializers.ValidationError("At least one of email or phone is required.")
        if data.get("phone"):
            _validate_e164(data["phone"])
        validate_password(data["password"])
        return data

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        return user


class VendorRegisterSerializer(UserRegisterSerializer):
    """
    Creates User(role=vendor_owner) + Vendor(status=pending) in one transaction.
    Vendor fields are created in accounts.views.VendorRegisterView using a service call.
    """
    legal_name   = serializers.CharField(max_length=255)
    display_name = serializers.CharField(max_length=255)

    class Meta(UserRegisterSerializer.Meta):
        fields = UserRegisterSerializer.Meta.fields + ["legal_name", "display_name"]

    def create(self, validated_data):
        legal_name   = validated_data.pop("legal_name")
        display_name = validated_data.pop("display_name")
        password     = validated_data.pop("password")

        from django.db import transaction
        with transaction.atomic():
            user = User.objects.create_user(
                password=password,
                role=RoleEnum.VENDOR_OWNER,
                **validated_data,
            )
            # Vendor created here; import deferred to avoid circular import (Sprint 3)
            try:
                from vendors.models import Vendor
                import re as _re
                slug_base = _re.sub(r"[^a-z0-9]+", "-", display_name.lower()).strip("-")
                slug = slug_base
                counter = 1
                while Vendor.objects.filter(slug=slug).exists():
                    slug = f"{slug_base}-{counter}"
                    counter += 1
                Vendor.objects.create(
                    owner_user=user,
                    legal_name=legal_name,
                    display_name=display_name,
                    slug=slug,
                    status="pending",
                )
            except (ImportError, RuntimeError):
                pass
        return user


# ── Login ─────────────────────────────────────────────────────────────────────
class LoginSerializer(TokenObtainPairSerializer):
    """
    email_or_phone + password → access + refresh tokens.
    Works as the custom TOKEN_OBTAIN_SERIALIZER for SimpleJWT.
    """
    username_field = "email_or_phone"
    email_or_phone = serializers.CharField()
    password       = serializers.CharField(write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Remove default username/password fields added by parent
        self.fields.pop("email", None)

    def validate(self, data):
        email_or_phone = data.get("email_or_phone", "").strip()
        password = data.get("password", "")

        # Resolve to a User
        if "@" in email_or_phone:
            try:
                user = User.objects.get(email=email_or_phone)
            except User.DoesNotExist:
                raise serializers.ValidationError({"email_or_phone": "No account found."})
        else:
            try:
                user = User.objects.get(phone=email_or_phone)
            except User.DoesNotExist:
                raise serializers.ValidationError({"email_or_phone": "No account found."})

        if not user.check_password(password):
            raise serializers.ValidationError({"password": "Invalid password."})

        if not user.is_active:
            raise serializers.ValidationError({"non_field_errors": "Account suspended."})

        # Use the resolved user to generate tokens
        refresh = self.get_token(user)
        user.last_login_at = timezone.now()
        user.save(update_fields=["last_login_at"])

        return {
            "access":  str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserMeSerializer(user).data,
        }


# ── OTP ───────────────────────────────────────────────────────────────────────
class OTPRequestSerializer(serializers.Serializer):
    destination = serializers.CharField()
    purpose     = serializers.ChoiceField(choices=OTPPurpose.choices)

    def validate_destination(self, value):
        value = value.strip()
        if "@" not in value:
            _validate_e164(value)
        return value


class OTPVerifySerializer(serializers.Serializer):
    destination = serializers.CharField()
    code        = serializers.CharField(min_length=6, max_length=6)
    purpose     = serializers.ChoiceField(choices=OTPPurpose.choices)


class OTPResendSerializer(serializers.Serializer):
    destination = serializers.CharField()
    purpose     = serializers.ChoiceField(choices=OTPPurpose.choices)


# ── Password ──────────────────────────────────────────────────────────────────
class PasswordForgotSerializer(serializers.Serializer):
    email_or_phone = serializers.CharField()


class PasswordResetSerializer(serializers.Serializer):
    destination  = serializers.CharField()
    code         = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value

    def validate(self, data):
        user = self.context["request"].user
        if not user.check_password(data["old_password"]):
            raise serializers.ValidationError({"old_password": "Incorrect current password."})
        return data


# ── 2FA ───────────────────────────────────────────────────────────────────────
class TwoFactorEnableSerializer(serializers.Serializer):
    """Sends an OTP to the user's email/phone to confirm 2FA activation."""
    pass   # no body — user triggers from their own account


class TwoFactorVerifySerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)


# ── User profile ──────────────────────────────────────────────────────────────
class UserMeSerializer(serializers.ModelSerializer):
    """Read/update own profile. Role and email cannot be changed here."""
    class Meta:
        model  = User
        fields = [
            "id", "email", "phone", "first_name", "last_name",
            "role", "is_verified", "two_factor_enabled",
            "avatar_url", "created_at",
        ]
        read_only_fields = ["id", "email", "role", "is_verified", "created_at"]


# ── Admin serializers ─────────────────────────────────────────────────────────
class AdminUserSerializer(serializers.ModelSerializer):
    """Full user detail for platform admins — includes role and status."""
    class Meta:
        model  = User
        fields = [
            "id", "email", "phone", "first_name", "last_name",
            "role", "is_verified", "is_active", "two_factor_enabled",
            "avatar_url", "last_login_at", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AdminUserStatusUpdateSerializer(serializers.Serializer):
    """PATCH /admin/users/{id}/status/ — suspend or reactivate a user."""
    is_active = serializers.BooleanField()
    reason    = serializers.CharField(required=False, allow_blank=True)


# ── Address Serializers (Sprint 2) ───────────────────────────────────────────
from accounts.models import Address, AddressType
from core.services.geocoding import GeocodingAdapter


class AddressSerializer(serializers.ModelSerializer):
    """
    Owner-scoped CRUD address serializer.
    Automatically ensures only one default address exists per (user, type).
    """
    class Meta:
        model = Address
        fields = [
            "id", "label", "line1", "line2", "city", "state", "country", "postal_code",
            "latitude", "longitude", "type", "is_default", "contact_phone",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        user = self.context["request"].user
        is_default = validated_data.get("is_default", False)
        addr_type = validated_data.get("type", AddressType.BOTH)

        from django.db import transaction
        with transaction.atomic():
            if is_default:
                # Unset previous default of compatible type
                types_to_clear = [addr_type, AddressType.BOTH] if addr_type != AddressType.BOTH else [AddressType.SHIPPING, AddressType.BILLING, AddressType.BOTH]
                Address.objects.filter(user=user, type__in=types_to_clear, is_default=True).update(is_default=False)

            # Auto-geocode if coordinates not passed explicitly
            if not validated_data.get("latitude") or not validated_data.get("longitude"):
                geo = GeocodingAdapter.validate_and_normalize(validated_data)
                validated_data["latitude"] = geo.get("latitude")
                validated_data["longitude"] = geo.get("longitude")

            address = Address.objects.create(user=user, **validated_data)
        return address

    def update(self, instance, validated_data):
        user = self.context["request"].user
        is_default = validated_data.get("is_default", instance.is_default)
        addr_type = validated_data.get("type", instance.type)

        from django.db import transaction
        with transaction.atomic():
            if is_default and not instance.is_default:
                types_to_clear = [addr_type, AddressType.BOTH] if addr_type != AddressType.BOTH else [AddressType.SHIPPING, AddressType.BILLING, AddressType.BOTH]
                Address.objects.filter(user=user, type__in=types_to_clear, is_default=True).exclude(id=instance.id).update(is_default=False)

            return super().update(instance, validated_data)


class AddressValidateSerializer(serializers.Serializer):
    """Input raw address components, returns normalized components + lat/lng."""
    line1       = serializers.CharField(max_length=255)
    line2       = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city        = serializers.CharField(max_length=100)
    state       = serializers.CharField(max_length=100, required=False, allow_blank=True)
    country     = serializers.CharField(max_length=100, default="US")
    postal_code = serializers.CharField(max_length=20)

    def validate(self, data):
        normalized = GeocodingAdapter.validate_and_normalize(data)
        return normalized

