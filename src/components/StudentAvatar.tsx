import React, { useState, useEffect } from 'react';
import { Student } from '../types';

/**
 * Extracts exactly 2 clean uppercase initials from a student or contact name
 * (ignoring prepositions like DE, DA, DO, DOS, DAS, E).
 * Example: "ALICE DE BARROS PIRES" -> "AP"
 * Example: "YURI NICHOLAS" -> "YN"
 */
export const getTwoInitials = (name?: string, fallbackInitials?: string): string => {
  if (fallbackInitials && fallbackInitials.trim().length === 2) {
    return fallbackInitials.trim().toUpperCase();
  }
  const clean = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  if (!clean) return 'ES';

  const parts = clean
    .split(/\s+/)
    .filter((p) => p.length > 0 && !['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(p));

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].substring(0, 2);
  }
  return clean.substring(0, 2).padEnd(2, 'E');
};

interface StudentAvatarProps {
  student?: Pick<Student, 'name' | 'photo' | 'photoDriveUrl' | 'initials' | 'ra' | 'digRa' | 'turma'> | null;
  name?: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  expandableOnClick?: boolean;
  onUploadPhotoClick?: () => void;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  student,
  name,
  photoUrl,
  size = 'md',
  className = '',
  expandableOnClick = true,
  onUploadPhotoClick,
}) => {
  const resolvedName = student?.name || name || 'Estudante';
  const resolvedPhoto = student?.photo || photoUrl || '';
  const [imgError, setImgError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [resolvedPhoto]);

  const initials = getTwoInitials(resolvedName, student?.initials);

  const sizeClasses = {
    sm: 'w-9 h-9 text-[0.78rem] ring-1',
    md: 'w-12 h-12 text-[0.95rem] ring-2',
    lg: 'w-14 h-14 text-[1.1rem] ring-2',
    xl: 'w-20 h-20 text-[1.45rem] ring-3',
  }[size];

  const hasValidPhoto = Boolean(resolvedPhoto && resolvedPhoto.trim().length > 0 && !imgError);

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (!expandableOnClick) return;
    e.stopPropagation();
    setIsLightboxOpen(true);
  };

  return (
    <>
      {hasValidPhoto ? (
        <div
          onClick={expandableOnClick ? handleAvatarClick : undefined}
          title={expandableOnClick ? `Clique para expandir a foto de ${resolvedName}` : resolvedName}
          className={`relative inline-flex shrink-0 group ${expandableOnClick ? 'cursor-zoom-in' : ''}`}
        >
          <img
            src={resolvedPhoto}
            alt={resolvedName}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className={`${sizeClasses} rounded-full object-cover ring-[#003440]/25 shadow-2xs shrink-0 transition-transform duration-200 group-hover:scale-105 ${className}`}
          />
          {expandableOnClick && (
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#003440]/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-2xs pointer-events-none">
              <span className="material-symbols-outlined text-[11px]">zoom_in</span>
            </span>
          )}
        </div>
      ) : (
        <div
          onClick={expandableOnClick ? handleAvatarClick : undefined}
          aria-label={`Iniciais de ${resolvedName}: ${initials}`}
          title={
            expandableOnClick
              ? `Clique para ampliar ou enviar foto de ${resolvedName}`
              : `${resolvedName} (2 iniciais)`
          }
          className={`${sizeClasses} rounded-full bg-gradient-to-br from-[#e6f4fa] to-[#e8f8ef] text-[#003440] font-extrabold tracking-tight flex items-center justify-center ring-[#003440]/15 border border-white shadow-2xs shrink-0 select-none transition-transform duration-200 ${
            expandableOnClick ? 'cursor-zoom-in hover:scale-105' : ''
          } ${className}`}
        >
          {initials}
        </div>
      )}

      {isLightboxOpen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsLightboxOpen(false);
          }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white/95 backdrop-blur-xl rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-white/20 flex flex-col items-center text-center space-y-4"
          >
            <div className="w-full flex items-center justify-between border-b border-[#003440]/10 pb-3">
              <div className="text-left min-w-0">
                <span className="text-[0.7rem] font-extrabold uppercase tracking-wider text-[#005035] block">
                  Identificação Fotográfica Nominal
                </span>
                <h4 className="text-[1.05rem] font-extrabold text-[#003440] truncate">
                  {resolvedName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="w-9 h-9 rounded-full bg-[#f1f4f3] hover:bg-[#e3e8e6] text-[#003440] flex items-center justify-center cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {hasValidPhoto ? (
              <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden ring-4 ring-[#003440]/15 shadow-lg bg-[#f5f7f6]">
                <img
                  src={resolvedPhoto}
                  alt={resolvedName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-52 h-52 rounded-full bg-gradient-to-br from-[#e6f4fa] to-[#e8f8ef] text-[#003440] text-[4rem] font-black flex items-center justify-center ring-4 ring-[#003440]/15 shadow-inner select-none">
                {initials}
              </div>
            )}

            <div className="space-y-1">
              {student?.turma && (
                <span className="inline-block px-3 py-0.5 rounded-full bg-[#eaf6ef] text-[#005035] text-[0.76rem] font-bold">
                  Turma {student.turma}
                </span>
              )}
              {student?.ra && (
                <p className="text-[0.8rem] font-mono font-semibold text-[#436370]">
                  RA: {student.ra}-{student.digRa || '0'}/SP
                </p>
              )}
              <p className="text-[0.75rem] text-[#5a676b]">
                Arquivo na Pasta Nomeada: <code className="font-mono font-bold text-[#003440]">{resolvedName}.jpg</code>
              </p>
            </div>

            <div className="flex items-center gap-2.5 w-full pt-1">
              {onUploadPhotoClick && (
                <button
                  type="button"
                  onClick={() => {
                    setIsLightboxOpen(false);
                    onUploadPhotoClick();
                  }}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-bold text-[0.84rem] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                  <span>Subir / Trocar Foto</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#f1f4f3] hover:bg-[#e3e8e6] text-[#003440] font-bold text-[0.84rem] cursor-pointer"
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
