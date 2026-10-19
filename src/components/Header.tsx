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
  const [syncSnapshot, setSyncSnapshot] = useState<SyncStatusSnapshot>({
    status: 'synced',
    pendingCount: 0,
    lastSyncedAtISO: null,
    lastError: null,
    queue: [],
  });
  const [showAdminNavDropdown, setShowAdminNavDropdown] = useState(false);
  const [textSizePref, setTextSizePref] = useState<'normal' | 'grande' | 'extra'>(() => {
    try {
      return (localStorage.getItem('emeb_candelario_text_size_pref') as any) || 'grande';
    } catch {
      return 'grande';
    }
  });

  useEffect(() => {
    document.documentElement.classList.remove('text-size-normal', 'text-size-grande', 'text-size-extra');
    document.documentElement.classList.add(`text-size-${textSizePref}`);
    try {
      localStorage.setItem('emeb_candelario_text_size_pref', textSizePref);
    } catch {
      // ignore
    }
  }, [textSizePref]);

  const cycleTextSize = () => {
    setTextSizePref((curr) => {
      if (curr === 'normal') return 'grande';
      if (curr === 'grande') return 'extra';
      return 'normal';
    });
  };

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
      console.warn('Aviso ao conectar/sincronizar Google Drive pelo topo:', err);
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
      // proceed with logout safely
    } finally {
      setIsLoggingOut(false);
      setShowLogoutSheet(false);
      setShowProfileMenu(false);
      onLogout();
    }
  };

  if (currentScreen === 'login') return null;

  const isAdmin = userRole === 'admin';

  const showBackButton =
    currentScreen === 'frequencia_mensal' ||
    currentScreen === 'faltas_consecutivas' ||
    (currentScreen === 'detalhes' && userRole !== 'usuario') ||
    currentScreen === 'bolsa_familia' ||
    currentScreen === 'dias_letivos' ||
    currentScreen === 'mapa_estudantes' ||
    currentScreen === 'planilha' ||
    currentScreen === 'usuarios_acesso';

  const getScreenTitle = () => {
    if (title) return title;
    if (currentScreen === 'home') return 'Visão Geral & Home';
    if (currentScreen === 'frequencia_mensal') return 'Faltas do Mês';
    if (currentScreen === 'faltas_consecutivas') return 'Faltas Consecutivas';
    if (currentScreen === 'detalhes') return 'Caderneta da Turma';
    if (currentScreen === 'bolsa_familia') return 'Bolsa Família';
    if (currentScreen === 'dias_letivos') return '200 Dias Letivos';
    if (currentScreen === 'resumo') return 'Fechamento Mensal';
    if (currentScreen === 'mapa_estudantes') return 'Mapa de Trajetos & KM';
    if (currentScreen === 'planilha') return 'Sincronização Nuvem';
    if (currentScreen === 'usuarios_acesso') return 'Professores & Acessos';
    return 'Lista Piloto 2027';
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 w-full z-50 pt-safe ios-glass-top">
        <div className="h-[54px] sm:h-[60px] px-3 sm:px-6 lg:px-8 max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Brand / Back Control */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 lg:flex-1">
            {showBackButton && (
              <button
                onClick={onBack}
                aria-label="Voltar para tela anterior"
                className="h-[34px] px-2.5 sm:px-3.5 flex items-center justify-center gap-0.5 sm:gap-1 rounded-full bg-[#e8e8ed] hover:bg-[#d2d2d7] text-[#1d1d1f] font-semibold text-[0.78rem] sm:text-[0.8rem] transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                <span className="hidden xs:inline sm:inline">Voltar</span>
              </button>
            )}

            <div
              onClick={() => onChangeScreen?.('home')}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
              title="Ir para o Início"
            >
              <img
                src={APP_LOGO_URL}
                alt="Brasão Oficial de Jundiaí"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = APP_LOGO_FALLBACK_URL;
                }}
                className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0 group-hover:scale-105 transition-transform"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[0.88rem] sm:text-[0.98rem] font-bold tracking-tight text-[#1d1d1f] truncate block leading-tight group-hover:text-[#0071e3] transition-colors">
                    {showBackButton ? getScreenTitle() : 'Candelário Gestão'}
                  </span>
                  {!showBackButton && (
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[0.62rem] font-semibold bg-slate-100 text-slate-700 tracking-wide uppercase border border-slate-200/60">
                      EMEB Candelário
                    </span>
                  )}
                </div>
                <span className="hidden xl:block text-[0.65rem] font-medium text-[#6e6e73] truncate leading-none mt-0.5">
                  Gestão Escolar & Frequência 2027 · Jundiaí/SP
                </span>
              </div>
            </div>
          </div>

          {/* Zone 2: Global Navigation Links (Grandes, Legíveis e Alto Contraste) */}
          {onChangeScreen && (
            <nav
              aria-label="Navegação Principal"
              className="hidden lg:flex items-center justify-center gap-1.5 bg-[#f5f5f7] p-1.5 rounded-2xl shrink-0 border border-black/[0.06]"
            >
              <button
                type="button"
                onClick={() => onChangeScreen('home')}
                className={`h-10 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  currentScreen === 'home'
                    ? 'bg-white text-[#1d1d1f] shadow-xs border border-black/[0.08]'
                    : 'text-slate-700 hover:text-black hover:bg-white/60'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">home</span>
                <span>Início</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeScreen('turmas')}
                className={`h-10 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  currentScreen === 'turmas' || currentScreen === 'detalhes'
                    ? 'bg-white text-[#1d1d1f] shadow-xs border border-black/[0.08]'
                    : 'text-slate-700 hover:text-black hover:bg-white/60'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">groups</span>
                <span>{userRole === 'usuario' ? 'Meus Alunos' : 'Turmas'}</span>
              </button>

              {userRole !== 'peb2' && (
                <button
                  type="button"
                  onClick={() => onChangeScreen('frequencia_mensal')}
                  className={`h-10 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    currentScreen === 'frequencia_mensal'
                      ? 'bg-white text-[#1d1d1f] shadow-xs border border-black/[0.08]'
                      : 'text-slate-700 hover:text-black hover:bg-white/60'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">checklist</span>
                  <span>Fazer Chamada</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onChangeScreen('faltas_consecutivas')}
                className={`h-10 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  currentScreen === 'faltas_consecutivas'
                    ? 'bg-white text-[#1d1d1f] shadow-xs border border-black/[0.08]'
                    : 'text-slate-700 hover:text-black hover:bg-white/60'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">notification_important</span>
                <span>Alertas</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeScreen('mapa_estudantes')}
                className={`h-10 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  currentScreen === 'mapa_estudantes'
                    ? 'bg-white text-[#1d1d1f] shadow-xs border border-black/[0.08]'
                    : 'text-slate-700 hover:text-black hover:bg-white/60'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">directions_bus</span>
                <span>Ônibus / Mapa</span>
              </button>

              {isAdmin && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAdminNavDropdown((prev) => !prev)}
                    className={`h-8 px-3 rounded-xl font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                      ['resumo', 'bolsa_familia', 'planilha', 'usuarios_acesso'].includes(currentScreen) || showAdminNavDropdown
                        ? 'bg-white text-[#1d1d1f] font-semibold shadow-xs'
                        : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                    }`}
                  >
                    <span>Gestão</span>
                    <span className="material-symbols-outlined text-[15px]">expand_more</span>
                  </button>

                  {showAdminNavDropdown && (
                    <div
                      className="absolute left-0 mt-1.5 w-52 bg-white rounded-2xl border border-black/[0.08] shadow-lg p-1.5 space-y-0.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                      onMouseLeave={() => setShowAdminNavDropdown(false)}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminNavDropdown(false);
                          onChangeScreen('resumo');
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'resumo'
                            ? 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                            : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-[#6e6e73]">bar_chart</span>
                        <span>Resumo Mensal MEC</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminNavDropdown(false);
                          onChangeScreen('bolsa_familia');
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'bolsa_familia'
                            ? 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                            : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-[#6e6e73]">volunteer_activism</span>
                        <span>Bolsa Família &amp; Fretado</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminNavDropdown(false);
                          onChangeScreen('planilha');
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'planilha'
                            ? 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                            : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-[#6e6e73]">cloud</span>
                        <span>Planilha &amp; Drive</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminNavDropdown(false);
                          onChangeScreen('usuarios_acesso');
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                          currentScreen === 'usuarios_acesso'
                            ? 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                            : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-[#6e6e73]">shield</span>
                        <span>Controle de Acessos</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </nav>
          )}

          {/* Zone 3: Actions (Drive Sync & Offline Queue Status, Spotlight Search, Push Notifications & Unified Profile Menu) */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 lg:flex-1 relative">
            {syncSnapshot.pendingCount > 0 && (
              <button
                type="button"
                onClick={() => flushPendingOfflineQueue()}
                title={
                  syncSnapshot.lastError ||
                  `${syncSnapshot.pendingCount} operação(ões) aguardando conexão. Clique para tentar sincronizar agora.`
                }
                className="h-[34px] px-2.5 rounded-full bg-[#fff8eb] hover:bg-[#ffefc8] text-[#9a5b00] border border-[#d97706]/30 flex items-center gap-1 text-[0.7rem] font-extrabold cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[15px]">cloud_upload</span>
                <span>{syncSnapshot.pendingCount} pendente(s)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDriveSyncButtonClick}
              disabled={isSyncingDrive}
              title={
                isDriveTokenExpired
                  ? 'Sessão do Google Drive expirou após 1h. Clique para renovar a autorização discretamente.'
                  : hasDriveToken
                  ? 'Google Drive e Firestore sincronizados. Clique para atualizar fotos, PDFs e planilha agora'
                  : 'Dados sincronizados na nuvem escolar. Clique se desejar conectar sua conta Google Drive'
              }
              className={`h-[34px] px-2.5 sm:px-3 rounded-full flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border text-[0.72rem] font-bold ${
                isDriveTokenExpired
                  ? 'bg-[#fff8eb] hover:bg-[#ffefc8] text-[#9a5b00] border-[#d97706]/30'
                  : hasDriveToken
                  ? 'bg-[#eaf6ef] hover:bg-[#d3eedd] text-[#005035] border-[#005035]/20'
                  : 'bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] border-black/[0.08]'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[16px] ${
                  isSyncingDrive || syncSnapshot.status === 'syncing'
                    ? 'animate-spin text-[#0071e3]'
                    : isDriveTokenExpired
                    ? 'text-[#d97706]'
                    : hasDriveToken
                    ? 'text-[#005035]'
                    : 'text-[#0071e3]'
                }`}
              >
                {isSyncingDrive || syncSnapshot.status === 'syncing'
                  ? 'sync'
                  : isDriveTokenExpired
                  ? 'key_off'
                  : hasDriveToken
                  ? 'cloud_done'
                  : 'cloud_sync'}
              </span>
              <span className="hidden sm:inline">
                {isSyncingDrive || syncSnapshot.status === 'syncing'
                  ? 'Sincronizando...'
                  : isDriveTokenExpired
                  ? 'Renovar Sessão Drive'
                  : hasDriveToken
                  ? 'Nuvem Ativa'
                  : 'Sincronizar Drive'}
              </span>
            </button>

            {/* Botão de Acessibilidade: Tamanho da Letra (Idosos e Baixa Visão) */}
            <button
              type="button"
              onClick={cycleTextSize}
              title={`Tamanho da letra atual: ${textSizePref.toUpperCase()}. Toque para alternar para letras maiores.`}
              aria-label="Ajustar tamanho da letra para idosos"
              className="h-10 px-3 sm:px-3.5 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-amber-400 font-black text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95 shrink-0"
            >
              <span className="material-symbols-outlined text-[20px] text-amber-900">format_size</span>
              <span className="font-extrabold">Letra</span>
              <span className="text-[0.75rem] bg-amber-300 px-2 py-0.5 rounded-md font-black uppercase text-amber-950">
                {textSizePref === 'normal' ? 'Normal' : textSizePref === 'grande' ? 'Grande' : 'Extra'}
              </span>
            </button>

            {onOpenSpotlightSearch && (
              <button
                type="button"
                onClick={onOpenSpotlightSearch}
                title="Busca Global Instantânea (Ctrl+K ou ⌘K)"
                className="h-[34px] px-2.5 sm:px-3 rounded-full bg-[#e8e8ed]/90 hover:bg-[#d2d2d7] text-[#1d1d1f] flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[17px] text-[#0071e3]">
                  search
                </span>
                <span className="hidden md:inline text-[0.74rem] font-semibold text-[#1d1d1f]">
                  Buscar
                </span>
                <kbd className="hidden xl:inline-block px-1.5 py-0.5 rounded bg-white text-[#6e6e73] text-[0.62rem] font-bold border border-black/[0.08]">
                  ⌘K
                </kbd>
              </button>
            )}

            <PushNotificationCenter
              visibleClasses={visibleClasses}
              allClasses={allClasses}
              userRole={userRole}
              userName={userName}
              onNavigateScreen={(targetScreen, targetClassId) => {
                if (targetClassId && onSelectClassById) {
                  onSelectClassById(targetClassId);
                }
                onChangeScreen?.(targetScreen);
              }}
            />

            {!isAdmin &&
              onRestoreAdminRole &&
              userEmail?.trim().toLowerCase().startsWith('emebjfreitas@') && (
                <button
                  type="button"
                  onClick={onRestoreAdminRole}
                  title="Voltar ao perfil Administrador"
                  className="h-[32px] sm:h-[34px] px-2.5 sm:px-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[0.72rem] sm:text-[0.76rem] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[15px]">admin_panel_settings</span>
                  <span>Admin</span>
                </button>
              )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                aria-label="Menu do perfil e sair"
                className="h-[34px] pl-1 pr-2.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] border border-black/[0.06] flex items-center gap-1.5 focus:outline-none cursor-pointer transition-colors"
              >
                <StudentAvatar
                  name={userName || userEmail || 'Educador'}
                  size="sm"
                  className="w-7 h-7 text-[0.7rem]"
                />
                <span className="hidden sm:inline text-[0.72rem] font-bold text-[#1d1d1f]">
                  {userRole === 'admin'
                    ? 'Admin'
                    : userRole === 'usuario'
                    ? 'PEB I'
                    : 'PEB II'}
                </span>
                <span className="material-symbols-outlined text-[16px] text-[#6e6e73]">
                  expand_more
                </span>
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2.5 w-76 bg-white/95 backdrop-blur-2xl rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.14)] border border-black/[0.06] p-2 z-50 animate-ios-sheet">
                    {/* Apple ID Style Profile Header */}
                    <div className="p-3 rounded-2xl bg-[#f5f5f7] flex items-center gap-3">
                      <StudentAvatar
                        name={userName || userEmail || 'Educador'}
                        size="md"
                        className="w-11 h-11 text-[0.88rem] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.86rem] font-bold text-[#1d1d1f] truncate">
                          {userName || 'Professor(a) EMEB'}
                        </p>
                        <p className="text-[0.7rem] font-mono text-[#0066cc] truncate">
                          {userEmail || 'emebjfreitas@educacao.jundiai.sp.gov.br'}
                        </p>
                        <p className="text-[0.68rem] text-[#6e6e73] mt-0.5">
                          {userRole === 'admin'
                            ? 'Direção / Secretaria · Acesso Pleno'
                            : userRole === 'usuario'
                            ? `Docente Regente · ${visibleClasses.map((c) => c.name).join(', ')}`
                            : 'Docente Especialista · PEB II'}
                        </p>
                      </div>
                    </div>

                    {/* Sync Status Pill Row inside Control Center */}
                    <div className="px-3 py-2 flex items-center justify-between text-[0.72rem] text-[#6e6e73]">
                      <span>Estado da Nuvem</span>
                      <span className="font-semibold text-[#1d1d1f] flex items-center gap-1">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            syncSnapshot.pendingCount > 0
                              ? 'bg-[#ff9500]'
                              : 'bg-[#28cd41]'
                          }`}
                        />
                        {syncSnapshot.pendingCount > 0
                          ? `${syncSnapshot.pendingCount} pendente(s)`
                          : '100% Sincronizado'}
                      </span>
                    </div>

                    <div className="my-1 border-t border-black/[0.06]" />

                    {isAdmin && onChangeScreen && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          onChangeScreen('usuarios_acesso');
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-[0.8rem] text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center justify-between cursor-pointer font-medium transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-[18px] text-[#0071e3]">
                            manage_accounts
                          </span>
                          <span>Professores &amp; Acessos</span>
                        </span>
                        <span className="material-symbols-outlined text-[16px] text-[#86868b]">
                          chevron_right
                        </span>
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          onNavigatePlanilha();
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-[0.8rem] text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center justify-between cursor-pointer font-medium transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-[18px] text-[#0071e3]">
                            cloud_done
                          </span>
                          <span>Planilha &amp; Google Drive</span>
                        </span>
                        <span className="material-symbols-outlined text-[16px] text-[#86868b]">
                          chevron_right
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowLogoutSheet(true);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-[0.8rem] text-[#ff3b30] hover:bg-[#fff2f2] flex items-center justify-between cursor-pointer font-semibold transition-colors mt-0.5"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-[18px]">logout</span>
                        <span>Encerrar Sessão...</span>
                      </span>
                      <span className="text-[0.68rem] text-[#ff3b30]/80 font-normal">
                        Sair
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tela / Modal iOS 18 Action Sheet de Saída Segura (Com Verificação de Sincronização Pendente) */}
      {showLogoutSheet && (
        <div
          className="fixed inset-0 z-[100] bg-black/35 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-4 animate-gentle-fade"
          onClick={() => !isLoggingOut && setShowLogoutSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] space-y-2.5 animate-ios-sheet"
          >
            {/* Card Principal Estilo iOS 18 Action Sheet */}
            <div className="bg-white/95 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.18)] overflow-hidden text-center">
              <div className="px-6 pt-6 pb-5 space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#f5f5f7] flex items-center justify-center">
                  <StudentAvatar
                    name={userName || userEmail || 'Educador'}
                    size="md"
                    className="w-12 h-12 text-[0.95rem]"
                  />
                </div>

                <div className="space-y-1">
                  <h2 className="text-[1.05rem] font-bold text-[#1d1d1f] tracking-tight">
                    Encerrar Sessão Institucional?
                  </h2>
                  <p className="text-[0.76rem] text-[#6e6e73] leading-relaxed">
                    {userName || userEmail} · {SCHOOL_NAME}
                  </p>
                </div>

                {/* Verificador de Sincronização Antes de Sair */}
                <div
                  className={`p-3 rounded-2xl text-left flex items-center gap-2.5 ${
                    syncSnapshot.pendingCount > 0
                      ? 'bg-[#fff8eb] text-[#9a5b00]'
                      : 'bg-[#f5f5f7] text-[#1d1d1f]'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 ${
                      syncSnapshot.pendingCount > 0 ? 'text-[#ff9500]' : 'text-[#28cd41]'
                    }`}
                  >
                    {syncSnapshot.pendingCount > 0 ? 'cloud_Sync' : 'verified'}
                  </span>
                  <div className="min-w-0 text-[0.73rem] leading-snug">
                    {syncSnapshot.pendingCount > 0 ? (
                      <span>
                        Sincronizando <strong>{syncSnapshot.pendingCount} registro(s)</strong>{' '}
                        na nuvem antes de desconectar...
                      </span>
                    ) : (
                      <span>
                        Todas as chamadas, faltas e anotações estão salvas na nuvem.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Botões de Ação Estilo iOS Hairline */}
              <div className="border-t border-black/[0.08] divide-y divide-black/[0.08]">
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleConfirmLogoutWithFlush}
                  className="w-full h-[52px] text-[0.92rem] font-bold text-[#ff3b30] hover:bg-[#fff2f2] active:bg-[#ffe5e5] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[19px]">logout</span>
                  <span>
                    {isLoggingOut ? 'Salvando e Saindo...' : 'Sair da Conta'}
                  </span>
                </button>
              </div>
            </div>

            {/* Botão Cancelar Separado (Padrão Nativo iOS Action Sheet) */}
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={() => setShowLogoutSheet(false)}
              className="w-full h-[52px] bg-white hover:bg-[#f5f5f7] rounded-[22px] shadow-[0_10px_30px_rgba(0,0,0,0.12)] text-[0.92rem] font-semibold text-[#0071e3] transition-colors cursor-pointer ios-spring-btn"
            >
              Continuar Conectado
            </button>
          </div>
        </div>
      )}
    </>
  );
};
