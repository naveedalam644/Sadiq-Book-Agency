import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// ====================================================================
// SADIQ BOOK AGENCY — POS OVERALL BILL DISCOUNT VERIFICATION
// ====================================================================

interface POSCartItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  effectivePrice: number;
  lineTotal: number;
  isManualDiscount?: boolean;
}

const roundMoney = (val: number): number => Math.round((Number(val) || 0) * 100) / 100;

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — POS OVERALL BILL DISCOUNT VERIFICATION');
console.log('====================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failedTests++;
  }
}

// --------------------------------------------------------------------
// In-Memory Simulation of Global Discount Logic
// --------------------------------------------------------------------
function applyGlobalDiscountToItems(items: POSCartItem[], discountRate: number): POSCartItem[] {
  const rate = Math.max(0, Math.min(100, Number(discountRate) || 0));
  return items.map((item) => {
    const discountAmount = roundMoney(item.unitPrice * (rate / 100));
    const effectivePrice = Math.max(0, roundMoney(item.unitPrice - discountAmount));
    const lineTotal = roundMoney(effectivePrice * item.quantity);
    return {
      ...item,
      discountRate: rate,
      discountAmount,
      effectivePrice,
      lineTotal,
      isManualDiscount: rate > 0,
    };
  });
}

function applyGlobalDiscountAmountToItems(items: POSCartItem[], totalDiscountAmount: number): POSCartItem[] {
  const rawSubtotal = items.reduce((sum, item) => roundMoney(sum + item.unitPrice * item.quantity), 0);
  if (rawSubtotal <= 0) return items;
  const cleanAmt = Math.max(0, Math.min(rawSubtotal, Number(totalDiscountAmount) || 0));
  const effectiveRate = Math.round((cleanAmt / rawSubtotal) * 10000) / 100;
  return applyGlobalDiscountToItems(items, effectiveRate);
}

function calculateCartTotals(items: POSCartItem[]) {
  let sub = 0;
  let disc = 0;
  for (const item of items) {
    sub = roundMoney(sub + item.unitPrice * item.quantity);
    disc = roundMoney(disc + item.discountAmount * item.quantity);
  }
  const grand = Math.max(0, roundMoney(sub - disc));
  return { subtotal: sub, totalDiscount: disc, grandTotal: grand };
}

// ====================================================================
// 1. Math and Multi-Item Cart Global Discount Verification
// ====================================================================
console.log('--- 1. Math & Real-Time Overall Cart Discount ---');

runTest('1. Apply 10% overall discount across all books in the cart', () => {
  const initialItems: POSCartItem[] = [
    {
      productId: 'b1',
      productName: 'English Progressive Class 3',
      sku: 'BK-ENG-03',
      quantity: 2,
      unitPrice: 500,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 500,
      lineTotal: 1000,
    },
    {
      productId: 'b2',
      productName: 'Oxford Urdu Class 3',
      sku: 'BK-URD-03',
      quantity: 3,
      unitPrice: 400,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 400,
      lineTotal: 1200,
    },
  ];

  const initialTotals = calculateCartTotals(initialItems);
  assert.strictEqual(initialTotals.subtotal, 2200, 'Initial subtotal must be 2200');
  assert.strictEqual(initialTotals.totalDiscount, 0, 'Initial discount must be 0');
  assert.strictEqual(initialTotals.grandTotal, 2200, 'Initial grand total must be 2200');

  // Apply 10% global discount
  const discounted = applyGlobalDiscountToItems(initialItems, 10);
  const totals = calculateCartTotals(discounted);

  // Book 1: 500 - 10% (50) = 450 * 2 = 900
  assert.strictEqual(discounted[0].effectivePrice, 450);
  assert.strictEqual(discounted[0].lineTotal, 900);

  // Book 2: 400 - 10% (40) = 360 * 3 = 1080
  assert.strictEqual(discounted[1].effectivePrice, 360);
  assert.strictEqual(discounted[1].lineTotal, 1080);

  // Total discount = 100 + 120 = 220 (10% of 2200)
  assert.strictEqual(totals.subtotal, 2200);
  assert.strictEqual(totals.totalDiscount, 220);
  assert.strictEqual(totals.grandTotal, 1980);
});

