import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { PaymentDocument, ExpenseDocument } from '../types/database';

export interface DailyCashReconciliation {
  date: string; // YYYY-MM-DD
  openingFloat: number;

  // 1. Physical Cash Inflows
  directCashSalesAmount: number; // targetType: 'direct_sale', paymentMode: 'cash'
  customerCreditRecoveriesCashAmount: number; // targetType: 'customer_credit', paymentMode: 'cash'
  totalCashInflows: number; // directCashSalesAmount + customerCreditRecoveriesCashAmount

  // 2. Physical Cash Outflows
  cashSalesRefundsAmount: number; // targetType: 'sales_refund', paymentMode: 'cash'
  cashExpensesAmount: number; // paymentMode: 'cash' from expenses collection
  totalCashOutflows: number; // cashSalesRefundsAmount + cashExpensesAmount

  // 3. Physical Cash Position
  netCashFromOperations: number; // totalCashInflows - totalCashOutflows
  expectedClosingDrawerCash: number; // openingFloat + netCashFromOperations

  // 4. Non-Cash Digital / Banking (Tracked separately, NOT in physical drawer)
  bankTransferDirectSalesAmount: number;
  bankTransferCustomerRecoveriesAmount: number;
  chequeCustomerRecoveriesAmount: number;
  bankExpensesAmount: number; // paymentMode: 'bank_transfer' from expenses collection
  totalNonCashInflows: number;

  // 5. Transaction Counts for Reconciliation
  directCashTransactionsCount: number;
  customerCashTransactionsCount: number;
  refundCashTransactionsCount: number;
  cashExpenseTransactionsCount: number;
  nonCashTransactionsCount: number;

  // Breakdown items for cash drawer audit log
  cashOutflowRecords: {
    receiptNo: string;
    referenceId: string;
    amount: number;
    type?: 'refund' | 'expense';
    notes?: string;
  }[];
}

// In-Memory Closing Cache (TTL: 5 minutes)
const closingCache = new Map<string, { data: DailyCashReconciliation; timestamp: number }>();
const CLOSING_CACHE_TTL_MS = 5 * 60 * 1000;

export const invalidateClosingCache = (): void => {
  closingCache.clear();
};

/**
 * Computes the Daily Cash Reconciliation / Drawer Closing for a specific date.
 * Strict Accounting Invariants:
 * 1. Physical Cash Inflows include direct cash sales, partial cash payments, and cash Khata repayments.
 * 2. Physical Cash Outflows include cash sales refunds AND cash operating expenses (deducted exactly once).
 * 3. Credit sales (Udhaar) and ledger-only credit deductions are EXCLUDED from the physical cash drawer.
 * 4. Digital/Bank transfers and cheques are EXCLUDED from physical cash drawer and tracked separately.
 * 5. Bank-transfer expenses are EXCLUDED from physical drawer cash and tracked in banking position.
 */
export const calculateDailyCashClosing = async (
  closingDate: string,
  openingFloat = 0
): Promise<DailyCashReconciliation> => {
  const cleanDate = closingDate.split('T')[0];
  const roundedFloat = Math.round(openingFloat * 100) / 100;
  const cacheKey = `${cleanDate}_${roundedFloat}`;

  const cached = closingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CLOSING_CACHE_TTL_MS) {
    return cached.data;
  }

  const defaultResult: DailyCashReconciliation = {
    date: cleanDate,
    openingFloat: roundedFloat,
    directCashSalesAmount: 0,
    customerCreditRecoveriesCashAmount: 0,
    totalCashInflows: 0,
    cashSalesRefundsAmount: 0,
    cashExpensesAmount: 0,
    totalCashOutflows: 0,
    netCashFromOperations: 0,
    expectedClosingDrawerCash: roundedFloat,
    bankTransferDirectSalesAmount: 0,
    bankTransferCustomerRecoveriesAmount: 0,
    chequeCustomerRecoveriesAmount: 0,
    bankExpensesAmount: 0,
    totalNonCashInflows: 0,
    directCashTransactionsCount: 0,
    customerCashTransactionsCount: 0,
    refundCashTransactionsCount: 0,
    cashExpenseTransactionsCount: 0,
    nonCashTransactionsCount: 0,
    cashOutflowRecords: [],
  };

  if (!db) return defaultResult;

  // 1. Fetch all payment records for this specific payment date (bounded query)
  const qPayments = query(
    collection(db, 'payments'),
    where('paymentDate', '==', cleanDate),
    limit(500)
  );

  // 2. Fetch all expense records for this specific expense date (bounded query)
  const qExpenses = query(
    collection(db, 'expenses'),
    where('expenseDate', '==', cleanDate),
    limit(500)
  );

  const [paymentSnap, expenseSnap] = await Promise.all([
    getDocs(qPayments),
    getDocs(qExpenses),
  ]);

  const paymentRecords: PaymentDocument[] = paymentSnap.docs.map(
    (d) => ({ ...(d.data() as PaymentDocument), id: d.id })
  );

  const expenseRecords: ExpenseDocument[] = expenseSnap.docs.map(
    (d) => ({ ...(d.data() as ExpenseDocument), id: d.id })
  );

  const result = reconcileCashDrawerRecords(paymentRecords, expenseRecords, roundedFloat);
  result.date = cleanDate;

  closingCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
};

/**
 * Pure calculation helper for in-memory reconciliation (reproducible testing).
 * Supports both signatures:
 * - reconcileCashDrawerRecords(payments, expenses, openingFloat)
 * - reconcileCashDrawerRecords(payments, openingFloat) [backwards-compatible]
 */
export const reconcileCashDrawerRecords = (
  paymentRecords: PaymentDocument[],
  expensesOrFloat: ExpenseDocument[] | number = [],
  openingFloat = 0
): DailyCashReconciliation => {
  let expenses: ExpenseDocument[] = [];
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

  // Process Payments
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

  // Process Operating Expenses
  for (const exp of expenses) {
    const amount = Number(exp.amount) || 0;

    if (exp.paymentMode === 'cash') {
      cashExpenses += amount;
      cashExpenseCount++;
      cashOutflowRecords.push({
        receiptNo: exp.referenceNo || `EXP-${exp.id.slice(0, 8)}`,
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

  const refDate =
    paymentRecords[0]?.paymentDate ||
    expenses[0]?.expenseDate ||
    new Date().toISOString().split('T')[0];

  return {
    date: refDate,
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
