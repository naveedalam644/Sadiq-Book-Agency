import React from 'react';
import type { DateWisePurchaseSummary } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';
import { formatDate } from '../../../utils/formatters';

interface DateWisePurchaseTableProps {
  data: DateWisePurchaseSummary[];
}

export const DateWisePurchaseTable: React.FC<DateWisePurchaseTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">No daily purchase activity recorded for this period.</p>
      </div>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({
      invoices: acc.invoices + row.invoiceCount,
      total: acc.total + row.totalPurchaseValue,
      paid: acc.paid + row.paidAmount,
      balance: acc.balance + row.remainingBalance,
    }),
    { invoices: 0, total: 0, paid: 0, balance: 0 }
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
          <tr>
            <th className="py-3 px-4">Date</th>
            <th className="py-3 px-4 text-center">Invoices</th>
            <th className="py-3 px-4 text-right">Total Purchases</th>
            <th className="py-3 px-4 text-right">Paid Amount</th>
            <th className="py-3 px-4 text-right">Remaining Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
          {data.map((row) => (
            <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3 px-4 font-bold text-slate-800">{formatDate(row.date)}</td>
              <td className="py-3 px-4 text-center font-semibold text-slate-600">
                {formatNumber(row.invoiceCount)}
              </td>
              <td className="py-3 px-4 text-right font-bold text-slate-900">
                {formatCurrency(row.totalPurchaseValue)}
              </td>
              <td className="py-3 px-4 text-right text-emerald-700 font-semibold">
                {formatCurrency(row.paidAmount)}
              </td>
              <td className="py-3 px-4 text-right text-rose-700 font-semibold">
                {row.remainingBalance > 0 ? formatCurrency(row.remainingBalance) : 'PKR 0'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <tr>
            <td className="py-3.5 px-4 uppercase text-[11px] tracking-wider">Totals</td>
            <td className="py-3.5 px-4 text-center">{formatNumber(totals.invoices)}</td>
            <td className="py-3.5 px-4 text-right">{formatCurrency(totals.total)}</td>
            <td className="py-3.5 px-4 text-right text-emerald-700">{formatCurrency(totals.paid)}</td>
            <td className="py-3.5 px-4 text-right text-rose-700">{formatCurrency(totals.balance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

