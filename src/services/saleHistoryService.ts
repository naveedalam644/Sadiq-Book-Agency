import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  SaleDocument,
  SaleReturnDocument,
  SaleReturnItem,
  ReturnItemCondition,
  SaleReturnSummaryDocument,
  SaleReturnSummaryItem,
  PaymentDocument,
  ProductDocument,
  CustomerDocument,
  CustomerLedgerDocument,
  StockMovementDocument,
  CustomerType,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { updateInventorySummaryDeltas } from './summaryService';
import {
  restoreBatchesInTransaction,
  getOpeningStockBatchId,
  STOCK_BATCHES_COLLECTION,
} from './stockBatchService';
import type { StockBatchDocument } from '../types/database';

export interface SalesHistoryFilters {
  searchTerm?: string;
  startDate?: string;
  endDate?: string;
  customerId?: string;
  customerType?: CustomerType | 'all';
  paymentStatus?: 'all' | 'paid' | 'partial' | 'unpaid';
}

export interface PaginatedSalesHistoryResult {
  sales: SaleDocument[];
  hasMore: boolean;
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
}

export const SALES_HISTORY_PAGE_SIZE = 20;

/**
 * Fetches bounded and paginated sales history.
 * Cost Protection:
 * - Employs limit(pageSize + 1).
 * - Uses cursor-based pagination (startAfter).
 * - Maximum reads per request: 21.
 */
export const getSalesHistoryPaginated = async (
  filters: SalesHistoryFilters = {},
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = SALES_HISTORY_PAGE_SIZE
): Promise<PaginatedSalesHistoryResult> => {
  if (!db) {
    return { sales: [], hasMore: false, nextCursor: null };
  }

  try {
    const salesRef = collection(db, 'sales');
    const constraints: any[] = [];

    // Query-level exact filters (Fix 8):
    if (filters.customerId) {
      constraints.push(where('customerId', '==', filters.customerId));
    } else if (filters.customerType && filters.customerType !== 'all') {
      constraints.push(where('customerType', '==', filters.customerType));
    }

    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      constraints.push(where('paymentStatus', '==', filters.paymentStatus));
    }

    // Default order by createdAt DESC
    constraints.push(orderBy('createdAt', 'desc'));

    if (cursorDoc) {
      constraints.push(startAfter(cursorDoc));
    }

    constraints.push(limit(pageSize + 1));

    const q = query(salesRef, ...constraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    let sales: SaleDocument[] = docs.map((d) => ({
      ...(d.data() as SaleDocument),
      id: d.id,
    }));

    // Client-side text filter for fuzzy invoice search or customer name filter
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      sales = sales.filter(
        (s) =>
          s.invoiceNo.toLowerCase().includes(term) ||
          s.customerName.toLowerCase().includes(term) ||
          (s.terminalId && s.terminalId.toLowerCase().includes(term))
      );
    }

    if (filters.startDate) {
      sales = sales.filter((s) => s.saleDate >= filters.startDate!.split('T')[0]);
    }

    if (filters.endDate) {
      sales = sales.filter((s) => s.saleDate <= filters.endDate!.split('T')[0] + '\uf8ff');
    }

    const nextCursor = hasMore ? docs[docs.length - 1] : null;

    return {
      sales,
      hasMore,
      nextCursor,
    };
  } catch (err) {
    console.error('Error fetching sales history:', err);
    return { sales: [], hasMore: false, nextCursor: null };
  }
};

/**
 * Retrieves a single sale document by exact invoice number.
 * O(1) direct document read: Costs exactly 1 Firestore read.
 */
export const getSaleByInvoiceNo = async (invoiceNo: string): Promise<SaleDocument | null> => {
  if (!db || !invoiceNo.trim()) return null;

  try {
    const docRef = doc(db, 'sales', invoiceNo.trim());
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { ...(snap.data() as SaleDocument), id: snap.id };
  } catch (err) {
    console.error(`Error fetching sale ${invoiceNo}:`, err);
    return null;
  }
};

/**
 * Retrieves all sales returns executed for a given sale invoice.
 */
