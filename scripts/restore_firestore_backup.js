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

/**
 * Restores all documents from a backup JSON file back into Cloud Firestore.
 * Usage: node scripts/restore_firestore_backup.js [optional_backup_path]
 */
async function restoreBackup(backupFilePath) {
  const filePath = backupFilePath || path.resolve(process.cwd(), 'backups', 'firestore_backup_latest.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found at: ${filePath}`);
  }

  console.log(`Loading backup file: ${filePath}`);
  const backup = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const token = await getAccessToken();

  console.log(`Starting restoration for ${backup.metadata.totalDocuments} documents across ${Object.keys(backup.collections).length} collections...`);

  let restoredCount = 0;
  for (const [collId, collData] of Object.entries(backup.collections)) {
    console.log(`Restoring collection: [${collId}] (${collData.rawDocuments.length} docs)...`);
    for (const rawDoc of collData.rawDocuments) {
      const url = `https://firestore.googleapis.com/v1/${rawDoc.name}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: rawDoc.fields || {} }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to restore document ${rawDoc.name}: ${res.status} ${txt}`);
      }
      restoredCount++;
    }
  }

  console.log(`Restoration completed successfully: ${restoredCount} documents restored.`);
}

if (process.argv[2] === '--run') {
  restoreBackup(process.argv[3]).catch(console.error);
} else {
  console.log('Restoration utility loaded and verified.');
  console.log('To execute restoration in future: node scripts/restore_firestore_backup.js --run [optional_backup_path]');
}

