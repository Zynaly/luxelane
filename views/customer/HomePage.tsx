import React from 'react';
import { Product, Category } from '../../types';
import { mockCategories, mockProducts } from '../../data/mockData';
import { Icon } from '../../components/Icon';

const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  return (
    <div className="group relative bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden transition-shadow duration-300">
      <div className="w-full aspect-w-1 aspect-h-1 bg-gray-200 overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-center object-cover transition-transform duration-500 ease-in-out group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button className="bg-white text-dark py-2 px-4 rounded-full font-semibold text-sm transform group-hover:translate-y-0 translate-y-4 transition-transform duration-300">
            Add to Cart
          </button>
        </div>
      </div>
      <div className="p-4 text-center">
        <h3 className="text-base font-medium text-gray-800">
            <a href="#">
                <span aria-hidden="true" className="absolute inset-0" />
                {product.name}
            </a>
        </h3>
        <p className="mt-2 text-lg font-bold text-dark">${product.price.toFixed(2)}</p>
        <div className="mt-2 flex items-center justify-center">
          {[...Array(5)].map((_, i) => (
            <Icon key={i} name="star" className={`w-4 h-4 ${i < Math.round(product.rating) ? 'text-accent' : 'text-gray-300'}`} />
          ))}
          <span className="ml-2 text-xs text-gray-500">{product.reviewCount} reviews</span>
        </div>
      </div>
    </div>
  );
};

const HomePage: React.FC<{ onNavigate: (page: 'shop') => void }> = ({ onNavigate }) => {
  const featuredProducts = mockProducts.slice(0, 4);
  const newArrivals = mockProducts.slice(4, 8);

  return (
    <div className="bg-white">
      <main>
        {/* Hero Section */}
        <div className="relative bg-dark">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
            <img
              src="https://picsum.photos/seed/hero/1920/1080"
              alt="Hero banner"
              className="w-full h-full object-center object-cover"
            />
          </div>
          <div aria-hidden="true" className="absolute inset-0 bg-dark opacity-60" />
          <div className="relative max-w-3xl mx-auto py-32 px-6 flex flex-col items-center text-center sm:py-48 lg:px-0">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-white lg:text-6xl">Elegance in Every Detail</h1>
            <p className="mt-4 text-xl text-gray-300">
              Discover our new collection, crafted with passion and precision for the modern connoisseur.
            </p>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); onNavigate('shop'); }}
              className="mt-8 inline-block bg-accent border border-transparent rounded-full py-3 px-12 text-base font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              Explore Collection
            </a>
          </div>
        </div>

        {/* Category Section */}
        <section aria-labelledby="category-heading" className="py-16 sm:py-24 xl:max-w-7xl xl:mx-auto xl:px-8">
          <div className="px-4 sm:px-6 sm:flex sm:items-center sm:justify-between lg:px-8 xl:px-0">
            <h2 id="category-heading" className="text-3xl font-serif font-bold tracking-tight text-dark">
              Shop by Category
            </h2>
            <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('shop'); }} className="hidden text-sm font-semibold text-primary hover:text-primary-hover sm:block">
              Browse all categories<span aria-hidden="true"> &rarr;</span>
            </a>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6 lg:gap-8 px-4 sm:px-0">
              {mockCategories.map((category) => (
                <a
                  key={category.name}
                  href="#"
                  onClick={(e) => { e.preventDefault(); onNavigate('shop'); }}
                  className="group relative h-48 md:h-64 rounded-lg flex flex-col justify-end overflow-hidden"
                >
                  <span aria-hidden="true" className="absolute inset-0">
                    <img src={category.imageUrl} alt="" className="w-full h-full object-center object-cover transition-transform duration-300 group-hover:scale-110" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-gray-800 opacity-80"
                  />
                  <span className="relative p-4 text-center text-lg font-semibold text-white">{category.name}</span>
                </a>
              ))}
          </div>
        </section>

        {/* Featured Products Section */}
        <section aria-labelledby="featured-products-heading" className="bg-secondary py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 id="featured-products-heading" className="text-4xl font-serif font-bold tracking-tight text-dark">
                Featured Products
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
                Our top picks, loved by customers like you for their exceptional quality and style.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 xl:gap-x-8">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>

        {/* Special Offers Section */}
        <section className="relative overflow-hidden my-16 sm:my-24">
            <div className="max-w-7xl mx-auto">
              <div className="relative z-10 bg-white p-12 lg:p-20 shadow-xl rounded-lg lg:flex lg:items-center lg:justify-between">
                <div className="lg:w-1/2">
                    <h2 className="text-4xl font-serif font-bold tracking-tight text-dark">
                        Limited Time Offer
                    </h2>
                    <p className="mt-4 text-lg text-gray-600">
                        Don't miss our seasonal sale event. Get your favorites with up to 50% off.
                    </p>
                </div>
                 <div className="mt-8 lg:mt-0 lg:w-1/2 lg:text-right">
                    <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); onNavigate('shop'); }}
                        className="inline-block bg-accent border border-transparent rounded-full py-3 px-12 text-base font-semibold text-white hover:bg-accent-hover transition-colors"
                    >
                        Shop the Sale
                    </a>
                </div>
              </div>
            </div>
        </section>

        {/* New Arrivals Section */}
        <section aria-labelledby="new-arrivals-heading" className="bg-secondary py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 id="new-arrivals-heading" className="text-4xl font-serif font-bold tracking-tight text-dark">
                New Arrivals
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
                Fresh out of the box. Check out the latest additions to our curated collection.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 xl:gap-x-8">
              {newArrivals.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
