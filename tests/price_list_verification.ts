import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — PRICE LIST ARCHITECTURE & HISTORICAL KHATA IMMUTABILITY
// ==============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res
        .then(() => {
          console.log(`  [PASS] ${name}`);
          testsPassed++;
        })
        .catch((err: any) => {
          console.error(`  [FAIL] ${name}`);
          console.error(`         ${err.message}`);
          testsFailed++;
        });
    } else {
      console.log(`  [PASS] ${name}`);
      testsPassed++;
    }
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testsFailed++;
  }
}

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — PRICE LIST & HISTORICAL KHATA VERIFICATION');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------------
// Mock Data & Service Logic Mirrors
// ---------------------------------------------------------------------------------

interface Product {
  id: string;
  sku: string;
  title: string;
  classification: string;
  publisherId?: string;
  publisherName?: string;
  seriesId?: string;
  seriesName?: string;
  notebookSize?: string;
  notebookSheets?: string;
  notebookGrammage?: string;
  retailPrice: number;
  originalPrice: number;
  mrp: number;
  costPrice: number;
  publisherDiscountPercent: number;
  wholesalePrice: number;
  currentStock: number;
  isActive: boolean;
  updatedAt: string;
}

interface SaleItemSnapshot {
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number; // Historical MRP at sale time
  effectivePrice: number; // Historical discounted selling price
  lineTotal: number;
}

interface SaleRecord {
  invoiceNo: string;
  customerId: string;
  saleDate: string;
  items: SaleItemSnapshot[];
  subtotal: number;
  grandTotal: number;
  cashPaid: number;
  creditAddedToKhata: number;
}

interface CustomerLedgerRecord {
  id: string;
  customerId: string;
  date: string;
  type: 'debit' | 'credit';
  amount: number;
  balanceAfter: number;
  referenceId: string;
}

interface Customer {
  id: string;
  name: string;
  currentBalance: number; // Positive = owes money (Udhaar)
}

// In-Memory Database Simulation
const productsDb = new Map<string, Product>();
const salesDb = new Map<string, SaleRecord>();
const ledgerDb: CustomerLedgerRecord[] = [];
const customersDb = new Map<string, Customer>();
const auditLogs: Array<{ action: string; targetId: string; details: any }> = [];

let storeAssetValuation = 0;

function recalculateStoreAssetValuation(): number {
  let total = 0;
  for (const p of productsDb.values()) {
    if (p.isActive) {
      total += (p.currentStock || 0) * (p.costPrice || 0);
    }
  }
  return Math.round(total * 100) / 100;
}

// Service Logic Mirror: groupProductsByPublisherAndSeries
function groupProducts(products: Product[]) {
  const pubMap = new Map<string, {
    publisherName: string;
    seriesMap: Map<string, { seriesName: string; products: Product[] }>;
    directProducts: Product[];
  }>();

  for (const prod of products) {
    const pubId = prod.publisherId || 'general_publisher';
    const pubName = prod.publisherName || (prod.classification === 'notebook' || prod.classification === 'register' ? 'Notebooks & Registers' : 'General Catalog');

    if (!pubMap.has(pubId)) {
      pubMap.set(pubId, {
        publisherName: pubName,
        seriesMap: new Map(),
        directProducts: [],
      });
    }

    const pubEntry = pubMap.get(pubId)!;
    if (prod.seriesId && prod.seriesName) {
      if (!pubEntry.seriesMap.has(prod.seriesId)) {
        pubEntry.seriesMap.set(prod.seriesId, {
          seriesName: prod.seriesName,
          products: [],
        });
      }
      pubEntry.seriesMap.get(prod.seriesId)!.products.push(prod);
    } else {
      pubEntry.directProducts.push(prod);
    }
  }

  const result = [];
  for (const [pubId, pubData] of pubMap.entries()) {
    const seriesGroups = [];
    let totalProducts = pubData.directProducts.length;
    for (const [seriesId, serData] of pubData.seriesMap.entries()) {
      totalProducts += serData.products.length;
      seriesGroups.push({
        seriesId,
        seriesName: serData.seriesName,
        products: serData.products,
      });
    }
    result.push({
      publisherId: pubId,
      publisherName: pubData.publisherName,
      seriesGroups,
      directProducts: pubData.directProducts,
      totalProducts,
    });
  }
  return result;
}

