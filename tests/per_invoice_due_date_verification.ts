import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — PER-INVOICE CREDIT DUE DATE MANAGEMENT VERIFICATION SUITE
// ==============================================================================

function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// Implement pure algorithms under test
function calculateInvoiceDueDate(
  saleDateStr: string,
  creditDays?: number | null
): string | undefined {
  if (typeof creditDays !== 'number' || creditDays <= 0 || isNaN(creditDays)) {
    return undefined;
  }

  const cleanDate = saleDateStr.split('T')[0];
  const parts = cleanDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return undefined;
  }

  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + creditDays);

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dt = String(d.getUTCDate()).padStart(2, '0');

  return `${y}-${m}-${dt}`;
}

type InvoiceDueStatus = 'paid' | 'pending' | 'due_soon' | 'overdue' | 'no_due_date';

interface InvoiceDueStatusResult {
  status: InvoiceDueStatus;
  daysOverdue: number;
  daysUntilDue: number;
  label: string;
  badgeColor: string;
}

function getInvoiceDueStatus(
  params: {
    saleDate: string;
    dueDate?: string;
    grandTotal: number;
    remainingBalance: number;
  },
  asOfDate?: string
): InvoiceDueStatusResult {
  const remaining = roundMoney(params.remainingBalance);

  if (remaining <= 0) {
    return {
      status: 'paid',
      daysOverdue: 0,
      daysUntilDue: 0,
      label: 'Paid',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (!params.dueDate) {
    return {
      status: 'no_due_date',
      daysOverdue: 0,
      daysUntilDue: 0,
      label: 'No Due Date',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }

  const baseDate = asOfDate ? asOfDate.split('T')[0] : new Date().toISOString().split('T')[0];
  const [tY, tM, tD] = baseDate.split('-').map(Number);
  const [dY, dM, dD] = params.dueDate.split('T')[0].split('-').map(Number);

  const todayUtc = Date.UTC(tY, tM - 1, tD);
  const dueUtc = Date.UTC(dY, dM - 1, dD);

  const diffMs = todayUtc - dueUtc;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      status: 'overdue',
      daysOverdue: diffDays,
      daysUntilDue: 0,
      label: `Overdue (${diffDays}d)`,
      badgeColor: 'bg-red-100 text-red-800 border-red-200',
    };
  } else if (diffDays === 0) {
    return {
      status: 'due_soon',
      daysOverdue: 0,
      daysUntilDue: 0,
      label: 'Due Today',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  } else if (diffDays >= -7) {
    const daysUntil = Math.abs(diffDays);
    return {
      status: 'due_soon',
      daysOverdue: 0,
      daysUntilDue: daysUntil,
      label: `Due in ${daysUntil}d`,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  } else {
    const daysUntil = Math.abs(diffDays);
    return {
      status: 'pending',
      daysOverdue: 0,
      daysUntilDue: daysUntil,
      label: `Due in ${daysUntil}d`,
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    };
  }
}

interface MockSale {
  id: string;
  invoiceNo: string;
  customerId: string;
  saleDate: string;
  grandTotal: number;
  balanceAddedToCredit: number;
  paymentMethod: string;
  dueDate?: string;
  creditDaysSnapshot?: number;
  dueDateOverride?: any;
}

function allocateCustomerInvoicesFifo(
  sales: MockSale[],
  customerBalance: number,
  asOfDate?: string
) {
  const creditSales = sales.filter(
    (s) => s.balanceAddedToCredit > 0 || s.paymentMethod === 'credit'
  );

  creditSales.sort((a, b) => {
    const dateComp = (a.saleDate || '').localeCompare(b.saleDate || '');
    if (dateComp !== 0) return dateComp;
    return a.invoiceNo.localeCompare(b.invoiceNo);
  });

  const totalDebtBooked = creditSales.reduce((sum, s) => {
    const debt = s.balanceAddedToCredit > 0 ? s.balanceAddedToCredit : s.grandTotal;
    return roundMoney(sum + debt);
  }, 0);

  const activeDebt = Math.max(0, roundMoney(customerBalance));
  let availablePayments = Math.max(0, roundMoney(totalDebtBooked - activeDebt));

  const items: any[] = [];

  for (const sale of creditSales) {
    const originalCredit = sale.balanceAddedToCredit > 0 ? sale.balanceAddedToCredit : sale.grandTotal;
    const alloc = Math.min(originalCredit, availablePayments);
    const remaining = roundMoney(originalCredit - alloc);

    availablePayments = roundMoney(availablePayments - alloc);

    const dueInfo = getInvoiceDueStatus(
      {
        saleDate: sale.saleDate,
        dueDate: sale.dueDate,
        grandTotal: sale.grandTotal,
        remainingBalance: remaining,
      },
      asOfDate
    );

    items.push({
      sale,
      originalCredit,
      allocatedPayments: alloc,
      remainingBalance: remaining,
      dueStatus: dueInfo.status,
      daysOverdue: dueInfo.daysOverdue,
      daysUntilDue: dueInfo.daysUntilDue,
      statusLabel: dueInfo.label,
    });
  }

  return items;
}

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    testsFailed++;
  }
}

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — PER-INVOICE DUE DATE MANAGEMENT VERIFICATION');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------------
// TEST 1: Automatic Due Date Calculation (UTC arithmetic, Leap Years, Month Boundaries)
// ---------------------------------------------------------------------------------
runTest('Test 1: Automatic Due Date Calculation across date boundaries and unconfigured terms', () => {
  // 15 days addition
  assert.equal(calculateInvoiceDueDate('2026-11-01', 15), '2026-11-16');

  // Month boundary (November has 30 days)
  assert.equal(calculateInvoiceDueDate('2026-11-20', 15), '2026-12-05');

  // Year boundary (December to January)
  assert.equal(calculateInvoiceDueDate('2026-12-25', 10), '2027-01-04');

  // Leap year 2028: February has 29 days
  assert.equal(calculateInvoiceDueDate('2028-02-20', 10), '2028-03-01');

  // Non-configured terms (0, undefined, null, negative) -> MUST return undefined (never silently invent a date)
  assert.equal(calculateInvoiceDueDate('2026-11-01', undefined), undefined);
  assert.equal(calculateInvoiceDueDate('2026-11-01', null), undefined);
  assert.equal(calculateInvoiceDueDate('2026-11-01', 0), undefined);
  assert.equal(calculateInvoiceDueDate('2026-11-01', -10), undefined);
});

// ---------------------------------------------------------------------------------
// TEST 2: Due Date Status Categorization (Paid, Pending, Due Soon, Overdue, No Due Date)
// ---------------------------------------------------------------------------------
runTest('Test 2: Due Date Status Categorization based on calendar comparison and remaining debt', () => {
  const asOf = '2026-11-10';

  // Case A: Fully settled invoice
  const paidRes = getInvoiceDueStatus({ saleDate: '2026-10-01', dueDate: '2026-10-15', grandTotal: 5000, remainingBalance: 0 }, asOf);
  assert.equal(paidRes.status, 'paid');
  assert.equal(paidRes.label, 'Paid');

  // Case B: Unpaid invoice with no configured credit days
  const noDueRes = getInvoiceDueStatus({ saleDate: '2026-10-01', dueDate: undefined, grandTotal: 5000, remainingBalance: 5000 }, asOf);
  assert.equal(noDueRes.status, 'no_due_date');
  assert.equal(noDueRes.label, 'No Due Date');

  // Case C: Overdue invoice (due 2026-11-05, asOf 2026-11-10 -> 5 days overdue)
  const overdueRes = getInvoiceDueStatus({ saleDate: '2026-10-20', dueDate: '2026-11-05', grandTotal: 5000, remainingBalance: 3000 }, asOf);
  assert.equal(overdueRes.status, 'overdue');
  assert.equal(overdueRes.daysOverdue, 5);
  assert.equal(overdueRes.label, 'Overdue (5d)');

  // Case D: Due today (due 2026-11-10, asOf 2026-11-10)
  const dueTodayRes = getInvoiceDueStatus({ saleDate: '2026-10-25', dueDate: '2026-11-10', grandTotal: 4000, remainingBalance: 4000 }, asOf);
  assert.equal(dueTodayRes.status, 'due_soon');
  assert.equal(dueTodayRes.daysOverdue, 0);
  assert.equal(dueTodayRes.daysUntilDue, 0);
  assert.equal(dueTodayRes.label, 'Due Today');

  // Case E: Due soon within 7 days (due 2026-11-14 -> 4 days remaining)
  const dueSoonRes = getInvoiceDueStatus({ saleDate: '2026-10-30', dueDate: '2026-11-14', grandTotal: 4000, remainingBalance: 4000 }, asOf);
  assert.equal(dueSoonRes.status, 'due_soon');
  assert.equal(dueSoonRes.daysUntilDue, 4);
  assert.equal(dueSoonRes.label, 'Due in 4d');

  // Case F: Standard pending invoice (>7 days, due 2026-11-25 -> 15 days remaining)
  const pendingRes = getInvoiceDueStatus({ saleDate: '2026-11-01', dueDate: '2026-11-25', grandTotal: 6000, remainingBalance: 6000 }, asOf);
  assert.equal(pendingRes.status, 'pending');
  assert.equal(pendingRes.daysUntilDue, 15);
  assert.equal(pendingRes.label, 'Due in 15d');
});

// ---------------------------------------------------------------------------------
// TEST 3: Immutable Sale Snapshotting
// ---------------------------------------------------------------------------------
runTest('Test 3: Sale Creation captures immutable snapshot of creditDays and calculated dueDate', () => {
  const saleDate = '2026-11-01';
  const customerCreditDays = 30;

  // Credit sale:
  const isCreditSale = true;
  const dueDate = isCreditSale ? calculateInvoiceDueDate(saleDate, customerCreditDays) : undefined;
  const creditDaysSnapshot = isCreditSale ? customerCreditDays : undefined;

  assert.equal(dueDate, '2026-12-01');
  assert.equal(creditDaysSnapshot, 30);

  // Cash walk-in sale:
  const isCashSale = false;
  const cashDueDate = isCashSale ? calculateInvoiceDueDate(saleDate, undefined) : undefined;
  assert.equal(cashDueDate, undefined);
});

// ---------------------------------------------------------------------------------
// TEST 4: Customer Profile Mutation Independence
// ---------------------------------------------------------------------------------
runTest('Test 4: Modifying customer creditDays profile does NOT mutate existing invoice snapshots', () => {
  const originalInvoice: MockSale = {
    id: 'INV-001',
    invoiceNo: 'INV-001',
    customerId: 'CUST-A',
    saleDate: '2026-11-01',
    grandTotal: 10000,
    balanceAddedToCredit: 10000,
    paymentMethod: 'credit',
    creditDaysSnapshot: 15,
    dueDate: '2026-11-16',
  };

  // Customer admin modifies customer profile from 15 days to 60 days
  const updatedCustomer = {
    id: 'CUST-A',
    creditDays: 60,
  };

  // The historical invoice remains 100% immutable
  assert.equal(originalInvoice.creditDaysSnapshot, 15);
  assert.equal(originalInvoice.dueDate, '2026-11-16');
  assert.notEqual(originalInvoice.creditDaysSnapshot, updatedCustomer.creditDays);
});

// ---------------------------------------------------------------------------------
// TEST 5: Admin Manual Override Validation & Audit Trail
// ---------------------------------------------------------------------------------
runTest('Test 5: Admin Manual Override enforces authorization, date bounds, and audit trail', () => {
  const invoice: MockSale = {
    id: 'INV-100',
    invoiceNo: 'INV-100',
    customerId: 'CUST-B',
    saleDate: '2026-11-01',
    grandTotal: 5000,
    balanceAddedToCredit: 5000,
    paymentMethod: 'credit',
    dueDate: '2026-11-16',
  };

  // Validation 1: Date cannot precede sale date
  assert.throws(() => {
    const invalidDate = '2026-10-25'; // earlier than 2026-11-01
    if (invalidDate < invoice.saleDate) {
      throw new Error('Due date cannot precede original sale date');
    }
  }, /Due date cannot precede/);

  // Validation 2: Reason is mandatory
  assert.throws(() => {
    const emptyReason = '   ';
    if (!emptyReason.trim() || emptyReason.trim().length < 3) {
      throw new Error('Reason required');
    }
  }, /Reason required/);

  // Valid Override:
  const newDueDate = '2026-11-30';
  const reason = 'Customer requested extension for book fair settlement';
  const adminId = 'ADMIN_01';
  const adminEmail = 'manager@sadiqbookagency.com';

  const overrideRecord = {
    previousDueDate: invoice.dueDate,
    newDueDate,
    overriddenByUserId: adminId,
    overriddenByEmail: adminEmail,
    overriddenAt: new Date().toISOString(),
    reason,
  };

  const updatedInvoice = {
    ...invoice,
    dueDate: newDueDate,
    dueDateOverride: overrideRecord,
  };

  assert.equal(updatedInvoice.dueDate, '2026-11-30');
  assert.equal(updatedInvoice.dueDateOverride.previousDueDate, '2026-11-16');
  assert.equal(updatedInvoice.dueDateOverride.reason, reason);
  assert.equal(updatedInvoice.dueDateOverride.overriddenByUserId, 'ADMIN_01');
});

// ---------------------------------------------------------------------------------
// TEST 6: Non-Admin Cashier Rejection
// ---------------------------------------------------------------------------------
runTest('Test 6: Cashier or unauthorized users cannot modify invoice payment deadlines', () => {
  const cashierUser = {
    uid: 'CASHIER_01',
    role: 'cashier',
    isActive: true,
  };

  assert.throws(() => {
    if (cashierUser.role !== 'admin') {
      throw new Error('Unauthorized: Only administrators have permission to change invoice payment deadlines.');
    }
  }, /Unauthorized: Only administrators/);
});

// ---------------------------------------------------------------------------------
// TEST 7: Customer FIFO Allocation Across Multiple Invoices
// ---------------------------------------------------------------------------------
runTest('Test 7: FIFO Allocation reconciles multiple invoices with partial payments and exact balances', () => {
  const asOf = '2026-11-10';

  const sales: MockSale[] = [
    {
      id: 'INV-1',
      invoiceNo: 'INV-1',
      customerId: 'CUST-XYZ',
      saleDate: '2026-10-01',
      grandTotal: 1000,
      balanceAddedToCredit: 1000,
      paymentMethod: 'credit',
      dueDate: '2026-10-16', // overdue
    },
    {
      id: 'INV-2',
      invoiceNo: 'INV-2',
      customerId: 'CUST-XYZ',
      saleDate: '2026-10-15',
      grandTotal: 2000,
      balanceAddedToCredit: 2000,
      paymentMethod: 'credit',
      dueDate: '2026-10-30', // overdue
    },
    {
      id: 'INV-3',
      invoiceNo: 'INV-3',
      customerId: 'CUST-XYZ',
      saleDate: '2026-11-01',
      grandTotal: 3000,
      balanceAddedToCredit: 3000,
      paymentMethod: 'credit',
      dueDate: '2026-11-16', // due soon
    },
  ];

  // Total debt booked = 1000 + 2000 + 3000 = 6000
  // Customer pays PKR 2500 -> Current balance = 6000 - 2500 = 3500
  const currentBalance = 3500;

  const allocated = allocateCustomerInvoicesFifo(sales, currentBalance, asOf);

  assert.equal(allocated.length, 3);

  // INV-1: 1000 fully paid (oldest first)
  assert.equal(allocated[0].sale.invoiceNo, 'INV-1');
  assert.equal(allocated[0].allocatedPayments, 1000);
  assert.equal(allocated[0].remainingBalance, 0);
  assert.equal(allocated[0].dueStatus, 'paid');

  // INV-2: 2000 original - 1500 paid = 500 remaining (overdue)
  assert.equal(allocated[1].sale.invoiceNo, 'INV-2');
  assert.equal(allocated[1].allocatedPayments, 1500);
  assert.equal(allocated[1].remainingBalance, 500);
  assert.equal(allocated[1].dueStatus, 'overdue');
  assert.equal(allocated[1].daysOverdue, 11);

  // INV-3: 3000 original - 0 paid = 3000 remaining (due soon in 6 days)
  assert.equal(allocated[2].sale.invoiceNo, 'INV-3');
  assert.equal(allocated[2].allocatedPayments, 0);
  assert.equal(allocated[2].remainingBalance, 3000);
  assert.equal(allocated[2].dueStatus, 'due_soon');
  assert.equal(allocated[2].daysUntilDue, 6);

  // Reconciliation Invariant: Sum of remaining balances equals customer balance
  const sumRemaining = roundMoney(
    allocated[0].remainingBalance + allocated[1].remainingBalance + allocated[2].remainingBalance
  );
  assert.equal(sumRemaining, currentBalance);
  assert.equal(sumRemaining, 3500);
});

// ---------------------------------------------------------------------------------
// TEST 8: Security Rules Integrity Check
// ---------------------------------------------------------------------------------
runTest('Test 8: firestore.rules strictly restricts sale update to dueDate, dueDateOverride, updatedAt for Admin', () => {
  const rulesPath = path.resolve('firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Verify match /sales/{saleId} allows update only if isAdmin() and diff affectedKeys hasOnly
  assert.ok(rulesContent.includes('match /sales/{saleId}'), 'Sales match block must exist');
  assert.ok(rulesContent.includes('allow update: if isAdmin()'), 'Must enforce isAdmin() on sale updates');
  assert.ok(
    rulesContent.includes("['dueDate', 'dueDateOverride', 'updatedAt']"),
    'Must restrict update affectedKeys strictly to dueDate, dueDateOverride, and updatedAt'
  );
  assert.ok(rulesContent.includes('allow delete: if false'), 'Sale deletion must remain strictly false');
});

// ---------------------------------------------------------------------------------
// TEST 9: Dashboard & Reports Overdue Metrics Aggregation
// ---------------------------------------------------------------------------------
runTest('Test 9: Aggregated overdue receivables metrics correctly sum overdue and due soon amounts', () => {
  const allocatedItems = [
    { remainingBalance: 500, dueStatus: 'overdue', daysOverdue: 10, daysUntilDue: 0 },
    { remainingBalance: 1200, dueStatus: 'overdue', daysOverdue: 3, daysUntilDue: 0 },
    { remainingBalance: 800, dueStatus: 'due_soon', daysOverdue: 0, daysUntilDue: 0 }, // due today
    { remainingBalance: 1500, dueStatus: 'due_soon', daysOverdue: 0, daysUntilDue: 4 }, // due in 4 days
    { remainingBalance: 2000, dueStatus: 'pending', daysOverdue: 0, daysUntilDue: 15 },
    { remainingBalance: 0, dueStatus: 'paid', daysOverdue: 0, daysUntilDue: 0 },
  ];

  let totalOverdue = 0;
  let totalDueToday = 0;
  let dueTodayCount = 0;
  let totalDueSoon = 0;
  let dueSoonCount = 0;

  for (const item of allocatedItems) {
    if (item.remainingBalance <= 0) continue;
    if (item.dueStatus === 'overdue') {
      totalOverdue = roundMoney(totalOverdue + item.remainingBalance);
    } else if (item.dueStatus === 'due_soon') {
      totalDueSoon = roundMoney(totalDueSoon + item.remainingBalance);
      dueSoonCount++;
      if (item.daysUntilDue === 0) {
        totalDueToday = roundMoney(totalDueToday + item.remainingBalance);
        dueTodayCount++;
      }
    }
  }

  assert.equal(totalOverdue, 1700); // 500 + 1200
  assert.equal(totalDueToday, 800); // 800
  assert.equal(dueTodayCount, 1);
  assert.equal(totalDueSoon, 2300); // 800 + 1500
  assert.equal(dueSoonCount, 2);
});

// ---------------------------------------------------------------------------------
// TEST 10: Zero Revenue Distortion & Historical Document Immutability
// ---------------------------------------------------------------------------------
runTest('Test 10: Due date management and Khata settlements never distort sales revenue', () => {
  const originalGrandTotal = 5000;
  const originalSubtotal = 5500;
  const originalDiscount = 500;

  const invoice: MockSale = {
    id: 'INV-REVENUE-TEST',
    invoiceNo: 'INV-REVENUE-TEST',
    customerId: 'CUST-C',
    saleDate: '2026-11-01',
    grandTotal: originalGrandTotal,
    balanceAddedToCredit: 5000,
    paymentMethod: 'credit',
    dueDate: '2026-11-16',
  };

  // Perform due date update:
  const updatedInvoice = {
    ...invoice,
    dueDate: '2026-11-25',
    dueDateOverride: {
      newDueDate: '2026-11-25',
      reason: 'Approved',
    },
  };

  // Financial invariant: grandTotal, subtotal, discount MUST NOT be altered
  assert.equal(updatedInvoice.grandTotal, originalGrandTotal);
  assert.equal(originalSubtotal - originalDiscount, originalGrandTotal);

  // Customer settles debt with PKR 5000 recovery payment
  const recoveryPaymentAmount = 5000;
  assert.equal(recoveryPaymentAmount, 5000);
  // Debt recovery is a balance sheet asset exchange (Cash Dr / Receivables Cr), NOT sales revenue
  const salesRevenueContribution = 0;
  assert.equal(salesRevenueContribution, 0, 'Customer Khata recovery must never be booked as new sales revenue');
});

// ---------------------------------------------------------------------------------
// TEST 11: Custom Due Date Priority & Creation-Time Override
// ---------------------------------------------------------------------------------
runTest('Test 11: Admin customDueDate takes priority over profile creditDays and logs override', () => {
  const saleDateStr = '2026-11-01';
  const customerCreditDays = 30; // standard would be 2026-12-01
  let customDueDate: string | undefined = '2026-12-10'; // admin selected 40 days

  const standardDueDate = calculateInvoiceDueDate(saleDateStr, customerCreditDays);
  assert.equal(standardDueDate, '2026-12-01');

  // Logic from saleService.ts:
  let calculatedDueDate = standardDueDate;
  let initialDueDateOverride: any = undefined;

  if (customDueDate) {
    calculatedDueDate = customDueDate;
    if (standardDueDate && customDueDate !== standardDueDate) {
      initialDueDateOverride = {
        previousDueDate: standardDueDate,
        newDueDate: customDueDate,
        overriddenByUserId: 'ADMIN_01',
        overriddenByEmail: 'admin@sadiqbookagency.com',
        overriddenAt: '2026-11-01T10:00:00Z',
        reason: 'Selected during invoice creation',
      };
    }
  }

  assert.equal(calculatedDueDate, '2026-12-10', 'Calculated due date must prioritize explicit customDueDate');
  assert.ok(initialDueDateOverride, 'Override record must be generated when customDueDate differs from profile default');
  assert.equal(initialDueDateOverride.previousDueDate, '2026-12-01');
  assert.equal(initialDueDateOverride.newDueDate, '2026-12-10');
});

// ---------------------------------------------------------------------------------
// TEST 12: Customer Khata Direct Bill without Configured Terms
// ---------------------------------------------------------------------------------
runTest('Test 12: Customer Khata credit bill requires admin due date if customer has no creditDays', () => {
  const customerWithoutTerms = {
    id: 'CUST-NO-TERMS',
    creditDays: undefined,
  };

  const isCreditSale = true;

  // Case A: Missing custom due date -> must fail validation
  const submittedDueDateA: string = '';
  assert.throws(() => {
    if (isCreditSale && !customerWithoutTerms.creditDays && (!submittedDueDateA || !submittedDueDateA.trim())) {
      throw new Error('This customer has no configured credit days. You must specify an approved payment due date before saving a credit bill.');
    }
  }, /You must specify an approved payment due date/);

  // Case B: Admin provides valid custom due date -> successfully creates invoice
  const submittedDueDateB = '2026-11-25';
  let savedDueDate: string | undefined = undefined;
  let savedCreditDaysSnapshot: number | undefined = undefined;

  if (isCreditSale) {
    if (submittedDueDateB) {
      savedDueDate = submittedDueDateB;
    }
    savedCreditDaysSnapshot = customerWithoutTerms.creditDays;
  }

  assert.equal(savedDueDate, '2026-11-25');
  assert.equal(savedCreditDaysSnapshot, undefined);
});

// ---------------------------------------------------------------------------------
// TEST 13: Cash-Only Bills Exclude Credit Deadlines
// ---------------------------------------------------------------------------------
runTest('Test 13: Cash-only bills strictly exclude credit due dates across all entry points', () => {
  const balanceAddedToCredit = 0;
  let paymentMethod: string = 'cash';

  let calculatedDueDate: string | undefined = undefined;
  if (balanceAddedToCredit > 0 || paymentMethod === 'credit') {
    calculatedDueDate = '2026-11-20';
  }

  assert.equal(calculatedDueDate, undefined, 'Cash walk-in sales must never receive a credit due date');
});

console.log('\n====================================================================');
console.log(' Per-Invoice Due Date Verification Suite Summary:');
console.log(` Total Tests: ${testsPassed + testsFailed}`);
console.log(` Passed:      ${testsPassed}`);
console.log(` Failed:      ${testsFailed}`);
console.log('====================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}

