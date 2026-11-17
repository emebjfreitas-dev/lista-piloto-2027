import { ClassGroup } from '../types';

const PHOTO_CACHE_DB_NAME = 'emeb_candelario_student_photo_cache_v1';
const PHOTO_CACHE_DB_VERSION = 1;
const STORE_PHOTO_URLS = 'photo_urls';
const STORE_PHOTO_BLOBS = 'photo_blobs';
const MAX_CONCURRENT_BLOB_FETCHES = 4;

export interface StudentPhotoUrlRecord {
  studentKey: string;
  studentId?: string;
  ra?: string;
  normalizedName: string;
  photoUrl: string;
  photoDriveUrl?: string;
  driveFileId?: string;
  isManualLink?: boolean;
  updatedAtMs: number;
}

interface StudentPhotoBlobRecord {
  cacheKey: string;
  sourceUrl: string;
  driveFileId?: string;
  blob: Blob;
  contentType: string;
  byteSize: number;
  cachedAtMs: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let warmupPromise: Promise<void> | null = null;
let isCacheWarmedUp = false;

// Fast synchronous in-memory indices backed by IndexedDB
const memoryUrlMap = new Map<string, StudentPhotoUrlRecord>();
const memoryBlobObjectUrlMap = new Map<string, string>();
const attemptedFetchKeys = new Set<string>();
const corsBlockedUrls = new Set<string>();
const inFlightFetchMap = new Map<string, Promise<string | null>>();

const readyListeners = new Set<() => void>();
const blobUpdateListeners = new Set<(cacheKey: string) => void>();

// Bounded concurrency queue for background blob caching
let activeFetchCount = 0;
const pendingFetchQueue: Array<() => void> = [];

const acquireFetchSlot = (): Promise<void> => {
  if (activeFetchCount < MAX_CONCURRENT_BLOB_FETCHES) {
    activeFetchCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    pendingFetchQueue.push(() => {
      activeFetchCount++;
      resolve();
    });
  });
};

const releaseFetchSlot = (): void => {
  activeFetchCount = Math.max(0, activeFetchCount - 1);
  const next = pendingFetchQueue.shift();
  if (next) next();
};

const normalizeTextKey = (value?: string): string => {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeRaKey = (ra?: string): string => {
  if (!ra) return '';
  return ra.replace(/\D/g, '').replace(/^0+/, '');
};

export const extractDriveFileIdFromPhotoUrl = (url?: string): string => {
  if (!url || url.startsWith('data:image/') || url.startsWith('blob:')) return '';
  const m0 = url.match(/\/api\/drive-photo\/([a-zA-Z0-9-_]+)/);
  if (m0 && m0[1]) return m0[1];
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (m1 && m1[1]) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (m2 && m2[1]) return m2[1];
  const m3 = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9-_]+)/);
  if (m3 && m3[1]) return m3[1];
  return '';
};

export const buildStudentPhotoLookupKeys = (params: {
  studentId?: string;
  ra?: string;
  name?: string;
}): string[] => {
  const keys: string[] = [];
  if (params.studentId && params.studentId.trim()) {
    keys.push(`id:${params.studentId.trim()}`);
  }
  const cleanRa = normalizeRaKey(params.ra);
  if (cleanRa.length >= 4) {
    keys.push(`ra:${cleanRa}`);
  }
  const cleanName = normalizeTextKey(params.name);
  if (cleanName.length >= 3) {
    keys.push(`name:${cleanName}`);
  }
  return keys;
};

export const buildPhotoBlobCacheKeys = (url?: string, driveFileId?: string): string[] => {
  const keys: string[] = [];
  const resolvedDriveId = driveFileId || extractDriveFileIdFromPhotoUrl(url);
  if (resolvedDriveId) {
    keys.push(`drive:${resolvedDriveId}`);
  }
  const cleanUrl = (url || '').trim();
  if (cleanUrl && !cleanUrl.startsWith('blob:')) {
    keys.push(`url:${cleanUrl}`);
  }
  return Array.from(new Set(keys));
};

const openPhotoCacheDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste ambiente.'));
      return;
    }
    const req = indexedDB.open(PHOTO_CACHE_DB_NAME, PHOTO_CACHE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PHOTO_URLS)) {
        const urlStore = db.createObjectStore(STORE_PHOTO_URLS, { keyPath: 'studentKey' });
        urlStore.createIndex('updatedAtMs', 'updatedAtMs', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTO_BLOBS)) {
        const blobStore = db.createObjectStore(STORE_PHOTO_BLOBS, { keyPath: 'cacheKey' });
        blobStore.createIndex('cachedAtMs', 'cachedAtMs', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        try {
          db.close();
        } catch {
          // ignore
        }
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Falha ao abrir IndexedDB de fotos dos alunos.'));
    };
  });
  return dbPromise;
};

const registerObjectUrlInMemory = (keys: string[], blob: Blob): string => {
  for (const k of keys) {
    const existing = memoryBlobObjectUrlMap.get(k);
    if (existing) {
      keys.forEach((alias) => memoryBlobObjectUrlMap.set(alias, existing));
      return existing;
    }
  }
  const objUrl = URL.createObjectURL(blob);
  keys.forEach((k) => {
    memoryBlobObjectUrlMap.set(k, objUrl);
    blobUpdateListeners.forEach((cb) => {
      try {
        cb(k);
      } catch {
        // ignore
      }
    });
  });
  return objUrl;
};

const dataUrlToBlob = (dataUrl: string): Blob | null => {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+);/i);
    const mimeType = mimeMatch?.[1] || 'image/jpeg';
    if (header.toLowerCase().includes(';base64')) {
      const binary = atob(body);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    }
    return new Blob([decodeURIComponent(body)], { type: mimeType });
  } catch {
    return null;
  }
};

const putBlobRecordsInIdb = async (
  keys: string[],
  sourceUrl: string,
  driveFileId: string | undefined,
  blob: Blob
): Promise<void> => {
  if (!blob || blob.size === 0 || keys.length === 0) return;
  try {
    const db = await openPhotoCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_PHOTO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_BLOBS);
      const now = Date.now();
      for (const cacheKey of keys) {
        const record: StudentPhotoBlobRecord = {
          cacheKey,
          sourceUrl,
          driveFileId,
          blob,
          contentType: blob.type || 'image/jpeg',
          byteSize: blob.size,
          cachedAtMs: now,
        };
        store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore storage quota errors gracefully
  }
};

const putUrlRecordsInIdb = async (records: StudentPhotoUrlRecord[]): Promise<void> => {
  if (records.length === 0) return;
  try {
    const db = await openPhotoCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_PHOTO_URLS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_URLS);
      for (const rec of records) {
        store.put(rec);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore quota errors
  }
};

/**
 * Warms up all persisted student photo URLs and cached image blobs from IndexedDB
 * into synchronous in-memory Maps once on boot, enabling 0ms offline avatar rendering.
 */
export const warmupPhotoIndexedDbCache = async (): Promise<void> => {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try {
      const db = await openPhotoCacheDb();
      await Promise.all([
        new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(STORE_PHOTO_URLS, 'readonly');
            const req = tx.objectStore(STORE_PHOTO_URLS).getAll();
            req.onsuccess = () => {
              const rows = (req.result || []) as StudentPhotoUrlRecord[];
              for (const row of rows) {
                if (row && row.studentKey && (row.photoUrl || row.photoDriveUrl)) {
                  const prev = memoryUrlMap.get(row.studentKey);
                  if (!prev || (row.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
                    memoryUrlMap.set(row.studentKey, row);
                  }
                }
              }
              resolve();
            };
            req.onerror = () => resolve();
          } catch {
            resolve();
          }
        }),
        new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(STORE_PHOTO_BLOBS, 'readonly');
            const req = tx.objectStore(STORE_PHOTO_BLOBS).getAll();
            req.onsuccess = () => {
              const rows = (req.result || []) as StudentPhotoBlobRecord[];
              for (const row of rows) {
                if (row && row.cacheKey && row.blob && row.blob.size > 0) {
                  const keys = buildPhotoBlobCacheKeys(row.sourceUrl, row.driveFileId);
                  if (!keys.includes(row.cacheKey)) keys.unshift(row.cacheKey);
                  registerObjectUrlInMemory(keys, row.blob);
                }
              }
              resolve();
            };
            req.onerror = () => resolve();
          } catch {
            resolve();
          }
        }),
      ]);
    } catch {
      // Fallback gracefully if IndexedDB is blocked in private mode
    } finally {
      isCacheWarmedUp = true;
      readyListeners.forEach((cb) => {
        try {
          cb();
        } catch {
          // ignore
        }
      });
    }
  })();
  return warmupPromise;
};

