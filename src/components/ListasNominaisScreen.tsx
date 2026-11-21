import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import {
  BimesterId2027,
  getStudentBimesterReport,
  OFFICIAL_BIMESTERS_2027,
  StudentBimesterReportRow,
} from '../utils/attendanceRules';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  Folder,
  LayoutDashboard,
  LayoutGrid,
  List,
  Lock,
  MessageCircle,
  PanelsTopLeft,
  Printer,
  Search,
  Users,
  X,
} from 'lucide-react';
import { StudentAvatar } from './StudentAvatar';
import { ModalPortal } from './ui/ModalPortal';
import { PaginationBar } from './ui/PaginationBar';
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

export type SchoolGroupId = 'all' | 'infantil' | 'anos1e2' | 'anos3a5' | 'manha' | 'tarde';

interface SchoolGroupMeta {
  id: SchoolGroupId;
  label: string;
  shortLabel: string;
  description: string;
}

const SCHOOL_GROUPS: SchoolGroupMeta[] = [
  { id: 'all', label: 'Todas as Turmas (40)', shortLabel: 'Todas (40)', description: 'Todas as 40 turmas da escola' },
  { id: 'infantil', label: 'Educação Infantil · G4 e G5 (16)', shortLabel: 'Ed. Infantil (16)', description: 'G4 e G5 (Manhã e Tarde)' },
  { id: 'anos1e2', label: '1º e 2º Anos · Alfabetização (8)', shortLabel: '1º e 2º Anos (8)', description: 'Ciclo de Alfabetização' },
  { id: 'anos3a5', label: '3º ao 5º Ano · Fundamental (12)', shortLabel: '3º ao 5º Ano (12)', description: 'Anos Iniciais do Fundamental' },
  { id: 'manha', label: 'Turno Manhã (20)', shortLabel: 'Manhã (20)', description: 'Turmas do período matutino' },
  { id: 'tarde', label: 'Turno Tarde (20)', shortLabel: 'Tarde (20)', description: 'Turmas do período vespertino' },
];

const isClassInSchoolGroup = (cls: ClassGroup, group: SchoolGroupId): boolean => {
  if (group === 'all') return true;
  const isInfantil =
    cls.name.toUpperCase().startsWith('GRUPO') ||
    cls.grade.toUpperCase().includes('INFANTIL');
  if (group === 'infantil') return isInfantil;
  if (group === 'anos1e2') {
    return (
      !isInfantil &&
      (cls.name.toUpperCase().startsWith('1º') || cls.name.toUpperCase().startsWith('2º'))
    );
  }
  if (group === 'anos3a5') {
    return (
      !isInfantil &&
      (cls.name.toUpperCase().startsWith('3º') ||
        cls.name.toUpperCase().startsWith('4º') ||
        cls.name.toUpperCase().startsWith('5º'))
    );
  }
  if (group === 'manha') return cls.shift === 'Turno Manhã';
  if (group === 'tarde') return cls.shift === 'Turno Tarde';
  return true;
};

