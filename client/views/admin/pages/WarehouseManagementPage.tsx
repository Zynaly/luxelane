import React, { useState, useEffect } from 'react';
import API, {
  Warehouse,
  InventoryItem,
  StockTransfer,
  PurchaseOrder,
  InventoryReservation,
  AllocationPreviewResponse,
} from '../../../services/api';
import { Icon } from '../../../components/Icon';

type ActiveTab = 'facilities' | 'inventory' | 'low_stock' | 'transfers' | 'purchase_orders' | 'reservations_routing';

export const WarehouseManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('facilities');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Data states
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [lowStockList, setLowStockList] = useState<InventoryItem[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);

  // Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');

  // Modal states
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [facilityForm, setFacilityForm] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'United Kingdom',
    is_active: true,
  });

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    warehouse_id: '',
    variant_id: '',
    quantity_delta: 10,
    movement_type: 'manual_adjustment',
    reason: '',
  });

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_warehouse: '',
    to_warehouse: '',
    variant_id: '',
    quantity: 10,
    notes: '',
  });

  const [showPOModal, setShowPOModal] = useState(false);
  const [poForm, setPoForm] = useState({
    warehouse: '',
    supplier_name: '',
    variant_id: '',
    qty_ordered: 25,
    unit_cost: '450.00',
    notes: '',
  });

  // Sprint 7 Allocation Simulator State
  const [allocForm, setAllocForm] = useState({
    variant_id: '',
    quantity: 5,
    latitude: 51.5074,
    longitude: -0.1278,
  });
  const [allocResult, setAllocResult] = useState<AllocationPreviewResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load all initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [whData, lowData, transferData, poData, resData] = await Promise.all([
        API.Warehouse.list().catch(() => []),
        API.Inventory.getLowStock().catch(() => []),
        API.StockTransfer.list().catch(() => []),
        API.PurchaseOrder.list().catch(() => []),
        API.Reservation.adminList().catch(() => []),
      ]);
      setWarehouses(whData || []);
      setLowStockList(lowData || []);
      setTransfers(transferData || []);
      setPurchaseOrders(poData || []);
      setReservations(resData || []);

      // If there are warehouses, load inventory
      if (whData && whData.length > 0) {
        const firstWhId = whData[0].id;
        const inv = await API.Warehouse.getInventory(firstWhId).catch(() => []);
        setInventoryList(inv || []);
        if (inv && inv.length > 0) {
          setAllocForm((prev) => ({ ...prev, variant_id: inv[0].variant }));
        }
      }
    } catch (err: any) {
      console.error('Failed loading warehouse operations data:', err);
      showToast(err.message || 'Error loading operations data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reload inventory when selectedWarehouseFilter changes
  const handleWarehouseFilterChange = async (whId: string) => {
    setSelectedWarehouseFilter(whId);
    if (whId === 'all') {
      if (warehouses.length > 0) {
        const inv = await API.Warehouse.getInventory(warehouses[0].id).catch(() => []);
        setInventoryList(inv || []);
      }
    } else {
      const inv = await API.Warehouse.getInventory(whId).catch(() => []);
      setInventoryList(inv || []);
    }
  };

  // Facility CRUD
  const handleOpenCreateFacility = () => {
    setEditingWarehouse(null);
    setFacilityForm({
      name: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'United Kingdom',
      is_active: true,
    });
    setShowFacilityModal(true);
  };

  const handleOpenEditFacility = (wh: Warehouse) => {
    setEditingWarehouse(wh);
    setFacilityForm({
      name: wh.name,
      address_line1: wh.address_line1,
      address_line2: wh.address_line2 || '',
      city: wh.city,
      state: wh.state,
      postal_code: wh.postal_code,
      country: wh.country,
      is_active: wh.is_active,
    });
    setShowFacilityModal(true);
  };

  const handleSaveFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityForm.name.trim() || !facilityForm.city.trim()) {
      showToast('Facility name and city are required', 'error');
      return;
    }
    try {
      if (editingWarehouse) {
        const updated = await API.Warehouse.update(editingWarehouse.id, facilityForm);
        setWarehouses(warehouses.map((w) => (w.id === updated.id ? updated : w)));
        showToast(`Facility "${updated.name}" updated successfully.`);
      } else {
        const created = await API.Warehouse.create(facilityForm);
        setWarehouses([created, ...warehouses]);
        showToast(`Facility "${created.name}" created successfully.`);
      }
      setShowFacilityModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed saving facility', 'error');
    }
  };

  const handleDeleteFacility = async (wh: Warehouse) => {
    if (!window.confirm(`Are you sure you want to deactivate/delete facility "${wh.name}"?`)) return;
    try {
      await API.Warehouse.delete(wh.id);
      setWarehouses(warehouses.filter((w) => w.id !== wh.id));
      showToast(`Facility "${wh.name}" deleted.`);
    } catch (err: any) {
      showToast(err.message || 'Failed deleting facility', 'error');
    }
  };

  // Stock Adjustment
  const handleOpenAdjustModal = (invItem?: InventoryItem) => {
    setAdjustForm({
      warehouse_id: invItem ? invItem.warehouse : (warehouses[0]?.id || ''),
      variant_id: invItem ? invItem.variant : '',
      quantity_delta: 10,
      movement_type: 'manual_adjustment',
      reason: 'Standard stock adjustment',
    });
    setShowAdjustModal(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustForm.warehouse_id || !adjustForm.variant_id) {
      showToast('Warehouse and Variant are required', 'error');
      return;
    }
    if (adjustForm.quantity_delta === 0) {
      showToast('Quantity delta cannot be zero', 'error');
      return;
    }
    try {
      const res = await API.Inventory.adjust({
        warehouse_id: adjustForm.warehouse_id,
        variant_id: adjustForm.variant_id,
        quantity_delta: Number(adjustForm.quantity_delta),
        movement_type: adjustForm.movement_type,
        reason: adjustForm.reason,
      });
      showToast(`Stock updated: New on-hand: ${res.current_on_hand}, Available: ${res.available}`);
      setShowAdjustModal(false);
      if (adjustForm.warehouse_id) {
        const inv = await API.Warehouse.getInventory(adjustForm.warehouse_id);
        setInventoryList(inv || []);
      }
      const low = await API.Inventory.getLowStock();
      setLowStockList(low || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust stock', 'error');
    }
  };

  // Quick Restock for Low Stock Tab
  const handleQuickRestock = async (item: InventoryItem, delta: number = 50) => {
    try {
      await API.Inventory.adjust({
        warehouse_id: item.warehouse,
        variant_id: item.variant,
        quantity_delta: delta,
        movement_type: 'restock',
        reason: `Replenishment threshold trigger (+${delta} units)`,
      });
      showToast(`Restocked +${delta} units for SKU ${item.variant_sku || 'item'}`);
      const low = await API.Inventory.getLowStock();
      setLowStockList(low || []);
      if (selectedWarehouseFilter === item.warehouse || selectedWarehouseFilter === 'all') {
        const inv = await API.Warehouse.getInventory(item.warehouse);
        setInventoryList(inv || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Quick restock failed', 'error');
    }
  };

  // Stock Transfer Actions
  const handleOpenTransferModal = () => {
    setTransferForm({
      from_warehouse: warehouses[0]?.id || '',
      to_warehouse: warehouses[1]?.id || warehouses[0]?.id || '',
      variant_id: inventoryList[0]?.variant || '',
      quantity: 10,
      notes: 'Urgent inter-facility stock balance',
    });
    setShowTransferModal(true);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.from_warehouse || !transferForm.to_warehouse || !transferForm.variant_id) {
      showToast('Source, destination and variant are required', 'error');
      return;
    }
    if (transferForm.from_warehouse === transferForm.to_warehouse) {
      showToast('Source and Destination facilities must be different', 'error');
      return;
    }
    try {
      const created = await API.StockTransfer.create({
        from_warehouse: transferForm.from_warehouse,
        to_warehouse: transferForm.to_warehouse,
        notes: transferForm.notes,
        items: [{ variant: transferForm.variant_id, quantity: Number(transferForm.quantity) }],
      });
      setTransfers([created, ...transfers]);
      showToast('Stock transfer initiated.');
      setShowTransferModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to create transfer', 'error');
    }
  };

  const handleDispatchTransfer = async (transferId: string) => {
    try {
      const res = await API.StockTransfer.dispatch(transferId);
      setTransfers(transfers.map((t) => (t.id === res.id ? res : t)));
      showToast('Transfer marked In-Transit.');
    } catch (err: any) {
      showToast(err.message || 'Failed to dispatch transfer', 'error');
    }
  };

  const handleReceiveTransfer = async (transferId: string) => {
    try {
      const res = await API.StockTransfer.receive(transferId);
      setTransfers(transfers.map((t) => (t.id === res.id ? res : t)));
      showToast('Transfer received and stock credited.');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to receive transfer', 'error');
    }
  };

  // Purchase Order Actions
  const handleOpenPOModal = () => {
    setPoForm({
      warehouse: warehouses[0]?.id || '',
      supplier_name: 'Geneva Horology Atelier',
      variant_id: inventoryList[0]?.variant || '',
      qty_ordered: 20,
      unit_cost: '450.00',
      notes: 'Scheduled manufacturing shipment',
    });
    setShowPOModal(true);
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poForm.warehouse || !poForm.supplier_name || !poForm.variant_id) {
      showToast('Warehouse, supplier and variant are required', 'error');
      return;
    }
    try {
      const created = await API.PurchaseOrder.create({
        warehouse: poForm.warehouse,
        supplier_name: poForm.supplier_name,
        notes: poForm.notes,
        items: [
          {
            variant: poForm.variant_id,
            qty_ordered: Number(poForm.qty_ordered),
            unit_cost: poForm.unit_cost,
          },
        ],
      });
      setPurchaseOrders([created, ...purchaseOrders]);
      showToast(`Purchase order created for ${poForm.supplier_name}`);
      setShowPOModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to create PO', 'error');
    }
  };

  const handleReceivePO = async (poId: string) => {
    try {
      const res = await API.PurchaseOrder.receive(poId);
      setPurchaseOrders(purchaseOrders.map((p) => (p.id === res.id ? res : p)));
      showToast('Purchase order received and inventory replenished.');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to receive PO', 'error');
    }
  };

  // Sprint 7 Allocation Simulator Execution
  const handleRunAllocationSim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocForm.variant_id) {
      showToast('Variant UUID is required for allocation simulation', 'error');
      return;
    }
    setSimLoading(true);
    try {
      const res = await API.Allocation.preview({
        items: [{ variant_id: allocForm.variant_id, quantity: Number(allocForm.quantity) }],
        latitude: Number(allocForm.latitude),
        longitude: Number(allocForm.longitude),
      });
      setAllocResult(res);
      showToast('Allocation simulation evaluated successfully.');
    } catch (err: any) {
      showToast(err.message || 'Simulation failed', 'error');
    } finally {
      setSimLoading(false);
    }
  };

  // Filtered inventories
  const filteredInventory = inventoryList.filter((inv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (inv.variant_sku && inv.variant_sku.toLowerCase().includes(q)) ||
      (inv.product_title && inv.product_title.toLowerCase().includes(q))
    );
  });

  const activeReservationsCount = reservations.filter((r) => r.status === 'HELD').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center space-x-2 transition-all duration-300 ${
            toast.type === 'error'
              ? 'bg-red-600 text-white shadow-red-500/20'
              : 'bg-gray-900 text-white shadow-gray-900/30'
          }`}
        >
          <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h1 className="text-3xl font-serif font-bold text-gray-900">Warehouse & Inventory Operations</h1>
            <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-semibold rounded-full border border-amber-200">
              Sprint 7 Active
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Multi-node facility management, real-time stock levels, smart Haversine routing, and transactional reservations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenCreateFacility}
            className="flex items-center px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-800 text-sm font-medium rounded-xl shadow-sm hover:shadow transition"
          >
            <Icon name="plus" className="w-4 h-4 mr-1.5 text-gray-500" /> Add Facility
          </button>
          <button
            onClick={() => handleOpenAdjustModal()}
            className="flex items-center px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-sm font-medium rounded-xl shadow-sm transition"
          >
            <span className="mr-1.5">⚡</span> Adjust Stock
          </button>
          <button
            onClick={handleOpenTransferModal}
            className="flex items-center px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-800 text-sm font-medium rounded-xl shadow-sm hover:shadow transition"
          >
            <span className="mr-1.5">⇄</span> Transfer Stock
          </button>
          <button
            onClick={handleOpenPOModal}
            className="flex items-center px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-xl shadow-md transition"
          >
            <Icon name="plus" className="w-4 h-4 mr-1.5 text-amber-400" /> New Purchase Order
          </button>
        </div>
      </div>

      {/* High-Level Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Facilities</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {warehouses.filter((w) => w.is_active).length}
              <span className="text-xs font-normal text-gray-400 ml-1.5">/ {warehouses.length}</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Icon name="warehouse" className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Holds</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{activeReservationsCount}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-base">
            🔒
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Low Stock Warnings</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{lowStockList.length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-base">
            ⚠️
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Transfers</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {transfers.filter((t) => t.status === 'in_transit' || t.status === 'pending').length}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Icon name="truck" className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Open POs</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {purchaseOrders.filter((p) => p.status === 'ordered' || p.status === 'partially_received').length}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Icon name="package" className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('facilities')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'facilities'
              ? 'border-gray-900 text-gray-900 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Facilities ({warehouses.length})
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'inventory'
              ? 'border-gray-900 text-gray-900 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Live Inventory ({inventoryList.length})
        </button>

        <button
          onClick={() => setActiveTab('reservations_routing')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 flex items-center transition ${
            activeTab === 'reservations_routing'
              ? 'border-amber-600 text-amber-700 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          🔒 Reservations & Smart Routing
          {activeReservationsCount > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-bold">
              {activeReservationsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('low_stock')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 flex items-center transition ${
            activeTab === 'low_stock'
              ? 'border-rose-600 text-rose-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Low Stock Alerts
          {lowStockList.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-rose-100 text-rose-700 font-bold">
              {lowStockList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'transfers'
              ? 'border-gray-900 text-gray-900 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Transfers ({transfers.length})
        </button>

        <button
          onClick={() => setActiveTab('purchase_orders')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'purchase_orders'
              ? 'border-gray-900 text-gray-900 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Purchase Orders ({purchaseOrders.length})
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-900 border-t-transparent mb-3"></div>
          <p className="text-gray-500 text-sm">Syncing operations and inventory network...</p>
        </div>
      )}

      {/* TAB 1: Facilities */}
      {!loading && activeTab === 'facilities' && (
        <div>
          {warehouses.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                <Icon name="warehouse" className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">No Warehouse Facilities Configured</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                Set up regional fulfillment centers and storage vaults to begin tracking stock across multiple facilities.
              </p>
              <button
                onClick={handleOpenCreateFacility}
                className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition"
              >
                + Add First Facility
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {warehouses.map((wh) => (
                <div
                  key={wh.id}
                  className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-serif font-bold text-gray-900">{wh.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {wh.city}, {wh.country}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                          wh.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {wh.is_active ? 'Active Node' : 'Inactive'}
                      </span>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl mb-4 text-xs text-gray-600 space-y-1">
                      <p className="font-mono">{wh.address_line1}</p>
                      {wh.address_line2 && <p className="font-mono">{wh.address_line2}</p>}
                      <p>
                        {wh.city}, {wh.state} {wh.postal_code}
                      </p>
                      <p className="text-[11px] text-gray-400 font-mono pt-1">
                        Coords: {wh.latitude || '0.00'}, {wh.longitude || '0.00'}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
                    <button
                      onClick={async () => {
                        setSelectedWarehouseFilter(wh.id);
                        const inv = await API.Warehouse.getInventory(wh.id);
                        setInventoryList(inv || []);
                        setActiveTab('inventory');
                      }}
                      className="text-xs font-semibold text-gray-900 hover:text-amber-700 flex items-center"
                    >
                      <span className="mr-1">📦</span> Inspect Stock
                    </button>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenEditFacility(wh)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                        title="Edit Facility"
                      >
                        <Icon name="edit" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFacility(wh)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        title="Delete Facility"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Live Inventory */}
      {!loading && activeTab === 'inventory' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Filter by SKU or Title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent w-64"
                />
              </div>

              <select
                value={selectedWarehouseFilter}
                onChange={(e) => handleWarehouseFilterChange(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleOpenAdjustModal()}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition flex items-center self-start sm:self-auto"
            >
              + Mutate Stock
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">SKU & Item</th>
                  <th className="px-6 py-3.5">Facility</th>
                  <th className="px-6 py-3.5 text-right">On Hand</th>
                  <th className="px-6 py-3.5 text-right">Reserved Hold</th>
                  <th className="px-6 py-3.5 text-right">Available to Promise</th>
                  <th className="px-6 py-3.5 text-right">Threshold</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400 text-sm">
                      No stock records found for this facility. Click "Mutate Stock" to initialize on-hand quantities.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => {
                    const isLow = item.on_hand <= item.reorder_threshold;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/70 transition">
                        <td className="px-6 py-4">
                          <p className="font-mono font-bold text-gray-900 text-xs">{item.variant_sku || 'N/A'}</p>
                          <p className="text-xs text-gray-500 truncate max-w-xs">{item.product_title || 'Variant'}</p>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-600">{item.warehouse_name}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">{item.on_hand}</td>
                        <td className="px-6 py-4 text-right text-amber-600 font-semibold">{item.reserved_cache}</td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-600">{item.available}</td>
                        <td className="px-6 py-4 text-right text-gray-400 text-xs">{item.reorder_threshold}</td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                              item.available === 0
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : isLow
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {item.available === 0 ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleOpenAdjustModal(item)}
                            className="text-xs font-semibold text-gray-900 hover:text-amber-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition"
                          >
                            Adjust
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Reservations & Smart Routing (Sprint 7) */}
      {!loading && activeTab === 'reservations_routing' && (
        <div className="space-y-8">
          {/* Smart Allocation Simulator */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-100 gap-2 mb-6">
              <div>
                <h3 className="text-lg font-serif font-bold text-gray-900">⚡ Haversine Smart Allocation Engine Simulator</h3>
                <p className="text-xs text-gray-500">
                  Calculates Great-Circle distances, prioritizes single-facility fulfillment, and outputs fulfillment splits.
                </p>
              </div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-full self-start">
                Pure Function (No Writes)
              </span>
            </div>

            <form onSubmit={handleRunAllocationSim} className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm mb-6">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Product Variant UUID
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste Variant UUID"
                  value={allocForm.variant_id}
                  onChange={(e) => setAllocForm({ ...allocForm, variant_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Requested Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={allocForm.quantity}
                  onChange={(e) => setAllocForm({ ...allocForm, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Destination Lat / Lon
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Lat"
                    value={allocForm.latitude}
                    onChange={(e) => setAllocForm({ ...allocForm, latitude: Number(e.target.value) })}
                    className="w-1/2 px-2 py-2 border border-gray-200 rounded-xl text-xs"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Lon"
                    value={allocForm.longitude}
                    onChange={(e) => setAllocForm({ ...allocForm, longitude: Number(e.target.value) })}
                    className="w-1/2 px-2 py-2 border border-gray-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="sm:col-span-4 flex justify-end">
                <button
                  type="submit"
                  disabled={simLoading}
                  className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center"
                >
                  {simLoading ? 'Calculating Geodesic Routes...' : 'Run Smart Allocation Evaluation'}
                </button>
              </div>
            </form>

            {allocResult && (
              <div className="mt-4 p-5 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-3 py-1 font-bold rounded-full ${
                        allocResult.feasible
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {allocResult.feasible ? '✓ FEASIBLE' : '⚠️ UNFEASIBLE (DEFICIT)'}
                    </span>
                    <span className="font-semibold text-gray-700">
                      Total Shipping Splits: {allocResult.total_splits}
                    </span>
                  </div>
                </div>

                {allocResult.splits.map((split, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 mb-3 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-bold text-gray-900">
                        Facility: {split.warehouse_name}
                      </p>
                      <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 font-mono rounded font-semibold text-[11px]">
                        {split.distance_km} km away
                      </span>
                    </div>
                    <ul className="divide-y divide-gray-100 text-gray-600">
                      {split.items.map((itm, i) => (
                        <li key={i} className="py-1.5 flex justify-between">
                          <span>
                            <strong className="font-mono text-gray-900">{itm.sku}</strong> — {itm.product_title}
                          </span>
                          <span className="font-bold text-emerald-600">Allocated: {itm.quantity} units</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {allocResult.unallocated && allocResult.unallocated.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 mt-2">
                    <p className="font-bold mb-1">Unallocated Shortages:</p>
                    {allocResult.unallocated.map((un, idx) => (
                      <p key={idx}>
                        SKU {un.sku}: Needed {un.requested}, Allocated {un.allocated} (Deficit: -{un.deficit})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active / Historical Reservations Ledger */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Transactional Inventory Reservations (15-Min TTL Holds)</h3>
                <p className="text-xs text-gray-500">
                  Holds created during checkout. Swept automatically every 60s upon expiration.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Reservation ID</th>
                    <th className="px-6 py-3.5">SKU & Item</th>
                    <th className="px-6 py-3.5">Facility</th>
                    <th className="px-6 py-3.5 text-right">Held Quantity</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Hold Expiration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {reservations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                        No reservation holds recorded. Holds are created dynamically when customers proceed to checkout.
                      </td>
                    </tr>
                  ) : (
                    reservations.map((res) => (
                      <tr key={res.id} className="hover:bg-gray-50/70 transition">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{res.id.slice(0, 8)}...</td>
                        <td className="px-6 py-4">
                          <p className="font-mono font-bold text-gray-900 text-xs">{res.variant_sku}</p>
                          <p className="text-xs text-gray-500">{res.product_title}</p>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-700">{res.warehouse_name}</td>
                        <td className="px-6 py-4 text-right font-bold text-amber-600">{res.quantity}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                              res.status === 'COMMITTED'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : res.status === 'HELD'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : res.status === 'EXPIRED'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {res.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                          {new Date(res.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Low Stock Warnings */}
      {!loading && activeTab === 'low_stock' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Inventory Depletion Threshold Triggers</h3>
              <p className="text-xs text-gray-500">Items whose on-hand quantity has breached safe operating levels.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-rose-50/50 text-xs font-semibold text-rose-900 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Item & SKU</th>
                  <th className="px-6 py-3.5">Facility</th>
                  <th className="px-6 py-3.5 text-right">Current On-Hand</th>
                  <th className="px-6 py-3.5 text-right">Safety Threshold</th>
                  <th className="px-6 py-3.5 text-right">Deficit</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {lowStockList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-emerald-600 text-sm font-medium">
                      ✓ All inventory nodes are well-stocked. No low stock warnings currently active!
                    </td>
                  </tr>
                ) : (
                  lowStockList.map((item) => {
                    const deficit = item.reorder_threshold - item.on_hand;
                    return (
                      <tr key={item.id} className="hover:bg-rose-50/20 transition">
                        <td className="px-6 py-4">
                          <p className="font-mono font-bold text-gray-900 text-xs">{item.variant_sku || 'N/A'}</p>
                          <p className="text-xs text-gray-500">{item.product_title}</p>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-700">{item.warehouse_name}</td>
                        <td className="px-6 py-4 text-right font-bold text-rose-600">{item.on_hand}</td>
                        <td className="px-6 py-4 text-right font-medium text-gray-600">{item.reorder_threshold}</td>
                        <td className="px-6 py-4 text-right text-xs font-semibold text-rose-700">
                          {deficit > 0 ? `-${deficit} units` : 'At threshold'}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => handleQuickRestock(item, 50)}
                            className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition"
                          >
                            + Restock 50 Units
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: Stock Transfers */}
      {!loading && activeTab === 'transfers' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Inter-Warehouse Balance Transfers</h3>
              <p className="text-xs text-gray-500">Track node-to-node dispatches and inbound confirmations.</p>
            </div>
            <button
              onClick={handleOpenTransferModal}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition"
            >
              + Initiate Transfer
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Transfer Route</th>
                  <th className="px-6 py-3.5">Items</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Initiator</th>
                  <th className="px-6 py-3.5">Notes</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                      No stock transfers initiated. Click "+ Initiate Transfer" to route stock between nodes.
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900 text-xs">{t.from_warehouse_name}</p>
                        <p className="text-gray-400 text-xs font-mono">↳ to {t.to_warehouse_name}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-gray-700">
                        {t.items?.length || 0} SKU lines
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                            t.status === 'received'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : t.status === 'in_transit'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : t.status === 'cancelled'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {t.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{t.requested_by_name || 'Operations'}</td>
                      <td className="px-6 py-4 text-xs text-gray-400 italic max-w-xs truncate">{t.notes || '—'}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {t.status === 'pending' && (
                          <button
                            onClick={() => handleDispatchTransfer(t.id)}
                            className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg transition"
                          >
                            Dispatch
                          </button>
                        )}
                        {t.status === 'in_transit' && (
                          <button
                            onClick={() => handleReceiveTransfer(t.id)}
                            className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg transition"
                          >
                            Receive
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: Purchase Orders */}
      {!loading && activeTab === 'purchase_orders' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Inbound Supplier Purchase Orders</h3>
              <p className="text-xs text-gray-500">Procurement shipments scheduled from manufacturers.</p>
            </div>
            <button
              onClick={handleOpenPOModal}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition"
            >
              + New Purchase Order
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Supplier & Destination</th>
                  <th className="px-6 py-3.5">Items</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Notes</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">
                      No inbound purchase orders recorded. Click "+ New Purchase Order" to log a supplier order.
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900 text-xs">{po.supplier_name}</p>
                        <p className="text-gray-500 text-xs">Facility: {po.warehouse_name}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-gray-700">
                        {po.items?.length || 0} Line Items
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                            po.status === 'received'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : po.status === 'ordered'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {po.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 italic max-w-xs truncate">{po.notes || '—'}</td>
                      <td className="px-6 py-4 text-right">
                        {po.status === 'ordered' && (
                          <button
                            onClick={() => handleReceivePO(po.id)}
                            className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition"
                          >
                            Receive Inbound
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Add / Edit Facility */}
      {showFacilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <h3 className="text-xl font-serif font-bold text-gray-900">
                {editingWarehouse ? 'Edit Facility Node' : 'Register New Facility'}
              </h3>
              <button
                onClick={() => setShowFacilityModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFacility} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Facility Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Geneva Central Vault"
                  value={facilityForm.name}
                  onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="12 Quai du Mont-Blanc"
                  value={facilityForm.address_line1}
                  onChange={(e) => setFacilityForm({ ...facilityForm, address_line1: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">City</label>
                  <input
                    type="text"
                    required
                    placeholder="Geneva"
                    value={facilityForm.city}
                    onChange={(e) => setFacilityForm({ ...facilityForm, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    State / Region
                  </label>
                  <input
                    type="text"
                    placeholder="GE"
                    value={facilityForm.state}
                    onChange={(e) => setFacilityForm({ ...facilityForm, state: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="1201"
                    value={facilityForm.postal_code}
                    onChange={(e) => setFacilityForm({ ...facilityForm, postal_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Country</label>
                  <input
                    type="text"
                    required
                    value={facilityForm.country}
                    onChange={(e) => setFacilityForm({ ...facilityForm, country: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center pt-2">
                <input
                  type="checkbox"
                  id="facilityActive"
                  checked={facilityForm.is_active}
                  onChange={(e) => setFacilityForm({ ...facilityForm, is_active: e.target.checked })}
                  className="rounded text-gray-900 focus:ring-gray-900 mr-2"
                />
                <label htmlFor="facilityActive" className="text-xs font-medium text-gray-700">
                  Node is active and accepting inventory allocations
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowFacilityModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-semibold shadow-md"
                >
                  {editingWarehouse ? 'Save Changes' : 'Create Facility'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Adjust Stock Level */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <h3 className="text-xl font-serif font-bold text-gray-900">Stock Mutation Service</h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Target Facility
                </label>
                <select
                  value={adjustForm.warehouse_id}
                  onChange={(e) => setAdjustForm({ ...adjustForm, warehouse_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  required
                >
                  <option value="">Select Warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Product Variant UUID
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste Variant UUID"
                  value={adjustForm.variant_id}
                  onChange={(e) => setAdjustForm({ ...adjustForm, variant_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Quantity Delta (+ / -)
                  </label>
                  <input
                    type="number"
                    required
                    value={adjustForm.quantity_delta}
                    onChange={(e) => setAdjustForm({ ...adjustForm, quantity_delta: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  />
                  <div className="flex gap-1 mt-1">
                    {[-10, -1, 5, 25, 100].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAdjustForm({ ...adjustForm, quantity_delta: v })}
                        className="text-[10px] px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                      >
                        {v > 0 ? `+${v}` : v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Mutation Type
                  </label>
                  <select
                    value={adjustForm.movement_type}
                    onChange={(e) => setAdjustForm({ ...adjustForm, movement_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  >
                    <option value="manual_adjustment">Manual Adjustment</option>
                    <option value="restock">Restock Inbound</option>
                    <option value="damage_writeoff">Damage Write-off</option>
                    <option value="shrinkage">Shrinkage / Audit Correction</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Audit Reason (Mandatory for log trail)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Quarterly physical cycle count reconciliation"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-md"
                >
                  Execute Mutation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Inter-Warehouse Transfer */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <h3 className="text-xl font-serif font-bold text-gray-900">Initiate Inter-Warehouse Transfer</h3>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    From Warehouse
                  </label>
                  <select
                    value={transferForm.from_warehouse}
                    onChange={(e) => setTransferForm({ ...transferForm, from_warehouse: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                    required
                  >
                    <option value="">Select Origin</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    To Warehouse
                  </label>
                  <select
                    value={transferForm.to_warehouse}
                    onChange={(e) => setTransferForm({ ...transferForm, to_warehouse: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                    required
                  >
                    <option value="">Select Destination</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Variant UUID
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste Variant UUID"
                  value={transferForm.variant_id}
                  onChange={(e) => setTransferForm({ ...transferForm, variant_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Transfer Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm({ ...transferForm, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Dispatch Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Courier tracking #FX-88421"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-semibold shadow-md"
                >
                  Create Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Inbound Purchase Order */}
      {showPOModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <h3 className="text-xl font-serif font-bold text-gray-900">Create Supplier Purchase Order</h3>
              <button onClick={() => setShowPOModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Receiving Facility
                </label>
                <select
                  value={poForm.warehouse}
                  onChange={(e) => setPoForm({ ...poForm, warehouse: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  required
                >
                  <option value="">Select Warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Manufacturer / Supplier Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maison de Haute Horlogerie"
                  value={poForm.supplier_name}
                  onChange={(e) => setPoForm({ ...poForm, supplier_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Variant UUID
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste Variant UUID"
                  value={poForm.variant_id}
                  onChange={(e) => setPoForm({ ...poForm, variant_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Units Ordered
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={poForm.qty_ordered}
                    onChange={(e) => setPoForm({ ...poForm, qty_ordered: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Unit Cost ($)
                  </label>
                  <input
                    type="text"
                    required
                    value={poForm.unit_cost}
                    onChange={(e) => setPoForm({ ...poForm, unit_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Delivery terms or batch identifier"
                  value={poForm.notes}
                  onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowPOModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-semibold shadow-md"
                >
                  Submit Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseManagementPage;
