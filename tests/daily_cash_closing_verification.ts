import assert from 'node:assert/strict';

// ==============================================================================
// SADIQ BOOK AGENCY — DAILY CASH CLOSING & RECONCILIATION TEST SUITE
// Tests for Accounting Integrity:
// 1. Cash sale followed by partial cash refund (reduces drawer exactly once).
// 2. Multiple cash refunds against one invoice (each reduces drawer once).
// 3. Credit sale followed by cash refund (cash leaves drawer, credit sale was never in drawer).
// 4. Daily closing reconciliation against payment records.
// 5. Exclusions: Credit payments (Udhaar) and non-cash refunds (credit_deduction) NOT in drawer.
// ==============================================================================

interface MockPaymentDocument {
  id: string;
  receiptNo: string;
  targetType: 'customer_credit' | 'supplier_payable' | 'direct_sale' | 'sales_refund';
  referenceId: string;
  partyName: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer' | 'cheque';
  transactionReference?: string;
  receivedByUserId: string;
  paymentDate: string;
  notes?: string;
  createdAt: string;
}

interface MockExpenseDocument {
  id: string;
  expenseCategory: string;
  title: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer';
  paidTo?: string;
  expenseDate: string;
  notes?: string;
}

interface DailyCashReconciliation {
  date: string;
  openingFloat: number;
  directCashSalesAmount: number;
  customerCreditRecoveriesCashAmount: number;
  totalCashInflows: number;
  cashSalesRefundsAmount: number;
  cashExpensesAmount: number;
  totalCashOutflows: number;
  netCashFromOperations: number;
  expectedClosingDrawerCash: number;
  bankTransferDirectSalesAmount: number;
  bankTransferCustomerRecoveriesAmount: number;
  chequeCustomerRecoveriesAmount: number;
  bankExpensesAmount: number;
  totalNonCashInflows: number;
  directCashTransactionsCount: number;
  customerCashTransactionsCount: number;
  refundCashTransactionsCount: number;
  cashExpenseTransactionsCount: number;
  nonCashTransactionsCount: number;
  cashOutflowRecords: {
    receiptNo: string;
    referenceId: string;
    amount: number;
    type?: 'refund' | 'expense';
    notes?: string;
  }[];
}

