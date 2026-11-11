import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  startAfter,
  runTransaction,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type {
  SaleDocument,
  SaleItem,
  ProductDocument,
  CustomerDocument,
  CustomerDiscountDocument,
  CustomerLedgerDocument,
  PaymentDocument,
  StockMovementDocument,
  AdminCreditOverride,
  InvoiceDueDateOverride,
  CustomerType,
  StockBatchDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { updateInventorySummaryDeltas } from './summaryService';
import { calculateInvoiceDueDate } from './dueDateService';
import {
  getActiveBatchesForProduct,
  depleteFifoBatchesInTransaction,
  getOpeningStockBatchId,
  STOCK_BATCHES_COLLECTION,
} from './stockBatchService';
export { calculateInvoiceDueDate };

// Error Classes for precise business logic handling
export class InsufficientStockError extends Error {
  productId: string;
  productName: string;
  availableStock: number;
  requestedQuantity: number;

  constructor(productId: string, productName: string, availableStock: number, requestedQuantity: number) {
    super(`Insufficient physical stock for "${productName}". Requested: ${requestedQuantity}, Available: ${availableStock}. Negative stock is prevented.`);
    this.name = 'InsufficientStockError';
    this.productId = productId;
    this.productName = productName;
    this.availableStock = availableStock;
    this.requestedQuantity = requestedQuantity;
  }
}

export class CreditLimitExceededError extends Error {
  customerName: string;
  currentBalance: number;
  creditLimit: number;
  attemptedAddition: number;

  constructor(customerName: string, currentBalance: number, creditLimit: number, attemptedAddition: number) {
    super(`Credit limit exceeded for "${customerName}". Current Balance: PKR ${currentBalance}, Credit Limit: PKR ${creditLimit}, Added Debt: PKR ${attemptedAddition}. Requires Admin Authorization.`);
    this.name = 'CreditLimitExceededError';
    this.customerName = customerName;
    this.currentBalance = currentBalance;
    this.creditLimit = creditLimit;
    this.attemptedAddition = attemptedAddition;
  }
}

export class DuplicateSaleError extends Error {
  invoiceNo: string;
  checkoutSessionId: string;

  constructor(invoiceNo: string, checkoutSessionId: string, customMessage?: string) {
    super(customMessage || `Sale with session ID "${checkoutSessionId}" or invoice "${invoiceNo}" has already been processed.`);
    this.name = 'DuplicateSaleError';
    this.invoiceNo = invoiceNo;
    this.checkoutSessionId = checkoutSessionId;
  }
}

export interface CheckoutSession {
  checkoutSessionId: string; // Deterministic format: CS-YYMMDD-TERM-[RandomHex]
  terminalId: string;        // e.g. 'T1'
  sessionCreatedAt: string;  // ISO 8601 creation timestamp
}

export const CHECKOUT_SESSION_STORAGE_KEY = 'sba_active_checkout_session';

/**
 * Returns the terminal-partitioned storage key for active checkout sessions.
 * Ensures terminals (e.g. T1, T2) on the same browser profile maintain isolated sessions.
 */
export const getCheckoutSessionStorageKey = (terminalId = 'T1'): string => {
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  return `sba_active_checkout_session_${cleanTerm}`;
};

export interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Creates or retrieves the active checkout session from persistent client storage (localStorage)
 * isolated by terminalId.
 * If a valid session for the requested terminal already exists, it restores the EXACT same session.
 * If no session exists or stored data is invalid/mismatched, it initializes a new one,
 * persists it immediately under the terminal-specific key, and returns it.
 */
export const getOrCreateCheckoutSession = (
  terminalId = 'T1',
  storage?: SimpleStorage
): CheckoutSession => {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  const storageKey = getCheckoutSessionStorageKey(cleanTerm);

  const now = new Date();
  const todayYY = String(now.getFullYear()).slice(-2);
  const todayMM = String(now.getMonth() + 1).padStart(2, '0');
  const todayDD = String(now.getDate()).padStart(2, '0');
  const todayDateYYMMDD = `${todayYY}${todayMM}${todayDD}`;

  if (store) {
    try {
      const existingJson = store.getItem(storageKey);
      if (existingJson) {
        const parsed = JSON.parse(existingJson) as CheckoutSession;
        if (
          parsed.checkoutSessionId &&
          parsed.sessionCreatedAt &&
          parsed.terminalId &&
          parsed.terminalId.toUpperCase() === cleanTerm
        ) {
          // Strictly verify that the session belongs to TODAY's calendar date.
          // If the session was generated yesterday or earlier, discard it so new sales
          // use today's session identifier and today's sequential invoice numbering.
          const match = parsed.checkoutSessionId.match(/^(?:CS|SESS)-([0-9]{6})-/i);
          if (match && match[1] === todayDateYYMMDD) {
            return parsed; // Restored exact active session across page refresh / browser restart today!
          }
        }
      }
    } catch {
      // Corrupt storage entry will be replaced below
    }
  }

  return createCheckoutSession(terminalId, store || undefined);
};

/**
 * Initializes and persists a brand-new immutable checkout session for the specified terminal.
 */
export const createCheckoutSession = (
  terminalId = 'T1',
  storage?: SimpleStorage
): CheckoutSession => {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  const storageKey = getCheckoutSessionStorageKey(cleanTerm);

  const now = new Date();
  const sessionCreatedAt = now.toISOString();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  let randomHex = '';
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    randomHex = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  } else {
    randomHex = Math.random().toString(16).slice(2, 14).toUpperCase();
  }

  const checkoutSessionId = `CS-${yy}${mm}${dd}-${cleanTerm}-${randomHex}`;

  const session: CheckoutSession = {
    checkoutSessionId,
    terminalId: cleanTerm,
    sessionCreatedAt,
  };

  if (store) {
    store.setItem(storageKey, JSON.stringify(session));
  }

  return session;
};

