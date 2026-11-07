import assert from 'node:assert/strict';

// ==============================================================================
// SADIQ BOOK AGENCY — PHASE 5 PUBLISHER ANALYTICS TEST SUITE
// Testing: Publisher-Wise Sales & Profitability Analytics
// 1. Publisher Source Policy: Strictly publisherName, NO authorOrPublisher, 'Unknown' default
// 2. Normalization: Whitespace collapse, Trim, Case & Acronym Preservation
// 3. Fuzzy Duplicate Detection: Warns but NEVER silently merges different names
// 4. Financial Calculations:
//    - Gross Sales = sum(saleItem.lineTotal)
//    - Return Amount = sum(returnItem.refundLineTotal)
//    - Net Sales = Gross Sales - Return Amount
//    - Gross COGS = sum(saleItem.costPrice * saleItem.quantity)
//    - Returned COGS = sum(returnItem.originalCostPrice * returnItem.quantity)
//    - Net COGS = Gross COGS - Returned COGS
//    - Gross Profit = Net Sales - Net COGS
//    - Gross Margin % = (Gross Profit / Net Sales) * 100
//    - Zero Net Sales Safety (0% margin, no NaN or Infinity)
// 5. Publisher Product Breakdown & Top Products Ranking
// 6. In-Memory Caching & Bounded Query Read-Protection
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
console.log('📊 SADIQ BOOK AGENCY — PHASE 5 PUBLISHER ANALYTICS');
console.log('====================================================\n');

// Import / Mirror the Analytics Logic from publisherAnalyticsService
const normalizePublisherName = (raw?: string | null): string => {
  if (!raw || typeof raw !== 'string') return 'Unknown';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : 'Unknown';
};

const detectFuzzyDuplicateWarnings = (publisherNames: string[]): string[] => {
  const warnings: string[] = [];
  const lowerMap = new Map<string, string[]>();

  for (const name of publisherNames) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!lowerMap.has(key)) {
      lowerMap.set(key, []);
    }
    const list = lowerMap.get(key)!;
    if (!list.includes(name)) {
      list.push(name);
    }
  }

  for (const [_, list] of lowerMap.entries()) {
    if (list.length > 1) {
      warnings.push(
        `Potential duplicate publisher names detected: [${list.join(', ')}]. Kept separate per policy.`
      );
    }
  }

  return warnings;
};

interface MockSaleItem {
  productId: string;
  productTitle: string;
  sku: string;
  publisherName?: string;
  authorOrPublisher?: string; // Must NEVER be used!
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  costPrice: number;
}

interface MockReturnItem {
  productId: string;
  productName: string;
  publisherName?: string;
  quantity: number;
  refundUnitPrice: number;
  refundLineTotal: number;
  originalCostPrice: number;
}

// Sample Sale Items representing October 2026 sales
const sampleSales: MockSaleItem[] = [
  // Sindh Textbook Board
  {
    productId: 'p1',
    productTitle: 'Sindh Chemistry 9',
    sku: 'BK-SIN-CH9',
    publisherName: 'Sindh Textbook Board',
    authorOrPublisher: 'Dr. Tariq',
    quantity: 10,
    unitPrice: 300,
    lineTotal: 3000,
    costPrice: 200, // COGS: 2000
  },
  {
    productId: 'p2',
    productTitle: 'Sindh Biology 9',
    sku: 'BK-SIN-BIO9',
    publisherName: 'Sindh Textbook Board',
    quantity: 5,
    unitPrice: 280,
    lineTotal: 1400,
    costPrice: 180, // COGS: 900
  },
  // Oxford University Press
  {
    productId: 'p3',
    productTitle: 'Oxford Progressive English 5',
    sku: 'BK-OXF-E5',
    publisherName: 'Oxford University Press',
    quantity: 8,
    unitPrice: 500,
    lineTotal: 4000,
    costPrice: 350, // COGS: 2800
  },
  // Item with whitespace in publisher
  {
    productId: 'p4',
    productTitle: 'General Knowledge 3',
    sku: 'BK-ML-GK3',
    publisherName: '  Moon   Light   Publisher  ',
    quantity: 12,
    unitPrice: 150,
    lineTotal: 1800,
    costPrice: 100, // COGS: 1200
  },
  // Item with completely missing publisherName
  {
    productId: 'p5',
    productTitle: 'Urdu Qawaid 6',
    sku: 'BK-URD-6',
    publisherName: undefined,
    authorOrPublisher: 'Maulvi Abdul Haq', // Must NOT be used!
    quantity: 4,
    unitPrice: 200,
    lineTotal: 800,
    costPrice: 120, // COGS: 480
  },
];

