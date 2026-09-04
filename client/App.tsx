import React, { useState, useEffect } from 'react';
import { Icon } from './components/Icon';
import LandingPage from './views/LandingPage';
import HomePage from './views/customer/HomePage';
import ShopPage from './views/customer/pages/ShopPage';
import AboutUsPage from './views/customer/pages/AboutUsPage';
import ContactPage from './views/customer/pages/ContactPage';
import LoginPage from './views/auth/LoginPage';
import AccountPage from './views/customer/pages/AccountPage';

import AdminDashboard from './views/admin/AdminDashboard';
import ProductManagementPage from './views/admin/pages/ProductManagementPage';
import OrderManagementPage from './views/admin/pages/OrderManagementPage';
import CustomerManagementPage from './views/admin/pages/CustomerManagementPage';
import WarehouseManagementPage from './views/admin/pages/WarehouseManagementPage';

import { User } from './types';
import { mockUser, mockAdminUser } from './data/mockData';
import API, { TokenService } from './services/api';

// Placeholder Customer Pages for routes not fully built out
const CartPagePlaceholder: React.FC = () => <div className="p-8 text-center text-2xl font-serif">Shopping Cart Page</div>;

type CustomerPage = 'home' | 'shop' | 'about' | 'contact' | 'cart' | 'account';
type AdminPage = 'dashboard' | 'products' | 'orders' | 'customers' | 'warehouse';

const Header: React.FC<{ onNavigate: (page: CustomerPage) => void; onLogout: () => void }> = ({ onNavigate, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const cartItemCount = 3; // Mocked value

  return (
    <header className="bg-white sticky top-0 z-40 shadow-sm">
      <div className="bg-dark text-white text-center py-2 px-4 text-sm font-medium">
        Free shipping on all orders over $50
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 border-b border-gray-200">
          <div className="flex items-center">
            <span className="text-3xl font-serif font-bold text-dark cursor-pointer" onClick={() => onNavigate('home')}>LuxeLane</span>
          </div>

          <div className="flex-1 flex justify-center px-2 lg:ml-6 lg:justify-end">
            <div className="max-w-lg w-full lg:max-w-xs">
              <label htmlFor="search" className="sr-only">Search</label>
              <div className="relative text-gray-400 focus-within:text-gray-600">
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Icon name="search" className="h-5 w-5" />
                </div>
                <input
                  id="search"
                  className="block w-full bg-white py-2 pl-10 pr-3 border border-gray-300 rounded-full leading-5 text-gray-900 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                  placeholder="Search"
                  type="search"
                  name="search"
                />
              </div>
            </div>
          </div>

          {/* Mobile menu toggle */}
          <div className="flex items-center lg:hidden">
            <button onClick={() => setMenuOpen(!menuOpen)} type="button" className="bg-white p-2 rounded-md text-gray-400">
              <Icon name={menuOpen ? 'x' : 'menu'} className="h-6 w-6" />
            </button>
          </div>

          {/* Desktop icons */}
          <div className="hidden lg:flex lg:items-center lg:space-x-4">
             <button onClick={() => onNavigate('account')} className="p-2 rounded-full text-gray-500 hover:text-dark hover:bg-gray-100 transition-colors" title="My Account" id="header-account-btn">
                <Icon name="user" className="h-6 w-6"/>
            </button>
            <button onClick={() => onNavigate('cart')} className="relative p-2 rounded-full text-gray-500 hover:text-dark hover:bg-gray-100 transition-colors" title="Cart" id="header-cart-btn">
                <Icon name="cart" className="h-6 w-6"/>
                {cartItemCount > 0 && (
                  <span className="absolute top-0 right-0 block h-4 w-4 rounded-full bg-accent text-white text-xs font-medium transform -translate-y-1/2 translate-x-1/2 ring-2 ring-white">{cartItemCount}</span>
                )}
            </button>
            <button onClick={onLogout} className="p-2 rounded-full text-gray-500 hover:text-dark hover:bg-gray-100 transition-colors" title="Sign Out" id="header-logout-btn">
                <Icon name="logout" className="h-6 w-6"/>
            </button>
          </div>
        </div>

        <nav className="hidden lg:flex lg:items-center lg:justify-center lg:space-x-8 h-12">
            <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('home'); }} className="text-gray-600 hover:text-dark text-sm font-semibold transition-colors">Home</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('shop'); }} className="text-gray-600 hover:text-dark text-sm font-semibold transition-colors">Shop</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('about'); }} className="text-gray-600 hover:text-dark text-sm font-semibold transition-colors">About Us</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('contact'); }} className="text-gray-600 hover:text-dark text-sm font-semibold transition-colors">Contact</a>
        </nav>

        {/* Mobile dropdown menu */}
        {menuOpen && (
            <div className="lg:hidden border-t border-gray-100">
                <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('home'); setMenuOpen(false); }} className="text-gray-600 hover:text-dark block px-3 py-2 rounded-md text-base font-medium">Home</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('shop'); setMenuOpen(false); }} className="text-gray-600 hover:text-dark block px-3 py-2 rounded-md text-base font-medium">Shop</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('about'); setMenuOpen(false); }} className="text-gray-600 hover:text-dark block px-3 py-2 rounded-md text-base font-medium">About</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('contact'); setMenuOpen(false); }} className="text-gray-600 hover:text-dark block px-3 py-2 rounded-md text-base font-medium">Contact</a>
                </div>
                <div className="px-2 pb-3 border-t border-gray-100 pt-2 flex items-center space-x-2 sm:px-3">
                    <button onClick={() => { onNavigate('account'); setMenuOpen(false); }} className="flex-1 flex items-center justify-center px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">
                      <Icon name="user" className="h-5 w-5 mr-2" /> My Account
                    </button>
                    <button onClick={() => { onNavigate('cart'); setMenuOpen(false); }} className="relative flex-1 flex items-center justify-center px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">
                      <Icon name="cart" className="h-5 w-5 mr-2" /> Cart
                      {cartItemCount > 0 && <span className="ml-1 bg-accent text-white text-xs rounded-full px-1.5">{cartItemCount}</span>}
                    </button>
                    <button onClick={onLogout} className="flex-1 flex items-center justify-center px-3 py-2 rounded-md text-base font-medium text-red-600 hover:bg-red-50">
                      <Icon name="logout" className="h-5 w-5 mr-2" /> Sign Out
                    </button>
                </div>
            </div>
        )}
      </div>
    </header>
  );
};

