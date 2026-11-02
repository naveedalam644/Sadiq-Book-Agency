import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Eye,
  Building2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Table, type Column } from '../components/common/Table';
import { SearchInput } from '../components/common/SearchInput';
import { PurchaseFormModal } from '../components/purchases/PurchaseFormModal';
import { PurchaseDetailModal } from '../components/purchases/PurchaseDetailModal';
import type { PurchaseDocument, SupplierDocument, ProductDocument } from '../types/database';
import {
  getPurchasesPaginated,
  createPurchaseTransaction,
  type PurchaseFilters,
} from '../services/purchaseService';
import { getActiveSuppliersForDropdown } from '../services/supplierService';
import { getProductsPaginated } from '../services/productService';
import { formatCurrency, formatNumber } from '../utils/formatters';

export const Purchases: React.FC = () => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [purchases, setPurchases] = useState<PurchaseDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<PurchaseFilters>({
    supplierId: 'all',
    paymentMethod: 'all',
    searchTerm: '',
  });

  const [cursor, setCursor] = useState<any>(null);
  const [cursorHistory, setCursorHistory] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // Suppliers & Products for purchase intake form
  const [suppliers, setSuppliers] = useState<SupplierDocument[]>([]);
  const [products, setProducts] = useState<ProductDocument[]>([]);

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseDocument | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const handleSearch = useCallback((term: string) => {
    setFilters((prev) => {
      if (prev.searchTerm === term) return prev;
      return { ...prev, searchTerm: term };
    });
  }, []);

  // Load suppliers and initial products for modal dropdown on-demand
  const loadPrerequisites = useCallback(async () => {
    try {
      const [supList, prodRes] = await Promise.all([
        getActiveSuppliersForDropdown(),
        getProductsPaginated({ status: 'active' }, null, 50),
      ]);
      setSuppliers(supList);
      setProducts(prodRes.products);
    } catch (err) {
      console.error('Failed to load purchase prerequisites:', err);
    }
  }, []);

  const loadPurchases = useCallback(
    async (cur: any = null, isNext = false, filtersToUse = filtersRef.current) => {
      setLoading(true);
      try {
        const res = await getPurchasesPaginated(filtersToUse, cur);
        setPurchases(res.purchases);
        setHasMore(res.hasMore);
        setCursor(res.lastDoc);

        if (isNext && cur) {
          setCursorHistory((prev) => [...prev, cur]);
        }
      } catch (err: any) {
        toastError(err?.message || 'Failed to load purchase records');
      } finally {
        setLoading(false);
      }
    },
    [toastError]
  );

  useEffect(() => {
    setCursorHistory([]);
    loadPurchases(null, false, filters);
  }, [filters, loadPurchases]);

  const handleSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      const created = await createPurchaseTransaction(
        payload,
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );
      success(
        `Purchase "${created.purchaseInvoiceNo}" recorded. Stock inventory has been updated.`
      );
      setIsFormModalOpen(false);
      loadPurchases(null);
      loadPrerequisites(); // Refresh products with updated stock
    } catch (err: any) {
      toastError(err?.message || 'Failed to finalize purchase');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<PurchaseDocument>[] = [
    {
      key: 'purchaseInvoiceNo',
      header: 'Invoice # / Date',
      render: (row) => (
        <div>
          <span
            className="font-mono font-bold text-xs text-[#071F49] hover:underline cursor-pointer block"
            onClick={() => setViewingPurchase(row)}
          >
            {row.purchaseInvoiceNo}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {row.purchaseDate}
          </span>
        </div>
      ),
    },
    {
      key: 'supplierName',
      header: 'Supplier / Publisher',
      render: (row) => (
        <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5 truncate max-w-xs">
          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{row.supplierName}</span>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items Inflow',
      align: 'center',
      render: (row) => {
        const totalUnits = row.items.reduce((s, i) => s + i.quantity, 0);
        return (
          <div className="text-center">
            <span className="font-semibold text-xs text-slate-700">
              {row.items.length} titles
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              ({formatNumber(totalUnits)} units)
            </span>
          </div>
        );
      },
    },
    {
      key: 'grandTotal',
      header: 'Grand Total',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900">
          {formatCurrency(row.grandTotal)}
        </span>
      ),
    },
    {
      key: 'paidAmount',
      header: 'Paid Amount',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-emerald-700">
          {formatCurrency(row.paidAmount)}
        </span>
      ),
    },
    {
      key: 'remainingBalance',
      header: 'Remaining Balance',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono text-xs font-bold ${
            row.remainingBalance > 0 ? 'text-rose-700' : 'text-slate-400'
          }`}
        >
          {formatCurrency(row.remainingBalance)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Payment Mode',
      align: 'center',
      render: (row) => (
        <Badge
          variant={row.paymentMethod === 'cash' ? 'success' : row.paymentMethod === 'bank_transfer' ? 'info' : 'warning'}
          size="sm"
        >
          {row.paymentMethod.replace('_', ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setViewingPurchase(row)}
            className="p-1.5 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="View Itemized Invoice"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#071F49] tracking-tight">
            Purchase Orders & Stock Intake
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Supplier invoices, product intake receipts, and automatic stock updates
          </p>
        </div>

        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            loadPrerequisites();
            setIsFormModalOpen(true);
          }}
          leftIcon={<Plus className="w-4 h-4 text-[#071F49]" />}
        >
          New Purchase Invoice
        </Button>
      </div>

      {/* Filters */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="w-full md:max-w-md">
          <SearchInput
            placeholder="Search by invoice #, supplier, or product title..."
            value={filters.searchTerm}
            onSearch={handleSearch}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <select
            className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
            value={filters.paymentMethod}
            onChange={(e) => {
              const val = e.target.value as any;
              setFilters((prev) =>
                prev.paymentMethod === val ? prev : { ...prev, paymentMethod: val }
              );
            }}
          >
            <option value="all">All Payment Modes</option>
            <option value="cash">Cash Tender</option>
            <option value="bank_transfer">Bank Transfer / Cheque</option>
            <option value="credit">Supplier Credit</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={purchases}
        keyExtractor={(item) => item.id}
        isLoading={loading}
        emptyMessage="No purchase orders logged yet. Click 'New Purchase Invoice' to record incoming stock."
      />

      {/* Pagination */}
      <div className="flex items-center justify-between px-2 text-xs text-slate-500">
        <span>Showing {purchases.length} invoices (Page size: 25)</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursorHistory.length === 0 || loading}
            onClick={() => {
              const newHist = [...cursorHistory];
              newHist.pop();
              const prevCur = newHist[newHist.length - 1] || null;
              setCursorHistory(newHist);
              loadPurchases(prevCur, false);
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || loading}
            onClick={() => loadPurchases(cursor, true)}
          >
            Next Page
          </Button>
        </div>
      </div>

      {/* Form Modal */}
      <PurchaseFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleSubmit}
        suppliers={suppliers}
        products={products}
        isLoading={isSubmitting}
      />

      {/* Detail Modal */}
      <PurchaseDetailModal
        isOpen={Boolean(viewingPurchase)}
        onClose={() => setViewingPurchase(null)}
        purchase={viewingPurchase}
      />
    </div>
  );
};
