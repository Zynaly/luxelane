import React, { useState } from 'react';
import { Product, Category } from '../../../types';
import { mockCategories, mockProducts } from '../../../data/mockData';
import { Icon } from '../../../components/Icon';

const ProductCard: React.FC<{ product: Product }> = ({ product }) => (
  <div className="group relative bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden transition-shadow duration-300 hover:shadow-lg">
    <div className="w-full aspect-w-1 aspect-h-1 bg-gray-200 overflow-hidden">
      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-center object-cover transition-transform duration-500 ease-in-out group-hover:scale-105" />
      <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button className="bg-white text-dark py-2 px-4 rounded-full font-semibold text-sm transform group-hover:translate-y-0 translate-y-4 transition-transform duration-300">
          Add to Cart
        </button>
      </div>
    </div>
    <div className="p-4 text-center">
      <h3 className="text-base font-medium text-gray-800"><a href="#"><span aria-hidden="true" className="absolute inset-0" />{product.name}</a></h3>
      <p className="mt-2 text-lg font-bold text-dark">${product.price.toFixed(2)}</p>
    </div>
  </div>
);

const ShopPage: React.FC = () => {
  const [filters, setFilters] = useState({
    category: 'all',
    price: 1000,
    rating: 0,
  });

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, price: Number(e.target.value) }));
  };

  const filteredProducts = mockProducts.filter(p => {
    const categoryMatch = filters.category === 'all' || p.category === filters.category;
    const priceMatch = p.price <= filters.price;
    const ratingMatch = p.rating >= filters.rating;
    return categoryMatch && priceMatch && ratingMatch;
  });

  return (
    <div className="bg-white">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative z-10 flex items-baseline justify-between pt-16 pb-6 border-b border-gray-200">
          <h1 className="text-4xl font-serif font-bold tracking-tight text-gray-900">New Arrivals</h1>
          {/* Add sorting dropdown here if needed */}
        </div>

        <section aria-labelledby="products-heading" className="pt-6 pb-24">
          <h2 id="products-heading" className="sr-only">Products</h2>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-x-8 gap-y-10">
            {/* Filters */}
            <form className="hidden lg:block">
              <h3 className="sr-only">Categories</h3>
              <ul role="list" className="text-sm font-medium text-gray-900 space-y-4 pb-6 border-b border-gray-200">
                {mockCategories.map((category) => (
                  <li key={category.name}>
                    <a href="#" onClick={() => setFilters(prev => ({ ...prev, category: category.name }))} className={filters.category === category.name ? 'text-primary' : 'text-gray-600 hover:text-gray-800'}>{category.name}</a>
                  </li>
                ))}
              </ul>

              {/* Price Filter */}
              <div className="border-b border-gray-200 py-6">
                <h3 className="-my-3 flow-root">
                  <span className="font-medium text-gray-900">Price</span>
                </h3>
                <div className="pt-6">
                  <label htmlFor="price-range" className="sr-only">Price</label>
                  <input type="range" id="price-range" min="0" max="1000" value={filters.price} onChange={handlePriceChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                  <div className="flex justify-between text-sm text-gray-600 mt-2">
                    <span>$0</span>
                    <span>${filters.price}</span>
                  </div>
                </div>
              </div>

              {/* Rating Filter */}
              <div className="py-6">
                <h3 className="-my-3 flow-root">
                  <span className="font-medium text-gray-900">Rating</span>
                </h3>
                <div className="pt-6 flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map(rate => (
                     <button type="button" key={rate} onClick={() => setFilters(prev => ({...prev, rating: rate}))}>
                        <Icon name="star" className={`w-6 h-6 ${rate <= filters.rating ? 'text-accent' : 'text-gray-300'}`} />
                     </button>
                  ))}
                </div>
              </div>

            </form>

            {/* Product grid */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
               {/* Pagination */}
              <nav className="mt-12 flex items-center justify-between border-t border-gray-200 px-4 sm:px-0">
                  <div className="flex-1 flex justify-between sm:justify-end items-center pt-4">
                      <a href="#" className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Previous</a>
                      <a href="#" className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Next</a>
                  </div>
              </nav>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ShopPage;
