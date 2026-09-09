from django.contrib import admin
from .models import PaymentAttempt, Transaction, SavedCard, WebhookEvent


@admin.register(PaymentAttempt)
class PaymentAttemptAdmin(admin.ModelAdmin):
    list_display = ["order", "gateway", "amount", "currency", "status", "client_secret", "created_at"]
    list_filter = ["gateway", "status", "currency"]
    search_fields = ["order__order_number", "gateway_attempt_id", "client_secret"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ["gateway_transaction_id", "order", "type", "amount", "currency", "status", "created_at"]
    list_filter = ["type", "status", "currency"]
    search_fields = ["gateway_transaction_id", "order__order_number"]
    readonly_fields = ["id", "created_at"]


@admin.register(SavedCard)
class SavedCardAdmin(admin.ModelAdmin):
    list_display = ["user", "brand", "last4", "exp_month", "exp_year", "gateway", "is_default", "created_at"]
    list_filter = ["brand", "gateway", "is_default"]
    search_fields = ["user__email", "last4", "gateway_payment_method_id"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ["provider_event_id", "source", "event_type", "status", "replay_count", "processed_at", "created_at"]
    list_filter = ["source", "status", "event_type"]
    search_fields = ["provider_event_id", "event_type"]
    readonly_fields = ["id", "created_at"]