const reconcileCashDrawerRecords = (
  paymentRecords: MockPaymentDocument[],
  expensesOrFloat: MockExpenseDocument[] | number = [],
  openingFloat = 0
): DailyCashReconciliation => {
  let expenses: MockExpenseDocument[] = [];
  let floatVal = openingFloat;

  if (typeof expensesOrFloat === 'number') {
    floatVal = expensesOrFloat;
    expenses = [];
  } else if (Array.isArray(expensesOrFloat)) {
    expenses = expensesOrFloat;
  }

  const cleanFloat = Math.round(floatVal * 100) / 100;

  let directCash = 0;
  let customerCash = 0;
  let cashRefunds = 0;
  let cashExpenses = 0;

  let bankDirect = 0;
  let bankCustomer = 0;
  let chequeCustomer = 0;
  let bankExpenses = 0;

  let directCashCount = 0;
  let customerCashCount = 0;
  let refundCashCount = 0;
  let cashExpenseCount = 0;
  let nonCashCount = 0;

  const cashOutflowRecords: {
    receiptNo: string;
    referenceId: string;
    amount: number;
    type?: 'refund' | 'expense';
    notes?: string;
  }[] = [];

  for (const pay of paymentRecords) {
    const amount = Number(pay.amount) || 0;

    if (pay.paymentMode === 'cash') {
      if (pay.targetType === 'direct_sale') {
        directCash += amount;
        directCashCount++;
      } else if (pay.targetType === 'customer_credit') {
        customerCash += amount;
        customerCashCount++;
      } else if (pay.targetType === 'sales_refund') {
        cashRefunds += amount;
        refundCashCount++;
        cashOutflowRecords.push({
          receiptNo: pay.receiptNo,
          referenceId: pay.referenceId,
          amount,
          type: 'refund',
          notes: pay.notes,
        });
      }
    } else if (pay.paymentMode === 'bank_transfer') {
      if (pay.targetType === 'direct_sale') {
        bankDirect += amount;
        nonCashCount++;
      } else if (pay.targetType === 'customer_credit') {
        bankCustomer += amount;
        nonCashCount++;
      }
    } else if (pay.paymentMode === 'cheque') {
      chequeCustomer += amount;
      nonCashCount++;
    }
  }

  for (const exp of expenses) {
    const amount = Number(exp.amount) || 0;

    if (exp.paymentMode === 'cash') {
      cashExpenses += amount;
      cashExpenseCount++;
      cashOutflowRecords.push({
        receiptNo: `EXP-${exp.id}`,
        referenceId: exp.id,
        amount,
        type: 'expense',
        notes: exp.title || exp.notes || 'Operating Cash Expense',
      });
    } else if (exp.paymentMode === 'bank_transfer') {
      bankExpenses += amount;
      nonCashCount++;
    }
  }

  directCash = Math.round(directCash * 100) / 100;
  customerCash = Math.round(customerCash * 100) / 100;
  cashRefunds = Math.round(cashRefunds * 100) / 100;
  cashExpenses = Math.round(cashExpenses * 100) / 100;
  bankExpenses = Math.round(bankExpenses * 100) / 100;

  const totalInflows = Math.round((directCash + customerCash) * 100) / 100;
  const totalOutflows = Math.round((cashRefunds + cashExpenses) * 100) / 100;
  const netOperations = Math.round((totalInflows - totalOutflows) * 100) / 100;
  const closingDrawer = Math.round((cleanFloat + netOperations) * 100) / 100;

  const totalNonCash = Math.round((bankDirect + bankCustomer + chequeCustomer) * 100) / 100;

  return {
    date: paymentRecords[0]?.paymentDate || expenses[0]?.expenseDate || new Date().toISOString().split('T')[0],
    openingFloat: cleanFloat,
    directCashSalesAmount: directCash,
    customerCreditRecoveriesCashAmount: customerCash,
    totalCashInflows: totalInflows,
    cashSalesRefundsAmount: cashRefunds,
    cashExpensesAmount: cashExpenses,
    totalCashOutflows: totalOutflows,
    netCashFromOperations: netOperations,
    expectedClosingDrawerCash: closingDrawer,
    bankTransferDirectSalesAmount: Math.round(bankDirect * 100) / 100,
    bankTransferCustomerRecoveriesAmount: Math.round(bankCustomer * 100) / 100,
    chequeCustomerRecoveriesAmount: Math.round(chequeCustomer * 100) / 100,
    bankExpensesAmount: bankExpenses,
    totalNonCashInflows: totalNonCash,
    directCashTransactionsCount: directCashCount,
    customerCashTransactionsCount: customerCashCount,
    refundCashTransactionsCount: refundCashCount,
    cashExpenseTransactionsCount: cashExpenseCount,
    nonCashTransactionsCount: nonCashCount,
    cashOutflowRecords,
  };
};

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
console.log('💵 SADIQ BOOK AGENCY — DAILY CASH CLOSING VERIFICATION');
console.log('====================================================\n');

runTest('A.1: Cash sale followed by partial cash refund reduces drawer balance exactly once', () => {
  const openingFloat = 5000.0; // 5,000 opening cash in drawer
  const payments: PaymentDocument[] = [
    // 1. Sale: PKR 2,500 cash sale
    {
      id: 'PAY_INV-001',
      receiptNo: 'REC-INV-001',
      targetType: 'direct_sale',
      referenceId: 'INV-001',
      partyName: 'Counter Customer',
      amount: 2500.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T10:00:00.000Z',
    },
    // 2. Partial Cash Refund: 1 unit returned for PKR 500
    {
      id: 'REF_RET-001',
      receiptNo: 'VOUCHER-RET-001',
      targetType: 'sales_refund',
      referenceId: 'INV-001',
      partyName: 'Counter Customer',
      amount: 500.0,
      paymentMode: 'cash',
      transactionReference: 'RET-001',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T11:30:00.000Z',
    },
  ];

  const result = reconcileCashDrawerRecords(payments, openingFloat);

  assert.equal(result.directCashSalesAmount, 2500.0, 'Direct cash sales must be 2,500');
  assert.equal(result.cashSalesRefundsAmount, 500.0, 'Cash refund must be 500');
  assert.equal(result.netCashFromOperations, 2000.0, 'Net cash from operations must be 2,000');
  assert.equal(result.expectedClosingDrawerCash, 7000.0, 'Closing drawer must be 5,000 + 2,000 = 7,000');
  assert.equal(result.cashOutflowRecords.length, 1, 'Exactly 1 refund outflow voucher logged');
});

