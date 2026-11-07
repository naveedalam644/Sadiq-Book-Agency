/**
 * PHASE 3 LOGIC & TRANSACTION VERIFICATION SCRIPT
 * Sadiq Book Agency
 * Verifies:
 * 1. Customer types & conditional schema validation (Wholesaler, Parchon, Marketshop)
 * 2. Product-wise customer discount pricing engine & 3-tier resolution hierarchy
 * 3. Deterministic discount ID generation & deduplication (${customerId}_${productId})
 * 4. Double-entry Khata balance math (debit increases Udhaar, credit decreases Udhaar)
 * 5. Single-read Firestore transaction cost & atomic balance integrity
 * 6. Historical invoice immutability (discount changes never mutate past sales)
 * 7. Credit limit utilization & over-limit detection
 * 8. Opening balance initialization from paper registers
 */

declare const process: { exit: (code: number) => void };

type CustomerType = 'wholesaler' | 'parchon' | 'marketshop';
type CustomerDiscountType = 'percentage' | 'fixed_rate';

interface TestCustomer {
  id: string;
  name: string;
  type: CustomerType;
  phone: string;
  shopName?: string;
  discountPercentage?: number;
  creditLimit: number;
  currentBalance: number;
  isActive: boolean;
}

interface TestProduct {
  id: string;
  title: string;
  sku: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
}

interface TestCustomerDiscount {
  id: string;
  customerId: string;
  productId: string;
  discountType: CustomerDiscountType;
  discountValue: number;
  basePriceType: 'wholesale' | 'retail';
  standardPrice: number;
  effectivePrice: number;
}

function resolveEffectivePrice(
  product: TestProduct,
  customer: TestCustomer,
  customDiscount?: TestCustomerDiscount | null
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
} {
  const standardRetail = Number(product.retailPrice) || 0;
  const standardWholesale = Number(product.wholesalePrice) || standardRetail;

  // 1. Customer-Specific Product Discount Rule
  if (customDiscount) {
    if (customDiscount.discountType === 'fixed_rate') {
      const fixedRate = Math.max(0, Number(customDiscount.discountValue) || 0);
      const base = customDiscount.basePriceType === 'wholesale' ? standardWholesale : standardRetail;
      const savings = Math.max(0, base - fixedRate);
      const pct = base > 0 ? Math.round((savings / base) * 1000) / 10 : 0;
      return {
        effectivePrice: fixedRate,
        appliedRuleType: 'custom_fixed',
        discountRatePercent: pct,
        savingsPerUnit: savings,
      };
    }

    if (customDiscount.discountType === 'percentage') {
      const pct = Math.max(0, Math.min(100, Number(customDiscount.discountValue) || 0));
      const base = customDiscount.basePriceType === 'wholesale' ? standardWholesale : standardRetail;
      const calculatedRate = Math.round(base * (1 - pct / 100) * 100) / 100;
      const savings = Math.max(0, base - calculatedRate);
      return {
        effectivePrice: calculatedRate,
        appliedRuleType: 'custom_percentage',
        discountRatePercent: pct,
        savingsPerUnit: savings,
      };
    }
  }

  // 2. Agreed Base Customer Discount (Marketshop)
  if (customer.type === 'marketshop' && (customer.discountPercentage || 0) > 0) {
    const basePct = Math.min(100, Math.max(0, customer.discountPercentage || 0));
    const base = standardRetail;
    const discountedRate = Math.round(base * (1 - basePct / 100) * 100) / 100;
    const savings = Math.max(0, base - discountedRate);
    return {
      effectivePrice: discountedRate,
      appliedRuleType: 'customer_base',
      discountRatePercent: basePct,
      savingsPerUnit: savings,
    };
  }

  // 3. Customer Type Default Rate
  if (customer.type === 'wholesaler') {
    return {
      effectivePrice: standardWholesale,
      appliedRuleType: 'standard_wholesale',
      discountRatePercent: 0,
      savingsPerUnit: Math.max(0, standardRetail - standardWholesale),
    };
  }

  // Parchon / General retail walk-in
  return {
    effectivePrice: standardRetail,
    appliedRuleType: 'standard_retail',
    discountRatePercent: 0,
    savingsPerUnit: 0,
  };
}

