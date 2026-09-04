import React from 'react';
import { mockCustomers, mockOrders } from '../../../data/mockData';
import { User } from '../../../types';

const CustomerManagementPage: React.FC = () => {
    
    // Augment customer data with order info for demonstration
    const customersWithData = mockCustomers.map(customer => {
        const customerOrders = mockOrders.filter(o => o.customerName.includes(customer.name.split(' ')[1]));
        const totalSpent = customerOrders.reduce((acc, order) => acc + order.total, 0);
        return {
            ...customer,
            orderCount: customerOrders.length,
            totalSpent: totalSpent,
            joinDate: new Date(Date.now() - (customer.id-200) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Mock join date
        };
    });

    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Customer Management</h1>
                 <div className="w-full max-w-xs">
                    <input type="search" placeholder="Search customers..." className="block w-full bg-white py-2 px-4 border border-gray-300 rounded-lg" />
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Join Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orders</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Spent</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {customersWithData.map(customer => (
                                <tr key={customer.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <img className="h-10 w-10 rounded-full object-cover" src={customer.profilePictureUrl} alt={customer.name} />
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.joinDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{customer.orderCount}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${customer.totalSpent.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CustomerManagementPage;
