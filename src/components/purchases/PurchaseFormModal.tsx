import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  Trash2,
  AlertCircle,
  Calculator,
  Receipt,
  Search,
  X,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Package,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import type {
  SupplierDocument,
  ProductDocument,
  ItemClassification,
  PublisherDocument,
  SeriesDocument,
} from '../../types/database';
import {
  type CreatePurchaseInput,
  checkPurchaseInvoiceUnique,
} from '../../services/purchaseService';
import { getProductsPaginated } from '../../services/productService';
import { getActivePublishers } from '../../services/publisherService';
import { getActiveSeriesByPublisher } from '../../services/seriesService';
import { STANDARD_CLASSES } from '../../services/syllabusService';
import { formatCurrency } from '../../utils/formatters';
import {
  type PurchaseItemRow,
  CORE_CATEGORIES,
  matchesProductSearch,
  addOrIncrementPurchaseItem,
  updatePurchaseItemField,
} from '../../utils/purchaseFormHelpers';

export type { PurchaseItemRow };

export interface PurchaseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePurchaseInput) => Promise<void>;
  suppliers: SupplierDocument[];
  products: ProductDocument[];
  isLoading?: boolean;
}

const getInitialDate = () => new Date().toISOString().split('T')[0];
const generateInitialInvoiceNo = () =>
  `PUR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

export const PurchaseFormModal: React.FC<PurchaseFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  suppliers,
  products,
  isLoading = false,
}) => {
  // Invoice Header
  const [supplierId, setSupplierId] = useState('');
  const [purchaseInvoiceNo, setPurchaseInvoiceNo] = useState(generateInitialInvoiceNo);
  const [purchaseDate, setPurchaseDate] = useState(getInitialDate);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit'>('cash');
  const [discountAmount, setDiscountAmount] = useState<number | ''>(0);
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');

  // Invoice Items
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filter State (Separate Flows: Books vs Notebooks & Other Items)
  const [intakeMode, setIntakeMode] = useState<'books' | 'others'>('books');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Book Mode Hierarchy: Publisher > Series > Class
  const [publishersList, setPublishersList] = useState<PublisherDocument[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);
  const [publisherFilter, setPublisherFilter] = useState('all');
  const [seriesFilter, setSeriesFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  // Notebooks & Other Items Flow: Item Classification > Category
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [availableProducts, setAvailableProducts] = useState<ProductDocument[]>(products);
  const [isSearching, setIsSearching] = useState(false);
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false);
  const [isExpandedHeight, setIsExpandedHeight] = useState(false);

  // Load Active Publishers for Books intake flow
  useEffect(() => {
    if (isOpen) {
      getActivePublishers()
        .then(setPublishersList)
        .catch((err) => console.warn('Could not load publishers in purchase intake:', err));
    }
  }, [isOpen]);

  // Load Series cascading for selected Publisher
  useEffect(() => {
    if (publisherFilter && publisherFilter !== 'all') {
      getActiveSeriesByPublisher(publisherFilter)
        .then(setSeriesList)
        .catch(() => setSeriesList([]));
    } else {
      setSeriesList([]);
    }
  }, [publisherFilter]);

  // Auto-dismiss feedback message after 3 seconds
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = (msg: string) => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setFeedbackMsg(msg);
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackMsg(null);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Sync available products when products prop updates
  useEffect(() => {
    if (products.length > 0) {
      setAvailableProducts((prev) => {
        const map = new Map<string, ProductDocument>();
        prev.forEach((p) => map.set(p.id, p));
        products.forEach((p) => map.set(p.id, p));
        return Array.from(map.values());
      });
    }
  }, [products]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSupplierId(suppliers.length > 0 ? suppliers[0].id : '');
      setPurchaseInvoiceNo(generateInitialInvoiceNo());
      setPurchaseDate(getInitialDate());
      setPaymentMethod('cash');
      setDiscountAmount(0);
      setPaidAmount(0);
      setNotes('');
      setFormError(null);
      setFeedbackMsg(null);
      setIsSubmitting(false);
      setSearchTerm('');
      setCategoryFilter('all');
      setClassificationFilter('all');
      setAuthorFilter('all');
      setIsResultsCollapsed(false);
      setItems([]);
    }
  }, [isOpen, suppliers]);

  // Search & load products from Firestore whenever filters or search terms change
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const term = searchTerm.trim();

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const catIdMap: Record<string, string> = {
          Primary: 'cat_primary',
          Middle: 'cat_middle',
          Matric: 'cat_matric',
          Secondary: 'cat_secondary',
          Intermediate: 'cat_intermediate',
          Others: 'cat_others',
        };

        const result = await getProductsPaginated(
          {
            status: 'active',
            searchTerm: term || undefined,
            publisherId: publisherFilter !== 'all' ? publisherFilter : undefined,
            seriesId: seriesFilter !== 'all' ? seriesFilter : undefined,
            targetClass: classFilter !== 'all' ? classFilter : undefined,
            classification:
              classificationFilter !== 'all'
                ? (classificationFilter as ItemClassification)
                : undefined,
            categoryId: categoryFilter !== 'all' ? catIdMap[categoryFilter] : undefined,
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
        console.warn('Background product search lookup failed:', err);
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
    classificationFilter,
    authorFilter,
    isOpen,
  ]);

  // In-memory filtered matching products: Dedicated Flow for Books vs Notebooks & Other Items
  const matchingProducts = useMemo(() => {
    return availableProducts.filter((p) => {
      if (intakeMode === 'books') {
        // Books Flow: Must be a book, and match Publisher > Series > Class
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
        // Notebooks & Other Items Flow: Must NOT be book, and match Item Classification > Category
        const isNotBook = p.classification && p.classification !== 'book';
        if (!isNotBook && !searchTerm.trim()) return false;
        return matchesProductSearch(
          p,
          searchTerm,
          categoryFilter,
          classificationFilter,
          authorFilter
        );
      }
    });
  }, [
    availableProducts,
    intakeMode,
    searchTerm,
    publisherFilter,
    seriesFilter,
    classFilter,
    categoryFilter,
    classificationFilter,
    authorFilter,
    publishersList,
    seriesList,
  ]);

  // Recalculate financial totals
  const subtotal = items.reduce((acc, row) => acc + (Number(row.totalCost) || 0), 0);
  const numDiscount = Number(discountAmount) || 0;
  const grandTotal = Math.max(0, subtotal - numDiscount);

  // When grandTotal changes and payment is cash, sync paidAmount
  useEffect(() => {
    if (paymentMethod === 'cash') {
      setPaidAmount(grandTotal);
    } else if (paymentMethod === 'credit') {
      setPaidAmount(0);
    }
  }, [grandTotal, paymentMethod]);

  const numPaid = Number(paidAmount) || 0;
  const remainingBalance = Math.max(0, grandTotal - numPaid);

  // Add product or increment quantity if already exists
  const handleSelectProduct = (product: ProductDocument) => {
    const { updatedItems, isIncrement } = addOrIncrementPurchaseItem(items, product);
    setItems(updatedItems);

    if (isIncrement) {
      const existing = updatedItems.find((i) => i.productId === product.id);
      showFeedback(`Increased "${product.title}" quantity to ${existing?.quantity} units`);
    } else {
      showFeedback(`Added "${product.title}" to purchase invoice`);
    }
  };

  const handleRowChange = (
    index: number,
    field: 'quantity' | 'mrp' | 'publisherDiscountPercent' | 'unitCost' | 'totalCost',
    val: number | ''
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = updatePurchaseItemField(updated[index], field, val);
      return updated;
    });
  };

  const handleRemoveRow = (index: number) => {
    const removedItem = items[index];
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (removedItem) {
      showFeedback(`Removed "${removedItem.productName}" from invoice`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError('Please select a supplier.');
      return;
    }

    if (!purchaseInvoiceNo.trim()) {
      setFormError('Invoice / Bill reference number is required.');
      return;
    }

    if (items.length === 0) {
      setFormError('Purchase invoice must contain at least one product line.');
      return;
    }

    for (const it of items) {
      if (!it.productId) {
        setFormError('Please select a valid product for every item row.');
        return;
      }
      if (!it.quantity || Number(it.quantity) <= 0) {
        setFormError(`Quantity for "${it.productName}" must be at least 1.`);
        return;
      }
      if (it.unitCost === '' || Number(it.unitCost) < 0) {
        setFormError(`Unit rate for "${it.productName}" cannot be negative.`);
        return;
      }
    }

    const isUnique = await checkPurchaseInvoiceUnique(supplierId, purchaseInvoiceNo);
    if (!isUnique) {
      setFormError(`Purchase invoice "${purchaseInvoiceNo}" is already logged for this supplier.`);
      return;
    }

    const selectedSupplier = suppliers.find((s) => s.id === supplierId);

    const payload: CreatePurchaseInput = {
      purchaseInvoiceNo: purchaseInvoiceNo.trim(),
      supplierId,
      supplierName: selectedSupplier ? selectedSupplier.companyName : 'Supplier',
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: Number(i.quantity),
        mrp: i.mrp !== '' ? Number(i.mrp) : undefined,
        publisherDiscountPercent: i.publisherDiscountPercent !== '' ? Number(i.publisherDiscountPercent) : undefined,
        unitCost: Number(i.unitCost),
        totalCost: Number(i.totalCost),
      })),
      subtotal,
      discountAmount: numDiscount,
      grandTotal,
      paidAmount: numPaid,
      paymentMethod,
      purchaseDate,
      notes: notes.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to record purchase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Purchase Order / Stock Intake"
      description="Record incoming shipment from publishing houses or paper mills. Physical stock and audit movements will update automatically."
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs font-semibold text-slate-600">
            Grand Total:{' '}
            <span className="font-mono text-base font-bold text-[#071F49] ml-1">
              {formatCurrency(grandTotal)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              type="submit"
              form="purchase-form"
              isLoading={isSubmitting || isLoading}
              disabled={isSubmitting || isLoading || items.length === 0}
            >
              Finalize Purchase & Update Stock
            </Button>
          </div>
        </div>
      }
    >
      <form id="purchase-form" onSubmit={handleSubmit} className="space-y-3.5">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Supplier & Invoice Header (Compact & Crisp) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
          <Select
            label="Supplier / Publisher *"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            options={suppliers.map((s) => ({
              value: s.id,
              label: `${s.companyName} (${s.contactPerson})`,
            }))}
            required
          />

          <Input
            label="Supplier Bill / Invoice # *"
            placeholder="e.g. INV-9042 / BILL-128"
            value={purchaseInvoiceNo}
            onChange={(e) => setPurchaseInvoiceNo(e.target.value)}
            required
          />

          <Input
            label="Purchase Date *"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
          />
        </div>

        {/* Product Search & Filter Intake Panel */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 p-2.5 sm:p-3 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-[#071F49] text-[#F5B51B] rounded-lg">
                <Search className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 leading-none">
                  Search & Add Products to Invoice
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
                  Lookup by Product Name, SKU, Barcode, Author / Publisher, or Category
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isSearching && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                  Searching catalog...
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsResultsCollapsed(!isResultsCollapsed)}
                className="text-[11px] font-semibold text-slate-600 hover:text-[#071F49] flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/60 transition"
              >
                <span>{isResultsCollapsed ? 'Show Matching Products' : 'Collapse Panel'}</span>
                {isResultsCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Intake Pathway Switcher: Books vs Notebooks & Other Items */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5">
            <button
              type="button"
              onClick={() => {
                setIntakeMode('books');
                setSearchTerm('');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                intakeMode === 'books'
                  ? 'bg-[#071F49] text-[#F5B51B] shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <span>📚 Book Intake (Publisher &rarr; Series &rarr; Class)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIntakeMode('others');
                setSearchTerm('');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                intakeMode === 'others'
                  ? 'bg-[#071F49] text-[#F5B51B] shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <span>📒 Notebook & Other Items (Classification &rarr; Category)</span>
            </button>
          </div>

          {/* Search Input and Dynamic Filters based on Mode */}
          <div className="space-y-2">
            {/* Search Input Box */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  intakeMode === 'books'
                    ? "Search books by title, SKU, barcode, publisher..."
                    : "Search notebooks, registers, stationery by title, brand, SKU..."
                }
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 text-slate-900 focus:outline-none focus:border-[#F5B51B] focus:ring-1 focus:ring-[#F5B51B] transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Clear product search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* FLOW 1: Books Mode -> Publisher > Series > Class */}
            {intakeMode === 'books' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-blue-50/50 p-2 rounded-xl border border-blue-100">
                {/* 1. Publisher */}
                <div>
                  <label className="block text-[10px] font-bold text-[#071F49] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-[#071F49] text-[#F5B51B] flex items-center justify-center text-[8px] font-black">1</span>
                    <span>Publisher</span>
                  </label>
                  <select
                    value={publisherFilter}
                    onChange={(e) => {
                      setPublisherFilter(e.target.value);
                      setSeriesFilter('all');
                    }}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1 px-2 text-slate-800 focus:outline-none focus:border-[#071F49]"
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
                  <label className="block text-[10px] font-bold text-[#071F49] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-[#071F49] text-[#F5B51B] flex items-center justify-center text-[8px] font-black">2</span>
                    <span>Series</span>
                  </label>
                  <select
                    value={seriesFilter}
                    onChange={(e) => setSeriesFilter(e.target.value)}
                    disabled={publisherFilter === 'all'}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1 px-2 text-slate-800 focus:outline-none focus:border-[#071F49] disabled:bg-slate-100 disabled:text-slate-400"
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

                {/* 3. Academic Class */}
                <div>
                  <label className="block text-[10px] font-bold text-[#071F49] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-[#071F49] text-[#F5B51B] flex items-center justify-center text-[8px] font-black">3</span>
                    <span>Class</span>
                  </label>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1 px-2 text-slate-800 focus:outline-none focus:border-[#071F49]"
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
              /* FLOW 2: Notebooks & Other Items Mode -> Item Classification > Category */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-amber-50/50 p-2 rounded-xl border border-amber-100">
                {/* 1. Item Classification */}
                <div>
                  <label className="block text-[10px] font-bold text-amber-950 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-amber-700 text-white flex items-center justify-center text-[8px] font-black">1</span>
                    <span>Item Classification</span>
                  </label>
                  <select
                    value={classificationFilter}
                    onChange={(e) => setClassificationFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1 px-2 text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                  >
                    <option value="all">All Non-Book Classifications</option>
                    <option value="notebook">Notebooks</option>
                    <option value="register">Registers</option>
                    <option value="stationery">Stationery & Writing</option>
                    <option value="general">General Items</option>
                  </select>
                </div>

                {/* 2. Category */}
                <div>
                  <label className="block text-[10px] font-bold text-amber-950 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-amber-700 text-white flex items-center justify-center text-[8px] font-black">2</span>
                    <span>Category</span>
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg py-1 px-2 text-slate-800 focus:outline-none focus:border-[#F5B51B]"
                  >
                    <option value="all">All Categories</option>
                    {CORE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Search Results Display Drawer (High-Capacity Matching Products) */}
          {!isResultsCollapsed && (
            <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs">
              <div className="bg-slate-100/80 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#071F49]">
                    Matching Products ({matchingProducts.length})
                  </span>
                  {matchingProducts.length > 0 && (
                    <span className="text-[10px] bg-blue-100 text-[#071F49] px-2 py-0.5 rounded-full font-bold">
                      {matchingProducts.length} Found
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <span className="text-[11px] text-slate-500 hidden lg:inline">
                    Click "+ Add to Invoice" or select duplicate to increment quantity
                  </span>

                  {matchingProducts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        matchingProducts.forEach((p) => handleSelectProduct(p));
                      }}
                      className="text-[11px] font-bold text-[#071F49] bg-[#F5B51B] hover:bg-[#F8CE4E] px-2.5 py-1 rounded-md transition shadow-xs cursor-pointer flex items-center gap-1 active:scale-95"
                      title="Add all matching products to current invoice"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add All ({matchingProducts.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsExpandedHeight(!isExpandedHeight)}
                    className="text-[11px] font-semibold text-slate-700 hover:text-[#071F49] bg-white border border-slate-300 hover:border-slate-400 px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                    title={isExpandedHeight ? "Switch to standard height" : "Expand to view more products"}
                  >
                    {isExpandedHeight ? (
                      <>
                        <Minimize2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Standard Height</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3.5 h-3.5 text-[#071F49]" />
                        <span>Expand View</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div
                className={`${
                  isExpandedHeight
                    ? 'max-h-[620px]'
                    : 'max-h-[420px] sm:max-h-[480px]'
                } min-h-[220px] overflow-y-auto divide-y divide-slate-100 transition-all duration-200`}
              >
                {matchingProducts.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No products match the search query and filter criteria.
                  </div>
                ) : (
                  matchingProducts.map((p) => {
                    const existingItem = items.find((i) => i.productId === p.id);
                    const isAlreadyAdded = Boolean(existingItem);
                    const existingQty = existingItem?.quantity || 0;

                    return (
                      <div
                        key={p.id}
                        className="px-3.5 py-2 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-blue-50/40 transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                              {p.title}
                            </span>
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold border border-slate-200">
                              {p.sku}
                            </span>
                            {p.barcode && (
                              <span className="font-mono text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.2 rounded border border-slate-200">
                                {p.barcode}
                              </span>
                            )}
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-medium border border-indigo-100">
                              {p.categoryName || 'General'}
                            </span>
                            <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded font-medium border border-amber-100 uppercase">
                              {p.classification}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                            {p.authorOrPublisher && (
                              <span className="text-slate-600 font-medium italic">
                                Publisher / Author: {p.authorOrPublisher}
                              </span>
                            )}
                            {p.authorOrPublisher && <span>•</span>}
                            <span>
                              Current Stock:{' '}
                              <strong
                                className={
                                  p.currentStock <= p.lowStockThreshold
                                    ? 'text-amber-600 font-bold'
                                    : 'text-emerald-700 font-bold'
                                }
                              >
                                {p.currentStock} {p.unit || 'units'}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              Cost Rate: <strong className="font-mono text-slate-800">{formatCurrency(p.costPrice || 0)}</strong>
                            </span>
                            {p.classification === 'book' && p.mrp ? (
                              <>
                                <span>•</span>
                                <span>MRP: <strong className="font-mono text-slate-700">{formatCurrency(p.mrp)}</strong></span>
                                {typeof p.publisherDiscountPercent === 'number' && (
                                  <>
                                    <span>•</span>
                                    <span>Disc: <strong className="text-amber-700 font-bold">{p.publisherDiscountPercent}%</strong></span>
                                  </>
                                )}
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isAlreadyAdded ? (
                            <button
                              type="button"
                              onClick={() => handleSelectProduct(p)}
                              className="flex items-center gap-1 text-xs font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded-lg px-3 py-1.5 transition cursor-pointer shadow-xs active:scale-95"
                              title="Click to increase quantity in this invoice"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>In Invoice (Qty: {existingQty}) +1</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectProduct(p)}
                              className="flex items-center gap-1.5 text-xs font-bold bg-[#071F49] text-white hover:bg-[#0A255B] rounded-lg px-3 py-1.5 transition cursor-pointer shadow-xs active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5 text-[#F5B51B]" />
                              <span>+ Add to Invoice</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Temporary Feedback Notification */}
        {feedbackMsg && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between transition-all">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="text-emerald-600 hover:text-emerald-800 text-sm leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Purchased Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#071F49]" />
              Purchased Items & Inventory Inflow ({items.length})
            </h4>
            {items.length > 0 && (
              <span className="text-xs font-semibold text-slate-500">
                Total Inflow:{' '}
                <span className="font-mono font-bold text-slate-800">
                  {items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)} units
                </span>
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/70 uppercase font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3 py-2.5 min-w-[200px]">Product / Book Title</th>
                  <th className="px-3 py-2.5 w-24 text-center">Quantity</th>
                  <th className="px-3 py-2.5 w-28 text-right">MRP (PKR)</th>
                  <th className="px-3 py-2.5 w-24 text-center">Pub Disc %</th>
                  <th className="px-3 py-2.5 w-28 text-right">Unit Cost (PKR)</th>
                  <th className="px-3 py-2.5 w-32 text-right">Total (PKR)</th>
                  <th className="px-3 py-2.5 w-12 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-5 px-4">
                      <div className="max-w-xs mx-auto text-center space-y-1">
                        <Package className="w-5 h-5 text-slate-300 mx-auto" />
                        <p className="text-xs font-semibold text-slate-600">
                          No products added to this invoice yet
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Click "+ Add to Invoice" in the Matching Products list above.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((row, idx) => (
                    <tr key={row.productId || idx} className="hover:bg-slate-50/60 transition">
                      <td className="px-2.5 py-1.5 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <div className="font-semibold text-slate-900 text-xs truncate max-w-[240px]">
                          {row.productName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {row.sku && (
                            <span className="font-mono text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded border border-slate-200 font-bold">
                              {row.sku}
                            </span>
                          )}
                          {row.categoryName && (
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1 py-0.2 rounded border border-indigo-100 font-medium">
                              {row.categoryName}
                            </span>
                          )}
                          {row.classification && (
                            <span className="text-[9px] bg-amber-50 text-amber-800 px-1 py-0.2 rounded border border-amber-100 uppercase">
                              {row.classification}
                            </span>
                          )}
                          {row.authorOrPublisher && (
                            <span className="text-[9px] text-slate-500 italic">
                              ({row.authorOrPublisher})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="w-full text-xs font-mono text-center border border-slate-300 rounded-lg py-1 px-1 text-slate-900 focus:outline-none focus:border-[#F5B51B] focus:ring-1 focus:ring-[#F5B51B]"
                          value={row.quantity}
                          onChange={(e) =>
                            handleRowChange(
                              idx,
                              'quantity',
                              e.target.value === '' ? '' : parseInt(e.target.value, 10)
                            )
                          }
                          required
                          aria-label={`Quantity for ${row.productName}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="w-full text-xs font-mono text-right border border-slate-300 rounded-lg py-1 px-1.5 text-slate-900 focus:outline-none focus:border-[#F5B51B] focus:ring-1 focus:ring-[#F5B51B]"
                          value={row.mrp}
                          onChange={(e) =>
                            handleRowChange(
                              idx,
                              'mrp',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )
                          }
                          placeholder="MRP"
                          aria-label={`MRP for ${row.productName}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          className="w-full text-xs font-mono text-center border border-amber-300 rounded-lg py-1 px-1 text-amber-900 bg-amber-50/50 font-bold focus:outline-none focus:border-[#F5B51B] focus:ring-1 focus:ring-[#F5B51B]"
                          value={row.publisherDiscountPercent}
                          onChange={(e) =>
                            handleRowChange(
                              idx,
                              'publisherDiscountPercent',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )
                          }
                          placeholder="Disc %"
                          aria-label={`Publisher discount for ${row.productName}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="w-full text-xs font-mono text-right border border-slate-300 rounded-lg py-1 px-1.5 text-slate-900 focus:outline-none focus:border-[#F5B51B] focus:ring-1 focus:ring-[#F5B51B]"
                          value={row.unitCost}
                          onChange={(e) =>
                            handleRowChange(
                              idx,
                              'unitCost',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )
                          }
                          required
                          aria-label={`Purchase rate for ${row.productName}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="w-full text-xs font-mono font-bold text-right border border-slate-300 rounded-lg py-1 px-1.5 text-slate-900 focus:outline-none focus:border-[#F5B51B] focus:ring-1 focus:ring-[#F5B51B]"
                          value={row.totalCost}
                          onChange={(e) =>
                            handleRowChange(
                              idx,
                              'totalCost',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )
                          }
                          required
                          aria-label={`Total amount for ${row.productName}`}
                        />
                        <div className="text-[10px] text-right text-slate-400 font-mono mt-0.5">
                          {formatCurrency(row.totalCost)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition"
                          title="Remove item"
                          aria-label={`Remove ${row.productName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Settlement & Payment Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-[#071F49]" />
              Payment Mode & Khata
            </h4>

            <Select
              label="Payment Method *"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              options={[
                { value: 'cash', label: 'Cash Tender (Paid in Full)' },
                { value: 'bank_transfer', label: 'Bank Transfer / Cheque' },
                { value: 'credit', label: 'Supplier Credit (Added to Supplier Balance)' },
              ]}
            />

            <Input
              label="Amount Paid Now (PKR)"
              type="number"
              min="0"
              step="any"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
            />

            <Input
              label="Shipment & Intake Remarks"
              placeholder="e.g. Delivered via Bilal Goods Transport / Bilty # 8812"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="p-3 bg-[#071F49] text-white rounded-xl space-y-2 flex flex-col justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#F5B51B]">
              Invoice Summary
            </h4>

            <div className="space-y-2 text-xs divide-y divide-white/10">
              <div className="flex justify-between py-1 text-slate-300">
                <span>Gross Items Subtotal:</span>
                <span className="font-mono text-sm font-semibold text-white">
                  {formatCurrency(subtotal)}
                </span>
              </div>

              <div className="flex justify-between py-1 text-slate-300 items-center">
                <span>Trade Discount Received:</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-28 text-right bg-white/10 text-white rounded p-1 font-mono text-xs border border-white/20 focus:border-[#F5B51B] focus:outline-none"
                  value={discountAmount}
                  onChange={(e) =>
                    setDiscountAmount(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="flex justify-between py-1.5 font-bold text-base text-white">
                <span className="text-[#F5B51B]">Grand Total Payable:</span>
                <span className="font-mono text-lg text-[#F5B51B]">
                  {formatCurrency(grandTotal)}
                </span>
              </div>

              <div className="flex justify-between py-1 text-slate-300">
                <span>Amount Paid:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  -{formatCurrency(numPaid)}
                </span>
              </div>

              <div className="flex justify-between py-1.5 font-bold text-sm">
                <span className="text-rose-300">Remaining Balance (Payable):</span>
                <span className="font-mono text-rose-300">{formatCurrency(remainingBalance)}</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              * On submission, inventory stock quantities will automatically increment and immutable stock movement audit logs will be saved.
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
};
