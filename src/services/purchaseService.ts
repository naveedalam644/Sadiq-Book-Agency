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
  increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  PurchaseDocument,
  ProductDocument,
  StockMovementDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { INVENTORY_SUMMARY_DOC_ID } from './summaryService';

export interface PurchaseFilters {
  supplierId?: string | 'all';
  paymentMethod?: string | 'all';
  searchTerm?: string;
}

export interface PaginatedPurchasesResult {
  purchases: PurchaseDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const PURCHASE_PAGE_SIZE = 25;

export interface CreatePurchaseInput {
  purchaseInvoiceNo: string;
  supplierId: string;
  supplierName: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  subtotal: number;
  discountAmount?: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  purchaseDate: string;
  notes?: string;
}

export const checkPurchaseInvoiceUnique = async (
  supplierId: string,
  invoiceNo: string
): Promise<boolean> => {
  if (!db || !invoiceNo.trim()) return true;

  try {
    const q = query(
      collection(db, 'purchases'),
      where('supplierId', '==', supplierId),
      where('purchaseInvoiceNo', '==', invoiceNo.trim()),
      limit(1)
    );
    const snap = await getDocs(q);
    return snap.empty;
  } catch (err) {
    console.error('Error checking purchase invoice uniqueness:', err);
    return true;
  }
};

export const createPurchaseTransaction = async (
  input: CreatePurchaseInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<PurchaseDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  if (!input.items || input.items.length === 0) {
    throw new Error('A purchase must contain at least one product item.');
  }

  const cleanInvoiceNo = input.purchaseInvoiceNo.trim();
  if (!cleanInvoiceNo) {
    throw new Error('Invoice / Bill reference number is required.');
  }

  // Pre-check for duplicate invoice submission
  const isInvoiceUnique = await checkPurchaseInvoiceUnique(input.supplierId, cleanInvoiceNo);
  if (!isInvoiceUnique) {
    throw new Error(
      `Purchase invoice "${cleanInvoiceNo}" has already been recorded for this supplier. Duplicate entries are blocked.`
    );
  }

  const now = new Date().toISOString();
  const purchaseRef = doc(collection(db, 'purchases'));
  const remainingBalance = Math.max(0, input.grandTotal - (Number(input.paidAmount) || 0));

  const purchaseDoc: PurchaseDocument = {
    id: purchaseRef.id,
    purchaseInvoiceNo: cleanInvoiceNo,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    items: input.items.map((it) => ({
      productId: it.productId,
      productName: it.productName,
      quantity: Number(it.quantity),
      unitCost: Number(it.unitCost),
      totalCost: Number(it.totalCost),
    })),
    subtotal: Number(input.subtotal),
    discountAmount: Number(input.discountAmount) || 0,
    grandTotal: Number(input.grandTotal),
    paidAmount: Number(input.paidAmount) || 0,
    remainingBalance,
    paymentMethod: input.paymentMethod,
    purchaseDate: input.purchaseDate || now.split('T')[0],
    receivedByUserId: userId,
    notes: input.notes?.trim() || '',
    createdAt: now,
  };

  // Run atomic transaction across all affected documents
  await runTransaction(db, async (transaction) => {
    // 1. Transactional reads of all products
    const productSnapshots: Array<{ ref: any; doc: ProductDocument }> = [];
    for (const item of input.items) {
      const prodRef = doc(db!, 'products', item.productId);
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists()) {
        throw new Error(`Product "${item.productName}" (ID: ${item.productId}) not found.`);
      }
      productSnapshots.push({
        ref: prodRef,
        doc: prodSnap.data() as ProductDocument,
      });
    }

    // 2. Read supplier doc if remaining balance needs update
    let supRef: any = null;
    let supplierSnap: any = null;
    if (remainingBalance > 0 || input.paymentMethod === 'credit') {
      supRef = doc(db!, 'suppliers', input.supplierId);
      supplierSnap = await transaction.get(supRef);
    }

    // 3. Read summary doc
    const summaryRef = doc(db!, 'settings', INVENTORY_SUMMARY_DOC_ID);
    const summarySnap = await transaction.get(summaryRef);

    // 4. Writes: Create purchase doc
    transaction.set(purchaseRef, purchaseDoc);

    // 5. Writes: Update each product and record stock movements
    let totalQtyAdded = 0;
    let totalValueAdded = 0;
    let lowStockDelta = 0;

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const prodEntry = productSnapshots[i];
      const currentStock = Number(prodEntry.doc.currentStock || 0);
      const newStock = currentStock + Number(item.quantity);
      const lowThreshold = Number(prodEntry.doc.lowStockThreshold || 0);
      const wasLow = currentStock <= lowThreshold;
      const isNowLow = newStock <= lowThreshold;

      if (wasLow && !isNowLow) lowStockDelta -= 1;
      if (!wasLow && isNowLow) lowStockDelta += 1;

      totalQtyAdded += Number(item.quantity);
      totalValueAdded += Number(item.quantity) * Number(item.unitCost);

      // Update product currentStock and costPrice
      transaction.update(prodEntry.ref, {
        currentStock: newStock,
        costPrice: Number(item.unitCost),
        isLowStock: isNowLow,
        updatedAt: now,
      });

      // Append immutable stock movement
      const moveRef = doc(collection(db!, 'stockMovements'));
      const movement: StockMovementDocument = {
        id: moveRef.id,
        productId: item.productId,
        productName: item.productName,
        movementType: 'in',
        quantity: Number(item.quantity),
        previousStock: currentStock,
        newStock: newStock,
        reason: 'purchase',
        referenceDocId: purchaseRef.id,
        recordedByUserId: userId,
        createdAt: now,
      };
      transaction.set(moveRef, movement);
    }

    // 6. Update supplier balance if credit
    if (supRef && supplierSnap && supplierSnap.exists()) {
      const currentSupBal = Number(supplierSnap.data().currentBalance || 0);
      transaction.update(supRef, {
        currentBalance: currentSupBal + remainingBalance,
      });
    }

    // 7. Atomically update inventory summary
    if (summarySnap.exists()) {
      transaction.update(summaryRef, {
        totalStockQuantity: increment(totalQtyAdded),
        totalStockValue: increment(totalValueAdded),
        lowStockCount: increment(lowStockDelta),
        updatedAt: now,
      });
    }
  });

  await logAuditEvent(
    'CREATE_PURCHASE',
    'purchases',
    `Purchase recorded: ${purchaseDoc.purchaseInvoiceNo} from ${purchaseDoc.supplierName} (Total: PKR ${purchaseDoc.grandTotal}, Items: ${purchaseDoc.items.length})`,
    purchaseDoc.id,
    userId,
    userEmail
  );

  return purchaseDoc;
};

