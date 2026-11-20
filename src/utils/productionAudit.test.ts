import assert from 'node:assert/strict';
import { INITIAL_CLASSES } from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getStudentBimesterReport,
  getClassAttendanceMetrics,
  OFFICIAL_BIMESTERS_2027,
} from './attendanceRules';
import {
  evaluateAttendanceLaunchWindow,
  evaluateClassEndOfDayReminder,
  mergeClassesWithConcurrencyControl,
  isValidInstitutionalEmail,
  isUserAccessExpired,
  isUserAccessEffectivelyActive,
  syncExpiredAuthorizedUsers,
  validateAndSanitizeJsonPayload,
} from '../services/db';
import {
  normalizeStudentNameForPhoto,
  normalizeStudentNameCoreTokens,
  extractDriveFileOrFolderId,
  attachPhotosFromDiscoveredCache,
  attachNominalPdfsFromDiscoveredCache,
} from '../services/googleSheetsApi';
import {
  normalizeTextKey,
  normalizeDigits,
  classifyDisabilityValue,
  decodeHtmBuffer,
} from './htmDisabilityParser';
import {
  hasForbiddenPrototypeKey,
  isValidIsoCalendarDate,
  isValidBrCalendarDate,
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
} from './serverValidation';
import { AuthorizedUser, ClassGroup, Student } from '../types';

console.log('Iniciando suíte de validação de produção — Lista Piloto 2027...');

// 1. Validação das 40 Turmas Oficiais e Matriz SED
assert.equal(INITIAL_CLASSES.length, 40, 'Devem existir exatamente 40 turmas oficiais');
const infantilCount = INITIAL_CLASSES.filter((c) => c.name.startsWith('GRUPO')).length;
const fundamentalCount = INITIAL_CLASSES.filter((c) => !c.name.startsWith('GRUPO')).length;
assert.ok(infantilCount > 0 && fundamentalCount > 0, 'Deve conter turmas de Ed. Infantil e Ens. Fundamental');

// 2. Validação de Cálculos de Frequência (Ed. Infantil 60% vs Ens. Fundamental 75%)
const g4Class = INITIAL_CLASSES.find((c) => c.name.startsWith('GRUPO 04'))!;
const fundClass = INITIAL_CLASSES.find((c) => c.name.includes('1º ANO'))!;

const baseInfantilStudent: Student = g4Class.students[0] || {
  id: 'audit-stu-g04a-1',
  number: 1,
  name: 'ALUNO TESTE INFANTIL',
  turma: g4Class.name,
  tipoEnsino: 'EDUCAÇÃO INFANTIL',
  ra: '100000001',
  digRa: '1',
  birthDate: '10/03/2023',
  age: '4 anos',
  status: 'ATIVO',
  guardianName: 'RESPONSÁVEL TESTE',
  guardianPhone: '(11) 99999-0001',
  consecutiveAbsences: 0,
  totalAbsencesMonth: 0,
  justifiedAbsences: 0,
  totalAbsencesYear: 0,
};

const baseFundStudent: Student = fundClass.students[0] || {
  id: 'audit-stu-1a-1',
  number: 1,
  name: 'ALUNO TESTE FUNDAMENTAL',
  turma: fundClass.name,
  tipoEnsino: 'ENSINO FUNDAMENTAL',
  ra: '100000002',
  digRa: '2',
  birthDate: '15/04/2020',
  age: '7 anos',
  status: 'ATIVO',
  guardianName: 'RESPONSÁVEL TESTE FUND',
  guardianPhone: '(11) 99999-0002',
  consecutiveAbsences: 0,
  totalAbsencesMonth: 0,
  justifiedAbsences: 0,
  totalAbsencesYear: 0,
};

const testInfantilStudent: Student = {
  ...baseInfantilStudent,
  totalAbsencesMonth: 9, // 11 presenças em 20 dias = 55% (< 60%)
  justifiedAbsences: 2,
};
const infMetrics = getStudentAttendanceMetrics(testInfantilStudent, 20);
assert.equal(infMetrics.isEducacaoInfantil, true);
assert.equal(infMetrics.minLegalPresencePercent, 60);
assert.equal(infMetrics.frequenciaPercent, 55);
assert.equal(infMetrics.isBelowLegalThreshold, true);
assert.equal(infMetrics.faltasNaoJustificadas, 7);

