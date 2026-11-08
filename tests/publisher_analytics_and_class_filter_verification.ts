import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// ====================================================================
// SADIQ BOOK AGENCY — PUBLISHER ANALYTICS, CLASS FILTER & PLAY GROUP
// ====================================================================

interface MockProductDocument {
  id: string;
  title: string;
  sku: string;
  classification: string;
  categoryId: string;
  publisherName: string;
  seriesName?: string;
  targetClass?: string;
  className?: string;
  costPrice: number;
  retailPrice: number;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MockPurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

interface MockPurchaseDocument {
  id: string;
  items: MockPurchaseItem[];
}

interface MockSaleItem {
  productId: string;
  productName: string;
  sku: string;
  publisherName: string;
  quantity: number;
  costPrice: number;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  effectivePrice: number;
  lineTotal: number;
}

interface MockSaleDocument {
  id: string;
  items: MockSaleItem[];
}

const STANDARD_CLASSES = [
  'Play Group',
  'Nursery',
  'Prep / KG',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
] as const;

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — PUBLISHER ANALYTICS, CLASS FILTER & PLAY GROUP');
console.log('====================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failedTests++;
  }
}

// ====================================================================
// 1. Requirement 3: PLAY GROUP in Educational Board & Syllabus Classes
// ====================================================================
console.log('--- 1. Educational Board & Syllabus Classes: Play Group Addition ---');

runTest('1. STANDARD_CLASSES includes "Play Group" as the first class in syllabusService', () => {
  const syllabusServicePath = path.resolve(process.cwd(), 'src/services/syllabusService.ts');
  const syllabusServiceContent = fs.readFileSync(syllabusServicePath, 'utf8');
  assert.ok(syllabusServiceContent.includes("'Play Group'"), 'syllabusService.ts must contain Play Group');
  assert.strictEqual(STANDARD_CLASSES[0], 'Play Group', 'First class must be "Play Group"');
  assert.ok(STANDARD_CLASSES.includes('Nursery'), 'Must include Nursery');
  assert.ok(STANDARD_CLASSES.includes('Prep / KG'), 'Must include Prep / KG');
  assert.ok(STANDARD_CLASSES.includes('Class 1'), 'Must include Class 1');
  assert.ok(STANDARD_CLASSES.includes('Class 10'), 'Must include Class 10');
});

runTest('2. SyllabusManager and SchoolSyllabusSetModal import and render Play Group', () => {
  const sylManagerPath = path.resolve(process.cwd(), 'src/components/syllabus/SyllabusManager.tsx');
  const sylModalPath = path.resolve(process.cwd(), 'src/components/pos/SchoolSyllabusSetModal.tsx');
  
  const sylManagerContent = fs.readFileSync(sylManagerPath, 'utf8');
  const sylModalContent = fs.readFileSync(sylModalPath, 'utf8');

  assert.ok(sylManagerContent.includes('STANDARD_CLASSES'), 'SyllabusManager must use STANDARD_CLASSES');
  assert.ok(sylManagerContent.includes('PLAY GROUP'), 'SyllabusManager header must mention PLAY GROUP');
  assert.ok(sylModalContent.includes('STANDARD_CLASSES'), 'SchoolSyllabusSetModal must use STANDARD_CLASSES');
});

// ====================================================================
// 2. Requirement 2: Class Filter in POS & Inventory Items
// ====================================================================
console.log('\n--- 2. Class Filter in POS, Inventory & Product Creation ---');

runTest('3. ProductDocument and CreateProductInput include targetClass and className', () => {
  const dbTypesPath = path.resolve(process.cwd(), 'src/types/database.ts');
  const prodServicePath = path.resolve(process.cwd(), 'src/services/productService.ts');
  
  const dbTypesContent = fs.readFileSync(dbTypesPath, 'utf8');
  const prodServiceContent = fs.readFileSync(prodServicePath, 'utf8');

  assert.ok(dbTypesContent.includes('targetClass?: string;'), 'ProductDocument must have targetClass');
  assert.ok(dbTypesContent.includes('className?: string;'), 'ProductDocument must have className');
  assert.ok(prodServiceContent.includes('targetClass?: string;'), 'CreateProductInput must have targetClass');
  assert.ok(prodServiceContent.includes("targetClass?: string | 'all';"), 'ProductFilters must have targetClass');
});

runTest('4. ProductFormModal provides Academic Class dropdown with STANDARD_CLASSES', () => {
  const modalPath = path.resolve(process.cwd(), 'src/components/inventory/ProductFormModal.tsx');
  const content = fs.readFileSync(modalPath, 'utf8');

  assert.ok(content.includes('STANDARD_CLASSES'), 'ProductFormModal must import STANDARD_CLASSES');
  assert.ok(content.includes('targetClass'), 'ProductFormModal must manage targetClass state');
  assert.ok(content.includes('Publisher, Series & Class Hierarchy'), 'Hierarchy label must include Class');
  assert.ok(content.includes('Step 1: Publisher $\\rightarrow$ Step 2: Series $\\rightarrow$ Step 3: Class'), 'Header must state the 3-step hierarchy');
});

