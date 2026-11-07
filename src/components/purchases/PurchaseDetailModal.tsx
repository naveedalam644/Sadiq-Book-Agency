import React from 'react';
import { Calendar, Building2, CreditCard } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { PurchaseDocument } from '../../types/database';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export interface PurchaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: PurchaseDocument | null;
}

export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({
  isOpen,
  onClose,
  purchase,
}) => {
  if (!purchase) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Purchase Invoice: ${purchase.purchaseInvoiceNo}`}
      description={`Supplier: ${purchase.supplierName} | Date: ${purchase.purchaseDate}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-500 font-mono">
            Intake ID: {purchase.id}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Invoice
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
          <div>
            <span className="text-slate-400 block mb-0.5">Supplier / Publisher:</span>
            <span className="font-bold text-slate-800 text-sm flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[#071F49]" />
              {purchase.supplierName}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block mb-0.5">Payment Method:</span>
            <span className="font-semibold text-slate-800 capitalize flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-[#071F49]" />
              {purchase.paymentMethod.replace('_', ' ')}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block mb-0.5">Purchase Date:</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#071F49]" />
              {purchase.purchaseDate}
            </span>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-[#071F49] text-white px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#F5B51B]">
              Itemized Stock Intake Lines ({purchase.items.length})
            </span>
            <span className="text-[11px] text-slate-300">
              Total Inflow: {formatNumber(purchase.items.reduce((s, i) => s + i.quantity, 0))} units
            </span>
          </div>

          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase">
              <tr>
                <th className="px-3.5 py-2.5">#</th>
                <th className="px-3.5 py-2.5">Product / Book Title</th>
                <th className="px-3.5 py-2.5 text-center">Quantity</th>
                <th className="px-3.5 py-2.5 text-right">MRP</th>
                <th className="px-3.5 py-2.5 text-right">Pub Disc %</th>
                <th className="px-3.5 py-2.5 text-right">Unit Cost</th>
                <th className="px-3.5 py-2.5 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchase.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="px-3.5 py-2 text-slate-400 font-mono">{idx + 1}</td>
                  <td className="px-3.5 py-2 font-medium text-slate-800">{item.productName}</td>
                  <td className="px-3.5 py-2 text-center font-mono font-semibold text-slate-700">
                    +{formatNumber(item.quantity)}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-slate-600">
                    {item.mrp !== undefined && item.mrp > 0 ? formatCurrency(item.mrp) : '—'}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-slate-600">
                    {item.publisherDiscountPercent !== undefined && item.publisherDiscountPercent > 0 ? `${item.publisherDiscountPercent}%` : '—'}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-slate-600">
                    {formatCurrency(item.unitCost)}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(item.totalCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Settlement Breakdown */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between gap-4 text-xs">
          <div className="space-y-1">
            <span className="font-semibold text-slate-700 block">Notes / Shipping Remarks:</span>
            <p className="text-slate-500 italic">{purchase.notes || 'No remarks recorded.'}</p>
          </div>

          <div className="sm:w-64 space-y-1.5 divide-y divide-slate-200">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Gross Subtotal:</span>
              <span className="font-mono font-semibold text-slate-800">{formatCurrency(purchase.subtotal)}</span>
            </div>
            {purchase.discountAmount > 0 && (
              <div className="flex justify-between py-1 text-emerald-600">
                <span>Trade Discount:</span>
                <span className="font-mono font-semibold">-{formatCurrency(purchase.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between py-1.5 text-sm font-bold text-[#071F49]">
              <span>Grand Total:</span>
              <span className="font-mono">{formatCurrency(purchase.grandTotal)}</span>
            </div>
            <div className="flex justify-between py-1 text-emerald-700">
              <span>Paid Amount:</span>
              <span className="font-mono font-semibold">-{formatCurrency(purchase.paidAmount)}</span>
            </div>
            <div className="flex justify-between py-1 font-bold text-rose-700">
              <span>Remaining Balance:</span>
              <span className="font-mono">{formatCurrency(purchase.remainingBalance)}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
