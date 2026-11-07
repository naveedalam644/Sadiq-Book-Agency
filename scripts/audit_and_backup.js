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
  if (!tokens) {
    throw new Error('No tokens found in firebase-tools.json');
  }

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
      if (refreshData.access_token) {
        return refreshData.access_token;
      }
    } catch (err) {
      console.warn('Token refresh failed, falling back to cached access_token:', err.message);
    }
  }

  return tokens.access_token;
}

function parseFirestoreValue(val) {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('referenceValue' in val) return val.referenceValue;
  if ('geoPointValue' in val) return val.geoPointValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(parseFirestoreValue);
  }
  if ('mapValue' in val) {
    const res = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = parseFirestoreValue(v);
    }
    return res;
  }
  return val;
}

function parseFirestoreDoc(doc) {
  const result = {
    _id: doc.name.split('/').pop(),
    _path: doc.name,
    _createTime: doc.createTime,
    _updateTime: doc.updateTime,
  };
  const fields = doc.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    result[k] = parseFirestoreValue(v);
  }
  return result;
}

async function listCollectionIds(token, parentPath = '') {
  const projectId = 'sadiq-book-agency';
  const url = parentPath
    ? `https://firestore.googleapis.com/v1/${parentPath}:listCollectionIds`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to list collection IDs for ${parentPath || 'root'}: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return data.collectionIds || [];
}

async function fetchAllDocumentsInCollection(token, collectionId, parentDocPath = '') {
  const projectId = 'sadiq-book-agency';
  let url = parentDocPath
    ? `https://firestore.googleapis.com/v1/${parentDocPath}/${collectionId}?pageSize=100`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=100`;

  let docs = [];
  let pageToken = null;

  do {
    const fetchUrl = pageToken ? `${url}&pageToken=${pageToken}` : url;
    const res = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to fetch documents for ${collectionId}: ${res.status} ${txt}`);
    }

    const data = await res.json();
    if (data.documents) {
      docs.push(...data.documents);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return docs;
}

async function auditAndBackup() {
  console.log('====================================================================');
  console.log(' SADIQ BOOK AGENCY — READ-ONLY FIRESTORE AUDIT & BACKUP GENERATION');
  console.log('====================================================================');

  const token = await getAccessToken();
  console.log('Authenticated to Google Cloud / Firestore via CLI token.');

  // 1. Discover all root collections
  const rootCollections = await listCollectionIds(token);
  console.log(`Discovered ${rootCollections.length} root collections:`, rootCollections);

  const fullBackup = {
    metadata: {
      projectId: 'sadiq-book-agency',
      backupCreatedAt: new Date().toISOString(),
      backupPurpose: 'Pre-handover complete Firestore snapshot before test data cleanup',
      totalRootCollections: rootCollections.length,
      totalDocuments: 0,
    },
    collections: {},
  };

  const auditReport = [];

  for (const collId of rootCollections) {
    process.stdout.write(`Fetching collection: [${collId}]... `);
    const rawDocs = await fetchAllDocumentsInCollection(token, collId);
    console.log(`Found ${rawDocs.length} documents.`);

    const parsedDocs = rawDocs.map(parseFirestoreDoc);

    // Sample first 2 docs for any nested subcollections
    const subCollsFound = [];
    const sampleDocs = rawDocs.slice(0, 2);
    for (const sample of sampleDocs) {
      try {
        const subColls = await listCollectionIds(token, sample.name);
        if (subColls.length > 0) {
          subCollsFound.push(...subColls);
        }
      } catch (err) {
        // ignore
      }
    }

    fullBackup.collections[collId] = {
      collectionId: collId,
      documentCount: rawDocs.length,
      rawDocuments: rawDocs,
      documents: parsedDocs,
      subcollections: subCollsFound,
    };

    fullBackup.metadata.totalDocuments += rawDocs.length;

    auditReport.push({
      collection: collId,
      docs: rawDocs.length,
      subcollections: subCollsFound.length > 0 ? subCollsFound.join(', ') : 'None',
      sampleIds: parsedDocs.slice(0, 3).map((d) => d._id).join(', '),
    });
  }

  // 2. Write Backup to Disk
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_');
  const backupFilePath = path.join(backupDir, `firestore_backup_${timestamp}.json`);
  const latestBackupFilePath = path.join(backupDir, `firestore_backup_latest.json`);

  console.log(`\nWriting full backup to: ${backupFilePath}...`);
  fs.writeFileSync(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf-8');
  fs.writeFileSync(latestBackupFilePath, JSON.stringify(fullBackup, null, 2), 'utf-8');

  const stats = fs.statSync(backupFilePath);
  console.log(`Backup saved successfully. File size: ${(stats.size / 1024).toFixed(2)} KB`);

  // 3. Verify Backup Integrity
  console.log('\n--- VERIFYING BACKUP FILE INTEGRITY ---');
  const readBack = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
  let verifiedDocs = 0;
  for (const [col, colData] of Object.entries(readBack.collections)) {
    verifiedDocs += colData.rawDocuments.length;
    if (colData.rawDocuments.length !== fullBackup.collections[col].documentCount) {
      throw new Error(`Integrity check failed: Count mismatch in collection ${col}`);
    }
  }

  if (verifiedDocs !== fullBackup.metadata.totalDocuments) {
    throw new Error(`Integrity check failed: Total docs ${verifiedDocs} != ${fullBackup.metadata.totalDocuments}`);
  }

  console.log(`Integrity Verification PASSED: ${verifiedDocs} / ${fullBackup.metadata.totalDocuments} documents verified across ${Object.keys(readBack.collections).length} collections.`);

  // 4. Output Summary Table
  console.log('\n====================================================================');
  console.log(' AUDIT SUMMARY TABLE (LIVE FIRESTORE DATABASE)');
  console.log('====================================================================');
  console.table(auditReport);

  // 5. Inspect users and settings specifically
  console.log('\n--- ESSENTIAL SYSTEM DATA AUDIT ---');
  console.log('[USERS COLLECTION]:');
  for (const u of fullBackup.collections['users'].documents) {
    console.log(`  - UID: ${u._id} | Email: ${u.email} | Role: ${u.role} | Active: ${u.isActive} | Name: ${u.name || u.displayName}`);
  }

  console.log('\n[SETTINGS COLLECTION]:');
  for (const s of fullBackup.collections['settings'].documents) {
    console.log(`  - Doc ID: ${s._id} | Data keys:`, Object.keys(s).filter((k) => !k.startsWith('_')));
  }

  console.log('\n[CATEGORIES COLLECTION]:');
  for (const c of fullBackup.collections['categories'].documents) {
    console.log(`  - ID: ${c._id} | Name: ${c.name} | Active: ${c.isActive}`);
  }

  return { backupFilePath, fullBackup, auditReport };
}

auditAndBackup().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
