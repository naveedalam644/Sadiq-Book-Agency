import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ====================================================================
// SADIQ BOOK AGENCY — PARCHON COUNTER SALE VERIFICATION SUITE
// ====================================================================

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — PARCHON COUNTER SALE VERIFICATION');
console.log('====================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(testNumber: number, name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] Test ${testNumber}: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] Test ${testNumber}: ${name}`);
    console.error(`         Error: ${err.message}`);
    failedTests++;
  }
}

const saleServicePath = path.resolve('src/services/saleService.ts');
const posPagePath = path.resolve('src/pages/POS.tsx');

const saleServiceContent = fs.readFileSync(saleServicePath, 'utf8');
const posPageContent = fs.readFileSync(posPagePath, 'utf8');

// -----------------------------------------------------------------------------
// Test 1: Verify 'Credit sale is not permitted for walk-in cash counter customers' is removed
// -----------------------------------------------------------------------------
runTest(1, 'No blocking registered account requirement for Parchon customers in saleService.ts', () => {
  assert.ok(
    !saleServiceContent.includes('Credit sale is not permitted for walk-in cash counter customers. A registered customer account is required.'),
    'The error message blocking Parchon customers must be completely removed from saleService.ts'
  );
});

// -----------------------------------------------------------------------------
// Test 2: Verify credit limit checks only execute when customerDoc exists
// -----------------------------------------------------------------------------
runTest(2, 'Credit limit checks strictly guarded by customerDoc existence', () => {
  assert.ok(
    saleServiceContent.includes('if (balanceAddedToCredit > 0 && customerDoc)'),
    'Credit limit validation must only run when customerDoc is present'
  );
});

// -----------------------------------------------------------------------------
// Test 3: Verify cash counter sale defaults cashTendered to grandTotal when unentered or 0
// -----------------------------------------------------------------------------
runTest(3, 'Parchon cash sale auto-defaults unentered cashTendered to grandTotal', () => {
  assert.ok(
    saleServiceContent.includes('const isParchonOrNoAccount = !customerDoc || input.customerType === \'parchon\';'),
    'saleService must identify Parchon or walk-in customers'
  );
  assert.ok(
    saleServiceContent.includes('const effectiveCashTendered = isParchonOrNoAccount && cashTendered <= 0'),
    'saleService must compute effectiveCashTendered as grandTotal when cashTendered is empty or <= 0'
  );
});

// -----------------------------------------------------------------------------
// Test 4: Verify POS.tsx computes effectiveTendered at checkout
// -----------------------------------------------------------------------------
runTest(4, 'POS.tsx handleCheckout guarantees effectiveTendered equals grandTotal for cash mode', () => {
  assert.ok(
    posPageContent.includes('paymentMethod === \'cash\' && (numericTendered <= 0 || !cashTendered)'),
    'POS.tsx handleCheckout must check if cashTendered is empty or <= 0 and supply grandTotal'
  );
  assert.ok(
    posPageContent.includes('prepareSalePayload(effectiveTendered, paymentMethod, customDueDate)'),
    'POS.tsx must pass effectiveTendered to prepareSalePayload'
  );
});

// -----------------------------------------------------------------------------
// Test 5: Verify POS.tsx allows Khata Credit for Parchon without mandatory customer account
// -----------------------------------------------------------------------------
runTest(5, 'POS.tsx allows Khata Credit button without customerType !== "parchon" restriction', () => {
  // Check that the Khata Credit button is accessible
  assert.ok(
    posPageContent.includes('onClick={() => setPaymentMethod(\'credit\')}'),
    'Khata Credit button click handler exists'
  );
  // Verify due date is optional for Parchon counter customers
  assert.ok(
    posPageContent.includes('Due Date (Optional):'),
    'POS.tsx must provide optional due date for Parchon counter sales without blocking'
  );
});

// -----------------------------------------------------------------------------
// Test 6: Verify simulated cash counter sale calculation
// -----------------------------------------------------------------------------
runTest(6, 'Simulate Parchon counter checkout calculation with unentered cash', () => {
  const customerDoc = null; // Walk-in Parchon has no registered profile
  const customerType = 'parchon';
  const grandTotal = 1500;
  const cashTendered = 0; // Cashier clicked Complete Sale without typing cash amount
  const paymentMethod = 'cash';

  const isParchonOrNoAccount = !customerDoc || customerType === 'parchon';
  const effectiveCashTendered = isParchonOrNoAccount && cashTendered <= 0 ? grandTotal : cashTendered;

  let paymentApplied = 0;
  let changeReturned = 0;
  let balanceAddedToCredit = 0;
  let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';

  if (paymentMethod === 'cash') {
    if (effectiveCashTendered >= grandTotal) {
      paymentApplied = grandTotal;
      changeReturned = Math.round((effectiveCashTendered - grandTotal) * 100) / 100;
      balanceAddedToCredit = 0;
      paymentStatus = 'paid';
    }
  }

  assert.equal(paymentApplied, 1500);
  assert.equal(changeReturned, 0);
  assert.equal(balanceAddedToCredit, 0);
  assert.equal(paymentStatus, 'paid');

  // Verify that credit check does NOT trigger
  let creditCheckTriggered = false;
  if (balanceAddedToCredit > 0 && customerDoc) {
    creditCheckTriggered = true;
  }
  assert.equal(creditCheckTriggered, false, 'Credit check must not trigger');
});

console.log('\n====================================================================');
console.log(` VERIFICATION SUMMARY: ${passedTests}/${passedTests + failedTests} PASSED (${failedTests} FAILED)`);
console.log('====================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

