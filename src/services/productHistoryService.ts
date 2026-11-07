import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  ProductDocument,
  SaleDocument,
  PurchaseDocument,
  SaleReturnDocument,
  StockMovementDocument,
  StockMovementReason,
} from '../types/database';

export const PRODUCT_HISTORY_PAGE_SIZE = 25;

export interface ProductSaleRecord {
  saleId: string;
  invoiceNo: string;
  saleDate: string;
  createdAt: string;
  customerName: string;
  customerType: 'wholesaler' | 'marketshop' | 'parchon';
  customerId?: string;
  quantitySold: number;
  originalUnitPrice: number; // catalog rate before discount
  discountRate: number; // discount %
  discountAmount: number; // discount PKR per unit
  actualSellingPrice: number; // effective unit price
  lineTotal: number; // actual selling price * quantity
  paymentMethod: string;
  paymentStatus: string;
}

export interface ProductPurchaseRecord {
  purchaseId: string;
  purchaseInvoiceNo: string;
  purchaseDate: string;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  quantityPurchased: number;
  unitCost: number;
  totalCost: number;
  paidAmount: number;
  remainingBalance: number;
  paymentMethod: string;
}

export interface ProductSaleReturnRecord {
  returnId: string;
  returnNo: string;
  originalInvoiceNo: string;
  returnDate: string;
  createdAt: string;
  customerName: string;
  customerId?: string;
  quantityReturned: number;
  originalSellingPrice: number;
  refundAmount: number;
  refundMethod: 'cash' | 'credit_deduction';
  condition: 'saleable' | 'damaged';
  reason: string;
}

export interface ProductMovementRecord {
  id: string;
  productId: string;
  createdAt: string;
  movementType: 'in' | 'out';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: StockMovementReason;
  referenceDocId: string;
}

export interface ProductHistorySummary {
  currentStock: number;
  lowStockThreshold: number;
  totalQuantityPurchased: number;
  totalQuantitySold: number;
  totalQuantityReturned: number;
  totalPurchaseCost: number;
  totalGrossSales: number;
  totalSalesReturns: number;
  netSales: number;
  isLifetimeComplete: boolean;
  loadedSalesCount: number;
  loadedPurchasesCount: number;
  loadedReturnsCount: number;
}

export interface ProductHistoryFilters {
  startDate?: string;
  endDate?: string;
  customerId?: string;
  supplierId?: string;
  invoiceSearch?: string;
}

