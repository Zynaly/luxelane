"""
warehouse/models.py — Sprint 6: Warehouse & Inventory Core.

Models:
  Warehouse, WarehouseStaff, Inventory, StockMovement,
  StockTransfer, StockTransferItem, PurchaseOrder, PurchaseOrderItem
"""
import uuid
from django.conf import settings
from django.db import models
from core.models import BaseModel


# ── Status choices ────────────────────────────────────────────────────────────

class StaffRole(models.TextChoices):
    MANAGER = "manager", "Manager"
    STAFF   = "staff",   "Staff"


class MovementType(models.TextChoices):
    PO_RECEIPT           = "po_receipt",           "PO Receipt"
    RESERVATION_CONSUMED = "reservation_consumed", "Reservation Consumed"
    RETURN_RESTOCK       = "return_restock",       "Return Restock"
    MANUAL_ADJUSTMENT    = "manual_adjustment",    "Manual Adjustment"
    TRANSFER_IN          = "transfer_in",          "Transfer In"
    TRANSFER_OUT         = "transfer_out",         "Transfer Out"


class TransferStatus(models.TextChoices):
    REQUESTED  = "requested",  "Requested"
    APPROVED   = "approved",   "Approved"
    IN_TRANSIT = "in_transit", "In Transit"
    COMPLETED  = "completed",  "Completed"
    CANCELLED  = "cancelled",  "Cancelled"


class POStatus(models.TextChoices):
    DRAFT              = "draft",              "Draft"
    ORDERED            = "ordered",            "Ordered"
    PARTIALLY_RECEIVED = "partially_received", "Partially Received"
    RECEIVED           = "received",           "Received"
    CANCELLED          = "cancelled",          "Cancelled"


# ── Warehouse ─────────────────────────────────────────────────────────────────

class Warehouse(BaseModel):
    """
    Fulfillment facility / Hub.
    ADR-11: vendor=None denotes platform-owned distribution centers.
    """
    vendor = models.ForeignKey(
        "vendors.Vendor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="warehouses",
        db_index=True,
    )
    name              = models.CharField(max_length=150)
    address           = models.ForeignKey(
        "accounts.Address",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="warehouses",
    )
    latitude          = models.DecimalField(max_digits=9, decimal_places=6, default=0.0)
    longitude         = models.DecimalField(max_digits=9, decimal_places=6, default=0.0)
    service_radius_km = models.DecimalField(max_digits=6, decimal_places=2, default=50.0)
    sla_hours         = models.PositiveIntegerField(default=24)
    is_active         = models.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        ordering = ["name"]
        indexes = [
            models.Index(fields=["vendor", "is_active"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        owner = self.vendor.display_name if self.vendor else "Platform"
        return f"{self.name} ({owner})"


# ── WarehouseStaff ────────────────────────────────────────────────────────────

class WarehouseStaff(BaseModel):
    warehouse  = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="staff_members", db_index=True)
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="warehouse_assignments", db_index=True)
    staff_role = models.CharField(max_length=20, choices=StaffRole.choices, default=StaffRole.STAFF)

    class Meta(BaseModel.Meta):
        unique_together = [("warehouse", "user")]
        ordering = ["staff_role", "created_at"]

    def __str__(self):
        return f"{self.user} @ {self.warehouse.name} ({self.staff_role})"


# ── Inventory ─────────────────────────────────────────────────────────────────

class Inventory(BaseModel):
    """
    Current stock level of a specific variant in a specific warehouse.
    Direct DB mutation is prohibited: all updates go through warehouse.services.stock.
    """
    warehouse         = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="inventories", db_index=True)
    variant           = models.ForeignKey("catalog.ProductVariant", on_delete=models.CASCADE, related_name="inventories", db_index=True)
    on_hand           = models.IntegerField(default=0)
    reserved_cache    = models.IntegerField(default=0)
    reorder_threshold = models.PositiveIntegerField(default=10)

    class Meta(BaseModel.Meta):
        unique_together = [("warehouse", "variant")]
        ordering = ["warehouse", "variant"]
        indexes = [
            models.Index(fields=["warehouse", "variant"]),
        ]

    @property
    def available(self) -> int:
        return max(0, self.on_hand - self.reserved_cache)

    def __str__(self):
        return f"{self.variant.sku} @ {self.warehouse.name}: {self.on_hand} (avail: {self.available})"


# ── StockMovement (Append-Only Audit Log) ─────────────────────────────────────

class StockMovement(models.Model):
    """
    Immutable ledger of every inventory mutation. No soft-delete.
    """
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at     = models.DateTimeField(auto_now_add=True, db_index=True)
    inventory      = models.ForeignKey(Inventory, on_delete=models.CASCADE, related_name="movements", db_index=True)
    quantity_delta = models.IntegerField()
    movement_type  = models.CharField(max_length=30, choices=MovementType.choices, db_index=True)
    reason         = models.TextField(blank=True, default="")
    reference_id   = models.UUIDField(null=True, blank=True, db_index=True)
    performed_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements_performed",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["inventory", "-created_at"]),
            models.Index(fields=["movement_type"]),
        ]

    def __str__(self):
        sign = "+" if self.quantity_delta > 0 else ""
        return f"{self.movement_type}: {sign}{self.quantity_delta} on {self.inventory}"


# ── StockTransfer ─────────────────────────────────────────────────────────────

class StockTransfer(BaseModel):
    """
    Inter-warehouse shipment of merchandise.
    """
    from_warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="transfers_out", db_index=True)
    to_warehouse   = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="transfers_in", db_index=True)
    status         = models.CharField(max_length=20, choices=TransferStatus.choices, default=TransferStatus.REQUESTED, db_index=True)
    requested_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_requested",
    )
    approved_by    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_approved",
    )
    notes          = models.TextField(blank=True, default="")

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"Transfer {self.id}: {self.from_warehouse.name} → {self.to_warehouse.name} ({self.status})"


class StockTransferItem(BaseModel):
    transfer = models.ForeignKey(StockTransfer, on_delete=models.CASCADE, related_name="items")
    variant  = models.ForeignKey("catalog.ProductVariant", on_delete=models.CASCADE, related_name="transfer_items")
    quantity = models.PositiveIntegerField()

    class Meta(BaseModel.Meta):
        unique_together = [("transfer", "variant")]

    def __str__(self):
        return f"{self.quantity}x {self.variant.sku} in {self.transfer_id}"


# ── PurchaseOrder ─────────────────────────────────────────────────────────────

class PurchaseOrder(BaseModel):
    warehouse     = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="purchase_orders", db_index=True)
    status        = models.CharField(max_length=20, choices=POStatus.choices, default=POStatus.DRAFT, db_index=True)
    supplier_name = models.CharField(max_length=200)
    notes         = models.TextField(blank=True, default="")

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"PO {self.id} — {self.supplier_name} ({self.status})"


class PurchaseOrderItem(BaseModel):
    po           = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    variant      = models.ForeignKey("catalog.ProductVariant", on_delete=models.CASCADE, related_name="po_items")
    qty_ordered  = models.PositiveIntegerField()
    qty_received = models.PositiveIntegerField(default=0)
    unit_cost    = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)

    class Meta(BaseModel.Meta):
        unique_together = [("po", "variant")]

    def __str__(self):
        return f"{self.variant.sku}: {self.qty_received}/{self.qty_ordered} @ ${self.unit_cost}"
