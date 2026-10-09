import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ClassGroup,
  SchoolDay,
  Student,
  UserRole,
  AuthorizedUser,
  DriveNominalPdfFile,
  UserAccessSessionLog,
} from '../types';
import {
  OFFICIAL_OCTOBER_DAYS,
  MONTHLY_SCHOOL_DAYS_2027,
  getDefaultMonthlySchoolDaysMap,
} from '../data/mockData';
import {
  getStoredAuthorizedUsers,
  getStoredAccessSessionLogs,
  formatDurationHuman,
  pushCloudLinksToServer,
} from './db';
import {
  getStudentAttendanceMetrics,
  getClassAttendanceMetrics,
} from '../utils/attendanceRules';

export const OFFICIAL_ADMIN_EMAIL = 'emebjfreitas@educacao.jundiai.sp.gov.br';
export const OFFICIAL_WORKSPACE_HOSTED_DOMAIN = 'educacao.jundiai.sp.gov.br';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory access token cache (NEVER stored in localStorage/sessionStorage per security rules)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Storage keys for non-sensitive resource IDs/URLs
const SHEET_ID_STORAGE_KEY = 'emeb_candelario_linked_spreadsheet_id_2027';
const SHEET_TITLE_STORAGE_KEY = 'emeb_candelario_linked_spreadsheet_title_2027';
const DRIVE_PHOTOS_URL_KEY = 'emeb_candelario_drive_photos_folder_url_2027';
const DRIVE_PHOTOS_ID_KEY = 'emeb_candelario_drive_photos_folder_id_2027';
const DRIVE_FICHAS_PDF_URL_KEY = 'emeb_candelario_drive_fichas_pdf_folder_url_2027';
const DRIVE_FICHAS_PDF_ID_KEY = 'emeb_candelario_drive_fichas_pdf_folder_id_2027';

export const OFFICIAL_FOLDER_NAME = 'Fotos Estudantes';
export const OFFICIAL_PHOTOS_FOLDER_ID =
  '1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn';
export const OFFICIAL_PHOTOS_FOLDER_URL =
  `https://drive.google.com/drive/folders/${OFFICIAL_PHOTOS_FOLDER_ID}`;
export const OFFICIAL_FICHAS_PDF_FOLDER_NAME = 'Fichas Informativas';
export const OFFICIAL_FICHAS_PDF_FOLDER_ID =
  '1GDEdQuNfhc0vps4mZXv4LLv4kDLZnauJ';
export const OFFICIAL_FICHAS_PDF_FOLDER_URL =
  `https://drive.google.com/drive/folders/${OFFICIAL_FICHAS_PDF_FOLDER_ID}`;
export const OFFICIAL_SPREADSHEET_TITLE =
  'BD_Oficial_SED_EMEB_Joaquim_Candelario_2027';

export const extractDriveFileOrFolderId = (input: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (fileMatch && fileMatch[1]) return fileMatch[1];
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return trimmed;
};

export const DEFAULT_DRIVE_PHOTOS_FOLDER_URL = OFFICIAL_PHOTOS_FOLDER_URL;

export const getSavedFichasPdfDriveFolderInfo = (): {
  folderId: string;
  folderUrl: string;
} => {
  const folderId =
    localStorage.getItem(DRIVE_FICHAS_PDF_ID_KEY) ||
    OFFICIAL_FICHAS_PDF_FOLDER_ID;
  const folderUrl =
    localStorage.getItem(DRIVE_FICHAS_PDF_URL_KEY) ||
    `https://drive.google.com/drive/folders/${folderId}`;
  return { folderId, folderUrl };
};

export const saveFichasPdfDriveFolderUrl = (
  urlOrId: string,
  explicitFolderId?: string
): void => {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  const extractedId =
    explicitFolderId || (match && match[1]) || trimmed || OFFICIAL_FICHAS_PDF_FOLDER_ID;
  const fullUrl = trimmed.startsWith('http')
    ? trimmed
    : `https://drive.google.com/drive/folders/${extractedId}`;
  localStorage.setItem(DRIVE_FICHAS_PDF_ID_KEY, extractedId);
  localStorage.setItem(DRIVE_FICHAS_PDF_URL_KEY, fullUrl);
  pushCloudLinksToServer({
    fichasPdfFolderId: extractedId,
    fichasPdfFolderUrl: fullUrl,
  });
};

export const getSavedPhotosDriveFolderInfo = (): {
  folderId: string;
  folderUrl: string;
  isRealCreated: boolean;
} => {
  const rawStoredId = localStorage.getItem(DRIVE_PHOTOS_ID_KEY) || '';
  const rawStoredUrl = localStorage.getItem(DRIVE_PHOTOS_URL_KEY) || '';

  // Auto-migrate any empty or legacy placeholder folder to the official "Dados 2025 > Fotos Estudantes" folder
  const isLegacyOrGeneric =
    !rawStoredId ||
    rawStoredUrl === 'https://drive.google.com/drive/my-drive' ||
    rawStoredUrl.includes('my-drive');

  const folderId = isLegacyOrGeneric ? OFFICIAL_PHOTOS_FOLDER_ID : rawStoredId;
  const folderUrl = isLegacyOrGeneric
    ? OFFICIAL_PHOTOS_FOLDER_URL
    : rawStoredUrl || `https://drive.google.com/drive/folders/${folderId}`;

  if (isLegacyOrGeneric) {
    try {
      localStorage.setItem(DRIVE_PHOTOS_ID_KEY, OFFICIAL_PHOTOS_FOLDER_ID);
      localStorage.setItem(DRIVE_PHOTOS_URL_KEY, OFFICIAL_PHOTOS_FOLDER_URL);
    } catch {
      // ignore storage errors
    }
  }

  return {
    folderId,
    folderUrl,
    isRealCreated: true,
  };
};

export const getSavedPhotosDriveFolderUrl = (): string => {
  return getSavedPhotosDriveFolderInfo().folderUrl;
};

export const savePhotosDriveFolderUrl = (url: string, folderId?: string): void => {
  const trimmed = url.trim();
  const finalUrl = trimmed || DEFAULT_DRIVE_PHOTOS_FOLDER_URL;
  localStorage.setItem(DRIVE_PHOTOS_URL_KEY, finalUrl);
  let resolvedId = folderId || '';
  if (folderId) {
    localStorage.setItem(DRIVE_PHOTOS_ID_KEY, folderId);
  } else {
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      resolvedId = match[1];
      localStorage.setItem(DRIVE_PHOTOS_ID_KEY, match[1]);
    }
  }
  pushCloudLinksToServer({
    photosFolderId: resolvedId || localStorage.getItem(DRIVE_PHOTOS_ID_KEY) || '',
    photosFolderUrl: finalUrl,
  });
};

export const getSavedSpreadsheetInfo = (): {
  spreadsheetId: string;
  title: string;
  fullUrl: string;
  isRealCreated: boolean;
} => {
  const savedId = localStorage.getItem(SHEET_ID_STORAGE_KEY) || '';
  return {
    spreadsheetId: savedId,
    title:
      localStorage.getItem(SHEET_TITLE_STORAGE_KEY) ||
      OFFICIAL_SPREADSHEET_TITLE,
    fullUrl: savedId
      ? `https://docs.google.com/spreadsheets/d/${savedId}/edit`
      : 'https://docs.google.com/spreadsheets/create',
    isRealCreated: Boolean(savedId),
  };
};

export const saveSpreadsheetInfo = (spreadsheetId: string, title: string) => {
  localStorage.setItem(SHEET_ID_STORAGE_KEY, spreadsheetId);
  localStorage.setItem(SHEET_TITLE_STORAGE_KEY, title);
  pushCloudLinksToServer({
    spreadsheetId,
    spreadsheetTitle: title,
  });
};

export const extractSpreadsheetId = (input: string): string => {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
};

export const isAdminEditor = (userRole?: UserRole): boolean => {
  return userRole === 'admin';
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const checkGoogleRedirectResult = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    return { user: result.user, accessToken: cachedAccessToken || '' };
  } catch (err) {
    console.warn('Redirect auth check:', err);
    return null;
  }
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    return { user: result.user, accessToken: cachedAccessToken || '' };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-blocked' ||
      error?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        await signInWithRedirect(auth, provider);
        return null;
      } catch {
        throw error;
      }
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentGoogleUser = (): User | null => {
  return auth.currentUser;
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

/**
 * Normalize student name or image filename for automatic photo matching
 * e.g. "RAUANNY GRAZIELLY DA SILVA LIMA.jpg" -> "RAUANNY GRAZIELLY DA SILVA LIMA"
 * e.g. "01_ALICE_DE_BARROS_PIRES (1).jpeg" -> "ALICE DE BARROS PIRES"
 * e.g. "G04A - 05 - BERNARDO HENRIQUE.HEIC" -> "BERNARDO HENRIQUE"
 */
export const normalizeStudentNameForPhoto = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/(\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|avif|svg|tif|tiff|pdf))+$/i, '')
    .replace(/\s*\(\d+\)\s*$/g, '') // remove Windows/Drive duplicate suffix like " (1)"
    .replace(/\s*[-_]?\s*C[OÓ]PIA.*$/i, '') // remove "- Cópia"
    .replace(/\s+at\s+\d+.*$/i, '') // remove WhatsApp timestamp suffix if any
    .replace(/^WHATSAPP\s+IMAGE[\s_.-]*/i, '')
    .replace(/^FOTO[\s_.-]+(DE[\s_.-]+|DO[\s_.-]+|DA[\s_.-]+)?/i, '')
    .replace(/^IMG[\s_.-]+/i, '')
    .replace(/^ALUN[OA][\s_.-]+/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/^(FICHA\s+INFORMATIVA\s*[-_]?\s*)/i, '')
    .replace(/^(GRUPO\s*0?[45]\s*[A-Z]|[1-5]\s*[º°o]?\s*ANO\s*[A-Z]|G0?[45][A-Z]|[1-5][A-Z])[\s_.-]+/i, '')
    .replace(/^(N[º°o]?\s*)?\d+[\s_.-]+/i, '')
    .replace(/^(N[º°o]?\s*)?\d+[\s_.-]+/i, '') // second pass in case of "G04A - 01 - NOME"
    .replace(/[_-]+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Strip Portuguese prepositions/articles (DE, DA, DO, DOS, DAS, E) for resilient name comparison
 * when a photo filename omits or adds a particle (e.g., "JOAO SILVA" vs "JOAO DA SILVA").
 */
export const normalizeStudentNameCoreTokens = (raw: string): string => {
  const base = normalizeStudentNameForPhoto(raw);
  if (!base) return '';
  const stopWords = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);
  return base
    .split(' ')
    .filter((t) => t && !stopWords.has(t))
    .join(' ');
};

/**
 * Converts any Google Drive file URL or ID into a reliable embeddable thumbnail URL
 */
export const toEmbeddableDrivePhotoUrl = (
  urlOrId?: string,
  thumbnailLink?: string
): string => {
  if (thumbnailLink && thumbnailLink.trim()) {
    return thumbnailLink.replace(/=s\d+/, '=s400');
  }
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.includes('drive.google.com/thumbnail')) return trimmed;
  if (trimmed.includes('googleusercontent.com')) {
    return trimmed.replace(/=s\d+/, '=s400');
  }
  if (trimmed.includes('/drive/folders/')) {
    return '';
  }
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (fileMatch && fileMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w400`;
  }
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (idMatch && idMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`;
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return `https://drive.google.com/thumbnail?id=${trimmed}&sz=w400`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return '';
};

export const formatShortTurmaCode = (className: string): string => {
  if (className.startsWith('GRUPO ')) {
    return className
      .replace('GRUPO 0', 'G')
      .replace('GRUPO ', 'G')
      .replace(/\s+/g, '');
  }
  if (className.includes('º ANO ')) {
    return className.replace('º ANO ', '').replace(/\s+/g, '');
  }
  return className;
};

/**
 * Exact 48 SED Columns (A to AV) + Attendance & Photo Columns (AW to BF)
 * Columns A..AV (indices 0..47): Master Student Data edited manually in Google Sheets
 * Columns AW..BF (indices 48..57): Attendance & Photo Link fed by App / Drive
 */
export const SED_48_HEADERS = [
  // 0..47: 48 Official SED Columns (Manual in Google Sheets -> Auto-updated in App)
  'TIPO DE ENSINO',
  'SÉRIE',
  'Nº CHAMADA',
  'ESTUDANTE',
  'RA',
  'DIG. RA',
  'UF RA',
  'DATA DE NASCIMENTO',
  'TIPO ALOCAÇÃO',
  'SITUAÇÃO',
  'DATA MOVIMENTAÇÃO',
  'CATEGORIA PROFISSIONAL CENSO',
  'DEFICIÊNCIA',
  'PÓS DATA CENSO',
  'TURMA',
  'PERÍODO',
  'DATA DE MATRÍCULA (SED)',
  'PROCEDÊNCIA ESCOLAR',
  'IRMÃOS',
  'IDADE',
  'ARQUIVO',
  'FILIAÇÃO 1',
  'FILIAÇÃO 2',
  'NOME SOCIAL',
  'GÊNERO',
  'TIPO SANGUÍNEO',
  'RAÇA/COR',
  'NACIONALIDADE',
  'PAÍS DE ORIGEM',
  'MUNICÍPIO DE NASCIMENTO',
  'CPF',
  'RG',
  'DATA EMISSÃO RG',
  'CARTÃO SUS',
  'NIS',
  'CEP',
  'LOGRADOURO',
  'N. RESIDENCIA',
  'COMPLEMENTO',
  'BAIRRO',
  'CIDADE',
  'UF',
  'TELEFONES',
  'E-MAIL GOOGLE',
  'E-MAIL MICROSOFT',
  'EMAIL MUNICIPAL',
  'ROTA DE ÔNIBUS',
  'SUCESSÃO ESCOLAR',
  // 48..57 (Columns AW..BF): Attendance Columns fed by App when filling out absences + Photo Link
  'DIAS LETIVOS DO MÊS', // AW (col 49)
  'DIAS NO RECORTE DA MATRÍCULA', // AX (col 50)
  'FALTAS NO MÊS', // AY (col 51)
  'QTD ATESTADOS APRESENTADOS', // AZ (col 52)
  'PRESENÇAS NO PERÍODO', // BA (col 53)
  '% FREQUÊNCIA NO RECORTE', // BB (col 54)
  'LINK FOTO GOOGLE DRIVE', // BC (col 55)
  'OBSERVAÇÕES / ATESTADOS', // BD (col 56)
  'ID_TURMA', // BE (col 57)
  'ID_ESTUDANTE', // BF (col 58)
];