const Footer: React.FC<{ onNavigate?: (page: CustomerPage) => void }> = ({ onNavigate }) => {
  const nav = (page: CustomerPage) => (e: React.MouseEvent) => { e.preventDefault(); onNavigate?.(page); };
  return (
    <footer className="bg-dark text-white">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="xl:grid xl:grid-cols-3 xl:gap-8">
                <div className="space-y-8 xl:col-span-1">
                    <span className="text-3xl font-serif font-bold text-white cursor-pointer" onClick={nav('home')}>LuxeLane</span>
                    <p className="text-gray-400 text-base">Crafting timeless pieces for the modern lifestyle.</p>
                </div>
                <div className="mt-12 grid grid-cols-2 gap-8 xl:mt-0 xl:col-span-2">
                     <div className="md:grid md:grid-cols-2 md:gap-8">
                        <div>
                            <h3 className="text-sm font-semibold tracking-wider uppercase">Shop</h3>
                            <ul className="mt-4 space-y-2">
                                <li><a href="#" onClick={nav('shop')} className="text-base text-gray-300 hover:text-white transition-colors">New Arrivals</a></li>
                                <li><a href="#" onClick={nav('shop')} className="text-base text-gray-300 hover:text-white transition-colors">Best Sellers</a></li>
                                <li><a href="#" onClick={nav('shop')} className="text-base text-gray-300 hover:text-white transition-colors">Sale</a></li>
                            </ul>
                        </div>
                        <div className="mt-12 md:mt-0">
                            <h3 className="text-sm font-semibold tracking-wider uppercase">Support</h3>
                            <ul className="mt-4 space-y-2">
                                <li><a href="#" onClick={nav('contact')} className="text-base text-gray-300 hover:text-white transition-colors">Contact Us</a></li>
                                <li><a href="#" onClick={nav('about')} className="text-base text-gray-300 hover:text-white transition-colors">FAQs</a></li>
                                <li><a href="#" onClick={nav('about')} className="text-base text-gray-300 hover:text-white transition-colors">Shipping & Returns</a></li>
                            </ul>
                        </div>
                    </div>
                    <div className="md:grid md:grid-cols-1 md:gap-8">
                         <div>
                            <h3 className="text-sm font-semibold tracking-wider uppercase">Join our newsletter</h3>
                            <p className="text-gray-400 mt-4">Get the latest arrivals and special offers directly in your inbox.</p>
                             <form className="mt-4 sm:flex sm:max-w-md" onSubmit={(e) => e.preventDefault()}>
                                <label htmlFor="footer-email" className="sr-only">Email address</label>
                                <input type="email" name="email-address" id="footer-email" autoComplete="email" required className="appearance-none min-w-0 w-full bg-white border border-transparent rounded-md py-2 px-4 text-base text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white focus:border-white focus:placeholder-gray-400" placeholder="Enter your email" />
                                <div className="mt-3 rounded-md sm:mt-0 sm:ml-3 sm:flex-shrink-0">
                                    <button type="submit" className="w-full bg-accent border border-transparent rounded-md py-2 px-4 flex items-center justify-center text-base font-medium text-white hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-accent transition-colors">
                                        Subscribe
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-8 border-t border-gray-700 pt-8 flex items-center justify-between">
                <p className="text-base text-gray-400">&copy; {new Date().getFullYear()} LuxeLane, Inc. All rights reserved.</p>
                <div className="flex space-x-6">
                  <a href="#" onClick={nav('about')} className="text-gray-400 hover:text-white text-sm transition-colors">Privacy Policy</a>
                  <a href="#" onClick={nav('about')} className="text-gray-400 hover:text-white text-sm transition-colors">Terms of Service</a>
                </div>
            </div>
        </div>
    </footer>
  );
};

