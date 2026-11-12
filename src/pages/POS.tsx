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
  Tag,
  Percent,
  PauseCircle,
  X,
  ScanBarcode,
} from 'lucide-react';
import { WhatsAppIcon } from '../components/common/WhatsAppIcon';
import { useAuth } from '../hooks/useAuth';
import { usePOSCart } from '../hooks/usePOSCart';
import {
  searchProductsByName,
  searchProductBySku,
  searchProductByBarcodeOrSku,
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
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { BarcodeScannerModal } from '../components/common/BarcodeScannerModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { playScannerBeep, playScannerErrorTone } from '../utils/soundEffects';
import { STANDARD_CLASSES } from '../services/syllabusService';
import { getCategories } from '../services/categoryService';
import {
  createProduct,
  getProductsPaginated,
  type CreateProductInput,
} from '../services/productService';
import {
  matchesPublisherHierarchy,
  matchesSeriesHierarchy,
  matchesClassHierarchy,
} from '../utils/purchaseFormHelpers';
import { useToast } from '../hooks/useToast';
import type {
  CustomerDocument,
  CustomerType,
  AdminCreditOverride,
  SaleDocument,
  ProductDocument,
  PublisherDocument,
  SeriesDocument,
  CategoryDocument,
} from '../types/database';

const COMMON_SHEET_PRESETS = ['40', '60', '80', '100', '120', '160', '200', '240', '300'];
const COMMON_SIZE_PRESETS = ['A4', 'A5', 'Foolscap', 'Large', 'Small', 'Executive', 'B5'];

export const POS: React.FC = () => {
  const { currentUser, firebaseUser } = useAuth();
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
    booksSubtotal,
    stationerySubtotal,
    cartError,
    parkedCarts,
    lockStatus,
    isReadOnly,
    canCheckout,
    addProduct,
    addSyllabusSet,
    updateQuantity,
    updateItemDiscount,
    updateItemPrice,
    applyGlobalDiscount,
    applyGlobalDiscountAmount,
    applySeriesDiscount,
    parkCurrentCart,
    restoreParkedCart,
    discardParkedCart,
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
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryDocument[]>([]);
  const { success: toastSuccess, error: toastError } = useToast();

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => console.warn('Categories load error in POS:', err));
  }, []);

  const handleSaveProduct = async (payload: CreateProductInput) => {
    try {
      const activeUid = firebaseUser?.uid || currentUser?.uid;
      const activeEmail = firebaseUser?.email || currentUser?.email || 'cashier@sadiqbookagency.com';
      await createProduct(
        payload,
        activeUid || 'cashier',
        activeEmail
      );
      toastSuccess(`Product "${payload.title}" registered in catalog.`);
      setIsAddProductModalOpen(false);
      setSearchTerm(payload.title);
    } catch (err: any) {
      toastError(err?.message || 'Failed to add product');
      throw err;
    }
  };

  // 1c. Barcode Scanner State & Handlers (Mobile Camera & Handheld Gun)
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [pendingNewBarcode, setPendingNewBarcode] = useState<string>('');

  const handleBarcodeScanned = useCallback(
    async (scannedCode: string) => {
      try {
        const clean = scannedCode.trim();
        if (!clean) return;

        const product = await searchProductByBarcodeOrSku(clean);
        if (product) {
          addProduct(product, 1);
          playScannerBeep();
          toastSuccess(`Scanned & Added: "${product.title}"`);
        } else {
          playScannerErrorTone();
          setPendingNewBarcode(clean);
          toastError(`Product not registered for barcode "${clean}". Opening Add Product...`);
          setIsAddProductModalOpen(true);
        }
      } catch (err) {
        console.error('Barcode scan error in POS:', err);
        playScannerErrorTone();
        toastError('Failed to process barcode scan.');
      }
    },
    [addProduct, toastSuccess, toastError]
  );

  // 2. Search & Filter Category States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'book' | 'notebook_register' | 'all'>('book');

  // Book hierarchy filters
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all');
  const [selectedSeries, setSelectedSeries] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
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
  const selectedClassRef = useRef(selectedClass);
  selectedClassRef.current = selectedClass;
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

  // Hardware USB/Bluetooth Barcode Scanner Gun listener
  useBarcodeScanner({
    onScan: handleBarcodeScanned,
    enabled: !isSubmitting && !isReceiptModalOpen && !isAddProductModalOpen,
  });

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
      nbSize = selectedNbSizeRef.current,
      targetClass = selectedClassRef.current
    ) => {
      const clean = text.trim();
      const hasPub = pubId && pubId !== 'all';
      const hasSer = serId && serId !== 'all';
      const hasClass = targetClass && targetClass !== 'all';

      // 1. Browsing with empty search text (< 2 characters)
      if (!clean || clean.length < 2) {
        if (overrideCategory === 'book') {
          if (hasPub || hasSer || hasClass) {
            setIsSearching(true);
            try {
              const res = await getProductsByHierarchy(
                hasPub ? pubId : undefined,
                hasSer ? serId : undefined,
                hasClass ? targetClass : undefined
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
              if (hasPub && !matchesPublisherHierarchy(exact, pubId)) matches = false;
              if (hasSer && !matchesSeriesHierarchy(exact, serId)) matches = false;
              if (hasClass && !matchesClassHierarchy(exact, targetClass)) matches = false;
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

        // 2b. Comprehensive search using intelligent multi-token matching across all fields
        const res = await getProductsPaginated(
          {
            status: 'active',
            searchTerm: clean,
            classification:
              overrideCategory === 'book'
                ? 'book'
                : overrideCategory === 'notebook_register'
                ? (nbClass !== 'all' ? nbClass : undefined)
                : undefined,
            publisherId: hasPub ? pubId : undefined,
            seriesId: hasSer ? serId : undefined,
            targetClass: hasClass ? targetClass : undefined,
          },
          null,
          100
        );

        let filtered: ProductSearchResult[] = res.products.map((p) => ({
          ...p,
          publisherName: p.publisherName || p.authorOrPublisher || 'Standard',
        }));

        if (overrideCategory === 'notebook_register') {
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
        setNextCursor(res.lastDoc);
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
      selectedNbSizeRef.current,
      selectedClassRef.current
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
      selectedNbSizeRef.current,
      selectedClassRef.current
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
      selectedNbSizeRef.current,
      selectedClassRef.current
    );
  };

  const handleClassFilterChange = (cls: string) => {
    setSelectedClass(cls);
    selectedClassRef.current = cls;
    executeSearch(
      searchTerm,
      'book',
      selectedPublisherRef.current,
      selectedSeriesRef.current,
      selectedNbClassificationRef.current,
      selectedSheetCountRef.current,
      selectedNbSizeRef.current,
      cls
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
      const targetCls = selectedClassRef.current;
      const hasPub = pubId && pubId !== 'all';
      const hasSer = serId && serId !== 'all';
      const hasClass = targetCls && targetCls !== 'all';
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
          if (hasClass) {
            const cls = targetCls.toLowerCase().trim();
            filtered = filtered.filter((p) =>
              (p.targetClass && p.targetClass.toLowerCase().trim() === cls) ||
              (p.className && p.className.toLowerCase().trim() === cls) ||
              (p.edition && p.edition.toLowerCase().includes(cls)) ||
              (p.title && p.title.toLowerCase().includes(cls))
            );
          }
        } else if (currentCat === 'notebook_register') {
          if (nbClass !== 'all') filtered = filtered.filter((p) => p.classification === nbClass);
          if (nbSheets !== 'all') filtered = filtered.filter((p) => p.notebookSheets === nbSheets);
          if (nbSize !== 'all') filtered = filtered.filter((p) => p.notebookSize?.toLowerCase() === nbSize.toLowerCase());
        }
        setSearchResults((prev) => [...prev, ...filtered]);
        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor);
      } else if (currentCat === 'book' && (hasPub || hasSer || hasClass)) {
        const res = await getProductsByHierarchy(
          hasPub ? pubId : undefined,
          hasSer ? serId : undefined,
          hasClass ? targetCls : undefined,
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
  // OVERALL BILL DISCOUNT HANDLERS
  // ---------------------------------------------------------------------------------
  const [globalDiscountMode, setGlobalDiscountMode] = useState<'percent' | 'fixed'>('percent');
  const [globalDiscountValue, setGlobalDiscountValue] = useState<string>('');

  const handleGlobalDiscountChange = (val: string) => {
    setGlobalDiscountValue(val);
    const num = Math.max(0, parseFloat(val) || 0);
    if (globalDiscountMode === 'percent') {
      applyGlobalDiscount(num);
    } else {
      applyGlobalDiscountAmount(num);
    }
  };

  const handleGlobalDiscountModeChange = (mode: 'percent' | 'fixed') => {
    setGlobalDiscountMode(mode);
    setGlobalDiscountValue('');
    applyGlobalDiscount(0);
  };

  const handlePresetDiscountClick = (presetPercent: number) => {
    setGlobalDiscountMode('percent');
    setGlobalDiscountValue(presetPercent > 0 ? String(presetPercent) : '');
    applyGlobalDiscount(presetPercent);
  };

  const handleClearGlobalDiscount = () => {
    setGlobalDiscountValue('');
    applyGlobalDiscount(0);
  };

  useEffect(() => {
    if (items.length === 0 && globalDiscountValue) {
      setGlobalDiscountValue('');
    }
  }, [items.length, globalDiscountValue]);

  // ---------------------------------------------------------------------------------
  // CART SERIES & PUBLISHER BULK DISCOUNT STATE
  // ---------------------------------------------------------------------------------
  const [cartSelectedPublisher, setCartSelectedPublisher] = useState<string>('all');
  const [cartSelectedSeries, setCartSelectedSeries] = useState<string>('all');
  const [cartSelectedClass, setCartSelectedClass] = useState<string>('all');
  const [cartSeriesDiscount, setCartSeriesDiscount] = useState<string>('');

  // Extract unique publishers currently present in the cart's book items
  const cartBookPublishers = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.classification === 'book' && i.publisherName && i.publisherName !== 'Unknown') {
        set.add(i.publisherName);
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Extract unique series for the selected publisher (or all publishers) currently in cart
  const cartBookSeries = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.classification === 'book') {
        if (cartSelectedPublisher !== 'all' && i.publisherName !== cartSelectedPublisher) return;
        if (i.seriesName) set.add(i.seriesName);
      }
    });
    return Array.from(set).sort();
  }, [items, cartSelectedPublisher]);

  // Extract unique classes for the selected series/publisher in cart
  const cartBookClasses = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.classification === 'book') {
        if (cartSelectedPublisher !== 'all' && i.publisherName !== cartSelectedPublisher) return;
        if (cartSelectedSeries !== 'all' && i.seriesName !== cartSelectedSeries) return;
        if (i.targetClass) set.add(i.targetClass);
      }
    });
    return Array.from(set).sort();
  }, [items, cartSelectedPublisher, cartSelectedSeries]);

  // Count how many books in cart match the current dropdown selection
  const matchingBooksCount = useMemo(() => {
    return items.filter((i) => {
      if (i.classification !== 'book') return false;
      if (cartSelectedPublisher !== 'all' && i.publisherName !== cartSelectedPublisher) return false;
      if (cartSelectedSeries !== 'all' && i.seriesName !== cartSelectedSeries) return false;
      if (cartSelectedClass !== 'all' && i.targetClass !== cartSelectedClass) return false;
      return true;
    }).length;
  }, [items, cartSelectedPublisher, cartSelectedSeries, cartSelectedClass]);

  const handleApplySeriesDiscount = () => {
    const pct = parseFloat(cartSeriesDiscount);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toastError('Please enter a valid discount % between 0 and 100.');
      return;
    }
    const res = applySeriesDiscount({
      publisherName: cartSelectedPublisher,
      seriesName: cartSelectedSeries,
      targetClass: cartSelectedClass,
      discountRate: pct,
    });
    if (res.success) {
      const scopeName = cartSelectedSeries !== 'all'
        ? `Series "${cartSelectedSeries}"`
        : cartSelectedPublisher !== 'all'
        ? `Publisher "${cartSelectedPublisher}"`
        : 'All Books';
      toastSuccess(`Applied ${pct}% discount to ${res.count} items in ${scopeName}.`);
      setCartSeriesDiscount('');
    } else {
      toastError(res.error || 'Failed to apply series discount.');
    }
  };

  // Park / Hold Cart Handlers
  const handleParkCart = () => {
    const res = parkCurrentCart();
    if (res.success) {
      toastSuccess('Bill held in tab! Started a clean bill for next customer.');
    } else {
      toastError(res.error || 'Could not hold bill.');
    }
  };

  const handleRestoreParked = (id: string) => {
    const res = restoreParkedCart(id);
    if (res.success) {
      toastSuccess('Held bill restored to active register.');
    } else {
      toastError(res.error || 'Could not restore bill.');
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
    } else if (paymentMethod === 'credit' && cashTendered === String(grandTotal)) {
      setCashTendered('0');
    }
  }, [grandTotal, paymentMethod, cashTendered]);

  const creditCashPaid = paymentMethod === 'credit' ? Math.min(grandTotal, numericTendered) : 0;
  const balanceAddedToCredit =
    paymentMethod === 'credit'
      ? Math.max(0, grandTotal - creditCashPaid)
      : paymentMethod === 'cash' && cashTendered !== '' && numericTendered < grandTotal
      ? grandTotal - numericTendered
      : 0;

  const changeReturned =
    paymentMethod === 'cash' || paymentMethod === 'credit'
      ? Math.max(0, numericTendered - grandTotal)
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

    // Require due date if adding to credit for registered customer accounts
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
      const effectiveTendered =
        paymentMethod === 'credit'
          ? numericTendered
          : paymentMethod === 'cash' && (numericTendered <= 0 || !cashTendered)
          ? grandTotal
          : numericTendered;

      const payload = prepareSalePayload(effectiveTendered, paymentMethod, customDueDate);
      if (overrideToUse) {
        payload.creditLimitOverride = overrideToUse;
      }

      await withSubmissionGuard(async () => {
        const activeUid = firebaseUser?.uid || currentUser?.uid;
        const operatorEmail = firebaseUser?.email || currentUser?.email || 'cashier@sadiqbookagency.com';
        const operatorId = activeUid || 'system_cashier';
        const operatorName = currentUser?.displayName || firebaseUser?.displayName || 'Cashier';

        const result = await processSaleTransaction(payload, operatorId, operatorName, operatorEmail);

        // Success!
        setCompletedSale(result.sale);
        setIsReceiptModalOpen(true);
        confirmCheckoutSuccess();
        setGlobalDiscountValue('');
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
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left Column: Product Search & Search Results */}
        <div className={`flex-1 flex flex-col p-3 sm:p-4 overflow-hidden border-r border-slate-200 bg-white min-h-0 ${mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'}`}>
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
                onClick={() => setIsScannerModalOpen(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs shadow-xs hover:shadow transition-all cursor-pointer border border-amber-400"
                title="Scan Barcode using Mobile Camera or Scanner Gun"
              >
                <ScanBarcode className="w-4 h-4 text-slate-950" />
                <span className="hidden sm:inline">Scan Barcode</span>
                <span className="sm:hidden">Scan</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddProductModalOpen(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer border border-emerald-600"
                title="Cashier Quick Add: Register new book or notebook into catalog"
              >
                <Plus className="w-4 h-4 text-[#F5B51B]" />
                <span className="hidden sm:inline">Add Product</span>
                <span className="sm:hidden">Add</span>
              </button>

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
                <span className="hidden sm:inline">Books (Publisher, Series & Class)</span>
                <span className="sm:hidden">Books</span>
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
                <span className="hidden sm:inline">Notebooks & Registers (Sheets)</span>
                <span className="sm:hidden">Notebooks</span>
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
              /* Books: Publisher -> Series -> Class Dropdowns */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                      {selectedPublisher === 'all' ? 'All Series (Select Pub)' : 'All Series'}
                    </option>
                    {seriesList.map((ser) => (
                      <option key={ser.id} value={ser.id}>
                        {ser.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <select
                    value={selectedClass}
                    onChange={(e) => handleClassFilterChange(e.target.value)}
                    className="w-full text-xs font-semibold border border-slate-300 rounded-xl px-2.5 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#071F49] focus:bg-white transition"
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
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-1">
                <Search className="w-6 h-6 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">
                  {searchTerm.trim().length >= 2
                    ? 'No products found matching search query.'
                    : 'Search for a book or item above to begin adding to cart.'}
                </p>
                <p className="text-[11px] text-slate-400">
                  Use publisher, series, or keyword search to quickly browse books.
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
                        {(product.targetClass || product.className) && (
                          <>
                            <span>•</span>
                            <span className="font-bold text-blue-900 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded text-[11px]">
                              Class: {product.targetClass || product.className}
                            </span>
                          </>
                        )}
                        {product.edition && (
                          <>
                            <span>•</span>
                            <span className="text-slate-600 font-medium">
                              {product.edition}
                            </span>
                          </>
                        )}
                        {product.classification !== 'book' && (
                          <>
                            <span>•</span>
                            <span className="capitalize text-slate-500 font-medium">
                              Type: {product.classification}
                            </span>
                          </>
                        )}
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
                        {product.classification === 'book' ? (
                          <>
                            <div className="text-sm font-black text-slate-900">
                              PKR {customerType === 'wholesaler' ? product.wholesalePrice : product.retailPrice}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {customerType === 'wholesaler' ? 'Wholesale Price' : 'Retail Price'}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-black text-amber-900">
                              {product.lastSoldPrice
                                ? `PKR ${product.lastSoldPrice}`
                                : product.retailPrice
                                ? `PKR ${product.retailPrice}`
                                : 'Set at POS'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              {product.lastSoldPrice ? 'Last POS Rate' : 'Open Selling Rate'}
                            </div>
                          </>
                        )}
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
                <span>View Cart & Create Bill &rarr;</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Active POS Cart, Customer Pricing Terms, and Checkout */}
        <div className={`w-full lg:w-[510px] xl:w-[550px] 2xl:w-[600px] bg-slate-50 flex flex-col h-full min-h-0 border-t lg:border-t-0 border-slate-200 shadow-lg ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
          {/* Mobile Back Button to Catalog */}
          <div className="lg:hidden flex items-center justify-between px-3 py-1.5 bg-slate-200 border-b border-slate-300 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('catalog')}
              className="font-bold text-[#071F49] flex items-center gap-1 hover:underline cursor-pointer"
            >
              &larr; Back to Products Catalog
            </button>
            <span className="font-semibold text-slate-600">{items.length} items</span>
          </div>

          {/* Multi-Customer Bill Management Tabs (Hold / Park / Switch Bills) */}
          <div className="bg-[#071F49] text-white px-2 py-1 flex items-center justify-between gap-1 border-b border-[#F5B51B]/40 shrink-0 text-xs">
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar max-w-[72%]">
              {/* Active Bill Pill */}
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5B51B] text-[#071F49] font-black shrink-0 shadow-2xs text-[11px]">
                <span>Active Bill ({items.length})</span>
                {grandTotal > 0 && (
                  <span className="text-[9.5px] font-mono font-bold bg-[#071F49] text-white px-1 rounded">
                    Rs.{grandTotal.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Parked / Held Bills Tabs */}
              {parkedCarts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold shrink-0 text-[10.5px] cursor-pointer transition"
                  onClick={() => handleRestoreParked(p.id)}
                  title={`Click to switch to this held bill (${p.itemCount} items • PKR ${p.totalAmount.toLocaleString()})`}
                >
                  <PauseCircle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                  <span className="truncate max-w-[100px]">{p.label}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Discard held bill "${p.label}"?`)) {
                        discardParkedCart(p.id);
                      }
                    }}
                    className="hover:text-red-400 p-0.5 rounded text-slate-400 ml-0.5"
                    title="Discard held bill"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Action to Hold Current Bill and Serve Next Customer */}
            <button
              type="button"
              onClick={handleParkCart}
              disabled={items.length === 0 || isReadOnly}
              className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-bold text-[10.5px] flex items-center gap-1 transition shrink-0 cursor-pointer shadow-2xs"
              title="Hold this customer's bill to serve another customer on a new bill"
            >
              <PauseCircle className="w-3 h-3" />
              <span>+ Hold Bill</span>
            </button>
          </div>

          {/* Customer Selection Banner */}
          <div className="py-1 px-2.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <div
                className={`p-1 rounded-lg ${
                  customerType === 'parchon'
                    ? 'bg-emerald-100 text-emerald-700'
                    : customerType === 'wholesaler'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {customerType === 'parchon' ? (
                  <UserCheck className="w-3.5 h-3.5" />
                ) : customerType === 'wholesaler' ? (
                  <Store className="w-3.5 h-3.5" />
                ) : (
                  <Users className="w-3.5 h-3.5" />
                )}
              </div>

              <div>
                <div className="text-[11.5px] font-bold text-slate-900 leading-tight">
                  {customer ? (customer.shopName || customer.name) : 'Parchon (Counter Cash)'}
                </div>
                <div className="text-[9.5px] text-slate-500">
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
              className="px-2 py-0.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              Switch Terms
            </button>
          </div>

          {/* Series & Publisher Bulk Discount Toolbar (Apply % to Series with 1-Click) */}
          <div className="bg-slate-100/90 border-b border-slate-200 py-1 px-2 shrink-0 text-xs space-y-0.5">
            <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-700">
              <span className="flex items-center gap-1">
                <Percent className="w-2.5 h-2.5 text-[#071F49]" />
                <span>Series / Publisher Bulk Discount</span>
              </span>
              {matchingBooksCount > 0 && (
                <span className="text-[9.5px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.1 rounded font-semibold">
                  {matchingBooksCount} book{matchingBooksCount > 1 ? 's' : ''} target
                </span>
              )}
            </div>

            <div className="grid grid-cols-12 gap-1 items-center">
              {/* Publisher Selector */}
              <div className="col-span-3">
                <select
                  value={cartSelectedPublisher}
                  onChange={(e) => {
                    setCartSelectedPublisher(e.target.value);
                    setCartSelectedSeries('all');
                    setCartSelectedClass('all');
                  }}
                  className="w-full text-[10px] font-semibold bg-white border border-slate-300 rounded py-0.5 px-1 focus:ring-1 focus:ring-[#071F49] focus:outline-none h-6"
                  title="Filter Publisher in Cart"
                >
                  <option value="all">All Publishers</option>
                  {cartBookPublishers.map((pub) => (
                    <option key={pub} value={pub}>
                      {pub}
                    </option>
                  ))}
                </select>
              </div>

              {/* Series Selector */}
              <div className="col-span-3">
                <select
                  value={cartSelectedSeries}
                  onChange={(e) => {
                    setCartSelectedSeries(e.target.value);
                    setCartSelectedClass('all');
                  }}
                  className="w-full text-[10px] font-semibold bg-white border border-slate-300 rounded py-0.5 px-1 focus:ring-1 focus:ring-[#071F49] focus:outline-none h-6"
                  title="Filter Series in Cart"
                >
                  <option value="all">All Series</option>
                  {cartBookSeries.map((ser) => (
                    <option key={ser} value={ser}>
                      {ser}
                    </option>
                  ))}
                </select>
              </div>

              {/* Class Selector */}
              <div className="col-span-2">
                <select
                  value={cartSelectedClass}
                  onChange={(e) => setCartSelectedClass(e.target.value)}
                  className="w-full text-[10px] font-semibold bg-white border border-slate-300 rounded py-0.5 px-1 focus:ring-1 focus:ring-[#071F49] focus:outline-none h-6"
                  title="Filter Academic Class in Cart"
                >
                  <option value="all">All Classes</option>
                  {cartBookClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              {/* Percentage Discount % Input */}
              <div className="col-span-2 relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  placeholder="Disc%"
                  value={cartSeriesDiscount}
                  onChange={(e) => setCartSeriesDiscount(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full text-[10px] font-bold text-center bg-white border border-slate-300 rounded py-0.5 pr-3 pl-1 focus:ring-1 focus:ring-[#071F49] focus:outline-none h-6"
                  title="Enter Discount Percentage for selected series"
                />
                <span className="absolute right-1 top-0.5 text-[9px] text-slate-400 font-bold">%</span>
              </div>

              {/* 1-Click Apply Button */}
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={handleApplySeriesDiscount}
                  disabled={isReadOnly || !cartSeriesDiscount || matchingBooksCount === 0}
                  className="w-full py-0.5 bg-[#071F49] hover:bg-[#0d3477] disabled:opacity-40 text-white font-black text-[10px] rounded transition shadow-2xs cursor-pointer h-6 flex items-center justify-center"
                  title="Assign this discount percentage to all books in the selected series"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* High-Capacity Compact Cart Items List (Accommodates 10+ items cleanly) */}
          <div className="flex-1 min-h-0 p-1.5 sm:p-2 overflow-y-auto space-y-1">
            {cartError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-1.5 rounded-lg flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                <span>{cartError}</span>
              </div>
            )}

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center text-slate-400 space-y-1">
                <ShoppingCart className="w-6 h-6 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Cart is empty</p>
                <p className="text-[10px] text-slate-400">Add products from catalog on the left to create bill</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.productId}
                  className="bg-white px-2 py-1 rounded-md border border-slate-200 hover:border-slate-300 shadow-2xs transition"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0 flex-1 flex items-baseline gap-1.5 truncate">
                      <span className="font-bold text-[11.5px] text-slate-900 truncate leading-tight">
                        {item.productName}
                      </span>
                      {(item.publisherName || item.seriesName || item.targetClass) && (
                        <span className="text-[9.5px] text-slate-500 truncate shrink-0">
                          {[item.publisherName !== 'Unknown' ? item.publisherName : '', item.seriesName, item.targetClass].filter(Boolean).join(' • ')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-black text-xs text-[#071F49] font-mono">
                        PKR {item.lineTotal.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        disabled={isReadOnly}
                        className="text-slate-300 hover:text-red-600 p-0.5 rounded transition-colors disabled:opacity-50 cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-0.5 mt-0.5 border-t border-slate-100 gap-1 flex-wrap sm:flex-nowrap">
                    {/* Quantity controls */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        disabled={item.quantity <= 1 || isReadOnly}
                        className="w-4 h-4 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer text-[10px]"
                      >
                        <Minus className="w-2 h-2" />
                      </button>

                      <input
                        type="number"
                        min="1"
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                        disabled={isReadOnly}
                        className="w-9 text-center font-bold text-[11px] border border-slate-300 rounded py-0 focus:outline-none focus:ring-1 focus:ring-[#071F49] bg-white text-slate-900 h-5"
                      />

                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        disabled={item.quantity >= item.availableStock || isReadOnly}
                        className="w-4 h-4 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer text-[10px]"
                      >
                        <Plus className="w-2 h-2" />
                      </button>
                    </div>

                    {/* Book vs Stationery Pricing */}
                    {item.classification === 'book' ? (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* 1. Original MRP */}
                        <span
                          className="px-1 py-0.2 rounded bg-slate-100 text-slate-600 text-[9.5px] font-mono font-bold border border-slate-200 shrink-0"
                          title="Original Catalog MRP (Base Price)"
                        >
                          MRP: {item.unitPrice}
                        </span>

                        {/* 2. D.Price (Customer Selling Rate) */}
                        <div
                          className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-50 border border-amber-300 shrink-0"
                          title="Discounted Selling Rate assigned to customer"
                        >
                          <span className="text-[9.5px] font-bold text-amber-950">Rate:</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.effectivePrice || ''}
                            onChange={(e) => updateItemPrice(item.productId, parseFloat(e.target.value) || 0)}
                            disabled={isReadOnly}
                            className="w-12 text-center font-black text-[11px] border border-amber-300 rounded py-0 focus:outline-none focus:ring-1 focus:ring-[#071F49] bg-white text-slate-900 h-5"
                          />
                        </div>

                        {/* 3. Disc % (Discount Percentage) */}
                        <div
                          className="flex items-center gap-0.5 bg-slate-50 border border-slate-300 px-1 py-0.2 rounded shrink-0"
                          title="Discount % for this book"
                        >
                          <span className="text-[9.5px] text-slate-600 font-semibold">Disc%:</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={item.discountRate}
                            onChange={(e) => updateItemDiscount(item.productId, parseFloat(e.target.value) || 0)}
                            disabled={isReadOnly}
                            className="w-9 text-center font-bold text-[11px] border border-slate-300 rounded py-0 focus:outline-none focus:ring-1 focus:ring-[#071F49] bg-white text-slate-900 h-5"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <div
                          className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-100/90 border border-amber-300 shrink-0"
                          title="Direct selling price per unit for this stationery item"
                        >
                          <span className="text-[9.5px] text-amber-950 font-bold">Rate:</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.effectivePrice || ''}
                            onChange={(e) => updateItemPrice(item.productId, parseFloat(e.target.value) || 0)}
                            disabled={isReadOnly}
                            className="w-14 text-center font-black text-[11px] border border-amber-300 rounded py-0 focus:outline-none focus:ring-1 focus:ring-[#071F49] bg-white text-slate-900 h-5"
                          />
                        </div>
                        <span className="text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded font-black uppercase">
                          Direct Rate
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Bottom Financial Summary & Payment Box */}
          <div className="p-1.5 sm:p-2 bg-white border-t border-slate-200 space-y-1 shrink-0 shadow-inner max-h-[44vh] overflow-y-auto">
            {/* Overall Bill Discount Control */}
            {items.length > 0 && (
              <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-[#071F49]" />
                    <span>Overall Bill Discount</span>
                  </span>
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-0.5 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleGlobalDiscountModeChange('percent')}
                      className={`px-1.5 py-0.2 rounded transition cursor-pointer ${
                        globalDiscountMode === 'percent'
                          ? 'bg-[#071F49] text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      % Percent
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGlobalDiscountModeChange('fixed')}
                      className={`px-1.5 py-0.2 rounded transition cursor-pointer ${
                        globalDiscountMode === 'fixed'
                          ? 'bg-[#071F49] text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      PKR Flat
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold px-0.5">
                  <span>Eligible Books: PKR {booksSubtotal.toLocaleString()}</span>
                  {stationerySubtotal > 0 && (
                    <span className="text-amber-700 bg-amber-50 px-1 py-0.1 rounded border border-amber-200 text-[9.5px] font-bold">
                      Stationery (PKR {stationerySubtotal.toLocaleString()}) Excluded
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max={globalDiscountMode === 'percent' ? 100 : booksSubtotal}
                      step="any"
                      placeholder={globalDiscountMode === 'percent' ? 'e.g. 10% on books' : 'e.g. 200 PKR'}
                      value={globalDiscountValue}
                      onChange={(e) => handleGlobalDiscountChange(e.target.value)}
                      disabled={isReadOnly}
                      className="w-full pl-2 pr-7 py-0.5 text-xs font-bold border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#071F49] bg-white text-slate-800 h-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                      {globalDiscountMode === 'percent' ? '%' : 'PKR'}
                    </span>
                  </div>

                  {globalDiscountValue && parseFloat(globalDiscountValue) > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearGlobalDiscount}
                      disabled={isReadOnly}
                      className="px-1.5 py-0.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded transition cursor-pointer h-6"
                      title="Reset Overall Discount"
                    >
                      Reset
                    </button>
                  ) : null}

                  {/* Quick 1-Click Preset Discount Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {[0, 5, 10, 15, 20, 25].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePresetDiscountClick(preset)}
                        disabled={isReadOnly}
                        className={`px-1 py-0.5 text-[9.5px] font-bold rounded border transition cursor-pointer h-6 ${
                          globalDiscountMode === 'percent' && parseFloat(globalDiscountValue) === preset
                            ? 'bg-[#071F49] text-[#F5B51B] border-[#071F49] shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Subtotals & Grand Total */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 px-2 text-xs space-y-0.5">
              <div className="flex justify-between items-center text-[11px] text-slate-600 font-semibold">
                <span>
                  Items: <strong className="text-slate-900 font-bold">{totalItemCount} pcs</strong> (PKR {subtotal.toFixed(2)})
                </span>
                {totalDiscount > 0 && (
                  <span className="text-emerald-700 font-bold">
                    Disc: -PKR {totalDiscount.toFixed(2)}
                  </span>
                )}
              </div>

              {booksSubtotal > 0 && stationerySubtotal > 0 && (
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Books: PKR {booksSubtotal.toFixed(2)}</span>
                  <span className="text-amber-800">Stationery: PKR {stationerySubtotal.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-0.5 border-t border-slate-200">
                <span className="text-xs font-black text-slate-800 uppercase tracking-tight">GRAND TOTAL:</span>
                <span className="text-base font-black text-[#071F49] font-mono">
                  PKR {grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method Tabs */}
            <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('cash');
                  if (!cashTendered || cashTendered === '0') {
                    setCashTendered(String(grandTotal));
                  }
                }}
                className={`flex-1 py-1 rounded flex items-center justify-center gap-1 transition-colors ${
                  paymentMethod === 'cash' ? 'bg-[#071F49] text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Banknote className="w-3 h-3" />
                <span>Cash</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('bank_transfer');
                  setCashTendered('');
                }}
                className={`flex-1 py-1 rounded flex items-center justify-center gap-1 transition-colors ${
                  paymentMethod === 'bank_transfer'
                    ? 'bg-[#071F49] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CreditCard className="w-3 h-3" />
                <span>Bank</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('credit')}
                className={`flex-1 py-1 rounded flex items-center justify-center gap-1 transition-colors ${
                  paymentMethod === 'credit'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Store className="w-3 h-3" />
                <span>Khata Credit</span>
              </button>
            </div>

            {/* Cash Tendered & Change Returned (When Cash Mode) */}
            {paymentMethod === 'cash' && (
              <div className="space-y-1 bg-slate-50 p-1.5 px-2 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                    <span>Cash:</span>
                    <input
                      type="number"
                      min="0"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder="0"
                      className="w-24 text-right font-black text-xs border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#071F49] bg-white h-6"
                    />
                  </div>

                  {/* Quick denomination chips */}
                  <div className="flex gap-1 items-center">
                    {[500, 1000, 5000].map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        onClick={() => setCashTendered(String(denom))}
                        className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9.5px] font-bold text-slate-700 hover:bg-slate-100"
                      >
                        +{denom}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(grandTotal))}
                      className="px-1.5 py-0.5 bg-[#F5B51B] text-slate-900 rounded text-[9.5px] font-black hover:bg-[#e0a415]"
                    >
                      Exact
                    </button>
                  </div>
                </div>

                {changeReturned > 0 && (
                  <div className="flex justify-between text-[11px] font-bold text-emerald-700 pt-0.5 border-t border-slate-200">
                    <span>Change:</span>
                    <span className="font-mono">PKR {changeReturned.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Khata Credit Partial Cash Payment Option */}
            {paymentMethod === 'credit' && (
              <div className="space-y-1.5 bg-amber-50/80 p-2 rounded-lg border border-amber-300">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-950">
                    <Banknote className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Cash Paid Now:</span>
                    <input
                      type="number"
                      min="0"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder="0"
                      className="w-24 text-right font-black text-xs border border-amber-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-600 bg-white h-6"
                    />
                  </div>

                  {/* Quick cash chips */}
                  <div className="flex gap-1 items-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCashTendered('0')}
                      className={`px-1.5 py-0.5 border rounded text-[9.5px] font-bold transition cursor-pointer ${
                        numericTendered === 0
                          ? 'bg-amber-800 text-white border-amber-900 shadow-2xs'
                          : 'bg-white border-amber-200 text-amber-900 hover:bg-amber-100'
                      }`}
                      title="0 Cash - Entire bill added to Khata debt"
                    >
                      0 (Full Khata)
                    </button>
                    {[500, 1000, 5000].map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        onClick={() => setCashTendered(String(denom))}
                        className="px-1.5 py-0.5 bg-white border border-amber-200 rounded text-[9.5px] font-bold text-slate-700 hover:bg-amber-100 cursor-pointer"
                      >
                        +{denom}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(grandTotal))}
                      className="px-1.5 py-0.5 bg-[#F5B51B] text-slate-900 rounded text-[9.5px] font-black hover:bg-[#e0a415] cursor-pointer"
                      title="Customer pays full bill in cash right now"
                    >
                      Exact
                    </button>
                  </div>
                </div>

                {/* Live Khata vs Cash Breakdown */}
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-amber-200/80 text-[10.5px]">
                  <div className="bg-white/90 p-1.5 rounded border border-amber-200">
                    <span className="text-slate-500 block text-[9px] uppercase font-bold">
                      Cash Received:
                    </span>
                    <span className="font-mono font-black text-emerald-700 text-xs">
                      PKR {creditCashPaid.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-white/90 p-1.5 rounded border border-amber-200">
                    <span className="text-slate-500 block text-[9px] uppercase font-bold">
                      Added to Khata:
                    </span>
                    <span className="font-mono font-black text-rose-700 text-xs">
                      PKR {balanceAddedToCredit.toFixed(2)}
                    </span>
                  </div>
                </div>

                {changeReturned > 0 && (
                  <div className="flex justify-between text-[11px] font-bold text-emerald-700 pt-0.5 border-t border-amber-200">
                    <span>Change to Return:</span>
                    <span className="font-mono">PKR {changeReturned.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Khata Balance Notification & Due Date Selection */}
            {(balanceAddedToCredit > 0 || paymentMethod === 'credit') && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded-lg text-xs space-y-1.5">
                {paymentMethod !== 'credit' && (
                  <div className="flex justify-between font-bold text-[11px]">
                    <span>Will add to Khata / Balance:</span>
                    <span className="font-mono">PKR {balanceAddedToCredit.toFixed(2)}</span>
                  </div>
                )}

                {customerType !== 'parchon' ? (
                  <div className="pt-1 border-t border-amber-200/80 space-y-1">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-bold flex items-center gap-1 text-slate-800">
                        <Calendar className="w-3 h-3 text-amber-700" />
                        <span>Due Date:</span>
                      </span>
                      {customer?.creditDays ? (
                        <span className="text-[9.5px] text-amber-800 font-semibold">
                          Terms: {customer.creditDays}d
                        </span>
                      ) : (
                        <span className="text-[9.5px] font-bold text-red-600">
                          * Required
                        </span>
                      )}
                    </div>

                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={customDueDate}
                      onChange={(e) => setCustomDueDate(e.target.value)}
                      required
                      className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#071F49] h-6"
                    />

                    {customDueDate && customer?.creditDays && customDueDate !== projectedDueDate && (
                      <p className="text-[9.5px] text-indigo-700 font-bold">
                        Override: differs from standard {customer.creditDays}-day term.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="pt-1 border-t border-amber-200/80 space-y-1">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-bold flex items-center gap-1 text-slate-800">
                        <Calendar className="w-3 h-3 text-amber-700" />
                        <span>Due Date (Optional):</span>
                      </span>
                    </div>

                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={customDueDate}
                      onChange={(e) => setCustomDueDate(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#071F49] h-6"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Submission Error Banner */}
            {submissionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] p-1.5 rounded-lg flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                  <span>
                    {submissionError.includes('not found in catalog')
                      ? 'A product was deleted from catalog. Click Clear Cart.'
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
                    className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded transition-colors shrink-0 cursor-pointer"
                  >
                    Clear Cart
                  </button>
                )}
                {submissionError.includes('collision') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionError(null);
                      handleCheckout();
                    }}
                    className="px-2 py-0.5 bg-[#071F49] hover:bg-[#0c2f6d] text-[#F5B51B] font-black text-[10px] rounded transition-colors shrink-0 cursor-pointer border border-[#F5B51B]/40"
                  >
                    Retry Sale Now
                  </button>
                )}
              </div>
            )}

            {/* Clear & Checkout Buttons */}
            <div className="flex gap-1.5 pt-0.5 shrink-0">
              <button
                type="button"
                onClick={clearCart}
                disabled={items.length === 0 || isReadOnly || isSubmitting}
                className="p-1.5 border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors disabled:opacity-40 cursor-pointer shrink-0"
                title="Clear Cart"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleCheckout()}
                disabled={!canCheckout || isSubmitting}
                className={`flex-1 py-1.5 px-3 rounded-lg font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] ${
                  canCheckout && !isSubmitting
                    ? 'bg-[#F5B51B] hover:bg-[#F8CE4E] text-[#071F49] cursor-pointer shadow-amber-500/10 hover:shadow ring-1 ring-[#071F49]/10'
                    : 'bg-[#071F49] text-white opacity-60 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Processing Sale...</span>
                  </>
                ) : items.length === 0 ? (
                  <>
                    <ShoppingCart className="w-3.5 h-3.5 text-[#F5B51B]" />
                    <span>Create Bill / Complete Sale (Add Items)</span>
                  </>
                ) : (
                  <>
                    <span>Create Bill / Complete Sale</span>
                    <span className="bg-[#071F49] text-white px-1.5 py-0.5 rounded text-[11px] font-black tracking-tight">
                      PKR {grandTotal.toFixed(2)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#071F49]" />
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

      <ProductFormModal
        isOpen={isAddProductModalOpen}
        onClose={() => {
          setIsAddProductModalOpen(false);
          setPendingNewBarcode('');
        }}
        onSubmit={handleSaveProduct}
        initialBarcode={pendingNewBarcode}
        categories={categories}
      />

      {isScannerModalOpen && (
        <BarcodeScannerModal
          isOpen={isScannerModalOpen}
          onClose={() => setIsScannerModalOpen(false)}
          onScan={handleBarcodeScanned}
          mode="continuous"
          title="POS Camera Barcode Scanner"
          instructions="Point mobile camera at book barcode. Scanned books will automatically be added to your bill."
        />
      )}
    </div>
  );
};
