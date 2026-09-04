import React, { useState, useEffect } from 'react';
import API, { CommissionRuleItem, VendorProfile } from '../../../services/api';
import { Icon } from '../../../components/Icon';

export const CommissionManagementPage: React.FC = () => {
  const [rules, setRules] = useState<CommissionRuleItem[]>([]);
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState({
    vendor: '' as string,
    rate_pct: '15.00',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    is_active: true,
    note: '',
  });
  const [saving, setSaving] = useState<boolean>(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesData, vendorsData] = await Promise.all([
        API.Admin.getCommissionRules(),
        API.Admin.getVendors({ status: 'active' }),
      ]);
      setRules(rulesData || []);
      setVendors(vendorsData || []);
    } catch (err: any) {
      console.error('Failed to load commission rules:', err);
      showToast(err.message || 'Failed to load commission rules', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingRuleId(null);
    setRuleForm({
      vendor: '',
      rate_pct: '15.00',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: '',
      is_active: true,
      note: '',
    });
    setShowModal(true);
  };

  const openEditModal = (rule: CommissionRuleItem) => {
    setEditingRuleId(rule.id || null);
    setRuleForm({
      vendor: rule.vendor || '',
      rate_pct: String(rule.rate_pct),
      effective_from: rule.effective_from ? rule.effective_from.split('T')[0] : '',
      effective_to: rule.effective_to ? rule.effective_to.split('T')[0] : '',
      is_active: rule.is_active,
      note: rule.note || '',
    });
    setShowModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        vendor: ruleForm.vendor || null,
        rate_pct: parseFloat(ruleForm.rate_pct),
        effective_from: ruleForm.effective_from,
        effective_to: ruleForm.effective_to || null,
        is_active: ruleForm.is_active,
        note: ruleForm.note,
      };

      if (editingRuleId) {
        const updated = await API.Admin.updateCommissionRule(editingRuleId, payload);
        setRules((prev) => prev.map((r) => (r.id === editingRuleId ? updated : r)));
        showToast('Commission rule updated.');
      } else {
        const created = await API.Admin.createCommissionRule(payload);
        setRules((prev) => [created, ...prev]);
        showToast('Commission rule created.');
      }
      setShowModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save commission rule', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this commission rule?')) return;
    try {
      await API.Admin.deleteCommissionRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      showToast('Commission rule deleted.');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete commission rule', 'error');
    }
  };

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 text-sm font-medium border ${
            toast.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <Icon name={toast.type === 'error' ? 'x' : 'check'} className="w-5 h-5" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 font-serif">Commission Rules & Rates</h1>
          <p className="text-gray-600 text-sm mt-1">
            Configure platform baseline commission and tailored per-merchant fee schedules.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center space-x-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors shadow-sm"
        >
          <Icon name="plus" className="w-4 h-4" />
          <span>Create Commission Rule</span>
        </button>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-primary mb-2" />
            <p className="text-sm">Loading commission rules...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-16 text-center text-gray-500">
            <Icon name="cart" className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-base font-semibold text-gray-700">No commission rules defined</p>
            <p className="text-xs text-gray-400 mt-1">
              Create a platform default rule (e.g. 15%) or vendor-specific rates.
            </p>
            <button
              onClick={openCreateModal}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary-hover transition-colors"
            >
              Create Default Rule
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Target Scope</th>
                <th className="px-6 py-4">Commission Fee</th>
                <th className="px-6 py-4">Effective Dates</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Notes</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-6 py-4">
                    {rule.vendor ? (
                      <div>
                        <span className="font-semibold text-gray-900">
                          {rule.vendor_name || 'Vendor Custom'}
                        </span>
                        <span className="block text-xs text-gray-400 font-mono">
                          ID: {rule.vendor.substring(0, 8)}...
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        Platform Baseline Default
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4 font-bold text-gray-900 text-base">
                    {rule.rate_pct}%
                  </td>

                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div>From: {rule.effective_from ? rule.effective_from.split('T')[0] : 'Immediate'}</div>
                    <div className="text-gray-400">
                      To: {rule.effective_to ? rule.effective_to.split('T')[0] : 'Ongoing'}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        rule.is_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                    {rule.note || '—'}
                  </td>

                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => openEditModal(rule)}
                      className="px-2.5 py-1 text-xs font-semibold text-primary hover:text-primary-hover bg-primary/10 rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id!)}
                      className="px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-100 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-lg font-bold text-gray-900 font-serif">
                {editingRuleId ? 'Edit Commission Rule' : 'Create Commission Rule'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-dark">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Scope Target
                </label>
                <select
                  value={ruleForm.vendor}
                  onChange={(e) => setRuleForm({ ...ruleForm, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary"
                >
                  <option value="">Platform Default (Applies to all vendors)</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.display_name} ({v.legal_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Commission Rate Percentage (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={ruleForm.rate_pct}
                  onChange={(e) => setRuleForm({ ...ruleForm, rate_pct: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Effective From
                  </label>
                  <input
                    type="date"
                    required
                    value={ruleForm.effective_from}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, effective_from: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Effective To (Optional)
                  </label>
                  <input
                    type="date"
                    value={ruleForm.effective_to}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, effective_to: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Rule Note / Justification
                </label>
                <input
                  type="text"
                  value={ruleForm.note}
                  onChange={(e) => setRuleForm({ ...ruleForm, note: e.target.value })}
                  placeholder="e.g. Standard 15% luxury marketplace fee"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active_toggle"
                  checked={ruleForm.is_active}
                  onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                  className="rounded text-primary focus:ring-primary"
                />
                <label htmlFor="is_active_toggle" className="text-xs font-semibold text-gray-700">
                  Rule is active and enforceable
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionManagementPage;
