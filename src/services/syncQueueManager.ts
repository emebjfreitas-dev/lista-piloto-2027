import {
  ClassGroup,
  AuthorizedUser,
  UserAccessSessionLog,
} from '../types';
import {
  getStoredClasses,
  getStoredAuthorizedUsers,
  getStoredAccessSessionLogs,
  mergeClassesWithConcurrencyControl,
} from './db';
import {
  enqueuePendingSyncOperation,
  markSyncOperationSuccess,
  setSyncingActiveState,
  saveClassesToFirestoreCloud,
  saveConfigMetaToFirestoreCloud,
} from './firebaseSync';
import {
  writeAttendanceOnlyToGoogleSheet,
  syncAuthorizedUsersToGoogleSheet,
  syncGenderDictionaryToGoogleSheet,
  getSavedSpreadsheetInfo,
  getDriveAuthState,
} from './googleSheetsApi';
import {
  NameGenderEntry,
  getStoredNameGenderEntries,
} from '../utils/genderDictionary';

const SYNC_QUEUE_STORAGE_KEY = 'emeb_candelario_sheet_sync_queue_v2';
const SYNC_QUEUE_LOCK_KEY = 'emeb_candelario_sheet_sync_lock_v2';

export const COALESCE_WINDOW_MS = 500; // 500ms resource coalescing window
const BASE_BACKOFF_MS = 2000; // 2s initial retry delay
const MAX_BACKOFF_MS = 60000; // 60s max backoff cap
const LOCK_STALE_MS = 25000; // 25s stale lock recovery if tab crashed mid-request

export type SyncQueueTaskCategory =
  | 'attendance'
  | 'photo'
  | 'pdf'
  | 'student_data'
  | 'users_access'
  | 'gender_dictionary';

export interface SyncQueueTaskItem {
  taskId: string;
  dedupeKey: string; // e.g. `class:g04a`, `users:all`, `gender:all`
  category: SyncQueueTaskCategory;
  categoriesCoalesced?: SyncQueueTaskCategory[];
  classId?: string;
  studentId?: string;
  description: string;
  createdAtMs: number;
  updatedAtMs: number;
  coalesceUntilMs?: number;
  coalescedCount?: number;
  attempts: number;
  nextRetryAtMs: number;
  lastError?: string;
  status: 'queued' | 'processing' | 'retrying';
}

export interface SyncQueueManagerSnapshot {
  isProcessing: boolean;
  pendingTasksCount: number;
  tasks: SyncQueueTaskItem[];
  lastCompletedAtISO: string | null;
  lastError: string | null;
}

type QueueSubscriber = (snapshot: SyncQueueManagerSnapshot) => void;

/**
 * Centralized, persistent, and atomic SyncQueueManager for Cloud Firestore & Google Sheets writes.
 * - Coalesces multiple writes targeting the same resource (e.g. `class:<id>`, `users:all`, `gender:all`)
 *   within a 500ms window into a single unified network transaction.
 * - Merges concurrent snapshots for the same class so no field or student update is dropped.
 * - Persists queue tasks in `localStorage` before any network call so closing or refreshing never loses updates.
 * - Uses exponential backoff with jitter (`2^attempts * 2000ms + jitter`, capped at 60s).
 */
class CentralizedSyncQueueManager {
  private queue: SyncQueueTaskItem[] = [];
  private isProcessing = false;
  private subscribers = new Set<QueueSubscriber>();
  private retryTimerId: number | null = null;
  private lastCompletedAtISO: string | null = null;
  private lastError: string | null = null;
  private instanceId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // In-memory latest resource snapshots accumulated across a 500ms coalescing window
  private pendingClassSnapshots = new Map<string, ClassGroup>();
  private pendingUsersSnapshot: {
    users?: AuthorizedUser[];
    sessionLogs?: UserAccessSessionLog[];
    updatedAtMs: number;
  } | null = null;
  private pendingGenderSnapshot: {
    entries?: NameGenderEntry[];
    updatedAtMs: number;
  } | null = null;

