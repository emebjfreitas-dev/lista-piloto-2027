import React, { useState } from 'react';
import { AttendanceWindowConfig, ClassGroup, UserRole } from '../types';
import { evaluateAttendanceLaunchWindow } from '../services/db';

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
      <div className="flex items-center justify-between px-3 py-1.5 rounded-2xl bg-[#f5f5f7] text-[0.72rem] text-[#6e6e73]">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-[#0071e3]">
            notifications
          </span>
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
    ? 'bg-[#fff2f2] border-[#ff3b30]/30 shadow-xs'
    : isOpen
    ? 'bg-[#eaf6ef] border-[#005035]/25 shadow-xs'
    : isWarning
    ? 'bg-[#fff9eb] border-[#ff9500]/30 shadow-xs'
    : 'bg-[#f5f5f7] border-black/[0.06]';

  const badgeBg = isUrgent
    ? 'bg-[#ff3b30] text-white'
    : isOpen
    ? 'bg-[#005035] text-white'
    : isWarning
    ? 'bg-[#ff9500] text-white'
    : 'bg-[#0071e3] text-white';

  const titleColor = isUrgent
    ? 'text-[#ba1a1a]'
    : isOpen
    ? 'text-[#005035]'
    : isWarning
    ? 'text-[#b25000]'
    : 'text-[#1d1d1f]';

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
                ? 'bg-[#ff3b30]/15 text-[#ff3b30]'
                : isOpen
                ? 'bg-[#005035]/12 text-[#005035]'
                : isWarning
                ? 'bg-[#ff9500]/15 text-[#ff9500]'
                : 'bg-[#0071e3]/10 text-[#0071e3]'
            }`}
          >
            <span className="material-symbols-outlined text-[24px]">
              {isUrgent ? 'alarm_on' : isOpen ? 'lock_open' : 'calendar_clock'}
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full font-black text-[0.68rem] uppercase tracking-wider ${badgeBg}`}
              >
                {isOpen ? 'Janela Aberta' : 'Lembrete de Prazo'}
              </span>

              <span className="text-[0.72rem] font-bold text-[#6e6e73]">
                {win.currentDateFormatted} · Mês de {win.targetMonthName}
              </span>

              {pendingSummary.pendingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-white/80 text-[#1d1d1f] text-[0.68rem] font-extrabold tabular-nums border border-black/[0.06]">
                  {pendingSummary.pendingCount} fechamento(s) pendente(s)
                </span>
              )}
            </div>

            <h2 className={`text-[0.98rem] sm:text-[1.08rem] font-black tracking-tight leading-snug mt-1 ${titleColor}`}>
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

            <p className="text-[0.78rem] text-[#6e6e73] leading-relaxed mt-0.5">
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
              className="h-[38px] px-4 rounded-full bg-[#005035] hover:bg-[#003d28] text-white font-extrabold text-[0.78rem] flex items-center gap-1.5 shadow-2xs transition-all active:scale-97 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">edit_calendar</span>
              <span>Lançar Frequência Agora</span>
            </button>
          )}

          {userRole === 'admin' && onNavigateToAcessos && (
            <button
              type="button"
              onClick={onNavigateToAcessos}
              className="h-[38px] px-3.5 rounded-full bg-white hover:bg-[#f5f5f7] text-[#1d1d1f] font-bold text-[0.75rem] flex items-center gap-1.5 border border-black/[0.08] shadow-2xs cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-[#0071e3]">
                settings_suggest
              </span>
              <span>Ajustar Janela</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Minimizar lembrete"
            className="w-8 h-8 rounded-full bg-black/[0.05] hover:bg-black/[0.1] text-[#6e6e73] flex items-center justify-center cursor-pointer transition-colors"
            title="Minimizar lembrete"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
