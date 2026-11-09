import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeClassString,
  extractClassNumber,
  matchesClassHierarchy,
  matchesPublisherHierarchy,
  matchesSeriesHierarchy,
  matchesSearchTokens,
  matchesProductSearch,
} from '../src/utils/purchaseFormHelpers.ts';
import type { ProductDocument } from '../src/types/database.ts';

console.log('--- Starting Hierarchy & Search Flow Verification ---');

// Mock products simulating real store catalog entries
const moonlightPlaygroupEnglish: ProductDocument = {
  id: 'prod_pg_eng',
  sku: 'BK-ESC-1540',
  title: 'eSCHOLOFY W. English',
  classification: 'book',
  categoryId: 'cat_primary',
  categoryName: 'Primary',
  publisherName: 'Moon Light',
  // author skipped by user, so authorOrPublisher defaults to publisherName or is empty in legacy
  authorOrPublisher: 'Moon Light',
  edition: 'Playgroup',
  targetClass: 'Play Group',
  costPrice: 300,
  retailPrice: 350,
  currentStock: 30,
  lowStockThreshold: 10,
  unit: 'piece',
  isActive: true,
  createdAt: '2026-11-03T13:13:30.672Z',
  updatedAt: '2026-11-05T18:27:22.197Z',
};

const moonlightLegacyUrdu9: ProductDocument = {
  id: 'prod_urdu_9',
  sku: 'BK-MOO-3432',
  title: 'URDU',
  classification: 'book',
  categoryId: 'cat_middle',
  categoryName: 'Middle',
  // Legacy doc: has MOON LIGHT only in authorOrPublisher, publisherName is missing
  authorOrPublisher: 'MOON LIGHT',
  edition: 'Class 9',
  costPrice: 340,
  retailPrice: 400,
  currentStock: 183,
  lowStockThreshold: 50,
  unit: 'piece',
  isActive: true,
  createdAt: '2026-11-01T18:27:10.111Z',
  updatedAt: '2026-11-05T18:27:22.197Z',
};

const oxfordSkillLab10: ProductDocument = {
  id: 'prod_isl_10',
  sku: 'BK-ISL-4756',
  title: 'Skill Lab Islamyat',
  classification: 'book',
  categoryId: 'cat_matric',
  categoryName: 'Matric',
  publisherId: 'pub_oxford',
  publisherName: 'Oxford University Press',
  seriesId: 'ser_skill_lab',
  seriesName: 'Skill Lab',
  authorOrPublisher: 'Dr. Tariq',
  edition: '10',
  costPrice: 500,
  retailPrice: 550,
  currentStock: 148,
  lowStockThreshold: 10,
  unit: 'piece',
  isActive: true,
  createdAt: '2026-11-03T08:57:03.332Z',
  updatedAt: '2026-11-03T09:56:29.395Z',
};

// ============================================================================
// PART 1: Class Normalization & Hierarchy Matching
// ============================================================================
console.log('\n--- Part 1: Class Normalization & Hierarchy Matching ---');

// Test 1: Class normalization
console.log('Test 1: Verifying normalizeClassString and extractClassNumber...');
assert.equal(normalizeClassString('Play Group'), 'playgroup');
assert.equal(normalizeClassString('Playgroup'), 'playgroup');
assert.equal(normalizeClassString('Prep / KG'), 'prepkg');
assert.equal(extractClassNumber('Class 9'), 9);
assert.equal(extractClassNumber('9th'), 9);
assert.equal(extractClassNumber('10'), 10);
assert.equal(extractClassNumber('Class 1'), 1);
console.log('✓ Test 1 Passed: Class normalization and number extraction verified.');

// Test 2: Play Group vs Playgroup matching
console.log('Test 2: Verifying Play Group vs Playgroup matches correctly...');
assert.ok(
  matchesClassHierarchy(moonlightPlaygroupEnglish, 'Play Group'),
  'Must match edition "Playgroup" when user filters by "Play Group"'
);
assert.ok(
  matchesClassHierarchy(moonlightPlaygroupEnglish, 'Playgroup'),
  'Must match edition "Playgroup" when user filters by "Playgroup"'
);
console.log('✓ Test 2 Passed: Play Group vs Playgroup matches verified.');

// Test 3: Numerical Class matching & Strict Separation (Class 1 != Class 10)
console.log('Test 3: Verifying numerical class matching and separation...');
assert.ok(
  matchesClassHierarchy(moonlightLegacyUrdu9, 'Class 9'),
  'Must match edition "Class 9" when user filters by "Class 9"'
);
assert.ok(
  matchesClassHierarchy(oxfordSkillLab10, 'Class 10'),
  'Must match edition "10" when user filters by "Class 10"'
);
assert.strictEqual(
  matchesClassHierarchy(oxfordSkillLab10, 'Class 1'),
  false,
  'Class 10 must NOT falsely match filter "Class 1"'
);
console.log('✓ Test 3 Passed: Numerical class matching and strict separation verified.');

// ============================================================================
// PART 2: Publisher & Series Hierarchy Matching
// ============================================================================
console.log('\n--- Part 2: Publisher & Series Hierarchy Matching ---');

