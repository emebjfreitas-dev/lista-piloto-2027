import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ClassGroup, Student, UserRole } from '../types';
import {
  BimesterId2027,
  getStudentBimesterReport,
  OFFICIAL_BIMESTERS_2027,
  StudentBimesterReportRow,
} from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';

interface ListasNominaisScreenProps {
  classes: ClassGroup[];
  userRole: UserRole;
  onUpdateStudentField: (classId: string, updatedStudent: Student) => void;
  onOpenStudentGrid: (
    student: Student,
    classId: string,
    className: string,
    diasLetivos: number
  ) => void;
  onOpenPhotoModal: (student: Student, className: string) => void;
  onOpenStudentPdf: (student: Student, className: string) => void;
  onBack?: () => void;
}

interface EvaluatedRow {
  student: Student;
  cls: ClassGroup;
  rep: StudentBimesterReportRow;
  hasAtestado: boolean;
  isBelowTarget: boolean;
  worstMonthPercent: number;
  worstMonthName: string;
}

export const ListasNominaisScreen: React.FC<ListasNominaisScreenProps> = ({
  classes,
  userRole,
  onOpenStudentGrid,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onBack,
}) => {
  const [selectedBimesterId, setSelectedBimesterId] = useState<BimesterId2027>('5bim');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedSegmentFilter, setSelectedSegmentFilter] = useState<
    'all' | 'fundamental' | 'infantil'
  >('all');
  const [selectedAtestadoFilter, setSelectedAtestadoFilter] = useState<
    'all' | 'com_atestado' | 'sem_atestado'
  >('all');
  const [onlyBelowTarget, setOnlyBelowTarget] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3500);
  };

  const currentBimester = useMemo(
    () =>
      OFFICIAL_BIMESTERS_2027.find((b) => b.id === selectedBimesterId) ||
      OFFICIAL_BIMESTERS_2027[4],
    [selectedBimesterId]
  );

  // Avalia todos os estudantes ativos nas turmas em relação ao bimestre selecionado
  const allEvaluatedRows = useMemo<EvaluatedRow[]>(() => {
    const list: EvaluatedRow[] = [];

    classes.forEach((cls) => {
      cls.students.forEach((student) => {
        const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
        if (sit.includes('BXTR') || sit.includes('TRANSF') || sit.includes('REMAN')) {
          return;
        }

        const rep = getStudentBimesterReport(student, cls, selectedBimesterId);
        const hasAtestado = rep.totalAtestadosBimestre > 0;
        const isBelowTarget =
          rep.isBelowLegalThresholdBimestre || rep.hasAnyMonthBelowThreshold;

        let worstMonthPercent = 100;
        let worstMonthName = rep.monthsBreakdown[0]?.monthName || 'Outubro';
        rep.monthsBreakdown.forEach((mb) => {
          if (mb.frequenciaPercent <= worstMonthPercent) {
            worstMonthPercent = mb.frequenciaPercent;
            worstMonthName = mb.monthName;
          }
        });

        list.push({
          student,
          cls,
          rep,
          hasAtestado,
          isBelowTarget,
          worstMonthPercent,
          worstMonthName,
        });
      });
    });

    return list.sort((a, b) =>
      a.student.name.localeCompare(b.student.name, 'pt-BR', { sensitivity: 'base' })
    );
  }, [classes, selectedBimesterId]);

  const counts = useMemo(() => {
    const belowTarget = allEvaluatedRows.filter((r) => r.isBelowTarget).length;
    return {
      totalEvaluated: allEvaluatedRows.length,
      belowTarget,
    };
  }, [allEvaluatedRows]);

  // Filtra estudantes mantendo suporte a busca por nome, turma, RA, NIS e responsável
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allEvaluatedRows.filter((row) => {
      if (onlyBelowTarget && !row.isBelowTarget) return false;
      if (selectedClassFilter !== 'all' && row.cls.id !== selectedClassFilter) {
        return false;
      }
      if (selectedSegmentFilter === 'fundamental' && row.rep.isEducacaoInfantil) {
        return false;
      }
      if (selectedSegmentFilter === 'infantil' && !row.rep.isEducacaoInfantil) {
        return false;
      }
      if (selectedAtestadoFilter === 'com_atestado' && !row.hasAtestado) {
        return false;
      }
      if (selectedAtestadoFilter === 'sem_atestado' && row.hasAtestado) {
        return false;
      }

      if (q !== '') {
        const guardian = `${row.student.filiacao1 || ''} ${row.student.guardianName || ''}`.toLowerCase();
        const match =
          row.student.name.toLowerCase().includes(q) ||
          row.cls.name.toLowerCase().includes(q) ||
          (row.student.ra && row.student.ra.toLowerCase().includes(q)) ||
          (row.student.nis && row.student.nis.toLowerCase().includes(q)) ||
          guardian.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [
    allEvaluatedRows,
    onlyBelowTarget,
    selectedClassFilter,
    selectedSegmentFilter,
    selectedAtestadoFilter,
    searchQuery,
  ]);

  // Agrupamento automático por turma (mantendo ordem das turmas e ordem alfabética A-Z dentro de cada turma)
  const groupedByClass = useMemo(() => {
    const classOrderMap = new Map<string, number>();
    classes.forEach((c, idx) => classOrderMap.set(c.id, idx));

    const groupsMap = new Map<string, { cls: ClassGroup; rows: EvaluatedRow[] }>();

    filteredRows.forEach((row) => {
      const existing = groupsMap.get(row.cls.id);
      if (existing) {
        existing.rows.push(row);
      } else {
        groupsMap.set(row.cls.id, { cls: row.cls, rows: [row] });
      }
    });

    return Array.from(groupsMap.values()).sort((a, b) => {
      const idxA = classOrderMap.get(a.cls.id) ?? 999;
      const idxB = classOrderMap.get(b.cls.id) ?? 999;
      if (idxA !== idxB) return idxA - idxB;
      return a.cls.name.localeCompare(b.cls.name, 'pt-BR', { numeric: true });
    });
  }, [classes, filteredRows]);

  const handleExportXLS = () => {
    if (groupedByClass.length === 0) {
      showToast('Nenhum estudante listado no filtro atual para exportar.');
      return;
    }

    const orderedRows: EvaluatedRow[] = groupedByClass.flatMap((g) => g.rows);
    const exportObjects = orderedRows.map((r, index) => {
      const monthCols: Record<string, string | number> = {};
      r.rep.monthsBreakdown.forEach((mb) => {
        const shortM = mb.monthName.slice(0, 3).toUpperCase();
        monthCols[`${shortM} (% PRESENÇA)`] = `${mb.frequenciaPercent}%`;
        monthCols[`${shortM} (FALTAS / ATEST.)`] = `${mb.faltas}F / ${mb.atestados}A`;
      });

      return {
        'ORDEM': index + 1,
        'TURMA': r.cls.name,
        'ESTUDANTE (A-Z)': r.student.name,
        'PERÍODO': r.cls.shift.replace('Turno ', '').toUpperCase(),
        'ETAPA DE ENSINO': r.rep.isEducacaoInfantil
          ? 'EDUCAÇÃO INFANTIL'
          : 'ENSINO FUNDAMENTAL',
        'META MÍNIMA LEGAL': `≥${r.rep.minLegalPresencePercent}%`,
        'BIMESTRE DE REFERÊNCIA': currentBimester.shortLabel,
        ...monthCols,
        'FALTAS NO BIMESTRE': r.rep.totalFaltasBimestre,
        'ATESTADOS NO BIMESTRE': r.rep.totalAtestadosBimestre,
        'POSSUI ATESTADO?': r.hasAtestado
          ? `SIM (${r.rep.totalAtestadosBimestre} atestado(s))`
          : 'NÃO (Sem atestado)',
        '% PRESENÇA BIMESTRE': `${r.rep.frequenciaBimestrePercent}%`,
        'PIOR MÊS NO BIMESTRE': `${r.worstMonthName} (${r.worstMonthPercent}%)`,
        'STATUS META': r.isBelowTarget
          ? `ABAIXO DA META (<${r.rep.minLegalPresencePercent}%)`
          : `DENTRO DA META (≥${r.rep.minLegalPresencePercent}%)`,
        'RA': `${r.student.ra}-${r.student.digRa}`,
        'NIS': r.student.nis || '—',
        'RESPONSÁVEL / TELEFONE': `${r.student.filiacao1 || r.student.guardianName || '—'} (${r.student.telefones || r.student.guardianPhone || '—'})`,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportObjects);
    const safeSheetName = `Bolsa_${currentBimester.id.toUpperCase()}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    const fileName = `Listas_Nominais_${currentBimester.id}_2027.xls`;
    XLSX.writeFile(wb, fileName, { bookType: 'biff8' });
    showToast(`Arquivo ${fileName} exportado (${exportObjects.length} estudantes por turma).`);
  };

  if (userRole !== 'admin') {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 bg-white rounded-3xl text-center space-y-3 shadow-2xs">
        <span className="material-symbols-outlined text-[36px] text-[#ff3b30]">
          lock
        </span>
        <h2 className="text-lg font-semibold text-[#111827] tracking-tight">
          Acesso Restrito à Gestão / Secretaria
        </h2>
        <p className="text-sm text-[#6e6e73] leading-relaxed">
          As listas nominais consolidadas são exclusivas do perfil Administrador.
        </p>
      </div>
    );
  }

  const hasActiveFilters =
    selectedClassFilter !== 'all' ||
    selectedSegmentFilter !== 'all' ||
    selectedAtestadoFilter !== 'all' ||
    !onlyBelowTarget ||
    searchQuery.trim() !== '';

  return (
    <div className="flex flex-col w-full min-w-0 max-w-6xl mx-auto space-y-5 pb-16 animate-gentle-fade">
      {toastMsg && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-100">
          <div className="bg-[#1d1d1f] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-[19px] text-[#28cd41] shrink-0">
              check_circle
            </span>
            <p className="text-sm font-medium leading-snug break-words min-w-0">{toastMsg}</p>
          </div>
        </div>
      )}

      {/* CABEÇALHO ULTRA-MINIMALISTA SEM CONTORNOS (SF PRO) */}
      <header className="space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Voltar"
                className="w-10 h-10 rounded-full bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] flex items-center justify-center cursor-pointer transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0f172a] tracking-[-0.028em] leading-tight break-words">
                Listas Nominais
              </h1>
              <p className="mt-0.5 text-xs sm:text-[13px] font-medium text-[#64748b] tabular-nums tracking-[-0.008em]">
                {currentBimester.shortLabel} · {filteredRows.length}{' '}
                {filteredRows.length === 1 ? 'estudante' : 'estudantes'} em {groupedByClass.length}{' '}
                {groupedByClass.length === 1 ? 'turma' : 'turmas'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Seletor de Modo: Grade vs Lista */}
            <div className="flex items-center gap-1 p-1 bg-[#f1f5f9] rounded-2xl">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#0b3b8c] shadow-2xs'
                    : 'text-[#64748b] hover:text-[#0f172a]'
                }`}
                title="Exibir grade de cartões"
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                <span className="hidden sm:inline">Grade</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'compact'
                    ? 'bg-white text-[#0b3b8c] shadow-2xs'
                    : 'text-[#64748b] hover:text-[#0f172a]'
                }`}
                title="Exibir lista compacta"
              >
                <span className="material-symbols-outlined text-[16px]">view_list</span>
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportXLS}
              className="min-h-[40px] px-3.5 rounded-2xl bg-[#0b3b8c] hover:bg-[#0052cc] text-white font-semibold text-xs sm:text-[13px] tracking-[-0.01em] flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] px-3.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-xs sm:text-[13px] tracking-[-0.01em] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span className="hidden min-[400px]:inline">Imprimir</span>
            </button>
          </div>
        </div>

        {/* BARRA DE BUSCA RÁPIDA NO TOPO (TOTALMENTE SEM CONTORNOS) */}
        <div className="relative min-w-0">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[20px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar estudante por nome, turma, RA, NIS ou responsável..."
            aria-label="Buscar estudante nas listas nominais"
            className="w-full min-h-[48px] pl-11 pr-11 rounded-2xl bg-white text-sm sm:text-[15px] font-normal tracking-[-0.012em] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:bg-[#f8fafc] shadow-2xs transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center text-[#64748b] hover:text-[#0f172a] cursor-pointer"
              aria-label="Limpar busca"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* FILTROS DISCRETOS SEM CONTORNOS (ZERO PILLS) */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <select
            value={selectedBimesterId}
            onChange={(e) => setSelectedBimesterId(e.target.value as BimesterId2027)}
            aria-label="Bimestre de referência"
            className="min-h-[38px] px-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-xs sm:text-[13px] cursor-pointer focus:outline-none transition-colors"
          >
            {OFFICIAL_BIMESTERS_2027.map((bim) => (
              <option key={bim.id} value={bim.id}>
                {bim.shortLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyBelowTarget((prev) => !prev)}
            className={`min-h-[38px] px-3.5 rounded-2xl text-xs sm:text-[13px] font-semibold cursor-pointer transition-colors tabular-nums ${
              onlyBelowTarget
                ? 'bg-[#fee2e2] text-[#991b1b]'
                : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a]'
            }`}
          >
            {onlyBelowTarget
              ? `Abaixo da meta (${counts.belowTarget})`
              : `Todos ativos (${counts.totalEvaluated})`}
          </button>

          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            aria-label="Filtrar por turma"
            className="min-h-[38px] px-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-xs sm:text-[13px] cursor-pointer focus:outline-none transition-colors"
          >
            <option value="all">Todas as turmas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedSegmentFilter}
            onChange={(e) =>
              setSelectedSegmentFilter(e.target.value as 'all' | 'fundamental' | 'infantil')
            }
            aria-label="Filtrar por etapa"
            className="min-h-[38px] px-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-xs sm:text-[13px] cursor-pointer focus:outline-none transition-colors"
          >
            <option value="all">Todas as etapas</option>
            <option value="fundamental">Fundamental (&lt; 75%)</option>
            <option value="infantil">Infantil (&lt; 60%)</option>
          </select>

          <select
            value={selectedAtestadoFilter}
            onChange={(e) =>
              setSelectedAtestadoFilter(
                e.target.value as 'all' | 'com_atestado' | 'sem_atestado'
              )
            }
            aria-label="Filtrar por atestado"
            className="min-h-[38px] px-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-xs sm:text-[13px] cursor-pointer focus:outline-none transition-colors"
          >
            <option value="all">Atestado: todos</option>
            <option value="com_atestado">Com atestado</option>
            <option value="sem_atestado">Sem atestado</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSelectedClassFilter('all');
                setSelectedSegmentFilter('all');
                setSelectedAtestadoFilter('all');
                setOnlyBelowTarget(true);
                setSearchQuery('');
              }}
              className="min-h-[38px] px-3 rounded-2xl text-xs font-semibold text-[#64748b] hover:text-[#0f172a] cursor-pointer transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </header>

      {/* ESTADO VAZIO */}
      {groupedByClass.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center space-y-2 shadow-2xs">
          <span className="material-symbols-outlined text-[36px] text-[#047857]">
            verified
          </span>
          <p className="text-base font-semibold text-[#0f172a] tracking-tight">
            Nenhum estudante encontrado para os filtros selecionados
          </p>
          <p className="text-xs sm:text-sm text-[#64748b]">
            Ajuste os filtros de busca ou alterne para visualizar todos os estudantes ativos.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByClass.map((group) => {
            const isInfantil =
              group.cls.name.toUpperCase().startsWith('GRUPO') ||
              group.cls.grade.toUpperCase().includes('INFANTIL');

            return (
              <section key={group.cls.id} className="space-y-3.5 min-w-0">
                {/* Cabeçalho da Turma */}
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-bold text-[#0f172a] tracking-[-0.024em]">
                      {group.cls.name}
                    </h2>
                    <span className="text-xs font-medium text-[#64748b] tracking-[-0.006em]">
                      {group.cls.shift.replace('Turno ', '')} ·{' '}
                      {isInfantil ? 'Meta legal 60%' : 'Meta legal 75%'}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#64748b] tabular-nums shrink-0">
                    {group.rows.length}{' '}
                    {group.rows.length === 1 ? 'estudante' : 'estudantes'}
                  </span>
                </div>

                {/* MODO 1: GRADE DE CARTÕES DE ESTUDANTES (Foco Prioritário no Nome + SF Pro) */}
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 items-stretch min-w-0">
                    {group.rows.map((row) => {
                      const { student, cls, rep, hasAtestado, isBelowTarget } = row;
                      const hasPdf = Boolean(
                        (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
                          (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
                      );
                      const waList = buildWhatsAppLinksFromPhoneString(
                        student.telefones || student.guardianPhone,
                        student.name
                      );
                      const guardianClean = student.filiacao1 || student.guardianName || '';

                      return (
                        <article
                          key={`${cls.id}-${student.id}`}
                          className={`rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0 transition-colors shadow-2xs ${
                            isBelowTarget
                              ? 'bg-[#fff8f8] hover:bg-[#fff2f2]'
                              : 'bg-white hover:bg-[#fafbfd]'
                          }`}
                        >
                          <div className="space-y-2.5 min-w-0">
                            {/* Topo do Cartão: Nome do Estudante com PRIORIDADE MÁXIMA + Avatar */}
                            <div className="flex items-start gap-3.5 min-w-0">
                              <div
                                onClick={() => onOpenPhotoModal(student, cls.name)}
                                className="shrink-0 cursor-pointer"
                                title="Atualizar foto"
                              >
                                <StudentAvatar
                                  student={student}
                                  size="md"
                                  className="border-0 bg-[#f1f5f9]"
                                  expandableOnClick={false}
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5 min-w-0">
                                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#64748b] tabular-nums tracking-[-0.006em] truncate">
                                    <span>Nº {student.number.toString().padStart(2, '0')}</span>
                                    {student.ra && (
                                      <>
                                        <span aria-hidden="true" className="text-slate-300">·</span>
                                        <span>RA {student.ra}{student.digRa ? `-${student.digRa}` : ''}</span>
                                      </>
                                    )}
                                  </div>
                                  <span
                                    className={`text-[13px] font-bold tabular-nums shrink-0 ${
                                      isBelowTarget ? 'text-[#b42318]' : 'text-[#047857]'
                                    }`}
                                  >
                                    {rep.frequenciaBimestrePercent}%
                                  </span>
                                </div>

                                {/* Nome do Aluno no Topo com Maior Peso e Hierarquia SF Pro */}
                                <h3 className="mt-0.5 text-[17px] font-semibold text-[#0f172a] tracking-[-0.024em] leading-[1.22] break-words">
                                  {student.name}
                                </h3>
                              </div>
                            </div>

                            {/* Metadados SF Pro (Sem Espaços Vazios e Zero-Pills) */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-[#475569] tracking-[-0.008em] tabular-nums">
                              <span
                                className={
                                  rep.totalFaltasBimestre > 0
                                    ? isBelowTarget
                                      ? 'text-[#b42318] font-semibold'
                                      : 'text-[#0f172a] font-semibold'
                                    : ''
                                }
                              >
                                {rep.totalFaltasBimestre} {rep.totalFaltasBimestre === 1 ? 'falta' : 'faltas'}
                              </span>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span>{hasAtestado ? `${rep.totalAtestadosBimestre} atest.` : 'Sem atestado'}</span>
                              {student.nis && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300">·</span>
                                  <span>NIS {student.nis}</span>
                                </>
                              )}
                              {student.rotaOnibus && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300">·</span>
                                  <span className="text-[#0b3b8c] font-semibold">
                                    Rota {student.rotaOnibus.replace(/[^0-9]/g, '') || student.rotaOnibus.split('-')[0].trim()}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Responsável e Contato com Link WhatsApp */}
                            {(guardianClean || waList.length > 0) && (
                              <div className="flex items-center justify-between gap-2 text-[12px] text-[#64748b] min-w-0 tracking-[-0.008em]">
                                <span className="truncate min-w-0">
                                  {guardianClean || 'Responsável'}
                                </span>
                                {waList.length > 0 && (
                                  <a
                                    href={waList[0].waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#047857] hover:underline tabular-nums shrink-0"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">chat</span>
                                    <span>{waList[0].display}</span>
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Detalhamento Mensal no Bimestre */}
                            {rep.monthsBreakdown.length > 0 && (
                              <div className="flex items-center gap-1.5 pt-0.5 text-[11px] font-medium tabular-nums">
                                {rep.monthsBreakdown.map((mb) => (
                                  <span
                                    key={mb.monthName}
                                    className={`px-2 py-0.5 rounded-lg ${
                                      mb.isBelowLegalThreshold
                                        ? 'bg-rose-100/70 text-[#b42318] font-semibold'
                                        : 'bg-slate-100 text-[#475569]'
                                    }`}
                                  >
                                    {mb.monthName.slice(0, 3)}: {mb.frequenciaPercent}% ({mb.faltas}F)
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Ações Rápidas sem Contorno no Rodapé do Cartão */}
                          <div className="grid grid-cols-3 gap-2 pt-1 mt-auto min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenStudentGrid(student, cls.id, cls.name, cls.classesHeld || 20)
                              }
                              className="min-h-[40px] px-2 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              title="Abrir ficha do estudante"
                            >
                              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                                grid_view
                              </span>
                              <span>Ficha</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenPhotoModal(student, cls.name)}
                              className="min-h-[40px] px-2 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              title="Atualizar foto"
                            >
                              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                                photo_camera
                              </span>
                              <span>Foto</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenStudentPdf(student, cls.name)}
                              className={`min-h-[40px] px-2 rounded-2xl font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                                hasPdf
                                  ? 'bg-[#eef4ff] hover:bg-[#e0ebff] text-[#0b3b8c]'
                                  : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#64748b]'
                              }`}
                              title="Abrir PDF nominal"
                            >
                              <span className="material-symbols-outlined text-[16px] shrink-0">
                                picture_as_pdf
                              </span>
                              <span>PDF</span>
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  /* MODO 2: LISTA COMPACTA SEM CONTORNOS */
                  <div className="bg-white rounded-3xl overflow-hidden shadow-2xs divide-y divide-slate-100">
                    {group.rows.map((row, idx) => {
                      const { student, cls, rep, hasAtestado, isBelowTarget } = row;
                      const hasPdf = Boolean(
                        (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
                          (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
                      );

                      return (
                        <div
                          key={`${cls.id}-${student.id}`}
                          className={`w-full min-w-0 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                            idx % 2 === 1 ? 'bg-[#fafbfd]' : 'bg-white'
                          } hover:bg-[#f1f5f9]/70`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <span className="text-xs font-semibold text-[#94a3b8] tabular-nums w-6 text-center shrink-0">
                              {(idx + 1).toString().padStart(2, '0')}
                            </span>

                            <div
                              onClick={() => onOpenPhotoModal(student, cls.name)}
                              className="shrink-0 cursor-pointer"
                              title="Atualizar foto"
                            >
                              <StudentAvatar
                                student={student}
                                size="sm"
                                className="border-0 bg-[#f1f5f9]"
                                expandableOnClick={false}
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <span className="block text-[15px] sm:text-[16px] font-semibold text-[#0f172a] leading-snug break-words tracking-[-0.02em]">
                                {student.name}
                              </span>

                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#64748b] tabular-nums tracking-[-0.006em]">
                                <span>Nº {student.number.toString().padStart(2, '0')}</span>
                                {student.ra && (
                                  <>
                                    <span aria-hidden="true" className="text-slate-300">·</span>
                                    <span>RA {student.ra}{student.digRa ? `-${student.digRa}` : ''}</span>
                                  </>
                                )}
                                {student.nis && (
                                  <>
                                    <span aria-hidden="true" className="text-slate-300">·</span>
                                    <span>NIS {student.nis}</span>
                                  </>
                                )}
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <span className={rep.totalFaltasBimestre > 0 ? 'font-semibold text-[#0f172a]' : ''}>
                                  {rep.totalFaltasBimestre} faltas
                                </span>
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <span>{hasAtestado ? `${rep.totalAtestadosBimestre} atest.` : 'sem atestado'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0">
                            <span
                              className={`text-base font-bold tabular-nums ${
                                isBelowTarget ? 'text-[#b42318]' : 'text-[#047857]'
                              }`}
                            >
                              {rep.frequenciaBimestrePercent}%
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenStudentGrid(student, cls.id, cls.name, cls.classesHeld || 20)
                                }
                                className="min-h-[36px] px-3 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-xs tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span className="material-symbols-outlined text-[15px] text-[#475569]">
                                  grid_view
                                </span>
                                <span>Ficha</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onOpenStudentPdf(student, cls.name)}
                                className={`min-h-[36px] px-3 rounded-xl font-semibold text-xs tracking-[-0.01em] flex items-center gap-1 transition-colors cursor-pointer ${
                                  hasPdf
                                    ? 'bg-[#eef4ff] hover:bg-[#e0ebff] text-[#0b3b8c]'
                                    : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#64748b]'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  picture_as_pdf
                                </span>
                                <span>PDF</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
