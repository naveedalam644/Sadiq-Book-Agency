import React, { useState } from 'react';
import {
  Search,
  Filter,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react';
import type {
  CustomerReceivableItem,
  CustomerReceivablesFilters,
} from '../../../types/reports';
import type { CustomerType } from '../../../types/database';
import { formatCurrency, formatNumber } from '../../../utils/money';

interface CustomerReceivablesTableProps {
  customers: CustomerReceivableItem[];
  filters: CustomerReceivablesFilters;
  onFilterChange: (filters: CustomerReceivablesFilters) => void;
  loading?: boolean;
}

export const CustomerReceivablesTable: React.FC<CustomerReceivablesTableProps> = ({
  customers,
  filters,
  onFilterChange,
  loading = false,
}) => {
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedCustomerId((prev) => (prev === id ? null : id));
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
              placeholder="Search customer, shop or phone..."
              value={filters.searchTerm || ''}
              onChange={(e) => onFilterChange({ ...filters, searchTerm: e.target.value })}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#071F49]/20 focus:border-[#071F49]"
            />
          </div>

          {/* Customer Type Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={filters.customerType || 'all'}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  customerType: e.target.value as 'all' | CustomerType,
                })
              }
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            >
              <option value="all">All Customer Types</option>
              <option value="wholesaler">Wholesaler</option>
              <option value="marketshop">Marketshop</option>
              <option value="parchon">Parchon (Walk-in)</option>
            </select>
          </div>

          {/* Balance Status Filter */}
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
            <option value="all">All Accounts</option>
            <option value="has_balance">Debtors (Balance &gt; 0)</option>
            <option value="overdue_only">Overdue Accounts</option>
            <option value="advance_only">Advance Accounts (Negative)</option>
            <option value="zero_balance">Zero Balance</option>
          </select>

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
            <option value="overdue_desc">Sort: Highest Overdue</option>
            <option value="name_asc">Sort: Name (A–Z)</option>
          </select>
        </div>

        <div className="text-xs font-medium text-slate-500 self-end sm:self-center">
          Showing <strong className="text-slate-800">{formatNumber(customers.length)}</strong> customers
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <th className="py-3 px-4">Customer / Shop</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3 text-right">Balance (PKR)</th>
              <th className="py-3 px-3 text-right">Credit Limit</th>
              <th className="py-3 px-3">Aging Breakdown</th>
              <th className="py-3 px-3">Payment Terms</th>
              <th className="py-3 px-3">Last Payment</th>
              <th className="py-3 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-slate-300 border-t-[#071F49] rounded-full animate-spin" />
                    <p className="text-xs font-medium">Loading customer receivables...</p>
                  </div>
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <User className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">No customer records found</p>
                    <p className="text-xs text-slate-400">Try adjusting your filters or search term</p>
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const isExpanded = expandedCustomerId === c.customerId;
                const isOverLimit = c.creditLimit > 0 && c.currentBalance > c.creditLimit;

                return (
                  <React.Fragment key={c.customerId}>
                    <tr
                      onClick={() => toggleExpand(c.customerId)}
                      className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                        c.isOverdue ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Customer / Shop */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(c.customerId);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <div>
                            <div className="font-bold text-[#071F49]">
                              {c.shopName || c.customerName}
                            </div>
                            {c.shopName && c.customerName !== c.shopName && (
                              <div className="text-[11px] text-slate-500">Contact: {c.customerName}</div>
                            )}
                            <div className="text-[10px] text-slate-400">{c.phone}</div>
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                            c.customerType === 'wholesaler'
                              ? 'bg-blue-100 text-blue-800'
                              : c.customerType === 'marketshop'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {c.customerType}
                        </span>
                      </td>

                      {/* Balance */}
                      <td className="py-3 px-3 text-right">
                        <div
                          className={`font-extrabold text-sm ${
                            c.currentBalance > 0
                              ? 'text-amber-600'
                              : c.currentBalance < 0
                              ? 'text-emerald-600'
                              : 'text-slate-500'
                          }`}
                        >
                          {formatCurrency(c.currentBalance)}
                        </div>
                        {c.currentBalance < 0 && (
                          <span className="text-[10px] font-semibold text-emerald-600">Advance</span>
                        )}
                        {isOverLimit && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                            <AlertCircle className="w-3 h-3" /> Over Limit
                          </span>
                        )}
                      </td>

                      {/* Credit Limit & Utilization */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-semibold text-slate-700">
                          {c.creditLimit > 0 ? formatCurrency(c.creditLimit) : '—'}
                        </div>
                        {c.creditLimit > 0 && (
                          <div className="text-[10px] text-slate-500">
                            Util: <strong className={c.creditUtilizationPct > 100 ? 'text-rose-600' : 'text-slate-700'}>
                              {c.creditUtilizationPct}%
                            </strong>
                          </div>
                        )}
                      </td>

                      {/* Aging Breakdown Pills */}
                      <td className="py-3 px-3">
                        {c.currentBalance > 0 ? (
                          <div className="flex items-center gap-1 text-[10px]">
                            {c.aging.current30 > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200" title="0–30 Days">
                                0-30d: {formatCurrency(c.aging.current30)}
                              </span>
                            )}
                            {c.aging.days31To60 > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200" title="31–60 Days">
                                31-60d: {formatCurrency(c.aging.days31To60)}
                              </span>
                            )}
                            {c.aging.days61To90 > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200" title="61–90 Days">
                                61-90d: {formatCurrency(c.aging.days61To90)}
                              </span>
                            )}
                            {c.aging.days90Plus > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold" title="90+ Days">
                                90+d: {formatCurrency(c.aging.days90Plus)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Current / Settled</span>
                        )}
                      </td>

                      {/* Terms & Overdue Status */}
                      <td className="py-3 px-3">
                        <div className="text-[11px] font-medium text-slate-700">{c.termsLabel}</div>
                        {c.isOverdue ? (
                          <div className="text-[10px] font-bold text-rose-600 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 shrink-0" />
                            Overdue ({formatCurrency(c.overdueAmount)})
                          </div>
                        ) : c.estimatedDueDate ? (
                          <div className="text-[10px] text-slate-500">Due: {c.estimatedDueDate}</div>
                        ) : null}
                      </td>

                      {/* Last Payment */}
                      <td className="py-3 px-3">
                        {c.lastPaymentDate ? (
                          <div>
                            <div className="font-medium text-slate-800">
                              {formatCurrency(c.lastPaymentAmount || 0)}
                            </div>
                            <div className="text-[10px] text-slate-500">{c.lastPaymentDate}</div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">None recorded</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(c.customerId);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        >
                          {isExpanded ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Detail Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={8} className="p-4 border-t border-b border-slate-200">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-xs font-bold text-[#071F49] uppercase tracking-wider">
                                Account Overview: {c.shopName || c.customerName}
                              </h4>
                              <span className="text-xs text-slate-500">ID: {c.customerId}</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Total Outstanding:</span>
                                <span className="text-base font-extrabold text-[#071F49]">
                                  {formatCurrency(c.currentBalance)}
                                </span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Credit Limit:</span>
                                <span className="text-base font-bold text-slate-800">
                                  {c.creditLimit > 0 ? formatCurrency(c.creditLimit) : 'None configured'}
                                </span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Overdue Amount:</span>
                                <span
                                  className={`text-base font-bold ${
                                    c.overdueAmount > 0 ? 'text-rose-600' : 'text-emerald-600'
                                  }`}
                                >
                                  {formatCurrency(c.overdueAmount)}
                                </span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500 block text-[11px]">Last Sale:</span>
                                <span className="text-base font-bold text-slate-800">
                                  {c.lastSaleAmount ? `${formatCurrency(c.lastSaleAmount)} (${c.lastSaleDate})` : '—'}
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

