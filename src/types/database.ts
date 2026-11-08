/**
 * DATABASE ARCHITECTURE TYPE DEFINITIONS
 * Bookstore & Stationers Management System
 * Sadiq Book Agency
 */

// 1. Users Collection ('users')
export interface UserDocument {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'operator';
  phoneNumber?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

// 2. Customers Collection ('customers')
export type CustomerType = 'wholesaler' | 'parchon' | 'marketshop';

export interface CustomerDocument {
  id: string;
  name: string;
  type: CustomerType;
  phone: string;
  secondaryPhone?: string;
  shopName?: string;
  address?: string;
  city?: string;
  discountPercentage?: number; // Base store discount for marketshop customers
  creditLimit: number;
  creditDays?: number; // Credit settlement term in days (e.g. 15, 30)
  currentBalance: number; // Positive = owes money (Udhaar), Negative = advance
  isActive: boolean;
  notes?: string;
  lastSaleId?: string; // Links balance update to sale via getAfter()
  createdAt: string;
  updatedAt: string;
}

// 2b. Customer Discounts Collection ('customerDiscounts')
export type CustomerDiscountType = 'percentage' | 'fixed_rate';

export interface CustomerDiscountDocument {
  id: string; // Composite: `${customerId}_${productId}`
  customerId: string;
  productId: string;
  productTitle: string;
  productSku: string;
  classification: ItemClassification;
  categoryName?: string;
  discountType: CustomerDiscountType;
  discountValue: number; // E.g., 25 for 25% or 280 for Rs. 280 fixed rate
  basePriceType: 'wholesale' | 'retail';
  standardPrice: number;
  effectivePrice: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
}

// 3. Categories Collection ('categories')
export type ItemClassification = 'book' | 'notebook' | 'register' | 'stationery' | 'general';

export interface CategoryDocument {
  id: string;
  name: string;
  classification: ItemClassification;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

// 3b. Publishers Collection ('publishers')
export interface PublisherDocument {
  id: string; // e.g., 'pub_oxford_university_press' or UUID
  name: string; // Unique case-insensitive (e.g. "Oxford University Press")
  normalizedName: string; // Lowercase, whitespace-collapsed string for duplicate checks
  description?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  seriesCount?: number; // Cached aggregate
  productCount?: number; // Cached aggregate
  createdAt: string;
  updatedAt: string;
}

// 3c. Series Collection ('series') — Belongs strictly to exactly one publisher
export interface SeriesDocument {
  id: string; // e.g., 'ser_oxford_progressive' or UUID
  name: string; // Unique within publisher (e.g. "Progressive Series")
  normalizedName: string; // Lowercase, whitespace-collapsed string for scoped duplicate checks
  publisherId: string; // Foreign key referencing PublisherDocument.id
  publisherName: string; // Denormalized publisher name snapshot for zero-read display
  description?: string;
  isActive: boolean;
  productCount?: number; // Cached aggregate
  createdAt: string;
  updatedAt: string;
}

// 3d. Notebook & Register Attributes Collection ('notebookAttributes')
export type NotebookAttributeType = 'size' | 'sheets' | 'grammage';

export interface NotebookAttributeDocument {
  id: string; // e.g., auto-id or UUID
  type: NotebookAttributeType;
  value: string; // e.g., "A4", "100", "70 GSM"
  normalizedValue: string; // Trimmed, lowercase for case-insensitive duplicate check
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

// 4. Products Collection ('products')
export interface ProductDocument {
  id: string;
  sku: string;
  barcode?: string;
  title: string;
  classification: ItemClassification;
  categoryId: string;
  categoryName?: string;
  publisherId?: string; // Foreign key referencing PublisherDocument.id
  publisherName?: string; // Dedicated publisher name string (e.g. "Oxford University Press", "Moon Light Publisher")
  seriesId?: string; // Foreign key referencing SeriesDocument.id (strictly belongs to publisherId)
  seriesName?: string; // Denormalized display title of the series
  authorOrPublisher?: string; // Maintained for backward compatibility
  edition?: string;
  targetClass?: string; // Academic Class (e.g. "Play Group", "Nursery", "Prep / KG", "Class 1" ... "Class 10")
  className?: string; // Alias for targetClass
  // Notebook & Register Dynamic Attributes
  notebookSize?: string; // e.g. "A4", "A5", "Foolscap"
  notebookSheets?: string; // e.g. "40", "80", "100", "200"
  notebookGrammage?: string; // e.g. "60 GSM", "70 GSM", "80 GSM"
  // Simplified Pricing Model:
  // Actual Purchase Cost = MRP * (1 - Publisher Discount % / 100)
  costPrice: number; // Actual publisher-discounted purchase cost (PKR)
  retailPrice: number; // Original Price / MRP (PKR)
  originalPrice?: number; // Snapshot of Original Price / MRP (same as retailPrice)
  mrp?: number; // Explicit MRP alias
  publisherDiscountPercent?: number; // Manually entered product-level publisher discount % (e.g. 50%)
  wholesalePrice?: number; // Maintained for backward compatibility (defaults to retailPrice)
  currentStock: number;
  lowStockThreshold: number;
  unit: string; // 'piece', 'bundle', 'dozen', 'box'
  shelfLocation?: string;
  isActive: boolean;
  isLowStock?: boolean;
  titleSearch?: string;
  lastSaleId?: string; // Links stock decrement to sale via getAfter()
  createdAt: string;
  updatedAt: string;
}

// 4b. Inventory Summary Singleton ('settings/inventory_summary')
export interface InventorySummaryDocument {
  id: 'inventory_summary';
  totalProducts: number;
  totalStockQuantity: number;
  totalStockValue: number; // Aggregate based on costPrice * currentStock
  totalSuppliers: number;
  lowStockCount: number;
  updatedAt: string;
}

// 5. Suppliers Collection ('suppliers')
export interface SupplierDocument {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address?: string;
  currentBalance: number; // Balance owed to supplier
  isActive: boolean;
  createdAt: string;
}

// 6. Purchases Collection ('purchases')
export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  mrp?: number; // Catalog MRP snapshot at intake
  publisherDiscountPercent?: number; // Publisher discount % for this purchase line
  unitCost: number; // Actual purchase unit cost: mrp * (1 - pubDisc / 100)
  totalCost: number; // quantity * unitCost
}

export interface PurchaseDocument {
  id: string;
  purchaseInvoiceNo: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  subtotal: number;
  discountAmount: number;
  grandTotal: number;
  paidAmount: number;
  remainingBalance: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  purchaseDate: string;
  receivedByUserId: string;
  notes?: string;
  createdAt: string;
}

// 6b. Stock Batches Collection ('stockBatches') — FIFO Cost Tracking
export interface StockBatchDocument {
  id: string; // Deterministic: BATCH_${purchaseId}_${productId} or BATCH_OPEN_${productId}
  productId: string;
  productTitle: string;
  purchaseId: string; // Purchase document ID or 'OPENING_STOCK'
  purchaseInvoiceNo: string; // Invoice number or 'OPENING_STOCK'
  purchaseDate: string; // YYYY-MM-DD
  quantityPurchased: number;
  remainingQuantity: number; // Active units remaining in this batch
  mrp: number; // Printed catalog MRP snapshot
  publisherDiscountPercent: number; // Publisher discount % for this purchase
  unitCost: number; // Actual purchase unit cost
  totalCost: number; // quantityPurchased * unitCost
  batchType: 'purchase' | 'opening'; // Source indicator
  lastSaleId?: string; // Audit linkage to atomic sale doc for security rules & traceability
  lastReturnNo?: string; // Audit linkage to atomic return doc for security rules & traceability
  createdAt: string;
  updatedAt: string;
}

export interface SaleItemBatchDepletion {
  batchId: string;
  quantity: number;
  unitCost: number;
}

// 7. Sales Collection ('sales')
export interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  publisherName?: string; // Authoritative historical snapshot taken at time of sale
  quantity: number;
  costPrice: number; // Historical purchase cost snapshot at time of sale (FIFO batch unit cost)
  unitPrice: number; // Original Price / MRP before customer discount
  originalPrice?: number; // Snapshot of original MRP
  mrp?: number; // Snapshot of original MRP
  discountRate: number; // Customer discount percentage applied for this line
  discountPercent?: number; // Snapshot alias for customer discount percentage
  discountAmount: number; // Monetary customer discount subtracted per unit
  effectivePrice: number; // Final selling price after customer discount (unitPrice - discountAmount)
  sellingPrice?: number; // Snapshot alias for final selling price
  lineTotal: number; // Final line total (effectivePrice * quantity)
  batchesDepleted?: SaleItemBatchDepletion[]; // Exact FIFO batches depleted for this line
}

export interface AdminCreditOverride {
  authorizedByUserId: string;
  authorizedByEmail: string;
  authorizedAt: string;
  reason: string;
  exceededAmount: number;
}

export interface InvoiceDueDateOverride {
  previousDueDate?: string;
  newDueDate: string;
  overriddenByUserId: string;
  overriddenByEmail?: string;
  overriddenAt: string;
  reason: string;
}

export type InvoiceDueStatus = 'paid' | 'pending' | 'due_soon' | 'overdue' | 'no_due_date';

export interface SaleDocument {
  id: string; // Deterministic: same as invoiceNo
  invoiceNo: string;
  checkoutSessionId: string; // Persistent client idempotency key
  terminalId?: string; // Originating terminal identifier
  sessionCreatedAt?: string; // Persistent session initialization timestamp
  productIds: string[]; // Flat list of product IDs for Firestore Security Rules getAfter validation
  customerType: CustomerType;
  customerId?: string; // Empty / undefined for Parchon (cash walk-in)
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
  cashTendered: number; // Physical cash received from customer
  changeReturned: number; // Physical change handed back
  paymentApplied: number; // Net cash recorded into store register
  balanceAddedToCredit: number; // Remaining debt posted to customer Khata
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  operatorUserId: string;
  operatorName: string;
  saleDate: string;
  creditLimitOverride?: AdminCreditOverride;
  dueDate?: string; // Due date in YYYY-MM-DD format
  creditDaysSnapshot?: number; // Snapshot of customer's credit term days at sale creation
  dueDateOverride?: InvoiceDueDateOverride; // Admin manual override record
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 7b. Sales Returns Collection ('salesReturns')
export type ReturnItemCondition = 'saleable' | 'damaged';

export interface SaleReturnItem {
  productId: string;
  productName: string;
  publisherName?: string; // Captured from original sale item snapshot (or 'Unknown')
  originalCostPrice?: number; // Preserved for net COGS and gross profit accounting
  quantity: number;
  condition?: ReturnItemCondition; // 'saleable' = automatically restocked, 'damaged' = not added to saleable inventory
  refundUnitPrice: number;
  refundLineTotal: number;
}

export interface SaleReturnDocument {
  id: string; // RET_{invoiceNo}_{index}
  returnNo: string;
  originalSaleId: string;
  originalInvoiceNo: string;
  customerId?: string;
  customerName: string;
  items: SaleReturnItem[];
  productIds?: string[]; // Array of product IDs for direct indexing and query bounds
  totalRefundAmount: number;
  refundMethod: 'cash' | 'credit_deduction';
  reason: string;
  processedByUserId: string;
  processedByEmail?: string;
  returnDate: string;
  createdAt: string;
}

// 7.1 Sale Return Summaries ('saleReturnSummaries')
// Authoritative transactional lock and cumulative return counter per sale invoice
export interface SaleReturnSummaryItem {
  productId: string;
  totalReturnedQuantity: number;
}

export interface SaleReturnSummaryDocument {
  id: string; // matches invoiceNo
  invoiceNo: string;
  returnedItems: SaleReturnSummaryItem[];
  totalRefundedAmount: number;
  returnCount: number;
  lastReturnNo: string;
  updatedAt: string;
  createdAt: string;
}

// 8. Payments Collection ('payments')
export type PaymentTarget = 'customer_credit' | 'supplier_payable' | 'direct_sale' | 'sales_refund';

export interface PaymentDocument {
  id: string;
  receiptNo: string;
  targetType: PaymentTarget;
  referenceId: string; // CustomerId, SupplierId, or SaleId
  partyName: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer' | 'cheque';
  transactionReference?: string;
  receivedByUserId: string;
  paymentDate: string;
  notes?: string;
  createdAt: string;
}

// 9. Customer Ledger Collection ('customerLedger')
export type LedgerEntryType = 'debit' | 'credit'; // Debit = Invoice added, Credit = Payment received

export interface CustomerLedgerDocument {
  id: string;
  customerId: string;
  customerName?: string;
  entryType: LedgerEntryType;
  referenceInvoiceNo?: string;
  referenceReceiptNo?: string;
  description: string;
  amount: number;
  runningBalance: number;
  recordedByUserId: string;
  recordedByEmail?: string;
  date: string;
  createdAt: string;
}

// 10. Expenses Collection ('expenses')
export type ExpenseCategory =
  | 'rent'
  | 'salaries'
  | 'electricity'
  | 'internet'
  | 'transport'
  | 'maintenance'
  | 'utilities'
  | 'refreshment'
  | 'miscellaneous'
  | 'other';

export interface ExpenseDocument {
  id: string;
  expenseCategory: ExpenseCategory;
  title: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer';
  paidTo?: string;
  paidByUserId: string;
  paidByEmail?: string;
  receiptImageUrl?: string;
  referenceNo?: string;
  expenseDate: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

// 11. Stock Movements Collection ('stockMovements')
export type StockMovementReason = 'sale' | 'purchase' | 'customer_return' | 'supplier_return' | 'adjustment' | 'damage';

export interface StockMovementDocument {
  id: string;
  productId: string;
  productName: string;
  movementType: 'in' | 'out';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: StockMovementReason;
  referenceDocId?: string; // PurchaseId, SaleId, or ReturnId
  recordedByUserId: string;
  createdAt: string;
}

// 12. Settings Collection ('settings')
export interface StoreSettingsDocument {
  id: 'store_profile' | 'billing_config' | 'system_rules';
  storeName: string;
  tagline?: string;
  contactNumber: string;
  address: string;
  invoiceHeaderNote?: string;
  invoiceFooterNote?: string;
  currencySymbol: string;
  defaultMarketshopDiscount: number;
  lowStockGlobalThreshold: number;
  enableThermalPrinting: boolean;
  thermalPrinterPaperWidth: '58mm' | '80mm';
  updatedAt: string;
  updatedByUserId?: string;
}

// 13. Audit Logs Collection ('auditLogs')
export interface AuditLogDocument {
  id: string;
  action: string;
  collectionTarget: string;
  targetId?: string;
  details: string;
  performedByUserId: string;
  performedByEmail: string;
  ipAddress?: string;
  timestamp: string;
}

// 14. Customer-wise Product Discounts ('customerDiscounts')
export interface CustomerProductDiscountDocument {
  id: string; // Format: `${customerId}_${productId}` for O(1) point-lookup
  customerId: string;
  customerName: string;
  productId: string;
  productTitle: string;
  sku: string;
  discountPercentage: number;
  assignedByUserId: string;
  assignedByEmail: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDiscountBundleDocument {
  id: string; // customerId
  customerId: string;
  customerName: string;
  discounts: Record<string, number>;
  updatedAt: string;
  updatedByUserId: string;
}

// 15. WhatsApp Messages Collection ('whatsappMessages')
export type WhatsAppMessageType =
  | 'invoice'
  | 'payment_reminder'
  | 'outstanding_balance'
  | 'account_statement'
  | 'sales_return'
  | 'payment_receipt'
  | 'custom';

export type WhatsAppSendingMethod = 'manual' | 'cloud_api';

export type WhatsAppDeliveryStatus =
  | 'prepared'
  | 'opened'
  | 'copied'
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface WhatsAppMessageDocument {
  id: string; // Deterministic or auto-generated ID
  customerId?: string; // Optional (omitted for walk-in counter customers)
  customerNameSnapshot: string;
  phoneNumberSnapshot: string; // Normalized standard format (e.g., 923449633526)
  messageType: WhatsAppMessageType;
  sendingMethod: WhatsAppSendingMethod;
  messageText: string;
  relatedInvoiceNo?: string;
  relatedReturnNo?: string;
  status: WhatsAppDeliveryStatus;
  providerMessageId?: string; // Meta message ID (wamid.XXX) for Cloud API
  errorCode?: string;
  errorMessage?: string;
  sentByUserId: string;
  sentByEmail: string;
  sentAt: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppSettingsState {
  manualSharingEnabled: boolean;
  cloudApiConfigured: boolean;
  businessPhoneNumber: string;
  wabaId?: string;
  phoneNumberId?: string;
  webhookStatus?: 'active' | 'inactive' | 'unverified';
}

// 16. Educational Boards Collection ('boards')
export interface EducationalBoardDocument {
  id: string;
  name: string;
  code?: string;
  city?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
}

// 17. Schools Collection ('schools')
export interface SchoolDocument {
  id: string;
  boardId: string;
  boardName: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  contactPerson?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
}

// 18. Syllabus / Course Set Item
export interface SyllabusBookItem {
  productId: string;
  title: string;
  sku: string;
  publisherId?: string;
  publisherName?: string;
  seriesId?: string;
  seriesName?: string;
  subject?: string;
  quantity: number;
  retailPrice: number;
  costPrice: number;
}

// 19. Syllabus / Course Sets Collection ('syllabusSets')
export interface SyllabusSetDocument {
  id: string;
  boardId: string;
  boardName: string;
  schoolId: string;
  schoolName: string;
  className: string;
  academicYear?: string;
  items: SyllabusBookItem[];
  totalBooks: number;
  totalSetPrice: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
}

// 20. Rough Bills & Quotations Collection ('roughBills')
export type RoughBillType = 'customer_quotation' | 'publisher_order';

export interface RoughBillItem {
  productId: string;
  title: string;
  sku: string;
  publisherName?: string;
  seriesName?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  costPrice?: number;
  lineTotal: number;
}

export interface RoughBillDocument {
  id: string;
  billNo: string;
  billType: RoughBillType;
  title: string;
  partyName: string;
  phone?: string;
  date: string;
  items: RoughBillItem[];
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
  notes?: string;
  status: 'draft' | 'sent' | 'converted';
  convertedSaleInvoiceNo?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
}
