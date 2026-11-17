import React, { useState, useEffect, useRef } from 'react';
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
}) => {
  const [imageError, setImageError] = useState(false);
  const [cacheRevision, setCacheRevision] = useState(0);

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

  useEffect(() => {
    setFallbackIndex(0);
    setImageError(false);
  }, [rawPhoto, cachedBlobUrl]);

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

  const handleImageError = () => {
    if (fallbackIndex + 1 < candidateUrls.length) {
      setFallbackIndex((prev) => prev + 1);
    } else {
      setImageError(true);
    }
  };

  const sizeMap: Record<string, string> = {
    xs: 'w-7 h-7 text-[11px] rounded-lg',
    sm: 'w-8 h-8 text-xs rounded-lg',
    md: 'w-10 h-10 text-xs rounded-xl',
    lg: 'w-12 h-12 text-sm rounded-xl',
    xl: 'w-14 h-14 text-base rounded-2xl',
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

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 overflow-hidden bg-slate-100 text-slate-700 font-medium flex items-center justify-center border border-slate-200/80 select-none ${
        sizeMap[size]
      } ${className}`}
    >
      {hasValidPhoto ? (
        <img
          src={effectivePhoto}
          alt={`Foto de ${effectiveName}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={handleImageLoad}
          onError={handleImageError}
          className="w-full h-full object-cover pointer-events-none animate-gentle-fade"
        />
      ) : (
        <span className="pointer-events-none tracking-tight">{getInitials(effectiveName)}</span>
      )}
    </div>
  );
};
