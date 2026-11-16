"""
accounts/services/otp.py — OTP generation, verification, and delivery.

Design:
  - Code is 6 digits, hashed with hashlib.sha256 (fast for short-lived codes).
  - TTL: 10 minutes for register/login/reset; 5 minutes for change_phone.
  - Rate limit: 5 attempts → locked; resend enforces 60s cooldown.
  - Delivery: email via Django email backend (SMS stub via console in dev).
"""
import hashlib
import random
import string
from datetime import timedelta

from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings

from accounts.models import OTPVerification, OTPPurpose


# ── Constants ─────────────────────────────────────────────────────────────────
OTP_LENGTH = 6
OTP_TTL = {
    OTPPurpose.REGISTER:       timedelta(minutes=10),
    OTPPurpose.LOGIN:          timedelta(minutes=10),
    OTPPurpose.RESET_PASSWORD: timedelta(minutes=10),
    OTPPurpose.CHANGE_PHONE:   timedelta(minutes=5),
}
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_ATTEMPTS = 5


# ── Helpers ───────────────────────────────────────────────────────────────────
def _generate_code() -> str:
    return "".join(random.choices(string.digits, k=OTP_LENGTH))


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _is_email(destination: str) -> bool:
    return "@" in destination


# ── Public API ────────────────────────────────────────────────────────────────
def generate_and_send(destination: str, purpose: str, user=None) -> OTPVerification:
    """
    Create a new OTPVerification row and send the code.
    Invalidates any previous unconsumed OTPs for the same (destination, purpose).
    """
    # Invalidate old ones (soft: just mark expired)
    OTPVerification.objects.filter(
        destination=destination,
        purpose=purpose,
        consumed_at__isnull=True,
    ).update(expires_at=timezone.now())

    code = _generate_code()
    ttl = OTP_TTL.get(purpose, timedelta(minutes=10))

    otp = OTPVerification.objects.create(
        user=user,
        destination=destination,
        code_hash=_hash_code(code),
        purpose=purpose,
        expires_at=timezone.now() + ttl,
    )

    _deliver(destination, code, purpose)
    return otp


def verify(destination: str, code: str, purpose: str) -> tuple[bool, str]:
    """
    Verify an OTP code.
    Returns (success: bool, error_code: str).
    On success, marks consumed_at.
    """
    try:
        otp = OTPVerification.objects.filter(
            destination=destination,
            purpose=purpose,
            consumed_at__isnull=True,
            is_deleted=False,
        ).latest("created_at")
    except OTPVerification.DoesNotExist:
        return False, "OTP_NOT_FOUND"

    if otp.is_expired:
        return False, "OTP_EXPIRED"

    if otp.is_locked:
        return False, "OTP_LOCKED"

    if otp.code_hash != _hash_code(code):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        remaining = MAX_ATTEMPTS - otp.attempts
        return False, f"OTP_INVALID (attempts left: {remaining})"

    # ── Success ──
    otp.consumed_at = timezone.now()
    otp.save(update_fields=["consumed_at"])
    return True, ""


def can_resend(destination: str, purpose: str) -> tuple[bool, int]:
    """
    Returns (can_resend: bool, seconds_to_wait: int).
    Enforces 60-second cooldown between sends.
    """
    try:
        latest = OTPVerification.objects.filter(
            destination=destination,
            purpose=purpose,
        ).latest("created_at")
        elapsed = timezone.now() - latest.created_at
        if elapsed < RESEND_COOLDOWN:
            wait = int((RESEND_COOLDOWN - elapsed).total_seconds())
            return False, wait
    except OTPVerification.DoesNotExist:
        pass
    return True, 0


# ── Delivery ──────────────────────────────────────────────────────────────────
def _deliver(destination: str, code: str, purpose: str):
    """Send the OTP. Email via Django mail backend; SMS via stub."""
    if _is_email(destination):
        _send_email(destination, code, purpose)
    else:
        _send_sms(destination, code, purpose)


