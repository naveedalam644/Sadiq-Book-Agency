import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Eye,
  Edit,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Table, type Column } from '../components/common/Table';
import { SearchInput } from '../components/common/SearchInput';
import { SupplierFormModal } from '../components/suppliers/SupplierFormModal';
import { SupplierDetailModal } from '../components/suppliers/SupplierDetailModal';
import { PurchaseDetailModal } from '../components/purchases/PurchaseDetailModal';
import type { SupplierDocument, PurchaseDocument } from '../types/database';
import {
  getSuppliersPaginated,
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  type SupplierFilters,
} from '../services/supplierService';
import { formatCurrency } from '../utils/formatters';

export const Suppliers: React.FC = () => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [suppliers, setSuppliers] = useState<SupplierDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SupplierFilters>({
    status: 'all',
    searchTerm: '',
  });

  const [cursor, setCursor] = useState<any>(null);
  const [cursorHistory, setCursorHistory] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDocument | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<SupplierDocument | null>(null);
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

  const loadSuppliers = useCallback(
    async (cur: any = null, isNext = false, filtersToUse = filtersRef.current) => {
      setLoading(true);
      try {
        const res = await getSuppliersPaginated(filtersToUse, cur);
        setSuppliers(res.suppliers);
        setHasMore(res.hasMore);
        setCursor(res.lastDoc);

        if (isNext && cur) {
          setCursorHistory((prev) => [...prev, cur]);
        }
      } catch (err: any) {
        toastError(err?.message || 'Failed to load suppliers');
      } finally {
        setLoading(false);
      }
    },
    [toastError]
  );

  useEffect(() => {
    setCursorHistory([]);
    loadSuppliers(null, false, filters);
  }, [filters, loadSuppliers]);

  const handleSubmit = async (payload: any) => {
    setIsSubmitting(true);
    try {
      if (editingSupplier) {
        await updateSupplier(
          editingSupplier.id,
          payload,
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Supplier "${payload.companyName}" updated successfully.`);
      } else {
        await createSupplier(
          payload,
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Supplier "${payload.companyName}" registered successfully.`);
      }
      setIsFormModalOpen(false);
      setEditingSupplier(null);
      loadSuppliers(null);
    } catch (err: any) {
      toastError(err?.message || 'Failed to save supplier');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (supplier: SupplierDocument) => {
    try {
      const newStatus = !supplier.isActive;
      await toggleSupplierStatus(
        supplier.id,
        newStatus,
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );
      success(`Supplier "${supplier.companyName}" is now ${newStatus ? 'Active' : 'Inactive'}.`);
      loadSuppliers(null);
    } catch (err: any) {
      toastError(err?.message || 'Failed to update status');
    }
  };

  const columns: Column<SupplierDocument>[] = [
    {
      key: 'companyName',
      header: 'Supplier / Publishing House',
      render: (row) => (
        <div className="max-w-xs">
          <div
            className="font-bold text-slate-900 truncate hover:text-[#071F49] cursor-pointer"
            onClick={() => setViewingSupplier(row)}
          >
            {row.companyName}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            Contact: {row.contactPerson}
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Contact Numbers',
      render: (row) => (
        <div className="text-xs">
          <div className="font-semibold text-slate-800 flex items-center gap-1">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>{row.phone}</span>
          </div>
          {row.email && (
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate max-w-[150px]">
              <Mail className="w-3 h-3 text-slate-400" />
              <span>{row.email}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Warehouse Location',
      render: (row) => (
        <div className="text-xs text-slate-600 truncate max-w-xs flex items-center gap-1">
          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
          <span>{row.address || 'Address unlisted'}</span>
        </div>
      ),
    },
    {
      key: 'currentBalance',
      header: 'Payable Balance',
      align: 'right',
      render: (row) => (
        <span className={`font-mono text-xs font-bold ${row.currentBalance > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
          {formatCurrency(row.currentBalance)}
        </span>
      ),
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
            onClick={() => setViewingSupplier(row)}
            className="p-1.5 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="View Details & Purchase History"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingSupplier(row);
              setIsFormModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-lg transition"
            title="Edit Supplier"
          >
            <Edit className="w-4 h-4" />
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
            Suppliers & Publishing Houses
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Publishers, paper mills, and stationery distributors directory
          </p>
        </div>

        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            setEditingSupplier(null);
            setIsFormModalOpen(true);
          }}
          leftIcon={<Plus className="w-4 h-4 text-[#071F49]" />}
        >
          Register New Supplier
        </Button>
      </div>

      {/* Filters */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="w-full sm:max-w-md">
          <SearchInput
            placeholder="Search by company, contact person, or phone..."
            value={filters.searchTerm}
            onSearch={handleSearch}
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-[#F5B51B] w-full sm:w-auto"
            value={filters.status}
            onChange={(e) => {
              const val = e.target.value as any;
              setFilters((prev) => (prev.status === val ? prev : { ...prev, status: val }));
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Vendors</option>
            <option value="inactive">Deactivated Vendors</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={suppliers}
        keyExtractor={(item) => item.id}
        isLoading={loading}
        emptyMessage="No suppliers registered yet. Click 'Register New Supplier' to onboard publishing houses and vendors."
      />

      {/* Pagination */}
      <div className="flex items-center justify-between px-2 text-xs text-slate-500">
        <span>Showing {suppliers.length} records (Page size: 25)</span>
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
              loadSuppliers(prevCur, false);
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || loading}
            onClick={() => loadSuppliers(cursor, true)}
          >
            Next Page
          </Button>
        </div>
      </div>

      {/* Modals */}
      <SupplierFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingSupplier(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingSupplier}
        isLoading={isSubmitting}
      />

      <SupplierDetailModal
        isOpen={Boolean(viewingSupplier)}
        onClose={() => setViewingSupplier(null)}
        supplier={viewingSupplier}
        onEdit={(sup) => {
          setEditingSupplier(sup);
          setIsFormModalOpen(true);
        }}
        onViewPurchase={(pur) => setViewingPurchase(pur)}
      />

      <PurchaseDetailModal
        isOpen={Boolean(viewingPurchase)}
        onClose={() => setViewingPurchase(null)}
        purchase={viewingPurchase}
      />
    </div>
  );
};