export const subscribeToPhotoCacheReady = (cb: () => void): (() => void) => {
  if (isCacheWarmedUp) {
    cb();
  }
  readyListeners.add(cb);
  return () => {
    readyListeners.delete(cb);
  };
};

export const subscribeToPhotoBlobUpdates = (cb: (cacheKey: string) => void): (() => void) => {
  blobUpdateListeners.add(cb);
  return () => {
    blobUpdateListeners.delete(cb);
  };
};

/**
 * Synchronous lookup of persisted student photo URL metadata from IndexedDB warmup cache.
 */
export const getPersistedStudentPhotoUrlSync = (params: {
  studentId?: string;
  ra?: string;
  name?: string;
}): StudentPhotoUrlRecord | undefined => {
  const keys = buildStudentPhotoLookupKeys(params);
  for (const k of keys) {
    const hit = memoryUrlMap.get(k);
    if (hit && (hit.photoUrl || hit.photoDriveUrl)) {
      return hit;
    }
  }
  return undefined;
};

/**
 * Synchronous lookup of an offline-ready local `blob:` URL from IndexedDB warmup cache.
 */
export const getCachedPhotoObjectUrlSync = (
  url?: string,
  driveFileId?: string
): string | undefined => {
  const keys = buildPhotoBlobCacheKeys(url, driveFileId);
  for (const k of keys) {
    const objUrl = memoryBlobObjectUrlMap.get(k);
    if (objUrl) return objUrl;
  }
  return undefined;
};

/**
 * Persists a single student photo URL mapping (and inline DataURL blob if present) to IndexedDB.
 */
export const persistSingleStudentPhotoToIndexedDb = async (params: {
  studentId?: string;
  ra?: string;
  name: string;
  photoUrl: string;
  photoDriveUrl?: string;
  driveFileId?: string;
  isManualLink?: boolean;
  updatedAtMs?: number;
}): Promise<void> => {
  const cleanUrl = (params.photoUrl || '').trim();
  const cleanDriveUrl = (params.photoDriveUrl || '').trim();
  if (!cleanUrl && !cleanDriveUrl) return;

  const resolvedDriveId =
    params.driveFileId ||
    extractDriveFileIdFromPhotoUrl(cleanUrl) ||
    extractDriveFileIdFromPhotoUrl(cleanDriveUrl);
  const keys = buildStudentPhotoLookupKeys({
    studentId: params.studentId,
    ra: params.ra,
    name: params.name,
  });
  const now = params.updatedAtMs || Date.now();
  const normalizedName = normalizeTextKey(params.name);
  const cleanRa = normalizeRaKey(params.ra);

  const records: StudentPhotoUrlRecord[] = keys.map((studentKey) => ({
    studentKey,
    studentId: params.studentId,
    ra: cleanRa || undefined,
    normalizedName,
    photoUrl: cleanUrl || cleanDriveUrl,
    photoDriveUrl: cleanDriveUrl || undefined,
    driveFileId: resolvedDriveId || undefined,
    isManualLink: params.isManualLink,
    updatedAtMs: now,
  }));

  records.forEach((rec) => {
    memoryUrlMap.set(rec.studentKey, rec);
  });

  if (cleanUrl.startsWith('data:image/')) {
    const blob = dataUrlToBlob(cleanUrl);
    if (blob) {
      const blobKeys = buildPhotoBlobCacheKeys(cleanDriveUrl || cleanUrl, resolvedDriveId);
      registerObjectUrlInMemory(blobKeys, blob);
      await putBlobRecordsInIdb(blobKeys, cleanDriveUrl || cleanUrl, resolvedDriveId, blob);
    }
  }

  await putUrlRecordsInIdb(records);
};

