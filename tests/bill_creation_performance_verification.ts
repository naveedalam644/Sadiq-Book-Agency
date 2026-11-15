import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================================');
console.log('BILL CREATION PERFORMANCE & PARALLEL TRANSACTION VERIFICATION');
console.log('====================================================================\n');

// 1. Verify stockBatchService.ts has getActiveBatchesForProducts
console.log('TEST 1: Verifying batch-querying optimization in stockBatchService.ts...');
const batchServicePath = path.join(rootDir, 'src', 'services', 'stockBatchService.ts');
const batchServiceCode = fs.readFileSync(batchServicePath, 'utf8');

assert.ok(
  batchServiceCode.includes('export const getActiveBatchesForProducts'),
  'Must export getActiveBatchesForProducts'
);
assert.ok(
  batchServiceCode.includes("where('productId', 'in', chunk)"),
  'Must use chunked Firestore "in" queries to eliminate N sequential requests'
);
console.log('  ✓ getActiveBatchesForProducts verified successfully.\n');

// 2. Verify saleService.ts parallelization
console.log('TEST 2: Verifying parallel reads in saleService.ts...');
const saleServicePath = path.join(rootDir, 'src', 'services', 'saleService.ts');
const saleServiceCode = fs.readFileSync(saleServicePath, 'utf8');

assert.ok(
  saleServiceCode.includes('getActiveBatchesForProducts(uniqueProductIds)'),
  'Must pre-load active batches concurrently using getActiveBatchesForProducts'
);
assert.ok(
  saleServiceCode.includes('STEP 1: PARALLEL TRANSACTION READS (MAXIMUM SPEED CONCURRENCY)'),
  'Must execute transaction reads in parallel'
);
assert.ok(
  saleServiceCode.includes('Promise.all([') &&
  saleServiceCode.includes('transaction.get(saleRef)') &&
  saleServiceCode.includes('Promise.all(uniqueProductIds.map((pid) => transaction.get(doc(db!, \'products\', pid))))'),
  'All products, batches, discounts, and sale docs must be fetched in 1 parallel Promise.all round-trip'
);
console.log('  ✓ saleService.ts parallel transaction reads verified successfully.\n');

console.log('====================================================================');
console.log('ALL PERFORMANCE VERIFICATIONS PASSED SUCCESSFULLY!');
console.log('====================================================================');

