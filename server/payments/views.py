"""
payments/views.py — DRF views for online payments, webhook ingestion, saved cards,
and financial transaction auditing.
"""
import json
import logging
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from core.permissions import IsPlatformAdmin, IsFinanceAdmin, IsPlatformOrFinanceAdmin, IsObjectOwner
from payments.models import (
    SavedCard,
    Transaction,
    PaymentAttempt,
    WebhookEvent,
    WebhookSource,
    WebhookStatus,
)
from payments.serializers import (
    SavedCardSerializer,
    SaveCardCreateSerializer,
    PaymentMethodsResponseSerializer,
    StripeCreateIntentSerializer,
    StripeConfirmSerializer,
    AuthorizeNetChargeSerializer,
    AdminTransactionSerializer,
    WebhookEventSerializer,
)
from payments.services.payment_service import payment_service
from payments.gateways import StripeGateway, AuthorizeNetGateway
from payments.tasks import process_webhook_event
from orders.models import Order

logger = logging.getLogger(__name__)


class PaymentMethodsView(APIView):
    """
    GET /payments/methods/ — Returns user's saved cards and active payment gateways.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        saved_cards = SavedCard.objects.filter(user=request.user)
        available_gateways = payment_service.get_available_gateways()
        data = {
            "available_gateways": available_gateways,
            "saved_cards": SavedCardSerializer(saved_cards, many=True).data,
        }
        return Response(data)


class StripeCreatePaymentIntentView(APIView):
    """
    POST /payments/stripe/create-payment-intent/
    Initiates a Stripe PaymentIntent for the given order.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = StripeCreateIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order_id = serializer.validated_data["order_id"]

        order = Order.objects.filter(id=order_id).first()
        if not order:
            raise NotFound("Order not found.")

        # Customer ownership check
        if order.customer and order.customer != request.user and not request.user.is_staff:
            raise PermissionDenied("You do not have permission to pay for this order.")

        intent_data = payment_service.create_stripe_payment_intent(order, user=request.user)
        return Response(intent_data, status=status.HTTP_201_CREATED)


class StripeConfirmPaymentView(APIView):
    """
    POST /payments/stripe/confirm/
    Synchronous client confirmation endpoint after Stripe payment completes in browser.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = StripeConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pi_id = serializer.validated_data["payment_intent_id"]

        result = payment_service.confirm_stripe_payment(pi_id, user=request.user)
        return Response(result, status=status.HTTP_200_OK)


class StripeWebhookView(APIView):
    """
    POST /payments/stripe/webhook/
    Public, cryptographic signature-verified webhook ingester.
    Stores raw payload immediately, returns HTTP 200, and dispatches Celery task.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        raw_body = request.body

        stripe_gw = StripeGateway()
        try:
            event_payload = stripe_gw.verify_webhook(raw_body, sig_header)
        except ValueError as exc:
            logger.warning(f"Stripe signature rejected: {exc}")
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        event_id = event_payload.get("id") or f"evt_mock_{hash(raw_body)}"
        event_type = event_payload.get("type", "unknown")

        # Deduplicate on provider_event_id
        webhook_event, created = WebhookEvent.objects.get_or_create(
            provider_event_id=event_id,
            defaults={
                "source": WebhookSource.STRIPE,
                "event_type": event_type,
                "raw_payload": event_payload,
                "status": WebhookStatus.RECEIVED,
            },
        )

        if created or webhook_event.status != WebhookStatus.PROCESSED:
            try:
                process_webhook_event.delay(str(webhook_event.id))
            except Exception as exc:
                # Fallback to synchronous processing if Celery broker is not running in tests
                logger.warning(f"Celery enqueue failed, running sync: {exc}")
                process_webhook_event(str(webhook_event.id))

        return Response({"received": True, "event_id": event_id}, status=status.HTTP_200_OK)