/**
 * Persists all student profile photo URLs from loaded/updated classes into IndexedDB
 * so reloads and offline sessions recover all URLs instantly even if localStorage compacts.
 */
export const persistStudentPhotoUrlsToIndexedDb = async (
  classes: ClassGroup[]
): Promise<void> => {
  if (!Array.isArray(classes) || classes.length === 0) return;

  const recordsToPut: StudentPhotoUrlRecord[] = [];
  const dataUrlBlobsToPut: Array<{
    keys: string[];
    sourceUrl: string;
    driveFileId?: string;
    blob: Blob;
  }> = [];

  for (const cls of classes) {
    for (const st of cls.students || []) {
      const cleanUrl = (st.photo || '').trim();
      const cleanDriveUrl = (st.photoDriveUrl || '').trim();
      if (!cleanUrl && !cleanDriveUrl) continue;

      const resolvedDriveId =
        st.photoDriveId ||
        extractDriveFileIdFromPhotoUrl(cleanUrl) ||
        extractDriveFileIdFromPhotoUrl(cleanDriveUrl);
      const effectiveUrl = cleanUrl || cleanDriveUrl;
      const studentName = st.estudante || st.name || '';
      const keys = buildStudentPhotoLookupKeys({
        studentId: st.id,
        ra: st.ra,
        name: studentName,
      });
      const updatedAtMs = st.updatedAtMs || cls.updatedAtMs || Date.now();
      const normalizedName = normalizeTextKey(studentName);
      const cleanRa = normalizeRaKey(st.ra);

      for (const studentKey of keys) {
        const rec: StudentPhotoUrlRecord = {
          studentKey,
          studentId: st.id,
          ra: cleanRa || undefined,
          normalizedName,
          photoUrl: effectiveUrl,
          photoDriveUrl: cleanDriveUrl || undefined,
          driveFileId: resolvedDriveId || undefined,
          isManualLink: st.photoManualLink,
          updatedAtMs,
        };
        const existing = memoryUrlMap.get(studentKey);
        if (
          !existing ||
          existing.photoUrl !== rec.photoUrl ||
          existing.photoDriveUrl !== rec.photoDriveUrl ||
          rec.updatedAtMs > existing.updatedAtMs
        ) {
          memoryUrlMap.set(studentKey, rec);
          recordsToPut.push(rec);
        }
      }

      if (cleanUrl.startsWith('data:image/')) {
        const blobKeys = buildPhotoBlobCacheKeys(cleanDriveUrl || cleanUrl, resolvedDriveId);
        if (!getCachedPhotoObjectUrlSync(cleanDriveUrl || cleanUrl, resolvedDriveId)) {
          const blob = dataUrlToBlob(cleanUrl);
          if (blob) {
            registerObjectUrlInMemory(blobKeys, blob);
            dataUrlBlobsToPut.push({
              keys: blobKeys,
              sourceUrl: cleanDriveUrl || cleanUrl,
              driveFileId: resolvedDriveId || undefined,
              blob,
            });
          }
        }
      }
    }
  }

  if (recordsToPut.length > 0) {
    await putUrlRecordsInIdb(recordsToPut);
  }
  for (const item of dataUrlBlobsToPut) {
    await putBlobRecordsInIdb(item.keys, item.sourceUrl, item.driveFileId, item.blob);
  }
};

/**
 * Persists discovered Drive photo catalog URLs in IndexedDB keyed by normalized student name.
 */
