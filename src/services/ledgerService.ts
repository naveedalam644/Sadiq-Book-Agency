import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  startAfter,
  runTransaction,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  CustomerDocument,
  CustomerLedgerDocument,
  PaymentDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';

export interface PaginatedLedgerResult {
  entries: CustomerLedgerDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const LEDGER_PAGE_SIZE = 25;

export interface RecordCustomerPaymentInput {
  customerId: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer' | 'cheque';
  transactionReference?: string;
  notes?: string;
  paymentDate?: string;
  receiptNo?: string;
}

/**
 * ---------------------------------------------------------------------------------
 * FIRESTORE COST ACCOUNTING:
 * Operation: Record Customer Khata Payment
 * Transaction Reads: Exactly 1 document read (customers/{customerId})
 * Transaction Writes: Exactly 3 writes (customers update + customerLedger + payments)
 * Audit Logs: 1 write (asynchronous outside transaction)
 * Total Reads: 1 | Total Writes: 4
 * ---------------------------------------------------------------------------------
 */
export const recordCustomerPaymentTransaction = async (
  input: RecordCustomerPaymentInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<{
  newBalance: number;
  receiptNo: string;
  ledgerEntryId: string;
  paymentId: string;
}> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!input.customerId) throw new Error('Customer ID is required');

  const paymentAmount = Number(input.amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Payment amount must be a positive number');
  }

  const customerRef = doc(db, 'customers', input.customerId);
  const ledgerRef = doc(collection(db, 'customerLedger'));
  const paymentRef = doc(collection(db, 'payments'));
  const now = new Date().toISOString();
  const paymentDate = input.paymentDate || now.split('T')[0];

