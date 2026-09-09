"""
payments/services/payment_service.py — Core payment orchestration domain services.
Coordinates gateway drivers, creates PaymentAttempt and Transaction records,
handles card tokenization, and integrates with order confirmation.
"""
import logging
from decimal import Decimal
from typing import Dict, Any, List, Optional
from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import ValidationError, NotFound

from payments.models import (
    PaymentAttempt,
    PaymentAttemptStatus,
    Transaction,
    TransactionType,
    TransactionStatus,
    SavedCard,
    PaymentGateway,
)
from payments.gateways import get_payment_gateway, StripeGateway, AuthorizeNetGateway, FakeGateway
from orders.models import Order, OrderStatus
from orders.services.orchestration import confirm_order_payment

logger = logging.getLogger(__name__)


class PaymentService:
    def get_available_gateways(self) -> List[str]:
        """Returns list of active and coming-soon payment gateways configured on platform."""
        gateways = ["stripe", "jazzcash", "cod", "fake"]
        return gateways

    def get_gateways_detail(self) -> List[Dict[str, Any]]:
        """Returns structured gateway metadata with status and availability."""
        is_stripe_sandbox = getattr(settings, "STRIPE_SECRET_KEY", "").startswith("sk_test_")

        return [
            {
                "code": "stripe",
                "name": "Credit / Debit Card (Stripe)",
                "status": "active",
                "is_enabled": True,
                "badge": "Sandbox Active" if is_stripe_sandbox else "Live",
                "description": "Visa, Mastercard, Amex via Stripe Sandbox (live test keys active).",
            },
            {
                "code": "jazzcash",
                "name": "JazzCash",
                "status": "coming_soon",
                "is_enabled": False,
                "badge": "Coming Soon",
                "description": "Mobile account & voucher checkout (Integration arriving soon).",
            },
            {
                "code": "cod",
                "name": "Cash on Delivery",
                "status": "active",
                "is_enabled": True,
                "badge": "Available",
                "description": "Pay cash upon parcel delivery with OTP verification.",
            },
        ]

    def create_stripe_payment_intent(self, order: Order, user: Optional[Any] = None) -> Dict[str, Any]:
        """
        Creates a Stripe PaymentIntent for the given Order and records PaymentAttempt.
        """
        if order.status != OrderStatus.PENDING_PAYMENT:
            raise ValidationError({"order": "This order has already been paid and confirmed."})

        stripe_gw = StripeGateway()
        amount_cents = int(order.grand_total * 100)

        # Look up saved customer id if user is authenticated
        customer_id = None
        if user and user.is_authenticated:
            saved_card = SavedCard.objects.filter(user=user, gateway="stripe").first()
            if saved_card and saved_card.gateway_customer_id:
                customer_id = saved_card.gateway_customer_id

        metadata = {
            "order_id": str(order.id),
            "order_number": order.order_number,
            "customer_email": order.customer.email if order.customer else order.guest_email,
        }

        intent = stripe_gw.create_payment_intent(
            amount_cents=amount_cents,
            currency=order.currency.lower(),
            metadata=metadata,
            customer_id=customer_id,
        )

        with transaction.atomic():
            attempt = PaymentAttempt.objects.create(
                order=order,
                gateway=PaymentGateway.STRIPE,
                amount=order.grand_total,
                currency=order.currency,
                status=PaymentAttemptStatus.REQUIRES_ACTION,
                client_secret=intent.get("client_secret", ""),
                gateway_attempt_id=intent.get("id", ""),
                metadata=intent,
            )

        return {
            "client_secret": attempt.client_secret,
            "payment_intent_id": attempt.gateway_attempt_id,
            "amount": str(order.grand_total),
            "currency": order.currency,
            "attempt_id": str(attempt.id),
        }

    def confirm_stripe_payment(self, payment_intent_id: str, user: Optional[Any] = None) -> Dict[str, Any]:
        """
        Confirms a Stripe PaymentIntent in session, commits the order tree,
        and logs the capture transaction.
        """
        attempt = PaymentAttempt.objects.filter(
            gateway_attempt_id=payment_intent_id,
            gateway=PaymentGateway.STRIPE,
        ).select_related("order").first()

        if not attempt:
            raise NotFound("No payment attempt found matching this PaymentIntent ID.")

        order = attempt.order
        stripe_gw = StripeGateway()
        res = stripe_gw.confirm_payment_intent(payment_intent_id)

        status = res.get("status")
        if status in ("succeeded", "requires_capture"):
            with transaction.atomic():
                attempt.status = PaymentAttemptStatus.SUCCEEDED
                attempt.save(update_fields=["status", "updated_at"])

                txn = Transaction.objects.create(
                    payment_attempt=attempt,
                    order=order,
                    gateway_transaction_id=payment_intent_id,
                    type=TransactionType.CAPTURE,
                    amount=order.grand_total,
                    currency=order.currency,
                    status=TransactionStatus.SUCCEEDED,
                    raw_response=res,
                )

                confirm_order_payment(
                    order=order,
                    gateway_transaction_id=payment_intent_id,
                    changed_by=user,
                    gateway_name="stripe",
                )

            return {
                "status": "succeeded",
                "order_number": order.order_number,
                "transaction_id": txn.gateway_transaction_id,
            }
        else:
            attempt.status = PaymentAttemptStatus.FAILED
            attempt.error_message = f"Stripe status: {status}"
            attempt.save(update_fields=["status", "error_message", "updated_at"])
            raise ValidationError({"payment": f"Payment intent status is '{status}', not succeeded."})

    def charge_authorizenet(
        self,
        order: Order,
        opaque_data_descriptor: str,
        opaque_data_value: str,
        user: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Executes an Authorize.Net charge using Accept.js tokenized data.
        """
        if order.status != OrderStatus.PENDING_PAYMENT:
            raise ValidationError({"order": "This order has already been paid and confirmed."})

        anet_gw = AuthorizeNetGateway()
        customer_email = order.customer.email if order.customer else order.guest_email

        with transaction.atomic():
            attempt = PaymentAttempt.objects.create(
                order=order,
                gateway=PaymentGateway.AUTHORIZE_NET,
                amount=order.grand_total,
                currency=order.currency,
                status=PaymentAttemptStatus.INITIATED,
            )

        charge_res = anet_gw.charge_opaque_data(
            amount_decimal=float(order.grand_total),
            opaque_data_descriptor=opaque_data_descriptor,
            opaque_data_value=opaque_data_value,
            order_number=order.order_number,
            customer_email=customer_email,
        )

        with transaction.atomic():
            if charge_res.get("success"):
                txn_id = charge_res.get("transaction_id", "")
                attempt.status = PaymentAttemptStatus.SUCCEEDED
                attempt.gateway_attempt_id = txn_id
                attempt.save(update_fields=["status", "gateway_attempt_id", "updated_at"])

                txn = Transaction.objects.create(
                    payment_attempt=attempt,
                    order=order,
                    gateway_transaction_id=txn_id,
                    type=TransactionType.CAPTURE,
                    amount=order.grand_total,
                    currency=order.currency,
                    status=TransactionStatus.SUCCEEDED,
                    raw_response=charge_res.get("raw_response", {}),
                )

                confirm_order_payment(
                    order=order,
                    gateway_transaction_id=txn_id,
                    changed_by=user,
                    gateway_name="authorize_net",
                )

                return {
                    "success": True,
                    "order_number": order.order_number,
                    "transaction_id": txn_id,
                }
            else:
                attempt.status = PaymentAttemptStatus.FAILED
                attempt.error_message = charge_res.get("error_message", "Authorize.Net charge declined.")
                attempt.save(update_fields=["status", "error_message", "updated_at"])
                raise ValidationError({"payment": attempt.error_message})

    def save_card(
        self,
        user: Any,
        gateway: str,
        payment_method_id: str,
        brand: str,
        last4: str,
        exp_month: int,
        exp_year: int,
        is_default: bool = False,
    ) -> SavedCard:
        """Saves a tokenized card for customer account."""
        with transaction.atomic():
            if is_default:
                SavedCard.objects.filter(user=user).update(is_default=False)

            card = SavedCard.objects.create(
                user=user,
                gateway=gateway,
                gateway_payment_method_id=payment_method_id,
                brand=brand,
                last4=last4,
                exp_month=exp_month,
                exp_year=exp_year,
                is_default=is_default,
            )
            return card


payment_service = PaymentService()
