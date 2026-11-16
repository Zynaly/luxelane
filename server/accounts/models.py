"""
accounts/models.py

Models for Sprint 1: User, OTPVerification, SocialAccount
Also includes: LedgerAccount, LedgerEntry (spec §2.1 — lives in accounts app)
"""
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from core.models import BaseModel


# ── Role Enum ──────────────────────────────────────────────────────────────────
class RoleEnum(models.TextChoices):
    SUPER_ADMIN       = "super_admin",       "Super Admin"
    PLATFORM_ADMIN    = "platform_admin",    "Platform Admin"
    FINANCE_ADMIN     = "finance_admin",     "Finance Admin"
    VENDOR_OWNER      = "vendor_owner",      "Vendor Owner"
    VENDOR_STAFF      = "vendor_staff",      "Vendor Staff"
    WAREHOUSE_MANAGER = "warehouse_manager", "Warehouse Manager"
    WAREHOUSE_STAFF   = "warehouse_staff",   "Warehouse Staff"
    DELIVERY_AGENT    = "delivery_agent",    "Delivery Agent"
    CUSTOMER          = "customer",          "Customer"


# ── Custom User Manager ────────────────────────────────────────────────────────
class UserManager(BaseUserManager):
    def _create_user(self, password, **extra_fields):
        user = self.model(**extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, password=None, **extra_fields):
        extra_fields.setdefault("role", RoleEnum.CUSTOMER)
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(password, **extra_fields)

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault("role", RoleEnum.SUPER_ADMIN)
        extra_fields["is_staff"] = True
        extra_fields["is_superuser"] = True
        extra_fields["is_verified"] = True
        extra_fields["email"] = email
        return self._create_user(password, **extra_fields)


