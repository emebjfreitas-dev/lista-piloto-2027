import {
  ClassGroup,
  Student,
  SchoolDay,
  AuthorizedUser,
  UserRole,
  AttendanceWindowConfig,
  UserAccessSessionLog,
  SchoolNotice,
  SecurityEventType,
} from '../types';
import {
  INITIAL_CLASSES,
  OFFICIAL_OCTOBER_DAYS,
  INITIAL_AUTHORIZED_USERS,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import { sortClassesInOfficialOrder } from '../data/officialMatrix2027';
import { resolveCanonicalClassId } from '../data/officialSedStudents';
import {
  saveClassesToFirestoreCloud,
  saveConfigMetaToFirestoreCloud,
  fetchStateFromFirestoreCloud,
  enqueuePendingSyncOperation,
  markSyncOperationSuccess,
  setSyncingActiveState,
  registerOfflineFlushHandler,
  CLEAN_DB_RESET_EPOCH_ID,
  DB_CLEAN_EPOCH_STORAGE_KEY as SYNC_DB_CLEAN_EPOCH_KEY,
  DB_EPOCH_META_STORAGE_KEY,
  CLASSES_UPDATED_AT_STORAGE_KEY,
  wipeFirestoreSchoolDataOnly,
  touchLocalEpochState,
  shouldAllowRemoteClassesOverwrite,
} from './firebaseSync';
import { resolveStudentGender } from '../utils/genderDictionary';
import { isBackendApiAvailable } from './apiEnvironment';
import { hasForbiddenPrototypeKey } from '../utils/serverValidation';
import {
  warmupPhotoIndexedDbCache,
  persistStudentPhotoUrlsToIndexedDb,
  clearStudentPhotoIndexedDbCache,
} from './photoIndexedDbCache';
import {
  getActiveUserAuthHeaders,
  getActiveUserAuthHeadersAsync,
  establishServerAuthSessionCookie,
  clearServerAuthSessionCookie,
  formatDurationHuman,
  getLocalTodayDateISO,
  isUserAccessExpired,
  isUserAccessEffectivelyActive,
  formatAccessExpirationDateBR,
} from './authSessionService';
import {
  SECURITY_AUDIT_STORAGE_KEY,
  LGPD_CONFIG_STORAGE_KEY,
  RBAC_ROLE_DEFINITIONS,
  getStoredSecurityAuditLogs,
  addSecurityAuditLog,
  clearStoredSecurityAuditLogs,
  getStoredLgpdConfig,
  saveStoredLgpdConfig,
  maskSensitiveText,
  sanitizeStudentForLgpd,
  exportSecurityAuditLogsCSV,
} from './securityAuditService';
import {
  registerClassesCalendarCascadeHandler,
  getStoredHolidays,
  getStoredCalendarAuditLogs,
  getStoredOfficialCalendarConfig,
  pullOfficialCalendarFromServer,
  saveStoredOfficialCalendarConfig,
  saveStoredHolidayAction,
} from './calendarConfigService';
import {
  exportOfficialMatrixToXLS,
  downloadSpreadsheetXLSX,
  CLASS_EXPORT_COLUMNS,
  DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  CLASS_EXPORT_PRESETS,
  buildCustomClassExportPreview,
  downloadClassCustomXLS,
  downloadClassCSV,
} from './xlsExportService';
export type {
  ClassExportCategory,
  ClassExportColumnDef,
  ClassExportSortOrder,
  ClassExportStatusFilter,
  ClassCustomExportOptions,
} from './xlsExportService';
export {
  getActiveUserAuthHeaders,
  getActiveUserAuthHeadersAsync,
  establishServerAuthSessionCookie,
  clearServerAuthSessionCookie,
  formatDurationHuman,
  getLocalTodayDateISO,
  isUserAccessExpired,
  isUserAccessEffectivelyActive,
  formatAccessExpirationDateBR,
  SECURITY_AUDIT_STORAGE_KEY,
  LGPD_CONFIG_STORAGE_KEY,
  RBAC_ROLE_DEFINITIONS,
  getStoredSecurityAuditLogs,
  addSecurityAuditLog,
  clearStoredSecurityAuditLogs,
  getStoredLgpdConfig,
  saveStoredLgpdConfig,
  maskSensitiveText,
  sanitizeStudentForLgpd,
  exportSecurityAuditLogsCSV,
  getStoredHolidays,
  getStoredCalendarAuditLogs,
  getStoredOfficialCalendarConfig,
  pullOfficialCalendarFromServer,
  saveStoredOfficialCalendarConfig,
  saveStoredHolidayAction,
  exportOfficialMatrixToXLS,
  downloadSpreadsheetXLSX,
  CLASS_EXPORT_COLUMNS,
  DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  CLASS_EXPORT_PRESETS,
  buildCustomClassExportPreview,
  downloadClassCustomXLS,
  downloadClassCSV,
};

if (typeof window !== 'undefined') {
  void warmupPhotoIndexedDbCache();
}

const STORAGE_KEY = 'emeb_candelario_sed_classes_2027_v8';
const USERS_STORAGE_KEY = 'emeb_candelario_authorized_users_2027_v4';
const ATTENDANCE_WINDOW_STORAGE_KEY = 'emeb_candelario_attendance_window_2027_v1';
const ACCESS_LOGS_STORAGE_KEY = 'emeb_candelario_access_session_logs_2027_v1';
const NOTICES_STORAGE_KEY = 'emeb_candelario_school_notices_2027_v1';
const DB_CLEAN_EPOCH_STORAGE_KEY = SYNC_DB_CLEAN_EPOCH_KEY;

// In-memory cache so even if browser localStorage quota is full, the app never loses runtime state or throws errors
let memoryCachedClasses: ClassGroup[] | null = null;
let memoryCachedUsers: AuthorizedUser[] | null = null;
let memoryCachedLogs: UserAccessSessionLog[] | null = null;
let memoryCachedNotices: SchoolNotice[] | null = null;

const clearLocalSchoolDataOnly = (): void => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const dataKeys = [
      STORAGE_KEY,
      'emeb_candelario_sed_classes_2027_v7',
      'emeb_candelario_sed_classes_2027_v6',
      'emeb_candelario_sed_classes_2027_v5',
      'emeb_candelario_classes_updated_at_ms_2027',
      DB_EPOCH_META_STORAGE_KEY,
      ACCESS_LOGS_STORAGE_KEY,
      NOTICES_STORAGE_KEY,
      'emeb_candelario_security_audit_logs_2027_v1',
      'emeb_candelario_name_gender_dict_2027_v1',
      'emeb_candelario_discovered_drive_photos_2027_v1',
      'emeb_candelario_discovered_nominal_pdfs_2027_v1',
      'emeb_candelario_offline_sync_queue_2027_v1',
      'emeb_candelario_sheet_sync_queue_v2',
      'emeb_candelario_sheet_sync_lock_v2',
    ];
    dataKeys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });

    // Reset access counters on stored authorized users while preserving accounts, roles, and class assignments
    const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
    if (rawUsers) {
      const parsedUsers = JSON.parse(rawUsers);
      if (Array.isArray(parsedUsers)) {
        const cleanedUsers = parsedUsers.map((u: AuthorizedUser) => ({
          ...u,
          totalAccessCount: 0,
          totalDurationSeconds: 0,
          lastSessionDurationSeconds: 0,
          lastLoginAt: undefined,
          lastActiveAt: undefined,
          lastScreenVisited: undefined,
        }));
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(cleanedUsers));
      }
    }
  } catch {
    // ignore storage access issues
  }
  memoryCachedClasses = null;
  memoryCachedUsers = null;
  memoryCachedLogs = [];
  memoryCachedNotices = [];
  void clearStudentPhotoIndexedDbCache();
};

const ensureCleanDatabaseEpochLocal = (): void => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(DB_CLEAN_EPOCH_STORAGE_KEY) !== CLEAN_DB_RESET_EPOCH_ID) {
      clearLocalSchoolDataOnly();
      localStorage.setItem(DB_CLEAN_EPOCH_STORAGE_KEY, CLEAN_DB_RESET_EPOCH_ID);
      touchLocalEpochState(0, CLEAN_DB_RESET_EPOCH_ID);
    }
  } catch {
    // ignore storage access issues
  }
};

ensureCleanDatabaseEpochLocal();

