import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Dimensions,
  RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Shadows } from '../theme/colors';
import { EmptyState, Badge } from '../components/ui';
import { ProductGrid, getProductImage, getProductPrice, getProductName, getProductVariantId } from '../components/ProductCard';
import { ProductAPI, CartAPI, Product } from '../services/api';

const { width } = Dimensions.get('window');

const SORT_OPTIONS = [
  { label: 'Featured', value: '' },
  { label: 'Price: Low → High', value: 'base_price' },
  { label: 'Price: High → Low', value: '-base_price' },
  { label: 'Top Rated', value: '-rating_avg' },
  { label: 'Newest', value: '-created_at' },
];

interface ShopScreenProps {
  onProductPress: (p: Product) => void;
  initialCategory?: string;
}

export const ShopScreen: React.FC<ShopScreenProps> = ({ onProductPress, initialCategory }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([{ id: '', name: 'All Collections', slug: 'all' }]);
  const [selectedCat, setSelectedCat] = useState(initialCategory || '');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showSort, setShowSort] = useState(false);
  const [addingId, setAddingId] = useState<string | number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Sync initialCategory prop if passed or updated
  useEffect(() => {
    if (initialCategory !== undefined) {
      setSelectedCat(initialCategory);
    }
  }, [initialCategory]);

  // Load Categories once on mount
  useEffect(() => {
    ProductAPI.getCategories()
      .then((cats) => {
        const list = Array.isArray(cats) ? cats : [];
        setCategories([
          { id: '', name: 'All Collections', slug: 'all' },
          ...list,
        ]);
      })
      .catch((e) => console.log('Error loading categories in Shop:', e));
  }, []);

  const loadProducts = useCallback(async (opts: { reset?: boolean; searchVal?: string; cat?: string; sortVal?: string } = {}) => {
    const { reset = false, searchVal = search, cat = selectedCat, sortVal = sort } = opts;
    const nextPage = reset ? 1 : page;
    if (reset) setPage(1);

    try {
      const res = await ProductAPI.getProducts({
        search: searchVal,
        category: cat,
        ordering: sortVal,
        page: nextPage,
      });

      if (reset) {
        setProducts(res.results || []);
      } else {
        setProducts(prev => [...prev, ...(res.results || [])]);
      }
      setTotalCount(res.count || 0);
      if (!reset) setPage(p => p + 1);
    } catch (e) {
      console.log('Shop load error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [search, selectedCat, sort, page]);

  // Debounced search / filter trigger
  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      loadProducts({ reset: true });
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, selectedCat, sort]);

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

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCat('');
    setSort('');
  };

  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label;

  return (
    <View style={styles.container}>
      {/* Toast Feedback */}
      {toastMsg && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>✓ {toastMsg}</Text>
        </View>
      )}

      {/* Main ScrollView with Sticky Header */}
      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={styles.gridScrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadProducts({ reset: true }); }}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 80;
          if (isNearBottom && !loadingMore && products.length < totalCount) {
            setLoadingMore(true);
            loadProducts();
          }
        }}
        scrollEventThrottle={200}
      >
        {/* Index 0: Top Banner: Collections Title & Tagline (Slides up on scroll) */}
        <View style={styles.topHeaderBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.superTitle}>LUXELANE ATELIER</Text>
            <Text style={styles.pageTitle}>Curated Collections</Text>
          </View>
          <Badge
            label="EXCLUSIVE"
            color={Colors.accent}
            bg="rgba(197, 160, 89, 0.15)"
          />
        </View>

        {/* Index 1: Sticky Controls (Search Bar & Filters stay pinned at top) */}
        <View style={styles.stickyControlsWrapper}>
          {/* Search Bar & Sort Row */}
          <View style={styles.searchHeaderRow}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={Colors.accent} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search watches, bespoke tailoring, gifts..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Luxury Sort Button */}
            <TouchableOpacity
              style={[styles.sortBtn, !!sort && styles.sortBtnActive]}
              onPress={() => setShowSort(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={sort ? Colors.accent : Colors.white}
              />
              {!!sort && <View style={styles.sortIndicatorDot} />}
            </TouchableOpacity>
          </View>

          {/* Category Filter Pills Row */}
          <View style={styles.catScrollWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catPillsContainer}
              style={styles.catScroll}
              nestedScrollEnabled={true}
            >
              {categories.map((cat) => {
                const isActive = selectedCat === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id || 'all'}
                    style={[styles.catPill, isActive && styles.catPillActive]}
                    onPress={() => setSelectedCat(cat.id)}
                    activeOpacity={0.8}
                  >
                    {isActive && <View style={styles.catActiveDot} />}
                    <Text style={[styles.catPillText, isActive && styles.catPillTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Index 2: Products Grid / States */}
        <View style={styles.productsContainer}>
          {loading && products.length === 0 ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.loadingText}>Curating boutique items...</Text>
            </View>
          ) : products.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No Creations Found"
              subtitle={search ? `No items matched "${search}". Try another keyword.` : `No items available in this category.`}
              action={
                <TouchableOpacity style={styles.clearFiltersBtn} onPress={handleResetFilters}>
                  <Text style={styles.clearFiltersBtnText}>View All Collections</Text>
                </TouchableOpacity>
              }
            />
          ) : (
            <View>
              <ProductGrid
                products={products}
                onPress={onProductPress}
                onAddToCart={handleAddToCart}
              />
              {loadingMore && (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={Colors.accent} />
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sort Options Bottom Sheet Modal */}
      <Modal
        visible={showSort}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSort(false)}
      >
        <TouchableOpacity
          style={styles.sortModalBg}
          activeOpacity={1}
          onPress={() => setShowSort(false)}
        >
          <View style={styles.sortModal}>
            <View style={styles.sortHandle} />
            <View style={styles.sortModalHeader}>
              <Text style={styles.sortTitle}>Sort Creations</Text>
              <TouchableOpacity onPress={() => setShowSort(false)}>
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.sortOption, sort === opt.value && styles.sortOptionActive]}
                onPress={() => { setSort(opt.value); setShowSort(false); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.sortOptionText, sort === opt.value && styles.sortOptionTextActive]}>
                  {opt.label}
                </Text>
                {sort === opt.value && (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  toast: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    backgroundColor: Colors.dark,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 999,
    borderWidth: 1,
    borderColor: Colors.accent,
    ...Shadows.lifted,
  },
  toastText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  topHeaderBanner: {
    backgroundColor: Colors.white,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  superTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  pageTitle: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  stickyControlsWrapper: {
    backgroundColor: Colors.white,
    zIndex: 10,
    elevation: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: Colors.white,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSubtle,
    borderRadius: Radii.full,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    height: '100%',
    paddingVertical: Platform.OS === 'android' ? 0 : 4,
  },
  sortBtn: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: Colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Shadows.card,
  },
  sortBtnActive: {
    borderColor: Colors.accent,
    borderWidth: 1.5,
  },
  sortIndicatorDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  catScrollWrapper: {
    backgroundColor: Colors.white,
  },
  catScroll: {
    flexGrow: 0,
    height: 48,
  },
  catPillsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: Radii.full,
    backgroundColor: Colors.bgSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  catPillActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.accent,
  },
  catActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.accent,
    marginRight: 6,
  },
  catPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  catPillTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  gridScroll: {
    flex: 1,
  },
  gridScrollContent: {
    flexGrow: 1,
  },
  productsContainer: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  loadingArea: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 12,
  },
  clearFiltersBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radii.md,
  },
  clearFiltersBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  sortModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sortModal: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    ...Shadows.lifted,
  },
  sortHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sortModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sortTitle: {
    fontFamily: 'Georgia',
    fontSize: 19,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: Radii.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sortOptionActive: {
    backgroundColor: Colors.accentBg,
  },
  sortOptionText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  sortOptionTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
});
