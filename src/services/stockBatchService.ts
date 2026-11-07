import {
  collection,
  doc,
  getDocs,
  query,
  where,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  StockBatchDocument,
  SaleItemBatchDepletion,
  ProductDocument,
} from '../types/database';

export const roundMoney = (val: number): number =>
  Math.round((Number(val) || 0) * 100) / 100;

export const STOCK_BATCHES_COLLECTION = 'stockBatches';

/**
 * Deterministic batch ID generator.
 * Prevents duplicate batch documents for the same purchase intake or opening stock.
 */
export const getStockBatchId = (purchaseId: string, productId: string): string =>
  `BATCH_${purchaseId}_${productId}`;

export const getOpeningStockBatchId = (productId: string): string =>
  `BATCH_OPEN_${productId}`;

/**
 * Query active (non-exhausted) stock batches for a given product in FIFO order.
 * Uses bounded queries and in-memory ordering to avoid requiring complex composite indexes.
 */
export const getActiveBatchesForProduct = async (
  productId: string
): Promise<StockBatchDocument[]> => {
  if (!db || !productId) return [];

  try {
    const q = query(
      collection(db, STOCK_BATCHES_COLLECTION),
      where('productId', '==', productId)
    );
    const snap = await getDocs(q);

    const batches: StockBatchDocument[] = [];
    snap.forEach((d) => {
      const b = d.data() as StockBatchDocument;
      if (b.remainingQuantity > 0) {
        batches.push(b);
      }
    });

    // Stable FIFO ordering: opening batches must ALWAYS come first, then oldest purchase intake / creation
    batches.sort((a, b) => {
      if (a.batchType === 'opening' && b.batchType !== 'opening') return -1;
      if (b.batchType === 'opening' && a.batchType !== 'opening') return 1;
      const dateA = a.purchaseDate || a.createdAt;
      const dateB = b.purchaseDate || b.createdAt;
      const diff = new Date(dateA).getTime() - new Date(dateB).getTime();
      if (diff !== 0) return diff;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    return batches;
  } catch (err) {
    console.error(`Error querying active stock batches for product ${productId}:`, err);
    return [];
  }
};

/**
 * Query all historical stock batches for a given product (for audit and product history).
 */
export const getAllBatchesForProduct = async (
  productId: string
): Promise<StockBatchDocument[]> => {
  if (!db || !productId) return [];

  try {
    const q = query(
      collection(db, STOCK_BATCHES_COLLECTION),
      where('productId', '==', productId)
    );
    const snap = await getDocs(q);

    const batches: StockBatchDocument[] = [];
    snap.forEach((d) => {
      batches.push(d.data() as StockBatchDocument);
    });

    batches.sort((a, b) => {
      const dateA = a.purchaseDate || a.createdAt;
      const dateB = b.purchaseDate || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return batches;
  } catch (err) {
    console.error(`Error querying all stock batches for product ${productId}:`, err);
    return [];
  }
};

export interface FifoDepletionResult {
  depletedBatches: SaleItemBatchDepletion[];
  totalCogs: number;
  effectiveUnitCost: number;
}

/**
 * Atomically depletes stock quantity from available FIFO batches inside a transaction.
 *
 * Safeguard 2 (Legacy Migration & Strict FIFO Order):
 * Prioritizes unallocated legacy stock and virtual opening batches first, guaranteeing
 * that older stock is depleted before newer purchases, with zero negative batch quantities.
 */
export const depleteFifoBatchesInTransaction = (
  transaction: Transaction,
  productDoc: ProductDocument,
  activeBatches: StockBatchDocument[],
  quantityToDeplete: number,
  now: string,
  batchSnapshotMap?: Map<string, StockBatchDocument>,
  lastSaleId?: string
): FifoDepletionResult => {
  let neededQty = Math.floor(Number(quantityToDeplete));
  if (neededQty <= 0) {
    return { depletedBatches: [], totalCogs: 0, effectiveUnitCost: 0 };
  }

  const depletedBatches: SaleItemBatchDepletion[] = [];
  let totalCogs = 0;

  const openingBatchId = getOpeningStockBatchId(productDoc.id);
  const existingOpening = batchSnapshotMap?.get(openingBatchId);

  // 1. Strict Legacy Opening Allocation (FIFO Priority):
  // If opening batch does not exist yet in batchSnapshotMap or activeBatches, but physical stock
  // exceeds the sum of active purchase batches, allocate unallocated legacy stock FIRST:
  const hasOpeningInActive = activeBatches.some((b) => b.batchType === 'opening');
  const sumPurchaseBatches = activeBatches.reduce(
    (sum, b) => sum + (b.batchType === 'opening' ? 0 : Number(b.remainingQuantity || 0)),
    0
  );
  const unallocatedLegacy = (!hasOpeningInActive && !existingOpening)
    ? Math.max(0, Number(productDoc.currentStock || 0) - sumPurchaseBatches)
    : 0;

  if (unallocatedLegacy > 0 && neededQty > 0) {
    const fallbackCost = Number(productDoc.costPrice) || 0;
    const fallbackMrp = Number(productDoc.retailPrice) || fallbackCost;
    const fallbackPubDisc = Number(productDoc.publisherDiscountPercent) || 0;
    const deduct = Math.min(neededQty, unallocatedLegacy);
    const lineCogs = roundMoney(deduct * fallbackCost);
    totalCogs = roundMoney(totalCogs + lineCogs);
    neededQty -= deduct;

    depletedBatches.push({
      batchId: openingBatchId,
      quantity: deduct,
      unitCost: fallbackCost,
    });

    const openingBatchRef = doc(db!, STOCK_BATCHES_COLLECTION, openingBatchId);
    const remainingAfterDeduct = unallocatedLegacy - deduct;
    const openingBatchDoc: StockBatchDocument = {
      id: openingBatchId,
      productId: productDoc.id,
      productTitle: productDoc.title,
      purchaseId: 'OPENING_STOCK',
      purchaseInvoiceNo: 'OPENING_STOCK',
      purchaseDate: productDoc.createdAt ? productDoc.createdAt.split('T')[0] : '2020-01-01',
      quantityPurchased: unallocatedLegacy,
      remainingQuantity: remainingAfterDeduct,
      mrp: fallbackMrp,
      publisherDiscountPercent: fallbackPubDisc,
      unitCost: fallbackCost,
      totalCost: roundMoney(unallocatedLegacy * fallbackCost),
      batchType: 'opening',
      lastSaleId,
      createdAt: productDoc.createdAt || now,
      updatedAt: now,
    };
    transaction.set(openingBatchRef, openingBatchDoc, { merge: true });
    if (batchSnapshotMap) {
      batchSnapshotMap.set(openingBatchId, openingBatchDoc);
    }
  }

  // 2. Traverse existing active batches in FIFO order (opening batches first, then oldest purchases)
  for (const batch of activeBatches) {
    if (neededQty <= 0) break;
    const currentBatch = batchSnapshotMap?.get(batch.id) || batch;
    if (currentBatch.remainingQuantity <= 0) continue;

    const deduct = Math.min(neededQty, currentBatch.remainingQuantity);
    const newRemaining = currentBatch.remainingQuantity - deduct;
    const batchCost = Number(currentBatch.unitCost) || 0;
    const lineCogs = roundMoney(deduct * batchCost);

    totalCogs = roundMoney(totalCogs + lineCogs);
    neededQty -= deduct;

    depletedBatches.push({
      batchId: currentBatch.id,
      quantity: deduct,
      unitCost: batchCost,
    });

    // Update batch document remaining quantity
    const batchRef = doc(db!, STOCK_BATCHES_COLLECTION, currentBatch.id);
    const updateData: any = {
      remainingQuantity: newRemaining,
      updatedAt: now,
    };
    if (lastSaleId) {
      updateData.lastSaleId = lastSaleId;
    }
    transaction.update(batchRef, updateData);

    // Mutate in-memory copy
    currentBatch.remainingQuantity = newRemaining;
    batch.remainingQuantity = newRemaining;
  }

  // 3. If neededQty remains (e.g. legacy stock without prior batch records):
  // Create or consume from virtual opening stock batch at product's historical costPrice
  if (neededQty > 0) {
    const openingBatchRef = doc(db!, STOCK_BATCHES_COLLECTION, openingBatchId);
    const fallbackCost = Number(productDoc.costPrice) || 0;
    const fallbackMrp = Number(productDoc.retailPrice) || fallbackCost;
    const fallbackPubDisc = Number(productDoc.publisherDiscountPercent) || 0;

    const existingOpeningBatch = batchSnapshotMap?.get(openingBatchId);
    const deduct = neededQty;
    const lineCogs = roundMoney(deduct * fallbackCost);
    totalCogs = roundMoney(totalCogs + lineCogs);

    depletedBatches.push({
      batchId: openingBatchId,
      quantity: deduct,
      unitCost: fallbackCost,
    });

    if (existingOpeningBatch) {
      const currentOpeningRem = Math.max(0, existingOpeningBatch.remainingQuantity);
      const newRemaining = Math.max(0, currentOpeningRem - deduct);
      const updateData: any = {
        remainingQuantity: newRemaining,
        updatedAt: now,
      };
      if (lastSaleId) {
        updateData.lastSaleId = lastSaleId;
      }
      transaction.update(openingBatchRef, updateData);
      existingOpeningBatch.remainingQuantity = newRemaining;
    } else {
      // Calculate unallocated legacy inventory to assign to opening batch
      const existingBatchesSum = activeBatches.reduce(
        (sum, b) => sum + (b.batchType === 'opening' ? 0 : b.remainingQuantity),
        0
      );
      const legacyTotalQty = Math.max(0, Number(productDoc.currentStock || 0) - existingBatchesSum);
      const remainingAfterDeduct = Math.max(0, legacyTotalQty - deduct);

      const openingBatchDoc: StockBatchDocument = {
        id: openingBatchId,
        productId: productDoc.id,
        productTitle: productDoc.title,
        purchaseId: 'OPENING_STOCK',
        purchaseInvoiceNo: 'OPENING_STOCK',
        purchaseDate: productDoc.createdAt ? productDoc.createdAt.split('T')[0] : '2020-01-01',
        quantityPurchased: legacyTotalQty > 0 ? legacyTotalQty : deduct,
        remainingQuantity: remainingAfterDeduct,
        mrp: fallbackMrp,
        publisherDiscountPercent: fallbackPubDisc,
        unitCost: fallbackCost,
        totalCost: roundMoney((legacyTotalQty > 0 ? legacyTotalQty : deduct) * fallbackCost),
        batchType: 'opening',
        lastSaleId,
        createdAt: productDoc.createdAt || now,
        updatedAt: now,
      };

      transaction.set(openingBatchRef, openingBatchDoc, { merge: true });
      if (batchSnapshotMap) {
        batchSnapshotMap.set(openingBatchId, openingBatchDoc);
      }
    }
    neededQty = 0;
  }

  const effectiveUnitCost =
    quantityToDeplete > 0 ? roundMoney(totalCogs / quantityToDeplete) : 0;

  return {
    depletedBatches,
    totalCogs,
    effectiveUnitCost,
  };
};

/**
 * Safeguard 1 (Returns): Atomically restores returned saleable stock to its
 * original batches and preserves historical unit costs.
 * Correctly cascades multi-stage partial returns across all depleted batches
 * without quantity or valuation leakage.
 */
export const restoreBatchesInTransaction = (
  transaction: Transaction,
  productId: string,
  returnQty: number,
  originalDepletions: SaleItemBatchDepletion[] | undefined,
  fallbackCost: number,
  now: string,
  batchSnapshotMap?: Map<string, StockBatchDocument>,
  lastReturnNo?: string
): number => {
  let qtyToRestore = Math.floor(Number(returnQty));
  if (qtyToRestore <= 0) return 0;

  let restoredValue = 0;

  // 1. If original sale recorded the exact batches depleted, restore in reverse order (LIFO reversal)
  if (originalDepletions && originalDepletions.length > 0) {
    const reversed = [...originalDepletions].reverse();

    // Pre-validate total available headroom across all original depletions to prevent partial mutations
    let totalHeadroom = 0;
    for (const dep of reversed) {
      const currentBatch = batchSnapshotMap?.get(dep.batchId);
      const currentRemaining = currentBatch ? Number(currentBatch.remainingQuantity) || 0 : 0;
      const quantityPurchased = currentBatch ? Number(currentBatch.quantityPurchased) || 0 : 0;
      const maxCap = quantityPurchased > 0 ? quantityPurchased : (currentRemaining + dep.quantity);
      totalHeadroom += Math.max(0, maxCap - currentRemaining);
    }

    if (qtyToRestore > totalHeadroom) {
      throw new Error(
        `Multi-batch return error for product ${productId}: Cannot restore ${returnQty} units. Total available headroom across original depleted batches is only ${totalHeadroom} units; ${qtyToRestore - totalHeadroom} units remain unallocated.`
      );
    }

    for (const dep of reversed) {
      if (qtyToRestore <= 0) break;

      const batchRef = doc(db!, STOCK_BATCHES_COLLECTION, dep.batchId);
      const cost = Number(dep.unitCost) || fallbackCost;
      const currentBatch = batchSnapshotMap?.get(dep.batchId);
      const currentRemaining = currentBatch ? Number(currentBatch.remainingQuantity) || 0 : 0;
      const quantityPurchased = currentBatch ? Number(currentBatch.quantityPurchased) || 0 : 0;

      // Available headroom in this batch: cannot exceed quantityPurchased
      const maxCap = quantityPurchased > 0 ? quantityPurchased : (currentRemaining + dep.quantity);
      const availableHeadroom = Math.max(0, maxCap - currentRemaining);

      if (availableHeadroom <= 0) {
        // This batch is already at full capacity; proceed to earlier batches
        continue;
      }

      // Calculate actual units added to this batch
      const actualAdded = Math.min(qtyToRestore, availableHeadroom);
      if (actualAdded <= 0) continue;

      const newRemaining = currentRemaining + actualAdded;

      const updateData: any = {
        remainingQuantity: newRemaining,
        updatedAt: now,
      };
      if (lastReturnNo) {
        updateData.lastReturnNo = lastReturnNo;
      }

      transaction.update(batchRef, updateData);

      if (currentBatch) {
        currentBatch.remainingQuantity = newRemaining;
      }

      // Increase restoredValue only by actualAdded multiplied by the original batch unit cost
      restoredValue = roundMoney(restoredValue + actualAdded * cost);

      // Decrease qtyToRestore only by actualAdded
      qtyToRestore -= actualAdded;
    }

    // Fail-safe: If any quantity remains unallocated after checking all original depletions,
    // throw an explicit error rather than silently reporting a partial/incomplete restoration
    if (qtyToRestore > 0) {
      throw new Error(
        `Multi-batch return error for product ${productId}: Cannot restore ${returnQty} units. All original depleted batches have reached maximum intake capacity; ${qtyToRestore} units remain unallocated.`
      );
    }
  } else {
    // 2. Legacy sale without batch records: restore to opening stock batch
    const openingBatchId = getOpeningStockBatchId(productId);
    const openingBatchRef = doc(db!, STOCK_BATCHES_COLLECTION, openingBatchId);
    const cost = fallbackCost;
    const currentOpening = batchSnapshotMap?.get(openingBatchId);
    const currentRemaining = currentOpening ? Number(currentOpening.remainingQuantity) || 0 : 0;
    const newRemaining = currentRemaining + qtyToRestore;

    const updateData: any = {
      remainingQuantity: newRemaining,
      updatedAt: now,
    };
    if (lastReturnNo) {
      updateData.lastReturnNo = lastReturnNo;
    }

    if (currentOpening) {
      transaction.update(openingBatchRef, updateData);
      currentOpening.remainingQuantity = newRemaining;
    } else {
      const openingBatchDoc: StockBatchDocument = {
        id: openingBatchId,
        productId,
        productTitle: 'Restored Opening Stock',
        purchaseId: 'OPENING_STOCK',
        purchaseInvoiceNo: 'OPENING_STOCK',
        purchaseDate: now.split('T')[0],
        quantityPurchased: newRemaining,
        remainingQuantity: newRemaining,
        mrp: cost,
        publisherDiscountPercent: 0,
        unitCost: cost,
        totalCost: roundMoney(newRemaining * cost),
        batchType: 'opening',
        lastReturnNo,
        createdAt: now,
        updatedAt: now,
      };
      transaction.set(openingBatchRef, openingBatchDoc, { merge: true });
      if (batchSnapshotMap) {
        batchSnapshotMap.set(openingBatchId, openingBatchDoc);
      }
    }

    restoredValue = roundMoney(qtyToRestore * cost);
    qtyToRestore = 0;
  }

  return restoredValue;
};

/**
 * Manual Stock Adjustment (Addition): Atomically increments or creates a stock batch
 * for manual physical stock adjustments (e.g. audit correction, found stock).
 * Preserves cost basis and records asset value added.
 */
export const addStockBatchInTransaction = (
  transaction: Transaction,
  productDoc: ProductDocument,
  quantityToAdd: number,
  costBasis: number,
  reason: string,
  now: string,
  batchSnapshotMap?: Map<string, StockBatchDocument>
): number => {
  const qty = Math.floor(Number(quantityToAdd));
  if (qty <= 0) return 0;

  const cost = roundMoney(Number(costBasis) || Number(productDoc.costPrice) || 0);
  const openingBatchId = getOpeningStockBatchId(productDoc.id);
  const openingBatchRef = doc(db!, STOCK_BATCHES_COLLECTION, openingBatchId);
  const existingOpening = batchSnapshotMap?.get(openingBatchId);

  if (existingOpening) {
    const newRemaining = existingOpening.remainingQuantity + qty;
    const newPurchased = Math.max(newRemaining, (existingOpening.quantityPurchased || 0) + qty);
    transaction.update(openingBatchRef, {
      remainingQuantity: newRemaining,
      quantityPurchased: newPurchased,
      totalCost: roundMoney(newPurchased * cost),
      updatedAt: now,
    });
    existingOpening.remainingQuantity = newRemaining;
    existingOpening.quantityPurchased = newPurchased;
  } else {
    const openingBatchDoc: StockBatchDocument = {
      id: openingBatchId,
      productId: productDoc.id,
      productTitle: productDoc.title,
      purchaseId: 'STOCK_ADJUSTMENT',
      purchaseInvoiceNo: `ADJ_${reason.toUpperCase()}`,
      purchaseDate: now.split('T')[0],
      quantityPurchased: qty,
      remainingQuantity: qty,
      mrp: Number(productDoc.retailPrice) || cost,
      publisherDiscountPercent: Number(productDoc.publisherDiscountPercent) || 0,
      unitCost: cost,
      totalCost: roundMoney(qty * cost),
      batchType: 'opening',
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(openingBatchRef, openingBatchDoc, { merge: true });
    if (batchSnapshotMap) {
      batchSnapshotMap.set(openingBatchId, openingBatchDoc);
    }
  }

  return roundMoney(qty * cost);
};

/**
 * Calculates accurate total stock asset valuation for a product based on its
 * remaining batch quantities and their actual publisher-discounted unit costs.
 */
export const calculateProductValuationFromBatches = (
  product: ProductDocument,
  batches: StockBatchDocument[]
): number => {
  const currentStock = Number(product.currentStock) || 0;
  if (currentStock <= 0) return 0;

  let totalValuation = 0;
  let batchQtySum = 0;

  for (const b of batches) {
    if (b.remainingQuantity > 0) {
      const activeQty = Number(b.remainingQuantity);
      const unitCost = Number(b.unitCost) || 0;
      totalValuation = roundMoney(totalValuation + activeQty * unitCost);
      batchQtySum += activeQty;
    }
  }

  // If active batches don't account for all physical stock (e.g. unmigrated legacy balance):
  if (batchQtySum < currentStock) {
    const unallocated = currentStock - batchQtySum;
    const fallbackCost = Number(product.costPrice) || 0;
    totalValuation = roundMoney(totalValuation + unallocated * fallbackCost);
  }

  return roundMoney(totalValuation);
};
