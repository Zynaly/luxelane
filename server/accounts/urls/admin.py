"""
accounts/urls/admin.py — Admin-side user management URLs (Sprint 1).
Mounted at /api/v1/admin/ in config/api_router.py
"""
from django.urls import path
from accounts.views import (
    AdminUserListView, AdminUserDetailView, AdminUserStatusUpdateView,
)

urlpatterns = [
    path("users/",                    AdminUserListView.as_view(),          name="admin-user-list"),
    path("users/<uuid:pk>/",          AdminUserDetailView.as_view(),        name="admin-user-detail"),
    path("users/<uuid:pk>/status/",   AdminUserStatusUpdateView.as_view(),  name="admin-user-status"),
]
