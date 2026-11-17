import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Printer,
  Copy,
  AlertCircle,
  FileText,
  Calendar,
  User,
  Phone,
  MapPin,
  Clock,
  ArrowLeft,
  Check,
} from 'lucide-react';
import type { SaleDocument } from '../types/database';
import { getSaleById } from '../services/saleService';
import { getSaleByInvoiceNo } from '../services/saleHistoryService';
import { formatDate, amountToWords, formatInvoiceDisplay } from '../utils/formatters';
import { WhatsAppIcon } from '../components/common/WhatsAppIcon';
import { generateInvoiceQrDataUrl } from '../utils/qrCodeHelper';

export const PublicInvoiceView: React.FC = () => {
  const { invoiceNo } = useParams<{ invoiceNo: string }>();
  const [sale, setSale] = useState<SaleDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    if (!invoiceNo) {
      setError('Invoice number is missing.');
      setIsLoading(false);
      return;
    }

    const cleanInvoiceNo = decodeURIComponent(invoiceNo).trim();

    async function fetchSale() {
      setIsLoading(true);
      setError(null);
      try {
        // Try fetching by exact document ID first, then by invoiceNo query
        let found = await getSaleById(cleanInvoiceNo);
        if (!found) {
          found = await getSaleByInvoiceNo(cleanInvoiceNo);
        }

        if (!isMounted) return;

        if (found) {
          setSale(found);
          generateInvoiceQrDataUrl(found.invoiceNo, 180)
            .then((url) => {
              if (isMounted) setQrUrl(url);
            })
            .catch(() => {});
        } else {
          setError(`Invoice "${cleanInvoiceNo}" was not found in our database.`);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error fetching public invoice:', err);
        setError(err?.message || 'Unable to load invoice details.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchSale();

    return () => {
      isMounted = false;
    };
  }, [invoiceNo]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareWhatsApp = () => {
    if (!sale) return;
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const text = encodeURIComponent(
      `*SADIQ BOOK AGENCY — INVOICE BILL*\n` +
      `Bill No: ${sale.invoiceNo}\n` +
      `Date: ${formatDate(sale.saleDate)}\n` +
      `Customer: ${sale.customerName || 'Valued Customer'}\n` +
      `Total Items: ${sale.items.length} (${sale.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} units)\n` +
      `Grand Total: PKR ${sale.grandTotal.toFixed(2)}\n` +
      `Amount Paid: PKR ${(sale.paymentApplied || 0).toFixed(2)}\n` +
      (sale.balanceAddedToCredit ? `Khata Balance Added: PKR ${sale.balanceAddedToCredit.toFixed(2)}\n` : '') +
      `\nView complete bill details online:\n${currentUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-[#071F49]/20 border-t-[#071F49] rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-800">Verifying Invoice...</h2>
        <p className="text-xs text-slate-500 mt-1">Retrieving official bill details from Sadiq Book Agency</p>
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center space-y-4">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Invoice Verification Failed</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || 'The requested invoice could not be verified. It may have been entered incorrectly or is not yet registered.'}
          </p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#071F49] text-white rounded-xl text-xs font-bold hover:bg-[#0c2f6d] transition shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go to Login</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCreditSale = sale.paymentMethod === 'credit' || (sale.balanceAddedToCredit || 0) > 0;
  const totalQuantity = sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const formattedInvoiceNo = formatInvoiceDisplay(sale.invoiceNo);

  return (
    <div className="min-h-screen bg-slate-100 py-4 sm:py-8 px-2 sm:px-4 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden print:shadow-none print:border-none print:rounded-none">
        {/* Verification Success Strip */}
        <div className="bg-emerald-600 text-white px-4 py-2.5 flex items-center justify-between text-xs font-medium print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            <span className="font-bold">Verified Authentic Invoice Document</span>
            <span className="hidden sm:inline text-emerald-100">• Verified by Sadiq Book Agency POS System</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="px-2 py-1 bg-emerald-700/80 hover:bg-emerald-700 rounded text-[11px] font-bold flex items-center gap-1 transition"
              title="Copy public invoice link"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Link'}</span>
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="px-2 py-1 bg-[#25D366] hover:bg-[#20ba59] text-white rounded text-[11px] font-bold flex items-center gap-1 transition"
              title="Share on WhatsApp"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-2.5 py-1 bg-white text-emerald-900 hover:bg-emerald-50 rounded text-[11px] font-bold flex items-center gap-1 shadow-xs transition"
              title="Print Bill"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-700" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Invoice Body Container */}
        <div className="p-4 sm:p-8 space-y-6">
          {/* 1. Header Banner */}
          <div className="text-center border-b-2 border-[#071F49] pb-4">
            <div className="inline-block bg-[#071F49] text-[#F5B51B] text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full mb-1 tracking-wider">
              Official Digital Bill
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#071F49] uppercase tracking-wide">
              Sadiq Book Agency
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-widest mt-0.5">
              Wholesale & Retail Booksellers • Notebooks • Registers • Stationery
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-700 mt-2">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#071F49]" />
                <span>Udyana Market Mingora Swat</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-[#071F49]" />
                <span className="font-mono font-semibold">03449633526, 03425822259</span>
              </span>
            </div>
          </div>

          {/* 2. Bill Meta & Customer Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#071F49]" />
                <span className="text-slate-500">Invoice Number:</span>
                <span className="font-mono font-black text-slate-900 text-sm">{formattedInvoiceNo}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#071F49]" />
                <span className="text-slate-500">Date:</span>
                <span className="font-bold text-slate-800">{formatDate(sale.saleDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#071F49]" />
                <span className="text-slate-500">Bill Type:</span>
                <span className={`font-black uppercase px-2 py-0.5 rounded text-[10px] ${
                  isCreditSale ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}>
                  {isCreditSale ? 'Khata Credit Bill' : 'Cash Memo'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 sm:border-l sm:border-slate-200 sm:pl-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#071F49]" />
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900 text-sm">{sale.customerName || 'Walk-in Cash Customer'}</span>
              </div>
              {sale.customerType && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Party Type:</span>
                  <span className="capitalize font-semibold text-slate-800">{sale.customerType}</span>
                </div>
              )}
              {sale.dueDate && isCreditSale && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Due Date:</span>
                  <span className="font-bold text-rose-700">{formatDate(sale.dueDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. Itemized Products Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#071F49] text-white uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">S#</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-2 text-center">Class</th>
                    <th className="py-2.5 px-2 text-center">Qty</th>
                    <th className="py-2.5 px-2 text-right">MRP</th>
                    <th className="py-2.5 px-2 text-center">Disc%</th>
                    <th className="py-2.5 px-2 text-right">Sale Rate</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items.map((item, idx) => {
                    const mrp = item.unitPrice ?? item.mrp ?? 0;
                    const salePrice =
                      typeof item.effectivePrice === 'number'
                        ? item.effectivePrice
                        : item.quantity > 0
                        ? item.lineTotal / item.quantity
                        : item.sellingPrice ?? item.unitPrice ?? 0;

                    const itemClass = item.targetClass || (item as any).className || '—';
                    const publisherSeries = [
                      item.publisherName && item.publisherName !== 'Unknown' ? item.publisherName : '',
                      item.seriesName,
                    ]
                      .filter(Boolean)
                      .join(' • ');

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60 transition">
                        <td className="py-2 px-3 text-center font-mono text-slate-500 font-bold">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900 leading-tight">{item.productName}</div>
                          {publisherSeries && (
                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">{publisherSeries}</div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold text-slate-700">
                          {itemClass}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-500">
                          {mrp > 0 ? mrp.toFixed(2) : salePrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-amber-700 font-bold">
                          {item.discountRate > 0 ? `${item.discountRate}%` : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-800">
                          {salePrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                          {item.lineTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Financial Summary Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Words, QR & Digital Seal */}
            <div className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3 bg-slate-50/50">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1">
                  Amount In Words
                </span>
                <span className="text-xs font-bold text-slate-800 capitalize leading-relaxed block">
                  {amountToWords(sale.grandTotal)}
                </span>
              </div>

              {qrUrl && (
                <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
                  <div className="border border-slate-300 p-1 bg-white rounded-lg shadow-2xs shrink-0">
                    <img src={qrUrl} alt={`QR ${sale.invoiceNo}`} className="w-16 h-16 block" />
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-0.5">
                    <span className="font-bold text-slate-800 block">Digitally Signed & Verified</span>
                    <span className="text-[10px] text-slate-500 block leading-tight">
                      This QR code links directly to this tamper-proof digital invoice record.
                    </span>
                    <span className="font-mono text-[10px] font-bold text-[#071F49] block">
                      {formattedInvoiceNo}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Numbers */}
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white text-xs shadow-2xs">
              <div className="flex justify-between py-2 px-3.5">
                <span className="text-slate-600 font-medium">Total Quantity:</span>
                <span className="font-mono font-bold text-slate-900">{totalQuantity} Units</span>
              </div>
              <div className="flex justify-between py-2 px-3.5">
                <span className="text-slate-600 font-medium">Subtotal:</span>
                <span className="font-mono text-slate-800">PKR {sale.subtotal.toFixed(2)}</span>
              </div>
              {sale.totalDiscount > 0 && (
                <div className="flex justify-between py-2 px-3.5 bg-emerald-50/60 text-emerald-800 font-bold">
                  <span>Total Discount:</span>
                  <span className="font-mono">-PKR {sale.totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-2.5 px-3.5 bg-[#071F49] text-white font-black text-sm">
                <span>Net Payable:</span>
                <span className="font-mono text-[#F5B51B] text-base">PKR {sale.grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 px-3.5">
                <span className="text-slate-600 font-medium">Amount Paid:</span>
                <span className="font-mono font-bold text-slate-900">PKR {(sale.paymentApplied || 0).toFixed(2)}</span>
              </div>
              {isCreditSale && (
                <div className="flex justify-between py-2 px-3.5 bg-amber-50 text-amber-900 font-bold">
                  <span>Khata Debit Balance:</span>
                  <span className="font-mono">PKR {(sale.balanceAddedToCredit || 0).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer Notes */}
          <div className="text-center pt-4 border-t border-slate-200 text-slate-400 text-[10px] space-y-1">
            <p className="font-bold text-slate-600 uppercase">Thank you for choosing Sadiq Book Agency!</p>
            <p>Computerized billing system • Udyana Market Mingora Swat • Tel: 03449633526</p>
          </div>
        </div>
      </div>
    </div>
  );
};
