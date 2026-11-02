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
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { InventorySummaryDocument, ProductDocument, SupplierDocument } from '../types/database';

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
    const productsSnap = await getDocs(query(collection(db, 'products'), limit(200)));
    let totalProducts = 0;
    let totalStockQuantity = 0;
    let totalStockValue = 0;
    let lowStockCount = 0;

    productsSnap.forEach((d) => {
      const p = d.data() as ProductDocument;
      if (p.isActive) {
        totalProducts += 1;
        totalStockQuantity += Number(p.currentStock || 0);
        totalStockValue += Number(p.currentStock || 0) * Number(p.costPrice || 0);
        if ((p.currentStock || 0) <= (p.lowStockThreshold || 0)) {
          lowStockCount += 1;
        }
      }
    });

    const suppliersSnap = await getDocs(query(collection(db, 'suppliers'), limit(100)));
    let totalSuppliers = 0;
    suppliersSnap.forEach((d) => {
      const s = d.data() as SupplierDocument;
      if (s.isActive) totalSuppliers += 1;
    });

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
