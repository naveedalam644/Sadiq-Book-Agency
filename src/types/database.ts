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
  shopName?: string;
  address?: string;
  city?: string;
  discountPercentage?: number; // Base store discount for marketshop customers
  creditLimit: number;
  currentBalance: number; // Positive = owes money (Udhaar), Negative = advance
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 3. Categories Collection ('categories')
export type ItemClassification = 'book' | 'notebook' | 'stationery' | 'general';

export interface CategoryDocument {
  id: string;
  name: string;
  classification: ItemClassification;
  description?: string;
  isActive: boolean;
  createdAt: string;
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
  authorOrPublisher?: string; // Author for books, manufacturer/brand for notebooks
  edition?: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  currentStock: number;
  lowStockThreshold: number;
  unit: string; // 'piece', 'bundle', 'dozen', 'box'
  shelfLocation?: string;
  isActive: boolean;
  isLowStock?: boolean;
  titleSearch?: string;
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
  unitCost: number;
  totalCost: number;
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

// 7. Sales Collection ('sales')
export interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number; // Standard catalog unit price
  discountRate: number; // Exact customer-specific or trade discount % applied at sale time
  discountAmount: number; // Monitory discount subtracted
  lineTotal: number; // (unitPrice * (1 - discountRate/100)) * quantity
}

export interface SaleDocument {
  id: string;
  invoiceNo: string;
  customerType: CustomerType;
  customerId?: string; // Optional for Parchon (cash walk-in)
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
  amountReceived: number;
  changeGiven: number;
  balanceAddedToCredit: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  operatorUserId: string;
  operatorName: string;
  saleDate: string;
  notes?: string;
  createdAt: string;
}

// 8. Payments Collection ('payments')
export type PaymentTarget = 'customer_credit' | 'supplier_payable' | 'direct_sale';

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
  entryType: LedgerEntryType;
  referenceInvoiceNo?: string;
  referenceReceiptNo?: string;
  description: string;
  amount: number;
  runningBalance: number;
  recordedByUserId: string;
  date: string;
  createdAt: string;
}

// 10. Expenses Collection ('expenses')
export interface ExpenseDocument {
  id: string;
  expenseCategory: 'rent' | 'utilities' | 'salaries' | 'refreshment' | 'transport' | 'maintenance' | 'miscellaneous';
  title: string;
  amount: number;
  paymentMode: 'cash' | 'bank_transfer';
  paidTo?: string;
  paidByUserId: string;
  receiptImageUrl?: string;
  expenseDate: string;
  notes?: string;
  createdAt: string;
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
