import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
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
export const DB_CLEAN_EPOCH_STORAGE_KEY = 'emeb_candelario_db_clean_epoch_v1';
export const DB_EPOCH_META_STORAGE_KEY = 'emeb_candelario_db_epoch_meta_v1';
export const CLASSES_UPDATED_AT_STORAGE_KEY = 'emeb_candelario_classes_updated_at_ms_2027';

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  let currentUser = null;
  try {
    currentUser = getAuth(app).currentUser;
  } catch {
    currentUser = null;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export interface LocalEpochMetadata {
  epochId: string;
  epochVersion: number;
  epochUpdatedAtMs: number;
  classesUpdatedAtMs: number;
}

export type FirestoreEpochResolution =
  | 'checking'
  | 'aligned'
  | 'local_newer_preserved'
  | 'remote_newer_accepted'
  | 'remote_epoch_initialized'
  | 'offline_local_preserved';

export interface FirestoreIntegrityReport {
  status: FirestoreEpochResolution;
  connected: boolean;
  checkedAtISO: string | null;
  localEpochId: string;
  remoteEpochId: string | null;
  localEpochVersion: number;
  remoteEpochVersion: number;
  localEpochUpdatedAtMs: number;
  remoteEpochUpdatedAtMs: number;
  localClassesUpdatedAtMs: number;
  remoteClassesUpdatedAtMs: number;
  pendingLocalOperations: number;
  preventedRemoteOverwrite: boolean;
  protectedLocalWatermarkMs: number;
  reason: string;
}

/**
 * Extracts a deterministic comparable revision number from epoch IDs such as
 * `clean_zero_data_2026_11_16_v1` -> 2026111601.
 */
export const parseEpochRevisionNumber = (epochId?: string | null): number => {
  if (!epochId || typeof epochId !== 'string') return 0;
  const match = epochId.match(/(\d{4})_(\d{2})_(\d{2})_v(\d+)/i);
  if (match) {
    const ymd = Number(`${match[1]}${match[2]}${match[3]}`);
    const rev = Number(match[4]);
    if (Number.isFinite(ymd) && Number.isFinite(rev)) {
      return ymd * 100 + Math.min(99, Math.max(0, rev));
    }
  }
  const trailingVersion = epochId.match(/v(\d+)$/i);
  return trailingVersion ? Number(trailingVersion[1]) || 0 : 0;
};

const readStoredClassesUpdatedAtMsDirect = (): number => {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return parseInt(localStorage.getItem(CLASSES_UPDATED_AT_STORAGE_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
};

export const getLocalEpochMetadata = (fallbackClassesUpdatedAtMs?: number): LocalEpochMetadata => {
  const defaultVersion = parseEpochRevisionNumber(CLEAN_DB_RESET_EPOCH_ID);
  const directClassesTs = Math.max(
    fallbackClassesUpdatedAtMs || 0,
    readStoredClassesUpdatedAtMsDirect()
  );
  try {
    if (typeof localStorage !== 'undefined') {
      const storedEpochId =
        localStorage.getItem(DB_CLEAN_EPOCH_STORAGE_KEY) || CLEAN_DB_RESET_EPOCH_ID;
      const rawMeta = localStorage.getItem(DB_EPOCH_META_STORAGE_KEY);
      if (rawMeta) {
        const parsed = JSON.parse(rawMeta) as Partial<LocalEpochMetadata>;
        const epochId =
          typeof parsed.epochId === 'string' && parsed.epochId.trim()
            ? parsed.epochId
            : storedEpochId;
        const parsedRevision = parseEpochRevisionNumber(epochId);
        return {
          epochId,
          epochVersion: Math.max(
            typeof parsed.epochVersion === 'number' ? parsed.epochVersion : 0,
            parsedRevision,
            defaultVersion
          ),
          epochUpdatedAtMs:
            typeof parsed.epochUpdatedAtMs === 'number' ? parsed.epochUpdatedAtMs : directClassesTs,
          classesUpdatedAtMs: Math.max(
            typeof parsed.classesUpdatedAtMs === 'number' ? parsed.classesUpdatedAtMs : 0,
            directClassesTs
          ),
        };
      }
      return {
        epochId: storedEpochId,
        epochVersion: Math.max(parseEpochRevisionNumber(storedEpochId), defaultVersion),
        epochUpdatedAtMs: directClassesTs,
        classesUpdatedAtMs: directClassesTs,
      };
    }
  } catch {
    // fallback below
  }
  return {
    epochId: CLEAN_DB_RESET_EPOCH_ID,
    epochVersion: defaultVersion,
    epochUpdatedAtMs: directClassesTs,
    classesUpdatedAtMs: directClassesTs,
  };
};

export const updateLocalEpochMetadata = (
  patch: Partial<LocalEpochMetadata>
): LocalEpochMetadata => {
  const current = getLocalEpochMetadata();
  const nextEpochId = patch.epochId || current.epochId || CLEAN_DB_RESET_EPOCH_ID;
  const next: LocalEpochMetadata = {
    epochId: nextEpochId,
    epochVersion: Math.max(
      patch.epochVersion ?? current.epochVersion,
      parseEpochRevisionNumber(nextEpochId)
    ),
    epochUpdatedAtMs: Math.max(
      patch.epochUpdatedAtMs ?? 0,
      patch.epochUpdatedAtMs === 0 ? 0 : current.epochUpdatedAtMs
    ),
    classesUpdatedAtMs: Math.max(
      patch.classesUpdatedAtMs ?? 0,
      patch.classesUpdatedAtMs === 0 ? 0 : current.classesUpdatedAtMs,
      readStoredClassesUpdatedAtMsDirect()
    ),
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DB_CLEAN_EPOCH_STORAGE_KEY, next.epochId);
      localStorage.setItem(DB_EPOCH_META_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage quota errors
  }
  return next;
};

export const touchLocalEpochState = (
  classesUpdatedAtMs: number = Date.now(),
  epochId: string = CLEAN_DB_RESET_EPOCH_ID
): LocalEpochMetadata => {
  return updateLocalEpochMetadata({
    epochId,
    epochVersion: parseEpochRevisionNumber(epochId),
    epochUpdatedAtMs: classesUpdatedAtMs,
    classesUpdatedAtMs,
  });
};

type IntegrityListener = (report: FirestoreIntegrityReport) => void;
const integrityListeners = new Set<IntegrityListener>();

const initialLocalMeta = getLocalEpochMetadata();
let currentIntegrityReport: FirestoreIntegrityReport = {
  status: 'aligned',
  connected: true,
  checkedAtISO: null,
  localEpochId: initialLocalMeta.epochId,
  remoteEpochId: null,
  localEpochVersion: initialLocalMeta.epochVersion,
  remoteEpochVersion: 0,
  localEpochUpdatedAtMs: initialLocalMeta.epochUpdatedAtMs,
  remoteEpochUpdatedAtMs: 0,
  localClassesUpdatedAtMs: initialLocalMeta.classesUpdatedAtMs,
  remoteClassesUpdatedAtMs: 0,
  pendingLocalOperations: 0,
  preventedRemoteOverwrite: false,
  protectedLocalWatermarkMs: initialLocalMeta.classesUpdatedAtMs,
  reason: 'Aguardando verificação de integridade no boot.',
};

const notifyIntegrityListeners = (): void => {
  const snapshot = { ...currentIntegrityReport };
  integrityListeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // ignore listener errors
    }
  });
};

