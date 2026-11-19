import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ScreenType,
  ClassGroup,
  Student,
  UserRole,
  AuthorizedUser,
  AttendanceWindowConfig,
  UserAccessSessionLog,
  SchoolNotice,
} from './types';
import {
  getStoredClasses,
  saveStoredClasses,
  getStoredAuthorizedUsers,
  saveStoredAuthorizedUsers,
  getStoredAttendanceWindowConfig,
  saveStoredAttendanceWindowConfig,
  getStoredSchoolNotices,
  saveStoredSchoolNotices,
  pushSchoolNoticesToServer,
  evaluateAttendanceLaunchWindow,
  getStoredAccessSessionLogs,
  saveStoredAccessSessionLogs,
  pushAuthorizedUsersToServer,
  pushSessionLogsToServer,
  pushAttendanceWindowToServer,
  pullSharedSchoolStateFromServer,
  pushClassesToServer,
  mergeClassesWithConcurrencyControl,
  getLocalClassesUpdatedAtMs,
  addSecurityAuditLog,
  getStoredLgpdConfig,
  isOfficialSchoolAdminEmail,
  isValidInstitutionalEmail,
  findAuthorizedUserByEmail,
  isUserAccessExpired,
  isUserAccessEffectivelyActive,
  formatAccessExpirationDateBR,
  syncExpiredAuthorizedUsers,
  establishServerAuthSessionCookie,
  clearServerAuthSessionCookie,
} from './services/db';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  subscribeToFirestoreRealtimeState,
  subscribeToSyncStatus,
  SyncStatusSnapshot,
  saveClassesToFirestoreCloud,
  fetchStateFromFirestoreCloud,
  beginBootIntegrityCheck,
  monitorFirestoreIntegrityOnBoot,
  shouldAllowRemoteClassesOverwrite,
  getFirestoreIntegrityReport,
} from './services/firebaseSync';
import { persistSingleStudentPhotoToIndexedDb } from './services/photoIndexedDbCache';
import {
  SyncQueueManager,
  SyncQueueTaskCategory,
} from './services/syncQueueManager';
import {
  probeBackendAvailability,
  isBackendApiAvailable,
} from './services/apiEnvironment';
import { OFFICIAL_OCTOBER_DAYS, INITIAL_CLASSES, INITIAL_AUTHORIZED_USERS } from './data/mockData';
import { getClassAttendanceMetrics, haveClassesChanged } from './utils/attendanceRules';
import {
  getAccessToken,
  getSavedSpreadsheetInfo,
  ensureOfficialSpreadsheetId,
  readClassesFromGoogleSheet,
  readAuthorizedUsersFromGoogleSheet,
  readSessionLogsFromGoogleSheet,
  syncPhotosFromDriveFolder,
  attachPhotosFromDiscoveredCache,
  logoutGoogle,
  getGoogleSheetsSyncFrequency,
} from './services/googleSheetsApi';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { LoginScreen } from './components/LoginScreen';
import { HomeScreen } from './components/HomeScreen';
import { MinhasTurmasScreen } from './components/MinhasTurmasScreen';
import { DetalhesTurmaScreen } from './components/DetalhesTurmaScreen';
import { RegistroFrequenciaMensalScreen } from './components/RegistroFrequenciaMensalScreen';
import { FaltasConsecutivasScreen } from './components/FaltasConsecutivasScreen';
import { ResumoMensalScreen } from './components/ResumoMensalScreen';
import { PlanilhaGoogleScreen } from './components/PlanilhaGoogleScreen';
import { UsuariosAcessoScreen } from './components/UsuariosAcessoScreen';
import { ListasNominaisScreen } from './components/ListasNominaisScreen';
import { AlunosModal } from './components/AlunosModal';
import { RelatorioImpressaoModal } from './components/RelatorioImpressaoModal';
import { AnotacoesModal } from './components/AnotacoesModal';
import { UploadFotoModal } from './components/UploadFotoModal';
import { GradeDadosCriancaModal } from './components/GradeDadosCriancaModal';
import { VisualizarPdfNominalModal } from './components/VisualizarPdfNominalModal';
import { SpotlightCommandModal } from './components/SpotlightCommandModal';
import { AdminArrastePdfsModal } from './components/AdminArrastePdfsModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';

