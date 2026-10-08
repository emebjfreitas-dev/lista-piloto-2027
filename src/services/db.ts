import * as XLSX from 'xlsx';
import {
  ClassGroup,
  SchoolDay,
  AuthorizedUser,
  AttendanceWindowConfig,
  UserAccessSessionLog,
} from '../types';
import {
  INITIAL_CLASSES,
  OFFICIAL_OCTOBER_DAYS,
  MONTHLY_SCHOOL_DAYS_2027,
  INITIAL_AUTHORIZED_USERS,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import { getStudentAttendanceMetrics, getClassAttendanceMetrics } from '../utils/attendanceRules';

const STORAGE_KEY = 'emeb_candelario_sed_classes_2027_v6';
const USERS_STORAGE_KEY = 'emeb_candelario_authorized_users_2027_v3';
const ATTENDANCE_WINDOW_STORAGE_KEY = 'emeb_candelario_attendance_window_2027_v1';
const ACCESS_LOGS_STORAGE_KEY = 'emeb_candelario_access_session_logs_2027_v1';

// In-memory cache so even if browser localStorage quota is full, the app never loses runtime state or throws errors
let memoryCachedClasses: ClassGroup[] | null = null;
let memoryCachedUsers: AuthorizedUser[] | null = null;
let memoryCachedLogs: UserAccessSessionLog[] | null = null;

// Clean up obsolete legacy storage keys from earlier versions to free localStorage space
const purgeLegacyStorageKeys = (preserveKeys: string[]): void => {
  try {
    const keepSet = new Set([
      ...preserveKeys,
      STORAGE_KEY,
      USERS_STORAGE_KEY,
      ATTENDANCE_WINDOW_STORAGE_KEY,
      ACCESS_LOGS_STORAGE_KEY,
      'emeb_candelario_active_session_2027_v1',
      'emeb_candelario_linked_spreadsheet_id_2027',
      'emeb_candelario_linked_spreadsheet_title_2027',
      'emeb_candelario_drive_photos_folder_url_2027',
      'emeb_candelario_drive_photos_folder_id_2027',
      'emeb_candelario_drive_fichas_pdf_folder_url_2027',
      'emeb_candelario_drive_fichas_pdf_folder_id_2027',
    ]);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !keepSet.has(k) && (k.startsWith('emeb_') || k.includes('candelario'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore storage access issues
  }
};

const safeSetLocalStorage = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    purgeLegacyStorageKeys([key]);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
};

export const formatDurationHuman = (seconds?: number): string => {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s === 0) return '0s';
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  }
  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
};

export const getStoredAccessSessionLogs = (): UserAccessSessionLog[] => {
  if (memoryCachedLogs) return memoryCachedLogs;
  try {
    const raw = localStorage.getItem(ACCESS_LOGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryCachedLogs = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore storage read error
  }
  return [];
};

export const saveStoredAccessSessionLogs = (logs: UserAccessSessionLog[]): void => {
  const sliced = logs.slice(0, 200);
  memoryCachedLogs = sliced;
  safeSetLocalStorage(ACCESS_LOGS_STORAGE_KEY, JSON.stringify(sliced));
};

export const getStoredAttendanceWindowConfig = (): AttendanceWindowConfig => {
  try {
    const raw = localStorage.getItem(ATTENDANCE_WINDOW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.exceptionalOverrideOpen === 'boolean') {
        return parsed;
      }
    }
  } catch {
    // ignore storage read error
  }
  return {
    exceptionalOverrideOpen: false,
  };
};

export const saveStoredAttendanceWindowConfig = (
  config: AttendanceWindowConfig
): void => {
  safeSetLocalStorage(ATTENDANCE_WINDOW_STORAGE_KEY, JSON.stringify(config));
};

/**
 * Evaluates whether a given date (or current date) falls within the official monthly attendance launch window:
 * - Last school day (último dia letivo) of the month, OR
 * - First 2 school days (dois primeiros dias letivos) of the next month
 * OR if exceptional override is enabled in the Access Management tab.
 */
export const evaluateAttendanceLaunchWindow = (
  config: AttendanceWindowConfig,
  referenceDate?: Date
): {
  isWithinCalendarWindow: boolean;
  isAllowedToLaunch: boolean;
  reasonLabel: string;
  currentDateFormatted: string;
  windowRuleDescription: string;
} => {
  const dateObj = config.simulatedDateISO
    ? new Date(`${config.simulatedDateISO}T12:00:00`)
    : referenceDate || new Date();

  const currentDateFormatted = dateObj.toLocaleDateString('pt-BR');
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth(); // 0..11
  const dayOfMonth = dateObj.getDate();

  // Compute all weekday school days (Mon-Fri) in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const schoolDaysInMonth: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const dow = dt.getDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5) {
      schoolDaysInMonth.push(d);
    }
  }

  const firstTwoSchoolDays = schoolDaysInMonth.slice(0, 2);
  const lastSchoolDay =
    schoolDaysInMonth.length > 0
      ? schoolDaysInMonth[schoolDaysInMonth.length - 1]
      : daysInMonth;

  const isLastSchoolDayOfMonth = dayOfMonth === lastSchoolDay;
  const isFirstTwoSchoolDaysOfNextMonth = firstTwoSchoolDays.includes(dayOfMonth);
  const isWithinCalendarWindow =
    isLastSchoolDayOfMonth || isFirstTwoSchoolDaysOfNextMonth;

  const isAllowedToLaunch =
    isWithinCalendarWindow || config.exceptionalOverrideOpen;

  let reasonLabel = '';
  if (isLastSchoolDayOfMonth) {
    reasonLabel = `Aberto Automaticamente: Último Dia Letivo do Mês (${currentDateFormatted})`;
  } else if (isFirstTwoSchoolDaysOfNextMonth) {
    reasonLabel = `Aberto Automaticamente: 2 Primeiros Dias Letivos do Mês (${currentDateFormatted})`;
  } else if (config.exceptionalOverrideOpen) {
    reasonLabel = `Aberto Excepcionalmente pela Direção na Aba Acessos`;
  } else {
    reasonLabel = `Fechado Hoje (${currentDateFormatted}) — Abre no último dia letivo (dia ${String(
      lastSchoolDay
    ).padStart(2, '0')}) e nos 2 primeiros dias letivos do próximo mês`;
  }

  return {
    isWithinCalendarWindow,
    isAllowedToLaunch,
    reasonLabel,
    currentDateFormatted,
    windowRuleDescription:
      'Liberado apenas no último dia letivo do mês e nos 2 primeiros dias letivos do mês seguinte (ou abertura excepcional na aba Acessos).',
  };
};

// Validate institutional domain @educacao.jundiai.sp.gov.br (plus official school owner emebjfreitas@jundiai.sp.gov.br)
export const isValidInstitutionalEmail = (email: string): boolean => {
  const normalized = email.trim().toLowerCase();
  if (normalized === 'emebjfreitas@jundiai.sp.gov.br') {
    return true;
  }
  return (
    normalized.endsWith(INSTITUTIONAL_EMAIL_DOMAIN) &&
    normalized.length > INSTITUTIONAL_EMAIL_DOMAIN.length &&
    !normalized.includes(' ')
  );
};

export const getStoredAuthorizedUsers = (): AuthorizedUser[] => {
  if (memoryCachedUsers && memoryCachedUsers.length > 0) {
    return memoryCachedUsers;
  }
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = classesOrUsersSanitize(parsed);
        memoryCachedUsers = clean;
        return clean;
      }
    }
  } catch {
    // ignore read error
  }
  const initialClean = classesOrUsersSanitize(INITIAL_AUTHORIZED_USERS);
  memoryCachedUsers = initialClean;
  return initialClean;
};

export const saveStoredAuthorizedUsers = (users: AuthorizedUser[]): void => {
  const clean = classesOrUsersSanitize(users);
  memoryCachedUsers = clean;
  safeSetLocalStorage(USERS_STORAGE_KEY, JSON.stringify(clean));
};