// Clean up obsolete legacy storage keys from earlier versions to free localStorage space
const purgeLegacyStorageKeys = (preserveKeys: string[]): void => {
  try {
    const keepSet = new Set([
      ...preserveKeys,
      STORAGE_KEY,
      USERS_STORAGE_KEY,
      ATTENDANCE_WINDOW_STORAGE_KEY,
      ACCESS_LOGS_STORAGE_KEY,
      NOTICES_STORAGE_KEY,
      DB_CLEAN_EPOCH_STORAGE_KEY,
      DB_EPOCH_META_STORAGE_KEY,
      CLASSES_UPDATED_AT_STORAGE_KEY,
      'emeb_candelario_name_gender_dict_2027_v1',
      'emeb_candelario_active_session_2027_v1',
      'emeb_candelario_linked_spreadsheet_id_2027',
      'emeb_candelario_linked_spreadsheet_title_2027',
      'emeb_candelario_drive_photos_folder_url_2027',
      'emeb_candelario_drive_photos_folder_id_2027',
      'emeb_candelario_drive_fichas_pdf_folder_url_2027',
      'emeb_candelario_drive_fichas_pdf_folder_id_2027',
      'emeb_candelario_discovered_drive_photos_2027_v1',
      'emeb_candelario_discovered_nominal_pdfs_2027_v1',
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

// Auth session helpers and duration formatters imported & re-exported from ./authSessionService

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
 * Horários oficiais de encerramento dos turnos da rede municipal (EMEB Prof. Joaquim Candelário de Freitas):
 * - Turno Manhã: 07h00 às 12h00 (lembrete de fim de turno a partir de 11:15)
 * - Turno Tarde: 13h00 às 17h30 (lembrete de fim de turno a partir de 16:45)
 */
const MORNING_SHIFT_CLOSING_LABEL = '12:00' as const;
const AFTERNOON_SHIFT_CLOSING_LABEL = '17:30' as const;
const MORNING_REMINDER_START_LABEL = '11:15' as const;
const AFTERNOON_REMINDER_START_LABEL = '16:45' as const;
const MORNING_REMINDER_CUTOFF_MINUTES = 11 * 60 + 15; // 675 min (11:15)
const AFTERNOON_REMINDER_CUTOFF_MINUTES = 16 * 60 + 45; // 1005 min (16:45)

export const resolveClassShiftPeriod = (
  cls: Pick<ClassGroup, 'shift' | 'periodo'>
): 'morning' | 'afternoon' => {
  if (cls.periodo === 'TARDE') return 'afternoon';
  if (cls.periodo === 'MANHÃ') return 'morning';
  const normalized = (cls.shift || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('tarde')) return 'afternoon';
  return 'morning';
};

/**
 * Evaluates whether a given date (or current date) falls within the official monthly attendance launch window:
 * - Last school day (último dia letivo) of the month, OR
 * - First 2 school days (dois primeiros dias letivos) of the next month
 * OR if exceptional override is enabled in the Access Management tab.
 * Also computes municipal shift end-of-school-day timing (Manhã 12:00 / Tarde 17:30).
 */
export const evaluateAttendanceLaunchWindow = (
  config: AttendanceWindowConfig,
  referenceDate?: Date
): {
  isWithinCalendarWindow: boolean;
  isAllowedToLaunch: boolean;
  reasonLabel: string;
  statusTitle: string;
  statusDescription: string;
  currentDateFormatted: string;
  windowRuleDescription: string;
  windowPhase: 'pre_window' | 'closing_soon' | 'last_day' | 'next_month_closing' | 'override_open';
  closingDateFormatted: string;
  daysRemaining: number;
  urgencyLevel: 'info' | 'warning' | 'urgent';
  targetMonthName: string;
  nextWindowOpenDateFormatted: string;
  isSchoolWeekday: boolean;
  currentMinutesOfDay: number;
  currentTimeFormatted: string;
  morningShiftClosingLabel: string;
  afternoonShiftClosingLabel: string;
  morningReminderCutoffMinutes: number;
  afternoonReminderCutoffMinutes: number;
  isMorningEndOfDayReached: boolean;
  isAfternoonEndOfDayReached: boolean;
  msUntilMorningEndOfDay: number | null;
  msUntilAfternoonEndOfDay: number | null;
} => {
  const dateObj = (() => {
    if (config.simulatedDateISO) {
      const [sy, sm, sd] = config.simulatedDateISO.split('-').map(Number);
      if (sy && sm && sd) {
        return new Date(
          sy,
          sm - 1,
          sd,
          referenceDate ? referenceDate.getHours() : 12,
          referenceDate ? referenceDate.getMinutes() : 0,
          referenceDate ? referenceDate.getSeconds() : 0,
          0
        );
      }
      return new Date(`${config.simulatedDateISO}T12:00:00`);
    }
    return referenceDate || new Date();
  })();

  const currentDateFormatted = dateObj.toLocaleDateString('pt-BR');
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth(); // 0..11
  const dayOfMonth = dateObj.getDate();
  const dowToday = dateObj.getDay();
  const isSchoolWeekday = dowToday >= 1 && dowToday <= 5;
  const currentHours = dateObj.getHours();
  const currentMinutes = dateObj.getMinutes();
  const currentMinutesOfDay = currentHours * 60 + currentMinutes;
  const currentTimeFormatted = `${String(currentHours).padStart(2, '0')}:${String(
    currentMinutes
  ).padStart(2, '0')}`;

  const morningCutoffDate = new Date(year, month, dayOfMonth, 11, 15, 0, 0);
  const afternoonCutoffDate = new Date(year, month, dayOfMonth, 16, 45, 0, 0);

  const isMorningEndOfDayReached =
    isSchoolWeekday && currentMinutesOfDay >= MORNING_REMINDER_CUTOFF_MINUTES;
  const isAfternoonEndOfDayReached =
    isSchoolWeekday && currentMinutesOfDay >= AFTERNOON_REMINDER_CUTOFF_MINUTES;

  const msUntilMorningEndOfDay =
    isSchoolWeekday && dateObj.getTime() < morningCutoffDate.getTime()
      ? morningCutoffDate.getTime() - dateObj.getTime()
      : null;
  const msUntilAfternoonEndOfDay =
    isSchoolWeekday && dateObj.getTime() < afternoonCutoffDate.getTime()
      ? afternoonCutoffDate.getTime() - dateObj.getTime()
      : null;

  const MONTH_NAMES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const targetMonthName = MONTH_NAMES_PT[month] || 'Mês Atual';

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

  // Next month's first two school days
  const nextMonthYear = month === 11 ? year + 1 : year;
  const nextMonthIndex = (month + 1) % 12;
  const daysInNextMonth = new Date(nextMonthYear, nextMonthIndex + 1, 0).getDate();
  const nextMonthSchoolDays: number[] = [];
  for (let d = 1; d <= daysInNextMonth; d++) {
    const dt = new Date(nextMonthYear, nextMonthIndex, d);
    const dow = dt.getDay();
    if (dow >= 1 && dow <= 5) {
      nextMonthSchoolDays.push(d);
    }
  }

  const firstTwoSchoolDaysNextMonth = nextMonthSchoolDays.slice(0, 2);
  const secondSchoolDayNextMonth = firstTwoSchoolDaysNextMonth[1] || 2;
  const finalDeadlineDate = new Date(nextMonthYear, nextMonthIndex, secondSchoolDayNextMonth);
  const closingDateFormatted = finalDeadlineDate.toLocaleDateString('pt-BR');

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

  // Next window open date (last school day of current month)
  const nextOpenDate = new Date(year, month, lastSchoolDay);
  const nextWindowOpenDateFormatted = nextOpenDate.toLocaleDateString('pt-BR');

  let windowPhase: 'pre_window' | 'closing_soon' | 'last_day' | 'next_month_closing' | 'override_open' = 'pre_window';
  let urgencyLevel: 'info' | 'warning' | 'urgent' = 'info';
  let daysRemaining = 0;
  let reasonLabel = '';

  if (config.exceptionalOverrideOpen) {
    windowPhase = 'override_open';
    urgencyLevel = 'info';
    daysRemaining = 1;
    reasonLabel = 'Aberto Excepcionalmente pela Gestão na aba Acessos';
  } else if (isFirstTwoSchoolDaysOfNextMonth) {
    windowPhase = 'next_month_closing';
    const isVeryLastDay = dayOfMonth === firstTwoSchoolDays[1];
    daysRemaining = isVeryLastDay ? 0 : 1;
    urgencyLevel = isVeryLastDay ? 'urgent' : 'warning';
    reasonLabel = isVeryLastDay
      ? `ÚLTIMO DIA: Encerramento do fechamento de ${MONTH_NAMES_PT[(month + 11) % 12]} hoje!`
      : `Janela aberta: 1º dia letivo do mês. Prazo final encerra amanhã (dia ${String(secondSchoolDayNextMonth).padStart(2, '0')}).`;
  } else if (isLastSchoolDayOfMonth) {
    windowPhase = 'last_day';
    daysRemaining = 2; // last school day + 2 next month days
    urgencyLevel = 'warning';
    reasonLabel = `Aberto Hoje (${currentDateFormatted}): Último Dia Letivo do Mês de ${targetMonthName}`;
  } else if (dayOfMonth >= lastSchoolDay - 3 && dayOfMonth < lastSchoolDay) {
    windowPhase = 'closing_soon';
    daysRemaining = lastSchoolDay - dayOfMonth;
    urgencyLevel = 'warning';
    reasonLabel = `Atenção: Faltam ${daysRemaining} dia(s) para o fechamento de ${targetMonthName} (abre em ${nextWindowOpenDateFormatted})`;
  } else {
    windowPhase = 'pre_window';
    daysRemaining = Math.max(1, lastSchoolDay - dayOfMonth);
    urgencyLevel = 'info';
    reasonLabel = `Fechado Hoje (${currentDateFormatted}) — Abre no último dia letivo (${nextWindowOpenDateFormatted}) e nos 2 primeiros dias letivos do próximo mês (${closingDateFormatted})`;
  }

  return {
    isWithinCalendarWindow,
    isAllowedToLaunch,
    reasonLabel,
    statusTitle: isAllowedToLaunch
      ? 'Janela de Lançamento ABERTA'
      : 'Janela de Lançamento FECHADA',
    statusDescription: reasonLabel,
    currentDateFormatted,
    windowRuleDescription:
      'Liberado apenas no último dia letivo do mês e nos 2 primeiros dias letivos do mês seguinte (ou abertura excepcional na aba Acessos).',
    windowPhase,
    closingDateFormatted,
    daysRemaining,
    urgencyLevel,
    targetMonthName,
    nextWindowOpenDateFormatted,
    isSchoolWeekday,
    currentMinutesOfDay,
    currentTimeFormatted,
    morningShiftClosingLabel: MORNING_SHIFT_CLOSING_LABEL,
    afternoonShiftClosingLabel: AFTERNOON_SHIFT_CLOSING_LABEL,
    morningReminderCutoffMinutes: MORNING_REMINDER_CUTOFF_MINUTES,
    afternoonReminderCutoffMinutes: AFTERNOON_REMINDER_CUTOFF_MINUTES,
    isMorningEndOfDayReached,
    isAfternoonEndOfDayReached,
    msUntilMorningEndOfDay,
    msUntilAfternoonEndOfDay,
  };
};

export interface ClassEndOfDayReminderEvaluation {
  shouldRemindNow: boolean;
  isWindowAllowed: boolean;
  isClassPending: boolean;
  isSchoolWeekday: boolean;
  isShiftEndOfDayReached: boolean;
  shiftPeriod: 'morning' | 'afternoon';
  shiftLabel: 'Turno Manhã' | 'Turno Tarde';
  reminderStartTimeLabel: '11:15' | '16:45';
  closingTimeLabel: '12:00' | '17:30';
  msUntilReminder: number | null;
  windowEvaluation: ReturnType<typeof evaluateAttendanceLaunchWindow>;
}

/**
 * Combina a regra oficial da janela mensal (`evaluateAttendanceLaunchWindow`) com o
 * horário de encerramento do turno da turma (Manhã 12:00 / Tarde 17:30) para decidir
 * se o educador logado deve ser lembrado imediatamente ou agendado até o fim do turno.
 */
export const evaluateClassEndOfDayReminder = (
  config: AttendanceWindowConfig,
  cls: Pick<ClassGroup, 'isPending' | 'shift' | 'periodo'>,
  referenceDate?: Date
): ClassEndOfDayReminderEvaluation => {
  const windowEvaluation = evaluateAttendanceLaunchWindow(config, referenceDate);
  const shiftPeriod = resolveClassShiftPeriod(cls);
  const isAfternoon = shiftPeriod === 'afternoon';
  const isShiftEndOfDayReached = isAfternoon
    ? windowEvaluation.isAfternoonEndOfDayReached
    : windowEvaluation.isMorningEndOfDayReached;
  const isClassPending = Boolean(cls.isPending);
  const isWindowAllowed = windowEvaluation.isAllowedToLaunch;

  const msUntilReminder =
    isWindowAllowed && isClassPending
      ? isAfternoon
        ? windowEvaluation.msUntilAfternoonEndOfDay
        : windowEvaluation.msUntilMorningEndOfDay
      : null;

  return {
    shouldRemindNow: isWindowAllowed && isClassPending && isShiftEndOfDayReached,
    isWindowAllowed,
    isClassPending,
    isSchoolWeekday: windowEvaluation.isSchoolWeekday,
    isShiftEndOfDayReached,
    shiftPeriod,
    shiftLabel: isAfternoon ? 'Turno Tarde' : 'Turno Manhã',
    reminderStartTimeLabel: isAfternoon
      ? AFTERNOON_REMINDER_START_LABEL
      : MORNING_REMINDER_START_LABEL,
    closingTimeLabel: isAfternoon
      ? AFTERNOON_SHIFT_CLOSING_LABEL
      : MORNING_SHIFT_CLOSING_LABEL,
    msUntilReminder,
    windowEvaluation,
  };
};

// E-mail institucional exclusivo de Administrador da EMEB Prof. Joaquim Candelário de Freitas
export const isOfficialSchoolAdminEmail = (email?: string): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized === 'emebjfreitas@jundiai.sp.gov.br' ||
    normalized === 'emebjfreitas@educacao.jundiai.sp.gov.br'
  );
};

// Validate institutional domain @educacao.jundiai.sp.gov.br (plus official school owner emebjfreitas@jundiai.sp.gov.br)
export const isValidInstitutionalEmail = (email: string): boolean => {
  const normalized = email.trim().toLowerCase();
  if (isOfficialSchoolAdminEmail(normalized)) {
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
    const rawExpires = typeof u.accessExpiresAt === 'string' ? u.accessExpiresAt.trim() : '';
    const cleanExpires = /^\d{4}-\d{2}-\d{2}$/.test(rawExpires) ? rawExpires : undefined;
    const baseMerged: AuthorizedUser = {
      ...off,
      ...u,
      id: cleanId,
      email: cleanEmail,
      pronoun: u.pronoun || off?.pronoun,
      firstName: u.firstName || off?.firstName,
      teacherRoleType: u.teacherRoleType || off?.teacherRoleType,
      subjectName: u.subjectName || off?.subjectName,
    };
    if (cleanExpires) {
      baseMerged.accessExpiresAt = cleanExpires;
    } else {
      delete baseMerged.accessExpiresAt;
    }
    uniqueUsers.push(baseMerged);
  });

  return uniqueUsers.map((u) => {
    const cleanEmail = u.email.trim().toLowerCase();
    const off = officialByEmail.get(cleanEmail);

    // REGRA MANDATÓRIA: Administrador é EXCLUSIVO de emebjfreitas@jundiai.sp.gov.br (e seu alias)
    if (isOfficialSchoolAdminEmail(cleanEmail)) {
      return {
        ...u,
        email: cleanEmail,
        role: 'admin',
        teacherRoleType: 'admin',
        subjectName: 'GESTÃO / ADMIN',
        assignedClassId: 'all',
        assignedClassIds: ['all'],
        assignedClassName: 'Todas as 40 Turmas (Acesso Pleno)',
        assignedClassNames: ['Todas as 40 Turmas (Acesso Pleno)'],
        active: true,
      };
    }

    // Se a conta não for emebjfreitas@, não pode possuir papel admin em nenhuma hipótese
    const effectiveRole: UserRole =
      u.role === 'admin' ? (off?.role || 'usuario') : u.role;

    if (effectiveRole === 'usuario') {
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
        role: 'usuario',
        email: cleanEmail,
        teacherRoleType: 'peb1',
        assignedClassId: finalIds[0],
        assignedClassName: finalNames.join(' + '),
        assignedClassIds: finalIds,
        assignedClassNames: finalNames,
      };
    }

    if (effectiveRole === 'peb2') {
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
        role: 'peb2',
        email: cleanEmail,
        teacherRoleType: u.teacherRoleType || off?.teacherRoleType || 'arte',
        subjectName: subjectLabel,
        assignedClassId: 'all',
        assignedClassIds: specIds,
        assignedClassName:
          off?.assignedClassName ||
          (subjectLabel
            ? `${subjectLabel} • ${specIds.filter((i) => i !== 'all').length || 40} Turmas (Visualização)`
            : 'Todas as Turmas (Somente Visualização)'),
        assignedClassNames: specNames,
      };
    }

    // Fallback geral seguro para usuários docentes regulares
    return {
      ...u,
      role: 'usuario',
      email: cleanEmail,
      teacherRoleType: 'peb1',
      assignedClassId: INITIAL_CLASSES[0].id,
      assignedClassName: `${INITIAL_CLASSES[0].name} (${INITIAL_CLASSES[0].shift.replace('Turno ', '')})`,
      assignedClassIds: [INITIAL_CLASSES[0].id],
      assignedClassNames: [`${INITIAL_CLASSES[0].name} (${INITIAL_CLASSES[0].shift.replace('Turno ', '')})`],
    };
  });
};

