import React, { useState } from 'react';
import { ClassGroup, ScreenType, UserRole } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME } from '../data/mockData';
import { StudentAvatar } from './StudentAvatar';
import { AppFontId } from '../utils/fontTheme';
import { PushNotificationCenter } from './PushNotificationCenter';

interface HeaderProps {
  currentScreen: ScreenType;
  title?: string;
  subtitle?: string;
  userEmail?: string;
  userName?: string;
  userRole?: UserRole;
  visibleClasses?: ClassGroup[];
  allClasses?: ClassGroup[];
  activeFontId?: AppFontId;
  onSelectFont?: (fontId: AppFontId) => void;
  onRestoreAdminRole?: () => void;
  onBack?: () => void;
  onChangeScreen?: (screen: ScreenType) => void;
  onSelectClassById?: (classId: string) => void;
  onOpenSpotlightSearch?: () => void;
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
  onNavigatePlanilha,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  if (currentScreen === 'login') return null;

  const isAdmin = userRole === 'admin';

  const showBackButton =
    currentScreen === 'frequencia_mensal' ||
    currentScreen === 'faltas_consecutivas' ||
    (currentScreen === 'detalhes' && userRole !== 'usuario') ||
    currentScreen === 'bolsa_familia' ||
    currentScreen === 'onibus_fretado' ||
    currentScreen === 'dias_letivos' ||
    currentScreen === 'planilha' ||
    currentScreen === 'usuarios_acesso';

  const getScreenTitle = () => {
    if (title) return title;
    if (currentScreen === 'frequencia_mensal') return 'Frequência Mensal';
    if (currentScreen === 'faltas_consecutivas') return 'Faltas Consecutivas';
    if (currentScreen === 'detalhes') return 'Caderneta da Turma';
    if (currentScreen === 'bolsa_familia') return 'Bolsa Família';
    if (currentScreen === 'onibus_fretado') return 'Ônibus Fretado';
    if (currentScreen === 'dias_letivos') return '200 Dias Letivos';
    if (currentScreen === 'resumo') return 'Fechamento Mensal';
    if (currentScreen === 'planilha') return 'Sincronização Nuvem';
    if (currentScreen === 'usuarios_acesso') return 'Professores & Acessos';
    return 'Lista Piloto 2027';
  };

