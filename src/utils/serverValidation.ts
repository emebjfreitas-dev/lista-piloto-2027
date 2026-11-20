export type ValidationResult<T = Record<string, any>> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_TRAVERSAL_DEPTH = 16;

export const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Detecta chaves de poluição de protótipo em qualquer profundidade do payload JSON.
 * Nota: usa Object.getOwnPropertyNames para capturar "__proto__" mesmo quando parseado via JSON.parse.
 */
export const hasForbiddenPrototypeKey = (
  value: unknown,
  depth = 0,
  visited = new Set<object>()
): boolean => {
  if (depth > MAX_TRAVERSAL_DEPTH || value === null || typeof value !== 'object') {
    return false;
  }
  if (visited.has(value)) return false;
  visited.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (hasForbiddenPrototypeKey(value[i], depth + 1, visited)) return true;
    }
    return false;
  }

  const keys = Object.getOwnPropertyNames(value);
  for (const key of keys) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) return true;
    const child = (value as Record<string, unknown>)[key];
    if (hasForbiddenPrototypeKey(child, depth + 1, visited)) return true;
  }
  return false;
};

export const ensureSafePayloadObject = (
  body: unknown
): ValidationResult<Record<string, any>> => {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Corpo da requisição JSON inválido.' };
  }
  if (hasForbiddenPrototypeKey(body)) {
    return {
      ok: false,
      error: 'Payload rejeitado por conter chaves reservadas não permitidas.',
    };
  }
  return { ok: true, data: body };
};

export const requireTrimmedString = (
  value: unknown,
  fieldLabel: string,
  maxLength = 500
): ValidationResult<string> => {
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldLabel} deve ser uma string válida.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${fieldLabel} é obrigatório e não pode ser vazio.` };
  }
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldLabel} excede o limite máximo de ${maxLength} caracteres.`,
    };
  }
  return { ok: true, data: trimmed };
};

