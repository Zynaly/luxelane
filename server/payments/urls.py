from django.urls import path
from payments.views import (
    PaymentMethodsView,
    StripeCreatePaymentIntentView,
    StripeConfirmPaymentView,
    StripeWebhookView,
    AuthorizeNetChargeView,
    AuthorizeNetWebhookView,
    SavedCardViewSet,
    AdminTransactionViewSet,
    AdminWebhookReplayView,
)

urlpatterns = [
    # Customer Payment Methods & Gateways
    path("methods/", PaymentMethodsView.as_view(), name="payment-methods"),
    # Saved Cards
    path("cards/", SavedCardViewSet.as_view({"get": "list", "post": "create"}), name="saved-cards-list"),
    path("cards/<uuid:pk>/", SavedCardViewSet.as_view({"get": "retrieve", "delete": "destroy"}), name="saved-card-detail"),
    # Stripe Endpoints
    path("stripe/create-payment-intent/", StripeCreatePaymentIntentView.as_view(), name="stripe-create-intent"),
    path("stripe/confirm/", StripeConfirmPaymentView.as_view(), name="stripe-confirm"),
    path("stripe/webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
    # Authorize.Net Endpoints
    path("authorize-net/charge/", AuthorizeNetChargeView.as_view(), name="authorizenet-charge"),
    path("authorize-net/webhook/", AuthorizeNetWebhookView.as_view(), name="authorizenet-webhook"),
]

admin_urlpatterns = [
    path("transactions/", AdminTransactionViewSet.as_view({"get": "list"}), name="admin-transactions-list"),
    path("transactions/<uuid:pk>/", AdminTransactionViewSet.as_view({"get": "retrieve"}), name="admin-transactions-detail"),
    path("webhooks/<uuid:pk>/replay/", AdminWebhookReplayView.as_view(), name="admin-webhook-replay"),
]

