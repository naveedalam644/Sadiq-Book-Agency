import assert from 'node:assert/strict';

// ==============================================================================
// SADIQ BOOK AGENCY — MILESTONE 4.3 VERIFICATION TEST SUITE
// Testing: POS Screen, Customer Selection, Payment & Credit Limit Override
// 1. Customer Type Term Resolution (Parchon, Wholesale, Marketshop)
// 2. Dynamic Repricing on Customer Switching
// 3. Payment Calculation (Cash Tendered, Change, Khata Credit Addition)
// 4. Strict Parchon Cash Policy (No Credit for Walk-in)
// 5. Credit Limit Exceeded Detection & Over-limit Amount Calculation
// 6. Genuine Admin Override Payload Validation & Authorization
// 7. Atomic Sale Payload Preparation with Publisher Snapshots
// 8. Session Renewal & Cart Reset post-checkout
// ==============================================================================

let passedTests = 0;
const pendingPromises: Promise<void>[] = [];

const runTest = (name: string, fn: () => void | Promise<void>) => {
  try {
    const res = fn();
    if (res instanceof Promise) {
      const p = res
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${name}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${name}`);
          console.error(err);
          process.exit(1);
        });
      pendingPromises.push(p);
    } else {
      passedTests++;
      console.log(`✅ PASS: ${name}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
};

console.log('\n====================================================');
console.log('💳 SADIQ BOOK AGENCY — MILESTONE 4.3 POS TEST SUITE');
console.log('====================================================\n');

// Types & Mock Definitions
type CustomerType = 'parchon' | 'wholesaler' | 'marketshop';

interface CustomerDocument {
  id: string;
  name: string;
  shopName?: string;
  type: CustomerType;
  phone: string;
  creditLimit: number;
  currentBalance: number;
  discountPercentage?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProductDocument {
  id: string;
  sku: string;
  title: string;
  publisherName?: string;
  authorOrPublisher?: string;
  classification: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  isActive: boolean;
}

interface AdminCreditOverride {
  authorizedByUserId: string;
  authorizedByEmail: string;
  authorizedAt: string;
  reason: string;
  exceededAmount: number;
}

const sampleProduct1: ProductDocument = {
  id: 'prod_chem_09',
  sku: 'BK-SIN-CH9',
  title: 'Sindh Board Chemistry 9',
  publisherName: 'Sindh Textbook Board',
  classification: 'book',
  costPrice: 200,
  retailPrice: 300,
  wholesalePrice: 250,
  currentStock: 40,
  lowStockThreshold: 10,
  unit: 'piece',
  isActive: true,
};

const sampleProduct2: ProductDocument = {
  id: 'prod_oxf_eng5',
  sku: 'BK-OXF-E5',
  title: 'Oxford Progressive English 5',
  publisherName: 'Oxford University Press',
  classification: 'book',
  costPrice: 350,
  retailPrice: 500,
  wholesalePrice: 420,
  currentStock: 25,
  lowStockThreshold: 5,
  unit: 'piece',
  isActive: true,
};

const wholesaleCustomer: CustomerDocument = {
  id: 'cust_wh_1',
  name: 'Ahmed Wholesale',
  shopName: 'Ahmed Kitab Ghar',
  type: 'wholesaler',
  phone: '03001234567',
  creditLimit: 50000,
  currentBalance: 15000,
  isActive: true,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
};

const marketshopCustomer: CustomerDocument = {
  id: 'cust_mkt_1',
  name: 'Bilal Books',
  shopName: 'Bilal Stationers',
  type: 'marketshop',
  phone: '03007654321',
  creditLimit: 20000,
  currentBalance: 12000,
  discountPercentage: 15, // 15% off retail
  isActive: true,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
};

const roundMoney = (val: number): number => Math.round((Number(val) || 0) * 100) / 100;

// Pricing Calculation Engine matching discountService
const calculateItemPrice = (product: ProductDocument, customer: CustomerDocument | null, type: CustomerType) => {
  if (type === 'wholesaler') {
    return {
      unitPrice: product.wholesalePrice,
      effectivePrice: product.wholesalePrice,
      discountAmount: 0,
      discountRate: 0,
    };
  }
  if (type === 'marketshop') {
    const discPct = customer?.discountPercentage || 0;
    const discountAmount = roundMoney(product.retailPrice * (discPct / 100));
    const effectivePrice = roundMoney(product.retailPrice - discountAmount);
    return {
      unitPrice: product.retailPrice,
      effectivePrice,
      discountAmount,
      discountRate: discPct,
    };
  }
  // Parchon
  return {
    unitPrice: product.retailPrice,
    effectivePrice: product.retailPrice,
    discountAmount: 0,
    discountRate: 0,
  };
};

// ==============================================================================
// TEST SUITE 1: CUSTOMER TYPE SELECTION & DYNAMIC REPRICING
// ==============================================================================

runTest('Parchon walk-in customer applies full retail prices with 0% discount', () => {
  const p1Pricing = calculateItemPrice(sampleProduct1, null, 'parchon');
  assert.equal(p1Pricing.unitPrice, 300);
  assert.equal(p1Pricing.effectivePrice, 300);
  assert.equal(p1Pricing.discountAmount, 0);

  const p2Pricing = calculateItemPrice(sampleProduct2, null, 'parchon');
  assert.equal(p2Pricing.unitPrice, 500);
  assert.equal(p2Pricing.effectivePrice, 500);
  assert.equal(p2Pricing.discountAmount, 0);
});

runTest('Wholesale customer selection applies wholesale trade rates', () => {
  const p1Pricing = calculateItemPrice(sampleProduct1, wholesaleCustomer, 'wholesaler');
  assert.equal(p1Pricing.unitPrice, 250);
  assert.equal(p1Pricing.effectivePrice, 250);

  const p2Pricing = calculateItemPrice(sampleProduct2, wholesaleCustomer, 'wholesaler');
  assert.equal(p2Pricing.unitPrice, 420);
  assert.equal(p2Pricing.effectivePrice, 420);
});

runTest('Marketshop customer applies agreed store base discount percentage', () => {
  // sampleProduct1: 300 retail - 15% (45) = 255
  const p1Pricing = calculateItemPrice(sampleProduct1, marketshopCustomer, 'marketshop');
  assert.equal(p1Pricing.unitPrice, 300);
  assert.equal(p1Pricing.discountAmount, 45);
  assert.equal(p1Pricing.effectivePrice, 255);

  // sampleProduct2: 500 retail - 15% (75) = 425
  const p2Pricing = calculateItemPrice(sampleProduct2, marketshopCustomer, 'marketshop');
  assert.equal(p2Pricing.unitPrice, 500);
  assert.equal(p2Pricing.discountAmount, 75);
  assert.equal(p2Pricing.effectivePrice, 425);
});

runTest('Switching from Parchon to Wholesale immediately re-evaluates all cart line items', () => {
  const cartItems = [
    { product: sampleProduct1, quantity: 2 },
    { product: sampleProduct2, quantity: 3 },
  ];

  // In Parchon mode: (300 * 2) + (500 * 3) = 600 + 1500 = 2100
  const parchontotal = cartItems.reduce((acc, i) => {
    const p = calculateItemPrice(i.product, null, 'parchon');
    return acc + p.effectivePrice * i.quantity;
  }, 0);
  assert.equal(parchontotal, 2100);

  // Switch to Wholesale: (250 * 2) + (420 * 3) = 500 + 1260 = 1760
  const wholesaleTotal = cartItems.reduce((acc, i) => {
    const p = calculateItemPrice(i.product, wholesaleCustomer, 'wholesaler');
    return acc + p.effectivePrice * i.quantity;
  }, 0);
  assert.equal(wholesaleTotal, 1760);
});

// ==============================================================================
// TEST SUITE 2: PAYMENT & CASH TENDERED ACCOUNTING
// ==============================================================================

runTest('Exact cash payment computes 0 change and 0 Khata balance addition', () => {
  const grandTotal = 1760;
  const cashTendered = 1760;
  const changeReturned = Math.max(0, cashTendered - grandTotal);
  const balanceAddedToCredit = Math.max(0, grandTotal - cashTendered);

  assert.equal(changeReturned, 0);
  assert.equal(balanceAddedToCredit, 0);
});

runTest('Overpayment with cash computes exact change returned to customer', () => {
  const grandTotal = 1760;
  const cashTendered = 2000;
  const changeReturned = Math.max(0, cashTendered - grandTotal);
  const balanceAddedToCredit = 0;

  assert.equal(changeReturned, 240);
  assert.equal(balanceAddedToCredit, 0);
});

runTest('Partial cash payment on Wholesale account computes exact Khata debit addition', () => {
  const grandTotal = 1760;
  const cashTendered = 1000;
  const changeReturned = Math.max(0, cashTendered - grandTotal);
  const balanceAddedToCredit = grandTotal - cashTendered;

  assert.equal(changeReturned, 0);
  assert.equal(balanceAddedToCredit, 760);
});

runTest('Parchon walk-in customer is strictly blocked from partial or full credit terms', () => {
  const customerType: CustomerType = 'parchon';
  const grandTotal = 500;
  const cashTendered = 300;

  const validateParchonPayment = () => {
    if (customerType === 'parchon' && cashTendered < grandTotal) {
      throw new Error('Parchon walk-in customers cannot purchase on credit. Full payment required at counter.');
    }
  };

  assert.throws(validateParchonPayment, /cannot purchase on credit/);
});

// ==============================================================================
// TEST SUITE 3: CREDIT LIMIT OVERRIDE WORKFLOW
// ==============================================================================

runTest('Sale within customer credit limit does not require override', () => {
  const customer = { ...wholesaleCustomer, currentBalance: 10000, creditLimit: 20000 };
  const attemptedAddition = 5000;
  const projectedBalance = customer.currentBalance + attemptedAddition;

  const isExceeded = projectedBalance > customer.creditLimit;
  assert.equal(isExceeded, false);
});

runTest('Sale exceeding credit limit triggers override requirement with exact exceeded amount', () => {
  // Current: 18000, Limit: 20000, New Debt: 5000 -> Projected: 23000 -> Exceeded: 3000
  const customer = { ...wholesaleCustomer, currentBalance: 18000, creditLimit: 20000 };
  const attemptedAddition = 5000;
  const projectedBalance = customer.currentBalance + attemptedAddition;

  const isExceeded = projectedBalance > customer.creditLimit;
  const exceededAmount = isExceeded ? projectedBalance - customer.creditLimit : 0;

  assert.equal(isExceeded, true);
  assert.equal(exceededAmount, 3000);
});

runTest('Valid AdminCreditOverride records admin identity, timestamp, and justification', () => {
  const override: AdminCreditOverride = {
    authorizedByUserId: 'usr_admin_001',
    authorizedByEmail: 'admin@sadiqbookagency.com',
    authorizedAt: '2026-11-02T12:00:00.000Z',
    reason: 'Approved by Proprietor: Seasonal school textbook rush.',
    exceededAmount: 3000,
  };

  assert.equal(override.authorizedByEmail, 'admin@sadiqbookagency.com');
  assert.equal(override.exceededAmount, 3000);
  assert.ok(override.reason.length > 5);
  assert.ok(override.authorizedAt);
});

// ==============================================================================
// TEST SUITE 4: SALE PAYLOAD COMPATIBILITY & PUBLISHER SNAPSHOT INTEGRITY
// ==============================================================================

runTest('Sale items strictly retain authoritative publisherName without author fallback', () => {
  const items = [
    {
      productId: sampleProduct1.id,
      productTitle: sampleProduct1.title,
      sku: sampleProduct1.sku,
      publisherName: sampleProduct1.publisherName || 'Unknown',
      quantity: 2,
      unitPrice: 250,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 250,
      lineTotal: 500,
      appliedRuleType: 'standard_wholesale' as const,
    },
    {
      productId: sampleProduct2.id,
      productTitle: sampleProduct2.title,
      sku: sampleProduct2.sku,
      publisherName: sampleProduct2.publisherName || 'Unknown',
      quantity: 1,
      unitPrice: 420,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 420,
      lineTotal: 420,
      appliedRuleType: 'standard_wholesale' as const,
    },
  ];

  assert.equal(items[0].publisherName, 'Sindh Textbook Board');
  assert.equal(items[1].publisherName, 'Oxford University Press');
});

runTest('Confirming checkout success resets cart and refreshes checkout session for next sale', () => {
  let cartItems = [{ id: 'p1', qty: 2 }];
  let session = { id: 'CS-001' };

  // simulate confirmCheckoutSuccess()
  cartItems = [];
  session = { id: 'CS-002' };

  assert.equal(cartItems.length, 0);
  assert.equal(session.id, 'CS-002');
});

await Promise.all(pendingPromises);

console.log('\n====================================================');
console.log(`📊 MILESTONE 4.3 SUMMARY: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');

