# Cloud Firestore Database Architecture Design
**Project:** Bookstore & Stationers Management System  
**Current Phase:** Phase 1 — Foundation & Architecture Specification  
**Document Status:** Approved Design (Schema Definitions & Index Strategy)

---

## 1. Architectural Principles

1. **Denormalization for Fast POS Reads:**
   - Counter point-of-sale transactions require instant responses (<50ms). Product names, unit prices, and customer snapshot data are duplicated directly inside sale documents to eliminate multi-collection join delays.
2. **Immutable Audit Trails & Ledgers:**
   - Financial ledgers (`customerLedger`), inventory adjustments (`stockMovements`), and operational logs (`auditLogs`) are strictly append-only. No edits or deletions are permitted under Firestore security rules.
3. **Multi-tier Customer Accounting:**
   - Supports three distinct customer archetypes:
     * **Wholesaler:** Bulk book/notebook buyers purchasing at wholesale trade prices, with credit limits and Khata ledger tracking.
     * **Parchon (Retail Walk-in):** Cash counter sales at retail shelf prices; instant cash balancing with optional customer name.
     * **Marketshop (Local Shopkeepers):** Regular retail shops with customized negotiated discount percentages and Khata credit tracking.
4. **Data Isolation & Security Rules:**
   - Every read and write query is validated server-side by `firestore.rules`. No public database access is permitted.

---

## 2. Collection Schemas & Field Definitions

### 1. `users` Collection
* **Collection Path:** `/users/{userId}`
* **Purpose:** Stores admin, manager, and operator credentials, role-based authorization, and activity timestamps.
* **Security:** Only administrators can create or update users; authenticated users can read their own profile.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Firebase Auth UID |
| `email` | `string` | Admin/Operator email address |
| `displayName` | `string` | Staff member full name |
| `role` | `string` | Enum: `'admin'` \| `'manager'` \| `'operator'` |
| `phoneNumber` | `string?` | Optional contact number |
| `isActive` | `boolean` | Account active status (true/false) |
| `createdAt` | `string` (ISO 8601) | Account creation timestamp |
| `updatedAt` | `string` (ISO 8601) | Profile modification timestamp |
| `lastLoginAt` | `string?` | Last successful sign-in timestamp |

---

### 2. `customers` Collection
* **Collection Path:** `/customers/{customerId}`
* **Purpose:** Customer profiles, classification (Wholesaler, Parchon, Marketshop), credit limits, and running balance.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Auto-generated UUID |
| `name` | `string` | Customer / shopkeeper personal name |
| `type` | `string` | Enum: `'wholesaler'` \| `'parchon'` \| `'marketshop'` |
| `phone` | `string` | Primary mobile contact number |
| `shopName` | `string?` | Business name (for Wholesaler & Marketshop) |
| `address` | `string?` | Street address or market row |
| `city` | `string?` | City / area |
| `discountPercentage` | `number?` | Agreed discount rate (0%–100%) for Marketshop |
| `creditLimit` | `number` | Maximum allowed credit balance in PKR |
| `currentBalance` | `number` | Positive = Udhaar owed; Negative = Advance payment |
| `isActive` | `boolean` | Active trade status |
| `notes` | `string?` | Special trade instructions |
| `createdAt` | `string` (ISO 8601) | Registration timestamp |
| `updatedAt` | `string` (ISO 8601) | Last balance change timestamp |

---

### 3. `categories` Collection
* **Collection Path:** `/categories/{categoryId}`
* **Purpose:** Product classification hierarchy distinguishing between textbooks, guidebooks, registers, notebooks, and stationery.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Category UUID |
| `name` | `string` | Category display title (e.g. "Oxford Textbooks") |
| `classification` | `string` | Enum: `'book'` \| `'notebook'` \| `'stationery'` \| `'general'` |
| `description` | `string?` | Shelf / section notes |
| `isActive` | `boolean` | Whether active in POS dropdowns |
| `createdAt` | `string` (ISO 8601) | Creation timestamp |

---

