import React from 'react';
import { ScreenType, UserRole } from '../types';

interface BottomNavProps {
  currentScreen: ScreenType;
  userRole?: UserRole;
  selectedClassName?: string;
  onChangeScreen: (screen: ScreenType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentScreen,
  userRole = 'admin',
  selectedClassName,
  onChangeScreen,
}) => {
  if (currentScreen === 'login') {
    return null;
  }

  const isAdmin = userRole === 'admin';

  const allNavItems: Array<{
    id: ScreenType;
    label: string;
    subtitle: string;
    icon: string;
    activeBg: string;
    activeText: string;
    adminOnly?: boolean;
  }> = [
    {
      id: 'turmas',
      label: userRole === 'usuario' ? '1. Minha Turma' : '1. Turmas',
      subtitle: userRole === 'usuario' ? selectedClassName || 'Sua Sala' : '40 Salas',
      icon: 'groups',
      activeBg: 'bg-[#003440]',
      activeText: 'text-white',
    },
    {
      id: 'frequencia_mensal',
      label: userRole === 'peb2' ? '2. Frequência' : '2. Lançar Faltas',
      subtitle: userRole === 'peb2' ? 'Consultar Mês' : 'Anotar Mês',
      icon: 'edit_calendar',
      activeBg: 'bg-[#005035]',
      activeText: 'text-white',
    },
    {
      id: 'planilha',
      label: '3. Planilha',
      subtitle: 'Abas & Fotos',
      icon: 'table_chart',
      activeBg: 'bg-[#003440]',
      activeText: 'text-white',
      adminOnly: true,
    },
    {
      id: 'dias_letivos',
      label: '4. 200 Dias',
      subtitle: 'Calendário',
      icon: 'calendar_month',
      activeBg: 'bg-[#003440]',
      activeText: 'text-white',
      adminOnly: true,
    },
    {
      id: 'usuarios_acesso',
      label: '5. Acessos',
      subtitle: 'E-mails SME',
      icon: 'manage_accounts',
      activeBg: 'bg-[#005035]',
      activeText: 'text-white',
      adminOnly: true,
    },
  ];

  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdmin);

  const getIsActive = (itemId: ScreenType) => {
    if (itemId === 'turmas') {
      return currentScreen === 'turmas' || currentScreen === 'detalhes' || currentScreen === 'resumo';
    }
    return currentScreen === itemId;
  };

  return (
    <nav
      aria-label="Menu Inferior Interativo"
      className="fixed bottom-0 left-0 right-0 w-full z-40 pb-safe bg-white/95 backdrop-blur-xl border-t-2 border-[#b4c0c4]/80 shadow-[0_-6px_24px_rgba(0,52,64,0.10)]"
    >
      <div
        className={`flex justify-around items-center h-[82px] px-2 sm:px-4 mx-auto gap-2 ${
          isAdmin ? 'max-w-xl md:max-w-3xl lg:max-w-5xl' : 'max-w-md sm:max-w-lg'
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
              className={`group relative flex flex-col items-center justify-center min-h-[62px] flex-1 rounded-2xl px-2 py-1.5 transition-all duration-200 cursor-pointer border ${
                isActive
                  ? `${item.activeBg} ${item.activeText} border-transparent shadow-md -translate-y-0.5`
                  : 'bg-[#f4f7f5]/70 hover:bg-[#e7ece9] text-[#2c373a] border-[#d5dddf] active:scale-95'
              }`}
            >
              {/* Active top indicator bar */}
              {isActive && (
                <span className="absolute top-1 w-7 h-1 rounded-full bg-[#a4f3ca]" />
              )}

              <span
                className={`material-symbols-outlined text-[24px] transition-transform duration-200 ${
                  isActive ? 'scale-105' : 'group-hover:scale-105 text-[#003440]'
                }`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>

              <span className="text-[0.8rem] sm:text-[0.86rem] font-extrabold tracking-tight leading-tight mt-0.5 truncate max-w-full">
                {item.label}
              </span>

              <span
                className={`text-[0.68rem] font-semibold leading-none truncate max-w-full ${
                  isActive ? 'text-[#c3e5f4]' : 'text-[#566366]'
                }`}
              >
                {item.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
