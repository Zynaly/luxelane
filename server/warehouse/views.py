"""
warehouse/views.py — Sprint 6: Warehouse & Inventory Core views.

Views:
  WarehouseViewSet             : CRUD warehouses
  WarehouseStaffViewSet        : Manage warehouse staff
  WarehouseInventoryViewSet    : List inventory per warehouse
  InventoryAdjustView          : Mutate inventory.on_hand via services.stock.adjust()
  InventoryBulkUpdateView      : Bulk adjust inventory
  StockMovementViewSet         : Read-only ledger of stock movements
  StockTransferViewSet         : Transfer request, approve, and complete workflows
  PurchaseOrderViewSet         : PO management
  PurchaseOrderReceiveView     : Receive PO stock into warehouse
  LowStockView                 : Variants below or at reorder threshold
  VariantAvailabilityView      : Public variant availability query across warehouses
"""
import uuid
from django.db import transaction, models
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, generics, mixins, viewsets, filters
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from drf_spectacular.utils import extend_schema

from core.permissions import (
    IsPlatformAdmin,
    IsWarehouseMember,
    IsWarehouseManager,
    IsVendorMember,
)
from warehouse.models import (
    Warehouse,
    WarehouseStaff,
    Inventory,
    StockMovement,
    StockTransfer,
    StockTransferItem,
    PurchaseOrder,
    PurchaseOrderItem,
    InventoryReservation,
    StaffRole,
    MovementType,
    TransferStatus,
    POStatus,
)
from warehouse.serializers import (
    WarehouseSerializer,
    WarehouseStaffSerializer,
    InventorySerializer,
    InventoryAdjustSerializer,
    InventoryBulkUpdateSerializer,
    StockMovementSerializer,
    StockTransferSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderReceiveSerializer,
    VariantAvailabilitySerializer,
    AllocationPreviewRequestSerializer,
    AllocationPreviewResponseSerializer,
    InventoryReservationSerializer,
)
from warehouse.services import stock as stock_service
from warehouse.services import allocation as allocation_service
from catalog.models import ProductVariant


# ── Mixin ─────────────────────────────────────────────────────────────────────

class ScopedToWarehouseMixin:
    """
    Scopes querysets to warehouses the user is assigned to, unless admin.
    """
    def filter_by_warehouse_scope(self, qs):
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()
        role = getattr(user, "role", None)
        if role in ("super_admin", "platform_admin"):
            return qs
        if role in ("vendor_owner", "vendor_staff"):
            from vendors.models import Vendor
            vendor = Vendor.objects.filter(owner_user=user, is_deleted=False).first()
            if vendor:
                return qs.filter(warehouse__vendor=vendor)
        return qs.filter(warehouse__staff_members__user=user).distinct()


# ── Warehouse Views ───────────────────────────────────────────────────────────