runTest('A.2: Multiple refunds against one invoice reduce drawer balance by exact sum', () => {
  const openingFloat = 2000.0;
  const payments: PaymentDocument[] = [
    // Sale: PKR 6,000 cash sale (3 books @ 2,000)
    {
      id: 'PAY_INV-002',
      receiptNo: 'REC-INV-002',
      targetType: 'direct_sale',
      referenceId: 'INV-002',
      partyName: 'Customer Ali',
      amount: 6000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T09:00:00.000Z',
    },
    // First partial refund: 1 book = PKR 2,000
    {
      id: 'REF_RET-002A',
      receiptNo: 'VOUCHER-RET-002A',
      targetType: 'sales_refund',
      referenceId: 'INV-002',
      partyName: 'Customer Ali',
      amount: 2000.0,
      paymentMode: 'cash',
      transactionReference: 'RET-002A',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T12:00:00.000Z',
    },
    // Second partial refund: 1 book = PKR 2,000
    {
      id: 'REF_RET-002B',
      receiptNo: 'VOUCHER-RET-002B',
      targetType: 'sales_refund',
      referenceId: 'INV-002',
      partyName: 'Customer Ali',
      amount: 2000.0,
      paymentMode: 'cash',
      transactionReference: 'RET-002B',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T14:00:00.000Z',
    },
  ];

  const result = reconcileCashDrawerRecords(payments, openingFloat);

  assert.equal(result.directCashSalesAmount, 6000.0);
  assert.equal(result.cashSalesRefundsAmount, 4000.0, 'Two cash refunds must total 4,000');
  assert.equal(result.netCashFromOperations, 2000.0);
  assert.equal(result.expectedClosingDrawerCash, 4000.0, '2,000 float + 2,000 net = 4,000');
  assert.equal(result.refundCashTransactionsCount, 2);
});

runTest('A.3: Credit sale followed by cash refund: Cash leaves drawer, initial credit sale was never in drawer', () => {
  // Scenario: Customer originally purchased on credit (0 payment record in payments collection).
  // Later, store policy permits customer cash refund on return (money leaves the physical drawer).
  const openingFloat = 10000.0;
  const payments: PaymentDocument[] = [
    // Zero direct_sale payment record because it was 100% Udhaar
    // Then customer returns book and manager approves cash payout:
    {
      id: 'REF_RET-CREDIT-001',
      receiptNo: 'VOUCHER-RET-CREDIT-001',
      targetType: 'sales_refund',
      referenceId: 'INV-CREDIT-001',
      partyName: 'Wholesale Partner',
      amount: 1500.0,
      paymentMode: 'cash',
      transactionReference: 'RET-CREDIT-001',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T15:00:00.000Z',
    },
  ];

  const result = reconcileCashDrawerRecords(payments, openingFloat);

  assert.equal(result.directCashSalesAmount, 0, 'No cash sales inflow recorded');
  assert.equal(result.cashSalesRefundsAmount, 1500.0, 'Cash refund correctly logged as outflow');
  assert.equal(result.netCashFromOperations, -1500.0, 'Net cash from operations is -1,500');
  assert.equal(result.expectedClosingDrawerCash, 8500.0, '10,000 opening float - 1,500 outflow = 8,500 in drawer');
});

runTest('A.4: Non-cash payments (Bank Transfer & Cheque) and Credit recoveries are segregated correctly', () => {
  const openingFloat = 0;
  const payments: PaymentDocument[] = [
    // 1. Cash direct sale: PKR 3,000
    {
      id: 'PAY-1',
      receiptNo: 'REC-1',
      targetType: 'direct_sale',
      referenceId: 'INV-1',
      partyName: 'Cash Walk-in',
      amount: 3000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T10:00:00.000Z',
    },
    // 2. Bank transfer direct sale: PKR 5,000 (NOT IN DRAWER)
    {
      id: 'PAY-2',
      receiptNo: 'REC-2',
      targetType: 'direct_sale',
      referenceId: 'INV-2',
      partyName: 'Online Buyer',
      amount: 5000.0,
      paymentMode: 'bank_transfer',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T11:00:00.000Z',
    },
    // 3. Customer Udhaar recovery via Cash: PKR 4,000 (IN DRAWER)
    {
      id: 'PAY-3',
      receiptNo: 'REC-3',
      targetType: 'customer_credit',
      referenceId: 'CUST-1',
      partyName: 'Al-Madina Khata Settlement',
      amount: 4000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T12:00:00.000Z',
    },
    // 4. Customer Udhaar recovery via Cheque: PKR 10,000 (NOT IN DRAWER)
    {
      id: 'PAY-4',
      receiptNo: 'REC-4',
      targetType: 'customer_credit',
      referenceId: 'CUST-2',
      partyName: 'Karachi Academy Cheque',
      amount: 10000.0,
      paymentMode: 'cheque',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T13:00:00.000Z',
    },
    // 5. Cash refund: PKR 1,000 (OUTFLOW FROM DRAWER)
    {
      id: 'REF-1',
      receiptNo: 'VOUCHER-1',
      targetType: 'sales_refund',
      referenceId: 'INV-1',
      partyName: 'Cash Walk-in',
      amount: 1000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-03',
      createdAt: '2026-11-03T14:00:00.000Z',
    },
  ];

  const result = reconcileCashDrawerRecords(payments, openingFloat);

  // Physical Cash Inflows: 3,000 (sale) + 4,000 (Khata cash) = 7,000
  assert.equal(result.totalCashInflows, 7000.0);
  assert.equal(result.directCashSalesAmount, 3000.0);
  assert.equal(result.customerCreditRecoveriesCashAmount, 4000.0);

  // Physical Cash Outflows: 1,000
  assert.equal(result.totalCashOutflows, 1000.0);

  // Net Drawer Cash: 7,000 - 1,000 = 6,000
  assert.equal(result.expectedClosingDrawerCash, 6000.0);

  // Non-Cash Digital / Cheque Total: 5,000 (bank) + 10,000 (cheque) = 15,000
  assert.equal(result.totalNonCashInflows, 15000.0);
  assert.equal(result.bankTransferDirectSalesAmount, 5000.0);
  assert.equal(result.chequeCustomerRecoveriesAmount, 10000.0);
});