export const optionalTrimmedString = (
  value: unknown,
  fieldLabel: string,
  maxLength = 500
): ValidationResult<string | undefined> => {
  if (value === undefined || value === null || value === '') {
    return { ok: true, data: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldLabel} deve ser texto.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldLabel} excede o limite máximo de ${maxLength} caracteres.`,
    };
  }
  return { ok: true, data: trimmed || undefined };
};

export const isValidIsoCalendarDate = (dateStr: string): boolean => {
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
};

export const isValidBrCalendarDate = (dateStr: string): boolean => {
  const match = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
};

export const isValidEmailFormat = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export const isInstitutionalEmailAddress = (email: string): boolean => {
  const clean = email.trim().toLowerCase();
  if (!isValidEmailFormat(clean)) return false;
  return (
    clean.endsWith('@educacao.jundiai.sp.gov.br') ||
    clean === 'emebjfreitas@jundiai.sp.gov.br'
  );
};

export const requireFiniteNonNegativeNumber = (
  value: unknown,
  fieldLabel: string,
  max = Number.MAX_SAFE_INTEGER
): ValidationResult<number> => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    return {
      ok: false,
      error: `${fieldLabel} deve ser um número finito entre 0 e ${max}.`,
    };
  }
  return { ok: true, data: n };
};

// =========================================================================
// Validadores Específicos por Rota POST em server.ts
// =========================================================================

export const validateAuthSessionRequest = (
  body: unknown,
  authHeader: string
): ValidationResult<{ idToken: string }> => {
  if (body !== undefined && body !== null && !isPlainObject(body)) {
    return { ok: false, error: 'Corpo da requisição de sessão inválido.' };
  }
  if (body && hasForbiddenPrototypeKey(body)) {
    return { ok: false, error: 'Payload de sessão rejeitado por chaves proibidas.' };
  }
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const bodyToken = isPlainObject(body) && typeof body.idToken === 'string'
    ? body.idToken.trim()
    : '';
  const resolved = bearerToken || bodyToken;
  if (!resolved) {
    return { ok: false, error: 'Token Firebase ID obrigatório.' };
  }
  if (resolved.length > 8192) {
    return { ok: false, error: 'Token Firebase ID excede o tamanho permitido.' };
  }
  return { ok: true, data: { idToken: resolved } };
};

export const validateDriveTokenPayload = (
  body: unknown
): ValidationResult<{ accessToken: string }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const tokenCheck = requireTrimmedString(base.data.accessToken, 'accessToken', 4096);
  if (!tokenCheck.ok) return tokenCheck;
  if (tokenCheck.data.length <= 10) {
    return { ok: false, error: 'accessToken inválido ou muito curto.' };
  }
  return { ok: true, data: { accessToken: tokenCheck.data } };
};

export const validatePhotoUploadBinaryHeaders = (
  studentIdHeader: unknown,
  sha256Header: unknown,
  bodyBuffer: unknown
): ValidationResult<{ studentId: string; sha256?: string }> => {
  const studentCheck = requireTrimmedString(studentIdHeader, 'x-student-id', 128);
  if (!studentCheck.ok) return studentCheck;
  if (!Buffer.isBuffer(bodyBuffer) || bodyBuffer.length === 0) {
    return { ok: false, error: 'Corpo binário da foto é obrigatório.' };
  }
  if (bodyBuffer.length > 10 * 1024 * 1024) {
    return { ok: false, error: 'Foto excede o limite de 10 MB.' };
  }
  let cleanSha: string | undefined;
  if (sha256Header !== undefined && sha256Header !== '') {
    const shaStr = String(sha256Header).trim();
    if (!/^[a-fA-F0-9]{64}$/.test(shaStr)) {
      return { ok: false, error: 'Cabeçalho x-file-sha256 inválido.' };
    }
    cleanSha = shaStr.toLowerCase();
  }
  return { ok: true, data: { studentId: studentCheck.data, sha256: cleanSha } };
};

export const validatePhotoUploadPayload = (
  body: unknown
): ValidationResult<{ studentId: string; photoDataUrl: string }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const sid = requireTrimmedString(base.data.studentId, 'studentId', 128);
  if (!sid.ok) return sid;
  const dataUrl = requireTrimmedString(
    base.data.photoDataUrl,
    'photoDataUrl',
    12 * 1024 * 1024
  );
  if (!dataUrl.ok) return dataUrl;
  return { ok: true, data: { studentId: sid.data, photoDataUrl: dataUrl.data } };
};

export const validatePhotoBatchPayload = (
  body: unknown
): ValidationResult<{
  photos: Array<{ studentId: string; photoDataUrl: string; sha256?: string }>;
}> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { photos } = base.data;
  if (!Array.isArray(photos) || photos.length === 0) {
    return { ok: false, error: 'Nenhuma foto fornecida no lote.' };
  }
  if (photos.length > 500) {
    return { ok: false, error: 'O lote JSON de fotos excede o máximo de 500 itens por envio.' };
  }
  const normalized: Array<{ studentId: string; photoDataUrl: string; sha256?: string }> = [];
  for (let i = 0; i < photos.length; i++) {
    const item = photos[i];
    if (!isPlainObject(item)) {
      return { ok: false, error: `Item #${i + 1} do lote de fotos inválido.` };
    }
    const sid = requireTrimmedString(item.studentId, `photos[${i}].studentId`, 128);
    if (!sid.ok) return sid;
    const url = requireTrimmedString(
      item.photoDataUrl,
      `photos[${i}].photoDataUrl`,
      10 * 1024 * 1024
    );
    if (!url.ok) return url;
    const sha = optionalTrimmedString(item.sha256, `photos[${i}].sha256`, 64);
    if (!sha.ok) return sha;
    normalized.push({
      studentId: sid.data,
      photoDataUrl: url.data,
      sha256: sha.data,
    });
  }
  return { ok: true, data: { photos: normalized } };
};

export const validatePdfUploadPayload = (
  body: unknown
): ValidationResult<{ studentId: string; pdfDataUrl: string }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const sid = requireTrimmedString(base.data.studentId, 'studentId', 128);
  if (!sid.ok) return sid;
  const dataUrl = requireTrimmedString(
    base.data.pdfDataUrl,
    'pdfDataUrl',
    20 * 1024 * 1024
  );
  if (!dataUrl.ok) return dataUrl;
  return { ok: true, data: { studentId: sid.data, pdfDataUrl: dataUrl.data } };
};

