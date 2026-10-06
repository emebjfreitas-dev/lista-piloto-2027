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
  student?: Pick<Student, 'name' | 'photo' | 'photoDriveUrl' | 'initials'> | null;
  name?: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  student,
  name,
  photoUrl,
  size = 'md',
  className = '',
}) => {
  const resolvedName = student?.name || name || 'Estudante';
  const resolvedPhoto = student?.photo || photoUrl || '';
  const [imgError, setImgError] = useState(false);

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

  if (hasValidPhoto) {
    return (
      <img
        src={resolvedPhoto}
        alt={resolvedName}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-full object-cover ring-[#003440]/25 shadow-2xs shrink-0 transition-transform duration-200 ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={`Iniciais de ${resolvedName}: ${initials}`}
      title={`${resolvedName} (Sem foto no Drive/Upload — exibindo 2 iniciais)`}
      className={`${sizeClasses} rounded-full bg-gradient-to-br from-[#c3e5f4] to-[#a4f3ca]/70 text-[#003440] font-black tracking-tight flex items-center justify-center ring-[#003440]/20 border border-white shadow-2xs shrink-0 select-none ${className}`}
    >
      {initials}
    </div>
  );
};
