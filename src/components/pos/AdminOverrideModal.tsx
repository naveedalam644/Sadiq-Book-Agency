import React, { useState } from 'react';
import { ShieldAlert, KeyRound, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { AdminCreditOverride, CustomerDocument } from '../../types/database';

export interface AdminOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorized: (override: AdminCreditOverride) => void;
  customer: CustomerDocument;
  attemptedAddition: number;
  exceededAmount: number;
}

export const AdminOverrideModal: React.FC<AdminOverrideModalProps> = ({
  isOpen,
  onClose,
  onAuthorized,
  customer,
  attemptedAddition,
  exceededAmount,
}) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError('Please provide a business justification / reason for this credit override.');
      return;
    }

    setIsVerifying(true);
    try {
      if (isAdmin && currentUser) {
        // Current user is legitimately authenticated as Admin
        const override: AdminCreditOverride = {
          authorizedByUserId: currentUser.uid,
          authorizedByEmail: currentUser.email || 'admin@sadiqbookagency.com',
          authorizedAt: new Date().toISOString(),
          reason: reason.trim(),
          exceededAmount: Math.round(exceededAmount * 100) / 100,
        };
        onAuthorized(override);
        onClose();
        return;
      }

      // Cashier context: Unsafe client-side auth switching is permanently disabled per security policy (Fix 3 & Fix 9).
      // A client-side signInWithEmailAndPassword replaces the cashier session, which is insecure and prohibited.
      setError(
        'Credit Limit Overrides cannot be authorized from a Cashier session without a dedicated trusted backend service. Please have an Administrator log into their account on this terminal to approve, or adjust the credit amount to fit within the customer approved limit.'
      );
      setIsVerifying(false);
      return;
    } catch (err: any) {
      console.error('Admin authorization failed:', err);
      setError(err.message || 'Invalid administrator credentials. Override was rejected.');
    } finally {
      setIsVerifying(false);
    }
  };

  const newTotalBalance = (customer.currentBalance || 0) + attemptedAddition;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-amber-200" />
            <div>
              <h3 className="font-bold text-lg leading-tight">Admin Credit Limit Override</h3>
              <p className="text-xs text-amber-100">Customer exceeds approved credit limit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-amber-100 hover:text-white hover:bg-amber-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Financial Breakdown Card */}
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Customer:</span>
              <span className="font-bold text-slate-900">{customer.shopName || customer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Approved Credit Limit:</span>
              <span className="font-semibold text-slate-900">PKR {customer.creditLimit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Current Balance (Udhaar):</span>
              <span className="font-semibold text-slate-900">PKR {(customer.currentBalance || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">New Debt from this Sale:</span>
              <span className="font-bold text-amber-900">+PKR {attemptedAddition.toLocaleString()}</span>
            </div>
            <div className="border-t border-amber-200 pt-1.5 flex justify-between font-bold">
              <span className="text-slate-700">New Total Balance:</span>
              <span className="text-red-700">PKR {newTotalBalance.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-black text-red-600">
              <span>Amount Exceeding Limit:</span>
              <span>PKR {exceededAmount.toLocaleString()}</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isAdmin ? (
              <div className="space-y-3 bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-900">
                <div className="text-xs font-bold flex items-center gap-1.5 text-amber-800">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  <span>Admin Session Required</span>
                </div>
                <p className="text-xs leading-relaxed text-amber-800">
                  Credit Limit Overrides cannot be approved from a Cashier session. To authorize an override, an Administrator must sign in with their own account on this workstation.
                </p>
                <p className="text-xs font-medium text-amber-900">
                  Please collect payment or adjust the order to stay within the customer's approved credit limit.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Authorization Justification / Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Approved by Owner: Customer promised settlement by end of week."
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isVerifying}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                {isAdmin ? 'Cancel Override' : 'Close'}
              </button>
              {isAdmin && (
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isVerifying ? 'Verifying...' : 'Authorize Override & Proceed'}</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

