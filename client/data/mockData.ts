
import { Product, Category, User, Order, Warehouse, Review, OrderStatus } from '../types';

export const mockCategories: Category[] = [
  { id: 'electronics', name: 'Electronics', imageUrl: 'https://picsum.photos/seed/electronics/300/200' },
  { id: 'fashion', name: 'Fashion', imageUrl: 'https://picsum.photos/seed/fashion/300/200' },
  { id: 'home', name: 'Home Appliances', imageUrl: 'https://picsum.photos/seed/home/300/200' },
  { id: 'books', name: 'Books', imageUrl: 'https://picsum.photos/seed/books/300/200' },
  { id: 'sports', name: 'Sports', imageUrl: 'https://picsum.photos/seed/sports/300/200' },
  { id: 'toys', name: 'Toys & Games', imageUrl: 'https://picsum.photos/seed/toys/300/200' },
];

export const mockProducts: Product[] = [
  { id: 1, name: 'Wireless Noise-Cancelling Headphones', description: 'Immerse yourself in sound. Industry-leading noise cancellation.', price: 349.99, category: 'Electronics', imageUrl: 'https://picsum.photos/seed/product1/600/600', rating: 4.8, reviewCount: 1250, stock: 50, specifications: { Brand: 'SoundWave', Connectivity: 'Bluetooth 5.0', 'Battery Life': '30 hours' } },
  { id: 2, name: 'Smartwatch Series 7', description: 'The most advanced smartwatch with a larger, more durable display.', price: 429.00, category: 'Electronics', imageUrl: 'https://picsum.photos/seed/product2/600/600', rating: 4.9, reviewCount: 980, stock: 75, specifications: { Brand: 'TechGear', 'Display': 'OLED', 'Water Resistance': '50m' } },
  { id: 3, name: 'Classic Leather Jacket', description: 'A timeless piece for any wardrobe. Made with 100% genuine leather.', price: 299.50, category: 'Fashion', imageUrl: 'https://picsum.photos/seed/product3/600/600', rating: 4.7, reviewCount: 450, stock: 30, specifications: { Material: 'Genuine Leather', 'Lining': 'Satin', 'Closure': 'Zipper' } },
  { id: 4, name: 'Robotic Vacuum Cleaner', description: 'Keeps your floors clean with intelligent mapping and powerful suction.', price: 499.00, category: 'Home Appliances', imageUrl: 'https://picsum.photos/seed/product4/600/600', rating: 4.6, reviewCount: 820, stock: 40, specifications: { Brand: 'CleanBot', 'Runtime': '120 mins', 'App Control': 'Yes' } },
  { id: 5, name: 'The Midnight Library', description: 'A novel about all the choices that go into a life well lived.', price: 15.99, category: 'Books', imageUrl: 'https://picsum.photos/seed/product5/600/600', rating: 4.5, reviewCount: 25000, stock: 100, specifications: { Author: 'Matt Haig', 'Genre': 'Fantasy Fiction' } },
  { id: 6, name: 'Professional Yoga Mat', description: 'Extra thick and non-slip for a comfortable and stable practice.', price: 45.00, category: 'Sports', imageUrl: 'https://picsum.photos/seed/product6/600/600', rating: 4.8, reviewCount: 1500, stock: 200, specifications: { Material: 'TPE', 'Thickness': '6mm' } },
  { id: 7, name: '4K Action Camera', description: 'Capture your adventures in stunning 4K detail. Waterproof and durable.', price: 199.99, category: 'Electronics', imageUrl: 'https://picsum.photos/seed/product7/600/600', rating: 4.7, reviewCount: 760, stock: 60, specifications: { Resolution: '4K 60fps', 'Waterproof': 'Up to 30m' } },
  { id: 8, name: 'Modern Espresso Machine', description: 'Brew barista-quality espresso at home with this sleek machine.', price: 699.00, category: 'Home Appliances', imageUrl: 'https://picsum.photos/seed/product8/600/600', rating: 4.9, reviewCount: 320, stock: 25, specifications: { Brand: 'BrewMaster', 'Pressure': '15 Bar', 'Milk Frother': 'Included' } },
];

export const mockUser: User = {
  id: 101,
  name: 'Jane Doe',
  email: 'jane.doe@example.com',
  role: 'customer',
  profilePictureUrl: 'https://picsum.photos/seed/user101/200/200',
  addresses: [
    { id: 1, street: '123 Main St', city: 'Anytown', state: 'CA', zip: '12345', isDefault: true },
    { id: 2, street: '456 Oak Ave', city: 'Someville', state: 'NY', zip: '67890', isDefault: false },
  ],
  paymentMethods: [
    { id: 1, type: 'Credit Card', last4: '1234', isDefault: true },
    { id: 2, type: 'JazzCash', last4: '5678', isDefault: false },
  ],
};

export const mockAdminUser: User = {
  id: 1,
  name: 'Admin User',
  email: 'admin@luxelane.com',
  role: 'admin',
  profilePictureUrl: 'https://picsum.photos/seed/admin/200/200',
  addresses: [],
  paymentMethods: [],
};

const orderStatuses: OrderStatus[] = ['Processing', 'Shipped', 'In Transit', 'Delivered', 'Cancelled'];

export const mockOrders: Order[] = Array.from({ length: 15 }, (_, i) => ({
  id: `LL-100${i + 1}`,
  date: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  customerName: ['John Smith', 'Emily White', 'David Green', 'Sarah Black'][i % 4],
  total: parseFloat((Math.random() * 500 + 50).toFixed(2)),
  status: orderStatuses[i % orderStatuses.length],
  items: [
    { product: mockProducts[i % mockProducts.length], quantity: 1 },
    ...(i % 3 === 0 ? [{ product: mockProducts[(i + 1) % mockProducts.length], quantity: Math.floor(Math.random() * 2) + 1 }] : []),
  ],
  shippingAddress: mockUser.addresses[0],
  trackingNumber: i % 5 !== 4 ? `1Z${Math.random().toString().slice(2, 18).toUpperCase()}` : undefined,
}));

export const mockCustomers: User[] = Array.from({ length: 10 }, (_, i) => ({
  id: 200 + i,
  name: `Customer ${i + 1}`,
  email: `customer${i+1}@example.com`,
  role: 'customer',
  profilePictureUrl: `https://picsum.photos/seed/customer${i}/200/200`,
  addresses: [mockUser.addresses[0]],
  paymentMethods: [],
}));

export const mockWarehouses: Warehouse[] = [
    { id: 1, name: 'Main Warehouse', location: 'Los Angeles, CA', stock: mockProducts.map(p => ({ productId: p.id, quantity: p.stock })) },
    { id: 2, name: 'East Coast Hub', location: 'New York, NY', stock: mockProducts.map(p => ({ productId: p.id, quantity: Math.floor(p.stock * 0.5) })) },
];

export const mockReviews: Review[] = [
    { id: 1, author: 'Alex Johnson', rating: 5, text: 'Absolutely fantastic headphones! The noise cancellation is top-notch and they are so comfortable.', date: '2023-10-15', authorImageUrl: 'https://picsum.photos/seed/reviewer1/100/100' },
    { id: 2, author: 'Maria Garcia', rating: 4, text: 'Great product, sound quality is amazing. Just wish the battery lasted a bit longer.', date: '2023-10-12', authorImageUrl: 'https://picsum.photos/seed/reviewer2/100/100' },
    { id: 3, author: 'Chen Wei', rating: 5, text: 'Best purchase I\'ve made all year. Worth every penny for the quality.', date: '2023-10-10', authorImageUrl: 'https://picsum.photos/seed/reviewer3/100/100' },
];
