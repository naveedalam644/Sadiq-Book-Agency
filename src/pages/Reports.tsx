import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp,
  Truck,
  RotateCcw,
  CheckCircle2,
  DollarSign,
  CreditCard,
  Building,
  RefreshCw,
  Search,
  Filter,
  Users,
  Scale,
} from 'lucide-react';

import type {
  DateRange,
  SalesReportFilters,
  PurchaseReportFilters,
  ProfitLossFilters,
  DailyProfitLossBreakdown,
  CashFlowFilters,
  CashFlowTransaction,
  CustomerReceivablesFilters,
  CustomerReceivableItem,
  SupplierPayablesFilters,
  SupplierPayableItem,
  FullAccountingReconciliationData,
  ReconciliationItem,
} from '../types/reports';
import type { SaleDocument, PurchaseDocument, SupplierDocument } from '../types/database';

import { computeDateRange } from '../utils/datePresets';
import { formatCurrency, formatNumber } from '../utils/money';
import { downloadCsv } from '../utils/csvExport';

import {
  getSalesReport,
  getPurchaseReport,
  getOperatingProfitLossReport,
  getCashFlowReport,
  getCustomerReceivablesReport,
  getSupplierPayablesReport,
  getFullAccountingReconciliation,
  invalidateFinancialReportsCache,
  type SalesReportResult,
  type PurchaseReportResult,
  type OperatingProfitLossResult,
  type CashFlowResult,
  type CustomerReceivablesResult,
  type SupplierPayablesResult,
} from '../services/financialReportService';
import { getActiveSuppliersForDropdown } from '../services/supplierService';

import { DateRangeSelector } from '../components/reports/DateRangeSelector';
import { ReportSummaryCard } from '../components/reports/ReportSummaryCard';
import { ExportReportBar } from '../components/reports/ExportReportBar';
import { PrintHeader } from '../components/reports/PrintHeader';

import { DailySalesBreakdownTable } from '../components/reports/sales/DailySalesBreakdownTable';
import { InvoiceWiseSalesTable } from '../components/reports/sales/InvoiceWiseSalesTable';
import { CustomerSalesSummaryTable } from '../components/reports/sales/CustomerSalesSummaryTable';

import { SupplierPurchaseSummaryTable } from '../components/reports/purchases/SupplierPurchaseSummaryTable';
import { DateWisePurchaseTable } from '../components/reports/purchases/DateWisePurchaseTable';
import { PurchaseInvoiceDetailTable } from '../components/reports/purchases/PurchaseInvoiceDetailTable';

import { ProfitLossSummarySection } from '../components/reports/profit_loss/ProfitLossSummarySection';
import { DailyProfitLossTable } from '../components/reports/profit_loss/DailyProfitLossTable';
import { ProfitLossExpenseBreakdownTable } from '../components/reports/profit_loss/ProfitLossExpenseBreakdownTable';

import { CashFlowSummarySection } from '../components/reports/cash_flow/CashFlowSummarySection';
import { DailyCashFlowTable } from '../components/reports/cash_flow/DailyCashFlowTable';
import { CashBookLedgerTable } from '../components/reports/cash_flow/CashBookLedgerTable';

import { CustomerReceivablesSummarySection } from '../components/reports/receivables/CustomerReceivablesSummarySection';
import { CustomerReceivablesTable } from '../components/reports/receivables/CustomerReceivablesTable';

import { SupplierPayablesSummarySection } from '../components/reports/payables/SupplierPayablesSummarySection';
import { SupplierPayablesTable } from '../components/reports/payables/SupplierPayablesTable';
import { SupplierPaymentModal } from '../components/reports/payables/SupplierPaymentModal';

import { AccountingReconciliationView } from '../components/reports/reconciliation/AccountingReconciliationView';

