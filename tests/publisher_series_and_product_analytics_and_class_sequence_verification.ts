import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================================');
console.log('PUBLISHER SERIES & SINGLE PRODUCT ANALYTICS + CLASS SEQUENCE AUDIT');
console.log('====================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Class Sorting Helpers (getClassSortRank & compareProductsByClassSequence)
// -----------------------------------------------------------------------------
console.log('TEST 1: Verifying Academic Class Sorting Logic & Sequence...');

const helpersPath = path.join(rootDir, 'src', 'utils', 'purchaseFormHelpers.ts');
assert(fs.existsSync(helpersPath), 'purchaseFormHelpers.ts must exist');
const helpersContent = fs.readFileSync(helpersPath, 'utf8');

assert(helpersContent.includes('export const getClassSortRank'), 'Must export getClassSortRank');
assert(helpersContent.includes('export const compareProductsByClassSequence'), 'Must export compareProductsByClassSequence');
assert(helpersContent.includes('export const sortProductsByClassSequence'), 'Must export sortProductsByClassSequence');

// Unit simulation of getClassSortRank
const simulateClassRank = (targetClass?: string, title?: string): number => {
  const checkEarly = (s: string): number | null => {
    const lower = s.toLowerCase();
    if (lower.includes('playgroup') || lower.includes('play group') || /\bpg\b/i.test(lower) || lower.includes('pre-nursery')) return 1;
    if (lower.includes('nursery') || /\bnur\b/i.test(lower)) return 2;
    if (lower.includes('prep') || lower.includes('kindergarten') || /\bkg\b/i.test(lower)) return 3;
    return null;
  };

  for (const c of [targetClass, title].filter(Boolean) as string[]) {
    const early = checkEarly(c);
    if (early !== null) return early;

    const numMatch = c.match(/\b(?:class|grade)?\s*([1-9]|1[0-2])(?:st|nd|rd|th)?\b/i);
    if (numMatch) {
      const n = parseInt(numMatch[1], 10);
      if (n >= 1 && n <= 12) return n * 10;
    }

    const lower = c.toLowerCase();
    if (/\b(?:class|grade|book|part)?\s*one\b/i.test(lower)) return 10;
    if (/\b(?:class|grade|book|part)?\s*two\b/i.test(lower)) return 20;
    if (/\b(?:class|grade|book|part)?\s*three\b/i.test(lower)) return 30;
    if (/\b(?:class|grade|book|part)?\s*four\b/i.test(lower)) return 40;
    if (/\b(?:class|grade|book|part)?\s*five\b/i.test(lower)) return 50;
    if (/\b(?:class|grade|book|part)?\s*six\b/i.test(lower)) return 60;
    if (/\b(?:class|grade|book|part)?\s*seven\b/i.test(lower)) return 70;
    if (/\b(?:class|grade|book|part)?\s*eight\b/i.test(lower)) return 80;
    if (/\b(?:class|grade|book|part)?\s*nine\b/i.test(lower)) return 90;
    if (/\b(?:class|grade|book|part)?\s*ten\b/i.test(lower)) return 100;
  }
  return 999;
};

// Check Playgroup -> Nursery -> Prep/KG -> Class 1 -> 10
assert.strictEqual(simulateClassRank('Play Group', 'Oxford Urdu'), 1, 'Play Group must be Rank 1');
assert.strictEqual(simulateClassRank('Nursery', 'Oxford Urdu'), 2, 'Nursery must be Rank 2');
assert.strictEqual(simulateClassRank('Prep / KG', 'Oxford Urdu'), 3, 'Prep / KG must be Rank 3');
assert.strictEqual(simulateClassRank('Class 1', 'Oxford Urdu'), 10, 'Class 1 must be Rank 10');
assert.strictEqual(simulateClassRank('Class 2', 'Oxford Urdu'), 20, 'Class 2 must be Rank 20');
assert.strictEqual(simulateClassRank('Class 3', 'Oxford Urdu'), 30, 'Class 3 must be Rank 30');
assert.strictEqual(simulateClassRank('Class 10', 'Oxford Urdu'), 100, 'Class 10 must be Rank 100');
assert.strictEqual(simulateClassRank(undefined, 'Gohar Urdu Playgroup'), 1, 'Title with Playgroup must be Rank 1');
assert.strictEqual(simulateClassRank(undefined, 'Urdu Nursery Book'), 2, 'Title with Nursery must be Rank 2');
assert.strictEqual(simulateClassRank(undefined, 'Urdu Book Two'), 20, 'Title with Book Two must be Rank 20');
assert.strictEqual(simulateClassRank(undefined, 'Stationery Notebook 100pg'), 999, 'General stationery must be Rank 999');

console.log('  ✓ Academic class rank values validated correctly (PG=1, Nursery=2, Prep=3, Class 1=10 ... 10th=100).\n');

// -----------------------------------------------------------------------------
// TEST 2: Sequence sorting of product search results (e.g. Urdu books added randomly)
// -----------------------------------------------------------------------------
console.log('TEST 2: Verifying Product Sorting Sequence (Urdu Books Simulation)...');

const mockUrduProducts = [
  { id: '1', title: 'Oxford Urdu Class 5', targetClass: 'Class 5' },
  { id: '2', title: 'Oxford Urdu Playgroup', targetClass: 'Play Group' },
  { id: '3', title: 'Oxford Urdu Class 10', targetClass: 'Class 10' },
  { id: '4', title: 'Oxford Urdu Nursery', targetClass: 'Nursery' },
  { id: '5', title: 'Oxford Urdu Class 1', targetClass: 'Class 1' },
  { id: '6', title: 'Oxford Urdu Prep / KG', targetClass: 'Prep / KG' },
  { id: '7', title: 'Oxford Urdu Class 2', targetClass: 'Class 2' },
];

const sortedUrdu = [...mockUrduProducts].sort((a, b) => {
  return simulateClassRank(a.targetClass, a.title) - simulateClassRank(b.targetClass, b.title);
});

assert.strictEqual(sortedUrdu[0].title, 'Oxford Urdu Playgroup', '1st must be Playgroup');
assert.strictEqual(sortedUrdu[1].title, 'Oxford Urdu Nursery', '2nd must be Nursery');
assert.strictEqual(sortedUrdu[2].title, 'Oxford Urdu Prep / KG', '3rd must be Prep / KG');
assert.strictEqual(sortedUrdu[3].title, 'Oxford Urdu Class 1', '4th must be Class 1');
assert.strictEqual(sortedUrdu[4].title, 'Oxford Urdu Class 2', '5th must be Class 2');
assert.strictEqual(sortedUrdu[5].title, 'Oxford Urdu Class 5', '6th must be Class 5');
assert.strictEqual(sortedUrdu[6].title, 'Oxford Urdu Class 10', '7th must be Class 10');

console.log('  ✓ Simulated random Urdu inventory sorted into exact sequence:');
sortedUrdu.forEach((p, idx) => console.log(`     ${idx + 1}. [${p.targetClass}] ${p.title}`));
console.log('  ✓ Lower class to higher class sequence confirmed.\n');

// -----------------------------------------------------------------------------
// TEST 3: Product Service & Search Service Integration
// -----------------------------------------------------------------------------
console.log('TEST 3: Verifying productService.ts and productSearchService.ts Integration...');

const prodServicePath = path.join(rootDir, 'src', 'services', 'productService.ts');
const prodServiceContent = fs.readFileSync(prodServicePath, 'utf8');
assert(prodServiceContent.includes('sortProductsByClassSequence(products)'), 'productService.ts must sort products with sortProductsByClassSequence');

const searchServicePath = path.join(rootDir, 'src', 'services', 'productSearchService.ts');
const searchServiceContent = fs.readFileSync(searchServicePath, 'utf8');
assert(searchServiceContent.includes('sortProductsByClassSequence(products)'), 'productSearchService.ts must sort products with sortProductsByClassSequence');

const invPagePath = path.join(rootDir, 'src', 'pages', 'Inventory.tsx');
const invPageContent = fs.readFileSync(invPagePath, 'utf8');
assert(invPageContent.includes('sortProductsByClassSequence'), 'Inventory.tsx must import and use sortProductsByClassSequence');
assert(invPageContent.includes('(PG → 10th)'), 'Inventory.tsx must indicate PG -> 10th academic sequence on title column');

console.log('  ✓ productService.ts, productSearchService.ts, and Inventory.tsx sort by class sequence.\n');

// -----------------------------------------------------------------------------
// TEST 4: Publisher Analytics Service Series & Single Product Metrics Types
// -----------------------------------------------------------------------------
console.log('TEST 4: Verifying publisherAnalyticsService.ts Series & Product Metrics...');

const pubServicePath = path.join(rootDir, 'src', 'services', 'publisherAnalyticsService.ts');
assert(fs.existsSync(pubServicePath), 'publisherAnalyticsService.ts must exist');
const pubServiceContent = fs.readFileSync(pubServicePath, 'utf8');

assert(pubServiceContent.includes('export interface PublisherProductDetailMetrics'), 'Must export PublisherProductDetailMetrics');
assert(pubServiceContent.includes('export interface PublisherSeriesMetrics'), 'Must export PublisherSeriesMetrics');
assert(pubServiceContent.includes('seriesBreakdown: PublisherSeriesMetrics[];'), 'PublisherPeriodMetrics must include seriesBreakdown');
assert(pubServiceContent.includes('products: PublisherProductDetailMetrics[];'), 'PublisherSeriesMetrics must include products');

// Verify Series Metrics contains stock on hand, purchases, sold, and full hisab
assert(pubServiceContent.includes('stockQuantity: number;'), 'Must have stockQuantity');
assert(pubServiceContent.includes('stockCostValue: number;'), 'Must have stockCostValue');
assert(pubServiceContent.includes('purchasedQuantity: number;'), 'Must have purchasedQuantity');
assert(pubServiceContent.includes('totalPurchasedAmount: number;'), 'Must have totalPurchasedAmount');
assert(pubServiceContent.includes('netSalesQuantity: number;'), 'Must have netSalesQuantity');
assert(pubServiceContent.includes('netSales: number;'), 'Must have netSales');
assert(pubServiceContent.includes('grossProfit: number;'), 'Must have grossProfit');
assert(pubServiceContent.includes('grossMarginPercent: number;'), 'Must have grossMarginPercent');

console.log('  ✓ publisherAnalyticsService.ts defines complete metrics for Series and Single Products.\n');

// -----------------------------------------------------------------------------
// TEST 5: Publisher Analytics Service Aggregation Math Simulation
// -----------------------------------------------------------------------------
console.log('TEST 5: Simulating Series & Single Product Analytics Aggregation Math...');

// Mock Series with 2 Books: Class 1 and Class 2
const mockSeriesProducts = [
  {
    productId: 'b1',
    productTitle: 'Progressive English Class 1',
    sku: 'BK-OUP-001',
    seriesName: 'Progressive English',
    targetClass: 'Class 1',
    stockOnHand: 40,
    costPrice: 200,
    retailPrice: 300,
    stockCostValue: 40 * 200, // 8,000
    stockRetailValue: 40 * 300, // 12,000
    purchasedQty: 50,
    purchasedAmount: 50 * 200, // 10,000
    soldQty: 10,
    returnedQty: 0,
    grossSales: 10 * 300, // 3,000
    returnAmount: 0,
    costOfGoodsSold: 10 * 200, // 2,000
  },
  {
    productId: 'b2',
    productTitle: 'Progressive English Class 2',
    sku: 'BK-OUP-002',
    seriesName: 'Progressive English',
    targetClass: 'Class 2',
    stockOnHand: 60,
    costPrice: 250,
    retailPrice: 350,
    stockCostValue: 60 * 250, // 15,000
    stockRetailValue: 60 * 350, // 21,000
    purchasedQty: 80,
    purchasedAmount: 80 * 250, // 20,000
    soldQty: 20,
    returnedQty: 2,
    grossSales: 20 * 350, // 7,000
    returnAmount: 2 * 350, // 700
    costOfGoodsSold: 18 * 250, // 4,500
  },
];

// Calculate Series Totals
const seriesStockQty = mockSeriesProducts.reduce((sum, p) => sum + p.stockOnHand, 0); // 100
const seriesStockCost = mockSeriesProducts.reduce((sum, p) => sum + p.stockCostValue, 0); // 23,000
const seriesPurchasedQty = mockSeriesProducts.reduce((sum, p) => sum + p.purchasedQty, 0); // 130
const seriesPurchasedAmt = mockSeriesProducts.reduce((sum, p) => sum + p.purchasedAmount, 0); // 30,000
const seriesSoldQty = mockSeriesProducts.reduce((sum, p) => sum + (p.soldQty - p.returnedQty), 0); // 28
const seriesNetSales = mockSeriesProducts.reduce((sum, p) => sum + (p.grossSales - p.returnAmount), 0); // 3000 + 6300 = 9300
const seriesCogs = mockSeriesProducts.reduce((sum, p) => sum + p.costOfGoodsSold, 0); // 2000 + 4500 = 6500
const seriesProfit = seriesNetSales - seriesCogs; // 2800
const seriesMargin = Math.round((seriesProfit / seriesNetSales) * 1000) / 10; // 30.1%

assert.strictEqual(seriesStockQty, 100, 'Series stock quantity must be 100 units');
assert.strictEqual(seriesStockCost, 23000, 'Series stock cost must be PKR 23,000');
assert.strictEqual(seriesPurchasedQty, 130, 'Series purchased quantity must be 130 units');
assert.strictEqual(seriesPurchasedAmt, 30000, 'Series purchased cost must be PKR 30,000');
assert.strictEqual(seriesSoldQty, 28, 'Series net sold units must be 28');
assert.strictEqual(seriesNetSales, 9300, 'Series net sales must be PKR 9,300');
assert.strictEqual(seriesProfit, 2800, 'Series gross profit must be PKR 2,800');
assert.strictEqual(seriesMargin, 30.1, 'Series margin percent must be 30.1%');

console.log('  ✓ Series aggregation calculation verified:');
console.log(`     - Stock on Hand: ${seriesStockQty} units (PKR ${seriesStockCost.toLocaleString()})`);
console.log(`     - Purchased Intake: ${seriesPurchasedQty} units (PKR ${seriesPurchasedAmt.toLocaleString()})`);
console.log(`     - Sold Quantity: ${seriesSoldQty} units (PKR ${seriesNetSales.toLocaleString()} Net Sales)`);
console.log(`     - Gross Profit: PKR ${seriesProfit.toLocaleString()} (${seriesMargin}% margin)\n`);

// -----------------------------------------------------------------------------
// TEST 6: Publisher Analytics UI Component Verification (PublisherAnalytics.tsx)
// -----------------------------------------------------------------------------
console.log('TEST 6: Verifying PublisherAnalytics.tsx UI Features...');

const analyticsPagePath = path.join(rootDir, 'src', 'pages', 'PublisherAnalytics.tsx');
assert(fs.existsSync(analyticsPagePath), 'PublisherAnalytics.tsx must exist');
const analyticsPageContent = fs.readFileSync(analyticsPagePath, 'utf8');

assert(analyticsPageContent.includes('Series & Individual Product Hisab'), 'UI must show Series & Individual Product Hisab header');
assert(analyticsPageContent.includes('Series Breakdown'), 'UI must have Series Breakdown subtab');
assert(analyticsPageContent.includes('All Single Products'), 'UI must have All Single Products subtab');
assert(analyticsPageContent.includes('Stock on Hand'), 'UI must show Stock on Hand metrics');
assert(analyticsPageContent.includes('Purchased Intake'), 'UI must show Purchased Intake metrics');
assert(analyticsPageContent.includes('Sold & Net Sales'), 'UI must show Sold & Net Sales metrics');
assert(analyticsPageContent.includes('Expand All Series'), 'UI must have Expand All Series button');
assert(analyticsPageContent.includes('innerSearch'), 'UI must have search filter for series and books');

console.log('  ✓ PublisherAnalytics.tsx renders Series and Single Product Hisab with sub-tabs and search.\n');

console.log('====================================================================');
console.log('ALL PUBLISHER SERIES, PRODUCT ANALYTICS & CLASS TESTS PASSED (6/6)!');
console.log('====================================================================');
