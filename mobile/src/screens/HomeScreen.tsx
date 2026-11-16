import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image, TouchableOpacity,
  Dimensions, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { Colors, Radii, Shadows } from '../theme/colors';
import { Button, SectionHeader, EmptyState, Badge, Rating } from '../components/ui';
import { ProductGrid, getProductImage, getProductPrice, getProductName, getProductVariantId } from '../components/ProductCard';
import { ProductAPI, CartAPI, Product, TokenService } from '../services/api';

const STORE_HERO_IMAGE = require('../../assets/store_hero.jpg');
const DEFAULT_PRODUCT_IMAGE = require('../../assets/product_placeholder.jpg');

const CATEGORY_IMAGES: Record<string, any> = {
  clothes: require('../../assets/cat_clothes.jpg'),
  apparel: require('../../assets/cat_clothes.jpg'),
  fashion: require('../../assets/cat_clothes.jpg'),
  shoes: require('../../assets/cat_shoes.jpg'),
  footwear: require('../../assets/cat_shoes.jpg'),
  cosmetics: require('../../assets/cat_cosmetics.jpg'),
  beauty: require('../../assets/cat_cosmetics.jpg'),
  perfume: require('../../assets/cat_cosmetics.jpg'),
  'aesthetic-gifts': require('../../assets/cat_gifts.jpg'),
  'aesthetic-gifts--living': require('../../assets/cat_gifts.jpg'),
  'aesthetic gifts & living': require('../../assets/cat_gifts.jpg'),
  gifts: require('../../assets/cat_gifts.jpg'),
  living: require('../../assets/cat_gifts.jpg'),
};

const getCategoryImg = (cat: any) => {
  const slug = (cat.slug || cat.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, img] of Object.entries(CATEGORY_IMAGES)) {
    const cleanKey = key.replace(/[^a-z0-9]/g, '');
    if (slug.includes(cleanKey) || cleanKey.includes(slug)) {
      return img;
    }
  }
  return DEFAULT_PRODUCT_IMAGE;
};

const { width, height } = Dimensions.get('window');

const CATEGORIES_ICONS: Record<string, string> = {
  all: '✨', electronics: '📱', fashion: '👗', home: '🏠', sports: '⚽',
  books: '📚', toys: '🧸', beauty: '💄', jewelry: '💍', luxury: '🥂',
};

