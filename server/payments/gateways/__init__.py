from typing import Optional
from django.conf import settings
from .fake import FakeGateway
from .stripe_gw import StripeGateway
from .authorizenet_gw import AuthorizeNetGateway


def get_payment_gateway(gateway_code: Optional[str] = None):
    """
    Factory resolving the requested or configured payment gateway driver.
    Supported: 'fake', 'stripe', 'authorize_net'
    """
    code = (gateway_code or getattr(settings, "PAYMENT_GATEWAY", "fake")).lower()
    if code == "stripe":
        return StripeGateway()
    elif code in ("authorize_net", "authorizenet"):
        return AuthorizeNetGateway()
    else:
        return FakeGateway()


__all__ = [
    "FakeGateway",
    "StripeGateway",
    "AuthorizeNetGateway",
    "get_payment_gateway",
]
