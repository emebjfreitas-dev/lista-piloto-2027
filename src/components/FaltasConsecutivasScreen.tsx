import React, { useState, useMemo } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { StudentAvatar } from './StudentAvatar';

interface FaltasConsecutivasScreenProps {
  classGroup: ClassGroup;
  availableClasses?: ClassGroup[];
  userRole?: UserRole;
  onSelectClass?: (cls: ClassGroup) => void;
  onUpdateStudent: (classId: string, updatedStudent: Student) => void;
}

/**
 * Gera os 4 últimos dias letivos (dias úteis de segunda a sexta-feira até hoje)
 * para que o(a) professor(a) PEB I selecione com 1 toque os dias em que o estudante faltou consecutivamente.
 */
export function getRecentFourSchoolDays(referenceDate: Date = new Date()): Array<{
  key: string;
  shortDate: string;
  weekdayLabel: string;
  fullLabel: string;
}> {
  const days: Array<{
    key: string;
    shortDate: string;
    weekdayLabel: string;
    fullLabel: string;
  }> = [];
  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const cursor = new Date(referenceDate);

  while (days.length < 4) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      const dd = String(cursor.getDate()).padStart(2, '0');
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const shortDate = `${dd}/${mm}`;
      const weekdayLabel = weekdayNames[dow];
      days.unshift({
        key: shortDate,
        shortDate,
        weekdayLabel,
        fullLabel: `${weekdayLabel} ${shortDate}`,
      });
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return days;
}