const AdminSidebar: React.FC<{ currentPage: AdminPage; onNavigate: (page: AdminPage) => void; onLogout: () => void }> = ({ currentPage, onNavigate, onLogout }) => {
    const navItemClasses = (page: AdminPage) => `flex items-center px-4 py-3 text-gray-200 hover:bg-gray-700 rounded-md transition-colors duration-200 ${currentPage === page ? 'bg-primary' : ''}`;

    return (
        <aside className="w-64 bg-gray-800 text-white flex flex-col min-h-screen">
            <div className="h-16 flex items-center justify-center text-2xl font-bold border-b border-gray-700">LuxeLane Admin</div>
            <nav className="flex-1 px-4 py-6 space-y-2">
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }} className={navItemClasses('dashboard')}><Icon name="dashboard" className="w-5 h-5 mr-3" /> Dashboard</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('products'); }} className={navItemClasses('products')}><Icon name="products" className="w-5 h-5 mr-3" /> Products</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('orders'); }} className={navItemClasses('orders')}><Icon name="orders" className="w-5 h-5 mr-3" /> Orders</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('customers'); }} className={navItemClasses('customers')}><Icon name="customers" className="w-5 h-5 mr-3" /> Customers</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('warehouse'); }} className={navItemClasses('warehouse')}><Icon name="warehouse" className="w-5 h-5 mr-3" /> Warehouse</a>
            </nav>
            <div className="p-4 border-t border-gray-700">
                <button onClick={onLogout} className="w-full flex items-center px-4 py-3 text-gray-200 hover:bg-gray-700 rounded-md transition-colors duration-200">
                    <Icon name="logout" className="w-5 h-5 mr-3" /> Logout
                </button>
            </div>
        </aside>
    );
};