export const getSaleReturnsForSale = async (originalInvoiceNo: string): Promise<SaleReturnDocument[]> => {
  if (!db || !originalInvoiceNo.trim()) return [];

  try {
    const q = query(
      collection(db, 'salesReturns'),
      where('originalInvoiceNo', '==', originalInvoiceNo.trim()),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      ...(d.data() as SaleReturnDocument),
      id: d.id,
    }));
  } catch (err) {
    console.error(`Error fetching returns for sale ${originalInvoiceNo}:`, err);
    return [];
  }
};

/**
 * Retrieves the authoritative transactional return summary for a sale invoice.
 * Exact 1 Firestore document read.
 */
export const getSaleReturnSummary = async (
  invoiceNo: string
): Promise<SaleReturnSummaryDocument | null> => {
  if (!db || !invoiceNo.trim()) return null;

  try {
    const docRef = doc(db, 'saleReturnSummaries', invoiceNo.trim());
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as SaleReturnSummaryDocument;
  } catch (err) {
    console.error(`Error fetching return summary for sale ${invoiceNo}:`, err);
    return null;
  }
};

export interface ProcessReturnItemInput {
  productId: string;
  quantity: number;
  condition?: ReturnItemCondition; // 'saleable' (restocked) | 'damaged' (not restocked)
}

export interface ProcessReturnInput {
  originalInvoiceNo: string;
  items: ProcessReturnItemInput[];
  refundMethod: 'cash' | 'credit_deduction';
  reason: string;
  returnDate?: string;
  idempotencyKey?: string; // Optional client idempotency key to prevent accidental double-submits
}

/**
 * Processes a Sales Return atomically using a Firestore Transaction.
 * Concurrency & Integrity Invariants (Hardened Fix 1 & Fix 4):
 * 1. Transactional Mutual Exclusion: Authoritative per-sale return summary (`saleReturnSummaries/{invoiceNo}`)
 *    is locked and read INSIDE the transaction. Concurrent attempts conflict or retry safely.
 * 2. Over-Return Prevention: `requestedQty + previouslyReturnedQty <= soldQty` validated inside transaction.
 * 3. Original Sale Immutability: Original sale invoice is never updated or deleted.
 * 4. Cash Outflow Voucher (Fix 4): Cash refunds atomically create a payment voucher with `targetType: 'sales_refund'`.
 * 5. Automatic Inventory Restocking (Phase 4): Saleable returned items automatically increase product stock.
 *    Damaged / unsaleable returned items are NOT added to saleable stock.
 * 6. Khata Adjustment (Phase 3): Customer debt balance reduced; customer advances / credit notes recorded if balance <= 0.
 */