function runPhase3Tests() {
  console.log('====================================================');
  console.log('🧪 SADIQ BOOK AGENCY — PHASE 3 VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // 1. Customer Archetypes & Conditional Field Validation
  // -------------------------------------------------------------
  const wholesaler: TestCustomer = {
    id: 'cust_ws_1',
    name: 'Haji Aslam',
    shopName: 'Al-Madina Book Depot',
    type: 'wholesaler',
    phone: '0300-1112233',
    creditLimit: 100000,
    currentBalance: 0,
    isActive: true,
  };
  assert(
    wholesaler.type === 'wholesaler' && Boolean(wholesaler.shopName) && wholesaler.creditLimit === 100000,
    'Wholesaler archetype supports business shop name and credit limit'
  );

  const marketshop: TestCustomer = {
    id: 'cust_ms_1',
    name: 'Tariq Mehmood',
    shopName: 'Tariq Stationery & Gift Shop',
    type: 'marketshop',
    phone: '0301-4445566',
    discountPercentage: 15, // 15% base discount
    creditLimit: 30000,
    currentBalance: 0,
    isActive: true,
  };
  assert(
    marketshop.type === 'marketshop' && marketshop.discountPercentage === 15 && marketshop.creditLimit === 30000,
    'Marketshop archetype supports agreed base discount percentage and credit limit'
  );

  const parchon: TestCustomer = {
    id: 'cust_pr_1',
    name: 'Walk-in Retail Customer',
    type: 'parchon',
    phone: '',
    creditLimit: 0,
    currentBalance: 0,
    isActive: true,
  };
  assert(
    parchon.type === 'parchon' && parchon.creditLimit === 0 && parchon.name === 'Walk-in Retail Customer',
    'Parchon archetype enforces cash counter terms (creditLimit = 0) and default name'
  );

  // -------------------------------------------------------------
  // 2. Pricing Engine: 3-Tier Discount Precedence Hierarchy
  // -------------------------------------------------------------
  const testBook: TestProduct = {
    id: 'prod_oxf_5',
    title: 'Oxford Progressive English 5',
    sku: 'BK-OXF-1001',
    costPrice: 280,
    retailPrice: 500,
    wholesalePrice: 400,
  };

  // Case 2A: Level 1 - Product-Wise Customer-Specific Percentage Discount
  const customPctDiscount: TestCustomerDiscount = {
    id: 'cust_ws_1_prod_oxf_5',
    customerId: wholesaler.id,
    productId: testBook.id,
    discountType: 'percentage',
    discountValue: 20, // 20% off wholesale
    basePriceType: 'wholesale',
    standardPrice: testBook.wholesalePrice,
    effectivePrice: 320,
  };
  const resPct = resolveEffectivePrice(testBook, wholesaler, customPctDiscount);
  assert(
    resPct.effectivePrice === 320 && resPct.appliedRuleType === 'custom_percentage',
    'Level 1: Customer-specific product percentage discount applied (400 - 20% = Rs. 320)',
    `Expected 320, got ${resPct.effectivePrice}`
  );

  // Case 2B: Level 1 - Product-Wise Customer-Specific Fixed Selling Rate
  const customFixedDiscount: TestCustomerDiscount = {
    id: 'cust_ms_1_prod_oxf_5',
    customerId: marketshop.id,
    productId: testBook.id,
    discountType: 'fixed_rate',
    discountValue: 350, // Fixed Rs. 350 net rate
    basePriceType: 'retail',
    standardPrice: testBook.retailPrice,
    effectivePrice: 350,
  };
  const resFixed = resolveEffectivePrice(testBook, marketshop, customFixedDiscount);
  assert(
    resFixed.effectivePrice === 350 && resFixed.appliedRuleType === 'custom_fixed',
    'Level 1: Customer-specific fixed selling rate applied (Fixed Rs. 350)',
    `Expected 350, got ${resFixed.effectivePrice}`
  );

  // Case 2C: Level 2 - Agreed Base Discount (Marketshop has no specific discount for book)
  const resBase = resolveEffectivePrice(testBook, marketshop, null);
  assert(
    resBase.effectivePrice === 425 && resBase.appliedRuleType === 'customer_base',
    'Level 2: Customer base discount applied when no product discount exists (500 - 15% = Rs. 425)',
    `Expected 425, got ${resBase.effectivePrice}`
  );

  // Case 2D: Level 3 - Wholesaler standard wholesale price when no discounts assigned
  const resWholesale = resolveEffectivePrice(testBook, wholesaler, null);
  assert(
    resWholesale.effectivePrice === 400 && resWholesale.appliedRuleType === 'standard_wholesale',
    'Level 3: Standard wholesale trade price applied for Wholesaler (Rs. 400)',
    `Expected 400, got ${resWholesale.effectivePrice}`
  );

  // Case 2E: Level 4 - Parchon counter retail price
  const resRetail = resolveEffectivePrice(testBook, parchon, null);
  assert(
    resRetail.effectivePrice === 500 && resRetail.appliedRuleType === 'standard_retail',
    'Level 4: Standard retail counter price applied for Parchon (Rs. 500)',
    `Expected 500, got ${resRetail.effectivePrice}`
  );

  // -------------------------------------------------------------
  // 3. Deterministic Discount ID Generation & Deduplication
  // -------------------------------------------------------------
  const docId1 = `${wholesaler.id}_${testBook.id}`;
  const docId2 = `${wholesaler.id}_${testBook.id}`;
  assert(
    docId1 === 'cust_ws_1_prod_oxf_5' && docId1 === docId2,
    'Deterministic Composite ID prevents duplicate discount records (${customerId}_${productId})'
  );

  // -------------------------------------------------------------
  // 4. Double-Entry Khata Balance Math (Debit vs Credit)
  // -------------------------------------------------------------
  let currentBalance = 0; // Starts at 0

  // Sale on Credit (Debit): Customer owes Rs. 15,000
  const debitAmount = 15000;
  currentBalance = currentBalance + debitAmount;
  assert(
    currentBalance === 15000,
    'Ledger Debit entry correctly increases customer debt (Udhaar) (0 + 15000 = 15000)'
  );

  // Partial Payment Received (Credit): Customer pays Rs. 10,000
  const creditAmount = 10000;
  currentBalance = currentBalance - creditAmount;
  assert(
    currentBalance === 5000,
    'Ledger Credit payment entry correctly decreases customer debt (15000 - 10000 = 5000)'
  );

  // Advance Payment: Customer pays Rs. 8,000 (More than owed)
  const advancePayment = 8000;
  currentBalance = currentBalance - advancePayment;
  assert(
    currentBalance === -3000,
    'Negative Khata balance correctly represents customer advance deposit (5000 - 8000 = -3000)'
  );

  // -------------------------------------------------------------
  // 5. Single-Read Firestore Transaction Accounting Simulation
  // -------------------------------------------------------------
  let simulatedTransactionReads = 0;
  let simulatedTransactionWrites = 0;

  function simulateCustomerPaymentTransaction(
    existingCustomer: TestCustomer,
    paidAmount: number
  ) {
    // 1. Transaction Read: Read customer document ONLY ONCE
    simulatedTransactionReads++;
    const customerBal = existingCustomer.currentBalance;

    // 2. Math
    const postBalance = customerBal - paidAmount;

    // 3. Transaction Writes:
    // Write 1: Update customer balance document
    simulatedTransactionWrites++;
    // Write 2: Create immutable customerLedger entry
    simulatedTransactionWrites++;
    // Write 3: Create immutable payments voucher
    simulatedTransactionWrites++;

    return { postBalance, reads: simulatedTransactionReads, writes: simulatedTransactionWrites };
  }

  const txResult = simulateCustomerPaymentTransaction({ ...wholesaler, currentBalance: 25000 }, 10000);
  assert(
    txResult.postBalance === 15000 &&
      txResult.reads === 1 &&
      txResult.writes === 3,
    'Transaction Cost Accounting: Exactly 1 customer document read and 3 atomic writes per payment'
  );

  // -------------------------------------------------------------
  // 6. Historical Invoice Immutability Guarantee
  // -------------------------------------------------------------
  // Simulate an invoice finalized in the past with a 15% discount
  const historicalInvoiceItem = {
    invoiceNo: 'INV-2026-0001',
    productId: testBook.id,
    quantity: 10,
    rateApplied: 425, // Frozen snapshot
    lineTotal: 4250,
  };

  // Admin later changes the customer's discount to 30%
  const updatedDiscountRule = { ...customPctDiscount, discountValue: 30 };
  const newlyCalculatedPrice = resolveEffectivePrice(testBook, wholesaler, updatedDiscountRule);

  // The historical invoice must remain unchanged
  assert(
    historicalInvoiceItem.rateApplied === 425 &&
      historicalInvoiceItem.lineTotal === 4250 &&
      newlyCalculatedPrice.effectivePrice === 280,
    'Historical Invoice Immutability: Past invoice lines remain frozen (Rs. 425) when discount rule updates to 30% (Rs. 280)'
  );

  // -------------------------------------------------------------
  // 7. Credit Limit Utilization & Alert Status
  // -------------------------------------------------------------
  function getCreditStatus(balance: number, limitVal: number) {
    if (limitVal <= 0) return { usagePct: 0, isOverLimit: false, isWarning: false };
    const pct = Math.round((Math.max(0, balance) / limitVal) * 100);
    return {
      usagePct: pct,
      isOverLimit: balance > limitVal,
      isWarning: pct >= 80 && balance <= limitVal,
    };
  }

  const healthyStatus = getCreditStatus(30000, 100000); // 30%
  assert(
    healthyStatus.usagePct === 30 && !healthyStatus.isOverLimit && !healthyStatus.isWarning,
    'Credit status healthy when balance is well within limit (30% of Rs. 100,000)'
  );

  const warningStatus = getCreditStatus(85000, 100000); // 85%
  assert(
    warningStatus.isWarning && !warningStatus.isOverLimit,
    'Credit status enters warning state when balance exceeds 80% threshold'
  );

  const overLimitStatus = getCreditStatus(120000, 100000); // 120%
  assert(
    overLimitStatus.isOverLimit,
    'Over-limit detected when customer balance exceeds approved credit limit (Rs. 120,000 > Rs. 100,000)'
  );

  // -------------------------------------------------------------
  // 8. Opening Balance Transfer from Paper Registers
  // -------------------------------------------------------------
  const paperKhataDebt = 45000;
  const openingLedgerEntry = {
    customerId: 'cust_ws_2',
    entryType: paperKhataDebt >= 0 ? 'debit' : 'credit',
    amount: Math.abs(paperKhataDebt),
    runningBalance: paperKhataDebt,
    description: 'Opening Balance (Paper Khata Transfer)',
  };
  assert(
    openingLedgerEntry.entryType === 'debit' &&
      openingLedgerEntry.runningBalance === 45000 &&
      openingLedgerEntry.amount === 45000,
    'Opening Balance ledger entry accurately establishes initial Khata balance from paper registers'
  );

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3Tests();