const isEducacaoInfantilClass = (cls: ClassGroup): boolean => {
  return (
    cls.name.toUpperCase().startsWith('GRUPO') ||
    cls.grade.toUpperCase().includes('INFANTIL')
  );
};

const buildNominalStageSheetValues = (
  classes: ClassGroup[],
  stage: 'EDUCACAO INFANTIL' | 'ENSINO FUNDAMENTAL',
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): any[][] => {
  const headers = [
    'SEGMENTO DE ENSINO',
    'ETAPA / SÉRIE',
    'TURMA',
    'TURNO',
    'SALA',
    'Nº CHAMADA',
    'NOME NOMINAL DO(A) ESTUDANTE',
    'RA',
    'DIG. RA',
    'UF RA',
    'DATA DE MATRÍCULA (SED)',
    'DATA DE MOVIMENTAÇÃO',
    'SITUAÇÃO DO RECORTE',
    'QTD DIAS LETIVOS DO MÊS',
    'QTD DIAS NO RECORTE DA MATRÍCULA',
    'QTD PRESENÇAS NO PERÍODO',
    '% PRESENÇA (FREQUÊNCIA)',
    'QTD TOTAL DE FALTAS NO MÊS',
    '% FALTAS SOBRE DIAS MATRICULADOS',
    'QTD ATESTADOS APRESENTADOS (FALTAS JUSTIFICADAS)',
    '% ATESTADOS SOBRE O TOTAL DE FALTAS',
    '% ATESTADOS SOBRE DIAS MATRICULADOS',
    'QTD FALTAS NÃO JUSTIFICADAS (SEM ATESTADO)',
    'STATUS DE FREQUÊNCIA',
    'OBSERVAÇÕES / DETALHE DO ATESTADO',
    'FILIAÇÃO 1 (NOME DA MÃE)',
    'FILIAÇÃO 2 (NOME DO PAI)',
    'TELEFONE DE CONTATO',
    'E-MAIL INSTITUCIONAL',
  ];

  const rows: any[][] = [headers];
  const stageClasses = classes.filter((cls) =>
    stage === 'EDUCACAO INFANTIL'
      ? isEducacaoInfantilClass(cls)
      : !isEducacaoInfantilClass(cls)
  );

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

      rows.push([
        stage,
        cls.grade,
        cls.name,
        turnoLabel,
        cls.room,
        s.number,
        s.name,
        s.ra || '',
        s.digRa || '',
        s.ufRa || 'SP',
        s.dataMatriculaSed || '03/02/2027',
        s.dataMovimentacao || '',
        m.recorteLabel,
        m.diasLetivosMes,
        m.diasLetivosMatriculados,
        m.presencas,
        `${m.frequenciaPercent}%`,
        m.faltas,
        `${percentFaltas}%`,
        m.atestados,
        `${percentAtestadosSobreFaltas}%`,
        `${percentAtestadosSobreDias}%`,
        faltasSemAtestado,
        m.faltas >= 4
          ? 'ALERTA DE INFREQUÊNCIA'
          : m.frequenciaPercent === 100
          ? '100% PRESENÇA'
          : 'REGULAR',
        s.notes || '',
        s.filiacao1 || s.guardianName || '',
        s.filiacao2 || '',
        s.telefones || s.guardianPhone || '',
        s.emailMunicipal || '',
      ]);
    });
  });

  if (totalEstudantes > 0) {
    const mediaPresenca =
      totalDiasRecorte > 0 ? Math.round((totalPresencas / totalDiasRecorte) * 100) : 100;
    const mediaFaltas =
      totalDiasRecorte > 0 ? Math.round((totalFaltas / totalDiasRecorte) * 100) : 0;
    const mediaAtestadosSobreFaltas =
      totalFaltas > 0 ? Math.round((totalAtestados / totalFaltas) * 100) : 0;
    const mediaAtestadosSobreDias =
      totalDiasRecorte > 0 ? Math.round((totalAtestados / totalDiasRecorte) * 100) : 0;

    rows.push([
      `TOTAL CONSOLIDADO — ${stage}`,
      `${stageClasses.length} TURMAS`,
      'TODAS',
      'MANHÃ + TARDE',
      '—',
      totalEstudantes,
      `TOTAL: ${totalEstudantes} ESTUDANTES TABULADOS`,
      '—',
      '—',
      '—',
      '—',
      '—',
      'SOMA DO SEGMENTO',
      20,
      totalDiasRecorte,
      totalPresencas,
      `${mediaPresenca}%`,
      totalFaltas,
      `${mediaFaltas}%`,
      totalAtestados,
      `${mediaAtestadosSobreFaltas}%`,
      `${mediaAtestadosSobreDias}%`,
      totalSemAtestado,
      `FREQUÊNCIA MÉDIA: ${mediaPresenca}%`,
      '—',
      '—',
      '—',
      '—',
      '—',
    ]);
  }

  return rows;
};

