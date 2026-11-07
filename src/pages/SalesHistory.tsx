import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  FileText,
  Printer,
  RotateCcw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  X,
  PackageCheck,
  PackageX,
  Wallet,
  CreditCard,
  Calendar,
} from 'lucide-react';
import { WhatsAppIcon } from '../components/common/WhatsAppIcon';
import {
  getSalesHistoryPaginated,
  getSaleReturnsForSale,
  processSaleReturnTransaction,
  type SalesHistoryFilters,
} from '../services/saleHistoryService';
import { getCustomerById } from '../services/customerService';
import { getInvoiceDueStatus } from '../services/dueDateService';
import { EditDueDateModal } from '../components/sales/EditDueDateModal';
import type {
  SaleDocument,
  SaleReturnDocument,
  CustomerDocument,
  ReturnItemCondition,
  CustomerType,
} from '../types/database';
import { A4InvoiceModal } from '../components/pos/A4InvoiceModal';
import { WhatsAppMessageModal } from '../components/common/WhatsAppMessageModal';
import { buildInvoiceWhatsAppMessage, buildSalesReturnWhatsAppMessage } from '../utils/whatsappTemplates';
import { formatInvoiceDisplay } from '../utils/formatters';
import { useAuth } from '../hooks/useAuth';

export const SalesHistory: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();

  // State
  const [sales, setSales] = useState<SaleDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType | 'all'>('all');
  const [paymentStatus, setPaymentStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');

  // Modals & Selected items
  const [selectedSale, setSelectedSale] = useState<SaleDocument | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleDocument | null>(null);
  const [dueDateSale, setDueDateSale] = useState<SaleDocument | null>(null);

  // Return Workflow State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnSale, setReturnSale] = useState<SaleDocument | null>(null);
  const [returnCustomer, setReturnCustomer] = useState<CustomerDocument | null>(null);
  const [priorReturns, setPriorReturns] = useState<SaleReturnDocument[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnConditions, setReturnConditions] = useState<Record<string, ReturnItemCondition | ''>>({});
  const [returnReason, setReturnReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'credit_deduction'>('cash');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccessMessage, setReturnSuccessMessage] = useState<string | null>(null);
  const [latestProcessedReturn, setLatestProcessedReturn] = useState<{
    returnDoc: SaleReturnDocument;
    sale: SaleDocument;
    customer: CustomerDocument | null;
  } | null>(null);

  // WhatsApp Share State
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppSale, setWhatsAppSale] = useState<SaleDocument | null>(null);
  const [whatsAppCustomer, setWhatsAppCustomer] = useState<CustomerDocument | null>(null);
  const [whatsAppReturnDoc, setWhatsAppReturnDoc] = useState<SaleReturnDocument | null>(null);
  const [whatsAppMessageType, setWhatsAppMessageType] = useState<'invoice' | 'sales_return'>('invoice');

  const openWhatsAppModalForSale = async (sale: SaleDocument) => {
    setWhatsAppSale(sale);
    setWhatsAppReturnDoc(null);
    setWhatsAppMessageType('invoice');
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
    setIsWhatsAppModalOpen(true);
  };

  const openWhatsAppModalForReturn = (
    retDoc: SaleReturnDocument,
    sale: SaleDocument,
    cust: CustomerDocument | null
  ) => {
    setWhatsAppSale(sale);
    setWhatsAppReturnDoc(retDoc);
    setWhatsAppCustomer(cust);
    setWhatsAppMessageType('sales_return');
    setIsWhatsAppModalOpen(true);
  };

  const loadSales = useCallback(async (isNew = false) => {
    setIsLoading(true);
    try {
      const filters: SalesHistoryFilters = {
        searchTerm: searchTerm.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate + 'T23:59:59').toISOString() : undefined,
        customerType: customerType !== 'all' ? customerType : undefined,
        paymentStatus: paymentStatus !== 'all' ? paymentStatus : undefined,
      };

      const res = await getSalesHistoryPaginated(
        filters,
        isNew ? null : nextCursor
      );

      setSales((prev) => (isNew ? res.sales : [...prev, ...res.sales]));
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);
    } catch (err) {
      console.error('Failed to load sales history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, startDate, endDate, customerType, paymentStatus, nextCursor]);

  useEffect(() => {
    loadSales(true);
  }, [customerType, paymentStatus, startDate, endDate, loadSales]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSales(true);
  };

  const openReprintModal = (sale: SaleDocument) => {
    setReceiptSale(sale);
    setIsReceiptModalOpen(true);
  };

  const openDetailModal = (sale: SaleDocument) => {
    setSelectedSale(sale);
    setIsDetailModalOpen(true);
  };

  const openReturnModal = async (sale: SaleDocument) => {
    setReturnSale(sale);
    setReturnError(null);
    setReturnSuccessMessage(null);
    setLatestProcessedReturn(null);
    setReturnReason('');
    // For registered customers with account, allow Khata adjustment or Cash
    setRefundMethod(sale.customerId ? 'credit_deduction' : 'cash');

    // Fetch prior returns for this sale to compute remaining returnable quantities
    const returns = await getSaleReturnsForSale(sale.invoiceNo);
    setPriorReturns(returns);

    // Fetch latest customer document to display live balance and advance simulation
    if (sale.customerId) {
      getCustomerById(sale.customerId)
        .then((c) => setReturnCustomer(c))
        .catch(() => setReturnCustomer(null));
    } else {
      setReturnCustomer(null);
    }

    const initialQtys: Record<string, number> = {};
    const initialConditions: Record<string, ReturnItemCondition | ''> = {};
    for (const item of sale.items) {
      initialQtys[item.productId] = 0;
      initialConditions[item.productId] = ''; // Explicit condition confirmation required per approved requirement
    }
    setReturnQuantities(initialQtys);
    setReturnConditions(initialConditions);
    setIsReturnModalOpen(true);
  };

  const getAlreadyReturnedQty = (productId: string) => {
    let sum = 0;
    for (const ret of priorReturns) {
      for (const item of ret.items) {
        if (item.productId === productId) sum += item.quantity;
      }
    }
    return sum;
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnSale) return;
    setReturnError(null);

    const activeItems = Object.entries(returnQuantities).filter(([, qty]) => qty > 0);
    if (activeItems.length === 0) {
      setReturnError('Please specify at least 1 unit of a product to return.');
      return;
    }

    // Default condition must not silently classify damaged items as saleable. Require operator to confirm condition.
    const unconfirmedItems = activeItems.filter(([productId]) => !returnConditions[productId]);
    if (unconfirmedItems.length > 0) {
      setReturnError('Please explicitly select the condition (Saleable or Damaged) for each returned item.');
      return;
    }

    if (refundMethod === 'credit_deduction' && !returnSale.customerId) {
      setReturnError('Customer Khata adjustment is only available for registered account customers. Please select Cash Refund.');
      return;
    }

    setIsProcessingReturn(true);
    try {
      const returnItems = activeItems.map(([productId, quantity]) => ({
        productId,
        quantity,
        condition: returnConditions[productId] as ReturnItemCondition,
      }));

      const returnDoc = await processSaleReturnTransaction(
        {
          originalInvoiceNo: returnSale.invoiceNo,
          items: returnItems,
          refundMethod,
          reason: returnReason.trim() || 'Customer return',
        },
        currentUser?.uid || 'cashier',
        currentUser?.email || 'cashier@sadiqbookagency.com'
      );

      const saleableQty = returnItems
        .filter((i) => i.condition === 'saleable')
        .reduce((sum, i) => sum + i.quantity, 0);
      const damagedQty = returnItems
        .filter((i) => i.condition === 'damaged')
        .reduce((sum, i) => sum + i.quantity, 0);

      setLatestProcessedReturn({
        returnDoc,
        sale: returnSale,
        customer: returnCustomer,
      });

      setReturnSuccessMessage(
        `Return ${returnDoc.returnNo} processed successfully! Refund Amount: PKR ${returnDoc.totalRefundAmount.toFixed(2)}. (${saleableQty} saleable units restocked, ${damagedQty} damaged units quarantined).`
      );
      loadSales(true);
      setTimeout(() => {
        setIsReturnModalOpen(false);
      }, 4000);
    } catch (err: any) {
      console.error('Return processing error:', err);
      setReturnError(err.message || 'Failed to process return.');
    } finally {
      setIsProcessingReturn(false);
    }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 sm:w-7 sm:h-7 text-[#071F49]" />
            <span>Sales History & Invoice Archive</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            View historical invoices, print A4 commercial invoices, and process customer returns with stock restocking.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Invoice No, Customer Name, or Terminal..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none flex-1 sm:flex-initial"
              title="Start Date"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none flex-1 sm:flex-initial"
              title="End Date"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as any)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none bg-white font-medium"
            >
              <option value="all">All Customer Types</option>
              <option value="parchon">Parchon (Walk-in)</option>
              <option value="wholesaler">Wholesale</option>
              <option value="marketshop">Marketshop</option>
            </select>

            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as any)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none bg-white font-medium"
            >
              <option value="all">All Payment Status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Credit / Unpaid</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-[#071F49] hover:bg-[#0c2f6d] text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <th className="py-3 px-4">Invoice No</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Terminal</th>
                <th className="py-3 px-4 text-right">Items</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-center">Due Date</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Loading sales records...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No sales records found matching your filters.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => {
                  const remaining =
                    sale.paymentStatus === 'paid'
                      ? 0
                      : sale.balanceAddedToCredit > 0
                      ? sale.balanceAddedToCredit
                      : sale.paymentMethod === 'credit'
                      ? sale.grandTotal
                      : 0;
                  const dueInfo = getInvoiceDueStatus({
                    saleDate: sale.saleDate || sale.createdAt,
                    dueDate: sale.dueDate,
                    grandTotal: sale.grandTotal,
                    remainingBalance: remaining,
                  });

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {formatInvoiceDisplay(sale.invoiceNo)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {new Date(sale.saleDate || sale.createdAt).toLocaleString('en-PK', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {sale.customerName}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            sale.customerType === 'parchon'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sale.customerType === 'wholesaler'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {sale.customerType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {sale.terminalId || 'T1'}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {sale.items.length}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        PKR {sale.grandTotal.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {sale.dueDate ? (
                          <div className="flex items-center justify-center gap-1 text-slate-700 font-medium">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{sale.dueDate}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${dueInfo.badgeColor}`}
                        >
                          {dueInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => openDetailModal(sale)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors"
                          title="View Sale Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {(sale.balanceAddedToCredit > 0 || sale.paymentMethod === 'credit') && isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDueDateSale(sale)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Invoice Due Date (Admin Only)"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openReprintModal(sale)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Reprint Thermal Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openWhatsAppModalForSale(sale)}
                          className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          title="Share Invoice on WhatsApp"
                        >
                          <WhatsAppIcon className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openReturnModal(sale)}
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Process Return"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="p-4 border-t border-slate-100 text-center bg-slate-50">
            <button
              type="button"
              onClick={() => loadSales(false)}
              disabled={isLoading}
              className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              {isLoading ? 'Loading...' : 'Load Next 20 Invoices'}
            </button>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {isDetailModalOpen && selectedSale && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#071F49] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Invoice Details</h3>
                <p className="text-xs text-slate-300 font-mono">{formatInvoiceDisplay(selectedSale.invoiceNo)}</p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500">Customer:</span>
                  <div className="font-bold text-slate-900">{selectedSale.customerName}</div>
                </div>
                <div>
                  <span className="text-slate-500">Date & Time:</span>
                  <div className="font-semibold text-slate-800">
                    {new Date(selectedSale.saleDate).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Payment Status:</span>
                  <div className="font-bold capitalize text-slate-900">{selectedSale.paymentStatus} ({selectedSale.paymentMethod})</div>
                </div>
                <div>
                  <span className="text-slate-500">Operator:</span>
                  <div className="font-semibold text-slate-800">{selectedSale.operatorName}</div>
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3">Publisher</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Original MRP</th>
                      <th className="py-2.5 px-3 text-center">Disc %</th>
                      <th className="py-2.5 px-3 text-right">Final Price</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedSale.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-medium text-slate-900">{it.productName}</td>
                        <td className="py-2 px-3 text-slate-600">{it.publisherName || 'Unknown'}</td>
                        <td className="py-2 px-3 text-center font-bold">{it.quantity}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">PKR {it.unitPrice.toFixed(2)}</td>
                        <td className="py-2 px-3 text-center font-bold text-amber-700">
                          {it.discountRate > 0 ? `${it.discountRate}%` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-900">PKR {it.effectivePrice.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-black font-mono">PKR {it.lineTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>PKR {selectedSale.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>-PKR {selectedSale.totalDiscount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-sm border-t border-slate-200 pt-1 text-slate-900">
                  <span>Grand Total:</span>
                  <span>PKR {selectedSale.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                  <span>Cash Tendered:</span>
                  <span>PKR {selectedSale.cashTendered.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Change Returned:</span>
                  <span>PKR {selectedSale.changeReturned.toFixed(2)}</span>
                </div>
                {selectedSale.balanceAddedToCredit > 0 && (
                  <div className="flex justify-between font-bold text-amber-800">
                    <span>Added to Khata Debt:</span>
                    <span>PKR {selectedSale.balanceAddedToCredit.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200">
                  <span>Payment Due Date:</span>
                  <span className="font-bold">{selectedSale.dueDate || 'No Due Date (Standard Terms)'}</span>
                </div>
                {selectedSale.creditDaysSnapshot && (
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>Credit Terms Snapshot:</span>
                    <span>{selectedSale.creditDaysSnapshot} Days</span>
                  </div>
                )}
                {selectedSale.dueDateOverride && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-700" />
                      <span>Admin Due Date Override:</span>
                    </div>
                    <div>New Due Date: <span className="font-semibold">{selectedSale.dueDateOverride.newDueDate}</span> (Previous: {selectedSale.dueDateOverride.previousDueDate || 'none'})</div>
                    <div>By: {selectedSale.dueDateOverride.overriddenByEmail || selectedSale.dueDateOverride.overriddenByUserId} on {new Date(selectedSale.dueDateOverride.overriddenAt).toLocaleString()}</div>
                    <div>Reason: <span className="italic">{selectedSale.dueDateOverride.reason}</span></div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  openWhatsAppModalForSale(selectedSale);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>Share on WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  openReprintModal(selectedSale);
                }}
                className="px-4 py-2 bg-[#071F49] text-white font-bold text-xs rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Reprint Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Return Modal */}
      {isReturnModalOpen && returnSale && (() => {
        const activeReturnEntries = returnSale.items.filter((it) => (returnQuantities[it.productId] || 0) > 0);
        const previewTotalRefund = activeReturnEntries.reduce(
          (sum, it) => sum + (it.effectivePrice * (returnQuantities[it.productId] || 0)),
          0
        );
        const previewSaleableQty = activeReturnEntries
          .filter((it) => returnConditions[it.productId] === 'saleable')
          .reduce((sum, it) => sum + (returnQuantities[it.productId] || 0), 0);
        const previewDamagedQty = activeReturnEntries
          .filter((it) => returnConditions[it.productId] === 'damaged')
          .reduce((sum, it) => sum + (returnQuantities[it.productId] || 0), 0);
        const hasUnconfirmedCondition = activeReturnEntries.some(
          (it) => !returnConditions[it.productId]
        );

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
              <div className="px-6 py-4 bg-amber-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-amber-200" />
                  <div>
                    <h3 className="font-bold text-base">Process Customer Sales Return</h3>
                    <p className="text-xs text-amber-100 font-mono">
                      Invoice: {returnSale.invoiceNo} • Customer: {returnSale.customerName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsReturnModalOpen(false)}
                  className="p-1 text-amber-200 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleReturnSubmit} className="p-6 space-y-4 text-xs">
                {returnSuccessMessage && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-semibold">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{returnSuccessMessage}</span>
                    </div>
                    {latestProcessedReturn && (
                      <button
                        type="button"
                        onClick={() => openWhatsAppModalForReturn(
                          latestProcessedReturn.returnDoc,
                          latestProcessedReturn.sale,
                          latestProcessedReturn.customer
                        )}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>Share Voucher</span>
                      </button>
                    )}
                  </div>
                )}

                {returnError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{returnError}</span>
                  </div>
                )}

                <div>
                  <p className="text-slate-600 mb-2">
                    Select quantity and condition for each item to return. Only <strong>Saleable</strong> items will be automatically restocked into inventory.
                  </p>

                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {returnSale.items.map((it) => {
                      const alreadyRet = getAlreadyReturnedQty(it.productId);
                      const remainingEligible = it.quantity - alreadyRet;
                      const isFullyReturned = remainingEligible <= 0;
                      const qty = returnQuantities[it.productId] || 0;
                      const isSelected = qty > 0;
                      const condition = returnConditions[it.productId] || '';

                      return (
                        <div
                          key={it.productId}
                          className={`p-3 space-y-2 transition-colors ${
                            isSelected ? 'bg-amber-50/40' : 'bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5 max-w-[65%]">
                              <div className="font-bold text-slate-900">{it.productName}</div>
                              <div className="text-[11px] text-slate-500">
                                Sold: {it.quantity} • Prior Returns: {alreadyRet} • <span className="font-semibold text-slate-700">Eligible: {remainingEligible}</span> • Rate: PKR {it.effectivePrice.toFixed(2)}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500 font-medium">Return Qty:</span>
                              <input
                                type="number"
                                min="0"
                                max={remainingEligible}
                                value={qty}
                                disabled={isFullyReturned || isProcessingReturn}
                                onChange={(e) => {
                                  const val = Math.min(
                                    remainingEligible,
                                    Math.max(0, Number(e.target.value) || 0)
                                  );
                                  setReturnQuantities((prev) => ({ ...prev, [it.productId]: val }));
                                }}
                                className="w-16 text-center font-bold text-xs border border-slate-300 rounded-lg py-1 focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white"
                              />
                            </div>
                          </div>

                          {/* Condition selector - required when qty > 0 */}
                          {isSelected && (
                            <div className="pt-2 border-t border-amber-100/80 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-slate-700">Item Condition:</span>
                                {!condition && (
                                  <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                    Required *
                                  </span>
                                )}
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReturnConditions((prev) => ({ ...prev, [it.productId]: 'saleable' }))
                                  }
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
                                    condition === 'saleable'
                                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <PackageCheck className="w-3.5 h-3.5" />
                                  <span>Saleable (Auto-Restock)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setReturnConditions((prev) => ({ ...prev, [it.productId]: 'damaged' }))
                                  }
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
                                    condition === 'damaged'
                                      ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <PackageX className="w-3.5 h-3.5" />
                                  <span>Damaged / Unsaleable (Do Not Restock)</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Return Calculation Summary Card */}
                {activeReturnEntries.length > 0 && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">Total Refund Amount:</span>
                      <span className="text-sm font-black text-amber-900">
                        PKR {previewTotalRefund.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-amber-200/60 pt-1.5">
                      <span>Restocking Plan:</span>
                      <span>
                        <strong className="text-emerald-700">{previewSaleableQty} units</strong> restocked to shelf •{' '}
                        <strong className="text-rose-700">{previewDamagedQty} units</strong> quarantined/damaged
                      </span>
                    </div>
                  </div>
                )}

                {/* Refund Method */}
                <div className="space-y-1.5">
                  <label className="block font-medium text-slate-700">Refund Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundMethod('cash')}
                      className={`p-3 rounded-xl font-bold border text-left transition-all cursor-pointer ${
                        refundMethod === 'cash'
                          ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Wallet className="w-4 h-4" />
                        <span className="text-xs">Option A: Cash Refund</span>
                      </div>
                      <p className={`text-[10px] font-normal ${refundMethod === 'cash' ? 'text-amber-100' : 'text-slate-500'}`}>
                        Refund physical cash to customer from cash drawer register.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={!returnSale.customerId}
                      onClick={() => setRefundMethod('credit_deduction')}
                      className={`p-3 rounded-xl font-bold border text-left transition-all ${
                        !returnSale.customerId
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                          : refundMethod === 'credit_deduction'
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs cursor-pointer'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <CreditCard className="w-4 h-4" />
                        <span className="text-xs">Option B: Khata Adjustment</span>
                      </div>
                      <p className={`text-[10px] font-normal ${refundMethod === 'credit_deduction' ? 'text-blue-100' : 'text-slate-500'}`}>
                        {returnSale.customerId
                          ? 'Deduct from Khata balance (or record as Customer Advance).'
                          : 'Unavailable for walk-in Parchon cash customers.'}
                      </p>
                    </button>
                  </div>

                  {/* Khata Adjustment Impact Card */}
                  {refundMethod === 'credit_deduction' && returnSale.customerId && (
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5 text-[11px] text-blue-900">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Customer Account:</span>
                        <span className="font-bold">{returnSale.customerName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Current Balance:</span>
                        <span className="font-semibold">
                          PKR {(returnCustomer?.currentBalance || 0).toFixed(2)}{' '}
                          {(returnCustomer?.currentBalance || 0) < 0 ? '(Advance)' : '(Owes Debt)'}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-blue-200/60 pt-1 font-bold">
                        <span>Projected New Balance:</span>
                        <span className={((returnCustomer?.currentBalance || 0) - previewTotalRefund) < 0 ? 'text-emerald-700' : 'text-blue-950'}>
                          PKR {((returnCustomer?.currentBalance || 0) - previewTotalRefund).toFixed(2)}{' '}
                          {((returnCustomer?.currentBalance || 0) - previewTotalRefund) < 0 ? '(Customer Advance Credit)' : '(Remaining Debt)'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reason */}
                <div className="space-y-1">
                  <label className="block font-medium text-slate-700">Return Reason</label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="e.g. Defective binding / Customer change of mind"
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsReturnModalOpen(false)}
                    disabled={isProcessingReturn}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isProcessingReturn ||
                      activeReturnEntries.length === 0 ||
                      hasUnconfirmedCondition
                    }
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    {isProcessingReturn
                      ? 'Processing...'
                      : `Confirm Return (PKR ${previewTotalRefund.toFixed(2)})`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* A4 Invoice Print Modal (for reprinting) */}
      <A4InvoiceModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        sale={receiptSale}
      />

      {/* Admin Edit Due Date Modal */}
      <EditDueDateModal
        isOpen={Boolean(dueDateSale)}
        onClose={() => setDueDateSale(null)}
        sale={dueDateSale}
        onSuccess={(updatedSale) => {
          setSales((prev) =>
            prev.map((s) => (s.id === updatedSale.id ? updatedSale : s))
          );
          if (selectedSale?.id === updatedSale.id) {
            setSelectedSale(updatedSale);
          }
        }}
      />

      {/* WhatsApp Message Modal */}
      {isWhatsAppModalOpen && (
        <WhatsAppMessageModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          initialCustomerName={whatsAppSale?.customerName || whatsAppCustomer?.name || 'Customer'}
          initialPhone={whatsAppCustomer?.phone || ''}
          customerId={whatsAppSale?.customerId}
          messageType={whatsAppMessageType}
          relatedInvoiceNo={whatsAppSale?.invoiceNo}
          relatedReturnNo={whatsAppReturnDoc?.returnNo}
          sale={whatsAppMessageType === 'invoice' && whatsAppSale ? whatsAppSale : undefined}
          defaultMessageText={
            whatsAppMessageType === 'sales_return' && whatsAppReturnDoc
              ? buildSalesReturnWhatsAppMessage({
                  returnDoc: whatsAppReturnDoc,
                  customerName: whatsAppCustomer?.name || whatsAppSale?.customerName,
                  updatedBalance: whatsAppCustomer?.currentBalance,
                })
              : whatsAppSale
              ? buildInvoiceWhatsAppMessage({
                  sale: whatsAppSale,
                  customer: whatsAppCustomer,
                })
              : ''
          }
        />
      )}
    </div>
  );
};
