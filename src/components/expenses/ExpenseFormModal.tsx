import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import type { ExpenseDocument } from '../../types/database';
import {
  ALL_EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  validateExpenseInput,
  type CreateExpenseInput,
} from '../../services/expenseService';
import { formatYMD } from '../../utils/datePresets';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateExpenseInput) => Promise<void>;
  initialData?: ExpenseDocument | null;
  isLoading?: boolean;
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}) => {
  const [title, setTitle] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<CreateExpenseInput['expenseCategory']>('salaries');
  const [amount, setAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [paidTo, setPaidTo] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [expenseDate, setExpenseDate] = useState<string>(() => formatYMD(new Date()));
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Sync initialData when modal opens
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setExpenseCategory(initialData.expenseCategory || 'salaries');
      setAmount(String(initialData.amount || ''));
      setPaymentMode(initialData.paymentMode || 'cash');
      setPaidTo(initialData.paidTo || '');
      setReferenceNo(initialData.referenceNo || '');
      setExpenseDate(initialData.expenseDate || formatYMD(new Date()));
      setNotes(initialData.notes || '');
    } else {
      setTitle('');
      setExpenseCategory('salaries');
      setAmount('');
      setPaymentMode('cash');
      setPaidTo('');
      setReferenceNo('');
      setExpenseDate(formatYMD(new Date()));
      setNotes('');
    }
    setFormError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const input: CreateExpenseInput = {
      title,
      expenseCategory,
      amount: parseFloat(amount) || 0,
      paymentMode,
      paidTo,
      referenceNo,
      expenseDate,
      notes,
    };

    const validation = validateExpenseInput(input);
    if (!validation.isValid) {
      setFormError(validation.error || 'Please fill in all required fields accurately.');
      return;
    }

    try {
      await onSubmit(input);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save expense record.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#071F49] text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">
              {initialData ? 'Edit Operating Expense' : 'Record Operating Expense'}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              {initialData ? 'Update audited expense details' : 'Record day-to-day shop operating expenditures'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {/* Title / Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Title / Payee Purpose <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Shop Rent for November, Monthly Electric Bill, Courier"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            />
          </div>

          {/* Category & Amount Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value as any)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#071F49]/20 font-semibold"
              >
                {ALL_EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {EXPENSE_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Amount (PKR) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="any"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#071F49]/20 text-slate-900"
              />
            </div>
          </div>

          {/* Payment Mode & Expense Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Payment Mode <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    paymentMode === 'cash'
                      ? 'bg-blue-50 border-[#071F49] text-[#071F49]'
                      : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Cash Drawer
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('bank_transfer')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    paymentMode === 'bank_transfer'
                      ? 'bg-blue-50 border-[#071F49] text-[#071F49]'
                      : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Bank Transfer
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Expense Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
              />
            </div>
          </div>

          {/* Paid To & Reference No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Paid To (Recipient)
              </label>
              <input
                type="text"
                placeholder="e.g., Landlord, K-Electric, Staff name"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Bill / Voucher #
              </label>
              <input
                type="text"
                placeholder="e.g., VOUCH-4402, Bill #9921"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Audit Notes
            </label>
            <textarea
              rows={2}
              placeholder="Optional notes or accounting justification..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#071F49]/20 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#071F49] hover:bg-[#0c3172] text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isLoading ? 'Saving...' : initialData ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
