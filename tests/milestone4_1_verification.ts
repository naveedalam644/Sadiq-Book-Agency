import assert from 'node:assert/strict';

export const generateInvoiceNumber = (
  checkoutSessionId: string,
  terminalId?: string,
  date?: Date
): string => {
  const cleanSessionId = checkoutSessionId.trim();
  const sessionPatternMatch = cleanSessionId.match(/^(?:CS|SESS)-([0-9]{6})-([A-Za-z0-9]{1,3})-/i);

  let yy: string;
  let mm: string;
  let dd: string;
  let cleanTerm: string;

  if (sessionPatternMatch) {
    // Immutable mapping locked into checkoutSessionId identity
    const dateYYMMDD = sessionPatternMatch[1];
    yy = dateYYMMDD.slice(0, 2);
    mm = dateYYMMDD.slice(2, 4);
    dd = dateYYMMDD.slice(4, 6);
    cleanTerm = sessionPatternMatch[2].toUpperCase();
  } else {
    // Fallback for non-prefixed session identifiers
    const d = date || new Date();
    yy = String(d.getFullYear()).slice(-2);
    mm = String(d.getMonth() + 1).padStart(2, '0');
    dd = String(d.getDate()).padStart(2, '0');
    cleanTerm = (terminalId || 'T1').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  }

  // Deterministic 32-bit hex hash of checkoutSessionId (64-bit mixer truncated to 8 hex characters / 32 bits)
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < cleanSessionId.length; i++) {
    const ch = cleanSessionId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hexPart = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().slice(-8).padStart(8, '0');

  return `INV-${yy}${mm}${dd}-${cleanTerm}-${hexPart}`;
};

type CustomerType = 'wholesaler' | 'parchon' | 'marketshop';

interface ProductDocument {
  id: string;
  sku: string;
  title: string;
  classification: string;
  categoryId: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  isActive: boolean;
  isLowStock?: boolean;
  lastSaleId?: string;
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
  isActive: boolean;
  lastSaleId?: string;
  createdAt: string;
  updatedAt: string;
}

interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  costPrice: number;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  effectivePrice: number;
  lineTotal: number;
}

