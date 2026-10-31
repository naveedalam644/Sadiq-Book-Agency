# Firebase Cost & Query Optimization Architecture Guide
**Project:** Bookstore & Stationers Management System  
**Document Status:** Permanent Architectural Standard (Phases 1 through 7)  
**Objective:** Maintain maximum speed, data consistency, and auditability while minimizing Cloud Firestore reads, writes, deletes, and storage billing.

---

## 1. Core Optimization Principles

### 1.1. Cursor-Based Pagination (20–30 Records)
* **Never load full collections:** Operations like `getDocs(collection(db, 'products'))` or `getDocs(collection(db, 'sales'))` are strictly prohibited.
* **Implementation:** Always use `limit(25)` combined with `startAfter(lastVisibleDoc)` for forward/backward pagination.
* **Cost Impact:** Viewing page 1 costs **25 document reads**, rather than reading thousands of records in a growing store catalog.

### 1.2. On-Demand Fetching Over Real-Time Listeners
* Real-time listeners (`onSnapshot`) consume a read for every document in the result set on attach, plus an additional read every time any document in the set is modified by any operator.
* **Policy:**
  * **Default:** Standard one-time queries (`getDocs` / `getDoc`) with client-side or React state caching.
  * **Only Allowed for Live Counters:** If a POS counter station genuinely requires immediate notifications (e.g. urgent order dispatch), limit `onSnapshot` strictly to a small scope with `limit(5)`.

### 1.3. Pre-Aggregated Summary Documents (Preventing N-Read Calculations)
* **The Problem:** Calculating "Total Sales This Month", "Total Udhaar", or "Total Stock Value" by scanning entire collections costs $N$ reads (e.g. 5,000 reads for 5,000 invoices).
* **The Solution:** Dedicated aggregate singleton documents in `/settings/` or `/summaries/`:
  * `/settings/daily_summary_{YYYY-MM-DD}`: Stores `{ totalSales, totalCash, totalCredit, invoiceCount }`.
  * `/settings/inventory_summary`: Stores `{ totalSkus, lowStockCount, totalAssetValue }`.
  * `/customers/{customerId}`: Stores `{ currentBalance, lastSaleDate }` directly on the customer document.
* **Cost Impact:** Dashboard and reports read **1 single document** instead of querying thousands.

### 1.4. Batched Writes & Atomic Increment Transactions
* When an invoice is finalized:
  1. Write 1 document to `sales/{saleId}`
  2. Batch update product inventory using `increment(-quantity)` in `products/{productId}`
  3. Batch increment customer Udhaar using `increment(balanceAddedToCredit)` in `customers/{customerId}`
  4. Write 1 append-only ledger entry in `customerLedger/{ledgerId}`
  5. Atomically update daily summary in `settings/daily_summary_{YYYY-MM-DD}`
* **Write Count:** Exactly 4 to 5 atomic writes in a single batch network call (`writeBatch`), with zero duplicate writes and rollback on failure.

### 1.5. Debounced Search & Indexed Prefix Queries
* Keystroke search without debouncing triggers 1 query per keystroke (typing "Notebook" = 8 queries $\times$ results count).
* **Policy:**
  * All search inputs must be debounced by **350ms–500ms**.
  * Require a minimum of 2 or 3 characters before initiating queries.
  * Use indexed prefix matching: `where('titleSearch', '>=', term).where('titleSearch', '<=', term + '\uf8ff').limit(15)`.
  * Cache recent search query results in memory (5-minute TTL) so backspacing or repeated terms cost 0 reads.

### 1.6. In-Memory Client Caching with Invalidation
* Static or infrequently changed data (e.g. `categories`, store tax/invoice settings, supplier master list) is fetched once upon session start or first view, then cached in React context or localized cache.
* Cache is only invalidated when a mutation occurs (`createCategory`, `updateStoreSettings`), preventing repetitive re-fetching when navigating between tabs.

### 1.7. Image Compression Before Firebase Storage
* Receipts and expense vouchers must be compressed client-side (using HTML Canvas or Web Worker compression to WebP/JPEG, max 1200px width, quality 0.75, $< 200\text{KB}$) before upload.
* Prevents ballooning Cloud Storage bandwidth and storage costs.

---

## 2. Phase-by-Phase Read/Write Cost Estimation Matrix

| Phase | Feature / Operation | Traditional Unoptimized Cost | Cost-Optimized Strategy | Optimized Cost per Operation |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 2** | Catalog Listing (1,000 items) | 1,000 reads per view | Paginated query (`limit(25)`) | **25 reads** |
| **Phase 2** | Product Search by Title / Barcode | Scan all records (1,000 reads) | Debounced indexed query (`limit(10)`) | **$\le$ 10 reads** |
| **Phase 2** | Low-Stock Alerts | Scan all products (1,000 reads) | Compound index `where('isLowStock', '==', true).limit(20)` | **$\le$ 20 reads** |
| **Phase 3** | Customer Khata Listing | Scan all customers (500 reads) | Paginated query (`limit(25)`) | **25 reads** |
| **Phase 3** | Customer Ledger History | Fetch entire ledger (2,000 reads) | Paginated ledger by customer (`limit(25)`) | **25 reads** |
| **Phase 3** | Customer Balance Check | Sum all previous ledger entries | Read `currentBalance` cached on customer doc | **1 read** |
| **Phase 4** | POS Counter Checkout | Multiple unbundled operations | Single `writeBatch` (Sale + Inventory + Customer + Summary) | **0 reads, 4–5 writes** |
| **Phase 4** | Daily Sales Total / Closing | Query and sum all sales of the day (300 reads) | Read single daily summary doc `settings/daily_summary_{date}` | **1 read** |
| **Phase 5** | Supplier Stock Intake | Multiple uncoordinated writes | Batched write (Purchase + Stock increments + Supplier payable) | **3–4 writes** |
| **Phase 6** | Expense Voucher Logging | Full uncompressed file upload | Client-side compression ($<150\text{KB}$) + 1 doc write | **1 write, min storage** |
| **Phase 7** | Monthly Profit & Loss Report | Scan 10,000 sales + purchases + expenses | Read 30 pre-aggregated daily summary docs | **30 reads** |

---

## 3. High-Risk Expensive Operations Checklist (Pre-Implementation Gate)

Before writing code for any future business module, verify against these danger zones:

1. **🚨 Danger: Querying without a `limit()` clause**  
   *Rule:* Every list query must carry `.limit(25)`.
2. **🚨 Danger: Collection count queries (`getCountFromServer` without filter)**  
   *Rule:* Count queries cost 1 read per 1,000 documents; use dedicated aggregate counters on summary documents instead.
3. **🚨 Danger: Client-side filtering of full collections**  
   *Rule:* Never fetch 500 documents to filter 10 in JavaScript; construct compound indexes and let Firestore return only the matching 10.
4. **🚨 Danger: Double-click form submissions**  
   *Rule:* All mutation buttons must disable immediately on click (`disabled={isSubmitting}`) to prevent duplicate document creation.
5. **🚨 Danger: Background polling loops**  
   *Rule:* Never use `setInterval` to poll Firestore.

---

## 4. Verification & Audit Standard

For every future phase pull request / milestone:
1. Expected reads, writes, and storage operations will be formally stated before implementation.
2. Network tab query counts will be verified during phase testing.
3. Security rules will strictly forbid unindexed or unbounded queries.
