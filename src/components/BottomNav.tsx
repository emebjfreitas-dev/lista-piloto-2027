import React, { useState } from 'react';
import { ScreenType, UserRole } from '../types';
import {
  Home,
  Users,
  CalendarCheck,
  AlertCircle,
  MapPin,
  BarChart2,
  HeartHandshake,
  Cloud,
  ShieldCheck,
  MoreHorizontal,
  X,
  ChevronRight,
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (currentScreen === 'login') {
    return null;
  }

  const isAdmin = userRole === 'admin';

  // Core mobile navigation items (max 5 items)
  const coreNavItems: Array<{
    id: ScreenType;
    label: string;
    icon: LucideIcon;
  }> = [
    {
      id: 'home',
      label: 'Início',
      icon: Home,
    },
    {
      id: 'turmas',
      label: userRole === 'usuario' ? selectedClassName || 'Turma' : 'Turmas',
      icon: Users,
    },
    ...(userRole !== 'peb2'
      ? [
          {
            id: 'frequencia_mensal' as ScreenType,
            label: 'Faltas',
            icon: CalendarCheck,
          },
        ]
      : []),
    {
      id: 'faltas_consecutivas',
      label: 'Alertas',
      icon: AlertCircle,
    },
    ...(isAdmin
      ? []
      : [
          {
            id: 'mapa_estudantes' as ScreenType,
            label: 'Mapa',
            icon: MapPin,
          },
        ]),
  ];

  const adminMoreItems: Array<{
    id: ScreenType;
    label: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      id: 'mapa_estudantes',
      label: 'Mapa de Trajetos & KM',
      description: 'Geolocalização dos estudantes e rotas até a escola',
      icon: MapPin,
    },
    {
      id: 'resumo',
      label: 'Resumo Mensal MEC',
      description: 'Scorecard executivo e metas institucionais',
      icon: BarChart2,
    },
    {
      id: 'bolsa_familia',
      label: 'Bolsa Família & Fretado',
      description: 'Acompanhamento de condicionalidades sociais',
      icon: HeartHandshake,
    },
    {
      id: 'planilha',
      label: 'Planilha & Google Drive',
      description: 'Sincronização em nuvem e exportação de dados',
      icon: Cloud,
    },
    {
      id: 'usuarios_acesso',
      label: 'Controle de Acessos',
      description: 'Permissões, auditoria e contas educacionais',
      icon: ShieldCheck,
    },
  ];

  const getIsActive = (itemId: ScreenType) => {
    if (itemId === 'turmas') {
      return currentScreen === 'turmas' || currentScreen === 'detalhes';
    }
    return currentScreen === itemId;
  };

  const isMoreActive =
    isAdmin &&
    ['mapa_estudantes', 'resumo', 'bolsa_familia', 'planilha', 'usuarios_acesso'].includes(
      currentScreen
    );

  return (
    <>
      {/* Barra de Navegação Inferior (Mobile/Tablet) */}
      <nav
        aria-label="Barra de Navegação Inferior"
        className="fixed bottom-0 left-0 right-0 w-full z-40 pb-safe bg-white/90 backdrop-blur-md border-t border-black/[0.06] lg:hidden"
      >
        <div className="flex items-center justify-around h-[56px] px-2 max-w-lg mx-auto">
          {coreNavItems.map((item) => {
            const isActive = getIsActive(item.id);
            const IconComp = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onChangeScreen(item.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex flex-col items-center justify-center flex-1 h-full py-1 transition-all cursor-pointer select-none active:scale-95 ${
                  isActive ? 'text-[#0071e3]' : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                <div
                  className={`flex items-center justify-center w-8 h-6 rounded-full transition-colors ${
                    isActive ? 'bg-[#0071e3]/10' : 'bg-transparent'
                  }`}
                >
                  <IconComp className="w-4 h-4" />
                </div>
                <span
                  className={`text-[0.66rem] tracking-tight leading-none mt-1 truncate ${
                    isActive ? 'font-semibold text-[#0071e3]' : 'font-normal text-[#86868b]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Botão "Mais" para Gestão / Admin */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className={`group flex flex-col items-center justify-center flex-1 h-full py-1 transition-all cursor-pointer select-none active:scale-95 ${
                isMoreActive || showMoreMenu
                  ? 'text-[#0071e3]'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-6 rounded-full transition-colors ${
                  isMoreActive || showMoreMenu ? 'bg-[#0071e3]/10' : 'bg-transparent'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </div>
              <span
                className={`text-[0.66rem] tracking-tight leading-none mt-1 truncate ${
                  isMoreActive || showMoreMenu
                    ? 'font-semibold text-[#0071e3]'
                    : 'font-normal text-[#86868b]'
                }`}
              >
                Mais
              </span>
            </button>
          )}

          {/* Botão Sair para professores */}
          {onLogout && !isAdmin && (
            <button
              type="button"
              onClick={onLogout}
              className="group flex flex-col items-center justify-center flex-1 h-full py-1 transition-all cursor-pointer select-none active:scale-95 text-[#86868b] hover:text-[#ba1a1a]"
            >
              <div className="flex items-center justify-center w-8 h-6 rounded-full">
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-[0.66rem] tracking-tight leading-none mt-1 truncate">
                Sair
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* Sheet Modal Minimalista de "Mais Ferramentas" para Gestão */}
      {showMoreMenu && isAdmin && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="relative bg-white rounded-t-3xl border-t border-black/[0.08] shadow-2xl p-5 pb-8 space-y-4 max-h-[80vh] overflow-y-auto animate-ios-sheet">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f]">Módulos Adicionais</h3>
                <p className="text-xs text-[#86868b]">Ferramentas executivas e de auditoria</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="w-8 h-8 rounded-full bg-[#f5f5f7] flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {adminMoreItems.map((item) => {
                const isActive = currentScreen === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onChangeScreen(item.id);
                    }}
                    className={`w-full p-3 rounded-2xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#0071e3]/10 text-[#0071e3]'
                        : 'hover:bg-[#f5f5f7] text-[#1d1d1f]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-[#0071e3] text-white'
                            : 'bg-[#f5f5f7] text-[#6e6e73]'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-xs sm:text-sm block truncate">
                          {item.label}
                        </span>
                        <span className="text-[0.72rem] text-[#86868b] block truncate">
                          {item.description}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#86868b] shrink-0" />
                  </button>
                );
              })}
            </div>

            {onLogout && (
              <div className="pt-2 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onLogout();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-[#ba1a1a] hover:bg-[#fff2f2] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair da Conta Institucional</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
