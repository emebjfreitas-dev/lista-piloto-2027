import {
  CalendarAuditLogEntry,
  OfficialCalendarConfig,
  SchoolHoliday,
} from '../types';
import {
  generateOfficial200SchoolDays2027,
  OFFICIAL_DEFAULT_HOLIDAYS_2027,
  parseAndValidateSchoolDates,
} from '../utils/calendarValidation';
import { isBackendApiAvailable } from './apiEnvironment';
import { getActiveUserAuthHeadersAsync } from './authSessionService';

const CALENDAR_STORAGE_KEY = 'emeb_candelario_official_calendar_2027_v1';
const HOLIDAYS_STORAGE_KEY = 'emeb_candelario_holidays_2027_v1';
const CALENDAR_AUDIT_STORAGE_KEY = 'emeb_candelario_calendar_audit_2027_v1';

let memoryCalendarConfig: OfficialCalendarConfig | null = null;
let memoryHolidays: SchoolHoliday[] | null = null;
let memoryAuditLogs: CalendarAuditLogEntry[] | null = null;

type ClassesCalendarCascadeHandler = (monthlyDistribution: Record<string, number>) => void;
let classesCascadeHandler: ClassesCalendarCascadeHandler | null = null;

export const registerClassesCalendarCascadeHandler = (
  handler: ClassesCalendarCascadeHandler
): void => {
  classesCascadeHandler = handler;
};

export const getStoredHolidays = (): SchoolHoliday[] => {
  if (memoryHolidays && memoryHolidays.length > 0) return memoryHolidays;
  try {
    const raw = localStorage.getItem(HOLIDAYS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryHolidays = parsed;
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  memoryHolidays = OFFICIAL_DEFAULT_HOLIDAYS_2027;
  return memoryHolidays;
};

export const getStoredCalendarAuditLogs = (): CalendarAuditLogEntry[] => {
  if (memoryAuditLogs && memoryAuditLogs.length > 0) return memoryAuditLogs;
  try {
    const raw = localStorage.getItem(CALENDAR_AUDIT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryAuditLogs = parsed;
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return [];
};

export const getStoredOfficialCalendarConfig = (): OfficialCalendarConfig => {
  if (
    memoryCalendarConfig &&
    Array.isArray(memoryCalendarConfig.schoolDays) &&
    memoryCalendarConfig.schoolDays.length === 200
  ) {
    return memoryCalendarConfig;
  }
  const currentHolidays = getStoredHolidays();
  try {
    const raw = localStorage.getItem(CALENDAR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.schoolDays) && parsed.schoolDays.length === 200) {
        memoryCalendarConfig = parsed;
        return parsed;
      }
    }
  } catch {
    // fallback
  }

  const defaultDays = generateOfficial200SchoolDays2027(currentHolidays);
  const validation = parseAndValidateSchoolDates(defaultDays.join('\n'), currentHolidays);
  const initialConfig: OfficialCalendarConfig = {
    year: 2027,
    schoolDays: defaultDays,
    calendarDays: validation.calendarDays,
    monthlyDistribution: validation.monthlyDistribution,
    holidays: currentHolidays,
    updatedAtMs: Date.now(),
    updatedByEmail: 'emebjfreitas@jundiai.sp.gov.br',
    updatedByName: 'Administrador EMEB Joaquim Candelário de Freitas',
    version: 1,
  };
  memoryCalendarConfig = initialConfig;
  try {
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(initialConfig));
  } catch {
    // memory fallback
  }
  return initialConfig;
};

export const pullOfficialCalendarFromServer = async (): Promise<{
  calendarConfig: OfficialCalendarConfig;
  holidays: SchoolHoliday[];
  auditLogs: CalendarAuditLogEntry[];
} | null> => {
  if (!isBackendApiAvailable()) return null;
  try {
    const headers = await getActiveUserAuthHeadersAsync();
    const res = await fetch('/api/calendar-config', {
      headers: {
        'Cache-Control': 'no-cache',
        ...headers,
      },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.calendarConfig && Array.isArray(data.calendarConfig.schoolDays)) {
      memoryCalendarConfig = data.calendarConfig;
      if (Array.isArray(data.holidays)) memoryHolidays = data.holidays;
      if (Array.isArray(data.auditLogs)) memoryAuditLogs = data.auditLogs;
      try {
        localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(data.calendarConfig));
        if (data.holidays) localStorage.setItem(HOLIDAYS_STORAGE_KEY, JSON.stringify(data.holidays));
        if (data.auditLogs)
          localStorage.setItem(CALENDAR_AUDIT_STORAGE_KEY, JSON.stringify(data.auditLogs));
      } catch {
        // ignore
      }
      return {
        calendarConfig: data.calendarConfig,
        holidays: data.holidays || getStoredHolidays(),
        auditLogs: data.auditLogs || [],
      };
    }
  } catch {
    // offline
  }
  return null;
};

export const saveStoredOfficialCalendarConfig = async (
  rawDatesText: string,
  adminEmail: string = 'emebjfreitas@jundiai.sp.gov.br',
  adminName: string = 'Administrador Escolar',
  year: number = 2027
): Promise<{
  ok: boolean;
  calendarConfig?: OfficialCalendarConfig;
  error?: string;
  auditEntry?: CalendarAuditLogEntry;
}> => {
  const currentHolidays = getStoredHolidays();
  const validation = parseAndValidateSchoolDates(rawDatesText, currentHolidays);

  if (validation.hasErrors) {
    const errDetails = validation.invalidEntries
      .map((e) => `Linha ${e.line}: ${e.reason}`)
      .join(' | ');
    return { ok: false, error: `Erros de formato nas datas: ${errDetails}` };
  }

  if (validation.totalCount !== 200) {
    return {
      ok: false,
      error: `A meta exige exatamente 200 dias letivos distintos. O lote enviado contém ${validation.totalCount} datas (${
        validation.remainingCount > 0
          ? `faltam ${validation.remainingCount} dias`
          : `excedente de ${validation.exceededCount} dias`
      }).`,
    };
  }

  const prevConfig = getStoredOfficialCalendarConfig();
  const newConfig: OfficialCalendarConfig = {
    year,
    schoolDays: validation.validDates,
    calendarDays: validation.calendarDays,
    monthlyDistribution: validation.monthlyDistribution,
    holidays: currentHolidays,
    updatedAtMs: Date.now(),
    updatedByEmail: adminEmail,
    updatedByName: adminName,
    version: (prevConfig?.version || 1) + 1,
  };

  const auditEntry: CalendarAuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestampISO: new Date().toISOString(),
    adminEmail,
    adminName,
    action: 'UPDATE_200_DAYS',
    previousDaysCount: prevConfig?.schoolDays?.length || 200,
    newDaysCount: 200,
    holidaysCount: currentHolidays.length,
    details: `Configuração única dos 200 dias letivos (${year}) homologada com sucesso via processamento centralizado.`,
  };

  memoryCalendarConfig = newConfig;
  const currentLogs = getStoredCalendarAuditLogs();
  const nextLogs = [auditEntry, ...currentLogs].slice(0, 150);
  memoryAuditLogs = nextLogs;

  try {
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(newConfig));
    localStorage.setItem(CALENDAR_AUDIT_STORAGE_KEY, JSON.stringify(nextLogs));
  } catch {
    // quota
  }

  if (classesCascadeHandler) {
    classesCascadeHandler(validation.monthlyDistribution);
  }

  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      const serverRes = await fetch('/api/calendar-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({
          rawDatesText,
          adminEmail,
          adminName,
          year,
        }),
      });
      if (serverRes.ok) {
        const serverData = await serverRes.json();
        if (serverData.calendarConfig) {
          memoryCalendarConfig = serverData.calendarConfig;
          localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(serverData.calendarConfig));
        }
      }
    } catch {
      // offline fallback
    }
  }

  return { ok: true, calendarConfig: newConfig, auditEntry };
};