export const getPurchasesPaginated = async (
  filters: PurchaseFilters = {},
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = PURCHASE_PAGE_SIZE
): Promise<PaginatedPurchasesResult> => {
  if (!db) {
    return { purchases: [], lastDoc: null, hasMore: false };
  }

  try {
    const purchasesRef = collection(db, 'purchases');
    let qConstraints: any[] = [];

    if (filters.supplierId && filters.supplierId !== 'all') {
      qConstraints.push(where('supplierId', '==', filters.supplierId));
    }

    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      qConstraints.push(where('paymentMethod', '==', filters.paymentMethod));
    }

    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    qConstraints.push(limit(pageSize + 1));

    const q = query(purchasesRef, ...qConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    let purchases: PurchaseDocument[] = docs.map((d) => ({
      ...(d.data() as PurchaseDocument),
      id: d.id,
    }));

    // In-memory sort by purchase date desc
    purchases.sort(
      (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
    );

    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      purchases = purchases.filter(
        (p) =>
          p.purchaseInvoiceNo.toLowerCase().includes(term) ||
          p.supplierName.toLowerCase().includes(term) ||
          p.items.some((i) => i.productName.toLowerCase().includes(term))
      );
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      purchases,
      lastDoc,
      hasMore,
    };
  } catch (err) {
    console.error('Error fetching purchases:', err);
    return { purchases: [], lastDoc: null, hasMore: false };
  }
};

export const getRecentPurchases = async (limitCount = 5): Promise<PurchaseDocument[]> => {
  if (!db) return [];

  try {
    const q = query(collection(db, 'purchases'), limit(limitCount));
    const snap = await getDocs(q);

    const list: PurchaseDocument[] = snap.docs.map((d) => ({
      ...(d.data() as PurchaseDocument),
      id: d.id,
    }));

    list.sort(
      (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
    );

    return list;
  } catch (err) {
    console.error('Error fetching recent purchases:', err);
    return [];
  }
};

export const getPurchaseById = async (id: string): Promise<PurchaseDocument | null> => {
  if (!db || !id) return null;

  try {
    const docRef = doc(db, 'purchases', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { ...(snap.data() as PurchaseDocument), id: snap.id };
  } catch (err) {
    console.error(`Error fetching purchase ${id}:`, err);
    return null;
  }
};