export const Reports: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab =
    (searchParams.get('tab') as
      | 'sales'
      | 'purchases'
      | 'profit_loss'
      | 'cash_flow'
      | 'receivables'
      | 'payables'
      | 'reconciliation') || 'sales';

  // Standardized Date Range (Default: This Month)
  const [dateRange, setDateRange] = useState<DateRange>(() => computeDateRange('this_month'));

  // Sales State
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesResult, setSalesResult] = useState<SalesReportResult | null>(null);
  const [salesFilters, setSalesFilters] = useState<SalesReportFilters>({
    paymentMethod: 'all',
    customerType: 'all',
    searchTerm: '',
  });
  const [salesSubTab, setSalesSubTab] = useState<'daily' | 'invoices' | 'customers'>('daily');

  // Purchase State
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseReportResult | null>(null);
  const [purchaseFilters, setPurchaseFilters] = useState<PurchaseReportFilters>({
    supplierId: 'all',
    paymentMethod: 'all',
    searchTerm: '',
  });
  const [purchaseSubTab, setPurchaseSubTab] = useState<'suppliers' | 'daily' | 'invoices'>('suppliers');
  const [suppliersList, setSuppliersList] = useState<SupplierDocument[]>([]);

  // Operating Profit & Loss State (Module 6.4)
  const [plLoading, setPlLoading] = useState(false);
  const [plResult, setPlResult] = useState<OperatingProfitLossResult | null>(null);
  const [plFilters, setPlFilters] = useState<ProfitLossFilters>({
    searchTerm: '',
  });
  const [plSubTab, setPlSubTab] = useState<'overview' | 'daily' | 'expenses'>('overview');

  // Cash Flow & Cash Book State (Module 6.5)
  const [cfLoading, setCfLoading] = useState(false);
  const [cfResult, setCfResult] = useState<CashFlowResult | null>(null);
  const [cfFilters] = useState<CashFlowFilters>({
    mode: 'all',
    direction: 'all',
    category: 'all',
    searchTerm: '',
  });
  const [cfSubTab, setCfSubTab] = useState<'overview' | 'cash_book' | 'daily'>('overview');
  const [openingFloat, setOpeningFloat] = useState(0);

  // Customer Receivables State (Module 6.6)
  const [receivablesLoading, setReceivablesLoading] = useState(false);
  const [receivablesResult, setReceivablesResult] = useState<CustomerReceivablesResult | null>(null);
  const [receivablesFilters, setReceivablesFilters] = useState<CustomerReceivablesFilters>({
    customerType: 'all',
    balanceStatus: 'all',
    searchTerm: '',
    sortBy: 'balance_desc',
  });

  // Supplier Payables State (Module 6.7)
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [payablesResult, setPayablesResult] = useState<SupplierPayablesResult | null>(null);
  const [payablesFilters, setPayablesFilters] = useState<SupplierPayablesFilters>({
    balanceStatus: 'all',
    searchTerm: '',
    sortBy: 'balance_desc',
  });
  const [selectedPaySupplier, setSelectedPaySupplier] = useState<SupplierDocument | null>(null);
  const [isSupplierPaymentModalOpen, setIsSupplierPaymentModalOpen] = useState(false);

  // Full Accounting Reconciliation State (Module 6.8)
  const [recLoading, setRecLoading] = useState(false);
  const [recData, setRecData] = useState<FullAccountingReconciliationData | null>(null);

  // Load Active Suppliers once for dropdown
  useEffect(() => {
    getActiveSuppliersForDropdown()
      .then((sups) => setSuppliersList(sups))
      .catch((err) => console.error('Error loading suppliers dropdown:', err));
  }, []);

  // Fetch Sales Report
  const loadSalesReport = useCallback(async () => {
    setSalesLoading(true);
    try {
      const res = await getSalesReport(dateRange, salesFilters);
      setSalesResult(res);
    } catch (err) {
      console.error('Failed to load Sales Report:', err);
    } finally {
      setSalesLoading(false);
    }
  }, [dateRange, salesFilters]);

  // Fetch Purchase Report
  const loadPurchaseReport = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const res = await getPurchaseReport(dateRange, purchaseFilters);
      setPurchaseResult(res);
    } catch (err) {
      console.error('Failed to load Purchase Report:', err);
    } finally {
      setPurchasesLoading(false);
    }
  }, [dateRange, purchaseFilters]);

  // Fetch Operating Profit & Loss Report
  const loadProfitLossReport = useCallback(async () => {
    setPlLoading(true);
    try {
      const res = await getOperatingProfitLossReport(dateRange, plFilters);
      setPlResult(res);
    } catch (err) {
      console.error('Failed to load Operating Profit & Loss Report:', err);
    } finally {
      setPlLoading(false);
    }
  }, [dateRange, plFilters]);

  // Fetch Cash Flow & Cash Book Report
  const loadCashFlowReport = useCallback(async () => {
    setCfLoading(true);
    try {
      const res = await getCashFlowReport(dateRange, cfFilters, openingFloat);
      setCfResult(res);
    } catch (err) {
      console.error('Failed to load Cash Flow Report:', err);
    } finally {
      setCfLoading(false);
    }
  }, [dateRange, cfFilters, openingFloat]);

  // Fetch Customer Receivables Report (Module 6.6)
  const loadReceivablesReport = useCallback(async () => {
    setReceivablesLoading(true);
    try {
      const res = await getCustomerReceivablesReport(
        receivablesFilters,
        dateRange.endDate
      );
      setReceivablesResult(res);
    } catch (err) {
      console.error('Failed to load Customer Receivables Report:', err);
    } finally {
      setReceivablesLoading(false);
    }
  }, [dateRange.endDate, receivablesFilters]);

  // Fetch Supplier Payables Report (Module 6.7)
  const loadPayablesReport = useCallback(async () => {
    setPayablesLoading(true);
    try {
      const res = await getSupplierPayablesReport(
        payablesFilters,
        dateRange.endDate
      );
      setPayablesResult(res);
    } catch (err) {
      console.error('Failed to load Supplier Payables Report:', err);
    } finally {
      setPayablesLoading(false);
    }
  }, [dateRange.endDate, payablesFilters]);

  // Fetch Full Accounting Reconciliation (Module 6.8)
  const loadReconciliation = useCallback(async () => {
    setRecLoading(true);
    try {
      const res = await getFullAccountingReconciliation(dateRange, openingFloat);
      setRecData(res);
    } catch (err) {
      console.error('Failed to load Full Accounting Reconciliation:', err);
    } finally {
      setRecLoading(false);
    }
  }, [dateRange, openingFloat]);

  // Trigger loads based on active tab
  useEffect(() => {
    if (currentTab === 'sales') {
      loadSalesReport();
    } else if (currentTab === 'purchases') {
      loadPurchaseReport();
    } else if (currentTab === 'profit_loss') {
      loadProfitLossReport();
    } else if (currentTab === 'cash_flow') {
      loadCashFlowReport();
    } else if (currentTab === 'receivables') {
      loadReceivablesReport();
    } else if (currentTab === 'payables') {
      loadPayablesReport();
    } else if (currentTab === 'reconciliation') {
      loadReconciliation();
    }
  }, [
    currentTab,
    loadSalesReport,
    loadPurchaseReport,
    loadProfitLossReport,
    loadCashFlowReport,
    loadReceivablesReport,
    loadPayablesReport,
    loadReconciliation,
  ]);

  const handleRefresh = () => {
    invalidateFinancialReportsCache();
    if (currentTab === 'sales') {
      loadSalesReport();
    } else if (currentTab === 'purchases') {
      loadPurchaseReport();
    } else if (currentTab === 'profit_loss') {
      loadProfitLossReport();
    } else if (currentTab === 'cash_flow') {
      loadCashFlowReport();
    } else if (currentTab === 'receivables') {
      loadReceivablesReport();
    } else if (currentTab === 'payables') {
      loadPayablesReport();
    } else if (currentTab === 'reconciliation') {
      loadReconciliation();
    }
  };

  const handleTabChange = (
    tab: 'sales' | 'purchases' | 'profit_loss' | 'cash_flow' | 'receivables' | 'payables' | 'reconciliation'
  ) => {
    setSearchParams({ tab });
  };

  // CSV Export Handler for Sales
  const handleExportSalesCsv = () => {
    if (!salesResult) return;
    const { report, sales } = salesResult;

    downloadCsv<SaleDocument>({
      filename: `sales_report_${dateRange.startDate}_${dateRange.endDate}`,
      title: 'Sales Report — Sadiq Book Agency',
      dateRange: report.dateRange.label,
      columns: [
        { key: 'invoiceNo', label: 'Invoice Number' },
        { key: 'saleDate', label: 'Sale Date' },
        { key: 'customerName', label: 'Customer' },
        { key: 'customerType', label: 'Customer Type' },
        { key: 'subtotal', label: 'Subtotal (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'totalDiscount', label: 'Discount (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'grandTotal', label: 'Grand Total (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'paymentApplied', label: 'Cash Received (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'balanceAddedToCredit', label: 'Credit Added (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'paymentStatus', label: 'Payment Status' },
        { key: 'paymentMethod', label: 'Payment Method' },
      ],
      data: sales,
      summaryRows: [
        {
          'Total Gross Sales': formatCurrency(report.summary.totalGrossSales),
          'Total Sales Returns': formatCurrency(report.summary.totalSalesReturns),
          'Net Sales Revenue': formatCurrency(report.summary.netSales),
          'Actual Cash Received': formatCurrency(report.summary.actualCashReceived),
          'Total Credit Added': formatCurrency(report.summary.totalOutstandingCredit),
          'Total Invoices': formatNumber(report.summary.totalInvoicesCount),
          'Average Invoice Value': formatCurrency(report.summary.averageInvoiceValue),
        },
      ],
    });
  };

  // CSV Export Handler for Purchases
  const handleExportPurchaseCsv = () => {
    if (!purchaseResult) return;
    const { report, purchases } = purchaseResult;

    downloadCsv<PurchaseDocument>({
      filename: `purchase_report_${dateRange.startDate}_${dateRange.endDate}`,
      title: 'Purchase Report — Sadiq Book Agency',
      dateRange: report.dateRange.label,
      columns: [
        { key: 'purchaseInvoiceNo', label: 'Purchase Invoice #' },
        { key: 'supplierName', label: 'Supplier / Publisher' },
        { key: 'purchaseDate', label: 'Purchase Date' },
        { key: 'items', label: 'Items Count', formatter: (it) => (it ? it.length : 0) },
        { key: 'subtotal', label: 'Subtotal (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'discountAmount', label: 'Discount (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'grandTotal', label: 'Total Value (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'paidAmount', label: 'Paid Amount (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'remainingBalance', label: 'Outstanding Balance (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'paymentMethod', label: 'Payment Method' },
      ],
      data: purchases,
      summaryRows: [
        {
          'Total Purchase Value': formatCurrency(report.summary.totalPurchaseValue),
          'Cash Purchases': formatCurrency(report.summary.totalCashPurchases),
          'Credit Purchases': formatCurrency(report.summary.totalCreditPurchases),
          'Total Paid Amount': formatCurrency(report.summary.totalPaidAmount),
          'Outstanding Supplier Balance': formatCurrency(report.summary.totalOutstandingBalance),
          'Purchase Returns': 'PKR 0 (None recorded)',
          'Net Purchases': formatCurrency(report.summary.netPurchases),
          'Total Invoices': formatNumber(report.summary.totalInvoicesCount),
        },
      ],
    });
  };

  // CSV Export Handler for Operating Profit & Loss
  const handleExportProfitLossCsv = () => {
    if (!plResult) return;
    const { report } = plResult;

    downloadCsv<DailyProfitLossBreakdown>({
      filename: `operating_pl_report_${dateRange.startDate}_${dateRange.endDate}`,
      title: 'Operating Profit & Loss Report — Sadiq Book Agency',
      dateRange: report.dateRange.label,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'invoicesCount', label: 'Invoices' },
        { key: 'returnsCount', label: 'Returns' },
        { key: 'grossSales', label: 'Gross Sales (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'salesReturns', label: 'Sales Returns (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'netSales', label: 'Net Sales (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'netCOGS', label: 'Net COGS (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'grossProfit', label: 'Gross Profit (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'grossProfitMargin', label: 'Gross Margin %', formatter: (v) => `${v}%` },
        { key: 'operatingExpenses', label: 'Operating Expenses (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'operatingProfit', label: 'Operating Profit (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'operatingProfitMargin', label: 'Operating Margin %', formatter: (v) => `${v}%` },
      ],
      data: report.dailyBreakdown,
      summaryRows: [
        {
          'Gross Sales': formatCurrency(report.summary.grossSales),
          'Sales Returns': formatCurrency(report.summary.salesReturns),
          'Net Sales Revenue': formatCurrency(report.summary.netSales),
          'Gross COGS': formatCurrency(report.summary.grossCOGS),
          'Returned COGS': formatCurrency(report.summary.returnedCOGS),
          'Net COGS': formatCurrency(report.summary.netCOGS),
          'Gross Profit': formatCurrency(report.summary.grossProfit),
          'Gross Profit Margin': `${report.summary.grossProfitMargin}%`,
          'Cash Expenses': formatCurrency(report.summary.cashExpenses),
          'Bank Expenses': formatCurrency(report.summary.bankExpenses),
          'Total Operating Expenses': formatCurrency(report.summary.totalOperatingExpenses),
          'Operating Profit': formatCurrency(report.summary.operatingProfit),
          'Operating Profit Margin': `${report.summary.operatingProfitMargin}%`,
          'Invoices Count': formatNumber(report.summary.totalInvoicesCount),
          'Returns Count': formatNumber(report.summary.totalReturnsCount),
        },
      ],
    });
  };

  // CSV Export Handler for Cash Flow & Cash Book
  const handleExportCashFlowCsv = () => {
    if (!cfResult) return;
    const { report } = cfResult;

    downloadCsv<CashFlowTransaction>({
      filename: `cash_book_${dateRange.startDate}_${dateRange.endDate}`,
      title: 'Cash Flow & Cash Book Register — Sadiq Book Agency',
      dateRange: report.dateRange.label,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'receiptNo', label: 'Receipt / Ref #' },
        { key: 'partyName', label: 'Party / Description' },
        { key: 'categoryLabel', label: 'Transaction Category' },
        { key: 'paymentMode', label: 'Payment Mode' },
        {
          key: 'direction',
          label: 'Inflow (+PKR)',
          formatter: (_, item) => (item.direction === 'inflow' ? formatCurrency(item.amount) : '—'),
        },
        {
          key: 'direction',
          label: 'Outflow (-PKR)',
          formatter: (_, item) => (item.direction === 'outflow' ? formatCurrency(item.amount) : '—'),
        },
        {
          key: 'runningCashBalance',
          label: 'Running Cash Balance (PKR)',
          formatter: (v, item) => (item.paymentMode === 'cash' && v !== undefined ? formatCurrency(v) : '—'),
        },
        { key: 'notes', label: 'Notes / Details' },
      ],
      data: report.transactions,
      summaryRows: [
        {
          'Opening Cash Float': formatCurrency(report.summary.openingCashFloat),
          'Total Cash Inflows': formatCurrency(report.summary.totalCashInflows),
          'Total Cash Outflows': formatCurrency(report.summary.totalCashOutflows),
          'Net Cash Flow': formatCurrency(report.summary.netPhysicalCashFlow),
          'Expected Closing Cash': formatCurrency(report.summary.expectedClosingDrawerCash),
          'Total Bank Inflows': formatCurrency(report.summary.totalBankInflows),
          'Total Bank Outflows': formatCurrency(report.summary.totalBankOutflows),
          'Net Bank Flow': formatCurrency(report.summary.netBankFlow),
          'Consolidated Net Position': formatCurrency(report.summary.netConsolidatedCashPosition),
          'Total Transactions': formatNumber(report.summary.totalTransactionsCount),
        },
      ],
    });
  };

  // CSV Export Handler for Customer Receivables (Module 6.6)
  const handleExportReceivablesCsv = () => {
    if (!receivablesResult) return;
    const { report } = receivablesResult;

    downloadCsv<CustomerReceivableItem>({
      filename: `customer_receivables_${dateRange.endDate}`,
      title: 'Customer Receivables & Aging Report — Sadiq Book Agency',
      dateRange: `As of ${dateRange.endDate}`,
      columns: [
        { key: 'customerName', label: 'Customer Name' },
        { key: 'shopName', label: 'Shop Name', formatter: (v) => v || '—' },
        { key: 'customerType', label: 'Customer Type' },
        { key: 'phone', label: 'Phone' },
        { key: 'currentBalance', label: 'Current Balance (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'creditLimit', label: 'Credit Limit (PKR)', formatter: (v) => (v > 0 ? formatCurrency(v) : 'None') },
        { key: 'creditUtilizationPct', label: 'Credit Util (%)', formatter: (v) => `${v}%` },
        { key: 'aging', label: '0–30 Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.current30) },
        { key: 'aging', label: '31–60 Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.days31To60) },
        { key: 'aging', label: '61–90 Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.days61To90) },
        { key: 'aging', label: '90+ Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.days90Plus) },
        { key: 'termsLabel', label: 'Payment Terms' },
        { key: 'isOverdue', label: 'Overdue Status', formatter: (v, item) => (v ? `Overdue (${formatCurrency(item.overdueAmount)})` : 'Current') },
        { key: 'lastPaymentDate', label: 'Last Payment Date', formatter: (v) => v || 'None' },
        { key: 'lastPaymentAmount', label: 'Last Payment (PKR)', formatter: (v) => (v ? formatCurrency(v) : '—') },
      ],
      data: report.customers,
      summaryRows: [
        {
          'Total Outstanding Receivables': formatCurrency(report.summary.totalOutstandingReceivables),
          'Total Credit Limit': formatCurrency(report.summary.totalCreditLimit),
          'Credit Utilization': `${report.summary.overallCreditUtilizationPct}%`,
          'Total Overdue Debt': formatCurrency(report.summary.totalOverdueAmount),
          'Customer Advances': formatCurrency(report.summary.totalAdvanceAmount),
          'Debtors Count': formatNumber(report.summary.customersWithBalanceCount),
          'Total Accounts': formatNumber(report.summary.totalCustomersCount),
        },
      ],
    });
  };

  // CSV Export Handler for Supplier Payables (Module 6.7)
  const handleExportPayablesCsv = () => {
    if (!payablesResult) return;
    const { report } = payablesResult;

    downloadCsv<SupplierPayableItem>({
      filename: `supplier_payables_${dateRange.endDate}`,
      title: 'Supplier Payables & Aging Report — Sadiq Book Agency',
      dateRange: `As of ${dateRange.endDate}`,
      columns: [
        { key: 'companyName', label: 'Supplier / Company Name' },
        { key: 'contactPerson', label: 'Contact Person' },
        { key: 'phone', label: 'Phone' },
        { key: 'currentBalance', label: 'Payable Liability (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'totalPurchasesValue', label: 'Total Purchases (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'totalIntakePaid', label: 'Intake Paid (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'totalSettlementPaid', label: 'Later Settlements (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'aging', label: '0–30 Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.current30) },
        { key: 'aging', label: '31–60 Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.days31To60) },
        { key: 'aging', label: '61–90 Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.days61To90) },
        { key: 'aging', label: '90+ Days (PKR)', formatter: (_, item) => formatCurrency(item.aging.days90Plus) },
        { key: 'unpaidInvoicesCount', label: 'Open Invoices Count' },
        { key: 'lastPurchaseDate', label: 'Last Purchase Date', formatter: (v) => v || 'None' },
      ],
      data: report.suppliers,
      summaryRows: [
        {
          'Total Outstanding Payables': formatCurrency(report.summary.totalOutstandingPayables),
          'Creditor Suppliers': formatNumber(report.summary.suppliersWithBalanceCount),
          'Open Invoices Count': formatNumber(report.summary.totalUnpaidInvoicesCount),
          'Average Balance': formatCurrency(report.summary.averagePayableBalance),
          'Total Suppliers': formatNumber(report.summary.totalSuppliersCount),
        },
      ],
    });
  };

  // CSV Export Handler for Full Accounting Reconciliation (Module 6.8)
  const handleExportReconciliationCsv = () => {
    if (!recData) return;
    const { items, summary, isAllBalanced, totalDiscrepancy } = recData;

    downloadCsv<ReconciliationItem>({
      filename: `accounting_reconciliation_${dateRange.startDate}_${dateRange.endDate}`,
      title: 'Full Accounting Reconciliation & Mathematical Audit — Sadiq Book Agency',
      dateRange: recData.dateRange.label,
      columns: [
        { key: 'categoryLabel', label: 'Category' },
        { key: 'title', label: 'Accounting Verification Check' },
        { key: 'formula', label: 'Equation Formula' },
        { key: 'leftTermLabel', label: 'Left Side' },
        { key: 'leftValue', label: 'Left Side Value (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'rightTermLabel', label: 'Right Side' },
        { key: 'rightValue', label: 'Right Side Value (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'difference', label: 'Variance (PKR)', formatter: (v) => formatCurrency(v) },
        { key: 'isBalanced', label: 'Audit Status', formatter: (b) => (b ? 'RECONCILED' : 'DISCREPANCY') },
        { key: 'explanation', label: 'Accounting Rule / Invariant' },
      ],
      data: items,
      summaryRows: [
        {
          'Overall Audit Status': isAllBalanced ? '100% RECONCILED (ZERO VARIANCE)' : 'DISCREPANCIES DETECTED',
          'Total Checks Passed': `${items.filter((i) => i.isBalanced).length} / ${items.length}`,
          'Cumulative Discrepancy': formatCurrency(totalDiscrepancy),
          'Gross Sales': formatCurrency(summary.grossSales),
          'Net Sales': formatCurrency(summary.netSales),
          'Gross Profit': formatCurrency(summary.grossProfit),
          'Operating Profit': formatCurrency(summary.operatingProfit),
          'Expected Closing Cash': formatCurrency(summary.expectedClosingCash),
          'Customer Receivables': formatCurrency(summary.customerReceivablesTotal),
          'Supplier Payables': formatCurrency(summary.supplierPayablesTotal),
        },
      ],
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Print-Only Business Header for A4 Standard Layout */}
      <PrintHeader
        title={
          currentTab === 'sales'
            ? 'Sales & Revenue Report'
            : currentTab === 'purchases'
            ? 'Purchase & Intake Report'
            : currentTab === 'profit_loss'
            ? 'Operating Profit & Loss Statement'
            : currentTab === 'cash_flow'
            ? 'Cash Flow & Cash Book Ledger'
            : currentTab === 'receivables'
            ? 'Customer Receivables & Aging Report'
            : currentTab === 'payables'
            ? 'Supplier Payables & Liability Report'
            : 'Full Accounting Reconciliation & Mathematical Audit'
        }
        dateRangeLabel={
          currentTab === 'receivables' || currentTab === 'payables'
            ? `As of ${dateRange.endDate}`
            : dateRange.label
        }
      />

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#071F49] tracking-tight">Financial Reports</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F5B51B]/20 text-[#071F49] border border-[#F5B51B]/40">
              Live Reports
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Audited financial reporting, revenue analysis, and intake accounting
          </p>
        </div>

        {/* Global Refresh Button */}
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${salesLoading || purchasesLoading || plLoading || cfLoading || receivablesLoading || payablesLoading || recLoading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Date Range Selector Bar */}
      <div className="print:hidden">
        <DateRangeSelector
          value={dateRange}
          onChange={(newRange) => setDateRange(newRange)}
          isLoading={salesLoading || purchasesLoading || plLoading || cfLoading || receivablesLoading || payablesLoading || recLoading}
        />
      </div>

      {/* Primary Module Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 print:hidden overflow-x-auto">
        <button
          type="button"
          onClick={() => handleTabChange('sales')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            currentTab === 'sales'
              ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Sales Report (Module 6.1)
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('purchases')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            currentTab === 'purchases'
              ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <Truck className="w-4 h-4" />
          Purchase Report (Module 6.2)
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('profit_loss')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            currentTab === 'profit_loss'
              ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Operating Profit & Loss (Module 6.4)
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('cash_flow')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            currentTab === 'cash_flow'
              ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Cash Flow & Drawer (Module 6.5)
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('receivables')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            currentTab === 'receivables'
              ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          Customer Receivables (Module 6.6)
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('payables')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            currentTab === 'payables'
              ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <Building className="w-4 h-4" />
          Supplier Payables (Module 6.7)
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('reconciliation')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            currentTab === 'reconciliation'
              ? 'border-[#071F49] text-[#071F49] bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <Scale className="w-4 h-4" />
          Full Reconciliation (Module 6.8)
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: MODULE 6.1 — SALES REPORT                                     */}
      {/* ===================================================================== */}
      {currentTab === 'sales' && (
        <div className="space-y-6">
          {/* Export & Print Toolbar */}
          <ExportReportBar
            title="Sales & Revenue Report"
            dateRangeLabel={salesResult?.report.dateRange.label || dateRange.label}
            recordCount={salesResult?.sales.length}
            onExportCsv={handleExportSalesCsv}
            isExporting={salesLoading}
          />

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <ReportSummaryCard
              title="Gross Sales"
              value={salesResult?.report.summary.totalGrossSales || 0}
              isCurrency
              variant="brand"
              icon={<TrendingUp className="w-5 h-5" />}
              loading={salesLoading}
            />
            <ReportSummaryCard
              title="Sales Returns"
              value={salesResult?.report.summary.totalSalesReturns || 0}
              isCurrency
              variant="danger"
              icon={<RotateCcw className="w-5 h-5" />}
              loading={salesLoading}
            />
            <ReportSummaryCard
              title="Net Sales"
              value={salesResult?.report.summary.netSales || 0}
              isCurrency
              variant="success"
              icon={<CheckCircle2 className="w-5 h-5" />}
              loading={salesLoading}
            />
            <ReportSummaryCard
              title="Cash Received"
              value={salesResult?.report.summary.actualCashReceived || 0}
              subtitle="Cash taken into register"
              isCurrency
              variant="info"
              icon={<DollarSign className="w-5 h-5" />}
              loading={salesLoading}
            />
            <ReportSummaryCard
              title="Outstanding Credit"
              value={salesResult?.report.summary.totalOutstandingCredit || 0}
              subtitle="Khata debt added"
              isCurrency
              variant="warning"
              icon={<CreditCard className="w-5 h-5" />}
              loading={salesLoading}
            />
            <ReportSummaryCard
              title="Total Invoices"
              value={salesResult?.report.summary.totalInvoicesCount || 0}
              subtitle={
                salesResult?.report.summary.averageInvoiceValue
                  ? `Avg: ${formatCurrency(salesResult.report.summary.averageInvoiceValue)}`
                  : 'Avg: PKR 0'
              }
              variant="neutral"
              loading={salesLoading}
            />
          </div>

          {/* Payment Method Comparison Bar */}
          {salesResult && salesResult.report.paymentMethods.length > 0 && (
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Cash vs. Credit vs. Bank Breakdown
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {salesResult.report.paymentMethods.map((pm) => (
                  <div key={pm.method} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">{pm.label}</span>
                      <span className="text-xs font-extrabold text-[#071F49]">{pm.percentage}%</span>
                    </div>
                    <p className="text-base font-black text-slate-900 mt-1">{formatCurrency(pm.totalAmount)}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{pm.invoiceCount} invoices</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Secondary Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl print:hidden">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters:</span>
            </div>

            {/* Payment Method Filter */}
            <select
              value={salesFilters.paymentMethod}
              onChange={(e) =>
                setSalesFilters((prev) => ({
                  ...prev,
                  paymentMethod: e.target.value as any,
                }))
              }
              className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash Only</option>
              <option value="credit">Credit (Khata) Only</option>
              <option value="bank_transfer">Bank Transfer Only</option>
            </select>

            {/* Customer Type Filter */}
            <select
              value={salesFilters.customerType}
              onChange={(e) =>
                setSalesFilters((prev) => ({
                  ...prev,
                  customerType: e.target.value as any,
                }))
              }
              className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            >
              <option value="all">All Customer Types</option>
              <option value="parchon">Parchon (Counter Walk-in)</option>
              <option value="wholesaler">Wholesaler</option>
              <option value="marketshop">Marketshop</option>
            </select>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice number or customer name..."
                value={salesFilters.searchTerm || ''}
                onChange={(e) =>
                  setSalesFilters((prev) => ({ ...prev, searchTerm: e.target.value }))
                }
                className="w-full text-xs bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
              />
            </div>
          </div>

          {/* Subtabs for Sales Breakdown Views */}
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setSalesSubTab('daily')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                salesSubTab === 'daily'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Daily Sales Breakdown
            </button>
            <button
              type="button"
              onClick={() => setSalesSubTab('invoices')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                salesSubTab === 'invoices'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Invoice-Wise Details ({salesResult?.sales.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setSalesSubTab('customers')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                salesSubTab === 'customers'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Customer-Wise Summary ({salesResult?.report.customerSummaries.length || 0})
            </button>
          </div>

          {/* View Content */}
          {salesLoading ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin text-[#071F49] mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">Calculating sales reports...</p>
            </div>
          ) : (
            <>
              {salesSubTab === 'daily' && (
                <DailySalesBreakdownTable data={salesResult?.report.dailyBreakdown || []} />
              )}
              {salesSubTab === 'invoices' && (
                <InvoiceWiseSalesTable sales={salesResult?.sales || []} />
              )}
              {salesSubTab === 'customers' && (
                <CustomerSalesSummaryTable data={salesResult?.report.customerSummaries || []} />
              )}
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: MODULE 6.2 — PURCHASE REPORT                                  */}
      {/* ===================================================================== */}
      {currentTab === 'purchases' && (
        <div className="space-y-6">
          {/* Export & Print Toolbar */}
          <ExportReportBar
            title="Purchase & Stock Intake Report"
            dateRangeLabel={purchaseResult?.report.dateRange.label || dateRange.label}
            recordCount={purchaseResult?.purchases.length}
            onExportCsv={handleExportPurchaseCsv}
            isExporting={purchasesLoading}
          />

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <ReportSummaryCard
              title="Total Purchases"
              value={purchaseResult?.report.summary.totalPurchaseValue || 0}
              isCurrency
              variant="brand"
              icon={<Truck className="w-5 h-5" />}
              loading={purchasesLoading}
            />
            <ReportSummaryCard
              title="Cash Purchases"
              value={purchaseResult?.report.summary.totalCashPurchases || 0}
              isCurrency
              variant="info"
              icon={<DollarSign className="w-5 h-5" />}
              loading={purchasesLoading}
            />
            <ReportSummaryCard
              title="Credit Purchases"
              value={purchaseResult?.report.summary.totalCreditPurchases || 0}
              isCurrency
              variant="warning"
              icon={<CreditCard className="w-5 h-5" />}
              loading={purchasesLoading}
            />
            <ReportSummaryCard
              title="Paid Amount"
              value={purchaseResult?.report.summary.totalPaidAmount || 0}
              isCurrency
              variant="success"
              icon={<CheckCircle2 className="w-5 h-5" />}
              loading={purchasesLoading}
            />
            <ReportSummaryCard
              title="Supplier Payables"
              value={purchaseResult?.report.summary.totalOutstandingBalance || 0}
              subtitle="Pending supplier debt"
              isCurrency
              variant="danger"
              icon={<Building className="w-5 h-5" />}
              loading={purchasesLoading}
            />
            <ReportSummaryCard
              title="Purchase Returns"
              value="PKR 0"
              subtitle="None recorded"
              variant="neutral"
              icon={<RotateCcw className="w-5 h-5" />}
              loading={purchasesLoading}
            />
          </div>

          {/* Secondary Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl print:hidden">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters:</span>
            </div>

            {/* Supplier Filter */}
            <select
              value={purchaseFilters.supplierId}
              onChange={(e) =>
                setPurchaseFilters((prev) => ({
                  ...prev,
                  supplierId: e.target.value,
                }))
              }
              className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            >
              <option value="all">All Suppliers / Publishers</option>
              {suppliersList.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.companyName}
                </option>
              ))}
            </select>

            {/* Payment Method Filter */}
            <select
              value={purchaseFilters.paymentMethod}
              onChange={(e) =>
                setPurchaseFilters((prev) => ({
                  ...prev,
                  paymentMethod: e.target.value as any,
                }))
              }
              className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash Only</option>
              <option value="credit">Credit Only</option>
              <option value="bank_transfer">Bank Transfer Only</option>
            </select>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search purchase bill #, supplier or item..."
                value={purchaseFilters.searchTerm || ''}
                onChange={(e) =>
                  setPurchaseFilters((prev) => ({ ...prev, searchTerm: e.target.value }))
                }
                className="w-full text-xs bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#071F49]/20"
              />
            </div>
          </div>

          {/* Subtabs for Purchase Breakdown Views */}
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setPurchaseSubTab('suppliers')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                purchaseSubTab === 'suppliers'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Supplier-Wise Summary ({purchaseResult?.report.supplierSummaries.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setPurchaseSubTab('daily')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                purchaseSubTab === 'daily'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Date-Wise Intake Summary
            </button>
            <button
              type="button"
              onClick={() => setPurchaseSubTab('invoices')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                purchaseSubTab === 'invoices'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Purchase Invoices ({purchaseResult?.purchases.length || 0})
            </button>
          </div>

          {/* View Content */}
          {purchasesLoading ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin text-[#071F49] mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">Calculating purchase reports...</p>
            </div>
          ) : (
            <>
              {purchaseSubTab === 'suppliers' && (
                <SupplierPurchaseSummaryTable
                  data={purchaseResult?.report.supplierSummaries || []}
                />
              )}
              {purchaseSubTab === 'daily' && (
                <DateWisePurchaseTable data={purchaseResult?.report.dateSummaries || []} />
              )}
              {purchaseSubTab === 'invoices' && (
                <PurchaseInvoiceDetailTable purchases={purchaseResult?.purchases || []} />
              )}
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: MODULE 6.4 — OPERATING PROFIT & LOSS REPORT                   */}
      {/* ===================================================================== */}
      {currentTab === 'profit_loss' && (
        <div className="space-y-6">
          {/* Export & Print Toolbar */}
          <ExportReportBar
            title="Operating Profit & Loss Report"
            dateRangeLabel={plResult?.report.dateRange.label || dateRange.label}
            recordCount={plResult?.sales.length}
            onExportCsv={handleExportProfitLossCsv}
            isExporting={plLoading}
          />

          {/* Quick Search Filter */}
          <div className="bg-white p-3.5 border border-slate-200 rounded-2xl shadow-xs flex items-center justify-between gap-4 print:hidden">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search invoices, returns, or expenses..."
                value={plFilters.searchTerm || ''}
                onChange={(e) => setPlFilters((prev) => ({ ...prev, searchTerm: e.target.value }))}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#071F49]/20 focus:border-[#071F49]"
              />
            </div>
            <div className="text-xs text-slate-500 font-semibold hidden sm:block">
              {plResult ? (
                <span>
                  {formatNumber(plResult.sales.length)} sales • {formatNumber(plResult.returns.length)} returns • {formatNumber(plResult.expenses.length)} expenses
                </span>
              ) : null}
            </div>
          </div>

          {/* 5-Metric Financial Cards & Disclosures */}
          {plResult && (
            <ProfitLossSummarySection
              summary={plResult.report.summary}
              loading={plLoading}
            />
          )}

          {/* Sub-Tabs Navigation */}
          <div className="flex items-center gap-1 border-b border-slate-200 print:hidden overflow-x-auto">
            <button
              type="button"
              onClick={() => setPlSubTab('overview')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                plSubTab === 'overview'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Overview & Performance
            </button>
            <button
              type="button"
              onClick={() => setPlSubTab('daily')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                plSubTab === 'daily'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Daily Trend ({plResult?.report.dailyBreakdown.length || 0} days)
            </button>
            <button
              type="button"
              onClick={() => setPlSubTab('expenses')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                plSubTab === 'expenses'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Operating Expenses ({plResult?.report.categoryExpenses.length || 0} categories)
            </button>
          </div>

          {/* View Content */}
          {plLoading ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin text-[#071F49] mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">Calculating Operating Profit & Loss statement...</p>
            </div>
          ) : (
            <>
              {plSubTab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                      Daily Operating Profit & Loss Breakdown
                    </h3>
                    <DailyProfitLossTable data={plResult?.report.dailyBreakdown || []} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                      Operating Expense Category Breakdown
                    </h3>
                    <ProfitLossExpenseBreakdownTable
                      data={plResult?.report.categoryExpenses || []}
                      totalOperatingExpenses={plResult?.report.summary.totalOperatingExpenses || 0}
                    />
                  </div>
                </div>
              )}
              {plSubTab === 'daily' && (
                <DailyProfitLossTable data={plResult?.report.dailyBreakdown || []} />
              )}
              {plSubTab === 'expenses' && (
                <ProfitLossExpenseBreakdownTable
                  data={plResult?.report.categoryExpenses || []}
                  totalOperatingExpenses={plResult?.report.summary.totalOperatingExpenses || 0}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: MODULE 6.5 — CASH FLOW & CASH BOOK REPORT                      */}
      {/* ===================================================================== */}
      {currentTab === 'cash_flow' && (
        <div className="space-y-6">
          {/* Export & Print Toolbar */}
          <ExportReportBar
            title="Cash Flow & Cash Book Report"
            dateRangeLabel={cfResult?.report.dateRange.label || dateRange.label}
            recordCount={cfResult?.report.transactions.length}
            onExportCsv={handleExportCashFlowCsv}
            isExporting={cfLoading}
          />

          {/* 5-Metric Financial Cards & Closing Drawer Position */}
          {cfResult && (
            <CashFlowSummarySection
              summary={cfResult.report.summary}
              openingFloat={openingFloat}
              onOpeningFloatChange={(val) => {
                setOpeningFloat(val);
                invalidateFinancialReportsCache();
                loadCashFlowReport();
              }}
              loading={cfLoading}
            />
          )}

          {/* Sub-Tabs Navigation */}
          <div className="flex items-center gap-1 border-b border-slate-200 print:hidden overflow-x-auto">
            <button
              type="button"
              onClick={() => setCfSubTab('overview')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                cfSubTab === 'overview'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Overview & Cash Drawer
            </button>
            <button
              type="button"
              onClick={() => setCfSubTab('cash_book')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                cfSubTab === 'cash_book'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Cash Book Register ({cfResult?.report.transactions.length || 0} entries)
            </button>
            <button
              type="button"
              onClick={() => setCfSubTab('daily')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                cfSubTab === 'daily'
                  ? 'border-[#071F49] text-[#071F49]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Daily Cash Flow Trend ({cfResult?.report.dailyBreakdown.length || 0} days)
            </button>
          </div>

          {/* View Content */}
          {cfLoading ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin text-[#071F49] mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">Reconciling cash drawer and cash flow entries...</p>
            </div>
          ) : (
            <>
              {cfSubTab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                      Daily Cash Flow & Banking Trend
                    </h3>
                    <DailyCashFlowTable data={cfResult?.report.dailyBreakdown || []} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                      Complete Cash Book & Banking Register
                    </h3>
                    <CashBookLedgerTable
                      transactions={cfResult?.report.transactions || []}
                      openingFloat={openingFloat}
                    />
                  </div>
                </div>
              )}
              {cfSubTab === 'cash_book' && (
                <CashBookLedgerTable
                  transactions={cfResult?.report.transactions || []}
                  openingFloat={openingFloat}
                />
              )}
              {cfSubTab === 'daily' && (
                <DailyCashFlowTable data={cfResult?.report.dailyBreakdown || []} />
              )}
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: MODULE 6.6 — CUSTOMER RECEIVABLES REPORT                       */}
      {/* ===================================================================== */}
      {currentTab === 'receivables' && (
        <div className="space-y-6">
          {/* Export & Print Toolbar */}
          <ExportReportBar
            title="Customer Receivables & Aging Report"
            dateRangeLabel={`As of ${dateRange.endDate}`}
            recordCount={receivablesResult?.report.customers.length}
            onExportCsv={handleExportReceivablesCsv}
            isExporting={receivablesLoading}
          />

          {/* Receivables Summary Cards & Aging Section */}
          <CustomerReceivablesSummarySection
            summary={
              receivablesResult?.report.summary || {
                totalOutstandingReceivables: 0,
                totalCreditLimit: 0,
                overallCreditUtilizationPct: 0,
                totalOverdueAmount: 0,
                totalAdvanceAmount: 0,
                customersWithBalanceCount: 0,
                advanceCustomersCount: 0,
                zeroBalanceCustomersCount: 0,
                totalCustomersCount: 0,
                agingSummary: { current30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 },
                wholesalerReceivables: 0,
                marketshopReceivables: 0,
                parchonReceivables: 0,
                averageReceivableBalance: 0,
              }
            }
            loading={receivablesLoading}
          />

          {/* Customer Receivables Detail Table */}
          <CustomerReceivablesTable
            customers={receivablesResult?.report.customers || []}
            filters={receivablesFilters}
            onFilterChange={(f) => setReceivablesFilters(f)}
            loading={receivablesLoading}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: MODULE 6.7 — SUPPLIER PAYABLES REPORT                          */}
      {/* ===================================================================== */}
      {currentTab === 'payables' && (
        <div className="space-y-6">
          {/* Export & Print Toolbar */}
          <ExportReportBar
            title="Supplier Payables & Liability Report"
            dateRangeLabel={`As of ${dateRange.endDate}`}
            recordCount={payablesResult?.report.suppliers.length}
            onExportCsv={handleExportPayablesCsv}
            isExporting={payablesLoading}
          />

          {/* Payables Summary Section */}
          <SupplierPayablesSummarySection
            summary={
              payablesResult?.report.summary || {
                totalOutstandingPayables: 0,
                suppliersWithBalanceCount: 0,
                zeroBalanceSuppliersCount: 0,
                totalSuppliersCount: 0,
                totalUnpaidInvoicesCount: 0,
                agingSummary: { current30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 },
                averagePayableBalance: 0,
              }
            }
            loading={payablesLoading}
          />

          {/* Supplier Payables Detail Table */}
          <SupplierPayablesTable
            suppliers={payablesResult?.report.suppliers || []}
            rawSuppliers={payablesResult?.suppliers || []}
            filters={payablesFilters}
            onFilterChange={(f) => setPayablesFilters(f)}
            onPaySupplier={(sup) => {
              setSelectedPaySupplier(sup);
              setIsSupplierPaymentModalOpen(true);
            }}
            loading={payablesLoading}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 7: MODULE 6.8 — FULL ACCOUNTING RECONCILIATION                   */}
      {/* ===================================================================== */}
      {currentTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* Export & Print Toolbar */}
          <ExportReportBar
            title="Full Accounting Reconciliation"
            dateRangeLabel={recData?.dateRange.label || dateRange.label}
            recordCount={recData?.items.length}
            onExportCsv={handleExportReconciliationCsv}
            isExporting={recLoading}
          />

          {/* Module 6.8 Reconciliation View */}
          <AccountingReconciliationView data={recData} loading={recLoading} />
        </div>
      )}

      {/* Modal for Recording Supplier Payment / Settlement */}
      <SupplierPaymentModal
        isOpen={isSupplierPaymentModalOpen}
        onClose={() => {
          setIsSupplierPaymentModalOpen(false);
          setSelectedPaySupplier(null);
        }}
        supplier={selectedPaySupplier}
        onSuccess={() => {
          loadPayablesReport();
        }}
      />
    </div>
  );
};

