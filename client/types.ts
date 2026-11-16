
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  stock: number;
  specifications: { [key: string]: string };
}

export interface Category {
  id: string;
  name: string;
  imageUrl: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'customer' | 'admin' | 'vendor';
  profilePictureUrl: string;
  addresses: Address[];
  paymentMethods: PaymentMethod[];
}

export interface Address {
  id: number;
  street: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: number;
  type: 'Credit Card' | 'JazzCash' | 'EasyPaisa';
  last4: string;
  isDefault: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'Processing' | 'Shipped' | 'In Transit' | 'Delivered' | 'Cancelled';

export interface Order {
  id: string;
  date: string;
  customerName: string;
  total: number;
  status: OrderStatus;
  items: CartItem[];
  shippingAddress: Address;
  trackingNumber?: string;
}

export interface Warehouse {
  id: number;
  name: string;
  location: string;
  stock: { productId: number; quantity: number }[];
}

export interface Review {
  id: number;
  author: string;
  rating: number;
  text: string;
  date: string;
  authorImageUrl: string;
}
