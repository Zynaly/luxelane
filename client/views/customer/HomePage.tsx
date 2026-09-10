import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import API, { ProductListItem, CategoryItem } from '../../services/api';

interface HomePageProps {
  onNavigate: (page: 'home' | 'shop' | 'about' | 'contact' | 'cart' | 'account') => void;
  onCartChange?: (itemCount: number) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onCartChange }) => {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      API.Product.list(),
      API.Category.list(),
    ])
      .then(([prods, cats]) => {
        if (active) {
          setProducts(prods);
          setCategories(cats);
        }
      })
      .catch((err) => console.error('Failed to load home catalog:', err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleAddToCart = async (product: ProductListItem) => {
    try {
      setAddingId(product.id);
      let variantId = product.primary_variant_id;
      if (!variantId) {
        const detail = await API.Product.retrieve(product.id);
        if (detail.variants && detail.variants.length > 0) {
          variantId = detail.variants[0].id;
        }
      }
      if (!variantId) throw new Error('No available stock variant.');
      await API.Cart.addItem({ variant_id: variantId, quantity: 1 });
      const summary = await API.Cart.getSummary();
      onCartChange?.(summary.item_count || 0);
      setToastMsg(`Added "${product.title}" to bag`);
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Could not add to bag');
    } finally {
      setAddingId(null);
    }
  };

  const featuredProducts = products.slice(0, 4);
  const newArrivals = products.slice(4, 12);

  // Key curated categories
  const heroCategories = [
    {
      slug: 'clothes',
      name: 'Clothes & Couture',
      subtitle: 'Italian Silk & Cashmere',
      image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=800',
    },
    {
      slug: 'shoes',
      name: 'Luxury Footwear',
      subtitle: 'Artisanal Box Calf & Pumps',
      image: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&q=80&w=800',
    },
    {
      slug: 'cosmetics',
      name: 'Cosmetics & Perfumes',
      subtitle: 'Botanical Elixirs & Extraits',
      image: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&q=80&w=800',
    },
    {
      slug: 'aesthetic-gifts',
      name: 'Aesthetic Gifts & Living',
      subtitle: 'Hand-poured Bougies & Crystal',
      image: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&q=80&w=800',
    },
  ];

  return (
    <div className="bg-white">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center space-x-3 border border-amber-800 animate-bounce">
          <Icon name="check" className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMsg}</span>
          <button onClick={() => onNavigate('cart')} className="text-amber-300 text-xs underline font-bold">
            Checkout
          </button>
        </div>
      )}

      <main>
        {/* Hero Banner */}
        <div className="relative bg-stone-950 text-white overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0 opacity-40">
            <img
              src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1920"
              alt="Hero banner"
              className="w-full h-full object-center object-cover"
            />
          </div>
          <div className="relative max-w-4xl mx-auto py-28 px-6 flex flex-col items-center text-center sm:py-36">
            <span className="text-amber-400 text-xs uppercase tracking-[0.25em] font-semibold mb-4">
              LuxeLane Haute Marketplace
            </span>
            <h1 className="text-4xl sm:text-6xl font-serif font-bold tracking-tight text-white leading-tight">
              Elegance in Every Detail
            </h1>
            <p className="mt-4 text-lg text-stone-300 max-w-2xl font-light">
              Explore bespoke collections from master European maisons. Pure vicuña tailoring, handcrafted footwear, rare Grasse extraits, and aesthetic living gifts.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 justify-center">
              <button
                type="button"
                onClick={() => onNavigate('shop')}
                className="bg-amber-800 hover:bg-amber-900 border border-transparent rounded-full py-3 px-10 text-sm font-semibold text-white transition-colors shadow-lg"
              >
                Shop Full Catalog ({products.length} Items)
              </button>
              <button
                type="button"
                onClick={() => onNavigate('cart')}
                className="bg-white/10 hover:bg-white/20 backdrop-blur border border-white/30 rounded-full py-3 px-8 text-sm font-semibold text-white transition-colors"
              >
                View Shopping Bag
              </button>
            </div>
          </div>
        </div>

        {/* Shop by Focus Categories */}
        <section className="py-16 sm:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
                Handcrafted Collections
              </span>
              <h2 className="text-3xl font-serif font-bold text-stone-900">
                Shop by Curated Category
              </h2>
            </div>
            <button
              onClick={() => onNavigate('shop')}
              className="text-sm font-semibold text-amber-800 hover:text-stone-900 flex items-center space-x-1"
            >
              <span>Explore All</span>
              <Icon name="arrow-right" className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {heroCategories.map((c) => (
              <div
                key={c.slug}
                onClick={() => onNavigate('shop')}
                className="group relative h-80 rounded-2xl overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-all duration-300"
              >
                <img
                  src={c.image}
                  alt={c.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/30 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <span className="text-amber-300 text-[11px] font-semibold uppercase tracking-wider block mb-1">
                    {c.subtitle}
                  </span>
                  <h3 className="text-xl font-serif font-bold text-white group-hover:text-amber-200 transition-colors">
                    {c.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Featured Products Showcase */}
        <section className="bg-stone-50 py-16 sm:py-24 border-y border-stone-200/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-widest block mb-1">
                Atelier Masterpieces
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900">
                Featured Highlights
              </h2>
              <p className="mt-2 text-stone-600 text-sm">
                Each piece certified authentic and backed by white-glove insured delivery.
              </p>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl h-80 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {featuredProducts.map((product) => {
                  const isAdding = addingId === product.id;
                  return (
                    <div
                      key={product.id}
                      className="group bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300"
                    >
                      <div className="relative aspect-[4/5] bg-stone-100 overflow-hidden">
                        <img
                          src={product.primary_image || 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&q=80&w=600'}
                          alt={product.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        />
                        <div className="absolute top-3 left-3">
                          <span className="bg-white/95 backdrop-blur text-stone-900 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
                            {product.category_name}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          {product.brand_name && (
                            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider mb-1">
                              {product.brand_name}
                            </p>
                          )}
                          <h3 className="text-sm font-serif font-bold text-stone-900 group-hover:text-amber-900 transition-colors line-clamp-2">
                            {product.title}
                          </h3>
                        </div>

                        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                          <span className="text-base font-bold text-stone-900">
                            ${parseFloat(product.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddToCart(product)}
                            disabled={isAdding}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-stone-900 hover:bg-amber-900 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            <Icon name="cart" className="w-3.5 h-3.5" />
                            <span>{isAdding ? '...' : 'Add'}</span>
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

        {/* New Arrivals Grid */}
        <section className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <div>
              <span className="text-xs font-bold text-amber-800 uppercase tracking-widest block mb-1">
                Seasonal Drop
              </span>
              <h2 className="text-3xl font-serif font-bold text-stone-900">
                New Arrivals: Clothes, Shoes, Fragrance & Living
              </h2>
            </div>
            <button
              onClick={() => onNavigate('shop')}
              className="text-sm font-semibold text-amber-800 hover:text-stone-900 flex items-center space-x-1"
            >
              <span>View All {products.length} Products</span>
              <Icon name="arrow-right" className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {newArrivals.map((product) => {
              const isAdding = addingId === product.id;
              return (
                <div
                  key={product.id}
                  className="group bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden flex flex-col hover:shadow-lg transition-all"
                >
                  <div className="relative aspect-[4/5] bg-stone-100 overflow-hidden">
                    <img
                      src={product.primary_image || 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&q=80&w=600'}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute top-3 left-3">
                      <span className="bg-stone-900/80 text-white text-[10px] font-medium px-2 py-0.5 rounded-md">
                        {product.vendor_display_name}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      {product.brand_name && (
                        <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider mb-0.5">
                          {product.brand_name}
                        </p>
                      )}
                      <h3 className="text-xs font-serif font-bold text-stone-900 line-clamp-1">
                        {product.title}
                      </h3>
                    </div>

                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
                      <span className="text-sm font-bold text-stone-900">
                        ${parseFloat(product.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        disabled={isAdding}
                        className="px-2.5 py-1 bg-stone-900 hover:bg-amber-900 text-white text-[11px] font-medium rounded-md transition-colors"
                      >
                        {isAdding ? '...' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
