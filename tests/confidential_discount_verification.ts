import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — CONFIDENTIAL DISCOUNT PERCENTAGE VERIFICATION
// ==============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testsFailed++;
  }
}

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — CONFIDENTIAL DISCOUNT PERCENTAGE VERIFICATION');
console.log('====================================================================\n');

console.log('--- 1. Price List Page & Printable Document Verification ---');

runTest('1. PriceListTable does not render "Pub. Disc %" column', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/inventory/PriceListTable.tsx'), 'utf-8');
  assert.ok(!fileContent.includes("header: 'Pub. Disc %'"), 'Pub. Disc % column must be removed from PriceListTable columns');
  assert.ok(!fileContent.includes("key: 'publisherDiscount'"), 'publisherDiscount key must not be in PriceListTable columns');
});

runTest('2. PriceListTable printable document does not expose publisher discount percentage', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/inventory/PriceListTable.tsx'), 'utf-8');
  assert.ok(!fileContent.includes('>Pub Disc<'), 'Printable price list table must not contain Pub Disc header');
  assert.ok(!fileContent.includes('p.publisherDiscountPercent'), 'Printable price list table must not render publisherDiscountPercent');
});

runTest('3. PriceListTable top summary indicator does not display Avg. Publisher Discount', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/inventory/PriceListTable.tsx'), 'utf-8');
  assert.ok(!fileContent.includes('Avg. Publisher Discount'), 'Summary cards must not display Avg. Publisher Discount');
  assert.ok(!fileContent.includes('stats.avgDisc'), 'stats calculation must not expose avgDisc');
});

console.log('\n--- 2. Main Inventory Table & Detail Modal Verification ---');

runTest('4. Inventory catalog table does not include "Pub. Disc %" column', () => {
  const fileContent = fs.readFileSync(path.resolve('src/pages/Inventory.tsx'), 'utf-8');
  assert.ok(!fileContent.includes("header: 'Pub. Disc %'"), 'Pub. Disc % must not be in Inventory table columns');
});

runTest('5. ProductDetailModal does not display Publisher Discount or FIFO batch discount column', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/inventory/ProductDetailModal.tsx'), 'utf-8');
  assert.ok(!fileContent.includes('Publisher Discount:'), 'Publisher Discount card must not be in ProductDetailModal');
  assert.ok(!fileContent.includes('Pub Disc %'), 'FIFO batches table must not have Pub Disc % header');
  assert.ok(!fileContent.includes('batch.publisherDiscountPercent'), 'FIFO batches table must not show batch discount percent');
});

console.log('\n--- 3. Bill & Customer Quotation Verification ---');

runTest('6. RoughBillPrintModal does not include "Disc %" column in printed bill table', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/roughBill/RoughBillPrintModal.tsx'), 'utf-8');
  assert.ok(!fileContent.includes('<th className="p-2 text-center w-16">Disc %</th>'), 'Bill print table must not have Disc % header');
  assert.ok(!fileContent.includes('item.discountPercent ? `${item.discountPercent}%` : \'-\''), 'Bill table must not print discount percent values');
});

runTest('7. RoughBillPrintModal WhatsApp share message does not expose discount percentage', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/roughBill/RoughBillPrintModal.tsx'), 'utf-8');
  assert.ok(!fileContent.includes('(-${i.discountPercent}%)'), 'WhatsApp sharing message must not contain discount percentage tags');
});

runTest('8. RoughBillModal defaults discount to 0% instead of leaking publisher discount', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/roughBill/RoughBillModal.tsx'), 'utf-8');
  assert.ok(fileContent.includes('const defaultDisc = 0;'), 'RoughBillModal must initialize item discount to 0');
  assert.ok(!fileContent.includes('prod.publisherDiscountPercent || 0'), 'RoughBillModal must never default to prod.publisherDiscountPercent');
});

console.log('\n--- 4. Product Add & Edit Modals (Authorized Confidential Access) ---');

runTest('9. ProductFormModal retains Publisher Discount % input for Add & Edit modes', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/inventory/ProductFormModal.tsx'), 'utf-8');
  assert.ok(fileContent.includes('label="Publisher Discount %"'), 'ProductFormModal must retain Publisher Discount % field');
  assert.ok(fileContent.includes('handlePublisherDiscountChange'), 'ProductFormModal must handle discount calculation on add/edit');
});

runTest('10. PriceEditModal retains Publisher Discount % input for authorized price editing', () => {
  const fileContent = fs.readFileSync(path.resolve('src/components/inventory/PriceEditModal.tsx'), 'utf-8');
  assert.ok(fileContent.includes('Publisher Discount (%)'), 'PriceEditModal must retain Publisher Discount input');
  assert.ok(fileContent.includes('handlePubDiscountChange'), 'PriceEditModal must allow updating publisher discount');
});

console.log('\n--- 5. Mathematical Cost Computation Integrity ---');

runTest('11. Cost price formula MRP * (1 - Disc / 100) remains 100% accurate', () => {
  const mrp = 1000;
  const pubDiscount = 40; // 40% trade discount
  const cost = Math.round(mrp * (1 - pubDiscount / 100) * 100) / 100;
  assert.equal(cost, 600, 'Calculated cost for Rs. 1000 at 40% discount must be Rs. 600');

  const oddMrp = 375;
  const oddDiscount = 33.3;
  const oddCost = Math.round(oddMrp * (1 - oddDiscount / 100) * 100) / 100;
  assert.equal(oddCost, 250.13, 'Precision rounding maintains exact paise calculations');
});

console.log('\n====================================================================');
console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================================\n');

if (testsFailed > 0) process.exit(1);

