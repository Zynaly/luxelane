"""catalog/apps.py — Django AppConfig for Sprint 4 Catalog app."""
from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "catalog"
    verbose_name = "Catalog"
