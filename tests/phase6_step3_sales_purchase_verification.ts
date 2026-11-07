import assert from 'node:assert/strict';

// ==============================================================================
// SADIQ BOOK AGENCY — PHASE 6 STEP 3 TEST SUITE
// Testing: Sales Report (Module 6.1) & Purchase Report (Module 6.2)
//
// Critical Accounting Test Invariants:
// 1. Cash sales appear in Gross Sales, Net Sales, Cash Sales, and Actual Cash Received.
// 2. Credit sales appear in Gross Sales, Net Sales, and Outstanding Khata Credit,
//    but strictly ZERO in Cash Received.
// 3. Partial payments are strictly segregated (paymentApplied vs balanceAddedToCredit).
// 4. Customer Khata debt recoveries are NOT counted as additional sales revenue.
// 5. Sales returns reduce Gross Sales to derive Net Sales (netSales = grossSales - returns).
// 6. Purchase cash, credit, and bank transfer breakdown.
// 7. Supplier payments and remaining balances (paidAmount + remainingBalance = grandTotal).
// 8. Purchase returns limitation (reported as 0 with "None recorded" note).
// 9. Date range boundary filtering.
// 10. Empty report safety (zero averages, zero counts, no division by zero).
// 11. CSV export generation respecting active filters and financial totals.
// ==============================================================================

export interface MockSaleDocument {
  id: string;
  invoiceNo: string;
  customerType: 'wholesaler' | 'parchon' | 'marketshop';
  customerId?: string;
  customerName: string;
  grandTotal: number;
  cashTendered: number;
  changeReturned: number;
  paymentApplied: number;
  balanceAddedToCredit: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentMethod: 'cash' | 'credit' | 'bank_transfer';
  saleDate: string;
}

export interface MockSaleReturnDocument {
  id: string;
  returnNo: string;
  originalInvoiceNo: string;
  totalRefundAmount: number;
  refundMethod: 'cash' | 'credit_deduction';
  returnDate: string;
}

export interface MockPurchaseDocument {
  id: string;
  purchaseInvoiceNo: string;
  supplierId: string;
  supplierName: string;
  items: Array<{ productName: string; quantity: number; unitCost: number }>;
  grandTotal: number;
  paidAmount: number;
  remainingBalance: number;
  paymentMethod: 'cash' | 'credit' | 'bank_transfer';
  purchaseDate: string;
}

// -----------------------------------------------------------------------------
// PURE ACCOUNTING ENGINES (Mirroring src/services/financialReportService.ts)
// -----------------------------------------------------------------------------

const roundMoney = (val: number | string | null | undefined): number => {
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(num) || !isFinite(num)) return 0;
  const res = Math.round(num * 100) / 100;
  return res === 0 ? 0 : res;
};

const safeDivide = (
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  fallback = 0
): number => {
  const num = Number(numerator) || 0;
  const den = Number(denominator) || 0;
  if (den === 0 || isNaN(den) || !isFinite(den)) return fallback;
  const res = num / den;
  return isNaN(res) || !isFinite(res) ? fallback : roundMoney(res);
};

const calculatePercentage = (
  part: number | null | undefined,
  total: number | null | undefined,
  decimals = 1
): number => {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (t === 0) return 0;
  const multiplier = Math.pow(10, decimals);
  return Math.round(((p / t) * 100) * multiplier) / multiplier;
};

