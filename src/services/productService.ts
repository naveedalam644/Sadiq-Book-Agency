import {
  collection,
  doc,
  getDoc,
  getDocs,
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
import { db } from '../config/firebase';
import type {
  ProductDocument,
  ItemClassification,
  StockMovementDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';
import { updateInventorySummaryDeltas } from './summaryService';

export interface ProductFilters {
  classification?: ItemClassification | 'all';
  categoryId?: string | 'all';
  status?: 'all' | 'active' | 'inactive';
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
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

    // Cursor pagination
    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    // Limit to page size + 1 to check hasMore without count reads
    qConstraints.push(limit(pageSize + 1));

    const q = query(productsRef, ...qConstraints);
    const snapshot = await getDocs(q);

    let docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    let products: ProductDocument[] = docs.map((docSnap) => ({
      ...(docSnap.data() as ProductDocument),
      id: docSnap.id,
    }));

    // In-memory filters for stock status & client search query (debounced)
    if (filters.stockStatus && filters.stockStatus !== 'all') {
      products = products.filter((p) => {
        if (filters.stockStatus === 'out_of_stock') return (p.currentStock || 0) <= 0;
        if (filters.stockStatus === 'low_stock') return (p.currentStock || 0) > 0 && (p.currentStock || 0) <= (p.lowStockThreshold || 0);
        if (filters.stockStatus === 'in_stock') return (p.currentStock || 0) > (p.lowStockThreshold || 0);
        return true;
      });
    }

    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      products = products.filter((p) =>
        p.title.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        (p.authorOrPublisher && p.authorOrPublisher.toLowerCase().includes(term)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(term))
      );
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
  authorOrPublisher?: string;
  edition?: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice?: number;
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

  // Check unique SKU
  const isUnique = await checkSkuUnique(input.sku);
  if (!isUnique) {
    throw new Error(`SKU "${input.sku}" is already assigned to another product.`);
  }

  const batch = writeBatch(db);
  const prodRef = doc(collection(db, 'products'));
  const now = new Date().toISOString();

  const isLowStock = input.currentStock <= input.lowStockThreshold;

  const newProduct: ProductDocument = {
    id: prodRef.id,
    sku: input.sku.trim().toUpperCase(),
    barcode: input.barcode?.trim() || '',
    title: input.title.trim(),
    classification: input.classification,
    categoryId: input.categoryId,
    categoryName: input.categoryName || '',
    authorOrPublisher: input.authorOrPublisher?.trim() || '',
    edition: input.edition?.trim() || '',
    costPrice: Number(input.costPrice) || 0,
    retailPrice: Number(input.retailPrice) || 0,
    wholesalePrice: Number(input.wholesalePrice) || Number(input.retailPrice) || 0,
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
      recordedByUserId: userId,
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

  await logAuditEvent(
    'CREATE_PRODUCT',
    'products',
    `Created product: ${newProduct.title} (${newProduct.sku}) with stock ${newProduct.currentStock}`,
    newProduct.id,
    userId,
    userEmail
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
  const newCostPrice = updates.costPrice !== undefined ? Number(updates.costPrice) : existing.costPrice;
  const isLowStock = newCurrentStock <= newLowThreshold;

  const stockDiff = newCurrentStock - existing.currentStock;
  const oldValue = existing.currentStock * existing.costPrice;
  const newValue = newCurrentStock * newCostPrice;
  const valueDiff = newValue - oldValue;

  const batch = writeBatch(db);
  const prodRef = doc(db, 'products', id);

  const updatedDocData: Partial<ProductDocument> = {
    ...updates,
    ...(updates.sku && { sku: updates.sku.trim().toUpperCase() }),
    ...(updates.title && {
      title: updates.title.trim(),
      titleSearch: updates.title.trim().toLowerCase(),
    }),
    ...(updates.costPrice !== undefined && { costPrice: newCostPrice }),
    ...(updates.retailPrice !== undefined && { retailPrice: Number(updates.retailPrice) }),
    ...(updates.wholesalePrice !== undefined && { wholesalePrice: Number(updates.wholesalePrice) }),
    currentStock: newCurrentStock,
    lowStockThreshold: newLowThreshold,
    isLowStock,
    updatedAt: now,
  };

  batch.update(prodRef, updatedDocData);

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

  await logAuditEvent(
    'UPDATE_PRODUCT',
    'products',
    `Updated product: ${updates.title || existing.title} (Stock: ${newCurrentStock})`,
    id,
    userId,
    userEmail
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
