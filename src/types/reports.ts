/**
 * FINANCIAL REPORTING & ACCOUNTING TYPES
 * Sadiq Book Agency — Phase 6
 */

import type { CustomerType, ExpenseCategory, ExpenseDocument } from './database';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  preset: DateRangePreset;
  label: string;
}

export interface FinancialMetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  isCurrency?: boolean;
}

export interface CsvColumn<T = any> {
  key: keyof T | string;
  label: string;
  formatter?: (value: any, item: T) => string | number;
}

export interface CsvExportOptions<T = any> {
  filename: string;
  title: string;
  dateRange?: string;
  columns: CsvColumn<T>[];
  data: T[];
  summaryRows?: Array<Record<string, string | number>>;
}

// ==============================================================================
// MODULE 6.1 — SALES REPORT TYPES
// ==============================================================================

export interface SalesReportFilters {
  paymentMethod?: 'all' | 'cash' | 'bank_transfer' | 'credit';
  customerType?: 'all' | CustomerType;
  searchTerm?: string;
}

export interface SalesReportSummary {
  totalGrossSales: number;
  totalSalesReturns: number;
  netSales: number;
  totalCashSales: number;
  totalCreditSales: number;
  totalBankSales: number;
  partialSalesCount: number;
  partialSalesValue: number;
  actualCashReceived: number;
  totalOutstandingCredit: number;
  totalInvoicesCount: number;
  averageInvoiceValue: number;
}

export interface DailySalesBreakdown {
  date: string;
  invoiceCount: number;
  grossSales: number;
  returnsAmount: number;
  netSales: number;
  cashReceived: number;
  creditAdded: number;
}

export interface PaymentMethodBreakdown {
  method: 'cash' | 'credit' | 'bank_transfer';
  label: string;
  invoiceCount: number;
  totalAmount: number;
  percentage: number;
}

export interface CustomerSalesSummary {
  customerId?: string;
  customerName: string;
  customerType: CustomerType | 'unknown';
  invoiceCount: number;
  totalSalesAmount: number;
  cashPaid: number;
  creditAdded: number;
}

export interface SalesReportData {
  dateRange: DateRange;
  summary: SalesReportSummary;
  dailyBreakdown: DailySalesBreakdown[];
  paymentMethods: PaymentMethodBreakdown[];
  customerSummaries: CustomerSalesSummary[];
  invoicesCount: number;
}

// ==============================================================================
// MODULE 6.2 — PURCHASE REPORT TYPES
// ==============================================================================

export interface PurchaseReportFilters {
  supplierId?: string | 'all';
  paymentMethod?: string | 'all';
  searchTerm?: string;
}

export interface PurchaseReportSummary {
  totalPurchaseValue: number;
  totalCashPurchases: number;
  totalCreditPurchases: number;
  totalBankPurchases: number;
  totalPaidAmount: number;
  totalOutstandingBalance: number;
  totalPurchaseReturns: number;
  purchaseReturnsNote: string;
  netPurchases: number;
  totalInvoicesCount: number;
  averageInvoiceValue: number;
}

export interface SupplierPurchaseSummary {
  supplierId: string;
  supplierName: string;
  invoiceCount: number;
  totalPurchaseValue: number;
  paidAmount: number;
  remainingBalance: number;
}

export interface DateWisePurchaseSummary {
  date: string;
  invoiceCount: number;
  totalPurchaseValue: number;
  paidAmount: number;
  remainingBalance: number;
}

export interface PurchaseReportData {
  dateRange: DateRange;
  summary: PurchaseReportSummary;
  supplierSummaries: SupplierPurchaseSummary[];
  dateSummaries: DateWisePurchaseSummary[];
  invoicesCount: number;
}

// ==============================================================================
// MODULE 6.3 — EXPENSE REPORT TYPES
// ==============================================================================

export interface ExpenseFilters {
  category?: 'all' | ExpenseCategory;
  paymentMode?: 'all' | 'cash' | 'bank_transfer';
  searchTerm?: string;
}

