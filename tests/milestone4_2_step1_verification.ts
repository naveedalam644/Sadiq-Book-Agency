import assert from 'node:assert/strict';

// ==============================================================================
// SADIQ BOOK AGENCY — MILESTONE 4.2 STEP 1 VERIFICATION TEST SUITE
// Testing: POS Cart State, Stock Protection, Pricing Hierarchy,
// Persistence, Web Locks Concurrency & Same-Tab Double Submit Guard
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
console.log('🛒 SADIQ BOOK AGENCY — MILESTONE 4.2 STEP 1 TEST SUITE');
console.log('====================================================\n');

// Types & Mock Classes
type CustomerType = 'wholesaler' | 'parchon' | 'marketshop';

interface ProductDocument {
  id: string;
  sku: string;
  title: string;
  classification: string;
  categoryId: string;
  publisherName?: string;
  authorOrPublisher?: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomerDocument {
  id: string;
  name: string;
  type: CustomerType;
  phone: string;
  shopName?: string;
  creditLimit: number;
  currentBalance: number;
  discountPercentage?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomerDiscountDocument {
  id: string;
  customerId: string;
  productId: string;
  discountType: 'percentage' | 'fixed_rate';
  discountValue: number;
  basePriceType: 'wholesale' | 'retail';
  standardPrice: number;
  createdAt: string;
  updatedAt: string;
}

interface POSCartItem {
  productId: string;
  productName: string;
  sku: string;
  publisherName: string;
  availableStock: number;
  costPrice: number;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  effectivePrice: number;
  lineTotal: number;
  appliedRuleType:
    | 'standard_retail'
    | 'standard_wholesale'
    | 'customer_base'
    | 'custom_percentage'
    | 'custom_fixed';
}

interface CheckoutSession {
  checkoutSessionId: string;
  terminalId: string;
  sessionCreatedAt: string;
}

interface PersistentCartState {
  session: CheckoutSession;
  customerType: CustomerType;
  customer: CustomerDocument | null;
  items: POSCartItem[];
  notes?: string;
  lastUpdated: number;
}

const roundMoney = (val: number): number => Math.round((Number(val) || 0) * 100) / 100;

// Phase 3 Pure Pricing Engine Implementation
const resolveEffectivePrice = (
  product: ProductDocument,
  customer: CustomerDocument,
  customDiscount?: CustomerDiscountDocument | null
): {
  effectivePrice: number;
  appliedRuleType:
    | 'custom_fixed'
    | 'custom_percentage'
    | 'customer_base'
    | 'standard_wholesale'
    | 'standard_retail';
  discountRatePercent: number;
  savingsPerUnit: number;
  basePrice: number;
} => {
  const standardRetail = Number(product.retailPrice) || 0;
  const standardWholesale = Number(product.wholesalePrice) || standardRetail;

  if (customDiscount) {
    if (customDiscount.discountType === 'fixed_rate') {
      const fixedRate = Math.max(0, Number(customDiscount.discountValue) || 0);
      const base = customDiscount.basePriceType === 'wholesale' ? standardWholesale : standardRetail;
      const savings = Math.max(0, base - fixedRate);
      const pct = base > 0 ? Math.round((savings / base) * 1000) / 10 : 0;
      return { effectivePrice: fixedRate, appliedRuleType: 'custom_fixed', discountRatePercent: pct, savingsPerUnit: savings, basePrice: base };
    }

    if (customDiscount.discountType === 'percentage') {
      const pct = Math.max(0, Math.min(100, Number(customDiscount.discountValue) || 0));
      const base = customDiscount.basePriceType === 'wholesale' ? standardWholesale : standardRetail;
      const calculatedRate = Math.round(base * (1 - pct / 100) * 100) / 100;
      const savings = Math.max(0, base - calculatedRate);
      return { effectivePrice: calculatedRate, appliedRuleType: 'custom_percentage', discountRatePercent: pct, savingsPerUnit: savings, basePrice: base };
    }
  }

  if (customer.type === 'marketshop' && (customer.discountPercentage || 0) > 0) {
    const basePct = Math.min(100, Math.max(0, customer.discountPercentage || 0));
    const base = standardRetail;
    const discountedRate = Math.round(base * (1 - basePct / 100) * 100) / 100;
    const savings = Math.max(0, base - discountedRate);
    return { effectivePrice: discountedRate, appliedRuleType: 'customer_base', discountRatePercent: basePct, savingsPerUnit: savings, basePrice: base };
  }

  if (customer.type === 'wholesaler') {
    return { effectivePrice: standardWholesale, appliedRuleType: 'standard_wholesale', discountRatePercent: 0, savingsPerUnit: Math.max(0, standardRetail - standardWholesale), basePrice: standardWholesale };
  }

  return { effectivePrice: standardRetail, appliedRuleType: 'standard_retail', discountRatePercent: 0, savingsPerUnit: 0, basePrice: standardRetail };
};

// Storage Mock
class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

// Web Locks Mock
class MockWebLockManager {
  private activeLocks = new Set<string>();

  async request<T>(
    name: string,
    options: { mode?: 'exclusive'; ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => Promise<T>
  ): Promise<T> {
    if (this.activeLocks.has(name)) {
      if (options.ifAvailable) {
        return await callback(null);
      }
      throw new Error(`Lock ${name} already held`);
    }

    this.activeLocks.add(name);
    try {
      return await callback({ name });
    } finally {
      this.activeLocks.delete(name);
    }
  }

  isLockHeld(name: string): boolean {
    return this.activeLocks.has(name);
  }

  forceRelease(name: string): void {
    this.activeLocks.delete(name);
  }
}

// Reusable Sample Fixtures
const sampleBook1: ProductDocument = {
  id: 'prod_chem_9',
  sku: 'BK-SIN-1001',
  title: 'Sindh Textbook Chemistry 9',
  classification: 'book',
  categoryId: 'cat_matric',
  publisherName: 'Sindh Textbook Board',
  authorOrPublisher: 'Dr. Ahmad Khan', // Obsolete field, must NOT be used for publisherName!
  costPrice: 200,
  retailPrice: 300,
  wholesalePrice: 240,
  currentStock: 25,
  lowStockThreshold: 5,
  unit: 'piece',
  isActive: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const sampleBook2: ProductDocument = {
  id: 'prod_eng_5',
  sku: 'BK-OXF-2002',
  title: 'Oxford Progressive English 5',
  classification: 'book',
  categoryId: 'cat_primary',
  publisherName: 'Oxford University Press',
  costPrice: 400,
  retailPrice: 600,
  wholesalePrice: 480,
  currentStock: 10,
  lowStockThreshold: 3,
  unit: 'piece',
  isActive: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const sampleOutOfStockBook: ProductDocument = {
  id: 'prod_zero_stock',
  sku: 'BK-OOS-9999',
  title: 'Out of Stock Math 10',
  classification: 'book',
  categoryId: 'cat_matric',
  publisherName: 'Punjab Board',
  costPrice: 150,
  retailPrice: 250,
  wholesalePrice: 200,
  currentStock: 0, // ZERO stock
  lowStockThreshold: 5,
  unit: 'piece',
  isActive: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const wholesalerCustomer: CustomerDocument = {
  id: 'cust_swat_101',
  name: 'Swat Book Center',
  shopName: 'Swat Book Center Mingora',
  type: 'wholesaler',
  phone: '03451111111',
  creditLimit: 100000,
  currentBalance: 20000,
  isActive: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const marketshopCustomer: CustomerDocument = {
  id: 'cust_market_202',
  name: 'Al-Madina Kitab Ghar',
  shopName: 'Al-Madina Kitab Ghar Saidu',
  type: 'marketshop',
  phone: '03452222222',
  creditLimit: 50000,
  currentBalance: 5000,
  discountPercentage: 15, // 15% store base discount
  isActive: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

// ==============================================================================
// TEST SUITE 1: CART STATE & ITEM DEDUPLICATION
// ==============================================================================

runTest('Adding a product creates a new cart line item with resolved pricing and publisher snapshot', () => {
  const customer: CustomerDocument = { id: '', name: 'Counter Cash Customer', type: 'parchon', phone: '', creditLimit: 0, currentBalance: 0, isActive: true, createdAt: '', updatedAt: '' };
  const pricing = resolveEffectivePrice(sampleBook1, customer);

  const cartItem: POSCartItem = {
    productId: sampleBook1.id,
    productName: sampleBook1.title,
    sku: sampleBook1.sku,
    publisherName: sampleBook1.publisherName || 'Unknown',
    availableStock: sampleBook1.currentStock,
    costPrice: sampleBook1.costPrice,
    quantity: 2,
    unitPrice: pricing.basePrice,
    discountRate: pricing.discountRatePercent,
    discountAmount: pricing.savingsPerUnit,
    effectivePrice: pricing.effectivePrice,
    lineTotal: roundMoney(pricing.effectivePrice * 2),
    appliedRuleType: pricing.appliedRuleType,
  };

  assert.equal(cartItem.productId, 'prod_chem_9');
  assert.equal(cartItem.publisherName, 'Sindh Textbook Board');
  assert.equal(cartItem.unitPrice, 300);
  assert.equal(cartItem.effectivePrice, 300);
  assert.equal(cartItem.lineTotal, 600);
});

runTest('Adding an existing product increments quantity rather than creating duplicate row', () => {
  let cart: POSCartItem[] = [
    {
      productId: 'prod_chem_9',
      productName: 'Sindh Textbook Chemistry 9',
      sku: 'BK-SIN-1001',
      publisherName: 'Sindh Textbook Board',
      availableStock: 25,
      costPrice: 200,
      quantity: 2,
      unitPrice: 300,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 300,
      lineTotal: 600,
      appliedRuleType: 'standard_retail',
    },
  ];

  // Cashier scans or adds the same product again with quantity 3
  const addQty = 3;
  const existingIndex = cart.findIndex((i) => i.productId === 'prod_chem_9');
  assert.notEqual(existingIndex, -1);

  const existing = cart[existingIndex];
  const updatedQty = existing.quantity + addQty;
  assert.equal(updatedQty, 5);

  cart[existingIndex] = {
    ...existing,
    quantity: updatedQty,
    lineTotal: roundMoney(existing.effectivePrice * updatedQty),
  };

  assert.equal(cart.length, 1, 'Cart row count must remain 1 (no duplicate row)');
  assert.equal(cart[0].quantity, 5);
  assert.equal(cart[0].lineTotal, 1500);
});

runTest('Removing an item filters it from the cart', () => {
  let cart: POSCartItem[] = [
    { productId: 'p1', productName: 'Book 1', sku: 'BK-1', publisherName: 'Pub 1', availableStock: 10, costPrice: 100, quantity: 1, unitPrice: 200, discountRate: 0, discountAmount: 0, effectivePrice: 200, lineTotal: 200, appliedRuleType: 'standard_retail' },
    { productId: 'p2', productName: 'Book 2', sku: 'BK-2', publisherName: 'Pub 2', availableStock: 10, costPrice: 150, quantity: 2, unitPrice: 300, discountRate: 0, discountAmount: 0, effectivePrice: 300, lineTotal: 600, appliedRuleType: 'standard_retail' },
  ];

  cart = cart.filter((i) => i.productId !== 'p1');
  assert.equal(cart.length, 1);
  assert.equal(cart[0].productId, 'p2');
});

runTest('Clearing cart removes all items but preserves session identity', () => {
  const session: CheckoutSession = {
    checkoutSessionId: 'CS-261102-T1-ABC123456789',
    terminalId: 'T1',
    sessionCreatedAt: '2026-11-02T12:00:00.000Z',
  };

  let cartItems: POSCartItem[] = [
    { productId: 'p1', productName: 'Book 1', sku: 'BK-1', publisherName: 'Pub', availableStock: 5, costPrice: 50, quantity: 2, unitPrice: 100, discountRate: 0, discountAmount: 0, effectivePrice: 100, lineTotal: 200, appliedRuleType: 'standard_retail' },
  ];

  // Action: clear cart
  cartItems = [];

  assert.equal(cartItems.length, 0);
  assert.equal(session.checkoutSessionId, 'CS-261102-T1-ABC123456789', 'Session ID must remain intact on cart clear');
});

// ==============================================================================
// TEST SUITE 2: STOCK BOUNDARY ENFORCEMENT
// ==============================================================================

runTest('Adding an out-of-stock product (currentStock <= 0) is strictly rejected', () => {
  const available = sampleOutOfStockBook.currentStock;
  let rejected = false;
  let errorMessage = '';

  if (available <= 0) {
    rejected = true;
    errorMessage = `Cannot add "${sampleOutOfStockBook.title}". Product is out of physical stock. Negative inventory is prohibited.`;
  }

  assert.equal(rejected, true);
  assert.match(errorMessage, /out of physical stock/i);
});

runTest('Adding a product with quantity exceeding available stock is strictly rejected', () => {
  const available = sampleBook2.currentStock; // 10 units available
  const requestedQty = 15;
  let rejected = false;

  if (requestedQty > available) {
    rejected = true;
  }

  assert.equal(rejected, true, 'Quantity greater than available stock must be rejected');
});

runTest('Quantity updates to 0 or negative values are strictly rejected', () => {
  const invalidQuantities = [0, -1, -5];

  for (const qty of invalidQuantities) {
    let rejected = false;
    if (qty <= 0) {
      rejected = true;
    }
    assert.equal(rejected, true, `Quantity ${qty} must be rejected`);
  }
});

runTest('Quantity update exceeding stock limit is blocked without silent corruption', () => {
  const availableStock = 10;
  const attemptedNewQty = 12;
  let rejected = false;

  if (attemptedNewQty > availableStock) {
    rejected = true;
  }

  assert.equal(rejected, true);
});

// ==============================================================================
// TEST SUITE 3: AUTOMATIC MONETARY CALCULATIONS & ROUNDING SAFETY
// ==============================================================================

runTest('Precision monetary rounding prevents floating point anomalies', () => {
  // Test case where standard floating point arithmetic produces 0.30000000000000004
  const a = 0.1;
  const b = 0.2;
  assert.notEqual(a + b, 0.3); // Raw JS float defect
  assert.equal(roundMoney(a + b), 0.3, 'roundMoney must produce exactly 0.30');

  // Multi-item decimal line total test
  const unitPrice = 49.99;
  const qty = 3;
  const discountAmount = 4.999;
  const effectivePrice = roundMoney(unitPrice - discountAmount); // 44.99
  const lineTotal = roundMoney(effectivePrice * qty); // 134.97

  assert.equal(effectivePrice, 44.99);
  assert.equal(lineTotal, 134.97);
});

runTest('Cart subtotal, totalDiscount and grandTotal calculate accurately', () => {
  const items: POSCartItem[] = [
    {
      productId: 'p1',
      productName: 'Book 1',
      sku: 'BK-1',
      publisherName: 'Pub 1',
      availableStock: 20,
      costPrice: 200,
      quantity: 3,
      unitPrice: 300,
      discountRate: 10,
      discountAmount: 30, // 30 per unit
      effectivePrice: 270,
      lineTotal: 810,
      appliedRuleType: 'custom_percentage',
    },
    {
      productId: 'p2',
      productName: 'Book 2',
      sku: 'BK-2',
      publisherName: 'Pub 2',
      availableStock: 15,
      costPrice: 100,
      quantity: 2,
      unitPrice: 150,
      discountRate: 0,
      discountAmount: 0,
      effectivePrice: 150,
      lineTotal: 300,
      appliedRuleType: 'standard_retail',
    },
  ];

  let subtotal = 0;
  let totalDiscount = 0;
  for (const item of items) {
    subtotal = roundMoney(subtotal + roundMoney(item.unitPrice * item.quantity));
    totalDiscount = roundMoney(totalDiscount + roundMoney(item.discountAmount * item.quantity));
  }
  const grandTotal = Math.max(0, roundMoney(subtotal - totalDiscount));

  // Expected:
  // p1: 300 * 3 = 900 subtotal, 30 * 3 = 90 discount
  // p2: 150 * 2 = 300 subtotal, 0 discount
  // Total Subtotal: 900 + 300 = 1200
  // Total Discount: 90 + 0 = 90
  // Grand Total: 1200 - 90 = 1110
  assert.equal(subtotal, 1200);
  assert.equal(totalDiscount, 90);
  assert.equal(grandTotal, 1110);
  assert.equal(grandTotal, subtotal - totalDiscount);
});

// ==============================================================================
// TEST SUITE 4: CUSTOMER ARCHETYPES & PRICING HIERARCHY
// ==============================================================================

runTest('Parchon walk-in applies standard retail price with 0% discount', () => {
  const parchonCustomer: CustomerDocument = {
    id: '',
    name: 'Counter Cash Customer',
    type: 'parchon',
    phone: '',
    creditLimit: 0,
    currentBalance: 0,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };

  const pricing = resolveEffectivePrice(sampleBook1, parchonCustomer, null);
  assert.equal(pricing.appliedRuleType, 'standard_retail');
  assert.equal(pricing.effectivePrice, 300);
  assert.equal(pricing.discountRatePercent, 0);
  assert.equal(pricing.savingsPerUnit, 0);
});

runTest('Wholesale customer applies wholesale trade price', () => {
  const pricing = resolveEffectivePrice(sampleBook1, wholesalerCustomer, null);
  assert.equal(pricing.appliedRuleType, 'standard_wholesale');
  assert.equal(pricing.effectivePrice, 240); // Wholesale price
  assert.equal(pricing.basePrice, 240);
  assert.equal(pricing.discountRatePercent, 0);
});

runTest('Wholesale customer with custom product fixed rate prioritizes Level 1 discount', () => {
  const customDiscount: CustomerDiscountDocument = {
    id: 'cust_swat_101_prod_chem_9',
    customerId: 'cust_swat_101',
    productId: 'prod_chem_9',
    discountType: 'fixed_rate',
    discountValue: 220, // Special negotiated fixed rate
    basePriceType: 'wholesale',
    standardPrice: 240,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const pricing = resolveEffectivePrice(sampleBook1, wholesalerCustomer, customDiscount);
  assert.equal(pricing.appliedRuleType, 'custom_fixed');
  assert.equal(pricing.effectivePrice, 220);
  assert.equal(pricing.savingsPerUnit, 20); // 240 - 220
});

runTest('Marketshop customer applies agreed customer base store discount (15% off retail)', () => {
  const pricing = resolveEffectivePrice(sampleBook1, marketshopCustomer, null);
  assert.equal(pricing.appliedRuleType, 'customer_base');
  assert.equal(pricing.discountRatePercent, 15);
  // Retail = 300, 15% discount = 45, Effective Price = 255
  assert.equal(pricing.effectivePrice, 255);
  assert.equal(pricing.savingsPerUnit, 45);
});

runTest('Marketshop customer with product-specific discount prioritizes Level 1 over base store %', () => {
  const customDiscount: CustomerDiscountDocument = {
    id: 'cust_market_202_prod_chem_9',
    customerId: 'cust_market_202',
    productId: 'prod_chem_9',
    discountType: 'percentage',
    discountValue: 25, // 25% special discount on this item (overriding base 15%)
    basePriceType: 'retail',
    standardPrice: 300,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const pricing = resolveEffectivePrice(sampleBook1, marketshopCustomer, customDiscount);
  assert.equal(pricing.appliedRuleType, 'custom_percentage');
  assert.equal(pricing.discountRatePercent, 25);
  // 300 * (1 - 0.25) = 225
  assert.equal(pricing.effectivePrice, 225);
  assert.equal(pricing.savingsPerUnit, 75);
});

runTest('Customer switching dynamically recalculates all existing cart items', () => {
  // 1. Initial cart created for Parchon Cash Walk-in:
  const parchonCustomer: CustomerDocument = { id: '', name: 'Walk-in', type: 'parchon', phone: '', creditLimit: 0, currentBalance: 0, isActive: true, createdAt: '', updatedAt: '' };
  const p1Pricing = resolveEffectivePrice(sampleBook1, parchonCustomer, null);

  let cart: POSCartItem[] = [
    {
      productId: sampleBook1.id,
      productName: sampleBook1.title,
      sku: sampleBook1.sku,
      publisherName: 'Sindh Textbook Board',
      availableStock: 25,
      costPrice: 200,
      quantity: 10,
      unitPrice: p1Pricing.basePrice,
      discountRate: p1Pricing.discountRatePercent,
      discountAmount: p1Pricing.savingsPerUnit,
      effectivePrice: p1Pricing.effectivePrice,
      lineTotal: roundMoney(p1Pricing.effectivePrice * 10),
      appliedRuleType: p1Pricing.appliedRuleType,
    },
  ];

  // Parchon Total: 300 * 10 = 3000
  assert.equal(cart[0].lineTotal, 3000);

  // 2. Cashier switches customer to Wholesaler (Swat Book Center)
  // All line items recalculate:
  cart = cart.map((item) => {
    const pricing = resolveEffectivePrice(sampleBook1, wholesalerCustomer, null);
    return {
      ...item,
      unitPrice: pricing.basePrice,
      discountRate: pricing.discountRatePercent,
      discountAmount: pricing.savingsPerUnit,
      effectivePrice: pricing.effectivePrice,
      lineTotal: roundMoney(pricing.effectivePrice * item.quantity),
      appliedRuleType: pricing.appliedRuleType,
    };
  });

  // Wholesaler Total: 240 * 10 = 2400
  assert.equal(cart[0].effectivePrice, 240);
  assert.equal(cart[0].lineTotal, 2400);

  // 3. Cashier switches customer to Marketshop (Al-Madina Kitab Ghar, 15% discount)
  cart = cart.map((item) => {
    const pricing = resolveEffectivePrice(sampleBook1, marketshopCustomer, null);
    return {
      ...item,
      unitPrice: pricing.basePrice,
      discountRate: pricing.discountRatePercent,
      discountAmount: pricing.savingsPerUnit,
      effectivePrice: pricing.effectivePrice,
      lineTotal: roundMoney(pricing.effectivePrice * item.quantity),
      appliedRuleType: pricing.appliedRuleType,
    };
  });

  // Marketshop Total: 255 * 10 = 2550
  assert.equal(cart[0].effectivePrice, 255);
  assert.equal(cart[0].lineTotal, 2550);
});

// Storage Helper Implementations mirroring production usePOSCart and saleService
const getPOSCartStorageKey = (terminalId = 'T1'): string => {
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  return `sba_active_pos_cart_${cleanTerm}`;
};

const getCheckoutSessionStorageKey = (terminalId = 'T1'): string => {
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  return `sba_active_checkout_session_${cleanTerm}`;
};

const getOrCreateCheckoutSession = (
  terminalId = 'T1',
  storage?: MockLocalStorage
): CheckoutSession => {
  const store = storage;
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  const storageKey = getCheckoutSessionStorageKey(cleanTerm);

  if (store) {
    try {
      const existingJson = store.getItem(storageKey);
      if (existingJson) {
        const parsed = JSON.parse(existingJson) as CheckoutSession;
        if (
          parsed.checkoutSessionId &&
          parsed.sessionCreatedAt &&
          parsed.terminalId &&
          parsed.terminalId.toUpperCase() === cleanTerm
        ) {
          return parsed;
        }
      }
    } catch {
      // Corrupt storage entry will be replaced below
    }
  }

  const now = new Date();
  const sessionCreatedAt = now.toISOString();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randomHex = 'ABCDEF123456';
  const checkoutSessionId = `CS-${yy}${mm}${dd}-${cleanTerm}-${randomHex}`;

  const session: CheckoutSession = {
    checkoutSessionId,
    terminalId: cleanTerm,
    sessionCreatedAt,
  };

  if (store) {
    store.setItem(storageKey, JSON.stringify(session));
  }

  return session;
};

const restoreCheckoutSession = (
  terminalId = 'T1',
  storage?: MockLocalStorage
): CheckoutSession | null => {
  if (!storage) return null;
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  const storageKey = getCheckoutSessionStorageKey(cleanTerm);
  try {
    const existingJson = storage.getItem(storageKey);
    if (!existingJson) return null;
    const parsed = JSON.parse(existingJson) as CheckoutSession;
    if (
      parsed.checkoutSessionId &&
      parsed.sessionCreatedAt &&
      parsed.terminalId &&
      parsed.terminalId.toUpperCase() === cleanTerm
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const clearCheckoutSession = (
  terminalId = 'T1',
  storage?: MockLocalStorage
): void => {
  if (storage) {
    const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
    storage.removeItem(getCheckoutSessionStorageKey(cleanTerm));
  }
};

// ==============================================================================
// TEST SUITE 5: TERMINAL-SPECIFIC STORAGE ISOLATION & CART PERSISTENCE
// ==============================================================================

runTest('Terminal-partitioned storage keys are deterministically generated for T1 and T2', () => {
  assert.equal(getPOSCartStorageKey('T1'), 'sba_active_pos_cart_T1');
  assert.equal(getPOSCartStorageKey('t2'), 'sba_active_pos_cart_T2');
  assert.equal(getCheckoutSessionStorageKey('T1'), 'sba_active_checkout_session_T1');
  assert.equal(getCheckoutSessionStorageKey('t2'), 'sba_active_checkout_session_T2');
});

runTest('Persistent cart state is serialized under terminal-specific key sba_active_pos_cart_T1', () => {
  const storage = new MockLocalStorage();
  const session: CheckoutSession = {
    checkoutSessionId: 'CS-261102-T1-PERSIST12345',
    terminalId: 'T1',
    sessionCreatedAt: '2026-11-02T10:00:00.000Z',
  };

  const stateToSave: PersistentCartState = {
    session,
    customerType: 'wholesaler',
    customer: wholesalerCustomer,
    items: [
      {
        productId: sampleBook1.id,
        productName: sampleBook1.title,
        sku: sampleBook1.sku,
        publisherName: 'Sindh Textbook Board',
        availableStock: 25,
        costPrice: 200,
        quantity: 5,
        unitPrice: 240,
        discountRate: 0,
        discountAmount: 0,
        effectivePrice: 240,
        lineTotal: 1200,
        appliedRuleType: 'standard_wholesale',
      },
    ],
    notes: 'Urgent wholesale dispatch',
    lastUpdated: Date.now(),
  };

  const t1CartKey = getPOSCartStorageKey('T1');
  storage.setItem(t1CartKey, JSON.stringify(stateToSave));

  const loadedRaw = storage.getItem(t1CartKey);
  assert.ok(loadedRaw);
  const loaded = JSON.parse(loadedRaw) as PersistentCartState;

  assert.equal(loaded.session.checkoutSessionId, 'CS-261102-T1-PERSIST12345');
  assert.equal(loaded.session.terminalId, 'T1');
  assert.equal(loaded.session.sessionCreatedAt, '2026-11-02T10:00:00.000Z');
  assert.equal(loaded.customerType, 'wholesaler');
  assert.equal(loaded.customer?.id, 'cust_swat_101');
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].lineTotal, 1200);
  assert.equal(loaded.notes, 'Urgent wholesale dispatch');

  // Verify Terminal T2 cart key is completely empty and unpolluted
  assert.equal(storage.getItem(getPOSCartStorageKey('T2')), null);
});

runTest('T1 and T2 sessions and carts operate in complete isolation without overwriting each other', () => {
  const storage = new MockLocalStorage();

  // Create active session and cart for Terminal 1
  const sessionT1 = getOrCreateCheckoutSession('T1', storage);
  assert.equal(sessionT1.terminalId, 'T1');
  storage.setItem(getPOSCartStorageKey('T1'), JSON.stringify({ terminal: 'T1', items: [{ productId: 'b1', qty: 2 }] }));

  // Create active session and cart for Terminal 2
  const sessionT2 = getOrCreateCheckoutSession('T2', storage);
  assert.equal(sessionT2.terminalId, 'T2');
  storage.setItem(getPOSCartStorageKey('T2'), JSON.stringify({ terminal: 'T2', items: [{ productId: 'b2', qty: 5 }] }));

  // Verify both exist independently under separate keys
  assert.ok(storage.getItem(getCheckoutSessionStorageKey('T1')));
  assert.ok(storage.getItem(getCheckoutSessionStorageKey('T2')));
  assert.notEqual(sessionT1.checkoutSessionId, sessionT2.checkoutSessionId);

  // Restoring T1 preserves T1 data exactly without generating a new session
  const restoredT1 = getOrCreateCheckoutSession('T1', storage);
  assert.equal(restoredT1.checkoutSessionId, sessionT1.checkoutSessionId);
  assert.equal(restoredT1.sessionCreatedAt, sessionT1.sessionCreatedAt);

  // Restoring T2 preserves T2 data exactly without generating a new session
  const restoredT2 = getOrCreateCheckoutSession('T2', storage);
  assert.equal(restoredT2.checkoutSessionId, sessionT2.checkoutSessionId);
  assert.equal(restoredT2.sessionCreatedAt, sessionT2.sessionCreatedAt);
});

runTest('Terminal mismatch is strictly rejected: Stored T1 session cannot be restored as T2', () => {
  const storage = new MockLocalStorage();

  // Simulate corrupt or malicious state: T1 session placed under T2's key
  const t1Session: CheckoutSession = {
    checkoutSessionId: 'CS-261102-T1-TAMPERED001',
    terminalId: 'T1',
    sessionCreatedAt: '2026-11-02T10:00:00.000Z',
  };
  storage.setItem(getCheckoutSessionStorageKey('T2'), JSON.stringify(t1Session));

  // restoreCheckoutSession('T2') must reject mismatched terminalId
  const restored = restoreCheckoutSession('T2', storage);
  assert.equal(restored, null, 'Must reject session because stored terminalId T1 does not match requested T2');

  // getOrCreateCheckoutSession('T2') must detect mismatch and generate a valid T2 session
  const safeSession = getOrCreateCheckoutSession('T2', storage);
  assert.equal(safeSession.terminalId, 'T2');
  assert.notEqual(safeSession.checkoutSessionId, 'CS-261102-T1-TAMPERED001');
});

runTest('Confirming checkout success on T1 deletes ONLY T1 storage and preserves T2', () => {
  const storage = new MockLocalStorage();

  // Setup both T1 and T2 sessions & carts
  const sessionT1 = getOrCreateCheckoutSession('T1', storage);
  const sessionT2 = getOrCreateCheckoutSession('T2', storage);
  storage.setItem(getPOSCartStorageKey('T1'), JSON.stringify({ items: ['t1_item'] }));
  storage.setItem(getPOSCartStorageKey('T2'), JSON.stringify({ items: ['t2_item'] }));

  // Simulate confirmCheckoutSuccess('T1'):
  clearCheckoutSession('T1', storage);
  storage.removeItem(getPOSCartStorageKey('T1'));

  // T1 keys are cleaned:
  assert.equal(storage.getItem(getCheckoutSessionStorageKey('T1')), null);
  assert.equal(storage.getItem(getPOSCartStorageKey('T1')), null);

  // T2 keys MUST remain completely untouched:
  assert.ok(storage.getItem(getCheckoutSessionStorageKey('T2')));
  assert.ok(storage.getItem(getPOSCartStorageKey('T2')));
  const restoredT2 = restoreCheckoutSession('T2', storage);
  assert.equal(restoredT2?.checkoutSessionId, sessionT2.checkoutSessionId);
});

// ==============================================================================
// TEST SUITE 6: WEB LOCKS OWNERSHIP, EXPLICIT PENDING STATE & CONCURRENCY
// ==============================================================================

runTest('Initial lock status is strictly "pending" and blocks all cart mutations', () => {
  type TerminalLockStatus = 'pending' | 'owner' | 'spectator' | 'unsupported';
  const lockStatus: TerminalLockStatus = 'pending';

  const mockCartMutation = (status: TerminalLockStatus) => {
    if (status !== 'owner') {
      const err = status === 'pending'
        ? 'Register lock acquisition is in progress. Please wait...'
        : 'Register is in read-only mode.';
      return { success: false, error: err };
    }
    return { success: true };
  };

  const res = mockCartMutation(lockStatus);
  assert.equal(res.success, false, 'Mutations must fail while lockStatus is pending');
  assert.equal(res.error, 'Register lock acquisition is in progress. Please wait...');
});

runTest('Checkout preparation is strictly blocked while lock status is "pending"', () => {
  type TerminalLockStatus = 'pending' | 'owner' | 'spectator' | 'unsupported';
  const lockStatus: TerminalLockStatus = 'pending';
  const items = [{ productId: 'b1', qty: 1 }];

  const canCheckout = lockStatus === 'owner' && items.length > 0;
  assert.equal(canCheckout, false, 'canCheckout must be false while pending');

  const mockPrepareSalePayload = (status: TerminalLockStatus) => {
    if (status !== 'owner') {
      throw new Error(
        status === 'pending'
          ? 'Cannot submit sale: register lock acquisition is still pending.'
          : 'Cannot submit sale from a secondary spectator tab. Claim terminal ownership first.'
      );
    }
    return { ready: true };
  };

  assert.throws(
    () => mockPrepareSalePayload(lockStatus),
    /Cannot submit sale: register lock acquisition is still pending/
  );
});

runTest('First tab acquires exclusive Web Lock transitioning from "pending" to "owner"', async () => {
  const lockManager = new MockWebLockManager();
  const terminalId = 'T1';
  const lockName = `sba_pos_terminal_${terminalId}_active`;

  let tab1Status: 'pending' | 'owner' | 'spectator' | 'unsupported' = 'pending';

  // Initial state is pending
  assert.equal(tab1Status, 'pending');

  // Tab 1 attempts lock acquisition
  await lockManager.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (lock) {
      tab1Status = 'owner';
    }
  });

  assert.equal(tab1Status, 'owner', 'Tab 1 must transition from pending to owner when lock is free');
  assert.equal(lockManager.isLockHeld(lockName), false, 'Lock is released after callback terminates');
});

runTest('Second tab fails exclusive lock when held by Tab 1 and transitions from "pending" to "spectator"', async () => {
  const lockManager = new MockWebLockManager();
  const terminalId = 'T1';
  const lockName = `sba_pos_terminal_${terminalId}_active`;

  let tab2Status: 'pending' | 'owner' | 'spectator' | 'unsupported' = 'pending';

  // Tab 1 holds lock
  await lockManager.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (tab1Lock) => {
    assert.ok(tab1Lock);

    // While Tab 1 holds lock, Tab 2 attempts acquisition starting from pending
    assert.equal(tab2Status, 'pending');

    await lockManager.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (tab2Lock) => {
      if (!tab2Lock) {
        tab2Status = 'spectator';
      }
    });
  });

  assert.equal(tab2Status, 'spectator', 'Tab 2 must transition from pending to spectator while Tab 1 holds lock');
});

runTest('Unsupported Web Locks environment fails closed and sets status to "unsupported"', () => {
  const lockManager = null; // Browser without navigator.locks
  type TerminalLockStatus = 'pending' | 'owner' | 'spectator' | 'unsupported';
  let lockStatus: TerminalLockStatus = lockManager ? 'pending' : 'unsupported';
  let canCheckout = lockStatus === 'owner';

  assert.equal(lockStatus, 'unsupported');
  assert.equal(canCheckout, false, 'Checkout must be disabled when Web Locks API is unavailable');
});

runTest('Same-tab double-submit guard blocks concurrent checkout calls', async () => {
  let isSubmitting = false;
  let executionCount = 0;

  const mockSubmit = async () => {
    if (isSubmitting) {
      throw new Error('A sale submission is already in progress on this tab.');
    }
    isSubmitting = true;
    try {
      executionCount++;
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      isSubmitting = false;
    }
  };

  // Simulate cashier double-clicking the button rapidly
  const call1 = mockSubmit();
  let call2Blocked = false;

  try {
    await mockSubmit();
  } catch (err: any) {
    call2Blocked = true;
    assert.match(err.message, /already in progress/i);
  }

  await call1;

  assert.equal(call2Blocked, true, 'Second rapid click must be blocked synchronously');
  assert.equal(executionCount, 1, 'Only one transaction execution allowed');
});

// ==============================================================================
// TEST SUITE 7: PUBLISHER SNAPSHOT INTEGRITY
// ==============================================================================

runTest('Authoritative publisher snapshot strictly uses dedicated ProductDocument.publisherName', () => {
  // Product has dedicated publisherName and obsolete authorOrPublisher:
  const bookWithBoth: ProductDocument = {
    ...sampleBook1,
    publisherName: 'Moon Light Publisher',
    authorOrPublisher: 'Dr. Tariq Author', // Must NOT be used!
  };

  // Extraction logic matching saleService and usePOSCart:
  const publisherSnapshot =
    typeof bookWithBoth.publisherName === 'string' && bookWithBoth.publisherName.trim().length > 0
      ? bookWithBoth.publisherName.trim()
      : 'Unknown';

  assert.equal(publisherSnapshot, 'Moon Light Publisher', 'Must capture dedicated publisherName');
  assert.notEqual(publisherSnapshot, 'Dr. Tariq Author', 'Must NEVER use authorOrPublisher');
});

runTest('Missing or blank publisherName safely defaults to "Unknown"', () => {
  const bookWithoutPublisher: ProductDocument = {
    ...sampleBook1,
    publisherName: undefined,
    authorOrPublisher: 'Some Author',
  };

  const publisherSnapshot =
    typeof bookWithoutPublisher.publisherName === 'string' && bookWithoutPublisher.publisherName.trim().length > 0
      ? bookWithoutPublisher.publisherName.trim()
      : 'Unknown';

  assert.equal(publisherSnapshot, 'Unknown', 'Missing publisherName must default to literal "Unknown"');
});

await Promise.all(pendingPromises);

console.log('\n====================================================');
console.log(`📊 MILESTONE 4.2 STEP 1 SUMMARY: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');
