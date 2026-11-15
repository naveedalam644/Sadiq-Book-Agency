import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================================');
console.log('PURCHASE INTAKE DIRECT QUANTITY INPUT & CLASS DISPLAY VERIFICATION');
console.log('====================================================================\n');

// 1. Verify purchaseFormHelpers.ts updates
console.log('TEST 1: Verifying purchaseFormHelpers.ts interface and functions...');
const helpersPath = path.join(rootDir, 'src', 'utils', 'purchaseFormHelpers.ts');
assert(fs.existsSync(helpersPath), 'purchaseFormHelpers.ts must exist');
const helpersContent = fs.readFileSync(helpersPath, 'utf8');

assert(helpersContent.includes('targetClass?: string;'), 'PurchaseItemRow must have targetClass');
assert(helpersContent.includes('className?: string;'), 'PurchaseItemRow must have className');
assert(helpersContent.includes('seriesName?: string;'), 'PurchaseItemRow must have seriesName');
assert(helpersContent.includes('quantityToAdd = 1'), 'addOrIncrementPurchaseItem must accept quantityToAdd default 1');
console.log('✓ purchaseFormHelpers.ts successfully verified.\n');

// 2. Verify PurchaseFormModal.tsx updates
console.log('TEST 2: Verifying PurchaseFormModal.tsx implementation...');
const modalPath = path.join(rootDir, 'src', 'components', 'purchases', 'PurchaseFormModal.tsx');
assert(fs.existsSync(modalPath), 'PurchaseFormModal.tsx must exist');
const modalContent = fs.readFileSync(modalPath, 'utf8');

assert(modalContent.includes('GraduationCap'), 'Must import GraduationCap icon');
assert(modalContent.includes('inputQuantities'), 'Must maintain inputQuantities state');
assert(modalContent.includes('setInputQuantities'), 'Must have setInputQuantities setter');
assert(modalContent.includes('sortProductsByClassSequence'), 'Must sort matching products by class sequence');
assert(modalContent.includes('resolvedClass'), 'Must resolve class for display in matching products');
assert(modalContent.includes('Class: {resolvedClass}'), 'Must display Class badge in matching products');
assert(modalContent.includes('row.targetClass || row.className'), 'Must display Class in invoice rows');
assert(modalContent.includes('title="Enter quantity to add directly to invoice'), 'Must have direct quantity input');
console.log('✓ PurchaseFormModal.tsx successfully verified.\n');

console.log('====================================================================');
console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
console.log('====================================================================');

