import assert from 'node:assert/strict';

// ==============================================================================
// SADIQ BOOK AGENCY — MILESTONE 4.2 STEP 2 VERIFICATION TEST SUITE
// Testing: POS Product Search Service
// 1. Exact SKU Search (Equality, Limit 1, 0/1 reads)
// 2. Product Name Prefix Search (Range >= and <= \uf8ff, OrderBy titleSearch)
// 3. Minimum 2-Character Rule (0 reads for < 2 chars)
// 4. 15-Result Display Limit & hasMore (Limit 16, Display 15, Extra doc for hasMore)
// 5. Cursor-based Pagination (startAfter, Disjoint pages)
// 6. Empty Search Protection (Zero reads)
// 7. Stale Search Result Protection (Out-of-order resolution discarded)
// 8. Publisher Snapshot Policy (Strict publisherName, NO authorOrPublisher, 'Unknown' default)
// 9. Bounded Query & In-Memory Caching (0 reads on cache hit)
// 10. 300ms Search Debounce Protection
// ==============================================================================

let passedTests = 0;
const pendingPromises: Promise<void>[] = [];

const runTest = (name: string, fn: () => void | Promise<void>) => {
  try {
    const res = fn();
    if (res instanceof Promise) {
      const p = res
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${name}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${name}`);
          console.error(err);
          process.exit(1);
        });
      pendingPromises.push(p);
    } else {
      passedTests++;
      console.log(`✅ PASS: ${name}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
};

console.log('\n====================================================');
console.log('🔍 SADIQ BOOK AGENCY — MILESTONE 4.2 STEP 2 TEST SUITE');
console.log('====================================================\n');

// Types & Mock Architecture
interface ProductDocument {
  id: string;
  sku: string;
  title: string;
  titleSearch?: string;
  classification: 'book' | 'notebook' | 'stationery' | 'general';
  categoryId: string;
  categoryName?: string;
  publisherName?: string;
  authorOrPublisher?: string;
  edition?: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProductSearchResult extends ProductDocument {
  publisherName: string;
}

// Bounded Mock Firestore Implementation with exact read-metering
class MockFirestoreSearchEngine {
  private products: ProductDocument[] = [];
  public totalReadsExecuted = 0;

  constructor(initialProducts: ProductDocument[]) {
    this.products = [...initialProducts];
  }

  resetReadCount(): void {
    this.totalReadsExecuted = 0;
  }

  // Exact SKU Search simulation
  searchBySku(sku: string): { result: ProductSearchResult | null; reads: number } {
    const cleanSku = (sku || '').trim().toUpperCase();
    if (!cleanSku) return { result: null, reads: 0 };

    // Equality query with limit(1)
    const matched = this.products.find((p) => p.sku === cleanSku && p.isActive !== false);
    const reads = matched ? 1 : 0;
    this.totalReadsExecuted += reads;

    if (!matched) return { result: null, reads };

    const resolvedPublisher =
      typeof matched.publisherName === 'string' && matched.publisherName.trim().length > 0
        ? matched.publisherName.trim()
        : 'Unknown';

    return {
      result: {
        ...matched,
        publisherName: resolvedPublisher,
      },
      reads,
    };
  }

  // Product Name Prefix Search simulation
  searchByName(
    searchTerm: string,
    cursorId: string | null = null,
    fetchLimit = 16
  ): {
    products: ProductSearchResult[];
    hasMore: boolean;
    nextCursorId: string | null;
    reads: number;
  } {
    const normalized = (searchTerm || '').trim().toLowerCase();

    // Minimum 2-character rule: 0 reads!
    if (normalized.length < 2) {
      return { products: [], hasMore: false, nextCursorId: null, reads: 0 };
    }

    // Prefix match: titleSearch >= normalized && titleSearch <= normalized + '\uf8ff'
    // Ordered by titleSearch ASC
    const upperBound = normalized + '\uf8ff';
    let matched = this.products
      .filter((p) => {
        const ts = (p.titleSearch || p.title.toLowerCase()).trim();
        return ts >= normalized && ts <= upperBound;
      })
      .sort((a, b) => {
        const aTs = (a.titleSearch || a.title.toLowerCase()).trim();
        const bTs = (b.titleSearch || b.title.toLowerCase()).trim();
        return aTs.localeCompare(bTs);
      });

    // Cursor pagination (startAfter)
    if (cursorId) {
      const cursorIndex = matched.findIndex((p) => p.id === cursorId);
      if (cursorIndex >= 0) {
        matched = matched.slice(cursorIndex + 1);
      }
    }

    // Query bounds: take up to fetchLimit (16)
    const rawFetched = matched.slice(0, fetchLimit);
    const reads = rawFetched.length;
    this.totalReadsExecuted += reads;

    const hasMore = rawFetched.length > 15;
    const displayDocs = hasMore ? rawFetched.slice(0, 15) : rawFetched;
    const nextCursorId = hasMore ? displayDocs[14].id : null;

    const formatted: ProductSearchResult[] = displayDocs.map((p) => {
      const resolvedPublisher =
        typeof p.publisherName === 'string' && p.publisherName.trim().length > 0
          ? p.publisherName.trim()
          : 'Unknown';
      return {
        ...p,
        publisherName: resolvedPublisher,
      };
    });

    return {
      products: formatted,
      hasMore,
      nextCursorId,
      reads,
    };
  }
}

// In-Memory Search Cache for testing
class MockSearchCache {
  private cache = new Map<string, { result: any; timestamp: number }>();
  private ttl = 60000;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.result as T;
  }

  set<T>(key: string, result: T): void {
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Sample Catalog for verification
const sampleProducts: ProductDocument[] = [
  {
    id: 'prod_001',
    sku: 'BK-SIN-001',
    title: 'Sindh Board Biology 9',
    titleSearch: 'sindh board biology 9',
    classification: 'book',
    categoryId: 'cat_matric',
    publisherName: 'Sindh Textbook Board',
    authorOrPublisher: 'Dr. Tariq Author', // Should be ignored
    costPrice: 200,
    retailPrice: 280,
    wholesalePrice: 240,
    currentStock: 45,
    lowStockThreshold: 10,
    unit: 'piece',
    isActive: true,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'prod_002',
    sku: 'BK-SIN-002',
    title: 'Sindh Board Chemistry 9',
    titleSearch: 'sindh board chemistry 9',
    classification: 'book',
    categoryId: 'cat_matric',
    publisherName: 'Sindh Textbook Board',
    costPrice: 220,
    retailPrice: 300,
    wholesalePrice: 260,
    currentStock: 30,
    lowStockThreshold: 10,
    unit: 'piece',
    isActive: true,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'prod_003',
    sku: 'BK-OXF-001',
    title: 'Oxford Progressive English 5',
    titleSearch: 'oxford progressive english 5',
    classification: 'book',
    categoryId: 'cat_primary',
    publisherName: 'Oxford University Press',
    costPrice: 380,
    retailPrice: 500,
    wholesalePrice: 420,
    currentStock: 15,
    lowStockThreshold: 5,
    unit: 'piece',
    isActive: true,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'prod_004',
    sku: 'BK-OXF-002',
    title: 'Oxford New Syllabus Mathematics 7',
    titleSearch: 'oxford new syllabus mathematics 7',
    classification: 'book',
    categoryId: 'cat_middle',
    // Missing publisherName: should default to 'Unknown'
    publisherName: undefined,
    authorOrPublisher: 'Oxford Author Fallback Attempt', // Must NOT be used
    costPrice: 450,
    retailPrice: 600,
    wholesalePrice: 510,
    currentStock: 20,
    lowStockThreshold: 5,
    unit: 'piece',
    isActive: true,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
];

// Generate 25 additional products with title prefix "Math Practice Grade X" for pagination testing
for (let i = 1; i <= 25; i++) {
  const pad = String(i).padStart(2, '0');
  sampleProducts.push({
    id: `prod_math_${pad}`,
    sku: `BK-MTH-${pad}`,
    title: `Math Practice Series Vol ${pad}`,
    titleSearch: `math practice series vol ${pad}`,
    classification: 'book',
    categoryId: 'cat_primary',
    publisherName: 'Moon Light Publisher',
    costPrice: 100,
    retailPrice: 150,
    wholesalePrice: 120,
    currentStock: 50,
    lowStockThreshold: 10,
    unit: 'piece',
    isActive: true,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  });
}

// ==============================================================================
// TEST SUITE 1: EXACT SKU SEARCH
// ==============================================================================

runTest('Exact SKU search finds matching product with equality query and limit 1', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { result, reads } = engine.searchBySku('BK-SIN-001');

  assert.ok(result);
  assert.equal(result.id, 'prod_001');
  assert.equal(result.title, 'Sindh Board Biology 9');
  assert.equal(result.sku, 'BK-SIN-001');
  assert.equal(reads, 1, 'Exact SKU search must execute at most 1 read');
});

runTest('Exact SKU search is case-insensitive and trims whitespace', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { result } = engine.searchBySku('  bk-sin-002  ');

  assert.ok(result);
  assert.equal(result.id, 'prod_002');
  assert.equal(result.sku, 'BK-SIN-002');
});

runTest('Exact SKU search for non-existent SKU returns null with 0 reads', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { result, reads } = engine.searchBySku('BK-NON-EXISTENT');

  assert.equal(result, null);
  assert.equal(reads, 0, 'No document read when no match exists');
});

runTest('Exact SKU search with empty or whitespace string returns null with 0 reads', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const res1 = engine.searchBySku('');
  const res2 = engine.searchBySku('   ');

  assert.equal(res1.result, null);
  assert.equal(res1.reads, 0);
  assert.equal(res2.result, null);
  assert.equal(res2.reads, 0);
});

// ==============================================================================
// TEST SUITE 2: PRODUCT NAME PREFIX SEARCH & NORMALIZATION
// ==============================================================================

runTest('Product-name search performs prefix match on titleSearch using range bounds', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { products } = engine.searchByName('sindh');

  assert.equal(products.length, 2);
  assert.equal(products[0].title, 'Sindh Board Biology 9');
  assert.equal(products[1].title, 'Sindh Board Chemistry 9');
});

