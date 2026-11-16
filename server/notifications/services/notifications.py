"""
notifications/services/notifications.py — Notification creation, dispatching, and preferences.
"""
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings

from notifications.models import (
    Notification, NotificationTemplate, NotificationPreference,
    NotificationChannel, NotificationStatus, NotificationCategory,
)


def can_send_notification(user, channel: str, category: str = NotificationCategory.TRANSACTIONAL) -> bool:
    """Check whether user has not opted out of this channel/category."""
    pref = NotificationPreference.objects.filter(
        user=user,
        channel=channel,
        category=category,
    ).first()
    if pref:
        return pref.is_enabled
    # Defaults: Transactional is True by default, Marketing is True unless opted out
    return True


def send_notification(
    user,
    template_code: str,
    channel: str,
    payload: dict = None,
    category: str = NotificationCategory.TRANSACTIONAL,
) -> Notification:
    """
    Queue and deliver a notification according to user preferences and channel.
    """
    payload = payload or {}

    # Check preferences
    if not can_send_notification(user, channel, category):
        return Notification.objects.create(
            user=user,
            channel=channel,
            template_code=template_code,
            payload=payload,
            status=NotificationStatus.FAILED,
        )

    # Fetch template if exists
    template = NotificationTemplate.objects.filter(code=template_code, channel=channel).first()
    subject = template.subject if template else f"Notification: {template_code}"
    body = template.body_template if template else str(payload)

    # Simple variable replacement if variables provided
    if template and payload:
        for k, v in payload.items():
            body = body.replace(f"{{{k}}}", str(v))
            if subject:
                subject = subject.replace(f"{{{k}}}", str(v))

    notification = Notification.objects.create(
        user=user,
        channel=channel,
        template_code=template_code,
        payload={**payload, "subject": subject, "body": body},
        status=NotificationStatus.SENT,
        sent_at=timezone.now(),
    )

    # Dispatch by channel
    if channel == NotificationChannel.EMAIL and user.email:
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            pass

    elif channel == NotificationChannel.SMS and user.phone:
        print(f"[SMS NOTIFICATION] → {user.phone}: {body}")

    elif channel == NotificationChannel.IN_APP:
        pass  # Delivered via database query for inbox

    return notification


def mark_read(notification_id, user) -> bool:
    """Mark a user notification as read."""
    updated = Notification.objects.filter(
        id=notification_id,
        user=user,
        read_at__isnull=True,
    ).update(
        read_at=timezone.now(),
        status=NotificationStatus.READ,
    )
    return bool(updated)
