import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  ProductDocument,
  ItemClassification,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { updateInventorySummaryDeltas } from './summaryService';

export interface PriceListFilters {
  publisherId?: string;
  seriesId?: string;
  classification?: ItemClassification | 'all';
  categoryId?: string;
  searchTerm?: string;
  onlyActive?: boolean;
}

export interface UpdateProductPriceInput {
  retailPrice: number;
  publisherDiscountPercent?: number;
  wholesalePrice?: number;
  costPrice?: number;
}

export interface SeriesGroupedPriceList {
  seriesId: string;
  seriesName: string;
  products: ProductDocument[];
}

export interface PublisherGroupedPriceList {
  publisherId: string;
  publisherName: string;
  seriesGroups: SeriesGroupedPriceList[];
  directProducts: ProductDocument[];
  totalProducts: number;
}

/**
 * Fetches products for the Price List based on filters.
 * Cost-optimized: utilizes targeted Firestore constraints.
 */
export const getPriceListProducts = async (
  filters: PriceListFilters = {}
): Promise<ProductDocument[]> => {
  if (!db) return [];

  try {
    const productsRef = collection(db, 'products');
    const constraints: any[] = [];

    if (filters.onlyActive !== false) {
      constraints.push(where('isActive', '==', true));
    }

    if (filters.classification && filters.classification !== 'all') {
      constraints.push(where('classification', '==', filters.classification));
    }

    if (filters.categoryId && filters.categoryId !== 'all') {
      constraints.push(where('categoryId', '==', filters.categoryId));
    }

    const q = constraints.length > 0 ? query(productsRef, ...constraints) : query(productsRef);
    const snapshot = await getDocs(q);

    let products: ProductDocument[] = snapshot.docs.map((docSnap) => ({
      ...(docSnap.data() as ProductDocument),
      id: docSnap.id,
    }));

    // In-memory filter for publisher
    if (filters.publisherId && filters.publisherId !== 'all') {
      products = products.filter(
        (p) => p.publisherId === filters.publisherId || p.publisherName === filters.publisherId
      );
    }

    // In-memory filter for series
    if (filters.seriesId && filters.seriesId !== 'all') {
      products = products.filter((p) => p.seriesId === filters.seriesId);
    }

    // In-memory search filter
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      products = products.filter((p) => {
        const titleMatch = (p.title || '').toLowerCase().includes(term);
        const skuMatch = (p.sku || '').toLowerCase().includes(term);
        const seriesMatch = (p.seriesName || '').toLowerCase().includes(term);
        const pubMatch = (p.publisherName || '').toLowerCase().includes(term);
        const specMatch = `${p.notebookSize || ''} ${p.notebookSheets || ''} ${p.notebookGrammage || ''}`
          .toLowerCase()
          .includes(term);
        return titleMatch || skuMatch || seriesMatch || pubMatch || specMatch;
      });
    }

    // Sort alphabetically by title
    products.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return products;
  } catch (err) {
    console.error('Failed to fetch price list products:', err);
    throw err;
  }
};

/**
 * Groups products into Publisher > Series hierarchy structure.
 */
export const groupProductsByPublisherAndSeries = (
  products: ProductDocument[]
): PublisherGroupedPriceList[] => {
  const pubMap = new Map<string, {
    publisherName: string;
    seriesMap: Map<string, { seriesName: string; products: ProductDocument[] }>;
    directProducts: ProductDocument[];
  }>();

  for (const prod of products) {
    const pubId = prod.publisherId || 'general_publisher';
    const pubName = prod.publisherName || (prod.classification === 'notebook' || prod.classification === 'register' ? 'Notebooks & Registers' : 'General & Other Catalog');

    if (!pubMap.has(pubId)) {
      pubMap.set(pubId, {
        publisherName: pubName,
        seriesMap: new Map(),
        directProducts: [],
      });
    }

    const pubEntry = pubMap.get(pubId)!;

    if (prod.seriesId && prod.seriesName) {
      if (!pubEntry.seriesMap.has(prod.seriesId)) {
        pubEntry.seriesMap.set(prod.seriesId, {
          seriesName: prod.seriesName,
          products: [],
        });
      }
      pubEntry.seriesMap.get(prod.seriesId)!.products.push(prod);
    } else {
      pubEntry.directProducts.push(prod);
    }
  }

  const result: PublisherGroupedPriceList[] = [];

  for (const [pubId, pubData] of pubMap.entries()) {
    const seriesGroups: SeriesGroupedPriceList[] = [];
    let totalProducts = pubData.directProducts.length;

    for (const [seriesId, serData] of pubData.seriesMap.entries()) {
      totalProducts += serData.products.length;
      seriesGroups.push({
        seriesId,
        seriesName: serData.seriesName,
        products: serData.products,
      });
    }

    // Sort series groups alphabetically
    seriesGroups.sort((a, b) => a.seriesName.localeCompare(b.seriesName));

    result.push({
      publisherId: pubId,
      publisherName: pubData.publisherName,
      seriesGroups,
      directProducts: pubData.directProducts,
      totalProducts,
    });
  }

  // Sort publishers alphabetically
  result.sort((a, b) => a.publisherName.localeCompare(b.publisherName));

  return result;
};

