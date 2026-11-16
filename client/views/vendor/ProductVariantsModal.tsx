import React, { useState, useEffect, useCallback } from 'react';
import {
  VariantAPI,
  AttributeAPI,
  ProductVariant,
  ProductAttribute,
  ProductListItem,
} from '../../services/api';
import { Icon } from '../../components/Icon';

interface ProductVariantsModalProps {
  product: ProductListItem;
  onClose: () => void;
}

type ModalTab = 'variants' | 'generate' | 'add_single';

export const ProductVariantsModal: React.FC<ProductVariantsModalProps> = ({ product, onClose }) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('variants');
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Matrix Generator State
  // Map of attribute_id -> Set of selected value_ids
  const [selectedValues, setSelectedValues] = useState<Record<string, string[]>>({});
  const [matrixPrice, setMatrixPrice] = useState(product.base_price || '0.00');
  const [matrixPrefix, setMatrixPrefix] = useState('');

  // Single Variant State
  const [singleForm, setSingleForm] = useState({
    sku: '',
    price: product.base_price || '0.00',
    compare_at_price: '',
    barcode: '',
    selected_attribute_values: [] as string[],
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [varList, attrList] = await Promise.all([
        VariantAPI.list(product.id),
        AttributeAPI.list(),
      ]);
      setVariants(varList);
      setAttributes(attrList);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load variants/attributes', 'error');
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate combinations count
  const activeAttributeGroups: string[][] = Object.keys(selectedValues)
    .map((k) => selectedValues[k] || [])
    .filter((vals) => vals.length > 0);
  const projectedCount = activeAttributeGroups.length > 0
    ? activeAttributeGroups.reduce((acc: number, curr: string[]) => acc * curr.length, 1)
    : 0;

  // Toggle value selection for matrix generator
  const handleToggleValue = (attrId: string, valId: string) => {
    setSelectedValues((prev) => {
      const current = prev[attrId] || [];
      const updated = current.includes(valId)
        ? current.filter((id) => id !== valId)
        : [...current, valId];
      return { ...prev, [attrId]: updated };
    });
  };

  // Run Cartesian Matrix Generation
  const handleGenerateMatrix = async () => {
    if (projectedCount === 0) {
      showToast('Select at least one attribute value to generate variants', 'error');
      return;
    }
    try {
      setActionLoading(true);
      const res = await VariantAPI.generate(product.id, {
        attribute_groups: activeAttributeGroups,
        base_price: matrixPrice,
        sku_prefix: matrixPrefix.trim() || undefined,
      });
      showToast(res.detail || `Generated ${res.count} variants!`);
      setActiveTab('variants');
      loadData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate variants', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Add Single Variant
  const handleAddSingle = async () => {
    if (!singleForm.sku.trim()) {
      showToast('SKU is required', 'error');
      return;
    }
    if (!singleForm.price || isNaN(Number(singleForm.price))) {
      showToast('Valid price is required', 'error');
      return;
    }
    try {
      setActionLoading(true);
      await VariantAPI.create(product.id, {
        sku: singleForm.sku.trim(),
        price: singleForm.price,
        compare_at_price: singleForm.compare_at_price || undefined,
        barcode: singleForm.barcode || undefined,
        attribute_value_ids: singleForm.selected_attribute_values,
        is_active: true,
      });
      showToast('Variant created successfully');
      setSingleForm({
        sku: '',
        price: product.base_price || '0.00',
        compare_at_price: '',
        barcode: '',
        selected_attribute_values: [],
      });
      setActiveTab('variants');
      loadData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to create variant', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Variant
  const handleDeleteVariant = async (variantId: string, sku: string) => {
    if (!window.confirm(`Delete variant "${sku}"?`)) return;
    try {
      setActionLoading(true);
      await VariantAPI.delete(product.id, variantId);
      showToast(`Variant ${sku} deleted`);
      loadData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete variant', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (v: ProductVariant) => {
    try {
      await VariantAPI.update(product.id, v.id, { is_active: !v.is_active });
      loadData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update variant status', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl my-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed bottom-8 right-8 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 text-sm font-medium border ${
              toast.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <Icon name={toast.type === 'error' ? 'x' : 'check'} className="w-5 h-5" />
            <span>{toast.message}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-white">
          <div>
            <h3 className="text-xl font-serif font-bold text-dark">
              Manage Variants: <span className="font-sans font-semibold text-gray-800">{product.title}</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Base Price: ${parseFloat(product.base_price || '0').toFixed(2)} · Total Variants: {variants.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-dark hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-200 px-6 bg-gray-50/50">
          {[
            { id: 'variants', label: `Variants List (${variants.length})`, icon: 'products' },
            { id: 'generate', label: 'Matrix Generator (Cartesian)', icon: 'plus' },
            { id: 'add_single', label: 'Add Single Variant', icon: 'edit' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ModalTab)}
              className={`flex items-center space-x-2 py-3.5 px-4 text-xs font-semibold border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-dark text-dark bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon name={tab.icon as any} className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              <div className="w-8 h-8 border-2 border-dark border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading product variants and attributes...
            </div>
          ) : (
            <>
              {/* ── TAB 1: VARIANTS LIST ─────────────────────────────────── */}
              {activeTab === 'variants' && (
                <div>
                  {variants.length === 0 ? (
                    <div className="py-14 text-center border-2 border-dashed border-gray-200 rounded-2xl">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                        <Icon name="products" className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-semibold text-gray-800">No variants created yet</h4>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                        This product is currently listed with only its base SKU. Use the Matrix Generator to create size/color combinations.
                      </p>
                      <button
                        onClick={() => setActiveTab('generate')}
                        className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 bg-dark text-white rounded-lg text-xs font-semibold hover:bg-gray-800"
                      >
                        <Icon name="plus" className="w-3.5 h-3.5" />
                        <span>Launch Matrix Generator</span>
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            <th className="py-3 px-3">SKU</th>
                            <th className="py-3 px-3">Attributes</th>
                            <th className="py-3 px-3">Price</th>
                            <th className="py-3 px-3">Status</th>
                            <th className="py-3 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                          {variants.map((v) => (
                            <tr key={v.id} className="hover:bg-gray-50/50">
                              <td className="py-3.5 px-3 font-mono font-medium text-gray-900">
                                {v.sku}
                              </td>
                              <td className="py-3.5 px-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {v.attributes && v.attributes.length > 0 ? (
                                    v.attributes.map((attr, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-[11px]"
                                      >
                                        <strong className="mr-1 text-gray-500">{attr.attribute_name}:</strong>
                                        {attr.value}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 italic">No attributes</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-3 font-mono font-semibold text-gray-900">
                                ${parseFloat(v.price).toFixed(2)}
                              </td>
                              <td className="py-3.5 px-3">
                                <button
                                  onClick={() => handleToggleActive(v)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    v.is_active
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-gray-100 text-gray-500 border-gray-200'
                                  }`}
                                >
                                  {v.is_active ? 'Active' : 'Inactive'}
                                </button>
                              </td>
                              <td className="py-3.5 px-3 text-right">
                                <button
                                  onClick={() => handleDeleteVariant(v.id, v.sku)}
                                  className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 transition-colors"
                                  title="Delete Variant"
                                >
                                  <Icon name="trash" className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 2: CARTESIAN GENERATOR ────────────────────────────── */}
              {activeTab === 'generate' && (
                <div className="space-y-6">
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200/70 text-xs text-amber-900">
                    <p className="font-semibold mb-0.5">Automated Combinatorial Generator</p>
                    <p>
                      Check the attribute values below (e.g. colors and sizes). LuxeLane will calculate the Cartesian product and auto-create unique SKU entries for every permutation.
                    </p>
                  </div>

                  {attributes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-xs">
                      No attributes found in catalog. Platform admins can define attributes in the admin portal.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {attributes.map((attr) => (
                        <div key={attr.id} className="p-4 rounded-xl border border-gray-200 bg-white">
                          <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">
                            {attr.name}
                          </h4>
                          {attr.values && attr.values.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {attr.values.map((val) => {
                                const isSelected = (selectedValues[attr.id] || []).includes(val.id);
                                return (
                                  <button
                                    key={val.id}
                                    type="button"
                                    onClick={() => handleToggleValue(attr.id, val.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                      isSelected
                                        ? 'bg-dark text-white border-dark shadow-sm'
                                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                    }`}
                                  >
                                    {val.value}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No values defined for {attr.name}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Default Variant Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={matrixPrice}
                        onChange={(e) => setMatrixPrice(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-xs focus:ring-1 focus:ring-dark"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Custom SKU Prefix (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. LUXE-SUIT"
                        value={matrixPrefix}
                        onChange={(e) => setMatrixPrefix(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-xs focus:ring-1 focus:ring-dark"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-gray-500">Projected Combinations:</span>{' '}
                      <strong className="text-dark text-sm font-bold ml-1">{projectedCount} variants</strong>
                    </div>
                    <button
                      type="button"
                      disabled={actionLoading || projectedCount === 0}
                      onClick={handleGenerateMatrix}
                      className="px-5 py-2 bg-dark text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {actionLoading ? 'Generating Matrix...' : `Generate ${projectedCount} Combinations`}
                    </button>
                  </div>
                </div>
              )}

              {/* ── TAB 3: ADD SINGLE VARIANT ────────────────────────────── */}
              {activeTab === 'add_single' && (
                <div className="space-y-4 max-w-lg">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      SKU Code *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ATELIER-RING-08"
                      value={singleForm.sku}
                      onChange={(e) => setSingleForm({ ...singleForm, sku: e.target.value })}
                      className="w-full px-3.5 py-2 border rounded-lg text-xs focus:ring-1 focus:ring-dark font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Price ($) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={singleForm.price}
                        onChange={(e) => setSingleForm({ ...singleForm, price: e.target.value })}
                        className="w-full px-3.5 py-2 border rounded-lg text-xs focus:ring-1 focus:ring-dark"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Compare At Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Optional"
                        value={singleForm.compare_at_price}
                        onChange={(e) => setSingleForm({ ...singleForm, compare_at_price: e.target.value })}
                        className="w-full px-3.5 py-2 border rounded-lg text-xs focus:ring-1 focus:ring-dark"
                      />
                    </div>
                  </div>

                  {attributes.map((attr) => (
                    <div key={attr.id}>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {attr.name}
                      </label>
                      <select
                        onChange={(e) => {
                          const valId = e.target.value;
                          if (!valId) return;
                          setSingleForm({
                            ...singleForm,
                            selected_attribute_values: [
                              ...singleForm.selected_attribute_values.filter(
                                (id) => !attr.values.map((v) => v.id).includes(id)
                              ),
                              valId,
                            ],
                          });
                        }}
                        className="w-full px-3.5 py-2 border rounded-lg text-xs focus:ring-1 focus:ring-dark"
                      >
                        <option value="">Select {attr.name}</option>
                        {attr.values.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.value}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <div className="pt-3">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleAddSingle}
                      className="px-5 py-2 bg-dark text-white rounded-lg text-xs font-semibold hover:bg-gray-800 disabled:opacity-50 shadow-sm"
                    >
                      {actionLoading ? 'Creating...' : 'Create Variant'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