export interface ExpenseReportSummary {
  totalExpenses: number;
  cashExpenses: number;
  bankExpenses: number;
  totalExpenseCount: number;
  averageExpense: number;
}

export interface CategoryExpenseSummary {
  category: ExpenseCategory;
  label: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

export interface DailyExpenseSummary {
  date: string;
  count: number;
  totalAmount: number;
  cashAmount: number;
  bankAmount: number;
}

export interface ExpenseReportData {
  dateRange: DateRange;
  summary: ExpenseReportSummary;
  categoryBreakdown: CategoryExpenseSummary[];
  dailyBreakdown: DailyExpenseSummary[];
  expenses: ExpenseDocument[];
  totalCount: number;
}

// ==============================================================================
// MODULE 6.4 — OPERATING PROFIT & LOSS REPORT TYPES
// ==============================================================================

export interface ProfitLossFilters {
  searchTerm?: string;
}

export interface ProfitLossCategoryExpense {
  category: ExpenseCategory;
  label: string;
  count: number;
  totalAmount: number;
  cashAmount: number;
  bankAmount: number;
  percentage: number;
}

export interface ProfitLossSummary {
  // Revenue
  grossSales: number;
  salesReturns: number;
  netSales: number;

  // Cost of Goods Sold
  grossCOGS: number;
  returnedCOGS: number;
  netCOGS: number;

  // Gross Profit
  grossProfit: number;
  grossProfitMargin: number; // percentage (0 - 100)

  // Operating Expenses
  totalOperatingExpenses: number;
  cashExpenses: number;
  bankExpenses: number;

  // Operating Profit
  operatingProfit: number;
  operatingProfitMargin: number; // percentage

  // Transaction Counts
  totalInvoicesCount: number;
  totalReturnsCount: number;
  totalExpensesCount: number;

  // Data Integrity & Disclosures
  missingCostItemCount: number; // item units sold where costPrice was missing or 0
  missingCostSalesCount: number; // invoices containing at least 1 missing-cost item
  missingReturnCostCount: number; // return item units where originalCostPrice was missing or 0
  disclosureNote: string;
}

export interface DailyProfitLossBreakdown {
  date: string; // YYYY-MM-DD
  grossSales: number;
  salesReturns: number;
  netSales: number;
  grossCOGS: number;
  returnedCOGS: number;
  netCOGS: number;
  grossProfit: number;
  grossProfitMargin: number;
  operatingExpenses: number;
  cashExpenses: number;
  bankExpenses: number;
  operatingProfit: number;
  operatingProfitMargin: number;
  invoicesCount: number;
  returnsCount: number;
  expensesCount: number;
}

export interface OperatingProfitLossReportData {
  dateRange: DateRange;
  summary: ProfitLossSummary;
  dailyBreakdown: DailyProfitLossBreakdown[];
  categoryExpenses: ProfitLossCategoryExpense[];
  generatedAt: string;
}

// ==============================================================================
// MODULE 6.5 — CASH FLOW & CASH BOOK REPORT TYPES
// ==============================================================================

export type CashFlowDirection = 'inflow' | 'outflow';

export type CashFlowCategory =
  | 'direct_sale'          // Sale immediate payment
  | 'customer_recovery'    // Khata debt repayment
  | 'sales_refund'         // Customer refund
  | 'operating_expense'    // Rent, salaries, utility, etc.
  | 'supplier_payment'     // Purchase intake payment
  | 'opening_float';       // Initial drawer float

export interface CashFlowTransaction {
  id: string;
  date: string;            // YYYY-MM-DD
  timestamp?: string;      // Full ISO string if available
  receiptNo: string;
  partyName: string;
  direction: CashFlowDirection;
  category: CashFlowCategory;
  categoryLabel: string;
  paymentMode: 'cash' | 'bank_transfer' | 'cheque';
  amount: number;
  runningCashBalance?: number; // Calculated sequentially for cash-only transactions
  notes?: string;
}

export interface CashFlowSummary {
  // Opening Balance
  openingCashFloat: number;

  // Physical Cash Inflows
  directCashSales: number;
  customerCashRecoveries: number;
  totalCashInflows: number; // directCashSales + customerCashRecoveries

