import {
  collection,
  query,
  where,
  limit,
  orderBy,
  startAfter,
  getDocs,
  type Firestore,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ProductDocument } from '../types/database';
import {
  matchesPublisherHierarchy,
  matchesSeriesHierarchy,
  matchesClassHierarchy,
} from '../utils/purchaseFormHelpers';

export interface ProductSearchResult extends ProductDocument {
  publisherName: string; // Strictly resolved from ProductDocument.publisherName (or 'Unknown')
}

export interface ProductSearchResponse {
  products: ProductSearchResult[];
  hasMore: boolean;
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  queryTerm: string;
  searchType: 'sku' | 'name' | 'empty';
  totalFetched: number;
}

export interface SearchCacheEntry<T> {
  result: T;
  timestamp: number;
}

// Bounded in-memory query cache (TTL: 60 seconds)
const searchCache = new Map<string, SearchCacheEntry<any>>();
const CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

export const clearProductSearchCache = (): void => {
  searchCache.clear();
};

const setCache = <T>(key: string, result: T): void => {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { result, timestamp: Date.now() });
};

const getCache = <T>(key: string): T | null => {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.result as T;
};

/**
 * Normalizes user input for prefix search on the titleSearch field.
 * Trims leading/trailing whitespace and converts to lower case.
 */
export const normalizeSearchTerm = (term: string): string => {
  return (term || '').trim().toLowerCase();
};

/**
 * Normalizes SKU for exact equality search.
 * Trims leading/trailing whitespace and converts to upper case.
 */
export const normalizeSku = (sku: string): string => {
  return (sku || '').trim().toUpperCase();
};

/**
 * Authoritatively resolves publisher snapshot.
 * STRICT POLICY:
 * - Uses ONLY dedicated ProductDocument.publisherName.
 * - NEVER falls back to obsolete authorOrPublisher.
 * - Defaults safely to literal 'Unknown' if missing or blank.
 */
export const resolvePublisherSnapshot = (product: Partial<ProductDocument>): string => {
  if (typeof product.publisherName === 'string' && product.publisherName.trim().length > 0) {
    return product.publisherName.trim();
  }
  return 'Unknown';
};

/**
 * Search product by EXACT SKU.
 * Bounded query: Equality check with limit(1).
 * Expected Firestore reads: 0 (cached / empty) or 1.
 */
export const searchProductBySku = async (
  sku: string,
  customDb: Firestore | null = db
): Promise<ProductSearchResult | null> => {
  const cleanSku = normalizeSku(sku);
  if (!cleanSku || !customDb) return null;

  const cacheKey = `sku:${cleanSku}`;
  const cached = getCache<ProductSearchResult>(cacheKey);
  if (cached) return cached;

  const q = query(
    collection(customDb, 'products'),
    where('sku', '==', cleanSku),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  const docSnap = snapshot.docs[0];
  const data = docSnap.data() as ProductDocument;
  const result: ProductSearchResult = {
    ...data,
    id: docSnap.id,
    publisherName: resolvePublisherSnapshot(data),
  };

  setCache(cacheKey, result);
  return result;
};

/**
 * Search product by EXACT Barcode (EAN-13, ISBN, UPC, Code 128) or fallback to SKU.
 * Highly optimized for handheld hardware barcode guns and mobile camera scanners.
 */
export const searchProductByBarcodeOrSku = async (
  code: string,
  customDb: Firestore | null = db
): Promise<ProductSearchResult | null> => {
  const cleanCode = code.trim();
  if (!cleanCode || !customDb) return null;

  const cacheKey = `barcode_lookup:${cleanCode.toLowerCase()}`;
  const cached = getCache<ProductSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    // 1. Try exact barcode match (case-sensitive and standard)
    const barcodeQuery = query(
      collection(customDb, 'products'),
      where('barcode', '==', cleanCode),
      limit(1)
    );
    const barcodeSnap = await getDocs(barcodeQuery);
    if (!barcodeSnap.empty) {
      const docSnap = barcodeSnap.docs[0];
      const data = docSnap.data() as ProductDocument;
      const result: ProductSearchResult = {
        ...data,
        id: docSnap.id,
        publisherName: resolvePublisherSnapshot(data),
      };
      setCache(cacheKey, result);
      return result;
    }

    // 2. Try SKU lookup as fallback
    const skuResult = await searchProductBySku(cleanCode, customDb);
    if (skuResult) {
      setCache(cacheKey, skuResult);
      return skuResult;
    }

    return null;
  } catch (err) {
    console.warn('Barcode lookup error:', err);
    return null;
  }
};

