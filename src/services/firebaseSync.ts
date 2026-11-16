import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
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
import {
  NameGenderEntry,
  saveStoredNameGenderEntries,
} from '../utils/genderDictionary';

export const CLEAN_DB_RESET_EPOCH_ID = 'clean_zero_data_2026_11_16_v1';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const rawFirebaseConfig = firebaseConfig as Record<string, string | undefined>;
export const firestoreDb = rawFirebaseConfig.firestoreDatabaseId
  ? getFirestore(app, rawFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error Audit:', JSON.stringify(errInfo));
  return errInfo;
}

// Validate connection to Firestore on boot per Firebase architecture best practices
async function validateFirestoreConnectionOnBoot(): Promise<void> {
  const testPath = 'school_meta_2027/state';
  try {
    await getDocFromServer(doc(firestoreDb, 'school_meta_2027', 'state'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore operando em modo cache/offline temporário.');
    } else {
      handleFirestoreError(error, OperationType.GET, testPath);
    }
  }
}
void validateFirestoreConnectionOnBoot();

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

let isNotifyScheduled = false;
const notifySyncListeners = (): void => {
  if (isNotifyScheduled) return;
  isNotifyScheduled = true;
  queueMicrotask(() => {
    isNotifyScheduled = false;
    const snap = getSyncStatusSnapshot();
    syncListeners.forEach((cb) => {
      try {
        cb(snap);
      } catch {
        // ignore listener errors
      }
    });
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
      {
        updatedAtMs,
        classesUpdatedAtMs: updatedAtMs,
        updatedAtISO: new Date(updatedAtMs).toISOString(),
        cleanResetEpochId: CLEAN_DB_RESET_EPOCH_ID,
      },
      { merge: true }
    );
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'school_classes_2027');
    return false;
  }
};

let isWipingFirestoreInFlight = false;

/**
 * Wipes ONLY school data in Cloud Firestore (students, absences, notices, logs, PDF/photo caches, alerts)
 * while preserving institutional accounts (authorizedUsers), attendance window, and Google Drive links.
 */
export const wipeFirestoreSchoolDataOnly = async (
  baseClasses: ClassGroup[],
  epochId: string = CLEAN_DB_RESET_EPOCH_ID
): Promise<boolean> => {
  const auth = getAuth(app);
  if (!auth.currentUser) {
    return false;
  }
  if (isWipingFirestoreInFlight) {
    return false;
  }
  isWipingFirestoreInFlight = true;
  try {
    const nowMs = Date.now();
    const zeroedClasses: ClassGroup[] = baseClasses.map((c) => ({
      ...c,
      students: [],
      totalStudents: 0,
      monthlyAbsences: 0,
      presenceRate: 0,
      statusText: 'Aguardando importação de estudantes',
      isPending: false,
      weeklyPerformance: [],
      pedagogicalNotes: '',
      updatedAtMs: nowMs,
    }));

    const validClassIds = new Set(zeroedClasses.map((c) => c.id));
    const existingClassesSnap = await getDocs(collection(firestoreDb, 'school_classes_2027'));

    const batch = writeBatch(firestoreDb);
    zeroedClasses.forEach((cls) => {
      if (!cls || !cls.id) return;
      const ref = doc(firestoreDb, 'school_classes_2027', cls.id);
      batch.set(ref, cls);
    });

    const configRef = doc(firestoreDb, 'school_meta_2027', 'config');
    batch.set(
      configRef,
      {
        updatedAtMs: nowMs,
        accessSessionLogs: [],
        schoolNotices: [],
        discoveredNominalPdfs: [],
        discoveredDrivePhotos: [],
        genderDictionary: [],
        cleanResetEpochId: epochId,
      },
      { merge: true }
    );

    const stateRef = doc(firestoreDb, 'school_meta_2027', 'state');
    batch.set(
      stateRef,
      {
        updatedAtMs: nowMs,
        classesUpdatedAtMs: nowMs,
        updatedAtISO: new Date(nowMs).toISOString(),
        cleanResetEpochId: epochId,
      },
      { merge: true }
    );

    await batch.commit();

    // Clean up any non-matrix class documents or FCM alerts if user is Admin
    const deletePromises: Promise<void>[] = [];
    existingClassesSnap.forEach((d) => {
      if (!validClassIds.has(d.id)) {
        deletePromises.push(deleteDoc(d.ref).catch(() => {}));
      }
    });
    try {
      const alertsSnap = await getDocs(collection(firestoreDb, 'school_fcm_alerts_2027'));
      alertsSnap.forEach((d) => {
        deletePromises.push(deleteDoc(d.ref).catch(() => {}));
      });
    } catch {
      // ignore if alerts collection empty or restricted
    }
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'school_classes_2027');
    return false;
  } finally {
    isWipingFirestoreInFlight = false;
  }
};

