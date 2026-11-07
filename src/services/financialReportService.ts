/**
 * FINANCIAL REPORTING SERVICE
 * Sadiq Book Agency — Phase 6: Modules 6.1 & 6.2
 *
 * Implements:
 * - Module 6.1: Daily and Periodic Sales Report
 * - Module 6.2: Purchase Report
 *
 * Strict Accounting Rules:
 * 1. Customer Khata debt recoveries are NOT counted as sales revenue.
 * 2. Credit sales are NOT counted as physical cash received.
 * 3. Partial payments are strictly segregated (paymentApplied vs balanceAddedToCredit).
 * 4. Sales returns reduce Gross Sales to derive Net Sales.
 * 5. Purchase returns are reported as 0 with "None recorded" note (per schema audit).
 * 6. High-precision arithmetic via roundMoney and safeDivide.
 * 7. Bounded Firestore queries with 5-minute memory caching.
 */

import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  SaleDocument,
  SaleReturnDocument,
  PurchaseDocument,
  ExpenseDocument,
  ExpenseCategory,
  PaymentDocument,
  CustomerDocument,
  CustomerLedgerDocument,
  SupplierDocument,
} from '../types/database';
import type {
  DateRange,
  SalesReportFilters,
  SalesReportData,
  SalesReportSummary,
  DailySalesBreakdown,
  PaymentMethodBreakdown,
  CustomerSalesSummary,
  PurchaseReportFilters,
  PurchaseReportData,
  PurchaseReportSummary,
  SupplierPurchaseSummary,
  DateWisePurchaseSummary,
  ProfitLossFilters,
  ProfitLossSummary,
  DailyProfitLossBreakdown,
  ProfitLossCategoryExpense,
  OperatingProfitLossReportData,
  CashFlowFilters,
  CashFlowSummary,
  DailyCashFlowBreakdown,
  CashFlowTransaction,
  CashFlowReportData,
  CustomerAgingBucket,
  CustomerReceivableItem,
  CustomerReceivablesSummary,
  CustomerReceivablesFilters,
  CustomerReceivablesReportData,
  SupplierAgingBucket,
  SupplierPayableItem,
  SupplierPayablesSummary,
  SupplierPayablesFilters,
  SupplierPayablesReportData,
  ReconciliationItem,
  AccountingDisclosure,
  FullAccountingReconciliationSummary,
  FullAccountingReconciliationData,
} from '../types/reports';
import { getInclusiveQueryBounds } from '../utils/datePresets';
import { roundMoney, safeDivide, calculatePercentage } from '../utils/money';
import { EXPENSE_CATEGORY_LABELS, ALL_EXPENSE_CATEGORIES } from './expenseService';

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedReport<T> {
  data: T;
  timestamp: number;
}

const salesReportCache = new Map<string, CachedReport<SalesReportData>>();
const purchaseReportCache = new Map<string, CachedReport<PurchaseReportData>>();
const profitLossCache = new Map<string, CachedReport<OperatingProfitLossReportData>>();
const cashFlowCache = new Map<string, CachedReport<CashFlowReportData>>();
const receivablesCache = new Map<string, CachedReport<CustomerReceivablesReportData>>();
const payablesCache = new Map<string, CachedReport<SupplierPayablesReportData>>();
const reconciliationCache = new Map<string, CachedReport<FullAccountingReconciliationData>>();

export const invalidateReceivablesCache = (): void => {
  receivablesCache.clear();
};

export const invalidatePayablesCache = (): void => {
  payablesCache.clear();
};

export const invalidateFinancialReportsCache = (): void => {
  salesReportCache.clear();
  purchaseReportCache.clear();
  profitLossCache.clear();
  cashFlowCache.clear();
  receivablesCache.clear();
  payablesCache.clear();
  reconciliationCache.clear();
};

// ==============================================================================
// MODULE 6.1 — SALES REPORT IMPLEMENTATION
// ==============================================================================

export interface SalesReportResult {
  report: SalesReportData;
  sales: SaleDocument[];
  returns: SaleReturnDocument[];
}