/**
 * Authoritatively updates a product's price from the Price List.
 *
 * CRITICAL INVARIANTS:
 * 1. Physical shop inventory takes the new price for POS checkouts and future sales.
 * 2. Historical sales, past invoices, customer ledger debt balances, and previous khata entries
 *    are NEVER touched or recalculated. Past udhaar remains locked at original historical invoice rates.
 * 3. Store stock asset valuation delta is recorded in settings/inventory_summary.
 * 4. Audit trail is recorded.
 */
export const updateProductPrice = async (
  productId: string,
  input: UpdateProductPriceInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<ProductDocument> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!productId) throw new Error('Product ID is required');

  const prodRef = doc(db, 'products', productId);
  const snap = await getDoc(prodRef);
  if (!snap.exists()) {
    throw new Error(`Product with ID "${productId}" not found.`);
  }

  const existing = snap.data() as ProductDocument;
  const now = new Date().toISOString();
  const isBook = existing.classification === 'book';

  let mrp = Math.max(0, Number(input.retailPrice) || 0);
  let pubDiscount = 0;
  let costPrice = 0;
  let wholesalePrice = mrp;

  if (isBook) {
    pubDiscount = input.publisherDiscountPercent !== undefined
      ? Math.max(0, Math.min(100, Number(input.publisherDiscountPercent)))
      : (existing.publisherDiscountPercent !== undefined ? existing.publisherDiscountPercent : 0);

    // Cost calculation: MRP * (1 - pubDisc / 100)
    const calculatedCost = Math.round((mrp * (1 - pubDiscount / 100)) * 100) / 100;
    costPrice = input.costPrice !== undefined && input.costPrice >= 0
      ? Number(input.costPrice)
      : calculatedCost;

    wholesalePrice = input.wholesalePrice !== undefined && input.wholesalePrice >= 0
      ? Number(input.wholesalePrice)
      : mrp;
  } else {
    // Model 2: Notebook, Register, Other Stationery
    // Purchase cost is directly provided. MRP and Publisher Discount are not applicable.
    costPrice = input.costPrice !== undefined && input.costPrice >= 0
      ? Number(input.costPrice)
      : (Number(existing.costPrice) || 0);
    pubDiscount = 0;
    mrp = input.retailPrice !== undefined ? Number(input.retailPrice) : (Number(existing.retailPrice) || 0);
    wholesalePrice = input.wholesalePrice !== undefined ? Number(input.wholesalePrice) : (Number(existing.wholesalePrice) || mrp);
  }

  // Stock valuation difference on current stock on hand
  const currentStock = Number(existing.currentStock) || 0;
  const oldValuation = currentStock * (Number(existing.costPrice) || 0);
  const newValuation = currentStock * costPrice;
  const valuationDelta = Math.round((newValuation - oldValuation) * 100) / 100;

  const batch = writeBatch(db);

  const updatedDocData: Partial<ProductDocument> = {
    retailPrice: mrp,
    originalPrice: mrp,
    mrp: mrp,
    publisherDiscountPercent: pubDiscount,
    costPrice,
    wholesalePrice,
    updatedAt: now,
  };

  batch.update(prodRef, updatedDocData);

  // Synchronize opening stock batch cost basis
  try {
    const openingBatchRef = doc(db, 'stockBatches', `BATCH_OPEN_${productId}`);
    const openingBatchSnap = await getDoc(openingBatchRef);
    if (openingBatchSnap.exists()) {
      const obData = openingBatchSnap.data();
      const remainingQty = Number(obData.remainingQuantity) || 0;
      batch.update(openingBatchRef, {
        unitCost: costPrice,
        mrp: mrp,
        publisherDiscountPercent: pubDiscount,
        totalCost: Math.round(remainingQty * costPrice * 100) / 100,
        updatedAt: now,
      });
    }
  } catch (batchErr) {
    console.warn('Could not sync opening stock batch for product:', productId, batchErr);
  }

  await batch.commit();

  // Update store inventory summary asset valuation delta
  if (valuationDelta !== 0) {
    await updateInventorySummaryDeltas({
      stockValueDelta: valuationDelta,
    });
  }

  // Audit trail
  await logAuditEvent(
    'PRODUCT_PRICE_UPDATED',
    'products',
    JSON.stringify({
      productId,
      title: existing.title,
      sku: existing.sku,
      oldPrice: existing.retailPrice,
      newPrice: mrp,
      oldWholesale: existing.wholesalePrice,
      newWholesale: wholesalePrice,
      oldPubDiscount: existing.publisherDiscountPercent,
      newPubDiscount: pubDiscount,
      oldCostPrice: existing.costPrice,
      newCostPrice: costPrice,
      currentStock,
      valuationDelta,
    }),
    productId,
    userId,
    userEmail
  );

  return {
    ...existing,
    ...updatedDocData,
  } as ProductDocument;
};