const screenSlideVariants = {
  enter: (direction: 1 | -1) => ({
    opacity: 0,
    x: direction >= 0 ? 22 : -22,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: {
      x: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
      opacity: { duration: 0.18, ease: 'easeOut' as const },
    },
  },
  exit: (direction: 1 | -1) => ({
    opacity: 0,
    x: direction >= 0 ? -14 : 14,
    transition: {
      x: { duration: 0.13, ease: [0.4, 0, 1, 1] as const },
      opacity: { duration: 0.11, ease: 'easeIn' as const },
    },
  }),
};

const ADMIN_ONLY_SCREENS: ScreenType[] = [
  'dias_letivos',
  'usuarios_acesso',
  'diagnostico_bd',
  'importar_deficiencias_htm',
  'bolsa_familia',
  'planilha',
];

const ACTIVE_AUTH_SESSION_STORAGE_KEY = 'emeb_candelario_tab_session_2027_v2';
const LEGACY_AUTH_SESSION_STORAGE_KEY = 'emeb_candelario_active_session_2027_v1';

interface PersistedAuthSession {
  email: string;
  name: string;
  role: UserRole;
  assignedClassId: string;
  assignedClassIds?: string[];
  selectedClassId: string;
  screen: ScreenType;
  sessionId: string | null;
  simulatedTeacherEmail?: string | null;
}

const getSavedActiveAuthSession = (): PersistedAuthSession | null => {
  try {
    // Limpa chave legada persistente em localStorage para evitar login automático indesejado ao abrir o app
    localStorage.removeItem(LEGACY_AUTH_SESSION_STORAGE_KEY);
    const raw = sessionStorage.getItem(ACTIVE_AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string' && parsed.email.includes('@')) {
      return parsed;
    }
  } catch {
    // ignore storage read error
  }
  return null;
};

export default function App() {
  const initialClasses = getStoredClasses();
  const initialAuthorizedUsers = getStoredAuthorizedUsers();
  const initialSavedSession = getSavedActiveAuthSession();

  // Always resolve the latest role & assignedClassId from the master authorizedUsers list so any Admin change in '5. Acessos' immediately takes effect!
  const matchedInitialUser = initialSavedSession
    ? initialAuthorizedUsers.find(
        (u) =>
          u.email.trim().toLowerCase() ===
          initialSavedSession.email.trim().toLowerCase()
      )
    : undefined;

  const rawResolvedRole: UserRole =
    matchedInitialUser?.role || initialSavedSession?.role || 'usuario';
  const effectiveInitialRole: UserRole = isOfficialSchoolAdminEmail(initialSavedSession?.email)
    ? 'admin'
    : rawResolvedRole === 'admin'
    ? 'usuario'
    : rawResolvedRole;
  const effectiveInitialAssignedClassIds: string[] =
    matchedInitialUser &&
    matchedInitialUser.role === 'usuario' &&
    matchedInitialUser.assignedClassIds &&
    matchedInitialUser.assignedClassIds.length > 0
      ? matchedInitialUser.assignedClassIds
      : matchedInitialUser &&
        matchedInitialUser.role === 'usuario' &&
        matchedInitialUser.assignedClassId !== 'all'
      ? [matchedInitialUser.assignedClassId]
      : initialSavedSession?.assignedClassIds && initialSavedSession.assignedClassIds.length > 0
      ? initialSavedSession.assignedClassIds
      : [initialSavedSession?.assignedClassId || initialClasses[0]?.id || 'g04a'];

  const effectiveInitialAssignedClassId: string =
    effectiveInitialAssignedClassIds[0] || initialClasses[0]?.id || 'g04a';

  const effectiveInitialIsStrictAdmin =
    effectiveInitialRole === 'admin' &&
    isOfficialSchoolAdminEmail(initialSavedSession?.email) &&
    matchedInitialUser?.teacherRoleType !== 'apoio' &&
    matchedInitialUser?.teacherRoleType !== 'aee';

  const initialUrlParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const requestedScreenParam = initialUrlParams?.get('screen') as ScreenType | null;
  const requestedClassIdParam = initialUrlParams?.get('classId');

  const [isAuthVerified, setIsAuthVerified] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => Boolean(initialSavedSession));
  const [authLoginError, setAuthLoginError] = useState<string | null>(null);

  const [currentScreen, setCurrentScreen] = useState<ScreenType>(() => {
    if (
      !initialSavedSession ||
      (matchedInitialUser && !isUserAccessEffectivelyActive(matchedInitialUser))
    ) {
      return 'login';
    }
    if (requestedScreenParam && requestedScreenParam !== 'login') {
      if (requestedScreenParam === 'resumo') {
        return 'home';
      }
      const canAccessRequested =
        (effectiveInitialIsStrictAdmin || !ADMIN_ONLY_SCREENS.includes(requestedScreenParam)) &&
        !(effectiveInitialRole === 'peb2' && requestedScreenParam === 'frequencia_mensal');
      if (canAccessRequested) {
        if (effectiveInitialRole === 'usuario' && requestedScreenParam === 'turmas') {
          return 'detalhes';
        }
        return requestedScreenParam;
      }
    }
    const savedScreen = initialSavedSession.screen as string | undefined;
    if (savedScreen && savedScreen !== 'login') {
      if (savedScreen === 'mapa_estudantes' || savedScreen === 'resumo') {
        return 'home';
      }
      const typedScreen = savedScreen as ScreenType;
      if (!effectiveInitialIsStrictAdmin && ADMIN_ONLY_SCREENS.includes(typedScreen)) {
        return 'home';
      }
      if (effectiveInitialRole === 'usuario' && typedScreen === 'turmas') {
        return 'detalhes';
      }
      return typedScreen;
    }
    return 'home';
  });

  const [navigationHistory, setNavigationHistory] = useState<ScreenType[]>([]);
  const [navDirection, setNavDirection] = useState<1 | -1>(1);

  const [classes, setClasses] = useState<ClassGroup[]>(() => initialClasses);
  const [selectedClass, setSelectedClass] = useState<ClassGroup>(() => {
    if (requestedClassIdParam) {
      const deepLinked = initialClasses.find((c) => c.id === requestedClassIdParam);
      if (
        deepLinked &&
        (effectiveInitialRole !== 'usuario' ||
          effectiveInitialAssignedClassIds.includes(deepLinked.id) ||
          effectiveInitialAssignedClassId === deepLinked.id)
      ) {
        return deepLinked;
      }
    }
    const targetId =
      effectiveInitialRole === 'usuario'
        ? effectiveInitialAssignedClassId
        : initialSavedSession?.selectedClassId;
    if (targetId) {
      const found = initialClasses.find((c) => c.id === targetId);
      if (found) return found;
    }
    return initialClasses[0];
  });

  const redirectParam = initialUrlParams?.get('p');
  useEffect(() => {
    if (typeof window !== 'undefined' && (requestedScreenParam || requestedClassIdParam || redirectParam)) {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // ignore history API restriction
      }
    }
  }, [requestedScreenParam, requestedClassIdParam, redirectParam]);
  const [instantSheetSyncStatus, setInstantSheetSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');

  // Role-Based Access Control (ADMIN, USUÁRIO - Sua Turma, PEB II - Só Visualização) & Registered Institutional Users (@educacao.jundiai.sp.gov.br)
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>(() =>
    initialAuthorizedUsers
  );
  const [accessSessionLogs, setAccessSessionLogs] = useState<UserAccessSessionLog[]>(() =>
    getStoredAccessSessionLogs()
  );
  const activeSessionIdRef = React.useRef<string | null>(
    initialSavedSession?.sessionId || null
  );
  const [currentUserEmail, setCurrentUserEmail] = useState<string>(
    initialSavedSession?.email || ''
  );
  const [currentUserName, setCurrentUserName] = useState<string>(() => {
    const email = initialSavedSession?.email || '';
    if (!email) return '';
    if (email.trim().toLowerCase().startsWith('emebjfreitas')) {
      return 'Equipe Administrativa';
    }
    return matchedInitialUser?.name || initialSavedSession?.name || '';
  });

  useEffect(() => {
    if (currentUserEmail && currentUserEmail.trim().toLowerCase().startsWith('emebjfreitas')) {
      setCurrentUserName('Equipe Administrativa');
    }
  }, [currentUserEmail]);
  const [userRole, setUserRole] = useState<UserRole>(effectiveInitialRole);
  const [assignedClassId, setAssignedClassId] = useState<string>(
    effectiveInitialAssignedClassId
  );
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>(
    effectiveInitialAssignedClassIds
  );
  const [simulatedTeacherEmail, setSimulatedTeacherEmail] = useState<string | null>(
    initialSavedSession?.simulatedTeacherEmail || null
  );

  // Notificação de Menor Privilégio / Bloqueio Preventivo
  const [securityBlockNotice, setSecurityBlockNotice] = useState<{
    targetScreen: ScreenType;
    requiredRole: string;
    message: string;
  } | null>(null);

  const activeAccountEmail = (simulatedTeacherEmail || currentUserEmail).trim().toLowerCase();
  const activeAuthorizedUser = authorizedUsers.find(
    (u) => u.email.trim().toLowerCase() === activeAccountEmail
  );
  const activeTeacherRoleType = activeAuthorizedUser?.teacherRoleType;
  const isStrictAdmin =
    userRole === 'admin' &&
    isOfficialSchoolAdminEmail(activeAccountEmail) &&
    activeTeacherRoleType !== 'apoio' &&
    activeTeacherRoleType !== 'aee';

  const navigateToScreen = (rawNextScreen: ScreenType) => {
    const targetScreen = rawNextScreen === 'resumo' ? 'home' : rawNextScreen;
    const nextScreen =
      userRole === 'usuario' && targetScreen === 'turmas' ? 'detalhes' : targetScreen;
    if (nextScreen === currentScreen) return;

    // Princípio do Menor Privilégio (PoLP): Telas administrativas restritas exclusivamente ao Admin (nunca PEB I, PEB II ou AEE)
    if (!isStrictAdmin && ADMIN_ONLY_SCREENS.includes(nextScreen)) {
      const roleDesc =
        activeTeacherRoleType === 'aee'
          ? 'Professora de AEE'
          : activeTeacherRoleType === 'apoio'
          ? 'Apoio Pedagógico'
          : userRole === 'usuario'
          ? 'PEB I (Professor Regente)'
          : 'PEB II (Professor Especialista)';
      addSecurityAuditLog({
        userEmail: currentUserEmail,
        userName: currentUserName,
        userRole: userRole,
        eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
        actionTitle: 'Tentativa de Acesso Bloqueada (Menor Privilégio)',
        details: `Servidor com perfil "${roleDesc}" tentou navegar para o módulo restrito "${nextScreen}". Bloqueio preventivo automático conforme política RBAC/LGPD.`,
        targetResource: nextScreen,
        severity: 'security_alert',
      });
      setSecurityBlockNotice({
        targetScreen: nextScreen,
        requiredRole: 'ADMINISTRADOR / GESTÃO ESCOLAR',
        message: `O módulo "${nextScreen.toUpperCase().replace(/_/g, ' ')}" é exclusivo da Administração Escolar. Seu perfil atual é "${roleDesc}".`,
      });
      return;
    }

    setNavDirection(1);
    setDetalhesInitialStatusFilter('all');
    setNavigationHistory((prev) => [...prev, currentScreen]);
    setCurrentScreen(nextScreen);
    window.scrollTo(0, 0);
  };

  const [detalhesInitialStatusFilter, setDetalhesInitialStatusFilter] = useState<
    'all' | 'sem_ficha_pdf'
  >('all');

  const [attendanceWindowConfig, setAttendanceWindowConfig] =
    useState<AttendanceWindowConfig>(() => getStoredAttendanceWindowConfig());
  const [schoolNotices, setSchoolNotices] = useState<SchoolNotice[]>(() =>
    getStoredSchoolNotices()
  );
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);

  // Global keyboard shortcut Ctrl+K or Cmd+K for Spotlight Search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (currentScreen !== 'login') {
          setIsSpotlightOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentScreen]);

  // Probe whether backend Express API is active (or if running as pure static SPA on GitHub Pages)
  useEffect(() => {
    void probeBackendAvailability();
  }, []);

  // Automatically save current screen, selected class, and user session only while genuinely authenticated
  useEffect(() => {
    if (currentScreen === 'login' || !isAuthVerified || !currentUserEmail) return;
    try {
      const payload: PersistedAuthSession = {
        email: currentUserEmail,
        name: currentUserName,
        role: userRole,
        assignedClassId,
        assignedClassIds,
        selectedClassId: selectedClass?.id || initialClasses[0]?.id || 'g04a',
        screen: currentScreen,
        sessionId: activeSessionIdRef.current,
        simulatedTeacherEmail,
      };
      sessionStorage.setItem(ACTIVE_AUTH_SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage write error
    }
  }, [
    isAuthVerified,
    currentScreen,
    currentUserEmail,
    currentUserName,
    userRole,
    assignedClassId,
    assignedClassIds,
    selectedClass,
    simulatedTeacherEmail,
  ]);

  // Padronização Única e Confortável em toda a aplicação (sem alternadores)
  useEffect(() => {
    try {
      document.documentElement.removeAttribute('data-density');
      localStorage.removeItem('emeb_candelario_layout_density_mode');
    } catch {
      // fallback
    }
  }, []);

  const handleUpdateAttendanceWindowConfig = (nextConfig: AttendanceWindowConfig) => {
    setAttendanceWindowConfig(nextConfig);
    saveStoredAttendanceWindowConfig(nextConfig);
    pushAttendanceWindowToServer(nextConfig);
  };

  const handleSaveSchoolNotices = (updatedNotices: SchoolNotice[]) => {
    setSchoolNotices(updatedNotices);
    saveStoredSchoolNotices(updatedNotices);
    pushSchoolNoticesToServer(updatedNotices);
  };

  const handleMarkNoticeRead = (
    noticeIds: string[],
    reader: { userEmail: string; userName: string; userRole?: string }
  ) => {
    const cleanEmail = reader.userEmail.trim().toLowerCase();
    if (!cleanEmail || noticeIds.length === 0) return;
    const nowISO = new Date().toISOString();
    const idSet = new Set(noticeIds);

    setSchoolNotices((prev) => {
      let changed = false;
      const next = prev.map((notice) => {
        if (!idSet.has(notice.id)) return notice;
        const existingReaders = Array.isArray(notice.readBy) ? notice.readBy : [];
        const alreadyRecorded = existingReaders.some(
          (r) => r.userEmail.trim().toLowerCase() === cleanEmail
        );
        if (alreadyRecorded) return notice;
        changed = true;
        return {
          ...notice,
          readBy: [
            {
              userEmail: cleanEmail,
              userName: reader.userName.trim() || cleanEmail,
              userRole: reader.userRole,
              readAtISO: nowISO,
            },
            ...existingReaders,
          ],
        };
      });
      if (!changed) return prev;
      saveStoredSchoolNotices(next);
      pushSchoolNoticesToServer(next);
      return next;
    });
  };

  const [cloudSyncSnapshot, setCloudSyncSnapshot] = useState<SyncStatusSnapshot>({
    status: 'synced',
    pendingCount: 0,
    lastSyncedAtISO: null,
    lastError: null,
    queue: [],
  });

  useEffect(() => {
    const unsubCloud = subscribeToSyncStatus((snap) => {
      setCloudSyncSnapshot(snap);
    });
    return () => unsubCloud();
  }, []);

  // Subscribe to centralized SyncQueueManager
  useEffect(() => {
    const unsubQueue = SyncQueueManager.subscribe((snapshot) => {
      if (snapshot.isProcessing) {
        setInstantSheetSyncStatus('syncing');
      } else if (snapshot.pendingTasksCount === 0 && snapshot.lastCompletedAtISO) {
        setInstantSheetSyncStatus('synced');
      } else if (snapshot.pendingTasksCount > 0) {
        setInstantSheetSyncStatus('idle');
      }
    });
    return () => unsubQueue();
  }, []);

  // Resume persisted queue tasks only after Firebase Auth session is verified
  useEffect(() => {
    if (!isAuthVerified) return;
    if (SyncQueueManager.hasPendingTasks()) {
      void SyncQueueManager.processQueue();
    }
  }, [isAuthVerified]);

  const prevSheetSyncStatusRef = React.useRef(instantSheetSyncStatus);
  useEffect(() => {
    if (prevSheetSyncStatusRef.current !== 'synced' && instantSheetSyncStatus === 'synced') {
      toast.success('Sincronização com a Nuvem Concluída!', {
        description: 'Alterações salvas com segurança no banco de dados da escola.',
        duration: 3500,
      });
    }
    prevSheetSyncStatusRef.current = instantSheetSyncStatus;
  }, [instantSheetSyncStatus]);

  const handleSaveAuthorizedUsers = (updatedUsers: AuthorizedUser[]) => {
    setAuthorizedUsers(updatedUsers);
    saveStoredAuthorizedUsers(updatedUsers);
    pushAuthorizedUsersToServer(updatedUsers).then((merged) => {
      if (merged) setAuthorizedUsers(merged);
    });
    SyncQueueManager.enqueueUsersAccessWrite({
      users: updatedUsers,
      description: 'Atualização de Permissões e E-mails Autorizados',
    });

    // Keep current logged user OR simulated teacher profile in sync whenever their entry is modified in '5. Acessos'
    const targetLookupEmail = (simulatedTeacherEmail || currentUserEmail).trim().toLowerCase();
    const currentMatched = updatedUsers.find(
      (u) => u.email.trim().toLowerCase() === targetLookupEmail
    );
    if (currentMatched) {
      if (!simulatedTeacherEmail) {
        setUserRole(currentMatched.role);
        setCurrentUserName(currentMatched.name);
      }
      if (currentMatched.role === 'usuario') {
        const nextIds =
          currentMatched.assignedClassIds && currentMatched.assignedClassIds.length > 0
            ? currentMatched.assignedClassIds.filter((id) => id !== 'all')
            : currentMatched.assignedClassId !== 'all'
            ? [currentMatched.assignedClassId]
            : [classes[0]?.id || 'g04a'];
        const primaryId = nextIds[0] || classes[0]?.id || 'g04a';
        setAssignedClassIds(nextIds);
        setAssignedClassId(primaryId);
        const targetCls = classes.find((c) => c.id === primaryId);
        if (targetCls) setSelectedClass(targetCls);
      }
    }
  };

  // Refs estáveis para que callbacks de Firestore/Storage/Intervalos leiam o estado atual sem recriar assinaturas nem gerar loops
  const classesRef = useRef<ClassGroup[]>(classes);
  classesRef.current = classes;
  const selectedClassRef = useRef<ClassGroup>(selectedClass);
  selectedClassRef.current = selectedClass;
  const currentScreenRef = useRef<ScreenType>(currentScreen);
  currentScreenRef.current = currentScreen;
  const authorizedUsersRef = useRef<AuthorizedUser[]>(authorizedUsers);
  authorizedUsersRef.current = authorizedUsers;
  const accessSessionLogsRef = useRef<UserAccessSessionLog[]>(accessSessionLogs);
  accessSessionLogsRef.current = accessSessionLogs;
  const userRoleRef = useRef<UserRole>(userRole);
  userRoleRef.current = userRole;
  const assignedClassIdRef = useRef<string>(assignedClassId);
  assignedClassIdRef.current = assignedClassId;
  const assignedClassIdsRef = useRef<string[]>(assignedClassIds);
  assignedClassIdsRef.current = assignedClassIds;

  const skipNextClassesSaveRef = useRef<boolean>(false);
  const isServerSyncInFlightRef = useRef<boolean>(false);
  const lastFocusSyncAtRef = useRef<number>(0);
  const lastMetaSignatureRef = useRef<{
    users?: string;
    window?: string;
    notices?: string;
    logs?: string;
  }>({});

  const applyRemoteClassesSafely = useCallback(
    (incomingClasses: ClassGroup[], hydratePhotos: boolean = true) => {
      if (!Array.isArray(incomingClasses) || incomingClasses.length === 0) return;
      const hydrated = hydratePhotos
        ? attachPhotosFromDiscoveredCache(incomingClasses)
        : incomingClasses;

      if (!haveClassesChanged(classesRef.current, hydrated)) {
        return;
      }

      skipNextClassesSaveRef.current = true;
      saveStoredClasses(hydrated, true);
      setClasses(hydrated);

      const currentSel = selectedClassRef.current;
      const matchedSelected = hydrated.find((c) => c.id === currentSel.id);
      if (matchedSelected && haveClassesChanged([currentSel], [matchedSelected])) {
        setSelectedClass(matchedSelected);
      }
    },
    []
  );

  const applyAuthorizedUsersIfChanged = useCallback(
    (incomingUsers: AuthorizedUser[], persistLocal: boolean = true) => {
      if (!Array.isArray(incomingUsers) || incomingUsers.length === 0) return;
      const sig = incomingUsers
        .map(
          (u) =>
            `${u.id}:${u.email}:${u.role}:${u.teacherRoleType || ''}:${u.active}:${u.accessExpiresAt || ''}:${u.assignedClassId}:${(u.assignedClassIds || []).join(',')}:${u.totalAccessCount || 0}:${u.totalDurationSeconds || 0}`
        )
        .join('|');
      if (lastMetaSignatureRef.current.users === sig) return;
      lastMetaSignatureRef.current.users = sig;
      if (persistLocal) saveStoredAuthorizedUsers(incomingUsers);
      setAuthorizedUsers(incomingUsers);
    },
    []
  );

  // Real-time synchronization of the logged-in teacher's profile whenever authorizedUsers changes (sem depender de classes)
  useEffect(() => {
    if (!isAuthVerified || currentScreenRef.current === 'login' || !currentUserEmail) return;
    const lookupEmail = (simulatedTeacherEmail || currentUserEmail).trim().toLowerCase();
    const matched = authorizedUsers.find(
      (u) => u.email.trim().toLowerCase() === lookupEmail
    );
    if (!matched) return;
    if ((!matched.active || isUserAccessExpired(matched)) && !simulatedTeacherEmail) {
      if (isUserAccessExpired(matched)) {
        setAuthLoginError(
          `Acesso expirado: o prazo de utilização (${formatAccessExpirationDateBR(
            matched.accessExpiresAt
          )}) foi encerrado e seu acesso foi revogado automaticamente.`
        );
      }
      setCurrentScreen('login');
      return;
    }

    const isMainAdminAccount =
      currentUserEmail.trim().toLowerCase().startsWith('emebjfreitas@') &&
      !simulatedTeacherEmail;

    if (!isMainAdminAccount && matched.role !== userRoleRef.current) {
      setUserRole(matched.role);
      if (matched.role === 'usuario') {
        setCurrentScreen('detalhes');
      }
    }

    if (!simulatedTeacherEmail && matched.name && matched.name !== currentUserName) {
      setCurrentUserName(matched.name);
    }

    if (matched.role === 'usuario') {
      const nextIds =
        matched.assignedClassIds && matched.assignedClassIds.length > 0
          ? matched.assignedClassIds.filter((id) => id !== 'all')
          : matched.assignedClassId && matched.assignedClassId !== 'all'
          ? [matched.assignedClassId]
          : [];
      if (nextIds.length > 0) {
        const joinedCurrent = assignedClassIdsRef.current.join(',');
        const joinedNext = nextIds.join(',');
        if (joinedCurrent !== joinedNext || assignedClassIdRef.current !== nextIds[0]) {
          setAssignedClassIds(nextIds);
          setAssignedClassId(nextIds[0]);
          if (!nextIds.includes(selectedClassRef.current.id)) {
            const targetCls = classesRef.current.find((c) => c.id === nextIds[0]);
            if (targetCls) {
              setSelectedClass(targetCls);
            }
          }
        }
      }
    }
  }, [isAuthVerified, authorizedUsers, currentUserEmail, simulatedTeacherEmail, currentUserName]);

  // Revogação automática de contas temporárias expiradas (executa ao carregar e a cada 60s quando logado como Administrador)
  const lastAutoRevokeCheckSigRef = useRef<string>('');
  useEffect(() => {
    if (!isAuthVerified || userRole !== 'admin' || simulatedTeacherEmail) return;

    const runExpirationRevocation = () => {
      const currentList = authorizedUsersRef.current;
      if (!Array.isArray(currentList) || currentList.length === 0) return;

      const { updatedUsers, expiredUsers, changed } = syncExpiredAuthorizedUsers(currentList);
      if (!changed) return;

      const revokeSig = expiredUsers.map((u) => `${u.id}:${u.accessExpiresAt || ''}`).join('|');
      if (lastAutoRevokeCheckSigRef.current === revokeSig) return;
      lastAutoRevokeCheckSigRef.current = revokeSig;

      expiredUsers.forEach((expUser) => {
        addSecurityAuditLog({
          userEmail: currentUserEmail || 'sistema@educacao.jundiai.sp.gov.br',
          userName: 'Revogação Automática por Validade',
          userRole: 'admin',
          eventType: 'ROLE_PERMISSION_CHANGED',
          actionTitle: 'Acesso temporário expirado e revogado',
          details: `O acesso de ${expUser.name} (${expUser.email}) expirou após ${formatAccessExpirationDateBR(
            expUser.accessExpiresAt
          )} e foi desativado automaticamente.`,
          targetResource: expUser.email,
          severity: 'warning',
        });
      });

      setAuthorizedUsers(updatedUsers);
      saveStoredAuthorizedUsers(updatedUsers);
      void pushAuthorizedUsersToServer(updatedUsers);
      SyncQueueManager.enqueueUsersAccessWrite({
        users: updatedUsers,
        description: `Revogação automática de ${expiredUsers.length} acesso(s) temporário(s) expirado(s)`,
      });
    };

    runExpirationRevocation();
    const intervalId = window.setInterval(runExpirationRevocation, 60000);
    return () => window.clearInterval(intervalId);
  }, [isAuthVerified, userRole, simulatedTeacherEmail, authorizedUsers, currentUserEmail]);

  const isAuthVerifiedRef = useRef<boolean>(false);
  useEffect(() => {
    isAuthVerifiedRef.current = isAuthVerified;
  }, [isAuthVerified]);

  // Restore ONLY explicit tab session on reload AND verify cryptographic Firebase Auth state
  useEffect(() => {
    let active = true;
    const clearUnauthenticatedSession = (errorMessage?: string) => {
      try {
        sessionStorage.removeItem(ACTIVE_AUTH_SESSION_STORAGE_KEY);
        localStorage.removeItem(LEGACY_AUTH_SESSION_STORAGE_KEY);
        localStorage.removeItem('emeb_candelario_last_remembered_email_2027');
      } catch {
        // ignore storage cleanup error
      }
      if (!active) return;
      setIsAuthVerified(false);
      setIsAuthChecking(false);
      setSimulatedTeacherEmail(null);
      setCurrentUserEmail('');
      setCurrentUserName('');
      setUserRole('usuario');
      if (errorMessage) setAuthLoginError(errorMessage);
      setCurrentScreen('login');
    };

    const restoreSavedTabSession = async () => {
      const saved = getSavedActiveAuthSession();
      if (!saved || !saved.email) {
        clearUnauthenticatedSession();
        return;
      }

      const authEmail = saved.email.trim().toLowerCase();
      if (!isValidInstitutionalEmail(authEmail)) {
        clearUnauthenticatedSession(
          `Acesso negado: o e-mail "${authEmail}" não pertence ao domínio institucional autorizado (@educacao.jundiai.sp.gov.br).`
        );
        return;
      }

      // Garante que existe uma sessão Firebase real com e-mail verificado idêntico (bloqueia adulteração de sessionStorage)
      try {
        const auth = getAuth();
        if (typeof auth.authStateReady === 'function') {
          await auth.authStateReady();
        }
        const fbUser = auth.currentUser;
        if (
          !fbUser ||
          !fbUser.email ||
          !fbUser.emailVerified ||
          fbUser.email.trim().toLowerCase() !== authEmail
        ) {
          clearUnauthenticatedSession();
          return;
        }
      } catch {
        clearUnauthenticatedSession();
        return;
      }

      let currentPool = [...getStoredAuthorizedUsers(), ...INITIAL_AUTHORIZED_USERS];
      let matched = findAuthorizedUserByEmail(authEmail, currentPool);

      if (!matched) {
        try {
          const cloudState = await fetchStateFromFirestoreCloud();
          if (cloudState?.authorizedUsers && cloudState.authorizedUsers.length > 0) {
            saveStoredAuthorizedUsers(cloudState.authorizedUsers);
            setAuthorizedUsers(cloudState.authorizedUsers);
            currentPool = [...cloudState.authorizedUsers, ...INITIAL_AUTHORIZED_USERS];
            matched = findAuthorizedUserByEmail(authEmail, currentPool);
          }
        } catch {
          // fallback to local list
        }
      }

      if (!active) return;

      if (!matched || !isUserAccessEffectivelyActive(matched)) {
        clearUnauthenticatedSession(
          !matched
            ? `Acesso restrito: a conta "${authEmail}" não está cadastrada como usuária autorizada pela Equipe Administrativa.`
            : isUserAccessExpired(matched)
            ? `Acesso expirado: a conta temporária "${authEmail}" venceu após ${formatAccessExpirationDateBR(
                matched.accessExpiresAt
              )} e foi revogada automaticamente.`
            : `Acesso bloqueado: o usuário "${authEmail}" está desativado no sistema.`
        );
        return;
      }

      const safeRole: UserRole = isOfficialSchoolAdminEmail(matched.email)
        ? 'admin'
        : matched.role === 'admin'
        ? 'usuario'
        : matched.role;

      // Restaura/renova cookie HttpOnly assinado com HMAC no servidor Express
      void establishServerAuthSessionCookie();

      setAuthLoginError(null);
      setCurrentUserEmail(matched.email);
      setCurrentUserName(
        isOfficialSchoolAdminEmail(matched.email) ? 'Equipe Administrativa' : matched.name
      );
      setUserRole(safeRole);
      if (safeRole === 'usuario') {
        const nextIds =
          matched.assignedClassIds && matched.assignedClassIds.length > 0
            ? matched.assignedClassIds.filter((id) => id !== 'all')
            : matched.assignedClassId && matched.assignedClassId !== 'all'
            ? [matched.assignedClassId]
            : [classes[0]?.id || 'g04a'];
        const primaryId = nextIds[0] || classes[0]?.id || 'g04a';
        setAssignedClassIds(nextIds);
        setAssignedClassId(primaryId);
      }

      const localClassesTs = getLocalClassesUpdatedAtMs();
      const hasLocalStudents = classesRef.current.some(
        (c) => Array.isArray(c.students) && c.students.length > 0
      );
      beginBootIntegrityCheck(localClassesTs);

      setIsAuthVerified(true);
      setIsAuthChecking(false);
      setCurrentScreen((prev) => (prev === 'login' ? 'home' : prev));

      void monitorFirestoreIntegrityOnBoot({
        baseClasses: INITIAL_CLASSES,
        localClassesUpdatedAtMs: localClassesTs,
        hasLocalStudents,
      }).then((report) => {
        if (!active) return;
        if (report.status === 'local_newer_preserved') {
          void pushClassesToServer(classesRef.current);
        }
      });
    };

    void restoreSavedTabSession();

    // Monitora revogação/desconexão da conta Firebase Auth em tempo real sem permitir auto-login passivo
    let unsubAuth: (() => void) | undefined;
    try {
      const auth = getAuth();
      unsubAuth = onAuthStateChanged(auth, (fbUser) => {
        if (isAuthVerifiedRef.current && (!fbUser || !fbUser.emailVerified)) {
          void clearServerAuthSessionCookie();
          clearUnauthenticatedSession('Sua sessão Google foi encerrada ou expirou. Faça login novamente.');
        }
      });
    } catch {
      // ignore Firebase Auth init edge cases
    }

    return () => {
      active = false;
      if (unsubAuth) unsubAuth();
    };
  }, []);

  // Sincronização unificada (Firestore onSnapshot + Backend + Focus + Storage) com deduplicação por ref
  useEffect(() => {
    if (!isAuthVerified) return;
    let active = true;

    const syncFromBackendServer = async () => {
      if (!active || !isBackendApiAvailable() || isServerSyncInFlightRef.current) return;
      isServerSyncInFlightRef.current = true;
      try {
        if (getFirestoreIntegrityReport().status === 'checking') {
          await monitorFirestoreIntegrityOnBoot({
            baseClasses: INITIAL_CLASSES,
            localClassesUpdatedAtMs: getLocalClassesUpdatedAtMs(),
            hasLocalStudents: classesRef.current.some(
              (c) => Array.isArray(c.students) && c.students.length > 0
            ),
          });
        }
        if (!active) return;

        const shared = await pullSharedSchoolStateFromServer();
        if (!active || !shared) return;

        if (shared.authorizedUsers && shared.authorizedUsers.length > 0) {
          applyAuthorizedUsersIfChanged(shared.authorizedUsers, true);
        } else {
          const currentLocal = getStoredAuthorizedUsers();
          if (currentLocal.length > 0) {
            pushAuthorizedUsersToServer(currentLocal);
          }
        }

        if (
          shared.classes &&
          shared.classes.length > 0 &&
          shouldAllowRemoteClassesOverwrite({
            remoteUpdatedAtMs: shared.classesUpdatedAtMs,
            fromCache: false,
          })
        ) {
          applyRemoteClassesSafely(shared.classes, true);
        } else if (shared.discoveredDrivePhotos) {
          applyRemoteClassesSafely(classesRef.current, true);
        }

        if (Array.isArray(shared.accessSessionLogs)) {
          const logsSig = `${shared.accessSessionLogs.length}:${shared.accessSessionLogs[0]?.id || ''}:${shared.accessSessionLogs[0]?.lastHeartbeatISO || ''}`;
          if (lastMetaSignatureRef.current.logs !== logsSig) {
            lastMetaSignatureRef.current.logs = logsSig;
            setAccessSessionLogs(shared.accessSessionLogs);
          }
        }

        if (shared.attendanceWindowConfig) {
          const winSig = JSON.stringify(shared.attendanceWindowConfig);
          if (lastMetaSignatureRef.current.window !== winSig) {
            lastMetaSignatureRef.current.window = winSig;
            setAttendanceWindowConfig(shared.attendanceWindowConfig);
          }
        }

        if (Array.isArray(shared.schoolNotices)) {
          const noticesSig = JSON.stringify(shared.schoolNotices);
          if (lastMetaSignatureRef.current.notices !== noticesSig) {
            lastMetaSignatureRef.current.notices = noticesSig;
            setSchoolNotices(shared.schoolNotices);
          }
        }
      } catch (err) {
        console.warn('Sincronização institucional de estado escolar:', err);
      } finally {
        isServerSyncInFlightRef.current = false;
      }
    };

    let pollId: number | null = null;
    if (isBackendApiAvailable()) {
      void syncFromBackendServer();
      pollId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void syncFromBackendServer();
        }
      }, 300000);
    }

    const handleWindowFocus = () => {
      if (!isBackendApiAvailable() || document.visibilityState !== 'visible') return;
      const nowMs = Date.now();
      if (nowMs - lastFocusSyncAtRef.current < 15000) return;
      lastFocusSyncAtRef.current = nowMs;
      void syncFromBackendServer();
    };
    window.addEventListener('focus', handleWindowFocus);

    // Instant <200ms Real-Time Push via Cloud Firestore onSnapshot (com controle de concorrência, epoch integrity e diff via ref)
    const unsubFirestore = subscribeToFirestoreRealtimeState({
      onClassesUpdate: (remoteClasses, remoteUpdatedAtMs) => {
        if (!active || !remoteClasses || remoteClasses.length === 0) return;
        if (!shouldAllowRemoteClassesOverwrite({ remoteUpdatedAtMs, fromCache: false })) {
          return;
        }
        const localClasses = classesRef.current;
        const localUpdatedAtMs = getLocalClassesUpdatedAtMs();
        const merged = mergeClassesWithConcurrencyControl(
          remoteClasses,
          localClasses,
          remoteUpdatedAtMs,
          localUpdatedAtMs
        );
        applyRemoteClassesSafely(merged, true);
      },
      onMetaConfigUpdate: (cfg) => {
        if (!active) return;
        if (Array.isArray(cfg.authorizedUsers) && cfg.authorizedUsers.length > 0) {
          applyAuthorizedUsersIfChanged(cfg.authorizedUsers, true);
        }
        if (cfg.attendanceWindowConfig) {
          const winSig = JSON.stringify(cfg.attendanceWindowConfig);
          if (lastMetaSignatureRef.current.window !== winSig) {
            lastMetaSignatureRef.current.window = winSig;
            setAttendanceWindowConfig(cfg.attendanceWindowConfig);
            saveStoredAttendanceWindowConfig(cfg.attendanceWindowConfig);
          }
        }
        if (Array.isArray(cfg.schoolNotices)) {
          const noticesSig = JSON.stringify(cfg.schoolNotices);
          if (lastMetaSignatureRef.current.notices !== noticesSig) {
            lastMetaSignatureRef.current.notices = noticesSig;
            setSchoolNotices(cfg.schoolNotices);
            saveStoredSchoolNotices(cfg.schoolNotices);
          }
        }
        if (Array.isArray(cfg.accessSessionLogs)) {
          const logsSig = `${cfg.accessSessionLogs.length}:${cfg.accessSessionLogs[0]?.id || ''}:${cfg.accessSessionLogs[0]?.lastHeartbeatISO || ''}`;
          if (lastMetaSignatureRef.current.logs !== logsSig) {
            lastMetaSignatureRef.current.logs = logsSig;
            setAccessSessionLogs(cfg.accessSessionLogs);
            saveStoredAccessSessionLogs(cfg.accessSessionLogs);
          }
        }
      },
    });

    return () => {
      active = false;
      if (pollId !== null) window.clearInterval(pollId);
      window.removeEventListener('focus', handleWindowFocus);
      unsubFirestore();
    };
  }, [isAuthVerified, applyRemoteClassesSafely, applyAuthorizedUsersIfChanged]);

  // Listen to localStorage changes from other browser tabs without ping-pong re-saves
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === 'emeb_candelario_authorized_users_2027_v4' ||
        e.key === 'emeb_candelario_authorized_users_2027_v3' ||
        e.key === 'emeb_candelario_authorized_users_2027_v2'
      ) {
        applyAuthorizedUsersIfChanged(getStoredAuthorizedUsers(), false);
      } else if (
        e.key === 'emeb_candelario_sed_classes_2027_v8' ||
        e.key === 'emeb_candelario_sed_classes_2027_v7' ||
        e.key === 'emeb_candelario_sed_classes_2027_v6' ||
        e.key === 'emeb_candelario_sed_classes_2027_v5' ||
        e.key === 'emeb_candelario_discovered_drive_photos_2027_v1'
      ) {
        const freshClasses = attachPhotosFromDiscoveredCache(getStoredClasses());
        if (haveClassesChanged(classesRef.current, freshClasses)) {
          skipNextClassesSaveRef.current = true;
          setClasses(freshClasses);
          const curSel = selectedClassRef.current;
          const found = freshClasses.find((c) => c.id === curSel.id);
          if (found && haveClassesChanged([curSel], [found])) {
            setSelectedClass(found);
          }
        }
      } else if (e.key === 'emeb_candelario_attendance_window_2027_v1') {
        const nextWin = getStoredAttendanceWindowConfig();
        const sig = JSON.stringify(nextWin);
        if (lastMetaSignatureRef.current.window !== sig) {
          lastMetaSignatureRef.current.window = sig;
          setAttendanceWindowConfig(nextWin);
        }
      } else if (e.key === 'emeb_candelario_school_notices_2027_v1') {
        const nextNotices = getStoredSchoolNotices();
        const sig = JSON.stringify(nextNotices);
        if (lastMetaSignatureRef.current.notices !== sig) {
          lastMetaSignatureRef.current.notices = sig;
          setSchoolNotices(nextNotices);
        }
      } else if (e.key === 'emeb_candelario_access_session_logs_2027_v1') {
        setAccessSessionLogs(getStoredAccessSessionLogs());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [applyAuthorizedUsersIfChanged]);

  // Debounced persist classes to local database only when triggered by authenticated local mutations
  const hasMountedClassesSaveRef = useRef(false);
  useEffect(() => {
    if (!hasMountedClassesSaveRef.current) {
      hasMountedClassesSaveRef.current = true;
      return;
    }
    if (!isAuthVerified) return;
    if (skipNextClassesSaveRef.current) {
      skipNextClassesSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      saveStoredClasses(classes);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [classes, isAuthVerified]);

  // Modal states
  const [isStudentListModalOpen, setIsStudentListModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isReportPrintModalOpen, setIsReportPrintModalOpen] = useState(false);
  const [isAdminPdfsModalOpen, setIsAdminPdfsModalOpen] = useState(false);
  const [photoModalStudent, setPhotoModalStudent] = useState<Student | null>(null);
  const [pdfModalData, setPdfModalData] = useState<{
    student: Student;
    className: string;
  } | null>(null);
  const [gridModalData, setGridModalData] = useState<{
    student: Student;
    classId: string;
    className: string;
    diasLetivosMes: number;
  } | null>(null);

  // Permission helper (respects role AND the attendance launch window: last school day + 2 first school days of next month, or exceptional override)
  const windowStatus = evaluateAttendanceLaunchWindow(attendanceWindowConfig);

  // Memoization seletiva por assinatura estrutural (evita recálculo de permissões a cada clique em faltas)
  const classesStructureKey = useMemo(
    () => classes.map((c) => `${c.id}:${c.name}`).join('|'),
    [classes]
  );

  const prevAllowedIdsRef = useRef<string[]>([]);
  const allowedUsuarioClassIds = useMemo(() => {
    if (userRole !== 'usuario') {
      if (prevAllowedIdsRef.current.length === 0) return prevAllowedIdsRef.current;
      prevAllowedIdsRef.current = [];
      return prevAllowedIdsRef.current;
    }

    const validCandidate =
      (assignedClassId && assignedClassId.toLowerCase() !== 'all' ? assignedClassId : null) ||
      (assignedClassIds.find((id) => id && id.toLowerCase() !== 'all') ?? null);

    let nextIds: string[];
    const currentList = classesRef.current;
    if (validCandidate) {
      const matched = currentList.find(
        (c) =>
          c.id.toLowerCase() === validCandidate.toLowerCase() ||
          c.name.toLowerCase() === validCandidate.toLowerCase()
      );
      nextIds = matched ? [matched.id] : [validCandidate];
    } else {
      nextIds = currentList.length > 0 ? [currentList[0].id] : ['g04a'];
    }

    if (
      prevAllowedIdsRef.current.length === nextIds.length &&
      prevAllowedIdsRef.current.every((id, idx) => id === nextIds[idx])
    ) {
      return prevAllowedIdsRef.current;
    }
    prevAllowedIdsRef.current = nextIds;
    return nextIds;
  }, [userRole, assignedClassId, assignedClassIds, classesStructureKey]);

  const targetUsuarioClass = useMemo(() => {
    if (userRole !== 'usuario') return null;
    const targetId = allowedUsuarioClassIds[0];
    return classes.find((c) => c.id === targetId) || classes[0] || null;
  }, [userRole, allowedUsuarioClassIds, classes]);

  const visibleClasses = useMemo(() => {
    if (userRole === 'admin' || userRole === 'peb2') {
      return classes;
    }
    return targetUsuarioClass ? [targetUsuarioClass] : [];
  }, [userRole, classes, targetUsuarioClass]);

  const canEditClass = (classId: string): boolean => {
    if (!windowStatus.isAllowedToLaunch) return false;
    if (userRole === 'admin') return true;
    if (userRole === 'usuario') return allowedUsuarioClassIds.includes(classId);
    return false; // 'peb2' is strictly view-only
  };

  // Keep selectedClass restricted to their own class when userRole is 'usuario' (PEB 1)
  useEffect(() => {
    if (userRole === 'usuario' && targetUsuarioClass) {
      if (selectedClassRef.current.id !== targetUsuarioClass.id) {
        setSelectedClass(targetUsuarioClass);
      }
    }
  }, [userRole, targetUsuarioClass]);

  // Screen navigation handlers
  const handleSelectClassForDetails = (cls: ClassGroup) => {
    if (userRole === 'usuario' && !allowedUsuarioClassIds.includes(cls.id)) return;
    setSelectedClass(cls);
    setDetalhesInitialStatusFilter('all');
    navigateToScreen('detalhes');
  };

  const handleSelectClassForMonthlyAttendance = (cls: ClassGroup) => {
    if (userRole === 'peb2') {
      setSelectedClass(cls);
      navigateToScreen('detalhes');
      return;
    }
    if (userRole === 'usuario' && !allowedUsuarioClassIds.includes(cls.id)) return;
    setSelectedClass(cls);
    navigateToScreen('frequencia_mensal');
  };

  const triggerDebouncedSheetWrite = (
    updatedClass: ClassGroup,
    nextClasses: ClassGroup[],
    category: Exclude<SyncQueueTaskCategory, 'users_access' | 'gender_dictionary'> = 'attendance',
    studentId?: string,
    description?: string
  ) => {
    setInstantSheetSyncStatus('syncing');
    SyncQueueManager.enqueueClassWrite({
      category,
      updatedClass,
      allClasses: nextClasses,
      studentId,
      description,
    });
  };

  const handleSaveMonthlyAttendance = (updatedClass: ClassGroup) => {
    if (!canEditClass(updatedClass.id)) return;
    const nowMs = Date.now();
    const stampedClass: ClassGroup = {
      ...updatedClass,
      updatedAtMs: nowMs,
    };
    setClasses((prev) => {
      const next = prev.map((c) => (c.id === stampedClass.id ? stampedClass : c));
      skipNextClassesSaveRef.current = true;
      saveStoredClasses(next, 'local_with_timestamp');
      // Agrupamento (coalescing 500ms) por turma via SyncQueueManager
      triggerDebouncedSheetWrite(
        stampedClass,
        next,
        'attendance',
        undefined,
        `Faltas do Mês — ${stampedClass.name}`
      );
      return next;
    });
    setSelectedClass(stampedClass);
  };

  const canManageClassRecords = (classId: string): boolean => {
    if (userRole === 'admin') return true;
    if (userRole === 'usuario') return allowedUsuarioClassIds.includes(classId);
    return false;
  };

  const handleSaveSingleStudent = (classId: string, updatedStudent: Student) => {
    if (!canManageClassRecords(classId)) return;
    const nowMs = Date.now();

    // Normalização semântica canônica: garante sincronia entre campos legados e campos oficiais SED
    const canonicalName = (updatedStudent.estudante || updatedStudent.name || '').trim();
    const canonicalGuardian = (
      updatedStudent.filiacao1 ||
      updatedStudent.guardianName ||
      ''
    ).trim();
    const canonicalPhones = (
      updatedStudent.telefones ||
      updatedStudent.guardianPhone ||
      ''
    ).trim();
    const canonicalStudent: Student = {
      ...updatedStudent,
      updatedAtMs: nowMs,
      name: canonicalName || updatedStudent.name,
      estudante: canonicalName || updatedStudent.estudante,
      filiacao1: canonicalGuardian || updatedStudent.filiacao1,
      guardianName: canonicalGuardian || updatedStudent.guardianName,
      telefones: canonicalPhones || updatedStudent.telefones,
      guardianPhone: canonicalPhones || updatedStudent.guardianPhone,
      numeroChamada: updatedStudent.numeroChamada || updatedStudent.number,
    };

    setClasses((prevClasses) => {
      let targetUpdatedClass: ClassGroup | null = null;
      const next = prevClasses.map((cls) => {
        if (cls.id !== classId) return cls;
        const updatedStudents = cls.students.map((s) =>
          s.id === canonicalStudent.id ? canonicalStudent : s
        );
        const tempCls = { ...cls, students: updatedStudents, updatedAtMs: nowMs };
        const metrics = getClassAttendanceMetrics(tempCls, OFFICIAL_OCTOBER_DAYS);
        const finalCls: ClassGroup = {
          ...tempCls,
          updatedAtMs: nowMs,
          presenceRate: metrics.presenceRate,
          monthlyAbsences: metrics.totalFaltasTurma,
        };
        targetUpdatedClass = finalCls;
        if (selectedClass.id === classId) {
          setSelectedClass(finalCls);
        }
        return finalCls;
      });
      skipNextClassesSaveRef.current = true;
      saveStoredClasses(next, 'local_with_timestamp');
      if (targetUpdatedClass) {
        triggerDebouncedSheetWrite(
          targetUpdatedClass,
          next,
          'student_data',
          canonicalStudent.id,
          `Dados / Busca Ativa — ${canonicalStudent.name}`
        );
      }
      return next;
    });

    setGridModalData((prev) =>
      prev ? { ...prev, student: canonicalStudent } : null
    );
  };

  const handleSaveNotes = (notes: string) => {
    if (!canEditClass(selectedClass.id)) return;
    const updated = { ...selectedClass, pedagogicalNotes: notes, updatedAtMs: Date.now() };
    setClasses((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      saveStoredClasses(next);
      return next;
    });
    setSelectedClass(updated);
  };

  const handleSaveStudentPhoto = (
    studentId: string,
    newPhotoUrl: string,
    driveLink?: string,
    driveFileId?: string,
    isManualLink = true
  ) => {
    const nowMs = Date.now();
    setClasses((prevClasses) => {
      let updatedTargetClass: ClassGroup | null = null;
      let updatedTargetStudent: Student | null = null;
      const next = prevClasses.map((cls) => {
        const hasStudent = cls.students.some((s) => s.id === studentId);
        if (!hasStudent) return cls;
        const updatedStudents = cls.students.map((s) => {
          if (s.id !== studentId) return s;
          const updatedStu: Student = {
            ...s,
            updatedAtMs: nowMs,
            photo: newPhotoUrl,
            photoDriveId: driveFileId !== undefined ? driveFileId : s.photoDriveId,
            photoDriveUrl: driveLink !== undefined ? driveLink : s.photoDriveUrl,
            photoManualLink: isManualLink,
          };
          updatedTargetStudent = updatedStu;
          return updatedStu;
        });
        const updatedCls: ClassGroup = {
          ...cls,
          updatedAtMs: nowMs,
          students: updatedStudents,
        };
        updatedTargetClass = updatedCls;
        return updatedCls;
      });
      skipNextClassesSaveRef.current = true;
      saveStoredClasses(next, 'local_with_timestamp');
      if (updatedTargetStudent) {
        const stu: Student = updatedTargetStudent;
        void persistSingleStudentPhotoToIndexedDb({
          studentId,
          ra: stu.ra,
          name: stu.estudante || stu.name || studentId,
          photoUrl: newPhotoUrl,
          photoDriveUrl: driveLink !== undefined ? driveLink : stu.photoDriveUrl,
          driveFileId: driveFileId !== undefined ? driveFileId : stu.photoDriveId,
          isManualLink,
          updatedAtMs: nowMs,
        });
      }
      if (updatedTargetClass) {
        triggerDebouncedSheetWrite(
          updatedTargetClass,
          next,
          'photo',
          studentId,
          `Foto do Aluno (${studentId})`
        );
      }
      return next;
    });

    setSelectedClass((prev) => ({
      ...prev,
      updatedAtMs: nowMs,
      students: prev.students.map((s) =>
        s.id === studentId
          ? {
              ...s,
              updatedAtMs: nowMs,
              photo: newPhotoUrl,
              photoDriveId: driveFileId !== undefined ? driveFileId : s.photoDriveId,
              photoDriveUrl: driveLink !== undefined ? driveLink : s.photoDriveUrl,
              photoManualLink: isManualLink,
            }
          : s
      ),
    }));
  };

  const handleBack = () => {
    setNavDirection(-1);
    if (navigationHistory.length > 0) {
      const prevScreen = navigationHistory[navigationHistory.length - 1];
      setNavigationHistory((prev) => prev.slice(0, -1));
      setCurrentScreen(prevScreen);
      window.scrollTo(0, 0);
      return;
    }
    if (currentScreen === 'frequencia_mensal') {
      setCurrentScreen(userRole === 'usuario' ? 'detalhes' : 'turmas');
    } else if (currentScreen === 'detalhes') {
      setCurrentScreen(userRole === 'usuario' ? 'home' : 'turmas');
    } else if (currentScreen === 'turmas') {
      setCurrentScreen('home');
    } else {
      setCurrentScreen(userRole === 'usuario' ? 'detalhes' : 'turmas');
    }
    window.scrollTo(0, 0);
  };

  const handleLoginSuccess = (authUser: AuthorizedUser) => {
    const latestRaw =
      authorizedUsers.find(
        (u) => u.email.trim().toLowerCase() === authUser.email.trim().toLowerCase()
      ) || authUser;

    const safeRole: UserRole = isOfficialSchoolAdminEmail(latestRaw.email)
      ? 'admin'
      : latestRaw.role === 'admin'
      ? 'usuario'
      : latestRaw.role;

    const latestFromList: AuthorizedUser = {
      ...latestRaw,
      role: safeRole,
      ...(isOfficialSchoolAdminEmail(latestRaw.email)
        ? { name: 'Equipe Administrativa', teacherRoleType: 'admin' as const }
        : {}),
    };

    const now = new Date();
    const nowFormatted = now.toLocaleString('pt-BR');
    const nowISO = now.toISOString();
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeSessionIdRef.current = sessionId;

    const newLog: UserAccessSessionLog = {
      id: sessionId,
      email: latestFromList.email,
      name: latestFromList.name,
      role: latestFromList.role,
      assignedClassName: latestFromList.assignedClassName,
      loginTimeISO: nowISO,
      lastHeartbeatISO: nowISO,
      durationSeconds: 1,
      lastScreen: 'Minha turma',
      isOnlineNow: true,
    };

    const nextLogs = [newLog, ...getStoredAccessSessionLogs()].slice(0, 500);
    setAccessSessionLogs(nextLogs);
    saveStoredAccessSessionLogs(nextLogs);

    const nextUsers = authorizedUsers.map((u) => {
      if (u.email.trim().toLowerCase() !== latestFromList.email.trim().toLowerCase()) {
        return u;
      }
      return {
        ...u,
        totalAccessCount: (u.totalAccessCount || 0) + 1,
        totalDurationSeconds: (u.totalDurationSeconds || 0) + 1,
        lastLoginAt: nowFormatted,
        lastActiveAt: nowFormatted,
        lastSessionDurationSeconds: 1,
        lastScreenVisited: 'Minha turma',
      };
    });
    setAuthorizedUsers(nextUsers);
    saveStoredAuthorizedUsers(nextUsers);
    pushSessionLogsToServer(nextLogs, nextUsers);
    SyncQueueManager.enqueueUsersAccessWrite({
      users: nextUsers,
      sessionLogs: nextLogs,
      description: `Login registrado — ${latestFromList.email}`,
    });

    setAuthLoginError(null);
    setIsAuthVerified(true);
    setIsAuthChecking(false);
    setSimulatedTeacherEmail(null);
    setCurrentUserEmail(latestFromList.email);
    setCurrentUserName(latestFromList.name);
    setUserRole(latestFromList.role);

    let nextIds: string[] = [];
    let primaryId = selectedClass?.id || classes[0]?.id || 'g04a';

    if (latestFromList.role === 'usuario') {
      nextIds =
        latestFromList.assignedClassIds && latestFromList.assignedClassIds.length > 0
          ? latestFromList.assignedClassIds.filter((id) => id !== 'all')
          : latestFromList.assignedClassId && latestFromList.assignedClassId !== 'all'
          ? [latestFromList.assignedClassId]
          : [classes[0]?.id || 'g04a'];
      primaryId = nextIds[0] || classes[0]?.id || 'g04a';
      setAssignedClassIds(nextIds);
      setAssignedClassId(primaryId);
      const targetClass = classes.find((c) => c.id === primaryId) || classes[0];
      if (targetClass) setSelectedClass(targetClass);
    } else {
      setAssignedClassIds(['all']);
      setAssignedClassId('all');
    }

    try {
      const sessionPayload: PersistedAuthSession = {
        email: latestFromList.email,
        name: latestFromList.name,
        role: latestFromList.role,
        assignedClassId: latestFromList.role === 'usuario' ? primaryId : 'all',
        assignedClassIds: latestFromList.role === 'usuario' ? nextIds : ['all'],
        selectedClassId: primaryId,
        screen: 'home',
        sessionId,
        simulatedTeacherEmail: null,
      };
      sessionStorage.setItem(ACTIVE_AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionPayload));
    } catch {
      // ignore storage write error
    }

    setCurrentScreen('home');
    window.scrollTo(0, 0);
  };

  // Real-time session duration tracker (sem reiniciar ao trocar de tela e sem setState aninhado)
  useEffect(() => {
    if (!isAuthVerified || currentScreenRef.current === 'login' || !currentUserEmail) return;

    const trackedEmail = (simulatedTeacherEmail || currentUserEmail).trim().toLowerCase();

    const screenLabelMap: Record<ScreenType, string> = {
      login: 'Login',
      home: 'Início & Visão Geral',
      turmas: 'Minha turma',
      detalhes: 'Minha turma (Alunos)',
      frequencia_mensal: 'Informar Faltas do Mês',
      faltas_consecutivas: 'Faltas Consecutivas',
      bolsa_familia: 'Bolsa Família',
      planilha: '3. Nuvem, Drive & Fotos',
      dias_letivos: '4. 200 Dias',
      usuarios_acesso: 'Central Admin',
      resumo: 'Resumo Mensal',
      diagnostico_bd: 'Central Admin · Diagnóstico BD',
      importar_deficiencias_htm: 'Central Admin · Upload .HTM',
    };

    const currentLog = accessSessionLogsRef.current.find(
      (l) => l.id === activeSessionIdRef.current
    );

    if (
      !activeSessionIdRef.current ||
      !currentLog ||
      currentLog.email.trim().toLowerCase() !== trackedEmail
    ) {
      const now = new Date();
      const nowISO = now.toISOString();
      const nowFormatted = now.toLocaleString('pt-BR');
      const newSessId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      activeSessionIdRef.current = newSessId;

      const currentScreenLabel = screenLabelMap[currentScreenRef.current] || '1. Turmas';
      const matchedUser = authorizedUsersRef.current.find(
        (u) => u.email.trim().toLowerCase() === trackedEmail
      );

      const newLog: UserAccessSessionLog = {
        id: newSessId,
        email: matchedUser?.email || trackedEmail,
        name: matchedUser?.name || currentUserName,
        role: matchedUser?.role || userRoleRef.current,
        assignedClassName:
          matchedUser?.assignedClassName ||
          (userRoleRef.current === 'admin'
            ? 'Todas as 40 Turmas (Acesso Pleno)'
            : selectedClassRef.current?.name || 'Turma'),
        loginTimeISO: nowISO,
        lastHeartbeatISO: nowISO,
        durationSeconds: 1,
        lastScreen: currentScreenLabel,
        isOnlineNow: true,
      };

      const nextLogs = [newLog, ...getStoredAccessSessionLogs()].slice(0, 500);
      setAccessSessionLogs(nextLogs);
      saveStoredAccessSessionLogs(nextLogs);

      const nextUsers = authorizedUsersRef.current.map((u) => {
        if (u.email.trim().toLowerCase() !== trackedEmail) {
          return u;
        }
        return {
          ...u,
          totalAccessCount: Math.max(1, (u.totalAccessCount || 0) + 1),
          totalDurationSeconds: (u.totalDurationSeconds || 0) + 1,
          lastSessionDurationSeconds: 1,
          lastLoginAt: u.lastLoginAt || nowFormatted,
          lastActiveAt: nowFormatted,
          lastScreenVisited: currentScreenLabel,
        };
      });
      setAuthorizedUsers(nextUsers);
      saveStoredAuthorizedUsers(nextUsers);
      pushSessionLogsToServer(nextLogs, nextUsers);
    }

    let tickCounter = 0;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const sessId = activeSessionIdRef.current;
      if (!sessId) return;
      tickCounter++;

      const now = new Date();
      const nowISO = now.toISOString();
      const nowFormatted = now.toLocaleString('pt-BR');
      const currentScreenLabel = screenLabelMap[currentScreenRef.current] || '1. Turmas';

      const prevLogs = accessSessionLogsRef.current;
      const targetLog = prevLogs.find((l) => l.id === sessId);
      if (!targetLog) return;

      const elapsedSecs = Math.max(
        1,
        Math.round((now.getTime() - new Date(targetLog.loginTimeISO).getTime()) / 1000)
      );
      const deltaSecs = Math.max(0, elapsedSecs - (targetLog.durationSeconds || 0));

      const updatedLogs = prevLogs.map((l) =>
        l.id === sessId
          ? {
              ...l,
              lastHeartbeatISO: nowISO,
              durationSeconds: elapsedSecs,
              lastScreen: currentScreenLabel,
              isOnlineNow: true,
            }
          : l
      );
      setAccessSessionLogs(updatedLogs);
      saveStoredAccessSessionLogs(updatedLogs);

      if (deltaSecs > 0) {
        const updatedUsers = authorizedUsersRef.current.map((u) => {
          if (u.email.trim().toLowerCase() !== targetLog.email.trim().toLowerCase()) {
            return u;
          }
          return {
            ...u,
            totalAccessCount: Math.max(1, u.totalAccessCount || 1),
            totalDurationSeconds: (u.totalDurationSeconds || 0) + deltaSecs,
            lastSessionDurationSeconds: elapsedSecs,
            lastLoginAt: u.lastLoginAt || nowFormatted,
            lastActiveAt: nowFormatted,
            lastScreenVisited: currentScreenLabel,
          };
        });
        saveStoredAuthorizedUsers(updatedUsers);
        // Atualiza React state apenas quando necessário (ou a cada 3 min) para evitar re-renders a cada 15s
        if (tickCounter === 1 || tickCounter % 12 === 0) {
          setAuthorizedUsers(updatedUsers);
        }
        if (tickCounter === 1 || tickCounter % 180 === 0) {
          pushSessionLogsToServer(updatedLogs, updatedUsers);
          SyncQueueManager.enqueueUsersAccessWrite({
            users: updatedUsers,
            sessionLogs: updatedLogs,
            description: 'Heartbeat de Sessão Ativa',
          });
        }
      }

      if (SyncQueueManager.hasPendingTasks()) {
        void SyncQueueManager.processQueue();
      }
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [isAuthVerified, currentUserEmail, simulatedTeacherEmail, currentUserName]);

  const lastActivityAtMsRef = useRef<number>(Date.now());

  const handleLogout = async (reasonOrEvent?: unknown) => {
    const logoutReason = typeof reasonOrEvent === 'string' ? reasonOrEvent : null;
    try {
      sessionStorage.removeItem(ACTIVE_AUTH_SESSION_STORAGE_KEY);
      localStorage.removeItem(LEGACY_AUTH_SESSION_STORAGE_KEY);
      localStorage.removeItem('emeb_candelario_last_remembered_email_2027');
    } catch {
      // ignore
    }
    const sessId = activeSessionIdRef.current;
    if (sessId) {
      const now = new Date();
      const nowISO = now.toISOString();
      const nowFormatted = now.toLocaleString('pt-BR');

      const nextLogs = accessSessionLogs.map((l) => {
        if (l.id !== sessId) return l;
        const finalSecs = Math.max(
          l.durationSeconds,
          Math.round((now.getTime() - new Date(l.loginTimeISO).getTime()) / 1000)
        );
        return {
          ...l,
          lastHeartbeatISO: nowISO,
          logoutTimeISO: nowISO,
          durationSeconds: finalSecs,
          isOnlineNow: false,
        };
      });
      setAccessSessionLogs(nextLogs);
      saveStoredAccessSessionLogs(nextLogs);

      const nextUsers = authorizedUsers.map((u) =>
        u.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase()
          ? { ...u, lastActiveAt: nowFormatted }
          : u
      );
      setAuthorizedUsers(nextUsers);
      saveStoredAuthorizedUsers(nextUsers);
      pushSessionLogsToServer(nextLogs, nextUsers);
      SyncQueueManager.enqueueUsersAccessWrite({
        users: nextUsers,
        sessionLogs: nextLogs,
        description: `Logout registrado — ${currentUserEmail}`,
      });
      void SyncQueueManager.flushNow();
      activeSessionIdRef.current = null;
    }

    await clearServerAuthSessionCookie();
    try {
      await logoutGoogle();
    } catch {
      // ignore sign-out error
    }
    setIsAuthVerified(false);
    setSimulatedTeacherEmail(null);
    setCurrentUserEmail('');
    setCurrentUserName('');
    setUserRole('usuario');
    if (logoutReason) {
      setAuthLoginError(logoutReason);
    }
    setCurrentScreen('login');
    window.scrollTo(0, 0);
  };

  // Encerramento automático por inatividade (60 minutos) para máxima segurança em terminais escolares compartilhados
  useEffect(() => {
    if (!isAuthVerified) return;
    lastActivityAtMsRef.current = Date.now();
    const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
    let lastRecordedEventMs = 0;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastRecordedEventMs >= 10000) {
        lastRecordedEventMs = now;
        lastActivityAtMsRef.current = now;
      }
    };

    const events = ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'scroll'] as const;
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    const timerId = window.setInterval(() => {
      if (Date.now() - lastActivityAtMsRef.current >= INACTIVITY_TIMEOUT_MS) {
        addSecurityAuditLog({
          userEmail: currentUserEmail || 'sessao@educacao.jundiai.sp.gov.br',
          userName: currentUserName || 'Usuário',
          userRole: userRoleRef.current,
          eventType: 'SESSION_TIMEOUT_REVOKED',
          actionTitle: 'Sessão encerrada por inatividade (60 min)',
          details: 'Desconexão preventiva automática por ausência de interação no terminal.',
          severity: 'info',
        });
        void handleLogout('Sua sessão foi encerrada automaticamente após 60 minutos de inatividade por segurança.');
      }
    }, 30000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      window.clearInterval(timerId);
    };
  }, [isAuthVerified, currentUserEmail, currentUserName]);

  const handleSyncWithClasses = () => {
    setClasses((prev) => [...prev]);
  };

  const handleQuickSyncDriveNow = async () => {
    const syncPromise = (async () => {
      const spreadsheetId = await ensureOfficialSpreadsheetId();
      let latestClasses = getStoredClasses();
      if (spreadsheetId) {
        const res = await readClassesFromGoogleSheet(spreadsheetId, latestClasses);
        if (res.rowsRead > 0) {
          latestClasses = res.updatedClasses;
        }
      }
      const photoSync = await syncPhotosFromDriveFolder(latestClasses);
      latestClasses = photoSync.updatedClasses;
      setClasses(latestClasses);
      saveStoredClasses(latestClasses);
      setSelectedClass((prev) => {
        const found = latestClasses.find((c) => c.id === prev.id);
        return found || prev;
      });
      return latestClasses;
    })();

    toast.promise(syncPromise, {
      loading: 'Sincronizando com a Nuvem e Google Drive...',
      success: 'Dados sincronizados com sucesso!',
      error: 'Não foi possível sincronizar no momento. Tente novamente.',
    });

    try {
      await syncPromise;
    } catch (e) {
      console.warn('Erro ao sincronizar Drive rapidamente:', e);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-[100dvh] w-full bg-[linear-gradient(168deg,#001229_0%,#050f1f_50%,#040b16_100%)] flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="w-10 h-10 border-4 border-white/25 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-white/90">
          Verificando sessão institucional...
        </p>
      </div>
    );
  }

  if (!isAuthVerified || currentScreen === 'login') {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-[#050f1f] font-sans">
        <LoginScreen
          authorizedUsers={authorizedUsers}
          schoolNotices={schoolNotices}
          externalError={authLoginError}
          onLoginSuccess={handleLoginSuccess}
        />
        <Toaster
          position="top-right"
          richColors
          closeButton
          gap={10}
          visibleToasts={4}
          offset={{ top: 16, right: 16 }}
          mobileOffset={{ top: 12, left: 12, right: 12 }}
          toastOptions={{
            className: 'sonner-sf-toast',
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[linear-gradient(168deg,#001229_0%,#050f1f_48%,#040b16_100%)] bg-fixed text-[#1d1f1d] flex flex-col font-sans selection:bg-[#0071e3]/20 selection:text-[#0066cc]">
      {/* Top Minimalist Header */}
      <Header
        currentScreen={currentScreen}
        title={
          currentScreen === 'frequencia_mensal'
            ? `${selectedClass.name}`
            : currentScreen === 'detalhes'
            ? `Turma ${selectedClass.name}`
            : currentScreen === 'bolsa_familia'
            ? 'Relatório Nominal • Bolsa Família'
            : currentScreen === 'dias_letivos'
            ? 'Central Admin · Calendário 200 Dias'
            : currentScreen === 'resumo'
            ? 'Fechamento'
            : currentScreen === 'planilha'
            ? 'Nuvem & Drive'
            : currentScreen === 'usuarios_acesso'
            ? 'Central Admin'
            : currentScreen === 'diagnostico_bd'
            ? 'Central Admin · Diagnóstico BD'
            : currentScreen === 'importar_deficiencias_htm'
            ? 'Central Admin · Upload .HTM'
            : undefined
        }
        subtitle={
          currentScreen === 'frequencia_mensal'
            ? `${selectedClass.shift} • ${simulatedTeacherEmail || currentUserEmail}`
            : `${simulatedTeacherEmail || currentUserEmail} • ${
                isStrictAdmin
                  ? 'ADMIN (Acesso Pleno)'
                  : activeTeacherRoleType === 'aee'
                  ? 'AEE (Educação Especial)'
                  : userRole === 'usuario'
                  ? 'PEB I (Sua Turma)'
                  : 'PEB II (Só Visualização)'
              }`
        }
        userEmail={simulatedTeacherEmail || currentUserEmail}
        userName={currentUserName}
        userRole={userRole}
        teacherRoleType={activeTeacherRoleType}
        assignedClassIds={assignedClassIds}
        attendanceWindowConfig={attendanceWindowConfig}
        visibleClasses={visibleClasses}
        allClasses={classes}
        instantSheetSyncStatus={instantSheetSyncStatus}
        onSelectClassById={(classId) => {
          const found = classes.find((c) => c.id === classId);
          if (found) setSelectedClass(found);
        }}
        onRestoreAdminRole={() => {
          setSimulatedTeacherEmail(null);
          setUserRole('admin');
          setCurrentScreen('usuarios_acesso');
          window.scrollTo(0, 0);
        }}
        onBack={handleBack}
        onChangeScreen={(screen) => {
          if (userRole === 'peb2' && screen === 'frequencia_mensal') {
            return;
          }
          if (!isStrictAdmin && ADMIN_ONLY_SCREENS.includes(screen)) {
            navigateToScreen(screen);
            return;
          }
          if (userRole === 'usuario' && screen === 'turmas') {
            navigateToScreen('detalhes');
            return;
          }
          navigateToScreen(screen);
        }}
        onNavigatePlanilha={() => {
          if (isStrictAdmin) navigateToScreen('planilha');
        }}
        onQuickSyncDriveNow={handleQuickSyncDriveNow}
        onOpenSpotlightSearch={() => setIsSpotlightOpen(true)}
        onOpenConfigDaysModal={() => navigateToScreen('dias_letivos')}
        onLogout={handleLogout}
      />

      {/* Main Content Area: Responsive Proportions for Mobile, Tablet, Laptop & Full HD Desktop */}
      <main className="flex-1 w-full min-w-0 max-w-[1600px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-[76px] sm:pt-[84px] pb-28 lg:pb-14">
        {/* Banner de Aviso de Menor Privilégio e Segurança LGPD */}
        {securityBlockNotice && (
          <div className="mb-5 w-full min-w-0 p-4 sm:p-5 rounded-2xl bg-amber-50 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-sm animate-gentle-fade">
            <div className="flex items-start gap-3 min-w-0 flex-1 w-full">
              <span className="material-symbols-outlined text-amber-700 text-[24px] shrink-0 mt-0.5">
                security
              </span>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-bold text-xs sm:text-[13px] uppercase tracking-wide text-amber-900 break-words">
                    Acesso Restrito · Princípio do Menor Privilégio
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-200/80 text-xs font-mono font-bold shrink-0">
                    LGPD Art. 14 / RBAC
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-amber-900 font-medium leading-relaxed break-words">
                  {securityBlockNotice.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSecurityBlockNotice(null)}
              className="w-full sm:w-auto min-h-[42px] text-center whitespace-normal px-4 py-2 rounded-xl bg-amber-200/90 hover:bg-amber-300 text-amber-950 text-xs sm:text-sm font-bold shrink-0 cursor-pointer transition-colors duration-100"
            >
              Compreendi
            </button>
          </div>
        )}

        <MotionConfig reducedMotion="user">
          <AnimatePresence mode="wait" initial={false} custom={navDirection}>
            <motion.div
              key={
                currentScreen === 'resumo'
                  ? 'home'
                  : currentScreen === 'diagnostico_bd' ||
                    currentScreen === 'importar_deficiencias_htm' ||
                    currentScreen === 'dias_letivos'
                  ? 'usuarios_acesso'
                  : currentScreen === 'turmas' && userRole === 'usuario'
                  ? 'detalhes'
                  : currentScreen
              }
              custom={navDirection}
              variants={screenSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full min-w-0"
            >
        {currentScreen === 'home' && (
          <HomeScreen
            userRole={userRole}
            teacherRoleType={activeTeacherRoleType}
            userEmail={simulatedTeacherEmail || currentUserEmail}
            userName={activeAuthorizedUser?.name || currentUserName}
            classes={userRole === 'usuario' ? visibleClasses : classes}
            assignedClassId={assignedClassId}
            assignedClassIds={assignedClassIds}
            attendanceWindowConfig={attendanceWindowConfig}
            schoolNotices={schoolNotices}
            onSaveSchoolNotices={handleSaveSchoolNotices}
            onMarkNoticeRead={handleMarkNoticeRead}
            onNavigateToScreen={(targetScreen) => {
              if (targetScreen === 'turmas' && userRole === 'usuario') {
                const targetCls = classes.find((c) => c.id === assignedClassId) || classes[0];
                if (targetCls) setSelectedClass(targetCls);
                navigateToScreen('detalhes');
              } else {
                navigateToScreen(targetScreen);
              }
            }}
            onSelectClassForDetails={handleSelectClassForDetails}
            onSelectClassForMonthlyAttendance={(cls) => {
              setSelectedClass(cls);
              navigateToScreen('frequencia_mensal');
            }}
            onSelectStudentForConsecutiveScreen={(classId) => {
              const cls = classes.find((c) => c.id === classId);
              if (cls) setSelectedClass(cls);
              navigateToScreen('faltas_consecutivas');
            }}
            onOpenStudentGrid={(student) => {
              const matchedClass =
                classes.find((c) => c.students.some((s) => s.id === student.id)) ||
                selectedClass;
              setGridModalData({
                student,
                classId: matchedClass.id,
                className: matchedClass.name,
                diasLetivosMes: matchedClass.classesHeld || 20,
              });
            }}
            onOpenStudentPdf={(student, className) => {
              setPdfModalData({
                student,
                className: className || selectedClass.name,
              });
            }}
            onNavigateToAcessos={() => {
              navigateToScreen('usuarios_acesso');
            }}
            onOpenClassPendingFichas={(cls) => {
              if (userRole === 'usuario' && !allowedUsuarioClassIds.includes(cls.id)) return;
              setSelectedClass(cls);
              navigateToScreen('detalhes');
              setDetalhesInitialStatusFilter('sem_ficha_pdf');
            }}
          />
        )}

        {(currentScreen === 'usuarios_acesso' ||
          currentScreen === 'diagnostico_bd' ||
          currentScreen === 'importar_deficiencias_htm' ||
          currentScreen === 'dias_letivos') &&
          isStrictAdmin && (
            <UsuariosAcessoScreen
              authorizedUsers={authorizedUsers}
              accessSessionLogs={accessSessionLogs}
              onClearAccessLogs={() => {
                setAccessSessionLogs([]);
                saveStoredAccessSessionLogs([]);
              }}
              classes={classes}
              onUpdateClasses={(updatedClasses) => {
                setClasses(updatedClasses);
                saveStoredClasses(updatedClasses);
                saveClassesToFirestoreCloud(updatedClasses, Date.now()).catch((err) => {
                  console.warn('Erro ao salvar turmas no Firebase Firestore:', err);
                });
                const found = updatedClasses.find((c) => c.id === selectedClass.id);
                if (found) setSelectedClass(found);
              }}
              currentUserEmail={currentUserEmail}
              userRole={userRole}
              teacherRoleType={activeTeacherRoleType}
              syncSnapshot={cloudSyncSnapshot}
              attendanceWindowConfig={attendanceWindowConfig}
              onUpdateAttendanceWindowConfig={handleUpdateAttendanceWindowConfig}
              onSaveAuthorizedUsers={handleSaveAuthorizedUsers}
              onSelectPreviewClassId={(classId) => {
                setAssignedClassId(classId);
                setAssignedClassIds((prev) =>
                  prev.includes(classId) ? prev : [classId]
                );
                const found = classes.find((c) => c.id === classId);
                if (found) setSelectedClass(found);
              }}
              onSimulateTeacherProfile={(teacher) => {
                const nextIds =
                  teacher.role === 'usuario' &&
                  teacher.assignedClassIds &&
                  teacher.assignedClassIds.length > 0
                    ? teacher.assignedClassIds.filter((id) => id !== 'all')
                    : teacher.role === 'usuario' && teacher.assignedClassId !== 'all'
                    ? [teacher.assignedClassId]
                    : [classes[0]?.id || 'g04a'];
                const targetId = nextIds[0] || classes[0]?.id || 'g04a';
                const foundCls = classes.find((c) => c.id === targetId) || classes[0];
                if (foundCls) {
                  setAssignedClassIds(nextIds);
                  setAssignedClassId(foundCls.id);
                  setSelectedClass(foundCls);
                }
                setNavDirection(1);
                setSimulatedTeacherEmail(teacher.email);
                setUserRole(teacher.role);
                setCurrentScreen(teacher.role === 'usuario' ? 'detalhes' : 'turmas');
                window.scrollTo(0, 0);
              }}
              onNavigateScreen={navigateToScreen}
              onOpenClassDetails={(cls) => {
                setSelectedClass(cls);
                navigateToScreen('detalhes');
              }}
              initialSection={
                currentScreen === 'diagnostico_bd'
                  ? 'diagnostico'
                  : currentScreen === 'importar_deficiencias_htm'
                  ? 'uploads'
                  : currentScreen === 'dias_letivos'
                  ? 'calendario'
                  : 'acesso'
              }
              initialUploadTool={
                currentScreen === 'importar_deficiencias_htm' ? 'htm' : 'fotos'
              }
              onBack={handleBack}
            />
          )}

        {currentScreen === 'turmas' && userRole !== 'usuario' && (
          <MinhasTurmasScreen
            classes={classes}
            userRole={userRole}
            userEmail={simulatedTeacherEmail || currentUserEmail}
            userName={currentUserName}
            schoolNotices={schoolNotices}
            onSaveSchoolNotices={handleSaveSchoolNotices}
            assignedClassId={assignedClassId}
            assignedClassIds={assignedClassIds}
            attendanceWindowConfig={attendanceWindowConfig}
            onChangeRole={(role) => {
              if (role === 'admin') {
                setSimulatedTeacherEmail(null);
              }
              setUserRole(role);
              if (role === 'usuario') {
                const target = classes.find((c) => c.id === assignedClassId) || classes[0];
                if (target) setSelectedClass(target);
                setNavDirection(1);
                setCurrentScreen('detalhes');
              }
            }}
            onChangeAssignedClassId={(id) => {
              setAssignedClassId(id);
              setAssignedClassIds([id]);
              const found = classes.find((c) => c.id === id);
              if (found) setSelectedClass(found);
            }}
            onSelectClassForDetails={handleSelectClassForDetails}
            onSelectClassForMonthlyAttendance={handleSelectClassForMonthlyAttendance}
            onOpenClassStudentList={(cls) => {
              setSelectedClass(cls);
              setIsStudentListModalOpen(true);
            }}
            onOpenConfigDaysModal={() => navigateToScreen('dias_letivos')}
            onNavigateToSheet={() => navigateToScreen('planilha')}
            onNavigateToAcessos={() => navigateToScreen('usuarios_acesso')}
            onSelectStudentForConsecutiveScreen={(cls) => {
              setSelectedClass(cls);
              navigateToScreen('faltas_consecutivas');
            }}
            onOpenStudentGrid={(student, classId, className, diasLetivosMes) =>
              setGridModalData({
                student,
                classId,
                className,
                diasLetivosMes,
              })
            }
            onOpenStudentPdf={(student, className) =>
              setPdfModalData({ student, className })
            }
          />
        )}

        {(currentScreen === 'detalhes' || (currentScreen === 'turmas' && userRole === 'usuario')) && (
          <DetalhesTurmaScreen
            classGroup={selectedClass}
            assignedClasses={visibleClasses}
            onSwitchAssignedClass={(cls) => {
              setAssignedClassId(cls.id);
              setSelectedClass(cls);
              window.scrollTo(0, 0);
            }}
            userRole={userRole}
            userEmail={simulatedTeacherEmail || currentUserEmail}
            userName={currentUserName}
            schoolNotices={schoolNotices}
            onSaveSchoolNotices={handleSaveSchoolNotices}
            canLaunchAttendance={canEditClass(selectedClass.id)}
            onGoToMonthlyAttendance={() => {
              navigateToScreen('frequencia_mensal');
            }}
            onGoToMonthlySummary={() => {
              navigateToScreen('resumo');
            }}
            onOpenStudentList={() => setIsStudentListModalOpen(true)}
            onOpenNotes={() => setIsNotesModalOpen(true)}
            onOpenPhotoModal={(student) => setPhotoModalStudent(student)}
            onOpenStudentPdf={(student) =>
              setPdfModalData({ student, className: selectedClass.name })
            }
            onOpenStudentGrid={(student) =>
              setGridModalData({
                student,
                classId: selectedClass.id,
                className: selectedClass.name,
                diasLetivosMes: selectedClass.classesHeld || 20,
              })
            }
            onNavigateToBolsaFamilia={() => {
              if (userRole === 'admin') {
                navigateToScreen('bolsa_familia');
              }
            }}
            onNavigateToConsecutiveAbsences={() => {
              navigateToScreen('faltas_consecutivas');
            }}
            onNavigateToSheet={() => navigateToScreen('planilha')}
            initialStatusFilter={detalhesInitialStatusFilter}
            onBackToClasses={() => {
              setNavDirection(-1);
              setDetalhesInitialStatusFilter('all');
              setCurrentScreen('turmas');
              window.scrollTo(0, 0);
            }}
          />
        )}

        {currentScreen === 'bolsa_familia' && (
          <ListasNominaisScreen
            classes={userRole === 'admin' ? classes : visibleClasses}
            userRole={userRole}
            onOpenStudentPdf={(student, className) =>
              setPdfModalData({ student, className })
            }
            onOpenStudentGrid={(student, classId, className, diasLetivosMes) =>
              setGridModalData({
                student,
                classId,
                className,
                diasLetivosMes,
              })
            }
            onOpenPhotoModal={(student, classNameOrId) => {
              const targetClass =
                classes.find((c) => c.id === classNameOrId) ||
                classes.find((c) => c.name === classNameOrId);
              if (targetClass) setSelectedClass(targetClass);
              setPhotoModalStudent(student);
            }}
            onUpdateStudentField={(classId, updatedStudent) => {
              handleSaveSingleStudent(classId, updatedStudent);
            }}
            onBack={handleBack}
          />
        )}

        {currentScreen === 'frequencia_mensal' && userRole !== 'peb2' && (
          <RegistroFrequenciaMensalScreen
            classGroup={selectedClass}
            userRole={userRole}
            canEdit={canEditClass(selectedClass.id)}
            instantSyncStatus={instantSheetSyncStatus}
            onSaveMonthlyAttendance={handleSaveMonthlyAttendance}
            onOpenPhotoModal={(student) => setPhotoModalStudent(student)}
            onOpenStudentPdf={(student) =>
              setPdfModalData({ student, className: selectedClass.name })
            }
            onOpenStudentGrid={(student) =>
              setGridModalData({
                student,
                classId: selectedClass.id,
                className: selectedClass.name,
                diasLetivosMes: selectedClass.classesHeld || 20,
              })
            }
            onNavigateToSheet={() => navigateToScreen('planilha')}
            onBack={handleBack}
          />
        )}

        {currentScreen === 'faltas_consecutivas' && (
          <FaltasConsecutivasScreen
            classGroup={selectedClass}
            availableClasses={userRole === 'admin' || userRole === 'peb2' ? classes : visibleClasses}
            userRole={userRole}
            teacherRoleType={activeTeacherRoleType}
            userName={activeAuthorizedUser?.name || currentUserName}
            userEmail={simulatedTeacherEmail || currentUserEmail}
            onSelectClass={(cls) => {
              setAssignedClassId(cls.id);
              setSelectedClass(cls);
            }}
            onOpenStudentGrid={(student, targetCls) => {
              const matchedClass =
                targetCls ||
                classes.find((c) => c.students.some((s) => s.id === student.id)) ||
                selectedClass;
              setGridModalData({
                student,
                classId: matchedClass.id,
                className: matchedClass.name,
                diasLetivosMes: matchedClass.classesHeld || 20,
              });
            }}
            onUpdateStudent={(classId, updatedStudent) => {
              handleSaveSingleStudent(classId, updatedStudent);
            }}
            onBack={handleBack}
          />
        )}

        {currentScreen === 'resumo' && (
          <HomeScreen
            userRole={userRole}
            teacherRoleType={activeTeacherRoleType}
            userEmail={simulatedTeacherEmail || currentUserEmail}
            userName={activeAuthorizedUser?.name || currentUserName}
            classes={userRole === 'usuario' ? visibleClasses : classes}
            assignedClassId={assignedClassId}
            assignedClassIds={assignedClassIds}
            attendanceWindowConfig={attendanceWindowConfig}
            schoolNotices={schoolNotices}
            onSaveSchoolNotices={handleSaveSchoolNotices}
            onMarkNoticeRead={handleMarkNoticeRead}
            onNavigateToScreen={(targetScreen) => {
              if (targetScreen === 'turmas' && userRole === 'usuario') {
                const targetCls = classes.find((c) => c.id === assignedClassId) || classes[0];
                if (targetCls) setSelectedClass(targetCls);
                navigateToScreen('detalhes');
              } else {
                navigateToScreen(targetScreen);
              }
            }}
            onSelectClassForDetails={handleSelectClassForDetails}
            onSelectClassForMonthlyAttendance={(cls) => {
              setSelectedClass(cls);
              navigateToScreen('frequencia_mensal');
            }}
            onSelectStudentForConsecutiveScreen={(classId) => {
              const cls = classes.find((c) => c.id === classId);
              if (cls) setSelectedClass(cls);
              navigateToScreen('faltas_consecutivas');
            }}
            onOpenStudentGrid={(student) => {
              const matchedClass =
                classes.find((c) => c.students.some((s) => s.id === student.id)) ||
                selectedClass;
              setGridModalData({
                student,
                classId: matchedClass.id,
                className: matchedClass.name,
                diasLetivosMes: matchedClass.classesHeld || 20,
              });
            }}
          />
        )}

        {currentScreen === 'planilha' && isStrictAdmin && (
          <div className="w-full min-w-0 break-words max-w-xl mx-auto my-6 p-8 bg-white rounded-3xl shadow-lg text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-xs shrink-0">
              <span className="material-symbols-outlined text-[34px]">verified</span>
            </div>
            <h2 className="text-xl font-bold text-slate-950 break-words">Base Oficial SED 100% Integrada</h2>
            <p className="text-sm text-slate-600 leading-relaxed break-words">
              O portal Lista Piloto Candelário 2027 opera diretamente na base institucional da escola, com turmas e estudantes carregados com segurança máxima.
            </p>
            <button
              type="button"
              onClick={() => navigateToScreen('home')}
              className="w-full sm:w-auto min-h-[46px] py-2.5 px-6 bg-slate-950 hover:bg-black text-white rounded-2xl text-sm font-bold text-center whitespace-normal cursor-pointer transition-colors shadow-xs"
            >
              Ir para Painel de Turmas
            </button>
          </div>
        )}
            </motion.div>
          </AnimatePresence>
        </MotionConfig>
      </main>

      {/* Fixed Bottom Navigation - Interactive for Senior & Lay Educators */}
      <BottomNav
        currentScreen={currentScreen}
        userRole={userRole}
        teacherRoleType={activeTeacherRoleType}
        selectedClassName={selectedClass?.name}
        onLogout={handleLogout}
        onChangeScreen={(screen) => {
          if (userRole === 'peb2' && screen === 'frequencia_mensal') {
            return;
          }
          if (!isStrictAdmin && ADMIN_ONLY_SCREENS.includes(screen)) {
            navigateToScreen(screen);
            return;
          }
          if (userRole === 'usuario' && screen === 'turmas') {
            navigateToScreen('detalhes');
            return;
          }
          navigateToScreen(screen);
        }}
      />

      {/* Modals */}
      <AlunosModal
        isOpen={isStudentListModalOpen}
        onClose={() => setIsStudentListModalOpen(false)}
        className={selectedClass.name}
        students={selectedClass.students}
        onOpenPhotoModal={(student) => setPhotoModalStudent(student)}
        onOpenStudentPdf={(student) =>
          setPdfModalData({ student, className: selectedClass.name })
        }
        onOpenStudentGrid={(student) =>
          setGridModalData({
            student,
            classId: selectedClass.id,
            className: selectedClass.name,
            diasLetivosMes: selectedClass.classesHeld || 20,
          })
        }
      />

      <RelatorioImpressaoModal
        isOpen={isReportPrintModalOpen}
        onClose={() => setIsReportPrintModalOpen(false)}
        classGroup={selectedClass}
      />

      <AnotacoesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        classGroup={selectedClass}
        onSaveNotes={handleSaveNotes}
      />

      {photoModalStudent && (
        <UploadFotoModal
          isOpen={photoModalStudent !== null}
          onClose={() => setPhotoModalStudent(null)}
          student={photoModalStudent}
          className={selectedClass.name}
          classStudents={selectedClass.students}
          onSelectStudent={(st) => setPhotoModalStudent(st)}
          onSavePhoto={handleSaveStudentPhoto}
          onSyncDrivePhotos={async () => {
            const photoSync = await syncPhotosFromDriveFolder(getStoredClasses());
            if (photoSync.matchedPhotosCount > 0) {
              setClasses(photoSync.updatedClasses);
              saveStoredClasses(photoSync.updatedClasses);
            }
          }}
        />
      )}

      {/* Grade de Dados Interativa de Cada Criança (Com Navegação Anterior / Próximo) */}
      <GradeDadosCriancaModal
        isOpen={gridModalData !== null}
        onClose={() => setGridModalData(null)}
        student={gridModalData?.student || null}
        classStudents={
          gridModalData
            ? classes.find((c) => c.id === gridModalData.classId)?.students ||
              selectedClass.students
            : selectedClass.students
        }
        onSelectStudent={(nextStudent) => {
          if (gridModalData) {
            setGridModalData({
              ...gridModalData,
              student: nextStudent,
            });
          }
        }}
        className={gridModalData?.className || selectedClass.name}
        diasLetivosMes={gridModalData?.diasLetivosMes || 20}
        userRole={userRole}
        canEdit={gridModalData ? canEditClass(gridModalData.classId) : false}
        onSaveStudent={(updatedStudent) => {
          if (gridModalData) {
            handleSaveSingleStudent(gridModalData.classId, updatedStudent);
          }
        }}
        onOpenPhotoModal={(student) => {
          setGridModalData(null);
          setPhotoModalStudent(student);
        }}
        onOpenStudentPdf={(student) => {
          const clsName = gridModalData?.className || selectedClass.name;
          setPdfModalData({ student, className: clsName });
        }}
        onNavigateToConsecutiveAbsences={() => {
          setGridModalData(null);
          navigateToScreen('faltas_consecutivas');
        }}
      />

      {/* Busca Global Instantânea (Spotlight Command Bar · Ctrl+K / ⌘K) */}
      <SpotlightCommandModal
        isOpen={isSpotlightOpen}
        onClose={() => setIsSpotlightOpen(false)}
        classes={userRole === 'usuario' ? visibleClasses : classes}
        userRole={userRole}
        onSelectClass={(cls) => {
          setAssignedClassId(cls.id);
          setSelectedClass(cls);
          navigateToScreen('detalhes');
        }}
        onOpenStudentGrid={(student, classId, className, diasLetivosMes) => {
          const foundCls = classes.find((c) => c.id === classId);
          if (foundCls) setSelectedClass(foundCls);
          setGridModalData({
            student,
            classId,
            className,
            diasLetivosMes,
          });
        }}
        onOpenStudentPdf={(student, className) => {
          setPdfModalData({ student, className });
        }}
        onNavigateToScreen={(screen) => {
          navigateToScreen(screen);
        }}
      />

      {/* Visualizador no App dos Documentos PDF Nominais */}
      <VisualizarPdfNominalModal
        isOpen={pdfModalData !== null}
        onClose={() => setPdfModalData(null)}
        student={pdfModalData?.student || null}
        className={pdfModalData?.className || selectedClass.name}
        userRole={userRole}
        allClasses={classes}
        onOpenAdminPdfsModal={() => setIsAdminPdfsModalOpen(true)}
        onUpdateAllClasses={(updated) => {
          setClasses(updated);
          saveStoredClasses(updated);
          const found = updated.find((c) => c.id === selectedClass.id);
          if (found) setSelectedClass(found);
          setPdfModalData((prev) => {
            if (!prev) return null;
            for (const c of updated) {
              const st = c.students.find((s) => s.id === prev.student.id);
              if (st) return { ...prev, student: st };
            }
            return prev;
          });
        }}
        onSaveStudentPdfLink={(studentId, pdfId, pdfUrl, subfolder, isManualLink = true) => {
          const nowMs = Date.now();
          setClasses((prevClasses) => {
            let updatedCls: ClassGroup | null = null;
            const next = prevClasses.map((cls) => {
              const hasStudent = cls.students.some((s) => s.id === studentId);
              if (!hasStudent) return cls;
              const nextCls: ClassGroup = {
                ...cls,
                updatedAtMs: nowMs,
                students: cls.students.map((s) =>
                  s.id === studentId
                    ? {
                        ...s,
                        updatedAtMs: nowMs,
                        fichaPdfDriveId: pdfId,
                        fichaPdfDriveUrl: pdfUrl,
                        fichaPdfSubfolder: subfolder,
                        fichaPdfManualLink: isManualLink,
                      }
                    : s
                ),
              };
              updatedCls = nextCls;
              return nextCls;
            });
            skipNextClassesSaveRef.current = true;
            saveStoredClasses(next, 'local_with_timestamp');
            if (updatedCls) {
              triggerDebouncedSheetWrite(
                updatedCls,
                next,
                'pdf',
                studentId,
                `Ficha Informativa do Estudante (${studentId})`
              );
            }
            return next;
          });
          setSelectedClass((prev) => ({
            ...prev,
            updatedAtMs: nowMs,
            students: prev.students.map((s) =>
              s.id === studentId
                ? {
                    ...s,
                    updatedAtMs: nowMs,
                    fichaPdfDriveId: pdfId,
                    fichaPdfDriveUrl: pdfUrl,
                    fichaPdfSubfolder: subfolder,
                    fichaPdfManualLink: isManualLink,
                  }
                : s
            ),
          }));
          setPdfModalData((prev) =>
            prev && prev.student.id === studentId
              ? {
                  ...prev,
                  student: {
                    ...prev.student,
                    updatedAtMs: nowMs,
                    fichaPdfDriveId: pdfId,
                    fichaPdfDriveUrl: pdfUrl,
                    fichaPdfSubfolder: subfolder,
                    fichaPdfManualLink: isManualLink,
                  },
                }
              : prev
          );
        }}
      />

      {/* Modal Admin de Arraste & Solte em Lote de Fichas PDF dos Alunos (Acesso contextual do visualizador) */}
      <AdminArrastePdfsModal
        isOpen={isAdminPdfsModalOpen}
        onClose={() => setIsAdminPdfsModalOpen(false)}
        classes={classes}
        onBatchPdfsSaved={(updatedClasses) => {
          setClasses(updatedClasses);
          saveStoredClasses(updatedClasses);
          const found = updatedClasses.find((c) => c.id === selectedClass.id);
          if (found) setSelectedClass(found);
          else if (updatedClasses.length > 0) setSelectedClass(updatedClasses[0]);
        }}
      />

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* Global Notifications with Sonner (Open-source, light & accessible) */}
      <Toaster
        position="top-right"
        richColors
        closeButton
        gap={10}
        visibleToasts={4}
        offset={{ top: 16, right: 16 }}
        mobileOffset={{ top: 12, left: 12, right: 12 }}
        toastOptions={{
          className: 'sonner-sf-toast',
        }}
      />
    </div>
  );
}