export const getSalesReport = async (
  dateRange: DateRange,
  filters: SalesReportFilters = {}
): Promise<SalesReportResult> => {
  const cacheKey = JSON.stringify({
    start: dateRange.startDate,
    end: dateRange.endDate,
    filters,
  });

  const cached = salesReportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      report: cached.data,
      sales: [],
      returns: [],
    };
  }

  const { cleanStart, endStringBound } = getInclusiveQueryBounds(
    dateRange.startDate,
    dateRange.endDate
  );

  const sales: SaleDocument[] = [];
  const returns: SaleReturnDocument[] = [];

  if (db) {
    // 1. Fetch Sales within bounded date range using batch pagination
    let lastSaleDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreSales = true;

    while (hasMoreSales) {
      const salesConstraints: any[] = [
        where('saleDate', '>=', cleanStart),
        where('saleDate', '<=', endStringBound),
        orderBy('saleDate', 'asc'),
        limit(500),
      ];
      if (lastSaleDoc) {
        salesConstraints.push(startAfter(lastSaleDoc));
      }

      const snap = await getDocs(query(collection(db, 'sales'), ...salesConstraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        sales.push({ ...(d.data() as SaleDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreSales = false;
      } else {
        lastSaleDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 2. Fetch Sales Returns within bounded date range
    let lastReturnDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreReturns = true;

    while (hasMoreReturns) {
      const returnConstraints: any[] = [
        where('returnDate', '>=', cleanStart),
        where('returnDate', '<=', endStringBound),
        orderBy('returnDate', 'asc'),
        limit(500),
      ];
      if (lastReturnDoc) {
        returnConstraints.push(startAfter(lastReturnDoc));
      }

      const snap = await getDocs(query(collection(db, 'salesReturns'), ...returnConstraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        returns.push({ ...(d.data() as SaleReturnDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreReturns = false;
      } else {
        lastReturnDoc = snap.docs[snap.docs.length - 1];
      }
    }
  }

  // 3. Apply client-side secondary filters
  let filteredSales = sales;

  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    filteredSales = filteredSales.filter((s) => s.paymentMethod === filters.paymentMethod);
  }

  if (filters.customerType && filters.customerType !== 'all') {
    filteredSales = filteredSales.filter((s) => s.customerType === filters.customerType);
  }

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.trim().toLowerCase();
    filteredSales = filteredSales.filter(
      (s) =>
        s.invoiceNo.toLowerCase().includes(term) ||
        s.customerName.toLowerCase().includes(term) ||
        (s.terminalId && s.terminalId.toLowerCase().includes(term))
    );
  }

  // 4. Calculate Financial Metrics & Breakdowns
  let totalGrossSales = 0;
  let totalCashSales = 0;
  let totalCreditSales = 0;
  let totalBankSales = 0;
  let partialSalesCount = 0;
  let partialSalesValue = 0;
  let actualCashReceived = 0;
  let totalOutstandingCredit = 0;

  // Daily map: date -> { invoiceCount, grossSales, returnsAmount, cashReceived, creditAdded }
  const dailyMap = new Map<string, {
    invoiceCount: number;
    grossSales: number;
    returnsAmount: number;
    cashReceived: number;
    creditAdded: number;
  }>();

  // Payment method counters
  let cashCount = 0;
  let cashAmount = 0;
  let creditCount = 0;
  let creditAmount = 0;
  let bankCount = 0;
  let bankAmount = 0;

  // Customer map: customerKey -> CustomerSalesSummary
  const customerMap = new Map<string, CustomerSalesSummary>();

  for (const s of filteredSales) {
    const grandTotal = roundMoney(s.grandTotal);
    const paymentApplied = roundMoney(s.paymentApplied);
    const balanceAdded = roundMoney(s.balanceAddedToCredit);

    totalGrossSales = roundMoney(totalGrossSales + grandTotal);
    actualCashReceived = roundMoney(actualCashReceived + paymentApplied);
    totalOutstandingCredit = roundMoney(totalOutstandingCredit + balanceAdded);

    if (s.paymentMethod === 'cash') {
      totalCashSales = roundMoney(totalCashSales + grandTotal);
      cashCount++;
      cashAmount = roundMoney(cashAmount + grandTotal);
    } else if (s.paymentMethod === 'credit') {
      totalCreditSales = roundMoney(totalCreditSales + grandTotal);
      creditCount++;
      creditAmount = roundMoney(creditAmount + grandTotal);
    } else if (s.paymentMethod === 'bank_transfer') {
      totalBankSales = roundMoney(totalBankSales + grandTotal);
      bankCount++;
      bankAmount = roundMoney(bankAmount + grandTotal);
    }

    if (s.paymentStatus === 'partial') {
      partialSalesCount++;
      partialSalesValue = roundMoney(partialSalesValue + grandTotal);
    }

    // Daily breakdown aggregation
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
    dEntry.grossSales = roundMoney(dEntry.grossSales + grandTotal);
    dEntry.cashReceived = roundMoney(dEntry.cashReceived + paymentApplied);
    dEntry.creditAdded = roundMoney(dEntry.creditAdded + balanceAdded);

    // Customer aggregation
    const cKey = s.customerId || s.customerName || 'Walk-in Counter';
    if (!customerMap.has(cKey)) {
      customerMap.set(cKey, {
        customerId: s.customerId,
        customerName: s.customerName || 'Counter Cash Customer',
        customerType: s.customerType || 'parchon',
        invoiceCount: 0,
        totalSalesAmount: 0,
        cashPaid: 0,
        creditAdded: 0,
      });
    }
    const cEntry = customerMap.get(cKey)!;
    cEntry.invoiceCount++;
    cEntry.totalSalesAmount = roundMoney(cEntry.totalSalesAmount + grandTotal);
    cEntry.cashPaid = roundMoney(cEntry.cashPaid + paymentApplied);
    cEntry.creditAdded = roundMoney(cEntry.creditAdded + balanceAdded);
  }

  // Returns aggregation
  let totalSalesReturns = 0;
  for (const r of returns) {
    const refund = roundMoney(r.totalRefundAmount);
    totalSalesReturns = roundMoney(totalSalesReturns + refund);

    const rDate = r.returnDate.split('T')[0];
    if (dailyMap.has(rDate)) {
      const dEntry = dailyMap.get(rDate)!;
      dEntry.returnsAmount = roundMoney(dEntry.returnsAmount + refund);
    } else {
      dailyMap.set(rDate, {
        invoiceCount: 0,
        grossSales: 0,
        returnsAmount: refund,
        cashReceived: 0,
        creditAdded: 0,
      });
    }
  }

  const netSales = roundMoney(totalGrossSales - totalSalesReturns);
  const totalInvoicesCount = filteredSales.length;
  const averageInvoiceValue = safeDivide(totalGrossSales, totalInvoicesCount);

  // Transform daily breakdown sorted by date
  const dailyBreakdown: DailySalesBreakdown[] = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      invoiceCount: d.invoiceCount,
      grossSales: d.grossSales,
      returnsAmount: d.returnsAmount,
      netSales: roundMoney(d.grossSales - d.returnsAmount),
      cashReceived: d.cashReceived,
      creditAdded: d.creditAdded,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Transform payment methods
  const paymentMethods: PaymentMethodBreakdown[] = [
    {
      method: 'cash',
      label: 'Cash (Counter)',
      invoiceCount: cashCount,
      totalAmount: cashAmount,
      percentage: calculatePercentage(cashAmount, totalGrossSales),
    },
    {
      method: 'credit',
      label: 'Credit (Khata)',
      invoiceCount: creditCount,
      totalAmount: creditAmount,
      percentage: calculatePercentage(creditAmount, totalGrossSales),
    },
    {
      method: 'bank_transfer',
      label: 'Bank Transfer',
      invoiceCount: bankCount,
      totalAmount: bankAmount,
      percentage: calculatePercentage(bankAmount, totalGrossSales),
    },
  ];

  // Transform customer summaries sorted by total sales desc
  const customerSummaries = Array.from(customerMap.values()).sort(
    (a, b) => b.totalSalesAmount - a.totalSalesAmount
  );

  const summary: SalesReportSummary = {
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
  };

  const report: SalesReportData = {
    dateRange,
    summary,
    dailyBreakdown,
    paymentMethods,
    customerSummaries,
    invoicesCount: totalInvoicesCount,
  };

  salesReportCache.set(cacheKey, { data: report, timestamp: Date.now() });

  return {
    report,
    sales: filteredSales,
    returns,
  };
};

// ==============================================================================
// MODULE 6.2 — PURCHASE REPORT IMPLEMENTATION
// ==============================================================================

export interface PurchaseReportResult {
  report: PurchaseReportData;
  purchases: PurchaseDocument[];
}

export const getPurchaseReport = async (
  dateRange: DateRange,
  filters: PurchaseReportFilters = {}
): Promise<PurchaseReportResult> => {
  const cacheKey = JSON.stringify({
    start: dateRange.startDate,
    end: dateRange.endDate,
    filters,
  });

  const cached = purchaseReportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      report: cached.data,
      purchases: [],
    };
  }

  const { cleanStart, endStringBound } = getInclusiveQueryBounds(
    dateRange.startDate,
    dateRange.endDate
  );

  const purchases: PurchaseDocument[] = [];

  if (db) {
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMore = true;

    while (hasMore) {
      const purchaseConstraints: any[] = [
        where('purchaseDate', '>=', cleanStart),
        where('purchaseDate', '<=', endStringBound),
        orderBy('purchaseDate', 'asc'),
        limit(500),
      ];
      if (lastDoc) {
        purchaseConstraints.push(startAfter(lastDoc));
      }

      const snap = await getDocs(query(collection(db, 'purchases'), ...purchaseConstraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        purchases.push({ ...(d.data() as PurchaseDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMore = false;
      } else {
        lastDoc = snap.docs[snap.docs.length - 1];
      }
    }
  }

  // Client-side secondary filters
  let filteredPurchases = purchases;

  if (filters.supplierId && filters.supplierId !== 'all') {
    filteredPurchases = filteredPurchases.filter((p) => p.supplierId === filters.supplierId);
  }

  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    filteredPurchases = filteredPurchases.filter((p) => p.paymentMethod === filters.paymentMethod);
  }

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.trim().toLowerCase();
    filteredPurchases = filteredPurchases.filter(
      (p) =>
        p.purchaseInvoiceNo.toLowerCase().includes(term) ||
        p.supplierName.toLowerCase().includes(term) ||
        p.items.some((it) => it.productName.toLowerCase().includes(term))
    );
  }

  // Financial Metrics & Aggregation
  let totalPurchaseValue = 0;
  let totalCashPurchases = 0;
  let totalCreditPurchases = 0;
  let totalBankPurchases = 0;
  let totalPaidAmount = 0;
  let totalOutstandingBalance = 0;

  // Supplier map
  const supplierMap = new Map<string, SupplierPurchaseSummary>();
  // Date map
  const dateMap = new Map<string, DateWisePurchaseSummary>();

  for (const p of filteredPurchases) {
    const grandTotal = roundMoney(p.grandTotal);
    const paid = roundMoney(p.paidAmount);
    const remaining = roundMoney(p.remainingBalance);

    totalPurchaseValue = roundMoney(totalPurchaseValue + grandTotal);
    totalPaidAmount = roundMoney(totalPaidAmount + paid);
    totalOutstandingBalance = roundMoney(totalOutstandingBalance + remaining);

    if (p.paymentMethod === 'cash') {
      totalCashPurchases = roundMoney(totalCashPurchases + grandTotal);
    } else if (p.paymentMethod === 'credit') {
      totalCreditPurchases = roundMoney(totalCreditPurchases + grandTotal);
    } else if (p.paymentMethod === 'bank_transfer') {
      totalBankPurchases = roundMoney(totalBankPurchases + grandTotal);
    }

    // Supplier aggregation
    const sId = p.supplierId;
    if (!supplierMap.has(sId)) {
      supplierMap.set(sId, {
        supplierId: sId,
        supplierName: p.supplierName,
        invoiceCount: 0,
        totalPurchaseValue: 0,
        paidAmount: 0,
        remainingBalance: 0,
      });
    }
    const sEntry = supplierMap.get(sId)!;
    sEntry.invoiceCount++;
    sEntry.totalPurchaseValue = roundMoney(sEntry.totalPurchaseValue + grandTotal);
    sEntry.paidAmount = roundMoney(sEntry.paidAmount + paid);
    sEntry.remainingBalance = roundMoney(sEntry.remainingBalance + remaining);

    // Date aggregation
    const dStr = p.purchaseDate.split('T')[0];
    if (!dateMap.has(dStr)) {
      dateMap.set(dStr, {
        date: dStr,
        invoiceCount: 0,
        totalPurchaseValue: 0,
        paidAmount: 0,
        remainingBalance: 0,
      });
    }
    const dEntry = dateMap.get(dStr)!;
    dEntry.invoiceCount++;
    dEntry.totalPurchaseValue = roundMoney(dEntry.totalPurchaseValue + grandTotal);
    dEntry.paidAmount = roundMoney(dEntry.paidAmount + paid);
    dEntry.remainingBalance = roundMoney(dEntry.remainingBalance + remaining);
  }

  const totalInvoicesCount = filteredPurchases.length;
  const averageInvoiceValue = safeDivide(totalPurchaseValue, totalInvoicesCount);

  // Per audit confirmation: No dedicated purchaseReturns collection exists in Firestore
  const totalPurchaseReturns = 0;
  const purchaseReturnsNote = 'None recorded (Feature not active in current schema)';
  const netPurchases = totalPurchaseValue; // net purchases = gross - returns

  const supplierSummaries = Array.from(supplierMap.values()).sort(
    (a, b) => b.totalPurchaseValue - a.totalPurchaseValue
  );

  const dateSummaries = Array.from(dateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const summary: PurchaseReportSummary = {
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

  const report: PurchaseReportData = {
    dateRange,
    summary,
    supplierSummaries,
    dateSummaries,
    invoicesCount: totalInvoicesCount,
  };

  purchaseReportCache.set(cacheKey, { data: report, timestamp: Date.now() });

  return {
    report,
    purchases: filteredPurchases,
  };
};

// ==============================================================================
// MODULE 6.4 — OPERATING PROFIT & LOSS REPORT IMPLEMENTATION
// ==============================================================================

export interface OperatingProfitLossResult {
  report: OperatingProfitLossReportData;
  sales: SaleDocument[];
  returns: SaleReturnDocument[];
  expenses: ExpenseDocument[];
}

/**
 * Pure calculation engine for Operating Profit & Loss.
 * Formulas:
 * 1. Gross Sales: Sum of sales grandTotal in sale date range.
 * 2. Sales Returns: Sum of totalRefundAmount in return date range.
 * 3. Net Sales: Gross Sales - Sales Returns.
 * 4. Gross COGS: Sum of (item.quantity * item.costPrice) historical snapshot at sale.
 * 5. Returned COGS: Sum of (item.quantity * item.originalCostPrice) snapshot reversed at return.
 * 6. Net COGS: Gross COGS - Returned COGS.
 * 7. Gross Profit: Net Sales - Net COGS.
 * 8. Gross Profit Margin: (Gross Profit / Net Sales) * 100 (safely 0 when Net Sales <= 0).
 * 9. Operating Expenses: Sum of expenses in expense date range (cash + bank transfer).
 * 10. Operating Profit: Gross Profit - Operating Expenses.
 * 11. Operating Margin: (Operating Profit / Net Sales) * 100 (safely 0 when Net Sales <= 0).
 */
export const calculateOperatingProfitLossMetrics = (
  sales: SaleDocument[],
  returns: SaleReturnDocument[],
  expenses: ExpenseDocument[],
  dateRange: DateRange
): OperatingProfitLossReportData => {
  // 1. Calculate Gross Sales & Gross COGS from sales
  let grossSales = 0;
  let grossCOGS = 0;
  let missingCostItemCount = 0;
  let missingCostSalesCount = 0;

  // Daily accumulator map: date (YYYY-MM-DD) -> accumulator
  const dailyMap = new Map<
    string,
    {
      grossSales: number;
      salesReturns: number;
      grossCOGS: number;
      returnedCOGS: number;
      operatingExpenses: number;
      cashExpenses: number;
      bankExpenses: number;
      invoicesCount: number;
      returnsCount: number;
      expensesCount: number;
    }
  >();

  const getDailyEntry = (dateKey: string) => {
    let entry = dailyMap.get(dateKey);
    if (!entry) {
      entry = {
        grossSales: 0,
        salesReturns: 0,
        grossCOGS: 0,
        returnedCOGS: 0,
        operatingExpenses: 0,
        cashExpenses: 0,
        bankExpenses: 0,
        invoicesCount: 0,
        returnsCount: 0,
        expensesCount: 0,
      };
      dailyMap.set(dateKey, entry);
    }
    return entry;
  };

  for (const s of sales) {
    const invTotal = roundMoney(s.grandTotal);
    grossSales = roundMoney(grossSales + invTotal);

    let saleCOGS = 0;
    let hasMissingCost = false;

    if (Array.isArray(s.items)) {
      for (const item of s.items) {
        const qty = Number(item.quantity) || 0;
        const unitCost =
          typeof item.costPrice === 'number' && !isNaN(item.costPrice)
            ? item.costPrice
            : -1;

        if (unitCost <= 0) {
          missingCostItemCount += qty;
          hasMissingCost = true;
        } else {
          const lineCost = roundMoney(unitCost * qty);
          saleCOGS = roundMoney(saleCOGS + lineCost);
        }
      }
    }

    if (hasMissingCost) {
      missingCostSalesCount++;
    }

    grossCOGS = roundMoney(grossCOGS + saleCOGS);

    const sDate = (s.saleDate || '').split('T')[0];
    if (sDate) {
      const dEntry = getDailyEntry(sDate);
      dEntry.invoicesCount++;
      dEntry.grossSales = roundMoney(dEntry.grossSales + invTotal);
      dEntry.grossCOGS = roundMoney(dEntry.grossCOGS + saleCOGS);
    }
  }

  // 2. Calculate Sales Returns & Returned COGS from returns
  let salesReturns = 0;
  let returnedCOGS = 0;
  let missingReturnCostCount = 0;

  for (const r of returns) {
    const refundTotal = roundMoney(r.totalRefundAmount);
    salesReturns = roundMoney(salesReturns + refundTotal);

    let retCOGS = 0;
    if (Array.isArray(r.items)) {
      for (const item of r.items) {
        const qty = Number(item.quantity) || 0;
        const unitCost =
          typeof item.originalCostPrice === 'number' && !isNaN(item.originalCostPrice)
            ? item.originalCostPrice
            : -1;

        if (unitCost <= 0) {
          missingReturnCostCount += qty;
        } else {
          const lineCost = roundMoney(unitCost * qty);
          retCOGS = roundMoney(retCOGS + lineCost);
        }
      }
    }

    returnedCOGS = roundMoney(returnedCOGS + retCOGS);

    const rDate = (r.returnDate || '').split('T')[0];
    if (rDate) {
      const dEntry = getDailyEntry(rDate);
      dEntry.returnsCount++;
      dEntry.salesReturns = roundMoney(dEntry.salesReturns + refundTotal);
      dEntry.returnedCOGS = roundMoney(dEntry.returnedCOGS + retCOGS);
    }
  }

  // 3. Calculate Operating Expenses from expenses
  let totalOperatingExpenses = 0;
  let cashExpenses = 0;
  let bankExpenses = 0;

  const catMap = new Map<
    ExpenseCategory,
    { count: number; total: number; cash: number; bank: number }
  >();
  for (const cat of ALL_EXPENSE_CATEGORIES) {
    catMap.set(cat, { count: 0, total: 0, cash: 0, bank: 0 });
  }

  for (const exp of expenses) {
    const amt = roundMoney(exp.amount);
    totalOperatingExpenses = roundMoney(totalOperatingExpenses + amt);

    const isCash = exp.paymentMode === 'cash';
    if (isCash) {
      cashExpenses = roundMoney(cashExpenses + amt);
    } else {
      bankExpenses = roundMoney(bankExpenses + amt);
    }

    const catEntry = catMap.get(exp.expenseCategory);
    if (catEntry) {
      catEntry.count++;
      catEntry.total = roundMoney(catEntry.total + amt);
      if (isCash) catEntry.cash = roundMoney(catEntry.cash + amt);
      else catEntry.bank = roundMoney(catEntry.bank + amt);
    }

    const expDate = (exp.expenseDate || '').split('T')[0];
    if (expDate) {
      const dEntry = getDailyEntry(expDate);
      dEntry.expensesCount++;
      dEntry.operatingExpenses = roundMoney(dEntry.operatingExpenses + amt);
      if (isCash) dEntry.cashExpenses = roundMoney(dEntry.cashExpenses + amt);
      else dEntry.bankExpenses = roundMoney(dEntry.bankExpenses + amt);
    }
  }

  // 4. Operating P&L Equations
  const netSales = roundMoney(grossSales - salesReturns);
  const netCOGS = roundMoney(grossCOGS - returnedCOGS);
  const grossProfit = roundMoney(netSales - netCOGS);
  const grossProfitMargin =
    netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0;
  const operatingProfit = roundMoney(grossProfit - totalOperatingExpenses);
  const operatingProfitMargin =
    netSales > 0 ? Number(((operatingProfit / netSales) * 100).toFixed(2)) : 0;

  // Build daily breakdown sorted chronologically
  const dailyBreakdown: DailyProfitLossBreakdown[] = Array.from(dailyMap.entries())
    .map(([date, d]) => {
      const dNetSales = roundMoney(d.grossSales - d.salesReturns);
      const dNetCOGS = roundMoney(d.grossCOGS - d.returnedCOGS);
      const dGrossProfit = roundMoney(dNetSales - dNetCOGS);
      const dGrossMargin =
        dNetSales > 0 ? Number(((dGrossProfit / dNetSales) * 100).toFixed(2)) : 0;
      const dOperatingProfit = roundMoney(dGrossProfit - d.operatingExpenses);
      const dOperatingMargin =
        dNetSales > 0 ? Number(((dOperatingProfit / dNetSales) * 100).toFixed(2)) : 0;

      return {
        date,
        grossSales: d.grossSales,
        salesReturns: d.salesReturns,
        netSales: dNetSales,
        grossCOGS: d.grossCOGS,
        returnedCOGS: d.returnedCOGS,
        netCOGS: dNetCOGS,
        grossProfit: dGrossProfit,
        grossProfitMargin: dGrossMargin,
        operatingExpenses: d.operatingExpenses,
        cashExpenses: d.cashExpenses,
        bankExpenses: d.bankExpenses,
        operatingProfit: dOperatingProfit,
        operatingProfitMargin: dOperatingMargin,
        invoicesCount: d.invoicesCount,
        returnsCount: d.returnsCount,
        expensesCount: d.expensesCount,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build category expense list
  const categoryExpenses: ProfitLossCategoryExpense[] = Array.from(catMap.entries())
    .filter(([, data]) => data.total > 0 || data.count > 0)
    .map(([category, data]) => ({
      category,
      label: EXPENSE_CATEGORY_LABELS[category] || category,
      count: data.count,
      totalAmount: data.total,
      cashAmount: data.cash,
      bankAmount: data.bank,
      percentage:
        totalOperatingExpenses > 0
          ? Number(((data.total / totalOperatingExpenses) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // Construct Disclosure Note
  let disclosure =
    'This Operating Profit & Loss report reflects operational revenue (Net Sales), Cost of Goods Sold from historical sales snapshots, and recorded operating expenses. Taxes, depreciation, and asset amortization are not included.';
  if (missingCostItemCount > 0) {
    disclosure += ` [Historical Cost Disclosure]: ${missingCostItemCount} item unit(s) across ${missingCostSalesCount} invoice(s) have unrecorded historical unit costs (0 PKR). Net COGS reflects recorded cost history only; current product prices were not retroactively substituted.`;
  }

  const summary: ProfitLossSummary = {
    grossSales,
    salesReturns,
    netSales,
    grossCOGS,
    returnedCOGS,
    netCOGS,
    grossProfit,
    grossProfitMargin,
    totalOperatingExpenses,
    cashExpenses,
    bankExpenses,
    operatingProfit,
    operatingProfitMargin,
    totalInvoicesCount: sales.length,
    totalReturnsCount: returns.length,
    totalExpensesCount: expenses.length,
    missingCostItemCount,
    missingCostSalesCount,
    missingReturnCostCount,
    disclosureNote: disclosure,
  };

  return {
    dateRange,
    summary,
    dailyBreakdown,
    categoryExpenses,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Retrieves Operating Profit & Loss data across sales, returns, and expenses for any date range.
 * Cost & Performance Safeguards:
 * - Employs bounded date range queries on all 3 collections.
 * - Cursor pagination loops (batch size 500) preventing incomplete record sets.
 * - 5-minute memory caching.
 */
export const getOperatingProfitLossReport = async (
  dateRange: DateRange,
  filters: ProfitLossFilters = {}
): Promise<OperatingProfitLossResult> => {
  const cacheKey = JSON.stringify({
    start: dateRange.startDate,
    end: dateRange.endDate,
    filters,
  });

  const cached = profitLossCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      report: cached.data,
      sales: [],
      returns: [],
      expenses: [],
    };
  }

  const { cleanStart, endStringBound } = getInclusiveQueryBounds(
    dateRange.startDate,
    dateRange.endDate
  );

  const sales: SaleDocument[] = [];
  const returns: SaleReturnDocument[] = [];
  const expenses: ExpenseDocument[] = [];

  if (db) {
    // 1. Fetch Sales within bounded date range using batch pagination
    let lastSaleDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreSales = true;

    while (hasMoreSales) {
      const salesConstraints: any[] = [
        where('saleDate', '>=', cleanStart),
        where('saleDate', '<=', endStringBound),
        orderBy('saleDate', 'asc'),
        limit(500),
      ];
      if (lastSaleDoc) {
        salesConstraints.push(startAfter(lastSaleDoc));
      }

      const snap = await getDocs(query(collection(db, 'sales'), ...salesConstraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        sales.push({ ...(d.data() as SaleDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreSales = false;
      } else {
        lastSaleDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 2. Fetch Sales Returns within bounded date range
    let lastReturnDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreReturns = true;

    while (hasMoreReturns) {
      const returnConstraints: any[] = [
        where('returnDate', '>=', cleanStart),
        where('returnDate', '<=', endStringBound),
        orderBy('returnDate', 'asc'),
        limit(500),
      ];
      if (lastReturnDoc) {
        returnConstraints.push(startAfter(lastReturnDoc));
      }

      const snap = await getDocs(
        query(collection(db, 'salesReturns'), ...returnConstraints)
      );
      if (snap.empty) break;

      for (const d of snap.docs) {
        returns.push({ ...(d.data() as SaleReturnDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreReturns = false;
      } else {
        lastReturnDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 3. Fetch Expenses within bounded date range
    let lastExpenseDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreExpenses = true;

    while (hasMoreExpenses) {
      const expenseConstraints: any[] = [
        where('expenseDate', '>=', cleanStart),
        where('expenseDate', '<=', endStringBound),
        orderBy('expenseDate', 'desc'),
        limit(500),
      ];
      if (lastExpenseDoc) {
        expenseConstraints.push(startAfter(lastExpenseDoc));
      }

      const snap = await getDocs(
        query(collection(db, 'expenses'), ...expenseConstraints)
      );
      if (snap.empty) break;

      for (const d of snap.docs) {
        expenses.push({ ...(d.data() as ExpenseDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreExpenses = false;
      } else {
        lastExpenseDoc = snap.docs[snap.docs.length - 1];
      }
    }
  }

  // Client-side text filter if provided
  let filteredSales = sales;
  let filteredReturns = returns;
  let filteredExpenses = expenses;

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.trim().toLowerCase();
    filteredSales = filteredSales.filter(
      (s) =>
        s.invoiceNo.toLowerCase().includes(term) ||
        s.customerName.toLowerCase().includes(term)
    );
    filteredReturns = filteredReturns.filter(
      (r) =>
        r.returnNo.toLowerCase().includes(term) ||
        r.originalInvoiceNo.toLowerCase().includes(term) ||
        r.customerName.toLowerCase().includes(term)
    );
    filteredExpenses = filteredExpenses.filter(
      (e) =>
        e.title.toLowerCase().includes(term) ||
        (e.paidTo && e.paidTo.toLowerCase().includes(term))
    );
  }

  const report = calculateOperatingProfitLossMetrics(
    filteredSales,
    filteredReturns,
    filteredExpenses,
    dateRange
  );

  profitLossCache.set(cacheKey, { data: report, timestamp: Date.now() });

  return {
    report,
    sales: filteredSales,
    returns: filteredReturns,
    expenses: filteredExpenses,
  };
};

// ==============================================================================
// MODULE 6.5 — CASH FLOW & CASH BOOK REPORT IMPLEMENTATION
// ==============================================================================

export interface CashFlowResult {
  report: CashFlowReportData;
  payments: PaymentDocument[];
  expenses: ExpenseDocument[];
  purchases: PurchaseDocument[];
}

/**
 * Pure calculation engine for Cash Flow & Cash Book.
 * Strict Accounting Invariants:
 * 1. Shows actual cash and bank inflows and outflows, not invoice totals as cash received.
 * 2. Cash Inflows: Direct cash sales (paymentApplied) + Customer Khata cash recoveries.
 * 3. Digital/Bank Inflows: Bank direct sales + Bank Khata recoveries + Cheques.
 * 4. Cash Outflows: Cash sales refunds + Cash operating expenses + Cash supplier purchases.
 * 5. Bank Outflows: Bank operating expenses + Bank supplier purchases.
 * 6. Cash Drawer Reconciliation: Opening Float + Total Cash Inflows - Total Cash Outflows = Expected Closing Cash.
 * 7. Non-duplication: Khata settlements are NOT sales revenue; Supplier payments are NOT operating expenses.
 * 8. Running Cash Balance is computed sequentially for all physical cash drawer transactions.
 */
export const calculateCashFlowMetrics = (
  payments: PaymentDocument[],
  expenses: ExpenseDocument[],
  purchases: PurchaseDocument[],
  dateRange: DateRange,
  openingFloat = 0
): CashFlowReportData => {
  const roundedFloat = roundMoney(openingFloat);

  let directCashSales = 0;
  let customerCashRecoveries = 0;
  let bankDirectSales = 0;
  let bankCustomerRecoveries = 0;
  let chequeCustomerRecoveries = 0;
  let cashSalesRefunds = 0;

  let cashOperatingExpenses = 0;
  let bankOperatingExpenses = 0;

  let cashSupplierPurchases = 0;
  let bankSupplierPurchases = 0;

  const transactions: CashFlowTransaction[] = [];
  const dailyMap = new Map<
    string,
    {
      cashInflows: number;
      cashOutflows: number;
      bankInflows: number;
      bankOutflows: number;
      transactionCount: number;
    }
  >();

  const getDailyAcc = (dateStr: string) => {
    let acc = dailyMap.get(dateStr);
    if (!acc) {
      acc = {
        cashInflows: 0,
        cashOutflows: 0,
        bankInflows: 0,
        bankOutflows: 0,
        transactionCount: 0,
      };
      dailyMap.set(dateStr, acc);
    }
    return acc;
  };

  // 1. Process Payments Collection (Direct Sales, Khata Repayments, Sales Refunds)
  for (const p of payments) {
    const amt = roundMoney(p.amount);
    if (amt <= 0) continue;
    const pDate = (p.paymentDate || p.createdAt || '').split('T')[0];
    const dailyAcc = getDailyAcc(pDate);

    if (p.targetType === 'direct_sale') {
      const isCash = p.paymentMode === 'cash';
      if (isCash) {
        directCashSales = roundMoney(directCashSales + amt);
        dailyAcc.cashInflows = roundMoney(dailyAcc.cashInflows + amt);
      } else {
        bankDirectSales = roundMoney(bankDirectSales + amt);
        dailyAcc.bankInflows = roundMoney(dailyAcc.bankInflows + amt);
      }
      dailyAcc.transactionCount++;

      transactions.push({
        id: p.id || `PAY_${Math.random()}`,
        date: pDate,
        timestamp: p.createdAt || p.paymentDate,
        receiptNo: p.receiptNo || 'POS-RECEIPT',
        partyName: p.partyName || 'Counter Cash Customer',
        direction: 'inflow',
        category: 'direct_sale',
        categoryLabel: 'Direct Sale Checkout',
        paymentMode: p.paymentMode || 'cash',
        amount: amt,
        notes: p.notes,
      });
    } else if (p.targetType === 'customer_credit') {
      if (p.paymentMode === 'cash') {
        customerCashRecoveries = roundMoney(customerCashRecoveries + amt);
        dailyAcc.cashInflows = roundMoney(dailyAcc.cashInflows + amt);
      } else if (p.paymentMode === 'bank_transfer') {
        bankCustomerRecoveries = roundMoney(bankCustomerRecoveries + amt);
        dailyAcc.bankInflows = roundMoney(dailyAcc.bankInflows + amt);
      } else if (p.paymentMode === 'cheque') {
        chequeCustomerRecoveries = roundMoney(chequeCustomerRecoveries + amt);
        dailyAcc.bankInflows = roundMoney(dailyAcc.bankInflows + amt);
      }
      dailyAcc.transactionCount++;

      transactions.push({
        id: p.id || `PAY_${Math.random()}`,
        date: pDate,
        timestamp: p.createdAt || p.paymentDate,
        receiptNo: p.receiptNo || 'KHATA-RCP',
        partyName: p.partyName || 'Credit Khata Customer',
        direction: 'inflow',
        category: 'customer_recovery',
        categoryLabel: 'Customer Khata Recovery',
        paymentMode: p.paymentMode || 'cash',
        amount: amt,
        notes: p.notes,
      });
    } else if (p.targetType === 'sales_refund') {
      cashSalesRefunds = roundMoney(cashSalesRefunds + amt);
      dailyAcc.cashOutflows = roundMoney(dailyAcc.cashOutflows + amt);
      dailyAcc.transactionCount++;

      transactions.push({
        id: p.id || `PAY_${Math.random()}`,
        date: pDate,
        timestamp: p.createdAt || p.paymentDate,
        receiptNo: p.receiptNo || 'REF-RCP',
        partyName: p.partyName || 'Sales Return Customer',
        direction: 'outflow',
        category: 'sales_refund',
        categoryLabel: 'Sales Return Refund',
        paymentMode: p.paymentMode || 'cash',
        amount: amt,
        notes: p.notes,
      });
    } else if (p.targetType === 'supplier_payable') {
      const isCash = p.paymentMode === 'cash';
      if (isCash) {
        cashSupplierPurchases = roundMoney(cashSupplierPurchases + amt);
        dailyAcc.cashOutflows = roundMoney(dailyAcc.cashOutflows + amt);
      } else {
        bankSupplierPurchases = roundMoney(bankSupplierPurchases + amt);
        dailyAcc.bankOutflows = roundMoney(dailyAcc.bankOutflows + amt);
      }
      dailyAcc.transactionCount++;

      transactions.push({
        id: p.id || `PAY_${Math.random()}`,
        date: pDate,
        timestamp: p.createdAt || p.paymentDate,
        receiptNo: p.receiptNo || 'SUP-PAY-RCP',
        partyName: p.partyName || 'Supplier Payment',
        direction: 'outflow',
        category: 'supplier_payment',
        categoryLabel: 'Supplier Khata Settlement',
        paymentMode: p.paymentMode || 'cash',
        amount: amt,
        notes: p.notes,
      });
    }
  }

  // 2. Process Expenses Collection (Operating Expenses)
  for (const exp of expenses) {
    const amt = roundMoney(exp.amount);
    if (amt <= 0) continue;
    const eDate = (exp.expenseDate || exp.createdAt || '').split('T')[0];
    const dailyAcc = getDailyAcc(eDate);
    const isCash = exp.paymentMode === 'cash';

    if (isCash) {
      cashOperatingExpenses = roundMoney(cashOperatingExpenses + amt);
      dailyAcc.cashOutflows = roundMoney(dailyAcc.cashOutflows + amt);
    } else {
      bankOperatingExpenses = roundMoney(bankOperatingExpenses + amt);
      dailyAcc.bankOutflows = roundMoney(dailyAcc.bankOutflows + amt);
    }
    dailyAcc.transactionCount++;

    transactions.push({
      id: exp.id || `EXP_${Math.random()}`,
      date: eDate,
      timestamp: exp.createdAt || exp.expenseDate,
      receiptNo: exp.referenceNo || `EXP-${exp.id?.slice(0, 6) || 'VOUCH'}`,
      partyName: exp.paidTo || exp.title,
      direction: 'outflow',
      category: 'operating_expense',
      categoryLabel: EXPENSE_CATEGORY_LABELS[exp.expenseCategory] || 'Operating Expense',
      paymentMode: exp.paymentMode || 'cash',
      amount: amt,
      notes: exp.title
        ? `${exp.title}${exp.notes ? ` — ${exp.notes}` : ''}`
        : exp.notes,
    });
  }

  // 3. Process Purchases Collection (Only actual money paid, paidAmount > 0)
  for (const pur of purchases) {
    const paid = roundMoney(pur.paidAmount);
    if (paid <= 0) continue; // Unpaid / pure credit purchase has no immediate cash or bank outflow

    const purDate = (pur.purchaseDate || pur.createdAt || '').split('T')[0];
    const dailyAcc = getDailyAcc(purDate);
    const isCash = pur.paymentMethod === 'cash';

    if (isCash) {
      cashSupplierPurchases = roundMoney(cashSupplierPurchases + paid);
      dailyAcc.cashOutflows = roundMoney(dailyAcc.cashOutflows + paid);
    } else {
      bankSupplierPurchases = roundMoney(bankSupplierPurchases + paid);
      dailyAcc.bankOutflows = roundMoney(dailyAcc.bankOutflows + paid);
    }
    dailyAcc.transactionCount++;

    transactions.push({
      id: pur.id || `PUR_${Math.random()}`,
      date: purDate,
      timestamp: pur.createdAt || pur.purchaseDate,
      receiptNo: pur.purchaseInvoiceNo || 'BILL',
      partyName: pur.supplierName || 'Book Publisher / Supplier',
      direction: 'outflow',
      category: 'supplier_payment',
      categoryLabel: 'Supplier Purchase Intake Payment',
      paymentMode: isCash ? 'cash' : 'bank_transfer',
      amount: paid,
      notes: `Invoice: ${pur.purchaseInvoiceNo}${pur.notes ? ` — ${pur.notes}` : ''}`,
    });
  }

  // Sort transactions chronologically (ascending) to compute sequential running physical cash balance
  transactions.sort((a, b) => {
    const timeA = a.timestamp || a.date;
    const timeB = b.timestamp || b.date;
    return timeA.localeCompare(timeB);
  });

  let runningCash = roundedFloat;
  for (const t of transactions) {
    if (t.paymentMode === 'cash') {
      if (t.direction === 'inflow') {
        runningCash = roundMoney(runningCash + t.amount);
      } else {
        runningCash = roundMoney(runningCash - t.amount);
      }
      t.runningCashBalance = runningCash;
    }
  }

  // Aggregated Totals
  const totalCashInflows = roundMoney(directCashSales + customerCashRecoveries);
  const totalCashOutflows = roundMoney(
    cashSalesRefunds + cashOperatingExpenses + cashSupplierPurchases
  );
  const netPhysicalCashFlow = roundMoney(totalCashInflows - totalCashOutflows);
  const expectedClosingDrawerCash = roundMoney(roundedFloat + netPhysicalCashFlow);

  const totalBankInflows = roundMoney(
    bankDirectSales + bankCustomerRecoveries + chequeCustomerRecoveries
  );
  const totalBankOutflows = roundMoney(bankOperatingExpenses + bankSupplierPurchases);
  const netBankFlow = roundMoney(totalBankInflows - totalBankOutflows);

  const consolidatedTotalInflows = roundMoney(totalCashInflows + totalBankInflows);
  const consolidatedTotalOutflows = roundMoney(totalCashOutflows + totalBankOutflows);
  const netConsolidatedCashPosition = roundMoney(netPhysicalCashFlow + netBankFlow);

  // Daily Breakdown array
  const dailyBreakdown: DailyCashFlowBreakdown[] = Array.from(dailyMap.entries())
    .map(([date, d]) => {
      const netCash = roundMoney(d.cashInflows - d.cashOutflows);
      const netBank = roundMoney(d.bankInflows - d.bankOutflows);
      return {
        date,
        cashInflows: d.cashInflows,
        cashOutflows: d.cashOutflows,
        netCash,
        bankInflows: d.bankInflows,
        bankOutflows: d.bankOutflows,
        netBank,
        totalInflows: roundMoney(d.cashInflows + d.bankInflows),
        totalOutflows: roundMoney(d.cashOutflows + d.bankOutflows),
        netCombined: roundMoney(netCash + netBank),
        transactionCount: d.transactionCount,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const cashCount = transactions.filter((t) => t.paymentMode === 'cash').length;
  const bankCount = transactions.filter((t) => t.paymentMode !== 'cash').length;

  const summary: CashFlowSummary = {
    openingCashFloat: roundedFloat,
    directCashSales,
    customerCashRecoveries,
    totalCashInflows,
    cashSalesRefunds,
    cashOperatingExpenses,
    cashSupplierPurchases,
    totalCashOutflows,
    netPhysicalCashFlow,
    expectedClosingDrawerCash,
    bankDirectSales,
    bankCustomerRecoveries,
    chequeCustomerRecoveries,
    totalBankInflows,
    bankOperatingExpenses,
    bankSupplierPurchases,
    totalBankOutflows,
    netBankFlow,
    consolidatedTotalInflows,
    consolidatedTotalOutflows,
    netConsolidatedCashPosition,
    totalTransactionsCount: transactions.length,
    cashTransactionsCount: cashCount,
    bankTransactionsCount: bankCount,
  };

  return {
    dateRange,
    summary,
    dailyBreakdown,
    transactions,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Retrieves Cash Flow & Cash Book data across payments, expenses, and purchases for any date range.
 * Cost & Performance Safeguards:
 * - Employs bounded date range queries on all 3 collections.
 * - Cursor pagination loops (batch size 500) preventing incomplete record sets.
 * - 5-minute memory caching.
 */
export const getCashFlowReport = async (
  dateRange: DateRange,
  filters: CashFlowFilters = {},
  openingFloat = 0
): Promise<CashFlowResult> => {
  const cacheKey = JSON.stringify({
    start: dateRange.startDate,
    end: dateRange.endDate,
    filters,
    openingFloat,
  });

  const cached = cashFlowCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      report: cached.data,
      payments: [],
      expenses: [],
      purchases: [],
    };
  }

  const { cleanStart, endStringBound } = getInclusiveQueryBounds(
    dateRange.startDate,
    dateRange.endDate
  );

  const payments: PaymentDocument[] = [];
  const expenses: ExpenseDocument[] = [];
  const purchases: PurchaseDocument[] = [];

  if (db) {
    // 1. Fetch Payments within bounded date range using batch pagination
    let lastPaymentDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMorePayments = true;

    while (hasMorePayments) {
      const paymentConstraints: any[] = [
        where('paymentDate', '>=', cleanStart),
        where('paymentDate', '<=', endStringBound),
        orderBy('paymentDate', 'asc'),
        limit(500),
      ];
      if (lastPaymentDoc) {
        paymentConstraints.push(startAfter(lastPaymentDoc));
      }

      const snap = await getDocs(
        query(collection(db, 'payments'), ...paymentConstraints)
      );
      if (snap.empty) break;

      for (const d of snap.docs) {
        payments.push({ ...(d.data() as PaymentDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMorePayments = false;
      } else {
        lastPaymentDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 2. Fetch Expenses within bounded date range
    let lastExpenseDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreExpenses = true;

    while (hasMoreExpenses) {
      const expenseConstraints: any[] = [
        where('expenseDate', '>=', cleanStart),
        where('expenseDate', '<=', endStringBound),
        orderBy('expenseDate', 'desc'),
        limit(500),
      ];
      if (lastExpenseDoc) {
        expenseConstraints.push(startAfter(lastExpenseDoc));
      }

      const snap = await getDocs(
        query(collection(db, 'expenses'), ...expenseConstraints)
      );
      if (snap.empty) break;

      for (const d of snap.docs) {
        expenses.push({ ...(d.data() as ExpenseDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreExpenses = false;
      } else {
        lastExpenseDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 3. Fetch Purchases within bounded date range
    let lastPurchaseDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMorePurchases = true;

    while (hasMorePurchases) {
      const purchaseConstraints: any[] = [
        where('purchaseDate', '>=', cleanStart),
        where('purchaseDate', '<=', endStringBound),
        orderBy('purchaseDate', 'asc'),
        limit(500),
      ];
      if (lastPurchaseDoc) {
        purchaseConstraints.push(startAfter(lastPurchaseDoc));
      }

      const snap = await getDocs(
        query(collection(db, 'purchases'), ...purchaseConstraints)
      );
      if (snap.empty) break;

      for (const d of snap.docs) {
        purchases.push({ ...(d.data() as PurchaseDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMorePurchases = false;
      } else {
        lastPurchaseDoc = snap.docs[snap.docs.length - 1];
      }
    }
  }

  // Calculate base report
  const rawReport = calculateCashFlowMetrics(
    payments,
    expenses,
    purchases,
    dateRange,
    openingFloat
  );

  // Apply client-side filters on transactions list if requested
  let filteredTransactions = rawReport.transactions;

  if (filters.mode && filters.mode !== 'all') {
    filteredTransactions = filteredTransactions.filter(
      (t) => t.paymentMode === filters.mode
    );
  }

  if (filters.direction && filters.direction !== 'all') {
    filteredTransactions = filteredTransactions.filter(
      (t) => t.direction === filters.direction
    );
  }

  if (filters.category && filters.category !== 'all') {
    filteredTransactions = filteredTransactions.filter(
      (t) => t.category === filters.category
    );
  }

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.trim().toLowerCase();
    filteredTransactions = filteredTransactions.filter(
      (t) =>
        t.receiptNo.toLowerCase().includes(term) ||
        t.partyName.toLowerCase().includes(term) ||
        (t.notes && t.notes.toLowerCase().includes(term))
    );
  }

  const finalReport: CashFlowReportData = {
    ...rawReport,
    transactions: filteredTransactions,
  };

  cashFlowCache.set(cacheKey, { data: finalReport, timestamp: Date.now() });

  return {
    report: finalReport,
    payments,
    expenses,
    purchases,
  };
};

// ==============================================================================
// MODULE 6.6 — CUSTOMER OUTSTANDING / RECEIVABLES REPORT IMPLEMENTATION
// ==============================================================================

export interface CustomerReceivablesResult {
  report: CustomerReceivablesReportData;
  customers: CustomerDocument[];
  ledgerEntries: CustomerLedgerDocument[];
}

export const calculateCustomerReceivablesMetrics = (
  customers: CustomerDocument[],
  ledgerEntries: CustomerLedgerDocument[],
  asOfDate: string,
  filters: CustomerReceivablesFilters = {}
): CustomerReceivablesReportData => {
  const ledgerByCustomer = new Map<string, CustomerLedgerDocument[]>();
  for (const entry of ledgerEntries) {
    const list = ledgerByCustomer.get(entry.customerId) || [];
    list.push(entry);
    ledgerByCustomer.set(entry.customerId, list);
  }

  const agingSummary: CustomerAgingBucket = {
    current30: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
  };

  let totalOutstandingReceivables = 0;
  let totalCreditLimit = 0;
  let totalOverdueAmount = 0;
  let totalAdvanceAmount = 0;
  let customersWithBalanceCount = 0;
  let advanceCustomersCount = 0;
  let zeroBalanceCustomersCount = 0;
  let wholesalerReceivables = 0;
  let marketshopReceivables = 0;
  let parchonReceivables = 0;

  const items: CustomerReceivableItem[] = [];

  for (const customer of customers) {
    const rawBalance = Number(customer.currentBalance) || 0;
    const balance = roundMoney(rawBalance);
    const creditLimit = roundMoney(Number(customer.creditLimit) || 0);
    const creditDays =
      customer.creditDays && customer.creditDays > 0 ? customer.creditDays : undefined;

    if (customer.isActive) {
      totalCreditLimit = roundMoney(totalCreditLimit + creditLimit);
    }

    if (balance > 0) {
      totalOutstandingReceivables = roundMoney(totalOutstandingReceivables + balance);
      customersWithBalanceCount++;
      if (customer.type === 'wholesaler') {
        wholesalerReceivables = roundMoney(wholesalerReceivables + balance);
      } else if (customer.type === 'marketshop') {
        marketshopReceivables = roundMoney(marketshopReceivables + balance);
      } else {
        parchonReceivables = roundMoney(parchonReceivables + balance);
      }
    } else if (balance < 0) {
      totalAdvanceAmount = roundMoney(totalAdvanceAmount + Math.abs(balance));
      advanceCustomersCount++;
    } else {
      zeroBalanceCustomersCount++;
    }

    const creditUtilizationPct =
      creditLimit > 0 ? roundMoney((Math.max(0, balance) / creditLimit) * 100) : 0;

    const termsLabel = creditDays
      ? `${creditDays} Days`
      : 'Standard Terms (No fixed due date)';

    const cEntries = (ledgerByCustomer.get(customer.id) || []).slice();
    cEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const lastPayment = cEntries.find((e) => e.entryType === 'credit');
    const lastDebit = cEntries.find((e) => e.entryType === 'debit');

    const lastPaymentDate = lastPayment?.date;
    const lastPaymentAmount = lastPayment ? roundMoney(lastPayment.amount) : undefined;
    const lastSaleDate = lastDebit?.date;
    const lastSaleAmount = lastDebit ? roundMoney(lastDebit.amount) : undefined;

    const customerAging: CustomerAgingBucket = {
      current30: 0,
      days31To60: 0,
      days61To90: 0,
      days90Plus: 0,
    };

    let isOverdue = false;
    let overdueAmount = 0;
    let estimatedDueDate: string | undefined = undefined;

    if (balance > 0) {
      let unallocated = balance;
      let overdueAcc = 0;
      let oldestOverdueDebitDate: string | undefined = undefined;

      const debits = cEntries.filter((e) => e.entryType === 'debit');

      for (const deb of debits) {
        if (unallocated <= 0) break;
        const debAmt = roundMoney(deb.amount);
        if (debAmt <= 0) continue;

        const alloc = Math.min(debAmt, unallocated);
        const debDate = (deb.date || asOfDate).split('T')[0];
        const diffMs = new Date(asOfDate).getTime() - new Date(debDate).getTime();
        const daysDiff = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        if (daysDiff <= 30) {
          customerAging.current30 = roundMoney(customerAging.current30 + alloc);
        } else if (daysDiff <= 60) {
          customerAging.days31To60 = roundMoney(customerAging.days31To60 + alloc);
        } else if (daysDiff <= 90) {
          customerAging.days61To90 = roundMoney(customerAging.days61To90 + alloc);
        } else {
          customerAging.days90Plus = roundMoney(customerAging.days90Plus + alloc);
        }

        if (creditDays) {
          if (daysDiff > creditDays) {
            overdueAcc = roundMoney(overdueAcc + alloc);
            if (!oldestOverdueDebitDate || debDate < oldestOverdueDebitDate) {
              oldestOverdueDebitDate = debDate;
            }
          }
        }

        unallocated = roundMoney(unallocated - alloc);
      }

      if (unallocated > 0) {
        customerAging.days90Plus = roundMoney(customerAging.days90Plus + unallocated);
        if (creditDays) {
          overdueAcc = roundMoney(overdueAcc + unallocated);
        }
        unallocated = 0;
      }

      agingSummary.current30 = roundMoney(agingSummary.current30 + customerAging.current30);
      agingSummary.days31To60 = roundMoney(agingSummary.days31To60 + customerAging.days31To60);
      agingSummary.days61To90 = roundMoney(agingSummary.days61To90 + customerAging.days61To90);
      agingSummary.days90Plus = roundMoney(agingSummary.days90Plus + customerAging.days90Plus);

      if (creditDays && overdueAcc > 0) {
        isOverdue = true;
        overdueAmount = overdueAcc;
        totalOverdueAmount = roundMoney(totalOverdueAmount + overdueAcc);

        if (oldestOverdueDebitDate) {
          const d = new Date(oldestOverdueDebitDate);
          d.setDate(d.getDate() + creditDays);
          estimatedDueDate = d.toISOString().split('T')[0];
        } else {
          estimatedDueDate = 'Overdue';
        }
      }
    }

    items.push({
      customerId: customer.id,
      customerName: customer.name,
      shopName: customer.shopName,
      customerType: customer.type,
      phone: customer.phone,
      currentBalance: balance,
      creditLimit,
      creditDays,
      creditUtilizationPct,
      isOverdue,
      overdueAmount,
      estimatedDueDate,
      termsLabel,
      aging: customerAging,
      lastPaymentDate,
      lastPaymentAmount,
      lastSaleDate,
      lastSaleAmount,
    });
  }

  let filteredItems = items;

  if (filters.customerType && filters.customerType !== 'all') {
    filteredItems = filteredItems.filter((i) => i.customerType === filters.customerType);
  }

  if (filters.balanceStatus && filters.balanceStatus !== 'all') {
    if (filters.balanceStatus === 'has_balance') {
      filteredItems = filteredItems.filter((i) => i.currentBalance > 0);
    } else if (filters.balanceStatus === 'overdue_only') {
      filteredItems = filteredItems.filter((i) => i.isOverdue);
    } else if (filters.balanceStatus === 'advance_only') {
      filteredItems = filteredItems.filter((i) => i.currentBalance < 0);
    } else if (filters.balanceStatus === 'zero_balance') {
      filteredItems = filteredItems.filter((i) => i.currentBalance === 0);
    }
  }

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.trim().toLowerCase();
    filteredItems = filteredItems.filter(
      (i) =>
        i.customerName.toLowerCase().includes(term) ||
        (i.shopName && i.shopName.toLowerCase().includes(term)) ||
        i.phone.toLowerCase().includes(term)
    );
  }

  if (filters.sortBy === 'balance_asc') {
    filteredItems.sort((a, b) => a.currentBalance - b.currentBalance);
  } else if (filters.sortBy === 'overdue_desc') {
    filteredItems.sort((a, b) => b.overdueAmount - a.overdueAmount || b.currentBalance - a.currentBalance);
  } else if (filters.sortBy === 'name_asc') {
    filteredItems.sort((a, b) => a.customerName.localeCompare(b.customerName));
  } else {
    filteredItems.sort((a, b) => b.currentBalance - a.currentBalance);
  }

  const overallCreditUtilizationPct =
    totalCreditLimit > 0
      ? roundMoney((totalOutstandingReceivables / totalCreditLimit) * 100)
      : 0;

  const averageReceivableBalance =
    customersWithBalanceCount > 0
      ? roundMoney(totalOutstandingReceivables / customersWithBalanceCount)
      : 0;

  const summary: CustomerReceivablesSummary = {
    totalOutstandingReceivables,
    totalCreditLimit,
    overallCreditUtilizationPct,
    totalOverdueAmount,
    totalAdvanceAmount,
    customersWithBalanceCount,
    advanceCustomersCount,
    zeroBalanceCustomersCount,
    totalCustomersCount: customers.length,
    agingSummary,
    wholesalerReceivables,
    marketshopReceivables,
    parchonReceivables,
    averageReceivableBalance,
  };

  return {
    summary,
    customers: filteredItems,
    generatedAt: new Date().toISOString(),
  };
};

export const getCustomerReceivablesReport = async (
  filters: CustomerReceivablesFilters = {},
  asOfDate = new Date().toISOString().split('T')[0],
  forceRefresh = false
): Promise<CustomerReceivablesResult> => {
  const cacheKey = JSON.stringify({ filters, asOfDate });
  if (!forceRefresh) {
    const cached = receivablesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        report: cached.data,
        customers: [],
        ledgerEntries: [],
      };
    }
  }

  const customers: CustomerDocument[] = [];
  const ledgerEntries: CustomerLedgerDocument[] = [];

  if (db) {
    // 1. Fetch all active customers via bounded pagination
    let lastCustomerDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreCustomers = true;

    while (hasMoreCustomers) {
      const constraints: any[] = [
        where('isActive', '==', true),
        limit(500),
      ];
      if (lastCustomerDoc) {
        constraints.push(startAfter(lastCustomerDoc));
      }

      const snap = await getDocs(query(collection(db, 'customers'), ...constraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        customers.push({ ...(d.data() as CustomerDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreCustomers = false;
      } else {
        lastCustomerDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 2. Fetch ledger entries via bounded pagination
    let lastLedgerDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreLedger = true;

    while (hasMoreLedger) {
      const constraints: any[] = [
        orderBy('date', 'desc'),
        limit(500),
      ];
      if (lastLedgerDoc) {
        constraints.push(startAfter(lastLedgerDoc));
      }

      const snap = await getDocs(query(collection(db, 'customerLedger'), ...constraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        ledgerEntries.push({ ...(d.data() as CustomerLedgerDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreLedger = false;
      } else {
        lastLedgerDoc = snap.docs[snap.docs.length - 1];
      }
    }
  }

  const finalReport = calculateCustomerReceivablesMetrics(
    customers,
    ledgerEntries,
    asOfDate,
    filters
  );

  receivablesCache.set(cacheKey, { data: finalReport, timestamp: Date.now() });

  return {
    report: finalReport,
    customers,
    ledgerEntries,
  };
};

// ==============================================================================
// MODULE 6.7 — SUPPLIER PAYABLES REPORT IMPLEMENTATION
// ==============================================================================

export interface SupplierPayablesResult {
  report: SupplierPayablesReportData;
  suppliers: SupplierDocument[];
  purchases: PurchaseDocument[];
}

export const calculateSupplierPayablesMetrics = (
  suppliers: SupplierDocument[],
  purchases: PurchaseDocument[],
  asOfDate: string,
  filters: SupplierPayablesFilters = {}
): SupplierPayablesReportData => {
  const purchasesBySupplier = new Map<string, PurchaseDocument[]>();
  for (const pur of purchases) {
    const list = purchasesBySupplier.get(pur.supplierId) || [];
    list.push(pur);
    purchasesBySupplier.set(pur.supplierId, list);
  }

  const agingSummary: SupplierAgingBucket = {
    current30: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
  };

  let totalOutstandingPayables = 0;
  let suppliersWithBalanceCount = 0;
  let zeroBalanceSuppliersCount = 0;
  let totalUnpaidInvoicesCount = 0;

  const items: SupplierPayableItem[] = [];

  for (const supplier of suppliers) {
    const balance = roundMoney(Number(supplier.currentBalance) || 0);

    if (balance > 0) {
      totalOutstandingPayables = roundMoney(totalOutstandingPayables + balance);
      suppliersWithBalanceCount++;
    } else {
      zeroBalanceSuppliersCount++;
    }

    const sPurchases = (purchasesBySupplier.get(supplier.id) || []).slice();
    sPurchases.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));

    const totalPurchasesCount = sPurchases.length;
    const totalPurchasesValue = roundMoney(
      sPurchases.reduce((acc, p) => acc + (Number(p.grandTotal) || 0), 0)
    );
    const totalIntakePaid = roundMoney(
      sPurchases.reduce((acc, p) => acc + (Number(p.paidAmount) || 0), 0)
    );
    const totalRemainingPurchaseBalance = roundMoney(
      sPurchases.reduce((acc, p) => acc + (Number(p.remainingBalance) || 0), 0)
    );

    const unpaidInvoices = sPurchases.filter((p) => (Number(p.remainingBalance) || 0) > 0);
    const unpaidInvoicesCount = unpaidInvoices.length;
    totalUnpaidInvoicesCount += unpaidInvoicesCount;

    const lastPurchase = sPurchases[0];
    const lastPurchaseDate = lastPurchase?.purchaseDate;

    const totalSettlementPaid =
      totalRemainingPurchaseBalance > balance
        ? roundMoney(totalRemainingPurchaseBalance - balance)
        : 0;

    const supplierAging: SupplierAgingBucket = {
      current30: 0,
      days31To60: 0,
      days61To90: 0,
      days90Plus: 0,
    };

    if (balance > 0) {
      let unallocated = balance;
      const invoicesToAge = unpaidInvoices.length > 0 ? unpaidInvoices : sPurchases;

      for (const inv of invoicesToAge) {
        if (unallocated <= 0) break;
        const openAmt =
          Number(inv.remainingBalance) > 0 ? Number(inv.remainingBalance) : Number(inv.grandTotal);
        const invAmt = roundMoney(openAmt);
        if (invAmt <= 0) continue;

        const alloc = Math.min(invAmt, unallocated);
        const invDate = (inv.purchaseDate || asOfDate).split('T')[0];
        const diffMs = new Date(asOfDate).getTime() - new Date(invDate).getTime();
        const daysDiff = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        if (daysDiff <= 30) {
          supplierAging.current30 = roundMoney(supplierAging.current30 + alloc);
        } else if (daysDiff <= 60) {
          supplierAging.days31To60 = roundMoney(supplierAging.days31To60 + alloc);
        } else if (daysDiff <= 90) {
          supplierAging.days61To90 = roundMoney(supplierAging.days61To90 + alloc);
        } else {
          supplierAging.days90Plus = roundMoney(supplierAging.days90Plus + alloc);
        }

        unallocated = roundMoney(unallocated - alloc);
      }

      if (unallocated > 0) {
        supplierAging.days90Plus = roundMoney(supplierAging.days90Plus + unallocated);
        unallocated = 0;
      }

      agingSummary.current30 = roundMoney(agingSummary.current30 + supplierAging.current30);
      agingSummary.days31To60 = roundMoney(agingSummary.days31To60 + supplierAging.days31To60);
      agingSummary.days61To90 = roundMoney(agingSummary.days61To90 + supplierAging.days61To90);
      agingSummary.days90Plus = roundMoney(agingSummary.days90Plus + supplierAging.days90Plus);
    }

    items.push({
      supplierId: supplier.id,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      currentBalance: balance,
      totalPurchasesCount,
      totalPurchasesValue,
      totalIntakePaid,
      totalSettlementPaid,
      totalRemainingPurchaseBalance,
      lastPurchaseDate,
      unpaidInvoicesCount,
      aging: supplierAging,
    });
  }

  let filteredItems = items;
  if (filters.balanceStatus && filters.balanceStatus !== 'all') {
    if (filters.balanceStatus === 'has_balance') {
      filteredItems = filteredItems.filter((i) => i.currentBalance > 0);
    } else if (filters.balanceStatus === 'zero_balance') {
      filteredItems = filteredItems.filter((i) => i.currentBalance <= 0);
    }
  }

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.trim().toLowerCase();
    filteredItems = filteredItems.filter(
      (i) =>
        i.companyName.toLowerCase().includes(term) ||
        i.contactPerson.toLowerCase().includes(term) ||
        i.phone.toLowerCase().includes(term)
    );
  }

  if (filters.sortBy === 'balance_asc') {
    filteredItems.sort((a, b) => a.currentBalance - b.currentBalance);
  } else if (filters.sortBy === 'name_asc') {
    filteredItems.sort((a, b) => a.companyName.localeCompare(b.companyName));
  } else {
    filteredItems.sort((a, b) => b.currentBalance - a.currentBalance);
  }

  const averagePayableBalance =
    suppliersWithBalanceCount > 0
      ? roundMoney(totalOutstandingPayables / suppliersWithBalanceCount)
      : 0;

  const summary: SupplierPayablesSummary = {
    totalOutstandingPayables,
    suppliersWithBalanceCount,
    zeroBalanceSuppliersCount,
    totalSuppliersCount: suppliers.length,
    totalUnpaidInvoicesCount,
    agingSummary,
    averagePayableBalance,
  };

  return {
    summary,
    suppliers: filteredItems,
    generatedAt: new Date().toISOString(),
  };
};

export const getSupplierPayablesReport = async (
  filters: SupplierPayablesFilters = {},
  asOfDate = new Date().toISOString().split('T')[0],
  forceRefresh = false
): Promise<SupplierPayablesResult> => {
  const cacheKey = JSON.stringify({ filters, asOfDate });
  if (!forceRefresh) {
    const cached = payablesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        report: cached.data,
        suppliers: [],
        purchases: [],
      };
    }
  }

  const suppliers: SupplierDocument[] = [];
  const purchases: PurchaseDocument[] = [];

  if (db) {
    // 1. Fetch active suppliers via bounded pagination
    let lastSupplierDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMoreSuppliers = true;

    while (hasMoreSuppliers) {
      const constraints: any[] = [
        where('isActive', '==', true),
        limit(500),
      ];
      if (lastSupplierDoc) {
        constraints.push(startAfter(lastSupplierDoc));
      }

      const snap = await getDocs(query(collection(db, 'suppliers'), ...constraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        suppliers.push({ ...(d.data() as SupplierDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMoreSuppliers = false;
      } else {
        lastSupplierDoc = snap.docs[snap.docs.length - 1];
      }
    }

    // 2. Fetch purchases via bounded pagination
    let lastPurchaseDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMorePurchases = true;

    while (hasMorePurchases) {
      const constraints: any[] = [
        orderBy('purchaseDate', 'desc'),
        limit(500),
      ];
      if (lastPurchaseDoc) {
        constraints.push(startAfter(lastPurchaseDoc));
      }

      const snap = await getDocs(query(collection(db, 'purchases'), ...constraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        purchases.push({ ...(d.data() as PurchaseDocument), id: d.id });
      }

      if (snap.docs.length < 500) {
        hasMorePurchases = false;
      } else {
        lastPurchaseDoc = snap.docs[snap.docs.length - 1];
      }
    }
  }

  const finalReport = calculateSupplierPayablesMetrics(
    suppliers,
    purchases,
    asOfDate,
    filters
  );

  payablesCache.set(cacheKey, { data: finalReport, timestamp: Date.now() });

  return {
    report: finalReport,
    suppliers,
    purchases,
  };
};

// ==============================================================================
// MODULE 6.8 — FULL ACCOUNTING RECONCILIATION & DISCLOSURES
// ==============================================================================

export const MANDATORY_ACCOUNTING_DISCLOSURES: AccountingDisclosure[] = [
  {
    id: 'disc_purchase_returns',
    title: 'Purchase Returns Tracking',
    scope: 'Purchase Accounting & Net Purchases',
    disclosure:
      'Purchase returns are not implemented in the current system version; value displays as "None recorded" (PKR 0) rather than inventing synthetic transactions.',
    impact: 'Net purchases equals Gross purchases with zero assumed credits.',
    tag: 'standard',
  },
  {
    id: 'disc_taxes_depreciation',
    title: 'Statutory Taxes & Depreciation',
    scope: 'Operating Profit & Loss Statement',
    disclosure:
      'Sales taxes (GST), withholding taxes, and fixed asset depreciation schedules are not tracked in this system; this statement reflects Operating Profit rather than statutory tax filing.',
    impact: 'Bottom line indicates Operating Profit, not Net Income after Tax.',
    tag: 'disclaimer',
  },
  {
    id: 'disc_supplier_settlement_arch',
    title: 'Supplier Settlement Architecture',
    scope: 'Trade Payables & Purchases Collection',
    disclosure:
      'Subsequent supplier settlements are recorded as account-level payments reducing supplier balance, preserving purchase bills as append-only immutable legal records.',
    impact: 'Purchase invoice documents reflect intake balance; net liability is authoritative on supplier records.',
    tag: 'architecture',
  },
  {
    id: 'disc_supplier_advances',
    title: 'Supplier Advance Balances',
    scope: 'Supplier Payables Balance Sheet',
    disclosure:
      'Negative supplier balances (advance payments where paid exceeds bill total) are segregated from outstanding trade payables liability.',
    impact: 'Payables liability is not artificially reduced by customer or supplier prepayments.',
    tag: 'standard',
  },
  {
    id: 'disc_payment_idempotency',
    title: 'Payment Backend Idempotency',
    scope: 'Payments & Settlement Transactions',
    disclosure:
      'Supplier and customer payment recording includes UI double-submit prevention; backend idempotency keys are not enforced at the database level.',
    impact: 'Direct API integrations must ensure client-side submission locks.',
    tag: 'disclaimer',
  },
  {
    id: 'disc_cogs_snapshot',
    title: 'Historical Cost Price Integrity',
    scope: 'Cost of Goods Sold (COGS)',
    disclosure:
      'COGS is derived exclusively from cost price snapshots taken at checkout. Items missing historical cost data are disclosed without fabricating current catalog prices.',
    impact: 'Prevents retroactive margin distortion caused by subsequent supplier price increases.',
    tag: 'standard',
  },
];

export const calculateFullAccountingReconciliation = (
  salesReport: SalesReportData,
  purchaseReport: PurchaseReportData,
  plReport: OperatingProfitLossReportData,
  cfReport: CashFlowReportData,
  receivablesReport: CustomerReceivablesReportData,
  payablesReport: SupplierPayablesReportData,
  dateRange: DateRange,
  openingFloat = 0
): FullAccountingReconciliationData => {
  const items: ReconciliationItem[] = [];

  // Formula A: Sales Integrity
  // Gross Sales - Sales Returns = Net Sales
  const grossSales = roundMoney(salesReport.summary.totalGrossSales);
  const salesReturns = roundMoney(salesReport.summary.totalSalesReturns);
  const netSales = roundMoney(salesReport.summary.netSales);
  const salesDiff = roundMoney(Math.abs(roundMoney(grossSales - salesReturns) - netSales));
  const isSalesBalanced = salesDiff === 0;

  items.push({
    id: 'rec_sales',
    category: 'sales',
    categoryLabel: 'A. Sales Revenue',
    title: 'Sales Integrity: Gross Sales − Sales Returns = Net Sales',
    formula: `${grossSales} − ${salesReturns} = ${netSales}`,
    leftTermLabel: 'Gross Sales − Returns',
    leftValue: roundMoney(grossSales - salesReturns),
    rightTermLabel: 'Net Sales Revenue',
    rightValue: netSales,
    difference: salesDiff,
    isBalanced: isSalesBalanced,
    statusText: isSalesBalanced ? 'Balanced' : `Discrepancy: PKR ${salesDiff}`,
    explanation: 'Verifies that recorded sales returns deduct accurately from invoice totals.',
  });

  // Formula B1: Gross Profit Integrity
  // Net Sales - Net COGS = Gross Profit
  const netCOGS = roundMoney(plReport.summary.netCOGS);
  const grossProfit = roundMoney(plReport.summary.grossProfit);
  const gpDiff = roundMoney(Math.abs(roundMoney(netSales - netCOGS) - grossProfit));
  const isGPBalanced = gpDiff === 0;

  items.push({
    id: 'rec_gp',
    category: 'profit_loss',
    categoryLabel: 'B. Gross Profit',
    title: 'Gross Profit: Net Sales − Net COGS = Gross Profit',
    formula: `${netSales} − ${netCOGS} = ${grossProfit}`,
    leftTermLabel: 'Net Sales − Net COGS',
    leftValue: roundMoney(netSales - netCOGS),
    rightTermLabel: 'Gross Profit',
    rightValue: grossProfit,
    difference: gpDiff,
    isBalanced: isGPBalanced,
    statusText: isGPBalanced ? 'Balanced' : `Discrepancy: PKR ${gpDiff}`,
    explanation: 'Verifies merchandise margin integrity calculated from checkout cost snapshots.',
  });

  // Formula B2: Operating Profit Integrity
  // Gross Profit - Operating Expenses = Operating Profit
  const operatingExpenses = roundMoney(plReport.summary.totalOperatingExpenses);
  const operatingProfit = roundMoney(plReport.summary.operatingProfit);
  const opDiff = roundMoney(Math.abs(roundMoney(grossProfit - operatingExpenses) - operatingProfit));
  const isOPBalanced = opDiff === 0;

  items.push({
    id: 'rec_op',
    category: 'profit_loss',
    categoryLabel: 'B. Operating Profit',
    title: 'Operating Profit: Gross Profit − Operating Expenses = Operating Profit',
    formula: `${grossProfit} − ${operatingExpenses} = ${operatingProfit}`,
    leftTermLabel: 'Gross Profit − Expenses',
    leftValue: roundMoney(grossProfit - operatingExpenses),
    rightTermLabel: 'Operating Profit',
    rightValue: operatingProfit,
    difference: opDiff,
    isBalanced: isOPBalanced,
    statusText: isOPBalanced ? 'Balanced' : `Discrepancy: PKR ${opDiff}`,
    explanation: 'Verifies operating profitability net of verified overhead expenses.',
  });

  // Formula C: Purchase Bilateral Integrity
  // Purchase Grand Total = Paid Amount + Outstanding Balance
  const purGrandTotal = roundMoney(purchaseReport.summary.totalPurchaseValue);
  const purPaidAmount = roundMoney(purchaseReport.summary.totalPaidAmount);
  const purRemainingBalance = roundMoney(purchaseReport.summary.totalOutstandingBalance);
  const purSum = roundMoney(purPaidAmount + purRemainingBalance);
  const purDiff = roundMoney(Math.abs(purGrandTotal - purSum));
  const isPurBalanced = purDiff === 0;

  items.push({
    id: 'rec_purchases',
    category: 'purchases',
    categoryLabel: 'C. Purchases',
    title: 'Purchase Bilateral: Total Value = Paid Amount + Outstanding Balance',
    formula: `${purGrandTotal} = ${purPaidAmount} + ${purRemainingBalance}`,
    leftTermLabel: 'Grand Total Value',
    leftValue: purGrandTotal,
    rightTermLabel: 'Paid + Remaining',
    rightValue: purSum,
    difference: purDiff,
    isBalanced: isPurBalanced,
    statusText: isPurBalanced ? 'Balanced' : `Discrepancy: PKR ${purDiff}`,
    explanation: 'Verifies all purchase bills reconcile between cash paid at intake and credit balance.',
  });

  // Formula D: Customer Receivables & Advances Integrity
  // Sum of positive balances = Total Receivables (Advances separated)
  const positiveReceivablesSum = roundMoney(
    receivablesReport.customers
      .filter((c) => c.currentBalance > 0)
      .reduce((acc, c) => acc + c.currentBalance, 0)
  );
  const summaryReceivables = roundMoney(receivablesReport.summary.totalOutstandingReceivables);
  const recDiff = roundMoney(Math.abs(positiveReceivablesSum - summaryReceivables));
  const isRecBalanced = recDiff === 0;

  items.push({
    id: 'rec_receivables',
    category: 'receivables',
    categoryLabel: 'D. Customer Receivables',
    title: 'Customer Receivables: Sum of Customer Balances = Total Receivables',
    formula: `Sum(${positiveReceivablesSum}) = ${summaryReceivables}`,
    leftTermLabel: 'Sum of Debtor Balances',
    leftValue: positiveReceivablesSum,
    rightTermLabel: 'Report Total Receivables',
    rightValue: summaryReceivables,
    difference: recDiff,
    isBalanced: isRecBalanced,
    statusText: isRecBalanced ? 'Balanced' : `Discrepancy: PKR ${recDiff}`,
    explanation:
      `Customer advances (PKR ${receivablesReport.summary.totalAdvanceAmount}) are segregated from debt.`,
  });

  // Formula E: Supplier Payables & Liability Integrity
  // Supplier Balances = Authoritative Payables Summary
  const positivePayablesSum = roundMoney(
    payablesReport.suppliers
      .filter((s) => s.currentBalance > 0)
      .reduce((acc, s) => acc + s.currentBalance, 0)
  );
  const summaryPayables = roundMoney(payablesReport.summary.totalOutstandingPayables);
  const payDiff = roundMoney(Math.abs(positivePayablesSum - summaryPayables));
  const isPayBalanced = payDiff === 0;

  items.push({
    id: 'rec_payables',
    category: 'payables',
    categoryLabel: 'E. Supplier Payables',
    title: 'Supplier Payables: Sum of Supplier Balances = Total Payables',
    formula: `Sum(${positivePayablesSum}) = ${summaryPayables}`,
    leftTermLabel: 'Sum of Supplier Balances',
    leftValue: positivePayablesSum,
    rightTermLabel: 'Report Total Payables',
    rightValue: summaryPayables,
    difference: payDiff,
    isBalanced: isPayBalanced,
    statusText: isPayBalanced ? 'Balanced' : `Discrepancy: PKR ${payDiff}`,
    explanation:
      'Supplier balances reflect open purchase debt less subsequent settlements.',
  });

  // Formula F: Cash Flow Single-Counting & Non-Revenue Separation
  // Confirms Customer Khata recoveries not counted as sales revenue
  const directCashSales = roundMoney(cfReport.summary.directCashSales);
  const customerRecoveries = roundMoney(cfReport.summary.customerCashRecoveries);
  const totalCashInflows = roundMoney(cfReport.summary.totalCashInflows);
  const inflowSum = roundMoney(directCashSales + customerRecoveries);
  const cfInflowDiff = roundMoney(Math.abs(totalCashInflows - inflowSum));
  const isCFBalanced = cfInflowDiff === 0;

  items.push({
    id: 'rec_cash_flow',
    category: 'cash_flow',
    categoryLabel: 'F. Cash Flow Single-Count',
    title: 'Cash Flow: Total Cash Inflows = Direct Cash Sales + Customer Khata Recoveries',
    formula: `${totalCashInflows} = ${directCashSales} + ${customerRecoveries}`,
    leftTermLabel: 'Total Cash Inflows',
    leftValue: totalCashInflows,
    rightTermLabel: 'Sales + Khata Inflows',
    rightValue: inflowSum,
    difference: cfInflowDiff,
    isBalanced: isCFBalanced,
    statusText: isCFBalanced ? 'Balanced' : `Discrepancy: PKR ${cfInflowDiff}`,
    explanation:
      'Customer Khata settlements are counted as cash inflow without double-counting as sales revenue.',
  });

  // Formula G: Physical Cash Drawer Integrity
  // Opening Float + Cash Inflows - Cash Outflows = Expected Closing Cash
  const roundedFloat = roundMoney(openingFloat);
  const totalCashOutflows = roundMoney(cfReport.summary.totalCashOutflows);
  const expectedClosing = roundMoney(cfReport.summary.expectedClosingDrawerCash);
  const calculatedClosing = roundMoney(roundedFloat + totalCashInflows - totalCashOutflows);
  const drawerDiff = roundMoney(Math.abs(expectedClosing - calculatedClosing));
  const isDrawerBalanced = drawerDiff === 0;

  items.push({
    id: 'rec_drawer',
    category: 'cash_drawer',
    categoryLabel: 'G. Physical Cash Drawer',
    title: 'Cash Drawer: Float + Inflows − Outflows = Expected Closing Cash',
    formula: `${roundedFloat} + ${totalCashInflows} − ${totalCashOutflows} = ${expectedClosing}`,
    leftTermLabel: 'Float + Inflows − Outflows',
    leftValue: calculatedClosing,
    rightTermLabel: 'Expected Closing Drawer',
    rightValue: expectedClosing,
    difference: drawerDiff,
    isBalanced: isDrawerBalanced,
    statusText: isDrawerBalanced ? 'Balanced' : `Discrepancy: PKR ${drawerDiff}`,
    explanation:
      'Includes physical cash sales, Khata cash recoveries, refunds, cash expenses, and supplier cash intake.',
  });

  const totalDiscrepancy = roundMoney(
    items.reduce((acc, it) => acc + it.difference, 0)
  );
  const isAllBalanced = items.every((it) => it.isBalanced);

  const summary: FullAccountingReconciliationSummary = {
    grossSales,
    salesReturns,
    netSales,
    grossCOGS: roundMoney(plReport.summary.grossCOGS),
    returnedCOGS: roundMoney(plReport.summary.returnedCOGS),
    netCOGS,
    grossProfit,
    operatingExpenses,
    operatingProfit,
    purchaseGrandTotal: purGrandTotal,
    purchasePaidAmount: purPaidAmount,
    purchaseRemainingBalance: purRemainingBalance,
    customerReceivablesTotal: summaryReceivables,
    customerAdvancesTotal: roundMoney(receivablesReport.summary.totalAdvanceAmount),
    supplierPayablesTotal: summaryPayables,
    supplierAdvancesTotal: 0,
    supplierIntakeRemainingTotal: purRemainingBalance,
    supplierSettlementsTotal: roundMoney(
      payablesReport.suppliers.reduce((acc, s) => acc + s.totalSettlementPaid, 0)
    ),
    openingCashFloat: roundedFloat,
    totalCashInflows,
    totalCashOutflows,
    netCashFlow: roundMoney(cfReport.summary.netPhysicalCashFlow),
    expectedClosingCash: expectedClosing,
    totalBankInflows: roundMoney(cfReport.summary.totalBankInflows),
    totalBankOutflows: roundMoney(cfReport.summary.totalBankOutflows),
    netBankFlow: roundMoney(cfReport.summary.netBankFlow),
  };

  return {
    dateRange,
    isAllBalanced,
    totalDiscrepancy,
    items,
    disclosures: MANDATORY_ACCOUNTING_DISCLOSURES,
    summary,
    generatedAt: new Date().toISOString(),
  };
};

export const getFullAccountingReconciliation = async (
  dateRange: DateRange,
  openingFloat = 0,
  forceRefresh = false
): Promise<FullAccountingReconciliationData> => {
  const cacheKey = JSON.stringify({
    start: dateRange.startDate,
    end: dateRange.endDate,
    openingFloat,
  });

  if (!forceRefresh) {
    const cached = reconciliationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // Fetch all 6 reporting pillars concurrently
  const [
    salesRes,
    purchaseRes,
    plRes,
    cfRes,
    receivablesRes,
    payablesRes,
  ] = await Promise.all([
    getSalesReport(dateRange),
    getPurchaseReport(dateRange),
    getOperatingProfitLossReport(dateRange),
    getCashFlowReport(dateRange, {}, openingFloat),
    getCustomerReceivablesReport({}, dateRange.endDate, forceRefresh),
    getSupplierPayablesReport({}, dateRange.endDate, forceRefresh),
  ]);

  const reconciliationData = calculateFullAccountingReconciliation(
    salesRes.report,
    purchaseRes.report,
    plRes.report,
    cfRes.report,
    receivablesRes.report,
    payablesRes.report,
    dateRange,
    openingFloat
  );

  reconciliationCache.set(cacheKey, {
    data: reconciliationData,
    timestamp: Date.now(),
  });

  return reconciliationData;
};


