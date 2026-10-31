import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import type { AdminUserProfile, LoginCredentials } from '../types/auth';
import { getFriendlyErrorMessage } from '../utils/firebaseErrors';

export interface AuthContextValue {
  currentUser: AdminUserProfile | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isFirebaseReady: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AdminUserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isFirebaseReady = isFirebaseConfigured();

  // Helper to extract or fetch admin profile
  const fetchUserProfile = useCallback(async (user: FirebaseUser): Promise<AdminUserProfile> => {
    try {
      if (db) {
        const userDocRef = doc(db, 'users', user.uid);
        const userSnapshot = await getDoc(userDocRef);

        if (userSnapshot.exists()) {
          const data = userSnapshot.data();
          return {
            uid: user.uid,
            email: user.email || '',
            displayName: data.displayName || user.displayName || user.email?.split('@')[0] || 'Administrator',
            role: data.role || 'admin',
            isActive: data.isActive !== false,
            createdAt: data.createdAt,
            lastLoginAt: new Date().toISOString(),
          };
        }
      }
    } catch (firestoreError) {
      console.warn('Firestore user profile fetch notice (using auth defaults):', firestoreError);
    }

    // Default admin profile built from Firebase Auth token
    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Store Administrator',
      role: 'admin',
      isActive: true,
      createdAt: user.metadata.creationTime,
      lastLoginAt: user.metadata.lastSignInTime,
    };
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        const profile = await fetchUserProfile(user);
        setCurrentUser(profile);
      } else {
        setFirebaseUser(null);
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile]);

  const login = useCallback(
    async ({ email, password, rememberMe = true }: LoginCredentials) => {
      setError(null);
      setLoading(true);

      if (!isFirebaseConfigured()) {
        setLoading(false);
        const configErrorMsg =
          'Firebase is not yet configured with valid credentials in .env. Please add your VITE_FIREBASE_* values in your .env file.';
        setError(configErrorMsg);
        throw new Error(configErrorMsg);
      }

      if (!auth) {
        setLoading(false);
        const errorMsg = 'Firebase Authentication service is not initialized.';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      try {
        // Set persistence based on "remember me"
        await setPersistence(
          auth,
          rememberMe ? browserLocalPersistence : browserSessionPersistence
        );

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const profile = await fetchUserProfile(userCredential.user);
        setCurrentUser(profile);
        setFirebaseUser(userCredential.user);
      } catch (err: any) {
        const readableMessage = getFriendlyErrorMessage(err?.code || err?.message || 'unknown');
        setError(readableMessage);
        throw new Error(readableMessage);
      } finally {
        setLoading(false);
      }
    },
    [fetchUserProfile]
  );

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      if (auth) {
        await firebaseSignOut(auth);
      }
      setCurrentUser(null);
      setFirebaseUser(null);
      setError(null);
    } catch (err: any) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      currentUser,
      firebaseUser,
      loading,
      error,
      isAuthenticated: Boolean(currentUser),
      isAdmin: currentUser?.role === 'admin',
      isFirebaseReady,
      login,
      logout,
      clearError,
    }),
    [currentUser, firebaseUser, loading, error, isFirebaseReady, login, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
