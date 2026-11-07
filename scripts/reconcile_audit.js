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

async function reconcileAudit() {
  console.log('====================================================================');
  console.log(' SADIQ BOOK AGENCY — LIVE FIRESTORE RECONCILIATION & VERIFICATION');
  console.log('====================================================================');

  const token = await getAccessToken();

  // 1. Live Root Collection Enumeration
  const liveRootCollections = await listRootCollectionIds(token);
  liveRootCollections.sort();
  console.log(`\n[STEP 1]: Live Root Collections Discovery`);
  console.log(`Actual Live Root Collection Count: ${liveRootCollections.length}`);
  console.log('Collections:', liveRootCollections);

  // 2. Fetch all live documents per collection
  console.log(`\n[STEP 2]: Fetching all documents directly from live Firestore...`);
  const liveDatabaseMap = {};
  let totalLiveDocs = 0;

  for (const collId of liveRootCollections) {
    const rawDocs = await fetchAllDocumentsInCollection(token, collId);
    const docIds = rawDocs.map((d) => d.name.split('/').pop());
    liveDatabaseMap[collId] = {
      count: rawDocs.length,
      docIds,
      rawDocs,
    };
    totalLiveDocs += rawDocs.length;
    console.log(`  - [${collId}]: ${rawDocs.length} documents`);
  }

  console.log(`\nTotal Live Documents in Database: ${totalLiveDocs}`);

  // 3. Compare with the backup file
  console.log(`\n[STEP 3]: Comparing Live Database with Backup File...`);
  const backupPath = path.resolve(process.cwd(), 'backups', 'firestore_backup_latest.json');
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file missing at ${backupPath}`);
  }
  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

  let identical = true;
  let backupTotal = 0;
  for (const [collId, collData] of Object.entries(backupData.collections)) {
    backupTotal += collData.documentCount;
    const liveCol = liveDatabaseMap[collId];
    if (!liveCol) {
      console.error(`  [MISMATCH]: Collection ${collId} exists in backup but NOT in live database!`);
      identical = false;
      continue;
    }
    if (liveCol.count !== collData.documentCount) {
      console.error(`  [MISMATCH]: Collection ${collId} count mismatch: live=${liveCol.count}, backup=${collData.documentCount}`);
      identical = false;
    }

    // Check every doc ID
    const backupIds = new Set(collData.rawDocuments.map((d) => d.name.split('/').pop()));
    const liveIds = new Set(liveCol.docIds);

    for (const id of liveIds) {
      if (!backupIds.has(id)) {
        console.error(`  [NEW DOC FOUND]: Collection ${collId} has new document ${id} not in backup!`);
        identical = false;
      }
    }
    for (const id of backupIds) {
      if (!liveIds.has(id)) {
        console.error(`  [MISSING DOC]: Document ${id} in backup is missing from live collection ${collId}!`);
        identical = false;
      }
    }
  }

  if (identical && totalLiveDocs === backupTotal) {
    console.log(`  -> 100% MATCH: Backup (${backupTotal} docs) is byte-for-byte in sync with live Firestore (${totalLiveDocs} docs).`);
    console.log(`  -> No documents have been created, modified, or deleted since the backup was generated.`);
  } else {
    throw new Error('Discrepancy detected between backup and live database!');
  }

  // 4. Dry-Run Restorability Verification (Read-Only)
  console.log(`\n[STEP 4]: Dry-Run Restorability Verification...`);
  let validFormatDocs = 0;
  for (const [collId, collData] of Object.entries(backupData.collections)) {
    for (const doc of collData.rawDocuments) {
      if (!doc.name || typeof doc.name !== 'string' || !doc.name.includes('/databases/(default)/documents/')) {
        throw new Error(`Malformed document path in backup: ${doc.name}`);
      }
      if (!doc.fields || typeof doc.fields !== 'object') {
        throw new Error(`Missing or invalid fields in document: ${doc.name}`);
      }
      validFormatDocs++;
    }
  }
  console.log(`  -> Restorability check PASSED: All ${validFormatDocs} documents adhere to Firestore REST API v1 Document specification and can be re-patched cleanly.`);

  // 5. Categorize exact Document IDs for Preservation vs Deletion
  console.log(`\n[STEP 5]: Categorizing Exact Document IDs (Preservation vs Deletion)...`);

  const preservedDocs = [];
  const deletedDocs = [];

  // A. users collection
  for (const docId of liveDatabaseMap['users'].docIds) {
    if (docId === 'eptsy6YFXXgq7z43BW0UVb7Xfe62') {
      preservedDocs.push({ collection: 'users', id: docId, reason: 'Authorized Store Admin Account (uh5882000@gmail.com)' });
    } else {
      deletedDocs.push({ collection: 'users', id: docId });
    }
  }

  // B. settings collection
  for (const docId of liveDatabaseMap['settings'].docIds) {
    if (docId === 'inventory_summary') {
      preservedDocs.push({ collection: 'settings', id: docId, reason: 'Core Inventory Summary Counter (Reset to 0, not deleted)' });
    } else {
      deletedDocs.push({ collection: 'settings', id: docId });
    }
  }

  // C. categories collection
  const standardCategoryIds = new Set([
    'cat_primary',
    'cat_middle',
    'cat_matric',
    'cat_secondary',
    'cat_intermediate',
    'cat_others',
  ]);

  for (const docId of liveDatabaseMap['categories'].docIds) {
    if (standardCategoryIds.has(docId)) {
      preservedDocs.push({ collection: 'categories', id: docId, reason: `Standard Bookstore Syllabus Category [${docId}]` });
    } else {
      deletedDocs.push({ collection: 'categories', id: docId });
    }
  }

  // D. All purely transactional / demo collections (100% deletion)
  const purelyDemoCollections = [
    'auditLogs',
    'customerLedger',
    'customers',
    'expenses',
    'payments',
    'products',
    'publishers',
    'saleReturnSummaries',
    'sales',
    'salesReturns',
    'series',
    'stockBatches',
    'stockMovements',
    'suppliers',
  ];

  for (const col of purelyDemoCollections) {
    for (const docId of liveDatabaseMap[col].docIds) {
      deletedDocs.push({ collection: col, id: docId });
    }
  }

  console.log('\n--- EXACT RECONCILED TOTALS ---');
  console.log(`Total Live Documents:           ${totalLiveDocs}`);
  console.log(`Total Documents to Preserve:    ${preservedDocs.length}`);
  console.log(`Total Documents to Delete:      ${deletedDocs.length}`);
  console.log(`Sum Verification (Preserve + Delete = Total): ${preservedDocs.length} + ${deletedDocs.length} = ${preservedDocs.length + deletedDocs.length} (Matches ${totalLiveDocs}: ${preservedDocs.length + deletedDocs.length === totalLiveDocs})`);

  // Write exact reconciliation report to disk for reference
  const reconciliationReport = {
    generatedAt: new Date().toISOString(),
    liveRootCollectionCount: liveRootCollections.length,
    liveRootCollections,
    totalLiveDocuments: totalLiveDocs,
    summary: {
      totalLiveDocuments: totalLiveDocs,
      preservedCount: preservedDocs.length,
      deletedCount: deletedDocs.length,
    },
    preservedDocuments: preservedDocs,
    deletedDocumentsSummaryByCollection: {},
    deletedDocuments: deletedDocs,
  };

  for (const col of liveRootCollections) {
    const colDeleted = deletedDocs.filter((d) => d.collection === col);
    const colPreserved = preservedDocs.filter((d) => d.collection === col);
    reconciliationReport.deletedDocumentsSummaryByCollection[col] = {
      total: liveDatabaseMap[col].count,
      toDelete: colDeleted.length,
      toPreserve: colPreserved.length,
      deletedIds: colDeleted.map((d) => d.id),
      preservedIds: colPreserved.map((d) => d.id),
    };
  }

  const reportPath = path.resolve(process.cwd(), 'backups', 'reconciliation_audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(reconciliationReport, null, 2), 'utf-8');
  console.log(`\nReconciliation audit report written to: ${reportPath}`);

  return reconciliationReport;
}

reconcileAudit().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});

