import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { ExpenseDocument } from '../../types/database';
import { formatCurrency } from '../../utils/money';

interface ExpenseDeleteModalProps {
  isOpen: boolean;
  expense: ExpenseDocument | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
}

export const ExpenseDeleteModal: React.FC<ExpenseDeleteModalProps> = ({
  isOpen,
  expense,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  if (!isOpen || !expense) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <h3 className="text-base font-bold text-slate-900">Delete Operating Expense?</h3>
          <p className="text-xs text-slate-500 mt-1">
            This will permanently remove this expense record from the accounting database.
          </p>

          <div className="my-4 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs">
            <p className="font-bold text-slate-800">{expense.title}</p>
            <div className="flex items-center justify-between text-slate-500 mt-1">
              <span>Amount:</span>
              <span className="font-bold text-rose-700">{formatCurrency(expense.amount)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 mt-0.5">
              <span>Payment Mode:</span>
              <span className="font-semibold capitalize text-slate-700">
                {expense.paymentMode.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-500 mt-0.5">
              <span>Date:</span>
              <span>{expense.expenseDate}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              {isLoading ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