# ── User ──────────────────────────────────────────────────────────────────────
class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model. No soft-delete per spec §2.1.
    Either email or phone required (enforced in serializer layer).
    """
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email         = models.EmailField(unique=True, null=True, blank=True)
    phone         = models.CharField(max_length=20, unique=True, null=True, blank=True)
    role          = models.CharField(max_length=30, choices=RoleEnum.choices, default=RoleEnum.CUSTOMER, db_index=True)
    first_name    = models.CharField(max_length=100, blank=True)
    last_name     = models.CharField(max_length=100, blank=True)
    is_verified   = models.BooleanField(default=False)
    is_active     = models.BooleanField(default=True)
    is_staff      = models.BooleanField(default=False)   # Django admin access
    two_factor_enabled = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    avatar_url    = models.URLField(null=True, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.email or self.phone or str(self.id)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or str(self.id)

    # ── Role helpers ─────────────────────────────────────────────────────────
    @property
    def is_super_admin(self):      return self.role == RoleEnum.SUPER_ADMIN
    @property
    def is_platform_admin(self):   return self.role in (RoleEnum.PLATFORM_ADMIN, RoleEnum.SUPER_ADMIN)
    @property
    def is_finance_admin(self):    return self.role in (RoleEnum.FINANCE_ADMIN, RoleEnum.SUPER_ADMIN)
    @property
    def is_vendor(self):           return self.role in (RoleEnum.VENDOR_OWNER, RoleEnum.VENDOR_STAFF)
    @property
    def is_warehouse_member(self): return self.role in (RoleEnum.WAREHOUSE_MANAGER, RoleEnum.WAREHOUSE_STAFF)
    @property
    def is_delivery_agent(self):   return self.role == RoleEnum.DELIVERY_AGENT


# ── OTPVerification ──────────────────────────────────────────────────────────
class OTPPurpose(models.TextChoices):
    REGISTER       = "register",       "Register"
    LOGIN          = "login",          "Login"
    RESET_PASSWORD = "reset_password", "Reset Password"
    CHANGE_PHONE   = "change_phone",   "Change Phone"


class OTPVerification(BaseModel):
    """
    OTP records. code_hash stores bcrypt hash — never plaintext.
    Locked out after 5 failed attempts.
    """
    user        = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name="otps")
    destination = models.CharField(max_length=255)   # email or phone value
    code_hash   = models.CharField(max_length=255)   # never store plaintext
    purpose     = models.CharField(max_length=30, choices=OTPPurpose.choices)
    expires_at  = models.DateTimeField()
    attempts    = models.IntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["destination", "purpose"]),
        ]

    def __str__(self):
        return f"OTP({self.purpose}) → {self.destination}"

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() >= self.expires_at

    @property
    def is_consumed(self):
        return self.consumed_at is not None

    @property
    def is_locked(self):
        return self.attempts >= 5


# ── SocialAccount ─────────────────────────────────────────────────────────────
class SocialProvider(models.TextChoices):
    GOOGLE   = "google",   "Google"
    FACEBOOK = "facebook", "Facebook"
    APPLE    = "apple",    "Apple"


class SocialAccount(BaseModel):
    user         = models.ForeignKey(User, on_delete=models.CASCADE, related_name="social_accounts")
    provider     = models.CharField(max_length=20, choices=SocialProvider.choices)
    provider_uid = models.CharField(max_length=255)

    class Meta:
        unique_together = [("provider", "provider_uid")]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.provider}:{self.provider_uid}"


# ── Address (spec §2.1 — lives in accounts app) ───────────────────────────────
class AddressType(models.TextChoices):
    SHIPPING = "shipping", "Shipping"
    BILLING  = "billing",  "Billing"
    BOTH     = "both",     "Both"


class Address(BaseModel):
    """User shipping/billing addresses with geocoordinates."""
    user          = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    label         = models.CharField(max_length=50, blank=True)   # "Home", "Office"
    line1         = models.CharField(max_length=255)
    line2         = models.CharField(max_length=255, blank=True)
    city          = models.CharField(max_length=100)
    state         = models.CharField(max_length=100)
    country       = models.CharField(max_length=100)
    postal_code   = models.CharField(max_length=20)
    latitude      = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude     = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    type          = models.CharField(max_length=10, choices=AddressType.choices, default=AddressType.BOTH)
    is_default    = models.BooleanField(default=False)
    contact_phone = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "type"]),
        ]

    def __str__(self):
        return f"{self.label or self.type} — {self.line1}, {self.city}"


# ── LedgerAccount (spec §2.1 — no soft-delete) ────────────────────────────────
class LedgerAccountType(models.TextChoices):
    PLATFORM_CASH              = "platform_cash",              "Platform Cash"
    PLATFORM_REVENUE_COMMISSION= "platform_revenue_commission","Platform Revenue Commission"
    VENDOR_ESCROW              = "vendor_escrow",              "Vendor Escrow"
    VENDOR_PAYABLE             = "vendor_payable",             "Vendor Payable"
    CUSTOMER_WALLET            = "customer_wallet",            "Customer Wallet"
    GATEWAY_FEES               = "gateway_fees",               "Gateway Fees"
    COD_RECEIVABLE             = "cod_receivable",             "COD Receivable"
    REFUNDS_PAYABLE            = "refunds_payable",            "Refunds Payable"


class LedgerAccount(models.Model):
    """Double-entry ledger account. No soft-delete per spec."""
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account_key  = models.CharField(max_length=150, unique=True)  # e.g. "customer_wallet:{user_id}"
    account_type = models.CharField(max_length=40, choices=LedgerAccountType.choices)
    owner_user   = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_accounts")
    # owner_vendor FK wired in Sprint 3 migration once vendors app is installed
    owner_vendor_id = models.UUIDField(null=True, blank=True, db_index=True)
    currency     = models.CharField(max_length=3, default="USD")
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["account_key"]

    def __str__(self):
        return self.account_key


# ── LedgerEntry (no soft-delete, append-only, immutable) ────────────────────
class LedgerEntry(models.Model):
    """
    Immutable double-entry ledger row.
    amount is signed: DR positive / CR negative.
    Every economic event posts a balanced set (group sums to 0).
    """
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account          = models.ForeignKey(LedgerAccount, on_delete=models.PROTECT, related_name="entries")
    amount           = models.DecimalField(max_digits=14, decimal_places=2)
    entry_group_id   = models.UUIDField(db_index=True)   # groups balanced pair/set
    reference_type   = models.CharField(max_length=40)   # "order_capture","escrow_release","payout","refund","cod_settlement"
    reference_id     = models.UUIDField(null=True)        # polymorphic pointer
    memo             = models.CharField(max_length=255, null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entry_group_id"]),
            models.Index(fields=["account", "created_at"]),
            models.Index(fields=["reference_type", "reference_id"]),
        ]

    def __str__(self):
        return f"{self.account.account_key} {self.amount:+} [{self.reference_type}]"