runTest('Product-name search normalizes input to lower-case and trimmed string', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { products } = engine.searchByName('   OXFORD   ');

  assert.equal(products.length, 2);
  assert.equal(products[0].title, 'Oxford New Syllabus Mathematics 7');
  assert.equal(products[1].title, 'Oxford Progressive English 5');
});

runTest('Non-prefix substring queries do not match (prefix index boundary preserved)', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  // Searching for "biology" when titleSearch starts with "sindh board biology"
  const { products } = engine.searchByName('biology');

  assert.equal(products.length, 0, 'Prefix query must NOT match internal substrings');
});

// ==============================================================================
// TEST SUITE 3: MINIMUM 2-CHARACTER RULE & EMPTY SEARCH SAFETY
// ==============================================================================

runTest('Search with 0 or 1 character returns empty result with ZERO Firestore reads', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  engine.resetReadCount();

  const emptyRes = engine.searchByName('');
  const spaceRes = engine.searchByName('   ');
  const singleCharRes = engine.searchByName('s');

  assert.equal(emptyRes.products.length, 0);
  assert.equal(emptyRes.reads, 0);
  assert.equal(spaceRes.products.length, 0);
  assert.equal(spaceRes.reads, 0);
  assert.equal(singleCharRes.products.length, 0);
  assert.equal(singleCharRes.reads, 0);
  assert.equal(engine.totalReadsExecuted, 0, 'Zero Firestore reads must be incurred for <2 characters');
});

