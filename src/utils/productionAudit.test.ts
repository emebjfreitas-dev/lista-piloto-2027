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
  mergeClassesWithConcurrencyControl,
  isValidInstitutionalEmail,
} from '../services/db';
import {
  normalizeStudentNameForPhoto,
  normalizeStudentNameCoreTokens,
  extractDriveFileOrFolderId,
  attachPhotosFromDiscoveredCache,
  attachNominalPdfsFromDiscoveredCache,
} from '../services/googleSheetsApi';
import { ClassGroup, Student } from '../types';

console.log('Iniciando suíte de validação de produção — Lista Piloto 2027...');

// 1. Validação das 39 Turmas Oficiais e Matriz SED
assert.equal(INITIAL_CLASSES.length, 39, 'Devem existir exatamente 39 turmas oficiais');
const infantilCount = INITIAL_CLASSES.filter((c) => c.name.startsWith('GRUPO')).length;
const fundamentalCount = INITIAL_CLASSES.filter((c) => !c.name.startsWith('GRUPO')).length;
assert.ok(infantilCount > 0 && fundamentalCount > 0, 'Deve conter turmas de Ed. Infantil e Ens. Fundamental');

// 2. Validação de Cálculos de Frequência (Ed. Infantil 60% vs Ens. Fundamental 75%)
const g4Class = INITIAL_CLASSES.find((c) => c.name.startsWith('GRUPO 04'))!;
const fundClass = INITIAL_CLASSES.find((c) => c.name.includes('1º ANO'))!;

const testInfantilStudent: Student = {
  ...g4Class.students[0],
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
  ...fundClass.students[0],
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
const baseClass: ClassGroup = {
  ...g4Class,
  updatedAtMs: 1000,
  students: g4Class.students.map((s, idx) =>
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

const classMetrics = getClassAttendanceMetrics(g4Class);
assert.ok(classMetrics.presenceRate >= 0 && classMetrics.presenceRate <= 100);

console.log('✓ Todos os testes de integridade, concorrência, vínculos manuais e regras MEC passaram com sucesso!');
