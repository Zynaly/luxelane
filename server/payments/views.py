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
