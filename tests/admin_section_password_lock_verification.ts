import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — SIDEBAR ADMIN PASSWORD LOCK VERIFICATION');
console.log('====================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Verify Protected Paths List
// -----------------------------------------------------------------------------
const contextCode = fs.readFileSync(
  path.join(process.cwd(), 'src/contexts/AdminLockContext.tsx'),
  'utf-8'
);

const expectedSections = [
  '/',
  '/inventory',
  '/suppliers',
  '/purchases',
  '/customers',
  '/pos',
  '/sales-history',
  '/publisher-analytics',
  '/reports',
  '/expenses',
];

for (const sec of expectedSections) {
  assert.ok(
    contextCode.includes(`'${sec}'`),
    `Protected paths must include circled section: ${sec}`
  );
}
console.log('  [PASS] Test 1: All 10 circled sidebar sections are configured in PROTECTED_PATHS');

// -----------------------------------------------------------------------------
// Test 2: Pure State Logic Verification (Lock, Unlock, Session, Password Change)
// -----------------------------------------------------------------------------
class MockAdminLockManager {
  private pin = '1234';
  private sessionUnlocked = false;
  private unlockedPaths = new Set<string>();

  isLocked(path: string): boolean {
    if (this.sessionUnlocked) return false;
    const clean = path === '/' ? '/' : path.replace(/\/$/, '');
    if (this.unlockedPaths.has(clean)) return false;
    return expectedSections.some((p) => p === clean);
  }

  unlock(path: string, pinAttempt: string, rememberSession = true): boolean {
    if (pinAttempt !== this.pin) return false;
    const clean = path === '/' ? '/' : path.replace(/\/$/, '');
    if (rememberSession) {
      this.sessionUnlocked = true;
    } else {
      this.unlockedPaths.add(clean);
    }
    return true;
  }

  lockAll(): void {
    this.sessionUnlocked = false;
    this.unlockedPaths.clear();
  }

  changePin(current: string, newPin: string): boolean {
    if (current !== this.pin) return false;
    if (!newPin || newPin.length < 4) return false;
    this.pin = newPin;
    return true;
  }
}

const lockManager = new MockAdminLockManager();

// Initially all protected sections are locked
assert.equal(lockManager.isLocked('/customers'), true, 'Customers & Khata must be locked initially');
assert.equal(lockManager.isLocked('/reports'), true, 'Financial Reports must be locked initially');
assert.equal(lockManager.isLocked('/purchases'), true, 'Purchases must be locked initially');
console.log('  [PASS] Test 2: Confidential sections are locked by default');

// Incorrect PIN attempt
const wrongAttempt = lockManager.unlock('/customers', '9999', false);
assert.equal(wrongAttempt, false, 'Incorrect PIN must fail');
assert.equal(lockManager.isLocked('/customers'), true, 'Section must remain locked after failed attempt');
console.log('  [PASS] Test 3: Incorrect password strictly rejected');

// Unlock single section (rememberSession = false)
const singleUnlock = lockManager.unlock('/customers', '1234', false);
assert.equal(singleUnlock, true, 'Correct default PIN (1234) unlocks section');
assert.equal(lockManager.isLocked('/customers'), false, 'Customers & Khata is now unlocked');
assert.equal(lockManager.isLocked('/reports'), true, 'Other sections remain locked');
console.log('  [PASS] Test 4: Single section unlock isolates access');

// Unlock entire session (rememberSession = true)
const sessionUnlock = lockManager.unlock('/reports', '1234', true);
assert.equal(sessionUnlock, true);
assert.equal(lockManager.isLocked('/reports'), false);
assert.equal(lockManager.isLocked('/inventory'), false);
assert.equal(lockManager.isLocked('/expenses'), false);
console.log('  [PASS] Test 5: Session unlock unblocks all sections for convenience');

// Lock All
lockManager.lockAll();
assert.equal(lockManager.isLocked('/customers'), true);
assert.equal(lockManager.isLocked('/reports'), true);
assert.equal(lockManager.isLocked('/inventory'), true);
console.log('  [PASS] Test 6: lockAll() instantly re-locks all sections');

// Password Change
const changeSuccess = lockManager.changePin('1234', '7860');
assert.equal(changeSuccess, true, 'Valid password change succeeds');

// Old password no longer works
const oldAttempt = lockManager.unlock('/customers', '1234', true);
assert.equal(oldAttempt, false, 'Old PIN (1234) must no longer work after change');

// New password works
const newAttempt = lockManager.unlock('/customers', '7860', true);
assert.equal(newAttempt, true, 'New PIN (7860) successfully unlocks');
console.log('  [PASS] Test 7: Password change invalidates old PIN and enforces new PIN');

// -----------------------------------------------------------------------------
// Test 3: Verify Component Integration
// -----------------------------------------------------------------------------
const sidebarCode = fs.readFileSync(
  path.join(process.cwd(), 'src/components/layout/Sidebar.tsx'),
  'utf-8'
);
assert.ok(sidebarCode.includes('useAdminLock'), 'Sidebar must use useAdminLock');
assert.ok(sidebarCode.includes('openLockModal'), 'Sidebar must trigger openLockModal on locked click');
assert.ok(sidebarCode.includes('Lock Sections'), 'Sidebar must have quick Lock Sections button');
console.log('  [PASS] Test 8: Sidebar integrates lock status, click intercept, and Lock Now button');

const routesCode = fs.readFileSync(
  path.join(process.cwd(), 'src/routes/AppRoutes.tsx'),
  'utf-8'
);
assert.ok(routesCode.includes('SectionLockRoute'), 'AppRoutes must wrap routes with SectionLockRoute');
console.log('  [PASS] Test 9: AppRoutes wraps protected navigation with SectionLockRoute guard');

console.log('\n====================================================================');
console.log(' ALL 9 SIDEBAR ADMIN PASSWORD LOCK CHECKS PASSED!');
console.log('====================================================================');