export const ListasNominaisScreen: React.FC<ListasNominaisScreenProps> = ({
  classes,
  userRole,
  onOpenStudentGrid,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onBack,
}) => {
  const [selectedBimesterId, setSelectedBimesterId] = useState<BimesterId2027>('5bim');
  const [selectedSchoolGroup, setSelectedSchoolGroup] = useState<SchoolGroupId>('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedAtestadoFilter, setSelectedAtestadoFilter] = useState<
    'all' | 'com_atestado' | 'sem_atestado'
  >('all');
  const [onlyBelowTarget, setOnlyBelowTarget] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const tabsRowRef = useRef<HTMLDivElement>(null);

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

  // Estatísticas em tempo real por turma para exibição direta nas abas
  const classStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { total: number; belowTarget: number; withAtestado: number }
    >();
    classes.forEach((c) => {
      map.set(c.id, { total: 0, belowTarget: 0, withAtestado: 0 });
    });
    allEvaluatedRows.forEach((row) => {
      const cur = map.get(row.cls.id) || { total: 0, belowTarget: 0, withAtestado: 0 };
      cur.total += 1;
      if (row.isBelowTarget) cur.belowTarget += 1;
      if (row.hasAtestado) cur.withAtestado += 1;
      map.set(row.cls.id, cur);
    });
    return map;
  }, [classes, allEvaluatedRows]);

  // Turmas visíveis na barra de abas de acordo com o Grupo Escolar selecionado
  const visibleTabClasses = useMemo(() => {
    return classes.filter((c) => isClassInSchoolGroup(c, selectedSchoolGroup));
  }, [classes, selectedSchoolGroup]);

  // Total de alertas somados dentro do grupo visível
  const totalBelowInVisibleGroup = useMemo(() => {
    let sum = 0;
    visibleTabClasses.forEach((c) => {
      const stats = classStatsMap.get(c.id);
      if (stats) sum += stats.belowTarget;
    });
    return sum;
  }, [visibleTabClasses, classStatsMap]);

  // Turma atualmente selecionada em detalhe (quando não é 'all')
  const activeSelectedClass = useMemo(() => {
    if (selectedClassFilter === 'all') return null;
    return classes.find((c) => c.id === selectedClassFilter) || null;
  }, [classes, selectedClassFilter]);

  // Índice da turma ativa no grupo visível para navegação Anterior / Próxima
  const currentClassIndex = useMemo(() => {
    if (selectedClassFilter === 'all') return -1;
    return visibleTabClasses.findIndex((c) => c.id === selectedClassFilter);
  }, [selectedClassFilter, visibleTabClasses]);

  const handlePrevClass = () => {
    if (visibleTabClasses.length === 0) return;
    if (currentClassIndex <= 0) {
      setSelectedClassFilter(visibleTabClasses[visibleTabClasses.length - 1].id);
    } else {
      setSelectedClassFilter(visibleTabClasses[currentClassIndex - 1].id);
    }
  };

  const handleNextClass = () => {
    if (visibleTabClasses.length === 0) return;
    if (currentClassIndex === -1 || currentClassIndex >= visibleTabClasses.length - 1) {
      setSelectedClassFilter(visibleTabClasses[0].id);
    } else {
      setSelectedClassFilter(visibleTabClasses[currentClassIndex + 1].id);
    }
  };

  const counts = useMemo(() => {
    const belowTarget = allEvaluatedRows.filter((r) => r.isBelowTarget).length;
    return {
      totalEvaluated: allEvaluatedRows.length,
      belowTarget,
    };
  }, [allEvaluatedRows]);

  // Filtra estudantes mantendo suporte à aba ativa, grupo escolar, busca e atestados
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allEvaluatedRows.filter((row) => {
      if (onlyBelowTarget && !row.isBelowTarget) return false;

      // Filtro de aba por turma individual ou por grupo escolar
      if (selectedClassFilter !== 'all') {
        if (row.cls.id !== selectedClassFilter) return false;
      } else if (selectedSchoolGroup !== 'all') {
        if (!isClassInSchoolGroup(row.cls, selectedSchoolGroup)) return false;
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
    selectedSchoolGroup,
    selectedAtestadoFilter,
    searchQuery,
  ]);

  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedBimesterId,
    onlyBelowTarget,
    selectedClassFilter,
    selectedSchoolGroup,
    selectedAtestadoFilter,
    searchQuery,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  // Agrupamento completo para exportação XLS e agrupamento paginado para exibição sem scroll gigante
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

  const orderedFilteredRows = useMemo(
    () => groupedByClass.flatMap((g) => g.rows),
    [groupedByClass]
  );

  const paginatedGroupedByClass = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    const pageRows = orderedFilteredRows.slice(start, start + PAGE_SIZE);
    const groupsMap = new Map<string, { cls: ClassGroup; rows: EvaluatedRow[] }>();
    pageRows.forEach((row) => {
      const existing = groupsMap.get(row.cls.id);
      if (existing) {
        existing.rows.push(row);
      } else {
        groupsMap.set(row.cls.id, { cls: row.cls, rows: [row] });
      }
    });
    return Array.from(groupsMap.values());
  }, [orderedFilteredRows, safePage]);

  const handlePageChange = (nextPage: number) => {
    setCurrentPage(nextPage);
    if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleExportXLS = async () => {
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
        'NIS (BOLSA FAMÍLIA)': r.student.nis || '—',
        'RESPONSÁVEL / TELEFONE': `${r.student.filiacao1 || r.student.guardianName || '—'} (${r.student.telefones || r.student.guardianPhone || '—'})`,
      };
    });

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportObjects);
    const safeSheetName = `Bolsa_${currentBimester.id.toUpperCase()}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    const fileName = `Listas_Nominais_Bolsa_Familia_${currentBimester.id}_2027.xls`;
    XLSX.writeFile(wb, fileName, { bookType: 'biff8' });
    showToast(`Arquivo ${fileName} exportado com sucesso (${exportObjects.length} estudantes).`);
  };

  if (userRole !== 'admin') {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 bg-white rounded-3xl text-center space-y-3 shadow-2xs">
        <Lock className="w-9 h-9 text-[#e11d48] mx-auto" />
        <h2 className="text-lg font-semibold text-[#0f172a] tracking-tight">
          Acesso Restrito à Gestão / Secretaria
        </h2>
        <p className="text-sm text-slate-700 leading-relaxed">
          O acompanhamento nominal do Bolsa Família e condicionalidades LDB é exclusivo da Gestão Escolar.
        </p>
      </div>
    );
  }

  const hasActiveFilters =
    selectedClassFilter !== 'all' ||
    selectedSchoolGroup !== 'all' ||
    selectedAtestadoFilter !== 'all' ||
    !onlyBelowTarget ||
    searchQuery.trim() !== '';

  return (
    <div className="flex flex-col w-full min-w-0 max-w-6xl mx-auto space-y-5 pb-16 animate-gentle-fade">
      {toastMsg && (
        <ModalPortal>
          <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 z-[125] max-w-md mx-auto animate-in fade-in duration-100 pointer-events-none">
            <div className="bg-[#14428c] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-[19px] h-[19px] text-[#28cd41] shrink-0" />
              <p className="text-sm font-medium leading-snug break-words min-w-0">{toastMsg}</p>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* CABEÇALHO DA TELA BOLSA FAMÍLIA */}
      <header className="bg-white rounded-3xl p-4 sm:p-6 shadow-[0_8px_26px_rgba(0,0,0,0.22)] space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Voltar"
                className="w-10 h-10 rounded-full bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] flex items-center justify-center cursor-pointer transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#0f172a] tracking-[-0.028em] leading-tight break-words">
                  Estudantes Beneficiados do Bolsa Família
                </h1>
                <span className="px-2.5 py-0.5 rounded-lg bg-[#fef3c7] text-[#92400e] text-xs font-bold uppercase">
                  MEC / LDB 2027
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-[13px] font-medium text-slate-700 tabular-nums tracking-[-0.008em]">
                {currentBimester.label} · Meta MEC: ≥60% Infantil / ≥75% Fundamental · {filteredRows.length}{' '}
                {filteredRows.length === 1 ? 'estudante' : 'estudantes'} listados
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
                    ? 'bg-white text-[#14428c] shadow-2xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
                title="Exibir grade de cartões"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Grade</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'compact'
                    ? 'bg-white text-[#14428c] shadow-2xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
                title="Exibir lista compacta"
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportXLS}
              className="min-h-[40px] px-3.5 rounded-2xl bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-xs sm:text-[13px] tracking-[-0.01em] flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <Download className="w-[18px] h-[18px]" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] px-3.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-xs sm:text-[13px] tracking-[-0.01em] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-[18px] h-[18px]" />
              <span className="hidden min-[400px]:inline">Imprimir</span>
            </button>
          </div>
        </div>

        {/* BARRA DE BUSCA RÁPIDA (NOME, RA, NIS BOLSA FAMÍLIA, RESPONSÁVEL) */}
        <div className="relative min-w-0">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, RA, NIS (Bolsa Família) ou responsável..."
            aria-label="Buscar estudante nas listas nominais do Bolsa Família"
            className="w-full min-h-[48px] pl-11 pr-11 rounded-2xl bg-[#f1f5f9] focus:bg-[#e2e8f0]/60 text-sm sm:text-[15px] font-normal tracking-[-0.012em] text-slate-950 placeholder:text-slate-600 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer"
              aria-label="Limpar busca"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>

        {/* FILTROS GERAIS: BIMESTRE, STATUS DE ALERTA E ATESTADO */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <select
            value={selectedBimesterId}
            onChange={(e) => setSelectedBimesterId(e.target.value as BimesterId2027)}
            aria-label="Bimestre de referência"
            className="min-h-[38px] px-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-slate-950 font-semibold text-xs sm:text-[13px] cursor-pointer transition-colors"
          >
            {OFFICIAL_BIMESTERS_2027.map((bim) => (
              <option key={bim.id} value={bim.id}>
                {bim.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyBelowTarget((prev) => !prev)}
            className={`min-h-[38px] px-3.5 rounded-2xl text-xs sm:text-[13px] font-semibold cursor-pointer transition-colors tabular-nums ${
              onlyBelowTarget
                ? 'bg-[#fee2e2] text-[#991b1b]'
                : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-slate-950'
            }`}
          >
            {onlyBelowTarget
              ? `Abaixo da Meta MEC (${counts.belowTarget})`
              : `Todos os Alunos Ativos (${counts.totalEvaluated})`}
          </button>

          <select
            value={selectedAtestadoFilter}
            onChange={(e) =>
              setSelectedAtestadoFilter(
                e.target.value as 'all' | 'com_atestado' | 'sem_atestado'
              )
            }
            aria-label="Filtrar por atestado médico"
            className="min-h-[38px] px-3 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-slate-950 font-semibold text-xs sm:text-[13px] cursor-pointer transition-colors"
          >
            <option value="all">Atestado Médico: Todos</option>
            <option value="com_atestado">Com Atestado Registrado</option>
            <option value="sem_atestado">Sem Atestado (Faltas Diretas)</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSelectedSchoolGroup('all');
                setSelectedClassFilter('all');
                setSelectedAtestadoFilter('all');
                setOnlyBelowTarget(true);
                setSearchQuery('');
              }}
              className="min-h-[38px] px-3 rounded-2xl text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </header>

      {/* =====================================================================
          SISTEMA DE ABAS POR TURMA & GRUPOS ESCOLARES (NOVA NAVEGAÇÃO RÁPIDA)
          ===================================================================== */}
      <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-2xs space-y-4 min-w-0">
        {/* Nível 1: Seletor Segmentado de Grupo Escolar */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Folder className="w-[17px] h-[17px] text-[#14428c]" />
              <span>Grupos Escolares</span>
            </span>
            <span className="text-xs font-medium text-slate-700 tabular-nums">
              {visibleTabClasses.length} turmas disponíveis · <strong className="text-rose-800">{totalBelowInVisibleGroup}</strong> em alerta no grupo
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#f1f5f9] rounded-2xl">
            {SCHOOL_GROUPS.map((grp) => {
              const isSelected = selectedSchoolGroup === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => {
                    setSelectedSchoolGroup(grp.id);
                    if (selectedClassFilter !== 'all') {
                      const isStillInGroup = classes
                        .filter((c) => isClassInSchoolGroup(c, grp.id))
                        .some((c) => c.id === selectedClassFilter);
                      if (!isStillInGroup) {
                        setSelectedClassFilter('all');
                      }
                    }
                  }}
                  className={`min-h-[36px] px-3.5 rounded-xl text-xs sm:text-[13px] font-semibold cursor-pointer transition-all duration-100 ${
                    isSelected
                      ? 'bg-[#14428c] text-white shadow-2xs'
                      : 'text-[#475569] hover:text-[#0f172a] hover:bg-white/60'
                  }`}
                  title={grp.description}
                >
                  {grp.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nível 2: Barra de Abas Horizontais por Turma */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
              <PanelsTopLeft className="w-[17px] h-[17px] text-[#14428c]" />
              <span>Abas de Turmas</span>
            </span>
            {selectedClassFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedClassFilter('all')}
                className="text-xs font-semibold text-[#14428c] hover:underline cursor-pointer flex items-center gap-1"
              >
                <LayoutGrid className="w-[15px] h-[15px]" />
                <span>Ver Todas as Turmas Juntas</span>
              </button>
            )}
          </div>

          <div className="relative min-w-0" ref={tabsRowRef}>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scroll-smooth no-scrollbar">
              {/* Aba Consolidada: Todas as Turmas */}
              <button
                type="button"
                onClick={() => setSelectedClassFilter('all')}
                className={`min-h-[44px] px-4 rounded-2xl text-xs sm:text-[13px] font-semibold flex items-center gap-2 shrink-0 cursor-pointer transition-all duration-100 ${
                  selectedClassFilter === 'all'
                    ? 'bg-[#14428c] text-white shadow-xs'
                    : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a]'
                }`}
              >
                <LayoutDashboard className="w-[18px] h-[18px]" />
                <span>Todas ({visibleTabClasses.length})</span>
                {totalBelowInVisibleGroup > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums ${
                      selectedClassFilter === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {totalBelowInVisibleGroup}
                  </span>
                )}
              </button>

              {/* Abas Individuais para Cada Turma */}
              {visibleTabClasses.map((cls) => {
                const isSelected = selectedClassFilter === cls.id;
                const stats = classStatsMap.get(cls.id) || { total: 0, belowTarget: 0, withAtestado: 0 };
                const hasAlert = stats.belowTarget > 0;
                const shiftAbbr = cls.shift === 'Turno Manhã' ? 'M' : 'T';

                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => setSelectedClassFilter(cls.id)}
                    className={`min-h-[44px] px-3.5 rounded-2xl text-xs sm:text-[13px] font-semibold flex items-center gap-2 shrink-0 cursor-pointer transition-all duration-100 ${
                      isSelected
                        ? 'bg-[#14428c] text-white shadow-xs'
                        : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a]'
                    }`}
                  >
                    <span>{cls.turmaAbrev || cls.name}</span>
                    <span
                      className={`text-[11px] font-medium ${
                        isSelected ? 'text-blue-100' : 'text-slate-700'
                      }`}
                    >
                      {shiftAbbr}
                    </span>
                    <span
                      className={`min-w-[20px] px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums text-center ${
                        isSelected
                          ? hasAlert
                            ? 'bg-rose-500 text-white'
                            : 'bg-white/20 text-white'
                          : hasAlert
                          ? 'bg-[#fee2e2] text-[#991b1b]'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                      title={
                        hasAlert
                          ? `${stats.belowTarget} estudante(s) abaixo da meta legal`
                          : 'Nenhum estudante abaixo da meta'
                      }
                    >
                      {stats.belowTarget}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navegação Rápida Anterior / Próxima Turma */}
          {activeSelectedClass && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePrevClass}
                  className="min-h-[38px] px-3 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-slate-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Turma Anterior</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextClass}
                  className="min-h-[38px] px-3 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-slate-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Próxima Turma</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <span>
                  Turma <strong className="text-slate-950">{currentClassIndex + 1}</strong> de{' '}
                  <strong className="text-slate-950">{visibleTabClasses.length}</strong>
                </span>
                <span>·</span>
                <span className="text-slate-950 font-semibold">{activeSelectedClass.name}</span>
                <span>({activeSelectedClass.shift.replace('Turno ', '')})</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* PAINEL HERO DA TURMA ATIVA (QUANDO UMA TURMA INDIVIDUAL ESTÁ SELECIONADA) */}
      {activeSelectedClass && (
        <section className="bg-gradient-to-br from-[#14428c] to-[#0f3370] text-white rounded-3xl p-5 sm:p-6 shadow-[0_14px_34px_-10px_rgba(11,59,140,0.32)] space-y-4 animate-gentle-fade">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/25 text-blue-100 text-xs font-bold uppercase">
                  {activeSelectedClass.shift.replace('Turno ', '').toUpperCase()}
                </span>
                {activeSelectedClass.room && (
                  <span className="text-xs text-slate-200">Sala {activeSelectedClass.room}</span>
                )}
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-200">
                  {activeSelectedClass.name.toUpperCase().startsWith('GRUPO') ||
                  activeSelectedClass.grade.toUpperCase().includes('INFANTIL')
                    ? 'Meta LDB Educação Infantil: ≥ 60%'
                    : 'Meta LDB Ensino Fundamental: ≥ 75%'}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {activeSelectedClass.name}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                Regente PEB I: <strong className="text-white">{activeSelectedClass.teacherName || 'Não informado'}</strong>
              </p>
            </div>

            {/* Contadores da Turma e Alternância Rápida de Visualização */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setOnlyBelowTarget(true)}
                className={`min-h-[42px] px-4 rounded-2xl text-xs sm:text-[13px] font-semibold cursor-pointer transition-all duration-100 flex items-center gap-2 ${
                  onlyBelowTarget
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'bg-white/10 hover:bg-white/20 text-slate-200'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Apenas em Alerta ({classStatsMap.get(activeSelectedClass.id)?.belowTarget || 0})</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyBelowTarget(false)}
                className={`min-h-[42px] px-4 rounded-2xl text-xs sm:text-[13px] font-semibold cursor-pointer transition-all duration-100 flex items-center gap-2 ${
                  !onlyBelowTarget
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-white/10 hover:bg-white/20 text-slate-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Todos da Turma ({classStatsMap.get(activeSelectedClass.id)?.total || 0})</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ESTADO VAZIO */}
      {groupedByClass.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center space-y-3 shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#047857] flex items-center justify-center mx-auto">
            <BadgeCheck className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#0f172a]">
            {activeSelectedClass
              ? `A turma ${activeSelectedClass.name} está 100% regular!`
              : 'Nenhum estudante encontrado para os filtros selecionados'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-700 max-w-md mx-auto leading-relaxed">
            {activeSelectedClass
              ? `Todos os ${classStatsMap.get(activeSelectedClass.id)?.total || 0} estudantes desta turma cumpriram a meta de presença no ${currentBimester.label}.`
              : 'Ajuste os filtros de busca ou alterne para visualizar todos os estudantes ativos.'}
          </p>
          {activeSelectedClass && onlyBelowTarget && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setOnlyBelowTarget(false)}
                className="min-h-[40px] px-5 rounded-2xl bg-[#14428c] hover:bg-[#0f3370] text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                Ver todos os {classStatsMap.get(activeSelectedClass.id)?.total || 0} estudantes desta turma
              </button>
            </div>
          )}
        </div>
      ) : (
        <div ref={listTopRef} className="space-y-6 scroll-mt-24">
          {paginatedGroupedByClass.map((group) => {
            const isInfantil =
              group.cls.name.toUpperCase().startsWith('GRUPO') ||
              group.cls.grade.toUpperCase().includes('INFANTIL');

            return (
              <section key={group.cls.id} className="space-y-3.5 min-w-0">
                {/* Cabeçalho da Turma no modo consolidado */}
                {selectedClassFilter === 'all' && (
                  <div className="flex items-baseline justify-between gap-2 px-1">
                    <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-bold text-[#0f172a] tracking-[-0.024em]">
                        {group.cls.name}
                      </h2>
                      <span className="text-xs font-medium text-slate-700 tracking-[-0.006em]">
                        {group.cls.shift.replace('Turno ', '')} ·{' '}
                        {isInfantil ? 'Meta legal 60%' : 'Meta legal 75%'}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                      {group.rows.length}{' '}
                      {group.rows.length === 1 ? 'estudante' : 'estudantes'}
                    </span>
                  </div>
                )}

                {/* MODO 1: GRADE DE CARTÕES DE ESTUDANTES */}
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
                          className={`rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0 card-interactive shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] ${
                            isBelowTarget
                              ? 'bg-[#fff1f2] hover:bg-[#ffe4e6]'
                              : 'bg-white hover:bg-[#f3f6fb]'
                          }`}
                        >
                          <div className="space-y-2.5 min-w-0">
                            {/* Topo do Cartão: Nome do Estudante + Avatar */}
                            <div className="flex items-start gap-3.5 min-w-0">
                              <StudentAvatar
                                student={student}
                                size="lg"
                                onUploadPhotoClick={() => onOpenPhotoModal(student, cls.name)}
                                className="bg-[#eef3f9]"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5 min-w-0">
                                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 tabular-nums tracking-[-0.006em] truncate">
                                    <span>Nº {student.number.toString().padStart(2, '0')}</span>
                                    {student.ra && (
                                      <>
                                        <span aria-hidden="true" className="text-slate-600">·</span>
                                        <span>RA {student.ra}{student.digRa ? `-${student.digRa}` : ''}</span>
                                      </>
                                    )}
                                  </div>
                                  <span
                                    className={`text-[13px] font-bold tabular-nums shrink-0 ${
                                      isBelowTarget ? 'text-[#be123c]' : 'text-[#047857]'
                                    }`}
                                  >
                                    {rep.frequenciaBimestrePercent}%
                                  </span>
                                </div>

                                <h3 className="mt-0.5 text-[17px] font-semibold text-slate-950 tracking-[-0.024em] leading-[1.22] break-words">
                                  {student.name}
                                </h3>
                              </div>
                            </div>

                            {/* Metadados SF Pro */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-slate-700 tracking-[-0.008em] tabular-nums">
                              <span
                                className={
                                  rep.totalFaltasBimestre > 0
                                    ? isBelowTarget
                                      ? 'text-[#be123c] font-semibold'
                                      : 'text-slate-950 font-semibold'
                                    : ''
                                }
                              >
                                {rep.totalFaltasBimestre} {rep.totalFaltasBimestre === 1 ? 'falta' : 'faltas'}
                              </span>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span>{hasAtestado ? `${rep.totalAtestadosBimestre} atest.` : 'Sem atestado'}</span>
                              {student.nis && (
                                <>
                                  <span aria-hidden="true" className="text-slate-600">·</span>
                                  <span className="text-amber-950 font-semibold">NIS {student.nis}</span>
                                </>
                              )}
                            </div>

                            {/* Responsável e Contato com Link WhatsApp */}
                            {(guardianClean || waList.length > 0) && (
                              <div className="flex items-center justify-between gap-2 text-[12px] text-slate-700 min-w-0 tracking-[-0.008em]">
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
                                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
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
                                        ? 'bg-rose-100/70 text-[#be123c] font-semibold'
                                        : 'bg-slate-100 text-[#475569]'
                                    }`}
                                  >
                                    {mb.monthName.slice(0, 3)}: {mb.frequenciaPercent}% ({mb.faltas}F)
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Ações Rápidas no Rodapé do Cartão */}
                          <div className="grid grid-cols-3 gap-2 pt-1 mt-auto min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenStudentGrid(student, cls.id, cls.name, cls.classesHeld || 20)
                              }
                              className="min-h-[40px] px-2 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              title="Abrir ficha do estudante"
                            >
                              <LayoutGrid className="w-4 h-4 text-[#475569] shrink-0" />
                              <span>Ficha</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenPhotoModal(student, cls.name)}
                              className="min-h-[40px] px-2 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              title="Atualizar foto"
                            >
                              <Camera className="w-4 h-4 text-[#475569] shrink-0" />
                              <span>Foto</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenStudentPdf(student, cls.name)}
                                className={`min-h-[40px] px-2 rounded-2xl font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                                  hasPdf
                                    ? 'bg-[#e8f0fe] hover:bg-[#d4e2fc] text-[#0f3370]'
                                    : 'bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-700'
                                }`}
                                title="Abrir PDF nominal"
                              >
                                <FileText className="w-4 h-4 shrink-0" />
                                <span>PDF</span>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    /* MODO 2: LISTA COMPACTA SEM CONTORNOS */
                    <div className="bg-white rounded-3xl overflow-hidden shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)]">
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
                              idx % 2 === 1 ? 'bg-[#f3f6fb]' : 'bg-white'
                            } hover:bg-[#e8f0fe]`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                              <span className="text-xs font-semibold text-slate-700 tabular-nums w-6 text-center shrink-0">
                                {(idx + 1).toString().padStart(2, '0')}
                              </span>

                              <StudentAvatar
                                student={student}
                                size="md"
                                onUploadPhotoClick={() => onOpenPhotoModal(student, cls.name)}
                                className="bg-[#eef3f9]"
                              />

                              <div className="min-w-0 flex-1">
                                <span className="block text-[15px] sm:text-[16px] font-semibold text-slate-950 leading-snug break-words tracking-[-0.02em]">
                                  {student.name}
                                </span>

                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-700 tabular-nums tracking-[-0.006em]">
                                  <span>Nº {student.number.toString().padStart(2, '0')}</span>
                                  {student.ra && (
                                    <>
                                      <span aria-hidden="true" className="text-slate-600">·</span>
                                      <span>RA {student.ra}{student.digRa ? `-${student.digRa}` : ''}</span>
                                    </>
                                  )}
                                  {student.nis && (
                                    <>
                                      <span aria-hidden="true" className="text-slate-600">·</span>
                                      <span className="text-amber-950 font-semibold">NIS {student.nis}</span>
                                    </>
                                  )}
                                  <span aria-hidden="true" className="text-slate-600">·</span>
                                  <span className={rep.totalFaltasBimestre > 0 ? 'font-semibold text-slate-950' : ''}>
                                    {rep.totalFaltasBimestre} faltas
                                  </span>
                                  <span aria-hidden="true" className="text-slate-600">·</span>
                                  <span>{hasAtestado ? `${rep.totalAtestadosBimestre} atest.` : 'sem atestado'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0">
                              <span
                                className={`text-base font-bold tabular-nums ${
                                  isBelowTarget ? 'text-[#be123c]' : 'text-[#047857]'
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
                                  className="min-h-[36px] px-3 rounded-xl bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-950 font-semibold text-xs tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <LayoutGrid className="w-[15px] h-[15px] text-slate-700" />
                                  <span>Ficha</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => onOpenStudentPdf(student, cls.name)}
                                  className={`min-h-[36px] px-3 rounded-xl font-semibold text-xs tracking-[-0.01em] flex items-center gap-1 transition-colors cursor-pointer ${
                                    hasPdf
                                      ? 'bg-[#e8f0fe] hover:bg-[#d4e2fc] text-[#0f3370]'
                                      : 'bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-700'
                                  }`}
                                >
                                  <FileText className="w-[15px] h-[15px]" />
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

          <PaginationBar
            currentPage={safePage}
            totalItems={orderedFilteredRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            itemLabel="estudantes"
          />
        </div>
      )}
    </div>
  );
};
