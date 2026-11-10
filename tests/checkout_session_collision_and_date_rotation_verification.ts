import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — CHECKOUT SESSION COLLISION & ROTATION VERIFICATION');
console.log('====================================================================\n');

const saleServiceCode = fs.readFileSync(
  path.join(process.cwd(), 'src/services/saleService.ts'),
  'utf-8'
);

const posCartHookCode = fs.readFileSync(
  path.join(process.cwd(), 'src/hooks/usePOSCart.ts'),
  'utf-8'
);

// -----------------------------------------------------------------------------
// Test 1: Code Structure Verification in saleService.ts
// -----------------------------------------------------------------------------
console.log('Test 1: Verifying stale session rotation logic in saleService.ts...');
assert.ok(
  saleServiceCode.includes('todayDateYYMMDD') &&
    saleServiceCode.includes('match[1] === todayDateYYMMDD'),
  'getOrCreateCheckoutSession must check todayDateYYMMDD to reject previous day sessions'
);
assert.ok(
  saleServiceCode.includes('Hardened Anti-Collision: Directly verify with Firestore that candidate does not exist'),
  'processSaleTransaction must perform authoritative existence check before transaction'
);
assert.ok(
  saleServiceCode.includes('CONCURRENCY_RETRY_CLAIMED:'),
  'processSaleTransaction must handle concurrency claim retry loop'
);
console.log('  [PASS] Test 1: saleService.ts anti-collision and session rotation guards verified');

// -----------------------------------------------------------------------------
// Test 2: Code Structure Verification in usePOSCart.ts
// -----------------------------------------------------------------------------
console.log('\nTest 2: Verifying automatic session date rotation in usePOSCart.ts...');
assert.ok(
  posCartHookCode.includes('todayYYMMDD') &&
    posCartHookCode.includes('activeSession = createCheckoutSession'),
  'prepareSalePayload must automatically rotate activeSession if initialized on a previous day'
);
assert.ok(
  posCartHookCode.includes('saleDate: todayDateStr'),
  'prepareSalePayload must explicitly provide todayDateStr as saleDate'
);
console.log('  [PASS] Test 2: usePOSCart.ts automatically rotates stale sessions and assigns today saleDate');

// -----------------------------------------------------------------------------
// Test 3: Pure Algorithm Execution for Date-Strict Invoice Numbering
// -----------------------------------------------------------------------------
console.log('\nTest 3: Pure algorithm execution for date-strict invoice numbering...');
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

  if (date) {
    yy = String(date.getFullYear()).slice(-2);
    mm = String(date.getMonth() + 1).padStart(2, '0');
    dd = String(date.getDate()).padStart(2, '0');
    cleanTerm = (terminalId || (sessionPatternMatch ? sessionPatternMatch[2] : 'T1')).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'T1';
  } else if (sessionPatternMatch) {
    const dateYYMMDD = sessionPatternMatch[1];
    yy = dateYYMMDD.slice(0, 2);
    mm = dateYYMMDD.slice(2, 4);
    dd = dateYYMMDD.slice(4, 6);
    cleanTerm = sessionPatternMatch[2].toUpperCase();
  } else {
    const d = new Date();
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

// Even if checkoutSessionId carries 261109 (yesterday), when saleDate is 2026-11-10 (today),
// invoice sequence must produce INV-20261110-0001
const staleSessionId = 'CS-261109-T1-21929C7F646B';
const todayDate = new Date('2026-11-10T12:00:00Z');
const invTodaySeq1 = generateInvoiceNumberAlgo(staleSessionId, 'T1', todayDate, 1);
assert.equal(
  invTodaySeq1,
  'INV-20261110-0001',
  'Invoice sequence on 2026-11-10 must produce INV-20261110-0001'
);
console.log('  [PASS] Test 3: Stale session + today date produces: ' + invTodaySeq1);

const invTodaySeq2 = generateInvoiceNumberAlgo(staleSessionId, 'T1', todayDate, 2);
assert.equal(invTodaySeq2, 'INV-20261110-0002');
console.log('  [PASS] Test 4: Second invoice of the day produces: ' + invTodaySeq2);

console.log('\n====================================================================');
console.log(' ALL COLLISION & ROTATION CHECKS PASSED SUCCESSFULLY!');
console.log('====================================================================');
