import React, { useState, useMemo } from 'react';
import {
  ClassGroup,
  ConsecutiveAbsenceOccurrence,
  Student,
  UserRole,
} from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  getStudentCumulativeOccurrences,
  triggerPushNotification,
} from '../services/pushNotificationService';
import { resolveGuardianRelationshipInfo } from '../utils/genderDictionary';

interface FaltasConsecutivasScreenProps {
  classGroup: ClassGroup;
  availableClasses?: ClassGroup[];
  userRole?: UserRole;
  onSelectClass?: (cls: ClassGroup) => void;
  onUpdateStudent: (classId: string, updatedStudent: Student) => void;
  onBack?: () => void;
}

export interface SchoolDayOption {
  key: string;
  shortDate: string;
  weekdayLabel: string;
  fullLabel: string;
  chronologicalIndex: number;
}

/**
 * Gera os últimos 8 dias letivos (segunda a sexta-feira) em ordem cronológica
 * para que a professora PEB I possa selecionar facilmente 3 ou mais dias seguidos.
 */
export function getRecentSchoolDays(referenceDate: Date = new Date(), count = 12): SchoolDayOption[] {
  const rawDays: Array<{
    key: string;
    shortDate: string;
    weekdayLabel: string;
    fullLabel: string;
  }> = [];
  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const cursor = new Date(referenceDate);

  while (rawDays.length < count) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      const dd = String(cursor.getDate()).padStart(2, '0');
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const shortDate = `${dd}/${mm}`;
      const weekdayLabel = weekdayNames[dow];
      rawDays.unshift({
        key: shortDate,
        shortDate,
        weekdayLabel,
        fullLabel: `${weekdayLabel} ${shortDate}`,
      });
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return rawDays.map((d, idx) => ({
    ...d,
    chronologicalIndex: idx,
  }));
}

/**
 * Verifica se os dias selecionados contêm pelo menos 3 dias letivos consecutivos.
 */
export function hasThreeOrMoreConsecutiveSchoolDays(
  selectedKeys: string[],
  availableDays: SchoolDayOption[]
): { isValid: boolean; maxConsecutive: number; sortedKeys: string[] } {
  if (selectedKeys.length === 0) {
    return { isValid: false, maxConsecutive: 0, sortedKeys: [] };
  }

  const indexMap = new Map<string, number>();
  availableDays.forEach((d) => indexMap.set(d.key, d.chronologicalIndex));

  const sortedKeys = [...selectedKeys].sort(
    (a, b) => (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0)
  );

  const indices = sortedKeys
    .map((k) => indexMap.get(k))
    .filter((idx): idx is number => typeof idx === 'number');

  if (indices.length < 3) {
    return {
      isValid: false,
      maxConsecutive: indices.length,
      sortedKeys,
    };
  }

  let currentStreak = 1;
  let maxStreak = 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      currentStreak += 1;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  return {
    isValid: maxStreak >= 3,
    maxConsecutive: maxStreak,
    sortedKeys,
  };
}

const QUICK_FAMILY_FEEDBACK_CHIPS = [
  'Atestado Médico Entregue',
  'Criança com quadro febril / virose',
  'Consulta médica / odontológica',
  'Viagem familiar comunicada',
  'Tentativa de contato sem sucesso (Caixa Postal)',
  'Responsável ciente · Retorno amanhã',
];