export const pushAuthorizedUsersToServer = async (
  users: AuthorizedUser[]
): Promise<AuthorizedUser[] | null> => {
  const sanitized = classesOrUsersSanitize(users);
  setSyncingActiveState();
  let savedToAny = false;

  try {
    const cloudOk = await saveConfigMetaToFirestoreCloud({ authorizedUsers: sanitized });
    if (cloudOk) savedToAny = true;
  } catch {
    // continue to backend API
  }

  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const res = await fetch('/api/school-state/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({ authorizedUsers: sanitized }),
      });
      if (res.ok) {
        savedToAny = true;
        const data = await res.json();
        if (Array.isArray(data?.authorizedUsers)) {
          const clean = classesOrUsersSanitize(data.authorizedUsers);
          memoryCachedUsers = clean;
          safeSetLocalStorage(USERS_STORAGE_KEY, JSON.stringify(clean));
          markSyncOperationSuccess('save_users');
          return clean;
        }
      }
    } catch {
      // handled below
    }
  }

  if (savedToAny) {
    markSyncOperationSuccess('save_users');
    return sanitized;
  } else {
    enqueuePendingSyncOperation(
      'save_users',
      `Atualização de ${sanitized.length} perfis de acesso`,
      'Aguardando conexão para sincronizar quadro de acessos'
    );
    return null;
  }
};

export const pushSessionLogsToServer = async (
  logs: UserAccessSessionLog[],
  users?: AuthorizedUser[]
): Promise<void> => {
  const sanitizedUsers = users ? classesOrUsersSanitize(users) : undefined;
  try {
    await saveConfigMetaToFirestoreCloud({
      accessSessionLogs: logs,
      ...(sanitizedUsers ? { authorizedUsers: sanitizedUsers } : {}),
    });
  } catch {
    // ignore
  }
  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      await fetch('/api/school-state/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({
          accessSessionLogs: logs,
          ...(sanitizedUsers ? { authorizedUsers: sanitizedUsers } : {}),
        }),
      });
    } catch {
      // ignore offline
    }
  }
};

export const INITIAL_SCHOOL_NOTICES: SchoolNotice[] = [];

export const getStoredSchoolNotices = (): SchoolNotice[] => {
  if (memoryCachedNotices && memoryCachedNotices.length > 0) {
    return memoryCachedNotices;
  }
  try {
    const raw = localStorage.getItem(NOTICES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryCachedNotices = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore storage read error
  }
  memoryCachedNotices = INITIAL_SCHOOL_NOTICES;
  return INITIAL_SCHOOL_NOTICES;
};

export const saveStoredSchoolNotices = (notices: SchoolNotice[]): void => {
  const sliced = notices.slice(0, 60);
  memoryCachedNotices = sliced;
  safeSetLocalStorage(NOTICES_STORAGE_KEY, JSON.stringify(sliced));
};

export const pushSchoolNoticesToServer = async (
  notices: SchoolNotice[]
): Promise<void> => {
  const sliced = notices.slice(0, 60);
  setSyncingActiveState();
  let saved = false;
  try {
    const ok = await saveConfigMetaToFirestoreCloud({ schoolNotices: sliced });
    if (ok) saved = true;
  } catch {
    // ignore
  }
  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const res = await fetch('/api/school-state/notices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({ schoolNotices: sliced }),
      });
      if (res.ok) saved = true;
    } catch {
      // ignore offline
    }
  }
  if (saved) {
    markSyncOperationSuccess('save_notices');
  } else {
    enqueuePendingSyncOperation(
      'save_notices',
      'Publicação no Quadro de Avisos',
      'Sem conexão com o servidor'
    );
  }
};

export const pushAttendanceWindowToServer = async (
  config: AttendanceWindowConfig
): Promise<void> => {
  setSyncingActiveState();
  let saved = false;
  try {
    const ok = await saveConfigMetaToFirestoreCloud({ attendanceWindowConfig: config });
    if (ok) saved = true;
  } catch {
    // ignore
  }
  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const res = await fetch('/api/school-state/window', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({ attendanceWindowConfig: config }),
      });
      if (res.ok) saved = true;
    } catch {
      // ignore offline
    }
  }
  if (saved) {
    markSyncOperationSuccess('save_window');
  } else {
    enqueuePendingSyncOperation(
      'save_window',
      'Configuração de janela de chamada',
      'Sem conexão com o servidor'
    );
  }
};

export interface SharedCloudLinks {
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  photosFolderId?: string;
  photosFolderUrl?: string;
  fichasPdfFolderId?: string;
  fichasPdfFolderUrl?: string;
  updatedAtMs?: number;
}

const CLASSES_UPDATED_AT_KEY = CLASSES_UPDATED_AT_STORAGE_KEY;

