import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Radii, Shadows } from '../theme/colors';

// ── Button ─────────────────────────────────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  label, onPress, variant = 'primary', size = 'md', loading, disabled, fullWidth,
}) => {
  const bg = variant === 'primary' ? Colors.accent
    : variant === 'danger' ? Colors.error
    : variant === 'secondary' ? Colors.dark
    : 'transparent';
  const textColor = variant === 'outline' || variant === 'ghost' ? Colors.accent : Colors.white;
  const border = variant === 'outline' ? { borderWidth: 1.5, borderColor: Colors.accent } : {};
  const paddingV = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.btn,
        { backgroundColor: bg, paddingVertical: paddingV, ...border },
        fullWidth && { width: '100%' },
        (disabled || loading) && { opacity: 0.55 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.btnText, { color: textColor, fontSize }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

// ── Badge ──────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: string; bg?: string; }

export const Badge: React.FC<BadgeProps> = ({ label, color = Colors.accent, bg = Colors.accentBg }) => (
  <View style={[styles.badge, { backgroundColor: bg }]}>
    <Text style={[styles.badgeText, { color }]}>{label}</Text>
  </View>
);

// ── Price ──────────────────────────────────────────────────────────────────
interface PriceProps { value: string | number; size?: number; muted?: boolean; }

export const Price: React.FC<PriceProps> = ({ value, size = 16, muted }) => (
  <Text style={[styles.price, { fontSize: size, color: muted ? Colors.textMuted : Colors.textPrimary }]}>
    ${typeof value === 'number' ? value.toFixed(2) : parseFloat(String(value)).toFixed(2)}
  </Text>
);

// ── SectionHeader ──────────────────────────────────────────────────────────
interface SectionHeaderProps { title: string; subtitle?: string; action?: React.ReactNode; }

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, action }) => (
  <View style={styles.sectionHeaderRow}>
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
    {action}
  </View>
);

// ── Divider ────────────────────────────────────────────────────────────────
export const Divider: React.FC<{ mx?: number }> = ({ mx = 0 }) => (
  <View style={[styles.divider, { marginHorizontal: mx }]} />
);

// ── Empty State ────────────────────────────────────────────────────────────
interface EmptyStateProps { icon?: string; title: string; subtitle?: string; action?: React.ReactNode; }

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '🛍️', title, subtitle, action }) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyIcon}>{icon}</Text>
    <Text style={styles.emptyTitle}>{title}</Text>
    {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    {action && <View style={{ marginTop: 20 }}>{action}</View>}
  </View>
);

// ── Card ───────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; style?: any; }
export const Card: React.FC<CardProps> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

// ── Toast (static, managed externally) ────────────────────────────────────
interface ToastBannerProps { message: string; type?: 'success' | 'error' | 'info'; }

export const ToastBanner: React.FC<ToastBannerProps> = ({ message, type = 'info' }) => {
  const bg = type === 'success' ? Colors.success : type === 'error' ? Colors.error : Colors.info;
  return (
    <View style={[styles.toast, { backgroundColor: bg }]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
};

// ── Rating Stars ───────────────────────────────────────────────────────────
interface RatingProps { value: number | string; count?: number; size?: number; }

export const Rating: React.FC<RatingProps> = ({ value, count, size = 12 }) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const stars = Math.round(num);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {[1,2,3,4,5].map(i => (
        <Text key={i} style={{ fontSize: size, color: i <= stars ? Colors.accentLight : Colors.border }}>★</Text>
      ))}
      {count !== undefined && (
        <Text style={{ fontSize: size - 1, color: Colors.textMuted, marginLeft: 2 }}>({count})</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  btn: {
    borderRadius: Radii.md,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnText: { fontWeight: '700', letterSpacing: 0.3 },
  badge: {
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  price: { fontWeight: '700', color: Colors.textPrimary },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontFamily: 'Georgia',
    letterSpacing: -0.3,
  },
  sectionSubtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 3 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radii.lg,
    padding: 16,
    ...Shadows.card,
  },
  toast: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 999,
    ...Shadows.lifted,
  },
  toastText: { color: Colors.white, fontWeight: '600', fontSize: 14, textAlign: 'center' },
});