export const FaltasConsecutivasScreen: React.FC<FaltasConsecutivasScreenProps> = ({
  classGroup,
  availableClasses = [],
  userRole = 'usuario',
  onSelectClass,
  onUpdateStudent,
  onBack,
}) => {
  const [expandedStudentKey, setExpandedStudentKey] = useState<string | null>(null);
  const [draftSelectedDaysByStudent, setDraftSelectedDaysByStudent] = useState<
    Record<string, string[]>
  >({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<
    'all' | 'com_ocorrencia' | 'com_feedback' | 'aguardando_feedback'
  >('all');
  const [viewAllClassesMode, setViewAllClassesMode] = useState(
    userRole !== 'usuario' && availableClasses.length > 1
  );
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});

  // Modal de leitura calma da ocorrência (para ler em detalhes durante o ano todo)
  const [readingOccurrenceModal, setReadingOccurrenceModal] = useState<{
    cls: ClassGroup;
    student: Student;
    occurrenceId: string;
  } | null>(null);

  const canReportDays = userRole === 'usuario' || userRole === 'admin';
  const canEditFamilyFeedback = userRole === 'admin';

  const recentSchoolDays = useMemo(() => getRecentSchoolDays(new Date(), 12), []);

  // Lista unificada de estudantes (por turma ou todas as turmas para PEB II / Admin)
  const scopedEntries = useMemo(() => {
    const sourceClasses =
      viewAllClassesMode && availableClasses.length > 0
        ? availableClasses
        : [classGroup];

    const entries: Array<{
      cls: ClassGroup;
      student: Student;
      occurrences: ConsecutiveAbsenceOccurrence[];
      totalConsecutiveDaysYear: number;
    }> = [];

    for (const cls of sourceClasses) {
      const active = [...cls.students]
        .filter((s) => {
          const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
          return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
        })
        .sort((a, b) => a.number - b.number);

      for (const student of active) {
        const occurrences = getStudentCumulativeOccurrences(student);
        const totalConsecutiveDaysYear = occurrences.reduce(
          (acc, occ) => acc + (occ.selectedDates?.length || 0),
          0
        );
        entries.push({
          cls,
          student,
          occurrences,
          totalConsecutiveDaysYear,
        });
      }
    }
    return entries;
  }, [viewAllClassesMode, availableClasses, classGroup]);

  // Estatísticas acumulativas do ano
  const summaryStats = useMemo(() => {
    let totalOccurrencesCount = 0;
    let totalWithFeedback = 0;
    let totalWaitingFeedback = 0;
    let studentsWithAnyOccurrence = 0;
    const recentFeedbacks: Array<{
      cls: ClassGroup;
      student: Student;
      occ: ConsecutiveAbsenceOccurrence;
    }> = [];

    scopedEntries.forEach(({ cls, student, occurrences }) => {
      if (occurrences.length > 0) {
        studentsWithAnyOccurrence += 1;
      }
      occurrences.forEach((occ) => {
        totalOccurrencesCount += 1;
        if ((occ.familyFeedback || '').trim().length > 0) {
          totalWithFeedback += 1;
          recentFeedbacks.push({ cls, student, occ });
        } else {
          totalWaitingFeedback += 1;
        }
      });
    });

    return {
      studentsWithAnyOccurrence,
      totalOccurrencesCount,
      totalWithFeedback,
      totalWaitingFeedback,
      recentFeedbacks,
    };
  }, [scopedEntries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return scopedEntries.filter(({ cls, student, occurrences }) => {
      if (filterMode === 'com_ocorrencia' && occurrences.length === 0) return false;
      if (
        filterMode === 'com_feedback' &&
        !occurrences.some((o) => (o.familyFeedback || '').trim().length > 0)
      ) {
        return false;
      }
      if (
        filterMode === 'aguardando_feedback' &&
        !occurrences.some((o) => !(o.familyFeedback || '').trim())
      ) {
        return false;
      }
      if (!q) return true;
      return (
        student.name.toLowerCase().includes(q) ||
        cls.name.toLowerCase().includes(q) ||
        student.number.toString() === q ||
        student.number.toString().padStart(2, '0') === q
      );
    });
  }, [scopedEntries, searchQuery, filterMode]);

  const handleToggleDraftDay = (compositeKey: string, dayKey: string) => {
    if (!canReportDays) return;
    setDraftSelectedDaysByStudent((prev) => {
      const current = prev[compositeKey] || [];
      const exists = current.includes(dayKey);
      const next = exists
        ? current.filter((d) => d !== dayKey)
        : [...current, dayKey];
      return {
        ...prev,
        [compositeKey]: next,
      };
    });
  };

  const handleSelectLastThreeDaysShortcut = (compositeKey: string) => {
    if (!canReportDays) return;
    const lastThree = recentSchoolDays.slice(-3).map((d) => d.key);
    setDraftSelectedDaysByStudent((prev) => ({
      ...prev,
      [compositeKey]: lastThree,
    }));
  };

  /**
   * Registra uma nova sequência acumulativa de 3+ dias seguidos de falta para a criança
   * e alimenta imediatamente a aba Busca_Ativa_Faltas_Consecutivas_2027 na planilha.
   */
  const handleRegisterNewOccurrence = (cls: ClassGroup, student: Student) => {
    const compositeKey = `${cls.id}_${student.id}`;
    const selectedRaw = draftSelectedDaysByStudent[compositeKey] || [];
    const validation = hasThreeOrMoreConsecutiveSchoolDays(
      selectedRaw,
      recentSchoolDays
    );
    if (!validation.isValid) return;

    const existingOccurrences = getStudentCumulativeOccurrences(student);
    const nextSequenceNumber = existingOccurrences.length + 1;

    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const newOccurrence: ConsecutiveAbsenceOccurrence = {
      id: `${student.id}_occ_${nextSequenceNumber}_${Date.now()}`,
      sequenceNumber: nextSequenceNumber,
      selectedDates: validation.sortedKeys,
      reportedAt: nowStr,
      reportedByTeacher: cls.teacherName || 'PEB I',
      familyFeedback: '',
      feedbackUpdatedAt: '',
      feedbackReadByTeacher: false,
    };

    const updatedOccurrences = [...existingOccurrences, newOccurrence];

    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: newOccurrence.selectedDates,
        reportedAt: newOccurrence.reportedAt,
        reportedByTeacher: newOccurrence.reportedByTeacher,
        familyFeedback: newOccurrence.familyFeedback,
        feedbackUpdatedAt: newOccurrence.feedbackUpdatedAt,
        active: true,
        occurrences: updatedOccurrences,
      },
    };

    onUpdateStudent(cls.id, updatedStudent);

    // Limpa o rascunho de dias selecionados após gravar a ocorrência
    setDraftSelectedDaysByStudent((prev) => ({
      ...prev,
      [compositeKey]: [],
    }));

    // Dispara confirmação Push instantânea
    triggerPushNotification(
      {
        title: `${nextSequenceNumber}ª Ocorrência Registrada • ${student.name.split(' ')[0]}`,
        body: `Faltas seguidas (${validation.sortedKeys.join(', ')}) enviadas para a Planilha da Secretaria.`,
        category: 'busca_ativa',
        targetClassId: cls.id,
        targetScreen: 'faltas_consecutivas',
        authorName: cls.teacherName || 'PEB I',
      },
      { saveToFeed: true, showBanner: true }
    );
  };

  /**
   * Salva o feedback da família (Secretaria / Admin) em uma ocorrência específica
   * e dispara um Resumo Push para a professora.
   */
  const handleSaveOccurrenceFeedback = (
    cls: ClassGroup,
    student: Student,
    occurrenceId: string,
    feedbackText: string
  ) => {
    const existingOccurrences = getStudentCumulativeOccurrences(student);
    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const updatedOccurrences = existingOccurrences.map((occ) =>
      occ.id === occurrenceId
        ? {
            ...occ,
            familyFeedback: feedbackText.trim(),
            feedbackUpdatedAt: nowStr,
            feedbackReadByTeacher: false,
          }
        : occ
    );

    const latest = updatedOccurrences[updatedOccurrences.length - 1];
    const targetOcc =
      updatedOccurrences.find((o) => o.id === occurrenceId) || latest;

    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: latest?.selectedDates || [],
        reportedAt: latest?.reportedAt || nowStr,
        reportedByTeacher: latest?.reportedByTeacher || cls.teacherName || 'PEB I',
        familyFeedback: latest?.familyFeedback || feedbackText.trim(),
        feedbackUpdatedAt: latest?.feedbackUpdatedAt || nowStr,
        active: updatedOccurrences.length > 0,
        occurrences: updatedOccurrences,
      },
    };

    onUpdateStudent(cls.id, updatedStudent);

    if (feedbackText.trim()) {
      triggerPushNotification(
        {
          title: `Feedback da Família • ${student.name.split(' ')[0]} (${
            targetOcc?.sequenceNumber || 1
          }ª Ocorrência)`,
          body: `Retorno da Secretaria: "${feedbackText.trim()}" — Toque para ler com calma.`,
          category: 'busca_ativa',
          targetClassId: cls.id,
          targetScreen: 'faltas_consecutivas',
          authorName: 'Secretaria Escolar',
        },
        { saveToFeed: true, showBanner: true }
      );
    }
  };

  const handleRemoveOccurrence = (
    cls: ClassGroup,
    student: Student,
    occurrenceId: string
  ) => {
    if (!canReportDays) return;
    const existingOccurrences = getStudentCumulativeOccurrences(student);
    const remaining = existingOccurrences
      .filter((o) => o.id !== occurrenceId)
      .map((o, idx) => ({
        ...o,
        sequenceNumber: idx + 1,
      }));

    const latest = remaining[remaining.length - 1];
    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: latest?.selectedDates || [],
        reportedAt: latest?.reportedAt || '',
        reportedByTeacher: latest?.reportedByTeacher || cls.teacherName || 'PEB I',
        familyFeedback: latest?.familyFeedback || '',
        feedbackUpdatedAt: latest?.feedbackUpdatedAt || '',
        active: remaining.length > 0,
        occurrences: remaining,
      },
    };

    onUpdateStudent(cls.id, updatedStudent);
    if (readingOccurrenceModal?.occurrenceId === occurrenceId) {
      setReadingOccurrenceModal(null);
    }
  };

  // Resolve dados atualizados para o modal de leitura calma
  const activeModalData = useMemo(() => {
    if (!readingOccurrenceModal) return null;
    const foundEntry = scopedEntries.find(
      (e) =>
        e.cls.id === readingOccurrenceModal.cls.id &&
        e.student.id === readingOccurrenceModal.student.id
    );
    const cls = foundEntry?.cls || readingOccurrenceModal.cls;
    const student = foundEntry?.student || readingOccurrenceModal.student;
    const occurrences = getStudentCumulativeOccurrences(student);
    const activeOcc =
      occurrences.find((o) => o.id === readingOccurrenceModal.occurrenceId) ||
      occurrences[occurrences.length - 1];
    if (!activeOcc) return null;
    return { cls, student, occurrences, activeOcc };
  }, [readingOccurrenceModal, scopedEntries]);

  return (
    <div className="flex flex-col w-full max-w-[1250px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {/* Breadcrumb Limpo */}
      <div className="flex items-center justify-between text-xs text-slate-500 py-0.5">
        <div className="flex items-center gap-1.5">
          {onBack && (
            <>
              <button
                type="button"
                onClick={onBack}
                className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Voltar</span>
              </button>
              <span className="text-slate-300">/</span>
            </>
          )}
          <span className="font-semibold text-slate-800">Busca Ativa</span>
          <span className="text-slate-400">·</span>
          <span>Alertas de Faltas Consecutivas</span>
        </div>
        <span className="text-slate-400 text-xs hidden sm:inline">
          {availableClasses.length} turmas monitoradas
        </span>
      </div>

      {/* Seletor de Escopo */}
      {availableClasses.length > 1 && onSelectClass && (
        <div className="bg-white rounded-xl border border-slate-200/90 p-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 pl-1">
              Escopo:
            </span>
            {userRole !== 'usuario' && (
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewAllClassesMode(true)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    viewAllClassesMode
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas ({availableClasses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewAllClassesMode(false)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    !viewAllClassesMode
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
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
              className="h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200/90 text-slate-800 text-xs font-medium cursor-pointer focus:outline-none"
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

      {/* Resumo Push de Retornos da Família (Aparece em destaque para leitura rápida ou detalhada) */}
      {summaryStats.recentFeedbacks.length > 0 && (
        <section className="card-welcoming bg-white p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#28cd41]/15 text-[#1d8338] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">
                  notifications_active
                </span>
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#1d1d1f] leading-tight">
                  Resumo Push • Devolutivas da Família (Secretaria)
                </h2>
                <p className="text-xs text-[#6e6e73]">
                  Toque em qualquer ocorrência abaixo para abrir e ler o retorno completo com calma durante todo o ano letivo
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium shrink-0">
              {summaryStats.recentFeedbacks.length} retorno(s)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {summaryStats.recentFeedbacks.slice(0, 6).map(({ cls, student, occ }) => (
              <button
                key={occ.id}
                type="button"
                onClick={() =>
                  setReadingOccurrenceModal({
                    cls,
                    student,
                    occurrenceId: occ.id,
                  })
                }
                className="text-left p-3.5 rounded-2xl bg-[#f5f5f7] hover:bg-[#e8e8ed]/80 transition-all cursor-pointer flex flex-col justify-between gap-2 group"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-700 text-white text-[11px] font-semibold uppercase">
                      {occ.sequenceNumber}ª Ocorrência • Turma {cls.name}
                    </span>
                    <span className="text-[11px] font-semibold text-[#6e6e73]">
                      {occ.feedbackUpdatedAt || occ.reportedAt}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#1d1d1f] mt-1.5 truncate">
                    {student.name}
                  </p>
                  <p className="text-xs text-[#ff3b30] font-semibold mt-0.5">
                    Dias faltosos: {occ.selectedDates.join(', ')} ({occ.selectedDates.length} dias)
                  </p>
                  <p className="text-xs text-[#1d8338] font-semibold mt-1 line-clamp-2">
                    “{occ.familyFeedback}”
                  </p>
                </div>

                <span className="text-xs font-bold text-[#0066cc] group-hover:underline inline-flex items-center gap-1">
                  <span>Ler ocorrência completa</span>
                  <span className="material-symbols-outlined text-[14px]">
                    open_in_new
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Cabeçalho Principal: Faltas Seguidas, Acúmulo & Feedback da Família */}
      <section className="card-welcoming bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ff3b30]">
                Histórico Acumulativo no Ano •{' '}
                {viewAllClassesMode
                  ? 'Todas as Turmas'
                  : `Turma ${classGroup.name} (${classGroup.shift.replace('Turno ', '')})`}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[11px] font-bold">
                Regra: 3 ou mais dias letivos seguidos
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Faltas Consecutivas, Acúmulo &amp; Feedback da Família
            </h1>
            <p className="text-sm text-[#6e6e73]">
              O(A) mesmo(a) estudante pode registrar inúmeras sequências de 3+ faltas seguidas ao longo do ano. Cada sequência cai na planilha da secretaria e pode ser clicada a qualquer momento para leitura completa do feedback da família.
            </p>
          </div>

          {/* Filtros Rápidos */}
          <div className="ios-segmented self-start lg:self-center">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`ios-segmented-item px-3 py-1.5 text-xs ${
                filterMode === 'all' ? 'ios-segmented-item-active' : ''
              }`}
            >
              Todos ({scopedEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('com_ocorrencia')}
              className={`ios-segmented-item px-3 py-1.5 text-xs ${
                filterMode === 'com_ocorrencia' ? 'ios-segmented-item-active' : ''
              }`}
            >
              Com Ocorrências ({summaryStats.studentsWithAnyOccurrence})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('com_feedback')}
              className={`ios-segmented-item px-3 py-1.5 text-xs ${
                filterMode === 'com_feedback' ? 'ios-segmented-item-active' : ''
              }`}
            >
              Com Feedback ({summaryStats.totalWithFeedback})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('aguardando_feedback')}
              className={`ios-segmented-item px-3 py-1.5 text-xs ${
                filterMode === 'aguardando_feedback' ? 'ios-segmented-item-active' : ''
              }`}
            >
              Aguardando ({summaryStats.totalWaitingFeedback})
            </button>
          </div>
        </div>

        {/* 4 Indicadores de Acúmulo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 block">
              Sequências no Ano
            </span>
            <span className="text-2xl font-semibold text-rose-700 font-mono tabular-nums">
              {summaryStats.totalOccurrencesCount}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 block">
              Estudantes Acompanhados
            </span>
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {summaryStats.studentsWithAnyOccurrence}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 block">
              Feedbacks Recebidos
            </span>
            <span className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
              {summaryStats.totalWithFeedback}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 block">
              Aguardando Secretaria
            </span>
            <span className="text-2xl font-semibold text-amber-700 font-mono tabular-nums">
              {summaryStats.totalWaitingFeedback}
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
            placeholder="Buscar estudante por nome, número de chamada ou turma..."
            className="w-full min-h-[42px] pl-10 pr-8 bg-[#f5f5f7] text-[#1d1d1f] text-sm rounded-2xl focus:bg-white focus:outline-none"
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

      {/* Lista de Estudantes e Suas Sequências Acumuladas de Ocorrências */}
      <div className="bg-white rounded-3xl overflow-hidden divide-y divide-black/[0.04]">
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center space-y-1">
            <p className="text-base font-bold text-[#1d1d1f]">
              Nenhum estudante encontrado neste filtro
            </p>
            <p className="text-sm text-[#6e6e73]">
              Altere o filtro acima para visualizar todos os estudantes.
            </p>
          </div>
        ) : (
          filteredEntries.map(({ cls, student, occurrences, totalConsecutiveDaysYear }) => {
            const compositeKey = `${cls.id}_${student.id}`;
            const isExpanded = expandedStudentKey === compositeKey;
            const hasOccurrences = occurrences.length > 0;
            const draftDays = draftSelectedDaysByStudent[compositeKey] || [];
            const draftValidation = hasThreeOrMoreConsecutiveSchoolDays(
              draftDays,
              recentSchoolDays
            );

            const accumulatedMonthAbsences = Math.max(
              student.totalAbsencesMonth || 0,
              totalConsecutiveDaysYear
            );

            return (
              <div
                key={compositeKey}
                className={`transition-colors ${
                  hasOccurrences ? 'bg-[#fffafa]' : 'hover:bg-[#fbfbfd]'
                }`}
              >
                {/* Linha Principal do Estudante */}
                <div
                  onClick={() =>
                    setExpandedStudentKey(isExpanded ? null : compositeKey)
                  }
                  className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    <span
                      className={`w-8 h-8 rounded-xl font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums mt-0.5 sm:mt-0 ${
                        hasOccurrences
                          ? 'bg-[#ff3b30] text-white'
                          : 'bg-[#f5f5f7] text-[#1d1d1f]'
                      }`}
                    >
                      {student.number.toString().padStart(2, '0')}
                    </span>

                    <StudentAvatar student={student} size="md" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-bold text-base text-[#1d1d1f] truncate">
                          {student.name}
                        </h3>
                        {viewAllClassesMode && (
                          <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[11px] font-bold">
                            Turma {cls.name}
                          </span>
                        )}
                        {hasOccurrences && (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-medium">
                            {occurrences.length}{' '}
                            {occurrences.length === 1
                              ? 'sequência no ano'
                              : 'sequências no ano'}{' '}
                            ({totalConsecutiveDaysYear}d)
                          </span>
                        )}
                      </div>

                      {/* Resumo de Acúmulo + Pílulas Clicáveis de Cada Ocorrência do Ano */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] font-semibold text-xs tabular-nums">
                          <span>Acúmulo Mês: {accumulatedMonthAbsences} faltas</span>
                        </span>

                        {occurrences.map((occ) => {
                          const hasFeedback = Boolean(
                            (occ.familyFeedback || '').trim()
                          );
                          return (
                            <button
                              key={occ.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReadingOccurrenceModal({
                                  cls,
                                  student,
                                  occurrenceId: occ.id,
                                });
                              }}
                              title="Clique para abrir e ler esta ocorrência com calma"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                                hasFeedback
                                  ? 'bg-[#28cd41]/15 text-[#1d8338] hover:bg-[#28cd41]/25'
                                  : 'bg-[#ff3b30]/12 text-[#ff3b30] hover:bg-[#ff3b30]/20'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                {hasFeedback ? 'mark_chat_read' : 'event_busy'}
                              </span>
                              <span>
                                {occ.sequenceNumber}ª Ocorrência ({occ.selectedDates.length}d:{' '}
                                {occ.selectedDates.join(', ')})
                              </span>
                              {hasFeedback && (
                                <span className="underline ml-0.5">Ler Feedback</span>
                              )}
                            </button>
                          );
                        })}

                        {!hasOccurrences && (
                          <span className="text-xs text-[#86868b]">
                            {canReportDays
                              ? 'Toque para selecionar 3+ dias seguidos e abrir nova ocorrência'
                              : 'Sem ocorrências registradas no ano'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ação Direita */}
                  <div className="flex items-center justify-between lg:justify-end gap-2.5 shrink-0">
                    {canReportDays && (
                      <span className="px-3 py-1 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-xs font-semibold">
                        + Nova Ocorrência (3+ dias)
                      </span>
                    )}
                    <span
                      className={`material-symbols-outlined text-[20px] text-[#86868b] transition-transform ${
                        isExpanded ? 'rotate-180 text-[#1d1d1f]' : ''
                      }`}
                    >
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Painel Expansível: 1) Histórico Acumulado Clicável do Ano + 2) Novo Registro de 3+ Dias Seguidos */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-5 pt-2 bg-[#f5f5f7]/70 space-y-4 animate-gentle-fade">
                    {/* 1. Linha do Tempo Acumulativa de Todas as Ocorrências da Criança no Ano */}
                    {occurrences.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#6e6e73]">
                            Histórico Acumulado da Criança no Ano ({occurrences.length}{' '}
                            {occurrences.length === 1 ? 'ocorrência' : 'ocorrências'}) — Toque para ler com calma:
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {occurrences.map((occ) => {
                            const hasFeedback = Boolean(
                              (occ.familyFeedback || '').trim()
                            );
                            const draftKey = `${compositeKey}_${occ.id}`;

                            return (
                              <div
                                key={occ.id}
                                className="bg-white rounded-2xl p-4 space-y-2.5 shadow-2xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-medium uppercase">
                                      {occ.sequenceNumber}ª Sequência de Faltas ({occ.selectedDates.length} dias seguidos)
                                    </span>
                                    <p className="text-sm font-bold text-[#1d1d1f] mt-1">
                                      Dias: {occ.selectedDates.join(' • ')}
                                    </p>
                                    <p className="text-xs text-[#86868b]">
                                      Registrado em {occ.reportedAt || 'Outubro/2027'} por{' '}
                                      {occ.reportedByTeacher || cls.teacherName || 'PEB I'}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReadingOccurrenceModal({
                                          cls,
                                          student,
                                          occurrenceId: occ.id,
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-full bg-[#0071e3]/10 hover:bg-[#0071e3]/20 text-[#0066cc] text-xs font-bold cursor-pointer"
                                    >
                                      Ler com calma
                                    </button>
                                    {canReportDays && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveOccurrence(cls, student, occ.id)
                                        }
                                        title="Excluir esta ocorrência"
                                        className="w-7 h-7 rounded-full hover:bg-[#ff3b30]/10 text-[#86868b] hover:text-[#ff3b30] flex items-center justify-center cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">
                                          delete
                                        </span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Exibição do Feedback da Família */}
                                {hasFeedback ? (
                                  <div
                                    onClick={() =>
                                      setReadingOccurrenceModal({
                                        cls,
                                        student,
                                        occurrenceId: occ.id,
                                      })
                                    }
                                    className="p-3 rounded-xl bg-[#28cd41]/12 text-[#1d8338] cursor-pointer hover:bg-[#28cd41]/18 transition-colors"
                                  >
                                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider opacity-85">
                                      <span>Feedback da Família (Secretaria)</span>
                                      <span>{occ.feedbackUpdatedAt}</span>
                                    </div>
                                    <p className="text-sm font-semibold leading-snug mt-0.5">
                                      “{occ.familyFeedback}”
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-2.5 rounded-xl bg-[#f5f5f7] text-[#6e6e73] text-xs font-medium flex items-center justify-between">
                                    <span>
                                      Na planilha da secretaria • Aguardando contato com a família
                                    </span>
                                    <span className="material-symbols-outlined text-[16px] text-[#ff9500]">
                                      schedule
                                    </span>
                                  </div>
                                )}

                                {/* Campo rápido para Admin/Secretaria responder esta ocorrência específica + Pílulas de 1 Toque */}
                                {canEditFamilyFeedback && (
                                  <div className="pt-1 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {QUICK_FAMILY_FEEDBACK_CHIPS.map((chip) => (
                                        <button
                                          key={chip}
                                          type="button"
                                          onClick={() =>
                                            setFeedbackDrafts((prev) => ({
                                              ...prev,
                                              [draftKey]: chip,
                                            }))
                                          }
                                          className="px-2 py-0.5 rounded-lg bg-[#f5f5f7] hover:bg-[#1d1d1f] text-[#6e6e73] hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
                                        >
                                          + {chip}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-1.5">
                                      <input
                                        type="text"
                                        value={
                                          feedbackDrafts[draftKey] !== undefined
                                            ? feedbackDrafts[draftKey]
                                            : occ.familyFeedback || ''
                                        }
                                        onChange={(e) =>
                                          setFeedbackDrafts((prev) => ({
                                            ...prev,
                                            [draftKey]: e.target.value,
                                          }))
                                        }
                                        placeholder="Devolutiva da família para esta ocorrência..."
                                        className="flex-1 min-h-[36px] px-3 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-xs focus:bg-white focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const text =
                                            feedbackDrafts[draftKey] !== undefined
                                              ? feedbackDrafts[draftKey]
                                              : occ.familyFeedback || '';
                                          handleSaveOccurrenceFeedback(
                                            cls,
                                            student,
                                            occ.id,
                                            text
                                          );
                                        }}
                                        className="min-h-[36px] px-3.5 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold text-xs cursor-pointer shrink-0"
                                      >
                                        Salvar &amp; Enviar Push
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Seletor Intuitivo para Registrar Nova Sequência de 3 ou Mais Dias Seguidos */}
                    {canReportDays && (
                      <div className="bg-white rounded-2xl p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-bold text-[#1d1d1f] block">
                              Registrar {occurrences.length + 1}ª Ocorrência de Faltas Seguidas (Mínimo 3 dias seguidos):
                            </span>
                            <span className="text-xs text-[#6e6e73]">
                              Selecione 3 ou mais dias letivos consecutivos abaixo. Ao confirmar, a ocorrência cai direto na planilha da secretaria.
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleSelectLastThreeDaysShortcut(compositeKey)
                              }
                              className="px-3 py-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-xs font-bold cursor-pointer"
                            >
                              Selecionar últimos 3 dias
                            </button>
                            {draftDays.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftSelectedDaysByStudent((prev) => ({
                                    ...prev,
                                    [compositeKey]: [],
                                  }))
                                }
                                className="text-xs font-semibold text-[#6e6e73] hover:text-[#ff3b30] cursor-pointer"
                              >
                                Limpar
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                          {recentSchoolDays.map((day) => {
                            const isSelected = draftDays.includes(day.key);
                            return (
                              <button
                                key={day.key}
                                type="button"
                                onClick={() =>
                                  handleToggleDraftDay(compositeKey, day.key)
                                }
                                className={`min-h-[44px] px-3 py-2 rounded-2xl font-semibold text-xs flex items-center justify-between gap-1.5 cursor-pointer transition-all active:scale-95 ${
                                  isSelected
                                    ? 'bg-[#ff3b30] text-white shadow-2xs'
                                    : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'
                                }`}
                              >
                                <span>{day.fullLabel}</span>
                                <span className="material-symbols-outlined text-[16px]">
                                  {isSelected
                                    ? 'check_circle'
                                    : 'radio_button_unchecked'}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                          <span
                            className={`text-xs font-semibold ${
                              draftValidation.isValid
                                ? 'text-[#1d8338]'
                                : draftDays.length > 0
                                ? 'text-[#ff9500]'
                                : 'text-[#86868b]'
                            }`}
                          >
                            {draftValidation.isValid
                              ? `✓ ${draftValidation.sortedKeys.length} dias selecionados (${draftValidation.maxConsecutive} seguidos: ${draftValidation.sortedKeys.join(', ')}) — Pronto para enviar à planilha!`
                              : draftDays.length > 0
                              ? `Selecione pelo menos 3 dias letivos seguidos (atual: ${draftValidation.maxConsecutive} seguido(s)).`
                              : 'Toque nos dias acima para selecionar uma sequência de 3 ou mais faltas seguidas.'}
                          </span>

                          <button
                            type="button"
                            disabled={!draftValidation.isValid}
                            onClick={() => handleRegisterNewOccurrence(cls, student)}
                            className="min-h-[42px] px-5 rounded-full bg-[#ff3b30] hover:bg-[#d70015] text-white font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-35 disabled:pointer-events-none shrink-0"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              cloud_upload
                            </span>
                            <span>
                              Registrar {occurrences.length + 1}ª Ocorrência na Planilha
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL DE LEITURA CALMA DA OCORRÊNCIA (ACESSÍVEL O ANO INTEIRO)        */}
      {/* ===================================================================== */}
      {activeModalData && (
        <div
          onClick={() => setReadingOccurrenceModal(null)}
          className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-5 bg-black/55 backdrop-blur-md animate-gentle-fade"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-xl rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.22)] overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Topo Minimalista do Modal */}
            <div className="p-5 sm:p-6 border-b border-black/[0.05] flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <StudentAvatar student={activeModalData.student} size="lg" />
                <div className="min-w-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-medium uppercase">
                    Turma {activeModalData.cls.name} • Nº{' '}
                    {activeModalData.student.number.toString().padStart(2, '0')}
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-[#1d1d1f] truncate mt-1">
                    {activeModalData.student.name}
                  </h2>
                  <p className="text-xs text-[#6e6e73]">
                    Histórico anual: {activeModalData.occurrences.length}{' '}
                    {activeModalData.occurrences.length === 1
                      ? 'sequência de faltas seguidas registrada'
                      : 'sequências de faltas seguidas registradas'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReadingOccurrenceModal(null)}
                aria-label="Fechar leitura da ocorrência"
                className="w-9 h-9 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Seletor entre as Inúmeras Sequências do Ano da Mesma Criança */}
            {activeModalData.occurrences.length > 1 && (
              <div className="px-5 sm:px-6 py-3 bg-[#f5f5f7] flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-xs font-bold text-[#6e6e73] shrink-0">
                  Sequências no ano:
                </span>
                {activeModalData.occurrences.map((occ) => {
                  const isCurrent = occ.id === activeModalData.activeOcc.id;
                  return (
                    <button
                      key={occ.id}
                      type="button"
                      onClick={() =>
                        setReadingOccurrenceModal({
                          cls: activeModalData.cls,
                          student: activeModalData.student,
                          occurrenceId: occ.id,
                        })
                      }
                      className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-[#1d1d1f] text-white'
                          : 'bg-white text-[#1d1d1f] hover:bg-[#e8e8ed]'
                      }`}
                    >
                      {occ.sequenceNumber}ª Ocorrência ({occ.selectedDates.length}d)
                    </button>
                  );
                })}
              </div>
            )}

            {/* Corpo de Leitura Calma e Detalhada */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              {/* Bloco 1: Dias Seguidos Faltosos */}
              <div className="p-4 rounded-2xl bg-[#fff5f5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-rose-700">
                    {activeModalData.activeOcc.sequenceNumber}ª Ocorrência do Ano Letivo
                  </span>
                  <span className="text-xs font-normal text-slate-500">
                    Aviso em: {activeModalData.activeOcc.reportedAt || 'Outubro/2027'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {activeModalData.activeOcc.selectedDates.length} dias letivos seguidos de ausência:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeModalData.activeOcc.selectedDates.map((d) => (
                    <span
                      key={d}
                      className="px-3 py-1 rounded-xl bg-[#ff3b30] text-white font-bold text-sm"
                    >
                      {d}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[#6e6e73] pt-1">
                  Sinalizado por:{' '}
                  <strong className="text-[#1d1d1f]">
                    {activeModalData.activeOcc.reportedByTeacher ||
                      activeModalData.cls.teacherName ||
                      'Docente PEB I'}
                  </strong>
                </p>
              </div>

              {/* Bloco 2: Leitura Calma do Feedback da Família / Devolutiva da Secretaria */}
              <div className="p-5 rounded-2xl bg-[#f5f5f7] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px]">
                      forum
                    </span>
                    <span>Devolutiva da Secretaria / Feedback da Família</span>
                  </span>
                  {activeModalData.activeOcc.feedbackUpdatedAt && (
                    <span className="text-xs font-semibold text-[#6e6e73]">
                      Atualizado em {activeModalData.activeOcc.feedbackUpdatedAt}
                    </span>
                  )}
                </div>

                {(activeModalData.activeOcc.familyFeedback || '').trim() ? (
                  <p className="text-base font-semibold text-[#1d1d1f] leading-relaxed pt-1">
                    “{activeModalData.activeOcc.familyFeedback}”
                  </p>
                ) : (
                  <p className="text-sm text-[#6e6e73] leading-relaxed pt-1">
                    Esta ocorrência já foi enviada para a aba{' '}
                    <span className="font-mono font-semibold text-[#1d1d1f]">
                      Busca_Ativa_Faltas_Consecutivas_2027
                    </span>{' '}
                    na planilha da secretaria e aguarda o registro do contato com a família.
                  </p>
                )}
              </div>

              {/* Dados de Contato da Família (Com Hyperlink Direto para WhatsApp) */}
              <div className="p-4 rounded-2xl bg-[#f5f5f7]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                {(() => {
                  const gInfo = resolveGuardianRelationshipInfo(
                    activeModalData.student.filiacao1 ||
                      activeModalData.student.guardianName,
                    'filiacao1',
                    activeModalData.student.notes
                  );
                  return (
                    <div>
                      <span className="text-[11px] font-bold uppercase text-[#6e6e73] block">
                        {gInfo.roleLabel} · Contato Familiar ({gInfo.gender})
                      </span>
                      <span className="font-bold text-[#1d1d1f]">
                        {gInfo.cleanName || 'Responsável Legal'}
                      </span>
                    </div>
                  );
                })()}
                {(activeModalData.student.telefones ||
                  activeModalData.student.guardianPhone) && (
                  <a
                    href={`https://wa.me/55${(
                      activeModalData.student.telefones ||
                      activeModalData.student.guardianPhone ||
                      ''
                    )
                      .split('/')[0]
                      .replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#28cd41]/15 text-[#1d8338] font-bold text-xs hover:bg-[#28cd41]/25"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      chat
                    </span>
                    <span>
                      {activeModalData.student.telefones ||
                        activeModalData.student.guardianPhone}
                    </span>
                  </a>
                )}
              </div>

              {/* Edição rápida caso seja Admin/Secretaria */}
              {canEditFamilyFeedback && (
                <div className="pt-2 space-y-2">
                  <label className="text-xs font-bold text-[#1d1d1f] block">
                    Registrar ou Atualizar Devolutiva da Família (Secretaria):
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUICK_FAMILY_FEEDBACK_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() =>
                          setFeedbackDrafts((prev) => ({
                            ...prev,
                            [`modal_${activeModalData.activeOcc.id}`]: chip,
                          }))
                        }
                        className="px-2.5 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#1d1d1f] text-[#1d1d1f] hover:text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={
                      feedbackDrafts[
                        `modal_${activeModalData.activeOcc.id}`
                      ] !== undefined
                        ? feedbackDrafts[`modal_${activeModalData.activeOcc.id}`]
                        : activeModalData.activeOcc.familyFeedback || ''
                    }
                    onChange={(e) =>
                      setFeedbackDrafts((prev) => ({
                        ...prev,
                        [`modal_${activeModalData.activeOcc.id}`]: e.target.value,
                      }))
                    }
                    placeholder="Descreva o retorno dado pela família no contato da secretaria..."
                    className="w-full p-3 rounded-2xl bg-[#f5f5f7] text-[#1d1d1f] text-sm focus:bg-white focus:outline-none resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const text =
                        feedbackDrafts[
                          `modal_${activeModalData.activeOcc.id}`
                        ] !== undefined
                          ? feedbackDrafts[`modal_${activeModalData.activeOcc.id}`]
                          : activeModalData.activeOcc.familyFeedback || '';
                      handleSaveOccurrenceFeedback(
                        activeModalData.cls,
                        activeModalData.student,
                        activeModalData.activeOcc.id,
                        text
                      );
                    }}
                    className="w-full min-h-[44px] rounded-2xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold text-sm cursor-pointer"
                  >
                    Salvar Devolutiva na Planilha &amp; Disparar Resumo Push
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#f5f5f7] flex justify-end">
              <button
                type="button"
                onClick={() => setReadingOccurrenceModal(null)}
                className="min-h-[40px] px-6 rounded-full bg-[#1d1d1f] text-white font-bold text-sm cursor-pointer"
              >
                Fechar Leitura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