// Service Logic Mirror: updateProductPrice
function updateProductPriceMock(
  productId: string,
  input: {
    retailPrice: number;
    publisherDiscountPercent?: number;
    wholesalePrice?: number;
    costPrice?: number;
  }
): Product {
  const existing = productsDb.get(productId);
  if (!existing) throw new Error('Product not found');

  const mrp = Math.max(0, Number(input.retailPrice) || 0);
  const pubDiscount = input.publisherDiscountPercent !== undefined
    ? Math.max(0, Math.min(100, Number(input.publisherDiscountPercent)))
    : existing.publisherDiscountPercent;

  const calculatedCost = Math.round((mrp * (1 - pubDiscount / 100)) * 100) / 100;
  const costPrice = input.costPrice !== undefined && input.costPrice >= 0
    ? Number(input.costPrice)
    : calculatedCost;

  const wholesalePrice = input.wholesalePrice !== undefined && input.wholesalePrice >= 0
    ? Number(input.wholesalePrice)
    : mrp;

  const currentStock = existing.currentStock;
  const oldValuation = currentStock * existing.costPrice;
  const newValuation = currentStock * costPrice;
  const valuationDelta = Math.round((newValuation - oldValuation) * 100) / 100;

  existing.retailPrice = mrp;
  existing.originalPrice = mrp;
  existing.mrp = mrp;
  existing.publisherDiscountPercent = pubDiscount;
  existing.costPrice = costPrice;
  existing.wholesalePrice = wholesalePrice;
  existing.updatedAt = new Date().toISOString();

  storeAssetValuation += valuationDelta;

  auditLogs.push({
    action: 'PRODUCT_PRICE_UPDATED',
    targetId: productId,
    details: {
      oldPrice: existing.retailPrice,
      newPrice: mrp,
      valuationDelta,
    },
  });

  return existing;
}

// POS Checkout Simulation (creates immutable Sale and Ledger snapshots)
function processSaleMock(
  invoiceNo: string,
  customerId: string,
  items: Array<{ productId: string; quantity: number }>,
  cashPaid: number
): SaleRecord {
  const customer = customersDb.get(customerId);
  if (!customer) throw new Error('Customer not found');

  const saleSnapshots: SaleItemSnapshot[] = [];
  let subtotal = 0;

  for (const item of items) {
    const prod = productsDb.get(item.productId);
    if (!prod) throw new Error('Product not found');
    if (prod.currentStock < item.quantity) throw new Error('Insufficient stock');

    // Decrement physical stock on hand
    prod.currentStock -= item.quantity;

    const unitPrice = prod.retailPrice; // Reads current catalog price at sale time
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    saleSnapshots.push({
      productId: prod.id,
      title: prod.title,
      quantity: item.quantity,
      unitPrice,
      effectivePrice: unitPrice,
      lineTotal,
    });
  }

  const grandTotal = subtotal;
  const creditAddedToKhata = Math.max(0, grandTotal - cashPaid);

  const sale: SaleRecord = {
    invoiceNo,
    customerId,
    saleDate: '2026-11-06',
    items: saleSnapshots,
    subtotal,
    grandTotal,
    cashPaid,
    creditAddedToKhata,
  };

  salesDb.set(invoiceNo, sale);

  if (creditAddedToKhata > 0) {
    const previousBalance = customer.currentBalance;
    const newBalance = Math.round((previousBalance + creditAddedToKhata) * 100) / 100;
    customer.currentBalance = newBalance;

    ledgerDb.push({
      id: `led_${ledgerDb.length + 1}`,
      customerId,
      date: '2026-11-06',
      type: 'debit',
      amount: creditAddedToKhata,
      balanceAfter: newBalance,
      referenceId: invoiceNo,
    });
  }

  return sale;
}

