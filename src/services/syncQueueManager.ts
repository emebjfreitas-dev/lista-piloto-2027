import {
  ClassGroup,
  AuthorizedUser,
  UserAccessSessionLog,
} from '../types';
import {
  getStoredClasses,
  getStoredAuthorizedUsers,
  getStoredAccessSessionLogs,
} from './db';
import {
  enqueuePendingSyncOperation,
  markSyncOperationSuccess,
  setSyncingActiveState,
  saveConfigMetaToFirestoreCloud,
} from './firebaseSync';
import {
  writeAttendanceOnlyToGoogleSheet,
  syncAuthorizedUsersToGoogleSheet,
  syncGenderDictionaryToGoogleSheet,
} from './googleSheetsApi';
import {
  NameGenderEntry,
  getStoredNameGenderEntries,
} from '../utils/genderDictionary';

const SYNC_QUEUE_STORAGE_KEY = 'emeb_candelario_sheet_sync_queue_v2';
const SYNC_QUEUE_LOCK_KEY = 'emeb_candelario_sheet_sync_lock_v2';

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
  dedupeKey: string; // e.g. `class:g04a` or `users:all`
  category: SyncQueueTaskCategory;
  classId?: string;
  studentId?: string;
  description: string;
  createdAtMs: number;
  updatedAtMs: number;
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
 * Centralized, persistent, and atomic SyncQueueManager for Google Sheets writes.
 * - Persists queue tasks in `localStorage` before any network call so closing or refreshing the tab never loses or corrupts updates.
 * - Coalesces rapid updates per class (`class:<id>`) or user table (`users:all`) to prevent duplicate rows and race conditions.
 * - Uses exponential backoff with jitter (`2^attempts * 2000ms + jitter`, capped at 60s).
 * - Protects against mid-flight tab close via `beforeunload` / `pagehide` warnings and cross-tab lock recovery.
 */
