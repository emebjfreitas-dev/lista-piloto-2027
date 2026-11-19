import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Student } from '../types';
import { findPhotoInDiscoveredCache } from '../services/googleSheetsApi';
import { isBackendApiAvailable } from '../services/apiEnvironment';
import {
  buildPhotoBlobCacheKeys,
  ensurePhotoCachedInIndexedDb,
  extractDriveFileIdFromPhotoUrl,
  getCachedPhotoObjectUrlSync,
  getPersistedStudentPhotoUrlSync,
  persistSingleStudentPhotoToIndexedDb,
  subscribeToPhotoBlobUpdates,
  subscribeToPhotoCacheReady,
} from '../services/photoIndexedDbCache';

interface StudentAvatarProps {
  student?: Student | null;
  name?: string;
  photo?: string;
  initials?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  expandableOnClick?: boolean;
  onUploadPhotoClick?: () => void;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  student,
  name,
  photo,
  initials,
  size = 'md',
  className = '',
  expandableOnClick = true,
  onUploadPhotoClick,
}) => {
  const [imageError, setImageError] = useState(false);
  const [cacheRevision, setCacheRevision] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxFallbackIndex, setLightboxFallbackIndex] = useState(0);

  const effectiveName = name ?? student?.estudante ?? student?.name ?? 'Estudante';
  const effectiveInitials = initials ?? student?.initials;

  useEffect(() => {
    return subscribeToPhotoCacheReady(() => {
      setCacheRevision((prev) => prev + 1);
    });
  }, []);

  const cachedDriveHit = React.useMemo(
    () =>
      findPhotoInDiscoveredCache(
        effectiveName,
        student?.ra,
        student?.turma
      ),
    [effectiveName, student?.ra, student?.turma]
  );

  const persistedUrlRecord = React.useMemo(
    () =>
      getPersistedStudentPhotoUrlSync({
        studentId: student?.id,
        ra: student?.ra,
        name: effectiveName,
      }),
    [student?.id, student?.ra, effectiveName, cacheRevision]
  );

  const rawPhoto = (
    (photo && photo.trim()) ||
    (student?.photo && student.photo.trim()) ||
    (student?.photoDriveUrl && student.photoDriveUrl.trim()) ||
    (cachedDriveHit?.photoUrl && cachedDriveHit.photoUrl.trim()) ||
    (cachedDriveHit?.driveLink && cachedDriveHit.driveLink.trim()) ||
    (persistedUrlRecord?.photoUrl && persistedUrlRecord.photoUrl.trim()) ||
    (persistedUrlRecord?.photoDriveUrl && persistedUrlRecord.photoDriveUrl.trim()) ||
    ''
  ).trim();

  const driveFileId =
    (student?.photoDriveId && student.photoDriveId.trim()) ||
    extractDriveFileIdFromPhotoUrl(rawPhoto) ||
    extractDriveFileIdFromPhotoUrl(student?.photoDriveUrl || '') ||
    extractDriveFileIdFromPhotoUrl(cachedDriveHit?.driveLink || '') ||
    persistedUrlRecord?.driveFileId ||
    '';

  const cachedBlobUrl = React.useMemo(
    () => getCachedPhotoObjectUrlSync(rawPhoto, driveFileId),
    [rawPhoto, driveFileId, cacheRevision]
  );

  useEffect(() => {
    const keys = buildPhotoBlobCacheKeys(rawPhoto, driveFileId);
    if (keys.length === 0) return;
    return subscribeToPhotoBlobUpdates((updatedKey) => {
      if (keys.includes(updatedKey)) {
        setCacheRevision((prev) => prev + 1);
      }
    });
  }, [rawPhoto, driveFileId]);

  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [hasIntersected, setHasIntersected] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hasIntersected || cachedBlobUrl) {
      if (cachedBlobUrl && !hasIntersected) {
        setHasIntersected(true);
      }
      return;
    }
    const el = containerRef.current;
    if (!el) {
      setHasIntersected(true);
      return;
    }

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setHasIntersected(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            setHasIntersected(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '250px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [hasIntersected, cachedBlobUrl]);

  const candidateUrls = React.useMemo(() => {
    if (cachedBlobUrl) {
      return [cachedBlobUrl];
    }
    if (!hasIntersected) return [];
    if (!rawPhoto) return [];
    if (rawPhoto.startsWith('data:image/') || rawPhoto.startsWith('blob:')) return [rawPhoto];
    if (rawPhoto.includes('/drive/folders/')) return [];
    if (driveFileId) {
      // If backend API is available (Express node), proxy can be tried first.
      // On static/GitHub Pages hosting, NEVER call /api/drive-photo/ to avoid 404 floods & rate limit triggers!
      if (isBackendApiAvailable()) {
        return [
          `/api/drive-photo/${driveFileId}`,
          `https://lh3.googleusercontent.com/d/${driveFileId}=w400`,
          `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w400`,
          `https://drive.google.com/uc?export=view&id=${driveFileId}`,
        ];
      }
      return [
        `https://lh3.googleusercontent.com/d/${driveFileId}=w400`,
        `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w400`,
        `https://drive.google.com/uc?export=view&id=${driveFileId}`,
      ];
    }
    if (rawPhoto.startsWith('/') || rawPhoto.startsWith('http://') || rawPhoto.startsWith('https://')) {
      return [rawPhoto];
    }
    return [];
  }, [cachedBlobUrl, hasIntersected, rawPhoto, driveFileId]);

  const effectivePhoto = candidateUrls[fallbackIndex] || '';

  const lightboxCandidates = React.useMemo(() => {
    const list: string[] = [];
    if (driveFileId) {
      if (isBackendApiAvailable()) {
        list.push(`/api/drive-photo/${driveFileId}`);
      }
      list.push(`https://lh3.googleusercontent.com/d/${driveFileId}=w1200`);
      list.push(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1200`);
    }
    if (effectivePhoto) {
      list.push(effectivePhoto);
    }
    if (cachedBlobUrl) {
      list.push(cachedBlobUrl);
    }
    return Array.from(new Set(list.filter(Boolean)));
  }, [driveFileId, effectivePhoto, cachedBlobUrl]);

  const activeLightboxUrl = lightboxCandidates[lightboxFallbackIndex] || effectivePhoto;

  useEffect(() => {
    setFallbackIndex(0);
    setImageError(false);
    setLightboxFallbackIndex(0);
  }, [rawPhoto, cachedBlobUrl]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    setLightboxFallbackIndex(0);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsLightboxOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen]);

  const handleImageLoad = () => {
    // Persist the resolved student photo URL mapping in IndexedDB if not already stored or changed
    if (
      rawPhoto &&
      (!persistedUrlRecord || persistedUrlRecord.photoUrl !== rawPhoto)
    ) {
      void persistSingleStudentPhotoToIndexedDb({
        studentId: student?.id,
        ra: student?.ra,
        name: effectiveName,
        photoUrl: rawPhoto,
        photoDriveUrl: student?.photoDriveUrl || cachedDriveHit?.driveLink || persistedUrlRecord?.photoDriveUrl,
        driveFileId: driveFileId || undefined,
        isManualLink: student?.photoManualLink,
        updatedAtMs: student?.updatedAtMs,
      });
    }

    // Cache binary Blob in IndexedDB ONCE per key when loaded from network/data URL
    if (!cachedBlobUrl && effectivePhoto && !effectivePhoto.startsWith('blob:')) {
      void ensurePhotoCachedInIndexedDb(effectivePhoto, driveFileId || undefined);
    }
  };

  const authFetchAttemptedRef = useRef<Set<string>>(new Set());

  const handleImageError = () => {
    if (
      effectivePhoto &&
      (effectivePhoto.startsWith('/api/photos/') || effectivePhoto.startsWith('/api/drive-photo/')) &&
      !authFetchAttemptedRef.current.has(effectivePhoto)
    ) {
      authFetchAttemptedRef.current.add(effectivePhoto);
      void ensurePhotoCachedInIndexedDb(effectivePhoto, driveFileId || undefined).then((blobUrl) => {
        if (blobUrl) {
          setImageError(false);
          setCacheRevision((prev) => prev + 1);
          return;
        }
        if (fallbackIndex + 1 < candidateUrls.length) {
          setFallbackIndex((prev) => prev + 1);
        } else {
          setImageError(true);
        }
      });
      return;
    }
    if (fallbackIndex + 1 < candidateUrls.length) {
      setFallbackIndex((prev) => prev + 1);
    } else {
      setImageError(true);
    }
  };

  const handleLightboxError = () => {
    if (lightboxFallbackIndex + 1 < lightboxCandidates.length) {
      setLightboxFallbackIndex((prev) => prev + 1);
    }
  };

  const hasCustomSize = /\bw-/.test(className) || /\bh-/.test(className);

  const sizeMap: Record<string, string> = {
    xs: hasCustomSize ? 'text-xs rounded-xl' : 'w-9 h-9 text-xs rounded-xl',
    sm: hasCustomSize ? 'text-sm rounded-2xl' : 'w-14 h-14 text-sm rounded-2xl',
    md: hasCustomSize ? 'text-base rounded-2xl' : 'w-16 h-16 sm:w-20 sm:h-20 text-base rounded-2xl',
    lg: hasCustomSize ? 'text-lg rounded-2xl' : 'w-20 h-20 sm:w-24 sm:h-24 text-lg rounded-2xl',
    xl: hasCustomSize ? 'text-xl rounded-3xl' : 'w-24 h-24 sm:w-32 sm:h-32 text-xl rounded-3xl',
  };

  const getInitials = (fullName: string) => {
    if (effectiveInitials) return effectiveInitials;
    const cleaned = (fullName || 'E').trim();
    if (!cleaned) return 'E';
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  };

  const hasValidPhoto = Boolean(
    (hasIntersected || cachedBlobUrl) &&
      effectivePhoto &&
      effectivePhoto.trim().length > 0 &&
      !imageError
  );

  const canExpand = hasValidPhoto && expandableOnClick;
  const canClickUploadFallback = !hasValidPhoto && Boolean(onUploadPhotoClick);
  const isInteractive = canExpand || canClickUploadFallback;

  const handleAvatarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (canExpand) {
      e.preventDefault();
      e.stopPropagation();
      setIsLightboxOpen(true);
    } else if (canClickUploadFallback && onUploadPhotoClick) {
      e.preventDefault();
      e.stopPropagation();
      onUploadPhotoClick();
    }
  };

  const handleAvatarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (canExpand) {
        setIsLightboxOpen(true);
      } else if (canClickUploadFallback && onUploadPhotoClick) {
        onUploadPhotoClick();
      }
    }
  };

  const studentMetaParts: string[] = [];
  if (student?.turma) studentMetaParts.push(`Turma ${student.turma}`);
  if (typeof student?.number === 'number') {
    studentMetaParts.push(`Nº ${student.number.toString().padStart(2, '0')}`);
  }
  if (student?.ra) {
    studentMetaParts.push(`RA ${student.ra}${student.digRa ? `-${student.digRa}` : ''}`);
  }

  return (
    <>
      <div
        ref={containerRef}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-label={
          canExpand
            ? `Ampliar foto de ${effectiveName}`
            : canClickUploadFallback
            ? `Adicionar foto de ${effectiveName}`
            : undefined
        }
        title={
          canExpand
            ? 'Clique para ampliar foto'
            : canClickUploadFallback
            ? 'Clique para adicionar foto'
            : undefined
        }
        onClick={isInteractive ? handleAvatarClick : undefined}
        onKeyDown={isInteractive ? handleAvatarKeyDown : undefined}
        className={`group relative shrink-0 overflow-hidden bg-slate-100 text-slate-700 font-semibold flex items-center justify-center border border-slate-200/80 select-none ${
          sizeMap[size]
        } ${
          canExpand
            ? 'cursor-zoom-in hover:ring-2 hover:ring-[#0b3b8c]/45 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#0b3b8c]'
            : canClickUploadFallback
            ? 'cursor-pointer hover:bg-slate-200/80 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0b3b8c]'
            : ''
        } ${className}`}
      >
        {hasValidPhoto ? (
          <>
            <img
              src={effectivePhoto}
              alt={`Foto de ${effectiveName}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={handleImageLoad}
              onError={handleImageError}
              className={`w-full h-full object-cover pointer-events-none animate-gentle-fade ${
                canExpand ? 'transition-transform duration-200 group-hover:scale-105' : ''
              }`}
            />
            {canExpand && size !== 'xs' && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-1.5 right-1.5 w-6 h-6 rounded-lg bg-slate-950/60 text-white backdrop-blur-xs flex items-center justify-center opacity-75 group-hover:opacity-100 transition-opacity duration-150 shadow-xs"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">
                  open_in_full
                </span>
              </span>
            )}
          </>
        ) : (
          <span className="pointer-events-none tracking-tight">{getInitials(effectiveName)}</span>
        )}
      </div>

      {isLightboxOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsLightboxOpen(false);
            }}
            className="fixed inset-0 z-[140] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-gentle-fade"
            role="dialog"
            aria-modal="true"
            aria-label={`Foto ampliada de ${effectiveName}`}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xl rounded-3xl overflow-hidden bg-slate-900 shadow-2xl border border-white/10 flex flex-col max-h-[90dvh]"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLightboxOpen(false);
                }}
                aria-label="Fechar foto ampliada"
                className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-full bg-slate-950 flex items-center justify-center overflow-hidden min-h-[260px] max-h-[72dvh]">
                <img
                  src={activeLightboxUrl}
                  alt={`Foto ampliada de ${effectiveName}`}
                  referrerPolicy="no-referrer"
                  onError={handleLightboxError}
                  className="w-full h-full max-h-[72dvh] object-contain select-none"
                />
              </div>

              <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base sm:text-lg font-bold text-white leading-snug break-words">
                    {effectiveName}
                  </p>
                  {studentMetaParts.length > 0 && (
                    <p className="text-xs text-slate-300 font-mono tabular-nums mt-0.5">
                      {studentMetaParts.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onUploadPhotoClick && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLightboxOpen(false);
                        onUploadPhotoClick();
                      }}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">photo_camera</span>
                      <span>Alterar foto</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLightboxOpen(false);
                    }}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

