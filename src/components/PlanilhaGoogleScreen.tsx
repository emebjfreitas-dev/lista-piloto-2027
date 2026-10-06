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
import {
  OFFICIAL_ADMIN_EMAIL,
  initAuth,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  getSavedSpreadsheetInfo,
  getSavedPhotosDriveFolderInfo,
  savePhotosDriveFolderUrl,
  extractSpreadsheetId,
  createSchoolDatabaseSpreadsheet,
  createRealPhotosFolderInDrive,
  syncClassesToGoogleSheet,
  readClassesFromGoogleSheet,
  syncPhotosFromDriveFolder,
  syncNominalPdfsFromDriveSubfolders,
  getSavedFichasPdfDriveFolderInfo,
  saveFichasPdfDriveFolderUrl,
  syncLocalPhotoFilesToStudents,
  parseSedTsvIntoClasses,
} from '../services/googleSheetsApi';

interface PlanilhaGoogleScreenProps {
  classes: ClassGroup[];
  allClasses?: ClassGroup[];
  authorizedUsers?: AuthorizedUser[];
  userRole?: UserRole;
  onUpdateAllClasses?: (updated: ClassGroup[]) => void;
  onSyncWithClasses: () => void;
  onOpenStudentGrid?: (classId: string, studentId: string) => void;
  onOpenStudentPdf?: (classId: string, studentId: string) => void;
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
  onNavigateToAcessos,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'nominal_infantil'
    | 'nominal_fundamental'
    | 'frequencia'
    | 'dias_letivos'
    | 'turmas'
    | 'emails_permitidos'
  >('nominal_infantil');
  const [emailSearchTab6, setEmailSearchTab6] = useState('');
  const permittedEmailsList = useMemo(
    () => authorizedUsers || getStoredAuthorizedUsers(),
    [authorizedUsers]
  );
  const [filterTurma, setFilterTurma] = useState('all');
  const [filterTurno, setFilterTurno] = useState<'all' | 'Manhã' | 'Tarde'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'com_faltas' | 'com_atestado' | 'alerta'>('all');
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

