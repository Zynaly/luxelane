import React, { useState, useEffect, useCallback } from 'react';
import {
  ProductAPI,
  CategoryAPI,
  BrandAPI,
  ProductListItem,
  ProductDetail,
  CategoryItem,
  BrandItem,
  ProductStatus,
  ProductWritePayload,
  BulkImportJobStatus,
} from '../../services/api';
import { Icon } from '../../components/Icon';
import { ProductVariantsModal } from './ProductVariantsModal';

const SAMPLE_CSV = `title,description,base_price,category,brand,tags,image_url
"Cashmere Silk Trench Coat","Handcrafted double-faced cashmere and silk trench",1850.00,"Apparel","Luxe Atelier","luxury,coat,outerwear","https://images.unsplash.com/photo-1539571696357-5a69c17a67c6"
"Sapphire Signet Ring","18k recycled yellow gold signet ring with Ceylon sapphire",2400.00,"Jewelry","Aurum","fine jewelry,gold,sapphire","https://images.unsplash.com/photo-1605100804763-247f67b3557e"`;

export const VendorProductsTab: React.FC = () => {
  // State
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<ProductListItem | null>(null);

  // Product Form
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    base_price: string;
    category: string;
    brand: string;
    status: ProductStatus;
    tagsInput: string;
    imageUrls: string[];
    primaryImageIndex: number;
  }>({
    title: '',
    description: '',
    base_price: '',
    category: '',
    brand: '',
    status: 'draft',
    tagsInput: '',
    imageUrls: [''],
    primaryImageIndex: 0,
  });

  // Bulk Import State
  const [csvContent, setCsvContent] = useState(SAMPLE_CSV);
  const [bulkJob, setBulkJob] = useState<BulkImportJobStatus | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch initial data
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const params: { status?: string; search?: string } = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await ProductAPI.myList(params);
      setProducts(res);
    } catch (err: any) {
      showToast(err?.message || 'Failed to fetch vendor products', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  const loadLookups = useCallback(async () => {
    try {
      const [catList, brandList] = await Promise.all([
        CategoryAPI.list(),
        BrandAPI.list(),
      ]);
      setCategories(catList);
      setBrands(brandList);
    } catch (err) {
      console.error('Failed to load categories/brands', err);
    }
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  // Handle open create modal
  const handleOpenCreate = () => {
    setEditingProductId(null);
    setFormData({
      title: '',
      description: '',
      base_price: '',
      category: categories[0]?.id || '',
      brand: brands[0]?.id || '',
      status: 'draft',
      tagsInput: '',
      imageUrls: [''],
      primaryImageIndex: 0,
    });
    setIsEditModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEdit = async (id: string) => {
    try {
      setActionLoading(true);
      const detail: ProductDetail = await ProductAPI.retrieve(id);
      setEditingProductId(id);
      setFormData({
        title: detail.title,
        description: detail.description || '',
        base_price: detail.base_price,
        category: detail.category_info?.id || '',
        brand: detail.brand_info?.id || '',
        status: detail.status,
        tagsInput: (detail.tags || []).map((t) => t.tag).join(', '),
        imageUrls: detail.images?.length > 0 ? detail.images.map((img) => img.image_url) : [''],
        primaryImageIndex: Math.max(0, (detail.images || []).findIndex((img) => img.is_primary)),
      });
      setIsEditModalOpen(true);
    } catch (err: any) {
      showToast(err?.message || 'Failed to fetch product details', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle save (create or update)
  const handleSaveProduct = async (statusOverride?: ProductStatus) => {
    if (!formData.title.trim()) {
      showToast('Please enter a product title', 'error');
      return;
    }
    if (!formData.base_price || isNaN(Number(formData.base_price))) {
      showToast('Please enter a valid price', 'error');
      return;
    }
    if (!formData.category) {
      showToast('Please select a category', 'error');
      return;
    }

    const cleanedImages = formData.imageUrls
      .filter((url) => url.trim().length > 0)
      .map((url, idx) => ({
        image_url: url.trim(),
        sort_order: idx,
        is_primary: idx === formData.primaryImageIndex,
      }));

    const tags = formData.tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: ProductWritePayload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      base_price: formData.base_price,
      category: formData.category,
      brand: formData.brand || null,
      status: statusOverride || formData.status,
      images: cleanedImages,
      tags,
    };

    try {
      setActionLoading(true);
      if (editingProductId) {
        await ProductAPI.myUpdate(editingProductId, payload);
        showToast('Product updated successfully');
      } else {
        await ProductAPI.myCreate(payload);
        showToast('Product created successfully');
      }
      setIsEditModalOpen(false);
      loadProducts();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save product', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit product directly for platform review
  const handleSubmitForReview = async (product: ProductListItem) => {
    try {
      setActionLoading(true);
      await ProductAPI.myUpdate(product.id, { status: 'pending_review' });
      showToast(`"${product.title}" submitted for platform review!`);
      loadProducts();
    } catch (err: any) {
      showToast(err?.message || 'Failed to submit for review', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete product
  const handleDeleteProduct = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      setActionLoading(true);
      await ProductAPI.myDelete(id);
      showToast('Product deleted successfully');
      loadProducts();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete product', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk Import
  const handleStartBulkImport = async () => {
    if (!csvContent.trim()) {
      showToast('CSV content cannot be empty', 'error');
      return;
    }
    try {
      setBulkImporting(true);
      const res = await ProductAPI.bulkImport(csvContent);
      showToast(`Import job #${res.job_id} scheduled!`);

      // Poll for job status
      const pollInterval = setInterval(async () => {
        try {
          const status = await ProductAPI.bulkImportStatus(res.job_id);
          setBulkJob(status);
          if (status.status === 'done' || status.status === 'failed') {
            clearInterval(pollInterval);
            setBulkImporting(false);
            loadProducts();
            if (status.status === 'done') {
              showToast(`Import completed: ${status.processed_rows} items processed!`);
            } else {
              showToast(status.error_message || 'Import failed with errors', 'error');
            }
          }
        } catch {
          clearInterval(pollInterval);
          setBulkImporting(false);
        }
      }, 1500);
    } catch (err: any) {
      setBulkImporting(false);
      showToast(err?.message || 'Failed to start bulk import', 'error');
    }
  };

  const getStatusBadge = (status: ProductStatus) => {
    const badgeMap: Record<ProductStatus, { label: string; bg: string; text: string; dot: string }> = {
      approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500' },
      pending_review: { label: 'Pending Review', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500 animate-pulse' },
      rejected: { label: 'Rejected', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-800', dot: 'bg-rose-500' },
      draft: { label: 'Draft', bg: 'bg-gray-100 border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400' },
      archived: { label: 'Archived', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-800', dot: 'bg-purple-500' },
    };
    const b = badgeMap[status] || badgeMap.draft;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${b.bg} ${b.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${b.dot}`} />
        {b.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 text-sm font-medium border ${
            toast.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <Icon name={toast.type === 'error' ? 'x' : 'check'} className="w-5 h-5" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-serif font-bold text-dark">Catalog & Inventory Management</h2>
          <p className="text-xs text-gray-500 mt-1">
            Manage your boutique offerings, product photography, pricing, and curation submission.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Icon name="package" className="w-4 h-4 text-gray-500" />
            <span>Bulk CSV Import</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-100">
        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { key: 'all', label: 'All Items' },
            { key: 'approved', label: 'Approved' },
            { key: 'pending_review', label: 'In Review' },
            { key: 'draft', label: 'Drafts' },
            { key: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.key
                  ? 'bg-dark text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by title, SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-dark"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">
            <div className="w-8 h-8 border-2 border-dark border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading catalog items...
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
              <Icon name="products" className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">No products found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              You have not created any products matching the current criteria. Start by listing your premier pieces.
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center space-x-2 px-4 py-2 bg-dark text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              <span>Add First Product</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="py-3.5 px-6">Product Details</th>
                  <th className="py-3.5 px-4">Category & Brand</th>
                  <th className="py-3.5 px-4">Base Price</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Rating</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                          {p.primary_image ? (
                            <img
                              src={p.primary_image}
                              alt={p.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <Icon name="products" className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 line-clamp-1">{p.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">ID: {p.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-xs">
                      <p className="font-medium text-gray-800">{p.category_name || 'Uncategorized'}</p>
                      {p.brand_name && <p className="text-gray-400 mt-0.5">{p.brand_name}</p>}
                    </td>
                    <td className="py-4 px-4 font-mono font-semibold text-gray-900">
                      ${parseFloat(p.base_price || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(p.status)}
                    </td>
                    <td className="py-4 px-4 text-xs text-gray-600">
                      <span className="inline-flex items-center space-x-1">
                        <Icon name="star" className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="font-medium">{p.rating_avg || '0.0'}</span>
                        <span className="text-gray-400">({p.rating_count || 0})</span>
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setSelectedProductForVariants(p)}
                          className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
                          title="Manage Variants & Combinations"
                        >
                          Variants
                        </button>
                        {p.status === 'draft' && (
                          <button
                            onClick={() => handleSubmitForReview(p)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors"
                            title="Submit to LuxeLane curation team"
                          >
                            Submit
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(p.id)}
                          className="p-1.5 text-gray-500 hover:text-dark hover:bg-gray-100 rounded-md transition-colors"
                          title="Edit Product"
                        >
                          <Icon name="edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id, p.title)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                          title="Delete Product"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CREATE / EDIT MODAL ────────────────────────────────────────────── */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl space-y-6 my-8">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h3 className="text-xl font-serif font-bold text-dark">
                  {editingProductId ? 'Edit Product Item' : 'Create New Product'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Specify product attributes, pricing, photography, and luxury taxonomy.
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-dark p-1"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hand-stitched Saffiano Leather Tote"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                />
              </div>

              {/* Category & Brand */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3.5 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Brand / Maison
                  </label>
                  <select
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full px-3.5 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                  >
                    <option value="">No Brand Affiliation</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Base Price (USD) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ProductStatus })}
                    className="w-full px-3.5 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                  >
                    <option value="draft">Draft (Private draft mode)</option>
                    <option value="pending_review">Submit for Review</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Description
                </label>
                <textarea
                  rows={4}
                  placeholder="Detail the craftsmanship, provenance, materials, dimensions, and styling notes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                />
              </div>

              {/* Image URLs */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Image URLs (Direct Web or CDN links)
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, imageUrls: [...formData.imageUrls, ''] })}
                    className="text-xs text-indigo-600 font-semibold hover:underline"
                  >
                    + Add Another Image
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.imageUrls.map((url, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/..."
                        value={url}
                        onChange={(e) => {
                          const updated = [...formData.imageUrls];
                          updated[index] = e.target.value;
                          setFormData({ ...formData, imageUrls: updated });
                        }}
                        className="flex-1 px-3 py-2 border rounded-lg text-xs focus:ring-1 focus:ring-dark"
                      />
                      <label className="flex items-center space-x-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                        <input
                          type="radio"
                          name="primaryImage"
                          checked={formData.primaryImageIndex === index}
                          onChange={() => setFormData({ ...formData, primaryImageIndex: index })}
                        />
                        <span>Primary</span>
                      </label>
                      {formData.imageUrls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.imageUrls.filter((_, i) => i !== index);
                            setFormData({
                              ...formData,
                              imageUrls: updated,
                              primaryImageIndex: Math.min(formData.primaryImageIndex, updated.length - 1),
                            });
                          }}
                          className="p-1 text-rose-500 hover:text-rose-700"
                        >
                          <Icon name="x" className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. organic silk, handmade, limited edition, evening wear"
                  value={formData.tagsInput}
                  onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
                  className="w-full px-3.5 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-dark"
                />
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleSaveProduct('draft')}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleSaveProduct('pending_review')}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {actionLoading ? 'Saving...' : 'Submit for Review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK CSV IMPORT MODAL ────────────────────────────────────────── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h3 className="text-xl font-serif font-bold text-dark">Bulk Product CSV Import</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Import hundreds of products at once with automated taxonomy matching and validation.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsBulkModalOpen(false);
                  setBulkJob(null);
                }}
                className="text-gray-400 hover:text-dark p-1"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Paste Raw CSV Data
                </label>
                <p className="text-[11px] text-gray-400 mb-2">
                  Required columns: <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">title,base_price,category</code>. Optional: <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">description,brand,tags,image_url</code>.
                </p>
                <textarea
                  rows={8}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="w-full font-mono text-xs px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-dark"
                />
              </div>

              {/* Bulk Job Progress Status */}
              {bulkJob && (
                <div className="p-4 rounded-xl border bg-gray-50 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>Import Status: <strong className="uppercase text-dark">{bulkJob.status}</strong></span>
                    <span>{bulkJob.processed_rows} of {bulkJob.total_rows} items</span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${bulkJob.total_rows > 0 ? (bulkJob.processed_rows / bulkJob.total_rows) * 100 : 0}%`,
                      }}
                    />
                  </div>

                  {bulkJob.results && bulkJob.results.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                      {bulkJob.results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-1 border-b border-gray-200/50">
                          <span className="font-mono text-gray-700">Row {r.row_number}: {r.sku || 'N/A'}</span>
                          <span className={`font-semibold ${r.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setIsBulkModalOpen(false);
                  setBulkJob(null);
                }}
                className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={bulkImporting}
                onClick={handleStartBulkImport}
                className="px-5 py-2 bg-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 shadow-sm"
              >
                {bulkImporting ? 'Processing Import...' : 'Start Import Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRODUCT VARIANTS MODAL (SPRINT 5) ─────────────────────────────── */}
      {selectedProductForVariants && (
        <ProductVariantsModal
          product={selectedProductForVariants}
          onClose={() => {
            setSelectedProductForVariants(null);
            loadProducts();
          }}
        />
      )}
    </div>
  );
};