export const validatePdfBatchPayload = (
  body: unknown
): ValidationResult<{
  pdfs: Array<{ studentId: string; pdfDataUrl: string; sha256?: string }>;
}> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { pdfs } = base.data;
  if (!Array.isArray(pdfs) || pdfs.length === 0) {
    return { ok: false, error: 'Nenhum PDF fornecido no lote.' };
  }
  if (pdfs.length > 300) {
    return { ok: false, error: 'O lote JSON de PDFs excede o máximo de 300 itens por envio.' };
  }
  const normalized: Array<{ studentId: string; pdfDataUrl: string; sha256?: string }> = [];
  for (let i = 0; i < pdfs.length; i++) {
    const item = pdfs[i];
    if (!isPlainObject(item)) {
      return { ok: false, error: `Item #${i + 1} do lote de PDFs inválido.` };
    }
    const sid = requireTrimmedString(item.studentId, `pdfs[${i}].studentId`, 128);
    if (!sid.ok) return sid;
    const url = requireTrimmedString(
      item.pdfDataUrl,
      `pdfs[${i}].pdfDataUrl`,
      20 * 1024 * 1024
    );
    if (!url.ok) return url;
    const sha = optionalTrimmedString(item.sha256, `pdfs[${i}].sha256`, 64);
    if (!sha.ok) return sha;
    normalized.push({
      studentId: sid.data,
      pdfDataUrl: url.data,
      sha256: sha.data,
    });
  }
  return { ok: true, data: { pdfs: normalized } };
};

export const validateSchoolStateClassesPayload = (
  body: unknown
): ValidationResult<{
  classes: any[];
  classesUpdatedAtMs?: number;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
  cloudLinks?: Record<string, any>;
  opId?: string;
}> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const {
    classes,
    classesUpdatedAtMs,
    discoveredNominalPdfs,
    discoveredDrivePhotos,
    cloudLinks,
    opId,
  } = base.data;

  if (!Array.isArray(classes) || classes.length === 0 || classes.length > 80) {
    return { ok: false, error: 'Lista de turmas inválida (deve conter de 1 a 80 turmas).' };
  }

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    if (!isPlainObject(cls)) {
      return { ok: false, error: `Turma na posição ${i} está malformada.` };
    }
    const idCheck = requireTrimmedString(cls.id, `classes[${i}].id`, 80);
    if (!idCheck.ok) return idCheck;
    if (cls.students !== undefined) {
      if (!Array.isArray(cls.students) || cls.students.length > 120) {
        return {
          ok: false,
          error: `Lista de estudantes da turma "${idCheck.data}" inválida ou excede 120 alunos.`,
        };
      }
      for (let sIdx = 0; sIdx < cls.students.length; sIdx++) {
        const st = cls.students[sIdx];
        if (!isPlainObject(st)) {
          return {
            ok: false,
            error: `Registro de estudante inválido na turma "${idCheck.data}".`,
          };
        }
        if (st.totalAbsencesMonth !== undefined) {
          const absCheck = requireFiniteNonNegativeNumber(
            st.totalAbsencesMonth,
            `totalAbsencesMonth`,
            31
          );
          if (!absCheck.ok) return absCheck;
        }
        if (st.justifiedAbsences !== undefined) {
          const justCheck = requireFiniteNonNegativeNumber(
            st.justifiedAbsences,
            `justifiedAbsences`,
            31
          );
          if (!justCheck.ok) return justCheck;
        }
      }
    }
  }

  if (classesUpdatedAtMs !== undefined) {
    const tsCheck = requireFiniteNonNegativeNumber(classesUpdatedAtMs, 'classesUpdatedAtMs');
    if (!tsCheck.ok) return tsCheck;
  }

  if (discoveredNominalPdfs !== undefined && (!Array.isArray(discoveredNominalPdfs) || discoveredNominalPdfs.length > 5000)) {
    return { ok: false, error: 'discoveredNominalPdfs deve ser um array com até 5000 itens.' };
  }
  if (discoveredDrivePhotos !== undefined && (!Array.isArray(discoveredDrivePhotos) || discoveredDrivePhotos.length > 5000)) {
    return { ok: false, error: 'discoveredDrivePhotos deve ser um array com até 5000 itens.' };
  }
  if (cloudLinks !== undefined && !isPlainObject(cloudLinks)) {
    return { ok: false, error: 'cloudLinks deve ser um objeto válido.' };
  }

  const opIdCheck = optionalTrimmedString(opId, 'opId', 128);
  if (!opIdCheck.ok) return opIdCheck;

  return {
    ok: true,
    data: {
      classes,
      classesUpdatedAtMs,
      discoveredNominalPdfs,
      discoveredDrivePhotos,
      cloudLinks,
      opId: opIdCheck.data,
    },
  };
};