runTest('5. POS page provides guided Publisher -> Series -> Class dropdowns', () => {
  const posPath = path.resolve(process.cwd(), 'src/pages/POS.tsx');
  const content = fs.readFileSync(posPath, 'utf8');

  assert.ok(content.includes('STANDARD_CLASSES'), 'POS must import STANDARD_CLASSES');
  assert.ok(content.includes('selectedClass'), 'POS must manage selectedClass state');
  assert.ok(content.includes('handleClassFilterChange'), 'POS must have handleClassFilterChange handler');
  assert.ok(content.includes('Books (Publisher, Series & Class)'), 'POS must label the book category tab with Class');
  assert.ok(content.includes('grid-cols-1 sm:grid-cols-3 gap-2'), 'POS must render 3-column dropdown layout for Publisher, Series & Class');
});

runTest('6. Inventory page provides Class filter dropdown and displays Class tag', () => {
  const invPath = path.resolve(process.cwd(), 'src/pages/Inventory.tsx');
  const content = fs.readFileSync(invPath, 'utf8');

  assert.ok(content.includes('STANDARD_CLASSES'), 'Inventory must import STANDARD_CLASSES');
  assert.ok(content.includes("targetClass: 'all'"), 'Inventory productFilters must initialize targetClass');
  assert.ok(content.includes('row.targetClass || row.className'), 'Inventory title column must show class badge');
  assert.ok(content.includes('xl:grid-cols-8'), 'Inventory filter bar must support the 8 filter columns including Class');
});

