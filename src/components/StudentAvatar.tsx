import React, { useState, useEffect } from 'react';
import { Student } from '../types';

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
  expandableOnClick = false,
  onUploadPhotoClick,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isExpandedOpen, setIsExpandedOpen] = useState(false);

  const rawPhoto = (
    photo ??
    student?.photo ??
    student?.photoDriveUrl ??
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
    const m1 = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (m1 && m1[1]) return m1[1];
    const m2 = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (m2 && m2[1]) return m2[1];
    const m3 = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9-_]+)/);
    if (m3 && m3[1]) return m3[1];
    return '';
  };

  const driveFileId = isMockTestPhoto ? '' : extractDriveId(rawPhoto);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const candidateUrls = React.useMemo(() => {
    if (isMockTestPhoto || !rawPhoto) return [];
    if (rawPhoto.startsWith('data:image/')) return [rawPhoto];
    if (driveFileId) {
      return [
        `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w400`,
        `https://lh3.googleusercontent.com/d/${driveFileId}=w400`,
        `https://drive.google.com/uc?export=view&id=${driveFileId}`,
      ];
    }
    return [rawPhoto];
  }, [rawPhoto, isMockTestPhoto, driveFileId]);

  const effectivePhoto = candidateUrls[fallbackIndex] || '';
  const effectiveName = name ?? student?.name ?? 'Estudante';
  const effectiveInitials = initials ?? student?.initials;

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

  const isInteractive = Boolean(student) && (expandableOnClick || Boolean(onUploadPhotoClick));

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (!isInteractive) return;
    e.stopPropagation();
    setIsExpandedOpen(true);
  };

  return (
    <>
      <div
        onClick={handleAvatarClick}
        title={
          isInteractive
            ? `Clique na foto de ${effectiveName} para ampliar ou fazer upload de foto`
            : effectiveName
        }
        className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0b3b49] to-[#1e5a6d] text-white font-extrabold flex items-center justify-center shadow-xs border border-white/80 select-none ${
          sizeMap[size]
        } ${
          isInteractive
            ? 'cursor-pointer hover:ring-2 hover:ring-[#006644]/50 active:scale-95 transition-all group'
            : ''
        } ${className}`}
      >
        {hasValidPhoto ? (
          <img
            src={effectivePhoto}
            alt={`Foto de ${effectiveName}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{getInitials(effectiveName)}</span>
        )}

        {isInteractive && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[16px] opacity-0 group-hover:opacity-100 transition-opacity drop-shadow">
              photo_camera
            </span>
          </div>
        )}
      </div>

      {/* Modal de Foto Ampliada + Botão de Upload (Aparece SOMENTE ao clicar na foto) */}
      {isExpandedOpen && student && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsExpandedOpen(false);
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-3xl shadow-2xl border border-white/40 overflow-hidden p-5 flex flex-col items-center text-center space-y-4"
          >
            <div className="w-full flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-full bg-[#0b3b49]/10 text-[#0b3b49] font-mono text-[0.75rem] font-extrabold">
                Nº {(student.number ?? 1).toString().padStart(2, '0')}
                {student.ra ? ` • RA ${student.ra}-${student.digRa || ''}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setIsExpandedOpen(false)}
                className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-[#0f172a] flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-3xl overflow-hidden bg-gradient-to-br from-[#0b3b49] to-[#1e5a6d] text-white flex items-center justify-center shadow-lg border-4 border-white">
              {hasValidPhoto ? (
                <img
                  src={effectivePhoto}
                  alt={effectiveName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[3.5rem] font-black tracking-tight">
                    {getInitials(effectiveName)}
                  </span>
                  <span className="text-[0.75rem] font-semibold text-white/80">
                    Sem foto cadastrada
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <h4 className="text-[1.05rem] font-extrabold text-[#0f172a] leading-snug">
                {effectiveName}
              </h4>
              {(student.turma || student.periodo) && (
                <p className="text-[0.78rem] font-semibold text-[#475569]">
                  {student.turma ? `Turma ${student.turma}` : ''}
                  {student.periodo ? ` • ${student.periodo}` : ''}
                </p>
              )}
              {student.filiacao1 && (
                <p className="text-[0.74rem] text-[#475569]">
                  <strong>Mãe:</strong> {student.filiacao1}
                </p>
              )}
            </div>

            <div className="w-full flex gap-2 pt-1">
              {onUploadPhotoClick && (
                <button
                  type="button"
                  onClick={() => {
                    setIsExpandedOpen(false);
                    onUploadPhotoClick();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-2xl bg-[#006644] hover:bg-[#005035] text-white font-bold text-[0.82rem] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                  <span>Upload de Foto (Drive)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsExpandedOpen(false)}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-bold text-[0.82rem] cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
