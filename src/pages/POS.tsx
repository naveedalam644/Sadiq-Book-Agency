import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  AlertTriangle,
  UserCheck,
  Store,
  Users,
  CreditCard,
  Banknote,
  RotateCcw,
  ShieldCheck,
  Lock,
  ArrowRight,
  History,
  Calendar,
  BookOpen,
  Layers,
  GraduationCap,
} from 'lucide-react';
import { WhatsAppIcon } from '../components/common/WhatsAppIcon';
import { useAuth } from '../hooks/useAuth';
import { usePOSCart } from '../hooks/usePOSCart';
import {
  searchProductsByName,
  searchProductBySku,
  getProductsByHierarchy,
  getProductsByNotebookFilter,
  debounceSearch,
  type ProductSearchResult,
} from '../services/productSearchService';
import { getActivePublishers } from '../services/publisherService';
import { getActiveSeriesByPublisher } from '../services/seriesService';
import { getCustomerDiscountsPaginated } from '../services/discountService';
import { processSaleTransaction, calculateInvoiceDueDate } from '../services/saleService';
import { CustomerSelectModal } from '../components/pos/CustomerSelectModal';
import { A4InvoiceModal } from '../components/pos/A4InvoiceModal';
import { AdminOverrideModal } from '../components/pos/AdminOverrideModal';
import { ProductHistoryModal } from '../components/inventory/ProductHistoryModal';
import { SchoolSyllabusSetModal } from '../components/pos/SchoolSyllabusSetModal';
import type {
  CustomerDocument,
  CustomerType,
  AdminCreditOverride,
  SaleDocument,
  ProductDocument,
  PublisherDocument,
  SeriesDocument,
} from '../types/database';

const COMMON_SHEET_PRESETS = ['40', '60', '80', '100', '120', '160', '200', '240', '300'];
const COMMON_SIZE_PRESETS = ['A4', 'A5', 'Foolscap', 'Large', 'Small', 'Executive', 'B5'];