/**
 * Batch updates publisher discount % for all products belonging to a series.
 * Automatically recalculates each product's costPrice based on its MRP.
 */
export const batchUpdateSeriesDiscount = async (
  seriesId: string,
  publisherDiscountPercent: number,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<{ updatedCount: number; totalValuationDelta: number }> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!seriesId) throw new Error('Series ID is required');

  const discount = Math.max(0, Math.min(100, Number(publisherDiscountPercent)));
  const productsQuery = query(
    collection(db, 'products'),
    where('seriesId', '==', seriesId)
  );

  const snap = await getDocs(productsQuery);
  if (snap.empty) {
    return { updatedCount: 0, totalValuationDelta: 0 };
  }

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  let totalValuationDelta = 0;
  let updatedCount = 0;

  for (const docSnap of snap.docs) {
    const prod = docSnap.data() as ProductDocument;
    const mrp = Number(prod.retailPrice) || 0;
    const newCostPrice = Math.round((mrp * (1 - discount / 100)) * 100) / 100;

    const currentStock = Number(prod.currentStock) || 0;
    const oldVal = currentStock * (Number(prod.costPrice) || 0);
    const newVal = currentStock * newCostPrice;
    totalValuationDelta += (newVal - oldVal);

    batch.update(docSnap.ref, {
      publisherDiscountPercent: discount,
      costPrice: newCostPrice,
      updatedAt: now,
    });

    const obRef = doc(db, 'stockBatches', `BATCH_OPEN_${prod.id}`);
    batch.set(
      obRef,
      {
        publisherDiscountPercent: discount,
        unitCost: newCostPrice,
        mrp: mrp,
        totalCost: Math.round(currentStock * newCostPrice * 100) / 100,
        updatedAt: now,
      },
      { merge: true }
    );
    updatedCount++;
  }

  totalValuationDelta = Math.round(totalValuationDelta * 100) / 100;

  await batch.commit();

  if (totalValuationDelta !== 0) {
    await updateInventorySummaryDeltas({
      stockValueDelta: totalValuationDelta,
    });
  }

  await logAuditEvent(
    'SERIES_PRICE_DISCOUNT_BATCH_UPDATED',
    'products',
    JSON.stringify({
      seriesId,
      newDiscountPercent: discount,
      updatedCount,
      totalValuationDelta,
    }),
    seriesId,
    userId,
    userEmail
  );

  return { updatedCount, totalValuationDelta };
};