export const getLocalClassesUpdatedAtMs = (): number => {
  try {
    return parseInt(localStorage.getItem(CLASSES_UPDATED_AT_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
};

export const setLocalClassesUpdatedAtMs = (ts: number): void => {
  safeSetLocalStorage(CLASSES_UPDATED_AT_KEY, String(ts));
  touchLocalEpochState(ts, CLEAN_DB_RESET_EPOCH_ID);
};

/**
 * Merges incoming remote classes with local classes per-class and per-student
 * so newer local edits or manual photo/PDF links are never overwritten by stale remote polls.
 */
export const mergeClassesWithConcurrencyControl = (
  remoteClasses: ClassGroup[],
  localClasses: ClassGroup[],
  remoteUpdatedAtMs: number,
  localUpdatedAtMs: number
): ClassGroup[] => {
  const localMap = new Map(localClasses.map((c) => [c.id.toLowerCase(), c]));
  const merged = remoteClasses.map((remCls) => {
    const locCls = localMap.get(remCls.id.toLowerCase());
    if (!locCls) return remCls;

    const remTime = remCls.updatedAtMs || remoteUpdatedAtMs || 0;
    const locTime = locCls.updatedAtMs || localUpdatedAtMs || 0;
    const preferLocalClass = locTime > remTime;
    const baseCls = preferLocalClass ? locCls : remCls;

    const locStudentMap = new Map(locCls.students.map((s) => [s.id, s]));
    const remStudentMap = new Map(remCls.students.map((s) => [s.id, s]));

    const mergedStudents = baseCls.students.map((st) => {
      const locSt = locStudentMap.get(st.id);
      const remSt = remStudentMap.get(st.id);
      if (!locSt || !remSt) return st;

      const stLocTime = locSt.updatedAtMs || locTime;
      const stRemTime = remSt.updatedAtMs || remTime;
      const winnerSt = stLocTime > stRemTime ? locSt : remSt;

      // Always preserve manual photo/PDF links if set on either side unless newer explicit link overrides
      const manualPhotoSt =
        locSt.photoManualLink && (!remSt.photoManualLink || stLocTime >= stRemTime)
          ? locSt
          : remSt.photoManualLink
          ? remSt
          : winnerSt;

      const manualPdfSt =
        locSt.fichaPdfManualLink && (!remSt.fichaPdfManualLink || stLocTime >= stRemTime)
          ? locSt
          : remSt.fichaPdfManualLink
          ? remSt
          : winnerSt;

      return {
        ...winnerSt,
        updatedAtMs: Math.max(stLocTime, stRemTime),
        photo: manualPhotoSt.photo || locSt.photo || remSt.photo,
        photoDriveId: manualPhotoSt.photoDriveId || locSt.photoDriveId || remSt.photoDriveId,
        photoDriveUrl: manualPhotoSt.photoDriveUrl || locSt.photoDriveUrl || remSt.photoDriveUrl,
        photoManualLink: Boolean(locSt.photoManualLink || remSt.photoManualLink),
        fichaPdfDriveId:
          manualPdfSt.fichaPdfDriveId || locSt.fichaPdfDriveId || remSt.fichaPdfDriveId,
        fichaPdfDriveUrl:
          manualPdfSt.fichaPdfDriveUrl || locSt.fichaPdfDriveUrl || remSt.fichaPdfDriveUrl,
        fichaPdfSubfolder:
          manualPdfSt.fichaPdfSubfolder || locSt.fichaPdfSubfolder || remSt.fichaPdfSubfolder,
        fichaPdfManualLink: Boolean(locSt.fichaPdfManualLink || remSt.fichaPdfManualLink),
      };
    });

    return {
      ...baseCls,
      updatedAtMs: Math.max(remTime, locTime),
      students: mergedStudents,
    };
  });
  return sortClassesInOfficialOrder(merged);
};

export const pushClassesToServer = async (
  classes: ClassGroup[],
  cloudLinks?: SharedCloudLinks,
  discoveredNominalPdfs?: any[]
): Promise<boolean> => {
  const nowMs = Date.now();
  setLocalClassesUpdatedAtMs(nowMs);
  setSyncingActiveState();

  let savedToFirestore = false;
  let savedToApi = false;

  try {
    savedToFirestore = await saveClassesToFirestoreCloud(classes, nowMs);
    if (cloudLinks || discoveredNominalPdfs) {
      await saveConfigMetaToFirestoreCloud({
        ...(cloudLinks ? { cloudLinks } : {}),
        ...(discoveredNominalPdfs ? { discoveredNominalPdfs } : {}),
      });
    }
  } catch {
    // fallback to API
  }

  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const opId = `op-classes-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const res = await fetch('/api/school-state/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({
          classes,
          classesUpdatedAtMs: nowMs,
          opId,
          ...(cloudLinks ? { cloudLinks } : {}),
          ...(discoveredNominalPdfs ? { discoveredNominalPdfs } : {}),
        }),
      });
      if (res.ok) {
        savedToApi = true;
      }
    } catch {
      // offline or serverless cold start
    }
  }

  if (savedToFirestore || savedToApi) {
    markSyncOperationSuccess('save_classes');
    return true;
  } else {
    enqueuePendingSyncOperation(
      'save_classes',
      `Alterações de frequência/cadastro (${classes.length} turmas)`,
      'Dispositivo offline — alterações salvas na fila para sincronização automática'
    );
    return false;
  }
};

export const pushCloudLinksToServer = async (
  cloudLinks: SharedCloudLinks,
  discoveredNominalPdfs?: any[],
  discoveredDrivePhotos?: any[]
): Promise<void> => {
  setSyncingActiveState();
  let saved = false;
  try {
    const ok = await saveConfigMetaToFirestoreCloud({
      cloudLinks,
      ...(discoveredNominalPdfs ? { discoveredNominalPdfs } : {}),
      ...(discoveredDrivePhotos ? { discoveredDrivePhotos } : {}),
    });
    if (ok) saved = true;
  } catch {
    // ignore
  }
  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const res = await fetch('/api/school-state/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({
          cloudLinks,
          ...(discoveredNominalPdfs ? { discoveredNominalPdfs } : {}),
          ...(discoveredDrivePhotos ? { discoveredDrivePhotos } : {}),
        }),
      });
      if (res.ok) saved = true;
    } catch {
      // ignore offline
    }
  }
  if (saved) {
    markSyncOperationSuccess('save_links');
  } else {
    enqueuePendingSyncOperation(
      'save_links',
      'Vínculos de pastas e arquivos Google Drive',
      'Aguardando conexão para sincronizar metadados do Drive'
    );
  }
};

export const flushPendingOfflineQueue = async (): Promise<boolean> => {
  const classes = getStoredClasses();
  const users = getStoredAuthorizedUsers();
  const windowCfg = getStoredAttendanceWindowConfig();
  const notices = getStoredSchoolNotices();
  const okClasses = await pushClassesToServer(classes);
  await pushAuthorizedUsersToServer(users);
  await pushAttendanceWindowToServer(windowCfg);
  await pushSchoolNoticesToServer(notices);
  return okClasses;
};

// Automatically flush offline queue whenever browser regains internet connectivity
registerOfflineFlushHandler(async () => {
  await flushPendingOfflineQueue();
});

export const pullSharedSchoolStateFromServer = async (): Promise<{
  authorizedUsers?: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  attendanceWindowConfig?: AttendanceWindowConfig;
  schoolNotices?: SchoolNotice[];
  classes?: ClassGroup[];
  classesUpdatedAtMs?: number;
  cloudLinks?: SharedCloudLinks;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
} | null> => {
  try {
    let apiData: any = null;
    if (isBackendApiAvailable()) {
      try {
        const headers = await getActiveUserAuthHeadersAsync();
        const res = await fetch('/api/school-state', {
          cache: 'no-store',
          headers,
          credentials: 'include',
        });
        if (res.ok) {
          apiData = await res.json();
        }
      } catch {
        // API unreachable or serverless route not active; fallback to Firestore Cloud
      }
    }

    // If API has no classes (e.g. static hosting on GitHub Pages or fresh container), pull from Cloud Firestore!
    let firestoreData: any = null;
    if (!apiData || !Array.isArray(apiData.classes) || apiData.classes.length === 0) {
      firestoreData = await fetchStateFromFirestoreCloud();
    }

    const data =
      apiData && Array.isArray(apiData.classes) && apiData.classes.length > 0
        ? apiData
        : firestoreData || apiData;

    if (!data) return null;

    const result: {
      authorizedUsers?: AuthorizedUser[];
      accessSessionLogs?: UserAccessSessionLog[];
      attendanceWindowConfig?: AttendanceWindowConfig;
      schoolNotices?: SchoolNotice[];
      classes?: ClassGroup[];
      classesUpdatedAtMs?: number;
      cloudLinks?: SharedCloudLinks;
      discoveredNominalPdfs?: any[];
      discoveredDrivePhotos?: any[];
    } = {};

    if (Array.isArray(data?.schoolNotices)) {
      const sliced = data.schoolNotices.slice(0, 60);
      memoryCachedNotices = sliced;
      safeSetLocalStorage(NOTICES_STORAGE_KEY, JSON.stringify(sliced));
      result.schoolNotices = sliced;
    }

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

    if (Array.isArray(data?.accessSessionLogs)) {
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

    if (data?.cloudLinks && typeof data.cloudLinks === 'object') {
      const cl: SharedCloudLinks = data.cloudLinks;
      if (cl.spreadsheetId) {
        safeSetLocalStorage('emeb_candelario_linked_spreadsheet_id_2027', cl.spreadsheetId);
      }
      if (cl.spreadsheetTitle) {
        safeSetLocalStorage(
          'emeb_candelario_linked_spreadsheet_title_2027',
          cl.spreadsheetTitle
        );
      }
      if (cl.photosFolderId) {
        safeSetLocalStorage('emeb_candelario_drive_photos_folder_id_2027', cl.photosFolderId);
      }
      if (cl.photosFolderUrl) {
        safeSetLocalStorage('emeb_candelario_drive_photos_folder_url_2027', cl.photosFolderUrl);
      }
      if (cl.fichasPdfFolderId) {
        safeSetLocalStorage(
          'emeb_candelario_drive_fichas_pdf_folder_id_2027',
          cl.fichasPdfFolderId
        );
      }
      if (cl.fichasPdfFolderUrl) {
        safeSetLocalStorage(
          'emeb_candelario_drive_fichas_pdf_folder_url_2027',
          cl.fichasPdfFolderUrl
        );
      }
      result.cloudLinks = cl;
    }

    if (Array.isArray(data?.discoveredNominalPdfs) && data.discoveredNominalPdfs.length > 0) {
      safeSetLocalStorage(
        'emeb_candelario_discovered_nominal_pdfs_2027_v1',
        JSON.stringify(data.discoveredNominalPdfs)
      );
      result.discoveredNominalPdfs = data.discoveredNominalPdfs;
    }

    if (Array.isArray(data?.discoveredDrivePhotos) && data.discoveredDrivePhotos.length > 0) {
      safeSetLocalStorage(
        'emeb_candelario_discovered_drive_photos_2027_v1',
        JSON.stringify(data.discoveredDrivePhotos)
      );
      result.discoveredDrivePhotos = data.discoveredDrivePhotos;
    }

    if (Array.isArray(data?.classes) && data.classes.length > 0) {
      const srvClassesTime = data.classesUpdatedAtMs || 0;
      const locClassesTime = getLocalClassesUpdatedAtMs();
      const allowIntegrityOverwrite = shouldAllowRemoteClassesOverwrite({
        remoteUpdatedAtMs: srvClassesTime,
        remoteEpochId: data.cleanResetEpochId,
        remoteEpochVersion: data.epochVersion,
        fromCache: false,
      });
      if (allowIntegrityOverwrite && (locClassesTime === 0 || srvClassesTime >= locClassesTime)) {
        const currentLocal = memoryCachedClasses || getStoredClasses();
        const merged = mergeClassesWithConcurrencyControl(
          data.classes,
          currentLocal,
          srvClassesTime,
          locClassesTime
        );
        const enriched = enrichClassesWithOfficialMatrix(merged);
        memoryCachedClasses = enriched;
        if (srvClassesTime > 0) {
          setLocalClassesUpdatedAtMs(Math.max(srvClassesTime, locClassesTime));
        }
        safeSetLocalStorage(STORAGE_KEY, JSON.stringify(enriched));
        result.classes = enriched;
        result.classesUpdatedAtMs = srvClassesTime;
      }
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

// Expiration date helpers imported & re-exported from ./authSessionService

export const syncExpiredAuthorizedUsers = (
  users: AuthorizedUser[],
  referenceDate: Date = new Date()
): { updatedUsers: AuthorizedUser[]; expiredUsers: AuthorizedUser[]; changed: boolean } => {
  const nowMs = Date.now();
  const expiredUsers: AuthorizedUser[] = [];
  const updatedUsers = users.map((u) => {
    if (u.active && isUserAccessExpired(u, referenceDate)) {
      expiredUsers.push(u);
      return {
        ...u,
        active: false,
        updatedAtMs: nowMs,
      };
    }
    return u;
  });
  return {
    updatedUsers,
    expiredUsers,
    changed: expiredUsers.length > 0,
  };
};

/**
 * Exclusão lógica (soft delete) com retenção de histórico para tolerância zero à perda de dados
 */
export const softDeleteStudent = (
  classId: string,
  studentId: string,
  reason: string = 'Inativação / Transferência'
): boolean => {
  const current = getStoredClasses();
  let modified = false;
  const updated = current.map((cls) => {
    if (cls.id !== classId) return cls;
    const updatedStudents = cls.students.map((st) => {
      if (st.id !== studentId) return st;
      modified = true;
      return {
        ...st,
        isDeleted: true,
        deletedAtISO: new Date().toISOString(),
        situacao: 'BXTR',
        updatedAtMs: Date.now(),
      };
    });
    return {
      ...cls,
      students: updatedStudents,
      updatedAtMs: Date.now(),
    };
  });
  if (modified) {
    saveStoredClasses(updated);
    addSecurityAuditLog({
      userEmail: 'emebjfreitas@jundiai.sp.gov.br',
      userName: 'Gestão Escolar',
      userRole: 'admin',
      eventType: 'SUSPICIOUS_ACTIVITY_FLAGGED',
      actionTitle: 'Exclusão Lógica de Estudante (Soft Delete)',
      details: `Estudante ID ${studentId} inativado com exclusão lógica na turma ${classId}. Motivo: ${reason}.`,
      targetResource: `Turma ${classId} · Aluno ${studentId}`,
      severity: 'warning',
    });
    return true;
  }
  return false;
};

/**
 * Restauração de registro previamente inativado (soft delete recovery)
 */
export const restoreStudent = (
  classId: string,
  studentId: string
): boolean => {
  const current = getStoredClasses();
  let modified = false;
  const updated = current.map((cls) => {
    if (cls.id !== classId) return cls;
    const updatedStudents = cls.students.map((st) => {
      if (st.id !== studentId) return st;
      modified = true;
      return {
        ...st,
        isDeleted: false,
        deletedAtISO: undefined,
        situacao: 'ATIVO',
        updatedAtMs: Date.now(),
      };
    });
    return {
      ...cls,
      students: updatedStudents,
      updatedAtMs: Date.now(),
    };
  });
  if (modified) {
    saveStoredClasses(updated);
    addSecurityAuditLog({
      userEmail: 'emebjfreitas@jundiai.sp.gov.br',
      userName: 'Gestão Escolar',
      userRole: 'admin',
      eventType: 'SYSTEM_CONFIG_UPDATED',
      actionTitle: 'Restauração de Estudante',
      details: `Estudante ID ${studentId} restaurado com sucesso na turma ${classId}.`,
      targetResource: `Turma ${classId} · Aluno ${studentId}`,
      severity: 'info',
    });
    return true;
  }
  return false;
};

const enrichClassesWithOfficialMatrix = (loadedClasses: ClassGroup[]): ClassGroup[] => {
  const loadedMap = new Map<string, ClassGroup>();
  const normalizeClassLookupKey = (val: string) =>
    (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  (loadedClasses || []).forEach((c) => {
    if (!c) return;
    if (c.id) loadedMap.set(normalizeClassLookupKey(c.id), c);
    if (c.turmaAbrev) loadedMap.set(normalizeClassLookupKey(c.turmaAbrev), c);
    if (c.sedClassName) loadedMap.set(normalizeClassLookupKey(c.sedClassName), c);
    if (c.name) loadedMap.set(normalizeClassLookupKey(c.name), c);
  });

  return INITIAL_CLASSES.map((off) => {
    const loaded =
      loadedMap.get(normalizeClassLookupKey(off.id)) ||
      (off.turmaAbrev ? loadedMap.get(normalizeClassLookupKey(off.turmaAbrev)) : undefined) ||
      (off.sedClassName ? loadedMap.get(normalizeClassLookupKey(off.sedClassName)) : undefined) ||
      loadedMap.get(normalizeClassLookupKey(off.name));
    if (!loaded) return off;

    // Preserva integralmente os estudantes carregados/importados (inclusive lista vazia [])
    const baseStudents = Array.isArray(loaded.students) ? loaded.students : off.students;
    const seenStudentKeysInClass = new Set<string>();
    const deduplicatedBaseStudents: Student[] = [];
    baseStudents.forEach((st) => {
      if (!st || !st.name) return;
      const normName = st.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
      const raKey = (st.ra || '').trim();
      const dedupKey = raKey ? `ra:${raKey}|name:${normName}` : `name:${normName}`;
      if (seenStudentKeysInClass.has(dedupKey)) return;
      seenStudentKeysInClass.add(dedupKey);
      deduplicatedBaseStudents.push(st);
    });

    const offStudentByRa = new Map<string, Student>();
    const offStudentByName = new Map<string, Student>();
    off.students.forEach((ost) => {
      if (ost.ra) offStudentByRa.set(String(ost.ra).trim(), ost);
      if (ost.name) {
        offStudentByName.set(normalizeClassLookupKey(ost.name), ost);
      }
    });

    const seenStudentIdsInClass = new Set<string>();
    const enrichedStudents = deduplicatedBaseStudents.map((st, idx) => {
      const num = st.number || idx + 1;
      let cleanStudentId = st.id || `${off.id}-s${num}`;
      if (seenStudentIdsInClass.has(cleanStudentId)) {
        cleanStudentId = `${off.id}-s${num}-i${idx + 1}`;
      }
      seenStudentIdsInClass.add(cleanStudentId);

      const officialFallback =
        (st.ra ? offStudentByRa.get(String(st.ra).trim()) : undefined) ||
        offStudentByName.get(normalizeClassLookupKey(st.name));

      const studentNameClean = String(st.name || st.estudante || '').trim();
      const nameParts = studentNameClean.split(/\s+/).filter(Boolean);
      const computedInitials =
        nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
          : studentNameClean.slice(0, 2).toUpperCase();

      const resolvedNis =
        st.nis !== undefined && st.nis !== '' ? st.nis : officialFallback?.nis || '';

      return {
        ...(officialFallback || {}),
        ...st,
        id: cleanStudentId,
        number: num,
        numeroChamada: st.numeroChamada || num,
        initials: st.initials || officialFallback?.initials || computedInitials,
        genero: st.genero || officialFallback?.genero || resolveStudentGender(st),
        nis: resolvedNis || undefined,
      };
    });

    const isEmptyClass = enrichedStudents.length === 0;

    return {
      ...loaded,
      ...off, // Always enforce official 2027 teacher and shift
      students: enrichedStudents,
      totalStudents: enrichedStudents.length,
      classesHeld: loaded.classesHeld ?? off.classesHeld,
      classesPlanned: loaded.classesPlanned ?? off.classesPlanned,
      monthlySchoolDays: loaded.monthlySchoolDays || off.monthlySchoolDays,
      pedagogicalNotes: isEmptyClass ? loaded.pedagogicalNotes || '' : loaded.pedagogicalNotes || off.pedagogicalNotes,
      statusText: loaded.statusText || off.statusText,
      monthlyAbsences: isEmptyClass ? 0 : (loaded.monthlyAbsences ?? off.monthlyAbsences),
      presenceRate: isEmptyClass ? 0 : (loaded.presenceRate ?? off.presenceRate),
      weeklyPerformance: isEmptyClass ? [] : (loaded.weeklyPerformance || off.weeklyPerformance),
      driveFolderUrl: loaded.driveFolderUrl || off.driveFolderUrl,
      updatedAtMs: Math.max(loaded.updatedAtMs || 0, off.updatedAtMs || 0),
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
      if (Array.isArray(parsed) && parsed.length === 40) {
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

let serverClassesPushTimer: number | null = null;

// Save classes to localStorage safely without throwing QuotaExceededError + auto-broadcast to server
export const saveStoredClasses = (
  classes: ClassGroup[],
  skipServerPush: boolean | 'local_with_timestamp' = false
): void => {
  const enriched = enrichClassesWithOfficialMatrix(classes);
  memoryCachedClasses = enriched;
  void persistStudentPhotoUrlsToIndexedDb(enriched);
  if (skipServerPush !== true && typeof window !== 'undefined') {
    setLocalClassesUpdatedAtMs(Date.now());
    if (skipServerPush === false) {
      if (serverClassesPushTimer) {
        window.clearTimeout(serverClassesPushTimer);
      }
      serverClassesPushTimer = window.setTimeout(() => {
        pushClassesToServer(enriched);
      }, 500);
    }
  }
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

registerClassesCalendarCascadeHandler((monthlyDistribution) => {
  const currentClasses = getStoredClasses();
  const updatedClasses = currentClasses.map((cls) => ({
    ...cls,
    classesHeld: monthlyDistribution['Outubro'] || cls.classesHeld || 20,
    monthlySchoolDays: {
      ...(cls.monthlySchoolDays || {}),
      ...monthlyDistribution,
    },
    updatedAtMs: Date.now(),
  }));
  saveStoredClasses(updatedClasses);
});

// -------------------------------------------------------------
// RECURSO DE ATUALIZAÇÃO E RESTAURAÇÃO VIA ARQUIVO JSON (SEGURO)
// -------------------------------------------------------------

export interface SchoolJsonBackup {
  version: number;
  app: string;
  school: string;
  exportedAtISO: string;
  exportedBy: string;
  totalClasses: number;
  totalStudents: number;
  classes: ClassGroup[];
  authorizedUsers?: AuthorizedUser[];
  officialCalendarConfig?: any;
  holidays?: any[];
}

/**
 * Exporta o banco escolar completo em arquivo .json formatado e higienizado para backup ou auditoria
 */
export const exportSchoolDataToJsonFile = (
  classes: ClassGroup[],
  userEmail = 'emebjfreitas@jundiai.sp.gov.br'
): void => {
  const totalStudents = classes.reduce((acc, c) => acc + (c.students?.length || 0), 0);
  const backup: SchoolJsonBackup = {
    version: 1,
    app: 'Lista Piloto Candelário 2027 · EMEB Prof. Joaquim Candelário de Freitas',
    school: 'EMEB Prof. Joaquim Candelário de Freitas (SME Jundiaí)',
    exportedAtISO: new Date().toISOString(),
    exportedBy: userEmail,
    totalClasses: classes.length,
    totalStudents,
    classes,
    authorizedUsers: getStoredAuthorizedUsers(),
  };

  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateSuffix = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.setAttribute('download', `emeb_candelario_backup_escolar_2027_${dateSuffix}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  addSecurityAuditLog({
    userEmail,
    userName: 'Administrador Escolar Candelário',
    userRole: 'admin',
    eventType: 'JSON_DATA_EXPORT_GENERATED',
    actionTitle: 'Exportação de Backup JSON Oficial',
    details: `Backup completo exportado em JSON (${classes.length} turmas, ${totalStudents} estudantes)`,
    severity: 'info',
  });
};

const stripScriptTags = (value: string): string =>
  value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/\bon\w+\s*=/gi, '')
    .trim();

const normalizeJsonKey = (key: string): string =>
  key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildNormalizedKeyLookup = (rawObj: Record<string, any>): Map<string, any> => {
  const map = new Map<string, any>();
  Object.entries(rawObj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const nk = normalizeJsonKey(k);
    if (!map.has(nk) || (String(map.get(nk)).trim() === '' && String(v).trim() !== '')) {
      map.set(nk, v);
    }
  });
  return map;
};

const pickJsonValue = (lookup: Map<string, any>, aliases: string[]): string => {
  for (const alias of aliases) {
    const val = lookup.get(normalizeJsonKey(alias));
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return stripScriptTags(String(val));
    }
  }
  return '';
};