export const POS: React.FC = () => {
  const { currentUser } = useAuth();
  const terminalId = 'T1';

  // 1. Core POS Cart Hook
  const {
    session,
    customerType,
    customer,
    items,
    subtotal,
    totalDiscount,
    grandTotal,
    totalItemCount,
    cartError,
    lockStatus,
    isReadOnly,
    canCheckout,
    addProduct,
    addSyllabusSet,
    updateQuantity,
    updateItemDiscount,
    removeItem,
    clearCart,
    setCustomer,
    setCustomDiscounts,
    claimTerminalOwnership,
    confirmCheckoutSuccess,
    prepareSalePayload,
    withSubmissionGuard,
  } = usePOSCart({ terminalId });

  // 1b. School Syllabus Modal State
  const [isSyllabusModalOpen, setIsSyllabusModalOpen] = useState(false);

  // 2. Search & Filter Category States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'book' | 'notebook_register' | 'all'>('book');

  // Book hierarchy filters
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all');
  const [selectedSeries, setSelectedSeries] = useState<string>('all');
  const [publishersList, setPublishersList] = useState<PublisherDocument[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);

  // Notebook & Register filters: Classification, Sheet Count, Size
  const [selectedNbClassification, setSelectedNbClassification] = useState<'all' | 'notebook' | 'register'>('all');
  const [selectedSheetCount, setSelectedSheetCount] = useState<string>('all');
  const [selectedNbSize, setSelectedNbSize] = useState<string>('all');

  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<any>(null);

  const filterCategoryRef = useRef(filterCategory);
  filterCategoryRef.current = filterCategory;
  const selectedPublisherRef = useRef(selectedPublisher);
  selectedPublisherRef.current = selectedPublisher;
  const selectedSeriesRef = useRef(selectedSeries);
  selectedSeriesRef.current = selectedSeries;
  const selectedNbClassificationRef = useRef(selectedNbClassification);
  selectedNbClassificationRef.current = selectedNbClassification;
  const selectedSheetCountRef = useRef(selectedSheetCount);
  selectedSheetCountRef.current = selectedSheetCount;
  const selectedNbSizeRef = useRef(selectedNbSize);
  selectedNbSizeRef.current = selectedNbSize;

  // 3. Payment States
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // 4. Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleDocument | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductDocument | null>(null);
  const [pendingOverride, setPendingOverride] = useState<{
    exceededAmount: number;
    attemptedAddition: number;
  } | null>(null);
  const [activeAdminOverride, setActiveAdminOverride] = useState<AdminCreditOverride | undefined>(undefined);
  const [customDueDate, setCustomDueDate] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  const customerCreditDays = customer?.creditDays;
  const projectedDueDate = useMemo(() => {
    if (!customerCreditDays || customerCreditDays <= 0) return null;
    const today = new Date().toISOString().split('T')[0];
    return calculateInvoiceDueDate(today, customerCreditDays);
  }, [customerCreditDays]);

  useEffect(() => {
    if (customer?.creditDays && customer.creditDays > 0) {
      const today = new Date().toISOString().split('T')[0];
      setCustomDueDate(calculateInvoiceDueDate(today, customer.creditDays) || '');
    } else {
      setCustomDueDate('');
    }
  }, [customer?.id, customer?.creditDays]);

  // Load active publishers on mount
  useEffect(() => {
    getActivePublishers()
      .then(setPublishersList)
      .catch((err) => console.warn('Failed to load publishers in POS:', err));
  }, []);

  // Preload syllabus set if redirected from Syllabus page
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('sba_preload_syllabus_set');
      if (stored) {
        sessionStorage.removeItem('sba_preload_syllabus_set');
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          const itemsToAdd = parsed.items.map((item: any) => ({
            product: {
              id: item.productId,
              title: item.title,
              sku: item.sku,
              publisherName: item.publisherName || 'Unknown',
              costPrice: item.costPrice || 0,
              retailPrice: item.retailPrice || 0,
              wholesalePrice: item.retailPrice || 0,
              currentStock: 9999,
              lowStockThreshold: 0,
              unit: 'piece',
              isActive: true,
              createdAt: '',
              updatedAt: '',
            } as ProductDocument,
            quantity: item.quantity || 1,
          }));
          addSyllabusSet(itemsToAdd);
        }
      }
    } catch (err) {
      console.warn('Failed to preload syllabus set in POS:', err);
    }
  }, [addSyllabusSet]);

  // Preload rough bill items if redirected from Rough Bill page ("Convert to POS Bill")
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('sba_preload_rough_bill');
      if (stored) {
        sessionStorage.removeItem('sba_preload_rough_bill');
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          const itemsToAdd = parsed.items.map((item: any, idx: number) => ({
            product: {
              id: item.productId || `manual_rb_${Date.now()}_${idx}`,
              title: item.title,
              sku: item.sku || 'N/A',
              publisherName: item.publisherName || 'General',
              costPrice: 0,
              retailPrice: item.rate || 0,
              wholesalePrice: item.rate || 0,
              currentStock: 9999,
              lowStockThreshold: 0,
              unit: 'piece',
              isActive: true,
              createdAt: '',
              updatedAt: '',
            } as ProductDocument,
            quantity: item.quantity || 1,
          }));
          addSyllabusSet(itemsToAdd);
        }
      }
    } catch (err) {
      console.warn('Failed to preload rough bill in POS:', err);
    }
  }, [addSyllabusSet]);

  const handleLoadSyllabusItems = (courseItems: Array<{ product: ProductDocument; quantity: number }>) => {
    const res = addSyllabusSet(courseItems);
    if (!res.success && res.errors.length > 0) {
      setSubmissionError(res.errors.join(', '));
    } else {
      setSubmissionError(null);
    }
  };

  // ---------------------------------------------------------------------------------
  // SEARCH & HIERARCHY EXECUTION
  // ---------------------------------------------------------------------------------
  const executeSearch = useCallback(
    async (
      text: string,
      overrideCategory = filterCategoryRef.current,
      pubId = selectedPublisherRef.current,
      serId = selectedSeriesRef.current,
      nbClass = selectedNbClassificationRef.current,
      nbSheets = selectedSheetCountRef.current,
      nbSize = selectedNbSizeRef.current
    ) => {
      const clean = text.trim();
      const hasPub = pubId && pubId !== 'all';
      const hasSer = serId && serId !== 'all';

      // 1. Browsing with empty search text (< 2 characters)
      if (!clean || clean.length < 2) {
        if (overrideCategory === 'book') {
          if (hasPub || hasSer) {
            setIsSearching(true);
            try {
              const res = await getProductsByHierarchy(
                hasPub ? pubId : undefined,
                hasSer ? serId : undefined
              );
              setSearchResults(res.products);
              setHasMore(res.hasMore);
              setNextCursor(res.nextCursor);
            } catch (err) {
              console.error('Hierarchy load error:', err);
            } finally {
              setIsSearching(false);
            }
            return;
          }
        } else if (overrideCategory === 'notebook_register') {
          // Bounded browse for notebooks & registers by classification, sheets, and size
          setIsSearching(true);
          try {
            const res = await getProductsByNotebookFilter({
              classification: nbClass,
              sheetCount: nbSheets,
              size: nbSize,
            });
            setSearchResults(res.products);
            setHasMore(res.hasMore);
            setNextCursor(res.nextCursor);
          } catch (err) {
            console.error('Notebook filter load error:', err);
          } finally {
            setIsSearching(false);
          }
          return;
        }

        setSearchResults([]);
        setHasMore(false);
        setNextCursor(null);
        setIsSearching(false);
        return;
      }

      // 2. Query text entered (>= 2 characters)
      setIsSearching(true);
      try {
        // 2a. Check if exact SKU matches first (e.g. BK-SIN-001 or NB-A4-100)
        if (clean.includes('-') || clean.toUpperCase() === clean) {
          const exact = await searchProductBySku(clean);
          if (exact) {
            let matches = true;
            if (overrideCategory === 'book') {
              if (hasPub && exact.publisherId !== pubId) matches = false;
              if (hasSer && exact.seriesId !== serId) matches = false;
            } else if (overrideCategory === 'notebook_register') {
              if (nbClass !== 'all' && exact.classification !== nbClass) matches = false;
              if (nbSheets !== 'all' && exact.notebookSheets !== nbSheets) matches = false;
              if (nbSize !== 'all' && exact.notebookSize?.toLowerCase() !== nbSize.toLowerCase()) matches = false;
            }

            if (matches) {
              setSearchResults([exact]);
              setHasMore(false);
              setNextCursor(null);
              setIsSearching(false);
              return;
            }
          }
        }

        // 2b. Product Name Prefix Search
        const res = await searchProductsByName(clean);
        let filtered = res.products;

        if (overrideCategory === 'book') {
          if (hasPub) {
            filtered = filtered.filter((p) => p.publisherId === pubId);
          }
          if (hasSer) {
            filtered = filtered.filter((p) => p.seriesId === serId);
          }
        } else if (overrideCategory === 'notebook_register') {
          if (nbClass !== 'all') {
            filtered = filtered.filter((p) => p.classification === nbClass);
          } else {
            filtered = filtered.filter(
              (p) => p.classification === 'notebook' || p.classification === 'register' || p.notebookSheets
            );
          }

          if (nbSheets !== 'all') {
            filtered = filtered.filter(
              (p) =>
                p.notebookSheets === nbSheets ||
                p.notebookSheets?.trim().toLowerCase() === nbSheets.toLowerCase()
            );
          }

          if (nbSize !== 'all') {
            filtered = filtered.filter(
              (p) => p.notebookSize?.trim().toLowerCase() === nbSize.trim().toLowerCase()
            );
          }
        }

        setSearchResults(filtered);
        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  const debouncedSearchRef = useRef(debounceSearch(executeSearch, 300));

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    debouncedSearchRef.current(val);
  };

  const handleFilterCategoryChange = (cat: 'book' | 'notebook_register' | 'all') => {
    setFilterCategory(cat);
    filterCategoryRef.current = cat;
    executeSearch(
      searchTerm,
      cat,
      selectedPublisherRef.current,
      selectedSeriesRef.current,
      selectedNbClassificationRef.current,
      selectedSheetCountRef.current,
      selectedNbSizeRef.current
    );
  };

  const handlePublisherFilterChange = async (pubId: string) => {
    setSelectedPublisher(pubId);
    selectedPublisherRef.current = pubId;
    setSelectedSeries('all'); // Clear series filter immediately
    selectedSeriesRef.current = 'all';

    if (pubId && pubId !== 'all') {
      try {
        const series = await getActiveSeriesByPublisher(pubId);
        setSeriesList(series);
      } catch (err) {
        console.warn('Failed to load series for publisher:', err);
        setSeriesList([]);
      }
    } else {
      setSeriesList([]);
    }
    executeSearch(
      searchTerm,
      'book',
      pubId,
      'all',
      selectedNbClassificationRef.current,
      selectedSheetCountRef.current,
      selectedNbSizeRef.current
    );
  };

  const handleSeriesFilterChange = (serId: string) => {
    setSelectedSeries(serId);
    selectedSeriesRef.current = serId;
    executeSearch(
      searchTerm,
      'book',
      selectedPublisherRef.current,
      serId,
      selectedNbClassificationRef.current,
      selectedSheetCountRef.current,
      selectedNbSizeRef.current
    );
  };

  const handleNbClassificationChange = (cls: 'all' | 'notebook' | 'register') => {
    setSelectedNbClassification(cls);
    selectedNbClassificationRef.current = cls;
    executeSearch(
      searchTerm,
      'notebook_register',
      selectedPublisherRef.current,
      selectedSeriesRef.current,
      cls,
      selectedSheetCountRef.current,
      selectedNbSizeRef.current
    );
  };

  const handleSheetCountFilterChange = (sheetCount: string) => {
    setSelectedSheetCount(sheetCount);
    selectedSheetCountRef.current = sheetCount;
    executeSearch(
      searchTerm,
      'notebook_register',
      selectedPublisherRef.current,
      selectedSeriesRef.current,
      selectedNbClassificationRef.current,
      sheetCount,
      selectedNbSizeRef.current
    );
  };

  const handleNbSizeFilterChange = (size: string) => {
    setSelectedNbSize(size);
    selectedNbSizeRef.current = size;
    executeSearch(
      searchTerm,
      'notebook_register',
      selectedPublisherRef.current,
      selectedSeriesRef.current,
      selectedNbClassificationRef.current,
      selectedSheetCountRef.current,
      size
    );
  };

  const handleLoadMore = async () => {
    if (!nextCursor || isSearching) return;
    setIsSearching(true);
    try {
      const pubId = selectedPublisherRef.current;
      const serId = selectedSeriesRef.current;
      const hasPub = pubId && pubId !== 'all';
      const hasSer = serId && serId !== 'all';
      const currentCat = filterCategoryRef.current;
      const nbClass = selectedNbClassificationRef.current;
      const nbSheets = selectedSheetCountRef.current;
      const nbSize = selectedNbSizeRef.current;

      if (searchTerm.trim().length >= 2) {
        const res = await searchProductsByName(searchTerm.trim(), nextCursor);
        let filtered = res.products;
        if (currentCat === 'book') {
          if (hasPub) filtered = filtered.filter((p) => p.publisherId === pubId);
          if (hasSer) filtered = filtered.filter((p) => p.seriesId === serId);
        } else if (currentCat === 'notebook_register') {
          if (nbClass !== 'all') filtered = filtered.filter((p) => p.classification === nbClass);
          if (nbSheets !== 'all') filtered = filtered.filter((p) => p.notebookSheets === nbSheets);
          if (nbSize !== 'all') filtered = filtered.filter((p) => p.notebookSize?.toLowerCase() === nbSize.toLowerCase());
        }
        setSearchResults((prev) => [...prev, ...filtered]);
        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor);
      } else if (currentCat === 'book' && (hasPub || hasSer)) {
        const res = await getProductsByHierarchy(
          hasPub ? pubId : undefined,
          hasSer ? serId : undefined,
          nextCursor
        );
        setSearchResults((prev) => [...prev, ...res.products]);
        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor);
      } else if (currentCat === 'notebook_register') {
        const res = await getProductsByNotebookFilter(
          {
            classification: nbClass,
            sheetCount: nbSheets,
            size: nbSize,
          },
          nextCursor
        );
        setSearchResults((prev) => [...prev, ...res.products]);
        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor);
      }
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // ---------------------------------------------------------------------------------
  // CUSTOMER SELECTION & DISCOUNT SYNC
  // ---------------------------------------------------------------------------------
  const handleCustomerSelected = async (newCustomer: CustomerDocument | null, type: CustomerType) => {
    setCustomer(newCustomer, type);
    setActiveAdminOverride(undefined);

    if (newCustomer) {
      try {
        const discountsRes = await getCustomerDiscountsPaginated(newCustomer.id, null, 100);
        setCustomDiscounts(discountsRes.discounts);
      } catch (err) {
        console.warn('Failed to load custom discounts:', err);
      }
    } else {
      setCustomDiscounts([]);
    }
  };

  // ---------------------------------------------------------------------------------
  // PAYMENT CALCULATION
  // ---------------------------------------------------------------------------------
  const numericTendered = Math.max(0, Number(cashTendered) || 0);

  // Set default tendered to exact grandTotal when grandTotal changes (for cash mode)
  useEffect(() => {
    if (paymentMethod === 'cash' && grandTotal > 0 && !cashTendered) {
      setCashTendered(String(grandTotal));
    }
  }, [grandTotal, paymentMethod, cashTendered]);

  const changeReturned = paymentMethod === 'cash' ? Math.max(0, numericTendered - grandTotal) : 0;
  const balanceAddedToCredit =
    customerType !== 'parchon' && paymentMethod === 'credit'
      ? grandTotal
      : customerType !== 'parchon' && numericTendered < grandTotal
      ? grandTotal - numericTendered
      : 0;

  // ---------------------------------------------------------------------------------
  // CHECKOUT SUBMISSION
  // ---------------------------------------------------------------------------------
  const handleCheckout = async (overrideToUse = activeAdminOverride) => {
    setSubmissionError(null);

    if (items.length === 0) {
      setSubmissionError('Cart is empty.');
      return;
    }

    if (isReadOnly) {
      setSubmissionError('Register is in read-only mode. Claim terminal ownership first.');
      return;
    }

    // Check Credit Limit before submitting
    if (customer && customerType !== 'parchon' && balanceAddedToCredit > 0 && !overrideToUse) {
      const currentDebt = customer.currentBalance || 0;
      const creditLimit = customer.creditLimit || 0;
      const projectedBalance = currentDebt + balanceAddedToCredit;

      if (projectedBalance > creditLimit) {
        // Trigger Admin Override Flow
        setPendingOverride({
          attemptedAddition: balanceAddedToCredit,
          exceededAmount: projectedBalance - creditLimit,
        });
        return;
      }
    }

    // Require due date if adding to credit
    const isCredit = balanceAddedToCredit > 0 || paymentMethod === 'credit';
    if (isCredit && customerType !== 'parchon') {
      if (!customDueDate || !customDueDate.trim()) {
        setSubmissionError(
          customer?.creditDays
            ? 'A valid payment due date is required for this credit sale.'
            : 'This customer has no credit terms configured on their profile. Please select an approved payment due date before completing the credit sale.'
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = prepareSalePayload(numericTendered, paymentMethod, customDueDate);
      if (overrideToUse) {
        payload.creditLimitOverride = overrideToUse;
      }

      await withSubmissionGuard(async () => {
        const operatorEmail = currentUser?.email || 'cashier@sadiqbookagency.com';
        const operatorId = currentUser?.uid || 'system_cashier';
        const operatorName = currentUser?.displayName || 'Cashier';

        const result = await processSaleTransaction(payload, operatorId, operatorName, operatorEmail);

        // Success!
        setCompletedSale(result.sale);
        setIsReceiptModalOpen(true);
        confirmCheckoutSuccess();
        setCashTendered('');
        setActiveAdminOverride(undefined);
      });
    } catch (err: any) {
      console.error('Checkout failed:', err);
      setSubmissionError(err.message || 'Transaction failed. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] bg-slate-100 overflow-hidden font-sans">
      {/* Top Banner: Terminal ID, Cashier Info, Web Locks Status */}
      <div className="bg-[#071F49] text-white px-4 py-2 flex flex-wrap items-center justify-between border-b border-[#0E2E70] shrink-0 text-xs shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F5B51B] animate-pulse" />
            <span>TERMINAL: {terminalId}</span>
          </div>
          <span className="text-slate-400">|</span>
          <div className="text-slate-300">
            Session: <span className="font-mono text-slate-100">{session.checkoutSessionId}</span>
          </div>
          {completedSale && (
            <>
              <span className="text-slate-400">|</span>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] shadow-sm transition-all active:scale-95 cursor-pointer"
                title="Reopen last bill to Print or Share on WhatsApp"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
                <span>Last Bill: {completedSale.invoiceNo}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Multi-Tab Lock Status Badge */}
          {lockStatus === 'owner' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Register Active (Owner)</span>
            </div>
          ) : lockStatus === 'pending' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold text-[11px]">
              <Lock className="w-3.5 h-3.5 animate-spin" />
              <span>Acquiring Lock...</span>
            </div>
          ) : lockStatus === 'spectator' ? (
            <div className="flex items-center gap-2">
              <span className="text-amber-300 font-medium text-xs">Read-Only Spectator</span>
              <button
                type="button"
                onClick={claimTerminalOwnership}
                className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1"
                title="Click to take active control of this terminal and enable the cart"
              >
                <span>Claim Register</span>
              </button>
            </div>
          ) : (
            <div className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 font-semibold text-[11px]">
              Lock Unsupported (Fail-Closed)
            </div>
          )}

          <span className="text-slate-400">|</span>
          <div className="text-slate-200">
            Operator: <span className="font-semibold text-white">{currentUser?.displayName || currentUser?.email || 'Cashier'}</span>
          </div>
        </div>
      </div>

      {/* Mobile Responsive Switcher (< lg breakpoint) */}
      <div className="lg:hidden flex bg-[#071F49] p-1.5 border-b border-[#F5B51B]/40 shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === 'catalog'
              ? 'bg-[#F5B51B] text-[#071F49] shadow-md'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Catalog ({searchResults.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === 'cart'
              ? 'bg-[#F5B51B] text-[#071F49] shadow-md'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>
            Cart ({items.length}) • PKR {grandTotal.toLocaleString()}
          </span>
        </button>
      </div>

      {/* Main 2-Column Register Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Product Search & Search Results */}
        <div className={`flex-1 flex flex-col p-3 sm:p-4 overflow-hidden border-r border-slate-200 bg-white ${mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'}`}>
          {/* Search Header */}
          <div className="space-y-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  placeholder="Search products by exact SKU (e.g. BK-SIN-001) or title prefix..."
                  className="w-full pl-11 pr-4 py-2.5 text-sm font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none shadow-sm"
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute right-3.5 top-3 text-xs text-slate-400 animate-pulse font-semibold">
                    Searching...
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsSyllabusModalOpen(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-[#071F49] hover:bg-[#0c2f6d] text-[#F5B51B] hover:text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer border border-[#F5B51B]/40"
                title="Load school course book set by Board > School > Class"
              >
                <GraduationCap className="w-4 h-4 text-[#F5B51B]" />
                <span className="hidden sm:inline">School Course Set</span>
                <span className="sm:hidden">Syllabus</span>
              </button>
            </div>

            {/* 1. Category Switcher Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleFilterCategoryChange('book')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  filterCategory === 'book'
                    ? 'bg-[#071F49] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-[#F5B51B]" />
                <span>Books (Publisher & Series)</span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterCategoryChange('notebook_register')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  filterCategory === 'notebook_register'
                    ? 'bg-[#071F49] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-[#F5B51B]" />
                <span>Notebooks & Registers (Sheets)</span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterCategoryChange('all')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  filterCategory === 'all'
                    ? 'bg-[#071F49] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <span>All</span>
              </button>
            </div>

            {/* 2. Sub-Filters based on Active Category */}
            {filterCategory === 'book' ? (
              /* Books: Publisher -> Series Dropdowns */
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col">
                  <select
                    value={selectedPublisher}
                    onChange={(e) => handlePublisherFilterChange(e.target.value)}
                    className="w-full text-xs font-semibold border border-slate-300 rounded-xl px-2.5 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#071F49] focus:bg-white transition"
                  >
                    <option value="all">All Publishers</option>
                    {publishersList.map((pub) => (
                      <option key={pub.id} value={pub.id}>
                        {pub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <select
                    value={selectedSeries}
                    disabled={selectedPublisher === 'all'}
                    onChange={(e) => handleSeriesFilterChange(e.target.value)}
                    className="w-full text-xs font-semibold border border-slate-300 rounded-xl px-2.5 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#071F49] focus:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="all">
                      {selectedPublisher === 'all' ? 'Select Publisher first' : 'All Series'}
                    </option>
                    {seriesList.map((ser) => (
                      <option key={ser.id} value={ser.id}>
                        {ser.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : filterCategory === 'notebook_register' ? (
              /* Notebooks & Registers: Item Type, Sheet Count, Size */
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {/* Classification Filter */}
                  <select
                    value={selectedNbClassification}
                    onChange={(e) => handleNbClassificationChange(e.target.value as any)}
                    className="w-full text-xs font-semibold border border-slate-300 rounded-xl px-2 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#071F49] focus:bg-white transition"
                  >
                    <option value="all">All (Notebook & Register)</option>
                    <option value="notebook">Notebooks Only</option>
                    <option value="register">Registers Only</option>
                  </select>

                  {/* Sheet Count Filter */}
                  <select
                    value={selectedSheetCount}
                    onChange={(e) => handleSheetCountFilterChange(e.target.value)}
                    className="w-full text-xs font-bold border border-amber-300 rounded-xl px-2 py-2 bg-amber-50/70 text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#071F49] focus:bg-white transition"
                  >
                    <option value="all">All Sheet Counts</option>
                    {COMMON_SHEET_PRESETS.map((sh) => (
                      <option key={sh} value={sh}>
                        {sh} Sheets
                      </option>
                    ))}
                  </select>

                  {/* Size Filter */}
                  <select
                    value={selectedNbSize}
                    onChange={(e) => handleNbSizeFilterChange(e.target.value)}
                    className="w-full text-xs font-semibold border border-slate-300 rounded-xl px-2 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#071F49] focus:bg-white transition"
                  >
                    <option value="all">All Sizes</option>
                    {COMMON_SIZE_PRESETS.map((sz) => (
                      <option key={sz} value={sz}>
                        Size: {sz}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick One-Tap Sheet Count Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
                  <span className="text-[10px] font-bold uppercase text-slate-500 whitespace-nowrap mr-1">
                    Sheets:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSheetCountFilterChange('all')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                      selectedSheetCount === 'all'
                        ? 'bg-[#071F49] text-white shadow-2xs'
                        : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    All
                  </button>
                  {COMMON_SHEET_PRESETS.map((sh) => {
                    const isSelected = selectedSheetCount === sh;
                    return (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => handleSheetCountFilterChange(sh)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#F5B51B] text-[#071F49] shadow-2xs'
                            : 'bg-amber-100/70 text-amber-900 hover:bg-amber-200/80'
                        }`}
                      >
                        {sh} Sh
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {filterCategory === 'notebook_register'
                  ? selectedSheetCount !== 'all' || selectedNbSize !== 'all' || selectedNbClassification !== 'all'
                    ? `Filtered by Notebook/Register (${selectedSheetCount !== 'all' ? `${selectedSheetCount} Sheets` : 'All Sheets'})`
                    : 'Browsing all Notebooks & Registers'
                  : selectedPublisher !== 'all' || selectedSeries !== 'all'
                  ? 'Filtered by Publisher / Series'
                  : 'Type 2+ chars for search or select filter category'}
              </span>
              <span>Showing: {searchResults.length} results</span>
            </div>
          </div>

          {/* Search Results Catalog Grid */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400 space-y-2">
                <Search className="w-10 h-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  {searchTerm.trim().length >= 2
                    ? 'No products found matching search query.'
                    : 'Search for a book or item above to begin adding to cart.'}
                </p>
                <p className="text-xs text-slate-400">
                  Exact SKU queries and prefix name lookups execute with bounded Firestore reads.
                </p>
              </div>
            ) : (
              searchResults.map((product) => {
                const isOutOfStock = (product.currentStock || 0) <= 0;
                const inCart = items.find((i) => i.productId === product.id);

                return (
                  <div
                    key={product.id}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-1 max-w-[65%]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 leading-tight">
                          {product.title}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded">
                          {product.sku}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500">
                        {(product.classification === 'book' || product.publisherName) && (
                          <span>
                            Publisher: <span className="font-medium text-slate-800">{product.publisherName || 'Unknown'}</span>
                          </span>
                        )}
                        {product.seriesName && (
                          <>
                            <span>•</span>
                            <span>
                              Series: <span className="font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{product.seriesName}</span>
                            </span>
                          </>
                        )}
                        {(product.notebookSize || product.notebookSheets || product.notebookGrammage) && (
                          <span className="font-bold text-amber-900 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded text-[11px]">
                            {[
                              product.notebookSize,
                              product.notebookSheets ? `${product.notebookSheets} Sheets` : '',
                              product.notebookGrammage,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </span>
                        )}
                        <span>•</span>
                        <span>
                          Class: <span className="capitalize">{product.classification}</span>
                        </span>
                        <span>•</span>
                        <span
                          className={`font-semibold ${
                            isOutOfStock
                              ? 'text-red-600'
                              : (product.currentStock || 0) <= (product.lowStockThreshold || 5)
                              ? 'text-amber-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          Stock: {product.currentStock || 0} {product.unit || 'pcs'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="text-right">
                        <div className="text-sm font-black text-slate-900">
                          PKR {customerType === 'wholesaler' ? product.wholesalePrice : product.retailPrice}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {customerType === 'wholesaler' ? 'Wholesale Price' : 'Retail Price'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryProduct(product);
                        }}
                        title="View Product History"
                        className="p-2 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                      >
                        <History className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (isReadOnly) {
                            await claimTerminalOwnership();
                          }
                          addProduct(product, 1);
                        }}
                        disabled={isOutOfStock}
                        title={
                          isOutOfStock
                            ? 'Product is out of stock'
                            : isReadOnly
                            ? 'Terminal is in Spectator mode. Click to Claim Register and add to cart'
                            : inCart
                            ? `In cart: ${inCart.quantity}`
                            : 'Add product to cart'
                        }
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 ${
                          isOutOfStock
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : isReadOnly
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 cursor-pointer'
                            : 'bg-[#071F49] hover:bg-[#0d3477] text-white shadow-md cursor-pointer'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {isReadOnly
                            ? 'Claim & Add'
                            : inCart
                            ? `Add (${inCart.quantity})`
                            : 'Add'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {hasMore && (
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isSearching}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                {isSearching ? 'Loading...' : 'Load Next 15 Results'}
              </button>
            </div>
          )}

          {/* Mobile Quick Cart Floating Bar */}
          {mobileTab === 'catalog' && items.length > 0 && (
            <div className="lg:hidden p-3 bg-[#071F49] text-white flex items-center justify-between border-t-2 border-[#F5B51B] shadow-2xl shrink-0 mt-2 rounded-xl">
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-300 font-semibold">
                  {totalItemCount} Books in Cart
                </span>
                <span className="text-base font-black text-[#F5B51B]">
                  PKR {grandTotal.toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileTab('cart')}
                className="px-4 py-2 bg-[#F5B51B] hover:bg-amber-400 text-[#071F49] font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>View Cart & Pay &rarr;</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Active POS Cart, Customer Pricing Terms, and Checkout */}
        <div className={`w-full lg:w-[460px] bg-slate-50 flex flex-col h-full border-t lg:border-t-0 border-slate-200 shadow-lg ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
          {/* Mobile Back Button to Catalog */}
          <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-slate-200 border-b border-slate-300 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('catalog')}
              className="font-bold text-[#071F49] flex items-center gap-1 hover:underline cursor-pointer"
            >
              &larr; Back to Products Catalog
            </button>
            <span className="font-semibold text-slate-600">{items.length} items</span>
          </div>
          {/* Customer Selection Banner */}
          <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl ${
                  customerType === 'parchon'
                    ? 'bg-emerald-100 text-emerald-700'
                    : customerType === 'wholesaler'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {customerType === 'parchon' ? (
                  <UserCheck className="w-5 h-5" />
                ) : customerType === 'wholesaler' ? (
                  <Store className="w-5 h-5" />
                ) : (
                  <Users className="w-5 h-5" />
                )}
              </div>

              <div>
                <div className="text-xs font-bold text-slate-900 leading-tight">
                  {customer ? (customer.shopName || customer.name) : 'Parchon (Counter Cash)'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {customerType === 'parchon'
                    ? 'Standard Retail • 0% Discount'
                    : customer
                    ? `Balance: PKR ${(customer.currentBalance || 0).toLocaleString()}`
                    : 'Registered Wholesale / Marketshop'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              disabled={isReadOnly}
              className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Switch Terms
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            {cartError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{cartError}</span>
              </div>
            )}

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 space-y-2">
                <ShoppingCart className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Cart is empty</p>
                <p className="text-[11px] text-slate-400">Add products from catalog on the left</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.productId}
                  className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900 leading-snug">
                        {item.productName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Pub: {item.publisherName} • SKU: {item.sku}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      disabled={isReadOnly}
                      className="text-slate-400 hover:text-red-600 p-1 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    {/* Quantity controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        disabled={item.quantity <= 1 || isReadOnly}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition-colors disabled:opacity-40"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <input
                        type="number"
                        min="1"
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                        disabled={isReadOnly}
                        className="w-12 text-center font-bold text-xs border border-slate-300 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                      />

                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        disabled={item.quantity >= item.availableStock || isReadOnly}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition-colors disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Bill-Level Customer Line Discount Input */}
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-lg">
                      <span className="text-[10px] text-slate-600 font-semibold">Disc %:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={item.discountRate}
                        onChange={(e) => updateItemDiscount(item.productId, parseFloat(e.target.value) || 0)}
                        disabled={isReadOnly}
                        className="w-12 text-center font-bold text-xs border border-slate-300 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-[#071F49] bg-white"
                      />
                    </div>

                    {/* Pricing Breakdown */}
                    <div className="text-right">
                      <div className="font-black text-xs text-slate-900">
                        PKR {item.lineTotal.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        MRP: {item.unitPrice} • Final: @{item.effectivePrice}
                        {item.discountAmount > 0 && (
                          <span className="text-emerald-600 font-semibold ml-1">
                            (-PKR {(item.discountAmount * item.quantity).toFixed(2)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Bottom Financial Summary & Payment Box */}
          <div className="p-4 bg-white border-t border-slate-200 space-y-3 shrink-0 shadow-inner">
            {/* Subtotals */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Items ({totalItemCount}):</span>
                <span>PKR {subtotal.toFixed(2)}</span>
              </div>

              {totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Savings / Discount:</span>
                  <span>-PKR {totalDiscount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-1.5">
                <span>GRAND TOTAL:</span>
                <span className="text-[#071F49]">PKR {grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method Tabs */}
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  paymentMethod === 'cash' ? 'bg-[#071F49] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('bank_transfer')}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  paymentMethod === 'bank_transfer'
                    ? 'bg-[#071F49] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Bank</span>
              </button>

              {customerType !== 'parchon' && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('credit')}
                  className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === 'credit'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Khata Credit</span>
                </button>
              )}
            </div>

            {/* Cash Tendered & Change Returned (When Cash Mode) */}
            {paymentMethod === 'cash' && (
              <div className="space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">Cash Received:</span>
                  <input
                    type="number"
                    min="0"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder="0"
                    className="w-28 text-right font-black text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                  />
                </div>

                {/* Quick denomination chips */}
                <div className="flex gap-1.5 justify-end">
                  {[500, 1000, 5000].map((denom) => (
                    <button
                      key={denom}
                      type="button"
                      onClick={() => setCashTendered(String(denom))}
                      className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                    >
                      +{denom}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCashTendered(String(grandTotal))}
                    className="px-2 py-0.5 bg-[#F5B51B] text-slate-900 rounded text-[10px] font-black hover:bg-[#e0a415]"
                  >
                    Exact
                  </button>
                </div>

                {changeReturned > 0 && (
                  <div className="flex justify-between text-xs font-bold text-emerald-700 pt-1 border-t border-slate-200">
                    <span>Change to Return:</span>
                    <span>PKR {changeReturned.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Khata Balance Notification & Due Date Selection */}
            {(balanceAddedToCredit > 0 || paymentMethod === 'credit') && customerType !== 'parchon' && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-xs space-y-2">
                <div className="flex justify-between font-bold">
                  <span>Will add to Khata:</span>
                  <span>PKR {balanceAddedToCredit.toFixed(2)}</span>
                </div>

                <div className="pt-1.5 border-t border-amber-200/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1 text-slate-800">
                      <Calendar className="w-3.5 h-3.5 text-amber-700" />
                      <span>Payment Due Date:</span>
                    </span>
                    {customer?.creditDays ? (
                      <span className="text-[10px] text-amber-800 font-semibold">
                        Terms: {customer.creditDays}d
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-red-600">
                        * Required (No profile terms)
                      </span>
                    )}
                  </div>

                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={customDueDate}
                    onChange={(e) => setCustomDueDate(e.target.value)}
                    required
                    className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#071F49]"
                  />

                  {customDueDate && customer?.creditDays && customDueDate !== projectedDueDate && (
                    <p className="text-[10px] text-indigo-700 font-bold">
                      Admin override: selected deadline differs from standard {customer.creditDays}-day term.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Submission Error Banner */}
            {submissionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>
                    {submissionError.includes('not found in catalog')
                      ? 'A product in the cart was deleted from the catalog. Click Clear Cart to remove stale items.'
                      : submissionError}
                  </span>
                </div>
                {submissionError.includes('not found in catalog') && (
                  <button
                    type="button"
                    onClick={() => {
                      clearCart();
                      setSubmissionError(null);
                    }}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg transition-colors shrink-0 cursor-pointer"
                  >
                    Clear Cart
                  </button>
                )}
              </div>
            )}

            {/* Clear & Checkout Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearCart}
                disabled={items.length === 0 || isReadOnly || isSubmitting}
                className="p-3 border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors disabled:opacity-40"
                title="Clear Cart"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => handleCheckout()}
                disabled={!canCheckout || isSubmitting}
                className="flex-1 py-3 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Sale...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Sale (PKR {grandTotal.toFixed(2)})</span>
                    <ArrowRight className="w-4 h-4 text-[#F5B51B]" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Modals */}
      <CustomerSelectModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSelectCustomer={handleCustomerSelected}
        activeCustomer={customer}
        activeCustomerType={customerType}
      />

      <A4InvoiceModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        sale={completedSale}
      />

      {pendingOverride && customer && (
        <AdminOverrideModal
          isOpen={true}
          onClose={() => setPendingOverride(null)}
          onAuthorized={(override) => {
            setActiveAdminOverride(override);
            setPendingOverride(null);
            handleCheckout(override);
          }}
          customer={customer}
          attemptedAddition={pendingOverride.attemptedAddition}
          exceededAmount={pendingOverride.exceededAmount}
        />
      )}

      <ProductHistoryModal
        isOpen={Boolean(historyProduct)}
        onClose={() => setHistoryProduct(null)}
        product={historyProduct}
      />

      <SchoolSyllabusSetModal
        isOpen={isSyllabusModalOpen}
        onClose={() => setIsSyllabusModalOpen(false)}
        onLoadItemsIntoCart={handleLoadSyllabusItems}
      />
    </div>
  );
};
