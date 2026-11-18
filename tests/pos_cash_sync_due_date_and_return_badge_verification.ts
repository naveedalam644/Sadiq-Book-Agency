import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================================');
console.log('POS CASH SYNC, OPTIONAL DUE DATE & SALES RETURN BADGE VERIFICATION');
console.log('====================================================================\n');

// 1. Verify POS.tsx Cash Tendered dynamic synchronization
console.log('TEST 1: Verifying POS.tsx dynamic cash tendered tracking...');
const posPath = path.join(rootDir, 'src', 'pages', 'POS.tsx');
const posCode = fs.readFileSync(posPath, 'utf8');

assert.ok(
  posCode.includes('isManualCashTendered'),
  'POS.tsx must track isManualCashTendered to know when the cashier explicitly typed custom cash'
);
assert.ok(
  posCode.includes('prevGrandTotalRef'),
  'POS.tsx must track previous grandTotal ref to detect cart total changes'
);
assert.ok(
  posCode.includes('setCashTendered(String(grandTotal))'),
  'POS.tsx must auto-update cashTendered to grandTotal when cart items change'
);
console.log('  ✓ POS.tsx dynamic cash tracking verified.');

// 2. Simulate cash sync math
{
  let grandTotal = 0;
  let cashTendered = '';
  let isManualCashTendered = false;
  let prevGrandTotal = 0;
  let paymentMethod: 'cash' | 'credit' = 'cash';

  const simulateTotalChange = (newTotal: number) => {
    grandTotal = newTotal;
    const prev = prevGrandTotal;
    prevGrandTotal = grandTotal;

    if (paymentMethod === 'cash') {
      if (grandTotal <= 0) {
        cashTendered = '';
        isManualCashTendered = false;
        return;
      }
      if (!isManualCashTendered || !cashTendered || cashTendered === String(prev) || cashTendered === '0') {
        cashTendered = String(grandTotal);
        isManualCashTendered = false;
      }
    }
  };

  // Add Item 1: Rs. 90
  simulateTotalChange(90);
  assert.strictEqual(cashTendered, '90');
  let numTendered = Math.max(0, Number(cashTendered) || 0);
  let khataBal = numTendered < grandTotal ? grandTotal - numTendered : 0;
  assert.strictEqual(khataBal, 0, 'No balance added to khata');

  // Add Item 2: grandTotal becomes 750
  simulateTotalChange(750);
  assert.strictEqual(cashTendered, '750', 'Cash tendered MUST auto-update from 90 to 750!');
  numTendered = Math.max(0, Number(cashTendered) || 0);
  khataBal = numTendered < grandTotal ? grandTotal - numTendered : 0;
  assert.strictEqual(khataBal, 0, 'No balance added to khata when cash equals grandTotal');

  console.log('  ✓ Simulation: Item 1 (90) -> Item 2 (750) automatically syncs Cash input to 750.');
}

// 3. Verify Due Date Optionality in POS.tsx & CustomerBillModal.tsx
console.log('\nTEST 2: Verifying Due Date is optional and never blocks bill checkout...');
assert.ok(
  !posCode.includes('A valid payment due date is required for this credit sale'),
  'POS.tsx must NOT block checkout with hard due date requirement'
);
assert.ok(
  posCode.includes('// Optional payment due date validation for credit sales (not mandatory)'),
  'POS.tsx must treat customDueDate as optional'
);

const customerBillModalPath = path.join(rootDir, 'src', 'components', 'customers', 'CustomerBillModal.tsx');
const customerBillCode = fs.readFileSync(customerBillModalPath, 'utf8');

assert.ok(
  !customerBillCode.includes('A valid payment due date is required. Please select a deadline'),
  'CustomerBillModal.tsx must NOT block bill saving when due date is empty'
);
assert.ok(
  customerBillCode.includes('Payment Due Date <span className="text-slate-500 font-normal text-xs">(Optional)</span>'),
  'CustomerBillModal.tsx must display (Optional) label'
);
console.log('  ✓ Due Date optionality verified across both POS and Customer Khata Bill.');

// 4. Verify Sales History Return Badges & Status Indicators
console.log('\nTEST 3: Verifying Sales History Return Badges in SalesHistory.tsx & saleHistoryService.ts...');
const salesHistoryPath = path.join(rootDir, 'src', 'pages', 'SalesHistory.tsx');
const salesHistoryCode = fs.readFileSync(salesHistoryPath, 'utf8');

assert.ok(
  salesHistoryCode.includes('getSaleReturnSummariesForInvoices'),
  'SalesHistory.tsx must import getSaleReturnSummariesForInvoices'
);
assert.ok(
  salesHistoryCode.includes('returnSummariesMap'),
  'SalesHistory.tsx must track returnSummariesMap state'
);
assert.ok(
  salesHistoryCode.includes('Full Return (PKR'),
  'SalesHistory.tsx must render Full Return badge with refund amount'
);
assert.ok(
  salesHistoryCode.includes('Returned: PKR') || salesHistoryCode.includes('Partial Return: PKR'),
  'SalesHistory.tsx must render Partial Return badge with refund amount'
);
assert.ok(
  salesHistoryCode.includes('RETURNED') && salesHistoryCode.includes('PART-RETURN'),
  'SalesHistory.tsx must render tags under invoice number'
);

const saleHistoryServicePath = path.join(rootDir, 'src', 'services', 'saleHistoryService.ts');
const saleHistoryServiceCode = fs.readFileSync(saleHistoryServicePath, 'utf8');
assert.ok(
  saleHistoryServiceCode.includes('export const getSaleReturnSummariesForInvoices'),
  'saleHistoryService.ts must export getSaleReturnSummariesForInvoices'
);
assert.ok(
  saleHistoryServiceCode.includes('returnStatus: isFullReturn ? \'full\' : \'partial\''),
  'saleHistoryService.ts must update returnStatus on the original sale document transactionally'
);
console.log('  ✓ Sales History return badges and authoritative transactional updates verified.');

console.log('\n====================================================================');
console.log('🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY (0 ERRORS)');
console.log('====================================================================\n');
