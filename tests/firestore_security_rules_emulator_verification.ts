/**
 * SADIQ BOOK AGENCY — FIRESTORE SECURITY RULES EMULATOR VERIFICATION SUITE
 *
 * Real, authoritatively executed security rules test suite running against
 * the local Firebase Emulator Suite (Firestore on 8080, Auth on 9099).
 *
 * Verifies all identities and operations:
 * - Unauthenticated user
 * - Active Admin
 * - Active Cashier
 * - Inactive user (revoked access)
 * - Customer / non-staff identity
 * - Stock batch creation (valid, arbitrary, invalid linkage)
 * - Stock batch updates (cost immutability, quantity bounds, sale depletion, return restoration)
 * - Workflows (purchase intake, POS sale, manual stock adjustments, customer returns)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — FIRESTORE EMULATOR SECURITY VERIFICATION');
console.log('====================================================================\n');

const PROJECT_ID = 'demo-sadiq-book-agency';
const RULES_PATH = path.join(process.cwd(), 'firestore.rules');

let testEnv: RulesTestEnvironment;
let passedCount = 0;

async function runSecTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (testEnv) await testEnv.cleanup();
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------------
// SETUP & SEED TEST ENVIRONMENT
// -----------------------------------------------------------------------------------

console.log('Initializing Rules Test Environment with live local emulator...');
testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: fs.readFileSync(RULES_PATH, 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

// Seed user identities directly with security rules disabled
await testEnv.withSecurityRulesDisabled(async (context) => {
  const adminDb = context.firestore();

  // 1. Active Admin
  await setDoc(doc(adminDb, 'users', 'admin_uid'), {
    id: 'admin_uid',
    name: 'Authoritative Admin',
    email: 'admin@sadiqbookagency.com',
    role: 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  // 2. Active Cashier
  await setDoc(doc(adminDb, 'users', 'cashier_uid'), {
    id: 'cashier_uid',
    name: 'Counter Cashier',
    email: 'cashier@sadiqbookagency.com',
    role: 'cashier',
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  // 3. Inactive User (Revoked)
  await setDoc(doc(adminDb, 'users', 'inactive_uid'), {
    id: 'inactive_uid',
    name: 'Suspended Staff',
    email: 'suspended@sadiqbookagency.com',
    role: 'cashier',
    isActive: false,
    createdAt: new Date().toISOString(),
  });

  // 4. Customer / Non-staff
  await setDoc(doc(adminDb, 'users', 'customer_uid'), {
    id: 'customer_uid',
    name: 'Wholesale Customer User',
    email: 'customer@client.com',
    role: 'customer',
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  // Base Products for testing
  await setDoc(doc(adminDb, 'products', 'PROD_TEST_1'), {
    id: 'PROD_TEST_1',
    sku: 'SKU-001',
    title: 'General Science 9th',
    retailPrice: 500,
    costPrice: 250,
    publisherDiscountPercent: 50,
    currentStock: 100,
    isLowStock: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await setDoc(doc(adminDb, 'products', 'PROD_TEST_2'), {
    id: 'PROD_TEST_2',
    sku: 'SKU-002',
    title: 'Mathematics 10th',
    retailPrice: 600,
    costPrice: 300,
    publisherDiscountPercent: 50,
    currentStock: 50,
    isLowStock: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Existing Batch for update tests
  await setDoc(doc(adminDb, 'stockBatches', 'BATCH_EXISTING_1'), {
    id: 'BATCH_EXISTING_1',
    productId: 'PROD_TEST_1',
    productTitle: 'General Science 9th',
    purchaseId: 'PUR_HISTORICAL_1',
    purchaseInvoiceNo: 'INV-HIST-1',
    purchaseDate: '2026-11-01',
    quantityPurchased: 100,
    remainingQuantity: 50,
    mrp: 500,
    publisherDiscountPercent: 50,
    unitCost: 250,
    totalCost: 25000,
    batchType: 'purchase',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

console.log('Seeding completed. Executing security tests against emulator...\n');

const unauthDb = testEnv.unauthenticatedContext().firestore();
const adminDb = testEnv.authenticatedContext('admin_uid').firestore();
const cashierDb = testEnv.authenticatedContext('cashier_uid').firestore();
const inactiveDb = testEnv.authenticatedContext('inactive_uid').firestore();
const customerDb = testEnv.authenticatedContext('customer_uid').firestore();

// ===================================================================================
// PART 1: IDENTITY ACCESS CONTROL
// ===================================================================================

await runSecTest('Identity 1: Unauthenticated user is denied all read and write access', async () => {
  await assertFails(getDoc(doc(unauthDb, 'stockBatches', 'BATCH_EXISTING_1')));
  await assertFails(getDoc(doc(unauthDb, 'products', 'PROD_TEST_1')));
  await assertFails(setDoc(doc(unauthDb, 'stockBatches', 'BATCH_UNAUTH'), { fake: true }));
});

await runSecTest('Identity 2: Inactive staff user (isActive == false) is denied access', async () => {
  await assertFails(getDoc(doc(inactiveDb, 'stockBatches', 'BATCH_EXISTING_1')));
  await assertFails(getDoc(doc(inactiveDb, 'products', 'PROD_TEST_1')));
});

await runSecTest('Identity 3: Unauthorized customer/non-staff identity is denied staff resources', async () => {
  await assertFails(getDoc(doc(customerDb, 'stockBatches', 'BATCH_EXISTING_1')));
  await assertFails(setDoc(doc(customerDb, 'purchases', 'PUR_FAKE'), { fake: true }));
});

await runSecTest('Identity 4: Active Cashier can read stockBatches and products', async () => {
  await assertSucceeds(getDoc(doc(cashierDb, 'stockBatches', 'BATCH_EXISTING_1')));
  await assertSucceeds(getDoc(doc(cashierDb, 'products', 'PROD_TEST_1')));
});

await runSecTest('Identity 5: Active Admin has authoritative read access to all collections including auditLogs', async () => {
  await assertSucceeds(getDoc(doc(adminDb, 'stockBatches', 'BATCH_EXISTING_1')));
  await assertSucceeds(getDoc(doc(adminDb, 'auditLogs', 'LOG_NONEXISTENT')));
});

// ===================================================================================
// PART 2: OPERATION CATEGORY A — STOCK BATCH CREATION
// ===================================================================================

await runSecTest('A.1: Admin creates valid purchase batch linked to purchase document in atomic transaction', async () => {
  const batch = writeBatch(adminDb);
  const purchaseId = 'PUR_EMULATOR_101';
  const batchId = `BATCH_${purchaseId}_PROD_TEST_1`;

  const purRef = doc(adminDb, 'purchases', purchaseId);
  batch.set(purRef, {
    id: purchaseId,
    purchaseInvoiceNo: 'INV-PUR-101',
    supplierId: 'SUPP_01',
    supplierName: 'Sindh Textbook Board',
    items: [{ productId: 'PROD_TEST_1', quantity: 50, unitCost: 250, totalCost: 12500 }],
    subtotal: 12500,
    totalCost: 12500,
    paymentMethod: 'cash',
    purchaseDate: '2026-11-05',
    receivedByUserId: 'admin_uid',
    createdAt: new Date().toISOString(),
  });

  const batchRef = doc(adminDb, 'stockBatches', batchId);
  batch.set(batchRef, {
    id: batchId,
    productId: 'PROD_TEST_1',
    productTitle: 'General Science 9th',
    purchaseId: purchaseId,
    purchaseInvoiceNo: 'INV-PUR-101',
    purchaseDate: '2026-11-05',
    quantityPurchased: 50,
    remainingQuantity: 50,
    mrp: 500,
    publisherDiscountPercent: 50,
    unitCost: 250,
    totalCost: 12500,
    batchType: 'purchase',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await assertSucceeds(batch.commit());
});

await runSecTest('A.2: Cashier is strictly denied arbitrary opening batch creation (standalone)', async () => {
  const batchRef = doc(cashierDb, 'stockBatches', 'BATCH_OPEN_ARBITRARY_CASHIER');
  await assertFails(
    setDoc(batchRef, {
      id: 'BATCH_OPEN_ARBITRARY_CASHIER',
      productId: 'PROD_TEST_1',
      productTitle: 'General Science 9th',
      purchaseId: 'OPENING_STOCK',
      purchaseInvoiceNo: 'OPENING_STOCK',
      purchaseDate: '2026-11-05',
      quantityPurchased: 9999,
      remainingQuantity: 9999,
      mrp: 500,
      publisherDiscountPercent: 50,
      unitCost: 250,
      totalCost: 2499750,
      batchType: 'opening',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );
});

await runSecTest('A.3: Cashier is strictly denied creating purchase batches', async () => {
  const batch = writeBatch(cashierDb);
  const purId = 'PUR_CASHIER_UNAUTH';
  batch.set(doc(cashierDb, 'purchases', purId), { fake: true });
  batch.set(doc(cashierDb, 'stockBatches', `BATCH_${purId}_PROD_TEST_1`), {
    id: `BATCH_${purId}_PROD_TEST_1`,
    productId: 'PROD_TEST_1',
    purchaseId: purId,
    quantityPurchased: 50,
    remainingQuantity: 50,
    unitCost: 250,
    batchType: 'purchase',
  });
  await assertFails(batch.commit());
});

await runSecTest('A.4: Purchase batch creation without atomic purchase document fails existsAfter check', async () => {
  const batchRef = doc(adminDb, 'stockBatches', 'BATCH_PUR_NONEXISTENT_PROD1');
  await assertFails(
    setDoc(batchRef, {
      id: 'BATCH_PUR_NONEXISTENT_PROD1',
      productId: 'PROD_TEST_1',
      productTitle: 'General Science 9th',
      purchaseId: 'PUR_DOES_NOT_EXIST',
      purchaseInvoiceNo: 'INV-FAKE',
      purchaseDate: '2026-11-05',
      quantityPurchased: 50,
      remainingQuantity: 50,
      mrp: 500,
      publisherDiscountPercent: 50,
      unitCost: 250,
      totalCost: 12500,
      batchType: 'purchase',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );
});

// ===================================================================================
// PART 3: OPERATION CATEGORY B — STOCK BATCH UPDATES & IMMUTABILITY
// ===================================================================================

await runSecTest('B.1: Modifying unitCost or publisherDiscountPercent is strictly forbidden', async () => {
  const batchRef = doc(adminDb, 'stockBatches', 'BATCH_EXISTING_1');
  // Attempt to alter financial purchase cost
  await assertFails(
    updateDoc(batchRef, {
      unitCost: 100, // Attempted cost manipulation
      updatedAt: new Date().toISOString(),
    })
  );
  await assertFails(
    updateDoc(batchRef, {
      publisherDiscountPercent: 80,
      updatedAt: new Date().toISOString(),
    })
  );
});

await runSecTest('B.2: Cashier is strictly denied arbitrary quantity increase without linked return', async () => {
  const batchRef = doc(cashierDb, 'stockBatches', 'BATCH_EXISTING_1');
  // Currently remainingQuantity is 50. Cashier tries to increment to 100 without return doc
  await assertFails(
    updateDoc(batchRef, {
      remainingQuantity: 100,
      updatedAt: new Date().toISOString(),
    })
  );
});

await runSecTest('B.3: Valid sale depletion by Cashier linked via existsAfter(sales/...) succeeds', async () => {
  const saleId = 'INV-EMULATOR-SALE-001';
  const batch = writeBatch(cashierDb);

  // 1. Create Sale Document
  const saleRef = doc(cashierDb, 'sales', saleId);
  batch.set(saleRef, {
    id: saleId,
    invoiceNo: saleId,
    operatorUserId: 'cashier_uid',
    customerType: 'parchon',
    customerName: 'Walk-in Counter Customer',
    items: [
      {
        productId: 'PROD_TEST_1',
        productName: 'General Science 9th',
        quantity: 10,
        unitPrice: 500,
        sellingPrice: 500,
        lineTotal: 5000,
      },
    ],
    productIds: ['PROD_TEST_1'],
    subtotal: 5000,
    totalDiscount: 0,
    grandTotal: 5000,
    cashTendered: 5000,
    changeReturned: 0,
    paymentApplied: 5000,
    balanceAddedToCredit: 0,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    saleDate: '2026-11-05',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // 2. Decrement Product stock with lastSaleId linkage
  const prodRef = doc(cashierDb, 'products', 'PROD_TEST_1');
  batch.update(prodRef, {
    currentStock: 90,
    isLowStock: false,
    lastSaleId: saleId,
    updatedAt: new Date().toISOString(),
  });

  // 3. Deplete Batch remainingQuantity with lastSaleId linkage (50 -> 40)
  const batchRef = doc(cashierDb, 'stockBatches', 'BATCH_EXISTING_1');
  batch.update(batchRef, {
    remainingQuantity: 40,
    lastSaleId: saleId,
    updatedAt: new Date().toISOString(),
  });

  // 4. Append Stock Movement
  const moveRef = doc(cashierDb, 'stockMovements', `SM_${saleId}_PROD_TEST_1`);
  batch.set(moveRef, {
    id: `SM_${saleId}_PROD_TEST_1`,
    productId: 'PROD_TEST_1',
    productName: 'General Science 9th',
    movementType: 'out',
    quantity: 10,
    previousStock: 100,
    newStock: 90,
    reason: 'sale',
    referenceDocId: saleId,
    recordedByUserId: 'cashier_uid',
    createdAt: new Date().toISOString(),
  });

  await assertSucceeds(batch.commit());
});

await runSecTest('B.4: Valid customer return restoration by Cashier linked via existsAfter(salesReturns/...) succeeds', async () => {
  const returnNo = 'RET-EMULATOR-001';
  const batch = writeBatch(cashierDb);

  // 1. Create SaleReturn Document
  const retRef = doc(cashierDb, 'salesReturns', returnNo);
  batch.set(retRef, {
    id: returnNo,
    returnNo: returnNo,
    originalInvoiceNo: 'INV-EMULATOR-SALE-001',
    originalSaleId: 'INV-EMULATOR-SALE-001',
    customerId: '',
    customerName: 'Walk-in Counter Customer',
    items: [
      {
        productId: 'PROD_TEST_1',
        productName: 'General Science 9th',
        quantity: 5,
        sellingPrice: 500,
        refundAmount: 2500,
        condition: 'saleable',
      },
    ],
    productIds: ['PROD_TEST_1'],
    totalRefundAmount: 2500,
    refundMethod: 'cash',
    reason: 'Customer return',
    processedByUserId: 'cashier_uid',
    returnDate: '2026-11-05',
    createdAt: new Date().toISOString(),
  });

  // 2. Increment Product stock with lastReturnNo linkage (90 -> 95)
  const prodRef = doc(cashierDb, 'products', 'PROD_TEST_1');
  batch.update(prodRef, {
    currentStock: 95,
    isLowStock: false,
    lastReturnNo: returnNo,
    updatedAt: new Date().toISOString(),
  });

  // 3. Restore Batch remainingQuantity with lastReturnNo linkage (40 -> 45)
  const batchRef = doc(cashierDb, 'stockBatches', 'BATCH_EXISTING_1');
  batch.update(batchRef, {
    remainingQuantity: 45,
    lastReturnNo: returnNo,
    updatedAt: new Date().toISOString(),
  });

  // 4. Append Stock Movement
  const moveRef = doc(cashierDb, 'stockMovements', `SM_${returnNo}_PROD_TEST_1`);
  batch.set(moveRef, {
    id: `SM_${returnNo}_PROD_TEST_1`,
    productId: 'PROD_TEST_1',
    productName: 'General Science 9th',
    movementType: 'in',
    quantity: 5,
    previousStock: 90,
    newStock: 95,
    reason: 'customer_return',
    referenceDocId: returnNo,
    recordedByUserId: 'cashier_uid',
    createdAt: new Date().toISOString(),
  });

  await assertSucceeds(batch.commit());
});

await runSecTest('B.5: Return restoration with fake lastReturnNo fails without valid salesReturns document', async () => {
  const batchRef = doc(cashierDb, 'stockBatches', 'BATCH_EXISTING_1');
  await assertFails(
    updateDoc(batchRef, {
      remainingQuantity: 48,
      lastReturnNo: 'RET-FAKE-NONEXISTENT',
      updatedAt: new Date().toISOString(),
    })
  );
});

await runSecTest('B.6: Setting batch remainingQuantity > quantityPurchased is strictly rejected', async () => {
  // Batch capacity is 100. Attempt to update remainingQuantity to 150
  const batchRef = doc(adminDb, 'stockBatches', 'BATCH_EXISTING_1');
  await assertFails(
    updateDoc(batchRef, {
      remainingQuantity: 150,
      updatedAt: new Date().toISOString(),
    })
  );
});

await runSecTest('B.7: Batch deletion is permanently denied for all users including Admin', async () => {
  const batchRef = doc(adminDb, 'stockBatches', 'BATCH_EXISTING_1');
  await assertFails(deleteDoc(batchRef));
  await assertFails(deleteDoc(doc(cashierDb, 'stockBatches', 'BATCH_EXISTING_1')));
});

// ===================================================================================
// PART 4: OPERATION CATEGORY C — END-TO-END WORKFLOWS
// ===================================================================================

await runSecTest('C.1: Admin manual stock reduction (damage write-off) transaction succeeds', async () => {
  const batch = writeBatch(adminDb);
  const prodRef = doc(adminDb, 'products', 'PROD_TEST_1');
  const batchRef = doc(adminDb, 'stockBatches', 'BATCH_EXISTING_1');
  const moveRef = doc(adminDb, 'stockMovements', 'SM_DAMAGE_ADJ_001');

  // Product stock: 95 -> 90
  batch.update(prodRef, {
    currentStock: 90,
    isLowStock: false,
    updatedAt: new Date().toISOString(),
  });

  // Batch remaining: 45 -> 40
  batch.update(batchRef, {
    remainingQuantity: 40,
    updatedAt: new Date().toISOString(),
  });

  // Append movement
  batch.set(moveRef, {
    id: 'SM_DAMAGE_ADJ_001',
    productId: 'PROD_TEST_1',
    productName: 'General Science 9th',
    movementType: 'out',
    quantity: 5,
    previousStock: 95,
    newStock: 90,
    reason: 'damaged_write_off',
    referenceDocId: 'MANUAL_ADJUSTMENT',
    recordedByUserId: 'admin_uid',
    createdAt: new Date().toISOString(),
  });

  await assertSucceeds(batch.commit());
});

await runSecTest('C.2: Admin manual stock increase (found stock) establishes cost basis and succeeds', async () => {
  const batch = writeBatch(adminDb);
  const prodRef = doc(adminDb, 'products', 'PROD_TEST_1');
  const openBatchRef = doc(adminDb, 'stockBatches', 'BATCH_OPEN_PROD_TEST_1');
  const moveRef = doc(adminDb, 'stockMovements', 'SM_FOUND_ADJ_001');

  // Product stock: 90 -> 100
  batch.update(prodRef, {
    currentStock: 100,
    isLowStock: false,
    updatedAt: new Date().toISOString(),
  });

  // Create virtual opening batch for found stock
  batch.set(openBatchRef, {
    id: 'BATCH_OPEN_PROD_TEST_1',
    productId: 'PROD_TEST_1',
    productTitle: 'General Science 9th',
    purchaseId: 'STOCK_ADJUSTMENT',
    purchaseInvoiceNo: 'ADJ_FOUND_STOCK',
    purchaseDate: '2026-11-05',
    quantityPurchased: 10,
    remainingQuantity: 10,
    mrp: 500,
    publisherDiscountPercent: 50,
    unitCost: 250,
    totalCost: 2500,
    batchType: 'opening',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Append movement
  batch.set(moveRef, {
    id: 'SM_FOUND_ADJ_001',
    productId: 'PROD_TEST_1',
    productName: 'General Science 9th',
    movementType: 'in',
    quantity: 10,
    previousStock: 90,
    newStock: 100,
    reason: 'found_stock',
    referenceDocId: 'MANUAL_ADJUSTMENT',
    recordedByUserId: 'admin_uid',
    createdAt: new Date().toISOString(),
  });

  await assertSucceeds(batch.commit());
});

await runSecTest('C.3: Damaged customer return creates salesReturns document without increasing saleable stock', async () => {
  const returnNo = 'RET-EMULATOR-DAMAGED-001';
  const batch = writeBatch(cashierDb);

  const retRef = doc(cashierDb, 'salesReturns', returnNo);
  batch.set(retRef, {
    id: returnNo,
    returnNo: returnNo,
    originalInvoiceNo: 'INV-EMULATOR-SALE-001',
    originalSaleId: 'INV-EMULATOR-SALE-001',
    customerId: '',
    customerName: 'Walk-in Counter Customer',
    items: [
      {
        productId: 'PROD_TEST_1',
        productName: 'General Science 9th',
        quantity: 2,
        sellingPrice: 500,
        refundAmount: 1000,
        condition: 'damaged', // Damaged goods must NOT increment inventory
      },
    ],
    productIds: ['PROD_TEST_1'],
    totalRefundAmount: 1000,
    refundMethod: 'cash',
    reason: 'Defective pages / damaged',
    processedByUserId: 'cashier_uid',
    returnDate: '2026-11-05',
    createdAt: new Date().toISOString(),
  });

  // In damaged return, no update to products or stockBatches is written!
  await assertSucceeds(batch.commit());
});

// Clean up test environment
await testEnv.cleanup();

console.log('\n====================================================================');
console.log(` ALL ${passedCount} FIRESTORE EMULATOR SECURITY RULES TESTS PASSED!`);
console.log('====================================================================\n');
process.exit(0);

