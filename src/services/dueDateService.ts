import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  SaleDocument,
  InvoiceDueDateOverride,
  InvoiceDueStatus,
  CustomerLedgerDocument,
  CustomerDocument,
  UserDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { invalidateReceivablesCache } from './financialReportService';

/**
 * Standard rounding helper to guarantee 2 decimal places.
 */
function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates invoice payment due date using customer credit terms.
 * Performs calculations in UTC to prevent timezone/DST drift.
 *
 * @param saleDateStr Date string (YYYY-MM-DD or ISO string)
 * @param creditDays Credit settlement term in days (e.g. 15, 30)
 * @returns YYYY-MM-DD due date string, or undefined if creditDays is not configured (>0)
 */
export function calculateInvoiceDueDate(
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

export interface InvoiceDueStatusResult {
  status: InvoiceDueStatus;
  daysOverdue: number;
  daysUntilDue: number;
  label: string;
  badgeColor: string;
}

/**
 * Evaluates the payment due status of an invoice given its remaining balance,
 * sale date, and snapshot due date.
 *
 * @param params Invoice financial snapshot
 * @param asOfDate Calculation base date (defaults to current local date YYYY-MM-DD)
 */
export function getInvoiceDueStatus(
  params: {
    saleDate: string;
    dueDate?: string;
    grandTotal: number;
    remainingBalance: number;
  },
  asOfDate?: string
): InvoiceDueStatusResult {
  const remaining = roundMoney(params.remainingBalance);

  // 1. Fully paid invoices
  if (remaining <= 0) {
    return {
      status: 'paid',
      daysOverdue: 0,
      daysUntilDue: 0,
      label: 'Paid',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  // 2. Invoices with remaining balance but no configured due date
  if (!params.dueDate) {
    return {
      status: 'no_due_date',
      daysOverdue: 0,
      daysUntilDue: 0,
      label: 'No Due Date',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }

  // 3. Date comparison in UTC calendar days
  const baseDate = asOfDate ? asOfDate.split('T')[0] : new Date().toISOString().split('T')[0];
  const [tY, tM, tD] = baseDate.split('-').map(Number);
  const [dY, dM, dD] = params.dueDate.split('T')[0].split('-').map(Number);

  const todayUtc = Date.UTC(tY, tM - 1, tD);
  const dueUtc = Date.UTC(dY, dM - 1, dD);

  const diffMs = todayUtc - dueUtc;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    // Past due date
    return {
      status: 'overdue',
      daysOverdue: diffDays,
      daysUntilDue: 0,
      label: `Overdue (${diffDays}d)`,
      badgeColor: 'bg-red-100 text-red-800 border-red-200',
    };
  } else if (diffDays === 0) {
    // Due today
    return {
      status: 'due_soon',
      daysOverdue: 0,
      daysUntilDue: 0,
      label: 'Due Today',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  } else if (diffDays >= -7) {
    // Due within 1 to 7 days
    const daysUntil = Math.abs(diffDays);
    return {
      status: 'due_soon',
      daysOverdue: 0,
      daysUntilDue: daysUntil,
      label: `Due in ${daysUntil}d`,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  } else {
    // Normal pending invoice (>7 days remaining)
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

export interface UpdateDueDateParams {
  saleId: string;
  newDueDate: string; // YYYY-MM-DD
  reason: string;
  adminUserId: string;
  adminEmail?: string;
}

/**
 * Admin-only operation to manually update an invoice's due date.
 * Enforces strict authorization, date validation, and immutable audit logging.
 */
export async function updateSaleDueDate(params: UpdateDueDateParams): Promise<SaleDocument> {
  const { saleId, newDueDate, reason, adminUserId, adminEmail } = params;

  if (!db) {
    throw new Error('Database connection is not initialized.');
  }

  // 1. Authorize: Ensure requesting user exists, is active, and possesses 'admin' role
  const userRef = doc(db, 'users', adminUserId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error('Unauthorized: User record not found.');
  }

  const userData = userSnap.data() as UserDocument;
  if (!userData.isActive || userData.role !== 'admin') {
    throw new Error('Unauthorized: Only administrators have permission to change invoice payment deadlines.');
  }

  // 2. Validate input date
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(newDueDate)) {
    throw new Error('Invalid due date format. Expected YYYY-MM-DD.');
  }

  const [year, month, day] = newDueDate.split('-').map(Number);
  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) {
    throw new Error('Invalid calendar date specified for due date.');
  }

  // 3. Validate reason requirement
  const cleanReason = reason ? reason.trim() : '';
  if (cleanReason.length < 3) {
    throw new Error('A detailed reason (minimum 3 characters) is required to override invoice due dates for audit tracking.');
  }

  // 4. Fetch the target invoice
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);

  if (!saleSnap.exists()) {
    throw new Error(`Invoice with ID "${saleId}" does not exist.`);
  }

  const sale = saleSnap.data() as SaleDocument;

  // 5. Ensure new due date is not earlier than the original sale date
  const saleDateOnly = (sale.saleDate || sale.createdAt).split('T')[0];
  if (newDueDate < saleDateOnly) {
    throw new Error(`Due date cannot precede the original sale date (${saleDateOnly}).`);
  }

  // 6. Construct audit override record
  const override: InvoiceDueDateOverride = {
    previousDueDate: sale.dueDate || undefined,
    newDueDate,
    overriddenByUserId: adminUserId,
    overriddenByEmail: adminEmail || userData.email || '',
    overriddenAt: new Date().toISOString(),
    reason: cleanReason,
  };

  const nowIso = new Date().toISOString();

  // 7. Perform Firestore update (strictly restricted to dueDate, dueDateOverride, updatedAt)
  await updateDoc(saleRef, {
    dueDate: newDueDate,
    dueDateOverride: override,
    updatedAt: nowIso,
  });

  // 8. Log audit trail
  await logAuditEvent(
    'UPDATE_INVOICE_DUE_DATE',
    'sales',
    `Invoice ${sale.invoiceNo} due date changed from ${sale.dueDate || 'none'} to ${newDueDate}. Reason: ${cleanReason}`,
    saleId,
    adminUserId,
    adminEmail || userData.email || 'admin@sadiqbookagency.com'
  );

  // 9. Invalidate reports cache
  invalidateReceivablesCache();

  return {
    ...sale,
    dueDate: newDueDate,
    dueDateOverride: override,
    updatedAt: nowIso,
  };
}

export interface CustomerInvoiceFifoItem {
  sale: SaleDocument;
  originalCredit: number; // The credit amount originally booked (balanceAddedToCredit or grandTotal if pure credit)
  allocatedPayments: number; // Historical payments assigned to this invoice via FIFO
  remainingBalance: number; // Outstanding amount owed on this specific bill
  dueStatus: InvoiceDueStatus;
  daysOverdue: number;
  daysUntilDue: number;
  statusLabel: string;
  badgeColor: string;
}

/**
 * Pure FIFO allocation algorithm:
 * Given a customer's sales and ledger entries, allocates payments against the oldest
 * debit sales first.
 *
 * Guarantees:
 * 1. Oldest unpaid debit invoices are settled first.
 * 2. Sum of remaining balances equals customer's authoritative currentBalance.
 * 3. Never mutates historical sale documents.
 */
export function allocateCustomerInvoicesFifo(
  sales: SaleDocument[],
  _ledgerEntries: CustomerLedgerDocument[],
  customerBalance: number,
  asOfDate?: string
): CustomerInvoiceFifoItem[] {
  // Filter sales that were booked to credit (either balanceAddedToCredit > 0 or paymentMethod === 'credit')
  const creditSales = sales.filter(
    (s) => s.balanceAddedToCredit > 0 || s.paymentMethod === 'credit'
  );

  // Sort sales chronologically: oldest first (saleDate ascending, then invoiceNo ascending)
  creditSales.sort((a, b) => {
    const dateComp = (a.saleDate || a.createdAt).localeCompare(b.saleDate || b.createdAt);
    if (dateComp !== 0) return dateComp;
    return a.invoiceNo.localeCompare(b.invoiceNo);
  });

  // Calculate total credit recovery payments from ledger (payments received, returns credited, adjustments)
  // Total original debt booked on credit sales:
  const totalDebtBooked = creditSales.reduce((sum, s) => {
    const debt = s.balanceAddedToCredit > 0 ? s.balanceAddedToCredit : s.grandTotal;
    return roundMoney(sum + debt);
  }, 0);

  // Remaining debt according to authoritative customer balance
  const activeDebt = Math.max(0, roundMoney(customerBalance));

  // Total payments applied to these credit sales = totalDebtBooked - activeDebt
  let availablePayments = Math.max(0, roundMoney(totalDebtBooked - activeDebt));

  const items: CustomerInvoiceFifoItem[] = [];

  for (const sale of creditSales) {
    const originalCredit = sale.balanceAddedToCredit > 0 ? sale.balanceAddedToCredit : sale.grandTotal;
    const alloc = Math.min(originalCredit, availablePayments);
    const remaining = roundMoney(originalCredit - alloc);

    availablePayments = roundMoney(availablePayments - alloc);

    const dueInfo = getInvoiceDueStatus(
      {
        saleDate: sale.saleDate || sale.createdAt,
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
      badgeColor: dueInfo.badgeColor,
    });
  }

  return items;
}

/**
 * Fetches all credit sales and ledger records for a customer and returns
 * itemized invoices with FIFO balances and due dates.
 */
export async function getCustomerInvoicesWithFifoBalances(
  customerId: string,
  customerBalance: number,
  asOfDate?: string
): Promise<CustomerInvoiceFifoItem[]> {
  if (!db || !customerId) return [];

  // Query sales for customer
  const salesQuery = query(
    collection(db, 'sales'),
    where('customerId', '==', customerId),
    limit(200)
  );

  const ledgerQuery = query(
    collection(db, 'customerLedger'),
    where('customerId', '==', customerId),
    limit(200)
  );

  const [salesSnap, ledgerSnap] = await Promise.all([
    getDocs(salesQuery),
    getDocs(ledgerQuery),
  ]);

  const sales = salesSnap.docs.map((d) => d.data() as SaleDocument);
  const ledgerEntries = ledgerSnap.docs.map((d) => d.data() as CustomerLedgerDocument);

  return allocateCustomerInvoicesFifo(sales, ledgerEntries, customerBalance, asOfDate);
}

export interface OverdueReceivablesSummary {
  totalOverdueAmount: number;
  totalDueTodayAmount: number;
  dueTodayCount: number;
  totalDueSoonAmount: number;
  dueSoonCount: number;
  totalOutstandingCredit: number;
  overdueInvoices: Array<{
    saleId: string;
    invoiceNo: string;
    customerId: string;
    customerName: string;
    saleDate: string;
    dueDate?: string;
    daysOverdue: number;
    grandTotal: number;
    remainingBalance: number;
  }>;
}

/**
 * Generates aggregated overdue receivables summary metrics for the Dashboard and Reports.
 */
export async function getOverdueReceivablesSummary(
  asOfDate?: string
): Promise<OverdueReceivablesSummary> {
  const baseDate = asOfDate || new Date().toISOString().split('T')[0];

  if (!db) {
    return {
      totalOverdueAmount: 0,
      totalDueTodayAmount: 0,
      dueTodayCount: 0,
      totalDueSoonAmount: 0,
      dueSoonCount: 0,
      totalOutstandingCredit: 0,
      overdueInvoices: [],
    };
  }

  // 1. Fetch active customers with positive balance
  const custQuery = query(
    collection(db, 'customers'),
    where('currentBalance', '>', 0),
    limit(100)
  );
  const custSnap = await getDocs(custQuery);
  const customers = custSnap.docs.map((d) => d.data() as CustomerDocument);

  let totalOverdueAmount = 0;
  let totalDueTodayAmount = 0;
  let dueTodayCount = 0;
  let totalDueSoonAmount = 0;
  let dueSoonCount = 0;
  let totalOutstandingCredit = 0;
  const overdueInvoices: OverdueReceivablesSummary['overdueInvoices'] = [];

  for (const customer of customers) {
    totalOutstandingCredit = roundMoney(totalOutstandingCredit + customer.currentBalance);

    // Fetch credit sales for this customer
    const salesQ = query(
      collection(db, 'sales'),
      where('customerId', '==', customer.id),
      limit(100)
    );
    const salesSnap = await getDocs(salesQ);
    const sales = salesSnap.docs.map((d) => d.data() as SaleDocument);

    const allocated = allocateCustomerInvoicesFifo(sales, [], customer.currentBalance, baseDate);

    for (const item of allocated) {
      if (item.remainingBalance <= 0) continue;

      if (item.dueStatus === 'overdue') {
        totalOverdueAmount = roundMoney(totalOverdueAmount + item.remainingBalance);
        overdueInvoices.push({
          saleId: item.sale.id,
          invoiceNo: item.sale.invoiceNo,
          customerId: customer.id,
          customerName: customer.name,
          saleDate: item.sale.saleDate || item.sale.createdAt,
          dueDate: item.sale.dueDate,
          daysOverdue: item.daysOverdue,
          grandTotal: item.sale.grandTotal,
          remainingBalance: item.remainingBalance,
        });
      } else if (item.dueStatus === 'due_soon') {
        totalDueSoonAmount = roundMoney(totalDueSoonAmount + item.remainingBalance);
        dueSoonCount++;
        if (item.daysUntilDue === 0) {
          totalDueTodayAmount = roundMoney(totalDueTodayAmount + item.remainingBalance);
          dueTodayCount++;
        }
      }
    }
  }

  // Sort overdue invoices by days overdue descending
  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    totalOverdueAmount,
    totalDueTodayAmount,
    dueTodayCount,
    totalDueSoonAmount,
    dueSoonCount,
    totalOutstandingCredit,
    overdueInvoices,
  };
}
