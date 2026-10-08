import React, { useState } from 'react';
import { ScreenType, UserRole } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME, CITY_NAME } from '../data/mockData';
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
  subtitle,
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

  // If on login, do not show top bar
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
    if (currentScreen === 'bolsa_familia') return 'Bolsa Família (Lista Nominal)';
    if (currentScreen === 'onibus_fretado') return 'Ônibus Fretado (Lista Nominal)';
    if (currentScreen === 'dias_letivos') return 'Dias Letivos SME';
    if (currentScreen === 'resumo') return 'Fechamento Mensal';
    if (currentScreen === 'planilha') return 'Planilha Google';
    if (currentScreen === 'usuarios_acesso') return 'Acessos Cadastrados';
    return 'Painel de Turmas';
  };

  return (
    <header className="fixed top-0 w-full z-50 pt-safe ios-glass-top">
      <div className="h-[74px] px-3.5 sm:px-5 lg:px-8 xl:px-10 max-w-2xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto flex items-center justify-between gap-3">
        {/* Left slot: Official Brasão de Jundiaí always visible */}
        <div className="flex items-center gap-2.5 min-w-0">
          {showBackButton && (
            <button
              onClick={onBack}
              aria-label="Voltar para tela anterior"
              className="min-h-[44px] px-3.5 flex items-center justify-center gap-1.5 rounded-xl bg-[#f1f4f3] hover:bg-[#e3e8e6] text-[#003440] font-bold border border-[#003440]/10 transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[21px]">arrow_back</span>
              <span className="text-[0.86rem] font-extrabold">Voltar</span>
            </button>
          )}

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white border border-[#003440]/12 p-1 flex items-center justify-center shadow-2xs shrink-0">
              <img
                src={APP_LOGO_URL}
                alt="Prefeitura do Município de Jundiaí - Secretaria Municipal de Educação"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = APP_LOGO_FALLBACK_URL;
                }}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-[1rem] font-extrabold text-[#003440] leading-tight truncate">
                {showBackButton
                  ? getScreenTitle()
                  : 'LISTA PILOTO 2027 • EMEB Professor Joaquim Candelário de Freitas'}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#436370] truncate mt-0.5">
                {showBackButton
                  ? 'Prefeitura do Município de Jundiaí · Secretaria Municipal de Educação'
                  : `Prefeitura do Município de Jundiaí · Secretaria Municipal de Educação · ${subtitle || 'Uso Exclusivo de Professores'}`}
              </span>
            </div>
          </div>
        </div>

        {/* Center slot: Navigation Bar on PC 21" 1920x1080 (Streamlined for PEB I & PEB II, Full for ADMIN) */}
        {onChangeScreen && (
          <nav
            aria-label="Navegação Principal Desktop"
            className="hidden lg:flex items-center gap-1.5 bg-[#f1f4f3] p-1.5 rounded-2xl border border-[#003440]/10"
          >
            <button
              type="button"
              onClick={() => onChangeScreen('turmas')}
              className={`min-h-[42px] px-3.5 rounded-xl font-extrabold text-[0.84rem] flex items-center gap-2 transition-all cursor-pointer ${
                currentScreen === 'turmas' || currentScreen === 'detalhes'
                  ? 'bg-[#003440] text-white shadow-xs'
                  : 'text-[#003440] hover:bg-white/80'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">groups</span>
              <span>{userRole === 'usuario' ? '1. Minha Turma' : '1. Turmas'}</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeScreen('frequencia_mensal')}
              className={`min-h-[42px] px-3 rounded-xl font-extrabold text-[0.82rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                currentScreen === 'frequencia_mensal'
                  ? 'bg-[#005035] text-white shadow-xs'
                  : 'text-[#003440] hover:bg-white/80'
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">edit_calendar</span>
              <span>{userRole === 'peb2' ? '2. Frequência' : '2. Lançar Faltas'}</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onChangeScreen('bolsa_familia')}
                className={`min-h-[42px] px-3 rounded-xl font-extrabold text-[0.82rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentScreen === 'bolsa_familia'
                    ? 'bg-[#b45309] text-white shadow-xs'
                    : 'text-[#92400e] hover:bg-white/80'
                }`}
              >
                <span className="material-symbols-outlined text-[19px]">family_restroom</span>
                <span>Bolsa Família</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onChangeScreen('onibus_fretado')}
              className={`min-h-[42px] px-3 rounded-xl font-extrabold text-[0.82rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                currentScreen === 'onibus_fretado'
                  ? 'bg-[#0369a1] text-white shadow-xs'
                  : 'text-[#0c4a6e] hover:bg-white/80'
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">directions_bus</span>
              <span>Ônibus Fretado</span>
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onChangeScreen('planilha')}
                  className={`min-h-[42px] px-3 rounded-xl font-extrabold text-[0.82rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                    currentScreen === 'planilha'
                      ? 'bg-[#003440] text-white shadow-xs'
                      : 'text-[#003440] hover:bg-white/80'
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">table_chart</span>
                  <span>Planilha</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeScreen('dias_letivos')}
                  className={`min-h-[42px] px-3 rounded-xl font-extrabold text-[0.82rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                    currentScreen === 'dias_letivos'
                      ? 'bg-[#003440] text-white shadow-xs'
                      : 'text-[#003440] hover:bg-white/80'
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">calendar_month</span>
                  <span>200 Dias</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeScreen('usuarios_acesso')}
                  className={`min-h-[42px] px-3 rounded-xl font-extrabold text-[0.82rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                    currentScreen === 'usuarios_acesso'
                      ? 'bg-[#005035] text-white shadow-xs'
                      : 'text-[#003440] hover:bg-white/80'
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">manage_accounts</span>
                  <span>Prof. &amp; Acessos</span>
                </button>
              </>
            )}
          </nav>
        )}

        {/* Right slot: Always-visible Sair button + Avatar Profile */}
        <div className="flex items-center gap-2 flex-shrink-0 relative">
          {!isAdmin &&
            onRestoreAdminRole &&
            userEmail?.trim().toLowerCase().startsWith('emebjfreitas@') && (
              <button
                type="button"
                onClick={onRestoreAdminRole}
                title="Sair da simulação e voltar ao painel completo do Administrador"
                className="min-h-[40px] px-3 rounded-xl bg-[#003440] hover:bg-[#004c5c] text-white flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shadow-2xs"
              >
                <span className="material-symbols-outlined text-[18px]">
                  admin_panel_settings
                </span>
                <span className="text-[0.75rem] font-extrabold">
                  Voltar p/ ADMIN
                </span>
              </button>
            )}

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              aria-label="Menu do perfil"
              className="flex items-center gap-1.5 pl-1 rounded-full focus:outline-none cursor-pointer"
            >
              <StudentAvatar
                name={userName || userEmail || 'Educador'}
                size="sm"
                className="w-10 h-10 text-[0.82rem] ring-2 ring-[#003440]/25 hover:ring-[#003440]/60 transition-all"
              />
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-[#edeeec] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 border-b border-[#edeeec]">
                  <p className="text-[0.92rem] font-bold text-[#003440] truncate">
                    {userName || 'Professor(a) EMEB'}
                  </p>
                  <p className="text-[0.75rem] font-mono text-[#005035] font-bold truncate">
                    {userEmail || 'emebjfreitas@educacao.jundiai.sp.gov.br'}
                  </p>
                  <p className="text-[0.725rem] text-[#436370] font-medium mt-1">
                    {SCHOOL_NAME}
                  </p>
                </div>

                {isAdmin && onChangeScreen && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onChangeScreen('usuarios_acesso');
                    }}
                    className="w-full text-left px-4 py-2.5 text-[0.875rem] text-[#003440] hover:bg-[#f3f4f2] flex items-center gap-2 cursor-pointer font-bold"
                  >
                    <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
                    Quadro de Professores &amp; Acessos
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onNavigatePlanilha();
                    }}
                    className="w-full text-left px-4 py-2.5 text-[0.875rem] text-[#005035] hover:bg-[#a4f3ca]/20 flex items-center gap-2 cursor-pointer font-bold"
                  >
                    <span className="material-symbols-outlined text-[20px]">table_chart</span>
                    Planilha Google da Escola
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-[0.875rem] text-[#ba1a1a] hover:bg-[#ffdad6]/40 flex items-center gap-2 cursor-pointer font-semibold"
                >
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  Sair da Conta
                </button>
              </div>
            )}
          </div>

          {/* Botão SAIR sempre visível diretamente na barra superior (Mobile, Tablet e Desktop) */}
          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta e voltar para a tela de login"
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#ffdad6]/80 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white border border-[#ba1a1a]/25 font-extrabold text-[0.78rem] flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0 shadow-2xs"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
};