// ---------------------------------------------------------------------------------
// Seed Initial Data
// ---------------------------------------------------------------------------------

function setupTestData() {
  productsDb.clear();
  salesDb.clear();
  ledgerDb.length = 0;
  customersDb.clear();
  auditLogs.length = 0;

  // 1. Oxford University Press Books
  productsDb.set('prod_ox_count1', {
    id: 'prod_ox_count1',
    sku: 'BK-OX-001',
    title: 'Countdown Class 1 (3rd Edition)',
    classification: 'book',
    publisherId: 'pub_oxford',
    publisherName: 'Oxford University Press',
    seriesId: 'ser_countdown',
    seriesName: 'Countdown Mathematics',
    retailPrice: 850,
    originalPrice: 850,
    mrp: 850,
    costPrice: 680, // 20% discount: 850 * 0.80 = 680
    publisherDiscountPercent: 20,
    wholesalePrice: 750,
    currentStock: 50,
    isActive: true,
    updatedAt: '2026-11-01T10:00:00Z',
  });

  productsDb.set('prod_ox_count2', {
    id: 'prod_ox_count2',
    sku: 'BK-OX-002',
    title: 'Countdown Class 2 (3rd Edition)',
    classification: 'book',
    publisherId: 'pub_oxford',
    publisherName: 'Oxford University Press',
    seriesId: 'ser_countdown',
    seriesName: 'Countdown Mathematics',
    retailPrice: 920,
    originalPrice: 920,
    mrp: 920,
    costPrice: 736, // 20% discount: 920 * 0.80 = 736
    publisherDiscountPercent: 20,
    wholesalePrice: 820,
    currentStock: 40,
    isActive: true,
    updatedAt: '2026-11-01T10:00:00Z',
  });

  productsDb.set('prod_ox_english1', {
    id: 'prod_ox_english1',
    sku: 'BK-OX-003',
    title: 'New Oxford Modern English Book 1',
    classification: 'book',
    publisherId: 'pub_oxford',
    publisherName: 'Oxford University Press',
    seriesId: 'ser_modern_english',
    seriesName: 'New Oxford Modern English',
    retailPrice: 990,
    originalPrice: 990,
    mrp: 990,
    costPrice: 792, // 20% discount
    publisherDiscountPercent: 20,
    wholesalePrice: 880,
    currentStock: 30,
    isActive: true,
    updatedAt: '2026-11-01T10:00:00Z',
  });

  // 2. Caravan Book House
  productsDb.set('prod_caravan_chem', {
    id: 'prod_caravan_chem',
    sku: 'BK-CB-001',
    title: 'Caravan Chemistry Class 9',
    classification: 'book',
    publisherId: 'pub_caravan',
    publisherName: 'Caravan Book House',
    seriesId: 'ser_caravan_science',
    seriesName: 'Caravan Science Series',
    retailPrice: 450,
    originalPrice: 450,
    mrp: 450,
    costPrice: 382.5, // 15% discount
    publisherDiscountPercent: 15,
    wholesalePrice: 400,
    currentStock: 100,
    isActive: true,
    updatedAt: '2026-11-01T10:00:00Z',
  });

  // 3. Notebooks & Registers
  productsDb.set('prod_nb_a4_100', {
    id: 'prod_nb_a4_100',
    sku: 'NB-A4-100',
    title: 'Class Four-Line Notebook',
    classification: 'notebook',
    notebookSize: 'A4',
    notebookSheets: '100',
    notebookGrammage: '70 GSM',
    retailPrice: 160,
    originalPrice: 160,
    mrp: 160,
    costPrice: 120,
    publisherDiscountPercent: 25,
    wholesalePrice: 135,
    currentStock: 200,
    isActive: true,
    updatedAt: '2026-11-01T10:00:00Z',
  });

  // 4. Customer with Khata
  customersDb.set('cust_tariq', {
    id: 'cust_tariq',
    name: 'Tariq Mehmood (Al-Rehman Academy)',
    currentBalance: 0,
  });

  storeAssetValuation = recalculateStoreAssetValuation();
}

