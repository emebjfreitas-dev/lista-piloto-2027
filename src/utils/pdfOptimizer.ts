import { PDFDocument } from 'pdf-lib';
import { computeBufferSha256 } from './photoCompressor';

export interface OptimizedPdfResult {
  valid: boolean;
  reason?: string;
  bytes: Uint8Array;
  sha256: string;
  originalBytes: number;
  optimizedBytes: number;
  wasOptimized: boolean;
  pageCount?: number;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export const hasPdfMagicHeader = (bytes: Uint8Array): boolean => {
  if (!bytes || bytes.byteLength < 8) return false;
  const searchLimit = Math.min(bytes.byteLength - 5, 1024);
  for (let i = 0; i <= searchLimit; i++) {
    if (
      bytes[i] === PDF_MAGIC[0] &&
      bytes[i + 1] === PDF_MAGIC[1] &&
      bytes[i + 2] === PDF_MAGIC[2] &&
      bytes[i + 3] === PDF_MAGIC[3] &&
      bytes[i + 4] === PDF_MAGIC[4]
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Valida cabeçalho %PDF- e compacta o arquivo de forma 100% lossless (useObjectStreams: true)
 * mantendo estritamente o menor arquivo entre o original e o compactado (zero perda visual/vetorial).
 */
export const validateAndOptimizePdf = async (file: File): Promise<OptimizedPdfResult> => {
  const originalBytes = file.size;
  if (originalBytes < 32) {
    return {
      valid: false,
      reason: 'Arquivo vazio ou corrompido.',
      bytes: new Uint8Array(0),
      sha256: '',
      originalBytes,
      optimizedBytes: 0,
      wasOptimized: false,
    };
  }

  const rawBuffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(rawBuffer);

  if (!hasPdfMagicHeader(rawBytes)) {
    return {
      valid: false,
      reason: 'Arquivo não possui assinatura PDF válida (%PDF-).',
      bytes: new Uint8Array(0),
      sha256: '',
      originalBytes,
      optimizedBytes: 0,
      wasOptimized: false,
    };
  }

  let finalBytes: Uint8Array = rawBytes;
  let wasOptimized = false;
  let pageCount: number | undefined;

  try {
    const pdfDoc = await PDFDocument.load(rawBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    pageCount = pdfDoc.getPageCount();

    if (!pdfDoc.isEncrypted && pageCount > 0) {
      const compacted = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 80,
      });

      if (hasPdfMagicHeader(compacted) && compacted.byteLength < rawBytes.byteLength) {
        finalBytes = compacted;
        wasOptimized = true;
      }
    }
  } catch {
    // Se pdf-lib não conseguir reescrever (ex: assinatura digital ou PDF legado especial),
    // preserva o arquivo original intacto mantendo 100% de fidelidade lossless.
    finalBytes = rawBytes;
    wasOptimized = false;
  }

  const sha256 = await computeBufferSha256(finalBytes);

  return {
    valid: true,
    bytes: finalBytes,
    sha256,
    originalBytes,
    optimizedBytes: finalBytes.byteLength,
    wasOptimized,
    pageCount,
  };
};