export const persistDiscoveredPhotoUrlsToIndexedDb = async (
  items: Array<{
    fileName?: string;
    normalizedName?: string;
    id?: string;
    photoUrl?: string;
    driveLink?: string;
    updatedAt?: string;
  }>
): Promise<void> => {
  if (!Array.isArray(items) || items.length === 0) return;
  const now = Date.now();
  const records: StudentPhotoUrlRecord[] = [];
  for (const item of items) {
    const cleanUrl = (item.photoUrl || '').trim();
    const cleanDriveUrl = (item.driveLink || '').trim();
    const normName = normalizeTextKey(item.normalizedName || item.fileName || '');
    if (!normName || (!cleanUrl && !cleanDriveUrl)) continue;
    const studentKey = `name:${normName}`;
    const existing = memoryUrlMap.get(studentKey);
    if (!existing || existing.photoUrl !== (cleanUrl || cleanDriveUrl)) {
      const rec: StudentPhotoUrlRecord = {
        studentKey,
        normalizedName: normName,
        photoUrl: cleanUrl || cleanDriveUrl,
        photoDriveUrl: cleanDriveUrl || undefined,
        driveFileId: item.id || extractDriveFileIdFromPhotoUrl(cleanUrl || cleanDriveUrl) || undefined,
        updatedAtMs: now,
      };
      memoryUrlMap.set(studentKey, rec);
      records.push(rec);
    }
  }
  if (records.length > 0) {
    await putUrlRecordsInIdb(records);
  }
};

/**
 * Downloads and stores an image Blob in IndexedDB ONCE per `cacheKey` (no recurring fetches).
 * Skips immediately if already cached, offline, in-flight, or previously blocked by CORS.
 */
export const ensurePhotoCachedInIndexedDb = async (
  url: string,
  driveFileId?: string
): Promise<string | null> => {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl || cleanUrl.startsWith('blob:')) return cleanUrl || null;

  const existingObjUrl = getCachedPhotoObjectUrlSync(cleanUrl, driveFileId);
  if (existingObjUrl) return existingObjUrl;

  if (cleanUrl.startsWith('data:image/')) {
    const blob = dataUrlToBlob(cleanUrl);
    if (!blob) return cleanUrl;
    const keys = buildPhotoBlobCacheKeys(cleanUrl, driveFileId);
    const objUrl = registerObjectUrlInMemory(keys, blob);
    await putBlobRecordsInIdb(keys, cleanUrl, driveFileId, blob);
    return objUrl;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  const blobKeys = buildPhotoBlobCacheKeys(cleanUrl, driveFileId);
  const primaryKey = blobKeys[0];
  if (!primaryKey || attemptedFetchKeys.has(primaryKey) || corsBlockedUrls.has(cleanUrl)) {
    return null;
  }

  const existingPromise = inFlightFetchMap.get(primaryKey);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    attemptedFetchKeys.add(primaryKey);
    await acquireFetchSlot();
    try {
      const isSameOrigin =
        cleanUrl.startsWith('/') ||
        (typeof window !== 'undefined' && cleanUrl.startsWith(window.location.origin));
      const res = await fetch(cleanUrl, {
        mode: isSameOrigin ? 'same-origin' : 'cors',
        credentials: isSameOrigin ? 'same-origin' : 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!res.ok) return null;

      const contentType = res.headers.get('content-type') || '';
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        return null;
      }

      const blob = await res.blob();
      if (!blob || blob.size === 0) return null;

      const objUrl = registerObjectUrlInMemory(blobKeys, blob);
      await putBlobRecordsInIdb(blobKeys, cleanUrl, driveFileId, blob);
      return objUrl;
    } catch {
      corsBlockedUrls.add(cleanUrl);
      return null;
    } finally {
      releaseFetchSlot();
      inFlightFetchMap.delete(primaryKey);
    }
  })();

  inFlightFetchMap.set(primaryKey, fetchPromise);
  return fetchPromise;
};

/**
 * Clears all persisted photo URLs & blobs from IndexedDB (called only on intentional DB wipe).
 */
export const clearStudentPhotoIndexedDbCache = async (): Promise<void> => {
  memoryUrlMap.clear();
  attemptedFetchKeys.clear();
  const seenObjUrls = new Set<string>();
  memoryBlobObjectUrlMap.forEach((objUrl) => {
    if (!seenObjUrls.has(objUrl)) {
      seenObjUrls.add(objUrl);
      try {
        URL.revokeObjectURL(objUrl);
      } catch {
        // ignore
      }
    }
  });
  memoryBlobObjectUrlMap.clear();

  try {
    const db = await openPhotoCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_PHOTO_URLS, STORE_PHOTO_BLOBS], 'readwrite');
      tx.objectStore(STORE_PHOTO_URLS).clear();
      tx.objectStore(STORE_PHOTO_BLOBS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore
  }
};