const setIntegrityReport = (next: FirestoreIntegrityReport): FirestoreIntegrityReport => {
  currentIntegrityReport = next;
  notifyIntegrityListeners();
  return { ...currentIntegrityReport };
};

export const getFirestoreIntegrityReport = (): FirestoreIntegrityReport => ({
  ...currentIntegrityReport,
});

export const subscribeToFirestoreIntegrity = (listener: IntegrityListener): (() => void) => {
  integrityListeners.add(listener);
  listener(getFirestoreIntegrityReport());
  return () => {
    integrityListeners.delete(listener);
  };
};

/**
 * Synchronously activates boot verification barrier before realtime listeners / polling start,
 * preventing cached snapshots from overwriting newer local edits during app reload.
 */
export const beginBootIntegrityCheck = (localClassesUpdatedAtMs?: number): void => {
  const localMeta = getLocalEpochMetadata(localClassesUpdatedAtMs);
  const queue = loadOfflineSyncQueue();
  const watermark = Math.max(localMeta.classesUpdatedAtMs, localMeta.epochUpdatedAtMs);
  setIntegrityReport({
    ...currentIntegrityReport,
    status: 'checking',
    localEpochId: localMeta.epochId,
    localEpochVersion: localMeta.epochVersion,
    localEpochUpdatedAtMs: localMeta.epochUpdatedAtMs,
    localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
    pendingLocalOperations: queue.length,
    preventedRemoteOverwrite: true,
    protectedLocalWatermarkMs: watermark,
    reason: 'Verificando integridade de conexão e precedência do epoch local antes da sincronização.',
  });
};

