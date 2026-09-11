import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, Image, ScrollView,
  TouchableOpacity, ActivityIndicator, Dimensions, Platform,
} from 'react-native';
import { Colors, Radii, Shadows } from '../theme/colors';
import { Button, Badge, Rating, Price, Divider } from '../components/ui';
import { getProductImage, getProductPrice, getProductName, getProductVariantId } from '../components/ProductCard';
import { Product, ProductAPI, CartAPI } from '../services/api';

const { width, height } = Dimensions.get('window');

interface ProductDetailModalProps {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onAddedToCart?: (itemCount: number) => void;
}

const DEFAULT_PRODUCT_IMAGE = require('../../assets/product_placeholder.jpg');

const getImageSource = (uri?: string | null) => {
  if (uri && (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://'))) {
    return { uri };
  }
  return DEFAULT_PRODUCT_IMAGE;
};

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  visible, product, onClose, onAddedToCart,
}) => {
  const [detailedProduct, setDetailedProduct] = useState<Product | null>(null);
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible && product) {
      setDetailedProduct(product);
      setActiveImgIndex(0);
      setQuantity(1);
      setAddSuccess(false);
      setErrorMsg(null);

      // Fetch full product detail in case partial data was passed from list
      ProductAPI.getProduct(product.id)
        .then((full) => {
          if (full) setDetailedProduct(full);
        })
        .catch((err) => console.log('Error fetching full product details:', err));
    } else {
      setDetailedProduct(null);
    }
  }, [visible, product]);

  if (!visible || !product) return null;

  const current = detailedProduct || product;
  const primaryImg = getProductImage(current);
  const price = parseFloat(getProductPrice(current)) || 0;
  const brandName = typeof current.brand === 'string' ? current.brand : current.brand?.name || 'LUXE';
  const categoryName = typeof current.category === 'string' ? current.category : current.category?.name || 'Luxury Collection';

  // Gather gallery images if any
  const images: string[] = [];
  if (current.images && Array.isArray(current.images) && current.images.length > 0) {
    current.images.forEach((img: any) => {
      const url = img.image_url || img.image;
      if (url) images.push(url);
    });
  }
  if (images.length === 0) {
    images.push(primaryImg);
  }

  const handleAddToCart = async () => {
    setAddingToCart(true);
    setErrorMsg(null);
    try {
      const variantId = getProductVariantId(current);
      const res = await CartAPI.addItem(variantId, quantity);
      setAddSuccess(true);
      if (res && res.item_count !== undefined) {
        onAddedToCart?.(res.item_count);
      } else {
        const summary = await CartAPI.getSummary();
        onAddedToCart?.(summary.item_count || 1);
      }
      setTimeout(() => {
        setAddSuccess(false);
        onClose();
      }, 1200);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Could not add product to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const stock = current.stock !== undefined ? current.stock : 10;
  const isOutOfStock = stock <= 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header Bar with Close Button */}
        <View style={styles.headerBar}>
          <Text style={styles.headerCategory}>{categoryName.toUpperCase()}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Gallery carousel */}
          <View style={styles.galleryContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                setActiveImgIndex(newIndex);
              }}
            >
              {images.map((imgUri, idx) => (
                <Image
                  key={idx}
                  source={getImageSource(imgUri)}
                  style={styles.productImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>

            {/* Pagination dots if multiple images */}
            {images.length > 1 && (
              <View style={styles.paginationDots}>
                {images.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      idx === activeImgIndex && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Details Container */}
          <View style={styles.detailsContainer}>
            {/* Brand & Stock Row */}
            <View style={styles.metaRow}>
              <Badge label={brandName} color={Colors.accent} bg={Colors.accentBg} />
              <Badge
                label={isOutOfStock ? 'OUT OF STOCK' : stock < 5 ? `ONLY ${stock} LEFT` : 'IN STOCK'}
                color={isOutOfStock ? Colors.error : stock < 5 ? Colors.warning : Colors.success}
                bg={isOutOfStock ? Colors.errorBg : stock < 5 ? Colors.warningBg : Colors.successBg}
              />
            </View>

            {/* Title */}
            <Text style={styles.productTitle}>{getProductName(current)}</Text>

            {/* Rating & Review Count */}
            <View style={styles.ratingRow}>
              <Rating value={current.rating_avg || 4.8} count={current.rating_count || 18} size={15} />
              <Text style={styles.skuText}>Ref: {current.slug || `#${current.id}`}</Text>
            </View>

            {/* Price section */}
            <View style={styles.priceRow}>
              <Text style={styles.priceMain}>${price.toFixed(2)}</Text>
              {current.base_price && parseFloat(current.base_price) > price && (
                <Text style={styles.priceOriginal}>${parseFloat(current.base_price).toFixed(2)}</Text>
              )}
            </View>

            <Divider />

            {/* Description */}
            <Text style={styles.sectionHeader}>Description</Text>
            <Text style={styles.descriptionText}>
              {current.description ||
                'Impeccably crafted with the finest luxury materials, representing timeless design and unmatched elegance.'}
            </Text>

            {/* Specifications if any */}
            {current.specifications && Object.keys(current.specifications).length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionHeader}>Specifications</Text>
                <View style={styles.specsCard}>
                  {Object.entries(current.specifications).map(([key, val], idx) => (
                    <View key={idx} style={styles.specRow}>
                      <Text style={styles.specKey}>{key}</Text>
                      <Text style={styles.specVal}>{String(val)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Error banner if add to cart fails */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>{errorMsg}</Text>
              </View>
            )}

            {/* Success banner */}
            {addSuccess && (
              <View style={styles.successBox}>
                <Text style={styles.successBoxText}>✓ Added to your luxury bag</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Floating Bottom Bar: Quantity Selector + Add to Cart Button */}
        <View style={styles.bottomBar}>
          {/* Quantity Controls */}
          <View style={styles.qtyContainer}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1 || isOutOfStock}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyVal}>{quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQuantity(Math.min(stock, quantity + 1))}
              disabled={quantity >= stock || isOutOfStock}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Action Button */}
          <View style={{ flex: 1 }}>
            <Button
              label={
                isOutOfStock ? 'Sold Out' :
                addSuccess ? 'Added to Bag ✓' :
                `Add to Bag • $${(price * quantity).toFixed(2)}`
              }
              onPress={handleAddToCart}
              loading={addingToCart}
              disabled={isOutOfStock || addSuccess}
              variant={addSuccess ? 'secondary' : 'primary'}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 14 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCategory: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  scrollArea: {
    flex: 1,
  },
  galleryContainer: {
    width: width,
    height: width * 0.95,
    backgroundColor: Colors.bgSubtle,
    position: 'relative',
  },
  productImage: {
    width: width,
    height: width * 0.95,
  },
  paginationDots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: Colors.accent,
    width: 20,
  },
  detailsContainer: {
    padding: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  productTitle: {
    fontFamily: 'Georgia',
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 30,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  skuText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 6,
  },
  priceMain: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.accent,
  },
  priceOriginal: {
    fontSize: 18,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  specsCard: {
    backgroundColor: Colors.bgSubtle,
    borderRadius: Radii.md,
    padding: 12,
    gap: 8,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  specKey: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  specVal: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: Colors.errorBg,
    borderRadius: Radii.sm,
    padding: 10,
    marginTop: 14,
  },
  errorBoxText: {
    color: Colors.error,
    fontSize: 13,
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: Colors.successBg,
    borderRadius: Radii.sm,
    padding: 10,
    marginTop: 14,
  },
  successBoxText: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...Shadows.lifted,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    backgroundColor: Colors.bgSubtle,
  },
  qtyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  qtyVal: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
    color: Colors.textPrimary,
  },
});