const normalizeRawJsonStudentRow = (
  rawSt: any,
  clsId: string,
  sIdx: number
): Student => {
  const lookup = buildNormalizedKeyLookup(rawSt || {});

  const studentName =
    pickJsonValue(lookup, [
      'name',
      'estudante',
      'nome',
      'nome_estudante',
      'nome_do_estudante',
      'nome_aluno',
      'nome_do_aluno',
      'aluno',
      'nomeoficial',
      'nomecompleto',
    ]) || `Estudante ${sIdx + 1}`;

  const rawNum = pickJsonValue(lookup, [
    'number',
    'numeroChamada',
    'numero_chamada',
    'numero_de_chamada',
    'num_chamada',
    'chamada',
    'nro',
  ]);
  const studentNumber = Number(rawNum) || sIdx + 1;

  const rawRa = pickJsonValue(lookup, ['ra', 'registro_estudante', 'registro_do_estudante', 'registroaluno']);
  let cleanRa = rawRa;
  let digRa = pickJsonValue(lookup, ['digRa', 'dig_ra', 'digito_ra', 'digito_do_ra', 'digito', 'dv_ra']);
  if (!digRa && rawRa.includes('-')) {
    const [base, dv] = rawRa.split('-');
    cleanRa = (base || '').trim();
    digRa = (dv || '').trim();
  }

  const situacaoRaw =
    pickJsonValue(lookup, ['situacao', 'situacao_matricula', 'situacao_da_matricula', 'status_matricula']) || 'ATIVO';
  const situacaoUpper = situacaoRaw.toUpperCase();
  const isInactive =
    situacaoUpper.includes('BXTR') ||
    situacaoUpper.includes('TRANSF') ||
    situacaoUpper.includes('REMA');

  const filiacao1 = pickJsonValue(lookup, [
    'filiacao1',
    'filiacao_1',
    'mae',
    'nome_mae',
    'nome_da_mae',
    'responsavel_1',
    'responsavel1',
    'guardianName',
  ]);
  const filiacao2 = pickJsonValue(lookup, [
    'filiacao2',
    'filiacao_2',
    'pai',
    'nome_pai',
    'nome_do_pai',
    'responsavel_2',
    'responsavel2',
  ]);
  const telefones = pickJsonValue(lookup, [
    'telefones',
    'telefone',
    'celular',
    'whatsapp',
    'fone',
    'contato',
    'guardianPhone',
  ]);

  const absencesVal = Number(
    pickJsonValue(lookup, ['totalAbsencesMonth', 'faltas', 'faltas_mes', 'total_faltas']) ||
      rawSt.totalAbsencesMonth ||
      0
  );
  const justifiedVal = Number(
    pickJsonValue(lookup, ['justifiedAbsences', 'faltas_justificadas', 'atestados']) ||
      rawSt.justifiedAbsences ||
      0
  );

  const nameParts = studentName.split(/\s+/).filter(Boolean);
  const computedInitials =
    pickJsonValue(lookup, ['initials', 'iniciais']) ||
    (nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
      : studentName.slice(0, 2).toUpperCase());

  const generoVal = pickJsonValue(lookup, ['genero', 'sexo']);

  const safeStudent: Student = {
    ...rawSt,
    id: String(rawSt.id || `sed-${clsId}-${cleanRa.replace(/\D/g, '') || studentNumber}`),
    number: studentNumber,
    numeroChamada: studentNumber,
    name: studentName,
    estudante: studentName,
    ra: cleanRa,
    digRa: digRa || '',
    ufRa: pickJsonValue(lookup, ['ufRa', 'uf_ra']) || 'SP',
    dataNascimento: pickJsonValue(lookup, ['dataNascimento', 'data_nascimento', 'data_de_nascimento', 'nascimento', 'dt_nasc']),
    tipoEnsino: pickJsonValue(lookup, ['tipoEnsino', 'tipo_ensino', 'tipo_de_ensino', 'etapa_ensino', 'etapa_de_ensino', 'etapa']),
    serie: pickJsonValue(lookup, ['serie', 'ano_escolar', 'ano']),
    tipoAlocacao: pickJsonValue(lookup, ['tipoAlocacao', 'tipo_alocacao', 'tipo_de_alocacao']),
    situacao: situacaoUpper,
    dataMovimentacao: pickJsonValue(lookup, ['dataMovimentacao', 'data_movimentacao', 'data_de_movimentacao', 'data_saida']),
    categoriaProfissionalCenso: pickJsonValue(lookup, ['categoriaProfissionalCenso', 'categoria_profissional']),
    deficiencia: pickJsonValue(lookup, ['deficiencia', 'aee', 'educacao_especial', 'necessidade_especial']),
    posDataCenso: pickJsonValue(lookup, ['posDataCenso', 'pos_data_censo']),
    turma: pickJsonValue(lookup, ['turma', 'turma_abrev']) || rawSt.turma || '',
    periodo: pickJsonValue(lookup, ['periodo', 'turno']),
    dataMatriculaSed: pickJsonValue(lookup, ['dataMatriculaSed', 'data_matricula', 'data_de_matricula', 'dt_matricula']),
    procedenciaEscolar: pickJsonValue(lookup, ['procedenciaEscolar', 'procedencia_escolar', 'escola_origem', 'escola_de_origem', 'escola']),
    irmaos: pickJsonValue(lookup, ['irmaos']),
    idade: pickJsonValue(lookup, ['idade']),
    arquivo: pickJsonValue(lookup, ['arquivo', 'pasta']),
    filiacao1: filiacao1 || rawSt.filiacao1 || undefined,
    filiacao2: filiacao2 || rawSt.filiacao2 || undefined,
    nomeSocial: pickJsonValue(lookup, ['nomeSocial', 'nome_social']) || undefined,
    genero: generoVal || resolveStudentGender({ name: studentName, estudante: studentName }),
    tipoSanguineo: pickJsonValue(lookup, ['tipoSanguineo', 'tipo_sanguineo', 'sangue', 'fator_rh']) || undefined,
    racaCor: pickJsonValue(lookup, ['racaCor', 'raca_cor', 'raca', 'cor']) || undefined,
    nacionalidade: pickJsonValue(lookup, ['nacionalidade']) || undefined,
    paisOrigem: pickJsonValue(lookup, ['paisOrigem', 'pais_origem', 'pais_de_origem']) || undefined,
    municipioNascimento: pickJsonValue(lookup, ['municipioNascimento', 'municipio_nascimento', 'municipio_de_nascimento', 'naturalidade']) || undefined,
    cpf: pickJsonValue(lookup, ['cpf', 'num_cpf', 'numero_do_cpf']) || undefined,
    rg: pickJsonValue(lookup, ['rg', 'num_rg', 'numero_do_rg']) || undefined,
    dataEmissaoRg: pickJsonValue(lookup, ['dataEmissaoRg', 'data_emissao_rg', 'data_de_emissao_rg']) || undefined,
    cartaoSus: pickJsonValue(lookup, ['cartaoSus', 'cartao_sus', 'sus', 'cns']) || undefined,
    nis: pickJsonValue(lookup, ['nis', 'num_nis', 'bolsa_familia']) || undefined,
    cep: pickJsonValue(lookup, ['cep']) || undefined,
    logradouro: pickJsonValue(lookup, ['logradouro', 'endereco', 'rua']) || undefined,
    numeroResidencia: pickJsonValue(lookup, ['numeroResidencia', 'numero_residencia', 'numero_da_residencia', 'numero', 'nro_casa']) || undefined,
    complemento: pickJsonValue(lookup, ['complemento']) || undefined,
    bairro: pickJsonValue(lookup, ['bairro']) || undefined,
    cidade: pickJsonValue(lookup, ['cidade', 'municipio']) || undefined,
    uf: pickJsonValue(lookup, ['uf', 'estado']) || undefined,
    telefones: telefones || undefined,
    emailGoogle: pickJsonValue(lookup, ['emailGoogle', 'email_google']) || undefined,
    emailMicrosoft: pickJsonValue(lookup, ['emailMicrosoft', 'email_microsoft']) || undefined,
    emailMunicipal: pickJsonValue(lookup, ['emailMunicipal', 'email_municipal', 'email']) || undefined,
    sucessaoEscolar: pickJsonValue(lookup, ['sucessaoEscolar', 'sucessao_escolar']) || undefined,
    guardianName: filiacao1 || rawSt.guardianName || undefined,
    guardianPhone: telefones || rawSt.guardianPhone || undefined,
    notes: pickJsonValue(lookup, ['notes', 'observacoes', 'observacao']) || rawSt.notes || undefined,
    initials: computedInitials,
    active: !isInactive,
    status: rawSt.status || (isInactive || absencesVal > 0 ? 'absent' : 'present'),
    totalAbsencesMonth: absencesVal,
    justifiedAbsences: justifiedVal,
    consecutiveDays: Number(rawSt.consecutiveDays) || 0,
    consecutiveTier: rawSt.consecutiveTier || 'none',
    consecutiveSelectedDates: Array.isArray(rawSt.consecutiveSelectedDates)
      ? rawSt.consecutiveSelectedDates
      : [],
    presenceDates: Array.isArray(rawSt.presenceDates) ? rawSt.presenceDates : [],
    absentDates: Array.isArray(rawSt.absentDates) ? rawSt.absentDates : [],
    justifiedAbsenceDates: Array.isArray(rawSt.justifiedAbsenceDates)
      ? rawSt.justifiedAbsenceDates
      : [],
  };

  return safeStudent;
};

