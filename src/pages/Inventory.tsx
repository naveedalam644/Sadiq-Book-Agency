import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen,
  Plus,
  Eye,
  Edit,
  Trash2,
  AlertTriangle,
  History,
  ArrowUpDown,
  RefreshCw,
  Coins,
  Package,
  Building2,
  Layers,
  Tag,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Table, type Column } from '../components/common/Table';
import { SearchInput } from '../components/common/SearchInput';
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { ProductDetailModal } from '../components/inventory/ProductDetailModal';
import { StockAdjustmentModal } from '../components/inventory/StockAdjustmentModal';
import { ProductHistoryModal } from '../components/inventory/ProductHistoryModal';
import { PublisherSeriesManagerModal } from '../components/inventory/PublisherSeriesManagerModal';
import { PriceListTable } from '../components/inventory/PriceListTable';
import type {
  ProductDocument,
  CategoryDocument,
  StockMovementDocument,
  PublisherDocument,
  SeriesDocument,
} from '../types/database';
import {
  getProductsPaginated,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  type ProductFilters,
} from '../services/productService';
import { getCategories } from '../services/categoryService';
import { getActivePublishers } from '../services/publisherService';
import { getActiveSeriesByPublisher } from '../services/seriesService';
import {
  getStockMovementsPaginated,
  type StockMovementFilters,
} from '../services/stockService';
import { getInventorySummary } from '../services/summaryService';
import { formatCurrency, formatNumber } from '../utils/formatters';

