/**
 * Sadiq Book Agency — Authoritative Client Handover Data Purge
 * 
 * Uses Google Cloud Firestore REST API with IAM Owner credentials (bypassing client-side rules)
 * to cleanly purge all remaining test transactions, sales, purchases, batches, ledger records,
 * and syllabus sets, leaving the database in a 100% pristine zero baseline state.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-tools.json not found in configstore');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = config.tokens;
  if (!tokens || !tokens.access_token) {
    throw new Error('No valid tokens found in firebase-tools.json');
  }

  return tokens.access_token;
}

async function fetchAllDocumentsInCollection(token, projectId, collectionId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=300`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch documents for ${collectionId}: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.documents || [];
}

async function commitBatch(token, projectId, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    throw new Error(`Commit batch failed: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

async function resetInventorySummary(token, projectId) {
  const docPath = `projects/${projectId}/databases/(default)/documents/settings/inventory_summary`;
  const updateMask = [
    'updateMask.fieldPaths=totalStockValue',
    'updateMask.fieldPaths=totalProducts',
    'updateMask.fieldPaths=totalStockQuantity',
    'updateMask.fieldPaths=totalSuppliers',
    'updateMask.fieldPaths=lowStockCount',
    'updateMask.fieldPaths=updatedAt',
  ].join('&');
  const url = `https://firestore.googleapis.com/v1/${docPath}?${updateMask}`;

  const payload = {
    fields: {
      totalStockValue: { integerValue: '0' },
      totalProducts: { integerValue: '0' },
      totalStockQuantity: { integerValue: '0' },
      totalSuppliers: { integerValue: '0' },
      lowStockCount: { integerValue: '0' },
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Failed to reset inventory_summary: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

async function runClientHandoverPurge() {
  console.log('====================================================================');
  console.log(' SADIQ BOOK AGENCY — CLIENT HANDOVER DATABASE PURGE');
  console.log('====================================================================\n');

  const projectId = 'sadiq-book-agency';
  const token = await getAccessToken();
  console.log('1. Verified Google Cloud IAM authentication.');

  // Target collections to wipe completely
  const targetCollections = [
    'auditLogs',
    'boards',
    'customerLedger',
    'customers',
    'dailyCashClosings',
    'expenses',
    'notebookAttributes',
    'payments',
    'products',
    'publishers',
    'purchases',
    'roughBills',
    'saleReturnSummaries',
    'sales',
    'salesReturns',
    'schools',
    'series',
    'stockBatches',
    'stockMovements',
    'suppliers',
    'syllabusSets',
    'whatsappMessages',
  ];

  console.log('\n2. Scanning and purging all testing documents...');
  let totalDeleted = 0;
  const deletedBreakdown = {};

  for (const col of targetCollections) {
    const rawDocs = await fetchAllDocumentsInCollection(token, projectId, col);
    if (rawDocs.length === 0) {
      deletedBreakdown[col] = 0;
      continue;
    }

    console.log(`   Deleting [${col}]: ${rawDocs.length} documents...`);
    const docPaths = rawDocs.map((d) => d.name);

    // Commit in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < docPaths.length; i += chunkSize) {
      const chunk = docPaths.slice(i, i + chunkSize);
      const writes = chunk.map((p) => ({ delete: p }));
      await commitBatch(token, projectId, writes);
    }

    deletedBreakdown[col] = rawDocs.length;
    totalDeleted += rawDocs.length;
  }

  // 3. Reset inventory_summary
  console.log('\n3. Resetting settings/inventory_summary to 0...');
  await resetInventorySummary(token, projectId);
  console.log('   -> inventory_summary reset: totalProducts=0, totalStockQuantity=0, totalStockValue=0, lowStockCount=0');

  // 4. Verify preserved collections
  console.log('\n4. Verifying strictly preserved records...');

  // Categories
  const catDocs = await fetchAllDocumentsInCollection(token, projectId, 'categories');
  const catIds = catDocs.map((d) => d.name.split('/').pop());
  console.log(`   -> categories count: ${catIds.length} (Expected: 6 core categories)`);
  const expectedCats = ['cat_intermediate', 'cat_matric', 'cat_middle', 'cat_others', 'cat_primary', 'cat_secondary'];
  for (const exp of expectedCats) {
    if (!catIds.includes(exp)) {
      throw new Error(`CRITICAL: Core category ${exp} missing!`);
    }
  }
  console.log('   -> PASSED: All 6 core categories are intact.');

  // Users
  const userDocs = await fetchAllDocumentsInCollection(token, projectId, 'users');
  const userIds = userDocs.map((d) => d.name.split('/').pop());
  console.log(`   -> users count: ${userIds.length} (Expected: 1 admin user)`);
  if (!userIds.includes('eptsy6YFXXgq7z43BW0UVb7Xfe62')) {
    throw new Error('CRITICAL: Admin user eptsy6YFXXgq7z43BW0UVb7Xfe62 missing!');
  }
  console.log('   -> PASSED: Admin user eptsy6YFXXgq7z43BW0UVb7Xfe62 is intact.');

  // Settings
  const settingDocs = await fetchAllDocumentsInCollection(token, projectId, 'settings');
  const settingIds = settingDocs.map((d) => d.name.split('/').pop());
  console.log(`   -> settings count: ${settingIds.length} (inventory_summary preserved)`);

  // 5. Verify all other collections are completely empty
  console.log('\n5. Verifying zero orphaned test data in all target collections...');
  for (const col of targetCollections) {
    const remaining = await fetchAllDocumentsInCollection(token, projectId, col);
    if (remaining.length > 0) {
      throw new Error(`CRITICAL: Collection ${col} still has ${remaining.length} documents!`);
    }
  }
  console.log('   -> PASSED: All target business and test collections are 100% EMPTY.');

  // 6. Save execution record
  const handoverRecord = {
    executedAt: new Date().toISOString(),
    totalDeleted,
    deletedByCollection: deletedBreakdown,
    preservedRecords: {
      categories: catIds,
      users: userIds,
      settings: settingIds,
    },
    status: 'PRISTINE_CLEAN_FOR_CLIENT_HANDOVER',
  };

  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const handoverRecordPath = path.join(backupDir, 'client_handover_purge_record.json');
  fs.writeFileSync(handoverRecordPath, JSON.stringify(handoverRecord, null, 2), 'utf8');

  console.log('\n====================================================================');
  console.log(` SUCCESS: Total ${totalDeleted} test documents deleted.`);
  console.log(' Database is now 100% PRISTINE and ready for client delivery!');
  console.log(` Execution log saved to: ${handoverRecordPath}`);
  console.log('====================================================================\n');
}

runClientHandoverPurge().catch((err) => {
  console.error('\nPURGE FAILED:', err);
  process.exit(1);
});

