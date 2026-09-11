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
    WalletBalanceView,
    WalletTransactionsView,
    VendorEscrowBalanceView,
    CODSendOTPView,
    CODCollectView,
    AdminLedgerAccountViewSet,
    AdminLedgerEntryViewSet,
    AdminLedgerReconciliationView,
    OrderRefundView,
    AdminRefundViewSet,
)

urlpatterns = [
    # Customer Payment Methods & Gateways
    path("methods/", PaymentMethodsView.as_view(), name="payment-methods"),
    # Saved Cards
    path("cards/", SavedCardViewSet.as_view({"get": "list", "post": "create"}), name="saved-cards-list"),
    path("cards/<uuid:pk>/", SavedCardViewSet.as_view({"get": "retrieve", "delete": "destroy"}), name="saved-card-detail"),
    path("cards/<uuid:pk>/set_default/", SavedCardViewSet.as_view({"post": "set_default"}), name="saved-card-set-default"),
    # Stripe Endpoints
    path("stripe/create-payment-intent/", StripeCreatePaymentIntentView.as_view(), name="stripe-create-intent"),
    path("stripe/confirm/", StripeConfirmPaymentView.as_view(), name="stripe-confirm"),
    path("stripe/webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
    # Authorize.Net Endpoints
    path("authorize-net/charge/", AuthorizeNetChargeView.as_view(), name="authorizenet-charge"),
    path("authorize-net/webhook/", AuthorizeNetWebhookView.as_view(), name="authorizenet-webhook"),
    # Customer Wallet (Sprint 12)
    path("wallet/", WalletBalanceView.as_view(), name="wallet-balance"),
    path("wallet/transactions/", WalletTransactionsView.as_view(), name="wallet-transactions"),
    # Vendor Escrow (Sprint 12)
    path("vendor/escrow/", VendorEscrowBalanceView.as_view(), name="vendor-escrow"),
    # Cash on Delivery (COD) (Sprint 12)
    path("cod/<uuid:order_id>/send-otp/", CODSendOTPView.as_view(), name="cod-send-otp"),
    path("cod/<uuid:order_id>/collect/", CODCollectView.as_view(), name="cod-collect"),
    # Order Refund (Sprint 14)
    path("orders/<uuid:id>/refund/", OrderRefundView.as_view(), name="order-refund-direct"),
]

admin_urlpatterns = [
    # Admin Transaction Audit & Webhook Replay
    path("transactions/", AdminTransactionViewSet.as_view({"get": "list"}), name="admin-transactions-list"),
    path("transactions/<uuid:pk>/", AdminTransactionViewSet.as_view({"get": "retrieve"}), name="admin-transactions-detail"),
    path("webhooks/<uuid:pk>/replay/", AdminWebhookReplayView.as_view(), name="admin-webhook-replay"),
    # Admin Double-Entry Ledger (Sprint 12)
    path("ledger/accounts/", AdminLedgerAccountViewSet.as_view({"get": "list"}), name="admin-ledger-accounts"),
    path("ledger/entries/", AdminLedgerEntryViewSet.as_view({"get": "list"}), name="admin-ledger-entries"),
    path("ledger/reconcile/", AdminLedgerReconciliationView.as_view(), name="admin-ledger-reconcile"),
    # Admin Refunds (Sprint 14)
    path("refunds/", AdminRefundViewSet.as_view({"get": "list"}), name="admin-refunds-list"),
    path("refunds/<uuid:pk>/", AdminRefundViewSet.as_view({"get": "retrieve"}), name="admin-refunds-detail"),
]