const testFundStudent: Student = {
  ...baseFundStudent,
  totalAbsencesMonth: 6, // 14 presenças em 20 dias = 70% (< 75%)
  justifiedAbsences: 6,
};
const fundMetrics = getStudentAttendanceMetrics(testFundStudent, 20);
assert.equal(fundMetrics.isEducacaoInfantil, false);
assert.equal(fundMetrics.minLegalPresencePercent, 75);
assert.equal(fundMetrics.frequenciaPercent, 70);
assert.equal(fundMetrics.isBelowLegalThreshold, true);
assert.equal(fundMetrics.faltasNaoJustificadas, 0);

// 3. Validação dos Bimestres de 2027 (Bolsa Família: Fev+Mar até Out+Nov)
assert.equal(OFFICIAL_BIMESTERS_2027.length, 6);
const bimReport = getStudentBimesterReport(testFundStudent, fundClass, '1bim');
assert.equal(bimReport.monthsBreakdown.length, 2);
assert.equal(bimReport.monthsBreakdown[0].monthName, 'Fevereiro');
assert.equal(bimReport.monthsBreakdown[1].monthName, 'Março');

// 4. Validação de Controle de Concorrência entre Dispositivos e Preservação de Vínculo Manual
const seededG4Students = g4Class.students.length > 0 ? g4Class.students : [baseInfantilStudent];
const baseClass: ClassGroup = {
  ...g4Class,
  updatedAtMs: 1000,
  students: seededG4Students.map((s, idx) =>
    idx === 0
      ? {
          ...s,
          totalAbsencesMonth: 2,
          updatedAtMs: 1000,
          fichaPdfDriveId: 'auto-pdf-id',
          fichaPdfManualLink: false,
        }
      : s
  ),
};

// Dispositivo A (mais recente: t=3000) vinculou manualmente um PDF com nome divergente e alterou faltas para 5
const localEditedClass: ClassGroup = {
  ...baseClass,
  updatedAtMs: 3000,
  students: baseClass.students.map((s, idx) =>
    idx === 0
      ? {
          ...s,
          totalAbsencesMonth: 5,
          updatedAtMs: 3000,
          fichaPdfDriveId: 'manual-pdf-999',
          fichaPdfDriveUrl: 'https://drive.google.com/file/d/manual-pdf-999/view',
          fichaPdfManualLink: true,
          photo: '/api/drive-photo/manual-photo-888',
          photoDriveId: 'manual-photo-888',
          photoManualLink: true,
        }
      : s
  ),
};

// Dispositivo B (atrasado: t=2000) enviou estado antigo
const staleRemoteClass: ClassGroup = {
  ...baseClass,
  updatedAtMs: 2000,
};

const mergedResult = mergeClassesWithConcurrencyControl(
  [staleRemoteClass],
  [localEditedClass],
  2000,
  3000
);

assert.equal(
  mergedResult[0].students[0].totalAbsencesMonth,
  5,
  'Gravação atrasada não pode sobrescrever lançamento mais recente'
);
assert.equal(
  mergedResult[0].students[0].fichaPdfDriveId,
  'manual-pdf-999',
  'Vínculo manual de PDF deve ser preservado contra sobrescrita'
);
assert.equal(
  mergedResult[0].students[0].photoDriveId,
  'manual-photo-888',
  'Vínculo manual de Foto deve ser preservado contra sobrescrita'
);

// 5. Validação de Preservação de Vínculo Manual durante Sincronização Automática do Cache Drive
const afterAutoCacheClasses = attachPhotosFromDiscoveredCache(
  attachNominalPdfsFromDiscoveredCache(mergedResult)
);
assert.equal(
  afterAutoCacheClasses[0].students[0].fichaPdfDriveId,
  'manual-pdf-999',
  'attachNominalPdfsFromDiscoveredCache não pode sobrescrever fichaPdfManualLink'
);
assert.equal(
  afterAutoCacheClasses[0].students[0].photoDriveId,
  'manual-photo-888',
  'attachPhotosFromDiscoveredCache não pode sobrescrever photoManualLink'
);

