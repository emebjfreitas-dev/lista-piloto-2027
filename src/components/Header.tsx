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
import { PWAInstallButton } from './PWAInstallButton';
import {
  subscribeToSyncStatus,
  SyncStatusSnapshot,
} from '../services/firebaseSync';
import { flushPendingOfflineQueue } from '../services/db';
import { ModalPortal } from './ui/ModalPortal';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

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
  instantSheetSyncStatus?: 'idle' | 'syncing' | 'synced';
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
  instantSheetSyncStatus = 'idle',
  onRestoreAdminRole,
  onChangeScreen,
  onSelectClassById,
  onOpenSpotlightSearch,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  useModalScrollLock(showLogoutSheet);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isFlushingCloud, setIsFlushingCloud] = useState(false);
  const [showAdminNavDropdown, setShowAdminNavDropdown] = useState(false);

  const adminMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showAdminNavDropdown || showProfileMenu) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAdminNavDropdown, showProfileMenu]);

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
      id: userRole === 'usuario' ? 'detalhes' : 'turmas',
      label: userRole === 'usuario' ? 'Minha Turma' : 'Turmas',
      activeMatch: currentScreen === 'turmas' || currentScreen === 'detalhes',
      icon: Users,
    },
    ...(userRole !== 'peb2'
      ? [
          {
            id: 'frequencia_mensal' as ScreenType,
            label: 'Informar faltas do mês…',
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
      id: 'bolsa_familia',
      label: 'Bolsa Família',
      subtitle: 'Estudantes beneficiados e frequência LDB',
      icon: HeartHandshake,
      tintClass: 'bg-amber-500/12 text-amber-700',
    },
    {
      id: 'usuarios_acesso',
      label: 'Central Administrativa',
      subtitle: 'Acessos, ano letivo (200 dias), segurança e uploads',
      icon: ShieldCheck,
      tintClass: 'bg-[#0b3b8c]/10 text-[#0b3b8c]',
    },
  ];

  const isAdminScreenActive = [
    'bolsa_familia',
    'usuarios_acesso',
    'dias_letivos',
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
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-white/92 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(15,23,42,0.08)]">
        <div className="h-16 px-3 sm:px-5 lg:px-6 max-w-[1600px] mx-auto flex items-center justify-between gap-2 lg:gap-4 xl:gap-6 min-w-0">
          {/* Zona 1: Identidade Institucional (flexível com min-w-0 para nunca empurrar o perfil para fora da tela) */}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group select-none min-w-0 shrink text-left min-h-[44px]"
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
              className="w-8 h-8 object-contain shrink-0"
            />
            <span className="text-[13.5px] sm:text-[14px] xl:text-[15.5px] font-semibold tracking-[-0.02em] text-[#0b3b8c] group-hover:text-[#1d4ed8] transition-colors truncate">
              Lista Piloto Candelário 2027
            </span>
          </button>

          {/* Zona 2: Navegação Principal Limpa com alinhamento equilibrado (lg+) */}
          {onChangeScreen && (
            <nav
              aria-label="Navegação Principal"
              className="hidden lg:flex items-center gap-0.5 xl:gap-1.5 h-full shrink-0"
            >
              {primaryNavItems.map((item) => {
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    aria-current={item.activeMatch ? 'page' : undefined}
                    className={`relative h-9 px-2 xl:px-3 rounded-xl text-[12.5px] xl:text-[13.5px] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      item.activeMatch
                        ? 'text-[#0b3b8c] font-semibold bg-[#0b3b8c]/[0.07] after:content-[""] after:absolute after:-bottom-1 after:inset-x-2.5 after:h-[2px] after:bg-[#0b3b8c] after:rounded-full'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/80 font-medium'
                    }`}
                  >
                    <IconComp
                      className={`w-[17px] h-[17px] shrink-0 ${
                        item.activeMatch ? 'text-[#0b3b8c] stroke-[1.8]' : 'text-slate-700 stroke-[1.6]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {/* Menu Gestão (Apenas Admin) */}
              {isAdmin && (
                <div className="relative" ref={adminMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminNavDropdown((prev) => !prev);
                      setShowProfileMenu(false);
                    }}
                    aria-expanded={showAdminNavDropdown}
                    className={`relative h-9 px-2 xl:px-3 rounded-xl text-[12.5px] xl:text-[13.5px] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isAdminScreenActive || showAdminNavDropdown
                        ? 'text-[#0b3b8c] font-semibold bg-[#0b3b8c]/[0.07] after:content-[""] after:absolute after:-bottom-1 after:inset-x-2.5 after:h-[2px] after:bg-[#0b3b8c] after:rounded-full'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/80 font-medium'
                    }`}
                  >
                    <SlidersHorizontal
                      className={`w-[17px] h-[17px] shrink-0 ${
                        isAdminScreenActive || showAdminNavDropdown
                          ? 'text-[#0b3b8c] stroke-[1.8]'
                          : 'text-slate-700 stroke-[1.6]'
                      }`}
                    />
                    <span>Gestão</span>
                    {syncSnapshot.pendingCount > 0 && (
                      <span
                        className="w-2 h-2 rounded-full bg-amber-600 shrink-0"
                        title={`${syncSnapshot.pendingCount} pendente(s)`}
                      />
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-700 stroke-[1.7] transition-transform duration-150 ${
                        showAdminNavDropdown ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showAdminNavDropdown && (
                    <div className="absolute right-0 mt-2.5 w-[min(22rem,calc(100vw-1.5rem))] bg-white rounded-3xl shadow-[0_24px_56px_rgba(2,6,23,0.26),0_4px_14px_rgba(2,6,23,0.12)] p-3 space-y-2 z-50 animate-apple-pop">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 px-3 pt-1 pb-0.5 block">
                        Ferramentas de Gestão
                      </span>
                      <div className="space-y-1">
                        {adminEssentialItems.map((item) => {
                          const IconComp = item.icon;
                          const active =
                            currentScreen === item.id ||
                            (item.id === 'usuarios_acesso' &&
                              (currentScreen === 'dias_letivos' ||
                                currentScreen === 'diagnostico_bd' ||
                                currentScreen === 'importar_deficiencias_htm'));
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => navigateTo(item.id)}
                              className={`w-full px-3 py-2.5 rounded-2xl text-left flex items-center gap-3 transition-all duration-200 cursor-pointer min-w-0 ${
                                active
                                  ? 'bg-[#0b3b8c] text-white shadow-[0_6px_16px_rgba(11,59,140,0.28)]'
                                  : 'text-slate-950 hover:bg-[#edf2f7]'
                              }`}
                            >
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  active ? 'bg-white/20 text-white' : item.tintClass
                                }`}
                              >
                                <IconComp className="w-[18px] h-[18px] stroke-[1.7]" />
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
                      </div>

                      {/* Controle de Sincronização em Nuvem dentro de Gestão */}
                      <div className="pt-1">
                        <div
                          className={`p-3 rounded-2xl flex items-center justify-between gap-2.5 min-w-0 ${
                            syncSnapshot.pendingCount > 0
                              ? 'bg-amber-50/90 text-amber-950'
                              : 'bg-slate-50 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {isFlushingCloud ||
                            syncSnapshot.status === 'syncing' ||
                            instantSheetSyncStatus === 'syncing' ? (
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
                              <span className="text-[11px] text-slate-600 block break-words">
                                Envio automático ativo
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleCloudFlushClick}
                            disabled={isFlushingCloud}
                            className="min-h-[34px] px-3 py-1.5 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white text-xs font-semibold cursor-pointer shrink-0 transition-colors disabled:opacity-50"
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

          {/* Zona 3: Ações Rápidas e Perfil (sempre perfeitamente visível dentro do viewport) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton variant="header" />

            {onOpenSpotlightSearch && (
              <button
                type="button"
                onClick={onOpenSpotlightSearch}
                aria-label="Buscar aluno ou turma"
                title="Buscar aluno ou turma (⌘K)"
                className="h-9 w-9 xl:w-auto xl:px-3 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 hover:text-slate-950 font-medium text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Search className="w-[17px] h-[17px] text-slate-600 stroke-[1.5]" />
                <span className="hidden xl:inline">Buscar</span>
              </button>
            )}

            <PushNotificationCenter
              visibleClasses={visibleClasses}
              allClasses={allClasses}
              userRole={userRole}
              teacherRoleType={teacherRoleType}
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

            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu((prev) => !prev);
                  setShowAdminNavDropdown(false);
                }}
                aria-label="Menu do perfil e sair"
                className="h-9 pl-1.5 pr-2 sm:pr-2.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <StudentAvatar
                  name={userName || userEmail || 'Educador'}
                  size="xs"
                  expandableOnClick={false}
                  className="w-6 h-6 text-[11px] rounded-lg bg-[#0b3b8c]/15 text-[#092e70]"
                />
                <span className="hidden sm:inline text-[13px] font-semibold text-slate-900 max-w-[78px] truncate">
                  {roleShortLabel}
                </span>
                <ChevronDown className="hidden sm:inline w-3.5 h-3.5 text-slate-700 stroke-[1.7]" />
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2.5 w-[min(20rem,calc(100vw-1.5rem))] bg-white rounded-3xl shadow-[0_24px_56px_rgba(2,6,23,0.26),0_4px_14px_rgba(2,6,23,0.12)] p-3 z-50 animate-apple-pop space-y-2">
                    <div className="p-3 rounded-2xl bg-[#edf2f7] flex items-center gap-3 min-w-0">
                      <StudentAvatar
                        name={userName || userEmail || 'Educador'}
                        size="sm"
                        expandableOnClick={false}
                        className="w-10 h-10 text-sm shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-950 break-words leading-snug">
                          {userName || 'Professor(a)'}
                        </p>
                        <p className="text-xs font-semibold text-[#0047b3] break-all leading-snug mt-0.5">
                          {userEmail || ''}
                        </p>
                        <p className="text-xs font-medium text-slate-700 mt-0.5">
                          {isAdmin
                            ? 'Equipe Administrativa'
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
                        <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0" />
                        <span>Central Administrativa</span>
                      </button>
                    )}

                    <PWAInstallButton variant="menu" />

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
        <ModalPortal>
          <div
            className="fixed inset-0 z-[130] overflow-hidden bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-backdrop-in"
            onClick={() => !isLoggingOut && setShowLogoutSheet(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] bg-white rounded-3xl shadow-[0_28px_68px_rgba(2,6,23,0.45)] overflow-hidden text-center p-6 space-y-4 animate-apple-pop"
            >
              <div className="mx-auto w-14 h-14 rounded-full bg-[#f2f2f7] flex items-center justify-center">
                <StudentAvatar
                  name={userName || userEmail || 'Educador'}
                  size="md"
                  expandableOnClick={false}
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
        </ModalPortal>
      )}
    </>
  );
};
