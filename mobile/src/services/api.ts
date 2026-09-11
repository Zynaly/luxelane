import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';

// Auto-detect the right backend URL for the current environment
// Extracts the Metro bundler host IP automatically (works for physical phones & emulators)
const getDefaultBaseUrl = () => {
  try {
    const scriptURL: string | undefined = NativeModules.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
      if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
        return `http://${match[1]}:8000/api/v1`;
      }
    }
  } catch {
    // ignore
  }

  // Host PC Wi-Fi LAN IP (verified reachable by mobile devices on same network)
  return 'http://192.168.1.44:8000/api/v1';
};

export let API_BASE_URL = getDefaultBaseUrl();

// Allow runtime override (for physical device / custom server)
export const setApiBaseUrl = (url: string) => {
  API_BASE_URL = url.endsWith('/') ? url.slice(0, -1) : url;
};

// ── Token / Session storage ──────────────────────────────────────────────────
export const TokenService = {
  getToken: async (): Promise<string | null> => AsyncStorage.getItem('access_token'),
  setToken: async (token: string): Promise<void> => { await AsyncStorage.setItem('access_token', token); },
  getRefreshToken: async (): Promise<string | null> => AsyncStorage.getItem('refresh_token'),
  setRefreshToken: async (token: string): Promise<void> => { await AsyncStorage.setItem('refresh_token', token); },
  getUser: async (): Promise<any | null> => {
    const raw = await AsyncStorage.getItem('user_data');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  setUser: async (user: any): Promise<void> => { await AsyncStorage.setItem('user_data', JSON.stringify(user)); },
  removeTokens: async (): Promise<void> => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user_data']);
  },
  getSessionKey: async (): Promise<string> => {
    let key = await AsyncStorage.getItem('guest_session_key');
    if (!key) {
      key = 'guest_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
      await AsyncStorage.setItem('guest_session_key', key);
    }
    return key;
  },
};

