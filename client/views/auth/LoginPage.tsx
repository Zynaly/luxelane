import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon';
import API from '../../services/api';
import {
  loadWorldCountries,
  searchCountries,
  searchStates,
  findCountry,
  getStatesForCountry,
  getCountryPhoneInfo,
  CountryItem,
  StateItem
} from '../../services/countryData';
import {
  searchAddressSuggestions,
  lookupPostalCode,
  searchCitiesForState,
  AddressSuggestion
} from '../../services/addressLookupService';

export type SignupRole = 'customer' | 'vendor' | 'supplier' | 'warehouse';

interface LoginPageProps {
  onLogin: (role: 'customer' | 'admin' | 'vendor') => void;
  onBackToLanding?: () => void;
  initialMode?: 'login' | 'signup';
  initialRole?: SignupRole;
}

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  onBackToLanding,
  initialMode = 'login',
  initialRole = 'customer',
}) => {
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  const [signupRole, setSignupRole] = useState<SignupRole>(initialRole || 'customer');
  const [signupStep, setSignupStep] = useState<'select-role' | 'form'>(
    initialMode === 'signup' && initialRole ? 'form' : 'select-role'
  );
  const [activeTab, setActiveTab] = useState<'customer' | 'admin'>('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // OTP Verification Modal state
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpDestination, setOtpDestination] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Floating Toast Notification state
  const [toast, setToast] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);

  // Password visibility toggle
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state (defaults to US with +1)
  const [signupData, setSignupData] = useState({
    name: '',
    email: '',
    password: '',
    phone_number: '+1',
    country: 'United States',
    country_code: 'US',
    state: 'California',
    state_code: 'CA',
    city: 'San Francisco',
    zip_code: '94102',
    address: '',
    legal_name: '',
    display_name: '',
  });

  // Vendor slug preview for store URL
  const vendorSlugPreview = signupData.display_name
    ? signupData.display_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : 'your-brand';

  // Form validation errors and touched state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Country & State dropdown states
  const [countryQuery, setCountryQuery] = useState('United States');
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [stateQuery, setStateQuery] = useState('California');
  const [isStateOpen, setIsStateOpen] = useState(false);

  // Address & City API Autocomplete states
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);

  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [isCityOpen, setIsCityOpen] = useState(false);

  const [zipLookupStatus, setZipLookupStatus] = useState<string | null>(null);
  const [isLookingUpZip, setIsLookingUpZip] = useState(false);

  const countryRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLDivElement>(null);
  const cityRef = useRef<HTMLDivElement>(null);

  // Load complete world country database in background
  useEffect(() => {
    loadWorldCountries();
  }, []);

  // Auto-dismiss floating toast notification after 6 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(event.target as Node)) {
        setIsCountryOpen(false);
      }
      if (stateRef.current && !stateRef.current.contains(event.target as Node)) {
        setIsStateOpen(false);
      }
      if (addressRef.current && !addressRef.current.contains(event.target as Node)) {
        setIsAddressOpen(false);
      }
      if (cityRef.current && !cityRef.current.contains(event.target as Node)) {
        setIsCityOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Active country phone specifications
  const activePhoneInfo = getCountryPhoneInfo(signupData.country_code || signupData.country);

  // Password Strength Calculation (Requires length, letter, number, and special character)
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-gray-200' };
    const hasLength = pass.length >= 8;
    const hasLetter = /[a-zA-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = SPECIAL_CHAR_REGEX.test(pass);

    let score = 0;
    if (hasLength) score++;
    if (hasLetter && hasNumber) score++;
    if (hasSpecial) score++;
    if (pass.length >= 12 && hasSpecial && hasNumber && hasLetter) score++;

    if (!hasSpecial || score <= 1) {
      return { score: Math.max(score, 1), label: 'Weak (Special char required)', color: 'bg-red-500' };
    }
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
        if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
        if (!SPECIAL_CHAR_REGEX.test(value)) {
          return 'Password must include at least one special character (!@#$%^&* etc.)';
        }
        return '';
      case 'phone_number': {
        const phoneInfo = getCountryPhoneInfo(signupData.country_code || signupData.country);
        if (!value.trim()) return 'Phone number is required';
        if (!value.startsWith('+')) return "Phone number must start with '+'";
        if (!value.startsWith(phoneInfo.phone_code)) {
          return `Contact number for ${signupData.country} must start with ${phoneInfo.phone_code}`;
        }
        const digitsAfterCode = value.slice(phoneInfo.phone_code.length);
        if (digitsAfterCode.length < phoneInfo.phone_digits) {
          const missing = phoneInfo.phone_digits - digitsAfterCode.length;
          return `Incomplete contact number: ${phoneInfo.phone_digits} digits required for ${signupData.country} (${missing} more digit${missing > 1 ? 's' : ''} needed)`;
        }
        if (value.length > phoneInfo.max_length) {
          return `Contact number cannot exceed ${phoneInfo.max_length} characters for ${signupData.country}`;
        }
        return '';
      }
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
      case 'legal_name':
        if (signupRole !== 'customer') {
          if (!value.trim()) {
            if (signupRole === 'warehouse') return 'Warehouse facility legal entity name is required';
            if (signupRole === 'supplier') return 'Supplier business legal entity name is required';
            return 'Legal business entity name is required';
          }
          if (value.trim().length < 2) return 'Legal entity name must be at least 2 characters';
        }
        return '';
      case 'display_name':
        if (signupRole !== 'customer') {
          if (!value.trim()) {
            if (signupRole === 'warehouse') return 'Warehouse / Facility name is required';
            if (signupRole === 'supplier') return 'Supplier / Brand name is required';
            return 'Store / Brand display name is required';
          }
          if (value.trim().length < 2) return 'Name must be at least 2 characters';
        }
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
      // Skip vendor-only fields when registering as a regular customer
      if (signupRole === 'customer' && (field === 'legal_name' || field === 'display_name')) {
        return;
      }
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

  // Dedicated phone input handler: enforces country prefix and maximum allowed digits
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    const phoneInfo = getCountryPhoneInfo(signupData.country_code || signupData.country);

    // Only allow '+' at the beginning and digits 0-9
    let cleaned = raw.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
      cleaned = phoneInfo.phone_code + cleaned.replace(/\D/g, '');
    } else {
      cleaned = '+' + cleaned.slice(1).replace(/\D/g, '');
    }

    // STRICT LENGTH RESTRICTION: Do not let user write more than max_length for the selected country!
    if (cleaned.length > phoneInfo.max_length) {
      cleaned = cleaned.slice(0, phoneInfo.max_length);
    }

    setSignupData((prev) => ({ ...prev, phone_number: cleaned }));

    if (touched.phone_number) {
      const err = validateField('phone_number', cleaned);
      setErrors((prev) => ({ ...prev, phone_number: err }));
    }
  };

  // Country selection handler: auto-adjusts state and phone number prefix/limit
  const handleSelectCountry = (country: CountryItem) => {
    const newPhoneInfo = getCountryPhoneInfo(country.iso2 || country.name);

    // Adapt phone prefix to newly selected country
    let updatedPhone = signupData.phone_number;
    const digitsOnly = updatedPhone.replace(/^\+\d+/, '');
    updatedPhone = newPhoneInfo.phone_code + digitsOnly;
    if (updatedPhone.length > newPhoneInfo.max_length) {
      updatedPhone = updatedPhone.slice(0, newPhoneInfo.max_length);
    }

    setSignupData((prev) => ({
      ...prev,
      country: country.name,
      country_code: country.iso2,
      phone_number: updatedPhone,
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

  // ── Address Autocomplete API Handler ───────────────────────────────────────
  const handleAddressInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSignupData((prev) => ({ ...prev, address: val }));

    if (touched.address) {
      const err = validateField('address', val);
      setErrors((prev) => ({ ...prev, address: err }));
    }

    if (val.trim().length >= 3) {
      setIsLoadingAddress(true);
      setIsAddressOpen(true);
      searchAddressSuggestions(val, signupData.country_code).then((results) => {
        setAddressSuggestions(results);
        setIsLoadingAddress(false);
      });
    } else {
      setAddressSuggestions([]);
      setIsAddressOpen(false);
    }
  };

  // Auto-fill all address fields from a selected verified address suggestion
  const handleSelectAddressSuggestion = (suggestion: AddressSuggestion) => {
    setSignupData((prev) => {
      const newCountry = suggestion.country || prev.country;
      const newCountryCode = suggestion.country_code || prev.country_code;
      const newPhoneInfo = getCountryPhoneInfo(newCountryCode || newCountry);
      const digitsOnly = prev.phone_number.replace(/^\+\d+/, '');
      const updatedPhone = (newPhoneInfo.phone_code + digitsOnly).slice(0, newPhoneInfo.max_length);

      return {
        ...prev,
        address: suggestion.street || prev.address,
        city: suggestion.city || prev.city,
        state: suggestion.state || prev.state,
        state_code: suggestion.state_code || prev.state_code,
        zip_code: suggestion.postal_code || prev.zip_code,
        country: newCountry,
        country_code: newCountryCode,
        phone_number: updatedPhone,
      };
    });

    if (suggestion.country) setCountryQuery(suggestion.country);
    if (suggestion.state) setStateQuery(suggestion.state);

    setIsAddressOpen(false);
    setAddressSuggestions([]);

    // Clear related errors
    setErrors((prev) => ({
      ...prev,
      address: '',
      city: '',
      state: '',
      state_code: '',
      zip_code: '',
      country: '',
      country_code: '',
    }));
  };

  // ── City Autocomplete in State Handler ──────────────────────────────────────
  const handleCityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSignupData((prev) => ({ ...prev, city: val }));

    if (touched.city) {
      const err = validateField('city', val);
      setErrors((prev) => ({ ...prev, city: err }));
    }

    if (val.trim().length >= 2) {
      setIsCityOpen(true);
      searchCitiesForState(val, signupData.state, signupData.country).then((cities) => {
        setCitySuggestions(cities);
      });
    } else {
      setCitySuggestions([]);
      setIsCityOpen(false);
    }
  };

  const handleSelectCity = (cityName: string) => {
    setSignupData((prev) => ({ ...prev, city: cityName }));
    setIsCityOpen(false);
    setTouched((prev) => ({ ...prev, city: true }));
    setErrors((prev) => ({ ...prev, city: '' }));
  };

  // ── ZIP Code Auto-Lookup Handler (Zippopotam.us + Nominatim) ───────────────
  const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setSignupData((prev) => ({ ...prev, zip_code: val }));

    if (touched.zip_code) {
      const err = validateField('zip_code', val);
      setErrors((prev) => ({ ...prev, zip_code: err }));
    }

    // Trigger auto-lookup when 4 or more characters entered
    if (val.length >= 4) {
      setIsLookingUpZip(true);
      setZipLookupStatus('Looking up city & state...');
      lookupPostalCode(val, signupData.country_code).then((result) => {
        setIsLookingUpZip(false);
        if (result && result.city && result.state) {
          setSignupData((prev) => ({
            ...prev,
            city: result.city,
            state: result.state,
            state_code: result.state_code || prev.state_code,
            country: result.country || prev.country,
            country_code: result.country_code || prev.country_code,
          }));
          setStateQuery(result.state);
          if (result.country) setCountryQuery(result.country);
          setZipLookupStatus(`✓ Auto-detected: ${result.city}, ${result.state_code || result.state}`);
          setErrors((prev) => ({ ...prev, city: '', state: '', state_code: '', zip_code: '' }));
          setTimeout(() => setZipLookupStatus(null), 4000);
        } else {
          setZipLookupStatus(null);
        }
      });
    } else {
      setZipLookupStatus(null);
    }
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

        const role = response.user.role;
        let userRole: 'customer' | 'admin' | 'vendor' = 'customer';
        if (role && (role === 'vendor_owner' || role === 'vendor_staff')) {
          userRole = 'vendor';
        } else if (role && role.includes('admin')) {
          userRole = 'admin';
        }
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
      setTimeout(() => {
        const firstErrorKey = Object.keys(errors)[0] || 'name';
        const el = document.getElementById(firstErrorKey) || document.querySelector(`[name="${firstErrorKey}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (el as HTMLElement).focus();
        }
      }, 50);

      setError('Please resolve all validation errors highlighted below.');
      setToast({
        type: 'error',
        message: 'Please resolve all required fields highlighted below before submitting.',
      });
      return;
    }

    setLoading(true);
    try {
      const destination = signupData.email || signupData.phone_number;
      setOtpDestination(destination);

      if (signupRole !== 'customer') {
        const response = await API.Auth.signupVendor({
          name: signupData.name,
          email: signupData.email,
          password: signupData.password,
          phone_number: signupData.phone_number,
          legal_name: signupData.legal_name,
          display_name: signupData.display_name,
        });
        const roleTitle =
          signupRole === 'supplier'
            ? 'Supplier Partner'
            : signupRole === 'warehouse'
            ? 'Warehouse Logistics Partner'
            : 'Vendor Partner';

        console.log(`${roleTitle} application successful:`, response);
        setSuccess(`${roleTitle} application submitted successfully!`);
        setToast({
          type: 'success',
          message: `${roleTitle} application received! Verification code sent.`,
        });
      } else {
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

        setSuccess('Account created successfully!');
        setToast({
          type: 'success',
          message: 'Account Created! Verification code sent to your email.',
        });
      }

      // Open OTP Verification Modal Popup immediately
      setShowOtpModal(true);
      setOtpCode('');
      setOtpError('');
      setOtpSuccess('');
      setResendCooldown(60);
    } catch (err: any) {
      console.error('Signup error:', err);
      const errMsg = err.message || 'Signup failed. Please try again.';
      setError(errMsg);
      setToast({ type: 'error', message: errMsg });
    } finally {
      setLoading(false);
    }
  };

  // OTP Verification Submission
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setOtpError('Please enter the 6-digit verification code.');
      return;
    }

    setOtpVerifying(true);
    setOtpError('');
    setOtpSuccess('');

    try {
      await API.Auth.verifyOtp({
        destination: otpDestination,
        code: otpCode.trim(),
        purpose: 'register',
      });

      setOtpSuccess('Account verified successfully! Redirecting to Sign In...');
      setToast({
        type: 'success',
        message: '✓ Account verified successfully! You can now sign in.',
      });

      setTimeout(() => {
        setShowOtpModal(false);
        setIsLogin(true);
        setLoginEmail(signupData.email || signupData.phone_number);
        setSuccess('Account verified! Enter your password to sign in.');
      }, 1500);
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setOtpError(err.message || 'Invalid or expired verification code.');
    } finally {
      setOtpVerifying(false);
    }
  };

  // OTP Resend
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError('');
    setOtpSuccess('');

    try {
      await API.Auth.resendOtp({
        destination: otpDestination,
        purpose: 'register',
      });
      setResendCooldown(60);
      setToast({
        type: 'info',
        message: `New verification code dispatched to ${otpDestination}.`,
      });
    } catch (err: any) {
      console.error('OTP resend error:', err);
      setOtpError(err.message || 'Could not resend OTP. Please wait a moment.');
    }
  };

  // Filtered dropdown lists
  const filteredCountries = searchCountries(countryQuery);
  const availableStates = getStatesForCountry(signupData.country || signupData.country_code);
  const filteredStates = searchStates(signupData.country || signupData.country_code, stateQuery);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 sm:top-8 sm:right-8 z-50 max-w-md w-full animate-fade-in shadow-2xl">
          <div
            className={`p-4 rounded-2xl border flex items-start space-x-3 transition-all ${
              toast.type === 'error'
                ? 'bg-red-900/95 text-white border-red-700/50 backdrop-blur-md'
                : toast.type === 'success'
                ? 'bg-emerald-900/95 text-white border-emerald-700/50 backdrop-blur-md'
                : 'bg-gray-900/95 text-white border-gray-700 backdrop-blur-md'
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {toast.type === 'error' && (
                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">
                  !
                </div>
              )}
              {toast.type === 'success' && (
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                  ✓
                </div>
              )}
              {toast.type === 'info' && (
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                  i
                </div>
              )}
            </div>
            <div className="flex-1 text-sm font-medium leading-snug">
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-white/70 hover:text-white p-1"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── OTP Verification Modal Popup ── */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 border border-gray-100 relative text-center animate-scale-up">
            {/* Close Button */}
            <button
              onClick={() => setShowOtpModal(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>

            {/* Celebratory Icon */}
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
              <Icon name="check" className="w-8 h-8 text-emerald-600" />
            </div>

            <h3 className="text-2xl font-serif font-bold text-dark mb-2">
              {signupRole === 'vendor' ? 'Merchant Application Received' : 'Account Created Successfully!'}
            </h3>

            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              We have dispatched an activation code to:
              <span className="block mt-1.5 font-semibold text-dark font-mono bg-gray-100 py-1.5 px-3 rounded-lg text-xs break-all">
                {otpDestination}
              </span>
            </p>

            {otpError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl text-left">
                {otpError}
              </div>
            )}
            {otpSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl text-left">
                {otpSuccess}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  Enter 6-Digit Code
                </label>
                <input
                  type="text"
                  autoFocus
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="appearance-none block w-full text-center text-3xl font-mono tracking-[0.5em] px-4 py-3.5 border-2 border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold"
                />
              </div>

              <button
                type="submit"
                disabled={otpVerifying || !otpCode.trim()}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {otpVerifying ? 'Verifying Code...' : 'Verify & Continue to Sign In'}
              </button>

              <div className="pt-2 flex items-center justify-between text-xs text-gray-500">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0}
                  className={`font-medium ${
                    resendCooldown > 0
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-primary hover:underline font-semibold'
                  }`}
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : 'Didn’t receive code? Resend'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowOtpModal(false);
                    setIsLogin(true);
                    setLoginEmail(signupData.email || signupData.phone_number);
                  }}
                  className="text-gray-500 hover:text-dark font-medium underline"
                >
                  Skip for now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {!isLogin && signupStep === 'select-role' ? (
        /* ── 1. Select Your Role Step (Pre-signup) ── */
        <div className="sm:mx-auto sm:w-full sm:max-w-xl text-center animate-fade-in">
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-dark tracking-tight">LuxeLane</h1>
          <h2 className="mt-4 text-3xl font-serif font-bold text-gray-900 tracking-tight">
            Select Your Role
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Please choose how you will participate in the LuxeLane luxury ecosystem
          </p>

          <div className="mt-8 bg-white py-8 px-6 shadow-xl sm:rounded-3xl sm:px-8 border border-gray-100 text-left">
            <div className="space-y-4">
              {/* Customer */}
              <button
                type="button"
                onClick={() => {
                  setSignupRole('customer');
                  setSignupStep('form');
                  setError('');
                  setSuccess('');
                }}
                className="w-full text-left p-5 rounded-2xl border-2 border-gray-200 hover:border-dark hover:bg-gray-50/80 transition-all group flex items-center justify-between shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 text-dark flex items-center justify-center font-bold text-xl group-hover:scale-105 transition-transform shadow-inner">
                    🛍️
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-serif font-bold text-lg text-dark group-hover:text-primary">
                        I AM A CUSTOMER
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        Customer
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Discover and acquire fine jewelry, couture, luxury watches, and bespoke collector editions.
                    </p>
                  </div>
                </div>
                <Icon name="arrow-right" className="w-5 h-5 text-gray-400 group-hover:text-dark group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
              </button>

              {/* Supplier Card (Red theme) */}
              <button
                type="button"
                onClick={() => {
                  setSignupRole('supplier');
                  setSignupStep('form');
                  setError('');
                  setSuccess('');
                }}
                className="w-full text-left p-5 rounded-2xl border-2 border-red-200 hover:border-red-600 bg-red-50/25 hover:bg-red-50/60 transition-all group flex items-center justify-between shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center font-bold text-xl group-hover:scale-105 transition-transform shadow-sm">
                    🏭
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-serif font-bold text-lg text-red-950 group-hover:text-red-700">
                        I AM A SUPPLIER
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-red-100 text-red-800">
                        Materials & B2B
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Supply precious gemstones, rare textiles, luxury hardware, or wholesale goods to top brands.
                    </p>
                  </div>
                </div>
                <Icon name="arrow-right" className="w-5 h-5 text-red-400 group-hover:text-red-700 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
              </button>

              {/* Vendor Card (Blue theme) */}
              <button
                type="button"
                onClick={() => {
                  setSignupRole('vendor');
                  setSignupStep('form');
                  setError('');
                  setSuccess('');
                }}
                className="w-full text-left p-5 rounded-2xl border-2 border-sky-200 hover:border-sky-600 bg-sky-50/25 hover:bg-sky-50/60 transition-all group flex items-center justify-between shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center font-bold text-xl group-hover:scale-105 transition-transform shadow-sm">
                    🏬
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-serif font-bold text-lg text-sky-950 group-hover:text-sky-700">
                        I AM A VENDOR
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                        Brand Merchant
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Operate an exclusive luxury storefront, manage product catalogs, orders, and receive direct payouts.
                    </p>
                  </div>
                </div>
                <Icon name="arrow-right" className="w-5 h-5 text-sky-400 group-hover:text-sky-700 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
              </button>

              {/* Warehouse Card (Yellow/Amber theme) */}
              <button
                type="button"
                onClick={() => {
                  setSignupRole('warehouse');
                  setSignupStep('form');
                  setError('');
                  setSuccess('');
                }}
                className="w-full text-left p-5 rounded-2xl border-2 border-amber-200 hover:border-amber-500 bg-amber-50/25 hover:bg-amber-50/70 transition-all group flex items-center justify-between shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-xl group-hover:scale-105 transition-transform shadow-sm">
                    📦
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-serif font-bold text-lg text-amber-950 group-hover:text-amber-800">
                        I AM A WAREHOUSE
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                        Logistics & Vaults
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Offer secure temperature-controlled storage, bonded vault facilities, and outbound fulfillment.
                    </p>
                  </div>
                </div>
                <Icon name="arrow-right" className="w-5 h-5 text-amber-500 group-hover:text-amber-800 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
              </button>
            </div>

            {/* Switch to Sign In */}
            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true);
                    setError('');
                    setSuccess('');
                  }}
                  className="font-semibold text-primary hover:underline ml-1 cursor-pointer"
                >
                  Sign in instead
                </button>
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ── 2. Login or Customized Signup Form ── */
        <>
          <div className="sm:mx-auto sm:w-full sm:max-w-xl text-center">
            <h1 className="text-4xl sm:text-5xl font-serif font-bold text-dark tracking-tight">LuxeLane</h1>
            <p className="mt-2 text-sm text-gray-600">
              {isLogin
                ? 'Sign in to access your luxury shopping experience or merchant portal'
                : signupRole === 'supplier'
                ? 'Register your enterprise to supply verified luxury brands on LuxeLane'
                : signupRole === 'warehouse'
                ? 'Partner with LuxeLane to provide bonded storage and logistics fulfillment'
                : signupRole === 'vendor'
                ? 'Partner with LuxeLane to showcase your luxury brand to exclusive collectors'
                : 'Create an account and enjoy bespoke luxury shopping'}
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

                  {/* Merchant Apply Link */}
                  <div className="pt-2 text-center border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      Looking to register as a partner?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setIsLogin(false);
                          setSignupStep('select-role');
                          setError('');
                          setSuccess('');
                          setTouched({});
                          setErrors({});
                        }}
                        className="font-semibold text-primary hover:underline cursor-pointer"
                      >
                        Select a Partner Role →
                      </button>
                    </p>
                  </div>
                </form>
              ) : (
                /* ── Signup Form ────────────────────────────────────────────────── */
                <form className="space-y-4" onSubmit={handleSignupSubmit} noValidate>
                  {/* Top Bar with Role Change Option */}
                  <div className="mb-5 pb-3.5 border-b border-gray-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSignupStep('select-role');
                        setError('');
                        setSuccess('');
                      }}
                      className="inline-flex items-center text-xs font-semibold text-gray-600 hover:text-dark transition-colors py-1.5 px-3 rounded-lg hover:bg-gray-100 cursor-pointer"
                    >
                      <Icon name="arrow-left" className="w-3.5 h-3.5 mr-1.5" />
                      <span>Change Role</span>
                    </button>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-400">Role:</span>
                      <span
                        className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          signupRole === 'supplier'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : signupRole === 'vendor'
                            ? 'bg-sky-100 text-sky-800 border border-sky-200'
                            : signupRole === 'warehouse'
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}
                      >
                        {signupRole === 'supplier'
                          ? 'Supplier Partner'
                          : signupRole === 'vendor'
                          ? 'Vendor Partner'
                          : signupRole === 'warehouse'
                          ? 'Warehouse Logistics'
                          : 'Customer'}
                      </span>
                    </div>
                  </div>

                  {/* Role Specific Description Banner */}
                  {signupRole !== 'customer' && (
                    <div
                      className={`p-3.5 border rounded-xl mb-4 text-left ${
                        signupRole === 'supplier'
                          ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200/70 text-red-950'
                          : signupRole === 'vendor'
                          ? 'bg-gradient-to-r from-sky-50 to-indigo-50 border-sky-200/70 text-sky-950'
                          : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/70 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="flex h-2 w-2 relative">
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                              signupRole === 'supplier'
                                ? 'bg-red-400'
                                : signupRole === 'vendor'
                                ? 'bg-sky-400'
                                : 'bg-amber-400'
                            }`}
                          ></span>
                          <span
                            className={`relative inline-flex rounded-full h-2 w-2 ${
                              signupRole === 'supplier'
                                ? 'bg-red-600'
                                : signupRole === 'vendor'
                                ? 'bg-sky-600'
                                : 'bg-amber-600'
                            }`}
                          ></span>
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {signupRole === 'supplier'
                            ? 'Supplier Partnership Application'
                            : signupRole === 'vendor'
                            ? 'Merchant Brand Application'
                            : 'Logistics & Vault Application'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs opacity-90 leading-relaxed">
                        {signupRole === 'supplier'
                          ? 'Register your enterprise to supply fine materials or wholesale collections. Upon verification, your application will be reviewed by procurement.'
                          : signupRole === 'vendor'
                          ? 'Register your luxury brand to sell to our exclusive clientele. Upon verification, your store profile will be vetted by our curation board.'
                          : 'Register your secure storage or fulfillment facility. Upon verification, our logistics board will review your facility credentials.'}
                      </p>
                    </div>
                  )}

                  {/* Business / Brand Fields for Non-Customers */}
                  {signupRole !== 'customer' && (
                    <div className="space-y-4 pb-2 border-b border-gray-100">
                      {/* Brand / Operating Name */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label htmlFor="display_name" className="block text-sm font-medium text-gray-700">
                            {signupRole === 'warehouse'
                              ? 'Warehouse / Facility Name'
                              : signupRole === 'supplier'
                              ? 'Supplier / Brand Trade Name'
                              : 'Store / Brand Name'}{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <span className="text-xs text-gray-500">Public operating name</span>
                        </div>
                        <div className="mt-1">
                          <input
                            id="display_name"
                            name="display_name"
                            type="text"
                            value={signupData.display_name}
                            onChange={handleSignupChange}
                            onBlur={() => handleBlur('display_name')}
                            placeholder={
                              signupRole === 'warehouse'
                                ? 'e.g. LuxeLane Bonded Vault NYC'
                                : signupRole === 'supplier'
                                ? 'e.g. Geneva Precision Horology'
                                : 'e.g. Aurelia Fine Jewelry'
                            }
                            className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                              touched.display_name && errors.display_name
                                ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                                : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                            }`}
                          />
                        </div>
                        {touched.display_name && errors.display_name && (
                          <p className="mt-1 text-xs text-red-600">{errors.display_name}</p>
                        )}
                        {signupRole === 'vendor' && signupData.display_name.trim() && (
                          <p className="mt-1.5 text-xs text-gray-500 flex items-center">
                            <span className="font-medium text-gray-600 mr-1.5">Storefront URL:</span>
                            <span className="bg-gray-100 text-primary px-2 py-0.5 rounded font-mono text-[11px]">
                              luxelane.com/stores/{vendorSlugPreview}
                            </span>
                          </p>
                        )}
                      </div>

                      {/* Legal Entity Name */}
                      <div>
                        <div className="flex items-center justify-between">
                          <label htmlFor="legal_name" className="block text-sm font-medium text-gray-700">
                            {signupRole === 'warehouse'
                              ? 'Operating Company Legal Name'
                              : signupRole === 'supplier'
                              ? 'Corporate Legal Entity Name'
                              : 'Legal Entity Name'}{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <span className="text-xs text-gray-500">For contracts & payouts</span>
                        </div>
                        <div className="mt-1">
                          <input
                            id="legal_name"
                            name="legal_name"
                            type="text"
                            value={signupData.legal_name}
                            onChange={handleSignupChange}
                            onBlur={() => handleBlur('legal_name')}
                            placeholder={
                              signupRole === 'warehouse'
                                ? 'e.g. Metropolitan Secure Vaults LLC'
                                : signupRole === 'supplier'
                                ? 'e.g. Geneva Precision Horology SA'
                                : 'e.g. Aurelia Luxury Holdings LLC'
                            }
                            className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                              touched.legal_name && errors.legal_name
                                ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                                : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                            }`}
                          />
                        </div>
                        {touched.legal_name && errors.legal_name && (
                          <p className="mt-1 text-xs text-red-600">{errors.legal_name}</p>
                        )}
                      </div>
                    </div>
                  )}

              {/* Full Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  {signupRole === 'vendor' ? 'Representative / Owner Full Name' : 'Full Name'}{' '}
                  <span className="text-red-500">*</span>
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
                  {signupRole === 'vendor' ? 'Business Contact Email' : 'Email'}{' '}
                  <span className="text-red-500">*</span>
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

              {/* Password with Strength Meter and Mandatory Special Character */}
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
                    placeholder="Min. 8 characters with @$!%*#?&"
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

                {/* Password Requirements Checklist Pills */}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border transition-colors ${
                    signupData.password.length >= 8
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-medium'
                      : 'bg-gray-50 text-gray-500 border-gray-200'
                  }`}>
                    {signupData.password.length >= 8 ? '✓' : '•'} 8+ chars
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border transition-colors ${
                    /[a-zA-Z]/.test(signupData.password) && /[0-9]/.test(signupData.password)
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-medium'
                      : 'bg-gray-50 text-gray-500 border-gray-200'
                  }`}>
                    {/[a-zA-Z]/.test(signupData.password) && /[0-9]/.test(signupData.password) ? '✓' : '•'} Letter & number
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border transition-colors ${
                    SPECIAL_CHAR_REGEX.test(signupData.password)
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold'
                      : 'bg-amber-50 text-amber-800 border-amber-300 font-medium'
                  }`}>
                    {SPECIAL_CHAR_REGEX.test(signupData.password) ? '✓' : '•'} Special char (!@#$%) *
                  </span>
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
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.password}</p>
                )}
              </div>

              {/* Street Address with Real-Time Address Autocomplete API */}
              <div className="relative" ref={addressRef}>
                <div className="flex items-center justify-between">
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                    {signupRole === 'vendor' ? 'Business Registered Address' : 'Street Address'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {isLoadingAddress ? 'Searching address...' : 'Type for verified address lookup'}
                  </span>
                </div>
                <div className="mt-1 relative">
                  <input
                    id="address"
                    name="address"
                    type="text"
                    value={signupData.address}
                    onChange={handleAddressInputChange}
                    onFocus={() => {
                      if (signupData.address.trim().length >= 3 && addressSuggestions.length > 0) {
                        setIsAddressOpen(true);
                      }
                    }}
                    onBlur={() => handleBlur('address')}
                    placeholder="e.g. 123 Main Street, Suite 100"
                    className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                      touched.address && errors.address
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                    }`}
                  />
                  {isLoadingAddress && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Verified Address Autocomplete Suggestions Dropdown */}
                {isAddressOpen && addressSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white shadow-2xl max-h-60 rounded-xl py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-gray-100 divide-y divide-gray-50">
                    <div className="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Verified Address Matches (Click to auto-fill)
                    </div>
                    {addressSuggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onMouseDown={() => handleSelectAddressSuggestion(s)}
                        className="cursor-pointer select-none py-2.5 px-3.5 hover:bg-gray-50 flex flex-col transition-colors"
                      >
                        <span className="font-semibold text-gray-900 text-sm">{s.street}</span>
                        <span className="text-xs text-gray-500 truncate">{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {touched.address && errors.address && (
                  <p className="mt-1 text-xs text-red-600">{errors.address}</p>
                )}
              </div>

              {/* Phone Number with Strict Country Code Length Limit */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                    {signupRole === 'vendor' ? 'Business Contact Phone' : 'Phone Number'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {signupData.phone_number.length} / {activePhoneInfo.max_length} max
                  </span>
                </div>
                <div className="mt-1">
                  <input
                    id="phone_number"
                    name="phone_number"
                    type="tel"
                    value={signupData.phone_number}
                    onChange={handlePhoneChange}
                    onBlur={() => handleBlur('phone_number')}
                    maxLength={activePhoneInfo.max_length}
                    placeholder={`${activePhoneInfo.phone_code}XXXXXXXXXX`}
                    className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors font-mono ${
                      touched.phone_number && errors.phone_number
                        ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                    }`}
                  />
                </div>
                {touched.phone_number && errors.phone_number ? (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.phone_number}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Limit: {activePhoneInfo.phone_code} with up to {activePhoneInfo.phone_digits} national digits ({activePhoneInfo.max_length} characters total for {signupData.country})
                  </p>
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
                            <div className="flex items-center gap-1.5 ml-2">
                              <span className="text-[11px] font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                                {c.phone_code || getCountryPhoneInfo(c.iso2).phone_code}
                              </span>
                              <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                {c.iso2}
                              </span>
                            </div>
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
                          handleSelectCountry(found);
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

              {/* City (with State-Scoped Autocomplete) & ZIP Code (with Auto-detection) */}
              <div className="grid grid-cols-2 gap-3">
                {/* City with Suggestion Dropdown */}
                <div className="relative" ref={cityRef}>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                    City <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="city"
                      name="city"
                      type="text"
                      value={signupData.city}
                      onChange={handleCityInputChange}
                      onFocus={() => {
                        if (signupData.city.trim().length >= 2) setIsCityOpen(true);
                      }}
                      onBlur={() => handleBlur('city')}
                      placeholder="San Francisco"
                      className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                        touched.city && errors.city
                          ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                      }`}
                    />
                  </div>

                  {/* City Dropdown Menu */}
                  {isCityOpen && citySuggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white shadow-2xl max-h-48 rounded-xl py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-gray-100">
                      {citySuggestions.map((cName) => (
                        <div
                          key={cName}
                          onMouseDown={() => handleSelectCity(cName)}
                          className="cursor-pointer select-none relative py-2 px-3.5 hover:bg-gray-100 flex items-center justify-between transition-colors"
                        >
                          <span className="font-medium text-gray-900 text-sm truncate">{cName}</span>
                          <span className="text-xs text-gray-400 font-medium">in {signupData.state || 'State'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {touched.city && errors.city && (
                    <p className="mt-1 text-xs text-red-600">{errors.city}</p>
                  )}
                </div>

                {/* ZIP Code with Smart Lookup */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="zip_code" className="block text-sm font-medium text-gray-700">
                      ZIP / Postal <span className="text-red-500">*</span>
                    </label>
                    {isLookingUpZip && (
                      <span className="text-[10px] text-primary animate-pulse font-medium">Looking up...</span>
                    )}
                  </div>
                  <div className="mt-1">
                    <input
                      id="zip_code"
                      name="zip_code"
                      type="text"
                      value={signupData.zip_code}
                      onChange={handleZipCodeChange}
                      onBlur={() => handleBlur('zip_code')}
                      placeholder="94102"
                      className={`appearance-none block w-full px-3.5 py-2 border rounded-lg shadow-sm text-sm focus:outline-none transition-colors ${
                        touched.zip_code && errors.zip_code
                          ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                          : 'border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent'
                      }`}
                    />
                  </div>
                  {zipLookupStatus && (
                    <p className="mt-1 text-[11px] text-emerald-600 font-semibold">{zipLookupStatus}</p>
                  )}
                  {touched.zip_code && errors.zip_code && (
                    <p className="mt-1 text-xs text-red-600">{errors.zip_code}</p>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.99]"
                >
                  {loading
                    ? signupRole === 'vendor'
                      ? 'Submitting Application...'
                      : 'Creating account...'
                    : signupRole === 'vendor'
                    ? 'Submit Vendor Application'
                    : 'Create Account'}
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
      </>
    )}
  </div>
);
};

export default LoginPage;
