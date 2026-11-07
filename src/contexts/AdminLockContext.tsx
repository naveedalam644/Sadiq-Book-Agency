import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const ADMIN_PIN_STORAGE_KEY = 'sba_admin_section_pin';
const SESSION_UNLOCKED_KEY = 'sba_admin_session_unlocked';
const DEFAULT_ADMIN_PIN = '1234';

// All sidebar sections that are confidential and protected by default
export const PROTECTED_PATHS = [
  '/',
  '/inventory',
  '/syllabus',
  '/price-list',
  '/suppliers',
  '/purchases',
  '/customers',
  '/pos',
  '/sales-history',
  '/publisher-analytics',
  '/reports',
  '/expenses',
  '/rough-bill',
] as const;

export type ProtectedPath = typeof PROTECTED_PATHS[number];

export interface AdminLockContextValue {
  isLocked: (path: string) => boolean;
  unlockSection: (path: string, pinAttempt: string, rememberSession?: boolean) => boolean;
  lockAll: () => void;
  changeAdminPassword: (currentPin: string, newPin: string) => { success: boolean; message: string };
  isSessionUnlocked: boolean;
  activeLockModal: { path: string; name: string } | null;
  openLockModal: (path: string, name: string) => void;
  closeLockModal: () => void;
  isChangePasswordModalOpen: boolean;
  openChangePasswordModal: () => void;
  closeChangePasswordModal: () => void;
  defaultPinNotice: boolean;
}

const AdminLockContext = createContext<AdminLockContextValue | undefined>(undefined);

export const AdminLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. PIN Management (persisted in localStorage)
  const [adminPin, setAdminPin] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(ADMIN_PIN_STORAGE_KEY);
      return stored && stored.trim() ? stored.trim() : DEFAULT_ADMIN_PIN;
    } catch {
      return DEFAULT_ADMIN_PIN;
    }
  });

  // Track if default PIN is currently in use
  const defaultPinNotice = adminPin === DEFAULT_ADMIN_PIN;

  // 2. Session Unlock State (persisted in sessionStorage for page refreshes during same session)
  const [isSessionUnlocked, setIsSessionUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // 3. Individually Unlocked Paths (in-memory set)
  const [unlockedPaths, setUnlockedPaths] = useState<Set<string>>(new Set());

  // 4. Modal state for navigation intercept
  const [activeLockModal, setActiveLockModal] = useState<{ path: string; name: string } | null>(null);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  // Sync session state to sessionStorage
  useEffect(() => {
    try {
      if (isSessionUnlocked) {
        sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      } else {
        sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [isSessionUnlocked]);

  // Check if a given route path is currently locked
  const isLocked = useCallback(
    (path: string): boolean => {
      // If the whole session is unlocked, nothing is locked
      if (isSessionUnlocked) return false;

      // Normalize path (remove trailing slash)
      const cleanPath = path === '/' ? '/' : path.replace(/\/$/, '');

      // If this specific path has been individually unlocked
      if (unlockedPaths.has(cleanPath)) return false;

      // Check if this path is in protected paths list
      const isProtected = PROTECTED_PATHS.some((p) => {
        if (p === '/') return cleanPath === '/';
        return cleanPath === p || cleanPath.startsWith(`${p}/`);
      });

      return isProtected;
    },
    [isSessionUnlocked, unlockedPaths]
  );

  // Attempt to unlock a section with PIN
  const unlockSection = useCallback(
    (path: string, pinAttempt: string, rememberSession = true): boolean => {
      if (pinAttempt.trim() !== adminPin) {
        return false;
      }

      const cleanPath = path === '/' ? '/' : path.replace(/\/$/, '');

      if (rememberSession) {
        setIsSessionUnlocked(true);
      } else {
        setUnlockedPaths((prev) => new Set([...prev, cleanPath]));
      }

      setActiveLockModal(null);
      return true;
    },
    [adminPin]
  );

  // Lock everything immediately
  const lockAll = useCallback(() => {
    setIsSessionUnlocked(false);
    setUnlockedPaths(new Set());
    try {
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    } catch {
      // Ignore
    }
  }, []);

  // Change Admin Password / PIN
  const changeAdminPassword = useCallback(
    (currentPin: string, newPin: string): { success: boolean; message: string } => {
      if (currentPin.trim() !== adminPin) {
        return { success: false, message: 'Current Admin Password is incorrect.' };
      }

      const cleanNew = newPin.trim();
      if (!cleanNew || cleanNew.length < 4) {
        return { success: false, message: 'New Admin Password must be at least 4 characters long.' };
      }

      try {
        localStorage.setItem(ADMIN_PIN_STORAGE_KEY, cleanNew);
        setAdminPin(cleanNew);
        return { success: true, message: 'Admin Password successfully updated!' };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed to update Admin Password.' };
      }
    },
    [adminPin]
  );

  const openLockModal = useCallback((path: string, name: string) => {
    setActiveLockModal({ path, name });
  }, []);

  const closeLockModal = useCallback(() => {
    setActiveLockModal(null);
  }, []);

  const openChangePasswordModal = useCallback(() => {
    setIsChangePasswordModalOpen(true);
  }, []);

  const closeChangePasswordModal = useCallback(() => {
    setIsChangePasswordModalOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isLocked,
      unlockSection,
      lockAll,
      changeAdminPassword,
      isSessionUnlocked,
      activeLockModal,
      openLockModal,
      closeLockModal,
      isChangePasswordModalOpen,
      openChangePasswordModal,
      closeChangePasswordModal,
      defaultPinNotice,
    }),
    [
      isLocked,
      unlockSection,
      lockAll,
      changeAdminPassword,
      isSessionUnlocked,
      activeLockModal,
      openLockModal,
      closeLockModal,
      isChangePasswordModalOpen,
      openChangePasswordModal,
      closeChangePasswordModal,
      defaultPinNotice,
    ]
  );

  return <AdminLockContext.Provider value={value}>{children}</AdminLockContext.Provider>;
};

export const useAdminLock = (): AdminLockContextValue => {
  const context = useContext(AdminLockContext);
  if (!context) {
    throw new Error('useAdminLock must be used within an AdminLockProvider');
  }
  return context;
};