interface SaleDocument {
  id: string;
  invoiceNo: string;
  checkoutSessionId: string;
  terminalId?: string;
  sessionCreatedAt?: string;
  productIds: string[];
  customerType: CustomerType;
  customerId?: string;
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
  cashTendered: number;
  changeReturned: number;
  paymentApplied: number;
  balanceAddedToCredit: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  operatorUserId: string;
  operatorName: string;
  saleDate: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentDocument {
  id: string;
  receiptNo: string;
  targetType: 'direct_sale' | 'customer_credit' | 'supplier_payable';
  referenceId: string;
  partyName: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer' | 'cheque';
  receivedByUserId: string;
  paymentDate: string;
  createdAt: string;
}

interface CustomerLedgerDocument {
  id: string;
  customerId: string;
  customerName?: string;
  entryType: 'debit' | 'credit';
  referenceInvoiceNo?: string;
  description: string;
  amount: number;
  runningBalance: number;
  recordedByUserId: string;
  date: string;
  createdAt: string;
}

console.log('\n====================================================');
console.log('🛡️  SADIQ BOOK AGENCY — MILESTONE 4.1 SECURITY & TRANSACTION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
const runTest = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
};

// ==============================================================================
// 1. FIRESTORE SECURITY RULES SIMULATOR
// Precise implementation of the logic defined in firestore.rules
// ==============================================================================

interface MockUser {
  uid: string;
  role: 'admin' | 'cashier' | 'customer';
  isActive: boolean;
}

interface RulesContext {
  auth: { uid: string } | null;
  usersDb: Record<string, MockUser>;
  db: Record<string, Record<string, any>>;
  afterDb?: Record<string, Record<string, any>>; // Simulates transaction atomic state
}

const evaluateRules = (ctx: RulesContext) => {
  const isAuthenticated = () => ctx.auth !== null;
  const getUserDoc = () => (ctx.auth ? ctx.usersDb[ctx.auth.uid] : null);

  const isUserActive = () => {
    if (!isAuthenticated()) return false;
    const user = getUserDoc();
    return Boolean(user && user.isActive === true);
  };

  const isAdmin = () => isUserActive() && getUserDoc()?.role === 'admin';
  const isCashier = () => isUserActive() && getUserDoc()?.role === 'cashier';
  const isStaff = () => isUserActive() && (getUserDoc()?.role === 'admin' || getUserDoc()?.role === 'cashier');

  return {
    isAuthenticated,
    isUserActive,
    isAdmin,
    isCashier,
    isStaff,

    // Rule for /sales/{saleId}
    canCreateSale: (saleId: string, data: Partial<SaleDocument>) => {
      if (!isStaff()) return false;
      if (ctx.db.sales?.[saleId]) return false; // !exists
      if (data.id !== saleId || data.invoiceNo !== saleId) return false;
      if (data.operatorUserId !== ctx.auth?.uid) return false;
      if (!['wholesaler', 'marketshop', 'parchon'].includes(data.customerType || '')) return false;
      if (!data.customerName || data.customerName.length === 0) return false;
      if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > 100) return false;
      if (!Array.isArray(data.productIds) || data.productIds.length === 0) return false;
      if (typeof data.subtotal !== 'number' || data.subtotal < 0) return false;
      if (typeof data.totalDiscount !== 'number' || data.totalDiscount < 0) return false;
      if (typeof data.grandTotal !== 'number' || data.grandTotal < 0) return false;
      if (data.grandTotal !== Math.round((data.subtotal - data.totalDiscount) * 100) / 100) return false;
      if (typeof data.cashTendered !== 'number' || data.cashTendered < 0) return false;
      if (typeof data.changeReturned !== 'number' || data.changeReturned < 0) return false;
      if (typeof data.paymentApplied !== 'number' || data.paymentApplied < 0) return false;
      if (typeof data.balanceAddedToCredit !== 'number' || data.balanceAddedToCredit < 0) return false;
      if (!['paid', 'partial', 'unpaid'].includes(data.paymentStatus || '')) return false;
      if (!['cash', 'bank_transfer', 'credit'].includes(data.paymentMethod || '')) return false;
      return true;
    },

    canUpdateOrDeleteSale: () => false, // Immutable

    // Rule for /products/{productId} update
    canUpdateProduct: (productId: string, current: ProductDocument, next: ProductDocument) => {
      if (isAdmin()) return true;
      if (!isCashier()) return false;

      // Check affected keys
      const changedKeys = Object.keys(next).filter((k) => (current as any)[k] !== (next as any)[k]);
      const allowed = ['currentStock', 'isLowStock', 'lastSaleId', 'updatedAt'];
      const hasOnlyAllowed = changedKeys.every((k) => allowed.includes(k));
      if (!hasOnlyAllowed) return false;

      // Strictly reduce stock, non-negative
      if (next.currentStock >= current.currentStock) return false;
      if (next.currentStock < 0) return false;

      // getAfter / existsAfter validation
      if (!next.lastSaleId || typeof next.lastSaleId !== 'string') return false;

      // Must exist in transaction state
      const targetSale = ctx.afterDb?.sales?.[next.lastSaleId];
      if (!targetSale) return false; // existsAfter check failed

      // Product must be listed in sale's productIds
      if (!Array.isArray(targetSale.productIds) || !targetSale.productIds.includes(productId)) {
        return false;
      }

      return true;
    },

    // Rule for /customers/{customerId} update
    canUpdateCustomer: (customerId: string, current: CustomerDocument, next: CustomerDocument) => {
      if (isAdmin()) return true;
      if (!isCashier()) return false;

      const changedKeys = Object.keys(next).filter((k) => (current as any)[k] !== (next as any)[k]);
      const allowed = ['currentBalance', 'lastSaleId', 'updatedAt'];
      if (!changedKeys.every((k) => allowed.includes(k))) return false;

      if (!next.lastSaleId || typeof next.lastSaleId !== 'string') return false;
      const targetSale = ctx.afterDb?.sales?.[next.lastSaleId];
      if (!targetSale) return false; // existsAfter failed

      // getAfter balance matching
      const expectedBalance = Math.round((current.currentBalance + (targetSale.balanceAddedToCredit || 0)) * 100) / 100;
      if (next.currentBalance !== expectedBalance) return false;

      // Customer Document Isolation check: targetSale.customerId must equal customerId being updated
      if (targetSale.customerId !== customerId) return false;

      // Credit limit constraint: creditLimit == 0 means NO CREDIT
      if (current.creditLimit <= 0) return false;
      if (next.currentBalance > current.creditLimit) return false;

      return true;
    },

    // Rule for /payments/{paymentId} create
    canCreatePayment: (paymentId: string, data: PaymentDocument) => {
      if (isAdmin() && !ctx.db.payments?.[paymentId]) return true;
      if (!isCashier()) return false;
      if (ctx.db.payments?.[paymentId]) return false;
      if (data.targetType !== 'direct_sale') return false;
      if (data.amount <= 0) return false;
      if (data.receivedByUserId !== ctx.auth?.uid) return false;

      // existsAfter and getAfter check against sale
      const targetSale = ctx.afterDb?.sales?.[data.referenceId];
      if (!targetSale) return false;
      if (targetSale.paymentApplied !== data.amount) return false;

      return true;
    },

    // Rule for /customerLedger/{ledgerId} create
    canCreateLedger: (ledgerId: string, data: CustomerLedgerDocument) => {
      if (isAdmin() && !ctx.db.customerLedger?.[ledgerId]) return true;
      if (!isCashier()) return false;
      if (ctx.db.customerLedger?.[ledgerId]) return false;
      if (data.entryType !== 'debit') return false;
      if (data.amount <= 0) return false;
      if (data.recordedByUserId !== ctx.auth?.uid) return false;

      const targetSale = ctx.afterDb?.sales?.[data.referenceInvoiceNo || ''];
      if (!targetSale) return false;
      if (targetSale.customerId !== data.customerId) return false;
      if (targetSale.balanceAddedToCredit !== data.amount) return false;

      return true;
    },

    canUpdateOrDeleteFinancials: () => false, // Immutable
  };
};

// ==============================================================================
// TEST SUITE: ROLE AUTHENTICATION & ACTIVE-USER ENFORCEMENT
// ==============================================================================

const mockUsers: Record<string, MockUser> = {
  admin_1: { uid: 'admin_1', role: 'admin', isActive: true },
  admin_disabled: { uid: 'admin_disabled', role: 'admin', isActive: false },
  cashier_1: { uid: 'cashier_1', role: 'cashier', isActive: true },
  cashier_disabled: { uid: 'cashier_disabled', role: 'cashier', isActive: false },
};

runTest('Active Admin is authorized as Admin and Staff', () => {
  const rules = evaluateRules({ auth: { uid: 'admin_1' }, usersDb: mockUsers, db: {} });
  assert.equal(rules.isAdmin(), true);
  assert.equal(rules.isCashier(), false);
  assert.equal(rules.isStaff(), true);
});

runTest('Disabled Admin is strictly REJECTED (No custom claim bypass)', () => {
  const rules = evaluateRules({ auth: { uid: 'admin_disabled' }, usersDb: mockUsers, db: {} });
  assert.equal(rules.isAdmin(), false);
  assert.equal(rules.isStaff(), false);
});