export const Inventory: React.FC = () => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'products' | 'movements' | 'pricelist'>('products');

  // Categories
  const [categories, setCategories] = useState<CategoryDocument[]>([]);

  // Products state
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productFilters, setProductFilters] = useState<ProductFilters>({
    classification: 'all',
    categoryId: 'all',
    status: 'all',
    stockStatus: 'all',
    publisherId: 'all',
    seriesId: 'all',
    searchTerm: '',
  });
  const [productCursor, setProductCursor] = useState<any>(null);
  const [cursorHistory, setCursorHistory] = useState<any[]>([]);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);

  // Summary indicators
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [totalValuation, setTotalValuation] = useState(0);

  // Stock Movements state
  const [movements, setMovements] = useState<StockMovementDocument[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementFilters, setMovementFilters] = useState<StockMovementFilters>({
    movementType: 'all',
    reason: 'all',
  });
  const [movementCursor, setMovementCursor] = useState<any>(null);
  const [movementCursorHistory, setMovementCursorHistory] = useState<any[]>([]);
  const [hasMoreMovements, setHasMoreMovements] = useState(false);

  // Modals
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductDocument | null>(null);
  const [viewingProduct, setViewingProduct] = useState<ProductDocument | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductDocument | null>(null);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [selectedProductForAdjustment, setSelectedProductForAdjustment] = useState<string | undefined>();
  const [isPublisherModalOpen, setIsPublisherModalOpen] = useState(false);
  const [publishersList, setPublishersList] = useState<PublisherDocument[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const summary = await getInventorySummary();
      setTotalProductsCount(summary.totalProducts);
      setLowStockCount(summary.lowStockCount);
      setTotalValuation(summary.totalStockValue);
    } catch (err) {
      console.warn('Summary load notice:', err);
    }
  }, []);

  // Load Categories, Publishers & Summary once
  useEffect(() => {
    getCategories()
      .then((cats) => setCategories(cats))
      .catch((err) => console.error('Failed to load categories:', err));

    getActivePublishers()
      .then(setPublishersList)
      .catch((err) => console.warn('Failed to load publishers in inventory:', err));

    loadSummary();
  }, [loadSummary]);

  // Cascading series loader for inventory filter
  useEffect(() => {
    if (productFilters.publisherId && productFilters.publisherId !== 'all') {
      getActiveSeriesByPublisher(productFilters.publisherId)
        .then(setSeriesList)
        .catch(() => setSeriesList([]));
    } else {
      setSeriesList([]);
    }
  }, [productFilters.publisherId]);

  // Keep filter refs for stable callback access
  const productFiltersRef = useRef(productFilters);
  useEffect(() => {
    productFiltersRef.current = productFilters;
  }, [productFilters]);

  const movementFiltersRef = useRef(movementFilters);
  useEffect(() => {
    movementFiltersRef.current = movementFilters;
  }, [movementFilters]);

  // Stable search handler: prevents redundant filter updates
  const handleProductSearch = useCallback((term: string) => {
    setProductFilters((prev) => {
      if (prev.searchTerm === term) return prev;
      return { ...prev, searchTerm: term };
    });
  }, []);

  // Fetch Products
  const loadProducts = useCallback(
    async (cursor: any = null, isNext = false, filtersToUse = productFiltersRef.current) => {
      setProductsLoading(true);
      try {
        const res = await getProductsPaginated(filtersToUse, cursor);
        setProducts(res.products);
        setHasMoreProducts(res.hasMore);
        setProductCursor(res.lastDoc);

        if (isNext && cursor) {
          setCursorHistory((prev) => [...prev, cursor]);
        }
      } catch (err: any) {
        toastError(err?.message || 'Failed to load products');
      } finally {
        setProductsLoading(false);
      }
    },
    [toastError]
  );

  useEffect(() => {
    if (activeTab === 'products') {
      setCursorHistory([]);
      loadProducts(null, false, productFilters);
    }
  }, [activeTab, productFilters, loadProducts]);

  // Fetch Stock Movements
  const loadMovements = useCallback(
    async (cursor: any = null, isNext = false, filtersToUse = movementFiltersRef.current) => {
      setMovementsLoading(true);
      try {
        const res = await getStockMovementsPaginated(filtersToUse, cursor);
        setMovements(res.movements);
        setHasMoreMovements(res.hasMore);
        setMovementCursor(res.lastDoc);

        if (isNext && cursor) {
          setMovementCursorHistory((prev) => [...prev, cursor]);
        }
      } catch (err: any) {
        toastError(err?.message || 'Failed to load stock audit trail');
      } finally {
        setMovementsLoading(false);
      }
    },
    [toastError]
  );

  useEffect(() => {
    if (activeTab === 'movements') {
      setMovementCursorHistory([]);
      loadMovements(null, false, movementFilters);
    }
  }, [activeTab, movementFilters, loadMovements]);

  // Handlers
  const handleProductSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      if (editingProduct) {
        await updateProduct(
          editingProduct.id,
          payload,
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Product "${payload.title}" updated successfully.`);
      } else {
        await createProduct(
          payload,
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Product "${payload.title}" registered with SKU ${payload.sku}.`);
      }
      setIsAddProductModalOpen(false);
      setEditingProduct(null);
      loadProducts(null);
      loadSummary();
    } catch (err: any) {
      toastError(err?.message || 'Failed to save product');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (product: ProductDocument) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${product.title}" (${product.sku})? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deleteProduct(
        product.id,
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );
      success(`Product "${product.title}" removed from catalog.`);
      loadProducts(null);
      loadSummary();
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete product');
    }
  };

  const handleToggleStatus = async (product: ProductDocument) => {
    try {
      const newStatus = !product.isActive;
      await toggleProductStatus(
        product.id,
        newStatus,
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );
      success(`Product is now ${newStatus ? 'Active' : 'Inactive'}.`);
      loadProducts(null);
      loadSummary();
    } catch (err: any) {
      toastError(err?.message || 'Failed to update status');
    }
  };

  // Product Table Columns
  const productColumns: Column<ProductDocument>[] = [
    {
      key: 'title',
      header: 'Product / Item Title',
      render: (row) => (
        <div className="max-w-xs">
          <div className="font-bold text-slate-900 truncate hover:text-[#071F49] cursor-pointer" onClick={() => setViewingProduct(row)}>
            {row.title}
          </div>
          <div className="text-[11px] text-slate-500 truncate mt-0.5">
            {row.publisherName ? `${row.publisherName} • ` : row.authorOrPublisher ? `${row.authorOrPublisher} • ` : ''}
            {row.notebookSize || row.notebookSheets || row.notebookGrammage ? (
              <span className="text-amber-800 font-semibold">
                {[row.notebookSize, row.notebookSheets ? `${row.notebookSheets} Sh` : '', row.notebookGrammage].filter(Boolean).join(' • ')}
              </span>
            ) : (
              row.edition || 'Standard Edition'
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU / Barcode',
      render: (row) => (
        <div>
          <span className="font-mono font-semibold text-xs text-[#071F49] block">
            {row.sku}
          </span>
          {row.barcode && (
            <span className="font-mono text-[10px] text-slate-400 block mt-0.5">
              {row.barcode}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'series',
      header: 'Series & Publisher',
      render: (row) => {
        const isNb =
          row.classification === 'notebook' ||
          row.classification === 'register' ||
          Boolean(row.notebookSize || row.notebookSheets || row.notebookGrammage);

        if (isNb && (row.notebookSize || row.notebookSheets || row.notebookGrammage)) {
          return (
            <div className="text-xs">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/80 text-[10px] font-bold">
                {[
                  row.notebookSize,
                  row.notebookSheets ? `${row.notebookSheets} Sh` : '',
                  row.notebookGrammage,
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </span>
              <div className="text-[11px] text-slate-500 truncate max-w-[150px] mt-0.5">
                {row.authorOrPublisher || 'Notebook / Register'}
              </div>
            </div>
          );
        }

        return (
          <div className="text-xs">
            <div className="font-bold text-slate-800 truncate max-w-[150px]">
              {row.seriesName ? (
                <span className="text-[#071F49] flex items-center gap-1 font-bold">
                  <Layers className="w-3 h-3 text-[#F5B51B] shrink-0" />
                  <span className="truncate">{row.seriesName}</span>
                </span>
              ) : (
                <span className="text-slate-400 font-normal italic">Standalone</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 truncate max-w-[150px] mt-0.5">
              {row.publisherName || '—'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'classification',
      header: 'Type & Category',
      render: (row) => (
        <div className="flex flex-col gap-1 items-start">
          <Badge variant="navy" size="sm">
            {row.classification.toUpperCase()}
          </Badge>
          <span className="text-[11px] text-slate-500 truncate max-w-[140px]">
            {row.categoryName || 'General'}
          </span>
        </div>
      ),
    },
    {
      key: 'retailPrice',
      header: 'Original MRP',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900">
          {formatCurrency(row.retailPrice)}
        </span>
      ),
    },
    {
      key: 'publisherDiscount',
      header: 'Pub. Disc %',
      align: 'center',
      render: (row) => {
        const disc = typeof row.publisherDiscountPercent === 'number'
          ? row.publisherDiscountPercent
          : (row.retailPrice > 0 ? Math.max(0, Math.round(((row.retailPrice - row.costPrice) / row.retailPrice) * 100)) : 0);
        return (
          <span className="inline-flex items-center text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            {disc}%
          </span>
        );
      },
    },
    {
      key: 'costPrice',
      header: 'Actual Cost',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs text-slate-700">
          {formatCurrency(row.costPrice)}
        </span>
      ),
    },
    {
      key: 'currentStock',
      header: 'Stock on Hand',
      align: 'center',
      render: (row) => {
        const isLow = row.currentStock <= row.lowStockThreshold;
        return (
          <div className="flex flex-col items-center">
            <span className={`font-mono text-xs font-bold ${isLow ? 'text-amber-700' : 'text-slate-900'}`}>
              {formatNumber(row.currentStock)} {row.unit}s
            </span>
            {isLow && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded mt-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                Low (≤{row.lowStockThreshold})
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'isActive',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          onClick={() => handleToggleStatus(row)}
          title="Click to toggle status"
          className="focus:outline-none"
        >
          {row.isActive ? (
            <Badge variant="success" size="sm" dot>Active</Badge>
          ) : (
            <Badge variant="danger" size="sm">Inactive</Badge>
          )}
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setViewingProduct(row)}
            className="p-1.5 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setHistoryProduct(row)}
            className="p-1.5 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="View Product History"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingProduct(row);
              setIsAddProductModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="Edit Product"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedProductForAdjustment(row.id);
              setIsAdjustmentModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
            title="Stock Adjustment"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDeleteProduct(row)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            title="Delete Product"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  // Movement Table Columns
  const movementColumns: Column<StockMovementDocument>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (row) => (
        <span className="text-xs text-slate-600 font-mono">
          {new Date(row.createdAt).toLocaleDateString()} {new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'productName',
      header: 'Product / Item',
      render: (row) => (
        <span className="font-semibold text-xs text-slate-900 block truncate max-w-xs">
          {row.productName}
        </span>
      ),
    },
    {
      key: 'movementType',
      header: 'Type',
      align: 'center',
      render: (row) =>
        row.movementType === 'in' ? (
          <Badge variant="success" size="sm">+ INFLOW</Badge>
        ) : (
          <Badge variant="danger" size="sm">- OUTFLOW</Badge>
        ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      align: 'right',
      render: (row) => (
        <span className={`font-mono text-xs font-bold ${row.movementType === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
          {row.movementType === 'in' ? `+${row.quantity}` : `-${row.quantity}`}
        </span>
      ),
    },
    {
      key: 'stockLevels',
      header: 'Stock Balance',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-xs text-slate-500">
          {row.previousStock} → <strong className="text-slate-800">{row.newStock}</strong>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {row.reason.toUpperCase().replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'referenceDocId',
      header: 'Reference / Remarks',
      render: (row) => (
        <span className="text-[11px] text-slate-500 font-mono truncate max-w-[160px] block">
          {row.referenceDocId || 'N/A'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Valuation Pills */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#071F49] tracking-tight">
            Inventory & Catalog Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Books, Notebooks, Registers & Stationery with real-time stock valuation
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPublisherModalOpen(true)}
            leftIcon={<Building2 className="w-4 h-4 text-[#071F49]" />}
          >
            Publishers & Series
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedProductForAdjustment(undefined);
              setIsAdjustmentModalOpen(true);
            }}
            leftIcon={<ArrowUpDown className="w-4 h-4 text-[#071F49]" />}
          >
            Adjust Stock
          </Button>

          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              setEditingProduct(null);
              setIsAddProductModalOpen(true);
            }}
            leftIcon={<Plus className="w-4 h-4 text-[#071F49]" />}
          >
            Add New Product
          </Button>
        </div>
      </div>

      {/* 2. Top Summary Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Catalog Items
            </span>
            <div className="text-2xl font-black text-[#071F49] font-mono mt-0.5">
              {formatNumber(totalProductsCount)}
            </div>
          </div>
          <div className="p-3 bg-[#071F49]/10 text-[#071F49] rounded-xl">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Low-Stock Alerts
            </span>
            <div className="text-2xl font-black text-amber-600 font-mono mt-0.5">
              {formatNumber(lowStockCount)}
            </div>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-[#071F49] text-white rounded-2xl shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Total Stock Asset Valuation
            </span>
            <div className="text-2xl font-black text-[#F5B51B] font-mono mt-0.5">
              {formatCurrency(totalValuation)}
            </div>
          </div>
          <div className="p-3 bg-white/10 text-[#F5B51B] rounded-xl">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Tab Navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto flex-nowrap scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'products'
              ? 'border-[#F5B51B] text-[#071F49] bg-white rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4 text-[#071F49]" />
          <span>Products & Books Master Catalog</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pricelist')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'pricelist'
              ? 'border-[#F5B51B] text-[#071F49] bg-white rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4 text-[#071F49]" />
          <span>Price List</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('movements')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'movements'
              ? 'border-[#F5B51B] text-[#071F49] bg-white rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4 text-[#071F49]" />
          <span>Stock Movement Audit Logs</span>
        </button>
      </div>

      {/* 4. Tab 1: Products Table & Filters */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
              <div className="sm:col-span-2 xl:col-span-2">
                <SearchInput
                  placeholder="Search books, SKU, barcode, author, brand..."
                  value={productFilters.searchTerm}
                  onSearch={handleProductSearch}
                />
              </div>

              <select
                className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                value={productFilters.publisherId || 'all'}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductFilters((prev) => ({
                    ...prev,
                    publisherId: val,
                    seriesId: 'all',
                  }));
                }}
              >
                <option value="all">All Publishers</option>
                {publishersList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B] disabled:bg-slate-50 disabled:text-slate-400"
                value={productFilters.seriesId || 'all'}
                disabled={!productFilters.publisherId || productFilters.publisherId === 'all'}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductFilters((prev) => ({
                    ...prev,
                    seriesId: val,
                  }));
                }}
              >
                <option value="all">
                  {!productFilters.publisherId || productFilters.publisherId === 'all'
                    ? 'All Series (Select Pub first)'
                    : 'All Series'}
                </option>
                {seriesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                value={productFilters.classification}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setProductFilters((prev) =>
                    prev.classification === val ? prev : { ...prev, classification: val }
                  );
                }}
              >
                <option value="all">All Classifications</option>
                <option value="book">Books (Syllabus, Textbooks)</option>
                <option value="notebook">Notebooks</option>
                <option value="register">Registers</option>
                <option value="stationery">Stationery & Writing</option>
                <option value="general">General Items</option>
              </select>

              <select
                className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                value={productFilters.categoryId}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductFilters((prev) =>
                    prev.categoryId === val ? prev : { ...prev, categoryId: val }
                  );
                }}
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                value={productFilters.stockStatus}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setProductFilters((prev) =>
                    prev.stockStatus === val ? prev : { ...prev, stockStatus: val }
                  );
                }}
              >
                <option value="all">All Stock Statuses</option>
                <option value="in_stock">In Stock (Sufficient)</option>
                <option value="low_stock">Low Stock (≤ Threshold)</option>
                <option value="out_of_stock">Out of Stock (Zero)</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <Table
            columns={productColumns}
            data={products}
            keyExtractor={(item) => item.id}
            isLoading={productsLoading}
            emptyMessage="No products match the selected filters. Click 'Add New Product' to register inventory."
          />

          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-2 text-xs text-slate-500">
            <span>
              Showing {products.length} records (Page size: 25)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={cursorHistory.length === 0 || productsLoading}
                onClick={() => {
                  const newHistory = [...cursorHistory];
                  newHistory.pop();
                  const prevCursor = newHistory[newHistory.length - 1] || null;
                  setCursorHistory(newHistory);
                  loadProducts(prevCursor, false);
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMoreProducts || productsLoading}
                onClick={() => loadProducts(productCursor, true)}
              >
                Next Page
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Stock Movement Audit History */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select
                className="text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                value={movementFilters.movementType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setMovementFilters((prev) =>
                    prev.movementType === val ? prev : { ...prev, movementType: val }
                  );
                }}
              >
                <option value="all">All Movements (IN / OUT)</option>
                <option value="in">Inflow (+ IN)</option>
                <option value="out">Outflow (- OUT)</option>
              </select>

              <select
                className="text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                value={movementFilters.reason}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setMovementFilters((prev) =>
                    prev.reason === val ? prev : { ...prev, reason: val }
                  );
                }}
              >
                <option value="all">All Reasons</option>
                <option value="purchase">Purchase Intake</option>
                <option value="adjustment">Physical Count Adjustment</option>
                <option value="damage">Damage / Loss</option>
                <option value="supplier_return">Supplier Return</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMovementCursorHistory([]);
                loadMovements(null);
              }}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh Audit Trail
            </Button>
          </div>

          {/* Table */}
          <Table
            columns={movementColumns}
            data={movements}
            keyExtractor={(item) => item.id}
            isLoading={movementsLoading}
            emptyMessage="No stock movements logged yet. Movements are logged automatically on purchase intake and manual stock adjustments."
          />

          {/* Pagination */}
          <div className="flex items-center justify-between px-2 text-xs text-slate-500">
            <span>
              Showing {movements.length} logged audit movements
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={movementCursorHistory.length === 0 || movementsLoading}
                onClick={() => {
                  const newHist = [...movementCursorHistory];
                  newHist.pop();
                  const prevCur = newHist[newHist.length - 1] || null;
                  setMovementCursorHistory(newHist);
                  loadMovements(prevCur, false);
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMoreMovements || movementsLoading}
                onClick={() => loadMovements(movementCursor, true)}
              >
                Next Page
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 3: Price List */}
      {activeTab === 'pricelist' && (
        <PriceListTable
          onPriceUpdated={() => {
            loadProducts(null);
            loadSummary();
          }}
        />
      )}

      {/* 6. Modals */}
      <ProductFormModal
        isOpen={isAddProductModalOpen}
        onClose={() => {
          setIsAddProductModalOpen(false);
          setEditingProduct(null);
        }}
        onSubmit={handleProductSubmit}
        initialData={editingProduct}
        categories={categories}
        isLoading={isSubmitting}
      />

      <ProductDetailModal
        isOpen={Boolean(viewingProduct)}
        onClose={() => setViewingProduct(null)}
        product={viewingProduct}
        onEdit={(prod) => {
          setEditingProduct(prod);
          setIsAddProductModalOpen(true);
        }}
        onViewHistory={(prod) => setHistoryProduct(prod)}
      />

      <ProductHistoryModal
        isOpen={Boolean(historyProduct)}
        onClose={() => setHistoryProduct(null)}
        product={historyProduct}
      />

      <StockAdjustmentModal
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
        products={products}
        selectedProductId={selectedProductForAdjustment}
        onSuccess={() => {
          success('Stock successfully adjusted and audit logged.');
          loadProducts(null);
          loadMovements(null);
          loadSummary();
        }}
      />

      <PublisherSeriesManagerModal
        isOpen={isPublisherModalOpen}
        onClose={() => setIsPublisherModalOpen(false)}
        onDataChanged={() => {
          loadProducts(null);
          getActivePublishers().then(setPublishersList);
          if (productFilters.publisherId && productFilters.publisherId !== 'all') {
            getActiveSeriesByPublisher(productFilters.publisherId).then(setSeriesList);
          }
        }}
      />
    </div>
  );
};