  const receiptNo =
    input.receiptNo?.trim() ||
    `RCP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  let finalBalance = 0;
  let customerName = 'Customer';

  await runTransaction(db, async (transaction) => {
    // 1. Transaction Read: Read customer document ONLY ONCE
    const customerSnap = await transaction.get(customerRef);
    if (!customerSnap.exists()) {
      throw new Error(`Customer with ID ${input.customerId} not found.`);
    }

    const customerData = customerSnap.data() as CustomerDocument;
    customerName = customerData.name;
    const previousBalance = Number(customerData.currentBalance) || 0;

    // Credit payment decreases customer's Udhaar debt
    finalBalance = Math.round((previousBalance - paymentAmount) * 100) / 100;

    // 2. Transaction Write 1: Update customer running balance atomically
    transaction.update(customerRef, {
      currentBalance: finalBalance,
      updatedAt: now,
    });

    // 3. Transaction Write 2: Create immutable double-entry ledger record
    const ledgerEntry: CustomerLedgerDocument = {
      id: ledgerRef.id,
      customerId: input.customerId,
      customerName: customerData.shopName || customerData.name,
      entryType: 'credit', // Credit = Payment received, decreases debt
      referenceReceiptNo: receiptNo,
      description: input.notes?.trim()
        ? `Payment Received: ${input.notes.trim()}`
        : `Khata Payment Received (${input.paymentMode.replace('_', ' ').toUpperCase()})`,
      amount: paymentAmount,
      runningBalance: finalBalance,
      recordedByUserId: userId,
      recordedByEmail: userEmail,
      date: paymentDate,
      createdAt: now,
    };
    transaction.set(ledgerRef, ledgerEntry);

    // 4. Transaction Write 3: Create immutable payment receipt
    const paymentDoc: PaymentDocument = {
      id: paymentRef.id,
      receiptNo,
      targetType: 'customer_credit',
      referenceId: input.customerId,
      partyName: customerData.shopName || customerData.name,
      amount: paymentAmount,
      paymentMode: input.paymentMode,
      transactionReference: input.transactionReference?.trim() || '',
      receivedByUserId: userId,
      paymentDate,
      notes: input.notes?.trim() || '',
      createdAt: now,
    };
    transaction.set(paymentRef, paymentDoc);
  });

  // Asynchronous Audit Log
  await logAuditEvent(
    'RECORD_CUSTOMER_PAYMENT',
    'customerLedger',
    `Recorded payment of PKR ${paymentAmount} for ${customerName}. New balance: PKR ${finalBalance}`,
    receiptNo,
    userId,
    userEmail
  );

  try {
    const { invalidateFinancialReportsCache } = await import('./financialReportService');
    invalidateFinancialReportsCache();
  } catch {
    // Graceful fallback for non-browser or test runner environments
  }

  try {
    const { syncCustomerPortal } = await import('./customerPortalService');
    syncCustomerPortal(input.customerId).catch((portalErr) =>
      console.warn('Customer portal sync notice after payment:', portalErr)
    );
  } catch {
    // Graceful fallback
  }

  return {
    newBalance: finalBalance,
    receiptNo,
    ledgerEntryId: ledgerRef.id,
    paymentId: paymentRef.id,
  };
};

/**
 * ---------------------------------------------------------------------------------
 * FIRESTORE COST ACCOUNTING:
 * Operation: Set Customer Opening Balance from Paper Registers
 * Transaction Reads: Exactly 1 document read (customers/{customerId})
 * Transaction Writes: Exactly 2 writes (customers update + customerLedger opening entry)
 * Audit Logs: 1 write (asynchronous outside transaction)
 * Total Reads: 1 | Total Writes: 3
 * ---------------------------------------------------------------------------------
 */
export const setCustomerOpeningBalanceTransaction = async (
  customerId: string,
  openingBalance: number,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db || !customerId || openingBalance === 0) return;

  const customerRef = doc(db, 'customers', customerId);
  const ledgerRef = doc(collection(db, 'customerLedger'));
  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];

  await runTransaction(db, async (transaction) => {
    // 1. Transaction Read: Read customer document once
    const customerSnap = await transaction.get(customerRef);
    if (!customerSnap.exists()) {
      throw new Error(`Customer ${customerId} does not exist.`);
    }

    const customerData = customerSnap.data() as CustomerDocument;
    const balanceNum = Math.round(Number(openingBalance) * 100) / 100;

    // 2. Transaction Write 1: Update customer document balance
    transaction.update(customerRef, {
      currentBalance: balanceNum,
      updatedAt: now,
    });

    // 3. Transaction Write 2: Create initial ledger entry
    const entry: CustomerLedgerDocument = {
      id: ledgerRef.id,
      customerId,
      customerName: customerData.shopName || customerData.name,
      entryType: balanceNum >= 0 ? 'debit' : 'credit',
      description: 'Opening Balance (Paper Khata Transfer)',
      amount: Math.abs(balanceNum),
      runningBalance: balanceNum,
      recordedByUserId: userId,
      recordedByEmail: userEmail,
      date: dateStr,
      createdAt: now,
    };
    transaction.set(ledgerRef, entry);
  });

  await logAuditEvent(
    'SET_OPENING_BALANCE',
    'customerLedger',
    `Set opening balance of PKR ${openingBalance} for customer ${customerId}`,
    customerId,
    userId,
    userEmail
  );
};

/**
 * ---------------------------------------------------------------------------------
 * FIRESTORE COST ACCOUNTING:
 * Operation: Manual Khata Balance Adjustment / Reconciliation
 * Transaction Reads: Exactly 1 document read (customers/{customerId})
 * Transaction Writes: Exactly 2 writes (customers update + customerLedger adjustment entry)
 * Audit Logs: 1 write (asynchronous outside transaction)
 * Total Reads: 1 | Total Writes: 3
 * ---------------------------------------------------------------------------------
 */
export const adjustCustomerBalanceTransaction = async (
  customerId: string,
  type: 'debit' | 'credit',
  amount: number,
  reason: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<number> => {
  if (!db || !customerId) throw new Error('Customer ID is required');

  const adjAmount = Math.abs(Number(amount));
  if (isNaN(adjAmount) || adjAmount <= 0) {
    throw new Error('Adjustment amount must be a positive number');
  }

  const customerRef = doc(db, 'customers', customerId);
  const ledgerRef = doc(collection(db, 'customerLedger'));
  const now = new Date().toISOString();
  let updatedBalance = 0;

  await runTransaction(db, async (transaction) => {
    const customerSnap = await transaction.get(customerRef);
    if (!customerSnap.exists()) {
      throw new Error(`Customer ${customerId} not found.`);
    }

    const customerData = customerSnap.data() as CustomerDocument;
    const currentBal = Number(customerData.currentBalance) || 0;

    updatedBalance =
      type === 'debit'
        ? Math.round((currentBal + adjAmount) * 100) / 100
        : Math.round((currentBal - adjAmount) * 100) / 100;

    transaction.update(customerRef, {
      currentBalance: updatedBalance,
      updatedAt: now,
    });

    const entry: CustomerLedgerDocument = {
      id: ledgerRef.id,
      customerId,
      customerName: customerData.shopName || customerData.name,
      entryType: type,
      description: `Manual Adjustment: ${reason.trim()}`,
      amount: adjAmount,
      runningBalance: updatedBalance,
      recordedByUserId: userId,
      recordedByEmail: userEmail,
      date: now.split('T')[0],
      createdAt: now,
    };
    transaction.set(ledgerRef, entry);
  });

  await logAuditEvent(
    'ADJUST_CUSTOMER_BALANCE',
    'customerLedger',
    `Adjusted balance for customer ${customerId} by ${type} ${adjAmount}. New balance: PKR ${updatedBalance}`,
    ledgerRef.id,
    userId,
    userEmail
  );

  return updatedBalance;
};

/**
 * Fetch paginated customer ledger entries.
 * Read cost: Exactly pageSize records (e.g. 25 reads).
 */
export const getCustomerLedgerPaginated = async (
  customerId: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = LEDGER_PAGE_SIZE
): Promise<PaginatedLedgerResult> => {
  if (!db || !customerId) {
    return { entries: [], lastDoc: null, hasMore: false };
  }

  try {
    const ledgerRef = collection(db, 'customerLedger');
    let qConstraints: any[] = [
      where('customerId', '==', customerId),
      limit(pageSize + 1),
    ];

    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    const q = query(ledgerRef, ...qConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    const entries: CustomerLedgerDocument[] = docs.map((d) => ({
      ...(d.data() as CustomerLedgerDocument),
      id: d.id,
    }));

    // In-memory sort by date descending
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      entries,
      lastDoc,
      hasMore,
    };
  } catch (err) {
    console.error(`Error fetching customer ledger for ${customerId}:`, err);
    return { entries: [], lastDoc: null, hasMore: false };
  }
};