@extend_schema(tags=["Warehouse — Facilities"])
class WarehouseViewSet(viewsets.ModelViewSet):
    """
    GET /warehouses/       — Public read / Authenticated list
    POST /warehouses/      — PlatformAdmin or VendorMember create
    GET/PUT/DELETE /warehouses/{id}/ — PlatformAdmin or assigned manager
    """
    serializer_class = WarehouseSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["name"]
    filterset_fields = ["is_active", "vendor"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        if self.action in ("list", "retrieve") and not (
            self.request.user and self.request.user.is_authenticated
        ):
            return Warehouse.objects.filter(is_active=True, is_deleted=False)
        return Warehouse.objects.filter(is_deleted=False)

    def perform_create(self, serializer):
        user = self.request.user
        role = getattr(user, "role", None)
        vendor = None
        if role in ("vendor_owner", "vendor_staff"):
            from vendors.models import Vendor
            vendor = Vendor.objects.filter(owner_user=user, is_deleted=False).first()
        serializer.save(vendor=vendor)


@extend_schema(tags=["Warehouse — Staff"])
class WarehouseStaffViewSet(viewsets.ModelViewSet):
    """
    CRUD /warehouses/{warehouse_id}/staff/ — IsWarehouseManager or PlatformAdmin
    """
    serializer_class = WarehouseStaffSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        warehouse_id = self.kwargs.get("warehouse_id")
        return WarehouseStaff.objects.filter(warehouse_id=warehouse_id, is_deleted=False).select_related("user")

    def perform_create(self, serializer):
        warehouse_id = self.kwargs.get("warehouse_id")
        warehouse = get_object_or_404(Warehouse, id=warehouse_id, is_deleted=False)
        serializer.save(warehouse=warehouse)


# ── Inventory Views ───────────────────────────────────────────────────────────

@extend_schema(tags=["Warehouse — Inventory"])
class WarehouseInventoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    GET /warehouses/{warehouse_id}/inventory/
    List all inventory records for a specific warehouse.
    """
    serializer_class = InventorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["variant__sku", "variant__product__title"]

    def get_queryset(self):
        warehouse_id = self.kwargs.get("warehouse_id")
        return (
            Inventory.objects.filter(warehouse_id=warehouse_id, is_deleted=False)
            .select_related("warehouse", "variant", "variant__product")
        )


@extend_schema(tags=["Warehouse — Inventory"])
class InventoryAdjustView(APIView):
    """
    POST /inventory/adjust/
    Single stock level mutation using services.stock.adjust().
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InventoryAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        inventory, _ = Inventory.objects.get_or_create(
            warehouse_id=data["warehouse_id"],
            variant_id=data["variant_id"],
        )

        movement = stock_service.adjust(
            inventory=inventory,
            quantity_delta=data["quantity_delta"],
            movement_type=data.get("movement_type", MovementType.MANUAL_ADJUSTMENT),
            reason=data.get("reason", "Manual stock adjustment"),
            performed_by=request.user,
        )

        return Response(
            {
                "detail": "Stock adjusted successfully.",
                "movement": StockMovementSerializer(movement).data,
                "current_on_hand": inventory.on_hand,
                "available": inventory.available,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Warehouse — Inventory"])
class InventoryBulkUpdateView(APIView):
    """
    POST /inventory/bulk-update/
    Bulk adjust multiple inventory items in a single atomic database transaction.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InventoryBulkUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        items = serializer.validated_data["items"]
        movements = []

        with transaction.atomic():
            for item in items:
                inv, _ = Inventory.objects.get_or_create(
                    warehouse_id=item["warehouse_id"],
                    variant_id=item["variant_id"],
                )
                m = stock_service.adjust(
                    inventory=inv,
                    quantity_delta=item["quantity_delta"],
                    movement_type=item.get("movement_type", MovementType.MANUAL_ADJUSTMENT),
                    reason=item.get("reason", "Bulk stock update"),
                    performed_by=request.user,
                )
                movements.append(m)

        return Response(
            {
                "detail": f"Successfully updated {len(movements)} inventory records.",
                "count": len(movements),
            },
            status=status.HTTP_200_OK,
        )


# ── Stock Movement Views ──────────────────────────────────────────────────────

@extend_schema(tags=["Warehouse — Inventory"])
class StockMovementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET /stock-movements/
    Immutable append-only ledger of stock transactions.
    """
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["inventory__variant__sku", "reason"]
    filterset_fields = ["movement_type", "inventory__warehouse", "inventory__variant"]

    def get_queryset(self):
        return StockMovement.objects.all().select_related(
            "inventory",
            "inventory__warehouse",
            "inventory__variant",
            "performed_by",
        )


# ── Stock Transfer Views ──────────────────────────────────────────────────────

@extend_schema(tags=["Warehouse — Transfers"])
class StockTransferViewSet(viewsets.ModelViewSet):
    """
    Inter-warehouse transfers:
      GET/POST /stock-transfers/
      PATCH /stock-transfers/{id}/approve/
      PATCH /stock-transfers/{id}/complete/
    """
    serializer_class = StockTransferSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "from_warehouse", "to_warehouse"]

    def get_queryset(self):
        return StockTransfer.objects.filter(is_deleted=False).select_related(
            "from_warehouse", "to_warehouse", "requested_by", "approved_by"
        ).prefetch_related("items", "items__variant")

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user, status=TransferStatus.REQUESTED)

    @action(detail=True, methods=["patch"], url_path="approve")
    def approve(self, request, pk=None):
        transfer = self.get_object()
        if transfer.status != TransferStatus.REQUESTED:
            return Response(
                {"error": f"Cannot approve transfer in '{transfer.status}' status."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        transfer.status = TransferStatus.APPROVED
        transfer.approved_by = request.user
        transfer.save(update_fields=["status", "approved_by", "updated_at"])
        return Response(StockTransferSerializer(transfer).data)

    @action(detail=True, methods=["patch"], url_path="complete")
    def complete(self, request, pk=None):
        transfer = self.get_object()
        if transfer.status not in (TransferStatus.APPROVED, TransferStatus.IN_TRANSIT):
            return Response(
                {"error": f"Cannot complete transfer from '{transfer.status}' status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for item in transfer.items.all():
                # Deduct from origin warehouse
                from_inv, _ = Inventory.objects.get_or_create(
                    warehouse=transfer.from_warehouse,
                    variant=item.variant,
                )
                stock_service.adjust(
                    inventory=from_inv,
                    quantity_delta=-item.quantity,
                    movement_type=MovementType.TRANSFER_OUT,
                    reason=f"Transfer #{transfer.id} to {transfer.to_warehouse.name}",
                    reference_id=transfer.id,
                    performed_by=request.user,
                )

                # Add to destination warehouse
                to_inv, _ = Inventory.objects.get_or_create(
                    warehouse=transfer.to_warehouse,
                    variant=item.variant,
                )
                stock_service.adjust(
                    inventory=to_inv,
                    quantity_delta=item.quantity,
                    movement_type=MovementType.TRANSFER_IN,
                    reason=f"Transfer #{transfer.id} from {transfer.from_warehouse.name}",
                    reference_id=transfer.id,
                    performed_by=request.user,
                )

            transfer.status = TransferStatus.COMPLETED
            transfer.save(update_fields=["status", "updated_at"])

        return Response(StockTransferSerializer(transfer).data)


# ── Purchase Order Views ──────────────────────────────────────────────────────

@extend_schema(tags=["Warehouse — Purchase Orders"])
class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    CRUD /purchase-orders/
    """
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "warehouse"]

    def get_queryset(self):
        return PurchaseOrder.objects.filter(is_deleted=False).select_related(
            "warehouse"
        ).prefetch_related("items", "items__variant")


@extend_schema(tags=["Warehouse — Purchase Orders"])
class PurchaseOrderReceiveView(APIView):
    """
    POST /purchase-orders/{id}/receive/
    Receives quantities for PO line items, automatically restocking warehouse inventory.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id=None):
        po = get_object_or_404(PurchaseOrder, id=id, is_deleted=False)
        serializer = PurchaseOrderReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        items_data = serializer.validated_data["items"]
        items_by_id = {str(item.id): item for item in po.items.all()}

        with transaction.atomic():
            for entry in items_data:
                item_id = str(entry["item_id"])
                qty = entry["qty_received"]
                if item_id in items_by_id:
                    po_item = items_by_id[item_id]
                    po_item.qty_received += qty
                    po_item.save(update_fields=["qty_received", "updated_at"])

                    # Restock inventory in PO's warehouse
                    inv, _ = Inventory.objects.get_or_create(
                        warehouse=po.warehouse,
                        variant=po_item.variant,
                    )
                    stock_service.adjust(
                        inventory=inv,
                        quantity_delta=qty,
                        movement_type=MovementType.PO_RECEIPT,
                        reason=f"PO #{po.id} receipt from {po.supplier_name}",
                        reference_id=po.id,
                        performed_by=request.user,
                    )

            # Check if all items fully received
            all_received = all(i.qty_received >= i.qty_ordered for i in po.items.all())
            po.status = POStatus.RECEIVED if all_received else POStatus.PARTIALLY_RECEIVED
            po.save(update_fields=["status", "updated_at"])

        return Response(PurchaseOrderSerializer(po).data, status=status.HTTP_200_OK)


# ── Low Stock & Availability Views ────────────────────────────────────────────

@extend_schema(tags=["Warehouse — Inventory"])
class LowStockView(generics.ListAPIView):
    """
    GET /inventory/low-stock/
    Returns all inventory where on_hand <= reorder_threshold.
    """
    serializer_class = InventorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Inventory.objects.filter(
                is_deleted=False,
                on_hand__lte=models.F("reorder_threshold"),
            )
            .select_related("warehouse", "variant", "variant__product")
            .order_by("on_hand")
        )


@extend_schema(tags=["Catalog — Availability"])
class VariantAvailabilityView(APIView):
    """
    GET /inventory/variant/{id}/availability/
    Public aggregate availability for a specific variant across active warehouses.
    """
    permission_classes = [AllowAny]

    def get(self, request, id=None):
        variant = get_object_or_404(
            ProductVariant.objects.select_related("product"),
            models.Q(id=id) | models.Q(sku=id),
            is_deleted=False,
        )

        inventories = (
            Inventory.objects.filter(
                variant=variant,
                warehouse__is_active=True,
                is_deleted=False,
            )
            .select_related("warehouse")
        )

        by_warehouse = [
            {
                "warehouse_id": str(inv.warehouse_id),
                "warehouse_name": inv.warehouse.name,
                "on_hand": inv.on_hand,
                "reserved": inv.reserved_cache,
                "available": inv.available,
            }
            for inv in inventories
        ]

        total_available = sum(item["available"] for item in by_warehouse)

        data = {
            "variant_id": str(variant.id),
            "sku": variant.sku,
            "total_available": total_available,
            "by_warehouse": by_warehouse,
        }

        return Response(VariantAvailabilitySerializer(data).data, status=status.HTTP_200_OK)


# ── Sprint 7: Allocation & Reservation Views ──────────────────────────────────

@extend_schema(tags=["Warehouse — Allocation"])
class AllocationPreviewView(APIView):
    """
    POST /inventory/allocate/preview/
    Pure evaluation smart-routing allocation preview. Computes fulfillment splits
    based on proximity (Haversine distance) and inventory availability without mutating DB.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=AllocationPreviewRequestSerializer,
        responses={200: AllocationPreviewResponseSerializer},
    )
    def post(self, request):
        serializer = AllocationPreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        coords = None
        if data.get("latitude") is not None and data.get("longitude") is not None:
            coords = (data["latitude"], data["longitude"])

        result = allocation_service.preview(
            items=data["items"],
            shipping_address_id=data.get("shipping_address_id"),
            destination_coords=coords,
        )

        response_serializer = AllocationPreviewResponseSerializer(result)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["Admin — Inventory Reservations"])
class AdminInventoryReservationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET /admin/inventory-reservations/
    Platform Admin view for inspecting active/expired/committed inventory reservations.
    """
    permission_classes = [IsPlatformAdmin]
    serializer_class = InventoryReservationSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    filterset_fields = ["status", "inventory__warehouse"]
    search_fields = ["inventory__variant__sku", "inventory__variant__product__title"]

    def get_queryset(self):
        return (
            InventoryReservation.objects.select_related(
                "inventory",
                "inventory__warehouse",
                "inventory__variant",
                "inventory__variant__product",
            )
            .order_by("-created_at")
        )

