/**
 * EXPENSE MANAGEMENT & REPORTING SERVICE
 * Sadiq Book Agency — Phase 6: Module 6.3
 *
 * Strict Accounting & Security Rules:
 * 1. Admin-only write access: Creates, updates, and deletes restricted to Admins.
 * 2. Cash expenses reduce physical cash in Cash Flow (Module 6.5).
 * 3. Bank-transfer expenses reduce bank balance, NEVER physical cash drawer.
 * 4. Expenses are counted only once (no duplication with purchase invoices or Khata).
 * 5. Bounded Firestore date queries with 5-minute memory caching.
 * 6. High-precision arithmetic via roundMoney and safeDivide.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  orderBy,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ExpenseCategory, ExpenseDocument } from '../types/database';
import type {
  DateRange,
  ExpenseFilters,
  ExpenseReportData,
  ExpenseReportSummary,
  CategoryExpenseSummary,
  DailyExpenseSummary,
} from '../types/reports';
import { getInclusiveQueryBounds, isValidYMD } from '../utils/datePresets';
import { roundMoney, safeDivide, calculatePercentage } from '../utils/money';
import { logAuditEvent } from './auditService';
import { invalidateClosingCache } from './dailyCashClosingService';
import { invalidateFinancialReportsCache } from './financialReportService';

// Category Labels Mapping
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent / Property',
  salaries: 'Staff Salaries',
  electricity: 'Electricity Bill',
  internet: 'Internet & Telephone',
  transport: 'Transportation & Freight',
  maintenance: 'Maintenance & Repairs',
  utilities: 'Utilities (Gas / Water)',
  refreshment: 'Tea & Refreshment',
  miscellaneous: 'Miscellaneous',
  other: 'Other Operating Expense',
};

export const ALL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'rent',
  'salaries',
  'electricity',
  'internet',
  'transport',
  'maintenance',
  'utilities',
  'refreshment',
  'miscellaneous',
  'other',
];

// In-Memory Expense Cache (TTL: 5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;
interface CachedExpenseReport {
  data: ExpenseReportData;
  timestamp: number;
}
const expenseReportCache = new Map<string, CachedExpenseReport>();

export const invalidateExpensesCache = (): void => {
  expenseReportCache.clear();
  invalidateClosingCache();
  invalidateFinancialReportsCache();
};

export interface CreateExpenseInput {
  expenseCategory: ExpenseCategory;
  title: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer';
  paidTo?: string;
  referenceNo?: string;
  expenseDate: string; // YYYY-MM-DD
  notes?: string;
}

/**
 * Validates expense input parameters strictly.
 */
export const validateExpenseInput = (
  input: CreateExpenseInput
): { isValid: boolean; error?: string } => {
  if (!input.title || !input.title.trim()) {
    return { isValid: false, error: 'Expense title or description is required.' };
  }
  const amt = Number(input.amount);
  if (isNaN(amt) || amt <= 0) {
    return { isValid: false, error: 'Expense amount must be a positive number greater than 0.' };
  }
  if (!ALL_EXPENSE_CATEGORIES.includes(input.expenseCategory)) {
    return { isValid: false, error: 'Please select a valid expense category.' };
  }
  if (!['cash', 'bank_transfer'].includes(input.paymentMode)) {
    return { isValid: false, error: 'Payment mode must be either cash or bank transfer.' };
  }
  if (!isValidYMD(input.expenseDate)) {
    return { isValid: false, error: 'Expense date must be a valid calendar date in YYYY-MM-DD format.' };
  }
  return { isValid: true };
};

/**
 * Creates a new operating expense (Admin Only).
 */