class CentralizedSyncQueueManager {
  private queue: SyncQueueTaskItem[] = [];
  private isProcessing = false;
  private subscribers = new Set<QueueSubscriber>();
  private retryTimerId: number | null = null;
  private lastCompletedAtISO: string | null = null;
  private lastError: string | null = null;
  private instanceId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
        // Recover any task that was left in 'processing' if the user closed the tab mid-request
        this.queue = parsed
          .filter((item) => item && typeof item.dedupeKey === 'string')
          .map((item: SyncQueueTaskItem) => ({
            ...item,
            status: item.status === 'processing' ? 'retrying' : item.status,
            nextRetryAtMs:
              item.status === 'processing' ? Date.now() + 500 : item.nextRetryAtMs || 0,
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
        // Atomic write of the serialized queue state
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

    // If the user attempts to close the tab while a write is actively in-flight,
    // persist the state immediately as 'retrying' so on next open it resumes cleanly without corruption.
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
      // Reset backoff timers when connectivity is restored so pending items flush immediately
      if (this.queue.length > 0) {
        this.queue = this.queue.map((t) => ({ ...t, nextRetryAtMs: 0 }));
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

  private scheduleNextRetryTimer(): void {
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
    const delayMs = Math.max(250, Math.min(earliestRetryMs, 5000));

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

  /**
   * Enqueues a class update (monthly absences, consecutive absences, student photo, PDF link, or student registration data).
   * Coalesces by `class:<classId>` so multiple rapid edits to the same class execute atomically with the freshest data.
   */
  public enqueueClassWrite(params: {
    category: Exclude<SyncQueueTaskCategory, 'users_access' | 'gender_dictionary'>;
    updatedClass: ClassGroup;
    allClasses: ClassGroup[];
    studentId?: string;
    description?: string;
  }): void {
    const now = Date.now();
    const dedupeKey = `class:${params.updatedClass.id}`;
    const existingIdx = this.queue.findIndex((t) => t.dedupeKey === dedupeKey);

    const categoryLabels: Record<SyncQueueTaskCategory, string> = {
      attendance: 'Faltas e Frequência',
      photo: 'Vínculo de Foto',
      pdf: 'Vínculo de Ficha PDF',
      student_data: 'Dados Cadastrais / Busca Ativa',
      users_access: 'Controle de Acessos',
      gender_dictionary: 'Consulta de Gênero M/F',
    };

    const description =
      params.description ||
      `${categoryLabels[params.category]} — ${params.updatedClass.name}`;

    if (existingIdx >= 0) {
      const prev = this.queue[existingIdx];
      this.queue[existingIdx] = {
        ...prev,
        category: params.category,
        studentId: params.studentId || prev.studentId,
        description,
        updatedAtMs: Math.max(now, params.updatedClass.updatedAtMs || now),
        nextRetryAtMs: prev.status === 'processing' ? prev.nextRetryAtMs : 0,
      };
    } else {
      this.queue.push({
        taskId: `sq-${params.category}-${now}-${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        category: params.category,
        classId: params.updatedClass.id,
        studentId: params.studentId,
        description,
        createdAtMs: now,
        updatedAtMs: Math.max(now, params.updatedClass.updatedAtMs || now),
        attempts: 0,
        nextRetryAtMs: 0,
        status: 'queued',
      });
    }

    this.persistToStorage();
    void this.processQueue();
  }

  /**
   * Enqueues an AuthorizedUsers & AccessSessionLogs write to Google Sheets.
   * Coalesces under `users:all` so concurrent heartbeats or admin edits never overlap or duplicate rows.
   */
  public enqueueUsersAccessWrite(params?: {
    users?: AuthorizedUser[];
    sessionLogs?: UserAccessSessionLog[];
    description?: string;
  }): void {
    const now = Date.now();
    const dedupeKey = 'users:all';
    const existingIdx = this.queue.findIndex((t) => t.dedupeKey === dedupeKey);
    const description =
      params?.description || 'Sincronização de Acessos e Sessões na Planilha Google';

    if (existingIdx >= 0) {
      const prev = this.queue[existingIdx];
      this.queue[existingIdx] = {
        ...prev,
        description,
        updatedAtMs: now,
        nextRetryAtMs: prev.status === 'processing' ? prev.nextRetryAtMs : 0,
      };
    } else {
      this.queue.push({
        taskId: `sq-users-${now}-${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        category: 'users_access',
        description,
        createdAtMs: now,
        updatedAtMs: now,
        attempts: 0,
        nextRetryAtMs: 0,
        status: 'queued',
      });
    }

    this.persistToStorage();
    void this.processQueue();
  }

  /**
   * Enqueues a Gender Dictionary (`Consulta_Genero_Nomes_2027`) write to Google Sheets and Firestore.
   * Coalesces under `gender:all` for atomic, zero-duplication updates.
   */
  public enqueueGenderDictionaryWrite(params?: {
    entries?: NameGenderEntry[];
    description?: string;
  }): void {
    const now = Date.now();
    const dedupeKey = 'gender:all';
    const existingIdx = this.queue.findIndex((t) => t.dedupeKey === dedupeKey);
    const description =
      params?.description || 'Sincronização da Aba Consulta_Genero_Nomes_2027 (M/F)';

    if (params?.entries) {
      void saveConfigMetaToFirestoreCloud({ genderDictionary: params.entries });
    }

    if (existingIdx >= 0) {
      const prev = this.queue[existingIdx];
      this.queue[existingIdx] = {
        ...prev,
        description,
        updatedAtMs: now,
        nextRetryAtMs: prev.status === 'processing' ? prev.nextRetryAtMs : 0,
      };
    } else {
      this.queue.push({
        taskId: `sq-gender-${now}-${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        category: 'gender_dictionary',
        description,
        createdAtMs: now,
        updatedAtMs: now,
        attempts: 0,
        nextRetryAtMs: 0,
        status: 'queued',
      });
    }

    this.persistToStorage();
    void this.processQueue();
  }

  public hasPendingTasks(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Processes due tasks sequentially (FIFO with per-key coalescing) and exponential backoff retry.
   * Safe to invoke from user actions, `online` events, or the 5s heartbeat in `App.tsx`.
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
        const idx = this.queue.findIndex((t) => (t.nextRetryAtMs || 0) <= currentNow);
        if (idx === -1) break;

        const taskSnapshot = { ...this.queue[idx], status: 'processing' as const };
        this.queue[idx] = taskSnapshot;
        this.persistToStorage();

        try {
          if (taskSnapshot.category === 'users_access') {
            const latestUsers = getStoredAuthorizedUsers();
            const latestLogs = getStoredAccessSessionLogs();
            const ok = await syncAuthorizedUsersToGoogleSheet(latestUsers, latestLogs);
            if (!ok) {
              throw new Error(
                'Sincronização de acessos pendente — aguardando reconexão ou planilha.'
              );
            }
          } else if (taskSnapshot.category === 'gender_dictionary') {
            const latestClasses = getStoredClasses();
            const latestEntries = getStoredNameGenderEntries();
            await saveConfigMetaToFirestoreCloud({ genderDictionary: latestEntries });
            await syncGenderDictionaryToGoogleSheet(latestClasses, latestEntries);
          } else {
            // Always read the latest persisted state from local storage so we write an atomic, up-to-date snapshot
            const latestClasses = getStoredClasses();
            const targetClass =
              latestClasses.find((c) => c.id === taskSnapshot.classId) ||
              latestClasses[0];
            if (targetClass) {
              await writeAttendanceOnlyToGoogleSheet(targetClass, latestClasses);
            }
          }

          // Task succeeded: dequeue only if no newer update arrived for the same dedupeKey while in-flight
          const currentIdx = this.queue.findIndex(
            (t) => t.dedupeKey === taskSnapshot.dedupeKey
          );
          if (currentIdx >= 0) {
            const latestInQueue = this.queue[currentIdx];
            if (latestInQueue.updatedAtMs <= taskSnapshot.updatedAtMs) {
              this.queue.splice(currentIdx, 1);
            } else {
              // A newer edit arrived during execution; mark it queued for immediate next pass
              this.queue[currentIdx] = {
                ...latestInQueue,
                status: 'queued',
                nextRetryAtMs: 0,
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
            err?.message || 'Falha de comunicação com Google Sheets — retentativa agendada';

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
          // Break current pass so backoff timer governs next retry without tight-looping
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