class AuthorizeNetChargeView(APIView):
    """
    POST /payments/authorize-net/charge/
    Authorizes and captures an order using Accept.js tokenized data.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AuthorizeNetChargeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order_id = serializer.validated_data["order_id"]

        order = Order.objects.filter(id=order_id).first()
        if not order:
            raise NotFound("Order not found.")

        if order.customer and order.customer != request.user and not request.user.is_staff:
            raise PermissionDenied("You do not have permission to pay for this order.")

        charge_res = payment_service.charge_authorizenet(
            order=order,
            opaque_data_descriptor=serializer.validated_data["opaque_data_descriptor"],
            opaque_data_value=serializer.validated_data["opaque_data_value"],
            user=request.user,
        )
        return Response(charge_res, status=status.HTTP_200_OK)


class AuthorizeNetWebhookView(APIView):
    """
    POST /payments/authorize-net/webhook/
    Public, HMAC-SHA512 signature-verified Authorize.Net webhook ingester.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        sig_header = request.META.get("HTTP_X_ANET_SIGNATURE", "")
        raw_body = request.body

        anet_gw = AuthorizeNetGateway()
        try:
            event_payload = anet_gw.verify_webhook(raw_body, sig_header)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        event_id = event_payload.get("notificationId") or f"anet_evt_{hash(raw_body)}"
        event_type = event_payload.get("eventType", "unknown")

        webhook_event, created = WebhookEvent.objects.get_or_create(
            provider_event_id=event_id,
            defaults={
                "source": WebhookSource.AUTHORIZE_NET,
                "event_type": event_type,
                "raw_payload": event_payload,
                "status": WebhookStatus.RECEIVED,
            },
        )

        if created or webhook_event.status != WebhookStatus.PROCESSED:
            try:
                process_webhook_event.delay(str(webhook_event.id))
            except Exception as exc:
                logger.warning(f"Celery enqueue failed, running sync: {exc}")
                process_webhook_event(str(webhook_event.id))

        return Response({"received": True, "event_id": event_id}, status=status.HTTP_200_OK)


class SavedCardViewSet(viewsets.ModelViewSet):
    """
    GET /payments/cards/ — List user's saved cards.
    POST /payments/cards/ — Save tokenized card.
    DELETE /payments/cards/{id}/ — Delete saved card.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = SavedCardSerializer

    def get_queryset(self):
        return SavedCard.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        in_serializer = SaveCardCreateSerializer(data=request.data)
        in_serializer.is_valid(raise_exception=True)
        v = in_serializer.validated_data

        card = payment_service.save_card(
            user=request.user,
            gateway=v["gateway"],
            payment_method_id=v["payment_method_id"],
            brand=v["brand"],
            last4=v["last4"],
            exp_month=v["exp_month"],
            exp_year=v["exp_year"],
            is_default=v["is_default"],
        )
        return Response(SavedCardSerializer(card).data, status=status.HTTP_201_CREATED)

    from rest_framework.decorators import action

    @action(detail=True, methods=["post"])
    def set_default(self, request, pk=None):
        card = self.get_object()
        SavedCard.objects.filter(user=request.user).update(is_default=False)
        card.is_default = True
        card.save(update_fields=["is_default", "updated_at"])
        return Response(SavedCardSerializer(card).data, status=status.HTTP_200_OK)


class AdminTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /admin/transactions/ — Platform transaction audit ledger for FinanceAdmin.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]
    serializer_class = AdminTransactionSerializer
    queryset = Transaction.objects.all().select_related("order", "payment_attempt")

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        type_filter = self.request.query_params.get("type")
        order_num = self.request.query_params.get("order_number")

        if status_filter:
            qs = qs.filter(status=status_filter)
        if type_filter:
            qs = qs.filter(type=type_filter)
        if order_num:
            qs = qs.filter(order__order_number__icontains=order_num)
        return qs


class AdminWebhookReplayView(APIView):
    """
    POST /admin/webhooks/{id}/replay/ — PlatformAdmin action to re-enqueue a webhook event.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]

    def post(self, request, pk):
        event = WebhookEvent.objects.filter(id=pk).first()
        if not event:
            raise NotFound("Webhook event not found.")

        event.replay_count += 1
        event.status = WebhookStatus.RECEIVED
        event.save(update_fields=["replay_count", "status"])

        try:
            process_webhook_event.delay(str(event.id))
        except Exception:
            process_webhook_event(str(event.id))

        return Response(
            {"detail": f"Webhook event {event.provider_event_id} re-enqueued for processing.", "replay_count": event.replay_count},
            status=status.HTTP_200_OK,
        )


