import React, { useState, useEffect } from 'react';
import API, { VendorProfile } from '../../../services/api';
import { Icon } from '../../../components/Icon';

interface VendorDetailModalData extends VendorProfile {
  documents?: any[];
}

export const VendorManagementPage: React.FC = () => {
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Detail Modal & Rejection Modal State
  const [selectedVendor, setSelectedVendor] = useState<VendorDetailModalData | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [vendorToReject, setVendorToReject] = useState<VendorProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Document Review State
  const [reviewingDoc, setReviewingDoc] = useState<any | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState<string>('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const params: { status?: string; search?: string } = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const data = await API.Admin.getVendors(params);
      setVendors(data || []);
    } catch (err: any) {
      console.error('Failed to load vendors:', err);
      showToast(err.message || 'Failed to load vendors list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVendors();
  };

  const handleUpdateStatus = async (
    vendorId: string,
    status: 'active' | 'suspended' | 'rejected',
    reason?: string
  ) => {
    setActionLoading(vendorId);
    try {
      const updated = await API.Admin.updateVendorStatus(vendorId, {
        status,
        rejection_reason: reason || '',
      });

      setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, ...updated } : v)));
      if (selectedVendor && selectedVendor.id === vendorId) {
        setSelectedVendor({ ...selectedVendor, ...updated });
      }

      showToast(`Vendor ${status === 'active' ? 'approved & activated' : status}.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update vendor status', 'error');
    } finally {
      setActionLoading(null);
      setShowRejectModal(false);
      setVendorToReject(null);
      setRejectionReason('');
    }
  };

  const openRejectModal = (v: VendorProfile) => {
    setVendorToReject(v);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleReviewDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor || !reviewingDoc) return;

    try {
      await API.Admin.reviewVendorDocument(selectedVendor.id!, reviewingDoc.id, {
        status: reviewStatus,
        reviewer_note: reviewNote,
      });

      // Update local state in selectedVendor
      setSelectedVendor((prev) => {
        if (!prev || !prev.documents) return prev;
        return {
          ...prev,
          documents: prev.documents.map((d) =>
            d.id === reviewingDoc.id ? { ...d, status: reviewStatus, reviewer_note: reviewNote } : d
          ),
        };
      });

      showToast(`Document marked as ${reviewStatus}.`);
      setReviewingDoc(null);
      setReviewNote('');
    } catch (err: any) {
      showToast(err.message || 'Failed to review document', 'error');
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            Active
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            Suspended
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            Rejected
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            Pending Review
          </span>
        );
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
          <h1 className="text-3xl font-bold text-gray-900 font-serif">Vendor Curation & Merchants</h1>
          <p className="text-gray-600 text-sm mt-1">
            Review merchant applications, verify compliance KYC documents, and monitor brand partners.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 bg-white rounded-lg text-xs font-semibold text-gray-700 shadow-sm border">
            Total: {vendors.length}
          </span>
          <span className="px-3 py-1 bg-amber-50 rounded-lg text-xs font-semibold text-amber-800 border border-amber-200">
            Pending: {vendors.filter((v) => v.status === 'pending').length}
          </span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Status Filter Buttons */}
        <div className="flex space-x-2 overflow-x-auto w-full md:w-auto pb-1">
          {['all', 'pending', 'active', 'suspended', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st === 'all' ? 'All Vendors' : st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="Search merchant name, legal entity, owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <Icon name="search" className="w-4 h-4" />
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-primary mb-2" />
            <p className="text-sm">Fetching merchant roster...</p>
          </div>
        ) : vendors.length === 0 ? (
          <div className="p-16 text-center text-gray-500">
            <Icon name="users" className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-base font-semibold text-gray-700">No vendors found</p>
            <p className="text-xs text-gray-400 mt-1">
              No registered merchants match your current filter or query.
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Brand & Legal Entity</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Ratings</th>
                <th className="px-6 py-4">Registered</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden font-bold text-gray-500">
                        {vendor.logo_url ? (
                          <img
                            src={vendor.logo_url}
                            alt={vendor.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          vendor.display_name.charAt(0)
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{vendor.display_name}</div>
                        <div className="text-xs text-gray-500">{vendor.legal_name}</div>
                        <div className="text-xs text-gray-400 font-mono">/vendors/{vendor.slug}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 text-xs text-gray-600 space-y-1">
                    <div>{vendor.support_email || 'No email'}</div>
                    <div>{vendor.support_phone || 'No phone'}</div>
                    {vendor.tax_id && <div className="text-gray-400 font-mono">Tax ID: {vendor.tax_id}</div>}
                  </td>

                  <td className="px-6 py-4">{getStatusBadge(vendor.status)}</td>

                  <td className="px-6 py-4 text-xs text-gray-600">
                    <span className="font-semibold text-gray-900">★ {vendor.rating_avg || '0.0'}</span>{' '}
                    <span className="text-gray-400">({vendor.total_ratings || 0})</span>
                  </td>

                  <td className="px-6 py-4 text-xs text-gray-400">
                    {vendor.created_at ? new Date(vendor.created_at).toLocaleDateString() : '—'}
                  </td>

                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => setSelectedVendor(vendor)}
                      className="px-2.5 py-1 text-xs font-semibold text-primary hover:text-primary-hover bg-primary/10 rounded transition-colors"
                    >
                      View Details
                    </button>

                    {vendor.status !== 'active' && (
                      <button
                        onClick={() => handleUpdateStatus(vendor.id!, 'active')}
                        disabled={actionLoading === vendor.id}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-100 rounded transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                    )}

                    {vendor.status !== 'rejected' && (
                      <button
                        onClick={() => openRejectModal(vendor)}
                        disabled={actionLoading === vendor.id}
                        className="px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-100 rounded transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}

                    {vendor.status === 'active' && (
                      <button
                        onClick={() => handleUpdateStatus(vendor.id!, 'suspended')}
                        disabled={actionLoading === vendor.id}
                        className="px-2.5 py-1 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 rounded transition-colors disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Rejection Reason Modal */}
      {showRejectModal && vendorToReject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 font-serif">Reject Vendor Application</h3>
            <p className="text-xs text-gray-500">
              Provide a clear compliance or curation rationale for rejecting{' '}
              <strong className="text-gray-800">{vendorToReject.display_name}</strong>.
            </p>

            <textarea
              rows={4}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Incomplete business registration documentation, tax ID verification failed..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary"
            />

            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={() =>
                  handleUpdateStatus(vendorToReject.id!, 'rejected', rejectionReason)
                }
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Details Drawer / Modal */}
      {selectedVendor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-start pb-4 border-b">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 font-serif">
                  {selectedVendor.display_name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Legal Entity: {selectedVendor.legal_name} · Slug: {selectedVendor.slug}
                </p>
              </div>
              <button
                onClick={() => setSelectedVendor(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <Icon name="x" className="w-6 h-6" />
              </button>
            </div>

            {/* Status overview */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                  Current Status
                </span>
                <div className="mt-1">{getStatusBadge(selectedVendor.status)}</div>
              </div>
              {selectedVendor.rejection_reason && (
                <div className="text-right">
                  <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider block">
                    Rejection Rationale
                  </span>
                  <p className="text-xs text-rose-900 mt-1 max-w-xs">
                    {selectedVendor.rejection_reason}
                  </p>
                </div>
              )}
            </div>

            {/* Merchant Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-400 block">Support Email</span>
                <span className="font-medium text-gray-800">
                  {selectedVendor.support_email || '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Support Phone</span>
                <span className="font-medium text-gray-800">
                  {selectedVendor.support_phone || '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Tax Identification Number</span>
                <code className="font-mono text-gray-800">{selectedVendor.tax_id || '—'}</code>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Average Rating</span>
                <span className="font-medium text-gray-800">
                  ★ {selectedVendor.rating_avg || '0.0'} ({selectedVendor.total_ratings || 0} reviews)
                </span>
              </div>
            </div>

            {selectedVendor.description && (
              <div>
                <span className="text-xs text-gray-400 block mb-1">Brand Biography</span>
                <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg leading-relaxed">
                  {selectedVendor.description}
                </p>
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="space-x-2">
                {selectedVendor.status !== 'active' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedVendor.id!, 'active')}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
                  >
                    Approve Merchant
                  </button>
                )}
                {selectedVendor.status !== 'rejected' && (
                  <button
                    onClick={() => openRejectModal(selectedVendor)}
                    className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700"
                  >
                    Reject Merchant
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedVendor(null)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagementPage;
