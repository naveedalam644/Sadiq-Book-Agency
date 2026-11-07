import React, { useState } from 'react';
import type { ExpenseDocument } from '../../types/database';
import { formatCurrency } from '../../utils/money';
import { formatDate } from '../../utils/formatters';
import { EXPENSE_CATEGORY_LABELS } from '../../services/expenseService';
import { Edit2, Trash2, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';

interface ExpenseTableProps {
  expenses: ExpenseDocument[];
  isAdmin: boolean;
  onEdit: (expense: ExpenseDocument) => void;
  onDelete: (expense: ExpenseDocument) => void;
}

const PAGE_SIZE = 15;

export const ExpenseTable: React.FC<ExpenseTableProps> = ({
  expenses,
  isAdmin,
  onEdit,
  onDelete,
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  if (!expenses || expenses.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-3xl">
        <p className="text-sm font-semibold text-slate-500">No operating expenses found for this period.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(expenses.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const currentExpenses = expenses.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Title / Purpose</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Paid To</th>
              <th className="py-3 px-4 text-center">Payment Mode</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4 text-center">Ref / Bill #</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {currentExpenses.map((exp) => (
              <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-4 font-semibold text-slate-800">{formatDate(exp.expenseDate)}</td>
                <td className="py-3 px-4 font-bold text-slate-900">
                  {exp.title}
                  {exp.notes && (
                    <span className="block text-[11px] font-normal text-slate-400 mt-0.5 truncate max-w-xs">
                      {exp.notes}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-md uppercase bg-slate-100 text-slate-800">
                    {EXPENSE_CATEGORY_LABELS[exp.expenseCategory] || exp.expenseCategory}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">{exp.paidTo || '—'}</td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                      exp.paymentMode === 'cash'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {exp.paymentMode === 'cash' ? 'Cash' : 'Bank'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-black text-slate-900">
                  {formatCurrency(exp.amount)}
                </td>
                <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-500">
                  {exp.referenceNo || '—'}
                </td>
                <td className="py-3 px-4 text-center">
                  {isAdmin ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEdit(exp)}
                        className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition cursor-pointer"
                        title="Edit Expense"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(exp)}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                        title="Delete Expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400" title="Admin only write access">
                      <ShieldAlert className="w-3 h-3" /> View Only
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-1 text-xs text-slate-600 print:hidden">
          <span>
            Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, expenses.length)} of {expenses.length} records
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

