import json
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from accounts.models import User, RoleEnum, OTPVerification, OTPPurpose
from core.models import AuditLog


class AccountsAuthTests(APITestCase):
    def setUp(self):
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="customer@example.com",
            phone="+12025550101",
            password=self.password,
            first_name="Alice",
            last_name="Smith",
            role=RoleEnum.CUSTOMER,
            is_verified=True,
        )
        self.admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password=self.password,
            first_name="Admin",
            last_name="Super",
        )

    def test_register_success(self):
        url = reverse("auth-register")
        data = {
            "email": "newuser@example.com",
            "phone": "+12025550199",
            "password": "SecurePassword123!",
            "first_name": "Bob",
            "last_name": "Jones",
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email="newuser@example.com").exists())
        # Check OTP was generated for registration
        self.assertTrue(
            OTPVerification.objects.filter(
                destination="newuser@example.com",
                purpose=OTPPurpose.REGISTER,
            ).exists()
        )

    def test_login_success_with_email(self):
        url = reverse("auth-login")
        data = {
            "email_or_phone": "customer@example.com",
            "password": self.password,
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "customer@example.com")

    def test_login_success_with_phone(self):
        url = reverse("auth-login")
        data = {
            "email_or_phone": "+12025550101",
            "password": self.password,
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_login_invalid_password(self):
        url = reverse("auth-login")
        data = {
            "email_or_phone": "customer@example.com",
            "password": "WrongPassword123!",
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_suspended_account(self):
        self.user.is_active = False
        self.user.save()
        url = reverse("auth-login")
        data = {
            "email_or_phone": "customer@example.com",
            "password": self.password,
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_token_refresh_and_logout(self):
        login_url = reverse("auth-login")
        login_res = self.client.post(login_url, {"email_or_phone": "customer@example.com", "password": self.password})
        access = login_res.data["access"]
        refresh = login_res.data["refresh"]

        # Refresh
        refresh_url = reverse("auth-token-refresh")
        refresh_res = self.client.post(refresh_url, {"refresh": refresh})
        self.assertEqual(refresh_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_res.data)
        new_refresh = refresh_res.data.get("refresh", refresh)

        # Logout
        logout_url = reverse("auth-logout")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        logout_res = self.client.post(logout_url, {"refresh": new_refresh})
        self.assertEqual(logout_res.status_code, status.HTTP_205_RESET_CONTENT)

        # Verify old refresh token is blacklisted
        failed_refresh = self.client.post(refresh_url, {"refresh": new_refresh})
        self.assertEqual(failed_refresh.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_me_profile_and_patch(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("user-me")
        # GET
        get_res = self.client.get(url)
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["email"], "customer@example.com")

        # PATCH
        patch_res = self.client.patch(url, {"first_name": "Alicia"}, format="json")
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Alicia")

    def test_password_change(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("auth-password-change")
        new_pass = "BrandNewPass987!"
        data = {
            "old_password": self.password,
            "new_password": new_pass,
        }
        res = self.client.post(url, data, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Test logging in with new password
        self.client.logout()
        login_res = self.client.post(reverse("auth-login"), {"email_or_phone": "customer@example.com", "password": new_pass})
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    def test_otp_flow_and_verification(self):
        from django.core import mail
        import re

        req_url = reverse("auth-otp-request")
        res = self.client.post(req_url, {"destination": "customer@example.com", "purpose": "login"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Get delivered OTP code from mail.outbox
        self.assertTrue(len(mail.outbox) > 0)
        body = mail.outbox[-1].body
        match = re.search(r"\b\d{6}\b", body)
        self.assertIsNotNone(match)
        code = match.group()

        # Verify OTP
        verify_url = reverse("auth-verify-otp")
        v_res = self.client.post(verify_url, {"destination": "customer@example.com", "code": code, "purpose": "login"})
        self.assertEqual(v_res.status_code, status.HTTP_200_OK)

    def test_admin_user_management_and_audit_log(self):
        # Customer should be forbidden from admin endpoint
        self.client.force_authenticate(user=self.user)
        list_url = reverse("admin-user-list")
        cust_res = self.client.get(list_url)
        self.assertEqual(cust_res.status_code, status.HTTP_403_FORBIDDEN)

        # Super admin should have access
        self.client.force_authenticate(user=self.admin_user)
        admin_res = self.client.get(list_url)
        self.assertEqual(admin_res.status_code, status.HTTP_200_OK)

        # Retrieve single user
        detail_url = reverse("admin-user-detail", kwargs={"pk": self.user.id})
        det_res = self.client.get(detail_url)
        self.assertEqual(det_res.status_code, status.HTTP_200_OK)
        self.assertEqual(det_res.data["email"], "customer@example.com")

        # Suspend user and check AuditLog
        status_url = reverse("admin-user-status", kwargs={"pk": self.user.id})
        patch_res = self.client.patch(status_url, {"is_active": False, "reason": "Suspicious activity"}, format="json")
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

        # Check AuditLog
        log = AuditLog.objects.filter(action="user.status_update", target_id=self.user.id).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin_user)
        self.assertEqual(log.before["is_active"], True)
        self.assertEqual(log.after["is_active"], False)

    def test_vendor_register(self):
        url = reverse("auth-register-vendor")
        data = {
            "email": "vendor@luxelane.com",
            "phone": "+12025550222",
            "password": "VendorPassword123!",
            "first_name": "Valerie",
            "last_name": "Vendor",
            "legal_name": "Valerie Boutique LLC",
            "display_name": "Valerie Boutique",
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        vendor_user = User.objects.filter(email="vendor@luxelane.com").first()
        self.assertIsNotNone(vendor_user)
        self.assertEqual(vendor_user.role, RoleEnum.VENDOR_OWNER)

    def test_2fa_flow(self):
        from django.core import mail
        import re

        self.client.force_authenticate(user=self.user)
        enable_url = reverse("auth-2fa-enable")
        enable_res = self.client.post(enable_url)
        self.assertEqual(enable_res.status_code, status.HTTP_200_OK)

        # Extract sent 2FA code
        self.assertTrue(len(mail.outbox) > 0)
        body = mail.outbox[-1].body
        match = re.search(r"\b\d{6}\b", body)
        self.assertIsNotNone(match)
        code = match.group()

        # Verify 2FA
        verify_url = reverse("auth-2fa-verify")
        verify_res = self.client.post(verify_url, {"code": code})
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

