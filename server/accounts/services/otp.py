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


def _send_email(email: str, code: str, purpose: str):
    subject_map = {
        OTPPurpose.REGISTER:       "Verify your LuxeLane account",
        OTPPurpose.LOGIN:          "Your LuxeLane login code",
        OTPPurpose.RESET_PASSWORD: "Reset your LuxeLane password",
        OTPPurpose.CHANGE_PHONE:   "Confirm your new phone number",
    }
    send_mail(
        subject=subject_map.get(purpose, "Your LuxeLane verification code"),
        message=f"Your verification code is: {code}\n\nThis code expires in 10 minutes.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )


def _send_sms(phone: str, code: str, purpose: str):
    """
    SMS stub — prints to console in dev.
    Replace with Twilio / SNS integration in production.
    """
    print(f"[SMS STUB] → {phone}: Your LuxeLane code: {code} (purpose: {purpose})")