/**
 * Evaluates whether an incoming remote snapshot/pull is allowed to overwrite or merge into
 * local class state, protecting newer local epochs and offline modifications during boot.
 */
export const shouldAllowRemoteClassesOverwrite = (params: {
  remoteUpdatedAtMs?: number;
  remoteEpochId?: string | null;
  remoteEpochVersion?: number;
  fromCache?: boolean;
}): boolean => {
  const report = currentIntegrityReport;
  const remoteEpochRank = Math.max(
    params.remoteEpochVersion || 0,
    parseEpochRevisionNumber(params.remoteEpochId)
  );
  const localMeta = getLocalEpochMetadata();
  const localEpochRank = Math.max(
    localMeta.epochVersion,
    parseEpochRevisionNumber(localMeta.epochId)
  );

  // If the remote source carries a strictly older epoch revision than local, never overwrite local
  if (params.remoteEpochId && remoteEpochRank > 0 && remoteEpochRank < localEpochRank) {
    return false;
  }

  // Always allow a genuinely newer remote epoch ID/version from server
  if (!params.fromCache && remoteEpochRank > localEpochRank) {
    return true;
  }

  if (report.status === 'checking') {
    return false;
  }

  if (report.status === 'offline_local_preserved') {
    return !params.fromCache && (params.remoteUpdatedAtMs || 0) > report.protectedLocalWatermarkMs;
  }

  if (report.status === 'local_newer_preserved' && report.preventedRemoteOverwrite) {
    if (params.fromCache) return false;
    const incomingTs = params.remoteUpdatedAtMs || 0;
    // Allow only when Firestore advances strictly past our protected local watermark
    if (incomingTs > report.protectedLocalWatermarkMs) {
      return true;
    }
    return false;
  }

  return true;
};

/**
 * Marks cloud state as reconciled once local newer data is successfully pushed to Firestore.
 */
export const markCloudAlignedWithLocalEpoch = (syncedAtMs: number): void => {
  const localMeta = touchLocalEpochState(syncedAtMs, CLEAN_DB_RESET_EPOCH_ID);
  if (
    currentIntegrityReport.status === 'local_newer_preserved' ||
    currentIntegrityReport.status === 'offline_local_preserved' ||
    currentIntegrityReport.preventedRemoteOverwrite
  ) {
    setIntegrityReport({
      ...currentIntegrityReport,
      status: 'aligned',
      connected: true,
      checkedAtISO: new Date().toISOString(),
      localEpochId: localMeta.epochId,
      remoteEpochId: localMeta.epochId,
      localEpochVersion: localMeta.epochVersion,
      remoteEpochVersion: localMeta.epochVersion,
      localEpochUpdatedAtMs: syncedAtMs,
      remoteEpochUpdatedAtMs: syncedAtMs,
      localClassesUpdatedAtMs: syncedAtMs,
      remoteClassesUpdatedAtMs: syncedAtMs,
      pendingLocalOperations: loadOfflineSyncQueue().length,
      preventedRemoteOverwrite: false,
      protectedLocalWatermarkMs: syncedAtMs,
      reason: 'Base local mais recente reconciliada e confirmada no Cloud Firestore.',
    });
  }
};

