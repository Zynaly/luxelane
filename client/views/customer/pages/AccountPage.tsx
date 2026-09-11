import React, { useState, useEffect } from 'react';
import { Icon } from '../../../components/Icon';
import API, { AddressData, Order, SavedCard, WalletBalance, WalletTransaction } from '../../../services/api';

interface AccountPageProps {
  onLogout?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  customer: 'Customer',
  vendor_owner: 'Vendor Owner',
  vendor_staff: 'Vendor Staff',
  warehouse_manager: 'Warehouse Manager',
  warehouse_staff: 'Warehouse Staff',
  platform_admin: 'Platform Admin',
};

const AccountPage: React.FC<AccountPageProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'addresses' | 'notifications' | 'security' | 'vendor_apply' | 'payments' | 'wallet'>('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Saved Payment Cards State (Sprint 11)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);

  // Customer Wallet State (Sprint 12)
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);

  // Orders State (Sprint 10)
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Vendor Application State
  const [vendorApp, setVendorApp] = useState({
    legal_name: '',
    display_name: '',
    description: '',
    tax_id: '',
    support_email: '',
    support_phone: '',
  });
  const [vendorAppSubmitting, setVendorAppSubmitting] = useState(false);
  const [vendorAppSubmitted, setVendorAppSubmitted] = useState(false);

  // Profile State
  const [profile, setProfile] = useState<{
    id?: string;
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
    two_factor_enabled?: boolean;
    is_verified?: boolean;
    role?: string;
    created_at?: string;
  }>({});

  // Addresses State
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressData | null>(null);
  const [addressForm, setAddressForm] = useState<AddressData>({
    label: 'Home',
    line1: '',
    line2: '',
    city: '',
    state: '',
    country: 'US',
    postal_code: '',
    type: 'both',
    is_default: false,
    contact_phone: '',
  });

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);

  // Password & 2FA State
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [twoFaStep, setTwoFaStep] = useState<'initial' | 'code_sent' | 'enabled'>('initial');
  const [twoFaCode, setTwoFaCode] = useState('');

  // Initial Data Fetching
  useEffect(() => {
    fetchProfile();
    fetchAddresses();
    fetchNotifications();
    fetchOrders();
    fetchCards();
    fetchWallet();
  }, []);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchWallet = async () => {
    try {
      setWalletLoading(true);
      const [bal, txs] = await Promise.all([
        API.Payment.getWalletBalance(),
        API.Payment.getWalletTransactions(),
      ]);
      setWallet(bal);
      setWalletTransactions(txs.results || []);
    } catch (err: any) {
      console.error('Failed to load wallet:', err);
    } finally {
      setWalletLoading(false);
    }
  };

  const fetchCards = async () => {
    try {
      setCardsLoading(true);
      const data = await API.Payment.listCards();
      setSavedCards(data.results || []);
    } catch (err: any) {
      console.error('Failed to fetch saved cards:', err);
    } finally {
      setCardsLoading(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!window.confirm('Are you sure you want to remove this saved payment card?')) return;
    try {
      await API.Payment.deleteCard(cardId);
      setSavedCards(prev => prev.filter(c => c.id !== cardId));
      showMsg('Payment card removed successfully.');
    } catch (err: any) {
      showMsg(err.message || 'Failed to remove card.', 'error');
    }
  };

  const handleSetDefaultCard = async (cardId: string) => {
    try {
      await API.Payment.setDefaultCard(cardId);
      setSavedCards(prev => prev.map(c => ({
        ...c,
        is_default: c.id === cardId,
      })));
      showMsg('Default payment card updated.');
    } catch (err: any) {
      showMsg(err.message || 'Failed to update default card.', 'error');
    }
  };

  const fetchOrders = async () => {
    try {
      setOrdersLoading(true);
      const data = await API.Order.list();
      setOrders(data);
    } catch (err: any) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalOrder) return;
    setCancelling(true);
    try {
      await API.Order.cancel(cancelModalOrder.id, cancelReason || 'Customer requested cancellation.');
      showMsg('Order successfully cancelled.');
      setCancelModalOrder(null);
      setCancelReason('');
      fetchOrders();
      if (selectedOrder?.id === cancelModalOrder.id) {
        const updated = await API.Order.get(cancelModalOrder.id);
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      showMsg(err.message || 'Failed to cancel order.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const data = await API.Profile.getProfile();
      setProfile(data);
      if (data.two_factor_enabled) {
        setTwoFaStep('enabled');
      }
    } catch (err: any) {
      console.error('Failed to fetch profile:', err);
    }
  };

  const fetchAddresses = async () => {
    try {
      const list = await API.Address.getAddresses();
      setAddresses(list);
    } catch (err: any) {
      console.error('Failed to fetch addresses:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const notifs = await API.Notification.getNotifications();
      setNotifications(notifs);
    } catch (err: any) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const handleVendorApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setVendorAppSubmitting(true);
    try {
      await API.Vendor.apply(vendorApp);
      setVendorAppSubmitted(true);
      showMsg('Merchant application submitted successfully! Platform curation review is in progress.');
      fetchProfile();
    } catch (err: any) {
      showMsg(err.message || 'Failed to submit vendor application.', 'error');
    } finally {
      setVendorAppSubmitting(false);
    }
  };

  // Profile update handler
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.Profile.updateProfile({
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
      });
      showMsg('Profile updated successfully!');
      fetchProfile();
    } catch (err: any) {
      showMsg(err.message || 'Failed to update profile.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Avatar upload handler
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const avatarUrl = await API.Media.uploadAvatar(file);
      setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
      showMsg('Avatar updated successfully!');
    } catch (err: any) {
      showMsg(err.message || 'Failed to upload avatar.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Address create/update handler
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingAddress?.id) {
        // Update existing
        await API.Address.updateAddress(editingAddress.id, addressForm);
        showMsg('Address updated successfully!');
      } else {
        // Validate with geocoding first
        const validated = await API.Address.validateAddress({
          line1: addressForm.line1,
          city: addressForm.city,
          state: addressForm.state,
          country: addressForm.country,
          postal_code: addressForm.postal_code,
        });
        await API.Address.createAddress({
          ...addressForm,
          latitude: validated.latitude,
          longitude: validated.longitude,
        });
        showMsg('Address added and geocoded successfully!');
      }
      setShowAddressModal(false);
      setEditingAddress(null);
      setAddressForm({
        label: 'Home',
        line1: '',
        line2: '',
        city: '',
        state: '',
        country: 'US',
        postal_code: '',
        type: 'both',
        is_default: false,
        contact_phone: '',
      });
      fetchAddresses();
    } catch (err: any) {
      showMsg(err.message || 'Failed to save address.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openEditAddress = (addr: AddressData) => {
    setEditingAddress(addr);
    setAddressForm({ ...addr });
    setShowAddressModal(true);
  };

  const openAddAddress = () => {
    setEditingAddress(null);
    setAddressForm({
      label: 'Home',
      line1: '',
      line2: '',
      city: '',
      state: '',
      country: 'US',
      postal_code: '',
      type: 'both',
      is_default: false,
      contact_phone: '',
    });
    setShowAddressModal(true);
  };

  // Delete address
  const handleDeleteAddress = async (id: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      await API.Address.deleteAddress(id);
      showMsg('Address removed.');
      fetchAddresses();
    } catch (err: any) {
      showMsg(err.message || 'Failed to remove address.', 'error');
    }
  };

  // Password change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showMsg('New passwords do not match.', 'error');
      return;
    }
    setLoading(true);
    try {
      await API.Auth.changePassword({
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      showMsg('Password changed successfully!');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) {
      showMsg(err.message || 'Failed to change password.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2FA Enable & Verify
  const handleStart2FA = async () => {
    setLoading(true);
    try {
      await API.Profile.enable2FA();
      setTwoFaStep('code_sent');
      showMsg('Verification code sent to your email/phone.');
    } catch (err: any) {
      showMsg(err.message || 'Failed to initiate 2FA.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setLoading(true);
    try {
      await API.Profile.verify2FA(twoFaCode);
      setTwoFaStep('enabled');
      showMsg('Two-Factor Authentication enabled!');
      fetchProfile();
    } catch (err: any) {
      showMsg(err.message || 'Invalid 2FA code.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Mark notification read
  const handleMarkNotificationRead = async (id: string) => {
    try {
      await API.Notification.markRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, status: 'read', read_at: new Date().toISOString() } : n))
      );
    } catch (err: any) {
      console.error('Failed to mark read:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-gray-900">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile, shipping addresses, security, and notifications.</p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg text-sm font-medium flex items-center justify-between ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-4 text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <aside className="lg:col-span-1">
          {/* Profile summary card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-3 flex items-center space-x-3">
            <img
              src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent((profile.first_name || '') + ' ' + (profile.last_name || ''))}&background=1a56db&color=fff&size=80`}
              alt="Avatar"
              className="w-12 h-12 rounded-full object-cover border-2 border-primary/20 flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">
                {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : 'Loading...'}
              </p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mt-0.5">
                {ROLE_LABELS[profile.role as string] || profile.role || 'Customer'}
              </span>
              {profile.is_verified && (
                <span className="inline-flex items-center ml-1 text-green-600 text-xs">✓ Verified</span>
              )}
            </div>
          </div>

          <nav className="space-y-1 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
            <button
              id="account-tab-profile"
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'profile' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon name="user" className="w-5 h-5 mr-3" /> Profile Details
            </button>
            <button
              id="account-tab-orders"
              onClick={() => { setActiveTab('orders'); setSelectedOrder(null); }}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'orders' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon name="orders" className="w-5 h-5 mr-3" /> Orders & Receipts ({orders.length})
            </button>
            <button
              id="account-tab-addresses"
              onClick={() => setActiveTab('addresses')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'addresses' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon name="warehouse" className="w-5 h-5 mr-3" /> Saved Addresses ({addresses.length})
            </button>
            <button
              id="account-tab-notifications"
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'notifications' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon name="chat-bubble" className="w-5 h-5 mr-3" /> Notifications ({notifications.filter(n => n.status !== 'read').length})
            </button>
            <button
              id="account-tab-security"
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'security' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon name="lock" className="w-5 h-5 mr-3" /> Security & 2FA
            </button>
            <button
              id="account-tab-payments"
              onClick={() => setActiveTab('payments')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'payments' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon name="credit-card" className="w-5 h-5 mr-3" /> Payment Methods ({savedCards.length})
            </button>
            <button
              id="account-tab-wallet"
              onClick={() => setActiveTab('wallet')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'wallet' ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon name="star" className="w-5 h-5 mr-3 text-amber-500" /> Wallet & Credit (${wallet ? wallet.balance : '0.00'})
            </button>
            {profile.role === 'customer' && (
              <button
                id="account-tab-vendor-apply"
                onClick={() => setActiveTab('vendor_apply')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'vendor_apply' ? 'bg-primary text-white' : 'text-amber-800 bg-amber-50/70 hover:bg-amber-100'
                }`}
              >
                <Icon name="cart" className="w-5 h-5 mr-3 text-amber-600" /> Become a Vendor
              </button>
            )}
            <div className="pt-2 border-t border-gray-100 mt-2">
              <button
                id="account-logout-btn"
                onClick={onLogout}
                className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                <Icon name="logout" className="w-5 h-5 mr-3" /> Sign Out
              </button>
            </div>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="lg:col-span-3">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Personal Information</h2>

              {/* Account meta */}
              <div className="flex flex-wrap gap-3 mb-6">
                {profile.role && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    {ROLE_LABELS[profile.role as string] || profile.role}
                  </span>
                )}
                {profile.is_verified && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                    ✓ Email Verified
                  </span>
                )}
                {profile.created_at && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-6 mb-8">
                <div className="relative">
                  <img
                    src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent((profile.first_name || '') + ' ' + (profile.last_name || ''))}&background=1a56db&color=fff&size=160`}
                    alt="Avatar"
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shadow-sm"
                  />
                </div>
                <div>
                  <label className="inline-block cursor-pointer bg-white border border-gray-300 px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
                    Upload New Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} id="avatar-upload-input" />
                  </label>
                  <p className="text-xs text-gray-500 mt-1">JPEG, PNG, or WEBP up to 5MB.</p>
                </div>
              </div>

              <form onSubmit={handleProfileSave} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={profile.first_name || ''}
                      onChange={e => setProfile({ ...profile, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={profile.last_name || ''}
                      onChange={e => setProfile({ ...profile, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={profile.email || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500 text-sm cursor-not-allowed"
                    />
                    <span className="text-xs text-gray-400">Email is fixed to your identity.</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number (E.164)</label>
                    <input
                      type="text"
                      value={profile.phone || ''}
                      onChange={e => setProfile({ ...profile, phone: e.target.value })}
                      placeholder="+12025550199"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ORDERS & RECEIPTS TAB (Sprint 10) */}
          {activeTab === 'orders' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Orders & Atelier Receipts</h2>
                  <p className="text-sm text-gray-500">Track and manage your luxury orders and multi-vendor atelier deliveries.</p>
                </div>
                <button
                  onClick={fetchOrders}
                  disabled={ordersLoading}
                  className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-medium transition-colors"
                >
                  {ordersLoading ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>

              {ordersLoading ? (
                <div className="py-16 text-center">
                  <div className="w-10 h-10 border-4 border-gray-200 border-t-stone-800 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs text-stone-500 font-serif italic">Retrieving your order records...</p>
                </div>
              ) : selectedOrder ? (
                /* Order Detail View */
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between pb-4 border-b border-gray-200 gap-3">
                    <button
                      onClick={() => setSelectedOrder(null)}
                      className="text-xs font-semibold text-primary hover:underline flex items-center"
                    >
                      ← Back to All Orders
                    </button>
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-bold text-gray-900">{selectedOrder.order_number}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                        selectedOrder.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                        selectedOrder.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        selectedOrder.status === 'fulfilled' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {selectedOrder.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Financial & Delivery Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                      <span className="text-xs text-stone-500 block mb-1">Placed On</span>
                      <span className="text-sm font-semibold text-stone-900">
                        {new Date(selectedOrder.placed_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                      <span className="text-xs text-stone-500 block mb-1">Grand Total</span>
                      <span className="text-base font-serif font-bold text-stone-900 font-mono">
                        ${selectedOrder.grand_total} {selectedOrder.currency}
                      </span>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                      <span className="text-xs text-stone-500 block mb-1">Shipping Destination</span>
                      <span className="text-xs text-stone-800 font-medium block">
                        {selectedOrder.shipping_address_snapshot?.line1}, {selectedOrder.shipping_address_snapshot?.city}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {selectedOrder.shipping_address_snapshot?.state} {selectedOrder.shipping_address_snapshot?.postal_code}, {selectedOrder.shipping_address_snapshot?.country}
                      </span>
                    </div>
                  </div>

                  {/* Vendor Packages Breakdown */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">
                      Atelier Packages ({selectedOrder.vendor_orders?.length || 0})
                    </h3>

                    {selectedOrder.vendor_orders?.map((vo, idx) => (
                      <div key={vo.id} className="border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-stone-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="font-bold text-stone-900">{vo.vendor_name || 'Partner Atelier'}</span>
                            <span className="text-stone-500 ml-2 font-medium text-[11px]">· Package #{idx + 1}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded bg-white font-medium text-stone-700 border border-stone-300">
                              Status: {vo.status}
                            </span>
                            {vo.tracking_number && (
                              <span className="font-mono text-stone-600 bg-stone-200 px-2 py-0.5 rounded">
                                Track: {vo.tracking_number}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="divide-y divide-stone-100">
                          {vo.items?.map((item) => (
                            <div key={item.id} className="p-4 flex items-center justify-between text-xs hover:bg-stone-50/50">
                              <div className="space-y-0.5">
                                <p className="font-semibold text-stone-900">{item.product_title}</p>
                                <p className="text-stone-500 text-[11px]">
                                  Variant: {item.variant_name || 'Standard'} · SKU: <span className="font-mono">{item.sku}</span>
                                </p>
                                <span className="inline-block px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-[10px] uppercase font-mono">
                                  {item.fulfilment_status}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-stone-500">Qty: {item.quantity} × ${item.unit_price}</p>
                                <p className="font-mono font-bold text-stone-900">${item.line_subtotal}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action row */}
                  <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      Official invoice and certificate of authenticity verified.
                    </span>
                    {['pending_payment', 'paid', 'processing'].includes(selectedOrder.status) && (
                      <button
                        onClick={() => setCancelModalOrder(selectedOrder)}
                        className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Cancel Order
                      </button>
                    )}
                  </div>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
                  <Icon name="orders" className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-gray-900">No Orders Yet</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                    Your luxury bag is awaiting its first curation. Explore our marketplace to place an order.
                  </p>
                </div>
              ) : (
                /* Orders List */
                <div className="space-y-3">
                  {orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-5 border border-gray-200 rounded-xl hover:border-stone-400 transition-all bg-white shadow-sm flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-3">
                          <span className="font-mono font-bold text-sm text-stone-900">{ord.order_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                            ord.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                            ord.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            ord.status === 'fulfilled' ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {ord.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Placed on {new Date(ord.placed_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })} · {ord.vendor_orders?.length || 1} atelier shipment(s)
                        </p>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <span className="block font-mono font-bold text-sm text-stone-900">
                            ${ord.grand_total} {ord.currency}
                          </span>
                          <span className="text-[10px] text-gray-400">Total Charged</span>
                        </div>
                        <button
                          onClick={() => setSelectedOrder(ord)}
                          className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm"
                        >
                          View Details
                        </button>
                        {['pending_payment', 'paid', 'processing'].includes(ord.status) && (
                          <button
                            onClick={() => setCancelModalOrder(ord)}
                            className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ADDRESSES TAB */}
          {activeTab === 'addresses' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Saved Addresses</h2>
                  <p className="text-sm text-gray-500">Addresses are geocoded automatically for delivery verification.</p>
                </div>
                <button
                  id="add-address-btn"
                  onClick={openAddAddress}
                  className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  + Add New Address
                </button>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <Icon name="warehouse" className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No saved addresses yet.</p>
                  <button onClick={openAddAddress} className="mt-3 text-primary text-sm font-medium hover:underline">Add your first address</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map(addr => (
                    <div key={addr.id} className="p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors relative">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-gray-900">{addr.label || 'Address'}</span>
                        {addr.is_default && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{addr.line1}</p>
                      {addr.line2 && <p className="text-sm text-gray-500">{addr.line2}</p>}
                      <p className="text-sm text-gray-600">
                        {addr.city}, {addr.state} {addr.postal_code}, {addr.country}
                      </p>
                      {addr.latitude && addr.longitude && (
                        <p className="text-xs text-gray-400 mt-2 font-mono">
                          📍 {Number(addr.latitude).toFixed(4)}, {Number(addr.longitude).toFixed(4)}
                        </p>
                      )}
                      <div className="mt-4 pt-2 border-t border-gray-100 flex justify-end space-x-3">
                        <button
                          onClick={() => openEditAddress(addr)}
                          className="text-primary hover:text-primary-hover text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => addr.id && handleDeleteAddress(addr.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Notifications Inbox</h2>
              {notifications.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <p className="text-gray-500 text-sm">No notifications.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={`p-4 rounded-xl border transition-colors flex items-start justify-between ${
                        n.status === 'read' ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-white border-primary/40 shadow-sm'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-primary">{n.channel}</span>
                          <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
                        </div>
                        <h4 className="font-bold text-sm text-gray-900 mt-1">{n.payload?.subject || n.template_code}</h4>
                        <p className="text-sm text-gray-700 mt-0.5">{n.payload?.body || JSON.stringify(n.payload)}</p>
                      </div>
                      {n.status !== 'read' && (
                        <button
                          onClick={() => handleMarkNotificationRead(n.id)}
                          className="text-xs text-primary hover:underline font-medium ml-4 shrink-0"
                        >
                          Mark as Read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECURITY & 2FA TAB */}
          {activeTab === 'security' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-8">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Change Password</h2>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={passwordForm.old_password}
                      onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={passwordForm.new_password}
                      onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                      required
                      minLength={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={passwordForm.confirm_password}
                      onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
                  >
                    Update Password
                  </button>
                </form>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Two-Factor Authentication (2FA)</h3>
                <p className="text-sm text-gray-500 mb-4">Add an extra layer of security with verification OTP codes upon login.</p>

                {twoFaStep === 'enabled' ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-medium flex items-center">
                    <Icon name="lock" className="w-5 h-5 mr-2" /> Two-Factor Authentication is currently active on your account.
                  </div>
                ) : twoFaStep === 'code_sent' ? (
                  <div className="space-y-3 max-w-sm">
                    <label className="block text-sm font-medium text-gray-700">Enter 6-digit verification code sent to your email:</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={twoFaCode}
                      onChange={e => setTwoFaCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-center tracking-widest text-lg"
                    />
                    <button
                      onClick={handleVerify2FA}
                      disabled={loading || twoFaCode.length !== 6}
                      className="w-full bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
                    >
                      Confirm and Enable 2FA
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleStart2FA}
                    disabled={loading}
                    className="bg-dark text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    Enable 2-Factor Authentication
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VENDOR APPLICATION TAB */}
          {activeTab === 'vendor_apply' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Icon name="cart" className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Partner With LuxeLane</h2>
                  <p className="text-xs text-gray-500">Apply to become a verified luxury merchant on our marketplace.</p>
                </div>
              </div>

              {vendorAppSubmitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <Icon name="check" className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-emerald-900 text-lg">Application Submitted</h3>
                  <p className="text-xs text-emerald-700 max-w-md mx-auto">
                    Your vendor application has been received and is pending review by our platform curation team.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleVendorApply} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Display / Brand Name</label>
                      <input
                        type="text"
                        required
                        value={vendorApp.display_name}
                        onChange={e => setVendorApp({ ...vendorApp, display_name: e.target.value })}
                        placeholder="e.g. Maison Aurelia"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Legal Registered Entity Name</label>
                      <input
                        type="text"
                        required
                        value={vendorApp.legal_name}
                        onChange={e => setVendorApp({ ...vendorApp, legal_name: e.target.value })}
                        placeholder="e.g. Aurelia Fine Goods LLC"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tax ID / EIN / VAT</label>
                      <input
                        type="text"
                        value={vendorApp.tax_id}
                        onChange={e => setVendorApp({ ...vendorApp, tax_id: e.target.value })}
                        placeholder="XX-XXXXXXX"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Merchant Support Email</label>
                      <input
                        type="email"
                        value={vendorApp.support_email}
                        onChange={e => setVendorApp({ ...vendorApp, support_email: e.target.value })}
                        placeholder="concierge@brand.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Merchant Support Phone</label>
                      <input
                        type="text"
                        value={vendorApp.support_phone}
                        onChange={e => setVendorApp({ ...vendorApp, support_phone: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Brand Description & Heritage</label>
                    <textarea
                      rows={3}
                      value={vendorApp.description}
                      onChange={e => setVendorApp({ ...vendorApp, description: e.target.value })}
                      placeholder="Tell our curation committee about your brand, craftsmanship, and products..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={vendorAppSubmitting}
                      className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors shadow-sm disabled:opacity-50"
                    >
                      {vendorAppSubmitting ? 'Submitting Application...' : 'Submit Merchant Application'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* PAYMENT METHODS TAB (Sprint 11) */}
          {activeTab === 'payments' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Payment Methods</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Manage your tokenized payment cards for one-click luxury checkout.</p>
                </div>
                <div className="flex items-center space-x-2 text-xs text-stone-500 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-lg">
                  <Icon name="lock" className="w-4 h-4 text-emerald-600" />
                  <span>PCI-DSS Level 1 Vault Encrypted</span>
                </div>
              </div>

              {cardsLoading ? (
                <div className="text-center py-12 text-sm text-gray-500">Loading saved payment methods...</div>
              ) : savedCards.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center mx-auto mb-3">
                    <Icon name="credit-card" className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">No Saved Payment Cards</h3>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                    When you place an order, check "Save card for future purchases" to safely store tokenized credentials here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedCards.map((card) => (
                    <div
                      key={card.id}
                      className={`relative rounded-xl border p-5 transition-all ${
                        card.is_default ? 'border-primary bg-stone-50/50 shadow-sm' : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-7 rounded bg-stone-900 text-white flex items-center justify-center font-mono font-bold text-[10px] tracking-wider uppercase">
                            {card.brand}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm capitalize">
                              {card.nickname || `${card.brand} ending in ${card.last4}`}
                            </p>
                            <p className="text-xs text-gray-400 uppercase tracking-wider">{card.gateway.replace('_', ' ')}</p>
                          </div>
                        </div>
                        {card.is_default ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            Default
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-600 pt-2 border-t border-stone-100">
                        <div>
                          <span className="text-gray-400 block text-[10px]">EXPIRES</span>
                          <span className="font-medium font-mono">
                            {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {!card.is_default && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultCard(card.id)}
                              className="text-xs text-stone-600 hover:text-stone-900 font-medium px-2 py-1 rounded hover:bg-stone-100 transition-colors"
                            >
                              Make Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteCard(card.id)}
                            className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WALLET & STORE CREDIT TAB (Sprint 12) */}
          {activeTab === 'wallet' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Store Credit & Wallet</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Your personal platform credit ledger for seamless luxury shopping.</p>
                </div>
                <div className="flex items-center space-x-2 text-xs text-stone-500 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-lg">
                  <Icon name="check" className="w-4 h-4 text-emerald-600" />
                  <span>Double-Entry Immutable Ledger</span>
                </div>
              </div>

              {/* Luxury Balance Card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900 via-stone-800 to-stone-950 p-6 sm:p-8 text-white shadow-xl mb-8">
                <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold tracking-widest text-amber-400 uppercase">Available Store Credit</span>
                    <div className="flex items-baseline space-x-2 mt-2">
                      <span className="text-4xl sm:text-5xl font-extrabold tracking-tight font-serif text-white">
                        ${wallet ? wallet.balance : '0.00'}
                      </span>
                      <span className="text-sm font-semibold text-stone-400">USD</span>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur-md text-amber-300 border border-white/10">
                      ✓ Instant Redemption
                    </span>
                    <p className="text-[11px] text-stone-400 mt-2 max-w-xs">
                      Credit is automatically eligible to offset checkout grand totals on any verified atelier order.
                    </p>
                  </div>
                </div>
              </div>

              {/* Transactions Ledger */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4">Transaction History</h3>
                {walletLoading ? (
                  <div className="text-center py-12 text-sm text-gray-500">Loading wallet entries...</div>
                ) : walletTransactions.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
                    <p className="text-xs text-gray-500">No store credit transactions recorded yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 text-stone-600 border-b border-stone-200">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Date</th>
                          <th className="py-3 px-4 font-semibold">Activity</th>
                          <th className="py-3 px-4 font-semibold">Reference</th>
                          <th className="py-3 px-4 font-semibold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {walletTransactions.map((tx) => {
                          const num = parseFloat(tx.amount);
                          // In customer wallet account, credit (liability) is negative in DB, meaning +credit to user.
                          const isCredit = num <= 0;
                          return (
                            <tr key={tx.id} className="hover:bg-stone-50/60 transition-colors">
                              <td className="py-3 px-4 text-stone-500">
                                {new Date(tx.created_at).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </td>
                              <td className="py-3 px-4 font-medium text-stone-900">
                                {tx.memo || tx.reference_type.replace('_', ' ')}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-stone-400">
                                {tx.reference_type}
                              </td>
                              <td className={`py-3 px-4 text-right font-mono font-bold ${isCredit ? 'text-emerald-600' : 'text-stone-900'}`}>
                                {isCredit ? `+$${Math.abs(num).toFixed(2)}` : `-$${Math.abs(num).toFixed(2)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ADD / EDIT ADDRESS MODAL */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" id="address-modal">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{editingAddress ? 'Edit Address' : 'Add Delivery Address'}</h3>
              <button onClick={() => { setShowAddressModal(false); setEditingAddress(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSaveAddress} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                <input
                  type="text"
                  value={addressForm.label}
                  onChange={e => setAddressForm({ ...addressForm, label: e.target.value })}
                  placeholder="Home, Office, Apartment"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={addressForm.line1}
                  onChange={e => setAddressForm({ ...addressForm, line1: e.target.value })}
                  placeholder="123 Luxury Way"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Apartment / Suite (optional)</label>
                <input
                  type="text"
                  value={addressForm.line2 || ''}
                  onChange={e => setAddressForm({ ...addressForm, line2: e.target.value })}
                  placeholder="Apt 4B"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={e => setAddressForm({ ...addressForm, city: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State / Province</label>
                  <input
                    type="text"
                    value={addressForm.state || ''}
                    onChange={e => setAddressForm({ ...addressForm, state: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={addressForm.postal_code}
                    onChange={e => setAddressForm({ ...addressForm, postal_code: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={addressForm.country || 'US'}
                    onChange={e => setAddressForm({ ...addressForm, country: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={addressForm.type || 'both'}
                  onChange={e => setAddressForm({ ...addressForm, type: e.target.value as 'shipping' | 'billing' | 'both' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="both">Shipping & Billing</option>
                  <option value="shipping">Shipping only</option>
                  <option value="billing">Billing only</option>
                </select>
              </div>
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={addressForm.is_default || false}
                  onChange={e => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                  className="h-4 w-4 text-primary rounded border-gray-300"
                />
                <label htmlFor="is_default" className="ml-2 text-sm text-gray-700">
                  Set as default address
                </label>
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => { setShowAddressModal(false); setEditingAddress(null); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="address-save-btn"
                  disabled={loading}
                  className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
                >
                  {loading ? (editingAddress ? 'Saving...' : 'Validating & Saving...') : (editingAddress ? 'Save Changes' : 'Save Address')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL ORDER MODAL (Sprint 10) */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Cancel Order {cancelModalOrder.order_number}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Are you sure you wish to cancel this order? The inventory holds on the atelier pieces will be released and payment refunded.
            </p>
            <form onSubmit={handleCancelOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Reason for Cancellation</label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Changed delivery destination, ordered alternate piece..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-stone-900"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setCancelModalOrder(null); setCancelReason(''); }}
                  className="px-4 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPage;