export const createExpense = async (
  input: CreateExpenseInput,
  userId = 'admin',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<ExpenseDocument> => {
  if (!db) throw new Error('Firestore is not initialized.');

  const validation = validateExpenseInput(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const now = new Date().toISOString();
  const dateStr = input.expenseDate.trim();
  const cleanAmount = roundMoney(input.amount);

  const expenseRef = doc(collection(db, 'expenses'));
  const expenseDoc: ExpenseDocument = {
    id: expenseRef.id,
    expenseCategory: input.expenseCategory,
    title: input.title.trim(),
    amount: cleanAmount,
    paymentMode: input.paymentMode,
    paidTo: input.paidTo?.trim() || '',
    paidByUserId: userId,
    paidByEmail: userEmail,
    referenceNo: input.referenceNo?.trim() || '',
    expenseDate: dateStr,
    notes: input.notes?.trim() || '',
    createdAt: now,
  };

  await setDoc(expenseRef, expenseDoc);
  invalidateExpensesCache();

  await logAuditEvent(
    'CREATE_EXPENSE',
    'expenses',
    `Created expense "${expenseDoc.title}" (${EXPENSE_CATEGORY_LABELS[expenseDoc.expenseCategory]}): PKR ${expenseDoc.amount} via ${expenseDoc.paymentMode}`,
    expenseDoc.id,
    userId,
    userEmail
  );

  return expenseDoc;
};

/**
 * Updates an existing operating expense (Admin Only).
 */
export const updateExpense = async (
  expenseId: string,
  input: Partial<CreateExpenseInput>,
  userId = 'admin',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db || !expenseId.trim()) throw new Error('Invalid expense identifier.');

  const now = new Date().toISOString();
  const updateData: Record<string, any> = { updatedAt: now };

  if (input.title !== undefined) updateData.title = input.title.trim();
  if (input.expenseCategory !== undefined) updateData.expenseCategory = input.expenseCategory;
  if (input.amount !== undefined) updateData.amount = roundMoney(input.amount);
  if (input.paymentMode !== undefined) updateData.paymentMode = input.paymentMode;
  if (input.paidTo !== undefined) updateData.paidTo = input.paidTo.trim();
  if (input.referenceNo !== undefined) updateData.referenceNo = input.referenceNo.trim();
  if (input.expenseDate !== undefined) {
    if (!isValidYMD(input.expenseDate)) throw new Error('Invalid expense date format.');
    updateData.expenseDate = input.expenseDate.trim();
  }
  if (input.notes !== undefined) updateData.notes = input.notes.trim();

  const expenseRef = doc(db, 'expenses', expenseId.trim());
  await updateDoc(expenseRef, updateData);
  invalidateExpensesCache();

  await logAuditEvent(
    'UPDATE_EXPENSE',
    'expenses',
    `Updated expense #${expenseId}`,
    expenseId,
    userId,
    userEmail
  );
};

/**
 * Deletes an operating expense (Admin Only).
 */
export const deleteExpense = async (
  expenseId: string,
  userId = 'admin',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db || !expenseId.trim()) throw new Error('Invalid expense identifier.');

  const expenseRef = doc(db, 'expenses', expenseId.trim());
  await deleteDoc(expenseRef);
  invalidateExpensesCache();

  await logAuditEvent(
    'DELETE_EXPENSE',
    'expenses',
    `Deleted expense #${expenseId}`,
    expenseId,
    userId,
    userEmail
  );
};

/**
 * Retrieves expenses and computes statistical report summaries for any date range.
 * Cost Protection:
 * - Employs date range boundaries (expenseDate >= cleanStart && expenseDate <= endStringBound).
 * - Bounded pagination loop with batch limit of 500.
 * - 5-minute memory caching.
 */
