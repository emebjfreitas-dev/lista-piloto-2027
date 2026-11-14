import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { AttendanceWindowConfig, ClassGroup, ScreenType, UserRole } from '../types';
import {
  PushNoticeItem,
  PushNoticeCategory,
  registerPushServiceWorker,
  getPushPermissionState,
  triggerPushNotification,
  getStoredCustomPushNotices,
  getReadPushNoticeIds,
  markPushNoticeAsRead,
  markAllPushNoticesAsRead,
  buildContextualPushNotices,
  onInAppPushBanner,
} from '../services/pushNotificationService';
import {
  registerDeviceForFcm,
  unregisterDeviceFromFcm,
  subscribeToFcmNotifications,
  evaluateAndTriggerWindowClosingReminder,
  dispatchWindowClosingFcmAlert,
  getFcmCapabilitySnapshot,
} from '../services/fcmService';

interface PushNotificationCenterProps {
  visibleClasses: ClassGroup[];
  allClasses?: ClassGroup[];
  userRole?: UserRole;
  userEmail?: string;
  userName?: string;
  assignedClassIds?: string[];
  attendanceWindowConfig?: AttendanceWindowConfig;
  onNavigateScreen?: (screen: ScreenType, targetClassId?: string) => void;
}

export const PushNotificationCenter: React.FC<PushNotificationCenterProps> = ({
  visibleClasses,
  allClasses = [],
  userRole = 'usuario',
  userEmail = 'emebjfreitas@jundiai.sp.gov.br',
  userName,
  assignedClassIds = [],
  attendanceWindowConfig = { exceptionalOverrideOpen: false },
  onNavigateScreen,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [swActive, setSwActive] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getPushPermissionState()
  );
  const [hasFcmToken, setHasFcmToken] = useState<boolean>(() =>
    getFcmCapabilitySnapshot().hasFcmToken
  );
  const [fcmChannelLabel, setFcmChannelLabel] = useState<string>(() =>
    getFcmCapabilitySnapshot().hasFcmToken ? 'FCM Push Ativo' : 'Push Web'
  );
  const [fcmFeedbackMsg, setFcmFeedbackMsg] = useState<string | null>(null);
  const [isRegisteringFcm, setIsRegisteringFcm] = useState(false);
  const [isSendingFcmBroadcast, setIsSendingFcmBroadcast] = useState(false);

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

  // Registra Service Worker (/sw.js), escuta cliques e ativa canal FCM em tempo real
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
        onNavigateScreen?.(data.targetScreen as ScreenType, data.targetClassId);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    const unsubscribeBanner = onInAppPushBanner((notice) => {
      setCustomNotices(getStoredCustomPushNotices());
      setActiveBanner(notice);
    });

    const effectiveAssignedIds =
      assignedClassIds.length > 0
        ? assignedClassIds
        : visibleClasses.map((c) => c.id);

    const unsubscribeFcm = subscribeToFcmNotifications({
      userEmail,
      userRole,
      assignedClassIds: effectiveAssignedIds,
      onAlertReceived: () => {
        if (mounted) {
          setCustomNotices(getStoredCustomPushNotices());
        }
      },
    });

    // Se a permissão já estiver concedida, garante registro atualizado do token FCM no servidor
    if (getPushPermissionState() === 'granted') {
      registerDeviceForFcm({
        userEmail,
        userName: userName || userEmail.split('@')[0],
        userRole,
        assignedClassIds: effectiveAssignedIds,
      }).then((res) => {
        if (!mounted) return;
        setSwActive(res.swReady);
        setPermission(res.permission);
        if (res.hasPushSubscription || res.fcmToken) {
          setHasFcmToken(true);
          setFcmChannelLabel('FCM / Push Ativo');
        } else if (res.swReady) {
          setFcmChannelLabel('SW Push Ativo');
        }
      });
    }

    return () => {
      mounted = false;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      unsubscribeBanner();
      unsubscribeFcm();
    };
  }, [userEmail, userRole, userName, assignedClassIds, visibleClasses, onNavigateScreen]);

  // Monitora automaticamente o fechamento da janela de lançamento de presença
  useEffect(() => {
    if (visibleClasses.length === 0) return;
    void evaluateAndTriggerWindowClosingReminder({
      attendanceWindowConfig,
      visibleClasses,
      userEmail,
      userRole,
    });
  }, [attendanceWindowConfig, visibleClasses, userEmail, userRole]);

  // Auto-oculta o banner flutuante após 6 segundos
  useEffect(() => {
    if (!activeBanner) return;
    const timer = setTimeout(() => {
      setActiveBanner(null);
    }, 6000);
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

  // Resumo Push automático para retornos da família não lidos na Busca Ativa
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
    if (isRegisteringFcm) return;
    setIsRegisteringFcm(true);
    setFcmFeedbackMsg(null);
    try {
      const effectiveAssignedIds =
        assignedClassIds.length > 0
          ? assignedClassIds
          : visibleClasses.map((c) => c.id);

      const res = await registerDeviceForFcm({
        userEmail,
        userName: userName || userEmail.split('@')[0],
        userRole,
        assignedClassIds: effectiveAssignedIds,
      });
      const isPushActive = Boolean(res.hasPushSubscription || res.fcmToken);
      setPermission(res.permission);
      setSwActive(res.swReady);
      setHasFcmToken(isPushActive);
      setFcmChannelLabel(isPushActive ? 'FCM / Push Ativo' : res.swReady ? 'SW Push Ativo' : 'Push Web');
      setFcmFeedbackMsg(res.message);

      if (res.ok) {
        const reminder = await evaluateAndTriggerWindowClosingReminder({
          attendanceWindowConfig,
          visibleClasses,
          userEmail,
          userRole,
          forceNotify: true,
        });
        if (!reminder) {
          await triggerPushNotification(
            {
              title: isPushActive
                ? 'Alertas Push Ativados neste Dispositivo'
                : 'Notificações de Prazo Ativadas',
              body: 'Você será alertado antes do encerramento da janela mensal de lançamento de presença.',
              category: 'prazo',
              targetScreen: 'frequencia_mensal',
              authorName: 'Sistema de Prazos EMEB Candelário',
            },
            { saveToFeed: false, showBanner: true }
          );
        }
      }
    } finally {
      setIsRegisteringFcm(false);
    }
  };

  const handleDisableFcmDevice = async () => {
    await unregisterDeviceFromFcm(userEmail);
    setHasFcmToken(false);
    setFcmChannelLabel('Push Pausado');
    setFcmFeedbackMsg('Notificações FCM pausadas neste dispositivo.');
  };

  const handleQuickWindowClosingAlert = async () => {
    if (isSendingFcmBroadcast) return;
    setIsSendingFcmBroadcast(true);
    setFcmFeedbackMsg(null);
    try {
      const classesPool = allClasses.length > 0 ? allClasses : visibleClasses;
      const res = await dispatchWindowClosingFcmAlert({
        targetAudience: 'pending_only',
        attendanceWindowConfig,
        classes: classesPool,
        senderEmail: userEmail,
        senderName: userName || 'Coordenação Escolar',
      });
      setCustomNotices(getStoredCustomPushNotices());
      setFcmFeedbackMsg(res.message);
    } finally {
      setIsSendingFcmBroadcast(false);
    }
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

    if (newCategory === 'prazo') {
      const classesPool = allClasses.length > 0 ? allClasses : visibleClasses;
      const res = await dispatchWindowClosingFcmAlert({
        title: newTitle.trim(),
        body: newBody.trim(),
        targetAudience: newTargetClassId === 'all' ? 'all' : 'pending_only',
        targetClassIds: [newTargetClassId],
        attendanceWindowConfig,
        classes: classesPool,
        senderEmail: userEmail,
        senderName: userName || 'Coordenação / Admin',
      });
      setFcmFeedbackMsg(res.message);
    } else {
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
    }

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
  const pendingSchoolClassesCount = classesForTargetSelect.filter((c) => c.isPending).length;

  return (
    <>
      {/* Botão Minimalista de Sino */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Central de Notificações FCM e Prazos"
          title="Avisos e Prazos da Janela de Frequência (FCM)"
          className={`relative w-10 h-10 rounded-full sm:rounded-xl flex items-center justify-center transition-colors cursor-pointer active:scale-95 ${
            isOpen
              ? 'bg-[#1d1d1f] text-white'
              : 'bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#1d1d1f]'
          }`}
        >
          {unreadCount > 0 ? (
            <BellRing className="w-[18px] h-[18px] stroke-[2.1]" />
          ) : (
            <Bell className="w-[18px] h-[18px] stroke-[2]" />
          )}

          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] px-1 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center justify-center tabular-nums">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Popover Notification Center */}
        {isOpen && (
          <div className="fixed sm:absolute right-3 sm:right-0 top-[68px] sm:top-auto sm:mt-2.5 w-[calc(100vw-24px)] max-w-[410px] bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_22px_54px_rgba(0,0,0,0.16)] p-4 z-50 space-y-3 animate-gentle-fade">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f]">
                    Avisos &amp; Prazos
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                      hasFcmToken
                        ? 'bg-[#eaf6ef] text-[#005035]'
                        : swActive
                        ? 'bg-[#e8f0fe] text-[#1a4fa3]'
                        : 'bg-[#f5f5f7] text-[#6e6e73]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {hasFcmToken ? 'FCM / Push Ativo' : swActive ? fcmChannelLabel : 'Push Web'}
                  </span>
                </div>
                <p className="text-xs text-[#6e6e73] mt-0.5">
                  Alertas Firebase (FCM) sobre fechamento de janela e busca ativa
                </p>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold text-[#0066cc] hover:underline cursor-pointer shrink-0"
                >
                  Ler tudo
                </button>
              )}
            </div>

            {/* Barra de Ativação FCM / Teste Rápido */}
            <div className="p-3 rounded-2xl bg-[#f5f5f7] space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-[#1d1d1f] block break-words leading-snug">
                    {permission === 'granted'
                      ? hasFcmToken
                        ? 'Dispositivo Conectado ao FCM'
                        : 'Alertas de Prazo Habilitados'
                      : 'Receber Alertas de Fechamento (FCM)'}
                  </span>
                  <span className="text-xs text-[#6e6e73] block break-words leading-snug">
                    {permission === 'granted'
                      ? 'Lembra automaticamente antes do encerramento da janela'
                      : 'Ative para evitar esquecimento no lançamento mensal'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={isRegisteringFcm}
                    onClick={handleEnableOrTestPush}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors duration-100 active:scale-95 disabled:opacity-60 ${
                      permission === 'granted'
                        ? 'bg-[#1d1d1f] text-white hover:bg-black'
                        : 'bg-[#0071e3] text-white hover:bg-[#0077ed]'
                    }`}
                  >
                    {isRegisteringFcm
                      ? 'Conectando...'
                      : permission === 'granted'
                      ? 'Testar FCM'
                      : 'Ativar FCM'}
                  </button>
                  {permission === 'granted' && hasFcmToken && (
                    <button
                      type="button"
                      onClick={handleDisableFcmDevice}
                      title="Pausar inscrição FCM neste dispositivo"
                      className="min-h-[38px] px-3 rounded-xl bg-white hover:bg-[#fee2e2] text-[#6e6e73] hover:text-[#991b1b] text-xs font-semibold cursor-pointer transition-colors duration-100"
                    >
                      Pausar
                    </button>
                  )}
                </div>
              </div>

              {fcmFeedbackMsg && (
                <p className="text-xs font-medium text-[#374151] bg-white/80 rounded-xl px-3 py-2 break-words">
                  {fcmFeedbackMsg}
                </p>
              )}
            </div>

            {/* Filtros por Categoria */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="ios-segmented w-full justify-between">
                <button
                  type="button"
                  onClick={() => setFilterCategory('all')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-xs ${
                    filterCategory === 'all' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Todos ({allNotices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('prazo')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-xs ${
                    filterCategory === 'prazo' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Prazos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('busca_ativa')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-xs ${
                    filterCategory === 'busca_ativa' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Busca Ativa
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('aviso')}
                  className={`ios-segmented-item flex-1 text-center py-1 text-xs ${
                    filterCategory === 'aviso' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Avisos
                </button>
              </div>
            </div>

            {/* Lista de Notificações */}
            <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-0.5">
              {filteredNotices.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-semibold text-[#1d1d1f]">
                    Nenhum aviso nesta categoria
                  </p>
                  <p className="text-xs text-[#86868b] mt-0.5">
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
                          <span className="text-xs font-bold uppercase tracking-wider text-[#6e6e73]">
                            {meta.label} • {notice.createdAt}
                          </span>
                          {!notice.read && (
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`}
                            />
                          )}
                        </div>
                        <p className="text-[13px] font-bold text-[#1d1d1f] leading-snug mt-0.5 break-words">
                          {notice.title}
                        </p>
                        <p className="text-xs text-[#6e6e73] leading-snug mt-0.5 break-words">
                          {notice.body}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Ações da Gestão / Admin: Disparo rápido FCM de Fechamento + Composer */}
            {userRole === 'admin' && (
              <div className="pt-2 space-y-2">
                {!showComposer ? (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled={isSendingFcmBroadcast}
                      onClick={handleQuickWindowClosingAlert}
                      className="w-full min-h-[38px] px-3 rounded-2xl bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-[17px]">
                        notification_important
                      </span>
                      <span>
                        {isSendingFcmBroadcast
                          ? 'Enviando Alerta FCM...'
                          : `Alertar Fechamento via FCM (${pendingSchoolClassesCount} pendentes)`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowComposer(true)}
                      className="w-full min-h-[36px] rounded-2xl bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        send
                      </span>
                      <span>Compor Aviso Personalizado (FCM)</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateAndSendNotice} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1d1d1f]">
                        Novo Disparo FCM aos Professores
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowComposer(false)}
                        className="text-xs font-semibold text-[#6e6e73] hover:text-[#1d1d1f] cursor-pointer"
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
                        className="h-[34px] px-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-xs font-semibold focus:outline-none"
                      >
                        <option value="prazo">Categoria: Prazo Próximo</option>
                        <option value="aviso">Categoria: Aviso Geral</option>
                        <option value="busca_ativa">Categoria: Busca Ativa</option>
                      </select>

                      <select
                        value={newTargetClassId}
                        onChange={(e) => setNewTargetClassId(e.target.value)}
                        className="h-[34px] px-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-xs font-semibold focus:outline-none"
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
                      placeholder="Título (ex: Janela fecha amanhã)"
                      className="w-full h-[34px] px-3 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-xs font-semibold focus:bg-white focus:outline-none"
                    />

                    <textarea
                      rows={2}
                      required
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      placeholder="Mensagem para notificar os professores via FCM..."
                      className="w-full p-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-xs focus:bg-white focus:outline-none resize-none"
                    />

                    <button
                      type="submit"
                      className="w-full h-[36px] rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        notifications_active
                      </span>
                      <span>Disparar Notificação FCM Agora</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner Flutuante no Topo */}
      {activeBanner && (
        <div className="fixed top-[64px] right-4 left-4 sm:left-auto sm:w-[375px] z-[90] animate-gentle-fade">
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
                <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                  FCM Push • Agora
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBanner(null);
                  }}
                  aria-label="Fechar aviso"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    close
                  </span>
                </button>
              </div>
              <p className="text-sm font-bold text-white leading-snug mt-0.5 break-words">
                {activeBanner.title}
              </p>
              <p className="text-xs text-white/85 leading-snug mt-0.5 break-words">
                {activeBanner.body}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
