import React, { useState, useEffect } from 'react';
import {
  ScreenType,
  ClassGroup,
  Student,
  UserRole,
  AuthorizedUser,
  AttendanceWindowConfig,
  UserAccessSessionLog,
} from './types';
import {
  getStoredClasses,
  saveStoredClasses,
  getStoredAuthorizedUsers,
  saveStoredAuthorizedUsers,
  getStoredAttendanceWindowConfig,
  saveStoredAttendanceWindowConfig,
  evaluateAttendanceLaunchWindow,
  getStoredAccessSessionLogs,
  saveStoredAccessSessionLogs,
  pushAuthorizedUsersToServer,
  pushSessionLogsToServer,
  pushAttendanceWindowToServer,
  pullSharedSchoolStateFromServer,
} from './services/db';
import { OFFICIAL_OCTOBER_DAYS } from './data/mockData';
import { getClassAttendanceMetrics } from './utils/attendanceRules';
import {
  getAccessToken,
  getSavedSpreadsheetInfo,
  ensureOfficialSpreadsheetId,
  readClassesFromGoogleSheet,
  readAuthorizedUsersFromGoogleSheet,
  readSessionLogsFromGoogleSheet,
  syncPhotosFromDriveFolder,
  syncNominalPdfsFromDriveSubfolders,
  writeAttendanceOnlyToGoogleSheet,
  syncAuthorizedUsersToGoogleSheet,
  logoutGoogle,
} from './services/googleSheetsApi';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { LoginScreen } from './components/LoginScreen';
import { MinhasTurmasScreen } from './components/MinhasTurmasScreen';
import { DetalhesTurmaScreen } from './components/DetalhesTurmaScreen';
import { RegistroFrequenciaMensalScreen } from './components/RegistroFrequenciaMensalScreen';
import { FaltasConsecutivasScreen } from './components/FaltasConsecutivasScreen';
import { DiasLetivosScreen } from './components/DiasLetivosScreen';
import { ResumoMensalScreen } from './components/ResumoMensalScreen';
import { PlanilhaGoogleScreen } from './components/PlanilhaGoogleScreen';
import { UsuariosAcessoScreen } from './components/UsuariosAcessoScreen';
import { ListasNominaisScreen } from './components/ListasNominaisScreen';
import { NovaTurmaModal } from './components/NovaTurmaModal';
import { AlunosModal } from './components/AlunosModal';
import { RelatorioImpressaoModal } from './components/RelatorioImpressaoModal';
import { AnotacoesModal } from './components/AnotacoesModal';
import { UploadFotoModal } from './components/UploadFotoModal';
import { GradeDadosCriancaModal } from './components/GradeDadosCriancaModal';
import { VisualizarPdfNominalModal } from './components/VisualizarPdfNominalModal';
import { ConfigurarDiasLetivosTurmasModal } from './components/ConfigurarDiasLetivosTurmasModal';
import { SpotlightCommandModal } from './components/SpotlightCommandModal';