export const saveStoredHolidayAction = async (
  action: 'add' | 'edit' | 'delete' | 'restore_defaults',
  holiday?: Partial<SchoolHoliday>,
  holidayId?: string,
  adminEmail: string = 'emebjfreitas@jundiai.sp.gov.br',
  adminName: string = 'Administrador Escolar'
): Promise<{ ok: boolean; holidays: SchoolHoliday[]; error?: string }> => {
  let list = [...getStoredHolidays()];
  let auditDetail = '';

  if (action === 'delete') {
    if (!holidayId) return { ok: false, holidays: list, error: 'ID do feriado não informado.' };
    const target = list.find((h) => h.id === holidayId);
    list = list.filter((h) => h.id !== holidayId);
    auditDetail = `Exclusão do feriado/recesso: "${target?.name || holidayId}".`;
  } else if (action === 'add') {
    if (!holiday?.date || !holiday?.name) {
      return { ok: false, holidays: list, error: 'Data e nome do feriado são obrigatórios.' };
    }
    const newHol: SchoolHoliday = {
      id: `hol-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: holiday.date.trim(),
      name: holiday.name.trim(),
      type: holiday.type || 'municipal',
      description: holiday.description || '',
      createdAtISO: new Date().toISOString(),
      updatedByEmail: adminEmail,
    };
    list.push(newHol);
    auditDetail = `Cadastro de feriado/recesso: "${newHol.name}" (${newHol.date}).`;
  } else if (action === 'edit') {
    if (!holiday?.id)
      return { ok: false, holidays: list, error: 'ID do feriado inválido para edição.' };
    list = list.map((h) => (h.id === holiday.id ? ({ ...h, ...holiday } as SchoolHoliday) : h));
    auditDetail = `Edição do feriado/recesso: "${holiday.name}" (${holiday.date}).`;
  } else if (action === 'restore_defaults') {
    list = [...OFFICIAL_DEFAULT_HOLIDAYS_2027];
    auditDetail = 'Restauração da lista oficial padrão de feriados e recessos de Jundiaí/SP.';
  }

  memoryHolidays = list;
  try {
    localStorage.setItem(HOLIDAYS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }

  const auditEntry: CalendarAuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestampISO: new Date().toISOString(),
    adminEmail,
    adminName,
    action:
      action === 'delete' ? 'DELETE_HOLIDAY' : action === 'edit' ? 'EDIT_HOLIDAY' : 'ADD_HOLIDAY',
    previousDaysCount: memoryCalendarConfig?.schoolDays?.length || 200,
    newDaysCount: memoryCalendarConfig?.schoolDays?.length || 200,
    holidaysCount: list.length,
    details: auditDetail,
  };
  const nextLogs = [auditEntry, ...getStoredCalendarAuditLogs()].slice(0, 150);
  memoryAuditLogs = nextLogs;
  try {
    localStorage.setItem(CALENDAR_AUDIT_STORAGE_KEY, JSON.stringify(nextLogs));
  } catch {
    // ignore
  }

  if (isBackendApiAvailable()) {
    try {
      const headers = await getActiveUserAuthHeadersAsync();
      await fetch('/api/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        credentials: 'include',
        body: JSON.stringify({ action, holiday, holidayId, adminEmail, adminName }),
      });
    } catch {
      // offline fallback
    }
  }

  return { ok: true, holidays: list };
};