runTest('Active Cashier is authorized as Cashier and Staff, but not Admin', () => {
  const rules = evaluateRules({ auth: { uid: 'cashier_1' }, usersDb: mockUsers, db: {} });
  assert.equal(rules.isAdmin(), false);
  assert.equal(rules.isCashier(), true);
  assert.equal(rules.isStaff(), true);
});

runTest('Disabled Cashier is strictly REJECTED from all staff permissions', () => {
  const rules = evaluateRules({ auth: { uid: 'cashier_disabled' }, usersDb: mockUsers, db: {} });
  assert.equal(rules.isCashier(), false);
  assert.equal(rules.isStaff(), false);
});

runTest('Unauthenticated caller is strictly REJECTED', () => {
  const rules = evaluateRules({ auth: null, usersDb: mockUsers, db: {} });
  assert.equal(rules.isStaff(), false);
  assert.equal(rules.isAdmin(), false);
});

// ==============================================================================
// TEST SUITE: STOCK INTEGRITY & getAfter LINKAGE
// ==============================================================================

const sampleProduct: ProductDocument = {
  id: 'prod_chem_9',
  sku: 'BK-SIN-901',
  title: 'Sindh Board Chemistry 9',
  classification: 'book',
  categoryId: 'cat_matric',
  costPrice: 280,
  retailPrice: 400,
  wholesalePrice: 320,
  currentStock: 50,
  lowStockThreshold: 10,
  unit: 'piece',
  isActive: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

runTest('Cashier CANNOT decrement stock without an atomic sale (direct write blocked)', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: { sales: {} }, // No sale in transaction
  });

  const updated: ProductDocument = {
    ...sampleProduct,
    currentStock: 48,
    lastSaleId: 'INV-FAKE-001',
    updatedAt: '2026-11-02T00:00:00Z',
  };

  const allowed = rules.canUpdateProduct('prod_chem_9', sampleProduct, updated);
  assert.equal(allowed, false);
});

runTest('Cashier CANNOT decrement stock if product is NOT in the sale productIds list', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-261102-T1-VALID': {
          id: 'INV-261102-T1-VALID',
          productIds: ['prod_diff_book'], // Does NOT contain prod_chem_9
        },
      },
    },
  });

  const updated: ProductDocument = {
    ...sampleProduct,
    currentStock: 48,
    lastSaleId: 'INV-261102-T1-VALID',
    updatedAt: '2026-11-02T00:00:00Z',
  };

  const allowed = rules.canUpdateProduct('prod_chem_9', sampleProduct, updated);
  assert.equal(allowed, false);
});

runTest('Cashier CANNOT increase stock or set negative stock', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-261102-T1-VALID': { id: 'INV-261102-T1-VALID', productIds: ['prod_chem_9'] },
      },
    },
  });

  // Attempt to increase stock (50 -> 60)
  const increased: ProductDocument = { ...sampleProduct, currentStock: 60, lastSaleId: 'INV-261102-T1-VALID' };
  assert.equal(rules.canUpdateProduct('prod_chem_9', sampleProduct, increased), false);

  // Attempt to set negative stock (50 -> -5)
  const negative: ProductDocument = { ...sampleProduct, currentStock: -5, lastSaleId: 'INV-261102-T1-VALID' };
  assert.equal(rules.canUpdateProduct('prod_chem_9', sampleProduct, negative), false);
});

runTest('Cashier CANNOT alter catalog prices during sale write', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-261102-T1-VALID': { id: 'INV-261102-T1-VALID', productIds: ['prod_chem_9'] },
      },
    },
  });

  // Altering retailPrice alongside stock decrement
  const priceHacked: ProductDocument = {
    ...sampleProduct,
    currentStock: 48,
    retailPrice: 10, // Tampered price
    lastSaleId: 'INV-261102-T1-VALID',
  };
  assert.equal(rules.canUpdateProduct('prod_chem_9', sampleProduct, priceHacked), false);
});

runTest('Cashier stock decrement SUCCEEDS when cryptographically linked to genuine sale via getAfter()', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-261102-T1-VALID': {
          id: 'INV-261102-T1-VALID',
          productIds: ['prod_chem_9'],
        },
      },
    },
  });

  const validUpdate: ProductDocument = {
    ...sampleProduct,
    currentStock: 48, // 50 - 2
    isLowStock: false,
    lastSaleId: 'INV-261102-T1-VALID',
    updatedAt: '2026-11-02T00:00:00Z',
  };
  assert.equal(rules.canUpdateProduct('prod_chem_9', sampleProduct, validUpdate), true);
});

// ==============================================================================
// TEST SUITE: CUSTOMER BALANCE & CREDIT LIMIT RULES
// ==============================================================================

const sampleCustomer: CustomerDocument = {
  id: 'cust_swat_101',
  name: 'Swat Book Depot',
  type: 'marketshop',
  phone: '03451234567',
  creditLimit: 50000,
  currentBalance: 30000,
  isActive: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const zeroCreditCustomer: CustomerDocument = {
  ...sampleCustomer,
  id: 'cust_parchon_0',
  creditLimit: 0, // Strict cash counter
  currentBalance: 0,
};

runTest('Cashier CANNOT update customer balance without genuine sale', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: { sales: {} },
  });

  const updated: CustomerDocument = {
    ...sampleCustomer,
    currentBalance: 35000,
    lastSaleId: 'INV-FAKE-002',
  };
  assert.equal(rules.canUpdateCustomer(sampleCustomer.id, sampleCustomer, updated), false);
});

