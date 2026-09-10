import React, { useState, useEffect } from 'react';
import API, { ProductListItem, CategoryItem } from '../../services/api';
import { Icon } from '../../components/Icon';

interface HomePageProps {
  onNavigate?: (page: 'home' | 'shop' | 'about' | 'contact' | 'cart' | 'account') => void;
  onCartChange?: (count: number) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onCartChange }) => {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<{ title: string; price: string; image?: string | null } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const [prodList, catList] = await Promise.allSettled([
          API.Product.list(),
          API.Category.list(),
        ]);

        if (isMounted) {
          if (prodList.status === 'fulfilled' && prodList.value && prodList.value.length > 0) {
            setProducts(prodList.value);
          }
          if (catList.status === 'fulfilled' && catList.value && catList.value.length > 0) {
            setCategories(catList.value);
          }
        }
      } catch (err) {
        console.warn('Failed to load live catalog:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, []);

  const handleAddToCart = async (e: React.MouseEvent, product: ProductListItem) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      setAddingId(product.id);
      let variantId = product.default_variant_id;

      // Fallback: if variant_id not attached, fetch product detail
      if (!variantId) {
        const detail = await API.Product.retrieve(product.id);
        variantId = detail.variants?.[0]?.id;
      }

      if (!variantId) {
        alert('This product does not have an active variant available for purchase.');
        return;
      }

      await API.Cart.addItem({ variant_id: variantId, quantity: 1 });

      // Refresh cart summary count
      try {
        const summary = await API.Cart.getSummary();
        onCartChange?.(summary.item_count || 0);
      } catch {
        // Increment fallback
        onCartChange?.((prev) => (typeof prev === 'number' ? prev + 1 : 1));
      }

      // Show toast
      setAddedToast({
        title: product.title,
        price: product.base_price,
        image: product.primary_image,
      });

      // Auto dismiss toast after 5s
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

  const featured = products.slice(0, 4);
  const newArrivals = products.slice(2, 6);

  return (
    <div className="bg-white font-sans">
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

      <main>
        {/* Hero Section */}
        <div className="relative bg-dark">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=1920"
              alt="Luxury Haute Horology"
              className="w-full h-full object-center object-cover opacity-50"
            />
          </div>
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
          <div className="relative max-w-7xl mx-auto py-28 px-6 sm:py-36 lg:px-8">
            <div className="max-w-2xl">
              <span className="text-xs font-semibold text-accent uppercase tracking-widest bg-accent/10 px-3 py-1 rounded-full border border-accent/30 inline-block mb-4">
                Haute Horlogerie & Bespoke Artisans
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-white leading-tight">
                Elegance in Every Masterpiece
              </h1>
              <p className="mt-4 text-lg text-gray-300 font-light leading-relaxed">
                Discover exceptional timepieces, handcrafted exotic leathers, and platinum jewelry created with uncompromising craftsmanship.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={() => onNavigate?.('shop')}
                  className="bg-accent hover:bg-accent-hover text-white rounded-full py-3.5 px-8 text-sm font-semibold transition-all transform hover:scale-105 shadow-xl shadow-accent/20"
                >
                  Explore Collection &rarr;
                </button>
                <button
                  onClick={() => onNavigate?.('cart')}
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 rounded-full py-3.5 px-8 text-sm font-semibold transition-all"
                >
                  View Shopping Bag
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Categories Section */}
        <section className="py-16 bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <span className="text-xs font-semibold text-accent uppercase tracking-widest">Departments</span>
                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-dark mt-1">Curated Maisons</h2>
              </div>
              <button
                onClick={() => onNavigate?.('shop')}
                className="text-xs font-semibold text-dark hover:text-accent flex items-center space-x-1"
              >
                <span>Browse All</span>
                <span>&rarr;</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { name: 'Fine Timepieces', slug: 'fine-timepieces', img: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=600' },
                { name: 'Leather Goods', slug: 'leather-goods', img: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=600' },
                { name: 'Haute Joaillerie', slug: 'haute-joaillerie', img: 'https://images.unsplash.com/photo-1611591475822-263085521b33?auto=format&fit=crop&q=80&w=600' },
                { name: 'Silk & Cashmere', slug: 'silk-cashmere', img: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=600' },
              ].map((c) => (
                <div
                  key={c.name}
                  onClick={() => onNavigate?.('shop')}
                  className="group relative h-56 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all"
                >
                  <img
                    src={c.img}
                    alt={c.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-dark/80 via-dark/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <p className="text-sm font-serif font-bold group-hover:text-accent transition-colors">{c.name}</p>
                    <p className="text-xs text-gray-300 font-light mt-0.5">Explore Atelier &rarr;</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Products Section */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <span className="text-xs font-semibold text-accent uppercase tracking-widest">Masterpieces</span>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-dark mt-1">Featured Creations</h2>
              <p className="mt-3 text-sm text-gray-600 font-light">
                Hand-finished horology and heirloom leather craft vetted by our Parisian ateliers.
              </p>
            </div>

            {loading ? (
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-accent mb-3" />
                <p className="text-xs text-gray-500 font-medium">Curating atelier vault...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {featured.map((p) => {
                  const isAdding = addingId === p.id;
                  const price = parseFloat(p.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 });
                  return (
                    <div
                      key={p.id}
                      className="group bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
                    >
                      <div className="relative aspect-square overflow-hidden bg-gray-100">
                        <img
                          src={p.primary_image || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=800'}
                          alt={p.title}
                          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider text-dark shadow-sm">
                          {p.category_name || 'Artisan'}
                        </div>
                      </div>

                      <div className="p-5 flex flex-col flex-1 justify-between">
                        <div>
                          <p className="text-[11px] font-medium text-accent uppercase tracking-wider truncate">
                            {p.brand_name || p.vendor_display_name || 'Atelier'}
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
        </section>

        {/* Special Banner */}
        <section className="relative overflow-hidden py-20 bg-dark text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative z-10 bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl p-8 sm:p-14 border border-gray-700 shadow-2xl flex flex-col lg:flex-row items-center justify-between">
              <div className="max-w-xl mb-8 lg:mb-0">
                <span className="text-xs font-semibold text-accent uppercase tracking-widest">White-Glove Delivery</span>
                <h2 className="text-3xl sm:text-4xl font-serif font-bold mt-2">
                  Complimentary Insured Courier on All Flagship Orders
                </h2>
                <p className="mt-3 text-sm text-gray-300 font-light leading-relaxed">
                  Every acquisition is dispatched directly from verified vendor vaults in tamper-proof reinforced packaging, accompanied by certificates of authenticity.
                </p>
              </div>
              <div>
                <button
                  onClick={() => onNavigate?.('shop')}
                  className="bg-accent hover:bg-accent-hover text-white rounded-full py-3.5 px-8 text-sm font-semibold transition-all transform hover:scale-105 shadow-lg shadow-accent/20"
                >
                  Shop Flagship Collection &rarr;
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* New Arrivals Section */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-12">
              <div>
                <span className="text-xs font-semibold text-accent uppercase tracking-widest">Fresh Acquisitions</span>
                <h2 className="text-3xl font-serif font-bold text-dark mt-1">Latest From The Vault</h2>
              </div>
              <button
                onClick={() => onNavigate?.('shop')}
                className="text-xs font-semibold text-accent hover:underline flex items-center space-x-1"
              >
                <span>View Full Catalog</span>
                <span>&rarr;</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {newArrivals.map((p) => {
                const isAdding = addingId === p.id;
                const price = parseFloat(p.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 });
                return (
                  <div
                    key={p.id}
                    className="group bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
                  >
                    <div className="relative aspect-square overflow-hidden bg-gray-100">
                      <img
                        src={p.primary_image || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=800'}
                        alt={p.title}
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      <div className="absolute top-3 left-3 bg-dark/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider">
                        New
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-1 justify-between">
                      <div>
                        <p className="text-[11px] font-medium text-accent uppercase tracking-wider truncate">
                          {p.brand_name || p.vendor_display_name || 'Atelier'}
                        </p>
                        <h3 className="text-sm font-serif font-bold text-dark mt-1 line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                          {p.title}
                        </h3>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-baseline justify-between mb-3">
                          <span className="text-lg font-serif font-bold text-dark">${price}</span>
                          <span className="text-[11px] text-gray-500 font-medium">Vault Ready</span>
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
          </div>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
