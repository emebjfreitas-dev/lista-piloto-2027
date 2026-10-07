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
    currentScreen === 'detalhes' ||
    currentScreen === 'dias_letivos' ||
    currentScreen === 'planilha' ||
    currentScreen === 'usuarios_acesso';

  const getScreenTitle = () => {
    if (title) return title;
    if (currentScreen === 'frequencia_mensal') return 'Frequência Mensal';
    if (currentScreen === 'detalhes') return 'Caderneta da Turma';
    if (currentScreen === 'dias_letivos') return 'Dias Letivos SME';
    if (currentScreen === 'resumo') return 'Fechamento Mensal';
    if (currentScreen === 'planilha') return 'Planilha Google';
    if (currentScreen === 'usuarios_acesso') return 'Acessos Cadastrados';
    return 'Painel de Turmas';
  };

  return (
    <header className="fixed top-0 w-full z-50 pt-safe bg-[#f9faf8]/95 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,52,64,0.06)] border-b border-[#edeeec]">
      <div className="h-20 px-3.5 sm:px-5 lg:px-8 xl:px-10 max-w-2xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto flex items-center justify-between gap-2.5">
        {/* Left slot: Official Brasão de Jundiaí always visible */}
        <div className="flex items-center gap-2.5 min-w-0">
          {showBackButton && (
            <button
              onClick={onBack}
              aria-label="Voltar para tela anterior"
              className="min-h-[48px] px-3.5 flex items-center justify-center gap-1 rounded-xl bg-[#edeeec] hover:bg-[#e7e8e6] text-[#003440] font-black transition-colors active:scale-95 cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
              <span className="text-[0.92rem] font-bold">Voltar</span>
            </button>
          )}

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white border border-[#c0c8cb]/70 p-1 flex items-center justify-center shadow-2xs shrink-0">
              <img
                src={APP_LOGO_URL}
                alt="Prefeitura Municipal de Jundiaí - Secretaria Municipal de Educação"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = APP_LOGO_FALLBACK_URL;
                }}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-[1.025rem] font-extrabold text-[#003440] leading-tight truncate">
                {showBackButton
                  ? getScreenTitle()
                  : 'Lista Piloto 2027 • EMEB Joaquim Candelário de Freitas'}
              </span>
              <span className="text-[0.725rem] font-bold text-[#436370] truncate">
                {showBackButton
                  ? 'Prefeitura Municipal de Jundiaí • Secretaria Municipal de Educação'
                  : `Prefeitura Municipal de Jundiaí • Secretaria Municipal de Educação • ${subtitle || 'Uso Exclusivo de Professores'}`}
              </span>
            </div>
          </div>
        </div>

        {/* Center slot: Navigation Bar on PC 21" 1920x1080 (Streamlined for PEB I & PEB II, Full for ADMIN) */}
        {onChangeScreen && (
          <nav
            aria-label="Navegação Principal Desktop"
            className="hidden lg:flex items-center gap-2 bg-[#edeeec] p-1.5 rounded-2xl border border-[#c0c8cb]/60"
          >
            <button
              type="button"
              onClick={() => onChangeScreen('turmas')}
              className={`min-h-[46px] px-4 rounded-xl font-black text-[0.9rem] flex items-center gap-2 transition-all cursor-pointer ${
                currentScreen === 'turmas' || currentScreen === 'detalhes'
                  ? 'bg-[#003440] text-white shadow-xs'
                  : 'text-[#003440] hover:bg-white'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">groups</span>
              <span>{userRole === 'usuario' ? '1. Minha Turma' : '1. Turmas'}</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeScreen('frequencia_mensal')}
              className={`min-h-[46px] px-4 rounded-xl font-black text-[0.9rem] flex items-center gap-2 transition-all cursor-pointer ${
                currentScreen === 'frequencia_mensal'
                  ? 'bg-[#005035] text-white shadow-xs'
                  : 'text-[#003440] hover:bg-white'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">edit_calendar</span>
              <span>{userRole === 'peb2' ? '2. Frequência' : '2. Lançar Faltas'}</span>
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onChangeScreen('planilha')}
                  className={`min-h-[46px] px-4 rounded-xl font-black text-[0.9rem] flex items-center gap-2 transition-all cursor-pointer ${
                    currentScreen === 'planilha'
                      ? 'bg-[#003440] text-white shadow-xs'
                      : 'text-[#003440] hover:bg-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px]">table_chart</span>
                  <span>3. Planilha & Fotos</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeScreen('dias_letivos')}
                  className={`min-h-[46px] px-3.5 rounded-xl font-black text-[0.88rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                    currentScreen === 'dias_letivos'
                      ? 'bg-[#003440] text-white shadow-xs'
                      : 'text-[#003440] hover:bg-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[21px]">calendar_month</span>
                  <span>4. 200 Dias</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeScreen('usuarios_acesso')}
                  className={`min-h-[46px] px-3.5 rounded-xl font-black text-[0.88rem] flex items-center gap-1.5 transition-all cursor-pointer ${
                    currentScreen === 'usuarios_acesso'
                      ? 'bg-[#005035] text-white shadow-xs'
                      : 'text-[#003440] hover:bg-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[21px]">manage_accounts</span>
                  <span>5. Acessos</span>
                </button>
              </>
            )}
          </nav>
        )}

        {/* Right slot */}
        <div className="flex items-center gap-1.5 flex-shrink-0 relative">
          {isAdmin && (
            <button
              onClick={onNavigatePlanilha}
              title="Banco de dados na Planilha Google"
              className="min-h-[46px] px-2.5 rounded-xl bg-[#edeeec] hover:bg-[#e7e8e6] text-[#005035] flex items-center gap-1 transition-colors cursor-pointer active:scale-95 border border-[#a4f3ca]/60"
            >
              <span className="material-symbols-outlined text-[20px]">table_chart</span>
              <span className="text-[0.8rem] font-bold hidden sm:inline">Planilha</span>
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
                    Gerenciar Acessos (@educacao.jundiai)
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
                  Sair da Lista Piloto
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