const buildSedSheetValues = (
  classes: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): any[][] => {
  const rows: any[][] = [SED_48_HEADERS];

  classes.forEach((cls) => {
    const diasLetivosMes = cls.classesHeld || 20;
    const shortTurma = formatShortTurmaCode(cls.name);
    const periodo = cls.shift === 'Turno Manhã' ? 'MANHÃ' : 'TARDE';

    cls.students.forEach((s) => {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      rows.push([
        s.tipoEnsino ||
          (cls.name.startsWith('GRUPO') ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL'),
        s.serie || '1',
        s.number,
        s.name,
        s.ra || '',
        s.digRa || '',
        s.ufRa || 'SP',
        s.dataNascimento || '',
        s.tipoAlocacao || '',
        s.situacao === 'ATIVO' ? '' : s.situacao || '',
        s.dataMovimentacao || '',
        s.categoriaProfissionalCenso || '',
        s.deficiencia || '',
        s.posDataCenso || '',
        s.turma || shortTurma,
        s.periodo || periodo,
        s.dataMatriculaSed || '03/02/2026',
        s.procedenciaEscolar || '',
        s.irmaos || '',
        s.idade || '',
        s.arquivo || '',
        s.filiacao1 || s.guardianName || '',
        s.filiacao2 || '',
        s.nomeSocial || '',
        s.genero || '',
        s.tipoSanguineo || '',
        s.racaCor || '',
        s.nacionalidade || 'BRASILEIRA',
        s.paisOrigem || '',
        s.municipioNascimento || 'JUNDIAI - SP',
        s.cpf || '',
        s.rg || '',
        s.dataEmissaoRg || '',
        s.cartaoSus || '',
        s.nis || '',
        s.cep || '13.214-000',
        s.logradouro || '',
        s.numeroResidencia || '',
        s.complemento || '',
        s.bairro || '',
        s.cidade || 'JUNDIAI',
        s.uf || 'SP',
        s.telefones || s.guardianPhone || '',
        s.emailGoogle || '',
        s.emailMicrosoft || '',
        s.emailMunicipal || '',
        s.rotaOnibus || '',
        s.sucessaoEscolar || '',
        // Columns AW..BF (Attendance & Photo Link)
        m.diasLetivosMes,
        m.diasLetivosMatriculados,
        m.faltas,
        m.atestados,
        m.presencas,
        `${m.frequenciaPercent}%`,
        s.photoDriveUrl || '',
        s.notes || '',
        cls.id,
        s.id,
      ]);
    });
  });

  return rows;
};

const buildTurmasSheetValues = (
  classes: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): any[][] => {
  const headers = [
    'ID_TURMA',
    'TURMA',
    'CODIGO_SED',
    'TURNO',
    'ETAPA / SÉRIE',
    'SALA',
    'TOTAL ESTUDANTES',
    'DIAS LETIVOS MÊS ATUAL',
    'SOMA DIAS RECORTE MATRÍCULA',
    'FALTAS ACUMULADAS',
    'ATESTADOS APRESENTADOS',
    'PRESENÇAS ACUMULADAS',
    '% FREQUÊNCIA DA TURMA',
    'STATUS FECHAMENTO',
    'DIAS LETIVOS FEV',
    'DIAS LETIVOS MAR',
    'DIAS LETIVOS ABR',
    'DIAS LETIVOS MAI',
    'DIAS LETIVOS JUN',
    'DIAS LETIVOS JUL',
    'DIAS LETIVOS AGO',
    'DIAS LETIVOS SET',
    'DIAS LETIVOS OUT',
    'DIAS LETIVOS NOV',
    'DIAS LETIVOS DEZ',
    'TOTAL ANUAL DIAS LETIVOS (META 200)',
  ];

  const rows: any[][] = [headers];
  classes.forEach((c) => {
    const cm = getClassAttendanceMetrics(c, calendar);
    const monthlyCounts = MONTHLY_SCHOOL_DAYS_2027.map((m) =>
      c.monthlySchoolDays && typeof c.monthlySchoolDays[m.month] === 'number'
        ? c.monthlySchoolDays[m.month]
        : m.schoolDays
    );
    const totalAnual = monthlyCounts.reduce((acc, v) => acc + v, 0);

    rows.push([
      c.id,
      c.name,
      formatShortTurmaCode(c.name),
      c.shift,
      c.grade,
      c.room,
      c.totalStudents,
      cm.diasLetivosMes,
      cm.totalDiasMatriculadosTurma,
      cm.totalFaltasTurma,
      cm.totalAtestadosTurma,
      cm.totalPresencasTurma,
      `${cm.presenceRate}%`,
      c.isPending ? 'Pendente' : 'Concluído',
      ...monthlyCounts,
      totalAnual,
    ]);
  });
  return rows;
};

const buildCalendario200DiasValues = (
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): any[][] => {
  const rows: any[][] = [
    [
      'MÊS LETIVO',
      'NÚMERO DO MÊS',
      'DIAS LETIVOS OFICIAIS (META 200 DIAS)',
      'OBSERVAÇÃO / CALENDÁRIO SME JUNDIAÍ',
      '',
      'DATA (OUTUBRO)',
      'DIA DA SEMANA',
      'TIPO DO DIA',
      'DESCRIÇÃO OFICIAL',
    ],
  ];

  const maxLen = Math.max(MONTHLY_SCHOOL_DAYS_2027.length + 1, calendar.length);
  for (let i = 0; i < maxLen; i++) {
    const m = MONTHLY_SCHOOL_DAYS_2027[i];
    const isTotalRow = i === MONTHLY_SCHOOL_DAYS_2027.length;
    const d = calendar[i];

    const leftCols = m
      ? [
          m.month,
          m.monthNumber,
          m.schoolDays,
          'Aba Oficial de Alimentação dos 200 Dias Letivos',
        ]
      : isTotalRow
      ? ['TOTAL ANUAL OFICIAL', '', 200, 'SOMA EXATA = 200 DIAS LETIVOS (LDB / SME)']
      : ['', '', '', ''];

    const rightCols = d
      ? [
          d.date,
          d.dayOfWeek,
          d.type === 'dia_letivo'
            ? 'Dia Letivo'
            : d.type === 'sabado_letivo'
            ? 'Sábado Letivo'
            : d.type === 'feriado'
            ? 'Feriado'
            : 'Recesso',
          d.description,
        ]
      : ['', '', '', ''];

    rows.push([...leftCols, '', ...rightCols]);
  }

  return rows;
};

const buildOnibusFretadoSheetValues = (
  classes: ClassGroup[]
): any[][] => {
  const headers = [
    'Nº',
    'TURMA',
    'PERÍODO',
    'Nº CHAMADA',
    'ESTUDANTE (NOMINAL)',
    'RA',
    'ROTA DO ÔNIBUS FRETADO',
    'ENDEREÇO RESIDENCIAL',
    'BAIRRO',
    'TELEFONE / WHATSAPP',
    'RESPONSÁVEL (MÃE / PAI)',
    'ID_TURMA',
    'ID_ESTUDANTE',
  ];

  const rows: any[][] = [headers];
  let seq = 1;

  classes.forEach((cls) => {
    const periodo = cls.shift.replace('Turno ', '').toUpperCase();
    const sorted = [...cls.students].sort((a, b) => a.number - b.number);
    sorted.forEach((s) => {
      const rota = (s.rotaOnibus || '').trim();
      if (!rota) return;
      const endereco = [
        s.logradouro,
        s.numeroResidencia ? `nº ${s.numeroResidencia}` : '',
        s.complemento,
      ]
        .filter(Boolean)
        .join(' ');
      rows.push([
        seq++,
        cls.name,
        periodo,
        s.number,
        s.name,
        s.ra ? `${s.ra}-${s.digRa || ''}` : '',
        rota,
        endereco,
        s.bairro || '',
        s.telefones || s.guardianPhone || '',
        s.filiacao1 || s.guardianName || '',
        cls.id,
        s.id,
      ]);
    });
  });

  return rows;
};

const buildFaltasConsecutivasSheetValues = (
  classes: ClassGroup[]
): any[][] => {
  const headers = [
    'TURMA',
    'PERÍODO',
    'PROFESSOR(A) PEB I',
    'Nº CHAMADA',
    'ESTUDANTE',
    'RA',
    'DIAS DE FALTA CONSECUTIVA (3+ DIAS SEGUIDOS)',
    'QTD DIAS SEGUIDOS',
    'DATA DO AVISO PELO PEB I',
    'RESPONSÁVEL (MÃE / PAI)',
    'TELEFONE / WHATSAPP',
    'DEVOLUTIVA DA SECRETARIA / FEEDBACK DA FAMÍLIA',
    'DATA DA DEVOLUTIVA',
    'ID_TURMA',
    'ID_ESTUDANTE',
    'ID_OCORRENCIA',
    'SEQUÊNCIA NO ANO',
  ];

  const rows: any[][] = [headers];

  classes.forEach((cls) => {
    const periodo = cls.shift.replace('Turno ', '').toUpperCase();
    cls.students.forEach((s) => {
      const alert = s.consecutiveAbsenceAlert;
      if (!alert) return;

      const occurrences =
        alert.occurrences && alert.occurrences.length > 0
          ? alert.occurrences
          : alert.active || (alert.selectedDates && alert.selectedDates.length > 0) || alert.familyFeedback
          ? [
              {
                id: `${s.id}_occ_1`,
                sequenceNumber: 1,
                selectedDates: alert.selectedDates || [],
                reportedAt: alert.reportedAt || '',
                reportedByTeacher: alert.reportedByTeacher || cls.teacherName || 'PEB I',
                familyFeedback: alert.familyFeedback || '',
                feedbackUpdatedAt: alert.feedbackUpdatedAt || '',
              },
            ]
          : [];

      occurrences.forEach((occ, idx) => {
        const datesList = occ.selectedDates || [];
        if (datesList.length === 0 && !occ.familyFeedback) return;
        const seqNum = occ.sequenceNumber || idx + 1;

        rows.push([
          cls.name,
          periodo,
          occ.reportedByTeacher || cls.teacherName || 'PEB I',
          s.number,
          s.name,
          s.ra ? `${s.ra}-${s.digRa || ''}` : '',
          datesList.join(', '),
          datesList.length,
          occ.reportedAt || '',
          s.filiacao1 || s.guardianName || '',
          s.telefones || s.guardianPhone || '',
          occ.familyFeedback || '',
          occ.feedbackUpdatedAt || '',
          cls.id,
          s.id,
          occ.id || `${s.id}_occ_${seqNum}`,
          `${seqNum}ª Ocorrência`,
        ]);
      });
    });
  });

  return rows;
};

const buildEmailsPermitidosValues = (
  users?: AuthorizedUser[]
): any[][] => {
  const list = users || getStoredAuthorizedUsers();
  const headers = [
    'Nº',
    'E-MAIL INSTITUCIONAL PERMITIDO (GOOGLE WORKSPACE)',
    'NOME DO SERVIDOR / EDUCADOR',
    'NÍVEL DE ACESSO CONCEDIDO',
    'TURMA VINCULADA (LIMITE)',
    'STATUS DA CONTA',
    'DATA DE CADASTRO',
    'TOTAL DE ACESSOS',
    'TEMPO TOTAL DE USO',
    'TEMPO ÚLTIMA SESSÃO',
    'ÚLTIMO ACESSO (LOGIN)',
    'ÚLTIMA ATIVIDADE / PULSO',
    'ÚLTIMA TELA VISITADA',
    'IDS_TURMAS_VINCULADAS_SISTEMA',
    'TIMESTAMP_EDICAO_MS',
  ];
  const rows: any[][] = [headers];
  list.forEach((u, idx) => {
    const classIdsStr =
      u.role === 'usuario'
        ? u.assignedClassIds && u.assignedClassIds.length > 0
          ? u.assignedClassIds.join(',')
          : u.assignedClassId || 'g04a'
        : 'all';
    rows.push([
      idx + 1,
      u.email,
      u.name,
      u.role === 'admin'
        ? 'ADMIN (Acesso Pleno)'
        : u.role === 'usuario'
        ? 'PEB I (Limitado à Turma)'
        : 'PEB II (Somente Visualização)',
      u.assignedClassName,
      u.active ? 'AUTORIZADO' : 'BLOQUEADO',
      u.createdAt,
      u.totalAccessCount || 0,
      formatDurationHuman(u.totalDurationSeconds),
      formatDurationHuman(u.lastSessionDurationSeconds),
      u.lastLoginAt || 'Nunca acessou',
      u.lastActiveAt || '—',
      u.lastScreenVisited || '—',
      classIdsStr,
      u.updatedAtMs || 0,
    ]);
  });
  return rows;
};

const buildMonitoramentoAcessosValues = (
  logs?: UserAccessSessionLog[]
): any[][] => {
  const list = logs || getStoredAccessSessionLogs();
  const headers = [
    'Nº SESSÃO',
    'E-MAIL INSTITUCIONAL',
    'NOME DO SERVIDOR / EDUCADOR',
    'PERFIL',
    'TURMA VINCULADA',
    'DATA / HORA DE ENTRADA (LOGIN)',
    'ÚLTIMO PULSO / SAÍDA',
    'TEMPO DE ACESSO (FORMATADO)',
    'TEMPO DE ACESSO (SEGUNDOS)',
    'ÚLTIMA TELA',
    'STATUS DA SESSÃO',
  ];
  const rows: any[][] = [headers];
  list.forEach((l, idx) => {
    rows.push([
      idx + 1,
      l.email,
      l.name,
      l.role === 'admin' ? 'ADMIN' : l.role === 'usuario' ? 'PEB I' : 'PEB II',
      l.assignedClassName,
      new Date(l.loginTimeISO).toLocaleString('pt-BR'),
      new Date(l.logoutTimeISO || l.lastHeartbeatISO).toLocaleString('pt-BR'),
      formatDurationHuman(l.durationSeconds),
      l.durationSeconds,
      l.lastScreen || 'Turmas',
      l.logoutTimeISO ? 'Encerrada' : 'Ativa / Recente',
    ]);
  });
  return rows;
};

export const ensureOfficialSpreadsheetId = async (): Promise<string> => {
  const saved = getSavedSpreadsheetInfo();
  if (saved.spreadsheetId) return saved.spreadsheetId;

  const token = await getAccessToken();
  if (!token) return '';

  try {
    const sheetQuery = encodeURIComponent(
      `name = '${OFFICIAL_SPREADSHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
    );
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${sheetQuery}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        const foundId = data.files[0].id;
        saveSpreadsheetInfo(foundId, data.files[0].name || OFFICIAL_SPREADSHEET_TITLE);
        return foundId;
      }
    }
  } catch (e) {
    console.warn('Auto-descoberta da planilha oficial:', e);
  }
  return '';
};

export const syncAuthorizedUsersToGoogleSheet = async (
  users?: AuthorizedUser[],
  sessionLogs?: UserAccessSessionLog[]
): Promise<void> => {
  const token = await getAccessToken();
  if (!token) return;
  const spreadsheetId = await ensureOfficialSpreadsheetId();
  if (!spreadsheetId) return;

  try {
    const meta = await fetchSpreadsheetMetadata(spreadsheetId);
    const missingTabs: any[] = [];
    ['Emails_Permitidos_2027', 'Monitoramento_Acessos_2027'].forEach((tName) => {
      if (!meta.sheetTitles.includes(tName)) {
        missingTabs.push({
          addSheet: {
            properties: {
              title: tName,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        });
      }
    });

    if (missingTabs.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: missingTabs }),
        }
      );
    }

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: 'Emails_Permitidos_2027!A1',
              values: buildEmailsPermitidosValues(users),
            },
            {
              range: 'Monitoramento_Acessos_2027!A1',
              values: buildMonitoramentoAcessosValues(sessionLogs),
            },
          ],
        }),
      }
    );
  } catch (e) {
    console.warn('Aviso ao sincronizar abas de acessos e monitoramento:', e);
  }
};

export const readAuthorizedUsersFromGoogleSheet = async (
  currentUsers: AuthorizedUser[],
  classes: ClassGroup[]
): Promise<AuthorizedUser[] | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  const spreadsheetId = await ensureOfficialSpreadsheetId();
  if (!spreadsheetId) return null;

  try {
    const meta = await fetchSpreadsheetMetadata(spreadsheetId);
    if (!meta.sheetTitles.includes('Emails_Permitidos_2027')) return null;

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent('Emails_Permitidos_2027!A2:O500')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows: any[][] = data.values || [];
    if (rows.length === 0) return null;

    const parseDurationToSeconds = (str: string): number => {
      const clean = String(str || '').trim();
      if (!clean || clean === '0s' || clean === '—') return 0;
      let total = 0;
      const hMatch = clean.match(/(\d+)\s*h/i);
      const mMatch = clean.match(/(\d+)\s*m/i);
      const sMatch = clean.match(/(\d+)\s*s/i);
      if (hMatch) total += parseInt(hMatch[1], 10) * 3600;
      if (mMatch) total += parseInt(mMatch[1], 10) * 60;
      if (sMatch) total += parseInt(sMatch[1], 10);
      return total;
    };

    const existingMap = new Map<string, AuthorizedUser>();
    currentUsers.forEach((u) => {
      existingMap.set(u.email.trim().toLowerCase(), u);
    });

    const parsedUsers: AuthorizedUser[] = [];
    rows.forEach((r, idx) => {
      const email = String(r[1] || '')
        .trim()
        .toLowerCase();
      if (!email || !email.includes('@')) return;

      const name = String(r[2] || '').trim() || email.split('@')[0];
      const roleStr = String(r[3] || '')
        .trim()
        .toUpperCase();
      const turmaStr = String(r[4] || '').trim();
      const statusStr = String(r[5] || '')
        .trim()
        .toUpperCase();
      const createdAt = String(r[6] || '03/02/2027').trim();

      const prev = existingMap.get(email);
      const sheetUpdatedAtMs = parseInt(String(r[14] || '0'), 10) || 0;
      const localUpdatedAtMs = prev?.updatedAtMs || 0;
      // Preserve local Admin changes whenever localUpdatedAtMs >= sheetUpdatedAtMs and localUpdatedAtMs > 0
      const preferLocalConfig =
        localUpdatedAtMs > 0 && localUpdatedAtMs >= sheetUpdatedAtMs;

      const sheetRole: UserRole = roleStr.includes('ADMIN')
        ? 'admin'
        : roleStr.includes('PEB II') || roleStr.includes('VISUALIZA')
        ? 'peb2'
        : 'usuario';

      const role: UserRole = preferLocalConfig && prev ? prev.role : sheetRole;

      let assignedClassIds: string[] = [];
      let assignedClassNames: string[] = [];
      let assignedClassId = prev?.assignedClassId || 'g04a';
      let assignedClassName =
        (preferLocalConfig && prev?.assignedClassName) ||
        turmaStr ||
        prev?.assignedClassName ||
        'GRUPO 04 A (Manhã)';

      if (role === 'usuario') {
        if (preferLocalConfig && prev) {
          const rawIds =
            prev.assignedClassIds && prev.assignedClassIds.length > 0
              ? prev.assignedClassIds
              : prev.assignedClassId && prev.assignedClassId !== 'all'
              ? [prev.assignedClassId]
              : ['g04a'];
          const matchedClasses = rawIds
            .map((id) => classes.find((c) => c.id === id))
            .filter((c): c is ClassGroup => Boolean(c));
          if (matchedClasses.length > 0) {
            assignedClassIds = matchedClasses.map((c) => c.id);
            assignedClassNames = matchedClasses.map(
              (c) => `${c.name} (${c.shift.replace('Turno ', '')})`
            );
            assignedClassId = assignedClassIds[0];
            assignedClassName = assignedClassNames.join(' + ');
          }
        } else {
          const rawClassIdsCol = String(r[13] || '').trim();
          const candidateTokens = rawClassIdsCol
            ? rawClassIdsCol
                .split(/[,;+|]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : turmaStr
                .split(/[+;,]/)
                .map((s) => s.trim())
                .filter(Boolean);

          const matchedClasses: ClassGroup[] = [];
          candidateTokens.forEach((tok) => {
            const cleanTok = tok.toUpperCase();
            const found = classes.find((c) => {
              const cleanName = c.name.toUpperCase();
              return (
                c.id.toLowerCase() === tok.toLowerCase() ||
                cleanTok.startsWith(cleanName) ||
                cleanTok === cleanName
              );
            });
            if (found && !matchedClasses.some((m) => m.id === found.id)) {
              matchedClasses.push(found);
            }
          });

          if (matchedClasses.length > 0) {
            assignedClassIds = matchedClasses.map((c) => c.id);
            assignedClassNames = matchedClasses.map(
              (c) => `${c.name} (${c.shift.replace('Turno ', '')})`
            );
            assignedClassId = assignedClassIds[0];
            assignedClassName = assignedClassNames.join(' + ');
          } else if (prev?.assignedClassIds && prev.assignedClassIds.length > 0) {
            assignedClassIds = prev.assignedClassIds;
            assignedClassNames = prev.assignedClassNames || [prev.assignedClassName];
            assignedClassId = prev.assignedClassId;
            assignedClassName = prev.assignedClassName;
          }
        }
      } else {
        assignedClassId = 'all';
        assignedClassIds = ['all'];
        assignedClassName =
          role === 'admin'
            ? 'Todas as 40 Turmas (Acesso Pleno)'
            : 'Todas as Turmas (Somente Visualização)';
        assignedClassNames = [assignedClassName];
      }

      const sheetAccessCount = parseInt(String(r[7] || ''), 10) || 0;
      const sheetTotalSecs = parseDurationToSeconds(String(r[8] || ''));
      const sheetLastSecs = parseDurationToSeconds(String(r[9] || ''));

      parsedUsers.push({
        id: prev?.id || `usr-sheet-${idx + 1}`,
        email,
        name: (preferLocalConfig && prev?.name) || name,
        role,
        assignedClassId,
        assignedClassName,
        assignedClassIds,
        assignedClassNames,
        active: preferLocalConfig && prev ? prev.active : !statusStr.includes('BLOQUEADO'),
        createdAt,
        updatedAtMs: Math.max(localUpdatedAtMs, sheetUpdatedAtMs),
        totalAccessCount: Math.max(sheetAccessCount, prev?.totalAccessCount || 0),
        totalDurationSeconds: Math.max(
          sheetTotalSecs,
          prev?.totalDurationSeconds || 0
        ),
        lastSessionDurationSeconds: Math.max(
          sheetLastSecs,
          prev?.lastSessionDurationSeconds || 0
        ),
        lastLoginAt:
          prev?.lastLoginAt ||
          (String(r[10] || '').trim() !== 'Nunca acessou'
            ? String(r[10] || '').trim()
            : undefined),
        lastActiveAt:
          prev?.lastActiveAt ||
          (String(r[11] || '').trim() !== '—' ? String(r[11] || '').trim() : undefined),
        lastScreenVisited:
          prev?.lastScreenVisited ||
          (String(r[12] || '').trim() !== '—' ? String(r[12] || '').trim() : undefined),
      });
    });

    return parsedUsers.length > 0 ? parsedUsers : null;
  } catch (e) {
    console.warn('Aviso ao ler Emails_Permitidos_2027:', e);
    return null;
  }
};

export const readSessionLogsFromGoogleSheet = async (): Promise<
  UserAccessSessionLog[] | null
> => {
  const token = await getAccessToken();
  if (!token) return null;
  const spreadsheetId = await ensureOfficialSpreadsheetId();
  if (!spreadsheetId) return null;

  try {
    const meta = await fetchSpreadsheetMetadata(spreadsheetId);
    if (!meta.sheetTitles.includes('Monitoramento_Acessos_2027')) return null;

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent('Monitoramento_Acessos_2027!A2:K300')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows: any[][] = data.values || [];
    if (rows.length === 0) return null;

    const logs: UserAccessSessionLog[] = [];
    rows.forEach((r, idx) => {
      const email = String(r[1] || '').trim().toLowerCase();
      if (!email) return;
      const name = String(r[2] || '').trim() || email;
      const roleStr = String(r[3] || '').toUpperCase();
      const role: UserRole = roleStr.includes('ADMIN')
        ? 'admin'
        : roleStr.includes('PEB II')
        ? 'peb2'
        : 'usuario';
      const assignedClassName = String(r[4] || '').trim();
      const durationSeconds = parseInt(String(r[7] || '0'), 10) || 0;
      const lastScreen = String(r[8] || '1. Turmas').trim();
      const statusStr = String(r[9] || '').toUpperCase();
      const isOnlineNow = statusStr.includes('ATIVA') || statusStr.includes('ONLINE');

      logs.push({
        id: `sheet-log-${idx + 1}-${email}`,
        email,
        name,
        role,
        assignedClassName,
        loginTimeISO: new Date().toISOString(),
        lastHeartbeatISO: new Date().toISOString(),
        logoutTimeISO: isOnlineNow ? undefined : new Date().toISOString(),
        durationSeconds,
        lastScreen,
        isOnlineNow,
      });
    });

    return logs.length > 0 ? logs : null;
  } catch {
    return null;
  }
};

/**
 * Ensures a SINGLE UNIQUE Folder in Google Drive (`application/vnd.google-apps.folder`).
 */
export const createRealPhotosFolderInDrive = async (): Promise<{
  folderId: string;
  folderUrl: string;
  folderName: string;
  alreadyExisted: boolean;
}> => {
  savePhotosDriveFolderUrl(OFFICIAL_PHOTOS_FOLDER_URL, OFFICIAL_PHOTOS_FOLDER_ID);
  return {
    folderId: OFFICIAL_PHOTOS_FOLDER_ID,
    folderUrl: OFFICIAL_PHOTOS_FOLDER_URL,
    folderName: OFFICIAL_FOLDER_NAME,
    alreadyExisted: true,
  };
};

// Cache for all discovered Photo files in the Fotos Estudantes Drive folder (1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn)
const DISCOVERED_PHOTOS_STORAGE_KEY = 'emeb_candelario_discovered_drive_photos_2027_v1';

export interface DiscoveredDrivePhotoFile {
  id: string;
  name: string;
  normName: string;
  coreName: string;
  subfolderName: string;
  photoUrl: string;
  driveLink: string;
}

let inMemoryDrivePhotosCache: DiscoveredDrivePhotoFile[] | null = null;

export const getStoredDiscoveredDrivePhotos = (): DiscoveredDrivePhotoFile[] => {
  try {
    const raw = localStorage.getItem(DISCOVERED_PHOTOS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DiscoveredDrivePhotoFile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryDrivePhotosCache = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore read error
  }
  return inMemoryDrivePhotosCache || [];
};

export const saveStoredDiscoveredDrivePhotos = (
  files: DiscoveredDrivePhotoFile[]
): void => {
  inMemoryDrivePhotosCache = files;
  try {
    localStorage.setItem(DISCOVERED_PHOTOS_STORAGE_KEY, JSON.stringify(files));
    const { folderId, folderUrl } = getSavedPhotosDriveFolderInfo();
    pushCloudLinksToServer(
      {
        photosFolderId: folderId,
        photosFolderUrl: folderUrl,
      },
      undefined,
      files
    );
  } catch {
    // ignore storage quota
  }
};

export const findPhotoInDiscoveredCache = (
  studentName?: string,
  ra?: string,
  className?: string
): { photoUrl: string; driveLink: string } | undefined => {
  if (!studentName) return undefined;
  const cached = getStoredDiscoveredDrivePhotos();
  if (!cached || cached.length === 0) return undefined;

  const normName = normalizeStudentNameForPhoto(studentName);
  const coreName = normalizeStudentNameCoreTokens(studentName);
  if (!normName) return undefined;

  if (className) {
    const shortTurma = formatShortTurmaCode(className).toUpperCase();
    const upperClassName = className.toUpperCase();
    const inClass = cached.find((c) => {
      if (c.normName !== normName && (!coreName || c.coreName !== coreName)) return false;
      const subUp = (c.subfolderName || '').toUpperCase();
      return subUp.includes(upperClassName) || subUp.includes(shortTurma);
    });
    if (inClass) return { photoUrl: inClass.photoUrl, driveLink: inClass.driveLink };
  }

  const exact = cached.find((c) => c.normName === normName);
  if (exact) return { photoUrl: exact.photoUrl, driveLink: exact.driveLink };

  if (coreName) {
    const byCore = cached.find((c) => c.coreName === coreName);
    if (byCore) return { photoUrl: byCore.photoUrl, driveLink: byCore.driveLink };
  }

  const cleanRa = (ra || '').replace(/\D/g, '');
  if (cleanRa && cleanRa.length >= 6) {
    const byRa = cached.find(
      (c) => c.normName === cleanRa || c.normName.includes(cleanRa)
    );
    if (byRa) return { photoUrl: byRa.photoUrl, driveLink: byRa.driveLink };
  }

  if (coreName.length >= 6) {
    const studentTokens = coreName.split(' ').filter(Boolean);
    if (studentTokens.length >= 2) {
      const prefixMatches = cached.filter((c) => {
        if (!c.coreName || c.coreName.length < 6) return false;
        const fileTokens = c.coreName.split(' ').filter(Boolean);
        if (fileTokens.length < 2) return false;
        if (studentTokens[0] !== fileTokens[0]) return false;
        if (
          c.coreName.startsWith(coreName) ||
          coreName.startsWith(c.coreName)
        ) {
          return true;
        }
        const sameLast =
          studentTokens[studentTokens.length - 1] ===
          fileTokens[fileTokens.length - 1];
        const sameSecond = studentTokens[1] === fileTokens[1];
        if (sameLast && sameSecond) return true;
        // Also match if all tokens in the loose photo filename exist in the student's full name in order (e.g., "ALICE PIRES.jpg" -> "ALICE DE BARROS PIRES")
        if (
          sameLast &&
          fileTokens.every((ft) => studentTokens.includes(ft))
        ) {
          return true;
        }
        return false;
      });
      if (prefixMatches.length === 1) {
        return {
          photoUrl: prefixMatches[0].photoUrl,
          driveLink: prefixMatches[0].driveLink,
        };
      }
    }
  }

  return undefined;
};

/**
 * Sync student photos dropped into the Google Drive Folder (and any class subfolders inside it)!
 * Supports:
 * - Official Folder: Dados 2025 > Fotos Estudantes (1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn)
 * - Subfolders inside the main Photos folder (e.g., GRUPO 04 A, 1º ANO A, etc.)
 * - Full pagination (nextPageToken) for 1000+ students
 * - Shared Drives (supportsAllDrives & includeItemsFromAllDrives)
 * - Global search fallback for images shared from external folders
 */
export const attachPhotosFromDiscoveredCache = (
  currentClasses: ClassGroup[]
): ClassGroup[] => {
  const cachedList = getStoredDiscoveredDrivePhotos();
  if (!cachedList || cachedList.length === 0) return currentClasses;

  return currentClasses.map((cls) => ({
    ...cls,
    students: cls.students.map((s) => {
      const hit = findPhotoInDiscoveredCache(
        s.estudante || s.name,
        s.ra,
        cls.name
      );
      if (hit) {
        return {
          ...s,
          photo:
            s.photo && s.photo.startsWith('data:image')
              ? s.photo
              : hit.photoUrl,
          photoDriveUrl: hit.driveLink || s.photoDriveUrl,
        };
      }
      return s;
    }),
  }));
};

export const attachNominalPdfsFromDiscoveredCache = (
  currentClasses: ClassGroup[]
): ClassGroup[] => {
  const cachedList = getStoredDiscoveredNominalPdfs();
  if (!cachedList || cachedList.length === 0) return currentClasses;

  const activePdfs = cachedList.filter((p) => {
    const up = (p.subfolderName || '').toUpperCase();
    return (
      !up.includes('INATIVO') &&
      !up.includes('DUPLICATA') &&
      !up.includes('ARQUIVAD')
    );
  });

  return currentClasses.map((cls) => {
    const shortTurma = formatShortTurmaCode(cls.name).toUpperCase();
    const upperClassName = cls.name.toUpperCase();

    return {
      ...cls,
      students: cls.students.map((s) => {
        if (s.fichaPdfDriveId && s.fichaPdfDriveUrl) return s;
        const normStudent = normalizeStudentNameForPhoto(
          s.estudante || s.name
        );
        if (!normStudent) return s;

        const exactInClass = activePdfs.find((p) => {
          if (p.normalizedStudentName !== normStudent) return false;
          const subUp = (p.subfolderName || '').toUpperCase();
          return subUp.includes(upperClassName) || subUp.includes(shortTurma);
        });
        const hit =
          exactInClass ||
          activePdfs.find((p) => p.normalizedStudentName === normStudent);

        if (hit) {
          return {
            ...s,
            fichaPdfDriveId: hit.id,
            fichaPdfDriveUrl: hit.webViewLink,
            fichaPdfSubfolder: hit.subfolderName,
          };
        }
        return s;
      }),
    };
  });
};

export const syncPhotosFromDriveFolder = async (
  currentClasses: ClassGroup[]
): Promise<{
  updatedClasses: ClassGroup[];
  matchedPhotosCount: number;
  totalDriveImagesFound: number;
}> => {
  const token = await getAccessToken();
  if (!token) {
    // Even if not currently holding an OAuth token in memory, apply any previously discovered Drive photos from cache!
    const cachedList = getStoredDiscoveredDrivePhotos();
    if (cachedList.length > 0) {
      let cachedMatched = 0;
      const hydrated = currentClasses.map((cls) => ({
        ...cls,
        students: cls.students.map((s) => {
          const hit = findPhotoInDiscoveredCache(
            s.estudante || s.name,
            s.ra,
            cls.name
          );
          if (hit) {
            cachedMatched++;
            return {
              ...s,
              photo: hit.photoUrl,
              photoDriveUrl: hit.driveLink,
            };
          }
          return s;
        }),
      }));
      return {
        updatedClasses: hydrated,
        matchedPhotosCount: cachedMatched,
        totalDriveImagesFound: cachedList.length,
      };
    }
    return {
      updatedClasses: currentClasses,
      matchedPhotosCount: 0,
      totalDriveImagesFound: 0,
    };
  }

  const { folderId } = getSavedPhotosDriveFolderInfo();
  const targetFolderId = folderId || OFFICIAL_PHOTOS_FOLDER_ID;

  // Helper to fetch all pages of Drive files for a given query
  const fetchAllDriveFiles = async (
    rawQuery: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      parents?: string[];
      webViewLink?: string;
      thumbnailLink?: string;
    }>
  > => {
    const all: Array<{
      id: string;
      name: string;
      parents?: string[];
      webViewLink?: string;
      thumbnailLink?: string;
    }> = [];
    let pageToken = '';
    let pageGuard = 0;

    do {
      pageGuard++;
      const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        rawQuery
      )}&fields=nextPageToken,files(id,name,parents,mimeType,shortcutDetails,webViewLink,thumbnailLink)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${tokenParam}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) break;
      const data = await res.json();
      if (Array.isArray(data.files)) {
        all.push(...data.files);
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken && pageGuard < 5);

    return all;
  };

  const subfolderMap = new Map<string, string>(); // folderId -> folderName
  if (targetFolderId) {
    subfolderMap.set(targetFolderId, OFFICIAL_FOLDER_NAME);
    // Discover any class subfolders inside the Photos folder (up to 2 levels)
    try {
      const subFolders = await fetchAllDriveFiles(
        `'${targetFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      subFolders.forEach((sf) => subfolderMap.set(sf.id, sf.name));

      if (subFolders.length > 0) {
        const subIds = subFolders.slice(0, 25).map((sf) => `'${sf.id}' in parents`).join(' or ');
        const nestedSub = await fetchAllDriveFiles(
          `(${subIds}) and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        );
        nestedSub.forEach((nf) => subfolderMap.set(nf.id, nf.name));
      }
    } catch {
      // ignore subfolder discovery error
    }
  }

  let driveFiles: Array<{
    id: string;
    name: string;
    parents?: string[];
    mimeType?: string;
    shortcutDetails?: { targetId?: string; targetMimeType?: string };
    webViewLink?: string;
    thumbnailLink?: string;
  }> = [];

  // 1. Direct query for ALL loose files inside the root Photos folder (and any subfolders if present)
  // Does not restrict by mimeType in the Drive query so loose .jpg/.png/.heic/.webp files uploaded as application/octet-stream or shortcuts are 100% captured!
  if (targetFolderId) {
    const allFolderIds = Array.from(subfolderMap.keys());
    const chunkSize = 20;
    for (let i = 0; i < allFolderIds.length; i += chunkSize) {
      const chunk = allFolderIds.slice(i, i + chunkSize);
      const parentsClause = chunk.map((id) => `'${id}' in parents`).join(' or ');
      const chunkFiles = await fetchAllDriveFiles(
        `(${parentsClause}) and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
      );
      driveFiles.push(...chunkFiles);
    }
  }

  // 2. Also query general accessible image files in Drive so any loose student photo shared directly is indexed
  try {
    const generalImages = await fetchAllDriveFiles(
      `mimeType contains 'image/' and trashed = false`
    );
    driveFiles.push(...generalImages);
  } catch {
    // ignore fallback error
  }

  // Filter out PDFs/Spreadsheets/Docs while keeping all loose image files or image filenames
  const validPhotoFiles = driveFiles.filter((f) => {
    const mt = (f.mimeType || '').toLowerCase();
    if (
      mt.includes('pdf') ||
      mt.includes('spreadsheet') ||
      mt.includes('document') ||
      mt.includes('presentation') ||
      mt.includes('folder')
    ) {
      return false;
    }
    if (mt.startsWith('image/')) return true;
    if (/\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|avif|tif|tiff)$/i.test(f.name)) {
      return true;
    }
    // If the file is directly inside the target Photos folder, treat it as a loose student photo
    if (targetFolderId && f.parents?.includes(targetFolderId)) {
      return true;
    }
    return false;
  });

  // Deduplicate by file id (preferring files directly inside targetFolderId)
  const uniqueFilesMap = new Map<string, (typeof validPhotoFiles)[number]>();
  validPhotoFiles.forEach((f) => {
    const resolvedId = f.shortcutDetails?.targetId || f.id;
    if (!uniqueFilesMap.has(resolvedId) || f.parents?.includes(targetFolderId)) {
      uniqueFilesMap.set(resolvedId, { ...f, id: resolvedId });
    }
  });
  const uniqueDriveFiles = Array.from(uniqueFilesMap.values());

  const candidates: DiscoveredDrivePhotoFile[] = [];
  const exactMap = new Map<string, DiscoveredDrivePhotoFile>();
  const coreMap = new Map<string, DiscoveredDrivePhotoFile>();

  uniqueDriveFiles.forEach((f) => {
    const norm = normalizeStudentNameForPhoto(f.name);
    if (!norm) return;
    const core = normalizeStudentNameCoreTokens(f.name);
    const parentId = f.parents?.[0] || '';
    const subfolderName = subfolderMap.get(parentId) || '';
    const photoUrl = toEmbeddableDrivePhotoUrl(f.id, f.thumbnailLink);
    const driveLink =
      f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;

    const item: DiscoveredDrivePhotoFile = {
      id: f.id,
      name: f.name,
      normName: norm,
      coreName: core,
      subfolderName,
      photoUrl,
      driveLink,
    };
    candidates.push(item);
    // Prioritize files that are inside the official Photos folder (`subfolderName` present)
    if (!exactMap.has(norm) || subfolderName) {
      exactMap.set(norm, item);
    }
    if (core && (!coreMap.has(core) || subfolderName)) {
      coreMap.set(core, item);
    }
  });

  if (candidates.length > 0) {
    saveStoredDiscoveredDrivePhotos(candidates);
  }

  const findBestPhotoForStudent = (
    s: Student,
    className: string
  ): DiscoveredDrivePhotoFile | undefined => {
    const normName = normalizeStudentNameForPhoto(s.estudante || s.name);
    const coreName = normalizeStudentNameCoreTokens(s.estudante || s.name);
    const normSocial = s.nomeSocial ? normalizeStudentNameForPhoto(s.nomeSocial) : '';
    const shortTurma = formatShortTurmaCode(className).toUpperCase();
    const upperClassName = className.toUpperCase();

    // 1. Exact match inside the student's own class subfolder (if organized by subfolders)
    const exactInClass = candidates.find((c) => {
      if (c.normName !== normName && (! coreName || c.coreName !== coreName)) return false;
      const subUp = c.subfolderName.toUpperCase();
      return subUp.includes(upperClassName) || subUp.includes(shortTurma);
    });
    if (exactInClass) return exactInClass;

    // 2. Exact normalized name match
    const exact = exactMap.get(normName);
    if (exact) return exact;

    // 3. Particle-insensitive match (ignores DE, DA, DO, DOS, DAS, E differences)
    if (coreName && coreMap.has(coreName)) {
      return coreMap.get(coreName);
    }

    // 4. Social Name (Nome Social) match
    if (normSocial && exactMap.has(normSocial)) {
      return exactMap.get(normSocial);
    }

    // 5. RA match (e.g. photo named with RA number or "RA - NOME.jpg")
    const cleanRa = (s.ra || '').replace(/\D/g, '');
    if (cleanRa && cleanRa.length >= 6) {
      const byRa = candidates.find(
        (c) => c.normName === cleanRa || c.normName.includes(cleanRa)
      );
      if (byRa) return byRa;
    }

    // 6. Prefix / First+Last token match when a middle name was omitted or truncated in loose filename
    if (coreName.length >= 6) {
      const studentTokens = coreName.split(' ').filter(Boolean);
      if (studentTokens.length >= 2) {
        const prefixMatches = candidates.filter((c) => {
          if (!c.coreName || c.coreName.length < 6) return false;
          const fileTokens = c.coreName.split(' ').filter(Boolean);
          if (fileTokens.length < 2) return false;
          // First name must match exactly
          if (studentTokens[0] !== fileTokens[0]) return false;
          // Either one is a prefix of the other, or first + second + last tokens match
          if (
            c.coreName.startsWith(coreName) ||
            coreName.startsWith(c.coreName)
          ) {
            return true;
          }
          const sameLast =
            studentTokens[studentTokens.length - 1] ===
            fileTokens[fileTokens.length - 1];
          const sameSecond = studentTokens[1] === fileTokens[1];
          if (sameLast && sameSecond) return true;
          if (
            sameLast &&
            fileTokens.every((ft) => studentTokens.includes(ft))
          ) {
            return true;
          }
          return false;
        });
        if (prefixMatches.length === 1) {
          return prefixMatches[0];
        }
      }
    }

    return undefined;
  };

  let matchedPhotosCount = 0;

  const updatedClasses = currentClasses.map((cls) => {
    const updatedStudents = cls.students.map((s) => {
      const matched = findBestPhotoForStudent(s, cls.name);

      if (matched) {
        matchedPhotosCount++;
        return {
          ...s,
          photo: matched.photoUrl,
          photoDriveUrl: matched.driveLink,
        };
      }

      // If student already has a photoDriveUrl in the spreadsheet (Col BC) but no `photo` thumbnail yet, derive it automatically!
      if (!s.photo && s.photoDriveUrl) {
        const derived = toEmbeddableDrivePhotoUrl(s.photoDriveUrl);
        if (derived) {
          matchedPhotosCount++;
          return {
            ...s,
            photo: derived,
          };
        }
      }

      return s;
    });

    return {
      ...cls,
      students: updatedStudents,
    };
  });

  return {
    updatedClasses,
    matchedPhotosCount,
    totalDriveImagesFound: uniqueDriveFiles.length,
  };
};

// Cache for all discovered PDF files in the Fichas Informativas Drive folder + subfolders
const DISCOVERED_PDFS_STORAGE_KEY = 'emeb_candelario_discovered_nominal_pdfs_2027_v1';

export const getStoredDiscoveredNominalPdfs = (): DriveNominalPdfFile[] => {
  try {
    const raw = localStorage.getItem(DISCOVERED_PDFS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DriveNominalPdfFile[];
  } catch {
    return [];
  }
};

export const saveStoredDiscoveredNominalPdfs = (files: DriveNominalPdfFile[]): void => {
  try {
    localStorage.setItem(DISCOVERED_PDFS_STORAGE_KEY, JSON.stringify(files));
    pushCloudLinksToServer(
      {
        fichasPdfFolderId: getSavedFichasPdfDriveFolderInfo().folderId,
        fichasPdfFolderUrl: getSavedFichasPdfDriveFolderInfo().folderUrl,
      },
      files
    );
  } catch {
    // ignore storage quota
  }
};

/**
 * Recursively scans the official "Fichas Informativas" Google Drive folder
 * (default ID: 1GDEdQuNfhc0vps4mZXv4LLv4kDLZnauJ) and all its subfolders
 * (GRUPO 04 A, GRUPO 04 B, ..., 1º ANO A, ..., 5º ANO C, INATIVOS, etc.)
 * to locate nominal PDF documents and automatically attach them to each Student!
 */
export const syncNominalPdfsFromDriveSubfolders = async (
  currentClasses: ClassGroup[],
  customRootFolderId?: string
): Promise<{
  updatedClasses: ClassGroup[];
  matchedPdfsCount: number;
  totalPdfFilesFound: number;
  subfoldersScannedCount: number;
  discoveredPdfs: DriveNominalPdfFile[];
}> => {
  const token = await getAccessToken();
  if (!token) {
    return {
      updatedClasses: currentClasses,
      matchedPdfsCount: 0,
      totalPdfFilesFound: 0,
      subfoldersScannedCount: 0,
      discoveredPdfs: getStoredDiscoveredNominalPdfs(),
    };
  }

  const rootFolderId =
    customRootFolderId?.trim() || getSavedFichasPdfDriveFolderInfo().folderId;

  // 1. List all immediate subfolders inside the Fichas Informativas root folder (e.g., GRUPO 04 A, 1º ANO A, INATIVOS...)
  const qSubfolders = encodeURIComponent(
    `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const subRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${qSubfolders}&fields=files(id,name)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const subfolderMap = new Map<string, string>(); // folderId -> folderName
  subfolderMap.set(rootFolderId, 'Pasta Raiz (Fichas Informativas)');

  if (subRes.ok) {
    const subData = await subRes.json();
    const folders: Array<{ id: string; name: string }> = subData.files || [];
    folders.forEach((f) => {
      subfolderMap.set(f.id, f.name);
    });

    // Also check if any subfolder has nested subfolders (e.g. INATIVOS -> DUPLICATAS_ARQUIVADAS)
    const parentIds = folders.map((f) => f.id);
    if (parentIds.length > 0) {
      const chunked = parentIds.slice(0, 25);
      const qNested = encodeURIComponent(
        `(${chunked.map((id) => `'${id}' in parents`).join(' or ')}) and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      const nestedRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${qNested}&fields=files(id,name,parents)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (nestedRes.ok) {
        const nestedData = await nestedRes.json();
        (nestedData.files || []).forEach((nf: { id: string; name: string; parents?: string[] }) => {
          const parentName = (nf.parents && subfolderMap.get(nf.parents[0])) || '';
          subfolderMap.set(nf.id, parentName ? `${parentName} / ${nf.name}` : nf.name);
        });
      }
    }
  }

  // 2. Query all PDF files inside rootFolderId or any of its discovered subfolders
  const allFolderIds = Array.from(subfolderMap.keys());
  const discoveredPdfs: DriveNominalPdfFile[] = [];

  // Query in chunks of 20 parent folders so the Drive query length stays well within limits
  const chunkSize = 20;
  for (let i = 0; i < allFolderIds.length; i += chunkSize) {
    const chunk = allFolderIds.slice(i, i + chunkSize);
    const parentsClause = chunk.map((id) => `'${id}' in parents`).join(' or ');
    const qPdfs = encodeURIComponent(
      `(${parentsClause}) and mimeType = 'application/pdf' and trashed = false`
    );

    const pdfRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${qPdfs}&fields=files(id,name,parents,webViewLink,thumbnailLink,modifiedTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (pdfRes.ok) {
      const pdfData = await pdfRes.json();
      const files: Array<{
        id: string;
        name: string;
        parents?: string[];
        webViewLink?: string;
        thumbnailLink?: string;
        modifiedTime?: string;
      }> = pdfData.files || [];

      files.forEach((f) => {
        const parentId = f.parents?.[0] || rootFolderId;
        const subfolderName = subfolderMap.get(parentId) || 'Fichas Informativas';
        const normName = normalizeStudentNameForPhoto(f.name);
        discoveredPdfs.push({
          id: f.id,
          name: f.name,
          normalizedStudentName: normName,
          subfolderName,
          subfolderId: parentId,
          webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          embedPreviewUrl: `https://drive.google.com/file/d/${f.id}/preview`,
          thumbnailLink: f.thumbnailLink,
          modifiedTime: f.modifiedTime,
        });
      });
    }
  }

  // Fallback: if no PDFs were found via parent filter (e.g., shared items), query accessible PDFs in Drive
  if (discoveredPdfs.length === 0) {
    const qFallbackPdfs = encodeURIComponent(
      `mimeType = 'application/pdf' and trashed = false`
    );
    const fallbackRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${qFallbackPdfs}&fields=files(id,name,parents,webViewLink,thumbnailLink,modifiedTime)&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      (fbData.files || []).forEach((f: any) => {
        const parentId = f.parents?.[0] || rootFolderId;
        const subfolderName = subfolderMap.get(parentId) || 'Fichas Informativas (Drive)';
        discoveredPdfs.push({
          id: f.id,
          name: f.name,
          normalizedStudentName: normalizeStudentNameForPhoto(f.name),
          subfolderName,
          subfolderId: parentId,
          webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          embedPreviewUrl: `https://drive.google.com/file/d/${f.id}/preview`,
          thumbnailLink: f.thumbnailLink,
          modifiedTime: f.modifiedTime,
        });
      });
    }
  }

  saveStoredDiscoveredNominalPdfs(discoveredPdfs);

  // Build lookup map by normalized student name, excluding archived/inactive folders for active students
  const isArchivedSubfolder = (subName: string): boolean => {
    const up = (subName || '').toUpperCase();
    return up.includes('INATIVO') || up.includes('DUPLICATA') || up.includes('ARQUIVAD');
  };

  const activePdfs = discoveredPdfs.filter((p) => !isArchivedSubfolder(p.subfolderName));

  const findBestPdfForStudent = (
    student: Student,
    className: string
  ): DriveNominalPdfFile | undefined => {
    const normStudent = normalizeStudentNameForPhoto(student.name);
    if (!normStudent) return undefined;
    const shortTurma = formatShortTurmaCode(className).toUpperCase();
    const upperClassName = className.toUpperCase();

    // 1. Exact name match inside the student's own class subfolder (highest semantic priority)
    const exactInClassFolder = activePdfs.find((p) => {
      if (p.normalizedStudentName !== normStudent) return false;
      const subUp = (p.subfolderName || '').toUpperCase();
      return subUp.includes(upperClassName) || subUp.includes(shortTurma);
    });
    if (exactInClassFolder) return exactInClassFolder;

    // 2. Exact name match in any active (non-archived) subfolder
    const exactActive = activePdfs.find((p) => p.normalizedStudentName === normStudent);
    if (exactActive) return exactActive;

    // 3. Prefix match only if >= 12 chars and same first + second name tokens
    if (normStudent.length >= 12) {
      const studentTokens = normStudent.split(' ');
      const prefixCandidate = activePdfs.find((p) => {
        if (!p.normalizedStudentName || p.normalizedStudentName.length < 12) return false;
        const pdfTokens = p.normalizedStudentName.split(' ');
        if (studentTokens[0] !== pdfTokens[0] || studentTokens[1] !== pdfTokens[1]) {
          return false;
        }
        return (
          p.normalizedStudentName.startsWith(normStudent) ||
          normStudent.startsWith(p.normalizedStudentName)
        );
      });
      if (prefixCandidate) return prefixCandidate;
    }

    return undefined;
  };

  let matchedPdfsCount = 0;

  const updatedClasses = currentClasses.map((cls) => {
    const updatedStudents = cls.students.map((s) => {
      const matched = findBestPdfForStudent(s, cls.name);

      if (matched) {
        matchedPdfsCount++;
        return {
          ...s,
          fichaPdfDriveId: matched.id,
          fichaPdfDriveUrl: matched.webViewLink,
          fichaPdfSubfolder: matched.subfolderName,
        };
      }
      return s;
    });

    return {
      ...cls,
      students: updatedStudents,
    };
  });

  return {
    updatedClasses,
    matchedPdfsCount,
    totalPdfFilesFound: discoveredPdfs.length,
    subfoldersScannedCount: Math.max(0, subfolderMap.size - 1),
    discoveredPdfs,
  };
};

/**
 * Sync local computer photo files (e.g. selected with Ctrl+A from the Windows folder)
 * Matches by student name ("RAUANNY GRAZIELLY DA SILVA LIMA.jpg") and optionally uploads to Google Drive folder
 */
export const syncLocalPhotoFilesToStudents = async (
  fileList: FileList | File[],
  currentClasses: ClassGroup[],
  uploadToDrive = true
): Promise<{
  updatedClasses: ClassGroup[];
  matchedCount: number;
  uploadedToDriveCount: number;
}> => {
  const files = Array.from(fileList).filter(
    (f) =>
      f.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|avif)$/i.test(f.name)
  );

  // Read all files into base64 data URLs with both exact and core-token maps
  const fileMap = new Map<string, { file: File; dataUrl: string }>();
  const coreFileMap = new Map<string, { file: File; dataUrl: string }>();

  await Promise.all(
    files.map(
      (file) =>
        new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const norm = normalizeStudentNameForPhoto(file.name);
            const core = normalizeStudentNameCoreTokens(file.name);
            if (norm && typeof reader.result === 'string') {
              const entry = { file, dataUrl: reader.result };
              fileMap.set(norm, entry);
              if (core) coreFileMap.set(core, entry);
            }
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(file);
        })
    )
  );

  let matchedCount = 0;
  let uploadedToDriveCount = 0;
  const token = uploadToDrive ? await getAccessToken() : null;

  const updatedClasses: ClassGroup[] = [];

  for (const cls of currentClasses) {
    const updatedStudents: Student[] = [];
    for (const s of cls.students) {
      const norm = normalizeStudentNameForPhoto(s.estudante || s.name);
      const core = normalizeStudentNameCoreTokens(s.estudante || s.name);
      const normSocial = s.nomeSocial ? normalizeStudentNameForPhoto(s.nomeSocial) : '';
      const cleanRa = (s.ra || '').replace(/\D/g, '');
      const found =
        fileMap.get(norm) ||
        (core ? coreFileMap.get(core) : undefined) ||
        (normSocial ? fileMap.get(normSocial) : undefined) ||
        (cleanRa ? fileMap.get(cleanRa) : undefined);
      if (found) {
        matchedCount++;
        let driveLink = s.photoDriveUrl || '';
        let finalPhotoUrl = found.dataUrl;
        if (token && uploadToDrive) {
          try {
            const uploaded = await uploadStudentPhotoToDrive(
              s,
              cls.name,
              found.dataUrl
            );
            driveLink = uploaded.webViewLink;
            if (uploaded.thumbnailUrl) {
              finalPhotoUrl = found.dataUrl;
            }
            uploadedToDriveCount++;
          } catch (e) {
            console.warn('Aviso ao enviar foto ao Drive:', e);
          }
        }
        updatedStudents.push({
          ...s,
          photo: finalPhotoUrl,
          photoDriveUrl: driveLink || s.photoDriveUrl,
        });
      } else {
        updatedStudents.push(s);
      }
    }
    updatedClasses.push({
      ...cls,
      students: updatedStudents,
    });
  }

  return {
    updatedClasses,
    matchedCount,
    uploadedToDriveCount,
  };
};