export const validateSchoolStateLinksPayload = (
  body: unknown
): ValidationResult<{
  cloudLinks?: Record<string, any>;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
}> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { cloudLinks, discoveredNominalPdfs, discoveredDrivePhotos } = base.data;
  if (cloudLinks === undefined && discoveredNominalPdfs === undefined && discoveredDrivePhotos === undefined) {
    return { ok: false, error: 'Nenhum parâmetro de vínculo informado para atualização.' };
  }
  if (cloudLinks !== undefined && !isPlainObject(cloudLinks)) {
    return { ok: false, error: 'cloudLinks inválido.' };
  }
  if (discoveredNominalPdfs !== undefined && (!Array.isArray(discoveredNominalPdfs) || discoveredNominalPdfs.length > 5000)) {
    return { ok: false, error: 'discoveredNominalPdfs inválido ou acima de 5000 itens.' };
  }
  if (discoveredDrivePhotos !== undefined && (!Array.isArray(discoveredDrivePhotos) || discoveredDrivePhotos.length > 5000)) {
    return { ok: false, error: 'discoveredDrivePhotos inválido ou acima de 5000 itens.' };
  }
  return { ok: true, data: { cloudLinks, discoveredNominalPdfs, discoveredDrivePhotos } };
};

const VALID_USER_ROLES = new Set(['admin', 'usuario', 'peb2']);

export const validateSchoolStateUsersPayload = (
  body: unknown
): ValidationResult<{ authorizedUsers: any[] }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { authorizedUsers } = base.data;
  if (!Array.isArray(authorizedUsers)) {
    return { ok: false, error: 'Lista de authorizedUsers inválida.' };
  }
  if (authorizedUsers.length > 500) {
    return { ok: false, error: 'authorizedUsers excede o limite de 500 usuários.' };
  }
  for (let i = 0; i < authorizedUsers.length; i++) {
    const u = authorizedUsers[i];
    if (!isPlainObject(u)) {
      return { ok: false, error: `Usuário na posição ${i} inválido.` };
    }
    const emailCheck = requireTrimmedString(u.email, `authorizedUsers[${i}].email`, 254);
    if (!emailCheck.ok) return emailCheck;
    if (!isInstitutionalEmailAddress(emailCheck.data)) {
      return {
        ok: false,
        error: `E-mail não institucional rejeitado em authorizedUsers[${i}]: "${emailCheck.data}".`,
      };
    }
    if (u.role !== undefined && !VALID_USER_ROLES.has(String(u.role))) {
      return { ok: false, error: `Perfil inválido em authorizedUsers[${i}].role.` };
    }
    if (u.accessExpiresAt !== undefined && u.accessExpiresAt !== null && u.accessExpiresAt !== '') {
      if (
        typeof u.accessExpiresAt !== 'string' ||
        !isValidIsoCalendarDate(u.accessExpiresAt)
      ) {
        return {
          ok: false,
          error: `Data de expiração inválida em authorizedUsers[${i}].accessExpiresAt (use YYYY-MM-DD real).`,
        };
      }
    }
  }
  return { ok: true, data: { authorizedUsers } };
};

export const validateSchoolStateResetPayload = (
  body: unknown
): ValidationResult<{ freshClasses?: any[] }> => {
  if (body === undefined || body === null) {
    return { ok: true, data: {} };
  }
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { freshClasses } = base.data;
  if (freshClasses !== undefined) {
    if (!Array.isArray(freshClasses) || freshClasses.length > 80) {
      return { ok: false, error: 'freshClasses deve ser um array com no máximo 80 turmas.' };
    }
  }
  return { ok: true, data: { freshClasses } };
};

export const validateSchoolStateImportJsonPayload = (
  body: unknown
): ValidationResult<{ payload: any; fileName?: string; fileSize?: string | number }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { payload, fileName, fileSize } = base.data;
  if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
    return { ok: false, error: 'Conteúdo JSON não fornecido ou vazio.' };
  }
  let rawClasses: any[] | null = null;
  if (Array.isArray(payload)) {
    rawClasses = payload;
  } else if (isPlainObject(payload)) {
    if (Array.isArray(payload.classes)) rawClasses = payload.classes;
    else if (Array.isArray(payload.turmas)) rawClasses = payload.turmas;
  }
  if (!rawClasses || rawClasses.length === 0 || rawClasses.length > 80) {
    return {
      ok: false,
      error:
        'Estrutura JSON inválida. O arquivo precisa conter entre 1 e 80 turmas em "classes" ou "turmas".',
    };
  }
  const fn = optionalTrimmedString(fileName, 'fileName', 255);
  if (!fn.ok) return fn;
  return {
    ok: true,
    data: {
      payload,
      fileName: fn.data,
      fileSize,
    },
  };
};

