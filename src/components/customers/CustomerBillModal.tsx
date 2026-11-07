import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Trash2,
  Calendar,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type {
  CustomerDocument,
  ProductDocument,
  CustomerDiscountDocument,
  SaleDocument,
  AdminCreditOverride,
} from '../../types/database';
import {
  searchProductsByName,
  searchProductBySku,
  type ProductSearchResult,
} from '../../services/productSearchService';
import { getCustomerDiscountsPaginated, resolveEffectivePrice } from '../../services/discountService';
import {
  processSaleTransaction,
  getOrCreateCheckoutSession,
  clearCheckoutSession,
  type ProcessSaleItemInput,
} from '../../services/saleService';
import { calculateInvoiceDueDate } from '../../services/dueDateService';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';

export interface CustomerBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerDocument | null;
  onSuccess: (sale: SaleDocument) => void;
}

interface BillLineItem {
  product: ProductDocument;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  effectivePrice: number;
  lineTotal: number;
}

export const CustomerBillModal: React.FC<CustomerBillModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const { currentUser, isAdmin } = useAuth();

  // Form State
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [items, setItems] = useState<BillLineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'cash' | 'bank_transfer'>('credit');
  const [cashTendered, setCashTendered] = useState<string>('0');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customerDiscounts, setCustomerDiscounts] = useState<CustomerDiscountDocument[]>([]);

  // Over-limit authorization state
  const [overrideReason, setOverrideReason] = useState('');

  // 1. Initialize or prefill Due Date when modal opens or customer/billDate changes
  useEffect(() => {
    if (isOpen && customer) {
      setBillDate(new Date().toISOString().split('T')[0]);
      setItems([]);
      setPaymentMethod('credit');
      setCashTendered('0');
      setNotes('');
      setFormError(null);
      setSearchTerm('');
      setSearchResults([]);
      setOverrideReason('');

      // Prefill due date if customer has creditDays configured
      if (typeof customer.creditDays === 'number' && customer.creditDays > 0) {
        const today = new Date().toISOString().split('T')[0];
        const autoDue = calculateInvoiceDueDate(today, customer.creditDays);
        setDueDate(autoDue || '');
      } else {
        setDueDate('');
      }

      // Fetch customer custom discounts
      getCustomerDiscountsPaginated(customer.id, null, 100)
        .then((res) => setCustomerDiscounts(res.discounts))
        .catch((err) => console.error('Failed to load customer discounts:', err));
    }
  }, [isOpen, customer]);

  // Recalculate automatic default due date when bill date changes (if not manually overridden)
  const creditDays = customer?.creditDays;
  const defaultDueDate = useMemo(() => {
    if (!creditDays || creditDays <= 0) return '';
    return calculateInvoiceDueDate(billDate, creditDays) || '';
  }, [creditDays, billDate]);

  // 2. Financial Totals Calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [items]);

  const grandTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [items]);

  const totalDiscount = Math.max(0, subtotal - grandTotal);

  const numericCashTendered = Math.max(0, Number(cashTendered) || 0);
  const balanceAddedToCredit = useMemo(() => {
    if (paymentMethod === 'credit') {
      return grandTotal;
    }
    if (paymentMethod === 'cash') {
      return Math.max(0, grandTotal - numericCashTendered);
    }
    return 0; // bank_transfer
  }, [paymentMethod, grandTotal, numericCashTendered]);

  const currentDebt = customer?.currentBalance || 0;
  const creditLimit = customer?.creditLimit || 0;
  const projectedBalance = currentDebt + balanceAddedToCredit;
  const isOverLimit = creditLimit > 0 && projectedBalance > creditLimit;
  const exceededAmount = isOverLimit ? projectedBalance - creditLimit : 0;

  // 3. Search Products
  const handleSearch = useCallback(
    async (text: string) => {
      setSearchTerm(text);
      const clean = text.trim();
      if (!clean || clean.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        if (clean.includes('-') || clean.toUpperCase() === clean) {
          const exact = await searchProductBySku(clean);
          if (exact) {
            setSearchResults([exact]);
            setIsSearching(false);
            return;
          }
        }
        const res = await searchProductsByName(clean, null);
        setSearchResults(res.products);
      } catch (err) {
        console.error('Failed to search products:', err);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // 4. Add Product to Invoice
  const handleAddProduct = (product: ProductSearchResult) => {
    if (!customer) return;

    // Check if already in items
    const existingIndex = items.findIndex((i) => i.product.id === product.id);
    if (existingIndex >= 0) {
      const existing = items[existingIndex];
      const newQty = existing.quantity + 1;
      if (newQty > product.currentStock) {
        alert(`Cannot add more: physical stock is limited to ${product.currentStock} units.`);
        return;
      }
      const updated = [...items];
      updated[existingIndex] = {
        ...existing,
        quantity: newQty,
        lineTotal: Math.round(existing.effectivePrice * newQty * 100) / 100,
      };
      setItems(updated);
      setSearchTerm('');
      setSearchResults([]);
      return;
    }

    if (product.currentStock <= 0) {
      alert(`Product "${product.title}" is out of physical stock.`);
      return;
    }

    // Resolve pricing with customer discounts
    const customDisc = customerDiscounts.find((d) => d.productId === product.id) || null;
    const priceResolution = resolveEffectivePrice(product, customer, customDisc);

    const basePrice = Number(product.retailPrice) || priceResolution.basePrice;
    const discRate = priceResolution.discountRatePercent;
    const unitDiscount = Math.round(basePrice * (discRate / 100) * 100) / 100;
    const effPrice = Math.max(0, Math.round((basePrice - unitDiscount) * 100) / 100);

    setItems((prev) => [
      ...prev,
      {
        product,
        quantity: 1,
        unitPrice: basePrice,
        discountRate: discRate,
        effectivePrice: effPrice,
        lineTotal: effPrice,
      },
    ]);

    setSearchTerm('');
    setSearchResults([]);
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }

    const item = items[index];
    if (newQty > item.product.currentStock) {
      alert(`Cannot exceed available physical stock (${item.product.currentStock} units).`);
      return;
    }

    const updated = [...items];
    updated[index] = {
      ...item,
      quantity: newQty,
      lineTotal: Math.round(item.effectivePrice * newQty * 100) / 100,
    };
    setItems(updated);
  };

  const handleUpdateDiscount = (index: number, newRate: number) => {
    const item = items[index];
    const rate = Math.max(0, Math.min(100, Number(newRate) || 0));
    const unitDiscount = Math.round(item.unitPrice * (rate / 100) * 100) / 100;
    const effectivePrice = Math.max(0, Math.round((item.unitPrice - unitDiscount) * 100) / 100);
    const lineTotal = Math.round(effectivePrice * item.quantity * 100) / 100;

    const updated = [...items];
    updated[index] = {
      ...item,
      discountRate: rate,
      effectivePrice,
      lineTotal,
    };
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // 5. Submit Bill Transaction
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customer) {
      setFormError('Customer is missing.');
      return;
    }

    if (items.length === 0) {
      setFormError('Please add at least one product line item to the bill.');
      return;
    }

    // STRICT DUE DATE REQUIREMENT FOR CREDIT BILLS
    const isCredit = balanceAddedToCredit > 0 || paymentMethod === 'credit';
    if (isCredit) {
      if (!dueDate || !dueDate.trim()) {
        setFormError(
          customer.creditDays
            ? 'A valid payment due date is required. Please select a deadline.'
            : 'This customer has no configured credit days. You must specify an approved payment due date before saving a credit bill.'
        );
        return;
      }

      if (dueDate < billDate) {
        setFormError(`Payment due date (${dueDate}) cannot precede the bill date (${billDate}).`);
        return;
      }
    }

    // Credit limit check & override requirement
    let creditLimitOverride: AdminCreditOverride | undefined = undefined;
    if (isOverLimit) {
      if (!isAdmin) {
        setFormError(
          `Customer credit limit exceeded by PKR ${exceededAmount.toFixed(2)}. Only administrators can authorize this bill.`
        );
        return;
      }

      if (!overrideReason.trim() || overrideReason.trim().length < 3) {
        setFormError('A mandatory reason is required to approve exceeding the customer credit limit.');
        return;
      }

      creditLimitOverride = {
        authorizedByUserId: currentUser?.uid || 'admin',
        authorizedByEmail: currentUser?.email || 'admin@sadiqbookagency.com',
        authorizedAt: new Date().toISOString(),
        reason: overrideReason.trim(),
        exceededAmount,
      };
    }

    setIsSubmitting(true);

    try {
      // 1. Session initialization (Khata partition)
      const session = getOrCreateCheckoutSession('KHATA');

      const saleItems: ProcessSaleItemInput[] = items.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        clientUnitPrice: i.unitPrice,
        clientDiscountRate: i.discountRate,
      }));

      const payload = {
        checkoutSessionId: session.checkoutSessionId,
        sessionCreatedAt: session.sessionCreatedAt,
        terminalId: 'KHATA',
        customerType: customer.type,
        customerId: customer.id,
        customerName: customer.shopName ? `${customer.shopName} (${customer.name})` : customer.name,
        items: saleItems,
        cashTendered: paymentMethod === 'cash' ? numericCashTendered : 0,
        paymentMethod,
        saleDate: billDate,
        customDueDate: isCredit ? dueDate : undefined,
        creditLimitOverride,
        notes: notes.trim() || undefined,
      };

      const operatorId = currentUser?.uid || 'system_admin';
      const operatorName = currentUser?.displayName || 'Store Administrator';
      const operatorEmail = currentUser?.email || 'admin@sadiqbookagency.com';

      const result = await processSaleTransaction(payload, operatorId, operatorName, operatorEmail);

      // Clean session after success
      clearCheckoutSession('KHATA');

      onSuccess(result.sale);
      onClose();
    } catch (err: any) {
      console.error('Failed to create credit bill:', err);
      setFormError(err?.message || 'An error occurred while creating the credit bill.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !customer) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Customer Khata Bill"
      description={`Customer: ${customer.shopName ? `${customer.shopName} (${customer.name})` : customer.name} • ${customer.type.toUpperCase()}`}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Customer Summary Strip */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className="text-slate-400 block text-[11px]">Current Khata Balance</span>
            <span className="font-bold text-slate-800 font-mono">
              {formatCurrency(customer.currentBalance)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Credit Limit</span>
            <span className="font-bold text-slate-800 font-mono">
              {formatCurrency(customer.creditLimit)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Credit Terms</span>
            <span className="font-bold text-slate-800">
              {customer.creditDays ? `${customer.creditDays} Days` : 'No Terms Configured'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Available Credit</span>
            <span
              className={`font-bold font-mono ${
                customer.creditLimit - customer.currentBalance > 0
                  ? 'text-emerald-700'
                  : 'text-rose-600'
              }`}
            >
              {formatCurrency(Math.max(0, customer.creditLimit - customer.currentBalance))}
            </span>
          </div>
        </div>

        {/* Product Search & Selector */}
        <div className="space-y-2">
          <label className="block font-bold text-slate-700">Add Products to Bill</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by Title or SKU (e.g. BK-SIN-001, Progressive English)..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#071F49]"
            />
            {isSearching && (
              <div className="absolute right-3 top-2.5">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-[#071F49] rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 z-10">
              {searchResults.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => handleAddProduct(prod)}
                  className="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900">{prod.title}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {prod.sku} • {prod.publisherName || 'Unknown'} • Stock: {prod.currentStock}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-800">
                      PKR {Number(prod.wholesalePrice || prod.retailPrice).toFixed(2)}
                    </div>
                    <button
                      type="button"
                      className="px-2 py-0.5 bg-[#071F49] text-white rounded text-[10px] font-bold"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Line Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 uppercase font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-right">Original MRP</th>
                <th className="px-3 py-2 text-center">Disc %</th>
                <th className="px-3 py-2 text-right">Disc Amt</th>
                <th className="px-3 py-2 text-right">Selling Price</th>
                <th className="px-3 py-2 text-right">Line Total</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-6 text-slate-400">
                    No products added to this invoice yet. Use the search bar above to add books or stationery.
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const lineDiscAmount = Math.round(it.unitPrice * (it.discountRate / 100) * 100) / 100;
                  return (
                    <tr key={it.product.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <div>{it.product.title}</div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {it.product.sku} (Stock: {it.product.currentStock})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="1"
                          max={it.product.currentStock}
                          value={it.quantity}
                          onChange={(e) => handleUpdateQuantity(idx, Number(e.target.value))}
                          className="w-14 text-center border border-slate-300 rounded px-1 py-0.5 font-bold focus:ring-1 focus:ring-[#071F49] focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        PKR {it.unitPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={it.discountRate}
                          onChange={(e) => handleUpdateDiscount(idx, parseFloat(e.target.value) || 0)}
                          className="w-14 text-center border border-amber-300 rounded px-1 py-0.5 font-bold text-amber-900 bg-amber-50/60 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700">
                        -PKR {(lineDiscAmount * it.quantity).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">
                        PKR {it.effectivePrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                        PKR {it.lineTotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Financial Calculation Summary & Payment Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Invoice Bill Date</label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                required
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('credit')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                    paymentMethod === 'credit'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Khata Credit
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                    paymentMethod === 'cash'
                      ? 'bg-[#071F49] text-white border-[#071F49] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Cash / Partial
                </button>
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cash Received (PKR)</label>
                <input
                  type="number"
                  min="0"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#071F49]"
                />
              </div>
            )}
          </div>

          <div className="space-y-2 font-mono">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>PKR {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-semibold">
              <span>Trade Discount:</span>
              <span>-PKR {totalDiscount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-200">
              <span>Grand Total:</span>
              <span>PKR {grandTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-amber-800 font-bold pt-1 border-t border-slate-200">
              <span>Adding to Customer Debt:</span>
              <span>PKR {balanceAddedToCredit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Projected Balance:</span>
              <span className={isOverLimit ? 'text-rose-600 font-bold' : ''}>
                PKR {projectedBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* DUE DATE SELECTION (PRIMARY REQUIREMENT)                            */}
        {/* ------------------------------------------------------------------ */}
        {(balanceAddedToCredit > 0 || paymentMethod === 'credit') && (
          <div className="p-4 bg-amber-50/70 border border-amber-300 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-700" />
                <label className="font-bold text-slate-900">
                  Payment Due Date <span className="text-red-600">*</span>
                </label>
              </div>

              {customer.creditDays ? (
                <span className="text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                  Customer Term: {customer.creditDays} Days
                </span>
              ) : (
                <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-300">
                  * Unconfigured Customer Terms (Date Required)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <input
                  type="date"
                  min={billDate}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full bg-white border border-amber-400 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#071F49]"
                />
              </div>

              <div className="text-[11px] text-slate-600 space-y-0.5">
                {customer.creditDays && dueDate === defaultDueDate ? (
                  <p className="text-emerald-800 font-medium">
                    ✓ Automatically prefilled using customer profile term ({customer.creditDays} days).
                  </p>
                ) : customer.creditDays && dueDate && dueDate !== defaultDueDate ? (
                  <p className="text-indigo-800 font-bold">
                    ✎ Admin manual override active (Default would be {defaultDueDate}).
                  </p>
                ) : !customer.creditDays && dueDate ? (
                  <p className="text-emerald-800 font-medium">
                    ✓ Explicit admin deadline selected ({dueDate}).
                  </p>
                ) : (
                  <p className="text-rose-700 font-bold">
                    ⚠️ Please specify an approved payment due date for this credit bill.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Over-Limit Admin Override Section */}
        {isOverLimit && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-800">
            <div className="flex items-center gap-1.5 font-bold text-red-900">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Credit Limit Exceeded by PKR {exceededAmount.toFixed(2)}</span>
            </div>
            <p className="text-[11px]">
              Customer credit limit is PKR {customer.creditLimit.toFixed(2)}. This bill requires Administrator authorization.
            </p>
            {isAdmin ? (
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Administrator Authorization Justification <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g., Approved temporary seasonal credit limit increase by store manager."
                  required
                  className="w-full bg-white border border-red-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#071F49]"
                />
              </div>
            ) : (
              <p className="font-bold text-red-700">
                You do not have Administrator permissions to approve exceeding customer credit limits.
              </p>
            )}
          </div>
        )}

        {formError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{formError}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="sm"
            type="submit"
            disabled={isSubmitting || items.length === 0 || (isOverLimit && !isAdmin)}
            leftIcon={
              isSubmitting ? undefined : <Receipt className="w-3.5 h-3.5 text-[#071F49]" />
            }
          >
            {isSubmitting
              ? 'Processing Credit Bill...'
              : `Save & Post Bill (${formatCurrency(grandTotal)})`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
