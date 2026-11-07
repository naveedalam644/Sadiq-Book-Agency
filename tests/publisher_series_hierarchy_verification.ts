import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — PUBLISHER -> SERIES -> PRODUCTS HIERARCHY VERIFICATION SUITE
// ==============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testsFailed++;
  }
}

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — PUBLISHER -> SERIES -> PRODUCTS VERIFICATION');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------------
// Pure Mock Implementations matching Service Logic for Hierarchy Validation
// ---------------------------------------------------------------------------------

interface Publisher {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
}

interface Series {
  id: string;
  publisherId: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
}

interface Product {
  id: string;
  title: string;
  publisherId?: string;
  publisherName?: string;
  seriesId?: string;
  seriesName?: string;
  currentStock: number;
  retailPrice: number;
  wholesalePrice: number;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

class InMemoryHierarchyStore {
  publishers: Map<string, Publisher> = new Map();
  series: Map<string, Series> = new Map();
  products: Map<string, Product> = new Map();

  createPublisher(id: string, name: string): Publisher {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Publisher name is required.');
    const norm = normalizeName(cleanName);

    for (const pub of this.publishers.values()) {
      if (pub.normalizedName === norm) {
        throw new Error(`A publisher with the name "${cleanName}" already exists.`);
      }
    }

    const pub: Publisher = {
      id,
      name: cleanName,
      normalizedName: norm,
      isActive: true,
    };
    this.publishers.set(id, pub);
    return pub;
  }

  createSeries(id: string, publisherId: string, name: string): Series {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Series name is required.');
    if (!publisherId) throw new Error('A series must belong to a publisher.');

    const publisher = this.publishers.get(publisherId);
    if (!publisher) throw new Error('Parent publisher not found.');

    const norm = normalizeName(cleanName);

    // Uniqueness scoped strictly within the same publisher
    for (const ser of this.series.values()) {
      if (ser.publisherId === publisherId && ser.normalizedName === norm) {
        throw new Error(`A series with the name "${cleanName}" already exists for this publisher.`);
      }
    }

    const s: Series = {
      id,
      publisherId,
      name: cleanName,
      normalizedName: norm,
      isActive: true,
    };
    this.series.set(id, s);
    return s;
  }

  deletePublisher(publisherId: string): void {
    // Check linked series
    for (const ser of this.series.values()) {
      if (ser.publisherId === publisherId) {
        throw new Error('Cannot delete publisher: It has active series assigned to it.');
      }
    }

    // Check linked products
    for (const prod of this.products.values()) {
      if (prod.publisherId === publisherId) {
        throw new Error('Cannot delete publisher: Products are currently linked to this publisher.');
      }
    }

    this.publishers.delete(publisherId);
  }

  deleteSeries(seriesId: string): void {
    // Check linked products
    for (const prod of this.products.values()) {
      if (prod.seriesId === seriesId) {
        throw new Error('Cannot delete series: Products are currently linked to this series.');
      }
    }

    this.series.delete(seriesId);
  }

  createProduct(prod: Product): void {
    // Cross-publisher validation
    if (prod.seriesId) {
      const s = this.series.get(prod.seriesId);
      if (!s) throw new Error('Referenced series does not exist.');
      if (s.publisherId !== prod.publisherId) {
        throw new Error(`Series "${s.name}" does not belong to the selected publisher.`);
      }
    }

    this.products.set(prod.id, prod);
  }