/**
 * Ensures Cloud Firestore has transitioned past CLEAN_DB_RESET_EPOCH_ID when signed in.
 */
export const ensureFirestoreCleanEpoch = async (
  baseClasses: ClassGroup[]
): Promise<boolean> => {
  const auth = getAuth(app);
  if (!auth.currentUser) {
    return false;
  }
  try {
    const stateSnap = await getDoc(doc(firestoreDb, 'school_meta_2027', 'state'));
    const currentEpoch = stateSnap.exists() ? stateSnap.data()?.cleanResetEpochId : undefined;
    if (currentEpoch !== CLEAN_DB_RESET_EPOCH_ID) {
      return await wipeFirestoreSchoolDataOnly(baseClasses, CLEAN_DB_RESET_EPOCH_ID);
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'school_meta_2027/state');
    return false;
  }
};

export const saveConfigMetaToFirestoreCloud = async (payload: {
  authorizedUsers?: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  attendanceWindowConfig?: AttendanceWindowConfig;
  schoolNotices?: any[];
  cloudLinks?: Record<string, any>;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
  genderDictionary?: NameGenderEntry[];
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
    if (payload.schoolNotices) {
      cleanPayload.schoolNotices = payload.schoolNotices.slice(0, 60);
    }
    if (payload.cloudLinks) cleanPayload.cloudLinks = payload.cloudLinks;
    if (payload.discoveredNominalPdfs) {
      cleanPayload.discoveredNominalPdfs = payload.discoveredNominalPdfs.slice(0, 1200);
    }
    if (payload.discoveredDrivePhotos) {
      cleanPayload.discoveredDrivePhotos = payload.discoveredDrivePhotos.slice(0, 1200);
    }
    if (payload.genderDictionary) {
      cleanPayload.genderDictionary = payload.genderDictionary.slice(0, 1500);
    }
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'school_meta_2027/config');
    return false;
  }
};

export const fetchStateFromFirestoreCloud = async (): Promise<{
  classes?: ClassGroup[];
  classesUpdatedAtMs?: number;
  authorizedUsers?: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  attendanceWindowConfig?: AttendanceWindowConfig;
  schoolNotices?: any[];
  cloudLinks?: Record<string, any>;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
  genderDictionary?: NameGenderEntry[];
  cleanResetEpochId?: string;
} | null> => {
  try {
    const [classesSnap, metaSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'school_classes_2027')),
      getDocs(collection(firestoreDb, 'school_meta_2027')),
    ]);

    let configData: Record<string, any> = {};
    let stateData: Record<string, any> = {};
    metaSnap.forEach((d) => {
      if (d.id === 'config') configData = d.data() || {};
      if (d.id === 'state') stateData = d.data() || {};
    });

    const isCleanEpoch = stateData.cleanResetEpochId === CLEAN_DB_RESET_EPOCH_ID;

    const classes: ClassGroup[] = [];
    let maxClassUpdatedAt = 0;
    if (isCleanEpoch) {
      classesSnap.forEach((d) => {
        const data = d.data() as ClassGroup;
        if (data && data.id && Array.isArray(data.students)) {
          classes.push(data);
          if ((data.updatedAtMs || 0) > maxClassUpdatedAt) {
            maxClassUpdatedAt = data.updatedAtMs || 0;
          }
        }
      });
    }

    if (isCleanEpoch && Array.isArray(configData.genderDictionary) && configData.genderDictionary.length > 0) {
      saveStoredNameGenderEntries(configData.genderDictionary);
    }

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
      accessSessionLogs: isCleanEpoch ? configData.accessSessionLogs : [],
      attendanceWindowConfig: configData.attendanceWindowConfig,
      schoolNotices: isCleanEpoch ? configData.schoolNotices : [],
      cloudLinks: configData.cloudLinks,
      discoveredNominalPdfs: isCleanEpoch ? configData.discoveredNominalPdfs : [],
      discoveredDrivePhotos: isCleanEpoch ? configData.discoveredDrivePhotos : [],
      genderDictionary: isCleanEpoch ? configData.genderDictionary : [],
      cleanResetEpochId: stateData.cleanResetEpochId,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'school_classes_2027');
    return null;
  }
};

