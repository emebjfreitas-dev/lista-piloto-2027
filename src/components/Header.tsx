import React, { useState, useEffect } from 'react';
import { ClassGroup, ScreenType, UserRole } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME } from '../data/mockData';
import { StudentAvatar } from './StudentAvatar';
import { PushNotificationCenter } from './PushNotificationCenter';
import {
  getAccessToken,
  getDriveAuthState,
  googleSignIn,
  initAuth,
} from '../services/googleSheetsApi';
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
  visibleClasses?: ClassGroup[];
  allClasses?: ClassGroup[];
  onRestoreAdminRole?: () => void;
  onBack?: () => void;
  onChangeScreen?: (screen: ScreenType) => void;
  onSelectClassById?: (classId: string) => void;
  onOpenSpotlightSearch?: () => void;
  onQuickSyncDriveNow?: () => Promise<void>;
  onNavigatePlanilha: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  title,
  userEmail,
  userName,
  userRole = 'admin',
  visibleClasses = [],
  allClasses = [],
  onRestoreAdminRole,
  onBack,
  onChangeScreen,
  onSelectClassById,
  onOpenSpotlightSearch,
  onQuickSyncDriveNow,
  onNavigatePlanilha,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [hasDriveToken, setHasDriveToken] = useState(false);
  const [isDriveTokenExpired, setIsDriveTokenExpired] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [showAdminNavDropdown, setShowAdminNavDropdown] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

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
    let mounted = true;
    const checkTokenState = async () => {
      const t = await getAccessToken();
      const authState = getDriveAuthState();
      if (mounted) {
        setHasDriveToken(Boolean(t));
        setIsDriveTokenExpired(authState.isExpired);
      }
    };
    checkTokenState();
    const timer = window.setInterval(checkTokenState, 15000);
    const unsub = initAuth(
      () => {
        if (mounted) {
          setHasDriveToken(true);
          setIsDriveTokenExpired(false);
        }
      },
      () => {
        if (mounted) setHasDriveToken(false);
      }
    );
    return () => {
      mounted = false;
      window.clearInterval(timer);
      unsub();
    };
  }, [currentScreen]);

  const handleDriveSyncButtonClick = async () => {
    if (isSyncingDrive) return;
    setIsSyncingDrive(true);
    try {
      if (syncSnapshot.pendingCount > 0) {
        await flushPendingOfflineQueue();
      }
      let token = await getAccessToken();
      if (!token) {
        const res = await googleSignIn();
        token = res?.accessToken || (await getAccessToken());
      }
      if (token) {
        setHasDriveToken(true);
        setIsDriveTokenExpired(false);
        if (onQuickSyncDriveNow) {
          await onQuickSyncDriveNow();
        }
      }
    } catch (err) {
      console.warn('Aviso ao sincronizar Google Drive:', err);
    } finally {
      setIsSyncingDrive(false);
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

  const isAdmin = userRole === 'admin';

  const navigateTo = (screen: ScreenType) => {
    setShowAdminNavDropdown(false);
    setIsMobileDrawerOpen(false);
    setShowProfileMenu(false);
    onChangeScreen?.(screen);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="h-14 px-3 sm:px-6 lg:px-8 max-w-[1600px] mx-auto flex items-center justify-between gap-3">
          {/* Zona 1: Identidade Institucional */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">

            <div
              onClick={() => navigateTo('home')}
              className="flex items-center gap-2 cursor-pointer group select-none shrink-0"
              title="Ir para a Página Inicial"
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
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors whitespace-nowrap">
                  Lista Piloto 2027
                </span>
                <span className="text-slate-400 font-light hidden sm:inline" aria-hidden="true">·</span>
                <span className="text-xs text-slate-500 font-normal hidden sm:inline whitespace-nowrap">
                  EMEB Candelário
                </span>
              </div>
            </div>
          </div>

          {/* Zona 2: Navegação Horizontal Limpa (Desktop) */}
          {onChangeScreen && (
            <nav
              aria-label="Navegação Principal"
              className="hidden xl:flex items-center gap-1 shrink-0"
            >
              {/* Início */}
              <button
                type="button"
                onClick={() => navigateTo('home')}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentScreen === 'home'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">home</span>
                <span>Início</span>
              </button>

              {/* Turmas */}
              <button
                type="button"
                onClick={() => navigateTo('turmas')}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentScreen === 'turmas' || currentScreen === 'detalhes'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">groups</span>
                <span>Turmas</span>
              </button>

              {/* Informar Faltas do Mês (PEB I e Admin) */}
              {userRole !== 'peb2' && (
                <button
                  type="button"
                  onClick={() => navigateTo('frequencia_mensal')}
                  title="Informar faltas do mês de referência"
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    currentScreen === 'frequencia_mensal'
                      ? 'bg-slate-100 text-slate-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">checklist</span>
                  <span>Faltas do Mês</span>
                </button>
              )}

              {/* Busca Ativa */}
              <button
                type="button"
                onClick={() => navigateTo('faltas_consecutivas')}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentScreen === 'faltas_consecutivas'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">warning</span>
                <span>Busca Ativa</span>
              </button>

              {/* Rotas */}
              <button
                type="button"
                onClick={() => navigateTo('mapa_estudantes')}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentScreen === 'mapa_estudantes'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">map</span>
                <span>Rotas</span>
              </button>

              {/* Gestão (Admin) */}
              {isAdmin && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAdminNavDropdown((prev) => !prev)}
                    className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      [
                        'resumo',
                        'bolsa_familia',
                        'planilha',
                        'usuarios_acesso',
                        'dias_letivos',
                      ].includes(currentScreen) || showAdminNavDropdown
                        ? 'bg-slate-100 text-slate-900 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <span>Gestão</span>
                    <span className="material-symbols-outlined text-[15px]">expand_more</span>
                  </button>

                  {showAdminNavDropdown && (
                    <div
                      className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl border border-slate-200/90 shadow-lg p-1 space-y-0.5 z-50 animate-in fade-in duration-100"
                      onMouseLeave={() => setShowAdminNavDropdown(false)}
                    >
                      <button
                        type="button"
                        onClick={() => navigateTo('resumo')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'resumo'
                            ? 'bg-slate-100 text-slate-900 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-slate-500">
                          bar_chart
                        </span>
                        <span>Resumo Mensal MEC</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigateTo('bolsa_familia')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'bolsa_familia'
                            ? 'bg-slate-100 text-slate-900 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-slate-500">
                          volunteer_activism
                        </span>
                        <span>Bolsa Família &amp; Fretado</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigateTo('dias_letivos')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'dias_letivos'
                            ? 'bg-slate-100 text-slate-900 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-slate-500">
                          calendar_month
                        </span>
                        <span>200 Dias Letivos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigateTo('usuarios_acesso')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'usuarios_acesso'
                            ? 'bg-slate-100 text-slate-900 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-slate-500">
                          group_add
                        </span>
                        <span>Professores &amp; Acessos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigateTo('planilha')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'planilha'
                            ? 'bg-slate-100 text-slate-900 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-slate-500">
                          table_chart
                        </span>
                        <span>Planilha Google &amp; Fotos</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </nav>
          )}

          {/* Zona 3: Ações Rápidas & Perfil */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Busca Rápida Spotlight */}
            {onOpenSpotlightSearch && (
              <button
                type="button"
                onClick={onOpenSpotlightSearch}
                title="Busca Global (Ctrl+K ou ⌘K)"
                className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">search</span>
                <span className="hidden md:inline text-xs font-normal">Buscar</span>
                <kbd className="hidden lg:inline-block px-1 py-0.2 rounded bg-white text-slate-400 text-[10px] font-mono border border-slate-200">
                  ⌘K
                </kbd>
              </button>
            )}

            {/* Sincronização Unificada em Botão Discreto */}
            <button
              type="button"
              onClick={handleDriveSyncButtonClick}
              disabled={isSyncingDrive}
              title={
                syncSnapshot.pendingCount > 0
                  ? `${syncSnapshot.pendingCount} alteração(ões) pendente(s). Clique para salvar na nuvem agora.`
                  : hasDriveToken
                  ? 'Nuvem conectada e sincronizada. Clique para atualizar fotos e planilha.'
                  : 'Conectar ao Google Drive institucional'
              }
              className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-normal border transition-colors cursor-pointer ${
                syncSnapshot.pendingCount > 0
                  ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  : 'bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[16px] ${
                  isSyncingDrive || syncSnapshot.status === 'syncing'
                    ? 'animate-spin text-blue-600'
                    : ''
                }`}
              >
                {syncSnapshot.pendingCount > 0
                  ? 'cloud_upload'
                  : hasDriveToken
                  ? 'cloud_done'
                  : 'cloud'}
              </span>
              {syncSnapshot.pendingCount > 0 ? (
                <span className="font-medium text-[11px]">{syncSnapshot.pendingCount} pendente(s)</span>
              ) : (
                <span className="hidden lg:inline text-[11px] text-slate-500">Drive</span>
              )}
            </button>

            {/* Notificações Push */}
            <PushNotificationCenter
              visibleClasses={visibleClasses}
              allClasses={allClasses}
              userRole={userRole}
              userName={userName}
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
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                aria-label="Menu do perfil e sair"
                className="h-9 pl-1 pr-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <StudentAvatar
                  name={userName || userEmail || 'Educador'}
                  size="sm"
                  className="w-7 h-7 text-xs"
                />
                <span className="hidden sm:inline text-xs font-semibold text-slate-800 max-w-[90px] truncate">
                  {userRole === 'admin' ? 'Admin' : userRole === 'usuario' ? 'PEB I' : 'PEB II'}
                </span>
                <span className="material-symbols-outlined text-[16px] text-slate-500">
                  expand_more
                </span>
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-3 rounded-xl bg-slate-50 flex items-center gap-3">
                      <StudentAvatar
                        name={userName || userEmail || 'Educador'}
                        size="md"
                        className="w-10 h-10 text-sm shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {userName || 'Professor(a)'}
                        </p>
                        <p className="text-[11px] font-mono text-blue-700 truncate">
                          {userEmail || 'emebjfreitas@educacao.jundiai.sp.gov.br'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {userRole === 'admin'
                            ? 'Direção / Administração'
                            : userRole === 'usuario'
                            ? 'Docente Regente (PEB I)'
                            : 'Docente Especialista (PEB II)'}
                        </p>
                      </div>
                    </div>

                    <div className="px-3 py-2 flex items-center justify-between text-xs text-slate-600">
                      <span>Status da Nuvem</span>
                      <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            syncSnapshot.pendingCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        />
                        {syncSnapshot.pendingCount > 0
                          ? `${syncSnapshot.pendingCount} pendente(s)`
                          : 'Sincronizado'}
                      </span>
                    </div>

                    <div className="my-1 border-t border-slate-100" />

                    {!isAdmin &&
                      onRestoreAdminRole &&
                      userEmail?.trim().toLowerCase().startsWith('emebjfreitas@') && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowProfileMenu(false);
                            onRestoreAdminRole();
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs text-blue-700 hover:bg-blue-50 flex items-center gap-2 cursor-pointer font-semibold transition-colors"
                        >
                          <span className="material-symbols-outlined text-[17px]">
                            admin_panel_settings
                          </span>
                          <span>Voltar ao Perfil Administrador</span>
                        </button>
                      )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => navigateTo('usuarios_acesso')}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-colors"
                      >
                        <span className="material-symbols-outlined text-[17px] text-slate-500">
                          manage_accounts
                        </span>
                        <span>Professores &amp; Acessos</span>
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          onNavigatePlanilha();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-colors"
                      >
                        <span className="material-symbols-outlined text-[17px] text-slate-500">
                          table_chart
                        </span>
                        <span>Planilha Google &amp; Drive</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowLogoutSheet(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-rose-700 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-semibold transition-colors mt-0.5"
                    >
                      <span className="material-symbols-outlined text-[17px]">logout</span>
                      <span>Encerrar Sessão</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Botão Hambúrguer Mobile/Tablet */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Abrir menu de navegação"
              className="h-8 w-8 rounded-lg bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 flex items-center justify-center cursor-pointer transition-colors xl:hidden"
              title="Abrir Menu"
            >
              <span className="material-symbols-outlined text-[18px]">menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Drawer Lateral Mobile & Tablet (Zero corte, zero sobreposição) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 xl:hidden animate-in fade-in duration-150">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-xs bg-white shadow-2xl p-4 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="space-y-4">
              {/* Header do Drawer */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <img
                    src={APP_LOGO_URL}
                    alt="Logo"
                    className="w-7 h-7 object-contain"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = APP_LOGO_FALLBACK_URL;
                    }}
                  />
                  <span className="font-bold text-sm text-slate-900">Navegação Principal</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Links Principais */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block px-2 py-1">
                  Módulos
                </span>

                <button
                  type="button"
                  onClick={() => navigateTo('home')}
                  className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-semibold flex items-center gap-3 transition-colors ${
                    currentScreen === 'home'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">home</span>
                  <span>Início (Painel Geral)</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('turmas')}
                  className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-semibold flex items-center gap-3 transition-colors ${
                    currentScreen === 'turmas' || currentScreen === 'detalhes'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">groups</span>
                  <span>Turmas &amp; Alunos</span>
                </button>

                {userRole !== 'peb2' && (
                  <button
                    type="button"
                    onClick={() => navigateTo('frequencia_mensal')}
                    className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-semibold flex items-center gap-3 transition-colors ${
                      currentScreen === 'frequencia_mensal'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">checklist</span>
                    <span>Informar Faltas do Mês</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigateTo('faltas_consecutivas')}
                  className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-semibold flex items-center gap-3 transition-colors ${
                    currentScreen === 'faltas_consecutivas'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">warning</span>
                  <span>Busca Ativa (Alertas)</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('mapa_estudantes')}
                  className={`w-full px-3 py-2.5 rounded-xl text-left text-xs sm:text-sm font-semibold flex items-center gap-3 transition-colors ${
                    currentScreen === 'mapa_estudantes'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">map</span>
                  <span>Mapa &amp; Rotas dos Ônibus</span>
                </button>
              </div>

              {/* Seção de Gestão (Admin) */}
              {isAdmin && (
                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block px-2 py-1">
                    Gestão Escolar
                  </span>

                  <button
                    type="button"
                    onClick={() => navigateTo('resumo')}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2.5 transition-colors ${
                      currentScreen === 'resumo'
                        ? 'bg-blue-50 text-blue-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">bar_chart</span>
                    <span>Resumo Mensal MEC</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('bolsa_familia')}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2.5 transition-colors ${
                      currentScreen === 'bolsa_familia'
                        ? 'bg-blue-50 text-blue-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
                    <span>Bolsa Família &amp; Fretado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('dias_letivos')}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2.5 transition-colors ${
                      currentScreen === 'dias_letivos'
                        ? 'bg-blue-50 text-blue-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                    <span>200 Dias Letivos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('usuarios_acesso')}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2.5 transition-colors ${
                      currentScreen === 'usuarios_acesso'
                        ? 'bg-blue-50 text-blue-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">group_add</span>
                    <span>Professores &amp; Acessos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('planilha')}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2.5 transition-colors ${
                      currentScreen === 'planilha'
                        ? 'bg-blue-50 text-blue-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">table_chart</span>
                    <span>Planilha Google &amp; Fotos</span>
                  </button>
                </div>
              )}
            </div>

            {/* Rodapé do Drawer */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="px-2 py-1 flex items-center justify-between text-xs text-slate-500">
                <span>{userName}</span>
                <span className="font-semibold text-slate-800">
                  {userRole === 'admin' ? 'Admin' : userRole === 'usuario' ? 'PEB I' : 'PEB II'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  setShowLogoutSheet(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                <span>Encerrar Sessão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Saída Segura */}
      {showLogoutSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => !isLoggingOut && setShowLogoutSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-center p-6 space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <StudentAvatar
                name={userName || userEmail || 'Educador'}
                size="md"
                className="w-12 h-12 text-base"
              />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Encerrar Sessão Institucional?
              </h2>
              <p className="text-xs text-slate-500">
                {userName || userEmail} · {SCHOOL_NAME}
              </p>
            </div>

            {/* Verificador de sincronização pendente */}
            <div
              className={`p-3 rounded-xl text-left flex items-center gap-2.5 ${
                syncSnapshot.pendingCount > 0
                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                  : 'bg-slate-50 text-slate-700 border border-slate-200'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[20px] shrink-0 ${
                  syncSnapshot.pendingCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {syncSnapshot.pendingCount > 0 ? 'cloud_upload' : 'check_circle'}
              </span>
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
                className="w-full h-11 text-xs sm:text-sm font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                <span>{isLoggingOut ? 'Salvando e Saindo...' : 'Sim, Encerrar Sessão'}</span>
              </button>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutSheet(false)}
                className="w-full h-10 text-xs sm:text-sm font-medium rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
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
