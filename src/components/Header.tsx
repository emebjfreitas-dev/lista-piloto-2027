import React, { useState, useEffect, useRef } from 'react';
import {
  Home,
  Users,
  CalendarCheck2,
  ShieldAlert,
  SlidersHorizontal,
  ChevronDown,
  Search,
  CloudCheck,
  CloudUpload,
  LogOut,
  ShieldCheck,
  HeartHandshake,
  CalendarDays,
  BarChart3,
  Database,
  FileCode2,
  UserCog,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  AttendanceWindowConfig,
  AuthorizedUser,
  ClassGroup,
  ScreenType,
  UserRole,
} from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME } from '../data/mockData';
import { StudentAvatar } from './StudentAvatar';
import { PushNotificationCenter } from './PushNotificationCenter';
import {
  subscribeToSyncStatus,
  SyncStatusSnapshot,
} from '../services/firebaseSync';
import { flushPendingOfflineQueue } from '../services/db';

interface HeaderProps {
  currentScreen: ScreenType;
  title?: string;
  subtitle?: string;
  userEmail?: string;
  userName?: string;
  userRole?: UserRole;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  assignedClassIds?: string[];
  attendanceWindowConfig?: AttendanceWindowConfig;
  visibleClasses?: ClassGroup[];
  allClasses?: ClassGroup[];
  onRestoreAdminRole?: () => void;
  onBack?: () => void;
  onChangeScreen?: (screen: ScreenType) => void;
  onSelectClassById?: (classId: string) => void;
  onOpenSpotlightSearch?: () => void;
  onQuickSyncDriveNow?: () => Promise<void>;
  onOpenConfigDaysModal?: () => void;
  onOpenJsonImportModal?: () => void;
  onOpenAdminPhotosModal?: () => void;
  onOpenAdminPdfsModal?: () => void;
  onNavigatePlanilha: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  userEmail,
  userName,
  userRole = 'admin',
  teacherRoleType,
  assignedClassIds = [],
  attendanceWindowConfig,
  visibleClasses = [],
  allClasses = [],
  onRestoreAdminRole,
  onChangeScreen,
  onSelectClassById,
  onOpenSpotlightSearch,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isFlushingCloud, setIsFlushingCloud] = useState(false);
  const [showAdminNavDropdown, setShowAdminNavDropdown] = useState(false);

  const adminMenuRef = useRef<HTMLDivElement>(null);

  const [syncSnapshot, setSyncSnapshot] = useState<SyncStatusSnapshot>({
    status: 'synced',
    pendingCount: 0,
    lastSyncedAtISO: null,
    lastError: null,
    queue: [],
  });

  useEffect(() => {
    const unsubSync = subscribeToSyncStatus((snap) => {
      setSyncSnapshot(snap);
    });
    return () => unsubSync();
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setShowAdminNavDropdown(false);
      }
    };
    if (showAdminNavDropdown) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAdminNavDropdown]);

  const handleCloudFlushClick = async () => {
    if (isFlushingCloud) return;
    setIsFlushingCloud(true);
    try {
      await flushPendingOfflineQueue();
    } catch (err) {
      console.warn('Aviso ao sincronizar nuvem Firebase:', err);
    } finally {
      setIsFlushingCloud(false);
    }
  };

  const handleConfirmLogoutWithFlush = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      if (syncSnapshot.pendingCount > 0) {
        await Promise.race([
          flushPendingOfflineQueue(),
          new Promise((resolve) => setTimeout(resolve, 1800)),
        ]);
      }
    } catch {
      // safe fallback
    } finally {
      setIsLoggingOut(false);
      setShowLogoutSheet(false);
      setShowProfileMenu(false);
      onLogout();
    }
  };

  if (currentScreen === 'login') return null;

  const isAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';

  const navigateTo = (screen: ScreenType) => {
    setShowAdminNavDropdown(false);
    setShowProfileMenu(false);
    onChangeScreen?.(screen);
  };

  const primaryNavItems: Array<{
    id: ScreenType;
    label: string;
    activeMatch: boolean;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'home',
      label: 'Início',
      activeMatch: currentScreen === 'home',
      icon: Home,
    },
    {
      id: 'turmas',
      label: 'Turmas',
      activeMatch: currentScreen === 'turmas' || currentScreen === 'detalhes',
      icon: Users,
    },
    ...(userRole !== 'peb2'
      ? [
          {
            id: 'frequencia_mensal' as ScreenType,
            label: 'Faltas do Mês',
            activeMatch: currentScreen === 'frequencia_mensal',
            icon: CalendarCheck2,
          },
        ]
      : []),
    {
      id: 'faltas_consecutivas',
      label: 'Busca Ativa',
      activeMatch: currentScreen === 'faltas_consecutivas',
      icon: ShieldAlert,
    },
  ];

  const adminEssentialItems: Array<{
    id: ScreenType;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    tintClass: string;
  }> = [
    {
      id: 'resumo',
      label: 'Resumo & Mapa',
      subtitle: 'Frequência mensal e padrão de faltas',
      icon: BarChart3,
      tintClass: 'bg-[#e8f0fe] text-[#1a4fa3]',
    },
    {
      id: 'bolsa_familia',
      label: 'Bolsa Família & Fretado',
      subtitle: 'Condicionalidades e alertas sociais',
      icon: HeartHandshake,
      tintClass: 'bg-[#fef3c7] text-[#92400e]',
    },
    {
      id: 'dias_letivos',
      label: '200 Dias Letivos',
      subtitle: 'Calendário oficial e feriados 2027',
      icon: CalendarDays,
      tintClass: 'bg-[#eaf6ef] text-[#005035]',
    },
    {
      id: 'usuarios_acesso',
      label: 'Acessos & Segurança',
      subtitle: 'Permissões, auditoria e alertas FCM',
      icon: ShieldCheck,
      tintClass: 'bg-[#f2f2f7] text-[#1d1d1f]',
    },
    {
      id: 'diagnostico_bd',
      label: 'Diagnóstico do Banco',
      subtitle: 'Consistência cadastral e sincronismo',
      icon: Database,
      tintClass: 'bg-[#e8f0fe] text-[#1a4fa3]',
    },
    {
      id: 'importar_deficiencias_htm',
      label: 'Deficiências (.HTM)',
      subtitle: 'Importar registros SED para AEE',
      icon: FileCode2,
      tintClass: 'bg-[#eaf6ef] text-[#005035]',
    },
  ];

  const isAdminScreenActive = [
    'bolsa_familia',
    'usuarios_acesso',
    'dias_letivos',
    'resumo',
    'diagnostico_bd',
    'importar_deficiencias_htm',
  ].includes(currentScreen);

  const roleShortLabel = isAdmin
    ? 'Admin'
    : teacherRoleType === 'aee'
    ? 'AEE'
    : teacherRoleType === 'apoio'
    ? 'Apoio'
    : userRole === 'usuario'
    ? 'PEB I'
    : 'PEB II';

  return (
    <>
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-white/95 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.05)]">
        <div className="h-14 px-3 sm:px-6 lg:px-8 max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Zona 1: Identidade Institucional */}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="flex items-center gap-2.5 cursor-pointer group select-none min-w-0 text-left"
            title="Ir para o Início"
          >
            <img
              src={APP_LOGO_URL}
              alt="Brasão de Jundiaí"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = APP_LOGO_FALLBACK_URL;
              }}
              className="w-7 h-7 object-contain shrink-0"
            />
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[14px] font-semibold tracking-tight text-[#1d1d1f] group-hover:text-[#0071e3] transition-colors truncate">
                Lista Piloto 2027
              </span>
              <span className="text-[#86868b] font-light hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="text-xs text-[#6e6e73] font-medium hidden md:inline whitespace-nowrap">
                EMEB Candelário
              </span>
            </div>
          </button>

          {/* Zona 2: Navegação Principal Enxuta (Desktop & Tablet Paisagem lg+) */}
          {onChangeScreen && (
            <nav
              aria-label="Navegação Principal"
              className="hidden lg:flex items-center gap-1 p-1 bg-[#f2f2f7] rounded-2xl shrink-0"
            >
              {primaryNavItems.map((item) => {
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    aria-current={item.activeMatch ? 'page' : undefined}
                    className={`h-8 px-3 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                      item.activeMatch
                        ? 'bg-white text-[#1d1d1f] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                        : 'text-[#48484a] hover:text-[#1d1d1f] hover:bg-white/60 font-medium'
                    }`}
                  >
                    <IconComp
                      className={`w-3.5 h-3.5 shrink-0 ${
                        item.activeMatch ? 'text-[#0071e3] stroke-[2.25]' : 'text-[#6e6e73] stroke-[1.9]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {/* Menu Gestão (Apenas Admin — Somente Telas Essenciais) */}
              {isAdmin && (
                <div className="relative" ref={adminMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowAdminNavDropdown((prev) => !prev)}
                    aria-expanded={showAdminNavDropdown}
                    className={`h-8 px-3 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                      isAdminScreenActive || showAdminNavDropdown
                        ? 'bg-white text-[#1d1d1f] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                        : 'text-[#48484a] hover:text-[#1d1d1f] hover:bg-white/60 font-medium'
                    }`}
                  >
                    <SlidersHorizontal
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isAdminScreenActive || showAdminNavDropdown
                          ? 'text-[#0071e3] stroke-[2.25]'
                          : 'text-[#6e6e73] stroke-[1.9]'
                      }`}
                    />
                    <span>Gestão</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[#86868b] transition-transform duration-150 ${
                        showAdminNavDropdown ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showAdminNavDropdown && (
                    <div className="absolute right-0 mt-2.5 w-72 bg-white/98 backdrop-blur-2xl rounded-3xl shadow-[0_18px_48px_rgba(0,0,0,0.14)] p-2 space-y-1 z-50 animate-gentle-fade">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#86868b] px-2.5 pt-1 pb-0.5 block">
                        Ferramentas de Gestão
                      </span>
                      {adminEssentialItems.map((item) => {
                        const IconComp = item.icon;
                        const active = currentScreen === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigateTo(item.id)}
                            className={`w-full px-2.5 py-2 rounded-2xl text-left flex items-center gap-3 transition-colors cursor-pointer ${
                              active
                                ? 'bg-[#1d1d1f] text-white'
                                : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                active ? 'bg-white/15 text-white' : item.tintClass
                              }`}
                            >
                              <IconComp className="w-4 h-4 stroke-[2]" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold block truncate">
                                {item.label}
                              </span>
                              <span
                                className={`text-[11px] block truncate ${
                                  active ? 'text-white/75' : 'text-[#6e6e73]'
                                }`}
                              >
                                {item.subtitle}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </nav>
          )}

          {/* Zona 3: Ações Essenciais & Perfil */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Busca Rápida */}
            {onOpenSpotlightSearch && (
              <button
                type="button"
                onClick={onOpenSpotlightSearch}
                aria-label="Buscar aluno ou turma"
                title="Buscar aluno ou turma (⌘K)"
                className="h-8 w-8 sm:w-auto sm:px-3 rounded-full sm:rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#1d1d1f] font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-[#48484a] stroke-[2.1]" />
                <span className="hidden sm:inline text-xs font-medium text-[#1d1d1f]">Buscar</span>
              </button>
            )}

            {/* Status da Nuvem */}
            <button
              type="button"
              onClick={handleCloudFlushClick}
              disabled={isFlushingCloud}
              aria-label="Status de sincronização na nuvem"
              title={
                syncSnapshot.pendingCount > 0
                  ? `${syncSnapshot.pendingCount} pendente(s). Toque para sincronizar.`
                  : 'Dados sincronizados automaticamente na nuvem'
              }
              className={`h-8 rounded-full sm:rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                syncSnapshot.pendingCount > 0
                  ? 'px-2.5 bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a]'
                  : 'w-8 sm:w-auto sm:px-2.5 bg-[#eaf6ef] text-[#005035] hover:bg-[#d5efe0]'
              }`}
            >
              {isFlushingCloud || syncSnapshot.status === 'syncing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071e3]" />
              ) : syncSnapshot.pendingCount > 0 ? (
                <CloudUpload className="w-3.5 h-3.5 text-[#b45309]" />
              ) : (
                <CloudCheck className="w-3.5 h-3.5 text-[#047857]" />
              )}
              {syncSnapshot.pendingCount > 0 ? (
                <span className="text-[11px] tabular-nums">{syncSnapshot.pendingCount}</span>
              ) : (
                <span className="hidden xl:inline text-[11px]">Sincronizado</span>
              )}
            </button>

            {/* Notificações Push (FCM) */}
            <PushNotificationCenter
              visibleClasses={visibleClasses}
              allClasses={allClasses}
              userRole={userRole}
              userEmail={userEmail}
              userName={userName}
              assignedClassIds={assignedClassIds}
              attendanceWindowConfig={attendanceWindowConfig}
              onNavigateScreen={(targetScreen, targetClassId) => {
                if (targetClassId && onSelectClassById) {
                  onSelectClassById(targetClassId);
                }
                navigateTo(targetScreen);
              }}
            />

            {/* Perfil do Usuário */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProfileMenu((prev) => !prev)}
                aria-label="Menu do perfil e sair"
                className="h-8 pl-1 pr-1.5 sm:pr-2.5 rounded-full sm:rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <StudentAvatar
                  name={userName || userEmail || 'Educador'}
                  size="sm"
                  className="w-6 h-6 text-[10px]"
                />
                <span className="hidden sm:inline text-xs font-semibold text-[#1d1d1f] max-w-[90px] truncate">
                  {roleShortLabel}
                </span>
                <ChevronDown className="hidden sm:inline w-3.5 h-3.5 text-[#6e6e73]" />
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2.5 w-72 bg-white/98 backdrop-blur-2xl rounded-3xl shadow-[0_18px_48px_rgba(0,0,0,0.16)] p-2.5 z-50 animate-gentle-fade space-y-1.5">
                    <div className="p-3 rounded-2xl bg-[#f5f5f7] flex items-center gap-3">
                      <StudentAvatar
                        name={userName || userEmail || 'Educador'}
                        size="md"
                        className="w-10 h-10 text-sm shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#1d1d1f] truncate">
                          {userName || 'Professor(a)'}
                        </p>
                        <p className="text-[11px] text-[#0071e3] truncate">
                          {userEmail || 'emebjfreitas@jundiai.sp.gov.br'}
                        </p>
                        <p className="text-[10px] text-[#6e6e73] mt-0.5">
                          {isAdmin
                            ? 'Direção / Administração'
                            : teacherRoleType === 'aee'
                            ? 'Educação Especial (AEE)'
                            : teacherRoleType === 'apoio'
                            ? 'Apoio Pedagógico'
                            : userRole === 'usuario'
                            ? 'Docente Regente (PEB I)'
                            : 'Docente Especialista (PEB II)'}
                        </p>
                      </div>
                    </div>

                    {!isAdmin &&
                      onRestoreAdminRole &&
                      userEmail?.trim().toLowerCase().startsWith('emebjfreitas@') && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowProfileMenu(false);
                            onRestoreAdminRole();
                          }}
                          className="w-full text-left px-3 py-2 rounded-2xl text-xs text-[#0071e3] hover:bg-[#e8f0fe] flex items-center gap-2.5 cursor-pointer font-semibold transition-colors"
                        >
                          <UserCog className="w-4 h-4 shrink-0" />
                          <span>Voltar ao Perfil Administrador</span>
                        </button>
                      )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => navigateTo('usuarios_acesso')}
                        className="w-full text-left px-3 py-2 rounded-2xl text-xs text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-2.5 cursor-pointer font-medium transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#48484a] shrink-0" />
                        <span>Acessos &amp; Segurança</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowLogoutSheet(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-2xl text-xs text-[#b91c1c] hover:bg-[#fee2e2]/70 flex items-center gap-2.5 cursor-pointer font-semibold transition-colors"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Encerrar Sessão</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Modal de Saída Segura */}
      {showLogoutSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-gentle-fade"
          onClick={() => !isLoggingOut && setShowLogoutSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] bg-white rounded-3xl shadow-2xl overflow-hidden text-center p-6 space-y-4"
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-[#f2f2f7] flex items-center justify-center">
              <StudentAvatar
                name={userName || userEmail || 'Educador'}
                size="md"
                className="w-12 h-12 text-base"
              />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[#1d1d1f]">
                Encerrar Sessão Institucional?
              </h2>
              <p className="text-xs text-[#6e6e73]">
                {userName || userEmail} · {SCHOOL_NAME}
              </p>
            </div>

            <div
              className={`p-3 rounded-2xl text-left flex items-center gap-2.5 ${
                syncSnapshot.pendingCount > 0
                  ? 'bg-[#fef3c7] text-[#92400e]'
                  : 'bg-[#f5f5f7] text-[#1d1d1f]'
              }`}
            >
              {syncSnapshot.pendingCount > 0 ? (
                <CloudUpload className="w-4 h-4 text-[#b45309] shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[#047857] shrink-0" />
              )}
              <div className="min-w-0 text-xs">
                {syncSnapshot.pendingCount > 0 ? (
                  <span>
                    Sincronizando <strong>{syncSnapshot.pendingCount} registro(s)</strong> com a
                    nuvem...
                  </span>
                ) : (
                  <span>Todos os registros de faltas estão salvos na nuvem.</span>
                )}
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleConfirmLogoutWithFlush}
                className="w-full h-11 text-xs sm:text-sm font-semibold rounded-2xl bg-[#dc2626] hover:bg-[#b91c1c] text-white transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" />
                <span>{isLoggingOut ? 'Salvando e Saindo...' : 'Sim, Encerrar Sessão'}</span>
              </button>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutSheet(false)}
                className="w-full h-10 text-xs sm:text-sm font-medium rounded-2xl text-[#48484a] hover:bg-[#f5f5f7] transition-colors cursor-pointer"
              >
                Continuar Conectado
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
