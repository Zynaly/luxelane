import React, { useState, useEffect } from 'react';
import API, { ProductListItem, CategoryItem } from '../../../services/api';
import { Icon } from '../../../components/Icon';

interface ShopPageProps {
  onNavigate?: (page: 'home' | 'shop' | 'about' | 'contact' | 'cart' | 'account') => void;
  onCartChange?: (count: number) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({ onNavigate, onCartChange }) => {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<{ title: string; price: string; image?: string | null } | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<number>(100000);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');

  useEffect(() => {
    let isMounted = true;

    const loadShopData = async () => {
      try {
        setLoading(true);
        const [prodList, catList] = await Promise.allSettled([
          API.Product.list(),
          API.Category.list(),
        ]);

        if (isMounted) {
          if (prodList.status === 'fulfilled' && prodList.value) {
            setProducts(prodList.value);
          }
          if (catList.status === 'fulfilled' && catList.value) {
            setCategories(catList.value);
          }
        }
      } catch (err) {
        console.warn('Failed to load shop catalog:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadShopData();
    return () => { isMounted = false; };
  }, []);

  const handleAddToCart = async (e: React.MouseEvent, product: ProductListItem) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      setAddingId(product.id);
      let variantId = product.default_variant_id;

      if (!variantId) {
        const detail = await API.Product.retrieve(product.id);
        variantId = detail.variants?.[0]?.id;
      }

      if (!variantId) {
        alert('This product does not have an active variant available for purchase.');
        return;
      }

      await API.Cart.addItem({ variant_id: variantId, quantity: 1 });

      try {
        const summary = await API.Cart.getSummary();
        onCartChange?.(summary.item_count || 0);
      } catch {
        onCartChange?.((prev) => (typeof prev === 'number' ? prev + 1 : 1));
      }

      setAddedToast({
        title: product.title,
        price: product.base_price,
        image: product.primary_image,
      });

      setTimeout(() => {
        setAddedToast(null);
      }, 5000);
    } catch (err: any) {
      console.error('Failed to add to bag:', err);
      alert(err.message || 'Failed to add item to shopping bag. Please try again.');
    } finally {
      setAddingId(null);
    }
  };

  const filteredProducts = products.filter((p) => {
    const pPrice = parseFloat(p.base_price) || 0;
    const catMatch = selectedCategory === 'all' || p.category_name?.toLowerCase() === selectedCategory.toLowerCase() || p.slug.includes(selectedCategory);
    const searchMatch = !searchQuery.trim() || p.title.toLowerCase().includes(searchQuery.toLowerCase()) || (p.brand_name && p.brand_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const priceMatch = pPrice <= maxPrice;
    return catMatch && searchMatch && priceMatch;
  }).sort((a, b) => {
    const priceA = parseFloat(a.base_price) || 0;
    const priceB = parseFloat(b.base_price) || 0;
    if (sortBy === 'price-asc') return priceA - priceB;
    if (sortBy === 'price-desc') return priceB - priceA;
    return 0;
  });

  return (
    <div className="bg-white font-sans min-h-screen">
      {/* Toast Notification */}
      {addedToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full bg-dark text-white rounded-2xl p-4 shadow-2xl border border-gold/30 flex items-center justify-between space-x-4 animate-bounce-in">
          <div className="flex items-center space-x-3 overflow-hidden">
            {addedToast.image ? (
              <img src={addedToast.image} alt={addedToast.title} className="w-12 h-12 object-cover rounded-xl border border-gray-700 flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 text-accent">
                <Icon name="cart" className="w-6 h-6" />
              </div>
            )}
            <div className="truncate">
              <p className="text-xs text-accent font-semibold uppercase tracking-wider">Added to Bag</p>
              <p className="text-sm font-medium text-white truncate">{addedToast.title}</p>
              <p className="text-xs text-gray-400 font-serif">${parseFloat(addedToast.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => { setAddedToast(null); onNavigate?.('cart'); }}
              className="bg-accent hover:bg-accent-hover text-white text-xs font-semibold px-3.5 py-2 rounded-full transition-all shadow-md"
            >
              View Bag
            </button>
            <button
              onClick={() => setAddedToast(null)}
              className="text-gray-400 hover:text-white p-1"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gray-50 border-b border-gray-200 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <span className="text-xs font-semibold text-accent uppercase tracking-widest">Atelier Catalog</span>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-dark mt-1">LuxeLane Collections</h1>
            <p className="text-sm text-gray-600 font-light mt-2">
              Browse authenticated luxury horology, haute joaillerie, and bespoke leathercraft.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-3">
            <button
              onClick={() => onNavigate?.('cart')}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-dark hover:bg-gray-800 text-white rounded-full text-xs font-semibold transition-all shadow-md"
            >
              <Icon name="cart" className="w-4 h-4" />
              <span>Go to Shopping Bag</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Filters */}
          <aside className="space-y-6">
            {/* Search */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <label className="text-xs font-bold text-dark uppercase tracking-wider block mb-2">Search Creations</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Chronograph, Kelly, Bangle..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                    <Icon name="x" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Department Filter */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <label className="text-xs font-bold text-dark uppercase tracking-wider block mb-3">Departments</label>
              <div className="space-y-1.5 text-xs">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-dark text-white font-semibold'
                      : 'text-gray-700 hover:bg-gray-200/60'
                  }`}
                >
                  All Collections ({products.length})
                </button>
                {categories.map((c) => {
                  const count = products.filter((p) => p.category_name?.toLowerCase() === c.name.toLowerCase()).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.name)}
                      className={`w-full text-left px-3 py-2 rounded-lg font-medium flex items-center justify-between transition-colors ${
                        selectedCategory.toLowerCase() === c.name.toLowerCase()
                          ? 'bg-dark text-white font-semibold'
                          : 'text-gray-700 hover:bg-gray-200/60'
                      }`}
                    >
                      <span>{c.name}</span>
                      <span className="text-[10px] opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price Filter */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-dark uppercase tracking-wider">Price Range</label>
                <span className="text-xs font-serif font-bold text-accent">${maxPrice.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-accent cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-2">
                <span>$1,000</span>
                <span>$100,000+</span>
              </div>
            </div>

            {/* Clear All */}
            {(selectedCategory !== 'all' || searchQuery || maxPrice < 100000) && (
              <button
                onClick={() => { setSelectedCategory('all'); setSearchQuery(''); setMaxPrice(100000); }}
                className="w-full py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Reset Filters
              </button>
            )}
          </aside>

          {/* Product Grid Area */}
          <div className="lg:col-span-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
              <p className="text-xs text-gray-500">
                Showing <span className="font-semibold text-dark">{filteredProducts.length}</span> curated creations
              </p>
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-gray-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="featured">Featured Artisans</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-accent mb-3" />
                <p className="text-xs text-gray-500 font-medium">Curating verified luxury vault...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-2xl p-16 text-center text-gray-500">
                <Icon name="package" className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                <h3 className="text-base font-serif font-bold text-dark mb-1">No Creations Match Filters</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                  Adjust your search keyword, department, or maximum price threshold to explore other pieces.
                </p>
                <button
                  onClick={() => { setSelectedCategory('all'); setSearchQuery(''); setMaxPrice(100000); }}
                  className="px-4 py-2 bg-dark text-white rounded-full text-xs font-semibold hover:bg-gray-800 transition-colors"
                >
                  View All Products
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((p) => {
                  const isAdding = addingId === p.id;
                  const price = parseFloat(p.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 });
                  return (
                    <div
                      key={p.id}
                      className="group bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
                    >
                      <div className="relative aspect-square overflow-hidden bg-gray-100">
                        <img
                          src={p.primary_image || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=800'}
                          alt={p.title}
                          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold text-dark shadow-sm">
                          {p.category_name || 'Fine Good'}
                        </div>
                      </div>

                      <div className="p-5 flex flex-col flex-1 justify-between">
                        <div>
                          <p className="text-[11px] font-medium text-accent uppercase tracking-wider truncate">
                            {p.brand_name || p.vendor_display_name || 'Maison de Luxe'}
                          </p>
                          <h3 className="text-sm font-serif font-bold text-dark mt-1 line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                            {p.title}
                          </h3>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-baseline justify-between mb-3">
                            <span className="text-lg font-serif font-bold text-dark">${price}</span>
                            <span className="text-[11px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">In Stock</span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleAddToCart(e, p)}
                            disabled={isAdding}
                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                              isAdding
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-dark hover:bg-accent text-white shadow-md active:scale-95'
                            }`}
                          >
                            <Icon name="cart" className="w-4 h-4" />
                            <span>{isAdding ? 'Adding to Bag...' : 'Add to Bag'}</span>
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
