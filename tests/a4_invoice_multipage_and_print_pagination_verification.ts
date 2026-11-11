import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SaleDocument, SaleItem } from '../src/types/database.ts';
import { generateInvoicePdfRaw } from '../src/utils/invoicePdfGenerator.ts';

console.log('--- Starting A4 Invoice Multi-Page & Print Pagination Verification ---');

const a4ModalPath = path.resolve('src/components/pos/A4InvoiceModal.tsx');
const pdfGenPath = path.resolve('src/utils/invoicePdfGenerator.ts');

assert.ok(fs.existsSync(a4ModalPath), 'A4InvoiceModal.tsx must exist');
assert.ok(fs.existsSync(pdfGenPath), 'invoicePdfGenerator.ts must exist');

const a4ModalContent = fs.readFileSync(a4ModalPath, 'utf8');
const pdfGenContent = fs.readFileSync(pdfGenPath, 'utf8');

// Test 1: React Portal Implementation
console.log('Test 1: Verifying A4InvoiceModal uses React Portal to document.body...');
assert.ok(
  a4ModalContent.includes("import { createPortal } from 'react-dom';") ||
    a4ModalContent.includes('createPortal('),
  'A4InvoiceModal must import and use createPortal'
);
assert.ok(
  a4ModalContent.includes('return createPortal(modalContent, document.body);'),
  'A4InvoiceModal must render directly into document.body via createPortal'
);
console.log('✓ Test 1 Passed: React Portal to document.body confirmed.');

// Test 2: CSS Print Layout & Static Positioning
console.log('Test 2: Verifying Print CSS removes #root and resets modal containers to static flow...');
assert.ok(
  a4ModalContent.includes('#root,') && a4ModalContent.includes('display: none !important;'),
  'Print CSS must hide #root to prevent duplicate and clipped background layout'
);
assert.ok(
  a4ModalContent.includes('.a4-print-modal-root') &&
    a4ModalContent.includes('position: static !important;'),
  'Modal wrapper must use static flow in @media print'
);
assert.ok(
  a4ModalContent.includes('#a4-invoice-sheet') &&
    a4ModalContent.includes('position: static !important;'),
  '#a4-invoice-sheet must use position: static !important; in @media print to allow browser pagination'
);
assert.ok(
  !a4ModalContent.includes('#a4-invoice-sheet {\n            position: absolute'),
  '#a4-invoice-sheet must NOT use position: absolute in print'
);
console.log('✓ Test 2 Passed: Static positioning for multi-page print flow confirmed.');

// Test 3: Table Header Repetition & Page Break Avoidance
console.log('Test 3: Verifying thead table-header-group and tr/summary break-inside: avoid...');
assert.ok(
  a4ModalContent.includes('thead {') && a4ModalContent.includes('display: table-header-group !important;'),
  'Print CSS must specify thead { display: table-header-group !important; } so headers repeat on page 2+'
);
assert.ok(
  a4ModalContent.includes('tr {') && a4ModalContent.includes('break-inside: avoid !important;'),
  'Print CSS must prevent rows from splitting across page breaks'
);
assert.ok(
  a4ModalContent.includes('.invoice-summary-section') &&
    a4ModalContent.includes('break-inside: avoid !important;'),
  'Print CSS must prevent summary block from splitting awkwardly'
);
assert.ok(
  a4ModalContent.includes('.invoice-signatures-section') &&
    a4ModalContent.includes('break-inside: avoid !important;'),
  'Print CSS must keep signatures intact'
);
console.log('✓ Test 3 Passed: Table header repeating and break rules verified.');

// Test 4: Direct Download PDF Action
console.log('Test 4: Verifying direct "Download PDF" action in modal header and footer...');
assert.ok(
  a4ModalContent.includes('downloadInvoicePdf(sale)'),
  'Modal must offer direct Download PDF button'
);
assert.ok(
  a4ModalContent.includes('Download PDF'),
  'Modal buttons must label Download PDF clearly'
);
console.log('✓ Test 4 Passed: Direct Download PDF button present.');

// Test 4b: Verify 7-column layout (SNo, Description, Publisher/Series/Class, Qty, MRP, Discount Price, Total)
console.log('Test 4b: Verifying 7-column layout in A4InvoiceModal and invoicePdfGenerator...');
assert.ok(
  a4ModalContent.includes('Publisher, Series, Class'),
  'A4InvoiceModal must display Publisher, Series, Class column'
);
assert.ok(
  a4ModalContent.includes('MRP Rate (PKR)'),
  'A4InvoiceModal must display MRP Rate (PKR) column'
);
assert.ok(
  a4ModalContent.includes('Discount Price'),
  'A4InvoiceModal must display Discount Price column'
);
assert.ok(
  pdfGenContent.includes('Publisher / Series / Class'),
  'invoicePdfGenerator must include Publisher / Series / Class in table header'
);
assert.ok(
  pdfGenContent.includes('(MRP)'),
  'invoicePdfGenerator must include MRP in table header'
);
assert.ok(
  pdfGenContent.includes('(D.Price)'),
  'invoicePdfGenerator must include D.Price in table header'
);
console.log('✓ Test 4b Passed: 7-column invoice format confirmed in HTML print and PDF generation.');

