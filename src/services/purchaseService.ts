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
  StockBatchDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { INVENTORY_SUMMARY_DOC_ID } from './summaryService';
import {
  STOCK_BATCHES_COLLECTION,
  getStockBatchId,
  getOpeningStockBatchId,
  getActiveBatchesForProduct,
} from './stockBatchService';

const roundMoney = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;

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
    mrp?: number;
    publisherDiscountPercent?: number;
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
      mrp: it.mrp !== undefined ? Number(it.mrp) : undefined,
      publisherDiscountPercent: it.publisherDiscountPercent !== undefined ? Number(it.publisherDiscountPercent) : undefined,
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

  // Pre-load existing active batches outside transaction to detect legacy stock coverage
  const preloadedBatchesMap = new Map<string, StockBatchDocument[]>();
  for (const item of input.items) {
    if (item.productId && !preloadedBatchesMap.has(item.productId)) {
      const batches = await getActiveBatchesForProduct(item.productId);
      preloadedBatchesMap.set(item.productId, batches);
    }
  }

  // Run atomic transaction across all affected documents
  await runTransaction(db, async (transaction) => {
    // 1. Transactional reads of all products and opening batches
    const productSnapshots: Array<{
      ref: any;
      doc: ProductDocument;
      openingBatchRef: any;
      openingBatchSnap: any;
    }> = [];
    for (const item of input.items) {
      const prodRef = doc(db!, 'products', item.productId);
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists()) {
        throw new Error(`Product "${item.productName}" (ID: ${item.productId}) not found.`);
      }
      const openingBatchId = getOpeningStockBatchId(item.productId);
      const openingBatchRef = doc(db!, STOCK_BATCHES_COLLECTION, openingBatchId);
      const openingBatchSnap = await transaction.get(openingBatchRef);

      productSnapshots.push({
        ref: prodRef,
        doc: prodSnap.data() as ProductDocument,
        openingBatchRef,
        openingBatchSnap,
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

    // 5. Writes: Update each product, record FIFO stock batch, and log stock movements
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

      const lineMrp = item.mrp !== undefined ? Number(item.mrp) : (prodEntry.doc.retailPrice || Number(item.unitCost));
      const linePubDisc = item.publisherDiscountPercent !== undefined ? Number(item.publisherDiscountPercent) : 0;

      // Duplicate-safe legacy opening batch materialization:
      // If legacy stock existed before this purchase and does not have an opening batch yet,
      // create BATCH_OPEN with pre-purchase stock and catalog cost basis to preserve strict FIFO depletion order.
      if (!prodEntry.openingBatchSnap.exists()) {
        const existingBatches = preloadedBatchesMap.get(item.productId) || [];
        const sumExistingBatchQty = existingBatches.reduce(
          (sum, b) => sum + (b.batchType === 'opening' ? 0 : Number(b.remainingQuantity || 0)),
          0
        );
        const legacyQty = Math.max(0, currentStock - sumExistingBatchQty);
        if (legacyQty > 0) {
          const fallbackCost = Number(prodEntry.doc.costPrice) || 0;
          const fallbackMrp = Number(prodEntry.doc.retailPrice) || fallbackCost;
          const fallbackPubDisc = Number(prodEntry.doc.publisherDiscountPercent) || 0;
          const openingBatchDoc: StockBatchDocument = {
            id: prodEntry.openingBatchRef.id,
            productId: item.productId,
            productTitle: prodEntry.doc.title || item.productName,
            purchaseId: 'OPENING_STOCK',
            purchaseInvoiceNo: 'OPENING_STOCK',
            purchaseDate: prodEntry.doc.createdAt ? prodEntry.doc.createdAt.split('T')[0] : '2020-01-01',
            quantityPurchased: legacyQty,
            remainingQuantity: legacyQty,
            mrp: fallbackMrp,
            publisherDiscountPercent: fallbackPubDisc,
            unitCost: fallbackCost,
            totalCost: roundMoney(legacyQty * fallbackCost),
            batchType: 'opening',
            createdAt: prodEntry.doc.createdAt || now,
            updatedAt: now,
          };
          transaction.set(prodEntry.openingBatchRef, openingBatchDoc);
        }
      }

      // Create distinct FIFO stock intake batch for this purchase line
      const batchId = getStockBatchId(purchaseRef.id, item.productId);
      const batchRef = doc(db!, STOCK_BATCHES_COLLECTION, batchId);
      const batchDoc: StockBatchDocument = {
        id: batchId,
        productId: item.productId,
        productTitle: item.productName,
        purchaseId: purchaseRef.id,
        purchaseInvoiceNo: cleanInvoiceNo,
        purchaseDate: input.purchaseDate || now.split('T')[0],
        quantityPurchased: Number(item.quantity),
        remainingQuantity: Number(item.quantity),
        mrp: lineMrp,
        publisherDiscountPercent: linePubDisc,
        unitCost: Number(item.unitCost),
        totalCost: Number(item.totalCost),
        batchType: 'purchase',
        createdAt: now,
        updatedAt: now,
      };
      transaction.set(batchRef, batchDoc);

      // Update product currentStock and latest costPrice (default quote for subsequent views, does NOT rewrite old batches)
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

/**
 * Deletes a purchase invoice atomically:
 * 1. Reverses stock additions from products and adjusts lowStock status.
 * 2. Deletes the FIFO batches created by this purchase invoice.
 * 3. Records an immutable stock movement ('out' / 'purchase_deletion') for each product.
 * 4. Adjusts supplier currentBalance (deducting the remaining balance added by this purchase).
 * 5. Updates global inventory summary quantity and valuation atomically.
 * 6. Deletes the purchase document and records an audit log.
 */
export const deletePurchaseTransaction = async (
  purchaseId: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<{ success: boolean; deletedInvoiceNo: string }> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!purchaseId) throw new Error('Purchase ID is required');

  const purchaseRef = doc(db, 'purchases', purchaseId);
  const now = new Date().toISOString();
  let deletedInvoiceNo = '';

  await runTransaction(db, async (transaction) => {
    // 1. Transactional Read of purchase document
    const purchaseSnap = await transaction.get(purchaseRef);
    if (!purchaseSnap.exists()) {
      throw new Error(`Purchase invoice record "${purchaseId}" was not found.`);
    }

    const purchaseDoc = purchaseSnap.data() as PurchaseDocument;
    deletedInvoiceNo = purchaseDoc.purchaseInvoiceNo;

    // 2. Read all affected products
    const productSnapshots: Array<{
      ref: any;
      doc: ProductDocument;
      item: (typeof purchaseDoc.items)[0];
    }> = [];

    for (const item of purchaseDoc.items) {
      const prodRef = doc(db!, 'products', item.productId);
      const prodSnap = await transaction.get(prodRef);
      if (prodSnap.exists()) {
        productSnapshots.push({
          ref: prodRef,
          doc: prodSnap.data() as ProductDocument,
          item,
        });
      }
    }

    // 3. Read supplier doc if remaining balance exists
    let supRef: any = null;
    let supSnap: any = null;
    if (purchaseDoc.remainingBalance > 0 && purchaseDoc.supplierId) {
      supRef = doc(db!, 'suppliers', purchaseDoc.supplierId);
      supSnap = await transaction.get(supRef);
    }

    // 4. Read inventory summary doc
    const summaryRef = doc(db!, 'settings', INVENTORY_SUMMARY_DOC_ID);
    const summarySnap = await transaction.get(summaryRef);

    // -----------------------------------------------------------------
    // WRITES PHASE
    // -----------------------------------------------------------------
    let totalQtyRemoved = 0;
    let totalValRemoved = 0;
    let lowStockDelta = 0;

    for (const { ref: prodRef, doc: prodData, item } of productSnapshots) {
      const currentStock = Number(prodData.currentStock || 0);
      const newStock = Math.max(0, currentStock - Number(item.quantity));
      const lowThreshold = Number(prodData.lowStockThreshold || 0);
      const wasLow = currentStock <= lowThreshold;
      const isNowLow = newStock <= lowThreshold;

      if (!wasLow && isNowLow) lowStockDelta += 1;
      if (wasLow && !isNowLow) lowStockDelta -= 1;

      totalQtyRemoved += Number(item.quantity);
      totalValRemoved += Number(item.totalCost || item.quantity * item.unitCost);

      // Revert product currentStock
      transaction.update(prodRef, {
        currentStock: newStock,
        isLowStock: isNowLow,
        updatedAt: now,
      });

      // Delete the FIFO stock batch for this purchase line
      const batchId = getStockBatchId(purchaseDoc.id, item.productId);
      const batchRef = doc(db!, STOCK_BATCHES_COLLECTION, batchId);
      transaction.delete(batchRef);

      // Record immutable stock movement reversal
      const moveRef = doc(collection(db!, 'stockMovements'));
      const movement: StockMovementDocument = {
        id: moveRef.id,
        productId: item.productId,
        productName: item.productName,
        movementType: 'out',
        quantity: Number(item.quantity),
        previousStock: currentStock,
        newStock: newStock,
        reason: 'purchase_deletion',
        referenceDocId: purchaseDoc.id,
        recordedByUserId: userId,
        createdAt: now,
      };
      transaction.set(moveRef, movement);
    }

    // Adjust supplier currentBalance (deduct the debt this purchase added)
    if (supRef && supSnap && supSnap.exists()) {
      const currentSupBal = Number(supSnap.data().currentBalance || 0);
      const newSupBal = Math.max(0, currentSupBal - purchaseDoc.remainingBalance);
      transaction.update(supRef, {
        currentBalance: newSupBal,
        updatedAt: now,
      });
    }

    // Atomically decrement global inventory summary
    if (summarySnap && summarySnap.exists()) {
      transaction.update(summaryRef, {
        totalStockQuantity: increment(-totalQtyRemoved),
        totalStockValue: increment(-totalValRemoved),
        lowStockCount: increment(lowStockDelta),
        updatedAt: now,
      });
    }

    // Delete purchase record
    transaction.delete(purchaseRef);
  });

  await logAuditEvent(
    'DELETE_PURCHASE',
    'purchases',
    `Purchase invoice "${deletedInvoiceNo}" deleted. Inventory stock and supplier balances adjusted.`,
    purchaseId,
    userId,
    userEmail
  );

  return { success: true, deletedInvoiceNo };
};

/**
 * Updates an existing purchase invoice atomically:
 * 1. Adjusts stock quantities and latest costs based on differences between old and new items.
 * 2. Replaces/updates FIFO batches for this purchase.
 * 3. Reconciles supplier balances for the changed remaining debt.
 * 4. Updates inventory summary metrics.
 * 5. Saves the updated purchase document and writes an audit event.
 */
export const updatePurchaseTransaction = async (
  purchaseId: string,
  input: CreatePurchaseInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<PurchaseDocument> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!purchaseId) throw new Error('Purchase ID is required');

  if (!input.items || input.items.length === 0) {
    throw new Error('A purchase must contain at least one product item.');
  }

  const cleanInvoiceNo = input.purchaseInvoiceNo.trim();
  if (!cleanInvoiceNo) {
    throw new Error('Invoice / Bill reference number is required.');
  }

  const purchaseRef = doc(db, 'purchases', purchaseId);
  const now = new Date().toISOString();
  const newRemainingBalance = Math.max(0, Number(input.grandTotal) - (Number(input.paidAmount) || 0));

  let finalPurchaseDoc: PurchaseDocument | null = null;

  await runTransaction(db, async (transaction) => {
    // 1. Transactional read of existing purchase
    const oldSnap = await transaction.get(purchaseRef);
    if (!oldSnap.exists()) {
      throw new Error(`Purchase record "${purchaseId}" not found.`);
    }
    const oldDoc = oldSnap.data() as PurchaseDocument;

    // Collect all involved product IDs (both old and new)
    const allProductIds = Array.from(
      new Set([...oldDoc.items.map((i) => i.productId), ...input.items.map((i) => i.productId)])
    );

    // Read all products
    const productSnaps = await Promise.all(
      allProductIds.map(async (pId) => {
        const pRef = doc(db!, 'products', pId);
        const pSnap = await transaction.get(pRef);
        return { id: pId, ref: pRef, snap: pSnap };
      })
    );
    const prodMap = new Map(productSnaps.map((p) => [p.id, p]));

    // Read suppliers (both old and new if different)
    let oldSupRef: any = null;
    let oldSupSnap: any = null;
    if (oldDoc.supplierId) {
      oldSupRef = doc(db!, 'suppliers', oldDoc.supplierId);
      oldSupSnap = await transaction.get(oldSupRef);
    }

    let newSupRef: any = null;
    let newSupSnap: any = null;
    if (input.supplierId && input.supplierId !== oldDoc.supplierId) {
      newSupRef = doc(db!, 'suppliers', input.supplierId);
      newSupSnap = await transaction.get(newSupRef);
    }

    // Read inventory summary
    const summaryRef = doc(db!, 'settings', INVENTORY_SUMMARY_DOC_ID);
    const summarySnap = await transaction.get(summaryRef);

    // -----------------------------------------------------------------
    // WRITES PHASE
    // -----------------------------------------------------------------
    let totalQtyDelta = 0;
    let totalValDelta = 0;
    let lowStockDelta = 0;

    // Build old items map
    const oldItemMap = new Map<string, { qty: number; unitCost: number; totalCost: number }>();
    for (const it of oldDoc.items) {
      const prev = oldItemMap.get(it.productId) || { qty: 0, unitCost: it.unitCost, totalCost: 0 };
      oldItemMap.set(it.productId, {
        qty: prev.qty + it.quantity,
        unitCost: it.unitCost,
        totalCost: prev.totalCost + it.totalCost,
      });
    }

    // Build new items map
    const newItemMap = new Map<
      string,
      {
        qty: number;
        unitCost: number;
        mrp?: number;
        pubDisc?: number;
        item: (typeof input.items)[0];
      }
    >();
    for (const it of input.items) {
      const prev = newItemMap.get(it.productId) || {
        qty: 0,
        unitCost: Number(it.unitCost),
        mrp: it.mrp !== undefined ? Number(it.mrp) : undefined,
        pubDisc: it.publisherDiscountPercent !== undefined ? Number(it.publisherDiscountPercent) : undefined,
        item: it,
      };
      newItemMap.set(it.productId, {
        qty: prev.qty + Number(it.quantity),
        unitCost: Number(it.unitCost),
        mrp: it.mrp !== undefined ? Number(it.mrp) : prev.mrp,
        pubDisc: it.publisherDiscountPercent !== undefined ? Number(it.publisherDiscountPercent) : prev.pubDisc,
        item: it,
      });
    }

    for (const pId of allProductIds) {
      const pEntry = prodMap.get(pId);
      if (!pEntry || !pEntry.snap.exists()) continue;

      const pData = pEntry.snap.data() as ProductDocument;
      const currentStock = Number(pData.currentStock || 0);
      const oldQty = oldItemMap.get(pId)?.qty || 0;
      const newQty = newItemMap.get(pId)?.qty || 0;
      const deltaQty = newQty - oldQty;

      const newStock = Math.max(0, currentStock + deltaQty);
      const lowThreshold = Number(pData.lowStockThreshold || 0);
      const wasLow = currentStock <= lowThreshold;
      const isNowLow = newStock <= lowThreshold;

      if (!wasLow && isNowLow) lowStockDelta += 1;
      if (wasLow && !isNowLow) lowStockDelta -= 1;

      totalQtyDelta += deltaQty;

      const newEntry = newItemMap.get(pId);
      const latestCost = newEntry ? newEntry.unitCost : Number(pData.costPrice || 0);

      // Update product document
      transaction.update(pEntry.ref, {
        currentStock: newStock,
        costPrice: latestCost,
        isLowStock: isNowLow,
        updatedAt: now,
      });

      // Update or delete purchase FIFO batch
      const batchId = getStockBatchId(purchaseRef.id, pId);
      const batchRef = doc(db!, STOCK_BATCHES_COLLECTION, batchId);

      if (newQty > 0 && newEntry) {
        const lineMrp = newEntry.mrp || pData.retailPrice || newEntry.unitCost;
        const lineDisc = newEntry.pubDisc || 0;
        const batchDoc: StockBatchDocument = {
          id: batchId,
          productId: pId,
          productTitle: newEntry.item.productName,
          purchaseId: purchaseRef.id,
          purchaseInvoiceNo: cleanInvoiceNo,
          purchaseDate: input.purchaseDate || now.split('T')[0],
          quantityPurchased: newQty,
          remainingQuantity: newQty,
          mrp: lineMrp,
          publisherDiscountPercent: lineDisc,
          unitCost: newEntry.unitCost,
          totalCost: roundMoney(newQty * newEntry.unitCost),
          batchType: 'purchase',
          createdAt: oldDoc.createdAt || now,
          updatedAt: now,
        };
        transaction.set(batchRef, batchDoc);
      } else {
        // Item removed in this edit
        transaction.delete(batchRef);
      }

      // Record audit stock movement if net quantity changed
      if (deltaQty !== 0) {
        const moveRef = doc(collection(db!, 'stockMovements'));
        const movement: StockMovementDocument = {
          id: moveRef.id,
          productId: pId,
          productName: pData.title,
          movementType: deltaQty > 0 ? 'in' : 'out',
          quantity: Math.abs(deltaQty),
          previousStock: currentStock,
          newStock: newStock,
          reason: 'purchase_edit',
          referenceDocId: purchaseRef.id,
          recordedByUserId: userId,
          createdAt: now,
        };
        transaction.set(moveRef, movement);
      }
    }

    // Value delta
    const oldTotalCost = oldDoc.items.reduce((s, it) => s + it.totalCost, 0);
    const newTotalCost = input.items.reduce((s, it) => s + Number(it.totalCost), 0);
    totalValDelta = newTotalCost - oldTotalCost;

    // Supplier balance adjustments
    const oldRemaining = Number(oldDoc.remainingBalance || 0);

    if (oldDoc.supplierId === input.supplierId) {
      if (oldSupRef && oldSupSnap && oldSupSnap.exists()) {
        const curSupBal = Number(oldSupSnap.data().currentBalance || 0);
        const deltaBal = newRemainingBalance - oldRemaining;
        transaction.update(oldSupRef, {
          currentBalance: Math.max(0, curSupBal + deltaBal),
          updatedAt: now,
        });
      }
    } else {
      // Supplier was changed to a different supplier
      if (oldSupRef && oldSupSnap && oldSupSnap.exists()) {
        const curOldBal = Number(oldSupSnap.data().currentBalance || 0);
        transaction.update(oldSupRef, {
          currentBalance: Math.max(0, curOldBal - oldRemaining),
          updatedAt: now,
        });
      }
      if (newSupRef && newSupSnap && newSupSnap.exists()) {
        const curNewBal = Number(newSupSnap.data().currentBalance || 0);
        transaction.update(newSupRef, {
          currentBalance: curNewBal + newRemainingBalance,
          updatedAt: now,
        });
      }
    }

    // Update global inventory summary
    if (summarySnap && summarySnap.exists()) {
      transaction.update(summaryRef, {
        totalStockQuantity: increment(totalQtyDelta),
        totalStockValue: increment(totalValDelta),
        lowStockCount: increment(lowStockDelta),
        updatedAt: now,
      });
    }

    // Update purchase document
    const updatedPurchase: PurchaseDocument = {
      id: purchaseRef.id,
      purchaseInvoiceNo: cleanInvoiceNo,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      items: input.items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        quantity: Number(it.quantity),
        mrp: it.mrp !== undefined ? Number(it.mrp) : undefined,
        publisherDiscountPercent: it.publisherDiscountPercent !== undefined ? Number(it.publisherDiscountPercent) : undefined,
        unitCost: Number(it.unitCost),
        totalCost: Number(it.totalCost),
      })),
      subtotal: Number(input.subtotal),
      discountAmount: Number(input.discountAmount) || 0,
      grandTotal: Number(input.grandTotal),
      paidAmount: Number(input.paidAmount) || 0,
      remainingBalance: newRemainingBalance,
      paymentMethod: input.paymentMethod,
      purchaseDate: input.purchaseDate || oldDoc.purchaseDate,
      receivedByUserId: userId,
      notes: input.notes?.trim() || '',
      createdAt: oldDoc.createdAt,
      updatedAt: now,
    };

    transaction.update(purchaseRef, updatedPurchase);
    finalPurchaseDoc = updatedPurchase;
  });

  await logAuditEvent(
    'UPDATE_PURCHASE',
    'purchases',
    `Purchase updated: ${cleanInvoiceNo} from ${input.supplierName} (Total: PKR ${input.grandTotal}, Items: ${input.items.length})`,
    purchaseId,
    userId,
    userEmail
  );

  return finalPurchaseDoc!;
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