export const subscribeToFirestoreRealtimeState = (callbacks: {
  onClassesUpdate?: (classes: ClassGroup[], updatedAtMs: number) => void;
  onMetaConfigUpdate?: (config: {
    authorizedUsers?: AuthorizedUser[];
    accessSessionLogs?: UserAccessSessionLog[];
    attendanceWindowConfig?: AttendanceWindowConfig;
    schoolNotices?: any[];
    cloudLinks?: Record<string, any>;
    discoveredNominalPdfs?: any[];
    discoveredDrivePhotos?: any[];
    genderDictionary?: NameGenderEntry[];
  }) => void;
}): (() => void) => {
  const unsubs: Array<() => void> = [];
  let isFirestoreCleanEpochConfirmed = false;
  let pendingClasses: { classes: ClassGroup[]; updatedAtMs: number } | null = null;
  let pendingMetaData: Record<string, any> | null = null;

  const flushMetaConfig = (data: Record<string, any>) => {
    const cleanOnly = isFirestoreCleanEpochConfirmed;
    if (cleanOnly && Array.isArray(data.genderDictionary) && data.genderDictionary.length > 0) {
      saveStoredNameGenderEntries(data.genderDictionary);
    }
    if (callbacks.onMetaConfigUpdate) {
      callbacks.onMetaConfigUpdate({
        authorizedUsers: data.authorizedUsers,
        accessSessionLogs: cleanOnly ? data.accessSessionLogs : [],
        attendanceWindowConfig: data.attendanceWindowConfig,
        schoolNotices: cleanOnly ? data.schoolNotices : [],
        cloudLinks: data.cloudLinks,
        discoveredNominalPdfs: cleanOnly ? data.discoveredNominalPdfs : [],
        discoveredDrivePhotos: cleanOnly ? data.discoveredDrivePhotos : [],
        genderDictionary: cleanOnly ? data.genderDictionary : [],
      });
    }
  };

  try {
    const unsubState = onSnapshot(
      doc(firestoreDb, 'school_meta_2027', 'state'),
      (stateSnap) => {
        const data = stateSnap.exists() ? stateSnap.data() || {} : {};
        isFirestoreCleanEpochConfirmed = data.cleanResetEpochId === CLEAN_DB_RESET_EPOCH_ID;
        if (isFirestoreCleanEpochConfirmed) {
          if (pendingClasses && callbacks.onClassesUpdate) {
            callbacks.onClassesUpdate(pendingClasses.classes, pendingClasses.updatedAtMs);
            pendingClasses = null;
          }
          if (pendingMetaData) {
            flushMetaConfig(pendingMetaData);
            pendingMetaData = null;
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'school_meta_2027/state');
      }
    );
    unsubs.push(unsubState);

    const unsubClasses = onSnapshot(
      collection(firestoreDb, 'school_classes_2027'),
      (snap) => {
        if (snap.empty) return;
        const classes: ClassGroup[] = [];
        let maxUpdatedAt = 0;
        snap.forEach((d) => {
          const data = d.data() as ClassGroup;
          if (data && data.id && Array.isArray(data.students)) {
            classes.push(data);
            if ((data.updatedAtMs || 0) > maxUpdatedAt) {
              maxUpdatedAt = data.updatedAtMs || 0;
            }
          }
        });
        if (classes.length > 0) {
          const updatedAtMs = maxUpdatedAt || Date.now();
          if (isFirestoreCleanEpochConfirmed) {
            callbacks.onClassesUpdate?.(classes, updatedAtMs);
          } else {
            pendingClasses = { classes, updatedAtMs };
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'school_classes_2027');
      }
    );
    unsubs.push(unsubClasses);

    const unsubConfig = onSnapshot(
      doc(firestoreDb, 'school_meta_2027', 'config'),
      (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data() || {};
        pendingMetaData = isFirestoreCleanEpochConfirmed ? null : data;
        flushMetaConfig(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'school_meta_2027/config');
      }
    );
    unsubs.push(unsubConfig);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'school_classes_2027');
  }

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // ignore
      }
    });
  };
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