const ACTIVE_AUTH_SESSION_STORAGE_KEY = 'emeb_candelario_active_session_2027_v1';

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
    const raw = localStorage.getItem(ACTIVE_AUTH_SESSION_STORAGE_KEY);
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

  const effectiveInitialRole: UserRole =
    matchedInitialUser?.role || initialSavedSession?.role || 'admin';
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

  const [currentScreen, setCurrentScreen] = useState<ScreenType>(() => {
    if (!initialSavedSession || (matchedInitialUser && !matchedInitialUser.active)) {
      return 'login';
    }
    const savedScreen = initialSavedSession.screen;
    if (effectiveInitialRole === 'usuario') {
      return savedScreen === 'frequencia_mensal' ||
        savedScreen === 'faltas_consecutivas' ||
        savedScreen === 'resumo'
        ? savedScreen
        : 'detalhes';
    }
    if (effectiveInitialRole === 'peb2') {
      if (
        savedScreen === 'planilha' ||
        savedScreen === 'dias_letivos' ||
        savedScreen === 'usuarios_acesso' ||
        savedScreen === 'login'
      ) {
        return 'turmas';
      }
      return savedScreen || 'turmas';
    }
    return savedScreen && savedScreen !== 'login' ? savedScreen : 'turmas';
  });

  const [classes, setClasses] = useState<ClassGroup[]>(() => initialClasses);
  const [selectedClass, setSelectedClass] = useState<ClassGroup>(() => {
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
  const [instantSheetSyncStatus, setInstantSheetSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const sheetWriteTimerRef = React.useRef<number | null>(null);

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
    initialSavedSession?.email || 'emebjfreitas@jundiai.sp.gov.br'
  );
  const [currentUserName, setCurrentUserName] = useState<string>(
    matchedInitialUser?.name ||
      initialSavedSession?.name ||
      'EMEB Professor Joaquim Candelário de Freitas (Direção / Admin)'
  );
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
  const [attendanceWindowConfig, setAttendanceWindowConfig] =
    useState<AttendanceWindowConfig>(() => getStoredAttendanceWindowConfig());
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

  // Automatically save current screen, selected class, and user session while logged in so page refresh returns to the exact coherent page
  useEffect(() => {
    if (currentScreen === 'login') return;
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
      localStorage.setItem(ACTIVE_AUTH_SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage write error
    }
  }, [
    currentScreen,
    currentUserEmail,
    currentUserName,
    userRole,
    assignedClassId,
    assignedClassIds,
    selectedClass,
    simulatedTeacherEmail,
  ]);

  const handleUpdateAttendanceWindowConfig = (nextConfig: AttendanceWindowConfig) => {
    setAttendanceWindowConfig(nextConfig);
    saveStoredAttendanceWindowConfig(nextConfig);
    pushAttendanceWindowToServer(nextConfig);
  };

  const handleSaveAuthorizedUsers = (updatedUsers: AuthorizedUser[]) => {
    setAuthorizedUsers(updatedUsers);
    saveStoredAuthorizedUsers(updatedUsers);
    pushAuthorizedUsersToServer(updatedUsers).then((merged) => {
      if (merged) setAuthorizedUsers(merged);
    });
    syncAuthorizedUsersToGoogleSheet(updatedUsers);

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

  // Real-time synchronization of the logged-in teacher's profile whenever authorizedUsers changes (including cross-tab storage events)
  useEffect(() => {
    if (currentScreen === 'login') return;
    const lookupEmail = (simulatedTeacherEmail || currentUserEmail).trim().toLowerCase();
    const matched = authorizedUsers.find(
      (u) => u.email.trim().toLowerCase() === lookupEmail
    );
    if (!matched) return;
    if (!matched.active && !simulatedTeacherEmail) {
      setCurrentScreen('login');
      return;
    }

    const isMainAdminAccount =
      currentUserEmail.trim().toLowerCase().startsWith('emebjfreitas@') &&
      !simulatedTeacherEmail;

    if (!isMainAdminAccount && matched.role !== userRole) {
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
        const joinedCurrent = assignedClassIds.join(',');
        const joinedNext = nextIds.join(',');
        if (joinedCurrent !== joinedNext || assignedClassId !== nextIds[0]) {
          setAssignedClassIds(nextIds);
          setAssignedClassId(nextIds[0]);
          if (!nextIds.includes(selectedClass.id)) {
            const targetCls = classes.find((c) => c.id === nextIds[0]);
            if (targetCls) {
              setSelectedClass(targetCls);
            }
          }
        }
      }
    }
  }, [authorizedUsers, currentUserEmail, simulatedTeacherEmail, classes]);

  // Real-time Cross-Browser & Cross-Device Synchronization via Backend API (/api/school-state) every 1.8 seconds!
  // Synchronizes Classes, Attendance, Photos, Scanned PDF links, Cloud Folder/Sheet Links, Users, and Launch Window instantaneously.
  useEffect(() => {
    let active = true;

    const syncFromBackendServer = async () => {
      const shared = await pullSharedSchoolStateFromServer();
      if (!active || !shared) return;

      if (shared.authorizedUsers && shared.authorizedUsers.length > 0) {
        setAuthorizedUsers(shared.authorizedUsers);
      } else {
        const currentLocal = getStoredAuthorizedUsers();
        if (currentLocal.length > 0) {
          pushAuthorizedUsersToServer(currentLocal);
        }
      }

      if (shared.classes && shared.classes.length > 0) {
        setClasses(shared.classes);
        setSelectedClass((prev) => {
          const found = shared.classes?.find((c) => c.id === prev.id);
          return found || prev;
        });
      }

      if (shared.accessSessionLogs && shared.accessSessionLogs.length > 0) {
        setAccessSessionLogs(shared.accessSessionLogs);
      }

      if (shared.attendanceWindowConfig) {
        setAttendanceWindowConfig(shared.attendanceWindowConfig);
      }
    };

    syncFromBackendServer();
    const pollId = window.setInterval(syncFromBackendServer, 1200);
    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, []);

  // Listen to localStorage changes from other browser tabs so when any tab updates classes, users, or links, all tabs update in 0ms!
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === 'emeb_candelario_authorized_users_2027_v3' ||
        e.key === 'emeb_candelario_authorized_users_2027_v2'
      ) {
        const freshUsers = getStoredAuthorizedUsers();
        setAuthorizedUsers(freshUsers);
      } else if (
        e.key === 'emeb_candelario_sed_classes_2027_v6' ||
        e.key === 'emeb_candelario_sed_classes_2027_v5'
      ) {
        const freshClasses = getStoredClasses();
        setClasses(freshClasses);
        setSelectedClass((prev) => {
          const found = freshClasses.find((c) => c.id === prev.id);
          return found || prev;
        });
      } else if (e.key === 'emeb_candelario_attendance_window_2027_v1') {
        setAttendanceWindowConfig(getStoredAttendanceWindowConfig());
      } else if (e.key === 'emeb_candelario_access_session_logs_2027_v1') {
        setAccessSessionLogs(getStoredAccessSessionLogs());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Debounced persist classes to local database & server for instant UI responsiveness (0ms lag on + / - clicks)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveStoredClasses(classes);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [classes]);

  // Automatic & Super-Fluid Pull from Master Google Sheet (student edits, 200 days) + Drive Folders (photos + scanned PDFs)
  useEffect(() => {
    let isMounted = true;
    let isPulling = false;

    const pullMasterDataFromGoogle = async () => {
      if (isPulling) return;
      const token = await getAccessToken();
      if (!token) return;

      isPulling = true;
      try {
        const spreadsheetId = await ensureOfficialSpreadsheetId();
        let latestClasses = getStoredClasses();
        let didMutateClasses = false;

        if (spreadsheetId) {
          const result = await readClassesFromGoogleSheet(
            spreadsheetId,
            latestClasses
          );
          if (result.rowsRead > 0) {
            latestClasses = result.updatedClasses;
            didMutateClasses = true;
          }
          // Pull latest authorizedUsers (roles, assigned classes, access counts, durations) from Google Sheet
          const sheetUsers = await readAuthorizedUsersFromGoogleSheet(
            getStoredAuthorizedUsers(),
            latestClasses
          );
          if (isMounted && sheetUsers && sheetUsers.length > 0) {
            const currentLocal = getStoredAuthorizedUsers();
            const localByEmail = new Map(
              currentLocal.map((u) => [u.email.trim().toLowerCase(), u])
            );
            const mergedWithLocal = sheetUsers.map((su) => {
              const loc = localByEmail.get(su.email.trim().toLowerCase());
              if (loc && (loc.updatedAtMs || 0) > 0) {
                return {
                  ...loc,
                  totalAccessCount: Math.max(loc.totalAccessCount || 0, su.totalAccessCount || 0),
                  totalDurationSeconds: Math.max(
                    loc.totalDurationSeconds || 0,
                    su.totalDurationSeconds || 0
                  ),
                };
              }
              return su;
            });
            setAuthorizedUsers(mergedWithLocal);
            saveStoredAuthorizedUsers(mergedWithLocal);
          }
          const sheetLogs = await readSessionLogsFromGoogleSheet();
          if (isMounted && sheetLogs && sheetLogs.length > 0) {
            const localLogs = getStoredAccessSessionLogs();
            const logMap = new Map<string, UserAccessSessionLog>();
            sheetLogs.forEach((l) => {
              if (l && l.id) logMap.set(l.id, l);
            });
            localLogs.forEach((l) => {
              if (l && l.id) {
                const prev = logMap.get(l.id);
                if (!prev || (l.durationSeconds || 0) >= (prev.durationSeconds || 0)) {
                  logMap.set(l.id, l);
                }
              }
            });
            const combinedLogs = Array.from(logMap.values()).slice(0, 500);
            setAccessSessionLogs(combinedLogs);
            saveStoredAccessSessionLogs(combinedLogs);
          }
        } else {
          // Even without a spreadsheet yet, sync photos + nominal scanned PDFs from Drive folders in parallel!
          const photoSync = await syncPhotosFromDriveFolder(latestClasses);
          const pdfSync = await syncNominalPdfsFromDriveSubfolders(
            photoSync.updatedClasses
          );
          if (photoSync.matchedPhotosCount > 0 || pdfSync.matchedPdfsCount > 0) {
            latestClasses = pdfSync.updatedClasses;
            didMutateClasses = true;
          }
        }

        if (isMounted && didMutateClasses) {
          setClasses(latestClasses);
          saveStoredClasses(latestClasses);
          setSelectedClass((prev) => {
            const found = latestClasses.find((c) => c.id === prev.id);
            return found || prev;
          });
        }
      } catch (err) {
        console.warn('Auto-sync em segundo plano:', err);
      } finally {
        isPulling = false;
      }
    };

    // Run immediately on startup and whenever window regains focus or visibility
    pullMasterDataFromGoogle();

    const handleWindowFocus = () => {
      pullMasterDataFromGoogle();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pullMasterDataFromGoogle();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(pullMasterDataFromGoogle, 6500);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [currentScreen, currentUserEmail]);

  // Keep selectedClass restricted when userRole is 'usuario'
  useEffect(() => {
    if (userRole === 'usuario') {
      const allowedIds =
        assignedClassIds.length > 0 ? assignedClassIds : [assignedClassId];
      if (!allowedIds.includes(selectedClass.id)) {
        const target =
          classes.find((c) => c.id === allowedIds[0]) ||
          classes.find((c) => c.id === assignedClassId);
        if (target) {
          setSelectedClass(target);
        }
      }
    }
  }, [userRole, assignedClassId, assignedClassIds, classes]);

  // Modal states
  const [isNewClassModalOpen, setIsNewClassModalOpen] = useState(false);
  const [isConfigDaysModalOpen, setIsConfigDaysModalOpen] = useState(false);
  const [isStudentListModalOpen, setIsStudentListModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isReportPrintModalOpen, setIsReportPrintModalOpen] = useState(false);
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
  const allowedUsuarioClassIds =
    assignedClassIds.length > 0 ? assignedClassIds : [assignedClassId];

  const canEditClass = (classId: string): boolean => {
    if (!windowStatus.isAllowedToLaunch) return false;
    if (userRole === 'admin') return true;
    if (userRole === 'usuario') return allowedUsuarioClassIds.includes(classId);
    return false; // 'peb2' is strictly view-only
  };

  const visibleClasses =
    userRole === 'usuario'
      ? classes.filter((c) => allowedUsuarioClassIds.includes(c.id))
      : classes;

  // Screen navigation handlers
  const handleSelectClassForDetails = (cls: ClassGroup) => {
    if (userRole === 'usuario' && !allowedUsuarioClassIds.includes(cls.id)) return;
    setSelectedClass(cls);
    setCurrentScreen('detalhes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectClassForMonthlyAttendance = (cls: ClassGroup) => {
    if (userRole === 'peb2') {
      setSelectedClass(cls);
      setCurrentScreen('detalhes');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (userRole === 'usuario' && !allowedUsuarioClassIds.includes(cls.id)) return;
    setSelectedClass(cls);
    setCurrentScreen('frequencia_mensal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const triggerDebouncedSheetWrite = (updatedClass: ClassGroup, nextClasses: ClassGroup[]) => {
    setInstantSheetSyncStatus('syncing');
    if (sheetWriteTimerRef.current) {
      window.clearTimeout(sheetWriteTimerRef.current);
    }
    sheetWriteTimerRef.current = window.setTimeout(() => {
      writeAttendanceOnlyToGoogleSheet(updatedClass, nextClasses)
        .then(() => {
          setInstantSheetSyncStatus('synced');
        })
        .catch((err) => {
          console.warn('Aviso ao gravar faltas instantaneamente na planilha:', err);
          setInstantSheetSyncStatus('synced');
        });
    }, 150);
  };

  const handleSaveMonthlyAttendance = (updatedClass: ClassGroup) => {
    if (!canEditClass(updatedClass.id)) return;
    setClasses((prev) => {
      const next = prev.map((c) => (c.id === updatedClass.id ? updatedClass : c));
      saveStoredClasses(next);
      // Atualização instantânea na Google Sheet (Abas Nominais + Colunas de Frequência) ao preenchimento do professor PEB I / Usuário
      triggerDebouncedSheetWrite(updatedClass, next);
      return next;
    });
    setSelectedClass(updatedClass);
  };

  const handleSaveSingleStudent = (classId: string, updatedStudent: Student) => {
    if (!canEditClass(classId)) return;

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
        const tempCls = { ...cls, students: updatedStudents };
        const metrics = getClassAttendanceMetrics(tempCls, OFFICIAL_OCTOBER_DAYS);
        const finalCls: ClassGroup = {
          ...tempCls,
          presenceRate: metrics.presenceRate,
          monthlyAbsences: metrics.totalFaltasTurma,
        };
        targetUpdatedClass = finalCls;
        if (selectedClass.id === classId) {
          setSelectedClass(finalCls);
        }
        return finalCls;
      });
      saveStoredClasses(next);
      if (targetUpdatedClass) {
        triggerDebouncedSheetWrite(targetUpdatedClass, next);
      }
      return next;
    });

    setGridModalData((prev) =>
      prev ? { ...prev, student: canonicalStudent } : null
    );
  };

  const handleSaveNotes = (notes: string) => {
    if (!canEditClass(selectedClass.id)) return;
    const updated = { ...selectedClass, pedagogicalNotes: notes };
    setClasses((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      saveStoredClasses(next);
      return next;
    });
    setSelectedClass(updated);
  };

  const handleAddNewClass = (newClass: ClassGroup) => {
    if (userRole !== 'admin') return;
    setClasses((prev) => {
      const next = [newClass, ...prev];
      saveStoredClasses(next);
      return next;
    });
  };

  const handleSaveStudentPhoto = (studentId: string, newPhotoUrl: string, driveLink?: string) => {
    setClasses((prevClasses) => {
      let updatedTargetClass: ClassGroup | null = null;
      const next = prevClasses.map((cls) => {
        const hasStudent = cls.students.some((s) => s.id === studentId);
        if (!hasStudent) return cls;
        const updatedCls: ClassGroup = {
          ...cls,
          students: cls.students.map((s) =>
            s.id === studentId
              ? {
                  ...s,
                  photo: newPhotoUrl,
                  photoDriveUrl: driveLink || s.photoDriveUrl,
                }
              : s
          ),
        };
        updatedTargetClass = updatedCls;
        return updatedCls;
      });
      saveStoredClasses(next);
      if (updatedTargetClass) {
        triggerDebouncedSheetWrite(updatedTargetClass, next);
      }
      return next;
    });

    setSelectedClass((prev) => ({
      ...prev,
      students: prev.students.map((s) =>
        s.id === studentId
          ? {
              ...s,
              photo: newPhotoUrl,
              photoDriveUrl: driveLink || s.photoDriveUrl,
            }
          : s
      ),
    }));
  };

  const handleBack = () => {
    if (userRole === 'usuario') {
      setCurrentScreen('detalhes');
      return;
    }
    if (
      currentScreen === 'frequencia_mensal' ||
      currentScreen === 'detalhes' ||
      currentScreen === 'bolsa_familia' ||
      currentScreen === 'dias_letivos' ||
      currentScreen === 'planilha' ||
      currentScreen === 'usuarios_acesso'
    ) {
      setCurrentScreen('turmas');
    }
  };

  const handleLoginSuccess = (authUser: AuthorizedUser) => {
    const latestFromList =
      authorizedUsers.find(
        (u) => u.email.trim().toLowerCase() === authUser.email.trim().toLowerCase()
      ) || authUser;

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
      lastScreen: latestFromList.role === 'usuario' ? 'Detalhes da Turma' : '1. Turmas',
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
        lastScreenVisited: latestFromList.role === 'usuario' ? 'Detalhes da Turma' : '1. Turmas',
      };
    });
    setAuthorizedUsers(nextUsers);
    saveStoredAuthorizedUsers(nextUsers);
    pushSessionLogsToServer(nextLogs, nextUsers);
    syncAuthorizedUsersToGoogleSheet(nextUsers, nextLogs);

    setSimulatedTeacherEmail(null);
    setCurrentUserEmail(latestFromList.email);
    setCurrentUserName(latestFromList.name);
    setUserRole(latestFromList.role);
    if (latestFromList.role === 'usuario') {
      const nextIds =
        latestFromList.assignedClassIds && latestFromList.assignedClassIds.length > 0
          ? latestFromList.assignedClassIds.filter((id) => id !== 'all')
          : latestFromList.assignedClassId && latestFromList.assignedClassId !== 'all'
          ? [latestFromList.assignedClassId]
          : [classes[0]?.id || 'g04a'];
      const targetId = nextIds[0] || classes[0]?.id || 'g04a';
      setAssignedClassIds(nextIds);
      setAssignedClassId(targetId);
      const targetClass = classes.find((c) => c.id === targetId) || classes[0];
      if (targetClass) setSelectedClass(targetClass);
      // PEB I abre direto na sua turma sem precisar entrar no menu de seleção
      setCurrentScreen('detalhes');
    } else {
      // PEB II e ADMIN mantêm a tela de seleção de turmas
      setCurrentScreen('turmas');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Real-time session duration tracker (ticks every 5 seconds while logged in, even after F5 refresh!)
  useEffect(() => {
    if (currentScreen === 'login') return;

    const trackedEmail = (simulatedTeacherEmail || currentUserEmail).trim().toLowerCase();

    const screenLabelMap: Record<ScreenType, string> = {
      login: 'Login',
      turmas: '1. Turmas',
      detalhes: 'Detalhes da Turma',
      frequencia_mensal: '2. Lançar Faltas',
      faltas_consecutivas: 'Faltas Seguidas',
      bolsa_familia: 'Bolsa Família (Nominal)',
      planilha: '3. Planilha & Fotos',
      dias_letivos: '4. 200 Dias',
      usuarios_acesso: '5. Acessos',
      resumo: 'Fechamento Mensal',
    };

    const currentLog = accessSessionLogs.find((l) => l.id === activeSessionIdRef.current);

    // If session was restored from F5, or user switched to simulatedTeacherEmail, bootstrap an active session log immediately
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

      const currentScreenLabel = screenLabelMap[currentScreen] || '1. Turmas';
      const matchedUser = authorizedUsers.find(
        (u) => u.email.trim().toLowerCase() === trackedEmail
      );

      const newLog: UserAccessSessionLog = {
        id: newSessId,
        email: matchedUser?.email || trackedEmail,
        name: matchedUser?.name || currentUserName,
        role: matchedUser?.role || userRole,
        assignedClassName:
          matchedUser?.assignedClassName ||
          (userRole === 'admin'
            ? 'Todas as 40 Turmas (Acesso Pleno)'
            : selectedClass?.name || 'Turma'),
        loginTimeISO: nowISO,
        lastHeartbeatISO: nowISO,
        durationSeconds: 1,
        lastScreen: currentScreenLabel,
        isOnlineNow: true,
      };

      const nextLogs = [newLog, ...getStoredAccessSessionLogs()].slice(0, 500);
      setAccessSessionLogs(nextLogs);
      saveStoredAccessSessionLogs(nextLogs);

      setAuthorizedUsers((prevUsers) => {
        const nextUsers = prevUsers.map((u) => {
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
        saveStoredAuthorizedUsers(nextUsers);
        pushSessionLogsToServer(nextLogs, nextUsers);
        return nextUsers;
      });
    }

    let tickCounter = 0;
    const intervalId = window.setInterval(() => {
      const sessId = activeSessionIdRef.current;
      if (!sessId) return;
      tickCounter++;

      const now = new Date();
      const nowISO = now.toISOString();
      const nowFormatted = now.toLocaleString('pt-BR');
      const currentScreenLabel = screenLabelMap[currentScreen] || '1. Turmas';

      setAccessSessionLogs((prevLogs) => {
        const targetLog = prevLogs.find((l) => l.id === sessId);
        if (!targetLog) return prevLogs;

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
        saveStoredAccessSessionLogs(updatedLogs);

        if (deltaSecs > 0) {
          setAuthorizedUsers((prevUsers) => {
            const updatedUsers = prevUsers.map((u) => {
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
            pushSessionLogsToServer(updatedLogs, updatedUsers);
            // Sync to Google Sheets every 3 ticks (15 seconds) so Admin sees live duration from all devices
            if (tickCounter % 3 === 0) {
              syncAuthorizedUsersToGoogleSheet(updatedUsers, updatedLogs);
            }
            return updatedUsers;
          });
        }

        return updatedLogs;
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [currentScreen, currentUserEmail, simulatedTeacherEmail]);

  const handleLogout = async () => {
    try {
      localStorage.removeItem(ACTIVE_AUTH_SESSION_STORAGE_KEY);
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
      syncAuthorizedUsersToGoogleSheet(nextUsers, nextLogs);
      activeSessionIdRef.current = null;
    }

    try {
      await logoutGoogle();
    } catch {
      // ignore sign-out error
    }
    setCurrentScreen('login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSyncWithClasses = () => {
    setClasses((prev) => [...prev]);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col font-sans selection:bg-[#0071e3]/15 selection:text-[#0066cc]">
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
            ? 'Dias Letivos SME'
            : currentScreen === 'resumo'
            ? 'Fechamento'
            : currentScreen === 'planilha'
            ? 'Planilha Oficial'
            : currentScreen === 'usuarios_acesso'
            ? 'Acessos (@educacao.jundiai.sp.gov.br)'
            : undefined
        }
        subtitle={
          currentScreen === 'frequencia_mensal'
            ? `${selectedClass.shift} • ${simulatedTeacherEmail || currentUserEmail}`
            : `${simulatedTeacherEmail || currentUserEmail} • ${
                userRole === 'admin'
                  ? 'ADMIN (Acesso Pleno)'
                  : userRole === 'usuario'
                  ? 'PEB I (Sua Turma)'
                  : 'PEB II (Só Visualização)'
              }`
        }
        userEmail={simulatedTeacherEmail || currentUserEmail}
        userName={currentUserName}
        userRole={userRole}
        visibleClasses={visibleClasses}
        allClasses={classes}
        onSelectClassById={(classId) => {
          const found = classes.find((c) => c.id === classId);
          if (found) setSelectedClass(found);
        }}
        onRestoreAdminRole={() => {
          setSimulatedTeacherEmail(null);
          setUserRole('admin');
          setCurrentScreen('usuarios_acesso');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onBack={handleBack}
        onChangeScreen={(screen) => {
          if (userRole === 'peb2' && screen === 'frequencia_mensal') {
            return;
          }
          if (
            userRole !== 'admin' &&
            (screen === 'bolsa_familia' ||
              screen === 'planilha' ||
              screen === 'dias_letivos' ||
              screen === 'usuarios_acesso')
          ) {
            return;
          }
          if (userRole === 'usuario' && screen === 'turmas') {
            setCurrentScreen('detalhes');
            return;
          }
          setCurrentScreen(screen);
        }}
        onNavigatePlanilha={() => {
          if (userRole === 'admin') setCurrentScreen('planilha');
        }}
        onOpenSpotlightSearch={() => setIsSpotlightOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area: Responsive Proportions for Mobile, Tablet, Laptop & Full HD Desktop */}
      <main
        className={`flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 lg:px-8 ${
          currentScreen === 'login' ? 'p-0 max-w-none' : 'pt-[68px] sm:pt-[76px] pb-24 lg:pb-12'
        }`}
      >
        {currentScreen === 'login' && (
          <LoginScreen
            authorizedUsers={authorizedUsers}
            onLoginSuccess={handleLoginSuccess}
          />
        )}

        {currentScreen === 'usuarios_acesso' && (
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
              const found = updatedClasses.find((c) => c.id === selectedClass.id);
              if (found) setSelectedClass(found);
            }}
            currentUserEmail={currentUserEmail}
            userRole={userRole}
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
              setSimulatedTeacherEmail(teacher.email);
              setUserRole(teacher.role);
              setCurrentScreen(teacher.role === 'usuario' ? 'detalhes' : 'turmas');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateToDatabaseEmailsTab={() => setCurrentScreen('planilha')}
            onBack={() => setCurrentScreen('turmas')}
          />
        )}

        {currentScreen === 'turmas' && (
          <MinhasTurmasScreen
            classes={classes}
            userRole={userRole}
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
              if (userRole === 'usuario' && !allowedUsuarioClassIds.includes(cls.id)) return;
              setSelectedClass(cls);
              setIsStudentListModalOpen(true);
            }}
            onOpenNewClassModal={() => setIsNewClassModalOpen(true)}
            onOpenConfigDaysModal={() => setIsConfigDaysModalOpen(true)}
            onNavigateToSheet={() => setCurrentScreen('planilha')}
            onNavigateToAcessos={() => setCurrentScreen('usuarios_acesso')}
            onSelectStudentForConsecutiveScreen={(cls) => {
              setSelectedClass(cls);
              setCurrentScreen('faltas_consecutivas');
              window.scrollTo({ top: 0, behavior: 'smooth' });
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

        {currentScreen === 'detalhes' && (
          <DetalhesTurmaScreen
            classGroup={selectedClass}
            assignedClasses={visibleClasses}
            onSwitchAssignedClass={(cls) => {
              setAssignedClassId(cls.id);
              setSelectedClass(cls);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            userRole={userRole}
            canLaunchAttendance={canEditClass(selectedClass.id)}
            onGoToMonthlyAttendance={() => {
              setCurrentScreen('frequencia_mensal');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onGoToMonthlySummary={() => {
              setCurrentScreen('resumo');
              window.scrollTo({ top: 0, behavior: 'smooth' });
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
                setCurrentScreen('bolsa_familia');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            onNavigateToConsecutiveAbsences={() => {
              setCurrentScreen('faltas_consecutivas');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateToSheet={() => setCurrentScreen('planilha')}
            onBackToClasses={() => {
              if (userRole === 'usuario') return;
              setCurrentScreen('turmas');
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
            onNavigateToSheet={() => setCurrentScreen('planilha')}
            onBack={() =>
              setCurrentScreen(userRole === 'usuario' ? 'detalhes' : 'turmas')
            }
          />
        )}

        {currentScreen === 'faltas_consecutivas' && (
          <FaltasConsecutivasScreen
            classGroup={selectedClass}
            availableClasses={userRole === 'admin' || userRole === 'peb2' ? classes : visibleClasses}
            userRole={userRole}
            onSelectClass={(cls) => {
              setAssignedClassId(cls.id);
              setSelectedClass(cls);
            }}
            onUpdateStudent={(classId, updatedStudent) => {
              handleSaveSingleStudent(classId, updatedStudent);
            }}
          />
        )}

        {currentScreen === 'dias_letivos' && (
          <DiasLetivosScreen
            userRole={userRole}
            onOpenConfigDaysModal={() => setIsConfigDaysModalOpen(true)}
            onNavigateToSheet={() => setCurrentScreen('planilha')}
            onBack={() => setCurrentScreen('turmas')}
          />
        )}

        {currentScreen === 'resumo' && (
          <ResumoMensalScreen
            currentClass={selectedClass}
            allClasses={userRole === 'admin' || userRole === 'peb2' ? classes : visibleClasses}
            userRole={userRole}
            initialTab={userRole === 'admin' ? 'metricas_uso' : 'resumo_turma'}
            onSelectClass={(cls) => setSelectedClass(cls)}
            onSaveNotes={handleSaveNotes}
            onOpenMonthlyLaunchForClass={(cls) => {
              setSelectedClass(cls);
              setCurrentScreen('frequencia_mensal');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenReportPrint={() => setIsReportPrintModalOpen(true)}
            onNavigateToSheet={() => setCurrentScreen('planilha')}
          />
        )}

        {currentScreen === 'planilha' && (
          <PlanilhaGoogleScreen
            classes={visibleClasses}
            allClasses={classes}
            authorizedUsers={authorizedUsers}
            userRole={userRole}
            onUpdateAllClasses={(updated) => {
              setClasses(updated);
              saveStoredClasses(updated);
              const found = updated.find((c) => c.id === selectedClass.id);
              if (found) setSelectedClass(found);
            }}
            onSyncWithClasses={handleSyncWithClasses}
            onOpenStudentGrid={(classId, studentId) => {
              const targetClass = classes.find((c) => c.id === classId);
              const targetStudent = targetClass?.students.find((s) => s.id === studentId);
              if (targetClass && targetStudent) {
                setGridModalData({
                  student: targetStudent,
                  classId: targetClass.id,
                  className: targetClass.name,
                  diasLetivosMes: targetClass.classesHeld || 20,
                });
              }
            }}
            onOpenStudentPdf={(classId, studentId) => {
              const targetClass = classes.find((c) => c.id === classId);
              const targetStudent = targetClass?.students.find((s) => s.id === studentId);
              if (targetClass && targetStudent) {
                setPdfModalData({
                  student: targetStudent,
                  className: targetClass.name,
                });
              }
            }}
            onNavigateToAcessos={() => setCurrentScreen('usuarios_acesso')}
            onBack={() => setCurrentScreen('turmas')}
          />
        )}
      </main>

      {/* Fixed Bottom Navigation - Interactive for Senior & Lay Educators */}
      <BottomNav
        currentScreen={currentScreen}
        userRole={userRole}
        selectedClassName={selectedClass?.name}
        onLogout={handleLogout}
        onChangeScreen={(screen) => {
          if (userRole === 'peb2' && screen === 'frequencia_mensal') {
            return;
          }
          if (
            userRole !== 'admin' &&
            (screen === 'bolsa_familia' ||
              screen === 'planilha' ||
              screen === 'dias_letivos' ||
              screen === 'usuarios_acesso')
          ) {
            return;
          }
          if (userRole === 'usuario' && screen === 'turmas') {
            setCurrentScreen('detalhes');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          setCurrentScreen(screen);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Modals */}
      <NovaTurmaModal
        isOpen={isNewClassModalOpen}
        onClose={() => setIsNewClassModalOpen(false)}
        onAddClass={handleAddNewClass}
      />

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

      <UploadFotoModal
        isOpen={photoModalStudent !== null}
        onClose={() => setPhotoModalStudent(null)}
        student={photoModalStudent}
        className={selectedClass.name}
        onSavePhoto={handleSaveStudentPhoto}
      />

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
          setCurrentScreen('detalhes');
          window.scrollTo({ top: 0, behavior: 'smooth' });
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
          setCurrentScreen(screen);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Visualizador no App dos Documentos PDF Nominais (Fichas Informativas das Subpastas do Drive) */}
      <VisualizarPdfNominalModal
        isOpen={pdfModalData !== null}
        onClose={() => setPdfModalData(null)}
        student={pdfModalData?.student || null}
        className={pdfModalData?.className || selectedClass.name}
        allClasses={classes}
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
        onSaveStudentPdfLink={(studentId, pdfId, pdfUrl, subfolder) => {
          setClasses((prevClasses) => {
            let updatedCls: ClassGroup | null = null;
            const next = prevClasses.map((cls) => {
              const hasStudent = cls.students.some((s) => s.id === studentId);
              if (!hasStudent) return cls;
              const nextCls = {
                ...cls,
                students: cls.students.map((s) =>
                  s.id === studentId
                    ? {
                        ...s,
                        fichaPdfDriveId: pdfId,
                        fichaPdfDriveUrl: pdfUrl,
                        fichaPdfSubfolder: subfolder,
                      }
                    : s
                ),
              };
              updatedCls = nextCls;
              return nextCls;
            });
            saveStoredClasses(next);
            if (updatedCls) {
              triggerDebouncedSheetWrite(updatedCls, next);
            }
            return next;
          });
          setSelectedClass((prev) => ({
            ...prev,
            students: prev.students.map((s) =>
              s.id === studentId
                ? {
                    ...s,
                    fichaPdfDriveId: pdfId,
                    fichaPdfDriveUrl: pdfUrl,
                    fichaPdfSubfolder: subfolder,
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
                    fichaPdfDriveId: pdfId,
                    fichaPdfDriveUrl: pdfUrl,
                    fichaPdfSubfolder: subfolder,
                  },
                }
              : prev
          );
        }}
      />
      {/* Modal do Administrador: Configurar 200 Dias Letivos Mensais por Turma & Links */}
      <ConfigurarDiasLetivosTurmasModal
        isOpen={isConfigDaysModalOpen}
        onClose={() => setIsConfigDaysModalOpen(false)}
        classes={classes}
        onSaveClassesConfig={(updatedClasses) => {
          setClasses(updatedClasses);
          saveStoredClasses(updatedClasses);
          const found = updatedClasses.find((c) => c.id === selectedClass.id);
          if (found) setSelectedClass(found);
        }}
        onNavigateToSheet={() => setCurrentScreen('planilha')}
      />
    </div>
  );
}
