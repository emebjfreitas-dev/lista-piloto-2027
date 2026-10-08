import React, { useState } from 'react';
import { ScreenType, UserRole } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME } from '../data/mockData';
import { StudentAvatar } from './StudentAvatar';

interface HeaderProps {
  currentScreen: ScreenType;
  title?: string;
  subtitle?: string;
  userEmail?: string;
  userName?: string;
  userRole?: UserRole;
  onRestoreAdminRole?: () => void;
  onBack?: () => void;
  onChangeScreen?: (screen: ScreenType) => void;
  onNavigatePlanilha: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  title,
  userEmail,
  userName,
  userRole = 'admin',
  onRestoreAdminRole,
  onBack,
  onChangeScreen,
  onNavigatePlanilha,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  if (currentScreen === 'login') return null;

  const isAdmin = userRole === 'admin';

  const showBackButton =
    currentScreen === 'frequencia_mensal' ||
    (currentScreen === 'detalhes' && userRole !== 'usuario') ||
    currentScreen === 'bolsa_familia' ||
    currentScreen === 'onibus_fretado' ||
    currentScreen === 'dias_letivos' ||
    currentScreen === 'planilha' ||
    currentScreen === 'usuarios_acesso';

  const getScreenTitle = () => {
    if (title) return title;
    if (currentScreen === 'frequencia_mensal') return 'Frequência Mensal';
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
    <header className="fixed top-0 w-full z-50 pt-safe ios-glass-top">
      <div className="h-[64px] px-4 sm:px-6 lg:px-10 max-w-2xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1680px] mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Brand / Back Control */}
        <div className="flex items-center gap-3 min-w-0">
          {showBackButton && (
            <button
              onClick={onBack}
              aria-label="Voltar para tela anterior"
              className="min-h-[36px] px-3.5 flex items-center justify-center gap-1 rounded-full bg-[#e8e8ed] hover:bg-[#d2d2d7] text-[#1d1d1f] font-semibold text-[0.82rem] transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              <span>Voltar</span>
            </button>
          )}

          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={APP_LOGO_URL}
              alt="EMEB Joaquim Candelário de Freitas"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = APP_LOGO_FALLBACK_URL;
              }}
              className="w-8 h-8 object-contain shrink-0"
            />
            <span className="text-[0.95rem] font-semibold tracking-tight text-[#1d1d1f] truncate">
              {showBackButton ? getScreenTitle() : 'EMEB Candelário de Freitas'}
            </span>
          </div>
        </div>

        {/* Zone 2: Apple.com Global Navigation Links */}
        {onChangeScreen && (
          <nav
            aria-label="Navegação Principal"
            className="hidden lg:flex items-center gap-1 bg-[#e8e8ed]/75 p-1 rounded-full"
          >
            <button
              type="button"
              onClick={() => onChangeScreen('turmas')}
              className={`min-h-[34px] px-4 rounded-full font-medium text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
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
                className={`min-h-[34px] px-4 rounded-full font-medium text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                  currentScreen === 'frequencia_mensal'
                    ? 'bg-[#0071e3] text-white font-semibold shadow-2xs'
                    : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
                }`}
              >
                Lançar Faltas
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => onChangeScreen('bolsa_familia')}
                className={`min-h-[34px] px-4 rounded-full font-medium text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                  currentScreen === 'bolsa_familia'
                    ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                    : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
                }`}
              >
                Bolsa Família
              </button>
            )}

            <button
              type="button"
              onClick={() => onChangeScreen('onibus_fretado')}
              className={`min-h-[34px] px-4 rounded-full font-medium text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
                currentScreen === 'onibus_fretado'
                  ? 'bg-[#1d1d1f] text-white font-semibold shadow-2xs'
                  : 'text-[#1d1d1f]/80 hover:text-[#1d1d1f]'
              }`}
            >
              Ônibus Fretado
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onChangeScreen('planilha')}
                  className={`min-h-[34px] px-4 rounded-full font-medium text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
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
                  className={`min-h-[34px] px-4 rounded-full font-medium text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
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
                  className={`min-h-[34px] px-4 rounded-full font-medium text-[0.8rem] transition-all cursor-pointer whitespace-nowrap ${
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

        {/* Zone 3: Actions (Profile & Sair) */}
        <div className="flex items-center gap-2.5 flex-shrink-0 relative">
          {!isAdmin &&
            onRestoreAdminRole &&
            userEmail?.trim().toLowerCase().startsWith('emebjfreitas@') && (
              <button
                type="button"
                onClick={onRestoreAdminRole}
                title="Voltar ao perfil Administrador"
                className="min-h-[34px] px-3.5 rounded-full bg-[#1d1d1f] hover:bg-black text-white text-[0.76rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Voltar p/ Admin</span>
              </button>
            )}

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              aria-label="Menu do perfil"
              className="flex items-center rounded-full focus:outline-none cursor-pointer"
            >
              <StudentAvatar
                name={userName || userEmail || 'Educador'}
                size="sm"
                className="w-9 h-9 text-[0.78rem] ring-1 ring-black/12 hover:ring-[#0071e3] transition-all"
              />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2.5 w-72 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-black/[0.08] py-2 z-50">
                <div className="px-4 py-3 border-b border-black/[0.06]">
                  <p className="text-[0.88rem] font-semibold text-[#1d1d1f] truncate">
                    {userName || 'Professor(a) EMEB'}
                  </p>
                  <p className="text-[0.74rem] font-mono text-[#0066cc] truncate mt-0.5">
                    {userEmail || 'emebjfreitas@educacao.jundiai.sp.gov.br'}
                  </p>
                  <p className="text-[0.72rem] text-[#6e6e73] mt-1">
                    {SCHOOL_NAME}
                  </p>
                </div>

                {isAdmin && onChangeScreen && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onChangeScreen('usuarios_acesso');
                    }}
                    className="w-full text-left px-4 py-2.5 text-[0.84rem] text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <span className="material-symbols-outlined text-[19px]">manage_accounts</span>
                    Quadro de Professores &amp; Acessos
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onNavigatePlanilha();
                    }}
                    className="w-full text-left px-4 py-2.5 text-[0.84rem] text-[#0066cc] hover:bg-[#f5f5f7] flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <span className="material-symbols-outlined text-[19px]">cloud_done</span>
                    Planilha &amp; Pastas Google Drive
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-[0.84rem] text-[#ff3b30] hover:bg-[#fff2f2] flex items-center gap-2 cursor-pointer font-medium"
                >
                  <span className="material-symbols-outlined text-[19px]">logout</span>
                  Sair da Conta
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            className="min-h-[34px] px-3.5 rounded-full bg-[#f5f5f7] hover:bg-[#ff3b30] text-[#1d1d1f] hover:text-white border border-black/[0.08] font-semibold text-[0.78rem] flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[17px]">logout</span>
            <span>Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
};
