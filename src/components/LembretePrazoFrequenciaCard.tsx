import React, { useState } from 'react';
import { AttendanceWindowConfig, ClassGroup, UserRole } from '../types';
import { evaluateAttendanceLaunchWindow } from '../services/db';
import {
  dispatchWindowClosingFcmAlert,
  getFcmCapabilitySnapshot,
  registerDeviceForFcm,
} from '../services/fcmService';
import { getPushPermissionState } from '../services/pushNotificationService';
import {
  Clock,
  LockOpen,
  CalendarCheck,
  AlertTriangle,
  Settings,
  Bell,
  BellRing,
  Send,
  X,
} from 'lucide-react';

interface LembretePrazoFrequenciaCardProps {
  attendanceWindowConfig: AttendanceWindowConfig;
  userRole?: UserRole;
  userEmail?: string;
  userName?: string;
  classes?: ClassGroup[];
  assignedClassId?: string;
  assignedClassIds?: string[];
  onOpenMonthlyAttendance?: (cls: ClassGroup) => void;
  onNavigateToAcessos?: () => void;
}

export const LembretePrazoFrequenciaCard: React.FC<LembretePrazoFrequenciaCardProps> = ({
  attendanceWindowConfig,
  userRole = 'usuario',
  userEmail = 'emebjfreitas@jundiai.sp.gov.br',
  userName,
  classes = [],
  assignedClassId,
  assignedClassIds = [],
  onOpenMonthlyAttendance,
  onNavigateToAcessos,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [fcmPermission, setFcmPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getPushPermissionState()
  );
  const [hasFcmToken, setHasFcmToken] = useState<boolean>(() =>
    getFcmCapabilitySnapshot().hasFcmToken
  );
  const [fcmActionLoading, setFcmActionLoading] = useState(false);
  const [fcmToastMsg, setFcmToastMsg] = useState<string | null>(null);

  const win = evaluateAttendanceLaunchWindow(attendanceWindowConfig);

  const targetClass = React.useMemo(() => {
    if (assignedClassId) {
      const found = classes.find((c) => c.id === assignedClassId);
      if (found) return found;
    }
    if (assignedClassIds.length > 0) {
      const found = classes.find((c) => assignedClassIds.includes(c.id));
      if (found) return found;
    }
    return classes[0];
  }, [classes, assignedClassId, assignedClassIds]);

  const pendingSummary = React.useMemo(() => {
    const list =
      userRole === 'usuario'
        ? classes.filter((c) => assignedClassIds.includes(c.id) || c.id === assignedClassId)
        : classes;
    const pending = list.filter((c) => c.isPending);
    return {
      total: list.length,
      pendingCount: pending.length,
      firstPendingClass: pending[0] || list[0],
    };
  }, [classes, userRole, assignedClassId, assignedClassIds]);

  const handleActivateTeacherFcm = async () => {
    if (fcmActionLoading) return;
    setFcmActionLoading(true);
    setFcmToastMsg(null);
    try {
      const res = await registerDeviceForFcm({
        userEmail,
        userName: userName || userEmail.split('@')[0],
        userRole,
        assignedClassIds:
          assignedClassIds.length > 0
            ? assignedClassIds
            : assignedClassId
            ? [assignedClassId]
            : [],
      });
      setFcmPermission(res.permission);
      setHasFcmToken(Boolean(res.fcmToken));
      setFcmToastMsg(res.message);
    } finally {
      setFcmActionLoading(false);
    }
  };

  const handleAdminNotifyPendingViaFcm = async () => {
    if (fcmActionLoading) return;
    setFcmActionLoading(true);
    setFcmToastMsg(null);
    try {
      const res = await dispatchWindowClosingFcmAlert({
        targetAudience: 'pending_only',
        attendanceWindowConfig,
        classes,
        senderEmail: userEmail,
        senderName: userName || 'Gestão Escolar',
      });
      setFcmToastMsg(res.message);
    } finally {
      setFcmActionLoading(false);
    }
  };

  if (isDismissed) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 rounded-2xl bg-[#f5f5f7] text-xs text-[#6e6e73]">
        <div className="flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-[#0071e3]" />
          <span>Lembrete de prazos minimizado</span>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(false)}
          className="font-bold text-[#0071e3] hover:underline cursor-pointer"
        >
          Reexibir
        </button>
      </div>
    );
  }

  const isUrgent = win.urgencyLevel === 'urgent';
  const isWarning = win.urgencyLevel === 'warning';
  const isOpen = win.isAllowedToLaunch;

  const bgClass = isUrgent
    ? 'bg-rose-50 shadow-xs'
    : isOpen
    ? 'bg-emerald-50 shadow-xs'
    : isWarning
    ? 'bg-amber-50 shadow-xs'
    : 'bg-[#f2f2f7] shadow-xs';

  const badgeBg = isUrgent
    ? 'bg-rose-800 text-white font-bold'
    : isOpen
    ? 'bg-emerald-800 text-white font-bold'
    : isWarning
    ? 'bg-amber-800 text-white font-bold'
    : 'bg-[#1a4fa3] text-white font-bold';

  const titleColor = isUrgent
    ? 'text-rose-950 font-bold'
    : isOpen
    ? 'text-emerald-950 font-bold'
    : isWarning
    ? 'text-amber-950 font-bold'
    : 'text-[#111827] font-bold';

  return (
    <aside
      aria-label="Lembrete Oficial de Prazo de Fechamento da Frequência"
      className={`rounded-3xl p-4 sm:p-5 transition-all space-y-2.5 ${bgClass}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left Side: Icon + Message */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              isUrgent
                ? 'bg-rose-200 text-rose-900'
                : isOpen
                ? 'bg-emerald-200 text-emerald-950'
                : isWarning
                ? 'bg-amber-200 text-amber-950'
                : 'bg-blue-200 text-blue-950'
            }`}
          >
            {isUrgent ? (
              <AlertTriangle className="w-5 h-5 text-rose-900" />
            ) : isOpen ? (
              <LockOpen className="w-5 h-5 text-emerald-900" />
            ) : (
              <Clock className="w-5 h-5 text-blue-900" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs uppercase tracking-wider ${badgeBg}`}
              >
                {isOpen ? 'Janela Aberta' : 'Lembrete de Prazo'}
              </span>

              <span className="text-xs text-[#374151] font-bold">
                {win.currentDateFormatted} · Mês de {win.targetMonthName}
              </span>

              {pendingSummary.pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-md bg-white text-[#111827] text-xs font-bold tabular-nums">
                  {pendingSummary.pendingCount} fechamento(s) pendente(s)
                </span>
              )}
            </div>

            <h2 className={`text-base tracking-tight leading-snug mt-1 ${titleColor}`}>
              {isOpen ? (
                <span>
                  Prazo de Fechamento Aberto — Encerramento em {win.closingDateFormatted}
                </span>
              ) : (
                <span>
                  Próxima Abertura de Lançamento: {win.nextWindowOpenDateFormatted}
                </span>
              )}
            </h2>

            <p className="text-xs sm:text-sm text-[#374151] font-medium leading-normal mt-0.5">
              {isOpen ? (
                <span>
                  Os educadores devem concluir o lançamento de faltas e atestados antes do prazo final ({win.closingDateFormatted}, 2º dia letivo).
                </span>
              ) : (
                <span>
                  {win.reasonLabel}. {win.windowRuleDescription}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Side: Quick Action CTA Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 pt-1 sm:pt-0">
          {isOpen && onOpenMonthlyAttendance && targetClass && (
            <button
              type="button"
              onClick={() => onOpenMonthlyAttendance(pendingSummary.firstPendingClass || targetClass)}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-white" />
              <span>
                {userRole === 'usuario' ? 'Lançar Minhas Faltas' : 'Conferir Fechamentos'}
              </span>
            </button>
          )}

          {userRole === 'admin' ? (
            <button
              type="button"
              disabled={fcmActionLoading}
              onClick={handleAdminNotifyPendingViaFcm}
              title="Enviar alerta Firebase Cloud Messaging (FCM) para professores com turmas pendentes"
              className="min-h-[38px] px-3.5 rounded-xl bg-[#111827] hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {fcmActionLoading
                  ? 'Enviando...'
                  : `Alertar Pendentes (FCM)`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={fcmActionLoading}
              onClick={handleActivateTeacherFcm}
              title="Ativar notificações push Firebase Cloud Messaging para não esquecer o fechamento"
              className={`min-h-[38px] px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 ${
                fcmPermission === 'granted'
                  ? 'bg-[#eaf6ef] text-[#005035]'
                  : 'bg-[#0071e3] hover:bg-[#0077ed] text-white'
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>
                {fcmActionLoading
                  ? 'Conectando...'
                  : fcmPermission === 'granted'
                  ? hasFcmToken
                    ? 'Alerta FCM Ativo'
                    : 'Notificações Ativas'
                  : 'Ativar Alerta FCM'}
              </span>
            </button>
          )}

          {userRole === 'admin' && onNavigateToAcessos && (
            <button
              type="button"
              onClick={onNavigateToAcessos}
              title="Configurar Janela de Lançamento e Prazos"
              className="min-h-[38px] px-3.5 rounded-xl bg-white hover:bg-slate-100 text-[#111827] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-[#48484a]" />
              <span>Ajustar Prazos</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            title="Dispensar lembrete temporariamente"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#48484a] hover:text-black hover:bg-black/10 transition-colors cursor-pointer"
            aria-label="Dispensar lembrete temporariamente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {fcmToastMsg && (
        <div className="px-3 py-2 rounded-xl bg-white/90 text-xs font-medium text-[#111827] flex items-center justify-between gap-2">
          <span>{fcmToastMsg}</span>
          <button
            type="button"
            onClick={() => setFcmToastMsg(null)}
            className="text-xs font-semibold text-[#6e6e73] hover:text-[#111827] cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}
    </aside>
  );
};