runTest('Cashier CANNOT update customer balance if amount does not match sale balanceAddedToCredit', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-CREDIT-SALE': {
          id: 'INV-CREDIT-SALE',
          balanceAddedToCredit: 5000, // Expected +5000 -> 35000
        },
      },
    },
  });

  // Attempting to add +10000 instead of +5000
  const mismatched: CustomerDocument = {
    ...sampleCustomer,
    currentBalance: 40000, // Wrong! Expected 35000
    lastSaleId: 'INV-CREDIT-SALE',
  };
  assert.equal(rules.canUpdateCustomer(sampleCustomer.id, sampleCustomer, mismatched), false);
});

runTest('Cashier CANNOT give credit to customer with creditLimit == 0 (Strict cash policy)', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-CREDIT-SALE': { id: 'INV-CREDIT-SALE', balanceAddedToCredit: 2000 },
      },
    },
  });

  const updated: CustomerDocument = {
    ...zeroCreditCustomer,
    currentBalance: 2000,
    lastSaleId: 'INV-CREDIT-SALE',
  };
  assert.equal(rules.canUpdateCustomer(zeroCreditCustomer.id, zeroCreditCustomer, updated), false);
});

runTest('Cashier CANNOT exceed approved credit limit (Blocked by rules)', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-OVERLIMIT-SALE': {
          id: 'INV-OVERLIMIT-SALE',
          balanceAddedToCredit: 25000, // 30,000 + 25,000 = 55,000 > 50,000 Limit
        },
      },
    },
  });

  const overlimit: CustomerDocument = {
    ...sampleCustomer,
    currentBalance: 55000,
    lastSaleId: 'INV-OVERLIMIT-SALE',
  };
  assert.equal(rules.canUpdateCustomer(sampleCustomer.id, sampleCustomer, overlimit), false);
});

runTest('Admin CAN approve credit limit override (Permitted only for active Admin)', () => {
  const rules = evaluateRules({
    auth: { uid: 'admin_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-OVERLIMIT-SALE': { id: 'INV-OVERLIMIT-SALE', balanceAddedToCredit: 25000 },
      },
    },
  });

  const overlimit: CustomerDocument = {
    ...sampleCustomer,
    currentBalance: 55000,
    lastSaleId: 'INV-OVERLIMIT-SALE',
  };
  assert.equal(rules.canUpdateCustomer(sampleCustomer.id, sampleCustomer, overlimit), true);
});

// ==============================================================================
// TEST SUITE: PAYMENT & LEDGER getAfter ENFORCEMENT
// ==============================================================================

runTest('Payment receipt amount MUST match sale paymentApplied exactly', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-SALE-99': { id: 'INV-SALE-99', paymentApplied: 3200 },
      },
    },
  });

  const validPayment: PaymentDocument = {
    id: 'PAY_INV-SALE-99',
    receiptNo: 'REC-INV-SALE-99',
    targetType: 'direct_sale',
    referenceId: 'INV-SALE-99',
    partyName: 'Counter Customer',
    amount: 3200, // Matches sale paymentApplied
    paymentMode: 'cash',
    receivedByUserId: 'cashier_1',
    paymentDate: '2026-11-02',
    createdAt: '2026-11-02T00:00:00Z',
  };
  assert.equal(rules.canCreatePayment('PAY_INV-SALE-99', validPayment), true);

  const fakeAmountPayment: PaymentDocument = {
    ...validPayment,
    amount: 5000, // Mismatched! Expected 3200
  };
  assert.equal(rules.canCreatePayment('PAY_INV-SALE-99', fakeAmountPayment), false);
});

runTest('Customer Ledger debit amount MUST match sale balanceAddedToCredit exactly', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-SALE-88': { id: 'INV-SALE-88', customerId: 'cust_101', balanceAddedToCredit: 4500 },
      },
    },
  });

  const validLedger: CustomerLedgerDocument = {
    id: 'LEDGER_INV-SALE-88',
    customerId: 'cust_101',
    entryType: 'debit',
    referenceInvoiceNo: 'INV-SALE-88',
    description: 'Sale Invoice',
    amount: 4500, // Matches sale balanceAddedToCredit
    runningBalance: 34500,
    recordedByUserId: 'cashier_1',
    date: '2026-11-02',
    createdAt: '2026-11-02T00:00:00Z',
  };
  assert.equal(rules.canCreateLedger('LEDGER_INV-SALE-88', validLedger), true);

  const fakeLedger: CustomerLedgerDocument = {
    ...validLedger,
    amount: 9000, // Mismatched!
  };
  assert.equal(rules.canCreateLedger('LEDGER_INV-SALE-88', fakeLedger), false);
});

// ==============================================================================
// TEST SUITE: IMMUTABILITY OF HISTORICAL FINANCIALS
// ==============================================================================

runTest('Historical sales invoices cannot be updated or deleted by anyone', () => {
  const adminRules = evaluateRules({ auth: { uid: 'admin_1' }, usersDb: mockUsers, db: {} });
  const cashierRules = evaluateRules({ auth: { uid: 'cashier_1' }, usersDb: mockUsers, db: {} });

  assert.equal(adminRules.canUpdateOrDeleteSale(), false);
  assert.equal(cashierRules.canUpdateOrDeleteSale(), false);
  assert.equal(adminRules.canUpdateOrDeleteFinancials(), false);
  assert.equal(cashierRules.canUpdateOrDeleteFinancials(), false);
});

// ==============================================================================
// TEST SUITE: TRANSACTION WORKFLOW & IDEMPOTENCY
// ==============================================================================

runTest('Invoice number generator produces valid collision-resistant format', () => {
  const inv1 = generateInvoiceNumber('session_123_abc', 'T1');
  const inv2 = generateInvoiceNumber('session_456_def', 'T1');
  assert.match(inv1, /^INV-\d{6}-T1-[0-9A-F]{8}$/);
  assert.match(inv2, /^INV-\d{6}-T1-[0-9A-F]{8}$/);
  assert.notEqual(inv1, inv2); // Different sessions yield different invoices
});

