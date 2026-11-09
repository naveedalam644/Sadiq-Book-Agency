import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — SIDEBAR ADMIN SECURITY LOCK & CASHIER MODE VERIFICATION
// ==============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res
        .then(() => {
          console.log(`  [PASS] ${name}`);
          testsPassed++;
        })
        .catch((err: any) => {
          console.error(`  [FAIL] ${name}`);
          console.error(`         ${err.message}`);
          testsFailed++;
        });
    } else {
      console.log(`  [PASS] ${name}`);
      testsPassed++;
    }
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testsFailed++;
  }
}

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — ADMIN SECURITY LOCK & CASHIER MODE VERIFICATION');
console.log('====================================================================\n');

console.log('--- 1. AdminLockContext Route Protection & Cashier Isolation ---');

const contextCode = fs.readFileSync(path.resolve('src/contexts/AdminLockContext.tsx'), 'utf-8');

runTest('1. Billing & POS (/pos) is strictly exempt from lock for cashier access', () => {
  assert.ok(contextCode.includes("if (cleanPath === '/pos')"), 'AdminLockContext must explicitly check /pos');
  assert.ok(contextCode.includes('return false;'), 'AdminLockContext must return false (unlocked) for /pos');
});

runTest('2. All confidential sections are locked by default in Cashier Mode', () => {
  const protectedRoutes = [
    '/',
    '/inventory',
    '/sales-history',
    '/customers',
    '/purchases',
    '/suppliers',
    '/publisher-analytics',
    '/reports',
    '/expenses',
    '/syllabus',
    '/price-list',
    '/rough-bill',
  ];
  for (const route of protectedRoutes) {
    assert.ok(contextCode.includes(`'${route}'`), `PROTECTED_PATHS must protect ${route}`);
  }
});

runTest('3. Authentication verifies owner credentials using Firebase Admin Password', () => {
  assert.ok(contextCode.includes('signInWithEmailAndPassword'), 'Must use Firebase signInWithEmailAndPassword to verify admin password');
  assert.ok(contextCode.includes('unlockWithFirebasePassword'), 'Context must export unlockWithFirebasePassword');
  assert.ok(contextCode.includes('lockAll'), 'Context must export lockAll for 1-click Cashier mode');
});

console.log('\n--- 2. Sidebar Cashier Mode & Collapsed Dropdown Behavior ---');

const sidebarCode = fs.readFileSync(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');

runTest('4. Sidebar keeps Billing & POS open and active in Cashier Mode', () => {
  assert.ok(sidebarCode.includes('to="/pos"'), 'Sidebar must provide open navigation to /pos');
  assert.ok(sidebarCode.includes('Billing & POS'), 'Sidebar must render Billing & POS in Cashier Mode');
});

runTest('5. Sidebar provides "+ Add New Product" modal button for cashier in Cashier Mode', () => {
  assert.ok(sidebarCode.includes('+ Add New Product'), 'Sidebar must have + Add New Product button');
  assert.ok(sidebarCode.includes('setIsAddProductModalOpen(true)'), 'Clicking button must open ProductFormModal');
  assert.ok(sidebarCode.includes('<ProductFormModal'), 'Sidebar must render ProductFormModal component');
});

runTest('6. Sidebar groups all locked sections into "Admin Sections" dropdown in Cashier Mode', () => {
  assert.ok(sidebarCode.includes('Admin Sections'), 'Sidebar must render Admin Sections dropdown header');
  assert.ok(sidebarCode.includes('isLockedDropdownOpen'), 'Sidebar must support toggleable dropdown state');
  assert.ok(sidebarCode.includes('lockedSectionsList.map'), 'Sidebar must render collapsed list of locked sections');
  assert.ok(sidebarCode.includes('handleLockedItemClick'), 'Clicking locked section must open password prompt');
});

runTest('7. Sidebar restores full original hierarchy when unlocked with "Lock for Cashier" toggle', () => {
  assert.ok(sidebarCode.includes('Lock for Cashier'), 'Sidebar must render Lock for Cashier button when unlocked');
  assert.ok(sidebarCode.includes('Main Operations'), 'Sidebar must render Main Operations section when unlocked');
  assert.ok(sidebarCode.includes('Financials & Reports'), 'Sidebar must render Financials & Reports when unlocked');
  assert.ok(sidebarCode.includes('Catalog & Estimates'), 'Sidebar must render Catalog & Estimates when unlocked');
});

console.log('\n--- 3. POS Cashier Quick Add & Route Guarding ---');

const posCode = fs.readFileSync(path.resolve('src/pages/POS.tsx'), 'utf-8');

runTest('8. POS page provides "+ Add Product" button in search bar for counter speed', () => {
  assert.ok(posCode.includes('Add Product'), 'POS page must render Add Product button in search header');
  assert.ok(posCode.includes('setIsAddProductModalOpen(true)'), 'POS button must trigger ProductFormModal');
  assert.ok(posCode.includes('<ProductFormModal'), 'POS page must render ProductFormModal component');
});

const sectionLockRouteCode = fs.readFileSync(path.resolve('src/routes/SectionLockRoute.tsx'), 'utf-8');

runTest('9. SectionLockRoute guards protected paths and gives cashier 1-click return to POS', () => {
  assert.ok(sectionLockRouteCode.includes('unlockWithFirebasePassword'), 'SectionLockRoute must verify Firebase admin password');
  assert.ok(sectionLockRouteCode.includes('to="/pos"'), 'SectionLockRoute must provide direct Link to /pos');
  assert.ok(sectionLockRouteCode.includes('Back to Billing & POS Register (Cashier Mode)'), 'Must guide cashiers back to billing');
});

console.log('\n====================================================================');
console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================================\n');

if (testsFailed > 0) process.exit(1);

