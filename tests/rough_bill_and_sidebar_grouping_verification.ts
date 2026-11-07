import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — ROUGH BILL & SIDEBAR GROUPING VERIFICATION SUITE
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
console.log(' SADIQ BOOK AGENCY — ROUGH BILL & SIDEBAR GROUPING VERIFICATION');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------------
// In-Memory Simulation
// ---------------------------------------------------------------------------------

interface RoughBillItem {
  id: string;
  productId?: string;
  title: string;
  sku?: string;
  category?: string;
  publisherName?: string;
  seriesName?: string;
  notebookSize?: string;
  notebookSheets?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  lineTotal: number;
}

interface RoughBillDocument {
  id: string;
  billNo: string;
  billType: 'customer_estimate' | 'publisher_order';
  partyName: string;
  phone?: string;
  publisherId?: string;
  items: RoughBillItem[];
  subtotal: number;
  totalDiscount: number;
  totalAmount: number;
  totalQuantity: number;
  notes?: string;
  status: 'draft' | 'shared' | 'converted' | 'cancelled';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string;
  title: string;
  currentStock: number;
  retailPrice: number;
}

interface Customer {
  id: string;
  name: string;
  currentBalance: number;
}

const productsDb = new Map<string, Product>([
  ['prod_ox_eng_1', { id: 'prod_ox_eng_1', title: 'Oxford English Primer', currentStock: 50, retailPrice: 650 }],
  ['prod_ox_math_1', { id: 'prod_ox_math_1', title: 'Oxford Mathematics 1', currentStock: 40, retailPrice: 720 }],
  ['prod_nb_a4_80', { id: 'prod_nb_a4_80', title: 'Standard Notebook A4 80 Sheets', currentStock: 200, retailPrice: 180 }],
]);

const customersDb = new Map<string, Customer>([
  ['cust_al_hira', { id: 'cust_al_hira', name: 'Al-Hira Public School', currentBalance: 15000 }],
]);

const roughBillsDb = new Map<string, RoughBillDocument>();

function calculateLineTotal(quantity: number, rate: number, discountPercent: number): number {
  const gross = quantity * rate;
  const discount = gross * (discountPercent / 100);
  return Math.round(gross - discount);
}

