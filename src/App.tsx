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
} from './services/db';
import { OFFICIAL_OCTOBER_DAYS } from './data/mockData';
import { getClassAttendanceMetrics } from './utils/attendanceRules';
import {
  getAccessToken,
  getSavedSpreadsheetInfo,
  readClassesFromGoogleSheet,
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
import { DiasLetivosScreen } from './components/DiasLetivosScreen';
import { ResumoMensalScreen } from './components/ResumoMensalScreen';
import { PlanilhaGoogleScreen } from './components/PlanilhaGoogleScreen';
import { UsuariosAcessoScreen } from './components/UsuariosAcessoScreen';
import { NovaTurmaModal } from './components/NovaTurmaModal';
import { AlunosModal } from './components/AlunosModal';
import { RelatorioImpressaoModal } from './components/RelatorioImpressaoModal';
import { AnotacoesModal } from './components/AnotacoesModal';
import { UploadFotoModal } from './components/UploadFotoModal';
import { GradeDadosCriancaModal } from './components/GradeDadosCriancaModal';
import { VisualizarPdfNominalModal } from './components/VisualizarPdfNominalModal';
import { ConfigurarDiasLetivosTurmasModal } from './components/ConfigurarDiasLetivosTurmasModal';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('login');
  const [classes, setClasses] = useState<ClassGroup[]>(() => getStoredClasses());
  const [selectedClass, setSelectedClass] = useState<ClassGroup>(() => classes[0] || getStoredClasses()[0]);
  const [instantSheetSyncStatus, setInstantSheetSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const sheetWriteTimerRef = React.useRef<number | null>(null);

  // Role-Based Access Control (ADMIN, USUÁRIO - Sua Turma, PEB II - Só Visualização) & Registered Institutional Users (@educacao.jundiai.sp.gov.br)
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>(() =>
    getStoredAuthorizedUsers()
  );
  const [accessSessionLogs, setAccessSessionLogs] = useState<UserAccessSessionLog[]>(() =>
    getStoredAccessSessionLogs()
  );
  const activeSessionIdRef = React.useRef<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>(
    'emebjfreitas@jundiai.sp.gov.br'
  );
  const [currentUserName, setCurrentUserName] = useState<string>(
    'EMEB Professor Joaquim Candelário de Freitas (Direção / Admin)'
  );
  const [userRole, setUserRole] = useState<UserRole>('admin');
  const [assignedClassId, setAssignedClassId] = useState<string>(() => classes[0]?.id || 'g04a');
  const [attendanceWindowConfig, setAttendanceWindowConfig] =
    useState<AttendanceWindowConfig>(() => getStoredAttendanceWindowConfig());

  const handleUpdateAttendanceWindowConfig = (nextConfig: AttendanceWindowConfig) => {
    setAttendanceWindowConfig(nextConfig);
    saveStoredAttendanceWindowConfig(nextConfig);
  };

  const handleSaveAuthorizedUsers = (updatedUsers: AuthorizedUser[]) => {
    setAuthorizedUsers(updatedUsers);
    saveStoredAuthorizedUsers(updatedUsers);
    syncAuthorizedUsersToGoogleSheet(updatedUsers);
    // Keep current logged user role & class in sync if their own entry was modified
    const currentMatched = updatedUsers.find(
      (u) => u.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase()
    );
    if (currentMatched) {
      setUserRole(currentMatched.role);
      setCurrentUserName(currentMatched.name);
      if (currentMatched.role === 'usuario' && currentMatched.assignedClassId !== 'all') {
        setAssignedClassId(currentMatched.assignedClassId);
      }
    }
  };

  // Debounced persist classes to local database for instant UI responsiveness (0ms lag on + / - clicks)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveStoredClasses(classes);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [classes]);

  // Automatic Pull from Master Google Sheet (student edits, 200 days) & Drive Folder (photos)
  useEffect(() => {
    let isMounted = true;

    const pullMasterDataFromGoogle = async () => {
      const token = await getAccessToken();
      if (!token) return;

      const { spreadsheetId } = getSavedSpreadsheetInfo();
      try {
        if (spreadsheetId) {
          const result = await readClassesFromGoogleSheet(
            spreadsheetId,
            getStoredClasses()
          );
          if (isMounted && result.rowsRead > 0) {
            setClasses(result.updatedClasses);
            saveStoredClasses(result.updatedClasses);
            setSelectedClass((prev) => {
              const found = result.updatedClasses.find((c) => c.id === prev.id);
              return found || prev;
            });
          }
        } else {
          // Sync photos from Drive folder + nominal PDFs from Fichas Informativas subfolders if available
          const photoSync = await syncPhotosFromDriveFolder(getStoredClasses());
          const pdfSync = await syncNominalPdfsFromDriveSubfolders(
            photoSync.updatedClasses
          );
          if (
            isMounted &&
            (photoSync.matchedPhotosCount > 0 || pdfSync.matchedPdfsCount > 0)
          ) {
            setClasses(pdfSync.updatedClasses);
            saveStoredClasses(pdfSync.updatedClasses);
            setSelectedClass((prev) => {
              const found = pdfSync.updatedClasses.find(
                (c) => c.id === prev.id
              );
              return found || prev;
            });
          }
        }
      } catch (err) {
        console.warn('Auto-sync em segundo plano:', err);
      }
    };

    const handleWindowFocus = () => {
      pullMasterDataFromGoogle();
    };

    window.addEventListener('focus', handleWindowFocus);
    const intervalId = window.setInterval(pullMasterDataFromGoogle, 30000);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleWindowFocus);
      window.clearInterval(intervalId);
    };
  }, []);

  // Keep selectedClass restricted when userRole is 'usuario'
  useEffect(() => {
    if (userRole === 'usuario') {
      const target = classes.find((c) => c.id === assignedClassId);
      if (target) {
        setSelectedClass(target);
      }
    }
  }, [userRole, assignedClassId, classes]);

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
  const canEditClass = (classId: string): boolean => {
    if (!windowStatus.isAllowedToLaunch) return false;
    if (userRole === 'admin') return true;
    if (userRole === 'usuario') return classId === assignedClassId;
    return false; // 'peb2' is strictly view-only
  };

  const visibleClasses =
    userRole === 'usuario'
      ? classes.filter((c) => c.id === assignedClassId)
      : classes;

  // Screen navigation handlers
  const handleSelectClassForDetails = (cls: ClassGroup) => {
    if (userRole === 'usuario' && cls.id !== assignedClassId) return;
    setSelectedClass(cls);
    setCurrentScreen('detalhes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectClassForMonthlyAttendance = (cls: ClassGroup) => {
    if (userRole === 'usuario' && cls.id !== assignedClassId) return;
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
    }, 350);
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

    setClasses((prevClasses) => {
      let targetUpdatedClass: ClassGroup | null = null;
      const next = prevClasses.map((cls) => {
        if (cls.id !== classId) return cls;
        const updatedStudents = cls.students.map((s) =>
          s.id === updatedStudent.id ? updatedStudent : s
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
      prev ? { ...prev, student: updatedStudent } : null
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
      const next = prevClasses.map((cls) => ({
        ...cls,
        students: cls.students.map((s) =>
          s.id === studentId
            ? { ...s, photo: newPhotoUrl, photoDriveUrl: driveLink }
            : s
        ),
      }));
      saveStoredClasses(next);
      return next;
    });

    setSelectedClass((prev) => ({
      ...prev,
      students: prev.students.map((s) =>
        s.id === studentId
          ? { ...s, photo: newPhotoUrl, photoDriveUrl: driveLink }
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
      currentScreen === 'dias_letivos' ||
      currentScreen === 'planilha' ||
      currentScreen === 'usuarios_acesso'
    ) {
      setCurrentScreen('turmas');
    }
  };

  const handleLoginSuccess = (authUser: AuthorizedUser) => {
    const now = new Date();
    const nowFormatted = now.toLocaleString('pt-BR');
    const nowISO = now.toISOString();
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeSessionIdRef.current = sessionId;

    const newLog: UserAccessSessionLog = {
      id: sessionId,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      assignedClassName: authUser.assignedClassName,
      loginTimeISO: nowISO,
      lastHeartbeatISO: nowISO,
      durationSeconds: 0,
      lastScreen: 'Turmas',
      isOnlineNow: true,
    };

    const nextLogs = [newLog, ...getStoredAccessSessionLogs()].slice(0, 500);
    setAccessSessionLogs(nextLogs);
    saveStoredAccessSessionLogs(nextLogs);

    const nextUsers = authorizedUsers.map((u) => {
      if (u.email.trim().toLowerCase() !== authUser.email.trim().toLowerCase()) {
        return u;
      }
      return {
        ...u,
        totalAccessCount: (u.totalAccessCount || 0) + 1,
        lastLoginAt: nowFormatted,
        lastActiveAt: nowFormatted,
        lastSessionDurationSeconds: 0,
        lastScreenVisited: 'Turmas',
      };
    });
    setAuthorizedUsers(nextUsers);
    saveStoredAuthorizedUsers(nextUsers);
    syncAuthorizedUsersToGoogleSheet(nextUsers, nextLogs);

    setCurrentUserEmail(authUser.email);
    setCurrentUserName(authUser.name);
    setUserRole(authUser.role);
    if (authUser.role === 'usuario') {
      const targetId =
        authUser.assignedClassId && authUser.assignedClassId !== 'all'
          ? authUser.assignedClassId
          : classes[0]?.id || 'g04a';
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

  // Real-time session duration tracker (ticks every 5 seconds while logged in)
  useEffect(() => {
    if (currentScreen === 'login' || !activeSessionIdRef.current) return;

    const screenLabelMap: Record<ScreenType, string> = {
      login: 'Login',
      turmas: '1. Turmas',
      detalhes: 'Detalhes da Turma',
      frequencia_mensal: '2. Lançar Faltas',
      planilha: '3. Planilha & Fotos',
      dias_letivos: '4. 200 Dias',
      usuarios_acesso: '5. Acessos',
      resumo: 'Fechamento Mensal',
    };

    const intervalId = window.setInterval(() => {
      const sessId = activeSessionIdRef.current;
      if (!sessId) return;

      const now = new Date();
      const nowISO = now.toISOString();
      const nowFormatted = now.toLocaleString('pt-BR');
      const currentScreenLabel = screenLabelMap[currentScreen] || 'Turmas';

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
                totalDurationSeconds: (u.totalDurationSeconds || 0) + deltaSecs,
                lastSessionDurationSeconds: elapsedSecs,
                lastActiveAt: nowFormatted,
                lastScreenVisited: currentScreenLabel,
              };
            });
            saveStoredAuthorizedUsers(updatedUsers);
            return updatedUsers;
          });
        }

        return updatedLogs;
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [currentScreen]);

  const handleLogout = async () => {
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
    <div className="min-h-screen bg-[#f8faf9] text-[#191c1b] flex flex-col font-sans selection:bg-[#c3e5f4] selection:text-[#001f29]">
      {/* Top Minimalist Header */}
      <Header
        currentScreen={currentScreen}
        title={
          currentScreen === 'frequencia_mensal'
            ? `${selectedClass.name}`
            : currentScreen === 'detalhes'
            ? `Turma ${selectedClass.name}`
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
            ? `${selectedClass.shift} • ${currentUserEmail}`
            : `${currentUserEmail} • ${
                userRole === 'admin'
                  ? 'ADMIN (Acesso Pleno)'
                  : userRole === 'usuario'
                  ? 'PEB I (Sua Turma)'
                  : 'PEB II (Só Visualização)'
              }`
        }
        userEmail={currentUserEmail}
        userName={currentUserName}
        userRole={userRole}
        onBack={handleBack}
        onChangeScreen={(screen) => {
          if (
            userRole !== 'admin' &&
            (screen === 'planilha' || screen === 'dias_letivos' || screen === 'usuarios_acesso')
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
        onLogout={handleLogout}
      />

      {/* Main Content Area: Mobile intact + Full HD 1920x1080 21" Landscape Widescreen */}
      <main
        className={`flex-1 w-full max-w-2xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto px-3.5 sm:px-5 lg:px-8 xl:px-10 ${
          currentScreen === 'login' ? 'p-0 max-w-none' : 'pt-24'
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
            currentUserEmail={currentUserEmail}
            userRole={userRole}
            attendanceWindowConfig={attendanceWindowConfig}
            onUpdateAttendanceWindowConfig={handleUpdateAttendanceWindowConfig}
            onSaveAuthorizedUsers={handleSaveAuthorizedUsers}
            onNavigateToDatabaseEmailsTab={() => setCurrentScreen('planilha')}
            onBack={() => setCurrentScreen('turmas')}
          />
        )}

        {currentScreen === 'turmas' && (
          <MinhasTurmasScreen
            classes={classes}
            userRole={userRole}
            assignedClassId={assignedClassId}
            attendanceWindowConfig={attendanceWindowConfig}
            onChangeRole={(role) => {
              setUserRole(role);
              if (role === 'usuario') {
                const target = classes.find((c) => c.id === assignedClassId) || classes[0];
                if (target) setSelectedClass(target);
                setCurrentScreen('detalhes');
              }
            }}
            onChangeAssignedClassId={(id) => setAssignedClassId(id)}
            onSelectClassForDetails={handleSelectClassForDetails}
            onSelectClassForMonthlyAttendance={handleSelectClassForMonthlyAttendance}
            onOpenClassStudentList={(cls) => {
              if (userRole === 'usuario' && cls.id !== assignedClassId) return;
              setSelectedClass(cls);
              setIsStudentListModalOpen(true);
            }}
            onOpenNewClassModal={() => setIsNewClassModalOpen(true)}
            onOpenConfigDaysModal={() => setIsConfigDaysModalOpen(true)}
            onNavigateToSheet={() => setCurrentScreen('planilha')}
            onNavigateToAcessos={() => setCurrentScreen('usuarios_acesso')}
          />
        )}

        {currentScreen === 'detalhes' && (
          <DetalhesTurmaScreen
            classGroup={selectedClass}
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
            onNavigateToSheet={() => setCurrentScreen('planilha')}
            onBackToClasses={() => {
              if (userRole === 'usuario') return;
              setCurrentScreen('turmas');
            }}
          />
        )}

        {currentScreen === 'frequencia_mensal' && (
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
            allClasses={visibleClasses}
            userRole={userRole}
            onSelectClass={(cls) => setSelectedClass(cls)}
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
        onChangeScreen={(screen) => {
          if (
            userRole !== 'admin' &&
            (screen === 'planilha' || screen === 'dias_letivos' || screen === 'usuarios_acesso')
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

      {/* Grade de Dados Interativa de Cada Criança */}
      <GradeDadosCriancaModal
        isOpen={gridModalData !== null}
        onClose={() => setGridModalData(null)}
        student={gridModalData?.student || null}
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
        }}
        onSaveStudentPdfLink={(studentId, pdfId, pdfUrl, subfolder) => {
          setClasses((prevClasses) => {
            const next = prevClasses.map((cls) => ({
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
            }));
            saveStoredClasses(next);
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