// Test 4: Publisher matching by name and authorOrPublisher fallback
console.log('Test 4: Verifying publisher matching across modern & legacy catalog...');
assert.ok(
  matchesPublisherHierarchy(moonlightPlaygroupEnglish, 'pub_moonlight', 'Moon Light'),
  'Must match publisherName "Moon Light" by name'
);
assert.ok(
  matchesPublisherHierarchy(moonlightLegacyUrdu9, 'pub_moonlight', 'Moon Light'),
  'Must match legacy authorOrPublisher "MOON LIGHT" even without publisherId'
);
assert.ok(
  matchesPublisherHierarchy(oxfordSkillLab10, 'pub_oxford', 'Oxford University Press'),
  'Must match publisherId "pub_oxford"'
);
assert.strictEqual(
  matchesPublisherHierarchy(oxfordSkillLab10, 'pub_moonlight', 'Moon Light'),
  false,
  'Oxford book must NOT match Moon Light publisher filter'
);
console.log('✓ Test 4 Passed: Publisher matching verified.');

// Test 5: Series matching
console.log('Test 5: Verifying series matching by ID, Name, and Title...');
assert.ok(
  matchesSeriesHierarchy(moonlightPlaygroupEnglish, 'ser_escholofy', 'Eschoolify'),
  'Must match series name in title "eSCHOLOFY W. English"'
);
assert.ok(
  matchesSeriesHierarchy(oxfordSkillLab10, 'ser_skill_lab', 'Skill Lab'),
  'Must match seriesId "ser_skill_lab"'
);
console.log('✓ Test 5 Passed: Series matching verified.');

// ============================================================================
// PART 3: Multi-Token Search & Partial Code Matching
// ============================================================================
console.log('\n--- Part 3: Multi-Token Search & Partial Code Matching ---');

// Test 6: Substring & Word search
console.log('Test 6: Verifying multi-token substring search...');
// Searching "English" must match "eSCHOLOFY W. English" even if not at the beginning
assert.ok(
  matchesSearchTokens(moonlightPlaygroupEnglish, 'English'),
  'Must match "English" when word is inside title'
);
// Searching code "1540" must match "BK-ESC-1540"
assert.ok(
  matchesSearchTokens(moonlightPlaygroupEnglish, '1540'),
  'Must match partial code "1540" in SKU'
);
// Searching multiple words in any order
assert.ok(
  matchesSearchTokens(moonlightPlaygroupEnglish, 'Moonlight English 1540'),
  'Must match multi-token search in any order'
);
console.log('✓ Test 6 Passed: Multi-token search and partial code matching verified.');

// ============================================================================
// PART 4: End-to-End User Flow Verification (Publisher > Series > Class > Search)
// ============================================================================
console.log('\n--- Part 4: End-to-End Flow (Publisher > Series > Class > Search) ---');

// Test 7: matchesProductSearch with full flow
console.log('Test 7: Verifying matchesProductSearch with full user flow...');
const fullFlowMatch = matchesProductSearch(
  moonlightPlaygroupEnglish,
  'English', // search query
  'all',     // category
  'book',    // classification
  'all',     // authorOrPublisher
  'pub_moonlight', // publisherFilter
  'ser_escholofy', // seriesFilter
  'Play Group',    // classFilter
  'Moon Light',    // publisherName
  'Eschoolify'     // seriesName
);
assert.ok(fullFlowMatch, 'Full user flow must match eSCHOLOFY W. English successfully');
console.log('✓ Test 7 Passed: End-to-end flow verified.');

// ============================================================================
// PART 5: Codebase Implementation Verification
// ============================================================================
console.log('\n--- Part 5: Codebase Implementation Verification ---');

const productModalPath = path.resolve('src/components/inventory/ProductFormModal.tsx');
const productServicePath = path.resolve('src/services/productService.ts');
const purchaseModalPath = path.resolve('src/components/purchases/PurchaseFormModal.tsx');
const posPagePath = path.resolve('src/pages/POS.tsx');

const productModalContent = fs.readFileSync(productModalPath, 'utf8');
const productServiceContent = fs.readFileSync(productServicePath, 'utf8');
const purchaseModalContent = fs.readFileSync(purchaseModalPath, 'utf8');
const posPageContent = fs.readFileSync(posPagePath, 'utf8');

// Test 8: Author default fallback when skipped
console.log('Test 8: Verifying author fallback when skipped by user...');
assert.ok(
  productModalContent.includes('authorOrPublisher: authorOrPublisher.trim() ||'),
  'ProductFormModal must fallback author to publisherName when skipped'
);
assert.ok(
  productServiceContent.includes('input.authorOrPublisher?.trim() || resolvedPublisherName'),
  'createProduct must fallback author to resolvedPublisherName when skipped'
);
console.log('✓ Test 8 Passed: Author fallback when skipped verified.');

// Test 9: getProductsPaginated query expansion
console.log('Test 9: Verifying getProductsPaginated query limit expansion...');
assert.ok(
  productServiceContent.includes('const hasSpecificFilter = Boolean') &&
    productServiceContent.includes('const queryLimit = hasSpecificFilter ? 500 : (pageSize + 1);'),
  'getProductsPaginated must expand query limit to 500 when specific filters are applied'
);
assert.ok(
  productServiceContent.includes('matchesPublisherHierarchy(p, filters.publisherId)') &&
    productServiceContent.includes('matchesClassHierarchy(p, filters.targetClass)'),
  'getProductsPaginated must use intelligent publisher & class hierarchy matching'
);
console.log('✓ Test 9 Passed: getProductsPaginated query expansion verified.');

// Test 10: POS.tsx intelligent search & hierarchy integration
console.log('Test 10: Verifying POS.tsx intelligent search & hierarchy integration...');
assert.ok(
  posPageContent.includes('matchesPublisherHierarchy') &&
    posPageContent.includes('matchesClassHierarchy'),
  'POS.tsx must import and use intelligent hierarchy matchers'
);
console.log('✓ Test 10 Passed: POS.tsx integration verified.');

console.log('\n=== ALL HIERARCHY & SEARCH FLOW VERIFICATION TESTS PASSED! ===');
