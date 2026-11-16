"""
core.pagination — cursor pagination used on all list endpoints.
Spec §0: default 20 results, max 100.

Response envelope:
  { "results": [...], "next": "cursor-or-null", "previous": "cursor-or-null", "count": 1234 }
"""
from rest_framework.pagination import CursorPagination as _BaseCursorPagination
from rest_framework.response import Response


class CursorPagination(_BaseCursorPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"

    def get_paginated_response(self, data):
        return Response({
            "results": data,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "count": self.page.paginator.count if hasattr(self.page, "paginator") else None,
        })

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "required": ["results"],
            "properties": {
                "results": schema,
                "next": {"type": "string", "nullable": True},
                "previous": {"type": "string", "nullable": True},
                "count": {"type": "integer", "nullable": True},
            },
        }
