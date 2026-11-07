import React from 'react';
import {
  TrendingUp,
  Package,
  Layers,
  Percent,
  Wallet,
  AlertCircle,
  Info,
} from 'lucide-react';
import type { ProfitLossSummary } from '../../../types/reports';
import { formatCurrency } from '../../../utils/money';

interface ProfitLossSummarySectionProps {
  summary: ProfitLossSummary;
  loading?: boolean;
}

export const ProfitLossSummarySection: React.FC<ProfitLossSummarySectionProps> = ({
  summary,
  loading = false,
}) => {
  const isOperatingProfitPositive = summary.operatingProfit >= 0;
  const isGrossProfitPositive = summary.grossProfit >= 0;

  return (
    <div className="space-y-4">
      {/* Statutory Accounting Disclaimer Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-blue-900 shadow-xs">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Operating Profit & Loss Statement (Management View)</p>
          <p className="text-blue-800 leading-relaxed">
            {summary.disclosureNote}
          </p>
        </div>
      </div>

      {/* Missing Historical Cost Disclosure (if applicable) */}
      {summary.missingCostItemCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-900 shadow-xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Historical Cost Data Notice</p>
            <p className="text-amber-800 leading-relaxed">
              {summary.missingCostItemCount} sold item unit(s) across {summary.missingCostSalesCount} invoice(s) have unrecorded historical cost prices. In compliance with bookstore accounting rules, Net COGS reflects recorded cost history only without retroactively substituting current catalog prices.
            </p>
          </div>
        </div>
      )}

      {/* Main 5-Metric Financial Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Net Sales */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">1. Net Sales</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-[#071F49]">
            {loading ? '...' : formatCurrency(summary.netSales)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Gross: {formatCurrency(summary.grossSales)}</span>
            <span className="text-rose-600">Ret: -{formatCurrency(summary.salesReturns)}</span>
          </div>
        </div>

        {/* Card 2: Net COGS */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">2. Net COGS</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-800">
            {loading ? '...' : formatCurrency(summary.netCOGS)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Gross: {formatCurrency(summary.grossCOGS)}</span>
            <span className="text-emerald-700">Rev: -{formatCurrency(summary.returnedCOGS)}</span>
          </div>
        </div>

        {/* Card 3: Gross Profit & Margin */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">3. Gross Profit</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isGrossProfitPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-extrabold ${isGrossProfitPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
            {loading ? '...' : formatCurrency(summary.grossProfit)}
          </div>
          <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between border-t border-slate-100 pt-1.5 font-semibold">
            <span className="flex items-center gap-1">
              <Percent className="w-3 h-3 text-slate-400" /> Margin:
            </span>
            <span className={isGrossProfitPositive ? 'text-emerald-700' : 'text-rose-600'}>
              {loading ? '...' : `${summary.grossProfitMargin}%`}
            </span>
          </div>
        </div>

        {/* Card 4: Operating Expenses */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">4. Operating Exp.</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-900">
            {loading ? '...' : formatCurrency(summary.totalOperatingExpenses)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Cash: {formatCurrency(summary.cashExpenses)}</span>
            <span>Bank: {formatCurrency(summary.bankExpenses)}</span>
          </div>
        </div>

        {/* Card 5: Operating Profit (Key Bottom Line) */}
        <div className={`border rounded-2xl p-4 shadow-sm relative overflow-hidden ${
          isOperatingProfitPositive
            ? 'bg-gradient-to-br from-emerald-50 to-teal-50/40 border-emerald-300'
            : 'bg-gradient-to-br from-rose-50 to-red-50/40 border-rose-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-black uppercase tracking-wider ${
              isOperatingProfitPositive ? 'text-emerald-900' : 'text-rose-900'
            }`}>
              5. Operating Profit
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
              isOperatingProfitPositive
                ? 'bg-emerald-200/60 text-emerald-900'
                : 'bg-rose-200/60 text-rose-900'
            }`}>
              {isOperatingProfitPositive ? 'Surplus' : 'Deficit'}
            </span>
          </div>
          <div className={`text-2xl font-black ${
            isOperatingProfitPositive ? 'text-emerald-800' : 'text-rose-700'
          }`}>
            {loading ? '...' : formatCurrency(summary.operatingProfit)}
          </div>
          <div className={`mt-2 text-[11px] font-bold flex items-center justify-between border-t pt-1.5 ${
            isOperatingProfitPositive ? 'border-emerald-200 text-emerald-800' : 'border-rose-200 text-rose-800'
          }`}>
            <span>Operating Margin:</span>
            <span>{loading ? '...' : `${summary.operatingProfitMargin}%`}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