  return (
    <header className="fixed top-0 left-0 right-0 w-full z-50 pt-safe ios-glass-top">
      <div className="h-[54px] sm:h-[60px] px-3 sm:px-6 lg:px-8 max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Brand / Back Control */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 lg:flex-initial">
          {showBackButton && (
            <button
              onClick={onBack}
              aria-label="Voltar para tela anterior"
              className="h-[34px] px-2.5 sm:px-3.5 flex items-center justify-center gap-0.5 sm:gap-1 rounded-full bg-[#e8e8ed] hover:bg-[#d2d2d7] text-[#1d1d1f] font-semibold text-[0.78rem] sm:text-[0.82rem] transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              <span className="hidden xs:inline sm:inline">Voltar</span>
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <img
              src={APP_LOGO_URL}
              alt="EMEB Joaquim Candelário de Freitas"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = APP_LOGO_FALLBACK_URL;
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0"
            />
            <div className="min-w-0">
              <span className="text-[0.86rem] sm:text-[0.95rem] font-semibold tracking-tight text-[#1d1d1f] truncate block">
                {showBackButton ? getScreenTitle() : 'EMEB Candelário de Freitas'}
              </span>
            </div>
          </div>
        </div>

        {/* Zone 2: Apple.com Global Navigation Links (Visible on Desktop lg+) */}
        {onChangeScreen && (
          <nav
            aria-label="Navegação Principal"
            className="hidden lg:flex items-center gap-1 bg-[#e8e8ed]/85 p-1 rounded-full shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeScreen('turmas')}
              className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                currentScreen === 'turmas' || currentScreen === 'detalhes'
                  ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                  : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
              }`}
            >
              {userRole === 'usuario' ? 'Minha Turma' : 'Turmas'}
            </button>

            {userRole !== 'peb2' && (
              <button
                type="button"
                onClick={() => onChangeScreen('frequencia_mensal')}
                className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                  currentScreen === 'frequencia_mensal'
                    ? 'bg-[#0071e3] text-white font-semibold shadow-2xs'
                    : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
                }`}
              >
                Lançar Faltas
              </button>
            )}

            <button
              type="button"
              onClick={() => onChangeScreen('faltas_consecutivas')}
              className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                currentScreen === 'faltas_consecutivas'
                  ? 'bg-[#ff3b30] text-white font-semibold shadow-2xs'
                  : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
              }`}
            >
              Faltas Seguidas
            </button>

            <button
              type="button"
              onClick={() => onChangeScreen('resumo')}
              className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                currentScreen === 'resumo'
                  ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                  : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
              }`}
            >
              Resumo Mensal
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onChangeScreen('bolsa_familia')}
                className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                  currentScreen === 'bolsa_familia'
                    ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                    : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
                }`}
              >
                Bolsa Família
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onChangeScreen('planilha')}
                  className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                    currentScreen === 'planilha'
                      ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                      : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
                  }`}
                >
                  Planilha &amp; Drive
                </button>

                <button
                  type="button"
                  onClick={() => onChangeScreen('dias_letivos')}
                  className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                    currentScreen === 'dias_letivos'
                      ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                      : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
                  }`}
                >
                  200 Dias
                </button>

                <button
                  type="button"
                  onClick={() => onChangeScreen('usuarios_acesso')}
                  className={`h-[32px] xl:h-[34px] px-3 xl:px-4 rounded-full font-medium text-[0.76rem] xl:text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                    currentScreen === 'usuarios_acesso'
                      ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                      : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
                  }`}
                >
                  Acessos
                </button>
              </>
            )}
          </nav>
        )}

        {/* Zone 3: Actions (Spotlight Search, Push Notifications, Profile Badge & Sair) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
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

          <span className="hidden xl:inline-flex items-center px-2.5 py-1 rounded-full bg-black/[0.04] text-[#6e6e73] text-[0.72rem] font-semibold">
            {userRole === 'admin'
              ? 'ADMIN'
              : userRole === 'usuario'
              ? 'PEB I'
              : 'PEB II'}
          </span>

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              aria-label="Menu do perfil"
              className="flex items-center rounded-full focus:outline-none cursor-pointer"
            >
              <StudentAvatar
                name={userName || userEmail || 'Educador'}
                size="sm"
                className="w-8 h-8 sm:w-9 sm:h-9 text-[0.74rem] sm:text-[0.78rem] ring-1 ring-black/12 hover:ring-[#0071e3] transition-all"
              />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2.5 w-72 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-black/[0.08] py-2 z-50">
                <div className="px-4 py-3 border-b border-black/[0.06]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.86rem] font-semibold text-[#1d1d1f] truncate">
                      {userName || 'Professor(a) EMEB'}
                    </p>
                    <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[0.65rem] font-bold uppercase shrink-0">
                      {userRole === 'admin' ? 'Admin' : userRole === 'usuario' ? 'PEB I' : 'PEB II'}
                    </span>
                  </div>
                  <p className="text-[0.73rem] font-mono text-[#0066cc] truncate mt-0.5">
                    {userEmail || 'emebjfreitas@educacao.jundiai.sp.gov.br'}
                  </p>
                  <p className="text-[0.7rem] text-[#6e6e73] mt-1">
                    {SCHOOL_NAME}
                  </p>
                </div>

                {isAdmin && onChangeScreen && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onChangeScreen('usuarios_acesso');
                    }}
                    className="w-full text-left px-4 py-2.5 text-[0.82rem] text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                    Quadro de Professores &amp; Acessos
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onNavigatePlanilha();
                    }}
                    className="w-full text-left px-4 py-2.5 text-[0.82rem] text-[#0066cc] hover:bg-[#f5f5f7] flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <span className="material-symbols-outlined text-[18px]">cloud_done</span>
                    Planilha &amp; Pastas Google Drive
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-[0.82rem] text-[#ff3b30] hover:bg-[#fff2f2] flex items-center gap-2 cursor-pointer font-medium"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Sair da Conta
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            className="h-[32px] sm:h-[34px] px-2.5 sm:px-3.5 rounded-full bg-[#f5f5f7] hover:bg-[#ff3b30] text-[#1d1d1f] hover:text-white border border-black/[0.08] font-semibold text-[0.75rem] sm:text-[0.78rem] flex items-center gap-1 transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px] sm:text-[17px]">logout</span>
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
};