// 6. Validação de Normalização de Nomes com Grafia Divergente / Abreviada
assert.equal(
  normalizeStudentNameForPhoto('G04A - 05 - JOÃO PEDRO DA SILVA (1).jpg'),
  'JOAO PEDRO DA SILVA'
);
assert.equal(
  normalizeStudentNameCoreTokens('JOÃO PEDRO DA SILVA'),
  normalizeStudentNameCoreTokens('JOAO PEDRO SILVA')
);
assert.equal(
  extractDriveFileOrFolderId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=sharing'),
  '1AbCdEfGhIjKlMnOpQrStUvWxYz123456'
);

// 7. Validação de Domínio Institucional e Janela de Lançamento
assert.equal(isValidInstitutionalEmail('maria@educacao.jundiai.sp.gov.br'), true);
assert.equal(isValidInstitutionalEmail('emebjfreitas@jundiai.sp.gov.br'), true);
assert.equal(isValidInstitutionalEmail('intruso@gmail.com'), false);

const windowOpenOverride = evaluateAttendanceLaunchWindow({
  exceptionalOverrideOpen: true,
});
assert.equal(windowOpenOverride.isAllowedToLaunch, true);

// 8. Validação do Lembrete de Fim de Expediente Escolar (Turno Manhã 12:00 / Turno Tarde 17:30)
const morningRefDate = new Date(2027, 9, 29, 10, 30, 0); // Sexta 29/10/2027 10:30 (último dia letivo)
const winMorningBeforeCutoff = evaluateAttendanceLaunchWindow(
  { exceptionalOverrideOpen: false },
  morningRefDate
);
assert.equal(winMorningBeforeCutoff.isSchoolWeekday, true);
assert.equal(winMorningBeforeCutoff.isAllowedToLaunch, true);
assert.equal(winMorningBeforeCutoff.isMorningEndOfDayReached, false);
assert.equal(winMorningBeforeCutoff.msUntilMorningEndOfDay, 45 * 60 * 1000);

const morningDueDate = new Date(2027, 9, 29, 11, 30, 0); // 11:30 (>= 11:15)
const morningPendingEval = evaluateClassEndOfDayReminder(
  { exceptionalOverrideOpen: false },
  { isPending: true, shift: 'Turno Manhã', periodo: 'MANHÃ' },
  morningDueDate
);
assert.equal(morningPendingEval.shouldRemindNow, true);
assert.equal(morningPendingEval.closingTimeLabel, '12:00');

const morningCompletedEval = evaluateClassEndOfDayReminder(
  { exceptionalOverrideOpen: false },
  { isPending: false, shift: 'Turno Manhã', periodo: 'MANHÃ' },
  morningDueDate
);
assert.equal(
  morningCompletedEval.shouldRemindNow,
  false,
  'Turma com frequência já lançada (isPending=false) não deve disparar lembrete'
);

const afternoonBeforeDate = new Date(2027, 9, 29, 15, 0, 0); // 15:00 (< 16:45)
const afternoonUpcomingEval = evaluateClassEndOfDayReminder(
  { exceptionalOverrideOpen: false },
  { isPending: true, shift: 'Turno Tarde', periodo: 'TARDE' },
  afternoonBeforeDate
);
assert.equal(afternoonUpcomingEval.shouldRemindNow, false);
assert.equal(afternoonUpcomingEval.msUntilReminder, 105 * 60 * 1000);

const afternoonDueDate = new Date(2027, 9, 29, 16, 50, 0); // 16:50 (>= 16:45)
const afternoonPendingEval = evaluateClassEndOfDayReminder(
  { exceptionalOverrideOpen: false },
  { isPending: true, shift: 'Turno Tarde', periodo: 'TARDE' },
  afternoonDueDate
);
assert.equal(afternoonPendingEval.shouldRemindNow, true);
assert.equal(afternoonPendingEval.closingTimeLabel, '17:30');

const sundayDate = new Date(2027, 9, 31, 17, 0, 0); // Domingo
const sundayEval = evaluateClassEndOfDayReminder(
  { exceptionalOverrideOpen: true },
  { isPending: true, shift: 'Turno Tarde', periodo: 'TARDE' },
  sundayDate
);
assert.equal(sundayEval.isSchoolWeekday, false);
assert.equal(sundayEval.shouldRemindNow, false);

const classMetrics = getClassAttendanceMetrics(g4Class);
assert.ok(classMetrics.presenceRate >= 0 && classMetrics.presenceRate <= 100);