export const validateSchoolStateLogsPayload = (
  body: unknown
): ValidationResult<{ accessSessionLogs?: any[]; authorizedUsers?: any[] }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { accessSessionLogs, authorizedUsers } = base.data;
  if (accessSessionLogs !== undefined) {
    if (!Array.isArray(accessSessionLogs) || accessSessionLogs.length > 600) {
      return { ok: false, error: 'accessSessionLogs deve conter no máximo 600 registros.' };
    }
    for (let i = 0; i < accessSessionLogs.length; i++) {
      const l = accessSessionLogs[i];
      if (!isPlainObject(l) || typeof l.id !== 'string' || !l.id.trim()) {
        return { ok: false, error: `Registro de sessão #${i + 1} sem id válido.` };
      }
    }
  }
  if (authorizedUsers !== undefined) {
    if (!Array.isArray(authorizedUsers) || authorizedUsers.length > 500) {
      return { ok: false, error: 'authorizedUsers excede o limite de 500 usuários.' };
    }
  }
  return { ok: true, data: { accessSessionLogs, authorizedUsers } };
};

export const validateAttendanceWindowPayload = (
  body: unknown
): ValidationResult<{ attendanceWindowConfig: Record<string, any> }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const cfg = base.data.attendanceWindowConfig;
  if (!isPlainObject(cfg)) {
    return { ok: false, error: 'Configuração de janela de chamada inválida.' };
  }
  if (
    typeof cfg.exceptionalOverrideOpen !== 'boolean' &&
    typeof cfg.isOpen !== 'boolean'
  ) {
    return {
      ok: false,
      error: 'attendanceWindowConfig.exceptionalOverrideOpen deve ser booleano.',
    };
  }
  if (
    cfg.simulatedDateISO !== undefined &&
    cfg.simulatedDateISO !== null &&
    cfg.simulatedDateISO !== ''
  ) {
    if (
      typeof cfg.simulatedDateISO !== 'string' ||
      !isValidIsoCalendarDate(cfg.simulatedDateISO)
    ) {
      return {
        ok: false,
        error: 'simulatedDateISO inválido. Informe uma data real no formato YYYY-MM-DD.',
      };
    }
  }
  if (
    cfg.closeDateISO !== undefined &&
    cfg.closeDateISO !== null &&
    cfg.closeDateISO !== ''
  ) {
    if (
      typeof cfg.closeDateISO !== 'string' ||
      !isValidIsoCalendarDate(cfg.closeDateISO)
    ) {
      return {
        ok: false,
        error: 'closeDateISO inválido. Informe uma data real no formato YYYY-MM-DD.',
      };
    }
  }
  return { ok: true, data: { attendanceWindowConfig: cfg } };
};

export const validateSchoolNoticesPayload = (
  body: unknown
): ValidationResult<{ schoolNotices: any[] }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { schoolNotices } = base.data;
  if (!Array.isArray(schoolNotices) || schoolNotices.length > 100) {
    return { ok: false, error: 'Lista de avisos inválida ou excede 100 comunicados.' };
  }
  for (let i = 0; i < schoolNotices.length; i++) {
    const n = schoolNotices[i];
    if (!isPlainObject(n)) {
      return { ok: false, error: `Comunicado #${i + 1} malformado.` };
    }
    const idCheck = requireTrimmedString(n.id, `schoolNotices[${i}].id`, 128);
    if (!idCheck.ok) return idCheck;
    const titleCheck = requireTrimmedString(n.title, `schoolNotices[${i}].title`, 220);
    if (!titleCheck.ok) return titleCheck;
    const contentCheck = requireTrimmedString(n.content, `schoolNotices[${i}].content`, 4000);
    if (!contentCheck.ok) return contentCheck;
  }
  return { ok: true, data: { schoolNotices } };
};

