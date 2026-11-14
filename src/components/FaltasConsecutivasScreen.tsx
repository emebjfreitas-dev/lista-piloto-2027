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
 * Gera os últimos dias letivos (segunda a sexta-feira) em ordem cronológica
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
  const [showRecentStrip, setShowRecentStrip] = useState(true);

  // Modal direto de leitura (sem scroll excessivo)
  const [readingOccurrenceModal, setReadingOccurrenceModal] = useState<{
    cls: ClassGroup;
    student: Student;
    occurrenceId: string;
  } | null>(null);
  const [isEditingModalFeedback, setIsEditingModalFeedback] = useState(false);

  const canReportDays = userRole === 'usuario' || userRole === 'admin';
  const canEditFamilyFeedback = userRole === 'admin';

  const recentSchoolDays = useMemo(() => getRecentSchoolDays(new Date(), 12), []);

  const openOccurrencePopup = (
    cls: ClassGroup,
    student: Student,
    occurrenceId: string
  ) => {
    setIsEditingModalFeedback(false);
    setReadingOccurrenceModal({ cls, student, occurrenceId });
  };

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
    const list = scopedEntries.filter(({ cls, student, occurrences }) => {
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

    // Prioriza estudantes com ocorrências ativas no topo para evitar scroll longo
    if (filterMode === 'all' && !q) {
      return [...list].sort((a, b) => {
        const aHas = a.occurrences.length > 0 ? 1 : 0;
        const bHas = b.occurrences.length > 0 ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return 0;
      });
    }
    return list;
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

    setDraftSelectedDaysByStudent((prev) => ({
      ...prev,
      [compositeKey]: [],
    }));

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
          body: `Retorno da Secretaria: "${feedbackText.trim()}" — Toque para ler.`,
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
    <div className="flex flex-col w-full min-w-0 space-y-3 pb-20 animate-gentle-fade">
      {/* Cabeçalho Compacto Institucional */}
      <section className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3 min-w-0">
        {/* Linha 1: Breadcrumb + Título + Escopo */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 min-w-0">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 min-w-0">
              {onBack && (
                <>
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-[#0b3b8c] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                    <span>Voltar</span>
                  </button>
                  <span className="text-slate-300">/</span>
                </>
              )}
              <span className="font-bold text-[#be123c] uppercase tracking-wider">
                Busca Ativa · Regra 3+ Faltas Seguidas
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-bold text-slate-950 tracking-tight leading-snug break-words">
              Faltas Consecutivas &amp; Retorno da Família
            </h1>
          </div>

          {/* Seletor de Escopo Compacto */}
          {availableClasses.length > 1 && onSelectClass && (
            <div className="flex flex-wrap items-center gap-2 min-w-0 shrink-0">
              {userRole !== 'usuario' && (
                <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setViewAllClassesMode(true)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      viewAllClassesMode
                        ? 'bg-[#0b3b8c] text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    Todas ({availableClasses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewAllClassesMode(false)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      !viewAllClassesMode
                        ? 'bg-[#0b3b8c] text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    {classGroup.name}
                  </button>
                </div>
              )}

              {(!viewAllClassesMode || userRole === 'usuario') && (
                <select
                  value={classGroup.id}
                  onChange={(e) => {
                    const target = availableClasses.find((c) => c.id === e.target.value);
                    if (target) onSelectClass(target);
                  }}
                  className="min-w-0 h-9 px-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-950 text-xs font-bold cursor-pointer focus:outline-none focus:border-[#0052cc]"
                >
                  {availableClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} — {cls.shift.replace('Turno ', '')}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Linha 2: 4 KPIs Clicáveis Ultra-Compactos (Atalhos de Filtro) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setFilterMode('com_ocorrencia')}
            className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'com_ocorrencia'
                ? 'bg-[#be123c] border-[#be123c] text-white shadow-xs'
                : 'bg-rose-50/70 border-rose-200 text-rose-950 hover:bg-rose-100/70'
            }`}
          >
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide block truncate">
                Ocorrências
              </span>
              <span className="text-lg sm:text-xl font-bold tabular-nums leading-tight">
                {summaryStats.totalOccurrencesCount}
              </span>
            </div>
            <span className="material-symbols-outlined text-[20px] opacity-80 shrink-0">
              event_busy
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'all'
                ? 'bg-[#0b3b8c] border-[#0b3b8c] text-white shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide block truncate">
                Com Registro / Todos
              </span>
              <span className="text-lg sm:text-xl font-bold tabular-nums leading-tight">
                {summaryStats.studentsWithAnyOccurrence}{' '}
                <span className="text-xs font-medium opacity-75">/ {scopedEntries.length}</span>
              </span>
            </div>
            <span className="material-symbols-outlined text-[20px] opacity-80 shrink-0">
              groups
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('com_feedback')}
            className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'com_feedback'
                ? 'bg-[#047857] border-[#047857] text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-950 hover:bg-emerald-100/70'
            }`}
          >
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide block truncate">
                Com Retorno
              </span>
              <span className="text-lg sm:text-xl font-bold tabular-nums leading-tight">
                {summaryStats.totalWithFeedback}
              </span>
            </div>
            <span className="material-symbols-outlined text-[20px] opacity-80 shrink-0">
              mark_chat_read
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('aguardando_feedback')}
            className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'aguardando_feedback'
                ? 'bg-[#b45309] border-[#b45309] text-white shadow-xs'
                : 'bg-amber-50/70 border-amber-200 text-amber-950 hover:bg-amber-100/70'
            }`}
          >
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide block truncate">
                Aguardando
              </span>
              <span className="text-lg sm:text-xl font-bold tabular-nums leading-tight">
                {summaryStats.totalWaitingFeedback}
              </span>
            </div>
            <span className="material-symbols-outlined text-[20px] opacity-80 shrink-0">
              schedule
            </span>
          </button>
        </div>

        {/* Linha 3: Busca Rápida */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[19px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar estudante por nome, número ou turma..."
            className="w-full h-10 pl-10 pr-9 bg-slate-100 text-slate-950 text-sm rounded-xl focus:bg-slate-200/70 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950 cursor-pointer"
              aria-label="Limpar busca"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
            </button>
          )}
        </div>
      </section>

      {/* Faixa Horizontal Compacta de Retornos Recentes (Zero Scroll Vertical Longo) */}
      {summaryStats.recentFeedbacks.length > 0 && (
        <section className="bg-white border border-emerald-200 rounded-2xl p-3 sm:px-4 shadow-xs space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 text-[#047857] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[15px]">
                  notifications_active
                </span>
              </span>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                Retornos da Família ({summaryStats.recentFeedbacks.length}) — toque para abrir direto
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowRecentStrip((v) => !v)}
              className="text-xs font-bold text-[#0052cc] hover:underline shrink-0 cursor-pointer"
            >
              {showRecentStrip ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {showRecentStrip && (
            <div className="flex overflow-x-auto gap-2 pb-1 snap-x no-scrollbar">
              {summaryStats.recentFeedbacks.slice(0, 8).map(({ cls, student, occ }) => (
                <button
                  key={occ.id}
                  type="button"
                  onClick={() => openOccurrencePopup(cls, student, occ.id)}
                  className="snap-start shrink-0 w-[235px] sm:w-[260px] text-left p-2.5 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/80 border border-emerald-200 transition-colors cursor-pointer flex flex-col justify-between gap-1"
                >
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-[#047857] text-white text-[10px] font-bold uppercase truncate">
                      {occ.sequenceNumber}ª · {cls.name}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-600 shrink-0 tabular-nums">
                      {occ.selectedDates.length}d
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-950 truncate">
                    {student.name}
                  </p>
                  <p className="text-[11px] text-[#047857] font-semibold line-clamp-1">
                    “{occ.familyFeedback}”
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Lista Compacta de Estudantes */}
      <div className="space-y-2">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center space-y-1 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <p className="text-sm font-bold text-slate-950">
              Nenhum estudante encontrado neste filtro
            </p>
            <p className="text-xs font-medium text-slate-600">
              Selecione outro indicador acima para visualizar os demais estudantes.
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
                className={`rounded-xl border transition-all overflow-hidden ${
                  hasOccurrences
                    ? 'bg-white border-rose-300 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Linha Compacta do Estudante */}
                <div
                  onClick={() =>
                    setExpandedStudentKey(isExpanded ? null : compositeKey)
                  }
                  className={`p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none ${
                    hasOccurrences ? 'bg-rose-50/40' : ''
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 tabular-nums mt-0.5 sm:mt-0 ${
                        hasOccurrences
                          ? 'bg-[#be123c] text-white'
                          : 'bg-slate-100 border border-slate-200 text-slate-800'
                      }`}
                    >
                      {student.number.toString().padStart(2, '0')}
                    </span>

                    <StudentAvatar student={student} size="sm" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                        <h3 className="font-bold text-sm sm:text-[15px] text-slate-950 break-words leading-snug">
                          {student.name}
                        </h3>
                        {viewAllClassesMode && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700">
                            {cls.name}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-600 tabular-nums">
                          · {accumulatedMonthAbsences} falta(s) no mês
                        </span>
                      </div>

                      {/* Botões Diretos de Pop-up para cada Ocorrência */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 min-w-0">
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
                                openOccurrencePopup(cls, student, occ.id);
                              }}
                              className={`min-h-[30px] max-w-full inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold text-left transition-all cursor-pointer active:scale-95 ${
                                hasFeedback
                                  ? 'bg-emerald-50 border-emerald-300 text-[#047857] hover:bg-emerald-100'
                                  : 'bg-rose-50 border-rose-300 text-[#be123c] hover:bg-rose-100'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[14px] shrink-0">
                                {hasFeedback ? 'mark_chat_read' : 'event_busy'}
                              </span>
                              <span className="truncate">
                                {occ.sequenceNumber}ª ({occ.selectedDates.length}d:{' '}
                                {occ.selectedDates.join(', ')})
                              </span>
                              <span className="underline ml-0.5 shrink-0">
                                {hasFeedback ? 'Ver retorno' : 'Abrir'}
                              </span>
                            </button>
                          );
                        })}

                        {!hasOccurrences && (
                          <span className="text-xs text-slate-500 font-medium">
                            {canReportDays
                              ? 'Toque para marcar 3+ dias seguidos de falta'
                              : 'Sem faltas consecutivas no ano'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Botão Expandir / Registrar */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <span
                      className={`min-h-[34px] py-1 px-3 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 ${
                        isExpanded
                          ? 'bg-[#0b3b8c] border-[#0b3b8c] text-white'
                          : 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      <span>{isExpanded ? 'Fechar' : canReportDays ? 'Registrar / Histórico' : 'Histórico'}</span>
                      <span
                        className={`material-symbols-outlined text-[17px] shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        expand_more
                      </span>
                    </span>
                  </div>
                </div>

                {/* Painel Expansível Fluido */}
                {isExpanded && (
                  <div className="px-3 sm:px-5 pb-4 pt-3 bg-slate-50 border-t border-slate-200 space-y-3 animate-gentle-fade">
                    {occurrences.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-700 block">
                          Histórico no ano ({occurrences.length}{' '}
                          {occurrences.length === 1 ? 'registro' : 'registros'})
                        </span>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {occurrences.map((occ) => {
                            const hasFeedback = Boolean(
                              (occ.familyFeedback || '').trim()
                            );
                            const draftKey = `${compositeKey}_${occ.id}`;

                            return (
                              <div
                                key={occ.id}
                                className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs min-w-0"
                              >
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                  <div className="min-w-0 flex-1 break-words">
                                    <span className="text-xs font-bold text-[#be123c] block">
                                      {occ.sequenceNumber}ª ocorrência · {occ.selectedDates.length} dias
                                    </span>
                                    <p className="text-xs sm:text-sm font-bold text-slate-950 mt-0.5 tabular-nums break-words">
                                      {occ.selectedDates.join(' · ')}
                                    </p>
                                    <p className="text-[11px] text-slate-600 mt-0.5 break-words">
                                      {occ.reportedAt || '2027'} · {occ.reportedByTeacher || cls.teacherName || 'PEB I'}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openOccurrencePopup(cls, student, occ.id)}
                                      className="h-8 px-2.5 rounded-lg bg-[#0052cc] hover:bg-[#0b3b8c] text-white text-xs font-bold cursor-pointer"
                                    >
                                      Pop-up
                                    </button>
                                    {canReportDays && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveOccurrence(cls, student, occ.id)
                                        }
                                        title="Excluir este registro"
                                        aria-label="Excluir este registro"
                                        className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-[#be123c] flex items-center justify-center cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-[17px]">
                                          delete
                                        </span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {hasFeedback ? (
                                  <div
                                    onClick={() => openOccurrencePopup(cls, student, occ.id)}
                                    className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 cursor-pointer hover:bg-emerald-100/70 transition-colors min-w-0 break-words"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold uppercase text-[#047857]">
                                      <span>Retorno da Família</span>
                                      <span>{occ.feedbackUpdatedAt}</span>
                                    </div>
                                    <p className="text-xs sm:text-sm font-bold leading-snug mt-0.5 break-words">
                                      “{occ.familyFeedback}”
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs font-semibold flex items-center justify-between gap-2">
                                    <span className="truncate">
                                      Aguardando contato da secretaria
                                    </span>
                                    <span className="material-symbols-outlined text-[16px] text-[#b45309] shrink-0">
                                      schedule
                                    </span>
                                  </div>
                                )}

                                {canEditFamilyFeedback && (
                                  <div className="pt-1 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {QUICK_FAMILY_FEEDBACK_CHIPS.slice(0, 3).map((chip) => (
                                        <button
                                          key={chip}
                                          type="button"
                                          onClick={() =>
                                            setFeedbackDrafts((prev) => ({
                                              ...prev,
                                              [draftKey]: chip,
                                            }))
                                          }
                                          className="px-2 py-1 rounded-md bg-slate-100 hover:bg-[#0b3b8c] border border-slate-200 text-slate-800 hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
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
                                        placeholder="Devolutiva da família..."
                                        className="flex-1 h-9 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-950 text-xs focus:bg-white focus:border-[#0052cc] focus:outline-none"
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
                                        className="h-9 px-3 rounded-lg bg-[#0052cc] hover:bg-[#0b3b8c] text-white font-bold text-xs cursor-pointer shrink-0"
                                      >
                                        Salvar &amp; Push
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

                    {/* Registrar Nova Sequência */}
                    {canReportDays && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                          <div className="min-w-0 break-words flex-1">
                            <span className="text-xs sm:text-sm font-bold text-slate-950 block">
                              Registrar {occurrences.length + 1}ª Ocorrência (mín. 3 dias seguidos):
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleSelectLastThreeDaysShortcut(compositeKey)
                              }
                              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 text-xs font-bold cursor-pointer"
                            >
                              Últimos 3 dias
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
                                className="text-xs font-bold text-slate-600 hover:text-[#be123c] cursor-pointer"
                              >
                                Limpar
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
                          {recentSchoolDays.map((day) => {
                            const isSelected = draftDays.includes(day.key);
                            return (
                              <button
                                key={day.key}
                                type="button"
                                onClick={() =>
                                  handleToggleDraftDay(compositeKey, day.key)
                                }
                                className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-between gap-1 cursor-pointer transition-all active:scale-95 ${
                                  isSelected
                                    ? 'bg-[#be123c] text-white shadow-2xs'
                                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                                }`}
                              >
                                <span>{day.fullLabel}</span>
                                <span className="material-symbols-outlined text-[15px]">
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
                            className={`text-xs font-bold ${
                              draftValidation.isValid
                                ? 'text-[#047857]'
                                : draftDays.length > 0
                                ? 'text-[#b45309]'
                                : 'text-slate-600'
                            }`}
                          >
                            {draftValidation.isValid
                              ? `✓ ${draftValidation.sortedKeys.length} dias (${draftValidation.maxConsecutive} seguidos) — Pronto para registrar`
                              : draftDays.length > 0
                              ? `Selecione pelo menos 3 dias seguidos (atual: ${draftValidation.maxConsecutive}).`
                              : 'Toque nos dias letivos acima.'}
                          </span>

                          <button
                            type="button"
                            disabled={!draftValidation.isValid}
                            onClick={() => handleRegisterNewOccurrence(cls, student)}
                            className="w-full sm:w-auto min-h-[40px] py-2 px-4 rounded-xl bg-[#be123c] hover:bg-[#9f1239] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0"
                          >
                            <span className="material-symbols-outlined text-[18px] shrink-0">
                              cloud_upload
                            </span>
                            <span>
                              Registrar {occurrences.length + 1}ª Ocorrência
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
      {/* POP-UP DIRETO SEM SCROLL (OCUPAÇÃO COMPACTA E ALTA LEITURA)           */}
      {/* ===================================================================== */}
      {activeModalData && (
        <div
          onClick={() => setReadingOccurrenceModal(null)}
          className="fixed inset-0 z-[85] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-gentle-fade"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-300 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[84dvh] min-w-0"
          >
            {/* Topo Institucional Compacto */}
            <div className="px-4 py-3 bg-[#0b3b8c] text-white flex items-center justify-between gap-2.5 min-w-0 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <StudentAvatar student={activeModalData.student} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-blue-100 font-mono tabular-nums">
                    <span>
                      {activeModalData.cls.name} · Nº{' '}
                      {activeModalData.student.number.toString().padStart(2, '0')}
                    </span>
                    <span>·</span>
                    <span>
                      {activeModalData.occurrences.length}{' '}
                      {activeModalData.occurrences.length === 1
                        ? 'ocorrência'
                        : 'ocorrências'}
                    </span>
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-white truncate leading-snug">
                    {activeModalData.student.name}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReadingOccurrenceModal(null)}
                aria-label="Fechar pop-up"
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <span className="material-symbols-outlined text-[19px]">close</span>
              </button>
            </div>

            {/* Seletor Inline entre Sequências (se houver mais de 1) */}
            {activeModalData.occurrences.length > 1 && (
              <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                <span className="text-[11px] font-bold text-slate-600 shrink-0 mr-1">
                  Sequências:
                </span>
                {activeModalData.occurrences.map((occ) => {
                  const isCurrent = occ.id === activeModalData.activeOcc.id;
                  return (
                    <button
                      key={occ.id}
                      type="button"
                      onClick={() => {
                        setIsEditingModalFeedback(false);
                        setReadingOccurrenceModal({
                          cls: activeModalData.cls,
                          student: activeModalData.student,
                          occurrenceId: occ.id,
                        });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 border ${
                        isCurrent
                          ? 'bg-[#0b3b8c] border-[#0b3b8c] text-white'
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {occ.sequenceNumber}ª ({occ.selectedDates.length}d)
                    </button>
                  );
                })}
              </div>
            )}

            {/* Corpo Direto Sem Scroll */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-2.5 min-w-0">
              {/* Bloco 1: Dias Seguidos Faltosos */}
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                  <span className="font-bold uppercase tracking-wider text-[#be123c]">
                    {activeModalData.activeOcc.sequenceNumber}ª Ocorrência ·{' '}
                    {activeModalData.activeOcc.selectedDates.length} dias seguidos
                  </span>
                  <span className="font-semibold text-slate-600">
                    {activeModalData.activeOcc.reportedAt || '2027'} ·{' '}
                    {activeModalData.activeOcc.reportedByTeacher ||
                      activeModalData.cls.teacherName ||
                      'PEB I'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeModalData.activeOcc.selectedDates.map((d) => (
                    <span
                      key={d}
                      className="px-2.5 py-0.5 rounded-lg bg-[#be123c] text-white font-bold text-xs tabular-nums"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bloco 2: Devolutiva da Secretaria / Feedback da Família */}
              <div
                className={`p-3 rounded-xl border space-y-1 min-w-0 ${
                  (activeModalData.activeOcc.familyFeedback || '').trim()
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                      (activeModalData.activeOcc.familyFeedback || '').trim()
                        ? 'text-[#047857]'
                        : 'text-[#b45309]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] shrink-0">
                      forum
                    </span>
                    <span>Devolutiva da Família / Secretaria</span>
                  </span>
                  {activeModalData.activeOcc.feedbackUpdatedAt && (
                    <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                      {activeModalData.activeOcc.feedbackUpdatedAt}
                    </span>
                  )}
                </div>

                {(activeModalData.activeOcc.familyFeedback || '').trim() ? (
                  <p className="text-sm sm:text-base font-bold text-slate-950 leading-snug break-words">
                    “{activeModalData.activeOcc.familyFeedback}”
                  </p>
                ) : (
                  <p className="text-xs sm:text-sm font-medium text-amber-950 leading-snug break-words">
                    Ocorrência registrada na planilha da secretaria · Aguardando contato com a família.
                  </p>
                )}
              </div>

              {/* Bloco 3: Responsável & WhatsApp Compacto */}
              <div className="p-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 min-w-0">
                {(() => {
                  const gInfo = resolveGuardianRelationshipInfo(
                    activeModalData.student.filiacao1 ||
                      activeModalData.student.guardianName,
                    'filiacao1',
                    activeModalData.student.notes
                  );
                  return (
                    <div className="min-w-0 flex-1 break-words">
                      <span className="text-[10px] font-bold uppercase text-slate-600 block">
                        {gInfo.roleLabel}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-950 break-words">
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
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#047857] hover:bg-[#065f46] text-white font-bold text-xs shrink-0 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px] shrink-0">
                      chat
                    </span>
                    <span className="tabular-nums">
                      {activeModalData.student.telefones ||
                        activeModalData.student.guardianPhone}
                    </span>
                  </a>
                )}
              </div>

              {/* Edição Sob Demanda para Admin (mantém pop-up compacto até tocar em Editar) */}
              {canEditFamilyFeedback && isEditingModalFeedback && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-300 space-y-2 animate-gentle-fade">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Atualizar Devolutiva da Secretaria:
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingModalFeedback(false)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-950 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
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
                        className="px-2 py-1 rounded-md bg-white hover:bg-[#0b3b8c] border border-slate-300 text-slate-800 hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
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
                    placeholder="Retorno dado pela família..."
                    className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-slate-950 text-xs sm:text-sm focus:border-[#0052cc] focus:outline-none resize-none"
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
                      setIsEditingModalFeedback(false);
                    }}
                    className="w-full min-h-[38px] rounded-xl bg-[#0052cc] hover:bg-[#0b3b8c] text-white font-bold text-xs sm:text-sm cursor-pointer"
                  >
                    Salvar Devolutiva &amp; Enviar Push
                  </button>
                </div>
              )}
            </div>

            {/* Rodapé Compacto */}
            <div className="px-4 py-2.5 bg-slate-100 flex items-center justify-between gap-2 shrink-0">
              {canEditFamilyFeedback && !isEditingModalFeedback ? (
                <button
                  type="button"
                  onClick={() => setIsEditingModalFeedback(true)}
                  className="min-h-[38px] px-3.5 rounded-xl bg-white hover:bg-blue-50 text-[#0b3b8c] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">edit_note</span>
                  <span>
                    {(activeModalData.activeOcc.familyFeedback || '').trim()
                      ? 'Editar Devolutiva'
                      : 'Registrar Devolutiva'}
                  </span>
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-slate-500">
                  Leitura rápida · Busca Ativa
                </span>
              )}

              <button
                type="button"
                onClick={() => setReadingOccurrenceModal(null)}
                className="min-h-[38px] px-5 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-bold text-xs sm:text-sm cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