let inFlightIntegrityMonitorPromise: Promise<FirestoreIntegrityReport> | null = null;

/**
 * Boot-time Firestore connection & epoch integrity monitor.
 * Uses `getDocFromServer` to inspect live server state before allowing any boot overwrite,
 * comparing local vs remote epoch revisions, timestamps, and pending offline queue items.
 */
export async function monitorFirestoreIntegrityOnBoot(options?: {
  baseClasses?: ClassGroup[];
  localClassesUpdatedAtMs?: number;
  hasLocalStudents?: boolean;
}): Promise<FirestoreIntegrityReport> {
  if (inFlightIntegrityMonitorPromise) {
    return inFlightIntegrityMonitorPromise;
  }

  const run = async (): Promise<FirestoreIntegrityReport> => {
    const testPath = 'school_meta_2027/state';
    const localMeta = getLocalEpochMetadata(options?.localClassesUpdatedAtMs);
    const pendingQueue = loadOfflineSyncQueue();
    const localWatermark = Math.max(
      localMeta.classesUpdatedAtMs,
      localMeta.epochUpdatedAtMs,
      options?.localClassesUpdatedAtMs || 0
    );

    beginBootIntegrityCheck(localWatermark);

    try {
      const stateSnap = await getDocFromServer(doc(firestoreDb, 'school_meta_2027', 'state'));
      const remoteExists = stateSnap.exists();
      const remoteData = remoteExists ? stateSnap.data() || {} : {};

      const remoteEpochId =
        typeof remoteData.cleanResetEpochId === 'string' && remoteData.cleanResetEpochId.trim()
          ? remoteData.cleanResetEpochId
          : null;
      const remoteEpochRank = parseEpochRevisionNumber(remoteEpochId);
      const localEpochRank = parseEpochRevisionNumber(localMeta.epochId);
      const remoteEpochVersion = Math.max(
        typeof remoteData.epochVersion === 'number' ? remoteData.epochVersion : 0,
        remoteEpochRank
      );
      const localEpochVersion = Math.max(localMeta.epochVersion, localEpochRank);

      const remoteClassesUpdatedAtMs =
        typeof remoteData.classesUpdatedAtMs === 'number'
          ? remoteData.classesUpdatedAtMs
          : typeof remoteData.updatedAtMs === 'number'
          ? remoteData.updatedAtMs
          : 0;
      const remoteEpochUpdatedAtMs =
        typeof remoteData.epochUpdatedAtMs === 'number'
          ? remoteData.epochUpdatedAtMs
          : remoteClassesUpdatedAtMs;

      const checkedAtISO = new Date().toISOString();

      // Case 1: Remote has a strictly newer epoch version than local -> accept remote without overwriting Firestore
      if (
        remoteEpochId &&
        (remoteEpochRank > localEpochRank || remoteEpochVersion > localEpochVersion)
      ) {
        updateLocalEpochMetadata({
          epochId: remoteEpochId,
          epochVersion: remoteEpochVersion,
          epochUpdatedAtMs: remoteEpochUpdatedAtMs,
          classesUpdatedAtMs: remoteClassesUpdatedAtMs,
        });
        return setIntegrityReport({
          status: 'remote_newer_accepted',
          connected: true,
          checkedAtISO,
          localEpochId: remoteEpochId,
          remoteEpochId,
          localEpochVersion: remoteEpochVersion,
          remoteEpochVersion,
          localEpochUpdatedAtMs: localMeta.epochUpdatedAtMs,
          remoteEpochUpdatedAtMs,
          localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
          remoteClassesUpdatedAtMs,
          pendingLocalOperations: pendingQueue.length,
          preventedRemoteOverwrite: false,
          protectedLocalWatermarkMs: remoteClassesUpdatedAtMs,
          reason: `Epoch remoto (${remoteEpochId}) é mais recente que o local (${localMeta.epochId}). Hidratação remota autorizada.`,
        });
      }

      // Case 2: Remote has missing or older epoch -> check whether local has newer active data before initializing
      if (!remoteExists || !remoteEpochId || remoteEpochRank < localEpochRank) {
        const localHasNewerData =
          pendingQueue.length > 0 ||
          (Boolean(options?.hasLocalStudents) && localWatermark > remoteClassesUpdatedAtMs);

        if (localHasNewerData) {
          return setIntegrityReport({
            status: 'local_newer_preserved',
            connected: true,
            checkedAtISO,
            localEpochId: localMeta.epochId,
            remoteEpochId,
            localEpochVersion,
            remoteEpochVersion,
            localEpochUpdatedAtMs: localMeta.epochUpdatedAtMs,
            remoteEpochUpdatedAtMs,
            localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
            remoteClassesUpdatedAtMs,
            pendingLocalOperations: pendingQueue.length,
            preventedRemoteOverwrite: true,
            protectedLocalWatermarkMs: localWatermark,
            reason:
              'Epoch/dados locais são mais recentes que o servidor remoto. Base local protegida contra sobrescrita no boot.',
          });
        }

        if (options?.baseClasses && options.baseClasses.length > 0) {
          await wipeFirestoreSchoolDataOnly(options.baseClasses, CLEAN_DB_RESET_EPOCH_ID);
        }

        const syncedAtMs = Date.now();
        return setIntegrityReport({
          status: 'remote_epoch_initialized',
          connected: true,
          checkedAtISO,
          localEpochId: CLEAN_DB_RESET_EPOCH_ID,
          remoteEpochId: CLEAN_DB_RESET_EPOCH_ID,
          localEpochVersion: parseEpochRevisionNumber(CLEAN_DB_RESET_EPOCH_ID),
          remoteEpochVersion: parseEpochRevisionNumber(CLEAN_DB_RESET_EPOCH_ID),
          localEpochUpdatedAtMs: syncedAtMs,
          remoteEpochUpdatedAtMs: syncedAtMs,
          localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
          remoteClassesUpdatedAtMs: syncedAtMs,
          pendingLocalOperations: pendingQueue.length,
          preventedRemoteOverwrite: false,
          protectedLocalWatermarkMs: syncedAtMs,
          reason: 'Epoch remoto inicializado com segurança para a versão atual do banco.',
        });
      }

      // Case 3: Same epoch ID -> compare local timestamps & offline queue vs remote timestamps
      const hasPendingClassWrite = pendingQueue.some((op) => op.type === 'save_classes');
      const localTimestampNewer =
        localMeta.classesUpdatedAtMs > remoteClassesUpdatedAtMs ||
        (localMeta.epochUpdatedAtMs > remoteEpochUpdatedAtMs &&
          Boolean(options?.hasLocalStudents));

      if (hasPendingClassWrite || pendingQueue.length > 0 || localTimestampNewer) {
        return setIntegrityReport({
          status: 'local_newer_preserved',
          connected: true,
          checkedAtISO,
          localEpochId: localMeta.epochId,
          remoteEpochId,
          localEpochVersion,
          remoteEpochVersion,
          localEpochUpdatedAtMs: localMeta.epochUpdatedAtMs,
          remoteEpochUpdatedAtMs,
          localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
          remoteClassesUpdatedAtMs,
          pendingLocalOperations: pendingQueue.length,
          preventedRemoteOverwrite: true,
          protectedLocalWatermarkMs: localWatermark,
          reason: hasPendingClassWrite || pendingQueue.length > 0
            ? `Existem ${pendingQueue.length} operação(ões) locais pendentes na fila. Sobrescrita remota bloqueada durante o boot.`
            : 'Timestamp/epoch local é mais recente do que o Firestore remoto. Estado local preservado antes do reenvio.',
        });
      }

      if (remoteClassesUpdatedAtMs > localMeta.classesUpdatedAtMs) {
        updateLocalEpochMetadata({
          epochId: remoteEpochId,
          epochVersion: remoteEpochVersion,
          epochUpdatedAtMs: remoteEpochUpdatedAtMs,
        });
        return setIntegrityReport({
          status: 'remote_newer_accepted',
          connected: true,
          checkedAtISO,
          localEpochId: localMeta.epochId,
          remoteEpochId,
          localEpochVersion,
          remoteEpochVersion,
          localEpochUpdatedAtMs: localMeta.epochUpdatedAtMs,
          remoteEpochUpdatedAtMs,
          localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
          remoteClassesUpdatedAtMs,
          pendingLocalOperations: 0,
          preventedRemoteOverwrite: false,
          protectedLocalWatermarkMs: remoteClassesUpdatedAtMs,
          reason: 'Firestore remoto possui atualizações mais recentes. Sincronização liberada no boot.',
        });
      }

      return setIntegrityReport({
        status: 'aligned',
        connected: true,
        checkedAtISO,
        localEpochId: localMeta.epochId,
        remoteEpochId,
        localEpochVersion,
        remoteEpochVersion,
        localEpochUpdatedAtMs: localMeta.epochUpdatedAtMs,
        remoteEpochUpdatedAtMs,
        localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
        remoteClassesUpdatedAtMs,
        pendingLocalOperations: 0,
        preventedRemoteOverwrite: false,
        protectedLocalWatermarkMs: Math.max(localWatermark, remoteClassesUpdatedAtMs),
        reason: 'Base local e Firestore remoto estão alinhados no mesmo epoch.',
      });
    } catch (error) {
      const isOfflineErr =
        error instanceof Error &&
        (error.message.includes('the client is offline') ||
          error.message.toLowerCase().includes('offline') ||
          error.message.toLowerCase().includes('unavailable'));

      if (isOfflineErr) {
        console.warn('Firestore operando em modo cache/offline temporário. Base local preservada.');
      } else {
        handleFirestoreError(error, OperationType.GET, testPath);
      }

      return setIntegrityReport({
        status: 'offline_local_preserved',
        connected: false,
        checkedAtISO: new Date().toISOString(),
        localEpochId: localMeta.epochId,
        remoteEpochId: null,
        localEpochVersion: localMeta.epochVersion,
        remoteEpochVersion: 0,
        localEpochUpdatedAtMs: localMeta.epochUpdatedAtMs,
        remoteEpochUpdatedAtMs: 0,
        localClassesUpdatedAtMs: localMeta.classesUpdatedAtMs,
        remoteClassesUpdatedAtMs: 0,
        pendingLocalOperations: pendingQueue.length,
        preventedRemoteOverwrite: true,
        protectedLocalWatermarkMs: localWatermark,
        reason: isOfflineErr
          ? 'Dispositivo sem acesso direto ao servidor Firestore no boot — base local protegida contra cache antigo.'
          : 'Falha ao consultar epoch no servidor Firestore — base local preservada preventivamente.',
      });
    }
  };

  inFlightIntegrityMonitorPromise = run().finally(() => {
    inFlightIntegrityMonitorPromise = null;
  });

  return inFlightIntegrityMonitorPromise;
}

