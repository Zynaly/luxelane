import React from 'react';
import { Icon } from '../../components/Icon';
import { mockOrders, mockProducts, mockCustomers } from '../../data/mockData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; change: string; changeType: 'increase' | 'decrease' }> = ({ title, value, icon, change, changeType }) => (
  <div className="bg-white p-6 rounded-lg shadow-md flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <div className="flex items-center text-sm mt-1">
        <span className={`flex items-center ${changeType === 'increase' ? 'text-green-500' : 'text-red-500'}`}>
          {changeType === 'increase' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )}
          {change}
        </span>
        <span className="text-gray-500 ml-1">vs last month</span>
      </div>
    </div>
    <div className="bg-blue-100 text-primary p-3 rounded-full">
      {icon}
    </div>
  </div>
);

const salesData = [
    { name: 'Jan', sales: 4000 },
    { name: 'Feb', sales: 3000 },
    { name: 'Mar', sales: 5000 },
    { name: 'Apr', sales: 4500 },
    { name: 'May', sales: 6000 },
    { name: 'Jun', sales: 5500 },
];

const AdminDashboard: React.FC = () => {
    const totalSales = mockOrders.reduce((acc, order) => acc + order.total, 0);
    const newOrders = mockOrders.filter(o => o.status === 'Processing').length;
    
    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Sales" value={`$${(totalSales / 1000).toFixed(1)}k`} icon={<Icon name="orders" className="w-6 h-6" />} change="12.5%" changeType="increase" />
                <StatCard title="New Orders" value={newOrders.toString()} icon={<Icon name="package" className="w-6 h-6" />} change="5.2%" changeType="increase" />
                <StatCard title="Total Customers" value={mockCustomers.length.toString()} icon={<Icon name="customers" className="w-6 h-6" />} change="2.1%" changeType="increase" />
                <StatCard title="Products" value={mockProducts.length.toString()} icon={<Icon name="products" className="w-6 h-6" />} change="1.0%" changeType="decrease" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Sales Overview</h2>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <LineChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="sales" stroke="#1a56db" strokeWidth={2} activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Best Selling Products</h2>
                     <ul className="space-y-4">
                        {mockProducts.slice(0, 5).map(product => (
                            <li key={product.id} className="flex items-center space-x-4">
                                <img src={product.imageUrl} alt={product.name} className="w-12 h-12 rounded-md object-cover"/>
                                <div>
                                    <p className="font-semibold text-gray-800">{product.name}</p>
                                    <p className="text-sm text-gray-500">${product.price.toFixed(2)}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Recent Orders Table */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">Recent Orders</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {mockOrders.slice(0, 5).map((order) => (
                                <tr key={order.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.customerName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.date}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${order.total.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${order.status === 'Delivered' ? 'bg-green-100 text-green-800' : order.status === 'Processing' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
