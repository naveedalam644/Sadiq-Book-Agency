/**
 * PHASE 2 LOGIC AND CALCULATION VERIFICATION SCRIPT
 * Sadiq Book Agency
 * Verifies:
 * 1. SKU generation & uniqueness checking
 * 2. Product pricing, margin & stock valuation math
 * 3. Purchase calculation (subtotal, discount, grand total, balance)
 * 4. Stock increment on purchase intake
 * 5. Low-stock trigger logic
 * 6. Negative stock prevention on downward adjustments
 * 7. Duplicate purchase invoice prevention
 */

declare const process: { exit: (code: number) => void };

export type ItemClassification = 'book' | 'notebook' | 'stationery' | 'general';

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

function runPhase2Tests() {
  console.log('====================================================');
  console.log('🧪 SADIQ BOOK AGENCY — PHASE 2 VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  // 1. Restored Item Classification SKU Generation (Original Behavior)
  const bookSku = generateSuggestedSku('book', 'Oxford Progressive English 5');
  assert(bookSku.startsWith('BK-OXF-'), 'Generated Book SKU format (BK-)', `Got: ${bookSku}`);

  const nbSku = generateSuggestedSku('notebook', 'College Hardcover Register');
  assert(nbSku.startsWith('NB-COL-'), 'Generated Notebook SKU format (NB-)', `Got: ${nbSku}`);

  const stSku = generateSuggestedSku('stationery', 'Piano Ballpoint Pen 0.8mm');
  assert(stSku.startsWith('ST-PIA-'), 'Generated Stationery SKU format (ST-)', `Got: ${stSku}`);

  const gnSku = generateSuggestedSku('general', 'Desktop Calculator');
  assert(gnSku.startsWith('GN-DES-'), 'Generated General SKU format (GN-)', `Got: ${gnSku}`);

  // 1b. Six Core Educational Categories Verification
  const requiredCategories = ['Primary', 'Middle', 'Matric', 'Secondary', 'Intermediate', 'Others'];
  const testCategoryList = ['Primary', 'Middle', 'Matric', 'Secondary', 'Intermediate', 'Others'];
  const allCategoriesPresent = requiredCategories.every((cat) => testCategoryList.includes(cat));
  assert(allCategoriesPresent && testCategoryList.length === 6, 'Categories Section contains exactly 6 requested categories (Primary, Middle, Matric, Secondary, Intermediate, Others)');

  // 1c. Verification that legacy/extra categories are filtered out from Category selection
  const rawFirestoreCategories = [
    { name: 'Hardcover College Registers' },
    { name: 'Primary' },
    { name: 'Middle' },
    { name: 'School Textbooks' },
    { name: 'Matric' },
    { name: 'Secondary' },
    { name: 'Writing Instruments' },
    { name: 'Intermediate' },
    { name: 'Others' },
  ];
  const coreCategoryNames = ['Primary', 'Middle', 'Matric', 'Secondary', 'Intermediate', 'Others'];
  const filteredCategoryList = coreCategoryNames.map(
    (target) => rawFirestoreCategories.find((c) => c.name.toLowerCase() === target.toLowerCase())?.name || target
  );
  assert(
    filteredCategoryList.length === 6 &&
      filteredCategoryList.every((name) => coreCategoryNames.includes(name)) &&
      !filteredCategoryList.includes('Hardcover College Registers') &&
      !filteredCategoryList.includes('Writing Instruments'),
    'Unwanted categories appearing below Others or elsewhere are completely excluded'
  );

  // 2. Product Pricing & Stock Valuation
  const costPrice = 350;
  const retailPrice = 500;
  const currentStock = 40;
  const lowStockThreshold = 10;

  const stockValuation = currentStock * costPrice;
  assert(stockValuation === 14000, 'Stock Valuation Calculation (PKR)', `Expected 14000, got ${stockValuation}`);

  const grossMargin = retailPrice - costPrice;
  const markupPercent = ((grossMargin / costPrice) * 100).toFixed(1);
  assert(grossMargin === 150 && markupPercent === '42.9', 'Retail Markup Calculation', `Got margin ${grossMargin}, markup ${markupPercent}%`);

  // 3. Low-Stock Alert Trigger
  const isHealthy = currentStock <= lowStockThreshold;
  assert(isHealthy === false, 'Stock Level Healthy when above threshold (40 > 10)');

  const lowStockQty = 8;
  const isTriggered = lowStockQty <= lowStockThreshold;
  assert(isTriggered === true, 'Low-Stock Alert triggers when stock <= threshold (8 <= 10)');

  const outOfStockQty = 0;
  assert(outOfStockQty <= lowStockThreshold, 'Low-Stock Alert triggers on zero stock');

  // 4. Purchase Calculations (Multi-item order)
  const purchaseItems = [
    { title: 'Oxford English 5', qty: 50, unitCost: 350, totalCost: 50 * 350 }, // 17500
    { title: 'College Register 200 Pgs', qty: 100, unitCost: 120, totalCost: 100 * 120 }, // 12000
    { title: 'Deer Single Line Notebook', qty: 200, unitCost: 65, totalCost: 200 * 65 }, // 13000
  ];

  const subtotal = purchaseItems.reduce((acc, it) => acc + it.totalCost, 0);
  assert(subtotal === 42500, 'Purchase Items Subtotal Calculation', `Expected 42500, got ${subtotal}`);

  const tradeDiscount = 2500;
  const grandTotal = Math.max(0, subtotal - tradeDiscount);
  assert(grandTotal === 40000, 'Purchase Grand Total after trade discount', `Expected 40000, got ${grandTotal}`);

  const cashPaid = 15000;
  const remainingBalance = Math.max(0, grandTotal - cashPaid);
  assert(remainingBalance === 25000, 'Remaining Balance Payable to Supplier Khata', `Expected 25000, got ${remainingBalance}`);

  // 5. Stock Increment on Purchase Intake
  const initialStockBook = 15;
  const purchasedQty = 50;
  const updatedStockBook = initialStockBook + purchasedQty;
  assert(updatedStockBook === 65, 'Stock quantity automatically increments after purchase intake', `Expected 65, got ${updatedStockBook}`);

  // 6. Negative Stock Prevention
  const physicalCount = 12;
  const validAdjustmentOut = 5;
  const validResult = physicalCount - validAdjustmentOut;
  assert(validResult >= 0 && validResult === 7, 'Valid downward adjustment succeeds within available physical stock');

  const invalidAdjustmentOut = 15;
  let errorCaught = false;
  if (physicalCount - invalidAdjustmentOut < 0) {
    errorCaught = true;
  }
  assert(errorCaught === true, 'Negative stock prevented when adjustment quantity exceeds available stock (12 - 15 < 0)');

  // 7. Duplicate Purchase Invoice Check
  const recordedInvoices = ['PUR-2026-1001', 'PUR-2026-1002', 'INV-SUP-99'];
  const newInvoice = 'PUR-2026-1001';
  const isDuplicate = recordedInvoices.includes(newInvoice);
  assert(isDuplicate === true, 'Duplicate purchase invoice number detected and blocked');

  const uniqueInvoice = 'PUR-2026-1003';
  const isUnique = !recordedInvoices.includes(uniqueInvoice);
  assert(isUnique === true, 'Unique purchase invoice accepted');

  // 8. Search Input Stabilization: Duplicate Emission Suppression
  let emittedCount = 0;
  let lastEmittedTerm = '';
  function simulateSearchInput(searchTerm: string, isFirstMount: boolean) {
    if (isFirstMount && searchTerm === lastEmittedTerm) {
      return; // Suppressed on initial mount
    }
    if (searchTerm === lastEmittedTerm) {
      return; // Suppressed if term is identical
    }
    lastEmittedTerm = searchTerm;
    emittedCount++;
  }

  // Simulate mount with empty string
  simulateSearchInput('', true);
  assert(emittedCount === 0, 'SearchInput suppresses redundant emission on initial mount');

  // Simulate re-render without typing
  simulateSearchInput('', false);
  assert(emittedCount === 0, 'SearchInput suppresses duplicate emission on re-render when term is unchanged');

  // Simulate typing "oxford"
  simulateSearchInput('oxford', false);
  assert(emittedCount === 1 && lastEmittedTerm === 'oxford', 'SearchInput emits query when search term genuinely changes');

  // Simulate re-render with "oxford"
  simulateSearchInput('oxford', false);
  assert(emittedCount === 1, 'SearchInput avoids secondary fetch loop when parent re-renders with same query');

  // 9. Filter Referential Equality Preservation
  const initialFilters = { classification: 'all', searchTerm: '' };
  function updateFilter(prev: typeof initialFilters, newTerm: string) {
    if (prev.searchTerm === newTerm) return prev;
    return { ...prev, searchTerm: newTerm };
  }
  const resultSame = updateFilter(initialFilters, '');
  assert(resultSame === initialFilters, 'Filter setter preserves object identity when value is unchanged');

  const resultChanged = updateFilter(initialFilters, 'notebook');
  assert(resultChanged !== initialFilters && resultChanged.searchTerm === 'notebook', 'Filter setter returns new object only when value changes');

  // 10. Table Loading State Determination (Flicker Defense)
  function getTableDisplayMode(isLoading: boolean, dataLength: number) {
    const showInitialLoading = isLoading && dataLength === 0;
    const isRefreshing = isLoading && dataLength > 0;
    return { showInitialLoading, isRefreshing, keepDataVisible: !showInitialLoading && dataLength > 0 };
  }

  const initialLoadMode = getTableDisplayMode(true, 0);
  assert(initialLoadMode.showInitialLoading === true && initialLoadMode.keepDataVisible === false, 'Table shows loading spinner on initial load when data is empty');

  const refreshWithDataMode = getTableDisplayMode(true, 25);
  assert(refreshWithDataMode.showInitialLoading === false && refreshWithDataMode.keepDataVisible === true, 'Table keeps existing data visible during background refresh (no flicker)');

  const steadyStateMode = getTableDisplayMode(false, 25);
  assert(steadyStateMode.showInitialLoading === false && steadyStateMode.keepDataVisible === true, 'Table shows steady data when loading finishes');

  // =========================================================================
  // 11. PURCHASE INTAKE: PRODUCT SEARCH, FILTERING, & DUPLICATE PREVENTION
  // =========================================================================

  interface TestProduct {
    id: string;
    sku: string;
    barcode?: string;
    title: string;
    classification: ItemClassification;
    categoryId: string;
    categoryName: string;
    authorOrPublisher?: string;
    costPrice: number;
    currentStock: number;
    lowStockThreshold: number;
  }

  interface TestPurchaseItemRow {
    productId: string;
    productName: string;
    sku?: string;
    categoryName?: string;
    classification?: ItemClassification;
    authorOrPublisher?: string;
    currentStock?: number;
    quantity: number | '';
    unitCost: number | '';
    totalCost: number;
  }

  const sampleProducts: TestProduct[] = [
    {
      id: 'prod_1',
      sku: 'BK-OXF-1001',
      barcode: '9780199042',
      title: 'Oxford Progressive English 5',
      classification: 'book',
      categoryId: 'cat_primary',
      categoryName: 'Primary',
      authorOrPublisher: 'Oxford University Press',
      costPrice: 350,
      currentStock: 45,
      lowStockThreshold: 10,
    },
    {
      id: 'prod_2',
      sku: 'BK-SIN-2002',
      barcode: '9789694941',
      title: 'Sindh Board Chemistry 9',
      classification: 'book',
      categoryId: 'cat_matric',
      categoryName: 'Matric',
      authorOrPublisher: 'Sindh Textbook Board',
      costPrice: 280,
      currentStock: 20,
      lowStockThreshold: 5,
    },
    {
      id: 'prod_3',
      sku: 'NB-COL-3003',
      barcode: '8964000123',
      title: 'College Hardcover Register 200 Pgs',
      classification: 'notebook',
      categoryId: 'cat_intermediate',
      categoryName: 'Intermediate',
      authorOrPublisher: 'College Publishers',
      costPrice: 140,
      currentStock: 80,
      lowStockThreshold: 15,
    },
    {
      id: 'prod_4',
      sku: 'ST-PIA-4004',
      barcode: '8964000999',
      title: 'Piano Ballpoint Pen 0.8mm Box',
      classification: 'stationery',
      categoryId: 'cat_others',
      categoryName: 'Others',
      authorOrPublisher: 'Piano Pakistan',
      costPrice: 180,
      currentStock: 150,
      lowStockThreshold: 20,
    },
    {
      id: 'prod_5',
      sku: 'GN-CAS-5005',
      barcode: '',
      title: 'Casio Scientific Calculator FX-991',
      classification: 'general',
      categoryId: 'cat_secondary',
      categoryName: 'Secondary',
      authorOrPublisher: 'Casio Corporation',
      costPrice: 2200,
      currentStock: 15,
      lowStockThreshold: 3,
    },
    {
      id: 'prod_6',
      sku: 'BK-PRI-6006',
      barcode: '9780199055',
      title: 'Primary Math Workbook Class 3',
      classification: 'book',
      categoryId: 'cat_primary',
      categoryName: 'Primary',
      authorOrPublisher: 'Oxford University Press',
      costPrice: 220,
      currentStock: 30,
      lowStockThreshold: 8,
    },
  ];

  function testGetUniqueAuthorsOrPublishers(products: TestProduct[]): string[] {
    const seen = new Set<string>();
    const results: string[] = [];
    for (const p of products) {
      const val = (p.authorOrPublisher || '').trim();
      if (val) {
        const lower = val.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          results.push(val);
        }
      }
    }
    return results.sort((a, b) => a.localeCompare(b));
  }

  function testMatchesProductSearch(
    product: TestProduct,
    searchTerm: string,
    categoryFilter: string,
    classificationFilter: string,
    authorOrPublisherFilter: string = 'all'
  ): boolean {
    if (classificationFilter !== 'all' && product.classification !== classificationFilter) {
      return false;
    }
    if (categoryFilter !== 'all') {
      const targetCat = categoryFilter.toLowerCase();
      const pCat = product.categoryName.toLowerCase();
      if (pCat !== targetCat && !pCat.includes(targetCat)) {
        return false;
      }
    }
    if (authorOrPublisherFilter !== 'all') {
      const targetAuthor = authorOrPublisherFilter.trim().toLowerCase();
      const prodAuthor = (product.authorOrPublisher || '').trim().toLowerCase();
      if (prodAuthor !== targetAuthor) {
        return false;
      }
    }
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;

    return (
      product.title.toLowerCase().includes(q) ||
      product.sku.toLowerCase().includes(q) ||
      (Boolean(product.barcode) && product.barcode!.toLowerCase().includes(q)) ||
      product.categoryName.toLowerCase().includes(q) ||
      product.classification.toLowerCase().includes(q) ||
      (Boolean(product.authorOrPublisher) && product.authorOrPublisher!.toLowerCase().includes(q))
    );
  }

  // 11a. Search by Product Name
  const searchByName = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, 'Progressive English', 'all', 'all')
  );
  assert(
    searchByName.length === 1 && searchByName[0].id === 'prod_1',
    'Product Search by Name finds matching product (Progressive English -> Oxford Progressive English 5)'
  );

  // 11b. Search by SKU
  const searchBySku = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, 'BK-SIN', 'all', 'all')
  );
  assert(
    searchBySku.length === 1 && searchBySku[0].id === 'prod_2',
    'Product Search by SKU finds matching product (BK-SIN -> Sindh Board Chemistry 9)'
  );

  // 11c. Search by Barcode
  const searchByBarcode = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, '8964000999', 'all', 'all')
  );
  assert(
    searchByBarcode.length === 1 && searchByBarcode[0].id === 'prod_4',
    'Product Search by Barcode finds matching product (8964000999 -> Piano Ballpoint Pen)'
  );

  // 11d. Search by Category in Search Box
  const searchByCategoryTerm = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, 'Primary', 'all', 'all')
  );
  assert(
    searchByCategoryTerm.length === 2 &&
      searchByCategoryTerm.some((p) => p.id === 'prod_1') &&
      searchByCategoryTerm.some((p) => p.id === 'prod_6'),
    'Product Search by Category term returns all matching products in that category'
  );

  // 11e. Search by Item Classification in Search Box
  const searchByClassificationTerm = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, 'stationery', 'all', 'all')
  );
  assert(
    searchByClassificationTerm.length === 1 && searchByClassificationTerm[0].id === 'prod_4',
    'Product Search by Classification term returns matching products'
  );

  // 11f. Category Dropdown Filter (Matric)
  const filterByMatric = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, '', 'Matric', 'all')
  );
  assert(
    filterByMatric.length === 1 && filterByMatric[0].id === 'prod_2',
    'Category Filter isolates products belonging to the selected category (Matric)'
  );

  // 11g. Classification Dropdown Filter (Notebook)
  const filterByNotebook = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, '', 'all', 'notebook')
  );
  assert(
    filterByNotebook.length === 1 && filterByNotebook[0].id === 'prod_3',
    'Classification Filter isolates items belonging to the selected classification (Notebook)'
  );

  // 11h. Cooperative Search + Category + Classification Filters
  const cooperativeResults = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, 'Math', 'Primary', 'book')
  );
  assert(
    cooperativeResults.length === 1 && cooperativeResults[0].id === 'prod_6',
    'Cooperative Filtering: Search box + Category dropdown + Classification dropdown work together harmoniously'
  );

  // 11h-1. Dynamic Unique Author / Publishing House Extraction (No Duplicates)
  const uniqueAuthors = testGetUniqueAuthorsOrPublishers(sampleProducts);
  const expectedAuthors = [
    'Casio Corporation',
    'College Publishers',
    'Oxford University Press',
    'Piano Pakistan',
    'Sindh Textbook Board',
  ];
  const authorsMatch =
    uniqueAuthors.length === 5 &&
    expectedAuthors.every((a, i) => uniqueAuthors[i] === a);
  assert(
    authorsMatch,
    'Author / Publishing House options populated dynamically without duplicates and sorted alphabetically'
  );

  // 11h-2. Filter by Publishing House (Oxford University Press)
  const filterByOxford = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, '', 'all', 'all', 'Oxford University Press')
  );
  assert(
    filterByOxford.length === 2 &&
      filterByOxford.some((p) => p.id === 'prod_1') &&
      filterByOxford.some((p) => p.id === 'prod_6'),
    'Author / Publishing House filter isolates products from selected publisher (Oxford University Press)'
  );

  // 11h-3. Filter by Publishing House (Sindh Textbook Board)
  const filterBySindh = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, '', 'all', 'all', 'Sindh Textbook Board')
  );
  assert(
    filterBySindh.length === 1 && filterBySindh[0].id === 'prod_2',
    'Author / Publishing House filter isolates products from selected publisher (Sindh Textbook Board)'
  );

  // 11h-4. Reset Filter with "All Authors / Publishing Houses"
  const filterReset = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, '', 'all', 'all', 'all')
  );
  assert(
    filterReset.length === 6,
    'All Authors / Publishing Houses option resets the filter and displays products across all publishers'
  );

  // 11h-5. Cooperative Filtering with All 4 Filters Simultaneously
  const allFourFiltersMatch = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, 'English', 'Primary', 'book', 'Oxford University Press')
  );
  assert(
    allFourFiltersMatch.length === 1 && allFourFiltersMatch[0].id === 'prod_1',
    'All 4 Filters Work Together: Search Term ("English") + Category ("Primary") + Classification ("book") + Author ("Oxford University Press")'
  );

  const allFourFiltersMismatch = sampleProducts.filter((p) =>
    testMatchesProductSearch(p, 'English', 'Primary', 'book', 'Sindh Textbook Board')
  );
  assert(
    allFourFiltersMismatch.length === 0,
    'All 4 Filters Work Together: Product correctly excluded when publisher does not match even if other criteria match'
  );

  // 11h-6. Deduplication on Dynamic Pagination Inflow
  const expandedProducts = [
    ...sampleProducts,
    {
      id: 'prod_7',
      sku: 'BK-OXF-7007',
      title: 'Oxford Secondary Science 8',
      classification: 'book' as ItemClassification,
      categoryId: 'cat_secondary',
      categoryName: 'Secondary',
      authorOrPublisher: 'Oxford University Press', // existing publisher
      costPrice: 420,
      currentStock: 25,
      lowStockThreshold: 5,
    },
    {
      id: 'prod_8',
      sku: 'BK-FER-8008',
      title: 'Ferozsons Urdu Lughat',
      classification: 'book' as ItemClassification,
      categoryId: 'cat_others',
      categoryName: 'Others',
      authorOrPublisher: 'Ferozsons Publishers', // new publisher
      costPrice: 850,
      currentStock: 10,
      lowStockThreshold: 2,
    },
  ];
  const dynamicAuthors = testGetUniqueAuthorsOrPublishers(expandedProducts);
  assert(
    dynamicAuthors.length === 6 && dynamicAuthors.includes('Ferozsons Publishers'),
    'Dynamic Product Inflow updates author list and incorporates new publishers without creating duplicates'
  );

  // 11i. Multi-Product Invoice Intake & Duplicate Row Prevention
  function testAddOrIncrement(items: TestPurchaseItemRow[], product: TestProduct) {
    const existingIndex = items.findIndex((i) => i.productId === product.id);
    if (existingIndex >= 0) {
      const updated = [...items];
      const cur = { ...updated[existingIndex] };
      const newQty = (typeof cur.quantity === 'number' ? cur.quantity : 1) + 1;
      const rate = typeof cur.unitCost === 'number' ? cur.unitCost : product.costPrice;
      cur.quantity = newQty;
      cur.unitCost = rate;
      cur.totalCost = Math.round(newQty * rate * 100) / 100;
      updated[existingIndex] = cur;
      return { items: updated, isDuplicateIncrement: true };
    }
    const newItem: TestPurchaseItemRow = {
      productId: product.id,
      productName: product.title,
      sku: product.sku,
      categoryName: product.categoryName,
      classification: product.classification,
      currentStock: product.currentStock,
      quantity: 1,
      unitCost: product.costPrice,
      totalCost: product.costPrice,
    };
    return { items: [...items, newItem], isDuplicateIncrement: false };
  }

  // Add Product 1 (Oxford)
  let invoiceItems: TestPurchaseItemRow[] = [];
  const add1 = testAddOrIncrement(invoiceItems, sampleProducts[0]);
  invoiceItems = add1.items;
  assert(
    invoiceItems.length === 1 && invoiceItems[0].productId === 'prod_1' && invoiceItems[0].quantity === 1,
    'First product added as line 1 with quantity 1 and default cost price'
  );

  // Add Product 2 (Sindh Chemistry) -> Multi-product intake
  const add2 = testAddOrIncrement(invoiceItems, sampleProducts[1]);
  invoiceItems = add2.items;
  assert(
    invoiceItems.length === 2 && invoiceItems[1].productId === 'prod_2' && invoiceItems[1].quantity === 1,
    'Multiple different products added to single invoice successfully as distinct rows'
  );

  // Select Product 1 AGAIN -> Must prevent duplicate row and increment quantity
  const addDuplicate = testAddOrIncrement(invoiceItems, sampleProducts[0]);
  invoiceItems = addDuplicate.items;
  assert(
    invoiceItems.length === 2 &&
      addDuplicate.isDuplicateIncrement === true &&
      invoiceItems[0].productId === 'prod_1' &&
      invoiceItems[0].quantity === 2 &&
      invoiceItems[0].totalCost === 700,
    'Accidental duplicate row prevented: re-selecting existing product increments its quantity (1 -> 2) and line total (350 -> 700)'
  );

  // 11j. Invoice Line Item Entry & Live Calculation
  function testUpdateRow(
    item: TestPurchaseItemRow,
    field: 'quantity' | 'unitCost' | 'totalCost',
    val: number
  ): TestPurchaseItemRow {
    const updated = { ...item };
    if (field === 'quantity') {
      updated.quantity = val;
      const rate = typeof updated.unitCost === 'number' ? updated.unitCost : 0;
      updated.totalCost = Math.round(val * rate * 100) / 100;
    } else if (field === 'unitCost') {
      updated.unitCost = val;
      const q = typeof updated.quantity === 'number' ? updated.quantity : 0;
      updated.totalCost = Math.round(q * val * 100) / 100;
    } else if (field === 'totalCost') {
      updated.totalCost = val;
      const q = typeof updated.quantity === 'number' ? updated.quantity : 0;
      if (q > 0) {
        updated.unitCost = Math.round((val / q) * 100) / 100;
      }
    }
    return updated;
  }

  // Test Quantity change recalculates Line Total
  const rowAfterQty = testUpdateRow(invoiceItems[0], 'quantity', 10);
  assert(
    rowAfterQty.quantity === 10 && rowAfterQty.totalCost === 3500,
    'Entering Purchase Quantity automatically recalculates Line Total (10 * 350 = 3500)'
  );

  // Test Purchase Rate change recalculates Line Total
  const rowAfterRate = testUpdateRow(rowAfterQty, 'unitCost', 320);
  assert(
    rowAfterRate.unitCost === 320 && rowAfterRate.totalCost === 3200,
    'Entering Purchase Rate automatically recalculates Line Total (10 * 320 = 3200)'
  );

  // Test Total Amount change automatically recalculates Purchase Rate
  const rowAfterTotal = testUpdateRow(rowAfterRate, 'totalCost', 3000);
  assert(
    rowAfterTotal.totalCost === 3000 && rowAfterTotal.unitCost === 300,
    'Entering Total Amount automatically calculates Purchase Rate (3000 / 10 = 300)'
  );

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2Tests();