export const getExpensesReport = async (
  dateRange: DateRange,
  filters: ExpenseFilters = {}
): Promise<ExpenseReportData> => {
  const cacheKey = JSON.stringify({
    start: dateRange.startDate,
    end: dateRange.endDate,
    filters,
  });

  const cached = expenseReportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const { cleanStart, endStringBound } = getInclusiveQueryBounds(
    dateRange.startDate,
    dateRange.endDate
  );

  const expenses: ExpenseDocument[] = [];

  if (db) {
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMore = true;

    while (hasMore) {
      const constraints: any[] = [
        where('expenseDate', '>=', cleanStart),
        where('expenseDate', '<=', endStringBound),
        orderBy('expenseDate', 'desc'),
        limit(500),
      ];
      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const snap = await getDocs(query(collection(db, 'expenses'), ...constraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        expenses.push({ ...(d.data() as ExpenseDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMore = false;
      } else {
        lastDoc = snap.docs[snap.docs.length - 1];
      }
    }
  }

  // Client-side filtering
  let filtered = expenses;

  if (filters.category && filters.category !== 'all') {
    filtered = filtered.filter((e) => e.expenseCategory === filters.category);
  }

  if (filters.paymentMode && filters.paymentMode !== 'all') {
    filtered = filtered.filter((e) => e.paymentMode === filters.paymentMode);
  }

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.trim().toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.title.toLowerCase().includes(term) ||
        (e.paidTo && e.paidTo.toLowerCase().includes(term)) ||
        (e.referenceNo && e.referenceNo.toLowerCase().includes(term)) ||
        (e.notes && e.notes.toLowerCase().includes(term))
    );
  }

  // Financial Metric Calculations
  let totalExpenses = 0;
  let cashExpenses = 0;
  let bankExpenses = 0;

  // Category map
  const catMap = new Map<ExpenseCategory, { count: number; total: number }>();
  for (const cat of ALL_EXPENSE_CATEGORIES) {
    catMap.set(cat, { count: 0, total: 0 });
  }

  // Daily map
  const dailyMap = new Map<string, { count: number; total: number; cash: number; bank: number }>();

  for (const exp of filtered) {
    const amt = roundMoney(exp.amount);
    totalExpenses = roundMoney(totalExpenses + amt);

    if (exp.paymentMode === 'cash') {
      cashExpenses = roundMoney(cashExpenses + amt);
    } else {
      bankExpenses = roundMoney(bankExpenses + amt);
    }

    // Category aggregation
    if (catMap.has(exp.expenseCategory)) {
      const entry = catMap.get(exp.expenseCategory)!;
      entry.count++;
      entry.total = roundMoney(entry.total + amt);
    }

    // Daily aggregation
    const dStr = exp.expenseDate.split('T')[0];
    if (!dailyMap.has(dStr)) {
      dailyMap.set(dStr, { count: 0, total: 0, cash: 0, bank: 0 });
    }
    const dEntry = dailyMap.get(dStr)!;
    dEntry.count++;
    dEntry.total = roundMoney(dEntry.total + amt);
    if (exp.paymentMode === 'cash') {
      dEntry.cash = roundMoney(dEntry.cash + amt);
    } else {
      dEntry.bank = roundMoney(dEntry.bank + amt);
    }
  }

  const totalExpenseCount = filtered.length;
  const averageExpense = safeDivide(totalExpenses, totalExpenseCount);

  // Transform Category Breakdown (only include categories with activity or top categories)
  const categoryBreakdown: CategoryExpenseSummary[] = Array.from(catMap.entries())
    .map(([category, stats]) => ({
      category,
      label: EXPENSE_CATEGORY_LABELS[category] || category,
      count: stats.count,
      totalAmount: stats.total,
      percentage: calculatePercentage(stats.total, totalExpenses),
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // Transform Daily Breakdown sorted by date desc
  const dailyBreakdown: DailyExpenseSummary[] = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({
      date,
      count: stats.count,
      totalAmount: stats.total,
      cashAmount: stats.cash,
      bankAmount: stats.bank,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const summary: ExpenseReportSummary = {
    totalExpenses,
    cashExpenses,
    bankExpenses,
    totalExpenseCount,
    averageExpense,
  };

  const report: ExpenseReportData = {
    dateRange,
    summary,
    categoryBreakdown,
    dailyBreakdown,
    expenses: filtered,
    totalCount: totalExpenseCount,
  };

  expenseReportCache.set(cacheKey, { data: report, timestamp: Date.now() });

  return report;
};