const classesOrUsersSanitize = (users: AuthorizedUser[]): AuthorizedUser[] => {
  const validClassMap = new Map(
    INITIAL_CLASSES.map((c) => [c.id.toLowerCase(), c])
  );
  const officialByEmail = new Map(
    INITIAL_AUTHORIZED_USERS.map((u) => [u.email.trim().toLowerCase(), u])
  );
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();
  const uniqueUsers: AuthorizedUser[] = [];

  users.forEach((u, idx) => {
    if (!u || typeof u.email !== 'string') return;
    const cleanEmail = u.email.trim().toLowerCase();
    if (!cleanEmail || seenEmails.has(cleanEmail)) return;
    seenEmails.add(cleanEmail);

    const off = officialByEmail.get(cleanEmail);
    let cleanId = u.id || off?.id || `usr-official-${idx}`;
    if (seenIds.has(cleanId)) {
      cleanId = `${cleanId}-${cleanEmail.split('@')[0]}`;
    }
    seenIds.add(cleanId);
    uniqueUsers.push({
      ...off,
      ...u,
      id: cleanId,
      email: cleanEmail,
      pronoun: u.pronoun || off?.pronoun,
      firstName: u.firstName || off?.firstName,
      teacherRoleType: u.teacherRoleType || off?.teacherRoleType,
      subjectName: u.subjectName || off?.subjectName,
    });
  });

  return uniqueUsers.map((u) => {
    const cleanEmail = u.email.trim().toLowerCase();
    const off = officialByEmail.get(cleanEmail);
    if (u.role === 'usuario') {
      // Preserve multi-class assignments (assignedClassIds) if present!
      const rawIds: string[] =
        Array.isArray(u.assignedClassIds) && u.assignedClassIds.length > 0
          ? u.assignedClassIds.filter((id) => id && id !== 'all')
          : u.assignedClassId && u.assignedClassId !== 'all'
          ? [u.assignedClassId]
          : off?.assignedClassIds || [];

      const matchedClasses: ClassGroup[] = [];
      rawIds.forEach((id) => {
        const found = validClassMap.get(String(id).toLowerCase());
        if (found && !matchedClasses.some((m) => m.id === found.id)) {
          matchedClasses.push(found);
        }
      });

      if (matchedClasses.length === 0 && u.assignedClassName) {
        const parts = u.assignedClassName
          .split(/[+;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        parts.forEach((part) => {
          const found = INITIAL_CLASSES.find((c) =>
            part.toUpperCase().startsWith(c.name.toUpperCase())
          );
          if (found && !matchedClasses.some((m) => m.id === found.id)) {
            matchedClasses.push(found);
          }
        });
      }

      if (matchedClasses.length === 0) {
        matchedClasses.push(INITIAL_CLASSES[0]);
      }

      const finalIds = matchedClasses.map((c) => c.id);
      const finalNames = matchedClasses.map(
        (c) => `${c.name} (${c.shift.replace('Turno ', '')})`
      );

      return {
        ...u,
        email: cleanEmail,
        teacherRoleType: 'peb1',
        assignedClassId: finalIds[0],
        assignedClassName: finalNames.join(' + '),
        assignedClassIds: finalIds,
        assignedClassNames: finalNames,
      };
    }

    if (u.role === 'peb2') {
      const specIds =
        Array.isArray(u.assignedClassIds) &&
        u.assignedClassIds.length > 0 &&
        u.assignedClassIds[0] !== 'all'
          ? u.assignedClassIds
          : off?.assignedClassIds || ['all'];
      const specNames =
        Array.isArray(u.assignedClassNames) &&
        u.assignedClassNames.length > 0 &&
        !u.assignedClassNames[0].startsWith('Todas as')
          ? u.assignedClassNames
          : off?.assignedClassNames || ['Todas as Turmas (Somente Visualização)'];
      const subjectLabel = u.subjectName || off?.subjectName;

      return {
        ...u,
        email: cleanEmail,
        teacherRoleType: u.teacherRoleType || off?.teacherRoleType || 'arte',
        subjectName: subjectLabel,
        assignedClassId: 'all',
        assignedClassIds: specIds,
        assignedClassName:
          off?.assignedClassName ||
          (subjectLabel
            ? `${subjectLabel} • ${specIds.filter((i) => i !== 'all').length || 39} Turmas (Visualização)`
            : 'Todas as Turmas (Somente Visualização)'),
        assignedClassNames: specNames,
      };
    }

    return {
      ...u,
      email: cleanEmail,
      teacherRoleType: 'admin',
      assignedClassId: 'all',
      assignedClassIds: ['all'],
      assignedClassName: 'Todas as 39 Turmas (Acesso Pleno)',
      assignedClassNames: ['Todas as 39 Turmas (Acesso Pleno)'],
    };
  });
};

export const pushAuthorizedUsersToServer = async (
  users: AuthorizedUser[]
): Promise<AuthorizedUser[] | null> => {
  try {
    const sanitized = classesOrUsersSanitize(users);
    const res = await fetch('/api/school-state/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizedUsers: sanitized }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.authorizedUsers)) {
        const clean = classesOrUsersSanitize(data.authorizedUsers);
        memoryCachedUsers = clean;
        safeSetLocalStorage(USERS_STORAGE_KEY, JSON.stringify(clean));
        return clean;
      }
    }
  } catch {
    // ignore offline
  }
  return null;
};

export const pushSessionLogsToServer = async (
  logs: UserAccessSessionLog[],
  users?: AuthorizedUser[]
): Promise<void> => {
  try {
    await fetch('/api/school-state/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessSessionLogs: logs,
        ...(users ? { authorizedUsers: classesOrUsersSanitize(users) } : {}),
      }),
    });
  } catch {
    // ignore offline
  }
};

export const pushAttendanceWindowToServer = async (
  config: AttendanceWindowConfig
): Promise<void> => {
  try {
    await fetch('/api/school-state/window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceWindowConfig: config }),
    });
  } catch {
    // ignore offline
  }
};

export const pullSharedSchoolStateFromServer = async (): Promise<{
  authorizedUsers?: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  attendanceWindowConfig?: AttendanceWindowConfig;
} | null> => {
  try {
    const res = await fetch('/api/school-state', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const result: {
      authorizedUsers?: AuthorizedUser[];
      accessSessionLogs?: UserAccessSessionLog[];
      attendanceWindowConfig?: AttendanceWindowConfig;
    } = {};

    if (Array.isArray(data?.authorizedUsers) && data.authorizedUsers.length > 0) {
      const localUsers = getStoredAuthorizedUsers();
      const localMap = new Map(
        localUsers.map((u) => [u.email.trim().toLowerCase(), u])
      );
      const merged = data.authorizedUsers.map((srv: AuthorizedUser) => {
        const loc = localMap.get(srv.email.trim().toLowerCase());
        if (!loc) return srv;
        const srvTime = srv.updatedAtMs || 0;
        const locTime = loc.updatedAtMs || 0;
        const winner = srvTime >= locTime ? srv : loc;
        return {
          ...winner,
          updatedAtMs: Math.max(srvTime, locTime),
          totalAccessCount: Math.max(srv.totalAccessCount || 0, loc.totalAccessCount || 0),
          totalDurationSeconds: Math.max(
            srv.totalDurationSeconds || 0,
            loc.totalDurationSeconds || 0
          ),
          lastSessionDurationSeconds: Math.max(
            srv.lastSessionDurationSeconds || 0,
            loc.lastSessionDurationSeconds || 0
          ),
          lastLoginAt: srv.lastLoginAt || loc.lastLoginAt,
          lastActiveAt: srv.lastActiveAt || loc.lastActiveAt,
          lastScreenVisited: srv.lastScreenVisited || loc.lastScreenVisited,
        };
      });
      const sanitized = classesOrUsersSanitize(merged);
      memoryCachedUsers = sanitized;
      safeSetLocalStorage(USERS_STORAGE_KEY, JSON.stringify(sanitized));
      result.authorizedUsers = sanitized;
    }

    if (Array.isArray(data?.accessSessionLogs) && data.accessSessionLogs.length > 0) {
      const sliced = data.accessSessionLogs.slice(0, 200);
      memoryCachedLogs = sliced;
      safeSetLocalStorage(ACCESS_LOGS_STORAGE_KEY, JSON.stringify(sliced));
      result.accessSessionLogs = data.accessSessionLogs;
    }

    if (
      data?.attendanceWindowConfig &&
      typeof data.attendanceWindowConfig.exceptionalOverrideOpen === 'boolean'
    ) {
      safeSetLocalStorage(
        ATTENDANCE_WINDOW_STORAGE_KEY,
        JSON.stringify(data.attendanceWindowConfig)
      );
      result.attendanceWindowConfig = data.attendanceWindowConfig;
    }

    return result;
  } catch {
    return null;
  }
};

export const findAuthorizedUserByEmail = (
  email: string,
  usersList?: AuthorizedUser[]
): AuthorizedUser | undefined => {
  const normalized = email.trim().toLowerCase();
  const list = usersList || getStoredAuthorizedUsers();
  return list.find((u) => u.email.trim().toLowerCase() === normalized);
};

const enrichClassesWithOfficialMatrix = (classes: ClassGroup[]): ClassGroup[] => {
  const officialMap = new Map(INITIAL_CLASSES.map((c) => [c.id.toLowerCase(), c]));
  return classes.map((cls) => {
    const off = officialMap.get(cls.id.toLowerCase());
    const baseStudents = cls.students || off?.students || [];
    const enrichedStudents = baseStudents.map((st, idx) => {
      const num = st.number || idx + 1;
      const defaultNis =
        st.nis !== undefined
          ? st.nis
          : num % 3 === 0 || num === 2 || num === 7 || num === 11
          ? `207.${41000 + num * 17}.${80 + (num % 19)}-${num % 9}`
          : '';
      const defaultRota =
        st.rotaOnibus !== undefined
          ? st.rotaOnibus
          : num % 4 === 0 || num === 1 || num === 7 || num === 9 || num === 11
          ? num % 2 === 0
            ? 'ROTA 01 - RESIDENCIAL TERRA DA UVA / SANTOS DUMONT'
            : 'ROTA 02 - JARDIM BÚFALO / CIDADE LUIZA / VILA HORTOLÂNDIA'
          : '';
      return {
        ...st,
        nis: defaultNis || undefined,
        rotaOnibus: defaultRota || undefined,
      };
    });
    if (!off) {
      return {
        ...cls,
        students: enrichedStudents,
      };
    }
    return {
      ...off,
      ...cls,
      students: enrichedStudents,
      turmaAbrev: cls.turmaAbrev || off.turmaAbrev,
      teacherName: cls.teacherName || off.teacherName,
      teacherEmail: cls.teacherEmail || off.teacherEmail,
      pronoun: cls.pronoun || off.pronoun,
      teacherFirstName: cls.teacherFirstName || off.teacherFirstName,
      sedClassName: cls.sedClassName || off.sedClassName,
      sedExpectedStudents: cls.sedExpectedStudents ?? off.sedExpectedStudents,
      classeSedCode: cls.classeSedCode || off.classeSedCode,
      artTeacher: cls.artTeacher || off.artTeacher,
      peTeacher: cls.peTeacher || off.peTeacher,
      englishTeacher: cls.englishTeacher || off.englishTeacher,
      room: cls.room || off.room,
      shift: cls.shift || off.shift,
    };
  });
};

// Load classes from localStorage or fallback to defaults
export const getStoredClasses = (): ClassGroup[] => {
  if (memoryCachedClasses && memoryCachedClasses.length > 0) {
    return memoryCachedClasses;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.name?.startsWith('GRUPO')) {
        const enriched = enrichClassesWithOfficialMatrix(parsed);
        memoryCachedClasses = enriched;
        return enriched;
      }
    }
  } catch {
    // ignore storage read error
  }
  memoryCachedClasses = INITIAL_CLASSES;
  return INITIAL_CLASSES;
};

