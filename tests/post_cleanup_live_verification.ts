import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const execRecordPath = path.resolve(process.cwd(), 'backups', 'cleanup_execution_record.json');
const execRecord = JSON.parse(fs.readFileSync(execRecordPath, 'utf-8'));

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — POST-CLEANUP VERIFICATION');
console.log('====================================================================');

// 1. Verify exact counts
assert.equal(execRecord.totalDeleted, 198, 'Exactly 198 documents must have been deleted');
assert.equal(execRecord.totalRemainingDocs, 8, 'Exactly 8 documents must remain in database');
assert.equal(execRecord.allVerificationsPassed, true, 'All verifications must pass');

// 2. Verify remaining collections
const remainingCols = Object.keys(execRecord.remainingDocumentsByCollection);
assert.equal(remainingCols.length, 3, 'Only 3 collections should remain in database');
assert.ok(remainingCols.includes('categories'));
assert.ok(remainingCols.includes('settings'));
assert.ok(remainingCols.includes('users'));

// 3. Verify admin user
const adminDocs = execRecord.remainingDocumentsByCollection.users;
assert.equal(adminDocs.length, 1);
assert.equal(adminDocs[0], 'eptsy6YFXXgq7z43BW0UVb7Xfe62');

// 4. Verify settings
const settingDocs = execRecord.remainingDocumentsByCollection.settings;
assert.equal(settingDocs.length, 1);
assert.equal(settingDocs[0], 'inventory_summary');

// 5. Verify 6 core categories
const catDocs = execRecord.remainingDocumentsByCollection.categories;
assert.equal(catDocs.length, 6);
const expected = ['cat_intermediate', 'cat_matric', 'cat_middle', 'cat_others', 'cat_primary', 'cat_secondary'];
for (const exp of expected) {
  assert.ok(catDocs.includes(exp), `Expected category ${exp} to be preserved`);
}

// 6. Verify zero business records
const deletedBreakdown = execRecord.deletedByCollection;
assert.equal(deletedBreakdown.products, 7);
assert.equal(deletedBreakdown.stockBatches, 3);
assert.equal(deletedBreakdown.stockMovements, 35);
assert.equal(deletedBreakdown.publishers, 1);
assert.equal(deletedBreakdown.series, 1);
assert.equal(deletedBreakdown.suppliers, 2);
assert.equal(deletedBreakdown.customers, 5);
assert.equal(deletedBreakdown.customerLedger, 12);
assert.equal(deletedBreakdown.sales, 15);
assert.equal(deletedBreakdown.salesReturns, 1);
assert.equal(deletedBreakdown.saleReturnSummaries, 1);
assert.equal(deletedBreakdown.payments, 18);
assert.equal(deletedBreakdown.expenses, 2);
assert.equal(deletedBreakdown.auditLogs, 55);
assert.equal(deletedBreakdown.categories, 40);

console.log('All 6 Post-Cleanup Assertions PASSED successfully.');
console.log('Database is in a clean, pristine state ready for client handover.');

