import React, { useState } from 'react';
import type { PurchaseDocument } from '../../../types/database';
import { formatCurrency, formatNumber } from '../../../utils/money';
import { formatDate } from '../../../utils/formatters';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

interface PurchaseInvoiceDetailTableProps {
  purchases: PurchaseDocument[];
}

const PAGE_SIZE = 15;

export const PurchaseInvoiceDetailTable: React.FC<PurchaseInvoiceDetailTableProps> = ({
  purchases,
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  if (!purchases || purchases.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">No purchase records found for the selected criteria.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(purchases.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const currentPurchases = purchases.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="space-y-3">
      {/* Schema Notice regarding Purchase Returns */}
      <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
        <Info className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          <strong>Accounting Note:</strong> Purchase Returns are reported as <strong>PKR 0 (None recorded)</strong> as no dedicated purchase return transactions currently exist in the database schema.
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Invoice #</th>
              <th className="py-3 px-4">Supplier / Publisher</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-center">Items</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-right">Paid Amount</th>
              <th className="py-3 px-4 text-right">Remaining Balance</th>
              <th className="py-3 px-4 text-center">Payment Method</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {currentPurchases.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.purchaseInvoiceNo}</td>
                <td className="py-3 px-4 font-semibold text-slate-800">{p.supplierName}</td>
                <td className="py-3 px-4 text-slate-600">{formatDate(p.purchaseDate)}</td>
                <td className="py-3 px-4 text-center font-semibold text-slate-600">
                  {formatNumber(p.items?.length || 0)}
                </td>
                <td className="py-3 px-4 text-right font-bold text-slate-900">
                  {formatCurrency(p.grandTotal)}
                </td>
                <td className="py-3 px-4 text-right text-emerald-700 font-semibold">
                  {formatCurrency(p.paidAmount)}
                </td>
                <td className="py-3 px-4 text-right text-rose-700 font-semibold">
                  {p.remainingBalance > 0 ? formatCurrency(p.remainingBalance) : 'PKR 0'}
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                      p.paymentMethod === 'cash'
                        ? 'bg-emerald-100 text-emerald-800'
                        : p.paymentMethod === 'credit'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {p.paymentMethod.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-1 text-xs text-slate-600 print:hidden">
          <span>
            Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, purchases.length)} of {purchases.length} invoices
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="font-semibold text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

