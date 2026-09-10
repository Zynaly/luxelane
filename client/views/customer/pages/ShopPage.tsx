import React, { useState, useEffect, useMemo } from 'react';
import API, { ProductListItem, CategoryItem } from '../../../services/api';
import { Icon } from '../../../components/Icon';

interface ShopPageProps {
  onNavigate?: (page: 'home' | 'shop' | 'about' | 'contact' | 'cart' | 'account') => void;
  onCartChange?: (itemCount: number) => void;
  initialCategory?: string;
}

export const ShopPage: React.FC<ShopPageProps> = ({ onNavigate, onCartChange, initialCategory }) => {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'all');
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [sortBy, setSortBy] = useState<'featured' | 'price-low' | 'price-high' | 'rating'>('featured');

  useEffect(() => {
    let isMounted = true;
    const loadCatalog = async () => {
      setLoading(true);
      try {
        const [prodRes, catRes] = await Promise.all([
          API.Product.list(),
          API.Category.list(),
        ]);
        if (isMounted) {
          setProducts(prodRes);
          setCategories(catRes);
        }
      } catch (err) {
        console.error('Failed to load marketplace catalog:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadCatalog();
    return () => { isMounted = false; };
  }, []);

  const handleAddToCart = async (product: ProductListItem) => {
    try {
      setAddingToCartId(product.id);
      let variantId = product.primary_variant_id;
      if (!variantId) {
        const detail = await API.Product.retrieve(product.id);
        if (detail.variants && detail.variants.length > 0) {
          variantId = detail.variants[0].id;
        }
      }

      if (!variantId) {
        throw new Error('No available stock variant for this item.');
      }

      await API.Cart.addItem({ variant_id: variantId, quantity: 1 });
      const summary = await API.Cart.getSummary();
      onCartChange?.(summary.item_count || 0);

      setFeedbackMessage(`Added "${product.title}" to your shopping bag!`);
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Unable to add item to bag.');
    } finally {
      setAddingToCartId(null);
    }
  };

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const priceNum = parseFloat(p.base_price) || 0;
        const matchesCategory =
          selectedCategory === 'all' ||
          (p.category_name && p.category_name.toLowerCase().includes(selectedCategory.toLowerCase())) ||
          (p.slug && p.slug.toLowerCase().includes(selectedCategory.toLowerCase()));
        
        const matchesSearch =
          !searchQuery ||
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.brand_name && p.brand_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (p.vendor_display_name && p.vendor_display_name.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesPrice = priceNum <= maxPrice;

        return matchesCategory && matchesSearch && matchesPrice;
      })
      .sort((a, b) => {
        const priceA = parseFloat(a.base_price) || 0;
        const priceB = parseFloat(b.base_price) || 0;
        if (sortBy === 'price-low') return priceA - priceB;
        if (sortBy === 'price-high') return priceB - priceA;
        if (sortBy === 'rating') return parseFloat(b.rating_avg || '0') - parseFloat(a.rating_avg || '0');
        return 0;
      });
  }, [products, selectedCategory, searchQuery, maxPrice, sortBy]);

  return (
    <div className="bg-stone-50 min-h-screen">
      {/* Toast Notification */}
      {feedbackMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 text-amber-100 px-5 py-3.5 rounded-xl shadow-2xl flex items-center space-x-3 border border-amber-900/40 animate-bounce">
          <Icon name="check" className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{feedbackMessage}</span>
          <button
            onClick={() => onNavigate?.('cart')}
            className="ml-2 text-xs font-bold text-amber-300 underline hover:text-white"
          >
            View Bag
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-stone-900 text-stone-100 py-16 px-4 sm:px-6 lg:px-8 border-b border-stone-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-amber-400/90 text-xs font-semibold uppercase tracking-widest block mb-2">
              LuxeLane Haute Marketplace
            </span>
            <h1 className="text-4xl sm:text-5xl font-serif font-bold text-white tracking-tight">
              Curated Atelier Catalog
            </h1>
            <p className="mt-2 text-stone-400 text-base max-w-xl">
              Discover real bespoke collections spanning Italian tailoring, luxury footwear, rare Parisian fragrances, and aesthetic living goods.
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-stone-800/80 p-2 rounded-2xl border border-stone-700 w-full sm:w-80">
            <Icon name="search" className="w-5 h-5 text-stone-400 ml-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clothes, shoes, gifts..."
              className="bg-transparent border-none text-white text-sm focus:outline-none w-full placeholder-stone-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-stone-400 hover:text-white mr-1 text-xs">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Filters */}
          <aside className="lg:col-span-1 space-y-8 bg-white p-6 rounded-2xl shadow-sm border border-stone-200/80 h-fit sticky top-24">
            <div>
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider mb-4">
                Categories
              </h3>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-amber-900/10 text-amber-900 font-semibold border-l-4 border-amber-800'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  All Collections ({products.length})
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategory(c.slug)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedCategory === c.slug
                        ? 'bg-amber-900/10 text-amber-900 font-semibold border-l-4 border-amber-800'
                        : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Filter */}
            <div className="border-t border-stone-100 pt-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Max Price
                </span>
                <span className="text-sm font-semibold text-amber-900">${maxPrice.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="50"
                max="10000"
                step="50"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-800"
              />
              <div className="flex justify-between text-xs text-stone-500 mt-1">
                <span>$50</span>
                <span>$10,000+</span>
              </div>
            </div>

            {/* Sort Filter */}
            <div className="border-t border-stone-100 pt-6">
              <span className="text-xs font-bold text-stone-900 uppercase tracking-wider block mb-2">
                Sort By
              </span>
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-800"
              >
                <option value="featured">Featured Artisanal Picks</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Top Customer Rated</option>
              </select>
            </div>
          </aside>

          {/* Product Grid */}
          <div className="lg:col-span-3">
            <div className="flex justify-between items-center mb-6">
              <p className="text-sm text-stone-500">
                Showing <strong className="text-stone-900">{filteredProducts.length}</strong> luxury items
              </p>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 animate-pulse h-96">
                    <div className="bg-stone-200 h-56 rounded-xl mb-4" />
                    <div className="bg-stone-200 h-4 rounded w-3/4 mb-2" />
                    <div className="bg-stone-200 h-4 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-stone-300">
                <Icon name="search" className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                <h3 className="text-lg font-serif font-semibold text-stone-800">No matching creations found</h3>
                <p className="text-stone-500 text-sm mt-1">Try relaxing your price filter or selecting another category.</p>
                <button
                  onClick={() => { setSelectedCategory('all'); setSearchQuery(''); setMaxPrice(10000); }}
                  className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-semibold hover:bg-stone-800"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((product) => {
                  const isAdding = addingToCartId === product.id;
                  return (
                    <div
                      key={product.id}
                      className="group relative bg-white rounded-2xl border border-stone-200/90 shadow-sm overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300"
                    >
                      {/* Image Frame */}
                      <div className="relative aspect-[4/5] bg-stone-100 overflow-hidden">
                        <img
                          src={product.primary_image || 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&q=80&w=600'}
                          alt={product.title}
                          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                        />
                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1">
                          <span className="bg-white/95 backdrop-blur text-stone-900 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
                            {product.category_name}
                          </span>
                        </div>

                        {product.vendor_display_name && (
                          <div className="absolute bottom-3 left-3">
                            <span className="bg-stone-900/80 backdrop-blur text-white text-[10px] font-medium px-2 py-0.5 rounded-md">
                              {product.vendor_display_name}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          {product.brand_name && (
                            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider mb-1">
                              {product.brand_name}
                            </p>
                          )}
                          <h3 className="text-base font-serif font-bold text-stone-900 group-hover:text-amber-900 transition-colors line-clamp-2">
                            {product.title}
                          </h3>
                        </div>

                        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                          <div>
                            <span className="text-xs text-stone-400 block font-sans">Price</span>
                            <span className="text-lg font-bold text-stone-900">
                              ${parseFloat(product.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddToCart(product)}
                            disabled={isAdding}
                            className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-stone-900 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50"
                          >
                            <Icon name="cart" className="w-3.5 h-3.5" />
                            <span>{isAdding ? 'Adding...' : 'Add to Bag'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ShopPage;
