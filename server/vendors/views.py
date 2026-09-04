"""
vendors/views.py — Sprint 3: Vendors, KYC, Staff, Commission views.

Architecture:
  - ScopedToVendorMixin  : resolves the Vendor for the request user
  - VendorApplicationView: POST /vendors/apply/
  - VendorMeViewSet      : GET/PATCH /vendors/me/
  - VendorStorefrontView : GET /vendors/{slug}/storefront/  (public)
  - VendorStaffViewSet   : CRUD /vendors/me/staff/
  - VendorBankAccountViewSet: CRUD /vendors/me/bank-accounts/
  - VendorDocumentViewSet: list+create /vendors/me/documents/
  - VendorPolicyView     : GET/PUT /vendors/me/policy/
  - AdminVendorViewSet   : list+retrieve /admin/vendors/
  - AdminVendorStatusUpdateView: PATCH /admin/vendors/{id}/status/
  - AdminVendorDocumentReviewView: PATCH /admin/vendors/{vid}/documents/{id}/review/
  - AdminCommissionRuleViewSet: CRUD /admin/commission-rules/
"""
from django.shortcuts import get_object_or_404
from rest_framework import status, generics, mixins, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from drf_spectacular.utils import extend_schema

from core.permissions import IsVendorMember, IsVendorOwner, IsPlatformAdmin
from vendors.models import (
    Vendor, VendorStaff, VendorDocument, VendorBankAccount,
    VendorPolicy, CommissionRule,
)
from vendors.serializers import (
    VendorApplicationSerializer, VendorMeSerializer, VendorStorefrontSerializer,
    VendorStaffSerializer, VendorDocumentSerializer, VendorBankAccountSerializer,
    VendorPolicySerializer,
    AdminVendorSerializer, AdminVendorStatusSerializer,
    AdminVendorDocumentReviewSerializer, AdminCommissionRuleSerializer,
)


# ── ScopedToVendorMixin ───────────────────────────────────────────────────────

class ScopedToVendorMixin:
    """
    Resolves the Vendor for the authenticated requesting user.
    Works for both vendor_owner (via OneToOne) and vendor_staff (via membership table).
    Used by all /vendors/me/* views.
    """
    def get_vendor(self) -> Vendor:
        user = self.request.user
        if user.role == "vendor_owner":
            return get_object_or_404(Vendor, owner_user=user, is_deleted=False)
        # vendor_staff path
        staff = get_object_or_404(
            VendorStaff,
            user=user,
            is_active=True,
            is_deleted=False,
        )
        return staff.vendor


# ── VendorApplicationView ─────────────────────────────────────────────────────

