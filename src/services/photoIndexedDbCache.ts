import { getAuth } from 'firebase/auth';
import { ClassGroup } from '../types';

const PHOTO_CACHE_DB_NAME = 'emeb_candelario_student_photo_cache_v1';
const PHOTO_CACHE_DB_VERSION = 2;
const STORE_PHOTO_URLS = 'photo_urls';
const STORE_PHOTO_BLOBS = 'photo_blobs';
const MAX_CONCURRENT_BLOB_FETCHES = 4;
const MAX_CONCURRENT_CANVAS_WORKERS = 4;
const IDB_BATCH_COMMIT_SIZE = 50;

// Suporte garantido para lotes de 2.000+ fotos com eficiência extrema de armazenamento
export const MAX_BATCH_PHOTO_FILES_LIMIT = 5000;
const DEFAULT_CANVAS_MAX_DIMENSION = 440;
const DEFAULT_CANVAS_QUALITY = 0.9;
const DEFAULT_CANVAS_MIN_QUALITY = 0.72;
const DEFAULT_TARGET_MAX_PHOTO_BYTES = 48 * 1024; // 48 KB máx/foto -> 2.000 fotos ~= 35–85 MB
const REMOTE_RECOMPRESS_THRESHOLD_BYTES = 56 * 1024;

// Orçamento automático LRU no IndexedDB para suportar 2.000+ fotos sem estourar cota do navegador
const MAX_IDB_BLOB_RECORDS = 3200;
const MAX_IDB_TOTAL_BYTES = 140 * 1024 * 1024; // 140 MB

const HEIC_EXTENSION_REGEX = /\.(heic|heif)$/i;
const HEIC_MIME_REGEX = /^image\/hei[cf]/i;

export interface StudentPhotoUrlRecord {
  studentKey: string;
  studentId?: string;
  ra?: string;
  normalizedName: string;
  photoUrl: string;
  photoDriveUrl?: string;
  driveFileId?: string;
  isManualLink?: boolean;
  sha256?: string;
  updatedAtMs: number;
}

interface StudentPhotoBlobRecord {
  cacheKey: string;
  targetCacheKey?: string; // Ponteiro leve sem duplicar Blob em disco
  sourceUrl: string;
  driveFileId?: string;
  sha256?: string;
  blob?: Blob;
  contentType: string;
  byteSize: number;
  cachedAtMs: number;
}

export interface CanvasCompressionOptions {
  maxDimension?: number;
  initialQuality?: number;
  minQuality?: number;
  targetMaxBytes?: number;
  includeDataUrl?: boolean;
}

export interface CanvasCompressedPhotoResult {
  blob: Blob;
  bytes: Uint8Array;
  sha256: string;
  mimeType: string;
  extension: 'webp' | 'png' | 'jpg';
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalBytes: number;
  compressedBytes: number;
  reductionPercent: number;
  usedOriginalBytes: boolean;
  dataUrl?: string;
}

export interface BatchCanvasPhotoInput {
  id: string;
  file: File | Blob;
  studentId?: string;
  ra?: string;
  studentName?: string;
  existingSha256?: string;
  existingPhotoUrl?: string;
  photoUrl?: string;
}

export interface BatchCanvasPhotoProgress {
  processed: number;
  total: number;
  compressedCount: number;
  skippedIdentical: number;
  dedupedInBatch: number;
  failed: number;
  originalTotalBytes: number;
  compressedTotalBytes: number;
  savedBytes: number;
}

export interface BatchCanvasPhotoItemResult {
  id: string;
  status: 'compressed' | 'skipped_identical' | 'error';
  result?: CanvasCompressedPhotoResult;
  reusedBlob?: boolean;
  errorMsg?: string;
}

export interface BatchCanvasPhotoSummary {
  results: BatchCanvasPhotoItemResult[];
  processed: number;
  total: number;
  compressedCount: number;
  skippedIdentical: number;
  dedupedInBatch: number;
  failed: number;
  originalTotalBytes: number;
  compressedTotalBytes: number;
  savedBytes: number;
  aborted: boolean;
}

export interface UploadedPhotoCacheEntry {
  studentId?: string;
  ra?: string;
  name: string;
  photoUrl: string;
  photoDriveUrl?: string;
  driveFileId?: string;
  isManualLink?: boolean;
  sha256?: string;
  blob?: Blob;
  updatedAtMs?: number;
}

export interface PhotoCacheStorageStats {
  urlRecordsCount: number;
  blobRecordsCount: number;
  canonicalBlobsCount: number;
  totalCachedBytes: number;
  memoryObjectUrlsCount: number;
}

export interface ClassPhotoStorageBreakdown {
  classId: string;
  className: string;
  turmaAbrev?: string;
  shift: string;
  totalStudents: number;
  cachedStudentsCount: number;
  cachedBytes: number;
  canonicalBlobsCount: number;
}

export interface PhotoCacheDetailedUsageReport {
  totalCachedBytes: number;
  maxBudgetBytes: number;
  maxBudgetRecords: number;
  urlRecordsCount: number;
  blobRecordsCount: number;
  canonicalBlobsCount: number;
  deduplicatedAliasCount: number;
  activeClassesBytes: number;
  activeClassesBlobCount: number;
  legacyBytes: number;
  legacyUrlRecordsCount: number;
  legacyBlobRecordsCount: number;
  legacyCanonicalBlobsCount: number;
  browserEstimateUsageBytes?: number;
  browserEstimateQuotaBytes?: number;
  classBreakdown: ClassPhotoStorageBreakdown[];
}

export interface PrunePhotoCacheResult {
  removedUrlRecords: number;
  removedBlobRecords: number;
  freedBytes: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let warmupPromise: Promise<void> | null = null;
let isCacheWarmedUp = false;

// Índices síncronos em memória respaldados pelo IndexedDB
const memoryUrlMap = new Map<string, StudentPhotoUrlRecord>();
const memoryBlobObjectUrlMap = new Map<string, string>();
const memoryShaToObjectUrlMap = new Map<string, string>();
const memoryShaToCanonicalKeyMap = new Map<string, string>();
const attemptedFetchKeys = new Set<string>();
const corsBlockedUrls = new Set<string>();
const inFlightFetchMap = new Map<string, Promise<string | null>>();

const readyListeners = new Set<() => void>();
const blobUpdateListeners = new Set<(cacheKey: string) => void>();

// Fila com concorrência limitada para fetches em background
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

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const bufferToHex = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

const computeBufferSha256 = async (
  input: ArrayBuffer | Uint8Array | Blob
): Promise<string> => {
  const rawBuffer: ArrayBuffer =
    input instanceof Blob
      ? await input.arrayBuffer()
      : input instanceof Uint8Array
      ? (input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer)
      : input;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', rawBuffer);
    return bufferToHex(digest);
  }

