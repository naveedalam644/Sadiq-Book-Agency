import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-tools.json not found');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = config.tokens;
  if (!tokens) throw new Error('No tokens found in firebase-tools.json');

  if (tokens.refresh_token) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho85qd6.apps.googleusercontent.com',
          client_secret: '',
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      });

      const refreshData = await refreshRes.json();
      if (refreshData.access_token) return refreshData.access_token;
    } catch (err) {
      console.warn('Token refresh notice:', err.message);
    }
  }

  return tokens.access_token;
}

async function listRootCollectionIds(token) {
  const projectId = 'sadiq-book-agency';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Failed to list collection IDs: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.collectionIds || [];
}

async function fetchAllDocumentsInCollection(token, collectionId) {
  const projectId = 'sadiq-book-agency';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=100`;

  let docs = [];
  let pageToken = null;

  do {
    const fetchUrl = pageToken ? `${url}&pageToken=${pageToken}` : url;
    const res = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch documents for ${collectionId}: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (data.documents) {
      docs.push(...data.documents);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return docs;
}

async function commitBatch(token, writes) {
  const projectId = 'sadiq-book-agency';
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

async function resetInventorySummary(token) {
  const projectId = 'sadiq-book-agency';
  const docPath = `projects/${projectId}/databases/(default)/documents/settings/inventory_summary`;
  const updateMask = 'updateMask.fieldPaths=totalStockValue&updateMask.fieldPaths=totalProducts&updateMask.fieldPaths=totalStockQuantity&updateMask.fieldPaths=totalSuppliers&updateMask.fieldPaths=lowStockCount&updateMask.fieldPaths=updatedAt';
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

async function executeCleanup() {
  console.log('====================================================================');
  console.log(' SADIQ BOOK AGENCY — PHASE 6: CONTROLLED CLEANUP EXECUTION');
  console.log('====================================================================');

  const reportPath = path.resolve(process.cwd(), 'backups', 'reconciliation_audit_report.json');
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Reconciliation report not found at: ${reportPath}`);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

  const token = await getAccessToken();
  console.log('Authentication verified with Google Cloud / Firestore.');

  // 1. Pre-Flight Verification
  console.log('\n[PRE-FLIGHT CHECK]: Validating live Firestore against approved audit...');
  const liveRootCollections = await listRootCollectionIds(token);
  const liveDbMap = {};
  let liveTotalDocs = 0;

  for (const col of liveRootCollections) {
    const rawDocs = await fetchAllDocumentsInCollection(token, col);
    const ids = new Set(rawDocs.map((d) => d.name.split('/').pop()));
    liveDbMap[col] = { count: rawDocs.length, ids };
    liveTotalDocs += rawDocs.length;
  }

  if (liveTotalDocs !== report.summary.totalLiveDocuments) {
    throw new Error(`SAFETY ABORT: Current live doc count (${liveTotalDocs}) does not match approved audit count (${report.summary.totalLiveDocuments})!`);
  }

  const approvedDeleteMap = {};
  for (const item of report.deletedDocuments) {
    if (!approvedDeleteMap[item.collection]) approvedDeleteMap[item.collection] = new Set();
    approvedDeleteMap[item.collection].add(item.id);
  }

  const approvedPreserveMap = {};
  for (const item of report.preservedDocuments) {
    if (!approvedPreserveMap[item.collection]) approvedPreserveMap[item.collection] = new Set();
    approvedPreserveMap[item.collection].add(item.id);
  }

  // Ensure every document to delete exists
  for (const [col, idSet] of Object.entries(approvedDeleteMap)) {
    const liveCol = liveDbMap[col];
    if (!liveCol) throw new Error(`SAFETY ABORT: Collection ${col} missing from live database.`);
    for (const id of idSet) {
      if (!liveCol.ids.has(id)) {
        throw new Error(`SAFETY ABORT: Approved document for deletion ${col}/${id} not found in live database.`);
      }
    }
  }

  // Ensure every document to preserve exists
  for (const [col, idSet] of Object.entries(approvedPreserveMap)) {
    const liveCol = liveDbMap[col];
    if (!liveCol) throw new Error(`SAFETY ABORT: Protected collection ${col} missing from live database.`);
    for (const id of idSet) {
      if (!liveCol.ids.has(id)) {
        throw new Error(`SAFETY ABORT: Protected document ${col}/${id} not found in live database.`);
      }
    }
  }

  console.log('Pre-flight verification PASSED: All 198 documents to delete and 8 documents to preserve are strictly accounted for.');

  // 2. Step 1: Reset settings/inventory_summary
  console.log('\n[STEP 1]: Resetting settings/inventory_summary metrics to zero...');
  const resetResult = await resetInventorySummary(token);
  console.log('  -> inventory_summary metrics reset to:');
  console.log('     totalStockValue: 0, totalProducts: 0, totalStockQuantity: 0, totalSuppliers: 0, lowStockCount: 0');
  console.log(`     updatedAt: ${resetResult.fields.updatedAt.timestampValue}`);

  // 3. Step 2: Delete approved documents in controlled batches
  console.log('\n[STEP 2]: Executing controlled deletion of 198 approved documents...');
  const projectId = 'sadiq-book-agency';
  let totalDeleted = 0;
  const executionLog = {};

  // Order of deletion: child transactional records first, parents last
  const deletionOrder = [
    'auditLogs',
    'customerLedger',
    'payments',
    'saleReturnSummaries',
    'salesReturns',
    'sales',
    'stockMovements',
    'stockBatches',
    'products',
    'series',
    'publishers',
    'customers',
    'suppliers',
    'expenses',
    'categories',
  ];

  for (const col of deletionOrder) {
    const idsToDelete = approvedDeleteMap[col] ? Array.from(approvedDeleteMap[col]) : [];
    if (idsToDelete.length === 0) continue;

    console.log(`  Deleting [${col}] (${idsToDelete.length} documents)...`);

    // Batch in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
      const chunk = idsToDelete.slice(i, i + chunkSize);
      const writes = chunk.map((id) => ({
        delete: `projects/${projectId}/databases/(default)/documents/${col}/${id}`,
      }));

      const commitRes = await commitBatch(token, writes);
      if (!commitRes.writeResults || commitRes.writeResults.length !== chunk.length) {
        throw new Error(`Deletion verification failed for ${col} chunk starting at ${i}`);
      }
    }

    totalDeleted += idsToDelete.length;
    executionLog[col] = idsToDelete.length;
    console.log(`    -> Confirmed: ${idsToDelete.length} documents deleted from [${col}].`);
  }

  console.log(`\nDeletion complete: Exactly ${totalDeleted} / 198 documents deleted.`);

  // 4. Step 3: Post-Execution Live Database Audit & Verification
  console.log('\n[STEP 3]: Post-Execution Live Database Verification...');
  const remainingCollections = await listRootCollectionIds(token);
  console.log('Remaining Collections in Firestore:', remainingCollections);

  let totalRemainingDocs = 0;
  const remainingDocsByCol = {};

  for (const col of remainingCollections) {
    const docs = await fetchAllDocumentsInCollection(token, col);
    remainingDocsByCol[col] = docs.map((d) => d.name.split('/').pop());
    totalRemainingDocs += docs.length;
    console.log(`  - [${col}]: ${docs.length} documents remaining:`, remainingDocsByCol[col]);
  }

  console.log('\n--- VERIFICATION CHECKS ---');
  console.log(`1. Total Remaining Documents: ${totalRemainingDocs} (Expected: 8)`);
  if (totalRemainingDocs !== 8) {
    throw new Error(`VERIFICATION FAILED: Expected 8 remaining documents, found ${totalRemainingDocs}`);
  }
  console.log('   -> PASSED');

  console.log('2. Admin User Preservation:');
  const userDocs = remainingDocsByCol['users'] || [];
  if (userDocs.length !== 1 || userDocs[0] !== 'eptsy6YFXXgq7z43BW0UVb7Xfe62') {
    throw new Error(`VERIFICATION FAILED: Expected admin user eptsy6YFXXgq7z43BW0UVb7Xfe62, found: ${userDocs.join(', ')}`);
  }
  console.log('   -> PASSED: Admin user eptsy6YFXXgq7z43BW0UVb7Xfe62 is intact.');

  console.log('3. Settings Inventory Summary Preservation:');
  const settingsDocs = remainingDocsByCol['settings'] || [];
  if (settingsDocs.length !== 1 || settingsDocs[0] !== 'inventory_summary') {
    throw new Error(`VERIFICATION FAILED: Expected settings/inventory_summary, found: ${settingsDocs.join(', ')}`);
  }
  console.log('   -> PASSED: settings/inventory_summary is intact.');

  console.log('4. Standard Categories Preservation (6 core categories):');
  const catDocs = new Set(remainingDocsByCol['categories'] || []);
  const expectedCats = ['cat_primary', 'cat_middle', 'cat_matric', 'cat_secondary', 'cat_intermediate', 'cat_others'];
  for (const catId of expectedCats) {
    if (!catDocs.has(catId)) {
      throw new Error(`VERIFICATION FAILED: Expected category ${catId} not found!`);
    }
  }
  if (catDocs.size !== 6) {
    throw new Error(`VERIFICATION FAILED: Expected exactly 6 categories, found ${catDocs.size}`);
  }
  console.log('   -> PASSED: All 6 core syllabus categories are intact.');

  console.log('5. Zero Orphaned Data:');
  const clearedCollections = [
    'products',
    'stockBatches',
    'stockMovements',
    'publishers',
    'series',
    'suppliers',
    'customers',
    'customerLedger',
    'sales',
    'salesReturns',
    'saleReturnSummaries',
    'payments',
    'expenses',
    'auditLogs',
  ];

  for (const col of clearedCollections) {
    if (remainingCollections.includes(col)) {
      const cnt = remainingDocsByCol[col]?.length || 0;
      if (cnt > 0) {
        throw new Error(`VERIFICATION FAILED: Collection ${col} still has ${cnt} documents!`);
      }
    }
  }
  console.log('   -> PASSED: All 14 business and test transaction collections are completely empty.');

  // Save execution record
  const executionRecord = {
    executedAt: new Date().toISOString(),
    totalDeleted,
    deletedByCollection: executionLog,
    totalRemainingDocs,
    remainingDocumentsByCollection: remainingDocsByCol,
    allVerificationsPassed: true,
  };

  const execLogPath = path.resolve(process.cwd(), 'backups', 'cleanup_execution_record.json');
  fs.writeFileSync(execLogPath, JSON.stringify(executionRecord, null, 2), 'utf-8');
  console.log(`\nExecution record saved to: ${execLogPath}`);
  console.log('\n====================================================================');
  console.log(' SADIQ BOOK AGENCY — CLEANUP SUCCESSFULLY EXECUTED AND VERIFIED!');
  console.log('====================================================================');
}

executeCleanup().catch((err) => {
  console.error('CLEANUP FAILED:', err);
  process.exit(1);
});

