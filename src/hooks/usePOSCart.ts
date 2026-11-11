import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  ProductDocument,
  CustomerDocument,
  CustomerDiscountDocument,
  CustomerType,
  ItemClassification,
} from '../types/database';
import { resolveEffectivePrice } from '../services/discountService';
import {
  getOrCreateCheckoutSession,
  createCheckoutSession,
  clearCheckoutSession,
  type CheckoutSession,
  type SimpleStorage,
  type ProcessSaleInput,
} from '../services/saleService';

export const POS_CART_STORAGE_KEY = 'sba_active_pos_cart';

/**
 * Returns the terminal-partitioned storage key for the POS cart draft.
 * Ensures carts from different terminals (e.g. T1, T2) on the same browser profile never collide.
 */
export const getPOSCartStorageKey = (terminalId = 'T1'): string => {
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  return `sba_active_pos_cart_${cleanTerm}`;
};

export const getParkedCartsStorageKey = (terminalId = 'T1'): string => {
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  return `sba_parked_pos_carts_${cleanTerm}`;
};

export interface POSCartItem {
  productId: string;
  productName: string;
  sku: string;
  classification: ItemClassification;
  isDiscountEligible: boolean;
  publisherName: string; // Captured from product.publisherName or 'Unknown' (no author fallback)
  seriesName?: string; // Captured from product.seriesName
  targetClass?: string; // Academic Class (e.g. "Class 9", "Play Group")
  availableStock: number;
  costPrice: number;
  quantity: number;
  unitPrice: number; // Original Price / MRP
  discountRate: number; // Customer discount %
  discountAmount: number; // Customer discount monetary amount per unit
  effectivePrice: number; // unitPrice - discountAmount (or direct entered stationery price)
  lineTotal: number; // effectivePrice * quantity
  isManualDiscount?: boolean; // Set true when user manually enters discount for this item on the bill
  appliedRuleType:
    | 'standard_retail'
    | 'standard_wholesale'
    | 'customer_base'
    | 'custom_percentage'
    | 'custom_fixed'
    | 'manual_override';
}

export interface ParkedCart {
  id: string;
  label: string;
  parkedAt: string;
  session: CheckoutSession;
  customerType: CustomerType;
  customer: CustomerDocument | null;
  items: POSCartItem[];
  notes?: string;
  totalAmount: number;
  itemCount: number;
}

export interface PersistentCartState {
  session: CheckoutSession;
  customerType: CustomerType;
  customer: CustomerDocument | null;
  items: POSCartItem[];
  notes?: string;
  lastUpdated: number;
}

export type TerminalLockStatus = 'pending' | 'owner' | 'spectator' | 'unsupported';

export interface CartOperationResult {
  success: boolean;
  error?: string;
}

export interface UsePOSCartOptions {
  terminalId?: string;
  storage?: Storage | SimpleStorage;
  lockManager?: LockManager;
}

// Precision monetary rounding helper to prevent floating-point anomalies (e.g. 0.1 + 0.2 = 0.30000000000000004)
export const roundMoney = (val: number): number => Math.round((Number(val) || 0) * 100) / 100;

