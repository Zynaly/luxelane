"""
accounts/views.py — Sprint 1: Identity & RBAC views.
All business logic lives in accounts/services/; views only validate → call → serialize.
"""
from django.utils import timezone
from rest_framework import status, generics, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenRefreshView as _BaseTokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from drf_spectacular.utils import extend_schema, inline_serializer

from core.permissions import IsPlatformAdmin
from accounts.models import User, OTPPurpose
from accounts.serializers import (
    UserRegisterSerializer, VendorRegisterSerializer, LoginSerializer,
    OTPRequestSerializer, OTPVerifySerializer, OTPResendSerializer,
    PasswordForgotSerializer, PasswordResetSerializer, PasswordChangeSerializer,
    TwoFactorVerifySerializer, UserMeSerializer,
    AdminUserSerializer, AdminUserStatusUpdateSerializer,
)
from accounts.services import otp as otp_service


# ── Auth throttles ────────────────────────────────────────────────────────────
class AuthRateThrottle(AnonRateThrottle):
    scope = "auth"   # 5/min in settings


# ── Register ──────────────────────────────────────────────────────────────────
@extend_schema(tags=["Auth"])
class RegisterView(generics.CreateAPIView):
    """POST /auth/register/ — customer registration."""
    permission_classes  = [AllowAny]
    authentication_classes = []
    throttle_classes    = [AuthRateThrottle]
    serializer_class    = UserRegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Send verification OTP
        destination = user.email or user.phone
        otp_service.generate_and_send(destination, OTPPurpose.REGISTER, user=user)

        return Response(
            {"detail": "Account created. Please verify your email/phone with the OTP sent."},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Auth"])
class VendorRegisterView(generics.CreateAPIView):
    """POST /auth/register/vendor/ — vendor + owner user registration."""
    permission_classes  = [AllowAny]
    authentication_classes = []
    throttle_classes    = [AuthRateThrottle]
    serializer_class    = VendorRegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        destination = user.email or user.phone
        otp_service.generate_and_send(destination, OTPPurpose.REGISTER, user=user)

        return Response(
            {"detail": "Vendor account created. Verify your email/phone and await platform approval."},
            status=status.HTTP_201_CREATED,
        )


# ── Login ─────────────────────────────────────────────────────────────────────
@extend_schema(
    tags=["Auth"],
    request=LoginSerializer,
    responses={
        200: inline_serializer(
            "LoginResponse",
            fields={
                "access": serializers.CharField(),
                "refresh": serializers.CharField(),
                "user": UserMeSerializer(),
            },
        )
    },
)
class LoginView(APIView):
    """POST /auth/login/ — email_or_phone + password → JWT pair."""
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [AuthRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


# ── Token ─────────────────────────────────────────────────────────────────────
@extend_schema(tags=["Auth"])
class TokenRefreshView(_BaseTokenRefreshView):
    """POST /auth/token/refresh/ — rotate refresh token (blacklist old)."""
    permission_classes     = [AllowAny]
    authentication_classes = []


@extend_schema(
    tags=["Auth"],
    request=inline_serializer("LogoutRequest", fields={"refresh": serializers.CharField()}),
    responses={205: inline_serializer("LogoutResponse", fields={"detail": serializers.CharField()})},
)
class LogoutView(APIView):
    """POST /auth/logout/ — blacklist the refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response({"detail": "refresh token required."}, status=status.HTTP_400_BAD_REQUEST)
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"detail": "Logged out."}, status=status.HTTP_205_RESET_CONTENT)
        except TokenError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ── OTP ───────────────────────────────────────────────────────────────────────
@extend_schema(
    tags=["Auth"],
    request=OTPRequestSerializer,
    responses={200: inline_serializer("OTPRequestResponse", fields={"detail": serializers.CharField()})},
)
class OTPRequestView(APIView):
    """POST /auth/otp/request/ — generate & send OTP."""
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [AuthRateThrottle]

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        otp_service.generate_and_send(d["destination"], d["purpose"])
        return Response({"detail": "OTP sent."}, status=status.HTTP_200_OK)


@extend_schema(
    tags=["Auth"],
    request=OTPVerifySerializer,
    responses={200: inline_serializer("OTPVerifyResponse", fields={"detail": serializers.CharField()})},
)
class OTPVerifyView(APIView):
    """POST /auth/verify-otp/ — verify an OTP code."""
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [AuthRateThrottle]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        success, error = otp_service.verify(d["destination"], d["code"], d["purpose"])

        if not success:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)

        # If registration OTP, activate the user
        if d["purpose"] == OTPPurpose.REGISTER:
            try:
                user = User.objects.get(email=d["destination"]) if "@" in d["destination"] \
                    else User.objects.get(phone=d["destination"])
                user.is_verified = True
                user.save(update_fields=["is_verified"])
            except User.DoesNotExist:
                pass

        return Response({"detail": "OTP verified."}, status=status.HTTP_200_OK)


@extend_schema(
    tags=["Auth"],
    request=OTPResendSerializer,
    responses={200: inline_serializer("OTPResendResponse", fields={"detail": serializers.CharField()})},
)
class OTPResendView(APIView):
    """POST /auth/resend-otp/ — resend OTP (60s cooldown enforced)."""
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [AuthRateThrottle]

    def post(self, request):
        serializer = OTPResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        can, wait = otp_service.can_resend(d["destination"], d["purpose"])
        if not can:
            return Response(
                {"detail": f"Please wait {wait} seconds before requesting a new OTP."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        otp_service.generate_and_send(d["destination"], d["purpose"])
        return Response({"detail": "OTP resent."}, status=status.HTTP_200_OK)


# ── Password ──────────────────────────────────────────────────────────────────
@extend_schema(
    tags=["Auth"],
    request=PasswordForgotSerializer,
    responses={200: inline_serializer("PasswordForgotResponse", fields={"detail": serializers.CharField()})},
)
class PasswordForgotView(APIView):
    """POST /auth/password/forgot/ — send password-reset OTP."""
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [AuthRateThrottle]

    def post(self, request):
        serializer = PasswordForgotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        destination = serializer.validated_data["email_or_phone"].strip()

        # Always return 200 to avoid user enumeration
        otp_service.generate_and_send(destination, OTPPurpose.RESET_PASSWORD)
        return Response({"detail": "If an account exists, a reset code was sent."}, status=status.HTTP_200_OK)


@extend_schema(
    tags=["Auth"],
    request=PasswordResetSerializer,
    responses={200: inline_serializer("PasswordResetResponse", fields={"detail": serializers.CharField()})},
)
class PasswordResetView(APIView):
    """POST /auth/password/reset/ — verify OTP then set new password."""
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [AuthRateThrottle]

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        success, error = otp_service.verify(d["destination"], d["code"], OTPPurpose.RESET_PASSWORD)
        if not success:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=d["destination"]) if "@" in d["destination"] \
                else User.objects.get(phone=d["destination"])
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        user.set_password(d["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Password reset successful."}, status=status.HTTP_200_OK)


@extend_schema(
    tags=["Auth"],
    request=PasswordChangeSerializer,
    responses={200: inline_serializer("PasswordChangeResponse", fields={"detail": serializers.CharField()})},
)
class PasswordChangeView(APIView):
    """POST /auth/password/change/ — change password while authenticated."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password changed."}, status=status.HTTP_200_OK)