/**
 * Upload a Student Photo directly into the REAL Google Drive Folder
 * Named with the exact Student Name ("RAUANNY GRAZIELLY DA SILVA LIMA.jpg") so folder & app stay 100% in sync!
 * If a photo with that name already exists in the folder, it updates it cleanly without creating duplicates.
 */
export const uploadStudentPhotoToDrive = async (
  student: Student,
  className: string,
  dataUrl: string
): Promise<{ fileId: string; webViewLink: string; thumbnailUrl: string; folderUrl: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error(
      'Conecte sua conta Google Workspace para enviar a foto diretamente para a pasta do Google Drive.'
    );
  }

  let { folderId, folderUrl } = getSavedPhotosDriveFolderInfo();
  if (!folderId) {
    const createdFolder = await createRealPhotosFolderInDrive();
    folderId = createdFolder.folderId;
    folderUrl = createdFolder.folderUrl;
  }

  const cleanStudentName = student.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  const fileName = `${cleanStudentName}.jpg`;

  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  const fileBlob = new Blob([u8arr], { type: mimeType });

  // Check if file with same name already exists inside the Drive folder to avoid duplicates
  let existingFileId: string | null = null;
  try {
    const qExisting = encodeURIComponent(
      `'${folderId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`
    );
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${qExisting}&fields=files(id)&pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        existingFileId = searchData.files[0].id;
      }
    }
  } catch {
    // ignore search error and proceed to create
  }

  const metadata: Record<string, unknown> = {
    name: fileName,
    description: `Foto Oficial - ${student.name} (RA: ${student.ra || ''}) - Turma ${className}`,
  };
  if (!existingFileId) {
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', fileBlob);

  const uploadEndpoint = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink';

  const uploadRes = await fetch(uploadEndpoint, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Erro ao enviar foto para a pasta do Google Drive (${uploadRes.status}).`
    );
  }

  const uploaded = await uploadRes.json();
  const fileId: string = uploaded.id;
  const webViewLink: string =
    uploaded.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  const thumbnailUrl =
    uploaded.thumbnailLink?.replace(/=s\d+/, '=s400') ||
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;

  return {
    fileId,
    webViewLink,
    thumbnailUrl,
    folderUrl: folderUrl || `https://drive.google.com/drive/folders/${folderId}`,
  };
};

