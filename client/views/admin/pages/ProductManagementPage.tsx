import React, { useState, useEffect, useCallback } from 'react';
import { ProductAPI, CategoryAPI, BrandAPI, ProductListItem, CategoryItem, BrandItem } from '../../../services/api';

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; color: string }> = {
    approved:       { label: 'Approved',       color: '#10b981' },
    pending_review: { label: 'Pending Review', color: '#f59e0b' },
    rejected:       { label: 'Rejected',       color: '#ef4444' },
    draft:          { label: 'Draft',          color: '#6b7280' },
    archived:       { label: 'Archived',       color: '#8b5cf6' },
  };
  const s = map[status] || { label: status, color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
      color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}40`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  );
};

// ── Reject Modal ──────────────────────────────────────────────────────────────
const RejectModal: React.FC<{
  productTitle: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ productTitle, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 16,
        width: '100%', maxWidth: 480, padding: 32,
      }}>
        <h3 style={{ margin: '0 0 8px', color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>Reject Product</h3>
        <p style={{ color: '#94a3b8', margin: '0 0 20px', fontSize: 14 }}>
          You are rejecting <strong style={{ color: '#e2e8f0' }}>{productTitle}</strong>. Please provide a reason.
        </p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Images are low quality, missing product description..."
          rows={4}
          style={{
            width: '100%', padding: '12px', background: '#0f0f1a', border: '1px solid #3d3d5c',
            borderRadius: 8, color: '#e2e8f0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 8, border: '1px solid #3d3d5c',
            background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14,
          }}>
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: reason.trim() ? '#ef4444' : '#374151',
              color: '#fff', cursor: reason.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600,
            }}
          >
            Reject Product
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Category Modal ────────────────────────────────────────────────────────────
const CategoryModal: React.FC<{
  category: CategoryItem | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ category, onClose, onSave }) => {
  const [name, setName] = useState(category?.name || '');
  const [iconUrl, setIconUrl] = useState(category?.icon_url || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (category) {
        await CategoryAPI.adminUpdate(category.id, { name, icon_url: iconUrl });
      } else {
        await CategoryAPI.adminCreate({ name, icon_url: iconUrl, is_active: true });
      }
      onSave();
    } catch (err: any) {
      setError(err?.message || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 16,
        width: '100%', maxWidth: 420, padding: 32,
      }}>
        <h3 style={{ margin: '0 0 20px', color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>
          {category ? 'Edit Category' : 'New Category'}
        </h3>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>Name *</label>
          <input
            value={name} onChange={e => setName(e.target.value)} required
            style={{
              width: '100%', padding: '10px', background: '#0f0f1a', border: '1px solid #3d3d5c',
              borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginBottom: 16, boxSizing: 'border-box',
            }}
          />
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>Icon URL</label>
          <input
            value={iconUrl} onChange={e => setIconUrl(e.target.value)}
            placeholder="https://..."
            style={{
              width: '100%', padding: '10px', background: '#0f0f1a', border: '1px solid #3d3d5c',
              borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginBottom: 20, boxSizing: 'border-box',
            }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 20px', borderRadius: 8, border: '1px solid #3d3d5c',
              background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14,
            }}>Cancel</button>
            <button type="submit" disabled={loading} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>{loading ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Brand Modal ───────────────────────────────────────────────────────────────
const BrandModal: React.FC<{
  brand: BrandItem | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ brand, onClose, onSave }) => {
  const [name, setName] = useState(brand?.name || '');
  const [logoUrl, setLogoUrl] = useState(brand?.logo_url || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (brand) {
        await BrandAPI.adminUpdate(brand.id, { name, logo_url: logoUrl });
      } else {
        await BrandAPI.adminCreate({ name, logo_url: logoUrl });
      }
      onSave();
    } catch (err: any) {
      setError(err?.message || 'Failed to save brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 16,
        width: '100%', maxWidth: 420, padding: 32,
      }}>
        <h3 style={{ margin: '0 0 20px', color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>
          {brand ? 'Edit Brand' : 'New Brand'}
        </h3>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>Name *</label>
          <input
            value={name} onChange={e => setName(e.target.value)} required
            style={{
              width: '100%', padding: '10px', background: '#0f0f1a', border: '1px solid #3d3d5c',
              borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginBottom: 16, boxSizing: 'border-box',
            }}
          />
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>Logo URL</label>
          <input
            value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://..."
            style={{
              width: '100%', padding: '10px', background: '#0f0f1a', border: '1px solid #3d3d5c',
              borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginBottom: 20, boxSizing: 'border-box',
            }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 20px', borderRadius: 8, border: '1px solid #3d3d5c',
              background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14,
            }}>Cancel</button>
            <button type="submit" disabled={loading} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>{loading ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
type ActiveTab = 'moderation' | 'all-products' | 'categories' | 'brands';

const ProductManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('moderation');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rejectTarget, setRejectTarget] = useState<ProductListItem | null>(null);
  const [categoryModalTarget, setCategoryModalTarget] = useState<CategoryItem | null | 'new'>(null);
  const [brandModalTarget, setBrandModalTarget] = useState<BrandItem | null | 'new'>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadProducts = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = {};
      if (searchQuery) params.search = searchQuery;
      if (statusFilter) params.status = statusFilter;
      const data = await ProductAPI.adminList(params);
      setProducts(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  const loadCategories = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await CategoryAPI.adminList();
      setCategories(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBrands = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await BrandAPI.adminList();
      setBrands(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load brands');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'moderation' || activeTab === 'all-products') loadProducts();
    else if (activeTab === 'categories') loadCategories();
    else if (activeTab === 'brands') loadBrands();
  }, [activeTab, loadProducts, loadCategories, loadBrands]);

  const handleApprove = async (product: ProductListItem) => {
    try {
      await ProductAPI.adminApprove(product.id);
      showToast(`✅ "${product.title}" approved`);
      loadProducts();
    } catch (err: any) {
      showToast(`❌ ${err?.message || 'Failed to approve'}`);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    try {
      await ProductAPI.adminReject(rejectTarget.id, reason);
      showToast(`🚫 "${rejectTarget.title}" rejected`);
      setRejectTarget(null);
      loadProducts();
    } catch (err: any) {
      showToast(`❌ ${err?.message || 'Failed to reject'}`);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await CategoryAPI.adminDelete(id);
      showToast('Category deleted');
      loadCategories();
    } catch { showToast('Failed to delete category'); }
  };

  const handleDeleteBrand = async (id: string) => {
    if (!window.confirm('Delete this brand?')) return;
    try {
      await BrandAPI.adminDelete(id);
      showToast('Brand deleted');
      loadBrands();
    } catch { showToast('Failed to delete brand'); }
  };

  const pendingProducts = products.filter(p => p.status === 'pending_review');
  const displayedProducts = activeTab === 'moderation' ? pendingProducts : products;

  const tabStyle = (tab: ActiveTab) => ({
    padding: '10px 20px', borderRadius: 8, border: 'none',
    background: activeTab === tab ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'transparent',
    color: activeTab === tab ? '#fff' : '#94a3b8',
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
    transition: 'all 0.2s',
  });

  return (
    <div style={{ padding: '28px', minHeight: '100vh', background: '#0f0f1a', color: '#e2e8f0' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 2000,
          background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
          padding: '14px 20px', fontSize: 14, color: '#f1f5f9',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'fadeIn 0.2s',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 800,
          background: 'linear-gradient(135deg, #667eea, #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Product Management
        </h1>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
          Review submissions, manage categories and brands
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Pending Review', value: products.filter(p => p.status === 'pending_review').length, color: '#f59e0b' },
          { label: 'Approved', value: products.filter(p => p.status === 'approved').length, color: '#10b981' },
          { label: 'Rejected', value: products.filter(p => p.status === 'rejected').length, color: '#ef4444' },
          { label: 'Total Products', value: products.length, color: '#667eea' },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px', background: '#1a1a2e',
        borderRadius: 12, border: '1px solid #2d2d44', marginBottom: 20, width: 'fit-content',
      }}>
        {(['moderation', 'all-products', 'categories', 'brands'] as ActiveTab[]).map(tab => (
          <button key={tab} style={tabStyle(tab)} onClick={() => setActiveTab(tab)}>
            {{
              'moderation': `⚠️ Moderation Queue ${pendingProducts.length > 0 ? `(${pendingProducts.length})` : ''}`,
              'all-products': '📦 All Products',
              'categories': '🗂️ Categories',
              'brands': '🏷️ Brands',
            }[tab]}
          </button>
        ))}
      </div>

      {/* Search & Filter (products tabs) */}
      {(activeTab === 'moderation' || activeTab === 'all-products') && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadProducts()}
            style={{
              flex: 1, padding: '10px 16px', background: '#1a1a2e',
              border: '1px solid #2d2d44', borderRadius: 8, color: '#e2e8f0', fontSize: 14,
            }}
          />
          {activeTab === 'all-products' && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                padding: '10px 16px', background: '#1a1a2e',
                border: '1px solid #2d2d44', borderRadius: 8, color: '#e2e8f0', fontSize: 14,
              }}
            >
              <option value="">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending_review">Pending Review</option>
              <option value="rejected">Rejected</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          )}
          <button
            onClick={loadProducts}
            style={{
              padding: '10px 20px', background: 'linear-gradient(135deg, #667eea, #764ba2)',
              border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            Search
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', background: '#ef444420', border: '1px solid #ef4444',
          borderRadius: 8, color: '#fca5a5', fontSize: 14, marginBottom: 16,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1s linear infinite' }}>⟳</div>
          Loading...
        </div>
      )}

      {/* Products Table */}
      {!loading && (activeTab === 'moderation' || activeTab === 'all-products') && (
        <div style={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 12, overflow: 'hidden' }}>
          {displayedProducts.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
              {activeTab === 'moderation'
                ? '✅ No products pending review!'
                : '📭 No products found.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0f0f1a', borderBottom: '1px solid #2d2d44' }}>
                  {['Product', 'Vendor', 'Category', 'Price', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '14px 16px', textAlign: 'left',
                      fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedProducts.map((product, i) => (
                  <tr key={product.id} style={{
                    borderBottom: '1px solid #2d2d44',
                    background: i % 2 === 0 ? 'transparent' : '#ffffff04',
                    transition: 'background 0.15s',
                  }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {product.primary_image ? (
                          <img src={product.primary_image} alt={product.title}
                            style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #2d2d44' }} />
                        ) : (
                          <div style={{
                            width: 40, height: 40, borderRadius: 8, background: '#2d2d44',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                          }}>📦</div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>{product.title}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>{product.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 14 }}>{product.vendor_display_name}</td>
                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 14 }}>{product.category_name}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#10b981', fontSize: 14 }}>
                      ${parseFloat(product.base_price).toFixed(2)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <StatusBadge status={product.status} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {product.status === 'pending_review' && (
                          <>
                            <button
                              onClick={() => handleApprove(product)}
                              style={{
                                padding: '6px 14px', borderRadius: 6,
                                background: '#10b98120', color: '#10b981', cursor: 'pointer',
                                fontSize: 12, fontWeight: 600, border: '1px solid #10b98140',
                              }}
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => setRejectTarget(product)}
                              style={{
                                padding: '6px 14px', borderRadius: 6,
                                background: '#ef444420', color: '#ef4444', cursor: 'pointer',
                                fontSize: 12, fontWeight: 600, border: '1px solid #ef444440',
                              }}
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        {product.status !== 'pending_review' && (
                          <span style={{ color: '#475569', fontSize: 13 }}>
                            {product.status === 'approved' ? '✅ Approved' : product.status === 'rejected' ? '🚫 Rejected' : '—'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Categories Tab */}
      {!loading && activeTab === 'categories' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: 18, fontWeight: 700 }}>
              Categories ({categories.length})
            </h2>
            <button
              onClick={() => setCategoryModalTarget('new')}
              style={{
                padding: '10px 20px', background: 'linear-gradient(135deg, #667eea, #764ba2)',
                border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              + New Category
            </button>
          </div>
          <div style={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 12, overflow: 'hidden' }}>
            {categories.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                No categories yet. Create the first one!
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0f0f1a', borderBottom: '1px solid #2d2d44' }}>
                    {['Name', 'Slug', 'Level', 'Active', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: '14px 16px', textAlign: 'left',
                        fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => (
                    <tr key={cat.id} style={{
                      borderBottom: '1px solid #2d2d44',
                      background: i % 2 === 0 ? 'transparent' : '#ffffff04',
                    }}>
                      <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 600 }}>
                        {'  '.repeat(cat.level)}
                        {cat.level > 0 ? '└ ' : ''}{cat.name}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13 }}>{cat.slug}</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{cat.level}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ color: cat.is_active ? '#10b981' : '#ef4444' }}>
                          {cat.is_active ? '✓' : '✗'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => setCategoryModalTarget(cat)}
                            style={{
                              padding: '5px 12px', borderRadius: 6, border: '1px solid #3d3d5c',
                              background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12,
                            }}
                          >Edit</button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            style={{
                              padding: '5px 12px', borderRadius: 6, border: '1px solid #ef444440',
                              background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 12,
                            }}
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Brands Tab */}
      {!loading && activeTab === 'brands' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: 18, fontWeight: 700 }}>
              Brands ({brands.length})
            </h2>
            <button
              onClick={() => setBrandModalTarget('new')}
              style={{
                padding: '10px 20px', background: 'linear-gradient(135deg, #667eea, #764ba2)',
                border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              + New Brand
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {brands.length === 0 ? (
              <div style={{
                gridColumn: '1/-1', padding: '48px', textAlign: 'center',
                color: '#64748b', background: '#1a1a2e', borderRadius: 12, border: '1px solid #2d2d44',
              }}>
                No brands yet.
              </div>
            ) : (
              brands.map(brand => (
                <div key={brand.id} style={{
                  background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 12, padding: '20px',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  transition: 'border-color 0.2s',
                }}>
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt={brand.name}
                      style={{ width: '100%', height: 80, objectFit: 'contain', borderRadius: 8 }} />
                  ) : (
                    <div style={{
                      height: 80, background: '#2d2d44', borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 28, color: '#475569',
                    }}>🏷️</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{brand.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{brand.slug}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button
                      onClick={() => setBrandModalTarget(brand)}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #3d3d5c',
                        background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
                      }}
                    >Edit</button>
                    <button
                      onClick={() => handleDeleteBrand(brand.id)}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #ef444440',
                        background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 13,
                      }}
                    >Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {rejectTarget && (
        <RejectModal
          productTitle={rejectTarget.title}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleReject}
        />
      )}
      {categoryModalTarget && (
        <CategoryModal
          category={categoryModalTarget === 'new' ? null : categoryModalTarget}
          onClose={() => setCategoryModalTarget(null)}
          onSave={() => { setCategoryModalTarget(null); loadCategories(); }}
        />
      )}
      {brandModalTarget && (
        <BrandModal
          brand={brandModalTarget === 'new' ? null : brandModalTarget}
          onClose={() => setBrandModalTarget(null)}
          onSave={() => { setBrandModalTarget(null); loadBrands(); }}
        />
      )}
    </div>
  );
};

export default ProductManagementPage;