// Save classes to localStorage safely without throwing QuotaExceededError
export const saveStoredClasses = (classes: ClassGroup[]): void => {
  const enriched = enrichClassesWithOfficialMatrix(classes);
  memoryCachedClasses = enriched;
  try {
    const serialized = JSON.stringify(enriched);
    if (safeSetLocalStorage(STORAGE_KEY, serialized)) {
      return;
    }

    // If still exceeding quota (e.g., large base64 photos or strict 2.5MB iframe quota), strip heavy inline data URLs before persisting to localStorage
    const compactClasses: ClassGroup[] = enriched.map((cls) => ({
      ...cls,
      students: cls.students.map((st) => ({
        ...st,
        photo:
          st.photo && st.photo.startsWith('data:image') && st.photo.length > 15000
            ? st.photoDriveUrl || ''
            : st.photo,
      })),
    }));
    if (safeSetLocalStorage(STORAGE_KEY, JSON.stringify(compactClasses))) {
      return;
    }

    // Final ultra-compact fallback: trim older session logs in localStorage to make room for class attendance data
    try {
      localStorage.removeItem(ACCESS_LOGS_STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compactClasses));
    } catch {
      // Kept in memoryCachedClasses so app continues working seamlessly
    }
  } catch {
    // Kept in memoryCachedClasses so app continues working seamlessly
  }
};

// Reset database to initial classes
export const resetDatabase = (): ClassGroup[] => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error(e);
  }
  memoryCachedClasses = INITIAL_CLASSES;
  return INITIAL_CLASSES;
};

