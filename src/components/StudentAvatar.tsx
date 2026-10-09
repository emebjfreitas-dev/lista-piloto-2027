import React, { useState, useEffect } from 'react';
import { Student } from '../types';
import { findPhotoInDiscoveredCache } from '../services/googleSheetsApi';

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

  const effectiveName = name ?? student?.estudante ?? student?.name ?? 'Estudante';
  const effectiveInitials = initials ?? student?.initials;

  const cachedDriveHit = React.useMemo(
    () =>
      findPhotoInDiscoveredCache(
        effectiveName,
        student?.ra,
        student?.turma
      ),
    [effectiveName, student?.ra, student?.turma]
  );

  const rawPhoto = (
    photo ??
    student?.photo ??
    student?.photoDriveUrl ??
    cachedDriveHit?.photoUrl ??
    cachedDriveHit?.driveLink ??
    ''
  ).trim();
  const isMockTestPhoto =
    rawPhoto.includes('aida-public') ||
    rawPhoto.includes('randomuser.me') ||
    rawPhoto.includes('unsplash.com') ||
    rawPhoto.includes('pravatar.cc') ||
    rawPhoto.includes('picsum.photos');

  // Extract Google Drive file ID if present so we can cascade through fallback image endpoints if one fails
  const extractDriveId = (url: string): string => {
    if (!url || url.startsWith('data:image/')) return '';
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

  const driveFileId = isMockTestPhoto
    ? ''
    : extractDriveId(rawPhoto) ||
      extractDriveId(student?.photoDriveUrl || '') ||
      extractDriveId(cachedDriveHit?.driveLink || '');
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const candidateUrls = React.useMemo(() => {
    if (isMockTestPhoto || !rawPhoto) return [];
    if (rawPhoto.startsWith('data:image/') || rawPhoto.startsWith('blob:')) return [rawPhoto];
    if (rawPhoto.includes('/drive/folders/')) return [];
    if (driveFileId) {
      return [
        `/api/drive-photo/${driveFileId}`,
        `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w400`,
        `https://lh3.googleusercontent.com/d/${driveFileId}=w400`,
        `https://drive.google.com/uc?export=view&id=${driveFileId}`,
      ];
    }
    if (rawPhoto.startsWith('http://') || rawPhoto.startsWith('https://')) {
      return [rawPhoto];
    }
    return [];
  }, [rawPhoto, isMockTestPhoto, driveFileId]);

  const effectivePhoto = candidateUrls[fallbackIndex] || '';

  useEffect(() => {
    setFallbackIndex(0);
    setImageError(false);
  }, [rawPhoto]);

  const handleImageError = () => {
    if (fallbackIndex + 1 < candidateUrls.length) {
      setFallbackIndex((prev) => prev + 1);
    } else {
      setImageError(true);
    }
  };

  const sizeMap: Record<string, string> = {
    xs: 'w-7 h-7 text-[0.65rem] rounded-lg',
    sm: 'w-9 h-9 text-[0.75rem] rounded-xl',
    md: 'w-12 h-12 text-[0.95rem] rounded-2xl',
    lg: 'w-14 h-14 text-[1.1rem] rounded-2xl',
    xl: 'w-16 h-16 text-[1.25rem] rounded-2xl',
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
    effectivePhoto && effectivePhoto.trim().length > 0 && !imageError
  );

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0b3b49] to-[#1e5a6d] text-white font-extrabold flex items-center justify-center shadow-xs border border-white/80 select-none ${
        sizeMap[size]
      } ${className}`}
    >
      {hasValidPhoto ? (
        <img
          src={effectivePhoto}
          alt={`Foto de ${effectiveName}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={handleImageError}
          className="w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <span className="pointer-events-none">{getInitials(effectiveName)}</span>
      )}
    </div>
  );
};