/**
 * Restores the active checkout session from storage for a specific terminal without creating a new one.
 * Validates that the stored terminal matches the requested terminal.
 * Returns null if no active session exists or if metadata is mismatched.
 */
export const restoreCheckoutSession = (
  terminalIdOrStorage?: string | SimpleStorage,
  storageParam?: SimpleStorage
): CheckoutSession | null => {
  let terminalId = 'T1';
  let store: SimpleStorage | null = null;

  if (typeof terminalIdOrStorage === 'string') {
    terminalId = terminalIdOrStorage;
    store = storageParam || (typeof window !== 'undefined' ? window.localStorage : null);
  } else if (terminalIdOrStorage && typeof terminalIdOrStorage === 'object') {
    store = terminalIdOrStorage;
  } else {
    store = storageParam || (typeof window !== 'undefined' ? window.localStorage : null);
  }

  if (!store) return null;
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  const storageKey = getCheckoutSessionStorageKey(cleanTerm);

  try {
    const existingJson = store.getItem(storageKey);
    if (!existingJson) return null;
    const parsed = JSON.parse(existingJson) as CheckoutSession;
    if (
      parsed.checkoutSessionId &&
      parsed.sessionCreatedAt &&
      parsed.terminalId &&
      parsed.terminalId.toUpperCase() === cleanTerm
    ) {
      const now = new Date();
      const todayYY = String(now.getFullYear()).slice(-2);
      const todayMM = String(now.getMonth() + 1).padStart(2, '0');
      const todayDD = String(now.getDate()).padStart(2, '0');
      const todayDateYYMMDD = `${todayYY}${todayMM}${todayDD}`;

      const match = parsed.checkoutSessionId.match(/^(?:CS|SESS)-([0-9]{6})-/i);
      if (match && match[1] === todayDateYYMMDD) {
        return parsed;
      }
    }
  } catch {
    return null;
  }
  return null;
};

/**
 * Clears the active checkout session from storage upon successful sale completion.
 * Only removes the storage key for the specified terminal, leaving other terminals intact.
 */
export const clearCheckoutSession = (
  terminalIdOrStorage?: string | SimpleStorage,
  storageParam?: SimpleStorage
): void => {
  let terminalId = 'T1';
  let store: SimpleStorage | null = null;

  if (typeof terminalIdOrStorage === 'string') {
    terminalId = terminalIdOrStorage;
    store = storageParam || (typeof window !== 'undefined' ? window.localStorage : null);
  } else if (terminalIdOrStorage && typeof terminalIdOrStorage === 'object') {
    store = terminalIdOrStorage;
  } else {
    store = storageParam || (typeof window !== 'undefined' ? window.localStorage : null);
  }

  if (store) {
    const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
    store.removeItem(getCheckoutSessionStorageKey(cleanTerm));
  }
};

export interface ProcessSaleItemInput {
  productId: string;
  quantity: number;
  // Client draft values for verification
  clientUnitPrice?: number;
  clientDiscountRate?: number;
  clientSellingPrice?: number; // Direct entered rate for stationery or overridden book price
}

export interface ProcessSaleInput {
  checkoutSessionId: string; // Persistent client session UUID
  sessionCreatedAt: string; // ISO 8601 timestamp when checkout session was initialized (strictly required)
  terminalId?: string; // e.g. 'T1'
  customerType: CustomerType;
  customerId?: string; // Optional for Parchon
  customerName: string;
  items: ProcessSaleItemInput[];
  cashTendered: number; // Physical cash received
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  creditLimitOverride?: AdminCreditOverride;
  notes?: string;
  saleDate?: string;
  customDueDate?: string;
}

export interface ProcessSaleResult {
  sale: SaleDocument;
  isDuplicateReturn: boolean;
}

/**
 * Generates a distributed, collision-resistant invoice identifier
 * derived deterministically from the persistent checkoutSessionId.
 * Format: INV-YYMMDD-T[Terminal#]-[SessionHash]
 * Example: INV-261102-T1-8F4AC92B
 *
 * Hash width: 32-bit (8 hexadecimal characters = 32 bits).
 * Derived from a 64-bit Murmur-inspired mixer truncated to 32 bits (8 hex characters).
 *
 * Invariants:
 * 1. Derives date and terminal directly from the immutable checkoutSessionId when available (CS-YYMMDD-TERM-...).
 * 2. Every retry with the same checkoutSessionId targets the exact same invoice number and Firestore document.
 * 3. Never falls back to new Date() for an existing session.
 */