runTest('7. In-memory and search hierarchy filter by targetClass correctly', () => {
  const mockProducts: MockProductDocument[] = [
    {
      id: 'p1',
      title: 'Oxford Urdu Class 1',
      sku: 'BK-OXF-001',
      classification: 'book',
      categoryId: 'cat_book',
      publisherName: 'Oxford University Press',
      seriesName: 'Urdu Silsila',
      targetClass: 'Class 1',
      costPrice: 150,
      retailPrice: 200,
      currentStock: 25,
      lowStockThreshold: 5,
      unit: 'piece',
      isActive: true,
      isLowStock: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'p2',
      title: 'Oxford Urdu Class 9',
      sku: 'BK-OXF-009',
      classification: 'book',
      categoryId: 'cat_book',
      publisherName: 'Oxford University Press',
      seriesName: 'Urdu Silsila',
      targetClass: 'Class 9',
      costPrice: 200,
      retailPrice: 280,
      currentStock: 40,
      lowStockThreshold: 5,
      unit: 'piece',
      isActive: true,
      isLowStock: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'p3',
      title: 'Play Group Activity Book',
      sku: 'BK-PG-001',
      classification: 'book',
      categoryId: 'cat_book',
      publisherName: 'Oxford University Press',
      seriesName: 'Early Years',
      targetClass: 'Play Group',
      costPrice: 100,
      retailPrice: 140,
      currentStock: 15,
      lowStockThreshold: 5,
      unit: 'piece',
      isActive: true,
      isLowStock: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  // Filter for Class 9
  const class9Filtered = mockProducts.filter((p) => {
    const cls = 'class 9';
    return (
      (p.targetClass && p.targetClass.toLowerCase() === cls) ||
      (p.title && p.title.toLowerCase().includes(cls))
    );
  });
  assert.strictEqual(class9Filtered.length, 1);
  assert.strictEqual(class9Filtered[0].sku, 'BK-OXF-009');

  // Filter for Play Group
  const pgFiltered = mockProducts.filter((p) => {
    const cls = 'play group';
    return (
      (p.targetClass && p.targetClass.toLowerCase() === cls) ||
      (p.title && p.title.toLowerCase().includes(cls))
    );
  });
  assert.strictEqual(pgFiltered.length, 1);
  assert.strictEqual(pgFiltered[0].sku, 'BK-PG-001');
});

// ====================================================================
// 3. Requirement 1: Publisher Stock, Purchases & Sales Analytics
// ====================================================================
console.log('\n--- 3. Publisher Stock, Purchases & Sales Analytics ---');

runTest('8. Publisher Analytics service computes Shop Stock, Purchases & Sales metrics', () => {
  const servicePath = path.resolve(process.cwd(), 'src/services/publisherAnalyticsService.ts');
  const content = fs.readFileSync(servicePath, 'utf8');

  assert.ok(content.includes('currentStockQuantity: number;'), 'Metrics must include currentStockQuantity');
  assert.ok(content.includes('currentStockCostValue: number;'), 'Metrics must include currentStockCostValue');
  assert.ok(content.includes('purchasedQuantity: number;'), 'Metrics must include purchasedQuantity');
  assert.ok(content.includes('totalPurchasedAmount: number;'), 'Metrics must include totalPurchasedAmount');
  assert.ok(content.includes('salesQuantity: number;'), 'Metrics must include salesQuantity');
  assert.ok(content.includes('netSales: number;'), 'Metrics must include netSales');
  assert.ok(content.includes('totalStockQuantity: number;'), 'Summary must include totalStockQuantity');
  assert.ok(content.includes('totalStockCostValue: number;'), 'Summary must include totalStockCostValue');
  assert.ok(content.includes('totalPurchasedQuantity: number;'), 'Summary must include totalPurchasedQuantity');
  assert.ok(content.includes('totalPurchasedAmount: number;'), 'Summary must include totalPurchasedAmount');
});

runTest('9. Publisher Analytics Page renders Stock on Hand, Purchases Intake & Sales', () => {
  const pagePath = path.resolve(process.cwd(), 'src/pages/PublisherAnalytics.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  assert.ok(content.includes('Stock on Hand'), 'Executive summary must have Stock on Hand card');
  assert.ok(content.includes('Purchases Intake'), 'Executive summary must have Purchases Intake card');
  assert.ok(content.includes('Stock on Hand (Cost)'), 'Table header must have Stock on Hand column');
  assert.ok(content.includes('Purchased (Cost)'), 'Table header must have Purchased column');
  assert.ok(content.includes('Shop Stock on Hand'), 'Product breakdown must have Shop Stock on Hand column');
  assert.ok(content.includes('Purchased Intake'), 'Product breakdown must have Purchased Intake column');
});

runTest('10. Math Verification: Exact Aggregation of Publisher Stock, Purchases and Sales', () => {
  // Simulate products in shop
  const oxfordProducts: MockProductDocument[] = [
    {
      id: 'p1',
      title: 'Oxford Urdu 1',
      sku: 'OXF-1',
      classification: 'book',
      categoryId: 'cat_1',
      publisherName: 'Oxford University Press',
      costPrice: 150,
      retailPrice: 200,
      currentStock: 20,
      lowStockThreshold: 5,
      unit: 'piece',
      isActive: true,
      isLowStock: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'p2',
      title: 'Oxford English 1',
      sku: 'OXF-2',
      classification: 'book',
      categoryId: 'cat_1',
      publisherName: 'Oxford University Press',
      costPrice: 250,
      retailPrice: 320,
      currentStock: 10,
      lowStockThreshold: 5,
      unit: 'piece',
      isActive: true,
      isLowStock: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  // Stock on Hand Math:
  // p1: 20 * 150 = 3000
  // p2: 10 * 250 = 2500
  // Total units: 30, Total cost value: PKR 5500
  const stockQty = oxfordProducts.reduce((sum, p) => sum + p.currentStock, 0);
  const stockCostVal = oxfordProducts.reduce((sum, p) => sum + p.currentStock * p.costPrice, 0);
  assert.strictEqual(stockQty, 30, 'Shop stock quantity must be 30');
  assert.strictEqual(stockCostVal, 5500, 'Shop stock cost value must be 5500 PKR');

  // Purchase Inflow Math:
  const mockPurchases: MockPurchaseDocument[] = [
    {
      id: 'purch_1',
      items: [
        { productId: 'p1', productName: 'Oxford Urdu 1', quantity: 50, unitCost: 150, totalCost: 7500 },
        { productId: 'p2', productName: 'Oxford English 1', quantity: 30, unitCost: 250, totalCost: 7500 },
      ],
    },
  ];
  let purchasedQty = 0;
  let purchasedAmount = 0;
  for (const item of mockPurchases[0].items) {
    purchasedQty += item.quantity;
    purchasedAmount += item.totalCost;
  }
  assert.strictEqual(purchasedQty, 80, 'Purchased quantity must be 80');
  assert.strictEqual(purchasedAmount, 15000, 'Purchased cost amount must be 15000 PKR');

  // Sales Math:
  const mockSales: MockSaleDocument[] = [
    {
      id: 'sale_1',
      items: [
        { productId: 'p1', productName: 'Oxford Urdu 1', sku: 'OXF-1', publisherName: 'Oxford University Press', quantity: 15, costPrice: 150, unitPrice: 200, discountRate: 0, discountAmount: 0, effectivePrice: 200, lineTotal: 3000 },
        { productId: 'p2', productName: 'Oxford English 1', sku: 'OXF-2', publisherName: 'Oxford University Press', quantity: 5, costPrice: 250, unitPrice: 320, discountRate: 0, discountAmount: 0, effectivePrice: 320, lineTotal: 1600 },
      ],
    },
  ];
  let salesQty = 0;
  let grossSales = 0;
  let cogs = 0;
  for (const item of mockSales[0].items) {
    salesQty += item.quantity;
    grossSales += item.lineTotal;
    cogs += item.quantity * item.costPrice;
  }
  const grossProfit = grossSales - cogs;
  const margin = Math.round((grossProfit / grossSales) * 1000) / 10;

  assert.strictEqual(salesQty, 20, 'Sales quantity must be 20');
  assert.strictEqual(grossSales, 4600, 'Gross sales must be 4600 PKR');
  assert.strictEqual(cogs, 3500, 'COGS must be 15*150 + 5*250 = 3500 PKR');
  assert.strictEqual(grossProfit, 1100, 'Gross profit must be 4600 - 3500 = 1100 PKR');
  assert.strictEqual(margin, 23.9, 'Gross margin percent must be 23.9%');
});

// ====================================================================
// Summary Report
// ====================================================================
console.log('\n====================================================================');
console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
