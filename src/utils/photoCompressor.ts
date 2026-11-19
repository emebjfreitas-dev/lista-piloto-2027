/**
 * Motor unificado de otimização Lossless/Smart de fotos dos estudantes
 * Suporta todos os formatos modernos e legados:
 * JPEG/JPG/JFIF, PNG, WebP, AVIF, HEIC/HEIF (Apple iOS), GIF, BMP, SVG, TIFF, ICO.
 *
 * - Corrige orientação EXIF automaticamente (createImageBitmap imageOrientation: 'from-image')
 * - Preserva transparência (alpha) em WebP visualmente sem perdas (qualidade 0.90)
 * - Guarda econômica: se o arquivo original já estiver dentro das dimensões e menor em bytes, mantém os bytes originais sem re-encodar
 * - Calcula SHA-256 para deduplicação absoluta (zero redundância)
 */

export interface OptimizedPhotoResult {
  blob: Blob;
  bytes: Uint8Array;
  dataUrl?: string;
  mimeType: string;
  extension: 'webp' | 'png' | 'jpg';
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  sha256: string;
  usedOriginalBytes: boolean;
}

export interface OptimizePhotoOptions {
  maxDimension?: number;
  quality?: number;
  includeDataUrl?: boolean;
}

export interface CollectedTransferFile {
  file: File;
  relativePath: string;
}

const IMAGE_EXTENSION_REGEX =
  /\.(jpe?g|jfif|pjpeg|pjp|png|webp|avif|heic|heif|gif|bmp|svg|tiff?|ico)$/i;

const HEIC_EXTENSION_REGEX = /\.(heic|heif)$/i;
const HEIC_MIME_REGEX = /^image\/hei[cf]/i;
const PDF_EXTENSION_REGEX = /\.pdf$/i;

export const isSupportedImageFile = (file: File): boolean => {
  if (!file) return false;
  if (file.type && file.type.toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXTENSION_REGEX.test(file.name || '');
};

export const isSupportedPdfFile = (file: File): boolean => {
  if (!file) return false;
  if (file.type && file.type.toLowerCase() === 'application/pdf') return true;
  return PDF_EXTENSION_REGEX.test(file.name || '');
};

export const bufferToHex = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

/**
 * Calcula hash SHA-256 usando WebCrypto nativo (hardware-accelerated)
 */
export const computeBufferSha256 = async (
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

  // Fallback determinístico leve apenas para contextos sem WebCrypto (ex: HTTP não-localhost)
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

export const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error('Falha ao converter Blob em Data URL'));
    reader.readAsDataURL(blob);
  });
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    return new Blob([], { type: 'image/jpeg' });
  }
  const header = dataUrl.slice(0, commaIdx);
  const body = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+);/i);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';

  if (header.toLowerCase().includes(';base64')) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }
  return new Blob([decodeURIComponent(body)], { type: mimeType });
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
      // fallback to HTMLImageElement below (e.g. SVG without explicit bitmap support)
    }
  }

  return new Promise<DecodedDrawable>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width || 440;
      const h = img.naturalHeight || img.height || 440;
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
): Promise<Blob | null> => {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
};

const extensionForMime = (mime: string): 'webp' | 'png' | 'jpg' => {
  const m = (mime || '').toLowerCase();
  if (m.includes('webp')) return 'webp';
  if (m.includes('png')) return 'png';
  return 'jpg';
};

/**
 * Otimiza foto de estudante com suporte universal a formatos, economia extrema e zero perda visual.
 */
