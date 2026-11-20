import React, { useState, useEffect } from 'react';
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
  BarChart3,
  CalendarDays,
  CloudCheck,
  CloudUpload,
  Loader2,
} from 'lucide-react';
import { subscribeToSyncStatus, SyncStatusSnapshot } from '../services/firebaseSync';
import { flushPendingOfflineQueue } from '../services/db';

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
  const [isFlushingCloud, setIsFlushingCloud] = useState(false);
  const [syncSnapshot, setSyncSnapshot] = useState<SyncStatusSnapshot>({
    status: 'synced',
    pendingCount: 0,
    lastSyncedAtISO: null,
    lastError: null,
    queue: [],
  });

  useEffect(() => {
    const unsubSync = subscribeToSyncStatus((snap) => {
      setSyncSnapshot(snap);
    });
    return () => unsubSync();
  }, []);

  const handleManualSync = async () => {
    if (isFlushingCloud) return;
    setIsFlushingCloud(true);
    try {
      await flushPendingOfflineQueue();
    } catch (err) {
      console.warn('Aviso ao sincronizar nuvem:', err);
    } finally {
      setIsFlushingCloud(false);
    }
  };

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
      id: userRole === 'usuario' ? 'detalhes' : 'turmas',
      label: userRole === 'usuario' ? 'Minha Turma' : 'Turmas',
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
      id: 'bolsa_familia',
      label: 'Bolsa Família',
      description: 'Estudantes beneficiados e frequência LDB',
      icon: HeartHandshake,
      tintClass: 'bg-amber-500/12 text-amber-700',
    },
    {
      id: 'dias_letivos',
      label: '200 Dias Letivos',
      description: 'Calendário oficial e feriados 2027',
      icon: CalendarDays,
      tintClass: 'bg-emerald-500/12 text-emerald-700',
    },
    {
      id: 'usuarios_acesso',
      label: 'Central Administrativa',
      description: 'Acessos, segurança, banco, fotos, PDFs e .HTM',
      icon: ShieldCheck,
      tintClass: 'bg-[#0071e3]/12 text-[#0071e3]',
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
        className="fixed bottom-0 left-0 right-0 w-full z-40 pb-safe bg-white/98 backdrop-blur-xl shadow-[0_-6px_24px_rgba(0,0,0,0.32)] lg:hidden"
      >
        <div className="flex items-center justify-around h-[68px] px-2 max-w-lg mx-auto gap-1">
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
                className="group flex flex-col items-center justify-center flex-1 min-w-0 min-h-[48px] h-full py-1.5 px-1 transition-transform cursor-pointer select-none active:scale-95"
              >
                <div
                  className={`flex items-center justify-center px-3.5 h-8 rounded-xl transition-colors ${
                    isActive ? 'bg-blue-100 text-[#0b3b8c]' : 'text-slate-600'
                  }`}
                >
                  <IconComp
                    className={`w-5 h-5 transition-colors ${
                      isActive ? 'stroke-[1.9]' : 'stroke-[1.5]'
                    }`}
                  />
                </div>
                <span
                  className={`text-xs tracking-tight leading-tight mt-1 break-words text-center max-w-full transition-colors ${
                    isActive ? 'font-bold text-[#0b3b8c]' : 'font-semibold text-slate-600'
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
              className="group flex flex-col items-center justify-center flex-1 min-w-0 min-h-[48px] h-full py-1.5 px-1 transition-transform cursor-pointer select-none active:scale-95 relative"
            >
              <div
                className={`relative flex items-center justify-center px-3.5 h-8 rounded-xl transition-colors ${
                  isMoreActive || showMoreMenu
                    ? 'bg-blue-100 text-[#0b3b8c]'
                    : 'text-slate-600'
                }`}
              >
                <SlidersHorizontal
                  className={`w-5 h-5 transition-colors ${
                    isMoreActive || showMoreMenu ? 'stroke-[1.9]' : 'stroke-[1.5]'
                  }`}
                />
                {syncSnapshot.pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-600 shadow-[0_0_0_2px_#ffffff]" />
                )}
              </div>
              <span
                className={`text-xs tracking-tight leading-tight mt-1 break-words text-center max-w-full transition-colors ${
                  isMoreActive || showMoreMenu
                    ? 'font-bold text-[#0b3b8c]'
                    : 'font-semibold text-slate-600'
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
              className="group flex flex-col items-center justify-center flex-1 min-w-0 min-h-[48px] h-full py-1.5 px-1 transition-transform cursor-pointer select-none active:scale-95 text-slate-600 hover:text-[#b91c1c]"
            >
              <div className="flex items-center justify-center px-3.5 h-8 rounded-xl">
                <LogOut className="w-5 h-5 text-[#dc2626] stroke-[1.5]" />
              </div>
              <span className="text-xs font-semibold tracking-tight leading-tight mt-1 break-words text-center max-w-full text-slate-600">
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
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm animate-backdrop-in"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="relative bg-white rounded-t-3xl shadow-[0_-20px_56px_rgba(2,6,23,0.4)] p-5 pb-8 space-y-3.5 max-h-[84vh] overflow-y-auto animate-ios-sheet min-w-0">
            <div className="flex items-center justify-between gap-3 pb-1 min-w-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-950 break-words">Ferramentas de Gestão</h3>
                <p className="text-xs sm:text-sm text-slate-700 break-words">Acesso direto aos módulos administrativos e nuvem</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="w-11 h-11 rounded-full bg-[#edf2f7] hover:bg-[#dfe6f0] flex items-center justify-center text-slate-950 cursor-pointer transition-colors shrink-0"
                aria-label="Fechar menu de gestão"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controle de Sincronização em Nuvem dentro de Gestão */}
            <div
              className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 min-w-0 ${
                syncSnapshot.pendingCount > 0
                  ? 'bg-amber-100/90 text-amber-950'
                  : 'bg-[#edf2f7] text-slate-950'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    syncSnapshot.pendingCount > 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isFlushingCloud || syncSnapshot.status === 'syncing' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#0052cc]" />
                  ) : syncSnapshot.pendingCount > 0 ? (
                    <CloudUpload className="w-5 h-5" />
                  ) : (
                    <CloudCheck className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold block break-words leading-snug">
                    {syncSnapshot.pendingCount > 0
                      ? `${syncSnapshot.pendingCount} registro(s) pendente(s)`
                      : 'Nuvem Sincronizada'}
                  </span>
                  <span className="text-xs text-slate-600 block break-words">
                    Sincronização automática em segundo plano
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isFlushingCloud}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-bold text-xs cursor-pointer shrink-0 transition-colors disabled:opacity-50"
              >
                {isFlushingCloud ? 'Enviando...' : 'Sincronizar'}
              </button>
            </div>

            <div className="space-y-2">
              {adminMoreItems.map((item) => {
                const isActive =
                  currentScreen === item.id ||
                  (item.id === 'usuarios_acesso' &&
                    (currentScreen === 'diagnostico_bd' ||
                      currentScreen === 'importar_deficiencias_htm'));
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onChangeScreen(item.id);
                    }}
                    className={`w-full p-3.5 rounded-2xl flex items-center justify-between gap-3.5 text-left transition-all duration-200 cursor-pointer min-w-0 ${
                      isActive
                        ? 'bg-[#0b3b8c] text-white shadow-[0_8px_20px_rgba(11,59,140,0.28)]'
                        : 'bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-950'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-white/20 text-white' : item.tintClass
                        }`}
                      >
                        <IconComp className="w-5 h-5 stroke-[2]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-sm sm:text-base block break-words leading-snug">
                          {item.label}
                        </span>
                        <span
                          className={`text-xs block break-words leading-snug mt-0.5 ${
                            isActive ? 'text-blue-100' : 'text-slate-700'
                          }`}
                        >
                          {item.description}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-5 h-5 shrink-0 ${
                        isActive ? 'text-blue-100' : 'text-slate-600'
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
                  className="w-full min-h-[48px] py-3 px-4 rounded-2xl text-rose-950 bg-rose-100 hover:bg-rose-200 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