export const exportOfficialMatrixToXLS = (
  classes: ClassGroup[],
  authorizedUsers: AuthorizedUser[]
): void => {
  const wb = XLSX.utils.book_new();
  const matrixRows = classes.map((cls) => {
    const activeCount = cls.students.filter((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN') && !sit.includes('RM');
    }).length;
    const transfCount = cls.students.filter((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      return sit.includes('BXTR') || sit.includes('TRANSF');
    }).length;
    const remanCount = cls.students.filter((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      return sit.includes('REMAN') || sit.includes('RM');
    }).length;
    const regenteUser = authorizedUsers.find(
      (u) =>
        u.role === 'usuario' &&
        ((u.assignedClassIds && u.assignedClassIds.includes(cls.id)) ||
          u.assignedClassId === cls.id)
    );
    const periodo = cls.shift.toUpperCase().includes('TARDE') ? 'TARDE' : 'MANHÃ';

    return {
      'TURMA ABREV': cls.turmaAbrev || cls.id.toUpperCase(),
      'PROFESSOR(A)': regenteUser?.name || cls.teacherName || '',
      'E-MAIL INSTITUCIONAL REGENTE': regenteUser?.email || cls.teacherEmail || '',
      'TURMA': cls.name,
      'SALA DE AULA': cls.room,
      'PERÍODO': periodo,
      'TURMA SED': cls.sedClassName || '',
      'QTD SED': cls.sedExpectedStudents ?? cls.students.length,
      'QTD ATIVOS REAIS': activeCount,
      'TRANSFERIDOS (BXTR)': transfCount,
      'REMANEJADOS': remanCount,
      'CLASSE SED': cls.classeSedCode || '',
      'PRONOME TRAT': regenteUser?.pronoun || cls.pronoun || 'PROFESSORA',
      'PRINOME': regenteUser?.firstName || cls.teacherFirstName || '',
      'ARTE': cls.artTeacher || '',
      'E-MAIL ARTE': cls.artTeacherEmail || '',
      'EDUCAÇÃO FÍSICA': cls.peTeacher || '',
      'E-MAIL EDUCAÇÃO FÍSICA': cls.peTeacherEmail || '',
      'LÍNGUA INGLESA': cls.englishTeacher || '',
      'E-MAIL LÍNGUA INGLESA': cls.englishTeacherEmail || '',
    };
  });

  const wsMatrix = XLSX.utils.json_to_sheet(matrixRows);
  wsMatrix['!cols'] = [
    { wch: 13 },
    { wch: 36 },
    { wch: 40 },
    { wch: 15 },
    { wch: 20 },
    { wch: 11 },
    { wch: 36 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 15 },
    { wch: 18 },
    { wch: 30 },
    { wch: 38 },
    { wch: 40 },
    { wch: 38 },
    { wch: 30 },
    { wch: 38 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'QUADRO TURMAS E PROFESSORES');

  const accessRows = authorizedUsers.map((u, idx) => ({
    'ORDEM': idx + 1,
    'NOME DO(A) SERVIDOR(A)': u.name,
    'PRONOME': u.pronoun || '',
    'PRINOME': u.firstName || '',
    'E-MAIL INSTITUCIONAL': u.email,
    'PERFIL / FUNÇÃO':
      u.role === 'admin'
        ? 'ADMINISTRADOR (Acesso Pleno)'
        : u.role === 'usuario'
        ? 'PROFESSOR(A) REGENTE PEB I'
        : `ESPECIALISTA PEB II (${u.subjectName || 'Arte / Ed. Física / Inglês'})`,
    'TURMAS VINCULADAS':
      u.assignedClassNames && u.assignedClassNames.length > 0
        ? u.assignedClassNames.join(' + ')
        : u.assignedClassName,
    'STATUS': u.active ? 'ATIVO' : 'BLOQUEADO',
    'ACESSOS TOTAIS': u.totalAccessCount || 0,
    'TEMPO CONECTADO': formatDurationHuman(u.totalDurationSeconds || 0),
    'ÚLTIMO ACESSO': u.lastLoginAt || 'Ainda não acessou',
  }));
  const wsAccess = XLSX.utils.json_to_sheet(accessRows);
  wsAccess['!cols'] = [
    { wch: 8 },
    { wch: 38 },
    { wch: 14 },
    { wch: 18 },
    { wch: 42 },
    { wch: 38 },
    { wch: 48 },
    { wch: 12 },
    { wch: 15 },
    { wch: 18 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAccess, 'ACESSOS E EMAILS');

  XLSX.writeFile(wb, 'Quadro_Oficial_Turmas_Professores_Acessos_EMEB_Candelario_2027.xls', {
    bookType: 'biff8',
  });
};

const isEducacaoInfantilClass = (cls: ClassGroup): boolean => {
  return (
    cls.name.toUpperCase().startsWith('GRUPO') ||
    cls.grade.toUpperCase().includes('INFANTIL')
  );
};

// Helper to build detailed nominal rows for a specific education stage (Educação Infantil or Ensino Fundamental)
const buildNominalAttendanceRowsForStage = (
  classes: ClassGroup[],
  stage: 'EDUCACAO INFANTIL' | 'ENSINO FUNDAMENTAL',
  calendar: SchoolDay[]
): any[] => {
  const stageClasses = classes.filter((cls) =>
    stage === 'EDUCACAO INFANTIL'
      ? isEducacaoInfantilClass(cls)
      : !isEducacaoInfantilClass(cls)
  );

  const rows: any[] = [];
  let totalDiasRecorte = 0;
  let totalPresencas = 0;
  let totalFaltas = 0;
  let totalAtestados = 0;
  let totalSemAtestado = 0;
  let totalEstudantes = 0;

  stageClasses.forEach((cls) => {
    const diasLetivosMes = cls.classesHeld || 20;
    const turnoLabel = cls.shift.replace('Turno ', '').toUpperCase();

    cls.students.forEach((s) => {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      const faltasSemAtestado = Math.max(0, m.faltas - m.atestados);
      const percentFaltas =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
          : 0;
      const percentAtestadosSobreFaltas =
        m.faltas > 0 ? Math.round((m.atestados / m.faltas) * 100) : 0;
      const percentAtestadosSobreDias =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.atestados / m.diasLetivosMatriculados) * 100)
          : 0;

      totalEstudantes += 1;
      totalDiasRecorte += m.diasLetivosMatriculados;
      totalPresencas += m.presencas;
      totalFaltas += m.faltas;
      totalAtestados += m.atestados;
      totalSemAtestado += faltasSemAtestado;

      rows.push({
        'SEGMENTO DE ENSINO': stage,
        'ETAPA / SÉRIE': cls.grade,
        'TURMA': cls.name,
        'TURNO': turnoLabel,
        'SALA': cls.room,
        'Nº CHAMADA': s.number,
        'NOME NOMINAL DO(A) ESTUDANTE': s.name,
        'RA': s.ra ? `${s.ra}-${s.digRa || ''}/${s.ufRa || 'SP'}` : '',
        'DATA DE MATRÍCULA (SED)': s.dataMatriculaSed || '03/02/2027',
        'DATA DE MOVIMENTAÇÃO': s.dataMovimentacao || '',
        'SITUAÇÃO DO RECORTE': m.recorteLabel,
        'QTD DIAS LETIVOS DO MÊS': m.diasLetivosMes,
        'QTD DIAS NO RECORTE DA MATRÍCULA': m.diasLetivosMatriculados,
        'QTD PRESENÇAS NO PERÍODO': m.presencas,
        '% PRESENÇA (FREQUÊNCIA)': `${m.frequenciaPercent}%`,
        'QTD TOTAL DE FALTAS NO MÊS': m.faltas,
        '% FALTAS SOBRE DIAS MATRICULADOS': `${percentFaltas}%`,
        'QTD ATESTADOS APRESENTADOS (FALTAS JUSTIFICADAS)': m.atestados,
        '% ATESTADOS SOBRE O TOTAL DE FALTAS': `${percentAtestadosSobreFaltas}%`,
        '% ATESTADOS SOBRE DIAS MATRICULADOS': `${percentAtestadosSobreDias}%`,
        'QTD FALTAS NÃO JUSTIFICADAS (SEM ATESTADO)': faltasSemAtestado,
        'STATUS DE FREQUÊNCIA':
          m.faltas >= 4
            ? 'ALERTA DE INFREQUÊNCIA'
            : m.frequenciaPercent === 100
            ? '100% PRESENÇA'
            : 'REGULAR',
        'OBSERVAÇÕES / DETALHE DO ATESTADO': s.notes || '',
        'FILIAÇÃO 1 (NOME DA MÃE)': s.filiacao1 || s.guardianName || '',
        'FILIAÇÃO 2 (NOME DO PAI)': s.filiacao2 || '',
        'TELEFONE DE CONTATO': s.telefones || s.guardianPhone || '',
        'E-MAIL INSTITUCIONAL': s.emailMunicipal || '',
      });
    });
  });

  // Add consolidated summary row at the bottom of the nominal sheet
  if (totalEstudantes > 0) {
    const mediaPresenca =
      totalDiasRecorte > 0 ? Math.round((totalPresencas / totalDiasRecorte) * 100) : 100;
    const mediaFaltas =
      totalDiasRecorte > 0 ? Math.round((totalFaltas / totalDiasRecorte) * 100) : 0;
    const mediaAtestadosSobreFaltas =
      totalFaltas > 0 ? Math.round((totalAtestados / totalFaltas) * 100) : 0;
    const mediaAtestadosSobreDias =
      totalDiasRecorte > 0 ? Math.round((totalAtestados / totalDiasRecorte) * 100) : 0;

    rows.push({
      'SEGMENTO DE ENSINO': `TOTAL CONSOLIDADO — ${stage}`,
      'ETAPA / SÉRIE': `${stageClasses.length} TURMAS`,
      'TURMA': 'TODAS',
      'TURNO': 'MANHÃ + TARDE',
      'SALA': '—',
      'Nº CHAMADA': totalEstudantes,
      'NOME NOMINAL DO(A) ESTUDANTE': `TOTAL: ${totalEstudantes} ESTUDANTES TABULADOS`,
      'RA': '—',
      'DATA DE MATRÍCULA (SED)': '—',
      'DATA DE MOVIMENTAÇÃO': '—',
      'SITUAÇÃO DO RECORTE': 'SOMA DO SEGMENTO',
      'QTD DIAS LETIVOS DO MÊS': 20,
      'QTD DIAS NO RECORTE DA MATRÍCULA': totalDiasRecorte,
      'QTD PRESENÇAS NO PERÍODO': totalPresencas,
      '% PRESENÇA (FREQUÊNCIA)': `${mediaPresenca}%`,
      'QTD TOTAL DE FALTAS NO MÊS': totalFaltas,
      '% FALTAS SOBRE DIAS MATRICULADOS': `${mediaFaltas}%`,
      'QTD ATESTADOS APRESENTADOS (FALTAS JUSTIFICADAS)': totalAtestados,
      '% ATESTADOS SOBRE O TOTAL DE FALTAS': `${mediaAtestadosSobreFaltas}%`,
      '% ATESTADOS SOBRE DIAS MATRICULADOS': `${mediaAtestadosSobreDias}%`,
      'QTD FALTAS NÃO JUSTIFICADAS (SEM ATESTADO)': totalSemAtestado,
      'STATUS DE FREQUÊNCIA': `FREQUÊNCIA MÉDIA: ${mediaPresenca}%`,
      'OBSERVAÇÕES / DETALHE DO ATESTADO': '—',
      'FILIAÇÃO 1 (NOME DA MÃE)': '—',
      'FILIAÇÃO 2 (NOME DO PAI)': '—',
      'TELEFONE DE CONTATO': '—',
      'E-MAIL INSTITUCIONAL': '—',
    });
  }

  return rows;
};

