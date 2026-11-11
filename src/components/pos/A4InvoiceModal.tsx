import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, Phone, MapPin, Check, Receipt, Download } from 'lucide-react';
import type { SaleDocument, CustomerDocument } from '../../types/database';
import { formatDate, amountToWords, formatInvoiceDisplay } from '../../utils/formatters';
import { WhatsAppMessageModal } from '../common/WhatsAppMessageModal';
import { WhatsAppIcon } from '../common/WhatsAppIcon';
import { buildInvoiceWhatsAppMessage } from '../../utils/whatsappTemplates';
import { getCustomerById } from '../../services/customerService';
import { downloadInvoicePdf } from '../../utils/invoicePdfGenerator';

const PRINTER_STORAGE_KEY = 'sba_pos_printer_type';

export interface A4InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleDocument | null;
  defaultPaperSize?: 'A4' | 'A5' | 'thermal';
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({
  isOpen,
  onClose,
  sale,
  defaultPaperSize = 'A4',
}) => {
  // Initialize from persisted store preference if present
  const [paperSize, setPaperSize] = useState<'A4' | 'A5' | 'thermal'>(() => {
    try {
      const saved = localStorage.getItem(PRINTER_STORAGE_KEY) as 'A4' | 'A5' | 'thermal';
      if (saved === 'A4' || saved === 'A5' || saved === 'thermal') {
        return saved;
      }
    } catch {
      // Ignore
    }
    return defaultPaperSize;
  });

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

  const handlePaperSizeChange = (size: 'A4' | 'A5' | 'thermal') => {
    setPaperSize(size);
    try {
      localStorage.setItem(PRINTER_STORAGE_KEY, size);
    } catch {
      // Ignore
    }
  };

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

  const modalContent = (
    <div className="a4-print-modal-root fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 print:p-0 print:m-0 print:bg-white print:static print:block print:overflow-visible">
      {/* Modal Dialog Container */}
      <div className="a4-modal-dialog-container bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-300 flex flex-col my-auto max-h-[96vh] print:max-w-none print:w-full print:m-0 print:p-0 print:border-none print:shadow-none print:overflow-visible print:static print:block print:max-h-none">
        {/* Controls Header (Hidden during physical print) */}
        <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-[#071F49] text-white print:hidden shrink-0 gap-3 border-b-2 border-[#F5B51B]">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#F5B51B]" />
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                Bill & Invoice Printing
              </h3>
              <p className="text-[11px] text-slate-300">
                {formattedInvoiceNo} • {isCreditSale ? 'Credit Bill (Khata)' : 'Cash Memo'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Dual Printer Switcher: Thermal Machine (80mm) vs A4 / A5 Page */}
            <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handlePaperSizeChange('thermal')}
                className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                  paperSize === 'thermal'
                    ? 'bg-[#F5B51B] text-[#071F49] font-black shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="80mm Thermal Receipt Machine Printer"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Thermal (80mm)</span>
              </button>

              <button
                type="button"
                onClick={() => handlePaperSizeChange('A4')}
                className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                  paperSize === 'A4'
                    ? 'bg-[#F5B51B] text-[#071F49] font-black shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="A4 Standard Full Page Laser/Inkjet Printer"
              >
                A4 Standard
              </button>

              <button
                type="button"
                onClick={() => handlePaperSizeChange('A5')}
                className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                  paperSize === 'A5'
                    ? 'bg-[#F5B51B] text-[#071F49] font-black shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="A5 Half Page Form"
              >
                A5 Half Page
              </button>
            </div>

            {/* Direct Download PDF Button */}
            <button
              type="button"
              onClick={() => downloadInvoicePdf(sale)}
              className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              title="Download Clean Multi-page Invoice PDF"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

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
              <span>{isPrinting ? 'Printing...' : 'Print Bill'}</span>
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
        <div className="a4-modal-scroll-area flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-100 flex justify-center print:p-0 print:m-0 print:bg-white print:overflow-visible print:static print:block">
          {/* ========================================================================= */}
          {/* OPTION 1: THERMAL 80MM RECEIPT MACHINE FORMAT (HIGH-CONTRAST DARK BLACK) */}
          {/* ========================================================================= */}
          {paperSize === 'thermal' ? (
            <div
              id="thermal-receipt-sheet"
              className="bg-white text-black font-mono mx-auto shadow-md border-2 border-black w-[80mm] max-w-[80mm] p-3 text-xs leading-tight print:shadow-none print:border-none print:m-0"
              style={{ boxSizing: 'border-box', color: '#000000' }}
            >
              {/* Thermal Shop Header */}
              <div className="text-center pb-2 mb-2 text-black">
                <h2 className="text-base font-black tracking-wider uppercase text-black">
                  SADIQ BOOK AGENCY
                </h2>
                <p className="text-[10px] text-black uppercase font-bold">
                  Books • Notebooks • Registers • Stationery
                </p>
                <p className="text-[10px] text-black font-semibold">
                  Udyana Market Mingora Swat
                </p>
                <p className="text-[10px] text-black font-bold">
                  Tel: 03449633526 | 03425822259
                </p>
                <div className="border-b-2 border-dashed border-black my-2" />
                <div className="text-[11px] font-black uppercase tracking-wider text-black">
                  {isCreditSale ? 'CREDIT MEMO (KHATA BILL)' : 'CASH SALE RECEIPT'}
                </div>
                <div className="border-b-2 border-dashed border-black my-2" />
              </div>

              {/* Thermal Bill Meta */}
              <div className="text-[11px] space-y-0.5 mb-2 text-black font-semibold">
                <div className="flex justify-between">
                  <span className="font-bold">Bill No:</span>
                  <span className="font-black font-mono">{formattedInvoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Date:</span>
                  <span className="font-bold">{formatDate(sale.saleDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Customer:</span>
                  <span className="font-black truncate max-w-[130px]">
                    {sale.customerName || 'Walk-in Cash Customer'}
                  </span>
                </div>
                {sale.customerType && (
                  <div className="flex justify-between">
                    <span className="font-bold">Party Type:</span>
                    <span className="capitalize font-black">{sale.customerType}</span>
                  </div>
                )}
              </div>

              <div className="border-b-2 border-dashed border-black my-2" />

              {/* Thermal Items Table (7 Columns: S No, Item Description [Title + Publisher + Series], Class, Qty, MRP Price, Sale Price, Total Price) */}
              <div className="text-black my-1">
                <table className="w-full text-black border-collapse text-[10px] leading-tight font-bold">
                  <thead>
                    <tr className="border-b-2 border-black font-black uppercase text-[9px]">
                      <th className="py-1 px-0.5 text-center w-[6%] border-b-2 border-black">S#</th>
                      <th className="py-1 px-1 text-left w-[34%] border-b-2 border-black">Item Description</th>
                      <th className="py-1 px-0.5 text-center w-[12%] border-b-2 border-black">Class</th>
                      <th className="py-1 px-0.5 text-center w-[8%] border-b-2 border-black">Qty</th>
                      <th className="py-1 px-0.5 text-right w-[13%] border-b-2 border-black">MRP Price</th>
                      <th className="py-1 px-0.5 text-right w-[13%] border-b-2 border-black">Sale Price</th>
                      <th className="py-1 px-1 text-right w-[14%] border-b-2 border-black">Total Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items.map((item, idx) => {
                      const mrp = item.unitPrice ?? item.mrp ?? 0;
                      const salePrice =
                        typeof item.effectivePrice === 'number'
                          ? item.effectivePrice
                          : item.quantity > 0
                          ? item.lineTotal / item.quantity
                          : item.sellingPrice ?? item.unitPrice ?? 0;

                      const publisherSeries = [
                        item.publisherName && item.publisherName !== 'Unknown' ? item.publisherName : '',
                        item.seriesName,
                      ]
                        .filter(Boolean)
                        .join(' • ');

                      const itemClass = item.targetClass || (item as any).className || '—';

                      return (
                        <tr key={idx} className="align-top border-b border-black">
                          <td className="py-1 px-0.5 text-center font-black text-black font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-1 px-1 text-left">
                            <div className="thermal-item-title font-black text-black leading-snug break-words">
                              {item.productName}
                            </div>
                            {publisherSeries && (
                              <div className="thermal-item-subtext text-[9px] text-black font-black leading-tight mt-0.5">
                                {publisherSeries}
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-0.5 text-center font-black text-black break-words">
                            {itemClass}
                          </td>
                          <td className="py-1 px-0.5 text-center font-black text-black font-mono">
                            {item.quantity}
                          </td>
                          <td className="py-1 px-0.5 text-right font-mono font-bold text-black">
                            {mrp > 0 ? mrp.toFixed(2) : salePrice.toFixed(2)}
                          </td>
                          <td className="py-1 px-0.5 text-right font-mono font-black text-black">
                            {salePrice.toFixed(2)}
                          </td>
                          <td className="py-1 px-1 text-right font-mono font-black text-black">
                            {item.lineTotal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-b-2 border-dashed border-black my-2" />

              {/* Financial Calculation (Pure solid black for dark thermal printing) */}
              <div className="text-[11px] space-y-1 text-black font-semibold">
                <div className="flex justify-between">
                  <span>Total Items / Qty:</span>
                  <span className="font-black">{totalQuantity} pcs</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono font-bold">Rs. {sale.subtotal.toFixed(2)}</span>
                </div>
                {sale.totalDiscount > 0 && (
                  <div className="flex justify-between font-black text-black">
                    <span>Total Discount:</span>
                    <span className="font-mono">-Rs. {sale.totalDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="border-b-2 border-black my-1" />
                <div className="flex justify-between text-xs font-black text-black">
                  <span>NET PAYABLE:</span>
                  <span className="font-mono text-sm font-black">Rs. {sale.grandTotal.toFixed(2)}</span>
                </div>
                <div className="border-b-2 border-black my-1" />

                {/* Payment Detail */}
                <div className="flex justify-between text-[11px]">
                  <span className="font-bold">Payment Mode:</span>
                  <span className="uppercase font-black">{sale.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="font-bold">Paid Amount:</span>
                  <span className="font-mono font-black">
                    Rs. {(sale.paymentApplied || 0).toFixed(2)}
                  </span>
                </div>
                {(sale.changeReturned || 0) > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="font-bold">Change Returned:</span>
                    <span className="font-mono font-black">
                      Rs. {(sale.changeReturned || 0).toFixed(2)}
                    </span>
                  </div>
                )}
                {isCreditSale && (
                  <>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>Added to Khata:</span>
                      <span className="font-mono font-black">
                        Rs. {(sale.balanceAddedToCredit || 0).toFixed(2)}
                      </span>
                    </div>
                    {customerData && typeof customerData.currentBalance === 'number' && (
                      <div className="flex justify-between text-[11px] font-bold">
                        <span>Current Khata Balance:</span>
                        <span className="font-mono font-black">
                          Rs. {customerData.currentBalance.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {sale.dueDate && (
                      <div className="flex justify-between text-[10px]">
                        <span className="font-bold">Payment Due Date:</span>
                        <span className="font-bold">{formatDate(sale.dueDate)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Thermal Receipt Footer */}
              <div className="text-center pt-3 border-t-2 border-dashed border-black mt-3 space-y-1 text-black">
                <p className="text-[10px] font-black uppercase">THANK YOU FOR YOUR VISIT!</p>
                <p className="text-[9px] text-black font-semibold">
                  Computerized Thermal POS Receipt • Sadiq Book Agency
                </p>
                <p className="text-[8px] text-black font-bold">
                  Prices inclusive of store counter terms
                </p>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* OPTION 2: A4 / A5 FULL-PAGE COMMERCIAL INVOICE FORMAT */
            /* ========================================================================= */
            <div
              id="a4-invoice-sheet"
              className={`bg-white text-black font-sans mx-auto transition-all shadow-md print:shadow-none print:border-none border border-slate-300 print:p-0 print:m-0 print:w-full print:max-w-full print:min-h-0 ${
                paperSize === 'A4'
                  ? 'w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-10'
                  : 'w-full max-w-[210mm] min-h-[148mm] p-6'
              }`}
              style={{ boxSizing: 'border-box' }}
            >
              {/* 1. SHOP HEADER */}
              <div className="text-center border-b-2 border-black pb-3 mb-4 print:pb-2 print:mb-2">
                <h1 className="text-2xl sm:text-3xl print:text-2xl font-black tracking-wide text-black uppercase mb-1">
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

              {/* 2. INVOICE META & CUSTOMER DETAILS */}
              <div className="border border-black rounded-sm mb-4 print:mb-3 text-xs">
                <div className="grid grid-cols-2 divide-x divide-black">
                  {/* Left Side: Customer Info */}
                  <div className="p-2.5 print:p-2 space-y-1">
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
                  <div className="p-2.5 print:p-2 space-y-1 bg-slate-50/50 print:bg-transparent">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700">Invoice No:</span>
                      <span className="font-mono font-black text-black text-sm">
                        {formattedInvoiceNo}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700">Date:</span>
                      <span className="font-mono text-black">{formatDate(sale.saleDate)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700">Payment Terms:</span>
                      <span className="font-bold uppercase text-black">
                        {isCreditSale ? 'Credit (Khata)' : sale.paymentMethod}
                      </span>
                    </div>
                    {isCreditSale && sale.dueDate && (
                      <div className="flex justify-between items-center text-red-900 font-bold bg-red-50 px-1 py-0.5 rounded">
                        <span>Payment Due Date:</span>
                        <span className="font-mono">{formatDate(sale.dueDate)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. ITEM TABLE (CLEAN, NO CONFIDENTIAL DISCOUNT COLUMNS) */}
              <div className="border border-black mb-4 print:mb-3">
                <table className="w-full text-left border-collapse text-xs print:text-[10.5px]">
                  <thead>
                    <tr className="bg-slate-100 print:bg-slate-200 border-b border-black text-black font-bold uppercase text-[10.5px] print:text-[9.5px]">
                      <th className="py-2 px-1.5 print:py-1 print:px-1 text-center w-8 border-r border-black">SNo.</th>
                      <th className="py-2 px-2.5 print:py-1 print:px-1.5 border-r border-black">Book Title / Description</th>
                      <th className="py-2 px-2 print:py-1 print:px-1.5 border-r border-black w-36 print:w-32">Publisher, Series, Class</th>
                      <th className="py-2 px-1.5 print:py-1 print:px-1 text-center w-12 border-r border-black">Qty.</th>
                      <th className="py-2 px-2 print:py-1 print:px-1.5 text-right w-24 print:w-20 border-r border-black">MRP Rate (PKR)</th>
                      <th className="py-2 px-2 print:py-1 print:px-1.5 text-right w-24 print:w-20 border-r border-black">Discount Price</th>
                      <th className="py-2 px-2.5 print:py-1 print:px-1.5 text-right w-28 print:w-24">Total Amount (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 print:divide-slate-400 text-xs print:text-[10px]">
                    {sale.items.map((item, idx) => {
                      const hierarchyInfo = [
                        item.publisherName && item.publisherName !== 'Unknown' ? item.publisherName : '',
                        item.seriesName,
                        item.targetClass,
                      ]
                        .filter(Boolean)
                        .join(' • ') || item.publisherName || '—';

                      const mrp = item.unitPrice ?? 0;
                      const discountPrice =
                        typeof item.effectivePrice === 'number'
                          ? item.effectivePrice
                          : item.quantity > 0
                          ? item.lineTotal / item.quantity
                          : item.sellingPrice ?? item.unitPrice ?? 0;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                          <td className="py-1.5 px-1.5 print:py-0.5 print:px-1 text-center font-mono border-r border-black text-slate-600 print:text-black">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2.5 print:py-0.5 print:px-1.5 border-r border-black">
                            <div className="font-bold text-black leading-snug">
                              {item.productName}
                            </div>
                            {item.sku && (
                              <div className="text-[10px] print:text-[9px] text-slate-500 font-mono">
                                {item.sku}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2 print:py-0.5 print:px-1.5 border-r border-black text-slate-700 print:text-black text-[11px] print:text-[9.5px]">
                            {hierarchyInfo}
                          </td>
                          <td className="py-1.5 px-1.5 print:py-0.5 print:px-1 text-center font-bold text-black border-r border-black">
                            {item.quantity}
                          </td>
                          <td className="py-1.5 px-2 print:py-0.5 print:px-1.5 text-right font-mono text-black border-r border-black">
                            {mrp.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2 print:py-0.5 print:px-1.5 text-right font-mono font-medium text-black border-r border-black">
                            {discountPrice.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2.5 print:py-0.5 print:px-1.5 text-right font-mono font-bold text-black">
                            {item.lineTotal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 4. FINANCIAL SUMMARY & WORDS */}
              <div className="invoice-summary-section grid grid-cols-12 gap-3 mb-6 print:mb-3 text-xs">
                {/* Left Column: Words & Terms */}
                <div className="col-span-7 flex flex-col justify-between border border-black p-3 print:p-2 rounded-sm space-y-2">
                  <div>
                    <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-0.5">
                      Amount In Words:
                    </div>
                    <div className="font-bold text-slate-900 capitalize text-xs print:text-[11px]">
                      {amountToWords(sale.grandTotal)}
                    </div>
                  </div>

                  <div className="border-t border-slate-300 pt-2 space-y-1 text-[11px] text-slate-600">
                    <p className="font-bold text-black">Terms & Conditions:</p>
                    <ul className="list-disc pl-3.5 space-y-0.5 text-[10px]">
                      <li>Goods once sold will not be returned without original cash memo.</li>
                      <li>Any discrepancy must be reported within 24 hours of delivery.</li>
                      {isCreditSale && <li>Please ensure payment clearance on or before due date.</li>}
                    </ul>
                  </div>
                </div>

                {/* Right Column: Financial Totals */}
                <div className="col-span-5 border border-black divide-y divide-black rounded-sm text-xs">
                  <div className="flex justify-between py-1.5 px-3 print:py-1 print:px-2">
                    <span className="font-bold text-slate-700">Total Quantity:</span>
                    <span className="font-mono font-bold">{totalQuantity} Units</span>
                  </div>
                  <div className="flex justify-between py-1.5 px-3 print:py-1 print:px-2">
                    <span className="font-bold text-slate-700">Subtotal:</span>
                    <span className="font-mono">PKR {sale.subtotal.toFixed(2)}</span>
                  </div>
                  {sale.totalDiscount > 0 && (
                    <div className="flex justify-between py-1.5 px-3 print:py-1 print:px-2 bg-slate-50 print:bg-slate-100 text-emerald-800 font-bold">
                      <span>Discount Given:</span>
                      <span className="font-mono">-PKR {sale.totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 px-3 print:py-1.5 print:px-2 bg-slate-100 print:bg-slate-200 font-black text-sm border-t-2 border-black">
                    <span className="text-black">Grand Total:</span>
                    <span className="font-mono text-black">
                      PKR {sale.grandTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 px-3 print:py-1 print:px-2">
                    <span className="font-bold text-slate-700">Amount Paid:</span>
                    <span className="font-mono font-bold">
                      PKR {(sale.paymentApplied || 0).toFixed(2)}
                    </span>
                  </div>
                  {(sale.changeReturned || 0) > 0 && (
                    <div className="flex justify-between py-1.5 px-3 print:py-1 print:px-2 bg-emerald-50 text-emerald-900 font-bold">
                      <span>Change Returned:</span>
                      <span className="font-mono">
                        PKR {(sale.changeReturned || 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {sale.balanceAddedToCredit > 0 && (
                    <div className="flex justify-between py-1.5 px-3 print:py-1 print:px-2 bg-red-50 text-red-900 font-bold">
                      <span>Balance (Khata Debit):</span>
                      <span className="font-mono">
                        PKR {sale.balanceAddedToCredit.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. SIGNATURES */}
              <div className="invoice-signatures-section pt-8 print:pt-4 mt-4 print:mt-2 border-t border-slate-400">
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
          )}
        </div>

        {/* Modal Actions Footer (Hidden on print) */}
        <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-100 border-t border-slate-300 print:hidden shrink-0 gap-3">
          <div className="text-xs text-slate-600 flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>
              Printer Setting:{' '}
              <strong className="text-slate-900">
                {paperSize === 'thermal'
                  ? 'Thermal Machine (80mm POS Roll)'
                  : paperSize === 'A4'
                  ? 'A4 Standard (Full Page)'
                  : 'A5 (Half Page)'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadInvoicePdf(sale)}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Download Invoice PDF"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
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
              <span>
                {isPrinting
                  ? 'Printing...'
                  : paperSize === 'thermal'
                  ? 'Print Thermal Bill'
                  : 'Print Invoice'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Print Media Stylesheet for Exact Thermal & A4/A5 Setup */}
      <style>{`
        @media print {
          /* Hide main web app root and anything else outside this invoice modal */
          #root,
          body > *:not(.a4-print-modal-root) {
            display: none !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .a4-print-modal-root {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
          }

          .a4-modal-dialog-container {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }

          .a4-modal-scroll-area {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }

          ${
            paperSize === 'thermal'
              ? `
          #thermal-receipt-sheet {
            position: static !important;
            display: block !important;
            width: 80mm !important;
            max-width: 80mm !important;
            min-height: auto !important;
            margin: 0 auto !important;
            padding: 2mm 3mm 6mm 3mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Courier New', Courier, monospace, sans-serif !important;
            font-size: 11.5px !important;
            font-weight: 700 !important;
            line-height: 1.25 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #thermal-receipt-sheet * {
            color: #000000 !important;
            border-color: #000000 !important;
          }

          #thermal-receipt-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9.5px !important;
            font-weight: 800 !important;
            line-height: 1.25 !important;
            color: #000000 !important;
          }

          #thermal-receipt-sheet th {
            font-size: 8.5px !important;
            font-weight: 900 !important;
            color: #000000 !important;
            padding: 2px 0.5px !important;
            border-bottom: 2px solid #000000 !important;
          }

          #thermal-receipt-sheet td {
            font-size: 9.5px !important;
            font-weight: 800 !important;
            color: #000000 !important;
            padding: 2.5px 0.5px !important;
            border-bottom: 1px solid #000000 !important;
          }

          #thermal-receipt-sheet .thermal-item-title {
            font-size: 10px !important;
            font-weight: 900 !important;
            color: #000000 !important;
            line-height: 1.2 !important;
          }

          #thermal-receipt-sheet .thermal-item-subtext {
            font-size: 8.5px !important;
            font-weight: 900 !important;
            color: #000000 !important;
            line-height: 1.15 !important;
          }

          #thermal-receipt-sheet h2,
          #thermal-receipt-sheet strong,
          #thermal-receipt-sheet .font-bold,
          #thermal-receipt-sheet .font-black {
            font-weight: 900 !important;
            color: #000000 !important;
          }

          @page {
            size: 80mm auto;
            margin: 0;
          }
          `
              : `
          #a4-invoice-sheet {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: ${paperSize === 'A4' ? 'A4 portrait' : 'A5 landscape'};
            margin: 8mm 10mm 10mm 10mm;
          }

          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }

          thead {
            display: table-header-group !important;
          }

          tbody {
            display: table-row-group !important;
          }

          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .invoice-summary-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .invoice-signatures-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          `
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

  return createPortal(modalContent, document.body);
};
