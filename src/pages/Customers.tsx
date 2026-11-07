import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Eye,
  Edit2,
  Users,
  Building2,
  Store,
  Wallet,
  Percent,
  TrendingDown,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Table, type Column } from '../components/common/Table';
import { SearchInput } from '../components/common/SearchInput';
import { CustomerFormModal } from '../components/customers/CustomerFormModal';
import { CustomerDetailModal } from '../components/customers/CustomerDetailModal';
import { ProductDiscountModal } from '../components/customers/ProductDiscountModal';
import { KhataPaymentModal } from '../components/customers/KhataPaymentModal';
import { CustomerBillModal } from '../components/customers/CustomerBillModal';
import { A4InvoiceModal } from '../components/pos/A4InvoiceModal';
import type { CustomerDocument, CustomerDiscountDocument, SaleDocument } from '../types/database';
import {
  getCustomersPaginated,
  createCustomer,
  updateCustomer,
  type CustomerFilters,
} from '../services/customerService';
import { formatCurrency } from '../utils/formatters';

export const Customers: React.FC = () => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [customers, setCustomers] = useState<CustomerDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<CustomerFilters>({
    type: 'all',
    status: 'all',
    balanceStatus: 'all',
    searchTerm: '',
  });

  const [cursor, setCursor] = useState<any>(null);
  const [cursorHistory, setCursorHistory] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerDocument | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<CustomerDocument | null>(null);
  const [discountModalCustomer, setDiscountModalCustomer] = useState<CustomerDocument | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<CustomerDiscountDocument | null>(null);
  const [paymentModalCustomer, setPaymentModalCustomer] = useState<CustomerDocument | null>(null);
  const [billModalCustomer, setBillModalCustomer] = useState<CustomerDocument | null>(null);
  const [createdBillSale, setCreatedBillSale] = useState<SaleDocument | null>(null);
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

  const loadCustomers = useCallback(
    async (cur: any = null, isNext = false, filtersToUse = filtersRef.current) => {
      setLoading(true);
      try {
        const res = await getCustomersPaginated(filtersToUse, cur);
        setCustomers(res.customers);
        setHasMore(res.hasMore);
        setCursor(res.lastDoc);

        if (isNext && cur) {
          setCursorHistory((prev) => [...prev, cur]);
        }
      } catch (err: any) {
        toastError(err?.message || 'Failed to load customer accounts');
      } finally {
        setLoading(false);
      }
    },
    [toastError]
  );

  useEffect(() => {
    setCursorHistory([]);
    loadCustomers(null, false, filters);
  }, [filters, loadCustomers]);

  const handleSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        const updated = await updateCustomer(
          editingCustomer.id,
          payload,
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Customer "${updated.name}" updated successfully.`);
      } else {
        const created = await createCustomer(
          payload,
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Customer "${created.name}" registered successfully.`);
      }
      setIsFormModalOpen(false);
      setEditingCustomer(null);
      loadCustomers(null);
    } catch (err: any) {
      toastError(err?.message || 'Failed to save customer account');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick stats computed from current view
  const totalUdhaar = customers.reduce((sum, c) => sum + Math.max(0, c.currentBalance || 0), 0);
  const totalAdvance = customers.reduce((sum, c) => sum + Math.abs(Math.min(0, c.currentBalance || 0)), 0);
  const wholesalerCount = customers.filter((c) => c.type === 'wholesaler').length;
  const marketshopCount = customers.filter((c) => c.type === 'marketshop').length;

  const columns: Column<CustomerDocument>[] = [
    {
      key: 'name',
      header: 'Customer / Shop Name',
      render: (row) => (
        <div>
          <span
            className="font-bold text-xs text-[#071F49] hover:underline cursor-pointer block"
            onClick={() => setViewingCustomer(row)}
          >
            {row.shopName ? `${row.shopName}` : row.name}
          </span>
          {row.shopName && (
            <span className="text-[11px] text-slate-500 block mt-0.5">Contact: {row.name}</span>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      align: 'center',
      render: (row) => (
        <Badge
          variant={
            row.type === 'wholesaler'
              ? 'info'
              : row.type === 'marketshop'
              ? 'gold'
              : 'neutral'
          }
          size="sm"
        >
          {row.type === 'wholesaler'
            ? 'WHOLESALER'
            : row.type === 'marketshop'
            ? 'MARKETSHOP'
            : 'PARCHON'}
        </Badge>
      ),
    },
    {
      key: 'phone',
      header: 'Phone & City',
      render: (row) => (
        <div>
          <span className="font-mono text-xs text-slate-800 block">{row.phone || '—'}</span>
          <span className="text-[11px] text-slate-400 block">{row.city || 'Sukkur'}</span>
        </div>
      ),
    },
    {
      key: 'discountPercentage',
      header: 'Base Disc %',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-slate-700">
          {row.discountPercentage ? `${row.discountPercentage}%` : '0%'}
        </span>
      ),
    },
    {
      key: 'creditLimit',
      header: 'Credit Limit',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs text-slate-600">
          {formatCurrency(row.creditLimit || 0)}
        </span>
      ),
    },
    {
      key: 'currentBalance',
      header: 'Khata Balance',
      align: 'right',
      render: (row) => {
        const bal = row.currentBalance || 0;
        return (
          <div className="text-right">
            <span
              className={`font-mono text-xs font-bold ${
                bal > 0 ? 'text-rose-700' : bal < 0 ? 'text-sky-700' : 'text-slate-400'
              }`}
            >
              {formatCurrency(bal)}
            </span>
            <span className="text-[10px] block text-slate-400">
              {bal > 0 ? 'Udhaar' : bal < 0 ? 'Advance' : 'Cleared'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.type !== 'parchon' && (
            <>
              <button
                type="button"
                onClick={() => setBillModalCustomer(row)}
                className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                title="Create Khata Credit Bill"
              >
                <Receipt className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setPaymentModalCustomer(row)}
                className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                title="Record Khata Payment Receipt"
              >
                <Wallet className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setDiscountModalCustomer(row);
              setEditingDiscount(null);
            }}
            className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
            title="Assign Product-Wise Custom Discount"
          >
            <Percent className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setViewingCustomer(row)}
            className="p-1.5 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="View 360 Profile & Ledger"
          >
            <Eye className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingCustomer(row);
              setIsFormModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            title="Edit Customer"
          >
            <Edit2 className="w-4 h-4" />
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
            Customer Management & Khata Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Wholesaler accounts, marketshop clients, custom product discounts, and double-entry Khata balances
          </p>
        </div>

        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            setEditingCustomer(null);
            setIsFormModalOpen(true);
          }}
          leftIcon={<Plus className="w-4 h-4 text-[#071F49]" />}
        >
          Add New Customer
        </Button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Accounts</span>
            <Users className="w-4 h-4 text-[#071F49]" />
          </div>
          <div className="font-mono text-xl font-black text-[#071F49] mt-1">
            {customers.length}
          </div>
          <span className="text-[10px] text-slate-400">Current page view</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Wholesalers</span>
            <Building2 className="w-4 h-4 text-sky-600" />
          </div>
          <div className="font-mono text-xl font-black text-sky-700 mt-1">
            {wholesalerCount}
          </div>
          <span className="text-[10px] text-slate-400">Bulk trade accounts</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Marketshops</span>
            <Store className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-mono text-xl font-black text-amber-700 mt-1">
            {marketshopCount}
          </div>
          <span className="text-[10px] text-slate-400">Local stationery shops</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Total Udhaar</span>
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <div className="font-mono text-xl font-black text-rose-700 mt-1">
            {formatCurrency(totalUdhaar)}
          </div>
          <span className="text-[10px] text-slate-400">
            {totalAdvance > 0 ? `Advance: ${formatCurrency(totalAdvance)}` : 'Accounts receivable'}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="w-full md:max-w-md">
          <SearchInput
            placeholder="Search by name, shop, phone, city..."
            value={filters.searchTerm}
            onSearch={handleSearch}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          {/* Customer Type Filter */}
          <select
            className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
            value={filters.type}
            onChange={(e) => {
              const val = e.target.value as any;
              setFilters((prev) => (prev.type === val ? prev : { ...prev, type: val }));
            }}
          >
            <option value="all">All Customer Types</option>
            <option value="wholesaler">Wholesaler</option>
            <option value="marketshop">Marketshop</option>
            <option value="parchon">Parchon (Retail)</option>
          </select>

          {/* Balance Status Filter */}
          <select
            className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
            value={filters.balanceStatus}
            onChange={(e) => {
              const val = e.target.value as any;
              setFilters((prev) => (prev.balanceStatus === val ? prev : { ...prev, balanceStatus: val }));
            }}
          >
            <option value="all">All Khata Balances</option>
            <option value="has_balance">Has Udhaar (Balance &gt; 0)</option>
            <option value="zero_balance">Cleared (Balance = 0)</option>
            <option value="advance">Advance Deposit (Balance &lt; 0)</option>
          </select>

          {/* Active Status */}
          <select
            className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B]"
            value={filters.status}
            onChange={(e) => {
              const val = e.target.value as any;
              setFilters((prev) => (prev.status === val ? prev : { ...prev, status: val }));
            }}
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={customers}
        keyExtractor={(item) => item.id}
        isLoading={loading}
        emptyMessage="No customers found matching your criteria. Click 'Add New Customer' to register a client."
      />

      {/* Pagination */}
      <div className="flex items-center justify-between px-2 text-xs text-slate-500">
        <span>Showing {customers.length} customer accounts (Page size: 25)</span>
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
              loadCustomers(prevCur, false);
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || loading}
            onClick={() => loadCustomers(cursor, true)}
          >
            Next Page
          </Button>
        </div>
      </div>

      {/* Add / Edit Form Modal */}
      <CustomerFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingCustomer(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingCustomer}
        isLoading={isSubmitting}
      />

      {/* Detail / 360 View Modal */}
      <CustomerDetailModal
        isOpen={Boolean(viewingCustomer)}
        onClose={() => setViewingCustomer(null)}
        customer={viewingCustomer}
        onOpenPaymentModal={(c) => {
          setPaymentModalCustomer(c);
        }}
        onOpenDiscountModal={(c, d) => {
          setDiscountModalCustomer(c);
          setEditingDiscount(d || null);
        }}
      />

      {/* Product-Specific Discount Modal */}
      <ProductDiscountModal
        isOpen={Boolean(discountModalCustomer)}
        onClose={() => {
          setDiscountModalCustomer(null);
          setEditingDiscount(null);
        }}
        customer={discountModalCustomer}
        initialDiscount={editingDiscount}
        onSuccess={() => {
          success('Customer product discount rule saved.');
          if (viewingCustomer) {
            // refresh viewing customer data
            loadCustomers(null);
          }
        }}
      />

      {/* Khata Payment Modal */}
      <KhataPaymentModal
        isOpen={Boolean(paymentModalCustomer)}
        onClose={() => setPaymentModalCustomer(null)}
        customer={paymentModalCustomer}
        onSuccess={() => {
          success('Khata payment receipt recorded and balance updated atomically.');
          loadCustomers(null);
          if (viewingCustomer) {
            setViewingCustomer(null);
          }
        }}
      />

      {/* Customer Khata Direct Bill Modal */}
      <CustomerBillModal
        isOpen={Boolean(billModalCustomer)}
        onClose={() => setBillModalCustomer(null)}
        customer={billModalCustomer}
        onSuccess={(sale) => {
          success(`Credit bill ${sale.invoiceNo} successfully created and posted to customer Khata.`);
          loadCustomers(null);
          setCreatedBillSale(sale);
        }}
      />

      {/* Newly Created Credit Bill Invoice Modal (with Print + WhatsApp Share) */}
      <A4InvoiceModal
        isOpen={Boolean(createdBillSale)}
        onClose={() => setCreatedBillSale(null)}
        sale={createdBillSale}
      />
    </div>
  );
};