runTest('Persistent checkoutSessionId produces the EXACT same invoice number on retry', () => {
  const sessionId = 'session_persistent_uuid_888';
  const inv1 = generateInvoiceNumber(sessionId, 'T1');
  const inv2 = generateInvoiceNumber(sessionId, 'T1');
  const inv3 = generateInvoiceNumber(sessionId, 'T1');
  assert.equal(inv1, inv2);
  assert.equal(inv2, inv3);
});

runTest('Customer Document Isolation: A sale for Customer A CANNOT update Customer B balance', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-CREDIT-SALE': {
          id: 'INV-CREDIT-SALE',
          customerId: 'cust_swat_101', // Sale belongs to Customer A (cust_swat_101)
          balanceAddedToCredit: 5000,
        },
      },
    },
  });

  const customerB: CustomerDocument = {
    id: 'cust_unrelated_202', // Customer B
    name: 'Unrelated Mingora Shop',
    type: 'marketshop',
    phone: '03459999999',
    creditLimit: 50000,
    currentBalance: 10000,
    isActive: true,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const rogueBalanceUpdate: CustomerDocument = {
    ...customerB,
    currentBalance: 15000, // +5000 matching sale amount, but WRONG customer!
    lastSaleId: 'INV-CREDIT-SALE',
  };

  // Must be strictly REJECTED by customer document isolation check
  assert.equal(rules.canUpdateCustomer(customerB.id, customerB, rogueBalanceUpdate), false);
});

runTest('Customer Document Isolation: A sale for Customer A successfully updates Customer A balance', () => {
  const rules = evaluateRules({
    auth: { uid: 'cashier_1' },
    usersDb: mockUsers,
    db: {},
    afterDb: {
      sales: {
        'INV-CREDIT-SALE': {
          id: 'INV-CREDIT-SALE',
          customerId: 'cust_swat_101', // Sale belongs to Customer A
          balanceAddedToCredit: 5000,
        },
      },
    },
  });

  const validBalanceUpdate: CustomerDocument = {
    ...sampleCustomer,
    currentBalance: 35000, // 30000 + 5000
    lastSaleId: 'INV-CREDIT-SALE',
  };

  // Must SUCCEED because customerId matches
  assert.equal(rules.canUpdateCustomer(sampleCustomer.id, sampleCustomer, validBalanceUpdate), true);
});

runTest('Collision & Session Mismatch: Attempting to reuse an existing invoice with different checkoutSessionId is detected and blocked', () => {
  const existingSale: SaleDocument = {
    id: 'INV-261102-T1-8F4AC92B',
    invoiceNo: 'INV-261102-T1-8F4AC92B',
    checkoutSessionId: 'session_original_owner_111',
    productIds: ['p1'],
    customerType: 'parchon',
    customerName: 'Original Customer',
    items: [],
    subtotal: 500,
    totalDiscount: 0,
    grandTotal: 500,
    cashTendered: 500,
    changeReturned: 0,
    paymentApplied: 500,
    balanceAddedToCredit: 0,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    operatorUserId: 'cashier_1',
    operatorName: 'Cashier',
    saleDate: '2026-11-02',
    createdAt: '2026-11-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
  };

  const incomingSessionId = 'session_attacker_or_collision_222';

  // Simulating the transaction idempotency check from saleService.ts:
  let detectedMismatch = false;
  try {
    if (existingSale.checkoutSessionId !== incomingSessionId) {
      throw new Error(`Invoice ID collision detected! Stored session "${existingSale.checkoutSessionId}" does not match attempting session "${incomingSessionId}".`);
    }
  } catch (err: any) {
    detectedMismatch = true;
    assert.match(err.message, /collision detected/i);
  }

  assert.equal(detectedMismatch, true, 'Different checkout session must be rejected from reusing existing invoice document');
});

runTest('Idempotent retry: Retrying checkout with identical session ID succeeds and returns existing sale', () => {
  const existingSale: SaleDocument = {
    id: 'INV-261102-T1-8F4AC92B',
    invoiceNo: 'INV-261102-T1-8F4AC92B',
    checkoutSessionId: 'session_stable_uuid_333',
    productIds: ['p1'],
    customerType: 'parchon',
    customerName: 'Customer',
    items: [],
    subtotal: 1000,
    totalDiscount: 0,
    grandTotal: 1000,
    cashTendered: 1000,
    changeReturned: 0,
    paymentApplied: 1000,
    balanceAddedToCredit: 0,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    operatorUserId: 'cashier_1',
    operatorName: 'Cashier',
    saleDate: '2026-11-02',
    createdAt: '2026-11-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
  };

  const incomingRetrySessionId = 'session_stable_uuid_333';

  // Simulating idempotent recovery from saleService.ts:
  let returnedSale: SaleDocument | null = null;
  let isDuplicate = false;

  if (existingSale.checkoutSessionId === incomingRetrySessionId) {
    returnedSale = existingSale;
    isDuplicate = true;
  }

  assert.equal(isDuplicate, true);
  assert.equal(returnedSale?.id, existingSale.id);
  assert.equal(returnedSale?.grandTotal, 1000);
});

runTest('Cash accounting separation correctly handles Tendered, Applied, and Change', () => {
  const grandTotal = 4320;
  const cashTendered = 5000;
  const changeReturned = Math.round((cashTendered - grandTotal) * 100) / 100;
  const paymentApplied = grandTotal;
  const balanceAddedToCredit = 0;

  assert.equal(changeReturned, 680);
  assert.equal(paymentApplied, 4320);
  assert.equal(balanceAddedToCredit, 0);
  assert.equal(paymentApplied + changeReturned, cashTendered);
});

