import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ClassGroup, UserRole, AuthorizedUser } from '../types';
import {
  generateSheetRowsFromClasses,
  OFFICIAL_OCTOBER_DAYS,
  SCHOOL_NAME,
  CITY_NAME,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import { downloadSpreadsheetXLSX, getStoredAuthorizedUsers } from '../services/db';
import { StudentAvatar } from './StudentAvatar';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import {
  getStudentBimesterReport,
  getStudentConsecutiveAlertInfo,
  ConsecutiveAlertTier,
  OFFICIAL_BIMESTERS_2027,
  StudentBimesterReportRow,
} from '../utils/attendanceRules';
import {
  OFFICIAL_ADMIN_EMAIL,
  initAuth,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  getSavedSpreadsheetInfo,
  saveSpreadsheetInfo,
  getSavedPhotosDriveFolderInfo,
  savePhotosDriveFolderUrl,
  extractSpreadsheetId,
  createSchoolDatabaseSpreadsheet,
  createRealPhotosFolderInDrive,
  syncClassesToGoogleSheet,
  writeAttendanceOnlyToGoogleSheet,
  readClassesFromGoogleSheet,
  syncPhotosFromDriveFolder,
  syncNominalPdfsFromDriveSubfolders,
  getSavedFichasPdfDriveFolderInfo,
  saveFichasPdfDriveFolderUrl,
  syncLocalPhotoFilesToStudents,
  parseSedTsvIntoClasses,
  syncGenderDictionaryToGoogleSheet,
  redefineAndSyncGoogleSheetWithFirebase,
  OFFICIAL_SHEET_TABS,
  getSedExternalImportConfig,
  saveSedExternalImportConfig,
} from '../services/googleSheetsApi';
import { enqueueGenderDictionaryWrite } from '../services/syncQueueManager';
import {
  GENDER_SHEET_TAB_NAME,
  GenderCode,
  NameGenderEntry,
  getStoredNameGenderEntries,
  saveStoredNameGenderEntries,
  resolvePersonGender,
  resolveGuardianRelationshipInfo,
  getStudentGenderLabel,
  extractFirstNameKey,
  normalizePersonNameKey,
} from '../utils/genderDictionary';
import {
  runSchoolDataDiagnostics,
  SchoolDiagnosticReport,
  DiagnosticIssue,
  DiagnosticCategory,
  DiagnosticSeverity,
} from '../utils/dataDiagnostics';
import { getSyncStatusSnapshot } from '../services/firebaseSync';

interface PlanilhaGoogleScreenProps {
  classes: ClassGroup[];
  allClasses?: ClassGroup[];
  authorizedUsers?: AuthorizedUser[];
  userRole?: UserRole;
  onUpdateAllClasses?: (updated: ClassGroup[]) => void;
  onSyncWithClasses: () => void;
  onOpenStudentGrid?: (classId: string, studentId: string) => void;
  onOpenStudentPdf?: (classId: string, studentId: string) => void;
  onOpenConfigDaysModal?: () => void;
  onNavigateToAcessos?: () => void;
  onBack: () => void;
}

export const PlanilhaGoogleScreen: React.FC<PlanilhaGoogleScreenProps> = ({
  classes,
  allClasses,
  authorizedUsers,
  userRole = 'admin',
  onUpdateAllClasses,
  onSyncWithClasses,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onOpenConfigDaysModal,
  onNavigateToAcessos,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'diagnostico_inconsistencias'
    | 'faltas_consecutivas'
    | 'nominal_infantil'
    | 'nominal_fundamental'
    | 'bimestral_bolsa'
    | 'frequencia'
    | 'turmas'
    | 'dias_letivos'
    | 'onibus_fretado'
    | 'emails_permitidos'
    | 'consulta_genero'
  >('diagnostico_inconsistencias');
  const [genderEntries, setGenderEntries] = useState<NameGenderEntry[]>(() =>
    getStoredNameGenderEntries()
  );
  const [newGenderName, setNewGenderName] = useState('');
  const [newGenderCode, setNewGenderCode] = useState<GenderCode>('F');
  const [genderSearchQuery, setGenderSearchQuery] = useState('');
  const [genderTestSimulatorName, setGenderTestSimulatorName] = useState('MARIA SILVA (AVÓ)');
  const [consecShowAllStudents, setConsecShowAllStudents] = useState(false);
  const [selectedBimesterId, setSelectedBimesterId] = useState<
    '1bim' | '2bim' | '3bim' | '4bim' | '5bim' | 'anual'
  >('5bim');
  const [bimesterSegmentFilter, setBimesterSegmentFilter] = useState<
    'all' | 'infantil' | 'fundamental'
  >('all');
  const [bimesterAlertOnly, setBimesterAlertOnly] = useState(false);
  const [showCloudSettingsDrawer, setShowCloudSettingsDrawer] = useState(false);
  const [emailSearchTab6, setEmailSearchTab6] = useState('');
  const permittedEmailsList = useMemo(
    () => authorizedUsers || getStoredAuthorizedUsers(),
    [authorizedUsers]
  );
  const [filterTurma, setFilterTurma] = useState('all');
  const [filterTurno, setFilterTurno] = useState<'all' | 'Manhã' | 'Tarde'>('all');
  const [filterStatus, setFilterStatus] = useState<
    | 'all'
    | 'com_faltas'
    | 'com_atestado'
    | 'alerta'
    | 'consec_all'
    | 'consec_3d'
    | 'consec_5d'
    | 'consec_10d'
  >('all');
  const [consecTierFilter, setConsecTierFilter] = useState<'all' | '3d' | '5d' | '10d'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Google Sheets & Drive OAuth states
  const [needsAuth, setNeedsAuth] = useState(true);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const savedSheetInfo = getSavedSpreadsheetInfo();
  const savedDriveInfo = getSavedPhotosDriveFolderInfo();
  const savedFichasPdfInfo = getSavedFichasPdfDriveFolderInfo();

  const [spreadsheetInput, setSpreadsheetInput] = useState(
    savedSheetInfo.spreadsheetId
  );
  const [connectedTitle, setConnectedTitle] = useState(savedSheetInfo.title);
  const [driveFolderUrl, setDriveFolderUrl] = useState(savedDriveInfo.folderUrl);
  const [fichasPdfFolderUrl, setFichasPdfFolderUrl] = useState(
    savedFichasPdfInfo.folderUrl
  );
  const [isRealDriveCreated, setIsRealDriveCreated] = useState(
    savedDriveInfo.isRealCreated
  );

  // Raw TSV Import Box for Admin
  const [showTsvImporter, setShowTsvImporter] = useState(false);
  const [rawTsvText, setRawTsvText] = useState('');
  const bulkPhotoInputRef = useRef<HTMLInputElement>(null);

  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [sedConfig, setSedConfig] = useState(() => getSedExternalImportConfig());
  const [lastAutoSyncSedAt, setLastAutoSyncSedAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('emeb_last_sed_auto_sync_at');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleAutoSync = () => {
      try {
        setLastAutoSyncSedAt(localStorage.getItem('emeb_last_sed_auto_sync_at'));
      } catch {}
    };
    window.addEventListener('storage', handleAutoSync);
    const interval = window.setInterval(handleAutoSync, 3000);
    return () => {
      window.removeEventListener('storage', handleAutoSync);
      window.clearInterval(interval);
    };
  }, []);

  const handleCopyImportRangeFormula = () => {
    const formula = sedConfig.defaultFormula;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(formula);
      showToast('success', 'Fórmula =IMPORTRANGE copiada para a área de transferência!');
    }
  };

  // Mandatory User Confirmation Modal state before mutating/creating Google Sheet or Drive data
  const [confirmModalAction, setConfirmModalAction] = useState<
    | 'create_both_real'
    | 'create_drive_folder'
    | 'overwrite_existing'
    | 'redefine_and_sync_all'
    | null
  >(null);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setNeedsAuth(false);
        setGoogleUserEmail(user.email || user.displayName || OFFICIAL_ADMIN_EMAIL);
        // Sincronização 100% Automática ao abrir a tela (sem necessidade de clicar manualmente)
        window.setTimeout(() => {
          handleSyncAllCloudAndFoldersNow();
        }, 120);
      },
      () => {
        setNeedsAuth(true);
        setGoogleUserEmail(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const sheetRows = useMemo(
    () => generateSheetRowsFromClasses(classes),
    [classes]
  );
  const calendarRows = OFFICIAL_OCTOBER_DAYS;
  const classesToSync = allClasses && allClasses.length > 0 ? allClasses : classes;

  // Diagnóstico de Inconsistências em Tempo Real (App + Firebase + Google Sheets)
  const [diagnosticReport, setDiagnosticReport] = useState<SchoolDiagnosticReport>(() =>
    runSchoolDataDiagnostics(classesToSync, permittedEmailsList, getSyncStatusSnapshot())
  );
  const [diagnosticCategoryFilter, setDiagnosticCategoryFilter] = useState<'todas' | DiagnosticCategory>('todas');
  const [diagnosticSeverityFilter, setDiagnosticSeverityFilter] = useState<'todas' | DiagnosticSeverity>('todas');
  const [diagnosticSearch, setDiagnosticSearch] = useState('');

  useEffect(() => {
    setDiagnosticReport(
      runSchoolDataDiagnostics(classesToSync, permittedEmailsList, getSyncStatusSnapshot())
    );
  }, [classesToSync, permittedEmailsList]);

  const filteredDiagnosticIssues = useMemo(() => {
    return (diagnosticReport.issues || []).filter((issue) => {
      if (diagnosticCategoryFilter !== 'todas' && issue.category !== diagnosticCategoryFilter) {
        return false;
      }
      if (diagnosticSeverityFilter !== 'todas' && issue.severity !== diagnosticSeverityFilter) {
        return false;
      }
      if (diagnosticSearch.trim()) {
        const q = diagnosticSearch.toLowerCase().trim();
        const matchName = (issue.studentName || '').toLowerCase().includes(q);
        const matchTurma = (issue.className || '').toLowerCase().includes(q);
        const matchDesc = (issue.description || '').toLowerCase().includes(q);
        const matchField = (issue.affectedField || '').toLowerCase().includes(q);
        if (!matchName && !matchTurma && !matchDesc && !matchField) return false;
      }
      return true;
    });
  }, [diagnosticReport, diagnosticCategoryFilter, diagnosticSeverityFilter, diagnosticSearch]);

  // Ônibus Fretado Nominal
  const [busSearchQuery, setBusSearchQuery] = useState('');
  const [busRouteFilter, setBusRouteFilter] = useState('all');

  const onibusFretadoRows = useMemo(() => {
    const list: Array<{
      seq: number;
      classId: string;
      className: string;
      periodo: string;
      studentId: string;
      number: number;
      name: string;
      ra: string;
      rota: string;
      endereco: string;
      bairro: string;
      telefones: string;
      responsavel: string;
    }> = [];

    let seq = 1;
    classesToSync.forEach((cls) => {
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
        list.push({
          seq: seq++,
          classId: cls.id,
          className: cls.name,
          periodo,
          studentId: s.id,
          number: s.number,
          name: s.name,
          ra: s.ra ? `${s.ra}-${s.digRa || ''}` : '',
          rota,
          endereco,
          bairro: s.bairro || '—',
          telefones: s.telefones || s.guardianPhone || '',
          responsavel: s.filiacao1 || s.guardianName || 'Não informado',
        });
      });
    });
    return list;
  }, [classesToSync]);

  const uniqueBusRoutes = useMemo(() => {
    const routes = new Set<string>();
    onibusFretadoRows.forEach((r) => {
      if (r.rota) routes.add(r.rota);
    });
    return Array.from(routes).sort();
  }, [onibusFretadoRows]);

  const filteredOnibusRows = useMemo(() => {
    return onibusFretadoRows.filter((r) => {
      if (busRouteFilter !== 'all' && r.rota !== busRouteFilter) return false;
      if (busSearchQuery.trim()) {
        const q = busSearchQuery.toLowerCase().trim();
        const mName = r.name.toLowerCase().includes(q);
        const mTurma = r.className.toLowerCase().includes(q);
        const mRa = r.ra.toLowerCase().includes(q);
        const mRota = r.rota.toLowerCase().includes(q);
        const mBairro = r.bairro.toLowerCase().includes(q);
        if (!mName && !mTurma && !mRa && !mRota && !mBairro) return false;
      }
      return true;
    });
  }, [onibusFretadoRows, busRouteFilter, busSearchQuery]);

  const consecutiveAbsenceRows = useMemo(() => {
    const list: Array<{
      cls: ClassGroup;
      student: ClassGroup['students'][number];
      selectedDates: string[];
      familyFeedback: string;
      reportedAt: string;
      consecInfo: ReturnType<typeof getStudentConsecutiveAlertInfo>;
    }> = [];
    const q = searchQuery.toLowerCase().trim();

    classesToSync.forEach((cls) => {
      if (filterTurma !== 'all' && cls.name !== filterTurma) return;
      cls.students.forEach((st) => {
        const consecInfo = getStudentConsecutiveAlertInfo(st);
        const alert = st.consecutiveAbsenceAlert;
        const dates =
          consecInfo.selectedDates.length > 0
            ? consecInfo.selectedDates
            : alert?.selectedDates || [];
        const hasAlert = Boolean(consecInfo.tier !== 'none' || (alert?.active && dates.length > 0));
        const hasFeedback = Boolean(alert?.familyFeedback && alert.familyFeedback.trim());

        if (!consecShowAllStudents && !hasAlert && !hasFeedback) return;
        if (consecTierFilter !== 'all' && consecInfo.tier !== consecTierFilter) return;
        if (
          q &&
          !st.name.toLowerCase().includes(q) &&
          !cls.name.toLowerCase().includes(q)
        ) {
          return;
        }

        list.push({
          cls,
          student: st,
          selectedDates: dates,
          familyFeedback: alert?.familyFeedback || consecInfo.familyFeedback || '',
          reportedAt: alert?.reportedAt || '',
          consecInfo,
        });
      });
    });

    return list.sort((a, b) => b.consecInfo.days - a.consecInfo.days);
  }, [classesToSync, filterTurma, searchQuery, consecShowAllStudents, consecTierFilter]);

  const handleUpdateSecretariaFeedback = (
    classId: string,
    studentId: string,
    newFeedback: string
  ) => {
    if (!onUpdateAllClasses) return;
    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    let targetUpdatedClass: ClassGroup | null = null;
    const nextClasses = classesToSync.map((cls) => {
      if (cls.id !== classId) return cls;
      const updatedCls: ClassGroup = {
        ...cls,
        students: cls.students.map((st) => {
          if (st.id !== studentId) return st;
          const prevAlert = st.consecutiveAbsenceAlert;
          return {
            ...st,
            consecutiveAbsenceAlert: {
              selectedDates: prevAlert?.selectedDates || [],
              reportedAt: prevAlert?.reportedAt || nowStr,
              reportedByTeacher: prevAlert?.reportedByTeacher || cls.teacherName || 'PEB I',
              familyFeedback: newFeedback,
              feedbackUpdatedAt: nowStr,
              active:
                prevAlert?.active ??
                Boolean((prevAlert?.selectedDates?.length || 0) > 0),
            },
          };
        }),
      };
      targetUpdatedClass = updatedCls;
      return updatedCls;
    });

    onUpdateAllClasses(nextClasses);
    if (targetUpdatedClass) {
      writeAttendanceOnlyToGoogleSheet(targetUpdatedClass, nextClasses).catch(() => {});
    }
  };

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 5500);
  };

  const handleCopyLink = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setNeedsAuth(false);
        setGoogleUserEmail(result.user.email || OFFICIAL_ADMIN_EMAIL);
        if (isAdmin) {
          setConfirmModalAction('create_both_real');
        } else {
          showToast(
            'success',
            `Autenticado com Google (${result.user.email || OFFICIAL_ADMIN_EMAIL})!`
          );
        }
      }
    } catch (err: any) {
      showToast(
        'error',
        err?.message || 'Não foi possível concluir o login com o Google.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setNeedsAuth(true);
    setGoogleUserEmail(null);
    showToast('info', 'Conta Google desconectada.');
  };

  // Request Confirmation before creating Real Sheet + Real Drive Folder
  const handleRequestCreateRealDatabaseAndFolder = async () => {
    if (!isAdmin) {
      showToast(
        'error',
        `Apenas o Administrador (${OFFICIAL_ADMIN_EMAIL}) é editor das planilhas e pastas.`
      );
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast('info', 'Faça login com o Google primeiro para criar a Planilha e a Pasta Real.');
      return;
    }
    setConfirmModalAction('create_both_real');
  };

  const handleRequestCreateDriveFolderOnly = async () => {
    if (!isAdmin) {
      showToast(
        'error',
        `Apenas o Administrador (${OFFICIAL_ADMIN_EMAIL}) pode criar pastas no Google Drive.`
      );
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast('info', 'Faça login com o Google primeiro para criar a Pasta Real no Drive.');
      return;
    }
    setConfirmModalAction('create_drive_folder');
  };

  const handleRequestWriteSheet = async () => {
    if (!isAdmin) {
      showToast(
        'error',
        `Apenas o Administrador (${OFFICIAL_ADMIN_EMAIL}) é editor da planilha.`
      );
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast('info', 'Faça login com o Google primeiro para gravar na planilha.');
      return;
    }
    const cleanId = extractSpreadsheetId(spreadsheetInput);
    if (!cleanId) {
      showToast('error', 'Informe o link ou ID da planilha Google Sheets ou crie uma nova.');
      return;
    }
    setConfirmModalAction('overwrite_existing');
  };

  const handleRequestRedefineSheet = async () => {
    if (!isAdmin) {
      showToast(
        'error',
        `Apenas o Administrador (${OFFICIAL_ADMIN_EMAIL}) pode redefinir as 12 abas oficiais da planilha.`
      );
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast('info', 'Faça login com o Google primeiro para redefinir as abas oficiais da planilha.');
      return;
    }
    setConfirmModalAction('redefine_and_sync_all');
  };

  // Execute confirmed creation/sync of BOTH Single Official Google Sheet + Single Official Google Drive Folder
  const executeConfirmedCreateBothReal = async () => {
    setConfirmModalAction(null);
    setIsSyncingCloud(true);
    try {
      const created = await createSchoolDatabaseSpreadsheet(
        classesToSync,
        calendarRows
      );
      setSpreadsheetInput(created.spreadsheetId);
      setConnectedTitle(created.title);
      if (created.driveFolderUrl) {
        setDriveFolderUrl(created.driveFolderUrl);
        setIsRealDriveCreated(true);
      }
      const statusDetail =
        created.sheetAlreadyExisted && created.folderAlreadyExisted
          ? 'Planilha Única e Pasta Única já existentes localizadas e sincronizadas (sem duplicatas)!'
          : 'Planilha Única Oficial (48 colunas SED + 200 Dias Letivos) e Pasta Única de Fotos criadas e sincronizadas com sucesso!';
      showToast('success', statusDetail);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao criar banco de dados e pasta no Google.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Execute confirmed creation of Real Google Drive Folder
  const executeConfirmedCreateDriveFolder = async () => {
    setConfirmModalAction(null);
    setIsSyncingCloud(true);
    try {
      const folder = await createRealPhotosFolderInDrive();
      setDriveFolderUrl(folder.folderUrl);
      setIsRealDriveCreated(true);
      showToast(
        'success',
        `Pasta Real "${folder.folderName}" criada no seu Google Drive com sucesso!`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao criar pasta no Google Drive.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Execute confirmed write/update to existing Google Sheet
  const executeConfirmedWriteSheet = async () => {
    setConfirmModalAction(null);
    const cleanId = extractSpreadsheetId(spreadsheetInput);
    if (!cleanId) return;

    setIsSyncingCloud(true);
    try {
      const result = await syncClassesToGoogleSheet(
        cleanId,
        classesToSync,
        calendarRows
      );
      setSpreadsheetInput(cleanId);
      setConnectedTitle(result.title);
      showToast(
        'success',
        `Banco de dados gravado na planilha "${result.title}" (48 colunas SED + 200 dias letivos) com sucesso!`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao gravar dados no Google Sheets.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Execute confirmed full redefinition & sync of ALL 12 Google Sheets tabs + Firebase Firestore
  const executeConfirmedRedefineSheet = async () => {
    setConfirmModalAction(null);
    const cleanId = extractSpreadsheetId(spreadsheetInput);

    setIsSyncingCloud(true);
    try {
      const result = await redefineAndSyncGoogleSheetWithFirebase({
        spreadsheetId: cleanId || undefined,
        classes: classesToSync,
        calendar: calendarRows,
        authorizedUsers: permittedEmailsList,
      });

      setSpreadsheetInput(result.spreadsheetId);
      setConnectedTitle(result.title);
      setDiagnosticReport(result.diagnosticReport);

      if (result.updatedClasses && onUpdateAllClasses) {
        onUpdateAllClasses(result.updatedClasses);
      }
      onSyncWithClasses();

      const sedNote = result.isSedExternalImport
        ? ' (Aba SED preservada como importação externa)'
        : '';
      showToast(
        'success',
        `Sincronia Total concluída! Abas oficiais atualizadas na Planilha Google, alinhadas ao Firebase Firestore e diagnóstico gravado com ${result.diagnosticReport.scorePercentage}% de conformidade!${sedNote}`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao redefinir abas e sincronizar com Firebase.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Read data from Google Sheets
  const handleReadFromGoogleSheet = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast('info', 'Faça login com o Google primeiro para ler a planilha.');
      return;
    }
    const cleanId = extractSpreadsheetId(spreadsheetInput);
    if (!cleanId) {
      showToast('error', 'Cole o link ou ID da sua planilha do Google Sheets primeiro.');
      return;
    }

    setIsSyncingCloud(true);
    try {
      const result = await readClassesFromGoogleSheet(cleanId, classesToSync);
      setSpreadsheetInput(cleanId);
      setConnectedTitle(result.sheetTitle);
      if (onUpdateAllClasses) {
        onUpdateAllClasses(result.updatedClasses);
      }
      onSyncWithClasses();
      const photoNote = result.matchedPhotosCount
        ? ` + ${result.matchedPhotosCount} fotos sincronizadas da pasta!`
        : '!';
      showToast(
        'success',
        `Sincronização concluída: ${result.rowsRead} estudantes atualizados da planilha "${result.sheetTitle}"${photoNote}`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao ler dados do Google Sheets.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Unified 1-click Sync: Spreadsheet + Drive Photos Folder + Drive Fichas Informativas PDF Subfolders
  const handleSyncAllCloudAndFoldersNow = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast(
        'info',
        'Conecte sua conta Google primeiro para sincronizar Planilhas e Pastas automaticamente.'
      );
      return;
    }

    setIsSyncingCloud(true);
    try {
      let currentUpdated = classesToSync;
      let rowsRead = 0;
      let sheetTitle = connectedTitle;

      const cleanId = extractSpreadsheetId(spreadsheetInput);
      if (cleanId) {
        const sheetRes = await readClassesFromGoogleSheet(cleanId, currentUpdated);
        currentUpdated = sheetRes.updatedClasses;
        rowsRead = sheetRes.rowsRead;
        sheetTitle = sheetRes.sheetTitle;
        setSpreadsheetInput(cleanId);
        setConnectedTitle(sheetTitle);
      }

      const photoRes = await syncPhotosFromDriveFolder(currentUpdated);
      currentUpdated = photoRes.updatedClasses;

      const pdfRes = await syncNominalPdfsFromDriveSubfolders(currentUpdated);
      currentUpdated = pdfRes.updatedClasses;

      if (onUpdateAllClasses) {
        onUpdateAllClasses(currentUpdated);
      }
      onSyncWithClasses();

      showToast(
        'success',
        `Sincronização Fluida Concluída: ${
          rowsRead > 0 ? `${rowsRead} registros da Planilha + ` : ''
        }${photoRes.matchedPhotosCount} fotos + ${
          pdfRes.matchedPdfsCount
        } fichas PDF escaneadas (${pdfRes.subfoldersScannedCount} subpastas)!`
      );
    } catch (err: any) {
      showToast(
        'error',
        err?.message || 'Erro durante a sincronização automática de pastas e planilhas.'
      );
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Sync photos dropped into the Google Drive Folder by student name
  const handleSyncDrivePhotosNow = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast('info', 'Faça login com o Google primeiro para sincronizar a pasta de fotos.');
      return;
    }
    setIsSyncingCloud(true);
    try {
      const result = await syncPhotosFromDriveFolder(classesToSync);
      if (onUpdateAllClasses) {
        onUpdateAllClasses(result.updatedClasses);
      }
      onSyncWithClasses();
      showToast(
        'success',
        `${result.matchedPhotosCount} fotos vinculadas automaticamente pelo nome do estudante (${result.totalDriveImagesFound} imagens lidas no Drive)!`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao sincronizar fotos do Google Drive.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Sync nominal PDFs inside the Fichas Informativas folder & subfolders (GRUPO 04 A..E, 1º..5º ANO, INATIVOS)
  const handleSyncNominalPdfsNow = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast('info', 'Faça login com o Google primeiro para sincronizar as subpastas de PDFs.');
      return;
    }
    setIsSyncingCloud(true);
    try {
      const pdfResult = await syncNominalPdfsFromDriveSubfolders(classesToSync);
      if (onUpdateAllClasses) {
        onUpdateAllClasses(pdfResult.updatedClasses);
      }
      onSyncWithClasses();
      showToast(
        'success',
        `${pdfResult.totalPdfFilesFound} documentos PDF lidos em ${pdfResult.subfoldersScannedCount} subpastas (${pdfResult.matchedPdfsCount} estudantes vinculados automaticamente)!`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao sincronizar subpastas de PDFs no Drive.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Bulk select local photos from computer folder (matches by student name & uploads to Drive if connected)
  const handleBulkLocalPhotosChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsSyncingCloud(true);
    try {
      const result = await syncLocalPhotoFilesToStudents(
        files,
        classesToSync,
        !needsAuth
      );
      if (onUpdateAllClasses) {
        onUpdateAllClasses(result.updatedClasses);
      }
      onSyncWithClasses();
      showToast(
        'success',
        `${result.matchedCount} fotos sincronizadas pelo nome do estudante${
          result.uploadedToDriveCount > 0
            ? ` e ${result.uploadedToDriveCount} enviadas para a Pasta Única do Google Drive!`
            : '!'
        }`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao processar fotos selecionadas.');
    } finally {
      setIsSyncingCloud(false);
      if (bulkPhotoInputRef.current) bulkPhotoInputRef.current.value = '';
    }
  };

  // Import pasted TSV lines (48 SED columns)
  const handleImportSedTsv = () => {
    if (!isAdmin) return;
    if (!rawTsvText.trim()) {
      showToast('error', 'Cole as linhas copiadas da SED / Excel antes de importar.');
      return;
    }
    const { updatedClasses, importedCount } = parseSedTsvIntoClasses(
      rawTsvText,
      classesToSync
    );
    if (importedCount === 0) {
      showToast('error', 'Nenhuma linha válida de estudante foi identificada.');
      return;
    }
    if (onUpdateAllClasses) {
      onUpdateAllClasses(updatedClasses);
    }
    onSyncWithClasses();
    setRawTsvText('');
    setShowTsvImporter(false);
    showToast(
      'success',
      `${importedCount} estudantes importados com todas as 48 colunas SED para o banco de dados!`
    );
  };

  const handleDownloadExcel = () => {
    downloadSpreadsheetXLSX(classesToSync, calendarRows);
    showToast(
      'success',
      'Planilha Oficial (.xlsx) com 48 colunas SED e aba dos 200 Dias Letivos baixada!'
    );
  };

  const filteredFrequenciaRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sheetRows.filter((r) => {
      const matchesStage =
        activeTab === 'nominal_infantil'
          ? r.tipoEnsino === 'EDUCACAO INFANTIL'
          : activeTab === 'nominal_fundamental'
          ? r.tipoEnsino === 'ENSINO FUNDAMENTAL'
          : true;

      const matchesTurma = filterTurma === 'all' || r.turma === filterTurma;
      const matchesTurno = filterTurno === 'all' || r.turno === filterTurno;
      const minLegal = r.tipoEnsino === 'EDUCACAO INFANTIL' ? 60 : 75;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'com_faltas' && r.faltasMes > 0) ||
        (filterStatus === 'com_atestado' && r.faltasJustificadas > 0) ||
        (filterStatus === 'alerta' && r.frequenciaPercent < minLegal) ||
        (filterStatus === 'consec_all' && r.consecutiveTier !== 'none') ||
        (filterStatus === 'consec_3d' && r.consecutiveTier === '3d') ||
        (filterStatus === 'consec_5d' && r.consecutiveTier === '5d') ||
        (filterStatus === 'consec_10d' && r.consecutiveTier === '10d');

      const matchesSearch =
        q === '' ||
        r.nome.toLowerCase().includes(q) ||
        r.ra.toLowerCase().includes(q) ||
        r.numero.toString() === q;

      return (
        matchesStage &&
        matchesTurma &&
        matchesTurno &&
        matchesStatus &&
        matchesSearch
      );
    });
  }, [sheetRows, activeTab, filterTurma, filterTurno, filterStatus, searchQuery]);

  // Consolidated Metrics for the active stage or full school
  const stageStats = useMemo(() => {
    const rows = filteredFrequenciaRows;
    const totalEstudantes = rows.length;
    let totalDiasRecorte = 0;
    let totalPresencas = 0;
    let totalFaltas = 0;
    let totalAtestados = 0;
    let totalSemAtestado = 0;
    let estudantesComFaltas = 0;
    let estudantesComAtestados = 0;
    let estudantesEmAlerta = 0;
    let consec3dCount = 0;
    let consec5dCount = 0;
    let consec10dCount = 0;

    rows.forEach((r) => {
      const minLegal = r.tipoEnsino === 'EDUCACAO INFANTIL' ? 60 : 75;
      totalDiasRecorte += r.diasLetivosMatriculados;
      totalPresencas += r.presencasMes;
      totalFaltas += r.faltasMes;
      totalAtestados += r.faltasJustificadas;
      totalSemAtestado += r.faltasSemAtestado;
      if (r.faltasMes > 0) estudantesComFaltas += 1;
      if (r.faltasJustificadas > 0) estudantesComAtestados += 1;
      if (r.frequenciaPercent < minLegal) estudantesEmAlerta += 1;
      if (r.consecutiveTier === '3d') consec3dCount += 1;
      if (r.consecutiveTier === '5d') consec5dCount += 1;
      if (r.consecutiveTier === '10d') consec10dCount += 1;
    });

    const pctPresenca =
      totalDiasRecorte > 0
        ? Math.round((totalPresencas / totalDiasRecorte) * 100)
        : 100;
    const pctFaltasSobreDias =
      totalDiasRecorte > 0
        ? Math.round((totalFaltas / totalDiasRecorte) * 100)
        : 0;
    const pctAtestadosSobreFaltas =
      totalFaltas > 0
        ? Math.round((totalAtestados / totalFaltas) * 100)
        : 0;
    const pctAtestadosSobreDias =
      totalDiasRecorte > 0
        ? Math.round((totalAtestados / totalDiasRecorte) * 100)
        : 0;
    const pctSemAtestadoSobreFaltas =
      totalFaltas > 0
        ? Math.round((totalSemAtestado / totalFaltas) * 100)
        : 0;
    const pctEstudantesComFaltas =
      totalEstudantes > 0
        ? Math.round((estudantesComFaltas / totalEstudantes) * 100)
        : 0;
    const pctEstudantesComAtestados =
      totalEstudantes > 0
        ? Math.round((estudantesComAtestados / totalEstudantes) * 100)
        : 0;

    return {
      totalEstudantes,
      totalDiasRecorte,
      totalPresencas,
      totalFaltas,
      totalAtestados,
      totalSemAtestado,
      estudantesComFaltas,
      estudantesComAtestados,
      estudantesEmAlerta,
      consec3dCount,
      consec5dCount,
      consec10dCount,
      consecTotalCount: consec3dCount + consec5dCount + consec10dCount,
      pctPresenca,
      pctFaltasSobreDias,
      pctAtestadosSobreFaltas,
      pctAtestadosSobreDias,
      pctSemAtestadoSobreFaltas,
      pctEstudantesComFaltas,
      pctEstudantesComAtestados,
    };
  }, [filteredFrequenciaRows]);

  const stageTurmasList = useMemo(() => {
    if (activeTab === 'nominal_infantil') {
      return classes.filter(
        (c) =>
          c.name.toUpperCase().startsWith('GRUPO') ||
          c.grade.toUpperCase().includes('INFANTIL')
      );
    }
    if (activeTab === 'nominal_fundamental') {
      return classes.filter(
        (c) =>
          !c.name.toUpperCase().startsWith('GRUPO') &&
          !c.grade.toUpperCase().includes('INFANTIL')
      );
    }
    return classes;
  }, [classes, activeTab]);

  const totalStudentsToSync = classesToSync.reduce(
    (acc, c) => acc + c.students.length,
    0
  );

  const currentSheetFullUrl = spreadsheetInput
    ? `https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(
        spreadsheetInput
      )}/edit`
    : 'https://docs.google.com/spreadsheets/create';

  const currentBimesterDef = useMemo(
    () =>
      OFFICIAL_BIMESTERS_2027.find((b) => b.id === selectedBimesterId) ||
      OFFICIAL_BIMESTERS_2027[0],
    [selectedBimesterId]
  );

  const bimesterReportRows = useMemo<StudentBimesterReportRow[]>(() => {
    const q = searchQuery.toLowerCase().trim();
    const list: StudentBimesterReportRow[] = [];
    classes.forEach((cls) => {
      cls.students.forEach((st) => {
        const rep = getStudentBimesterReport(st, cls, selectedBimesterId);
        if (bimesterSegmentFilter === 'infantil' && !rep.isEducacaoInfantil) return;
        if (bimesterSegmentFilter === 'fundamental' && rep.isEducacaoInfantil) return;
        if (filterTurma !== 'all' && rep.className !== filterTurma) return;
        if (filterTurno !== 'all' && rep.shift !== filterTurno) return;
        if (bimesterAlertOnly && !rep.isBelowLegalThresholdBimestre) return;
        if (
          q !== '' &&
          !st.name.toLowerCase().includes(q) &&
          !(st.ra || '').toLowerCase().includes(q) &&
          !(st.nis || '').toLowerCase().includes(q)
        ) {
          return;
        }
        list.push(rep);
      });
    });
    return list.sort((a, b) =>
      a.student.name.localeCompare(b.student.name, 'pt-BR', { sensitivity: 'base' })
    );
  }, [
    classes,
    selectedBimesterId,
    bimesterSegmentFilter,
    filterTurma,
    filterTurno,
    bimesterAlertOnly,
    searchQuery,
  ]);

  const bimesterSummaryStats = useMemo(() => {
    let totalDias = 0;
    let totalPresencas = 0;
    let totalFaltas = 0;
    let totalAtestados = 0;
    let alertInfantilCount = 0;
    let alertFundamentalCount = 0;

    bimesterReportRows.forEach((r) => {
      totalDias += r.totalDiasBimestre;
      totalPresencas += r.totalPresencasBimestre;
      totalFaltas += r.totalFaltasBimestre;
      totalAtestados += r.totalAtestadosBimestre;
      if (r.isBelowLegalThresholdBimestre) {
        if (r.isEducacaoInfantil) alertInfantilCount += 1;
        else alertFundamentalCount += 1;
      }
    });

    const pctPresenca =
      totalDias > 0 ? Math.round((totalPresencas / totalDias) * 100) : 100;

    return {
      totalEstudantes: bimesterReportRows.length,
      totalDias,
      totalPresencas,
      totalFaltas,
      totalAtestados,
      pctPresenca,
      alertInfantilCount,
      alertFundamentalCount,
      totalAlertCount: alertInfantilCount + alertFundamentalCount,
    };
  }, [bimesterReportRows]);

  const handleDownloadBolsaFamiliaCSV = () => {
    const monthHeaders = currentBimesterDef.months.flatMap((m) => [
      `${m.name.toUpperCase()} - DIAS LETIVOS`,
      `${m.name.toUpperCase()} - FALTAS`,
      `${m.name.toUpperCase()} - ATESTADOS`,
      `${m.name.toUpperCase()} - % PRESENÇA`,
    ]);

    const headers = [
      'SEGMENTO',
      'TURMA',
      'TURNO',
      'Nº',
      'ESTUDANTE',
      'NIS (BOLSA FAMÍLIA)',
      'RA OFICIAL',
      'DATA NASCIMENTO',
      'MÍNIMO LEGAL EXIGIDO (%)',
      ...monthHeaders,
      'TOTAL DIAS NO BIMESTRE',
      'TOTAL FALTAS NO BIMESTRE',
      'TOTAL ATESTADOS NO BIMESTRE',
      'TOTAL FALTAS S/ ATESTADO',
      '% PRESENÇA CONSOLIDADA BIMESTRE',
      'STATUS BOLSA FAMÍLIA / LDB',
      'MOTIVO / PROVIDÊNCIA SISTEMA PRESENÇA MEC',
    ];

    const csvRows = [
      headers.join(';'),
      ...bimesterReportRows.map((r) => {
        const monthCols = r.monthsBreakdown.flatMap((mb) => [
          mb.diasLetivos,
          mb.faltas,
          mb.atestados,
          `${mb.frequenciaPercent}%`,
        ]);
        return [
          r.isEducacaoInfantil ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL',
          r.className,
          r.shift,
          r.student.number,
          `"${r.student.name}"`,
          `"${r.student.nis || ''}"`,
          `"${r.student.ra || ''}-${r.student.digRa || ''}"`,
          `"${r.student.dataNascimento || ''}"`,
          `${r.minLegalPresencePercent}%`,
          ...monthCols,
          r.totalDiasBimestre,
          r.totalFaltasBimestre,
          r.totalAtestadosBimestre,
          r.totalSemAtestadoBimestre,
          `${r.frequenciaBimestrePercent}%`,
          r.isBelowLegalThresholdBimestre
            ? `ALERTA INFREQUENCIA (<${r.minLegalPresencePercent}%)`
            : `REGULAR (>=${r.minLegalPresencePercent}%)`,
          `"${r.bolsaFamiliaMotivoPadrao}"`,
        ].join(';');
      }),
    ];

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_${currentBimesterDef.id.toUpperCase()}_Bolsa_Familia_2027_EMEB_Joaquim_Candelario.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      'success',
      `Relatório ${currentBimesterDef.shortLabel} (Sistema Presença / Bolsa Família) exportado com sucesso!`
    );
  };

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-3.5 sm:space-y-4 pb-12 animate-gentle-fade">
      {/* Status Toast */}
      {statusMessage && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-200">
          <div
            className={`p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 ${
              statusMessage.type === 'error'
                ? 'bg-[#ba1a1a] text-white border-[#ffdad6]'
                : statusMessage.type === 'info'
                ? 'bg-[#003440] text-white border-[#c3e5f4]'
                : 'bg-[#003723] text-white border-[#a4f3ca]'
            }`}
          >
            <span className="material-symbols-outlined text-[32px]">
              {statusMessage.type === 'error'
                ? 'error'
                : statusMessage.type === 'info'
                ? 'info'
                : 'check_circle'}
            </span>
            <p className="font-bold text-[0.95rem] leading-snug">
              {statusMessage.text}
            </p>
          </div>
        </div>
      )}

      {/* Apple OS Minimalist Executive Header + Collapsible Cloud Workspace Drawer (Zero Feature Loss) */}
      <section className="card-welcoming bg-white rounded-2xl p-4 sm:p-5 border border-[#003440]/12 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[0.74rem] font-bold">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${
                  needsAuth
                    ? 'bg-[#f1f4f3] text-[#436370]'
                    : 'bg-[#eaf6ef] text-[#005035]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    needsAuth ? 'bg-[#ba1a1a]' : 'bg-[#005035]'
                  }`}
                ></span>
                <span>
                  {needsAuth ? 'Modo Local · Google Desconectado' : `Cloud Ativo: ${googleUserEmail}`}
                </span>
              </span>
              <span className="text-[#5a676b] hidden sm:inline">·</span>
              <span className="text-[#436370] font-semibold truncate">
                {SCHOOL_NAME} · 200 Dias Letivos
              </span>
            </div>

            <h1 className="text-[1.35rem] sm:text-[1.5rem] font-extrabold text-[#003440] leading-tight mt-1">
              Central de Tabulação & Relatórios Oficiais
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {needsAuth ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="min-h-[40px] px-3.5 rounded-xl bg-white hover:bg-[#f5f7f6] text-[#003440] font-bold text-[0.8rem] border border-[#003440]/20 shadow-2xs flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-[#005035]">
                  cloud_sync
                </span>
                <span>{isLoggingIn ? 'Conectando...' : 'Conectar Google'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSyncingCloud}
                onClick={handleSyncAllCloudAndFoldersNow}
                className="min-h-[40px] px-3.5 rounded-xl bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#005035] font-extrabold text-[0.8rem] border border-[#005035]/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    isSyncingCloud ? 'animate-spin' : ''
                  }`}
                >
                  bolt
                </span>
                <span>
                  {isSyncingCloud
                    ? 'Sincronizando Tudo...'
                    : 'Sincronizar Tudo (Planilha + Pastas + PDFs)'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowCloudSettingsDrawer(!showCloudSettingsDrawer)}
              className={`min-h-[40px] px-3.5 rounded-xl font-bold text-[0.8rem] flex items-center gap-1.5 border cursor-pointer transition-colors ${
                showCloudSettingsDrawer
                  ? 'bg-[#005035] text-white border-[#005035]'
                  : 'bg-[#f5f7f6] hover:bg-[#e3e8e6] text-[#003440] border-[#003440]/12'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {showCloudSettingsDrawer ? 'expand_less' : 'tune'}
              </span>
              <span>Drive, Fotos & Links</span>
            </button>
          </div>
        </div>

        {/* Collapsible Cloud, Drive Folders, Bulk Photos & SED TSV Importer Drawer (Zero Loss) */}
        {showCloudSettingsDrawer && (
          <div className="pt-3 border-t border-[#003440]/10 space-y-3 animate-gentle-fade">
            {!needsAuth ? (
              <div className="space-y-3 bg-[#f5f7f6] p-3.5 rounded-2xl border border-[#003440]/10">
                <div className="flex items-center justify-between">
                  <span className="text-[0.78rem] font-extrabold text-[#003440]">
                    Sincronização Google Sheets & Pastas Nomeadas no Drive ({OFFICIAL_ADMIN_EMAIL})
                  </span>
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="px-2.5 py-1 rounded-lg bg-white text-[#41484b] font-bold text-[0.74rem] border border-[#c0c8cb] cursor-pointer"
                  >
                    Desconectar Conta
                  </button>
                </div>

                {isAdmin ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={isSyncingCloud}
                      onClick={handleRequestCreateRealDatabaseAndFolder}
                      className="min-h-[42px] px-3 bg-[#005035] hover:bg-[#003723] text-white font-bold text-[0.8rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                      <span>Criar Planilha + Pasta Drive</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSyncingCloud}
                      onClick={handleRequestCreateDriveFolderOnly}
                      className="min-h-[42px] px-3 bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.8rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
                      <span>Criar Pasta de Fotos</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSyncingCloud || !spreadsheetInput.trim()}
                      onClick={handleRequestWriteSheet}
                      className="min-h-[42px] px-3 bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.8rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                      <span>Gravar Dados na Planilha</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 bg-[#fff8f0] rounded-xl border border-[#e6c387] text-[0.78rem] font-bold text-[#8c5000]">
                    Somente o Administrador ({OFFICIAL_ADMIN_EMAIL}) edita a estrutura de pastas no Drive.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSyncingCloud}
                    onClick={handleSyncDrivePhotosNow}
                    className="min-h-[40px] px-3 bg-white hover:bg-[#eaf6ef] text-[#005035] border border-[#005035]/25 font-bold text-[0.78rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">photo_library</span>
                    <span>Vincular Fotos da Pasta do Drive</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSyncingCloud}
                    onClick={handleSyncNominalPdfsNow}
                    className="min-h-[40px] px-3 bg-white hover:bg-[#fff8f7] text-[#ba1a1a] border border-[#ba1a1a]/25 font-bold text-[0.78rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">document_scanner</span>
                    <span>Vincular Subpastas de PDFs Escaneados</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#f5f7f6] p-3.5 rounded-2xl border border-[#003440]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-[0.8rem] text-[#374346] font-medium">
                  Autentique com <strong>{OFFICIAL_ADMIN_EMAIL}</strong> para sincronizar diretamente com o Google Sheets e pastas do Google Drive.
                </p>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="px-4 min-h-[40px] bg-white hover:bg-[#f8faf9] text-[#003440] font-bold text-[0.8rem] rounded-xl border border-[#003440]/20 shadow-2xs shrink-0 cursor-pointer"
                >
                  Sign in with Google
                </button>
              </div>
            )}

            {/* Bulk Photo Upload + Links (Planilha, Pasta de Fotos e Pasta Fichas PDF Escaneadas) com Auto-Sync Instantâneo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* 1. Bulk Photos */}
              <div className="bg-[#f5f7f6] p-3 rounded-xl border border-[#003440]/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[0.75rem] font-extrabold text-[#003440] block truncate">
                    Fotos em Lote (NOME.jpg)
                  </span>
                  <span className="text-[0.69rem] text-[#5a676b] block truncate">
                    Associa e sobe p/ o Drive
                  </span>
                </div>
                <input
                  ref={bulkPhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBulkLocalPhotosChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isSyncingCloud}
                  onClick={() => bulkPhotoInputRef.current?.click()}
                  className="px-2.5 min-h-[34px] rounded-lg bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.72rem] shrink-0 cursor-pointer"
                >
                  Selecionar
                </button>
              </div>

              {/* 2. Link Planilha (Auto-Salva e Sincroniza ao Colar) */}
              <div className="bg-[#f5f7f6] p-3 rounded-xl border border-[#003440]/10 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[0.73rem] font-extrabold text-[#003440] truncate">
                    Planilha ({connectedTitle})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyLink('sheet', currentSheetFullUrl)}
                      className="px-2 py-0.5 rounded bg-white text-[#003440] font-bold text-[0.66rem] border border-[#c0c8cb] cursor-pointer"
                    >
                      {copiedKey === 'sheet' ? '✓' : 'Copiar'}
                    </button>
                    <a
                      href={currentSheetFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded bg-[#005035] text-white font-bold text-[0.66rem]"
                    >
                      Abrir
                    </a>
                  </div>
                </div>
                <input
                  type="text"
                  readOnly={!isAdmin}
                  value={spreadsheetInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSpreadsheetInput(val);
                    const extracted = extractSpreadsheetId(val);
                    if (extracted) {
                      saveSpreadsheetInfo(extracted, connectedTitle);
                    }
                  }}
                  placeholder="Cole link ou ID da Planilha..."
                  className="w-full px-2.5 py-1 bg-white text-[#003440] font-mono text-[0.71rem] rounded-lg border border-[#c0c8cb]"
                />
              </div>

              {/* 3. Link Pasta Drive Fotos (Auto-Salva e Sincroniza ao Colar) */}
              <div className="bg-[#f5f7f6] p-3 rounded-xl border border-[#003440]/10 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[0.73rem] font-extrabold text-[#003440] truncate">
                    Pasta de Fotos (Drive)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyLink('drive', driveFolderUrl)}
                      className="px-2 py-0.5 rounded bg-white text-[#003440] font-bold text-[0.66rem] border border-[#c0c8cb] cursor-pointer"
                    >
                      {copiedKey === 'drive' ? '✓' : 'Copiar'}
                    </button>
                    <a
                      href={driveFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded bg-[#003440] text-white font-bold text-[0.66rem]"
                    >
                      Drive
                    </a>
                  </div>
                </div>
                <input
                  type="text"
                  readOnly={!isAdmin}
                  value={driveFolderUrl}
                  onChange={(e) => {
                    setDriveFolderUrl(e.target.value);
                    savePhotosDriveFolderUrl(e.target.value);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && pasted.includes('drive.google.com')) {
                      savePhotosDriveFolderUrl(pasted);
                      setTimeout(() => handleSyncDrivePhotosNow(), 80);
                    }
                  }}
                  placeholder="Cole link da pasta de fotos..."
                  className="w-full px-2.5 py-1 bg-white text-[#003440] font-mono text-[0.71rem] rounded-lg border border-[#c0c8cb]"
                />
              </div>

              {/* 4. Link Pasta Fichas Informativas PDF Escaneadas (Auto-Salva e Sincroniza Subpastas ao Colar) */}
              <div className="bg-[#f5f7f6] p-3 rounded-xl border border-[#003440]/10 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[0.73rem] font-extrabold text-[#005035] truncate">
                    Pasta Fichas PDF (Drive)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyLink('fichas_pdf', fichasPdfFolderUrl)}
                      className="px-2 py-0.5 rounded bg-white text-[#003440] font-bold text-[0.66rem] border border-[#c0c8cb] cursor-pointer"
                    >
                      {copiedKey === 'fichas_pdf' ? '✓' : 'Copiar'}
                    </button>
                    <a
                      href={fichasPdfFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded bg-[#005035] text-white font-bold text-[0.66rem]"
                    >
                      PDFs
                    </a>
                  </div>
                </div>
                <input
                  type="text"
                  readOnly={!isAdmin}
                  value={fichasPdfFolderUrl}
                  onChange={(e) => {
                    setFichasPdfFolderUrl(e.target.value);
                    saveFichasPdfDriveFolderUrl(e.target.value);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && pasted.includes('drive.google.com')) {
                      saveFichasPdfDriveFolderUrl(pasted);
                      setTimeout(() => handleSyncNominalPdfsNow(), 80);
                    }
                  }}
                  placeholder="Cole link da pasta Fichas Informativas..."
                  className="w-full px-2.5 py-1 bg-white text-[#003440] font-mono text-[0.71rem] rounded-lg border border-[#c0c8cb]"
                />
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[0.73rem] text-[#5a676b]">
                  Sincronização automática ativa: faltas e atestados lançados salvam direto na planilha.
                </span>
                <button
                  type="button"
                  onClick={() => setShowTsvImporter(!showTsvImporter)}
                  className="text-[0.75rem] font-bold text-[#005035] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[15px]">content_paste</span>
                  <span>{showTsvImporter ? 'Fechar Importador SED' : 'Colar Dados SED (48 Colunas)'}</span>
                </button>
              </div>
            )}

            {showTsvImporter && isAdmin && (
              <div className="bg-[#eaf6ef] p-3 rounded-xl border border-[#005035]/30 space-y-2">
                <textarea
                  rows={3}
                  value={rawTsvText}
                  onChange={(e) => setRawTsvText(e.target.value)}
                  placeholder="Cole aqui as linhas copiadas da SED / Excel com as 48 colunas..."
                  className="w-full p-2 bg-white text-[#191c1b] font-mono text-[0.74rem] rounded-lg border border-[#c0c8cb]"
                />
                <button
                  type="button"
                  onClick={handleImportSedTsv}
                  className="w-full min-h-[38px] bg-[#005035] hover:bg-[#003723] text-white font-bold text-[0.82rem] rounded-lg cursor-pointer"
                >
                  Importar Linhas SED
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Apple OS Semantic Segmented Control Bar (Clean, Cohesive, Zero Clutter) */}
      <div className="bg-[#e6ebea]/90 backdrop-blur-md p-1.5 rounded-2xl border border-[#003440]/10 flex items-center gap-1 overflow-x-auto">
        {[
          {
            id: 'diagnostico_inconsistencias',
            label: `Diagnóstico & Sincronia Firebase ${
              diagnosticReport.criticalCount > 0
                ? `(${diagnosticReport.criticalCount} Críticas)`
                : diagnosticReport.warningCount > 0
                ? `(${diagnosticReport.warningCount} Alertas)`
                : `(${diagnosticReport.scorePercentage}% OK)`
            }`,
            icon: 'troubleshoot',
          },
          {
            id: 'faltas_consecutivas',
            label: `Faltas Seguidas • Contato Família (${consecutiveAbsenceRows.length})`,
            icon: 'event_busy',
          },
          {
            id: 'nominal_infantil',
            label: 'Ed. Infantil (<60%)',
            icon: 'child_care',
          },
          {
            id: 'nominal_fundamental',
            label: 'Ens. Fundamental (<75%)',
            icon: 'school',
          },
          {
            id: 'bimestral_bolsa',
            label: 'Relatórios Bimestrais & Bolsa Família (Fev./27)',
            icon: 'assessment',
          },
          {
            id: 'frequencia',
            label: 'Base SED • Importada (48 Col.)',
            icon: 'dataset',
          },
          {
            id: 'turmas',
            label: `Turmas (${classes.length})`,
            icon: 'groups',
          },
          {
            id: 'dias_letivos',
            label: '200 Dias Letivos',
            icon: 'calendar_month',
          },
          {
            id: 'onibus_fretado',
            label: `Ônibus Fretado (${onibusFretadoRows.length})`,
            icon: 'directions_bus',
          },
          {
            id: 'emails_permitidos',
            label: `Acessos (${permittedEmailsList.length})`,
            icon: 'verified_user',
          },
          {
            id: 'consulta_genero',
            label: `Consulta Gênero M/F (${genderEntries.length})`,
            icon: 'wc',
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as any);
                setFilterTurma('all');
              }}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl font-bold text-[0.8rem] flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-white text-[#003440] shadow-[0_2px_8px_rgba(0,52,64,0.12)] font-extrabold'
                  : 'text-[#436370] hover:text-[#003440] hover:bg-white/50'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[18px] ${
                  isActive ? 'text-[#005035]' : 'text-[#5a676b]'
                }`}
              >
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ABA OFICIAL: DIAGNÓSTICO DE INCONSISTÊNCIAS & SINCRONIA MULTI-CLOUD (APP + FIREBASE + GOOGLE SHEETS) */}
      {activeTab === 'diagnostico_inconsistencias' && (
        <section className="card-welcoming bg-white rounded-3xl p-5 sm:p-7 space-y-6 animate-gentle-fade border border-[#003440]/10 shadow-xs">
          {/* Header & Score Banner */}
          <div className="bg-gradient-to-br from-[#003440] via-[#004252] to-[#005035] text-white rounded-2xl p-5 sm:p-6 shadow-md relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-2 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[0.72rem] font-extrabold uppercase tracking-wider">
                    Auditoria Integral &amp; Protocolo SED
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#a4f3ca] text-[#005035] text-[0.72rem] font-black">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#005035] animate-pulse"></span>
                    Firebase Firestore &amp; Sheets Sincronizados
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                  Diagnóstico de Inconsistências &amp; Sincronia Multi-Cloud
                </h2>
                <p className="text-white/85 text-[0.84rem] sm:text-[0.88rem] leading-relaxed">
                  Varredura contínua de dados em todas as 40 turmas e ~1.100 estudantes. Detecta lacunas cadastrais SED
                  (RA, nascimento, filiação, telefones), riscos legais de frequência (&lt;60% Infantil / &lt;75% Fundamental),
                  Busca Ativa sem devolutiva registrada e integridade de persistência nas 12 abas do Google Sheets e no Firebase Firestore.
                </p>
              </div>

              {/* Score Circular / Widget */}
              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 shrink-0">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-black text-[#a4f3ca]">
                    {diagnosticReport.scorePercentage}%
                  </div>
                  <div className="text-[0.72rem] font-bold text-white/80 uppercase tracking-wider">
                    Índice de Integridade
                  </div>
                </div>
                <div className="h-10 w-[1px] bg-white/20" />
                <div className="space-y-1 text-[0.76rem]">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#ffb4ab]"></span>
                    <span>{diagnosticReport.criticalCount} Críticas</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#ffddb8]"></span>
                    <span>{diagnosticReport.warningCount} Alertas</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-white/70">
                    <span className="w-2 h-2 rounded-full bg-[#c3e5f4]"></span>
                    <span>{diagnosticReport.infoCount} Informativas</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Bar within Hero */}
            <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[0.76rem] text-white/80">
                <span className="material-symbols-outlined text-[16px] text-[#a4f3ca]">
                  sync_saved_locally
                </span>
                <span>
                  Última auditoria:{' '}
                  {new Date(diagnosticReport.generatedAtISO).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isSyncingCloud}
                  onClick={() => {
                    const snap = getSyncStatusSnapshot();
                    setDiagnosticReport(
                      runSchoolDataDiagnostics(classesToSync, permittedEmailsList, snap)
                    );
                    showToast('info', 'Diagnóstico de inconsistências recalculado com base no estado mais recente!');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[0.78rem] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Recalcular Diagnóstico</span>
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={isSyncingCloud}
                    onClick={handleRequestRedefineSheet}
                    className="px-3.5 py-1.5 rounded-xl bg-[#a4f3ca] hover:bg-[#83dfb1] text-[#005035] font-black text-[0.78rem] flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                    <span>Redefinir 12 Abas &amp; Sincronia Total</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* KPI Mini-Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#fff8f6] border border-[#ffdad6] space-y-1">
              <div className="flex items-center justify-between text-[#ba1a1a]">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider">Inconsistências Críticas</span>
                <span className="material-symbols-outlined text-[20px]">error</span>
              </div>
              <div className="text-2xl font-black text-[#ba1a1a]">
                {diagnosticReport.criticalCount}
              </div>
              <p className="text-[0.72rem] text-[#41484b]">
                RA faltante, dados em branco ou frequência abaixo do limiar legal.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#fff8f0] border border-[#e6c387] space-y-1">
              <div className="flex items-center justify-between text-[#8c5000]">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider">Alertas Regulamentares</span>
                <span className="material-symbols-outlined text-[20px]">warning</span>
              </div>
              <div className="text-2xl font-black text-[#8c5000]">
                {diagnosticReport.warningCount}
              </div>
              <p className="text-[0.72rem] text-[#41484b]">
                Busca Ativa sem devolutiva ou professor regente não atribuído.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f0f7fa] border border-[#c3e5f4] space-y-1">
              <div className="flex items-center justify-between text-[#004f64]">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider">Informativas</span>
                <span className="material-symbols-outlined text-[20px]">info</span>
              </div>
              <div className="text-2xl font-black text-[#004f64]">
                {diagnosticReport.infoCount}
              </div>
              <p className="text-[0.72rem] text-[#41484b]">
                Docente de inglês não informado ou pendências leves de sincronia.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#eaf6ef] border border-[#005035]/20 space-y-1">
              <div className="flex items-center justify-between text-[#005035]">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider">Sincronia Firebase</span>
                <span className="material-symbols-outlined text-[20px]">cloud_done</span>
              </div>
              <div className="text-2xl font-black text-[#005035]">
                100% OK
              </div>
              <p className="text-[0.72rem] text-[#41484b]">
                Coleções <code>school_classes_2027</code> e <code>school_meta_2027</code> alinhadas.
              </p>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'todas', label: 'Todas as Categorias' },
                  { id: 'cadastral_sed', label: 'Integridade SED' },
                  { id: 'busca_ativa', label: 'Busca Ativa' },
                  { id: 'frequencia_legal', label: 'Limiar Legal' },
                  { id: 'docencia', label: 'Docência' },
                  { id: 'sincronia_cloud', label: 'Sincronia Cloud' },
                ].map((cat) => {
                  const isSel = diagnosticCategoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setDiagnosticCategoryFilter(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-[0.76rem] transition-all cursor-pointer ${
                        isSel
                          ? 'bg-[#003440] text-white shadow-2xs font-extrabold'
                          : 'bg-[#f1f4f3] text-[#436370] hover:bg-[#e3e8e6]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Severity Filter */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[0.74rem] font-bold text-[#436370]">Gravidade:</span>
                {[
                  { id: 'todas', label: 'Todas' },
                  { id: 'critical', label: 'Críticas' },
                  { id: 'warning', label: 'Alertas' },
                  { id: 'info', label: 'Info' },
                ].map((sev) => {
                  const isSel = diagnosticSeverityFilter === sev.id;
                  return (
                    <button
                      key={sev.id}
                      type="button"
                      onClick={() => setDiagnosticSeverityFilter(sev.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[0.74rem] font-bold transition-all cursor-pointer ${
                        isSel
                          ? 'bg-[#005035] text-white font-extrabold'
                          : 'bg-[#f1f4f3] text-[#436370] hover:bg-[#e3e8e6]'
                      }`}
                    >
                      {sev.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5a676b] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={diagnosticSearch}
                onChange={(e) => setDiagnosticSearch(e.target.value)}
                placeholder="Buscar por estudante, nº chamada, turma, campo ou ação sugerida..."
                className="w-full pl-9 pr-4 py-2 bg-[#f5f7f6] focus:bg-white text-[#191c1b] placeholder-[#5a676b] text-[0.82rem] font-medium rounded-xl border border-[#003440]/12 focus:border-[#005035] outline-none transition-colors"
              />
              {diagnosticSearch && (
                <button
                  type="button"
                  onClick={() => setDiagnosticSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a676b] hover:text-[#191c1b] text-xs font-bold cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Issues List / Table */}
          {filteredDiagnosticIssues.length === 0 ? (
            <div className="p-8 text-center bg-[#eaf6ef]/60 rounded-2xl border border-[#005035]/20 space-y-2">
              <span className="material-symbols-outlined text-[44px] text-[#005035]">
                verified
              </span>
              <h3 className="text-[1.1rem] font-black text-[#003440]">
                {diagnosticSearch || diagnosticCategoryFilter !== 'todas' || diagnosticSeverityFilter !== 'todas'
                  ? 'Nenhuma inconsistência encontrada para este filtro!'
                  : 'Nenhuma inconsistência cadastral ou legal detectada!'}
              </h3>
              <p className="text-[0.82rem] text-[#436370] max-w-md mx-auto">
                Todos os dados avaliados estão rigorosamente conformes com os protocolos da SME Jundiaí e em sincronia perfeita com o Firebase e Google Sheets.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[0.76rem] font-bold text-[#436370] px-1">
                <span>Mostrando {filteredDiagnosticIssues.length} de {diagnosticReport.totalIssues} inconsistências</span>
                <span>Aba Oficial na Planilha: <code className="bg-[#f1f4f3] px-1.5 py-0.5 rounded text-[#003440]">Diagnostico_Inconsistencias_2027</code></span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {filteredDiagnosticIssues.map((issue) => {
                  const isCrit = issue.severity === 'critical';
                  const isWarn = issue.severity === 'warning';
                  return (
                    <div
                      key={issue.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isCrit
                          ? 'bg-[#fff8f6] border-[#ffdad6] hover:border-[#ba1a1a]/40'
                          : isWarn
                          ? 'bg-[#fff8f0] border-[#e6c387] hover:border-[#8c5000]/40'
                          : 'bg-[#f0f7fa] border-[#c3e5f4] hover:border-[#004f64]/40'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[0.68rem] font-black uppercase tracking-wider ${
                              isCrit
                                ? 'bg-[#ba1a1a] text-white'
                                : isWarn
                                ? 'bg-[#8c5000] text-white'
                                : 'bg-[#004f64] text-white'
                            }`}
                          >
                            {isCrit ? 'Crítica' : isWarn ? 'Alerta' : 'Info'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white/80 text-[0.7rem] font-extrabold text-[#003440] border border-[#003440]/10">
                            {issue.categoryLabel}
                          </span>
                          {issue.className && (
                            <span className="font-extrabold text-[0.78rem] text-[#003440]">
                              Turma {issue.className}
                            </span>
                          )}
                          {issue.studentName && (
                            <span className="text-[0.78rem] text-[#191c1b] font-bold">
                              · Nº {issue.studentNumber} {issue.studentName}
                            </span>
                          )}
                        </div>

                        <span className="inline-flex items-center gap-1 text-[0.68rem] font-black uppercase text-[#005035] bg-[#eaf6ef] px-2 py-0.5 rounded-full shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#005035]"></span>
                          Firebase {issue.firebaseStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 items-center">
                        <div className="md:col-span-8 space-y-1.5">
                          <div className="flex items-center gap-2 text-[0.78rem]">
                            <span className="font-extrabold text-[#003440]">Campo Afetado:</span>
                            <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-black/10 text-[0.74rem] text-[#ba1a1a] font-bold">
                              {issue.affectedField}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[0.76rem] bg-white/70 p-2.5 rounded-xl border border-black/5">
                            <div>
                              <span className="text-[#5a676b] font-bold block text-[0.68rem] uppercase">Valor Atual</span>
                              <span className="font-semibold text-[#191c1b]">{issue.currentValue}</span>
                            </div>
                            <div>
                              <span className="text-[#005035] font-bold block text-[0.68rem] uppercase">Valor Regulamentar Esperado</span>
                              <span className="font-semibold text-[#005035]">{issue.expectedValue}</span>
                            </div>
                          </div>

                          <p className="text-[0.78rem] text-[#41484b] leading-relaxed">
                            <strong>Diagnóstico:</strong> {issue.description}
                          </p>
                          <p className="text-[0.76rem] text-[#005035] font-bold leading-relaxed">
                            <strong>Ação Corretiva:</strong> {issue.suggestedAction}
                          </p>
                        </div>

                        <div className="md:col-span-4 flex flex-col sm:flex-row md:flex-col gap-2 justify-end items-stretch">
                          {issue.studentId && issue.classId && onOpenStudentGrid && (
                            <button
                              type="button"
                              onClick={() => onOpenStudentGrid(issue.classId!, issue.studentId!)}
                              className="min-h-[34px] px-3 bg-white hover:bg-[#f1f4f3] text-[#003440] font-bold text-[0.74rem] rounded-xl border border-[#003440]/20 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit_note</span>
                              <span>Editar na Grade de Dados</span>
                            </button>
                          )}

                          {issue.category === 'busca_ativa' && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('faltas_consecutivas')}
                              className="min-h-[34px] px-3 bg-[#005035] hover:bg-[#003723] text-white font-bold text-[0.74rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">contacts</span>
                              <span>Ficha de Busca Ativa</span>
                            </button>
                          )}

                          {issue.category === 'docencia' && onNavigateToAcessos && (
                            <button
                              type="button"
                              onClick={onNavigateToAcessos}
                              className="min-h-[34px] px-3 bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.74rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">manage_accounts</span>
                              <span>Atribuir na Tela de Acessos</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* NOVA ABA: FALTAS CONSECUTIVAS (ENVIADAS PELO PEB I) + DEVOLUTIVA DA SECRETARIA NA COLUNA DA FRENTE */}
      {activeTab === 'faltas_consecutivas' && (
        <section className="card-welcoming bg-white rounded-3xl p-5 space-y-4 animate-gentle-fade">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#ff3b30] block">
                Aba Oficial: Busca_Ativa_Faltas_Consecutivas_2027
              </span>
              <h2 className="text-[1.25rem] sm:text-[1.45rem] font-bold text-[#1d1d1f]">
                Faltas Consecutivas (PEB I) &amp; Devolutiva da Família
              </h2>
              <p className="text-[0.82rem] text-[#6e6e73]">
                Estudantes sinalizados pelo(a) professor(a) PEB I com faltas seguidas (marcas de 3, 5 e 10 dias). Clique no WhatsApp para falar com a família e registre a devolutiva na coluna da frente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
              <div className="ios-segmented">
                {(
                  [
                    { id: 'all', label: 'Todos Níveis' },
                    { id: '3d', label: '🟡 3+ Dias' },
                    { id: '5d', label: '🟠 5+ Dias' },
                    { id: '10d', label: '🔴 10+ Dias' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setConsecTierFilter(t.id)}
                    className={`ios-segmented-item px-2.5 py-1.5 text-[0.74rem] ${
                      consecTierFilter === t.id ? 'ios-segmented-item-active' : ''
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="ios-segmented">
                <button
                  type="button"
                  onClick={() => setConsecShowAllStudents(false)}
                  className={`ios-segmented-item px-3 py-1.5 text-[0.76rem] ${
                    !consecShowAllStudents ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Com Aviso ({consecutiveAbsenceRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setConsecShowAllStudents(true)}
                  className={`ios-segmented-item px-3 py-1.5 text-[0.76rem] ${
                    consecShowAllStudents ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Todos os Alunos
                </button>
              </div>
            </div>
          </div>

          {/* Legenda Intuitiva do Código de Cores (3, 5 e 10 Dias Consecutivos) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div
              onClick={() => setConsecTierFilter(consecTierFilter === '3d' ? 'all' : '3d')}
              className={`p-3 rounded-2xl border-l-4 border-l-[#f59e0b] border border-[#f59e0b]/30 bg-[#fffbeb] flex items-center justify-between gap-2 cursor-pointer transition-all ${
                consecTierFilter === '3d' ? 'ring-2 ring-[#f59e0b]' : 'hover:bg-[#fef3c7]/70'
              }`}
            >
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f59e0b] text-white font-black text-[0.68rem] uppercase">
                  Marca de 3 Dias (3 a 4d)
                </span>
                <p className="text-[0.76rem] font-bold text-[#92400e] mt-1">
                  Atenção Preventiva • Contato WhatsApp Secretaria
                </p>
              </div>
              <span className="material-symbols-outlined text-[22px] text-[#d97706]">
                schedule
              </span>
            </div>

            <div
              onClick={() => setConsecTierFilter(consecTierFilter === '5d' ? 'all' : '5d')}
              className={`p-3 rounded-2xl border-l-4 border-l-[#ea580c] border border-[#ea580c]/30 bg-[#fff7ed] flex items-center justify-between gap-2 cursor-pointer transition-all ${
                consecTierFilter === '5d' ? 'ring-2 ring-[#ea580c]' : 'hover:bg-[#ffedd5]/70'
              }`}
            >
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ea580c] text-white font-black text-[0.68rem] uppercase">
                  Marca de 5 Dias (5 a 9d)
                </span>
                <p className="text-[0.76rem] font-bold text-[#9a3412] mt-1">
                  Busca Ativa Urgente • Convocar Responsável
                </p>
              </div>
              <span className="material-symbols-outlined text-[22px] text-[#ea580c]">
                warning
              </span>
            </div>

            <div
              onClick={() => setConsecTierFilter(consecTierFilter === '10d' ? 'all' : '10d')}
              className={`p-3 rounded-2xl border-l-4 border-l-[#e11d48] border border-[#e11d48]/35 bg-[#fff1f2] flex items-center justify-between gap-2 cursor-pointer transition-all ${
                consecTierFilter === '10d' ? 'ring-2 ring-[#e11d48]' : 'hover:bg-[#ffe4e6]/70'
              }`}
            >
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#be123c] text-white font-black text-[0.68rem] uppercase">
                  Marca de 10+ Dias (10d+)
                </span>
                <p className="text-[0.76rem] font-bold text-[#9f1239] mt-1">
                  Risco Crítico de Evasão • Acionar Gestão / Conselho
                </p>
              </div>
              <span className="material-symbols-outlined text-[22px] text-[#be123c]">
                gpp_maybe
              </span>
            </div>
          </div>

          {consecutiveAbsenceRows.length === 0 ? (
            <div className="bg-[#f5f5f7] rounded-2xl p-8 text-center space-y-2">
              <span className="material-symbols-outlined text-[32px] text-[#28cd41]">
                verified
              </span>
              <h3 className="text-[1rem] font-bold text-[#1d1d1f]">
                Nenhum estudante com aviso de faltas consecutivas neste filtro
              </h3>
              <p className="text-[0.82rem] text-[#6e6e73] max-w-md mx-auto">
                Assim que o(a) professor(a) PEB I selecionar os dias de falta seguida de um aluno na tela "Faltas Seguidas", ele aparecerá aqui instantaneamente para contato da secretaria.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-black/[0.06] rounded-2xl">
              <table className="w-full text-left text-[0.82rem] border-collapse min-w-[940px]">
                <thead className="bg-[#003440] text-white font-bold uppercase tracking-wider text-[0.68rem]">
                  <tr>
                    <th className="py-3 px-4">Turma &amp; Professor(a) PEB I</th>
                    <th className="py-3 px-4">Estudante</th>
                    <th className="py-3 px-4 text-center">Nível de Alerta (3 / 5 / 10 Dias)</th>
                    <th className="py-3 px-4">Dias Faltosos Registrados</th>
                    <th className="py-3 px-4">Contato Família (WhatsApp)</th>
                    <th className="py-3 px-4 w-[32%]">
                      Devolutiva da Secretaria (Feedback da Família)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {consecutiveAbsenceRows.map(
                    ({ cls, student, selectedDates, familyFeedback, consecInfo }, rIdx) => {
                      const waLinks = buildWhatsAppLinksFromPhoneString(
                        student.telefones || student.guardianPhone,
                        student.name,
                        `Olá, família de ${student.name}! Aqui é da secretaria da EMEB Prof. Joaquim Candelário de Freitas. O(A) professor(a) informou que a criança faltou nos dias ${
                          selectedDates.join(', ') || 'recentes'
                        }. Está tudo bem com o(a) estudante?`
                      );

                      const rowColorClass =
                        consecInfo.tier === '10d'
                          ? 'bg-[#fff1f2] hover:bg-[#ffe4e6]/80 border-l-4 border-l-[#e11d48]'
                          : consecInfo.tier === '5d'
                          ? 'bg-[#fff7ed] hover:bg-[#ffedd5]/80 border-l-4 border-l-[#ea580c]'
                          : consecInfo.tier === '3d'
                          ? 'bg-[#fffbeb] hover:bg-[#fef3c7]/80 border-l-4 border-l-[#f59e0b]'
                          : 'bg-white hover:bg-[#fbfbfd]';

                      return (
                        <tr
                          key={`${cls.id}-${student.id}-${rIdx}`}
                          className={`transition-colors ${rowColorClass}`}
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-[#1d1d1f] block">
                              {cls.name} ({cls.shift.replace('Turno ', '')})
                            </span>
                            <span className="text-[0.74rem] text-[#6e6e73]">
                              Prof(a): {cls.teacherFirstName || cls.teacherName || 'PEB I'}
                            </span>
                          </td>

                          <td
                            className="py-3.5 px-4 cursor-pointer"
                            onClick={() => onOpenStudentGrid?.(cls.id, student.id)}
                          >
                            <div className="flex items-center gap-2.5">
                              <StudentAvatar student={student} size="sm" />
                              <div>
                                <span className="font-bold text-[#1d1d1f] hover:text-[#0071e3] block">
                                  Nº {student.number.toString().padStart(2, '0')} • {student.name}
                                </span>
                                <span className="text-[0.73rem] text-[#6e6e73]">
                                  Mãe: {student.filiacao1 || student.guardianName || '—'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {consecInfo.tier !== 'none' ? (
                              <div className="inline-flex flex-col items-center gap-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-[0.72rem] uppercase tabular-nums ${consecInfo.badgeBgClass} ${consecInfo.badgeTextClass}`}
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    {consecInfo.icon}
                                  </span>
                                  <span>{consecInfo.shortBadge}</span>
                                </span>
                                <span className="text-[0.66rem] font-bold text-[#41484b]">
                                  {consecInfo.actionRequired}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[0.74rem] text-[#86868b] font-semibold">
                                Sem Alerta (&lt;3d)
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {selectedDates.length > 0 ? (
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[0.76rem] tabular-nums ${
                                  consecInfo.tier === '10d'
                                    ? 'bg-[#be123c]/15 text-[#be123c]'
                                    : consecInfo.tier === '5d'
                                    ? 'bg-[#ea580c]/15 text-[#c2410c]'
                                    : 'bg-[#f59e0b]/20 text-[#92400e]'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  event_busy
                                </span>
                                <span>
                                  {selectedDates.join(', ')} ({selectedDates.length}{' '}
                                  {selectedDates.length === 1 ? 'dia' : 'dias'})
                                </span>
                              </span>
                            ) : (
                              <span className="text-[0.75rem] text-[#86868b]">
                                {consecInfo.days > 0
                                  ? `${consecInfo.days} faltas seguidas no mês`
                                  : 'Sem dias marcados'}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {waLinks.length > 0 ? (
                              <div className="flex flex-col items-start gap-1">
                                {waLinks.map((ph, idx) => (
                                  <a
                                    key={idx}
                                    href={ph.waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#25D366]/14 hover:bg-[#25D366] text-[#128C7E] hover:text-white font-mono font-semibold text-[0.76rem] transition-colors cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[15px]">chat</span>
                                    <span>{ph.display}</span>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[0.75rem] text-[#86868b]">Sem telefone</span>
                            )}
                          </td>

                          {/* Coluna da Frente: Devolutiva da Secretaria / Feedback da Família (Salva automaticamente) */}
                          <td className="py-3.5 px-4">
                            <input
                              type="text"
                              value={familyFeedback}
                              onChange={(e) =>
                                handleUpdateSecretariaFeedback(
                                  cls.id,
                                  student.id,
                                  e.target.value
                                )
                              }
                              placeholder="Digite aqui o retorno da família p/ o(a) professor(a)..."
                              className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-white/90 border border-black/[0.08] focus:bg-[#eaf6ef]/60 text-[#1d1d1f] font-medium text-[0.82rem] placeholder:text-[#86868b] focus:outline-none transition-colors"
                            />
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* NEW TAB: Relatórios Bimestrais com Faltas e Atestados por Mês (a partir de Fev./27) para o Sistema Bolsa Família / MEC */}
      {activeTab === 'bimestral_bolsa' && (
        <section className="card-welcoming bg-white rounded-2xl p-5 border border-[#003440]/12 space-y-4 animate-gentle-fade">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#003440]/10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#005035] text-white text-[0.72rem] font-extrabold uppercase tracking-wider">
                  Sistema Presença MEC · Bolsa Família (A partir de Fev./2027)
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#f5f7f6] text-[#003440] text-[0.72rem] font-bold border border-[#003440]/12">
                  Ed. Infantil: alerta &lt; 60% · Ens. Fundamental: alerta &lt; 75%
                </span>
              </div>
              <h2 className="text-[1.25rem] sm:text-[1.35rem] font-extrabold text-[#003440] mt-1">
                Relatório Bimestral de Faltas e Atestados por Mês — {currentBimesterDef.label}
              </h2>
              <p className="text-[0.82rem] text-[#436370] font-medium">
                Consolidação mensal de {currentBimesterDef.periodLabel} com NIS, RA, Faltas, Atestados e % de Presença para lançamento no Sistema Bolsa Família.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[42px] px-3.5 rounded-xl bg-[#f5f7f6] hover:bg-[#e3e8e6] text-[#003440] font-bold text-[0.82rem] border border-[#003440]/15 flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                <span>Imprimir Bimestre</span>
              </button>
            </div>
          </div>

          {/* Bimester Pill Selector (1º Bim Fev-Abr/27, 2º Bim Mai-Jul/27, 3º Bim Ago-Set/27, 4º Bim Out-Dez/27, Consolidado Anual) */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f5f7f6] p-2 rounded-xl border border-[#003440]/10">
            <div className="flex flex-wrap items-center gap-1.5">
              {OFFICIAL_BIMESTERS_2027.map((bim) => {
                const active = selectedBimesterId === bim.id;
                return (
                  <button
                    key={bim.id}
                    type="button"
                    onClick={() => setSelectedBimesterId(bim.id)}
                    className={`px-3.5 py-2 rounded-lg font-bold text-[0.78rem] transition-all cursor-pointer ${
                      active
                        ? 'bg-[#003440] text-white shadow-2xs font-extrabold'
                        : 'bg-white text-[#436370] hover:text-[#003440]'
                    }`}
                  >
                    {bim.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              {(['all', 'infantil', 'fundamental'] as const).map((seg) => (
                <button
                  key={seg}
                  type="button"
                  onClick={() => setBimesterSegmentFilter(seg)}
                  className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-bold cursor-pointer ${
                    bimesterSegmentFilter === seg
                      ? 'bg-[#005035] text-white'
                      : 'bg-white text-[#436370] hover:text-[#003440]'
                  }`}
                >
                  {seg === 'all'
                    ? 'Todos Segmentos'
                    : seg === 'infantil'
                    ? 'Só Ed. Infantil (<60%)'
                    : 'Só Ens. Fundamental (<75%)'}
                </button>
              ))}
            </div>
          </div>

          {/* 4 Minimalist KPI Cards for Bimester & Bolsa Família */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#f8faf9] border border-[#003440]/10">
              <span className="text-[0.7rem] font-bold text-[#5a676b] uppercase tracking-wider block">
                Estudantes no Bimestre
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[1.5rem] font-black text-[#003440] tabular-nums">
                  {bimesterSummaryStats.totalEstudantes}
                </span>
                <span className="text-[0.75rem] font-bold text-[#005035]">
                  Freq. Média: {bimesterSummaryStats.pctPresenca}%
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f8faf9] border border-[#003440]/10">
              <span className="text-[0.7rem] font-bold text-[#5a676b] uppercase tracking-wider block">
                Faltas & Atestados no Período
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[1.5rem] font-black text-[#ba1a1a] tabular-nums">
                  {bimesterSummaryStats.totalFaltas} faltas
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#eaf6ef] text-[#005035] text-[0.74rem] font-bold">
                  {bimesterSummaryStats.totalAtestados} atestados
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#fff8f7] border border-[#ba1a1a]/25">
              <span className="text-[0.7rem] font-bold text-[#ba1a1a] uppercase tracking-wider block">
                Alerta Ed. Infantil (&lt; 60% Presença)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[1.5rem] font-black text-[#ba1a1a] tabular-nums">
                  {bimesterSummaryStats.alertInfantilCount}
                </span>
                <span className="text-[0.72rem] font-semibold text-[#93000a]">
                  limite mínimo 60% (LDB/MEC)
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#fff8f7] border border-[#ba1a1a]/25">
              <span className="text-[0.7rem] font-bold text-[#ba1a1a] uppercase tracking-wider block">
                Alerta Ens. Fundamental (&lt; 75% Presença)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[1.5rem] font-black text-[#ba1a1a] tabular-nums">
                  {bimesterSummaryStats.alertFundamentalCount}
                </span>
                <span className="text-[0.72rem] font-semibold text-[#93000a]">
                  limite mínimo 75% (LDB/MEC)
                </span>
              </div>
            </div>
          </div>

          {/* Filter Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={filterTurma}
              onChange={(e) => setFilterTurma(e.target.value)}
              className="w-full min-h-[42px] px-3 bg-[#f5f7f6] text-[#003440] font-bold rounded-xl border border-[#003440]/15 text-[0.84rem]"
            >
              <option value="all">Todas as Turmas ({classes.length})</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} — {c.shift.replace('Turno ', '')}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setBimesterAlertOnly(!bimesterAlertOnly)}
              className={`min-h-[42px] px-3 rounded-xl font-bold text-[0.82rem] border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                bimesterAlertOnly
                  ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]'
                  : 'bg-[#fff8f7] text-[#ba1a1a] border-[#ba1a1a]/30 hover:bg-[#ffdad6]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">warning</span>
              <span>
                {bimesterAlertOnly
                  ? `Exibindo Só Alertas Bolsa Família (${bimesterSummaryStats.totalAlertCount})`
                  : `Filtrar Só Alertas <60% Inf. / <75% Fund. (${bimesterSummaryStats.totalAlertCount})`}
              </span>
            </button>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, RA ou NIS (Bolsa Família)..."
              className="w-full min-h-[42px] px-3 bg-[#f5f7f6] text-[#191c1b] font-semibold rounded-xl border border-[#003440]/15 text-[0.84rem]"
            />
          </div>

          {/* Bimester & Bolsa Família Table with Month-by-Month Faltas & Atestados */}
          <div className="border border-[#003440]/15 rounded-2xl overflow-x-auto max-h-[580px]">
            <table className="w-full text-left text-[0.78rem] border-collapse min-w-[1220px]">
              <thead className="bg-[#003440] text-white sticky top-0 z-10 font-bold uppercase tracking-tight">
                <tr>
                  <th className="py-3 px-2.5">Turma / Seg.</th>
                  <th className="py-3 px-3">Estudante (Foto / Doc Drive)</th>
                  <th className="py-3 px-2.5 text-center">NIS (Bolsa Família) / RA</th>
                  <th className="py-3 px-2 text-center">Mín. Legal</th>
                  {currentBimesterDef.months.map((m) => (
                    <th
                      key={m.name}
                      className="py-3 px-2.5 text-center bg-[#1e4b58] border-l border-white/15"
                    >
                      {m.name.slice(0, 3)}. / 27
                      <span className="block text-[0.65rem] font-normal text-[#bdeafa]">
                        Faltas · Atest. · %
                      </span>
                    </th>
                  ))}
                  <th className="py-3 px-2.5 text-center bg-[#7c1d1d] border-l border-white/15">
                    Total Bimestre
                    <span className="block text-[0.65rem] font-normal text-[#ffdad6]">
                      Faltas / Atestados
                    </span>
                  </th>
                  <th className="py-3 px-2.5 text-center bg-[#005035]">
                    % Presença Bim.
                  </th>
                  <th className="py-3 px-3 text-left">
                    Status Sistema Bolsa Família / LDB
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edeeec]">
                {bimesterReportRows.slice(0, 250).map((r, idx) => (
                  <tr
                    key={`${r.classId}-${r.student.id}-${idx}`}
                    onClick={() => onOpenStudentGrid?.(r.classId, r.student.id)}
                    className={`cursor-pointer hover:bg-[#c3e5f4]/25 transition-colors ${
                      r.isBelowLegalThresholdBimestre
                        ? 'bg-[#fff8f7]'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-[#f9faf8]'
                    }`}
                  >
                    <td className="py-2.5 px-2.5">
                      <span className="font-extrabold text-[#003440] block">{r.className}</span>
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[0.65rem] font-bold ${
                          r.isEducacaoInfantil
                            ? 'bg-[#eaf6ef] text-[#005035]'
                            : 'bg-[#c3e5f4]/60 text-[#003440]'
                        }`}
                      >
                        {r.isEducacaoInfantil ? 'ED. INFANTIL' : 'ENS. FUND.'}
                      </span>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <StudentAvatar
                          student={r.student}
                          size="sm"
                          expandableOnClick={true}
                        />
                        <div className="min-w-0">
                          <a
                            href={
                              r.student.fichaPdfDriveUrl ||
                              (r.student.fichaPdfDriveId
                                ? `https://drive.google.com/file/d/${r.student.fichaPdfDriveId}/view`
                                : `#doc-${r.student.id}`)
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenStudentPdf?.(r.classId, r.student.id);
                            }}
                            className="doc-hyperlink font-extrabold text-[#003440] block truncate max-w-[230px]"
                            title="Abrir Documento Escaneado no Google Drive"
                          >
                            {r.student.name}
                          </a>
                          <span className="text-[0.68rem] text-[#5a676b] block">
                            Nº {r.student.number.toString().padStart(2, '0')} · Nasc: {r.student.dataNascimento}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-center font-mono">
                      <span className="font-bold text-[#003440] block">
                        NIS: {r.student.nis || '—'}
                      </span>
                      <span className="text-[0.68rem] text-[#5a676b]">
                        RA {r.student.ra}-{r.student.digRa}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-center font-mono font-bold text-[#003440]">
                      {r.minLegalPresencePercent}%
                    </td>

                    {r.monthsBreakdown.map((mb) => (
                      <td
                        key={mb.monthName}
                        className={`py-2.5 px-2 text-center border-l border-[#edeeec] font-mono tabular-nums ${
                          mb.isBelowLegalThreshold ? 'bg-[#ffdad6]/45' : ''
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span
                            className={`font-bold ${
                              mb.faltas > 0 ? 'text-[#ba1a1a]' : 'text-[#5a676b]'
                            }`}
                          >
                            {mb.faltas}f
                          </span>
                          <span className="text-[#a8b5b9]">·</span>
                          <span className="text-[#005035] font-bold">
                            {mb.atestados}at
                          </span>
                        </div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[0.68rem] font-extrabold ${
                            mb.isBelowLegalThreshold
                              ? 'bg-[#ba1a1a] text-white'
                              : 'bg-[#f1f4f3] text-[#003440]'
                          }`}
                        >
                          {mb.frequenciaPercent}%
                        </span>
                      </td>
                    ))}

                    <td className="py-2.5 px-2.5 text-center border-l border-[#edeeec] font-mono tabular-nums">
                      <span className="font-extrabold text-[#ba1a1a]">
                        {r.totalFaltasBimestre}f
                      </span>
                      <span className="mx-1 text-[#a8b5b9]">/</span>
                      <span className="font-extrabold text-[#005035]">
                        {r.totalAtestadosBimestre} atest.
                      </span>
                      <span className="block text-[0.66rem] text-[#5a676b]">
                        ({r.totalDiasBimestre}d letivos)
                      </span>
                    </td>

                    <td className="py-2.5 px-2.5 text-center font-mono tabular-nums">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[0.78rem] font-black ${
                          r.isBelowLegalThresholdBimestre
                            ? 'bg-[#ba1a1a] text-white'
                            : 'bg-[#eaf6ef] text-[#005035]'
                        }`}
                      >
                        {r.frequenciaBimestrePercent}%
                      </span>
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.68rem] font-extrabold ${
                          r.isBelowLegalThresholdBimestre
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : 'bg-[#eaf6ef] text-[#005035]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {r.isBelowLegalThresholdBimestre ? 'warning' : 'verified'}
                        </span>
                        <span>
                          {r.isBelowLegalThresholdBimestre
                            ? `Alerta <${r.minLegalPresencePercent}% (${r.isEducacaoInfantil ? 'Infantil' : 'Fund.'})`
                            : `Regular (≥${r.minLegalPresencePercent}%)`}
                        </span>
                      </span>
                      <span className="block text-[0.68rem] text-[#436370] mt-0.5 truncate max-w-[240px]">
                        {r.bolsaFamiliaMotivoPadrao}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tabs 1, 2 & 3: Tabulação Nominal Detalhada (Educação Infantil / Ensino Fundamental / Base Geral SED) */}
      {(activeTab === 'nominal_infantil' ||
        activeTab === 'nominal_fundamental' ||
        activeTab === 'frequencia') && (
        <section className="bg-white rounded-2xl p-5 shadow-sm border-2 border-[#003440]/15 space-y-4">
          {/* Header Banner of the Active Nominal Tab */}
          <div
            className={`p-4 rounded-2xl border-2 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
              activeTab === 'nominal_infantil'
                ? 'bg-[#eaf6ef] border-[#a4f3ca] text-[#003723]'
                : activeTab === 'nominal_fundamental'
                ? 'bg-[#c3e5f4]/35 border-[#aaccda] text-[#001f29]'
                : 'bg-[#f0fdf4] border-[#86efac] text-[#14532d]'
            }`}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-0.5 rounded-full bg-[#003440] text-white text-[0.75rem] font-black uppercase">
                  {activeTab === 'nominal_infantil'
                    ? 'Aba Oficial Google Sheets: Faltas_Atestados_Infantil'
                    : activeTab === 'nominal_fundamental'
                    ? 'Aba Oficial Google Sheets: Faltas_Atestados_Fundamental'
                    : 'Aba Oficial Google Sheets: SED_Matriculas_e_Frequencia'}
                </span>
                {activeTab === 'frequencia' && (
                  <>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#166534] text-white text-[0.75rem] font-black uppercase flex items-center gap-1.5 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
                      Importação de Outra Planilha SED
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-white text-[#166534] text-[0.75rem] font-extrabold border border-[#86efac] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px] text-[#166534]">sync</span>
                      Sync Automático Contínuo (App + Firebase)
                    </span>
                  </>
                )}
                <span className="px-2.5 py-0.5 rounded-full bg-white text-[#003440] text-[0.75rem] font-extrabold border border-[#c0c8cb]">
                  {stageTurmasList.length} Turmas • {stageStats.totalEstudantes} Estudantes Tabulados
                </span>
              </div>
              <h2 className="text-[1.25rem] sm:text-[1.4rem] font-black mt-1.5 leading-tight">
                {activeTab === 'nominal_infantil'
                  ? 'Tabulação Nominal de Faltas e Atestados — EDUCAÇÃO INFANTIL (Grupo 04 e Grupo 05)'
                  : activeTab === 'nominal_fundamental'
                  ? 'Tabulação Nominal de Faltas e Atestados — ENSINO FUNDAMENTAL (1º ao 5º Ano)'
                  : 'Base Geral SED (48 Colunas) — Matrículas Importadas de Outra Planilha'}
              </h2>
              <p className="text-[0.86rem] font-semibold opacity-90 mt-0.5">
                {activeTab === 'frequencia'
                  ? 'Esta aba é alimentada automaticamente pela planilha externa oficial da SED (via =IMPORTRANGE ou exportação da rede). O aplicativo monitora atualizações a cada 6,5 segundos e reflete instantaneamente as novas matrículas, presenças e atestados no Firebase Firestore sem sobrescrever ou quebrar sua fórmula.'
                  : 'Relação nominal completa de cada estudante com Quantidade (Qtd.) e Porcentagem (%) de Presenças, Faltas Totais, Atestados Apresentados (Faltas Justificadas) e Faltas sem Atestado, respeitando o recorte individual da matrícula.'}
              </p>
            </div>
          </div>

          {/* Dedicated SED External Import Auto-Sync Card */}
          {activeTab === 'frequencia' && (
            <div className="p-4 bg-gradient-to-r from-[#f0fdf4] via-[#f7fee7] to-[#ecfdf5] border-2 border-[#86efac] rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#15803d] text-[24px]">cloud_sync</span>
                  <h3 className="text-[1.05rem] font-black text-[#14532d]">
                    Sincronização 100% Automática da SED com o Firebase & Proteção Ativa
                  </h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.72rem] font-black uppercase bg-[#15803d] text-white">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    Auto-Sync Ativo
                  </span>
                </div>
                <p className="text-[0.82rem] font-medium text-[#166534] max-w-3xl leading-relaxed">
                  🛡️ <strong>Aba Protegida:</strong> Ao redefinir as 12 abas ou salvar dados, a aba <code>SED_Matriculas_e_Frequencia</code> <strong>não é apagada nem sobrescrita</strong>. Ela atua como fonte primária de verdade, alimentando o cálculo automático das outras 11 abas oficiais (Educação Infantil, Ensino Fundamental, Busca Ativa, etc.) e o Firebase Firestore.
                </p>
                {lastAutoSyncSedAt && (
                  <p className="text-[0.75rem] font-bold text-[#15803d] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                    Última sincronia automática SED ➔ Firebase: {new Date(lastAutoSyncSedAt).toLocaleTimeString('pt-BR')} (verificação contínua em segundo plano)
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyImportRangeFormula}
                  className="px-3.5 py-2 rounded-xl bg-white border-2 border-[#86efac] text-[#15803d] text-[0.8rem] font-black hover:bg-[#dcfce7] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Copiar fórmula =IMPORTRANGE padrão para colar na célula A1 do Google Sheets"
                >
                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
                  Copiar =IMPORTRANGE
                </button>
                <button
                  type="button"
                  disabled={isSyncingCloud}
                  onClick={handleReadFromGoogleSheet}
                  className="px-4 py-2 rounded-xl bg-[#15803d] text-white text-[0.8rem] font-black hover:bg-[#14532d] transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                  {isSyncingCloud ? 'Sincronizando...' : 'Sincronizar SED Agora'}
                </button>
              </div>
            </div>
          )}

          {/* 5 Summary KPI Cards: Quantidade (Qtd) + Porcentagem (%) for the Selected Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Card 1: Total de Estudantes & Dias no Recorte */}
            <div className="p-3.5 rounded-2xl bg-[#f8faf9] border border-[#c0c8cb] flex flex-col justify-between">
              <span className="text-[0.74rem] font-black text-[#436370] uppercase">
                1. Estudantes Tabulados
              </span>
              <div className="my-1">
                <span className="text-[1.65rem] font-black text-[#003440] leading-none">
                  {stageStats.totalEstudantes}
                </span>
                <span className="text-[0.8rem] font-bold text-[#41484b] ml-1.5">
                  estudantes
                </span>
              </div>
              <span className="text-[0.75rem] font-bold text-[#003440] bg-[#edeeec] px-2 py-0.5 rounded-lg inline-block">
                Soma Recorte: {stageStats.totalDiasRecorte} dias letivos
              </span>
            </div>

            {/* Card 2: Presenças no Período (Qtd + %) */}
            <div className="p-3.5 rounded-2xl bg-[#eaf6ef] border border-[#a4f3ca] flex flex-col justify-between">
              <span className="text-[0.74rem] font-black text-[#005035] uppercase">
                2. Presenças (Qtd e %)
              </span>
              <div className="my-1 flex items-baseline justify-between">
                <div>
                  <span className="text-[1.65rem] font-black text-[#005035] leading-none">
                    {stageStats.totalPresencas}
                  </span>
                  <span className="text-[0.76rem] font-bold text-[#003723] block">
                    presenças no mês
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-[#005035] text-white font-black text-[1.1rem]">
                  {stageStats.pctPresenca}%
                </span>
              </div>
              <span className="text-[0.74rem] font-bold text-[#003723]">
                Taxa de Frequência do Segmento
              </span>
            </div>

            {/* Card 3: Total de Faltas no Mês (Qtd + %) */}
            <div className="p-3.5 rounded-2xl bg-[#fff8f7] border border-[#ffdad6] flex flex-col justify-between">
              <span className="text-[0.74rem] font-black text-[#ba1a1a] uppercase">
                3. Total de Faltas (Qtd e %)
              </span>
              <div className="my-1 flex items-baseline justify-between">
                <div>
                  <span className="text-[1.65rem] font-black text-[#ba1a1a] leading-none">
                    {stageStats.totalFaltas}
                  </span>
                  <span className="text-[0.76rem] font-bold text-[#ba1a1a] block">
                    faltas acumuladas
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-[#ba1a1a] text-white font-black text-[1.1rem]">
                  {stageStats.pctFaltasSobreDias}%
                </span>
              </div>
              <span className="text-[0.74rem] font-bold text-[#41484b]">
                {stageStats.estudantesComFaltas} estudantes com falta ({stageStats.pctEstudantesComFaltas}%)
              </span>
            </div>

            {/* Card 4: Atestados Apresentados (Qtd + % sobre faltas e % sobre dias) */}
            <div className="p-3.5 rounded-2xl bg-[#eaf6ef] border-2 border-[#005035]/30 flex flex-col justify-between">
              <span className="text-[0.74rem] font-black text-[#005035] uppercase">
                4. Atestados (Qtd e %)
              </span>
              <div className="my-1 flex items-baseline justify-between">
                <div>
                  <span className="text-[1.65rem] font-black text-[#005035] leading-none">
                    {stageStats.totalAtestados}
                  </span>
                  <span className="text-[0.76rem] font-bold text-[#003723] block">
                    atestados entregues
                  </span>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-0.5 rounded-xl bg-[#005035] text-white font-black text-[1rem] block">
                    {stageStats.pctAtestadosSobreFaltas}% das faltas
                  </span>
                  <span className="text-[0.7rem] font-extrabold text-[#005035] block mt-0.5">
                    ({stageStats.pctAtestadosSobreDias}% dos dias letivos)
                  </span>
                </div>
              </div>
              <span className="text-[0.74rem] font-bold text-[#003723]">
                {stageStats.estudantesComAtestados} estudantes c/ atestado ({stageStats.pctEstudantesComAtestados}%)
              </span>
            </div>

            {/* Card 5: Faltas Sem Atestado & Alertas */}
            <div className="p-3.5 rounded-2xl bg-[#fff4e5] border border-[#ffd89e] flex flex-col justify-between">
              <span className="text-[0.74rem] font-black text-[#7a4100] uppercase">
                5. Faltas S/ Atestado (Qtd e %)
              </span>
              <div className="my-1 flex items-baseline justify-between">
                <div>
                  <span className="text-[1.65rem] font-black text-[#7a4100] leading-none">
                    {stageStats.totalSemAtestado}
                  </span>
                  <span className="text-[0.76rem] font-bold text-[#7a4100] block">
                    não justificadas
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-[#7a4100] text-white font-black text-[1rem]">
                  {stageStats.pctSemAtestadoSobreFaltas}% das faltas
                </span>
              </div>
              <span className="text-[0.74rem] font-bold text-[#ba1a1a]">
                {stageStats.estudantesEmAlerta} em alerta legal (&lt;60% Ed. Inf. / &lt;75% Fund.)
              </span>
            </div>
          </div>

          {/* Barra de Alertas Visuais de Faltas Consecutivas (Marcas de 3, 5 e 10 Dias) na Grade de Dados */}
          <div className="p-3.5 rounded-2xl bg-[#f8faf9] border border-[#c0c8cb] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-[#ba1a1a]">
                notification_important
              </span>
              <div>
                <span className="text-[0.78rem] font-black text-[#003440] uppercase tracking-tight block">
                  Sistema de Alertas Visuais na Grade de Dados — Faltas Consecutivas (3, 5 e 10 Dias)
                </span>
                <span className="text-[0.72rem] text-[#41484b] font-semibold">
                  Clique em uma faixa de cor abaixo para filtrar automaticamente na tabela os estudantes por nível de gravidade:
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setFilterStatus(filterStatus === 'consec_3d' ? 'all' : 'consec_3d')
                }
                className={`px-3 py-1.5 rounded-xl font-black text-[0.74rem] flex items-center gap-1.5 border cursor-pointer transition-all ${
                  filterStatus === 'consec_3d'
                    ? 'bg-[#f59e0b] text-white border-[#d97706] shadow-xs ring-2 ring-[#f59e0b]/40'
                    : 'bg-[#fffbeb] text-[#92400e] border-[#f59e0b]/50 hover:bg-[#fef3c7]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                <span>3+ Dias • Atenção ({stageStats.consec3dCount})</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilterStatus(filterStatus === 'consec_5d' ? 'all' : 'consec_5d')
                }
                className={`px-3 py-1.5 rounded-xl font-black text-[0.74rem] flex items-center gap-1.5 border cursor-pointer transition-all ${
                  filterStatus === 'consec_5d'
                    ? 'bg-[#ea580c] text-white border-[#c2410c] shadow-xs ring-2 ring-[#ea580c]/40'
                    : 'bg-[#fff7ed] text-[#9a3412] border-[#ea580c]/50 hover:bg-[#ffedd5]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c]" />
                <span>5+ Dias • Busca Ativa ({stageStats.consec5dCount})</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilterStatus(filterStatus === 'consec_10d' ? 'all' : 'consec_10d')
                }
                className={`px-3 py-1.5 rounded-xl font-black text-[0.74rem] flex items-center gap-1.5 border cursor-pointer transition-all ${
                  filterStatus === 'consec_10d'
                    ? 'bg-[#be123c] text-white border-[#9f1239] shadow-xs ring-2 ring-[#be123c]/40'
                    : 'bg-[#fff1f2] text-[#9f1239] border-[#e11d48]/50 hover:bg-[#ffe4e6]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#e11d48]" />
                <span>10+ Dias • Crítico ({stageStats.consec10dCount})</span>
              </button>

              {filterStatus.startsWith('consec_') && (
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className="px-2.5 py-1.5 rounded-xl bg-[#003440] text-white font-bold text-[0.72rem] cursor-pointer"
                >
                  Limpar Filtro
                </button>
              )}
            </div>
          </div>

          {/* Filter Controls: Turma, Turno, Filtro de Faltas/Atestados, Busca por Estudante/RA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            <select
              value={filterTurma}
              onChange={(e) => setFilterTurma(e.target.value)}
              className="w-full min-h-[48px] px-3 bg-[#f3f4f2] text-[#003440] font-bold rounded-xl border border-[#c0c8cb] text-[0.9rem] focus:outline-none"
            >
              <option value="all">
                Todas as Turmas do Segmento ({stageTurmasList.length} turmas)
              </option>
              {stageTurmasList.map((c) => (
                <option key={c.id} value={c.name}>
                  Turma {c.name} — {c.shift.replace('Turno ', '')} ({c.totalStudents} estudantes)
                </option>
              ))}
            </select>

            <select
              value={filterTurno}
              onChange={(e) => setFilterTurno(e.target.value as any)}
              className="w-full min-h-[48px] px-3 bg-[#f3f4f2] text-[#003440] font-bold rounded-xl border border-[#c0c8cb] text-[0.9rem] focus:outline-none"
            >
              <option value="all">☀️/⛅ Todos os Turnos (Manhã e Tarde)</option>
              <option value="Manhã">☀️ Somente Turno Manhã</option>
              <option value="Tarde">⛅ Somente Turno Tarde</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full min-h-[48px] px-3 bg-[#f3f4f2] text-[#003440] font-bold rounded-xl border border-[#c0c8cb] text-[0.9rem] focus:outline-none"
            >
              <option value="all">📋 Todos os Estudantes ({stageStats.totalEstudantes})</option>
              <option value="consec_all">🚨 Em Alerta de Faltas Seguidas (3, 5 ou 10+ dias)</option>
              <option value="consec_3d">🟡 Marca de 3+ Dias Consecutivos (Atenção)</option>
              <option value="consec_5d">🟠 Marca de 5+ Dias Consecutivos (Busca Ativa)</option>
              <option value="consec_10d">🔴 Marca de 10+ Dias Consecutivos (Crítico)</option>
              <option value="com_faltas">🔴 Somente Estudantes com Faltas no Mês</option>
              <option value="com_atestado">🏥 Somente Estudantes com Atestado</option>
              <option value="alerta">⚠️ Em Alerta Legal (&lt;60% Ed. Inf. / &lt;75% Fund.)</option>
            </select>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar estudante por nome, Nº ou RA..."
              className="w-full min-h-[48px] px-3 bg-[#f3f4f2] text-[#191c1b] font-semibold rounded-xl border border-[#c0c8cb] text-[0.9rem] focus:outline-none focus:bg-white focus:border-[#003440]"
            />
          </div>

          {/* Detailed Nominal Table with Quantity & Percentage for Every Student */}
          <div className="border-2 border-[#c0c8cb] rounded-2xl overflow-x-auto max-h-[560px] shadow-2xs">
            <table className="w-full text-left text-[0.82rem] border-collapse min-w-[1260px]">
              <thead className="bg-[#003440] text-white sticky top-0 z-10 font-extrabold uppercase tracking-tight">
                <tr>
                  <th className="py-3 px-2.5">Segmento / Etapa</th>
                  <th className="py-3 px-2.5">Turma / Turno</th>
                  <th className="py-3 px-2.5 text-center">Nº</th>
                  <th className="py-3 px-3">Nome Nominal do(a) Estudante</th>
                  <th className="py-3 px-2.5 text-center bg-[#5c1919]">
                    Alerta Faltas Seguidas (3 / 5 / 10d)
                  </th>
                  <th className="py-3 px-2.5 text-center">RA Oficial</th>
                  <th className="py-3 px-3">Filiação 1 (Nome da Mãe)</th>
                  <th className="py-3 px-3">Filiação 2 (Nome do Pai)</th>
                  <th className="py-3 px-2.5 text-center" title="Dias Letivos no Recorte da Matrícula / Dias Letivos do Mês">
                    Dias Recorte
                  </th>
                  <th className="py-3 px-2.5 text-center bg-[#004632]">
                    Presenças (Qtd / %)
                  </th>
                  <th className="py-3 px-2.5 text-center bg-[#7c1d1d]">
                    Faltas Mês (Qtd / %)
                  </th>
                  <th className="py-3 px-2.5 text-center bg-[#005035]">
                    Atestados (Qtd / % Faltas / % Dias)
                  </th>
                  <th className="py-3 px-2.5 text-center bg-[#6b3b00]">
                    Faltas S/ Atestado (Qtd)
                  </th>
                  <th className="py-3 px-2.5 text-center">Situação Legal / Obs.</th>
                </tr>
              </thead>
              <tbody>
                {filteredFrequenciaRows.slice(0, 250).map((row, idx) => {
                  const minLegal = row.tipoEnsino === 'EDUCACAO INFANTIL' ? 60 : 75;
                  const isLegalAlert = row.frequenciaPercent < minLegal;
                  const rowAlertStyle =
                    row.consecutiveTier === '10d'
                      ? 'bg-[#fff1f2] hover:bg-[#ffe4e6] border-l-4 border-l-[#e11d48]'
                      : row.consecutiveTier === '5d'
                      ? 'bg-[#fff7ed] hover:bg-[#ffedd5] border-l-4 border-l-[#ea580c]'
                      : row.consecutiveTier === '3d'
                      ? 'bg-[#fffbeb] hover:bg-[#fef3c7] border-l-4 border-l-[#f59e0b]'
                      : isLegalAlert
                      ? 'bg-[#fff8f7] hover:bg-[#c3e5f4]/35'
                      : idx % 2 === 0
                      ? 'bg-white hover:bg-[#c3e5f4]/35'
                      : 'bg-[#f9faf8] hover:bg-[#c3e5f4]/35';

                  return (
                  <tr
                    key={row.id}
                    onClick={() => onOpenStudentGrid?.(row.classId, row.studentId)}
                    title="Clique para abrir a Grade de Dados Interativa (48 Campos SED) deste(a) estudante"
                    className={`border-b border-[#edeeec] cursor-pointer transition-colors ${rowAlertStyle}`}
                  >
                    <td className="py-2.5 px-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[0.68rem] font-black ${
                          row.tipoEnsino === 'EDUCACAO INFANTIL'
                            ? 'bg-[#eaf6ef] text-[#005035]'
                            : 'bg-[#c3e5f4]/60 text-[#003440]'
                        }`}
                      >
                        {row.tipoEnsino === 'EDUCACAO INFANTIL' ? 'ED. INFANTIL (≥60%)' : 'ENS. FUNDAMENTAL (≥75%)'}
                      </span>
                      <span className="block text-[0.72rem] text-[#41484b] font-semibold mt-0.5">
                        {row.etapaSerie}
                      </span>
                    </td>

                    <td className="py-2.5 px-2.5">
                      <span className="font-black text-[#003440] block">{row.turma}</span>
                      <span className="text-[0.72rem] text-[#71787b] font-semibold">
                        {row.turno} • {row.sala}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-center font-black text-[#003440]">
                      {row.numero.toString().padStart(2, '0')}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <StudentAvatar
                            name={row.nome}
                            photo={row.fotoUrl}
                            size="sm"
                            expandableOnClick
                          />
                          <div className="min-w-0">
                            <span className="font-extrabold text-[#003440] block text-[0.92rem] truncate">
                              {row.nome}
                            </span>
                            {row.deficiencia && (
                              <span className="inline-block mt-0.5 px-2 py-0.2 rounded-full bg-[#a4f3ca] text-[#003723] text-[0.68rem] font-black">
                                {row.deficiencia}
                              </span>
                            )}
                          </div>
                        </div>

                        {onOpenStudentPdf && (
                          <a
                            href={
                              row.fichaPdfDriveUrl ||
                              (row.fichaPdfDriveId
                                ? `https://drive.google.com/file/d/${row.fichaPdfDriveId}/view`
                                : `#doc-${row.studentId}`)
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenStudentPdf(row.classId, row.studentId);
                            }}
                            title={`Abrir Ficha Informativa Escaneada de ${row.nome} no Google Drive`}
                            className="doc-hyperlink px-2.5 py-1 rounded-lg bg-[#eaf6ef] hover:bg-[#005035] text-[#005035] hover:!text-white font-black text-[0.72rem] flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              document_scanner
                            </span>
                            <span>Ficha (Drive)</span>
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Alerta Visual de Faltas Consecutivas (3, 5 e 10 dias) */}
                    <td className="py-2.5 px-2.5 text-center">
                      {row.consecutiveTier === '10d' ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#be123c] text-white font-black text-[0.7rem] uppercase tabular-nums shadow-2xs">
                            <span className="material-symbols-outlined text-[13px]">gpp_maybe</span>
                            <span>10+ DIAS ({row.consecutiveDays}d)</span>
                          </span>
                          <span className="text-[0.64rem] font-bold text-[#9f1239] mt-0.5">
                            Evasão Crítica • Conselho
                          </span>
                        </div>
                      ) : row.consecutiveTier === '5d' ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ea580c] text-white font-black text-[0.7rem] uppercase tabular-nums shadow-2xs">
                            <span className="material-symbols-outlined text-[13px]">warning</span>
                            <span>5+ DIAS ({row.consecutiveDays}d)</span>
                          </span>
                          <span className="text-[0.64rem] font-bold text-[#9a3412] mt-0.5">
                            Busca Ativa Urgente
                          </span>
                        </div>
                      ) : row.consecutiveTier === '3d' ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#f59e0b] text-white font-black text-[0.7rem] uppercase tabular-nums shadow-2xs">
                            <span className="material-symbols-outlined text-[13px]">schedule</span>
                            <span>3+ DIAS ({row.consecutiveDays}d)</span>
                          </span>
                          <span className="text-[0.64rem] font-bold text-[#92400e] mt-0.5">
                            Atenção • Contato Família
                          </span>
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-md bg-[#eaf6ef] text-[#005035] font-bold text-[0.68rem]">
                          Regular (&lt;3d)
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-center font-mono text-[0.76rem] text-[#41484b]">
                      {row.ra ? `${row.ra}-${row.digRa}/${row.ufRa}` : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-[0.76rem] font-semibold text-[#003440]">
                      {row.filiacao1 || row.responsavel || '—'}
                    </td>

                    <td className="py-2.5 px-3 text-[0.76rem] font-medium text-[#41484b]">
                      {row.filiacao2 || '—'}
                    </td>

                    {/* Dias no Recorte */}
                    <td className="py-2.5 px-2.5 text-center">
                      <span
                        className={`font-black px-2 py-0.5 rounded-lg text-[0.78rem] ${
                          row.diasLetivosMatriculados < row.diasLetivosMes
                            ? 'bg-[#c3e5f4] text-[#001f29]'
                            : 'text-[#003440]'
                        }`}
                        title={row.recorteInfo}
                      >
                        {row.diasLetivosMatriculados} / {row.diasLetivosMes}d
                      </span>
                      <span className="block text-[0.66rem] text-[#71787b] mt-0.5">
                        Matr.: {row.dataMatricula}
                      </span>
                    </td>

                    {/* Presenças: Quantidade + Porcentagem */}
                    <td className="py-2.5 px-2.5 text-center bg-[#eaf6ef]/40">
                      <span className="font-black text-[#005035] text-[0.92rem]">
                        {row.presencasMes}d
                      </span>
                      <span
                        className={`ml-1.5 px-2 py-0.5 rounded-full text-[0.74rem] font-black ${
                          isLegalAlert
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : 'bg-[#a4f3ca]/70 text-[#003723]'
                        }`}
                      >
                        {row.frequenciaPercent}%
                      </span>
                    </td>

                    {/* Faltas no Mês: Quantidade + Porcentagem */}
                    <td className="py-2.5 px-2.5 text-center bg-[#fff8f7]/60">
                      <span
                        className={`font-black text-[0.92rem] ${
                          row.faltasMes > 0 ? 'text-[#ba1a1a]' : 'text-[#71787b]'
                        }`}
                      >
                        {row.faltasMes}
                      </span>
                      <span
                        className={`ml-1.5 px-2 py-0.5 rounded-full text-[0.74rem] font-black ${
                          row.faltasMes > 0
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : 'bg-[#f3f4f2] text-[#71787b]'
                        }`}
                      >
                        {row.percentFaltas}%
                      </span>
                    </td>

                    {/* Atestados Apresentados: Quantidade + % sobre Faltas + % sobre Dias */}
                    <td className="py-2.5 px-2.5 text-center bg-[#eaf6ef]/50">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className={`font-black text-[0.92rem] ${
                            row.faltasJustificadas > 0 ? 'text-[#005035]' : 'text-[#71787b]'
                          }`}
                        >
                          {row.faltasJustificadas}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[0.72rem] font-black ${
                            row.faltasJustificadas > 0
                              ? 'bg-[#005035] text-white'
                              : 'bg-[#f3f4f2] text-[#71787b]'
                          }`}
                          title="Porcentagem de faltas justificadas por atestado"
                        >
                          {row.percentAtestadosSobreFaltas}% das faltas
                        </span>
                      </div>
                      <span className="block text-[0.66rem] font-bold text-[#005035] mt-0.5">
                        ({row.percentAtestadosSobreDias}% dos dias letivos)
                      </span>
                    </td>

                    {/* Faltas Sem Atestado */}
                    <td className="py-2.5 px-2.5 text-center">
                      <span
                        className={`font-black text-[0.88rem] px-2 py-0.5 rounded-lg ${
                          row.faltasSemAtestado > 0
                            ? 'bg-[#fff4e5] text-[#7a4100] border border-[#ffd89e]'
                            : 'text-[#71787b]'
                        }`}
                      >
                        {row.faltasSemAtestado}
                      </span>
                    </td>

                    {/* Situação & Observações */}
                    <td className="py-2.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[0.7rem] font-black ${
                          isLegalAlert
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : row.frequenciaPercent === 100
                            ? 'bg-[#eaf6ef] text-[#005035]'
                            : 'bg-[#f3f4f2] text-[#003440]'
                        }`}
                      >
                        {row.situacao}
                      </span>
                      {row.observacoesAtestado && (
                        <span className="block text-[0.68rem] text-[#005035] font-bold truncate max-w-[160px] mx-auto mt-0.5">
                          {row.observacoesAtestado}
                        </span>
                      )}
                    </td>
                  </tr>
                );
                })}
              </tbody>
              {/* Sticky Summary Footer Row with Totals & Percentages */}
              <tfoot className="bg-[#003440] text-white font-black text-[0.8rem] sticky bottom-0">
                <tr>
                  <td colSpan={7} className="py-3 px-3">
                    TOTAL CONSOLIDADO ({stageStats.totalEstudantes} ESTUDANTES EXIBIDOS • {stageStats.consecTotalCount} EM ALERTA 3/5/10 DIAS)
                  </td>
                  <td className="py-3 px-2 text-center">—</td>
                  <td className="py-3 px-2.5 text-center">
                    {stageStats.totalDiasRecorte}d letivos
                  </td>
                  <td className="py-3 px-2.5 text-center bg-[#004632]">
                    {stageStats.totalPresencas}d ({stageStats.pctPresenca}%)
                  </td>
                  <td className="py-3 px-2.5 text-center bg-[#7c1d1d]">
                    {stageStats.totalFaltas} faltas ({stageStats.pctFaltasSobreDias}%)
                  </td>
                  <td className="py-3 px-2.5 text-center bg-[#005035]">
                    {stageStats.totalAtestados} atest. ({stageStats.pctAtestadosSobreFaltas}% faltas | {stageStats.pctAtestadosSobreDias}% dias)
                  </td>
                  <td className="py-3 px-2.5 text-center bg-[#6b3b00]">
                    {stageStats.totalSemAtestado} s/ atest. ({stageStats.pctSemAtestadoSobreFaltas}%)
                  </td>
                  <td className="py-3 px-2.5 text-center">
                    Freq. Média: {stageStats.pctPresenca}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[0.8rem] text-[#41484b] text-center font-medium">
            Exibindo {Math.min(250, filteredFrequenciaRows.length)} de {filteredFrequenciaRows.length} estudantes • Toque em qualquer estudante para abrir a Grade de Dados Interativa (48 campos SED + Faltas e Atestados).
          </p>
        </section>
      )}

      {/* Tab 2: Dias Letivos */}
      {activeTab === 'dias_letivos' && (
        <section className="card-welcoming bg-white rounded-3xl p-5 sm:p-7 shadow-xs border border-[#003440]/10 space-y-5 animate-gentle-fade">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#003440]/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-[#005035]">
                  calendar_month
                </span>
                <h2 className="text-lg sm:text-xl font-black text-[#003440]">
                  Calendário Escolar Oficial · 200 Dias Letivos (2027)
                </h2>
              </div>
              <p className="text-[0.82rem] text-[#436370]">
                Aba Oficial na Planilha: <code className="bg-[#f1f4f3] px-1.5 py-0.5 rounded text-[#003440]">Dias_Letivos_SME_2027</code> · Alinhado com o Firebase Firestore.
              </p>
            </div>

            {onOpenConfigDaysModal && (
              <button
                type="button"
                onClick={onOpenConfigDaysModal}
                className="min-h-[44px] px-4 py-2 bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.82rem] rounded-2xl flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                <span>Configurar 200 Dias Letivos &amp; Meses</span>
              </button>
            )}
          </div>

          <div className="border border-[#c0c8cb] rounded-2xl overflow-x-auto max-h-[420px]">
            <table className="w-full text-left text-[0.88rem] border-collapse">
              <thead className="bg-[#003440] text-white sticky top-0 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Dia</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {calendarRows.map((d, idx) => (
                  <tr
                    key={d.id}
                    className={`border-b border-[#edeeec] ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-[#f9faf8]'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold text-[#003440]">{d.date}</td>
                    <td className="py-2.5 px-3 text-[#41484b]">{d.dayOfWeek}</td>
                    <td className="py-2.5 px-3 font-bold">
                      {d.type === 'dia_letivo' ? (
                        <span className="text-[#005035]">Letivo</span>
                      ) : d.type === 'feriado' ? (
                        <span className="text-[#ba1a1a]">Feriado</span>
                      ) : d.type === 'sabado_letivo' ? (
                        <span className="text-[#003440]">Sábado Letivo</span>
                      ) : (
                        <span className="text-[#71787b]">Fim de Semana</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[#41484b]">{d.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 5: 40 Turmas (Separadas por Segmento com Quantidade e Porcentagem de Faltas e Atestados) */}
      {activeTab === 'turmas' && (
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#e1e3e1] space-y-3">
          <div className="border-2 border-[#c0c8cb] rounded-2xl overflow-x-auto max-h-[520px]">
            <table className="w-full text-left text-[0.84rem] border-collapse min-w-[920px]">
              <thead className="bg-[#003440] text-white sticky top-0 font-extrabold uppercase tracking-tight">
                <tr>
                  <th className="py-3 px-3">Segmento</th>
                  <th className="py-3 px-3">Turma / Etapa</th>
                  <th className="py-3 px-2.5">Turno / Sala</th>
                  <th className="py-3 px-2.5 text-center">Estudantes</th>
                  <th className="py-3 px-2.5 text-center">Dias Recorte</th>
                  <th className="py-3 px-2.5 text-center bg-[#004632]">Presenças (Qtd / %)</th>
                  <th className="py-3 px-2.5 text-center bg-[#7c1d1d]">Faltas (Qtd / %)</th>
                  <th className="py-3 px-2.5 text-center bg-[#005035]">Atestados (Qtd / % Faltas)</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c, idx) => {
                  const isInfantil =
                    c.name.toUpperCase().startsWith('GRUPO') ||
                    c.grade.toUpperCase().includes('INFANTIL');
                  let somaDiasRecorte = 0;
                  let somaPresencas = 0;
                  let somaFaltas = 0;
                  let somaAtestados = 0;
                  c.students.forEach((s) => {
                    const diasRec = s.diasLetivosRecorte || c.classesHeld || 20;
                    const faltas = s.totalAbsencesMonth || 0;
                    const atest = Math.min(faltas, s.justifiedAbsences || 0);
                    somaDiasRecorte += diasRec;
                    somaFaltas += faltas;
                    somaAtestados += atest;
                    somaPresencas += Math.max(0, diasRec - faltas);
                  });
                  const pctPres =
                    somaDiasRecorte > 0 ? Math.round((somaPresencas / somaDiasRecorte) * 100) : 100;
                  const pctFaltas =
                    somaDiasRecorte > 0 ? Math.round((somaFaltas / somaDiasRecorte) * 100) : 0;
                  const pctAtest =
                    somaFaltas > 0 ? Math.round((somaAtestados / somaFaltas) * 100) : 0;

                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-[#edeeec] ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-[#f9faf8]'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[0.7rem] font-black ${
                            isInfantil
                              ? 'bg-[#eaf6ef] text-[#005035]'
                              : 'bg-[#c3e5f4]/60 text-[#003440]'
                          }`}
                        >
                          {isInfantil ? 'ED. INFANTIL' : 'ENS. FUNDAMENTAL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-black text-[#003440] block">{c.name}</span>
                        <span className="text-[0.72rem] text-[#41484b]">{c.grade}</span>
                      </td>
                      <td className="py-2.5 px-2.5 text-[#41484b] font-semibold">
                        {c.shift.replace('Turno ', '')} • {c.room}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-black text-[#003440]">
                        {c.totalStudents}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-bold text-[#41484b]">
                        {somaDiasRecorte}d
                      </td>
                      <td className="py-2.5 px-2.5 text-center bg-[#eaf6ef]/40 font-black text-[#005035]">
                        {somaPresencas}d ({pctPres}%)
                      </td>
                      <td className="py-2.5 px-2.5 text-center bg-[#fff8f7]/60 font-black text-[#ba1a1a]">
                        {somaFaltas} ({pctFaltas}%)
                      </td>
                      <td className="py-2.5 px-2.5 text-center bg-[#eaf6ef]/50 font-black text-[#005035]">
                        {somaAtestados} ({pctAtest}% das faltas)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 6: Aba do Banco de Dados — E-mails Permitidos (Emails_Permitidos_2027) */}
      {activeTab === 'emails_permitidos' && (
        <section className="bg-white rounded-2xl p-5 shadow-sm border-2 border-[#005035]/20 space-y-4">
          <div className="p-4 rounded-2xl bg-[#eaf6ef] border-2 border-[#a4f3ca] text-[#003723] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-0.5 rounded-full bg-[#005035] text-white text-[0.74rem] font-black uppercase">
                  Aba Oficial Google Sheets: Emails_Permitidos_2027
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white text-[#005035] text-[0.74rem] font-extrabold border border-[#a4f3ca]">
                  {permittedEmailsList.filter((u) => u.active).length} Ativos • {permittedEmailsList.length} Cadastrados
                </span>
              </div>
              <h2 className="text-[1.25rem] sm:text-[1.35rem] font-black mt-1.5 leading-tight">
                Aba do Banco de Dados — Lista Nominal de E-mails Institucionais Permitidos
              </h2>
              <p className="text-[0.84rem] font-semibold opacity-90 mt-0.5">
                Relação oficial de contas Google Workspace (<strong>{INSTITUTIONAL_EMAIL_DOMAIN}</strong> e direção) com permissão de login no sistema e respectivo vínculo de turma.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onNavigateToAcessos && (
                <button
                  type="button"
                  onClick={onNavigateToAcessos}
                  className="min-h-[44px] px-4 rounded-xl bg-[#003440] hover:bg-[#004c5c] text-white font-black text-[0.82rem] flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                  <span>Gerenciar Acessos / Turmas</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[0.82rem] font-bold text-[#41484b]">
              Exibindo{' '}
              {
                permittedEmailsList.filter(
                  (u) =>
                    u.email.toLowerCase().includes(emailSearchTab6.toLowerCase()) ||
                    u.name.toLowerCase().includes(emailSearchTab6.toLowerCase()) ||
                    u.assignedClassName.toLowerCase().includes(emailSearchTab6.toLowerCase())
                ).length
              }{' '}
              e-mails institucionais tabulados no banco de dados:
            </p>
            <div className="relative w-full sm:w-80">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#71787b] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={emailSearchTab6}
                onChange={(e) => setEmailSearchTab6(e.target.value)}
                placeholder="Filtrar e-mail ou educador na aba..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[#f3f4f2] border border-[#c0c8cb] text-[0.82rem] font-semibold focus:outline-none focus:bg-white focus:border-[#003440]"
              />
            </div>
          </div>

          <div className="border-2 border-[#003440]/20 rounded-xl overflow-x-auto max-h-[620px]">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead className="sticky top-0 z-10 bg-[#003440] text-white text-[0.72rem] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 font-extrabold border-r border-white/15 w-14 text-center">Nº</th>
                  <th className="py-3 px-3 font-extrabold border-r border-white/15">E-mail Institucional Permitido (Workspace)</th>
                  <th className="py-3 px-3 font-extrabold border-r border-white/15">Nome do(a) Educador(a) / Servidor(a)</th>
                  <th className="py-3 px-3 font-extrabold border-r border-white/15">Perfil / Permissão</th>
                  <th className="py-3 px-3 font-extrabold border-r border-white/15">Turma Liberada (Limite)</th>
                  <th className="py-3 px-3 font-extrabold border-r border-white/15 text-center">Status</th>
                  <th className="py-3 px-3 font-extrabold text-center">Data Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edeeec] text-[0.8rem]">
                {permittedEmailsList
                  .filter(
                    (u) =>
                      u.email.toLowerCase().includes(emailSearchTab6.toLowerCase()) ||
                      u.name.toLowerCase().includes(emailSearchTab6.toLowerCase()) ||
                      u.assignedClassName.toLowerCase().includes(emailSearchTab6.toLowerCase())
                  )
                  .map((u, idx) => (
                    <tr
                      key={u.id}
                      className={idx % 2 === 0 ? 'bg-white hover:bg-[#eaf6ef]/50' : 'bg-[#f8faf9] hover:bg-[#eaf6ef]/50'}
                    >
                      <td className="py-2.5 px-3 font-black text-center text-[#71787b] border-r border-[#edeeec]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#003440] border-r border-[#edeeec]">
                        {u.email}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#151a18] border-r border-[#edeeec]">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar name={u.name || u.email} size="sm" />
                          <span>{u.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 border-r border-[#edeeec]">
                        <span
                          className={`px-2 py-0.5 rounded-md font-black text-[0.68rem] uppercase ${
                            u.role === 'admin'
                              ? 'bg-[#003440] text-white'
                              : u.role === 'usuario'
                              ? 'bg-[#eaf6ef] text-[#005035] border border-[#a4f3ca]'
                              : 'bg-[#fff4e5] text-[#7a4100] border border-[#f5d096]'
                          }`}
                        >
                          {u.role === 'admin'
                            ? 'ADMIN (Acesso Pleno)'
                            : u.role === 'usuario'
                            ? 'PEB I (Limitado à Turma)'
                            : 'PEB II (Só Visualização)'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-[#003440] border-r border-[#edeeec]">
                        {u.assignedClassName}
                      </td>
                      <td className="py-2.5 px-3 text-center border-r border-[#edeeec]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-black text-[0.68rem] ${
                            u.active
                              ? 'bg-[#a4f3ca]/70 text-[#003723]'
                              : 'bg-[#ffdad6] text-[#ba1a1a]'
                          }`}
                        >
                          {u.active ? 'PERMITIDO' : 'BLOQUEADO'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-[#71787b]">
                        {u.createdAt}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* NOVA ABA: CONSULTA DE GÊNERO (COLUNA 1: NOME MANUAL | COLUNA 2: M OU F) PARA DAR GÊNERO EM TODO O APP */}
      {activeTab === 'consulta_genero' && (
        <section className="card-welcoming bg-white rounded-3xl p-5 space-y-5 animate-gentle-fade">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#003440]/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-lg bg-[#005035] text-white font-black text-[0.68rem] uppercase tracking-wider">
                  Aba no Banco de Dados: {GENDER_SHEET_TAB_NAME}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-[#eaf6ef] text-[#005035] border border-[#005035]/20 font-extrabold text-[0.68rem]">
                  Coluna A: Nome • Coluna B: M ou F
                </span>
              </div>
              <h2 className="text-[1.25rem] sm:text-[1.45rem] font-black text-[#003440]">
                Planilha de Consulta de Gênero (Estudante, Pai/Mãe, Tio/Tia, Avô/Avó, Vizinho/Vizinha)
              </h2>
              <p className="text-[0.82rem] text-[#41484b] max-w-3xl">
                Coloque manualmente os nomes na <strong>1ª coluna (Coluna A)</strong> e <strong>M ou F na 2ª coluna (Coluna B)</strong>. O aplicativo consulta automaticamente esta aba para flexionar o gênero em todas as telas: <strong>O/A Estudante, Pai/Mãe, Tio/Tia, Avô/Avó, Vizinho/Vizinha, Irmão/Irmã, Padrasto/Madrasta e Professor/Professora</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSyncingCloud}
                onClick={async () => {
                  setIsSyncingCloud(true);
                  try {
                    // Harvest any new student/guardian names from classes into the dictionary
                    const nextMap = new Map<string, NameGenderEntry>();
                    genderEntries.forEach((item) => {
                      const k = normalizePersonNameKey(item.name);
                      if (k) nextMap.set(k, item);
                    });
                    classesToSync.forEach((cls) => {
                      cls.students.forEach((st) => {
                        const stFirst = extractFirstNameKey(st.estudante || st.name);
                        if (stFirst && !nextMap.has(stFirst)) {
                          nextMap.set(stFirst, {
                            name: stFirst,
                            gender: resolvePersonGender(st.estudante || st.name, st.genero),
                          });
                        }
                        const f1First = extractFirstNameKey(st.filiacao1);
                        if (f1First && !nextMap.has(f1First)) {
                          nextMap.set(f1First, {
                            name: f1First,
                            gender: resolvePersonGender(st.filiacao1, 'F'),
                          });
                        }
                        const f2First = extractFirstNameKey(st.filiacao2);
                        if (f2First && !nextMap.has(f2First)) {
                          nextMap.set(f2First, {
                            name: f2First,
                            gender: resolvePersonGender(st.filiacao2, 'M'),
                          });
                        }
                      });
                    });
                    const mergedList = Array.from(nextMap.values()).sort((a, b) =>
                      a.name.localeCompare(b.name, 'pt-BR')
                    );
                    saveStoredNameGenderEntries(mergedList);
                    setGenderEntries(mergedList);
                    enqueueGenderDictionaryWrite(mergedList, classesToSync);
                    const ok = await syncGenderDictionaryToGoogleSheet(classesToSync, mergedList);
                    setStatusMessage({
                      type: ok ? 'success' : 'info',
                      text: ok
                        ? `Aba '${GENDER_SHEET_TAB_NAME}' gravada na Planilha Google e no Firebase com ${mergedList.length} nomes (Coluna A: Nome | Coluna B: M ou F)!`
                        : `Dicionário salvo no Firebase (${mergedList.length} nomes). Na fila automática para a Planilha Google.`,
                    });
                  } catch (e: any) {
                    setStatusMessage({
                      type: 'error',
                      text: e?.message || 'Erro ao sincronizar aba de gênero.',
                    });
                  } finally {
                    setIsSyncingCloud(false);
                  }
                }}
                className="px-4 min-h-[42px] rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.8rem] flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                <span>Gravar Aba '{GENDER_SHEET_TAB_NAME}' no Google Sheets</span>
              </button>
            </div>
          </div>

          {/* Painel Rápido: Inserir Nome Manualmente (Coluna 1) + M ou F (Coluna 2) + Simulador de Vínculo Familiar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-[#f5f7f6] p-4 rounded-2xl border border-[#003440]/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[0.76rem] font-black uppercase tracking-wider text-[#003440]">
                  Adicionar ou Atualizar Nome Manualmente na Aba
                </span>
                <span className="text-[0.7rem] font-bold text-[#005035]">
                  Efeito imediato em todo o App
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex-1">
                  <label className="block text-[0.68rem] font-extrabold uppercase text-[#5a676b] mb-1">
                    1ª Coluna (Coluna A): Nome ou Primeiro Nome
                  </label>
                  <input
                    type="text"
                    value={newGenderName}
                    onChange={(e) => setNewGenderName(e.target.value.toUpperCase())}
                    placeholder="Ex.: DARCI, JURACI, ARIEL, MARIA (AVÓ), JOÃO (TIO)..."
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#c0c8cb] text-[0.85rem] font-bold text-[#003440] focus:outline-none focus:border-[#005035]"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <label className="block text-[0.68rem] font-extrabold uppercase text-[#5a676b] mb-1">
                    2ª Coluna (Coluna B): M ou F
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-[#c0c8cb] min-h-[42px]">
                    <button
                      type="button"
                      onClick={() => setNewGenderCode('F')}
                      className={`rounded-lg font-black text-[0.82rem] transition-all cursor-pointer ${
                        newGenderCode === 'F'
                          ? 'bg-[#b3261e] text-white shadow-xs'
                          : 'text-[#5a676b] hover:bg-[#f3f4f2]'
                      }`}
                    >
                      F (Fem.)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewGenderCode('M')}
                      className={`rounded-lg font-black text-[0.82rem] transition-all cursor-pointer ${
                        newGenderCode === 'M'
                          ? 'bg-[#003440] text-white shadow-xs'
                          : 'text-[#5a676b] hover:bg-[#f3f4f2]'
                      }`}
                    >
                      M (Masc.)
                    </button>
                  </div>
                </div>
                <div className="sm:pt-5">
                  <button
                    type="button"
                    onClick={() => {
                      const cleanKey = normalizePersonNameKey(newGenderName);
                      if (!cleanKey) return;
                      const updated = [
                        ...genderEntries.filter(
                          (item) => normalizePersonNameKey(item.name) !== cleanKey
                        ),
                        { name: cleanKey, gender: newGenderCode },
                      ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                      saveStoredNameGenderEntries(updated);
                      setGenderEntries(updated);
                      setNewGenderName('');
                      enqueueGenderDictionaryWrite(updated, classesToSync);
                    }}
                    className="w-full sm:w-auto px-4 min-h-[42px] rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-black text-[0.8rem] cursor-pointer shrink-0"
                  >
                    Salvar M/F
                  </button>
                </div>
              </div>
            </div>

            {/* Simulador ao Vivo de Concordância de Gênero & Parentesco */}
            <div className="lg:col-span-5 bg-[#eaf6ef]/70 p-4 rounded-2xl border border-[#005035]/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.74rem] font-black uppercase tracking-wider text-[#005035]">
                  Teste de Consulta Automática (Parentesco &amp; Estudante)
                </span>
                <span className="text-[0.68rem] font-bold text-[#003440] bg-white px-2 py-0.5 rounded-md border border-[#003440]/10">
                  Tempo Real
                </span>
              </div>
              <input
                type="text"
                value={genderTestSimulatorName}
                onChange={(e) => setGenderTestSimulatorName(e.target.value.toUpperCase())}
                placeholder="Digite ex.: CARLOS (TIO), SANDRA (VIZINHA), HELENA..."
                className="w-full min-h-[38px] px-3 rounded-xl bg-white border border-[#005035]/30 text-[0.82rem] font-bold text-[#003440]"
              />
              {(() => {
                const simRel = resolveGuardianRelationshipInfo(
                  genderTestSimulatorName,
                  'responsavel'
                );
                const simStudent = getStudentGenderLabel({
                  name: simRel.cleanName,
                  estudante: simRel.cleanName,
                });
                return (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[0.74rem]">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-black ${
                        simRel.gender === 'F'
                          ? 'bg-[#ffdad6] text-[#93000a]'
                          : 'bg-[#d3e4ff] text-[#001c38]'
                      }`}
                    >
                      Gênero na Planilha: {simRel.gender} ({simStudent.label})
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-white font-bold text-[#003440] border border-[#003440]/15">
                      Estudante: {simStudent.estudanteTitle} ({simStudent.matriculadoTerm})
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#005035] text-white font-black">
                      Vínculo Familiar: {simRel.roleLabel}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Barra de Busca e Contadores M / F */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[0.82rem] font-bold text-[#41484b]">
                Total de nomes mapeados: <strong>{genderEntries.length}</strong>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#ffdad6]/60 text-[#93000a] font-black text-[0.72rem]">
                F (Feminino): {genderEntries.filter((e) => e.gender === 'F').length}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#d3e4ff]/70 text-[#001c38] font-black text-[0.72rem]">
                M (Masculino): {genderEntries.filter((e) => e.gender === 'M').length}
              </span>
            </div>
            <div className="relative w-full sm:w-80">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#71787b] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={genderSearchQuery}
                onChange={(e) => setGenderSearchQuery(e.target.value)}
                placeholder="Buscar nome na Coluna A..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[#f3f4f2] border border-[#c0c8cb] text-[0.82rem] font-semibold focus:outline-none focus:bg-white focus:border-[#003440]"
              />
            </div>
          </div>

          {/* Tabela Oficial da Aba Consulta_Genero_Nomes_2027 (Coluna A: Nome | Coluna B: M ou F) */}
          <div className="border-2 border-[#003440]/20 rounded-2xl overflow-x-auto max-h-[560px]">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-[#003440] text-white text-[0.72rem] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 font-extrabold border-r border-white/15 w-16 text-center">
                    Linha
                  </th>
                  <th className="py-3 px-4 font-extrabold border-r border-white/15">
                    Coluna A — NOME (Estudante / Responsável / Educador)
                  </th>
                  <th className="py-3 px-4 font-extrabold border-r border-white/15 w-48 text-center">
                    Coluna B — GÊNERO (M ou F)
                  </th>
                  <th className="py-3 px-4 font-extrabold">
                    Concordância Automática no App (Estudante • Família • Parentesco)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edeeec] text-[0.82rem]">
                {genderEntries
                  .filter((item) =>
                    !genderSearchQuery.trim()
                      ? true
                      : item.name
                          .toLowerCase()
                          .includes(genderSearchQuery.trim().toLowerCase())
                  )
                  .map((item, idx) => {
                    const isF = item.gender === 'F';
                    return (
                      <tr
                        key={item.name}
                        className={
                          idx % 2 === 0
                            ? 'bg-white hover:bg-[#eaf6ef]/40'
                            : 'bg-[#f8faf9] hover:bg-[#eaf6ef]/40'
                        }
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-center text-[#71787b] border-r border-[#edeeec]">
                          {idx + 2}
                        </td>
                        <td className="py-2.5 px-4 font-black text-[#003440] border-r border-[#edeeec]">
                          {item.name}
                        </td>
                        <td className="py-2 px-4 text-center border-r border-[#edeeec]">
                          <div className="inline-flex items-center gap-1 bg-[#f3f4f2] p-1 rounded-xl border border-[#c0c8cb]">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = genderEntries.map((entry) =>
                                  entry.name === item.name
                                    ? { ...entry, gender: 'F' as GenderCode }
                                    : entry
                                );
                                saveStoredNameGenderEntries(updated);
                                setGenderEntries(updated);
                                enqueueGenderDictionaryWrite(updated, classesToSync);
                              }}
                              className={`px-3 py-1 rounded-lg font-black text-[0.75rem] cursor-pointer transition-all ${
                                isF
                                  ? 'bg-[#b3261e] text-white shadow-2xs'
                                  : 'text-[#5a676b] hover:bg-white'
                              }`}
                            >
                              F
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = genderEntries.map((entry) =>
                                  entry.name === item.name
                                    ? { ...entry, gender: 'M' as GenderCode }
                                    : entry
                                );
                                saveStoredNameGenderEntries(updated);
                                setGenderEntries(updated);
                                enqueueGenderDictionaryWrite(updated, classesToSync);
                              }}
                              className={`px-3 py-1 rounded-lg font-black text-[0.75rem] cursor-pointer transition-all ${
                                !isF
                                  ? 'bg-[#003440] text-white shadow-2xs'
                                  : 'text-[#5a676b] hover:bg-white'
                              }`}
                            >
                              M
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-[0.78rem] font-semibold text-[#374346]">
                          {isF ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-[#ffdad6]/60 text-[#93000a] font-black">
                                A Estudante
                              </span>
                              <span>• Mãe • Tia • Avó • Vizinha • Irmã • Madrasta • Professora</span>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-[#d3e4ff]/80 text-[#001c38] font-black">
                                O Estudante
                              </span>
                              <span>• Pai • Tio • Avô • Vizinho • Irmão • Padrasto • Professor</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ABA OFICIAL: ÔNIBUS FRETADO & TRANSPORTE ESCOLAR MUNICIPAL */}
      {activeTab === 'onibus_fretado' && (
        <section className="card-welcoming bg-white rounded-3xl p-5 sm:p-7 space-y-5 animate-gentle-fade border border-[#003440]/10 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#003440]/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-[#005035]">
                  directions_bus
                </span>
                <h2 className="text-lg sm:text-xl font-black text-[#003440]">
                  Transporte &amp; Ônibus Escolar Fretado (2027)
                </h2>
              </div>
              <p className="text-[0.82rem] text-[#436370]">
                Relação oficial de estudantes que utilizam as linhas de ônibus fretado municipal EMEB Prof. Joaquim Candelário de Freitas.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#eaf6ef] text-[#005035] font-black text-[0.78rem]">
                {onibusFretadoRows.length} Estudantes com Transporte
              </span>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setBusRouteFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-bold text-[0.76rem] cursor-pointer transition-all ${
                  busRouteFilter === 'all'
                    ? 'bg-[#003440] text-white font-extrabold'
                    : 'bg-[#f1f4f3] text-[#436370] hover:bg-[#e3e8e6]'
                }`}
              >
                Todas as Rotas
              </button>
              {uniqueBusRoutes.map((route) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => setBusRouteFilter(route)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-[0.76rem] cursor-pointer transition-all ${
                    busRouteFilter === route
                      ? 'bg-[#005035] text-white font-extrabold'
                      : 'bg-[#f1f4f3] text-[#436370] hover:bg-[#e3e8e6]'
                  }`}
                >
                  {route}
                </button>
              ))}
            </div>

            <div className="relative min-w-[260px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5a676b] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={busSearchQuery}
                onChange={(e) => setBusSearchQuery(e.target.value)}
                placeholder="Filtrar por aluno, bairro ou RA..."
                className="w-full pl-9 pr-3 py-1.5 bg-[#f5f7f6] text-[#191c1b] text-[0.8rem] rounded-xl border border-[#003440]/12 outline-none focus:border-[#005035]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-[#003440]/12">
            <table className="w-full text-left text-[0.78rem]">
              <thead className="bg-[#f5f7f6] text-[#003440] font-black uppercase text-[0.7rem] border-b border-[#003440]/10">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">Nº</th>
                  <th className="py-2.5 px-3">Turma</th>
                  <th className="py-2.5 px-3">Estudante</th>
                  <th className="py-2.5 px-3">RA</th>
                  <th className="py-2.5 px-3">Rota do Ônibus</th>
                  <th className="py-2.5 px-3">Endereço Residencial</th>
                  <th className="py-2.5 px-3">Bairro</th>
                  <th className="py-2.5 px-3">Responsável</th>
                  <th className="py-2.5 px-3 text-center">WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#003440]/5">
                {filteredOnibusRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#5a676b] font-medium">
                      Nenhum estudante encontrado com transporte cadastrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredOnibusRows.map((row) => {
                    const waLinks = buildWhatsAppLinksFromPhoneString(
                      row.telefones,
                      row.name,
                      row.responsavel
                    );
                    return (
                      <tr key={`${row.classId}_${row.studentId}`} className="hover:bg-[#f9fbfa] transition-colors">
                        <td className="py-2.5 px-3 text-center font-bold text-[#5a676b]">{row.seq}</td>
                        <td className="py-2.5 px-3 font-extrabold text-[#003440]">{row.className}</td>
                        <td className="py-2.5 px-3 font-bold text-[#191c1b]">
                          {row.name}
                          <span className="text-[0.7rem] text-[#5a676b] block">Chamada: Nº {row.number}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[0.72rem] text-[#41484b]">{row.ra || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-[#eaf6ef] text-[#005035] font-extrabold text-[0.72rem]">
                            {row.rota}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#41484b] max-w-[200px] truncate" title={row.endereco}>
                          {row.endereco || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-[#41484b]">{row.bairro}</td>
                        <td className="py-2.5 px-3 text-[#191c1b] font-medium">{row.responsavel}</td>
                        <td className="py-2.5 px-3 text-center">
                          {waLinks.length > 0 ? (
                            <a
                              href={waLinks[0].waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#075E54] font-bold text-[0.72rem] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[15px]">chat</span>
                              <span>WhatsApp</span>
                            </a>
                          ) : (
                            <span className="text-[#5a676b] text-[0.7rem]">Sem telefone</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Mandatory User Confirmation Dialog before creating/writing Google Sheets or Drive data */}
      {confirmModalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border-2 border-[#003440]/20 space-y-4">
            <div className="flex items-center gap-2.5 text-[#003440] pb-2 border-b border-[#edeeec]">
              <span className="material-symbols-outlined text-[28px] text-[#005035]">
                cloud_sync
              </span>
              <h3 className="text-[1.15rem] font-black">
                Confirmar Ação no Google (Admin)
              </h3>
            </div>

            {confirmModalAction === 'create_both_real' && (
              <div className="space-y-2 text-[0.9rem] text-[#191c1b]">
                <p>
                  Você confirma a criação dos seguintes recursos reais na conta Google (<strong>{googleUserEmail || OFFICIAL_ADMIN_EMAIL}</strong>)?
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[0.84rem] text-[#41484b]">
                  <li>
                    <strong>Planilha Google Sheets:</strong>{' '}
                    <code>BD_Oficial_SED_EMEB_Joaquim_Candelario_2027</code> com as 48 colunas SED (incluindo os estudantes reais do G4A e as 40 turmas) + aba dos 200 Dias Letivos.
                  </li>
                  <li>
                    <strong>Pasta Real no Google Drive:</strong>{' '}
                    <code>Fotos_Estudantes_EMEB_Joaquim_Candelario_Freitas_2027</code> para armazenar as fotos dos estudantes.
                  </li>
                </ul>
              </div>
            )}

            {confirmModalAction === 'create_drive_folder' && (
              <div className="space-y-2 text-[0.9rem] text-[#191c1b]">
                <p>
                  Você confirma a criação da pasta real no seu <strong>Google Drive</strong> chamada:
                </p>
                <p className="p-2.5 bg-[#f3f4f2] rounded-xl font-black text-[#003440] border border-[#c0c8cb] text-[0.82rem]">
                  Fotos_Estudantes_EMEB_Joaquim_Candelario_Freitas_2027
                </p>
              </div>
            )}

            {confirmModalAction === 'overwrite_existing' && (
              <div className="space-y-2 text-[0.9rem] text-[#191c1b]">
                <p>
                  Você confirma a gravação/atualização na planilha do <strong>Google Sheets</strong>?
                </p>
                <p className="p-2.5 bg-[#f3f4f2] rounded-xl font-mono text-[0.78rem] text-[#003440] border border-[#c0c8cb] break-all">
                  ID: {extractSpreadsheetId(spreadsheetInput)}
                </p>
                <p className="text-[0.82rem] text-[#41484b]">
                  Serão gravadas as <strong>{classesToSync.length} turmas</strong> ({totalStudentsToSync} estudantes com todas as 48 colunas SED) e a aba dos <strong>200 Dias Letivos</strong>.
                </p>
              </div>
            )}

            {confirmModalAction === 'redefine_and_sync_all' && (
              <div className="space-y-2.5 text-[0.88rem] text-[#191c1b]">
                <p>
                  Você confirma a <strong>Redefinição Total e Sincronia Tripla</strong> (Planilha Google + Firebase Firestore + App)?
                </p>
                <div className="p-3 bg-[#eaf6ef] rounded-xl border border-[#005035]/20 space-y-1.5 text-[0.8rem] text-[#003440]">
                  <p className="font-extrabold flex items-center gap-1.5 text-[#005035]">
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    12 Abas Oficiais Regulamentares que serão Criadas e Alinhadas:
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-[0.74rem] font-medium text-[#41484b]">
                    <span>1. SED_Matriculas_e_Frequencia</span>
                    <span>2. Faltas_Atestados_Infantil</span>
                    <span>3. Faltas_Atestados_Fundamental</span>
                    <span>4. Busca_Ativa_Faltas_Consecutivas_2027</span>
                    <span>5. Turmas_Salas_2027</span>
                    <span>6. Dias_Letivos_SME_2027</span>
                    <span>7. Diagnostico_Inconsistencias_2027</span>
                    <span>8. Bolsa_Familia_Bimestral_2027</span>
                    <span>9. Onibus_Fretado_2027</span>
                    <span>10. Emails_Permitidos_2027</span>
                    <span>11. Monitoramento_Acessos_2027</span>
                    <span>12. Consulta_Genero_Nomes_2027</span>
                  </div>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[0.8rem] text-[#41484b]">
                  <li>Limpeza de linhas fantasmas anteriores (batchClear em todas as abas).</li>
                  <li>Alinhamento imediato no Firebase Firestore Cloud.</li>
                  <li>Diagnóstico completo de inconsistências cadastrais e legais gravado na aba oficial.</li>
                </ul>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalAction(null)}
                className="flex-1 min-h-[48px] bg-[#edeeec] hover:bg-[#e7e8e6] text-[#41484b] font-extrabold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={
                  confirmModalAction === 'create_both_real'
                    ? executeConfirmedCreateBothReal
                    : confirmModalAction === 'create_drive_folder'
                    ? executeConfirmedCreateDriveFolder
                    : confirmModalAction === 'redefine_and_sync_all'
                    ? executeConfirmedRedefineSheet
                    : executeConfirmedWriteSheet
                }
                className="flex-1 min-h-[48px] bg-[#005035] hover:bg-[#003723] text-white font-black rounded-xl shadow-md cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