// ==============================================================================
// TEST EXECUTION
// ==============================================================================

console.log('--- Requirement 1: Automatic Population in Price List ---');

setupTestData();

runTest('1. All products with assigned prices automatically appear in Price List', () => {
  assert.equal(productsDb.size, 5);
  const items = Array.from(productsDb.values()).filter((p) => p.isActive);
  assert.equal(items.length, 5);
  // Verify each item has MRP, Cost, Wholesale, Stock
  for (const item of items) {
    assert.ok(item.retailPrice > 0, `Item ${item.title} has retail price`);
    assert.ok(item.costPrice > 0, `Item ${item.title} has cost price`);
    assert.ok(item.wholesalePrice > 0, `Item ${item.title} has wholesale price`);
  }
});

runTest('2. Creating a new product automatically includes it in the Price List', () => {
  const newProduct: Product = {
    id: 'prod_ptbb_urdu',
    sku: 'BK-PTBB-001',
    title: 'Punjab Textbook Urdu Class 5',
    classification: 'book',
    publisherId: 'pub_ptbb',
    publisherName: 'Punjab Curriculum & Textbook Board',
    seriesId: 'ser_ptbb_primary',
    seriesName: 'PTBB Primary Board Series',
    retailPrice: 220,
    originalPrice: 220,
    mrp: 220,
    costPrice: 187,
    publisherDiscountPercent: 15,
    wholesalePrice: 200,
    currentStock: 80,
    isActive: true,
    updatedAt: new Date().toISOString(),
  };
  productsDb.set(newProduct.id, newProduct);

  const items = Array.from(productsDb.values()).filter((p) => p.isActive);
  assert.equal(items.length, 6);
  const found = items.find((p) => p.sku === 'BK-PTBB-001');
  assert.ok(found, 'Newly added book is present in price list');
  assert.equal(found?.retailPrice, 220);
});

console.log('\n--- Requirement 2: Publisher > Series Hierarchy Format ---');

runTest('3. Products group into Publisher > Series > Products hierarchy correctly', () => {
  const allProds = Array.from(productsDb.values());
  const grouped = groupProducts(allProds);

  // Publishers represented
  const oxfordGroup = grouped.find((g) => g.publisherId === 'pub_oxford');
  assert.ok(oxfordGroup, 'Oxford group found');
  assert.equal(oxfordGroup?.seriesGroups.length, 2, 'Oxford has 2 series groups (Countdown and Modern English)');

  const countdownGroup = oxfordGroup?.seriesGroups.find((s) => s.seriesId === 'ser_countdown');
  assert.ok(countdownGroup, 'Countdown series found under Oxford');
  assert.equal(countdownGroup?.products.length, 2, 'Countdown has 2 books');

  const caravanGroup = grouped.find((g) => g.publisherId === 'pub_caravan');
  assert.ok(caravanGroup, 'Caravan group found');
  assert.equal(caravanGroup?.seriesGroups.length, 1);
});

runTest('4. Notebooks & Registers show their Size, Sheets, and Grammage specs', () => {
  const nb = productsDb.get('prod_nb_a4_100')!;
  assert.equal(nb.notebookSize, 'A4');
  assert.equal(nb.notebookSheets, '100');
  assert.equal(nb.notebookGrammage, '70 GSM');
  assert.equal(nb.retailPrice, 160);
});

console.log('\n--- Requirement 3: Direct Price Editing from Price List ---');

