import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== STARTING ROUGH BILL SCANNER & POS REMARKS VERIFICATION ===');

// 1. Verify RoughBillModal.tsx has barcode and QR scanning integration
const roughBillModalContent = fs.readFileSync(
  path.resolve('src/components/roughBill/RoughBillModal.tsx'),
  'utf-8'
);

assert.ok(
  roughBillModalContent.includes('useBarcodeScanner') &&
  roughBillModalContent.includes('searchProductByBarcodeOrSku'),
  'RoughBillModal must import and integrate useBarcodeScanner and searchProductByBarcodeOrSku'
);

assert.ok(
  roughBillModalContent.includes('handleBarcodeScanned') &&
  roughBillModalContent.includes('handleAddProductDirectly'),
  'RoughBillModal must define handleBarcodeScanned and handleAddProductDirectly'
);

assert.ok(
  roughBillModalContent.includes('<BarcodeScannerModal') &&
  roughBillModalContent.includes('Scan Barcode / QR'),
  'RoughBillModal must render BarcodeScannerModal and Scan Barcode / QR button'
);

console.log('✓ RoughBillModal barcode & QR scanning integration verified.');

// 2. Verify POS.tsx has remarks input in the cart
const posContent = fs.readFileSync(path.resolve('src/pages/POS.tsx'), 'utf-8');

assert.ok(
  posContent.includes('setNotes') && posContent.includes('notes,'),
  'POS.tsx must destructure notes and setNotes from usePOSCart'
);

assert.ok(
  posContent.includes('Bill Remarks / Special Instructions') &&
  posContent.includes('value={notes}') &&
  posContent.includes('onChange={(e) => setNotes(e.target.value)}'),
  'POS.tsx must render Remarks / Special Instructions input in the cart footer'
);

console.log('✓ POS cart remarks input verified.');

// 3. Verify A4InvoiceModal.tsx prints sale.notes in Thermal and A4 layouts
const invoiceModalContent = fs.readFileSync(
  path.resolve('src/components/pos/A4InvoiceModal.tsx'),
  'utf-8'
);

assert.ok(
  invoiceModalContent.includes('sale.notes') &&
  invoiceModalContent.includes('Remarks / Instructions:'),
  'A4InvoiceModal must render sale.notes on thermal receipt'
);

assert.ok(
  invoiceModalContent.includes('Special Instructions / Remarks:'),
  'A4InvoiceModal must render sale.notes on A4/A5 full page invoice'
);

console.log('✓ A4InvoiceModal thermal and A4 remarks rendering verified.');

// 4. Verify PublicInvoiceView.tsx displays sale.notes for digital QR verification
const publicInvoiceContent = fs.readFileSync(
  path.resolve('src/pages/PublicInvoiceView.tsx'),
  'utf-8'
);

assert.ok(
  publicInvoiceContent.includes('sale.notes') &&
  publicInvoiceContent.includes('Special Instructions / Remarks:'),
  'PublicInvoiceView must render sale.notes for customer QR verification'
);

console.log('✓ PublicInvoiceView remarks rendering verified.');

console.log('=== ALL ROUGH BILL & POS REMARKS VERIFICATIONS PASSED SUCCESSFULLY! ===');

