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

  // Check if we need to refresh the token using refresh_token
  if (tokens.refresh_token) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho85qd6.apps.googleusercontent.com', // Firebase CLI client id
          client_secret: '', // Public client
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      });

      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        return refreshData.access_token;
      }
    } catch (err) {
      console.warn('Refresh attempt failed, using existing access_token:', err.message);
    }
  }

  return tokens.access_token;
}

async function main() {
  const token = await getAccessToken();
  console.log('Obtained token:', token ? `${token.substring(0, 10)}...` : 'None');

  const projectId = 'sadiq-book-agency';
  // Call listCollectionIds
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();
  console.log('listCollectionIds response status:', res.status);
  console.log('Collections:', data);
}

main().catch(console.error);

