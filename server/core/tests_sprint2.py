from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from accounts.models import User, RoleEnum, Address, AddressType
from core.models import AuditLog


class Sprint2CoreAndAddressTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="s2user@example.com",
            phone="+12025550401",
            password="StrongPass123!",
            role=RoleEnum.CUSTOMER,
            is_verified=True,
        )
        self.other_user = User.objects.create_user(
            email="other_s2@example.com",
            phone="+12025550402",
            password="StrongPass123!",
            role=RoleEnum.CUSTOMER,
            is_verified=True,
        )
        self.admin_user = User.objects.create_superuser(
            email="admin_s2@example.com",
            password="StrongPass123!",
        )

    def test_address_crud_and_owner_scoping(self):
        self.client.force_authenticate(user=self.user)
        list_url = reverse("user-address-list")

        # 1. Create address
        payload = {
            "label": "Home",
            "line1": "350 5th Ave",
            "city": "New York",
            "state": "NY",
            "country": "US",
            "postal_code": "10118",
            "type": "both",
            "is_default": True,
            "contact_phone": "+12025550401",
        }
        res = self.client.post(list_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        addr_id = res.data["id"]
        # Coordinates should have been automatically geocoded
        self.assertIsNotNone(res.data["latitude"])
        self.assertIsNotNone(res.data["longitude"])

        # 2. Other user cannot access this address
        self.client.force_authenticate(user=self.other_user)
        detail_url = reverse("user-address-detail", kwargs={"pk": addr_id})
        other_get = self.client.get(detail_url)
        self.assertEqual(other_get.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Owner can update
        self.client.force_authenticate(user=self.user)
        patch_res = self.client.patch(detail_url, {"label": "Penthouse"}, format="json")
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["label"], "Penthouse")

        # 4. Soft delete
        del_res = self.client.delete(detail_url)
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        # Should no longer appear in get
        get_res = self.client.get(detail_url)
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)
        # Still in DB with is_deleted=True
        addr = Address.objects.get(id=addr_id)
        self.assertTrue(addr.is_deleted)

    def test_default_address_exclusivity(self):
        self.client.force_authenticate(user=self.user)
        list_url = reverse("user-address-list")

        # Address 1 (default)
        a1 = self.client.post(list_url, {
            "line1": "100 Main St",
            "city": "New York",
            "state": "NY",
            "country": "US",
            "postal_code": "10001",
            "type": "shipping",
            "is_default": True,
        }, format="json").data

        # Address 2 (set to default)
        a2 = self.client.post(list_url, {
            "line1": "200 Broadway",
            "city": "New York",
            "state": "NY",
            "country": "US",
            "postal_code": "10002",
            "type": "shipping",
            "is_default": True,
        }, format="json").data

        # Address 1 should no longer be default
        addr1 = Address.objects.get(id=a1["id"])
        addr2 = Address.objects.get(id=a2["id"])
        self.assertFalse(addr1.is_default)
        self.assertTrue(addr2.is_default)

    def test_address_validate_endpoint(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("address-validate")
        payload = {
            "line1": "100 broadway",
            "city": "new york",
            "state": "ny",
            "country": "us",
            "postal_code": "10005",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["city"], "New York")
        self.assertEqual(res.data["state"], "NY")
        self.assertIsNotNone(res.data["latitude"])
        self.assertTrue(res.data["is_deliverable"])

    def test_media_presigned_upload(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("media-presigned-upload")

        # Valid avatar upload request
        data = {
            "purpose": "avatar",
            "content_type": "image/jpeg",
            "size_bytes": 1024 * 500,  # 500KB
        }
        res = self.client.post(url, data, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("upload_url", res.data)
        self.assertIn("file_url", res.data)
        self.assertTrue(res.data["file_url"].endswith(".jpg"))

        # Exceed size limit for avatar (limit is 5MB)
        large_data = {
            "purpose": "avatar",
            "content_type": "image/jpeg",
            "size_bytes": 10 * 1024 * 1024,  # 10MB
        }
        err_res = self.client.post(url, large_data, format="json")
        self.assertEqual(err_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_audit_log_middleware_hook(self):
        self.client.force_authenticate(user=self.admin_user)
        # Mutating request by platform admin
        target_user = self.user
        url = reverse("admin-user-status", kwargs={"pk": target_user.id})
        res = self.client.patch(url, {"is_active": True, "reason": "Audit test"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Check AuditLogMiddleware wrote entry
        log = AuditLog.objects.filter(actor=self.admin_user).order_by("-created_at").first()
        self.assertIsNotNone(log)
        self.assertIn("PATCH", log.action)