  const bytes = new Uint8Array(rawBuffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[bytes.length - 1 - i] ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0)
    .toString(16)
    .padStart(8, '0')}_${bytes.length}`;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error('Falha ao converter Blob em Data URL'));
    reader.readAsDataURL(blob);
  });

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

const extensionForMime = (mime: string): 'webp' | 'png' | 'jpg' => {
  const m = (mime || '').toLowerCase();
  if (m.includes('webp')) return 'webp';
  if (m.includes('png')) return 'png';
  return 'jpg';
};

const convertHeicBlobIfNeeded = async (blob: Blob, filename: string): Promise<Blob> => {
  const isHeic =
    HEIC_EXTENSION_REGEX.test(filename || '') || HEIC_MIME_REGEX.test(blob.type || '');
  if (!isHeic) return blob;

  const heic2anyModule = await import('heic2any');
  const heic2anyFn = heic2anyModule.default || (heic2anyModule as unknown as Function);
  const converted = await heic2anyFn({
    blob,
    toType: 'image/png',
    quality: 0.96,
  });
  return Array.isArray(converted) ? converted[0] : converted;
};

type DecodedDrawable = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

const decodeBlobForCanvas = async (blob: Blob): Promise<DecodedDrawable> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => {
            try {
              bitmap.close();
            } catch {
              // ignore
            }
          },
        };
      }
      bitmap.close();
    } catch {
      // Fallback para HTMLImageElement (ex.: SVG)
    }
  }

  return new Promise<DecodedDrawable>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width || DEFAULT_CANVAS_MAX_DIMENSION;
      const h = img.naturalHeight || img.height || DEFAULT_CANVAS_MAX_DIMENSION;
      resolve({
        source: img,
        width: w,
        height: h,
        cleanup: () => {
          URL.revokeObjectURL(objectUrl);
        },
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Formato de imagem inválido ou arquivo corrompido.'));
    };
    img.src = objectUrl;
  });
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob | null> =>
  new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    } catch {
      resolve(null);
    }
  });

const releaseCanvasMemory = (canvas: HTMLCanvasElement | null | undefined): void => {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // ignore
  }
};

/**
 * Redimensionamento multi-pass (step-down 50% por iteração quando > 2x) via API Canvas:
 * evita serrilhado/moiré em fotos de alta resolução (12MP–48MP) e libera cada canvas intermediário imediatamente.
 */
const drawProgressiveDownsampledCanvas = (
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number
): HTMLCanvasElement => {
  let currentSource: CanvasImageSource = source;
  let currentW = srcW;
  let currentH = srcH;
  const intermediateCanvases: HTMLCanvasElement[] = [];

  try {
    while (currentW * 0.5 > targetW * 1.15 && currentH * 0.5 > targetH * 1.15) {
      const nextW = Math.max(targetW, Math.round(currentW * 0.5));
      const nextH = Math.max(targetH, Math.round(currentH * 0.5));
      const stepCanvas = document.createElement('canvas');
      stepCanvas.width = nextW;
      stepCanvas.height = nextH;
      const stepCtx = stepCanvas.getContext('2d');
      if (!stepCtx) break;

      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(currentSource, 0, 0, nextW, nextH);

      intermediateCanvases.push(stepCanvas);
      currentSource = stepCanvas;
      currentW = nextW;
      currentH = nextH;
    }

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) {
      throw new Error('Contexto Canvas 2D indisponível.');
    }

    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';
    finalCtx.drawImage(currentSource, 0, 0, targetW, targetH);

    return finalCanvas;
  } finally {
    for (const c of intermediateCanvases) {
      releaseCanvasMemory(c);
    }
  }
};

/**
 * Detecta rapidamente se o canvas possui pixels translúcidos para decidir sobre alpha/JPEG fallback.
 */
const canvasHasTransparency = (canvas: HTMLCanvasElement): boolean => {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Amostragem de passo 16 bytes (4 pixels) para performance instantânea em lotes de 2000+ fotos
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] < 252) return true;
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * Sistema de compressão lossless / visualmente lossless agressiva via API Canvas:
 * - Decodifica qualquer formato (JPG/JPEG, PNG, WebP, HEIC/HEIF, AVIF, BMP, GIF, SVG, TIFF, ICO) com auto-rotação EXIF.
 * - Redimensiona com filtro multi-pass de alta qualidade até `maxDimension` (padrão 440px).
 * - Gera saída WebP (com transparência preservada) e ajusta qualidade adaptativamente se exceder `targetMaxBytes` (48 KB),
 *   garantindo que 2.000+ fotos ocupem espaço mínimo em IndexedDB e servidor sem perda visual perceptível.
 * - Guarda econômica 100% lossless: se o original já está dentro das dimensões e é menor em bytes, preserva os bytes originais.
 */
export const compressPhotoLosslessWithCanvas = async (
  fileOrBlobOrDataUrl: File | Blob | string,
  options: CanvasCompressionOptions = {}
): Promise<CanvasCompressedPhotoResult> => {
  const maxDimension = options.maxDimension ?? DEFAULT_CANVAS_MAX_DIMENSION;
  const initialQuality = options.initialQuality ?? DEFAULT_CANVAS_QUALITY;
  const minQuality = options.minQuality ?? DEFAULT_CANVAS_MIN_QUALITY;
  const targetMaxBytes = options.targetMaxBytes ?? DEFAULT_TARGET_MAX_PHOTO_BYTES;
  const includeDataUrl = options.includeDataUrl ?? false;

  let sourceBlob: Blob | null = null;
  let filename = 'photo.jpg';

  if (typeof fileOrBlobOrDataUrl === 'string') {
    sourceBlob = dataUrlToBlob(fileOrBlobOrDataUrl);
  } else {
    sourceBlob = fileOrBlobOrDataUrl;
    if (fileOrBlobOrDataUrl instanceof File) {
      filename = fileOrBlobOrDataUrl.name;
    }
  }

  if (!sourceBlob || sourceBlob.size <= 0) {
    throw new Error('Arquivo de imagem vazio ou inválido.');
  }

  const originalBytes = sourceBlob.size;
  const decodedInputBlob = await convertHeicBlobIfNeeded(sourceBlob, filename);
  const decoded = await decodeBlobForCanvas(decodedInputBlob);

  let finalCanvas: HTMLCanvasElement | null = null;
  let fallbackJpgCanvas: HTMLCanvasElement | null = null;

  try {
    const srcW = decoded.width;
    const srcH = decoded.height;
    if (srcW <= 0 || srcH <= 0) {
      throw new Error('Dimensões inválidas da imagem.');
    }

    let targetW = srcW;
    let targetH = srcH;
    const needsResize = srcW > maxDimension || srcH > maxDimension;

    if (needsResize) {
      if (srcW >= srcH) {
        targetW = maxDimension;
        targetH = Math.max(1, Math.round((srcH * maxDimension) / srcW));
      } else {
        targetH = maxDimension;
        targetW = Math.max(1, Math.round((srcW * maxDimension) / srcH));
      }
    }

    finalCanvas = drawProgressiveDownsampledCanvas(decoded.source, srcW, srcH, targetW, targetH);
    const hasAlpha = canvasHasTransparency(finalCanvas);

    // 1. Tenta WebP de alta fidelidade (preserva transparência e economiza 35–65%)
    let bestBlob = await canvasToBlob(finalCanvas, 'image/webp', initialQuality);

    if (bestBlob && bestBlob.type === 'image/webp') {
      // Compressão agressiva controlada: se ainda estiver acima do teto por foto (48 KB),
      // reduz suavemente em degraus mínimos até caber no orçamento de 2000+ fotos
      if (bestBlob.size > targetMaxBytes) {
        const qualitySteps = [0.84, 0.78, minQuality].filter(
          (q, idx, arr) => q < initialQuality && q >= minQuality && arr.indexOf(q) === idx
        );
        for (const q of qualitySteps) {
          const candidate = await canvasToBlob(finalCanvas, 'image/webp', q);
          if (candidate && candidate.type === 'image/webp' && candidate.size < bestBlob.size) {
            bestBlob = candidate;
            if (bestBlob.size <= targetMaxBytes) break;
          }
        }
      }
    } else {
      // Fallback caso o navegador não suporte canvas.toBlob('image/webp')
      if (!hasAlpha) {
        fallbackJpgCanvas = document.createElement('canvas');
        fallbackJpgCanvas.width = targetW;
        fallbackJpgCanvas.height = targetH;
        const jpgCtx = fallbackJpgCanvas.getContext('2d');
        if (jpgCtx) {
          jpgCtx.fillStyle = '#ffffff';
          jpgCtx.fillRect(0, 0, targetW, targetH);
          jpgCtx.drawImage(finalCanvas, 0, 0);
          bestBlob = await canvasToBlob(fallbackJpgCanvas, 'image/jpeg', initialQuality);
          if (bestBlob && bestBlob.size > targetMaxBytes) {
            const smallerJpg = await canvasToBlob(fallbackJpgCanvas, 'image/jpeg', minQuality);
            if (smallerJpg && smallerJpg.size < bestBlob.size) {
              bestBlob = smallerJpg;
            }
          }
        }
      }
      if (!bestBlob) {
        bestBlob = await canvasToBlob(finalCanvas, 'image/png');
      }
    }

    if (!bestBlob) {
      throw new Error('Falha ao codificar imagem otimizada na API Canvas.');
    }

    // Guarda 100% lossless: se o original já cabe em maxDimension, está em formato web seguro
    // e ocupa <= bytes que o re-encode, mantém os bytes exatos originais
    const origMime = (sourceBlob.type || '').toLowerCase();
    const isOrigSafeWebFormat =
      origMime === 'image/webp' || origMime === 'image/jpeg' || origMime === 'image/png';

    let finalBlob = bestBlob;
    let usedOriginalBytes = false;

    if (!needsResize && isOrigSafeWebFormat && originalBytes <= bestBlob.size) {
      finalBlob = sourceBlob;
      usedOriginalBytes = true;
    }

    const arrayBuffer = await finalBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const sha256 = await computeBufferSha256(bytes);
    const mimeType = finalBlob.type || 'image/webp';
    const extension = extensionForMime(mimeType);
    const compressedBytes = bytes.byteLength;
    const reductionPercent =
      originalBytes > compressedBytes
        ? Math.round(((originalBytes - compressedBytes) / originalBytes) * 100)
        : 0;
    const dataUrl = includeDataUrl ? await blobToDataUrl(finalBlob) : undefined;

    return {
      blob: finalBlob,
      bytes,
      sha256,
      mimeType,
      extension,
      width: targetW,
      height: targetH,
      originalWidth: srcW,
      originalHeight: srcH,
      originalBytes,
      compressedBytes,
      reductionPercent,
      usedOriginalBytes,
      dataUrl,
    };
  } finally {
    decoded.cleanup();
    releaseCanvasMemory(finalCanvas);
    releaseCanvasMemory(fallbackJpgCanvas);
  }
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
        blobStore.createIndex('sha256', 'sha256', { unique: false });
      } else {
        const tx = req.transaction;
        if (tx) {
          const blobStore = tx.objectStore(STORE_PHOTO_BLOBS);
          if (!blobStore.indexNames.contains('sha256')) {
            blobStore.createIndex('sha256', 'sha256', { unique: false });
          }
        }
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

const notifyBlobUpdated = (keys: string[]) => {
  keys.forEach((k) => {
    blobUpdateListeners.forEach((cb) => {
      try {
        cb(k);
      } catch {
        // ignore
      }
    });
  });
};

const registerObjectUrlInMemory = (
  keys: string[],
  blob: Blob,
  sha256?: string
): string => {
  if (sha256) {
    const existingBySha = memoryShaToObjectUrlMap.get(sha256);
    if (existingBySha) {
      keys.forEach((alias) => memoryBlobObjectUrlMap.set(alias, existingBySha));
      notifyBlobUpdated(keys);
      return existingBySha;
    }
  }
  for (const k of keys) {
    const existing = memoryBlobObjectUrlMap.get(k);
    if (existing) {
      keys.forEach((alias) => memoryBlobObjectUrlMap.set(alias, existing));
      if (sha256) memoryShaToObjectUrlMap.set(sha256, existing);
      return existing;
    }
  }
  const objUrl = URL.createObjectURL(blob);
  if (sha256) {
    memoryShaToObjectUrlMap.set(sha256, objUrl);
    if (keys[0] && !memoryShaToCanonicalKeyMap.has(sha256)) {
      memoryShaToCanonicalKeyMap.set(sha256, keys[0]);
    }
  }
  keys.forEach((k) => {
    memoryBlobObjectUrlMap.set(k, objUrl);
  });
  notifyBlobUpdated(keys);
  return objUrl;
};

/**
 * Remove entradas mais antigas por `cachedAtMs` caso o volume ultrapasse o orçamento LRU de 2.000–3.200 fotos.
 */
const evictOldestPhotoBlobsIfNeeded = async (
  maxCount = MAX_IDB_BLOB_RECORDS,
  maxBytes = MAX_IDB_TOTAL_BYTES
): Promise<void> => {
  try {
    const db = await openPhotoCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_PHOTO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_BLOBS);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as StudentPhotoBlobRecord[];
        let canonicalCount = 0;
        let totalBytes = 0;
        for (const r of rows) {
          if (r.blob && r.byteSize > 0) {
            canonicalCount++;
            totalBytes += r.byteSize;
          }
        }
        if (canonicalCount <= maxCount && totalBytes <= maxBytes) {
          return;
        }
        rows.sort((a, b) => (a.cachedAtMs || 0) - (b.cachedAtMs || 0));
        for (const r of rows) {
          if (canonicalCount <= maxCount * 0.9 && totalBytes <= maxBytes * 0.85) break;
          store.delete(r.cacheKey);
          memoryBlobObjectUrlMap.delete(r.cacheKey);
          if (r.blob && r.byteSize > 0) {
            canonicalCount--;
            totalBytes -= r.byteSize;
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore
  }
};

interface PendingBlobPutItem {
  keys: string[];
  sourceUrl: string;
  driveFileId?: string;
  sha256?: string;
  blob: Blob;
  cachedAtMs?: number;
}

/**
 * Persiste lotes de blobs no IndexedDB SEM duplicar o binário entre múltiplos aliases (`drive:` e `url:`):
 * - Armazena o Blob apenas na chave canônica (ou aponta para outra entrada com o mesmo `sha256`)
 * - Grava até 50 registros por transação IDB para suportar 2.000+ fotos em menos de 1 segundo
 */
const putBlobBatchRecordsInIdb = async (items: PendingBlobPutItem[]): Promise<void> => {
  if (items.length === 0) return;

  const commitChunk = async (chunk: PendingBlobPutItem[]): Promise<void> => {
    const db = await openPhotoCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_BLOBS);

      for (const item of chunk) {
        if (!item.blob || item.blob.size === 0 || item.keys.length === 0) continue;
        const now = item.cachedAtMs || Date.now();
        const sha = item.sha256;
        const primaryKey = item.keys[0];

        // Deduplicação absoluta entre arquivos idênticos via SHA-256:
        // se já existir chave canônica gravada com o mesmo SHA-256, armazena apenas ponteiro leve
        const existingCanonicalKey = sha ? memoryShaToCanonicalKeyMap.get(sha) : undefined;
        const shouldWriteBlob = !existingCanonicalKey || existingCanonicalKey === primaryKey;
        const effectiveTargetKey = existingCanonicalKey || primaryKey;

        if (sha && shouldWriteBlob) {
          memoryShaToCanonicalKeyMap.set(sha, primaryKey);
        }

        const primaryRecord: StudentPhotoBlobRecord = shouldWriteBlob
          ? {
              cacheKey: primaryKey,
              sourceUrl: item.sourceUrl,
              driveFileId: item.driveFileId,
              sha256: sha,
              blob: item.blob,
              contentType: item.blob.type || 'image/webp',
              byteSize: item.blob.size,
              cachedAtMs: now,
            }
          : {
              cacheKey: primaryKey,
              targetCacheKey: effectiveTargetKey,
              sourceUrl: item.sourceUrl,
              driveFileId: item.driveFileId,
              sha256: sha,
              contentType: item.blob.type || 'image/webp',
              byteSize: 0,
              cachedAtMs: now,
            };
        store.put(primaryRecord);

        // Aliases secundários armazenam somente ponteiro leve (~120 bytes) sem duplicar o Blob!
        for (let i = 1; i < item.keys.length; i++) {
          const aliasKey = item.keys[i];
          const aliasRecord: StudentPhotoBlobRecord = {
            cacheKey: aliasKey,
            targetCacheKey: effectiveTargetKey,
            sourceUrl: item.sourceUrl,
            driveFileId: item.driveFileId,
            sha256: sha,
            contentType: item.blob.type || 'image/webp',
            byteSize: 0,
            cachedAtMs: now,
          };
          store.put(aliasRecord);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Erro de escrita no IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Transação abortada no IndexedDB'));
    });
  };

  for (let i = 0; i < items.length; i += IDB_BATCH_COMMIT_SIZE) {
    const chunk = items.slice(i, i + IDB_BATCH_COMMIT_SIZE);
    try {
      await commitChunk(chunk);
    } catch {
      // Se atingir limite de cota, executa limpeza LRU e tenta novamente
      await evictOldestPhotoBlobsIfNeeded(
        Math.floor(MAX_IDB_BLOB_RECORDS * 0.75),
        Math.floor(MAX_IDB_TOTAL_BYTES * 0.75)
      );
      try {
        await commitChunk(chunk);
      } catch {
        // Falha graciosa se o modo privado bloquear disco
      }
    }
  }
};

const putBlobRecordsInIdb = async (
  keys: string[],
  sourceUrl: string,
  driveFileId: string | undefined,
  blob: Blob,
  sha256?: string
): Promise<void> => {
  await putBlobBatchRecordsInIdb([
    {
      keys,
      sourceUrl,
      driveFileId,
      sha256,
      blob,
    },
  ]);
};

const putUrlRecordsInIdb = async (records: StudentPhotoUrlRecord[]): Promise<void> => {
  if (records.length === 0) return;
  try {
    const db = await openPhotoCacheDb();
    for (let i = 0; i < records.length; i += IDB_BATCH_COMMIT_SIZE * 2) {
      const chunk = records.slice(i, i + IDB_BATCH_COMMIT_SIZE * 2);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_PHOTO_URLS, 'readwrite');
        const store = tx.objectStore(STORE_PHOTO_URLS);
        for (const rec of chunk) {
          store.put(rec);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    }
  } catch {
    // ignore quota errors
  }
};

/**
 * Pré-aquece todas as URLs e Blobs de fotos do IndexedDB para Maps síncronos em memória no boot,
 * resolvendo também ponteiros leves de deduplicação SHA-256 sem carregar blobs duplicados.
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
              const aliasRows: StudentPhotoBlobRecord[] = [];

              // Passo 1: registrar todos os Blobs canônicos
              for (const row of rows) {
                if (row && row.cacheKey && row.blob && row.blob.size > 0) {
                  const keys = buildPhotoBlobCacheKeys(row.sourceUrl, row.driveFileId);
                  if (!keys.includes(row.cacheKey)) keys.unshift(row.cacheKey);
                  if (row.sha256) {
                    memoryShaToCanonicalKeyMap.set(row.sha256, row.cacheKey);
                  }
                  registerObjectUrlInMemory(keys, row.blob, row.sha256);
                } else if (row && row.cacheKey && row.targetCacheKey) {
                  aliasRows.push(row);
                }
              }

              // Passo 2: vincular ponteiros leves às mesmas ObjectURLs em memória
              for (const alias of aliasRows) {
                const targetUrl =
                  (alias.targetCacheKey && memoryBlobObjectUrlMap.get(alias.targetCacheKey)) ||
                  (alias.sha256 && memoryShaToObjectUrlMap.get(alias.sha256));
                if (targetUrl) {
                  memoryBlobObjectUrlMap.set(alias.cacheKey, targetUrl);
                  const extraKeys = buildPhotoBlobCacheKeys(alias.sourceUrl, alias.driveFileId);
                  extraKeys.forEach((k) => memoryBlobObjectUrlMap.set(k, targetUrl));
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
      // Fallback gracioso se IndexedDB estiver bloqueado
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
 * Pipeline de compressão lossless agressiva em lote no momento do upload (2.000+ arquivos):
 * - Pool concorrente limitado (4 workers Canvas) + yield periódico para manter 60fps
 * - Redimensiona e compacta com Canvas (`compressPhotoLosslessWithCanvas`)
 * - Deduplica buffers em memória via SHA-256 e pula arquivos idênticos já salvos
 * - Opcionalmente já persiste URL + Blob compacto em transações batched no IndexedDB
 */
export const compressAndCachePhotoBatch = async (
  inputs: BatchCanvasPhotoInput[],
  options: CanvasCompressionOptions & {
    concurrency?: number;
    maxBatchFiles?: number;
    persistToIndexedDb?: boolean;
    signal?: AbortSignal;
    waitIfPaused?: () => Promise<void>;
    onProgress?: (progress: BatchCanvasPhotoProgress) => void;
  } = {}
): Promise<BatchCanvasPhotoSummary> => {
  const maxBatchFiles = options.maxBatchFiles ?? MAX_BATCH_PHOTO_FILES_LIMIT;
  if (inputs.length > maxBatchFiles) {
    throw new Error(
      `Lote excede o limite de segurança de ${maxBatchFiles.toLocaleString('pt-BR')} arquivos por operação.`
    );
  }

  const concurrency = Math.max(1, Math.min(options.concurrency ?? MAX_CONCURRENT_CANVAS_WORKERS, 8));
  const total = inputs.length;
  const results: BatchCanvasPhotoItemResult[] = new Array(total);

  const seenBatchSha = new Map<string, CanvasCompressedPhotoResult>();
  const pendingUrlRecords: StudentPhotoUrlRecord[] = [];
  const pendingBlobRecords: PendingBlobPutItem[] = [];

  let processed = 0;
  let compressedCount = 0;
  let skippedIdentical = 0;
  let dedupedInBatch = 0;
  let failed = 0;
  let originalTotalBytes = 0;
  let compressedTotalBytes = 0;
  let nextIndex = 0;

  const emitProgress = () => {
    options.onProgress?.({
      processed,
      total,
      compressedCount,
      skippedIdentical,
      dedupedInBatch,
      failed,
      originalTotalBytes,
      compressedTotalBytes,
      savedBytes: Math.max(0, originalTotalBytes - compressedTotalBytes),
    });
  };

  const runWorker = async () => {
    while (nextIndex < total) {
      if (options.signal?.aborted) break;
      if (options.waitIfPaused) {
        await options.waitIfPaused();
        if (options.signal?.aborted) break;
      }
      const idx = nextIndex++;
      const item = inputs[idx];

      try {
        const compressed = await compressPhotoLosslessWithCanvas(item.file, {
          maxDimension: options.maxDimension,
          initialQuality: options.initialQuality,
          minQuality: options.minQuality,
          targetMaxBytes: options.targetMaxBytes,
          includeDataUrl: options.includeDataUrl,
        });

        originalTotalBytes += compressed.originalBytes;

        // Se o aluno já possui exatamente este SHA-256 salvo, evita reenvio e escrita redundante
        if (
          item.existingSha256 &&
          item.existingSha256 === compressed.sha256 &&
          item.existingPhotoUrl
        ) {
          skippedIdentical++;
          compressedTotalBytes += compressed.compressedBytes;
          results[idx] = {
            id: item.id,
            status: 'skipped_identical',
            result: compressed,
          };
        } else {
          const canonical = seenBatchSha.get(compressed.sha256);
          const finalResult = canonical ?? compressed;
          if (canonical) {
            dedupedInBatch++;
          } else {
            seenBatchSha.set(compressed.sha256, compressed);
          }

          compressedCount++;
          compressedTotalBytes += canonical ? 0 : compressed.compressedBytes;

          if (options.persistToIndexedDb && (item.photoUrl || item.studentName)) {
            const targetUrl = item.photoUrl || item.existingPhotoUrl || '';
            const now = Date.now();
            const keys = buildStudentPhotoLookupKeys({
              studentId: item.studentId,
              ra: item.ra,
              name: item.studentName,
            });
            const normalizedName = normalizeTextKey(item.studentName);
            const cleanRa = normalizeRaKey(item.ra);

            if (targetUrl) {
              for (const studentKey of keys) {
                const urlRec: StudentPhotoUrlRecord = {
                  studentKey,
                  studentId: item.studentId,
                  ra: cleanRa || undefined,
                  normalizedName,
                  photoUrl: targetUrl,
                  sha256: finalResult.sha256,
                  isManualLink: true,
                  updatedAtMs: now,
                };
                memoryUrlMap.set(studentKey, urlRec);
                pendingUrlRecords.push(urlRec);
              }
              const blobKeys = buildPhotoBlobCacheKeys(targetUrl);
              if (blobKeys.length > 0) {
                registerObjectUrlInMemory(blobKeys, finalResult.blob, finalResult.sha256);
                pendingBlobRecords.push({
                  keys: blobKeys,
                  sourceUrl: targetUrl,
                  sha256: finalResult.sha256,
                  blob: finalResult.blob,
                  cachedAtMs: now,
                });
              }
            }
          }

          results[idx] = {
            id: item.id,
            status: 'compressed',
            result: finalResult,
            reusedBlob: Boolean(canonical),
          };
        }
      } catch (err: any) {
        failed++;
        results[idx] = {
          id: item.id,
          status: 'error',
          errorMsg: err?.message || 'Falha ao comprimir foto via Canvas.',
        };
      } finally {
        processed++;
        if (processed % 4 === 0 || processed === total) {
          emitProgress();
          await yieldToEventLoop();
        }
      }
    }
  };

  if (total > 0) {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, total) }, () => runWorker())
    );
  }

  if (!options.signal?.aborted && options.persistToIndexedDb) {
    if (pendingUrlRecords.length > 0) {
      await putUrlRecordsInIdb(pendingUrlRecords);
    }
    if (pendingBlobRecords.length > 0) {
      await putBlobBatchRecordsInIdb(pendingBlobRecords);
      await evictOldestPhotoBlobsIfNeeded();
    }
  }

  return {
    results: results.filter(Boolean),
    processed,
    total,
    compressedCount,
    skippedIdentical,
    dedupedInBatch,
    failed,
    originalTotalBytes,
    compressedTotalBytes,
    savedBytes: Math.max(0, originalTotalBytes - compressedTotalBytes),
    aborted: Boolean(options.signal?.aborted),
  };
};

/**
 * Persiste um lote de fotos recém-enviadas (URLs + Blobs compactados + SHA-256) no IndexedDB
 * em transações batched de alta velocidade para suportar 2.000+ fotos sem bloquear a UI.
 */
export const cacheUploadedStudentPhotosBatchToIndexedDb = async (
  entries: UploadedPhotoCacheEntry[]
): Promise<void> => {
  if (!Array.isArray(entries) || entries.length === 0) return;

  const urlRecords: StudentPhotoUrlRecord[] = [];
  const blobItems: PendingBlobPutItem[] = [];

  for (const entry of entries) {
    const cleanUrl = (entry.photoUrl || '').trim();
    const cleanDriveUrl = (entry.photoDriveUrl || '').trim();
    if (!cleanUrl && !cleanDriveUrl) continue;

    const resolvedDriveId =
      entry.driveFileId ||
      extractDriveFileIdFromPhotoUrl(cleanUrl) ||
      extractDriveFileIdFromPhotoUrl(cleanDriveUrl);
    const effectiveUrl = cleanUrl || cleanDriveUrl;
    const now = entry.updatedAtMs || Date.now();
    const normalizedName = normalizeTextKey(entry.name);
    const cleanRa = normalizeRaKey(entry.ra);
    const keys = buildStudentPhotoLookupKeys({
      studentId: entry.studentId,
      ra: entry.ra,
      name: entry.name,
    });

    for (const studentKey of keys) {
      const rec: StudentPhotoUrlRecord = {
        studentKey,
        studentId: entry.studentId,
        ra: cleanRa || undefined,
        normalizedName,
        photoUrl: effectiveUrl,
        photoDriveUrl: cleanDriveUrl || undefined,
        driveFileId: resolvedDriveId || undefined,
        isManualLink: entry.isManualLink,
        sha256: entry.sha256,
        updatedAtMs: now,
      };
      memoryUrlMap.set(studentKey, rec);
      urlRecords.push(rec);
    }

    if (entry.blob && entry.blob.size > 0) {
      const blobKeys = buildPhotoBlobCacheKeys(effectiveUrl, resolvedDriveId);
      if (blobKeys.length > 0) {
        registerObjectUrlInMemory(blobKeys, entry.blob, entry.sha256);
        blobItems.push({
          keys: blobKeys,
          sourceUrl: effectiveUrl,
          driveFileId: resolvedDriveId || undefined,
          sha256: entry.sha256,
          blob: entry.blob,
          cachedAtMs: now,
        });
      }
    }
  }

  if (urlRecords.length > 0) {
    await putUrlRecordsInIdb(urlRecords);
  }
  if (blobItems.length > 0) {
    await putBlobBatchRecordsInIdb(blobItems);
    await evictOldestPhotoBlobsIfNeeded();
  }
};

/**
 * Persiste uma única foto no IndexedDB, comprimindo via Canvas caso receba blob/DataURL grande.
 */
export const persistSingleStudentPhotoToIndexedDb = async (params: {
  studentId?: string;
  ra?: string;
  name: string;
  photoUrl: string;
  photoDriveUrl?: string;
  driveFileId?: string;
  isManualLink?: boolean;
  sha256?: string;
  blob?: Blob;
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
    sha256: params.sha256,
    updatedAtMs: now,
  }));

  records.forEach((rec) => {
    memoryUrlMap.set(rec.studentKey, rec);
  });

  let blobToCache: Blob | null = params.blob ?? null;
  let resolvedSha = params.sha256;

  if (!blobToCache && cleanUrl.startsWith('data:image/')) {
    blobToCache = dataUrlToBlob(cleanUrl);
  }

  if (blobToCache && blobToCache.size > 0) {
    if (blobToCache.size > REMOTE_RECOMPRESS_THRESHOLD_BYTES) {
      try {
        const compressed = await compressPhotoLosslessWithCanvas(blobToCache);
        if (compressed.blob.size < blobToCache.size) {
          blobToCache = compressed.blob;
          resolvedSha = compressed.sha256;
        }
      } catch {
        // mantém blob original se Canvas não puder decodificar
      }
    }
    const blobKeys = buildPhotoBlobCacheKeys(cleanDriveUrl || cleanUrl, resolvedDriveId);
    if (blobKeys.length > 0) {
      registerObjectUrlInMemory(blobKeys, blobToCache, resolvedSha);
      await putBlobRecordsInIdb(
        blobKeys,
        cleanDriveUrl || cleanUrl,
        resolvedDriveId,
        blobToCache,
        resolvedSha
      );
    }
  }

  await putUrlRecordsInIdb(records);
};

/**
 * Persiste todas as URLs das fotos das turmas carregadas no IndexedDB.
 */
export const persistStudentPhotoUrlsToIndexedDb = async (
  classes: ClassGroup[]
): Promise<void> => {
  if (!Array.isArray(classes) || classes.length === 0) return;

  const recordsToPut: StudentPhotoUrlRecord[] = [];
  const dataUrlBlobsToPut: PendingBlobPutItem[] = [];

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
          sha256: st.photoSha256,
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
          let blob = dataUrlToBlob(cleanUrl);
          let sha = st.photoSha256;
          if (blob && blob.size > REMOTE_RECOMPRESS_THRESHOLD_BYTES) {
            try {
              const compressed = await compressPhotoLosslessWithCanvas(blob);
              if (compressed.blob.size < blob.size) {
                blob = compressed.blob;
                sha = compressed.sha256;
              }
            } catch {
              // fallback para blob original
            }
          }
          if (blob && blobKeys.length > 0) {
            registerObjectUrlInMemory(blobKeys, blob, sha);
            dataUrlBlobsToPut.push({
              keys: blobKeys,
              sourceUrl: cleanDriveUrl || cleanUrl,
              driveFileId: resolvedDriveId || undefined,
              sha256: sha,
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
  if (dataUrlBlobsToPut.length > 0) {
    await putBlobBatchRecordsInIdb(dataUrlBlobsToPut);
    await evictOldestPhotoBlobsIfNeeded();
  }
};

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
 * Baixa e armazena o Blob da imagem no IndexedDB uma única vez por `cacheKey`.
 * Se a imagem remota ultrapassar o limite econômico (56 KB), re-otimiza via Canvas antes de gravar no IndexedDB.
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
    let blob = dataUrlToBlob(cleanUrl);
    if (!blob) return cleanUrl;
    let sha: string | undefined;
    if (blob.size > REMOTE_RECOMPRESS_THRESHOLD_BYTES) {
      try {
        const compressed = await compressPhotoLosslessWithCanvas(blob);
        if (compressed.blob.size < blob.size) {
          blob = compressed.blob;
          sha = compressed.sha256;
        }
      } catch {
        // fallback para blob original
      }
    }
    const keys = buildPhotoBlobCacheKeys(cleanUrl, driveFileId);
    const objUrl = registerObjectUrlInMemory(keys, blob, sha);
    await putBlobRecordsInIdb(keys, cleanUrl, driveFileId, blob, sha);
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
      const fetchHeaders: Record<string, string> = {};
      if (isSameOrigin) {
        try {
          const fbToken = await getAuth().currentUser?.getIdToken().catch(() => null);
          if (fbToken) {
            fetchHeaders.Authorization = `Bearer ${fbToken}`;
          }
        } catch {
          // ignore auth initialization edge cases
        }
      }
      const res = await fetch(cleanUrl, {
        mode: isSameOrigin ? 'same-origin' : 'cors',
        credentials: isSameOrigin ? 'include' : 'omit',
        headers: isSameOrigin ? fetchHeaders : undefined,
        referrerPolicy: 'no-referrer',
      });
      if (!res.ok) return null;

      const contentType = res.headers.get('content-type') || '';
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        return null;
      }

      let blob = await res.blob();
      if (!blob || blob.size === 0) return null;
      let sha: string | undefined;

      // Garante eficiência de armazenamento caso a foto remota (ex.: Google Drive) venha em alta resolução
      if (blob.size > REMOTE_RECOMPRESS_THRESHOLD_BYTES) {
        try {
          const compressed = await compressPhotoLosslessWithCanvas(blob);
          if (compressed.blob.size < blob.size) {
            blob = compressed.blob;
            sha = compressed.sha256;
          }
        } catch {
          // fallback para blob original
        }
      }

      const objUrl = registerObjectUrlInMemory(blobKeys, blob, sha);
      await putBlobRecordsInIdb(blobKeys, cleanUrl, driveFileId, blob, sha);
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
 * Retorna estatísticas de armazenamento do cache de fotos (útil para diagnóstico de lotes 2.000+).
 */
export const getPhotoCacheStorageStats = async (): Promise<PhotoCacheStorageStats> => {
  const uniqueObjUrls = new Set(memoryBlobObjectUrlMap.values()).size;
  try {
    const db = await openPhotoCacheDb();
    return await new Promise<PhotoCacheStorageStats>((resolve) => {
      const tx = db.transaction([STORE_PHOTO_URLS, STORE_PHOTO_BLOBS], 'readonly');
      let urlRecordsCount = 0;
      let blobRecordsCount = 0;
      let canonicalBlobsCount = 0;
      let totalCachedBytes = 0;

      const reqUrls = tx.objectStore(STORE_PHOTO_URLS).count();
      reqUrls.onsuccess = () => {
        urlRecordsCount = reqUrls.result || 0;
      };

      const reqBlobs = tx.objectStore(STORE_PHOTO_BLOBS).getAll();
      reqBlobs.onsuccess = () => {
        const rows = (reqBlobs.result || []) as StudentPhotoBlobRecord[];
        blobRecordsCount = rows.length;
        for (const r of rows) {
          if (r.blob && r.byteSize > 0) {
            canonicalBlobsCount++;
            totalCachedBytes += r.byteSize;
          }
        }
      };

      tx.oncomplete = () =>
        resolve({
          urlRecordsCount,
          blobRecordsCount,
          canonicalBlobsCount,
          totalCachedBytes,
          memoryObjectUrlsCount: uniqueObjUrls,
        });
      tx.onerror = () =>
        resolve({
          urlRecordsCount: memoryUrlMap.size,
          blobRecordsCount: memoryBlobObjectUrlMap.size,
          canonicalBlobsCount: uniqueObjUrls,
          totalCachedBytes: 0,
          memoryObjectUrlsCount: uniqueObjUrls,
        });
    });
  } catch {
    return {
      urlRecordsCount: memoryUrlMap.size,
      blobRecordsCount: memoryBlobObjectUrlMap.size,
      canonicalBlobsCount: uniqueObjUrls,
      totalCachedBytes: 0,
      memoryObjectUrlsCount: uniqueObjUrls,
    };
  }
};

/**
 * Constrói o mapa de chaves ativas pertencentes às turmas atuais do sistema para distinguir
 * fotos ativas de caches órfãos/antigos (turmas anteriores, alunos desligados ou URLs substituídas).
 */
const buildActiveStudentCacheIndex = (activeClasses: ClassGroup[]) => {
  const activeStudentKeys = new Set<string>();
  const activeBlobKeys = new Set<string>();
  const classToStudentKeys = new Map<string, Set<string>>();
  const classToBlobKeys = new Map<string, Set<string>>();
  const studentPrimaryUrlMap = new Map<string, Set<string>>();

  for (const cls of activeClasses || []) {
    const clsStudentKeys = new Set<string>();
    const clsBlobKeys = new Set<string>();

    for (const st of cls.students || []) {
      const studentName = st.estudante || st.name || '';
      const sKeys = buildStudentPhotoLookupKeys({
        studentId: st.id,
        ra: st.ra,
        name: studentName,
      });
      sKeys.forEach((k) => {
        activeStudentKeys.add(k);
        clsStudentKeys.add(k);
      });

      const urls = [st.photo, st.photoDriveUrl].filter((u): u is string => Boolean(u && u.trim()));
      const bKeys = new Set<string>();
      for (const u of urls) {
        buildPhotoBlobCacheKeys(u, st.photoDriveId).forEach((bk) => {
          activeBlobKeys.add(bk);
          clsBlobKeys.add(bk);
          bKeys.add(bk);
        });
      }
      if (st.photoDriveId) {
        const dk = `drive:${st.photoDriveId.trim()}`;
        activeBlobKeys.add(dk);
        clsBlobKeys.add(dk);
        bKeys.add(dk);
      }

      if (bKeys.size > 0) {
        sKeys.forEach((sk) => studentPrimaryUrlMap.set(sk, bKeys));
      }
    }

    classToStudentKeys.set(cls.id, clsStudentKeys);
    classToBlobKeys.set(cls.id, clsBlobKeys);
  }

  return {
    activeStudentKeys,
    activeBlobKeys,
    classToStudentKeys,
    classToBlobKeys,
    studentPrimaryUrlMap,
  };
};

const revokeUnusedMemoryObjectUrls = () => {
  const stillReferenced = new Set<string>(memoryBlobObjectUrlMap.values());
  memoryShaToObjectUrlMap.forEach((objUrl, sha) => {
    if (!stillReferenced.has(objUrl)) {
      memoryShaToObjectUrlMap.delete(sha);
      memoryShaToCanonicalKeyMap.delete(sha);
      try {
        URL.revokeObjectURL(objUrl);
      } catch {
        // ignore
      }
    }
  });
};

/**
 * Inspeciona detalhadamente o uso real de armazenamento de fotos no IndexedDB,
 * detalhando o consumo por turma atual vs registros de turmas antigas / órfãs.
 */
export const inspectDetailedPhotoCacheUsage = async (
  activeClasses: ClassGroup[]
): Promise<PhotoCacheDetailedUsageReport> => {
  let browserEstimateUsageBytes: number | undefined;
  let browserEstimateQuotaBytes: number | undefined;

  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') browserEstimateUsageBytes = est.usage;
      if (typeof est.quota === 'number') browserEstimateQuotaBytes = est.quota;
    } catch {
      // ignore
    }
  }

  const activeIdx = buildActiveStudentCacheIndex(activeClasses);

  let urlRows: StudentPhotoUrlRecord[] = [];
  let blobRows: StudentPhotoBlobRecord[] = [];

  try {
    const db = await openPhotoCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_PHOTO_URLS, STORE_PHOTO_BLOBS], 'readonly');
      const rUrls = tx.objectStore(STORE_PHOTO_URLS).getAll();
      const rBlobs = tx.objectStore(STORE_PHOTO_BLOBS).getAll();
      rUrls.onsuccess = () => {
        urlRows = (rUrls.result || []) as StudentPhotoUrlRecord[];
      };
      rBlobs.onsuccess = () => {
        blobRows = (rBlobs.result || []) as StudentPhotoBlobRecord[];
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // retorna estrutura zerada caso IndexedDB esteja inacessível
  }

  const blobByKey = new Map<string, StudentPhotoBlobRecord>();
  let totalCachedBytes = 0;
  let canonicalBlobsCount = 0;

  for (const row of blobRows) {
    if (!row || !row.cacheKey) continue;
    blobByKey.set(row.cacheKey, row);
    if (row.blob && row.byteSize > 0) {
      canonicalBlobsCount++;
      totalCachedBytes += row.byteSize;
    }
  }

  // Enriquecer chaves de blob ativas com URLs ainda vinculadas aos registros de URLs dos estudantes ativos
  const referencedActiveBlobKeys = new Set<string>(activeIdx.activeBlobKeys);
  const legacyUrlKeys = new Set<string>();

  for (const u of urlRows) {
    if (!u || !u.studentKey) continue;
    if (activeIdx.activeStudentKeys.has(u.studentKey)) {
      const urlBlobKeys = buildPhotoBlobCacheKeys(u.photoUrl || u.photoDriveUrl, u.driveFileId);
      urlBlobKeys.forEach((bk) => referencedActiveBlobKeys.add(bk));
    } else {
      legacyUrlKeys.add(u.studentKey);
    }
  }

  // Propagar referências ativas através de ponteiros (`targetCacheKey` e `sha256`)
  const activeCanonicalBlobKeys = new Set<string>();
  const activeShas = new Set<string>();
  for (const bk of referencedActiveBlobKeys) {
    const rec = blobByKey.get(bk);
    if (!rec) continue;
    if (rec.sha256) activeShas.add(rec.sha256);
    if (rec.targetCacheKey) {
      activeCanonicalBlobKeys.add(rec.targetCacheKey);
    } else if (rec.blob && rec.byteSize > 0) {
      activeCanonicalBlobKeys.add(rec.cacheKey);
    }
  }
  for (const row of blobRows) {
    if (row.blob && row.byteSize > 0 && row.sha256 && activeShas.has(row.sha256)) {
      activeCanonicalBlobKeys.add(row.cacheKey);
    }
  }

  let activeClassesBytes = 0;
  let activeClassesBlobCount = 0;
  let legacyBytes = 0;
  let legacyBlobRecordsCount = 0;
  let legacyCanonicalBlobsCount = 0;

  for (const row of blobRows) {
    const isCanonical = Boolean(row.blob && row.byteSize > 0);
    const isActiveKey =
      referencedActiveBlobKeys.has(row.cacheKey) ||
      activeCanonicalBlobKeys.has(row.cacheKey) ||
      (row.targetCacheKey ? activeCanonicalBlobKeys.has(row.targetCacheKey) : false);

    if (isActiveKey) {
      if (isCanonical) {
        activeClassesBytes += row.byteSize;
        activeClassesBlobCount++;
      }
    } else {
      legacyBlobRecordsCount++;
      if (isCanonical) {
        legacyBytes += row.byteSize;
        legacyCanonicalBlobsCount++;
      }
    }
  }

  // Breakdown por turma atual
  const urlRecordMap = new Map<string, StudentPhotoUrlRecord>();
  urlRows.forEach((r) => {
    if (r?.studentKey) urlRecordMap.set(r.studentKey, r);
  });

  const classBreakdown: ClassPhotoStorageBreakdown[] = (activeClasses || []).map((cls) => {
    const seenCanonicalForClass = new Set<string>();
    let cachedStudentsCount = 0;
    let cachedBytes = 0;

    for (const st of cls.students || []) {
      const studentName = st.estudante || st.name || '';
      const sKeys = buildStudentPhotoLookupKeys({
        studentId: st.id,
        ra: st.ra,
        name: studentName,
      });

      const candidateBlobKeys = new Set<string>();
      for (const sk of sKeys) {
        const uRec = urlRecordMap.get(sk);
        if (uRec) {
          buildPhotoBlobCacheKeys(uRec.photoUrl || uRec.photoDriveUrl, uRec.driveFileId).forEach(
            (bk) => candidateBlobKeys.add(bk)
          );
        }
      }
      buildPhotoBlobCacheKeys(st.photo || st.photoDriveUrl, st.photoDriveId).forEach((bk) =>
        candidateBlobKeys.add(bk)
      );

      let studentHasCachedBlob = false;
      for (const bk of candidateBlobKeys) {
        const rec = blobByKey.get(bk);
        if (!rec) continue;
        const resolvedKey = rec.targetCacheKey || rec.cacheKey;
        const resolvedRec = blobByKey.get(resolvedKey) || rec;
        if (resolvedRec && resolvedRec.blob && resolvedRec.byteSize > 0) {
          studentHasCachedBlob = true;
          if (!seenCanonicalForClass.has(resolvedRec.cacheKey)) {
            seenCanonicalForClass.add(resolvedRec.cacheKey);
            cachedBytes += resolvedRec.byteSize;
          }
        }
      }

      if (studentHasCachedBlob) {
        cachedStudentsCount++;
      }
    }

    return {
      classId: cls.id,
      className: cls.name,
      turmaAbrev: cls.turmaAbrev,
      shift: cls.shift || '',
      totalStudents: (cls.students || []).length,
      cachedStudentsCount,
      cachedBytes,
      canonicalBlobsCount: seenCanonicalForClass.size,
    };
  });

  return {
    totalCachedBytes,
    maxBudgetBytes: MAX_IDB_TOTAL_BYTES,
    maxBudgetRecords: MAX_IDB_BLOB_RECORDS,
    urlRecordsCount: urlRows.length,
    blobRecordsCount: blobRows.length,
    canonicalBlobsCount,
    deduplicatedAliasCount: Math.max(0, blobRows.length - canonicalBlobsCount),
    activeClassesBytes,
    activeClassesBlobCount,
    legacyBytes,
    legacyUrlRecordsCount: legacyUrlKeys.size,
    legacyBlobRecordsCount,
    legacyCanonicalBlobsCount,
    browserEstimateUsageBytes,
    browserEstimateQuotaBytes,
    classBreakdown,
  };
};

/**
 * Remove em 1 clique todo o cache de fotos pertencente a turmas antigas, alunos desligados
 * ou arquivos órfãos que não fazem mais parte da matriz ativa.
 */
export const pruneLegacyClassPhotoCacheFromIndexedDb = async (
  activeClasses: ClassGroup[]
): Promise<PrunePhotoCacheResult> => {
  const activeIdx = buildActiveStudentCacheIndex(activeClasses);

  let urlRows: StudentPhotoUrlRecord[] = [];
  let blobRows: StudentPhotoBlobRecord[] = [];

  try {
    const db = await openPhotoCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_PHOTO_URLS, STORE_PHOTO_BLOBS], 'readonly');
      tx.objectStore(STORE_PHOTO_URLS).getAll().onsuccess = (e: any) => {
        urlRows = (e?.target?.result || []) as StudentPhotoUrlRecord[];
      };
      tx.objectStore(STORE_PHOTO_BLOBS).getAll().onsuccess = (e: any) => {
        blobRows = (e?.target?.result || []) as StudentPhotoBlobRecord[];
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });

    const referencedActiveBlobKeys = new Set<string>(activeIdx.activeBlobKeys);
    const urlsToDelete: string[] = [];

    for (const u of urlRows) {
      if (!u || !u.studentKey) continue;
      if (activeIdx.activeStudentKeys.has(u.studentKey)) {
        buildPhotoBlobCacheKeys(u.photoUrl || u.photoDriveUrl, u.driveFileId).forEach((bk) =>
          referencedActiveBlobKeys.add(bk)
        );
      } else {
        urlsToDelete.push(u.studentKey);
      }
    }

    const blobByKey = new Map<string, StudentPhotoBlobRecord>();
    blobRows.forEach((b) => {
      if (b?.cacheKey) blobByKey.set(b.cacheKey, b);
    });

    const activeCanonicalKeys = new Set<string>();
    const activeShas = new Set<string>();
    for (const bk of referencedActiveBlobKeys) {
      const rec = blobByKey.get(bk);
      if (!rec) continue;
      if (rec.sha256) activeShas.add(rec.sha256);
      if (rec.targetCacheKey) {
        activeCanonicalKeys.add(rec.targetCacheKey);
      } else if (rec.blob && rec.byteSize > 0) {
        activeCanonicalKeys.add(rec.cacheKey);
      }
    }
    for (const row of blobRows) {
      if (row.blob && row.byteSize > 0 && row.sha256 && activeShas.has(row.sha256)) {
        activeCanonicalKeys.add(row.cacheKey);
      }
    }

    const blobsToDelete: string[] = [];
    let freedBytes = 0;

    for (const row of blobRows) {
      const isProtected =
        referencedActiveBlobKeys.has(row.cacheKey) ||
        activeCanonicalKeys.has(row.cacheKey) ||
        (row.targetCacheKey ? activeCanonicalKeys.has(row.targetCacheKey) : false);

      if (!isProtected) {
        blobsToDelete.push(row.cacheKey);
        if (row.blob && row.byteSize > 0) {
          freedBytes += row.byteSize;
        }
      }
    }

    if (urlsToDelete.length > 0 || blobsToDelete.length > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction([STORE_PHOTO_URLS, STORE_PHOTO_BLOBS], 'readwrite');
        const urlStore = tx.objectStore(STORE_PHOTO_URLS);
        const blobStore = tx.objectStore(STORE_PHOTO_BLOBS);

        for (const k of urlsToDelete) {
          urlStore.delete(k);
          memoryUrlMap.delete(k);
        }
        for (const bk of blobsToDelete) {
          blobStore.delete(bk);
          memoryBlobObjectUrlMap.delete(bk);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });

      revokeUnusedMemoryObjectUrls();
      attemptedFetchKeys.clear();
      readyListeners.forEach((cb) => {
        try {
          cb();
        } catch {
          // ignore
        }
      });
    }

    return {
      removedUrlRecords: urlsToDelete.length,
      removedBlobRecords: blobsToDelete.length,
      freedBytes,
    };
  } catch {
    return {
      removedUrlRecords: 0,
      removedBlobRecords: 0,
      freedBytes: 0,
    };
  }
};

/**
 * Limpa o cache local IndexedDB exclusivamente de uma turma específica,
 * preservando automaticamente blobs ainda referenciados por alunos de outras turmas.
 */
export const clearSpecificClassPhotoCacheFromIndexedDb = async (
  targetClass: ClassGroup,
  allClasses: ClassGroup[]
): Promise<PrunePhotoCacheResult> => {
  const otherClasses = (allClasses || []).filter((c) => c.id !== targetClass.id);
  const otherIdx = buildActiveStudentCacheIndex(otherClasses);
  const targetIdx = buildActiveStudentCacheIndex([targetClass]);

  try {
    const db = await openPhotoCacheDb();
    let urlRows: StudentPhotoUrlRecord[] = [];
    let blobRows: StudentPhotoBlobRecord[] = [];

    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_PHOTO_URLS, STORE_PHOTO_BLOBS], 'readonly');
      tx.objectStore(STORE_PHOTO_URLS).getAll().onsuccess = (e: any) => {
        urlRows = (e?.target?.result || []) as StudentPhotoUrlRecord[];
      };
      tx.objectStore(STORE_PHOTO_BLOBS).getAll().onsuccess = (e: any) => {
        blobRows = (e?.target?.result || []) as StudentPhotoBlobRecord[];
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });

    const otherActiveBlobKeys = new Set<string>(otherIdx.activeBlobKeys);
    const urlsToDelete: string[] = [];

    for (const u of urlRows) {
      if (!u || !u.studentKey) continue;
      const inTarget = targetIdx.activeStudentKeys.has(u.studentKey);
      const inOther = otherIdx.activeStudentKeys.has(u.studentKey);
      if (inTarget && !inOther) {
        urlsToDelete.push(u.studentKey);
      } else if (inOther) {
        buildPhotoBlobCacheKeys(u.photoUrl || u.photoDriveUrl, u.driveFileId).forEach((bk) =>
          otherActiveBlobKeys.add(bk)
        );
      }
    }

    const blobByKey = new Map<string, StudentPhotoBlobRecord>();
    blobRows.forEach((b) => {
      if (b?.cacheKey) blobByKey.set(b.cacheKey, b);
    });

    const protectedCanonicalKeys = new Set<string>();
    for (const bk of otherActiveBlobKeys) {
      const rec = blobByKey.get(bk);
      if (!rec) continue;
      if (rec.targetCacheKey) protectedCanonicalKeys.add(rec.targetCacheKey);
      else if (rec.blob && rec.byteSize > 0) protectedCanonicalKeys.add(rec.cacheKey);
    }

    const targetCandidateKeys = new Set<string>(targetIdx.activeBlobKeys);
    for (const u of urlRows) {
      if (targetIdx.activeStudentKeys.has(u.studentKey)) {
        buildPhotoBlobCacheKeys(u.photoUrl || u.photoDriveUrl, u.driveFileId).forEach((bk) =>
          targetCandidateKeys.add(bk)
        );
      }
    }

    const blobsToDelete = new Set<string>();
    let freedBytes = 0;

    for (const bk of targetCandidateKeys) {
      if (otherActiveBlobKeys.has(bk) || protectedCanonicalKeys.has(bk)) continue;
      const rec = blobByKey.get(bk);
      if (!rec) continue;
      blobsToDelete.add(rec.cacheKey);
      if (rec.blob && rec.byteSize > 0) {
        freedBytes += rec.byteSize;
      } else if (rec.targetCacheKey && !protectedCanonicalKeys.has(rec.targetCacheKey)) {
        const canonical = blobByKey.get(rec.targetCacheKey);
        if (canonical && !blobsToDelete.has(canonical.cacheKey)) {
          blobsToDelete.add(canonical.cacheKey);
          if (canonical.blob && canonical.byteSize > 0) freedBytes += canonical.byteSize;
        }
      }
    }

    if (urlsToDelete.length > 0 || blobsToDelete.size > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction([STORE_PHOTO_URLS, STORE_PHOTO_BLOBS], 'readwrite');
        const urlStore = tx.objectStore(STORE_PHOTO_URLS);
        const blobStore = tx.objectStore(STORE_PHOTO_BLOBS);

        for (const k of urlsToDelete) {
          urlStore.delete(k);
          memoryUrlMap.delete(k);
        }
        blobsToDelete.forEach((bk) => {
          blobStore.delete(bk);
          memoryBlobObjectUrlMap.delete(bk);
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });

      revokeUnusedMemoryObjectUrls();
      attemptedFetchKeys.clear();
      readyListeners.forEach((cb) => {
        try {
          cb();
        } catch {
          // ignore
        }
      });
    }

    return {
      removedUrlRecords: urlsToDelete.length,
      removedBlobRecords: blobsToDelete.size,
      freedBytes,
    };
  } catch {
    return {
      removedUrlRecords: 0,
      removedBlobRecords: 0,
      freedBytes: 0,
    };
  }
};

export const clearStudentPhotoIndexedDbCache = async (): Promise<void> => {
  memoryUrlMap.clear();
  memoryShaToObjectUrlMap.clear();
  memoryShaToCanonicalKeyMap.clear();
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
    readyListeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
};
