import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Dimensions, Modal, Platform, Alert, StatusBar as RNStatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Shadows } from '../theme/colors';
import { Badge, Divider, Button } from './ui';
import { TokenService, AuthAPI } from '../services/api';

const { width, height } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(width * 0.82, 340);

interface SidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
  cartCount?: number;
  onNavigate: (screen: 'Home' | 'Shop' | 'Cart' | 'Account', accountTab?: 'orders' | 'addresses' | 'profile' | 'settings') => void;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  visible, onClose, cartCount = 0, onNavigate,
}) => {
  const [user, setUser] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Check auth whenever opened
  useEffect(() => {
    if (visible) {
      TokenService.getToken().then((token) => {
        setIsLoggedIn(!!token);
        if (token) {
          TokenService.getUser().then(setUser);
        } else {
          setUser(null);
        }
      });

      // Animate open
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate close
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleItemPress = (screen: 'Home' | 'Shop' | 'Cart' | 'Account', accountTab?: 'orders' | 'addresses' | 'profile' | 'settings') => {
    handleClose();
    setTimeout(() => {
      onNavigate(screen, accountTab);
    }, 220);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of LuxeLane?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await AuthAPI.logout();
          } catch {
            await TokenService.removeTokens();
          } finally {
            setIsLoggedIn(false);
            setUser(null);
            handleClose();
            onNavigate('Home');
          }
        },
      },
    ]);
  };

  if (!visible) return null;

  const initials = `${user?.first_name?.[0] || 'U'}${user?.last_name?.[0] || ''}`.toUpperCase();
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Valued Client';

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlayContainer}>
        {/* Backdrop overlay */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleClose}
          />
        </Animated.View>

        {/* Sidebar Drawer */}
        <Animated.View
          style={[
            styles.drawer,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* Header Bar with Logo and Close */}
          <View style={styles.drawerHeader}>
            <View>
              <Text style={styles.drawerBrandTitle}>LUXELANE</Text>
              <Text style={styles.drawerBrandTagline}>MAISON DE LUXE</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* User Profile Card */}
            {isLoggedIn ? (
              <TouchableOpacity
                style={styles.profileCard}
                onPress={() => handleItemPress('Account', 'profile')}
                activeOpacity={0.85}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileName} numberOfLines={1}>{fullName}</Text>
                  <Text style={styles.profileEmail} numberOfLines={1}>{user?.email || ''}</Text>
                  <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                    <Badge label={user?.role?.toUpperCase() || 'VIP MEMBER'} color={Colors.accent} bg="rgba(197, 160, 89, 0.2)" />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <View style={styles.guestCard}>
                <View style={styles.guestIconBg}>
                  <Ionicons name="person-outline" size={24} color={Colors.accent} />
                </View>
                <Text style={styles.guestTitle}>Welcome to LuxeLane</Text>
                <Text style={styles.guestSubtitle}>Sign in or join to access curated pricing and private sales</Text>
                <View style={{ marginTop: 12 }}>
                  <Button
                    label="Sign In / Create Account"
                    size="sm"
                    onPress={() => handleItemPress('Account')}
                    fullWidth
                  />
                </View>
              </View>
            )}

            <Divider />

            {/* Navigation Menu */}
            <Text style={styles.sectionHeaderLabel}>NAVIGATION</Text>

            <View style={styles.menuContainer}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleItemPress('Home')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="home-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>Home Boutique</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleItemPress('Shop')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="bag-handle-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>Collections & Catalog</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleItemPress('Cart')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="cart-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>Shopping Bag</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {cartCount > 0 && (
                    <View style={styles.cartBadge}>
                      <Text style={styles.cartBadgeText}>{cartCount}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>
            </View>

            <Divider />

            {/* Account & Orders Section */}
            <Text style={styles.sectionHeaderLabel}>MY LUXURY SUITE</Text>

            <View style={styles.menuContainer}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleItemPress('Account', 'profile')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="person-circle-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>My Account & Profile</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleItemPress('Account', 'orders')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="cube-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>Order Tracking</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Payment Methods */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setShowPaymentModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="card-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>Payment Methods</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.menuPillText}>Secure</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleItemPress('Account', 'addresses')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="location-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>Saved Addresses</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleItemPress('Account', 'settings')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="settings-outline" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>App Settings & Server</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Divider />

            {/* Concierge & Support */}
            <View style={styles.conciergeCard}>
              <Text style={styles.conciergeTitle}>✦ White-Glove Concierge</Text>
              <Text style={styles.conciergeText}>Need bespoke styling or assistance with an order?</Text>
              <Text style={styles.conciergeEmail}>concierge@luxelane.com</Text>
            </View>

            {/* Logout button if authenticated */}
            {isLoggedIn && (
              <View style={{ marginTop: 20 }}>
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={handleLogout}
                  activeOpacity={0.8}
                >
                  <Ionicons name="log-out-outline" size={18} color={Colors.error} />
                  <Text style={styles.logoutBtnText}>Sign Out of LuxeLane</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Footer brand stamp */}
            <View style={styles.drawerFooter}>
              <Text style={styles.drawerFooterBrand}>LUXELANE MAISON & CO.</Text>
              <Text style={styles.drawerFooterVersion}>Version 1.0.0 (Native Mobile)</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      {/* Payment Methods Sub-Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.paymentModalOverlay}>
          <View style={styles.paymentModalCard}>
            <View style={styles.paymentModalHeader}>
              <Text style={styles.paymentModalTitle}>Payment Methods</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {/* Card 1: Gold Luxury Card */}
              <View style={styles.luxuryCardVisual}>
                <View style={styles.cardVisualTop}>
                  <Text style={styles.cardBrandName}>LUXELANE PRIVILEGE</Text>
                  <Text style={styles.cardType}>VISA GOLD</Text>
                </View>
                <Text style={styles.cardNumber}>••••  ••••  ••••  4242</Text>
                <View style={styles.cardVisualBottom}>
                  <View>
                    <Text style={styles.cardLabel}>CARDHOLDER</Text>
                    <Text style={styles.cardVal}>{fullName.toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.cardLabel}>EXPIRES</Text>
                    <Text style={styles.cardVal}>12 / 28</Text>
                  </View>
                </View>
              </View>

              {/* Supported Payment Gateways */}
              <Text style={[styles.sectionHeaderLabel, { marginTop: 16 }]}>AVAILABLE GATEWAYS</Text>

              <View style={styles.gatewayRow}>
                <View style={styles.gatewayIconBg}>
                  <Ionicons name="logo-apple" size={20} color={Colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gatewayName}>Apple Pay & Google Pay</Text>
                  <Text style={styles.gatewayDesc}>Instant biometric 1-tap checkout</Text>
                </View>
                <Badge label="ENABLED" color={Colors.success} bg={Colors.successBg} />
              </View>

              <View style={styles.gatewayRow}>
                <View style={styles.gatewayIconBg}>
                  <Ionicons name="card" size={20} color={Colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gatewayName}>Credit / Debit Cards</Text>
                  <Text style={styles.gatewayDesc}>Visa, MasterCard, Amex via Stripe</Text>
                </View>
                <Badge label="ACTIVE" color={Colors.accent} bg={Colors.accentBg} />
              </View>

              <View style={styles.gatewayRow}>
                <View style={styles.gatewayIconBg}>
                  <Ionicons name="shield-checkmark" size={20} color={Colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gatewayName}>Concierge Wire & COD</Text>
                  <Text style={styles.gatewayDesc}>White-glove courier settlement</Text>
                </View>
                <Badge label="AVAILABLE" color={Colors.textSecondary} bg={Colors.bgSubtle} />
              </View>
            </ScrollView>

            <View style={{ marginTop: 16 }}>
              <Button
                label="Done"
                variant="primary"
                onPress={() => setShowPaymentModal(false)}
                fullWidth
              />
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.white,
    ...Shadows.lifted,
    zIndex: 10,
    flexDirection: 'column',
  },
  drawerHeader: {
    backgroundColor: Colors.dark,
    paddingTop: Platform.OS === 'ios' ? 56 : (RNStatusBar.currentHeight || 28) + 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(197, 160, 89, 0.3)',
  },
  drawerBrandTitle: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 3,
  },
  drawerBrandTagline: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 70,
    backgroundColor: Colors.white,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSubtle,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.accent,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  profileEmail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  guestCard: {
    backgroundColor: Colors.bgSubtle,
    padding: 16,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  guestIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(197, 160, 89, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  guestTitle: {
    fontFamily: 'Georgia',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  guestSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
  },
  menuContainer: {
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: Radii.md,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  cartBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  cartBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  menuPillText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '600',
  },
  conciergeCard: {
    backgroundColor: '#0F172A',
    borderRadius: Radii.md,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(197, 160, 89, 0.3)',
  },
  conciergeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  conciergeText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 16,
  },
  conciergeEmail: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
    marginTop: 6,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.errorBg,
    backgroundColor: Colors.errorBg,
  },
  logoutBtnText: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: 13,
  },
  drawerFooter: {
    marginTop: 28,
    alignItems: 'center',
  },
  drawerFooterBrand: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: Colors.textMuted,
  },
  drawerFooterVersion: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  // Payment Modal Styles
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  paymentModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 38 : 24,
    ...Shadows.lifted,
  },
  paymentModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  paymentModalTitle: {
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  luxuryCardVisual: {
    backgroundColor: '#1E293B',
    borderRadius: Radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
    marginBottom: 12,
    ...Shadows.card,
  },
  cardVisualTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBrandName: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: Colors.accent,
  },
  cardType: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.white,
  },
  cardNumber: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 3,
    marginVertical: 18,
  },
  cardVisualBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 9,
    color: '#94A3B8',
    letterSpacing: 1,
  },
  cardVal: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
    marginTop: 2,
  },
  gatewayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  gatewayIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gatewayDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
