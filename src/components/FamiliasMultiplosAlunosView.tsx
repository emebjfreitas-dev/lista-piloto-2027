import React, { useMemo, useState } from 'react';
import { ClassGroup, Student } from '../types';
import {
  groupSchoolFamiliesByGuardians,
  MultiStudentFamilyGroup,
} from '../utils/siblingDetection';
import {
  getStudentAttendanceMetrics,
  getStudentConsecutiveAlertInfo,
  isStudentEducacaoInfantil,
} from '../utils/attendanceRules';
import { OFFICIAL_OCTOBER_DAYS, SCHOOL_NAME } from '../data/mockData';
import { StudentAvatar } from './StudentAvatar';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import {
  Download,
  ExternalLink,
  MessageCircle,
  Phone,
  Search,
  Users,
  X,
} from 'lucide-react';

type FamilyFilterMode = 'all' | 'multi_class' | 'with_alerts' | 'three_plus';

interface EnrichedFamilyGroup extends MultiStudentFamilyGroup {
  hasAlert: boolean;
  alertCount: number;
  memberMetrics: Array<{
    student: Student;
    cls: ClassGroup;
    frequenciaPercent: number;
    minLegalPercent: number;
    isBelowLegal: boolean;
    consecutiveTier: 'none' | '3d' | '5d' | '10d';
    consecutiveDays: number;
    alertLabel: string;
  }>;
}

export interface FamiliasMultiplosAlunosViewProps {
  allClasses: ClassGroup[];
  onOpenStudentGrid?: (student: Student, classGroup?: ClassGroup) => void;
  onSelectClass?: (cls: ClassGroup) => void;
  compact?: boolean;
}

