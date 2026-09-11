import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image, RefreshControl,
} from 'react-native';
import { Colors, Radii, Shadows } from '../theme/colors';
import { Button, EmptyState, Divider } from '../components/ui';
import { CartAPI, Cart, CartItem, TokenService } from '../services/api';

interface CartScreenProps {
  onNavigateShop: () => void;
  onNavigateAccount?: () => void;
  onCartCountChange?: (count: number) => void;
}

const DEFAULT_PRODUCT_IMAGE = require('../../assets/product_placeholder.jpg');

const getItemName = (item: CartItem): string => {
  return item.variant?.product?.name || (item.product as any)?.name || 'Product';
};
const getItemImageSource = (item: CartItem): any => {
  const uri = item.variant?.product?.primary_image || (item.product as any)?.primary_image;
  if (uri && (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://'))) {
    return { uri };
  }
  return DEFAULT_PRODUCT_IMAGE;
};
const getItemPrice = (item: CartItem): number => {
  const raw = item.unit_price || item.variant?.price || '0';
  return parseFloat(raw);
};

export const CartScreen: React.FC<CartScreenProps> = ({ onNavigateShop, onNavigateAccount, onCartCountChange }) => {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const loadCart = useCallback(async () => {
    try {
      const token = await TokenService.getToken();
      setIsLoggedIn(!!token);
      const data = await CartAPI.getCart();
      setCart(data);
      onCartCountChange?.(data.item_count || 0);
    } catch (e) {
      console.log('Cart load error:', e);
      setCart(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onCartCountChange]);

  useEffect(() => { loadCart(); }, [loadCart]);

  const handleUpdateQty = async (item: CartItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty < 1) {
      handleRemove(item);
      return;
    }
    setUpdatingId(item.id);
    try {
      await CartAPI.updateItem(item.id, newQty);
      await loadCart();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update quantity');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = (item: CartItem) => {
    Alert.alert('Remove Item', `Remove "${getItemName(item)}" from cart?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setUpdatingId(item.id);
          try {
            await CartAPI.removeItem(item.id);
            await loadCart();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not remove item');
          } finally {
            setUpdatingId(null);
          }
        },
      },
    ]);
  };

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return;
    setApplyingCoupon(true);
    setCouponMsg(null);
    try {
      await CartAPI.applyCoupon(coupon.trim());
      setCouponMsg({ text: 'Coupon applied successfully!', ok: true });
      await loadCart();
    } catch (e: any) {
      setCouponMsg({ text: e?.message || 'Invalid coupon code', ok: false });
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleCheckout = () => {
    if (!isLoggedIn) {
      Alert.alert(
        'Account Required',
        'Please sign in or create an account to proceed with checkout.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => onNavigateAccount?.() },
        ]
      );
      return;
    }
    Alert.alert('Order Placed', 'Your luxury order is being prepared! You can track status in your Account screen.', [
      { text: 'View Account', onPress: () => onNavigateAccount?.() },
      { text: 'OK' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  const items = cart?.items || [];
  const subtotal = parseFloat(cart?.subtotal || '0');
  const discount = parseFloat(cart?.discount_amount || '0');
  const shipping = subtotal >= 50 ? 0 : 9.99;
  const total = subtotal - discount + shipping;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgPrimary }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCart(); }} tintColor={Colors.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Shopping Cart</Text>
          <Text style={styles.headerCount}>{items.length} {items.length === 1 ? 'item' : 'items'}</Text>
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon="🛒"
            title="Your cart is empty"
            subtitle="Explore our curated collection and add items you love"
            action={
              <Button label="Continue Shopping" onPress={onNavigateShop} variant="primary" />
            }
          />
        ) : (
          <>
            {/* Cart Items */}
            <View style={styles.itemsContainer}>
              {items.map(item => (
                <View key={item.id} style={styles.cartItem}>
                  <Image
                    source={getItemImageSource(item)}
                    style={styles.itemImage}
                    resizeMode="cover"
                  />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={2}>{getItemName(item)}</Text>
                    <Text style={styles.itemPrice}>${getItemPrice(item).toFixed(2)}</Text>
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => handleUpdateQty(item, -1)}
                        disabled={updatingId === item.id}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      {updatingId === item.id ? (
                        <ActivityIndicator size="small" color={Colors.accent} style={{ width: 36 }} />
                      ) : (
                        <Text style={styles.qtyValue}>{item.quantity}</Text>
                      )}
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => handleUpdateQty(item, 1)}
                        disabled={updatingId === item.id}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemTotal}>
                      ${(getItemPrice(item) * item.quantity).toFixed(2)}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemove(item)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Coupon Code */}
            <View style={styles.couponSection}>
              <Text style={styles.couponLabel}>Promo Code</Text>
              <View style={styles.couponRow}>
                <TextInput
                  style={styles.couponInput}
                  placeholder="Enter coupon code"
                  placeholderTextColor={Colors.textMuted}
                  value={coupon}
                  onChangeText={setCoupon}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.couponApplyBtn, applyingCoupon && { opacity: 0.6 }]}
                  onPress={handleApplyCoupon}
                  disabled={applyingCoupon}
                >
                  {applyingCoupon ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.couponApplyText}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
              {couponMsg && (
                <Text style={[styles.couponMsg, { color: couponMsg.ok ? Colors.success : Colors.error }]}>
                  {couponMsg.text}
                </Text>
              )}
            </View>

            {/* Order Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Order Summary</Text>
              <Divider />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal ({items.length} items)</Text>
                <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
              </View>
              {discount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: Colors.success }]}>Discount</Text>
                  <Text style={[styles.summaryValue, { color: Colors.success }]}>−${discount.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Shipping</Text>
                <Text style={[styles.summaryValue, shipping === 0 && { color: Colors.success }]}>
                  {shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}
                </Text>
              </View>
              {shipping > 0 && (
                <Text style={styles.freeShipHint}>
                  Add ${(50 - subtotal).toFixed(2)} more for free shipping!
                </Text>
              )}
              <Divider />
              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
              <Button
                label="Proceed to Checkout →"
                onPress={handleCheckout}
                variant="primary"
                size="lg"
                fullWidth
              />
              <TouchableOpacity style={styles.continueBtn} onPress={onNavigateShop}>
                <Text style={styles.continueBtnText}>← Continue Shopping</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgPrimary },
  header: {
    paddingHorizontal: 20, paddingVertical: 20,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, fontFamily: 'Georgia' },
  headerCount: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  itemsContainer: {
    backgroundColor: Colors.white,
    marginTop: 12,
    borderRadius: Radii.lg,
    marginHorizontal: 16,
    overflow: 'hidden',
    ...Shadows.card,
  },
  cartItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'flex-start',
    gap: 12,
  },
  itemImage: {
    width: 72, height: 72,
    borderRadius: Radii.md,
    backgroundColor: Colors.bgSubtle,
  },
  itemInfo: { flex: 1, gap: 6 },
  itemName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, lineHeight: 19 },
  itemPrice: { fontSize: 13, color: Colors.textMuted },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 30, height: 30,
    borderRadius: 15,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgSubtle,
  },
  qtyBtnText: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, lineHeight: 22 },
  qtyValue: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, minWidth: 20, textAlign: 'center' },
  itemRight: { alignItems: 'flex-end', justifyContent: 'space-between', height: 72 },
  itemTotal: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 18 },
  couponSection: {
    backgroundColor: Colors.white,
    margin: 16,
    borderRadius: Radii.lg,
    padding: 16,
    ...Shadows.card,
  },
  couponLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  couponRow: { flexDirection: 'row', gap: 10 },
  couponInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.bgSubtle,
  },
  couponApplyBtn: {
    height: 44, paddingHorizontal: 18,
    backgroundColor: Colors.dark,
    borderRadius: Radii.md,
    alignItems: 'center', justifyContent: 'center',
  },
  couponApplyText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  couponMsg: { marginTop: 8, fontSize: 13, fontWeight: '500' },
  summaryCard: {
    backgroundColor: Colors.white,
    margin: 16,
    borderRadius: Radii.xl,
    padding: 20,
    gap: 14,
    ...Shadows.lifted,
  },
  summaryTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, fontFamily: 'Georgia' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  freeShipHint: {
    fontSize: 12, color: Colors.accent, fontWeight: '500',
    backgroundColor: Colors.accentBg,
    padding: 8, borderRadius: Radii.sm,
  },
  totalLabel: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  totalValue: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary },
  continueBtn: { alignItems: 'center', paddingTop: 4 },
  continueBtnText: { fontSize: 14, color: Colors.textMuted, fontWeight: '500' },
});
