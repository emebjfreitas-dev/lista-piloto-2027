import React, { useState, useMemo } from 'react';
import {
  ClassGroup,
  ConsecutiveAbsenceOccurrence,
  Student,
  UserRole,
} from '../types';
import { StudentAvatar } from './StudentAvatar';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';

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
  defaultThreshold = 3,
  onSelectStudentForConsecutiveScreen,
  onOpenStudentGrid,
  onOpenStudentPdf,
}) => {
  const [threshold, setThreshold] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem(THRESHOLD_STORAGE_KEY) || '', 10);
      if ([3, 4, 5].includes(saved)) return saved;
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
      <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-black/[0.06] space-y-4">
        {/* Cabeçalho do Resumo de Faltas Críticas */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-black/[0.06]">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-[0.75rem] font-semibold text-[#ff3b30]">
              <span className="material-symbols-outlined text-[18px]">warning</span>
              <span>Busca Ativa Escolar · Monitoramento de Faltas Consecutivas</span>
              <span aria-hidden="true" className="text-[#d2d2d7]">·</span>
              <span className="text-[#6e6e73] font-mono tabular-nums">
                Limiar: {threshold}+ dias seguidos
              </span>
            </div>
            <h2 className="text-[1.1rem] sm:text-[1.25rem] font-bold text-[#1d1d1f] tracking-tight">
              Resumo de Faltas Críticas ({criticalItems.length})
            </h2>
            <p className="text-[0.8rem] text-[#6e6e73]">
              Alerta visual para cada estudante que atingiu o limiar de faltas seguidas. Clique sobre o estudante para inspecionar os dias faltosos, histórico anual e retorno da família.
            </p>
          </div>

          {/* Controles: Seletor de Limiar Configurado (3+, 4+, 5+ dias) & Filtros Rápidos */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl">
              <span className="text-[0.72rem] font-semibold text-[#6e6e73] px-2">
                Limiar:
              </span>
              {[3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleUpdateThreshold(val)}
                  className={`px-2.5 py-1 rounded-lg text-[0.74rem] font-semibold font-mono tabular-nums transition-colors cursor-pointer ${
                    threshold === val
                      ? 'bg-[#1d1d1f] text-white shadow-2xs'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
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
          <div className="py-6 px-4 text-center bg-[#f5f5f7]/60 rounded-2xl space-y-1">
            <p className="text-[0.9rem] font-semibold text-[#1d1d1f]">
              Nenhum estudante atingiu o limiar de {threshold}+ faltas críticas neste filtro
            </p>
            <p className="text-[0.78rem] text-[#6e6e73]">
              Todos os estudantes monitorados estão abaixo do limite configurado ou já foram filtrados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
                  className={`group rounded-2xl p-3.5 transition-all cursor-pointer flex flex-col justify-between gap-2.5 border ${
                    hasFamilyFeedback
                      ? 'bg-[#fbfbfd] hover:bg-[#f5f5f7] border-black/[0.07]'
                      : 'bg-[#fff8f7] hover:bg-[#fff2f0] border-[#ff3b30]/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <StudentAvatar student={student} size="sm" />
                      <div className="min-w-0">
                        <h3 className="text-[0.88rem] font-bold text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors truncate">
                          {student.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem] text-[#6e6e73] font-medium">
                          <span className="font-semibold text-[#1d1d1f]">{cls.name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Nº {student.number.toString().padStart(2, '0')}
                          </span>
                          {cls.teacherFirstName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Prof(a). {cls.teacherFirstName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono font-bold text-[0.82rem] tabular-nums block ${
                          hasFamilyFeedback ? 'text-[#0066cc]' : 'text-[#ff3b30]'
                        }`}
                      >
                        {consecutiveDaysCount}d seguidos
                      </span>
                      <span className="text-[0.68rem] text-[#6e6e73] font-mono tabular-nums block">
                        Ano: {totalConsecutiveDaysYear}d ({occurrences.length || 1}x)
                      </span>
                    </div>
                  </div>

                  {/* Linha de Datas e Status do Retorno da Família */}
                  <div className="pt-2 border-t border-black/[0.05] flex items-center justify-between gap-2 text-[0.74rem]">
                    <div className="min-w-0 flex-1 truncate">
                      <span className="text-[#6e6e73]">Datas: </span>
                      <span className="font-mono font-semibold text-[#1d1d1f]">
                        {datesList}
                      </span>
                    </div>

                    <span
                      className={`font-semibold shrink-0 flex items-center gap-1 ${
                        hasFamilyFeedback ? 'text-[#1d8338]' : 'text-[#ff3b30]'
                      }`}
                    >
                      <span>
                        {hasFamilyFeedback ? 'Feedback recebido' : 'Aguardando contato'}
                      </span>
                      <span className="material-symbols-outlined text-[15px]">
                        chevron_right
                      </span>
                    </span>
                  </div>

                  {hasFamilyFeedback && (
                    <p className="text-[0.74rem] text-[#1d1d1f] bg-white/90 px-2.5 py-1.5 rounded-xl line-clamp-1 font-medium">
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
              className="text-[0.8rem] font-semibold text-[#0066cc] hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>
                {showAllStudents
                  ? 'Mostrar menos estudantes'
                  : `Ver todos os ${filteredItems.length} estudantes em alerta crítico`}
              </span>
              <span className="material-symbols-outlined text-[17px]">
                {showAllStudents ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          ) : (
            <span className="text-[0.75rem] text-[#6e6e73]">
              Clique em qualquer estudante acima para abrir os detalhes completos da ocorrência.
            </span>
          )}

          {onSelectStudentForConsecutiveScreen && criticalItems.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onSelectStudentForConsecutiveScreen(
                  criticalItems[0].cls,
                  criticalItems[0].student
                )
              }
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-[0.78rem] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[17px] text-[#ff3b30]">
                event_busy
              </span>
              <span>Abrir Painel de Faltas Seguidas</span>
            </button>
          )}
        </div>
      </section>

      {/* Modal Minimalista de Detalhes da Falta Crítica (Ao Clicar no Estudante) */}
      {selectedDetailItem && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-gentle-fade"
          onClick={() => setSelectedDetailItem(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-3 min-w-0">
                <StudentAvatar student={selectedDetailItem.student} size="md" />
                <div className="min-w-0">
                  <span className="text-[0.72rem] font-semibold text-[#ff3b30] block">
                    Alerta de Faltas Críticas · Turma {selectedDetailItem.cls.name}
                  </span>
                  <h3 className="text-[1.1rem] sm:text-[1.2rem] font-bold text-[#1d1d1f] truncate">
                    {selectedDetailItem.student.name}
                  </h3>
                  <p className="text-[0.76rem] text-[#6e6e73] font-mono tabular-nums">
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
                className="w-9 h-9 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Resumo Numérico do Estudante */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="bg-[#fff8f7] rounded-2xl p-3 border border-[#ff3b30]/20">
                <span className="text-[0.68rem] font-semibold text-[#6e6e73] block">
                  Sequência Atual
                </span>
                <span className="text-[1.35rem] font-bold text-[#ff3b30] font-mono tabular-nums">
                  {selectedDetailItem.consecutiveDaysCount} dias
                </span>
              </div>

              <div className="bg-[#f5f5f7] rounded-2xl p-3">
                <span className="text-[0.68rem] font-semibold text-[#6e6e73] block">
                  Ocorrências no Ano
                </span>
                <span className="text-[1.35rem] font-bold text-[#1d1d1f] font-mono tabular-nums">
                  {selectedDetailItem.occurrences.length || 1}x (
                  {selectedDetailItem.totalConsecutiveDaysYear}d)
                </span>
              </div>

              <div className="bg-[#f5f5f7] rounded-2xl p-3">
                <span className="text-[0.68rem] font-semibold text-[#6e6e73] block">
                  Faltas no Mês
                </span>
                <span className="text-[1.35rem] font-bold text-[#1d1d1f] font-mono tabular-nums">
                  {selectedDetailItem.student.totalAbsencesMonth || 0}f ·{' '}
                  {selectedDetailItem.student.justifiedAbsences || 0}at
                </span>
              </div>
            </div>

            {/* Contato Rápido com a Família (WhatsApp Direto) */}
            <div className="bg-[#f5f5f7] rounded-2xl p-3.5 space-y-1.5">
              <span className="text-[0.72rem] font-semibold text-[#6e6e73] block">
                Responsável Legal &amp; Contato Direto
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.85rem] font-bold text-[#1d1d1f]">
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
                      <span className="text-[0.76rem] text-[#6e6e73]">
                        Telefone não informado
                      </span>
                    );
                  }
                  const waNumber = digits.startsWith('55') ? digits : `55${digits}`;
                  const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(
                    `Olá, família de ${selectedDetailItem.student.name}! Aqui é da EMEB Prof. Joaquim Candelário de Freitas. Notamos ${selectedDetailItem.consecutiveDaysCount} faltas seguidas recentes. Está tudo bem com a criança?`
                  )}`;
                  return (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[0.8rem] font-mono font-bold text-[#128C7E] hover:underline"
                    >
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>{firstPhone} (WhatsApp)</span>
                    </a>
                  );
                })()}
              </div>
            </div>

            {/* Histórico Acumulado de Sequências de Faltas Seguidas e Feedbacks da Família */}
            <div className="space-y-2">
              <h4 className="text-[0.82rem] font-bold text-[#1d1d1f]">
                Histórico de Sequências e Devolutivas da Família no Ano
              </h4>

              {selectedDetailItem.occurrences.length === 0 ? (
                <div className="rounded-2xl bg-[#fff8f7] p-3.5 border border-[#ff3b30]/20 space-y-1">
                  <p className="text-[0.82rem] font-semibold text-[#1d1d1f]">
                    {selectedDetailItem.monthlyUnjustifiedAbsences} faltas não justificadas registradas no mês
                  </p>
                  <p className="text-[0.76rem] text-[#6e6e73]">
                    {userRole === 'peb2'
                      ? 'Aguardando seleção dos dias específicos pelo(a) professor(a) PEB I ou retorno da secretaria.'
                      : 'Clique em "Gerenciar em Faltas Seguidas" abaixo para apontar os dias exatos ou registrar o feedback da família.'}
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
                        className="rounded-2xl bg-[#f5f5f7] p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.78rem] font-bold text-[#1d1d1f]">
                            {seq}ª Sequência · {occ.selectedDates.join(', ')} (
                            {occ.selectedDates.length} dias)
                          </span>
                          <span className="text-[0.7rem] text-[#6e6e73] font-mono">
                            {occ.reportedAt || 'Registrado'}
                          </span>
                        </div>
                        {fb ? (
                          <div className="bg-white rounded-xl p-2.5 text-[0.8rem] text-[#1d1d1f]">
                            <span className="font-semibold text-[#1d8338] block text-[0.72rem]">
                              Devolutiva da Família ({occ.feedbackUpdatedAt || 'Secretaria'}):
                            </span>
                            <p className="mt-0.5 leading-relaxed">{fb}</p>
                          </div>
                        ) : (
                          <p className="text-[0.76rem] text-[#ff3b30] font-medium">
                            Aguardando contato e devolutiva da secretaria com a família.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ações Diretas no Rodapé do Modal */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-black/[0.06]">
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
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-[0.8rem] cursor-pointer transition-colors"
                >
                  Ver Grade SED (48 Campos)
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
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-[0.8rem] cursor-pointer transition-colors"
                >
                  Ficha Escaneada
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
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-semibold text-[0.8rem] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    open_in_new
                  </span>
                  <span>Gerenciar em Faltas Seguidas</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
