import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ActiveSearchOutcomeStatus,
  AuthorizedUser,
  ClassGroup,
  ConsecutiveAbsenceOccurrence,
  ContactAttemptChannel,
  Student,
  UserRole,
} from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  getStudentCumulativeOccurrences,
  triggerPushNotification,
} from '../services/pushNotificationService';
import { resolveGuardianRelationshipInfo } from '../utils/genderDictionary';
import { SCHOOL_NAME } from '../data/mockData';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ModalPortal } from './ui/ModalPortal';
import { PaginationBar } from './ui/PaginationBar';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Edit3,
  MessageCircle,
  Phone,
  Search,
  Send,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { FamiliasMultiplosAlunosModal } from './FamiliasMultiplosAlunosView';
import { groupSchoolFamiliesByGuardians } from '../utils/siblingDetection';

interface FaltasConsecutivasScreenProps {
  classGroup: ClassGroup;
  availableClasses?: ClassGroup[];
  userRole?: UserRole;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  userName?: string;
  userEmail?: string;
  onSelectClass?: (cls: ClassGroup) => void;
  onOpenStudentGrid?: (student: Student, classGroup?: ClassGroup) => void;
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

const CONTACT_CHANNEL_OPTIONS: Array<{
  id: ContactAttemptChannel;
  label: string;
}> = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'ligacao', label: 'Ligação' },
  { id: 'presencial', label: 'Presencial' },
  { id: 'recado_agenda', label: 'Recado / E-mail' },
  { id: 'nao_atendeu', label: 'Sem resposta' },
];

const OUTCOME_STATUS_OPTIONS: Array<{
  id: ActiveSearchOutcomeStatus;
  label: string;
  toneClass: string;
}> = [
  {
    id: 'contato_realizado',
    label: 'Retorno obtido',
    toneClass: 'text-emerald-950 bg-emerald-100/85 hover:bg-emerald-200/80',
  },
  {
    id: 'justificado_atestado',
    label: 'Atestado / Saúde',
    toneClass: 'text-sky-950 bg-sky-100/85 hover:bg-sky-200/80',
  },
  {
    id: 'em_tentativa',
    label: 'Em tentativa',
    toneClass: 'text-amber-950 bg-amber-100/85 hover:bg-amber-200/80',
  },
  {
    id: 'encaminhado_busca',
    label: 'Busca / Conselho',
    toneClass: 'text-rose-950 bg-rose-100/85 hover:bg-rose-200/80',
  },
];

const QUICK_FAMILY_FEEDBACK_CHIPS = [
  'Responsável ciente · Retorno às aulas previsto para amanhã',
  'Criança com quadro febril / virose · Família enviará atestado',
  'Consulta médica / odontológica informada pela família',
  'Viagem familiar comunicada previamente',
  'Tentativa de contato sem sucesso (caixa postal / sem retorno)',
  'Encaminhado para acompanhamento presencial da equipe gestora',
];

function getChannelLabel(channel?: ContactAttemptChannel): string {
  const found = CONTACT_CHANNEL_OPTIONS.find((c) => c.id === channel);
  return found ? found.label : 'Contato escolar';
}

function getOutcomeMeta(
  occ: ConsecutiveAbsenceOccurrence
): {
  status: ActiveSearchOutcomeStatus;
  label: string;
  toneClass: string;
} {
  const hasFeedback = Boolean((occ.familyFeedback || '').trim());
  const status: ActiveSearchOutcomeStatus =
    occ.contactStatus || (hasFeedback ? 'contato_realizado' : 'aguardando_contato');

  if (status === 'aguardando_contato') {
    return {
      status,
      label: 'Aguardando contato da secretaria',
      toneClass: 'text-amber-950 bg-amber-100/85 hover:bg-amber-200/80',
    };
  }
  const found = OUTCOME_STATUS_OPTIONS.find((o) => o.id === status);
  if (found) {
    return {
      status: found.id,
      label: found.label,
      toneClass: found.toneClass,
    };
  }
  return {
    status: 'contato_realizado',
    label: 'Retorno registrado',
    toneClass: 'text-emerald-950 bg-emerald-100/85 hover:bg-emerald-200/80',
  };
}

interface AdminFeedbackDraft {
  channel: ContactAttemptChannel;
  status: ActiveSearchOutcomeStatus;
  text: string;
}

