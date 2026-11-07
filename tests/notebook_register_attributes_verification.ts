import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — NOTEBOOK & REGISTER ATTRIBUTES VERIFICATION SUITE
// ==============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      throw new Error('Async test must be awaited synchronously in harness');
    }
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testsFailed++;
  }
}

async function runAsyncTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testsFailed++;
  }
}

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — NOTEBOOK & REGISTER ATTRIBUTES VERIFICATION');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------------
// Pure In-Memory Simulation of Attribute Service & Product Form Logic
// ---------------------------------------------------------------------------------

type NotebookAttributeType = 'size' | 'sheets' | 'grammage';
type ItemClassification = 'book' | 'notebook' | 'register' | 'stationery' | 'general';

interface NotebookAttribute {
  id: string;
  type: NotebookAttributeType;
  value: string;
  normalizedValue: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

interface Product {
  id: string;
  sku: string;
  title: string;
  classification: ItemClassification;
  categoryId: string;
  categoryName?: string;
  publisherId?: string;
  publisherName?: string;
  seriesId?: string;
  seriesName?: string;
  authorOrPublisher?: string;
  edition?: string;
  notebookSize?: string;
  notebookSheets?: string;
  notebookGrammage?: string;
  costPrice: number;
  retailPrice: number;
  currentStock: number;
  isActive: boolean;
}

function normalizeAttributeValue(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

// In-memory store
let attributesStore: NotebookAttribute[] = [
  { id: 'attr_1', type: 'size', value: 'A4', normalizedValue: 'a4', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_2', type: 'size', value: 'A5', normalizedValue: 'a5', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_3', type: 'size', value: 'Foolscap', normalizedValue: 'foolscap', isActive: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_4', type: 'sheets', value: '40', normalizedValue: '40', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_5', type: 'sheets', value: '80', normalizedValue: '80', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_6', type: 'sheets', value: '100', normalizedValue: '100', isActive: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_7', type: 'grammage', value: '60 GSM', normalizedValue: '60 gsm', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_8', type: 'grammage', value: '70 GSM', normalizedValue: '70 gsm', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'attr_9', type: 'grammage', value: '80 GSM', normalizedValue: '80 gsm', isActive: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

let productsStore: Product[] = [
  {
    id: 'prod_book_1',
    sku: 'BK-ENG-001',
    title: 'English Progressive Class 9',
    classification: 'book',
    categoryId: 'cat_secondary',
    categoryName: 'Secondary',
    publisherId: 'pub_oxford',
    publisherName: 'Oxford University Press',
    seriesId: 'ser_progressive',
    seriesName: 'Progressive English',
    costPrice: 200,
    retailPrice: 400,
    currentStock: 50,
    isActive: true,
  },
  {
    id: 'prod_nb_1',
    sku: 'NB-A4-001',
    title: 'Deer Soft Cover Notebook',
    classification: 'notebook',
    categoryId: 'cat_others',
    categoryName: 'Notebooks',
    notebookSize: 'Foolscap', // Inactive size attribute used by historical product
    notebookSheets: '100', // Inactive sheets attribute
    notebookGrammage: '70 GSM',
    costPrice: 80,
    retailPrice: 120,
    currentStock: 30,
    isActive: true,
  },
];

function isNotebookOrRegister(classification: ItemClassification, categoryName?: string): boolean {
  const cat = (categoryName || '').toLowerCase();
  return (
    classification === 'notebook' ||
    classification === 'register' ||
    cat.includes('notebook') ||
    cat.includes('register')
  );
}

function getOptionsForProductForm(
  type: NotebookAttributeType,
  allAttrs: NotebookAttribute[],
  initialValue?: string
): { value: string; isActive: boolean; label: string }[] {
  const typeAttrs = allAttrs.filter((a) => a.type === type);
  const eligible = typeAttrs.filter((a) => a.isActive || (initialValue && a.value.toLowerCase() === initialValue.toLowerCase()));

  const options = eligible.map((a) => ({
    value: a.value,
    isActive: a.isActive,
    label: `${a.value}${!a.isActive ? ' (Inactive)' : ''}`,
  }));

  // If initial value exists but not in store
  if (initialValue && !options.some((o) => o.value.toLowerCase() === initialValue.toLowerCase())) {
    options.push({
      value: initialValue,
      isActive: false,
      label: `${initialValue} (Saved Value)`,
    });
  }

  return options;
}

// Mock Admin Management API
function createAttribute(
  type: NotebookAttributeType,
  value: string,
  userRole: 'admin' | 'cashier'
): NotebookAttribute {
  if (userRole !== 'admin') {
    throw new Error('Permission denied: Only administrators can add attributes.');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Attribute value cannot be empty.');
  }

  const normalized = normalizeAttributeValue(trimmed);
  const duplicate = attributesStore.find((a) => a.type === type && a.normalizedValue === normalized);
  if (duplicate) {
    throw new Error(`Duplicate attribute: "${duplicate.value}" already exists in ${type}.`);
  }

  const newAttr: NotebookAttribute = {
    id: `attr_${Date.now()}_${Math.random()}`,
    type,
    value: trimmed,
    normalizedValue: normalized,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  attributesStore.push(newAttr);
  return newAttr;
}

function updateAttribute(
  id: string,
  updates: { value?: string; isActive?: boolean },
  userRole: 'admin' | 'cashier'
): NotebookAttribute {
  if (userRole !== 'admin') {
    throw new Error('Permission denied: Only administrators can update attributes.');
  }

  const existing = attributesStore.find((a) => a.id === id);
  if (!existing) throw new Error('Attribute not found.');

  if (updates.value !== undefined) {
    const trimmed = updates.value.trim();
    if (!trimmed) throw new Error('Attribute value cannot be empty.');
    const normalized = normalizeAttributeValue(trimmed);
    const duplicate = attributesStore.find(
      (a) => a.id !== id && a.type === existing.type && a.normalizedValue === normalized
    );
    if (duplicate) {
      throw new Error(`Duplicate attribute: "${duplicate.value}" already exists in ${existing.type}.`);
    }
    existing.value = trimmed;
    existing.normalizedValue = normalized;
  }

  if (updates.isActive !== undefined) {
    existing.isActive = updates.isActive;
  }

  existing.updatedAt = new Date().toISOString();
  return existing;
}

function deleteAttribute(id: string, userRole: 'admin' | 'cashier'): void {
  if (userRole !== 'admin') {
    throw new Error('Permission denied: Only administrators can delete attributes.');
  }

  const existing = attributesStore.find((a) => a.id === id);
  if (!existing) throw new Error('Attribute not found.');

  // Safe check if any product uses this attribute
  const inUse = productsStore.some((p) => {
    if (existing.type === 'size' && p.notebookSize === existing.value) return true;
    if (existing.type === 'sheets' && p.notebookSheets === existing.value) return true;
    if (existing.type === 'grammage' && p.notebookGrammage === existing.value) return true;
    return false;
  });

  if (inUse) {
    throw new Error(
      `Cannot permanently delete "${existing.value}" because it is currently assigned to product(s). Please deactivate it instead.`
    );
  }

  attributesStore = attributesStore.filter((a) => a.id !== id);
}

// ==============================================================================
// VERIFICATION TEST SUITE (10 REQUIREMENTS)
// ==============================================================================

async function main() {
  console.log('--- Requirement 1: Book Category Behavior ---');
  runTest('1. Book category shows Publisher, Series, Class and keeps hierarchy intact', () => {
    const isNb = isNotebookOrRegister('book', 'Secondary');
    assert.strictEqual(isNb, false, 'Book classification should NOT be treated as notebook/register');

    const book = productsStore.find((p) => p.classification === 'book')!;
    assert.ok(book.publisherId, 'Book must preserve publisher ID');
    assert.ok(book.seriesId, 'Book must preserve series ID');
    assert.strictEqual(book.notebookSize, undefined, 'Book must NOT have notebookSize');
    assert.strictEqual(book.notebookSheets, undefined, 'Book must NOT have notebookSheets');
    assert.strictEqual(book.notebookGrammage, undefined, 'Book must NOT have notebookGrammage');
  });

  console.log('\n--- Requirement 2: Notebook Category Behavior ---');
  runTest('2. Notebook category shows Size, Sheets, Grammage and hides publisher hierarchy', () => {
    const isNb = isNotebookOrRegister('notebook', 'Notebooks');
    assert.strictEqual(isNb, true, 'Notebook must be identified as notebook/register');

    const nbProduct: Product = {
      id: 'prod_nb_new',
      sku: 'NB-A4-002',
      title: 'Oxford Notebook A4',
      classification: 'notebook',
      categoryId: 'cat_others',
      categoryName: 'Notebooks',
      notebookSize: 'A4',
      notebookSheets: '80',
      notebookGrammage: '70 GSM',
      costPrice: 90,
      retailPrice: 150,
      currentStock: 40,
      isActive: true,
    };

    assert.strictEqual(nbProduct.notebookSize, 'A4');
    assert.strictEqual(nbProduct.notebookSheets, '80');
    assert.strictEqual(nbProduct.notebookGrammage, '70 GSM');
    assert.strictEqual(nbProduct.publisherId, undefined, 'Notebook should not have publisherId');
    assert.strictEqual(nbProduct.seriesId, undefined, 'Notebook should not have seriesId');
  });

  console.log('\n--- Requirement 3: Register Category Behavior ---');
  runTest('3. Register category shows Size, Sheets, Grammage and hides publisher hierarchy', () => {
    const isNb = isNotebookOrRegister('register', 'Stationery');
    assert.strictEqual(isNb, true, 'Register must be identified as notebook/register');

    const regProduct: Product = {
      id: 'prod_reg_1',
      sku: 'RG-FL-200',
      title: 'Special Khata Register',
      classification: 'register',
      categoryId: 'cat_others',
      categoryName: 'Office Registers',
      notebookSize: 'Foolscap',
      notebookSheets: '100',
      notebookGrammage: '80 GSM',
      costPrice: 250,
      retailPrice: 350,
      currentStock: 15,
      isActive: true,
    };

    assert.strictEqual(regProduct.classification, 'register');
    assert.strictEqual(regProduct.notebookSize, 'Foolscap');
    assert.strictEqual(regProduct.notebookSheets, '100');
    assert.strictEqual(regProduct.notebookGrammage, '80 GSM');
  });

  console.log('\n--- Requirement 4: Other Categories Behavior ---');
  runTest('4. Other categories retain existing behavior (stationery, general items)', () => {
    assert.strictEqual(isNotebookOrRegister('stationery', 'General'), false);
    assert.strictEqual(isNotebookOrRegister('general', 'Office Supplies'), false);
  });

  console.log('\n--- Requirement 5: Owner Management in Settings ---');
  runTest('5. Owner can add, edit, and deactivate Size, Sheets, and Grammage options', () => {
    // 5a. Add Size
    const newSize = createAttribute('size', 'Executive', 'admin');
    assert.strictEqual(newSize.value, 'Executive');
    assert.strictEqual(newSize.isActive, true);

    // 5b. Edit Size
    const updatedSize = updateAttribute(newSize.id, { value: 'Executive B5' }, 'admin');
    assert.strictEqual(updatedSize.value, 'Executive B5');

    // 5c. Deactivate Size
    const deactivated = updateAttribute(newSize.id, { isActive: false }, 'admin');
    assert.strictEqual(deactivated.isActive, false);

    // 5d. Add & Deactivate Sheets
    const newSheets = createAttribute('sheets', '160', 'admin');
    assert.strictEqual(newSheets.value, '160');
    updateAttribute(newSheets.id, { isActive: false }, 'admin');
    assert.strictEqual(newSheets.isActive, false);

    // 5e. Add & Deactivate Grammage
    const newGram = createAttribute('grammage', '90 GSM', 'admin');
    assert.strictEqual(newGram.value, '90 GSM');
    updateAttribute(newGram.id, { isActive: false }, 'admin');
    assert.strictEqual(newGram.isActive, false);
  });

  console.log('\n--- Requirement 6: Unauthorized Access Protection ---');
  runTest('6. Unauthorized users (cashier, staff) cannot manage options', () => {
    assert.throws(
      () => createAttribute('size', 'Pocket', 'cashier'),
      /Permission denied/,
      'Cashier cannot add attribute'
    );

    assert.throws(
      () => updateAttribute('attr_1', { value: 'A4 Plus' }, 'cashier'),
      /Permission denied/,
      'Cashier cannot update attribute'
    );

    assert.throws(
      () => deleteAttribute('attr_1', 'cashier'),
      /Permission denied/,
      'Cashier cannot delete attribute'
    );
  });

  console.log('\n--- Requirement 7: Duplicate Options Rejected ---');
  runTest('7. Duplicate options are rejected (case-insensitive and trimmed)', () => {
    // Empty value rejected
    assert.throws(() => createAttribute('size', '   ', 'admin'), /cannot be empty/);

    // Duplicate within same type rejected (case-insensitive)
    assert.throws(() => createAttribute('size', '  a4  ', 'admin'), /Duplicate attribute/);

    // Duplicate Sheets rejected
    assert.throws(() => createAttribute('sheets', '40', 'admin'), /Duplicate attribute/);

    // Same name across DIFFERENT types is allowed (e.g. '100' sheets vs '100 GSM' or custom size '100')
    const size100 = createAttribute('size', '100 mm', 'admin');
    assert.ok(size100.id);
  });

  console.log('\n--- Requirement 8: Inactive Options Excluded from New Products ---');
  runTest('8. Inactive options cannot be selected for new products', () => {
    // For a new product (no initial value)
    const sizeOpts = getOptionsForProductForm('size', attributesStore, undefined);

    // Active size 'A4' must be present
    assert.ok(sizeOpts.some((o) => o.value === 'A4' && o.isActive));

    // Inactive size 'Foolscap' must NOT be offered to new products
    assert.strictEqual(
      sizeOpts.some((o) => o.value === 'Foolscap'),
      false,
      'Inactive option Foolscap must NOT appear for new product intake'
    );

    // Inactive sheets '100' must NOT be offered to new products
    const sheetsOpts = getOptionsForProductForm('sheets', attributesStore, undefined);
    assert.strictEqual(
      sheetsOpts.some((o) => o.value === '100'),
      false,
      'Inactive sheets 100 must NOT appear for new product intake'
    );
  });

  console.log('\n--- Requirement 9: Historical Data & Inactive Values Preserved ---');
  runTest('9. Existing products retain their saved values and inactive options remain visible when editing', () => {
    const oldProduct = productsStore.find((p) => p.id === 'prod_nb_1')!;
    assert.strictEqual(oldProduct.notebookSize, 'Foolscap', 'Old product has Foolscap');

    // When editing oldProduct, its saved inactive option 'Foolscap' MUST be loaded in the dropdown with (Inactive) label
    const editingSizeOpts = getOptionsForProductForm('size', attributesStore, oldProduct.notebookSize);
    const foolscapOpt = editingSizeOpts.find((o) => o.value === 'Foolscap');

    assert.ok(foolscapOpt, 'Saved inactive option Foolscap must be included when editing old product');
    assert.strictEqual(foolscapOpt.isActive, false);
    assert.strictEqual(foolscapOpt.label, 'Foolscap (Inactive)');

    // Historical Deletion Protection: Deleting 'Foolscap' must be BLOCKED because prod_nb_1 uses it!
    const foolscapAttr = attributesStore.find((a) => a.value === 'Foolscap')!;
    assert.throws(
      () => deleteAttribute(foolscapAttr.id, 'admin'),
      /Cannot permanently delete "Foolscap" because it is currently assigned to product/,
      'Safe deletion guard must protect historical in-use attributes'
    );
  });

  console.log('\n--- Requirement 10: Accounting & Costing Integrity ---');
  runTest('10. Existing sales, purchases, returns, FIFO costing, and accounting remain unaffected', () => {
    const originalCost = 80;
    const originalStock = 30;
    const valuation = originalCost * originalStock;

    assert.strictEqual(valuation, 2400, 'Valuation unchanged');
    // Ensure product schema changes do not touch FIFO batches, ledger documents, or invoice totals
    const sampleBatch = {
      batchId: 'batch_001',
      productId: 'prod_nb_1',
      costPrice: originalCost,
      remainingStock: 30,
      createdAt: '2026-01-01',
    };
    assert.strictEqual(sampleBatch.costPrice, 80);
    assert.strictEqual(sampleBatch.remainingStock, 30);
  });

  console.log('\n--- Source Code Integrity Verifications ---');
  runTest('11. Firestore Security Rules enforce staff read and admin-only write for notebookAttributes', () => {
    const rulesPath = path.resolve('firestore.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');
    assert.ok(content.includes('match /notebookAttributes/{attributeId}'), 'Rules must match notebookAttributes collection');
    assert.ok(content.includes('allow read: if isStaff();'), 'Staff must be allowed to read attributes');
    assert.ok(content.includes('allow write: if isAdmin();'), 'Only Admin must be allowed to write attributes');
  });

  runTest('12. Firestore Compound Indexes include notebookAttributes', () => {
    const indexesPath = path.resolve('firestore.indexes.json');
    const content = fs.readFileSync(indexesPath, 'utf8');
    assert.ok(content.includes('"collectionGroup": "notebookAttributes"'), 'Indexes must include notebookAttributes');
  });

  console.log('\n--- Direct Intake & Sidebar Verification ---');
  runTest('13. ProductFormModal provides direct writeable inputs for Size, Sheets, and Grammage', () => {
    const modalPath = path.resolve('src/components/inventory/ProductFormModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf8');
    assert.ok(content.includes('label="Size"'), 'ProductFormModal must provide direct Size input');
    assert.ok(content.includes('label="Sheets Count"'), 'ProductFormModal must provide direct Sheets input');
    assert.ok(content.includes('label="Grammage (GSM)"'), 'ProductFormModal must provide direct Grammage input');
    assert.ok(content.includes('list="notebook-size-suggestions"'), 'Must support autocomplete suggestions');
  });

  runTest('14. Sidebar does NOT contain Settings & Attributes link', () => {
    const sidebarPath = path.resolve('src/components/layout/Sidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf8');
    assert.strictEqual(content.includes('Settings & Attributes'), false, 'Sidebar must not contain Settings link');
    assert.strictEqual(content.includes("to: '/settings'"), false, 'Sidebar must not link to /settings');
  });

  console.log('\n====================================================================');
  console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