// Validate connection to Firestore after authenticated institutional sign-in
export async function validateFirestoreConnectionOnBoot(): Promise<void> {
  await monitorFirestoreIntegrityOnBoot();
}

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
    const localMeta = touchLocalEpochState(updatedAtMs, CLEAN_DB_RESET_EPOCH_ID);
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
        epochUpdatedAtMs: updatedAtMs,
        epochVersion: localMeta.epochVersion,
        updatedAtISO: new Date(updatedAtMs).toISOString(),
        cleanResetEpochId: localMeta.epochId,
      },
      { merge: true }
    );
    await batch.commit();
    markCloudAlignedWithLocalEpoch(updatedAtMs);
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
    const epochVersion = parseEpochRevisionNumber(epochId);
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
        epochUpdatedAtMs: nowMs,
        epochVersion,
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

    updateLocalEpochMetadata({
      epochId,
      epochVersion,
      epochUpdatedAtMs: nowMs,
      classesUpdatedAtMs: nowMs,
    });

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'school_classes_2027');
    return false;
  } finally {
    isWipingFirestoreInFlight = false;
  }
};

/**
 * Ensures Cloud Firestore has transitioned past CLEAN_DB_RESET_EPOCH_ID when signed in,
 * respecting remote vs local epoch precedence so newer state is never wiped accidentally.
 */