// ── In-flight refresh guard ──────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await TokenService.getRefreshToken();
    if (!refreshToken) { await TokenService.removeTokens(); return null; }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!res.ok) { await TokenService.removeTokens(); return null; }
      const data = await res.json();
      if (data.access) {
        await TokenService.setToken(data.access);
        if (data.refresh) await TokenService.setRefreshToken(data.refresh);
        return data.access as string;
      }
      await TokenService.removeTokens();
      return null;
    } catch {
      await TokenService.removeTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ── Generic request handler ───────────────────────────────────────────────────
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit & { _isRetry?: boolean } = {}
): Promise<T> {
  const isAbsolute = endpoint.startsWith('http://') || endpoint.startsWith('https://');
  const url = isAbsolute ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const token = await TokenService.getToken();
  const sessionKey = await TokenService.getSessionKey();

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Key': sessionKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  const config: RequestInit = {
    ...options,
    signal: controller.signal,
    headers: { ...defaultHeaders, ...(options.headers as Record<string, string> || {}) },
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(timeoutId);

    if (response.status === 204) return {} as T;

    if (response.status === 401 && !options._isRetry) {
      const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/token/refresh') || endpoint.includes('/auth/register');
      if (!isAuthEndpoint) {
        const newToken = await refreshAccessToken();
        if (newToken) return apiRequest<T>(endpoint, { ...options, _isRetry: true });
        await TokenService.removeTokens();
        const isGet = !options.method || options.method.toUpperCase() === 'GET';
        if (isGet) return apiRequest<T>(endpoint, { ...options, headers: { ...(options.headers as any), Authorization: '' }, _isRetry: true });
      }
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`[API Rate Limit] ${endpoint}: ${data.detail || 'Throttled'}`);
        throw new Error('Please wait a moment before trying again.');
      }
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
    console.error(`[API] ${endpoint}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const AuthAPI = {
  login: async (credentials: { email: string; password: string }) => {
    const res = await apiRequest<{
      access: string; refresh: string;
      user: { id: string; email: string; first_name: string; last_name: string; role: string; avatar_url: string | null };
    }>('/auth/login/', { method: 'POST', body: JSON.stringify({ email_or_phone: credentials.email, email: credentials.email, password: credentials.password }) });
    if (res.access) {
      await TokenService.setToken(res.access);
      await TokenService.setRefreshToken(res.refresh);
      await TokenService.setUser(res.user);
    }
    return res;
  },
  register: async (data: { email: string; password: string; first_name: string; last_name: string; phone?: string }) =>
    apiRequest<{ detail: string }>('/auth/register/', { method: 'POST', body: JSON.stringify(data) }),
  logout: async () => {
    const refresh = await TokenService.getRefreshToken();
    try { if (refresh) await apiRequest('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) }); }
    finally { await TokenService.removeTokens(); }
  },
  verifyOtp: async (data: { destination: string; code: string; purpose: string }) =>
    apiRequest<{ detail: string }>('/auth/verify-otp/', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: async (email_or_phone: string) =>
    apiRequest<{ detail: string }>('/auth/password/forgot/', { method: 'POST', body: JSON.stringify({ email_or_phone }) }),
  resetPassword: async (data: { destination: string; code: string; new_password: string }) =>
    apiRequest<{ detail: string }>('/auth/password/reset/', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Profile ───────────────────────────────────────────────────────────────────
export const ProfileAPI = {
  getProfile: () => apiRequest<any>('/users/me/', { method: 'GET' }),
  updateProfile: (data: { first_name?: string; last_name?: string; phone?: string }) =>
    apiRequest<any>('/users/me/', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Products ──────────────────────────────────────────────────────────────────
export interface Product {
  id: number | string;
  name?: string;
  title?: string;
  primary_variant_id?: string;
  variants?: { id: string; price?: string; sku?: string }[];
  description?: string;
  base_price?: string;
  price?: string;
  primary_image?: string;
  images?: { image_url: string; is_primary: boolean }[];
  category?: { id: string; name: string } | string;
  category_name?: string;
  brand?: { name: string } | string;
  brand_name?: string;
  rating_avg?: number | string;
  rating_count?: number;
  stock?: number;
  slug?: string;
  specifications?: Record<string, string>;
}

export const ProductAPI = {
  getProducts: async (params: { search?: string; category?: string; ordering?: string; page?: number } = {}): Promise<{ results: Product[]; count: number }> => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.category) q.set('category', params.category);
    if (params.ordering) q.set('ordering', params.ordering);
    if (params.page) q.set('page', String(params.page));
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiRequest<any>(`/products/${qs}`, { method: 'GET' });
    return { results: res.results || res || [], count: res.count || 0 };
  },
  getProduct: (id: string | number) => apiRequest<Product>(`/products/${id}/`, { method: 'GET' }),
  getCategories: async (): Promise<any[]> => {
    try {
      const res = await apiRequest<any>('/categories/', { method: 'GET' });
      const items = res.results || res || [];
      if (Array.isArray(items) && items.length > 0) return items;
    } catch (e) {
      console.log('Categories API fetch error, using local fallback:', e);
    }
    return [
      { id: 'cat-clothes', name: 'Clothes', slug: 'clothes' },
      { id: 'cat-shoes', name: 'Shoes', slug: 'shoes' },
      { id: 'cat-cosmetics', name: 'Cosmetics', slug: 'cosmetics' },
      { id: 'cat-gifts', name: 'Aesthetic Gifts & Living', slug: 'aesthetic-gifts' },
    ];
  },
  getBrands: async () => {
    const res = await apiRequest<any>('/brands/', { method: 'GET' });
    return res.results || res || [];
  },
};

// ── Cart ──────────────────────────────────────────────────────────────────────
export interface CartItem {
  id: string;
  variant?: { id: string; sku?: string; product?: { name: string; primary_image?: string }; price?: string };
  product?: Product;
  quantity: number;
  unit_price?: string;
  total_price?: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: string;
  item_count: number;
  coupon_code?: string;
  discount_amount?: string;
}

export const CartAPI = {
  getCart: async (): Promise<Cart> => {
    const res = await apiRequest<any>('/cart/', { method: 'GET' });
    return { id: res.id || '', items: res.items || [], subtotal: res.subtotal || '0.00', item_count: res.item_count || 0 };
  },
  addItem: (variantId: string | number, quantity: number = 1) =>
    apiRequest<any>('/cart/items/', {
      method: 'POST',
      body: JSON.stringify({ variant_id: String(variantId), quantity }),
    }),
  updateItem: (itemId: string, quantity: number) =>
    apiRequest<any>(`/cart/items/${itemId}/`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
  removeItem: (itemId: string) =>
    apiRequest<void>(`/cart/items/${itemId}/`, { method: 'DELETE' }),
  applyCoupon: (code: string) =>
    apiRequest<any>('/cart/apply-coupon/', { method: 'POST', body: JSON.stringify({ code }) }),
  getSummary: async () => {
    try {
      const res = await apiRequest<any>('/cart/summary/', { method: 'GET' });
      return res;
    } catch {
      return { item_count: 0 };
    }
  },
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const OrderAPI = {
  getOrders: async () => {
    const res = await apiRequest<any>('/orders/', { method: 'GET' });
    return res.results || res || [];
  },
  getOrder: (id: string) => apiRequest<any>(`/orders/${id}/`, { method: 'GET' }),
  checkout: (data: { shipping_address_id: string; payment_method?: string }) =>
    apiRequest<any>('/checkout/', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Addresses ─────────────────────────────────────────────────────────────────
export const AddressAPI = {
  getAddresses: async () => {
    const res = await apiRequest<any>('/users/me/addresses/', { method: 'GET' });
    return res.results || res || [];
  },
  createAddress: (data: any) =>
    apiRequest<any>('/users/me/addresses/', { method: 'POST', body: JSON.stringify(data) }),
  updateAddress: (id: string, data: any) =>
    apiRequest<any>(`/users/me/addresses/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAddress: (id: string) =>
    apiRequest<void>(`/users/me/addresses/${id}/`, { method: 'DELETE' }),
};

// ── Wishlist ──────────────────────────────────────────────────────────────────
export const WishlistAPI = {
  getWishlist: async () => {
    const res = await apiRequest<any>('/wishlist/', { method: 'GET' });
    return res.results || res || [];
  },
  addToWishlist: (variantId: string) =>
    apiRequest<any>('/wishlist/', { method: 'POST', body: JSON.stringify({ variant: variantId }) }),
  removeFromWishlist: (id: string) =>
    apiRequest<void>(`/wishlist/${id}/`, { method: 'DELETE' }),
};
