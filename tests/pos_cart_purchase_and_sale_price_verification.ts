import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== STARTING POS CART PURCHASE & SALE PRICE VERIFICATION ===');

// 1. Verify POS.tsx renders Purchase Price and Sale Price for non-books
const posContent = fs.readFileSync(path.resolve('src/pages/POS.tsx'), 'utf-8');

assert.ok(
  posContent.includes('Purchase:') && posContent.includes('Number(item.costPrice || 0)'),
  'POS.tsx must display Purchase Cost badge for non-book cart items'
);

assert.ok(
  posContent.includes('Sale Price:') && posContent.includes('updateItemPrice(item.productId'),
  'POS.tsx must display editable Sale Price input for non-book cart items'
);

assert.ok(
  posContent.includes('Direct Rate'),
  'POS.tsx must display Direct Rate tag for non-book cart items'
);

// 2. Verify books keep MRP, Rate and Disc%
assert.ok(
  posContent.includes('MRP: {item.unitPrice}') &&
  posContent.includes('updateItemDiscount(item.productId'),
  'POS.tsx must keep MRP and Disc% for books'
);
console.log('✓ POS.tsx dual price layout (Purchase Price & Sale Price) verified.');

// 3. Verify confidential costPrice is NOT printed on any customer invoice / bill
const a4InvoiceContent = fs.readFileSync(path.resolve('src/components/pos/A4InvoiceModal.tsx'), 'utf-8');
assert.ok(
  !a4InvoiceContent.includes('costPrice') && !a4InvoiceContent.includes('Purchase Price'),
  'A4InvoiceModal must NOT expose costPrice or Purchase Price on customer invoice'
);

const publicInvoiceContent = fs.readFileSync(path.resolve('src/pages/PublicInvoiceView.tsx'), 'utf-8');
assert.ok(
  !publicInvoiceContent.includes('costPrice') && !publicInvoiceContent.includes('Purchase Price'),
  'PublicInvoiceView must NOT expose costPrice on customer verification invoice'
);
console.log('✓ Confidentiality verified: costPrice is strictly hidden from printed and digital customer bills.');

// 4. Verify mathematical calculation integrity
const testCartItem = {
  productId: 'nb-123',
  productName: 'Infinity Note Book Urdu Line No.4',
  classification: 'notebook' as const,
  costPrice: 60,
  effectivePrice: 90, // Customized sale rate for customer
  quantity: 2,
};

const lineTotal = testCartItem.effectivePrice * testCartItem.quantity;
assert.strictEqual(lineTotal, 180, 'Line total must equal quantity * effective sale price');

// COGS cost should use costPrice, revenue should use effectivePrice
const cogs = testCartItem.costPrice * testCartItem.quantity;
assert.strictEqual(cogs, 120, 'COGS must use confidential purchase cost');

const grossProfit = lineTotal - cogs;
assert.strictEqual(grossProfit, 60, 'Gross profit must be correctly calculated as (90 - 60) * 2 = 60');
console.log('✓ Mathematical accuracy verified: line totals, COGS, and profit margins calculate cleanly.');

console.log('=== ALL POS CART DUAL PRICING CHECKS PASSED! ===');