### 4. `products` Collection
* **Collection Path:** `/products/{productId}`
* **Purpose:** Master catalog of books, registers, exercise books, and stationery items with cost, wholesale, and retail pricing.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Product UUID |
| `sku` | `string` | Unique store SKU code (e.g. "BK-97801-OXF") |
| `barcode` | `string?` | EAN-13 / UPC barcode for optical scanner |
| `title` | `string` | Book / Notebook title |
| `classification` | `string` | Enum: `'book'` \| `'notebook'` \| `'stationery'` \| `'general'` |
| `categoryId` | `string` | Reference ID from `categories` |
| `categoryName` | `string?` | Denormalized category title |
| `authorOrPublisher` | `string?` | Author name or publisher / notebook brand |
| `edition` | `string?` | Book edition / notebook size (e.g., "160 Pages Spiral") |
| `costPrice` | `number` | Purchase unit cost from supplier |
| `retailPrice` | `number` | Default retail counter price (Parchon rate) |
| `wholesalePrice` | `number` | Bulk price for Wholesaler clients |
| `currentStock` | `number` | Real-time physical quantity on hand |
| `lowStockThreshold` | `number` | Minimum threshold for reorder alerts |
| `unit` | `string` | Enum: `'piece'` \| `'bundle'` \| `'dozen'` \| `'box'` |
| `shelfLocation` | `string?` | Physical rack / aisle location |
| `isActive` | `boolean` | Visible for sale |
| `createdAt` | `string` (ISO 8601) | Item creation date |
| `updatedAt` | `string` (ISO 8601) | Price or stock update date |

---

### 5. `suppliers` Collection
* **Collection Path:** `/suppliers/{supplierId}`
* **Purpose:** Publishing houses, notebook factories, and stationery distributors from whom stock is purchased.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Supplier UUID |
| `companyName` | `string` | Company or Publisher name (e.g., "Oxford University Press") |
| `contactPerson` | `string` | Representative or account manager |
| `phone` | `string` | Office or mobile phone |
| `email` | `string?` | Supplier email |
| `address` | `string?` | Warehouse or billing address |
| `currentBalance` | `number` | Payable amount owed to supplier |
| `isActive` | `boolean` | Active vendor status |
| `createdAt` | `string` (ISO 8601) | Onboarding date |

---

### 6. `purchases` Collection
* **Collection Path:** `/purchases/{purchaseId}`
* **Purpose:** Supplier stock intake invoices recording incoming book inventory, costs, and payment method.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Purchase UUID |
| `purchaseInvoiceNo` | `string` | Supplier bill / invoice number |
| `supplierId` | `string` | Supplier reference ID |
| `supplierName` | `string` | Supplier company name |
| `items` | `array<map>` | List of purchased items `[ { productId, productName, quantity, unitCost, totalCost } ]` |
| `subtotal` | `number` | Gross items total |
| `discountAmount` | `number` | Trade discount received |
| `grandTotal` | `number` | Net invoice payable |
| `paidAmount` | `number` | Cash or transfer paid immediately |
| `remainingBalance` | `number` | Added to supplier account payable |
| `paymentMethod` | `string` | Enum: `'cash'` \| `'bank_transfer'` \| `'credit'` |
| `purchaseDate` | `string` (ISO 8601) | Invoice date |
| `receivedByUserId` | `string` | Operator who received stock |
| `notes` | `string?` | Shipment remarks |
| `createdAt` | `string` (ISO 8601) | Entry timestamp |

---

### 7. `sales` Collection
* **Collection Path:** `/sales/{saleId}`
* **Purpose:** Counter POS billing and wholesale sales records with itemized lines, discounts, and payment breakdown.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Sale UUID |
| `invoiceNo` | `string` | Formatted invoice ID (e.g. `INV-2026-0001`) |
| `customerType` | `string` | Enum: `'wholesaler'` \| `'parchon'` \| `'marketshop'` |
| `customerId` | `string?` | Customer ID (omitted for Parchon walk-ins) |
| `customerName` | `string` | Name of customer or shop |
| `items` | `array<map>` | Item lines `[ { productId, productName, sku, quantity, unitPrice, discountRate, lineTotal } ]` |
| `subtotal` | `number` | Total before invoice discounts |
| `totalDiscount` | `number` | Total discount subtracted |
| `grandTotal` | `number` | Final bill amount |
| `amountReceived` | `number` | Cash / tender received |
| `changeGiven` | `number` | Change returned to customer |
| `balanceAddedToCredit`| `number` | Remaining amount charged to Khata (Udhaar) |
| `paymentStatus` | `string` | Enum: `'paid'` \| `'partial'` \| `'unpaid'` |
| `paymentMethod` | `string` | Enum: `'cash'` \| `'bank_transfer'` \| `'credit'` |
| `operatorUserId` | `string` | Operator who generated invoice |
| `operatorName` | `string` | Operator name |
| `saleDate` | `string` (ISO 8601) | Transaction timestamp |
| `notes` | `string?` | Optional invoice remarks |
| `createdAt` | `string` (ISO 8601) | Record creation timestamp |

---

