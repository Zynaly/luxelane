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
};

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
  Token: TokenService,
};