// 9. Validação dos Helpers de Expiração Automática de Acesso
const refToday = new Date(2027, 4, 15, 10, 0, 0); // 15/05/2027
assert.equal(isUserAccessExpired({ accessExpiresAt: '2027-05-14' }, refToday), true, 'Data passada deve expirar');
assert.equal(isUserAccessExpired({ accessExpiresAt: '2027-05-15' }, refToday), false, 'Acesso válido até o fim do dia limite');
assert.equal(isUserAccessExpired({ accessExpiresAt: '2027-06-01' }, refToday), false, 'Data futura não expira');
assert.equal(isUserAccessExpired({ accessExpiresAt: '' }, refToday), false, 'Sem data limite não expira');

assert.equal(
  isUserAccessEffectivelyActive({ active: true, accessExpiresAt: '2027-05-14' }, refToday),
  false
);
assert.equal(
  isUserAccessEffectivelyActive({ active: true, accessExpiresAt: '2027-05-20' }, refToday),
  true
);
assert.equal(
  isUserAccessEffectivelyActive({ active: false, accessExpiresAt: '2027-05-20' }, refToday),
  false
);

const mockUsersForExpiry: AuthorizedUser[] = [
  {
    id: 'u-exp',
    email: 'expirado@educacao.jundiai.sp.gov.br',
    name: 'Prof. Expirado',
    role: 'usuario',
    assignedClassId: 'g04a',
    assignedClassName: 'GRUPO 04 A',
    active: true,
    accessExpiresAt: '2027-05-10',
    createdAt: '2027-02-01',
  },
  {
    id: 'u-ok',
    email: 'ativo@educacao.jundiai.sp.gov.br',
    name: 'Prof. Ativo',
    role: 'usuario',
    assignedClassId: '1a',
    assignedClassName: '1º ANO A',
    active: true,
    accessExpiresAt: '2027-12-20',
    createdAt: '2027-02-01',
  },
];
const syncExpiryResult = syncExpiredAuthorizedUsers(mockUsersForExpiry, refToday);
assert.equal(syncExpiryResult.changed, true);
assert.equal(syncExpiryResult.expiredUsers.length, 1);
assert.equal(syncExpiryResult.expiredUsers[0].id, 'u-exp');
assert.equal(syncExpiryResult.updatedUsers[0].active, false);
assert.equal(syncExpiryResult.updatedUsers[1].active, true);

// 10. Validação do Sanitizador de Payload JSON (validateAndSanitizeJsonPayload)
const nullPayloadRes = validateAndSanitizeJsonPayload(null);
assert.equal(nullPayloadRes.isValid, false);

const protoAttackJson = JSON.parse('{"classes":[{"id":"1a","students":[]}],"__proto__":{"isAdmin":true}}');
const protoAttackRes = validateAndSanitizeJsonPayload(protoAttackJson);
assert.equal(protoAttackRes.isValid, false, 'Deve bloquear payload com chave __proto__');

const flatSedPayload = [
  {
    TURMA: g4Class.name,
    ESTUDANTE: 'MARIA CLARA <script>alert(1)</script>SOUZA',
    RA: '123456789-0',
    FILIACAO_1: 'ANA SOUZA javascript:alert(2)',
    DEFICIENCIA: 'TEA',
  },
];
const validFlatRes = validateAndSanitizeJsonPayload(flatSedPayload);
assert.equal(validFlatRes.isValid, true);
assert.equal(validFlatRes.importedClassesCount, 1);
assert.equal(validFlatRes.importedStudentsCount, 1);
const importedG4 = validFlatRes.classes?.find((c) => c.id === g4Class.id);
assert.ok(importedG4 && importedG4.students.length === 1);
assert.equal(importedG4!.students[0].name.includes('<script'), false, 'Script XSS deve ser removido');
assert.equal(importedG4!.students[0].ra, '123456789');
assert.equal(importedG4!.students[0].digRa, '0');
assert.equal(importedG4!.students[0].filiacao1?.toLowerCase().includes('javascript:'), false);

// 11. Validação do Parser HTM de Deficiências (htmDisabilityParser.ts)
assert.equal(normalizeTextKey('  Transtorno do   Espectro Autísta  '), 'TRANSTORNO DO ESPECTRO AUTISTA');
assert.equal(normalizeDigits('123.456.789-01'), '12345678901');

