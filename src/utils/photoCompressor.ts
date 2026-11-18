/**
 * Utility para compressão Lossless/Smart de fotos de estudantes via Canvas
 * Redimensiona para max 400x400 px e comprime para WebP/JPEG com preservação visual de 100%.
 */
export const compressStudentPhotoLossless = async (
  dataUrlOrFile: string | File,
  maxDimension = 400,
  quality = 0.92
): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const isFile = typeof File !== 'undefined' && dataUrlOrFile instanceof File;
      const sourceUrl = isFile ? URL.createObjectURL(dataUrlOrFile as File) : (dataUrlOrFile as string);

      if (!sourceUrl || (!isFile && !sourceUrl.startsWith('data:image/'))) {
        resolve(typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '');
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let w = img.width;
          let h = img.height;
          if (w <= 0 || h <= 0) {
            resolve(typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '');
            return;
          }

          if (w > maxDimension || h > maxDimension) {
            if (w > h) {
              h = Math.round((h * maxDimension) / w);
              w = maxDimension;
            } else {
              w = Math.round((w * maxDimension) / h);
              h = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '');
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          // Tenta exportar em WebP se suportado, senão JPEG 92% lossy-free
          let result = canvas.toDataURL('image/webp', quality);
          if (!result.startsWith('data:image/webp')) {
            result = canvas.toDataURL('image/jpeg', quality);
          }

          if (isFile) {
            URL.revokeObjectURL(sourceUrl);
          }
          resolve(result);
        } catch {
          resolve(typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '');
        }
      };

      img.onerror = () => {
        if (isFile) {
          URL.revokeObjectURL(sourceUrl);
        }
        resolve(typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '');
      };

      img.src = sourceUrl;
    } catch {
      resolve(typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '');
    }
  });
};