const isClassObjectShape = (item: any): boolean => {
  if (!item || typeof item !== 'object') return false;
  return (
    Array.isArray(item.students) ||
    Array.isArray(item.estudantes) ||
    Array.isArray(item.alunos)
  );
};

/**
 * Validação rigorosa e sanitização do JSON fornecido por arraste e solte
 * Suporta:
 *  - Backup completo `{ classes: [...] }` ou `[ { id, name, students: [...] } ]`
 *  - Planilhas/Listas SED em JSON plano `[ { TURMA, ESTUDANTE, RA, FILIAÇÃO 1, CPF, ... } ]`
 *  - Objetos encapsulados `{ estudantes: [...] }`, `{ alunos: [...] }`, `{ students: [...] }`, `{ data: [...] }`, `{ rows: [...] }`
 */
export const validateAndSanitizeJsonPayload = (
  rawJson: any
): {
  isValid: boolean;
  error?: string;
  classes?: ClassGroup[];
  totalStudents?: number;
  importedClassesCount?: number;
  importedStudentsCount?: number;
  backupMeta?: {
    version?: number;
    exportedAtISO?: string;
    exportedBy?: string;
    school?: string;
  };
} => {
  if (!rawJson) {
    return { isValid: false, error: 'Arquivo JSON vazio ou nulo.' };
  }
  if (hasForbiddenPrototypeKey(rawJson)) {
    return {
      isValid: false,
      error: 'Arquivo JSON rejeitado por conter chaves de sistema não permitidas (__proto__/constructor/prototype).',
    };
  }

  let rawClasses: any[] | null = null;
  let flatStudentRows: any[] | null = null;
  const backupMeta: any = {};

  if (Array.isArray(rawJson)) {
    if (rawJson.length > 0 && rawJson.some(isClassObjectShape)) {
      rawClasses = rawJson;
    } else {
      flatStudentRows = rawJson;
    }
  } else if (typeof rawJson === 'object') {
    backupMeta.version = rawJson.version;
    backupMeta.exportedAtISO = rawJson.exportedAtISO;
    backupMeta.exportedBy = rawJson.exportedBy;
    backupMeta.school = rawJson.school;

    if (Array.isArray(rawJson.classes)) {
      rawClasses = rawJson.classes;
    } else if (Array.isArray(rawJson.turmas)) {
      rawClasses = rawJson.turmas;
    } else if (Array.isArray(rawJson.students)) {
      flatStudentRows = rawJson.students;
    } else if (Array.isArray(rawJson.estudantes)) {
      flatStudentRows = rawJson.estudantes;
    } else if (Array.isArray(rawJson.alunos)) {
      flatStudentRows = rawJson.alunos;
    } else if (Array.isArray(rawJson.registros)) {
      flatStudentRows = rawJson.registros;
    } else if (Array.isArray(rawJson.rows)) {
      flatStudentRows = rawJson.rows;
    } else if (Array.isArray(rawJson.data)) {
      if (rawJson.data.some(isClassObjectShape)) {
        rawClasses = rawJson.data;
      } else {
        flatStudentRows = rawJson.data;
      }
    } else {
      // Fallback universal: busca qualquer propriedade que seja array no objeto
      const allValues = Object.values(rawJson);
      const foundArray = allValues.find((v) => Array.isArray(v) && v.length > 0) as any[] | undefined;
      if (foundArray) {
        if (foundArray.some(isClassObjectShape)) {
          rawClasses = foundArray;
        } else {
          flatStudentRows = foundArray;
        }
      } else if (isClassObjectShape(rawJson)) {
        rawClasses = [rawJson];
      } else if (rawJson.estudante || rawJson.name || rawJson.nome || rawJson.RA || rawJson.ra) {
        flatStudentRows = [rawJson];
      }
    }
  }

  // Caso 1: Lista plana de estudantes (ex: exportação direta da SED em JSON)
  if (flatStudentRows && flatStudentRows.length > 0) {
    try {
      const groupedByClassId = new Map<string, any[]>();
      flatStudentRows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const lookup = buildNormalizedKeyLookup(row);
        const turmaLabel =
          pickJsonValue(lookup, [
            'turma',
            'turma_sed',
            'sedClassName',
            'classe',
            'classId',
            'turma_abrev',
            'turmaAbrev',
            'serie',
          ]) || '1A';
        const directMatch = INITIAL_CLASSES.find(
          (c) =>
            normalizeJsonKey(c.id) === normalizeJsonKey(turmaLabel) ||
            normalizeJsonKey(c.turmaAbrev || '') === normalizeJsonKey(turmaLabel) ||
            normalizeJsonKey(c.name) === normalizeJsonKey(turmaLabel) ||
            normalizeJsonKey(c.sedClassName || '') === normalizeJsonKey(turmaLabel)
        );
        const canonicalId = directMatch?.id || resolveCanonicalClassId(turmaLabel);
        if (!groupedByClassId.has(canonicalId)) {
          groupedByClassId.set(canonicalId, []);
        }
        groupedByClassId.get(canonicalId)!.push(row);
      });

      const baseClasses = getStoredClasses();
      const cleanPartialClasses: ClassGroup[] = Array.from(groupedByClassId.entries()).map(
        ([clsId, rows]) => {
          const refCls =
            baseClasses.find((c) => c.id === clsId) ||
            INITIAL_CLASSES.find((c) => c.id === clsId);
          const sortedRows = [...rows].sort((a, b) => {
            const la = buildNormalizedKeyLookup(a);
            const lb = buildNormalizedKeyLookup(b);
            const na = pickJsonValue(la, ['name', 'estudante', 'nome', 'aluno']);
            const nb = pickJsonValue(lb, ['name', 'estudante', 'nome', 'aluno']);
            return na.localeCompare(nb, 'pt-BR');
          });
          const normalizedStudents = sortedRows.map((row, idx) =>
            normalizeRawJsonStudentRow(row, clsId, idx)
          );
          return {
            ...(refCls || {
              id: clsId,
              name: clsId.toUpperCase(),
              grade: 'Ensino Fundamental I',
              shift: 'Turno Manhã' as const,
              room: 'Sala Oficial',
              teacherName: '',
              presenceRate: 95,
              statusText: '',
              isPending: false,
              monthlyAbsences: 0,
              classesHeld: 20,
              classesPlanned: 20,
              weeklyPerformance: [],
              pedagogicalNotes: '',
            }),
            students: normalizedStudents,
            totalStudents: normalizedStudents.length,
          };
        }
      );

      // Se o JSON contiver um subconjunto das turmas (ex: apenas 1 turma), preserva as demais turmas atuais em vez de zerá-las
      const mergedWithCurrent = baseClasses.map((curr) => {
        const updated = cleanPartialClasses.find((u) => u.id === curr.id);
        return updated || curr;
      });

      const enriched = enrichClassesWithOfficialMatrix(mergedWithCurrent);
      const totalStudents = enriched.reduce((acc, c) => acc + c.students.length, 0);
      const importedStudentsCount = cleanPartialClasses.reduce(
        (acc, c) => acc + c.students.length,
        0
      );

      return {
        isValid: true,
        classes: enriched,
        totalStudents,
        importedClassesCount: cleanPartialClasses.length,
        importedStudentsCount,
        backupMeta,
      };
    } catch (err: any) {
      return {
        isValid: false,
        error: `Erro ao converter registros de estudantes do JSON: ${err?.message || 'Formato incompatível'}`,
      };
    }
  }

  if (!rawClasses || !Array.isArray(rawClasses) || rawClasses.length === 0) {
    return {
      isValid: false,
      error:
        'Estrutura JSON não reconhecida. Envie um backup com "classes"/"turmas" ou uma lista de estudantes da SED (com "ESTUDANTE" e "TURMA").',
    };
  }

  // Caso 2: Estrutura agrupada por turmas (`classes` ou `turmas`)
  try {
    const cleanClasses: ClassGroup[] = rawClasses.map((rawCls, cIdx) => {
      const lookupCls = buildNormalizedKeyLookup(rawCls || {});
      const rawIdOrName =
        pickJsonValue(lookupCls, ['id', 'classId', 'turmaAbrev', 'sedClassName', 'name', 'turma']) ||
        `turma-${cIdx + 1}`;
      const matchedOfficial = INITIAL_CLASSES.find(
        (c) =>
          normalizeJsonKey(c.id) === normalizeJsonKey(rawIdOrName) ||
          normalizeJsonKey(c.turmaAbrev || '') === normalizeJsonKey(rawIdOrName) ||
          normalizeJsonKey(c.sedClassName || '') === normalizeJsonKey(rawIdOrName) ||
          normalizeJsonKey(c.name) === normalizeJsonKey(rawIdOrName)
      );
      const clsId = matchedOfficial?.id || String(rawCls.id || resolveCanonicalClassId(rawIdOrName) || `turma-${cIdx + 1}`).trim();
      const clsName = stripScriptTags(String(rawCls.name || matchedOfficial?.name || `Turma ${cIdx + 1}`));
      const rawStudents = Array.isArray(rawCls.students)
        ? rawCls.students
        : Array.isArray(rawCls.estudantes)
        ? rawCls.estudantes
        : Array.isArray(rawCls.alunos)
        ? rawCls.alunos
        : [];

      const cleanStudents: Student[] = rawStudents.map((rawSt: any, sIdx: number) =>
        normalizeRawJsonStudentRow(rawSt, clsId, sIdx)
      );

      const totalAbsences = cleanStudents.reduce((acc, s) => acc + (s.totalAbsencesMonth || 0), 0);
      const classesHeld = Number(rawCls.classesHeld) || 20;

      const safeClass: ClassGroup = {
        ...rawCls,
        id: clsId,
        name: clsName,
        totalStudents: cleanStudents.length,
        students: cleanStudents,
        monthlyAbsences: totalAbsences,
        classesHeld,
        presenceRate: Number(rawCls.presenceRate) || 95,
        shift: rawCls.shift || matchedOfficial?.shift || 'Turno Manhã',
        grade: rawCls.grade || matchedOfficial?.grade || 'Ensino Fundamental I',
        room: rawCls.room || matchedOfficial?.room || 'Sala Oficial',
      };
      return safeClass;
    });

    // Preserva turmas não incluídas caso seja uma importação parcial de turmas
    const baseClasses = getStoredClasses();
    const cleanMap = new Map(cleanClasses.map((c) => [c.id, c]));
    const combinedClasses =
      cleanClasses.length < 40
        ? baseClasses.map((curr) => cleanMap.get(curr.id) || curr)
        : cleanClasses;

    const enriched = enrichClassesWithOfficialMatrix(combinedClasses);
    const totalStudents = enriched.reduce((acc, c) => acc + c.students.length, 0);
    const importedStudentsCount = cleanClasses.reduce((acc, c) => acc + c.students.length, 0);

    return {
      isValid: true,
      classes: enriched,
      totalStudents,
      importedClassesCount: cleanClasses.length,
      importedStudentsCount,
      backupMeta,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `Erro ao validar os registros internos das turmas: ${err?.message || 'Arquivo corrompido'}`,
    };
  }
};