/**
 * Search products by name using Firestore prefix range query on titleSearch.
 * Rules:
 * - Minimum 2 characters required (shorter inputs return empty results with 0 Firestore reads).
 * - Prefix range: >= normalizedTerm and <= normalizedTerm + '\uf8ff'.
 * - Ordered by titleSearch.
 * - Fetches maximum 16 documents: 15 displayed + 1 extra to determine hasMore.
 * - Cursor-based pagination using startAfter.
 * Expected Firestore reads: 0 (cached or <2 chars) or maximum 16 per page.
 */
export const searchProductsByName = async (
  searchTerm: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  customDb: Firestore | null = db
): Promise<ProductSearchResponse> => {
  const normalized = normalizeSearchTerm(searchTerm);

  // Minimum 2-character rule - returns immediately with ZERO Firestore reads
  if (normalized.length < 2 || !customDb) {
    return {
      products: [],
      hasMore: false,
      nextCursor: null,
      queryTerm: normalized,
      searchType: normalized.length === 0 ? 'empty' : 'name',
      totalFetched: 0,
    };
  }

  const cacheKey = `name:${normalized}:${cursorDoc ? cursorDoc.id : 'first'}`;
  const cached = getCache<ProductSearchResponse>(cacheKey);
  if (cached) return cached;

  // Prefix range constraints on indexed titleSearch
  const queryConstraints: any[] = [
    where('titleSearch', '>=', normalized),
    where('titleSearch', '<=', normalized + '\uf8ff'),
    orderBy('titleSearch', 'asc'),
  ];

  if (cursorDoc) {
    queryConstraints.push(startAfter(cursorDoc));
  }

  // Bound query: fetch at most 16 (15 for display + 1 for hasMore determination)
  queryConstraints.push(limit(16));

  const q = query(collection(customDb, 'products'), ...queryConstraints);
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;

  const hasMore = docs.length > 15;
  const displayDocs = hasMore ? docs.slice(0, 15) : docs;
  const nextCursor = hasMore ? docs[14] : null;

  const products: ProductSearchResult[] = displayDocs.map((docSnap) => {
    const data = docSnap.data() as ProductDocument;
    return {
      ...data,
      id: docSnap.id,
      publisherName: resolvePublisherSnapshot(data),
    };
  });

  const response: ProductSearchResponse = {
    products,
    hasMore,
    nextCursor,
    queryTerm: normalized,
    searchType: 'name',
    totalFetched: docs.length,
  };

  setCache(cacheKey, response);
  return response;
};

/**
 * Fetches products by publisher and/or series hierarchy (for POS catalog browsing).
 * Follows FIREBASE_COST_OPTIMIZATION.md with bounded limit(25) and cursor pagination.
 */
export const getProductsByHierarchy = async (
  publisherId?: string,
  seriesId?: string,
  targetClassOrCursor?: string | QueryDocumentSnapshot<DocumentData> | null,
  cursorDocArg: QueryDocumentSnapshot<DocumentData> | null = null,
  customDb: Firestore | null = db
): Promise<ProductSearchResponse> => {
  let targetClass: string | undefined;
  let cursorDoc: QueryDocumentSnapshot<DocumentData> | null = cursorDocArg;

  if (typeof targetClassOrCursor === 'string') {
    targetClass = targetClassOrCursor;
  } else if (targetClassOrCursor) {
    cursorDoc = targetClassOrCursor;
  }

  const hasPub = publisherId && publisherId !== 'all';
  const hasSer = seriesId && seriesId !== 'all';
  const hasClass = targetClass && targetClass !== 'all';

  if (!customDb || (!hasPub && !hasSer && !hasClass)) {
    return {
      products: [],
      hasMore: false,
      nextCursor: null,
      queryTerm: '',
      searchType: 'empty',
      totalFetched: 0,
    };
  }

  // Fetch active products with generous window to avoid dropping matches
  const queryConstraints: any[] = [
    where('isActive', '==', true),
  ];

  if (cursorDoc) {
    queryConstraints.push(startAfter(cursorDoc));
  }

  queryConstraints.push(limit(300));

  const q = query(collection(customDb, 'products'), ...queryConstraints);
  const snap = await getDocs(q);

  const docs = snap.docs;
  const hasMore = docs.length === 300;
  const nextCursor = hasMore ? docs[docs.length - 1] : null;

  let products: ProductSearchResult[] = docs.map((docSnap) => {
    const data = docSnap.data() as ProductDocument;
    return {
      ...data,
      id: docSnap.id,
      publisherName: resolvePublisherSnapshot(data),
    };
  });

  // Filter with intelligent hierarchy matchers
  if (hasPub) {
    products = products.filter((p) => matchesPublisherHierarchy(p, publisherId));
  }
  if (hasSer) {
    products = products.filter((p) => matchesSeriesHierarchy(p, seriesId));
  }
  if (hasClass) {
    products = products.filter((p) => matchesClassHierarchy(p, targetClass));
  }

  return {
    products,
    hasMore,
    nextCursor,
    queryTerm: `${publisherId || ''}:${seriesId || ''}`,
    searchType: 'name',
    totalFetched: docs.length,
  };
};