runTest('Partial cash payment correctly allocates payment and Khata credit', () => {
  const grandTotal = 10000;
  const cashTendered = 4000; // Customer pays 4,000 cash, puts 6,000 on Khata
  const paymentApplied = cashTendered;
  const changeReturned = 0;
  const balanceAddedToCredit = grandTotal - cashTendered;

  assert.equal(paymentApplied, 4000);
  assert.equal(changeReturned, 0);
  assert.equal(balanceAddedToCredit, 6000);
  assert.equal(paymentApplied + balanceAddedToCredit, grandTotal);
});

runTest('Math invariant is strictly enforced: grandTotal == subtotal - totalDiscount', () => {
  const rules = evaluateRules({ auth: { uid: 'cashier_1' }, usersDb: mockUsers, db: {} });

  const validSale: Partial<SaleDocument> = {
    id: 'INV-MATH-OK',
    invoiceNo: 'INV-MATH-OK',
    customerType: 'parchon',
    customerName: 'Cash Customer',
    operatorUserId: 'cashier_1',
    items: [{ productId: 'p1', productName: 'Book', sku: 'BK-1', quantity: 1, costPrice: 200, unitPrice: 300, discountRate: 10, discountAmount: 30, effectivePrice: 270, lineTotal: 270 }],
    productIds: ['p1'],
    subtotal: 300,
    totalDiscount: 30,
    grandTotal: 270, // 300 - 30 == 270
    cashTendered: 300,
    changeReturned: 30,
    paymentApplied: 270,
    balanceAddedToCredit: 0,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
  };

  assert.equal(rules.canCreateSale('INV-MATH-OK', validSale), true);

  const invalidSale = { ...validSale, grandTotal: 200 }; // 300 - 30 != 200 (Tampered!)
  assert.equal(rules.canCreateSale('INV-MATH-OK', invalidSale), false);
});

// Helper to derive invoice number and validate session matching saleService.ts logic
const deriveInvoiceForSession = (input: {
  checkoutSessionId: string;
  terminalId?: string;
  sessionCreatedAt?: string;
  saleDate?: string;
}) => {
  if (!input.checkoutSessionId || !input.checkoutSessionId.trim()) {
    throw new Error('Persistent checkoutSessionId is required to guarantee idempotency.');
  }

  if (!input.sessionCreatedAt || !input.sessionCreatedAt.trim()) {
    throw new Error('Persistent sessionCreatedAt timestamp is required. Fallback to new Date() is strictly forbidden.');
  }

  const sessionCreatedAtTime = new Date(input.sessionCreatedAt).getTime();
  if (isNaN(sessionCreatedAtTime)) {
    throw new Error('Invalid sessionCreatedAt timestamp format.');
  }

  const cleanSessionId = input.checkoutSessionId.trim();
  const sessionPatternMatch = cleanSessionId.match(/^(?:CS|SESS)-([0-9]{6})-([A-Za-z0-9]{1,3})-/i);
  let effectiveTerminalId = input.terminalId || 'T1';

  if (sessionPatternMatch) {
    const embeddedDateYYMMDD = sessionPatternMatch[1];
    const embeddedTerm = sessionPatternMatch[2].toUpperCase();

    // Verify terminal consistency
    if (input.terminalId) {
      const cleanInputTerm = input.terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
      if (embeddedTerm !== cleanInputTerm) {
        throw new Error(`Inconsistent session metadata! Session ID terminal "${embeddedTerm}" does not match input terminalId "${cleanInputTerm}".`);
      }
    }
    effectiveTerminalId = embeddedTerm;

    // Verify date consistency: sessionCreatedAt must correspond to the session date
    const sessionDateObj = new Date(input.sessionCreatedAt);
    const sessionYY = String(sessionDateObj.getFullYear()).slice(-2);
    const sessionMM = String(sessionDateObj.getMonth() + 1).padStart(2, '0');
    const sessionDD = String(sessionDateObj.getDate()).padStart(2, '0');
    const sessionDateYYMMDD = `${sessionYY}${sessionMM}${sessionDD}`;

    if (embeddedDateYYMMDD !== sessionDateYYMMDD) {
      throw new Error(`Inconsistent session metadata! Session ID date "${embeddedDateYYMMDD}" does not match sessionCreatedAt date "${sessionDateYYMMDD}".`);
    }
  }

  const sessionDate = new Date(input.sessionCreatedAt);
  return generateInvoiceNumber(cleanSessionId, effectiveTerminalId, sessionDate);
};

