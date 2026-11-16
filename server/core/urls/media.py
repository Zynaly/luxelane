"""
core/urls/media.py — Media upload endpoints.
Mounted at /api/v1/media/ in config/api_router.py
"""
from django.urls import path
from core.views import MediaPresignedUploadView

urlpatterns = [
    path("presigned-upload/", MediaPresignedUploadView.as_view(), name="media-presigned-upload"),
]