/**
 * Aplica a importação do JSON com gravação atômica local, backend e Firestore
 */
export const importSchoolDataFromJson = async (
  validatedClasses: ClassGroup[],
  fileName = 'backup.json',
  fileSize = '0 KB',
  userEmail = 'emebjfreitas@jundiai.sp.gov.br'
): Promise<{ ok: boolean; error?: string }> => {
  const nowMs = Date.now();
  try {
    // 1. Atualizar cache e LocalStorage
    saveStoredClasses(validatedClasses);

    // 2. Tentar persistência no backend Node.js
    if (isBackendApiAvailable()) {
      try {
        const headers = await getActiveUserAuthHeadersAsync();
        await fetch('/api/school-state/import-json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          credentials: 'include',
          body: JSON.stringify({
            payload: { classes: validatedClasses },
            fileName,
            fileSize,
          }),
        });
      } catch (e) {
        console.warn('Aviso: falha na rota /api/school-state/import-json, tentando /api/school-state/classes', e);
        await pushClassesToServer(validatedClasses);
      }
    }

    // 3. Sincronizar com Firestore Cloud
    try {
      await saveClassesToFirestoreCloud(validatedClasses, nowMs);
    } catch (e) {
      console.warn('Aviso: sincronização Firestore Cloud em segundo plano:', e);
    }

    // 4. Registrar log de auditoria
    const totalStudents = validatedClasses.reduce((acc, c) => acc + c.students.length, 0);
    addSecurityAuditLog({
      userEmail,
      userName: 'Administrador Escolar Candelário',
      userRole: 'admin',
      eventType: 'JSON_DATA_IMPORT_APPLIED',
      actionTitle: 'Importação e Atualização de Dados via JSON',
      details: `Banco escolar atualizado com sucesso via arquivo "${fileName}" (${validatedClasses.length} turmas, ${totalStudents} estudantes, ${fileSize}).`,
      severity: 'info',
    });

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Falha ao salvar dados importados.' };
  }
};

/**
 * Limpa apenas os dados do banco de dados (estudantes, faltas, alertas, avisos, logs e mídias),
 * mantendo contas autorizadas, estrutura das 40 turmas e calendário de 200 dias intactos.
 */
export const resetEntireAppData = async (
  _userEmail = 'emebjfreitas@jundiai.sp.gov.br'
): Promise<ClassGroup[]> => {
  const nowMs = Date.now();
  clearLocalSchoolDataOnly();
  clearStoredSecurityAuditLogs();
  try {
    localStorage.setItem(DB_CLEAN_EPOCH_STORAGE_KEY, CLEAN_DB_RESET_EPOCH_ID);
  } catch {
    // ignore storage errors
  }

  // Gera turmas limpas sem estudantes e com métricas zeradas
  const pristineClasses: ClassGroup[] = INITIAL_CLASSES.map((c) => ({
    ...c,
    students: [],
    totalStudents: 0,
    monthlyAbsences: 0,
    presenceRate: 0,
    statusText: 'Aguardando importação de estudantes',
    isPending: false,
    weeklyPerformance: [],
    pedagogicalNotes: '',
    updatedAtMs: nowMs,
  }));

  memoryCachedClasses = pristineClasses;
  saveStoredClasses(pristineClasses, true);
  setLocalClassesUpdatedAtMs(nowMs);

  // Notificar backend
  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      await fetch('/api/school-state/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({ freshClasses: pristineClasses }),
      });
    } catch (e) {
      console.warn('Aviso: falha na rota /api/school-state/reset:', e);
    }
  }

  // Limpar apenas os dados no Firestore Cloud
  try {
    await wipeFirestoreSchoolDataOnly(pristineClasses, CLEAN_DB_RESET_EPOCH_ID);
  } catch (e) {
    console.warn('Aviso: falha ao limpar dados no Firestore:', e);
  }

  return pristineClasses;
};

export interface BatchUploadProgress {
  completedChunks: number;
  totalChunks: number;
  processedItems: number;
  totalItems: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface BinaryPhotoUploadInput {
  studentId: string;
  bytes: Uint8Array;
  sha256: string;
  mimeType?: string;
  ext?: string;
}

export interface BinaryPdfUploadInput {
  studentId: string;
  bytes: Uint8Array;
  sha256: string;
}

const buildBinaryUploadPacket = (
  items: Array<{
    studentId: string;
    bytes: Uint8Array;
    sha256: string;
    mimeType?: string;
    ext?: string;
  }>
): ArrayBuffer => {
  const metaJson = JSON.stringify({
    items: items.map((it) => ({
      studentId: it.studentId,
      sha256: it.sha256,
      mimeType: it.mimeType,
      ext: it.ext,
      byteLength: it.bytes.byteLength,
    })),
  });
  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metaJson);
  const payloadSize = items.reduce((acc, it) => acc + it.bytes.byteLength, 0);
  const totalSize = 8 + metaBytes.byteLength + payloadSize;
  const packet = new Uint8Array(totalSize);
  const view = new DataView(packet.buffer);

  // Magic "EMEB"
  packet[0] = 0x45;
  packet[1] = 0x4d;
  packet[2] = 0x45;
  packet[3] = 0x42;
  view.setUint32(4, metaBytes.byteLength, false);
  packet.set(metaBytes, 8);

  let offset = 8 + metaBytes.byteLength;
  for (const it of items) {
    packet.set(it.bytes, offset);
    offset += it.bytes.byteLength;
  }

  return packet.buffer;
};

const fetchWithExponentialBackoff = async (
  url: string,
  initFactory: () => Promise<RequestInit>,
  maxAttempts = 3,
  signal?: AbortSignal
): Promise<Response> => {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Envio cancelado pelo usuário.', 'AbortError');
    }
    try {
      const init = await initFactory();
      const res = await fetch(url, { ...init, signal, credentials: 'include' });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      lastError = err;
    }
    if (attempt < maxAttempts) {
      const delayMs = 600 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError || new Error('Falha de rede após múltiplas tentativas.');
};

/**
 * Upload individual de foto pelo PEB I ou Admin para o servidor central (binário econômico preferencial)
 */
export const uploadStudentPhotoViaApi = async (
  studentId: string,
  photoDataUrlOrBinary:
    | string
    | { bytes: Uint8Array; sha256: string; mimeType?: string; fallbackDataUrl?: string }
): Promise<{ ok: boolean; photoUrl?: string; sha256?: string; skipped?: boolean; error?: string }> => {
  const isBinaryObj = typeof photoDataUrlOrBinary !== 'string';
  const fallbackUrl = isBinaryObj
    ? photoDataUrlOrBinary.fallbackDataUrl || ''
    : photoDataUrlOrBinary;

  if (!isBackendApiAvailable()) {
    return {
      ok: true,
      photoUrl: fallbackUrl,
      sha256: isBinaryObj ? photoDataUrlOrBinary.sha256 : undefined,
    };
  }

  try {
    if (isBinaryObj) {
      const bodyBuffer = photoDataUrlOrBinary.bytes.buffer.slice(
        photoDataUrlOrBinary.bytes.byteOffset,
        photoDataUrlOrBinary.bytes.byteOffset + photoDataUrlOrBinary.bytes.byteLength
      ) as ArrayBuffer;
      const res = await fetchWithExponentialBackoff('/api/photos/upload-binary', async () => {
        const headers = await getActiveUserAuthHeadersAsync();
        return {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/octet-stream',
            'x-student-id': studentId,
            'x-file-sha256': photoDataUrlOrBinary.sha256,
          },
          body: bodyBuffer,
        };
      });
      if (res.ok) {
        const data = await res.json();
        return {
          ok: true,
          photoUrl: data.photoUrl || fallbackUrl,
          sha256: data.sha256 || photoDataUrlOrBinary.sha256,
          skipped: Boolean(data.skipped),
        };
      }
      const errJson = await res.json().catch(() => ({}));
      return { ok: false, error: errJson.error || `Erro HTTP ${res.status}`, photoUrl: fallbackUrl };
    }

    const res = await fetchWithExponentialBackoff('/api/photos/upload', async () => {
      const headers = await getActiveUserAuthHeadersAsync();
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ studentId, photoDataUrl: photoDataUrlOrBinary }),
      };
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, photoUrl: data.photoUrl, sha256: data.sha256 };
    }
    const errJson = await res.json().catch(() => ({}));
    return { ok: false, error: errJson.error || `Erro HTTP ${res.status}`, photoUrl: fallbackUrl };
  } catch (e: any) {
    console.warn('Aviso: falha ao enviar foto:', e);
    return { ok: false, error: e?.message || 'Erro de rede', photoUrl: fallbackUrl };
  }
};

