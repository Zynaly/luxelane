import React from 'react';
import { mockWarehouses, mockProducts } from '../../../data/mockData';
import { Icon } from '../../../components/Icon';

const WarehouseManagementPage: React.FC = () => {

    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Warehouse Management</h1>
                <button className="flex items-center bg-primary text-white py-2 px-4 rounded-lg shadow-md hover:bg-primary-hover">
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Add New Warehouse
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mockWarehouses.map(warehouse => {
                    const totalUnits = warehouse.stock.reduce((acc, item) => acc + item.quantity, 0);
                    const distinctProducts = warehouse.stock.length;

                    return (
                        <div key={warehouse.id} className="bg-white p-6 rounded-lg shadow-md">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800">{warehouse.name}</h2>
                                    <p className="text-sm text-gray-500">{warehouse.location}</p>
                                </div>
                                <Icon name="warehouse" className="w-8 h-8 text-gray-300" />
                            </div>
                            <div className="mt-6 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Total Units:</span>
                                    <span className="font-semibold text-gray-900">{totalUnits.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Distinct Products:</span>
                                    <span className="font-semibold text-gray-900">{distinctProducts}</span>
                                </div>
                            </div>
                            <div className="mt-6">
                                <h3 className="text-sm font-medium text-gray-700 mb-2">Stock Levels (Top 5)</h3>
                                <ul className="space-y-2">
                                    {warehouse.stock.slice(0, 5).map(stockItem => {
                                        const product = mockProducts.find(p => p.id === stockItem.productId);
                                        return (
                                            <li key={stockItem.productId} className="flex justify-between items-center text-xs">
                                                <span className="text-gray-600 truncate pr-2">{product?.name}</span>
                                                <span className={`font-medium px-2 py-0.5 rounded-full ${stockItem.quantity < 50 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                    {stockItem.quantity} units
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                            <div className="mt-6 border-t pt-4">
                                <button className="w-full text-center text-sm font-semibold text-primary hover:text-primary-hover">Manage Inventory</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WarehouseManagementPage;