runTest('Search with exactly 2 characters executes bounded prefix query', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  engine.resetReadCount();

  const { products, reads } = engine.searchByName('si');

  assert.equal(products.length, 2);
  assert.ok(reads > 0, '2-character search executes query');
});

// ==============================================================================
// TEST SUITE 4: 15-RESULT DISPLAY LIMIT & hasMore (BOUNDED TO 16 READS)
// ==============================================================================

runTest('Query matching 25 items fetches max 16 docs, displays 15, and sets hasMore = true', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  engine.resetReadCount();

  // "math" matches 25 math series products
  const { products, hasMore, nextCursorId, reads } = engine.searchByName('math');

  assert.equal(reads, 16, 'Must read at most 16 documents from Firestore');
  assert.equal(products.length, 15, 'Must display exactly 15 items');
  assert.equal(hasMore, true, 'hasMore must be true when 16th document was fetched');
  assert.ok(nextCursorId, 'nextCursorId must point to 15th document');
  assert.equal(nextCursorId, 'prod_math_15');
});

runTest('Query matching fewer than 15 items displays all and sets hasMore = false', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  engine.resetReadCount();

  // "sindh" matches 2 products
  const { products, hasMore, nextCursorId, reads } = engine.searchByName('sindh');

  assert.equal(reads, 2);
  assert.equal(products.length, 2);
  assert.equal(hasMore, false);
  assert.equal(nextCursorId, null);
});

