import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ClassGroup,
  AuthorizedUser,
  AttendanceWindowConfig,
  UserAccessSessionLog,
  PendingSyncOperation,
  SyncStateStatus,
} from '../types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const rawFirebaseConfig = firebaseConfig as Record<string, string | undefined>;
export const firestoreDb = rawFirebaseConfig.firestoreDatabaseId
  ? getFirestore(app, rawFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

const OFFLINE_QUEUE_STORAGE_KEY = 'emeb_candelario_offline_sync_queue_2027_v1';

export interface SyncStatusSnapshot {
  status: SyncStateStatus;
  pendingCount: number;
  lastSyncedAtISO: string | null;
  lastError: string | null;
  queue: PendingSyncOperation[];
}

type SyncListener = (snapshot: SyncStatusSnapshot) => void;
const syncListeners = new Set<SyncListener>();

let currentSyncStatus: SyncStateStatus = 'synced';
let lastSyncedAtISO: string | null = null;
let lastSyncError: string | null = null;
let isFlushingQueue = false;

export const loadOfflineSyncQueue = (): PendingSyncOperation[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOfflineSyncQueue = (queue: PendingSyncOperation[]): void => {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
    } else {
      localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(0, 50)));
    }
  } catch {
    // ignore storage quota errors
  }
  notifySyncListeners();
};

export const getSyncStatusSnapshot = (): SyncStatusSnapshot => {
  const queue = loadOfflineSyncQueue();
  const effectiveStatus: SyncStateStatus =
    currentSyncStatus === 'syncing'
      ? 'syncing'
      : queue.length > 0
      ? lastSyncError
        ? 'error'
        : 'pending'
      : currentSyncStatus;
  return {
    status: effectiveStatus,
    pendingCount: queue.length,
    lastSyncedAtISO,
    lastError: lastSyncError,
    queue,
  };
};

const notifySyncListeners = (): void => {
  const snap = getSyncStatusSnapshot();
  syncListeners.forEach((cb) => {
    try {
      cb(snap);
    } catch {
      // ignore listener errors
    }
  });
};

export const subscribeToSyncStatus = (listener: SyncListener): (() => void) => {
  syncListeners.add(listener);
  listener(getSyncStatusSnapshot());
  return () => {
    syncListeners.delete(listener);
  };
};

