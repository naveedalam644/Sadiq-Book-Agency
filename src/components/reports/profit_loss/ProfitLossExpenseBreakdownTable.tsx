import React from 'react';
import type { ProfitLossCategoryExpense } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';

interface ProfitLossExpenseBreakdownTableProps {
  data: ProfitLossCategoryExpense[];
  totalOperatingExpenses?: number;
}

export const ProfitLossExpenseBreakdownTable: React.FC<ProfitLossExpenseBreakdownTableProps> = ({
  data,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">
          No operating expenses recorded for this period.
        </p>
      </div>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({
      count: acc.count + row.count,
      cash: acc.cash + row.cashAmount,
      bank: acc.bank + row.bankAmount,
      total: acc.total + row.totalAmount,
    }),
    { count: 0, cash: 0, bank: 0, total: 0 }
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
          <tr>
            <th className="py-3 px-4">Expense Category</th>
            <th className="py-3 px-4 text-center">Vouchers</th>
            <th className="py-3 px-4 text-right">Cash Outflow</th>
            <th className="py-3 px-4 text-right">Bank Outflow</th>
            <th className="py-3 px-4 text-right">Total Amount</th>
            <th className="py-3 px-4 text-left w-36">Share of Expenses</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
          {data.map((row) => (
            <tr key={row.category} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3 px-4 font-bold text-slate-800">{row.label}</td>
              <td className="py-3 px-4 text-center font-semibold text-slate-500">
                {formatNumber(row.count)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                {formatCurrency(row.cashAmount)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-blue-700">
                {formatCurrency(row.bankAmount)}
              </td>
              <td className="py-3 px-4 text-right font-bold text-slate-900">
                {formatCurrency(row.totalAmount)}
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 w-9 text-right shrink-0">
                    {row.percentage}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <tr>
            <td className="py-3.5 px-4 uppercase text-[11px] tracking-wider">Total Operating Expenses</td>
            <td className="py-3.5 px-4 text-center">{formatNumber(totals.count)}</td>
            <td className="py-3.5 px-4 text-right text-emerald-700">{formatCurrency(totals.cash)}</td>
            <td className="py-3.5 px-4 text-right text-blue-700">{formatCurrency(totals.bank)}</td>
            <td className="py-3.5 px-4 text-right text-slate-900 font-extrabold">{formatCurrency(totals.total)}</td>
            <td className="py-3.5 px-4 text-slate-600 text-[11px] font-bold">100.0%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