@extend_schema(tags=["Vendors"])
class VendorApplicationView(generics.CreateAPIView):
    """
    POST /vendors/apply/ — authenticated user applies to become a vendor.
    Creates Vendor(status=pending) + promotes user role to vendor_owner.
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = VendorApplicationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vendor = serializer.save()
        return Response(
            {
                "detail": "Vendor application submitted. Await platform review.",
                "vendor_id": str(vendor.id),
                "slug": vendor.slug,
            },
            status=status.HTTP_201_CREATED,
        )


# ── VendorMeViewSet ───────────────────────────────────────────────────────────

@extend_schema(tags=["Vendors"])
class VendorMeViewSet(
    ScopedToVendorMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """GET/PATCH /vendors/me/ — vendor reads/updates own vendor profile."""
    permission_classes = [IsVendorMember]
    serializer_class   = VendorMeSerializer

    def get_object(self):
        return self.get_vendor()


# ── VendorStorefrontView ──────────────────────────────────────────────────────

@extend_schema(tags=["Vendors"])
class VendorStorefrontView(generics.RetrieveAPIView):
    """GET /vendors/{slug}/storefront/ — public vendor profile page."""
    permission_classes = [AllowAny]
    serializer_class   = VendorStorefrontSerializer
    lookup_field       = "slug"
    queryset           = Vendor.objects.filter(status="active", is_deleted=False)


# ── VendorStaffViewSet ────────────────────────────────────────────────────────

@extend_schema(tags=["Vendors"])
class VendorStaffViewSet(ScopedToVendorMixin, viewsets.ModelViewSet):
    """CRUD /vendors/me/staff/ — manage staff members of own vendor."""
    permission_classes = [IsVendorMember]
    serializer_class   = VendorStaffSerializer

    def get_queryset(self):
        return VendorStaff.objects.filter(
            vendor=self.get_vendor(),
            is_deleted=False,
        ).select_related("user")

    def perform_create(self, serializer):
        serializer.save(vendor=self.get_vendor())


# ── VendorBankAccountViewSet ──────────────────────────────────────────────────

@extend_schema(tags=["Vendors"])
class VendorBankAccountViewSet(ScopedToVendorMixin, viewsets.ModelViewSet):
    """CRUD /vendors/me/bank-accounts/ — vendor owner only."""
    permission_classes = [IsVendorOwner]
    serializer_class   = VendorBankAccountSerializer
    http_method_names  = ["get", "post", "delete", "head", "options"]  # no PUT/PATCH

    def get_queryset(self):
        return VendorBankAccount.objects.filter(
            vendor=self.get_vendor(),
            is_deleted=False,
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["vendor"] = self.get_vendor()
        return ctx

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])


# ── VendorDocumentViewSet ─────────────────────────────────────────────────────

@extend_schema(tags=["Vendors"])
class VendorDocumentViewSet(
    ScopedToVendorMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """GET/POST /vendors/me/documents/ — upload and list KYC documents."""
    permission_classes = [IsVendorMember]
    serializer_class   = VendorDocumentSerializer

    def get_queryset(self):
        return VendorDocument.objects.filter(
            vendor=self.get_vendor(),
            is_deleted=False,
        )

    def perform_create(self, serializer):
        serializer.save(vendor=self.get_vendor())


# ── VendorPolicyView ──────────────────────────────────────────────────────────

@extend_schema(tags=["Vendors"])
class VendorPolicyView(ScopedToVendorMixin, generics.RetrieveUpdateAPIView):
    """GET/PUT/PATCH /vendors/me/policy/ — retrieve or update vendor policies."""
    permission_classes = [IsVendorMember]
    serializer_class   = VendorPolicySerializer

    def get_object(self):
        vendor = self.get_vendor()
        policy, _ = VendorPolicy.objects.get_or_create(vendor=vendor)
        return policy


# ── AdminVendorViewSet ────────────────────────────────────────────────────────

@extend_schema(tags=["Admin Vendors"])
class AdminVendorViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """GET /admin/vendors/ — list/retrieve all vendors (platform admin only)."""
    permission_classes = [IsPlatformAdmin]
    serializer_class   = AdminVendorSerializer
    queryset           = Vendor.objects.all().select_related("owner_user").order_by("-created_at")
    filterset_fields   = ["status"]
    search_fields      = ["display_name", "legal_name", "owner_user__email"]
    ordering_fields    = ["created_at", "display_name", "status"]


# ── AdminVendorStatusUpdateView ───────────────────────────────────────────────

@extend_schema(tags=["Admin Vendors"], request=AdminVendorStatusSerializer, responses={200: AdminVendorSerializer})
class AdminVendorStatusUpdateView(APIView):
    """
    PATCH /admin/vendors/{id}/status/ — approve/suspend/reject a vendor.
    Writes AuditLog + enqueues Stripe Connect task on approval.
    """
    permission_classes = [IsPlatformAdmin]

    def patch(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        serializer = AdminVendorStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        old_status = vendor.status
        vendor.status = d["status"]
        if d["status"] == "rejected":
            vendor.rejection_reason = d.get("rejection_reason", "")
        else:
            vendor.rejection_reason = ""
        vendor.save(update_fields=["status", "rejection_reason", "updated_at"])

        # AuditLog
        from core.models import AuditLog
        AuditLog.objects.create(
            actor=request.user,
            action="vendor.status_update",
            target_model="Vendor",
            target_id=vendor.id,
            before={"status": old_status},
            after={"status": vendor.status, "rejection_reason": vendor.rejection_reason},
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        # Stub Celery task for Stripe Connect on approval
        if vendor.status == "active" and old_status != "active":
            try:
                from vendors.tasks import create_stripe_connect_account
                create_stripe_connect_account.delay(str(vendor.id))
            except Exception:
                pass  # task module not yet wired; safe to ignore in dev

        return Response(AdminVendorSerializer(vendor).data, status=status.HTTP_200_OK)


# ── AdminVendorDocumentReviewView ─────────────────────────────────────────────

@extend_schema(tags=["Admin Vendors"], request=AdminVendorDocumentReviewSerializer, responses={200: VendorDocumentSerializer})
class AdminVendorDocumentReviewView(APIView):
    """
    PATCH /admin/vendors/{vid}/documents/{id}/review/ — approve/reject a KYC document.
    """
    permission_classes = [IsPlatformAdmin]

    def patch(self, request, vid, pk):
        vendor   = get_object_or_404(Vendor, pk=vid)
        document = get_object_or_404(VendorDocument, pk=pk, vendor=vendor)

        serializer = AdminVendorDocumentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        document.status        = d["status"]
        document.reviewer_note = d.get("reviewer_note", "")
        document.save(update_fields=["status", "reviewer_note", "updated_at"])

        return Response(VendorDocumentSerializer(document).data, status=status.HTTP_200_OK)


# ── AdminCommissionRuleViewSet ────────────────────────────────────────────────

@extend_schema(tags=["Admin Commission"])
class AdminCommissionRuleViewSet(viewsets.ModelViewSet):
    """CRUD /admin/commission-rules/ — platform admin manages commission rates."""
    permission_classes = [IsPlatformAdmin]
    serializer_class   = AdminCommissionRuleSerializer
    queryset           = CommissionRule.objects.select_related("vendor").order_by("-effective_from")
    filterset_fields   = ["vendor", "is_active"]
