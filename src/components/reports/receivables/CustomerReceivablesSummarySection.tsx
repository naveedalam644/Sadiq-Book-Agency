import React from 'react';
import {
  Users,
  AlertTriangle,
  CreditCard,
  Clock,
  CheckCircle2,
  Info,
} from 'lucide-react';
import type { CustomerReceivablesSummary } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';

interface CustomerReceivablesSummarySectionProps {
  summary: CustomerReceivablesSummary;
  loading?: boolean;
}

export const CustomerReceivablesSummarySection: React.FC<CustomerReceivablesSummarySectionProps> = ({
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
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-blue-950 shadow-xs">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Authoritative Customer Khata Receivables & Aging</p>
          <p className="text-blue-800 leading-relaxed">
            Receivables are derived directly from authoritative customer accounts and transactional ledger entries.
            Overdue amounts are calculated strictly using customer-configured credit terms (creditDays). Standard accounts without specified terms are labeled accordingly without artificial due dates.
          </p>
        </div>
      </div>

      {/* Primary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Outstanding Receivables */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">1. Total Receivables</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-amber-600">
            {loading ? '...' : formatCurrency(summary.totalOutstandingReceivables)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Debtors: {formatNumber(summary.customersWithBalanceCount)}</span>
            <span>Avg: {formatCurrency(summary.averageReceivableBalance)}</span>
          </div>
        </div>

        {/* Card 2: Total Credit Limit & Utilization */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">2. Credit Limit</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-indigo-700">
            {loading ? '...' : formatCurrency(summary.totalCreditLimit)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Utilization:</span>
            <span
              className={`font-bold ${
                summary.overallCreditUtilizationPct > 80
                  ? 'text-rose-600'
                  : summary.overallCreditUtilizationPct > 50
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            >
              {summary.overallCreditUtilizationPct}%
            </span>
          </div>
        </div>

        {/* Card 3: Overdue Receivables */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">3. Overdue Amount</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                summary.totalOverdueAmount > 0
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-xl font-extrabold ${
              summary.totalOverdueAmount > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {loading ? '...' : formatCurrency(summary.totalOverdueAmount)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Term-tracked debt</span>
            <span className="text-xs font-medium">
              {summary.totalOverdueAmount > 0 ? 'Requires follow-up' : 'All terms current'}
            </span>
          </div>
        </div>

        {/* Card 4: Customer Advance Balances */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">4. Customer Advances</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-emerald-700">
            {loading ? '...' : formatCurrency(summary.totalAdvanceAmount)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Advance accounts:</span>
            <span className="font-bold text-slate-700">{formatNumber(summary.advanceCustomersCount)}</span>
          </div>
        </div>

        {/* Card 5: Account Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">5. Total Accounts</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-blue-900">
            {loading ? '...' : formatNumber(summary.totalCustomersCount)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Zero balance:</span>
            <span className="font-bold text-slate-700">{formatNumber(summary.zeroBalanceCustomersCount)}</span>
          </div>
        </div>
      </div>

      {/* Aging Distribution Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Receivables Aging Breakdown (FIFO)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Total Aged: <strong className="text-slate-800">{formatCurrency(agingTotal)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Current: 0–30 Days */}
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

        {/* Customer Category Pills */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-500">Category Breakdown:</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-medium">
            Wholesale: <strong className="text-slate-800">{formatCurrency(summary.wholesalerReceivables)}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-medium">
            Marketshops: <strong className="text-slate-800">{formatCurrency(summary.marketshopReceivables)}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-medium">
            Parchon: <strong className="text-slate-800">{formatCurrency(summary.parchonReceivables)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};

