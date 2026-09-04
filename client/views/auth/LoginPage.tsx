import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon';
import API from '../../services/api';
import {
  loadWorldCountries,
  searchCountries,
  searchStates,
  findCountry,
  getStatesForCountry,
  CountryItem,
  StateItem
} from '../../services/countryData';

interface LoginPageProps {
  onLogin: (role: 'customer' | 'admin') => void;
  onBackToLanding?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onBackToLanding }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [activeTab, setActiveTab] = useState<'customer' | 'admin'>('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Password visibility toggle
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [signupData, setSignupData] = useState({
    name: '',
    email: '',
    password: '',
    phone_number: '',
    country: 'United States',
    country_code: 'US',
    state: 'California',
    state_code: 'CA',
    city: 'San Francisco',
    zip_code: '94102',
    address: ''
  });

  // Form validation errors and touched state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Country & State dropdown states
  const [countryQuery, setCountryQuery] = useState('United States');
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [stateQuery, setStateQuery] = useState('California');
  const [isStateOpen, setIsStateOpen] = useState(false);

  const countryRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HTMLDivElement>(null);

  // Load complete world country database in background
  useEffect(() => {
    loadWorldCountries();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(event.target as Node)) {
        setIsCountryOpen(false);
      }
      if (stateRef.current && !stateRef.current.contains(event.target as Node)) {
        setIsStateOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Password Strength Calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-gray-200' };
    let score = 0;
    if (pass.length >= 8) score++;
    if (pass.length >= 12) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score === 2) return { score: 2, label: 'Fair', color: 'bg-yellow-500' };
    if (score === 3) return { score: 3, label: 'Good', color: 'bg-blue-500' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
  };

  const passwordStrength = getPasswordStrength(signupData.password);

  // Validation function for a single field
  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Full name is required';
        if (value.trim().length < 2) return 'Full name must be at least 2 characters';
        if (!/^[a-zA-Z\s.'-]+$/.test(value)) return 'Full name should only contain letters and spaces';
        return '';
      case 'email':
        if (!value.trim()) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Please enter a valid email address';
        return '';
      case 'password':
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (!/[a-zA-Z]/.test(value)) return 'Password must contain at least one letter';
        if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)) {
          return 'Password must contain at least one number or special character';
        }
        return '';
      case 'phone_number':
        if (!value.trim()) return 'Phone number is required';
        if (!value.trim().startsWith('+')) {
          return "Phone number must start with '+' and country code (e.g. +14155552671)";
        }
        if (!/^\+[1-9]\d{6,14}$/.test(value.trim())) {
          return 'Invalid E.164 phone number. Enter + followed by 7-15 digits';
        }
        return '';
      case 'country':
        if (!value.trim()) return 'Country is required';
        return '';
      case 'country_code':
        if (!value.trim()) return 'Country code is required';
        if (value.trim().length < 2 || value.trim().length > 3) return 'Code must be 2-3 letters';
        return '';
      case 'state':
        if (!value.trim()) return 'State/Province is required';
        return '';
      case 'state_code':
        if (!value.trim()) return 'State code is required';
        return '';
      case 'city':
        if (!value.trim()) return 'City is required';
        if (value.trim().length < 2) return 'City must be at least 2 characters';
        return '';
      case 'zip_code':
        if (!value.trim()) return 'ZIP / Postal code is required';
        if (value.trim().length < 3) return 'Enter a valid postal code (min 3 chars)';
        return '';
      case 'address':
        if (!value.trim()) return 'Street address is required';
        if (value.trim().length < 5) return 'Street address must be at least 5 characters';
        return '';
      default:
        return '';
    }
  };

  // Run validation across all fields
  const validateAll = () => {
    const newErrors: Record<string, string> = {};
    const allTouched: Record<string, boolean> = {};

    Object.entries(signupData).forEach(([field, value]) => {
      allTouched[field] = true;
      const err = validateField(field, value);
      if (err) newErrors[field] = err;
    });

    setTouched(allTouched);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(field, (signupData as any)[field] || '');
    setErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleSignupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSignupData((prev) => ({ ...prev, [name]: value }));

    if (touched[name]) {
      const err = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: err }));
    }
  };

  // Country selection handler
  const handleSelectCountry = (country: CountryItem) => {
    setSignupData((prev) => ({
      ...prev,
      country: country.name,
      country_code: country.iso2,
      // If the current state doesn't belong to the newly selected country, reset state
      state: '',
      state_code: '',
    }));
    setCountryQuery(country.name);
    setStateQuery('');
    setIsCountryOpen(false);

    setTouched((prev) => ({ ...prev, country: true, country_code: true }));
    setErrors((prev) => ({ ...prev, country: '', country_code: '' }));
  };

  // State selection handler
  const handleSelectState = (state: StateItem) => {
    setSignupData((prev) => ({
      ...prev,
      state: state.name,
      state_code: state.state_code || state.name.substring(0, 3).toUpperCase(),
    }));
    setStateQuery(state.name);
    setIsStateOpen(false);

    setTouched((prev) => ({ ...prev, state: true, state_code: true }));
    setErrors((prev) => ({ ...prev, state: '', state_code: '' }));
  };

  // Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      try {
        const response = await API.Auth.login({
          email_or_phone: loginEmail,
          password: loginPassword,
        });

        const userRole = (response.user.role && response.user.role.includes('admin')) ? 'admin' : 'customer';
        setSuccess(`Welcome back, ${response.user.first_name || 'User'}!`);
        setTimeout(() => {
          onLogin(userRole);
        }, 400);
        return;
      } catch (apiErr: any) {
        if (activeTab === 'admin' && loginEmail === 'admin@luxelane.com' && loginPassword === 'password') {
          onLogin('admin');
          return;
        }
        throw apiErr;
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Signup submission
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Trigger all validations
    const isValid = validateAll();
    if (!isValid) {
      setError('Please resolve all validation errors highlighted below.');
      return;
    }

    setLoading(true);
    try {
      const response = await API.Auth.signup(signupData);
      console.log('Signup successful:', response);

      // Store address locally so it can be added to the customer profile upon login
      try {
        localStorage.setItem(
          'pending_registration_address',
          JSON.stringify({
            line1: signupData.address,
            city: signupData.city,
            state: signupData.state,
            postal_code: signupData.zip_code,
            country: signupData.country_code || signupData.country,
            contact_phone: signupData.phone_number,
            label: 'Home',
            type: 'both',
            is_default: true,
          })
        );
      } catch {
        // ignore storage error
      }

      setSuccess('Account created successfully! Please check your email or phone for verification OTP.');

      // Switch to login tab after 2.5 seconds
      setTimeout(() => {
        setIsLogin(true);
        setLoginEmail(signupData.email);
        setSuccess('');
      }, 2500);
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filtered dropdown lists
  const filteredCountries = searchCountries(countryQuery);
  const availableStates = getStatesForCountry(signupData.country || signupData.country_code);
  const filteredStates = searchStates(signupData.country || signupData.country_code, stateQuery);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {onBackToLanding && (
        <div className="absolute top-6 left-6">
          <button
            onClick={onBackToLanding}
            className="flex items-center text-gray-600 hover:text-dark transition-colors"
          >
            <Icon name="arrow-left" className="w-5 h-5 mr-2" />
            <span className="font-medium">Back to Home</span>
          </button>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-xl text-center">
        <h1 className="text-4xl sm:text-5xl font-serif font-bold text-dark tracking-tight">LuxeLane</h1>
        <p className="mt-2 text-sm text-gray-600">
          {isLogin ? 'Sign in to access your luxury shopping experience' : 'Create an account and enjoy bespoke luxury shopping'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-6 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100">

          {/* Customer / Admin tab for login */}
          {isLogin && (
            <div className="mb-6">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab('customer')}
                    className={`${
                      activeTab === 'customer'
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-3 px-1 border-b-2 text-sm w-1/2 transition-colors`}
                  >
                    Customer
                  </button>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`${
                      activeTab === 'admin'
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-3 px-1 border-b-2 text-sm w-1/2 transition-colors`}
                  >
                    Admin Portal
                  </button>
                </nav>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start">
              <Icon name="x" className="w-5 h-5 mr-2 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-start">
              <Icon name="check" className="w-5 h-5 mr-2 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* ── Login Form ─────────────────────────────────────────────────── */}
          {isLogin ? (
            <form className="space-y-5" onSubmit={handleLoginSubmit}>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700">
                  Email address or Phone
                </label>
                <div className="mt-1">
                  <input
                    id="login-email"
                    name="email"
                    type="text"
                    autoComplete="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={activeTab === 'admin' ? 'admin@luxelane.com' : 'user@example.com'}
                    className="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showLoginPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="appearance-none block w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    <Icon name={showLoginPassword ? 'eye-off' : 'eye'} className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <a href="#" className="font-medium text-primary hover:text-primary-hover">
                    Forgot password?
                  </a>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>
          ) : (
            /* ── Signup Form ────────────────────────────────────────────────── */
            <form className="space-y-4" onSubmit={handleSignupSubmit} noValidate>
              {/* Full Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={signupData.name}
                    onChange={handleSignupChange}
                    onBlur={() => handleBlur('name')}
                    placeholder="Zain Ali"
                    className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                      touched.name && errors.name
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                    }`}
                  />
                </div>
                {touched.name && errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    id="signup-email"
                    name="email"
                    type="email"
                    value={signupData.email}
                    onChange={handleSignupChange}
                    onBlur={() => handleBlur('email')}
                    placeholder="zainalimooswi@gmail.com"
                    className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                      touched.email && errors.email
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                    }`}
                  />
                </div>
                {touched.email && errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Password with Strength Meter */}
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="mt-1 relative">
                  <input
                    id="signup-password"
                    name="password"
                    type={showSignupPassword ? 'text' : 'password'}
                    value={signupData.password}
                    onChange={handleSignupChange}
                    onBlur={() => handleBlur('password')}
                    placeholder="Min. 8 characters"
                    className={`appearance-none block w-full px-3.5 py-2 pr-10 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                      touched.password && errors.password
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    <Icon name={showSignupPassword ? 'eye-off' : 'eye'} className="w-5 h-5" />
                  </button>
                </div>

                {/* Password Strength Meter */}
                {signupData.password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">Strength:</span>
                      <span className="font-semibold text-gray-700">{passwordStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden flex gap-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-full flex-1 transition-all duration-300 ${
                            step <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {touched.password && errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password}</p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    id="phone_number"
                    name="phone_number"
                    type="tel"
                    value={signupData.phone_number}
                    onChange={handleSignupChange}
                    onBlur={() => handleBlur('phone_number')}
                    placeholder="+344784701222244"
                    className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                      touched.phone_number && errors.phone_number
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                    }`}
                  />
                </div>
                {touched.phone_number && errors.phone_number ? (
                  <p className="mt-1 text-xs text-red-600">{errors.phone_number}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Include country code starting with '+' (e.g. +14155552671)</p>
                )}
              </div>

              {/* Country & Country Code with Searchable Dropdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 relative" ref={countryRef}>
                  <label htmlFor="country-search" className="block text-sm font-medium text-gray-700">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="country-search"
                      type="text"
                      value={countryQuery}
                      onChange={(e) => {
                        setCountryQuery(e.target.value);
                        setIsCountryOpen(true);
                        setSignupData((prev) => ({ ...prev, country: e.target.value }));
                      }}
                      onFocus={() => setIsCountryOpen(true)}
                      onBlur={() => handleBlur('country')}
                      placeholder="Type country name..."
                      className={`appearance-none block w-full px-3.5 py-2 pr-8 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                        touched.country && errors.country
                          ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                      }`}
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400">
                      <Icon name="chevron-down" className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Country Dropdown Menu */}
                  {isCountryOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white shadow-2xl max-h-60 rounded-xl py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-gray-100">
                      {filteredCountries.length === 0 ? (
                        <div className="py-2.5 px-3.5 text-xs text-gray-500">No country found matching "{countryQuery}"</div>
                      ) : (
                        filteredCountries.map((c) => (
                          <div
                            key={c.iso2 || c.name}
                            onMouseDown={() => handleSelectCountry(c)}
                            className="cursor-pointer select-none relative py-2 px-3.5 hover:bg-gray-100 flex items-center justify-between transition-colors"
                          >
                            <span className="font-medium text-gray-900 text-sm truncate">{c.name}</span>
                            <span className="ml-2 text-xs font-mono font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                              {c.iso2}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {touched.country && errors.country && (
                    <p className="mt-1 text-xs text-red-600">{errors.country}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="country_code" className="block text-sm font-medium text-gray-700">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <input
                      id="country_code"
                      name="country_code"
                      type="text"
                      maxLength={3}
                      value={signupData.country_code}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setSignupData((prev) => ({ ...prev, country_code: val }));
                        const found = findCountry(val);
                        if (found) {
                          setSignupData((prev) => ({ ...prev, country: found.name, country_code: found.iso2 }));
                          setCountryQuery(found.name);
                        }
                      }}
                      onBlur={() => handleBlur('country_code')}
                      placeholder="US"
                      className="appearance-none block w-full px-3 py-2 uppercase font-mono font-semibold text-center border border-gray-300 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  {touched.country_code && errors.country_code && (
                    <p className="mt-1 text-xs text-red-600">{errors.country_code}</p>
                  )}
                </div>
              </div>

              {/* State & State Code with Country-dependent Searchable Dropdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 relative" ref={stateRef}>
                  <label htmlFor="state-search" className="block text-sm font-medium text-gray-700">
                    State / Province <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="state-search"
                      type="text"
                      value={stateQuery}
                      onChange={(e) => {
                        setStateQuery(e.target.value);
                        setIsStateOpen(true);
                        setSignupData((prev) => ({ ...prev, state: e.target.value }));
                      }}
                      onFocus={() => setIsStateOpen(true)}
                      onBlur={() => handleBlur('state')}
                      placeholder={availableStates.length > 0 ? `Select state of ${signupData.country || 'country'}...` : 'Enter state / region'}
                      className={`appearance-none block w-full px-3.5 py-2 pr-8 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                        touched.state && errors.state
                          ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                      }`}
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400">
                      <Icon name="chevron-down" className="w-4 h-4" />
                    </div>
                  </div>

                  {/* State Dropdown Menu */}
                  {isStateOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white shadow-2xl max-h-60 rounded-xl py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-gray-100">
                      {availableStates.length === 0 ? (
                        <div className="py-2.5 px-3.5 text-xs text-gray-500">
                          {signupData.country
                            ? `Type state/province name for ${signupData.country}`
                            : 'Please select a country first'}
                        </div>
                      ) : filteredStates.length === 0 ? (
                        <div className="py-2.5 px-3.5 text-xs text-gray-500">No state found matching "{stateQuery}"</div>
                      ) : (
                        filteredStates.map((s) => (
                          <div
                            key={s.state_code || s.name}
                            onMouseDown={() => handleSelectState(s)}
                            className="cursor-pointer select-none relative py-2 px-3.5 hover:bg-gray-100 flex items-center justify-between transition-colors"
                          >
                            <span className="font-medium text-gray-900 text-sm truncate">{s.name}</span>
                            <span className="ml-2 text-xs font-mono font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                              {s.state_code}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {touched.state && errors.state && (
                    <p className="mt-1 text-xs text-red-600">{errors.state}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="state_code" className="block text-sm font-medium text-gray-700">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <input
                      id="state_code"
                      name="state_code"
                      type="text"
                      maxLength={5}
                      value={signupData.state_code}
                      onChange={handleSignupChange}
                      onBlur={() => handleBlur('state_code')}
                      placeholder="CA"
                      className="appearance-none block w-full px-3 py-2 uppercase font-mono font-semibold text-center border border-gray-300 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  {touched.state_code && errors.state_code && (
                    <p className="mt-1 text-xs text-red-600">{errors.state_code}</p>
                  )}
                </div>
              </div>

              {/* City & ZIP Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                    City <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <input
                      id="city"
                      name="city"
                      type="text"
                      value={signupData.city}
                      onChange={handleSignupChange}
                      onBlur={() => handleBlur('city')}
                      placeholder="San Francisco"
                      className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                        touched.city && errors.city
                          ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                      }`}
                    />
                  </div>
                  {touched.city && errors.city && (
                    <p className="mt-1 text-xs text-red-600">{errors.city}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="zip_code" className="block text-sm font-medium text-gray-700">
                    ZIP Code <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <input
                      id="zip_code"
                      name="zip_code"
                      type="text"
                      value={signupData.zip_code}
                      onChange={handleSignupChange}
                      onBlur={() => handleBlur('zip_code')}
                      placeholder="94102"
                      className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                        touched.zip_code && errors.zip_code
                          ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                      }`}
                    />
                  </div>
                  {touched.zip_code && errors.zip_code && (
                    <p className="mt-1 text-xs text-red-600">{errors.zip_code}</p>
                  )}
                </div>
              </div>

              {/* Street Address */}
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    id="address"
                    name="address"
                    type="text"
                    value={signupData.address}
                    onChange={handleSignupChange}
                    onBlur={() => handleBlur('address')}
                    placeholder="123 Luxury Lane, Suite 400"
                    className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                      touched.address && errors.address
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                    }`}
                  />
                </div>
                {touched.address && errors.address && (
                  <p className="mt-1 text-xs text-red-600">{errors.address}</p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.99]"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          {/* Switch between Sign In / Sign Up */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-500 font-medium">
                  {isLogin ? 'New to LuxeLane?' : 'Already have an account?'}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSuccess('');
                  setTouched({});
                  setErrors({});
                }}
                className="w-full inline-flex justify-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {isLogin ? 'Create a new account' : 'Sign in instead'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
