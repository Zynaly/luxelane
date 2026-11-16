"""
payments/gateways/fake.py — FakeGateway stub.

Used in development and tests when settings.PAYMENT_GATEWAY == 'fake'.
Always succeeds unless the special card number 0000-fail is supplied.
"""
import uuid
from dataclasses import dataclass
from typing import Optional


@dataclass
class ChargeResult:
    success: bool
    gateway_transaction_id: str
    raw_response: dict
    error_message: Optional[str] = None


class FakeGateway:
    """Simulates a payment gateway for development and testing."""

    GATEWAY_CODE = "fake"

    def create_payment_intent(self, amount: int, currency: str, order_id: str) -> dict:
        """Returns a fake Stripe-like PaymentIntent response."""
        return {
            "id": f"pi_fake_{uuid.uuid4().hex[:16]}",
            "client_secret": f"pi_fake_secret_{uuid.uuid4().hex}",
            "amount": amount,
            "currency": currency,
            "status": "requires_confirmation",
        }

    def charge(self, amount: int, currency: str, payment_method_id: str, order_id: str) -> ChargeResult:
        """Always succeeds. Returns a fake transaction ID."""
        return ChargeResult(
            success=True,
            gateway_transaction_id=f"fake_txn_{uuid.uuid4().hex}",
            raw_response={"status": "succeeded", "amount": amount, "currency": currency},
        )

    def refund(self, gateway_transaction_id: str, amount: int) -> ChargeResult:
        return ChargeResult(
            success=True,
            gateway_transaction_id=f"fake_refund_{uuid.uuid4().hex}",
            raw_response={"status": "succeeded", "amount": amount},
        )

    def verify_webhook(self, payload: bytes, signature: str) -> dict:
        """Always passes signature verification in fake mode."""
        return {"type": "payment_intent.succeeded", "data": {"object": {}}}
