import React, { useState } from 'react';
import type { SaleDocument, CustomerDocument } from '../../../types/database';
import { formatCurrency } from '../../../utils/money';
import { formatDate } from '../../../utils/formatters';
import { ChevronLeft, ChevronRight, Printer, MessageSquare } from 'lucide-react';
import { A4InvoiceModal } from '../../pos/A4InvoiceModal';
import { WhatsAppMessageModal } from '../../common/WhatsAppMessageModal';
import { buildInvoiceWhatsAppMessage } from '../../../utils/whatsappTemplates';
import { getCustomerById } from '../../../services/customerService';

interface InvoiceWiseSalesTableProps {
  sales: SaleDocument[];
}

const PAGE_SIZE = 15;

export const InvoiceWiseSalesTable: React.FC<InvoiceWiseSalesTableProps> = ({ sales }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedA4Sale, setSelectedA4Sale] = useState<SaleDocument | null>(null);
  const [selectedWhatsAppSale, setSelectedWhatsAppSale] = useState<SaleDocument | null>(null);
  const [whatsAppCustomer, setWhatsAppCustomer] = useState<CustomerDocument | null>(null);

  const handleOpenWhatsApp = async (sale: SaleDocument) => {
    setSelectedWhatsAppSale(sale);
    if (sale.customerId) {
      try {
        const cust = await getCustomerById(sale.customerId);
        setWhatsAppCustomer(cust);
      } catch {
        setWhatsAppCustomer(null);
      }
    } else {
      setWhatsAppCustomer(null);
    }
  };

  if (!sales || sales.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">No invoices found for the selected criteria.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(sales.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const currentSales = sales.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Invoice #</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-right">Cash Received</th>
              <th className="py-3 px-4 text-right">Credit Added</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Method</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {currentSales.map((sale) => (
              <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-slate-900">{sale.invoiceNo}</td>
                <td className="py-3 px-4 text-slate-600">{formatDate(sale.saleDate)}</td>
                <td className="py-3 px-4 font-semibold text-slate-800">
                  {sale.customerName || 'Counter Cash'}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                      sale.customerType === 'wholesaler'
                        ? 'bg-blue-100 text-blue-800'
                        : sale.customerType === 'marketshop'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {sale.customerType}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-bold text-slate-900">
                  {formatCurrency(sale.grandTotal)}
                </td>
                <td className="py-3 px-4 text-right text-blue-700 font-semibold">
                  {formatCurrency(sale.paymentApplied)}
                </td>
                <td className="py-3 px-4 text-right text-amber-700 font-semibold">
                  {sale.balanceAddedToCredit > 0 ? formatCurrency(sale.balanceAddedToCredit) : '—'}
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                      sale.paymentStatus === 'paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : sale.paymentStatus === 'partial'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {sale.paymentStatus}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-md capitalize">
                    {sale.paymentMethod.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedA4Sale(sale)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition border border-slate-200"
                      title="View & Print A4 Invoice"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(sale)}
                      className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 rounded-lg transition border border-emerald-200 shadow-2xs"
                      title="Share Invoice on WhatsApp"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-1 text-xs text-slate-600 print:hidden">
          <span>
            Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, sales.length)} of {sales.length} invoices
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="font-semibold text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* A4 Invoice Preview & Print Modal */}
      <A4InvoiceModal
        isOpen={Boolean(selectedA4Sale)}
        onClose={() => setSelectedA4Sale(null)}
        sale={selectedA4Sale}
      />

      {/* WhatsApp Sharing Modal */}
      {selectedWhatsAppSale && (
        <WhatsAppMessageModal
          isOpen={Boolean(selectedWhatsAppSale)}
          onClose={() => {
            setSelectedWhatsAppSale(null);
            setWhatsAppCustomer(null);
          }}
          initialCustomerName={selectedWhatsAppSale.customerName || whatsAppCustomer?.name || 'Customer'}
          initialPhone={whatsAppCustomer?.phone || ''}
          customerId={selectedWhatsAppSale.customerId}
          messageType="invoice"
          relatedInvoiceNo={selectedWhatsAppSale.invoiceNo}
          sale={selectedWhatsAppSale}
          defaultMessageText={buildInvoiceWhatsAppMessage({
            sale: selectedWhatsAppSale,
            customer: whatsAppCustomer,
          })}
        />
      )}
    </div>
  );
};