  // Mandatory User Confirmation Modal state before mutating/creating Google Sheet or Drive data
  const [confirmModalAction, setConfirmModalAction] = useState<
    'create_both_real' | 'create_drive_folder' | 'overwrite_existing' | null
  >(null);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setNeedsAuth(false);
        setGoogleUserEmail(user.email || user.displayName || OFFICIAL_ADMIN_EMAIL);
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
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'com_faltas' && r.faltasMes > 0) ||
        (filterStatus === 'com_atestado' && r.faltasJustificadas > 0) ||
        (filterStatus === 'alerta' && r.faltasMes >= 4);

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

    rows.forEach((r) => {
      totalDiasRecorte += r.diasLetivosMatriculados;
      totalPresencas += r.presencasMes;
      totalFaltas += r.faltasMes;
      totalAtestados += r.faltasJustificadas;
      totalSemAtestado += r.faltasSemAtestado;
      if (r.faltasMes > 0) estudantesComFaltas += 1;
      if (r.faltasJustificadas > 0) estudantesComAtestados += 1;
      if (r.faltasMes >= 4) estudantesEmAlerta += 1;
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

  return (
    <div className="flex flex-col w-full max-w-xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto space-y-4 pb-36">
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

      {/* Google Sheets & Google Drive Real Database Card */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border-2 border-[#005035]/25 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#a4f3ca]/60 text-[#003723] text-[0.78rem] font-black">
                <span
                  className={`w-2 h-2 rounded-full ${
                    needsAuth ? 'bg-[#ba1a1a]' : 'bg-[#005035]'
                  }`}
                ></span>
                {needsAuth
                  ? 'Desconectado do Google'
                  : `Conectado: ${googleUserEmail}`}
              </span>
              <span className="inline-block px-2.5 py-1 rounded-full bg-[#003440] text-white text-[0.72rem] font-black">
                Admin Editor Único: {OFFICIAL_ADMIN_EMAIL}
              </span>
            </div>

            <h1 className="text-[1.4rem] font-extrabold text-[#003440] leading-tight mt-2">
              Banco de Dados Real (48 Colunas SED + Pasta Drive)
            </h1>
            <p className="text-[0.88rem] text-[#41484b] mt-0.5">
              {SCHOOL_NAME} • {CITY_NAME} • 200 Dias Letivos
            </p>
          </div>

          {!needsAuth && (
            <button
              type="button"
              onClick={handleGoogleLogout}
              className="px-3 py-1.5 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#41484b] font-bold text-[0.78rem] border border-[#c0c8cb] cursor-pointer shrink-0"
            >
              Sair
            </button>
          )}
        </div>

        {/* Official Sign in with Google button if not authenticated */}
        {needsAuth ? (
          <div className="bg-[#f3f4f2] p-4 rounded-2xl border border-[#c0c8cb] space-y-3 text-center">
            <p className="text-[0.92rem] text-[#191c1b] font-semibold">
              Entre com a conta administrativa (<strong>{OFFICIAL_ADMIN_EMAIL}</strong>) para criar automaticamente a <strong>Planilha Real no Google Sheets</strong> e a <strong>Pasta Real de Fotos no Google Drive</strong>:
            </p>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="gsi-material-button mx-auto w-full max-w-sm min-h-[54px] bg-white hover:bg-[#f8faf9] text-[#191c1b] font-extrabold text-[0.98rem] rounded-xl border-2 border-[#c0c8cb] shadow-sm flex items-center justify-center gap-3 px-5 cursor-pointer transition-all active:scale-98"
            >
              <div className="w-6 h-6 shrink-0">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  style={{ display: 'block', width: '100%', height: '100%' }}
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  ></path>
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  ></path>
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  ></path>
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  ></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents">
                {isLoggingIn
                  ? 'Conectando Google Sheets & Drive...'
                  : 'Sign in with Google (Criar Planilha & Pasta Real)'}
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-3 bg-[#f8faf9] p-4 rounded-2xl border border-[#e1e3e1]">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  disabled={isSyncingCloud}
                  onClick={handleRequestCreateRealDatabaseAndFolder}
                  className="w-full min-h-[56px] px-4 bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.98rem] rounded-xl flex items-center justify-center gap-2.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    rocket_launch
                  </span>
                  <span>
                    {isSyncingCloud
                      ? 'Criando Planilha e Pasta no seu Google...'
                      : '1. Criar Planilha Real (48 Colunas SED) + Pasta Real de Fotos'}
                  </span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={isSyncingCloud}
                    onClick={handleRequestCreateDriveFolderOnly}
                    className="min-h-[48px] px-3 bg-[#003440] hover:bg-[#1e4b58] text-white font-extrabold text-[0.85rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      create_new_folder
                    </span>
                    <span>Criar Pasta Real no Drive</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSyncingCloud || !spreadsheetInput.trim()}
                    onClick={handleRequestWriteSheet}
                    className="min-h-[48px] px-3 bg-[#003440] hover:bg-[#1e4b58] text-white font-extrabold text-[0.85rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      cloud_upload
                    </span>
                    <span>Atualizar Planilha Atual</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="p-3 bg-[#fff8f0] rounded-xl border border-[#e6c387] text-[0.82rem] font-bold text-[#8c5000]">
                🔒 Somente o Administrador ({OFFICIAL_ADMIN_EMAIL}) pode criar ou editar as planilhas e pastas no Google Drive.
              </div>
            )}

            <button
              type="button"
              disabled={isSyncingCloud || !spreadsheetInput.trim()}
              onClick={handleReadFromGoogleSheet}
              className="w-full min-h-[50px] px-4 bg-white hover:bg-[#e7e8e6] text-[#003440] border-2 border-[#003440] font-extrabold text-[0.9rem] rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[20px]">
                sync
              </span>
              <span>Sincronizar Agora (Ler Estudantes da Planilha + Fotos da Pasta Drive)</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isSyncingCloud}
                onClick={handleSyncDrivePhotosNow}
                className="w-full min-h-[46px] px-4 bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#003723] border border-[#005035]/30 font-extrabold text-[0.84rem] rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">
                  photo_library
                </span>
                <span>Sincronizar Fotos da Pasta do Drive</span>
              </button>

              <button
                type="button"
                disabled={isSyncingCloud}
                onClick={handleSyncNominalPdfsNow}
                className="w-full min-h-[46px] px-4 bg-[#fff8f7] hover:bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]/30 font-extrabold text-[0.84rem] rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">
                  picture_as_pdf
                </span>
                <span>Sincronizar Subpastas de PDFs Nominais</span>
              </button>
            </div>
          </div>
        )}

        {/* Rule Banner: Manual Sheet -> Auto App | App -> Sheet Only on Absences */}
        <div className="p-3.5 rounded-xl bg-[#eaf6ef] border border-[#a4f3ca] space-y-1.5 text-[0.8rem] text-[#003723]">
          <p className="font-black flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span>Regra Oficial de Sincronização Automática:</span>
          </p>
          <p>
            • <strong>Google Sheets + Pasta Drive → App (Automático):</strong> Os dados de estudantes (48 colunas SED), turmas, 200 dias letivos e as fotos soltas na pasta (<code className="font-mono">NOME DO ESTUDANTE.jpg</code>) atualizam o aplicativo automaticamente.
          </p>
          <p>
            • <strong>App → Google Sheets (Apenas Faltas):</strong> O aplicativo alimenta a planilha <strong>somente no preenchimento de faltas/atestados</strong>, sem sobrescrever os dados cadastrais dos estudantes editados manualmente na planilha.
          </p>
        </div>

        {/* Bulk Photo Selector from Computer Folder (matches by student name) */}
        <div className="bg-[#f3f4f2] p-3.5 rounded-xl border border-[#c0c8cb] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <span className="text-[0.82rem] font-black text-[#003440] block">
              📸 Sincronizar Várias Fotos de Uma Vez (Pelo Nome do Arquivo JPG)
            </span>
            <span className="text-[0.75rem] text-[#41484b] block">
              Selecione todas as fotos da pasta (<code className="font-mono">RAUANNY GRAZIELLY DA SILVA LIMA.jpg</code>, etc.) para vincular automaticamente a cada estudante:
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
            className="px-3.5 min-h-[44px] rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-extrabold text-[0.8rem] flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span>Selecionar Fotos JPG</span>
          </button>
        </div>

        {/* LIVE LINKS: Planilha Real & Pasta Real de Fotos */}
        <div className="pt-3 border-t border-[#edeeec] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.82rem] font-black text-[#003440] uppercase">
              Links Reais da Planilha e da Pasta de Fotos:
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowTsvImporter(!showTsvImporter)}
                className="text-[0.78rem] font-extrabold text-[#005035] hover:underline cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">content_paste</span>
                <span>{showTsvImporter ? 'Fechar Importador SED' : 'Colar Dados SED (48 Colunas)'}</span>
              </button>
            )}
          </div>

          {/* Importer for Raw SED TSV (48 Columns) */}
          {showTsvImporter && isAdmin && (
            <div className="bg-[#eaf6ef] p-3.5 rounded-xl border-2 border-[#005035]/30 space-y-2.5">
              <p className="text-[0.82rem] font-bold text-[#003723]">
                Cole abaixo as linhas copiadas da SED / Excel (com as 48 colunas de <em>TIPO DE ENSINO</em> até <em>SUCESSÃO ESCOLAR</em>):
              </p>
              <textarea
                rows={4}
                value={rawTsvText}
                onChange={(e) => setRawTsvText(e.target.value)}
                placeholder="EDUCACAO INFANTIL	1	1	ALICE DE BARROS PIRES	123667009	7	SP	15/07/2021..."
                className="w-full p-2.5 bg-white text-[#191c1b] font-mono text-[0.75rem] rounded-xl border border-[#c0c8cb] focus:outline-none focus:border-[#005035]"
              />
              <button
                type="button"
                onClick={handleImportSedTsv}
                className="w-full min-h-[44px] bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.88rem] rounded-xl cursor-pointer"
              >
                Importar Linhas SED para o Banco de Dados
              </button>
            </div>
          )}

          {/* Link 1: Planilha Google Sheets */}
          <div className="bg-[#f3f4f2] p-3 rounded-xl border border-[#c0c8cb] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.78rem] font-extrabold text-[#003440]">
                📊 1. Link da Planilha Banco de Dados ({connectedTitle}):
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopyLink('sheet', currentSheetFullUrl)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#e7e8e6] text-[#003440] font-bold text-[0.74rem] border border-[#c0c8cb] cursor-pointer"
                >
                  {copiedKey === 'sheet' ? '✓ Copiado!' : 'Copiar Link'}
                </button>
                <a
                  href={currentSheetFullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-[#005035] hover:bg-[#003723] text-white font-bold text-[0.74rem] flex items-center gap-1"
                >
                  <span>Abrir Planilha</span>
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
            </div>
            <input
              type="text"
              readOnly={!isAdmin}
              value={spreadsheetInput}
              onChange={(e) => setSpreadsheetInput(e.target.value)}
              placeholder="Cole o link https://docs.google.com/spreadsheets/d/... ou clique em Criar Planilha Real acima"
              className="w-full px-3 py-2 bg-white text-[#003440] font-mono text-[0.78rem] rounded-lg border border-[#c0c8cb]"
            />
          </div>

          {/* Link 2: Pasta Real de Fotos no Google Drive */}
          <div className="bg-[#f3f4f2] p-3 rounded-xl border border-[#c0c8cb] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.78rem] font-extrabold text-[#003440]">
                📁 2. Link da Pasta Real de Fotos (Google Drive):
                {isRealDriveCreated && (
                  <span className="ml-1.5 px-2 py-0.5 rounded-full bg-[#a4f3ca] text-[#003723] text-[0.68rem]">
                    Pasta Real Criada
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopyLink('drive', driveFolderUrl)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#e7e8e6] text-[#003440] font-bold text-[0.74rem] border border-[#c0c8cb] cursor-pointer"
                >
                  {copiedKey === 'drive' ? '✓ Copiado!' : 'Copiar Link'}
                </button>
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.74rem] flex items-center gap-1"
                >
                  <span>Abrir Pasta no Drive</span>
                  <span className="material-symbols-outlined text-[14px]">folder_shared</span>
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
              className="w-full px-3 py-2 bg-white text-[#003440] font-mono text-[0.78rem] rounded-lg border border-[#c0c8cb]"
            />
          </div>

          {/* Link 3: Hyperlink Direto dos Documentos PDF Nominais (Fichas Informativas) */}
          <div className="bg-[#fff8f7] p-3.5 rounded-xl border border-[#ba1a1a]/30 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.82rem] font-extrabold text-[#ba1a1a] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">link</span>
                <span>📄 3. Hyperlinks Diretos dos Documentos PDF Nominais (Sem abrir pasta):</span>
              </span>
              <button
                type="button"
                disabled={isSyncingCloud}
                onClick={handleSyncNominalPdfsNow}
                className="px-3 py-1.5 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white font-black text-[0.76rem] flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">sync</span>
                <span>Atualizar Hyperlinks dos Docs PDF</span>
              </button>
            </div>
            <p className="text-[0.78rem] text-[#2c373a] font-semibold">
              Cada estudante na tabela abaixo possui um <strong>hyperlink direto no próprio nome</strong> (e no botão <strong>Hyperlink Doc</strong>) que abre imediatamente o documento <code className="font-mono">NOME DO ESTUDANTE.pdf</code> no aplicativo, sem precisar abrir pastas.
            </p>
          </div>
        </div>

        {/* Secondary Action: Download Offline .xlsx */}
        <button
          onClick={handleDownloadExcel}
          type="button"
          className="w-full min-h-[48px] bg-[#edeeec] hover:bg-[#e7e8e6] text-[#003440] font-extrabold text-[0.92rem] rounded-xl flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">download</span>
          <span>Baixar Planilha Completa (.xlsx - Abas Nominais Infantil e Fundamental + 48 Colunas SED + 200 Dias)</span>
        </button>
      </section>

      {/* Detailed 6-Tabs Selector: Educação Infantil Nominal, Ensino Fundamental Nominal, Base SED 48 Col, 200 Dias, 40 Turmas, E-mails Permitidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 bg-[#edeeec] p-2 rounded-2xl border border-[#c0c8cb]/70">
        <button
          onClick={() => {
            setActiveTab('nominal_infantil');
            setFilterTurma('all');
          }}
          type="button"
          className={`py-3 px-3 rounded-xl font-black text-[0.84rem] text-left sm:text-center transition-all cursor-pointer flex items-center sm:flex-col justify-between sm:justify-center gap-1 ${
            activeTab === 'nominal_infantil'
              ? 'bg-[#005035] text-white shadow-sm'
              : 'bg-white/70 text-[#003440] hover:bg-white'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px]">child_care</span>
            <span>1. Educação Infantil (Nominal)</span>
          </span>
          <span className={`text-[0.7rem] font-bold px-2 py-0.5 rounded-full ${
            activeTab === 'nominal_infantil' ? 'bg-white/20 text-white' : 'bg-[#eaf6ef] text-[#005035]'
          }`}>
            Faltas & Atestados (Qtd e %)
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('nominal_fundamental');
            setFilterTurma('all');
          }}
          type="button"
          className={`py-3 px-3 rounded-xl font-black text-[0.84rem] text-left sm:text-center transition-all cursor-pointer flex items-center sm:flex-col justify-between sm:justify-center gap-1 ${
            activeTab === 'nominal_fundamental'
              ? 'bg-[#003440] text-white shadow-sm'
              : 'bg-white/70 text-[#003440] hover:bg-white'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px]">school</span>
            <span>2. Ensino Fundamental (Nominal)</span>
          </span>
          <span className={`text-[0.7rem] font-bold px-2 py-0.5 rounded-full ${
            activeTab === 'nominal_fundamental' ? 'bg-white/20 text-white' : 'bg-[#c3e5f4]/60 text-[#003440]'
          }`}>
            Faltas & Atestados (Qtd e %)
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('frequencia');
            setFilterTurma('all');
          }}
          type="button"
          className={`py-3 px-3 rounded-xl font-extrabold text-[0.84rem] text-left sm:text-center transition-all cursor-pointer flex items-center sm:flex-col justify-between sm:justify-center gap-1 ${
            activeTab === 'frequencia'
              ? 'bg-[#003440] text-white shadow-sm'
              : 'bg-white/70 text-[#41484b] hover:bg-white hover:text-[#003440]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px]">dataset</span>
            <span>3. Base Geral SED (48 Col.)</span>
          </span>
          <span className="text-[0.7rem] opacity-80">Todos os Segmentos</span>
        </button>

        <button
          onClick={() => setActiveTab('dias_letivos')}
          type="button"
          className={`py-3 px-3 rounded-xl font-extrabold text-[0.84rem] text-left sm:text-center transition-all cursor-pointer flex items-center sm:flex-col justify-between sm:justify-center gap-1 ${
            activeTab === 'dias_letivos'
              ? 'bg-[#003440] text-white shadow-sm'
              : 'bg-white/70 text-[#41484b] hover:bg-white hover:text-[#003440]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px]">calendar_month</span>
            <span>4. 200 Dias Letivos</span>
          </span>
          <span className="text-[0.7rem] opacity-80">Calendário SME 2027</span>
        </button>

        <button
          onClick={() => setActiveTab('turmas')}
          type="button"
          className={`py-3 px-3 rounded-xl font-extrabold text-[0.84rem] text-left sm:text-center transition-all cursor-pointer flex items-center sm:flex-col justify-between sm:justify-center gap-1 ${
            activeTab === 'turmas'
              ? 'bg-[#003440] text-white shadow-sm'
              : 'bg-white/70 text-[#41484b] hover:bg-white hover:text-[#003440]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px]">groups</span>
            <span>5. Quadro de Turmas ({classes.length})</span>
          </span>
          <span className="text-[0.7rem] opacity-80">Resumo por Turma</span>
        </button>

        <button
          onClick={() => setActiveTab('emails_permitidos')}
          type="button"
          className={`py-3 px-3 rounded-xl font-black text-[0.84rem] text-left sm:text-center transition-all cursor-pointer flex items-center sm:flex-col justify-between sm:justify-center gap-1 ${
            activeTab === 'emails_permitidos'
              ? 'bg-[#005035] text-white shadow-sm'
              : 'bg-white/70 text-[#005035] hover:bg-white'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px]">verified_user</span>
            <span>6. E-mails Permitidos ({permittedEmailsList.length})</span>
          </span>
          <span
            className={`text-[0.7rem] font-bold px-2 py-0.5 rounded-full ${
              activeTab === 'emails_permitidos'
                ? 'bg-white/20 text-white'
                : 'bg-[#eaf6ef] text-[#005035]'
            }`}
          >
            Workspace {INSTITUTIONAL_EMAIL_DOMAIN}
          </span>
        </button>
      </div>

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
                : 'bg-[#f3f4f2] border-[#c0c8cb] text-[#003440]'
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
                <span className="px-2.5 py-0.5 rounded-full bg-white text-[#003440] text-[0.75rem] font-extrabold border border-[#c0c8cb]">
                  {stageTurmasList.length} Turmas • {stageStats.totalEstudantes} Estudantes Tabulados
                </span>
              </div>
              <h2 className="text-[1.25rem] sm:text-[1.4rem] font-black mt-1.5 leading-tight">
                {activeTab === 'nominal_infantil'
                  ? 'Tabulação Nominal de Faltas e Atestados — EDUCAÇÃO INFANTIL (Grupo 04 e Grupo 05)'
                  : activeTab === 'nominal_fundamental'
                  ? 'Tabulação Nominal de Faltas e Atestados — ENSINO FUNDAMENTAL (1º ao 5º Ano)'
                  : 'Base Geral SED (48 Colunas) — Educação Infantil e Ensino Fundamental'}
              </h2>
              <p className="text-[0.86rem] font-semibold opacity-90 mt-0.5">
                Relação nominal completa de cada estudante com <strong>Quantidade (Qtd.)</strong> e <strong>Porcentagem (%)</strong> de Presenças, Faltas Totais, Atestados Apresentados (Faltas Justificadas) e Faltas sem Atestado, respeitando o recorte individual da matrícula.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadExcel}
              className="px-4 min-h-[48px] rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-black text-[0.85rem] flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[20px]">table_view</span>
              <span>Exportar Abas (.xlsx)</span>
            </button>
          </div>

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
                {stageStats.estudantesEmAlerta} estudantes em alerta (≥4 faltas)
              </span>
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
              <option value="com_faltas">🔴 Somente Estudantes com Faltas</option>
              <option value="com_atestado">🏥 Somente Estudantes com Atestado</option>
              <option value="alerta">⚠️ Em Alerta de Infrequência (≥4 Faltas)</option>
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
            <table className="w-full text-left text-[0.82rem] border-collapse min-w-[1150px]">
              <thead className="bg-[#003440] text-white sticky top-0 z-10 font-extrabold uppercase tracking-tight">
                <tr>
                  <th className="py-3 px-2.5">Segmento / Etapa</th>
                  <th className="py-3 px-2.5">Turma / Turno</th>
                  <th className="py-3 px-2 text-center">Nº</th>
                  <th className="py-3 px-3">Nome Nominal do(a) Estudante</th>
                  <th className="py-3 px-2.5 text-center">RA Oficial</th>
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
                  <th className="py-3 px-2.5 text-center">Situação / Obs.</th>
                </tr>
              </thead>
              <tbody>
                {filteredFrequenciaRows.slice(0, 250).map((row, idx) => (
                  <tr
                    key={row.id}
                    onClick={() => onOpenStudentGrid?.(row.classId, row.studentId)}
                    title="Clique para abrir a Grade de Dados Interativa (48 Campos SED) deste(a) estudante"
                    className={`border-b border-[#edeeec] cursor-pointer hover:bg-[#c3e5f4]/35 transition-colors ${
                      row.faltasMes >= 4
                        ? 'bg-[#fff8f7]'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-[#f9faf8]'
                    }`}
                  >
                    <td className="py-2.5 px-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[0.68rem] font-black ${
                          row.tipoEnsino === 'EDUCACAO INFANTIL'
                            ? 'bg-[#eaf6ef] text-[#005035]'
                            : 'bg-[#c3e5f4]/60 text-[#003440]'
                        }`}
                      >
                        {row.tipoEnsino === 'EDUCACAO INFANTIL' ? 'ED. INFANTIL' : 'ENS. FUNDAMENTAL'}
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
                            photoUrl={row.fotoUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
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
                                if (onOpenStudentPdf) {
                                  onOpenStudentPdf(row.classId, row.studentId);
                                }
                              }}
                              title={`Abrir Documento PDF Nominal de ${row.nome} por Hyperlink`}
                              className="doc-hyperlink font-extrabold block text-[0.92rem] truncate"
                            >
                              {row.nome}
                            </a>
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
                            title="Abrir Documento PDF Nominal deste(a) estudante por Hyperlink"
                            className="px-2.5 py-1 rounded-lg bg-[#ffdad6]/80 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white font-black text-[0.72rem] flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              link
                            </span>
                            <span>Hyperlink Doc</span>
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-center font-mono text-[0.76rem] text-[#41484b]">
                      {row.ra ? `${row.ra}-${row.digRa}/${row.ufRa}` : '—'}
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
                          row.frequenciaPercent < 75
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
                          row.faltasMes >= 4
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
                ))}
              </tbody>
              {/* Sticky Summary Footer Row with Totals & Percentages */}
              <tfoot className="bg-[#003440] text-white font-black text-[0.8rem] sticky bottom-0">
                <tr>
                  <td colSpan={4} className="py-3 px-3">
                    TOTAL CONSOLIDADO ({stageStats.totalEstudantes} ESTUDANTES EXIBIDOS)
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
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#e1e3e1] space-y-3">
          <div className="border border-[#c0c8cb] rounded-xl overflow-x-auto max-h-[400px]">
            <table className="w-full text-left text-[0.9rem] border-collapse">
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
              <button
                type="button"
                onClick={() => downloadSpreadsheetXLSX(classesToSync)}
                className="min-h-[44px] px-4 rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.82rem] flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>Baixar Excel (.xlsx)</span>
              </button>
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