// Generate and trigger download of a real Excel/Google Sheets (.xlsx) workbook with SED modeling & nominal tabs separated by Educação Infantil and Ensino Fundamental
export const downloadSpreadsheetXLSX = (
  classes: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): void => {
  const wb = XLSX.utils.book_new();

  // Tab 1: Faltas e Atestados Nominais — EDUCAÇÃO INFANTIL (G4 e G5 separados, quantidade e porcentagem)
  const rowsNominalInfantil = buildNominalAttendanceRowsForStage(
    classes,
    'EDUCACAO INFANTIL',
    calendar
  );
  const wsInfantil = XLSX.utils.json_to_sheet(rowsNominalInfantil);
  XLSX.utils.book_append_sheet(wb, wsInfantil, 'Faltas_Atestados_Infantil');

  // Tab 2: Faltas e Atestados Nominais — ENSINO FUNDAMENTAL (1º ao 5º Ano separados, quantidade e porcentagem)
  const rowsNominalFundamental = buildNominalAttendanceRowsForStage(
    classes,
    'ENSINO FUNDAMENTAL',
    calendar
  );
  const wsFundamental = XLSX.utils.json_to_sheet(rowsNominalFundamental);
  XLSX.utils.book_append_sheet(wb, wsFundamental, 'Faltas_Atestados_Fundamental');

  // Tab 3: Matrículas e Frequência SED 2027 (Com todas as 48 colunas SED + Recorte da Matrícula e Frequência)
  const rowsSedFrequencia: any[] = [];
  classes.forEach((cls) => {
    const diasLetivosMes = cls.classesHeld || 20;
    cls.students.forEach((s) => {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      const faltasSemAtestado = Math.max(0, m.faltas - m.atestados);
      const percentFaltas =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
          : 0;
      const percentAtestados =
        m.faltas > 0 ? Math.round((m.atestados / m.faltas) * 100) : 0;

      rowsSedFrequencia.push({
        'TIPO DE ENSINO': s.tipoEnsino || (cls.name.startsWith('GRUPO') ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL'),
        'SÉRIE': s.serie || (cls.name.includes('04') ? '1' : cls.name.includes('05') ? '2' : cls.name[0]),
        'Nº CHAMADA': s.numeroChamada || s.number,
        'ESTUDANTE': s.estudante || s.name,
        'RA': s.ra || '',
        'DIG. RA': s.digRa || '',
        'UF RA': s.ufRa || 'SP',
        'DATA DE NASCIMENTO': s.dataNascimento || '',
        'TIPO ALOCAÇÃO': s.tipoAlocacao || '',
        'SITUAÇÃO': s.situacao || (m.faltas >= 4 ? 'ALERTA INFREQUÊNCIA' : 'ATIVO'),
        'DATA MOVIMENTAÇÃO': s.dataMovimentacao || '',
        'CATEGORIA PROFISSIONAL CENSO': s.categoriaProfissionalCenso || '',
        'DEFICIÊNCIA': s.deficiencia || '',
        'PÓS DATA CENSO': s.posDataCenso || '',
        'TURMA': s.turma || cls.name,
        'PERÍODO': s.periodo || (cls.shift === 'Turno Manhã' ? 'MANHÃ' : 'TARDE'),
        'DATA DE MATRÍCULA (SED)': s.dataMatriculaSed || '03/02/2027',
        'PROCEDÊNCIA ESCOLAR': s.procedenciaEscolar || '',
        'IRMÃOS': s.irmaos || '',
        'IDADE': s.idade || '',
        'ARQUIVO': s.arquivo || '',
        'FILIAÇÃO 1': s.filiacao1 || s.guardianName || '',
        'FILIAÇÃO 2': s.filiacao2 || '',
        'NOME SOCIAL': s.nomeSocial || '',
        'GÊNERO': s.genero || '',
        'TIPO SANGUÍNEO': s.tipoSanguineo || '',
        'RAÇA/COR': s.racaCor || '',
        'NACIONALIDADE': s.nacionalidade || 'BRASILEIRA',
        'PAÍS DE ORIGEM': s.paisOrigem || '',
        'MUNICÍPIO DE NASCIMENTO': s.municipioNascimento || 'JUNDIAI - SP',
        'CPF': s.cpf || '',
        'RG': s.rg || '',
        'DATA EMISSÃO RG': s.dataEmissaoRg || '',
        'CARTÃO SUS': s.cartaoSus || '',
        'NIS': s.nis || '',
        'CEP': s.cep || '13.214-000',
        'LOGRADOURO': s.logradouro || '',
        'N. RESIDENCIA': s.numeroResidencia || '',
        'COMPLEMENTO': s.complemento || '',
        'BAIRRO': s.bairro || '',
        'CIDADE': s.cidade || 'JUNDIAI',
        'UF': s.uf || 'SP',
        'TELEFONES': s.telefones || s.guardianPhone || '',
        'E-MAIL GOOGLE': s.emailGoogle || '',
        'E-MAIL MICROSOFT': s.emailMicrosoft || '',
        'EMAIL MUNICIPAL': s.emailMunicipal || '',
        'ROTA DE ÔNIBUS': s.rotaOnibus || '',
        'SUCESSÃO ESCOLAR': s.sucessaoEscolar || '',
        // Colunas de Controle de Frequência pelo Recorte da Matrícula no Mês
        'DIAS LETIVOS DO MÊS': m.diasLetivosMes,
        'DIAS LETIVOS NO RECORTE DA MATRÍCULA': m.diasLetivosMatriculados,
        'DETALHE DO RECORTE': m.recorteLabel,
        'QTD FALTAS NO MÊS': m.faltas,
        '% FALTAS NO RECORTE': `${percentFaltas}%`,
        'QTD ATESTADOS APRESENTADOS': m.atestados,
        '% ATESTADOS SOBRE FALTAS': `${percentAtestados}%`,
        'QTD FALTAS SEM ATESTADO': faltasSemAtestado,
        'QTD PRESENÇAS NO PERÍODO': m.presencas,
        '% FREQUÊNCIA NO RECORTE': `${m.frequenciaPercent}%`,
        'ATESTADO / ANOTAÇÕES': s.notes || '',
      });
    });
  });

  const wsSed = XLSX.utils.json_to_sheet(rowsSedFrequencia);
  XLSX.utils.book_append_sheet(wb, wsSed, 'SED_Matrículas_e_Frequência');

  // Tab 4: Dias Letivos por Mês e Calendário SME Jundiaí 2027
  const rowsCalendario = calendar.map((d) => ({
    'Data': d.date,
    'Dia da Semana': d.dayOfWeek,
    'Mês': d.month,
    'Ano': 2027,
    'Tipo':
      d.type === 'dia_letivo'
        ? 'Dia Letivo'
        : d.type === 'feriado'
        ? 'Feriado'
        : d.type === 'sabado_letivo'
        ? 'Sábado Letivo'
        : d.type === 'planejamento'
        ? 'Planejamento'
        : 'Recesso',
    'Descrição Oficial': d.description,
  }));
  const wsCalendario = XLSX.utils.json_to_sheet(rowsCalendario);
  XLSX.utils.book_append_sheet(wb, wsCalendario, 'Dias_Letivos_SME_2027');

  // Tab 5: Dias Letivos por Turma e Mês (Configuração Mensal do Administrador 2027)
  const rowsMesesPorTurma = classes.map((c) => {
    const row: Record<string, any> = {
      'Segmento': isEducacaoInfantilClass(c) ? 'EDUCAÇÃO INFANTIL' : 'ENSINO FUNDAMENTAL',
      'Turma': c.name,
      'Turno': c.shift,
      'Etapa / Ano': c.grade,
    };
    let somaAnual = 0;
    MONTHLY_SCHOOL_DAYS_2027.forEach((m) => {
      const days =
        c.monthlySchoolDays && typeof c.monthlySchoolDays[m.month] === 'number'
          ? c.monthlySchoolDays[m.month]
          : m.schoolDays;
      row[m.month] = days;
      somaAnual += days;
    });
    row['TOTAL ANUAL DE DIAS LETIVOS'] = somaAnual;
    return row;
  });
  const wsMeses = XLSX.utils.json_to_sheet(rowsMesesPorTurma);
  XLSX.utils.book_append_sheet(wb, wsMeses, 'Dias_Letivos_Turma_Mês');

  // Tab 6: Resumo das 40 Turmas (Ano 2027)
  const rowsTurmas = classes.map((c) => {
    const cm = getClassAttendanceMetrics(c, calendar);
    const percentFaltasTurma =
      cm.totalDiasMatriculadosTurma > 0
        ? Math.round((cm.totalFaltasTurma / cm.totalDiasMatriculadosTurma) * 100)
        : 0;
    const percentAtestadosTurma =
      cm.totalFaltasTurma > 0
        ? Math.round((cm.totalAtestadosTurma / cm.totalFaltasTurma) * 100)
        : 0;

    return {
      'Segmento': isEducacaoInfantilClass(c) ? 'EDUCAÇÃO INFANTIL' : 'ENSINO FUNDAMENTAL',
      'Turma': c.name,
      'Turno': c.shift,
      'Etapa / Ano': c.grade,
      'Sala': c.room,
      'Total de Estudantes': c.totalStudents,
      'Dias Letivos do Mês': cm.diasLetivosMes,
      'Soma Dias Letivos (Recorte Matrículas)': cm.totalDiasMatriculadosTurma,
      'Qtd Presenças Acumuladas': cm.totalPresencasTurma,
      '% Presença Média (Recorte)': `${cm.presenceRate}%`,
      'Qtd Faltas Acumuladas': cm.totalFaltasTurma,
      '% Faltas da Turma': `${percentFaltasTurma}%`,
      'Qtd Atestados Apresentados': cm.totalAtestadosTurma,
      '% Atestados sobre Faltas': `${percentAtestadosTurma}%`,
      'Status Fechamento': c.isPending ? 'Pendente' : 'Concluído',
    };
  });
  const wsTurmas = XLSX.utils.json_to_sheet(rowsTurmas);
  XLSX.utils.book_append_sheet(wb, wsTurmas, 'Turmas_Salas_2027');

  // ABA 6: USUÁRIOS CADASTRADOS (@educacao.jundiai.sp.gov.br)
  const authorizedUsers = getStoredAuthorizedUsers();
  const rowsUsuarios = authorizedUsers.map((u, idx) => ({
    'Nº': idx + 1,
    'E-MAIL INSTITUCIONAL (@educacao.jundiai.sp.gov.br)': u.email,
    'NOME DO SERVIDOR / DOCENTE': u.name,
    'NÍVEL DE ACESSO CONCEDIDO':
      u.role === 'admin'
        ? 'ADMIN (Acesso Pleno)'
        : u.role === 'usuario'
        ? 'PROFESSOR PEB I (Acesso Limitado à Turma)'
        : 'PROFESSOR PEB II (Somente Visualização)',
    'TURMA VINCULADA': u.assignedClassName,
    'STATUS DO ACESSO': u.active ? 'ATIVO / LIBERADO' : 'BLOQUEADO / SUSPENSO',
    'DATA DE CADASTRO': u.createdAt,
    'TOTAL DE ACESSOS': u.totalAccessCount || 0,
    'TEMPO TOTAL CONECTADO': formatDurationHuman(u.totalDurationSeconds),
    'TEMPO ÚLTIMA SESSÃO': formatDurationHuman(u.lastSessionDurationSeconds),
    'ÚLTIMO LOGIN': u.lastLoginAt || 'Nunca acessou',
    'ÚLTIMA ATIVIDADE': u.lastActiveAt || '—',
  }));
  const wsUsuarios = XLSX.utils.json_to_sheet(rowsUsuarios);
  XLSX.utils.book_append_sheet(wb, wsUsuarios, 'Usuarios_Autorizados_2027');

  // ABA 7: HISTÓRICO DE ACESSOS E TEMPO CONECTADO POR SESSÃO
  const sessionLogs = getStoredAccessSessionLogs();
  const rowsLogs = sessionLogs.map((log, idx) => ({
    'Nº SESSÃO': idx + 1,
    'E-MAIL INSTITUCIONAL': log.email,
    'NOME DO EDUCADOR / SERVIDOR': log.name,
    'PERFIL':
      log.role === 'admin'
        ? 'ADMIN'
        : log.role === 'usuario'
        ? 'PEB I'
        : 'PEB II',
    'TURMA VINCULADA': log.assignedClassName,
    'ENTRADA (DATA / HORA)': new Date(log.loginTimeISO).toLocaleString('pt-BR'),
    'ÚLTIMO PULSO / SAÍDA': new Date(
      log.logoutTimeISO || log.lastHeartbeatISO
    ).toLocaleString('pt-BR'),
    'TEMPO DE ACESSO (FORMATADO)': formatDurationHuman(log.durationSeconds),
    'TEMPO DE ACESSO (SEGUNDOS)': log.durationSeconds,
    'TELA VISITADA': log.lastScreen || 'Turmas',
    'STATUS SESSÃO': log.logoutTimeISO ? 'Encerrada' : 'Ativa / Recente',
  }));
  if (rowsLogs.length > 0) {
    const wsLogs = XLSX.utils.json_to_sheet(rowsLogs);
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Monitoramento_Acessos_2027');
  }

  // Generate binary and trigger download
  XLSX.writeFile(wb, 'Planilha_Oficial_SED_EMEB_Candelario_Freitas_2027.xlsx');
};

export type ClassExportCategory =
  | 'Identificação & Matrícula'
  | 'Filiação (Mãe e Pai) & Contatos'
  | 'Frequência, Presença & Faltas'
  | 'Documentos, Saúde & AEE'
  | 'Endereço & Transporte'
  | 'Outros Campos SED';

export interface ClassExportColumnDef {
  id: string;
  label: string;
  shortLabel: string;
  category: ClassExportCategory;
  width?: number;
  getValue: (s: Student, cls: ClassGroup, calendar: SchoolDay[]) => string | number;
}

export const CLASS_EXPORT_COLUMNS: ClassExportColumnDef[] = [
  // 1. Identificação & Matrícula
  {
    id: 'numeroChamada',
    label: 'Nº CHAMADA',
    shortLabel: 'Nº Chamada',
    category: 'Identificação & Matrícula',
    width: 12,
    getValue: (s) => s.numeroChamada || s.number,
  },
  {
    id: 'estudante',
    label: 'ESTUDANTE',
    shortLabel: 'Nome do Estudante',
    category: 'Identificação & Matrícula',
    width: 34,
    getValue: (s) => s.estudante || s.name,
  },
  {
    id: 'raCompleto',
    label: 'RA COMPLETO',
    shortLabel: 'RA Completo (RA-Dig/UF)',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => (s.ra ? `${s.ra}-${s.digRa || ''}/${s.ufRa || 'SP'}` : ''),
  },
  {
    id: 'ra',
    label: 'RA',
    shortLabel: 'RA (Número)',
    category: 'Identificação & Matrícula',
    width: 15,
    getValue: (s) => s.ra || '',
  },
  {
    id: 'digRa',
    label: 'DIG. RA',
    shortLabel: 'Dígito RA',
    category: 'Identificação & Matrícula',
    width: 10,
    getValue: (s) => s.digRa || '',
  },
  {
    id: 'ufRa',
    label: 'UF RA',
    shortLabel: 'UF do RA',
    category: 'Identificação & Matrícula',
    width: 10,
    getValue: (s) => s.ufRa || 'SP',
  },
  {
    id: 'dataNascimento',
    label: 'DATA DE NASCIMENTO',
    shortLabel: 'Data de Nascimento',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => s.dataNascimento || '',
  },
  {
    id: 'idade',
    label: 'IDADE',
    shortLabel: 'Idade',
    category: 'Identificação & Matrícula',
    width: 10,
    getValue: (s) => s.idade || '',
  },
  {
    id: 'genero',
    label: 'GÊNERO',
    shortLabel: 'Gênero (Fem./Masc.)',
    category: 'Identificação & Matrícula',
    width: 14,
    getValue: (s) => s.genero || '',
  },
  {
    id: 'situacao',
    label: 'SITUAÇÃO',
    shortLabel: 'Situação (Ativo/Transf./Reman.)',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => s.situacao || 'ATIVO',
  },
  {
    id: 'dataMatriculaSed',
    label: 'DATA DE MATRÍCULA (SED)',
    shortLabel: 'Data Matrícula SED',
    category: 'Identificação & Matrícula',
    width: 20,
    getValue: (s) => s.dataMatriculaSed || '03/02/2027',
  },
  {
    id: 'dataMovimentacao',
    label: 'DATA MOVIMENTAÇÃO',
    shortLabel: 'Data Movimentação',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => s.dataMovimentacao || '',
  },
  {
    id: 'turma',
    label: 'TURMA',
    shortLabel: 'Turma',
    category: 'Identificação & Matrícula',
    width: 16,
    getValue: (s, cls) => s.turma || cls.name,
  },
  {
    id: 'periodo',
    label: 'PERÍODO',
    shortLabel: 'Período / Turno',
    category: 'Identificação & Matrícula',
    width: 14,
    getValue: (s, cls) => s.periodo || (cls.shift === 'Turno Manhã' ? 'MANHÃ' : 'TARDE'),
  },
  {
    id: 'serie',
    label: 'SÉRIE',
    shortLabel: 'Série / Etapa',
    category: 'Identificação & Matrícula',
    width: 14,
    getValue: (s, cls) =>
      s.serie || (cls.name.includes('04') ? '1' : cls.name.includes('05') ? '2' : cls.name[0]),
  },
  {
    id: 'tipoEnsino',
    label: 'TIPO DE ENSINO',
    shortLabel: 'Tipo de Ensino',
    category: 'Identificação & Matrícula',
    width: 22,
    getValue: (s, cls) =>
      s.tipoEnsino ||
      (cls.name.startsWith('GRUPO') ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL'),
  },

  // 2. Filiação (Mãe e Pai) & Contatos
  {
    id: 'filiacao1',
    label: 'FILIAÇÃO 1',
    shortLabel: 'Filiação 1 (Nome da Mãe)',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 32,
    getValue: (s) => s.filiacao1 || s.guardianName || '',
  },
  {
    id: 'filiacao2',
    label: 'FILIAÇÃO 2',
    shortLabel: 'Filiação 2 (Nome do Pai)',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 32,
    getValue: (s) => s.filiacao2 || '',
  },
  {
    id: 'telefones',
    label: 'TELEFONES',
    shortLabel: 'Telefones de Contato',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 26,
    getValue: (s) => s.telefones || s.guardianPhone || '',
  },
  {
    id: 'emailMunicipal',
    label: 'EMAIL MUNICIPAL',
    shortLabel: 'E-mail Institucional (@educacao)',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 34,
    getValue: (s) => s.emailMunicipal || '',
  },
  {
    id: 'emailGoogle',
    label: 'E-MAIL GOOGLE',
    shortLabel: 'E-mail Google',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 30,
    getValue: (s) => s.emailGoogle || '',
  },
  {
    id: 'emailMicrosoft',
    label: 'E-MAIL MICROSOFT',
    shortLabel: 'E-mail Microsoft',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 30,
    getValue: (s) => s.emailMicrosoft || '',
  },
  {
    id: 'irmaos',
    label: 'IRMÃOS',
    shortLabel: 'Irmãos na Escola',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 16,
    getValue: (s) => s.irmaos || '',
  },

  // 3. Frequência, Presença & Faltas
  {
    id: 'presencasQtd',
    label: 'PRESENÇA TOTAL (DIAS)',
    shortLabel: 'Presença Total (Dias)',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).presencas,
  },
  {
    id: 'presencaPercent',
    label: '% PRESENÇA TOTAL',
    shortLabel: '% Presença Total',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) =>
      `${getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).frequenciaPercent}%`,
  },
  {
    id: 'faltasQtd',
    label: 'FALTA TOTAL (QTD)',
    shortLabel: 'Falta Total (Qtd)',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).faltas,
  },
  {
    id: 'faltasPercent',
    label: '% FALTA TOTAL',
    shortLabel: '% Falta Total',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      const pct =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
          : 0;
      return `${pct}%`;
    },
  },
  {
    id: 'atestadosQtd',
    label: 'QTD ATESTADOS APRESENTADOS',
    shortLabel: 'Atestados (Qtd)',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).atestados,
  },
  {
    id: 'atestadosPercent',
    label: '% ATESTADOS SOBRE FALTAS',
    shortLabel: '% Atestados s/ Faltas',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      const pct = m.faltas > 0 ? Math.round((m.atestados / m.faltas) * 100) : 0;
      return `${pct}%`;
    },
  },
  {
    id: 'faltasSemAtestado',
    label: 'QTD FALTAS SEM ATESTADO',
    shortLabel: 'Faltas s/ Atestado',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      return Math.max(0, m.faltas - m.atestados);
    },
  },
  {
    id: 'diasLetivosMes',
    label: 'DIAS LETIVOS DO MÊS',
    shortLabel: 'Dias Letivos Mês',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).diasLetivosMes,
  },
  {
    id: 'diasLetivosRecorte',
    label: 'DIAS LETIVOS NO RECORTE DA MATRÍCULA',
    shortLabel: 'Dias no Recorte Matrícula',
    category: 'Frequência, Presença & Faltas',
    width: 20,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).diasLetivosMatriculados,
  },
  {
    id: 'detalheRecorte',
    label: 'DETALHE DO RECORTE',
    shortLabel: 'Detalhe do Recorte',
    category: 'Frequência, Presença & Faltas',
    width: 24,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).recorteLabel,
  },
  {
    id: 'statusLegal',
    label: 'STATUS FREQUÊNCIA / BOLSA FAMÍLIA',
    shortLabel: 'Status Legal (<60% / <75%)',
    category: 'Frequência, Presença & Faltas',
    width: 24,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      return m.isBelowLegalThreshold
        ? `ALERTA (<${m.minLegalPresencePercent}%)`
        : `REGULAR (>=${m.minLegalPresencePercent}%)`;
    },
  },
  {
    id: 'observacoes',
    label: 'ATESTADO / ANOTAÇÕES',
    shortLabel: 'Anotações & Atestados',
    category: 'Frequência, Presença & Faltas',
    width: 28,
    getValue: (s) => s.notes || '',
  },

  // 4. Documentos, Saúde & AEE
  {
    id: 'cpf',
    label: 'CPF',
    shortLabel: 'CPF',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.cpf || '',
  },
  {
    id: 'rg',
    label: 'RG',
    shortLabel: 'RG',
    category: 'Documentos, Saúde & AEE',
    width: 15,
    getValue: (s) => s.rg || '',
  },
  {
    id: 'dataEmissaoRg',
    label: 'DATA EMISSÃO RG',
    shortLabel: 'Data Emissão RG',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.dataEmissaoRg || '',
  },
  {
    id: 'nis',
    label: 'NIS',
    shortLabel: 'NIS (Bolsa Família)',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.nis || '',
  },
  {
    id: 'cartaoSus',
    label: 'CARTÃO SUS',
    shortLabel: 'Cartão SUS',
    category: 'Documentos, Saúde & AEE',
    width: 20,
    getValue: (s) => s.cartaoSus || '',
  },
  {
    id: 'deficiencia',
    label: 'DEFICIÊNCIA',
    shortLabel: 'Deficiência / AEE',
    category: 'Documentos, Saúde & AEE',
    width: 24,
    getValue: (s) => s.deficiencia || '',
  },
  {
    id: 'tipoSanguineo',
    label: 'TIPO SANGUÍNEO',
    shortLabel: 'Tipo Sanguíneo',
    category: 'Documentos, Saúde & AEE',
    width: 14,
    getValue: (s) => s.tipoSanguineo || '',
  },
  {
    id: 'racaCor',
    label: 'RAÇA/COR',
    shortLabel: 'Raça / Cor',
    category: 'Documentos, Saúde & AEE',
    width: 14,
    getValue: (s) => s.racaCor || '',
  },
  {
    id: 'nomeSocial',
    label: 'NOME SOCIAL',
    shortLabel: 'Nome Social',
    category: 'Documentos, Saúde & AEE',
    width: 20,
    getValue: (s) => s.nomeSocial || '',
  },
  {
    id: 'nacionalidade',
    label: 'NACIONALIDADE',
    shortLabel: 'Nacionalidade',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.nacionalidade || 'BRASILEIRA',
  },
  {
    id: 'paisOrigem',
    label: 'PAÍS DE ORIGEM',
    shortLabel: 'País de Origem',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.paisOrigem || 'BRASIL',
  },
  {
    id: 'municipioNascimento',
    label: 'MUNICÍPIO DE NASCIMENTO',
    shortLabel: 'Município de Nascimento',
    category: 'Documentos, Saúde & AEE',
    width: 22,
    getValue: (s) => s.municipioNascimento || 'JUNDIAI - SP',
  },
  {
    id: 'arquivo',
    label: 'ARQUIVO',
    shortLabel: 'Nº Arquivo / Pasta',
    category: 'Documentos, Saúde & AEE',
    width: 12,
    getValue: (s) => s.arquivo || '',
  },

  // 5. Endereço & Transporte
  {
    id: 'cep',
    label: 'CEP',
    shortLabel: 'CEP',
    category: 'Endereço & Transporte',
    width: 14,
    getValue: (s) => s.cep || '13.214-000',
  },
  {
    id: 'logradouro',
    label: 'LOGRADOURO',
    shortLabel: 'Logradouro (Rua/Av.)',
    category: 'Endereço & Transporte',
    width: 28,
    getValue: (s) => s.logradouro || '',
  },
  {
    id: 'numeroResidencia',
    label: 'N. RESIDENCIA',
    shortLabel: 'Nº Residência',
    category: 'Endereço & Transporte',
    width: 12,
    getValue: (s) => s.numeroResidencia || '',
  },
  {
    id: 'complemento',
    label: 'COMPLEMENTO',
    shortLabel: 'Complemento',
    category: 'Endereço & Transporte',
    width: 18,
    getValue: (s) => s.complemento || '',
  },
  {
    id: 'bairro',
    label: 'BAIRRO',
    shortLabel: 'Bairro',
    category: 'Endereço & Transporte',
    width: 20,
    getValue: (s) => s.bairro || '',
  },
  {
    id: 'cidade',
    label: 'CIDADE',
    shortLabel: 'Cidade',
    category: 'Endereço & Transporte',
    width: 16,
    getValue: (s) => s.cidade || 'JUNDIAI',
  },
  {
    id: 'uf',
    label: 'UF',
    shortLabel: 'UF',
    category: 'Endereço & Transporte',
    width: 8,
    getValue: (s) => s.uf || 'SP',
  },
  {
    id: 'rotaOnibus',
    label: 'ROTA DE ÔNIBUS',
    shortLabel: 'Rota de Ônibus / TEG',
    category: 'Endereço & Transporte',
    width: 18,
    getValue: (s) => s.rotaOnibus || '',
  },

  // 6. Outros Campos SED
  {
    id: 'tipoAlocacao',
    label: 'TIPO ALOCAÇÃO',
    shortLabel: 'Tipo Alocação',
    category: 'Outros Campos SED',
    width: 16,
    getValue: (s) => s.tipoAlocacao || '',
  },
  {
    id: 'categoriaProfissionalCenso',
    label: 'CATEGORIA PROFISSIONAL CENSO',
    shortLabel: 'Cat. Profissional Censo',
    category: 'Outros Campos SED',
    width: 22,
    getValue: (s) => s.categoriaProfissionalCenso || '',
  },
  {
    id: 'posDataCenso',
    label: 'PÓS DATA CENSO',
    shortLabel: 'Pós Data Censo',
    category: 'Outros Campos SED',
    width: 16,
    getValue: (s) => s.posDataCenso || '',
  },
  {
    id: 'procedenciaEscolar',
    label: 'PROCEDÊNCIA ESCOLAR',
    shortLabel: 'Procedência Escolar',
    category: 'Outros Campos SED',
    width: 24,
    getValue: (s) => s.procedenciaEscolar || '',
  },
  {
    id: 'sucessaoEscolar',
    label: 'SUCESSÃO ESCOLAR',
    shortLabel: 'Sucessão Escolar',
    category: 'Outros Campos SED',
    width: 20,
    getValue: (s) => s.sucessaoEscolar || '',
  },
];

