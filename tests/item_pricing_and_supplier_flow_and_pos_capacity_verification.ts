import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Starting Verification: Item Pricing, Supplier Flow, POS Capacity & Thermal Dark Print ---');

const productModalPath = path.resolve('src/components/inventory/ProductFormModal.tsx');
const purchaseModalPath = path.resolve('src/components/purchases/PurchaseFormModal.tsx');
const purchaseHelpersPath = path.resolve('src/utils/purchaseFormHelpers.ts');
const posCartHookPath = path.resolve('src/hooks/usePOSCart.ts');
const posPagePath = path.resolve('src/pages/POS.tsx');
const a4ModalPath = path.resolve('src/components/pos/A4InvoiceModal.tsx');

assert.ok(fs.existsSync(productModalPath), 'ProductFormModal.tsx must exist');
assert.ok(fs.existsSync(purchaseModalPath), 'PurchaseFormModal.tsx must exist');
assert.ok(fs.existsSync(purchaseHelpersPath), 'purchaseFormHelpers.ts must exist');
assert.ok(fs.existsSync(posCartHookPath), 'usePOSCart.ts must exist');
assert.ok(fs.existsSync(posPagePath), 'POS.tsx must exist');
assert.ok(fs.existsSync(a4ModalPath), 'A4InvoiceModal.tsx must exist');

const productModalContent = fs.readFileSync(productModalPath, 'utf8');
const purchaseModalContent = fs.readFileSync(purchaseModalPath, 'utf8');
const purchaseHelpersContent = fs.readFileSync(purchaseHelpersPath, 'utf8');
const posCartHookContent = fs.readFileSync(posCartHookPath, 'utf8');
const posPageContent = fs.readFileSync(posPagePath, 'utf8');
const a4ModalContent = fs.readFileSync(a4ModalPath, 'utf8');

// ============================================================================
// PART 1: Product Pricing Model (Books vs Notebooks / Stationery / Others)
// ============================================================================
console.log('\n--- Part 1: Product Pricing Model Verification ---');

// Test 1: Dynamic pricing form fields based on classification
console.log('Test 1: Verifying dynamic pricing form fields in ProductFormModal...');
assert.ok(
  productModalContent.includes("classification === 'book' ? (") &&
    productModalContent.includes('Book Pricing & Publisher Cost (PKR)'),
  'Must render MRP and Publisher Discount for Books'
);
assert.ok(
  productModalContent.includes('Item Pricing (Purchase Cost & Customer Sale Rates)') &&
    productModalContent.includes('Purchase Price (Cost) (PKR)'),
  'Must render direct Purchase Price (Cost) for Notebooks and other non-book items'
);
assert.ok(
  productModalContent.includes('Retail / Parchon Rate (PKR)') &&
    productModalContent.includes('Wholesale Rate (PKR)') &&
    productModalContent.includes('Market Shop Rate (PKR)'),
  'Must render customer sale rates (Parchon, Wholesale, Market Shop) for non-book items'
);
console.log('✓ Test 1 Passed: Dynamic pricing form fields verified.');

// Test 2: Payload construction uses direct purchase price and customer rates for non-books
console.log('Test 2: Verifying payload construction in ProductFormModal...');
assert.ok(
  productModalContent.includes('const numActualCost = isBook') &&
    productModalContent.includes('Number(costPrice) || 0'),
  'Cost price must be directly entered purchase price for non-books'
);
assert.ok(
  productModalContent.includes('marketShopPrice: finalMarketShop'),
  'Must save marketShopPrice in product payload'
);
console.log('✓ Test 2 Passed: Payload pricing construction verified.');

// ============================================================================
// PART 2: Supplier / Vendor Purchase Invoice Intake Flow
// ============================================================================
console.log('\n--- Part 2: Supplier / Vendor Invoice Intake Flow Verification ---');

// Test 3: PurchaseFormModal intake modes for Books vs Notebooks & Other Items
console.log('Test 3: Verifying PurchaseFormModal intake pathways...');
assert.ok(
  purchaseModalContent.includes("intakeMode === 'books'"),
  'Must support Books intake mode'
);
assert.ok(
  purchaseModalContent.includes("Book Intake (Publisher → Series → Class)") ||
    purchaseModalContent.includes("Book Intake (Publisher &rarr; Series &rarr; Class)"),
  'Must provide Book Intake pathway label (Publisher > Series > Class)'
);
assert.ok(
  purchaseModalContent.includes("Notebook & Other Items (Classification → Category)") ||
    purchaseModalContent.includes("Notebook & Other Items (Classification &rarr; Category)"),
  'Must provide Notebooks & Other Items pathway label (Classification > Category)'
);
console.log('✓ Test 3 Passed: Two distinct intake pathways present.');

