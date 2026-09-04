import React, { useState, useEffect } from 'react';
import API, { VendorProfile, VendorPolicyData } from '../../../services/api';
import { Icon } from '../../../components/Icon';

interface VendorStorefrontPageProps {
  slug: string;
  onBack: () => void;
}

export const VendorStorefrontPage: React.FC<VendorStorefrontPageProps> = ({ slug, onBack }) => {
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStorefront = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await API.Vendor.getStorefront(slug);
        setVendor(data);
      } catch (err: any) {
        setError(err.message || 'Storefront not found or merchant is not yet approved.');
      } finally {
        setLoading(false);
      }
    };

    fetchStorefront();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-300 border-t-accent mb-4" />
          <p className="text-sm text-gray-500">Curating merchant boutique...</p>
        </div>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <Icon name="order" className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-serif font-bold text-dark mb-2">Boutique Not Available</h2>
        <p className="text-sm text-gray-600 max-w-md mb-6">{error}</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-dark text-white rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          ← Return to Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Banner */}
      <div className="relative h-64 sm:h-80 w-full bg-gradient-to-r from-gray-900 to-gray-800 overflow-hidden">
        {vendor.banner_url ? (
          <img
            src={vendor.banner_url}
            alt={vendor.display_name}
            className="w-full h-full object-cover opacity-70"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20">
            <span className="text-7xl font-serif font-bold text-white tracking-widest uppercase">
              {vendor.display_name}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Back button */}
        <div className="absolute top-6 left-6 z-10">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-semibold rounded-full transition-colors"
          >
            <span>← Back to Marketplace</span>
          </button>
        </div>

        {/* Brand identity floating over banner */}
        <div className="absolute bottom-6 left-6 right-6 max-w-7xl mx-auto flex items-end justify-between">
          <div className="flex items-end space-x-5">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white border-4 border-white shadow-xl overflow-hidden flex items-center justify-center flex-shrink-0">
              {vendor.logo_url ? (
                <img
                  src={vendor.logo_url}
                  alt={vendor.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl font-serif font-bold text-dark">
                  {vendor.display_name.charAt(0)}
                </span>
              )}
            </div>

            <div className="text-white pb-1">
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl sm:text-3xl font-serif font-bold">{vendor.display_name}</h1>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-xs px-2.5 py-0.5 rounded-full font-medium backdrop-blur-sm">
                  Verified Partner
                </span>
              </div>
              <div className="flex items-center space-x-4 text-xs text-gray-300 mt-1">
                <span>★ {vendor.rating_avg || '0.0'} ({vendor.total_ratings || 0} customer reviews)</span>
                {vendor.support_email && <span>· Concierge: {vendor.support_email}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Story & Offerings */}
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
              <h2 className="text-xl font-serif font-bold text-dark mb-4">About the Maison</h2>
              <p className="text-gray-700 leading-relaxed text-sm whitespace-pre-line">
                {vendor.description ||
                  `${vendor.display_name} is a certified artisan boutique partner on the LuxeLane Luxury Marketplace, delivering timeless craftsmanship and exceptional customer dedication.`}
              </p>
            </section>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-serif font-bold text-dark">Curated Collection</h2>
                <span className="text-xs text-gray-500 font-medium">Coming in Sprint 4 (Catalog)</span>
              </div>
              <div className="border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-500">
                <Icon name="package" className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-semibold text-gray-700">Catalog Moderation in Progress</p>
                <p className="text-xs text-gray-400 mt-1">
                  Products for this merchant will appear following catalog approval.
                </p>
              </div>
            </section>
          </div>

          {/* Sidebar & Concierge */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
              <h3 className="font-serif font-bold text-dark text-base">Boutique Concierge</h3>
              <div className="space-y-3 text-xs text-gray-600">
                {vendor.support_email && (
                  <div>
                    <span className="font-semibold text-gray-800 block">Email Support</span>
                    <a href={`mailto:${vendor.support_email}`} className="text-accent hover:underline">
                      {vendor.support_email}
                    </a>
                  </div>
                )}
                {vendor.support_phone && (
                  <div>
                    <span className="font-semibold text-gray-800 block">Telephone Inquiry</span>
                    <span className="text-gray-800">{vendor.support_phone}</span>
                  </div>
                )}
                <div>
                  <span className="font-semibold text-gray-800 block">LuxeLane Guarantee</span>
                  <span>All purchases covered by our Authenticity and Escrow Protection.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorStorefrontPage;