/**
 * Fetch spreadsheet metadata to inspect actual sheet/tab names without hardcoding
 */
export const fetchSpreadsheetMetadata = async (
  spreadsheetId: string
): Promise<{
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheetTitles: string[];
}> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Autenticação necessária. Conecte sua conta Google primeiro.');
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Erro ao acessar planilha (${res.status}). Verifique o ID da planilha e suas permissões.`
    );
  }

  const data = await res.json();
  const sheetTitles: string[] = (data.sheets || []).map(
    (s: any) => s.properties?.title || ''
  );

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Planilha Google Sheets',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    sheetTitles,
  };
};

/**
 * Ensures a SINGLE UNIQUE Official Google Sheet + SINGLE UNIQUE Google Drive Photos Folder.
 * If the spreadsheet already exists, it READS from it (preserving manual edits made in Sheets!)
 * If it does not exist yet, it creates and seeds it once.
 */
export const createSchoolDatabaseSpreadsheet = async (
  classes: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  driveFolderUrl?: string;
  sheetAlreadyExisted?: boolean;
  folderAlreadyExisted?: boolean;
}> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Autenticação necessária. Faça login com o Google primeiro.');
  }

  // 1. Ensure the SINGLE UNIQUE Google Drive folder for student photos exists
  let driveFolderUrl = getSavedPhotosDriveFolderUrl();
  let folderAlreadyExisted = false;
  try {
    const folderResult = await createRealPhotosFolderInDrive();
    driveFolderUrl = folderResult.folderUrl;
    folderAlreadyExisted = folderResult.alreadyExisted;
  } catch (e) {
    console.warn('Aviso ao verificar/criar pasta única no Drive:', e);
  }

  // 2. Search if the SINGLE UNIQUE Official Spreadsheet already exists in Drive (not trashed)
  let spreadsheetId = '';
  let spreadsheetUrl = '';
  let sheetAlreadyExisted = false;

  const sheetQuery = encodeURIComponent(
    `name = '${OFFICIAL_SPREADSHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
  );
  const searchSheetRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${sheetQuery}&fields=files(id,name,webViewLink)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (searchSheetRes.ok) {
    const searchData = await searchSheetRes.json();
    if (searchData.files && searchData.files.length > 0) {
      spreadsheetId = searchData.files[0].id;
      spreadsheetUrl =
        searchData.files[0].webViewLink ||
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      sheetAlreadyExisted = true;
    }
  }

  // 3. If the single spreadsheet doesn't exist yet, create and seed it once
  if (!spreadsheetId) {
    const createRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            title: OFFICIAL_SPREADSHEET_TITLE,
            locale: 'pt_BR',
          },
          sheets: [
            {
              properties: {
                title: 'Faltas_Atestados_Infantil',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'Faltas_Atestados_Fundamental',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'Busca_Ativa_Faltas_Consecutivas_2027',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'SED_Matriculas_e_Frequencia',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'Dias_Letivos_SME_2027',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'Turmas_Salas_2027',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'Emails_Permitidos_2027',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'Monitoramento_Acessos_2027',
                gridProperties: { frozenRowCount: 1 },
              },
            },
            {
              properties: {
                title: 'Onibus_Fretado_2027',
                gridProperties: { frozenRowCount: 1 },
              },
            },
          ],
        }),
      }
    );

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      throw new Error(
        errData?.error?.message ||
          `Falha ao criar planilha única no Google Sheets (${createRes.status}).`
      );
    }

    const created = await createRes.json();
    spreadsheetId = created.spreadsheetId;
    spreadsheetUrl =
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Seed initial data ONLY when creating the brand-new spreadsheet
    await syncClassesToGoogleSheet(spreadsheetId, classes, calendar);
  }

  saveSpreadsheetInfo(spreadsheetId, OFFICIAL_SPREADSHEET_TITLE);

  return {
    spreadsheetId,
    spreadsheetUrl,
    title: OFFICIAL_SPREADSHEET_TITLE,
    driveFolderUrl,
    sheetAlreadyExisted,
    folderAlreadyExisted,
  };
};