export const validateCalendarConfigPayload = (
  body: unknown
): ValidationResult<{
  rawDatesText?: string;
  schoolDays?: string[];
  adminEmail?: string;
  adminName?: string;
  year: number;
}> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { rawDatesText, schoolDays, adminEmail, adminName, year = 2027 } = base.data;

  const hasRaw = typeof rawDatesText === 'string' && rawDatesText.trim().length > 0;
  const hasArray = Array.isArray(schoolDays) && schoolDays.length > 0;
  if (!hasRaw && !hasArray) {
    return {
      ok: false,
      error: 'Informe rawDatesText ou schoolDays com as 200 datas letivas.',
    };
  }
  if (hasRaw && rawDatesText.length > 64_000) {
    return { ok: false, error: 'rawDatesText excede o limite de tamanho permitido.' };
  }
  if (Array.isArray(schoolDays) && schoolDays.length > 400) {
    return { ok: false, error: 'schoolDays excede o máximo de 400 itens.' };
  }

  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear) || parsedYear < 2020 || parsedYear > 2035) {
    return { ok: false, error: 'Ano letivo inválido (permitido entre 2020 e 2035).' };
  }

  const emailCheck = optionalTrimmedString(adminEmail, 'adminEmail', 254);
  if (!emailCheck.ok) return emailCheck;
  if (emailCheck.data && !isValidEmailFormat(emailCheck.data)) {
    return { ok: false, error: 'adminEmail inválido.' };
  }
  const nameCheck = optionalTrimmedString(adminName, 'adminName', 160);
  if (!nameCheck.ok) return nameCheck;

  return {
    ok: true,
    data: {
      rawDatesText: typeof rawDatesText === 'string' ? rawDatesText : undefined,
      schoolDays: Array.isArray(schoolDays) ? schoolDays : undefined,
      adminEmail: emailCheck.data,
      adminName: nameCheck.data,
      year: parsedYear,
    },
  };
};

const VALID_HOLIDAY_TYPES = new Set([
  'nacional',
  'estadual',
  'municipal',
  'recesso',
  'ponto_facultativo',
]);

export const validateHolidayActionPayload = (
  body: unknown
): ValidationResult<{
  action: 'add' | 'edit' | 'delete' | 'restore_defaults';
  holiday?: Record<string, any>;
  holidayId?: string;
  adminEmail?: string;
  adminName?: string;
}> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const { action, holiday, holidayId, adminEmail, adminName } = base.data;
  if (
    action !== 'add' &&
    action !== 'edit' &&
    action !== 'delete' &&
    action !== 'restore_defaults'
  ) {
    return { ok: false, error: 'Ação de feriado inválida.' };
  }

  if (action === 'delete') {
    const idCheck = requireTrimmedString(holidayId, 'holidayId', 128);
    if (!idCheck.ok) return idCheck;
  } else if (action === 'add' || action === 'edit') {
    if (!isPlainObject(holiday)) {
      return { ok: false, error: 'Objeto holiday inválido.' };
    }
    if (action === 'edit') {
      const holId = requireTrimmedString(holiday.id, 'holiday.id', 128);
      if (!holId.ok) return holId;
    }
    const dateCheck = requireTrimmedString(holiday.date, 'holiday.date', 20);
    if (!dateCheck.ok) return dateCheck;
    if (!isValidBrCalendarDate(dateCheck.data)) {
      return {
        ok: false,
        error: 'Data do feriado inválida. Informe uma data real no formato DD/MM/AAAA.',
      };
    }
    const nameCheck = requireTrimmedString(holiday.name, 'holiday.name', 160);
    if (!nameCheck.ok) return nameCheck;
    if (holiday.type !== undefined && !VALID_HOLIDAY_TYPES.has(String(holiday.type))) {
      return { ok: false, error: 'Tipo de feriado inválido.' };
    }
  }

  return {
    ok: true,
    data: {
      action,
      holiday,
      holidayId: typeof holidayId === 'string' ? holidayId.trim() : undefined,
      adminEmail: typeof adminEmail === 'string' ? adminEmail.trim() : undefined,
      adminName: typeof adminName === 'string' ? adminName.trim() : undefined,
    },
  };
};

