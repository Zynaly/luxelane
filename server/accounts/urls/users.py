"""
accounts/urls/users.py — User profile endpoints (Sprint 1).
Mounted at /api/v1/users/ in config/api_router.py
"""
from django.urls import path
from accounts.views import UserMeView

urlpatterns = [
    path("me/", UserMeView.as_view(), name="user-me"),
]
