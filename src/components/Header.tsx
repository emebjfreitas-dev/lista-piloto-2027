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
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-white/98 backdrop-blur-xl shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
        <div className="h-16 px-3.5 sm:px-6 lg:px-8 max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4 min-w-0">
          {/* Zona 1: Identidade Institucional */}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none min-w-0 text-left min-h-[44px]"
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
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0"
            />
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5 min-w-0 leading-tight">
              <span className="text-[15px] sm:text-base font-extrabold tracking-tight text-[#0b3b8c] group-hover:text-[#0052cc] transition-colors truncate">
                Candelário Gestão
              </span>
              <span className="text-slate-400 font-light hidden md:inline" aria-hidden="true">
                ·
              </span>
              <span className="text-[11px] sm:text-[13px] text-slate-600 font-semibold hidden sm:inline whitespace-nowrap">
                EMEB Candelário
              </span>
            </div>
          </button>

          {/* Zona 2: Navegação Principal Enxuta (Desktop & Tablet Paisagem lg+) */}
          {onChangeScreen && (
            <nav
              aria-label="Navegação Principal"
              className="hidden lg:flex items-center gap-1 p-1.5 bg-slate-100 rounded-2xl shrink-0"
            >
              {primaryNavItems.map((item) => {
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    aria-current={item.activeMatch ? 'page' : undefined}
                    className={`min-h-[38px] px-3.5 rounded-xl text-[13px] transition-colors cursor-pointer flex items-center gap-2 ${
                      item.activeMatch
                        ? 'bg-white text-[#0b3b8c] font-bold shadow-xs'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-white/70 font-semibold'
                    }`}
                  >
                    <IconComp
                      className={`w-4 h-4 shrink-0 ${
                        item.activeMatch ? 'text-[#0052cc] stroke-[2.25]' : 'text-slate-600 stroke-[2]'
                      }`}
                    />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}

              {/* Menu Gestão (Apenas Admin — Somente Telas Essenciais + Controle de Sincronização) */}
              {isAdmin && (
                <div className="relative" ref={adminMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowAdminNavDropdown((prev) => !prev)}
                    aria-expanded={showAdminNavDropdown}
                    className={`min-h-[38px] px-3.5 rounded-xl text-[13px] transition-colors cursor-pointer flex items-center gap-2 ${
                      isAdminScreenActive || showAdminNavDropdown
                        ? 'bg-white text-[#0b3b8c] font-bold shadow-xs'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-white/70 font-semibold'
                    }`}
                  >
                    <SlidersHorizontal
                      className={`w-4 h-4 shrink-0 ${
                        isAdminScreenActive || showAdminNavDropdown
                          ? 'text-[#0052cc] stroke-[2.25]'
                          : 'text-slate-600 stroke-[2]'
                      }`}
                    />
                    <span>Gestão</span>
                    {syncSnapshot.pendingCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" title={`${syncSnapshot.pendingCount} pendente(s)`} />
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform duration-100 ${
                        showAdminNavDropdown ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showAdminNavDropdown && (
                    <div className="absolute right-0 mt-2.5 w-[min(22rem,calc(100vw-1.5rem))] bg-white rounded-3xl border border-slate-200 shadow-[0_18px_48px_rgba(15,23,42,0.16)] p-2.5 space-y-1 z-50 animate-gentle-fade">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600 px-3 pt-1 pb-0.5 block">
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
                            className={`w-full px-3 py-2.5 rounded-2xl text-left flex items-center gap-3 transition-colors cursor-pointer min-w-0 ${
                              active
                                ? 'bg-[#0b3b8c] text-white'
                                : 'text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                active ? 'bg-white/20 text-white' : item.tintClass
                              }`}
                            >
                              <IconComp className="w-5 h-5 stroke-[2]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-semibold block break-words leading-snug">
                                {item.label}
                              </span>
                              <span
                                className={`text-xs block break-words leading-snug mt-0.5 ${
                                  active ? 'text-blue-100' : 'text-slate-600'
                                }`}
                              >
                                {item.subtitle}
                              </span>
                            </div>
                          </button>
                        );
                      })}

                      {/* Controle de Sincronização em Nuvem dentro de Gestão */}
                      <div className="pt-1.5 mt-1.5">
                        <div
                          className={`p-3 rounded-2xl flex items-center justify-between gap-2.5 min-w-0 ${
                            syncSnapshot.pendingCount > 0
                              ? 'bg-amber-50 text-amber-950'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {isFlushingCloud || syncSnapshot.status === 'syncing' ? (
                              <Loader2 className="w-4 h-4 animate-spin text-[#0052cc] shrink-0" />
                            ) : syncSnapshot.pendingCount > 0 ? (
                              <CloudUpload className="w-4 h-4 text-amber-700 shrink-0" />
                            ) : (
                              <CloudCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-bold block break-words">
                                {syncSnapshot.pendingCount > 0
                                  ? `${syncSnapshot.pendingCount} pendente(s) na fila`
                                  : 'Nuvem sincronizada'}
                              </span>
                              <span className="text-xs text-slate-600 block break-words">
                                Envio automático ativo
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleCloudFlushClick}
                            disabled={isFlushingCloud}
                            className="min-h-[34px] px-3 py-1.5 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white text-xs font-bold cursor-pointer shrink-0 transition-colors disabled:opacity-50"
                          >
                            {isFlushingCloud ? 'Enviando...' : 'Sincronizar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </nav>
          )}

          {/* Zona 3: Ações Essenciais & Perfil (Sem ícone de nuvem) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Busca Rápida */}
            {onOpenSpotlightSearch && (
              <button
                type="button"
                onClick={onOpenSpotlightSearch}
                aria-label="Buscar aluno ou turma"
                title="Buscar aluno ou turma (⌘K)"
                className="h-10 w-10 sm:w-auto sm:px-3.5 rounded-full sm:rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4 text-slate-700 stroke-[2.2]" />
                <span className="hidden sm:inline text-[13px] font-semibold text-slate-900">Buscar</span>
              </button>
            )}

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
                className="h-10 pl-1.5 pr-2 sm:pr-3 rounded-full sm:rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <StudentAvatar
                  name={userName || userEmail || 'Educador'}
                  size="sm"
                  className="w-7 h-7 text-xs"
                />
                <span className="hidden sm:inline text-[13px] font-bold text-slate-900 max-w-[100px] truncate">
                  {roleShortLabel}
                </span>
                <ChevronDown className="hidden sm:inline w-4 h-4 text-slate-600" />
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2.5 w-[min(20rem,calc(100vw-1.5rem))] bg-white/98 backdrop-blur-2xl rounded-3xl shadow-[0_18px_48px_rgba(0,0,0,0.16)] p-3 z-50 animate-gentle-fade space-y-2">
                    <div className="p-3 rounded-2xl bg-[#f5f5f7] flex items-center gap-3 min-w-0">
                      <StudentAvatar
                        name={userName || userEmail || 'Educador'}
                        size="md"
                        className="w-10 h-10 text-sm shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1d1d1f] break-words leading-snug">
                          {userName || 'Professor(a)'}
                        </p>
                        <p className="text-xs text-[#0071e3] break-all leading-snug mt-0.5">
                          {userEmail || 'emebjfreitas@jundiai.sp.gov.br'}
                        </p>
                        <p className="text-xs text-[#6e6e73] mt-0.5">
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
                          className="w-full min-h-[42px] text-left px-3.5 py-2 rounded-2xl text-sm text-[#0071e3] hover:bg-[#e8f0fe] flex items-center gap-2.5 cursor-pointer font-semibold transition-colors"
                        >
                          <UserCog className="w-4 h-4 shrink-0" />
                          <span>Voltar ao Perfil Administrador</span>
                        </button>
                      )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => navigateTo('usuarios_acesso')}
                        className="w-full min-h-[42px] text-left px-3.5 py-2 rounded-2xl text-sm text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-2.5 cursor-pointer font-medium transition-colors"
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
                      className="w-full min-h-[42px] text-left px-3.5 py-2 rounded-2xl text-sm text-[#b91c1c] hover:bg-[#fee2e2]/70 flex items-center gap-2.5 cursor-pointer font-semibold transition-colors"
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
            className="w-full max-w-[400px] bg-white rounded-3xl shadow-2xl overflow-hidden text-center p-6 space-y-4 animate-apple-pop"
          >
            <div className="mx-auto w-14 h-14 rounded-full bg-[#f2f2f7] flex items-center justify-center">
              <StudentAvatar
                name={userName || userEmail || 'Educador'}
                size="md"
                className="w-14 h-14 text-base"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <h2 className="text-lg font-bold text-[#0b3b8c] break-words">
                Encerrar Sessão Institucional?
              </h2>
              <p className="text-sm text-slate-600 break-words leading-snug">
                {(() => {
                  const displayIdentity = (userName || userEmail || '').trim();
                  if (!displayIdentity) return SCHOOL_NAME;
                  const norm = displayIdentity.toLowerCase();
                  if (norm.includes('emeb') || norm.includes('candelário') || norm.includes('candelario')) {
                    return displayIdentity;
                  }
                  return `${displayIdentity} · ${SCHOOL_NAME}`;
                })()}
              </p>
            </div>

            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleConfirmLogoutWithFlush}
                className="w-full min-h-[48px] text-sm font-bold rounded-2xl bg-[#dc2626] hover:bg-[#b91c1c] text-white transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{isLoggingOut ? 'Salvando e Saindo...' : 'Sim, Encerrar Sessão'}</span>
              </button>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutSheet(false)}
                className="w-full min-h-[44px] text-sm font-semibold rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer"
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
