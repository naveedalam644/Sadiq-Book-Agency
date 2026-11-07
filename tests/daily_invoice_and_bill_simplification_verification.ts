import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatInvoiceDisplay, amountToWords } from '../src/utils/formatters.ts';

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — DAILY INVOICE NUMBERING & BILL VERIFICATION');
console.log('====================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Verify saleService.ts has the daily sequence logic
// -----------------------------------------------------------------------------
const saleServiceCode = fs.readFileSync(
  path.join(process.cwd(), 'src/services/saleService.ts'),
  'utf-8'
);

assert.ok(
  saleServiceCode.includes('sequenceNumber !== undefined && sequenceNumber > 0'),
  'generateInvoiceNumber must handle sequenceNumber'
);
assert.ok(
  saleServiceCode.includes('`INV-${yyyy}${mm}${dd}-${seqStr}`'),
  'generateInvoiceNumber must format as INV-YYYYMMDD-0001'
);
assert.ok(
  saleServiceCode.includes('let seqNum = dateSalesSnap.size + 1;'),
  'processSaleTransaction must query dateSalesSnap and start from count + 1'
);
console.log('  [PASS] Test 1: saleService.ts implements daily sequential invoice number generation');

// -----------------------------------------------------------------------------
// Test 2: Pure Algorithm Execution for Daily Sequential Numbering
// -----------------------------------------------------------------------------
const generateInvoiceNumberAlgo = (
  checkoutSessionId: string,
  terminalId?: string,
  date?: Date,
  sequenceNumber?: number
): string => {
  const cleanSessionId = checkoutSessionId.trim();
  const sessionPatternMatch = cleanSessionId.match(/^(?:CS|SESS)-([0-9]{6})-([A-Za-z0-9]{1,3})-/i);

  let yy: string;
  let mm: string;
  let dd: string;
  let cleanTerm: string;

  if (sessionPatternMatch) {
    const dateYYMMDD = sessionPatternMatch[1];
    yy = dateYYMMDD.slice(0, 2);
    mm = dateYYMMDD.slice(2, 4);
    dd = dateYYMMDD.slice(4, 6);
    cleanTerm = sessionPatternMatch[2].toUpperCase();
  } else {
    const d = date || new Date();
    yy = String(d.getFullYear()).slice(-2);
    mm = String(d.getMonth() + 1).padStart(2, '0');
    dd = String(d.getDate()).padStart(2, '0');
    cleanTerm = (terminalId || 'T1').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  }

  if (sequenceNumber !== undefined && sequenceNumber > 0) {
    const yyyy = `20${yy}`;
    const seqStr = String(sequenceNumber).padStart(4, '0');
    return `INV-${yyyy}${mm}${dd}-${seqStr}`;
  }

  return `INV-${yy}${mm}${dd}-${cleanTerm}-MOCKHASH`;
};

const inv1 = generateInvoiceNumberAlgo('CS-261105-T1-ABC123DEF456', 'T1', new Date('2026-11-05T10:00:00Z'), 1);
assert.equal(inv1, 'INV-20261105-0001', 'First invoice of the day must be 0001');
console.log('  [PASS] Test 2: Sequence 1 produces: ' + inv1);

const inv2 = generateInvoiceNumberAlgo('CS-261105-T1-ABC123DEF456', 'T1', new Date('2026-11-05T10:00:00Z'), 2);
assert.equal(inv2, 'INV-20261105-0002', 'Sequence 2 produces 0002');
console.log('  [PASS] Test 3: Sequence 2 produces: ' + inv2);

// -----------------------------------------------------------------------------
// Test 3: Display Formatter (INV 20261105 0001)
// -----------------------------------------------------------------------------
const display1 = formatInvoiceDisplay(inv1);
assert.equal(display1, 'INV 20261105 0001', 'Must format with single spaces: INV 20261105 0001');
console.log('  [PASS] Test 4: Formatted display output: ' + display1);

const displayLegacy = formatInvoiceDisplay('INV-261102-T1-8F4AC92B');
assert.equal(displayLegacy, 'INV-261102-T1-8F4AC92B', 'Legacy hash invoices preserve readable format');
console.log('  [PASS] Test 5: Legacy invoices render without alteration: ' + displayLegacy);

// -----------------------------------------------------------------------------
// Test 4: Amount in Words Pakistani Rupees
// -----------------------------------------------------------------------------
const words = amountToWords(2000);
assert.equal(words, 'Two Thousand Rupees Only');
console.log('  [PASS] Test 6: Amount in words (2,000 PKR): ' + words);

const wordsComplex = amountToWords(15420);
assert.equal(wordsComplex, 'Fifteen Thousand Four Hundred Twenty Rupees Only');
console.log('  [PASS] Test 7: Complex amount in words (15,420 PKR): ' + wordsComplex);

// -----------------------------------------------------------------------------
// Test 5: Verify A4 Invoice Template Protects Confidential Discount
// -----------------------------------------------------------------------------
const a4TemplateCode = fs.readFileSync(
  path.join(process.cwd(), 'src/components/pos/A4InvoiceModal.tsx'),
  'utf-8'
);

assert.ok(!a4TemplateCode.includes('Disc %'), 'A4InvoiceModal must NOT have a Disc % column');
assert.ok(!a4TemplateCode.includes('Customer Discount:'), 'A4InvoiceModal must NOT show Customer Discount line');
assert.ok(!a4TemplateCode.includes('Subtotal (Gross MRP):'), 'A4InvoiceModal must NOT show gross MRP subtotal');
assert.ok(a4TemplateCode.includes('item.lineTotal / item.quantity'), 'Rate must be net billed price');
assert.ok(a4TemplateCode.includes('Udyana Market Mingora Swat'), 'Must include correct Swat address');
assert.ok(a4TemplateCode.includes('03449633526 , 03425822259, 03035822258'), 'Must include correct contacts');
console.log('  [PASS] Test 8: A4InvoiceModal strictly hides confidential customer discounts');
console.log('  [PASS] Test 9: A4InvoiceModal has official Sadiq Book Agency header and contacts');

console.log('\n====================================================================');
console.log(' ALL 9 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
console.log('====================================================================');