### 8. `payments` Collection
* **Collection Path:** `/payments/{paymentId}`
* **Purpose:** Cash and bank transactions for receiving customer Khata payments and clearing supplier liabilities.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Payment receipt UUID |
| `receiptNo` | `string` | Unique receipt identifier (e.g. `RCP-2026-0001`) |
| `targetType` | `string` | Enum: `'customer_credit'` \| `'supplier_payable'` \| `'direct_sale'` |
| `referenceId` | `string` | `customerId`, `supplierId`, or `saleId` |
| `partyName` | `string` | Customer or supplier name |
| `amount` | `number` | Amount paid in PKR |
| `paymentMode` | `string` | Enum: `'cash'` \| `'bank_transfer'` \| `'cheque'` |
| `transactionReference`| `string?` | Cheque number or bank transaction ID |
| `receivedByUserId` | `string` | Cashier UID |
| `paymentDate` | `string` (ISO 8601) | Date of transaction |
| `notes` | `string?` | Purpose / notes |
| `createdAt` | `string` (ISO 8601) | Timestamp |

---

### 9. `customerLedger` Collection
* **Collection Path:** `/customerLedger/{ledgerId}`
* **Purpose:** Immutable double-entry debit/credit record of every customer transaction for accurate Khata reconciliation.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Ledger entry UUID |
| `customerId` | `string` | Customer reference ID |
| `entryType` | `string` | Enum: `'debit'` (Bill added) \| `'credit'` (Cash payment) |
| `referenceInvoiceNo` | `string?` | Associated sales invoice number |
| `referenceReceiptNo` | `string?` | Associated payment receipt number |
| `description` | `string` | Detailed narrative (e.g., "Invoice INV-0042: 100 Registers") |
| `amount` | `number` | Transaction value in PKR |
| `runningBalance` | `number` | Cumulative customer balance immediately after transaction |
| `recordedByUserId` | `string` | Cashier / admin UID |
| `date` | `string` (ISO 8601) | Date of record |
| `createdAt` | `string` (ISO 8601) | Entry timestamp |

---

### 10. `expenses` Collection
* **Collection Path:** `/expenses/{expenseId}`
* **Purpose:** Daily operating expenditure (shop rent, staff tea, utility bills, salaries, transportation) for P&L calculations.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Expense UUID |
| `expenseCategory` | `string` | Enum: `'rent'` \| `'utilities'` \| `'salaries'` \| `'refreshment'` \| `'transport'` \| `'maintenance'` \| `'miscellaneous'` |
| `title` | `string` | Expense description (e.g. "Electricity Bill Oct 2026") |
| `amount` | `number` | Amount paid in PKR |
| `paymentMode` | `string` | Enum: `'cash'` \| `'bank_transfer'` |
| `paidTo` | `string?` | Vendor or payee name |
| `paidByUserId` | `string` | Staff member who incurred / recorded expense |
| `receiptImageUrl` | `string?` | Firebase Storage image URL of physical bill |
| `expenseDate` | `string` (ISO 8601) | Date expense was incurred |
| `notes` | `string?` | Additional details |
| `createdAt` | `string` (ISO 8601) | System timestamp |

---

### 11. `stockMovements` Collection
* **Collection Path:** `/stockMovements/{movementId}`
* **Purpose:** Complete inventory audit trail recording all physical inflows, outflows, damages, and returns.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Movement UUID |
| `productId` | `string` | Target item reference ID |
| `productName` | `string` | Denormalized title |
| `movementType` | `string` | Enum: `'in'` (Addition) \| `'out'` (Reduction) |
| `quantity` | `number` | Delta quantity moved |
| `previousStock` | `number` | Stock balance before operation |
| `newStock` | `number` | Stock balance after operation |
| `reason` | `string` | Enum: `'sale'` \| `'purchase'` \| `'customer_return'` \| `'supplier_return'` \| `'adjustment'` \| `'damage'` |
| `referenceDocId` | `string?` | Associated Sale ID, Purchase ID, or Return ID |
| `recordedByUserId` | `string` | User responsible |
| `createdAt` | `string` (ISO 8601) | Movement timestamp |

---

