import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  X,
  TrendingUp,
  Truck,
  RotateCcw,
  Package,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  FileText,
  PackageCheck,
  PackageX,
  Building,
  Users,
  CheckCircle2,
  Clock,
  ArrowDownCircle,
} from 'lucide-react';
import type { ProductDocument } from '../../types/database';
import {
  getProductHistory,
  fetchProductSalesPage,
  fetchProductPurchasesPage,
  fetchProductReturnsPage,
  fetchProductMovementsPage,
  computeHistorySummary,
  type ProductSaleRecord,
  type ProductPurchaseRecord,
  type ProductSaleReturnRecord,
  type ProductMovementRecord,
  type ProductHistorySummary,
  type ProductHistoryFilters,
} from '../../services/productHistoryService';
import { formatCurrency, formatNumber } from '../../utils/money';

export interface ProductHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDocument | null;
}

export const ProductHistoryModal: React.FC<ProductHistoryModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases' | 'returns' | 'overview'>('sales');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Independent Data Streams
  const [sales, setSales] = useState<ProductSaleRecord[]>([]);
  const [salesCursor, setSalesCursor] = useState<any>(null);
  const [salesHasMore, setSalesHasMore] = useState(false);
  const [loadingMoreSales, setLoadingMoreSales] = useState(false);

  const [purchases, setPurchases] = useState<ProductPurchaseRecord[]>([]);
  const [purchasesCursor, setPurchasesCursor] = useState<any>(null);
  const [purchasesHasMore, setPurchasesHasMore] = useState(false);
  const [loadingMorePurchases, setLoadingMorePurchases] = useState(false);

  const [returns, setReturns] = useState<ProductSaleReturnRecord[]>([]);
  const [returnsCursor, setReturnsCursor] = useState<any>(null);
  const [returnsHasMore, setReturnsHasMore] = useState(false);
  const [loadingMoreReturns, setLoadingMoreReturns] = useState(false);

  const [movements, setMovements] = useState<ProductMovementRecord[]>([]);
  const [movementsCursor, setMovementsCursor] = useState<any>(null);
  const [movementsHasMore, setMovementsHasMore] = useState(false);
  const [loadingMoreMovements, setLoadingMoreMovements] = useState(false);

  const [summary, setSummary] = useState<ProductHistorySummary | null>(null);

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  // Client-side sub-pagination per tab (10 items per page from loaded list)
  const [salesPage, setSalesPage] = useState(1);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [returnsPage, setReturnsPage] = useState(1);
  const [movementsPage, setMovementsPage] = useState(1);
  const PAGE_SIZE = 10;

  const loadHistory = useCallback(
    async (force = false) => {
      if (!product) return;
      setLoading(true);
      setError(null);
      try {
        const filters: ProductHistoryFilters = {
          startDate: startDate ? startDate : undefined,
          endDate: endDate ? endDate : undefined,
          invoiceSearch: invoiceSearch.trim() ? invoiceSearch.trim() : undefined,
          customerId: customerFilter.trim() ? customerFilter.trim() : undefined,
          supplierId: supplierFilter.trim() ? supplierFilter.trim() : undefined,
        };

        const initial = await getProductHistory(product.id, filters, force);

        setSales(initial.sales);
        setSalesCursor(initial.salesCursor);
        setSalesHasMore(initial.salesHasMore);

        setPurchases(initial.purchases);
        setPurchasesCursor(initial.purchasesCursor);
        setPurchasesHasMore(initial.purchasesHasMore);

        setReturns(initial.returns);
        setReturnsCursor(initial.returnsCursor);
        setReturnsHasMore(initial.returnsHasMore);

        setMovements(initial.movements);
        setMovementsCursor(initial.movementsCursor);
        setMovementsHasMore(initial.movementsHasMore);

        setSummary(initial.summary);
      } catch (err: any) {
        console.error('Failed to load product history:', err);
        setError(err.message || 'Failed to retrieve product history.');
      } finally {
        setLoading(false);
      }
    },
    [product, startDate, endDate, invoiceSearch, customerFilter, supplierFilter]
  );

  useEffect(() => {
    if (isOpen && product) {
      loadHistory();
    }
  }, [isOpen, product, loadHistory]);

  // Reset pagination on tab or filter change
  useEffect(() => {
    setSalesPage(1);
    setPurchasesPage(1);
    setReturnsPage(1);
    setMovementsPage(1);
  }, [activeTab, startDate, endDate, invoiceSearch, customerFilter, supplierFilter]);

  // Load More Handlers for Cursor-Based Pagination
  const handleLoadMoreSales = async () => {
    if (!product || !salesCursor || loadingMoreSales) return;
    setLoadingMoreSales(true);
    try {
      const filters: ProductHistoryFilters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        invoiceSearch: invoiceSearch.trim() || undefined,
        customerId: customerFilter.trim() || undefined,
      };
      const result = await fetchProductSalesPage(product.id, salesCursor, filters);
      const existingIds = new Set(sales.map((s) => `${s.saleId}_${s.originalUnitPrice}_${s.quantitySold}`));
      const newItems = result.sales.filter((s) => !existingIds.has(`${s.saleId}_${s.originalUnitPrice}_${s.quantitySold}`));
      const updated = [...sales, ...newItems];

      setSales(updated);
      setSalesCursor(result.lastDoc);
      setSalesHasMore(result.hasMore);
      setSummary(computeHistorySummary(product, updated, purchases, returns, result.hasMore, purchasesHasMore, returnsHasMore));
    } catch (err: any) {
      console.warn('Failed to load more sales:', err);
    } finally {
      setLoadingMoreSales(false);
    }
  };

  const handleLoadMorePurchases = async () => {
    if (!product || !purchasesCursor || loadingMorePurchases) return;
    setLoadingMorePurchases(true);
    try {
      const filters: ProductHistoryFilters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        invoiceSearch: invoiceSearch.trim() || undefined,
        supplierId: supplierFilter.trim() || undefined,
      };
      const result = await fetchProductPurchasesPage(product.id, purchasesCursor, filters);
      const existingIds = new Set(purchases.map((p) => `${p.purchaseId}_${p.quantityPurchased}`));
      const newItems = result.purchases.filter((p) => !existingIds.has(`${p.purchaseId}_${p.quantityPurchased}`));
      const updated = [...purchases, ...newItems];

      setPurchases(updated);
      setPurchasesCursor(result.lastDoc);
      setPurchasesHasMore(result.hasMore);
      setSummary(computeHistorySummary(product, sales, updated, returns, salesHasMore, result.hasMore, returnsHasMore));
    } catch (err: any) {
      console.warn('Failed to load more purchases:', err);
    } finally {
      setLoadingMorePurchases(false);
    }
  };

  const handleLoadMoreReturns = async () => {
    if (!product || !returnsCursor || loadingMoreReturns) return;
    setLoadingMoreReturns(true);
    try {
      const filters: ProductHistoryFilters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        invoiceSearch: invoiceSearch.trim() || undefined,
        customerId: customerFilter.trim() || undefined,
      };
      const result = await fetchProductReturnsPage(product.id, returnsCursor, filters);
      const existingIds = new Set(returns.map((r) => `${r.returnId}_${r.returnNo}`));
      const newItems = result.returns.filter((r) => !existingIds.has(`${r.returnId}_${r.returnNo}`));
      const updated = [...returns, ...newItems];

      setReturns(updated);
      setReturnsCursor(result.lastDoc);
      setReturnsHasMore(result.hasMore);
      setSummary(computeHistorySummary(product, sales, purchases, updated, salesHasMore, purchasesHasMore, result.hasMore));
    } catch (err: any) {
      console.warn('Failed to load more returns:', err);
    } finally {
      setLoadingMoreReturns(false);
    }
  };

  const handleLoadMoreMovements = async () => {
    if (!product || !movementsCursor || loadingMoreMovements) return;
    setLoadingMoreMovements(true);
    try {
      const result = await fetchProductMovementsPage(product.id, movementsCursor);
      const existingIds = new Set(movements.map((m) => m.id));
      const newItems = result.movements.filter((m) => !existingIds.has(m.id));
      const updated = [...movements, ...newItems];

      setMovements(updated);
      setMovementsCursor(result.lastDoc);
      setMovementsHasMore(result.hasMore);
    } catch (err: any) {
      console.warn('Failed to load more movements:', err);
    } finally {
      setLoadingMoreMovements(false);
    }
  };

  if (!isOpen || !product) return null;

  // Filtered views for table display
  const displaySales = sales.filter((s) => {
    if (!customerFilter.trim()) return true;
    const term = customerFilter.trim().toLowerCase();
    return s.customerName.toLowerCase().includes(term);
  });

  const displayPurchases = purchases.filter((p) => {
    if (!supplierFilter.trim()) return true;
    const term = supplierFilter.trim().toLowerCase();
    return p.supplierName.toLowerCase().includes(term);
  });

  const displayReturns = returns.filter((r) => {
    if (!customerFilter.trim()) return true;
    const term = customerFilter.trim().toLowerCase();
    return r.customerName.toLowerCase().includes(term);
  });

  // Client-side pagination slices of loaded records
  const paginatedSales = displaySales.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE);
  const totalSalesPages = Math.max(1, Math.ceil(displaySales.length / PAGE_SIZE));

  const paginatedPurchases = displayPurchases.slice((purchasesPage - 1) * PAGE_SIZE, purchasesPage * PAGE_SIZE);
  const totalPurchasesPages = Math.max(1, Math.ceil(displayPurchases.length / PAGE_SIZE));

  const paginatedReturns = displayReturns.slice((returnsPage - 1) * PAGE_SIZE, returnsPage * PAGE_SIZE);
  const totalReturnsPages = Math.max(1, Math.ceil(displayReturns.length / PAGE_SIZE));

  const paginatedMovements = movements.slice((movementsPage - 1) * PAGE_SIZE, movementsPage * PAGE_SIZE);
  const totalMovementsPages = Math.max(1, Math.ceil(movements.length / PAGE_SIZE));

  const isLowStock = product.currentStock <= (product.lowStockThreshold || 5);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setInvoiceSearch('');
    setCustomerFilter('');
    setSupplierFilter('');
  };

  const hasActiveFilters = Boolean(startDate || endDate || invoiceSearch || customerFilter || supplierFilter);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#071F49] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-amber-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base tracking-tight">{product.title}</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/20 text-white">
                  {product.sku}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  {product.classification}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Publisher: <strong className="text-white">{product.publisherName || 'Unknown'}</strong>
                {product.seriesName && (
                  <> • Series: <strong className="text-[#F5B51B]">{product.seriesName}</strong></>
                )}
                {(product.notebookSize || product.notebookSheets || product.notebookGrammage) && (
                  <> • Specs: <strong className="text-[#F5B51B]">{[product.notebookSize, product.notebookSheets ? `${product.notebookSheets} Sheets` : '', product.notebookGrammage].filter(Boolean).join(' • ')}</strong></>
                )}
                {' '}• Category: <strong className="text-white">{product.categoryName || 'General'}</strong>
                {product.shelfLocation && ` • Location: ${product.shelfLocation}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadHistory(true)}
              disabled={loading}
              title="Refresh Historical Data"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close History"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Summary Completeness Disclosure Banner */}
          <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-1.5 rounded-xl border text-xs">
            {summary?.isLifetimeComplete ? (
              <div className="flex items-center gap-2 text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Complete Lifetime Activity Verified (All {sales.length} sales, {purchases.length} purchases, {returns.length} returns loaded)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-900 font-medium bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  Loaded Activity Window ({sales.length} sales, {purchases.length} purchases, {returns.length} returns loaded). Click <strong>&quot;Load More&quot;</strong> in any tab to extend lifetime coverage.
                </span>
              </div>
            )}
            <span className="text-[11px] text-slate-500 font-medium">
              Physical On-Hand Stock: <strong className="text-slate-900 font-mono">{product.currentStock} {product.unit || 'pcs'}</strong>
            </span>
          </div>

          {/* Top Historical Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {/* Current Physical Stock on Hand */}
            <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Current Stock
                </span>
                <Package className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2">
                <div className="text-lg font-black text-white">
                  {formatNumber(product.currentStock)} <span className="text-xs font-normal text-slate-300">{product.unit || 'pcs'}</span>
                </div>
                <div className="text-[10px] mt-0.5">
                  {isLowStock ? (
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Low (≤{product.lowStockThreshold || 5})
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">Available on shelf</span>
                  )}
                </div>
              </div>
            </div>

            {/* Total Purchases */}
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  Purchases ({purchases.length})
                </span>
                <Truck className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2">
                <div className="text-base font-black text-blue-900">
                  {formatNumber(summary?.totalQuantityPurchased || 0)} <span className="text-xs font-normal text-blue-700">units</span>
                </div>
                <div className="text-[10px] text-blue-800 font-medium mt-0.5">
                  Cost: {formatCurrency(summary?.totalPurchaseCost || 0)}
                </div>
              </div>
            </div>

            {/* Gross Sales */}
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Gross Sales ({sales.length})
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2">
                <div className="text-base font-black text-emerald-900">
                  {formatNumber(summary?.totalQuantitySold || 0)} <span className="text-xs font-normal text-emerald-700">units</span>
                </div>
                <div className="text-[10px] text-emerald-800 font-medium mt-0.5">
                  Revenue: {formatCurrency(summary?.totalGrossSales || 0)}
                </div>
              </div>
            </div>

            {/* Customer Returns */}
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  Returns ({returns.length})
                </span>
                <RotateCcw className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2">
                <div className="text-base font-black text-rose-900">
                  {formatNumber(summary?.totalQuantityReturned || 0)} <span className="text-xs font-normal text-rose-700">units</span>
                </div>
                <div className="text-[10px] text-rose-800 font-medium mt-0.5">
                  Refund: {formatCurrency(summary?.totalSalesReturns || 0)}
                </div>
              </div>
            </div>

            {/* Net Turnover Revenue */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex flex-col justify-between col-span-2 sm:col-span-4 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Net Turnover
                </span>
                <FileText className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2">
                <div className="text-base font-black text-amber-900">
                  {formatCurrency(summary?.netSales || 0)}
                </div>
                <div className="text-[10px] text-amber-800 font-medium mt-0.5">
                  Net Qty: {formatNumber((summary?.totalQuantitySold || 0) - (summary?.totalQuantityReturned || 0))} units
                </div>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold shrink-0">
                <Filter className="w-3.5 h-3.5 text-[#071F49]" />
                <span>Filters:</span>
              </div>

              {/* Date Range Start */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                />
              </div>

              {/* Date Range End */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                />
              </div>

              {/* Invoice Number Search */}
              <div className="relative min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search invoice / bill #..."
                  className="w-full pl-7 pr-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                />
              </div>

              {/* Customer Filter */}
              {(activeTab === 'sales' || activeTab === 'returns' || activeTab === 'overview') && (
                <div className="relative min-w-[150px]">
                  <Users className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={customerFilter}
                    onChange={(e) => setCustomerFilter(e.target.value)}
                    placeholder="Filter customer..."
                    className="w-full pl-7 pr-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                  />
                </div>
              )}

              {/* Supplier Filter */}
              {(activeTab === 'purchases' || activeTab === 'overview') && (
                <div className="relative min-w-[150px]">
                  <Building className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={supplierFilter}
                    onChange={(e) => setSupplierFilter(e.target.value)}
                    placeholder="Filter supplier..."
                    className="w-full pl-7 pr-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                  />
                </div>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 border border-slate-300 bg-white text-[11px] font-bold transition cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'sales'
                  ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sales History ({displaySales.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'purchases'
                  ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-blue-600" />
              <span>Purchase History ({displayPurchases.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('returns')}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'returns'
                  ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>Returns History ({displayReturns.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              <span>All Movements Timeline ({movements.length})</span>
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#071F49] mx-auto" />
              <p className="font-semibold text-xs">Loading product history page...</p>
              <p className="text-[11px] text-slate-400">Executing bounded Firestore cursor reads.</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => loadHistory(true)}
                className="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg text-xs"
              >
                Retry
              </button>
            </div>
          )}

          {/* Data Displays */}
          {!loading && !error && (
            <div>
              {/* TAB 1: SALES HISTORY */}
              {activeTab === 'sales' && (
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                          <th className="py-2.5 px-3">Date & Time</th>
                          <th className="py-2.5 px-3">Invoice #</th>
                          <th className="py-2.5 px-3">Customer</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3 text-right">Qty</th>
                          <th className="py-2.5 px-3 text-right">Catalog Rate</th>
                          <th className="py-2.5 px-3 text-right">Discount</th>
                          <th className="py-2.5 px-3 text-right">Actual Rate</th>
                          <th className="py-2.5 px-3 text-right">Line Total</th>
                          <th className="py-2.5 px-3 text-center">Payment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {paginatedSales.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-10 text-center text-slate-400">
                              No sales records found for this product matching your filters.
                            </td>
                          </tr>
                        ) : (
                          paginatedSales.map((sale, idx) => (
                            <tr key={`${sale.saleId}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                {new Date(sale.createdAt || sale.saleDate).toLocaleDateString('en-PK', {
                                  dateStyle: 'short',
                                })}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {sale.invoiceNo}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[140px] truncate" title={sale.customerName}>
                                {sale.customerName}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    sale.customerType === 'wholesaler'
                                      ? 'bg-blue-100 text-blue-800'
                                      : sale.customerType === 'marketshop'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {sale.customerType}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                {formatNumber(sale.quantitySold)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                                {formatCurrency(sale.originalUnitPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                {sale.discountRate > 0 ? `${sale.discountRate}%` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                {formatCurrency(sale.actualSellingPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">
                                {formatCurrency(sale.lineTotal)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold capitalize ${
                                    sale.paymentStatus === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : sale.paymentStatus === 'partial'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {sale.paymentStatus} ({sale.paymentMethod})
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Sales Pagination Bar & Cursor Load More */}
                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span>
                        Showing {displaySales.length > 0 ? (salesPage - 1) * PAGE_SIZE + 1 : 0}–
                        {Math.min(salesPage * PAGE_SIZE, displaySales.length)} of {displaySales.length} loaded records
                      </span>
                      {salesHasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMoreSales}
                          disabled={loadingMoreSales}
                          className="px-3 py-1 bg-[#071F49] hover:bg-[#0c2f6d] text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          <ArrowDownCircle className={`w-3.5 h-3.5 ${loadingMoreSales ? 'animate-spin' : ''}`} />
                          <span>{loadingMoreSales ? 'Loading More...' : 'Load Next 25 Sales'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> All historical sales loaded
                        </span>
                      )}
                    </div>

                    {totalSalesPages > 1 && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={salesPage === 1}
                          onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                          className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Prev
                        </button>
                        <span className="px-2 py-1 font-mono text-slate-700">
                          {salesPage} / {totalSalesPages}
                        </span>
                        <button
                          type="button"
                          disabled={salesPage >= totalSalesPages}
                          onClick={() => setSalesPage((p) => p + 1)}
                          className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: PURCHASE HISTORY */}
              {activeTab === 'purchases' && (
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                          <th className="py-2.5 px-3">Purchase Date</th>
                          <th className="py-2.5 px-3">Bill / Invoice #</th>
                          <th className="py-2.5 px-3">Supplier / Publisher</th>
                          <th className="py-2.5 px-3 text-right">Qty Received</th>
                          <th className="py-2.5 px-3 text-right">Unit Cost</th>
                          <th className="py-2.5 px-3 text-right">Total Line Cost</th>
                          <th className="py-2.5 px-3 text-center">Settlement Status</th>
                          <th className="py-2.5 px-3 text-center">Payment Mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {paginatedPurchases.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-10 text-center text-slate-400">
                              No purchase intake records found for this product matching your filters.
                            </td>
                          </tr>
                        ) : (
                          paginatedPurchases.map((pur, idx) => (
                            <tr key={`${pur.purchaseId}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                {new Date(pur.createdAt || pur.purchaseDate).toLocaleDateString('en-PK', {
                                  dateStyle: 'short',
                                })}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {pur.purchaseInvoiceNo}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[180px] truncate" title={pur.supplierName}>
                                {pur.supplierName}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                +{formatNumber(pur.quantityPurchased)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                                {formatCurrency(pur.unitCost)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-blue-900">
                                {formatCurrency(pur.totalCost)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    pur.remainingBalance <= 0
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {pur.remainingBalance <= 0 ? 'Fully Paid' : `Unpaid (PKR ${formatCurrency(pur.remainingBalance)})`}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center capitalize text-slate-600 font-semibold">
                                {pur.paymentMethod}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Purchases Pagination Bar & Cursor Load More */}
                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span>
                        Showing {displayPurchases.length > 0 ? (purchasesPage - 1) * PAGE_SIZE + 1 : 0}–
                        {Math.min(purchasesPage * PAGE_SIZE, displayPurchases.length)} of {displayPurchases.length} loaded records
                      </span>
                      {purchasesHasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMorePurchases}
                          disabled={loadingMorePurchases}
                          className="px-3 py-1 bg-[#071F49] hover:bg-[#0c2f6d] text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          <ArrowDownCircle className={`w-3.5 h-3.5 ${loadingMorePurchases ? 'animate-spin' : ''}`} />
                          <span>{loadingMorePurchases ? 'Loading More...' : 'Load Next 25 Purchases'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> All historical purchases loaded
                        </span>
                      )}
                    </div>

                    {totalPurchasesPages > 1 && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={purchasesPage === 1}
                          onClick={() => setPurchasesPage((p) => Math.max(1, p - 1))}
                          className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Prev
                        </button>
                        <span className="px-2 py-1 font-mono text-slate-700">
                          {purchasesPage} / {totalPurchasesPages}
                        </span>
                        <button
                          type="button"
                          disabled={purchasesPage >= totalPurchasesPages}
                          onClick={() => setPurchasesPage((p) => p + 1)}
                          className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: RETURNS HISTORY */}
              {activeTab === 'returns' && (
                <div className="space-y-4">
                  {/* Sales Returns Table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-xs uppercase tracking-wide text-slate-800 flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                        <span>Customer Sales Returns ({displayReturns.length})</span>
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        Direct retrieval from salesReturns collection • Saleable & Damaged
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                            <th className="py-2.5 px-3">Return Date</th>
                            <th className="py-2.5 px-3">Return #</th>
                            <th className="py-2.5 px-3">Original Invoice #</th>
                            <th className="py-2.5 px-3">Customer</th>
                            <th className="py-2.5 px-3 text-right">Qty Returned</th>
                            <th className="py-2.5 px-3 text-right">Original Rate</th>
                            <th className="py-2.5 px-3 text-right">Refund Amount</th>
                            <th className="py-2.5 px-3 text-center">Refund Method</th>
                            <th className="py-2.5 px-3 text-center">Restock Condition</th>
                            <th className="py-2.5 px-3">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {paginatedReturns.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="py-10 text-center text-slate-400">
                                No sales return records found for this product.
                              </td>
                            </tr>
                          ) : (
                            paginatedReturns.map((ret, idx) => (
                              <tr key={`${ret.returnId}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                  {new Date(ret.createdAt || ret.returnDate).toLocaleDateString('en-PK', {
                                    dateStyle: 'short',
                                  })}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {ret.returnNo}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                                  {ret.originalInvoiceNo}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[130px] truncate" title={ret.customerName}>
                                  {ret.customerName}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-rose-800">
                                  -{formatNumber(ret.quantityReturned)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                  {formatCurrency(ret.originalSellingPrice)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-black text-rose-900">
                                  {formatCurrency(ret.refundAmount)}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      ret.refundMethod === 'cash'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                                    }`}
                                  >
                                    {ret.refundMethod === 'cash' ? 'Cash Refund' : 'Khata Credit'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {ret.condition === 'saleable' ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <PackageCheck className="w-3 h-3 text-emerald-600" />
                                      Saleable (Restocked)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                      <PackageX className="w-3 h-3 text-rose-600" />
                                      Damaged (Quarantined)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 max-w-[160px] truncate" title={ret.reason}>
                                  {ret.reason}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Returns Pagination Bar & Cursor Load More */}
                    <div className="flex items-center justify-between text-xs text-slate-600 pt-1 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span>
                          Showing {displayReturns.length > 0 ? (returnsPage - 1) * PAGE_SIZE + 1 : 0}–
                          {Math.min(returnsPage * PAGE_SIZE, displayReturns.length)} of {displayReturns.length} loaded records
                        </span>
                        {returnsHasMore ? (
                          <button
                            type="button"
                            onClick={handleLoadMoreReturns}
                            disabled={loadingMoreReturns}
                            className="px-3 py-1 bg-[#071F49] hover:bg-[#0c2f6d] text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                          >
                            <ArrowDownCircle className={`w-3.5 h-3.5 ${loadingMoreReturns ? 'animate-spin' : ''}`} />
                            <span>{loadingMoreReturns ? 'Loading More...' : 'Load Next 25 Returns'}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> All historical returns loaded
                          </span>
                        )}
                      </div>

                      {totalReturnsPages > 1 && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={returnsPage === 1}
                            onClick={() => setReturnsPage((p) => Math.max(1, p - 1))}
                            className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                          >
                            Prev
                          </button>
                          <span className="px-2 py-1 font-mono text-slate-700">
                            {returnsPage} / {totalReturnsPages}
                          </span>
                          <button
                            type="button"
                            disabled={returnsPage >= totalReturnsPages}
                            onClick={() => setReturnsPage((p) => p + 1)}
                            className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 5: Purchase Returns Disclosure Card */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">
                        Supplier Purchase Returns
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        None recorded (Purchase returns are not tracked in the current system). Standard accounting disclosure D1: return debit notes to suppliers are currently tracked as zero.
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 shrink-0">
                      Standard Disclosure D1
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 4: ALL MOVEMENTS TIMELINE */}
              {activeTab === 'overview' && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs flex items-center justify-between">
                    <span>
                      Authoritative inventory movement timeline (+ Inflows, − Outflows). Sourced directly from stockMovements ledger.
                    </span>
                    <span className="font-bold font-mono">
                      Current Stock on Hand: {product.currentStock} {product.unit || 'pcs'}
                    </span>
                  </div>

                  {movements.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 border border-slate-200 rounded-xl">
                      No stock movement audit records found for this product.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                      {paginatedMovements.map((mov, idx) => (
                        <div key={`${mov.id}-${idx}`} className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                mov.movementType === 'in'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {mov.reason === 'purchase' ? (
                                <Truck className="w-3.5 h-3.5" />
                              ) : mov.reason === 'sale' ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : mov.reason === 'customer_return' ? (
                                <RotateCcw className="w-3.5 h-3.5" />
                              ) : (
                                <Package className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-xs font-mono">
                                  {mov.referenceDocId || mov.id}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(mov.createdAt).toLocaleDateString('en-PK', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                                  {mov.reason.replace('_', ' ')}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-600 block mt-0.5">
                                Stock shift: {mov.previousStock} → <strong>{mov.newStock}</strong> {product.unit || 'pcs'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span
                              className={`text-sm font-black font-mono block ${
                                mov.movementType === 'in' ? 'text-blue-700' : 'text-emerald-700'
                              }`}
                            >
                              {mov.movementType === 'in' ? `+${mov.quantity}` : `-${mov.quantity}`} {product.unit || 'pcs'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Movements Pagination Bar & Cursor Load More */}
                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span>
                        Showing {movements.length > 0 ? (movementsPage - 1) * PAGE_SIZE + 1 : 0}–
                        {Math.min(movementsPage * PAGE_SIZE, movements.length)} of {movements.length} loaded movements
                      </span>
                      {movementsHasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMoreMovements}
                          disabled={loadingMoreMovements}
                          className="px-3 py-1 bg-[#071F49] hover:bg-[#0c2f6d] text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          <ArrowDownCircle className={`w-3.5 h-3.5 ${loadingMoreMovements ? 'animate-spin' : ''}`} />
                          <span>{loadingMoreMovements ? 'Loading More...' : 'Load Next 25 Movements'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> All historical movements loaded
                        </span>
                      )}
                    </div>

                    {totalMovementsPages > 1 && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={movementsPage === 1}
                          onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                          className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Prev
                        </button>
                        <span className="px-2 py-1 font-mono text-slate-700">
                          {movementsPage} / {totalMovementsPages}
                        </span>
                        <button
                          type="button"
                          disabled={movementsPage >= totalMovementsPages}
                          onClick={() => setMovementsPage((p) => p + 1)}
                          className="px-2.5 py-1 border border-slate-300 rounded bg-white font-bold disabled:opacity-40 cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            Data derived from historical invoice, intake and return snapshots. Current product rate: <strong className="text-slate-800">{formatCurrency(product.retailPrice)}</strong>.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
