import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ====================================================================
// SADIQ BOOK AGENCY — THERMAL RECEIPT 7-COLUMN FORMAT VERIFICATION
// ====================================================================

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — THERMAL RECEIPT 7-COLUMN FORMAT VERIFICATION');
console.log('====================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(testNumber: number, name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] Test ${testNumber}: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] Test ${testNumber}: ${name}`);
    console.error(`         Error: ${err.message}`);
    failedTests++;
  }
}

const a4ModalPath = path.resolve('src/components/pos/A4InvoiceModal.tsx');
assert.ok(fs.existsSync(a4ModalPath), 'A4InvoiceModal.tsx must exist');
const a4ModalContent = fs.readFileSync(a4ModalPath, 'utf8');

const thermalStart = a4ModalContent.indexOf('id="thermal-receipt-sheet"');
const thermalEnd = a4ModalContent.indexOf('id="a4-invoice-sheet"');
assert.ok(thermalStart !== -1 && thermalEnd !== -1, 'Thermal receipt section must exist');
const thermalSection = a4ModalContent.substring(thermalStart, thermalEnd);

// -----------------------------------------------------------------------------
// Test 1: Verify all 7 requested column headers are in thermal receipt table
// (S No, Item Description, Class, Qty, MRP Price, Sale Price, Total Price)
// -----------------------------------------------------------------------------
runTest(1, 'Thermal table includes all 7 requested column headers', () => {
  assert.ok(thermalSection.includes('S#') || thermalSection.includes('S.No'), 'Must include SNo column');
  assert.ok(thermalSection.includes('Item Description'), 'Must include Item Description column');
  assert.ok(thermalSection.includes('Class'), 'Must include Class column');
  assert.ok(thermalSection.includes('Qty'), 'Must include Qty column');
  assert.ok(thermalSection.includes('MRP Price'), 'Must include MRP Price column');
  assert.ok(thermalSection.includes('Sale Price'), 'Must include Sale Price column');
  assert.ok(thermalSection.includes('Total Price'), 'Must include Total Price column');
});

// -----------------------------------------------------------------------------
// Test 2: Verify Item Description includes Publisher and Series snapshots
// -----------------------------------------------------------------------------
runTest(2, 'Item Description displays Publisher and Series alongside item name', () => {
  assert.ok(
    thermalSection.includes('item.publisherName') &&
      thermalSection.includes('item.seriesName'),
    'Must display item publisherName and seriesName'
  );
  assert.ok(
    thermalSection.includes('publisherSeries'),
    'Must compute formatted publisherSeries string'
  );
  assert.ok(
    thermalSection.includes('thermal-item-subtext'),
    'Must render publisher and series with dedicated subtext class'
  );
});

// -----------------------------------------------------------------------------
// Test 3: Verify Class column displays academic target class
// -----------------------------------------------------------------------------
runTest(3, 'Class column displays academic target class (or fallback to className/—)', () => {
  assert.ok(
    thermalSection.includes('item.targetClass') &&
      thermalSection.includes('itemClass'),
    'Must read targetClass and format itemClass'
  );
});

// -----------------------------------------------------------------------------
// Test 4: Verify MRP Price and Sale Price computation
// -----------------------------------------------------------------------------
runTest(4, 'MRP Price and Sale Price are properly calculated and displayed', () => {
  assert.ok(
    thermalSection.includes('const mrp = item.unitPrice ?? item.mrp ?? 0;'),
    'Must extract MRP from item.unitPrice or item.mrp'
  );
  assert.ok(
    thermalSection.includes('const salePrice ='),
    'Must compute effective salePrice'
  );
  assert.ok(
    thermalSection.includes('mrp.toFixed(2)') || thermalSection.includes('mrp > 0 ? mrp.toFixed(2)'),
    'Must format MRP price with 2 decimal places'
  );
  assert.ok(
    thermalSection.includes('salePrice.toFixed(2)'),
    'Must format sale price with 2 decimal places'
  );
  assert.ok(
    thermalSection.includes('item.lineTotal.toFixed(2)'),
    'Must format Total Price with 2 decimal places'
  );
});

// -----------------------------------------------------------------------------
// Test 5: Verify pure black color compliance (no faint text-slate-* in thermal)
// -----------------------------------------------------------------------------
runTest(5, 'Thermal section strictly uses pure solid text-black (no faint text-slate)', () => {
  assert.ok(
    !thermalSection.includes('text-slate-'),
    'Thermal section must not contain faint text-slate classes for physical thermal readability'
  );
});

// -----------------------------------------------------------------------------
// Test 6: Verify print CSS rules for 80mm thermal table and subtext
// -----------------------------------------------------------------------------
runTest(6, 'Print CSS specifies compact font-size and padding for 80mm continuous roll', () => {
  assert.ok(
    a4ModalContent.includes('#thermal-receipt-sheet table'),
    'Must define specific print styles for #thermal-receipt-sheet table'
  );
  assert.ok(
    a4ModalContent.includes('#thermal-receipt-sheet .thermal-item-subtext'),
    'Must define specific print styles for .thermal-item-subtext'
  );
  assert.ok(
    a4ModalContent.includes('size: 80mm auto;'),
    'Must define 80mm auto page size for thermal printer roll'
  );
});

// -----------------------------------------------------------------------------
// Test 7: Verify A4 section remains completely intact and unmodified
// -----------------------------------------------------------------------------
runTest(7, 'A4 Invoice section remains completely intact with 7 columns', () => {
  const a4Section = a4ModalContent.substring(thermalEnd);
  assert.ok(a4Section.includes('id="a4-invoice-sheet"'), 'A4 invoice sheet exists');
  assert.ok(a4Section.includes('Book Title / Description'), 'A4 Book Title / Description header preserved');
  assert.ok(a4Section.includes('Publisher, Series, Class'), 'A4 Publisher, Series, Class header preserved');
  assert.ok(a4Section.includes('MRP Rate (PKR)'), 'A4 MRP Rate (PKR) preserved');
  assert.ok(a4Section.includes('Discount Price'), 'A4 Discount Price preserved');
  assert.ok(a4Section.includes('Total Amount (PKR)'), 'A4 Total Amount (PKR) preserved');
});

// -----------------------------------------------------------------------------
// Test 8: Verify intense dark black styling for thermal item description
// -----------------------------------------------------------------------------
runTest(8, 'Thermal item description uses intense bold and pure black font weight', () => {
  assert.ok(
    thermalSection.includes('thermal-item-title font-black text-black'),
    'Item title must be font-black text-black for maximum thermal darkness'
  );
  assert.ok(
    thermalSection.includes('thermal-item-subtext text-[9px] text-black font-black'),
    'Publisher and series subtext must be font-black text-black'
  );
  assert.ok(
    a4ModalContent.includes('#thermal-receipt-sheet .thermal-item-subtext {\n            font-size: 8.5px !important;\n            font-weight: 900 !important;'),
    'Print stylesheet must enforce font-weight 900 on .thermal-item-subtext'
  );
});

console.log('\n====================================================================');
console.log(` VERIFICATION SUMMARY: ${passedTests}/${passedTests + failedTests} PASSED (${failedTests} FAILED)`);
console.log('====================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

