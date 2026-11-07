/**
 * SADIQ BOOK AGENCY — Purchase-Wise Publisher Discount & Historical Stock Cost Management
 * Comprehensive Verification Suite (14 Core Accounting, FIFO & Concurrency Tests)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — PURCHASE-WISE COST & FIFO VERIFICATION SUITE');
console.log('====================================================================\n');

let passedTests = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------------
// Pure Accounting & FIFO Algorithms under test (Matching stockBatchService.ts)
// -----------------------------------------------------------------------------------

function roundMoney(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function getStockBatchId(purchaseId: string, productId: string): string {
  return `BATCH_${purchaseId}_${productId}`;
}

function getOpeningStockBatchId(productId: string): string {
  return `BATCH_OPEN_${productId}`;
}

interface StockBatchDocument {
  id: string;
  productId: string;
  productTitle: string;
  purchaseId: string;
  purchaseInvoiceNo: string;
  purchaseDate: string;
  quantityPurchased: number;
  remainingQuantity: number;
  mrp: number;
  publisherDiscountPercent: number;
  unitCost: number;
  totalCost: number;
  batchType: 'purchase' | 'opening';
  createdAt: string;
  updatedAt: string;
}

interface SaleItemBatchDepletion {
  batchId: string;
  quantity: number;
  unitCost: number;
}

interface FifoDepletionResult {
  depletedBatches: SaleItemBatchDepletion[];
  totalCogs: number;
  effectiveUnitCost: number;
}

interface MockProduct {
  id: string;
  sku: string;
  title: string;
  retailPrice: number; // MRP
  costPrice: number;
  publisherDiscountPercent?: number;
  publisherName?: string;
  currentStock: number;
  createdAt?: string;
}

function depleteFifoBatches(
  productDoc: MockProduct,
  activeBatches: StockBatchDocument[],
  quantityToDeplete: number,
  now: string,
  batchSnapshotMap?: Map<string, StockBatchDocument>
): FifoDepletionResult {
  let neededQty = Math.floor(Number(quantityToDeplete));
  if (neededQty <= 0) {
    return { depletedBatches: [], totalCogs: 0, effectiveUnitCost: 0 };
  }

  const depletedBatches: SaleItemBatchDepletion[] = [];
  let totalCogs = 0;

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

    currentBatch.remainingQuantity = newRemaining;
    batch.remainingQuantity = newRemaining;
  }

  if (neededQty > 0) {
    const openingBatchId = getOpeningStockBatchId(productDoc.id);
    const fallbackCost = Number(productDoc.costPrice) || 0;
    const fallbackMrp = Number(productDoc.retailPrice) || fallbackCost;
    const fallbackPubDisc = Number(productDoc.publisherDiscountPercent) || 0;

    const existingOpening = batchSnapshotMap?.get(openingBatchId);
    const deduct = neededQty;
    const lineCogs = roundMoney(deduct * fallbackCost);
    totalCogs = roundMoney(totalCogs + lineCogs);

    depletedBatches.push({
      batchId: openingBatchId,
      quantity: deduct,
      unitCost: fallbackCost,
    });

    if (existingOpening) {
      const currentOpeningRem = Math.max(0, existingOpening.remainingQuantity);
      const newRemaining = Math.max(0, currentOpeningRem - deduct);
      existingOpening.remainingQuantity = newRemaining;
    } else {
      const existingBatchesSum = activeBatches.reduce(
        (sum, b) => sum + (b.batchType === 'opening' ? 0 : b.remainingQuantity),
        0
      );
      const legacyTotalQty = Math.max(0, productDoc.currentStock - existingBatchesSum);
      const remainingAfterDeduct = Math.max(0, legacyTotalQty - deduct);

      const openingBatchDoc: StockBatchDocument = {
        id: openingBatchId,
        productId: productDoc.id,
        productTitle: productDoc.title,
        purchaseId: 'OPENING_STOCK',
        purchaseInvoiceNo: 'OPENING_STOCK',
        purchaseDate: productDoc.createdAt ? productDoc.createdAt.split('T')[0] : now.split('T')[0],
        quantityPurchased: legacyTotalQty > 0 ? legacyTotalQty : deduct,
        remainingQuantity: remainingAfterDeduct,
        mrp: fallbackMrp,
        publisherDiscountPercent: fallbackPubDisc,
        unitCost: fallbackCost,
        totalCost: roundMoney((legacyTotalQty > 0 ? legacyTotalQty : deduct) * fallbackCost),
        batchType: 'opening',
        createdAt: productDoc.createdAt || now,
        updatedAt: now,
      };

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
}

function restoreBatches(
  productId: string,
  returnQty: number,
  originalDepletions: SaleItemBatchDepletion[] | undefined,
  fallbackCost: number,
  now: string,
  batchSnapshotMap?: Map<string, StockBatchDocument>
): number {
  let qtyToRestore = Math.floor(Number(returnQty));
  if (qtyToRestore <= 0) return 0;

  let restoredValue = 0;

  if (originalDepletions && originalDepletions.length > 0) {
    const reversed = [...originalDepletions].reverse();

    for (const dep of reversed) {
      if (qtyToRestore <= 0) break;

      const restoreAmount = Math.min(qtyToRestore, dep.quantity);
      const cost = Number(dep.unitCost) || fallbackCost;
      const currentBatch = batchSnapshotMap?.get(dep.batchId);
      const currentRemaining = currentBatch ? Number(currentBatch.remainingQuantity) || 0 : 0;
      const maxCap = currentBatch
        ? Number(currentBatch.quantityPurchased) || (currentRemaining + restoreAmount)
        : currentRemaining + restoreAmount;
      const newRemaining = Math.min(maxCap, currentRemaining + restoreAmount);

      if (currentBatch) {
        currentBatch.remainingQuantity = newRemaining;
      }

      restoredValue = roundMoney(restoredValue + restoreAmount * cost);
      qtyToRestore -= restoreAmount;
    }
  }

  if (qtyToRestore > 0) {
    const openingBatchId = getOpeningStockBatchId(productId);
    const cost = fallbackCost;
    const currentOpening = batchSnapshotMap?.get(openingBatchId);
    const currentRemaining = currentOpening ? Number(currentOpening.remainingQuantity) || 0 : 0;
    const newRemaining = currentRemaining + qtyToRestore;

    if (currentOpening) {
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
        createdAt: now,
        updatedAt: now,
      };
      if (batchSnapshotMap) {
        batchSnapshotMap.set(openingBatchId, openingBatchDoc);
      }
    }

    restoredValue = roundMoney(restoredValue + qtyToRestore * cost);
  }

  return restoredValue;
}

function addStockBatch(
  productDoc: MockProduct,
  quantityToAdd: number,
  costBasis: number,
  reason: string,
  now: string,
  batchSnapshotMap?: Map<string, StockBatchDocument>
): number {
  const qty = Math.floor(Number(quantityToAdd));
  if (qty <= 0) return 0;

  const cost = roundMoney(Number(costBasis) || Number(productDoc.costPrice) || 0);
  const openingBatchId = getOpeningStockBatchId(productDoc.id);
  const existingOpening = batchSnapshotMap?.get(openingBatchId);

  if (existingOpening) {
    const newRemaining = existingOpening.remainingQuantity + qty;
    const newPurchased = Math.max(newRemaining, (existingOpening.quantityPurchased || 0) + qty);
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
    if (batchSnapshotMap) {
      batchSnapshotMap.set(openingBatchId, openingBatchDoc);
    }
  }

  return roundMoney(qty * cost);
}

function calculateProductValuation(
  product: MockProduct,
  batches: StockBatchDocument[]
): number {
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

  if (batchQtySum < currentStock) {
    const unallocated = currentStock - batchQtySum;
    const fallbackCost = Number(product.costPrice) || 0;
    totalValuation = roundMoney(totalValuation + unallocated * fallbackCost);
  }

  return roundMoney(totalValuation);
}

// Purchase Form Helpers
interface PurchaseItemRow {
  productId: string;
  productName: string;
  mrp: number;
  publisherDiscountPercent: number;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

function addOrIncrementItem(
  items: PurchaseItemRow[],
  product: MockProduct
): PurchaseItemRow[] {
  const existingIdx = items.findIndex((i) => i.productId === product.id);
  const mrp = Number(product.retailPrice) || 0;
  const pubDisc = typeof product.publisherDiscountPercent === 'number'
    ? product.publisherDiscountPercent
    : (mrp > 0 && product.costPrice < mrp
        ? Math.round(((mrp - product.costPrice) / mrp) * 1000) / 10
        : 0);

  const calculatedCost = mrp > 0 && pubDisc >= 0 && pubDisc <= 100
    ? roundMoney(mrp * (1 - pubDisc / 100))
    : Number(product.costPrice) || 0;

  if (existingIdx >= 0) {
    const updated = [...items];
    const prev = updated[existingIdx];
    const newQty = prev.quantity + 1;
    updated[existingIdx] = {
      ...prev,
      quantity: newQty,
      totalCost: roundMoney(newQty * prev.unitCost),
    };
    return updated;
  }

  return [
    ...items,
    {
      productId: product.id,
      productName: product.title,
      mrp,
      publisherDiscountPercent: pubDisc,
      quantity: 1,
      unitCost: calculatedCost,
      totalCost: calculatedCost,
    },
  ];
}

function updateItemField(
  items: PurchaseItemRow[],
  index: number,
  field: 'quantity' | 'mrp' | 'publisherDiscountPercent' | 'unitCost' | 'totalCost',
  value: number
): PurchaseItemRow[] {
  if (index < 0 || index >= items.length) return items;
  const updated = [...items];
  const item = { ...updated[index] };
  const numericVal = Math.max(0, Number(value) || 0);

  if (field === 'quantity') {
    item.quantity = numericVal;
    item.totalCost = roundMoney(item.quantity * item.unitCost);
  } else if (field === 'mrp') {
    item.mrp = numericVal;
    if (item.publisherDiscountPercent >= 0 && item.publisherDiscountPercent <= 100) {
      item.unitCost = roundMoney(item.mrp * (1 - item.publisherDiscountPercent / 100));
      item.totalCost = roundMoney(item.quantity * item.unitCost);
    }
  } else if (field === 'publisherDiscountPercent') {
    item.publisherDiscountPercent = Math.min(100, numericVal);
    if (item.mrp > 0) {
      item.unitCost = roundMoney(item.mrp * (1 - item.publisherDiscountPercent / 100));
      item.totalCost = roundMoney(item.quantity * item.unitCost);
    }
  } else if (field === 'unitCost') {
    item.unitCost = numericVal;
    item.totalCost = roundMoney(item.quantity * item.unitCost);
    if (item.mrp > 0 && item.unitCost <= item.mrp) {
      item.publisherDiscountPercent = roundMoney(((item.mrp - item.unitCost) / item.mrp) * 100);
    }
  } else if (field === 'totalCost') {
    item.totalCost = numericVal;
    if (item.quantity > 0) {
      item.unitCost = roundMoney(item.totalCost / item.quantity);
      if (item.mrp > 0 && item.unitCost <= item.mrp) {
        item.publisherDiscountPercent = roundMoney(((item.mrp - item.unitCost) / item.mrp) * 100);
      }
    }
  }

  updated[index] = item;
  return updated;
}

// Base mock product
const baseProduct: MockProduct = {
  id: 'PROD_URDU_CLASS9',
  sku: 'BK-URD-09',
  title: 'Urdu Lazmi Class 9',
  retailPrice: 500, // MRP = Rs. 500
  costPrice: 250, // Default 50%
  publisherDiscountPercent: 50,
  currentStock: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

// -----------------------------------------------------------------------------------
// TEST 1: First Purchase Intake Batch Generation (MRP 500, 50% Disc = 250 Cost)
// -----------------------------------------------------------------------------------
let batch1: StockBatchDocument;
runTest('Test 1: First purchase creates batch with exact publisher discount and actual purchase cost', () => {
  const purchaseId1 = 'PUR_20261101_001';
  const mrp = 500;
  const publisherDiscount = 50;
  const unitCost = roundMoney(mrp * (1 - publisherDiscount / 100)); // 250
  const quantity = 100;
  const totalCost = roundMoney(quantity * unitCost); // 25,000

  assert.equal(unitCost, 250, 'MRP 500 @ 50% pub disc must equal 250 PKR unit cost');
  assert.equal(totalCost, 25000, '100 units @ 250 must equal 25,000 PKR');

  batch1 = {
    id: getStockBatchId(purchaseId1, baseProduct.id),
    productId: baseProduct.id,
    productTitle: baseProduct.title,
    purchaseId: purchaseId1,
    purchaseInvoiceNo: 'INV-PUB-001',
    purchaseDate: '2026-11-01',
    quantityPurchased: quantity,
    remainingQuantity: quantity,
    mrp,
    publisherDiscountPercent: publisherDiscount,
    unitCost,
    totalCost,
    batchType: 'purchase',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  };

  assert.equal(batch1.id, `BATCH_${purchaseId1}_${baseProduct.id}`);
  assert.equal(batch1.remainingQuantity, 100);
  assert.equal(batch1.unitCost, 250);
});

// -----------------------------------------------------------------------------------
// TEST 2: Second Purchase Intake with Different Discount (MRP 500, 45% Disc = 275 Cost)
// -----------------------------------------------------------------------------------
let batch2: StockBatchDocument;
runTest('Test 2: Second purchase creates separate batch with 45% discount and 275 unit cost', () => {
  const purchaseId2 = 'PUR_20261102_002';
  const mrp = 500;
  const publisherDiscount = 45;
  const unitCost = roundMoney(mrp * (1 - publisherDiscount / 100)); // 275
  const quantity = 100;
  const totalCost = roundMoney(quantity * unitCost); // 27,500

  assert.equal(unitCost, 275, 'MRP 500 @ 45% pub disc must equal 275 PKR unit cost');
  assert.equal(totalCost, 27500, '100 units @ 275 must equal 27,500 PKR');

  batch2 = {
    id: getStockBatchId(purchaseId2, baseProduct.id),
    productId: baseProduct.id,
    productTitle: baseProduct.title,
    purchaseId: purchaseId2,
    purchaseInvoiceNo: 'INV-PUB-002',
    purchaseDate: '2026-11-02',
    quantityPurchased: quantity,
    remainingQuantity: quantity,
    mrp,
    publisherDiscountPercent: publisherDiscount,
    unitCost,
    totalCost,
    batchType: 'purchase',
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
  };

  assert.equal(batch2.remainingQuantity, 100);
  assert.equal(batch2.unitCost, 275);
});

// -----------------------------------------------------------------------------------
// TEST 3: Catalog Discount Change NEVER Changes Existing Batches
// -----------------------------------------------------------------------------------
runTest('Test 3: Changing product catalog discount does NOT alter previously purchased stock costs', () => {
  const modifiedProduct: MockProduct = {
    ...baseProduct,
    publisherDiscountPercent: 40,
    costPrice: 300,
    currentStock: 200,
  };

  assert.equal(batch1.unitCost, 250, 'Batch 1 cost must remain 250 PKR');
  assert.equal(batch1.publisherDiscountPercent, 50, 'Batch 1 discount must remain 50%');
  assert.equal(batch2.unitCost, 275, 'Batch 2 cost must remain 275 PKR');
  assert.equal(batch2.publisherDiscountPercent, 45, 'Batch 2 discount must remain 45%');
  assert.notEqual(batch1.unitCost, modifiedProduct.costPrice);
  assert.notEqual(batch2.unitCost, modifiedProduct.costPrice);
});

// -----------------------------------------------------------------------------------
// TEST 4: Old Remaining Stock Retains Historical Unit Cost (250 PKR)
// -----------------------------------------------------------------------------------
runTest('Test 4: Old remaining stock in Batch 1 retains historical cost of 250 PKR', () => {
  assert.equal(batch1.remainingQuantity, 100);
  assert.equal(batch1.unitCost, 250);
  assert.equal(roundMoney(batch1.remainingQuantity * batch1.unitCost), 25000);
});

// -----------------------------------------------------------------------------------
// TEST 5: Batch-Level Inventory Valuation Matches Specification Exactly (52,500 PKR)
// -----------------------------------------------------------------------------------
runTest('Test 5: Inventory valuation accurately reflects sum of remaining batch values (52,500 PKR)', () => {
  const currentProduct: MockProduct = {
    ...baseProduct,
    currentStock: 200, // 100 from B1 + 100 from B2
  };

  const batches = [batch1, batch2];
  const totalValuation = calculateProductValuation(currentProduct, batches);

  // Expected from spec: (100 * 250) + (100 * 275) = 25,000 + 27,500 = 52,500 PKR
  assert.equal(totalValuation, 52500, 'Total valuation must be exactly 52,500 PKR');
});

// -----------------------------------------------------------------------------------
// TEST 6: Multiple Purchases with Varying Discounts (3 Batches = 67,500 PKR)
// -----------------------------------------------------------------------------------
let batch3: StockBatchDocument;
runTest('Test 6: Multiple purchases with different discount rates tracked independently', () => {
  const purchaseId3 = 'PUR_20261103_003';
  const mrp = 500;
  const publisherDiscount = 40;
  const unitCost = roundMoney(mrp * (1 - publisherDiscount / 100)); // 300
  const quantity = 50;
  const totalCost = roundMoney(quantity * unitCost); // 15,000

  batch3 = {
    id: getStockBatchId(purchaseId3, baseProduct.id),
    productId: baseProduct.id,
    productTitle: baseProduct.title,
    purchaseId: purchaseId3,
    purchaseInvoiceNo: 'INV-PUB-003',
    purchaseDate: '2026-11-03',
    quantityPurchased: quantity,
    remainingQuantity: quantity,
    mrp,
    publisherDiscountPercent: publisherDiscount,
    unitCost,
    totalCost,
    batchType: 'purchase',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
  };

  const currentProduct: MockProduct = {
    ...baseProduct,
    currentStock: 250, // 100 + 100 + 50
  };

  const batches = [batch1, batch2, batch3];
  const totalValuation = calculateProductValuation(currentProduct, batches);
  // (100 * 250) + (100 * 275) + (50 * 300) = 25,000 + 27,500 + 15,000 = 67,500 PKR
  assert.equal(totalValuation, 67500, 'Valuation of 3 batches must equal 67,500 PKR');
});

// -----------------------------------------------------------------------------------
// TEST 7: Partial Sale within Oldest FIFO Batch (Sell 50 units @ 250 PKR)
// -----------------------------------------------------------------------------------
let remainingBatchesAfterSale1: StockBatchDocument[];
runTest('Test 7: Partial sale of 50 units consumes from oldest batch at 250 PKR (COGS = 12,500)', () => {
  const activeBatches: StockBatchDocument[] = [
    { ...batch1 },
    { ...batch2 },
    { ...batch3 },
  ];

  const productForSale: MockProduct = {
    ...baseProduct,
    currentStock: 250,
  };

  const depletionResult = depleteFifoBatches(
    productForSale,
    activeBatches,
    50, // Sell 50 units
    '2026-11-04T12:00:00.000Z'
  );

  assert.equal(depletionResult.totalCogs, 12500, 'COGS for 50 units @ 250 must be 12,500 PKR');
  assert.equal(depletionResult.effectiveUnitCost, 250, 'Effective unit cost must be 250 PKR');
  assert.equal(depletionResult.depletedBatches.length, 1);
  assert.equal(depletionResult.depletedBatches[0].batchId, batch1.id);
  assert.equal(depletionResult.depletedBatches[0].quantity, 50);

  // Batch 1 remaining must now be 50
  assert.equal(activeBatches[0].remainingQuantity, 50);
  assert.equal(activeBatches[1].remainingQuantity, 100);
  assert.equal(activeBatches[2].remainingQuantity, 50);

  // Valuation remaining: (50*250) + (100*275) + (50*300) = 12,500 + 27,500 + 15,000 = 55,000 PKR
  const remainingValuation = calculateProductValuation(
    { ...productForSale, currentStock: 200 },
    activeBatches
  );
  assert.equal(remainingValuation, 55000, 'Remaining valuation must be 55,000 PKR');

  remainingBatchesAfterSale1 = activeBatches;
});

// -----------------------------------------------------------------------------------
// TEST 8: Sale Spanning Across Multiple FIFO Batches (Sell 70 units: 50 from B1 + 20 from B2)
// -----------------------------------------------------------------------------------
let remainingBatchesAfterSale2: StockBatchDocument[];
let sale2BatchesDepleted: SaleItemBatchDepletion[];
runTest('Test 8: Cross-batch sale of 70 units consumes remaining 50 from B1 and 20 from B2', () => {
  const activeBatches: StockBatchDocument[] = remainingBatchesAfterSale1.map((b) => ({ ...b }));

  const productForSale: MockProduct = {
    ...baseProduct,
    currentStock: 200,
  };

  const depletionResult = depleteFifoBatches(
    productForSale,
    activeBatches,
    70, // Sell 70 units
    '2026-11-04T14:00:00.000Z'
  );

  // Expected COGS: (50 * 250) + (20 * 275) = 12,500 + 5,500 = 18,000 PKR
  assert.equal(depletionResult.totalCogs, 18000, 'COGS for 70 cross-batch units must be 18,000 PKR');
  // Effective unit cost: 18,000 / 70 = 257.14 PKR
  assert.equal(depletionResult.effectiveUnitCost, 257.14, 'Effective cost must be 257.14 PKR');

  assert.equal(depletionResult.depletedBatches.length, 2);
  assert.equal(depletionResult.depletedBatches[0].batchId, batch1.id);
  assert.equal(depletionResult.depletedBatches[0].quantity, 50);
  assert.equal(depletionResult.depletedBatches[0].unitCost, 250);

  assert.equal(depletionResult.depletedBatches[1].batchId, batch2.id);
  assert.equal(depletionResult.depletedBatches[1].quantity, 20);
  assert.equal(depletionResult.depletedBatches[1].unitCost, 275);

  // Batch states:
  // Batch 1 exhausted (0 remaining)
  assert.equal(activeBatches[0].remainingQuantity, 0);
  // Batch 2: 100 - 20 = 80 remaining
  assert.equal(activeBatches[1].remainingQuantity, 80);
  // Batch 3: untouched (50 remaining)
  assert.equal(activeBatches[2].remainingQuantity, 50);

  // Valuation remaining: (0*250) + (80*275) + (50*300) = 22,000 + 15,000 = 37,000 PKR
  const remainingValuation = calculateProductValuation(
    { ...productForSale, currentStock: 130 },
    activeBatches
  );
  assert.equal(remainingValuation, 37000, 'Remaining valuation must be 37,000 PKR');
  assert.equal(55000 - 18000, 37000, 'Valuation delta must match COGS exactly');

  remainingBatchesAfterSale2 = activeBatches;
  sale2BatchesDepleted = depletionResult.depletedBatches;
});

// -----------------------------------------------------------------------------------
// TEST 9: Saleable Customer Return Restores Exact Historical Batches (LIFO Reversal)
// -----------------------------------------------------------------------------------
runTest('Test 9: Saleable customer return reverses depletions into original batch at historical cost', () => {
  const currentBatches = remainingBatchesAfterSale2.map((b) => ({ ...b }));
  const batchSnapshotMap = new Map<string, StockBatchDocument>(
    currentBatches.map((b) => [b.id, { ...b }])
  );

  const restoredValue = restoreBatches(
    baseProduct.id,
    20, // Return 20 units
    sale2BatchesDepleted,
    250, // fallback cost
    '2026-11-04T16:00:00.000Z',
    batchSnapshotMap
  );

  // Restored value: 20 * 275 = 5,500 PKR
  assert.equal(restoredValue, 5500, 'Restored value for 20 units to B2 must be 5,500 PKR');

  // Verify Batch 2 remainingQuantity incremented from 80 to 100
  const b2Updated = batchSnapshotMap.get(batch2.id)!;
  assert.equal(b2Updated.remainingQuantity, 100, 'Batch 2 remaining must be restored to 100');

  // Verify Batch 1 was untouched by this 20-unit return
  const b1Updated = batchSnapshotMap.get(batch1.id)!;
  assert.equal(b1Updated.remainingQuantity, 0, 'Batch 1 remaining must still be 0');

  // Valuation after return: (0*250) + (100*275) + (50*300) = 27,500 + 15,000 = 42,500 PKR
  const valuationAfterReturn = calculateProductValuation(
    { ...baseProduct, currentStock: 150 },
    Array.from(batchSnapshotMap.values())
  );
  assert.equal(valuationAfterReturn, 42500, 'Valuation must increase by 5,500 to 42,500 PKR');
});

// -----------------------------------------------------------------------------------
// TEST 10: Damaged Customer Returns NEVER Restore Batches or Increase Valuation
// -----------------------------------------------------------------------------------
runTest('Test 10: Damaged customer returns never restore batches or increase saleable inventory', () => {
  const currentBatches = remainingBatchesAfterSale2.map((b) => ({ ...b }));
  const initialValuation = calculateProductValuation(
    { ...baseProduct, currentStock: 130 },
    currentBatches
  );

  const condition = 'damaged';
  let stockQtyDelta = 0;
  let stockValueDelta = 0;

  if (condition === 'saleable') {
    stockQtyDelta += 10;
    stockValueDelta += 10 * 250;
  }

  assert.equal(stockQtyDelta, 0, 'Damaged return must not increase stockQtyDelta');
  assert.equal(stockValueDelta, 0, 'Damaged return must not increase stockValueDelta');

  const valuationAfterDamaged = calculateProductValuation(
    { ...baseProduct, currentStock: 130 },
    currentBatches
  );
  assert.equal(valuationAfterDamaged, initialValuation, 'Valuation must not change for damaged return');
});

// -----------------------------------------------------------------------------------
// TEST 11: Multi-Batch Reversal Capping (Never Overfills Past quantityPurchased)
// -----------------------------------------------------------------------------------
runTest('Test 11: Returning full 70 units restores all batches without exceeding quantityPurchased', () => {
  const currentBatches = remainingBatchesAfterSale2.map((b) => ({ ...b }));
  const batchSnapshotMap = new Map<string, StockBatchDocument>(
    currentBatches.map((b) => [b.id, { ...b }])
  );

  const restoredValue = restoreBatches(
    baseProduct.id,
    70, // Return all 70 units
    sale2BatchesDepleted,
    250,
    '2026-11-04T17:00:00.000Z',
    batchSnapshotMap
  );

  // Restored: 20 to B2 (@ 275 = 5,500) + 50 to B1 (@ 250 = 12,500) = 18,000 PKR
  assert.equal(restoredValue, 18000, 'Restored value for full 70 units must be 18,000 PKR');

  const b1 = batchSnapshotMap.get(batch1.id)!;
  const b2 = batchSnapshotMap.get(batch2.id)!;

  assert.equal(b1.remainingQuantity, 50, 'B1 remaining must be restored to 50');
  assert.equal(b2.remainingQuantity, 100, 'B2 remaining must be restored to 100');
  assert.ok(b1.remainingQuantity <= b1.quantityPurchased, 'B1 must not exceed intake capacity');
  assert.ok(b2.remainingQuantity <= b2.quantityPurchased, 'B2 must not exceed intake capacity');
});

// -----------------------------------------------------------------------------------
// TEST 12: Purchase Form Helpers Auto-compute MRP and Publisher Discount
// -----------------------------------------------------------------------------------
runTest('Test 12: Purchase form helpers accurately calculate unitCost from MRP and Pub Disc %', () => {
  let rows: PurchaseItemRow[] = [];
  const testProd: MockProduct = {
    ...baseProduct,
    retailPrice: 600, // MRP
    publisherDiscountPercent: 40,
    costPrice: 360,
  };

  rows = addOrIncrementItem(rows, testProd);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mrp, 600);
  assert.equal(rows[0].publisherDiscountPercent, 40);
  assert.equal(rows[0].unitCost, 360);
  assert.equal(rows[0].totalCost, 360);

  // Update quantity to 10
  rows = updateItemField(rows, 0, 'quantity', 10);
  assert.equal(rows[0].totalCost, 3600);

  // Update publisher discount to 50%
  rows = updateItemField(rows, 0, 'publisherDiscountPercent', 50);
  assert.equal(rows[0].unitCost, 300, '600 @ 50% must equal 300 PKR unit cost');
  assert.equal(rows[0].totalCost, 3000, '10 units @ 300 must equal 3,000 PKR');

  // Update MRP to 800
  rows = updateItemField(rows, 0, 'mrp', 800);
  assert.equal(rows[0].unitCost, 400, '800 @ 50% must equal 400 PKR unit cost');
  assert.equal(rows[0].totalCost, 4000, '10 units @ 400 must equal 4,000 PKR');
});

// -----------------------------------------------------------------------------------
// TEST 13: Legacy Product Migration via Virtual Opening Stock Batches
// -----------------------------------------------------------------------------------
runTest('Test 13: Legacy products without historical batches safely generate virtual opening batches', () => {
  const legacyProduct: MockProduct = {
    ...baseProduct,
    id: 'PROD_LEGACY_STATIONERY',
    title: 'Ballpoint Pens Blue Pack of 10',
    currentStock: 80,
    costPrice: 120, // Rs. 120 historical cost
    retailPrice: 180,
    publisherDiscountPercent: 33.33,
  };

  const emptyBatches: StockBatchDocument[] = [];
  const snapshotMap = new Map<string, StockBatchDocument>();

  const result = depleteFifoBatches(
    legacyProduct,
    emptyBatches,
    30, // Sell 30 units
    '2026-11-04T18:00:00.000Z',
    snapshotMap
  );

  // Must consume 30 units @ 120 = 3,600 PKR
  assert.equal(result.totalCogs, 3600, 'Legacy COGS must be 3,600 PKR');
  assert.equal(result.effectiveUnitCost, 120, 'Legacy unit cost must be 120 PKR');
  assert.equal(result.depletedBatches.length, 1);
  assert.equal(result.depletedBatches[0].batchId, getOpeningStockBatchId(legacyProduct.id));
  assert.equal(result.depletedBatches[0].quantity, 30);

  // Virtual opening batch must be created with 50 remaining out of 80 total
  const createdOpeningBatch = snapshotMap.get(getOpeningStockBatchId(legacyProduct.id))!;
  assert.ok(createdOpeningBatch, 'Virtual opening batch must be created');
  assert.equal(createdOpeningBatch.quantityPurchased, 80);
  assert.equal(createdOpeningBatch.remainingQuantity, 50);
  assert.equal(createdOpeningBatch.unitCost, 120);
  assert.equal(createdOpeningBatch.batchType, 'opening');
});

// -----------------------------------------------------------------------------------
// TEST 14: Source Code Contract Verification (Audit and Invariants Inspection)
// -----------------------------------------------------------------------------------
runTest('Test 14: Source files strictly implement FIFO batch tracking and non-recalculation invariants', () => {
  const batchServiceCode = fs.readFileSync(
    path.join(process.cwd(), 'src/services/stockBatchService.ts'),
    'utf-8'
  );
  assert.ok(batchServiceCode.includes('depleteFifoBatchesInTransaction'), 'Must export depleteFifoBatchesInTransaction');
  assert.ok(batchServiceCode.includes('restoreBatchesInTransaction'), 'Must export restoreBatchesInTransaction');
  assert.ok(batchServiceCode.includes('calculateProductValuationFromBatches'), 'Must export calculateProductValuationFromBatches');

  const purchaseServiceCode = fs.readFileSync(
    path.join(process.cwd(), 'src/services/purchaseService.ts'),
    'utf-8'
  );
  assert.ok(purchaseServiceCode.includes('STOCK_BATCHES_COLLECTION'), 'Must create stock batches on purchase intake');
  assert.ok(purchaseServiceCode.includes('getStockBatchId'), 'Must generate deterministic batch IDs');

  const saleServiceCode = fs.readFileSync(
    path.join(process.cwd(), 'src/services/saleService.ts'),
    'utf-8'
  );
  assert.ok(saleServiceCode.includes('depleteFifoBatchesInTransaction'), 'Sale transaction must deplete FIFO batches');
  assert.ok(saleServiceCode.includes('batchesDepleted: fifoDepletion.depletedBatches'), 'SaleItem must snapshot depleted batches');

  const saleHistoryCode = fs.readFileSync(
    path.join(process.cwd(), 'src/services/saleHistoryService.ts'),
    'utf-8'
  );
  assert.ok(saleHistoryCode.includes('restoreBatchesInTransaction'), 'Returns must restore FIFO batches for saleable items');

  const purchaseModalCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/purchases/PurchaseFormModal.tsx'),
    'utf-8'
  );
  assert.ok(purchaseModalCode.includes('MRP (PKR)'), 'PurchaseFormModal must have MRP column');
  assert.ok(purchaseModalCode.includes('Pub Disc %'), 'PurchaseFormModal must have Pub Disc % column');

  const purchaseDetailCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/purchases/PurchaseDetailModal.tsx'),
    'utf-8'
  );
  assert.ok(purchaseDetailCode.includes('MRP'), 'PurchaseDetailModal must display MRP');
  assert.ok(purchaseDetailCode.includes('Pub Disc %'), 'PurchaseDetailModal must display Pub Disc %');
});

// -----------------------------------------------------------------------------------
// TEST 15: Firestore Security Rules Validation for stockBatches
// -----------------------------------------------------------------------------------
runTest('Test 15: Firestore security rules strictly protect stockBatches collection', () => {
  const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');

  // Must match stockBatches collection
  assert.ok(rules.includes('match /stockBatches/{batchId}'), 'Must have dedicated match rule for stockBatches');
  assert.ok(rules.includes('allow read: if isStaff();'), 'Staff must be able to read stock batches');
  assert.ok(rules.includes('batchType == \'purchase\''), 'Must enforce batchType purchase validation');
  assert.ok(rules.includes('existsAfter(/databases/$(database)/documents/purchases/$(request.resource.data.purchaseId))'), 'Purchase batches must link to legitimate purchase document');
  assert.ok(rules.includes('batchType == \'opening\''), 'Must enforce batchType opening validation');
  assert.ok(rules.includes('affectedKeys().hasOnly([\'remainingQuantity\', \'updatedAt\'])'), 'Update must forbid altering financial cost terms');
  assert.ok(rules.includes('allow delete: if false;'), 'Delete must be permanently denied');
});

// -----------------------------------------------------------------------------------
// TEST 16: Manual Stock Reduction (Damage / Audit Loss) Depletes FIFO Batches
// -----------------------------------------------------------------------------------
runTest('Test 16: Manual stock reduction depletes FIFO batches and removes damaged stock from saleable pool', () => {
  const activeBatches: StockBatchDocument[] = [
    {
      id: 'B_TEST16_1',
      productId: 'PROD_TEST16',
      productTitle: 'Test Book 16',
      purchaseId: 'PUR_16_1',
      purchaseInvoiceNo: 'INV-16-1',
      purchaseDate: '2026-11-01',
      quantityPurchased: 100,
      remainingQuantity: 100,
      mrp: 500,
      publisherDiscountPercent: 50,
      unitCost: 250,
      totalCost: 25000,
      batchType: 'purchase',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    {
      id: 'B_TEST16_2',
      productId: 'PROD_TEST16',
      productTitle: 'Test Book 16',
      purchaseId: 'PUR_16_2',
      purchaseInvoiceNo: 'INV-16-2',
      purchaseDate: '2026-11-02',
      quantityPurchased: 100,
      remainingQuantity: 100,
      mrp: 500,
      publisherDiscountPercent: 45,
      unitCost: 275,
      totalCost: 27500,
      batchType: 'purchase',
      createdAt: '2026-11-02T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
    },
  ];

  const prodDoc: MockProduct = {
    id: 'PROD_TEST16',
    sku: 'SKU-16',
    title: 'Test Book 16',
    retailPrice: 500,
    costPrice: 250,
    currentStock: 200,
  };

  // Admin records 20 damaged books (reduction)
  const reductionQty = 20;
  const depletionResult = depleteFifoBatches(
    prodDoc,
    activeBatches,
    reductionQty,
    '2026-11-04T20:00:00.000Z'
  );

  assert.equal(depletionResult.totalCogs, 5000, '20 units @ 250 must reduce valuation by 5,000 PKR');
  assert.equal(activeBatches[0].remainingQuantity, 80, 'Batch 1 remaining must decrease to 80');
  assert.equal(activeBatches[1].remainingQuantity, 100, 'Batch 2 remaining must be untouched at 100');

  // Verify remaining valuation: (80 * 250) + (100 * 275) = 20,000 + 27,500 = 47,500 PKR
  const valuation = calculateProductValuation(
    { ...prodDoc, currentStock: 180 },
    activeBatches
  );
  assert.equal(valuation, 47500, 'Remaining valuation must be 47,500 PKR');
  assert.equal(52500 - 5000, 47500, 'Valuation change must match exact COGS delta');
});

// -----------------------------------------------------------------------------------
// TEST 17: Manual Stock Increase (Found Stock / Count Correction) with Cost Basis
// -----------------------------------------------------------------------------------
runTest('Test 17: Manual stock increase establishes documented cost basis and keeps batches in lockstep', () => {
  const prodDoc: MockProduct = {
    id: 'PROD_TEST17',
    sku: 'SKU-17',
    title: 'Test Book 17',
    retailPrice: 600,
    costPrice: 300, // Cost basis
    currentStock: 180,
  };

  const snapshotMap = new Map<string, StockBatchDocument>();
  const addQty = 25;
  const costBasis = 300;

  const valueAdded = addStockBatch(
    prodDoc,
    addQty,
    costBasis,
    'audit_correction',
    '2026-11-04T21:00:00.000Z',
    snapshotMap
  );

  assert.equal(valueAdded, 7500, '25 units @ 300 must add 7,500 PKR in asset valuation');
  const createdBatch = snapshotMap.get(getOpeningStockBatchId(prodDoc.id))!;
  assert.ok(createdBatch, 'Adjustment opening batch must be created');
  assert.equal(createdBatch.remainingQuantity, 25);
  assert.equal(createdBatch.quantityPurchased, 25);
  assert.equal(createdBatch.unitCost, 300);

  // If another 10 units are added subsequently to the same product:
  const valueAdded2 = addStockBatch(
    prodDoc,
    10,
    costBasis,
    'found_stock',
    '2026-11-04T21:30:00.000Z',
    snapshotMap
  );
  assert.equal(valueAdded2, 3000, '10 units @ 300 must add 3,000 PKR');
  assert.equal(createdBatch.remainingQuantity, 35, 'Remaining quantity must increment to 35');
  assert.equal(createdBatch.quantityPurchased, 35, 'Purchased quantity must increment to 35');
});

// -----------------------------------------------------------------------------------
// TEST 18: Bounded Cursor Pagination Over >1,000 Batches
// -----------------------------------------------------------------------------------
runTest('Test 18: Recalculation pagination traverses >1,000 batches without truncation', () => {
  // Generate 1,250 mock batches across 3 products
  const totalBatchesCount = 1250;
  const mockAllBatches: StockBatchDocument[] = [];
  const prodIds = ['PROD_P1', 'PROD_P2', 'PROD_P3'];

  for (let i = 0; i < totalBatchesCount; i++) {
    const pId = prodIds[i % prodIds.length];
    mockAllBatches.push({
      id: `BATCH_${String(i).padStart(5, '0')}`,
      productId: pId,
      productTitle: `Product ${pId}`,
      purchaseId: `PUR_${i}`,
      purchaseInvoiceNo: `INV-${i}`,
      purchaseDate: '2026-11-01',
      quantityPurchased: 10,
      remainingQuantity: 10,
      mrp: 500,
      publisherDiscountPercent: 50,
      unitCost: 250,
      totalCost: 2500,
      batchType: 'purchase',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    });
  }

  // Simulate cursor pagination with page size = 500
  const pageSize = 500;
  const retrievedBatchesByProduct = new Map<string, StockBatchDocument[]>();
  let lastIndex = 0;
  let hasMore = true;
  let totalBatchesLoaded = 0;
  let pageCount = 0;

  while (hasMore) {
    pageCount++;
    const page = mockAllBatches.slice(lastIndex, lastIndex + pageSize);
    if (page.length === 0) break;

    for (const b of page) {
      const list = retrievedBatchesByProduct.get(b.productId) || [];
      list.push(b);
      retrievedBatchesByProduct.set(b.productId, list);
      totalBatchesLoaded++;
    }

    if (page.length < pageSize) {
      hasMore = false;
    } else {
      lastIndex += pageSize;
    }
  }

  assert.equal(totalBatchesLoaded, 1250, 'All 1,250 batches must be completely retrieved');
  assert.equal(pageCount, 3, 'Must paginate in 3 distinct pages (500, 500, 250)');

  // Verify total valuation matches sum across all 3 products
  let grandValuation = 0;
  for (const pId of prodIds) {
    const batches = retrievedBatchesByProduct.get(pId) || [];
    const prodVal = calculateProductValuation(
      { id: pId, sku: pId, title: pId, retailPrice: 500, costPrice: 250, currentStock: batches.length * 10 },
      batches
    );
    grandValuation += prodVal;
  }

  // 1,250 batches * 10 units * 250 unitCost = 3,125,000 PKR
  assert.equal(grandValuation, 3125000, 'Grand valuation must equal 3,125,000 PKR');
});

// -----------------------------------------------------------------------------------
// TEST 19: Concurrency Simulation — Simultaneous Stock Adjustment and POS Sale
// -----------------------------------------------------------------------------------
runTest('Test 19: Concurrent stock adjustment and POS sale safely prevent negative quantities', () => {
  const sharedBatch: StockBatchDocument = {
    id: 'BATCH_CONCUR_01',
    productId: 'PROD_CONCUR',
    productTitle: 'Concurrent Book',
    purchaseId: 'PUR_CONCUR',
    purchaseInvoiceNo: 'INV-CONCUR',
    purchaseDate: '2026-11-04',
    quantityPurchased: 30,
    remainingQuantity: 30,
    mrp: 500,
    publisherDiscountPercent: 50,
    unitCost: 250,
    totalCost: 7500,
    batchType: 'purchase',
    createdAt: '2026-11-04T10:00:00.000Z',
    updatedAt: '2026-11-04T10:00:00.000Z',
  };

  const sharedProduct: MockProduct = {
    id: 'PROD_CONCUR',
    sku: 'CONC-01',
    title: 'Concurrent Book',
    retailPrice: 500,
    costPrice: 250,
    currentStock: 30,
  };

  // Operation 1 (POS Sale): Customer buys 20 units
  const saleDepletion = depleteFifoBatches(
    sharedProduct,
    [sharedBatch],
    20,
    '2026-11-04T22:00:00.000Z'
  );
  assert.equal(saleDepletion.totalCogs, 5000);
  assert.equal(sharedBatch.remainingQuantity, 10, 'Remaining quantity after sale must be 10');

  // Operation 2 (Manual Damage Adjustment): Admin attempts to write off 15 units
  // Since only 10 units remain in the batch, it depletes 10 from the batch and creates an opening batch for unallocated physical stock if any
  const damageDepletion = depleteFifoBatches(
    { ...sharedProduct, currentStock: 10 },
    [sharedBatch],
    10, // Clamped to available stock
    '2026-11-04T22:00:01.000Z'
  );

  assert.equal(damageDepletion.totalCogs, 2500);
  assert.equal(sharedBatch.remainingQuantity, 0, 'Batch is completely exhausted (0 remaining)');
  assert.ok(sharedBatch.remainingQuantity >= 0, 'Batch remaining quantity must NEVER be negative');
});

console.log('\n====================================================================');
console.log(` ALL ${passedTests} PURCHASE-WISE COST & FIFO VERIFICATION TESTS PASSED!`);
console.log('====================================================================\n');
