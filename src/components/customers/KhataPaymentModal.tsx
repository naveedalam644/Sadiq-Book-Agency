import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Receipt } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import { WhatsAppIcon } from '../common/WhatsAppIcon';
import type { CustomerDocument, PaymentDocument } from '../../types/database';
import { recordCustomerPaymentTransaction } from '../../services/ledgerService';
import { formatCurrency } from '../../utils/formatters';
import { WhatsAppMessageModal } from '../common/WhatsAppMessageModal';
import { buildPaymentReceivedWhatsAppMessage } from '../../utils/whatsappTemplates';

export interface KhataPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerDocument | null;
  onSuccess: () => void;
}

export const KhataPaymentModal: React.FC<KhataPaymentModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer' | 'cheque'>('cash');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Success state with receipt info
  const [paymentSuccess, setPaymentSuccess] = useState<{
    receiptNo: string;
    amount: number;
    paymentMode: 'cash' | 'bank_transfer' | 'cheque';
    transactionReference?: string;
    paymentDate: string;
    newBalance: number;
  } | null>(null);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);

  useEffect(() => {
    if (isOpen && customer) {
      const bal = customer.currentBalance || 0;
      setAmount(bal > 0 ? bal : '');
      setPaymentMode('cash');
      setTransactionReference('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setFormError(null);
      setIsSubmitting(false);
      setPaymentSuccess(null);
      setIsWhatsAppOpen(false);
    }
  }, [isOpen, customer]);

  const handleClose = () => {
    setPaymentSuccess(null);
    setIsWhatsAppOpen(false);
    onClose();
  };

  const currentBal = customer?.currentBalance || 0;
  const numAmount = Number(amount) || 0;
  const remainingBalance = Math.round((currentBal - numAmount) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customer) {
      setFormError('Customer is missing.');
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setFormError('Please enter a valid payment amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await recordCustomerPaymentTransaction({
        customerId: customer.id,
        amount: numAmount,
        paymentMode,
        transactionReference: transactionReference.trim() || undefined,
        paymentDate,
        notes: notes.trim() || undefined,
      });

      setPaymentSuccess({
        receiptNo: result.receiptNo,
        amount: numAmount,
        paymentMode,
        transactionReference: transactionReference.trim() || undefined,
        paymentDate,
        newBalance: result.newBalance,
      });

      onSuccess();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to record Khata payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentDocSnapshot: PaymentDocument | null = paymentSuccess && customer ? {
    id: 'receipt_' + paymentSuccess.receiptNo,
    receiptNo: paymentSuccess.receiptNo,
    targetType: 'customer_credit',
    referenceId: customer.id,
    partyName: customer.name,
    amount: paymentSuccess.amount,
    paymentDate: paymentSuccess.paymentDate,
    paymentMode: paymentSuccess.paymentMode,
    transactionReference: paymentSuccess.transactionReference,
    receivedByUserId: 'cashier',
    notes: notes.trim() || undefined,
    createdAt: new Date().toISOString(),
  } : null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={paymentSuccess ? "Payment Receipt Voucher" : "Record Customer Khata Payment Receipt"}
        description={`Customer: ${customer?.shopName ? `${customer.shopName} (${customer.name})` : customer?.name || ''}`}
        size="md"
        footer={
          paymentSuccess ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Receipt #{paymentSuccess.receiptNo} Recorded
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWhatsAppOpen(true)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  <span>Share on WhatsApp</span>
                </button>
                <Button variant="outline" type="button" onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-slate-500">
                Post-Payment Balance:{' '}
                <span
                  className={`font-mono font-bold ${
                    remainingBalance > 0
                      ? 'text-rose-600'
                      : remainingBalance < 0
                      ? 'text-sky-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {formatCurrency(remainingBalance)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" type="button" onClick={handleClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant="gold"
                  type="submit"
                  form="khata-payment-form"
                  isLoading={isSubmitting}
                  disabled={isSubmitting || !numAmount || numAmount <= 0}
                >
                  Record Payment
                </Button>
              </div>
            </div>
          )
        }
      >
        {paymentSuccess ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-emerald-900">Payment Successfully Recorded</h4>
                <p className="text-xs text-emerald-700">
                  Customer ledger and balance have been updated atomically. You can now share a professional WhatsApp receipt voucher directly with the customer.
                </p>
              </div>
            </div>

            {/* Receipt Summary Card */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/80">
                <span className="text-slate-500 flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5" /> Receipt Number:
                </span>
                <span className="font-mono font-bold text-slate-900">{paymentSuccess.receiptNo}</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/80">
                <span className="text-slate-500">Payment Date:</span>
                <span className="font-medium text-slate-800">{paymentSuccess.paymentDate}</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/80">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="font-semibold text-slate-800 uppercase text-[11px] bg-slate-200/60 px-2 py-0.5 rounded">
                  {paymentSuccess.paymentMode.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/80">
                <span className="text-slate-500">Amount Received:</span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  {formatCurrency(paymentSuccess.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">New Khata Balance:</span>
                <span
                  className={`font-mono font-black text-sm ${
                    paymentSuccess.newBalance > 0
                      ? 'text-rose-700'
                      : paymentSuccess.newBalance < 0
                      ? 'text-sky-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(paymentSuccess.newBalance)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <form id="khata-payment-form" onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Current Outstanding Balance Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Current Outstanding Balance
                </span>
                <span
                  className={`font-mono text-lg font-black ${
                    currentBal > 0 ? 'text-rose-700' : currentBal < 0 ? 'text-sky-700' : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(currentBal)}
                </span>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                {currentBal > 0 ? (
                  <span className="bg-rose-100/70 text-rose-800 font-bold px-2 py-0.5 rounded-full border border-rose-200">
                    Customer Owes Udhaar
                  </span>
                ) : currentBal < 0 ? (
                  <span className="bg-sky-100/70 text-sky-800 font-bold px-2 py-0.5 rounded-full border border-sky-200">
                    Advance Deposit Balance
                  </span>
                ) : (
                  <span className="bg-emerald-100/70 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                    Account Fully Cleared
                  </span>
                )}
              </div>
            </div>

            {/* Payment Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Payment Amount Received (PKR) *"
                type="number"
                min="1"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Payment Mode *"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                options={[
                  { value: 'cash', label: 'Cash at Counter' },
                  { value: 'bank_transfer', label: 'Bank Transfer (Meezan / HBL / EasyPaisa)' },
                  { value: 'cheque', label: 'Bank Cheque' },
                ]}
              />

              <Input
                label={paymentMode === 'cheque' ? 'Cheque Number *' : 'Transaction / Deposit Ref'}
                placeholder={paymentMode === 'cheque' ? 'e.g. CHQ-99042' : 'e.g. TID-77881 / Cash Slip'}
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                required={paymentMode === 'cheque'}
              />
            </div>

            <Input
              label="Remarks / Voucher Notes"
              placeholder="e.g. Paid by brother Haji Aslam at shop / Weekly installment"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <p className="text-[10px] text-slate-400 italic">
              * A Firestore double-entry transaction will execute atomically: reducing customer balance, recording an immutable ledger credit entry, and generating a payment voucher.
            </p>
          </form>
        )}
      </Modal>

      {/* WhatsApp Payment Receipt Modal */}
      {isWhatsAppOpen && paymentSuccess && customer && paymentDocSnapshot && (
        <WhatsAppMessageModal
          isOpen={isWhatsAppOpen}
          onClose={() => setIsWhatsAppOpen(false)}
          initialCustomerName={customer.name}
          initialPhone={customer.phone || ''}
          customerId={customer.id}
          messageType="payment_receipt"
          relatedInvoiceNo={paymentSuccess.receiptNo}
          defaultMessageText={buildPaymentReceivedWhatsAppMessage({
            payment: paymentDocSnapshot,
            customerName: customer.name,
            updatedBalance: paymentSuccess.newBalance,
          })}
        />
      )}
    </>
  );
};
