import React, { useState, useEffect } from 'react';
import { Icon } from '../../../components/Icon';
import API, { AddressData } from '../../../services/api';

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
  const [activeTab, setActiveTab] = useState<'profile' | 'addresses' | 'notifications' | 'security'>('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
  }, []);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
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
    </div>
  );
};

export default AccountPage;
