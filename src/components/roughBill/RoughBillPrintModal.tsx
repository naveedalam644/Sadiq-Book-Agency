import React from 'react';
import { Printer, Receipt, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { WhatsAppIcon } from '../common/WhatsAppIcon';
import type { RoughBillDocument } from '../../types/database';
import { formatCurrency } from '../../utils/formatters';
import { openWhatsAppWebChat } from '../../services/whatsappService';

export interface RoughBillPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: RoughBillDocument | null;
}

export const RoughBillPrintModal: React.FC<RoughBillPrintModalProps> = ({
  isOpen,
  onClose,
  bill,
}) => {
  const navigate = useNavigate();
  if (!bill) return null;

  const isPublisherOrder = bill.billType === 'publisher_order';

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const headerTitle = isPublisherOrder ? '📦 PURCHASE ORDER' : '📋 ESTIMATE / QUOTATION';
    const lines = [
      `*${headerTitle}*`,
      `*SADIQ BOOK AGENCY*`,
      `--------------------------------`,
      `*Bill No:* ${bill.billNo}`,
      `*Party / Name:* ${bill.partyName}`,
      bill.phone ? `*Phone:* ${bill.phone}` : null,
      `*Date:* ${bill.date}`,
      `--------------------------------`,
      `*ITEMS:*`,
      ...bill.items.map(
        (i, idx) =>
          `${idx + 1}. ${i.title} (${i.publisherName || 'SBA'})\n   Qty: ${i.quantity} x Rs. ${i.unitPrice}${i.discountPercent ? ` (-${i.discountPercent}%)` : ''} = *Rs. ${i.lineTotal}*`
      ),
      `--------------------------------`,
      `*Total Items:* ${bill.items.reduce((acc, i) => acc + i.quantity, 0)}`,
      `*Grand Total:* *Rs. ${bill.grandTotal}*`,
      `--------------------------------`,
      isPublisherOrder
        ? `Please confirm delivery & stock availability.\nThank you! • Sadiq Book Agency`
        : `*Notice:* This is an informal estimate / quotation only, not an official tax invoice.\nThank you for choosing Sadiq Book Agency!`,
    ]
      .filter(Boolean)
      .join('\n');

    openWhatsAppWebChat(bill.phone || '', lines);
  };

  const handleLoadInPOS = () => {
    try {
      sessionStorage.setItem(
        'sba_preload_rough_bill',
        JSON.stringify({
          billNo: bill.billNo,
          partyName: bill.partyName,
          items: bill.items,
        })
      );
      navigate('/pos');
    } catch {
      navigate('/pos');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isPublisherOrder ? 'Publisher Order Draft' : 'Customer Quotation'}
      size="lg"
    >
      <div className="space-y-4">
        {/* Printable Letterhead Area */}
        <div id="printable-rough-bill" className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4 text-slate-800 shadow-xs">
          {/* Header */}
          <div className="text-center border-b-2 border-[#071F49] pb-3">
            <h2 className="text-xl font-black text-[#071F49] tracking-wider uppercase">
              SADIQ BOOK AGENCY
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Books • Notebooks • Registers • School Syllabi • Stationery
            </p>
            <div className="inline-block mt-2 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-xs font-black uppercase tracking-wider">
              {isPublisherOrder
                ? '📦 PURCHASE ORDER DRAFT'
                : '📋 ESTIMATE / QUOTATION — NOT A TAX INVOICE'}
            </div>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">{isPublisherOrder ? 'Publisher / Supplier:' : 'Customer / School:'}</span>
              <span className="font-bold text-sm text-[#071F49] block">{bill.partyName}</span>
              {bill.phone && <span className="text-slate-600 block">Phone: {bill.phone}</span>}
              {bill.title && <span className="text-slate-500 italic block mt-0.5">{bill.title}</span>}
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Reference No:</span>
              <span className="font-mono font-bold text-sm text-slate-900 block">{bill.billNo}</span>
              <span className="text-slate-600 block">Date: {bill.date}</span>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#071F49] text-white">
                <th className="p-2 text-center w-8">#</th>
                <th className="p-2">Item Description</th>
                <th className="p-2 text-center w-16">Qty</th>
                <th className="p-2 text-right w-20">Rate</th>
                {bill.totalDiscount > 0 && <th className="p-2 text-center w-16">Disc %</th>}
                <th className="p-2 text-right w-24">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bill.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                  <td className="p-2">
                    <span className="font-bold text-slate-900 block">{item.title}</span>
                    <span className="text-[10px] text-slate-500">
                      {item.publisherName ? `${item.publisherName} • ` : ''}
                      SKU: {item.sku}
                    </span>
                  </td>
                  <td className="p-2 text-center font-mono font-bold">{item.quantity}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                  {bill.totalDiscount > 0 && (
                    <td className="p-2 text-center font-bold text-emerald-700">
                      {item.discountPercent ? `${item.discountPercent}%` : '-'}
                    </td>
                  )}
                  <td className="p-2 text-right font-mono font-bold text-[#071F49]">
                    {formatCurrency(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300">
              <tr>
                <td colSpan={bill.totalDiscount > 0 ? 4 : 3} className="p-2 text-right font-bold text-slate-600">
                  Subtotal:
                </td>
                <td colSpan={2} className="p-2 text-right font-mono font-bold text-slate-800">
                  {formatCurrency(bill.subtotal)}
                </td>
              </tr>
              {bill.totalDiscount > 0 && (
                <tr>
                  <td colSpan={4} className="p-2 text-right font-bold text-emerald-700">
                    Total Discount:
                  </td>
                  <td colSpan={2} className="p-2 text-right font-mono font-bold text-emerald-700">
                    -{formatCurrency(bill.totalDiscount)}
                  </td>
                </tr>
              )}
              <tr className="bg-slate-100">
                <td colSpan={bill.totalDiscount > 0 ? 4 : 3} className="p-2.5 text-right font-black text-sm text-[#071F49]">
                  Estimated Grand Total:
                </td>
                <td colSpan={2} className="p-2.5 text-right font-mono font-black text-base text-[#071F49]">
                  {formatCurrency(bill.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Notes */}
          {bill.notes && (
            <div className="p-2.5 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200">
              <strong>Notes / Remarks:</strong> {bill.notes}
            </div>
          )}

          {/* Safety Disclaimer Banner */}
          <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center gap-2 text-[11px] text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Notice: This is an informal estimate/order draft. It strictly does not alter physical store inventory or customer ledger balances.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 flex-wrap">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Printer className="w-4 h-4 text-[#071F49]" />}
            >
              Print Rough Bill
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleShareWhatsApp}
              leftIcon={<WhatsAppIcon className="w-4 h-4" />}
            >
              Share on WhatsApp
            </Button>

            {!isPublisherOrder && (
              <Button
                type="button"
                variant="gold"
                size="sm"
                onClick={handleLoadInPOS}
                leftIcon={<Receipt className="w-4 h-4 text-[#071F49]" />}
              >
                Convert to POS Bill
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
