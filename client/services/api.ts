// API Service for LuxeLane Django Backend Integration (Sprint 0 - Sprint 2)
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Token and Session Management
export const TokenService = {
  getToken: (): string | null => localStorage.getItem('access_token'),
  setToken: (token: string): void => localStorage.setItem('access_token', token),
  getRefreshToken: (): string | null => localStorage.getItem('refresh_token'),
  setRefreshToken: (token: string): void => localStorage.setItem('refresh_token', token),
  getUser: (): any | null => {
    const raw = localStorage.getItem('user_data');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setUser: (user: any): void => localStorage.setItem('user_data', JSON.stringify(user)),
  removeTokens: (): void => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
  },
  getAuthHeader: (): HeadersInit => {
    const token = TokenService.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

// Generic API request handler
export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...TokenService.getAuthHeader(),
  };

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg =
        data.detail ||
        data.error?.message ||
        (data.email && data.email[0]) ||
        (data.password && data.password[0]) ||
        (data.non_field_errors && data.non_field_errors[0]) ||
        `API Error (${response.status})`;
      throw new Error(errorMsg);
    }

    return data as T;
  } catch (error) {
    console.error(`[API Request Error] ${endpoint}:`, error);
    throw error;
  }
}

// ── Auth APIs (Sprint 1) ─────────────────────────────────────────────────────
export const AuthAPI = {
  signup: async (data: {
    name: string;
    email: string;
    password: string;
    phone_number?: string;
  }) => {
    const nameParts = (data.name || '').trim().split(' ');
    const first_name = nameParts[0] || 'User';
    const last_name = nameParts.slice(1).join(' ') || '';

    return apiRequest<{ detail: string }>('/auth/register/', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        phone: data.phone_number || undefined,
        password: data.password,
        first_name,
        last_name,
      }),
    });
  },

  signupVendor: async (data: {
    name: string;
    email: string;
    password: string;
    phone_number?: string;
    legal_name: string;
    display_name: string;
  }) => {
    const nameParts = (data.name || '').trim().split(' ');
    const first_name = nameParts[0] || 'Vendor';
    const last_name = nameParts.slice(1).join(' ') || 'Owner';

    return apiRequest<{ detail: string }>('/auth/register/vendor/', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        phone: data.phone_number || undefined,
        password: data.password,
        first_name,
        last_name,
        legal_name: data.legal_name,
        display_name: data.display_name,
      }),
    });
  },

  login: async (credentials: { email_or_phone: string; password: string }) => {
    const res = await apiRequest<{
      access: string;
      refresh: string;
      user: {
        id: string;
        email: string;
        phone: string;
        first_name: string;
        last_name: string;
        role: string;
        is_verified: boolean;
        avatar_url: string | null;
        two_factor_enabled: boolean;
      };
    }>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (res.access) {
      TokenService.setToken(res.access);
      TokenService.setRefreshToken(res.refresh);
      TokenService.setUser(res.user);
    }

    return res;
  },

  verifyOtp: async (data: { destination: string; code: string; purpose: string }) => {
    return apiRequest<{ detail: string }>('/auth/verify-otp/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  resendOtp: async (data: { destination: string; purpose: string }) => {
    return apiRequest<{ detail: string }>('/auth/resend-otp/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  forgotPassword: async (email_or_phone: string) => {
    return apiRequest<{ detail: string }>('/auth/password/forgot/', {
      method: 'POST',
      body: JSON.stringify({ email_or_phone }),
    });
  },

  resetPassword: async (data: { destination: string; code: string; new_password: string }) => {
    return apiRequest<{ detail: string }>('/auth/password/reset/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  changePassword: async (data: { old_password: string; new_password: string }) => {
    return apiRequest<{ detail: string }>('/auth/password/change/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  logout: async () => {
    const refresh = TokenService.getRefreshToken();
    try {
      if (refresh) {
        await apiRequest('/auth/logout/', {
          method: 'POST',
          body: JSON.stringify({ refresh }),
        });
      }
    } finally {
      TokenService.removeTokens();
    }
  },
};

// ── Profile APIs (Sprint 1 & 2) ──────────────────────────────────────────────
export const ProfileAPI = {
  getProfile: async () => {
    return apiRequest<any>('/users/me/', { method: 'GET' });
  },

  updateProfile: async (data: { first_name?: string; last_name?: string; phone?: string; avatar_url?: string }) => {
    return apiRequest<any>('/users/me/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  enable2FA: async () => {
    return apiRequest<{ detail: string }>('/auth/2fa/enable/', { method: 'POST' });
  },

  verify2FA: async (code: string) => {
    return apiRequest<{ detail: string }>('/auth/2fa/verify/', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },
};

// ── Addresses APIs (Sprint 2) ────────────────────────────────────────────────
export interface AddressData {
  id?: string;
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country?: string;
  postal_code: string;
  latitude?: string | number;
  longitude?: string | number;
  type?: 'shipping' | 'billing' | 'both';
  is_default?: boolean;
  contact_phone?: string;
}

export const AddressAPI = {
  getAddresses: async (): Promise<AddressData[]> => {
    const res = await apiRequest<any>('/users/me/addresses/', { method: 'GET' });
    return res.results || res || [];
  },

  createAddress: async (data: AddressData): Promise<AddressData> => {
    return apiRequest<AddressData>('/users/me/addresses/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateAddress: async (id: string, data: Partial<AddressData>): Promise<AddressData> => {
    return apiRequest<AddressData>(`/users/me/addresses/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteAddress: async (id: string): Promise<void> => {
    return apiRequest<void>(`/users/me/addresses/${id}/`, {
      method: 'DELETE',
    });
  },

  validateAddress: async (data: { line1: string; city: string; state?: string; country?: string; postal_code: string }) => {
    return apiRequest<any>('/addresses/validate/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ── Media APIs (Sprint 2) ────────────────────────────────────────────────────
export const MediaAPI = {
  getPresignedUpload: async (params: {
    purpose: 'avatar' | 'vendor_document' | 'product_image' | 'review_media';
    content_type: string;
    size_bytes: number;
    filename?: string;
  }) => {
    return apiRequest<{
      upload_url: string;
      file_url: string;
      key: string;
      content_type: string;
      expires_at: string;
    }>('/media/presigned-upload/', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  uploadAvatar: async (file: File): Promise<string> => {
    // 1. Get presigned URL
    const presigned = await MediaAPI.getPresignedUpload({
      purpose: 'avatar',
      content_type: file.type || 'image/jpeg',
      size_bytes: file.size,
      filename: file.name,
    });

    // 2. Perform direct PUT upload
    try {
      await fetch(presigned.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      });
    } catch {
      // In local dev stub mode, continue with file_url
    }

    // 3. Update user profile with avatar_url
    await ProfileAPI.updateProfile({ avatar_url: presigned.file_url });
    return presigned.file_url;
  },
};

// ── Notifications APIs (Sprint 2) ────────────────────────────────────────────
export const NotificationAPI = {
  getNotifications: async () => {
    const res = await apiRequest<any>('/notifications/', { method: 'GET' });
    return res.results || res || [];
  },

  markRead: async (notificationId: string) => {
    return apiRequest<{ detail: string }>(`/notifications/${notificationId}/read/`, {
      method: 'POST',
    });
  },

  getPreferences: async () => {
    const res = await apiRequest<any>('/notifications/preferences/', { method: 'GET' });
    return res.results || res || [];
  },

  updatePreference: async (data: { channel: string; category?: string; is_enabled: boolean }) => {
    return apiRequest<any>('/notifications/preferences/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ── Vendor APIs (Sprint 3) ───────────────────────────────────────────────────
export interface VendorProfile {
  id?: string;
  legal_name: string;
  display_name: string;
  slug?: string;
  status?: 'pending' | 'active' | 'suspended' | 'rejected';
  description?: string;
  tax_id?: string;
  support_email?: string;
  support_phone?: string;
  logo_url?: string;
  banner_url?: string;
  rejection_reason?: string;
  rating_avg?: number;
  total_ratings?: number;
  created_at?: string;
  updated_at?: string;
}

export interface VendorStaffMember {
  id: string;
  user: string;
  user_email: string;
  user_name: string;
  staff_role: 'manager' | 'support' | 'fulfillment';
  is_active: boolean;
  created_at?: string;
}

export interface VendorDocItem {
  id: string;
  doc_type: 'business_registration' | 'tax_certificate' | 'id_proof' | 'bank_statement';
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note?: string;
  created_at?: string;
}

export interface VendorBankItem {
  id: string;
  account_holder: string;
  bank_name: string;
  account_number: string;
  routing_number?: string;
  account_type: 'checking' | 'savings';
  is_primary: boolean;
  created_at?: string;
}

export interface VendorPolicyData {
  id?: string;
  return_window_days: number;
  return_policy_text: string;
  shipping_policy_text: string;
  cancellation_policy_text: string;
  created_at?: string;
  updated_at?: string;
}

export const VendorAPI = {
  apply: async (data: {
    legal_name: string;
    display_name: string;
    description?: string;
    tax_id?: string;
    support_email?: string;
    support_phone?: string;
  }) => {
    return apiRequest<{ detail: string; vendor_id: string; slug: string }>('/vendors/apply/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getStorefront: async (slug: string) => {
    return apiRequest<VendorProfile>(`/vendors/${slug}/storefront/`, { method: 'GET' });
  },

  getMe: async (): Promise<VendorProfile> => {
    return apiRequest<VendorProfile>('/vendors/me/', { method: 'GET' });
  },

  updateMe: async (data: Partial<VendorProfile>): Promise<VendorProfile> => {
    return apiRequest<VendorProfile>('/vendors/me/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getStaff: async (): Promise<VendorStaffMember[]> => {
    const res = await apiRequest<any>('/vendors/me/staff/', { method: 'GET' });
    return res.results || res || [];
  },

  addStaff: async (data: { user: string | number; staff_role: string }): Promise<VendorStaffMember> => {
    return apiRequest<VendorStaffMember>('/vendors/me/staff/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateStaff: async (id: string, data: Partial<{ staff_role: string; is_active: boolean }>): Promise<VendorStaffMember> => {
    return apiRequest<VendorStaffMember>(`/vendors/me/staff/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  removeStaff: async (id: string): Promise<void> => {
    return apiRequest<void>(`/vendors/me/staff/${id}/`, {
      method: 'DELETE',
    });
  },

  getBankAccounts: async (): Promise<VendorBankItem[]> => {
    const res = await apiRequest<any>('/vendors/me/bank-accounts/', { method: 'GET' });
    return res.results || res || [];
  },

  addBankAccount: async (data: {
    account_holder: string;
    bank_name: string;
    account_number: string;
    routing_number?: string;
    account_type?: 'checking' | 'savings';
    is_primary?: boolean;
  }): Promise<VendorBankItem> => {
    return apiRequest<VendorBankItem>('/vendors/me/bank-accounts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteBankAccount: async (id: string): Promise<void> => {
    return apiRequest<void>(`/vendors/me/bank-accounts/${id}/`, {
      method: 'DELETE',
    });
  },

  getDocuments: async (): Promise<VendorDocItem[]> => {
    const res = await apiRequest<any>('/vendors/me/documents/', { method: 'GET' });
    return res.results || res || [];
  },

  uploadDocument: async (data: {
    doc_type: string;
    file_url: string;
  }): Promise<VendorDocItem> => {
    return apiRequest<VendorDocItem>('/vendors/me/documents/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getPolicy: async (): Promise<VendorPolicyData> => {
    return apiRequest<VendorPolicyData>('/vendors/me/policy/', { method: 'GET' });
  },

  updatePolicy: async (data: Partial<VendorPolicyData>): Promise<VendorPolicyData> => {
    return apiRequest<VendorPolicyData>('/vendors/me/policy/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

// ── Admin APIs (Sprint 1, 2 & 3) ─────────────────────────────────────────────
export interface CommissionRuleItem {
  id?: string;
  vendor?: string | null;
  vendor_name?: string;
  rate_pct: number | string;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
  note?: string;
  created_at?: string;
}

export const AdminAPI = {
  getUsers: async (params: { role?: string; is_active?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.role) query.set('role', params.role);
    if (params.is_active !== undefined) query.set('is_active', String(params.is_active));
    const qs = query.toString() ? `?${query.toString()}` : '';

    const res = await apiRequest<any>(`/admin/users/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  getUserDetail: async (id: string) => {
    return apiRequest<any>(`/admin/users/${id}/`, { method: 'GET' });
  },

  updateUserStatus: async (id: string, is_active: boolean, reason: string = '') => {
    return apiRequest<any>(`/admin/users/${id}/status/`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active, reason }),
    });
  },

  // Sprint 3 Admin Vendor Curation
  getVendors: async (params: { status?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';

    const res = await apiRequest<any>(`/admin/vendors/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  getVendorDetail: async (id: string) => {
    return apiRequest<any>(`/admin/vendors/${id}/`, { method: 'GET' });
  },

  updateVendorStatus: async (
    id: string,
    data: { status: 'active' | 'suspended' | 'rejected'; rejection_reason?: string }
  ) => {
    return apiRequest<any>(`/admin/vendors/${id}/status/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  reviewVendorDocument: async (
    vendorId: string,
    docId: string,
    data: { status: 'approved' | 'rejected'; reviewer_note?: string }
  ) => {
    return apiRequest<any>(`/admin/vendors/${vendorId}/documents/${docId}/review/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Sprint 3 Admin Commission Rules
  getCommissionRules: async (params: { vendor?: string; is_active?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.vendor) query.set('vendor', params.vendor);
    if (params.is_active !== undefined) query.set('is_active', String(params.is_active));
    const qs = query.toString() ? `?${query.toString()}` : '';

    const res = await apiRequest<any>(`/admin/commission-rules/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  createCommissionRule: async (data: Partial<CommissionRuleItem>) => {
    return apiRequest<CommissionRuleItem>('/admin/commission-rules/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCommissionRule: async (id: string, data: Partial<CommissionRuleItem>) => {
    return apiRequest<CommissionRuleItem>(`/admin/commission-rules/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCommissionRule: async (id: string): Promise<void> => {
    return apiRequest<void>(`/admin/commission-rules/${id}/`, {
      method: 'DELETE',
    });
  },
};

// Default export
export default {
  Auth: AuthAPI,
  Profile: ProfileAPI,
  Address: AddressAPI,
  Media: MediaAPI,
  Notification: NotificationAPI,
  Vendor: VendorAPI,
  Admin: AdminAPI,
  Token: TokenService,
};