// -----------------------------------------------------------------------------
// PART B: STEP 4 CASH CLOSING EXPENSE INTEGRATION TESTS
// -----------------------------------------------------------------------------

runTest('B.1: Opening cash 5,000 + cash sales 3,000 - cash expense 1,000 = closing cash 7,000', () => {
  const openingFloat = 5000.0;
  const payments: MockPaymentDocument[] = [
    {
      id: 'PAY-B1',
      receiptNo: 'REC-B1',
      targetType: 'direct_sale',
      referenceId: 'INV-B1',
      partyName: 'Walk-in Cash',
      amount: 3000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-04',
      createdAt: '2026-11-04T10:00:00.000Z',
    },
  ];

  const expenses: MockExpenseDocument[] = [
    {
      id: 'EXP-B1',
      expenseCategory: 'refreshment',
      title: 'Tea & Refreshment',
      amount: 1000.0,
      paymentMode: 'cash',
      expenseDate: '2026-11-04',
    },
  ];

  const result = reconcileCashDrawerRecords(payments, expenses, openingFloat);

  assert.equal(result.openingFloat, 5000.0);
  assert.equal(result.directCashSalesAmount, 3000.0);
  assert.equal(result.cashExpensesAmount, 1000.0);
  assert.equal(result.totalCashOutflows, 1000.0);
  assert.equal(result.netCashFromOperations, 2000.0, '3,000 inflow - 1,000 outflow = +2,000');
  assert.equal(result.expectedClosingDrawerCash, 7000.0, '5,000 float + 2,000 net = 7,000');
});

runTest('B.2: Opening cash 5,000 + cash sales 3,000 - bank expense 1,000 = closing cash 8,000', () => {
  const openingFloat = 5000.0;
  const payments: MockPaymentDocument[] = [
    {
      id: 'PAY-B2',
      receiptNo: 'REC-B2',
      targetType: 'direct_sale',
      referenceId: 'INV-B2',
      partyName: 'Walk-in Cash',
      amount: 3000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-04',
      createdAt: '2026-11-04T10:00:00.000Z',
    },
  ];

  // Bank transfer expense (e.g. online utility bill): Must NOT touch cash drawer
  const expenses: MockExpenseDocument[] = [
    {
      id: 'EXP-B2',
      expenseCategory: 'electricity',
      title: 'Electric Bill Online',
      amount: 1000.0,
      paymentMode: 'bank_transfer',
      expenseDate: '2026-11-04',
    },
  ];

  const result = reconcileCashDrawerRecords(payments, expenses, openingFloat);

  assert.equal(result.openingFloat, 5000.0);
  assert.equal(result.directCashSalesAmount, 3000.0);
  assert.equal(result.cashExpensesAmount, 0, 'Bank expense must NOT appear as physical cash expense');
  assert.equal(result.bankExpensesAmount, 1000.0, 'Bank expense tracked in banking position');
  assert.equal(result.totalCashOutflows, 0, 'No cash outflow from drawer');
  assert.equal(result.netCashFromOperations, 3000.0);
  assert.equal(result.expectedClosingDrawerCash, 8000.0, '5,000 float + 3,000 cash sales = 8,000 in drawer');
});