const ChatbotWidget: React.FC<{isOpen: boolean, onToggle: () => void}> = ({isOpen, onToggle}) => {
    if (!isOpen) {
        return (
            <button onClick={onToggle} className="fixed bottom-6 right-6 bg-primary text-white p-4 rounded-full shadow-lg hover:bg-primary-hover transition-transform transform hover:scale-110 z-50">
                <Icon name="chat-bubble" className="w-8 h-8" />
            </button>
        );
    }
    return (
         <div className="fixed bottom-6 right-6 w-80 h-[28rem] bg-white rounded-lg shadow-2xl flex flex-col z-50">
            <header className="bg-dark text-white p-4 flex justify-between items-center rounded-t-lg">
                <h3 className="font-bold text-lg">LuxeLane Support</h3>
                <button onClick={onToggle}><Icon name="x" className="w-6 h-6" /></button>
            </header>
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
                <p className="text-sm text-gray-500">Chat support coming soon...</p>
            </div>
            <div className="p-2 border-t border-gray-200 bg-white rounded-b-lg">
                <input type="text" placeholder="Type your message..." className="w-full p-2 border rounded" />
            </div>
        </div>
    );
};

const CustomerView: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [page, setPage] = useState<CustomerPage>('home');
  const [isChatOpen, setIsChatOpen] = useState(false);

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage onNavigate={setPage} />;
      case 'shop': return <ShopPage />;
      case 'about': return <AboutUsPage />;
      case 'contact': return <ContactPage onOpenChat={() => setIsChatOpen(true)} />;
      case 'cart': return <CartPagePlaceholder />;
      case 'account': return <AccountPage onLogout={onLogout} />;
      default: return <HomePage onNavigate={setPage} />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header onNavigate={setPage} onLogout={onLogout} />
      <main className="flex-grow">{renderPage()}</main>
      <Footer onNavigate={setPage} />
      <ChatbotWidget isOpen={isChatOpen} onToggle={() => setIsChatOpen(prev => !prev)}/>
    </div>
  );
};

const AdminView: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [page, setPage] = useState<AdminPage>('dashboard');

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <AdminDashboard />;
      case 'products': return <ProductManagementPage />;
      case 'orders': return <OrderManagementPage />;
      case 'customers': return <CustomerManagementPage />;
      case 'warehouse': return <WarehouseManagementPage />;
      default: return <AdminDashboard />;
    }
  };

  return (
    <div className="flex bg-gray-100 font-sans">
      <AdminSidebar currentPage={page} onNavigate={setPage} onLogout={onLogout} />
      <main className="flex-1">{renderPage()}</main>
    </div>
  );
};

const VendorPortalPlaceholder: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center space-x-3">
          <span className="text-2xl font-serif font-bold text-dark">LuxeLane</span>
          <span className="bg-amber-100 text-amber-900 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">
            Vendor Merchant Portal
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center space-x-1 px-3.5 py-2 text-sm text-gray-700 hover:text-dark hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <Icon name="logout" className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-12 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Icon name="cart" className="w-8 h-8" />
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 mb-4">
            Application Status: Pending Review
          </span>
          <h2 className="text-3xl font-serif font-bold text-dark mb-3">
            Welcome to the LuxeLane Partner Network
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto mb-8 text-base leading-relaxed">
            Thank you for registering your luxury brand, <strong className="text-dark font-semibold">{user.name}</strong>. Your vendor application and merchant credentials have been submitted to our platform curation committee.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 text-left mb-8 max-w-2xl mx-auto">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Step 1</span>
              <span className="text-sm font-semibold text-emerald-600 flex items-center">
                ✓ Account Created
              </span>
            </div>
            <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/50">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block mb-1">Step 2 (Active)</span>
              <span className="text-sm font-semibold text-amber-900 flex items-center">
                ⏳ Curation Review
              </span>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Step 3</span>
              <span className="text-sm font-medium text-gray-400">
                Catalog & Storefront Live
              </span>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs max-w-xl mx-auto text-left leading-relaxed">
            <p className="font-semibold mb-1">Coming in Sprint 3:</p>
            <p>
              Full Vendor Portal suite with KYC document verification, bank account payout setup, staff management, and bespoke luxury storefront branding.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