export const DEFAULT_CLASS_EXPORT_COLUMN_IDS: string[] = [
  'numeroChamada',
  'estudante',
  'raCompleto',
  'situacao',
  'genero',
  'filiacao1',
  'filiacao2',
  'telefones',
  'emailMunicipal',
  'presencasQtd',
  'presencaPercent',
  'faltasQtd',
  'faltasPercent',
  'atestadosQtd',
  'observacoes',
];

export const CLASS_EXPORT_PRESETS: {
  id: string;
  label: string;
  description: string;
  columnIds: string[];
}[] = [
  {
    id: 'padrao_turma',
    label: 'Padrão da Turma (Completo & Limpo)',
    description: 'Nº, Estudante, RA, Situação, Gênero, Filiação 1 (Mãe), Filiação 2 (Pai), Telefones, E-mail, Presença Total e Falta Total',
    columnIds: DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  },
  {
    id: 'frequencia_bolsa',
    label: 'Frequência, Faltas & Bolsa Família',
    description: 'Focado em presença, faltas, atestados, NIS e status legal (<60% / <75%)',
    columnIds: [
      'numeroChamada',
      'estudante',
      'raCompleto',
      'nis',
      'dataNascimento',
      'situacao',
      'diasLetivosRecorte',
      'presencasQtd',
      'presencaPercent',
      'faltasQtd',
      'faltasPercent',
      'atestadosQtd',
      'faltasSemAtestado',
      'statusLegal',
      'observacoes',
    ],
  },
  {
    id: 'filiacao_contatos',
    label: 'Filiação (Mãe e Pai) & Contatos',
    description: 'Lista nominal com Nome da Mãe (Filiação 1), Nome do Pai (Filiação 2), Telefones, E-mail e Endereço',
    columnIds: [
      'numeroChamada',
      'estudante',
      'raCompleto',
      'dataNascimento',
      'filiacao1',
      'filiacao2',
      'telefones',
      'emailMunicipal',
      'logradouro',
      'numeroResidencia',
      'bairro',
      'cep',
    ],
  },
  {
    id: 'completo_sed',
    label: 'Base Oficial SED Completa (Todos os Campos)',
    description: 'Todas as 61 colunas oficiais da SED + indicadores de frequência e recorte',
    columnIds: CLASS_EXPORT_COLUMNS.map((c) => c.id),
  },
];