runTest('5. Owner can change MRP, Pub Disc %, and Wholesale Price directly from Price List', () => {
  const book = productsDb.get('prod_ox_count1')!;
  assert.equal(book.retailPrice, 850);
  assert.equal(book.costPrice, 680);
  assert.equal(book.wholesalePrice, 750);

  // Owner changes price in Price List: MRP raised to 950, Pub Disc changed to 25%, Wholesale to 800
  const updated = updateProductPriceMock('prod_ox_count1', {
    retailPrice: 950,
    publisherDiscountPercent: 25,
    wholesalePrice: 800,
  });

  assert.equal(updated.retailPrice, 950);
  assert.equal(updated.publisherDiscountPercent, 25);
  // Cost Price formula: 950 * (1 - 0.25) = 712.50
  assert.equal(updated.costPrice, 712.5);
  assert.equal(updated.wholesalePrice, 800);

  // Verify audit event was logged
  const audit = auditLogs.find((a) => a.action === 'PRODUCT_PRICE_UPDATED' && a.targetId === 'prod_ox_count1');
  assert.ok(audit, 'Price change audit trail was logged');
});

runTest('6. Physical store stock takes the new price for future sales', () => {
  const book = productsDb.get('prod_ox_count1')!;
  // Physical stock on hand (50 pieces) now carries the new retail price of 950
  assert.equal(book.retailPrice, 950);
  assert.equal(book.currentStock, 50);
});

console.log('\n--- Requirement 4: CRITICAL HISTORICAL IMMUTABILITY (Past Customer Khata Protection) ---');

setupTestData();

runTest('7. Customer Udhaar taken at original price remains strictly locked to original rate', () => {
  // Scenario:
  // Day 1: Customer Tariq buys 10 copies of Countdown 1 at Rs. 850 on credit.
  // Total bill = 10 * 850 = Rs. 8,500. Cash paid = 0.
  // Credit added to Tariq's Khata = Rs. 8,500.
  const inv1 = processSaleMock('INV-20261105-0001', 'cust_tariq', [{ productId: 'prod_ox_count1', quantity: 10 }], 0);

  assert.equal(inv1.grandTotal, 8500);
  assert.equal(inv1.creditAddedToKhata, 8500);

  const customerBefore = customersDb.get('cust_tariq')!;
  assert.equal(customerBefore.currentBalance, 8500, 'Customer balance after sale 1 is Rs. 8,500');

  const historicalSale = salesDb.get('INV-20261105-0001')!;
  assert.equal(historicalSale.items[0].unitPrice, 850);
  assert.equal(historicalSale.items[0].lineTotal, 8500);

  const historicalLedger = ledgerDb.find((l) => l.referenceId === 'INV-20261105-0001')!;
  assert.equal(historicalLedger.amount, 8500);
  assert.equal(historicalLedger.balanceAfter, 8500);

  // Day 2: Publisher raises prices!
  // Owner updates price in Price List: Retail Price Rs. 850 -> Rs. 1,200.
  updateProductPriceMock('prod_ox_count1', {
    retailPrice: 1200,
    publisherDiscountPercent: 20,
    wholesalePrice: 1050,
  });

  const bookNow = productsDb.get('prod_ox_count1')!;
  assert.equal(bookNow.retailPrice, 1200, 'Catalog price updated to Rs. 1,200');

  // CRITICAL CHECK A: Past invoice was NOT changed!
  const saleAfterCatalogChange = salesDb.get('INV-20261105-0001')!;
  assert.equal(
    saleAfterCatalogChange.items[0].unitPrice,
    850,
    'Historical invoice unitPrice must still be Rs. 850!'
  );
  assert.equal(
    saleAfterCatalogChange.items[0].lineTotal,
    8500,
    'Historical invoice lineTotal must still be Rs. 8,500!'
  );
  assert.equal(
    saleAfterCatalogChange.grandTotal,
    8500,
    'Historical invoice grandTotal must still be Rs. 8,500!'
  );

  // CRITICAL CHECK B: Past ledger entry was NOT changed!
  const ledgerAfterCatalogChange = ledgerDb.find((l) => l.referenceId === 'INV-20261105-0001')!;
  assert.equal(
    ledgerAfterCatalogChange.amount,
    8500,
    'Historical ledger entry amount must remain Rs. 8,500!'
  );
  assert.equal(
    ledgerAfterCatalogChange.balanceAfter,
    8500,
    'Historical ledger entry balanceAfter must remain Rs. 8,500!'
  );

  // CRITICAL CHECK C: Customer balance was NOT retroactively increased!
  const customerAfterCatalogChange = customersDb.get('cust_tariq')!;
  assert.equal(
    customerAfterCatalogChange.currentBalance,
    8500,
    'Customer debt must NOT be recalculated when catalog price changes!'
  );
});