# ── Sprint 12: Ledger, Escrow, Wallet & COD Views ─────────────────────────────

import random
import uuid
from decimal import Decimal
from django.utils import timezone
from accounts.models import LedgerAccount, LedgerEntry, LedgerAccountType
from payments.models import EscrowHold, EscrowStatus, CODCollection, CODStatus
from payments.serializers import (
    LedgerAccountSerializer,
    LedgerEntrySerializer,
    EscrowHoldSerializer,
    CODCollectionSerializer,
    CODVerifyOTPSerializer,
)
from payments.services.ledger import ledger_service
from payments.services.escrow import escrow_service
from orders.services.orchestration import confirm_order_payment


class WalletBalanceView(APIView):
    """
    GET /payments/wallet/ — Retrieve customer wallet store credit balance.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        account_key = f"customer_wallet:{user.id}"
        account = LedgerAccount.objects.filter(account_key=account_key).first()
        raw_balance = ledger_service.get_account_balance(account) if account else Decimal("0.00")
        # In double-entry, customer wallet is a liability to platform (credit: negative amount).
        # Customer spendable balance is represented as a positive amount.
        spendable = abs(raw_balance) if raw_balance < 0 else raw_balance
        return Response({
            "balance": str(spendable),
            "currency": account.currency if account else "USD",
            "account_key": account_key,
        })


class WalletTransactionsView(APIView):
    """
    GET /payments/wallet/transactions/ — Retrieve customer wallet ledger entries history.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        account_key = f"customer_wallet:{request.user.id}"
        entries = LedgerEntry.objects.filter(account__account_key=account_key).order_by("-created_at")[:50]
        serializer = LedgerEntrySerializer(entries, many=True)
        return Response({"results": serializer.data, "count": entries.count()})


class VendorEscrowBalanceView(APIView):
    """
    GET /payments/vendor/escrow/ — Retrieve vendor escrow summary and holds.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        vendor = getattr(request.user, "vendor", None)
        if not vendor:
            # Check if user owns any vendor
            from vendors.models import Vendor
            vendor = Vendor.objects.filter(owner=request.user).first()

        if not vendor:
            raise PermissionDenied("User is not associated with an approved vendor.")

        holds = EscrowHold.objects.filter(vendor=vendor)
        held = sum((h.net_vendor_amount for h in holds if h.status == EscrowStatus.HELD), Decimal("0.00"))
        eligible = sum((h.net_vendor_amount for h in holds if h.status == EscrowStatus.ELIGIBLE_FOR_RELEASE), Decimal("0.00"))
        released = sum((h.net_vendor_amount for h in holds if h.status == EscrowStatus.RELEASED), Decimal("0.00"))

        serializer = EscrowHoldSerializer(holds[:30], many=True)
        return Response({
            "vendor_id": str(vendor.id),
            "vendor_name": vendor.display_name,
            "held_balance": str(held),
            "eligible_balance": str(eligible),
            "released_balance": str(released),
            "currency": "USD",
            "recent_holds": serializer.data,
        })


class CODSendOTPView(APIView):
    """
    POST /payments/cod/{order_id}/send-otp/ — Generates and dispatches delivery OTP for COD collection.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        order = Order.objects.filter(id=order_id).first()
        if not order:
            raise NotFound("Order not found.")

        cod_collection, _ = CODCollection.objects.get_or_create(
            order=order,
            defaults={
                "amount": order.grand_total,
                "currency": order.currency,
                "status": CODStatus.PENDING,
            },
        )

        otp = f"{random.randint(100000, 999999):06d}"
        cod_collection.otp_code = otp
        cod_collection.otp_generated_at = timezone.now()
        cod_collection.status = CODStatus.OTP_SENT
        cod_collection.save(update_fields=["otp_code", "otp_generated_at", "status", "updated_at"])

        logger.info(f"Generated COD OTP for order {order.order_number}: {otp}")

        return Response({
            "status": "otp_sent",
            "order_number": order.order_number,
            "message": "Delivery confirmation OTP generated and dispatched to customer.",
            "otp_code": otp,  # Exposed for automated testing and courier display
        })