/**
 * Write ONLY Attendance Columns (AW:BF) to the Google Sheet when filling out absences in the App!
 * NEVER overwrites Columns A:AV (the 48 SED student data columns managed manually in Google Sheets).
 */
export const writeAttendanceOnlyToGoogleSheet = async (
  updatedClass: ClassGroup,
  allClasses: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): Promise<{ updatedStudentsCount: number }> => {
  const token = await getAccessToken();
  const { spreadsheetId } = getSavedSpreadsheetInfo();
  if (!token || !spreadsheetId) {
    return { updatedStudentsCount: 0 };
  }

  const meta = await fetchSpreadsheetMetadata(spreadsheetId);
  const targetTab = meta.sheetTitles.includes('SED_Matriculas_e_Frequencia')
    ? 'SED_Matriculas_e_Frequencia'
    : meta.sheetTitles[0];

  if (!targetTab) return { updatedStudentsCount: 0 };

  // Read existing Columns A..BF to find the exact row number of each student in the Sheet
  const readRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${targetTab}!A1:BF2000`)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!readRes.ok) return { updatedStudentsCount: 0 };

  const readData = await readRes.json();
  const rows: any[][] = readData.values || [];
  if (rows.length <= 1) return { updatedStudentsCount: 0 };

  const headers = rows[0].map((h: any) => String(h || '').trim().toUpperCase());
  const idxChamada = headers.indexOf('Nº CHAMADA');
  const idxEstudante = headers.indexOf('ESTUDANTE');
  const idxRa = headers.indexOf('RA');
  const idxTurma = headers.indexOf('TURMA');
  const idxIdAluno =
    headers.indexOf('ID_ESTUDANTE') >= 0
      ? headers.indexOf('ID_ESTUDANTE')
      : headers.indexOf('ID_ALUNO');

  const shortTurma = formatShortTurmaCode(updatedClass.name).toUpperCase();
  const diasLetivosMes = updatedClass.classesHeld || 20;

  // Map student -> 1-based row number in Google Sheet
  const dataUpdates: Array<{ range: string; values: any[][] }> = [];

  for (let rIdx = 1; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const rowNumber = rIdx + 1; // 1-indexed in Sheets
    const rowTurma =
      idxTurma >= 0 ? String(row[idxTurma] || '').trim().toUpperCase() : '';
    const rowRa = idxRa >= 0 ? String(row[idxRa] || '').trim() : '';
    const rowName =
      idxEstudante >= 0
        ? normalizeStudentNameForPhoto(String(row[idxEstudante] || ''))
        : '';
    const rowChamada =
      idxChamada >= 0 ? parseInt(String(row[idxChamada] || ''), 10) : -1;
    const rowAlunoId =
      idxIdAluno >= 0 ? String(row[idxIdAluno] || '').trim() : '';

    // Check if this row belongs to updatedClass
    const matchesTurma =
      rowTurma === shortTurma ||
      rowTurma === updatedClass.name.toUpperCase();

    const matchedStudent = updatedClass.students.find((s) => {
      if (rowAlunoId && s.id === rowAlunoId) return true;
      if (rowRa && s.ra && s.ra.trim() === rowRa) return true;
      if (
        matchesTurma &&
        (normalizeStudentNameForPhoto(s.name) === rowName ||
          s.number === rowChamada)
      ) {
        return true;
      }
      return false;
    });

    if (matchedStudent) {
      const m = getStudentAttendanceMetrics(
        matchedStudent,
        diasLetivosMes,
        calendar
      );
      // Columns AW to BF (10 columns: index 48 to 57)
      dataUpdates.push({
        range: `${targetTab}!AW${rowNumber}:BF${rowNumber}`,
        values: [
          [
            m.diasLetivosMes,
            m.diasLetivosMatriculados,
            m.faltas,
            m.atestados,
            m.presencas,
            `${m.frequenciaPercent}%`,
            matchedStudent.photoDriveUrl || '',
            matchedStudent.notes || '',
            updatedClass.id,
            matchedStudent.id,
          ],
        ],
      });
    }
  }

  // Ensure nominal stage tabs and consecutive absence tab exist and update them as well
  const missingNominalTabs: any[] = [];
  [
    'Faltas_Atestados_Infantil',
    'Faltas_Atestados_Fundamental',
    'Busca_Ativa_Faltas_Consecutivas_2027',
    'Onibus_Fretado_2027',
  ].forEach((tName) => {
    if (!meta.sheetTitles.includes(tName)) {
      missingNominalTabs.push({
        addSheet: {
          properties: {
            title: tName,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }
  });

  if (missingNominalTabs.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: missingNominalTabs }),
      }
    ).catch(() => {});
  }

  // Clear Busca_Ativa_Faltas_Consecutivas_2027 before writing so removed occurrences never leave ghost rows
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent('Busca_Ativa_Faltas_Consecutivas_2027!A2:Q1000')}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  ).catch(() => {});

  // Update Nominal Tabs separated by Educação Infantil and Ensino Fundamental + Busca Ativa Faltas Consecutivas
  dataUpdates.push({
    range: 'Faltas_Atestados_Infantil!A1',
    values: buildNominalStageSheetValues(allClasses, 'EDUCACAO INFANTIL', calendar),
  });
  dataUpdates.push({
    range: 'Faltas_Atestados_Fundamental!A1',
    values: buildNominalStageSheetValues(allClasses, 'ENSINO FUNDAMENTAL', calendar),
  });
  dataUpdates.push({
    range: 'Busca_Ativa_Faltas_Consecutivas_2027!A1',
    values: buildFaltasConsecutivasSheetValues(allClasses),
  });
  dataUpdates.push({
    range: 'Onibus_Fretado_2027!A1',
    values: buildOnibusFretadoSheetValues(allClasses),
  });

  // Also update Turmas_Salas_2027 summary tab
  if (meta.sheetTitles.includes('Turmas_Salas_2027')) {
    dataUpdates.push({
      range: 'Turmas_Salas_2027!A1',
      values: buildTurmasSheetValues(allClasses, calendar),
    });
  }

  if (dataUpdates.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataUpdates,
        }),
      }
    );
  }

  return { updatedStudentsCount: dataUpdates.length };
};

/**
 * Full Sync/Write (used only on initial seed or explicit Admin full export)
 */
export const syncClassesToGoogleSheet = async (
  spreadsheetId: string,
  classes: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): Promise<{ updatedCells: number; title: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Autenticação necessária. Faça login com o Google primeiro.');
  }

  const meta = await fetchSpreadsheetMetadata(spreadsheetId);
  const existingTabs = meta.sheetTitles;

  const requestsToCreateTabs: any[] = [];
  const requiredTabs = [
    'Faltas_Atestados_Infantil',
    'Faltas_Atestados_Fundamental',
    'Busca_Ativa_Faltas_Consecutivas_2027',
    'Onibus_Fretado_2027',
    'SED_Matriculas_e_Frequencia',
    'Dias_Letivos_SME_2027',
    'Turmas_Salas_2027',
    'Emails_Permitidos_2027',
    'Monitoramento_Acessos_2027',
  ];

  requiredTabs.forEach((tabName) => {
    if (!existingTabs.includes(tabName)) {
      requestsToCreateTabs.push({
        addSheet: {
          properties: { title: tabName, gridProperties: { frozenRowCount: 1 } },
        },
      });
    }
  });

  if (requestsToCreateTabs.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: requestsToCreateTabs }),
      }
    );
  }

  const nominalInfantilValues = buildNominalStageSheetValues(
    classes,
    'EDUCACAO INFANTIL',
    calendar
  );
  const nominalFundamentalValues = buildNominalStageSheetValues(
    classes,
    'ENSINO FUNDAMENTAL',
    calendar
  );
  const sedValues = buildSedSheetValues(classes, calendar);
  const calendarioValues = buildCalendario200DiasValues(calendar);
  const turmasValues = buildTurmasSheetValues(classes, calendar);
  const emailsPermitidosValues = buildEmailsPermitidosValues();
  const faltasConsecutivasValues = buildFaltasConsecutivasSheetValues(classes);
  const onibusFretadoValues = buildOnibusFretadoSheetValues(classes);

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'Faltas_Atestados_Infantil!A1',
            values: nominalInfantilValues,
          },
          {
            range: 'Faltas_Atestados_Fundamental!A1',
            values: nominalFundamentalValues,
          },
          {
            range: 'Busca_Ativa_Faltas_Consecutivas_2027!A1',
            values: faltasConsecutivasValues,
          },
          {
            range: 'Onibus_Fretado_2027!A1',
            values: onibusFretadoValues,
          },
          {
            range: 'SED_Matriculas_e_Frequencia!A1',
            values: sedValues,
          },
          {
            range: 'Dias_Letivos_SME_2027!A1',
            values: calendarioValues,
          },
          {
            range: 'Turmas_Salas_2027!A1',
            values: turmasValues,
          },
          {
            range: 'Emails_Permitidos_2027!A1',
            values: emailsPermitidosValues,
          },
        ],
      }),
    }
  );

  if (!batchRes.ok) {
    const errData = await batchRes.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Erro ao gravar dados no Google Sheets (${batchRes.status}).`
    );
  }

  const batchData = await batchRes.json();
  saveSpreadsheetInfo(spreadsheetId, meta.title);

  return {
    updatedCells: batchData.totalUpdatedCells || sedValues.length * 58,
    title: meta.title,
  };
};

