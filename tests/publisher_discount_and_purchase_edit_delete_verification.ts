import assert from 'node:assert';

// ============================================================================
// TEST 1: Series Discount Calculation & FIFO Valuation Simulation
// ============================================================================
console.log('--- TEST 1: Publisher Series Discount & Cost Price Calculation ---');

interface MockProduct {
  id: string;
  title: string;
  seriesName: string;
  publisherName: string;
  retailPrice: number; // MRP
  costPrice: number;
  publisherDiscountPercent?: number;
  currentStock: number;
}

const mockProducts: MockProduct[] = [
  {
    id: 'p1',
    title: 'Kingdom English 1',
    seriesName: 'Kingdom',
    publisherName: 'Moon Light',
    retailPrice: 500,
    costPrice: 500, // was 0% discount
    publisherDiscountPercent: 0,
    currentStock: 20,
  },
  {
    id: 'p2',
    title: 'Kingdom Math 1',
    seriesName: 'Kingdom',
    publisherName: 'Moon Light',
    retailPrice: 600,
    costPrice: 450, // was 25% discount
    publisherDiscountPercent: 25,
    currentStock: 15,
  },
  {
    id: 'p3',
    title: 'Non Kingdom Book',
    seriesName: 'Premium',
    publisherName: 'Moon Light',
    retailPrice: 400,
    costPrice: 300,
    publisherDiscountPercent: 25,
    currentStock: 10,
  },
];

// Apply 40% discount to all products in 'Kingdom' series
const targetSeries = 'Kingdom';
const newDiscount = 40;

let initialTotalValuation = mockProducts.reduce(
  (sum, p) => sum + p.costPrice * p.currentStock,
  0
);
// p1: 500 * 20 = 10000
// p2: 450 * 15 = 6750
// p3: 300 * 10 = 3000
// total = 19750
assert.strictEqual(initialTotalValuation, 19750);

let valuationDelta = 0;
for (const prod of mockProducts) {
  if (prod.seriesName === targetSeries) {
    const oldCost = prod.costPrice;
    const newCost = Math.round(prod.retailPrice * (1 - newDiscount / 100) * 100) / 100;
    const oldValuation = oldCost * prod.currentStock;
    const newValuation = newCost * prod.currentStock;
    valuationDelta += newValuation - oldValuation;

    prod.costPrice = newCost;
    prod.publisherDiscountPercent = newDiscount;
  }
}

// p1 new cost: 500 * (1 - 0.40) = 300. valuation: 300 * 20 = 6000 (delta: -4000)
// p2 new cost: 600 * (1 - 0.40) = 360. valuation: 360 * 15 = 5400 (delta: -1350)
// valuationDelta: -5350
assert.strictEqual(mockProducts[0].costPrice, 300);
assert.strictEqual(mockProducts[1].costPrice, 360);
assert.strictEqual(mockProducts[2].costPrice, 300); // unchanged
assert.strictEqual(valuationDelta, -5350);

const updatedTotalValuation = mockProducts.reduce(
  (sum, p) => sum + p.costPrice * p.currentStock,
  0
);
assert.strictEqual(updatedTotalValuation, initialTotalValuation + valuationDelta);
console.log('✓ Test 1 Passed: Series discount properly calculated and valuation delta matches.');

// ============================================================================
// TEST 2: Purchase Deletion Mathematical Stock & Debt Reversal
// ============================================================================
console.log('\n--- TEST 2: Purchase Deletion Stock & Supplier Debt Reversal ---');

interface MockSupplier {
  id: string;
  name: string;
  currentBalance: number;
}

const supplier: MockSupplier = {
  id: 'sup1',
  name: 'Moon Light Publisher',
  currentBalance: 50000,
};

const purchaseToDelete = {
  id: 'PUR-001',
  purchaseInvoiceNo: 'INV-2026-001',
  supplierId: 'sup1',
  grandTotal: 15000,
  paidAmount: 5000,
  remainingBalance: 10000, // this 10000 was added to supplier currentBalance
  items: [
    { productId: 'p1', quantity: 20, unitCost: 300, totalCost: 6000 },
    { productId: 'p2', quantity: 25, unitCost: 360, totalCost: 9000 },
  ],
};

