import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AuditLogDocument } from '../types/database';

export const logAuditEvent = async (
  action: string,
  collectionTarget: string,
  details: string,
  targetId?: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) return;

  try {
    const logRef = doc(collection(db, 'auditLogs'));
    const logData: AuditLogDocument = {
      id: logRef.id,
      action,
      collectionTarget,
      targetId,
      details,
      performedByUserId: userId,
      performedByEmail: userEmail,
      timestamp: new Date().toISOString(),
    };

    await setDoc(logRef, {
      ...logData,
      _serverTimestamp: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Audit logging note (non-blocking):', error);
  }
};

