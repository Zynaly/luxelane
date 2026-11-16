"""
accounts/urls/addresses.py — Address validation endpoints.
Mounted at /api/v1/addresses/ in config/api_router.py
"""
from django.urls import path
from accounts.views import AddressValidateView

urlpatterns = [
    path("validate/", AddressValidateView.as_view(), name="address-validate"),
]