export const FaltasConsecutivasScreen: React.FC<FaltasConsecutivasScreenProps> = ({
  classGroup,
  availableClasses = [],
  userRole = 'usuario',
  teacherRoleType,
  userName,
  onSelectClass,
  onOpenStudentGrid,
  onUpdateStudent,
  onBack,
}) => {
  // Regras estritas de responsabilidade:
  // - APENAS PEB I (userRole === 'usuario') informa 3+ faltas seguidas e pede para secretaria contatar
  // - APENAS Equipe Administrativa (isStrictAdmin) contata famílias e preenche feedbacks
  // - Demais perfis (PEB II, Apoio, AEE) apenas acompanham visualmente solicitações e devolutivas
  const isPeb1 = userRole === 'usuario';
  const isStrictAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';
  const canRequestSecretariaContact = isPeb1;
  const canManageFamilyFeedback = isStrictAdmin;
  const isReadOnlyViewer = !canRequestSecretariaContact && !canManageFamilyFeedback;

  const recentSchoolDays = useMemo(() => getRecentSchoolDays(new Date(), 12), []);

  const [viewAllClassesMode, setViewAllClassesMode] = useState(
    !isPeb1 && availableClasses.length > 1
  );
  const [selectedClassFilterId, setSelectedClassFilterId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStudentKey, setExpandedStudentKey] = useState<string | null>(null);
  const [isFamiliesModalOpen, setIsFamiliesModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllUnreadFeedbacks, setShowAllUnreadFeedbacks] = useState(false);
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const PAGE_SIZE = 15;

  const familyScopeClasses = useMemo(
    () => (availableClasses.length > 0 ? availableClasses : [classGroup]),
    [availableClasses, classGroup]
  );

  const multiStudentFamiliesCount = useMemo(
    () => groupSchoolFamiliesByGuardians(familyScopeClasses).length,
    [familyScopeClasses]
  );

  // Estado para solicitações da PEB I
  const [draftSelectedDaysByStudent, setDraftSelectedDaysByStudent] = useState<
    Record<string, string[]>
  >({});
  const [teacherObsDrafts, setTeacherObsDrafts] = useState<Record<string, string>>({});

  // Estado estruturado de atendimento / feedback do Admin
  const [adminFeedbackDrafts, setAdminFeedbackDrafts] = useState<
    Record<string, AdminFeedbackDraft>
  >({});
  const [editingFeedbackIds, setEditingFeedbackIds] = useState<Record<string, boolean>>({});

  // Modal de leitura / atendimento rápido
  const [readingOccurrenceModal, setReadingOccurrenceModal] = useState<{
    cls: ClassGroup;
    student: Student;
    occurrenceId: string;
  } | null>(null);
  const [isEditingModalFeedback, setIsEditingModalFeedback] = useState(false);

  // Lista unificada no escopo do perfil
  const scopedEntries = useMemo(() => {
    const sourceClasses =
      !isPeb1 && viewAllClassesMode && availableClasses.length > 0
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
  }, [isPeb1, viewAllClassesMode, availableClasses, classGroup]);

  // Indicadores reais do escopo atual
  const summaryStats = useMemo(() => {
    let totalOccurrencesCount = 0;
    let totalWithFeedback = 0;
    let totalWaitingFeedback = 0;
    let totalInAttempt = 0;
    let studentsWithAnyOccurrence = 0;

    const unreadFeedbacksForTeacher: Array<{
      cls: ClassGroup;
      student: Student;
      occ: ConsecutiveAbsenceOccurrence;
    }> = [];

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
        const hasFb = (occ.familyFeedback || '').trim().length > 0;
        if (hasFb) {
          totalWithFeedback += 1;
          recentFeedbacks.push({ cls, student, occ });
          if (occ.contactStatus === 'em_tentativa') {
            totalInAttempt += 1;
          }
          if (!occ.feedbackReadByTeacher) {
            unreadFeedbacksForTeacher.push({ cls, student, occ });
          }
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
      totalInAttempt,
      unreadFeedbacksForTeacher,
      recentFeedbacks,
    };
  }, [scopedEntries]);

  // Filtro inicial inteligente por perfil:
  // - Admin: abre direto na fila pendente ("Aguardando contato") se houver pendências, senão "Com Solicitações"
  // - Demais perfis (PEB II / AEE / Apoio): abre em "Com Solicitações" para foco imediato
  // - PEB I: abre em "Todos da Turma" (com pedidos ativos priorizados no topo) para informar facilmente
  const [filterMode, setFilterMode] = useState<
    'all' | 'com_ocorrencia' | 'com_feedback' | 'aguardando_feedback'
  >(() => {
    if (isStrictAdmin) {
      return summaryStats.totalWaitingFeedback > 0 ? 'aguardando_feedback' : 'com_ocorrencia';
    }
    if (isReadOnlyViewer) {
      return 'com_ocorrencia';
    }
    return 'all';
  });

  useEffect(() => {
    setExpandedStudentKey(null);
    setViewAllClassesMode(!isPeb1 && availableClasses.length > 1);
    if (isStrictAdmin) {
      setFilterMode(
        summaryStats.totalWaitingFeedback > 0 ? 'aguardando_feedback' : 'com_ocorrencia'
      );
    } else if (isReadOnlyViewer) {
      setFilterMode('com_ocorrencia');
    } else {
      setFilterMode('all');
    }
  }, [userRole, teacherRoleType, isPeb1, isStrictAdmin, isReadOnlyViewer]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = scopedEntries.filter(({ cls, student, occurrences }) => {
      if (!isPeb1 && viewAllClassesMode && selectedClassFilterId !== 'all' && cls.id !== selectedClassFilterId) {
        return false;
      }
      if (filterMode === 'com_ocorrencia' && occurrences.length === 0) return false;
      if (
        filterMode === 'com_feedback' &&
        !occurrences.some((o) => (o.familyFeedback || '').trim().length > 0)
      ) {
        return false;
      }
      if (
        filterMode === 'aguardando_feedback' &&
        !occurrences.some(
          (o) =>
            !(o.familyFeedback || '').trim() || o.contactStatus === 'em_tentativa'
        )
      ) {
        return false;
      }
      if (!q) return true;
      return (
        student.name.toLowerCase().includes(q) ||
        cls.name.toLowerCase().includes(q) ||
        (cls.teacherName && cls.teacherName.toLowerCase().includes(q)) ||
        (student.ra && student.ra.toLowerCase().includes(q)) ||
        student.number.toString() === q ||
        student.number.toString().padStart(2, '0') === q
      );
    });

    // Prioriza estudantes aguardando retorno primeiro, depois com retorno, depois sem ocorrências
    return [...list].sort((a, b) => {
      const aPending = a.occurrences.some((o) => !(o.familyFeedback || '').trim()) ? 2 : a.occurrences.length > 0 ? 1 : 0;
      const bPending = b.occurrences.some((o) => !(o.familyFeedback || '').trim()) ? 2 : b.occurrences.length > 0 ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      return 0;
    });
  }, [scopedEntries, searchQuery, filterMode, isPeb1, viewAllClassesMode, selectedClassFilterId]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedStudentKey(null);
  }, [filterMode, searchQuery, viewAllClassesMode, selectedClassFilterId, classGroup.id]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEntries = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, safePage]);

  const handlePageChange = (nextPage: number) => {
    setCurrentPage(nextPage);
    setExpandedStudentKey(null);
    if (listSectionRef.current) {
      listSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getOrInitAdminDraft = (occ: ConsecutiveAbsenceOccurrence): AdminFeedbackDraft => {
    const existing = adminFeedbackDrafts[occ.id];
    if (existing) return existing;
    return {
      channel: occ.contactChannel || 'whatsapp',
      status:
        occ.contactStatus && occ.contactStatus !== 'aguardando_contato'
          ? occ.contactStatus
          : 'contato_realizado',
      text: occ.familyFeedback || '',
    };
  };

  const updateAdminDraft = (
    occ: ConsecutiveAbsenceOccurrence,
    patch: Partial<AdminFeedbackDraft>
  ) => {
    setAdminFeedbackDrafts((prev) => {
      const current = prev[occ.id] || {
        channel: occ.contactChannel || 'whatsapp',
        status:
          occ.contactStatus && occ.contactStatus !== 'aguardando_contato'
            ? occ.contactStatus
            : 'contato_realizado',
        text: occ.familyFeedback || '',
      };
      return {
        ...prev,
        [occ.id]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  // --- AÇÕES EXCLUSIVAS PEB I ---
  const handleToggleDraftDay = (compositeKey: string, dayKey: string, isAlreadyReported: boolean) => {
    if (!canRequestSecretariaContact || isAlreadyReported) return;
    setDraftSelectedDaysByStudent((prev) => {
      const current = prev[compositeKey] || [];
      const exists = current.includes(dayKey);
      const next = exists ? current.filter((d) => d !== dayKey) : [...current, dayKey];
      return {
        ...prev,
        [compositeKey]: next,
      };
    });
  };

  const handleSelectLastThreeDaysShortcut = (compositeKey: string) => {
    if (!canRequestSecretariaContact) return;
    const lastThree = recentSchoolDays.slice(-3).map((d) => d.key);
    setDraftSelectedDaysByStudent((prev) => ({
      ...prev,
      [compositeKey]: lastThree,
    }));
  };

  const handleRequestSecretariaContact = (cls: ClassGroup, student: Student) => {
    if (!canRequestSecretariaContact) return;
    const compositeKey = `${cls.id}_${student.id}`;
    const selectedRaw = draftSelectedDaysByStudent[compositeKey] || [];
    const validation = hasThreeOrMoreConsecutiveSchoolDays(selectedRaw, recentSchoolDays);
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

    const obsText = (teacherObsDrafts[compositeKey] || '').trim();

    const newOccurrence: ConsecutiveAbsenceOccurrence = {
      id: `${student.id}_occ_${nextSequenceNumber}_${Date.now()}`,
      sequenceNumber: nextSequenceNumber,
      selectedDates: validation.sortedKeys,
      reportedAt: nowStr,
      reportedByTeacher: userName || cls.teacherName || 'Regente PEB I',
      teacherObservation: obsText || undefined,
      familyFeedback: '',
      feedbackUpdatedAt: '',
      contactStatus: 'aguardando_contato',
      feedbackReadByTeacher: false,
    };

    const updatedOccurrences = [...existingOccurrences, newOccurrence];

    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: newOccurrence.selectedDates,
        reportedAt: newOccurrence.reportedAt,
        reportedByTeacher: newOccurrence.reportedByTeacher,
        familyFeedback: '',
        feedbackUpdatedAt: '',
        active: true,
        occurrences: updatedOccurrences,
      },
    };

    onUpdateStudent(cls.id, updatedStudent);

    setDraftSelectedDaysByStudent((prev) => ({
      ...prev,
      [compositeKey]: [],
    }));
    setTeacherObsDrafts((prev) => ({
      ...prev,
      [compositeKey]: '',
    }));

    toast.success(`Solicitação enviada à secretaria para ${student.name.split(' ')[0]}!`);
  };

  const handleRemoveOccurrence = (
    cls: ClassGroup,
    student: Student,
    occurrenceId: string
  ) => {
    if (!canRequestSecretariaContact) return;
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
    toast.success('Solicitação removida.');
    if (readingOccurrenceModal?.occurrenceId === occurrenceId) {
      setReadingOccurrenceModal(null);
    }
  };

  const handleMarkFeedbackAsReadByTeacher = (
    cls: ClassGroup,
    student: Student,
    occurrenceId: string
  ) => {
    if (!canRequestSecretariaContact) return;
    const existingOccurrences = getStudentCumulativeOccurrences(student);
    const readAtStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const updatedOccurrences = existingOccurrences.map((occ) =>
      occ.id === occurrenceId
        ? {
            ...occ,
            feedbackReadByTeacher: true,
            feedbackReadAt: readAtStr,
          }
        : occ
    );

    const latest = updatedOccurrences[updatedOccurrences.length - 1];
    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: latest?.selectedDates || [],
        reportedAt: latest?.reportedAt || '',
        reportedByTeacher: latest?.reportedByTeacher || cls.teacherName || 'PEB I',
        familyFeedback: latest?.familyFeedback || '',
        feedbackUpdatedAt: latest?.feedbackUpdatedAt || '',
        active: updatedOccurrences.length > 0,
        occurrences: updatedOccurrences,
      },
    };

    onUpdateStudent(cls.id, updatedStudent);
    toast.success('Ciência registrada no retorno da secretaria.');
  };

  // --- AÇÕES EXCLUSIVAS ADMIN / SECRETARIA ---
  const handleSaveAdminFeedback = (
    cls: ClassGroup,
    student: Student,
    occurrenceId: string,
    draft: AdminFeedbackDraft
  ) => {
    if (!canManageFamilyFeedback) return;
    const cleanText = draft.text.trim();
    if (!cleanText) {
      toast.error('Escreva ou selecione o parecer do contato com a família antes de salvar.');
      return;
    }

    const existingOccurrences = getStudentCumulativeOccurrences(student);
    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const authorLabel =
      userName && !userName.toLowerCase().includes('emeb')
        ? userName
        : 'Secretaria / Gestão';

    const updatedOccurrences = existingOccurrences.map((occ) =>
      occ.id === occurrenceId
        ? {
            ...occ,
            familyFeedback: cleanText,
            feedbackUpdatedAt: nowStr,
            feedbackByName: authorLabel,
            contactChannel: draft.channel,
            contactStatus: draft.status,
            feedbackReadByTeacher: false,
            feedbackReadAt: undefined,
          }
        : occ
    );

    const latest = updatedOccurrences[updatedOccurrences.length - 1];
    const targetOcc = updatedOccurrences.find((o) => o.id === occurrenceId) || latest;

    const updatedStudent: Student = {
      ...student,
      consecutiveAbsenceAlert: {
        selectedDates: latest?.selectedDates || [],
        reportedAt: latest?.reportedAt || nowStr,
        reportedByTeacher: latest?.reportedByTeacher || cls.teacherName || 'PEB I',
        familyFeedback: latest?.familyFeedback || cleanText,
        feedbackUpdatedAt: latest?.feedbackUpdatedAt || nowStr,
        active: updatedOccurrences.length > 0,
        occurrences: updatedOccurrences,
      },
    };

    onUpdateStudent(cls.id, updatedStudent);
    setEditingFeedbackIds((prev) => ({ ...prev, [occurrenceId]: false }));

    toast.success(`Feedback registrado para ${student.name.split(' ')[0]}!`);

    triggerPushNotification(
      {
        title: `Retorno da Secretaria • ${student.name.split(' ')[0]} (${
          targetOcc?.sequenceNumber || 1
        }ª)`,
        body: `[${getChannelLabel(draft.channel)}] ${cleanText}`,
        category: 'busca_ativa',
        targetClassId: cls.id,
        targetScreen: 'faltas_consecutivas',
        authorName: authorLabel,
      },
      { saveToFeed: true, showBanner: true }
    );
  };

  const openOccurrencePopup = (
    cls: ClassGroup,
    student: Student,
    occurrenceId: string
  ) => {
    setIsEditingModalFeedback(false);
    setReadingOccurrenceModal({ cls, student, occurrenceId });
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

  useModalScrollLock(Boolean(activeModalData));

  const buildStudentContactData = (
    cls: ClassGroup,
    student: Student,
    datesList: string[]
  ) => {
    const guardian1 = resolveGuardianRelationshipInfo(
      student.filiacao1 || student.guardianName,
      'filiacao1',
      student.notes
    );
    const guardian2 = resolveGuardianRelationshipInfo(
      student.filiacao2,
      'filiacao2',
      student.notes
    );
    const rawPhones = student.telefones || student.guardianPhone || '';
    const datesText = datesList.length > 0 ? ` nos dias ${datesList.join(', ')}` : '';
    const message = `Olá! Somos da equipe da ${SCHOOL_NAME}. Notamos faltas seguidas de ${student.name} (${cls.name})${datesText} e gostaríamos de saber se está tudo bem com a criança e a família.`;
    const waLinks = buildWhatsAppLinksFromPhoneString(rawPhones, student.name, message);
    const cleanTelDigits = (rawPhones.split('/')[0] || '').replace(/\D/g, '');
    return {
      guardian1,
      guardian2,
      rawPhones,
      waLinks,
      cleanTelDigits,
    };
  };

  return (
    <div className="flex flex-col w-full min-w-0 max-w-[1440px] mx-auto space-y-4 pb-20 animate-fade-in">
      {/* Cabeçalho Institucional Limpo por Papel */}
      <section className="bg-white rounded-2xl p-4 sm:p-5 space-y-4 min-w-0 shadow-[0_8px_28px_-10px_rgba(9,15,29,0.08)]">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 min-w-0">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 min-w-0">
              {onBack && (
                <>
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-[#0b3b8c] hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0 active:scale-[0.97] transition-transform"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar</span>
                  </button>
                  <span className="text-slate-600" aria-hidden="true">/</span>
                </>
              )}
              <span className="font-semibold text-[#9f1239]">
                {canManageFamilyFeedback
                  ? 'Atendimento da Secretaria · Contato com Famílias'
                  : canRequestSecretariaContact
                  ? 'Busca Ativa · Solicitar Contato à Secretaria'
                  : 'Busca Ativa · Acompanhamento de Devolutivas'}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-950 tracking-tight leading-snug break-words">
              {canManageFamilyFeedback
                ? 'Central de Contato com Famílias & Feedbacks'
                : canRequestSecretariaContact
                ? `Busca Ativa — ${classGroup.name}`
                : 'Acompanhamento de Busca Ativa (3+ Faltas)'}
            </h1>

            <p className="text-xs sm:text-sm text-slate-700 max-w-3xl leading-relaxed">
              {canManageFamilyFeedback
                ? 'Apenas o(a) regente PEB I solicita contato quando há 3 ou mais faltas seguidas. Utilize esta fila para contatar os responsáveis e registrar o retorno para o professor.'
                : canRequestSecretariaContact
                ? 'Identificou 3 ou mais faltas seguidas? Selecione os dias abaixo para pedir contato da secretaria e acompanhe aqui o retorno da família.'
                : 'Visualização consolidada das solicitações enviadas pelos regentes PEB I e dos feedbacks registrados pela equipe administrativa.'}
            </p>
          </div>

          {/* Escopo de turmas + Botão do Modal de Famílias com Múltiplos Alunos */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsFamiliesModalOpen(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-100/85 hover:bg-emerald-200/85 text-emerald-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-200 hover:-translate-y-px active:scale-[0.97] cursor-pointer whitespace-nowrap"
              title="Visualizar automaticamente todos os estudantes que compartilham os mesmos responsáveis"
            >
              <Users className="w-4 h-4 text-emerald-800 shrink-0" />
              <span>Famílias / Irmãos ({multiStudentFamiliesCount})</span>
            </button>

            {!isPeb1 && availableClasses.length > 1 && onSelectClass ? (
              <>
                <div className="inline-flex items-center gap-1 bg-[#edf2f7] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setViewAllClassesMode(true)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap active:scale-[0.97] ${
                      viewAllClassesMode
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    Todas ({availableClasses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewAllClassesMode(false)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap active:scale-[0.97] ${
                      !viewAllClassesMode
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    Por Turma
                  </button>
                </div>

                {!viewAllClassesMode && (
                  <select
                    value={classGroup.id}
                    onChange={(e) => {
                      const target = availableClasses.find((c) => c.id === e.target.value);
                      if (target) onSelectClass(target);
                    }}
                    className="h-9 px-3 rounded-xl bg-[#edf2f7] text-slate-950 text-xs font-semibold cursor-pointer"
                  >
                    {availableClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} · {cls.shift.replace('Turno ', '')}
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <div className="text-xs font-semibold text-slate-800 pt-1">
                Turma {classGroup.name} · {classGroup.shift.replace('Turno ', '')}
              </div>
            )}
          </div>
        </div>

        {/* Barra de Filtros / Indicadores Clicáveis */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 min-w-0">
          <button
            type="button"
            onClick={() => setFilterMode('aguardando_feedback')}
            className={`text-left p-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'aguardando_feedback'
                ? 'bg-[#b45309] text-white shadow-[0_10px_24px_-8px_rgba(180,83,9,0.45)]'
                : 'bg-amber-100/80 text-amber-950 hover:bg-amber-200/75'
            }`}
          >
            <div className="min-w-0">
              <span className="text-xs font-semibold block truncate">
                {canManageFamilyFeedback ? 'Aguardando Contato' : 'Aguardando Secretaria'}
              </span>
              <span className="text-xl font-bold tabular-nums leading-tight mt-0.5 block">
                {summaryStats.totalWaitingFeedback}
              </span>
            </div>
            <Clock className="w-5 h-5 opacity-85 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('com_feedback')}
            className={`text-left p-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'com_feedback'
                ? 'bg-[#047857] text-white shadow-[0_10px_24px_-8px_rgba(4,120,87,0.45)]'
                : 'bg-emerald-100/80 text-emerald-950 hover:bg-emerald-200/75'
            }`}
          >
            <div className="min-w-0">
              <span className="text-xs font-semibold block truncate">
                Com Feedback
              </span>
              <span className="text-xl font-bold tabular-nums leading-tight mt-0.5 block">
                {summaryStats.totalWithFeedback}
              </span>
            </div>
            <CheckCheck className="w-5 h-5 opacity-85 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('com_ocorrencia')}
            className={`text-left p-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'com_ocorrencia'
                ? 'bg-[#be123c] text-white shadow-[0_10px_24px_-8px_rgba(190,18,60,0.45)]'
                : 'bg-rose-100/80 text-rose-950 hover:bg-rose-200/75'
            }`}
          >
            <div className="min-w-0">
              <span className="text-xs font-semibold block truncate">
                Solicitações PEB I
              </span>
              <span className="text-xl font-bold tabular-nums leading-tight mt-0.5 block">
                {summaryStats.totalOccurrencesCount}
              </span>
            </div>
            <Send className="w-5 h-5 opacity-85 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`text-left p-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
              filterMode === 'all'
                ? 'bg-[#0b3b8c] text-white shadow-[0_10px_24px_-8px_rgba(11,59,140,0.45)]'
                : 'bg-[#edf2f7] text-slate-950 hover:bg-[#e2e8f0]'
            }`}
          >
            <div className="min-w-0">
              <span className="text-xs font-semibold block truncate">
                {isPeb1 ? 'Todos da Turma' : 'Consultar Turmas'}
              </span>
              <span className="text-xl font-bold tabular-nums leading-tight mt-0.5 block">
                {scopedEntries.length}
              </span>
            </div>
            <UserCheck className="w-5 h-5 opacity-85 shrink-0" />
          </button>
        </div>

        {/* Busca Rápida + Filtro Rápido de Turma (Modo Todas) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isPeb1
                  ? 'Buscar estudante da sua turma por nome ou número...'
                  : 'Buscar por estudante, turma, professor(a) ou RA...'
              }
              className="w-full h-10 pl-10 pr-9 bg-[#edf2f7] text-slate-950 placeholder:text-slate-600 text-sm rounded-xl focus:bg-white transition-all duration-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-950 cursor-pointer p-1"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {!isPeb1 && viewAllClassesMode && availableClasses.length > 1 && (
            <select
              value={selectedClassFilterId}
              onChange={(e) => setSelectedClassFilterId(e.target.value)}
              aria-label="Filtrar fila por turma"
              className="h-10 px-3 rounded-xl bg-[#edf2f7] text-slate-950 text-xs sm:text-sm font-semibold cursor-pointer shrink-0 sm:max-w-[230px]"
            >
              <option value="all">Todas as Turmas ({availableClasses.length})</option>
              {availableClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} · {cls.shift.replace('Turno ', '')}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* Destaque para PEB I: Devolutivas Novas da Secretaria aguardando ciência */}
      {isPeb1 && summaryStats.unreadFeedbacksForTeacher.length > 0 && (
        <section className="bg-emerald-100/75 rounded-2xl p-4 space-y-3 min-w-0 shadow-[0_8px_24px_-10px_rgba(4,120,87,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-emerald-950">
                Novos Retornos da Secretaria ({summaryStats.unreadFeedbacksForTeacher.length})
              </h2>
              <p className="text-xs text-emerald-950/85">
                A equipe administrativa contatou as famílias abaixo. Leia a devolutiva e confirme ciência.
              </p>
            </div>
            {summaryStats.unreadFeedbacksForTeacher.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllUnreadFeedbacks((prev) => !prev)}
                className="min-h-[34px] px-3 rounded-xl bg-white text-emerald-950 text-xs font-semibold cursor-pointer shrink-0"
              >
                {showAllUnreadFeedbacks
                  ? 'Mostrar 4'
                  : `Ver todos (${summaryStats.unreadFeedbacksForTeacher.length})`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {(showAllUnreadFeedbacks
              ? summaryStats.unreadFeedbacksForTeacher
              : summaryStats.unreadFeedbacksForTeacher.slice(0, 4)
            ).map(({ cls, student, occ }) => (
              <div
                key={`unread-${occ.id}`}
                className="bg-white rounded-xl p-3.5 space-y-2.5 flex flex-col justify-between shadow-[0_6px_18px_-8px_rgba(9,15,29,0.08)]"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-700 tabular-nums">
                    <span className="font-bold text-slate-950 truncate">
                      {student.number.toString().padStart(2, '0')} · {student.name}
                    </span>
                    <span className="shrink-0">{occ.feedbackUpdatedAt || 'Recente'}</span>
                  </div>
                  <p className="text-xs text-slate-700">
                    {occ.sequenceNumber}ª solicitação ({occ.selectedDates.join(', ')}) ·{' '}
                    {getChannelLabel(occ.contactChannel)} · {occ.feedbackByName || 'Secretaria'}
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-slate-950 leading-snug pt-0.5 break-words">
                    “{occ.familyFeedback}”
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => openOccurrencePopup(cls, student, occ.id)}
                    className="text-xs font-semibold text-[#0b3b8c] hover:underline cursor-pointer"
                  >
                    Ver ficha completa
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleMarkFeedbackAsReadByTeacher(cls, student, occ.id)
                    }
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[#047857] hover:bg-[#065f46] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmar leitura</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lista Principal de Estudantes / Fila de Atendimento */}
      <div ref={listSectionRef} className="space-y-3 scroll-mt-24">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center space-y-2 bg-white rounded-2xl shadow-[0_8px_28px_-10px_rgba(9,15,29,0.08)]">
            <p className="text-sm sm:text-base font-bold text-slate-950">
              {filterMode === 'aguardando_feedback'
                ? 'Nenhuma solicitação pendente de contato no momento'
                : 'Nenhum registro encontrado neste filtro'}
            </p>
            <p className="text-xs sm:text-sm text-slate-700 max-w-md mx-auto">
              {canManageFamilyFeedback && filterMode === 'aguardando_feedback'
                ? 'Todas as solicitações enviadas pelos docentes PEB I já receberam retorno ou ainda não há pedidos abertos.'
                : canRequestSecretariaContact
                ? 'Alterne para "Todos da Turma" para selecionar 3 ou mais dias consecutivos de falta de algum estudante.'
                : 'Selecione outro filtro acima para consultar os históricos ou devolutivas registradas.'}
            </p>
            {filterMode !== 'com_ocorrencia' && summaryStats.totalOccurrencesCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterMode('com_ocorrencia')}
                className="mt-2 min-h-[38px] px-4 py-1.5 rounded-xl bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-950 text-xs font-semibold cursor-pointer transition-colors"
              >
                Ver todas as solicitações ({summaryStats.totalOccurrencesCount})
              </button>
            )}
          </div>
        ) : (
          paginatedEntries.map(({ cls, student, occurrences, totalConsecutiveDaysYear }) => {
            const compositeKey = `${cls.id}_${student.id}`;
            const isExpanded = expandedStudentKey === compositeKey;
            const hasOccurrences = occurrences.length > 0;
            const pendingCount = occurrences.filter(
              (o) => !(o.familyFeedback || '').trim() || o.contactStatus === 'em_tentativa'
            ).length;

            const draftDays = draftSelectedDaysByStudent[compositeKey] || [];
            const draftValidation = hasThreeOrMoreConsecutiveSchoolDays(
              draftDays,
              recentSchoolDays
            );

            const accumulatedMonthAbsences = Math.max(
              student.totalAbsencesMonth || 0,
              totalConsecutiveDaysYear
            );

            // Para Admin: quando há ocorrências, mostramos os dados de contato e atendimento com agilidade
            const latestOcc = occurrences[occurrences.length - 1];
            const contactData = buildStudentContactData(
              cls,
              student,
              latestOcc?.selectedDates || []
            );

            return (
              <div
                key={compositeKey}
                className="bg-white rounded-2xl overflow-hidden transition-all duration-200 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)]"
              >
                {/* Cabeçalho do Estudante */}
                <div
                  onClick={() =>
                    setExpandedStudentKey(isExpanded ? null : compositeKey)
                  }
                  className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#f4f7fb] transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 tabular-nums mt-0.5 sm:mt-0 ${
                        pendingCount > 0
                          ? 'bg-[#be123c] text-white'
                          : hasOccurrences
                          ? 'bg-emerald-700 text-white'
                          : 'bg-[#edf2f7] text-slate-900'
                      }`}
                    >
                      {student.number.toString().padStart(2, '0')}
                    </span>

                    <StudentAvatar student={student} size="md" />

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-slate-950 break-words leading-snug">
                          {student.name}
                        </h3>
                        <span className="text-xs text-slate-700 tabular-nums font-medium">
                          {!isPeb1 ? `${cls.name} · ` : ''}
                          {accumulatedMonthAbsences} falta(s) no mês
                          {hasOccurrences ? ` · ${occurrences.length} solicitação(ões)` : ''}
                        </span>
                      </div>

                      {/* Resumo limpo sem poluição visual */}
                      {hasOccurrences ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {occurrences.map((occ) => {
                            const outcome = getOutcomeMeta(occ);
                            const hasFb = Boolean((occ.familyFeedback || '').trim());
                            return (
                              <button
                                key={occ.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canManageFamilyFeedback) {
                                    setExpandedStudentKey(compositeKey);
                                  } else {
                                    openOccurrencePopup(cls, student, occ.id);
                                  }
                                }}
                                className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97] ${outcome.toneClass}`}
                              >
                                <span className="tabular-nums">
                                  {occ.sequenceNumber}ª ({occ.selectedDates.join(', ')})
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {hasFb ? outcome.label : 'Aguardando contato'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600">
                          {canRequestSecretariaContact
                            ? 'Sem pedido enviado · Toque para marcar 3+ faltas seguidas e solicitar contato'
                            : 'Nenhuma solicitação de busca ativa registrada pela PEB I'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ação Rápida Direita */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    {canManageFamilyFeedback && hasOccurrences && contactData.waLinks[0] && (
                      <a
                        href={contactData.waLinks[0].waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-200 active:scale-[0.97] whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                    )}

                    <span
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                        isExpanded
                          ? 'bg-[#0b3b8c] text-white'
                          : 'bg-[#edf2f7] text-slate-950'
                      }`}
                    >
                      <span>
                        {isExpanded
                          ? 'Recolher'
                          : canManageFamilyFeedback
                          ? pendingCount > 0
                            ? 'Contatar & Preencher'
                            : 'Ver / Editar Retorno'
                          : canRequestSecretariaContact
                          ? hasOccurrences
                            ? 'Acompanhar / Novo Pedido'
                            : 'Pedir Contato'
                          : 'Ver Histórico'}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </span>
                  </div>
                </div>

                {/* Conteúdo Expandido — Separado por Papel */}
                {isExpanded && (
                  <div className="px-3.5 sm:px-5 pb-5 pt-4 bg-[#f4f7fb] space-y-4 animate-fade-in">
                    {/* Faixa de Contato Familiar */}
                    {(canManageFamilyFeedback || hasOccurrences) && (
                      <div className="bg-white rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-[0_4px_14px_-6px_rgba(9,15,29,0.06)]">
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-xs font-semibold text-slate-700 block">
                            Responsáveis &amp; Telefone Cadastrado
                          </span>
                          <p className="text-sm font-bold text-slate-950 break-words">
                            {contactData.guardian1.cleanName || 'Responsável Legal'}
                            {contactData.guardian1.shortRoleLabel
                              ? ` (${contactData.guardian1.shortRoleLabel})`
                              : ''}
                            {contactData.guardian2.cleanName
                              ? ` · ${contactData.guardian2.cleanName}`
                              : ''}
                          </p>
                          <p className="text-xs text-slate-700 tabular-nums">
                            {contactData.rawPhones || 'Nenhum telefone cadastrado na ficha SED'}
                          </p>
                        </div>

                        {contactData.rawPhones && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {contactData.waLinks[0] && (
                              <a
                                href={contactData.waLinks[0].waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-200 active:scale-[0.97] whitespace-nowrap"
                              >
                                <MessageCircle className="w-4 h-4 shrink-0" />
                                <span>Contatar via WhatsApp</span>
                              </a>
                            )}
                            {contactData.cleanTelDigits && (
                              <a
                                href={`tel:${contactData.cleanTelDigits}`}
                                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-200 active:scale-[0.97] whitespace-nowrap"
                              >
                                <Phone className="w-4 h-4 shrink-0" />
                                <span>Ligar</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Histórico de Solicitações e Devolutivas */}
                    {occurrences.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-800">
                          Solicitações da Turma e Retornos da Secretaria ({occurrences.length})
                        </h4>

                        <div className="space-y-3">
                          {occurrences.map((occ) => {
                            const hasFeedback = Boolean((occ.familyFeedback || '').trim());
                            const outcome = getOutcomeMeta(occ);
                            const isEditingThis =
                              canManageFamilyFeedback &&
                              (!hasFeedback || editingFeedbackIds[occ.id]);
                            const adminDraft = getOrInitAdminDraft(occ);

                            return (
                              <div
                                key={occ.id}
                                className="bg-white rounded-xl p-4 space-y-3 shadow-[0_4px_14px_-6px_rgba(9,15,29,0.06)]"
                              >
                                {/* Metadados da Solicitação PEB I */}
                                <div className="flex flex-wrap items-start justify-between gap-2 pb-2">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-700 tabular-nums">
                                      <span className="font-bold text-[#9f1239]">
                                        {occ.sequenceNumber}ª Solicitação ({occ.selectedDates.length} dias seguidos)
                                      </span>
                                      <span aria-hidden="true">·</span>
                                      <span>Enviado por {occ.reportedByTeacher || cls.teacherName || 'PEB I'}</span>
                                      <span aria-hidden="true">·</span>
                                      <span>{occ.reportedAt || '2027'}</span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-950 tabular-nums">
                                      Datas faltosas: {occ.selectedDates.join(' · ')}
                                    </p>
                                    {occ.teacherObservation && (
                                      <p className="text-xs text-slate-800 bg-[#f4f7fb] px-3 py-2 rounded-lg mt-1">
                                        <span className="font-semibold text-slate-950">Observação PEB I: </span>
                                        {occ.teacherObservation}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openOccurrencePopup(cls, student, occ.id)}
                                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-950 text-xs font-semibold cursor-pointer transition-colors"
                                    >
                                      Resumo
                                    </button>
                                    {canRequestSecretariaContact && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveOccurrence(cls, student, occ.id)}
                                        title="Excluir solicitação enviada por engano"
                                        aria-label="Excluir solicitação"
                                        className="w-8 h-8 rounded-lg hover:bg-rose-100 text-slate-600 hover:text-[#9f1239] flex items-center justify-center cursor-pointer transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Visualização do Feedback já preenchido */}
                                {hasFeedback && !isEditingThis && (
                                  <div className="rounded-xl bg-emerald-100/75 p-3.5 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-emerald-950 font-semibold">
                                        <span>{outcome.label}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>Via {getChannelLabel(occ.contactChannel)}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>{occ.feedbackByName || 'Secretaria Escolar'}</span>
                                        {occ.feedbackUpdatedAt && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="tabular-nums">{occ.feedbackUpdatedAt}</span>
                                          </>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {occ.feedbackReadByTeacher ? (
                                          <span className="text-xs font-semibold text-emerald-950 inline-flex items-center gap-1">
                                            <CheckCheck className="w-3.5 h-3.5" />
                                            <span>
                                              Lido pela PEB I
                                              {occ.feedbackReadAt ? ` (${occ.feedbackReadAt})` : ''}
                                            </span>
                                          </span>
                                        ) : canRequestSecretariaContact ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleMarkFeedbackAsReadByTeacher(cls, student, occ.id)
                                            }
                                            className="min-h-[32px] px-3 py-1 rounded-lg bg-[#047857] hover:bg-[#065f46] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-all duration-200 active:scale-[0.97]"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Confirmar leitura</span>
                                          </button>
                                        ) : (
                                          <span className="text-xs text-slate-700 font-medium">
                                            Aguardando leitura docente
                                          </span>
                                        )}

                                        {canManageFamilyFeedback && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEditingFeedbackIds((prev) => ({
                                                ...prev,
                                                [occ.id]: true,
                                              }))
                                            }
                                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-950 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                            <span>Editar</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <p className="text-sm font-semibold text-slate-950 leading-relaxed break-words">
                                      “{occ.familyFeedback}”
                                    </p>
                                  </div>
                                )}

                                {/* Estado Aguardando */}
                                {!hasFeedback && !canManageFamilyFeedback && (
                                  <div className="p-3 rounded-xl bg-amber-100/80 text-amber-950 text-xs font-semibold flex items-center justify-between gap-2">
                                    <span>
                                      Solicitação recebida · Aguardando a equipe administrativa contatar a família e preencher o feedback.
                                    </span>
                                    <Clock className="w-4 h-4 text-amber-900 shrink-0" />
                                  </div>
                                )}

                                {/* Preenchimento do Admin */}
                                {canManageFamilyFeedback && isEditingThis && (
                                  <div className="rounded-xl bg-[#f4f7fb] p-3.5 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold text-slate-950">
                                        {hasFeedback
                                          ? 'Atualizar Devolutiva da Secretaria'
                                          : 'Registrar Contato com a Família e Feedback'}
                                      </span>
                                      {hasFeedback && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingFeedbackIds((prev) => ({
                                              ...prev,
                                              [occ.id]: false,
                                            }))
                                          }
                                          className="text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
                                        >
                                          Cancelar
                                        </button>
                                      )}
                                    </div>

                                    {/* Passo 1: Canal utilizado */}
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-semibold text-slate-800 block">
                                        1. Canal de contato utilizado
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {CONTACT_CHANNEL_OPTIONS.map((ch) => (
                                          <button
                                            key={ch.id}
                                            type="button"
                                            onClick={() =>
                                              updateAdminDraft(occ, {
                                                channel: ch.id,
                                                status:
                                                  ch.id === 'nao_atendeu'
                                                    ? 'em_tentativa'
                                                    : adminDraft.status,
                                              })
                                            }
                                            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap active:scale-[0.97] ${
                                              adminDraft.channel === ch.id
                                                ? 'bg-[#0b3b8c] text-white shadow-sm'
                                                : 'bg-white text-slate-800 hover:bg-[#edf2f7]'
                                            }`}
                                          >
                                            {ch.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Passo 2: Situação / Desfecho */}
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-semibold text-slate-800 block">
                                        2. Resultado do contato
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {OUTCOME_STATUS_OPTIONS.map((st) => (
                                          <button
                                            key={st.id}
                                            type="button"
                                            onClick={() =>
                                              updateAdminDraft(occ, { status: st.id })
                                            }
                                            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap active:scale-[0.97] ${
                                              adminDraft.status === st.id
                                                ? 'bg-slate-950 text-white shadow-sm'
                                                : 'bg-white text-slate-800 hover:bg-[#edf2f7]'
                                            }`}
                                          >
                                            {st.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Passo 3: Modelos rápidos + Parecer */}
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-semibold text-slate-800 block">
                                        3. Feedback para o(a) docente PEB I
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {QUICK_FAMILY_FEEDBACK_CHIPS.map((chip) => (
                                          <button
                                            key={chip}
                                            type="button"
                                            onClick={() =>
                                              updateAdminDraft(occ, { text: chip })
                                            }
                                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#edf2f7] text-slate-800 text-xs font-medium transition-colors cursor-pointer text-left"
                                          >
                                            + {chip}
                                          </button>
                                        ))}
                                      </div>

                                      <textarea
                                        rows={2}
                                        value={adminDraft.text}
                                        onChange={(e) =>
                                          updateAdminDraft(occ, { text: e.target.value })
                                        }
                                        placeholder="Descreva com clareza o retorno obtido da família para orientar o professor..."
                                        className="w-full p-2.5 rounded-xl bg-white text-slate-950 placeholder:text-slate-600 text-xs sm:text-sm resize-none"
                                      />
                                    </div>

                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSaveAdminFeedback(cls, student, occ.id, adminDraft)
                                        }
                                        className="min-h-[40px] px-4 py-2 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97]"
                                      >
                                        <Check className="w-4 h-4 shrink-0" />
                                        <span>Salvar Feedback e Notificar PEB I</span>
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

                    {/* FORMULÁRIO EXCLUSIVO PEB I */}
                    {canRequestSecretariaContact ? (
                      <div className="bg-white rounded-xl p-4 space-y-3 min-w-0 shadow-[0_4px_14px_-6px_rgba(9,15,29,0.06)]">
                        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                          <div>
                            <h4 className="text-sm font-bold text-slate-950">
                              Pedir para a Secretaria Contatar a Família ({occurrences.length + 1}ª Solicitação)
                            </h4>
                            <p className="text-xs text-slate-700">
                              Marque pelo menos 3 dias letivos consecutivos em que o(a) estudante faltou.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSelectLastThreeDaysShortcut(compositeKey)}
                              className="min-h-[34px] px-3 py-1 rounded-lg bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                            >
                              Últimos 3 dias letivos
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
                                className="text-xs font-semibold text-slate-700 hover:text-[#9f1239] cursor-pointer"
                              >
                                Limpar
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
                          {(() => {
                            const alreadyReportedDates = new Set<string>();
                            occurrences.forEach((occ) => {
                              (occ.selectedDates || []).forEach((d) => alreadyReportedDates.add(d));
                            });
                            return recentSchoolDays.map((day) => {
                              const isAlreadyReported = alreadyReportedDates.has(day.key);
                              const isSelected = draftDays.includes(day.key);
                              return (
                                <button
                                  key={day.key}
                                  type="button"
                                  disabled={isAlreadyReported}
                                  onClick={() => handleToggleDraftDay(compositeKey, day.key, isAlreadyReported)}
                                  title={isAlreadyReported ? 'Este dia já foi reportado em solicitação anterior' : day.fullLabel}
                                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-semibold text-xs flex items-center justify-between gap-1 transition-all duration-200 tabular-nums ${
                                    isAlreadyReported
                                      ? 'bg-slate-200 text-slate-500 opacity-60 cursor-not-allowed line-through'
                                      : isSelected
                                      ? 'bg-[#be123c] text-white shadow-sm cursor-pointer active:scale-[0.97]'
                                      : 'bg-[#edf2f7] text-slate-950 hover:bg-[#e2e8f0] cursor-pointer active:scale-[0.97]'
                                  }`}
                                >
                                  <span>{day.fullLabel}</span>
                                  {isAlreadyReported ? (
                                    <span className="text-[9.5px] font-bold text-slate-500 uppercase">Já reportado</span>
                                  ) : isSelected ? (
                                    <Check className="w-3.5 h-3.5 shrink-0" />
                                  ) : null}
                                </button>
                              );
                            });
                          })()}
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor={`obs-${compositeKey}`}
                            className="text-xs font-semibold text-slate-800 block"
                          >
                            Observação para a secretaria (opcional)
                          </label>
                          <input
                            id={`obs-${compositeKey}`}
                            type="text"
                            value={teacherObsDrafts[compositeKey] || ''}
                            onChange={(e) =>
                              setTeacherObsDrafts((prev) => ({
                                ...prev,
                                [compositeKey]: e.target.value,
                              }))
                            }
                            placeholder="Ex.: Colega comentou que está com febre / família não respondeu recado na agenda..."
                            className="w-full h-9 px-3 rounded-xl bg-[#edf2f7] text-slate-950 placeholder:text-slate-600 text-xs sm:text-sm focus:bg-white transition-colors"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                          <span
                            className={`text-xs font-semibold ${
                              draftValidation.isValid
                                ? 'text-[#065f46]'
                                : draftDays.length > 0
                                ? 'text-[#92400e]'
                                : 'text-slate-700'
                            }`}
                          >
                            {draftValidation.isValid
                              ? `${draftValidation.sortedKeys.length} dias marcados (${draftValidation.maxConsecutive} seguidos) · Pronto para enviar à secretaria`
                              : draftDays.length > 0
                              ? `Selecione pelo menos 3 dias letivos seguidos (sequência atual: ${draftValidation.maxConsecutive}).`
                              : 'Selecione os dias de falta acima.'}
                          </span>

                          <button
                            type="button"
                            disabled={!draftValidation.isValid}
                            onClick={() => handleRequestSecretariaContact(cls, student)}
                            className="w-full sm:w-auto min-h-[40px] py-2 px-4 rounded-xl bg-[#be123c] hover:bg-[#9f1239] text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none shrink-0"
                          >
                            <Send className="w-4 h-4 shrink-0" />
                            <span>Pedir para Secretaria Contatar</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      occurrences.length === 0 && (
                        <div className="bg-white rounded-xl p-3.5 text-xs text-slate-700">
                          {canManageFamilyFeedback
                            ? 'Este estudante não possui solicitação aberta. Apenas o(a) docente PEB I da turma envia o pedido de contato quando identifica 3 ou mais faltas seguidas.'
                            : 'Nenhuma solicitação de busca ativa registrada para este estudante até o momento.'}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <PaginationBar
          currentPage={safePage}
          totalItems={filteredEntries.length}
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
          itemLabel="estudantes"
        />
      </div>

      {/* Pop-up Compacto de Leitura / Atendimento Rápido (Renderizado em Portal acima de Header/BottomNav) */}
      {activeModalData && (
        <ModalPortal>
          <div
            onClick={() => setReadingOccurrenceModal(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`Solicitação de busca ativa — ${activeModalData.student.name}`}
            className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-sm overflow-hidden animate-backdrop-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-2xl shadow-[0_28px_70px_-14px_rgba(9,15,29,0.45)] overflow-hidden flex flex-col max-h-[86dvh] min-w-0 animate-apple-pop"
            >
              <div className="px-4 py-3.5 bg-[#0b3b8c] text-white flex items-center justify-between gap-2.5 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <StudentAvatar student={activeModalData.student} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-blue-100 tabular-nums truncate">
                      {activeModalData.cls.name} · Nº{' '}
                      {activeModalData.student.number.toString().padStart(2, '0')} ·{' '}
                      {activeModalData.occurrences.length} solicitação(ões)
                    </div>
                    <h2 className="text-sm sm:text-base font-bold text-white truncate">
                      {activeModalData.student.name}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setReadingOccurrenceModal(null)}
                  aria-label="Fechar pop-up"
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {activeModalData.occurrences.length > 1 && (
                <div className="px-4 py-2 bg-[#edf2f7] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  <span className="text-xs font-semibold text-slate-700 shrink-0 mr-1">
                    Solicitações:
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
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 shrink-0 tabular-nums ${
                          isCurrent
                            ? 'bg-[#0b3b8c] text-white shadow-xs'
                            : 'bg-white text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        {occ.sequenceNumber}ª ({occ.selectedDates.length}d)
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="p-4 flex-1 min-h-0 modal-scroll-body space-y-3 min-w-0">
              {/* Dias Faltosos e Pedido PEB I */}
              <div className="p-3.5 rounded-xl bg-rose-100/75 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <span className="font-bold text-[#9f1239]">
                    {activeModalData.activeOcc.sequenceNumber}ª Solicitação ·{' '}
                    {activeModalData.activeOcc.selectedDates.length} dias seguidos
                  </span>
                  <span className="text-slate-800 tabular-nums font-medium">
                    {activeModalData.activeOcc.reportedAt || '2027'} ·{' '}
                    {activeModalData.activeOcc.reportedByTeacher ||
                      activeModalData.cls.teacherName ||
                      'PEB I'}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-950 tabular-nums">
                  {activeModalData.activeOcc.selectedDates.join(' · ')}
                </p>
                {activeModalData.activeOcc.teacherObservation && (
                  <p className="text-xs text-slate-800 pt-1">
                    <span className="font-semibold">Obs. PEB I: </span>
                    {activeModalData.activeOcc.teacherObservation}
                  </p>
                )}
              </div>

              {/* Feedback da Secretaria */}
              {(() => {
                const occ = activeModalData.activeOcc;
                const outcome = getOutcomeMeta(occ);
                const hasFb = Boolean((occ.familyFeedback || '').trim());
                return (
                  <div
                    className={`p-3.5 rounded-xl space-y-1.5 ${
                      hasFb
                        ? 'bg-emerald-100/75'
                        : 'bg-amber-100/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                      <span
                        className={`font-bold ${
                          hasFb ? 'text-[#065f46]' : 'text-[#92400e]'
                        }`}
                      >
                        {hasFb
                          ? `${outcome.label} · Via ${getChannelLabel(occ.contactChannel)}`
                          : 'Aguardando contato da secretaria'}
                      </span>
                      {occ.feedbackUpdatedAt && (
                        <span className="text-slate-800 tabular-nums font-medium">
                          {occ.feedbackByName ? `${occ.feedbackByName} · ` : ''}
                          {occ.feedbackUpdatedAt}
                        </span>
                      )}
                    </div>

                    {hasFb ? (
                      <p className="text-sm font-semibold text-slate-950 leading-relaxed break-words">
                        “{occ.familyFeedback}”
                      </p>
                    ) : (
                      <p className="text-xs text-amber-950 font-medium">
                        Solicitação enviada pela turma PEB I · Pendente de contato com a família.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Responsável & Contato */}
              {(() => {
                const contactData = buildStudentContactData(
                  activeModalData.cls,
                  activeModalData.student,
                  activeModalData.activeOcc.selectedDates
                );
                return (
                  <div className="p-3 rounded-xl bg-[#f4f7fb] flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs text-slate-700 font-medium block">
                        {contactData.guardian1.shortRoleLabel || 'Responsável Legal'}
                      </span>
                      <span className="text-sm font-bold text-slate-950 break-words">
                        {contactData.guardian1.cleanName || 'Responsável Legal'}
                      </span>
                    </div>

                    {contactData.waLinks[0] && (
                      <a
                        href={contactData.waLinks[0].waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#047857] hover:bg-[#065f46] text-white font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 transition-all duration-200 active:scale-[0.97] tabular-nums"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{contactData.waLinks[0].display}</span>
                      </a>
                    )}
                  </div>
                );
              })()}

              {/* Edição rápida no pop-up (Exclusivo Admin) */}
              {canManageFamilyFeedback && isEditingModalFeedback && (() => {
                const occ = activeModalData.activeOcc;
                const draft = getOrInitAdminDraft(occ);
                return (
                  <div className="p-3.5 rounded-xl bg-[#f4f7fb] space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-950">
                        Registrar Contato &amp; Feedback
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingModalFeedback(false)}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {CONTACT_CHANNEL_OPTIONS.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => updateAdminDraft(occ, { channel: ch.id })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                            draft.channel === ch.id
                              ? 'bg-[#0b3b8c] text-white'
                              : 'bg-white text-slate-800 hover:bg-[#edf2f7]'
                          }`}
                        >
                          {ch.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {OUTCOME_STATUS_OPTIONS.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => updateAdminDraft(occ, { status: st.id })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                            draft.status === st.id
                              ? 'bg-slate-950 text-white'
                              : 'bg-white text-slate-800 hover:bg-[#edf2f7]'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {QUICK_FAMILY_FEEDBACK_CHIPS.slice(0, 4).map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => updateAdminDraft(occ, { text: chip })}
                          className="px-2 py-1 rounded-md bg-white hover:bg-[#edf2f7] text-slate-800 text-xs font-medium cursor-pointer text-left"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={2}
                      value={draft.text}
                      onChange={(e) => updateAdminDraft(occ, { text: e.target.value })}
                      placeholder="Retorno dado pela família..."
                      className="w-full p-2.5 rounded-lg bg-white text-slate-950 placeholder:text-slate-600 text-xs sm:text-sm resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleSaveAdminFeedback(
                          activeModalData.cls,
                          activeModalData.student,
                          occ.id,
                          draft
                        );
                        setIsEditingModalFeedback(false);
                      }}
                      className="w-full min-h-[38px] rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-semibold text-xs sm:text-sm cursor-pointer transition-all duration-200 active:scale-[0.98]"
                    >
                      Salvar Feedback e Notificar PEB I
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="px-4 py-3 bg-[#f4f7fb] flex items-center justify-between gap-2 shrink-0">
              {canManageFamilyFeedback && !isEditingModalFeedback ? (
                <button
                  type="button"
                  onClick={() => setIsEditingModalFeedback(true)}
                  className="min-h-[38px] px-3.5 rounded-xl bg-white hover:bg-[#dce7fb] text-[#0b3b8c] font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>
                    {(activeModalData.activeOcc.familyFeedback || '').trim()
                      ? 'Editar Feedback'
                      : 'Preencher Feedback'}
                  </span>
                </button>
              ) : canRequestSecretariaContact &&
                (activeModalData.activeOcc.familyFeedback || '').trim() &&
                !activeModalData.activeOcc.feedbackReadByTeacher ? (
                <button
                  type="button"
                  onClick={() =>
                    handleMarkFeedbackAsReadByTeacher(
                      activeModalData.cls,
                      activeModalData.student,
                      activeModalData.activeOcc.id
                    )
                  }
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar leitura</span>
                </button>
              ) : (
                <span className="text-xs font-semibold text-slate-700">
                  Busca Ativa Escolar
                </span>
              )}

              <button
                type="button"
                onClick={() => setReadingOccurrenceModal(null)}
                className="min-h-[38px] px-5 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-semibold text-xs sm:text-sm cursor-pointer transition-all duration-200 active:scale-[0.97]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Modal de Busca Ativa: Famílias com Múltiplos Alunos na Escola */}
      <FamiliasMultiplosAlunosModal
        isOpen={isFamiliesModalOpen}
        onClose={() => setIsFamiliesModalOpen(false)}
        allClasses={familyScopeClasses}
        onOpenStudentGrid={onOpenStudentGrid}
        onSelectClass={
          onSelectClass
            ? (cls) => {
                setViewAllClassesMode(false);
                onSelectClass(cls);
              }
            : undefined
        }
      />
    </div>
  );
};
