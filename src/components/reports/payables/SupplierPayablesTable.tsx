import React, { useState } from 'react';
import {
  Search,
  Filter,
  Truck,
  ChevronDown,
  ChevronUp,
  CreditCard,
} from 'lucide-react';
import type {
  SupplierPayableItem,
  SupplierPayablesFilters,
} from '../../../types/reports';
import type { SupplierDocument } from '../../../types/database';
import { formatCurrency, formatNumber } from '../../../utils/money';

interface SupplierPayablesTableProps {
  suppliers: SupplierPayableItem[];
  rawSuppliers: SupplierDocument[];
  filters: SupplierPayablesFilters;
  onFilterChange: (filters: SupplierPayablesFilters) => void;
  onPaySupplier: (supplier: SupplierDocument) => void;
  loading?: boolean;
}

export const SupplierPayablesTable: React.FC<SupplierPayablesTableProps> = ({
  suppliers,
  rawSuppliers,
  filters,
  onFilterChange,
  onPaySupplier,
  loading = false,
}) => {
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedSupplierId((prev) => (prev === id ? null : id));
  };

  const getRawSupplier = (id: string): SupplierDocument | null => {
    return rawSuppliers.find((s) => s.id === id) || null;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Table Filter Controls */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search supplier, contact, phone..."
              value={filters.searchTerm || ''}
              onChange={(e) => onFilterChange({ ...filters, searchTerm: e.target.value })}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#071F49]/20 focus:border-[#071F49]"
            />
          </div>

          {/* Balance Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={filters.balanceStatus || 'all'}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  balanceStatus: e.target.value as any,
                })
              }
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            >
              <option value="all">All Suppliers</option>
              <option value="has_balance">Creditors (Balance &gt; 0)</option>
              <option value="zero_balance">Settled (Zero Balance)</option>
            </select>
          </div>

          {/* Sort By Filter */}
          <select
            value={filters.sortBy || 'balance_desc'}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                sortBy: e.target.value as any,
              })
            }
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
          >
            <option value="balance_desc">Sort: Highest Balance</option>
            <option value="balance_asc">Sort: Lowest Balance</option>
            <option value="name_asc">Sort: Name (A–Z)</option>
          </select>
        </div>

        <div className="text-xs font-medium text-slate-500 self-end sm:self-center">
          Showing <strong className="text-slate-800">{formatNumber(suppliers.length)}</strong> suppliers
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <th className="py-3 px-4">Supplier / Publisher</th>
              <th className="py-3 px-3 text-right">Payable Balance (PKR)</th>
              <th className="py-3 px-3 text-right">Purchases (Value)</th>
              <th className="py-3 px-3 text-right">Intake Paid</th>
              <th className="py-3 px-3">Aging Breakdown</th>
              <th className="py-3 px-3 text-center">Open Bills</th>
              <th className="py-3 px-3">Last Purchase</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-300 border-t-[#071F49] rounded-full animate-spin" />
                    <p className="text-xs font-medium">Loading supplier payables...</p>
                  </div>
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Truck className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">No supplier records found</p>
                    <p className="text-xs text-slate-400">Try adjusting your search or filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              suppliers.map((s) => {
                const isExpanded = expandedSupplierId === s.supplierId;
                const rawSup = getRawSupplier(s.supplierId);

                return (
                  <React.Fragment key={s.supplierId}>
                    <tr
                      onClick={() => toggleExpand(s.supplierId)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      {/* Supplier / Publisher */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(s.supplierId);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <div>
                            <div className="font-bold text-[#071F49]">{s.companyName}</div>
                            <div className="text-[11px] text-slate-500">Contact: {s.contactPerson}</div>
                            <div className="text-[10px] text-slate-400">{s.phone}</div>
                          </div>
                        </div>
                      </td>

                      {/* Payable Balance */}
                      <td className="py-3 px-3 text-right">
                        <div
                          className={`font-extrabold text-sm ${
                            s.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {formatCurrency(s.currentBalance)}
                        </div>
                        {s.currentBalance === 0 && (
                          <span className="text-[10px] font-semibold text-emerald-600">Settled</span>
                        )}
                      </td>

                      {/* Total Purchases */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-bold text-slate-800">
                          {formatCurrency(s.totalPurchasesValue)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {s.totalPurchasesCount} {s.totalPurchasesCount === 1 ? 'bill' : 'bills'}
                        </div>
                      </td>

                      {/* Intake Paid vs Remaining */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-semibold text-emerald-700">
                          {formatCurrency(s.totalIntakePaid)}
                        </div>
                        {s.totalSettlementPaid > 0 && (
                          <div className="text-[10px] text-blue-600">
                            Settled: {formatCurrency(s.totalSettlementPaid)}
                          </div>
                        )}
                      </td>

                      {/* Aging Breakdown Pills */}
                      <td className="py-3 px-3">
                        {s.currentBalance > 0 ? (
                          <div className="flex items-center gap-1 text-[10px]">
                            {s.aging.current30 > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200" title="0–30 Days">
                                0-30d: {formatCurrency(s.aging.current30)}
                              </span>
                            )}
                            {s.aging.days31To60 > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200" title="31–60 Days">
                                31-60d: {formatCurrency(s.aging.days31To60)}
                              </span>
                            )}
                            {s.aging.days61To90 > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200" title="61–90 Days">
                                61-90d: {formatCurrency(s.aging.days61To90)}
                              </span>
                            )}
                            {s.aging.days90Plus > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold" title="90+ Days">
                                90+d: {formatCurrency(s.aging.days90Plus)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">All balances cleared</span>
                        )}
                      </td>

                      {/* Open Bills */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            s.unpaidInvoicesCount > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {s.unpaidInvoicesCount}
                        </span>
                      </td>

                      {/* Last Purchase */}
                      <td className="py-3 px-3">
                        {s.lastPurchaseDate ? (
                          <div className="text-[11px] font-medium text-slate-700">
                            {s.lastPurchaseDate}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">None</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {rawSup && s.currentBalance > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPaySupplier(rawSup);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-[#071F49] hover:bg-[#071F49]/90 rounded-lg shadow-2xs transition active:scale-95"
                            >
                              <CreditCard className="w-3 h-3" />
                              Pay Supplier
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(s.supplierId);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                          >
                            {isExpanded ? 'Hide' : 'Details'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Detail Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={8} className="p-4 border-t border-b border-slate-200">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-xs font-bold text-[#071F49] uppercase tracking-wider">
                                Supplier Summary: {s.companyName}
                              </h4>
                              <span className="text-xs text-slate-500">ID: {s.supplierId}</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Current Balance:</span>
                                <span className="text-base font-extrabold text-rose-600">
                                  {formatCurrency(s.currentBalance)}
                                </span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Total Purchases:</span>
                                <span className="text-base font-bold text-slate-800">
                                  {formatCurrency(s.totalPurchasesValue)}
                                </span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Initial Intake Paid:</span>
                                <span className="text-base font-bold text-emerald-700">
                                  {formatCurrency(s.totalIntakePaid)}
                                </span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Later Settlements:</span>
                                <span className="text-base font-bold text-blue-700">
                                  {formatCurrency(s.totalSettlementPaid)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