interface HomeScreenProps {
  onNavigateShop: () => void;
  onNavigateCart: () => void;
  onNavigateAccount?: () => void;
  onProductPress: (p: Product) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateShop, onNavigateCart, onNavigateAccount, onProductPress }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingId, setAddingId] = useState<string | number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const loadData = useCallback(async () => {
    try {
      const token = await TokenService.getToken();
      setIsLoggedIn(!!token);

      const [prods, cats] = await Promise.all([
        ProductAPI.getProducts({ ordering: '-rating_avg' }).catch(err => {
          console.log('Products fetch fallback:', err);
          return { results: [], count: 0 };
        }),
        ProductAPI.getCategories().catch(err => {
          console.log('Categories fetch fallback:', err);
          return [];
        }),
      ]);
      setProducts(prods.results.slice(0, 10));
      setCategories(cats.slice(0, 8));
    } catch (e) {
      console.log('Home load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    loadData().finally(() => clearTimeout(safetyTimer));

    return () => clearTimeout(safetyTimer);
  }, [loadData]);

  const handleAddToCart = useCallback(async (product: Product) => {
    try {
      setAddingId(product.id);
      const variantId = getProductVariantId(product);
      await CartAPI.addItem(variantId, 1);
      const name = getProductName(product);
      showToast(`"${name.slice(0, 30)}" added to bag`);
    } catch (e: any) {
      showToast(e?.message || 'Could not add to cart');
    } finally {
      setAddingId(null);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Loading LuxeLane...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {toastMsg && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>✓ {toastMsg}</Text>
        </View>
      )}
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.accent} />}
      >
        {/* Announcement Banner */}
        <View style={styles.announcementBanner}>
          <Text style={styles.announcementText}>✦ Free shipping on orders over $50 · Worldwide delivery ✦</Text>
        </View>

        {/* Member Sign In / Sign Up Bar if not logged in */}
        {!isLoggedIn && onNavigateAccount && (
          <TouchableOpacity
            style={styles.vipAuthBanner}
            onPress={onNavigateAccount}
            activeOpacity={0.88}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.vipAuthTitle}>Exclusive Member Access</Text>
              <Text style={styles.vipAuthSubtitle}>Sign in or create an account for private luxury perks</Text>
            </View>
            <View style={styles.vipAuthBadge}>
              <Text style={styles.vipAuthBadgeText}>Sign In / Join →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Hero Section */}
        <View style={styles.hero}>
          <Image
            source={STORE_HERO_IMAGE}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroOverlay}>
            <View style={styles.heroBadgeContainer}>
              <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>NEW SEASON</Text></View>
            </View>
            <Text style={styles.heroTitle}>Timeless{'\n'}Luxury</Text>
            <Text style={styles.heroSubtitle}>Curated pieces for the modern connoisseur</Text>
            <TouchableOpacity style={styles.heroCta} onPress={onNavigateShop} activeOpacity={0.85}>
              <Text style={styles.heroCtaText}>Explore Collection →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Categories */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Shop by Category" subtitle="Curated luxury collections" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {categories.map((cat: any) => {
                const catImg = getCategoryImg(cat);
                return (
                  <TouchableOpacity key={cat.id} style={styles.categoryPill} onPress={onNavigateShop} activeOpacity={0.8}>
                    <View style={styles.categoryIconBg}>
                      <Image source={catImg} style={styles.categoryImage} resizeMode="cover" />
                    </View>
                    <Text style={styles.categoryName} numberOfLines={2}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Trending Products */}
        <View style={styles.section}>
          <SectionHeader
            title="Trending Now"
            subtitle="Top picks this season"
            action={
              <TouchableOpacity onPress={onNavigateShop}>
                <Text style={styles.seeAll}>See All →</Text>
              </TouchableOpacity>
            }
          />
          {products.length > 0 ? (
            <ProductGrid
              products={products}
              onPress={onProductPress}
              onAddToCart={handleAddToCart}
            />
          ) : (
            <EmptyState icon="🛍️" title="No products yet" subtitle="Check back soon for our curated collection" />
          )}
        </View>

        {/* Value Props */}
        <View style={styles.valueProps}>
          {[
            { icon: '🏆', title: 'Authenticity', desc: '100% genuine luxury goods' },
            { icon: '✈️', title: 'Global Shipping', desc: 'Worldwide doorstep delivery' },
            { icon: '🤝', title: 'Concierge', desc: 'Personal styling assistance' },
          ].map(vp => (
            <View key={vp.title} style={styles.valueProp}>
              <Text style={styles.valuePropIcon}>{vp.icon}</Text>
              <Text style={styles.valuePropTitle}>{vp.title}</Text>
              <Text style={styles.valuePropDesc}>{vp.desc}</Text>
            </View>
          ))}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgPrimary },
  loadingText: { marginTop: 12, color: Colors.textMuted, fontSize: 14 },
  toast: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    backgroundColor: Colors.success,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 999,
    ...Shadows.lifted,
  },
  toastText: { color: Colors.white, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  announcementBanner: {
    backgroundColor: Colors.dark,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  announcementText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  hero: {
    position: 'relative',
    height: height * 0.44,
    margin: 16,
    borderRadius: Radii.xl,
    overflow: 'hidden',
    ...Shadows.lifted,
  },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    justifyContent: 'flex-end',
    padding: 24,
  },
  heroBadgeContainer: { marginBottom: 12 },
  heroBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(197, 160, 89, 0.85)',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: Radii.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  heroBadgeText: { color: Colors.accentLight, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  heroTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.white,
    fontFamily: 'Georgia',
    lineHeight: 42,
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 20,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroCta: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radii.md,
    paddingHorizontal: 22,
    paddingVertical: 12,
    ...Shadows.lifted,
  },
  heroCtaText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  section: { marginTop: 28 },
  seeAll: { fontSize: 13, color: Colors.accent, fontWeight: '700' },
  categoryRow: { paddingHorizontal: 16, gap: 14, paddingBottom: 8 },
  categoryPill: { alignItems: 'center', width: 76 },
  categoryIconBg: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    overflow: 'hidden',
    ...Shadows.card,
  },
  categoryImage: { width: '100%', height: '100%' },
  categoryName: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', lineHeight: 14 },
  valueProps: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 24,
    marginTop: 24,
    backgroundColor: Colors.dark,
    gap: 0,
  },
  valueProp: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  valuePropIcon: { fontSize: 24, marginBottom: 6 },
  valuePropTitle: { fontSize: 12, fontWeight: '700', color: Colors.white, textAlign: 'center', marginBottom: 4 },
  valuePropDesc: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 14 },
  vipAuthBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#0F172A',
    borderRadius: Radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(197, 160, 89, 0.4)',
    ...Shadows.card,
  },
  vipAuthTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  vipAuthSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  vipAuthBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.sm,
    marginLeft: 10,
  },
  vipAuthBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
  },
});