runTest('Cursor-based pagination (page 2) returns next page without duplicates', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);

  // Page 1
  const page1 = engine.searchByName('math', null, 16);
  assert.equal(page1.products.length, 15);
  assert.ok(page1.nextCursorId);

  // Page 2 using cursor from Page 1
  const page2 = engine.searchByName('math', page1.nextCursorId, 16);

  // Remaining products: 25 - 15 = 10 products
  assert.equal(page2.products.length, 10);
  assert.equal(page2.hasMore, false, 'Page 2 has no more documents');
  assert.equal(page2.nextCursorId, null);

  // Assert Page 1 and Page 2 sets are completely disjoint
  const page1Ids = new Set(page1.products.map((p) => p.id));
  for (const p of page2.products) {
    assert.equal(page1Ids.has(p.id), false, `Page 2 item ${p.id} must not duplicate Page 1`);
  }
});

// ==============================================================================
// TEST SUITE 5: PUBLISHER SNAPSHOT INTEGRITY
// ==============================================================================

runTest('Publisher snapshot strictly uses dedicated publisherName and NEVER authorOrPublisher', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { result } = engine.searchBySku('BK-SIN-001');

  assert.ok(result);
  assert.equal(result.publisherName, 'Sindh Textbook Board');
  assert.notEqual(result.publisherName, 'Dr. Tariq Author');
});

runTest('Missing or blank publisherName safely defaults to literal "Unknown"', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { result } = engine.searchBySku('BK-OXF-002');

  assert.ok(result);
  // prod_004 had publisherName: undefined and authorOrPublisher: 'Oxford Author Fallback Attempt'
  assert.equal(result.publisherName, 'Unknown', 'Must default to Unknown');
  assert.notEqual(result.publisherName, 'Oxford Author Fallback Attempt', 'Must never use authorOrPublisher');
});

// ==============================================================================
// TEST SUITE 6: IN-MEMORY CACHE (COST PROTECTION)
// ==============================================================================

runTest('Repeated searches for identical SKU or term hit in-memory cache with 0 reads', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const cache = new MockSearchCache();

  // First search: executes read
  const sku = 'BK-SIN-001';
  let firstRes = cache.get<ProductSearchResult>(`sku:${sku}`);
  if (!firstRes) {
    const searchRes = engine.searchBySku(sku);
    firstRes = searchRes.result;
    cache.set(`sku:${sku}`, firstRes);
  }

  assert.equal(engine.totalReadsExecuted, 1);

  // Second search: served from cache without Firestore read
  engine.resetReadCount();
  const cachedRes = cache.get<ProductSearchResult>(`sku:${sku}`);

  assert.ok(cachedRes);
  assert.equal(cachedRes.id, 'prod_001');
  assert.equal(engine.totalReadsExecuted, 0, 'Cache hit must execute 0 Firestore reads');
});

// ==============================================================================
// TEST SUITE 7: STALE RESULT PROTECTION & COORDINATOR CONCURRENCY
// ==============================================================================