export type ClassExportSortOrder =
  | 'number_asc'
  | 'name_asc'
  | 'name_desc'
  | 'absences_desc'
  | 'presence_asc';

export type ClassExportStatusFilter = 'all' | 'ativos' | 'movimentados' | 'alerta';

export interface ClassCustomExportOptions {
  columnIds: string[];
  sortBy: ClassExportSortOrder;
  statusFilter: ClassExportStatusFilter;
  includeSummarySheet: boolean;
  fileFormat?: 'xls' | 'xlsx';
}

export const buildCustomClassExportPreview = (
  cls: ClassGroup,
  options: ClassCustomExportOptions,
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): {
  headers: string[];
  rows: Record<string, string | number>[];
  orderedStudents: Student[];
} => {
  const diasLetivosMes = cls.classesHeld || 20;
  const colDefs = options.columnIds
    .map((id) => CLASS_EXPORT_COLUMNS.find((c) => c.id === id))
    .filter((c): c is ClassExportColumnDef => Boolean(c));

  const finalCols =
    colDefs.length > 0
      ? colDefs
      : DEFAULT_CLASS_EXPORT_COLUMN_IDS.map((id) =>
          CLASS_EXPORT_COLUMNS.find((c) => c.id === id)!
        ).filter(Boolean);

  // Filter students
  const filtered = cls.students.filter((s) => {
    const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
    const isMov =
      sit.includes('BXTR') ||
      sit.includes('TRANSF') ||
      sit.includes('REMAN') ||
      sit.includes('RM');
    if (options.statusFilter === 'ativos') return !isMov;
    if (options.statusFilter === 'movimentados') return isMov;
    if (options.statusFilter === 'alerta') {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      return m.isBelowLegalThreshold;
    }
    return true;
  });

  // Sort students according to user preference
  const sorted = [...filtered].sort((a, b) => {
    if (options.sortBy === 'name_asc') {
      return a.name.localeCompare(b.name, 'pt-BR');
    }
    if (options.sortBy === 'name_desc') {
      return b.name.localeCompare(a.name, 'pt-BR');
    }
    if (options.sortBy === 'absences_desc') {
      const ma = getStudentAttendanceMetrics(a, diasLetivosMes, calendar);
      const mb = getStudentAttendanceMetrics(b, diasLetivosMes, calendar);
      if (mb.faltas !== ma.faltas) return mb.faltas - ma.faltas;
      return a.number - b.number;
    }
    if (options.sortBy === 'presence_asc') {
      const ma = getStudentAttendanceMetrics(a, diasLetivosMes, calendar);
      const mb = getStudentAttendanceMetrics(b, diasLetivosMes, calendar);
      if (ma.frequenciaPercent !== mb.frequenciaPercent) {
        return ma.frequenciaPercent - mb.frequenciaPercent;
      }
      return a.number - b.number;
    }
    // Default: strict numerical call order (Nº 01, 02, 03...)
    return a.number - b.number;
  });

  const rows = sorted.map((s) => {
    const rowObj: Record<string, string | number> = {};
    finalCols.forEach((col) => {
      rowObj[col.label] = col.getValue(s, cls, calendar);
    });
    return rowObj;
  });

  return {
    headers: finalCols.map((c) => c.label),
    rows,
    orderedStudents: sorted,
  };
};

