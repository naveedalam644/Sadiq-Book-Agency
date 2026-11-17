import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Trash2,
  Calendar,
  AlertTriangle,
  Receipt,
  X,
  Plus,
  Maximize2,
  Minimize2,
  GraduationCap,
  BookOpen,
  Layers,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type {
  CustomerDocument,
  ProductDocument,
  CustomerDiscountDocument,
  SaleDocument,
  AdminCreditOverride,
  PublisherDocument,
  SeriesDocument,
  CategoryDocument,
  ItemClassification,
} from '../../types/database';
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
import { getActivePublishers } from '../../services/publisherService';
import { getSeriesByPublisher } from '../../services/seriesService';
import { getCategories } from '../../services/categoryService';
import { getProductsPaginated } from '../../services/productService';
import { STANDARD_CLASSES } from '../../services/syllabusService';
import {
  matchesProductSearch,
  matchesSearchTokens,
  sortProductsByClassSequence,
} from '../../utils/purchaseFormHelpers';

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
  const { currentUser, firebaseUser, isAdmin } = useAuth();

  // Form State
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [items, setItems] = useState<BillLineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'cash' | 'bank_transfer'>('credit');
  const [cashTendered, setCashTendered] = useState<string>('0');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter Mode & Dropdowns State
  const [filterMode, setFilterMode] = useState<'books' | 'others'>('books');
  const [publisherFilter, setPublisherFilter] = useState('all');
  const [seriesFilter, setSeriesFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [sheetFilter, setSheetFilter] = useState('all');

  // Metadata Lists
  const [publishersList, setPublishersList] = useState<PublisherDocument[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);
  const [categoriesList, setCategoriesList] = useState<CategoryDocument[]>([]);
  const [customerDiscounts, setCustomerDiscounts] = useState<CustomerDiscountDocument[]>([]);

  // Products Catalog & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [availableProducts, setAvailableProducts] = useState<ProductDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isExpandedHeight, setIsExpandedHeight] = useState(false);
  const [inputQuantities, setInputQuantities] = useState<Record<string, number>>({});

  // Over-limit authorization state
  const [overrideReason, setOverrideReason] = useState('');

  // 1. Initialize modal state when opened or customer changes
  useEffect(() => {
    if (isOpen && customer) {
      setBillDate(new Date().toISOString().split('T')[0]);
      setItems([]);
      setPaymentMethod('credit');
      setCashTendered('0');
      setNotes('');
      setFormError(null);
      setSearchTerm('');
      setFilterMode('books');
      setPublisherFilter('all');
      setSeriesFilter('all');
      setClassFilter('all');
      setCategoryFilter('all');
      setSizeFilter('all');
      setSheetFilter('all');
      setInputQuantities({});
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

      // Fetch active publishers
      getActivePublishers()
        .then(setPublishersList)
        .catch((err) => console.error('Failed to load publishers:', err));

      // Fetch store categories
      getCategories()
        .then(setCategoriesList)
        .catch((err) => console.error('Failed to load categories:', err));

      // Pre-load active products into local pool
      getProductsPaginated({ status: 'active' }, null, 250)
        .then((res) => setAvailableProducts(res.products))
        .catch((err) => console.error('Failed to load catalog products:', err));
    }
  }, [isOpen, customer]);

  // Load series whenever selected publisher changes
  useEffect(() => {
    if (publisherFilter && publisherFilter !== 'all') {
      getSeriesByPublisher(publisherFilter)
        .then(setSeriesList)
        .catch((err) => console.error('Failed to load series for publisher:', err));
    } else {
      setSeriesList([]);
    }
  }, [publisherFilter]);

  // Recalculate automatic default due date when bill date changes
  const creditDays = customer?.creditDays;
  const defaultDueDate = useMemo(() => {
    if (!creditDays || creditDays <= 0) return '';
    return calculateInvoiceDueDate(billDate, creditDays) || '';
  }, [creditDays, billDate]);

  // Dynamic Sizes and Sheets from catalog products
  const dynamicSizes = useMemo(() => {
    const defaultSizes = ['A4', 'A5', 'Foolscap', 'Large', 'Medium', 'Small'];
    const fromCatalog = availableProducts
      .map((p) => p.notebookSize?.trim())
      .filter(Boolean) as string[];
    const set = new Set([...defaultSizes, ...fromCatalog]);
    return Array.from(set).sort();
  }, [availableProducts]);

  const dynamicSheets = useMemo(() => {
    const defaultSheets = ['40', '60', '80', '100', '120', '160', '200', '240', '300'];
    const fromCatalog = availableProducts
      .map((p) => p.notebookSheets?.trim()?.replace(/[^0-9]/g, ''))
      .filter(Boolean) as string[];
    const set = new Set([...defaultSheets, ...fromCatalog]);
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [availableProducts]);

  // 2. Background Firestore Search when filters or query changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const term = searchTerm.trim();

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await getProductsPaginated(
          {
            status: 'active',
            searchTerm: term || undefined,
            publisherId: publisherFilter !== 'all' ? publisherFilter : undefined,
            seriesId: seriesFilter !== 'all' ? seriesFilter : undefined,
            targetClass: classFilter !== 'all' ? classFilter : undefined,
            classification:
              filterMode === 'books'
                ? 'book'
                : categoryFilter !== 'all' && ['notebook', 'register', 'stationery', 'general'].includes(categoryFilter)
                ? (categoryFilter as ItemClassification)
                : undefined,
            categoryId:
              categoryFilter !== 'all' && !['notebook', 'register', 'stationery', 'general'].includes(categoryFilter)
                ? categoryFilter
                : undefined,
          },
          null,
          100
        );

        if (isMounted && result.products.length > 0) {
          setAvailableProducts((prev) => {
            const map = new Map<string, ProductDocument>();
            prev.forEach((p) => map.set(p.id, p));
            result.products.forEach((p) => map.set(p.id, p));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('Background customer bill product lookup failed:', err);
      } finally {
        if (isMounted) setIsSearching(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    searchTerm,
    publisherFilter,
    seriesFilter,
    classFilter,
    categoryFilter,
    sizeFilter,
    sheetFilter,
    filterMode,
    isOpen,
  ]);

  // 3. In-memory Filtered Matching Products (Books vs Notebooks/Stationery)
  const matchingProducts = useMemo(() => {
    const filtered = availableProducts.filter((p) => {
      if (filterMode === 'books') {
        const isBook = p.classification === 'book' || !p.classification;
        if (!isBook && !searchTerm.trim()) return false;
        const selectedPub = publishersList.find((pub) => pub.id === publisherFilter);
        const selectedSer = seriesList.find((ser) => ser.id === seriesFilter);
        return matchesProductSearch(
          p,
          searchTerm,
          'all',
          'all',
          'all',
          publisherFilter,
          seriesFilter,
          classFilter,
          selectedPub?.name,
          selectedSer?.name
        );
      } else {
        // Others: Notebook, Register, Stationery, General
        const isNotBook = p.classification && p.classification !== 'book';
        if (!isNotBook && !searchTerm.trim()) return false;

        // Text search
        if (!matchesSearchTokens(p, searchTerm)) return false;

        // Category / Classification
        if (categoryFilter !== 'all') {
          const catLower = categoryFilter.toLowerCase();
          const matchesClass = p.classification?.toLowerCase() === catLower;
          const matchesCatId = p.categoryId === categoryFilter;
          const matchesCatName = p.categoryName?.toLowerCase() === catLower;
          if (!matchesClass && !matchesCatId && !matchesCatName) return false;
        }

        // Size filter
        if (sizeFilter !== 'all') {
          const prodSize = (p.notebookSize || '').trim().toLowerCase();
          if (prodSize !== sizeFilter.trim().toLowerCase()) return false;
        }

        // Sheet count filter
        if (sheetFilter !== 'all') {
          const prodSheets = (p.notebookSheets || '').trim().toLowerCase().replace(/[^0-9]/g, '');
          const targetSheets = sheetFilter.trim().toLowerCase().replace(/[^0-9]/g, '');
          if (prodSheets !== targetSheets) return false;
        }

        return true;
      }
    });

    return sortProductsByClassSequence(filtered);
  }, [
    availableProducts,
    filterMode,
    searchTerm,
    publisherFilter,
    seriesFilter,
    classFilter,
    categoryFilter,
    sizeFilter,
    sheetFilter,
    publishersList,
    seriesList,
  ]);

  // 4. Financial Totals Calculations
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

  // 5. Add Product to Invoice (with quantity & customer pricing)
  const handleSelectProduct = (product: ProductDocument, quantityToAdd = 1) => {
    if (!customer) return;

    const qty = Math.max(1, Number(quantityToAdd) || 1);
    const existingIndex = items.findIndex((i) => i.product.id === product.id);

    if (existingIndex >= 0) {
      const existing = items[existingIndex];
      const newQty = existing.quantity + qty;
      if (product.currentStock !== undefined && newQty > product.currentStock) {
        alert(
          `Cannot add ${qty} more: physical stock is limited to ${product.currentStock} units (already have ${existing.quantity} in bill).`
        );
        return;
      }
      const updated = [...items];
      updated[existingIndex] = {
        ...existing,
        quantity: newQty,
        lineTotal: Math.round(existing.effectivePrice * newQty * 100) / 100,
      };
      setItems(updated);
      return;
    }

    if (product.currentStock !== undefined && product.currentStock <= 0) {
      alert(`Product "${product.title}" is currently out of physical stock.`);
      return;
    }

    if (product.currentStock !== undefined && qty > product.currentStock) {
      alert(`Cannot add ${qty} units: physical stock is only ${product.currentStock} units.`);
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
        quantity: qty,
        unitPrice: basePrice,
        discountRate: discRate,
        effectivePrice: effPrice,
        lineTotal: Math.round(effPrice * qty * 100) / 100,
      },
    ]);
  };

  const handleAddAllMatching = () => {
    matchingProducts.forEach((p) => {
      const qty = Number(inputQuantities[p.id]) || 1;
      handleSelectProduct(p, qty);
    });
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }

    const item = items[index];
    if (item.product.currentStock !== undefined && newQty > item.product.currentStock) {
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

  // 6. Submit Bill Transaction
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

      const activeUid = firebaseUser?.uid || currentUser?.uid;
      const operatorId = activeUid || 'system_admin';
      const operatorName = currentUser?.displayName || firebaseUser?.displayName || 'Store Administrator';
      const operatorEmail = firebaseUser?.email || currentUser?.email || 'admin@sadiqbookagency.com';

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

        {/* ------------------------------------------------------------------ */}
        {/* ENHANCED PRODUCT FINDER WITH DUAL HIERARCHY FILTERS               */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-3 bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setFilterMode('books');
                  setSearchTerm('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  filterMode === 'books'
                    ? 'bg-[#071F49] text-[#F5B51B] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>📚 Books (Publisher &rarr; Series &rarr; Class)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilterMode('others');
                  setSearchTerm('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  filterMode === 'others'
                    ? 'bg-[#071F49] text-[#F5B51B] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>📒 Notebook & Stationery (Category &rarr; Size &rarr; Sheet)</span>
              </button>
            </div>

            <div className="text-[11px] font-semibold text-slate-500">
              {matchingProducts.length} items found in catalog
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                filterMode === 'books'
                  ? 'Search books by title, SKU, barcode, publisher...'
                  : 'Search notebooks, registers, stationery by title, size, sheets, SKU...'
              }
              className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#071F49]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* FLOW 1: Books Mode -> Publisher > Series > Class */}
          {filterMode === 'books' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-blue-50/60 p-2.5 rounded-xl border border-blue-200">
              {/* 1. Publisher */}
              <div>
                <label className="block text-[10px] font-bold text-[#071F49] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#071F49] text-[#F5B51B] flex items-center justify-center text-[9px] font-black">1</span>
                  <span>Publisher</span>
                </label>
                <select
                  value={publisherFilter}
                  onChange={(e) => {
                    setPublisherFilter(e.target.value);
                    setSeriesFilter('all');
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-slate-800 font-medium focus:outline-none focus:border-[#071F49]"
                >
                  <option value="all">All Publishers</option>
                  {publishersList.map((pub) => (
                    <option key={pub.id} value={pub.id}>
                      {pub.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Series */}
              <div>
                <label className="block text-[10px] font-bold text-[#071F49] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#071F49] text-[#F5B51B] flex items-center justify-center text-[9px] font-black">2</span>
                  <span>Series</span>
                </label>
                <select
                  value={seriesFilter}
                  onChange={(e) => setSeriesFilter(e.target.value)}
                  disabled={publisherFilter === 'all'}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-slate-800 font-medium focus:outline-none focus:border-[#071F49] disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="all">
                    {publisherFilter === 'all'
                      ? 'Select Publisher first'
                      : seriesList.length === 0
                      ? 'No Series (All Titles)'
                      : 'All Series'}
                  </option>
                  {seriesList.map((ser) => (
                    <option key={ser.id} value={ser.id}>
                      {ser.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Class */}
              <div>
                <label className="block text-[10px] font-bold text-[#071F49] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#071F49] text-[#F5B51B] flex items-center justify-center text-[9px] font-black">3</span>
                  <span>Class</span>
                </label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-slate-800 font-medium focus:outline-none focus:border-[#071F49]"
                >
                  <option value="all">All Classes</option>
                  {STANDARD_CLASSES.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            /* FLOW 2: Notebook, Register & Stationery -> Category > Size > Sheet */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200">
              {/* 1. Category */}
              <div>
                <label className="block text-[10px] font-bold text-amber-950 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-700 text-white flex items-center justify-center text-[9px] font-black">1</span>
                  <span>Category / Type</span>
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-slate-800 font-medium focus:outline-none focus:border-amber-700"
                >
                  <option value="all">All Non-Book Items</option>
                  <option value="register">Registers</option>
                  <option value="notebook">Notebooks</option>
                  <option value="stationery">Stationery & Writing</option>
                  <option value="general">General Items</option>
                  {categoriesList.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Size */}
              <div>
                <label className="block text-[10px] font-bold text-amber-950 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-700 text-white flex items-center justify-center text-[9px] font-black">2</span>
                  <span>Size</span>
                </label>
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-slate-800 font-medium focus:outline-none focus:border-amber-700"
                >
                  <option value="all">All Sizes</option>
                  {dynamicSizes.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Sheet Count */}
              <div>
                <label className="block text-[10px] font-bold text-amber-950 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-700 text-white flex items-center justify-center text-[9px] font-black">3</span>
                  <span>Sheet Count</span>
                </label>
                <select
                  value={sheetFilter}
                  onChange={(e) => setSheetFilter(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-slate-800 font-medium focus:outline-none focus:border-amber-700"
                >
                  <option value="all">All Sheet Counts</option>
                  {dynamicSheets.map((sh) => (
                    <option key={sh} value={sh}>
                      {sh} Sheets
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Matching Products Drawer */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
            <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#071F49]">
                  Matching Products ({matchingProducts.length})
                </span>
                {isSearching && (
                  <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-[#071F49] rounded-full animate-spin" />
                )}
              </div>

              <div className="flex items-center gap-2">
                {matchingProducts.length > 1 && (
                  <button
                    type="button"
                    onClick={handleAddAllMatching}
                    className="text-[11px] font-bold text-[#071F49] bg-[#F5B51B] hover:bg-[#F8CE4E] px-2.5 py-1 rounded-md transition shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Add all matching items to bill with specified quantities"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add All ({matchingProducts.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsExpandedHeight(!isExpandedHeight)}
                  className="text-[11px] font-semibold text-slate-600 hover:text-[#071F49] bg-white border border-slate-300 px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1"
                >
                  {isExpandedHeight ? (
                    <>
                      <Minimize2 className="w-3 h-3" />
                      <span>Compact</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3 h-3" />
                      <span>Expand</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div
              className={`${
                isExpandedHeight ? 'max-h-80' : 'max-h-48'
              } overflow-y-auto divide-y divide-slate-100`}
            >
              {matchingProducts.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  No products match the selected filters or search terms.
                </div>
              ) : (
                matchingProducts.map((prod) => {
                  const existingItem = items.find((i) => i.product.id === prod.id);
                  const isAlreadyAdded = Boolean(existingItem);
                  const existingQty = existingItem?.quantity || 0;

                  // Resolve pricing for customer preview
                  const customDisc = customerDiscounts.find((d) => d.productId === prod.id) || null;
                  const priceRes = resolveEffectivePrice(prod, customer, customDisc);
                  const basePrice = Number(prod.retailPrice) || priceRes.basePrice;
                  const discRate = priceRes.discountRatePercent;
                  const unitDiscount = Math.round(basePrice * (discRate / 100) * 100) / 100;
                  const effPrice = Math.max(0, Math.round((basePrice - unitDiscount) * 100) / 100);

                  const resolvedClass =
                    prod.targetClass ||
                    prod.className ||
                    (prod.edition && /class|grade|prep|nursery|kg/i.test(prod.edition) ? prod.edition : undefined);

                  const enteredQty = inputQuantities[prod.id] ?? 1;

                  return (
                    <div
                      key={prod.id}
                      className="p-2.5 hover:bg-blue-50/40 flex items-center justify-between gap-3 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 truncate">{prod.title}</span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1 rounded border border-slate-200">
                            {prod.sku}
                          </span>
                          {resolvedClass && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded font-bold border border-emerald-200 flex items-center gap-0.5">
                              <GraduationCap className="w-2.5 h-2.5 text-emerald-600" />
                              <span>{resolvedClass}</span>
                            </span>
                          )}
                          {prod.seriesName && (
                            <span className="text-[10px] bg-blue-50 text-blue-800 px-1.5 py-0.2 rounded font-medium border border-blue-200">
                              {prod.seriesName}
                            </span>
                          )}
                          {prod.classification && prod.classification !== 'book' && (
                            <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded font-medium border border-amber-200 uppercase">
                              {prod.classification}
                            </span>
                          )}
                          {(prod.notebookSize || prod.notebookSheets) && (
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-medium border border-indigo-200">
                              {[prod.notebookSize, prod.notebookSheets ? `${prod.notebookSheets} Sh` : ''].filter(Boolean).join(' • ')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          {prod.publisherName && (
                            <span>Publisher: <strong className="text-slate-700">{prod.publisherName}</strong></span>
                          )}
                          <span>•</span>
                          <span>
                            Stock:{' '}
                            <strong
                              className={
                                (prod.currentStock || 0) > 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'
                              }
                            >
                              {prod.currentStock || 0} pcs
                            </strong>
                          </span>
                          <span>•</span>
                          <span>MRP: PKR {basePrice.toFixed(2)}</span>
                          {discRate > 0 && (
                            <span className="text-amber-800 font-semibold font-mono">
                              (Disc: {discRate}%)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Add Action Controls */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="font-bold text-[#071F49] font-mono text-xs">
                            PKR {effPrice.toFixed(2)}
                          </div>
                          <div className="text-[9px] text-slate-400">Net Rate</div>
                        </div>

                        {/* Quantity input box */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max={prod.currentStock || 9999}
                            value={enteredQty}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setInputQuantities((prev) => ({ ...prev, [prod.id]: val }));
                            }}
                            className="w-12 text-center text-xs border border-slate-300 rounded px-1 py-1 font-bold focus:ring-1 focus:ring-[#071F49] focus:outline-none"
                            title="Direct quantity to add"
                          />
                          <button
                            type="button"
                            onClick={() => handleSelectProduct(prod, enteredQty)}
                            disabled={(prod.currentStock || 0) <= 0}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                              isAlreadyAdded
                                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                                : 'bg-[#071F49] text-white hover:bg-[#0c2f6d]'
                            } disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed`}
                          >
                            <Plus className="w-3 h-3" />
                            <span>{isAlreadyAdded ? `Added (${existingQty})` : 'Add'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Selected Line Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
          <div className="bg-slate-100/90 px-3 py-1.5 border-b border-slate-200 flex justify-between items-center text-xs font-bold text-slate-700">
            <span>Bill Line Items ({items.length})</span>
            <span className="font-mono text-[11px] text-slate-500">
              Total Units: {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase font-semibold text-slate-600 border-b border-slate-200 text-[10px]">
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
                    No products added to this bill yet. Use the filters and search drawer above to add books or stationery.
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
                          title="Remove item"
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

        {/* DUE DATE SELECTION */}
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
