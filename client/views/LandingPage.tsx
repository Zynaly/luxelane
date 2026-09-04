import React from 'react';
import { Icon } from '../components/Icon';

interface LandingPageProps {
  onGetStarted: (options?: { mode?: 'login' | 'signup'; role?: 'customer' | 'vendor' }) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navigation Bar */}
      <header className="bg-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center">
              <span className="text-3xl font-serif font-bold text-dark">LuxeLane</span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => onGetStarted({ mode: 'signup', role: 'vendor' })}
                className="hidden sm:inline-flex items-center px-4 py-2 border border-gray-300 rounded-full text-xs font-semibold text-gray-700 hover:text-dark hover:border-gray-400 transition-colors"
              >
                Sell with Us
              </button>
              <button
                onClick={() => onGetStarted({ mode: 'login' })}
                className="bg-dark text-white px-6 py-2 rounded-full font-medium hover:bg-gray-800 transition-colors text-sm"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-gray-50 to-gray-100 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl lg:text-6xl font-serif font-bold text-dark leading-tight">
                  Elevate Your<br />
                  <span className="text-accent">Lifestyle</span>
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed">
                  Discover curated collections of premium products designed for the modern connoisseur.
                  Quality, elegance, and sophistication in every piece.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => onGetStarted({ mode: 'signup' })}
                  className="bg-accent text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-accent-hover transition-all transform hover:scale-105 shadow-lg"
                >
                  Get Started
                </button>
                <button
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-white text-dark border-2 border-dark px-8 py-4 rounded-full text-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Learn More
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-8 pt-8 border-t border-gray-200">
                <div>
                  <div className="text-3xl font-bold text-accent">50K+</div>
                  <div className="text-sm text-gray-600 mt-1">Happy Customers</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-accent">10K+</div>
                  <div className="text-sm text-gray-600 mt-1">Premium Products</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-accent">4.9/5</div>
                  <div className="text-sm text-gray-600 mt-1">Customer Rating</div>
                </div>
              </div>
            </div>

            {/* Right Content - Image */}
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl transform hover:scale-105 transition-transform duration-300">
                <img
                  src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop"
                  alt="Luxury Shopping"
                  className="w-full h-[500px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
              </div>
              {/* Floating Badge */}
              <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-xl shadow-xl">
                <div className="flex items-center space-x-3">
                  <div className="bg-accent p-3 rounded-full">
                    <Icon name="check" className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Free Shipping</div>
                    <div className="font-bold text-dark">Orders Over $50</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-bold text-dark mb-4">Why Choose LuxeLane?</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Experience shopping redefined with premium quality and exceptional service
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-accent p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                <Icon name="star" className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-dark mb-4">Premium Quality</h3>
              <p className="text-gray-600 leading-relaxed">
                Every product is carefully curated and vetted for exceptional quality and craftsmanship.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-accent p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                <Icon name="truck" className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-dark mb-4">Fast Delivery</h3>
              <p className="text-gray-600 leading-relaxed">
                Get your orders delivered quickly with our reliable shipping partners worldwide.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="bg-accent p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                <Icon name="shield" className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-dark mb-4">Secure Shopping</h3>
              <p className="text-gray-600 leading-relaxed">
                Shop with confidence knowing your data and transactions are fully protected.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Preview Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-bold text-dark mb-4">Shop By Category</h2>
            <p className="text-xl text-gray-600">Explore our carefully curated collections</p>
          </div>

          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { name: 'Electronics', icon: 'laptop' },
              { name: 'Fashion', icon: 'heart' },
              { name: 'Home & Living', icon: 'home' },
              { name: 'Books', icon: 'book' },
              { name: 'Sports', icon: 'star' },
              { name: 'Beauty', icon: 'sparkles' },
            ].map((category) => (
              <div
                key={category.name}
                className="bg-white p-6 rounded-xl text-center hover:shadow-lg transition-all transform hover:-translate-y-1 cursor-pointer"
              >
                <div className="bg-accent/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <Icon name={category.icon as any} className="w-8 h-8 text-accent" />
                </div>
                <h3 className="font-semibold text-dark">{category.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-dark text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-serif font-bold mb-6">
            Ready to Experience Luxury?
          </h2>
          <p className="text-xl text-gray-300 mb-8 leading-relaxed">
            Join thousands of satisfied customers who have elevated their lifestyle with LuxeLane.
            Start your journey today.
          </p>
          <button
            onClick={onGetStarted}
            className="bg-accent text-white px-12 py-4 rounded-full text-lg font-semibold hover:bg-accent-hover transition-all transform hover:scale-105 shadow-lg"
          >
            Create Your Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <span className="text-3xl font-serif font-bold">LuxeLane</span>
              <p className="text-gray-400 mt-4 max-w-md">
                Crafting timeless pieces for the modern lifestyle. Your destination for premium products and exceptional service.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">FAQs</a></li>
                <li>
                  <button
                    onClick={() => onGetStarted({ mode: 'signup', role: 'vendor' })}
                    className="hover:text-white transition-colors text-accent font-medium"
                  >
                    Sell with Us (Vendor Partner) →
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Returns</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>&copy; 2024 LuxeLane, Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
