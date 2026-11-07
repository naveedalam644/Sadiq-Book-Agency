import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Plus,
  Edit,
  Trash2,
  Printer,
  Receipt,
  ShoppingCart,
  Truck,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Table, type Column } from '../components/common/Table';
import { SearchInput } from '../components/common/SearchInput';
import { RoughBillModal } from '../components/roughBill/RoughBillModal';
import { RoughBillPrintModal } from '../components/roughBill/RoughBillPrintModal';
import type { RoughBillDocument, RoughBillType } from '../types/database';
import { getRoughBills, deleteRoughBill } from '../services/roughBillService';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { formatCurrency, formatNumber } from '../utils/formatters';

export const RoughBill: React.FC = () => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [bills, setBills] = useState<RoughBillDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterType, setFilterType] = useState<RoughBillType | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<RoughBillDocument | null>(null);
  const [viewingBill, setViewingBill] = useState<RoughBillDocument | null>(null);

  const loadBills = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getRoughBills({
        billType: filterType,
        searchTerm,
      });
      setBills(data);
    } catch (err: any) {
      toastError(err?.message || 'Failed to load rough bills');
    } finally {
      setIsLoading(false);
    }
  }, [filterType, searchTerm, toastError]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  // Delete handler
  const handleDelete = async (bill: RoughBillDocument) => {
    if (!window.confirm(`Delete rough bill "${bill.billNo}" for ${bill.partyName}?`)) {
      return;
    }
    try {
      await deleteRoughBill(
        bill.id,
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );
      success(`Rough bill ${bill.billNo} deleted.`);
      loadBills();
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete rough bill');
    }
  };

  // Stats
  const stats = useMemo(() => {
    let customerEstimates = 0;
    let publisherOrders = 0;
    let totalEstimatedValue = 0;

    for (const b of bills) {
      if (b.billType === 'publisher_order') {
        publisherOrders++;
      } else {
        customerEstimates++;
      }
      totalEstimatedValue += (b.grandTotal || 0);
    }

    return {
      total: bills.length,
      customerEstimates,
      publisherOrders,
      totalEstimatedValue,
    };
  }, [bills]);

  const columns: Column<RoughBillDocument>[] = [
    {
      key: 'billNo',
      header: 'Bill No & Date',
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#071F49] block">
            {row.billNo}
          </span>
          <span className="text-[11px] text-slate-500 block">
            {row.date}
          </span>
        </div>
      ),
    },
    {
      key: 'billType',
      header: 'Type',
      align: 'center',
      render: (row) =>
        row.billType === 'publisher_order' ? (
          <Badge variant="warning" size="sm">
            📦 Publisher Order
          </Badge>
        ) : (
          <Badge variant="info" size="sm">
            📋 Customer Estimate
          </Badge>
        ),
    },
    {
      key: 'partyName',
      header: 'Customer / Publisher Name',
      render: (row) => (
        <div>
          <span className="font-bold text-slate-900 block">{row.partyName}</span>
          <div className="text-[11px] text-slate-500">
            {row.title && <span>{row.title} • </span>}
            {row.phone && <span>{row.phone}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'itemCount',
      header: 'Items Count',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-700">
          {row.items?.length || 0} Products
        </span>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Estimated Total',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-sm font-black text-[#071F49]">
          {formatCurrency(row.grandTotal)}
        </span>
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
            onClick={() => setViewingBill(row)}
            className="p-1.5 text-slate-500 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="View & Print Rough Bill"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingBill(row);
              setIsCreateModalOpen(true);
            }}
            className="p-1.5 text-slate-500 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="Edit Rough Bill"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            title="Delete Rough Bill"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <NavLink to="/" className="hover:text-[#071F49] transition">
            Dashboard
          </NavLink>
          <span>/</span>
          <span className="font-semibold text-slate-800">
            Rough Bills & Quotations
          </span>
        </div>

        <div className="flex items-center gap-3">
          <NavLink
            to="/pos"
            className="inline-flex items-center gap-1 font-semibold text-[#071F49] hover:underline"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Open POS Register</span>
            <ArrowRight className="w-3 h-3" />
          </NavLink>
        </div>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#071F49] text-[#F5B51B] rounded-xl shadow-xs">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#071F49]">
              Rough Bills & Quotations
            </h1>
            <p className="text-xs text-slate-500">
              Create customer quotations or publisher purchase orders without affecting shop inventory
            </p>
          </div>
        </div>

        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            setEditingBill(null);
            setIsCreateModalOpen(true);
          }}
          leftIcon={<Plus className="w-4 h-4 text-[#071F49]" />}
        >
          Create New Rough Bill
        </Button>
      </div>

      {/* Summary Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Customer Estimates
            </span>
            <div className="text-xl font-black text-[#071F49] font-mono mt-0.5">
              {formatNumber(stats.customerEstimates)}
            </div>
          </div>
          <div className="p-2.5 bg-blue-50 text-[#071F49] rounded-xl">
            <ShoppingCart className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Publisher Orders
            </span>
            <div className="text-xl font-black text-amber-700 font-mono mt-0.5">
              {formatNumber(stats.publisherOrders)}
            </div>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
            <Truck className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-[#071F49] text-white rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Total Estimated Value
            </span>
            <div className="text-xl font-black text-[#F5B51B] font-mono mt-0.5">
              {formatCurrency(stats.totalEstimatedValue)}
            </div>
          </div>
          <div className="p-2.5 bg-white/10 text-[#F5B51B] rounded-xl">
            <Layers className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              filterType === 'all'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Rough Bills
          </button>
          <button
            type="button"
            onClick={() => setFilterType('customer_quotation')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              filterType === 'customer_quotation'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Customer Estimates
          </button>
          <button
            type="button"
            onClick={() => setFilterType('publisher_order')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              filterType === 'publisher_order'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Publisher Orders
          </button>
        </div>

        <div className="w-full sm:w-72">
          <SearchInput
            value={searchTerm}
            onSearch={setSearchTerm}
            placeholder="Search by party, bill no, phone..."
            className="w-full"
          />
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={bills}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        emptyMessage="No rough bills or quotations found."
      />

      {/* Modals */}
      <RoughBillModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingBill(null);
        }}
        editingBill={editingBill}
        onSaved={loadBills}
      />

      <RoughBillPrintModal
        isOpen={Boolean(viewingBill)}
        onClose={() => setViewingBill(null)}
        bill={viewingBill}
      />
    </div>
  );
};
