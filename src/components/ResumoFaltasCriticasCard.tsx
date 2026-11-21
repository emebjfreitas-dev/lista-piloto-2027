import React, { useState, useMemo } from 'react';
import {
  AuthorizedUser,
  ClassGroup,
  ConsecutiveAbsenceOccurrence,
  Student,
  UserRole,
} from '../types';
import {
  AlertTriangle,
  CalendarX2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  MessageCircle,
  X,
} from 'lucide-react';
import { StudentAvatar } from './StudentAvatar';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ModalPortal } from './ui/ModalPortal';

export interface CriticalAbsenceItem {
  cls: ClassGroup;
  student: Student;
  occurrences: ConsecutiveAbsenceOccurrence[];
  latestOccurrence?: ConsecutiveAbsenceOccurrence;
  consecutiveDaysCount: number;
  totalConsecutiveDaysYear: number;
  monthlyUnjustifiedAbsences: number;
  hasFamilyFeedback: boolean;
  familyFeedbackText: string;
}

interface ResumoFaltasCriticasCardProps {
  classes: ClassGroup[];
  userRole: UserRole;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  defaultThreshold?: number;
  onSelectStudentForConsecutiveScreen?: (cls: ClassGroup, student: Student) => void;
  onOpenStudentGrid?: (
    student: Student,
    classId: string,
    className: string,
    diasLetivosMes: number
  ) => void;
  onOpenStudentPdf?: (student: Student, className: string) => void;
}

const THRESHOLD_STORAGE_KEY = 'emeb_candelario_critical_absence_threshold_2027';