// Test 5: Verify Multi-Page PDF Generation for 34-item invoice (User Scenario)
console.log('Test 5: Verifying PDF 1.4 generation with 34 items (user invoice scenario)...');

const mockSale34: SaleDocument = {
  id: 'test_sale_34',
  invoiceNo: 'CS-261109-T1-21929C7F646B',
  checkoutSessionId: 'CS-261109-T1-21929C7F646B',
  terminalId: 'T1',
  sessionCreatedAt: '2026-11-10T12:00:00.000Z',
  productIds: Array.from({ length: 34 }, (_, i) => `prod_${i + 1}`),
  saleDate: '2026-11-10T12:00:00.000Z',
  customerId: 'cust_zk_001',
  customerName: 'ZK Interprises',
  customerType: 'wholesaler',
  items: Array.from({ length: 34 }, (_, i): SaleItem => ({
    productId: `prod_${i + 1}`,
    productName: i < 20 ? `Skill Lab English Book ${i + 1}` : `Urdu Book Class ${i + 1}`,
    sku: `BK-${i + 1000}`,
    classification: 'book',
    isDiscountEligible: true,
    quantity: 20,
    unitPrice: 384,
    costPrice: 200,
    discountRate: 0,
    discountPercent: 0,
    discountAmount: 0,
    effectivePrice: 384,
    sellingPrice: 384,
    lineTotal: 7680,
    publisherName: 'Moon Light',
  })),
  subtotal: 639400,
  totalDiscount: 136960,
  grandTotal: 502440,
  cashTendered: 0,
  changeReturned: 0,
  paymentMethod: 'credit',
  paymentApplied: 0,
  balanceAddedToCredit: 502440,
  paymentStatus: 'unpaid',
  operatorUserId: 'admin_01',
  operatorName: 'Sadiq Admin',
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
};

const pdfResult34 = generateInvoicePdfRaw(mockSale34);
assert.ok(pdfResult34.startsWith('%PDF-1.4'), 'Generated file must begin with %PDF-1.4');
assert.ok(pdfResult34.endsWith('%%EOF'), 'Generated file must terminate with %%EOF');

// Check that count is at least 2 pages
const pageMatch = pdfResult34.match(/\/Count\s+(\d+)/);
assert.ok(pageMatch, 'PDF must specify page count');
const pageCount = pageMatch ? parseInt(pageMatch[1], 10) : 0;
assert.ok(pageCount >= 2, `PDF for 34 items must have at least 2 pages (got: ${pageCount})`);

// Verify that item 34 is included
assert.ok(pdfResult34.includes('Urdu Book Class 34'), 'PDF must include 34th item');

// Verify that financial summary is included
assert.ok(pdfResult34.includes('Grand Total:'), 'PDF must include Grand Total');
assert.ok(pdfResult34.includes('502,440'), 'PDF must include Grand Total amount PKR 502,440');
assert.ok(pdfResult34.includes('Added to Khata:'), 'PDF must include Added to Khata');
assert.ok(pdfResult34.includes('ZK Interprises'), 'PDF must include customer name');

console.log(`✓ Test 5 Passed: 34-item invoice cleanly generated across ${pageCount} pages with all items and financial summary.`);

// Test 6: Verify Single-Page PDF Generation for short invoices (e.g. 5 items)
console.log('Test 6: Verifying compact invoice (5 items) generates single page...');
const mockSale5: SaleDocument = {
  ...mockSale34,
  items: mockSale34.items.slice(0, 5),
  subtotal: 38400,
  totalDiscount: 0,
  grandTotal: 38400,
  balanceAddedToCredit: 38400,
};
const pdfResult5 = generateInvoicePdfRaw(mockSale5);
const pageMatch5 = pdfResult5.match(/\/Count\s+(\d+)/);
assert.ok(pageMatch5, 'Single page PDF must specify page count');
const pageCount5 = pageMatch5 ? parseInt(pageMatch5[1], 10) : 0;
assert.strictEqual(pageCount5, 1, `PDF for 5 items should be 1 page (got: ${pageCount5})`);
console.log('✓ Test 6 Passed: 5-item invoice fits cleanly on 1 page.');

console.log('\n=== ALL A4 INVOICE MULTI-PAGE & PRINT PAGINATION TESTS PASSED! ===');