# ── 2FA ───────────────────────────────────────────────────────────────────────
@extend_schema(
    tags=["Auth"],
    request=None,
    responses={200: inline_serializer("TwoFactorEnableResponse", fields={"detail": serializers.CharField()})},
)
class TwoFactorEnableView(APIView):
    """POST /auth/2fa/enable/ — send OTP to confirm 2FA activation."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        destination = user.email or user.phone
        otp_service.generate_and_send(destination, OTPPurpose.LOGIN, user=user)
        return Response({"detail": "Verification code sent to confirm 2FA enable."}, status=status.HTTP_200_OK)


@extend_schema(
    tags=["Auth"],
    request=TwoFactorVerifySerializer,
    responses={200: inline_serializer("TwoFactorVerifyResponse", fields={"detail": serializers.CharField()})},
)
class TwoFactorVerifyView(APIView):
    """POST /auth/2fa/verify/ — confirm OTP and enable 2FA."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        destination = user.email or user.phone

        success, error = otp_service.verify(destination, serializer.validated_data["code"], OTPPurpose.LOGIN)
        if not success:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)

        user.two_factor_enabled = True
        user.save(update_fields=["two_factor_enabled"])
        return Response({"detail": "Two-factor authentication enabled."}, status=status.HTTP_200_OK)


# ── User profile ──────────────────────────────────────────────────────────────
@extend_schema(tags=["Users"])
class UserMeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /users/me/ — own profile."""
    permission_classes = [IsAuthenticated]
    serializer_class   = UserMeSerializer

    def get_object(self):
        return self.request.user


# ── Admin: Users ──────────────────────────────────────────────────────────────
@extend_schema(tags=["Admin Users"])
class AdminUserListView(generics.ListAPIView):
    """GET /admin/users/ — list all users (platform admin only)."""
    permission_classes = [IsPlatformAdmin]
    serializer_class   = AdminUserSerializer
    filterset_fields   = ["role", "is_active", "is_verified"]
    search_fields      = ["email", "phone", "first_name", "last_name"]
    ordering_fields    = ["created_at", "last_login_at"]

    def get_queryset(self):
        return User.objects.all().order_by("-created_at")


@extend_schema(tags=["Admin Users"])
class AdminUserDetailView(generics.RetrieveAPIView):
    """GET /admin/users/{id}/ — retrieve single user (platform admin only)."""
    permission_classes = [IsPlatformAdmin]
    serializer_class   = AdminUserSerializer
    queryset           = User.objects.all()


@extend_schema(
    tags=["Admin Users"],
    request=AdminUserStatusUpdateSerializer,
    responses={200: AdminUserSerializer},
)
class AdminUserStatusUpdateView(APIView):
    """PATCH /admin/users/{id}/status/ — suspend or reactivate a user."""
    permission_classes = [IsPlatformAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminUserStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        old_status = user.is_active
        user.is_active = d["is_active"]
        user.save(update_fields=["is_active"])

        # Write AuditLog
        from core.models import AuditLog
        AuditLog.objects.create(
            actor=request.user,
            action="user.status_update",
            target_model="User",
            target_id=user.id,
            before={"is_active": old_status},
            after={"is_active": user.is_active, "reason": d.get("reason", "")},
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        return Response(AdminUserSerializer(user).data, status=status.HTTP_200_OK)
