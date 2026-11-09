import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Starting Dual Printer (Thermal Machine + A4 Standard) Verification ---');

const a4ModalPath = path.resolve('src/components/pos/A4InvoiceModal.tsx');
const thermalModalPath = path.resolve('src/components/pos/ThermalReceiptModal.tsx');

assert.ok(fs.existsSync(a4ModalPath), 'A4InvoiceModal.tsx must exist');
assert.ok(fs.existsSync(thermalModalPath), 'ThermalReceiptModal.tsx must exist');

const a4ModalContent = fs.readFileSync(a4ModalPath, 'utf8');
const thermalModalContent = fs.readFileSync(thermalModalPath, 'utf8');

// Test 1: Check paper size type includes 'thermal', 'A4', and 'A5'
console.log('Test 1: Verifying paper size type includes thermal, A4, and A5...');
assert.ok(
  a4ModalContent.includes("defaultPaperSize?: 'A4' | 'A5' | 'thermal'"),
  'A4InvoiceModalProps must support defaultPaperSize with thermal, A4, and A5'
);
assert.ok(
  a4ModalContent.includes("useState<'A4' | 'A5' | 'thermal'>"),
  'paperSize state must support thermal, A4, and A5'
);
console.log('✓ Test 1 Passed: Supported paper sizes confirmed.');

// Test 2: Check localStorage printer persistence
console.log('Test 2: Verifying localStorage persistence key...');
assert.ok(
  a4ModalContent.includes("const PRINTER_STORAGE_KEY = 'sba_pos_printer_type'"),
  'PRINTER_STORAGE_KEY must be defined for persistence'
);
assert.ok(
  a4ModalContent.includes("localStorage.getItem(PRINTER_STORAGE_KEY)"),
  'Must retrieve saved printer preference from localStorage'
);
assert.ok(
  a4ModalContent.includes("localStorage.setItem(PRINTER_STORAGE_KEY, size)"),
  'Must save selected printer preference to localStorage on click'
);
console.log('✓ Test 2 Passed: Printer preference persistence confirmed.');

// Test 3: Check UI switcher buttons
console.log('Test 3: Verifying UI buttons for Thermal (80mm) and A4 Standard...');
assert.ok(
  a4ModalContent.includes("handlePaperSizeChange('thermal')"),
  'Must have click handler to switch to thermal mode'
);
assert.ok(
  a4ModalContent.includes('Thermal (80mm)'),
  'Must display Thermal (80mm) label on switcher'
);
assert.ok(
  a4ModalContent.includes("handlePaperSizeChange('A4')"),
  'Must have click handler to switch to A4 mode'
);
assert.ok(
  a4ModalContent.includes('A4 Standard'),
  'Must display A4 Standard label on switcher'
);
console.log('✓ Test 3 Passed: Thermal and A4 UI buttons present.');

// Test 4: Check 80mm thermal receipt layout & element structure
console.log('Test 4: Verifying 80mm thermal receipt DOM layout...');
assert.ok(
  a4ModalContent.includes('id="thermal-receipt-sheet"'),
  'Must render thermal-receipt-sheet container'
);
assert.ok(
  a4ModalContent.includes('w-[80mm] max-w-[80mm]'),
  'Thermal container must have 80mm width specified'
);
assert.ok(
  a4ModalContent.includes('SADIQ BOOK AGENCY'),
  'Must include SADIQ BOOK AGENCY shop branding'
);
assert.ok(
  a4ModalContent.includes('Udyana Market Mingora Swat'),
  'Must include shop address'
);
assert.ok(
  a4ModalContent.includes('03449633526'),
  'Must include primary contact telephone'
);
assert.ok(
  a4ModalContent.includes('NET PAYABLE'),
  'Must display Net Payable line on thermal receipt'
);
console.log('✓ Test 4 Passed: 80mm thermal receipt layout confirmed.');

// Test 5: Verify strict confidential trade discount policy on bills
console.log('Test 5: Verifying confidential trade discount is hidden on thermal and A4 bills...');
assert.ok(
  !a4ModalContent.includes('item.discountPercentage') &&
    !a4ModalContent.includes('item.discount%') &&
    !a4ModalContent.includes('Discount %'),
  'Confidential trade discount percentage must NOT be displayed on thermal or A4 customer bills'
);
assert.ok(
  a4ModalContent.includes('sale.totalDiscount > 0') &&
    a4ModalContent.includes('Total Discount:'),
  'Total PKR discount amount can be displayed if applied'
);
console.log('✓ Test 5 Passed: Confidential trade discount is strictly protected.');

// Test 6: Check @media print CSS for thermal and A4 printers
console.log('Test 6: Verifying @media print CSS rules for 80mm roll and A4 sheets...');
assert.ok(
  a4ModalContent.includes('size: 80mm auto;'),
  'Must configure continuous roll size @page { size: 80mm auto; margin: 0; } for thermal'
);
assert.ok(
  a4ModalContent.includes('#thermal-receipt-sheet'),
  'Thermal sheet must be styled for print visibility'
);
assert.ok(
  a4ModalContent.includes("size: ${paperSize === 'A4' ? 'A4 portrait' : 'A5 landscape'};"),
  'A4/A5 must configure standard sheet sizing in print'
);
console.log('✓ Test 6 Passed: Print CSS rules properly defined.');

// Test 7: Verify ThermalReceiptModal wrapper default
console.log('Test 7: Verifying ThermalReceiptModal wrapper defaults to thermal...');
assert.ok(
  thermalModalContent.includes('defaultPaperSize="thermal"'),
  'ThermalReceiptModal must set defaultPaperSize to thermal'
);
console.log('✓ Test 7 Passed: ThermalReceiptModal wrapper verified.');

console.log('\n=== ALL DUAL PRINTER (THERMAL + A4) TESTS PASSED! ===');

