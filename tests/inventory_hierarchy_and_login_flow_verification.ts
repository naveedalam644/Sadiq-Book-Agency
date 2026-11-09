import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Starting Inventory Hierarchy & Login Lock Flow Verification ---');

const inventoryPath = path.resolve('src/pages/Inventory.tsx');
const loginPath = path.resolve('src/pages/Login.tsx');
const protectedRoutePath = path.resolve('src/routes/ProtectedRoute.tsx');
const sectionLockRoutePath = path.resolve('src/routes/SectionLockRoute.tsx');

assert.ok(fs.existsSync(inventoryPath), 'Inventory.tsx must exist');
assert.ok(fs.existsSync(loginPath), 'Login.tsx must exist');
assert.ok(fs.existsSync(protectedRoutePath), 'ProtectedRoute.tsx must exist');
assert.ok(fs.existsSync(sectionLockRoutePath), 'SectionLockRoute.tsx must exist');

const inventoryContent = fs.readFileSync(inventoryPath, 'utf8');
const loginContent = fs.readFileSync(loginPath, 'utf8');
const protectedRouteContent = fs.readFileSync(protectedRoutePath, 'utf8');
const sectionLockRouteContent = fs.readFileSync(sectionLockRoutePath, 'utf8');

// ============================================================================
// PART 1: Inventory Hierarchy Selection & Full Catalog Option
// ============================================================================
console.log('\n--- Part 1: Inventory Hierarchy Selection & Catalog Toggle ---');

// Test 1: showAllProducts state and hierarchy conditions
console.log('Test 1: Verifying showAllProducts state and hierarchy conditions...');
assert.ok(
  inventoryContent.includes('const [showAllProducts, setShowAllProducts] = useState(false);'),
  'Must declare showAllProducts state defaulting to false (not showing all products immediately)'
);
assert.ok(
  inventoryContent.includes('const isHierarchyComplete ='),
  'Must compute isHierarchyComplete based on Publisher, Series, and Class'
);
assert.ok(
  inventoryContent.includes('const shouldDisplayProducts ='),
  'Must compute shouldDisplayProducts based on hierarchy, full catalog toggle, or search'
);
console.log('✓ Test 1 Passed: Hierarchy and full catalog toggle state declared.');

// Test 2: Conditional loadProducts trigger
console.log('Test 2: Verifying loadProducts is triggered conditionally...');
assert.ok(
  inventoryContent.includes('if (shouldDisplayProducts)'),
  'Must only fetch/display products when shouldDisplayProducts is true'
);
assert.ok(
  inventoryContent.includes('setProducts([]);') &&
    inventoryContent.includes('setProductsLoading(false);'),
  'Must keep product list empty when hierarchy is not selected and full catalog is off'
);
console.log('✓ Test 2 Passed: Direct full table load on initial open is prevented.');

// Test 3: 3-Step Selection Controls (Publisher -> Series -> Class)
console.log('Test 3: Verifying 3-Step UI selectors (Publisher, Series, Class)...');
assert.ok(
  inventoryContent.includes('Publisher') && inventoryContent.includes('Select Publisher...'),
  'Step 1 Publisher selector must be present'
);
assert.ok(
  inventoryContent.includes('Series') && inventoryContent.includes('disabled={!hasPublisher}'),
  'Step 2 Series selector must be dependent on Publisher'
);
assert.ok(
  inventoryContent.includes('Class') && inventoryContent.includes('disabled={!hasPublisher}'),
  'Step 3 Class selector must be dependent on Publisher'
);
assert.ok(
  inventoryContent.includes('View Full Catalog'),
  'Must provide View Full Catalog button for owner flexibility'
);
console.log('✓ Test 3 Passed: 3-Step hierarchy selectors and full catalog button verified.');

// Test 4: Guidance placeholder when products are not displayed
console.log('Test 4: Verifying Guidance Card placeholder...');
assert.ok(
  inventoryContent.includes('Select Publisher, Series & Class to View Books'),
  'Guidance Card must prompt user to select Publisher, Series, and Class'
);
assert.ok(
  inventoryContent.includes('View Full Catalog (All Products)'),
  'Guidance Card must include CTA to view full catalog if desired'
);
assert.ok(
  inventoryContent.includes('Or Click a Publisher to Begin:'),
  'Guidance Card must render quick publisher selection chips'
);
console.log('✓ Test 4 Passed: Guidance Card placeholder present.');

// Test 5: Active filter indicator & Reset option
console.log('Test 5: Verifying active filter indicator and Reset option...');
assert.ok(
  inventoryContent.includes('Active Hierarchy Filter:'),
  'Must show breadcrumb indicator when hierarchy filter is active'
);
assert.ok(
  inventoryContent.includes('handleResetHierarchy'),
  'Must provide reset function to clear hierarchy and full catalog mode'
);
console.log('✓ Test 5 Passed: Active filter indicator and reset option verified.');

// ============================================================================
// PART 2: Admin Login & Security Lock Flow
// ============================================================================
console.log('\n--- Part 2: Admin Login & Security Lock Flow ---');

// Test 6: Login.tsx destination redirection to /pos
console.log('Test 6: Verifying Login.tsx lands user directly in /pos...');
assert.ok(
  loginContent.includes("const rawFrom = (location.state as any)?.from?.pathname;"),
  'Login.tsx must check rawFrom pathname'
);
assert.ok(
  loginContent.includes("const from = rawFrom && rawFrom !== '/' ? rawFrom : '/pos';"),
  'Login.tsx must route user to /pos so Billing & POS is active immediately without asking password again'
);
console.log('✓ Test 6 Passed: Login.tsx redirects directly to /pos.');

// Test 7: ProtectedRoute.tsx redirection logic
console.log('Test 7: Verifying ProtectedRoute.tsx preserves /pos as default destination...');
assert.ok(
  protectedRouteContent.includes("const returnPath = location.pathname === '/' ? '/pos' : location.pathname;"),
  'ProtectedRoute must replace root path with /pos in state.from'
);
console.log('✓ Test 7 Passed: ProtectedRoute sets default return path to /pos.');

// Test 8: SectionLockRoute.tsx root path redirect to /pos
console.log('Test 8: Verifying SectionLockRoute.tsx redirects root / to /pos when locked...');
assert.ok(
  sectionLockRouteContent.includes("if (location.pathname === '/') {\n    return <Navigate to=\"/pos\" replace />;"),
  'SectionLockRoute must redirect locked root hits to /pos so cashier mode is seamless'
);
console.log('✓ Test 8 Passed: SectionLockRoute redirects root hits to /pos.');

console.log('\n=== ALL INVENTORY HIERARCHY & LOGIN LOCK TESTS PASSED! ===');
