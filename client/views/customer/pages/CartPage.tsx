import React, { useState, useEffect, useCallback } from 'react';
import API, { Cart, CartItem, Coupon, CartValidationResult, RateQuote, Order } from '../../../services/api';
import { Icon } from '../../../components/Icon';

interface CartPageProps {
  onNavigate?: (page: 'home' | 'shop' | 'about' | 'contact' | 'cart' | 'account') => void;
  onCartChange?: (itemCount: number) => void;
}

export const CartPage: React.FC<CartPageProps> = ({ onNavigate, onCartChange }) => {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponFeedback, setCouponFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [publicCoupons, setPublicCoupons] = useState<Coupon[]>([]);
  const [validationResult, setValidationResult] = useState<CartValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);

  // Sprint 9: Shipping Quotes state
  const [shippingRates, setShippingRates] = useState<RateQuote[]>([]);
  const [selectedShippingQuote, setSelectedShippingQuote] = useState<RateQuote | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [destCountry, setDestCountry] = useState('US');
  const [destPostalCode, setDestPostalCode] = useState('10001');

  // Sprint 10: Checkout & Order Placement State
  const [checkoutStep, setCheckoutStep] = useState<'form' | 'processing' | 'confirmed'>('form');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<any | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({
    name: '',
    email: '',
    phone: '',
    line1: '740 Park Avenue',
    line2: 'Suite 12B',
    city: 'New York',
    state: 'NY',
    postal_code: '10021',
    country: 'US',
    payment_method: 'card',
  });

  const fetchCart = useCallback(async () => {
    try {
      setLoading(true);
      const data = await API.Cart.get();
      setCart(data);
      onCartChange?.(data.price_breakdown?.item_count || data.items?.length || 0);
    } catch (err: any) {
      console.error('Failed to load cart:', err);
    } finally {
      setLoading(false);
    }
  }, [onCartChange]);

  const fetchCoupons = useCallback(async () => {
    try {
      const coupons = await API.Coupon.list();
      setPublicCoupons(coupons.filter(c => c.is_active));
    } catch (err) {
      console.warn('Could not fetch public coupons:', err);
    }
  }, []);

  const fetchShippingRates = useCallback(async (cartId?: string, country?: string, zip?: string) => {
    try {
      setShippingLoading(true);
      const quotes = await API.Shipping.getCheckoutRates({
        cart_id: cartId,
        country: country || destCountry,
        postal_code: zip || destPostalCode,
      });
      setShippingRates(quotes);
      if (quotes.length > 0 && !selectedShippingQuote) {
        // Select lowest or standard by default
        setSelectedShippingQuote(quotes[0]);
      }
    } catch (err) {
      console.warn('Failed to fetch shipping rates:', err);
    } finally {
      setShippingLoading(false);
    }
  }, [destCountry, destPostalCode, selectedShippingQuote]);

  const runValidation = useCallback(async () => {
    try {
      setValidating(true);
      const res = await API.Cart.validate();
      setValidationResult(res);
    } catch (err) {
      console.error('Cart validation failed:', err);
    } finally {
      setValidating(false);
    }
  }, []);

  useEffect(() => {
    fetchCart();
    fetchCoupons();
  }, [fetchCart, fetchCoupons]);

  useEffect(() => {
    if (cart && cart.items && cart.items.length > 0) {
      runValidation();
      fetchShippingRates(cart.id);
    } else {
      setValidationResult(null);
      setShippingRates([]);
      setSelectedShippingQuote(null);
    }
  }, [cart?.id, cart?.items?.length, runValidation, fetchShippingRates]);

  const handleUpdateQuantity = async (item: CartItem, newQty: number) => {
    if (newQty < 1) return;
    try {
      setActionLoading(`qty-${item.id}`);
      await API.Cart.updateItem(item.id, newQty);
      await fetchCart();
    } catch (err: any) {
      alert(err.message || 'Failed to update quantity');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      setActionLoading(`del-${itemId}`);
      await API.Cart.removeItem(itemId);
      await fetchCart();
    } catch (err: any) {
      alert(err.message || 'Failed to remove item');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApplyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply || couponCode).trim().toUpperCase();
    if (!code) return;
    setCouponFeedback(null);
    try {
      setActionLoading('coupon');
      const updatedCart = await API.Cart.applyCoupon(code);
      setCart(updatedCart);
      setCouponCode('');
      setCouponFeedback({
        type: 'success',
        message: `Promotion code "${code}" applied successfully! You saved $${updatedCart.price_breakdown.discount_total}`,
      });
      onCartChange?.(updatedCart.price_breakdown?.item_count || 0);
    } catch (err: any) {
      setCouponFeedback({
        type: 'error',
        message: err.message || 'Invalid or expired promotional code.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveCoupon = async () => {
    setCouponFeedback(null);
    try {
      setActionLoading('coupon');
      const updatedCart = await API.Cart.removeCoupon();
      setCart(updatedCart);
      setCouponFeedback({
        type: 'success',
        message: 'Promotional code removed.',
      });
      onCartChange?.(updatedCart.price_breakdown?.item_count || 0);
    } catch (err: any) {
      setCouponFeedback({
        type: 'error',
        message: err.message || 'Failed to remove promotional code.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    // Attempt to prefill user info if authenticated
    try {
      const token = API.Token.getToken();
      if (token) {
        API.Profile.getProfile().then((p: any) => {
          if (p?.email) {
            setCheckoutForm((prev) => ({
              ...prev,
              email: p.email || '',
              name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
              phone: p.phone || '',
            }));
          }
        }).catch(() => {});
      }
    } catch {
      // Guest fallback
    }
  }, []);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart || !selectedShippingQuote) {
      setOrderError('A delivery courier quote must be selected.');
      return;
    }
    if (!checkoutForm.email) {
      setOrderError('Email address is required for order confirmation and tracking.');
      return;
    }
    if (!checkoutForm.line1 || !checkoutForm.city || !checkoutForm.postal_code) {
      setOrderError('Please provide a complete shipping street address.');
      return;
    }

    setOrderError(null);
    setCheckoutStep('processing');

    try {
      const idempotencyKey = `lux-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const res = await API.Order.placeOrder({
        cart_id: cart.id,
        rate_quote_id: selectedShippingQuote.quote_id,
        shipping_address_data: {
          line1: checkoutForm.line1,
          line2: checkoutForm.line2,
          city: checkoutForm.city,
          state: checkoutForm.state,
          postal_code: checkoutForm.postal_code,
          country: checkoutForm.country,
        },
        guest_email: checkoutForm.email,
        guest_phone: checkoutForm.phone,
        payment_method: checkoutForm.payment_method,
        idempotency_key: idempotencyKey,
      });

      setPlacedOrder(res);
      setCheckoutStep('confirmed');
      onCartChange?.(0);
      fetchCart();
    } catch (err: any) {
      console.error('Order orchestration error:', err);
      let msg = 'Failed to process order. Please try again.';
      if (typeof err === 'object') {
        msg = err.error || err.cart || err.rate_quote_id || err.guest_email || err.message || JSON.stringify(err);
      }
      setOrderError(msg);
      setCheckoutStep('form');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-amber-600 rounded-full animate-spin" />
        <p className="text-gray-500 font-serif italic text-lg">Curating your luxury bag...</p>
      </div>
    );
  }

  const items = cart?.items || [];
  const breakdown = cart?.price_breakdown;
  const hasIssues = validationResult && !validationResult.is_valid && validationResult.issues.length > 0;

  // Dynamic shipping calculation
  const effectiveShipping = selectedShippingQuote
    ? parseFloat(selectedShippingQuote.amount)
    : parseFloat(breakdown?.shipping_total || '0');

  const subtotal = parseFloat(breakdown?.subtotal || '0');
  const discount = parseFloat(breakdown?.discount_total || '0');
  const tax = parseFloat(breakdown?.tax_total || '0');
  const dynamicGrandTotal = (subtotal - discount + effectiveShipping + tax).toFixed(2);

  return (
    <div className="bg-stone-50 min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header & Breadcrumb */}
        <div className="mb-8">
          <nav className="text-xs text-stone-500 mb-2 font-medium tracking-wider uppercase">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onNavigate?.('home');
              }}
              className="hover:text-stone-900 transition-colors"
            >
              Home
            </a>{' '}
            / <span className="text-stone-900">Shopping Bag</span>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 tracking-tight">
              Your Shopping Bag
            </h1>
            <span className="text-stone-500 text-sm mt-1 sm:mt-0 font-medium">
              {breakdown?.item_count || items.length} {items.length === 1 ? 'exceptional piece' : 'exceptional pieces'}
            </span>
          </div>
        </div>

        {/* Validation Issues Banner (Stale Price or Stock Deficit) */}
        {hasIssues && (
          <div className="mb-8 rounded-xl bg-amber-50 border border-amber-300/80 p-4 sm:p-5 shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0 text-amber-600 mt-0.5 mr-3">
                <Icon name="x" className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-900">
                  Important notice regarding your bag
                </h3>
                <div className="mt-2 text-xs sm:text-sm text-amber-800 space-y-1">
                  {validationResult?.issues.map((issue, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 border-b border-amber-200/60 last:border-0">
                      <span>
                        <strong className="font-semibold">{issue.product_title}</strong>: {issue.message}
                      </span>
                      {issue.old_price && issue.new_price && (
                        <span className="ml-2 font-mono text-xs bg-amber-200/80 px-2 py-0.5 rounded">
                          ${issue.old_price} → ${issue.new_price}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <button
                    onClick={runValidation}
                    disabled={validating}
                    className="text-xs font-semibold uppercase tracking-wider text-amber-900 hover:text-amber-700 underline"
                  >
                    {validating ? 'Re-verifying inventory...' : 'Re-verify bag items'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          /* Empty Bag State */
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 p-12 text-center max-w-2xl mx-auto my-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-6">
              <Icon name="cart" className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-stone-900 mb-2">
              Your bag is currently empty
            </h2>
            <p className="text-stone-500 text-sm max-w-md mx-auto mb-8 leading-relaxed">
              Indulge in our bespoke collection of haute horlogerie, artisanal leather goods, and refined luxury essentials.
            </p>
            <button
              onClick={() => onNavigate?.('shop')}
              className="inline-flex items-center justify-center px-8 py-3.5 border border-transparent rounded-full shadow-md text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 transition-all transform hover:-translate-y-0.5"
            >
              Explore the Collection
            </button>
          </div>
        ) : (
          /* Two Column Layout: Cart Items + Order Summary */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Cart Items List */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 divide-y divide-stone-100 overflow-hidden">
                <div className="px-6 py-4 bg-stone-50/50 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-stone-500">
                  <span>Product & Specifications</span>
                  <span>Line Total</span>
                </div>

                {items.map((item) => {
                  const isUpdating = actionLoading === `qty-${item.id}` || actionLoading === `del-${item.id}`;
                  const priceMismatch = item.current_price && item.price_snapshot !== item.current_price;

                  return (
                    <div
                      key={item.id}
                      className={`p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 transition-opacity ${
                        isUpdating ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {/* Product details */}
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="w-20 h-20 rounded-xl bg-stone-100 border border-stone-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-stone-400">
                          <Icon name="package" className="w-8 h-8" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-serif font-semibold text-stone-900 truncate">
                            {item.product_title || 'Luxury Atelier Item'}
                          </h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs text-stone-500 font-mono bg-stone-100 px-2 py-0.5 rounded">
                              SKU: {item.variant_sku}
                            </span>
                            {priceMismatch && (
                              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                Price Updated
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-stone-600 font-medium">
                            ${parseFloat(item.price_snapshot).toFixed(2)} each
                          </div>
                        </div>
                      </div>

                      {/* Quantity & Controls */}
                      <div className="flex items-center justify-between sm:justify-end sm:space-x-8">
                        <div className="flex items-center border border-stone-200 rounded-full bg-stone-50 p-1">
                          <button
                            onClick={() => handleUpdateQuantity(item, item.quantity - 1)}
                            disabled={item.quantity <= 1 || !!actionLoading}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-30 transition-colors"
                            title="Decrease quantity"
                          >
                            <Icon name="minus" className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs font-semibold text-stone-900 font-mono">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(item, item.quantity + 1)}
                            disabled={!!actionLoading}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-stone-600 hover:bg-white hover:text-stone-900 transition-colors"
                            title="Increase quantity"
                          >
                            <Icon name="plus" className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Line Subtotal */}
                        <div className="text-right min-w-[5rem]">
                          <div className="text-base font-semibold text-stone-900 font-mono">
                            ${parseFloat(item.line_subtotal).toFixed(2)}
                          </div>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={!!actionLoading}
                            className="text-xs text-stone-400 hover:text-red-600 mt-1 inline-flex items-center space-x-1 transition-colors"
                            title="Remove from bag"
                          >
                            <Icon name="trash" className="w-3 h-3 mr-0.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sprint 9: Real-time Carrier Rates & Logistics Options */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 pb-3 border-b border-stone-100">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-800">
                      <Icon name="truck" className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-serif font-bold text-stone-900">
                      Delivery & Carrier Rates
                    </h3>
                  </div>
                  {/* Destination Quick Selector */}
                  <div className="flex items-center space-x-2 mt-2 sm:mt-0 text-xs">
                    <select
                      value={destCountry}
                      onChange={(e) => {
                        setDestCountry(e.target.value);
                        fetchShippingRates(cart?.id, e.target.value, destPostalCode);
                      }}
                      className="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg font-medium text-stone-700"
                    >
                      <option value="US">United States (Domestic)</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                      <option value="FR">France</option>
                      <option value="AE">United Arab Emirates</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Postal Code"
                      value={destPostalCode}
                      onChange={(e) => setDestPostalCode(e.target.value)}
                      onBlur={() => fetchShippingRates(cart?.id, destCountry, destPostalCode)}
                      className="w-24 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 font-mono text-center"
                    />
                  </div>
                </div>

                {shippingLoading ? (
                  <div className="py-6 text-center text-xs text-stone-500 font-serif italic">
                    Querying logistics carriers and smart rate cards...
                  </div>
                ) : shippingRates.length === 0 ? (
                  <div className="py-4 text-xs text-stone-500 text-center">
                    Enter your postal code to view live courier rate options.
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {shippingRates.map((quote) => {
                      const isSelected = selectedShippingQuote?.quote_id === quote.quote_id;
                      return (
                        <div
                          key={quote.quote_id}
                          onClick={() => setSelectedShippingQuote(quote)}
                          className={`cursor-pointer p-4 rounded-xl border transition-all flex items-start justify-between ${
                            isSelected
                              ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                              : 'bg-stone-50/70 text-stone-800 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold uppercase tracking-wide">
                                {quote.service_level.replace('_', ' ')}
                              </span>
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              )}
                            </div>
                            <p className={`text-[11px] mt-1 ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                              {quote.carrier_name} · Est. {quote.estimated_days} business days
                            </p>
                          </div>
                          <span className={`font-mono text-sm font-bold ${isSelected ? 'text-white' : 'text-stone-900'}`}>
                            ${parseFloat(quote.amount).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Curated Promotion Offers */}
              {publicCoupons.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 p-5">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="text-amber-600 text-sm font-semibold uppercase tracking-wider">
                      ★ Available Atelier Offers
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {publicCoupons.map((coupon) => {
                      const isApplied = cart?.applied_coupon_code === coupon.code;
                      return (
                        <div
                          key={coupon.id}
                          className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                            isApplied
                              ? 'bg-amber-50/60 border-amber-300 shadow-sm'
                              : 'bg-stone-50/60 border-stone-200/80 hover:border-stone-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-stone-900 text-sm tracking-wide">
                                {coupon.code}
                              </span>
                              <span className="text-[11px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                                {coupon.discount_type === 'PERCENTAGE'
                                  ? `${parseFloat(coupon.discount_value)}% OFF`
                                  : `$${parseFloat(coupon.discount_value)} OFF`}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 mt-1">
                              {parseFloat(coupon.min_cart_value) > 0
                                ? `Orders over $${parseFloat(coupon.min_cart_value).toFixed(0)}`
                                : 'No minimum spend'}
                            </p>
                          </div>
                          <button
                            onClick={() => (isApplied ? handleRemoveCoupon() : handleApplyCoupon(coupon.code))}
                            disabled={!!actionLoading}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                              isApplied
                                ? 'bg-amber-200 text-amber-900 hover:bg-amber-300'
                                : 'bg-stone-900 text-white hover:bg-stone-800'
                            }`}
                          >
                            {isApplied ? 'Applied ✓' : 'Apply'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bespoke Benefits Assurance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-white rounded-xl border border-stone-200/60 flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-700 flex-shrink-0">
                    <Icon name="truck" className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900">Complimentary Courier</h4>
                    <p className="text-[11px] text-stone-500">Insured express delivery</p>
                  </div>
                </div>
                <div className="p-4 bg-white rounded-xl border border-stone-200/60 flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-700 flex-shrink-0">
                    <Icon name="check" className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900">100% Authenticity</h4>
                    <p className="text-[11px] text-stone-500">Verified master ateliers</p>
                  </div>
                </div>
                <div className="p-4 bg-white rounded-xl border border-stone-200/60 flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-700 flex-shrink-0">
                    <Icon name="history" className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900">Bespoke Returns</h4>
                    <p className="text-[11px] text-stone-500">30-day effortless returns</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Order Summary & Checkout */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 p-6 sm:p-7">
                <h2 className="text-lg font-serif font-bold text-stone-900 mb-5 border-b border-stone-100 pb-4">
                  Summary of Order
                </h2>

                {/* Promotional Code Input */}
                <div className="mb-6">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-2">
                    Promo or Voucher Code
                  </label>
                  {cart?.applied_coupon_code ? (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="font-mono font-bold text-xs text-amber-900">
                          {cart.applied_coupon_code}
                        </span>
                        <span className="text-xs text-amber-700">(-${breakdown?.discount_total})</span>
                      </div>
                      <button
                        onClick={handleRemoveCoupon}
                        disabled={actionLoading === 'coupon'}
                        className="text-xs text-amber-800 hover:text-amber-950 font-semibold underline"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="e.g. LUXE10"
                        className="flex-1 px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs uppercase font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
                      />
                      <button
                        onClick={() => handleApplyCoupon()}
                        disabled={!couponCode.trim() || actionLoading === 'coupon'}
                        className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-semibold rounded-xl uppercase tracking-wider transition-colors"
                      >
                        {actionLoading === 'coupon' ? '...' : 'Apply'}
                      </button>
                    </div>
                  )}

                  {couponFeedback && (
                    <div
                      className={`mt-2 text-xs p-2.5 rounded-lg ${
                        couponFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {couponFeedback.message}
                    </div>
                  )}
                </div>

                {/* Price Breakdown */}
                <div className="space-y-3 text-sm text-stone-600 border-t border-stone-100 pt-5">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono font-medium text-stone-900">
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span className="flex items-center">
                        <span>Discount</span>
                        {cart?.applied_coupon_code && (
                          <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">
                            {cart.applied_coupon_code}
                          </span>
                        )}
                      </span>
                      <span className="font-mono">-${discount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>
                      Delivery Courier
                      {selectedShippingQuote && (
                        <span className="block text-[11px] text-stone-400">
                          {selectedShippingQuote.carrier_name} ({selectedShippingQuote.service_level})
                        </span>
                      )}
                    </span>
                    <span className="font-mono font-medium text-stone-900">
                      ${effectiveShipping.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Estimated Sales Tax{' '}
                      {breakdown?.tax_rate_pct && parseFloat(breakdown.tax_rate_pct) > 0 && (
                        <span className="text-xs text-stone-400">({breakdown.tax_rate_pct}%)</span>
                      )}
                    </span>
                    <span className="font-mono font-medium text-stone-900">
                      ${tax.toFixed(2)}
                    </span>
                  </div>

                  {/* Grand Total */}
                  <div className="border-t border-stone-200 pt-4 mt-4 flex justify-between items-baseline">
                    <span className="text-base font-serif font-bold text-stone-900">Grand Total</span>
                    <div className="text-right">
                      <span className="text-2xl font-serif font-bold text-stone-900 font-mono">
                        ${dynamicGrandTotal}
                      </span>
                      <p className="text-[11px] text-stone-400 uppercase tracking-wider mt-0.5">
                        {breakdown?.currency || 'USD'} · Taxes & delivery included
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pre-checkout Validation Status Pill */}
                <div className="mt-6 pt-5 border-t border-stone-100">
                  <div className="flex items-center justify-between text-xs mb-4">
                    <span className="text-stone-500">Atelier Real-time Inventory Check:</span>
                    {validating ? (
                      <span className="text-stone-400 italic">Verifying...</span>
                    ) : hasIssues ? (
                      <span className="text-amber-700 font-semibold flex items-center">
                        <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
                        Attention Required
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold flex items-center">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                        Verified & Ready
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setCheckoutModalOpen(true)}
                    disabled={hasIssues || items.length === 0}
                    className="w-full py-4 px-6 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-sm font-semibold uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
                  >
                    <span>Proceed to Checkout</span>
                    <Icon name="chevron-down" className="w-4 h-4 transform -rotate-90" />
                  </button>

                  <p className="text-center text-[11px] text-stone-400 mt-3">
                    Complimentary insured delivery & white-glove packaging.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Sprint 10 Checkout & Order Orchestration */}
        {checkoutModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 border border-stone-200 relative my-8">
              {/* Close Button */}
              {checkoutStep !== 'processing' && (
                <button
                  onClick={() => {
                    setCheckoutModalOpen(false);
                    if (checkoutStep === 'confirmed') {
                      setCheckoutStep('form');
                      setPlacedOrder(null);
                    }
                  }}
                  className="absolute top-5 right-5 text-stone-400 hover:text-stone-700 transition-colors"
                >
                  <Icon name="x" className="w-6 h-6" />
                </button>
              )}

              {/* State 1: Confirmed State */}
              {checkoutStep === 'confirmed' && placedOrder && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
                    <Icon name="check" className="w-8 h-8" />
                  </div>
                  <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full uppercase tracking-wider mb-2">
                    Payment Authorized & Order Confirmed
                  </span>
                  <h3 className="text-2xl font-serif font-bold text-stone-900 mb-2">
                    Thank You for Your Patronage
                  </h3>
                  <p className="text-stone-600 text-sm mb-6 max-w-md mx-auto">
                    Your luxury order has been locked and placed with our partner ateliers. A formal confirmation and receipt have been dispatched to <strong className="text-stone-900">{checkoutForm.email}</strong>.
                  </p>

                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 mb-6 text-left text-xs text-stone-600 space-y-2.5">
                    <div className="flex justify-between items-center pb-2 border-b border-stone-200">
                      <span className="font-medium text-stone-500">Order Reference</span>
                      <span className="font-mono font-bold text-stone-900 text-sm">{placedOrder.order_number}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-500">Invoice Number</span>
                      <span className="font-mono text-stone-800">{placedOrder.invoice_number || 'INV-GENERATED'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-500">Total Billed</span>
                      <span className="font-mono font-bold text-stone-900 text-sm">${placedOrder.grand_total} {placedOrder.currency}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-500">Delivery Courier</span>
                      <span className="text-stone-800 font-medium">{selectedShippingQuote ? `${selectedShippingQuote.carrier_name} (${selectedShippingQuote.service_level})` : 'Standard Logistics'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-500">Delivery Address</span>
                      <span className="text-stone-800 text-right">{checkoutForm.line1}, {checkoutForm.city}, {checkoutForm.state} {checkoutForm.postal_code}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-500">Atelier Packages</span>
                      <span className="text-stone-800 font-semibold">{placedOrder.vendor_orders_count || 1} vendor package(s)</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => {
                        setCheckoutModalOpen(false);
                        setCheckoutStep('form');
                        setPlacedOrder(null);
                        onNavigate?.('shop');
                      }}
                      className="flex-1 py-3 px-6 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all shadow"
                    >
                      Continue Shopping
                    </button>
                    <button
                      onClick={() => {
                        setCheckoutModalOpen(false);
                        onNavigate?.('account');
                      }}
                      className="flex-1 py-3 px-6 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all border border-stone-300"
                    >
                      View in My Account
                    </button>
                  </div>
                </div>
              )}

              {/* State 2: Processing State */}
              {checkoutStep === 'processing' && (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 border-4 border-amber-200 border-t-amber-700 rounded-full animate-spin mx-auto" />
                  <h3 className="text-xl font-serif font-bold text-stone-900">
                    Authorizing Checkout & Reserving Atelier Pieces
                  </h3>
                  <p className="text-stone-500 text-xs max-w-sm mx-auto leading-relaxed">
                    Executing atomic hold on atelier inventory, locking live shipping rate quotes, and issuing platform invoices...
                  </p>
                </div>
              )}

              {/* State 3: Checkout Form */}
              {checkoutStep === 'form' && (
                <div>
                  <div className="mb-6">
                    <span className="text-xs font-mono uppercase tracking-widest text-amber-700 font-semibold">Sprint 10 Orchestration</span>
                    <h3 className="text-2xl font-serif font-bold text-stone-900 mt-1">
                      White-Glove Atelier Checkout
                    </h3>
                    <p className="text-stone-500 text-xs mt-1">
                      Complete your delivery coordinates and authorize payment to reserve your curated pieces.
                    </p>
                  </div>

                  {orderError && (
                    <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span>{orderError}</span>
                    </div>
                  )}

                  <form onSubmit={handlePlaceOrder} className="space-y-5">
                    {/* Contact details */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-800 mb-2.5">
                        1. Client Contact Information
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-stone-500 mb-1">Email Address (for order receipts) *</label>
                          <input
                            type="email"
                            required
                            value={checkoutForm.email}
                            onChange={(e) => setCheckoutForm({ ...checkoutForm, email: e.target.value })}
                            placeholder="patron@luxelane.com"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-stone-500 mb-1">Contact Phone</label>
                          <input
                            type="tel"
                            value={checkoutForm.phone}
                            onChange={(e) => setCheckoutForm({ ...checkoutForm, phone: e.target.value })}
                            placeholder="+1 (555) 019-2831"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Delivery Address */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-800 mb-2.5">
                        2. Destination Coordinates
                      </h4>
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] text-stone-500 mb-1">Street Address *</label>
                            <input
                              type="text"
                              required
                              value={checkoutForm.line1}
                              onChange={(e) => setCheckoutForm({ ...checkoutForm, line1: e.target.value })}
                              placeholder="740 Park Avenue"
                              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-stone-500 mb-1">Apt / Suite</label>
                            <input
                              type="text"
                              value={checkoutForm.line2}
                              onChange={(e) => setCheckoutForm({ ...checkoutForm, line2: e.target.value })}
                              placeholder="Penthouse B"
                              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] text-stone-500 mb-1">City *</label>
                            <input
                              type="text"
                              required
                              value={checkoutForm.city}
                              onChange={(e) => setCheckoutForm({ ...checkoutForm, city: e.target.value })}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-stone-500 mb-1">State / Province</label>
                            <input
                              type="text"
                              value={checkoutForm.state}
                              onChange={(e) => setCheckoutForm({ ...checkoutForm, state: e.target.value })}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-stone-500 mb-1">Postal / ZIP Code *</label>
                            <input
                              type="text"
                              required
                              value={checkoutForm.postal_code}
                              onChange={(e) => setCheckoutForm({ ...checkoutForm, postal_code: e.target.value })}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delivery Quote Selector */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-800 mb-2">
                        3. Selected Delivery Courier
                      </h4>
                      {shippingRates.length > 0 ? (
                        <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                          {shippingRates.map((q) => (
                            <label
                              key={q.quote_id}
                              className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                                selectedShippingQuote?.quote_id === q.quote_id
                                  ? 'border-stone-900 bg-stone-50 font-medium'
                                  : 'border-stone-200 hover:border-stone-300'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5">
                                <input
                                  type="radio"
                                  name="shippingQuoteRadio"
                                  checked={selectedShippingQuote?.quote_id === q.quote_id}
                                  onChange={() => setSelectedShippingQuote(q)}
                                  className="text-stone-900 focus:ring-stone-900"
                                />
                                <div>
                                  <span className="font-semibold text-stone-900">{q.carrier_name}</span>
                                  <span className="text-stone-500 ml-1.5 font-normal">({q.service_level})</span>
                                  <span className="block text-[10px] text-stone-400 font-mono">{q.quote_id} · ~{q.estimated_days} business days</span>
                                </div>
                              </div>
                              <span className="font-mono font-bold text-stone-900">${parseFloat(q.amount).toFixed(2)}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-stone-500 italic">No real-time quotes found; please verify address.</p>
                      )}
                    </div>

                    {/* Payment Authorization Simulation */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-800 mb-2">
                        4. Payment Method
                      </h4>
                      <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-6 rounded bg-stone-900 text-amber-300 flex items-center justify-center text-[9px] font-mono font-bold tracking-wider">
                            LUXE
                          </div>
                          <div>
                            <span className="font-semibold text-stone-900">FakeGateway Simulation (Instant Settle)</span>
                            <span className="block text-[10px] text-stone-500">•••• •••• •••• 4242 · Exp 12/28</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-semibold uppercase">
                          Sandbox Active
                        </span>
                      </div>
                    </div>

                    {/* Order Total & Submit */}
                    <div className="pt-3 border-t border-stone-200">
                      <div className="flex justify-between items-baseline mb-4">
                        <span className="text-sm font-semibold text-stone-900">Grand Total Due</span>
                        <div className="text-right">
                          <span className="text-xl font-serif font-bold text-stone-900 font-mono">
                            ${dynamicGrandTotal}
                          </span>
                          <span className="text-[10px] text-stone-400 block">Taxes, shipping, and packaging included</span>
                        </div>
                      </div>

                      <div className="flex space-x-3">
                        <button
                          type="button"
                          onClick={() => setCheckoutModalOpen(false)}
                          className="flex-1 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!selectedShippingQuote || items.length === 0}
                          className="flex-[2] py-3 px-6 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all shadow-md flex items-center justify-center space-x-2"
                        >
                          <span>Authorize & Place Order (${dynamicGrandTotal})</span>
                          <Icon name="check" className="w-4 h-4 text-emerald-400" />
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartPage;