export const ResumoFaltasCriticasCard: React.FC<ResumoFaltasCriticasCardProps> = ({
  classes,
  userRole,
  teacherRoleType,
  defaultThreshold = 3,
  onSelectStudentForConsecutiveScreen,
  onOpenStudentGrid,
  onOpenStudentPdf,
}) => {
  const isStrictAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';
  const isPeb1 = userRole === 'usuario';
  const [threshold, setThreshold] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem(THRESHOLD_STORAGE_KEY) || '', 10);
      if ([3, 5, 10].includes(saved)) return saved;
    } catch {
      // ignore
    }
    return defaultThreshold;
  });

  const [statusFilter, setStatusFilter] = useState<
    'todos' | 'pendente_retorno' | 'com_retorno'
  >('todos');
  const [selectedDetailItem, setSelectedDetailItem] =
    useState<CriticalAbsenceItem | null>(null);
  const [showAllStudents, setShowAllStudents] = useState(false);

  useModalScrollLock(Boolean(selectedDetailItem));

  const handleUpdateThreshold = (nextVal: number) => {
    setThreshold(nextVal);
    try {
      localStorage.setItem(THRESHOLD_STORAGE_KEY, String(nextVal));
    } catch {
      // ignore
    }
  };

  // Identifica todos os estudantes que atingiram o limiar de faltas consecutivas configurado (ou faltas seguidas acumuladas)
  const criticalItems = useMemo(() => {
    const list: CriticalAbsenceItem[] = [];

    classes.forEach((cls) => {
      const activeStudents = cls.students.filter((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        return (
          !sit.includes('BXTR') &&
          !sit.includes('TRANSF') &&
          !sit.includes('REMAN') &&
          !sit.includes('RM')
        );
      });

      activeStudents.forEach((student) => {
        const occurrences = getStudentCumulativeOccurrences(student);
        const latestOcc =
          occurrences.length > 0 ? occurrences[occurrences.length - 1] : undefined;

        const maxOccStreak = occurrences.reduce(
          (max, occ) => Math.max(max, occ.selectedDates?.length || 0),
          0
        );
        const totalConsecutiveDaysYear = occurrences.reduce(
          (sum, occ) => sum + (occ.selectedDates?.length || 0),
          0
        );

        const monthlyUnjustified = Math.max(
          0,
          (student.totalAbsencesMonth || 0) - (student.justifiedAbsences || 0)
        );

        // Estudante atinge o limiar quando possui ocorrência de faltas seguidas >= threshold
        // ou quando acumula faltas não justificadas no mês >= threshold
        const effectiveStreak =
          maxOccStreak > 0 ? maxOccStreak : monthlyUnjustified >= threshold ? monthlyUnjustified : 0;

        if (effectiveStreak >= threshold) {
          const feedbackText = (
            latestOcc?.familyFeedback ||
            student.consecutiveAbsenceAlert?.familyFeedback ||
            ''
          ).trim();

          list.push({
            cls,
            student,
            occurrences,
            latestOccurrence: latestOcc,
            consecutiveDaysCount: effectiveStreak,
            totalConsecutiveDaysYear:
              totalConsecutiveDaysYear > 0 ? totalConsecutiveDaysYear : effectiveStreak,
            monthlyUnjustifiedAbsences: monthlyUnjustified,
            hasFamilyFeedback: feedbackText.length > 0,
            familyFeedbackText: feedbackText,
          });
        }
      });
    });

    // Ordena priorizando quem ainda aguarda retorno da família e maior número de dias consecutivos
    return list.sort((a, b) => {
      if (a.hasFamilyFeedback !== b.hasFamilyFeedback) {
        return a.hasFamilyFeedback ? 1 : -1;
      }
      if (b.consecutiveDaysCount !== a.consecutiveDaysCount) {
        return b.consecutiveDaysCount - a.consecutiveDaysCount;
      }
      return a.student.name.localeCompare(b.student.name, 'pt-BR');
    });
  }, [classes, threshold]);

  const filteredItems = useMemo(() => {
    return criticalItems.filter((item) => {
      if (statusFilter === 'pendente_retorno') return !item.hasFamilyFeedback;
      if (statusFilter === 'com_retorno') return item.hasFamilyFeedback;
      return true;
    });
  }, [criticalItems, statusFilter]);

  const pendingFeedbackCount = useMemo(
    () => criticalItems.filter((i) => !i.hasFamilyFeedback).length,
    [criticalItems]
  );
  const withFeedbackCount = useMemo(
    () => criticalItems.filter((i) => i.hasFamilyFeedback).length,
    [criticalItems]
  );

  const visibleItems = showAllStudents ? filteredItems : filteredItems.slice(0, 6);

  return (
    <>
      <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_8px_28px_-10px_rgba(9,15,29,0.08)] space-y-4">
        {/* Cabeçalho do Resumo de Faltas Críticas */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#9f1239]">
              <AlertTriangle className="w-[18px] h-[18px] shrink-0" />
              <span>Busca Ativa Escolar · Monitoramento de Faltas Consecutivas</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-700 font-mono tabular-nums">
                Limiar: {threshold}+ dias seguidos
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-950 tracking-tight">
              Resumo de Faltas Críticas ({criticalItems.length})
            </h2>
            <p className="text-sm text-slate-700">
              Alerta visual para cada estudante que atingiu o limiar de faltas seguidas. Clique sobre o estudante para inspecionar os dias faltosos, histórico anual e retorno da família.
            </p>
          </div>

          {/* Controles: Seletor de Limiar Configurado (3+, 5+, 10+ dias) & Filtros Rápidos */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex flex-wrap items-center gap-1 bg-[#eef3f9] p-1 rounded-xl">
              <span className="text-xs font-semibold text-slate-800 px-2">
                Limiar:
              </span>
              {[3, 5, 10].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleUpdateThreshold(val)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold font-mono tabular-nums transition-all duration-200 active:scale-[0.97] cursor-pointer whitespace-normal text-center ${
                    threshold === val
                      ? val === 10
                        ? 'bg-[#be123c] text-white shadow-sm'
                        : val === 5
                        ? 'bg-[#c2410c] text-white shadow-sm'
                        : 'bg-[#b45309] text-white shadow-sm'
                      : 'text-slate-800 hover:text-slate-950 hover:bg-white/60'
                  }`}
                >
                  {val}+ dias
                </button>
              ))}
            </div>

            <div className="ios-segmented">
              <button
                type="button"
                onClick={() => setStatusFilter('todos')}
                className={`ios-segmented-item ${
                  statusFilter === 'todos' ? 'ios-segmented-item-active' : ''
                }`}
              >
                Todos ({criticalItems.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pendente_retorno')}
                className={`ios-segmented-item ${
                  statusFilter === 'pendente_retorno' ? 'ios-segmented-item-active' : ''
                }`}
              >
                Sem Retorno ({pendingFeedbackCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('com_retorno')}
                className={`ios-segmented-item ${
                  statusFilter === 'com_retorno' ? 'ios-segmented-item-active' : ''
                }`}
              >
                Com Feedback ({withFeedbackCount})
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Cards de Alerta Visual por Estudante */}
        {filteredItems.length === 0 ? (
          <div className="py-6 px-4 text-center bg-[#f3f6fb] rounded-2xl space-y-1">
            <p className="text-sm font-semibold text-slate-950">
              Nenhum estudante atingiu o limiar de {threshold}+ faltas críticas neste filtro
            </p>
            <p className="text-xs text-slate-700">
              Todos os estudantes monitorados estão abaixo do limite configurado ou já foram filtrados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
            {visibleItems.map((item) => {
              const {
                cls,
                student,
                occurrences,
                latestOccurrence,
                consecutiveDaysCount,
                totalConsecutiveDaysYear,
                hasFamilyFeedback,
                familyFeedbackText,
              } = item;

              const datesList =
                latestOccurrence?.selectedDates && latestOccurrence.selectedDates.length > 0
                  ? latestOccurrence.selectedDates.join(', ')
                  : 'Dias registrados no lançamento mensal';

              const cardTierColor =
                consecutiveDaysCount >= 10
                  ? 'bg-rose-100/75 hover:bg-rose-100'
                  : consecutiveDaysCount >= 5
                  ? 'bg-orange-100/75 hover:bg-orange-100'
                  : 'bg-amber-100/75 hover:bg-amber-100';

              const badgeTierColor =
                consecutiveDaysCount >= 10
                  ? 'bg-[#be123c] text-white'
                  : consecutiveDaysCount >= 5
                  ? 'bg-[#c2410c] text-white'
                  : 'bg-[#b45309] text-white';

              return (
                <div
                  key={`crit-${cls.id}-${student.id}`}
                  onClick={() => setSelectedDetailItem(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDetailItem(item);
                    }
                  }}
                  className={`card-interactive group rounded-2xl p-3.5 cursor-pointer flex flex-col justify-between gap-2.5 h-full min-h-[118px] ${cardTierColor}`}
                >
                  <div className="flex items-start justify-between gap-2.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <StudentAvatar student={student} size="md" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-base font-bold text-slate-950 group-hover:text-[#14428c] transition-colors duration-200 break-words leading-snug">
                          {student.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 font-medium">
                          <span className="font-semibold text-slate-950">{cls.name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Nº {student.number.toString().padStart(2, '0')}
                          </span>
                          {cls.teacherFirstName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="break-words">Prof(a). {cls.teacherFirstName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono font-semibold text-xs tabular-nums inline-block ${badgeTierColor}`}
                      >
                        {consecutiveDaysCount >= 10
                          ? `10+ DIAS (${consecutiveDaysCount}d)`
                          : consecutiveDaysCount >= 5
                          ? `5+ DIAS (${consecutiveDaysCount}d)`
                          : `3+ DIAS (${consecutiveDaysCount}d)`}
                      </span>
                      <span className="text-xs text-slate-700 font-mono tabular-nums block mt-0.5">
                        Ano: {totalConsecutiveDaysYear}d ({occurrences.length || 1}x)
                      </span>
                    </div>
                  </div>

                  {/* Linha de Datas e Status do Retorno da Família */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs min-w-0">
                    <div className="min-w-0 flex-1 break-words">
                      <span className="text-slate-700">Datas: </span>
                      <span className="font-mono font-semibold text-slate-950 break-words">
                        {datesList}
                      </span>
                    </div>

                    <span
                      className={`font-semibold shrink-0 flex items-center gap-1 ${
                        hasFamilyFeedback ? 'text-[#065f46]' : 'text-[#9f1239]'
                      }`}
                    >
                      <span>
                        {hasFamilyFeedback ? 'Feedback recebido' : 'Aguardando contato'}
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0" />
                    </span>
                  </div>

                  {hasFamilyFeedback && (
                    <p className="text-xs text-slate-950 bg-white/95 px-3 py-2 rounded-xl font-medium break-words leading-relaxed">
                      “{familyFeedbackText}”
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rodapé com botão de expandir/recolher e atalho direto para a tela Faltas Seguidas */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {filteredItems.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAllStudents(!showAllStudents)}
              className="text-sm font-semibold text-[#14428c] hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>
                {showAllStudents
                  ? 'Mostrar menos estudantes'
                  : `Ver todos os ${filteredItems.length} estudantes em alerta crítico`}
              </span>
              {showAllStudents ? (
                <ChevronUp className="w-[17px] h-[17px] shrink-0" />
              ) : (
                <ChevronDown className="w-[17px] h-[17px] shrink-0" />
              )}
            </button>
          ) : (
            <span className="text-xs text-slate-700">
              Clique em qualquer estudante acima para abrir os detalhes completos da ocorrência.
            </span>
          )}

          {onSelectStudentForConsecutiveScreen &&
            (criticalItems.length > 0 || (classes[0] && classes[0].students[0])) && (
            <button
              type="button"
              onClick={() =>
                onSelectStudentForConsecutiveScreen(
                  (criticalItems[0] || { cls: classes[0], student: classes[0].students[0] }).cls,
                  (criticalItems[0] || { cls: classes[0], student: classes[0].students[0] }).student
                )
              }
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97]"
            >
              <CalendarX2 className="w-[17px] h-[17px] text-[#9f1239] shrink-0" />
              <span>
                {isStrictAdmin
                  ? 'Atender Contatos & Feedbacks'
                  : isPeb1
                  ? 'Pedir Contato à Secretaria'
                  : 'Abrir Painel de Busca Ativa'}
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Modal Minimalista de Detalhes da Falta Crítica (Renderizado em Portal) */}
      {selectedDetailItem && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Alerta de faltas críticas — ${selectedDetailItem.student.name}`}
            className="fixed inset-0 z-[110] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-hidden animate-backdrop-in"
            onClick={() => setSelectedDetailItem(null)}
          >
            <div
              className="modal-shell rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[86dvh] modal-scroll-body animate-apple-pop"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Cabeçalho do Modal */}
            <div className="flex items-start justify-between gap-3 pb-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <StudentAvatar student={selectedDetailItem.student} size="lg" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-[#9f1239] block break-words">
                    Alerta de Faltas Críticas · Turma {selectedDetailItem.cls.name}
                  </span>
                  <h3 className="text-lg font-bold text-slate-950 break-words leading-snug">
                    {selectedDetailItem.student.name}
                  </h3>
                  <p className="text-xs text-slate-700 font-mono tabular-nums break-words">
                    Nº {selectedDetailItem.student.number.toString().padStart(2, '0')} · RA{' '}
                    {selectedDetailItem.student.ra || '—'} · Regente:{' '}
                    {selectedDetailItem.cls.teacherName || 'PEB I'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                aria-label="Fechar detalhes"
                className="w-10 h-10 rounded-full bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-950 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo Numérico do Estudante */}
            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2.5 text-center">
              <div className="bg-rose-100/80 rounded-2xl p-3.5 min-w-0">
                <span className="text-xs font-semibold text-rose-950 block">
                  Sequência Atual
                </span>
                <span className="text-xl font-bold text-[#9f1239] font-mono tabular-nums">
                  {selectedDetailItem.consecutiveDaysCount} dias
                </span>
              </div>

              <div className="bg-[#f3f6fb] rounded-2xl p-3.5 min-w-0">
                <span className="text-xs font-semibold text-slate-700 block">
                  Ocorrências no Ano
                </span>
                <span className="text-lg font-bold text-slate-950 font-mono tabular-nums">
                  {selectedDetailItem.occurrences.length || 1}x ({selectedDetailItem.totalConsecutiveDaysYear} dias)
                </span>
              </div>

              <div className="bg-[#f3f6fb] rounded-2xl p-3.5 min-w-0">
                <span className="text-xs font-semibold text-slate-700 block">
                  Faltas no Mês
                </span>
                <span className="text-lg font-bold text-slate-950 font-mono tabular-nums">
                  {selectedDetailItem.student.totalAbsencesMonth || 0} faltas ·{' '}
                  {selectedDetailItem.student.justifiedAbsences || 0} atest.
                </span>
              </div>
            </div>

            {/* Contato Rápido com a Família (WhatsApp Direto) */}
            <div className="bg-[#f3f6fb] rounded-2xl p-3.5 space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 block">
                Responsável Familiar &amp; Contato Direto
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-950">
                  {selectedDetailItem.student.filiacao1 ||
                    selectedDetailItem.student.guardianName ||
                    'Familiar Responsável'}
                </span>
                {(() => {
                  const rawPhone =
                    selectedDetailItem.student.telefones ||
                    selectedDetailItem.student.guardianPhone ||
                    '';
                  const firstPhone = rawPhone.split('/')[0]?.trim() || '';
                  const digits = firstPhone.replace(/\D/g, '');
                  if (!digits) {
                    return (
                      <span className="text-xs text-slate-700">
                        Telefone não informado
                      </span>
                    );
                  }
                  const waNumber = digits.startsWith('55') ? digits : `55${digits}`;
                  const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(
                    `Olá, família de ${selectedDetailItem.student.name}! Aqui é da EMEB Prof. Joaquim Candelário de Freitas. Notamos ${selectedDetailItem.consecutiveDaysCount} faltas seguidas recentes. Está tudo bem com o(a) estudante?`
                  )}`;
                  return (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-mono font-bold text-[#065f46] hover:underline"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span>{firstPhone} (WhatsApp)</span>
                    </a>
                  );
                })()}
              </div>
            </div>

            {/* Histórico Acumulado de Sequências de Faltas Seguidas e Feedbacks da Família */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-950">
                Histórico de Sequências e Devolutivas da Família no Ano
              </h4>

              {selectedDetailItem.occurrences.length === 0 ? (
                <div className="rounded-2xl bg-rose-100/75 p-3.5 space-y-1">
                  <p className="text-sm font-semibold text-slate-950">
                    {selectedDetailItem.monthlyUnjustifiedAbsences} faltas não justificadas registradas no mês
                  </p>
                  <p className="text-xs text-slate-800">
                    {isStrictAdmin
                      ? 'Aguardando o(a) docente PEB I solicitar contato na aba Busca Ativa caso identifique 3 ou mais faltas seguidas.'
                      : isPeb1
                      ? 'Clique em "Pedir Contato à Secretaria" abaixo para informar os dias exatos de faltas seguidas.'
                      : 'Aguardando solicitação de contato pelo(a) docente PEB I e devolutiva da secretaria.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDetailItem.occurrences.map((occ, idx) => {
                    const seq = occ.sequenceNumber || idx + 1;
                    const fb = (occ.familyFeedback || '').trim();
                    return (
                      <div
                        key={occ.id || `occ-${idx}`}
                        className="rounded-2xl bg-[#f3f6fb] p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-950">
                            {seq}ª Solicitação · {occ.selectedDates.join(', ')} (
                            {occ.selectedDates.length} dias)
                          </span>
                          <span className="text-xs text-slate-700 font-mono tabular-nums">
                            {occ.reportedAt || 'Registrado'}
                          </span>
                        </div>
                        {fb ? (
                          <div className="bg-white rounded-xl p-2.5 text-sm text-slate-950">
                            <span className="font-semibold text-[#065f46] block text-xs">
                              Devolutiva da Família ({occ.feedbackByName || 'Secretaria'} · {occ.feedbackUpdatedAt || 'Recente'}):
                            </span>
                            <p className="mt-0.5 leading-relaxed">{fb}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-[#9f1239] font-medium">
                            {isStrictAdmin
                              ? 'Pendente de contato com a família e preenchimento do feedback.'
                              : 'Aguardando contato e devolutiva da secretaria com a família.'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ações Diretas no Rodapé do Modal */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
              {onOpenStudentGrid && (
                <button
                  type="button"
                  onClick={() => {
                    const item = selectedDetailItem;
                    setSelectedDetailItem(null);
                    onOpenStudentGrid(
                      item.student,
                      item.cls.id,
                      item.cls.name,
                      item.cls.classesHeld || 20
                    );
                  }}
                  className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-950 font-semibold text-sm cursor-pointer transition-colors whitespace-normal text-center"
                >
                  Ficha Completa (48 Dados)
                </button>
              )}

              {onOpenStudentPdf && (
                <button
                  type="button"
                  onClick={() => {
                    const item = selectedDetailItem;
                    setSelectedDetailItem(null);
                    onOpenStudentPdf(item.student, item.cls.name);
                  }}
                  className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-950 font-bold text-sm cursor-pointer transition-colors whitespace-normal text-center"
                >
                  Ficha Informativa do Estudante
                </button>
              )}

              {onSelectStudentForConsecutiveScreen && (
                <button
                  type="button"
                  onClick={() => {
                    const item = selectedDetailItem;
                    setSelectedDetailItem(null);
                    onSelectStudentForConsecutiveScreen(item.cls, item.student);
                  }}
                  className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97] whitespace-normal text-center"
                >
                  <ExternalLink className="w-[18px] h-[18px] shrink-0" />
                  <span>
                    {isStrictAdmin
                      ? 'Contatar e Registrar Feedback'
                      : isPeb1
                      ? 'Pedir Contato à Secretaria'
                      : 'Ver na Busca Ativa'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
};
