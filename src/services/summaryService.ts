import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  collection,
  getDocs,
  query,
  limit,
  orderBy,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { InventorySummaryDocument, ProductDocument, SupplierDocument, StockBatchDocument } from '../types/database';
import { calculateProductValuationFromBatches } from './stockBatchService';

export const INVENTORY_SUMMARY_DOC_ID = 'inventory_summary';

export const getInventorySummary = async (): Promise<InventorySummaryDocument> => {
  const fallback: InventorySummaryDocument = {
    id: INVENTORY_SUMMARY_DOC_ID,
    totalProducts: 0,
    totalStockQuantity: 0,
    totalStockValue: 0,
    totalSuppliers: 0,
    lowStockCount: 0,
    updatedAt: new Date().toISOString(),
  };

  if (!db) return fallback;

  try {
    const summaryRef = doc(db, 'settings', INVENTORY_SUMMARY_DOC_ID);
    const snap = await getDoc(summaryRef);

    if (snap.exists()) {
      return snap.data() as InventorySummaryDocument;
    }

    // If summary doesn't exist yet, calculate initial values safely with limit bounds
    return await recalculateInventorySummary();
  } catch (error) {
    console.warn('Inventory summary fetch notice:', error);
    return fallback;
  }
};

export const recalculateInventorySummary = async (): Promise<InventorySummaryDocument> => {
  if (!db) {
    return {
      id: INVENTORY_SUMMARY_DOC_ID,
      totalProducts: 0,
      totalStockQuantity: 0,
      totalStockValue: 0,
      totalSuppliers: 0,
      lowStockCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    // 1. Load all active products with bounded cursor pagination (in pages of 500)
    const activeProducts: ProductDocument[] = [];
    let lastProductDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreProducts = true;

    while (hasMoreProducts) {
      const constraints: any[] = [orderBy('__name__'), limit(500)];
      if (lastProductDoc) constraints.push(startAfter(lastProductDoc));
      const snap = await getDocs(query(collection(db, 'products'), ...constraints));
      if (snap.empty) break;
      snap.forEach((d) => {
        const p = d.data() as ProductDocument;
        if (p.isActive) {
          activeProducts.push({ ...p, id: d.id });
        }
      });
      if (snap.docs.length < 500) {
        hasMoreProducts = false;
      } else {
        lastProductDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 2. Load all active stock batches with bounded cursor pagination (in pages of 500)
    // Guarantees accurate valuation traversal even when inventory exceeds 1,000 batches
    const activeBatchesByProduct = new Map<string, StockBatchDocument[]>();
    let lastBatchDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreBatches = true;

    while (hasMoreBatches) {
      const batchConstraints: any[] = [orderBy('__name__'), limit(500)];
      if (lastBatchDoc) batchConstraints.push(startAfter(lastBatchDoc));
      const bSnap = await getDocs(query(collection(db, 'stockBatches'), ...batchConstraints));
      if (bSnap.empty) break;
      bSnap.forEach((bDoc) => {
        const b = bDoc.data() as StockBatchDocument;
        if (b.remainingQuantity > 0) {
          const list = activeBatchesByProduct.get(b.productId) || [];
          list.push(b);
          activeBatchesByProduct.set(b.productId, list);
        }
      });
      if (bSnap.docs.length < 500) {
        hasMoreBatches = false;
      } else {
        lastBatchDoc = bSnap.docs[bSnap.docs.length - 1];
      }
    }

    let totalProducts = 0;
    let totalStockQuantity = 0;
    let totalStockValue = 0;
    let lowStockCount = 0;

    activeProducts.forEach((p) => {
      totalProducts += 1;
      const currentStock = Number(p.currentStock || 0);
      totalStockQuantity += currentStock;
      const productBatches = activeBatchesByProduct.get(p.id) || [];
      const valuation = calculateProductValuationFromBatches(p, productBatches);
      totalStockValue += valuation;
      if (currentStock <= (p.lowStockThreshold || 0)) {
        lowStockCount += 1;
      }
    });

    totalStockValue = Math.round(totalStockValue * 100) / 100;

    // 3. Load active suppliers with cursor pagination
    let totalSuppliers = 0;
    let lastSupDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreSuppliers = true;

    while (hasMoreSuppliers) {
      const supConstraints: any[] = [orderBy('__name__'), limit(500)];
      if (lastSupDoc) supConstraints.push(startAfter(lastSupDoc));
      const suppliersSnap = await getDocs(query(collection(db, 'suppliers'), ...supConstraints));
      if (suppliersSnap.empty) break;
      suppliersSnap.forEach((d) => {
        const s = d.data() as SupplierDocument;
        if (s.isActive) totalSuppliers += 1;
      });
      if (suppliersSnap.docs.length < 500) {
        hasMoreSuppliers = false;
      } else {
        lastSupDoc = suppliersSnap.docs[suppliersSnap.docs.length - 1];
      }
    }

    const summary: InventorySummaryDocument = {
      id: INVENTORY_SUMMARY_DOC_ID,
      totalProducts,
      totalStockQuantity,
      totalStockValue,
      totalSuppliers,
      lowStockCount,
      updatedAt: new Date().toISOString(),
    };

    const summaryRef = doc(db, 'settings', INVENTORY_SUMMARY_DOC_ID);
    await setDoc(summaryRef, summary, { merge: true });
    return summary;
  } catch (err) {
    console.error('Error recalculating inventory summary:', err);
    return {
      id: INVENTORY_SUMMARY_DOC_ID,
      totalProducts: 0,
      totalStockQuantity: 0,
      totalStockValue: 0,
      totalSuppliers: 0,
      lowStockCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }
};

export const updateInventorySummaryDeltas = async (deltas: {
  productsDelta?: number;
  stockQtyDelta?: number;
  stockValueDelta?: number;
  suppliersDelta?: number;
  lowStockDelta?: number;
}): Promise<void> => {
  if (!db) return;

  try {
    const summaryRef = doc(db, 'settings', INVENTORY_SUMMARY_DOC_ID);
    await updateDoc(summaryRef, {
      ...(deltas.productsDelta !== undefined && { totalProducts: increment(deltas.productsDelta) }),
      ...(deltas.stockQtyDelta !== undefined && { totalStockQuantity: increment(deltas.stockQtyDelta) }),
      ...(deltas.stockValueDelta !== undefined && { totalStockValue: increment(deltas.stockValueDelta) }),
      ...(deltas.suppliersDelta !== undefined && { totalSuppliers: increment(deltas.suppliersDelta) }),
      ...(deltas.lowStockDelta !== undefined && { lowStockCount: increment(deltas.lowStockDelta) }),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    await recalculateInventorySummary();
  }
};
