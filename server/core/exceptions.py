"""
core.exceptions — custom DRF exception handler.
Transforms all 4xx/5xx responses into the standard error envelope:

  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "...",
      "field_errors": {"field": ["msg"]},
      "request_id": "..."
    }
  }
"""
from rest_framework.views import exception_handler
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from core.middleware import get_current_request_id


_STATUS_CODE_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    429: "RATE_LIMITED",
    500: "INTERNAL_SERVER_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def custom_exception_handler(exc, context):
    """Return all errors in the standard LuxeLane error envelope."""
    response = exception_handler(exc, context)

    if response is None:
        return response

    data = response.data
    code = getattr(exc, "default_code", None) or _STATUS_CODE_MAP.get(response.status_code, "ERROR")
    code = code.upper().replace("-", "_")

    # Extract a human-readable message
    if isinstance(data, dict) and "detail" in data:
        message = str(data["detail"])
    elif isinstance(data, list):
        message = str(data[0]) if data else "Error"
    else:
        message = str(data)

    # Field-level validation errors
    field_errors = {}
    if isinstance(exc, ValidationError) and isinstance(data, dict):
        field_errors = {
            k: [str(e) for e in v] if isinstance(v, list) else [str(v)]
            for k, v in data.items()
            if k != "detail"
        }

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "field_errors": field_errors,
            "request_id": get_current_request_id(),
        }
    }
    return response