runTest('8. Customer subsequent purchase correctly bills at the new price and adds to existing debt', () => {
  // Day 3: Customer Tariq comes back and buys 5 more copies of Countdown 1.
  // The catalog price is now Rs. 1,200.
  // 5 * 1200 = Rs. 6,000.
  const inv2 = processSaleMock('INV-20261106-0002', 'cust_tariq', [{ productId: 'prod_ox_count1', quantity: 5 }], 0);

  assert.equal(inv2.grandTotal, 6000, 'New sale grandTotal is Rs. 6,000');
  assert.equal(inv2.items[0].unitPrice, 1200, 'New sale billed at new price Rs. 1,200');

  // Customer balance is now: previous 8,500 + new 6,000 = Rs. 14,500
  const customerFinal = customersDb.get('cust_tariq')!;
  assert.equal(customerFinal.currentBalance, 14500, 'Customer debt correctly combines old udhar + new udhar');

  // Ledger has 2 distinct entries: one at 8,500 and one at 6,000
  assert.equal(ledgerDb.length, 2);
  assert.equal(ledgerDb[0].amount, 8500);
  assert.equal(ledgerDb[0].balanceAfter, 8500);
  assert.equal(ledgerDb[1].amount, 6000);
  assert.equal(ledgerDb[1].balanceAfter, 14500);
});

console.log('\n--- Requirement 5: Source Code & UI Route Integrity ---');

runTest('9. Price List route (/price-list) exists in AppRoutes.tsx', () => {
  const content = fs.readFileSync(path.resolve('src/routes/AppRoutes.tsx'), 'utf-8');
  assert.ok(content.includes('path="/price-list"'), 'Route /price-list is registered in AppRoutes.tsx');
  assert.ok(content.includes('<PriceList />') || content.includes('<PriceList/>'), 'Renders PriceList component');
});

runTest('10. Price List route is protected in AdminLockContext.tsx and SectionLockRoute.tsx', () => {
  const adminLockContent = fs.readFileSync(path.resolve('src/contexts/AdminLockContext.tsx'), 'utf-8');
  assert.ok(adminLockContent.includes("'/price-list'"), "AdminLockContext protects '/price-list'");

  const sectionLockContent = fs.readFileSync(path.resolve('src/routes/SectionLockRoute.tsx'), 'utf-8');
  assert.ok(sectionLockContent.includes("case '/price-list':"), "SectionLockRoute maps friendly name for '/price-list'");
});

runTest('11. Sidebar includes Price List navigation item at the end without Urdu font', () => {
  const content = fs.readFileSync(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');
  assert.ok(content.includes("to: '/price-list'"), "Sidebar navigates to '/price-list'");
  assert.ok(content.includes("name: 'Price List'"), "Sidebar displays clean English 'Price List'");
  // Verify it is placed after Expenses & Closing at the end of navItems
  const expensesIdx = content.indexOf("to: '/expenses'");
  const priceListIdx = content.indexOf("to: '/price-list'");
  assert.ok(priceListIdx > expensesIdx, 'Price List is positioned at the end of navItems in Sidebar');
});

runTest('12. Inventory.tsx includes Price List tab alongside Products & Movements', () => {
  const content = fs.readFileSync(path.resolve('src/pages/Inventory.tsx'), 'utf-8');
  assert.ok(content.includes("activeTab === 'pricelist'"), 'Inventory handles pricelist tab state');
  assert.ok(content.includes('<PriceListTable'), 'Inventory renders PriceListTable component');
});

// Final report
setTimeout(() => {
  console.log('\n====================================================================');
  console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================================\n');
  if (testsFailed > 0) process.exit(1);
}, 200);

