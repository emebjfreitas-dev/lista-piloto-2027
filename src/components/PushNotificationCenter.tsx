import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Megaphone,
  Send,
  X,
} from 'lucide-react';
import {
  AttendanceWindowConfig,
  AuthorizedUser,
  ClassGroup,
  ScreenType,
  UserRole,
} from '../types';
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
  setupCompulsoryFcmAutoActivation,
  subscribeToFcmNotifications,
  evaluateAndTriggerWindowClosingReminder,
  evaluateAndTriggerTeacherEndOfDayReminder,
  evaluateTeacherEndOfDayPendingClasses,
  getNextTeacherEndOfDayReminderDelayMs,
  dispatchWindowClosingFcmAlert,
  getFcmCapabilitySnapshot,
} from '../services/fcmService';
import { ModalPortal } from './ui/ModalPortal';

interface PushNotificationCenterProps {
  visibleClasses: ClassGroup[];
  allClasses?: ClassGroup[];
  userRole?: UserRole;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
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
  teacherRoleType,
  userEmail = 'emebjfreitas@jundiai.sp.gov.br',
  userName,
  assignedClassIds = [],
  attendanceWindowConfig = { exceptionalOverrideOpen: false },
  onNavigateScreen,
}) => {
  // Apenas Administradores reais podem disparar notificações Push (nunca PEB I, PEB II, Apoio ou AEE)
  const isStrictAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';

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
  const [readIds, setReadIds] = useState<string[]>(() => getReadPushNoticeIds(userEmail));
  const [filterCategory, setFilterCategory] = useState<'all' | PushNoticeCategory>('all');
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState<PushNoticeCategory>('prazo');
  const [newTargetClassId, setNewTargetClassId] = useState<string>('all');
  const [activeBanner, setActiveBanner] = useState<PushNoticeItem | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReadIds(getReadPushNoticeIds(userEmail));
  }, [userEmail]);

  // Registra Service Worker (/sw.js), escuta cliques e ativa canal FCM em tempo real
  useEffect(() => {
    let mounted = true;
    registerPushServiceWorker().then((reg) => {
      if (mounted && reg) {
        setSwActive(true);
      }
    });

    const effectiveAssignedIds =
      assignedClassIds.length > 0
        ? assignedClassIds
        : visibleClasses.map((c) => c.id);

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'PUSH_NOTIFICATION_CLICKED' && data.targetScreen) {
        onNavigateScreen?.(data.targetScreen as ScreenType, data.targetClassId);
      } else if (
        data &&
        data.type === 'FCM_SUBSCRIPTION_REFRESH_NEEDED' &&
        getPushPermissionState() === 'granted'
      ) {
        void registerDeviceForFcm({
          userEmail,
          userName: userName || userEmail.split('@')[0],
          userRole,
          assignedClassIds: effectiveAssignedIds,
        });
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    const unsubscribeBanner = onInAppPushBanner((notice) => {
      setCustomNotices(getStoredCustomPushNotices());
      const acknowledgedIds = getReadPushNoticeIds(userEmail);
      if (!acknowledgedIds.includes(notice.id)) {
        setActiveBanner(notice);
      }
    });

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

    // Habilitação compulsória de FCM para todos os usuários (automática ao entrar e no primeiro toque se o navegador exigir interação)
    const unsubscribeCompulsoryFcm = setupCompulsoryFcmAutoActivation({
      userEmail,
      userName: userName || userEmail.split('@')[0],
      userRole,
      teacherRoleType,
      assignedClassIds: effectiveAssignedIds,
      onResult: (res) => {
        if (!mounted) return;
        setSwActive(res.swReady);
        setPermission(res.permission);
        if (res.fcmToken || res.hasPushSubscription) {
          setHasFcmToken(true);
          setFcmChannelLabel(res.fcmToken ? 'FCM Nativo Ativo' : 'Push Web Ativo');
        } else if (res.swReady) {
          setFcmChannelLabel('SW Push Ativo');
        }
      },
    });

    return () => {
      mounted = false;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      unsubscribeBanner();
      unsubscribeFcm();
      unsubscribeCompulsoryFcm();
    };
  }, [userEmail, userRole, teacherRoleType, userName, assignedClassIds, visibleClasses, onNavigateScreen]);

  // Monitora automaticamente o fechamento da janela e dispara lembrete de fim de turno ao educador
  useEffect(() => {
    if (visibleClasses.length === 0) return;
    let cancelled = false;
    let cutoffTimeoutId: number | null = null;
    let pollIntervalId: number | null = null;

    const runChecks = async () => {
      if (cancelled) return;
      await evaluateAndTriggerWindowClosingReminder({
        attendanceWindowConfig,
        visibleClasses,
        userEmail,
        userRole,
      });
      const eodNotice = await evaluateAndTriggerTeacherEndOfDayReminder({
        attendanceWindowConfig,
        visibleClasses,
        userEmail,
        userRole,
        teacherRoleType,
        assignedClassIds,
        onOpenClassAttendance: (classId) =>
          onNavigateScreen?.('frequencia_mensal', classId),
      });
      if (!cancelled && eodNotice) {
        setCustomNotices(getStoredCustomPushNotices());
      }
    };

    void runChecks();

    const scheduleCutoffTimer = () => {
      if (cutoffTimeoutId !== null) {
        window.clearTimeout(cutoffTimeoutId);
        cutoffTimeoutId = null;
      }
      const nextDelay = getNextTeacherEndOfDayReminderDelayMs({
        attendanceWindowConfig,
        visibleClasses,
        userRole,
        teacherRoleType,
        assignedClassIds,
      });
      if (nextDelay !== null && nextDelay > 0) {
        const safeDelay = Math.min(nextDelay + 500, 2_147_483_000);
        cutoffTimeoutId = window.setTimeout(() => {
          void runChecks();
          scheduleCutoffTimer();
        }, safeDelay);
      }
    };

    scheduleCutoffTimer();

    // Fallback de 60s para cobrir suspensão/hibernação do navegador até o fim do turno
    pollIntervalId = window.setInterval(() => {
      void runChecks();
    }, 60_000);

    const handleVisibilityWake = () => {
      if (document.visibilityState === 'visible') {
        void runChecks();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityWake);

    return () => {
      cancelled = true;
      if (cutoffTimeoutId !== null) window.clearTimeout(cutoffTimeoutId);
      if (pollIntervalId !== null) window.clearInterval(pollIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityWake);
    };
  }, [
    attendanceWindowConfig,
    visibleClasses,
    userEmail,
    userRole,
    teacherRoleType,
    assignedClassIds,
    onNavigateScreen,
  ]);

  // Auto-oculta o banner flutuante após 8 segundos (permanece na central até dar ciência)
  useEffect(() => {
    if (!activeBanner) return;
    const timer = setTimeout(() => {
      setActiveBanner(null);
    }, 8000);
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

  // Lista ativa: assim que o usuário dá ciência na notificação, ela desaparece da central
  const activeNotices = useMemo(() => {
    return buildContextualPushNotices(visibleClasses, customNotices, readIds).filter(
      (n) => !n.read
    );
  }, [visibleClasses, customNotices, readIds]);

  const unreadCount = activeNotices.length;

  const filteredNotices = useMemo(() => {
    if (filterCategory === 'all') return activeNotices;
    return activeNotices.filter((n) => n.category === filterCategory);
  }, [activeNotices, filterCategory]);

  const teacherEodSummary = useMemo(
    () =>
      evaluateTeacherEndOfDayPendingClasses({
        attendanceWindowConfig,
        visibleClasses,
        userRole,
        teacherRoleType,
        assignedClassIds,
      }),
    [attendanceWindowConfig, visibleClasses, userRole, teacherRoleType, assignedClassIds]
  );

  const handleTestOrRefreshCompulsoryPush = async () => {
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
        teacherRoleType,
        assignedClassIds: effectiveAssignedIds,
      });
      const isPushActive = Boolean(res.fcmToken || res.hasPushSubscription);
      setPermission(res.permission);
      setSwActive(res.swReady);
      setHasFcmToken(isPushActive);
      setFcmChannelLabel(
        res.fcmToken
          ? 'FCM Nativo Ativo'
          : res.hasPushSubscription
          ? 'Push Web Ativo'
          : res.swReady
          ? 'SW Push Ativo'
          : 'Push Web'
      );
      setFcmFeedbackMsg(res.message);

      if (res.ok && isStrictAdmin) {
        await triggerPushNotification(
          {
            title: isPushActive
              ? 'Canal Push FCM Verificado'
              : 'Notificações de Prazo Verificadas',
            body: 'Este dispositivo administrativo está apto a enviar e receber alertas Push.',
            category: 'prazo',
            targetScreen: 'frequencia_mensal',
            authorName: 'Sistema de Prazos EMEB Candelário',
          },
          { saveToFeed: false, showBanner: true, userEmail }
        );
      }
    } finally {
      setIsRegisteringFcm(false);
    }
  };

  const handleQuickWindowClosingAlert = async () => {
    if (!isStrictAdmin || isSendingFcmBroadcast) return;
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
        senderRole: userRole,
        senderTeacherRoleType: teacherRoleType,
      });
      setCustomNotices(getStoredCustomPushNotices());
      setFcmFeedbackMsg(res.message);
    } finally {
      setIsSendingFcmBroadcast(false);
    }
  };

  const handleCreateAndSendNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStrictAdmin || !newTitle.trim() || !newBody.trim()) return;

    const defaultScreen: ScreenType =
      newCategory === 'prazo'
        ? 'frequencia_mensal'
        : newCategory === 'busca_ativa'
        ? 'faltas_consecutivas'
        : 'home';

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
        senderRole: userRole,
        senderTeacherRoleType: teacherRoleType,
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
        { saveToFeed: true, showBanner: true, userEmail }
      );
    }

    setCustomNotices(getStoredCustomPushNotices());
    setNewTitle('');
    setNewBody('');
    setShowComposer(false);
  };

  // Dar ciência sem sair da tela -> push some imediatamente para o usuário
  const handleAcknowledgeNotice = (noticeId: string) => {
    const nextRead = markPushNoticeAsRead(noticeId, userEmail);
    setReadIds(nextRead);
    if (activeBanner?.id === noticeId) {
      setActiveBanner(null);
    }
  };

  // Clicar no aviso: registra ciência (fazendo a push sumir) e navega ao módulo alvo
  const handleNoticeClick = (notice: PushNoticeItem) => {
    handleAcknowledgeNotice(notice.id);
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

  const handleAcknowledgeAll = () => {
    const ids = activeNotices.map((n) => n.id);
    if (ids.length === 0) return;
    const updated = markAllPushNoticesAsRead(ids, userEmail);
    setReadIds(updated);
    setActiveBanner(null);
  };

  const getCategoryMeta = (cat: PushNoticeCategory) => {
    if (cat === 'prazo') {
      return {
        label: 'Prazo',
        Icon: Clock,
        badgeClass: 'bg-amber-500/12 text-amber-700',
        dotClass: 'bg-amber-500',
      };
    }
    if (cat === 'busca_ativa') {
      return {
        label: 'Busca Ativa',
        Icon: AlertCircle,
        badgeClass: 'bg-rose-500/12 text-rose-600',
        dotClass: 'bg-rose-500',
      };
    }
    return {
      label: 'Aviso',
      Icon: Megaphone,
      badgeClass: 'bg-[#0071e3]/12 text-[#0071e3]',
      dotClass: 'bg-[#0071e3]',
    };
  };

  const classesForTargetSelect = allClasses.length > 0 ? allClasses : visibleClasses;
  const pendingSchoolClassesCount = classesForTargetSelect.filter((c) => c.isPending).length;

  return (
    <>
      {/* Botão Minimalista Apple de Sino */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Central de Notificações FCM e Prazos"
          title="Notificações Push e Prazos (FCM)"
          className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer active:scale-95 ${
            isOpen
              ? 'bg-[#0b3b8c] text-white'
              : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 hover:text-slate-950'
          }`}
        >
          {unreadCount > 0 ? (
            <BellRing className="w-[18px] h-[18px] stroke-[1.6]" />
          ) : (
            <Bell className="w-[18px] h-[18px] stroke-[1.5]" />
          )}

          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums shadow-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Popover Notification Center */}
        {isOpen && (
          <div className="animate-apple-pop fixed sm:absolute right-3 sm:right-0 top-[68px] sm:top-auto sm:mt-2.5 w-[calc(100vw-24px)] max-w-[410px] max-h-[calc(100dvh-9.5rem)] overflow-y-auto bg-white/98 backdrop-blur-2xl rounded-3xl shadow-[0_22px_54px_rgba(9,15,29,0.22)] p-4 z-50 space-y-3">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-slate-950">
                    Notificações Push
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                      hasFcmToken
                        ? 'bg-emerald-100 text-emerald-950'
                        : swActive
                        ? 'bg-[#dce7fb] text-[#092e70]'
                        : 'bg-[#edf2f7] text-slate-800'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {hasFcmToken ? 'FCM Ativo' : swActive ? fcmChannelLabel : 'Push Web'}
                  </span>
                </div>
                <p className="text-xs text-slate-700 mt-0.5">
                  {isStrictAdmin
                    ? 'Disparo administrativo FCM e avisos pendentes'
                    : 'Ao dar ciência em uma notificação, ela some da sua lista'}
                </p>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleAcknowledgeAll}
                  className="text-xs font-semibold text-[#0052cc] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <CheckCheck className="w-3.5 h-3.5 stroke-[1.6]" />
                  <span>Dar ciência em tudo</span>
                </button>
              )}
            </div>

            {/* Status Compulsório de Recebimento FCM (sem opção de desativar) */}
            <div
              className={`p-3 rounded-2xl space-y-2 ${
                permission === 'denied' ? 'bg-rose-50' : 'bg-[#f4f7fb]'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-950 block break-words leading-snug">
                    {permission === 'denied'
                      ? 'Notificações Obrigatórias Bloqueadas no Navegador'
                      : permission === 'granted'
                      ? 'Notificações Obrigatórias FCM Ativas'
                      : 'Ativando Notificações Obrigatórias (FCM)...'}
                  </span>
                  <span className="text-xs text-slate-700 block break-words leading-snug">
                    {permission === 'denied'
                      ? 'Alertas FCM são compulsórios. Libere as notificações no cadeado do navegador para receber avisos em tempo real.'
                      : 'Todo usuário recebe automaticamente alertas de busca ativa, retornos e fechamento de janela.'}
                  </span>
                </div>

                {permission === 'denied' ? (
                  <button
                    type="button"
                    disabled={isRegisteringFcm}
                    onClick={handleTestOrRefreshCompulsoryPush}
                    className="min-h-[34px] px-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shrink-0 cursor-pointer transition-colors disabled:opacity-60"
                  >
                    {isRegisteringFcm ? 'Verificando...' : 'Verificar Permissão'}
                  </button>
                ) : isStrictAdmin && permission === 'granted' ? (
                  <button
                    type="button"
                    disabled={isRegisteringFcm}
                    onClick={handleTestOrRefreshCompulsoryPush}
                    className="min-h-[34px] px-3 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white text-xs font-bold shrink-0 cursor-pointer transition-colors disabled:opacity-60"
                  >
                    {isRegisteringFcm ? 'Testando...' : 'Testar FCM'}
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-[#047857] text-[11px] font-bold shrink-0">
                    Obrigatório
                  </span>
                )}
              </div>

              {fcmFeedbackMsg && (
                <p className="text-xs font-medium text-slate-700 bg-white/90 rounded-xl px-3 py-2 break-words">
                  {fcmFeedbackMsg}
                </p>
              )}
            </div>

            {teacherEodSummary.isEligibleTeacherRole &&
              teacherEodSummary.pendingEvaluations.length > 0 &&
              teacherEodSummary.windowEvaluation.isAllowedToLaunch && (
                <div
                  className={`p-3 rounded-2xl flex items-center justify-between gap-2.5 ${
                    teacherEodSummary.dueNowEvaluations.length > 0
                      ? 'bg-amber-50 text-amber-950'
                      : 'bg-[#f5f5f7] text-[#1d1d1f]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-snug">
                      {teacherEodSummary.dueNowEvaluations.length > 0
                        ? `Fim de turno (${teacherEodSummary.dueNowEvaluations[0].evaluation.closingTimeLabel}) • ${teacherEodSummary.dueNowEvaluations.length} turma(s) pendente(s)`
                        : `Lembrete automático agendado (${teacherEodSummary.pendingEvaluations[0].evaluation.reminderStartTimeLabel} · ${teacherEodSummary.pendingEvaluations[0].evaluation.shiftLabel})`}
                    </p>
                    <p className="text-[11px] opacity-80 leading-snug mt-0.5 break-words">
                      Turma:{' '}
                      {(
                        teacherEodSummary.dueNowEvaluations[0] ||
                        teacherEodSummary.pendingEvaluations[0]
                      ).cls.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target =
                        teacherEodSummary.dueNowEvaluations[0] ||
                        teacherEodSummary.pendingEvaluations[0];
                      setIsOpen(false);
                      onNavigateScreen?.('frequencia_mensal', target.cls.id);
                    }}
                    className="min-h-[32px] px-3 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    Lançar Faltas
                  </button>
                </div>
              )}

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
                  Pendentes ({activeNotices.length})
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

            {/* Lista de Notificações Pendentes de Ciência */}
            <div className="max-h-[260px] overflow-y-auto space-y-2 pr-0.5">
              {filteredNotices.length === 0 ? (
                <div className="py-8 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#047857] flex items-center justify-center mx-auto mb-2">
                    <CheckCheck className="w-5 h-5 stroke-[1.6]" />
                  </div>
                  <p className="text-sm font-semibold text-slate-950">
                    Nenhuma notificação pendente
                  </p>
                  <p className="text-xs text-slate-700">
                    Todas as notificações desta categoria já receberam ciência.
                  </p>
                </div>
              ) : (
                filteredNotices.map((notice) => {
                  const meta = getCategoryMeta(notice.category);
                  const CatIcon = meta.Icon;
                  return (
                    <div
                      key={notice.id}
                      className="w-full p-3 rounded-2xl bg-[#f4f7fb] hover:bg-[#edf2f7] transition-colors flex flex-col gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => handleNoticeClick(notice)}
                        className="w-full text-left flex items-start gap-2.5 cursor-pointer"
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${meta.badgeClass}`}
                        >
                          <CatIcon className="w-4 h-4 stroke-[1.6]" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                              {meta.label} · {notice.createdAt}
                            </span>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
                          </div>
                          <p className="text-[13px] font-bold text-slate-950 leading-snug mt-0.5 break-words">
                            {notice.title}
                          </p>
                          <p className="text-xs text-slate-700 leading-snug mt-0.5 break-words">
                            {notice.body}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleAcknowledgeNotice(notice.id)}
                          className="min-h-[30px] px-3 rounded-lg bg-white hover:bg-[#0b3b8c] text-[#0b3b8c] hover:text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[1.8]" />
                          <span>Dar ciência</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Ações EXCLUSIVAS de Administradores Reais: Disparo rápido FCM + Composer */}
            {isStrictAdmin && (
              <div className="pt-2 space-y-2">
                {!showComposer ? (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled={isSendingFcmBroadcast}
                      onClick={handleQuickWindowClosingAlert}
                      className="w-full min-h-[38px] px-3 rounded-2xl bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <BellRing className="w-4 h-4 stroke-[1.6]" />
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
                      <Send className="w-3.5 h-3.5 stroke-[1.6]" />
                      <span>Enviar Push Personalizado (Admin)</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateAndSendNotice} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1d1d1f]">
                        Novo Disparo Push (Admin)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowComposer(false)}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
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
                        className="h-[34px] px-2.5 rounded-xl bg-[#f4f7fb] text-slate-950 text-xs font-semibold"
                      >
                        <option value="prazo">Categoria: Prazo Próximo</option>
                        <option value="aviso">Categoria: Aviso Geral</option>
                        <option value="busca_ativa">Categoria: Busca Ativa</option>
                      </select>

                      <select
                        value={newTargetClassId}
                        onChange={(e) => setNewTargetClassId(e.target.value)}
                        className="h-[34px] px-2.5 rounded-xl bg-[#f4f7fb] text-slate-950 text-xs font-semibold"
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
                      className="w-full h-[34px] px-3 rounded-xl bg-[#f4f7fb] text-slate-950 placeholder:text-slate-600 text-xs font-semibold focus:bg-white transition-colors"
                    />

                    <textarea
                      rows={2}
                      required
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      placeholder="Mensagem para notificar os professores via FCM..."
                      className="w-full p-2.5 rounded-xl bg-[#f4f7fb] text-slate-950 placeholder:text-slate-600 text-xs focus:bg-white transition-colors resize-none"
                    />

                    <button
                      type="submit"
                      className="w-full h-[36px] rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-150 active:scale-[0.98]"
                    >
                      <Send className="w-3.5 h-3.5 stroke-[1.6]" />
                      <span>Disparar Notificação Push Agora</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner Flutuante no Topo — Desaparece ao usuário dar ciência */}
      {activeBanner && (
        <ModalPortal>
          <div className="fixed top-[68px] right-4 left-4 sm:left-auto sm:w-[390px] z-[125] animate-gentle-fade">
            <div className="bg-[#111827]/95 backdrop-blur-2xl text-white p-3.5 rounded-3xl shadow-[0_18px_42px_rgba(0,0,0,0.35)] space-y-2.5">
              <div
                onClick={() => {
                  const target = activeBanner;
                  setActiveBanner(null);
                  handleNoticeClick(target);
                }}
                className="flex items-start gap-3 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-2xl bg-[#0071e3]/25 text-[#60a5fa] flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4 stroke-[1.6]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                      Notificação Push · Agora
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveBanner(null);
                      }}
                      aria-label="Minimizar aviso"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4 stroke-[1.6]" />
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

              <div className="flex items-center justify-end gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAcknowledgeNotice(activeBanner.id);
                  }}
                  className="min-h-[32px] px-3 rounded-xl bg-white/15 hover:bg-white text-white hover:text-[#111827] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[1.8]" />
                  <span>Dar ciência</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
};
