import React from 'react';
import type { CustomerSalesSummary } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';

interface CustomerSalesSummaryTableProps {
  data: CustomerSalesSummary[];
}

export const CustomerSalesSummaryTable: React.FC<CustomerSalesSummaryTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">No customer sales records available for this period.</p>
      </div>
    );
  }

  const totals = data.reduce(
    (acc, c) => ({
      invoices: acc.invoices + c.invoiceCount,
      sales: acc.sales + c.totalSalesAmount,
      cash: acc.cash + c.cashPaid,
      credit: acc.credit + c.creditAdded,
    }),
    { invoices: 0, sales: 0, cash: 0, credit: 0 }
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
          <tr>
            <th className="py-3 px-4">Customer Name</th>
            <th className="py-3 px-4">Type</th>
            <th className="py-3 px-4 text-center">Invoices</th>
            <th className="py-3 px-4 text-right">Total Billed</th>
            <th className="py-3 px-4 text-right">Cash Paid</th>
            <th className="py-3 px-4 text-right">Credit Added</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
          {data.map((c, i) => (
            <tr key={c.customerId || `${c.customerName}-${i}`} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3 px-4 font-bold text-slate-800">{c.customerName}</td>
              <td className="py-3 px-4">
                <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-md uppercase bg-slate-100 text-slate-700">
                  {c.customerType}
                </span>
              </td>
              <td className="py-3 px-4 text-center font-semibold text-slate-600">
                {formatNumber(c.invoiceCount)}
              </td>
              <td className="py-3 px-4 text-right font-bold text-slate-900">
                {formatCurrency(c.totalSalesAmount)}
              </td>
              <td className="py-3 px-4 text-right text-blue-700 font-semibold">
                {formatCurrency(c.cashPaid)}
              </td>
              <td className="py-3 px-4 text-right text-amber-700 font-semibold">
                {c.creditAdded > 0 ? formatCurrency(c.creditAdded) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <tr>
            <td className="py-3.5 px-4 uppercase text-[11px] tracking-wider" colSpan={2}>
              Total ({data.length} Customers)
            </td>
            <td className="py-3.5 px-4 text-center">{formatNumber(totals.invoices)}</td>
            <td className="py-3.5 px-4 text-right">{formatCurrency(totals.sales)}</td>
            <td className="py-3.5 px-4 text-right text-blue-700">{formatCurrency(totals.cash)}</td>
            <td className="py-3.5 px-4 text-right text-amber-700">{formatCurrency(totals.credit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

