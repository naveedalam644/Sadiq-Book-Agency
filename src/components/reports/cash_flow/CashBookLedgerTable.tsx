import React, { useState, useMemo } from 'react';
import type { CashFlowTransaction, CashFlowCategory } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';
import { formatDate } from '../../../utils/formatters';
import { Search } from 'lucide-react';

interface CashBookLedgerTableProps {
  transactions: CashFlowTransaction[];
  openingFloat?: number;
}

export const CashBookLedgerTable: React.FC<CashBookLedgerTableProps> = ({
  transactions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'cash' | 'bank_transfer' | 'cheque'>('all');
  const [filterDirection, setFilterDirection] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | CashFlowCategory>('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Filter transactions client-side
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterMode !== 'all' && t.paymentMode !== filterMode) return false;
      if (filterDirection !== 'all' && t.direction !== filterDirection) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchReceipt = t.receiptNo?.toLowerCase().includes(term);
        const matchParty = t.partyName?.toLowerCase().includes(term);
        const matchNotes = t.notes?.toLowerCase().includes(term);
        if (!matchReceipt && !matchParty && !matchNotes) return false;
      }
      return true;
    });
  }, [transactions, filterMode, filterDirection, filterCategory, searchTerm]);

  // Paginated slice
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="bg-white p-3.5 border border-slate-200 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search receipt #, customer, supplier..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#071F49]/20 focus:border-[#071F49]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Filter */}
          <select
            value={filterMode}
            onChange={(e) => {
              setFilterMode(e.target.value as any);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Modes</option>
            <option value="cash">Cash Only</option>
            <option value="bank_transfer">Bank Transfer Only</option>
            <option value="cheque">Cheque Only</option>
          </select>

          {/* Direction Filter */}
          <select
            value={filterDirection}
            onChange={(e) => {
              setFilterDirection(e.target.value as any);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Flows (In & Out)</option>
            <option value="inflow">Inflows Only</option>
            <option value="outflow">Outflows Only</option>
          </select>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value as any);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            <option value="direct_sale">Direct Sales</option>
            <option value="customer_recovery">Customer Khata Recoveries</option>
            <option value="sales_refund">Sales Refunds</option>
            <option value="operating_expense">Operating Expenses</option>
            <option value="supplier_payment">Supplier Purchases</option>
          </select>
        </div>
      </div>

      {/* Cash Book Transaction Table */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
          <p className="text-sm font-semibold text-slate-500">
            No transactions match the selected filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
              <tr>
                <th className="py-3 px-3.5">Date</th>
                <th className="py-3 px-3.5">Receipt / Ref #</th>
                <th className="py-3 px-3.5">Party / Description</th>
                <th className="py-3 px-3.5">Category</th>
                <th className="py-3 px-3.5 text-center">Mode</th>
                <th className="py-3 px-3.5 text-right">Inflow (+)</th>
                <th className="py-3 px-3.5 text-right">Outflow (-)</th>
                <th className="py-3 px-3.5 text-right">Running Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {paginated.map((t) => {
                const isInflow = t.direction === 'inflow';
                const isCash = t.paymentMode === 'cash';

                return (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3.5 font-bold text-slate-800 whitespace-nowrap">
                      {formatDate(t.date)}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-600 whitespace-nowrap font-mono text-[11px]">
                      {t.receiptNo}
                    </td>
                    <td className="py-2.5 px-3.5 max-w-xs truncate">
                      <div className="font-bold text-slate-800">{t.partyName}</div>
                      {t.notes && (
                        <div className="text-[10px] text-slate-400 truncate">{t.notes}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {t.categoryLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        t.paymentMode === 'cash'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.paymentMode === 'bank_transfer'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {t.paymentMode === 'cash'
                          ? 'Cash'
                          : t.paymentMode === 'bank_transfer'
                          ? 'Bank Transfer'
                          : 'Cheque'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold whitespace-nowrap text-emerald-700">
                      {isInflow ? `+${formatCurrency(t.amount)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold whitespace-nowrap text-rose-600">
                      {!isInflow ? `-${formatCurrency(t.amount)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-black whitespace-nowrap text-slate-800 font-mono text-[11px]">
                      {isCash && t.runningCashBalance !== undefined
                        ? formatCurrency(t.runningCashBalance)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Showing {Math.min(filtered.length, (page - 1) * pageSize + 1)} to{' '}
                {Math.min(filtered.length, page * pageSize)} of {formatNumber(filtered.length)} transactions
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-2 font-bold text-slate-700">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