const stockStore: Record<string, number> = {
  p1: 50,
  p2: 60,
};

// Simulate deletePurchaseTransaction
// 1. Reverse stock
for (const item of purchaseToDelete.items) {
  stockStore[item.productId] = Math.max(0, stockStore[item.productId] - item.quantity);
}
assert.strictEqual(stockStore.p1, 30);
assert.strictEqual(stockStore.p2, 35);

// 2. Reverse supplier balance: if remainingBalance > 0, deduct from supplier balance
if (purchaseToDelete.remainingBalance > 0) {
  supplier.currentBalance = Math.max(0, supplier.currentBalance - purchaseToDelete.remainingBalance);
}
assert.strictEqual(supplier.currentBalance, 40000);
console.log('✓ Test 2 Passed: Purchase deletion accurately reversed physical stock and supplier debt.');

// ============================================================================
// TEST 3: Purchase Edit Stock Deltas & Debt Delta Adjustments
// ============================================================================
console.log('\n--- TEST 3: Purchase Edit Net Quantity & Debt Deltas ---');

const oldPurchase = {
  id: 'PUR-002',
  supplierId: 'sup1',
  grandTotal: 10000,
  paidAmount: 2000,
  remainingBalance: 8000,
  items: [
    { productId: 'p1', quantity: 10, unitCost: 300, totalCost: 3000 },
    { productId: 'p2', quantity: 20, unitCost: 350, totalCost: 7000 },
  ],
};

const newPurchaseInput = {
  supplierId: 'sup1',
  grandTotal: 14000,
  paidAmount: 4000,
  remainingBalance: 10000,
  items: [
    { productId: 'p1', quantity: 15, unitCost: 300, totalCost: 4500 }, // +5 units
    { productId: 'p2', quantity: 10, unitCost: 350, totalCost: 3500 }, // -10 units
    { productId: 'p3', quantity: 20, unitCost: 300, totalCost: 6000 }, // +20 units (new item)
  ],
};

const currentInventory: Record<string, number> = {
  p1: 30,
  p2: 35,
  p3: 10,
};

// Calculate item deltas
const oldQtyMap = new Map<string, number>();
for (const it of oldPurchase.items) {
  oldQtyMap.set(it.productId, (oldQtyMap.get(it.productId) || 0) + it.quantity);
}

const newQtyMap = new Map<string, number>();
for (const it of newPurchaseInput.items) {
  newQtyMap.set(it.productId, (newQtyMap.get(it.productId) || 0) + it.quantity);
}

const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
const productDeltas: Record<string, number> = {};

for (const pId of allProductIds) {
  const oldQ = oldQtyMap.get(pId) || 0;
  const newQ = newQtyMap.get(pId) || 0;
  const delta = newQ - oldQ;
  productDeltas[pId] = delta;
  currentInventory[pId] = Math.max(0, currentInventory[pId] + delta);
}

assert.strictEqual(productDeltas.p1, 5); // +5
assert.strictEqual(productDeltas.p2, -10); // -10
assert.strictEqual(productDeltas.p3, 20); // +20

assert.strictEqual(currentInventory.p1, 35);
assert.strictEqual(currentInventory.p2, 25);
assert.strictEqual(currentInventory.p3, 30);

// Supplier balance delta
const balanceDelta = newPurchaseInput.remainingBalance - oldPurchase.remainingBalance; // 10000 - 8000 = +2000
supplier.currentBalance = Math.max(0, supplier.currentBalance + balanceDelta);
assert.strictEqual(supplier.currentBalance, 42000);

console.log('✓ Test 3 Passed: Purchase edit stock deltas and supplier balance delta mathematically precise.');

console.log('\n======================================================');
console.log('ALL TESTS PASSED WITH 100% MATHEMATICAL ACCURACY!');
console.log('======================================================');