export const FaltasConsecutivasScreen: React.FC<FaltasConsecutivasScreenProps> = ({
  classGroup,
  availableClasses = [],
  userRole = 'usuario',
  onSelectClass,
  onUpdateStudent,
}) => {
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyReportedFilter, setOnlyReportedFilter] = useState(
    userRole === 'peb2'
  );
  const [viewAllClassesMode, setViewAllClassesMode] = useState(
    userRole !== 'usuario' && availableClasses.length > 1
  );
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});

  const canReportDays = userRole === 'usuario' || userRole === 'admin';
  const canEditFamilyFeedback = userRole === 'admin';

  const recentFourDays = useMemo(() => getRecentFourSchoolDays(), []);

  // Lista unificada (para PEB II e Admin acompanharem todas as turmas ou a turma selecionada)
  const scopedEntries = useMemo(() => {
    const sourceClasses =
      viewAllClassesMode && availableClasses.length > 0
        ? availableClasses
        : [classGroup];

    const entries: Array<{ cls: ClassGroup; student: Student }> = [];
    for (const cls of sourceClasses) {
      const active = [...cls.students]
        .filter((s) => {
          const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
          return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
        })
        .sort((a, b) => a.number - b.number);

      for (const student of active) {
        entries.push({ cls, student });
      }
    }
    return entries;
  }, [viewAllClassesMode, availableClasses, classGroup]);

  const reportedCount = useMemo(() => {
    return scopedEntries.filter(
      ({ student }) =>
        student.consecutiveAbsenceAlert?.active &&
        (student.consecutiveAbsenceAlert.selectedDates?.length || 0) > 0
    ).length;
  }, [scopedEntries]);

  const withFeedbackCount = useMemo(() => {
    return scopedEntries.filter(
      ({ student }) =>
        student.consecutiveAbsenceAlert?.active &&
        (student.consecutiveAbsenceAlert.familyFeedback || '').trim().length > 0
    ).length;
  }, [scopedEntries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return scopedEntries.filter(({ cls, student }) => {
      const hasAlert =
        student.consecutiveAbsenceAlert?.active &&
        (student.consecutiveAbsenceAlert.selectedDates?.length || 0) > 0;
      if (onlyReportedFilter && !hasAlert) return false;
      if (!q) return true;
      return (
        student.name.toLowerCase().includes(q) ||
        cls.name.toLowerCase().includes(q) ||
        student.number.toString() === q ||
        student.number.toString().padStart(2, '0') === q
      );
    });
  }, [scopedEntries, searchQuery, onlyReportedFilter]);

  const handleToggleDay = (cls: ClassGroup, student: Student, dateKey: string) => {
    if (!canReportDays) return;
    const currentDates = student.consecutiveAbsenceAlert?.selectedDates || [];
    const exists = currentDates.includes(dateKey);
    const nextDates = exists
      ? currentDates.filter((d) => d !== dateKey)
      : [...currentDates, dateKey].sort((a, b) => {
          const idxA = recentFourDays.findIndex((d) => d.key === a);
          const idxB = recentFourDays.findIndex((d) => d.key === b);
          return idxA - idxB;
        });

    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: nextDates,
        reportedAt: nowStr,
        reportedByTeacher: cls.teacherName || 'PEB I',
        familyFeedback: student.consecutiveAbsenceAlert?.familyFeedback || '',
        feedbackUpdatedAt: student.consecutiveAbsenceAlert?.feedbackUpdatedAt,
        active: nextDates.length > 0,
      },
    };

    onUpdateStudent(cls.id, updatedStudent);
  };

  const handleClearAlert = (cls: ClassGroup, student: Student) => {
    if (!canReportDays) return;
    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: [],
        reportedAt: '',
        reportedByTeacher: cls.teacherName || 'PEB I',
        familyFeedback: student.consecutiveAbsenceAlert?.familyFeedback || '',
        feedbackUpdatedAt: student.consecutiveAbsenceAlert?.feedbackUpdatedAt,
        active: false,
      },
    };
    onUpdateStudent(cls.id, updatedStudent);
  };

  const handleSaveFamilyFeedback = (cls: ClassGroup, student: Student, feedbackText: string) => {
    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const currentDates = student.consecutiveAbsenceAlert?.selectedDates || [];
    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: currentDates,
        reportedAt: student.consecutiveAbsenceAlert?.reportedAt || nowStr,
        reportedByTeacher:
          student.consecutiveAbsenceAlert?.reportedByTeacher || cls.teacherName || 'PEB I',
        familyFeedback: feedbackText.trim(),
        feedbackUpdatedAt: nowStr,
        active: currentDates.length > 0 || feedbackText.trim().length > 0,
      },
    };
    onUpdateStudent(cls.id, updatedStudent);
  };

  return (
    <div className="flex flex-col w-full max-w-[1200px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {/* Barra de Seleção de Turma / Escopo */}
      {availableClasses.length > 1 && onSelectClass && (
        <div className="bg-white rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[0.76rem] font-semibold text-[#6e6e73] pl-1">
              Visualização:
            </span>
            {userRole !== 'usuario' && (
              <div className="ios-segmented">
                <button
                  type="button"
                  onClick={() => setViewAllClassesMode(true)}
                  className={`ios-segmented-item px-3 py-1 text-[0.75rem] ${
                    viewAllClassesMode ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Todas as Turmas ({availableClasses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewAllClassesMode(false)}
                  className={`ios-segmented-item px-3 py-1 text-[0.75rem] ${
                    !viewAllClassesMode ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Por Turma ({classGroup.name})
                </button>
              </div>
            )}
          </div>

          {(!viewAllClassesMode || userRole === 'usuario') && (
            <select
              value={classGroup.id}
              onChange={(e) => {
                const target = availableClasses.find((c) => c.id === e.target.value);
                if (target) onSelectClass(target);
              }}
              className="px-3.5 py-1.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[0.8rem] font-semibold cursor-pointer focus:outline-none"
            >
              {availableClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  Turma {cls.name} — {cls.shift.replace('Turno ', '')} ({cls.teacherName || 'PEB I'})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Cabeçalho Minimalista de Acompanhamento Unificado */}
      <section className="card-welcoming bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#ff3b30]">
                Acompanhamento de Faltas Seguidas •{' '}
                {viewAllClassesMode
                  ? 'Todas as Turmas'
                  : `Turma ${classGroup.name} (${classGroup.shift.replace('Turno ', '')})`}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[0.66rem] font-bold">
                {userRole === 'usuario'
                  ? 'PEB I • Informa Dias e Acompanha Acúmulo & Feedbacks'
                  : userRole === 'peb2'
                  ? 'PEB II • Acompanhamento de Faltas e Devolutivas'
                  : 'Admin / Secretaria • Gestão e Devolutiva da Família'}
              </span>
            </div>
            <h1 className="text-[1.35rem] sm:text-[1.6rem] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Faltas Seguidas, Acúmulo &amp; Feedback da Família
            </h1>
            <p className="text-[0.84rem] text-[#6e6e73]">
              {userRole === 'usuario'
                ? 'Toque no estudante para informar até os 4 dias anteriores de falta e acompanhe na mesma tela o acúmulo mensal/anual e o feedback da família registrado pela secretaria.'
                : 'Acompanhe em tempo real os estudantes sinalizados pelos professores PEB I, o acúmulo de faltas no mês e os feedbacks de contato com a família.'}
            </p>
          </div>

          <div className="ios-segmented shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setOnlyReportedFilter(false)}
              className={`ios-segmented-item px-3.5 py-1.5 text-[0.78rem] ${
                !onlyReportedFilter ? 'ios-segmented-item-active' : ''
              }`}
            >
              Todos ({scopedEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setOnlyReportedFilter(true)}
              className={`ios-segmented-item px-3.5 py-1.5 text-[0.78rem] ${
                onlyReportedFilter ? 'ios-segmented-item-active' : ''
              }`}
            >
              Em Alerta ({reportedCount})
            </button>
          </div>
        </div>

        {/* Resumo Rápido de Acúmulo e Devolutivas */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-2xl bg-[#f5f5f7]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#6e6e73] block">
              Faltas Seguidas Ativas
            </span>
            <span className="text-[1.25rem] font-extrabold text-[#ff3b30] tabular-nums">
              {reportedCount}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-[#f5f5f7]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#6e6e73] block">
              Com Feedback da Família
            </span>
            <span className="text-[1.25rem] font-extrabold text-[#1d8338] tabular-nums">
              {withFeedbackCount}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-[#f5f5f7]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#6e6e73] block">
              Aguardando Retorno
            </span>
            <span className="text-[1.25rem] font-extrabold text-[#1d1d1f] tabular-nums">
              {Math.max(0, reportedCount - withFeedbackCount)}
            </span>
          </div>
        </div>

        {/* Busca Simples */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868b] text-[19px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar estudante por nome, número ou turma..."
            className="w-full min-h-[42px] pl-10 pr-8 bg-[#f5f5f7] text-[#1d1d1f] text-[0.86rem] rounded-2xl focus:bg-white focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
            </button>
          )}
        </div>
      </section>

      {/* Lista Unificada de Acompanhamento */}
      <div className="bg-white rounded-3xl overflow-hidden divide-y divide-black/[0.04]">
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center space-y-1">
            <p className="text-[0.95rem] font-bold text-[#1d1d1f]">
              Nenhum estudante encontrado neste filtro
            </p>
            <p className="text-[0.8rem] text-[#6e6e73]">
              Altere o filtro acima para visualizar todos os estudantes da turma.
            </p>
          </div>
        ) : (
          filteredEntries.map(({ cls, student }) => {
            const compositeKey = `${cls.id}_${student.id}`;
            const isExpanded = expandedStudentId === compositeKey;
            const selectedDates = student.consecutiveAbsenceAlert?.selectedDates || [];
            const hasActiveAlert =
              student.consecutiveAbsenceAlert?.active && selectedDates.length > 0;
            const familyFeedback = (
              student.consecutiveAbsenceAlert?.familyFeedback || ''
            ).trim();
            const accumulatedMonthAbsences = student.totalAbsencesMonth || 0;
            const accumulatedYearAbsences =
              student.faltas200Dias ??
              student.yearlyAbsences200Days ??
              accumulatedMonthAbsences;

            return (
              <div
                key={compositeKey}
                className={`transition-colors ${
                  hasActiveAlert ? 'bg-[#fff9f9]' : 'hover:bg-[#fbfbfd]'
                }`}
              >
                {/* Linha Principal do Estudante */}
                <div
                  onClick={() =>
                    setExpandedStudentId(isExpanded ? null : compositeKey)
                  }
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span
                      className={`w-8 h-8 rounded-xl font-mono font-bold text-[0.76rem] flex items-center justify-center shrink-0 tabular-nums ${
                        hasActiveAlert
                          ? 'bg-[#ff3b30] text-white'
                          : 'bg-[#f5f5f7] text-[#1d1d1f]'
                      }`}
                    >
                      {student.number.toString().padStart(2, '0')}
                    </span>

                    <StudentAvatar student={student} size="md" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-bold text-[0.95rem] text-[#1d1d1f] truncate">
                          {student.name}
                        </h3>
                        {viewAllClassesMode && (
                          <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[0.68rem] font-bold">
                            Turma {cls.name}
                          </span>
                        )}
                      </div>

                      {/* Acúmulo de Dias + Dias Seguidos Informados */}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] font-semibold text-[0.72rem] tabular-nums">
                          <span>Acúmulo Mês: {accumulatedMonthAbsences} faltas</span>
                          <span className="opacity-40">•</span>
                          <span>Ano: {accumulatedYearAbsences}</span>
                        </span>

                        {hasActiveAlert ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ff3b30]/12 text-[#ff3b30] font-semibold text-[0.73rem]">
                            <span className="material-symbols-outlined text-[14px]">
                              event_busy
                            </span>
                            <span>
                              Faltas seguidas: {selectedDates.join(', ')} ({selectedDates.length}{' '}
                              {selectedDates.length === 1 ? 'dia' : 'dias'})
                            </span>
                          </span>
                        ) : (
                          <span className="text-[0.74rem] text-[#86868b]">
                            {canReportDays
                              ? 'Toque para informar dias seguidos de falta'
                              : 'Sem alerta de faltas seguidas'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Coluna da Frente: Devolutiva da Secretaria / Feedback da Família */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    {familyFeedback ? (
                      <div className="px-3.5 py-2 rounded-2xl bg-[#eaf6ef] text-[#1d8338] text-[0.78rem] max-w-xs sm:max-w-sm">
                        <span className="text-[0.64rem] font-bold uppercase tracking-wider block opacity-80">
                          Feedback da Família (Secretaria)
                        </span>
                        <span className="font-semibold leading-snug block">
                          {familyFeedback}
                        </span>
                      </div>
                    ) : hasActiveAlert ? (
                      <span className="px-3 py-1 rounded-full bg-[#f5f5f7] text-[#6e6e73] text-[0.73rem] font-medium">
                        Aguardando contato da secretaria
                      </span>
                    ) : null}

                    <span
                      className={`material-symbols-outlined text-[20px] text-[#86868b] transition-transform ${
                        isExpanded ? 'rotate-180 text-[#1d1d1f]' : ''
                      }`}
                    >
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Painel Expansível: PEB I seleciona até 4 dias + Acompanha Feedback / Secretaria registra Feedback */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-4 pt-2 bg-[#f5f5f7]/70 space-y-3 animate-gentle-fade">
                    {canReportDays && (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[0.78rem] font-semibold text-[#1d1d1f]">
                            Selecione os dias em que o(a) estudante faltou (até 4 dias anteriores):
                          </span>
                          {hasActiveAlert && (
                            <button
                              type="button"
                              onClick={() => handleClearAlert(cls, student)}
                              className="text-[0.75rem] font-semibold text-[#6e6e73] hover:text-[#ff3b30] cursor-pointer"
                            >
                              Limpar seleção
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {recentFourDays.map((day) => {
                            const isSelected = selectedDates.includes(day.key);
                            return (
                              <button
                                key={day.key}
                                type="button"
                                onClick={() => handleToggleDay(cls, student, day.key)}
                                className={`min-h-[46px] px-4 py-2 rounded-2xl font-semibold text-[0.86rem] flex items-center justify-between gap-2 cursor-pointer transition-all active:scale-95 ${
                                  isSelected
                                    ? 'bg-[#ff3b30] text-white shadow-sm'
                                    : 'bg-white text-[#1d1d1f] hover:bg-black/[0.04]'
                                }`}
                              >
                                <span>{day.fullLabel}</span>
                                <span className="material-symbols-outlined text-[18px]">
                                  {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {/* Campo para Admin/Secretaria registrar ou atualizar a devolutiva da família na coluna da frente */}
                    {canEditFamilyFeedback && (
                      <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          value={
                            feedbackDrafts[compositeKey] !== undefined
                              ? feedbackDrafts[compositeKey]
                              : familyFeedback
                          }
                          onChange={(e) =>
                            setFeedbackDrafts((prev) => ({
                              ...prev,
                              [compositeKey]: e.target.value,
                            }))
                          }
                          placeholder="Registrar retorno da família (ex: Mãe informou consulta médica / atestado)..."
                          className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-white text-[#1d1d1f] text-[0.82rem] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const text =
                              feedbackDrafts[compositeKey] !== undefined
                                ? feedbackDrafts[compositeKey]
                                : familyFeedback;
                            handleSaveFamilyFeedback(cls, student, text);
                          }}
                          className="min-h-[40px] px-4 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[0.8rem] cursor-pointer shrink-0"
                        >
                          Salvar Retorno na Planilha
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
