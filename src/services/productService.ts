import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type {
  ProductDocument,
  ItemClassification,
  StockMovementDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { updateInventorySummaryDeltas } from './summaryService';
import { getPublisherById } from './publisherService';
import { getSeriesById } from './seriesService';
import {
  matchesPublisherHierarchy,
  matchesSeriesHierarchy,
  matchesClassHierarchy,
  matchesSearchTokens,
  sortProductsByClassSequence,
} from '../utils/purchaseFormHelpers';

export interface ProductFilters {
  classification?: ItemClassification | 'all';
  categoryId?: string | 'all';
  status?: 'all' | 'active' | 'inactive';
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  publisherId?: string | 'all';
  seriesId?: string | 'all';
  targetClass?: string | 'all';
  searchTerm?: string;
}

export interface PaginatedProductsResult {
  products: ProductDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  totalFilteredCount?: number;
}

export const PAGE_SIZE = 25;

export const checkSkuUnique = async (sku: string, excludeProductId?: string): Promise<boolean> => {
  if (!db || !sku.trim()) return true;

  try {
    const q = query(
      collection(db, 'products'),
      where('sku', '==', sku.trim().toUpperCase()),
      limit(2)
    );
    const snap = await getDocs(q);

    if (snap.empty) return true;
    if (excludeProductId && snap.docs.length === 1 && snap.docs[0].id === excludeProductId) {
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error checking SKU uniqueness:', err);
    return true;
  }
};

export const generateSuggestedSku = (classification: ItemClassification, title: string): string => {
  const prefixMap: Record<ItemClassification, string> = {
    book: 'BK',
    notebook: 'NB',
    register: 'RG',
    stationery: 'ST',
    general: 'GN',
  };
  const prefix = prefixMap[classification] || 'PR';
  const cleanTitle = title
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .substring(0, 3) || 'ITM';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${cleanTitle}-${randomNum}`;
};

export const getProductsPaginated = async (
  filters: ProductFilters = {},
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = PAGE_SIZE
): Promise<PaginatedProductsResult> => {
  if (!db) {
    return { products: [], lastDoc: null, hasMore: false };
  }

  try {
    const productsRef = collection(db, 'products');
    let qConstraints: any[] = [];

    // Filter by active status
    if (filters.status === 'active') {
      qConstraints.push(where('isActive', '==', true));
    } else if (filters.status === 'inactive') {
      qConstraints.push(where('isActive', '==', false));
    }

    // Filter by classification
    if (filters.classification && filters.classification !== 'all') {
      qConstraints.push(where('classification', '==', filters.classification));
    }

    // Filter by category
    if (filters.categoryId && filters.categoryId !== 'all') {
      qConstraints.push(where('categoryId', '==', filters.categoryId));
    }

    // Check if specific hierarchy or search filters are applied
    const hasSpecificFilter = Boolean(
      (filters.publisherId && filters.publisherId !== 'all') ||
      (filters.seriesId && filters.seriesId !== 'all') ||
      (filters.targetClass && filters.targetClass !== 'all') ||
      (filters.searchTerm && filters.searchTerm.trim()) ||
      (filters.stockStatus && filters.stockStatus !== 'all')
    );

    // Cursor pagination (for standard unfiltered browse pages)
    if (!hasSpecificFilter && cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    // When specific filters are applied, expand the query fetch window (up to 500)
    // so in-memory filters don't drop matches due to premature pagination limits
    const queryLimit = hasSpecificFilter ? 500 : (pageSize + 1);
    qConstraints.push(limit(queryLimit));

    const q = query(productsRef, ...qConstraints);
    const snapshot = await getDocs(q);

    let docs = snapshot.docs;

    let products: ProductDocument[] = docs.map((docSnap) => ({
      ...(docSnap.data() as ProductDocument),
      id: docSnap.id,
    }));

    // In-memory filters for stock status
    if (filters.stockStatus && filters.stockStatus !== 'all') {
      products = products.filter((p) => {
        if (filters.stockStatus === 'out_of_stock') return (p.currentStock || 0) <= 0;
        if (filters.stockStatus === 'low_stock') return (p.currentStock || 0) > 0 && (p.currentStock || 0) <= (p.lowStockThreshold || 0);
        if (filters.stockStatus === 'in_stock') return (p.currentStock || 0) > (p.lowStockThreshold || 0);
        return true;
      });
    }

    // Filter by publisher using intelligent ID + Name + authorOrPublisher matching
    if (filters.publisherId && filters.publisherId !== 'all') {
      products = products.filter((p) => matchesPublisherHierarchy(p, filters.publisherId));
    }

    // Filter by series using intelligent ID + Name matching
    if (filters.seriesId && filters.seriesId !== 'all') {
      products = products.filter((p) => matchesSeriesHierarchy(p, filters.seriesId));
    }

    // Filter by Class using intelligent normalized class matching
    if (filters.targetClass && filters.targetClass !== 'all') {
      products = products.filter((p) => matchesClassHierarchy(p, filters.targetClass));
    }

    // Multi-token search term matching across all product fields
    if (filters.searchTerm && filters.searchTerm.trim()) {
      products = products.filter((p) => matchesSearchTokens(p, filters.searchTerm!));
    }

    // Sort products by academic class sequence (Playgroup -> Nursery -> Prep/KG -> Class 1 -> 10)
    products = sortProductsByClassSequence(products);

    const hasMore = hasSpecificFilter ? false : docs.length > pageSize;
    if (!hasSpecificFilter && hasMore) {
      products = products.slice(0, pageSize);
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      products,
      lastDoc,
      hasMore,
    };
  } catch (error) {
    console.error('Error fetching paginated products:', error);
    return { products: [], lastDoc: null, hasMore: false };
  }
};

export const getProductById = async (id: string): Promise<ProductDocument | null> => {
  if (!db || !id) return null;

  try {
    const docRef = doc(db, 'products', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { ...(snap.data() as ProductDocument), id: snap.id };
  } catch (error) {
    console.error(`Error fetching product ${id}:`, error);
    return null;
  }
};

export interface CreateProductInput {
  sku: string;
  barcode?: string;
  title: string;
  classification: ItemClassification;
  categoryId: string;
  categoryName?: string;
  publisherId?: string;
  publisherName?: string;
  seriesId?: string;
  seriesName?: string;
  authorOrPublisher?: string;
  edition?: string;
  targetClass?: string;
  className?: string;
  notebookSize?: string;
  notebookSheets?: string;
  notebookGrammage?: string;
  costPrice: number;
  retailPrice?: number;
  originalPrice?: number;
  mrp?: number;
  publisherDiscountPercent?: number;
  wholesalePrice?: number;
  marketShopPrice?: number;
  lastSoldPrice?: number;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  shelfLocation?: string;
  isActive?: boolean;
}

export const createProduct = async (
  input: CreateProductInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<ProductDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const effectiveUserId =
    (userId && userId !== 'system' && userId !== 'admin' && userId !== 'cashier')
      ? userId
      : (auth?.currentUser?.uid || userId || 'system');
  const effectiveUserEmail = auth?.currentUser?.email || userEmail;

  // Check unique SKU
  const isUnique = await checkSkuUnique(input.sku);
  if (!isUnique) {
    throw new Error(`SKU "${input.sku}" is already assigned to another product.`);
  }

  // Resolve and validate Publisher & Series hierarchy
  let resolvedPublisherId = input.publisherId?.trim() || undefined;
  let resolvedPublisherName = input.publisherName?.trim() || undefined;
  let resolvedSeriesId = input.seriesId?.trim() || undefined;
  let resolvedSeriesName = input.seriesName?.trim() || undefined;

  if (resolvedSeriesId) {
    if (!resolvedPublisherId) {
      throw new Error('A series cannot be assigned without selecting a publisher.');
    }
    const seriesDoc = await getSeriesById(resolvedSeriesId);
    if (!seriesDoc) {
      throw new Error(`Series with ID "${resolvedSeriesId}" was not found.`);
    }
    if (seriesDoc.publisherId !== resolvedPublisherId) {
      throw new Error(
        `The selected series "${seriesDoc.name}" does not belong to the selected publisher.`
      );
    }
    resolvedSeriesName = seriesDoc.name;
    if (!resolvedPublisherName) {
      resolvedPublisherName = seriesDoc.publisherName;
    }
  } else if (resolvedPublisherId && !resolvedPublisherName) {
    const pubDoc = await getPublisherById(resolvedPublisherId);
    if (pubDoc) {
      resolvedPublisherName = pubDoc.name;
    }
  }

  const batch = writeBatch(db);
  const prodRef = doc(collection(db, 'products'));
  const now = new Date().toISOString();

  const isLowStock = input.currentStock <= input.lowStockThreshold;

  const isBook = input.classification === 'book';
  const mrp = Number(input.retailPrice || input.originalPrice || input.mrp) || 0;
  const pubDiscount = isBook && typeof input.publisherDiscountPercent === 'number'
    ? Math.max(0, Math.min(100, input.publisherDiscountPercent))
    : 0;
  // For books: Actual Purchase Cost = MRP * (1 - Publisher Discount % / 100)
  // For non-books: Cost Price is the direct supplier purchase cost
  const calculatedCost = Math.round((mrp * (1 - pubDiscount / 100)) * 100) / 100;
  const actualCost = isBook
    ? (mrp > 0 ? calculatedCost : (Number(input.costPrice) || 0))
    : (Number(input.costPrice) || 0);

  const newProduct: ProductDocument = {
    id: prodRef.id,
    sku: input.sku.trim().toUpperCase(),
    barcode: input.barcode?.trim() || '',
    title: input.title.trim(),
    classification: input.classification,
    categoryId: input.categoryId,
    categoryName: input.categoryName || '',
    publisherId: resolvedPublisherId,
    publisherName: resolvedPublisherName,
    seriesId: resolvedSeriesId,
    seriesName: resolvedSeriesName,
    authorOrPublisher: input.authorOrPublisher?.trim() || resolvedPublisherName || '',
    edition: input.edition?.trim() || '',
    targetClass: input.targetClass?.trim() || input.className?.trim() || undefined,
    className: input.targetClass?.trim() || input.className?.trim() || undefined,
    notebookSize: input.notebookSize?.trim() || undefined,
    notebookSheets: input.notebookSheets?.trim() || undefined,
    notebookGrammage: input.notebookGrammage?.trim() || undefined,
    costPrice: actualCost,
    retailPrice: isBook ? mrp : (Number(input.retailPrice) || 0),
    originalPrice: isBook ? mrp : (Number(input.retailPrice) || 0),
    mrp: isBook ? mrp : (Number(input.retailPrice) || 0),
    publisherDiscountPercent: pubDiscount,
    wholesalePrice: Number(input.wholesalePrice) || mrp,
    marketShopPrice: input.marketShopPrice !== undefined ? Number(input.marketShopPrice) : (Number(input.wholesalePrice) || mrp),
    lastSoldPrice: input.lastSoldPrice !== undefined ? Number(input.lastSoldPrice) : undefined,
    currentStock: Number(input.currentStock) || 0,
    lowStockThreshold: Number(input.lowStockThreshold) || 5,
    unit: input.unit || 'piece',
    shelfLocation: input.shelfLocation?.trim() || '',
    isActive: input.isActive !== false,
    isLowStock,
    titleSearch: input.title.trim().toLowerCase(),
    createdAt: now,
    updatedAt: now,
  };

  batch.set(prodRef, newProduct);

  // If opening stock > 0, log initial stock movement
  if (newProduct.currentStock > 0) {
    const moveRef = doc(collection(db, 'stockMovements'));
    const movement: StockMovementDocument = {
      id: moveRef.id,
      productId: newProduct.id,
      productName: newProduct.title,
      movementType: 'in',
      quantity: newProduct.currentStock,
      previousStock: 0,
      newStock: newProduct.currentStock,
      reason: 'adjustment',
      referenceDocId: 'INITIAL_STOCK',
      recordedByUserId: effectiveUserId,
      createdAt: now,
    };
    batch.set(moveRef, movement);
  }

  await batch.commit();

  // Update summary deltas
  await updateInventorySummaryDeltas({
    productsDelta: newProduct.isActive ? 1 : 0,
    stockQtyDelta: newProduct.currentStock,
    stockValueDelta: newProduct.currentStock * newProduct.costPrice,
    lowStockDelta: isLowStock ? 1 : 0,
  });

  if (newProduct.publisherName) {
    registerLocalPublisher(newProduct.publisherName);
  }

  await logAuditEvent(
    'CREATE_PRODUCT',
    'products',
    `Created product: ${newProduct.title} (${newProduct.sku}) with stock ${newProduct.currentStock}`,
    newProduct.id,
    effectiveUserId,
    effectiveUserEmail
  );

  return newProduct;
};

export const updateProduct = async (
  id: string,
  updates: Partial<CreateProductInput>,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<ProductDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const effectiveUserId =
    (userId && userId !== 'system' && userId !== 'admin' && userId !== 'cashier')
      ? userId
      : (auth?.currentUser?.uid || userId || 'system');
  const effectiveUserEmail = auth?.currentUser?.email || userEmail;

  const existing = await getProductById(id);
  if (!existing) throw new Error('Product not found');

  if (updates.sku && updates.sku.trim().toUpperCase() !== existing.sku) {
    const isUnique = await checkSkuUnique(updates.sku, id);
    if (!isUnique) {
      throw new Error(`SKU "${updates.sku}" is already assigned to another product.`);
    }
  }

  const now = new Date().toISOString();
  const newCurrentStock = updates.currentStock !== undefined ? Number(updates.currentStock) : existing.currentStock;
  const newLowThreshold = updates.lowStockThreshold !== undefined ? Number(updates.lowStockThreshold) : existing.lowStockThreshold;

  const isBook = (updates.classification || existing.classification) === 'book';

  const mrp = updates.retailPrice !== undefined
    ? Number(updates.retailPrice)
    : (updates.originalPrice !== undefined ? Number(updates.originalPrice) : existing.retailPrice);

  const pubDiscount = isBook
    ? (updates.publisherDiscountPercent !== undefined
        ? Math.max(0, Math.min(100, Number(updates.publisherDiscountPercent)))
        : (existing.publisherDiscountPercent !== undefined
            ? existing.publisherDiscountPercent
            : (existing.retailPrice > 0 ? Math.max(0, Math.round(((existing.retailPrice - existing.costPrice) / existing.retailPrice) * 100)) : 0)))
    : 0;

  const calculatedCost = Math.round((mrp * (1 - pubDiscount / 100)) * 100) / 100;
  const newCostPrice = isBook
    ? (updates.costPrice !== undefined ? Number(updates.costPrice) : (mrp > 0 ? calculatedCost : existing.costPrice))
    : (updates.costPrice !== undefined ? Number(updates.costPrice) : existing.costPrice);
  const isLowStock = newCurrentStock <= newLowThreshold;

  const stockDiff = newCurrentStock - existing.currentStock;
  const oldValue = existing.currentStock * existing.costPrice;
  const newValue = newCurrentStock * newCostPrice;
  const valueDiff = newValue - oldValue;

  const batch = writeBatch(db);
  const prodRef = doc(db, 'products', id);

  // Handle Publisher & Series hierarchy
  let targetPublisherId = updates.publisherId !== undefined ? updates.publisherId : existing.publisherId;
  let targetSeriesId = updates.seriesId !== undefined ? updates.seriesId : existing.seriesId;
  let targetPublisherName = updates.publisherName !== undefined ? updates.publisherName : existing.publisherName;
  let targetSeriesName = updates.seriesName !== undefined ? updates.seriesName : existing.seriesName;

  // If publisher was changed without specifying a new series, clear existing series
  if (updates.publisherId !== undefined && updates.publisherId !== existing.publisherId && updates.seriesId === undefined) {
    targetSeriesId = undefined;
    targetSeriesName = undefined;
  }

  // If series was explicitly cleared
  if (updates.seriesId === '' || updates.seriesId === null) {
    targetSeriesId = undefined;
    targetSeriesName = undefined;
  }

  // If publisher was explicitly cleared
  if (updates.publisherId === '' || updates.publisherId === null) {
    targetPublisherId = undefined;
    targetPublisherName = undefined;
    targetSeriesId = undefined;
    targetSeriesName = undefined;
  }

  // Validate that series strictly belongs to target publisher if assigned
  if (targetSeriesId) {
    if (!targetPublisherId) {
      throw new Error('A series cannot be assigned without selecting a publisher.');
    }
    const seriesDoc = await getSeriesById(targetSeriesId);
    if (!seriesDoc) {
      throw new Error(`Series with ID "${targetSeriesId}" was not found.`);
    }
    if (seriesDoc.publisherId !== targetPublisherId) {
      throw new Error(
        `The selected series "${seriesDoc.name}" does not belong to the selected publisher.`
      );
    }
    targetSeriesName = seriesDoc.name;
    if (!targetPublisherName) {
      targetPublisherName = seriesDoc.publisherName;
    }
  } else if (targetPublisherId && updates.publisherId !== undefined) {
    const pubDoc = await getPublisherById(targetPublisherId);
    if (pubDoc) {
      targetPublisherName = pubDoc.name;
    }
  }

  const updatedDocData: Partial<ProductDocument> = {
    ...updates,
    ...(updates.sku && { sku: updates.sku.trim().toUpperCase() }),
    ...(updates.title && {
      title: updates.title.trim(),
      titleSearch: updates.title.trim().toLowerCase(),
    }),
    publisherId: targetPublisherId || undefined,
    publisherName: targetPublisherName || undefined,
    seriesId: targetSeriesId || undefined,
    seriesName: targetSeriesName || undefined,
    authorOrPublisher: updates.authorOrPublisher !== undefined ? (updates.authorOrPublisher.trim() || targetPublisherName || '') : (existing.authorOrPublisher || targetPublisherName || ''),
    ...(updates.targetClass !== undefined && {
      targetClass: updates.targetClass.trim() || undefined,
      className: updates.targetClass.trim() || undefined,
    }),
    ...(updates.className !== undefined && updates.targetClass === undefined && {
      targetClass: updates.className.trim() || undefined,
      className: updates.className.trim() || undefined,
    }),
    ...(updates.notebookSize !== undefined && { notebookSize: updates.notebookSize.trim() }),
    ...(updates.notebookSheets !== undefined && { notebookSheets: updates.notebookSheets.trim() }),
    ...(updates.notebookGrammage !== undefined && { notebookGrammage: updates.notebookGrammage.trim() }),
    costPrice: newCostPrice,
    retailPrice: mrp,
    originalPrice: mrp,
    mrp: mrp,
    publisherDiscountPercent: pubDiscount,
    wholesalePrice: updates.wholesalePrice !== undefined ? Number(updates.wholesalePrice) : (existing.wholesalePrice || mrp),
    marketShopPrice: updates.marketShopPrice !== undefined ? Number(updates.marketShopPrice) : (existing.marketShopPrice || existing.wholesalePrice || mrp),
    currentStock: newCurrentStock,
    lowStockThreshold: newLowThreshold,
    isLowStock,
    updatedAt: now,
  };

  batch.update(prodRef, updatedDocData);

  // Synchronize opening stock batch cost basis if cost or publisher discount was modified
  try {
    const openingBatchRef = doc(db, 'stockBatches', `BATCH_OPEN_${id}`);
    const openingBatchSnap = await getDoc(openingBatchRef);
    if (openingBatchSnap.exists()) {
      const obData = openingBatchSnap.data();
      const remainingQty = Number(obData.remainingQuantity) || 0;
      batch.update(openingBatchRef, {
        unitCost: newCostPrice,
        mrp: mrp,
        publisherDiscountPercent: pubDiscount,
        totalCost: Math.round(remainingQty * newCostPrice * 100) / 100,
        updatedAt: now,
      });
    }
  } catch (batchErr) {
    console.warn('Could not sync opening stock batch for product:', id, batchErr);
  }

  // If stock quantity was modified manually, log movement
  if (stockDiff !== 0) {
    if (newCurrentStock < 0) {
      throw new Error('Stock quantity cannot be reduced below zero.');
    }
    const moveRef = doc(collection(db, 'stockMovements'));
    const movement: StockMovementDocument = {
      id: moveRef.id,
      productId: id,
      productName: updates.title || existing.title,
      movementType: stockDiff > 0 ? 'in' : 'out',
      quantity: Math.abs(stockDiff),
      previousStock: existing.currentStock,
      newStock: newCurrentStock,
      reason: 'adjustment',
      referenceDocId: 'MANUAL_EDIT',
      recordedByUserId: userId,
      createdAt: now,
    };
    batch.set(moveRef, movement);
  }

  await batch.commit();

  // Summary delta updates
  const wasLowStock = existing.currentStock <= existing.lowStockThreshold;
  let lowStockDelta = 0;
  if (!wasLowStock && isLowStock) lowStockDelta = 1;
  if (wasLowStock && !isLowStock) lowStockDelta = -1;

  await updateInventorySummaryDeltas({
    stockQtyDelta: stockDiff,
    stockValueDelta: valueDiff,
    lowStockDelta,
  });

  if (updatedDocData.publisherName) {
    registerLocalPublisher(updatedDocData.publisherName);
  }

  await logAuditEvent(
    'UPDATE_PRODUCT',
    'products',
    `Updated product: ${updates.title || existing.title} (Stock: ${newCurrentStock})`,
    id,
    effectiveUserId,
    effectiveUserEmail
  );

  return { ...existing, ...updatedDocData } as ProductDocument;
};

export const toggleProductStatus = async (
  id: string,
  isActive: boolean,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) return;

  const prodRef = doc(db, 'products', id);
  await updateDoc(prodRef, {
    isActive,
    updatedAt: new Date().toISOString(),
  });

  await updateInventorySummaryDeltas({
    productsDelta: isActive ? 1 : -1,
  });

  await logAuditEvent(
    'TOGGLE_PRODUCT_STATUS',
    'products',
    `Product ${id} marked as ${isActive ? 'Active' : 'Inactive'}`,
    id,
    userId,
    userEmail
  );
};

export const deleteProduct = async (
  id: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) return;

  const existing = await getProductById(id);
  if (!existing) return;

  const prodRef = doc(db, 'products', id);
  await deleteDoc(prodRef);

  await updateInventorySummaryDeltas({
    productsDelta: existing.isActive ? -1 : 0,
    stockQtyDelta: -existing.currentStock,
    stockValueDelta: -(existing.currentStock * existing.costPrice),
    lowStockDelta: (existing.currentStock <= existing.lowStockThreshold) ? -1 : 0,
  });

  await logAuditEvent(
    'DELETE_PRODUCT',
    'products',
    `Deleted product: ${existing.title} (${existing.sku})`,
    id,
    userId,
    userEmail
  );
};

// ---------------------------------------------------------------------------------
// PUBLISHER REGISTRY & SEARCHABLE RETRIEVAL
// ---------------------------------------------------------------------------------
let cachedPublishers: string[] | null = null;
let lastPublishersFetchTime = 0;
const PUBLISHERS_CACHE_TTL = 30000; // 30 seconds

/**
 * Fetches distinct publisher names from the existing products collection.
 * Deduplicates case-insensitively, collapses extra whitespace, and preserves exact spelling.
 */
export const getExistingPublishers = async (forceRefresh = false): Promise<string[]> => {
  if (!forceRefresh && cachedPublishers && Date.now() - lastPublishersFetchTime < PUBLISHERS_CACHE_TTL) {
    return cachedPublishers;
  }

  if (!db) return cachedPublishers || [];

  try {
    const snap = await getDocs(collection(db, 'products'));
    const map = new Map<string, string>(); // lowercase-normalized -> exact original casing

    snap.docs.forEach((d) => {
      const data = d.data() as ProductDocument;
      const raw = data.publisherName;
      if (raw && typeof raw === 'string') {
        const cleaned = raw.replace(/\s+/g, ' ').trim();
        if (cleaned.length > 0) {
          const key = cleaned.toLowerCase();
          if (!map.has(key)) {
            map.set(key, cleaned);
          }
        }
      }
    });

    cachedPublishers = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    lastPublishersFetchTime = Date.now();
    return cachedPublishers;
  } catch (err) {
    console.error('Failed to get existing publishers:', err);
    return cachedPublishers || [];
  }
};

/**
 * Registers a newly created or validated publisher name into local in-memory pool.
 * Prevents case-insensitive duplicates and whitespace differences.
 */
export const registerLocalPublisher = (name: string): void => {
  if (!name || typeof name !== 'string') return;
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return;

  const key = cleaned.toLowerCase();
  if (!cachedPublishers) cachedPublishers = [];
  if (!cachedPublishers.some((p) => p.replace(/\s+/g, ' ').trim().toLowerCase() === key)) {
    cachedPublishers = [...cachedPublishers, cleaned].sort((a, b) => a.localeCompare(b));
  }
};

/**
 * Safe Migration Backfill Utility:
 * - Scans existing products with non-empty publisherName.
 * - Creates PublisherDocument records in 'publishers' collection if missing.
 * - Updates product.publisherId with matching publisher ID.
 * - Leaves product.seriesId as undefined (NEVER guesses or invents series).
 * - Preserves all pricing, stock batches, and historical sales records.
 */
export const backfillPublishersFromProducts = async (
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<{ publishersCreated: number; productsMapped: number }> => {
  if (!db) throw new Error('Firestore not initialized');

  const productsSnap = await getDocs(collection(db, 'products'));
  const publishersSnap = await getDocs(collection(db, 'publishers'));

  const existingPublishersMap = new Map<string, string>(); // normalizedName -> docId
  publishersSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.normalizedName) {
      existingPublishersMap.set(data.normalizedName, d.id);
    }
  });

  let publishersCreated = 0;
  let productsMapped = 0;
  const now = new Date().toISOString();

  for (const prodDoc of productsSnap.docs) {
    const prodData = prodDoc.data() as ProductDocument;
    const rawPubName = prodData.publisherName?.replace(/\s+/g, ' ').trim();
    if (!rawPubName) continue;

    const normalizedPub = rawPubName.toLowerCase();
    let pubId = existingPublishersMap.get(normalizedPub);

    if (!pubId) {
      const slug = normalizedPub.replace(/[^a-z0-9]/g, '_').slice(0, 40);
      pubId = `pub_${slug || 'general'}`;
      const pubRef = doc(db, 'publishers', pubId);
      await setDoc(pubRef, {
        id: pubId,
        name: rawPubName,
        normalizedName: normalizedPub,
        isActive: true,
        seriesCount: 0,
        productCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      existingPublishersMap.set(normalizedPub, pubId);
      publishersCreated++;
    }

    if (prodData.publisherId !== pubId) {
      await updateDoc(doc(db, 'products', prodDoc.id), {
        publisherId: pubId,
        publisherName: rawPubName,
        updatedAt: now,
      });
      productsMapped++;
    }
  }

  await logAuditEvent(
    'MIGRATE_PUBLISHERS',
    'products',
    `Backfill completed: ${publishersCreated} publishers created, ${productsMapped} products mapped.`,
    'SYSTEM_MIGRATION',
    userId,
    userEmail
  );

  return { publishersCreated, productsMapped };
};
