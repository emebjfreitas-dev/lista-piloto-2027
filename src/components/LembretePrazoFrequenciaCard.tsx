import React, { useState } from 'react';
import { AttendanceWindowConfig, ClassGroup, UserRole } from '../types';
import { evaluateAttendanceLaunchWindow } from '../services/db';
import {
  Clock,
  LockOpen,
  CalendarCheck,
  AlertTriangle,
  Calendar,
  Settings,
  Bell,
  X,
} from 'lucide-react';

interface LembretePrazoFrequenciaCardProps {
  attendanceWindowConfig: AttendanceWindowConfig;
  userRole?: UserRole;
  classes?: ClassGroup[];
  assignedClassId?: string;
  assignedClassIds?: string[];
  onOpenMonthlyAttendance?: (cls: ClassGroup) => void;
  onNavigateToAcessos?: () => void;
}

export const LembretePrazoFrequenciaCard: React.FC<LembretePrazoFrequenciaCardProps> = ({
  attendanceWindowConfig,
  userRole = 'usuario',
  classes = [],
  assignedClassId,
  assignedClassIds = [],
  onOpenMonthlyAttendance,
  onNavigateToAcessos,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const win = evaluateAttendanceLaunchWindow(attendanceWindowConfig);

  // Find user's assigned class for quick 1-touch navigation
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

  // Compute pending classes count for Admin or User
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

  // Determine styles and texts based on window status & urgency
  const isUrgent = win.urgencyLevel === 'urgent';
  const isWarning = win.urgencyLevel === 'warning';
  const isOpen = win.isAllowedToLaunch;

  const bgClass = isUrgent
    ? 'bg-rose-50 border-rose-300 shadow-xs'
    : isOpen
    ? 'bg-emerald-50 border-emerald-300 shadow-xs'
    : isWarning
    ? 'bg-amber-50 border-amber-300 shadow-xs'
    : 'bg-slate-100 border-slate-300 shadow-xs';

  const badgeBg = isUrgent
    ? 'bg-rose-800 text-white font-bold'
    : isOpen
    ? 'bg-emerald-800 text-white font-bold'
    : isWarning
    ? 'bg-amber-800 text-white font-bold'
    : 'bg-blue-800 text-white font-bold';

  const titleColor = isUrgent
    ? 'text-rose-950 font-bold'
    : isOpen
    ? 'text-emerald-950 font-bold'
    : isWarning
    ? 'text-amber-950 font-bold'
    : 'text-slate-950 font-bold';

  return (
    <aside
      aria-label="Lembrete Oficial de Prazo de Fechamento da Frequência"
      className={`rounded-3xl p-4 sm:p-5 border transition-all ${bgClass}`}
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
                className={`px-2.5 py-0.5 rounded-full text-xs uppercase tracking-wider ${badgeBg}`}
              >
                {isOpen ? 'Janela Aberta' : 'Lembrete de Prazo'}
              </span>

              <span className="text-xs text-slate-700 font-bold">
                {win.currentDateFormatted} · Mês de {win.targetMonthName}
              </span>

              {pendingSummary.pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-white text-slate-900 text-xs font-bold tabular-nums border border-slate-300">
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

            <p className="text-xs sm:text-sm text-slate-800 font-medium leading-normal mt-0.5">
              {isOpen ? (
                <span>
                  Os educadores devem concluir o lançamento de faltas e atestados antes do prazo final ({win.closingDateFormatted}, 2º dia letivo). A sincronização com a SED e Google Sheets ocorre automaticamente.
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
              className="h-8 px-3.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-white" />
              <span>
                {userRole === 'usuario' ? 'Lançar Minhas Faltas' : 'Conferir Fechamentos'}
              </span>
            </button>
          )}

          {userRole === 'admin' && onNavigateToAcessos && (
            <button
              type="button"
              onClick={onNavigateToAcessos}
              title="Configurar Janela de Lançamento e Prazos"
              className="h-[38px] px-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition-all cursor-pointer shadow-2xs"
            >
              <Settings className="w-3.5 h-3.5 text-slate-700" />
              <span>Ajustar Prazos</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            title="Dispensar lembrete temporariamente"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 hover:text-black hover:bg-black/10 transition-colors cursor-pointer"
            aria-label="Dispensar lembrete temporariamente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
