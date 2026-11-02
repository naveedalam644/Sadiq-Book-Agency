import {
  collection,
  doc,
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
  StockMovementDocument,
  StockMovementReason,
  ProductDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { INVENTORY_SUMMARY_DOC_ID } from './summaryService';

export interface StockMovementFilters {
  productId?: string;
  reason?: StockMovementReason | 'all';
  movementType?: 'all' | 'in' | 'out';
  searchTerm?: string;
}

export interface PaginatedStockMovementsResult {
  movements: StockMovementDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const STOCK_PAGE_SIZE = 25;

export const getStockMovementsPaginated = async (
  filters: StockMovementFilters = {},
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = STOCK_PAGE_SIZE
): Promise<PaginatedStockMovementsResult> => {
  if (!db) {
    return { movements: [], lastDoc: null, hasMore: false };
  }

  try {
    const movementsRef = collection(db, 'stockMovements');
    let qConstraints: any[] = [];

    if (filters.productId) {
      qConstraints.push(where('productId', '==', filters.productId));
    }

    if (filters.movementType && filters.movementType !== 'all') {
      qConstraints.push(where('movementType', '==', filters.movementType));
    }

    if (filters.reason && filters.reason !== 'all') {
      qConstraints.push(where('reason', '==', filters.reason));
    }

    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    qConstraints.push(limit(pageSize + 1));

    const q = query(movementsRef, ...qConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    let movements: StockMovementDocument[] = docs.map((d) => ({
      ...(d.data() as StockMovementDocument),
      id: d.id,
    }));

    // In-memory sort by createdAt DESC
    movements.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      movements = movements.filter(
        (m) =>
          m.productName.toLowerCase().includes(term) ||
          m.reason.toLowerCase().includes(term) ||
          (m.referenceDocId && m.referenceDocId.toLowerCase().includes(term))
      );
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      movements,
      lastDoc,
      hasMore,
    };
  } catch (err) {
    console.error('Error fetching stock movements:', err);
    return { movements: [], lastDoc: null, hasMore: false };
  }
};

export interface StockAdjustmentInput {
  productId: string;
  adjustmentType: 'add' | 'subtract';
  quantity: number;
  reason: 'adjustment' | 'damage';
  notes?: string;
}

export const adjustStockTransaction = async (
  input: StockAdjustmentInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<StockMovementDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const qty = Number(input.quantity);
  if (!qty || qty <= 0) {
    throw new Error('Adjustment quantity must be greater than zero.');
  }

  const now = new Date().toISOString();
  const prodRef = doc(db, 'products', input.productId);
  const moveRef = doc(collection(db, 'stockMovements'));
  const summaryRef = doc(db, 'settings', INVENTORY_SUMMARY_DOC_ID);

  let recordedMovement: StockMovementDocument | null = null;

  await runTransaction(db, async (transaction) => {
    const prodSnap = await transaction.get(prodRef);
    if (!prodSnap.exists()) {
      throw new Error('Product not found.');
    }

    const product = prodSnap.data() as ProductDocument;
    const previousStock = Number(product.currentStock || 0);
    const lowStockThreshold = Number(product.lowStockThreshold || 0);
    const costPrice = Number(product.costPrice || 0);

    let newStock = previousStock;
    let movementType: 'in' | 'out' = 'in';

    if (input.adjustmentType === 'add') {
      newStock = previousStock + qty;
      movementType = 'in';
    } else {
      if (previousStock - qty < 0) {
        throw new Error(
          `Cannot reduce stock by ${qty}. Current physical stock is only ${previousStock}. Negative stock is prevented.`
        );
      }
      newStock = previousStock - qty;
      movementType = 'out';
    }

    const wasLow = previousStock <= lowStockThreshold;
    const isNowLow = newStock <= lowStockThreshold;
    let lowStockDelta = 0;
    if (wasLow && !isNowLow) lowStockDelta = -1;
    if (!wasLow && isNowLow) lowStockDelta = 1;

    const stockQtyDelta = movementType === 'in' ? qty : -qty;
    const stockValueDelta = stockQtyDelta * costPrice;

    // 1. Update product
    transaction.update(prodRef, {
      currentStock: newStock,
      isLowStock: isNowLow,
      updatedAt: now,
    });

    // 2. Append immutable movement record
    recordedMovement = {
      id: moveRef.id,
      productId: product.id,
      productName: product.title,
      movementType,
      quantity: qty,
      previousStock,
      newStock,
      reason: input.reason,
      referenceDocId: input.notes?.trim() || 'MANUAL_ADJUSTMENT',
      recordedByUserId: userId,
      createdAt: now,
    };
    transaction.set(moveRef, recordedMovement);

    // 3. Atomically update summary
    const summarySnap = await transaction.get(summaryRef);
    if (summarySnap.exists()) {
      transaction.update(summaryRef, {
        totalStockQuantity: increment(stockQtyDelta),
        totalStockValue: increment(stockValueDelta),
        lowStockCount: increment(lowStockDelta),
        updatedAt: now,
      });
    }
  });

  if (!recordedMovement) {
    throw new Error('Stock adjustment transaction failed.');
  }

  await logAuditEvent(
    'ADJUST_STOCK',
    'stockMovements',
    `Stock adjusted for ${(recordedMovement as StockMovementDocument).productName}: ${input.adjustmentType === 'add' ? '+' : '-'}${qty} (Reason: ${input.reason})`,
    input.productId,
    userId,
    userEmail
  );

  return recordedMovement;
};

export const getLowStockProducts = async (limitCount = 10): Promise<ProductDocument[]> => {
  if (!db) return [];

  try {
    const q = query(collection(db, 'products'), where('isActive', '==', true), limit(50));
    const snap = await getDocs(q);

    let list: ProductDocument[] = snap.docs.map((d) => ({
      ...(d.data() as ProductDocument),
      id: d.id,
    }));

    list = list.filter((p) => (p.currentStock || 0) <= (p.lowStockThreshold || 0));
    list.sort((a, b) => (a.currentStock || 0) - (b.currentStock || 0));

    return list.slice(0, limitCount);
  } catch (err) {
    console.error('Error fetching low stock products:', err);
    return [];
  }
};