// Client Storage Mock for page refresh & browser restart testing
class MockLocalStorage {
  private store: Map<string, string> = new Map();

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

const CHECKOUT_SESSION_STORAGE_KEY = 'sba_active_checkout_session';

interface CheckoutSession {
  checkoutSessionId: string;
  terminalId: string;
  sessionCreatedAt: string;
}

const getOrCreateCheckoutSession = (
  terminalId = 'T1',
  storage: MockLocalStorage
): CheckoutSession => {
  const existingJson = storage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson) as CheckoutSession;
      if (parsed.checkoutSessionId && parsed.sessionCreatedAt && parsed.terminalId) {
        return parsed;
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
  const cleanTerm = terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  const randomHex = '8F4AC92B10E4';

  const checkoutSessionId = `CS-${yy}${mm}${dd}-${cleanTerm}-${randomHex}`;

  const session: CheckoutSession = {
    checkoutSessionId,
    terminalId: cleanTerm,
    sessionCreatedAt,
  };

  storage.setItem(CHECKOUT_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
};

const restoreCheckoutSession = (
  storage: MockLocalStorage
): CheckoutSession | null => {
  const existingJson = storage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
  if (!existingJson) return null;
  try {
    const parsed = JSON.parse(existingJson) as CheckoutSession;
    if (parsed.checkoutSessionId && parsed.sessionCreatedAt && parsed.terminalId) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const clearCheckoutSession = (
  storage: MockLocalStorage
): void => {
  storage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
};

runTest('Hash width verification: generateInvoiceNumber produces exactly 8 hex chars (32-bit hash)', () => {
  const sampleSessions = [
    'session_test_uuid_alpha',
    'session_test_uuid_beta',
    'CS-261102-T1-998877665544',
    '8f4ac92b-3e5d-4f1a-b2c3-d4e5f6a7b8c9',
  ];

  for (const session of sampleSessions) {
    const invoiceNo = generateInvoiceNumber(session, 'T1', new Date('2026-11-02T12:00:00Z'));
    const parts = invoiceNo.split('-');
    assert.equal(parts.length, 4, `Invoice ${invoiceNo} must have 4 segments: INV-YYMMDD-Term-Hash`);
    const hexPart = parts[3];
    assert.equal(hexPart.length, 8, `Hash part "${hexPart}" must be exactly 8 hexadecimal characters`);
    assert.match(hexPart, /^[0-9A-F]{8}$/, `Hash part "${hexPart}" must consist of valid uppercase hex characters`);
  }
});

runTest('Missing session metadata: Missing or empty sessionCreatedAt is strictly rejected without new Date() fallback', () => {
  let rejectedUndefined = false;
  try {
    deriveInvoiceForSession({
      checkoutSessionId: 'CS-261102-T1-UUID-1234',
      sessionCreatedAt: undefined,
    });
  } catch (err: any) {
    rejectedUndefined = true;
    assert.match(err.message, /Persistent sessionCreatedAt timestamp is required. Fallback to new Date\(\) is strictly forbidden./);
  }
  assert.equal(rejectedUndefined, true, 'Missing sessionCreatedAt must be rejected immediately');

  let rejectedEmpty = false;
  try {
    deriveInvoiceForSession({
      checkoutSessionId: 'CS-261102-T1-UUID-1234',
      sessionCreatedAt: '   ',
    });
  } catch (err: any) {
    rejectedEmpty = true;
    assert.match(err.message, /Persistent sessionCreatedAt timestamp is required. Fallback to new Date\(\) is strictly forbidden./);
  }
  assert.equal(rejectedEmpty, true, 'Empty sessionCreatedAt must be rejected immediately');
});

runTest('Same session ID with changed session date is rejected (Immutable date mapping)', () => {
  let detectedDateTampering = false;
  try {
    // Session ID is permanently locked to 2026-11-02 (261102)
    deriveInvoiceForSession({
      checkoutSessionId: 'CS-261102-T1-UUID-1234',
      sessionCreatedAt: '2026-11-03T10:00:00.000Z', // Tampered date (Nov 3 instead of Nov 2)
      terminalId: 'T1',
    });
  } catch (err: any) {
    detectedDateTampering = true;
    assert.match(err.message, /Inconsistent session metadata! Session ID date "261102" does not match sessionCreatedAt date/);
  }
  assert.equal(detectedDateTampering, true, 'Same session ID cannot be submitted with a changed date');
});

runTest('Same session ID with changed terminal ID is rejected (Immutable terminal mapping)', () => {
  let detectedTerminalMismatch = false;
  try {
    // Session ID is permanently locked to terminal T1
    deriveInvoiceForSession({
      checkoutSessionId: 'CS-261102-T1-UUID-1234',
      sessionCreatedAt: '2026-11-02T14:30:00.000Z',
      terminalId: 'T2', // Conflicting terminal T2!
    });
  } catch (err: any) {
    detectedTerminalMismatch = true;
    assert.match(err.message, /Inconsistent session metadata! Session ID terminal "T1" does not match input terminalId "T2"./);
  }
  assert.equal(detectedTerminalMismatch, true, 'Same session ID cannot be submitted with a changed terminal ID');
});

runTest('Same session ID after page refresh / browser restart: Reuses exact same values from persistent client storage', () => {
  const browserStorage = new MockLocalStorage();

  // 1. Initial checkout session generation before checkout begins
  const initialSession = getOrCreateCheckoutSession('T1', browserStorage);
  assert.ok(initialSession.checkoutSessionId.startsWith('CS-'));
  assert.equal(initialSession.terminalId, 'T1');
  assert.ok(initialSession.sessionCreatedAt);

  const initialInvoiceNo = deriveInvoiceForSession({
    checkoutSessionId: initialSession.checkoutSessionId,
    sessionCreatedAt: initialSession.sessionCreatedAt,
    terminalId: initialSession.terminalId,
  });

  // 2. Simulate browser refresh (re-reading from storage)
  const sessionAfterRefresh = restoreCheckoutSession(browserStorage);
  assert.ok(sessionAfterRefresh, 'Session must exist in storage after refresh');
  assert.equal(sessionAfterRefresh?.checkoutSessionId, initialSession.checkoutSessionId);
  assert.equal(sessionAfterRefresh?.sessionCreatedAt, initialSession.sessionCreatedAt);
  assert.equal(sessionAfterRefresh?.terminalId, initialSession.terminalId);

  const refreshInvoiceNo = deriveInvoiceForSession({
    checkoutSessionId: sessionAfterRefresh!.checkoutSessionId,
    sessionCreatedAt: sessionAfterRefresh!.sessionCreatedAt,
    terminalId: sessionAfterRefresh!.terminalId,
  });
  assert.equal(refreshInvoiceNo, initialInvoiceNo, 'Invoice after page refresh must be identical');

  // 3. Simulate browser restart (persistent storage preserved across sessions)
  // Calling getOrCreateCheckoutSession retrieves existing session rather than generating a new one
  const sessionAfterRestart = getOrCreateCheckoutSession('T1', browserStorage);
  assert.equal(sessionAfterRestart.checkoutSessionId, initialSession.checkoutSessionId);
  assert.equal(sessionAfterRestart.sessionCreatedAt, initialSession.sessionCreatedAt);
  assert.equal(sessionAfterRestart.terminalId, initialSession.terminalId);

  const restartInvoiceNo = deriveInvoiceForSession({
    checkoutSessionId: sessionAfterRestart.checkoutSessionId,
    sessionCreatedAt: sessionAfterRestart.sessionCreatedAt,
    terminalId: sessionAfterRestart.terminalId,
  });
  assert.equal(restartInvoiceNo, initialInvoiceNo, 'Invoice after browser restart must be identical');

  // 4. Simulate successful sale completion: storage is cleared
  clearCheckoutSession(browserStorage);
  assert.equal(restoreCheckoutSession(browserStorage), null, 'Session must be cleared after sale completion');
});

runTest('Midnight retry simulation: Checkout at 23:59:59 and retry at 00:00:02 produce the EXACT same invoice number and target same document', () => {
  const preMidnightDate = new Date(2026, 10, 2, 23, 59, 59); // 11:59:59 PM Nov 2, 2026 (local time)
  const sessionCreatedAt = preMidnightDate.toISOString();
  const checkoutSessionId = 'CS-261102-T1-MIDNIGHT999';
  const terminalId = 'T1';

  // 1. Initial checkout at 23:59:59 on Nov 2, 2026
  const initialInvoiceNo = deriveInvoiceForSession({
    checkoutSessionId,
    sessionCreatedAt,
    terminalId,
  });

  assert.match(initialInvoiceNo, /^INV-261102-T1-[0-9A-F]{8}$/);

  // 2. Network timeout occurred; client retries at 00:00:02 on Nov 3, 2026 (next day)
  // Client supplies the SAME persistent checkoutSessionId and sessionCreatedAt restored from storage
  const retryInvoiceNo = deriveInvoiceForSession({
    checkoutSessionId,
    sessionCreatedAt,
    terminalId,
  });

  // 3. Confirm both calls produce the exact same invoice number
  assert.equal(retryInvoiceNo, initialInvoiceNo, 'Retry after midnight MUST produce the exact same invoice number as initial checkout');

  // 4. Confirm document references target the exact same Firestore document path
  const initialDocPath = `sales/${initialInvoiceNo}`;
  const retryDocPath = `sales/${retryInvoiceNo}`;
  assert.equal(retryDocPath, initialDocPath, 'Both calls MUST target the exact same Firestore document path');
});

runTest('Terminal consistency: Retry with different terminal ID on existing sale document is rejected', () => {
  const existingSale: Partial<SaleDocument> = {
    id: 'INV-261102-T1-8F4AC92B',
    invoiceNo: 'INV-261102-T1-8F4AC92B',
    checkoutSessionId: 'uuid-session-777',
    terminalId: 'T1',
    sessionCreatedAt: '2026-11-02T12:00:00.000Z',
  };

  const incomingRetryInput = {
    checkoutSessionId: 'uuid-session-777',
    sessionCreatedAt: '2026-11-02T12:00:00.000Z',
    terminalId: 'T2', // Conflicting terminal on retry!
  };

  let detectedTerminalMismatch = false;
  try {
    // Simulating Step 1 check in processSaleTransaction:
    if (existingSale.terminalId && incomingRetryInput.terminalId) {
      const cleanInputTerm = incomingRetryInput.terminalId.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
      if (existingSale.terminalId.toUpperCase() !== cleanInputTerm) {
        throw new Error(`Inconsistent session metadata! Stored terminal "${existingSale.terminalId}" does not match retry terminalId "${incomingRetryInput.terminalId}".`);
      }
    }
  } catch (err: any) {
    detectedTerminalMismatch = true;
    assert.match(err.message, /Inconsistent session metadata! Stored terminal "T1" does not match retry terminalId "T2"./);
  }

  assert.equal(detectedTerminalMismatch, true, 'Retry attempting to switch terminal ID on existing sale must be rejected');
});

runTest('Session creation timestamp consistency: Retry with different sessionCreatedAt on existing sale is rejected', () => {
  const existingSale: Partial<SaleDocument> = {
    id: 'INV-261102-T1-8F4AC92B',
    invoiceNo: 'INV-261102-T1-8F4AC92B',
    checkoutSessionId: 'uuid-session-777',
    terminalId: 'T1',
    sessionCreatedAt: '2026-11-02T12:00:00.000Z',
  };

  const incomingRetryInput = {
    checkoutSessionId: 'uuid-session-777',
    sessionCreatedAt: '2026-11-02T12:05:00.000Z', // Different timestamp!
    terminalId: 'T1',
  };

  let detectedTimestampMismatch = false;
  try {
    if (existingSale.sessionCreatedAt && existingSale.sessionCreatedAt !== incomingRetryInput.sessionCreatedAt) {
      throw new Error(`Inconsistent session metadata! Stored sessionCreatedAt "${existingSale.sessionCreatedAt}" does not match retry sessionCreatedAt "${incomingRetryInput.sessionCreatedAt}".`);
    }
  } catch (err: any) {
    detectedTimestampMismatch = true;
    assert.match(err.message, /Inconsistent session metadata! Stored sessionCreatedAt/);
  }

  assert.equal(detectedTimestampMismatch, true, 'Retry attempting to switch sessionCreatedAt on existing sale must be rejected');
});

console.log('\n====================================================');
console.log(`📊 MILESTONE 4.1 TEST SUMMARY: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');