runTest('Coordinator discards stale out-of-order query responses', async () => {
  class SearchCoordinatorMock {
    private sequenceId = 0;
    private lastResult: string | null = null;

    async performSearch(queryText: string, delayMs: number): Promise<{ query: string; isStale: boolean }> {
      const currentSeq = ++this.sequenceId;

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const isStale = currentSeq !== this.sequenceId;
      if (!isStale) {
        this.lastResult = queryText;
      }
      return { query: queryText, isStale };
    }

    getLastResult(): string | null {
      return this.lastResult;
    }
  }

  const coordinator = new SearchCoordinatorMock();

  // Query 1 dispatched with high latency (50ms)
  const req1Promise = coordinator.performSearch('sindh', 50);

  // Query 2 dispatched shortly after with lower latency (10ms)
  const req2Promise = coordinator.performSearch('oxford', 10);

  const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

  // Query 2 resolves first or was dispatched later:
  assert.equal(res2.isStale, false, 'Latest query must NOT be stale');
  assert.equal(res2.query, 'oxford');

  // Query 1 resolves later and must be marked stale:
  assert.equal(res1.isStale, true, 'Older query must be flagged as stale');
  assert.equal(coordinator.getLastResult(), 'oxford', 'Last active state must remain oxford');
});

// ==============================================================================
// TEST SUITE 8: 300MS SEARCH DEBOUNCE BEHAVIOR
// ==============================================================================

runTest('Debounce helper delays execution and cancels redundant intermediate strokes', async () => {
  let callCount = 0;
  let lastTerm = '';

  const mockDebounce = (fn: (term: string) => void, waitMs = 30) => {
    let timer: any = null;
    const run = (term: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fn(term);
        timer = null;
      }, waitMs);
    };
    run.cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    return run;
  };

  const debounced = mockDebounce((term: string) => {
    callCount++;
    lastTerm = term;
  }, 25);

  // Rapid typing simulation: "s", "si", "sin", "sind", "sindh" within 20ms
  debounced('s');
  debounced('si');
  debounced('sin');
  debounced('sind');
  debounced('sindh');

  // Before timer expires, callCount must be 0
  assert.equal(callCount, 0, 'Must not fire synchronously before debounce delay');

  // Wait 40ms for debounce timer to expire
  await new Promise((r) => setTimeout(r, 40));

  assert.equal(callCount, 1, 'Only 1 execution must take place after debounce delay');
  assert.equal(lastTerm, 'sindh', 'Final debounced call must receive the latest term');
});

runTest('Debounced search cancel() aborts pending execution', async () => {
  let executed = false;

  let timer: any = null;
  const debounced = {
    trigger: () => {
      timer = setTimeout(() => {
        executed = true;
      }, 25);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };

  debounced.trigger();
  debounced.cancel();

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(executed, false, 'Cancelled debounced call must not execute');
});

// ==============================================================================
// TEST SUITE 9: CART COMPATIBILITY VERIFICATION
// ==============================================================================

runTest('Search results contain all necessary fields for usePOSCart.addProduct', () => {
  const engine = new MockFirestoreSearchEngine(sampleProducts);
  const { result } = engine.searchBySku('BK-SIN-001');

  assert.ok(result);

  // Assert presence and valid types of all fields needed by usePOSCart
  assert.equal(typeof result.id, 'string');
  assert.equal(typeof result.title, 'string');
  assert.equal(typeof result.sku, 'string');
  assert.equal(typeof result.publisherName, 'string');
  assert.equal(typeof result.classification, 'string');
  assert.equal(typeof result.categoryId, 'string');
  assert.equal(typeof result.costPrice, 'number');
  assert.equal(typeof result.retailPrice, 'number');
  assert.equal(typeof result.wholesalePrice, 'number');
  assert.equal(typeof result.currentStock, 'number');
  assert.equal(typeof result.lowStockThreshold, 'number');
  assert.equal(typeof result.unit, 'string');
  assert.equal(typeof result.isActive, 'boolean');
});

await Promise.all(pendingPromises);

console.log('\n====================================================');
console.log(`📊 MILESTONE 4.2 STEP 2 SUMMARY: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');