def _build_otp_html(code: str, purpose: str) -> str:
    """Renders a responsive, luxury-grade HTML email template for LuxeLane."""
    purpose_content = {
        OTPPurpose.REGISTER: {
            "title": "Welcome to LuxeLane",
            "subtitle": "Account Activation & Verification",
            "body": "Thank you for creating an account with LuxeLane. To complete your registration and secure your profile, please enter the one-time activation code below.",
            "button_text": "Verify Account",
        },
        OTPPurpose.LOGIN: {
            "title": "Authentication Code",
            "subtitle": "Secure Member Access",
            "body": "A sign-in request was initiated for your LuxeLane account. Please enter the security code below to authorize your session.",
            "button_text": "Sign In",
        },
        OTPPurpose.RESET_PASSWORD: {
            "title": "Password Reset",
            "subtitle": "Security Verification",
            "body": "We received a request to reset your LuxeLane account password. Please use the verification code below to establish a new password.",
            "button_text": "Reset Password",
        },
        OTPPurpose.CHANGE_PHONE: {
            "title": "Update Phone Number",
            "subtitle": "Contact Information Verification",
            "body": "We received a request to update the phone number on your LuxeLane account. Please confirm your new number using the code below.",
            "button_text": "Confirm Phone",
        },
    }

    content = purpose_content.get(
        purpose,
        {
            "title": "Verification Code",
            "subtitle": "One-Time Authentication",
            "body": "Please use the one-time security code below to complete your verification with LuxeLane.",
            "button_text": "Verify",
        },
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{content['title']} - LuxeLane</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      -webkit-font-smoothing: antialiased;
    }}
    .email-container {{
      max-width: 580px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
      border: 1px solid #e5e7eb;
    }}
    .header-bar {{
      background: #0f172a;
      padding: 36px 24px 28px;
      text-align: center;
      position: relative;
    }}
    .gold-accent {{
      height: 3px;
      background: linear-gradient(90deg, #d4af37 0%, #f59e0b 50%, #d4af37 100%);
      width: 100%;
    }}
    .brand-title {{
      font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 6px;
      color: #ffffff;
      margin: 0;
      text-transform: uppercase;
    }}
    .brand-tagline {{
      font-size: 11px;
      letter-spacing: 2.5px;
      color: #94a3b8;
      text-transform: uppercase;
      margin: 8px 0 0;
      font-weight: 500;
    }}
    .content-body {{
      padding: 40px 36px 36px;
      text-align: center;
    }}
    .heading-title {{
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 8px;
    }}
    .heading-subtitle {{
      font-size: 12px;
      font-weight: 700;
      color: #d97706;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin: 0 0 20px;
    }}
    .body-paragraph {{
      font-size: 15px;
      line-height: 1.6;
      color: #4b5563;
      margin: 0 0 28px;
    }}
    .otp-box {{
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 16px;
      padding: 24px 20px;
      margin: 24px 0 28px;
      display: inline-block;
      width: 85%;
      box-sizing: border-box;
    }}
    .otp-label {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 8px;
    }}
    .otp-digits {{
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 42px;
      font-weight: 800;
      letter-spacing: 14px;
      color: #0f172a;
      padding-left: 14px;
      margin: 6px 0;
    }}
    .otp-badge {{
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 14px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 8px;
    }}
    .security-notice {{
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      font-size: 13px;
      color: #6b7280;
      line-height: 1.5;
      text-align: left;
      margin-top: 10px;
    }}
    .footer-bar {{
      background: #f8fafc;
      padding: 28px 24px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.6;
    }}
    .footer-link {{
      color: #0f172a;
      text-decoration: none;
      font-weight: 600;
    }}
  </style>
</head>
<body>
  <div style="padding: 20px 10px;">
    <div class="email-container">
      <!-- Header -->
      <div class="header-bar">
        <h1 class="brand-title">LuxeLane</h1>
        <p class="brand-tagline">Curated Luxury & Bespoke Goods</p>
      </div>
      <div class="gold-accent"></div>

      <!-- Main Content -->
      <div class="content-body">
        <h2 class="heading-title">{content['title']}</h2>
        <div class="heading-subtitle">{content['subtitle']}</div>
        <p class="body-paragraph">{content['body']}</p>

        <!-- OTP Code Card -->
        <div class="otp-box">
          <div class="otp-label">Your Verification Code</div>
          <div class="otp-digits">{code}</div>
          <span class="otp-badge">Expires in 10 minutes</span>
        </div>

        <!-- Security Warning -->
        <div class="security-notice">
          <strong style="color: #111827;">Security Advisory:</strong> This code is strictly confidential. LuxeLane personnel will never request your verification code or password via phone, email, or messaging. If you did not request this, please disregard this notification.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer-bar">
        <p style="margin: 0 0 6px;">
          Questions? Contact our Concierge at <a href="mailto:concierge@luxelane.com" class="footer-link">concierge@luxelane.com</a>
        </p>
        <p style="margin: 0; font-size: 11px;">
          © 2026 LuxeLane Maison & Co. All rights reserved. • Confidential
        </p>
      </div>
    </div>
  </div>
</body>
</html>
"""


def _send_email(email: str, code: str, purpose: str):
    subject_map = {
        OTPPurpose.REGISTER:       "LuxeLane - Verify Your Account",
        OTPPurpose.LOGIN:          "LuxeLane - Your Login Passcode",
        OTPPurpose.RESET_PASSWORD: "LuxeLane - Reset Your Password",
        OTPPurpose.CHANGE_PHONE:   "LuxeLane - Confirm Phone Update",
    }
    subject = subject_map.get(purpose, "LuxeLane - Your Verification Code")

    plain_text = f"""LUXELANE
Curated Luxury & Bespoke Goods
=========================================

YOUR VERIFICATION CODE: {code}

This code is valid for 10 minutes.

Security Advisory:
Never share this code with anyone. LuxeLane representatives will never ask for your verification code.

If you did not request this code, no action is required.
Concierge Support: concierge@luxelane.com
© 2026 LuxeLane Maison & Co. All rights reserved.
"""

    html_message = _build_otp_html(code, purpose)

    send_mail(
        subject=subject,
        message=plain_text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        html_message=html_message,
        fail_silently=False,
    )


def _send_sms(phone: str, code: str, purpose: str):
    """
    SMS stub — prints to console in dev.
    Replace with Twilio / SNS integration in production.
    """
    print(f"[SMS STUB] → {phone}: Your LuxeLane code: {code} (purpose: {purpose})")
