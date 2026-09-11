import React, { useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import { Colors, Radii, Shadows } from '../theme/colors';
import { Rating, Badge } from './ui';
import { Product } from '../services/api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with 20px side padding + 8px gap

interface ProductCardProps {
  product: Product;
  onPress: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
}

const FALLBACK_PRODUCT_IMAGE = require('../../assets/product_placeholder.jpg');

export const getProductImage = (p: Product): string => {
  if (p.primary_image) return p.primary_image;
  if (p.images && p.images.length > 0) {
    const primary = p.images.find(img => img.is_primary);
    return primary?.image_url || p.images[0].image_url;
  }
  return '';
};

export const getProductImageSource = (p: Product): any => {
  const uri = getProductImage(p);
  if (uri && (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://'))) {
    return { uri };
  }
  return FALLBACK_PRODUCT_IMAGE;
};

export const getProductPrice = (p: Product): string => {
  const raw = p.base_price || p.price || '0';
  return parseFloat(raw).toFixed(2);
};

export const getProductName = (p: Product): string => {
  return p.title || p.name || 'Luxury Item';
};

export const getProductVariantId = (p: Product): string => {
  if (p.primary_variant_id) return String(p.primary_variant_id);
  if (p.variants && p.variants.length > 0 && p.variants[0].id) {
    return String(p.variants[0].id);
  }
  return String(p.id);
};

export const getCategoryName = (p: Product): string => {
  if (p.category_name) return p.category_name;
  if (!p.category) return '';
  if (typeof p.category === 'string') return p.category;
  return p.category.name || '';
};

export const ProductCard: React.FC<ProductCardProps> = ({ product, onPress, onAddToCart }) => {
  const imageSource = getProductImageSource(product);
  const price = getProductPrice(product);
  const name = getProductName(product);
  const rating = product.rating_avg ? parseFloat(String(product.rating_avg)) : 0;
  const category = getCategoryName(product);

  const handleAddToCart = useCallback((e: any) => {
    e.stopPropagation?.();
    onAddToCart?.(product);
  }, [product, onAddToCart]);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => onPress(product)}
      style={styles.card}
    >
      {/* Product Image */}
      <View style={styles.imageContainer}>
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
        />
        {category ? (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>
        ) : null}
      </View>

      {/* Product Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>

        {rating > 0 && (
          <View style={styles.ratingRow}>
            <Rating value={rating} count={product.rating_count} size={11} />
          </View>
        )}

        <View style={styles.priceRow}>
          <Text style={styles.price}>${price}</Text>
          {onAddToCart && (
            <TouchableOpacity onPress={handleAddToCart} style={styles.addBtn} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── ProductGrid ─────────────────────────────────────────────────────────────
interface ProductGridProps {
  products: Product[];
  onPress: (p: Product) => void;
  onAddToCart?: (p: Product) => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({ products, onPress, onAddToCart }) => (
  <View style={styles.grid}>
    {products.map(p => (
      <ProductCard
        key={p.id}
        product={p}
        onPress={onPress}
        onAddToCart={onAddToCart}
      />
    ))}
  </View>
);


const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    justifyContent: 'space-between',
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.bgCard,
    borderRadius: Radii.lg,
    overflow: 'hidden',
    marginBottom: 4,
    ...Shadows.card,
  },
  imageContainer: {
    width: '100%',
    height: CARD_WIDTH * 1.05,
    backgroundColor: Colors.bgSubtle,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: { color: Colors.white, fontSize: 10, fontWeight: '600' },
  info: { padding: 12 },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 18,
    marginBottom: 6,
  },
  ratingRow: { marginBottom: 8 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  addBtnText: { color: Colors.white, fontSize: 18, fontWeight: '700', lineHeight: 20 },
});