export interface NotebookFilterParams {
  classification?: 'all' | 'notebook' | 'register';
  sheetCount?: string;
  size?: string;
}

/**
 * Fetches products by notebook & register attributes (for POS catalog browsing).
 * Supports filtering by sheet counts (e.g. 40, 80, 100, 200), item classification, and size.
 */
export const getProductsByNotebookFilter = async (
  params: NotebookFilterParams,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  customDb: Firestore | null = db
): Promise<ProductSearchResponse> => {
  if (!customDb) {
    return {
      products: [],
      hasMore: false,
      nextCursor: null,
      queryTerm: '',
      searchType: 'empty',
      totalFetched: 0,
    };
  }

  const { classification = 'all', sheetCount = 'all', size = 'all' } = params;

  const queryConstraints: any[] = [];

  // When sheet count is specifically selected
  if (sheetCount && sheetCount !== 'all') {
    queryConstraints.push(where('notebookSheets', '==', sheetCount.trim()));
  } else if (classification === 'notebook') {
    queryConstraints.push(where('classification', '==', 'notebook'));
  } else if (classification === 'register') {
    queryConstraints.push(where('classification', '==', 'register'));
  } else {
    // Both notebook and register
    queryConstraints.push(where('classification', 'in', ['notebook', 'register']));
  }

  if (cursorDoc) {
    queryConstraints.push(startAfter(cursorDoc));
  }

  queryConstraints.push(limit(40));

  const q = query(collection(customDb, 'products'), ...queryConstraints);
  const snap = await getDocs(q);

  const docs = snap.docs;
  let products: ProductSearchResult[] = docs.map((docSnap) => {
    const data = docSnap.data() as ProductDocument;
    return {
      ...data,
      id: docSnap.id,
      publisherName: resolvePublisherSnapshot(data),
    };
  });

  // Client-side refinement for secondary attributes
  if (sheetCount && sheetCount !== 'all') {
    if (classification === 'notebook') {
      products = products.filter((p) => p.classification === 'notebook');
    } else if (classification === 'register') {
      products = products.filter((p) => p.classification === 'register');
    }
  }

  if (size && size !== 'all') {
    const sizeNorm = size.trim().toLowerCase();
    products = products.filter((p) => p.notebookSize?.trim().toLowerCase() === sizeNorm);
  }

  const hasMore = docs.length === 40;
  const nextCursor = hasMore ? docs[docs.length - 1] : null;

  return {
    products,
    hasMore,
    nextCursor,
    queryTerm: `notebook:${classification}:${sheetCount}:${size}`,
    searchType: 'name',
    totalFetched: products.length,
  };
};

/**
 * Standard 300ms Debounce Helper for search inputs.
 * Returns a debounced function equipped with a cancel() handle.
 */
export const debounceSearch = <T extends (...args: any[]) => any>(
  fn: T,
  delayMs = 300
): ((...args: Parameters<T>) => void) & { cancel: () => void } => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
};

/**
 * Search Coordinator managing concurrent searches and stale result protection.
 * Guarantees that older out-of-order search responses cannot overwrite newer search results.
 */
export class ProductSearchCoordinator {
  private activeSequenceId = 0;
  private lastCompletedQuery = '';

  /**
   * Executes a search with automatic sequence tracking.
   * If a subsequent search is launched while this search is in flight,
   * isStale will be returned as true so the caller can safely discard outdated results.
   */
  async execute(
    queryText: string,
    cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
    customDb: Firestore | null = db
  ): Promise<{ response: ProductSearchResponse; isStale: boolean; sequenceId: number }> {
    const sequenceId = ++this.activeSequenceId;
    const response = await searchProductsByName(queryText, cursorDoc, customDb);

    const isStale = sequenceId !== this.activeSequenceId;
    if (!isStale) {
      this.lastCompletedQuery = queryText;
    }

    return { response, isStale, sequenceId };
  }

  /**
   * Invalidates any ongoing in-flight queries.
   */
  abort(): void {
    this.activeSequenceId++;
  }

  getActiveSequenceId(): number {
    return this.activeSequenceId;
  }

  getLastCompletedQuery(): string {
    return this.lastCompletedQuery;
  }
}