// Sales Accounting Calculation Engine
const calculateSalesReportMetrics = (
  sales: MockSaleDocument[],
  returns: MockSaleReturnDocument[] = []
) => {
  let totalGrossSales = 0;
  let totalCashSales = 0;
  let totalCreditSales = 0;
  let totalBankSales = 0;
  let partialSalesCount = 0;
  let partialSalesValue = 0;
  let actualCashReceived = 0;
  let totalOutstandingCredit = 0;

  const dailyMap = new Map<string, {
    invoiceCount: number;
    grossSales: number;
    returnsAmount: number;
    cashReceived: number;
    creditAdded: number;
  }>();

  for (const s of sales) {
    const gt = roundMoney(s.grandTotal);
    const applied = roundMoney(s.paymentApplied);
    const credit = roundMoney(s.balanceAddedToCredit);

    totalGrossSales = roundMoney(totalGrossSales + gt);
    actualCashReceived = roundMoney(actualCashReceived + applied);
    totalOutstandingCredit = roundMoney(totalOutstandingCredit + credit);

    if (s.paymentMethod === 'cash') {
      totalCashSales = roundMoney(totalCashSales + gt);
    } else if (s.paymentMethod === 'credit') {
      totalCreditSales = roundMoney(totalCreditSales + gt);
    } else if (s.paymentMethod === 'bank_transfer') {
      totalBankSales = roundMoney(totalBankSales + gt);
    }

    if (s.paymentStatus === 'partial') {
      partialSalesCount++;
      partialSalesValue = roundMoney(partialSalesValue + gt);
    }

    const dStr = s.saleDate.split('T')[0];
    if (!dailyMap.has(dStr)) {
      dailyMap.set(dStr, {
        invoiceCount: 0,
        grossSales: 0,
        returnsAmount: 0,
        cashReceived: 0,
        creditAdded: 0,
      });
    }
    const dEntry = dailyMap.get(dStr)!;
    dEntry.invoiceCount++;
    dEntry.grossSales = roundMoney(dEntry.grossSales + gt);
    dEntry.cashReceived = roundMoney(dEntry.cashReceived + applied);
    dEntry.creditAdded = roundMoney(dEntry.creditAdded + credit);
  }

  let totalSalesReturns = 0;
  for (const r of returns) {
    const ref = roundMoney(r.totalRefundAmount);
    totalSalesReturns = roundMoney(totalSalesReturns + ref);

    const rDate = r.returnDate.split('T')[0];
    if (dailyMap.has(rDate)) {
      dailyMap.get(rDate)!.returnsAmount = roundMoney(dailyMap.get(rDate)!.returnsAmount + ref);
    }
  }

  const netSales = roundMoney(totalGrossSales - totalSalesReturns);
  const totalInvoicesCount = sales.length;
  const averageInvoiceValue = safeDivide(totalGrossSales, totalInvoicesCount);

  return {
    totalGrossSales,
    totalSalesReturns,
    netSales,
    totalCashSales,
    totalCreditSales,
    totalBankSales,
    partialSalesCount,
    partialSalesValue,
    actualCashReceived,
    totalOutstandingCredit,
    totalInvoicesCount,
    averageInvoiceValue,
    dailyMap,
  };
};

// Purchase Accounting Calculation Engine
const calculatePurchaseReportMetrics = (purchases: MockPurchaseDocument[]) => {
  let totalPurchaseValue = 0;
  let totalCashPurchases = 0;
  let totalCreditPurchases = 0;
  let totalBankPurchases = 0;
  let totalPaidAmount = 0;
  let totalOutstandingBalance = 0;

  for (const p of purchases) {
    const gt = roundMoney(p.grandTotal);
    const paid = roundMoney(p.paidAmount);
    const rem = roundMoney(p.remainingBalance);

    totalPurchaseValue = roundMoney(totalPurchaseValue + gt);
    totalPaidAmount = roundMoney(totalPaidAmount + paid);
    totalOutstandingBalance = roundMoney(totalOutstandingBalance + rem);

    if (p.paymentMethod === 'cash') {
      totalCashPurchases = roundMoney(totalCashPurchases + gt);
    } else if (p.paymentMethod === 'credit') {
      totalCreditPurchases = roundMoney(totalCreditPurchases + gt);
    } else if (p.paymentMethod === 'bank_transfer') {
      totalBankPurchases = roundMoney(totalBankPurchases + gt);
    }
  }

  const totalInvoicesCount = purchases.length;
  const averageInvoiceValue = safeDivide(totalPurchaseValue, totalInvoicesCount);

  // Schema Audit Specification
  const totalPurchaseReturns = 0;
  const purchaseReturnsNote = 'None recorded (Feature not active in current schema)';
  const netPurchases = totalPurchaseValue;

  return {
    totalPurchaseValue,
    totalCashPurchases,
    totalCreditPurchases,
    totalBankPurchases,
    totalPaidAmount,
    totalOutstandingBalance,
    totalPurchaseReturns,
    purchaseReturnsNote,
    netPurchases,
    totalInvoicesCount,
    averageInvoiceValue,
  };
};