export const ensureFirestoreCleanEpoch = async (
  baseClasses: ClassGroup[],
  localClassesUpdatedAtMs?: number,
  hasLocalStudents?: boolean
): Promise<boolean> => {
  const auth = getAuth(app);
  if (!auth.currentUser) {
    return false;
  }
  const report = await monitorFirestoreIntegrityOnBoot({
    baseClasses,
    localClassesUpdatedAtMs,
    hasLocalStudents,
  });
  return report.connected;
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
  epochVersion?: number;
  epochUpdatedAtMs?: number;
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

    const localMeta = getLocalEpochMetadata();
    const remoteEpochId = stateData.cleanResetEpochId as string | undefined;
    const remoteEpochRank = Math.max(
      typeof stateData.epochVersion === 'number' ? stateData.epochVersion : 0,
      parseEpochRevisionNumber(remoteEpochId)
    );
    const localEpochRank = Math.max(
      localMeta.epochVersion,
      parseEpochRevisionNumber(localMeta.epochId)
    );
    const isCleanEpoch =
      Boolean(remoteEpochId) &&
      (remoteEpochId === localMeta.epochId || remoteEpochRank >= localEpochRank);

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
      cleanResetEpochId: remoteEpochId,
      epochVersion: remoteEpochRank,
      epochUpdatedAtMs: stateData.epochUpdatedAtMs || classesUpdatedAtMs,
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
  let remoteEpochId: string | null = null;
  let remoteEpochVersion = 0;
  let pendingClasses: {
    classes: ClassGroup[];
    updatedAtMs: number;
    fromCache: boolean;
  } | null = null;
  let pendingMetaData: Record<string, any> | null = null;

  const tryDeliverPendingClasses = () => {
    if (!pendingClasses || !callbacks.onClassesUpdate || !isFirestoreCleanEpochConfirmed) {
      return;
    }
    const allowed = shouldAllowRemoteClassesOverwrite({
      remoteUpdatedAtMs: pendingClasses.updatedAtMs,
      remoteEpochId,
      remoteEpochVersion,
      fromCache: pendingClasses.fromCache,
    });
    if (allowed) {
      const toDeliver = pendingClasses;
      pendingClasses = null;
      callbacks.onClassesUpdate(toDeliver.classes, toDeliver.updatedAtMs);
    } else if (currentIntegrityReport.status !== 'checking') {
      // Discard stale boot snapshot when integrity monitor confirmed local state is newer
      pendingClasses = null;
    }
  };

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
    const unsubIntegrity = subscribeToFirestoreIntegrity((report) => {
      if (report.status !== 'checking') {
        tryDeliverPendingClasses();
      }
    });
    unsubs.push(unsubIntegrity);

    const unsubState = onSnapshot(
      doc(firestoreDb, 'school_meta_2027', 'state'),
      (stateSnap) => {
        const data = stateSnap.exists() ? stateSnap.data() || {} : {};
        remoteEpochId =
          typeof data.cleanResetEpochId === 'string' ? data.cleanResetEpochId : null;
        remoteEpochVersion = Math.max(
          typeof data.epochVersion === 'number' ? data.epochVersion : 0,
          parseEpochRevisionNumber(remoteEpochId)
        );
        const localMeta = getLocalEpochMetadata();
        const localEpochRank = Math.max(
          localMeta.epochVersion,
          parseEpochRevisionNumber(localMeta.epochId)
        );
        isFirestoreCleanEpochConfirmed =
          Boolean(remoteEpochId) &&
          (remoteEpochId === localMeta.epochId || remoteEpochVersion >= localEpochRank);

        if (isFirestoreCleanEpochConfirmed) {
          tryDeliverPendingClasses();
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
          pendingClasses = {
            classes,
            updatedAtMs,
            fromCache: Boolean(snap.metadata?.fromCache),
          };
          tryDeliverPendingClasses();
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