type AppView = 'landing' | 'auth' | 'authenticated';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>('landing');
  const [authOptions, setAuthOptions] = useState<{ mode?: 'login' | 'signup'; role?: 'customer' | 'vendor' }>({
    mode: 'login',
    role: 'customer',
  });

  // Check saved session on mount
  useEffect(() => {
    const token = TokenService.getToken();
    const savedUser = TokenService.getUser();
    if (token && savedUser) {
      let role: 'customer' | 'admin' | 'vendor' = 'customer';
      if (savedUser.role && (savedUser.role === 'vendor_owner' || savedUser.role === 'vendor_staff' || savedUser.role.includes('warehouse'))) {
        role = 'vendor';
      } else if (savedUser.role && savedUser.role.includes('admin')) {
        role = 'admin';
      }

      setUser({
        id: 1,
        name: `${savedUser.first_name || ''} ${savedUser.last_name || ''}`.trim() || (role === 'admin' ? 'Admin' : role === 'vendor' ? 'Vendor Partner' : 'Customer'),
        email: savedUser.email || '',
        role: role,
        profilePictureUrl: savedUser.avatar_url || (role === 'admin' ? mockAdminUser.profilePictureUrl : mockUser.profilePictureUrl),
        addresses: [],
        paymentMethods: [],
      });
      setView('authenticated');
    }
  }, []);

  const handleGetStarted = (options?: { mode?: 'login' | 'signup'; role?: 'customer' | 'vendor' }) => {
    if (options && typeof options === 'object' && 'mode' in options && options.mode) {
      setAuthOptions(options);
    } else {
      setAuthOptions({ mode: 'signup', role: undefined });
    }
    setView('auth');
  };

  const handleLogin = (role: 'customer' | 'admin' | 'vendor') => {
    const savedUser = TokenService.getUser();
    if (savedUser) {
      setUser({
        id: 1,
        name: `${savedUser.first_name || ''} ${savedUser.last_name || ''}`.trim() || (role === 'admin' ? 'Admin' : role === 'vendor' ? 'Vendor Partner' : 'Customer'),
        email: savedUser.email || (role === 'admin' ? 'admin@luxelane.com' : 'user@luxelane.com'),
        role: role,
        profilePictureUrl: savedUser.avatar_url || (role === 'admin' ? mockAdminUser.profilePictureUrl : mockUser.profilePictureUrl),
        addresses: [],
        paymentMethods: [],
      });
    } else {
      setUser(role === 'admin' ? mockAdminUser : mockUser);
    }
    setView('authenticated');
  };

  const handleLogout = async () => {
    try {
      await API.Auth.logout();
    } catch {
      TokenService.removeTokens();
    }
    setUser(null);
    setView('landing');
  };

  const handleBackToLanding = () => {
    setView('landing');
  };

  useEffect(() => {
    document.body.className = user?.role === 'admin' ? 'bg-gray-100 font-sans' : 'bg-white font-sans';
  }, [user]);

  // Show Landing Page
  if (view === 'landing') {
    return <LandingPage onGetStarted={handleGetStarted} />;
  }

  // Show Auth/Login Page
  if (view === 'auth' && !user) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onBackToLanding={handleBackToLanding}
        initialMode={authOptions.mode}
        initialRole={authOptions.role}
      />
    );
  }

  // Show Authenticated Views
  if (view === 'authenticated' && user) {
    if (user.role === 'admin') {
      return <AdminView onLogout={handleLogout} />;
    }
    if (user.role === 'vendor') {
      return <VendorPortalPlaceholder user={user} onLogout={handleLogout} />;
    }
    return <CustomerView onLogout={handleLogout} />;
  }

  // Fallback to landing
  return <LandingPage onGetStarted={handleGetStarted} />;
};

export default App;
