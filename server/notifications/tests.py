from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from accounts.models import User, RoleEnum
from notifications.models import (
    Notification, NotificationTemplate, NotificationPreference,
    NotificationChannel, NotificationStatus, NotificationCategory,
)
from notifications.services import send_notification


class NotificationsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="notifuser@example.com",
            phone="+12025550301",
            password="StrongPassword123!",
            role=RoleEnum.CUSTOMER,
            is_verified=True,
        )
        self.other_user = User.objects.create_user(
            email="otheruser@example.com",
            phone="+12025550302",
            password="StrongPassword123!",
            role=RoleEnum.CUSTOMER,
            is_verified=True,
        )

        # Create template
        self.template = NotificationTemplate.objects.create(
            code="order_confirmed",
            channel=NotificationChannel.IN_APP,
            subject="Order #{order_id} Confirmed",
            body_template="Thank you! Your order #{order_id} has been confirmed.",
        )

    def test_list_notifications_owner_only(self):
        # Create notification for self and other
        notif1 = Notification.objects.create(
            user=self.user,
            channel=NotificationChannel.IN_APP,
            template_code="order_confirmed",
            payload={"order_id": "ORD-123"},
            status=NotificationStatus.SENT,
        )
        Notification.objects.create(
            user=self.other_user,
            channel=NotificationChannel.IN_APP,
            template_code="order_confirmed",
            payload={"order_id": "ORD-999"},
            status=NotificationStatus.SENT,
        )

        self.client.force_authenticate(user=self.user)
        url = reverse("notification-list")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only see own notification
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(str(results[0]["id"]), str(notif1.id))

    def test_mark_notification_read(self):
        notif = Notification.objects.create(
            user=self.user,
            channel=NotificationChannel.IN_APP,
            template_code="order_confirmed",
            payload={"order_id": "ORD-123"},
            status=NotificationStatus.SENT,
        )

        self.client.force_authenticate(user=self.user)
        url = reverse("notification-mark-read", kwargs={"pk": notif.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        notif.refresh_from_db()
        self.assertEqual(notif.status, NotificationStatus.READ)
        self.assertIsNotNone(notif.read_at)

    def test_notification_preferences_get_and_post(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("notification-preference-list")

        # Create preference
        data = {
            "channel": NotificationChannel.EMAIL,
            "category": NotificationCategory.MARKETING,
            "is_enabled": False,
        }
        res = self.client.post(url, data, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data["is_enabled"])

        # Service dispatch should respect opt-out
        notif = send_notification(
            user=self.user,
            template_code="marketing_sale",
            channel=NotificationChannel.EMAIL,
            payload={"promo": "50OFF"},
            category=NotificationCategory.MARKETING,
        )
        self.assertEqual(notif.status, NotificationStatus.FAILED)