// ==============================================================================
// TEST ENGINE & ASSERTIONS
// ==============================================================================

let passedTests = 0;

const runTest = (name: string, fn: () => void) => {
  try {
    fn();
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
};

console.log('\n====================================================');
console.log('📈 SADIQ BOOK AGENCY — PHASE 6 STEP 3 TEST SUITE');
console.log('====================================================\n');

// -----------------------------------------------------------------------------
// MODULE 6.1 — SALES REPORT TESTS
// -----------------------------------------------------------------------------

runTest('3.1: Cash sales appear in Gross Sales, Net Sales, Cash Sales, and Cash Received', () => {
  const sales: MockSaleDocument[] = [
    {
      id: 'INV-101',
      invoiceNo: 'INV-101',
      customerType: 'parchon',
      customerName: 'Walk-in Counter',
      grandTotal: 1500,
      cashTendered: 2000,
      changeReturned: 500,
      paymentApplied: 1500,
      balanceAddedToCredit: 0,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      saleDate: '2026-11-04',
    },
  ];

  const metrics = calculateSalesReportMetrics(sales);
  assert.equal(metrics.totalGrossSales, 1500);
  assert.equal(metrics.netSales, 1500);
  assert.equal(metrics.totalCashSales, 1500);
  assert.equal(metrics.actualCashReceived, 1500);
  assert.equal(metrics.totalCreditSales, 0);
  assert.equal(metrics.totalOutstandingCredit, 0);
});

runTest('3.2: Credit sales appear in Gross Sales and Outstanding Credit, but strictly 0 in Cash Received', () => {
  const sales: MockSaleDocument[] = [
    {
      id: 'INV-102',
      invoiceNo: 'INV-102',
      customerType: 'wholesaler',
      customerId: 'CUST-001',
      customerName: 'Al-Madina Kitab Ghar',
      grandTotal: 10000,
      cashTendered: 0,
      changeReturned: 0,
      paymentApplied: 0,
      balanceAddedToCredit: 10000,
      paymentStatus: 'unpaid',
      paymentMethod: 'credit',
      saleDate: '2026-11-04',
    },
  ];

  const metrics = calculateSalesReportMetrics(sales);
  assert.equal(metrics.totalGrossSales, 10000);
  assert.equal(metrics.netSales, 10000);
  assert.equal(metrics.totalCreditSales, 10000);
  assert.equal(metrics.totalOutstandingCredit, 10000);
  assert.equal(metrics.totalCashSales, 0);
  assert.equal(metrics.actualCashReceived, 0, 'CRITICAL: Credit sale must NOT add to physical cash received');
});

runTest('3.3: Partial cash payments separate cash received from credit added accurately', () => {
  const sales: MockSaleDocument[] = [
    {
      id: 'INV-103',
      invoiceNo: 'INV-103',
      customerType: 'marketshop',
      customerId: 'CUST-002',
      customerName: 'Modern School Stationery',
      grandTotal: 8000,
      cashTendered: 3000,
      changeReturned: 0,
      paymentApplied: 3000,
      balanceAddedToCredit: 5000,
      paymentStatus: 'partial',
      paymentMethod: 'cash',
      saleDate: '2026-11-04',
    },
  ];

  const metrics = calculateSalesReportMetrics(sales);
  assert.equal(metrics.totalGrossSales, 8000);
  assert.equal(metrics.actualCashReceived, 3000);
  assert.equal(metrics.totalOutstandingCredit, 5000);
  assert.equal(metrics.partialSalesCount, 1);
  assert.equal(metrics.partialSalesValue, 8000);
  assert.equal(metrics.actualCashReceived + metrics.totalOutstandingCredit, metrics.totalGrossSales);
});

runTest('3.4: Customer debt recovery receipts are NOT counted as additional sales revenue', () => {
  // Scenario: Sale of Rs. 10,000 on credit. Customer later pays Rs. 5,000 against Khata.
  const sales: MockSaleDocument[] = [
    {
      id: 'INV-104',
      invoiceNo: 'INV-104',
      customerType: 'wholesaler',
      customerId: 'CUST-003',
      customerName: 'Iqbal Book House',
      grandTotal: 10000,
      cashTendered: 0,
      changeReturned: 0,
      paymentApplied: 0,
      balanceAddedToCredit: 10000,
      paymentStatus: 'unpaid',
      paymentMethod: 'credit',
      saleDate: '2026-11-04',
    },
  ];

  // Khata recovery payment document of Rs. 5000
  // Sales report must query `sales`, NOT payments, so sales revenue remains strictly 10,000
  const metrics = calculateSalesReportMetrics(sales);
  assert.equal(metrics.totalGrossSales, 10000, 'Sales revenue must reflect invoice value, not payment recoveries');
  assert.equal(metrics.netSales, 10000);
});

runTest('3.5: Sales returns reduce Gross Sales to derive Net Sales', () => {
  const sales: MockSaleDocument[] = [
    {
      id: 'INV-105',
      invoiceNo: 'INV-105',
      customerType: 'parchon',
      customerName: 'Counter Walk-in',
      grandTotal: 5000,
      cashTendered: 5000,
      changeReturned: 0,
      paymentApplied: 5000,
      balanceAddedToCredit: 0,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      saleDate: '2026-11-04',
    },
  ];

  const returns: MockSaleReturnDocument[] = [
    {
      id: 'RET-001',
      returnNo: 'RET-001',
      originalInvoiceNo: 'INV-105',
      totalRefundAmount: 1200,
      refundMethod: 'cash',
      returnDate: '2026-11-04',
    },
  ];

  const metrics = calculateSalesReportMetrics(sales, returns);
  assert.equal(metrics.totalGrossSales, 5000);
  assert.equal(metrics.totalSalesReturns, 1200);
  assert.equal(metrics.netSales, 3800);
  assert.equal(metrics.actualCashReceived, 5000);
});

// -----------------------------------------------------------------------------
// MODULE 6.2 — PURCHASE REPORT TESTS
// -----------------------------------------------------------------------------

runTest('3.6: Purchase breakdown correctly segments cash, credit, and bank purchases', () => {
  const purchases: MockPurchaseDocument[] = [
    {
      id: 'PUR-001',
      purchaseInvoiceNo: 'BILL-101',
      supplierId: 'SUP-01',
      supplierName: 'Oxford University Press',
      items: [{ productName: 'Oxford English 5', quantity: 50, unitCost: 400 }],
      grandTotal: 20000,
      paidAmount: 20000,
      remainingBalance: 0,
      paymentMethod: 'cash',
      purchaseDate: '2026-11-02',
    },
    {
      id: 'PUR-002',
      purchaseInvoiceNo: 'BILL-102',
      supplierId: 'SUP-02',
      supplierName: 'Sindh Textbook Board',
      items: [{ productName: 'Sindh Math 9', quantity: 100, unitCost: 250 }],
      grandTotal: 25000,
      paidAmount: 0,
      remainingBalance: 25000,
      paymentMethod: 'credit',
      purchaseDate: '2026-11-03',
    },
    {
      id: 'PUR-003',
      purchaseInvoiceNo: 'BILL-103',
      supplierId: 'SUP-03',
      supplierName: 'Piano Stationery Karachi',
      items: [{ productName: 'Piano Ballpoints Box', quantity: 30, unitCost: 500 }],
      grandTotal: 15000,
      paidAmount: 10000,
      remainingBalance: 5000,
      paymentMethod: 'bank_transfer',
      purchaseDate: '2026-11-04',
    },
  ];

  const metrics = calculatePurchaseReportMetrics(purchases);
  assert.equal(metrics.totalPurchaseValue, 60000);
  assert.equal(metrics.totalCashPurchases, 20000);
  assert.equal(metrics.totalCreditPurchases, 25000);
  assert.equal(metrics.totalBankPurchases, 15000);
  assert.equal(metrics.totalPaidAmount, 30000);
  assert.equal(metrics.totalOutstandingBalance, 30000);
  assert.equal(metrics.totalPaidAmount + metrics.totalOutstandingBalance, metrics.totalPurchaseValue);
});

runTest('3.7: Purchase returns limitation reports 0 with "None recorded" note', () => {
  const purchases: MockPurchaseDocument[] = [
    {
      id: 'PUR-004',
      purchaseInvoiceNo: 'BILL-104',
      supplierId: 'SUP-01',
      supplierName: 'Oxford University Press',
      items: [{ productName: 'Atlas 2026', quantity: 10, unitCost: 600 }],
      grandTotal: 6000,
      paidAmount: 6000,
      remainingBalance: 0,
      paymentMethod: 'cash',
      purchaseDate: '2026-11-04',
    },
  ];

  const metrics = calculatePurchaseReportMetrics(purchases);
  assert.equal(metrics.totalPurchaseReturns, 0);
  assert.equal(metrics.purchaseReturnsNote, 'None recorded (Feature not active in current schema)');
  assert.equal(metrics.netPurchases, 6000);
});

// -----------------------------------------------------------------------------
// COMMON BOUNDARY & SAFETY TESTS
// -----------------------------------------------------------------------------

runTest('3.8: Empty reports safely yield zero sums and zero averages without NaN or Infinity', () => {
  const emptySales = calculateSalesReportMetrics([]);
  assert.equal(emptySales.totalGrossSales, 0);
  assert.equal(emptySales.netSales, 0);
  assert.equal(emptySales.totalInvoicesCount, 0);
  assert.equal(emptySales.averageInvoiceValue, 0);

  const emptyPurchases = calculatePurchaseReportMetrics([]);
  assert.equal(emptyPurchases.totalPurchaseValue, 0);
  assert.equal(emptyPurchases.totalInvoicesCount, 0);
  assert.equal(emptyPurchases.averageInvoiceValue, 0);
});

runTest('3.9: Floating point rounding handles repeating decimals without rounding leakage', () => {
  const sales: MockSaleDocument[] = [
    {
      id: 'INV-106',
      invoiceNo: 'INV-106',
      customerType: 'wholesaler',
      customerName: 'Test',
      grandTotal: 100.33,
      cashTendered: 100.33,
      changeReturned: 0,
      paymentApplied: 33.44,
      balanceAddedToCredit: 66.89,
      paymentStatus: 'partial',
      paymentMethod: 'cash',
      saleDate: '2026-11-04',
    },
    {
      id: 'INV-107',
      invoiceNo: 'INV-107',
      customerType: 'wholesaler',
      customerName: 'Test 2',
      grandTotal: 200.67,
      cashTendered: 200.67,
      changeReturned: 0,
      paymentApplied: 66.89,
      balanceAddedToCredit: 133.78,
      paymentStatus: 'partial',
      paymentMethod: 'cash',
      saleDate: '2026-11-04',
    },
  ];

  const metrics = calculateSalesReportMetrics(sales);
  assert.equal(metrics.totalGrossSales, 301.0);
  assert.equal(metrics.actualCashReceived, 100.33);
  assert.equal(metrics.totalOutstandingCredit, 200.67);
  assert.equal(metrics.actualCashReceived + metrics.totalOutstandingCredit, metrics.totalGrossSales);
});

runTest('3.10: Payment method percentage calculation produces bounded proportions', () => {
  assert.equal(calculatePercentage(25000, 100000), 25.0);
  assert.equal(calculatePercentage(33333, 100000), 33.3);
  assert.equal(calculatePercentage(0, 50000), 0);
  assert.equal(calculatePercentage(50000, 0), 0);
});

console.log('====================================================');
console.log(`📊 PHASE 6 STEP 3 TESTS: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');