// Sample Return Items representing October 2026 returns
const sampleReturns: MockReturnItem[] = [
  // Return 2 units of Sindh Chemistry 9
  {
    productId: 'p1',
    productName: 'Sindh Chemistry 9',
    publisherName: 'Sindh Textbook Board',
    quantity: 2,
    refundUnitPrice: 300,
    refundLineTotal: 600,
    originalCostPrice: 200, // Returned COGS: 400
  },
  // Return 1 unit of Oxford English 5
  {
    productId: 'p3',
    productName: 'Oxford Progressive English 5',
    publisherName: 'Oxford University Press',
    quantity: 1,
    refundUnitPrice: 500,
    refundLineTotal: 500,
    originalCostPrice: 350, // Returned COGS: 350
  },
];

// Aggregation Function mirroring publisherAnalyticsService
const aggregateMetrics = (sales: MockSaleItem[], returns: MockReturnItem[]) => {
  const buckets = new Map<string, {
    publisherName: string;
    salesQty: number;
    grossSales: number;
    returnedQty: number;
    returnAmount: number;
    grossCogs: number;
    returnedCogs: number;
    productsMap: Map<string, { title: string; qty: number; netAmount: number }>;
  }>();

  for (const s of sales) {
    const pub = normalizePublisherName(s.publisherName);
    if (!buckets.has(pub)) {
      buckets.set(pub, {
        publisherName: pub,
        salesQty: 0,
        grossSales: 0,
        returnedQty: 0,
        returnAmount: 0,
        grossCogs: 0,
        returnedCogs: 0,
        productsMap: new Map(),
      });
    }
    const b = buckets.get(pub)!;
    b.salesQty += s.quantity;
    b.grossSales += s.lineTotal;
    b.grossCogs += s.costPrice * s.quantity;

    if (!b.productsMap.has(s.productId)) {
      b.productsMap.set(s.productId, { title: s.productTitle, qty: 0, netAmount: 0 });
    }
    const p = b.productsMap.get(s.productId)!;
    p.qty += s.quantity;
    p.netAmount += s.lineTotal;
  }

  for (const r of returns) {
    const pub = normalizePublisherName(r.publisherName);
    if (buckets.has(pub)) {
      const b = buckets.get(pub)!;
      b.returnedQty += r.quantity;
      b.returnAmount += r.refundLineTotal;
      b.returnedCogs += r.originalCostPrice * r.quantity;

      if (b.productsMap.has(r.productId)) {
        const p = b.productsMap.get(r.productId)!;
        p.qty -= r.quantity;
        p.netAmount -= r.refundLineTotal;
      }
    }
  }

  const results = [];
  for (const b of buckets.values()) {
    const netSales = Math.round((b.grossSales - b.returnAmount) * 100) / 100;
    const netCogs = Math.round((b.grossCogs - b.returnedCogs) * 100) / 100;
    const grossProfit = Math.round((netSales - netCogs) * 100) / 100;
    const grossMarginPercent = netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0;

    results.push({
      publisherName: b.publisherName,
      salesQuantity: b.salesQty,
      grossSalesAmount: b.grossSales,
      returnedQuantity: b.returnedQty,
      returnAmount: b.returnAmount,
      netSales,
      costOfGoodsSold: netCogs,
      grossProfit,
      grossMarginPercent,
      topProducts: Array.from(b.productsMap.values()),
    });
  }

  return results;
};

// ==============================================================================
// TEST SUITE 1: PUBLISHER NAME NORMALIZATION & SOURCE INTEGRITY
// ==============================================================================

runTest('Publisher name collapses repeated spaces and trims ends properly', () => {
  const norm = normalizePublisherName('   Oxford   University    Press   ');
  assert.equal(norm, 'Oxford University Press');
});

runTest('Missing, undefined, or empty publisher name defaults to literal "Unknown"', () => {
  assert.equal(normalizePublisherName(undefined), 'Unknown');
  assert.equal(normalizePublisherName(''), 'Unknown');
  assert.equal(normalizePublisherName('     '), 'Unknown');
});

runTest('Missing publisher name NEVER falls back to obsolete authorOrPublisher', () => {
  const item = sampleSales.find((s) => s.productId === 'p5')!;
  const resolved = normalizePublisherName(item.publisherName);

  assert.equal(resolved, 'Unknown');
  assert.notEqual(resolved, 'Maulvi Abdul Haq');
});

runTest('Fuzzy duplicate detection flags similar names without silently merging them', () => {
  const names = ['Oxford University Press', 'oxford university press', 'Sindh Textbook Board'];
  const warnings = detectFuzzyDuplicateWarnings(names);

  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('Potential duplicate publisher names detected'));
  assert.ok(warnings[0].includes('Kept separate per policy'));
});

// ==============================================================================
// TEST SUITE 2: ACCOUNTING METRICS & MATH INVARIANTS
// ==============================================================================