export const enqueuePendingSyncOperation = (
  type: PendingSyncOperation['type'],
  payloadSummary: string,
  errorMsg?: string
): void => {
  const queue = loadOfflineSyncQueue();
  const existingIdx = queue.findIndex((item) => item.type === type);
  const op: PendingSyncOperation = {
    opId:
      existingIdx >= 0
        ? queue[existingIdx].opId
        : `op-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    createdAtMs: Date.now(),
    attempts: existingIdx >= 0 ? queue[existingIdx].attempts + 1 : 1,
    lastError: errorMsg,
    payloadSummary,
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = op;
  } else {
    queue.push(op);
  }

  lastSyncError = errorMsg || null;
  currentSyncStatus = errorMsg ? 'error' : 'pending';
  saveOfflineSyncQueue(queue);
};

export const markSyncOperationSuccess = (type: PendingSyncOperation['type']): void => {
  const queue = loadOfflineSyncQueue().filter((item) => item.type !== type);
  lastSyncedAtISO = new Date().toISOString();
  if (queue.length === 0) {
    lastSyncError = null;
    currentSyncStatus = 'synced';
  } else {
    currentSyncStatus = 'pending';
  }
  saveOfflineSyncQueue(queue);
};

export const setSyncingActiveState = (): void => {
  currentSyncStatus = 'syncing';
  notifySyncListeners();
};

/**
 * Strips heavy inline base64 data URLs before writing to Firestore (1MB doc limit)
 * while preserving Drive IDs, Drive links, manual link flags, and compact avatars.
 */
const sanitizeClassForFirestore = (cls: ClassGroup, nowMs: number): ClassGroup => {
  return {
    ...cls,
    updatedAtMs: cls.updatedAtMs || nowMs,
    students: (cls.students || []).map((st) => ({
      ...st,
      photo:
        st.photo && st.photo.startsWith('data:image') && st.photo.length > 18000
          ? st.photoDriveUrl || ''
          : st.photo || '',
    })),
  };
};

/**
 * Saves classes to Cloud Firestore (1 document per class in `school_classes_2027` collection)
 * so it works in serverless environments (Vercel) and stays well under Firestore's 1MB per-doc limit.
 */
export const saveClassesToFirestoreCloud = async (
  classes: ClassGroup[],
  updatedAtMs: number
): Promise<boolean> => {
  try {
    const batch = writeBatch(firestoreDb);
    classes.forEach((cls) => {
      if (!cls || !cls.id) return;
      const cleanCls = sanitizeClassForFirestore(cls, updatedAtMs);
      const ref = doc(firestoreDb, 'school_classes_2027', cls.id);
      batch.set(ref, { ...cleanCls, updatedAtMs }, { merge: true });
    });
    const metaRef = doc(firestoreDb, 'school_meta_2027', 'state');
    batch.set(
      metaRef,
      { classesUpdatedAtMs: updatedAtMs, updatedAtISO: new Date(updatedAtMs).toISOString() },
      { merge: true }
    );
    await batch.commit();
    return true;
  } catch {
    return false;
  }
};

export const saveConfigMetaToFirestoreCloud = async (payload: {
  authorizedUsers?: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  attendanceWindowConfig?: AttendanceWindowConfig;
  cloudLinks?: Record<string, any>;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
}): Promise<boolean> => {
  try {
    const ref = doc(firestoreDb, 'school_meta_2027', 'config');
    const cleanPayload: Record<string, any> = {
      updatedAtMs: Date.now(),
    };
    if (payload.authorizedUsers) cleanPayload.authorizedUsers = payload.authorizedUsers;
    if (payload.accessSessionLogs) {
      cleanPayload.accessSessionLogs = payload.accessSessionLogs.slice(0, 150);
    }
    if (payload.attendanceWindowConfig) {
      cleanPayload.attendanceWindowConfig = payload.attendanceWindowConfig;
    }
    if (payload.cloudLinks) cleanPayload.cloudLinks = payload.cloudLinks;
    if (payload.discoveredNominalPdfs) {
      cleanPayload.discoveredNominalPdfs = payload.discoveredNominalPdfs.slice(0, 1200);
    }
    if (payload.discoveredDrivePhotos) {
      cleanPayload.discoveredDrivePhotos = payload.discoveredDrivePhotos.slice(0, 1200);
    }
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch {
    return false;
  }
};

export const fetchStateFromFirestoreCloud = async (): Promise<{
  classes?: ClassGroup[];
  classesUpdatedAtMs?: number;
  authorizedUsers?: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  attendanceWindowConfig?: AttendanceWindowConfig;
  cloudLinks?: Record<string, any>;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
} | null> => {
  try {
    const [classesSnap, metaSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'school_classes_2027')),
      getDocs(collection(firestoreDb, 'school_meta_2027')),
    ]);

    const classes: ClassGroup[] = [];
    let maxClassUpdatedAt = 0;
    classesSnap.forEach((d) => {
      const data = d.data() as ClassGroup;
      if (data && data.id && Array.isArray(data.students)) {
        classes.push(data);
        if ((data.updatedAtMs || 0) > maxClassUpdatedAt) {
          maxClassUpdatedAt = data.updatedAtMs || 0;
        }
      }
    });

    let configData: Record<string, any> = {};
    let stateData: Record<string, any> = {};
    metaSnap.forEach((d) => {
      if (d.id === 'config') configData = d.data() || {};
      if (d.id === 'state') stateData = d.data() || {};
    });

    const classesUpdatedAtMs = Math.max(
      maxClassUpdatedAt,
      stateData.classesUpdatedAtMs || 0
    );

    if (classes.length === 0 && Object.keys(configData).length === 0) {
      return null;
    }

    return {
      classes: classes.length > 0 ? classes : undefined,
      classesUpdatedAtMs,
      authorizedUsers: configData.authorizedUsers,
      accessSessionLogs: configData.accessSessionLogs,
      attendanceWindowConfig: configData.attendanceWindowConfig,
      cloudLinks: configData.cloudLinks,
      discoveredNominalPdfs: configData.discoveredNominalPdfs,
      discoveredDrivePhotos: configData.discoveredDrivePhotos,
    };
  } catch {
    return null;
  }
};

export const registerOfflineFlushHandler = (flushFn: () => Promise<void>): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const handleOnline = () => {
    if (!isFlushingQueue && loadOfflineSyncQueue().length > 0) {
      isFlushingQueue = true;
      flushFn().finally(() => {
        isFlushingQueue = false;
      });
    }
  };
  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
};
