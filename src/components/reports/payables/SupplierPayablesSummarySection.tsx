import React from 'react';
import {
  Truck,
  CreditCard,
  CheckCircle2,
  Clock,
  Info,
} from 'lucide-react';
import type { SupplierPayablesSummary } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';

interface SupplierPayablesSummarySectionProps {
  summary: SupplierPayablesSummary;
  loading?: boolean;
}

export const SupplierPayablesSummarySection: React.FC<SupplierPayablesSummarySectionProps> = ({
  summary,
  loading = false,
}) => {
  const agingTotal =
    summary.agingSummary.current30 +
    summary.agingSummary.days31To60 +
    summary.agingSummary.days61To90 +
    summary.agingSummary.days90Plus;

  const getAgingPercent = (amount: number) => {
    if (agingTotal <= 0) return 0;
    return Math.round((amount / agingTotal) * 100);
  };

  return (
    <div className="space-y-4">
      {/* Information Header Alert */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-950 shadow-xs">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Authoritative Supplier Payables & Liability Accounting</p>
          <p className="text-amber-800 leading-relaxed">
            Payables reflect store liabilities owed to suppliers and book publishers, derived from authoritative supplier accounts and purchase invoice intake balances. Subsequent payments directly debit this liability with strict single-count segregation.
          </p>
        </div>
      </div>

      {/* Primary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Outstanding Payables */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">1. Total Payables</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-rose-600">
            {loading ? '...' : formatCurrency(summary.totalOutstandingPayables)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Creditor Suppliers:</span>
            <span className="font-bold text-slate-700">{formatNumber(summary.suppliersWithBalanceCount)}</span>
          </div>
        </div>

        {/* Card 2: Average Payable Liability */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">2. Average Balance</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-blue-900">
            {loading ? '...' : formatCurrency(summary.averagePayableBalance)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Across active creditors</span>
            <span className="font-medium text-slate-600">Per supplier</span>
          </div>
        </div>

        {/* Card 3: Unpaid Purchase Invoices */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">3. Open Invoices</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-amber-600">
            {loading ? '...' : formatNumber(summary.totalUnpaidInvoicesCount)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Invoices with remaining balance</span>
            <span className="font-bold text-amber-700">Open bills</span>
          </div>
        </div>

        {/* Card 4: Settled / Zero Balance Suppliers */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">4. Settled Suppliers</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-emerald-700">
            {loading ? '...' : formatNumber(summary.zeroBalanceSuppliersCount)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Total Suppliers:</span>
            <span className="font-bold text-slate-700">{formatNumber(summary.totalSuppliersCount)}</span>
          </div>
        </div>
      </div>

      {/* Payables Aging Distribution */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Supplier Payables Aging Distribution (FIFO)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Total Aged: <strong className="text-slate-800">{formatCurrency(agingTotal)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 0–30 Days */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900 mb-1">
              <span>0–30 Days (Current)</span>
              <span>{getAgingPercent(summary.agingSummary.current30)}%</span>
            </div>
            <div className="text-lg font-extrabold text-emerald-700">
              {formatCurrency(summary.agingSummary.current30)}
            </div>
            <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${getAgingPercent(summary.agingSummary.current30)}%` }}
              />
            </div>
          </div>

          {/* 31–60 Days */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 mb-1">
              <span>31–60 Days</span>
              <span>{getAgingPercent(summary.agingSummary.days31To60)}%</span>
            </div>
            <div className="text-lg font-extrabold text-blue-700">
              {formatCurrency(summary.agingSummary.days31To60)}
            </div>
            <div className="w-full bg-blue-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all"
                style={{ width: `${getAgingPercent(summary.agingSummary.days31To60)}%` }}
              />
            </div>
          </div>

          {/* 61–90 Days */}
          <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-1">
              <span>61–90 Days</span>
              <span>{getAgingPercent(summary.agingSummary.days61To90)}%</span>
            </div>
            <div className="text-lg font-extrabold text-amber-700">
              {formatCurrency(summary.agingSummary.days61To90)}
            </div>
            <div className="w-full bg-amber-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all"
                style={{ width: `${getAgingPercent(summary.agingSummary.days61To90)}%` }}
              />
            </div>
          </div>

          {/* 90+ Days */}
          <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs font-bold text-rose-900 mb-1">
              <span>90+ Days (Overdue)</span>
              <span>{getAgingPercent(summary.agingSummary.days90Plus)}%</span>
            </div>
            <div className="text-lg font-extrabold text-rose-600">
              {formatCurrency(summary.agingSummary.days90Plus)}
            </div>
            <div className="w-full bg-rose-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-rose-500 h-full rounded-full transition-all"
                style={{ width: `${getAgingPercent(summary.agingSummary.days90Plus)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