### 12. `settings` Collection
* **Collection Path:** `/settings/{settingId}` (Singletons: `store_profile`, `billing_config`, `system_rules`)
* **Purpose:** Business configuration, thermal print template settings, and store identity.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | `store_profile` \| `billing_config` |
| `storeName` | `string` | Legal and trade name of the bookstore |
| `tagline` | `string?` | Subtitle printed on thermal receipts |
| `contactNumber` | `string` | Phone numbers printed on bills |
| `address` | `string` | Physical store location |
| `invoiceHeaderNote` | `string?` | Header text on printed bills |
| `invoiceFooterNote` | `string?` | "No return without receipt after 3 days" |
| `currencySymbol` | `string` | `PKR` |
| `defaultMarketshopDiscount`| `number` | Default base discount % for new shopkeepers |
| `lowStockGlobalThreshold`| `number` | Universal low-stock notification trigger |
| `enableThermalPrinting` | `boolean` | Enable ESC/POS thermal printer dialogs |
| `thermalPrinterPaperWidth`| `string` | `'58mm'` \| `'80mm'` |
| `updatedAt` | `string` (ISO 8601) | Last modified timestamp |
| `updatedByUserId` | `string?` | Admin who saved configuration |

---

### 13. `auditLogs` Collection
* **Collection Path:** `/auditLogs/{logId}`
* **Purpose:** System-level security and administrative audit logging of logins, settings modifications, price changes, discount assignments, and manual balances.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Audit event UUID |
| `action` | `string` | Action code (e.g. `AUTH_LOGIN`, `PRICE_UPDATE`, `DISCOUNT_ASSIGN`, `DISCOUNT_REMOVE`) |
| `collectionTarget` | `string` | Affected collection (e.g. `products`, `customerDiscounts`, `settings`) |
| `targetId` | `string?` | Affected document ID |
| `details` | `string` | Human-readable explanation of the change |
| `performedByUserId` | `string` | Admin/Operator UID |
| `performedByEmail` | `string` | Email address of operator |
| `ipAddress` | `string?` | Client network origin |
| `timestamp` | `string` (ISO 8601) | Event timestamp |

---

### 14. `customerDiscounts` Collection (Customer-Wise Product Discount Management)
* **Collection Path:** `/customerDiscounts/{customerId}_{productId}`
* **Purpose:** Stores manual, persistent discount percentages assigned by the owner to specific customers for specific products.
* **Security:** Managed strictly by authenticated administrators (`isAdmin()`).
* **Cost-Optimization Architecture:**
  1. **Direct $O(1)$ Point-Lookup:** Document ID format `${customerId}_${productId}` allows direct fetching with `getDoc()` costing exactly **1 read** during product selection.
  2. **Discount Profile Bundling:** For regular marketshop customers, a companion profile document `/customerDiscounts/{customerId}` stores a map `{ discounts: { [productId]: discountPercentage } }`, allowing the POS checkout terminal to read **1 single document** and cache the customer's entire custom discount table for the entire checkout session (**0 reads per added line item**).
  3. **Historical Invariance:** The exact applied `discountRate` and calculated `discountAmount` are copied directly onto the immutable `sales.items[]` invoice record at checkout. Modifying or deleting discounts subsequently will never retroactively distort historical sales receipts or ledger balances.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Composite Key: `${customerId}_${productId}` |
| `customerId` | `string` | Target customer ID |
| `customerName` | `string` | Denormalized customer title / shop name |
| `productId` | `string` | Target product catalog ID |
| `productTitle` | `string` | Denormalized item title (e.g. "Oxford English 5") |
| `sku` | `string` | Product SKU code |
| `discountPercentage`| `number` | Assigned percentage discount (e.g., 15 for 15% off) |
| `assignedByUserId` | `string` | Admin UID who granted the discount |
| `assignedByEmail` | `string` | Admin email |
| `notes` | `string?` | Negotiation notes (e.g., "Annual contract rate for 500 units") |
| `createdAt` | `string` (ISO 8601) | Initial assignment date (persists indefinitely) |
| `updatedAt` | `string` (ISO 8601) | Last modification date |

---

## 3. Required Firestore Composite Indexes

For future phases, the following composite indexes will be deployed to support efficient compound queries:

1. **`sales` Collection:**
   - `customerId` ASC, `saleDate` DESC
   - `customerType` ASC, `saleDate` DESC
   - `paymentStatus` ASC, `saleDate` DESC

2. **`customerLedger` Collection:**
   - `customerId` ASC, `date` DESC

3. **`stockMovements` Collection:**
   - `productId` ASC, `createdAt` DESC

4. **`products` Collection:**
   - `classification` ASC, `title` ASC
   - `categoryId` ASC, `currentStock` ASC

---

## 4. Strict Phase 1 Compliance

> **Important Boundary Rule:** No mock or fake documents have been written to these collections in Phase 1. The Firestore database remains clean and unpolluted. Live data will only enter the database as specific business modules are developed in subsequent phases.

