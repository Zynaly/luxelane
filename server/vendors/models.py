"""
vendors/models.py — Sprint 3: Vendors, KYC, Staff, Commission.

Models:
  Vendor, VendorStaff, VendorDocument, VendorBankAccount,
  VendorPolicy, CommissionRule
"""
from django.db import models
from core.models import BaseModel


# ── Status / choice enums ─────────────────────────────────────────────────────

class VendorStatus(models.TextChoices):
    PENDING   = "pending",   "Pending Review"
    ACTIVE    = "active",    "Active"
    SUSPENDED = "suspended", "Suspended"
    REJECTED  = "rejected",  "Rejected"


class StaffRole(models.TextChoices):
    MANAGER     = "manager",     "Manager"
    SUPPORT     = "support",     "Support"
    FULFILLMENT = "fulfillment", "Fulfillment"


class DocType(models.TextChoices):
    BUSINESS_REGISTRATION = "business_registration", "Business Registration"
    TAX_CERTIFICATE       = "tax_certificate",       "Tax Certificate"
    ID_PROOF              = "id_proof",              "ID Proof"
    BANK_STATEMENT        = "bank_statement",        "Bank Statement"


class DocStatus(models.TextChoices):
    PENDING  = "pending",  "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class AccountType(models.TextChoices):
    CHECKING = "checking", "Checking"
    SAVINGS  = "savings",  "Savings"


# ── Vendor ────────────────────────────────────────────────────────────────────

class Vendor(BaseModel):
    """
    A merchant selling on the LuxeLane platform.
    Created atomically with the vendor_owner User during registration
    (VendorRegisterSerializer) or via VendorApplicationView post-signup.
    Status follows a simple FSM: pending → active / rejected; active → suspended.
    """
    owner_user    = models.OneToOneField(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="vendor",
        db_index=True,
    )
    legal_name    = models.CharField(max_length=255)
    display_name  = models.CharField(max_length=255)
    slug          = models.SlugField(max_length=255, unique=True, db_index=True)
    status        = models.CharField(
        max_length=20,
        choices=VendorStatus.choices,
        default=VendorStatus.PENDING,
        db_index=True,
    )
    description       = models.TextField(blank=True)
    tax_id            = models.CharField(max_length=50, blank=True)
    support_email     = models.EmailField(blank=True)
    support_phone     = models.CharField(max_length=30, blank=True)
    logo_url          = models.URLField(blank=True)
    banner_url        = models.URLField(blank=True)
    rejection_reason  = models.TextField(blank=True)
    # Denormalised rating (updated by Celery task in Sprint 14)
    rating_avg        = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    total_ratings     = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["slug"]),
        ]

    def __str__(self):
        return f"{self.display_name} ({self.status})"


# ── VendorStaff ───────────────────────────────────────────────────────────────

class VendorStaff(BaseModel):
    """
    A user granted access to a vendor's portal with a specific role.
    One staff row per (vendor, user) pair.
    """
    vendor     = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name="staff_members")
    user       = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="vendor_staff_roles",
    )
    staff_role = models.CharField(max_length=20, choices=StaffRole.choices, default=StaffRole.SUPPORT)
    is_active  = models.BooleanField(default=True)

    class Meta:
        unique_together = [("vendor", "user")]
        ordering = ["staff_role", "created_at"]

    def __str__(self):
        return f"{self.user} @ {self.vendor} ({self.staff_role})"


# ── VendorDocument ────────────────────────────────────────────────────────────

class VendorDocument(BaseModel):
    """
    KYC / compliance documents uploaded by the vendor owner.
    Reviewed by platform admins via AdminVendorDocumentReviewView.
    """
    vendor        = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name="documents")
    doc_type      = models.CharField(max_length=30, choices=DocType.choices)
    file_url      = models.URLField()
    status        = models.CharField(max_length=20, choices=DocStatus.choices, default=DocStatus.PENDING)
    reviewer_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.doc_type} for {self.vendor} ({self.status})"


# ── VendorBankAccount ─────────────────────────────────────────────────────────

class VendorBankAccount(BaseModel):
    """
    Payout bank account linked to a vendor.
    account_number is stored in plaintext in dev; production uses
    field-level encryption (e.g. django-cryptography) per ADR-01.
    The serializer masks it to '**** XXXX' on read.
    """
    vendor           = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name="bank_accounts")
    account_holder   = models.CharField(max_length=255)
    bank_name        = models.CharField(max_length=255)
    account_number   = models.CharField(max_length=30)   # stored; masked on serialization
    routing_number   = models.CharField(max_length=20, blank=True)
    account_type     = models.CharField(max_length=10, choices=AccountType.choices, default=AccountType.CHECKING)
    is_primary       = models.BooleanField(default=False)
    stripe_account_id = models.CharField(max_length=100, blank=True)  # populated post-approval

    class Meta:
        ordering = ["-is_primary", "-created_at"]

    def __str__(self):
        return f"{self.bank_name} ****{self.account_number[-4:]} (vendor={self.vendor_id})"


# ── VendorPolicy ──────────────────────────────────────────────────────────────

class VendorPolicy(BaseModel):
    """
    Per-vendor policies that govern returns, shipping, cancellation.
    OneToOne with Vendor; auto-created when a Vendor is created.
    """
    vendor                    = models.OneToOneField(Vendor, on_delete=models.CASCADE, related_name="policy")
    return_window_days        = models.PositiveSmallIntegerField(default=30)
    return_policy_text        = models.TextField(blank=True)
    shipping_policy_text      = models.TextField(blank=True)
    cancellation_policy_text  = models.TextField(blank=True)

    class Meta:
        verbose_name_plural = "Vendor policies"

    def __str__(self):
        return f"Policy for {self.vendor}"


# ── CommissionRule ────────────────────────────────────────────────────────────

class CommissionRule(BaseModel):
    """
    Platform commission rate applied to vendor sales.
    vendor=None → platform default rule.
    Lookup order: vendor-specific → platform default.
    """
    vendor         = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name="commission_rules",
        null=True,
        blank=True,
        help_text="Null = platform-wide default rule.",
    )
    rate_pct       = models.DecimalField(max_digits=5, decimal_places=2, help_text="Commission percentage, e.g. 15.00")
    effective_from = models.DateField()
    effective_to   = models.DateField(null=True, blank=True)
    is_active      = models.BooleanField(default=True, db_index=True)
    note           = models.TextField(blank=True)

    class Meta:
        ordering = ["-effective_from"]

    def __str__(self):
        vendor_label = self.vendor.display_name if self.vendor_id else "Platform Default"
        return f"{vendor_label}: {self.rate_pct}% from {self.effective_from}"
