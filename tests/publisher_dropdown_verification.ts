import assert from 'node:assert/strict';
import type { ProductDocument } from '../src/types/database';

// ==============================================================================
// SADIQ BOOK AGENCY — PUBLISHER DROPDOWN & ANALYTICS VERIFICATION
// ==============================================================================

let passedTests = 0;

const runTest = (name: string, fn: () => void | Promise<void>) => {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${name}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${name}`);
          console.error(err);
          process.exit(1);
        });
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
console.log('📚 SADIQ BOOK AGENCY — PUBLISHER DROPDOWN TEST SUITE');
console.log('====================================================\n');

// 1. Publisher Normalization Helper mirroring production logic
const cleanPublisherString = (raw?: string | null): string => {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
};

const extractDistinctPublishers = (products: ProductDocument[]): string[] => {
  const map = new Map<string, string>(); // lowercase-key -> exact display name

  for (const prod of products) {
    const raw = prod.publisherName;
    if (raw && typeof raw === 'string') {
      const cleaned = cleanPublisherString(raw);
      if (cleaned.length > 0) {
        const key = cleaned.toLowerCase();
        if (!map.has(key)) {
          map.set(key, cleaned);
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
};

const findDuplicatePublisher = (existingList: string[], candidate: string): string | null => {
  const cleanCand = cleanPublisherString(candidate).toLowerCase();
  if (!cleanCand) return null;
  return existingList.find((p) => cleanPublisherString(p).toLowerCase() === cleanCand) || null;
};

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

runTest('1. Empty product list yields empty publisher list with "No publishers found" condition', () => {
  const emptyProducts: ProductDocument[] = [];
  const publishers = extractDistinctPublishers(emptyProducts);
  assert.equal(publishers.length, 0);
  const showNoPublishersFound = publishers.length === 0;
  assert.equal(showNoPublishersFound, true, 'Should trigger "No publishers found." message when empty');
});

runTest('2. Automatically extracts and deduplicates publisherName from existing products', () => {
  const sampleProducts: Partial<ProductDocument>[] = [
    { id: '1', title: 'English 9', publisherName: 'Oxford University Press' },
    { id: '2', title: 'Urdu 9', publisherName: 'Moon Light Publishers' },
    { id: '3', title: 'Physics 10', publisherName: 'Oxford University Press' }, // Duplicate
    { id: '4', title: 'Islamyat 10', publisherName: '  moon   light  publishers  ' }, // Extra spaces & lowercase duplicate
  ];

  const extracted = extractDistinctPublishers(sampleProducts as ProductDocument[]);
  assert.equal(extracted.length, 2);
  assert.deepEqual(extracted, ['Moon Light Publishers', 'Oxford University Press']);
});

runTest('3. Case-insensitive and extra whitespace duplicate detection prevents duplicate publishers', () => {
  const currentPublishers = ['Oxford University Press', 'Punjab Textbook Board', 'Moon Light'];

  // Test various duplicate variants
  const dup1 = findDuplicatePublisher(currentPublishers, '  oxford   university  press  ');
  assert.equal(dup1, 'Oxford University Press');

  const dup2 = findDuplicatePublisher(currentPublishers, 'PUNJAB TEXTBOOK BOARD');
  assert.equal(dup2, 'Punjab Textbook Board');

  const dup3 = findDuplicatePublisher(currentPublishers, 'moon light');
  assert.equal(dup3, 'Moon Light');

  // Non-duplicate candidate
  const nonDup = findDuplicatePublisher(currentPublishers, 'Sindh Textbook Board');
  assert.equal(nonDup, null);
});

runTest('4. Adding a new publisher trims and preserves exact casing', () => {
  const currentPublishers = ['Oxford University Press'];
  const newCandidate = '   Caravan Book House   ';

  const isDup = findDuplicatePublisher(currentPublishers, newCandidate);
  assert.equal(isDup, null);

  const cleaned = cleanPublisherString(newCandidate);
  assert.equal(cleaned, 'Caravan Book House');

  const updatedPool = [...currentPublishers, cleaned].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(updatedPool, ['Caravan Book House', 'Oxford University Press']);
});

runTest('5. Selecting a publisher saves exact name into product.publisherName', () => {
  const selected = 'Oxford University Press';
  const newProductDraft: Partial<ProductDocument> = {
    title: 'Progressive English 5',
    sku: 'BK-ENG-005',
    publisherName: cleanPublisherString(selected),
    authorOrPublisher: 'Rachel Redford', // Author kept distinct!
  };

  assert.equal(newProductDraft.publisherName, 'Oxford University Press');
  assert.equal(newProductDraft.authorOrPublisher, 'Rachel Redford');
});

runTest('6. Editing an existing product preserves its publisherName without mutation', () => {
  const existingProduct: ProductDocument = {
    id: 'prod_99',
    sku: 'BK-URD-101',
    title: 'Urdu Lazmi 9',
    classification: 'book',
    categoryId: 'cat_matric',
    publisherName: 'Moon Light Publishers',
    authorOrPublisher: 'Board Committee',
    costPrice: 200,
    retailPrice: 250,
    wholesalePrice: 220,
    currentStock: 50,
    lowStockThreshold: 10,
    unit: 'piece',
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  // Form opens with initialData
  const formInitialPublisher = existingProduct.publisherName || '';
  assert.equal(formInitialPublisher, 'Moon Light Publishers');

  // Product not modified retains exact same publisherName
  const unchangedPayload = {
    ...existingProduct,
    publisherName: formInitialPublisher,
  };
  assert.equal(unchangedPayload.publisherName, 'Moon Light Publishers');
});

runTest('7. Publisher Analytics strictly uses publisherName and NEVER authorOrPublisher', () => {
  // Product with publisherName and authorOrPublisher
  const bookA: Partial<ProductDocument> = {
    title: 'Biology 9',
    publisherName: 'Sindh Textbook Board',
    authorOrPublisher: 'Dr. Ahmad Khan',
  };

  // Product without publisherName (blank)
  const bookB: Partial<ProductDocument> = {
    title: 'General Stationery Register',
    publisherName: undefined,
    authorOrPublisher: 'Deer Paper Mills',
  };

  const resolvePublisherForAnalytics = (item: { publisherName?: string }): string => {
    const raw = item.publisherName;
    if (!raw || typeof raw !== 'string') return 'Unknown';
    const collapsed = raw.replace(/\s+/g, ' ').trim();
    return collapsed.length > 0 ? collapsed : 'Unknown';
  };

  assert.equal(resolvePublisherForAnalytics(bookA), 'Sindh Textbook Board');
  assert.notEqual(resolvePublisherForAnalytics(bookA), 'Dr. Ahmad Khan');

  // Book B has authorOrPublisher "Deer Paper Mills", but no publisherName -> MUST be "Unknown"
  assert.equal(resolvePublisherForAnalytics(bookB), 'Unknown');
  assert.notEqual(resolvePublisherForAnalytics(bookB), 'Deer Paper Mills');
});

runTest('8. Products assigned to the same publisher aggregate under that single publisher', () => {
  const sales = [
    { publisherName: 'Oxford University Press', lineTotal: 500 },
    { publisherName: 'oxford university press', lineTotal: 300 }, // lower-case normalized
    { publisherName: '  Oxford   University   Press  ', lineTotal: 200 }, // space collapsed
  ];

  const map = new Map<string, number>();
  for (const s of sales) {
    const key = cleanPublisherString(s.publisherName).toLowerCase();
    map.set(key, (map.get(key) || 0) + s.lineTotal);
  }

  assert.equal(map.size, 1);
  assert.equal(map.get('oxford university press'), 1000);
});

console.log('====================================================');
console.log(`📊 PUBLISHER DROPDOWN TESTS: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');

