"""
accounts/urls/users.py — User profile endpoints (Sprint 1).
Mounted at /api/v1/users/ in config/api_router.py
"""
from django.urls import path
from accounts.views import UserMeView, AddressViewSet

urlpatterns = [
    path("me/", UserMeView.as_view(), name="user-me"),
    path(
        "me/addresses/",
        AddressViewSet.as_view({"get": "list", "post": "create"}),
        name="user-address-list",
    ),
    path(
        "me/addresses/<uuid:pk>/",
        AddressViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="user-address-detail",
    ),
]