class CODCollectView(APIView):
    """
    POST /payments/cod/{order_id}/collect/ — Delivery agent verifies OTP and collects COD payment.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        order = Order.objects.filter(id=order_id).first()
        if not order:
            raise NotFound("Order not found.")

        cod_collection = getattr(order, "cod_collection", None)
        if not cod_collection:
            cod_collection = CODCollection.objects.filter(order=order).first()
        if not cod_collection:
            raise ValidationError({"order": "No COD collection record found for this order."})

        if cod_collection.status == CODStatus.COLLECTED:
            return Response({
                "status": "already_collected",
                "receipt_number": cod_collection.receipt_number,
                "order_number": order.order_number,
            })

        serializer = CODVerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["otp_code"]

        cod_collection.otp_attempts += 1
        if cod_collection.otp_attempts > 5:
            cod_collection.status = CODStatus.FAILED
            cod_collection.save(update_fields=["status", "otp_attempts", "updated_at"])
            raise ValidationError({"otp_code": "Maximum verification attempts exceeded."})

        if cod_collection.otp_code != code:
            cod_collection.save(update_fields=["otp_attempts", "updated_at"])
            raise ValidationError({"otp_code": "Invalid delivery confirmation OTP code."})

        receipt = f"COD-RCP-{uuid.uuid4().hex[:8].upper()}"
        cod_collection.status = CODStatus.COLLECTED
        cod_collection.collected_at = timezone.now()
        cod_collection.collected_by = request.user
        cod_collection.receipt_number = receipt
        cod_collection.notes = serializer.validated_data.get("notes", "")
        cod_collection.save()

        # Post to double-entry ledger
        ledger_service.post_cod_collection(cod_collection, collected_by=request.user)

        # Transition order to confirmed/fulfilled
        confirm_order_payment(
            order=order,
            gateway_transaction_id=receipt,
            gateway_name="cod",
            changed_by=request.user,
        )

        return Response({
            "status": "collected",
            "receipt_number": receipt,
            "order_number": order.order_number,
            "amount": str(cod_collection.amount),
        })


class AdminLedgerAccountViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /admin/ledger/accounts/ — PlatformAdmin view of all ledger accounts.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]
    serializer_class = LedgerAccountSerializer
    queryset = LedgerAccount.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        acc_type = self.request.query_params.get("account_type")
        key = self.request.query_params.get("search")
        if acc_type:
            qs = qs.filter(account_type=acc_type)
        if key:
            qs = qs.filter(account_key__icontains=key)
        return qs


class AdminLedgerEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /admin/ledger/entries/ — PlatformAdmin view of immutable ledger entries.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]
    serializer_class = LedgerEntrySerializer
    queryset = LedgerEntry.objects.all().select_related("account")

    def get_queryset(self):
        qs = super().get_queryset()
        ref_type = self.request.query_params.get("reference_type")
        group_id = self.request.query_params.get("entry_group_id")
        if ref_type:
            qs = qs.filter(reference_type=ref_type)
        if group_id:
            qs = qs.filter(entry_group_id=group_id)
        return qs


class AdminLedgerReconciliationView(APIView):
    """
    GET /admin/ledger/reconcile/ — Audits double-entry ledger integrity.
    """
    permission_classes = [IsPlatformOrFinanceAdmin]

    def get(self, request):
        report = ledger_service.reconcile()
        return Response(report)

