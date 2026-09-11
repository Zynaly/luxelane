import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { Colors, Radii, Shadows } from '../theme/colors';
import { Button, Badge, Card, Divider, EmptyState, SectionHeader } from '../components/ui';
import {
  AuthAPI, ProfileAPI, OrderAPI, AddressAPI,
  TokenService, API_BASE_URL, setApiBaseUrl,
} from '../services/api';

interface AccountScreenProps {
  onNavigateShop?: () => void;
  initialTab?: 'orders' | 'addresses' | 'profile' | 'settings';
}

export const AccountScreen: React.FC<AccountScreenProps> = ({ onNavigateShop, initialTab }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeAuthTab, setActiveAuthTab] = useState<'login' | 'register'>('login');
  const [activeProfileTab, setActiveProfileTab] = useState<'orders' | 'addresses' | 'profile' | 'settings'>(initialTab || 'orders');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Register form
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // OTP Verification state
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpDestination, setOtpDestination] = useState('');

  // Profile data
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);

  // Server settings
  const [customServerUrl, setCustomServerUrl] = useState(API_BASE_URL);
  const [serverPingStatus, setServerPingStatus] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const token = await TokenService.getToken();
      if (token) {
        setIsLoggedIn(true);
        const storedUser = await TokenService.getUser();
        setUser(storedUser);
        // Fetch fresh profile
        try {
          const fresh = await ProfileAPI.getProfile();
          if (fresh) {
            setUser(fresh);
            await TokenService.setUser(fresh);
          }
        } catch {
          // keep stored
        }
      } else {
        setIsLoggedIn(false);
        setUser(null);
      }
    } catch {
      setIsLoggedIn(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (initialTab) {
      setActiveProfileTab(initialTab);
    }
  }, [initialTab]);

  // Load orders or addresses when tab changes
  useEffect(() => {
    if (!isLoggedIn) return;
    if (activeProfileTab === 'orders') {
      loadOrders();
    } else if (activeProfileTab === 'addresses') {
      loadAddresses();
    }
  }, [isLoggedIn, activeProfileTab]);

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await OrderAPI.getOrders();
      setOrders(Array.isArray(res) ? res : []);
    } catch (e) {
      console.log('Error loading orders:', e);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadAddresses = async () => {
    setAddressesLoading(true);
    try {
      const res = await AddressAPI.getAddresses();
      setAddresses(Array.isArray(res) ? res : []);
    } catch (e) {
      console.log('Error loading addresses:', e);
    } finally {
      setAddressesLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await AuthAPI.login({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      setUser(res.user);
      setIsLoggedIn(true);
      setLoginPassword('');
    } catch (e: any) {
      setAuthError(e?.message || 'Login failed. Please check your credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regEmail.trim() || !regPassword || !regFirstName.trim() || !regLastName.trim()) {
      setAuthError('Please fill in all required fields.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await AuthAPI.register({
        email: regEmail.trim(),
        password: regPassword,
        first_name: regFirstName.trim(),
        last_name: regLastName.trim(),
        phone: regPhone.trim() || undefined,
      });

      // Automatically sign in upon registration
      try {
        const res = await AuthAPI.login({
          email: regEmail.trim(),
          password: regPassword,
        });
        setUser(res.user);
        setIsLoggedIn(true);
        Alert.alert('Welcome to LuxeLane', `Your account has been created and you are now signed in, ${regFirstName}!`);
        return;
      } catch {
        // If auto-login fails, switch to login tab with prefilled email
        setActiveAuthTab('login');
        setLoginEmail(regEmail.trim());
        Alert.alert('Account Created', 'Your account was created! Please enter your password to sign in.');
      }
    } catch (e: any) {
      setAuthError(e?.message || 'Registration failed. Please check your details.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) {
      setAuthError('Please enter the verification code.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await AuthAPI.verifyOtp({
        destination: otpDestination,
        code: otpCode.trim(),
        purpose: 'register',
      });
      Alert.alert('Success', 'Account verified! Please sign in with your credentials.');
      setAwaitingOtp(false);
      setActiveAuthTab('login');
      setLoginEmail(regEmail);
    } catch (e: any) {
      setAuthError(e?.message || 'Verification failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of LuxeLane?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await AuthAPI.logout();
          } catch {
            await TokenService.removeTokens();
          } finally {
            setIsLoggedIn(false);
            setUser(null);
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleSaveServerUrl = async () => {
    const trimmed = customServerUrl.trim();
    if (!trimmed) return;
    setApiBaseUrl(trimmed);
    setServerPingStatus('Testing connection...');
    try {
      const res = await fetch(`${trimmed}/products/`, { method: 'GET' });
      if (res.ok || res.status === 200 || res.status === 401) {
        setServerPingStatus('Connected successfully! (HTTP ' + res.status + ')');
      } else {
        setServerPingStatus(`Server returned status: ${res.status}`);
      }
    } catch (e: any) {
      setServerPingStatus(`Connection failed: ${e?.message || 'Network error'}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NOT LOGGED IN VIEW: Auth Tabs + Server Config
  // ─────────────────────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Luxury Header */}
        <View style={styles.authHeader}>
          <Text style={styles.brandTitle}>LUXELANE</Text>
          <Text style={styles.brandTagline}>HAUTE COUTURE & TIMELESS LUXURY</Text>
          <View style={styles.brandAccentLine} />
        </View>

        {awaitingOtp ? (
          <Card style={styles.formCard}>
            <Text style={styles.formTitle}>Verify Your Account</Text>
            <Text style={styles.formSubtitle}>
              We sent a verification code to {otpDestination}
            </Text>

            {authError && <Text style={styles.errorText}>{authError}</Text>}

            <Text style={styles.inputLabel}>Verification Code</Text>
            <TextInput
              style={[styles.input, { letterSpacing: 4, textAlign: 'center', fontSize: 20 }]}
              placeholder="123456"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              value={otpCode}
              onChangeText={setOtpCode}
            />

            <View style={{ marginTop: 20, gap: 12 }}>
              <Button
                label="Verify & Activate"
                onPress={handleVerifyOtp}
                loading={authLoading}
                fullWidth
              />
              <Button
                label="Skip & Sign In Directly"
                variant="outline"
                onPress={() => {
                  setAwaitingOtp(false);
                  setActiveAuthTab('login');
                }}
                fullWidth
              />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setAwaitingOtp(false)}
                fullWidth
              />
            </View>
          </Card>
        ) : (
          <Card style={styles.formCard}>
            {/* Tab switch */}
            <View style={styles.authTabRow}>
              <TouchableOpacity
                style={[styles.authTab, activeAuthTab === 'login' && styles.authTabActive]}
                onPress={() => { setActiveAuthTab('login'); setAuthError(null); }}
              >
                <Text style={[styles.authTabText, activeAuthTab === 'login' && styles.authTabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authTab, activeAuthTab === 'register' && styles.authTabActive]}
                onPress={() => { setActiveAuthTab('register'); setAuthError(null); }}
              >
                <Text style={[styles.authTabText, activeAuthTab === 'register' && styles.authTabTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {authError && <Text style={styles.errorText}>{authError}</Text>}

            {activeAuthTab === 'login' ? (
              <View style={styles.fieldsContainer}>
                <Text style={styles.inputLabel}>Email or Phone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@domain.com"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                />

                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                />

                <View style={{ marginTop: 20 }}>
                  <Button
                    label="Sign In to LuxeLane"
                    onPress={handleLogin}
                    loading={authLoading}
                    fullWidth
                  />
                </View>
              </View>
            ) : (
              <View style={styles.fieldsContainer}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>First Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Jane"
                      placeholderTextColor={Colors.textMuted}
                      value={regFirstName}
                      onChangeText={setRegFirstName}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Last Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Doe"
                      placeholderTextColor={Colors.textMuted}
                      value={regLastName}
                      onChangeText={setRegLastName}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="jane.doe@example.com"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={regEmail}
                  onChangeText={setRegEmail}
                />

                <Text style={styles.inputLabel}>Phone (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  value={regPhone}
                  onChangeText={setRegPhone}
                />

                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  value={regPassword}
                  onChangeText={setRegPassword}
                />

                <View style={{ marginTop: 20 }}>
                  <Button
                    label="Create Account"
                    onPress={handleRegister}
                    loading={authLoading}
                    fullWidth
                  />
                </View>
              </View>
            )}
          </Card>
        )}

        {/* Server Endpoint Settings Accordion */}
        <Card style={styles.serverSettingsCard}>
          <Text style={styles.serverSettingsTitle}>⚙️ Backend Server Configuration</Text>
          <Text style={styles.serverSettingsDesc}>
            Current API Endpoint: {API_BASE_URL}
          </Text>
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="http://10.0.2.2:8000/api/v1"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            value={customServerUrl}
            onChangeText={setCustomServerUrl}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Button
              label="Save & Test Endpoint"
              size="sm"
              variant="outline"
              onPress={handleSaveServerUrl}
            />
            <Button
              label="Reset (10.0.2.2)"
              size="sm"
              variant="ghost"
              onPress={() => {
                setCustomServerUrl('http://10.0.2.2:8000/api/v1');
                setApiBaseUrl('http://10.0.2.2:8000/api/v1');
              }}
            />
          </View>
          {serverPingStatus && (
            <Text style={[styles.serverPingText, { color: serverPingStatus.includes('success') ? Colors.success : Colors.error }]}>
              {serverPingStatus}
            </Text>
          )}
        </Card>
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOGGED IN VIEW: Profile Header + Tabs (Orders, Addresses, Profile, Settings)
  // ─────────────────────────────────────────────────────────────────────────────
  const initials = `${user?.first_name?.[0] || 'U'}${user?.last_name?.[0] || ''}`.toUpperCase();
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Valued Client';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); checkAuth(); }}
          tintColor={Colors.accent}
          colors={[Colors.accent]}
        />
      }
    >
      {/* Dark Luxury User Banner */}
      <View style={styles.userBanner}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
        <Text style={styles.userName}>{fullName}</Text>
        <Text style={styles.userEmail}>{user?.email || ''}</Text>
        <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
          <Badge label={user?.role?.toUpperCase() || 'VIP MEMBER'} color={Colors.accent} bg="rgba(197, 160, 89, 0.2)" />
        </View>
      </View>

      {/* Navigation Pills for Profile Sections */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsContainer}
      >
        {[
          { key: 'orders', label: 'My Orders 📦' },
          { key: 'addresses', label: 'Addresses 📍' },
          { key: 'profile', label: 'Profile 👤' },
          { key: 'settings', label: 'Settings ⚙️' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.navPill,
              activeProfileTab === tab.key && styles.navPillActive,
            ]}
            onPress={() => setActiveProfileTab(tab.key as any)}
          >
            <Text
              style={[
                styles.navPillText,
                activeProfileTab === tab.key && styles.navPillTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      <View style={styles.tabContentArea}>
        {/* ORDERS TAB */}
        {activeProfileTab === 'orders' && (
          <View>
            <SectionHeader title="Order History" subtitle="Track your luxury deliveries" />
            {ordersLoading ? (
              <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 30 }} />
            ) : orders.length === 0 ? (
              <EmptyState
                icon="📦"
                title="No Orders Yet"
                subtitle="Explore our curated collection and place your first order."
                action={onNavigateShop ? <Button label="Discover Boutique" onPress={onNavigateShop} /> : undefined}
              />
            ) : (
              orders.map((order, idx) => (
                <Card key={order.id || idx} style={styles.orderCard}>
                  <View style={styles.orderHeaderRow}>
                    <View>
                      <Text style={styles.orderNumber}>Order #{order.order_number || String(order.id).slice(0, 8)}</Text>
                      <Text style={styles.orderDate}>{order.created_at ? new Date(order.created_at).toLocaleDateString() : 'Recent'}</Text>
                    </View>
                    <Badge
                      label={order.status || 'PROCESSING'}
                      color={
                        order.status === 'delivered' ? Colors.statusDelivered :
                        order.status === 'cancelled' ? Colors.statusCancelled :
                        Colors.statusProcessing
                      }
                      bg={
                        order.status === 'delivered' ? Colors.successBg :
                        order.status === 'cancelled' ? Colors.errorBg :
                        '#EFF6FF'
                      }
                    />
                  </View>
                  <Divider />
                  <View style={styles.orderBodyRow}>
                    <Text style={styles.orderItemsCount}>
                      {order.items?.length || 1} Item(s)
                    </Text>
                    <Text style={styles.orderTotal}>
                      ${parseFloat(order.total_amount || order.grand_total || '0').toFixed(2)}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </View>
        )}

        {/* ADDRESSES TAB */}
        {activeProfileTab === 'addresses' && (
          <View>
            <SectionHeader title="Saved Addresses" subtitle="Default shipping and billing addresses" />
            {addressesLoading ? (
              <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 30 }} />
            ) : addresses.length === 0 ? (
              <EmptyState
                icon="📍"
                title="No Addresses Saved"
                subtitle="Your shipping addresses will appear here during checkout."
              />
            ) : (
              addresses.map((addr, idx) => (
                <Card key={addr.id || idx} style={styles.addressCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.addressType}>{addr.address_type?.toUpperCase() || 'SHIPPING'}</Text>
                    {addr.is_default && <Badge label="DEFAULT" color={Colors.accent} />}
                  </View>
                  <Text style={styles.addressName}>{addr.full_name || fullName}</Text>
                  <Text style={styles.addressText}>{addr.line1 || addr.street_address}</Text>
                  {addr.line2 ? <Text style={styles.addressText}>{addr.line2}</Text> : null}
                  <Text style={styles.addressText}>
                    {addr.city}, {addr.state || ''} {addr.postal_code || ''}
                  </Text>
                  <Text style={styles.addressText}>{addr.country || 'USA'}</Text>
                </Card>
              ))
            )}
          </View>
        )}

        {/* PROFILE TAB */}
        {activeProfileTab === 'profile' && (
          <Card style={styles.formCard}>
            <SectionHeader title="Personal Details" />
            <View style={styles.profileField}>
              <Text style={styles.profileFieldLabel}>Full Name</Text>
              <Text style={styles.profileFieldValue}>{fullName}</Text>
            </View>
            <Divider />
            <View style={styles.profileField}>
              <Text style={styles.profileFieldLabel}>Email Address</Text>
              <Text style={styles.profileFieldValue}>{user?.email || '—'}</Text>
            </View>
            <Divider />
            <View style={styles.profileField}>
              <Text style={styles.profileFieldLabel}>Phone Number</Text>
              <Text style={styles.profileFieldValue}>{user?.phone || 'Not configured'}</Text>
            </View>
            <Divider />
            <View style={styles.profileField}>
              <Text style={styles.profileFieldLabel}>Role</Text>
              <Text style={styles.profileFieldValue}>{user?.role || 'Customer'}</Text>
            </View>
          </Card>
        )}

        {/* SETTINGS TAB */}
        {activeProfileTab === 'settings' && (
          <View>
            <Card style={styles.serverSettingsCard}>
              <Text style={styles.serverSettingsTitle}>⚙️ Backend Server Configuration</Text>
              <Text style={styles.serverSettingsDesc}>
                API Endpoint: {API_BASE_URL}
              </Text>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="http://10.0.2.2:8000/api/v1"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                value={customServerUrl}
                onChangeText={setCustomServerUrl}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Button
                  label="Save & Test"
                  size="sm"
                  variant="outline"
                  onPress={handleSaveServerUrl}
                />
                <Button
                  label="Reset Default"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setCustomServerUrl('http://10.0.2.2:8000/api/v1');
                    setApiBaseUrl('http://10.0.2.2:8000/api/v1');
                  }}
                />
              </View>
              {serverPingStatus && (
                <Text style={[styles.serverPingText, { color: serverPingStatus.includes('success') ? Colors.success : Colors.error }]}>
                  {serverPingStatus}
                </Text>
              )}
            </Card>

            <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
              <Button
                label="Sign Out of LuxeLane"
                variant="danger"
                onPress={handleLogout}
                fullWidth
              />
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authHeader: {
    backgroundColor: Colors.dark,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 30,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  brandTitle: {
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 4,
  },
  brandTagline: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#9CA3AF',
    marginTop: 6,
    fontWeight: '600',
  },
  brandAccentLine: {
    width: 48,
    height: 2,
    backgroundColor: Colors.accent,
    marginTop: 14,
  },
  formCard: {
    marginHorizontal: 16,
    marginTop: -16,
    padding: 20,
    borderRadius: Radii.lg,
  },
  authTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 20,
  },
  authTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  authTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
  },
  authTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  authTabTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  fieldsContainer: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.bgSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  errorText: {
    color: Colors.error,
    backgroundColor: Colors.errorBg,
    padding: 10,
    borderRadius: Radii.sm,
    fontSize: 13,
    marginBottom: 12,
  },
  formTitle: {
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  serverSettingsCard: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
  },
  serverSettingsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  serverSettingsDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  serverPingText: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  // Logged in styles
  userBanner: {
    backgroundColor: Colors.dark,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 28,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...Shadows.card,
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 1,
  },
  userName: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
  },
  userEmail: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  pillsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  navPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navPillActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  navPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  navPillTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  tabContentArea: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  orderCard: {
    marginBottom: 12,
    padding: 16,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  orderDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  orderBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItemsCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.accent,
  },
  addressCard: {
    marginBottom: 12,
    padding: 16,
    gap: 3,
  },
  addressType: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  addressName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 4,
  },
  addressText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  profileField: {
    paddingVertical: 6,
  },
  profileFieldLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileFieldValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 2,
  },
});