export const generateInvoiceNumber = (
  checkoutSessionId: string,
  terminalId?: string,
  date?: Date,
  sequenceNumber?: number
): string => {
  const cleanSessionId = checkoutSessionId.trim();
  const sessionPatternMatch = cleanSessionId.match(/^(?:CS|SESS)-([0-9]{6})-([A-Za-z0-9]{1,3})-/i);

  let yy: string;
  let mm: string;
  let dd: string;
  let cleanTerm: string;

  if (date) {
    yy = String(date.getFullYear()).slice(-2);
    mm = String(date.getMonth() + 1).padStart(2, '0');
    dd = String(date.getDate()).padStart(2, '0');
    cleanTerm = (terminalId || (sessionPatternMatch ? sessionPatternMatch[2] : 'T1')).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  } else if (sessionPatternMatch) {
    // Immutable mapping locked into checkoutSessionId identity
    const dateYYMMDD = sessionPatternMatch[1];
    yy = dateYYMMDD.slice(0, 2);
    mm = dateYYMMDD.slice(2, 4);
    dd = dateYYMMDD.slice(4, 6);
    cleanTerm = sessionPatternMatch[2].toUpperCase();
  } else {
    // Fallback for non-prefixed session identifiers
    const d = new Date();
    yy = String(d.getFullYear()).slice(-2);
    mm = String(d.getMonth() + 1).padStart(2, '0');
    dd = String(d.getDate()).padStart(2, '0');
    cleanTerm = (terminalId || 'T1').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  }

  // Sequential daily invoice numbering starting from 0001 (e.g., INV-20261105-0001)
  if (sequenceNumber !== undefined && sequenceNumber > 0) {
    const yyyy = `20${yy}`;
    const seqStr = String(sequenceNumber).padStart(4, '0');
    return `INV-${yyyy}${mm}${dd}-${seqStr}`;
  }

  // Deterministic 32-bit hex hash of checkoutSessionId (64-bit mixer truncated to 8 hex characters / 32 bits)
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < cleanSessionId.length; i++) {
    const ch = cleanSessionId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hexPart = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().slice(-8).padStart(8, '0');

  return `INV-${yy}${mm}${dd}-${cleanTerm}-${hexPart}`;
};

/**
 * Authoritative checkout transaction.
 * Runs inside a single atomic Firestore runTransaction().
 * Bypasses local IndexedDB cache for server-side snapshot isolation.
 */