// Test 4: Cascading Publisher > Series > Class in PurchaseFormModal
console.log('Test 4: Verifying cascading Publisher > Series > Class in Books intake...');
assert.ok(
  purchaseModalContent.includes('publisherFilter') &&
    purchaseModalContent.includes('seriesFilter') &&
    purchaseModalContent.includes('classFilter'),
  'Must provide state for publisher, series, and class in purchase intake'
);
assert.ok(
  purchaseHelpersContent.includes("value: 'register', label: 'Register'"),
  'ITEM_CLASSIFICATIONS must include register'
);
assert.ok(
  purchaseHelpersContent.includes('publisherFilter: string = \'all\'') &&
    purchaseHelpersContent.includes('seriesFilter: string = \'all\'') &&
    purchaseHelpersContent.includes('classFilter: string = \'all\''),
  'matchesProductSearch must support publisher, series, and class filtering'
);
console.log('✓ Test 4 Passed: Cascading hierarchy in purchase intake verified.');

// ============================================================================
// PART 3: POS Cart Item Capacity & Direct Sale Price Editing
// ============================================================================
console.log('\n--- Part 3: POS Cart Item Capacity & Direct Sale Price Editing ---');

// Test 5: usePOSCart updateItemPrice function
console.log('Test 5: Verifying updateItemPrice in usePOSCart...');
assert.ok(
  posCartHookContent.includes('const updateItemPrice = useCallback('),
  'usePOSCart must declare updateItemPrice'
);
assert.ok(
  posCartHookContent.includes('updateItemPrice,'),
  'usePOSCart must export updateItemPrice'
);
console.log('✓ Test 5 Passed: updateItemPrice exported from usePOSCart.');

// Test 6: POS.tsx cart row design and capacity
console.log('Test 6: Verifying POS.tsx compact cart rows & editable sale price...');
assert.ok(
  posPageContent.includes('updateItemPrice(item.productId, parseFloat(e.target.value) || 0)'),
  'POS cart row must provide direct inline editable Rate / Sale Price input'
);
assert.ok(
  posPageContent.includes('w-full lg:w-[480px] xl:w-[520px]') &&
    posPageContent.includes('min-h-[360px]'),
  'Cart panel must be optimized with ample width and height for high item capacity'
);
console.log('✓ Test 6 Passed: High-capacity cart row and inline sale price editing verified.');

// ============================================================================
// PART 4: Thermal Receipt Dark Black Print Output
// ============================================================================
console.log('\n--- Part 4: Thermal Receipt Dark Black Print Output ---');

// Test 7: Dark black colors and print styles
console.log('Test 7: Verifying dark black styling on thermal receipt...');
assert.ok(
  a4ModalContent.includes('style={{ boxSizing: \'border-box\', color: \'#000000\' }}'),
  'Thermal receipt root container must enforce #000000 color'
);
const thermalSection = a4ModalContent.substring(
  a4ModalContent.indexOf('id="thermal-receipt-sheet"'),
  a4ModalContent.indexOf('id="a4-invoice-sheet"')
);
assert.ok(
  !thermalSection.includes('text-slate-'),
  'Thermal receipt must not use faint text-slate-xxx colors'
);
assert.ok(
  a4ModalContent.includes('color: #000000 !important;') &&
    a4ModalContent.includes('-webkit-print-color-adjust: exact !important;'),
  'Print stylesheet must enforce pure solid #000000 and exact color rendering'
);
console.log('✓ Test 7 Passed: Dark black thermal receipt styling verified.');

// ============================================================================
// PART 5: High-Capacity Matching Products Drawer in Purchase Intake
// ============================================================================
console.log('\n--- Part 5: High-Capacity Matching Products Drawer Verification ---');

// Test 8: Modal size 2xl and Modal.tsx support
console.log('Test 8: Verifying Modal size 2xl and expansive dialog width...');
const modalComponentPath = path.resolve('src/components/common/Modal.tsx');
assert.ok(fs.existsSync(modalComponentPath), 'Modal.tsx must exist');
const modalComponentContent = fs.readFileSync(modalComponentPath, 'utf8');
assert.ok(
  modalComponentContent.includes("'2xl': 'max-w-6xl'"),
  'Modal component must support 2xl max-w-6xl'
);
assert.ok(
  purchaseModalContent.includes('size="2xl"'),
  'PurchaseFormModal must use size="2xl" for wide view'
);
console.log('✓ Test 8 Passed: Modal 2xl expansive container verified.');

// Test 9: Matching products height and expand view toggle
console.log('Test 9: Verifying matching products drawer height and expand toggle...');
assert.ok(
  !purchaseModalContent.includes('max-h-48'),
  'Cramped max-h-48 must be removed from matching products drawer'
);
assert.ok(
  purchaseModalContent.includes('max-h-[420px] sm:max-h-[480px]'),
  'Must provide standard high-capacity height of at least 420px-480px'
);
assert.ok(
  purchaseModalContent.includes('max-h-[620px]'),
  'Must provide expanded view height up to 620px'
);
assert.ok(
  purchaseModalContent.includes('isExpandedHeight') &&
    purchaseModalContent.includes('setIsExpandedHeight'),
  'Must provide expand view state and toggle'
);
assert.ok(
  purchaseModalContent.includes('Add All (') &&
    purchaseModalContent.includes('matchingProducts.forEach'),
  'Must provide quick Add All matching products shortcut'
);
console.log('✓ Test 9 Passed: High-capacity matching products drawer and toggle verified.');

console.log('\n=== ALL ITEM PRICING, SUPPLIER FLOW, POS CAPACITY & THERMAL TESTS PASSED! ===');
