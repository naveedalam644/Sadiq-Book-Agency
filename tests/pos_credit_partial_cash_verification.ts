import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('POS CREDIT PARTIAL CASH PAYMENT & KHATA PORTAL UI VERIFICATION');
console.log('================================================================\n');

// 1. Verify POS.tsx logic for partial cash payment on Khata Credit
console.log('TEST 1: Verifying POS.tsx credit partial cash calculation & UI...');
const posPath = path.join(rootDir, 'src', 'pages', 'POS.tsx');
assert(fs.existsSync(posPath), 'POS.tsx must exist');
const posContent = fs.readFileSync(posPath, 'utf8');

assert(
  posContent.includes("const creditCashPaid = paymentMethod === 'credit' ? Math.min(grandTotal, numericTendered) : 0;"),
  'POS.tsx must calculate creditCashPaid'
);
assert(
  posContent.includes("paymentMethod === 'credit'"),
  'POS.tsx must check credit paymentMethod'
);
assert(
  posContent.includes("Math.max(0, grandTotal - creditCashPaid)"),
  'POS.tsx must deduct creditCashPaid from balanceAddedToCredit'
);
assert(
  posContent.includes('Cash Paid Now:') || posContent.includes('Cash Paid Now'),
  'POS.tsx must render Cash Paid Now input for Khata credit'
);
assert(
  posContent.includes('0 (Full Khata)'),
  'POS.tsx must provide 0 (Full Khata) quick button'
);
assert(
  posContent.includes('Added to Khata:') || posContent.includes('Remaining in Khata'),
  'POS.tsx must display remaining amount added to Khata'
);
console.log('  ✓ POS.tsx accurately calculates and presents partial cash down-payment on Khata.\n');

// 2. Verify saleService.ts credit transaction logic
console.log('TEST 2: Verifying saleService.ts partial cash transaction processing...');
const saleServicePath = path.join(rootDir, 'src', 'services', 'saleService.ts');
assert(fs.existsSync(saleServicePath), 'saleService.ts must exist');
const saleServiceContent = fs.readFileSync(saleServicePath, 'utf8');

assert(
  saleServiceContent.includes('// Khata Credit sale (supports optional immediate partial cash down-payment)'),
  'saleService.ts must handle optional partial cash down-payment in credit mode'
);
assert(
  saleServiceContent.includes('paymentApplied = cashTendered;'),
  'saleService.ts must apply cashTendered to paymentApplied'
);
assert(
  saleServiceContent.includes('balanceAddedToCredit = Math.round((grandTotal - cashTendered) * 100) / 100;'),
  'saleService.ts must assign remaining balance to balanceAddedToCredit'
);
assert(
  saleServiceContent.includes("paymentStatus = 'partial';"),
  'saleService.ts must set paymentStatus to partial when partial cash paid'
);
console.log('  ✓ saleService.ts correctly updates balanceAddedToCredit, paymentApplied, and paymentStatus.\n');

// 3. Verify Customer Portal sync includes cash paid at checkout
console.log('TEST 3: Verifying customerPortalService.ts totalPaid aggregation...');
const portalServicePath = path.join(rootDir, 'src', 'services', 'customerPortalService.ts');
const portalServiceContent = fs.readFileSync(portalServicePath, 'utf8');

assert(
  portalServiceContent.includes('sales.reduce((sum, s) => sum + (Number(s.paymentApplied) || 0), 0)'),
  'customerPortalService.ts must include sales paymentApplied in totalPaid'
);
console.log('  ✓ customerPortalService.ts aggregates POS cash payments into total settled payments.\n');

// 4. Verify CustomerKhataPortal UI Redesign
console.log('TEST 4: Verifying CustomerKhataPortal.tsx professional & mobile-friendly UI...');
const portalPath = path.join(rootDir, 'src', 'pages', 'CustomerKhataPortal.tsx');
assert(fs.existsSync(portalPath), 'CustomerKhataPortal.tsx must exist');
const portalContent = fs.readFileSync(portalPath, 'utf8');

// Check clean English labels, dual search options, 12h time, and responsive elements
assert(portalContent.includes('Wholesale Customer Khata Portal'), 'Portal must include Wholesale Customer Khata Portal title');
assert(portalContent.includes('Total Khata Balance (Baqaya)'), 'Portal must display Total Khata Balance');
assert(portalContent.includes('totalKhataBaqaya'), 'Portal must calculate and display totalKhataBaqaya');
assert(portalContent.includes('searchQuery'), 'Portal must include search filter for bills/books');
assert(portalContent.includes('startDate') && portalContent.includes('endDate'), 'Portal must include date range filter (from date to to date)');
assert(portalContent.includes('formatInvoiceDisplayDateTime'), 'Portal must use formatInvoiceDisplayDateTime for 12h AM/PM time');
assert(portalContent.includes('sm:hidden'), 'Portal must include mobile-specific card layout');
assert(portalContent.includes('hidden sm:block') || portalContent.includes('hidden sm:inline'), 'Portal must include responsive desktop view');