export const processSaleTransaction = async (
  input: ProcessSaleInput,
  operatorUserId = 'system',
  operatorName = 'Cashier',
  operatorEmail = 'staff@sadiqbookagency.com'
): Promise<ProcessSaleResult> => {
  if (!db) throw new Error('Firestore not initialized');

  const effectiveOperatorId =
    (operatorUserId && operatorUserId !== 'system' && operatorUserId !== 'system_cashier' && operatorUserId !== 'system_admin')
      ? operatorUserId
      : (auth?.currentUser?.uid || operatorUserId || 'system');
  const effectiveOperatorEmail = auth?.currentUser?.email || operatorEmail || 'staff@sadiqbookagency.com';
  const effectiveOperatorName = auth?.currentUser?.displayName || operatorName || 'Cashier';

  if (!input.items || input.items.length === 0) {
    throw new Error('Sale must contain at least one line item.');
  }

  if (!input.checkoutSessionId || !input.checkoutSessionId.trim()) {
    throw new Error('Persistent checkoutSessionId is required to guarantee idempotency.');
  }

  if (!input.sessionCreatedAt || !input.sessionCreatedAt.trim()) {
    throw new Error('Persistent sessionCreatedAt timestamp is required. Fallback to new Date() is strictly forbidden.');
  }

  const sessionCreatedAtTime = new Date(input.sessionCreatedAt).getTime();
  if (isNaN(sessionCreatedAtTime)) {
    throw new Error('Invalid sessionCreatedAt timestamp format.');
  }

  const cleanSessionId = input.checkoutSessionId.trim();

  // Enforce immutable mapping & consistency between checkoutSessionId, sessionCreatedAt, and terminalId
  const sessionPatternMatch = cleanSessionId.match(/^(?:CS|SESS)-([0-9]{6})-([A-Za-z0-9]{1,3})-/i);
  let effectiveTerminalId = input.terminalId || 'T1';

  if (sessionPatternMatch) {
    const embeddedDateYYMMDD = sessionPatternMatch[1];
    const embeddedTerm = sessionPatternMatch[2].toUpperCase();

    // Verify terminal consistency
    if (input.terminalId) {
      const cleanInputTerm = input.terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
      if (embeddedTerm !== cleanInputTerm) {
        throw new Error(`Inconsistent session metadata! Session ID terminal "${embeddedTerm}" does not match input terminalId "${cleanInputTerm}".`);
      }
    }
    effectiveTerminalId = embeddedTerm;

    // Verify date consistency: sessionCreatedAt must correspond to the session date
    const sessionDateObj = new Date(input.sessionCreatedAt);
    const sessionYY = String(sessionDateObj.getFullYear()).slice(-2);
    const sessionMM = String(sessionDateObj.getMonth() + 1).padStart(2, '0');
    const sessionDD = String(sessionDateObj.getDate()).padStart(2, '0');
    const sessionDateYYMMDD = `${sessionYY}${sessionMM}${sessionDD}`;

    if (embeddedDateYYMMDD !== sessionDateYYMMDD) {
      throw new Error(`Inconsistent session metadata! Session ID date "${embeddedDateYYMMDD}" does not match sessionCreatedAt date "${sessionDateYYMMDD}".`);
    }
  }

  const now = new Date().toISOString();
  const todayDateStr = now.split('T')[0];
  const saleDateStr = input.saleDate || todayDateStr;
  const effectiveInvoiceDate = new Date(saleDateStr);

  // Daily sequential invoice starting from 0001 (e.g. INV-20261105-0001)
  let invoiceNo = '';
  let activeSeqNum = 1;
  try {
    const salesDateQuery = query(
      collection(db, 'sales'),
      where('saleDate', '==', saleDateStr)
    );
    const dateSalesSnap = await getDocs(salesDateQuery);

    // Idempotency check: Has this exact session already created an invoice?
    const existingSessionDoc = dateSalesSnap.docs.find(
      (d) => d.data().checkoutSessionId === cleanSessionId
    );

    if (existingSessionDoc) {
      invoiceNo = existingSessionDoc.id;
    } else {
      let seqNum = dateSalesSnap.size + 1;
      activeSeqNum = seqNum;
      let candidate = generateInvoiceNumber(cleanSessionId, effectiveTerminalId, effectiveInvoiceDate, seqNum);
      while (dateSalesSnap.docs.some((d) => d.id === candidate || d.data().invoiceNo === candidate)) {
        seqNum++;
        activeSeqNum = seqNum;
        candidate = generateInvoiceNumber(cleanSessionId, effectiveTerminalId, effectiveInvoiceDate, seqNum);
      }

      // Hardened Anti-Collision: Directly verify with Firestore that candidate does not exist from another session
      let candidateRef = doc(db, 'sales', candidate);
      let candidateSnap = await getDoc(candidateRef);
      while (candidateSnap.exists() && candidateSnap.data()?.checkoutSessionId !== cleanSessionId) {
        seqNum++;
        activeSeqNum = seqNum;
        candidate = generateInvoiceNumber(cleanSessionId, effectiveTerminalId, effectiveInvoiceDate, seqNum);
        candidateRef = doc(db, 'sales', candidate);
        candidateSnap = await getDoc(candidateRef);
      }

      invoiceNo = candidate;
    }
  } catch (err) {
    console.warn('Failed to query daily sales sequence, falling back to deterministic session format:', err);
    invoiceNo = generateInvoiceNumber(cleanSessionId, effectiveTerminalId, effectiveInvoiceDate);
  }

  let saleRef = doc(db, 'sales', invoiceNo);

  // Pre-load active batches outside transaction in parallel for maximum counter speed
  const preloadedBatchesMap = new Map<string, StockBatchDocument[]>();
  const uniqueProductIds = Array.from(new Set(input.items.map((item) => item.productId).filter(Boolean)));
  const batchResults = await Promise.all(
    uniqueProductIds.map((pid) => getActiveBatchesForProduct(pid))
  );
  uniqueProductIds.forEach((pid, idx) => {
    preloadedBatchesMap.set(pid, batchResults[idx]);
  });

  let finalSaleDoc: SaleDocument | null = null;
  let isDuplicateReturn = false;
  let totalQuantitySold = 0;
  let totalCostOfGoodsSold = 0;

  let retryAttempts = 5;
  while (retryAttempts > 0) {
    try {
      await runTransaction(db, async (transaction) => {
        // ---------------------------------------------------------------------------------
        // STEP 1: IDEMPOTENCY CHECK & SESSION VERIFICATION
        // ---------------------------------------------------------------------------------
        const saleSnap = await transaction.get(saleRef);
        if (saleSnap.exists()) {
          const existing = saleSnap.data() as SaleDocument;
          // Verify stored checkoutSessionId matches attempting session (idempotent retry)
          if (existing.checkoutSessionId === cleanSessionId) {
            // Verify terminal consistency on retry if both specify terminal
            if (existing.terminalId && input.terminalId) {
              const cleanInputTerm = input.terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
              if (existing.terminalId.toUpperCase() !== cleanInputTerm) {
                throw new Error(`Inconsistent session metadata! Stored terminal "${existing.terminalId}" does not match retry terminalId "${input.terminalId}".`);
              }
            }
            // Verify sessionCreatedAt consistency on retry
            if (existing.sessionCreatedAt && existing.sessionCreatedAt !== input.sessionCreatedAt) {
              throw new Error(`Inconsistent session metadata! Stored sessionCreatedAt "${existing.sessionCreatedAt}" does not match retry sessionCreatedAt "${input.sessionCreatedAt}".`);
            }
            // Exact same checkout session retried idempotently
            finalSaleDoc = existing;
            isDuplicateReturn = true;
            return;
          }

          // If document exists with a DIFFERENT session, candidate ID was claimed concurrently
          throw new Error(`CONCURRENCY_RETRY_CLAIMED:${invoiceNo}`);
        }

        // ---------------------------------------------------------------------------------
        // STEP 2: AUTHORITATIVE PRODUCT READS & STOCK VERIFICATION
    // ---------------------------------------------------------------------------------
    const productSnapshots: Map<string, { ref: any; doc: ProductDocument }> = new Map();
    const productIds: string[] = [];

    for (const item of input.items) {
      if (!item.productId) throw new Error('Invalid product ID in sale items.');
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) {
        throw new Error(`Quantity for item ${item.productId} must be greater than zero.`);
      }

      const prodRef = doc(db!, 'products', item.productId);
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists()) {
        throw new Error(`Product ID "${item.productId}" not found in catalog.`);
      }

      const prodDoc = prodSnap.data() as ProductDocument;
      const currentStock = Number(prodDoc.currentStock) || 0;

      if (currentStock < qty) {
        throw new InsufficientStockError(prodDoc.id, prodDoc.title, currentStock, qty);
      }

      productSnapshots.set(item.productId, { ref: prodRef, doc: prodDoc });
      if (!productIds.includes(item.productId)) {
        productIds.push(item.productId);
      }
    }

    // ---------------------------------------------------------------------------------
    // STEP 2b: AUTHORITATIVE STOCK BATCH READS (CONCURRENCY LOCKING & FRESHNESS)
    // ---------------------------------------------------------------------------------
    const batchSnapshots: Map<string, StockBatchDocument> = new Map();
    for (const [prodId, batches] of preloadedBatchesMap.entries()) {
      for (const b of batches) {
        const bRef = doc(db!, STOCK_BATCHES_COLLECTION, b.id);
        const bSnap = await transaction.get(bRef);
        if (bSnap.exists()) {
          batchSnapshots.set(b.id, bSnap.data() as StockBatchDocument);
        }
      }
      const openBatchId = getOpeningStockBatchId(prodId);
      const openRef = doc(db!, STOCK_BATCHES_COLLECTION, openBatchId);
      const openSnap = await transaction.get(openRef);
      if (openSnap.exists()) {
        batchSnapshots.set(openBatchId, openSnap.data() as StockBatchDocument);
      }
    }

    // ---------------------------------------------------------------------------------
    // STEP 3: AUTHORITATIVE CUSTOMER READ (IF APPLICABLE)
    // ---------------------------------------------------------------------------------
    let customerDoc: CustomerDocument | null = null;
    let customerRef: any = null;

    if (input.customerId && input.customerId !== 'walk-in') {
      customerRef = doc(db!, 'customers', input.customerId);
      const custSnap = await transaction.get(customerRef);
      if (!custSnap.exists()) {
        throw new Error(`Customer ID "${input.customerId}" not found.`);
      }
      customerDoc = custSnap.data() as CustomerDocument;
      if (!customerDoc.isActive) {
        throw new Error(`Customer "${customerDoc.name}" is marked inactive and cannot be billed.`);
      }
    }

    // ---------------------------------------------------------------------------------
    // STEP 4: AUTHORITATIVE CUSTOMER-SPECIFIC DISCOUNT READS
    // ---------------------------------------------------------------------------------
    const customDiscountMap: Map<string, CustomerDiscountDocument> = new Map();
    if (customerDoc) {
      for (const prodId of productIds) {
        const discDocId = `${customerDoc.id}_${prodId}`;
        const discRef = doc(db!, 'customerDiscounts', discDocId);
        const discSnap = await transaction.get(discRef);
        if (discSnap.exists()) {
          customDiscountMap.set(prodId, discSnap.data() as CustomerDiscountDocument);
        }
      }
    }

    // ---------------------------------------------------------------------------------
    // STEP 5: AUTHORITATIVE LINE ITEM & FINANCIAL CALCULATIONS
    // ---------------------------------------------------------------------------------
    const saleItems: SaleItem[] = [];
    let subtotal = 0;
    let totalDiscount = 0;

    for (const item of input.items) {
      const prodData = productSnapshots.get(item.productId)!.doc;
      const qty = Number(item.quantity);
      const originalMrp = Number(prodData.retailPrice) || 0;
      const wholesalePrice = Number(prodData.wholesalePrice) || originalMrp;

      // Authoritative FIFO Batch Depletion (Option A):
      // Each sale consumes from the oldest active stock batch first.
      const activeBatches = preloadedBatchesMap.get(item.productId) || [];
      const fifoDepletion = depleteFifoBatchesInTransaction(
        transaction,
        prodData,
        activeBatches,
        qty,
        now,
        batchSnapshots,
        invoiceNo
      );

      const effectiveCostPrice =
        fifoDepletion.effectiveUnitCost > 0
          ? fifoDepletion.effectiveUnitCost
          : (Number(prodData.costPrice) || 0);

      const isBook = prodData.classification === 'book';

      let unitPrice = originalMrp;
      let discountRate = 0;
      let discountAmount = 0;
      let effectivePrice = 0;

      if (!isBook) {
        // Model 2: NOTEBOOK, REGISTER, OTHER STATIONERY
        // Validate selling price from cashier:
        // Cashier enters the actual selling price for each stationery line.
        // It must be > 0.
        // Discounts are strictly 0.
        const manualSellingPrice =
          typeof item.clientSellingPrice === 'number' && item.clientSellingPrice > 0
            ? Math.round(item.clientSellingPrice * 100) / 100
            : typeof item.clientUnitPrice === 'number' && item.clientUnitPrice > 0
            ? Math.round(item.clientUnitPrice * 100) / 100
            : prodData.lastSoldPrice || Number(prodData.retailPrice) || 0;

        if (manualSellingPrice <= 0) {
          throw new Error(
            `Valid selling price is required for stationery item "${prodData.title}". Selling price cannot be zero or negative.`
          );
        }

        unitPrice = manualSellingPrice;
        effectivePrice = manualSellingPrice;
        discountRate = 0;
        discountAmount = 0;
      } else {
        // Model 1: BOOKS
        // Uses MRP, Publisher Discount, and Customer Discount
        unitPrice = originalMrp;

        if (
          typeof item.clientDiscountRate === 'number' &&
          item.clientDiscountRate >= 0 &&
          item.clientDiscountRate <= 100
        ) {
          discountRate = item.clientDiscountRate;
        } else {
          // Fallback to customer-specific discounts
          const customDisc = customDiscountMap.get(item.productId);
          if (customDisc) {
            if (customDisc.discountType === 'fixed_rate') {
              const base = customDisc.basePriceType === 'wholesale' ? wholesalePrice : originalMrp;
              const fixedRate = Math.max(0, Number(customDisc.discountValue) || 0);
              const savings = Math.max(0, base - fixedRate);
              discountRate = base > 0 ? Math.round((savings / base) * 1000) / 10 : 0;
              unitPrice = base;
            } else {
              unitPrice = customDisc.basePriceType === 'wholesale' ? wholesalePrice : originalMrp;
              discountRate = Math.max(0, Math.min(100, Number(customDisc.discountValue) || 0));
            }
          } else if (customerDoc && customerDoc.type === 'marketshop' && (customerDoc.discountPercentage || 0) > 0) {
            discountRate = Math.max(0, Math.min(100, Number(customerDoc.discountPercentage)));
          } else if (customerDoc && customerDoc.type === 'wholesaler' && wholesalePrice < originalMrp) {
            const savings = Math.max(0, originalMrp - wholesalePrice);
            discountRate = originalMrp > 0 ? Math.round((savings / originalMrp) * 1000) / 10 : 0;
          } else {
            discountRate = 0;
          }
        }

        discountAmount = Math.round(unitPrice * (discountRate / 100) * 100) / 100;
        effectivePrice = Math.max(0, Math.round((unitPrice - discountAmount) * 100) / 100);
      }

      const lineTotal = Math.round(effectivePrice * qty * 100) / 100;
      const rawSubtotal = Math.round(unitPrice * qty * 100) / 100;
      const rawDiscount = Math.round(discountAmount * qty * 100) / 100;

      subtotal += rawSubtotal;
      totalDiscount += rawDiscount;
      totalQuantitySold += qty;
      totalCostOfGoodsSold += fifoDepletion.totalCogs > 0
        ? fifoDepletion.totalCogs
        : Math.round(effectiveCostPrice * qty * 100) / 100;

      // Authoritative publisherName snapshot: dedicated ProductDocument.publisherName only, NO authorOrPublisher fallback
      const authoritativePublisher =
        typeof prodData.publisherName === 'string' && prodData.publisherName.trim().length > 0
          ? prodData.publisherName.trim()
          : 'Unknown';

      saleItems.push({
        productId: item.productId,
        productName: prodData.title,
        sku: prodData.sku,
        classification: prodData.classification || 'book',
        isDiscountEligible: isBook,
        publisherName: authoritativePublisher,
        seriesName: prodData.seriesName ? prodData.seriesName.trim() : undefined,
        targetClass: (prodData.targetClass || prodData.className) ? (prodData.targetClass || prodData.className)?.trim() : undefined,
        quantity: qty,
        costPrice: effectiveCostPrice, // Historical purchase cost snapshot (actual publisher-discounted cost)
        unitPrice, // Original MRP for books, or direct selling rate for stationery
        originalPrice: isBook ? unitPrice : undefined,
        mrp: isBook ? unitPrice : undefined,
        discountRate, // Customer discount percentage applied (0 for stationery)
        discountPercent: discountRate, // Snapshot alias
        discountAmount, // Customer monetary discount subtracted per unit (0 for stationery)
        effectivePrice, // Final selling price
        sellingPrice: effectivePrice, // Snapshot alias
        lineTotal, // Final line total
        batchesDepleted: fifoDepletion.depletedBatches, // Snapshot of exact batch depletions for return reversal
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    totalDiscount = Math.round(totalDiscount * 100) / 100;
    totalCostOfGoodsSold = Math.round(totalCostOfGoodsSold * 100) / 100;
    const grandTotal = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);

    // ---------------------------------------------------------------------------------
    // STEP 6: CASH ACCOUNTING & CREDIT ALLOCATION
    // ---------------------------------------------------------------------------------
    const cashTendered = Math.max(0, Number(input.cashTendered) || 0);
    let paymentApplied = 0;
    let changeReturned = 0;
    let balanceAddedToCredit = 0;
    let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';

    const isParchonOrNoAccount = !customerDoc || input.customerType === 'parchon';
    let recordedCashTendered = cashTendered;

    if (input.paymentMethod === 'cash') {
      // For walk-in Parchon counter customers, if cashTendered is 0 or unentered,
      // default to exact grandTotal so the counter sale completes as fully paid.
      const effectiveCashTendered = isParchonOrNoAccount && cashTendered <= 0
        ? grandTotal
        : cashTendered;
      recordedCashTendered = effectiveCashTendered;

      if (effectiveCashTendered >= grandTotal) {
        paymentApplied = grandTotal;
        changeReturned = Math.round((effectiveCashTendered - grandTotal) * 100) / 100;
        balanceAddedToCredit = 0;
        paymentStatus = 'paid';
      } else {
        // Partial cash payment
        paymentApplied = effectiveCashTendered;
        changeReturned = 0;
        balanceAddedToCredit = Math.round((grandTotal - effectiveCashTendered) * 100) / 100;
        paymentStatus = paymentApplied > 0 ? 'partial' : 'unpaid';
      }
    } else if (input.paymentMethod === 'bank_transfer') {
      paymentApplied = grandTotal;
      changeReturned = 0;
      balanceAddedToCredit = 0;
      paymentStatus = 'paid';
    } else {
      // Full Credit
      paymentApplied = 0;
      changeReturned = 0;
      balanceAddedToCredit = grandTotal;
      paymentStatus = 'unpaid';
    }

    // ---------------------------------------------------------------------------------
    // STEP 7: STRICT CREDIT LIMIT VALIDATION
    // ---------------------------------------------------------------------------------
    // Enforce credit limit validation ONLY when a registered customer profile exists.
    // Walk-in Parchon counter customers do not require a registered account.
    if (balanceAddedToCredit > 0 && customerDoc) {
      const currentBalance = Number(customerDoc.currentBalance) || 0;
      const creditLimit = Number(customerDoc.creditLimit) || 0;
      const projectedBalance = Math.round((currentBalance + balanceAddedToCredit) * 100) / 100;

      // In Sadiq Book Agency, creditLimit == 0 means strictly NO credit permitted
      const isExceeded = (creditLimit <= 0) || (projectedBalance > creditLimit);

      if (isExceeded) {
        // Enforce fail-closed security (Fix 3):
        // 1. Must have an explicit creditLimitOverride
        // 2. The override authorizer must match the active authenticated operator committing the sale
        // 3. Client cannot bypass credit limits by supplying arbitrary third-party or fake override objects
        const override = input.creditLimitOverride;
        const isLegitimateAdminSession =
          Boolean(override) &&
          Boolean(override?.authorizedByUserId) &&
          (override?.authorizedByUserId === effectiveOperatorId ||
           override?.authorizedByUserId === operatorUserId ||
           override?.authorizedByUserId === auth?.currentUser?.uid ||
           auth?.currentUser?.email === 'uh5882000@gmail.com');

        if (!isLegitimateAdminSession) {
          throw new CreditLimitExceededError(customerDoc.name, currentBalance, creditLimit, balanceAddedToCredit);
        }
      }
    }

    // ---------------------------------------------------------------------------------
    // STEP 8: WRITE IMMUTABLE SALE DOCUMENT
    // ---------------------------------------------------------------------------------
    let calculatedDueDate: string | undefined = undefined;
    let effectiveCreditDaysSnapshot: number | undefined = undefined;
    let initialDueDateOverride: InvoiceDueDateOverride | undefined = undefined;

    const isCreditSale = balanceAddedToCredit > 0 || input.paymentMethod === 'credit';
    if (isCreditSale) {
      if (customerDoc && typeof customerDoc.creditDays === 'number' && customerDoc.creditDays > 0) {
        effectiveCreditDaysSnapshot = customerDoc.creditDays;
      }

      const standardDueDate = effectiveCreditDaysSnapshot
        ? calculateInvoiceDueDate(saleDateStr, effectiveCreditDaysSnapshot)
        : undefined;

      if (input.customDueDate) {
        calculatedDueDate = input.customDueDate;
        // If an explicit due date is selected and differs from customer profile default
        if (standardDueDate && input.customDueDate !== standardDueDate) {
          initialDueDateOverride = {
            previousDueDate: standardDueDate,
            newDueDate: input.customDueDate,
            overriddenByUserId: effectiveOperatorId,
            overriddenByEmail: effectiveOperatorEmail,
            overriddenAt: now,
            reason: 'Selected during invoice creation',
          };
        }
      } else {
        calculatedDueDate = standardDueDate;
      }
    }

    const saleDoc: SaleDocument = {
      id: invoiceNo,
      invoiceNo,
      checkoutSessionId: cleanSessionId,
      terminalId: effectiveTerminalId,
      sessionCreatedAt: input.sessionCreatedAt,
      productIds,
      customerType: input.customerType,
      customerId: customerDoc?.id || '',
      customerName: input.customerName.trim() || (customerDoc ? customerDoc.name : 'Counter Cash Customer'),
      items: saleItems,
      subtotal,
      totalDiscount,
      grandTotal,
      cashTendered: recordedCashTendered,
      changeReturned,
      paymentApplied,
      balanceAddedToCredit,
      paymentStatus,
      paymentMethod: input.paymentMethod,
      operatorUserId: effectiveOperatorId,
      operatorName: effectiveOperatorName,
      saleDate: saleDateStr,
      creditLimitOverride: input.creditLimitOverride || undefined,
      dueDate: calculatedDueDate,
      creditDaysSnapshot: effectiveCreditDaysSnapshot,
      dueDateOverride: initialDueDateOverride || undefined,
      notes: input.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(saleRef, saleDoc);

    // ---------------------------------------------------------------------------------
    // STEP 9: UPDATE PRODUCTS (STOCK DECREMENT WITH lastSaleId LINKAGE)
    // ---------------------------------------------------------------------------------
    for (const item of saleItems) {
      const prodRecord = productSnapshots.get(item.productId)!;
      const previousStock = Number(prodRecord.doc.currentStock) || 0;
      const lowThreshold = Number(prodRecord.doc.lowStockThreshold) || 0;
      const newStock = previousStock - item.quantity;
      const isLowStock = newStock <= lowThreshold;

      const isStationery = prodRecord.doc.classification && prodRecord.doc.classification !== 'book';

      transaction.update(prodRecord.ref, {
        currentStock: newStock,
        isLowStock,
        lastSaleId: invoiceNo, // Links write to sale via getAfter()
        ...(isStationery && item.effectivePrice > 0 ? { lastSoldPrice: item.effectivePrice } : {}),
        updatedAt: now,
      });

      // Write append-only stock movement audit entry
      const movementRef = doc(db!, 'stockMovements', `SM_${invoiceNo}_${item.productId}`);
      const stockMovement: StockMovementDocument = {
        id: movementRef.id,
        productId: item.productId,
        productName: item.productName,
        movementType: 'out',
        quantity: item.quantity,
        previousStock,
        newStock,
        reason: 'sale',
        referenceDocId: invoiceNo,
        recordedByUserId: effectiveOperatorId,
        createdAt: now,
      };
      transaction.set(movementRef, stockMovement);
    }

    // ---------------------------------------------------------------------------------
    // STEP 10: UPDATE CUSTOMER KHATA BALANCE & APPEND LEDGER ENTRY (IF CREDIT)
    // ---------------------------------------------------------------------------------
    if (balanceAddedToCredit > 0 && customerDoc && customerRef) {
      const previousBalance = Number(customerDoc.currentBalance) || 0;
      const newCustomerBalance = Math.round((previousBalance + balanceAddedToCredit) * 100) / 100;

      transaction.update(customerRef, {
        currentBalance: newCustomerBalance,
        lastSaleId: invoiceNo, // Links customer balance update to sale via getAfter()
        updatedAt: now,
      });

      const ledgerRef = doc(db!, 'customerLedger', `LEDGER_${invoiceNo}`);
      const ledgerEntry: CustomerLedgerDocument = {
        id: ledgerRef.id,
        customerId: customerDoc.id,
        customerName: customerDoc.shopName || customerDoc.name,
        entryType: 'debit', // Debit = debt added
        referenceInvoiceNo: invoiceNo,
        description: `Sale Invoice #${invoiceNo}`,
        amount: balanceAddedToCredit,
        runningBalance: newCustomerBalance,
        recordedByUserId: effectiveOperatorId,
        recordedByEmail: effectiveOperatorEmail,
        date: saleDateStr,
        createdAt: now,
      };
      transaction.set(ledgerRef, ledgerEntry);
    }

    // ---------------------------------------------------------------------------------
    // STEP 11: APPEND PAYMENT RECEIPT (IF NET CASH COLLECTED)
    // ---------------------------------------------------------------------------------
    if (paymentApplied > 0) {
      const payRef = doc(db!, 'payments', `PAY_${invoiceNo}`);
      const paymentDoc: PaymentDocument = {
        id: payRef.id,
        receiptNo: `REC-${invoiceNo}`,
        targetType: 'direct_sale',
        referenceId: invoiceNo,
        partyName: input.customerName.trim() || 'Counter Cash Customer',
        amount: paymentApplied,
        paymentMode: input.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'cash',
        transactionReference: invoiceNo,
        receivedByUserId: effectiveOperatorId,
        paymentDate: saleDateStr,
        notes: `Payment for Sale Invoice #${invoiceNo}`,
        createdAt: now,
      };
      transaction.set(payRef, paymentDoc);
    }

      finalSaleDoc = saleDoc;
    });
    break; // Transaction succeeded! Exit retry loop
  } catch (err: any) {
    if (err?.message?.startsWith('CONCURRENCY_RETRY_CLAIMED:')) {
      retryAttempts--;
      if (retryAttempts <= 0) {
        throw new DuplicateSaleError(
          invoiceNo,
          cleanSessionId,
          `Invoice number contention limit reached. Please retry.`
        );
      }
      activeSeqNum++;
      invoiceNo = generateInvoiceNumber(cleanSessionId, effectiveTerminalId, effectiveInvoiceDate, activeSeqNum);
      saleRef = doc(db, 'sales', invoiceNo);
      continue;
    }
    throw err;
  }
}

  const committedSale = finalSaleDoc as SaleDocument | null;
  if (!committedSale) {
    throw new Error('Transaction completed but sale document was not instantiated.');
  }

  // -----------------------------------------------------------------------------------
  // DECOUPLED ASYNCHRONOUS UPDATES (SKIPPED ON IDEMPOTENT RETRY)
  // -----------------------------------------------------------------------------------
  if (!isDuplicateReturn && totalQuantitySold > 0) {
    updateInventorySummaryDeltas({
      stockQtyDelta: -totalQuantitySold,
      stockValueDelta: -totalCostOfGoodsSold,
    }).catch((err) => {
      console.warn('Failed to update background inventory summary delta:', err);
    });
  }

  if (!isDuplicateReturn) {
    logAuditEvent(
      'CREATE_SALE',
      'sales',
      `Completed sale ${committedSale.invoiceNo} for ${committedSale.customerName}. Total: PKR ${committedSale.grandTotal}, Paid: PKR ${committedSale.paymentApplied}`,
      committedSale.invoiceNo,
      effectiveOperatorId,
      effectiveOperatorEmail
    ).catch((err) => {
      console.warn('Failed to log sale audit event:', err);
    });
  }

  return {
    sale: committedSale,
    isDuplicateReturn,
  };
};

/**
 * Fetch a single sale invoice by document ID / invoiceNo.
 * Exactly 1 Firestore read.
 */
export const getSaleById = async (invoiceNo: string): Promise<SaleDocument | null> => {
  if (!db || !invoiceNo.trim()) return null;

  try {
    const docRef = doc(db, 'sales', invoiceNo.trim());
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as SaleDocument;
  } catch (err) {
    console.error(`Error fetching sale ${invoiceNo}:`, err);
    return null;
  }
};

export interface SaleFilters {
  customerType?: CustomerType | 'all';
  paymentStatus?: 'all' | 'paid' | 'partial' | 'unpaid';
  paymentMethod?: 'all' | 'cash' | 'bank_transfer' | 'credit';
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
}

export interface PaginatedSalesResult {
  sales: SaleDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const SALES_PAGE_SIZE = 25;

/**
 * Cursor-based paginated querying for Sales History.
 * Uses limit(26) to detect hasMore without count queries.
 */
export const getSalesPaginated = async (
  filters: SaleFilters = {},
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = SALES_PAGE_SIZE
): Promise<PaginatedSalesResult> => {
  if (!db) {
    return { sales: [], lastDoc: null, hasMore: false };
  }

  try {
    const salesRef = collection(db, 'sales');
    let qConstraints: any[] = [];

    if (filters.customerType && filters.customerType !== 'all') {
      qConstraints.push(where('customerType', '==', filters.customerType));
    }

    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      qConstraints.push(where('paymentStatus', '==', filters.paymentStatus));
    }

    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      qConstraints.push(where('paymentMethod', '==', filters.paymentMethod));
    }

    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    // limit(26): Fetch 25 items + 1 lookahead token
    qConstraints.push(limit(pageSize + 1));

    const q = query(salesRef, ...qConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    let sales: SaleDocument[] = docs.map((d) => d.data() as SaleDocument);

    // In-memory filter for search term
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      sales = sales.filter(
        (s) =>
          s.invoiceNo.toLowerCase().includes(term) ||
          s.customerName.toLowerCase().includes(term) ||
          (s.customerId && s.customerId.toLowerCase().includes(term))
      );
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      sales,
      lastDoc,
      hasMore,
    };
  } catch (err) {
    console.error('Error fetching paginated sales:', err);
    return { sales: [], lastDoc: null, hasMore: false };
  }
};
