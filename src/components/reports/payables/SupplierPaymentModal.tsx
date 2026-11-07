import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../common/Modal';
import { Input } from '../../common/Input';
import { Select } from '../../common/Select';
import { Button } from '../../common/Button';
import type { SupplierDocument } from '../../../types/database';
import { recordSupplierPaymentTransaction } from '../../../services/supplierService';
import { formatCurrency } from '../../../utils/money';

export interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: SupplierDocument | null;
  onSuccess: () => void;
}

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer' | 'cheque'>('cash');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && supplier) {
      const bal = Number(supplier.currentBalance) || 0;
      setAmount(bal > 0 ? bal : '');
      setPaymentMode('cash');
      setTransactionReference('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setReceiptNo('');
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, supplier]);

  const currentBal = Number(supplier?.currentBalance) || 0;
  const numAmount = Number(amount) || 0;
  const remainingBalance = Math.round((currentBal - numAmount) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!supplier) {
      setFormError('Supplier is missing.');
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setFormError('Please enter a valid payment amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordSupplierPaymentTransaction({
        supplierId: supplier.id,
        amount: numAmount,
        paymentMode,
        transactionReference: transactionReference.trim() || undefined,
        paymentDate,
        receiptNo: receiptNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to record supplier payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!supplier) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Record Payment to Supplier: ${supplier.companyName}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{formError}</span>
          </div>
        )}

        {/* Balance Status Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
              Current Payable Liability
            </span>
            <span className="text-lg font-black text-rose-600">
              {formatCurrency(currentBal)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
              Remaining After Payment
            </span>
            <span
              className={`text-lg font-black ${
                remainingBalance <= 0 ? 'text-emerald-600' : 'text-slate-800'
              }`}
            >
              {formatCurrency(remainingBalance)}
            </span>
          </div>
        </div>

        {/* Payment Amount & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Payment Amount (PKR) *"
            type="number"
            min="1"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="e.g. 50000"
            required
            autoFocus
          />

          <Input
            label="Payment Date *"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
          />
        </div>

        {/* Payment Mode */}
        <Select
          label="Payment Method *"
          value={paymentMode}
          onChange={(e) =>
            setPaymentMode(e.target.value as 'cash' | 'bank_transfer' | 'cheque')
          }
          options={[
            { value: 'cash', label: 'Cash (Drawer Outflow)' },
            { value: 'bank_transfer', label: 'Bank Transfer (Online/Bank Account)' },
            { value: 'cheque', label: 'Cheque / Clearing Voucher' },
          ]}
          required
        />

        {/* Reference / Cheque No & Voucher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={paymentMode === 'cheque' ? 'Cheque Number' : 'Transaction Ref / Slip #'}
            type="text"
            value={transactionReference}
            onChange={(e) => setTransactionReference(e.target.value)}
            placeholder={paymentMode === 'cheque' ? 'e.g. CHQ-481920' : 'e.g. TXN-10293'}
          />

          <Input
            label="Receipt / Voucher # (Optional)"
            type="text"
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="Leave empty for auto-generated"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Payment Notes / Remarks
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            placeholder="e.g. Settled outstanding bill #INV-2026-081"
          />
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-[#071F49] hover:bg-[#071F49]/90 text-white font-bold"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              'Recording Payment...'
            ) : (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Record Settlement ({formatCurrency(numAmount)})
              </span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
