"""
warehouse/services/allocation.py — Smart routing and allocation preview engine.

Pure function fulfillment routing based on Haversine distance and inventory availability.
Prioritizes single-facility fulfillment to minimize split shipments, falling back to
nearest-warehouse multi-facility splits when required.
"""
import math
import uuid
from decimal import Decimal
from typing import Any

from catalog.models import ProductVariant
from warehouse.models import Warehouse, Inventory


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the Great Circle distance (in kilometers) between two coordinates
    using the Haversine formula.
    """
    if lat1 == 0.0 and lon1 == 0.0 and lat2 == 0.0 and lon2 == 0.0:
        return 0.0

    R = 6371.0  # Earth's radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return round(R * c, 2)


def preview(
    items: list[dict[str, Any]],
    shipping_address_id: uuid.UUID | str | None = None,
    destination_coords: tuple[float, float] | None = None,
) -> dict[str, Any]:
    """
    Pure evaluation function — computes the optimal warehouse allocation splits for an order.
    Does NOT write or mutate any database state.

    Args:
        items: List of dicts [{'variant_id': <UUID/str>, 'quantity': <int>}]
        shipping_address_id: Optional UUID/str pointing to accounts.Address
        destination_coords: Optional tuple (latitude, longitude)

    Returns:
        Dict:
          {
            "splits": [
              {
                "warehouse_id": str,
                "warehouse_name": str,
                "distance_km": float,
                "items": [
                  {
                    "variant_id": str,
                    "sku": str,
                    "product_title": str,
                    "quantity": int
                  }
                ]
              }
            ],
            "total_splits": int,
            "feasible": bool,
            "unallocated": list
          }
    """
    # 1. Resolve destination coordinates
    dest_lat = 0.0
    dest_lon = 0.0
    if destination_coords:
        dest_lat, dest_lon = float(destination_coords[0]), float(destination_coords[1])
    elif shipping_address_id:
        try:
            from accounts.models import Address
            addr = Address.objects.filter(id=shipping_address_id).first()
            if addr and hasattr(addr, "latitude") and hasattr(addr, "longitude"):
                dest_lat = float(addr.latitude or 0.0)
                dest_lon = float(addr.longitude or 0.0)
        except Exception:
            pass

    # 2. Extract variants and requested quantities
    requested_map: dict[str, int] = {}
    for itm in items:
        v_id = str(itm.get("variant_id") or itm.get("variant"))
        qty = int(itm.get("quantity", 0))
        if v_id and qty > 0:
            requested_map[v_id] = requested_map.get(v_id, 0) + qty

    if not requested_map:
        return {"splits": [], "total_splits": 0, "feasible": True, "unallocated": []}

    # Fetch variant metadata (sku, product title)
    variant_records = {
        str(v.id): v
        for v in ProductVariant.objects.filter(id__in=requested_map.keys()).select_related("product")
    }

    # 3. Retrieve active warehouses & calculate distances
    warehouses = list(Warehouse.objects.filter(is_active=True, is_deleted=False))
    wh_distances: dict[str, float] = {}
    for wh in warehouses:
        wh_lat = float(wh.latitude or 0.0)
        wh_lon = float(wh.longitude or 0.0)
        wh_distances[str(wh.id)] = haversine_distance(dest_lat, dest_lon, wh_lat, wh_lon)

    # 4. Fetch inventory availability for requested variants
    inv_records = Inventory.objects.filter(
        warehouse__in=warehouses,
        variant_id__in=requested_map.keys(),
        is_deleted=False,
    ).select_related("warehouse", "variant")

    # inventory_map: warehouse_id -> { variant_id -> available_qty }
    inventory_map: dict[str, dict[str, int]] = {str(wh.id): {} for wh in warehouses}
    for inv in inv_records:
        wh_id = str(inv.warehouse_id)
        v_id = str(inv.variant_id)
        available = max(0, inv.on_hand - inv.reserved_cache)
        if available > 0:
            inventory_map[wh_id][v_id] = available

    # 5. Check for single-source fulfillment candidate
    # A single warehouse that can fulfill 100% of all requested items is preferred
    # to avoid multiple shipments.
    single_source_candidates = []
    for wh in warehouses:
        wh_id = str(wh.id)
        wh_stock = inventory_map.get(wh_id, {})
        can_fulfill_all = True
        for v_id, needed_qty in requested_map.items():
            if wh_stock.get(v_id, 0) < needed_qty:
                can_fulfill_all = False
                break
        if can_fulfill_all:
            single_source_candidates.append(wh)

    # If single-source warehouse(s) exist, choose the nearest one
    if single_source_candidates:
        single_source_candidates.sort(key=lambda w: (wh_distances.get(str(w.id), 999999), w.sla_hours))
        chosen_wh = single_source_candidates[0]
        chosen_id = str(chosen_wh.id)

        split_items = []
        for v_id, qty in requested_map.items():
            v_obj = variant_records.get(v_id)
            sku = v_obj.sku if v_obj else "SKU"
            title = v_obj.product.title if v_obj and v_obj.product else "Product"
            split_items.append({
                "variant_id": v_id,
                "sku": sku,
                "product_title": title,
                "quantity": qty,
            })

        return {
            "splits": [
                {
                    "warehouse_id": chosen_id,
                    "warehouse_name": chosen_wh.name,
                    "distance_km": wh_distances.get(chosen_id, 0.0),
                    "items": split_items,
                }
            ],
            "total_splits": 1,
            "feasible": True,
            "unallocated": [],
        }

    # 6. Fallback: Multi-warehouse greedy allocation
    # Order warehouses by shortest distance first
    sorted_warehouses = sorted(warehouses, key=lambda w: (wh_distances.get(str(w.id), 999999), w.sla_hours))

    remaining_needed = dict(requested_map)
    allocations_by_wh: dict[str, list[dict[str, Any]]] = {}

    for wh in sorted_warehouses:
        wh_id = str(wh.id)
        wh_stock = dict(inventory_map.get(wh_id, {}))
        wh_allocated_items = []

        for v_id, needed in list(remaining_needed.items()):
            if needed <= 0:
                continue

            available = wh_stock.get(v_id, 0)
            if available > 0:
                alloc_qty = min(needed, available)
                v_obj = variant_records.get(v_id)
                wh_allocated_items.append({
                    "variant_id": v_id,
                    "sku": v_obj.sku if v_obj else "SKU",
                    "product_title": v_obj.product.title if v_obj and v_obj.product else "Product",
                    "quantity": alloc_qty,
                })
                remaining_needed[v_id] -= alloc_qty
                wh_stock[v_id] -= alloc_qty

        if wh_allocated_items:
            allocations_by_wh[wh_id] = wh_allocated_items

        # Stop early if all items are fully allocated
        if all(rem <= 0 for rem in remaining_needed.values()):
            break

    # 7. Check feasibility & unallocated shortages
    unallocated = []
    feasible = True
    for v_id, needed in remaining_needed.items():
        if needed > 0:
            feasible = False
            v_obj = variant_records.get(v_id)
            unallocated.append({
                "variant_id": v_id,
                "sku": v_obj.sku if v_obj else "SKU",
                "requested": requested_map[v_id],
                "allocated": requested_map[v_id] - needed,
                "deficit": needed,
            })

    # Assemble response splits
    splits = []
    for wh in sorted_warehouses:
        wh_id = str(wh.id)
        if wh_id in allocations_by_wh:
            splits.append({
                "warehouse_id": wh_id,
                "warehouse_name": wh.name,
                "distance_km": wh_distances.get(wh_id, 0.0),
                "items": allocations_by_wh[wh_id],
            })

    return {
        "splits": splits,
        "total_splits": len(splits),
        "feasible": feasible,
        "unallocated": unallocated,
    }