assert.deepEqual(classifyDisabilityValue('NÃO POSSUI'), { cleanValue: '', isClearSignal: true });
assert.deepEqual(classifyDisabilityValue('Sem Deficiência'), { cleanValue: '', isClearSignal: true });
assert.deepEqual(classifyDisabilityValue('   '), { cleanValue: '', isClearSignal: false });
assert.deepEqual(classifyDisabilityValue('Deficiência Auditiva'), {
  cleanValue: 'Deficiência Auditiva',
  isClearSignal: false,
});

// Decodificação UTF-8 e ISO-8859-1 / Windows-1252
const utf8Sample = new TextEncoder().encode('<meta charset="utf-8"><title>Educação Especial</title>');
const utf8Decoded = await decodeHtmBuffer(utf8Sample.buffer);
assert.ok(utf8Decoded.html.includes('Educação Especial'));

// ISO-8859-1 bytes for "Educação Especial" ('ç'=0xE7, 'ã'=0xE3)
const latin1Prefix = Array.from('<meta charset="iso-8859-1"><title>Educa').map((ch) => ch.charCodeAt(0));
const latin1Suffix = Array.from('o Especial</title>').map((ch) => ch.charCodeAt(0));
const latin1Bytes = new Uint8Array([...latin1Prefix, 0xe7, 0xe3, ...latin1Suffix]);
const latin1Decoded = await decodeHtmBuffer(latin1Bytes.buffer);
assert.ok(latin1Decoded.html.includes('Educação Especial'), 'Deve decodificar charset ISO-8859-1 corretamente');
assert.ok(latin1Decoded.charset.toLowerCase().includes('iso-8859-1'));

// 12. Validação Estrita de Payloads do Servidor (serverValidation.ts)
assert.equal(hasForbiddenPrototypeKey(JSON.parse('{"nested":{"constructor":{"x":1}}}')), true);
assert.equal(hasForbiddenPrototypeKey({ a: 1, b: ['ok'] }), false);

assert.equal(isValidIsoCalendarDate('2027-02-28'), true);
assert.equal(isValidIsoCalendarDate('2028-02-29'), true);
assert.equal(isValidIsoCalendarDate('2027-02-29'), false);
assert.equal(isValidIsoCalendarDate('2027-04-31'), false);

assert.equal(isValidBrCalendarDate('28/02/2027'), true);
assert.equal(isValidBrCalendarDate('29/02/2028'), true);
assert.equal(isValidBrCalendarDate('31/02/2027'), false);

assert.equal(validateAuthSessionRequest({}, 'Bearer abc.def.ghi').ok, true);
assert.equal(validateAuthSessionRequest({}, '').ok, false);

assert.equal(validateDriveTokenPayload({ accessToken: 'ya29.valid_token_12345' }).ok, true);
assert.equal(validateDriveTokenPayload({ accessToken: 'short' }).ok, false);

assert.equal(
  validatePhotoUploadBinaryHeaders('stu-1', 'a'.repeat(64), Buffer.from([1, 2, 3])).ok,
  true
);
assert.equal(
  validatePhotoUploadBinaryHeaders('stu-1', 'bad-sha', Buffer.from([1, 2, 3])).ok,
  false
);
assert.equal(validatePhotoUploadBinaryHeaders('', undefined, Buffer.from([1])).ok, false);

assert.equal(validatePhotoUploadPayload({ studentId: 'stu-1', photoDataUrl: 'data:image/webp;base64,AAA' }).ok, true);
assert.equal(validatePhotoUploadPayload({ studentId: '', photoDataUrl: 'data:image/webp;base64,AAA' }).ok, false);

assert.equal(validatePhotoBatchPayload({ photos: [{ studentId: 's1', photoDataUrl: 'data:image/png;base64,AA' }] }).ok, true);
assert.equal(validatePhotoBatchPayload({ photos: [] }).ok, false);

assert.equal(validatePdfUploadPayload({ studentId: 's1', pdfDataUrl: 'data:application/pdf;base64,JVBER' }).ok, true);
assert.equal(validatePdfBatchPayload({ pdfs: [] }).ok, false);

assert.equal(
  validateSchoolStateClassesPayload({
    classes: [{ id: 'g04a', students: [{ id: 's1', totalAbsencesMonth: 3, justifiedAbsences: 1 }] }],
  }).ok,
  true
);
assert.equal(
  validateSchoolStateClassesPayload({
    classes: [{ id: 'g04a', students: [{ id: 's1', totalAbsencesMonth: 99 }] }],
  }).ok,
  false
);
assert.equal(validateSchoolStateClassesPayload({ classes: [] }).ok, false);