runTest('B.3: Opening cash 5,000 + cash sales 3,000 - cash refund 500 - cash expense 1,000 = closing cash 6,500', () => {
  const openingFloat = 5000.0;
  const payments: MockPaymentDocument[] = [
    {
      id: 'PAY-B3',
      receiptNo: 'REC-B3',
      targetType: 'direct_sale',
      referenceId: 'INV-B3',
      partyName: 'Counter Customer',
      amount: 3000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-04',
      createdAt: '2026-11-04T10:00:00.000Z',
    },
    {
      id: 'REF-B3',
      receiptNo: 'VOUCHER-B3',
      targetType: 'sales_refund',
      referenceId: 'INV-B3',
      partyName: 'Counter Customer',
      amount: 500.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-04',
      createdAt: '2026-11-04T11:00:00.000Z',
    },
  ];

  const expenses: MockExpenseDocument[] = [
    {
      id: 'EXP-B3',
      expenseCategory: 'transport',
      title: 'Courier Freight Cash',
      amount: 1000.0,
      paymentMode: 'cash',
      expenseDate: '2026-11-04',
    },
  ];

  const result = reconcileCashDrawerRecords(payments, expenses, openingFloat);

  assert.equal(result.openingFloat, 5000.0);
  assert.equal(result.directCashSalesAmount, 3000.0);
  assert.equal(result.cashSalesRefundsAmount, 500.0);
  assert.equal(result.cashExpensesAmount, 1000.0);
  assert.equal(result.totalCashOutflows, 1500.0, '500 refund + 1,000 expense = 1,500 total outflow');
  assert.equal(result.netCashFromOperations, 1500.0, '3,000 inflow - 1,500 outflow = +1,500');
  assert.equal(result.expectedClosingDrawerCash, 6500.0, '5,000 float + 1,500 net = 6,500');
});

runTest('B.4: Expense edit and deletion correctly change recalculated closing balances', () => {
  const openingFloat = 5000.0;
  const payments: MockPaymentDocument[] = [
    {
      id: 'PAY-B4',
      receiptNo: 'REC-B4',
      targetType: 'direct_sale',
      referenceId: 'INV-B4',
      partyName: 'Counter Customer',
      amount: 3000.0,
      paymentMode: 'cash',
      receivedByUserId: 'cashier-1',
      paymentDate: '2026-11-04',
      createdAt: '2026-11-04T10:00:00.000Z',
    },
  ];

  // 1. Initial State: Cash Expense 1,000 -> Closing Cash 7,000
  let expenseList: MockExpenseDocument[] = [
    {
      id: 'EXP-B4',
      expenseCategory: 'salaries',
      title: 'Daily Helper Cash',
      amount: 1000.0,
      paymentMode: 'cash',
      expenseDate: '2026-11-04',
    },
  ];

  const initialCalc = reconcileCashDrawerRecords(payments, expenseList, openingFloat);
  assert.equal(initialCalc.cashExpensesAmount, 1000.0);
  assert.equal(initialCalc.expectedClosingDrawerCash, 7000.0);

  // 2. Simulated Edit: Cash Expense edited from 1,000 to 1,500
  expenseList = [
    {
      id: 'EXP-B4',
      expenseCategory: 'salaries',
      title: 'Daily Helper Cash (Updated)',
      amount: 1500.0,
      paymentMode: 'cash',
      expenseDate: '2026-11-04',
    },
  ];

  const editedCalc = reconcileCashDrawerRecords(payments, expenseList, openingFloat);
  assert.equal(editedCalc.cashExpensesAmount, 1500.0);
  assert.equal(editedCalc.expectedClosingDrawerCash, 6500.0, '5,000 + 3,000 - 1,500 = 6,500');

  // 3. Simulated Deletion: Cash Expense deleted (empty list)
  expenseList = [];

  const deletedCalc = reconcileCashDrawerRecords(payments, expenseList, openingFloat);
  assert.equal(deletedCalc.cashExpensesAmount, 0);
  assert.equal(deletedCalc.expectedClosingDrawerCash, 8000.0, '5,000 + 3,000 - 0 = 8,000');
});

Promise.all(pendingPromises).then(() => {
  console.log(`\n====================================================`);
  console.log(`📊 DAILY CASH CLOSING SUMMARY: ${passedTests} PASSED, 0 FAILED`);
  console.log(`====================================================\n`);
});
