import React, { useState } from 'react';
import { AuthorizedUser, ScreenType, UserRole } from '../types';
import {
  Home,
  Users,
  CalendarCheck2,
  ShieldAlert,
  HeartHandshake,
  ShieldCheck,
  SlidersHorizontal,
  X,
  ChevronRight,
  LogOut,
  LucideIcon,
  Database,
  FileCode2,
  BarChart3,
  CalendarDays,
} from 'lucide-react';

interface BottomNavProps {
  currentScreen: ScreenType;
  userRole?: UserRole;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  selectedClassName?: string;
  onChangeScreen: (screen: ScreenType) => void;
  onLogout?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentScreen,
  userRole = 'admin',
  teacherRoleType,
  onChangeScreen,
  onLogout,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (currentScreen === 'login') {
    return null;
  }

  const isAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';

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
      label: 'Turmas',
      icon: Users,
    },
    ...(userRole !== 'peb2'
      ? [
          {
            id: 'frequencia_mensal' as ScreenType,
            label: 'Faltas',
            icon: CalendarCheck2,
          },
        ]
      : []),
    {
      id: 'faltas_consecutivas',
      label: 'Busca Ativa',
      icon: ShieldAlert,
    },
  ];

  const adminMoreItems: Array<{
    id: ScreenType;
    label: string;
    description: string;
    icon: LucideIcon;
    tintClass: string;
  }> = [
    {
      id: 'resumo',
      label: 'Resumo & Mapa',
      description: 'Frequência mensal e mapa de ausências',
      icon: BarChart3,
      tintClass: 'bg-[#e8f0fe] text-[#1a4fa3]',
    },
    {
      id: 'bolsa_familia',
      label: 'Bolsa Família & Fretado',
      description: 'Acompanhamento de condicionalidades sociais',
      icon: HeartHandshake,
      tintClass: 'bg-[#fef3c7] text-[#92400e]',
    },
    {
      id: 'dias_letivos',
      label: '200 Dias Letivos',
      description: 'Calendário oficial e feriados 2027',
      icon: CalendarDays,
      tintClass: 'bg-[#eaf6ef] text-[#005035]',
    },
    {
      id: 'usuarios_acesso',
      label: 'Acessos & Segurança',
      description: 'Permissões, auditoria e alertas FCM',
      icon: ShieldCheck,
      tintClass: 'bg-[#f2f2f7] text-[#1d1d1f]',
    },
    {
      id: 'diagnostico_bd',
      label: 'Diagnóstico do Banco',
      description: 'Consistência cadastral e nuvem',
      icon: Database,
      tintClass: 'bg-[#e8f0fe] text-[#1a4fa3]',
    },
    {
      id: 'importar_deficiencias_htm',
      label: 'Deficiências (.HTM)',
      description: 'Importar registros SED para AEE',
      icon: FileCode2,
      tintClass: 'bg-[#eaf6ef] text-[#005035]',
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
    [
      'resumo',
      'bolsa_familia',
      'dias_letivos',
      'usuarios_acesso',
      'diagnostico_bd',
      'importar_deficiencias_htm',
    ].includes(currentScreen);

  return (
    <>
      {/* Barra de Navegação Inferior Enxuta (Mobile & Tablet) */}
      <nav
        aria-label="Barra de Navegação Inferior"
        className="fixed bottom-0 left-0 right-0 w-full z-40 pb-safe bg-white/95 backdrop-blur-xl shadow-[0_-1px_12px_rgba(0,0,0,0.06)] lg:hidden"
      >
        <div className="flex items-center justify-around h-[62px] px-2 max-w-lg mx-auto gap-1">
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
                className="group flex flex-col items-center justify-center flex-1 h-full py-1 transition-all cursor-pointer select-none active:scale-95"
              >
                <div
                  className={`flex items-center justify-center px-3 h-7 rounded-xl transition-colors ${
                    isActive ? 'bg-[#e8f0fe] text-[#0071e3]' : 'text-[#6e6e73]'
                  }`}
                >
                  <IconComp
                    className={`w-[18px] h-[18px] transition-colors ${
                      isActive ? 'stroke-[2.25]' : 'stroke-[1.85]'
                    }`}
                  />
                </div>
                <span
                  className={`text-[11px] tracking-tight leading-none mt-1 truncate transition-colors ${
                    isActive ? 'font-semibold text-[#1d1d1f]' : 'font-medium text-[#6e6e73]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              aria-expanded={showMoreMenu}
              className="group flex flex-col items-center justify-center flex-1 h-full py-1 transition-all cursor-pointer select-none active:scale-95"
            >
              <div
                className={`flex items-center justify-center px-3 h-7 rounded-xl transition-colors ${
                  isMoreActive || showMoreMenu
                    ? 'bg-[#e8f0fe] text-[#0071e3]'
                    : 'text-[#6e6e73]'
                }`}
              >
                <SlidersHorizontal
                  className={`w-[18px] h-[18px] transition-colors ${
                    isMoreActive || showMoreMenu ? 'stroke-[2.25]' : 'stroke-[1.85]'
                  }`}
                />
              </div>
              <span
                className={`text-[11px] tracking-tight leading-none mt-1 truncate transition-colors ${
                  isMoreActive || showMoreMenu
                    ? 'font-semibold text-[#1d1d1f]'
                    : 'font-medium text-[#6e6e73]'
                }`}
              >
                Gestão
              </span>
            </button>
          )}

          {onLogout && !isAdmin && (
            <button
              type="button"
              onClick={onLogout}
              className="group flex flex-col items-center justify-center flex-1 h-full py-1 transition-all cursor-pointer select-none active:scale-95 text-[#6e6e73] hover:text-[#dc2626]"
            >
              <div className="flex items-center justify-center px-3 h-7 rounded-xl">
                <LogOut className="w-[18px] h-[18px] text-[#dc2626] stroke-[1.9]" />
              </div>
              <span className="text-[11px] font-medium tracking-tight leading-none mt-1 truncate text-[#6e6e73]">
                Sair
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* Sheet Modal de Gestão (Mobile/Tablet) */}
      {showMoreMenu && isAdmin && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="relative bg-white rounded-t-3xl shadow-2xl p-5 pb-8 space-y-3 max-h-[82vh] overflow-y-auto animate-ios-sheet">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="text-base font-semibold text-[#1d1d1f]">Ferramentas de Gestão</h3>
                <p className="text-xs text-[#6e6e73]">Acesso direto aos módulos administrativos</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="w-8 h-8 rounded-full bg-[#f2f2f7] hover:bg-[#e5e5ea] flex items-center justify-center text-[#1d1d1f] cursor-pointer transition-colors"
                aria-label="Fechar menu de gestão"
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
                        ? 'bg-[#1d1d1f] text-white'
                        : 'bg-[#f8f8fb] hover:bg-[#f2f2f7] text-[#1d1d1f]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-white/15 text-white' : item.tintClass
                        }`}
                      >
                        <IconComp className="w-4 h-4 stroke-[2]" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-xs sm:text-sm block truncate">
                          {item.label}
                        </span>
                        <span
                          className={`text-[11px] block truncate ${
                            isActive ? 'text-white/75' : 'text-[#6e6e73]'
                          }`}
                        >
                          {item.description}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-white/75' : 'text-[#86868b]'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {onLogout && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onLogout();
                  }}
                  className="w-full py-2.5 px-4 rounded-2xl text-[#b91c1c] bg-[#fee2e2]/70 hover:bg-[#fee2e2] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Encerrar Sessão</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
