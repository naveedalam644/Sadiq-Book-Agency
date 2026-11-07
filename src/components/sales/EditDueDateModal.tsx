import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import type { SaleDocument } from '../../types/database';
import { useAuth } from '../../hooks/useAuth';
import { updateSaleDueDate } from '../../services/dueDateService';

interface EditDueDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleDocument | null;
  onSuccess: (updatedSale: SaleDocument) => void;
}

export const EditDueDateModal: React.FC<EditDueDateModalProps> = ({
  isOpen,
  onClose,
  sale,
  onSuccess,
}) => {
  const { currentUser, isAdmin } = useAuth();

  const [newDueDate, setNewDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saleDateOnly = sale ? (sale.saleDate || sale.createdAt).split('T')[0] : '';

  useEffect(() => {
    if (sale) {
      setNewDueDate(sale.dueDate || '');
      setReason('');
      setError(null);
    }
  }, [sale, isOpen]);

  if (!isOpen || !sale) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Unauthorized: Only administrators have permission to modify invoice due dates.');
      return;
    }

    if (!newDueDate) {
      setError('Please select a valid new due date.');
      return;
    }

    if (newDueDate < saleDateOnly) {
      setError(`Due date cannot precede the original invoice date (${saleDateOnly}).`);
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError('Please provide a meaningful reason (at least 3 characters) for the audit trail.');
      return;
    }

    if (!currentUser?.uid) {
      setError('Authenticated user session not found.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await updateSaleDueDate({
        saleId: sale.id,
        newDueDate,
        reason: trimmedReason,
        adminUserId: currentUser.uid,
        adminEmail: currentUser.email || undefined,
      });

      onSuccess(updated);
      onClose();
    } catch (err: any) {
      console.error('Failed to update due date:', err);
      setError(err?.message || 'An error occurred while updating the invoice due date.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#071F49] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#F5B51B]" />
            <h3 className="font-bold text-base">Edit Invoice Due Date</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isAdmin && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
              <span>Permission Denied: Only administrators are authorized to override invoice payment deadlines.</span>
            </div>
          )}

          {/* Invoice Summary */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Invoice Number:</span>
              <span className="font-mono font-bold text-slate-800">{sale.invoiceNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Customer:</span>
              <span className="font-bold text-slate-800">{sale.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Bill Date:</span>
              <span className="text-slate-800">{saleDateOnly}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Grand Total / Credit Booked:</span>
              <span className="font-bold text-slate-900">
                PKR {sale.grandTotal.toFixed(2)}
                {sale.balanceAddedToCredit > 0 && ` (Credit: PKR ${sale.balanceAddedToCredit.toFixed(2)})`}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-medium">Current Due Date:</span>
              <span className="font-semibold text-slate-700">
                {sale.dueDate ? sale.dueDate : 'Not Configured (Pending)'}
              </span>
            </div>
          </div>

          {/* New Due Date Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              New Payment Due Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              min={saleDateOnly}
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              disabled={!isAdmin || isSubmitting}
              required
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#071F49] disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Must be on or after original bill date ({saleDateOnly}).
            </p>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Justification / Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer requested 10-day extension via phone, approved by shop manager."
              disabled={!isAdmin || isSubmitting}
              required
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#071F49] disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-400 mt-0.5">
              Permanently recorded in the immutable audit log with your admin identity.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isAdmin || isSubmitting}
              className="px-4 py-2 bg-[#071F49] hover:bg-[#0c2f6d] text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-[#F5B51B]" />
                  <span>Save Due Date</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