export interface PaginatedSalesResult {
  sales: ProductSaleRecord[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface PaginatedPurchasesResult {
  purchases: ProductPurchaseRecord[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface PaginatedReturnsResult {
  returns: ProductSaleReturnRecord[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface PaginatedMovementsResult {
  movements: ProductMovementRecord[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface ProductHistoryData {
  product: ProductDocument;
  sales: ProductSaleRecord[];
  purchases: ProductPurchaseRecord[];
  returns: ProductSaleReturnRecord[];
  movements: ProductMovementRecord[];
  salesCursor: QueryDocumentSnapshot<DocumentData> | null;
  purchasesCursor: QueryDocumentSnapshot<DocumentData> | null;
  returnsCursor: QueryDocumentSnapshot<DocumentData> | null;
  movementsCursor: QueryDocumentSnapshot<DocumentData> | null;
  salesHasMore: boolean;
  purchasesHasMore: boolean;
  returnsHasMore: boolean;
  movementsHasMore: boolean;
  summary: ProductHistorySummary;
  generatedAt: string;
}

// In-memory purchase document cache across lookups
const purchaseDocCache = new Map<string, PurchaseDocument | null>();

// In-memory cache for initial product history data (3-minute TTL)
const HISTORY_CACHE_TTL = 3 * 60 * 1000;
const historyCache = new Map<string, { data: ProductHistoryData; timestamp: number }>();

export const clearProductHistoryCache = (productId?: string) => {
  if (productId) {
    historyCache.delete(productId);
  } else {
    historyCache.clear();
  }
};

/**
 * Computes summary metrics over the loaded records with explicit completeness tracking.
 */
export const computeHistorySummary = (
  product: ProductDocument,
  sales: ProductSaleRecord[],
  purchases: ProductPurchaseRecord[],
  returns: ProductSaleReturnRecord[],
  salesHasMore = false,
  purchasesHasMore = false,
  returnsHasMore = false
): ProductHistorySummary => {
  const totalQuantityPurchased = purchases.reduce((s, p) => s + p.quantityPurchased, 0);
  const totalQuantitySold = sales.reduce((s, sl) => s + sl.quantitySold, 0);
  const totalQuantityReturned = returns.reduce((s, r) => s + r.quantityReturned, 0);
  const totalPurchaseCost = Math.round(purchases.reduce((s, p) => s + p.totalCost, 0) * 100) / 100;
  const totalGrossSales = Math.round(sales.reduce((s, sl) => s + sl.lineTotal, 0) * 100) / 100;
  const totalSalesReturns = Math.round(returns.reduce((s, r) => s + r.refundAmount, 0) * 100) / 100;
  const netSales = Math.round((totalGrossSales - totalSalesReturns) * 100) / 100;

  return {
    currentStock: Number(product.currentStock) || 0,
    lowStockThreshold: Number(product.lowStockThreshold) || 5,
    totalQuantityPurchased,
    totalQuantitySold,
    totalQuantityReturned,
    totalPurchaseCost,
    totalGrossSales,
    totalSalesReturns,
    netSales,
    isLifetimeComplete: !salesHasMore && !purchasesHasMore && !returnsHasMore,
    loadedSalesCount: sales.length,
    loadedPurchasesCount: purchases.length,
    loadedReturnsCount: returns.length,
  };
};

/**
 * Fetches a bounded, cursor-paginated page of sales records for a product.
 * Pushes customerId and date constraints to the query level with stable orderBy('createdAt', 'desc').
 */
export const fetchProductSalesPage = async (
  productId: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  filters: ProductHistoryFilters = {},
  pageSize = PRODUCT_HISTORY_PAGE_SIZE
): Promise<PaginatedSalesResult> => {
  if (!db || !productId) {
    return { sales: [], lastDoc: null, hasMore: false };
  }

  const constraints: any[] = [
    where('productIds', 'array-contains', productId),
  ];

  if (filters.customerId && filters.customerId !== 'all') {
    constraints.push(where('customerId', '==', filters.customerId));
  }

  if (filters.startDate) {
    const startIso = `${filters.startDate.split('T')[0]}T00:00:00.000Z`;
    constraints.push(where('createdAt', '>=', startIso));
  }
  if (filters.endDate) {
    const endIso = `${filters.endDate.split('T')[0]}T23:59:59.999Z`;
    constraints.push(where('createdAt', '<=', endIso));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  if (cursorDoc) {
    constraints.push(startAfter(cursorDoc));
  }

  constraints.push(limit(pageSize + 1));

  try {
    const q = query(collection(db, 'sales'), ...constraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
    const sales: ProductSaleRecord[] = [];

    for (const sDoc of docs) {
      const sale = sDoc.data() as SaleDocument;
      const matchingItems = sale.items?.filter((it) => it.productId === productId) || [];

      for (const it of matchingItems) {
        sales.push({
          saleId: sDoc.id,
          invoiceNo: sale.invoiceNo,
          saleDate: sale.saleDate || (sale.createdAt ? sale.createdAt.split('T')[0] : 'Unknown'),
          createdAt: sale.createdAt || new Date().toISOString(),
          customerName: sale.customerName || 'Walk-in Customer',
          customerType: sale.customerType || 'parchon',
          customerId: sale.customerId,
          quantitySold: Number(it.quantity) || 0,
          originalUnitPrice: Number(it.unitPrice) || 0,
          discountRate: Number(it.discountRate) || 0,
          discountAmount: Number(it.discountAmount) || 0,
          actualSellingPrice: Number(it.effectivePrice) || Number(it.unitPrice) || 0,
          lineTotal: Number(it.lineTotal) || (Number(it.effectivePrice || it.unitPrice || 0) * Number(it.quantity || 0)),
          paymentMethod: sale.paymentMethod || 'cash',
          paymentStatus: sale.paymentStatus || 'paid',
        });
      }
    }

    let filtered = sales;
    if (filters.invoiceSearch && filters.invoiceSearch.trim()) {
      const term = filters.invoiceSearch.trim().toLowerCase();
      filtered = filtered.filter((s) => s.invoiceNo.toLowerCase().includes(term));
    }

    return { sales: filtered, lastDoc, hasMore };
  } catch (err) {
    console.warn('Error fetching paginated product sales page:', err);
    return { sales: [], lastDoc: null, hasMore: false };
  }
};

/**
 * Fetches a bounded, cursor-paginated page of purchase records for a product.
 * Reads through indexed stockMovements (reason == 'purchase') and resolves parent purchase documents.
 */
export const fetchProductPurchasesPage = async (
  productId: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  filters: ProductHistoryFilters = {},
  pageSize = PRODUCT_HISTORY_PAGE_SIZE
): Promise<PaginatedPurchasesResult> => {
  if (!db || !productId) {
    return { purchases: [], lastDoc: null, hasMore: false };
  }

  const constraints: any[] = [
    where('productId', '==', productId),
    where('reason', '==', 'purchase'),
  ];

  if (filters.startDate) {
    const startIso = `${filters.startDate.split('T')[0]}T00:00:00.000Z`;
    constraints.push(where('createdAt', '>=', startIso));
  }
  if (filters.endDate) {
    const endIso = `${filters.endDate.split('T')[0]}T23:59:59.999Z`;
    constraints.push(where('createdAt', '<=', endIso));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  if (cursorDoc) {
    constraints.push(startAfter(cursorDoc));
  }

  constraints.push(limit(pageSize + 1));

  try {
    const q = query(collection(db, 'stockMovements'), ...constraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
    const purchases: ProductPurchaseRecord[] = [];

    for (const mDoc of docs) {
      const mov = mDoc.data() as StockMovementDocument;
      const purchaseId = mov.referenceDocId;
      if (!purchaseId) continue;

      let purchase = purchaseDocCache.get(purchaseId);
      if (purchase === undefined) {
        try {
          const pSnap = await getDoc(doc(db, 'purchases', purchaseId));
          purchase = pSnap.exists() ? ({ ...(pSnap.data() as PurchaseDocument), id: pSnap.id }) : null;
        } catch {
          purchase = null;
        }
        purchaseDocCache.set(purchaseId, purchase);
      }

      if (purchase) {
        if (filters.supplierId && filters.supplierId !== 'all' && purchase.supplierId !== filters.supplierId) {
          continue;
        }

        const pItem = purchase.items?.find((i) => i.productId === productId);
        const unitCost = pItem ? Number(pItem.unitCost || 0) : 0;
        const totalCost = pItem ? Number(pItem.totalCost || (unitCost * mov.quantity)) : 0;

        purchases.push({
          purchaseId: purchase.id,
          purchaseInvoiceNo: purchase.purchaseInvoiceNo || 'N/A',
          purchaseDate: purchase.purchaseDate || (purchase.createdAt ? purchase.createdAt.split('T')[0] : 'Unknown'),
          createdAt: purchase.createdAt || mov.createdAt,
          supplierId: purchase.supplierId || 'Unknown',
          supplierName: purchase.supplierName || 'Unknown Supplier',
          quantityPurchased: mov.quantity,
          unitCost,
          totalCost,
          paidAmount: purchase.paidAmount || 0,
          remainingBalance: purchase.remainingBalance || 0,
          paymentMethod: purchase.paymentMethod || 'credit',
        });
      }
    }

    let filtered = purchases;
    if (filters.invoiceSearch && filters.invoiceSearch.trim()) {
      const term = filters.invoiceSearch.trim().toLowerCase();
      filtered = filtered.filter((p) => p.purchaseInvoiceNo.toLowerCase().includes(term));
    }

    return { purchases: filtered, lastDoc, hasMore };
  } catch (err) {
    console.warn('Error fetching paginated product purchases page:', err);
    return { purchases: [], lastDoc: null, hasMore: false };
  }
};

/**
 * Fetches a bounded, cursor-paginated page of customer returns for a product.
 * Directly queries salesReturns using productIds array-contains, supporting both saleable and damaged returns.
 * Includes fallback logic for unindexed historical return documents.
 */
export const fetchProductReturnsPage = async (
  productId: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  filters: ProductHistoryFilters = {},
  associatedInvoiceNos: string[] = [],
  pageSize = PRODUCT_HISTORY_PAGE_SIZE
): Promise<PaginatedReturnsResult> => {
  if (!db || !productId) {
    return { returns: [], lastDoc: null, hasMore: false };
  }

  const returns: ProductSaleReturnRecord[] = [];
  const processedReturnNos = new Set<string>();

  const processReturnDoc = (ret: SaleReturnDocument) => {
    if (processedReturnNos.has(ret.returnNo)) return;
    processedReturnNos.add(ret.returnNo);

    if (filters.customerId && filters.customerId !== 'all' && ret.customerId !== filters.customerId) {
      return;
    }

    if (filters.startDate) {
      const start = filters.startDate.split('T')[0];
      if ((ret.returnDate || ret.createdAt.split('T')[0]) < start) return;
    }
    if (filters.endDate) {
      const end = filters.endDate.split('T')[0];
      if ((ret.returnDate || ret.createdAt.split('T')[0]) > end) return;
    }

    const matchingItems = ret.items?.filter((i) => i.productId === productId) || [];
    for (const it of matchingItems) {
      returns.push({
        returnId: ret.id,
        returnNo: ret.returnNo,
        originalInvoiceNo: ret.originalInvoiceNo,
        returnDate: ret.returnDate || (ret.createdAt ? ret.createdAt.split('T')[0] : 'Unknown'),
        createdAt: ret.createdAt || new Date().toISOString(),
        customerName: ret.customerName || 'Customer',
        customerId: ret.customerId,
        quantityReturned: Number(it.quantity) || 0,
        originalSellingPrice: Number(it.refundUnitPrice) || 0,
        refundAmount: Number(it.refundLineTotal) || 0,
        refundMethod: ret.refundMethod || 'cash',
        condition: it.condition || 'saleable',
        reason: ret.reason || 'Customer return',
      });
    }
  };

  // 1. Primary Query: Direct retrieval from salesReturns using productIds
  let hasMore = false;
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

  try {
    const constraints: any[] = [
      where('productIds', 'array-contains', productId),
    ];

    if (filters.customerId && filters.customerId !== 'all') {
      constraints.push(where('customerId', '==', filters.customerId));
    }

    if (filters.startDate) {
      const startIso = `${filters.startDate.split('T')[0]}T00:00:00.000Z`;
      constraints.push(where('createdAt', '>=', startIso));
    }
    if (filters.endDate) {
      const endIso = `${filters.endDate.split('T')[0]}T23:59:59.999Z`;
      constraints.push(where('createdAt', '<=', endIso));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    if (cursorDoc) {
      constraints.push(startAfter(cursorDoc));
    }

    constraints.push(limit(pageSize + 1));

    const q = query(collection(db, 'salesReturns'), ...constraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }
    lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    for (const rDoc of docs) {
      processReturnDoc({ ...(rDoc.data() as SaleReturnDocument), id: rDoc.id });
    }
  } catch (err) {
    console.warn('Direct salesReturns query notice (falling back if needed):', err);
  }

  // 2. Fallback Strategy for Historical Records (Only on first page to prevent duplicates)
  if (!cursorDoc) {
    // 2a. Check stockMovements for customer returns
    try {
      const returnMovQ = query(
        collection(db, 'stockMovements'),
        where('productId', '==', productId),
        where('reason', '==', 'customer_return'),
        limit(50)
      );
      const rMovSnap = await getDocs(returnMovQ);
      for (const mDoc of rMovSnap.docs) {
        const mov = mDoc.data() as StockMovementDocument;
        if (mov.referenceDocId && !processedReturnNos.has(mov.referenceDocId)) {
          try {
            const retSnap = await getDoc(doc(db, 'salesReturns', mov.referenceDocId));
            if (retSnap.exists()) {
              processReturnDoc({ ...(retSnap.data() as SaleReturnDocument), id: retSnap.id });
            }
          } catch {
            // Safe ignore
          }
        }
      }
    } catch {
      // Safe ignore
    }

    // 2b. Check sales returns matching associated invoice numbers for damaged returns without stock movements
    const invoiceBatches: string[][] = [];
    for (let i = 0; i < associatedInvoiceNos.length && i < 50; i += 10) {
      invoiceBatches.push(associatedInvoiceNos.slice(i, i + 10));
    }

    for (const batch of invoiceBatches) {
      if (batch.length === 0) continue;
      try {
        const invRetQ = query(
          collection(db, 'salesReturns'),
          where('originalInvoiceNo', 'in', batch),
          limit(50)
        );
        const invRetSnap = await getDocs(invRetQ);
        for (const irDoc of invRetSnap.docs) {
          processReturnDoc({ ...(irDoc.data() as SaleReturnDocument), id: irDoc.id });
        }
      } catch {
        // Safe ignore
      }
    }
  }

  returns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let filtered = returns;
  if (filters.invoiceSearch && filters.invoiceSearch.trim()) {
    const term = filters.invoiceSearch.trim().toLowerCase();
    filtered = filtered.filter(
      (r) => r.originalInvoiceNo.toLowerCase().includes(term) || r.returnNo.toLowerCase().includes(term)
    );
  }

  return { returns: filtered, lastDoc, hasMore };
};

/**
 * Fetches a bounded, cursor-paginated page of all stock movements for the product timeline.
 */
export const fetchProductMovementsPage = async (
  productId: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = PRODUCT_HISTORY_PAGE_SIZE
): Promise<PaginatedMovementsResult> => {
  if (!db || !productId) {
    return { movements: [], lastDoc: null, hasMore: false };
  }

  try {
    const constraints: any[] = [
      where('productId', '==', productId),
      orderBy('createdAt', 'desc'),
    ];

    if (cursorDoc) {
      constraints.push(startAfter(cursorDoc));
    }

    constraints.push(limit(pageSize + 1));

    const q = query(collection(db, 'stockMovements'), ...constraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }
    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    const movements: ProductMovementRecord[] = docs.map((d) => {
      const data = d.data() as StockMovementDocument;
      return {
        id: d.id,
        productId: data.productId,
        createdAt: data.createdAt,
        movementType: data.movementType,
        quantity: data.quantity,
        previousStock: data.previousStock,
        newStock: data.newStock,
        reason: data.reason,
        referenceDocId: data.referenceDocId || '',
      };
    });

    return { movements, lastDoc, hasMore };
  } catch (err) {
    console.warn('Error fetching paginated movements timeline:', err);
    return { movements: [], lastDoc: null, hasMore: false };
  }
};

/**
 * Loads the initial page of product history across all streams (Sales, Purchases, Returns, Movements).
 * Returns complete initial data and cursor snapshots for seamless continuation.
 */
export const getProductHistory = async (
  productId: string,
  filters: ProductHistoryFilters = {},
  forceRefresh = false
): Promise<ProductHistoryData> => {
  if (!db || !productId) {
    throw new Error('Database is not initialized or invalid Product ID.');
  }

  const cacheKey = `${productId}_${JSON.stringify(filters)}`;
  const now = Date.now();

  const hasFilters = Boolean(
    filters.startDate || filters.endDate || filters.customerId || filters.supplierId || filters.invoiceSearch
  );

  if (!forceRefresh && !hasFilters && historyCache.has(cacheKey)) {
    const cached = historyCache.get(cacheKey)!;
    if (now - cached.timestamp < HISTORY_CACHE_TTL) {
      return cached.data;
    }
  }

  // 1. Fetch Authoritative Product Document
  const productSnap = await getDoc(doc(db, 'products', productId));
  if (!productSnap.exists()) {
    throw new Error(`Product "${productId}" not found.`);
  }
  const product = { ...(productSnap.data() as ProductDocument), id: productSnap.id };

  // 2. Fetch Initial Bounded Pages for each stream concurrently
  const [salesResult, purchasesResult, movementsResult] = await Promise.all([
    fetchProductSalesPage(productId, null, filters, PRODUCT_HISTORY_PAGE_SIZE),
    fetchProductPurchasesPage(productId, null, filters, PRODUCT_HISTORY_PAGE_SIZE),
    fetchProductMovementsPage(productId, null, PRODUCT_HISTORY_PAGE_SIZE),
  ]);

  const associatedInvoiceNos = salesResult.sales.map((s) => s.invoiceNo);
  const returnsResult = await fetchProductReturnsPage(
    productId,
    null,
    filters,
    associatedInvoiceNos,
    PRODUCT_HISTORY_PAGE_SIZE
  );

  // 3. Compute Summary over initial loaded records with explicit completeness indicator
  const summary = computeHistorySummary(
    product,
    salesResult.sales,
    purchasesResult.purchases,
    returnsResult.returns,
    salesResult.hasMore,
    purchasesResult.hasMore,
    returnsResult.hasMore
  );

  const result: ProductHistoryData = {
    product,
    sales: salesResult.sales,
    purchases: purchasesResult.purchases,
    returns: returnsResult.returns,
    movements: movementsResult.movements,
    salesCursor: salesResult.lastDoc,
    purchasesCursor: purchasesResult.lastDoc,
    returnsCursor: returnsResult.lastDoc,
    movementsCursor: movementsResult.lastDoc,
    salesHasMore: salesResult.hasMore,
    purchasesHasMore: purchasesResult.hasMore,
    returnsHasMore: returnsResult.hasMore,
    movementsHasMore: movementsResult.hasMore,
    summary,
    generatedAt: new Date().toISOString(),
  };

  if (!hasFilters) {
    historyCache.set(cacheKey, { data: result, timestamp: now });
  }

  return result;
};
