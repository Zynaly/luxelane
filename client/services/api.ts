// API Service for LuxeLane Backend Integration
// Base URL for the FastAPI backend
const API_BASE_URL = 'http://localhost:9000/api/v1';

// Token management
export const TokenService = {
  getToken: (): string | null => {
    return localStorage.getItem('access_token');
  },

  setToken: (token: string): void => {
    localStorage.setItem('access_token', token);
  },

  removeToken: (): void => {
    localStorage.removeItem('access_token');
  },

  getAuthHeader: (): HeadersInit => {
    const token = TokenService.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
};

// API Response types
interface LoginResponse {
  access_token: string;
  token_type: string;
}

interface CustomerResponse {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  country: string;
  country_code: string;
  state: string;
  state_code: string;
  city: string;
  zip_code: string;
  address: string;
  profile_image?: string | null;  // Added profile image
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

interface SignupData {
  name: string;
  email: string;
  password: string;
  phone_number: string;
  country: string;
  country_code: string;
  state: string;
  state_code: string;
  city: string;
  zip_code: string;
  address: string;
  profile_image?: string;  // Optional profile image URL
}

interface LoginData {
  email: string;
  password: string;
}

interface UpdateProfileData {
  name?: string;
  phone_number?: string;
  country?: string;
  country_code?: string;
  state?: string;
  state_code?: string;
  city?: string;
  zip_code?: string;
  address?: string;
  profile_image?: string;  // Added profile image
}

// Generic API request handler
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
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

    // Handle different response statuses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
}

// Authentication APIs
export const AuthAPI = {
  // Sign up a new customer
  signup: async (data: SignupData): Promise<CustomerResponse> => {
    return apiRequest<CustomerResponse>('/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Verify email with verification code
  verifyEmail: async (verificationCode: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/verify-email/${verificationCode}`, {
      method: 'GET',
    });
  },

  // Login and get JWT token
  login: async (data: LoginData): Promise<LoginResponse> => {
    const response = await apiRequest<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Store token after successful login
    if (response.access_token) {
      TokenService.setToken(response.access_token);
    }

    return response;
  },

  // Reset password
  resetPassword: async (email: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>('/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  // Logout (remove token from local storage)
  logout: async (): Promise<{ message: string }> => {
    const response = await apiRequest<{ message: string }>('/logout', {
      method: 'POST',
      headers: TokenService.getAuthHeader(),
    });

    // Remove token after logout
    TokenService.removeToken();

    return response;
  },
};

// Customer Profile APIs
export const ProfileAPI = {
  // Get current user's profile (requires authentication)
  getProfile: async (): Promise<CustomerResponse> => {
    return apiRequest<CustomerResponse>('/profile', {
      method: 'GET',
      headers: TokenService.getAuthHeader(),
    });
  },

  // Update current user's profile (requires authentication)
  updateProfile: async (data: UpdateProfileData): Promise<CustomerResponse> => {
    return apiRequest<CustomerResponse>('/update-profile', {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: TokenService.getAuthHeader(),
    });
  },

  // Upload profile image (requires authentication)
  uploadProfileImage: async (file: File): Promise<{ message: string; image_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_BASE_URL}/upload-profile-image`;
    const token = TokenService.getToken();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          // Don't set Content-Type header - browser will set it automatically with boundary
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Image upload error:', error);
      throw error;
    }
  },
};

// Customer Management APIs (should be admin-only, but currently unprotected)
export const CustomerAPI = {
  // Get all customers
  getAllCustomers: async (): Promise<CustomerResponse[]> => {
    return apiRequest<CustomerResponse[]>('/customers', {
      method: 'GET',
    });
  },

  // Get customer by ID
  getCustomerById: async (customerId: number): Promise<CustomerResponse> => {
    return apiRequest<CustomerResponse>(`/customers/${customerId}`, {
      method: 'GET',
    });
  },
};

// Health Check API
export const HealthAPI = {
  // Check if API is running
  checkHealth: async (): Promise<{ status: string; message: string }> => {
    return apiRequest<{ status: string; message: string }>('/health', {
      method: 'GET',
    });
  },
};

// Export all APIs
export default {
  Auth: AuthAPI,
  Profile: ProfileAPI,
  Customer: CustomerAPI,
  Health: HealthAPI,
  Token: TokenService,
};