export const processSaleReturnTransaction = async (
  input: ProcessReturnInput,
  operatorUserId = 'system',
  operatorEmail = 'cashier@sadiqbookagency.com'
): Promise<SaleReturnDocument> => {
  if (!db) throw new Error('Firestore is not initialized.');

  const originalSale = await getSaleByInvoiceNo(input.originalInvoiceNo);
  if (!originalSale) {
    throw new Error(`Original sale invoice "${input.originalInvoiceNo}" not found.`);
  }

  // Validate Khata Adjustment eligibility
  if (input.refundMethod === 'credit_deduction' && !originalSale.customerId) {
    throw new Error(
      `Cannot adjust Khata: Original sale "${input.originalInvoiceNo}" has no registered customer account (walk-in cash sale). Please select Cash Refund.`
    );
  }

  // Pre-filter positive requested quantities
  const activeReturnRequests = input.items.filter((item) => item.quantity > 0);
  if (activeReturnRequests.length === 0) {
    throw new Error('No valid items selected for return.');
  }

  // Ensure all requested products belong to original invoice
  for (const retItem of activeReturnRequests) {
    const origItem = originalSale.items.find((i) => i.productId === retItem.productId);
    if (!origItem) {
      throw new Error(`Product ${retItem.productId} was not part of original invoice ${input.originalInvoiceNo}.`);
    }
  }

  const returnDate = (input.returnDate || new Date().toISOString().split('T')[0]).split('T')[0];
  const dateObj = new Date();
  const yy = String(dateObj.getFullYear()).slice(-2);
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const randomHex = input.idempotencyKey || Math.random().toString(16).slice(2, 8).toUpperCase();
  const returnNo = `RET-${yy}${mm}${dd}-${randomHex}`;

  const returnDocRef = doc(db, 'salesReturns', returnNo);
  const summaryRef = doc(db, 'saleReturnSummaries', originalSale.invoiceNo);

  let finalSaleReturnDoc: SaleReturnDocument | null = null;
  let totalStockQtyDelta = 0;
  let totalStockValueDelta = 0;

  // Run Atomic Firestore Transaction
  await runTransaction(db, async (txn) => {
    // ---------------------------------------------------------------------------------
    // STEP 1: TRANSACTIONAL READ PHASE
    // ---------------------------------------------------------------------------------

    // 1.1 Read Authoritative Per-Sale Return Summary (Tracks cumulative returns transactionally)
    const summarySnap = await txn.get(summaryRef);
    const authoritativeReturnedMap = new Map<string, number>();
    let existingSummary: SaleReturnSummaryDocument | null = null;

    if (summarySnap.exists()) {
      existingSummary = summarySnap.data() as SaleReturnSummaryDocument;
      for (const item of existingSummary.returnedItems) {
        authoritativeReturnedMap.set(item.productId, item.totalReturnedQuantity);
      }
    }

    // 1.2 Check idempotency: if this exact returnNo was already committed, fail-safe or return
    const existingReturnSnap = await txn.get(returnDocRef);
    if (existingReturnSnap.exists()) {
      finalSaleReturnDoc = existingReturnSnap.data() as SaleReturnDocument;
      return;
    }

    // 1.3 Transactional Validation: Verify requested return quantities against authoritative balance
    const returnItemsResolved: SaleReturnItem[] = [];
    let totalRefund = 0;
    let stockQtyDelta = 0;
    let stockValueDelta = 0;

    for (const retItem of activeReturnRequests) {
      const originalItem = originalSale.items.find((i) => i.productId === retItem.productId)!;
      const previouslyReturned = authoritativeReturnedMap.get(retItem.productId) || 0;
      const remainingEligible = originalItem.quantity - previouslyReturned;

      if (retItem.quantity > remainingEligible) {
        throw new Error(
          `Cannot return ${retItem.quantity} units of "${originalItem.productName}". Only ${remainingEligible} eligible (Sold: ${originalItem.quantity}, Already Returned: ${previouslyReturned}).`
        );
      }

      const condition: ReturnItemCondition = retItem.condition || 'saleable';
      const unitRefund = originalItem.effectivePrice;
      const lineRefund = Math.round(unitRefund * retItem.quantity * 100) / 100;
      totalRefund += lineRefund;

      const unitCost = (originalItem as any).costPrice || 0;

      // Only saleable items are added back to saleable inventory and summary deltas
      if (condition === 'saleable') {
        stockQtyDelta += retItem.quantity;
      }

      returnItemsResolved.push({
        productId: originalItem.productId,
        productName: originalItem.productName,
        publisherName: originalItem.publisherName || 'Unknown',
        originalCostPrice: unitCost,
        quantity: retItem.quantity,
        condition,
        refundUnitPrice: unitRefund,
        refundLineTotal: lineRefund,
      });
    }

    totalRefund = Math.round(totalRefund * 100) / 100;

    // 1.4 Read customer document if refundMethod === 'credit_deduction'
    let customerDocSnap = null;
    let customerRef = null;

    if (originalSale.customerId && input.refundMethod === 'credit_deduction') {
      customerRef = doc(db, 'customers', originalSale.customerId);
      customerDocSnap = await txn.get(customerRef);
      if (!customerDocSnap.exists()) {
        throw new Error(`Customer "${originalSale.customerId}" record not found.`);
      }
    }

    // 1.5 Read product documents ONLY for saleable items to restock
    const saleableReturnItems = returnItemsResolved.filter((item) => item.condition === 'saleable');
    const productRefsAndSnaps = await Promise.all(
      saleableReturnItems.map(async (item) => {
        const pRef = doc(db, 'products', item.productId);
        const pSnap = await txn.get(pRef);
        return { ref: pRef, snap: pSnap, returnItem: item };
      })
    );

    // 1.6 Read stock batch documents for saleable items (for transactional FIFO restoration)
    const batchSnapshots: Map<string, StockBatchDocument> = new Map();
    for (const retItem of saleableReturnItems) {
      const origItem = originalSale.items.find((i) => i.productId === retItem.productId);
      if (origItem?.batchesDepleted && origItem.batchesDepleted.length > 0) {
        for (const dep of origItem.batchesDepleted) {
          if (!batchSnapshots.has(dep.batchId)) {
            const bRef = doc(db, STOCK_BATCHES_COLLECTION, dep.batchId);
            const bSnap = await txn.get(bRef);
            if (bSnap.exists()) {
              batchSnapshots.set(dep.batchId, bSnap.data() as StockBatchDocument);
            }
          }
        }
      }
      const openBatchId = getOpeningStockBatchId(retItem.productId);
      if (!batchSnapshots.has(openBatchId)) {
        const openRef = doc(db, STOCK_BATCHES_COLLECTION, openBatchId);
        const openSnap = await txn.get(openRef);
        if (openSnap.exists()) {
          batchSnapshots.set(openBatchId, openSnap.data() as StockBatchDocument);
        }
      }
    }

    // ---------------------------------------------------------------------------------
    // STEP 2: TRANSACTIONAL WRITE PHASE
    // ---------------------------------------------------------------------------------

    // 2.1 Update Authoritative Per-Sale Return Summary
    const updatedReturnedItems: SaleReturnSummaryItem[] = [];
    const allProductIds = new Set([
      ...authoritativeReturnedMap.keys(),
      ...returnItemsResolved.map((i) => i.productId),
    ]);

    for (const pId of allProductIds) {
      const prevQty = authoritativeReturnedMap.get(pId) || 0;
      const addedQty = returnItemsResolved.find((i) => i.productId === pId)?.quantity || 0;
      updatedReturnedItems.push({
        productId: pId,
        totalReturnedQuantity: prevQty + addedQty,
      });
    }

    const updatedSummary: SaleReturnSummaryDocument = {
      id: originalSale.invoiceNo,
      invoiceNo: originalSale.invoiceNo,
      returnedItems: updatedReturnedItems,
      totalRefundedAmount: Math.round(((existingSummary?.totalRefundedAmount || 0) + totalRefund) * 100) / 100,
      returnCount: (existingSummary?.returnCount || 0) + 1,
      lastReturnNo: returnNo,
      updatedAt: new Date().toISOString(),
      createdAt: existingSummary?.createdAt || new Date().toISOString(),
    };
    txn.set(summaryRef, updatedSummary);

    // 2.2 Create SaleReturn Document
    const saleReturnDoc: SaleReturnDocument = {
      id: returnNo,
      returnNo,
      originalSaleId: originalSale.id,
      originalInvoiceNo: originalSale.invoiceNo,
      customerId: originalSale.customerId,
      customerName: originalSale.customerName,
      items: returnItemsResolved,
      productIds: Array.from(new Set(returnItemsResolved.map((i) => i.productId))),
      totalRefundAmount: totalRefund,
      refundMethod: input.refundMethod,
      reason: input.reason.trim() || 'Customer return',
      processedByUserId: operatorUserId,
      processedByEmail: operatorEmail,
      returnDate,
      createdAt: new Date().toISOString(),
    };
    txn.set(returnDocRef, saleReturnDoc);

    // 2.3 Restock Product Inventory & Write Stock Movements (ONLY for Saleable Items)
    for (const { ref: pRef, snap: pSnap, returnItem } of productRefsAndSnaps) {
      if (pSnap.exists()) {
        const pData = pSnap.data() as ProductDocument;
        const currentStock = Number(pData.currentStock) || 0;
        const newStock = currentStock + returnItem.quantity;
        const isLow = newStock <= (pData.lowStockThreshold || 5);

        txn.update(pRef, {
          currentStock: newStock,
          isLowStock: isLow,
          lastReturnNo: returnNo, // Audit linkage matching security rules
          updatedAt: new Date().toISOString(),
        });

        // Stock Movement audit entry
        const movementRef = doc(collection(db, 'stockMovements'));
        const movement: StockMovementDocument = {
          id: movementRef.id,
          productId: returnItem.productId,
          productName: returnItem.productName,
          movementType: 'in',
          quantity: returnItem.quantity,
          previousStock: currentStock,
          newStock,
          reason: 'customer_return',
          referenceDocId: returnNo,
          recordedByUserId: operatorUserId,
          createdAt: new Date().toISOString(),
        };
        txn.set(movementRef, movement);
      }
    }

    // 2.3b Restore FIFO Batches (ONLY for Saleable Items)
    const nowIso = new Date().toISOString();
    for (const retItem of saleableReturnItems) {
      const origItem = originalSale.items.find((i) => i.productId === retItem.productId);
      const fallbackCost = (origItem as any)?.costPrice || 0;
      const restoredVal = restoreBatchesInTransaction(
        txn,
        retItem.productId,
        retItem.quantity,
        origItem?.batchesDepleted,
        fallbackCost,
        nowIso,
        batchSnapshots,
        returnNo
      );
      stockValueDelta += restoredVal;
    }

    // 2.4 Credit Deduction: Adjust Customer Balance & Ledger
    if (customerRef && customerDocSnap) {
      const custData = customerDocSnap.data() as CustomerDocument;
      const prevBal = Number(custData.currentBalance) || 0;
      const newBal = Math.round((prevBal - totalRefund) * 100) / 100; // Credit deduction decreases customer debt (negative = advance)

      txn.update(customerRef, {
        currentBalance: newBal,
        lastReturnNo: returnNo,
        updatedAt: new Date().toISOString(),
      });

      // Customer Ledger entry (Credit decreases debt)
      const ledgerRef = doc(collection(db, 'customerLedger'));
      const ledgerEntry: CustomerLedgerDocument = {
        id: ledgerRef.id,
        customerId: originalSale.customerId!,
        customerName: custData.name,
        date: returnDate,
        entryType: 'credit', // Credit reduces customer debt
        amount: totalRefund,
        runningBalance: newBal,
        description: `Sales Return Khata Adjustment for Invoice ${originalSale.invoiceNo}`,
        referenceInvoiceNo: originalSale.invoiceNo,
        referenceReceiptNo: returnNo,
        recordedByUserId: operatorUserId,
        createdAt: new Date().toISOString(),
      };
      txn.set(ledgerRef, ledgerEntry);
    }

    // 2.5 Cash Refund: Generate Outflow Payment Voucher
    if (input.refundMethod === 'cash') {
      const refundPayRef = doc(db, 'payments', `REF_${returnNo}`);
      const refundPaymentDoc: PaymentDocument = {
        id: `REF_${returnNo}`,
        receiptNo: `VOUCHER-${returnNo}`,
        targetType: 'sales_refund',
        referenceId: originalSale.invoiceNo,
        partyName: originalSale.customerName,
        amount: totalRefund,
        paymentMode: 'cash',
        transactionReference: returnNo,
        receivedByUserId: operatorUserId,
        paymentDate: returnDate,
        notes: `Cash Refund for Return ${returnNo} (Invoice #${originalSale.invoiceNo}): ${input.reason.trim() || 'Customer return'}`,
        createdAt: new Date().toISOString(),
      };
      txn.set(refundPayRef, refundPaymentDoc);
    }

    finalSaleReturnDoc = saleReturnDoc;
    totalStockQtyDelta = stockQtyDelta;
    totalStockValueDelta = Math.round(stockValueDelta * 100) / 100;
  });

  const committedReturnDoc = finalSaleReturnDoc as SaleReturnDocument | null;
  if (!committedReturnDoc) {
    throw new Error('Return transaction completed but document was not created.');
  }

  // Update Inventory Summary deltas asynchronously
  if (totalStockQtyDelta > 0) {
    updateInventorySummaryDeltas({
      stockQtyDelta: totalStockQtyDelta,
      stockValueDelta: totalStockValueDelta,
    }).catch((err) => {
      console.warn('Failed to update background inventory summary delta:', err);
    });
  }

  logAuditEvent(
    'SALES_RETURN',
    'salesReturns',
    `Processed return ${committedReturnDoc.returnNo} for invoice ${originalSale.invoiceNo}: Refund PKR ${committedReturnDoc.totalRefundAmount}`,
    committedReturnDoc.returnNo,
    operatorUserId,
    operatorEmail
  ).catch((err) => {
    console.warn('Failed to log sales return audit event:', err);
  });

  return committedReturnDoc;
};
