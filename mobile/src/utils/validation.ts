/**
 * mobile/src/utils/validation.ts
 * Foolproof field validation & phone normalization utilities for LuxeLane Mobile.
 */

export interface CountryDialCode {
  country: string;
  code: string;
  flag: string;
  iso: string;
  digits: number;
}

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { country: 'United States', code: '+1', flag: '🇺🇸', iso: 'US', digits: 10 },
  { country: 'Pakistan', code: '+92', flag: '🇵🇰', iso: 'PK', digits: 10 },
  { country: 'United Kingdom', code: '+44', flag: '🇬🇧', iso: 'GB', digits: 10 },
  { country: 'United Arab Emirates', code: '+971', flag: '🇦🇪', iso: 'AE', digits: 9 },
  { country: 'Saudi Arabia', code: '+966', flag: '🇸🇦', iso: 'SA', digits: 9 },
  { country: 'Canada', code: '+1', flag: '🇨🇦', iso: 'CA', digits: 10 },
  { country: 'Germany', code: '+49', flag: '🇩🇪', iso: 'DE', digits: 10 },
  { country: 'France', code: '+33', flag: '🇫🇷', iso: 'FR', digits: 9 },
  { country: 'India', code: '+91', flag: '🇮🇳', iso: 'IN', digits: 10 },
  { country: 'Australia', code: '+61', flag: '🇦🇺', iso: 'AU', digits: 9 },
  { country: 'Italy', code: '+39', flag: '🇮🇹', iso: 'IT', digits: 10 },
];

export const E164_REGEX = /^\+[1-9]\d{1,14}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Normalizes any phone input into strict E.164 (+[country_code][digits]).
 */
export function normalizePhone(raw: string, defaultCode: string = '+1'): string {
  if (!raw) return '';
  let cleaned = String(raw).trim().replace(/[\s\(\)\-\.]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  if (cleaned.startsWith('+')) {
    // Keep only digits after +
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return '+' + digits;
  }

  // Remove any remaining non-digits
  cleaned = cleaned.replace(/\D/g, '');
  if (!cleaned) return '';

  // Local Pakistan format: 03001234567 -> +923001234567
  if (cleaned.length === 11 && cleaned.startsWith('03')) {
    return '+92' + cleaned.slice(1);
  }
  // Local UK format: 07123456789 -> +447123456789
  if (cleaned.length === 11 && cleaned.startsWith('07')) {
    return '+44' + cleaned.slice(1);
  }
  // Local 10-digit number without country code
  if (cleaned.length === 10) {
    const code = defaultCode.startsWith('+') ? defaultCode : `+${defaultCode}`;
    return code + cleaned;
  }
  // 11-digit US number starting with 1
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+' + cleaned;
  }
  // If 8-15 digits, attach country code or prefix +
  if (cleaned.length >= 8 && cleaned.length <= 15) {
    const code = defaultCode.startsWith('+') ? defaultCode : `+${defaultCode}`;
    return code + cleaned;
  }

  return '+' + cleaned;
}

/**
 * Validates phone number and returns structured validation status.
 */
export function validatePhone(
  phone: string,
  defaultCode: string = '+1'
): { isValid: boolean; message: string; formatted: string } {
  if (!phone || !phone.trim()) {
    return { isValid: true, message: '', formatted: '' }; // Optional
  }
  const formatted = normalizePhone(phone, defaultCode);
  if (!E164_REGEX.test(formatted) || formatted.length < 8) {
    return {
      isValid: false,
      message: 'Include country code & digits (e.g. +1... or +92...)',
      formatted,
    };
  }
  return { isValid: true, message: `Valid international (${formatted})`, formatted };
}

/**
 * Validates email address format.
 */
export function validateEmail(email: string): { isValid: boolean; message: string } {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return { isValid: false, message: 'Email address is required' };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, message: 'Enter a valid email address (e.g. name@domain.com)' };
  }
  return { isValid: true, message: '' };
}

/**
 * Validates password criteria (min 8 characters).
 */
export function validatePassword(password: string): { isValid: boolean; message: string } {
  if (!password) {
    return { isValid: false, message: 'Password is required' };
  }
  if (password.length < 8) {
    return {
      isValid: false,
      message: `Password must be at least 8 characters (currently ${password.length})`,
    };
  }
  return { isValid: true, message: '' };
}

/**
 * Validates name (first or last name, min 2 characters).
 */
export function validateName(name: string, fieldName: string = 'Name'): { isValid: boolean; message: string } {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { isValid: false, message: `${fieldName} is required` };
  }
  if (trimmed.length < 2) {
    return { isValid: false, message: `${fieldName} must be at least 2 characters` };
  }
  return { isValid: true, message: '' };
}
