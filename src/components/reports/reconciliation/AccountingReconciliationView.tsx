import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Scale,
  ShieldCheck,
  Info,
  Building,
  TrendingUp,
  DollarSign,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  FullAccountingReconciliationData,
  ReconciliationItem,
} from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';

interface AccountingReconciliationViewProps {
  data: FullAccountingReconciliationData | null;
  loading?: boolean;
}

export const AccountingReconciliationView: React.FC<AccountingReconciliationViewProps> = ({
  data,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
        <Scale className="w-8 h-8 text-[#071F49] animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-700">Calculating and auditing full accounting equations...</p>
        <p className="text-xs text-slate-400 mt-1">Cross-referencing Sales, Returns, P&L, Intake Purchases, Customer Receivables, Supplier Payables, and Cash Drawer.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-500">No reconciliation data available. Please select a date range and refresh.</p>
      </div>
    );
  }

  const { isAllBalanced, totalDiscrepancy, items, disclosures, summary } = data;

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'sales':
        return <TrendingUp className="w-4 h-4 text-blue-600" />;
      case 'profit_loss':
        return <DollarSign className="w-4 h-4 text-emerald-600" />;
      case 'purchases':
        return <Truck className="w-4 h-4 text-amber-600" />;
      case 'receivables':
        return <Users className="w-4 h-4 text-indigo-600" />;
      case 'payables':
        return <Building className="w-4 h-4 text-purple-600" />;
      case 'cash_flow':
      case 'cash_drawer':
        return <Wallet className="w-4 h-4 text-teal-600" />;
      default:
        return <Scale className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Global Reconciliation Audit Banner */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isAllBalanced
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            : 'bg-rose-50/80 border-rose-200 text-rose-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isAllBalanced ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
              }`}
            >
              {isAllBalanced ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold tracking-tight">
                  {isAllBalanced
                    ? 'Full Accounting Reconciliation: 100% Balanced'
                    : 'Reconciliation Discrepancy Detected'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    isAllBalanced
                      ? 'bg-emerald-200/60 text-emerald-900 border border-emerald-300'
                      : 'bg-rose-200/60 text-rose-900 border border-rose-300'
                  }`}
                >
                  {isAllBalanced ? 'Zero Variance' : 'Audit Required'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {isAllBalanced
                  ? 'All 8 mathematical accounting equations balance identically. Double-entry integrity confirmed across sales, returns, COGS, expenses, receivables, payables, and cash flow.'
                  : `Total net variance across financial equations: PKR ${formatCurrency(totalDiscrepancy)}.`}
              </p>
            </div>
          </div>

          <div className="sm:text-right shrink-0 bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Cumulative Discrepancy
            </span>
            <span
              className={`text-base font-black ${
                isAllBalanced ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              PKR {totalDiscrepancy.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Mathematical Equations Verification Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#071F49]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Mathematical Equation Verification (Formulas A through G)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            <strong>{formatNumber(items.filter((i) => i.isBalanced).length)}</strong> of{' '}
            <strong>{formatNumber(items.length)}</strong> equations balanced
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {items.map((item: ReconciliationItem) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden break-inside-avoid"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {item.categoryLabel}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">
                      {item.title}
                    </h4>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.isBalanced
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {item.isBalanced ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                  )}
                  {item.statusText}
                </span>
              </div>

              {/* Equation Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 my-2.5 font-mono text-xs text-slate-800 flex items-center justify-between">
                <div className="truncate">
                  <span className="text-slate-500 text-[10px] block font-sans">Calculated Equation</span>
                  <span className="font-bold text-slate-900">{item.formula}</span>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <span className="text-slate-400 text-[10px] block font-sans">Variance</span>
                  <span
                    className={`font-extrabold ${
                      item.difference === 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    PKR {item.difference.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Term Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                <div>
                  <span className="text-slate-500 block truncate">{item.leftTermLabel}</span>
                  <strong className="text-slate-800 font-extrabold">
                    {formatCurrency(item.leftValue)}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block truncate">{item.rightTermLabel}</span>
                  <strong className="text-slate-800 font-extrabold">
                    {formatCurrency(item.rightValue)}
                  </strong>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 mt-2 border-t border-slate-100 pt-1.5 italic">
                {item.explanation}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Consolidated Cross-Pillar Financial Summary Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden break-inside-avoid">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-[#071F49]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Cross-Module Financial Summary Snapshot
            </h3>
          </div>
          <span className="text-xs text-slate-500">All amounts in PKR</span>
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Gross Sales:</span>
            <span className="text-sm font-bold text-slate-900">{formatCurrency(summary.grossSales)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Sales Returns:</span>
            <span className="text-sm font-bold text-rose-600">{formatCurrency(summary.salesReturns)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Net Revenue:</span>
            <span className="text-sm font-extrabold text-blue-900">{formatCurrency(summary.netSales)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Net COGS:</span>
            <span className="text-sm font-bold text-slate-800">{formatCurrency(summary.netCOGS)}</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Gross Profit:</span>
            <span className="text-sm font-extrabold text-emerald-700">{formatCurrency(summary.grossProfit)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Operating Expenses:</span>
            <span className="text-sm font-bold text-rose-600">{formatCurrency(summary.operatingExpenses)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Operating Profit:</span>
            <span
              className={`text-sm font-extrabold ${
                summary.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {formatCurrency(summary.operatingProfit)}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Purchase Intake Value:</span>
            <span className="text-sm font-bold text-slate-900">{formatCurrency(summary.purchaseGrandTotal)}</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Customer Receivables:</span>
            <span className="text-sm font-extrabold text-amber-600">
              {formatCurrency(summary.customerReceivablesTotal)}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Customer Advances:</span>
            <span className="text-sm font-bold text-emerald-700">
              {formatCurrency(summary.customerAdvancesTotal)}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Supplier Payables:</span>
            <span className="text-sm font-extrabold text-rose-600">
              {formatCurrency(summary.supplierPayablesTotal)}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[11px] block">Closing Cash Drawer:</span>
            <span className="text-sm font-extrabold text-teal-800">
              {formatCurrency(summary.expectedClosingCash)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Mandatory Accounting Disclosures Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 break-inside-avoid">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
          <Info className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Mandatory Accounting Policies, Disclosures & Scope Limitations
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {disclosures.map((disc) => (
            <div
              key={disc.id}
              className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 text-xs space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <h4 className="font-bold text-slate-900">{disc.title}</h4>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      disc.tag === 'disclaimer'
                        ? 'bg-rose-100 text-rose-800'
                        : disc.tag === 'architecture'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {disc.tag}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-500 mb-1.5">Scope: {disc.scope}</p>
                <p className="text-slate-700 text-[11px] leading-relaxed">{disc.disclosure}</p>
              </div>
              <div className="pt-2 border-t border-slate-200/60 text-[10px] text-slate-500">
                <strong className="text-slate-700">Accounting Impact:</strong> {disc.impact}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