export const optimizeStudentPhoto = async (
  fileOrDataUrl: File | Blob | string,
  options: OptimizePhotoOptions = {}
): Promise<OptimizedPhotoResult> => {
  const maxDimension = options.maxDimension ?? 440;
  const quality = options.quality ?? 0.9;
  const includeDataUrl = options.includeDataUrl ?? false;

  let sourceBlob: Blob;
  let filename = 'photo.jpg';

  if (typeof fileOrDataUrl === 'string') {
    sourceBlob = dataUrlToBlob(fileOrDataUrl);
  } else {
    sourceBlob = fileOrDataUrl;
    if (fileOrDataUrl instanceof File) {
      filename = fileOrDataUrl.name;
    }
  }

  const originalBytes = sourceBlob.size;
  if (originalBytes <= 0) {
    throw new Error('Arquivo de imagem vazio (0 bytes).');
  }

  // Converte HEIC/HEIF de iPhone se aplicável
  const decodedInputBlob = await convertHeicBlobIfNeeded(sourceBlob, filename);
  const decoded = await decodeBlobForCanvas(decodedInputBlob);

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
      if (srcW > srcH) {
        targetH = Math.max(1, Math.round((srcH * maxDimension) / srcW));
        targetW = maxDimension;
      } else {
        targetW = Math.max(1, Math.round((srcW * maxDimension) / srcH));
        targetH = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexto Canvas 2D indisponível.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, targetW, targetH);

    // 1. Tenta WebP (visualmente lossless em 0.90 com transparência alpha e 30-50% menor)
    let outputBlob = await canvasToBlob(canvas, 'image/webp', quality);
    if (!outputBlob || outputBlob.type !== 'image/webp') {
      // Fallback para JPEG sobre fundo branco se WebP não for suportado pelo navegador
      const jpgCanvas = document.createElement('canvas');
      jpgCanvas.width = targetW;
      jpgCanvas.height = targetH;
      const jpgCtx = jpgCanvas.getContext('2d');
      if (jpgCtx) {
        jpgCtx.fillStyle = '#ffffff';
        jpgCtx.fillRect(0, 0, targetW, targetH);
        jpgCtx.drawImage(canvas, 0, 0);
        outputBlob = await canvasToBlob(jpgCanvas, 'image/jpeg', quality);
      }
      if (!outputBlob) {
        outputBlob = await canvasToBlob(canvas, 'image/png');
      }
    }

    if (!outputBlob) {
      throw new Error('Falha ao codificar imagem otimizada.');
    }

    // Guarda econômica: se a imagem original já é WebP/JPEG/PNG dentro das dimensões máximas
    // e tem tamanho <= ao re-encode, mantém os bytes exatos originais (100% lossless sem recompressão)
    const origMime = (sourceBlob.type || '').toLowerCase();
    const isOrigSafeStandardFormat =
      origMime === 'image/webp' || origMime === 'image/jpeg' || origMime === 'image/png';

    let finalBlob = outputBlob;
    let usedOriginalBytes = false;

    if (!needsResize && isOrigSafeStandardFormat && originalBytes <= outputBlob.size) {
      finalBlob = sourceBlob;
      usedOriginalBytes = true;
    }

    const arrayBuffer = await finalBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const sha256 = await computeBufferSha256(bytes);
    const mimeType = finalBlob.type || 'image/webp';
    const extension = extensionForMime(mimeType);
    const dataUrl = includeDataUrl ? await blobToDataUrl(finalBlob) : undefined;

    return {
      blob: finalBlob,
      bytes,
      dataUrl,
      mimeType,
      extension,
      width: targetW,
      height: targetH,
      originalBytes,
      compressedBytes: bytes.byteLength,
      sha256,
      usedOriginalBytes,
    };
  } finally {
    decoded.cleanup();
  }
};

/**
 * Wrapper retrocompatível para chamadas existentes que esperam string Data URL
 */
export const compressStudentPhotoLossless = async (
  dataUrlOrFile: string | File,
  maxDimension = 440,
  quality = 0.9
): Promise<string> => {
  try {
    if (
      typeof dataUrlOrFile === 'string' &&
      (!dataUrlOrFile || !dataUrlOrFile.startsWith('data:image/'))
    ) {
      return dataUrlOrFile;
    }
    const result = await optimizeStudentPhoto(dataUrlOrFile, {
      maxDimension,
      quality,
      includeDataUrl: true,
    });
    return result.dataUrl || (typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '');
  } catch {
    return typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '';
  }
};

/**
 * Percorre arquivos e subpastas arrastadas via DataTransfer (ex: pasta "Fotos 2027/1F/01.heic")
 * preservando `relativePath` para ajudar a desambiguar a turma pelo nome da subpasta.
 */
export const collectFilesFromDataTransfer = async (
  dataTransfer: DataTransfer,
  acceptFn: (file: File) => boolean
): Promise<CollectedTransferFile[]> => {
  const results: CollectedTransferFile[] = [];

  const readEntryRecursive = async (entry: any, parentPath: string): Promise<void> => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            if (acceptFn(file)) {
              const rel = parentPath ? `${parentPath}/${file.name}` : file.name;
              results.push({ file, relativePath: rel });
            }
            resolve();
          },
          () => resolve()
        );
      });
      return;
    }

    if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const nextPrefix = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      // readEntries retorna no máximo 100 entradas por chamada no Chrome/Safari -> ler em loop até vazio!
      const readAllEntries = (): Promise<any[]> =>
        new Promise((resolve) => {
          const all: any[] = [];
          const step = () => {
            dirReader.readEntries(
              (batch: any[]) => {
                if (!batch || batch.length === 0) {
                  resolve(all);
                } else {
                  all.push(...batch);
                  step();
                }
              },
              () => resolve(all)
            );
          };
          step();
        });

      const entries = await readAllEntries();
      for (const child of entries) {
        await readEntryRecursive(child, nextPrefix);
      }
    }
  };

  const items = dataTransfer.items;
  let usedEntries = false;
  if (items && items.length > 0) {
    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as any;
      if (typeof it.webkitGetAsEntry === 'function') {
        const entry = it.webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
    }
    if (entries.length > 0) {
      usedEntries = true;
      for (const entry of entries) {
        await readEntryRecursive(entry, '');
      }
    }
  }

  if (!usedEntries && dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (acceptFn(file)) {
        const rel = (file as any).webkitRelativePath || file.name;
        results.push({ file, relativePath: rel });
      }
    }
  }

  return results;
};
