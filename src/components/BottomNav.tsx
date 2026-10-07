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
    icon: string;
    adminOnly?: boolean;
  }> = [
    {
      id: 'turmas',
      label: userRole === 'usuario' ? selectedClassName || 'Turma' : 'Turmas',
      icon: 'groups',
    },
    {
      id: 'frequencia_mensal',
      label: userRole === 'peb2' ? 'Frequência' : 'Lançar Faltas',
      icon: 'edit_calendar',
    },
    {
      id: 'planilha',
      label: 'Planilha',
      icon: 'table_chart',
      adminOnly: true,
    },
    {
      id: 'dias_letivos',
      label: '200 Dias',
      icon: 'calendar_month',
      adminOnly: true,
    },
    {
      id: 'usuarios_acesso',
      label: 'Prof. & Acessos',
      icon: 'manage_accounts',
      adminOnly: true,
    },
  ];

  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdmin);

  const getIsActive = (itemId: ScreenType) => {
    if (itemId === 'turmas') {
      return (
        currentScreen === 'turmas' ||
        currentScreen === 'detalhes' ||
        currentScreen === 'resumo'
      );
    }
    return currentScreen === itemId;
  };

  return (
    <nav
      aria-label="Barra de Navegação Inferior iOS"
      className="fixed bottom-0 left-0 right-0 w-full z-40 pb-safe ios-glass border-t border-black/[0.07] shadow-[0_-2px_20px_rgba(0,0,0,0.04)]"
    >
      <div
        className={`flex justify-around items-center h-[60px] px-2 mx-auto ${
          isAdmin ? 'max-w-xl md:max-w-2xl' : 'max-w-sm'
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
              className={`group relative flex flex-col items-center justify-center flex-1 h-full px-1 transition-all duration-200 cursor-pointer select-none active:scale-92 ${
                isActive
                  ? 'text-[#005035]'
                  : 'text-[#8e8e93] hover:text-[#3c3c43]'
              }`}
            >
              <div
                className={`flex items-center justify-center w-11 h-7 rounded-full transition-colors duration-200 ${
                  isActive ? 'bg-[#005035]/12' : 'bg-transparent'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px] transition-transform duration-200"
                  style={
                    isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 600" } : undefined
                  }
                >
                  {item.icon}
                </span>
              </div>

              <span
                className={`text-[0.68rem] tracking-tight leading-tight mt-0.5 truncate max-w-full ${
                  isActive ? 'font-bold text-[#005035]' : 'font-medium text-[#8e8e93]'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            className="group relative flex flex-col items-center justify-center flex-1 h-full px-1 transition-all duration-200 cursor-pointer select-none active:scale-92 text-[#ba1a1a] hover:text-[#93000a]"
          >
            <div className="flex items-center justify-center w-11 h-7 rounded-full bg-[#ffdad6]/40 group-hover:bg-[#ffdad6]/75 transition-colors duration-200">
              <span className="material-symbols-outlined text-[21px]">logout</span>
            </div>
            <span className="text-[0.68rem] font-bold tracking-tight leading-tight mt-0.5 truncate max-w-full text-[#ba1a1a]">
              Sair
            </span>
          </button>
        )}
      </div>
    </nav>
  );
};