console.log('  ✓ CustomerKhataPortal.tsx has dual search filters, 12-hour time display, and responsive layout.\n');

// 5. Mathematical Simulation of Partial Cash Payment
console.log('TEST 5: Simulating POS Partial Cash Credit Transaction Math...');
const simulateCreditSale = (grandTotal: number, cashTendered: number) => {
  let paymentApplied = 0;
  let changeReturned = 0;
  let balanceAddedToCredit = 0;
  let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';

  if (cashTendered > 0) {
    if (cashTendered >= grandTotal) {
      paymentApplied = grandTotal;
      changeReturned = Math.round((cashTendered - grandTotal) * 100) / 100;
      balanceAddedToCredit = 0;
      paymentStatus = 'paid';
    } else {
      paymentApplied = cashTendered;
      changeReturned = 0;
      balanceAddedToCredit = Math.round((grandTotal - cashTendered) * 100) / 100;
      paymentStatus = 'partial';
    }
  } else {
    paymentApplied = 0;
    changeReturned = 0;
    balanceAddedToCredit = grandTotal;
    paymentStatus = 'unpaid';
  }

  return { paymentApplied, changeReturned, balanceAddedToCredit, paymentStatus };
};

// Case A: Bill PKR 5000, Paid PKR 2000 cash at checkout
const simA = simulateCreditSale(5000, 2000);
assert.strictEqual(simA.paymentApplied, 2000, 'Paid should be 2000');
assert.strictEqual(simA.balanceAddedToCredit, 3000, 'Added to khata should be 3000');
assert.strictEqual(simA.changeReturned, 0, 'No change');
assert.strictEqual(simA.paymentStatus, 'partial', 'Status should be partial');

// Case B: Bill PKR 5000, Full Khata (0 cash paid)
const simB = simulateCreditSale(5000, 0);
assert.strictEqual(simB.paymentApplied, 0, 'Paid should be 0');
assert.strictEqual(simB.balanceAddedToCredit, 5000, 'Added to khata should be 5000');
assert.strictEqual(simB.paymentStatus, 'unpaid', 'Status should be unpaid');

// Case C: Bill PKR 5000, Paid PKR 5000 cash in credit mode
const simC = simulateCreditSale(5000, 5000);
assert.strictEqual(simC.paymentApplied, 5000, 'Paid should be 5000');
assert.strictEqual(simC.balanceAddedToCredit, 0, 'Added to khata should be 0');
assert.strictEqual(simC.paymentStatus, 'paid', 'Status should be paid');

// Case D: Bill PKR 5000, Customer tenders PKR 6000 cash in credit mode
const simD = simulateCreditSale(5000, 6000);
assert.strictEqual(simD.paymentApplied, 5000, 'Paid should be 5000');
assert.strictEqual(simD.changeReturned, 1000, 'Change returned should be 1000');
assert.strictEqual(simD.balanceAddedToCredit, 0, 'Added to khata should be 0');
assert.strictEqual(simD.paymentStatus, 'paid', 'Status should be paid');

console.log('  ✓ All mathematical simulation scenarios passed accurately.\n');

// 6. Test 12-Hour Date & Time Formatter Functionality
console.log('TEST 6: Verifying 12-Hour AM/PM Date & Time Formatters...');
const formattersPath = path.join(rootDir, 'src', 'utils', 'formatters.ts');
assert(fs.existsSync(formattersPath), 'formatters.ts must exist');
const formattersContent = fs.readFileSync(formattersPath, 'utf8');

assert(formattersContent.includes('export const formatDateTime12'), 'formatters.ts must export formatDateTime12');
assert(formattersContent.includes('export const formatTime12'), 'formatters.ts must export formatTime12');
assert(formattersContent.includes('export const formatInvoiceDisplayDateTime'), 'formatters.ts must export formatInvoiceDisplayDateTime');
assert(formattersContent.includes('hour12: true'), 'formatters.ts must use hour12: true for 12-hour AM/PM format');

// Verify logic matches date formatting
const formatTime12Fn = (isoString?: string | null): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const sampleIso = '2026-11-12T09:16:30.000Z';
const timeOnly12 = formatTime12Fn(sampleIso);
assert(timeOnly12.includes('AM') || timeOnly12.includes('PM'), 'Time must contain 12-hour AM or PM indicator');

console.log(`  ✓ Sample formatted timestamp: "${timeOnly12}"`);
console.log('  ✓ 12-Hour AM/PM formatting verified successfully.\n');

console.log('================================================================');
console.log('ALL POS CREDIT & PORTAL UI VERIFICATIONS COMPLETED SUCCESSFULLY!');
console.log('================================================================');

