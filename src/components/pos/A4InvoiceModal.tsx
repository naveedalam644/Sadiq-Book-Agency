import React, { useState, useEffect } from 'react';
import { Printer, X, FileText, Phone, MapPin, Check } from 'lucide-react';
import type { SaleDocument, CustomerDocument } from '../../types/database';
import { formatDate, amountToWords, formatInvoiceDisplay } from '../../utils/formatters';
import { WhatsAppMessageModal } from '../common/WhatsAppMessageModal';
import { WhatsAppIcon } from '../common/WhatsAppIcon';
import { buildInvoiceWhatsAppMessage } from '../../utils/whatsappTemplates';
import { getCustomerById } from '../../services/customerService';

export interface A4InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleDocument | null;
  defaultPaperSize?: 'A4' | 'A5';
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({
  isOpen,
  onClose,
  sale,
  defaultPaperSize = 'A4',
}) => {
  const [paperSize, setPaperSize] = useState<'A4' | 'A5'>(defaultPaperSize);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerDocument | null>(null);

  useEffect(() => {
    if (sale?.customerId) {
      getCustomerById(sale.customerId)
        .then(setCustomerData)
        .catch(() => setCustomerData(null));
    } else {
      setCustomerData(null);
    }
  }, [sale?.customerId]);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  const isCreditSale = sale.paymentMethod === 'credit' || (sale.balanceAddedToCredit || 0) > 0;
  const totalQuantity = sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const formattedInvoiceNo = formatInvoiceDisplay(sale.invoiceNo);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6">
      {/* Modal Dialog Container */}
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-300 flex flex-col my-auto max-h-[96vh]">
        {/* Controls Header (Hidden during physical print) */}
        <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-[#071F49] text-white print:hidden shrink-0 gap-3 border-b-2 border-[#F5B51B]">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#F5B51B]" />
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                Tax & Commercial Invoice
              </h3>
              <p className="text-[11px] text-slate-300">
                {formattedInvoiceNo} • {isCreditSale ? 'Credit Bill (Khata)' : 'Cash Memo'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Paper Size Selector */}
            <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPaperSize('A4')}
                className={`px-3 py-1.5 rounded transition-colors ${
                  paperSize === 'A4'
                    ? 'bg-[#F5B51B] text-[#071F49] font-black'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                A4 Standard
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('A5')}
                className={`px-3 py-1.5 rounded transition-colors ${
                  paperSize === 'A5'
                    ? 'bg-[#F5B51B] text-[#071F49] font-black'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                A5 Half Page
              </button>
            </div>

            {/* WhatsApp Share Button */}
            <button
              type="button"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              title="Share Invoice on WhatsApp"
            >
              <WhatsAppIcon className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            {/* Quick Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-4 py-1.5 bg-[#F5B51B] hover:bg-amber-400 text-[#071F49] rounded-lg font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Printing...' : 'Print'}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Canvas Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-100 flex justify-center print:p-0 print:m-0 print:bg-white print:overflow-visible">
          {/* Printable Invoice Paper Sheet */}
          <div
            id="a4-invoice-sheet"
            className={`bg-white text-black font-sans mx-auto transition-all shadow-md print:shadow-none print:border-none border border-slate-300 ${
              paperSize === 'A4'
                ? 'w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-10'
                : 'w-full max-w-[210mm] min-h-[148mm] p-6'
            }`}
            style={{ boxSizing: 'border-box' }}
          >
            {/* 1. SHOP HEADER */}
            <div className="text-center border-b-2 border-black pb-3 mb-4">
              <h1 className="text-2xl sm:text-3xl font-black tracking-wide text-black uppercase mb-1">
                SADIQ BOOK AGENCY
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-widest mb-1.5">
                Wholesale & Retail Booksellers
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-black">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-black inline" />
                  Address: <strong className="font-bold">Udyana Market Mingora Swat</strong>
                </span>
                <span className="text-slate-400">|</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-black inline" />
                  Contact No: <strong className="font-mono font-bold">03449633526 , 03425822259, 03035822258</strong>
                </span>
              </div>
            </div>

            {/* 2. INVOICE META & CUSTOMER DETAILS (CLEAN TABLE - NO OVERWRITING) */}
            <div className="border border-black rounded-sm mb-4 text-xs">
              <div className="grid grid-cols-2 divide-x divide-black">
                {/* Left Side: Customer Info */}
                <div className="p-2.5 space-y-1">
                  <div className="flex">
                    <span className="w-24 font-bold text-slate-700">Customer:</span>
                    <span className="font-black text-black text-sm uppercase">
                      {sale.customerName || 'Walk-in Cash Customer'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-24 font-bold text-slate-700">Type:</span>
                    <span className="font-semibold text-black capitalize">
                      {sale.customerType === 'wholesaler'
                        ? 'Wholesaler'
                        : sale.customerType === 'marketshop'
                        ? 'Market Shop'
                        : 'Parchon (Counter)'}
                    </span>
                  </div>
                  {sale.customerId && (
                    <div className="flex">
                      <span className="w-24 font-bold text-slate-700">Account ID:</span>
                      <span className="font-mono font-semibold text-black">{sale.customerId}</span>
                    </div>
                  )}
                </div>

                {/* Right Side: Invoice Info */}
                <div className="p-2.5 space-y-1 bg-slate-50/50">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700">Invoice No:</span>
                    <span className="font-mono font-black text-black text-sm">
                      {formattedInvoiceNo}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700">Date:</span>
                    <span className="font-semibold text-black">
                      {formatDate(sale.saleDate || sale.createdAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700">Bill Type:</span>
                    <span className="font-bold text-black uppercase">
                      {isCreditSale ? 'Credit Bill (Khata)' : 'Cash Memo'}
                    </span>
                  </div>
                  {sale.dueDate && (
                    <div className="flex justify-between items-center text-red-700 font-bold border-t border-slate-300 pt-0.5">
                      <span>Due Date:</span>
                      <span className="font-mono">{sale.dueDate}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. ITEM TABLE (CLEAN, NO CONFIDENTIAL DISCOUNT COLUMNS) */}
            <div className="border border-black mb-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-black font-bold uppercase text-[11px]">
                    <th className="py-2 px-2 text-center w-10 border-r border-black">Sr.</th>
                    <th className="py-2 px-3 border-r border-black">Book Title / Description</th>
                    <th className="py-2 px-2.5 border-r border-black w-36">Publisher</th>
                    <th className="py-2 px-2 text-center w-14 border-r border-black">Qty</th>
                    <th className="py-2 px-3 text-right w-24 border-r border-black">Rate (PKR)</th>
                    <th className="py-2 px-3 text-right w-28">Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 text-xs">
                  {sale.items.map((item, idx) => {
                    // Net rate per book (after confidential customer discount)
                    const unitRate = item.quantity > 0 ? item.lineTotal / item.quantity : item.sellingPrice || item.unitPrice || 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-2 text-center font-mono border-r border-black text-slate-600">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 border-r border-black">
                          <div className="font-bold text-black leading-snug">
                            {item.productName}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 border-r border-black text-slate-700">
                          {item.publisherName || '—'}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-black border-r border-black">
                          {item.quantity}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-black border-r border-black">
                          {unitRate.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-black">
                          {item.lineTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 4. FINANCIAL SUMMARY & WORDS (NO CONFIDENTIAL DISCOUNT SHOWN) */}
            <div className="grid grid-cols-12 gap-3 mb-6 text-xs">
              {/* Left Column: Words & Terms */}
              <div className="col-span-7 flex flex-col justify-between border border-black p-3 rounded-sm space-y-2">
                <div>
                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-0.5">
                    Amount In Words:
                  </div>
                  <div className="font-bold text-black text-xs italic">
                    {amountToWords(sale.grandTotal)}
                  </div>
                </div>

                <div className="text-[10px] text-slate-600 pt-2 border-t border-slate-300 space-y-0.5">
                  <p className="font-bold text-black uppercase">Terms & Conditions:</p>
                  <p>1. Please check books at delivery. Exchange possible within 3 days with this bill.</p>
                  <p>2. Stamped, pencil/pen marked, torn, or damaged books cannot be returned.</p>
                  <p>3. Official computer-generated bill of Sadiq Book Agency.</p>
                </div>
              </div>

              {/* Right Column: Clean Totals */}
              <div className="col-span-5 border border-black rounded-sm overflow-hidden divide-y divide-slate-300 text-xs">
                <div className="flex justify-between py-1.5 px-3 bg-slate-50">
                  <span className="font-semibold text-slate-700">Total Quantity:</span>
                  <span className="font-bold text-black font-mono">{totalQuantity} Books</span>
                </div>

                <div className="flex justify-between py-2 px-3 bg-slate-100 font-bold border-t border-b border-black">
                  <span className="text-black text-sm uppercase">Total Amount:</span>
                  <span className="text-sm font-black font-mono text-black">
                    PKR {sale.grandTotal.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 px-3">
                  <span className="font-semibold text-slate-700">Cash Received / Paid:</span>
                  <span className="font-bold text-black font-mono">
                    PKR {sale.paymentApplied.toFixed(2)}
                  </span>
                </div>

                {sale.changeReturned > 0 && (
                  <div className="flex justify-between py-1.5 px-3 text-emerald-800">
                    <span className="font-semibold">Change Returned:</span>
                    <span className="font-bold font-mono">
                      PKR {sale.changeReturned.toFixed(2)}
                    </span>
                  </div>
                )}

                {sale.balanceAddedToCredit > 0 && (
                  <div className="flex justify-between py-1.5 px-3 bg-red-50 text-red-900 font-bold">
                    <span>Balance (Khata Debit):</span>
                    <span className="font-mono">
                      PKR {sale.balanceAddedToCredit.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. SIGNATURES */}
            <div className="pt-8 mt-4 border-t border-slate-400">
              <div className="flex justify-between items-end text-xs text-black px-4">
                <div className="text-center w-48">
                  <div className="border-b border-black mb-1.5" />
                  <span className="font-bold text-[11px] uppercase">Customer's Signature</span>
                </div>

                <div className="text-center w-48">
                  <div className="border-b border-black mb-1.5" />
                  <span className="font-bold text-[11px] uppercase">Authorized Signature / Stamp</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer (Hidden on print) */}
        <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-100 border-t border-slate-300 print:hidden shrink-0 gap-3">
          <div className="text-xs text-slate-600 flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Paper: {paperSize === 'A4' ? 'A4 Standard (Full Page)' : 'A5 (Half Page)'}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-200 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-6 py-2 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#F5B51B]" />
              <span>{isPrinting ? 'Printing Invoice...' : 'Print Invoice'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Print Media Stylesheet for Exact A4 Setup */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #a4-invoice-sheet, #a4-invoice-sheet * {
            visibility: visible !important;
          }
          #a4-invoice-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
          }
          @page {
            size: ${paperSize === 'A4' ? 'A4 portrait' : 'A5 landscape'};
            margin: 6mm 8mm;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* WhatsApp Message Editor Modal */}
      {isWhatsAppModalOpen && (
        <WhatsAppMessageModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          initialCustomerName={sale.customerName}
          initialPhone={customerData?.phone || ''}
          customerId={sale.customerId}
          defaultMessageText={buildInvoiceWhatsAppMessage({ sale, customer: customerData })}
          messageType="invoice"
          sale={sale}
          relatedInvoiceNo={sale.invoiceNo}
        />
      )}
    </div>
  );
};
