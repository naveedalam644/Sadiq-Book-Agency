import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  DollarSign,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Receipt,
  ShieldAlert,
} from 'lucide-react';

import type { ExpenseDocument } from '../types/database';
import type { DateRange, ExpenseFilters, ExpenseReportData } from '../types/reports';

import { useAuth } from '../hooks/useAuth';
import { computeDateRange } from '../utils/datePresets';
import { formatCurrency, formatNumber } from '../utils/money';
import { downloadCsv } from '../utils/csvExport';

import {
  getExpensesReport,
  createExpense,
  updateExpense,
  deleteExpense,
  invalidateExpensesCache,
  ALL_EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type CreateExpenseInput,
} from '../services/expenseService';

import { DateRangeSelector } from '../components/reports/DateRangeSelector';
import { ReportSummaryCard } from '../components/reports/ReportSummaryCard';
import { ExportReportBar } from '../components/reports/ExportReportBar';

import { ExpenseFormModal } from '../components/expenses/ExpenseFormModal';
import { ExpenseDeleteModal } from '../components/expenses/ExpenseDeleteModal';
import { ExpenseTable } from '../components/expenses/ExpenseTable';
import { CategoryExpenseBreakdownCard } from '../components/expenses/CategoryExpenseBreakdownCard';

export const Expenses: React.FC = () => {
  const { isAdmin, currentUser } = useAuth();

  // Date Range (Default: This Month)
  const [dateRange, setDateRange] = useState<DateRange>(() => computeDateRange('this_month'));

  // Filter State
  const [filters, setFilters] = useState<ExpenseFilters>({
    category: 'all',
    paymentMode: 'all',
    searchTerm: '',
  });

  // Report & Loading State
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ExpenseReportData | null>(null);

  // Modal States
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDocument | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<ExpenseDocument | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Load Expenses Report
  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getExpensesReport(dateRange, filters);
      setReportData(data);
    } catch (err) {
      console.error('Failed to load expenses report:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, filters]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const handleRefresh = () => {
    invalidateExpensesCache();
    loadExpenses();
  };

  // Create / Update Handler
  const handleSaveExpense = async (input: CreateExpenseInput) => {
    if (!isAdmin) {
      alert('Unauthorized: Expense creation and editing is restricted to Administrators.');
      return;
    }
    setModalLoading(true);
    try {
      const uId = currentUser?.uid || 'admin';
      const uEmail = currentUser?.email || 'admin@sadiqbookagency.com';

      if (editingExpense) {
        await updateExpense(editingExpense.id, input, uId, uEmail);
      } else {
        await createExpense(input, uId, uEmail);
      }
      setFormModalOpen(false);
      setEditingExpense(null);
      await loadExpenses();
    } finally {
      setModalLoading(false);
    }
  };

  // Delete Handler
  const handleConfirmDelete = async () => {
    if (!isAdmin || !deletingExpense) return;
    setModalLoading(true);
    try {
      const uId = currentUser?.uid || 'admin';
      const uEmail = currentUser?.email || 'admin@sadiqbookagency.com';
      await deleteExpense(deletingExpense.id, uId, uEmail);
      setDeleteModalOpen(false);
      setDeletingExpense(null);
      await loadExpenses();
    } catch (err) {
      console.error('Error deleting expense:', err);
    } finally {
      setModalLoading(false);
    }
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    if (!reportData) return;
    const { summary, expenses } = reportData;

    downloadCsv<ExpenseDocument>({
      filename: `expenses_${dateRange.startDate}_${dateRange.endDate}`,
      title: 'Operating Expenses Report — Sadiq Book Agency',
      dateRange: dateRange.label,
      columns: [
        { key: 'expenseDate', label: 'Date' },
        { key: 'title', label: 'Title / Purpose' },
        {
          key: 'expenseCategory',
          label: 'Category',
          formatter: (cat) => EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat,
        },
        { key: 'paidTo', label: 'Paid To' },
        {
          key: 'paymentMode',
          label: 'Payment Mode',
          formatter: (pm) => (pm === 'cash' ? 'Cash Drawer' : 'Bank Transfer'),
        },
        { key: 'amount', label: 'Amount (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'referenceNo', label: 'Bill / Voucher #' },
        { key: 'notes', label: 'Notes' },
      ],
      data: expenses,
      summaryRows: [
        {
          'Total Operating Expenses': formatCurrency(summary.totalExpenses),
          'Cash Expenses (Drawer Outflow)': formatCurrency(summary.cashExpenses),
          'Bank Expenses (Account Outflow)': formatCurrency(summary.bankExpenses),
          'Total Transactions': formatNumber(summary.totalExpenseCount),
          'Average Expense Value': formatCurrency(summary.averageExpense),
        },
      ],
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#071F49] tracking-tight">Operating Expenses</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F5B51B]/20 text-[#071F49] border border-[#F5B51B]/40">
              Module 6.3 Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track, audit, and categorize day-to-day shop operating expenditures and billings
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                setFormModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#071F49] hover:bg-[#0c3172] text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Record Expense
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 font-semibold">
              <ShieldAlert className="w-4 h-4 text-slate-400" />
              <span>Admin Writes Only</span>
            </div>
          )}
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="print:hidden">
        <DateRangeSelector
          value={dateRange}
          onChange={(newRange) => setDateRange(newRange)}
          isLoading={loading}
        />
      </div>

      {/* Export Toolbar */}
      <ExportReportBar
        title="Operating Expenses Report"
        dateRangeLabel={dateRange.label}
        recordCount={reportData?.expenses.length}
        onExportCsv={handleExportCsv}
        isExporting={loading}
      />

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ReportSummaryCard
          title="Total Expenses"
          value={reportData?.summary.totalExpenses || 0}
          isCurrency
          variant="brand"
          icon={<Wallet className="w-5 h-5" />}
          loading={loading}
        />
        <ReportSummaryCard
          title="Cash Expenses"
          value={reportData?.summary.cashExpenses || 0}
          subtitle="Reduces drawer cash"
          isCurrency
          variant="danger"
          icon={<DollarSign className="w-5 h-5" />}
          loading={loading}
        />
        <ReportSummaryCard
          title="Bank Expenses"
          value={reportData?.summary.bankExpenses || 0}
          subtitle="Direct bank transfers"
          isCurrency
          variant="info"
          icon={<CreditCard className="w-5 h-5" />}
          loading={loading}
        />
        <ReportSummaryCard
          title="Total Transactions"
          value={reportData?.summary.totalExpenseCount || 0}
          subtitle={
            reportData?.summary.averageExpense
              ? `Avg: ${formatCurrency(reportData.summary.averageExpense)}`
              : 'Avg: PKR 0'
          }
          variant="neutral"
          icon={<Receipt className="w-5 h-5" />}
          loading={loading}
        />
      </div>

      {/* Category Breakdown Progress Card */}
      {reportData && reportData.categoryBreakdown.length > 0 && (
        <CategoryExpenseBreakdownCard
          categories={reportData.categoryBreakdown}
          totalExpenses={reportData.summary.totalExpenses}
        />
      )}

      {/* Secondary Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl print:hidden">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters:</span>
        </div>

        {/* Category Select */}
        <select
          value={filters.category}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              category: e.target.value as any,
            }))
          }
          className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
        >
          <option value="all">All Categories</option>
          {ALL_EXPENSE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {EXPENSE_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>

        {/* Payment Mode Select */}
        <select
          value={filters.paymentMode}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              paymentMode: e.target.value as any,
            }))
          }
          className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
        >
          <option value="all">All Payment Modes</option>
          <option value="cash">Cash Drawer Only</option>
          <option value="bank_transfer">Bank Transfer Only</option>
        </select>

        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search expense title, payee or voucher #..."
            value={filters.searchTerm || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))}
            className="w-full text-xs bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
          />
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl">
          <RefreshCw className="w-6 h-6 animate-spin text-[#071F49] mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600">Loading operating expenses...</p>
        </div>
      ) : (
        <ExpenseTable
          expenses={reportData?.expenses || []}
          isAdmin={isAdmin}
          onEdit={(exp) => {
            setEditingExpense(exp);
            setFormModalOpen(true);
          }}
          onDelete={(exp) => {
            setDeletingExpense(exp);
            setDeleteModalOpen(true);
          }}
        />
      )}

      {/* Add / Edit Modal */}
      <ExpenseFormModal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingExpense(null);
        }}
        onSubmit={handleSaveExpense}
        initialData={editingExpense}
        isLoading={modalLoading}
      />

      {/* Delete Confirmation Modal */}
      <ExpenseDeleteModal
        isOpen={deleteModalOpen}
        expense={deletingExpense}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeletingExpense(null);
        }}
        onConfirm={handleConfirmDelete}
        isLoading={modalLoading}
      />
    </div>
  );
};

