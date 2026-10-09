import React from 'react';
import { ScreenType, UserRole } from '../types';

interface BottomNavProps {
  currentScreen: ScreenType;
  userRole?: UserRole;
  selectedClassName?: string;
  onChangeScreen: (screen: ScreenType) => void;
  onLogout?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentScreen,
  userRole = 'admin',
  selectedClassName,
  onChangeScreen,
  onLogout,
}) => {
  if (currentScreen === 'login') {
    return null;
  }

  const isAdmin = userRole === 'admin';

  const allNavItems: Array<{
    id: ScreenType;
    label: string;
    shortLabel?: string;
    icon: string;
    adminOnly?: boolean;
    peb1Only?: boolean;
    hideForPeb2?: boolean;
  }> = [
    {
      id: 'turmas',
      label: userRole === 'usuario' ? selectedClassName || 'Minha Turma' : 'Turmas',
      shortLabel: userRole === 'usuario' ? 'Turma' : 'Turmas',
      icon: 'groups',
    },
    {
      id: 'frequencia_mensal',
      label: 'Faltas do Mês',
      shortLabel: 'Faltas Mês',
      icon: 'edit_calendar',
      hideForPeb2: true,
    },
    {
      id: 'faltas_consecutivas',
      label: 'Faltas Consecutivas',
      shortLabel: 'Consecutivas',
      icon: 'event_busy',
    },
    {
      id: 'resumo',
      label: 'Resumo Mensal',
      shortLabel: 'Resumo',
      icon: 'monitoring',
    },
    {
      id: 'bolsa_familia',
      label: 'Bolsa Família',
      shortLabel: 'Bolsa',
      icon: 'family_restroom',
      adminOnly: true,
    },
    {
      id: 'planilha',
      label: 'Planilha & Drive',
      shortLabel: 'Nuvem',
      icon: 'cloud_done',
      adminOnly: true,
    },
    {
      id: 'usuarios_acesso',
      label: 'Acessos',
      shortLabel: 'Acessos',
      icon: 'manage_accounts',
      adminOnly: true,
    },
  ];

  const navItems = allNavItems.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.peb1Only || userRole === 'usuario') &&
      !(item.hideForPeb2 && userRole === 'peb2')
  );

  const getIsActive = (itemId: ScreenType) => {
    if (itemId === 'turmas') {
      return currentScreen === 'turmas' || currentScreen === 'detalhes';
    }
    return currentScreen === itemId;
  };

  return (
    <nav
      aria-label="Barra de Navegação Inferior"
      className="fixed bottom-0 left-0 right-0 w-full z-40 pb-safe ios-glass border-t border-black/[0.08] lg:hidden"
    >
      <div
        className={`flex items-center justify-around h-[58px] px-1.5 sm:px-3 mx-auto overflow-x-auto no-scrollbar ${
          isAdmin ? 'max-w-3xl' : 'max-w-md'
        }`}
      >
        {navItems.map((item) => {
          const isActive = getIsActive(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeScreen(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-center min-w-[48px] sm:min-w-[64px] flex-1 h-full px-1 transition-all duration-150 cursor-pointer select-none active:scale-95 ${
                isActive
                  ? 'text-[#0071e3]'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              <div
                className={`flex items-center justify-center w-9 sm:w-10 h-6 rounded-full transition-colors duration-150 ${
                  isActive ? 'bg-[#0071e3]/12' : 'bg-transparent'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[20px] sm:text-[21px]"
                  style={
                    isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 600" } : undefined
                  }
                >
                  {item.icon}
                </span>
              </div>

              <span
                className={`text-[0.63rem] sm:text-[0.68rem] tracking-tight leading-tight mt-0.5 truncate max-w-full whitespace-nowrap ${
                  isActive ? 'font-semibold text-[#0071e3]' : 'font-normal text-[#86868b]'
                }`}
              >
                <span className="sm:hidden">{item.shortLabel || item.label}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
            </button>
          );
        })}

        {onLogout && !isAdmin && (
          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            className="group relative flex flex-col items-center justify-center min-w-[48px] sm:min-w-[64px] flex-1 h-full px-1 transition-all duration-150 cursor-pointer select-none active:scale-95 text-[#ff3b30]"
          >
            <div className="flex items-center justify-center w-9 sm:w-10 h-6 rounded-full bg-[#ff3b30]/10 group-hover:bg-[#ff3b30]/20 transition-colors">
              <span className="material-symbols-outlined text-[19px]">logout</span>
            </div>
            <span className="text-[0.63rem] sm:text-[0.68rem] font-semibold tracking-tight leading-tight mt-0.5 truncate max-w-full whitespace-nowrap text-[#ff3b30]">
              Sair
            </span>
          </button>
        )}
      </div>
    </nav>
  );
};
