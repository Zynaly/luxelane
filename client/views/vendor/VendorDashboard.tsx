import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import API, {
  VendorProfile,
  VendorDocItem,
  VendorBankItem,
  VendorStaffMember,
  VendorPolicyData,
} from '../../services/api';

interface VendorDashboardProps {
  user: {
    id: number | string;
    name: string;
    email: string;
    role: string;
    profilePictureUrl?: string;
  };
  onLogout: () => void;
  onViewStorefront?: (slug: string) => void;
}

type VendorTab = 'overview' | 'profile' | 'kyc' | 'banking' | 'staff' | 'policies';

export const VendorDashboard: React.FC<VendorDashboardProps> = ({
  user,
  onLogout,
  onViewStorefront,
}) => {
  const [activeTab, setActiveTab] = useState<VendorTab>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Core Vendor Data States
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [documents, setDocuments] = useState<VendorDocItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<VendorBankItem[]>([]);
  const [staffList, setStaffList] = useState<VendorStaffMember[]>([]);
  const [policy, setPolicy] = useState<VendorPolicyData>({
    return_window_days: 30,
    return_policy_text: '',
    shipping_policy_text: '',
    cancellation_policy_text: '',
  });

  // Profile Edit Form State
  const [profileForm, setProfileForm] = useState<Partial<VendorProfile>>({});

  // Document Upload Modal State
  const [showDocModal, setShowDocModal] = useState<boolean>(false);
  const [docForm, setDocForm] = useState({
    doc_type: 'business_registration',
    file_url: '',
  });
  const [uploadingDocFile, setUploadingDocFile] = useState<boolean>(false);

  // Bank Account Modal State
  const [showBankModal, setShowBankModal] = useState<boolean>(false);
  const [bankForm, setBankForm] = useState({
    account_holder: '',
    bank_name: '',
    account_number: '',
    routing_number: '',
    account_type: 'checking' as 'checking' | 'savings',
    is_primary: true,
  });

  // Staff Modal State
  const [showStaffModal, setShowStaffModal] = useState<boolean>(false);
  const [staffForm, setStaffForm] = useState({
    user_id: '',
    staff_role: 'manager' as 'manager' | 'support' | 'fulfillment',
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchVendorData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Vendor Profile
      const v = await API.Vendor.getMe();
      setVendor(v);
      setProfileForm({
        legal_name: v.legal_name,
        display_name: v.display_name,
        description: v.description || '',
        tax_id: v.tax_id || '',
        support_email: v.support_email || '',
        support_phone: v.support_phone || '',
        logo_url: v.logo_url || '',
        banner_url: v.banner_url || '',
      });

      // 2. Fetch Supporting Data concurrently
      const [docs, banks, staff, pol] = await Promise.allSettled([
        API.Vendor.getDocuments(),
        API.Vendor.getBankAccounts(),
        API.Vendor.getStaff(),
        API.Vendor.getPolicy(),
      ]);

      if (docs.status === 'fulfilled') setDocuments(docs.value);
      if (banks.status === 'fulfilled') setBankAccounts(banks.value);
      if (staff.status === 'fulfilled') setStaffList(staff.value);
      if (pol.status === 'fulfilled' && pol.value) {
        setPolicy({
          return_window_days: pol.value.return_window_days || 30,
          return_policy_text: pol.value.return_policy_text || '',
          shipping_policy_text: pol.value.shipping_policy_text || '',
          cancellation_policy_text: pol.value.cancellation_policy_text || '',
        });
      }
    } catch (err: any) {
      console.error('Failed to load vendor profile:', err);
      showToast(err.message || 'Unable to load vendor merchant data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorData();
  }, []);

  // Save Profile Changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await API.Vendor.updateMe(profileForm);
      setVendor(updated);
      showToast('Merchant profile updated successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to update merchant profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Upload KYC Document
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDocFile(true);
    try {
      const presigned = await API.Media.getPresignedUpload({
        purpose: 'vendor_document',
        content_type: file.type || 'application/pdf',
        size_bytes: file.size,
        filename: file.name,
      });

      try {
        await fetch(presigned.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/pdf' },
          body: file,
        });
      } catch {
        // Fallback for local stub mode
      }

      setDocForm((prev) => ({ ...prev, file_url: presigned.file_url }));
      showToast('Document uploaded successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to upload document file', 'error');
    } finally {
      setUploadingDocFile(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.file_url) {
      showToast('Please provide or upload a document file.', 'error');
      return;
    }
    setSaving(true);
    try {
      const newDoc = await API.Vendor.uploadDocument({
        doc_type: docForm.doc_type,
        file_url: docForm.file_url,
      });
      setDocuments((prev) => [newDoc, ...prev]);
      setShowDocModal(false);
      setDocForm({ doc_type: 'business_registration', file_url: '' });
      showToast('KYC document submitted for compliance review.');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit document', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Add Bank Account
  const handleAddBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const newBank = await API.Vendor.addBankAccount(bankForm);
      setBankAccounts((prev) => [newBank, ...prev]);
      setShowBankModal(false);
      setBankForm({
        account_holder: '',
        bank_name: '',
        account_number: '',
        routing_number: '',
        account_type: 'checking',
        is_primary: true,
      });
      showToast('Bank payout account added successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to add bank account', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete Bank Account
  const handleDeleteBankAccount = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this bank account?')) return;
    try {
      await API.Vendor.deleteBankAccount(id);
      setBankAccounts((prev) => prev.filter((b) => b.id !== id));
      showToast('Bank account removed.');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove bank account', 'error');
    }
  };

  // Add Staff Member
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const added = await API.Vendor.addStaff({
        user: staffForm.user_id,
        staff_role: staffForm.staff_role,
      });
      setStaffList((prev) => [added, ...prev]);
      setShowStaffModal(false);
      setStaffForm({ user_id: '', staff_role: 'manager' });
      showToast('Staff member added to merchant portal.');
    } catch (err: any) {
      showToast(err.message || 'Failed to add staff member', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Remove Staff Member
  const handleRemoveStaff = async (id: string) => {
    if (!window.confirm('Revoke access for this staff member?')) return;
    try {
      await API.Vendor.removeStaff(id);
      setStaffList((prev) => prev.filter((s) => s.id !== id));
      showToast('Staff access revoked.');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove staff member', 'error');
    }
  };

  // Save Store Policies
  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await API.Vendor.updatePolicy(policy);
      setPolicy(updated);
      showToast('Store policies saved successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to update store policies', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
            Active & Verified
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <span className="w-2 h-2 rounded-full bg-red-500 mr-2" />
            Suspended
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-2" />
            Application Rejected
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-2 animate-ping" />
            Pending Platform Review
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
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

      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-2xl font-serif font-bold text-dark tracking-tight">LuxeLane</span>
            <div className="hidden sm:block h-6 w-px bg-gray-200" />
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Merchant Portal
              </span>
              {getStatusBadge(vendor?.status)}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {vendor?.slug && vendor.status === 'active' && (
              <button
                onClick={() => onViewStorefront && onViewStorefront(vendor.slug!)}
                className="hidden sm:inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Icon name="search" className="w-3.5 h-3.5 text-gray-400" />
                <span>View Live Storefront</span>
              </button>
            )}

            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-gray-900">
                {vendor?.display_name || user.name}
              </p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>

            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-sm text-gray-700 hover:text-dark hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
              title="Sign Out"
            >
              <Icon name="logout" className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Status Warning / Feedback Banner */}
      {vendor?.status === 'pending' && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-200/60 px-6 py-3.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-amber-900">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Icon name="clock" className="w-4 h-4 text-amber-700" />
              </div>
              <p>
                <strong>Application Pending Review:</strong> Our platform curation team is reviewing
                your merchant application and KYC documents. Storefront publishing will activate
                upon approval.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('kyc')}
              className="hidden md:inline-flex text-xs font-semibold text-amber-800 underline hover:text-amber-950"
            >
              Verify KYC Docs →
            </button>
          </div>
        </div>
      )}

      {vendor?.status === 'rejected' && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3.5">
          <div className="max-w-7xl mx-auto flex items-center space-x-3 text-sm text-rose-900">
            <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
              <Icon name="x" className="w-4 h-4 text-rose-700" />
            </div>
            <p>
              <strong>Application Status: Rejected.</strong>{' '}
              {vendor.rejection_reason || 'Compliance criteria not met.'} Please update your KYC
              documents or contact platform support.
            </p>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-b border-gray-200 mb-8 overflow-x-auto pb-1">
          {[
            { id: 'overview', label: 'Overview', icon: 'dashboard' },
            { id: 'profile', label: 'Store Branding', icon: 'user' },
            { id: 'kyc', label: 'KYC & Compliance', icon: 'check' },
            { id: 'banking', label: 'Bank & Payouts', icon: 'cart' },
            { id: 'staff', label: 'Staff & Team', icon: 'users' },
            { id: 'policies', label: 'Store Policies', icon: 'order' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as VendorTab)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-dark text-white shadow-sm'
                  : 'text-gray-600 hover:text-dark hover:bg-gray-100'
              }`}
            >
              <Icon name={tab.icon} className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-24 text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-300 border-t-accent mb-4" />
            <p className="text-sm text-gray-500">Loading merchant details...</p>
          </div>
        ) : (
          <div>
            {/* ── TAB 1: OVERVIEW ──────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Hero Card */}
                <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm relative overflow-hidden">
                  <div className="sm:flex items-center justify-between">
                    <div className="flex items-center space-x-5">
                      <div className="w-20 h-20 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {vendor?.logo_url ? (
                          <img
                            src={vendor.logo_url}
                            alt={vendor.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl font-serif font-bold text-gray-400">
                            {vendor?.display_name?.charAt(0) || 'L'}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-3">
                          <h2 className="text-2xl font-serif font-bold text-dark">
                            {vendor?.display_name || 'Your Luxury Store'}
                          </h2>
                          {getStatusBadge(vendor?.status)}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          Legal Entity: <span className="text-gray-700 font-medium">{vendor?.legal_name}</span> ·
                          Slug: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">/vendors/{vendor?.slug}</code>
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 sm:mt-0 flex items-center space-x-3">
                      <button
                        onClick={() => setActiveTab('profile')}
                        className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Edit Profile
                      </button>
                      <button
                        onClick={() => setActiveTab('kyc')}
                        className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors shadow-sm"
                      >
                        KYC Verification
                      </button>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        KYC Documents
                      </span>
                      <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Icon name="check" className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-dark">{documents.length}</div>
                    <p className="text-xs text-gray-500 mt-1">
                      {documents.filter((d) => d.status === 'approved').length} approved by platform
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Bank Accounts
                      </span>
                      <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Icon name="cart" className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-dark">{bankAccounts.length}</div>
                    <p className="text-xs text-gray-500 mt-1">
                      {bankAccounts.find((b) => b.is_primary)?.bank_name || 'No primary linked'}
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Staff Members
                      </span>
                      <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                        <Icon name="users" className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-dark">{staffList.length}</div>
                    <p className="text-xs text-gray-500 mt-1">Active team operators</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Return Window
                      </span>
                      <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Icon name="order" className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-dark">{policy.return_window_days} Days</div>
                    <p className="text-xs text-gray-500 mt-1">Customer return guarantee</p>
                  </div>
                </div>

                {/* Quick Setup Checklist */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-serif font-bold text-dark mb-4">
                    Merchant Activation Checklist
                  </h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div
                      onClick={() => setActiveTab('profile')}
                      className="p-4 rounded-xl border border-gray-100 hover:border-gray-300 cursor-pointer bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-gray-500">Step 1</span>
                        <span className="text-emerald-600 text-xs font-semibold">✓ Done</span>
                      </div>
                      <h4 className="font-semibold text-dark text-sm">Store Profile</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Brand bio, contact info, support email.
                      </p>
                    </div>

                    <div
                      onClick={() => setActiveTab('kyc')}
                      className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                        documents.some((d) => d.status === 'approved')
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-amber-200 bg-amber-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-amber-800">Step 2</span>
                        <span
                          className={`text-xs font-semibold ${
                            documents.some((d) => d.status === 'approved')
                              ? 'text-emerald-700'
                              : 'text-amber-800'
                          }`}
                        >
                          {documents.some((d) => d.status === 'approved')
                            ? '✓ Verified'
                            : 'Upload Docs'}
                        </span>
                      </div>
                      <h4 className="font-semibold text-dark text-sm">KYC Documents</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Business registration & tax certificate.
                      </p>
                    </div>

                    <div
                      onClick={() => setActiveTab('banking')}
                      className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                        bankAccounts.length > 0
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-gray-200 bg-gray-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-gray-500">Step 3</span>
                        <span
                          className={`text-xs font-semibold ${
                            bankAccounts.length > 0 ? 'text-emerald-700' : 'text-gray-500'
                          }`}
                        >
                          {bankAccounts.length > 0 ? '✓ Configured' : 'Add Bank'}
                        </span>
                      </div>
                      <h4 className="font-semibold text-dark text-sm">Payout Bank Account</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Direct deposits and earnings payout.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: STORE BRANDING & PROFILE ─────────────────────────────── */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-xl font-serif font-bold text-dark">Storefront & Entity Details</h3>
                  <p className="text-xs text-gray-500">
                    Public branding and legal entity information for the LuxeLane marketplace.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Display / Brand Name
                    </label>
                    <input
                      type="text"
                      value={profileForm.display_name || ''}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, display_name: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Legal Registered Name
                    </label>
                    <input
                      type="text"
                      value={profileForm.legal_name || ''}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, legal_name: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Tax ID / EIN / VAT
                    </label>
                    <input
                      type="text"
                      value={profileForm.tax_id || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, tax_id: e.target.value })}
                      placeholder="e.g. 12-3456789"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Support Email
                    </label>
                    <input
                      type="email"
                      value={profileForm.support_email || ''}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, support_email: e.target.value })
                      }
                      placeholder="concierge@yourbrand.com"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Support Phone
                    </label>
                    <input
                      type="text"
                      value={profileForm.support_phone || ''}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, support_phone: e.target.value })
                      }
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Brand Logo URL
                    </label>
                    <input
                      type="url"
                      value={profileForm.logo_url || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, logo_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Storefront Banner URL
                    </label>
                    <input
                      type="url"
                      value={profileForm.banner_url || ''}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, banner_url: e.target.value })
                      }
                      placeholder="https://..."
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Brand Biography & Luxury Heritage
                    </label>
                    <textarea
                      rows={4}
                      value={profileForm.description || ''}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, description: e.target.value })
                      }
                      placeholder="Share the story, craftsmanship, and aesthetic vision of your brand..."
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {saving ? 'Saving Changes...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            )}

            {/* ── TAB 3: KYC & COMPLIANCE ──────────────────────────────────────── */}
            {activeTab === 'kyc' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-dark">KYC & Compliance Verification</h3>
                    <p className="text-xs text-gray-500">
                      Submit mandatory legal documentation to verify your merchant standing.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDocModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Upload Document</span>
                  </button>
                </div>

                {documents.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
                    <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                      <Icon name="order" className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-dark text-base">No Documents Submitted Yet</h4>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-6">
                      Upload your Business Registration, Tax Certificate, or Government ID to complete KYC.
                    </p>
                    <button
                      onClick={() => setShowDocModal(true)}
                      className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent-hover transition-colors"
                    >
                      Upload First Document
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Document Type</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Reviewer Feedback</th>
                          <th className="px-6 py-4">File Link</th>
                          <th className="px-6 py-4">Submitted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {documents.map((doc) => (
                          <tr key={doc.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-6 py-4 font-medium text-dark capitalize">
                              {doc.doc_type.replace(/_/g, ' ')}
                            </td>
                            <td className="px-6 py-4">
                              {doc.status === 'approved' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                  Approved
                                </span>
                              )}
                              {doc.status === 'pending' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                  Under Review
                                </span>
                              )}
                              {doc.status === 'rejected' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                                  Rejected
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-600">
                              {doc.reviewer_note || <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-6 py-4">
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent hover:underline text-xs font-semibold flex items-center space-x-1"
                              >
                                <span>View File</span>
                                <Icon name="search" className="w-3 h-3" />
                              </a>
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-400">
                              {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 4: BANK & PAYOUTS ────────────────────────────────────────── */}
            {activeTab === 'banking' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-dark">Payout Bank Accounts</h3>
                    <p className="text-xs text-gray-500">
                      Manage verified banking details for automated Stripe Connect / platform payouts.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowBankModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Add Bank Account</span>
                  </button>
                </div>

                {bankAccounts.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                      <Icon name="cart" className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-dark text-base">No Payout Accounts Connected</h4>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-6">
                      Add a business checking or savings account to receive merchant sales payouts.
                    </p>
                    <button
                      onClick={() => setShowBankModal(true)}
                      className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent-hover transition-colors"
                    >
                      Add Bank Account
                    </button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-6">
                    {bankAccounts.map((bank) => (
                      <div
                        key={bank.id}
                        className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="font-serif font-bold text-lg text-dark">
                              {bank.bank_name}
                            </span>
                            {bank.is_primary && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Primary Payout
                              </span>
                            )}
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-gray-500">
                              <span>Account Holder:</span>
                              <span className="font-medium text-gray-900">{bank.account_holder}</span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Account Number:</span>
                              <code className="font-semibold text-gray-900">{bank.account_number}</code>
                            </div>
                            {bank.routing_number && (
                              <div className="flex justify-between text-gray-500">
                                <span>Routing Number:</span>
                                <span className="font-mono text-gray-900">{bank.routing_number}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-gray-500">
                              <span>Account Type:</span>
                              <span className="capitalize font-medium text-gray-900">
                                {bank.account_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                          <button
                            onClick={() => handleDeleteBankAccount(bank.id)}
                            className="text-xs font-semibold text-red-600 hover:text-red-800 transition-colors"
                          >
                            Remove Account
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 5: STAFF & TEAM ──────────────────────────────────────────── */}
            {activeTab === 'staff' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-dark">Team & Staff Access</h3>
                    <p className="text-xs text-gray-500">
                      Grant staff members scoped access to your merchant dashboard.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowStaffModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Invite Staff</span>
                  </button>
                </div>

                {staffList.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
                    <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
                      <Icon name="users" className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-dark text-base">No Team Members Added</h4>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-6">
                      Add managers or fulfillment specialists to help manage orders and inventory.
                    </p>
                    <button
                      onClick={() => setShowStaffModal(true)}
                      className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent-hover transition-colors"
                    >
                      Add Staff Member
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Name</th>
                          <th className="px-6 py-4">Email</th>
                          <th className="px-6 py-4">Role</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {staffList.map((member) => (
                          <tr key={member.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-6 py-4 font-medium text-dark">{member.user_name}</td>
                            <td className="px-6 py-4 text-gray-600">{member.user_email}</td>
                            <td className="px-6 py-4">
                              <span className="capitalize px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                {member.staff_role}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  member.is_active
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {member.is_active ? 'Active' : 'Disabled'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleRemoveStaff(member.id)}
                                className="text-xs font-semibold text-red-600 hover:text-red-800"
                              >
                                Revoke
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

            {/* ── TAB 6: POLICIES ──────────────────────────────────────────────── */}
            {activeTab === 'policies' && (
              <form onSubmit={handleSavePolicies} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-xl font-serif font-bold text-dark">Store Policies & Customer Terms</h3>
                  <p className="text-xs text-gray-500">
                    Transparent shipping, return, and cancellation policies displayed on your storefront.
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Return Window (Days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={policy.return_window_days}
                      onChange={(e) =>
                        setPolicy({ ...policy, return_window_days: parseInt(e.target.value) || 0 })
                      }
                      className="w-48 px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                    <span className="text-xs text-gray-500 ml-2">days allowed for customer returns</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Return & Exchange Policy Details
                    </label>
                    <textarea
                      rows={4}
                      value={policy.return_policy_text}
                      onChange={(e) => setPolicy({ ...policy, return_policy_text: e.target.value })}
                      placeholder="Outline return conditions, tags attached requirements, and restocking provisions..."
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Shipping & Delivery Terms
                    </label>
                    <textarea
                      rows={4}
                      value={policy.shipping_policy_text}
                      onChange={(e) =>
                        setPolicy({ ...policy, shipping_policy_text: e.target.value })
                      }
                      placeholder="Detail standard shipping carriers, white-glove delivery, and dispatch transit windows..."
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Order Cancellation Policy
                    </label>
                    <textarea
                      rows={4}
                      value={policy.cancellation_policy_text}
                      onChange={(e) =>
                        setPolicy({ ...policy, cancellation_policy_text: e.target.value })
                      }
                      placeholder="Conditions under which an order may be cancelled before shipment..."
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-dark focus:border-dark"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {saving ? 'Saving Policies...' : 'Save Store Policies'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Upload KYC Document Modal */}
      {showDocModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-lg font-serif font-bold text-dark">Submit KYC Document</h3>
              <button onClick={() => setShowDocModal(false)} className="text-gray-400 hover:text-dark">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Document Type
                </label>
                <select
                  value={docForm.doc_type}
                  onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                >
                  <option value="business_registration">Business Registration</option>
                  <option value="tax_certificate">Tax Certificate</option>
                  <option value="id_proof">Government ID / Passport</option>
                  <option value="bank_statement">Bank Account Statement</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload File
                </label>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploadingDocFile}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-dark hover:file:bg-gray-200"
                />
                {uploadingDocFile && (
                  <p className="text-xs text-accent mt-1">Uploading document file...</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Or File URL
                </label>
                <input
                  type="url"
                  value={docForm.file_url}
                  onChange={(e) => setDocForm({ ...docForm, file_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowDocModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !docForm.file_url}
                  className="px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Submitting...' : 'Submit Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Bank Account Modal */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-lg font-serif font-bold text-dark">Add Bank Payout Account</h3>
              <button onClick={() => setShowBankModal(false)} className="text-gray-400 hover:text-dark">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBankAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  required
                  value={bankForm.account_holder}
                  onChange={(e) => setBankForm({ ...bankForm, account_holder: e.target.value })}
                  placeholder="e.g. Maison Atelier LLC"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Financial Institution / Bank Name
                </label>
                <input
                  type="text"
                  required
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                  placeholder="e.g. JPMorgan Chase"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    required
                    value={bankForm.account_number}
                    onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
                    placeholder="Full account number"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Routing Number
                  </label>
                  <input
                    type="text"
                    value={bankForm.routing_number}
                    onChange={(e) => setBankForm({ ...bankForm, routing_number: e.target.value })}
                    placeholder="9-digit routing"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Account Type
                  </label>
                  <select
                    value={bankForm.account_type}
                    onChange={(e) =>
                      setBankForm({
                        ...bankForm,
                        account_type: e.target.value as 'checking' | 'savings',
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bankForm.is_primary}
                      onChange={(e) => setBankForm({ ...bankForm, is_primary: e.target.checked })}
                      className="rounded text-dark focus:ring-dark"
                    />
                    <span>Set as Primary Payout</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Save Bank Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Staff Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-lg font-serif font-bold text-dark">Add Team Staff Member</h3>
              <button onClick={() => setShowStaffModal(false)} className="text-gray-400 hover:text-dark">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  User ID
                </label>
                <input
                  type="text"
                  required
                  value={staffForm.user_id}
                  onChange={(e) => setStaffForm({ ...staffForm, user_id: e.target.value })}
                  placeholder="Registered User ID"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Staff Role
                </label>
                <select
                  value={staffForm.staff_role}
                  onChange={(e) =>
                    setStaffForm({
                      ...staffForm,
                      staff_role: e.target.value as 'manager' | 'support' | 'fulfillment',
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                >
                  <option value="manager">Manager (Full operational access)</option>
                  <option value="support">Support (Customer inquiry handling)</option>
                  <option value="fulfillment">Fulfillment (Shipment & dispatch)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Add Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
