import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ClassGroup, ScreenType, UserRole } from '../types';
import {
  PushNoticeItem,
  PushNoticeCategory,
  registerPushServiceWorker,
  getPushPermissionState,
  requestPushNotificationPermission,
  triggerPushNotification,
  getStoredCustomPushNotices,
  getReadPushNoticeIds,
  markPushNoticeAsRead,
  markAllPushNoticesAsRead,
  buildContextualPushNotices,
  onInAppPushBanner,
} from '../services/pushNotificationService';

interface PushNotificationCenterProps {
  visibleClasses: ClassGroup[];
  allClasses?: ClassGroup[];
  userRole?: UserRole;
  userName?: string;
  onNavigateScreen?: (screen: ScreenType, targetClassId?: string) => void;
}

export const PushNotificationCenter: React.FC<PushNotificationCenterProps> = ({
  visibleClasses,
  allClasses = [],
  userRole = 'usuario',
  userName,
  onNavigateScreen,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [swActive, setSwActive] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getPushPermissionState()
  );
  const [customNotices, setCustomNotices] = useState<PushNoticeItem[]>(() =>
    getStoredCustomPushNotices()
  );
  const [readIds, setReadIds] = useState<string[]>(() => getReadPushNoticeIds());
  const [filterCategory, setFilterCategory] = useState<'all' | PushNoticeCategory>('all');
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState<PushNoticeCategory>('prazo');
  const [newTargetClassId, setNewTargetClassId] = useState<string>('all');
  const [activeBanner, setActiveBanner] = useState<PushNoticeItem | null>(null);
  const hasShownStartupFeedbackSummaryRef = useRef(false);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Registra o Service Worker (/sw.js) automaticamente ao montar e escuta cliques vindos do SW
  useEffect(() => {
    let mounted = true;
    registerPushServiceWorker().then((reg) => {
      if (mounted && reg) {
        setSwActive(true);
      }
    });

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'PUSH_NOTIFICATION_CLICKED' && data.targetScreen) {
        onNavigateScreen?.(data.targetScreen as ScreenType);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    const unsubscribeBanner = onInAppPushBanner((notice) => {
      setCustomNotices(getStoredCustomPushNotices());
      setActiveBanner(notice);
    });

    return () => {
      mounted = false;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      unsubscribeBanner();
    };
  }, [onNavigateScreen]);

  // Auto-oculta o banner flutuante estilo Apple após 5.5 segundos
  useEffect(() => {
    if (!activeBanner) return;
    const timer = setTimeout(() => {
      setActiveBanner(null);
    }, 5500);
    return () => clearTimeout(timer);
  }, [activeBanner]);

  // Fecha o popover ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const allNotices = useMemo(() => {
    return buildContextualPushNotices(visibleClasses, customNotices, readIds);
  }, [visibleClasses, customNotices, readIds]);

  const unreadCount = useMemo(() => {
    return allNotices.filter((n) => !n.read).length;
  }, [allNotices]);

  // Assim que a professora abre o app, se houver feedbacks da família na Busca Ativa ainda não lidos, exibe um Resumo Push automático
  useEffect(() => {
    if (hasShownStartupFeedbackSummaryRef.current) return;
    const unreadFeedbackNotices = allNotices.filter(
      (n) => n.category === 'busca_ativa' && n.id.startsWith('auto_feedback_') && !n.read
    );
    if (unreadFeedbackNotices.length > 0) {
      hasShownStartupFeedbackSummaryRef.current = true;
      const first = unreadFeedbackNotices[0];
      const summaryNotice: PushNoticeItem =
        unreadFeedbackNotices.length === 1
          ? first
          : {
              id: first.id,
              title: `Resumo Push • ${unreadFeedbackNotices.length} Retornos da Família`,
              body: `${first.title.replace('Feedback da Família • ', '')}: ${first.body} (Toque para abrir e ler todas as ocorrências com calma)`,
              category: 'busca_ativa',
              targetClassId: first.targetClassId,
              targetScreen: 'faltas_consecutivas',
              createdAt: 'Ao abrir o app',
              authorName: 'Secretaria Escolar',
            };
      triggerPushNotification(summaryNotice, {
        saveToFeed: false,
        showBanner: true,
      });
    }
  }, [allNotices]);

  const filteredNotices = useMemo(() => {
    if (filterCategory === 'all') return allNotices;
    return allNotices.filter((n) => n.category === filterCategory);
  }, [allNotices, filterCategory]);

  const handleEnableOrTestPush = async () => {
    if (permission !== 'granted') {
      const res = await requestPushNotificationPermission();
      setPermission(res.permission);
      setSwActive(res.swReady);

      await triggerPushNotification(
        {
          title: 'Notificações Push Ativadas',
          body: 'Você receberá alertas de novos avisos pedagógicos e prazos próximos de fechamento.',
          category: 'aviso',
          targetScreen: 'frequencia_mensal',
        },
        { saveToFeed: false, showBanner: true }
      );
      return;
    }

    // Dispara um teste real via Service Worker
    await triggerPushNotification(
      {
        title: 'Lembrete de Prazo • Frequência Mensal',
        body: 'O fechamento mensal de presença está aberto. Confira as faltas e observações da sua turma.',
        category: 'prazo',
        targetScreen: 'frequencia_mensal',
      },
      { saveToFeed: false, showBanner: true }
    );
  };

  const handleCreateAndSendNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newBody.trim()) return;

    const defaultScreen: ScreenType =
      newCategory === 'prazo'
        ? 'frequencia_mensal'
        : newCategory === 'busca_ativa'
        ? 'faltas_consecutivas'
        : 'resumo';

    await triggerPushNotification(
      {
        title: newTitle.trim(),
        body: newBody.trim(),
        category: newCategory,
        targetClassId: newTargetClassId,
        targetScreen: defaultScreen,
        authorName: userName || 'Coordenação / Admin',
      },
      { saveToFeed: true, showBanner: true }
    );

    setCustomNotices(getStoredCustomPushNotices());
    setNewTitle('');
    setNewBody('');
    setShowComposer(false);
  };

  const handleNoticeClick = (notice: PushNoticeItem) => {
    const nextRead = markPushNoticeAsRead(notice.id);
    setReadIds(nextRead);
    setIsOpen(false);
    if (notice.targetScreen && onNavigateScreen) {
      onNavigateScreen(
        notice.targetScreen,
        notice.targetClassId && notice.targetClassId !== 'all'
          ? notice.targetClassId
          : undefined
      );
    }
  };

  const handleMarkAllRead = () => {
    const ids = allNotices.map((n) => n.id);
    const updated = markAllPushNoticesAsRead(ids);
    setReadIds(updated);
  };

  const getCategoryMeta = (cat: PushNoticeCategory) => {
    if (cat === 'prazo') {
      return {
        label: 'Prazo',
        icon: 'schedule',
        badgeClass: 'bg-[#ff9500]/15 text-[#b25000]',
        dotClass: 'bg-[#ff9500]',
      };
    }
    if (cat === 'busca_ativa') {
      return {
        label: 'Busca Ativa',
        icon: 'event_busy',
        badgeClass: 'bg-[#ff3b30]/15 text-[#ff3b30]',
        dotClass: 'bg-[#ff3b30]',
      };
    }
    return {
      label: 'Aviso',
      icon: 'campaign',
      badgeClass: 'bg-[#0071e3]/12 text-[#0071e3]',
      dotClass: 'bg-[#0071e3]',
    };
  };

  const classesForTargetSelect = allClasses.length > 0 ? allClasses : visibleClasses;

  return (
    <>
      {/* Botão Minimalista de Sino (Apple Notification Center) */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Central de Notificações Push e Prazos"
          title="Avisos e Prazos Próximos (Push)"
          className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
            isOpen
              ? 'bg-[#1d1d1f] text-white'
              : 'bg-[#e8e8ed]/85 hover:bg-[#d2d2d7]/80 text-[#1d1d1f]'
          }`}
        >
          <span className="material-symbols-outlined text-[19px]">
            {unreadCount > 0 ? 'notifications_active' : 'notifications'}
          </span>

          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#ff3b30] text-white text-[0.6rem] font-extrabold flex items-center justify-center tabular-nums shadow-2xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Popover Minimalista Estilo macOS / iOS Notification Center */}
        {isOpen && (
          <div className="fixed sm:absolute right-3 sm:right-0 top-[60px] sm:top-auto sm:mt-2.5 w-[calc(100vw-24px)] max-w-[380px] bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_22px_54px_rgba(0,0,0,0.16)] p-4 z-50 space-y-3 animate-gentle-fade">
            {/* Cabeçalho da Central Push */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[0.92rem] font-bold text-[#1d1d1f]">
                    Avisos &amp; Prazos
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold ${
                      swActive
                        ? 'bg-[#28cd41]/15 text-[#1d8338]'
                        : 'bg-[#f5f5f7] text-[#6e6e73]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {swActive ? 'Service Worker Ativo' : 'Push Web'}
                  </span>
                </div>
                <p className="text-[0.7rem] text-[#6e6e73] mt-0.5">
                  Alertas instantâneos de fechamento e busca ativa
                </p>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[0.7rem] font-semibold text-[#0066cc] hover:underline cursor-pointer shrink-0"
                >
                  Ler tudo
                </button>
              )}
            </div>

            {/* Barra de Ativação / Teste Rápido de Push via Service Worker */}
            <div className="p-2.5 rounded-2xl bg-[#f5f5f7] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[0.72rem] font-bold text-[#1d1d1f] block truncate">
                  {permission === 'granted'
                    ? 'Notificações Push Habilitadas'
                    : 'Receber Alertas no Dispositivo'}
                </span>
                <span className="text-[0.66rem] text-[#6e6e73] block truncate">
                  {permission === 'granted'
                    ? 'Toque ao lado para testar um alerta Push agora'
                    : 'Ative para ser avisado sobre prazos próximos'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleEnableOrTestPush}
                className={`h-[30px] px-3 rounded-full text-[0.7rem] font-bold shrink-0 cursor-pointer transition-all active:scale-95 ${
                  permission === 'granted'
                    ? 'bg-[#1d1d1f] text-white hover:bg-black'
                    : 'bg-[#0071e3] text-white hover:bg-[#0077ed]'
                }`}
              >
                {permission === 'granted' ? 'Testar Push' : 'Ativar Push'}
              </button>
            </div>

            {/* Filtros Minimalistas por Categoria */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="ios-segmented w-full justify-between">
                <button
                  type="button"
                  onClick={() => setFilterCategory('all')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-[0.7rem] ${
                    filterCategory === 'all' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Todos ({allNotices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('prazo')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-[0.7rem] ${
                    filterCategory === 'prazo' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Prazos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('busca_ativa')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-[0.7rem] ${
                    filterCategory === 'busca_ativa' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Busca Ativa
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('aviso')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-[0.7rem] ${
                    filterCategory === 'aviso' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Avisos
                </button>
              </div>
            </div>

            {/* Lista de Notificações */}
            <div className="max-h-[290px] overflow-y-auto space-y-1.5 pr-0.5">
              {filteredNotices.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[0.8rem] font-semibold text-[#1d1d1f]">
                    Nenhum aviso nesta categoria
                  </p>
                  <p className="text-[0.7rem] text-[#86868b] mt-0.5">
                    Você está em dia com todos os prazos.
                  </p>
                </div>
              ) : (
                filteredNotices.map((notice) => {
                  const meta = getCategoryMeta(notice.category);
                  return (
                    <button
                      key={notice.id}
                      type="button"
                      onClick={() => handleNoticeClick(notice)}
                      className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer flex items-start gap-2.5 ${
                        notice.read
                          ? 'bg-[#f5f5f7]/60 hover:bg-[#f5f5f7] opacity-80'
                          : 'bg-[#f5f5f7] hover:bg-[#e8e8ed]/70'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${meta.badgeClass}`}
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {meta.icon}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#6e6e73]">
                            {meta.label} • {notice.createdAt}
                          </span>
                          {!notice.read && (
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`}
                            />
                          )}
                        </div>
                        <p className="text-[0.78rem] font-bold text-[#1d1d1f] leading-snug mt-0.5">
                          {notice.title}
                        </p>
                        <p className="text-[0.72rem] text-[#6e6e73] leading-snug mt-0.5 line-clamp-2">
                          {notice.body}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Ação do Coordenador / Admin: Disparar Novo Aviso ou Prazo via Push */}
            {userRole === 'admin' && (
              <div className="pt-2 border-t border-black/[0.05]">
                {!showComposer ? (
                  <button
                    type="button"
                    onClick={() => setShowComposer(true)}
                    className="w-full min-h-[38px] rounded-2xl bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] font-bold text-[0.76rem] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[17px]">
                      send
                    </span>
                    <span>Enviar Aviso ou Alerta de Prazo (Push)</span>
                  </button>
                ) : (
                  <form onSubmit={handleCreateAndSendNotice} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.72rem] font-bold text-[#1d1d1f]">
                        Novo Disparo Push aos Professores
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowComposer(false)}
                        className="text-[0.7rem] font-semibold text-[#6e6e73] hover:text-[#1d1d1f] cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={newCategory}
                        onChange={(e) =>
                          setNewCategory(e.target.value as PushNoticeCategory)
                        }
                        className="h-[34px] px-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-[0.72rem] font-semibold focus:outline-none"
                      >
                        <option value="prazo">Categoria: Prazo Próximo</option>
                        <option value="aviso">Categoria: Aviso Geral</option>
                        <option value="busca_ativa">Categoria: Busca Ativa</option>
                      </select>

                      <select
                        value={newTargetClassId}
                        onChange={(e) => setNewTargetClassId(e.target.value)}
                        className="h-[34px] px-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-[0.72rem] font-semibold focus:outline-none"
                      >
                        <option value="all">Todas as Turmas</option>
                        {classesForTargetSelect.map((c) => (
                          <option key={c.id} value={c.id}>
                            Turma {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      required
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Título (ex: Prazo de Fechamento até Sexta)"
                      className="w-full h-[34px] px-3 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-[0.75rem] font-semibold focus:bg-white focus:outline-none"
                    />

                    <textarea
                      rows={2}
                      required
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      placeholder="Mensagem curta para notificar os professores..."
                      className="w-full p-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-[0.74rem] focus:bg-white focus:outline-none resize-none"
                    />

                    <button
                      type="submit"
                      className="w-full h-[36px] rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold text-[0.76rem] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        notifications_active
                      </span>
                      <span>Disparar Notificação Push Agora</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner Flutuante Minimalista Estilo Apple (macOS / iOS Dynamic Banner) */}
      {activeBanner && (
        <div className="fixed top-[64px] right-4 left-4 sm:left-auto sm:w-[370px] z-[90] animate-gentle-fade">
          <div
            onClick={() => {
              const target = activeBanner;
              setActiveBanner(null);
              handleNoticeClick(target);
            }}
            className="bg-[#1d1d1f]/95 backdrop-blur-2xl text-white p-3.5 rounded-3xl shadow-[0_16px_40px_rgba(0,0,0,0.25)] flex items-start gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-2xl bg-[#0071e3] text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[19px]">
                notifications_active
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.62rem] font-bold uppercase tracking-wider text-white/65">
                  Push • Agora
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBanner(null);
                  }}
                  className="text-white/60 hover:text-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    close
                  </span>
                </button>
              </div>
              <p className="text-[0.8rem] font-bold text-white leading-snug mt-0.5">
                {activeBanner.title}
              </p>
              <p className="text-[0.72rem] text-white/80 leading-snug mt-0.5 line-clamp-2">
                {activeBanner.body}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
