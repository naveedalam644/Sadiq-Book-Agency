import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

export const isFirebaseConfigured = (): boolean => {
  const apiKey = firebaseConfig.apiKey;
  const projectId = firebaseConfig.projectId;
  return Boolean(
    apiKey &&
    projectId &&
    apiKey !== 'your_firebase_api_key_here' &&
    !apiKey.includes('your_') &&
    projectId !== 'your_project_id'
  );
};

export const getFirebaseConfigSummary = () => {
  return {
    isConfigured: isFirebaseConfigured(),
    projectId: firebaseConfig.projectId || 'Not specified',
    authDomain: firebaseConfig.authDomain || 'Not specified',
    storageBucket: firebaseConfig.storageBucket || 'Not specified',
    hasApiKey: Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey !== 'your_firebase_api_key_here'),
    hasAppId: Boolean(firebaseConfig.appId && firebaseConfig.appId !== 'your_firebase_app_id'),
  };
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
  if (!getApps().length) {
    app = initializeApp(
      isFirebaseConfigured()
        ? firebaseConfig
        : {
            apiKey: 'AIzaSyPlaceholderMockKeyForDevelopmentOnly00',
            authDomain: 'placeholder-bookstore.firebaseapp.com',
            projectId: 'placeholder-bookstore',
            storageBucket: 'placeholder-bookstore.appspot.com',
            messagingSenderId: '100000000000',
            appId: '1:100000000000:web:mockappid0000000000',
          }
    );
  } else {
    app = getApps()[0];
  }

  auth = getAuth(app);
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
    });
  } catch {
    db = getFirestore(app);
  }
  storage = getStorage(app);
} catch (error) {
  console.error('Firebase initialization warning:', error);
  // Fallback assignment to avoid unhandled crashes
  app = (getApps()[0] || null) as unknown as FirebaseApp;
  auth = null as unknown as Auth;
  db = null as unknown as Firestore;
  storage = null as unknown as FirebaseStorage;
}

export { app, auth, db, storage, firebaseConfig };