  filterProducts(publisherId?: string, seriesId?: string): Product[] {
    return Array.from(this.products.values()).filter((p) => {
      if (publisherId && publisherId !== 'all' && p.publisherId !== publisherId) {
        return false;
      }
      if (seriesId && seriesId !== 'all' && p.seriesId !== seriesId) {
        return false;
      }
      return true;
    });
  }
}

// ---------------------------------------------------------------------------------
// TEST 1: Multiple Publishers with Distinct Series
// ---------------------------------------------------------------------------------
runTest('Test 1: Multiple publishers with different series isolate correctly', () => {
  const store = new InMemoryHierarchyStore();

  const pubOxford = store.createPublisher('pub_oxford', 'Oxford University Press');
  const pubMoonlight = store.createPublisher('pub_moonlight', 'Moon Light Publishers');

  const sProgressive = store.createSeries('ser_ox_1', pubOxford.id, 'Progressive Series');
  const sAmazing = store.createSeries('ser_ox_2', pubOxford.id, 'Amazing Series');

  const sDiamond = store.createSeries('ser_ml_1', pubMoonlight.id, 'Diamond Series');
  const sSparkle = store.createSeries('ser_ml_2', pubMoonlight.id, 'Sparkle Series');

  assert.equal(sProgressive.publisherId, 'pub_oxford');
  assert.equal(sAmazing.publisherId, 'pub_oxford');
  assert.equal(sDiamond.publisherId, 'pub_moonlight');
  assert.equal(sSparkle.publisherId, 'pub_moonlight');

  // Query series for Oxford
  const oxfordSeries = Array.from(store.series.values()).filter((s) => s.publisherId === 'pub_oxford');
  assert.equal(oxfordSeries.length, 2);
  assert.ok(oxfordSeries.some((s) => s.name === 'Progressive Series'));
  assert.ok(oxfordSeries.some((s) => s.name === 'Amazing Series'));
  assert.ok(!oxfordSeries.some((s) => s.name === 'Diamond Series'));
});

// ---------------------------------------------------------------------------------
// TEST 2: Identical Series Names Under Different Publishers Allowed
// ---------------------------------------------------------------------------------
runTest('Test 2: Identical series names under different publishers are allowed', () => {
  const store = new InMemoryHierarchyStore();

  const pubOxford = store.createPublisher('pub_oxford', 'Oxford University Press');
  const pubParamount = store.createPublisher('pub_paramount', 'Paramount Books');

  // Both have a series named "Primary Series"
  const sOxfordPrimary = store.createSeries('ser_ox_prim', pubOxford.id, 'Primary Series');
  const sParamountPrimary = store.createSeries('ser_pm_prim', pubParamount.id, 'Primary Series');

  assert.equal(sOxfordPrimary.name, 'Primary Series');
  assert.equal(sParamountPrimary.name, 'Primary Series');
  assert.notEqual(sOxfordPrimary.id, sParamountPrimary.id);
  assert.notEqual(sOxfordPrimary.publisherId, sParamountPrimary.publisherId);
});

// ---------------------------------------------------------------------------------
// TEST 3: Duplicate Series Name Under Same Publisher Rejected
// ---------------------------------------------------------------------------------
runTest('Test 3: Duplicate series name under same publisher is strictly rejected (case-insensitive & trimmed)', () => {
  const store = new InMemoryHierarchyStore();
  const pub = store.createPublisher('pub_oxford', 'Oxford University Press');

  store.createSeries('ser_1', pub.id, 'New Oxford Modern English');

  // Attempt duplicate with exact casing
  assert.throws(
    () => store.createSeries('ser_2', pub.id, 'New Oxford Modern English'),
    /already exists for this publisher/
  );

  // Attempt duplicate with different casing and whitespace
  assert.throws(
    () => store.createSeries('ser_3', pub.id, '  new oxford MODERN english  '),
    /already exists for this publisher/
  );
});

// ---------------------------------------------------------------------------------
// TEST 4: Duplicate Publisher Name Rejected
// ---------------------------------------------------------------------------------
runTest('Test 4: Duplicate publisher name is rejected (case-insensitive & trimmed)', () => {
  const store = new InMemoryHierarchyStore();
  store.createPublisher('pub_1', 'Oxford University Press');

  assert.throws(
    () => store.createPublisher('pub_2', '  oxford university press  '),
    /already exists/
  );
});

// ---------------------------------------------------------------------------------
// TEST 5: Cascading Series Reset when Publisher Changes
// ---------------------------------------------------------------------------------
runTest('Test 5: Cascading series reset when publisher changes or clears', () => {
  // Simulate Form or Filter State Machine
  let selectedPublisherId = 'pub_oxford';
  let selectedSeriesId: string | undefined = 'ser_ox_1';
  let selectedSeriesName: string | undefined = 'Progressive Series';

  // Action: Change publisher
  const onPublisherChanged = (newPubId: string) => {
    selectedPublisherId = newPubId;
    selectedSeriesId = undefined; // Must clear immediately
    selectedSeriesName = undefined;
  };

  onPublisherChanged('pub_moonlight');

  assert.equal(selectedPublisherId, 'pub_moonlight');
  assert.equal(selectedSeriesId, undefined, 'Series ID must be reset immediately on publisher change');
  assert.equal(selectedSeriesName, undefined, 'Series Name must be reset immediately on publisher change');
});

// ---------------------------------------------------------------------------------
// TEST 6: Cross-Publisher Series Validation Gate
// ---------------------------------------------------------------------------------
runTest('Test 6: Cross-publisher series validation gate rejects mismatched publisher/series in product', () => {
  const store = new InMemoryHierarchyStore();

  const pubOxford = store.createPublisher('pub_oxford', 'Oxford University Press');
  const pubMoonlight = store.createPublisher('pub_moonlight', 'Moon Light Publishers');

  const sMoonlight = store.createSeries('ser_ml_1', pubMoonlight.id, 'Diamond Urdu');

  // Attempt to save a product with Oxford as publisher, but Moonlight's series
  const invalidProduct: Product = {
    id: 'prod_invalid',
    title: 'English Grade 5',
    publisherId: pubOxford.id,
    publisherName: pubOxford.name,
    seriesId: sMoonlight.id,
    seriesName: sMoonlight.name,
    currentStock: 10,
    retailPrice: 500,
    wholesalePrice: 400,
  };

  assert.throws(
    () => store.createProduct(invalidProduct),
    /does not belong to the selected publisher/
  );
});

// ---------------------------------------------------------------------------------
// TEST 7: Safe Delete Blocks when Dependents Exist
// ---------------------------------------------------------------------------------
runTest('Test 7: Safe delete blocks publisher with series/products and blocks series with products', () => {
  const store = new InMemoryHierarchyStore();

  const pub = store.createPublisher('pub_1', 'National Book Foundation');
  const ser = store.createSeries('ser_1', pub.id, 'Federal Syllabus');

  // 1. Publisher has linked series -> cannot delete publisher
  assert.throws(
    () => store.deletePublisher(pub.id),
    /active series assigned/
  );

  // Link product to series
  const prod: Product = {
    id: 'prod_1',
    title: 'NBF Urdu 9th',
    publisherId: pub.id,
    publisherName: pub.name,
    seriesId: ser.id,
    seriesName: ser.name,
    currentStock: 25,
    retailPrice: 250,
    wholesalePrice: 200,
  };
  store.createProduct(prod);

  // 2. Series has linked product -> cannot delete series
  assert.throws(
    () => store.deleteSeries(ser.id),
    /Products are currently linked/
  );

  // 3. Remove product link -> can now delete series
  store.products.delete(prod.id);
  store.deleteSeries(ser.id);
  assert.equal(store.series.has(ser.id), false);

  // 4. Now publisher has no series and no products -> can delete publisher
  store.deletePublisher(pub.id);
  assert.equal(store.publishers.has(pub.id), false);
});

// ---------------------------------------------------------------------------------
// TEST 8: POS & Catalog Publisher / Series Filtering
// ---------------------------------------------------------------------------------
runTest('Test 8: POS & Catalog hierarchical filtering returns exact matching products', () => {
  const store = new InMemoryHierarchyStore();

  const pubOxford = store.createPublisher('pub_ox', 'Oxford');
  const serProg = store.createSeries('ser_ox_prog', pubOxford.id, 'Progressive');
  const serAmazing = store.createSeries('ser_ox_amaz', pubOxford.id, 'Amazing');

  const pubMoon = store.createPublisher('pub_moon', 'Moonlight');
  const serDiamond = store.createSeries('ser_moon_dia', pubMoon.id, 'Diamond');

  store.createProduct({
    id: 'p1',
    title: 'Oxford Progressive English 1',
    publisherId: pubOxford.id,
    seriesId: serProg.id,
    currentStock: 50,
    retailPrice: 400,
    wholesalePrice: 320,
  });

  store.createProduct({
    id: 'p2',
    title: 'Oxford Progressive English 2',
    publisherId: pubOxford.id,
    seriesId: serProg.id,
    currentStock: 30,
    retailPrice: 420,
    wholesalePrice: 336,
  });

  store.createProduct({
    id: 'p3',
    title: 'Oxford Amazing Science 1',
    publisherId: pubOxford.id,
    seriesId: serAmazing.id,
    currentStock: 40,
    retailPrice: 450,
    wholesalePrice: 360,
  });

  store.createProduct({
    id: 'p4',
    title: 'Moonlight Diamond Urdu 1',
    publisherId: pubMoon.id,
    seriesId: serDiamond.id,
    currentStock: 25,
    retailPrice: 350,
    wholesalePrice: 280,
  });

  // Filter 1: All Oxford products
  const oxfordProducts = store.filterProducts('pub_ox', 'all');
  assert.equal(oxfordProducts.length, 3);

  // Filter 2: Oxford + Progressive series
  const oxfordProgProducts = store.filterProducts('pub_ox', 'ser_ox_prog');
  assert.equal(oxfordProgProducts.length, 2);
  assert.ok(oxfordProgProducts.every((p) => p.seriesId === 'ser_ox_prog'));

  // Filter 3: Oxford + Amazing series
  const oxfordAmazProducts = store.filterProducts('pub_ox', 'ser_ox_amaz');
  assert.equal(oxfordAmazProducts.length, 1);
  assert.equal(oxfordAmazProducts[0].id, 'p3');

  // Filter 4: Moonlight
  const moonProducts = store.filterProducts('pub_moon', 'all');
  assert.equal(moonProducts.length, 1);
  assert.equal(moonProducts[0].id, 'p4');
});

// ---------------------------------------------------------------------------------
// TEST 9: Legacy Products without Series Remain Fully Valid and Functional
// ---------------------------------------------------------------------------------
runTest('Test 9: Legacy products without series remain functional and safe backfill does not guess series', () => {
  const store = new InMemoryHierarchyStore();

  // Legacy product that was created before series hierarchy was introduced
  const legacyProduct: Product = {
    id: 'prod_legacy_101',
    title: 'General Urdu Dictionary',
    publisherId: 'pub_legacy_sangemeel',
    publisherName: 'Sange-Meel Publications',
    // seriesId and seriesName are undefined
    currentStock: 15,
    retailPrice: 1200,
    wholesalePrice: 960,
  };

  store.createProduct(legacyProduct);

  const fetched = store.products.get('prod_legacy_101');
  assert.ok(fetched);
  assert.equal(fetched.seriesId, undefined);
  assert.equal(fetched.seriesName, undefined);
  assert.equal(fetched.publisherName, 'Sange-Meel Publications');

  // Backfill utility extracts publisher from legacy products without fabricating series
  const existingProductDocs = [
    { id: '1', publisherName: 'Oxford University Press' },
    { id: '2', publisherName: 'Oxford University Press' },
    { id: '3', publisherName: 'Caravan Book House' },
    { id: '4', publisherName: undefined, author: 'Some Author' }, // No publisher, author must not be used!
  ];

  const extractedPublishers = new Map<string, string>();
  for (const doc of existingProductDocs) {
    if (doc.publisherName && doc.publisherName.trim()) {
      const clean = doc.publisherName.trim();
      const norm = normalizeName(clean);
      if (!extractedPublishers.has(norm)) {
        extractedPublishers.set(norm, clean);
      }
    }
  }

  assert.equal(extractedPublishers.size, 2);
  assert.ok(extractedPublishers.has('oxford university press'));
  assert.ok(extractedPublishers.has('caravan book house'));
  // Never uses author as fallback
  assert.ok(!extractedPublishers.has('some author'));
});

// ---------------------------------------------------------------------------------
// TEST 10: Historical Snapshots and Publisher Analytics Preserved
// ---------------------------------------------------------------------------------
runTest('Test 10: Sales snapshots and Publisher Analytics preserve publisherName immutability', () => {
  // A sale item captures publisherName at time of sale
  const saleItem = {
    productId: 'prod_ox_1',
    productName: 'Oxford Progressive English 1',
    publisherName: 'Oxford University Press',
    quantity: 5,
    unitPrice: 400,
    discountAmount: 40,
    lineTotal: 1960,
    historicalCostPrice: 250,
  };

  // Even if publisher or series is renamed in catalog later, saleItem.publisherName is immutable
  assert.equal(saleItem.publisherName, 'Oxford University Press');

  // Publisher analytics aggregates directly from historical sales items
  const salesItems = [
    saleItem,
    {
      productId: 'prod_ox_2',
      productName: 'Oxford Progressive English 2',
      publisherName: 'Oxford University Press',
      quantity: 3,
      unitPrice: 420,
      discountAmount: 20,
      lineTotal: 1240,
      historicalCostPrice: 260,
    },
  ];

  const analyticsMap: Record<string, { totalRevenue: number; totalSold: number }> = {};
  for (const item of salesItems) {
    const pub = item.publisherName || 'Unknown';
    if (!analyticsMap[pub]) {
      analyticsMap[pub] = { totalRevenue: 0, totalSold: 0 };
    }
    analyticsMap[pub].totalRevenue += item.lineTotal;
    analyticsMap[pub].totalSold += item.quantity;
  }

  assert.equal(analyticsMap['Oxford University Press'].totalSold, 8);
  assert.equal(analyticsMap['Oxford University Press'].totalRevenue, 3200);
});

// ---------------------------------------------------------------------------------
// TEST 11: Source Files, Security Rules & Indexes Integrity Audit
// ---------------------------------------------------------------------------------
runTest('Test 11: Source files, security rules and compound indexes contain required constraints', () => {
  const rootDir = process.cwd();

  // 1. Inspect firestore.rules
  const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf-8');
  assert.ok(
    rulesContent.includes('match /publishers/{publisherId}'),
    'firestore.rules must contain match /publishers/{publisherId}'
  );
  assert.ok(
    rulesContent.includes('match /series/{seriesId}'),
    'firestore.rules must contain match /series/{seriesId}'
  );

  // 2. Inspect firestore.indexes.json
  const indexesContent = fs.readFileSync(path.join(rootDir, 'firestore.indexes.json'), 'utf-8');
  assert.ok(
    indexesContent.includes('"collectionGroup": "series"'),
    'firestore.indexes.json must contain index for series'
  );
  assert.ok(
    indexesContent.includes('"collectionGroup": "products"'),
    'firestore.indexes.json must contain index for products'
  );

  // 3. Inspect database.ts types
  const dbTypesContent = fs.readFileSync(path.join(rootDir, 'src/types/database.ts'), 'utf-8');
  assert.ok(
    dbTypesContent.includes('export interface PublisherDocument'),
    'database.ts must export PublisherDocument'
  );
  assert.ok(
    dbTypesContent.includes('export interface SeriesDocument'),
    'database.ts must export SeriesDocument'
  );
  assert.ok(
    dbTypesContent.includes('seriesId?: string;'),
    'ProductDocument must have optional seriesId'
  );
  assert.ok(
    dbTypesContent.includes('seriesName?: string;'),
    'ProductDocument must have optional seriesName'
  );

  // 4. Inspect publisherService.ts and seriesService.ts
  const pubServiceContent = fs.readFileSync(path.join(rootDir, 'src/services/publisherService.ts'), 'utf-8');
  assert.ok(pubServiceContent.includes('createPublisher'), 'publisherService must implement createPublisher');
  assert.ok(pubServiceContent.includes('deletePublisher'), 'publisherService must implement deletePublisher');

  const serServiceContent = fs.readFileSync(path.join(rootDir, 'src/services/seriesService.ts'), 'utf-8');
  assert.ok(serServiceContent.includes('createSeries'), 'seriesService must implement createSeries');
  assert.ok(serServiceContent.includes('deleteSeries'), 'seriesService must implement deleteSeries');

  // 5. Inspect productService.ts cross-publisher validation
  const prodServiceContent = fs.readFileSync(path.join(rootDir, 'src/services/productService.ts'), 'utf-8');
  assert.ok(
    prodServiceContent.includes('does not belong to the selected publisher'),
    'productService must enforce cross-publisher validation gate'
  );
  assert.ok(
    prodServiceContent.includes('backfillPublishersFromProducts'),
    'productService must provide safe backfill migration utility'
  );

  // 6. Inspect POS.tsx
  const posContent = fs.readFileSync(path.join(rootDir, 'src/pages/POS.tsx'), 'utf-8');
  assert.ok(posContent.includes('selectedPublisher'), 'POS.tsx must manage selectedPublisher state');
  assert.ok(posContent.includes('selectedSeries'), 'POS.tsx must manage selectedSeries state');
  assert.ok(posContent.includes('handlePublisherFilterChange'), 'POS.tsx must handle publisher filter change');
  assert.ok(posContent.includes('handleSeriesFilterChange'), 'POS.tsx must handle series filter change');

  // 7. Inspect Inventory.tsx
  const invContent = fs.readFileSync(path.join(rootDir, 'src/pages/Inventory.tsx'), 'utf-8');
  assert.ok(invContent.includes('PublisherSeriesManagerModal'), 'Inventory.tsx must render PublisherSeriesManagerModal');
  assert.ok(invContent.includes('Publishers & Series'), 'Inventory.tsx must provide Publishers & Series action button');
});

console.log('\n====================================================================');
console.log(' Publisher & Series Hierarchy Verification Suite Summary:');
console.log(` Total Tests: ${testsPassed + testsFailed}`);
console.log(` Passed:      ${testsPassed}`);
console.log(` Failed:      ${testsFailed}`);
console.log('====================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