  constructor() {
    this.hydrateFromStorage();
    this.registerLifecycleGuards();
  }

  private hydrateFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
      if (!raw) {
        this.queue = [];
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        // Recover any task left in 'processing' or stale 'coalesceUntilMs' from a prior tab close
        this.queue = parsed
          .filter((item) => item && typeof item.dedupeKey === 'string')
          .map((item: SyncQueueTaskItem) => ({
            ...item,
            status: item.status === 'processing' ? 'retrying' : item.status,
            nextRetryAtMs:
              item.status === 'processing'
                ? now + COALESCE_WINDOW_MS
                : item.status === 'queued'
                ? Math.min(item.nextRetryAtMs || 0, now + COALESCE_WINDOW_MS)
                : item.nextRetryAtMs || 0,
          }));
        this.persistToStorage();
      }
    } catch {
      this.queue = [];
    }
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      if (this.queue.length === 0) {
        localStorage.removeItem(SYNC_QUEUE_STORAGE_KEY);
      } else {
        localStorage.setItem(
          SYNC_QUEUE_STORAGE_KEY,
          JSON.stringify(this.queue.slice(0, 100))
        );
      }
    } catch {
      // Ignore storage quota errors
    }
    this.notifySubscribers();
  }

  private acquireCrossTabLock(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      const now = Date.now();
      const rawLock = localStorage.getItem(SYNC_QUEUE_LOCK_KEY);
      if (rawLock) {
        const parsed = JSON.parse(rawLock);
        if (
          parsed &&
          parsed.owner !== this.instanceId &&
          now - (parsed.timestampMs || 0) < LOCK_STALE_MS
        ) {
          return false;
        }
      }
      localStorage.setItem(
        SYNC_QUEUE_LOCK_KEY,
        JSON.stringify({ owner: this.instanceId, timestampMs: now })
      );
      return true;
    } catch {
      return true;
    }
  }

  private releaseCrossTabLock(): void {
    if (typeof window === 'undefined') return;
    try {
      const rawLock = localStorage.getItem(SYNC_QUEUE_LOCK_KEY);
      if (rawLock) {
        const parsed = JSON.parse(rawLock);
        if (parsed?.owner === this.instanceId) {
          localStorage.removeItem(SYNC_QUEUE_LOCK_KEY);
        }
      }
    } catch {
      // ignore
    }
  }

  private registerLifecycleGuards(): void {
    if (typeof window === 'undefined') return;

    const handlePageUnload = (e: BeforeUnloadEvent) => {
      if (this.queue.length > 0) {
        this.queue = this.queue.map((t) =>
          t.status === 'processing'
            ? { ...t, status: 'retrying', nextRetryAtMs: Date.now() }
            : t
        );
        this.persistToStorage();
        this.releaseCrossTabLock();
      }
      if (this.isProcessing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handleOnline = () => {
      if (this.queue.length > 0) {
        this.queue = this.queue.map((t) => ({ ...t, nextRetryAtMs: 0, coalesceUntilMs: 0 }));
        this.persistToStorage();
        void this.processQueue();
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === SYNC_QUEUE_STORAGE_KEY) {
        this.hydrateFromStorage();
        this.notifySubscribers();
      }
    };

    window.addEventListener('beforeunload', handlePageUnload);
    window.addEventListener('online', handleOnline);
    window.addEventListener('storage', handleStorage);
  }

  private computeExponentialBackoffMs(attempts: number): number {
    const exponent = Math.max(0, Math.min(attempts - 1, 6));
    const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, exponent));
    const jitter = Math.floor(Math.random() * 600);
    return Math.min(MAX_BACKOFF_MS, exponential + jitter);
  }

  private scheduleNextRetryTimer(preferredDelayMs?: number): void {
    if (typeof window === 'undefined') return;
    if (this.retryTimerId !== null) {
      window.clearTimeout(this.retryTimerId);
      this.retryTimerId = null;
    }

    if (this.queue.length === 0) return;

    const now = Date.now();
    const earliestRetryMs = Math.min(
      ...this.queue.map((t) => Math.max(0, (t.nextRetryAtMs || 0) - now))
    );
    const rawDelay =
      typeof preferredDelayMs === 'number'
        ? Math.min(earliestRetryMs, preferredDelayMs)
        : earliestRetryMs;
    const delayMs = Math.max(20, Math.min(rawDelay, 5000));

    this.retryTimerId = window.setTimeout(() => {
      this.retryTimerId = null;
      void this.processQueue();
    }, delayMs);
  }

  public getSnapshot(): SyncQueueManagerSnapshot {
    return {
      isProcessing: this.isProcessing,
      pendingTasksCount: this.queue.length,
      tasks: [...this.queue],
      lastCompletedAtISO: this.lastCompletedAtISO,
      lastError: this.lastError,
    };
  }

  public subscribe(subscriber: QueueSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.getSnapshot());
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private isNotifyScheduled = false;

  private notifySubscribers(): void {
    if (this.isNotifyScheduled) return;
    this.isNotifyScheduled = true;
    queueMicrotask(() => {
      this.isNotifyScheduled = false;
      const snap = this.getSnapshot();
      this.subscribers.forEach((sub) => {
        try {
          sub(snap);
        } catch {
          // ignore subscriber errors
        }
      });
    });
  }

  private mergeCoalescedClassSnapshot(
    prev: ClassGroup | undefined,
    next: ClassGroup
  ): ClassGroup {
    if (!prev) return next;
    const prevTs = prev.updatedAtMs || 0;
    const nextTs = next.updatedAtMs || Date.now();
    const merged = mergeClassesWithConcurrencyControl([next], [prev], nextTs, prevTs);
    return merged[0] || next;
  }

  /**
   * Enqueues a class update (monthly absences, consecutive absences, student photo, PDF link, or student data).
   * Coalesces multiple writes to the same class (`class:<classId>`) within a 500ms window into a single transaction.
   */
  public enqueueClassWrite(params: {
    category: Exclude<SyncQueueTaskCategory, 'users_access' | 'gender_dictionary'>;
    updatedClass: ClassGroup;
    allClasses: ClassGroup[];
    studentId?: string;
    description?: string;
  }): void {
    const now = Date.now();
    const incomingTs = Math.max(now, params.updatedClass.updatedAtMs || now);
    const stampedIncoming: ClassGroup = {
      ...params.updatedClass,
      updatedAtMs: incomingTs,
    };
    const mergedClassSnapshot = this.mergeCoalescedClassSnapshot(
      this.pendingClassSnapshots.get(params.updatedClass.id),
      stampedIncoming
    );
    this.pendingClassSnapshots.set(params.updatedClass.id, mergedClassSnapshot);

    const dedupeKey = `class:${params.updatedClass.id}`;
    const existingIdx = this.queue.findIndex((t) => t.dedupeKey === dedupeKey);
    const coalesceUntilMs = now + COALESCE_WINDOW_MS;

    const categoryLabels: Record<SyncQueueTaskCategory, string> = {
      attendance: 'Faltas e Frequência',
      photo: 'Vínculo de Foto',
      pdf: 'Vínculo de Ficha Informativa',
      student_data: 'Dados Cadastrais / Busca Ativa',
      users_access: 'Controle de Acessos',
      gender_dictionary: 'Consulta de Gênero M/F',
    };

    const description =
      params.description ||
      `${categoryLabels[params.category]} — ${params.updatedClass.name}`;

    if (existingIdx >= 0) {
      const prev = this.queue[existingIdx];
      const mergedCategories = Array.from(
        new Set([...(prev.categoriesCoalesced || [prev.category]), params.category])
      );
      this.queue[existingIdx] = {
        ...prev,
        category: params.category,
        categoriesCoalesced: mergedCategories,
        studentId: params.studentId || prev.studentId,
        description:
          mergedCategories.length > 1
            ? `${params.updatedClass.name} (${(prev.coalescedCount || 1) + 1} atualizações agrupadas)`
            : description,
        updatedAtMs: Math.max(prev.updatedAtMs, incomingTs),
        coalesceUntilMs,
        coalescedCount: (prev.coalescedCount || 1) + 1,
        status: prev.status === 'processing' ? 'processing' : 'queued',
        nextRetryAtMs: prev.status === 'processing' ? prev.nextRetryAtMs : coalesceUntilMs,
      };
    } else {
      this.queue.push({
        taskId: `sq-${params.category}-${now}-${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        category: params.category,
        categoriesCoalesced: [params.category],
        classId: params.updatedClass.id,
        studentId: params.studentId,
        description,
        createdAtMs: now,
        updatedAtMs: incomingTs,
        coalesceUntilMs,
        coalescedCount: 1,
        attempts: 0,
        nextRetryAtMs: coalesceUntilMs,
        status: 'queued',
      });
    }

    this.persistToStorage();
    this.scheduleNextRetryTimer(COALESCE_WINDOW_MS);
  }

  /**
   * Enqueues an AuthorizedUsers & AccessSessionLogs write to Cloud Firestore (and optional Google Sheet).
   * Coalesces multiple writes under `users:all` within a 500ms window.
   */
  public enqueueUsersAccessWrite(params?: {
    users?: AuthorizedUser[];
    sessionLogs?: UserAccessSessionLog[];
    description?: string;
  }): void {
    const now = Date.now();
    const coalesceUntilMs = now + COALESCE_WINDOW_MS;
    this.pendingUsersSnapshot = {
      users: params?.users ?? this.pendingUsersSnapshot?.users,
      sessionLogs: params?.sessionLogs ?? this.pendingUsersSnapshot?.sessionLogs,
      updatedAtMs: now,
    };

    const dedupeKey = 'users:all';
    const existingIdx = this.queue.findIndex((t) => t.dedupeKey === dedupeKey);
    const description =
      params?.description || 'Sincronização de Acessos e Sessões na Nuvem da Escola';

    if (existingIdx >= 0) {
      const prev = this.queue[existingIdx];
      this.queue[existingIdx] = {
        ...prev,
        categoriesCoalesced: ['users_access'],
        description,
        updatedAtMs: now,
        coalesceUntilMs,
        coalescedCount: (prev.coalescedCount || 1) + 1,
        status: prev.status === 'processing' ? 'processing' : 'queued',
        nextRetryAtMs: prev.status === 'processing' ? prev.nextRetryAtMs : coalesceUntilMs,
      };
    } else {
      this.queue.push({
        taskId: `sq-users-${now}-${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        category: 'users_access',
        categoriesCoalesced: ['users_access'],
        description,
        createdAtMs: now,
        updatedAtMs: now,
        coalesceUntilMs,
        coalescedCount: 1,
        attempts: 0,
        nextRetryAtMs: coalesceUntilMs,
        status: 'queued',
      });
    }

    this.persistToStorage();
    this.scheduleNextRetryTimer(COALESCE_WINDOW_MS);
  }

  /**
   * Enqueues a Gender Dictionary (`Consulta_Genero_Nomes_2027`) write to Google Sheets and Firestore.
   * Coalesces multiple updates under `gender:all` within a 500ms window for atomic execution.
   */
  public enqueueGenderDictionaryWrite(params?: {
    entries?: NameGenderEntry[];
    description?: string;
  }): void {
    const now = Date.now();
    const coalesceUntilMs = now + COALESCE_WINDOW_MS;
    this.pendingGenderSnapshot = {
      entries: params?.entries ?? this.pendingGenderSnapshot?.entries,
      updatedAtMs: now,
    };

    const dedupeKey = 'gender:all';
    const existingIdx = this.queue.findIndex((t) => t.dedupeKey === dedupeKey);
    const description =
      params?.description || 'Sincronização da Aba Consulta_Genero_Nomes_2027 (M/F)';

    if (existingIdx >= 0) {
      const prev = this.queue[existingIdx];
      this.queue[existingIdx] = {
        ...prev,
        categoriesCoalesced: ['gender_dictionary'],
        description,
        updatedAtMs: now,
        coalesceUntilMs,
        coalescedCount: (prev.coalescedCount || 1) + 1,
        status: prev.status === 'processing' ? 'processing' : 'queued',
        nextRetryAtMs: prev.status === 'processing' ? prev.nextRetryAtMs : coalesceUntilMs,
      };
    } else {
      this.queue.push({
        taskId: `sq-gender-${now}-${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        category: 'gender_dictionary',
        categoriesCoalesced: ['gender_dictionary'],
        description,
        createdAtMs: now,
        updatedAtMs: now,
        coalesceUntilMs,
        coalescedCount: 1,
        attempts: 0,
        nextRetryAtMs: coalesceUntilMs,
        status: 'queued',
      });
    }

    this.persistToStorage();
    this.scheduleNextRetryTimer(COALESCE_WINDOW_MS);
  }

  public hasPendingTasks(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Immediately expires queued coalescing timers and processes pending writes (used on explicit logout).
   */
  public async flushNow(): Promise<boolean> {
    if (this.retryTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.retryTimerId);
      this.retryTimerId = null;
    }
    if (this.queue.length > 0) {
      this.queue = this.queue.map((t) =>
        t.status === 'queued'
          ? { ...t, nextRetryAtMs: 0, coalesceUntilMs: 0 }
          : t
      );
      this.persistToStorage();
    }
    return this.processQueue();
  }

  /**
   * Processes due tasks after their 500ms coalescing window expires.
   * Multiple due `class:*` tasks are unified into ONE atomic Firestore batch transaction
   * containing only the coalesced dirty classes.
   */
  public async processQueue(): Promise<boolean> {
    if (this.isProcessing) return false;
    if (this.queue.length === 0) return true;
    if (!this.acquireCrossTabLock()) {
      this.scheduleNextRetryTimer();
      return false;
    }

    const now = Date.now();
    const dueTaskIdx = this.queue.findIndex((t) => (t.nextRetryAtMs || 0) <= now);
    if (dueTaskIdx === -1) {
      this.releaseCrossTabLock();
      this.scheduleNextRetryTimer();
      return false;
    }

    this.isProcessing = true;
    setSyncingActiveState();
    this.notifySubscribers();

    try {
      while (this.queue.length > 0) {
        const currentNow = Date.now();
        const dueTasks = this.queue.filter((t) => (t.nextRetryAtMs || 0) <= currentNow);
        if (dueTasks.length === 0) break;

        const hasLinkedSheet = Boolean(
          getSavedSpreadsheetInfo().spreadsheetId && getDriveAuthState().hasValidToken
        );

        const dueClassTasks = dueTasks.filter(
          (t) => t.category !== 'users_access' && t.category !== 'gender_dictionary'
        );

        // 1. Unified single Firestore transaction for all due coalesced class tasks
        if (dueClassTasks.length > 0) {
          const taskSnapshots = dueClassTasks.map((t) => ({ ...t, status: 'processing' as const }));
          const snapshotByKey = new Map(taskSnapshots.map((s) => [s.dedupeKey, s]));
          this.queue = this.queue.map((t) =>
            snapshotByKey.has(t.dedupeKey) ? { ...t, status: 'processing' as const } : t
          );
          this.persistToStorage();

          try {
            const latestClasses = getStoredClasses();
            const reconciledClassesMap = new Map<string, ClassGroup>();
            let batchUpdatedAtMs = 0;

            for (const snap of taskSnapshots) {
              const targetId = snap.classId || snap.dedupeKey.replace(/^class:/, '');
              const storedCls = latestClasses.find((c) => c.id === targetId);
              const bufferedCls = this.pendingClassSnapshots.get(targetId);

              let effectiveClass: ClassGroup | undefined;
              if (storedCls && bufferedCls) {
                effectiveClass = this.mergeCoalescedClassSnapshot(bufferedCls, storedCls);
              } else {
                effectiveClass = storedCls || bufferedCls;
              }

              if (effectiveClass) {
                reconciledClassesMap.set(effectiveClass.id, effectiveClass);
                batchUpdatedAtMs = Math.max(
                  batchUpdatedAtMs,
                  effectiveClass.updatedAtMs || 0,
                  snap.updatedAtMs || 0
                );
              }
            }

            const classesToCommit = Array.from(reconciledClassesMap.values());
            const commitTimestamp = batchUpdatedAtMs || Date.now();

            const firestoreOk =
              classesToCommit.length > 0
                ? await saveClassesToFirestoreCloud(classesToCommit, commitTimestamp)
                : await saveClassesToFirestoreCloud(latestClasses, commitTimestamp);

            if (hasLinkedSheet) {
              for (const clsToSync of classesToCommit) {
                await writeAttendanceOnlyToGoogleSheet(clsToSync, latestClasses).catch(
                  () => undefined
                );
              }
            }

            if (!firestoreOk) {
              throw new Error(
                'Falha ao salvar dados na nuvem da escola — retentativa agendada.'
              );
            }

            // Reconcile queue: remove tasks unless a newer edit arrived while this batch was in-flight
            for (const snap of taskSnapshots) {
              const currentIdx = this.queue.findIndex((t) => t.dedupeKey === snap.dedupeKey);
              if (currentIdx >= 0) {
                const latestInQueue = this.queue[currentIdx];
                if (latestInQueue.updatedAtMs <= snap.updatedAtMs) {
                  this.queue.splice(currentIdx, 1);
                  if (snap.classId) {
                    const pendingSnap = this.pendingClassSnapshots.get(snap.classId);
                    if (!pendingSnap || (pendingSnap.updatedAtMs || 0) <= snap.updatedAtMs) {
                      this.pendingClassSnapshots.delete(snap.classId);
                    }
                  }
                } else {
                  const nextWindow =
                    latestInQueue.coalesceUntilMs && latestInQueue.coalesceUntilMs > Date.now()
                      ? latestInQueue.coalesceUntilMs
                      : Date.now() + COALESCE_WINDOW_MS;
                  this.queue[currentIdx] = {
                    ...latestInQueue,
                    status: 'queued',
                    nextRetryAtMs: nextWindow,
                  };
                }
              }
            }

            this.lastCompletedAtISO = new Date().toISOString();
            this.lastError = null;
            markSyncOperationSuccess('save_classes');
            this.persistToStorage();
            continue;
          } catch (err: any) {
            const errorMessage =
              err?.message || 'Falha de comunicação com a nuvem — retentativa agendada';
            let maxAttempts = 1;
            let maxBackoff = BASE_BACKOFF_MS;

            for (const snap of taskSnapshots) {
              const nextAttempts = (snap.attempts || 0) + 1;
              const backoffMs = this.computeExponentialBackoffMs(nextAttempts);
              maxAttempts = Math.max(maxAttempts, nextAttempts);
              maxBackoff = Math.max(maxBackoff, backoffMs);

              const currentIdx = this.queue.findIndex((t) => t.dedupeKey === snap.dedupeKey);
              if (currentIdx >= 0) {
                this.queue[currentIdx] = {
                  ...this.queue[currentIdx],
                  attempts: nextAttempts,
                  status: 'retrying',
                  lastError: errorMessage,
                  nextRetryAtMs: Date.now() + backoffMs,
                };
              }
            }

            this.lastError = errorMessage;
            enqueuePendingSyncOperation(
              'save_classes',
              `${taskSnapshots.length} turma(s) agrupada(s) (tentativa ${maxAttempts} · backoff ${Math.round(
                maxBackoff / 1000
              )}s)`,
              errorMessage
            );
            this.persistToStorage();
            break;
          }
        }

        // 2. Process due metadata task (`users_access` or `gender_dictionary`)
        const metaTask = dueTasks[0];
        const metaIdx = this.queue.findIndex((t) => t.dedupeKey === metaTask.dedupeKey);
        if (metaIdx === -1) break;

        const taskSnapshot = { ...this.queue[metaIdx], status: 'processing' as const };
        this.queue[metaIdx] = taskSnapshot;
        this.persistToStorage();

        try {
          if (taskSnapshot.category === 'users_access') {
            const latestUsers =
              this.pendingUsersSnapshot?.users || getStoredAuthorizedUsers();
            const latestLogs =
              this.pendingUsersSnapshot?.sessionLogs || getStoredAccessSessionLogs();
            const firestoreOk = await saveConfigMetaToFirestoreCloud({
              authorizedUsers: latestUsers,
              accessSessionLogs: latestLogs,
            });
            if (hasLinkedSheet) {
              await syncAuthorizedUsersToGoogleSheet(latestUsers, latestLogs).catch(() => false);
            }
            if (!firestoreOk) {
              throw new Error(
                'Sincronização de acessos pendente — aguardando conexão com o banco na nuvem.'
              );
            }
          } else if (taskSnapshot.category === 'gender_dictionary') {
            const latestClasses = getStoredClasses();
            const latestEntries =
              this.pendingGenderSnapshot?.entries || getStoredNameGenderEntries();
            const firestoreOk = await saveConfigMetaToFirestoreCloud({
              genderDictionary: latestEntries,
            });
            if (hasLinkedSheet) {
              await syncGenderDictionaryToGoogleSheet(latestClasses, latestEntries).catch(() => false);
            }
            if (!firestoreOk) {
              throw new Error(
                'Sincronização do dicionário pendente — aguardando conexão com a nuvem.'
              );
            }
          }

          const currentIdx = this.queue.findIndex(
            (t) => t.dedupeKey === taskSnapshot.dedupeKey
          );
          if (currentIdx >= 0) {
            const latestInQueue = this.queue[currentIdx];
            if (latestInQueue.updatedAtMs <= taskSnapshot.updatedAtMs) {
              this.queue.splice(currentIdx, 1);
              if (taskSnapshot.category === 'users_access') {
                this.pendingUsersSnapshot = null;
              } else if (taskSnapshot.category === 'gender_dictionary') {
                this.pendingGenderSnapshot = null;
              }
            } else {
              const nextWindow =
                latestInQueue.coalesceUntilMs && latestInQueue.coalesceUntilMs > Date.now()
                  ? latestInQueue.coalesceUntilMs
                  : Date.now() + COALESCE_WINDOW_MS;
              this.queue[currentIdx] = {
                ...latestInQueue,
                status: 'queued',
                nextRetryAtMs: nextWindow,
              };
            }
          }

          this.lastCompletedAtISO = new Date().toISOString();
          this.lastError = null;
          markSyncOperationSuccess(
            taskSnapshot.category === 'users_access' ? 'save_users' : 'save_classes'
          );
          this.persistToStorage();
        } catch (err: any) {
          const nextAttempts = (taskSnapshot.attempts || 0) + 1;
          const backoffMs = this.computeExponentialBackoffMs(nextAttempts);
          const errorMessage =
            err?.message || 'Falha de comunicação com a nuvem — retentativa agendada';

          const currentIdx = this.queue.findIndex(
            (t) => t.dedupeKey === taskSnapshot.dedupeKey
          );
          if (currentIdx >= 0) {
            this.queue[currentIdx] = {
              ...this.queue[currentIdx],
              attempts: nextAttempts,
              status: 'retrying',
              lastError: errorMessage,
              nextRetryAtMs: Date.now() + backoffMs,
            };
          }

          this.lastError = errorMessage;
          enqueuePendingSyncOperation(
            taskSnapshot.category === 'users_access' ? 'save_users' : 'save_classes',
            `${taskSnapshot.description} (tentativa ${nextAttempts} · backoff ${Math.round(
              backoffMs / 1000
            )}s)`,
            errorMessage
          );
          this.persistToStorage();
          break;
        }
      }
    } finally {
      this.isProcessing = false;
      this.releaseCrossTabLock();
      this.notifySubscribers();
      this.scheduleNextRetryTimer();
    }

    return this.queue.length === 0;
  }
}

export const SyncQueueManager = new CentralizedSyncQueueManager();

export const enqueueGenderDictionaryWrite = (
  entries: NameGenderEntry[],
  _classes?: ClassGroup[]
): void => {
  SyncQueueManager.enqueueGenderDictionaryWrite({ entries });
};


