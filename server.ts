import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
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

interface SharedSchoolState {
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
      if (!st || !st.name) return;
      const normName = String(st.name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
      const raKey = String(st.ra || '').trim();
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

// Institutional Security & RBAC Verification Helpers
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
}

const extractRequestUser = (req: express.Request): RequestUser => {
  const email = String(
    req.headers['x-user-email'] ||
    req.body?.userEmail ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();
  const role = String(
    req.headers['x-user-role'] ||
    req.body?.userRole ||
    ''
  ).trim().toLowerCase();
  const rawName = String(req.headers['x-user-name'] || req.body?.userName || '');
  let name = '';
  try {
    name = decodeURIComponent(rawName);
  } catch {
    name = rawName;
  }
  const isAdmin =
    role === 'admin' ||
    email === 'emebjfreitas@jundiai.sp.gov.br' ||
    email.startsWith('emebjfreitas@');
  const isInst = isInstitutionalEmail(email);

  return {
    email,
    role: isAdmin ? 'admin' : (role || 'usuario'),
    name: name || (isAdmin ? 'Direção / Administração Escolar' : email.split('@')[0] || 'Usuário'),
    isAdmin,
    isInstitutional: isInst,
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
    userName: user.name || (user.email === 'emebjfreitas@jundiai.sp.gov.br' ? 'Direção / Secretaria' : 'Usuário'),
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

// Middleware: Exige autenticação institucional válida para mutação de dados
const requireInstitutionalAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const user = extractRequestUser(req);
  if (!user.isInstitutional && user.email !== 'emebjfreitas@jundiai.sp.gov.br') {
    recordSecurityAuditLog(
      'UNAUTHORIZED_MUTATION_ATTEMPT',
      `Tentativa de gravação bloqueada em ${req.path} por e-mail não institucional: "${user.email || 'vazio'}"`,
      req,
      'BLOCKED',
      user
    );
    res.status(403).json({
      error: 'Acesso negado. Apenas e-mails institucionais autorizados (@educacao.jundiai.sp.gov.br ou emebjfreitas@jundiai.sp.gov.br) têm permissão de gravação.',
      code: 'UNAUTHORIZED_INSTITUTIONAL_EMAIL',
    });
    return;
  }
  next();
};

// Middleware: Exige privilégios de administrador
const requireAdminAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const user = extractRequestUser(req);
  if (!user.isAdmin) {
    recordSecurityAuditLog(
      'PRIVILEGE_ESCALATION_BLOCKED',
      `Tentativa de operação administrativa bloqueada em ${req.path} para o usuário: "${user.email}"`,
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob: data:; frame-src 'self' https: data:; img-src 'self' https: data: blob:;"
    );
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  // API: Obter estado compartilhado (Usuários Autorizados, Turmas, Estudantes, Fotos, PDFs Escaneados, Links Drive/Sheets e Logs)
  app.get('/api/school-state', (_req, res) => {
    const state = readSharedState();
    const { adminDriveToken: _hiddenToken, ...publicState } = state;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(publicState);
  });

  // API: Registrar token de leitura da pasta oficial do Drive para permitir proxy de fotos para todos os usuários da ponta (PEB I e PEB II)
  app.post('/api/school-state/drive-token', (req, res) => {
    const { accessToken } = req.body || {};
    if (typeof accessToken === 'string' && accessToken.trim().length > 10) {
      writeSharedState({
        adminDriveToken: accessToken.trim(),
        adminDriveTokenUpdatedAtMs: Date.now(),
      });
    }
    res.json({ ok: true });
  });

  // Cache em memória das imagens do Drive para carregamento instantâneo nos dispositivos dos professores
  const drivePhotoBufferCache = new Map<
    string,
    { buffer: Buffer; contentType: string; cachedAt: number }
  >();

  // API: Proxy universal de fotos do Google Drive (/api/drive-photo/:fileId) para que todos os usuários da ponta visualizem as fotos soltas da pasta sem bloqueio de permissão
  app.get('/api/drive-photo/:fileId', async (req, res) => {
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

  // API: Sincronizar Turmas, Faltas, Atestados, Fotos, NIS, Ônibus Fretado e Links de PDFs Escaneados em tempo real com controle de concorrência por turma/estudante
  app.post('/api/school-state/classes', requireInstitutionalAuth, (req, res) => {
    const {
      classes,
      classesUpdatedAtMs,
      discoveredNominalPdfs,
      discoveredDrivePhotos,
      cloudLinks,
      opId,
    } = req.body || {};
    if (!Array.isArray(classes) || classes.length === 0 || classes.length > 80) {
      res.status(400).json({ error: 'Lista de turmas inválida' });
      return;
    }
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
  app.post('/api/school-state/links', requireAdminAuth, (req, res) => {
    const { cloudLinks, discoveredNominalPdfs, discoveredDrivePhotos } = req.body || {};
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
    const { authorizedUsers } = req.body || {};
    if (!Array.isArray(authorizedUsers)) {
      res.status(400).json({ error: 'Lista de authorizedUsers inválida' });
      return;
    }
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

  // API: Atualizar Logs de Sessão e Tempo Conectado
  app.post('/api/school-state/logs', (req, res) => {
    const { accessSessionLogs, authorizedUsers } = req.body || {};
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
    }

    const saved = writeSharedState({
      accessSessionLogs: mergedLogs,
      ...(nextUsers ? { authorizedUsers: nextUsers } : {}),
    });
    res.json(saved);
  });

  // API: Atualizar Configuração de Janela de Lançamento Excepcional (Admin Only)
  app.post('/api/school-state/window', requireAdminAuth, (req, res) => {
    const { attendanceWindowConfig } = req.body || {};
    if (!attendanceWindowConfig) {
      res.status(400).json({ error: 'Configuração inválida' });
      return;
    }
    const saved = writeSharedState({ attendanceWindowConfig });
    recordSecurityAuditLog(
      'ATTENDANCE_WINDOW_MODIFIED',
      `Janela de frequência alterada: ${attendanceWindowConfig.isOpen ? 'ABERTA' : 'FECHADA'} até ${attendanceWindowConfig.closeDateISO || 'N/A'}.`,
      req
    );
    res.json(saved);
  });

  // API: Publicar / Atualizar Comunicados do Quadro de Avisos Institucional
  app.post('/api/school-state/notices', requireInstitutionalAuth, (req, res) => {
    const { schoolNotices } = req.body || {};
    if (!Array.isArray(schoolNotices)) {
      res.status(400).json({ error: 'Lista de avisos inválida' });
      return;
    }
    const saved = writeSharedState({ schoolNotices: schoolNotices.slice(0, 60) });
    recordSecurityAuditLog(
      'SCHOOL_NOTICES_UPDATED',
      `Quadro de avisos atualizado (${schoolNotices.length} avisos).`,
      req
    );
    res.json(saved);
  });

  // In-memory cache for free OpenStreetMap/OSRM routes (1 hour cache)
  const routeCache = new Map<string, { data: any; expires: number }>();

  // API: Cálculo de Rotas Gratuitas e Trajetos via OpenStreetMap / OSRM (100% Free & Sem API Key)
  app.get('/api/route', async (req, res) => {
    try {
      const profile = req.query.profile === 'foot' ? 'foot' : 'driving';
      const coords = String(req.query.coords || '').trim();

      if (!coords || !coords.includes(';') || !coords.includes(',')) {
        res.status(400).json({ error: 'Coordenadas inválidas. Formato esperado: lng1,lat1;lng2,lat2' });
        return;
      }

      const cacheKey = `${profile}:${coords}`;
      const cached = routeCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        res.json(cached.data);
        return;
      }

      const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(osrmUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CandelarioGestao-SchoolRouting/1.0 (EMEB Prof. Joaquim Candelario de Freitas Jundiai)',
          'Accept': 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        res.status(502).json({ error: 'OSRM service error', status: response.status });
        return;
      }

      const data = await response.json();
      if (data && data.code === 'Ok') {
        // Cache for 1 hour
        routeCache.set(cacheKey, { data, expires: Date.now() + 60 * 60 * 1000 });
        // Cap cache size
        if (routeCache.size > 500) {
          const firstKey = routeCache.keys().next().value;
          if (firstKey) routeCache.delete(firstKey);
        }
      }

      res.json(data);
    } catch (err: any) {
      console.warn('Erro ao consultar roteamento OSRM gratuito:', err?.message || err);
      res.status(503).json({ error: 'Roteador OSRM temporariamente indisponível', fallback: true });
    }
  });

  const isUserAdminAuthorized = (req: express.Request): boolean => {
    const role = String(req.headers['x-user-role'] || req.body?.userRole || '').trim().toLowerCase();
    const email = String(
      req.headers['x-user-email'] ||
      req.body?.adminEmail ||
      req.body?.userEmail ||
      ''
    ).trim().toLowerCase();
    if (role === 'admin') return true;
    if (
      email.startsWith('emebjfreitas@') ||
      email.includes('admin') ||
      email.includes('direcao') ||
      email.includes('coordenacao')
    ) {
      return true;
    }
    return false;
  };

  // API: Obter Calendário Escolar Oficial (200 Dias), Feriados e Auditoria
  app.get('/api/calendar-config', (_req, res) => {
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

    const { rawDatesText, schoolDays, adminEmail, adminName, year = 2027 } = req.body || {};
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

    const { action, holiday, holidayId, adminEmail, adminName } = req.body || {};
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

  // API: Obter Histórico de Auditoria do Calendário
  app.get('/api/calendar-audit-log', (_req, res) => {
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

  // API: Registrar Evento de Segurança / Auditoria LGPD
  app.post('/api/security-logs', (req, res) => {
    const entry = req.body;
    if (!entry || !entry.eventType) {
      return res.status(400).json({ error: 'Dados do evento de segurança inválidos.' });
    }

    const state = readSharedState();
    const existingLogs = Array.isArray(state.securityAuditLogs) ? state.securityAuditLogs : [];
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1';

    const enrichedEntry = {
      ...entry,
      id: entry.id || `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestampISO: entry.timestampISO || new Date().toISOString(),
      clientIp: entry.clientIp || clientIp,
    };

    const nextLogs = [enrichedEntry, ...existingLogs].slice(0, 300);
    writeSharedState({ securityAuditLogs: nextLogs });

    res.json({ ok: true, entry: enrichedEntry });
  });


  app.get('/health', (_req, res) => {
    res.status(200).send('OK');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
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