export const FamiliasMultiplosAlunosView: React.FC<FamiliasMultiplosAlunosViewProps> = ({
  allClasses,
  onOpenStudentGrid,
  onSelectClass,
  compact = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FamilyFilterMode>('all');

  const rawFamilies = useMemo(
    () => groupSchoolFamiliesByGuardians(allClasses),
    [allClasses]
  );

  const enrichedFamilies = useMemo<EnrichedFamilyGroup[]>(() => {
    return rawFamilies
      .map((fam) => {
        let alertCount = 0;
        const memberMetrics = fam.members.map((m) => {
          const rawHeld = m.classGroup.classesHeld;
          const diasLetivos = typeof rawHeld === 'number' ? rawHeld : 20;
          const metrics = getStudentAttendanceMetrics(
            m.student,
            diasLetivos,
            OFFICIAL_OCTOBER_DAYS
          );
          const isInfantil = isStudentEducacaoInfantil(m.student, m.className);
          const minLegalPercent = isInfantil ? 60 : 75;
          const isBelowLegal = metrics.frequenciaPercent < minLegalPercent;
          const consecInfo = getStudentConsecutiveAlertInfo(m.student);

          if (isBelowLegal || consecInfo.tier !== 'none') {
            alertCount++;
          }

          return {
            student: m.student,
            cls: m.classGroup,
            frequenciaPercent: metrics.frequenciaPercent,
            minLegalPercent,
            isBelowLegal,
            consecutiveTier: consecInfo.tier,
            consecutiveDays: consecInfo.days,
            alertLabel: consecInfo.label,
          };
        });

        return {
          ...fam,
          hasAlert: alertCount > 0,
          alertCount,
          memberMetrics,
        };
      })
      .sort((a, b) => {
        if (a.hasAlert !== b.hasAlert) return a.hasAlert ? -1 : 1;
        if (b.members.length !== a.members.length) {
          return b.members.length - a.members.length;
        }
        if (a.hasMultipleClasses !== b.hasMultipleClasses) {
          return a.hasMultipleClasses ? -1 : 1;
        }
        const nameA = a.sharedGuardians[0]?.name || a.members[0]?.student.name || '';
        const nameB = b.sharedGuardians[0]?.name || b.members[0]?.student.name || '';
        return nameA.localeCompare(nameB);
      });
  }, [rawFamilies]);

  const stats = useMemo(() => {
    const totalFamilies = enrichedFamilies.length;
    const totalLinkedStudents = enrichedFamilies.reduce(
      (acc, f) => acc + f.members.length,
      0
    );
    const multiClassFamilies = enrichedFamilies.filter(
      (f) => f.hasMultipleClasses
    ).length;
    const familiesWithAlerts = enrichedFamilies.filter((f) => f.hasAlert).length;
    const threePlusFamilies = enrichedFamilies.filter(
      (f) => f.members.length >= 3
    ).length;

    return {
      totalFamilies,
      totalLinkedStudents,
      multiClassFamilies,
      familiesWithAlerts,
      threePlusFamilies,
    };
  }, [enrichedFamilies]);

  const filteredFamilies = useMemo(() => {
    const q = searchQuery
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return enrichedFamilies.filter((fam) => {
      if (filterMode === 'multi_class' && !fam.hasMultipleClasses) return false;
      if (filterMode === 'with_alerts' && !fam.hasAlert) return false;
      if (filterMode === 'three_plus' && fam.members.length < 3) return false;

      if (!q) return true;

      const guardianMatch = fam.sharedGuardians.some((g) =>
        g.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(q)
      );
      if (guardianMatch) return true;

      const phoneMatch = fam.rawPhonesJoined.toLowerCase().includes(q);
      if (phoneMatch) return true;

      return fam.members.some((m) => {
        const stName = m.student.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const clsName = m.className.toLowerCase();
        const ra = (m.student.ra || '').toLowerCase();
        const p1 = (m.student.filiacao1 || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const p2 = (m.student.filiacao2 || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return (
          stName.includes(q) ||
          clsName.includes(q) ||
          ra.includes(q) ||
          p1.includes(q) ||
          p2.includes(q)
        );
      });
    });
  }, [enrichedFamilies, filterMode, searchQuery]);

  const handleExportCsv = () => {
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
    const headers = [
      'Núcleo Familiar',
      'Vínculo Identificado',
      'Responsáveis Compartilhados',
      'Qtd. Filhos na Escola',
      'Turmas',
      'Telefones',
      'Estudantes (Nome · Turma · Frequência)',
      'Situação Busca Ativa',
    ];

    const rows = filteredFamilies.map((fam, idx) => {
      const guardiansStr = fam.sharedGuardians
        .map((g) => `${g.roleLabel}: ${g.name}`)
        .join(' | ');
      const studentsStr = fam.memberMetrics
        .map(
          (m) =>
            `${m.student.name} (${m.cls.name} · ${m.frequenciaPercent}%)`
        )
        .join(' | ');
      const alertStr = fam.hasAlert
        ? `${fam.alertCount} estudante(s) em atenção`
        : 'Regular';

      return [
        escapeCsv(`Família ${idx + 1}`),
        escapeCsv(fam.relationSummary),
        escapeCsv(guardiansStr),
        String(fam.members.length),
        escapeCsv(fam.distinctClassNames.join(', ')),
        escapeCsv(fam.rawPhonesJoined || 'Não cadastrado'),
        escapeCsv(studentsStr),
        escapeCsv(alertStr),
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'familias-multiplos-alunos-emeb-2027.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* Cabeçalho e Resumo Numérico Limpo */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-[#0b3b8c] shrink-0" />
              <span>Famílias com Múltiplos Estudantes na Escola</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Cruzamento automático de dados cadastrais por nome da mãe, pai ou responsável em todas as turmas para agilizar contatos da Busca Ativa.
            </p>
          </div>

          {filteredFamilies.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Relação (.csv)</span>
            </button>
          )}
        </div>

        {/* Métricas Consolidadas (Texto limpo + numerais tabulares) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-100 tabular-nums">
          <div className="pt-2">
            <span className="text-xs font-medium text-slate-500 block">
              Famílias Identificadas
            </span>
            <span className="text-xl sm:text-2xl font-bold text-slate-950">
              {stats.totalFamilies}
            </span>
          </div>
          <div className="pt-2">
            <span className="text-xs font-medium text-slate-500 block">
              Estudantes Vinculados
            </span>
            <span className="text-xl sm:text-2xl font-bold text-[#0b3b8c]">
              {stats.totalLinkedStudents}
            </span>
          </div>
          <div className="pt-2">
            <span className="text-xs font-medium text-slate-500 block">
              Em Turmas Diferentes
            </span>
            <span className="text-xl sm:text-2xl font-bold text-emerald-800">
              {stats.multiClassFamilies}
            </span>
          </div>
          <div className="pt-2">
            <span className="text-xs font-medium text-slate-500 block">
              Com Alerta de Frequência
            </span>
            <span
              className={`text-xl sm:text-2xl font-bold ${
                stats.familiesWithAlerts > 0 ? 'text-rose-700' : 'text-slate-950'
              }`}
            >
              {stats.familiesWithAlerts}
            </span>
          </div>
        </div>

        {/* Filtros e Busca */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-slate-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Todas ({stats.totalFamilies})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('multi_class')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterMode === 'multi_class'
                  ? 'bg-white text-slate-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Outras Turmas ({stats.multiClassFamilies})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('with_alerts')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterMode === 'with_alerts'
                  ? 'bg-rose-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Com Alertas ({stats.familiesWithAlerts})
            </button>
            {stats.threePlusFamilies > 0 && (
              <button
                type="button"
                onClick={() => setFilterMode('three_plus')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterMode === 'three_plus'
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                3+ Filhos ({stats.threePlusFamilies})
              </button>
            )}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar mãe, pai, aluno ou turma..."
              className="w-full min-h-[40px] pl-9 pr-8 bg-slate-100 focus:bg-white border border-transparent focus:border-slate-300 rounded-xl text-xs sm:text-sm text-slate-950 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista de Núcleos Familiares */}
      {filteredFamilies.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-2">
          <Users className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-sm sm:text-base font-bold text-slate-950">
            {stats.totalFamilies === 0
              ? 'Nenhuma família com múltiplos alunos identificada ainda'
              : 'Nenhuma família encontrada para este filtro'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            {stats.totalFamilies === 0
              ? 'Quando a base escolar possuir estudantes cadastrados com o mesmo nome de mãe, pai ou responsável, eles serão agrupados automaticamente aqui.'
              : 'Tente alterar os filtros acima ou limpar o termo de busca.'}
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            compact ? '' : 'xl:grid-cols-2'
          } gap-4`}
        >
          {filteredFamilies.map((fam) => {
            const firstStudentNames = fam.members
              .map((m) => m.student.name.split(' ')[0])
              .join(', ');
            const waLinks = buildWhatsAppLinksFromPhoneString(
              fam.rawPhonesJoined,
              firstStudentNames,
              `Olá! Somos da ${SCHOOL_NAME}. Gostaríamos de conversar sobre a frequência e acompanhamento escolar de ${firstStudentNames}.`
            );
            const primaryWa = waLinks[0];
            const cleanTel = (fam.phones[0] || '').replace(/\D/g, '');

            return (
              <article
                key={fam.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-2xs min-w-0 ${
                  fam.hasAlert
                    ? 'border-rose-200 bg-rose-50/15'
                    : 'border-slate-200/90'
                }`}
              >
                {/* Cabeçalho da Família */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 font-medium">
                        <span className="font-semibold text-emerald-800">
                          {fam.relationSummary}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-semibold text-slate-800">
                          {fam.members.length} estudantes
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Turmas {fam.distinctClassNames.join(', ')}
                        </span>
                        {fam.hasMultipleShifts && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Turnos {fam.distinctShifts.join(' / ')}</span>
                          </>
                        )}
                      </div>

                      {/* Nomes dos Responsáveis Compartilhados */}
                      <div className="space-y-0.5 pt-0.5">
                        {fam.sharedGuardians.map((g, gIdx) => (
                          <p
                            key={`${fam.id}-g-${gIdx}`}
                            className="text-sm font-bold text-slate-950 leading-snug break-words"
                          >
                            <span className="text-xs font-semibold text-slate-500 mr-1.5">
                              {g.roleLabel}:
                            </span>
                            {g.name}
                          </p>
                        ))}
                      </div>

                      {(fam.rawPhonesJoined || fam.addressSummary) && (
                        <p className="text-xs text-slate-600 break-words pt-0.5">
                          {fam.rawPhonesJoined && (
                            <span className="tabular-nums font-medium text-slate-800">
                              Tel: {fam.rawPhonesJoined}
                            </span>
                          )}
                          {fam.rawPhonesJoined && fam.addressSummary && (
                            <span className="mx-1.5" aria-hidden="true">
                              ·
                            </span>
                          )}
                          {fam.addressSummary && <span>{fam.addressSummary}</span>}
                        </p>
                      )}
                    </div>

                    {/* Ações de Contato Direto com a Família */}
                    {primaryWa && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={primaryWa.waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title={`Enviar WhatsApp para ${primaryWa.display}`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                        {cleanTel.length >= 8 && (
                          <a
                            href={`tel:${cleanTel}`}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center justify-center transition-colors cursor-pointer"
                            title={`Ligar para ${fam.phones[0]}`}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {fam.hasAlert && (
                    <p className="text-xs font-semibold text-rose-800">
                      Atenção: {fam.alertCount}{' '}
                      {fam.alertCount === 1
                        ? 'estudante deste núcleo familiar apresenta alerta de frequência ou faltas consecutivas.'
                        : 'estudantes deste núcleo familiar apresentam alerta de frequência ou faltas consecutivas.'}
                    </p>
                  )}
                </div>

                {/* Lista de Estudantes (Divisores sutis, sem caixas aninhadas pesadas) */}
                <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
                  {fam.memberMetrics.map((m) => {
                    const hasConsec = m.consecutiveTier !== 'none';
                    return (
                      <div
                        key={m.student.id}
                        className="py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 min-w-0"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <StudentAvatar
                            student={m.student}
                            size="sm"
                            expandableOnClick={false}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs sm:text-sm font-semibold text-slate-950 truncate">
                                {m.student.name}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-600 tabular-nums">
                              {onSelectClass ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectClass(m.cls)}
                                  className="font-semibold text-[#0b3b8c] hover:underline cursor-pointer"
                                >
                                  Turma {m.cls.name}
                                </button>
                              ) : (
                                <span className="font-semibold text-slate-800">
                                  Turma {m.cls.name}
                                </span>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>{m.cls.shift.replace('Turno ', '')}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={`font-semibold ${
                                  m.isBelowLegal ? 'text-rose-700' : 'text-emerald-800'
                                }`}
                              >
                                {m.frequenciaPercent}% freq.
                              </span>
                              {hasConsec && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-semibold text-rose-700">
                                    {m.alertLabel || `${m.consecutiveDays}d seguidas`}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {onOpenStudentGrid && (
                          <button
                            type="button"
                            onClick={() => onOpenStudentGrid(m.student, m.cls)}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                          >
                            <span>Ficha</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface FamiliasMultiplosAlunosModalProps {
  isOpen: boolean;
  onClose: () => void;
  allClasses: ClassGroup[];
  onOpenStudentGrid?: (student: Student, classGroup?: ClassGroup) => void;
  onSelectClass?: (cls: ClassGroup) => void;
}

export const FamiliasMultiplosAlunosModal: React.FC<
  FamiliasMultiplosAlunosModalProps
> = ({ isOpen, onClose, allClasses, onOpenStudentGrid, onSelectClass }) => {
  useModalScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-5 bg-slate-950/60 backdrop-blur-xs animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#f8fafc] w-full max-w-5xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))]"
      >
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#be123c] block">
              Busca Ativa · Inteligência Familiar
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-950 truncate">
              Famílias com Múltiplos Alunos na Escola
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de famílias"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <FamiliasMultiplosAlunosView
            allClasses={allClasses}
            compact
            onOpenStudentGrid={
              onOpenStudentGrid
                ? (st, cls) => {
                    onClose();
                    onOpenStudentGrid(st, cls);
                  }
                : undefined
            }
            onSelectClass={
              onSelectClass
                ? (cls) => {
                    onClose();
                    onSelectClass(cls);
                  }
                : undefined
            }
          />
        </div>

        <div className="bg-white px-4 sm:px-6 py-3 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