// Generate and trigger download of custom .xls (or .xlsx) file exclusively for the selected ClassGroup
export const downloadClassCustomXLS = (
  cls: ClassGroup,
  options: ClassCustomExportOptions,
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): void => {
  const { headers, rows } = buildCustomClassExportPreview(cls, options, calendar);
  const colDefs = options.columnIds
    .map((id) => CLASS_EXPORT_COLUMNS.find((c) => c.id === id))
    .filter((c): c is ClassExportColumnDef => Boolean(c));

  const wb = XLSX.utils.book_new();

  // Sheet 1: Dados Nominais da Turma com as Colunas e Ordem escolhidas pelo usuário
  const wsTurma = XLSX.utils.json_to_sheet(rows, { header: headers });
  wsTurma['!cols'] = colDefs.map((c) => ({ wch: c.width || 20 }));

  const safeSheetName = `Turma_${cls.name.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, wsTurma, safeSheetName);

  // Sheet 2 (Optional): Alta da Turma (Resumo de Ativos, Feminino, Masculino, Transferidos, Remanejados, Presença e Faltas)
  if (options.includeSummarySheet) {
    const diasLetivosMes = cls.classesHeld || 20;
    let ativos = 0;
    let feminino = 0;
    let masculino = 0;
    let transferidos = 0;
    let remanejados = 0;
    let pcd = 0;
    let somaDias = 0;
    let somaPresencas = 0;
    let somaFaltas = 0;
    let somaAtestados = 0;

    cls.students.forEach((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const gen = (s.genero || '').toUpperCase().trim();
      if (sit.includes('BXTR') || sit.includes('TRANSF')) transferidos++;
      else if (sit.includes('REMAN') || sit.includes('RM')) remanejados++;
      else ativos++;

      if (gen.startsWith('F')) feminino++;
      else if (gen.startsWith('M')) masculino++;

      if (s.deficiencia && s.deficiencia.trim().length > 0) pcd++;

      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      somaDias += m.diasLetivosMatriculados;
      somaPresencas += m.presencas;
      somaFaltas += m.faltas;
      somaAtestados += m.atestados;
    });

    const pctPresenca = somaDias > 0 ? Math.round((somaPresencas / somaDias) * 100) : 100;
    const pctFalta = somaDias > 0 ? Math.round((somaFaltas / somaDias) * 100) : 0;

    const resumoRows = [
      { INDICADOR: 'TURMA', VALOR: cls.name, DETALHE: `${cls.grade} • ${cls.shift}` },
      { INDICADOR: 'SALA', VALOR: cls.room, DETALHE: `${diasLetivosMes} dias letivos no mês` },
      { INDICADOR: 'TOTAL MATRICULADOS', VALOR: cls.students.length, DETALHE: '100% da lista nominal' },
      { INDICADOR: 'ESTUDANTES ATIVOS', VALOR: ativos, DETALHE: 'Frequentes na turma' },
      {
        INDICADOR: 'FEMININO (MENINAS)',
        VALOR: feminino,
        DETALHE:
          cls.students.length > 0
            ? `${Math.round((feminino / cls.students.length) * 100)}% da turma`
            : '0%',
      },
      {
        INDICADOR: 'MASCULINO (MENINOS)',
        VALOR: masculino,
        DETALHE:
          cls.students.length > 0
            ? `${Math.round((masculino / cls.students.length) * 100)}% da turma`
            : '0%',
      },
      { INDICADOR: 'TRANSFERIDOS (BXTR)', VALOR: transferidos, DETALHE: 'Baixa por transferência' },
      { INDICADOR: 'REMANEJADOS', VALOR: remanejados, DETALHE: 'Movimentação entre turmas' },
      { INDICADOR: 'EDUCAÇÃO ESPECIAL / AEE', VALOR: pcd, DETALHE: 'Estudantes com laudo/AEE' },
      {
        INDICADOR: 'PRESENÇA TOTAL DA TURMA',
        VALOR: `${pctPresenca}%`,
        DETALHE: `${somaPresencas} presenças em ${somaDias} dias matriculados`,
      },
      {
        INDICADOR: 'FALTA TOTAL DA TURMA',
        VALOR: somaFaltas,
        DETALHE: `${pctFalta}% de ausências no período`,
      },
      {
        INDICADOR: 'ATESTADOS APRESENTADOS',
        VALOR: somaAtestados,
        DETALHE: 'Faltas justificadas por documento médico',
      },
    ];

    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    wsResumo['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Alta_Resumo_Turma');
  }

  const format = options.fileFormat || 'xls';
  const cleanFileName = `Planilha_${cls.name.replace(/\s+/g, '_')}_2027.${format}`;

  if (format === 'xls') {
    XLSX.writeFile(wb, cleanFileName, { bookType: 'biff8' });
  } else {
    XLSX.writeFile(wb, cleanFileName, { bookType: 'xlsx' });
  }
};

// Legacy alias kept for compatibility, now defaults to .xls format
export const downloadClassCSV = (cls: ClassGroup): void => {
  downloadClassCustomXLS(cls, {
    columnIds: DEFAULT_CLASS_EXPORT_COLUMN_IDS,
    sortBy: 'number_asc',
    statusFilter: 'all',
    includeSummarySheet: true,
    fileFormat: 'xls',
  });
};