export const usePOSCart = (options: UsePOSCartOptions = {}) => {
  const terminalId = options.terminalId || 'T1';
  const cleanTerm = useMemo(() => {
    return terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  }, [terminalId]);

  const cartStorageKey = useMemo(() => getPOSCartStorageKey(cleanTerm), [cleanTerm]);

  const store = useMemo<SimpleStorage | null>(() => {
    if (options.storage) return options.storage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  }, [options.storage]);

  const lockManager = useMemo<LockManager | null>(() => {
    if (options.lockManager) return options.lockManager;
    if (typeof navigator !== 'undefined' && 'locks' in navigator) return navigator.locks;
    return null;
  }, [options.lockManager]);

  // Lock State: 'pending' (initial acquisition in flight), 'owner' (can edit/submit),
  // 'spectator' (read-only), 'unsupported' (fail-closed if Web Locks API missing)
  const [lockStatus, setLockStatus] = useState<TerminalLockStatus>(() => {
    if (!lockManager) return 'unsupported';
    return 'pending'; // Initial status while Web Lock acquisition is in progress
  });

  const [lockError, setLockError] = useState<string | null>(null);

  // Initialize or restore persistent checkout session for this specific terminal
  const [session, setSession] = useState<CheckoutSession>(() => {
    return getOrCreateCheckoutSession(cleanTerm, store || undefined);
  });

  const [customerType, setCustomerTypeState] = useState<CustomerType>('parchon');
  const [customer, setCustomerState] = useState<CustomerDocument | null>(null);
  const [items, setItems] = useState<POSCartItem[]>([]);
  const [notes, setNotesState] = useState<string>('');
  const [cartError, setCartError] = useState<string | null>(null);

  // Parked / Held Carts State (Multi-Bill counter tabs)
  const parkedStorageKey = useMemo(() => getParkedCartsStorageKey(cleanTerm), [cleanTerm]);
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>(() => {
    if (!store) return [];
    try {
      const saved = store.getItem(getParkedCartsStorageKey(cleanTerm));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const saveParkedCartsToStorage = useCallback((carts: ParkedCart[]) => {
    if (!store) return;
    try {
      store.setItem(parkedStorageKey, JSON.stringify(carts));
    } catch (err) {
      console.warn('Failed to save parked carts to storage:', err);
    }
  }, [store, parkedStorageKey]);

  // In-memory cache of customer-specific discounts for the active customer
  const [customDiscountsMap, setCustomDiscountsMap] = useState<Map<string, CustomerDiscountDocument>>(new Map());

  // Refs for concurrency & lifecycle safety
  const releaseLockRef = useRef<(() => void) | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // ---------------------------------------------------------------------------------
  // 1. WEB LOCKS MULTI-TAB OWNERSHIP LIFECYCLE & COORDINATION
  // ---------------------------------------------------------------------------------
  const acquireOwnership = useCallback(function requestLock(isRetry = false) {
    if (!lockManager) {
      setLockStatus('unsupported');
      setLockError('Web Locks API is unsupported in this browser environment. Checkout is disabled to prevent multi-tab concurrency conflicts.');
      return;
    }

    // Release any previously held lock before re-requesting
    if (releaseLockRef.current) {
      releaseLockRef.current();
      releaseLockRef.current = null;
    }

    setLockStatus('pending');
    setLockError(null);
    const lockName = `sba_pos_terminal_${cleanTerm}_active`;

    lockManager.request(
      lockName,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        // If component already unmounted before lock callback fired, exit immediately to release the lock
        if (!isMountedRef.current) {
          return;
        }

        if (!lock) {
          // If this is the initial attempt, retry once after 70ms to handle fast React StrictMode or hot-reload release
          if (!isRetry) {
            setTimeout(() => {
              if (isMountedRef.current) {
                requestLock(true);
              }
            }, 70);
            return;
          }

          // Lock is held by another active tab on this origin/profile
          setLockStatus('spectator');
          setLockError(`Terminal "${cleanTerm}" is currently active in another browser tab. This tab is in read-only spectator mode.`);
          return;
        }

        // Lock acquired: this tab is the exclusive active register owner
        setLockStatus('owner');
        setLockError(null);

        // Hold the lock until component unmounts, page navigates away, or explicit release
        await new Promise<void>((resolve) => {
          releaseLockRef.current = resolve;
        });
      }
    ).catch((err) => {
      if (!isMountedRef.current) return;
      console.error('Error in Web Lock request:', err);
      setLockStatus('unsupported');
      setLockError('Failed to coordinate terminal lock.');
    });
  }, [lockManager, cleanTerm]);

  // Inter-tab coordination: listen for CLAIM_TERMINAL to smoothly transfer ownership
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(`sba_pos_coordination_${cleanTerm}`);
      channel.onmessage = (event) => {
        if (event.data?.type === 'CLAIM_TERMINAL') {
          // Another tab requested ownership: yield the lock cleanly
          if (releaseLockRef.current) {
            releaseLockRef.current();
            releaseLockRef.current = null;
          }
          setLockStatus('spectator');
          setLockError(`Terminal "${cleanTerm}" ownership was transferred to another active browser tab.`);
        }
      };
    } catch {
      // Ignore broadcast errors in restricted environments
    }

    return () => {
      channel?.close();
    };
  }, [cleanTerm]);

  // Explicit claim method that notifies other tabs to yield and acquires ownership
  const claimTerminalOwnership = useCallback(async () => {
    // 1. Release our own lock if any
    if (releaseLockRef.current) {
      releaseLockRef.current();
      releaseLockRef.current = null;
    }

    // 2. Broadcast yield signal to other tabs
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(`sba_pos_coordination_${cleanTerm}`);
        channel.postMessage({ type: 'CLAIM_TERMINAL' });
        channel.close();
      } catch {
        // Ignore
      }
    }

    // 3. Brief yield delay (60ms) to allow previous holder tab to complete lock release
    await new Promise((r) => setTimeout(r, 60));

    // 4. Acquire exclusive ownership
    acquireOwnership(true);
  }, [acquireOwnership, cleanTerm]);

  useEffect(() => {
    isMountedRef.current = true;
    acquireOwnership();

    return () => {
      isMountedRef.current = false;
      // Explicitly release lock on unmount or navigation
      if (releaseLockRef.current) {
        releaseLockRef.current();
        releaseLockRef.current = null;
      }
    };
  }, [acquireOwnership]);

  // ---------------------------------------------------------------------------------
  // 2. RESTORE PERSISTENT CART FROM LOCALSTORAGE (ON MOUNT)
  // ---------------------------------------------------------------------------------
  useEffect(() => {
    if (isInitializedRef.current || !store) return;
    isInitializedRef.current = true;

    try {
      const savedCartJson = store.getItem(cartStorageKey);
      if (savedCartJson) {
        const parsed = JSON.parse(savedCartJson) as PersistentCartState;
        // Validate stored session's terminalId matches current terminalId
        if (
          parsed.session &&
          parsed.session.checkoutSessionId &&
          parsed.session.sessionCreatedAt &&
          parsed.session.terminalId &&
          parsed.session.terminalId.toUpperCase() === cleanTerm
        ) {
          setSession(parsed.session);
          setCustomerTypeState(parsed.customerType || 'parchon');
          setCustomerState(parsed.customer || null);
          setItems(Array.isArray(parsed.items) ? parsed.items : []);
          setNotesState(parsed.notes || '');
        } else {
          console.warn(`Ignoring stored cart: terminal mismatch or invalid session data for terminal ${cleanTerm}`);
        }
      }
    } catch (err) {
      console.warn('Failed to deserialize persistent POS cart:', err);
    }
  }, [store, cartStorageKey, cleanTerm]);

  // ---------------------------------------------------------------------------------
  // 3. STORAGE SYNC & PERSISTENCE
  // ---------------------------------------------------------------------------------
  const saveCartToStorage = useCallback((
    currentSession: CheckoutSession,
    currentType: CustomerType,
    currentCustomer: CustomerDocument | null,
    currentItems: POSCartItem[],
    currentNotes: string
  ) => {
    if (!store) return;
    try {
      const stateToSave: PersistentCartState = {
        session: currentSession,
        customerType: currentType,
        customer: currentCustomer,
        items: currentItems,
        notes: currentNotes,
        lastUpdated: Date.now(),
      };
      store.setItem(cartStorageKey, JSON.stringify(stateToSave));
    } catch (err) {
      console.warn('Failed to serialize POS cart to localStorage:', err);
    }
  }, [store, cartStorageKey]);

  // Synchronize when other tabs update storage for this specific terminal
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === cartStorageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as PersistentCartState;
          if (
            parsed &&
            parsed.session &&
            parsed.session.terminalId &&
            parsed.session.terminalId.toUpperCase() === cleanTerm
          ) {
            setSession(parsed.session);
            setCustomerTypeState(parsed.customerType || 'parchon');
            setCustomerState(parsed.customer || null);
            setItems(Array.isArray(parsed.items) ? parsed.items : []);
            setNotesState(parsed.notes || '');
          }
        } catch {
          // Ignore parse errors from concurrent writes
        }
      } else if (e.key === cartStorageKey && !e.newValue) {
        // Cart was cleared in another tab after successful checkout for this terminal
        setItems([]);
        setNotesState('');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [cartStorageKey, cleanTerm]);

  // ---------------------------------------------------------------------------------
  // 4. PRICE RESOLUTION HELPER (USING PHASE 3 resolveEffectivePrice)
  // ---------------------------------------------------------------------------------
  const resolveItemPricing = useCallback((
    product: ProductDocument,
    targetCustomer: CustomerDocument | null,
    targetType: CustomerType,
    discountsMap: Map<string, CustomerDiscountDocument>
  ) => {
    // Construct effective customer object for pricing engine
    const effectiveCustomer: CustomerDocument = targetCustomer || {
      id: '',
      name: 'Counter Cash Customer',
      type: targetType,
      phone: '',
      creditLimit: 0,
      currentBalance: 0,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };

    const customDiscount = targetCustomer ? discountsMap.get(product.id) : null;
    const resolved = resolveEffectivePrice(product, effectiveCustomer, customDiscount);

    const unitPrice = roundMoney(resolved.basePrice);
    const discountAmount = roundMoney(resolved.savingsPerUnit);
    const discountRate = resolved.discountRatePercent;
    const effectivePrice = roundMoney(resolved.effectivePrice);

    return {
      unitPrice,
      discountRate,
      discountAmount,
      effectivePrice,
      appliedRuleType: resolved.appliedRuleType,
    };
  }, []);

  // ---------------------------------------------------------------------------------
  // 5. RECALCULATE ENTIRE CART (UPON CUSTOMER SWITCH OR DISCOUNT LOAD)
  // ---------------------------------------------------------------------------------
  const recalculateAllCartItems = useCallback((
    existingItems: POSCartItem[],
    newCustomer: CustomerDocument | null,
    newType: CustomerType,
    discountsMap: Map<string, CustomerDiscountDocument>
  ): POSCartItem[] => {
    return existingItems.map((item) => {
      // If item is not a book (stationery/notebook/register), preserve its direct selling rate intact
      if (item.classification && item.classification !== 'book') {
        const lineTotal = roundMoney(item.effectivePrice * item.quantity);
        return {
          ...item,
          lineTotal,
          discountRate: 0,
          discountAmount: 0,
        };
      }

      // If user manually entered/adjusted the customer discount on this bill, preserve it!
      // "never silently override the manually selected bill discount."
      if (item.isManualDiscount) {
        const lineTotal = roundMoney(item.effectivePrice * item.quantity);
        return {
          ...item,
          lineTotal,
        };
      }

      // Create minimal ProductDocument representation from item for price resolution
      const prodProxy: ProductDocument = {
        id: item.productId,
        sku: item.sku,
        title: item.productName,
        classification: 'book',
        categoryId: '',
        publisherName: item.publisherName,
        costPrice: item.costPrice,
        retailPrice: item.unitPrice,
        wholesalePrice: item.unitPrice,
        currentStock: item.availableStock,
        lowStockThreshold: 0,
        unit: 'piece',
        isActive: true,
        createdAt: '',
        updatedAt: '',
      };

      const pricing = resolveItemPricing(prodProxy, newCustomer, newType, discountsMap);
      const lineTotal = roundMoney(pricing.effectivePrice * item.quantity);

      return {
        ...item,
        unitPrice: pricing.unitPrice,
        discountRate: pricing.discountRate,
        discountAmount: pricing.discountAmount,
        effectivePrice: pricing.effectivePrice,
        lineTotal,
        appliedRuleType: pricing.appliedRuleType,
      };
    });
  }, [resolveItemPricing]);

  // ---------------------------------------------------------------------------------
  // 6. TOTALS COMPUTATION (ROUNDED MONETARY ARITHMETIC)
  // ---------------------------------------------------------------------------------
  const {
    subtotal,
    totalDiscount,
    grandTotal,
    totalItemCount,
    booksSubtotal,
    stationerySubtotal,
    booksEligibleDiscountBase,
  } = useMemo(() => {
    let sub = 0;
    let disc = 0;
    let count = 0;
    let bSub = 0;
    let sSub = 0;
    let bBase = 0;

    for (const item of items) {
      const isBook = item.classification === 'book';
      const rawLineSubtotal = roundMoney(item.unitPrice * item.quantity);
      const rawLineDiscount = isBook ? roundMoney(item.discountAmount * item.quantity) : 0;
      sub = roundMoney(sub + rawLineSubtotal);
      disc = roundMoney(disc + rawLineDiscount);
      count += item.quantity;

      if (isBook) {
        bSub = roundMoney(bSub + item.lineTotal);
        bBase = roundMoney(bBase + rawLineSubtotal);
      } else {
        sSub = roundMoney(sSub + item.lineTotal);
      }
    }

    const grand = Math.max(0, roundMoney(sub - disc));

    return {
      subtotal: sub,
      totalDiscount: disc,
      grandTotal: grand,
      totalItemCount: count,
      booksSubtotal: bSub,
      stationerySubtotal: sSub,
      booksEligibleDiscountBase: bBase,
    };
  }, [items]);

  // ---------------------------------------------------------------------------------
  // 7. CART MUTATIONS
  // ---------------------------------------------------------------------------------
  const addProduct = useCallback((product: ProductDocument, quantity = 1): CartOperationResult => {
    setCartError(null);

    // Multi-tab ownership guard
    if (lockStatus !== 'owner') {
      const err = lockStatus === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : lockStatus === 'unsupported'
        ? 'Register operations are disabled because Web Locks API is unavailable.'
        : 'Register is in read-only spectator mode. Only the owning tab can modify the cart.';
      setCartError(err);
      return { success: false, error: err };
    }

    if (!product || !product.id) {
      const err = 'Invalid product data.';
      setCartError(err);
      return { success: false, error: err };
    }

    const available = Number(product.currentStock) || 0;
    if (available <= 0) {
      const err = `Cannot add "${product.title}". Product is out of physical stock. Negative inventory is prohibited.`;
      setCartError(err);
      return { success: false, error: err };
    }

    const addQty = Math.floor(Number(quantity));
    if (isNaN(addQty) || addQty <= 0) {
      const err = 'Quantity must be at least 1.';
      setCartError(err);
      return { success: false, error: err };
    }

    const existingIndex = items.findIndex((i) => i.productId === product.id);
    let updatedItems: POSCartItem[];

    if (existingIndex >= 0) {
      const existing = items[existingIndex];
      const newQty = existing.quantity + addQty;

      if (newQty > available) {
        const err = `Cannot add ${addQty} more. Requested total (${newQty}) exceeds available physical stock (${available}).`;
        setCartError(err);
        return { success: false, error: err };
      }

      const updatedItem: POSCartItem = {
        ...existing,
        quantity: newQty,
        lineTotal: roundMoney(existing.effectivePrice * newQty),
      };

      updatedItems = [...items];
      updatedItems[existingIndex] = updatedItem;
    } else {
      if (addQty > available) {
        const err = `Requested quantity (${addQty}) exceeds available physical stock (${available}).`;
        setCartError(err);
        return { success: false, error: err };
      }

      // Authoritative publisherName snapshot: dedicated product.publisherName strictly, NO author fallback
      const publisherSnapshot =
        typeof product.publisherName === 'string' && product.publisherName.trim().length > 0
          ? product.publisherName.trim()
          : 'Unknown';

      const isBook = product.classification === 'book';
      const pricing = resolveItemPricing(product, customer, customerType, customDiscountsMap);
      const lineTotal = roundMoney(pricing.effectivePrice * addQty);

      const newItem: POSCartItem = {
        productId: product.id,
        productName: product.title,
        sku: product.sku,
        classification: product.classification || 'book',
        isDiscountEligible: isBook,
        publisherName: publisherSnapshot,
        seriesName: product.seriesName ? product.seriesName.trim() : undefined,
        targetClass: (product.targetClass || product.className) ? (product.targetClass || product.className)?.trim() : undefined,
        availableStock: available,
        costPrice: Number(product.costPrice) || 0,
        quantity: addQty,
        unitPrice: pricing.unitPrice,
        discountRate: isBook ? pricing.discountRate : 0,
        discountAmount: isBook ? pricing.discountAmount : 0,
        effectivePrice: pricing.effectivePrice,
        lineTotal,
        appliedRuleType: pricing.appliedRuleType,
      };

      updatedItems = [...items, newItem];
    }

    setItems(updatedItems);
    saveCartToStorage(session, customerType, customer, updatedItems, notes);
    return { success: true };
  }, [lockStatus, items, resolveItemPricing, customer, customerType, customDiscountsMap, session, notes, saveCartToStorage]);

  const addSyllabusSet = useCallback((
    courseItems: Array<{ product: ProductDocument; quantity: number }>
  ): { success: boolean; addedCount: number; errors: string[] } => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = lockStatus === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : lockStatus === 'unsupported'
        ? 'Register operations are disabled because Web Locks API is unavailable.'
        : 'Register is in read-only spectator mode. Only the owning tab can modify the cart.';
      setCartError(err);
      return { success: false, addedCount: 0, errors: [err] };
    }

    if (!courseItems || courseItems.length === 0) {
      return { success: false, addedCount: 0, errors: ['No items in syllabus set'] };
    }

    let currentCart = [...items];
    const errors: string[] = [];
    let addedCount = 0;

    for (const { product, quantity } of courseItems) {
      if (!product || !product.id) continue;
      const available = Number(product.currentStock) || 0;
      const addQty = Math.max(1, Math.floor(Number(quantity) || 1));

      if (available <= 0) {
        errors.push(`"${product.title}" is out of physical stock.`);
        continue;
      }

      const existingIndex = currentCart.findIndex((i) => i.productId === product.id);

      if (existingIndex >= 0) {
        const existing = currentCart[existingIndex];
        const newQty = existing.quantity + addQty;
        if (newQty > available) {
          errors.push(`"${product.title}": total requested (${newQty}) exceeds stock (${available}).`);
          continue;
        }
        currentCart[existingIndex] = {
          ...existing,
          quantity: newQty,
          lineTotal: roundMoney(existing.effectivePrice * newQty),
        };
        addedCount++;
      } else {
        if (addQty > available) {
          errors.push(`"${product.title}": quantity (${addQty}) exceeds stock (${available}).`);
          continue;
        }

        const publisherSnapshot =
          typeof product.publisherName === 'string' && product.publisherName.trim().length > 0
            ? product.publisherName.trim()
            : 'Unknown';

        const isBook = product.classification === 'book';
        const pricing = resolveItemPricing(product, customer, customerType, customDiscountsMap);
        const lineTotal = roundMoney(pricing.effectivePrice * addQty);

        currentCart.push({
          productId: product.id,
          productName: product.title,
          sku: product.sku,
          classification: product.classification || 'book',
          isDiscountEligible: isBook,
          publisherName: publisherSnapshot,
          seriesName: product.seriesName ? product.seriesName.trim() : undefined,
          targetClass: (product.targetClass || product.className) ? (product.targetClass || product.className)?.trim() : undefined,
          availableStock: available,
          costPrice: Number(product.costPrice) || 0,
          quantity: addQty,
          unitPrice: pricing.unitPrice,
          discountRate: isBook ? pricing.discountRate : 0,
          discountAmount: isBook ? pricing.discountAmount : 0,
          effectivePrice: pricing.effectivePrice,
          lineTotal,
          appliedRuleType: pricing.appliedRuleType,
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      setItems(currentCart);
      saveCartToStorage(session, customerType, customer, currentCart, notes);
    }

    return {
      success: addedCount > 0,
      addedCount,
      errors,
    };
  }, [lockStatus, items, resolveItemPricing, customer, customerType, customDiscountsMap, session, notes, saveCartToStorage]);

  const updateQuantity = useCallback((productId: string, newQuantity: number): CartOperationResult => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = lockStatus === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : lockStatus === 'unsupported'
        ? 'Register operations are disabled because Web Locks API is unavailable.'
        : 'Register is in read-only mode.';
      setCartError(err);
      return { success: false, error: err };
    }

    const targetQty = Math.floor(Number(newQuantity));
    if (isNaN(targetQty) || targetQty <= 0) {
      const err = 'Quantity must be at least 1 unit. To remove the item, click the remove button.';
      setCartError(err);
      return { success: false, error: err };
    }

    const index = items.findIndex((i) => i.productId === productId);
    if (index < 0) {
      const err = 'Item not found in cart.';
      setCartError(err);
      return { success: false, error: err };
    }

    const item = items[index];
    if (targetQty > item.availableStock) {
      const err = `Requested quantity (${targetQty}) exceeds available physical stock (${item.availableStock}).`;
      setCartError(err);
      return { success: false, error: err };
    }

    const updatedItem: POSCartItem = {
      ...item,
      quantity: targetQty,
      lineTotal: roundMoney(item.effectivePrice * targetQty),
    };

    const updatedItems = [...items];
    updatedItems[index] = updatedItem;

    setItems(updatedItems);
    saveCartToStorage(session, customerType, customer, updatedItems, notes);
    return { success: true };
  }, [lockStatus, items, session, customerType, customer, notes, saveCartToStorage]);

  const updateItemDiscount = useCallback((productId: string, discountRate: number): CartOperationResult => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = lockStatus === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : lockStatus === 'unsupported'
        ? 'Register operations are disabled because Web Locks API is unavailable.'
        : 'Register is in read-only mode.';
      setCartError(err);
      return { success: false, error: err };
    }

    const index = items.findIndex((i) => i.productId === productId);
    if (index < 0) {
      const err = 'Item not found in cart.';
      setCartError(err);
      return { success: false, error: err };
    }

    const item = items[index];
    if (item.classification !== 'book') {
      const err = 'Discounts can only be applied to Book products. Stationery items use direct selling rates.';
      setCartError(err);
      return { success: false, error: err };
    }

    const rate = Math.max(0, Math.min(100, Number(discountRate) || 0));
    const discountAmount = roundMoney(item.unitPrice * (rate / 100));
    const effectivePrice = Math.max(0, roundMoney(item.unitPrice - discountAmount));
    const lineTotal = roundMoney(effectivePrice * item.quantity);

    const updatedItem: POSCartItem = {
      ...item,
      discountRate: rate,
      discountAmount,
      effectivePrice,
      lineTotal,
      isManualDiscount: true,
      appliedRuleType: 'manual_override',
    };

    const updatedItems = [...items];
    updatedItems[index] = updatedItem;

    setItems(updatedItems);
    saveCartToStorage(session, customerType, customer, updatedItems, notes);
    return { success: true };
  }, [lockStatus, items, session, customerType, customer, notes, saveCartToStorage]);

  const updateItemPrice = useCallback((productId: string, newPrice: number): CartOperationResult => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = lockStatus === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : lockStatus === 'unsupported'
        ? 'Register operations are disabled because Web Locks API is unavailable.'
        : 'Register is in read-only mode.';
      setCartError(err);
      return { success: false, error: err };
    }

    const index = items.findIndex((i) => i.productId === productId);
    if (index < 0) {
      const err = 'Item not found in cart.';
      setCartError(err);
      return { success: false, error: err };
    }

    const item = items[index];
    const sanitizedPrice = Math.max(0, roundMoney(Number(newPrice) || 0));
    const lineTotal = roundMoney(sanitizedPrice * item.quantity);
    const isBook = item.classification === 'book';

    let updatedItem: POSCartItem;

    if (!isBook) {
      // For stationery / non-books: Direct selling price. Strictly 0 discount.
      updatedItem = {
        ...item,
        unitPrice: sanitizedPrice,
        effectivePrice: sanitizedPrice,
        discountAmount: 0,
        discountRate: 0,
        lineTotal,
        isManualDiscount: false,
        appliedRuleType: 'manual_override',
      };
    } else {
      // For books: Calculate discount rate against original MRP
      const base = item.unitPrice > 0 ? item.unitPrice : sanitizedPrice;
      const discountAmount = Math.max(0, roundMoney(base - sanitizedPrice));
      const discountRate = base > 0 ? Math.round((discountAmount / base) * 1000) / 10 : 0;

      updatedItem = {
        ...item,
        effectivePrice: sanitizedPrice,
        discountAmount,
        discountRate,
        lineTotal,
        isManualDiscount: true,
        appliedRuleType: 'manual_override',
      };
    }

    const updatedItems = [...items];
    updatedItems[index] = updatedItem;

    setItems(updatedItems);
    saveCartToStorage(session, customerType, customer, updatedItems, notes);
    return { success: true };
  }, [lockStatus, items, session, customerType, customer, notes, saveCartToStorage]);

  const applyGlobalDiscount = useCallback((discountRate: number): CartOperationResult => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = lockStatus === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : lockStatus === 'unsupported'
        ? 'Register operations are disabled because Web Locks API is unavailable.'
        : 'Register is in read-only mode.';
      setCartError(err);
      return { success: false, error: err };
    }

    if (items.length === 0) {
      return { success: true };
    }

    const rate = Math.max(0, Math.min(100, Number(discountRate) || 0));

    const updatedItems = items.map((item) => {
      // Books ONLY! Stationery items are 100% excluded from percentage discounts.
      if (item.classification !== 'book') {
        return item;
      }

      const discountAmount = roundMoney(item.unitPrice * (rate / 100));
      const effectivePrice = Math.max(0, roundMoney(item.unitPrice - discountAmount));
      const lineTotal = roundMoney(effectivePrice * item.quantity);
      return {
        ...item,
        discountRate: rate,
        discountAmount,
        effectivePrice,
        lineTotal,
        isManualDiscount: rate > 0,
        appliedRuleType: 'manual_override' as const,
      };
    });

    setItems(updatedItems);
    saveCartToStorage(session, customerType, customer, updatedItems, notes);
    return { success: true };
  }, [lockStatus, items, session, customerType, customer, notes, saveCartToStorage]);

  const applyGlobalDiscountAmount = useCallback((discountAmountTotal: number): CartOperationResult => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = 'Register is in read-only mode.';
      setCartError(err);
      return { success: false, error: err };
    }

    if (items.length === 0) return { success: true };

    const bookItems = items.filter((i) => i.classification === 'book');
    if (bookItems.length === 0) {
      const err = 'No eligible Book items in cart. Stationery cannot be discounted.';
      setCartError(err);
      return { success: false, error: err };
    }

    const booksSubtotal = bookItems.reduce((sum, item) => roundMoney(sum + item.unitPrice * item.quantity), 0);
    if (booksSubtotal <= 0) return { success: true };

    const requestedAmt = Math.max(0, Number(discountAmountTotal) || 0);
    if (requestedAmt > booksSubtotal) {
      const err = `Flat discount (PKR ${requestedAmt}) exceeds eligible Book subtotal (PKR ${booksSubtotal}). Cannot discount stationery lines.`;
      setCartError(err);
      return { success: false, error: err };
    }

    const effectiveRate = Math.round((requestedAmt / booksSubtotal) * 10000) / 100;

    return applyGlobalDiscount(effectiveRate);
  }, [items, applyGlobalDiscount, lockStatus]);

  const applySeriesDiscount = useCallback((params: {
    publisherName?: string;
    seriesName?: string;
    targetClass?: string;
    discountRate: number;
  }): { success: boolean; count: number; error?: string } => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = 'Register is in read-only mode.';
      setCartError(err);
      return { success: false, count: 0, error: err };
    }

    if (items.length === 0) {
      return { success: true, count: 0 };
    }

    const rate = Math.max(0, Math.min(100, Number(params.discountRate) || 0));
    const pubFilter = params.publisherName && params.publisherName !== 'all' ? params.publisherName.trim().toLowerCase() : null;
    const serFilter = params.seriesName && params.seriesName !== 'all' ? params.seriesName.trim().toLowerCase() : null;
    const clsFilter = params.targetClass && params.targetClass !== 'all' ? params.targetClass.trim().toLowerCase() : null;

    let matchedCount = 0;

    const updatedItems = items.map((item) => {
      // Stationery is strictly excluded from percentage discounts
      if (item.classification !== 'book') {
        return item;
      }

      if (pubFilter && (item.publisherName || '').trim().toLowerCase() !== pubFilter) {
        return item;
      }

      if (serFilter && (item.seriesName || '').trim().toLowerCase() !== serFilter) {
        return item;
      }

      if (clsFilter && (item.targetClass || '').trim().toLowerCase() !== clsFilter) {
        return item;
      }

      matchedCount++;
      const discountAmount = roundMoney(item.unitPrice * (rate / 100));
      const effectivePrice = Math.max(0, roundMoney(item.unitPrice - discountAmount));
      const lineTotal = roundMoney(effectivePrice * item.quantity);

      return {
        ...item,
        discountRate: rate,
        discountAmount,
        effectivePrice,
        lineTotal,
        isManualDiscount: rate > 0,
        appliedRuleType: 'manual_override' as const,
      };
    });

    if (matchedCount === 0) {
      const err = 'No matching books found in cart for selected criteria.';
      return { success: false, count: 0, error: err };
    }

    setItems(updatedItems);
    saveCartToStorage(session, customerType, customer, updatedItems, notes);
    return { success: true, count: matchedCount };
  }, [lockStatus, items, session, customerType, customer, notes, saveCartToStorage]);

  const parkCurrentCart = useCallback((customLabel?: string): { success: boolean; parkedId?: string; error?: string } => {
    if (lockStatus !== 'owner') {
      return { success: false, error: 'Register is in read-only mode.' };
    }
    if (items.length === 0) {
      return { success: false, error: 'Cart is empty. Add items before holding bill.' };
    }

    const parkedId = `PARK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const billNum = parkedCarts.length + 1;
    const custLabel = customer ? (customer.shopName || customer.name) : 'Counter Cash';
    const totalPcs = items.reduce((sum, i) => sum + i.quantity, 0);
    const defaultLabel = customLabel || `Hold #${billNum} (${custLabel} • ${totalPcs} pcs)`;

    const newParked: ParkedCart = {
      id: parkedId,
      label: defaultLabel,
      parkedAt: new Date().toISOString(),
      session,
      customerType,
      customer,
      items: [...items],
      notes,
      totalAmount: roundMoney(items.reduce((s, i) => s + i.lineTotal, 0)),
      itemCount: totalPcs,
    };

    const updatedParked = [...parkedCarts, newParked];
    setParkedCarts(updatedParked);
    saveParkedCartsToStorage(updatedParked);

    // Initialize fresh empty cart for next customer
    const newSession = createCheckoutSession(cleanTerm);
    setSession(newSession);
    setCustomerTypeState('parchon');
    setCustomerState(null);
    setItems([]);
    setNotesState('');
    saveCartToStorage(newSession, 'parchon', null, [], '');

    return { success: true, parkedId };
  }, [lockStatus, items, parkedCarts, customer, session, customerType, notes, saveParkedCartsToStorage, cleanTerm, saveCartToStorage]);

  const restoreParkedCart = useCallback((parkedId: string): { success: boolean; error?: string } => {
    if (lockStatus !== 'owner') {
      return { success: false, error: 'Register is in read-only mode.' };
    }

    const index = parkedCarts.findIndex((p) => p.id === parkedId);
    if (index < 0) {
      return { success: false, error: 'Held bill not found.' };
    }

    const targetParked = parkedCarts[index];
    const remainingParked = parkedCarts.filter((p) => p.id !== parkedId);

    // If current active cart has items, hold it as a parked bill so work is never lost!
    if (items.length > 0) {
      const activeParkedId = `PARK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const billNum = remainingParked.length + 1;
      const custLabel = customer ? (customer.shopName || customer.name) : 'Counter Cash';
      const totalPcs = items.reduce((sum, i) => sum + i.quantity, 0);
      const activeParked: ParkedCart = {
        id: activeParkedId,
        label: `Hold #${billNum} (${custLabel} • ${totalPcs} pcs)`,
        parkedAt: new Date().toISOString(),
        session,
        customerType,
        customer,
        items: [...items],
        notes,
        totalAmount: roundMoney(items.reduce((s, i) => s + i.lineTotal, 0)),
        itemCount: totalPcs,
      };
      remainingParked.unshift(activeParked);
    }

    setParkedCarts(remainingParked);
    saveParkedCartsToStorage(remainingParked);

    // Restore target parked cart into active register
    setSession(targetParked.session);
    setCustomerTypeState(targetParked.customerType);
    setCustomerState(targetParked.customer);
    setItems(targetParked.items);
    setNotesState(targetParked.notes || '');
    saveCartToStorage(
      targetParked.session,
      targetParked.customerType,
      targetParked.customer,
      targetParked.items,
      targetParked.notes || ''
    );

    return { success: true };
  }, [lockStatus, parkedCarts, items, customer, session, customerType, notes, saveParkedCartsToStorage, saveCartToStorage]);

  const discardParkedCart = useCallback((parkedId: string) => {
    const updated = parkedCarts.filter((p) => p.id !== parkedId);
    setParkedCarts(updated);
    saveParkedCartsToStorage(updated);
  }, [parkedCarts, saveParkedCartsToStorage]);

  const removeItem = useCallback((productId: string): CartOperationResult => {
    setCartError(null);

    if (lockStatus !== 'owner') {
      const err = lockStatus === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : lockStatus === 'unsupported'
        ? 'Register operations are disabled because Web Locks API is unavailable.'
        : 'Register is in read-only mode.';
      setCartError(err);
      return { success: false, error: err };
    }

    const filtered = items.filter((i) => i.productId !== productId);
    setItems(filtered);
    saveCartToStorage(session, customerType, customer, filtered, notes);
    return { success: true };
  }, [lockStatus, items, session, customerType, customer, notes, saveCartToStorage]);

  const clearCart = useCallback((): void => {
    if (lockStatus !== 'owner') return;
    setCartError(null);
    setItems([]);
    saveCartToStorage(session, customerType, customer, [], notes);
  }, [lockStatus, session, customerType, customer, notes, saveCartToStorage]);

  // ---------------------------------------------------------------------------------
  // 8. CUSTOMER SELECTION & DYNAMIC RE-PRICING
  // ---------------------------------------------------------------------------------
  const setCustomer = useCallback((
    newCustomer: CustomerDocument | null,
    targetType?: CustomerType
  ): void => {
    if (lockStatus !== 'owner') return;
    setCartError(null);

    const resolvedType = targetType || (newCustomer ? newCustomer.type : 'parchon');
    setCustomerState(newCustomer);
    setCustomerTypeState(resolvedType);

    // Recalculate all existing cart items against new customer hierarchy
    const recalculated = recalculateAllCartItems(items, newCustomer, resolvedType, customDiscountsMap);
    setItems(recalculated);

    saveCartToStorage(session, resolvedType, newCustomer, recalculated, notes);
  }, [lockStatus, items, customDiscountsMap, recalculateAllCartItems, session, notes, saveCartToStorage]);

  const setCustomDiscounts = useCallback((discounts: CustomerDiscountDocument[]): void => {
    if (lockStatus !== 'owner') return;
    const map = new Map<string, CustomerDiscountDocument>();
    for (const d of discounts) {
      map.set(d.productId, d);
    }
    setCustomDiscountsMap(map);

    // Recalculate cart items with the newly loaded discounts
    const recalculated = recalculateAllCartItems(items, customer, customerType, map);
    setItems(recalculated);
    saveCartToStorage(session, customerType, customer, recalculated, notes);
  }, [lockStatus, items, customer, customerType, recalculateAllCartItems, session, notes, saveCartToStorage]);

  const setNotes = useCallback((newNotes: string): void => {
    if (lockStatus !== 'owner') return;
    setNotesState(newNotes);
    saveCartToStorage(session, customerType, customer, items, newNotes);
  }, [lockStatus, session, customerType, customer, items, saveCartToStorage]);

  // ---------------------------------------------------------------------------------
  // 9. CHECKOUT CONFIRMATION HOOK (CLEARS SESSION ONLY AFTER COMMIT)
  // ---------------------------------------------------------------------------------
  const confirmCheckoutSuccess = useCallback((): void => {
    // 1. Clear session from saleService lifecycle for this terminal only
    clearCheckoutSession(cleanTerm, store || undefined);

    // 2. Remove cart draft from localStorage for this terminal only
    if (store) {
      store.removeItem(cartStorageKey);
    }

    // 3. Reset in-memory cart state
    setItems([]);
    setNotesState('');
    setCartError(null);

    // 4. Generate fresh session for the next transaction on this terminal
    const newSession = getOrCreateCheckoutSession(cleanTerm, store || undefined);
    setSession(newSession);
  }, [cleanTerm, cartStorageKey, store]);

  // ---------------------------------------------------------------------------------
  // 10. PAYLOAD PREPARATION FOR saleService.processSaleTransaction
  // ---------------------------------------------------------------------------------
  const prepareSalePayload = useCallback((
    cashTendered = 0,
    paymentMethod: 'cash' | 'bank_transfer' | 'credit' = 'cash',
    customDueDate?: string
  ): ProcessSaleInput => {
    if (items.length === 0) {
      throw new Error('Cannot prepare sale payload: Cart is empty.');
    }

    if (lockStatus !== 'owner') {
      throw new Error(
        lockStatus === 'pending'
          ? 'Cannot submit sale: register lock acquisition is still pending.'
          : 'Cannot submit sale from a secondary spectator tab. Claim terminal ownership first.'
      );
    }

    const now = new Date();
    const todayYY = String(now.getFullYear()).slice(-2);
    const todayMM = String(now.getMonth() + 1).padStart(2, '0');
    const todayDD = String(now.getDate()).padStart(2, '0');
    const todayYYMMDD = `${todayYY}${todayMM}${todayDD}`;
    const todayDateStr = now.toISOString().split('T')[0];

    let activeSession = session;
    const sessionMatch = activeSession.checkoutSessionId.match(/^(?:CS|SESS)-([0-9]{6})-/i);
    // If active session date is from an older calendar day, auto-rotate to a fresh session for today
    if (!sessionMatch || sessionMatch[1] !== todayYYMMDD) {
      activeSession = createCheckoutSession(cleanTerm, store || undefined);
      setSession(activeSession);
    }

    return {
      checkoutSessionId: activeSession.checkoutSessionId,
      sessionCreatedAt: activeSession.sessionCreatedAt,
      terminalId: activeSession.terminalId,
      saleDate: todayDateStr,
      customerType,
      customerId: customer?.id || '',
      customerName: customer ? (customer.shopName || customer.name) : 'Counter Cash Customer',
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        clientUnitPrice: i.unitPrice,
        clientDiscountRate: i.discountRate,
        clientSellingPrice: i.effectivePrice,
      })),
      cashTendered: roundMoney(cashTendered),
      paymentMethod,
      customDueDate: customDueDate?.trim() || undefined,
      notes: notes.trim() || undefined,
    };
  }, [items, lockStatus, session, customerType, customer, notes, cleanTerm, store]);

  const withSubmissionGuard = useCallback(async <T>(action: () => Promise<T>): Promise<T> => {
    if (isSubmittingRef.current) {
      throw new Error('A sale submission is already in progress on this tab.');
    }
    isSubmittingRef.current = true;
    try {
      return await action();
    } finally {
      isSubmittingRef.current = false;
    }
  }, []);

  return {
    // State
    session,
    customerType,
    customer,
    items,
    notes,
    subtotal,
    totalDiscount,
    grandTotal,
    totalItemCount,
    booksSubtotal,
    stationerySubtotal,
    booksEligibleDiscountBase,
    cartError,
    parkedCarts,
    lockStatus,
    lockError,
    isReadOnly: lockStatus !== 'owner',
    canCheckout: lockStatus === 'owner' && items.length > 0,

    // Actions
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
    setNotes,
    claimTerminalOwnership,
    confirmCheckoutSuccess,
    prepareSalePayload,
    withSubmissionGuard,
  };
};