/**
 * Upload em lote binário por chunks para 2.000+ fotos (sem bloat base64, deduplicado, com retry exponencial)
 */
export const uploadBatchStudentPhotosViaApi = async (
  photos: Array<BinaryPhotoUploadInput | { studentId: string; photoDataUrl: string }>,
  options?: {
    maxChunkBytes?: number;
    maxChunkItems?: number;
    signal?: AbortSignal;
    waitIfPaused?: () => Promise<void>;
    onProgress?: (progress: BatchUploadProgress) => void;
  }
): Promise<{
  ok: boolean;
  updatedCount: number;
  skippedCount: number;
  failedStudentIds: string[];
  results: Array<{ studentId: string; photoUrl: string; sha256: string }>;
}> => {
  if (!isBackendApiAvailable()) {
    return {
      ok: true,
      updatedCount: photos.length,
      skippedCount: 0,
      failedStudentIds: [],
      results: [],
    };
  }

  const maxChunkBytes = options?.maxChunkBytes ?? 6 * 1024 * 1024;
  const maxChunkItems = options?.maxChunkItems ?? 35;

  const isBinaryBatch =
    photos.length > 0 && 'bytes' in photos[0] && photos[0].bytes instanceof Uint8Array;

  if (!isBinaryBatch) {
    const legacyItems = photos as Array<{ studentId: string; photoDataUrl: string }>;
    const headers = await getActiveUserAuthHeadersAsync();
    const res = await fetch('/api/photos/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'include',
      body: JSON.stringify({ photos: legacyItems }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        updatedCount: data.updatedCount ?? legacyItems.length,
        skippedCount: data.skippedCount ?? 0,
        failedStudentIds: [],
        results: Array.isArray(data.results) ? data.results : [],
      };
    }
    throw new Error(`Falha ao enviar lote de fotos (HTTP ${res.status})`);
  }

  const binaryItems = photos as BinaryPhotoUploadInput[];
  const chunks: BinaryPhotoUploadInput[][] = [];
  let currentChunk: BinaryPhotoUploadInput[] = [];
  let currentBytes = 0;

  for (const item of binaryItems) {
    const size = item.bytes.byteLength;
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= maxChunkItems || currentBytes + size > maxChunkBytes)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }
    currentChunk.push(item);
    currentBytes += size;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  let updatedCount = 0;
  let skippedCount = 0;
  let processedItems = 0;
  const failedStudentIds: string[] = [];
  const allResults: Array<{ studentId: string; photoUrl: string; sha256: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    if (options?.waitIfPaused) {
      await options.waitIfPaused();
    }
    if (options?.signal?.aborted) {
      throw new DOMException('Upload abortado pelo usuário.', 'AbortError');
    }
    const chunk = chunks[i];
    const packetBuffer = buildBinaryUploadPacket(chunk);
    try {
      const res = await fetchWithExponentialBackoff(
        '/api/photos/batch-binary',
        async () => {
          const headers = await getActiveUserAuthHeadersAsync();
          return {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/octet-stream',
            },
            body: packetBuffer,
          };
        },
        3,
        options?.signal
      );

      if (res.ok) {
        const data = await res.json();
        updatedCount += Number(data.updatedCount || 0);
        skippedCount += Number(data.skippedCount || 0);
        if (Array.isArray(data.results)) {
          allResults.push(...data.results);
        }
      } else {
        chunk.forEach((c) => failedStudentIds.push(c.studentId));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      chunk.forEach((c) => failedStudentIds.push(c.studentId));
    }

    processedItems += chunk.length;
    options?.onProgress?.({
      completedChunks: i + 1,
      totalChunks: chunks.length,
      processedItems,
      totalItems: binaryItems.length,
      updatedCount,
      skippedCount,
      failedCount: failedStudentIds.length,
    });
  }

  return {
    ok: failedStudentIds.length < binaryItems.length,
    updatedCount,
    skippedCount,
    failedStudentIds,
    results: allResults,
  };
};

/**
 * Limpar todas as fotos de todos os estudantes (Reset de fotos)
 */
export const clearAllStudentPhotosViaApi = async (): Promise<{ ok: boolean; clearedCount: number }> => {
  const current = getStoredClasses();
  let count = 0;
  const cleared = current.map((cls) => ({
    ...cls,
    updatedAtMs: Date.now(),
    students: cls.students.map((s) => {
      if (s.photo || s.photoDriveId || s.photoDriveUrl || s.photoSha256) count++;
      return {
        ...s,
        photo: '',
        photoDriveId: '',
        photoDriveUrl: '',
        photoSha256: '',
        photoManualLink: false,
        updatedAtMs: Date.now(),
      };
    }),
  }));
  saveStoredClasses(cleared, true);
  void clearStudentPhotoIndexedDbCache();

  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_STUDENT_PHOTOS_CACHE' });
    } catch (_) {}
  }

  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const res = await fetch('/api/photos/clear-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, clearedCount: data.clearedCount ?? count };
      }
    } catch (e) {
      console.warn('Aviso: falha ao chamar /api/photos/clear-all:', e);
    }
  }
  return { ok: true, clearedCount: count };
};

/**
 * Upload individual de ficha PDF pelo Admin ou Educador para o servidor central
 */
export const uploadStudentPdfViaApi = async (
  studentId: string,
  pdfDataUrl: string
): Promise<{ ok: boolean; pdfUrl?: string }> => {
  if (!isBackendApiAvailable()) {
    return { ok: true, pdfUrl: pdfDataUrl };
  }
  try {
    const headers = await getActiveUserAuthHeadersAsync();
    const res = await fetch('/api/pdfs/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'include',
      body: JSON.stringify({ studentId, pdfDataUrl }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, pdfUrl: data.pdfUrl };
    }
  } catch (e) {
    console.warn('Aviso: falha ao enviar PDF para /api/pdfs/upload:', e);
  }
  return { ok: false, pdfUrl: pdfDataUrl };
};

/**
 * Upload em lote binário por chunks para 2.000+ fichas PDF (sem base64, SHA-256 deduplicado, com retry exponencial)
 */
export const uploadBatchStudentPdfsViaApi = async (
  pdfs: Array<BinaryPdfUploadInput | { studentId: string; pdfDataUrl: string }>,
  options?: {
    maxChunkBytes?: number;
    maxChunkItems?: number;
    signal?: AbortSignal;
    waitIfPaused?: () => Promise<void>;
    onProgress?: (progress: BatchUploadProgress) => void;
  }
): Promise<{
  ok: boolean;
  updatedCount: number;
  skippedCount: number;
  failedStudentIds: string[];
  results: Array<{ studentId: string; pdfUrl: string; pdfId: string; sha256: string }>;
}> => {
  if (!isBackendApiAvailable()) {
    return {
      ok: true,
      updatedCount: pdfs.length,
      skippedCount: 0,
      failedStudentIds: [],
      results: [],
    };
  }

  const maxChunkBytes = options?.maxChunkBytes ?? 8 * 1024 * 1024;
  const maxChunkItems = options?.maxChunkItems ?? 12;
  const isBinaryBatch =
    pdfs.length > 0 && 'bytes' in pdfs[0] && pdfs[0].bytes instanceof Uint8Array;

  if (!isBinaryBatch) {
    const legacyItems = pdfs as Array<{ studentId: string; pdfDataUrl: string }>;
    const chunks: Array<typeof legacyItems> = [];
    let currentChunk: typeof legacyItems = [];
    let currentBytes = 0;

    for (const item of legacyItems) {
      const itemSize = item.pdfDataUrl.length;
      if (
        currentChunk.length > 0 &&
        (currentChunk.length >= 5 || currentBytes + itemSize > 12 * 1024 * 1024)
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentBytes = 0;
      }
      currentChunk.push(item);
      currentBytes += itemSize;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    let totalUpdated = 0;
    const failedStudentIds: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const headers = await getActiveUserAuthHeadersAsync();
        const res = await fetch('/api/pdfs/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          credentials: 'include',
          body: JSON.stringify({ pdfs: chunk }),
        });
        if (res.ok) {
          const data = await res.json();
          totalUpdated += data.updatedCount ?? chunk.length;
        } else {
          chunk.forEach((c) => failedStudentIds.push(c.studentId));
        }
      } catch {
        chunk.forEach((c) => failedStudentIds.push(c.studentId));
      }
    }
    return {
      ok: failedStudentIds.length < legacyItems.length,
      updatedCount: totalUpdated,
      skippedCount: 0,
      failedStudentIds,
      results: [],
    };
  }

  const binaryItems = pdfs as BinaryPdfUploadInput[];
  const chunks: BinaryPdfUploadInput[][] = [];
  let currentChunk: BinaryPdfUploadInput[] = [];
  let currentBytes = 0;

  for (const item of binaryItems) {
    const size = item.bytes.byteLength;
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= maxChunkItems || currentBytes + size > maxChunkBytes)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }
    currentChunk.push(item);
    currentBytes += size;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  let updatedCount = 0;
  let skippedCount = 0;
  let processedItems = 0;
  const failedStudentIds: string[] = [];
  const allResults: Array<{ studentId: string; pdfUrl: string; pdfId: string; sha256: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    if (options?.waitIfPaused) {
      await options.waitIfPaused();
    }
    if (options?.signal?.aborted) {
      throw new DOMException('Upload abortado pelo usuário.', 'AbortError');
    }
    const chunk = chunks[i];
    const packetBuffer = buildBinaryUploadPacket(chunk);
    try {
      const res = await fetchWithExponentialBackoff(
        '/api/pdfs/batch-binary',
        async () => {
          const headers = await getActiveUserAuthHeadersAsync();
          return {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/octet-stream',
            },
            body: packetBuffer,
          };
        },
        3,
        options?.signal
      );

      if (res.ok) {
        const data = await res.json();
        updatedCount += Number(data.updatedCount || 0);
        skippedCount += Number(data.skippedCount || 0);
        if (Array.isArray(data.results)) {
          allResults.push(...data.results);
        }
      } else {
        chunk.forEach((c) => failedStudentIds.push(c.studentId));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      chunk.forEach((c) => failedStudentIds.push(c.studentId));
    }

    processedItems += chunk.length;
    options?.onProgress?.({
      completedChunks: i + 1,
      totalChunks: chunks.length,
      processedItems,
      totalItems: binaryItems.length,
      updatedCount,
      skippedCount,
      failedCount: failedStudentIds.length,
    });
  }

  return {
    ok: failedStudentIds.length < binaryItems.length,
    updatedCount,
    skippedCount,
    failedStudentIds,
    results: allResults,
  };
};

/**
 * Limpar todas as fichas PDF de todos os estudantes (Reset de PDFs)
 */
export const clearAllStudentPdfsViaApi = async (): Promise<{ ok: boolean; clearedCount: number }> => {
  const current = getStoredClasses();
  let count = 0;
  const cleared = current.map((cls) => ({
    ...cls,
    updatedAtMs: Date.now(),
    students: cls.students.map((s) => {
      if (s.fichaPdfDriveUrl || s.fichaPdfDriveId || s.fichaPdfSha256) count++;
      return {
        ...s,
        fichaPdfDriveId: '',
        fichaPdfDriveUrl: '',
        fichaPdfSubfolder: '',
        fichaPdfSha256: '',
        fichaPdfManualLink: false,
        updatedAtMs: Date.now(),
      };
    }),
  }));
  saveStoredClasses(cleared, true);

  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const res = await fetch('/api/pdfs/clear-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, clearedCount: data.clearedCount ?? count };
      }
    } catch (e) {
      console.warn('Aviso: falha ao chamar /api/pdfs/clear-all:', e);
    }
  }
  return { ok: true, clearedCount: count };
};




