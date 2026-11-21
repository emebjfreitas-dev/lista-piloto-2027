import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import * as webpush from 'web-push';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  ensureSafePayloadObject,
  validateAuthSessionRequest,
  validateDriveTokenPayload,
  validatePhotoUploadBinaryHeaders,
  validatePhotoUploadPayload,
  validatePhotoBatchPayload,
  validatePdfUploadPayload,
  validatePdfBatchPayload,
  validateSchoolStateClassesPayload,
  validateSchoolStateLinksPayload,
  validateSchoolStateUsersPayload,
  validateSchoolStateResetPayload,
  validateSchoolStateImportJsonPayload,
  validateSchoolStateLogsPayload,
  validateAttendanceWindowPayload,
  validateSchoolNoticesPayload,
  validateCalendarConfigPayload,
  validateHolidayActionPayload,
  validateSecurityLogPayload,
  validateFcmRegisterTokenPayload,
  validateFcmUnregisterTokenPayload,
  validateFcmConfigPayload,
  validateFcmSendWindowAlertPayload,
} from './src/utils/serverValidation';
const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DAYS_OF_WEEK_PT = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
];

const OFFICIAL_DEFAULT_HOLIDAYS_2027 = [
  { id: 'hol-01', date: '01/01/2027', name: 'Confraternização Universal', type: 'nacional', isOfficial: true },
  { id: 'hol-02', date: '08/02/2027', name: 'Carnaval (Recesso Escolar)', type: 'recesso', isOfficial: true },
  { id: 'hol-03', date: '09/02/2027', name: 'Terça-feira de Carnaval', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-04', date: '10/02/2027', name: 'Quarta-feira de Cinzas', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-05', date: '26/03/2027', name: 'Sexta-feira Santa (Paixão de Cristo)', type: 'nacional', isOfficial: true },
  { id: 'hol-06', date: '21/04/2027', name: 'Tiradentes', type: 'nacional', isOfficial: true },
  { id: 'hol-07', date: '01/05/2027', name: 'Dia Mundial do Trabalho', type: 'nacional', isOfficial: true },
  { id: 'hol-08', date: '27/05/2027', name: 'Corpus Christi', type: 'municipal', isOfficial: true },
  { id: 'hol-09', date: '28/05/2027', name: 'Emenda Corpus Christi (Ponto Facultativo)', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-10', date: '09/07/2027', name: 'Revolução Constitucionalista de 1932', type: 'estadual', isOfficial: true },
  { id: 'hol-11', date: '15/08/2027', name: 'Nossa Senhora do Desterro (Padroeira de Jundiaí)', type: 'municipal', isOfficial: true },
  { id: 'hol-12', date: '07/09/2027', name: 'Independência do Brasil', type: 'nacional', isOfficial: true },
  { id: 'hol-13', date: '12/10/2027', name: 'Nossa Senhora Aparecida / Dia das Crianças', type: 'nacional', isOfficial: true },
  { id: 'hol-14', date: '15/10/2027', name: 'Dia do Professor (Recesso Escolar SME)', type: 'recesso', isOfficial: true },
  { id: 'hol-15', date: '28/10/2027', name: 'Dia do Servidor Público', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-16', date: '02/11/2027', name: 'Finados', type: 'nacional', isOfficial: true },
  { id: 'hol-17', date: '15/11/2027', name: 'Proclamação da República', type: 'nacional', isOfficial: true },
  { id: 'hol-18', date: '20/11/2027', name: 'Dia da Consciência Negra', type: 'nacional', isOfficial: true },
  { id: 'hol-19', date: '14/12/2027', name: 'Aniversário de Jundiaí (371 anos)', type: 'municipal', isOfficial: true },
  { id: 'hol-20', date: '25/12/2027', name: 'Natal', type: 'nacional', isOfficial: true },
];

const generateOfficial200SchoolDays2027 = (holidays: any[] = OFFICIAL_DEFAULT_HOLIDAYS_2027): string[] => {
  const holidayDateSet = new Set(holidays.map((h) => (h && h.date ? h.date.trim() : '')));
  const schoolDays: string[] = [];
  const targets: Record<number, number> = {
    2: 16, 3: 22, 4: 20, 5: 20, 6: 20, 7: 10,
    8: 22, 9: 20, 10: 20, 11: 18, 12: 12,
  };
  const pad = (n: number) => n.toString().padStart(2, '0');

  for (let month = 2; month <= 12; month++) {
    const targetCount = targets[month] || 20;
    let addedForMonth = 0;
    const daysInMonth = new Date(2027, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      if (addedForMonth >= targetCount) break;
      if (month === 7 && day < 19) continue;
      const dateObj = new Date(2027, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${pad(day)}/${pad(month)}/2027`;
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && !holidayDateSet.has(dateStr)) {
        schoolDays.push(dateStr);
        addedForMonth++;
      }
    }

    if (addedForMonth < targetCount) {
      for (let day = 1; day <= daysInMonth; day++) {
        if (addedForMonth >= targetCount) break;
        const dateObj = new Date(2027, month - 1, day);
        const dayOfWeek = dateObj.getDay();
        const dateStr = `${pad(day)}/${pad(month)}/2027`;
        if (dayOfWeek === 6 && !holidayDateSet.has(dateStr) && !schoolDays.includes(dateStr)) {
          schoolDays.push(dateStr);
          addedForMonth++;
        }
      }
    }
  }

  return schoolDays.sort((a, b) => {
    const [da, ma, ya] = a.split('/').map(Number);
    const [db, mb, yb] = b.split('/').map(Number);
    return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
  });
};

const parseAndValidateSchoolDates = (rawText: string, holidays: any[] = OFFICIAL_DEFAULT_HOLIDAYS_2027) => {
  if (!rawText || !rawText.trim()) {
    return {
      validDates: [] as string[],
      calendarDays: [] as any[],
      monthlyDistribution: {} as Record<string, number>,
      totalCount: 0,
      remainingCount: 200,
      exceededCount: 0,
      isExactly200: false,
      hasErrors: true,
      duplicateEntries: [] as any[],
      invalidEntries: [{ line: 1, raw: '', reason: 'Nenhuma data informada. Cole as datas uma por linha.' }],
      holidayConflicts: [] as any[],
      weekendDays: [] as any[],
    };
  }

  const holidayMap = new Map<string, any>();
  holidays.forEach((h) => {
    const cleanDate = h && h.date ? h.date.trim() : '';
    if (cleanDate) holidayMap.set(cleanDate, h);
  });

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const seenOccurrences = new Map<string, number>();
  const validDatesSet = new Set<string>();
  const invalidEntries: Array<{ line: number; raw: string; reason: string }> = [];
  const weekendDays: Array<{ date: string; dayOfWeek: string; isSaturday: boolean }> = [];
  const holidayConflicts: Array<{ date: string; holidayName: string; holidayType: string }> = [];
  const dateRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/;

  let lineCounter = 1;
  for (const rawLine of lines) {
    const tokens = rawLine.split(/[\s,;]+/).filter((t) => t.trim().length > 0);
    for (const token of tokens) {
      const match = token.match(dateRegex);
      if (!match) {
        invalidEntries.push({ line: lineCounter, raw: token, reason: 'Formato inválido. Use DD/MM/AAAA.' });
        continue;
      }
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      if (month < 1 || month > 12) {
        invalidEntries.push({ line: lineCounter, raw: token, reason: `Mês inválido (${month}).` });
        continue;
      }
      if (year < 2020 || year > 2035) {
        invalidEntries.push({ line: lineCounter, raw: token, reason: `Ano fora da faixa permitida (${year}).` });
        continue;
      }
      const daysInTargetMonth = new Date(year, month, 0).getDate();
      if (day < 1 || day > daysInTargetMonth) {
        invalidEntries.push({ line: lineCounter, raw: token, reason: `Dia inválido para o mês ${month}/${year}.` });
        continue;
      }

      const normalizedDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
      const count = (seenOccurrences.get(normalizedDate) || 0) + 1;
      seenOccurrences.set(normalizedDate, count);

      if (count === 1) {
        validDatesSet.add(normalizedDate);
        const dateObj = new Date(year, month - 1, day);
        const dayOfWeekIndex = dateObj.getDay();
        const dayOfWeekName = DAYS_OF_WEEK_PT[dayOfWeekIndex];

        if (dayOfWeekIndex === 0 || dayOfWeekIndex === 6) {
          weekendDays.push({
            date: normalizedDate,
            dayOfWeek: dayOfWeekName,
            isSaturday: dayOfWeekIndex === 6,
          });
        }

        if (holidayMap.has(normalizedDate)) {
          const hol = holidayMap.get(normalizedDate);
          holidayConflicts.push({
            date: normalizedDate,
            holidayName: hol.name,
            holidayType: hol.type,
          });
        }
      }
    }
    lineCounter++;
  }

  const duplicateEntries: Array<{ date: string; occurrences: number }> = [];
  seenOccurrences.forEach((count, date) => {
    if (count > 1) duplicateEntries.push({ date, occurrences: count });
  });

  const sortedDates = Array.from(validDatesSet).sort((a, b) => {
    const [da, ma, ya] = a.split('/').map(Number);
    const [db, mb, yb] = b.split('/').map(Number);
    return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
  });

  const monthlyDistribution: Record<string, number> = {};
  MONTH_NAMES_PT.forEach((m) => { monthlyDistribution[m] = 0; });

  const calendarDays = sortedDates.map((dateStr, idx) => {
    const [d, m, y] = dateStr.split('/').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekIndex = dateObj.getDay();
    const monthName = MONTH_NAMES_PT[m - 1] || 'Outro';
    monthlyDistribution[monthName] = (monthlyDistribution[monthName] || 0) + 1;
    const isSat = dayOfWeekIndex === 6;
    const isSun = dayOfWeekIndex === 0;
    const conflict = holidayMap.get(dateStr);
    let type = 'dia_letivo';
    if (isSat) type = 'sabado_letivo';
    else if (conflict) type = conflict.type === 'recesso' ? 'recesso' : 'feriado';

    return {
      id: `cal-day-${idx + 1}`,
      date: dateStr,
      isoDate: `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
      dayOfWeek: DAYS_OF_WEEK_PT[dayOfWeekIndex],
      dayNumber: d,
      month: monthName,
      monthNumber: m,
      year: y,
      isSaturday: isSat,
      isSunday: isSun,
      holidayConflict: conflict ? `${conflict.name} (${conflict.type})` : undefined,
      type,
      description: conflict ? conflict.name : isSat ? 'Sábado Letivo Temático' : 'Dia Letivo Regular',
    };
  });

  const totalCount = sortedDates.length;
  return {
    validDates: sortedDates,
    calendarDays,
    monthlyDistribution,
    totalCount,
    remainingCount: Math.max(0, 200 - totalCount),
    exceededCount: Math.max(0, totalCount - 200),
    isExactly200: totalCount === 200,
    hasErrors: invalidEntries.length > 0 || duplicateEntries.length > 0,
    duplicateEntries,
    invalidEntries,
    holidayConflicts,
    weekendDays,
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE_PATH = path.join(os.tmpdir(), 'emeb_candelario_shared_school_state_2027_v2.json');
const LEGACY_STATE_FILE_PATH = path.join(__dirname, 'shared_school_state_2027_v2.json');

const SERVER_CLEAN_RESET_EPOCH_ID = 'clean_zero_data_2026_11_16_v1';

interface SharedSchoolState {
  cleanResetEpochId?: string;
  sessionHmacSecret?: string;
  authorizedUsers?: any[];
  accessSessionLogs?: any[];
  attendanceWindowConfig?: any;
  schoolNotices?: any[];
  classes?: any[];
  classesUpdatedAtMs?: number;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
  adminDriveToken?: string;
  adminDriveTokenUpdatedAtMs?: number;
  officialCalendarConfig?: any;
  holidays?: any[];
  calendarAuditLogs?: any[];
  securityAuditLogs?: any[];
  lgpdConfig?: any;
  fcmTokens?: any[];
  fcmConfig?: {
    vapidPublicKey?: string;
    autoWindowAlertsEnabled?: boolean;
    notifyDaysBeforeClose?: number;
    remindPendingTeachersOnly?: boolean;
    updatedAtMs?: number;
    updatedByEmail?: string;
  };
  fcmAlerts?: any[];
  lastAutoFcmWindowKey?: string;
  webPushVapidKeys?: {
    publicKey: string;
    privateKey: string;
    subject: string;
    createdAtISO: string;
  };
  cloudLinks?: {
    spreadsheetId?: string;
    spreadsheetTitle?: string;
    photosFolderId?: string;
    photosFolderUrl?: string;
    fichasPdfFolderId?: string;
    fichasPdfFolderUrl?: string;
    updatedAtMs?: number;
  };
  updatedAtMs: number;
}

const deduplicateUsersByEmail = (users?: any[]): any[] | undefined => {
  if (!Array.isArray(users)) return users;
  const map = new Map<string, any>();
  users.forEach((u, idx) => {
    if (!u || typeof u.email !== 'string') return;
    const email = u.email.trim().toLowerCase();
    if (!email) return;
    const existing = map.get(email);
    if (!existing) {
      map.set(email, { ...u, id: u.id || `usr-official-${idx}`, email });
    } else {
      const incTime = u.updatedAtMs || 0;
      const extTime = existing.updatedAtMs || 0;
      const winner = incTime >= extTime ? u : existing;
      map.set(email, {
        ...winner,
        email,
        updatedAtMs: Math.max(incTime, extTime),
        totalAccessCount: Math.max(u.totalAccessCount || 0, existing.totalAccessCount || 0),
        totalDurationSeconds: Math.max(
          u.totalDurationSeconds || 0,
          existing.totalDurationSeconds || 0
        ),
        lastSessionDurationSeconds: Math.max(
          u.lastSessionDurationSeconds || 0,
          existing.lastSessionDurationSeconds || 0
        ),
        lastLoginAt: u.lastLoginAt || existing.lastLoginAt,
        lastActiveAt: u.lastActiveAt || existing.lastActiveAt,
        lastScreenVisited: u.lastScreenVisited || existing.lastScreenVisited,
      });
    }
  });
  return Array.from(map.values());
};

const sanitizeAndDeduplicateClasses = (classes?: any[]): any[] | undefined => {
  if (!Array.isArray(classes)) return classes;
  return classes.map((cls: any, clsIdx: number) => {
    const cleanClassId = cls?.id || `cls-${clsIdx + 1}`;
    const rawStudents = Array.isArray(cls?.students) ? cls.students : [];
    const seenKeys = new Set<string>();
    const seenIds = new Set<string>();
    const cleanStudents: any[] = [];

    rawStudents.forEach((st: any, idx: number) => {
      if (!st || typeof st !== 'object') return;
      const resolvedName = String(st.name || st.estudante || st.ESTUDANTE || st.nome || '').trim();
      if (!resolvedName) return;
      const normName = resolvedName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
      const raKey = String(st.ra || st.RA || '').trim();
      const dedupKey = raKey ? `ra:${raKey}|name:${normName}` : `name:${normName}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      const num = st.number || idx + 1;
      let studentId = st.id || `${cleanClassId}-s${num}`;
      if (seenIds.has(studentId)) {
        studentId = `${cleanClassId}-s${num}-i${idx + 1}`;
      }
      seenIds.add(studentId);

      cleanStudents.push({
        ...st,
        id: studentId,
        name: resolvedName,
        number: num,
      });
    });

    return {
      ...cls,
      id: cleanClassId,
      totalStudents: cleanStudents.length,
      students: cleanStudents,
    };
  });
};

const readSharedState = (): SharedSchoolState => {
  try {
    const fileToRead = fs.existsSync(STATE_FILE_PATH)
      ? STATE_FILE_PATH
      : fs.existsSync(LEGACY_STATE_FILE_PATH)
      ? LEGACY_STATE_FILE_PATH
      : null;
    if (fileToRead) {
      const raw = fs.readFileSync(fileToRead, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.authorizedUsers)) {
          parsed.authorizedUsers = deduplicateUsersByEmail(parsed.authorizedUsers);
        }
        if (Array.isArray(parsed.classes)) {
          parsed.classes = sanitizeAndDeduplicateClasses(parsed.classes);
        }
        parsed.cloudLinks = {
          photosFolderId: '1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn',
          photosFolderUrl:
            'https://drive.google.com/drive/folders/1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn',
          fichasPdfFolderId: '1GDEdQuNfhc0vps4mZXv4LLv4kDLZnauJ',
          fichasPdfFolderUrl:
            'https://drive.google.com/drive/folders/1GDEdQuNfhc0vps4mZXv4LLv4kDLZnauJ',
          ...(parsed.cloudLinks || {}),
        };
        // Force override if cloudLinks had old placeholder or empty photosFolderId
        if (
          !parsed.cloudLinks.photosFolderId ||
          parsed.cloudLinks.photosFolderUrl?.includes('my-drive')
        ) {
          parsed.cloudLinks.photosFolderId = '1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn';
          parsed.cloudLinks.photosFolderUrl =
            'https://drive.google.com/drive/folders/1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn';
        }

        if (!Array.isArray(parsed.holidays) || parsed.holidays.length === 0) {
          parsed.holidays = OFFICIAL_DEFAULT_HOLIDAYS_2027;
        }

        if (
          !parsed.officialCalendarConfig ||
          !Array.isArray(parsed.officialCalendarConfig.schoolDays) ||
          parsed.officialCalendarConfig.schoolDays.length !== 200
        ) {
          const defaultDays = generateOfficial200SchoolDays2027(parsed.holidays);
          const validation = parseAndValidateSchoolDates(defaultDays.join('\n'), parsed.holidays);
          parsed.officialCalendarConfig = {
            year: 2027,
            schoolDays: defaultDays,
            calendarDays: validation.calendarDays,
            monthlyDistribution: validation.monthlyDistribution,
            holidays: parsed.holidays,
            updatedAtMs: Date.now(),
            updatedByEmail: 'emebjfreitas@jundiai.sp.gov.br',
            updatedByName: 'Administrador EMEB Joaquim Candelário de Freitas',
            version: 1,
          };
        }

        if (!Array.isArray(parsed.calendarAuditLogs) || parsed.calendarAuditLogs.length === 0) {
          parsed.calendarAuditLogs = [
            {
              id: 'audit-init-2027',
              timestampISO: new Date().toISOString(),
              adminEmail: 'emebjfreitas@jundiai.sp.gov.br',
              adminName: 'Sistema SME Jundiaí',
              action: 'RESTORE_DEFAULT',
              previousDaysCount: 0,
              newDaysCount: 200,
              holidaysCount: OFFICIAL_DEFAULT_HOLIDAYS_2027.length,
              details: 'Inicialização oficial da matriz centralizada de 200 dias letivos (2027).',
            },
          ];
        }

        let needsCleanEpochPersist = false;
        if (parsed.cleanResetEpochId !== SERVER_CLEAN_RESET_EPOCH_ID) {
          needsCleanEpochPersist = true;
          const nowEpochMs = Date.now();
          parsed.cleanResetEpochId = SERVER_CLEAN_RESET_EPOCH_ID;
          parsed.classesUpdatedAtMs = nowEpochMs;
          parsed.updatedAtMs = nowEpochMs;
          parsed.accessSessionLogs = [];
          parsed.schoolNotices = [];
          parsed.securityAuditLogs = [];
          parsed.discoveredNominalPdfs = [];
          parsed.discoveredDrivePhotos = [];
          parsed.fcmAlerts = [];
          if (Array.isArray(parsed.classes)) {
            parsed.classes = parsed.classes.map((cls: any) => ({
              ...cls,
              students: [],
              totalStudents: 0,
              monthlyAbsences: 0,
              presenceRate: 0,
              statusText: 'Aguardando importação de estudantes',
              isPending: false,
              weeklyPerformance: [],
              pedagogicalNotes: '',
              updatedAtMs: nowEpochMs,
            }));
          }
          if (Array.isArray(parsed.authorizedUsers)) {
            parsed.authorizedUsers = parsed.authorizedUsers.map((u: any) => ({
              ...u,
              totalAccessCount: 0,
              totalDurationSeconds: 0,
              lastSessionDurationSeconds: 0,
              lastLoginAt: undefined,
              lastActiveAt: undefined,
              lastScreenVisited: undefined,
            }));
          }
        }

        if (needsCleanEpochPersist) {
          try {
            const tmpPath = `${STATE_FILE_PATH}.tmp`;
            const bakPath = `${STATE_FILE_PATH}.bak`;
            const jsonContent = JSON.stringify(parsed, null, 2);
            fs.writeFileSync(tmpPath, jsonContent, 'utf-8');
            fs.renameSync(tmpPath, STATE_FILE_PATH);
            fs.copyFileSync(STATE_FILE_PATH, bakPath);
          } catch {
            // ignore epoch persist error
          }
        }

        return parsed;
      }
    }
  } catch (err) {
    console.warn('Erro ao ler shared_school_state_2027.json:', err);
  }
  const defaultHols = OFFICIAL_DEFAULT_HOLIDAYS_2027;
  const defaultDays = generateOfficial200SchoolDays2027(defaultHols);
  const validation = parseAndValidateSchoolDates(defaultDays.join('\n'), defaultHols);
  return {
    updatedAtMs: Date.now(),
    holidays: defaultHols,
    officialCalendarConfig: {
      year: 2027,
      schoolDays: defaultDays,
      calendarDays: validation.calendarDays,
      monthlyDistribution: validation.monthlyDistribution,
      holidays: defaultHols,
      updatedAtMs: Date.now(),
      updatedByEmail: 'emebjfreitas@jundiai.sp.gov.br',
      updatedByName: 'Administrador EMEB Joaquim Candelário de Freitas',
      version: 1,
    },
    calendarAuditLogs: [
      {
        id: 'audit-init-2027',
        timestampISO: new Date().toISOString(),
        adminEmail: 'emebjfreitas@jundiai.sp.gov.br',
        adminName: 'Sistema SME Jundiaí',
        action: 'RESTORE_DEFAULT',
        previousDaysCount: 0,
        newDaysCount: 200,
        holidaysCount: defaultHols.length,
        details: 'Inicialização oficial da matriz centralizada de 200 dias letivos (2027).',
      },
    ],
  };
};

const writeSharedState = (patch: Partial<SharedSchoolState>): SharedSchoolState => {
  const current = readSharedState();
  const next: SharedSchoolState = {
    ...current,
    ...patch,
    ...(patch.authorizedUsers
      ? { authorizedUsers: deduplicateUsersByEmail(patch.authorizedUsers) }
      : {}),
    ...(patch.classes
      ? { classes: sanitizeAndDeduplicateClasses(patch.classes) }
      : {}),
    updatedAtMs: Date.now(),
  };
  try {
    const tmpPath = `${STATE_FILE_PATH}.tmp`;
    const bakPath = `${STATE_FILE_PATH}.bak`;
    const jsonContent = JSON.stringify(next, null, 2);
    fs.writeFileSync(tmpPath, jsonContent, 'utf-8');
    fs.renameSync(tmpPath, STATE_FILE_PATH);
    // Maintain immediate rolling backup to guarantee zero data loss
    try {
      fs.copyFileSync(STATE_FILE_PATH, bakPath);
    } catch {
      // ignore backup copy failure
    }
  } catch (err) {
    console.warn('Erro ao gravar shared_school_state_2027.json:', err);
  }
  return next;
};

// Institutional Security & Cryptographic RBAC Verification Helpers
const FIREBASE_PROJECT_ID = 'listapiloto2027';
const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const SESSION_COOKIE_NAME = 'emeb_candelario_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours max signed session

const isOfficialSchoolAdminEmail = (email?: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  return (
    clean === 'emebjfreitas@jundiai.sp.gov.br' ||
    clean === 'emebjfreitas@educacao.jundiai.sp.gov.br'
  );
};

const isInstitutionalEmail = (email?: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  return (
    clean.endsWith('@educacao.jundiai.sp.gov.br') ||
    clean === 'emebjfreitas@jundiai.sp.gov.br'
  );
};

interface RequestUser {
  email: string;
  role: string;
  name: string;
  isAdmin: boolean;
  isInstitutional: boolean;
  uid?: string;
  authMethod?: 'firebase_jwt' | 'signed_cookie' | 'anonymous';
}

let cachedGoogleCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;

const getGooglePublicCerts = async (forceRefresh = false): Promise<Record<string, string>> => {
  const now = Date.now();
  if (!forceRefresh && cachedGoogleCerts && cachedGoogleCerts.expiresAtMs > now) {
    return cachedGoogleCerts.certs;
  }
  const resp = await fetch(GOOGLE_SECURETOKEN_CERTS_URL);
  if (!resp.ok) {
    if (cachedGoogleCerts) return cachedGoogleCerts.certs;
    throw new Error(`Falha ao buscar chaves públicas Google Auth (${resp.status})`);
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cc = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cc.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(300, Number(maxAgeMatch[1])) : 3600;
  cachedGoogleCerts = {
    certs,
    expiresAtMs: now + maxAgeSec * 1000,
  };
  return certs;
};

interface VerifiedFirebaseJwt {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

const verifyFirebaseIdToken = async (idToken: string): Promise<VerifiedFirebaseJwt | null> => {
  if (!idToken || typeof idToken !== 'string') return null;
  const parts = idToken.trim().split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header?.alg !== 'RS256' || typeof header?.kid !== 'string' || !header.kid) {
      return null;
    }

    let certs = await getGooglePublicCerts(false);
    let pemCert = certs[header.kid];
    if (!pemCert) {
      certs = await getGooglePublicCerts(true);
      pemCert = certs[header.kid];
    }
    if (!pemCert) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const sigBuf = Buffer.from(parts[2], 'base64url');
    if (!verifier.verify(pemCert, sigBuf)) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;
    if (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 300) return null;
    if (typeof payload.email !== 'string' || !payload.email.trim()) return null;
    if (payload.email_verified !== true) return null;

    return {
      uid: payload.sub,
      email: payload.email.trim().toLowerCase(),
      emailVerified: true,
      name: typeof payload.name === 'string' ? payload.name.trim() : undefined,
    };
  } catch {
    return null;
  }
};

let runtimeSessionSecret: string | null = null;
const getSessionHmacSecret = (): string => {
  if (process.env.SESSION_HMAC_SECRET && process.env.SESSION_HMAC_SECRET.length >= 24) {
    return process.env.SESSION_HMAC_SECRET;
  }
  if (runtimeSessionSecret) return runtimeSessionSecret;
  const state = readSharedState();
  if (state.sessionHmacSecret && state.sessionHmacSecret.length >= 32) {
    runtimeSessionSecret = state.sessionHmacSecret;
    return runtimeSessionSecret;
  }
  runtimeSessionSecret = crypto.randomBytes(32).toString('hex');
  writeSharedState({ sessionHmacSecret: runtimeSessionSecret });
  return runtimeSessionSecret;
};

const signSessionCookieValue = (payload: {
  email: string;
  uid: string;
  name: string;
  exp: number;
}): string => {
  const secret = getSessionHmacSecret();
  const dataB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
};

const verifySessionCookieValue = (
  cookieVal?: string
): { email: string; uid: string; name: string; exp: number } | null => {
  if (!cookieVal || typeof cookieVal !== 'string') return null;
  const dotIdx = cookieVal.indexOf('.');
  if (dotIdx <= 0) return null;
  const dataB64 = cookieVal.slice(0, dotIdx);
  const sigB64 = cookieVal.slice(dotIdx + 1);
  if (!dataB64 || !sigB64) return null;

  try {
    const secret = getSessionHmacSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(dataB64).digest();
    const incomingSig = Buffer.from(sigB64, 'base64url');
    if (
      expectedSig.length !== incomingSig.length ||
      !crypto.timingSafeEqual(expectedSig, incomingSig)
    ) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!parsed || typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp <= nowSec) return null;
    return {
      email: parsed.email.trim().toLowerCase(),
      uid: String(parsed.uid || ''),
      name: String(parsed.name || ''),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
};

const parseCookiesFromRequest = (req: express.Request): Record<string, string> => {
  const out: Record<string, string> = {};
  const raw = req.headers.cookie;
  if (!raw || typeof raw !== 'string') return out;
  for (const part of raw.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
};

const getTodaySaoPauloIso = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const buildAuthorizedRequestUser = (
  verifiedEmail: string,
  displayName?: string,
  uid?: string,
  authMethod: 'firebase_jwt' | 'signed_cookie' = 'firebase_jwt'
): { user: RequestUser | null; denialReason?: string } => {
  const email = verifiedEmail.trim().toLowerCase();
  if (!isInstitutionalEmail(email)) {
    return { user: null, denialReason: 'NON_INSTITUTIONAL_EMAIL' };
  }

  const state = readSharedState();
  const users = Array.isArray(state.authorizedUsers) ? state.authorizedUsers : [];
  const matched = users.find(
    (u: any) => u && typeof u.email === 'string' && u.email.trim().toLowerCase() === email
  );

  if (matched) {
    if (matched.active === false) {
      return { user: null, denialReason: 'USER_DEACTIVATED' };
    }
    if (matched.accessExpiresAt && typeof matched.accessExpiresAt === 'string') {
      const todayIso = getTodaySaoPauloIso();
      if (/^\d{4}-\d{2}-\d{2}$/.test(matched.accessExpiresAt.trim()) && todayIso > matched.accessExpiresAt.trim()) {
        return { user: null, denialReason: 'USER_ACCESS_EXPIRED' };
      }
    }
  }

  const isAdmin = isOfficialSchoolAdminEmail(email);
  if (!matched && !isAdmin) {
    return { user: null, denialReason: 'USER_NOT_PROVISIONED' };
  }

  const resolvedRole = isAdmin
    ? 'admin'
    : matched?.role === 'peb2'
    ? 'peb2'
    : 'usuario';
  const resolvedName =
    (matched?.name && String(matched.name).trim()) ||
    displayName ||
    (isAdmin ? 'Equipe Administrativa' : email.split('@')[0] || 'Usuário');

  return {
    user: {
      email,
      role: resolvedRole,
      name: resolvedName,
      isAdmin,
      isInstitutional: true,
      uid,
      authMethod,
    },
  };
};

const resolveVerifiedRequestUser = async (
  req: express.Request
): Promise<{ user: RequestUser | null; denialReason?: string }> => {
  const cached = (req as any).verifiedUser as RequestUser | undefined;
  if (cached && cached.isInstitutional) {
    return { user: cached };
  }

  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = await verifyFirebaseIdToken(token);
    if (!verified) {
      return { user: null, denialReason: 'INVALID_OR_EXPIRED_FIREBASE_TOKEN' };
    }
    const built = buildAuthorizedRequestUser(
      verified.email,
      verified.name,
      verified.uid,
      'firebase_jwt'
    );
    if (built.user) {
      (req as any).verifiedUser = built.user;
    }
    return built;
  }

  const cookies = parseCookiesFromRequest(req);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  if (sessionCookie) {
    const parsed = verifySessionCookieValue(sessionCookie);
    if (!parsed) {
      return { user: null, denialReason: 'INVALID_OR_EXPIRED_SESSION_COOKIE' };
    }
    const built = buildAuthorizedRequestUser(
      parsed.email,
      parsed.name,
      parsed.uid,
      'signed_cookie'
    );
    if (built.user) {
      (req as any).verifiedUser = built.user;
    }
    return built;
  }

  return { user: null, denialReason: 'MISSING_AUTHENTICATION_TOKEN' };
};

const extractRequestUser = (req: express.Request): RequestUser => {
  const verified = (req as any).verifiedUser as RequestUser | undefined;
  if (verified) return verified;

  return {
    email: '',
    role: 'anonymous',
    name: 'Anônimo',
    isAdmin: false,
    isInstitutional: false,
    authMethod: 'anonymous',
  };
};

const recordSecurityAuditLog = (
  eventType: string,
  details: string,
  req: express.Request,
  status: 'SUCCESS' | 'BLOCKED' | 'WARNING' = 'SUCCESS',
  overrideUser?: { email?: string; name?: string }
) => {
  const user = overrideUser || extractRequestUser(req);
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1';
  const entry = {
    id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestampISO: new Date().toISOString(),
    eventType,
    userEmail: user.email || 'ANONYMOUS',
    userName: user.name || (user.email === 'emebjfreitas@jundiai.sp.gov.br' ? 'Equipe Administrativa' : 'Usuário'),
    clientIp,
    details,
    status,
  };
  const current = readSharedState();
  const existingLogs = Array.isArray(current.securityAuditLogs) ? current.securityAuditLogs : [];
  writeSharedState({
    securityAuditLogs: [entry, ...existingLogs].slice(0, 500),
  });
  return entry;
};

// Middleware: Exige token criptográfico Firebase válido ou cookie HMAC assinado de servidor institucional
const requireInstitutionalAuth = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const { user, denialReason } = await resolveVerifiedRequestUser(req);
  if (!user || !user.isInstitutional) {
    if (req.method !== 'GET' || denialReason !== 'MISSING_AUTHENTICATION_TOKEN') {
      recordSecurityAuditLog(
        'UNAUTHORIZED_MUTATION_ATTEMPT',
        `Acesso bloqueado em ${req.method} ${req.path} (${denialReason || 'UNAUTHENTICATED'}).`,
        req,
        'BLOCKED',
        { email: user?.email || 'ANONYMOUS', name: user?.name || 'Não Autenticado' }
      );
    }
    const statusCode =
      denialReason === 'MISSING_AUTHENTICATION_TOKEN' ||
      denialReason === 'INVALID_OR_EXPIRED_FIREBASE_TOKEN' ||
      denialReason === 'INVALID_OR_EXPIRED_SESSION_COOKIE'
        ? 401
        : 403;
    res.status(statusCode).json({
      error:
        statusCode === 401
          ? 'Sessão não autenticada ou expirada. Faça login novamente com sua conta Google institucional.'
          : 'Acesso negado. Conta institucional desativada, expirada ou fora do domínio oficial.',
      code: denialReason || 'UNAUTHORIZED_INSTITUTIONAL_EMAIL',
    });
    return;
  }
  next();
};

// Middleware: Exige privilégios criptograficamente verificados de administrador oficial
const requireAdminAuth = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const { user, denialReason } = await resolveVerifiedRequestUser(req);
  if (!user || !user.isInstitutional) {
    recordSecurityAuditLog(
      'UNAUTHORIZED_ADMIN_ATTEMPT',
      `Tentativa não autenticada bloqueada em rota administrativa ${req.path} (${denialReason || 'UNAUTHENTICATED'}).`,
      req,
      'BLOCKED',
      { email: 'ANONYMOUS', name: 'Não Autenticado' }
    );
    res.status(401).json({
      error: 'Autenticação administrativa obrigatória.',
      code: denialReason || 'UNAUTHENTICATED',
    });
    return;
  }
  if (!user.isAdmin) {
    recordSecurityAuditLog(
      'PRIVILEGE_ESCALATION_BLOCKED',
      `Tentativa de operação administrativa bloqueada em ${req.path} para o usuário verificado: "${user.email}"`,
      req,
      'BLOCKED',
      user
    );
    res.status(403).json({
      error: 'Acesso negado. Esta operação exige privilégios de Administrador Escolar (Direção / Secretaria).',
      code: 'ADMIN_ROLE_REQUIRED',
    });
    return;
  }
  next();
};

// Middleware: Rejeita gravações de abas antigas em cache anteriores à limpeza do banco
const requireCurrentCleanEpoch = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const clientEpoch = String(req.headers['x-clean-epoch'] || '').trim();
  if (clientEpoch !== SERVER_CLEAN_RESET_EPOCH_ID) {
    res.status(409).json({
      error: 'Estado anterior à limpeza do banco ignorado. Recarregue a aplicação.',
      code: 'STALE_EPOCH_REJECTED',
    });
    return;
  }
  next();
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob: data:; frame-src 'self' https: data: blob:; img-src 'self' https: data: blob:;"
    );
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  const setSessionCookieHeader = (req: express.Request, res: express.Response, cookieValue: string, maxAgeSec: number) => {
    const xfProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
    const isSecure = req.secure || xfProto.includes('https');
    const attrs = [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieValue)}`,
      'Path=/',
      `Max-Age=${maxAgeSec}`,
      'HttpOnly',
      isSecure ? 'SameSite=None' : 'SameSite=Lax',
      ...(isSecure ? ['Secure'] : []),
    ];
    res.setHeader('Set-Cookie', attrs.join('; '));
  };

  // API pública zero-PII de health-check para detecção de backend antes do login
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, service: 'emeb-candelario-2027' });
  });

  // API: Emite cookie HttpOnly assinado com HMAC a partir de um Firebase ID Token RS256 validado
  app.post('/api/auth/session', async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '').trim();
      const validation = validateAuthSessionRequest(req.body, authHeader);
      if (!validation.ok) {
        res.status(400).json({ error: validation.error, code: 'MISSING_OR_INVALID_ID_TOKEN' });
        return;
      }
      const rawToken = validation.data.idToken;

      const verified = await verifyFirebaseIdToken(rawToken);
      if (!verified) {
        recordSecurityAuditLog(
          'LOGIN_FAILURE',
          'Token Firebase ID inválido, expirado ou com e-mail não verificado rejeitado em /api/auth/session.',
          req,
          'BLOCKED',
          { email: 'ANONYMOUS', name: 'Falha JWT' }
        );
        res.status(401).json({
          error: 'Token de autenticação inválido ou expirado.',
          code: 'INVALID_FIREBASE_TOKEN',
        });
        return;
      }

      const { user, denialReason } = buildAuthorizedRequestUser(
        verified.email,
        verified.name,
        verified.uid,
        'firebase_jwt'
      );

      if (!user) {
        recordSecurityAuditLog(
          'LOGIN_FAILURE',
          `Login bloqueado para "${verified.email}" (${denialReason || 'UNAUTHORIZED'}).`,
          req,
          'BLOCKED',
          { email: verified.email, name: verified.name || verified.email }
        );
        res.status(403).json({
          error: 'Conta não autorizada para acesso institucional.',
          code: denialReason || 'UNAUTHORIZED',
        });
        return;
      }

      const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
      const cookieToken = signSessionCookieValue({
        email: user.email,
        uid: verified.uid,
        name: user.name,
        exp,
      });

      setSessionCookieHeader(req, res, cookieToken, SESSION_TTL_SECONDS);
      recordSecurityAuditLog(
        'LOGIN_SUCCESS',
        `Sessão autenticada com criptografia Firebase + HMAC para ${user.email} (${user.role}).`,
        req,
        'SUCCESS',
        user
      );

      res.json({
        ok: true,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
        expiresAtSec: exp,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro interno ao autenticar sessão.' });
    }
  });

  // API: Encerrar sessão segura e revogar cookie HttpOnly
  app.post('/api/auth/logout', (req, res) => {
    setSessionCookieHeader(req, res, '', 0);
    res.json({ ok: true });
  });

  // API: Obter estado compartilhado (protegido por autenticação institucional verificada)
  app.get('/api/school-state', requireInstitutionalAuth, (_req, res) => {
    const state = readSharedState();
    const {
      adminDriveToken: _hiddenToken,
      fcmTokens: _hiddenFcmTokens,
      webPushVapidKeys: _hiddenVapidKeys,
      sessionHmacSecret: _hiddenSessionSecret,
      ...publicState
    } = state;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(publicState);
  });

  // API: Registrar token de leitura da pasta oficial do Drive (autenticado institucionalmente)
  app.post('/api/school-state/drive-token', requireAdminAuth, (req, res) => {
    const validation = validateDriveTokenPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    writeSharedState({
      adminDriveToken: validation.data.accessToken,
      adminDriveTokenUpdatedAtMs: Date.now(),
    });
    res.json({ ok: true });
  });

  // Diretório persistente local para fotos dos estudantes da EMEB Candelário
  const PHOTOS_DIR = path.join(os.tmpdir(), 'emeb_candelario_student_photos_v1');
  if (!fs.existsSync(PHOTOS_DIR)) {
    try {
      fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    } catch {}
  }

  const PHOTO_MIME_BY_EXT: Record<string, string> = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
  };

  const detectImageTypeFromBuffer = (
    buf: Buffer
  ): { valid: boolean; ext: 'webp' | 'png' | 'jpg' | 'gif' | 'avif'; mime: string } | null => {
    if (!buf || buf.length < 12) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { valid: true, ext: 'jpg', mime: 'image/jpeg' };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return { valid: true, ext: 'png', mime: 'image/png' };
    }
    // WebP: RIFF....WEBP
    if (
      buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { valid: true, ext: 'webp', mime: 'image/webp' };
    }
    // GIF: GIF87a / GIF89a
    if (buf.slice(0, 4).toString('ascii') === 'GIF8') {
      return { valid: true, ext: 'gif', mime: 'image/gif' };
    }
    // AVIF / HEIF ftyp box
    if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
      return { valid: true, ext: 'avif', mime: 'image/avif' };
    }
    return null;
  };

  const hasPdfSignatureInBuffer = (buf: Buffer): boolean => {
    if (!buf || buf.length < 8) return false;
    const head = buf.slice(0, Math.min(buf.length, 1024));
    return head.indexOf('%PDF-') !== -1;
  };

  interface DecodedBinaryItem {
    studentId: string;
    mimeType?: string;
    ext?: string;
    sha256: string;
    buffer: Buffer;
  }

  const decodeBinaryUploadPacket = (raw: Buffer): DecodedBinaryItem[] => {
    if (!Buffer.isBuffer(raw) || raw.length < 10) {
      throw new Error('Pacote binário inválido ou vazio.');
    }
    if (raw.slice(0, 4).toString('ascii') !== 'EMEB') {
      throw new Error('Cabeçalho de pacote binário inválido.');
    }
    const metaLen = raw.readUInt32BE(4);
    if (metaLen <= 0 || metaLen > 5 * 1024 * 1024 || 8 + metaLen > raw.length) {
      throw new Error('Tamanho de metadados do pacote binário inválido.');
    }
    const meta = JSON.parse(raw.slice(8, 8 + metaLen).toString('utf8'));
    if (!meta || !Array.isArray(meta.items)) {
      throw new Error('Metadados do pacote binário malformados.');
    }
    let offset = 8 + metaLen;
    const decoded: DecodedBinaryItem[] = [];
    for (const item of meta.items) {
      const len = Number(item?.byteLength || 0);
      if (!item?.studentId || !Number.isFinite(len) || len <= 0 || offset + len > raw.length) {
        throw new Error(`Payload binário corrompido para estudante ${item?.studentId || 'desconhecido'}.`);
      }
      const slice = raw.subarray(offset, offset + len);
      offset += len;
      const computedSha = crypto.createHash('sha256').update(slice).digest('hex');
      decoded.push({
        studentId: String(item.studentId),
        mimeType: item.mimeType ? String(item.mimeType) : undefined,
        ext: item.ext ? String(item.ext) : undefined,
        sha256: item.sha256 ? String(item.sha256) : computedSha,
        buffer: slice,
      });
    }
    return decoded;
  };

  const removeStaleStudentPhotoExtensions = (cleanId: string, keepExt: string) => {
    const exts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
    for (const ext of exts) {
      if (ext === keepExt) continue;
      const candidate = path.join(PHOTOS_DIR, `${cleanId}.${ext}`);
      if (fs.existsSync(candidate)) {
        try {
          fs.unlinkSync(candidate);
        } catch {}
      }
    }
  };

  // API: Servir fotos salvas localmente no servidor com Content-Type correto (WebP/PNG/JPG) e acesso autenticado
  app.get('/api/photos/:filename', requireInstitutionalAuth, (req, res) => {
    const filename = path.basename(req.params.filename || '');
    if (!filename || filename.includes('..')) {
      res.status(400).end();
      return;
    }
    let filePath = path.join(PHOTOS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      const stem = filename.replace(/\.[^/.]+$/, '');
      for (const fallbackExt of ['.webp', '.jpg', '.jpeg', '.png']) {
        const altPath = path.join(PHOTOS_DIR, `${stem}${fallbackExt}`);
        if (fs.existsSync(altPath)) {
          filePath = altPath;
          break;
        }
      }
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    const resolvedExt = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', PHOTO_MIME_BY_EXT[resolvedExt] || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  });

  const savePhotoBufferToFile = (
    studentId: string,
    buffer: Buffer
  ): { photoUrl: string; sha256: string; filename: string } => {
    const detected = detectImageTypeFromBuffer(buffer);
    if (!detected) {
      throw new Error(`Arquivo de imagem inválido ou formato não suportado para ${studentId}.`);
    }
    const cleanId = String(studentId).replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${cleanId}.${detected.ext}`;
    const filePath = path.join(PHOTOS_DIR, filename);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    removeStaleStudentPhotoExtensions(cleanId, detected.ext);

    let needsWrite = true;
    if (fs.existsSync(filePath)) {
      try {
        const existingBuf = fs.readFileSync(filePath);
        const existingSha = crypto.createHash('sha256').update(existingBuf).digest('hex');
        if (existingSha === sha256) {
          needsWrite = false;
        }
      } catch {
        needsWrite = true;
      }
    }

    if (needsWrite) {
      fs.writeFileSync(filePath, buffer);
    }

    return {
      photoUrl: `/api/photos/${filename}`,
      sha256,
      filename,
    };
  };

  const savePhotoDataUrlToFile = (
    studentId: string,
    dataUrl: string
  ): { photoUrl: string; sha256: string; filename: string } => {
    const matches = dataUrl.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
    const buffer =
      matches && matches.length === 3
        ? Buffer.from(matches[2], 'base64')
        : Buffer.from(dataUrl);
    return savePhotoBufferToFile(studentId, buffer);
  };

  const applyPhotoBatchToState = (
    items: Array<{ studentId: string; buffer: Buffer; sha256?: string }>
  ) => {
    const current = readSharedState();
    const existingStudentShaMap = new Map<string, { sha256?: string; photo?: string }>();
    if (Array.isArray(current.classes)) {
      for (const cls of current.classes) {
        if (!Array.isArray(cls.students)) continue;
        for (const s of cls.students) {
          if (s?.id) {
            existingStudentShaMap.set(s.id, { sha256: s.photoSha256, photo: s.photo });
          }
        }
      }
    }

    const now = Date.now();
    const photoMap = new Map<string, { url: string; sha256: string }>();
    let skippedCount = 0;

    for (const item of items) {
      if (!item.studentId || !item.buffer || item.buffer.length === 0) continue;
      const incomingSha =
        item.sha256 || crypto.createHash('sha256').update(item.buffer).digest('hex');
      const existingInfo = existingStudentShaMap.get(item.studentId);
      const cleanId = String(item.studentId).replace(/[^a-zA-Z0-9-_]/g, '_');

      // Verifica se já é exatamente o mesmo arquivo em disco (zero redundância)
      if (existingInfo?.sha256 && existingInfo.sha256 === incomingSha && existingInfo.photo) {
        const rawPathName = existingInfo.photo.split('?')[0].split('/').pop() || `${cleanId}.webp`;
        if (fs.existsSync(path.join(PHOTOS_DIR, rawPathName))) {
          skippedCount++;
          continue;
        }
      }

      const saved = savePhotoBufferToFile(item.studentId, item.buffer);
      photoMap.set(item.studentId, { url: `${saved.photoUrl}?v=${now}`, sha256: saved.sha256 });
    }

    let updatedCount = 0;
    if (photoMap.size > 0 && Array.isArray(current.classes)) {
      current.classes = current.classes.map((cls: any) => {
        if (!Array.isArray(cls.students)) return cls;
        let clsUpdated = false;
        const updatedStudents = cls.students.map((s: any) => {
          const entry = photoMap.get(s.id);
          if (!entry) return s;
          clsUpdated = true;
          updatedCount++;
          return {
            ...s,
            photo: entry.url,
            photoSha256: entry.sha256,
            photoManualLink: true,
            updatedAtMs: now,
          };
        });
        return clsUpdated ? { ...cls, updatedAtMs: now, students: updatedStudents } : cls;
      });
      writeSharedState({ classes: current.classes, classesUpdatedAtMs: now });
    }

    const results = Array.from(photoMap.entries()).map(([studentId, info]) => ({
      studentId,
      photoUrl: info.url,
      sha256: info.sha256,
    }));

    return { updatedCount, skippedCount, results };
  };

  // API: Upload individual binário de foto (zero bloat base64)
  app.post(
    '/api/photos/upload-binary',
    requireInstitutionalAuth,
    express.raw({ type: 'application/octet-stream', limit: '10mb' }),
    (req, res) => {
      const validation = validatePhotoUploadBinaryHeaders(
        req.headers['x-student-id'],
        req.headers['x-file-sha256'],
        req.body
      );
      if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const { studentId, sha256 } = validation.data;
      const buffer = req.body as Buffer;
      try {
        const result = applyPhotoBatchToState([
          {
            studentId,
            buffer,
            sha256,
          },
        ]);
        const item = result.results[0];
        const current = readSharedState();
        let resolvedUrl = item?.photoUrl;
        if (!resolvedUrl && Array.isArray(current.classes)) {
          for (const cls of current.classes) {
            const st = cls.students?.find((s: any) => s.id === studentId);
            if (st?.photo) {
              resolvedUrl = st.photo;
              break;
            }
          }
        }
        res.json({
          ok: true,
          photoUrl: resolvedUrl,
          sha256: item?.sha256,
          skipped: result.skippedCount > 0,
        });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Falha ao salvar foto binária' });
      }
    }
  );

  // API: Upload individual de foto pelo PEB I ou Admin (JSON DataURL retrocompatível)
  app.post('/api/photos/upload', requireInstitutionalAuth, (req, res) => {
    const validation = validatePhotoUploadPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { studentId, photoDataUrl } = validation.data;
    try {
      const saved = savePhotoDataUrlToFile(studentId, photoDataUrl);
      const current = readSharedState();
      let updated = false;
      const now = Date.now();
      if (Array.isArray(current.classes)) {
        current.classes = current.classes.map((cls: any) => {
          if (!Array.isArray(cls.students)) return cls;
          const has = cls.students.some((s: any) => s.id === studentId);
          if (!has) return cls;
          updated = true;
          return {
            ...cls,
            updatedAtMs: now,
            students: cls.students.map((s: any) => {
              if (s.id !== studentId) return s;
              return {
                ...s,
                photo: `${saved.photoUrl}?v=${now}`,
                photoSha256: saved.sha256,
                photoManualLink: true,
                updatedAtMs: now,
              };
            }),
          };
        });
      }
      if (updated) {
        writeSharedState({ classes: current.classes, classesUpdatedAtMs: now });
      }
      res.json({ ok: true, photoUrl: `${saved.photoUrl}?v=${now}`, sha256: saved.sha256 });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Falha ao salvar foto' });
    }
  });

  // API: Upload em lote binário de fotos nomeadas para 2000+ arquivos sem overhead base64
  app.post(
    '/api/photos/batch-binary',
    requireAdminAuth,
    express.raw({ type: 'application/octet-stream', limit: '30mb' }),
    (req, res) => {
      try {
        const items = decodeBinaryUploadPacket(req.body as Buffer);
        if (items.length === 0) {
          res.status(400).json({ error: 'Nenhuma foto no pacote binário.' });
          return;
        }
        const result = applyPhotoBatchToState(items);
        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Falha ao processar lote binário de fotos' });
      }
    }
  );

  // API: Upload em lote de fotos nomeadas pelo Admin (JSON retrocompatível com deduplicação SHA-256)
  app.post('/api/photos/batch', requireAdminAuth, (req, res) => {
    const validation = validatePhotoBatchPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { photos } = validation.data;
    try {
      const items = photos.map((item) => {
        const matches = item.photoDataUrl.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
        const buffer =
          matches && matches.length === 3
            ? Buffer.from(matches[2], 'base64')
            : Buffer.from(item.photoDataUrl);
        return {
          studentId: item.studentId,
          buffer,
          sha256: item.sha256,
        };
      });
      const result = applyPhotoBatchToState(items);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Falha ao processar lote de fotos' });
    }
  });

  // API: Limpar todas as fotos de todos os estudantes (Reset)
  app.post('/api/photos/clear-all', requireAdminAuth, (req, res) => {
    const safetyCheck = ensureSafePayloadObject(req.body ?? {});
    if (!safetyCheck.ok) {
      res.status(400).json({ error: safetyCheck.error });
      return;
    }
    try {
      if (fs.existsSync(PHOTOS_DIR)) {
        const files = fs.readdirSync(PHOTOS_DIR);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(PHOTOS_DIR, file));
          } catch {}
        }
      }
      const current = readSharedState();
      let clearedCount = 0;
      const now = Date.now();
      if (Array.isArray(current.classes)) {
        current.classes = current.classes.map((cls: any) => {
          if (!Array.isArray(cls.students)) return cls;
          return {
            ...cls,
            updatedAtMs: now,
            students: cls.students.map((s: any) => {
              if (s.photo || s.photoDriveId || s.photoDriveUrl || s.photoSha256) clearedCount++;
              return {
                ...s,
                photo: '',
                photoDriveId: '',
                photoDriveUrl: '',
                photoSha256: '',
                photoManualLink: false,
                updatedAtMs: now,
              };
            }),
          };
        });
      }
      writeSharedState({
        classes: current.classes,
        classesUpdatedAtMs: now,
        discoveredDrivePhotos: [],
      });
      res.json({ ok: true, clearedCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Falha ao limpar fotos' });
    }
  });

  // Diretório persistente local para PDFs (fichas cadastrais/informativas) dos estudantes da EMEB Candelário
  const PDFS_DIR = path.join(os.tmpdir(), 'emeb_candelario_student_pdfs_v1');
  if (!fs.existsSync(PDFS_DIR)) {
    try {
      fs.mkdirSync(PDFS_DIR, { recursive: true });
    } catch {}
  }

  // API: Servir PDFs salvos no servidor apenas para usuários institucionais autenticados
  app.get('/api/pdfs/:filename', requireInstitutionalAuth, (req, res) => {
    const filename = path.basename(req.params.filename || '');
    if (!filename || filename.includes('..')) {
      res.status(400).end();
      return;
    }
    const filePath = path.join(PDFS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  });

  const savePdfBufferToFile = (
    studentId: string,
    buffer: Buffer
  ): { pdfUrl: string; pdfId: string; sha256: string } => {
    if (!hasPdfSignatureInBuffer(buffer)) {
      throw new Error(`Arquivo PDF inválido ou corrompido (sem cabeçalho %PDF-) para ${studentId}.`);
    }
    const cleanId = String(studentId).replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${cleanId}.pdf`;
    const filePath = path.join(PDFS_DIR, filename);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    let needsWrite = true;
    if (fs.existsSync(filePath)) {
      try {
        const existingBuf = fs.readFileSync(filePath);
        const existingSha = crypto.createHash('sha256').update(existingBuf).digest('hex');
        if (existingSha === sha256) {
          needsWrite = false;
        }
      } catch {
        needsWrite = true;
      }
    }
    if (needsWrite) {
      fs.writeFileSync(filePath, buffer);
    }

    return {
      pdfUrl: `/api/pdfs/${filename}`,
      pdfId: cleanId,
      sha256,
    };
  };

  const decodePdfBufferFromDataUrl = (dataUrlOrBase64: string): Buffer => {
    const matches = dataUrlOrBase64.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return Buffer.from(matches[2], 'base64');
    }
    if (dataUrlOrBase64.startsWith('JVBERi0')) {
      return Buffer.from(dataUrlOrBase64, 'base64');
    }
    return Buffer.from(dataUrlOrBase64);
  };

  const applyPdfBatchToState = (
    items: Array<{ studentId: string; buffer: Buffer; sha256?: string }>
  ) => {
    const current = readSharedState();
    const existingStudentShaMap = new Map<string, { sha256?: string; pdfUrl?: string }>();
    if (Array.isArray(current.classes)) {
      for (const cls of current.classes) {
        if (!Array.isArray(cls.students)) continue;
        for (const s of cls.students) {
          if (s?.id) {
            existingStudentShaMap.set(s.id, {
              sha256: s.fichaPdfSha256,
              pdfUrl: s.fichaPdfDriveUrl,
            });
          }
        }
      }
    }

    const now = Date.now();
    const pdfMap = new Map<string, { url: string; id: string; sha256: string }>();
    let skippedCount = 0;

    for (const item of items) {
      if (!item.studentId || !item.buffer || item.buffer.length === 0) continue;
      const incomingSha =
        item.sha256 || crypto.createHash('sha256').update(item.buffer).digest('hex');
      const cleanId = String(item.studentId).replace(/[^a-zA-Z0-9-_]/g, '_');
      const existingInfo = existingStudentShaMap.get(item.studentId);

      if (
        existingInfo?.sha256 &&
        existingInfo.sha256 === incomingSha &&
        existingInfo.pdfUrl &&
        fs.existsSync(path.join(PDFS_DIR, `${cleanId}.pdf`))
      ) {
        skippedCount++;
        continue;
      }

      const saved = savePdfBufferToFile(item.studentId, item.buffer);
      pdfMap.set(item.studentId, {
        url: `${saved.pdfUrl}?v=${now}`,
        id: saved.pdfId,
        sha256: saved.sha256,
      });
    }

    let updatedCount = 0;
    if (pdfMap.size > 0 && Array.isArray(current.classes)) {
      current.classes = current.classes.map((cls: any) => {
        if (!Array.isArray(cls.students)) return cls;
        let clsUpdated = false;
        const updatedStudents = cls.students.map((s: any) => {
          const entry = pdfMap.get(s.id);
          if (!entry) return s;
          clsUpdated = true;
          updatedCount++;
          return {
            ...s,
            fichaPdfDriveUrl: entry.url,
            fichaPdfDriveId: entry.id,
            fichaPdfSha256: entry.sha256,
            fichaPdfManualLink: true,
            updatedAtMs: now,
          };
        });
        return clsUpdated ? { ...cls, updatedAtMs: now, students: updatedStudents } : cls;
      });
      writeSharedState({ classes: current.classes, classesUpdatedAtMs: now });
    }

    const results = Array.from(pdfMap.entries()).map(([studentId, info]) => ({
      studentId,
      pdfUrl: info.url,
      pdfId: info.id,
      sha256: info.sha256,
    }));

    return { updatedCount, skippedCount, results };
  };

  // API: Upload individual de PDF de estudante
  app.post('/api/pdfs/upload', requireInstitutionalAuth, (req, res) => {
    const validation = validatePdfUploadPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { studentId, pdfDataUrl } = validation.data;
    try {
      const buffer = decodePdfBufferFromDataUrl(pdfDataUrl);
      const result = applyPdfBatchToState([{ studentId, buffer }]);
      const entry = result.results[0];
      res.json({
        ok: true,
        pdfUrl: entry?.pdfUrl,
        sha256: entry?.sha256,
        skipped: result.skippedCount > 0,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Falha ao salvar PDF' });
    }
  });

  // API: Upload em lote binário de Fichas PDF para 2000+ arquivos sem overhead base64
  app.post(
    '/api/pdfs/batch-binary',
    requireAdminAuth,
    express.raw({ type: 'application/octet-stream', limit: '30mb' }),
    (req, res) => {
      try {
        const items = decodeBinaryUploadPacket(req.body as Buffer);
        if (items.length === 0) {
          res.status(400).json({ error: 'Nenhum PDF no pacote binário.' });
          return;
        }
        const result = applyPdfBatchToState(items);
        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Falha ao processar lote binário de PDFs' });
      }
    }
  );

  // API: Upload em lote de PDFs nomeados pelo Admin (JSON retrocompatível)
  app.post('/api/pdfs/batch', requireAdminAuth, (req, res) => {
    const validation = validatePdfBatchPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { pdfs } = validation.data;
    try {
      const items = pdfs.map((item) => ({
        studentId: item.studentId,
        buffer: decodePdfBufferFromDataUrl(item.pdfDataUrl),
        sha256: item.sha256,
      }));
      const result = applyPdfBatchToState(items);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Falha ao processar lote de PDFs' });
    }
  });

  // API: Limpar todas as fichas PDF de todos os estudantes (Reset de PDFs)
  app.post('/api/pdfs/clear-all', requireAdminAuth, (req, res) => {
    const safetyCheck = ensureSafePayloadObject(req.body ?? {});
    if (!safetyCheck.ok) {
      res.status(400).json({ error: safetyCheck.error });
      return;
    }
    try {
      if (fs.existsSync(PDFS_DIR)) {
        const files = fs.readdirSync(PDFS_DIR);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(PDFS_DIR, file));
          } catch {}
        }
      }
      const current = readSharedState();
      let clearedCount = 0;
      const now = Date.now();
      if (Array.isArray(current.classes)) {
        current.classes = current.classes.map((cls: any) => {
          if (!Array.isArray(cls.students)) return cls;
          return {
            ...cls,
            updatedAtMs: now,
            students: cls.students.map((s: any) => {
              if (s.fichaPdfDriveUrl || s.fichaPdfDriveId || s.fichaPdfSha256) clearedCount++;
              return {
                ...s,
                fichaPdfDriveId: '',
                fichaPdfDriveUrl: '',
                fichaPdfSubfolder: '',
                fichaPdfSha256: '',
                fichaPdfManualLink: false,
                updatedAtMs: now,
              };
            }),
          };
        });
      }
      writeSharedState({
        classes: current.classes,
        classesUpdatedAtMs: now,
      });
      res.json({ ok: true, clearedCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Falha ao limpar PDFs' });
    }
  });

  // Cache em memória das imagens do Drive para carregamento instantâneo nos dispositivos dos professores
  const drivePhotoBufferCache = new Map<
    string,
    { buffer: Buffer; contentType: string; cachedAt: number }
  >();

  // API: Proxy universal de fotos do Google Drive (/api/drive-photo/:fileId) protegido por autenticação institucional
  app.get('/api/drive-photo/:fileId', requireInstitutionalAuth, async (req, res) => {
    const fileId = String(req.params.fileId || '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!fileId) {
      res.status(400).end();
      return;
    }

    const cached = drivePhotoBufferCache.get(fileId);
    if (cached && Date.now() - cached.cachedAt < 1000 * 60 * 60 * 6) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cached.buffer);
      return;
    }

    const state = readSharedState();
    const token = state.adminDriveToken;

    if (token) {
      try {
        const mediaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            fileId
          )}?alt=media&supportsAllDrives=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (mediaRes.status === 401) {
          // Evict expired token so stale tokens are not reused indefinitely
          writeSharedState({ adminDriveToken: '', adminDriveTokenUpdatedAtMs: 0 });
        } else if (mediaRes.ok) {
          const contentType =
            mediaRes.headers.get('content-type') || 'image/jpeg';
          if (contentType.startsWith('image/') || contentType.includes('octet-stream')) {
            const arrayBuffer = await mediaRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (buffer.length > 100) {
              const finalType = contentType.startsWith('image/')
                ? contentType
                : 'image/jpeg';
              if (drivePhotoBufferCache.size > 600) {
                const oldestKey = drivePhotoBufferCache.keys().next().value;
                if (oldestKey) drivePhotoBufferCache.delete(oldestKey);
              }
              drivePhotoBufferCache.set(fileId, {
                buffer,
                contentType: finalType,
                cachedAt: Date.now(),
              });
              res.setHeader('Content-Type', finalType);
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.send(buffer);
              return;
            }
          }
        }
      } catch {
        // fallback to public thumbnail endpoints below
      }
    }

    const fallbackUrls = [
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`,
      `https://lh3.googleusercontent.com/d/${fileId}=w500`,
    ];

    for (const url of fallbackUrls) {
      try {
        const pubRes = await fetch(url);
        const contentType = pubRes.headers.get('content-type') || '';
        if (pubRes.ok && contentType.startsWith('image/')) {
          const arrayBuffer = await pubRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length > 100) {
            drivePhotoBufferCache.set(fileId, {
              buffer,
              contentType,
              cachedAt: Date.now(),
            });
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(buffer);
            return;
          }
        }
      } catch {
        // continue
      }
    }

    res.status(404).end();
  });

  // API: Sincronizar Turmas, Faltas, Atestados, Fotos, NIS e Links de PDFs Escaneados em tempo real com controle de concorrência por turma/estudante
  app.post('/api/school-state/classes', requireInstitutionalAuth, requireCurrentCleanEpoch, (req, res) => {
    const validation = validateSchoolStateClassesPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const {
      classes,
      classesUpdatedAtMs,
      discoveredNominalPdfs,
      discoveredDrivePhotos,
      cloudLinks,
      opId,
    } = validation.data;
    const user = extractRequestUser(req);
    const current = readSharedState();
    const incTime = classesUpdatedAtMs || Date.now();
    const existingClassesMap = new Map<string, any>();
    if (Array.isArray(current.classes)) {
      current.classes.forEach((c: any) => {
        if (c && c.id) existingClassesMap.set(String(c.id).toLowerCase(), c);
      });
    }

    // Per-class and per-student concurrency merge so two teachers editing different classes or students never overwrite each other
    const compactClasses = classes.map((cls: any) => {
      const existingCls = existingClassesMap.get(String(cls?.id || '').toLowerCase());
      const clsIncTime = cls?.updatedAtMs || incTime;
      const clsExtTime = existingCls?.updatedAtMs || 0;

      // If existing class on server is strictly newer than incoming class, keep existing class
      if (existingCls && clsExtTime > clsIncTime) {
        return existingCls;
      }

      const existingStudentsMap = new Map<string, any>();
      if (existingCls && Array.isArray(existingCls.students)) {
        existingCls.students.forEach((s: any) => {
          if (s && s.id) existingStudentsMap.set(String(s.id), s);
        });
      }

      const mergedStudents = Array.isArray(cls.students)
        ? cls.students.map((st: any) => {
            const extSt = existingStudentsMap.get(String(st?.id || ''));
            const stIncTime = st?.updatedAtMs || 0;
            const stExtTime = extSt?.updatedAtMs || 0;
            const baseSt = extSt && stExtTime > stIncTime ? extSt : st;

            // Defensive Validation & Bounding
            const diasLetivosRecorte = Math.max(0, Math.min(31, Number(baseSt.diasLetivosRecorte ?? 20)));
            const totalAbsencesMonth = Math.max(0, Math.min(diasLetivosRecorte, Number(baseSt.totalAbsencesMonth ?? 0)));
            const justifiedAbsences = Math.max(0, Math.min(totalAbsencesMonth, Number(baseSt.justifiedAbsences ?? 0)));

            // Preserve manual photo and manual PDF links unless explicitly updated
            const preserveManualPhoto =
              extSt?.photoManualLink && !st?.photoManualLink && stIncTime < stExtTime;
            const preserveManualPdf =
              extSt?.fichaPdfManualLink && !st?.fichaPdfManualLink && stIncTime < stExtTime;

            const finalPhotoRaw = preserveManualPhoto ? extSt.photo : baseSt.photo;
            const finalPhotoDriveUrl = preserveManualPhoto
              ? extSt.photoDriveUrl
              : baseSt.photoDriveUrl || extSt?.photoDriveUrl;

            return {
              ...baseSt,
              diasLetivosRecorte,
              totalAbsencesMonth,
              justifiedAbsences,
              isDeleted: Boolean(baseSt.isDeleted),
              photoDriveId: preserveManualPhoto
                ? extSt.photoDriveId
                : baseSt.photoDriveId || extSt?.photoDriveId,
              photoDriveUrl: finalPhotoDriveUrl,
              photoManualLink: Boolean(
                preserveManualPhoto ? extSt.photoManualLink : baseSt.photoManualLink
              ),
              fichaPdfDriveId: preserveManualPdf
                ? extSt.fichaPdfDriveId
                : baseSt.fichaPdfDriveId || extSt?.fichaPdfDriveId,
              fichaPdfDriveUrl: preserveManualPdf
                ? extSt.fichaPdfDriveUrl
                : baseSt.fichaPdfDriveUrl || extSt?.fichaPdfDriveUrl,
              fichaPdfSubfolder: preserveManualPdf
                ? extSt.fichaPdfSubfolder
                : baseSt.fichaPdfSubfolder || extSt?.fichaPdfSubfolder,
              fichaPdfManualLink: Boolean(
                preserveManualPdf ? extSt.fichaPdfManualLink : baseSt.fichaPdfManualLink
              ),
              photo:
                finalPhotoRaw &&
                typeof finalPhotoRaw === 'string' &&
                finalPhotoRaw.startsWith('data:image') &&
                finalPhotoRaw.length > 35000 &&
                finalPhotoDriveUrl
                  ? finalPhotoDriveUrl
                  : finalPhotoRaw,
            };
          })
        : [];

      return {
        ...cls,
        version: (cls.version || existingCls?.version || 1) + 1,
        updatedAtMs: Math.max(clsIncTime, clsExtTime),
        students: mergedStudents,
      };
    });

    const patch: Partial<SharedSchoolState> = {
      classes: compactClasses,
      classesUpdatedAtMs: Math.max(incTime, current.classesUpdatedAtMs || 0),
    };

    if (Array.isArray(discoveredNominalPdfs) && discoveredNominalPdfs.length > 0) {
      patch.discoveredNominalPdfs = discoveredNominalPdfs;
    }
    if (Array.isArray(discoveredDrivePhotos) && discoveredDrivePhotos.length > 0) {
      patch.discoveredDrivePhotos = discoveredDrivePhotos;
    }
    if (cloudLinks && typeof cloudLinks === 'object') {
      patch.cloudLinks = {
        ...(current.cloudLinks || {}),
        ...cloudLinks,
        updatedAtMs: Date.now(),
      };
    }

    const saved = writeSharedState(patch);

    // Audit log
    recordSecurityAuditLog(
      'CLASSES_ATTENDANCE_SYNCED',
      `Sincronização atômica de ${compactClasses.length} turmas (${opId || 'sem opId'}) confirmada com sucesso.`,
      req,
      'SUCCESS',
      user
    );

    res.json({ ok: true, classesUpdatedAtMs: saved.classesUpdatedAtMs, opId });
  });

  // API: Sincronizar Links de Pastas (Fotos / Fichas Informativas PDF) e Planilha Oficial Google Sheets (Admin Only)
  app.post('/api/school-state/links', requireAdminAuth, requireCurrentCleanEpoch, (req, res) => {
    const validation = validateSchoolStateLinksPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { cloudLinks, discoveredNominalPdfs, discoveredDrivePhotos } = validation.data;
    const current = readSharedState();
    const patch: Partial<SharedSchoolState> = {};

    if (cloudLinks && typeof cloudLinks === 'object') {
      patch.cloudLinks = {
        ...(current.cloudLinks || {}),
        ...cloudLinks,
        updatedAtMs: Date.now(),
      };
    }
    if (Array.isArray(discoveredNominalPdfs)) {
      patch.discoveredNominalPdfs = discoveredNominalPdfs;
    }
    if (Array.isArray(discoveredDrivePhotos) && discoveredDrivePhotos.length > 0) {
      patch.discoveredDrivePhotos = discoveredDrivePhotos;
    }

    const saved = writeSharedState(patch);
    recordSecurityAuditLog(
      'CLOUD_LINKS_UPDATED',
      'Configuração de pastas na nuvem atualizada.',
      req
    );
    res.json(saved);
  });

  // API: Atualizar Usuários Autorizados (vínculo de turmas PEB I / PEB II / Admin) (Admin Only)
  app.post('/api/school-state/users', requireAdminAuth, (req, res) => {
    const validation = validateSchoolStateUsersPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { authorizedUsers } = validation.data;
    const current = readSharedState();
    // Merge preserving higher access counts/durations while respecting newer updatedAtMs for role/class assignments
    const currentByEmail = new Map<string, any>();
    (current.authorizedUsers || []).forEach((u: any) => {
      if (u && typeof u.email === 'string') {
        currentByEmail.set(u.email.trim().toLowerCase(), u);
      }
    });

    const mergedUsers = authorizedUsers.map((incoming: any) => {
      const email = String(incoming.email || '').trim().toLowerCase();
      const existing = currentByEmail.get(email);
      if (!existing) return incoming;

      const incTime = incoming.updatedAtMs || 0;
      const extTime = existing.updatedAtMs || 0;
      const winner = incTime >= extTime ? incoming : existing;

      return {
        ...winner,
        updatedAtMs: Math.max(incTime, extTime),
        totalAccessCount: Math.max(
          incoming.totalAccessCount || 0,
          existing.totalAccessCount || 0
        ),
        totalDurationSeconds: Math.max(
          incoming.totalDurationSeconds || 0,
          existing.totalDurationSeconds || 0
        ),
        lastSessionDurationSeconds: Math.max(
          incoming.lastSessionDurationSeconds || 0,
          existing.lastSessionDurationSeconds || 0
        ),
        lastLoginAt: incoming.lastLoginAt || existing.lastLoginAt,
        lastActiveAt: incoming.lastActiveAt || existing.lastActiveAt,
        lastScreenVisited: incoming.lastScreenVisited || existing.lastScreenVisited,
      };
    });

    const saved = writeSharedState({ authorizedUsers: mergedUsers });
    res.json(saved);
  });

  // Helper: Higienização Recursiva contra XSS / Injection
  const sanitizeTextSafe = (val: any): any => {
    if (typeof val === 'string') {
      return val
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeTextSafe);
    }
    if (val && typeof val === 'object') {
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        cleaned[k] = sanitizeTextSafe(v);
      }
      return cleaned;
    }
    return val;
  };

  // API: Limpar Apenas os Dados do Banco Escolar (Manter turmas, usuários autorizados e calendário intactos) (Admin Only)
  app.post('/api/school-state/reset', requireAdminAuth, (req, res) => {
    const validation = validateSchoolStateResetPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { freshClasses } = validation.data;
    const user = extractRequestUser(req);
    const nowMs = Date.now();

    // Remove temporary uploaded student photos and PDFs from disk
    for (const dirPath of [PHOTOS_DIR, PDFS_DIR]) {
      try {
        if (fs.existsSync(dirPath)) {
          for (const file of fs.readdirSync(dirPath)) {
            try {
              fs.unlinkSync(path.join(dirPath, file));
            } catch {
              // ignore individual file delete failure
            }
          }
        }
      } catch {
        // ignore directory cleanup error
      }
    }

    const current = readSharedState();
    const baseClasses =
      Array.isArray(freshClasses) && freshClasses.length > 0
        ? freshClasses
        : current.classes || [];

    const targetClasses = baseClasses.map((c: any) => ({
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

    const cleanedUsers = Array.isArray(current.authorizedUsers)
      ? current.authorizedUsers.map((u: any) => ({
          ...u,
          totalAccessCount: 0,
          totalDurationSeconds: 0,
          lastSessionDurationSeconds: 0,
          lastLoginAt: undefined,
          lastActiveAt: undefined,
          lastScreenVisited: undefined,
        }))
      : current.authorizedUsers;

    writeSharedState({
      cleanResetEpochId: SERVER_CLEAN_RESET_EPOCH_ID,
      classes: targetClasses,
      classesUpdatedAtMs: nowMs,
      authorizedUsers: cleanedUsers,
      accessSessionLogs: [],
      schoolNotices: [],
      securityAuditLogs: [],
      discoveredNominalPdfs: [],
      discoveredDrivePhotos: [],
      fcmAlerts: [],
    });

    res.json({ ok: true, classesUpdatedAtMs: nowMs, totalClasses: targetClasses.length, user: user.email });
  });

  // API: Importar e Atualizar Base Escolar via Arquivo JSON (Admin Only, Validação Estrita & Auditoria)
  app.post('/api/school-state/import-json', requireAdminAuth, requireCurrentCleanEpoch, (req, res) => {
    const validation = validateSchoolStateImportJsonPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { payload, fileName, fileSize } = validation.data;

    let rawClasses: any[] | null = null;
    if (Array.isArray(payload)) {
      rawClasses = payload;
    } else if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.classes)) {
        rawClasses = payload.classes;
      } else if (Array.isArray(payload.turmas)) {
        rawClasses = payload.turmas;
      }
    }

    if (!rawClasses || !Array.isArray(rawClasses) || rawClasses.length === 0) {
      res.status(400).json({
        error: 'Estrutura JSON inválida. O arquivo precisa conter uma lista de turmas (classes ou turmas com estudantes).',
      });
      return;
    }

    const cleanedPayload = sanitizeTextSafe(rawClasses);
    const sanitizedClasses = sanitizeAndDeduplicateClasses(cleanedPayload) || [];
    const totalStudents = sanitizedClasses.reduce((acc, c) => acc + (c.students?.length || 0), 0);
    const nowMs = Date.now();
    const user = extractRequestUser(req);

    const patch: Partial<SharedSchoolState> = {
      classes: sanitizedClasses,
      classesUpdatedAtMs: nowMs,
    };

    if (payload.officialCalendarConfig && typeof payload.officialCalendarConfig === 'object') {
      patch.officialCalendarConfig = sanitizeTextSafe(payload.officialCalendarConfig);
    }
    if (Array.isArray(payload.holidays) && payload.holidays.length > 0) {
      patch.holidays = sanitizeTextSafe(payload.holidays);
    }

    writeSharedState(patch);

    recordSecurityAuditLog(
      'JSON_DATA_IMPORT_APPLIED',
      `Base escolar atualizada com sucesso via arquivo JSON "${fileName || 'upload.json'}" (${sanitizedClasses.length} turmas, ${totalStudents} estudantes, ${fileSize || 'N/A'}) por ${user.email}`,
      req,
      'SUCCESS',
      user
    );

    res.json({
      ok: true,
      classesUpdatedAtMs: nowMs,
      totalClasses: sanitizedClasses.length,
      totalStudents,
      classes: sanitizedClasses,
    });
  });

  // API: Atualizar Logs de Sessão e Tempo Conectado (autenticado institucionalmente)
  app.post('/api/school-state/logs', requireInstitutionalAuth, requireCurrentCleanEpoch, (req, res) => {
    const validation = validateSchoolStateLogsPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { accessSessionLogs, authorizedUsers } = validation.data;
    const current = readSharedState();

    // Merge session logs by ID
    const logMap = new Map<string, any>();
    (current.accessSessionLogs || []).forEach((l: any) => {
      if (l && l.id) logMap.set(l.id, l);
    });
    if (Array.isArray(accessSessionLogs)) {
      accessSessionLogs.forEach((l: any) => {
        if (!l || !l.id) return;
        const prev = logMap.get(l.id);
        if (!prev || (l.durationSeconds || 0) >= (prev.durationSeconds || 0) || l.logoutTimeISO) {
          logMap.set(l.id, l);
        }
      });
    }
    const mergedLogs = Array.from(logMap.values())
      .sort(
        (a, b) =>
          new Date(b.loginTimeISO || 0).getTime() -
          new Date(a.loginTimeISO || 0).getTime()
      )
      .slice(0, 500);

    let nextUsers = current.authorizedUsers;
    const reqUser = extractRequestUser(req);
    if (Array.isArray(authorizedUsers)) {
      const currentByEmail = new Map<string, any>();
      (current.authorizedUsers || []).forEach((u: any) => {
        if (u && typeof u.email === 'string') {
          currentByEmail.set(u.email.trim().toLowerCase(), u);
        }
      });
      nextUsers = authorizedUsers.map((incoming: any) => {
        const email = String(incoming.email || '').trim().toLowerCase();
        const existing = currentByEmail.get(email);
        if (!existing) return incoming;
        // Usuários não-admin só podem atualizar estatísticas de sessão da própria conta, jamais escalar role/status
        if (!reqUser.isAdmin && email !== reqUser.email) {
          return existing;
        }
        const incTime = incoming.updatedAtMs || 0;
        const extTime = existing.updatedAtMs || 0;
        const winner = reqUser.isAdmin && incTime >= extTime ? incoming : existing;
        return {
          ...winner,
          updatedAtMs: Math.max(incTime, extTime),
          totalAccessCount: Math.max(
            incoming.totalAccessCount || 0,
            existing.totalAccessCount || 0
          ),
          totalDurationSeconds: Math.max(
            incoming.totalDurationSeconds || 0,
            existing.totalDurationSeconds || 0
          ),
          lastSessionDurationSeconds: Math.max(
            incoming.lastSessionDurationSeconds || 0,
            existing.lastSessionDurationSeconds || 0
          ),
          lastLoginAt: incoming.lastLoginAt || existing.lastLoginAt,
          lastActiveAt: incoming.lastActiveAt || existing.lastActiveAt,
          lastScreenVisited: incoming.lastScreenVisited || existing.lastScreenVisited,
        };
      });
    }

    const saved = writeSharedState({
      accessSessionLogs: mergedLogs,
      ...(nextUsers ? { authorizedUsers: nextUsers } : {}),
    });
    res.json(saved);
  });

  // API: Atualizar Configuração de Janela de Lançamento Excepcional (Admin Only)
  app.post('/api/school-state/window', requireAdminAuth, (req, res) => {
    const validation = validateAttendanceWindowPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { attendanceWindowConfig } = validation.data;
    const saved = writeSharedState({ attendanceWindowConfig });
    recordSecurityAuditLog(
      'ATTENDANCE_WINDOW_MODIFIED',
      `Janela de frequência alterada: ${attendanceWindowConfig.isOpen ? 'ABERTA' : 'FECHADA'} até ${attendanceWindowConfig.closeDateISO || 'N/A'}.`,
      req
    );
    void checkServerSideWindowClosingAlert();
    res.json(saved);
  });

  // API: Publicar / Atualizar Comunicados do Quadro de Avisos Institucional
  app.post('/api/school-state/notices', requireInstitutionalAuth, requireCurrentCleanEpoch, (req, res) => {
    const validation = validateSchoolNoticesPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { schoolNotices } = validation.data;
    const saved = writeSharedState({ schoolNotices: schoolNotices.slice(0, 60) });
    recordSecurityAuditLog(
      'SCHOOL_NOTICES_UPDATED',
      `Quadro de avisos atualizado (${schoolNotices.length} avisos).`,
      req
    );
    res.json(saved);
  });

  // API: Obter Calendário Escolar Oficial (200 Dias), Feriados e Auditoria (protegido por auth)
  app.get('/api/calendar-config', requireInstitutionalAuth, (_req, res) => {
    const state = readSharedState();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      calendarConfig: state.officialCalendarConfig,
      holidays: state.holidays || OFFICIAL_DEFAULT_HOLIDAYS_2027,
      auditLogs: (state.calendarAuditLogs || []).slice(0, 100),
      updatedAtMs: state.officialCalendarConfig?.updatedAtMs || Date.now(),
    });
  });

  // API: Homologação e Configuração Única dos 200 Dias Letivos (Proteção Estrita de Administrador)
  app.post('/api/calendar-config', requireAdminAuth, (req, res) => {
    const payloadCheck = validateCalendarConfigPayload(req.body);
    if (!payloadCheck.ok) {
      res.status(400).json({ error: payloadCheck.error });
      return;
    }
    const { rawDatesText, schoolDays, adminEmail, adminName, year } = payloadCheck.data;
    const current = readSharedState();
    const currentHolidays = current.holidays || OFFICIAL_DEFAULT_HOLIDAYS_2027;

    const textToValidate = typeof rawDatesText === 'string' && rawDatesText.trim().length > 0
      ? rawDatesText
      : Array.isArray(schoolDays)
      ? schoolDays.join('\n')
      : '';

    const validation = parseAndValidateSchoolDates(textToValidate, currentHolidays);

    if (validation.hasErrors) {
      res.status(400).json({
        error: 'Erros de validação encontrados no lote de datas informado.',
        invalidEntries: validation.invalidEntries,
        duplicateEntries: validation.duplicateEntries,
      });
      return;
    }

    // Regra Inegociável dos 200 Dias Letivos
    if (validation.totalCount !== 200) {
      res.status(400).json({
        error: `A meta oficial exige exatamente 200 dias letivos distintos. O lote enviado possui ${validation.totalCount} datas (${validation.remainingCount > 0 ? `faltam ${validation.remainingCount} dias` : `excedente de ${validation.exceededCount} dias`}).`,
        totalCount: validation.totalCount,
        remainingCount: validation.remainingCount,
        exceededCount: validation.exceededCount,
      });
      return;
    }

    const newCalendarConfig = {
      year: Number(year) || 2027,
      schoolDays: validation.validDates,
      calendarDays: validation.calendarDays,
      monthlyDistribution: validation.monthlyDistribution,
      holidays: currentHolidays,
      updatedAtMs: Date.now(),
      updatedByEmail: adminEmail || 'emebjfreitas@jundiai.sp.gov.br',
      updatedByName: adminName || 'Administrador Escolar',
      version: (current.officialCalendarConfig?.version || 1) + 1,
    };

    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestampISO: new Date().toISOString(),
      adminEmail: adminEmail || 'emebjfreitas@jundiai.sp.gov.br',
      adminName: adminName || 'Administrador Escolar',
      action: 'UPDATE_200_DAYS',
      previousDaysCount: current.officialCalendarConfig?.schoolDays?.length || 200,
      newDaysCount: 200,
      holidaysCount: currentHolidays.length,
      details: `Configuração única dos 200 dias letivos de ${year || 2027} homologada com sucesso via processamento centralizado.`,
      clientIp: req.ip,
    };

    const auditLogs = [auditEntry, ...(current.calendarAuditLogs || [])].slice(0, 150);

    // Cascata imediata para as turmas escolares: atualiza classesHeld e monthlySchoolDays preservando histórico
    let updatedClasses = current.classes;
    if (Array.isArray(updatedClasses)) {
      updatedClasses = updatedClasses.map((cls: any) => ({
        ...cls,
        classesHeld: validation.monthlyDistribution['Outubro'] || cls.classesHeld || 20,
        monthlySchoolDays: {
          ...(cls.monthlySchoolDays || {}),
          ...validation.monthlyDistribution,
        },
        updatedAtMs: Date.now(),
      }));
    }

    const saved = writeSharedState({
      officialCalendarConfig: newCalendarConfig,
      calendarAuditLogs: auditLogs,
      ...(updatedClasses ? { classes: updatedClasses, classesUpdatedAtMs: Date.now() } : {}),
    });

    res.json({
      ok: true,
      calendarConfig: saved.officialCalendarConfig,
      auditEntry,
      monthlyDistribution: validation.monthlyDistribution,
    });
  });

  // API: Gerenciamento Centralizado de Feriados e Recessos Escolares (Admin Only)
  app.post('/api/holidays', requireAdminAuth, (req, res) => {
    const validation = validateHolidayActionPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { action, holiday, holidayId, adminEmail, adminName } = validation.data;
    const current = readSharedState();
    let holidaysList = Array.isArray(current.holidays) ? [...current.holidays] : [...OFFICIAL_DEFAULT_HOLIDAYS_2027];

    let auditDetail = '';

    if (action === 'delete') {
      if (!holidayId) {
        res.status(400).json({ error: 'holidayId não informado para exclusão.' });
        return;
      }
      const target = holidaysList.find((h) => h.id === holidayId);
      holidaysList = holidaysList.filter((h) => h.id !== holidayId);
      auditDetail = `Exclusão do feriado/recesso: "${target?.name || holidayId}" (${target?.date || ''}).`;
    } else if (action === 'add') {
      if (!holiday || !holiday.date || !holiday.name) {
        res.status(400).json({ error: 'Dados do feriado incompletos (data e nome são obrigatórios).' });
        return;
      }
      const newHol = {
        id: `hol-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: String(holiday.date).trim(),
        name: String(holiday.name).trim(),
        type: holiday.type || 'municipal',
        description: holiday.description || '',
        createdAtISO: new Date().toISOString(),
        updatedByEmail: adminEmail || 'emebjfreitas@jundiai.sp.gov.br',
      };
      holidaysList.push(newHol);
      auditDetail = `Cadastro de novo feriado/recesso: "${newHol.name}" em ${newHol.date} (${newHol.type}).`;
    } else if (action === 'edit') {
      if (!holiday || !holiday.id) {
        res.status(400).json({ error: 'Dados do feriado incompletos para edição.' });
        return;
      }
      holidaysList = holidaysList.map((h) => (h.id === holiday.id ? { ...h, ...holiday } : h));
      auditDetail = `Edição do feriado/recesso: "${holiday.name}" (${holiday.date}).`;
    } else if (action === 'restore_defaults') {
      holidaysList = [...OFFICIAL_DEFAULT_HOLIDAYS_2027];
      auditDetail = 'Restauração da lista padrão de feriados e recessos oficiais de Jundiaí/SP.';
    } else {
      res.status(400).json({ error: 'Ação de feriado inválida.' });
      return;
    }

    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestampISO: new Date().toISOString(),
      adminEmail: adminEmail || 'emebjfreitas@jundiai.sp.gov.br',
      adminName: adminName || 'Administrador Escolar',
      action: action === 'delete' ? 'DELETE_HOLIDAY' : action === 'edit' ? 'EDIT_HOLIDAY' : 'ADD_HOLIDAY',
      previousDaysCount: current.officialCalendarConfig?.schoolDays?.length || 200,
      newDaysCount: current.officialCalendarConfig?.schoolDays?.length || 200,
      holidaysCount: holidaysList.length,
      details: auditDetail,
      clientIp: req.ip,
    };

    const auditLogs = [auditEntry, ...(current.calendarAuditLogs || [])].slice(0, 150);
    const saved = writeSharedState({
      holidays: holidaysList,
      calendarAuditLogs: auditLogs,
    });

    res.json({
      ok: true,
      holidays: saved.holidays,
      auditEntry,
    });
  });

  // API: Obter Histórico de Auditoria do Calendário (Admin / Usuário Institucional autenticado)
  app.get('/api/calendar-audit-log', requireInstitutionalAuth, (_req, res) => {
    const state = readSharedState();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      auditLogs: (state.calendarAuditLogs || []).slice(0, 150),
    });
  });

  // API: Obter Logs de Auditoria de Segurança & LGPD (Admin Only)
  app.get('/api/security-logs', requireAdminAuth, (_req, res) => {
    const state = readSharedState();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      securityLogs: (state.securityAuditLogs || []).slice(0, 300),
      lgpdConfig: state.lgpdConfig || null,
    });
  });

  // API: Registrar Evento de Segurança / Auditoria LGPD (Exige autenticação institucional verificada)
  app.post('/api/security-logs', requireInstitutionalAuth, (req, res) => {
    const validation = validateSecurityLogPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const entry = validation.data;

    const verifiedUser = extractRequestUser(req);
    const state = readSharedState();
    const existingLogs = Array.isArray(state.securityAuditLogs) ? state.securityAuditLogs : [];
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1';

    const enrichedEntry = {
      ...entry,
      userEmail: verifiedUser.email,
      userRole: verifiedUser.role,
      id: entry.id || `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestampISO: entry.timestampISO || new Date().toISOString(),
      clientIp,
    };

    const nextLogs = [enrichedEntry, ...existingLogs].slice(0, 300);
    writeSharedState({ securityAuditLogs: nextLogs });

    res.json({ ok: true, entry: enrichedEntry });
  });

  // =========================================================================
  // FIREBASE CLOUD MESSAGING (FCM) & AUTO-CONFIGURED WEB PUSH (ZERO SETUP)
  // =========================================================================
  let cachedFcmAccessToken: { token: string; expiresAtMs: number; projectId: string } | null = null;

  const ensureAutoWebPushVapidKeys = (): {
    publicKey: string;
    privateKey: string;
    subject: string;
  } => {
    const state = readSharedState();
    if (
      state.webPushVapidKeys?.publicKey &&
      state.webPushVapidKeys?.privateKey
    ) {
      const subject =
        state.webPushVapidKeys.subject || 'mailto:emebjfreitas@jundiai.sp.gov.br';
      try {
        webpush.setVapidDetails(
          subject,
          state.webPushVapidKeys.publicKey,
          state.webPushVapidKeys.privateKey
        );
      } catch {
        // ignore duplicate initialization error
      }
      return {
        publicKey: state.webPushVapidKeys.publicKey,
        privateKey: state.webPushVapidKeys.privateKey,
        subject,
      };
    }

    const generated = webpush.generateVAPIDKeys();
    const subject = 'mailto:emebjfreitas@jundiai.sp.gov.br';
    writeSharedState({
      webPushVapidKeys: {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        subject,
        createdAtISO: new Date().toISOString(),
      },
    });
    webpush.setVapidDetails(subject, generated.publicKey, generated.privateKey);
    return {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
    };
  };

  // Inicializa chaves VAPID automaticamente no boot do servidor
  try {
    ensureAutoWebPushVapidKeys();
  } catch (err) {
    console.warn('Aviso ao inicializar VAPID Web Push automático:', err);
  }

  const parseFirebaseServiceAccount = (): {
    project_id: string;
    client_email: string;
    private_key: string;
  } | null => {
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if ((!raw || !raw.trim()) && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
          raw = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
        }
      } catch {
        // ignore credential file read error
      }
    }
    if (!raw || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        return {
          project_id: String(parsed.project_id),
          client_email: String(parsed.client_email),
          private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
        };
      }
    } catch {
      console.warn('FIREBASE_SERVICE_ACCOUNT_JSON inválido no ambiente.');
    }
    return null;
  };

  const getFcmOAuthAccessToken = async (): Promise<{
    accessToken: string;
    projectId: string;
  } | null> => {
    if (
      cachedFcmAccessToken &&
      cachedFcmAccessToken.expiresAtMs > Date.now() + 60_000
    ) {
      return {
        accessToken: cachedFcmAccessToken.token,
        projectId: cachedFcmAccessToken.projectId,
      };
    }

    const sa = parseFirebaseServiceAccount();
    if (!sa) return null;

    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const headerB64 = Buffer.from(
        JSON.stringify({ alg: 'RS256', typ: 'JWT' })
      ).toString('base64url');
      const claimSetB64 = Buffer.from(
        JSON.stringify({
          iss: sa.client_email,
          scope: 'https://www.googleapis.com/auth/firebase.messaging',
          aud: 'https://oauth2.googleapis.com/token',
          iat: nowSec,
          exp: nowSec + 3600,
        })
      ).toString('base64url');

      const signingInput = `${headerB64}.${claimSetB64}`;
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signingInput);
      const signatureB64 = signer.sign(sa.private_key, 'base64url');
      const jwtAssertion = `${signingInput}.${signatureB64}`;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwtAssertion,
        }),
      });

      if (!tokenRes.ok) {
        console.warn('Falha ao obter token OAuth2 para FCM HTTP v1:', tokenRes.status);
        return null;
      }

      const tokenData = await tokenRes.json();
      if (tokenData?.access_token) {
        cachedFcmAccessToken = {
          token: tokenData.access_token,
          expiresAtMs: Date.now() + Number(tokenData.expires_in || 3500) * 1000,
          projectId: sa.project_id,
        };
        return {
          accessToken: tokenData.access_token,
          projectId: sa.project_id,
        };
      }
    } catch (err) {
      console.warn('Erro ao autenticar Service Account FCM:', err);
    }
    return null;
  };

  const dispatchFcmHttpV1ToTargets = async (alert: any): Promise<{
    deliveredFcmCount: number;
    fcmHttpV1Count: number;
    webPushCount: number;
    failedFcmCount: number;
    invalidTokenIds: string[];
  }> => {
    const state = readSharedState();
    const allTokens = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
    const activeEntries = allTokens.filter((t: any) => t && t.active);

    const targetClassSet = new Set<string>(
      Array.isArray(alert.targetClassIds) ? alert.targetClassIds : []
    );
    const sendToAllClasses =
      targetClassSet.size === 0 || targetClassSet.has('all');

    const matchingEntries = activeEntries.filter((entry: any) => {
      if (alert.targetAudience === 'peb1' && entry.userRole !== 'usuario') {
        return false;
      }
      if (!sendToAllClasses && entry.userRole !== 'admin') {
        const userCls = Array.isArray(entry.assignedClassIds)
          ? entry.assignedClassIds
          : [];
        return userCls.some((cid: string) => targetClassSet.has(cid));
      }
      return true;
    });

    if (matchingEntries.length === 0) {
      return {
        deliveredFcmCount: 0,
        fcmHttpV1Count: 0,
        webPushCount: 0,
        failedFcmCount: 0,
        invalidTokenIds: [],
      };
    }

    const vapid = ensureAutoWebPushVapidKeys();
    const oauth = await getFcmOAuthAccessToken();

    let deliveredFcmCount = 0;
    let fcmHttpV1Count = 0;
    let webPushCount = 0;
    let failedFcmCount = 0;
    const invalidTokenIds: string[] = [];

    const singleClassId =
      Array.isArray(alert.targetClassIds) && alert.targetClassIds.length === 1
        ? String(alert.targetClassIds[0])
        : 'all';
    const targetScreen = String(alert.targetScreen || 'frequencia_mensal');
    const deepLinkUrl = `/?screen=${encodeURIComponent(targetScreen)}${
      singleClassId !== 'all' ? `&classId=${encodeURIComponent(singleClassId)}` : ''
    }`;

    const webPushPayloadStr = JSON.stringify({
      notification: {
        title: alert.title,
        body: alert.body,
        icon: '/pwa-192x192.png',
        badge: '/favicon-32x32.png',
      },
      data: {
        alertId: String(alert.id || ''),
        category: String(alert.category || 'prazo'),
        urgency: String(alert.urgency || 'warning'),
        targetScreen,
        targetClassId: singleClassId,
        closingDateFormatted: String(alert.closingDateFormatted || ''),
        authorName: String(alert.createdByName || 'EMEB Candelário'),
        url: deepLinkUrl,
      },
    });

    for (const entry of matchingEntries) {
      let sentForEntry = false;

      // 1. PRIORIDADE: Envio oficial via Firebase Cloud Messaging (FCM HTTP v1) com Service Account
      if (
        oauth &&
        typeof entry.fcmToken === 'string' &&
        entry.fcmToken.length > 20
      ) {
        try {
          const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
              oauth.projectId
            )}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${oauth.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: entry.fcmToken,
                  notification: {
                    title: alert.title,
                    body: alert.body,
                  },
                  data: {
                    alertId: String(alert.id || ''),
                    category: String(alert.category || 'prazo'),
                    urgency: String(alert.urgency || 'warning'),
                    targetScreen,
                    targetClassId: singleClassId,
                    closingDateFormatted: String(alert.closingDateFormatted || ''),
                    authorName: String(alert.createdByName || 'EMEB Candelário'),
                    url: deepLinkUrl,
                  },
                  webpush: {
                    headers: {
                      Urgency: alert.urgency === 'urgent' ? 'high' : 'normal',
                      TTL: '43200',
                    },
                    notification: {
                      title: alert.title,
                      body: alert.body,
                      icon: '/pwa-192x192.png',
                      badge: '/favicon-32x32.png',
                      tag: String(alert.id || 'candelario_fcm_window'),
                      requireInteraction:
                        alert.urgency === 'urgent' || alert.category === 'prazo',
                    },
                    fcm_options: {
                      link: deepLinkUrl,
                    },
                  },
                },
              }),
            }
          );

          if (res.ok) {
            deliveredFcmCount++;
            fcmHttpV1Count++;
            sentForEntry = true;
          } else {
            const errBody = await res.json().catch(() => ({}));
            const statusStr = JSON.stringify(errBody);
            if (
              res.status === 404 ||
              statusStr.includes('UNREGISTERED') ||
              statusStr.includes('registration-token-not-registered')
            ) {
              invalidTokenIds.push(entry.id);
              failedFcmCount++;
            } else {
              console.warn('FCM HTTP v1 send error:', res.status, statusStr);
              failedFcmCount++;
            }
          }
        } catch (err) {
          console.warn('FCM HTTP v1 request error:', err);
          failedFcmCount++;
        }
      }

      // 2. FALLBACK Web Push RFC 8291 somente se FCM HTTP v1 não entregou e a assinatura usar VAPID automático
      if (
        !sentForEntry &&
        entry.vapidSource !== 'firebase_fcm' &&
        entry.pushSubscription &&
        typeof entry.pushSubscription.endpoint === 'string' &&
        entry.pushSubscription.keys?.p256dh &&
        entry.pushSubscription.keys?.auth
      ) {
        try {
          await webpush.sendNotification(
            entry.pushSubscription,
            webPushPayloadStr,
            {
              vapidDetails: {
                subject: vapid.subject,
                publicKey: vapid.publicKey,
                privateKey: vapid.privateKey,
              },
              TTL: 60 * 60 * 12,
              urgency: alert.urgency === 'urgent' ? 'high' : 'normal',
            }
          );
          deliveredFcmCount++;
          webPushCount++;
          sentForEntry = true;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            invalidTokenIds.push(entry.id);
          } else {
            failedFcmCount++;
          }
        }
      }
    }

    if (invalidTokenIds.length > 0) {
      const cleaned = allTokens.map((t: any) =>
        invalidTokenIds.includes(t.id)
          ? { ...t, active: false, fcmToken: undefined, pushSubscription: undefined }
          : t
      );
      writeSharedState({ fcmTokens: cleaned });
    }

    return {
      deliveredFcmCount,
      fcmHttpV1Count,
      webPushCount,
      failedFcmCount,
      invalidTokenIds,
    };
  };

  // API: Obter chave pública VAPID configurada (VITE_FIREBASE_VAPID_KEY + fallback automático)
  app.get('/api/fcm/vapid-public-key', requireInstitutionalAuth, (_req, res) => {
    const state = readSharedState();
    const autoKeys = ensureAutoWebPushVapidKeys();
    const envVapid = (process.env.VITE_FIREBASE_VAPID_KEY || '').trim();
    const customVapid = state.fcmConfig?.vapidPublicKey?.trim();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      publicKey: autoKeys.publicKey,
      firebaseVapidKey: envVapid || customVapid || '',
      autoConfigured: true,
    });
  });

  // API: Registrar Token FCM / Web Push Subscription do dispositivo do professor
  app.post('/api/fcm/register-token', requireInstitutionalAuth, (req, res) => {
    const validation = validateFcmRegisterTokenPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const sub = validation.data;

    const reqUser = extractRequestUser(req);
    const incomingEmail = String(sub.userEmail).trim().toLowerCase();
    if (!reqUser.isAdmin && incomingEmail !== reqUser.email) {
      res.status(403).json({ error: 'Você só pode registrar o dispositivo da sua própria conta.' });
      return;
    }

    const cleanPushSub =
      sub.pushSubscription &&
      typeof sub.pushSubscription.endpoint === 'string' &&
      sub.pushSubscription.keys?.p256dh &&
      sub.pushSubscription.keys?.auth
        ? {
            endpoint: String(sub.pushSubscription.endpoint).slice(0, 1024),
            expirationTime: sub.pushSubscription.expirationTime ?? null,
            keys: {
              p256dh: String(sub.pushSubscription.keys.p256dh).slice(0, 256),
              auth: String(sub.pushSubscription.keys.auth).slice(0, 128),
            },
          }
        : undefined;

    const state = readSharedState();
    const existing = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
    const hasPushChannel = Boolean(sub.fcmToken || cleanPushSub);
    const cleanSub = {
      id: String(sub.id).slice(0, 128),
      userEmail: incomingEmail,
      userName: String(sub.userName || incomingEmail.split('@')[0]).slice(0, 160),
      userRole: String(sub.userRole || reqUser.role || 'usuario').slice(0, 30),
      teacherRoleType: sub.teacherRoleType || undefined,
      assignedClassIds: Array.isArray(sub.assignedClassIds) ? sub.assignedClassIds.slice(0, 50) : [],
      fcmToken: typeof sub.fcmToken === 'string' ? sub.fcmToken.slice(0, 512) : undefined,
      vapidSource:
        sub.vapidSource === 'firebase_fcm' ? 'firebase_fcm' : 'auto_webpush',
      ...(cleanPushSub ? { pushSubscription: cleanPushSub } : {}),
      channel: hasPushChannel ? 'fcm_push' : 'sw_realtime',
      permission: sub.permission || 'granted',
      deviceLabel: String(sub.deviceLabel || 'Navegador Web').slice(0, 80),
      active: sub.active !== false,
      createdAtISO: sub.createdAtISO || new Date().toISOString(),
      updatedAtMs: Date.now(),
    };

    const nextTokens = [
      cleanSub,
      ...existing.filter((t: any) => t && t.id !== cleanSub.id),
    ].slice(0, 200);

    writeSharedState({ fcmTokens: nextTokens });
    res.json({
      ok: true,
      id: cleanSub.id,
      channel: cleanSub.channel,
      hasNativeFcmToken: Boolean(cleanSub.fcmToken),
    });
  });

  // API: Desativar Token FCM / Web Push do dispositivo
  app.post('/api/fcm/unregister-token', requireInstitutionalAuth, (req, res) => {
    const validation = validateFcmUnregisterTokenPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { id, userEmail } = validation.data;
    const reqUser = extractRequestUser(req);
    const targetEmail = String(userEmail || reqUser.email).trim().toLowerCase();
    if (!reqUser.isAdmin && targetEmail !== reqUser.email) {
      res.status(403).json({ error: 'Operação não autorizada para outro usuário.' });
      return;
    }

    const state = readSharedState();
    const existing = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
    const nextTokens = existing.map((t: any) =>
      t && (t.id === id || t.userEmail === targetEmail)
        ? {
            ...t,
            active: false,
            fcmToken: undefined,
            pushSubscription: undefined,
            updatedAtMs: Date.now(),
          }
        : t
    );
    writeSharedState({ fcmTokens: nextTokens });
    res.json({ ok: true });
  });

  // API: Obter Status e Cobertura FCM / Web Push
  app.get('/api/fcm/status', requireInstitutionalAuth, (req, res) => {
    const reqUser = extractRequestUser(req);
    const autoKeys = ensureAutoWebPushVapidKeys();
    const state = readSharedState();
    const tokens = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
    const activeTokens = tokens.filter((t: any) => t && t.active);
    const sa = parseFirebaseServiceAccount();
    const envVapid = (process.env.VITE_FIREBASE_VAPID_KEY || '').trim();
    const configuredVapid = (state.fcmConfig?.vapidPublicKey || '').trim();
    const effectiveVapid = envVapid || configuredVapid;

    const fcmConfig = {
      vapidPublicKey: effectiveVapid,
      autoWindowAlertsEnabled: state.fcmConfig?.autoWindowAlertsEnabled ?? true,
      notifyDaysBeforeClose: state.fcmConfig?.notifyDaysBeforeClose ?? 2,
      remindPendingTeachersOnly: state.fcmConfig?.remindPendingTeachersOnly ?? true,
      updatedAtMs: state.fcmConfig?.updatedAtMs,
    };

    const visibleSummaries = (reqUser.isAdmin
      ? activeTokens
      : activeTokens.filter((t: any) => t.userEmail === reqUser.email)
    ).map((t: any) => ({
      id: t.id,
      userEmail: t.userEmail,
      userName: t.userName,
      userRole: t.userRole,
      assignedClassIds: Array.isArray(t.assignedClassIds) ? t.assignedClassIds : [],
      channel: t.channel,
      deviceLabel: t.deviceLabel,
      active: Boolean(t.active),
      updatedAtMs: t.updatedAtMs,
      hasFcmToken: Boolean(t.fcmToken || t.pushSubscription?.endpoint),
      hasNativeFcmToken: Boolean(t.fcmToken),
    }));

    const pushCapableCount = activeTokens.filter(
      (t: any) => Boolean(t.fcmToken || t.pushSubscription?.endpoint)
    ).length;
    const realFcmTokensCount = activeTokens.filter((t: any) => Boolean(t.fcmToken)).length;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      autoConfigured: true,
      hasServiceAccountConfigured: Boolean(sa) || Boolean(autoKeys.publicKey),
      hasFirebaseAdminAccount: Boolean(sa),
      hasViteVapidKey: Boolean(envVapid),
      fcmHttpV1Ready: Boolean(sa && effectiveVapid),
      firebaseProjectId: 'ListaPilotoCandelario2027',
      gcpProjectId: sa?.project_id || null,
      hasVapidKey: Boolean(effectiveVapid || autoKeys.publicKey),
      autoVapidPublicKey: autoKeys.publicKey,
      totalRegisteredDevices: activeTokens.length,
      activeFcmTokensCount: pushCapableCount,
      realFcmTokensCount,
      teachersCoveredEmails: reqUser.isAdmin
        ? Array.from(new Set(activeTokens.map((t: any) => t.userEmail)))
        : [reqUser.email],
      recentDispatches: (state.fcmAlerts || []).slice(0, 20),
      fcmConfig,
      tokensSummary: visibleSummaries,
    });
  });

  // API: Configurar parâmetros do sistema FCM (Admin Only)
  app.post('/api/fcm/config', requireAdminAuth, (req, res) => {
    const validation = validateFcmConfigPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { fcmConfig } = validation.data;
    const reqUser = extractRequestUser(req);
    const cleanConfig = {
      vapidPublicKey: String(fcmConfig.vapidPublicKey || '').trim().slice(0, 256),
      autoWindowAlertsEnabled: Boolean(fcmConfig.autoWindowAlertsEnabled),
      notifyDaysBeforeClose: Math.max(1, Math.min(5, Number(fcmConfig.notifyDaysBeforeClose || 2))),
      remindPendingTeachersOnly: fcmConfig.remindPendingTeachersOnly !== false,
      updatedAtMs: Date.now(),
      updatedByEmail: reqUser.email,
    };

    writeSharedState({ fcmConfig: cleanConfig });
    recordSecurityAuditLog(
      'FCM_CONFIG_UPDATED',
      `Configuração FCM atualizada: alertas automáticos=${cleanConfig.autoWindowAlertsEnabled ? 'ATIVOS' : 'INATIVOS'}, antecedência=${cleanConfig.notifyDaysBeforeClose}d.`,
      req
    );
    void checkServerSideWindowClosingAlert();
    res.json({ ok: true, fcmConfig: cleanConfig });
  });

  // API: Disparar Alerta Push sobre Fechamento da Janela de Lançamento (Admin Only)
  app.post('/api/fcm/send-window-alert', requireAdminAuth, async (req, res) => {
    const validation = validateFcmSendWindowAlertPayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { alert } = validation.data;

    const reqUser = extractRequestUser(req);
    const nowMs = Date.now();
    const enrichedAlert = {
      id: String(alert.id || `fcm_win_${nowMs}`).slice(0, 128),
      title: String(alert.title).slice(0, 180),
      body: String(alert.body).slice(0, 600),
      category: alert.category || 'prazo',
      urgency: alert.urgency || 'warning',
      targetScreen: alert.targetScreen || 'frequencia_mensal',
      targetClassIds: Array.isArray(alert.targetClassIds) ? alert.targetClassIds : ['all'],
      targetAudience: alert.targetAudience || 'pending_only',
      closingDateFormatted: String(alert.closingDateFormatted || ''),
      windowPhase: String(alert.windowPhase || 'closing_soon'),
      createdAtMs: alert.createdAtMs || nowMs,
      createdAtISO: alert.createdAtISO || new Date(nowMs).toISOString(),
      createdByEmail: reqUser.email || alert.createdByEmail || 'emebjfreitas@jundiai.sp.gov.br',
      createdByName: reqUser.name || alert.createdByName || 'Gestão Escolar',
      pendingClassesCount: Number(alert.pendingClassesCount || 0),
    };

    const dispatchResult = await dispatchFcmHttpV1ToTargets(enrichedAlert);
    const savedAlert = {
      ...enrichedAlert,
      deliveredFcmCount: dispatchResult.deliveredFcmCount,
    };

    const state = readSharedState();
    const nextAlerts = [savedAlert, ...(state.fcmAlerts || [])].slice(0, 40);
    writeSharedState({ fcmAlerts: nextAlerts });

    recordSecurityAuditLog(
      'FCM_WINDOW_ALERT_DISPATCHED',
      `Alerta FCM disparado: "${savedAlert.title}" (${dispatchResult.fcmHttpV1Count} FCM HTTP v1 + ${dispatchResult.webPushCount} Web Push).`,
      req
    );

    const message =
      dispatchResult.deliveredFcmCount > 0
        ? `Alerta entregue via FCM Push (${dispatchResult.fcmHttpV1Count} HTTP v1${
            dispatchResult.webPushCount > 0 ? ` + ${dispatchResult.webPushCount} Web Push` : ''
          }) e publicado em tempo real.`
        : 'Alerta publicado em tempo real para todos os professores conectados. Novos dispositivos receberão em segundo plano ao ativar as notificações.';

    res.json({
      ok: true,
      alert: savedAlert,
      deliveredFcmCount: dispatchResult.deliveredFcmCount,
      fcmHttpV1Count: dispatchResult.fcmHttpV1Count,
      webPushCount: dispatchResult.webPushCount,
      failedFcmCount: dispatchResult.failedFcmCount,
      message,
    });
  });

  // API: Listar alertas Push recentes para entrega em tempo real aos professores
  app.get('/api/fcm/alerts', requireInstitutionalAuth, (req, res) => {
    const state = readSharedState();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      alerts: (state.fcmAlerts || []).slice(0, 20),
    });
  });

  // Monitor Automático Server-Side de Fechamento da Janela de Lançamento (boot + cada 15 min)
  const checkServerSideWindowClosingAlert = async () => {
    try {
      const state = readSharedState();
      const autoEnabled = state.fcmConfig?.autoWindowAlertsEnabled ?? true;
      if (!autoEnabled) return;

      const notifyDays = Math.max(
        1,
        Math.min(5, Number(state.fcmConfig?.notifyDaysBeforeClose ?? 2))
      );
      const remindPendingOnly = state.fcmConfig?.remindPendingTeachersOnly !== false;

      const winCfg = state.attendanceWindowConfig || { exceptionalOverrideOpen: false };
      const refDate = winCfg.simulatedDateISO
        ? new Date(`${winCfg.simulatedDateISO}T12:00:00`)
        : new Date();
      const y = refDate.getFullYear();
      const m = refDate.getMonth();
      const d = refDate.getDate();
      const daysInM = new Date(y, m + 1, 0).getDate();
      const weekdays: number[] = [];
      for (let i = 1; i <= daysInM; i++) {
        const dow = new Date(y, m, i).getDay();
        if (dow >= 1 && dow <= 5) weekdays.push(i);
      }
      const firstTwo = weekdays.slice(0, 2);
      const lastDay = weekdays[weekdays.length - 1] || daysInM;
      const isSecondClosingDay = d === firstTwo[1];
      const isFirstClosingDay = d === firstTwo[0];
      const isLastMonthSchoolDay = d === lastDay;
      const isClosingSoon = d >= lastDay - notifyDays && d < lastDay;
      const isOverrideOpen = Boolean(winCfg.exceptionalOverrideOpen);

      if (
        !isSecondClosingDay &&
        !isFirstClosingDay &&
        !isLastMonthSchoolDay &&
        !isClosingSoon &&
        !isOverrideOpen
      ) {
        return;
      }

      const allClasses = Array.isArray(state.classes) ? state.classes : [];
      const pendingClasses = allClasses.filter((c: any) => c && c.isPending);
      if (remindPendingOnly && allClasses.length > 0 && pendingClasses.length === 0) {
        return;
      }

      const todayISO = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const phaseTag = isOverrideOpen
        ? 'override_open'
        : isSecondClosingDay
        ? 'final_day'
        : isFirstClosingDay
        ? 'first_closing_day'
        : isLastMonthSchoolDay
        ? 'last_month_day'
        : 'closing_soon';
      const windowKey = `${todayISO}|${phaseTag}`;
      if (state.lastAutoFcmWindowKey === windowKey) return;

      const nextMonthIdx = (m + 1) % 12;
      const nextMonthYear = m === 11 ? y + 1 : y;
      const nextWeekdays: number[] = [];
      const daysInNext = new Date(nextMonthYear, nextMonthIdx + 1, 0).getDate();
      for (let i = 1; i <= daysInNext; i++) {
        const dow = new Date(nextMonthYear, nextMonthIdx, i).getDay();
        if (dow >= 1 && dow <= 5) nextWeekdays.push(i);
      }
      const deadlineDate =
        isFirstClosingDay || isSecondClosingDay
          ? new Date(y, m, firstTwo[1] || 2)
          : new Date(nextMonthYear, nextMonthIdx, nextWeekdays[1] || 2);
      const deadlineStr = deadlineDate.toLocaleDateString('pt-BR');
      const openStr = new Date(y, m, lastDay).toLocaleDateString('pt-BR');
      const daysToOpen = Math.max(1, lastDay - d);

      const title = isOverrideOpen
        ? `Liberação Excepcional Ativa • ${MONTH_NAMES_PT[m]}`
        : isSecondClosingDay
        ? `ÚLTIMO DIA: Fechamento de Frequência Hoje (${deadlineStr})`
        : isFirstClosingDay
        ? `Janela de Frequência Fecha Amanhã (${deadlineStr})`
        : isLastMonthSchoolDay
        ? `Janela de Lançamento Aberta Hoje (${MONTH_NAMES_PT[m]})`
        : `Fechamento de Frequência em ${daysToOpen} dia(s) (${MONTH_NAMES_PT[m]})`;

      const pendingSummaryText =
        pendingClasses.length > 0
          ? `${pendingClasses.length} turma(s) com lançamento pendente.`
          : 'Confira os lançamentos de sua turma.';

      const body = isOverrideOpen
        ? `A gestão liberou o lançamento de presença em caráter excepcional. ${pendingSummaryText} Toque para acessar a Frequência Mensal.`
        : isClosingSoon
        ? `A janela oficial abre em ${openStr} e encerra em ${deadlineStr}. ${pendingSummaryText} Prepare faltas e atestados.`
        : `${pendingSummaryText} Conclua a conferência de faltas e atestados até ${deadlineStr} para evitar pendências no fechamento mensal.`;

      const targetIds =
        remindPendingOnly && pendingClasses.length > 0
          ? pendingClasses.map((c: any) => c.id)
          : ['all'];

      const autoAlert = {
        id: `fcm_auto_${todayISO.replace(/-/g, '')}_${phaseTag}`,
        title,
        body,
        category: 'prazo',
        urgency: isSecondClosingDay ? 'urgent' : 'warning',
        targetScreen: 'frequencia_mensal',
        targetClassIds: targetIds,
        targetAudience: remindPendingOnly ? 'pending_only' : 'all',
        closingDateFormatted: deadlineStr,
        windowPhase: phaseTag,
        createdAtMs: Date.now(),
        createdAtISO: new Date().toISOString(),
        createdByEmail: 'emebjfreitas@jundiai.sp.gov.br',
        createdByName: 'Monitor Automático FCM',
        pendingClassesCount: pendingClasses.length,
      };

      const dispatchRes = await dispatchFcmHttpV1ToTargets(autoAlert);
      const savedAlert = { ...autoAlert, deliveredFcmCount: dispatchRes.deliveredFcmCount };
      writeSharedState({
        lastAutoFcmWindowKey: windowKey,
        fcmAlerts: [savedAlert, ...(state.fcmAlerts || [])].slice(0, 40),
      });
    } catch {
      // ignore scheduler error
    }
  };

  setTimeout(() => {
    void checkServerSideWindowClosingAlert();
  }, 8000);

  setInterval(() => {
    void checkServerSideWindowClosingAlert();
  }, 15 * 60 * 1000);

  app.get('/health', (_req, res) => {
    res.status(200).send('OK');
  });

  app.use((req, res, next) => {
    if (/^\/(\.env|service-account|firebase-adminsdk|credentials)/i.test(req.path)) {
      res.status(403).end();
      return;
    }
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      if (req.path.endsWith('/@vite/client')) {
        try {
          const transformed = await vite.transformRequest('/@vite/client');
          if (transformed?.code) {
            const safeCode = transformed.code
              .replace(
                'transport.connect(createHMRHandler(handleMessage));',
                '// HMR WebSocket disabled'
              )
              .replace(
                /new WebSocket\([^)]*\)/g,
                '({ addEventListener(){}, removeEventListener(){}, close(){}, send(){}, readyState: 3, OPEN: 1, CLOSED: 3 })'
              );
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-store');
            res.send(safeCode);
            return;
          }
        } catch {
          // Fallback to standard Vite middleware
        }
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor EMEB Candelário de Freitas rodando em http://localhost:${PORT}`);
  });
}

startServer();
