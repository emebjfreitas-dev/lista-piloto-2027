import React from 'react';
import { ScreenType, UserRole } from '../types';
import {
  Home,
  Users,
  CalendarCheck,
  AlertCircle,
  BarChart2,
  MapPin,
  HeartHandshake,
  Cloud,
  ShieldCheck,
  LogOut,
  LucideIcon,
} from 'lucide-react';

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
    icon: LucideIcon;
    adminOnly?: boolean;
    peb1Only?: boolean;
    hideForPeb2?: boolean;
  }> = [
    {
      id: 'home',
      label: 'Início',
      shortLabel: 'Início',
      icon: Home,
    },
    {
      id: 'turmas',
      label: userRole === 'usuario' ? selectedClassName || 'Minha Turma' : 'Turmas',
      shortLabel: userRole === 'usuario' ? 'Turma' : 'Turmas',
      icon: Users,
    },
    {
      id: 'frequencia_mensal',
      label: 'Faltas do Mês',
      shortLabel: 'Faltas Mês',
      icon: CalendarCheck,
      hideForPeb2: true,
    },
    {
      id: 'faltas_consecutivas',
      label: 'Faltas Consecutivas',
      shortLabel: 'Consecutivas',
      icon: AlertCircle,
    },
    {
      id: 'resumo',
      label: 'Resumo Mensal',
      shortLabel: 'Resumo',
      icon: BarChart2,
      adminOnly: true,
    },
    {
      id: 'mapa_estudantes',
      label: 'Mapa de Trajetos',
      shortLabel: 'Mapa KM',
      icon: MapPin,
    },
    {
      id: 'bolsa_familia',
      label: 'Bolsa Família',
      shortLabel: 'Bolsa',
      icon: HeartHandshake,
      adminOnly: true,
    },
    {
      id: 'planilha',
      label: 'Planilha & Drive',
      shortLabel: 'Nuvem',
      icon: Cloud,
      adminOnly: true,
    },
    {
      id: 'usuarios_acesso',
      label: 'Acessos',
      shortLabel: 'Acessos',
      icon: ShieldCheck,
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
          const IconComp = item.icon;
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
                <IconComp
                  className={`w-4 h-4 sm:w-[18px] sm:h-[18px] ${
                    isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'
                  }`}
                />
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
              <LogOut className="w-4 h-4 stroke-[2]" />
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
