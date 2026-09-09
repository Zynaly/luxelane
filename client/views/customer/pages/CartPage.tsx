import React, { useState, useEffect, useCallback } from 'react';
import API, { Cart, CartItem, Coupon, CartValidationResult, RateQuote } from '../../../services/api';
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

        {/* Modal: Checkout Bridge (Preparing for Sprint 10) */}
        {checkoutModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 border border-stone-200">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mb-4">
                <Icon name="check" className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-bold text-stone-900 mb-2">
                Bag Verified & Locked for Checkout
              </h3>
              <p className="text-stone-600 text-sm mb-4 leading-relaxed">
                Your luxury bag items and pricing of{' '}
                <strong className="text-stone-900 font-mono">${dynamicGrandTotal}</strong> have been
                validated against live atelier inventory, delivery logistics, and price protection rules.
              </p>
              <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 mb-6 text-xs text-stone-600 space-y-1.5">
                <div className="flex justify-between">
                  <span>Session / Cart ID:</span>
                  <span className="font-mono">{cart?.id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pieces Selected:</span>
                  <span>{breakdown?.item_count} items</span>
                </div>
                <div className="flex justify-between">
                  <span>Selected Courier:</span>
                  <span className="font-semibold">{selectedShippingQuote ? `${selectedShippingQuote.carrier_name} (${selectedShippingQuote.service_level})` : 'Standard Delivery'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rate Quote ID:</span>
                  <span className="font-mono text-[11px]">{selectedShippingQuote?.quote_id || 'RQ-PENDING'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Applied Promotion:</span>
                  <span>{cart?.applied_coupon_code || 'None'}</span>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="flex-1 py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartPage;