export const validateSecurityLogPayload = (
  body: unknown
): ValidationResult<Record<string, any>> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const eventTypeCheck = requireTrimmedString(base.data.eventType, 'eventType', 100);
  if (!eventTypeCheck.ok) return eventTypeCheck;
  const detailsCheck = optionalTrimmedString(base.data.details, 'details', 2000);
  if (!detailsCheck.ok) return detailsCheck;
  const titleCheck = optionalTrimmedString(base.data.actionTitle, 'actionTitle', 200);
  if (!titleCheck.ok) return titleCheck;
  return { ok: true, data: base.data };
};

export const validateFcmRegisterTokenPayload = (
  body: unknown
): ValidationResult<Record<string, any>> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const idCheck = requireTrimmedString(base.data.id, 'id', 128);
  if (!idCheck.ok) return idCheck;
  const emailCheck = requireTrimmedString(base.data.userEmail, 'userEmail', 254);
  if (!emailCheck.ok) return emailCheck;
  if (!isInstitutionalEmailAddress(emailCheck.data)) {
    return { ok: false, error: 'userEmail deve pertencer ao domínio institucional oficial.' };
  }
  if (base.data.assignedClassIds !== undefined) {
    if (!Array.isArray(base.data.assignedClassIds) || base.data.assignedClassIds.length > 60) {
      return { ok: false, error: 'assignedClassIds inválido ou excede 60 turmas.' };
    }
  }
  if (base.data.pushSubscription !== undefined) {
    const sub = base.data.pushSubscription;
    if (
      !isPlainObject(sub) ||
      typeof sub.endpoint !== 'string' ||
      !sub.endpoint.startsWith('https://') ||
      !isPlainObject(sub.keys) ||
      typeof sub.keys.p256dh !== 'string' ||
      typeof sub.keys.auth !== 'string'
    ) {
      return { ok: false, error: 'pushSubscription Web Push inválida.' };
    }
  }
  return { ok: true, data: base.data };
};

export const validateFcmUnregisterTokenPayload = (
  body: unknown
): ValidationResult<{ id?: string; userEmail?: string }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const idCheck = optionalTrimmedString(base.data.id, 'id', 128);
  if (!idCheck.ok) return idCheck;
  const emailCheck = optionalTrimmedString(base.data.userEmail, 'userEmail', 254);
  if (!emailCheck.ok) return emailCheck;
  if (emailCheck.data && !isValidEmailFormat(emailCheck.data)) {
    return { ok: false, error: 'userEmail inválido.' };
  }
  return { ok: true, data: { id: idCheck.data, userEmail: emailCheck.data } };
};

export const validateFcmConfigPayload = (
  body: unknown
): ValidationResult<{ fcmConfig: Record<string, any> }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const cfg = base.data.fcmConfig;
  if (!isPlainObject(cfg)) {
    return { ok: false, error: 'Configuração FCM inválida.' };
  }
  if (cfg.notifyDaysBeforeClose !== undefined) {
    const daysCheck = requireFiniteNonNegativeNumber(
      cfg.notifyDaysBeforeClose,
      'notifyDaysBeforeClose',
      15
    );
    if (!daysCheck.ok || daysCheck.data < 1) {
      return {
        ok: false,
        error: 'notifyDaysBeforeClose deve ser um número entre 1 e 15.',
      };
    }
  }
  const vapidCheck = optionalTrimmedString(cfg.vapidPublicKey, 'vapidPublicKey', 256);
  if (!vapidCheck.ok) return vapidCheck;
  return { ok: true, data: { fcmConfig: cfg } };
};

export const validateFcmSendWindowAlertPayload = (
  body: unknown
): ValidationResult<{ alert: Record<string, any> }> => {
  const base = ensureSafePayloadObject(body);
  if (!base.ok) return base;
  const alert = base.data.alert;
  if (!isPlainObject(alert)) {
    return { ok: false, error: 'Payload do alerta Push inválido.' };
  }
  const titleCheck = requireTrimmedString(alert.title, 'alert.title', 180);
  if (!titleCheck.ok) return titleCheck;
  const bodyCheck = requireTrimmedString(alert.body, 'alert.body', 600);
  if (!bodyCheck.ok) return bodyCheck;
  if (alert.targetClassIds !== undefined) {
    if (!Array.isArray(alert.targetClassIds) || alert.targetClassIds.length > 80) {
      return { ok: false, error: 'alert.targetClassIds inválido ou excede 80 turmas.' };
    }
  }
  return { ok: true, data: { alert } };
};
