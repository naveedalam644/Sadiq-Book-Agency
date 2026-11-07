import React from 'react';
import type { DailySalesBreakdown } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';
import { formatDate } from '../../../utils/formatters';

interface DailySalesBreakdownTableProps {
  data: DailySalesBreakdown[];
}

export const DailySalesBreakdownTable: React.FC<DailySalesBreakdownTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">No daily sales activity recorded for this period.</p>
      </div>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({
      invoices: acc.invoices + row.invoiceCount,
      gross: acc.gross + row.grossSales,
      returns: acc.returns + row.returnsAmount,
      net: acc.net + row.netSales,
      cash: acc.cash + row.cashReceived,
      credit: acc.credit + row.creditAdded,
    }),
    { invoices: 0, gross: 0, returns: 0, net: 0, cash: 0, credit: 0 }
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
          <tr>
            <th className="py-3 px-4">Date</th>
            <th className="py-3 px-4 text-center">Invoices</th>
            <th className="py-3 px-4 text-right">Gross Sales</th>
            <th className="py-3 px-4 text-right">Sales Returns</th>
            <th className="py-3 px-4 text-right">Net Sales</th>
            <th className="py-3 px-4 text-right">Cash Received</th>
            <th className="py-3 px-4 text-right">Credit Added</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
          {data.map((row) => (
            <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3 px-4 font-bold text-slate-800">{formatDate(row.date)}</td>
              <td className="py-3 px-4 text-center font-semibold text-slate-600">
                {formatNumber(row.invoiceCount)}
              </td>
              <td className="py-3 px-4 text-right text-slate-900 font-semibold">
                {formatCurrency(row.grossSales)}
              </td>
              <td className="py-3 px-4 text-right text-rose-600 font-semibold">
                {row.returnsAmount > 0 ? `-${formatCurrency(row.returnsAmount)}` : 'PKR 0'}
              </td>
              <td className="py-3 px-4 text-right text-emerald-700 font-bold">
                {formatCurrency(row.netSales)}
              </td>
              <td className="py-3 px-4 text-right text-blue-700 font-semibold">
                {formatCurrency(row.cashReceived)}
              </td>
              <td className="py-3 px-4 text-right text-amber-700 font-semibold">
                {formatCurrency(row.creditAdded)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <tr>
            <td className="py-3.5 px-4 uppercase text-[11px] tracking-wider">Totals</td>
            <td className="py-3.5 px-4 text-center">{formatNumber(totals.invoices)}</td>
            <td className="py-3.5 px-4 text-right">{formatCurrency(totals.gross)}</td>
            <td className="py-3.5 px-4 text-right text-rose-600">
              {totals.returns > 0 ? `-${formatCurrency(totals.returns)}` : 'PKR 0'}
            </td>
            <td className="py-3.5 px-4 text-right text-emerald-700">{formatCurrency(totals.net)}</td>
            <td className="py-3.5 px-4 text-right text-blue-700">{formatCurrency(totals.cash)}</td>
            <td className="py-3.5 px-4 text-right text-amber-700">{formatCurrency(totals.credit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

