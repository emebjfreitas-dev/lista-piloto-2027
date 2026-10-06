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

  const navItems: Array<{
    id: ScreenType;
    label: string;
    subtitle: string;
    icon: string;
    activeBg: string;
    activeText: string;
  }> = [
    {
      id: 'turmas',
      label: userRole === 'usuario' ? 'Minha Turma' : '1. Turmas',
      subtitle: userRole === 'usuario' ? selectedClassName || 'Regente' : '40 Salas',
      icon: 'groups',
      activeBg: 'bg-[#003440]',
      activeText: 'text-white',
    },
    {
      id: 'frequencia_mensal',
      label: '2. Faltas',
      subtitle: 'Anotar Mês',
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
    },
    {
      id: 'dias_letivos',
      label: '4. 200 Dias',
      subtitle: 'Calendário',
      icon: 'calendar_month',
      activeBg: 'bg-[#003440]',
      activeText: 'text-white',
    },
    {
      id: 'usuarios_acesso',
      label: '5. Acessos',
      subtitle: 'E-mails SME',
      icon: 'manage_accounts',
      activeBg: 'bg-[#005035]',
      activeText: 'text-white',
    },
  ];

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
      <div className="flex justify-around items-center h-[82px] px-1.5 sm:px-3 max-w-xl md:max-w-3xl lg:max-w-5xl mx-auto gap-1">
        {navItems.map((item) => {
          const isActive = getIsActive(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeScreen(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-center min-h-[62px] flex-1 rounded-2xl px-1.5 py-1.5 transition-all duration-200 cursor-pointer border ${
                isActive
                  ? `${item.activeBg} ${item.activeText} border-transparent shadow-md -translate-y-0.5`
                  : 'bg-[#f4f7f5]/70 hover:bg-[#e7ece9] text-[#374144] border-[#d5dddf] active:scale-95'
              }`}
            >
              {/* Active top indicator bar */}
              {isActive && (
                <span className="absolute top-1 w-6 h-1 rounded-full bg-[#a4f3ca]" />
              )}

              <span
                className={`material-symbols-outlined text-[24px] transition-transform duration-200 ${
                  isActive ? 'scale-105' : 'group-hover:scale-105 text-[#003440]'
                }`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>

              <span className="text-[0.76rem] sm:text-[0.82rem] font-extrabold tracking-tight leading-tight mt-0.5 truncate max-w-full">
                {item.label}
              </span>

              <span
                className={`text-[0.64rem] font-semibold leading-none truncate max-w-full hidden sm:block ${
                  isActive ? 'text-[#c3e5f4]' : 'text-[#647073]'
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
