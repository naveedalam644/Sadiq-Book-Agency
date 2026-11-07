import React from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Info,
} from 'lucide-react';
import type { CashFlowSummary } from '../../../types/reports';
import { formatCurrency } from '../../../utils/money';

interface CashFlowSummarySectionProps {
  summary: CashFlowSummary;
  openingFloat: number;
  onOpeningFloatChange?: (newFloat: number) => void;
  loading?: boolean;
}

export const CashFlowSummarySection: React.FC<CashFlowSummarySectionProps> = ({
  summary,
  openingFloat,
  onOpeningFloatChange,
  loading = false,
}) => {
  const isNetCashPositive = summary.netPhysicalCashFlow >= 0;
  const isNetBankPositive = summary.netBankFlow >= 0;

  return (
    <div className="space-y-4">
      {/* Information Header Alert */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-emerald-950 shadow-xs">
        <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Actual Cash & Drawer Inflow Accounting</p>
          <p className="text-emerald-800 leading-relaxed">
            This report reflects verified cash and bank movements recorded through POS checkouts, customer Khata debt settlements, sales refunds, operating expenses, and inventory purchases. Unpaid credit sales are strictly excluded until collected.
          </p>
        </div>
      </div>

      {/* 5-Metric Financial Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Physical Cash Inflows */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">1. Cash Inflows</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-emerald-700">
            {loading ? '...' : formatCurrency(summary.totalCashInflows)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Sales: {formatCurrency(summary.directCashSales)}</span>
            <span>Khata: {formatCurrency(summary.customerCashRecoveries)}</span>
          </div>
        </div>

        {/* Card 2: Physical Cash Outflows */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">2. Cash Outflows</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-rose-600">
            {loading ? '...' : formatCurrency(summary.totalCashOutflows)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>Exp: {formatCurrency(summary.cashOperatingExpenses)}</span>
            <span>Purch: {formatCurrency(summary.cashSupplierPurchases)}</span>
          </div>
        </div>

        {/* Card 3: Net Cash Drawer Flow */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">3. Net Cash Flow</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isNetCashPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-extrabold ${isNetCashPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
            {loading ? '...' : formatCurrency(summary.netPhysicalCashFlow)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5 font-semibold">
            <span>Refunds:</span>
            <span className="text-rose-600">-{formatCurrency(summary.cashSalesRefunds)}</span>
          </div>
        </div>

        {/* Card 4: Expected Closing Cash Drawer */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 border border-blue-300 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#071F49]">
              4. Drawer Cash
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-bold">Float:</span>
              <input
                type="number"
                min="0"
                step="500"
                value={openingFloat}
                onChange={(e) => onOpeningFloatChange?.(Number(e.target.value) || 0)}
                className="w-16 px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-bold text-slate-800 text-right focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                title="Adjust Opening Cash Float"
              />
            </div>
          </div>
          <div className="text-2xl font-black text-[#071F49]">
            {loading ? '...' : formatCurrency(summary.expectedClosingDrawerCash)}
          </div>
          <div className="mt-2 text-[11px] text-blue-900 font-bold flex items-center justify-between border-t border-blue-200 pt-1.5">
            <span>Float + Net Flow:</span>
            <span>{formatCurrency(openingFloat)} + {formatCurrency(summary.netPhysicalCashFlow)}</span>
          </div>
        </div>

        {/* Card 5: Bank & Digital Position */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">5. Bank Position</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-extrabold ${isNetBankPositive ? 'text-blue-700' : 'text-slate-700'}`}>
            {loading ? '...' : formatCurrency(summary.netBankFlow)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span className="text-emerald-700">In: +{formatCurrency(summary.totalBankInflows)}</span>
            <span className="text-rose-600">Out: -{formatCurrency(summary.totalBankOutflows)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
