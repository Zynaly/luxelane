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
  getSessionKey: (): string => {
    let key = localStorage.getItem('guest_session_key');
    if (!key) {
      key = 'guest_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
      localStorage.setItem('guest_session_key', key);
    }
    return key;
  },
  getAuthHeader: (): Record<string, string> => {
    const token = TokenService.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

// Generic API request handler
export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Key': TokenService.getSessionKey(),
    ...TokenService.getAuthHeader(),
  };

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string> || {}),
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

  login: async (credentials: { email_or_phone?: string; email?: string; password: string }) => {
    const payload = {
      email_or_phone: credentials.email_or_phone || credentials.email || '',
      email: credentials.email || credentials.email_or_phone || '',
      password: credentials.password,
    };
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
      body: JSON.stringify(payload),
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

export interface PayoutAdjustmentItem {
  id: string;
  amount: string;
  reason: 'chargeback' | 'fee' | 'refund' | 'bonus' | 'other';
  note?: string;
  applied_at: string;
}

export interface PayoutLineItem {
  id: string;
  vendor_order_id: string;
  order_number: string;
  item_type: 'order_sale' | 'adjustment' | 'fee';
  gross_amount: string;
  commission_amount: string;
  net_amount: string;
  delivered_at?: string | null;
  created_at: string;
}

export interface VendorPayout {
  id: string;
  payout_reference: string;
  period_start: string;
  period_end: string;
  gross_sales: string;
  commission_deducted: string;
  adjustments_total: string;
  net_amount: string;
  status: 'scheduled' | 'processing' | 'paid' | 'failed' | 'cancelled';
  bank_account_info: Record<string, any>;
  notes?: string;
  processed_at?: string | null;
  created_at: string;
  updated_at: string;
  line_items?: PayoutLineItem[];
  adjustments?: PayoutAdjustmentItem[];
}

export interface VendorAnalyticsRevenueDay {
  date: string;
  gross_sales: string;
  net_earnings: string;
  orders: number;
}

export interface VendorAnalyticsTopProduct {
  variant_id: string;
  product_name: string;
  sku: string;
  units_sold: number;
  revenue: string;
}

export interface VendorAnalytics {
  days: number;
  start_date: string;
  end_date: string;
  total_orders: number;
  gross_sales: string;
  commission_paid: string;
  net_earnings: string;
  return_rate_pct: string;
  revenue_by_day: VendorAnalyticsRevenueDay[];
  top_products: VendorAnalyticsTopProduct[];
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

  // Sprint 15 Vendor Payouts & Analytics
  getMyPayouts: async (params: { status?: string } = {}): Promise<VendorPayout[]> => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiRequest<any>(`/vendors/me/payouts/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  getMyPayout: async (id: string): Promise<VendorPayout> => {
    return apiRequest<VendorPayout>(`/vendors/me/payouts/${id}/`, { method: 'GET' });
  },

  getAnalytics: async (days: number = 30): Promise<VendorAnalytics> => {
    return apiRequest<VendorAnalytics>(`/vendors/me/analytics/?days=${days}`, { method: 'GET' });
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

export interface AdminDashboardStats {
  gmv: string;
  active_vendors: number;
  orders_today: number;
  pending_payouts_count: number;
  pending_payouts_amount: string;
  ledger_drift_detected: boolean;
  ledger_drift_amount: string;
}

export interface SalesReportDailyBreakdown {
  date: string;
  order_count: number;
  sales: string;
}

export interface AdminSalesReport {
  start_date: string;
  end_date: string;
  total_orders: number;
  gross_sales: string;
  net_subtotal: string;
  shipping_total: string;
  tax_total: string;
  discount_total: string;
  commission_total: string;
  daily_breakdown: SalesReportDailyBreakdown[];
}

export interface InventoryReportWarehouse {
  warehouse_id: string;
  name: string;
  on_hand: number;
  reserved: number;
  sku_count: number;
}

export interface AdminInventoryReport {
  total_skus: number;
  total_units_on_hand: number;
  total_units_reserved: number;
  low_stock_skus: number;
  out_of_stock_skus: number;
  warehouses: InventoryReportWarehouse[];
}

export interface AdminVendorPerformanceItem {
  vendor_id: string;
  display_name: string;
  legal_name: string;
  status: string;
  rating_avg: string;
  order_count: number;
  gmv: string;
  commission_paid: string;
  net_earned: string;
  return_requests_count: number;
}

export interface ExportJob {
  id: string;
  resource: 'orders' | 'products' | 'vendors' | 'payouts' | 'sales';
  format: 'csv' | 'json';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_url?: string | null;
  result_json?: any;
  error_message?: string;
  created_by_email?: string;
  created_at: string;
  updated_at: string;
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

  // Sprint 15 Admin Payouts, Reports & Exports
  listPayouts: async (params: { vendor_id?: string; status?: string } = {}): Promise<VendorPayout[]> => {
    const q = new URLSearchParams();
    if (params.vendor_id) q.set('vendor_id', params.vendor_id);
    if (params.status) q.set('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiRequest<any>(`/admin/payouts/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  getPayout: async (id: string): Promise<VendorPayout> => {
    return apiRequest<VendorPayout>(`/admin/payouts/${id}/`, { method: 'GET' });
  },

  processPayouts: async (data: { vendor_id?: string; period_end?: string } = {}): Promise<{ detail: string; processed_count: number; payouts: VendorPayout[] }> => {
    return apiRequest<{ detail: string; processed_count: number; payouts: VendorPayout[] }>('/admin/payouts/process/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getDashboardStats: async (): Promise<AdminDashboardStats> => {
    return apiRequest<AdminDashboardStats>('/admin/dashboard/stats/', { method: 'GET' });
  },

  getSalesReport: async (params: { start_date?: string; end_date?: string } = {}): Promise<AdminSalesReport> => {
    const q = new URLSearchParams();
    if (params.start_date) q.set('start_date', params.start_date);
    if (params.end_date) q.set('end_date', params.end_date);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiRequest<AdminSalesReport>(`/admin/reports/sales/${qs}`, { method: 'GET' });
  },

  getInventoryReport: async (): Promise<AdminInventoryReport> => {
    return apiRequest<AdminInventoryReport>('/admin/reports/inventory/', { method: 'GET' });
  },

  getVendorPerformanceReport: async (): Promise<AdminVendorPerformanceItem[]> => {
    const res = await apiRequest<any>('/admin/reports/vendor-performance/', { method: 'GET' });
    return res.results || res || [];
  },

  createExport: async (resource: string, format: 'csv' | 'json' = 'csv'): Promise<ExportJob> => {
    return apiRequest<ExportJob>(`/admin/exports/${resource}/`, {
      method: 'POST',
      body: JSON.stringify({ format }),
    });
  },

  getExportStatus: async (resource: string, jobId: string): Promise<ExportJob> => {
    return apiRequest<ExportJob>(`/admin/exports/${resource}/${jobId}/`, { method: 'GET' });
  },
};

// ── Sprint 4: Catalog API Types ───────────────────────────────────────────────
export interface CategoryItem {
  id: string;
  parent: string | null;
  name: string;
  slug: string;
  icon_url?: string;
  is_active: boolean;
  level: number;
  children?: CategoryItem[];
  created_at?: string;
}

export interface BrandItem {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  created_at?: string;
}

export interface ProductImage {
  id?: string;
  image_url: string;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductTag {
  id?: string;
  tag: string;
}

export type ProductStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';

export interface ProductListItem {
  id: string;
  title: string;
  slug: string;
  base_price: string;
  primary_image?: string | null;
  vendor_display_name: string;
  category_name: string;
  brand_name?: string | null;
  primary_variant_id?: string | null;
  rating_avg: string;
  rating_count: number;
  status: ProductStatus;
  is_active: boolean;
  created_at: string;
}

export interface ProductAttributeValue {
  id: string;
  value: string;
}

export interface ProductAttribute {
  id: string;
  name: string;
  category?: string | null;
  category_name?: string | null;
  values: ProductAttributeValue[];
  created_at?: string;
}

export interface VariantAttributeItem {
  attribute_id: string;
  attribute_name: string;
  value_id: string;
  value: string;
}

export interface ProductVariant {
  id: string;
  product: string;
  sku: string;
  barcode?: string | null;
  price: string;
  compare_at_price?: string | null;
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  is_active: boolean;
  attributes: VariantAttributeItem[];
  images: ProductImage[];
  created_at?: string;
  updated_at?: string;
}

export interface SearchFacets {
  categories: Array<{ id: string; name: string; slug: string; count: number }>;
  brands: Array<{ id: string; name: string; slug: string; count: number }>;
  price_range: { min: number; max: number };
  total_results: number;
}

export interface SearchResultPayload {
  count: number;
  results: ProductListItem[];
  facets: SearchFacets;
}

export interface WishlistItem {
  id: string;
  product: ProductListItem;
  created_at: string;
}

export interface ProductDetail extends ProductListItem {
  description: string;
  rejection_reason?: string;
  images: ProductImage[];
  tags: ProductTag[];
  variants?: ProductVariant[];
  vendor_info: { id: string; display_name: string; slug: string };
  category_info: { id: string; name: string; slug: string };
  brand_info?: { id: string; name: string; slug: string } | null;
  updated_at: string;
}

export interface ProductWritePayload {
  title: string;
  description?: string;
  base_price: string;
  category: string;
  brand?: string | null;
  status?: ProductStatus;
  is_active?: boolean;
  images?: ProductImage[];
  tags?: string[];
}

export interface BulkImportJobStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  original_filename: string;
  total_rows: number;
  processed_rows: number;
  results: Array<{ row_number: number; sku: string; status: string; errors: string[] }>;
  error_message?: string;
  created_at: string;
}

// ── Category API (Sprint 4) ───────────────────────────────────────────────────
export const CategoryAPI = {
  list: async (): Promise<CategoryItem[]> => {
    const res = await apiRequest<any>('/categories/', { method: 'GET' });
    return res.results || res || [];
  },

  retrieve: async (id: string): Promise<CategoryItem> => {
    return apiRequest<CategoryItem>(`/categories/${id}/`, { method: 'GET' });
  },

  adminCreate: async (data: Partial<CategoryItem>): Promise<CategoryItem> => {
    return apiRequest<CategoryItem>('/admin/categories/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  adminUpdate: async (id: string, data: Partial<CategoryItem>): Promise<CategoryItem> => {
    return apiRequest<CategoryItem>(`/admin/categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  adminDelete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/admin/categories/${id}/`, { method: 'DELETE' });
  },

  adminList: async (): Promise<CategoryItem[]> => {
    const res = await apiRequest<any>('/admin/categories/', { method: 'GET' });
    return res.results || res || [];
  },
};

// ── Brand API (Sprint 4) ──────────────────────────────────────────────────────
export const BrandAPI = {
  list: async (): Promise<BrandItem[]> => {
    const res = await apiRequest<any>('/brands/', { method: 'GET' });
    return res.results || res || [];
  },

  adminCreate: async (data: { name: string; logo_url?: string }): Promise<BrandItem> => {
    return apiRequest<BrandItem>('/admin/brands/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  adminUpdate: async (id: string, data: Partial<BrandItem>): Promise<BrandItem> => {
    return apiRequest<BrandItem>(`/admin/brands/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  adminDelete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/admin/brands/${id}/`, { method: 'DELETE' });
  },

  adminList: async (): Promise<BrandItem[]> => {
    const res = await apiRequest<any>('/admin/brands/', { method: 'GET' });
    return res.results || res || [];
  },
};

// ── Product API (Sprint 4) ────────────────────────────────────────────────────
export const ProductAPI = {
  // Public endpoints
  list: async (params: { category?: string; brand?: string; search?: string } = {}): Promise<ProductListItem[]> => {
    const q = new URLSearchParams();
    if (params.category) q.set('category', params.category);
    if (params.brand) q.set('brand', params.brand);
    if (params.search) q.set('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiRequest<any>(`/products/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  retrieve: async (id: string): Promise<ProductDetail> => {
    return apiRequest<ProductDetail>(`/products/${id}/`, { method: 'GET' });
  },

  // Vendor endpoints
  myList: async (params: { status?: string; search?: string } = {}): Promise<ProductListItem[]> => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiRequest<any>(`/vendors/me/products/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  myCreate: async (data: ProductWritePayload): Promise<ProductDetail> => {
    return apiRequest<ProductDetail>('/vendors/me/products/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  myUpdate: async (id: string, data: Partial<ProductWritePayload>): Promise<ProductDetail> => {
    return apiRequest<ProductDetail>(`/vendors/me/products/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  myDelete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/vendors/me/products/${id}/`, { method: 'DELETE' });
  },

  // Bulk import
  bulkImport: async (rawCsv: string, filename?: string): Promise<{ job_id: string; status: string }> => {
    return apiRequest<{ job_id: string; status: string }>('/vendors/me/products/bulk-import/', {
      method: 'POST',
      body: JSON.stringify({ raw_csv: rawCsv }),
    });
  },

  bulkImportStatus: async (jobId: string): Promise<BulkImportJobStatus> => {
    return apiRequest<BulkImportJobStatus>(`/vendors/me/products/bulk-import/${jobId}/`, { method: 'GET' });
  },

  // Admin endpoints
  adminList: async (params: { status?: string; vendor?: string; search?: string } = {}): Promise<ProductListItem[]> => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.vendor) q.set('vendor', params.vendor);
    if (params.search) q.set('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiRequest<any>(`/admin/products/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  adminApprove: async (id: string): Promise<{ detail: string; status: string }> => {
    return apiRequest<{ detail: string; status: string }>(`/admin/products/${id}/approve/`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  },

  adminReject: async (id: string, rejection_reason: string): Promise<{ detail: string; status: string }> => {
    return apiRequest<{ detail: string; status: string }>(`/admin/products/${id}/reject/`, {
      method: 'PATCH',
      body: JSON.stringify({ rejection_reason }),
    });
  },

  related: async (id: string): Promise<ProductListItem[]> => {
    const res = await apiRequest<any>(`/products/${id}/related/`, { method: 'GET' });
    return res.results || res || [];
  },

  search: async (params: {
    q?: string;
    category?: string;
    brand?: string;
    vendor?: string;
    price_min?: string;
    price_max?: string;
    rating_min?: string;
    attribute_value?: string;
    ordering?: string;
  } = {}): Promise<SearchResultPayload> => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiRequest<SearchResultPayload>(`/products/search/${qs}`, { method: 'GET' });
  },

  // Reviews & Q&A (Sprint 14)
  listReviews: async (productId: string): Promise<ProductReview[]> => {
    const res = await apiRequest<any>(`/products/${productId}/reviews/`, { method: 'GET' });
    return res.results || res || [];
  },

  createReview: async (productId: string, data: {
    rating: number;
    title: string;
    comment: string;
    order_item_id?: string;
    media_urls?: string[];
  }): Promise<ProductReview> => {
    return apiRequest<ProductReview>(`/products/${productId}/reviews/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  replyReview: async (reviewId: string, comment: string): Promise<ReviewReply> => {
    return apiRequest<ReviewReply>(`/reviews/${reviewId}/reply/`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  adminModerateReview: async (reviewId: string, moderation_status: 'approved' | 'rejected'): Promise<ProductReview> => {
    return apiRequest<ProductReview>(`/admin/reviews/${reviewId}/moderate/`, {
      method: 'PATCH',
      body: JSON.stringify({ moderation_status }),
    });
  },

  listQuestions: async (productId: string): Promise<ProductQuestion[]> => {
    const res = await apiRequest<any>(`/products/${productId}/questions/`, { method: 'GET' });
    return res.results || res || [];
  },

  createQuestion: async (productId: string, question: string): Promise<ProductQuestion> => {
    return apiRequest<ProductQuestion>(`/products/${productId}/questions/`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  },

  answerQuestion: async (productId: string, questionId: string, answer: string): Promise<ProductAnswer> => {
    return apiRequest<ProductAnswer>(`/products/${productId}/questions/${questionId}/answers/`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
  },
};

// ── Reviews & Q&A Interfaces (Sprint 14) ──────────────────────────────────
export interface ReviewMedia {
  id: string;
  media_url: string;
  media_type: string;
  created_at?: string;
}

export interface ReviewReply {
  id: string;
  vendor_staff: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  comment: string;
  created_at: string;
}

export interface ProductReview {
  id: string;
  product: string;
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  rating: number;
  title: string;
  comment: string;
  is_verified_purchase: boolean;
  moderation_status: 'pending' | 'approved' | 'rejected';
  media: ReviewMedia[];
  reply?: ReviewReply;
  created_at: string;
}

export interface ProductAnswer {
  id: string;
  question: string;
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  answer: string;
  is_vendor_response: boolean;
  created_at: string;
}

export interface ProductQuestion {
  id: string;
  product: string;
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  question: string;
  is_approved: boolean;
  answers: ProductAnswer[];
  created_at: string;
}

// ── Attribute API (Sprint 5) ──────────────────────────────────────────────────
export const AttributeAPI = {
  list: async (params: { category?: string } = {}): Promise<ProductAttribute[]> => {
    const q = new URLSearchParams();
    if (params.category) q.set('category', params.category);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiRequest<any>(`/products/attributes/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  create: async (data: { name: string; category?: string; values_write?: string[] }): Promise<ProductAttribute> => {
    return apiRequest<ProductAttribute>('/products/attributes/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  addValue: async (attributeId: string, value: string): Promise<ProductAttributeValue> => {
    return apiRequest<ProductAttributeValue>(`/products/attributes/${attributeId}/values/`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
  },
};

// ── Variant API (Sprint 5) ────────────────────────────────────────────────────
export const VariantAPI = {
  list: async (productId: string): Promise<ProductVariant[]> => {
    const res = await apiRequest<any>(`/products/${productId}/variants/`, { method: 'GET' });
    return res.results || res || [];
  },

  create: async (productId: string, data: {
    sku: string;
    price: string;
    compare_at_price?: string;
    barcode?: string;
    attribute_value_ids?: string[];
    is_active?: boolean;
  }): Promise<ProductVariant> => {
    return apiRequest<ProductVariant>(`/products/${productId}/variants/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (productId: string, variantId: string, data: Partial<ProductVariant>): Promise<ProductVariant> => {
    return apiRequest<ProductVariant>(`/products/${productId}/variants/${variantId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (productId: string, variantId: string): Promise<void> => {
    return apiRequest<void>(`/products/${productId}/variants/${variantId}/`, {
      method: 'DELETE',
    });
  },

  generate: async (productId: string, data: {
    attribute_groups: string[][];
    base_price?: string;
    sku_prefix?: string;
  }): Promise<{ detail: string; count: number; variants: ProductVariant[] }> => {
    return apiRequest<{ detail: string; count: number; variants: ProductVariant[] }>(`/products/${productId}/variants/generate/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ── Wishlist API (Sprint 5) ───────────────────────────────────────────────────
export const WishlistAPI = {
  list: async (): Promise<WishlistItem[]> => {
    const res = await apiRequest<any>('/wishlist/', { method: 'GET' });
    return res.results || res || [];
  },

  add: async (productId: string): Promise<WishlistItem> => {
    return apiRequest<WishlistItem>('/wishlist/', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    });
  },

  remove: async (id: string): Promise<void> => {
    return apiRequest<void>(`/wishlist/${id}/`, { method: 'DELETE' });
  },

  toggle: async (productId: string): Promise<{ in_wishlist: boolean; detail: string }> => {
    return apiRequest<{ in_wishlist: boolean; detail: string }>('/wishlist/toggle/', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    });
  },
};

// ── Warehouse & Inventory Types (Sprint 6) ────────────────────────────────────
export interface Warehouse {
  id: string;
  vendor?: string | null;
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude?: string | null;
  longitude?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WarehouseStaff {
  id: string;
  warehouse: string;
  user: string;
  user_name?: string;
  user_email?: string;
  staff_role: 'manager' | 'worker';
  created_at?: string;
  updated_at?: string;
}

export interface InventoryItem {
  id: string;
  warehouse: string;
  warehouse_name?: string;
  variant: string;
  variant_sku?: string;
  product_title?: string;
  on_hand: number;
  reserved_cache: number;
  available: number;
  reorder_threshold: number;
  created_at?: string;
  updated_at?: string;
}

export interface StockMovementItem {
  id: string;
  inventory: string;
  variant_sku?: string;
  warehouse_name?: string;
  quantity_delta: number;
  movement_type: string;
  reason: string;
  reference_id?: string | null;
  performed_by?: string | null;
  performed_by_name?: string;
  created_at: string;
}

export interface VariantWarehouseAvailability {
  warehouse_id: string;
  warehouse_name: string;
  on_hand: number;
  reserved_cache: number;
  available: number;
}

export interface VariantAvailability {
  variant_id: string;
  sku: string;
  product_title: string;
  total_available: number;
  total_on_hand: number;
  warehouses: VariantWarehouseAvailability[];
}

export interface StockTransferItem {
  id?: string;
  variant: string;
  variant_sku?: string;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  from_warehouse: string;
  from_warehouse_name?: string;
  to_warehouse: string;
  to_warehouse_name?: string;
  status: 'draft' | 'pending' | 'in_transit' | 'received' | 'cancelled';
  requested_by?: string;
  requested_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  notes?: string;
  items: StockTransferItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id?: string;
  variant: string;
  variant_sku?: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost: string;
}

export interface PurchaseOrder {
  id: string;
  warehouse: string;
  warehouse_name?: string;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  supplier_name: string;
  notes?: string;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

// ── Warehouse & Inventory APIs (Sprint 6) ─────────────────────────────────────
export const WarehouseAPI = {
  list: async (params?: { is_active?: boolean; vendor?: string; search?: string }): Promise<Warehouse[]> => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', String(params.is_active));
    if (params?.vendor) searchParams.append('vendor', params.vendor);
    if (params?.search) searchParams.append('search', params.search);
    const query = searchParams.toString();
    const res = await apiRequest<any>(`/warehouses/${query ? `?${query}` : ''}`, { method: 'GET' });
    return res.results || res || [];
  },

  get: async (id: string): Promise<Warehouse> => {
    return apiRequest<Warehouse>(`/warehouses/${id}/`, { method: 'GET' });
  },

  create: async (data: Partial<Warehouse>): Promise<Warehouse> => {
    return apiRequest<Warehouse>('/warehouses/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<Warehouse>): Promise<Warehouse> => {
    return apiRequest<Warehouse>(`/warehouses/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/warehouses/${id}/`, { method: 'DELETE' });
  },

  // Staff endpoints
  listStaff: async (warehouseId: string): Promise<WarehouseStaff[]> => {
    const res = await apiRequest<any>(`/warehouses/${warehouseId}/staff/`, { method: 'GET' });
    return res.results || res || [];
  },

  addStaff: async (warehouseId: string, data: { user: string; staff_role: 'manager' | 'worker' }): Promise<WarehouseStaff> => {
    return apiRequest<WarehouseStaff>(`/warehouses/${warehouseId}/staff/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeStaff: async (warehouseId: string, staffId: string): Promise<void> => {
    return apiRequest<void>(`/warehouses/${warehouseId}/staff/${staffId}/`, { method: 'DELETE' });
  },

  // Inventory for a facility
  getInventory: async (warehouseId: string, search?: string): Promise<InventoryItem[]> => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await apiRequest<any>(`/warehouses/${warehouseId}/inventory/${query}`, { method: 'GET' });
    return res.results || res || [];
  },
};

export const InventoryAPI = {
  adjust: async (data: {
    warehouse_id: string;
    variant_id: string;
    quantity_delta: number;
    movement_type?: string;
    reason?: string;
  }): Promise<{ detail: string; current_on_hand: number; available: number; movement: StockMovementItem }> => {
    return apiRequest<{ detail: string; current_on_hand: number; available: number; movement: StockMovementItem }>('/inventory/adjust/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  bulkUpdate: async (items: Array<{
    warehouse_id: string;
    variant_id: string;
    quantity_delta: number;
    reason?: string;
  }>): Promise<{ detail: string; count: number; movements: StockMovementItem[] }> => {
    return apiRequest<{ detail: string; count: number; movements: StockMovementItem[] }>('/inventory/bulk-update/', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  getLowStock: (): Promise<InventoryItem[]> => {
    return apiRequest<InventoryItem[]>('/inventory/low-stock/', { method: 'GET' });
  },

  getAvailability: (variantId: string): Promise<VariantAvailability> => {
    return apiRequest<VariantAvailability>(`/inventory/availability/${variantId}/`, { method: 'GET' });
  },
};

export const StockTransferAPI = {
  list: async (status?: string): Promise<StockTransfer[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiRequest<any>(`/stock-transfers/${query}`, { method: 'GET' });
    return res.results || res || [];
  },

  create: async (data: {
    from_warehouse: string;
    to_warehouse: string;
    notes?: string;
    items: Array<{ variant: string; quantity: number }>;
  }): Promise<StockTransfer> => {
    return apiRequest<StockTransfer>('/stock-transfers/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  dispatch: async (id: string): Promise<StockTransfer> => {
    return apiRequest<StockTransfer>(`/stock-transfers/${id}/dispatch/`, {
      method: 'POST',
    });
  },

  receive: async (id: string): Promise<StockTransfer> => {
    return apiRequest<StockTransfer>(`/stock-transfers/${id}/receive/`, {
      method: 'POST',
    });
  },

  cancel: async (id: string): Promise<StockTransfer> => {
    return apiRequest<StockTransfer>(`/stock-transfers/${id}/cancel/`, {
      method: 'POST',
    });
  },
};

export const PurchaseOrderAPI = {
  list: async (status?: string): Promise<PurchaseOrder[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiRequest<any>(`/purchase-orders/${query}`, { method: 'GET' });
    return res.results || res || [];
  },

  create: async (data: {
    warehouse: string;
    supplier_name: string;
    notes?: string;
    items: Array<{ variant: string; qty_ordered: number; unit_cost: string }>;
  }): Promise<PurchaseOrder> => {
    return apiRequest<PurchaseOrder>('/purchase-orders/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  receive: async (id: string, items?: Array<{ item_id: string; qty_received: number }>): Promise<PurchaseOrder> => {
    return apiRequest<PurchaseOrder>(`/purchase-orders/${id}/receive/`, {
      method: 'POST',
      body: JSON.stringify({ items: items || [] }),
    });
  },
};

// ── Sprint 7: Reservations & Allocation Types & APIs ──────────────────────────
export interface InventoryReservation {
  id: string;
  inventory: string;
  warehouse_id: string;
  warehouse_name: string;
  variant_sku: string;
  product_title: string;
  cart_item_id?: string | null;
  order_item_id?: string | null;
  quantity: number;
  status: 'HELD' | 'COMMITTED' | 'RELEASED' | 'EXPIRED';
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface AllocationItemRequest {
  variant_id: string;
  quantity: number;
}

export interface AllocationPreviewRequest {
  items: AllocationItemRequest[];
  shipping_address_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AllocationItemResponse {
  variant_id: string;
  sku: string;
  product_title: string;
  quantity: number;
}

export interface AllocationSplit {
  warehouse_id: string;
  warehouse_name: string;
  distance_km: number;
  items: AllocationItemResponse[];
}

export interface AllocationPreviewResponse {
  splits: AllocationSplit[];
  total_splits: number;
  feasible: boolean;
  unallocated?: Array<{
    variant_id: string;
    sku: string;
    requested: number;
    allocated: number;
    deficit: number;
  }>;
}

export const AllocationAPI = {
  preview: async (data: AllocationPreviewRequest): Promise<AllocationPreviewResponse> => {
    return apiRequest<AllocationPreviewResponse>('/inventory/allocate/preview/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export const ReservationAPI = {
  adminList: async (status?: string): Promise<InventoryReservation[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiRequest<any>(`/admin/inventory-reservations/${query}`, { method: 'GET' });
    return res.results || res || [];
  },
};

// ── Sprint 8: Cart, Pricing & Promotions Interfaces & APIs ───────────────────
export interface CartItem {
  id: string;
  variant: string;
  variant_sku: string;
  product_title: string;
  product_id: string;
  quantity: number;
  price_snapshot: string;
  current_price: string;
  line_subtotal: string;
  created_at: string;
  updated_at: string;
}

export interface PriceBreakdown {
  subtotal: string;
  discount_total: string;
  tax_total: string;
  tax_rate_pct: string;
  shipping_total: string;
  grand_total: string;
  currency: string;
  applied_coupon_code: string | null;
  item_count: number;
}

export interface Cart {
  id: string;
  user: string | null;
  session_key: string | null;
  status: 'active' | 'abandoned' | 'converted';
  applied_coupon: string | null;
  applied_coupon_code: string | null;
  items: CartItem[];
  price_breakdown: PriceBreakdown;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: string;
  scope: 'GLOBAL' | 'PRODUCT' | 'CATEGORY' | 'VENDOR';
  scope_target_id?: string | null;
  min_cart_value: string;
  usage_limit_total?: number | null;
  usage_limit_per_user?: number;
  usage_count?: number;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
}

export interface CartValidationIssue {
  item_id: string;
  sku: string;
  product_title: string;
  code: 'PRICE_CHANGED' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'VARIANT_UNAVAILABLE' | string;
  message: string;
  old_price?: string;
  new_price?: string;
  requested?: number;
  available?: number;
}

export interface CartValidationResult {
  is_valid: boolean;
  issues: CartValidationIssue[];
}

export interface TaxQuote {
  country: string;
  state: string;
  rate_pct: string;
  tax_amount: string;
}

export const CartAPI = {
  get: async (): Promise<Cart> => {
    return apiRequest<Cart>('/cart/');
  },
  addItem: async (data: { variant_id: string; quantity?: number }): Promise<CartItem> => {
    return apiRequest<CartItem>('/cart/items/', {
      method: 'POST',
      body: JSON.stringify({
        variant_id: data.variant_id,
        quantity: data.quantity ?? 1,
      }),
    });
  },
  updateItem: async (itemId: string, quantity: number): Promise<CartItem> => {
    return apiRequest<CartItem>(`/cart/items/${itemId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  },
  removeItem: async (itemId: string): Promise<void> => {
    return apiRequest<void>(`/cart/items/${itemId}/`, {
      method: 'DELETE',
    });
  },
  applyCoupon: async (code: string): Promise<Cart> => {
    return apiRequest<Cart>('/cart/apply-coupon/', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },
  removeCoupon: async (): Promise<Cart> => {
    return apiRequest<Cart>('/cart/remove-coupon/', {
      method: 'POST',
    });
  },
  getSummary: async (): Promise<PriceBreakdown> => {
    return apiRequest<PriceBreakdown>('/cart/summary/');
  },
  validate: async (): Promise<CartValidationResult> => {
    return apiRequest<CartValidationResult>('/cart/validate/', {
      method: 'POST',
    });
  },
  merge: async (guestSessionKey?: string): Promise<Cart> => {
    const key = guestSessionKey || TokenService.getSessionKey();
    return apiRequest<Cart>('/cart/merge/', {
      method: 'POST',
      body: JSON.stringify({ guest_session_key: key }),
    });
  },
};

export const CouponAPI = {
  list: async (): Promise<Coupon[]> => {
    const res = await apiRequest<any>('/coupons/');
    return res.results || res || [];
  },
  validate: async (code: string, subtotal: number = 0): Promise<{ is_valid: boolean; discount_amount: string; message: string }> => {
    return apiRequest<{ is_valid: boolean; discount_amount: string; message: string }>('/coupons/validate/', {
      method: 'POST',
      body: JSON.stringify({ code, subtotal }),
    });
  },
  adminList: async (): Promise<Coupon[]> => {
    const res = await apiRequest<any>('/admin/coupons/');
    return res.results || res || [];
  },
  adminCreate: async (data: Partial<Coupon>): Promise<Coupon> => {
    return apiRequest<Coupon>('/admin/coupons/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  adminUpdate: async (id: string, data: Partial<Coupon>): Promise<Coupon> => {
    return apiRequest<Coupon>(`/admin/coupons/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  adminDelete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/admin/coupons/${id}/`, {
      method: 'DELETE',
    });
  },
};

export const TaxAPI = {
  quote: async (data: { country?: string; state?: string; subtotal: number; address_id?: string }): Promise<TaxQuote> => {
    return apiRequest<TaxQuote>('/tax/quote/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ── Sprint 9: Shipping Rates & Packing Interfaces & APIs ─────────────────────
export interface Carrier {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  tracking_url_template?: string;
  created_at: string;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShippingRateCard {
  id: string;
  zone: string;
  zone_name: string;
  vendor: string | null;
  vendor_name: string | null;
  service_level: string;
  base_rate: string;
  per_kg_rate: string;
  min_days: number;
  max_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RateQuote {
  id: string;
  cart_or_order_ref: string;
  carrier_code: string;
  carrier_name: string;
  status?: string;
  is_enabled?: boolean;
  service_level: string;
  amount: string;
  currency: string;
  quote_id: string;
  estimated_days: number;
  expires_at: string;
  redeemed: boolean;
  metadata?: Record<string, any>;
}

export interface CheckoutRatesRequest {
  cart_id?: string;
  shipping_address_id?: string;
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  line1?: string;
}

// ── Sprint 13 Interfaces: Shipments, Labels & Tracking ──────────────────────

export interface ShipmentTrackingEvent {
  id: string;
  status: string;
  carrier_status_code: string;
  description: string;
  location: string;
  event_timestamp: string;
  raw_payload?: Record<string, any>;
  created_at: string;
}

export interface ShipmentPackage {
  id: string;
  package_sequence: number;
  weight_kg: string;
  length_cm?: string | null;
  width_cm?: string | null;
  height_cm?: string | null;
  tracking_number: string;
  created_at: string;
}

export interface ShipmentItem {
  id: string;
  package?: string | null;
  order_item: string;
  sku: string;
  product_name: string;
  quantity: number;
  created_at: string;
}

export interface Shipment {
  id: string;
  order: string;
  order_number: string;
  vendor_order?: string | null;
  vendor_name?: string | null;
  warehouse?: string | null;
  carrier?: string | null;
  carrier_name?: string | null;
  tracking_number: string;
  tracking_url: string;
  label_url: string;
  label_format: string;
  rate_quote?: string | null;
  is_self_shipped: boolean;
  status: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  packages: ShipmentPackage[];
  items: ShipmentItem[];
  tracking_events: ShipmentTrackingEvent[];
  created_at: string;
  updated_at: string;
}

export interface CreateShipmentRequest {
  order_id: string;
  vendor_order_id?: string;
  warehouse_id?: string;
  carrier_id?: string;
  rate_quote_id?: string;
  tracking_number?: string;
  tracking_url?: string;
  is_self_shipped?: boolean;
  items: {
    order_item_id: string;
    quantity: number;
  }[];
  packages?: {
    package_sequence?: number;
    weight_kg?: string;
    length_cm?: string;
    width_cm?: string;
    height_cm?: string;
    tracking_number?: string;
  }[];
}

export interface PublicTrackingResponse {
  tracking_number: string;
  status: string;
  carrier: string;
  carrier_code: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  tracking_url?: string;
  events: ShipmentTrackingEvent[];
}

export const ShippingAPI = {
  getCarriers: async (): Promise<Carrier[]> => {
    const res = await apiRequest<any>('/shipping/carriers/');
    return res.results || res || [];
  },
  getCheckoutRates: async (data: CheckoutRatesRequest): Promise<RateQuote[]> => {
    const res = await apiRequest<any>('/checkout/rates/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.results || res || [];
  },
  getRateCards: async (): Promise<ShippingRateCard[]> => {
    const res = await apiRequest<any>('/shipping/rate-cards/');
    return res.results || res || [];
  },
  getZones: async (): Promise<ShippingZone[]> => {
    const res = await apiRequest<any>('/shipping/zones/');
    return res.results || res || [];
  },
  adminGetCredentials: async (): Promise<any[]> => {
    const res = await apiRequest<any>('/admin/shipping/carrier-credentials/');
    return res.results || res || [];
  },
  adminCreateCredential: async (data: any): Promise<any> => {
    return apiRequest<any>('/admin/shipping/carrier-credentials/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Sprint 13: Shipment Fulfillment, Labels & Tracking
  getShipments: async (params: { order_id?: string; status?: string } = {}): Promise<Shipment[]> => {
    const query = new URLSearchParams();
    if (params.order_id) query.set('order_id', params.order_id);
    if (params.status) query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<any>(`/shipping/shipments/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  getVendorShipments: async (): Promise<Shipment[]> => {
    const res = await apiRequest<any>('/shipping/vendor/me/shipments/', { method: 'GET' });
    return res.results || res || [];
  },

  getShipment: async (id: string): Promise<Shipment> => {
    return apiRequest<Shipment>(`/shipping/shipments/${id}/`, { method: 'GET' });
  },

  createShipment: async (data: CreateShipmentRequest): Promise<Shipment> => {
    return apiRequest<Shipment>('/shipping/shipments/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getLabel: async (id: string): Promise<{
    shipment_id: string;
    label_url: string;
    label_format: string;
    tracking_number: string;
  }> => {
    return apiRequest<{
      shipment_id: string;
      label_url: string;
      label_format: string;
      tracking_number: string;
    }>(`/shipping/shipments/${id}/label/`, { method: 'POST' });
  },

  cancelShipment: async (id: string, reason?: string): Promise<Shipment> => {
    return apiRequest<Shipment>(`/shipping/shipments/${id}/cancel/`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    });
  },

  track: async (trackingNumber: string): Promise<PublicTrackingResponse> => {
    return apiRequest<PublicTrackingResponse>(`/shipping/track/${encodeURIComponent(trackingNumber)}/`, {
      method: 'GET',
    });
  },

  postCarrierWebhook: async (data: {
    tracking_number: string;
    status: string;
    description?: string;
    location?: string;
  }): Promise<{ received: boolean; tracking_number: string }> => {
    return apiRequest<{ received: boolean; tracking_number: string }>('/shipping/carrier-webhook/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ── Order APIs (Sprint 10) ───────────────────────────────────────────────────
export interface OrderItem {
  id: string;
  vendor_order: string;
  variant: string;
  sku: string;
  product_title: string;
  variant_name: string;
  quantity: number;
  unit_price: string;
  line_subtotal: string;
  tax_amount: string;
  total_amount: string;
  allocated_warehouse?: string | null;
  allocated_warehouse_name?: string;
  fulfilment_status: 'pending' | 'allocated' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  tracking_number?: string;
  cancelled_at?: string | null;
  cancellation_reason?: string;
}

export interface VendorOrder {
  id: string;
  order: string;
  vendor: string;
  vendor_name: string;
  subtotal: string;
  shipping_amount: string;
  commission_amount: string;
  commission_rate_snapshot: string;
  net_payout: string;
  status: 'pending' | 'acknowledged' | 'processing' | 'partially_shipped' | 'shipped' | 'delivered' | 'cancelled';
  carrier?: string | null;
  tracking_number?: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  items?: OrderItem[];
  created_at: string;
}

export interface OrderStatusHistory {
  id: string;
  from_status: string;
  to_status: string;
  reason?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  order: string;
  invoice_number: string;
  issued_at: string;
  subtotal: string;
  tax_total: string;
  shipping_total: string;
  discount_total: string;
  grand_total: string;
  currency: string;
  pdf_url?: string;
  is_paid: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  customer?: string | null;
  shipping_address_snapshot: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
  };
  billing_address_snapshot: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
  };
  currency: string;
  subtotal: string;
  discount_total: string;
  shipping_total: string;
  tax_total: string;
  grand_total: string;
  status: 'pending_payment' | 'paid' | 'processing' | 'partially_fulfilled' | 'fulfilled' | 'cancelled' | 'return_requested' | 'refunded';
  placed_at: string;
  is_guest_order: boolean;
  guest_email?: string;
  guest_phone?: string;
  vendor_orders?: VendorOrder[];
  status_history?: OrderStatusHistory[];
  invoice?: Invoice | null;
}

export interface PlaceOrderRequest {
  cart_id?: string;
  rate_quote_id: string;
  shipping_address_id?: string;
  billing_address_id?: string;
  shipping_address_data?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country?: string;
    postal_code: string;
  };
  billing_address_data?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country?: string;
    postal_code: string;
  };
  guest_email?: string;
  guest_phone?: string;
  payment_method?: string;
  payment_token?: string;
  idempotency_key?: string;
}

export interface OrderTrackRequest {
  order_number: string;
  email: string;
}

export const OrderAPI = {
  placeOrder: async (data: PlaceOrderRequest): Promise<{
    order_id: string;
    order_number: string;
    status: string;
    grand_total: string;
    currency: string;
    payment_status: string;
    payment_reference?: string;
    invoice_number?: string;
    vendor_orders_count?: number;
    placed_at: string;
  }> => {
    const headers: Record<string, string> = {};
    if (data.idempotency_key) {
      headers['Idempotency-Key'] = data.idempotency_key;
    }
    return apiRequest<any>('/checkout/place-order/', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  },

  list: async (params: { status?: string; page?: number } = {}): Promise<Order[]> => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<any>(`/orders/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  get: async (id: string): Promise<Order> => {
    return apiRequest<Order>(`/orders/${id}/`, { method: 'GET' });
  },

  cancel: async (id: string, reason: string): Promise<Order> => {
    return apiRequest<Order>(`/orders/${id}/cancel/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  cancelItem: async (orderId: string, itemId: string, reason: string): Promise<any> => {
    return apiRequest<any>(`/orders/${orderId}/items/${itemId}/cancel/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getInvoice: async (id: string): Promise<Invoice> => {
    return apiRequest<Invoice>(`/orders/${id}/invoice/`, { method: 'GET' });
  },

  track: async (data: OrderTrackRequest): Promise<Order> => {
    return apiRequest<Order>('/orders/track/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  vendorOrders: async (): Promise<VendorOrder[]> => {
    const res = await apiRequest<any>('/vendors/me/orders/', { method: 'GET' });
    return res.results || res || [];
  },

  adminOrders: async (params: { status?: string; search?: string } = {}): Promise<Order[]> => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<any>(`/admin/orders/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  // Reverse Logistics & Returns (Sprint 14)
  requestReturn: async (orderId: string, itemId: string, data: { reason: string; evidence_media?: string[] }): Promise<ReturnRequest> => {
    return apiRequest<ReturnRequest>(`/orders/${orderId}/items/${itemId}/return/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  listReturns: async (): Promise<ReturnRequest[]> => {
    const res = await apiRequest<any>('/returns/', { method: 'GET' });
    return res.results || res || [];
  },

  getReturn: async (id: string): Promise<ReturnRequest> => {
    return apiRequest<ReturnRequest>(`/returns/${id}/`, { method: 'GET' });
  },

  decideReturn: async (id: string, data: { decision: 'approved' | 'rejected'; rejection_reason?: string }): Promise<ReturnRequest> => {
    return apiRequest<ReturnRequest>(`/returns/${id}/decision/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  receiveReturn: async (id: string, data: { condition?: string; action?: string; warehouse_id?: string } = {}): Promise<ReturnRequest> => {
    return apiRequest<ReturnRequest>(`/returns/${id}/receive/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  instantRefund: async (returnId: string): Promise<Refund> => {
    return apiRequest<Refund>(`/returns/${returnId}/instant-refund/`, {
      method: 'POST',
    });
  },
};

// ── Reverse Logistics / Return Interfaces (Sprint 14) ───────────────────────
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'in_transit' | 'received' | 'closed';

export interface ReturnShipment {
  id: string;
  tracking_number: string;
  carrier: string;
  label_url?: string;
  status: string;
  shipped_at?: string;
  delivered_at?: string;
  created_at: string;
}

export interface ReturnRequest {
  id: string;
  order_item: string;
  user: any;
  reason: string;
  status: ReturnStatus;
  evidence_media?: string[];
  rejection_reason?: string;
  return_shipment?: ReturnShipment;
  created_at: string;
  closed_at?: string;
}

// ── Payment Interfaces & API (Sprint 11) ────────────────────────────────────

export interface SavedCard {
  id: string;
  gateway: 'stripe' | 'authorize_net';
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  nickname?: string;
  created_at: string;
}

export interface PaymentAttempt {
  id: string;
  order: string;
  gateway: string;
  amount: string;
  currency: string;
  status: 'initiated' | 'requires_action' | 'authorized' | 'captured' | 'failed' | 'cancelled';
  gateway_ref: string;
  error_message?: string;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  payment_attempt: string;
  transaction_type: 'authorization' | 'capture' | 'sale' | 'refund' | 'void';
  amount: string;
  currency: string;
  status: 'pending' | 'success' | 'failed';
  gateway_transaction_id: string;
  raw_response?: Record<string, any>;
  created_at: string;
}

export interface PaymentGatewayDetail {
  code: string;
  name: string;
  status: 'active' | 'coming_soon' | 'disabled';
  is_enabled: boolean;
  badge: string;
  description: string;
}

export interface PaymentMethodsResponse {
  available_gateways?: string[];
  gateways: PaymentGatewayDetail[] | any[];
  saved_cards?: SavedCard[];
  stripe?: {
    publishable_key: string;
  };
  authorize_net?: {
    api_login_id: string;
    client_key: string;
    environment: string;
  };
}

export interface StripeIntentResponse {
  payment_attempt_id: string;
  client_secret: string;
  stripe_payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface AuthorizeNetChargeRequest {
  order_id: string;
  opaque_data_descriptor: string;
  opaque_data_value: string;
  save_card?: boolean;
}

// ── Ledger, Escrow, Wallet & COD Interfaces (Sprint 12) ─────────────────────

export interface WalletBalance {
  balance: string;
  currency: string;
  account_key: string;
}

export interface WalletTransaction {
  id: string;
  account: string;
  account_key: string;
  amount: string;
  entry_group_id: string;
  reference_type: string;
  reference_id?: string;
  memo?: string;
  created_at: string;
}

export interface VendorEscrowHold {
  id: string;
  vendor_order: string;
  vendor: string;
  vendor_name: string;
  order_number: string;
  gross_amount: string;
  commission_amount: string;
  net_vendor_amount: string;
  currency: string;
  status: 'held' | 'eligible_for_release' | 'released' | 'disputed' | 'refunded';
  held_at: string;
  eligible_at?: string;
  released_at?: string;
  release_reference?: string;
  notes?: string;
}

export interface VendorEscrowSummary {
  vendor_id: string;
  vendor_name: string;
  held_balance: string;
  eligible_balance: string;
  released_balance: string;
  currency: string;
  recent_holds: VendorEscrowHold[];
}

export interface CODSendOTPResponse {
  status: string;
  order_number: string;
  message: string;
  otp_code?: string;
}

export interface CODCollectResponse {
  status: string;
  receipt_number: string;
  order_number: string;
  amount?: string;
}

export interface LedgerAccount {
  id: string;
  account_key: string;
  account_type: string;
  owner_user?: string;
  owner_vendor_id?: string;
  currency: string;
  balance: string;
  created_at: string;
}

export interface LedgerReconciliationReport {
  is_balanced: boolean;
  total_debits: string;
  total_credits: string;
  net_discrepancy: string;
  accounts_count: number;
  entries_count: number;
}

// ── Refund Interfaces (Sprint 14) ──────────────────────────────────────────
export interface Refund {
  id: string;
  order: string;
  vendor_order?: string;
  return_request?: string;
  amount: string;
  currency: string;
  method: 'original_payment' | 'wallet' | 'manual';
  status: 'pending' | 'succeeded' | 'failed';
  reason?: string;
  gateway_refund_id?: string;
  ledger_entry_group_id?: string;
  processed_by?: any;
  created_at: string;
}

export const PaymentAPI = {
  // Order Refunds (Sprint 14)
  refundOrder: async (orderId: string, data: { amount: string | number; reason?: string; method?: string }): Promise<Refund> => {
    return apiRequest<Refund>(`/payments/orders/${orderId}/refund/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  adminListRefunds: async (params: { order_id?: string } = {}): Promise<Refund[]> => {
    const query = new URLSearchParams();
    if (params.order_id) query.set('order_id', params.order_id);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<any>(`/admin/refunds/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  adminGetRefund: async (id: string): Promise<Refund> => {
    return apiRequest<Refund>(`/admin/refunds/${id}/`, { method: 'GET' });
  },

  getMethods: async (): Promise<PaymentMethodsResponse> => {
    return apiRequest<PaymentMethodsResponse>('/payments/methods/', { method: 'GET' });
  },

  listCards: async (): Promise<{ count: number; results: SavedCard[] }> => {
    const res = await apiRequest<any>('/payments/cards/', { method: 'GET' });
    if (Array.isArray(res)) {
      return { count: res.length, results: res };
    }
    return { count: res.count || 0, results: res.results || [] };
  },

  deleteCard: async (cardId: string): Promise<void> => {
    await apiRequest<void>(`/payments/cards/${cardId}/`, { method: 'DELETE' });
  },

  setDefaultCard: async (cardId: string): Promise<SavedCard> => {
    return apiRequest<SavedCard>(`/payments/cards/${cardId}/set_default/`, { method: 'POST' });
  },

  createStripeIntent: async (data: { order_id: string; save_card?: boolean }): Promise<StripeIntentResponse> => {
    return apiRequest<StripeIntentResponse>('/payments/stripe/create-payment-intent/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  confirmStripePayment: async (data: { payment_intent_id: string }): Promise<{ status: string; order_number?: string; detail?: string }> => {
    return apiRequest<{ status: string; order_number?: string; detail?: string }>('/payments/stripe/confirm/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  chargeAuthorizeNet: async (data: AuthorizeNetChargeRequest): Promise<{ status: string; order_number?: string; detail?: string }> => {
    return apiRequest<{ status: string; order_number?: string; detail?: string }>('/payments/authorize-net/charge/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Wallet & Store Credit (Sprint 12)
  getWalletBalance: async (): Promise<WalletBalance> => {
    return apiRequest<WalletBalance>('/payments/wallet/', { method: 'GET' });
  },

  getWalletTransactions: async (): Promise<{ results: WalletTransaction[]; count: number }> => {
    return apiRequest<{ results: WalletTransaction[]; count: number }>('/payments/wallet/transactions/', { method: 'GET' });
  },

  // Vendor Escrow (Sprint 12)
  getVendorEscrow: async (): Promise<VendorEscrowSummary> => {
    return apiRequest<VendorEscrowSummary>('/payments/vendor/escrow/', { method: 'GET' });
  },

  // Cash on Delivery (COD) (Sprint 12)
  sendCODOTP: async (orderId: string): Promise<CODSendOTPResponse> => {
    return apiRequest<CODSendOTPResponse>(`/payments/cod/${orderId}/send-otp/`, { method: 'POST' });
  },

  collectCOD: async (orderId: string, data: { otp_code: string; notes?: string }): Promise<CODCollectResponse> => {
    return apiRequest<CODCollectResponse>(`/payments/cod/${orderId}/collect/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Admin Transactions & Webhooks
  adminTransactions: async (params: { gateway?: string; status?: string; search?: string } = {}): Promise<PaymentTransaction[]> => {
    const query = new URLSearchParams();
    if (params.gateway) query.set('gateway', params.gateway);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<any>(`/admin/transactions/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  adminReplayWebhook: async (webhookId: string): Promise<{ status: string; message: string }> => {
    return apiRequest<{ status: string; message: string }>(`/admin/webhooks/${webhookId}/replay/`, {
      method: 'POST',
    });
  },

  // Admin Double-Entry Ledger (Sprint 12)
  getAdminLedgerAccounts: async (params: { account_type?: string; search?: string } = {}): Promise<LedgerAccount[]> => {
    const query = new URLSearchParams();
    if (params.account_type) query.set('account_type', params.account_type);
    if (params.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<any>(`/admin/ledger/accounts/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  getAdminLedgerEntries: async (params: { reference_type?: string; entry_group_id?: string } = {}): Promise<WalletTransaction[]> => {
    const query = new URLSearchParams();
    if (params.reference_type) query.set('reference_type', params.reference_type);
    if (params.entry_group_id) query.set('entry_group_id', params.entry_group_id);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<any>(`/admin/ledger/entries/${qs}`, { method: 'GET' });
    return res.results || res || [];
  },

  reconcileLedger: async (): Promise<LedgerReconciliationReport> => {
    return apiRequest<LedgerReconciliationReport>('/admin/ledger/reconcile/', { method: 'GET' });
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
  Category: CategoryAPI,
  Brand: BrandAPI,
  Product: ProductAPI,
  Attribute: AttributeAPI,
  Variant: VariantAPI,
  Wishlist: WishlistAPI,
  Warehouse: WarehouseAPI,
  Inventory: InventoryAPI,
  StockTransfer: StockTransferAPI,
  PurchaseOrder: PurchaseOrderAPI,
  Allocation: AllocationAPI,
  Reservation: ReservationAPI,
  Cart: CartAPI,
  Coupon: CouponAPI,
  Tax: TaxAPI,
  Shipping: ShippingAPI,
  Order: OrderAPI,
  Payment: PaymentAPI,
  Token: TokenService,
};