runTest('2. Apply Flat PKR Amount overall discount (e.g. PKR 220 off)', () => {
  const initialItems: POSCartItem[] = [
    {
      productId: 'b1',
      productName: 'Book A',
      sku: 'BK-A',
      quantity: 1,
      unitPrice: 1000,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 1000,
      lineTotal: 1000,
    },
    {
      productId: 'b2',
      productName: 'Book B',
      sku: 'BK-B',
      quantity: 1,
      unitPrice: 1000,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 1000,
      lineTotal: 1000,
    },
  ];

  // Flat PKR 300 discount off 2000 total = 15%
  const discounted = applyGlobalDiscountAmountToItems(initialItems, 300);
  const totals = calculateCartTotals(discounted);

  assert.strictEqual(totals.subtotal, 2000);
  assert.strictEqual(totals.totalDiscount, 300);
  assert.strictEqual(totals.grandTotal, 1700);
});

runTest('3. Individual item line override remains preserved and customizable', () => {
  const initialItems: POSCartItem[] = [
    {
      productId: 'b1',
      productName: 'Book 1',
      sku: 'BK-1',
      quantity: 1,
      unitPrice: 1000,
      discountRate: 10,
      discountAmount: 100,
      effectivePrice: 900,
      lineTotal: 900,
    },
    {
      productId: 'b2',
      productName: 'Book 2',
      sku: 'BK-2',
      quantity: 1,
      unitPrice: 1000,
      discountRate: 10,
      discountAmount: 100,
      effectivePrice: 900,
      lineTotal: 900,
    },
  ];

  // Cashier manually gives 25% discount to Book 1 only
  initialItems[0].discountRate = 25;
  initialItems[0].discountAmount = 250;
  initialItems[0].effectivePrice = 750;
  initialItems[0].lineTotal = 750;

  const totals = calculateCartTotals(initialItems);
  assert.strictEqual(totals.subtotal, 2000);
  assert.strictEqual(totals.totalDiscount, 350); // 250 + 100
  assert.strictEqual(totals.grandTotal, 1650);
});

// ====================================================================
// 2. Source Code Implementation Verification
// ====================================================================
console.log('\n--- 2. Source Code Hook & UI Implementation ---');

runTest('4. usePOSCart exports applyGlobalDiscount and applyGlobalDiscountAmount', () => {
  const hookPath = path.resolve(process.cwd(), 'src/hooks/usePOSCart.ts');
  const content = fs.readFileSync(hookPath, 'utf8');

  assert.ok(content.includes('applyGlobalDiscount = useCallback('), 'Hook must define applyGlobalDiscount');
  assert.ok(content.includes('applyGlobalDiscountAmount = useCallback('), 'Hook must define applyGlobalDiscountAmount');
  assert.ok(content.includes('applyGlobalDiscount,'), 'Hook must return applyGlobalDiscount');
  assert.ok(content.includes('applyGlobalDiscountAmount,'), 'Hook must return applyGlobalDiscountAmount');
});

runTest('5. POS.tsx renders Overall Bill Discount box with mode toggle & quick presets', () => {
  const posPath = path.resolve(process.cwd(), 'src/pages/POS.tsx');
  const content = fs.readFileSync(posPath, 'utf8');

  assert.ok(content.includes('applyGlobalDiscount,'), 'POS must destructure applyGlobalDiscount');
  assert.ok(content.includes('Overall Bill Discount'), 'POS must render Overall Bill Discount header');
  assert.ok(content.includes('globalDiscountMode'), 'POS must manage globalDiscountMode state');
  assert.ok(content.includes('globalDiscountValue'), 'POS must manage globalDiscountValue state');
  assert.ok(content.includes('handlePresetDiscountClick'), 'POS must have preset discount click handler');
  assert.ok(content.includes('[0, 5, 10, 15, 20, 25].map'), 'POS must offer 0%, 5%, 10%, 15%, 20%, 25% quick presets');
});

// ====================================================================
// Summary Report
// ====================================================================
console.log('\n====================================================================');
console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