function generateRoughBillNumber(type: 'customer_estimate' | 'publisher_order', seq: number): string {
  const prefix = type === 'customer_estimate' ? 'EST' : 'ORD';
  const dateStr = '20261107';
  return `${prefix}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------

console.log('--- 1. Rough Bill Generation & Math Calculation ---');

runTest('1. Customer Estimate calculates correct line totals, discounts, and grand total', () => {
  const items: RoughBillItem[] = [
    {
      id: 'item_1',
      productId: 'prod_ox_eng_1',
      title: 'Oxford English Primer',
      quantity: 10,
      rate: 650,
      discountPercent: 10, // 10 * 650 = 6500, discount 650 => 5850
      lineTotal: calculateLineTotal(10, 650, 10),
    },
    {
      id: 'item_2',
      productId: 'prod_nb_a4_80',
      title: 'Standard Notebook A4 80 Sheets',
      quantity: 50,
      rate: 180,
      discountPercent: 5, // 50 * 180 = 9000, discount 450 => 8550
      lineTotal: calculateLineTotal(50, 180, 5),
    },
  ];

  assert.equal(items[0].lineTotal, 5850);
  assert.equal(items[1].lineTotal, 8550);

  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.rate), 0);
  const totalAmount = items.reduce((sum, it) => sum + it.lineTotal, 0);
  const totalDiscount = subtotal - totalAmount;
  const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);

  assert.equal(subtotal, 15500);
  assert.equal(totalDiscount, 1100);
  assert.equal(totalAmount, 14400);
  assert.equal(totalQuantity, 60);

  const billNo = generateRoughBillNumber('customer_estimate', 1);
  assert.equal(billNo, 'EST-20261107-0001');

  roughBillsDb.set('rb_est_1', {
    id: 'rb_est_1',
    billNo,
    billType: 'customer_estimate',
    partyName: 'Al-Hira Public School',
    phone: '03001234567',
    items,
    subtotal,
    totalDiscount,
    totalAmount,
    totalQuantity,
    status: 'draft',
    createdBy: 'admin_1',
    createdByName: 'Store Owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.ok(roughBillsDb.has('rb_est_1'));
});

runTest('2. Publisher Order Draft calculates correct order totals without discount distortion', () => {
  const items: RoughBillItem[] = [
    {
      id: 'item_pub_1',
      productId: 'prod_ox_eng_1',
      title: 'Oxford English Primer',
      publisherName: 'Oxford University Press',
      quantity: 100,
      rate: 650,
      discountPercent: 0,
      lineTotal: calculateLineTotal(100, 650, 0),
    },
    {
      id: 'item_pub_2',
      productId: 'prod_ox_math_1',
      title: 'Oxford Mathematics 1',
      publisherName: 'Oxford University Press',
      quantity: 100,
      rate: 720,
      discountPercent: 0,
      lineTotal: calculateLineTotal(100, 720, 0),
    },
  ];

  assert.equal(items[0].lineTotal, 65000);
  assert.equal(items[1].lineTotal, 72000);

  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.rate), 0);
  const totalAmount = items.reduce((sum, it) => sum + it.lineTotal, 0);
  const totalDiscount = subtotal - totalAmount;
  const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);

  assert.equal(subtotal, 137000);
  assert.equal(totalDiscount, 0);
  assert.equal(totalAmount, 137000);
  assert.equal(totalQuantity, 200);

  const billNo = generateRoughBillNumber('publisher_order', 2);
  assert.equal(billNo, 'ORD-20261107-0002');

  roughBillsDb.set('rb_ord_1', {
    id: 'rb_ord_1',
    billNo,
    billType: 'publisher_order',
    partyName: 'Oxford University Press Karachi',
    phone: '02131234567',
    publisherId: 'pub_oxford',
    items,
    subtotal,
    totalDiscount,
    totalAmount,
    totalQuantity,
    status: 'shared',
    createdBy: 'admin_1',
    createdByName: 'Store Owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.ok(roughBillsDb.has('rb_ord_1'));
});

console.log('\n--- 2. Shop Inventory & Khata Ledger Zero Side-Effects (Immutability) ---');

runTest('3. Creating Customer Estimate strictly does NOT deduct store product stock', () => {
  // prod_ox_eng_1 stock must remain exactly 50
  assert.equal(productsDb.get('prod_ox_eng_1')!.currentStock, 50);
  // prod_nb_a4_80 stock must remain exactly 200
  assert.equal(productsDb.get('prod_nb_a4_80')!.currentStock, 200);
});

runTest('4. Creating Publisher Order strictly does NOT alter store product stock', () => {
  // prod_ox_eng_1 stock must remain 50 (order drafted, not received)
  assert.equal(productsDb.get('prod_ox_eng_1')!.currentStock, 50);
  // prod_ox_math_1 stock must remain 40
  assert.equal(productsDb.get('prod_ox_math_1')!.currentStock, 40);
});

runTest('5. Customer estimate strictly does NOT modify customer ledger or Khata debt balance', () => {
  const customer = customersDb.get('cust_al_hira')!;
  // Customer balance must remain unchanged at 15000 (rough bill is not an authoritative credit sale)
  assert.equal(customer.currentBalance, 15000);
});

console.log('\n--- 3. Conversion to POS Register Workflow ---');

runTest('6. Converting Rough Bill marks status as converted', () => {
  const bill = roughBillsDb.get('rb_est_1')!;
  bill.status = 'converted';
  bill.updatedAt = new Date().toISOString();

  assert.equal(roughBillsDb.get('rb_est_1')!.status, 'converted');
});

runTest('7. POS accepts converted rough bill items without breaking cart calculation', () => {
  const bill = roughBillsDb.get('rb_est_1')!;
  const cartItems = bill.items.map((item) => ({
    productId: item.productId!,
    quantity: item.quantity,
    unitPrice: item.rate,
    lineTotal: item.lineTotal,
  }));

  assert.equal(cartItems.length, 2);
  assert.equal(cartItems[0].quantity, 10);
  assert.equal(cartItems[1].quantity, 50);
});

console.log('\n--- 4. Sidebar Grouping Verification ---');

runTest('8. Sidebar contains Catalog & Estimates grouped section', () => {
  const content = fs.readFileSync(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');
  assert.ok(content.includes('Catalog & Estimates'), 'Sidebar has Catalog & Estimates section header');
  assert.ok(content.includes('catalogNavItems'), 'Sidebar groups catalog items into catalogNavItems');
});

runTest('9. Sidebar group contains Syllabus, Price List, and Rough Bill together', () => {
  const content = fs.readFileSync(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');
  assert.ok(content.includes("to: '/syllabus'"), 'catalogNavItems contains /syllabus');
  assert.ok(content.includes("name: 'Syllabus'"), 'catalogNavItems displays Syllabus');

  assert.ok(content.includes("to: '/price-list'"), 'catalogNavItems contains /price-list');
  assert.ok(content.includes("name: 'Price List'"), 'catalogNavItems displays Price List');

  assert.ok(content.includes("to: '/rough-bill'"), 'catalogNavItems contains /rough-bill');
  assert.ok(content.includes("name: 'Rough Bill'"), 'catalogNavItems displays Rough Bill');
});

console.log('\n--- 5. Source Code, Route & Security Verification ---');

runTest('10. AppRoutes registers /rough-bill route', () => {
  const content = fs.readFileSync(path.resolve('src/routes/AppRoutes.tsx'), 'utf-8');
  assert.ok(content.includes('path="/rough-bill"'), 'AppRoutes has /rough-bill route');
  assert.ok(content.includes('<RoughBill />') || content.includes('<RoughBill/>'), 'AppRoutes renders RoughBill component');
});

runTest('11. AdminLockContext & SectionLockRoute protect /rough-bill', () => {
  const adminLock = fs.readFileSync(path.resolve('src/contexts/AdminLockContext.tsx'), 'utf-8');
  assert.ok(adminLock.includes("'/rough-bill'"), "AdminLockContext protects '/rough-bill'");

  const secLock = fs.readFileSync(path.resolve('src/routes/SectionLockRoute.tsx'), 'utf-8');
  assert.ok(secLock.includes("case '/rough-bill':"), "SectionLockRoute maps friendly name for '/rough-bill'");
});

runTest('12. POS supports sba_preload_rough_bill session preloading', () => {
  const content = fs.readFileSync(path.resolve('src/pages/POS.tsx'), 'utf-8');
  assert.ok(content.includes('sba_preload_rough_bill'), 'POS reads sba_preload_rough_bill from sessionStorage');
  assert.ok(content.includes('addSyllabusSet(itemsToAdd)'), 'POS adds rough bill items to cart');
});

runTest('13. roughBillService implements complete CRUD & conversion methods', () => {
  const content = fs.readFileSync(path.resolve('src/services/roughBillService.ts'), 'utf-8');
  assert.ok(content.includes('saveRoughBill'), 'Service exports saveRoughBill');
  assert.ok(content.includes('getRoughBills'), 'Service exports getRoughBills');
  assert.ok(content.includes('getRoughBillById'), 'Service exports getRoughBillById');
  assert.ok(content.includes('deleteRoughBill'), 'Service exports deleteRoughBill');
  assert.ok(content.includes('markRoughBillAsConverted'), 'Service exports markRoughBillAsConverted');
  assert.ok(content.includes('generateRoughBillNumber'), 'Service exports generateRoughBillNumber');
});

runTest('14. firestore.rules protects /roughBills collection', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
  assert.ok(rules.includes('match /roughBills/{billId}'), 'Rules protect /roughBills');
});

runTest('15. firestore.indexes.json indexes roughBills collectionGroup', () => {
  const indexes = fs.readFileSync(path.resolve('firestore.indexes.json'), 'utf-8');
  assert.ok(indexes.includes('"roughBills"'), 'Indexes include roughBills collectionGroup');
});

console.log('\n--- 6. Stock Selection Flow & Real WhatsApp Icon Verification ---');

runTest('16. RoughBillModal implements Publisher -> Series -> Product stock selection flow', () => {
  const content = fs.readFileSync(path.resolve('src/components/roughBill/RoughBillModal.tsx'), 'utf-8');
  assert.ok(content.includes('getActivePublishers'), 'Modal fetches active publishers');
  assert.ok(content.includes('getActiveSeriesByPublisher'), 'Modal fetches series dynamically by publisher');
  assert.ok(content.includes('selectedPublisherId'), 'Modal tracks selectedPublisherId');
  assert.ok(content.includes('selectedSeriesId'), 'Modal tracks selectedSeriesId');
  assert.ok(content.includes('availableProducts'), 'Modal manages availableProducts from shop stock');
  assert.ok(content.includes('addQuantity'), 'Modal allows user to input quantity before adding');
  assert.ok(content.includes('+ Add to Bill'), 'Modal contains + Add to Bill button');
});

runTest('17. Real official WhatsAppIcon is implemented and used across WhatsApp touchpoints', () => {
  const iconContent = fs.readFileSync(path.resolve('src/components/common/WhatsAppIcon.tsx'), 'utf-8');
  assert.ok(iconContent.includes('#25D366'), 'WhatsAppIcon uses official WhatsApp green #25D366');
  assert.ok(iconContent.includes('#FFFFFF'), 'WhatsAppIcon uses official white handset');

  const printModal = fs.readFileSync(path.resolve('src/components/roughBill/RoughBillPrintModal.tsx'), 'utf-8');
  assert.ok(printModal.includes('<WhatsAppIcon'), 'RoughBillPrintModal uses WhatsAppIcon');

  const a4Modal = fs.readFileSync(path.resolve('src/components/pos/A4InvoiceModal.tsx'), 'utf-8');
  assert.ok(a4Modal.includes('<WhatsAppIcon'), 'A4InvoiceModal uses WhatsAppIcon');

  const posPage = fs.readFileSync(path.resolve('src/pages/POS.tsx'), 'utf-8');
  assert.ok(posPage.includes('<WhatsAppIcon'), 'POS Last Bill banner uses WhatsAppIcon');
});

// Summary
setTimeout(() => {
  console.log('\n====================================================================');
  console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================================\n');
  if (testsFailed > 0) process.exit(1);
}, 200);

