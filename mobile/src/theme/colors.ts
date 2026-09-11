// LuxeLane Design Tokens — mirrors web client theme
export const Colors = {
  // Core palette
  dark: '#1A1A1A',
  darkAlt: '#111827',
  white: '#FFFFFF',

  // Accent — champagne gold
  accent: '#C5A059',
  accentLight: '#D4AF37',
  accentBg: '#FDF6E3',

  // Backgrounds
  bgPrimary: '#F8F9FA',
  bgCard: '#FFFFFF',
  bgSubtle: '#F3F4F6',
  bgOverlay: 'rgba(0,0,0,0.45)',

  // Text
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Borders
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  // Semantic
  success: '#10B981',
  successBg: '#ECFDF5',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  warning: '#F59E0B',
  warningBg: '#FFFBEB',
  info: '#3B82F6',

  // Status tags
  statusProcessing: '#3B82F6',
  statusShipped: '#8B5CF6',
  statusDelivered: '#10B981',
  statusCancelled: '#EF4444',

  // Tab bar
  tabActive: '#C5A059',
  tabInactive: '#9CA3AF',
  tabBg: '#FFFFFF',
};

export const Fonts = {
  serif: 'Georgia',
  sansSerif: 'System',
};

export const Radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lifted: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};