  // Physical Cash Outflows
  cashSalesRefunds: number;
  cashOperatingExpenses: number;
  cashSupplierPurchases: number;
  totalCashOutflows: number; // refunds + cash expenses + cash supplier purchases

  // Net Physical Cash & Closing Drawer
  netPhysicalCashFlow: number; // totalCashInflows - totalCashOutflows
  expectedClosingDrawerCash: number; // openingCashFloat + netPhysicalCashFlow

  // Digital / Banking Position
  bankDirectSales: number;
  bankCustomerRecoveries: number;
  chequeCustomerRecoveries: number;
  totalBankInflows: number;

  bankOperatingExpenses: number;
  bankSupplierPurchases: number;
  totalBankOutflows: number;

  netBankFlow: number; // totalBankInflows - totalBankOutflows

  // Consolidated Inflows & Outflows
  consolidatedTotalInflows: number; // totalCashInflows + totalBankInflows
  consolidatedTotalOutflows: number; // totalCashOutflows + totalBankOutflows
  netConsolidatedCashPosition: number; // netPhysicalCashFlow + netBankFlow

  // Counts
  totalTransactionsCount: number;
  cashTransactionsCount: number;
  bankTransactionsCount: number;
}

export interface DailyCashFlowBreakdown {
  date: string; // YYYY-MM-DD
  cashInflows: number;
  cashOutflows: number;
  netCash: number;
  bankInflows: number;
  bankOutflows: number;
  netBank: number;
  totalInflows: number;
  totalOutflows: number;
  netCombined: number;
  transactionCount: number;
}

export interface CashFlowFilters {
  mode?: 'all' | 'cash' | 'bank_transfer' | 'cheque';
  direction?: 'all' | 'inflow' | 'outflow';
  category?: 'all' | CashFlowCategory;
  searchTerm?: string;
}

export interface CashFlowReportData {
  dateRange: DateRange;
  summary: CashFlowSummary;
  dailyBreakdown: DailyCashFlowBreakdown[];
  transactions: CashFlowTransaction[];
  generatedAt: string;
}

// ==============================================================================
// MODULE 6.6 — CUSTOMER OUTSTANDING / RECEIVABLES REPORT TYPES
// ==============================================================================

export interface CustomerAgingBucket {
  current30: number; // 0–30 days
  days31To60: number; // 31–60 days
  days61To90: number; // 61–90 days
  days90Plus: number; // 90+ days
}

export interface CustomerReceivableItem {
  customerId: string;
  customerName: string;
  shopName?: string;
  customerType: CustomerType;
  phone: string;
  currentBalance: number; // Positive = owes money (Udhaar), Negative = Advance
  creditLimit: number;
  creditDays?: number; // Configured payment terms
  creditUtilizationPct: number; // (currentBalance / creditLimit) * 100
  isOverdue: boolean;
  overdueAmount: number;
  estimatedDueDate?: string; // Only if creditDays is explicitly configured; otherwise undefined
  termsLabel: string; // "15 Days", "30 Days", or "Standard Terms (No fixed due date)"
  aging: CustomerAgingBucket;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastSaleDate?: string;
  lastSaleAmount?: number;
}

export interface CustomerReceivablesSummary {
  totalOutstandingReceivables: number; // Sum of positive balances
  totalCreditLimit: number;
  overallCreditUtilizationPct: number;
  totalOverdueAmount: number;
  totalAdvanceAmount: number; // Absolute sum of negative balances
  customersWithBalanceCount: number; // Debtors count
  advanceCustomersCount: number;
  zeroBalanceCustomersCount: number;
  totalCustomersCount: number;
  agingSummary: CustomerAgingBucket;
  wholesalerReceivables: number;
  marketshopReceivables: number;
  parchonReceivables: number;
  averageReceivableBalance: number;
}

export interface CustomerReceivablesFilters {
  customerType?: 'all' | CustomerType;
  balanceStatus?: 'all' | 'has_balance' | 'overdue_only' | 'advance_only' | 'zero_balance';
  searchTerm?: string;
  sortBy?: 'balance_desc' | 'balance_asc' | 'overdue_desc' | 'name_asc';
}

export interface CustomerReceivablesReportData {
  summary: CustomerReceivablesSummary;
  customers: CustomerReceivableItem[];
  generatedAt: string;
}

// ==============================================================================
// MODULE 6.7 — SUPPLIER PAYABLES REPORT TYPES
// ==============================================================================

export interface SupplierAgingBucket {
  current30: number; // 0–30 days
  days31To60: number; // 31–60 days
  days61To90: number; // 61–90 days
  days90Plus: number; // 90+ days
}

export interface SupplierPayableItem {
  supplierId: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  currentBalance: number; // Balance owed to supplier
  totalPurchasesCount: number;
  totalPurchasesValue: number;
  totalIntakePaid: number;
  totalSettlementPaid: number;
  totalRemainingPurchaseBalance: number;
  lastPurchaseDate?: string;
  lastPaymentDate?: string;
  unpaidInvoicesCount: number;
  aging: SupplierAgingBucket;
}

export interface SupplierPayablesSummary {
  totalOutstandingPayables: number; // Sum of supplier currentBalances
  suppliersWithBalanceCount: number;
  zeroBalanceSuppliersCount: number;
  totalSuppliersCount: number;
  totalUnpaidInvoicesCount: number;
  agingSummary: SupplierAgingBucket;
  averagePayableBalance: number;
}

export interface SupplierPayablesFilters {
  balanceStatus?: 'all' | 'has_balance' | 'zero_balance';
  searchTerm?: string;
  sortBy?: 'balance_desc' | 'balance_asc' | 'name_asc';
}

export interface SupplierPayablesReportData {
  summary: SupplierPayablesSummary;
  suppliers: SupplierPayableItem[];
  generatedAt: string;
}

export interface RecordSupplierPaymentInput {
  supplierId: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer' | 'cheque';
  transactionReference?: string;
  paymentDate?: string;
  receiptNo?: string;
  notes?: string;
}

// ==============================================================================
// MODULE 6.8 — FULL ACCOUNTING RECONCILIATION & DISCLOSURES
// ==============================================================================

export type ReconciliationCategory =
  | 'sales'
  | 'profit_loss'
  | 'purchases'
  | 'receivables'
  | 'payables'
  | 'cash_flow'
  | 'cash_drawer';

export interface ReconciliationItem {
  id: string;
  category: ReconciliationCategory;
  categoryLabel: string;
  title: string;
  formula: string;
  leftTermLabel: string;
  leftValue: number;
  rightTermLabel: string;
  rightValue: number;
  difference: number;
  isBalanced: boolean;
  statusText: string;
  explanation: string;
}

export interface AccountingDisclosure {
  id: string;
  title: string;
  scope: string;
  disclosure: string;
  impact: string;
  tag: 'standard' | 'disclaimer' | 'architecture';
}

export interface FullAccountingReconciliationSummary {
  // Sales
  grossSales: number;
  salesReturns: number;
  netSales: number;

  // P&L
  grossCOGS: number;
  returnedCOGS: number;
  netCOGS: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;

  // Purchases
  purchaseGrandTotal: number;
  purchasePaidAmount: number;
  purchaseRemainingBalance: number;

  // Receivables
  customerReceivablesTotal: number;
  customerAdvancesTotal: number;

  // Payables
  supplierPayablesTotal: number;
  supplierAdvancesTotal: number;
  supplierIntakeRemainingTotal: number;
  supplierSettlementsTotal: number;

  // Cash Flow
  openingCashFloat: number;
  totalCashInflows: number;
  totalCashOutflows: number;
  netCashFlow: number;
  expectedClosingCash: number;
  totalBankInflows: number;
  totalBankOutflows: number;
  netBankFlow: number;
}

export interface FullAccountingReconciliationData {
  dateRange: DateRange;
  isAllBalanced: boolean;
  totalDiscrepancy: number;
  items: ReconciliationItem[];
  disclosures: AccountingDisclosure[];
  summary: FullAccountingReconciliationSummary;
  generatedAt: string;
}





