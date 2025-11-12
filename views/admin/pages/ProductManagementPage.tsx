import React, { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { mockProducts, mockCategories } from '../../../data/mockData';
import { Product } from '../../../types';

const ProductFormModal: React.FC<{ product: Product | null; onClose: () => void; onSave: (product: Product) => void; }> = ({ product, onClose, onSave }) => {
    const [formData, setFormData] = useState<Product>(product || {
        id: Math.floor(Math.random() * 10000),
        name: '',
        description: '',
        price: 0,
        category: mockCategories[0].name,
        imageUrl: 'https://picsum.photos/seed/newproduct/600/600',
        rating: 0,
        reviewCount: 0,
        stock: 0,
        specifications: {},
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="text-xl font-semibold text-gray-800">{product ? 'Edit Product' : 'Add New Product'}</h3>
                            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="x" className="w-6 h-6" /></button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Product Name</label>
                                <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" required />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Category</label>
                                <select name="category" value={formData.category} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                    {mockCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Description</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Price</label>
                                <input type="number" name="price" value={formData.price} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Stock Quantity</label>
                                <input type="number" name="stock" value={formData.stock} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" required />
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 px-6 py-3 text-right">
                        <button type="button" onClick={onClose} className="mr-2 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-hover">Save Product</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ProductManagementPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>(mockProducts);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const handleOpenModal = (product: Product | null) => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingProduct(null);
        setIsModalOpen(false);
    };

    const handleSaveProduct = (product: Product) => {
        if (editingProduct) {
            setProducts(products.map(p => p.id === product.id ? product : p));
        } else {
            setProducts([product, ...products]);
        }
        handleCloseModal();
    };

    const handleDeleteProduct = (productId: number) => {
        setProducts(products.filter(p => p.id !== productId));
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Product Management</h1>
                <button onClick={() => handleOpenModal(null)} className="flex items-center bg-primary text-white py-2 px-4 rounded-lg shadow-md hover:bg-primary-hover">
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Add New Product
                </button>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {products.map(product => (
                                <tr key={product.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <img className="h-10 w-10 rounded-md object-cover" src={product.imageUrl} alt={product.name} />
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${product.price.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.stock}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={() => handleOpenModal(product)} className="text-primary-hover hover:text-primary"><Icon name="edit" className="w-5 h-5"/></button>
                                        <button onClick={() => handleDeleteProduct(product.id)} className="ml-4 text-danger hover:text-red-700"><Icon name="trash" className="w-5 h-5"/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && <ProductFormModal product={editingProduct} onClose={handleCloseModal} onSave={handleSaveProduct} />}
        </div>
    );
};

export default ProductManagementPage;
