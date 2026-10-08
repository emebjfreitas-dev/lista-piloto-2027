import React, { useState, useMemo } from 'react';
import { ClassGroup, Student } from '../types';
import { StudentAvatar } from './StudentAvatar';

interface FaltasConsecutivasScreenProps {
  classGroup: ClassGroup;
  availableClasses?: ClassGroup[];
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
  onSelectClass,
  onUpdateStudent,
}) => {
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyReportedFilter, setOnlyReportedFilter] = useState(false);

  const recentFourDays = useMemo(() => getRecentFourSchoolDays(), []);

  const activeStudents = useMemo(() => {
    return [...classGroup.students]
      .filter((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
      })
      .sort((a, b) => a.number - b.number);
  }, [classGroup.students]);

  const reportedCount = useMemo(() => {
    return activeStudents.filter(
      (s) =>
        s.consecutiveAbsenceAlert?.active &&
        (s.consecutiveAbsenceAlert.selectedDates?.length || 0) > 0
    ).length;
  }, [activeStudents]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activeStudents.filter((s) => {
      const hasAlert =
        s.consecutiveAbsenceAlert?.active &&
        (s.consecutiveAbsenceAlert.selectedDates?.length || 0) > 0;
      if (onlyReportedFilter && !hasAlert) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.number.toString() === q ||
        s.number.toString().padStart(2, '0') === q
      );
    });
  }, [activeStudents, searchQuery, onlyReportedFilter]);

  const handleToggleDay = (student: Student, dateKey: string) => {
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
        reportedByTeacher: classGroup.teacherName || 'PEB I',
        familyFeedback: student.consecutiveAbsenceAlert?.familyFeedback || '',
        feedbackUpdatedAt: student.consecutiveAbsenceAlert?.feedbackUpdatedAt,
        active: nextDates.length > 0,
      },
    };

    onUpdateStudent(classGroup.id, updatedStudent);
  };

  const handleClearAlert = (student: Student) => {
    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: [],
        reportedAt: '',
        reportedByTeacher: classGroup.teacherName || 'PEB I',
        familyFeedback: student.consecutiveAbsenceAlert?.familyFeedback || '',
        feedbackUpdatedAt: student.consecutiveAbsenceAlert?.feedbackUpdatedAt,
        active: false,
      },
    };
    onUpdateStudent(classGroup.id, updatedStudent);
  };

  return (
    <div className="flex flex-col w-full max-w-[1100px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {/* Seletor de Turma caso a professora PEB I tenha 2 turmas */}
      {availableClasses.length > 1 && onSelectClass && (
        <div className="bg-white rounded-2xl p-3 flex items-center justify-between gap-2">
          <span className="text-[0.76rem] font-semibold text-[#6e6e73] pl-1">
            Alternar Turma:
          </span>
          <div className="ios-segmented">
            {availableClasses.map((cls) => {
              const isSelected = cls.id === classGroup.id;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => onSelectClass(cls)}
                  className={`ios-segmented-item px-3.5 py-1.5 text-[0.78rem] ${
                    isSelected ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  {cls.name} ({cls.shift.replace('Turno ', '')})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cabeçalho Minimalista */}
      <section className="card-welcoming bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#ff3b30] block">
              Busca Ativa • Turma {classGroup.name} ({classGroup.shift.replace('Turno ', '')})
            </span>
            <h1 className="text-[1.35rem] sm:text-[1.6rem] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Aviso de Faltas Consecutivas (Até 4 Dias)
            </h1>
            <p className="text-[0.84rem] text-[#6e6e73]">
              Toque no estudante e marque os dias anteriores em que faltou. A secretaria recebe na hora na planilha e devolve o retorno da família aqui mesmo.
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
              Todos ({activeStudents.length})
            </button>
            <button
              type="button"
              onClick={() => setOnlyReportedFilter(true)}
              className={`ios-segmented-item px-3.5 py-1.5 text-[0.78rem] ${
                onlyReportedFilter ? 'ios-segmented-item-active text-[#ff3b30]' : ''
              }`}
            >
              Avisados ({reportedCount})
            </button>
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
            placeholder="Buscar estudante por nome ou número..."
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

      {/* Lista Minimalista de Estudantes: Toque no aluno para selecionar até 4 dias anteriores */}
      <div className="bg-white rounded-3xl overflow-hidden divide-y divide-black/[0.04]">
        {filteredStudents.map((student) => {
          const isExpanded = expandedStudentId === student.id;
          const selectedDates = student.consecutiveAbsenceAlert?.selectedDates || [];
          const hasActiveAlert =
            student.consecutiveAbsenceAlert?.active && selectedDates.length > 0;
          const familyFeedback = (
            student.consecutiveAbsenceAlert?.familyFeedback || ''
          ).trim();

          return (
            <div
              key={student.id}
              className={`transition-colors ${
                hasActiveAlert ? 'bg-[#fff9f9]' : 'hover:bg-[#fbfbfd]'
              }`}
            >
              {/* Linha Principal Clicável do Estudante */}
              <div
                onClick={() =>
                  setExpandedStudentId(isExpanded ? null : student.id)
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
                    <h3 className="font-bold text-[0.95rem] text-[#1d1d1f] truncate">
                      {student.name}
                    </h3>

                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {hasActiveAlert ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ff3b30]/12 text-[#ff3b30] font-semibold text-[0.74rem]">
                          <span className="material-symbols-outlined text-[14px]">
                            event_busy
                          </span>
                          <span>
                            Faltou: {selectedDates.join(', ')} ({selectedDates.length}{' '}
                            {selectedDates.length === 1 ? 'dia' : 'dias'})
                          </span>
                        </span>
                      ) : (
                        <span className="text-[0.76rem] text-[#86868b]">
                          Toque para informar faltas consecutivas
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coluna da Frente: Devolutiva da Secretaria / Feedback da Família */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  {familyFeedback ? (
                    <div className="px-3.5 py-2 rounded-2xl bg-[#eaf6ef] text-[#1d8338] text-[0.78rem] max-w-xs sm:max-w-sm">
                      <span className="text-[0.65rem] font-bold uppercase tracking-wider block opacity-80">
                        Retorno da Família (Secretaria)
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

              {/* Painel Expansível ao Clicar no Aluno: Seleção dos até 4 dias anteriores */}
              {isExpanded && (
                <div className="px-4 sm:px-6 pb-4 pt-1 bg-[#f5f5f7]/70 space-y-3 animate-gentle-fade">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.78rem] font-semibold text-[#1d1d1f]">
                      Selecione os dias em que o(a) estudante faltou (até 4 dias anteriores):
                    </span>
                    {hasActiveAlert && (
                      <button
                        type="button"
                        onClick={() => handleClearAlert(student)}
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
                          onClick={() => handleToggleDay(student, day.key)}
                          className={`min-h-[48px] px-4 py-2.5 rounded-2xl font-semibold text-[0.88rem] flex items-center justify-between gap-2 cursor-pointer transition-all active:scale-95 ${
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