/**
 * Parse raw SED TSV text (48 columns copied from SED or Excel) and merge into classes
 */
export const parseSedTsvIntoClasses = (
  tsvText: string,
  currentClasses: ClassGroup[]
): { updatedClasses: ClassGroup[]; importedCount: number } => {
  const lines = tsvText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { updatedClasses: currentClasses, importedCount: 0 };
  }

  const firstCols = lines[0].split('\t').map((c) => c.trim().toUpperCase());
  const hasHeader =
    firstCols.includes('ESTUDANTE') ||
    firstCols.includes('TIPO DE ENSINO') ||
    firstCols.includes('RA');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (dataLines.length === 0) {
    return { updatedClasses: currentClasses, importedCount: 0 };
  }

  const groupedByTurma = new Map<string, Student[]>();
  let importedCount = 0;

  dataLines.forEach((line, idx) => {
    const cols = line.split('\t');
    if (cols.length < 4) return;

    const tipoEnsino = (cols[0] || '').trim();
    const serie = (cols[1] || '').trim();
    const numChamada = parseInt((cols[2] || '').trim(), 10) || idx + 1;
    const estudante = (cols[3] || '').trim();
    if (!estudante) return;

    const ra = (cols[4] || '').trim();
    const digRa = (cols[5] || '').trim();
    const ufRa = (cols[6] || 'SP').trim();
    const dataNascimento = (cols[7] || '').trim();
    const tipoAlocacao = (cols[8] || '').trim();
    const situacaoRaw = (cols[9] || '').trim();
    const situacao = situacaoRaw || 'ATIVO';
    const dataMovimentacao = (cols[10] || '').trim();
    const categoriaProfissionalCenso = (cols[11] || '').trim();
    const deficiencia = (cols[12] || '').trim();
    const posDataCenso = (cols[13] || '').trim();
    const turmaCode = (cols[14] || 'G4A').trim().toUpperCase();
    const periodoSed = (cols[15] || 'MANHÃ').trim();
    const dataMatriculaSed = (cols[16] || '03/02/2026').trim();
    const procedenciaEscolar = (cols[17] || '').trim();
    const irmaos = (cols[18] || '').trim();
    const idade = (cols[19] || '').trim();
    const arquivo = (cols[20] || '').trim();
    const filiacao1 = (cols[21] || '').trim();
    const filiacao2 = (cols[22] || '').trim();
    const nomeSocial = (cols[23] || '').trim();
    const genero = (cols[24] || '').trim();
    const tipoSanguineo = (cols[25] || '').trim();
    const racaCor = (cols[26] || '').trim();
    const nacionalidade = (cols[27] || 'BRASILEIRA').trim();
    const paisOrigem = (cols[28] || '').trim();
    const municipioNascimento = (cols[29] || 'JUNDIAI - SP').trim();
    const cpf = (cols[30] || '').trim();
    const rg = (cols[31] || '').trim();
    const dataEmissaoRg = (cols[32] || '').trim();
    const cartaoSus = (cols[33] || '').trim();
    const nis = (cols[34] || '').trim();
    const cep = (cols[35] || '').trim();
    const logradouro = (cols[36] || '').trim();
    const numeroResidencia = (cols[37] || '').trim();
    const complemento = (cols[38] || '').trim();
    const bairro = (cols[39] || '').trim();
    const cidade = (cols[40] || 'JUNDIAI').trim();
    const uf = (cols[41] || 'SP').trim();
    const telefones = (cols[42] || '').trim();
    const emailGoogle = (cols[43] || '').trim();
    const emailMicrosoft = (cols[44] || '').trim();
    const emailMunicipal = (cols[45] || '').trim();
    const rotaOnibus = (cols[46] || '').trim();
    const sucessaoEscolar = (cols[47] || '').trim();

    const parts = estudante.split(' ').filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : estudante.substring(0, 2).toUpperCase();

    const existingList = groupedByTurma.get(turmaCode) || [];
    const normEstudante = normalizeStudentNameForPhoto(estudante);
    const alreadyInTurma = existingList.some(
      (s) =>
        (ra && s.ra === ra && normalizeStudentNameForPhoto(s.name) === normEstudante) ||
        normalizeStudentNameForPhoto(s.name) === normEstudante
    );
    if (alreadyInTurma) return;
    const candidateId = `${turmaCode.toLowerCase()}-s${numChamada}`;
    const isDupId = existingList.some((s) => s.id === candidateId);
    const studentObj: Student = {
      id: isDupId ? `${candidateId}-r${idx + 1}` : candidateId,
      number: numChamada,
      name: estudante,
      initials,
      status: 'present',
      totalAbsencesMonth: 0,
      justifiedAbsences: 0,
      diasLetivosRecorte: situacao === 'BXTR' ? 10 : 20,
      notes: [
        deficiencia ? `AEE/Deficiência: ${deficiencia}` : '',
        situacao === 'BXTR' ? `Transferido (BXTR) em ${dataMovimentacao}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      guardianName: filiacao1 || filiacao2,
      guardianPhone: telefones,
      tipoEnsino,
      serie,
      numeroChamada: numChamada,
      estudante,
      ra,
      digRa,
      ufRa,
      dataNascimento,
      tipoAlocacao,
      situacao,
      dataMovimentacao,
      categoriaProfissionalCenso,
      deficiencia,
      posDataCenso,
      turma: turmaCode,
      periodo: periodoSed,
      dataMatriculaSed,
      procedenciaEscolar,
      irmaos,
      idade,
      arquivo,
      filiacao1,
      filiacao2,
      nomeSocial,
      genero,
      tipoSanguineo,
      racaCor,
      nacionalidade,
      paisOrigem,
      municipioNascimento,
      cpf,
      rg,
      dataEmissaoRg,
      cartaoSus,
      nis,
      cep,
      logradouro,
      numeroResidencia,
      complemento,
      bairro,
      cidade,
      uf,
      telefones,
      emailGoogle,
      emailMicrosoft,
      emailMunicipal,
      rotaOnibus,
      sucessaoEscolar,
    };

    existingList.push(studentObj);
    groupedByTurma.set(turmaCode, existingList);
    importedCount++;
  });

  const updatedClasses = currentClasses.map((cls) => {
    const code = formatShortTurmaCode(cls.name).toUpperCase();
    const matchedStudents =
      groupedByTurma.get(code) || groupedByTurma.get(cls.name.toUpperCase());
    if (!matchedStudents || matchedStudents.length === 0) return cls;

    const sorted = [...matchedStudents].sort((a, b) => a.number - b.number);
    const tempCls: ClassGroup = {
      ...cls,
      totalStudents: sorted.length,
      students: sorted,
    };
    const cm = getClassAttendanceMetrics(tempCls, OFFICIAL_OCTOBER_DAYS);
    return {
      ...tempCls,
      presenceRate: cm.presenceRate,
      monthlyAbsences: cm.totalFaltasTurma,
    };
  });

  return { updatedClasses, importedCount };
};

/**
 * MASTER PULL: Reads all student data (48 SED columns), 200 school days, AND Drive Folder Photos
 * Any manual edit made by Admin in Google Sheets or Drive Folder automatically updates the App!
 */
export const readClassesFromGoogleSheet = async (
  spreadsheetId: string,
  currentClasses: ClassGroup[]
): Promise<{
  updatedClasses: ClassGroup[];
  rowsRead: number;
  sheetTitle: string;
  matchedPhotosCount?: number;
}> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Autenticação necessária. Faça login com o Google primeiro.');
  }

  const meta = await fetchSpreadsheetMetadata(spreadsheetId);
  const targetTab = meta.sheetTitles.includes('SED_Matriculas_e_Frequencia')
    ? 'SED_Matriculas_e_Frequencia'
    : meta.sheetTitles[0];

  if (!targetTab) {
    throw new Error('Nenhuma aba encontrada na planilha informada.');
  }

  // 1. Read SED_Matriculas_e_Frequencia (all 58 columns)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${targetTab}!A1:BF2000`)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Erro ao ler dados da aba ${targetTab} (${res.status}).`
    );
  }

  const data = await res.json();
  const values: any[][] = data.values || [];

  // 2. Also read Dias_Letivos_SME_2027 if present so manual school-day changes in Sheet update the App
  const sheetMonthlyDaysMap: Record<string, number> =
    getDefaultMonthlySchoolDaysMap();
  if (meta.sheetTitles.includes('Dias_Letivos_SME_2027')) {
    try {
      const daysRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent('Dias_Letivos_SME_2027!A2:C15')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (daysRes.ok) {
        const daysData = await daysRes.json();
        const dayRows: any[][] = daysData.values || [];
        dayRows.forEach((r) => {
          const mName = String(r[0] || '').trim();
          const mDays = parseInt(String(r[2] || ''), 10);
          if (mName && !isNaN(mDays) && mName !== 'TOTAL ANUAL OFICIAL') {
            sheetMonthlyDaysMap[mName] = mDays;
          }
        });
      }
    } catch (e) {
      console.warn('Aviso ao ler Dias_Letivos_SME_2027:', e);
    }
  }

  if (values.length <= 1) {
    return {
      updatedClasses: currentClasses,
      rowsRead: 0,
      sheetTitle: meta.title,
    };
  }

  // Group all rows from Google Sheet by composite key (Turma + RA/Name) so homonyms or transfers across classes never collide!
  const makeCompositeStudentKey = (turmaShort: string, raVal: string, nameVal: string): string => {
    const cleanTurma = formatShortTurmaCode(turmaShort).toUpperCase().trim();
    const normName = normalizeStudentNameForPhoto(nameVal);
    const cleanRa = (raVal || '').trim();
    return cleanRa ? `${cleanTurma}::RA:${cleanRa}` : `${cleanTurma}::NAME:${normName}`;
  };

  const existingPhotoByStudentName = new Map<
    string,
    {
      photo?: string;
      photoDriveUrl?: string;
      fichaPdfDriveId?: string;
      fichaPdfDriveUrl?: string;
      fichaPdfSubfolder?: string;
      consecutiveAbsenceAlert?: Student['consecutiveAbsenceAlert'];
      monthlyAttendanceByMonth?: Student['monthlyAttendanceByMonth'];
    }
  >();
  currentClasses.forEach((c) => {
    const shortCode = formatShortTurmaCode(c.name).toUpperCase();
    c.students.forEach((s) => {
      const entry = {
        photo: s.photo,
        photoDriveUrl: s.photoDriveUrl,
        fichaPdfDriveId: s.fichaPdfDriveId,
        fichaPdfDriveUrl: s.fichaPdfDriveUrl,
        fichaPdfSubfolder: s.fichaPdfSubfolder,
        consecutiveAbsenceAlert: s.consecutiveAbsenceAlert,
        monthlyAttendanceByMonth: s.monthlyAttendanceByMonth,
      };
      existingPhotoByStudentName.set(
        makeCompositeStudentKey(shortCode, s.ra || '', s.name),
        entry
      );
      existingPhotoByStudentName.set(
        `${shortCode}::NAME:${normalizeStudentNameForPhoto(s.name)}`,
        entry
      );
      existingPhotoByStudentName.set(normalizeStudentNameForPhoto(s.name), entry);
    });
  });

  // Read Onibus_Fretado_2027 nominal database tab if present so any student added/edited in that sheet tab automatically shows bus info on the student card!
  const sheetBusRouteByStudent = new Map<string, string>();
  if (meta.sheetTitles.includes('Onibus_Fretado_2027')) {
    try {
      const busRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent('Onibus_Fretado_2027!A2:M1500')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (busRes.ok) {
        const busData = await busRes.json();
        const busRows: any[][] = busData.values || [];
        busRows.forEach((r) => {
          const rowTurma = formatShortTurmaCode(String(r[1] || '')).toUpperCase();
          const stName = normalizeStudentNameForPhoto(String(r[4] || ''));
          const rawRa = String(r[5] || '').split('-')[0].trim();
          const rotaStr = String(r[6] || '').trim() || 'ÔNIBUS FRETADO';
          if (!stName) return;
          if (rowTurma && rawRa) {
            sheetBusRouteByStudent.set(`${rowTurma}::RA:${rawRa}`, rotaStr);
          }
          if (rowTurma) {
            sheetBusRouteByStudent.set(`${rowTurma}::NAME:${stName}`, rotaStr);
          }
          sheetBusRouteByStudent.set(stName, rotaStr);
        });
      }
    } catch (e) {
      console.warn('Aviso ao ler Onibus_Fretado_2027:', e);
    }
  }

  // Also read Busca_Ativa_Faltas_Consecutivas_2027 if present so feedback typed in Google Sheets updates the App
  if (meta.sheetTitles.includes('Busca_Ativa_Faltas_Consecutivas_2027')) {
    try {
      const conRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent('Busca_Ativa_Faltas_Consecutivas_2027!A2:Q1000')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (conRes.ok) {
        const conData = await conRes.json();
        const conRows: any[][] = conData.values || [];
        const groupedOccByStudent = new Map<
          string,
          Array<{
            id: string;
            sequenceNumber: number;
            selectedDates: string[];
            reportedAt: string;
            reportedByTeacher?: string;
            familyFeedback?: string;
            feedbackUpdatedAt?: string;
          }>
        >();

        conRows.forEach((r) => {
          const rowTurma = formatShortTurmaCode(String(r[0] || '')).toUpperCase();
          const stName = normalizeStudentNameForPhoto(String(r[4] || ''));
          if (!stName) return;
          const teacherStr = String(r[2] || '').trim();
          const datesStr = String(r[6] || '').trim();
          const reportedAt = String(r[8] || '').trim();
          const feedbackStr = String(r[11] || '').trim();
          const feedbackAt = String(r[12] || '').trim();
          const occId = String(r[15] || '').trim();
          const parsedDates = datesStr
            ? datesStr.split(',').map((d) => d.trim()).filter(Boolean)
            : [];
          if (parsedDates.length === 0 && !feedbackStr) return;

          const lookupKey = rowTurma ? `${rowTurma}::NAME:${stName}` : stName;
          const currentList = groupedOccByStudent.get(lookupKey) || [];
          const seqNumber = currentList.length + 1;
          currentList.push({
            id: occId || `${stName}_occ_${seqNumber}`,
            sequenceNumber: seqNumber,
            selectedDates: parsedDates,
            reportedAt,
            reportedByTeacher: teacherStr || undefined,
            familyFeedback: feedbackStr,
            feedbackUpdatedAt: feedbackAt,
          });
          groupedOccByStudent.set(lookupKey, currentList);
        });

        groupedOccByStudent.forEach((occList, lookupKey) => {
          const fallbackName = lookupKey.includes('::NAME:')
            ? lookupKey.split('::NAME:')[1]
            : lookupKey;
          const prevEntry =
            existingPhotoByStudentName.get(lookupKey) ||
            existingPhotoByStudentName.get(fallbackName) ||
            {};
          const latest = occList[occList.length - 1];
          if (!latest) return;
          const updatedEntry = {
            ...prevEntry,
            consecutiveAbsenceAlert: {
              selectedDates: latest.selectedDates,
              reportedAt: latest.reportedAt,
              reportedByTeacher: latest.reportedByTeacher,
              familyFeedback: latest.familyFeedback || '',
              feedbackUpdatedAt: latest.feedbackUpdatedAt || '',
              active: occList.length > 0,
              occurrences: occList,
            },
          };
          existingPhotoByStudentName.set(lookupKey, updatedEntry);
          existingPhotoByStudentName.set(fallbackName, updatedEntry);
        });
      }
    } catch (e) {
      console.warn('Aviso ao ler Busca_Ativa_Faltas_Consecutivas_2027:', e);
    }
  }

  const groupedFromSheet = new Map<string, Student[]>();

  for (let i = 1; i < values.length; i++) {
    const cols = values[i];
    if (!cols || cols.length < 4) continue;

    const tipoEnsino = String(cols[0] || '').trim();
    const serie = String(cols[1] || '').trim();
    const numChamada = parseInt(String(cols[2] || '').trim(), 10) || i;
    const estudante = String(cols[3] || '').trim();
    if (!estudante) continue;

    const ra = String(cols[4] || '').trim();
    const digRa = String(cols[5] || '').trim();
    const ufRa = String(cols[6] || 'SP').trim();
    const dataNascimento = String(cols[7] || '').trim();
    const tipoAlocacao = String(cols[8] || '').trim();
    const situacaoRaw = String(cols[9] || '').trim();
    const situacao = situacaoRaw || 'ATIVO';
    const dataMovimentacao = String(cols[10] || '').trim();
    const categoriaProfissionalCenso = String(cols[11] || '').trim();
    const deficiencia = String(cols[12] || '').trim();
    const posDataCenso = String(cols[13] || '').trim();
    const turmaCode = String(cols[14] || 'G4A').trim().toUpperCase();
    const periodo = String(cols[15] || 'MANHÃ').trim();
    const dataMatriculaSed = String(cols[16] || '03/02/2026').trim();
    const procedenciaEscolar = String(cols[17] || '').trim();
    const irmaos = String(cols[18] || '').trim();
    const idade = String(cols[19] || '').trim();
    const arquivo = String(cols[20] || '').trim();
    const filiacao1 = String(cols[21] || '').trim();
    const filiacao2 = String(cols[22] || '').trim();
    const nomeSocial = String(cols[23] || '').trim();
    const genero = String(cols[24] || '').trim();
    const tipoSanguineo = String(cols[25] || '').trim();
    const racaCor = String(cols[26] || '').trim();
    const nacionalidade = String(cols[27] || 'BRASILEIRA').trim();
    const paisOrigem = String(cols[28] || '').trim();
    const municipioNascimento = String(cols[29] || 'JUNDIAI - SP').trim();
    const cpf = String(cols[30] || '').trim();
    const rg = String(cols[31] || '').trim();
    const dataEmissaoRg = String(cols[32] || '').trim();
    const cartaoSus = String(cols[33] || '').trim();
    const nis = String(cols[34] || '').trim();
    const cep = String(cols[35] || '').trim();
    const logradouro = String(cols[36] || '').trim();
    const numeroResidencia = String(cols[37] || '').trim();
    const complemento = String(cols[38] || '').trim();
    const bairro = String(cols[39] || '').trim();
    const cidade = String(cols[40] || 'JUNDIAI').trim();
    const uf = String(cols[41] || 'SP').trim();
    const telefones = String(cols[42] || '').trim();
    const emailGoogle = String(cols[43] || '').trim();
    const emailMicrosoft = String(cols[44] || '').trim();
    const emailMunicipal = String(cols[45] || '').trim();
    const normEstudanteForBus = normalizeStudentNameForPhoto(estudante);
    const rotaFromDedicatedTab =
      sheetBusRouteByStudent.get(makeCompositeStudentKey(turmaCode, ra, estudante)) ||
      sheetBusRouteByStudent.get(`${turmaCode}::NAME:${normEstudanteForBus}`) ||
      sheetBusRouteByStudent.get(normEstudanteForBus);
    const rotaOnibus = rotaFromDedicatedTab || String(cols[46] || '').trim();
    const sucessaoEscolar = String(cols[47] || '').trim();

    // Attendance & Photo columns (48..57)
    const diasMesCol = parseInt(String(cols[48] || '20'), 10) || 20;
    const diasRecorteCol = parseInt(String(cols[49] || ''), 10);
    const faltasCol = parseInt(String(cols[50] || '0'), 10) || 0;
    const atestadosCol = parseInt(String(cols[51] || '0'), 10) || 0;
    const linkFotoCol = String(cols[54] || '').trim();
    const obsCol = String(cols[55] || '').trim();
    const idAlunoCol = String(cols[57] || '').trim();

    const validRecorte = !isNaN(diasRecorteCol)
      ? Math.max(1, Math.min(diasMesCol, diasRecorteCol))
      : situacao === 'BXTR'
      ? 10
      : diasMesCol;
    const validFaltas = Math.max(0, Math.min(validRecorte, faltasCol));
    const validAtestados = Math.max(0, Math.min(validFaltas, atestadosCol));

    const parts = estudante.split(' ').filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : estudante.substring(0, 2).toUpperCase();

    const prevPhoto =
      existingPhotoByStudentName.get(
        makeCompositeStudentKey(turmaCode, ra, estudante)
      ) ||
      existingPhotoByStudentName.get(
        `${turmaCode}::NAME:${normalizeStudentNameForPhoto(estudante)}`
      ) ||
      existingPhotoByStudentName.get(normalizeStudentNameForPhoto(estudante));

    const list = groupedFromSheet.get(turmaCode) || [];
    const normEstudante = normalizeStudentNameForPhoto(estudante);
    const alreadyInSheetTurma = list.some(
      (s) =>
        (ra && s.ra === ra && normalizeStudentNameForPhoto(s.name) === normEstudante) ||
        normalizeStudentNameForPhoto(s.name) === normEstudante
    );
    if (alreadyInSheetTurma) continue;
    const baseId = idAlunoCol || `${turmaCode.toLowerCase()}-s${numChamada}`;
    const isDuplicateInTurma = list.some((s) => s.id === baseId);
    const uniqueStudentId = isDuplicateInTurma ? `${baseId}-row${i}` : baseId;

    const studentObj: Student = {
      id: uniqueStudentId,
      number: numChamada,
      name: estudante,
      initials,
      photo:
        prevPhoto?.photo ||
        (linkFotoCol ? toEmbeddableDrivePhotoUrl(linkFotoCol) : undefined),
      photoDriveUrl: linkFotoCol || prevPhoto?.photoDriveUrl,
      fichaPdfDriveId: prevPhoto?.fichaPdfDriveId,
      fichaPdfDriveUrl: prevPhoto?.fichaPdfDriveUrl,
      fichaPdfSubfolder: prevPhoto?.fichaPdfSubfolder,
      consecutiveAbsenceAlert: prevPhoto?.consecutiveAbsenceAlert,
      monthlyAttendanceByMonth: prevPhoto?.monthlyAttendanceByMonth,
      status: validFaltas > 0 ? 'absent' : 'present',
      totalAbsencesMonth: validFaltas,
      justifiedAbsences: validAtestados,
      diasLetivosRecorte: validRecorte,
      notes: obsCol,
      guardianName: filiacao1 || filiacao2,
      guardianPhone: telefones,
      tipoEnsino,
      serie,
      numeroChamada: numChamada,
      estudante,
      ra,
      digRa,
      ufRa,
      dataNascimento,
      tipoAlocacao,
      situacao,
      dataMovimentacao,
      categoriaProfissionalCenso,
      deficiencia,
      posDataCenso,
      turma: turmaCode,
      periodo,
      dataMatriculaSed,
      procedenciaEscolar,
      irmaos,
      idade,
      arquivo,
      filiacao1,
      filiacao2,
      nomeSocial,
      genero,
      tipoSanguineo,
      racaCor,
      nacionalidade,
      paisOrigem,
      municipioNascimento,
      cpf,
      rg,
      dataEmissaoRg,
      cartaoSus,
      nis,
      cep,
      logradouro,
      numeroResidencia,
      complemento,
      bairro,
      cidade,
      uf,
      telefones,
      emailGoogle,
      emailMicrosoft,
      emailMunicipal,
      rotaOnibus,
      sucessaoEscolar,
    };

    list.push(studentObj);
    groupedFromSheet.set(turmaCode, list);
  }

  let updatedClasses = currentClasses.map((cls) => {
    const shortCode = formatShortTurmaCode(cls.name).toUpperCase();
    const sheetStudents =
      groupedFromSheet.get(shortCode) ||
      groupedFromSheet.get(cls.name.toUpperCase());

    const nextMonthlyMap = {
      ...(cls.monthlySchoolDays || getDefaultMonthlySchoolDaysMap()),
      ...sheetMonthlyDaysMap,
    };
    const nextClassesHeld = nextMonthlyMap['Outubro'] || cls.classesHeld || 20;

    if (!sheetStudents || sheetStudents.length === 0) {
      return {
        ...cls,
        classesHeld: nextClassesHeld,
        classesPlanned: nextClassesHeld,
        monthlySchoolDays: nextMonthlyMap,
      };
    }

    const sorted = [...sheetStudents].sort((a, b) => a.number - b.number);
    const tempCls: ClassGroup = {
      ...cls,
      classesHeld: nextClassesHeld,
      classesPlanned: nextClassesHeld,
      monthlySchoolDays: nextMonthlyMap,
      totalStudents: sorted.length,
      students: sorted,
    };
    const cm = getClassAttendanceMetrics(tempCls, OFFICIAL_OCTOBER_DAYS);

    return {
      ...tempCls,
      presenceRate: cm.presenceRate,
      monthlyAbsences: cm.totalFaltasTurma,
    };
  });

  // 3. Also automatically sync photos dropped into the Google Drive Folder + Scanned PDFs from Fichas Informativas!
  let matchedPhotosCount = 0;
  try {
    const driveSync = await syncPhotosFromDriveFolder(updatedClasses);
    updatedClasses = driveSync.updatedClasses;
    matchedPhotosCount = driveSync.matchedPhotosCount;
  } catch (e) {
    console.warn('Aviso ao sincronizar fotos da pasta do Google Drive:', e);
  }

  try {
    const pdfSync = await syncNominalPdfsFromDriveSubfolders(updatedClasses);
    updatedClasses = pdfSync.updatedClasses;
  } catch (e) {
    console.warn('Aviso ao sincronizar PDFs escaneados das subpastas do Drive:', e);
  }

  saveSpreadsheetInfo(spreadsheetId, meta.title);

  return {
    updatedClasses,
    rowsRead: values.length - 1,
    sheetTitle: meta.title,
    matchedPhotosCount,
  };
};