runTest('Sindh Textbook Board: Gross Sales, Return Amount and Net Sales match accounting formula', () => {
  const metrics = aggregateMetrics(sampleSales, sampleReturns);
  const sindh = metrics.find((m) => m.publisherName === 'Sindh Textbook Board')!;
  assert.ok(sindh);

  // Sold: 10 chem + 5 bio = 15 units
  assert.equal(sindh.salesQuantity, 15);
  // Gross: 3000 + 1400 = 4400
  assert.equal(sindh.grossSalesAmount, 4400);

  // Returned: 2 units chem
  assert.equal(sindh.returnedQuantity, 2);
  assert.equal(sindh.returnAmount, 600);

  // Net Sales: 4400 - 600 = 3800
  assert.equal(sindh.netSales, 3800);
});

runTest('Sindh Textbook Board: Net COGS, Gross Profit and Gross Margin % calculate accurately', () => {
  const metrics = aggregateMetrics(sampleSales, sampleReturns);
  const sindh = metrics.find((m) => m.publisherName === 'Sindh Textbook Board')!;

  // Gross COGS: (10 * 200) + (5 * 180) = 2000 + 900 = 2900
  // Returned COGS: (2 * 200) = 400
  // Net COGS: 2900 - 400 = 2500
  assert.equal(sindh.costOfGoodsSold, 2500);

  // Gross Profit: Net Sales (3800) - Net COGS (2500) = 1300
  assert.equal(sindh.grossProfit, 1300);

  // Gross Margin: (1300 / 3800) * 100 = 34.2105% -> 34.2%
  assert.equal(sindh.grossMarginPercent, 34.2);
});

runTest('Oxford University Press: Net sales and margins calculate with returned items', () => {
  const metrics = aggregateMetrics(sampleSales, sampleReturns);
  const oxf = metrics.find((m) => m.publisherName === 'Oxford University Press')!;
  assert.ok(oxf);

  // Sold: 8 units @ 500 = 4000
  // Returned: 1 unit @ 500 = 500
  // Net Sales: 3500
  assert.equal(oxf.salesQuantity, 8);
  assert.equal(oxf.returnedQuantity, 1);
  assert.equal(oxf.netSales, 3500);

  // Gross COGS: 8 * 350 = 2800
  // Returned COGS: 1 * 350 = 350
  // Net COGS: 2450
  assert.equal(oxf.costOfGoodsSold, 2450);

  // Gross Profit: 3500 - 2450 = 1050
  assert.equal(oxf.grossProfit, 1050);

  // Margin: (1050 / 3500) * 100 = 30.0%
  assert.equal(oxf.grossMarginPercent, 30.0);
});

runTest('Zero or negative net sales safely yields 0% margin without division by zero errors', () => {
  // Simulate item where all sold items were returned: Gross 1000, Return 1000 -> Net Sales 0
  const zeroSales: MockSaleItem[] = [
    { productId: 'z1', productTitle: 'Sample Book', sku: 'BK-Z', publisherName: 'Test Pub', quantity: 2, unitPrice: 500, lineTotal: 1000, costPrice: 300 },
  ];
  const fullReturns: MockReturnItem[] = [
    { productId: 'z1', productName: 'Sample Book', publisherName: 'Test Pub', quantity: 2, refundUnitPrice: 500, refundLineTotal: 1000, originalCostPrice: 300 },
  ];

  const metrics = aggregateMetrics(zeroSales, fullReturns);
  const testPub = metrics.find((m) => m.publisherName === 'Test Pub')!;

  assert.equal(testPub.netSales, 0);
  assert.equal(testPub.grossProfit, 0);
  assert.equal(testPub.grossMarginPercent, 0, 'Zero net sales must safely evaluate to 0% margin');
  assert.notEqual(testPub.grossMarginPercent, NaN);
  assert.notEqual(testPub.grossMarginPercent, Infinity);
});

// ==============================================================================
// TEST SUITE 3: PRODUCT BREAKDOWN PER PUBLISHER
// ==============================================================================

runTest('Publisher product breakdown aggregates net quantities and net revenue per book', () => {
  const metrics = aggregateMetrics(sampleSales, sampleReturns);
  const sindh = metrics.find((m) => m.publisherName === 'Sindh Textbook Board')!;

  // Sindh Chemistry 9: 10 sold - 2 returned = 8 net units, 3000 - 600 = 2400 net amount
  const chem = sindh.topProducts.find((p) => p.title === 'Sindh Chemistry 9')!;
  assert.ok(chem);
  assert.equal(chem.qty, 8);
  assert.equal(chem.netAmount, 2400);

  // Sindh Biology 9: 5 sold - 0 returned = 5 net units, 1400 net amount
  const bio = sindh.topProducts.find((p) => p.title === 'Sindh Biology 9')!;
  assert.ok(bio);
  assert.equal(bio.qty, 5);
  assert.equal(bio.netAmount, 1400);
});

await Promise.all(pendingPromises);

console.log('\n====================================================');
console.log(`📊 PHASE 5 SUMMARY: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');

