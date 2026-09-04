"""
accounts/urls/auth.py — Auth endpoints (Sprint 1).
Mounted at /api/v1/auth/ in config/api_router.py
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenVerifyView

from accounts.views import (
    RegisterView, VendorRegisterView, LoginView,
    TokenRefreshView, LogoutView,
    OTPRequestView, OTPVerifyView, OTPResendView,
    PasswordForgotView, PasswordResetView, PasswordChangeView,
    TwoFactorEnableView, TwoFactorVerifyView,
)

urlpatterns = [
    # ── Registration ──────────────────────────────────────────────────────────
    path("register/",         RegisterView.as_view(),       name="auth-register"),
    path("register/vendor/",  VendorRegisterView.as_view(), name="auth-register-vendor"),

    # ── Login / Token ─────────────────────────────────────────────────────────
    path("login/",            LoginView.as_view(),          name="auth-login"),
    path("token/refresh/",    TokenRefreshView.as_view(),   name="auth-token-refresh"),
    path("token/verify/",     TokenVerifyView.as_view(),    name="auth-token-verify"),
    path("logout/",           LogoutView.as_view(),         name="auth-logout"),

    # ── OTP ───────────────────────────────────────────────────────────────────
    path("otp/request/",      OTPRequestView.as_view(),     name="auth-otp-request"),
    path("verify-otp/",       OTPVerifyView.as_view(),      name="auth-verify-otp"),
    path("resend-otp/",       OTPResendView.as_view(),      name="auth-resend-otp"),

    # ── Password ──────────────────────────────────────────────────────────────
    path("password/forgot/",  PasswordForgotView.as_view(), name="auth-password-forgot"),
    path("password/reset/",   PasswordResetView.as_view(),  name="auth-password-reset"),
    path("password/change/",  PasswordChangeView.as_view(), name="auth-password-change"),

    # ── 2FA ───────────────────────────────────────────────────────────────────
    path("2fa/enable/",       TwoFactorEnableView.as_view(),  name="auth-2fa-enable"),
    path("2fa/verify/",       TwoFactorVerifyView.as_view(),  name="auth-2fa-verify"),
]