assert.equal(
  validateSchoolStateLinksPayload({ cloudLinks: { photosFolderId: 'abc' } }).ok,
  true
);
assert.equal(validateSchoolStateLinksPayload({}).ok, false);

assert.equal(
  validateSchoolStateUsersPayload({
    authorizedUsers: [{ email: 'docente@educacao.jundiai.sp.gov.br', role: 'usuario', accessExpiresAt: '2027-12-15' }],
  }).ok,
  true
);
assert.equal(
  validateSchoolStateUsersPayload({
    authorizedUsers: [{ email: 'externo@gmail.com', role: 'usuario' }],
  }).ok,
  false
);
assert.equal(
  validateSchoolStateUsersPayload({
    authorizedUsers: [{ email: 'docente@educacao.jundiai.sp.gov.br', accessExpiresAt: '2027-02-30' }],
  }).ok,
  false
);

assert.equal(validateSchoolStateResetPayload({}).ok, true);
assert.equal(validateSchoolStateImportJsonPayload({ payload: { classes: [{ id: '1a' }] } }).ok, true);
assert.equal(validateSchoolStateImportJsonPayload({ payload: { classes: [] } }).ok, false);

assert.equal(validateSchoolStateLogsPayload({ accessSessionLogs: [{ id: 'log-1' }] }).ok, true);
assert.equal(validateSchoolStateLogsPayload({ accessSessionLogs: [{}] }).ok, false);

assert.equal(
  validateAttendanceWindowPayload({
    attendanceWindowConfig: { exceptionalOverrideOpen: true, simulatedDateISO: '2027-10-29' },
  }).ok,
  true
);
assert.equal(
  validateAttendanceWindowPayload({
    attendanceWindowConfig: { exceptionalOverrideOpen: true, simulatedDateISO: '2027-02-30' },
  }).ok,
  false
);

assert.equal(
  validateSchoolNoticesPayload({
    schoolNotices: [{ id: 'n1', title: 'Aviso', content: 'Reunião às 17h' }],
  }).ok,
  true
);
assert.equal(
  validateSchoolNoticesPayload({
    schoolNotices: [{ id: 'n1', title: '   ', content: 'Sem título' }],
  }).ok,
  false
);

assert.equal(validateCalendarConfigPayload({ rawDatesText: '01/02/2027', year: 2027 }).ok, true);
assert.equal(validateCalendarConfigPayload({ year: 1990 }).ok, false);

assert.equal(
  validateHolidayActionPayload({
    action: 'add',
    holiday: { date: '20/11/2027', name: 'Consciência Negra', type: 'nacional' },
  }).ok,
  true
);
assert.equal(
  validateHolidayActionPayload({
    action: 'add',
    holiday: { date: '31/02/2027', name: 'Data impossível', type: 'nacional' },
  }).ok,
  false
);

assert.equal(validateSecurityLogPayload({ eventType: 'LOGIN_SUCCESS', details: 'ok' }).ok, true);
assert.equal(validateSecurityLogPayload({ details: 'sem tipo' }).ok, false);

assert.equal(
  validateFcmRegisterTokenPayload({
    id: 'dev-1',
    userEmail: 'prof@educacao.jundiai.sp.gov.br',
    assignedClassIds: ['g04a'],
  }).ok,
  true
);
assert.equal(
  validateFcmRegisterTokenPayload({
    id: 'dev-1',
    userEmail: 'intruso@gmail.com',
  }).ok,
  false
);
assert.equal(validateFcmUnregisterTokenPayload({ id: 'dev-1' }).ok, true);
assert.equal(validateFcmConfigPayload({ fcmConfig: { notifyDaysBeforeClose: 3 } }).ok, true);
assert.equal(validateFcmConfigPayload({ fcmConfig: { notifyDaysBeforeClose: 0 } }).ok, false);
assert.equal(
  validateFcmSendWindowAlertPayload({
    alert: { title: 'Janela fecha hoje', body: 'Conclua o lançamento.' },
  }).ok,
  true
);
assert.equal(validateFcmSendWindowAlertPayload({ alert: { title: '', body: 'x' } }).ok, false);

console.log('✓ Todos os testes de integridade, expiração, HTM, validação de servidor e regras MEC passaram com sucesso!');

