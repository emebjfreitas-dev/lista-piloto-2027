import React, { useState, useMemo } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import {
  CLASS_EXPORT_COLUMNS,
  CLASS_EXPORT_PRESETS,
  DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  ClassExportCategory,
  ClassExportSortOrder,
  ClassExportStatusFilter,
  buildCustomClassExportPreview,
  downloadClassCustomXLS,
} from '../services/db';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentAttendanceMetrics } from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';
import { OFFICIAL_FOLDER_NAME } from '../services/googleSheetsApi';

type ViewMode = 'grid' | 'compact' | 'table';
type StatusFilter = 'all' | 'ativos' | 'movimentados' | 'alerta';

interface DetalhesTurmaScreenProps {
  classGroup: ClassGroup;
  assignedClasses?: ClassGroup[];
  onSwitchAssignedClass?: (cls: ClassGroup) => void;
  userRole?: UserRole;
  isMainAdminAccount?: boolean;
  onReturnToAdminMode?: () => void;
  canLaunchAttendance?: boolean;
  onGoToMonthlyAttendance: () => void;
  onGoToMonthlySummary: () => void;
  onOpenStudentList: () => void;
  onOpenNotes: () => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onNavigateToSheet: () => void;
  onBackToClasses: () => void;
}

export const DetalhesTurmaScreen: React.FC<DetalhesTurmaScreenProps> = ({
  classGroup,
  assignedClasses = [],
  onSwitchAssignedClass,
  userRole = 'admin',
  onGoToMonthlySummary,
  onOpenStudentGrid,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onBackToClasses,
}) => {
  const [searchStudent, setSearchStudent] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Estado do Configurador de Download .XLS da Turma (Colunas, Campos e Ordem)
  const [isExportXlsModalOpen, setIsExportXlsModalOpen] = useState(false);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('emeb_turma_xls_columns_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CLASS_EXPORT_COLUMN_IDS;
  });
  const [exportSortBy, setExportSortBy] = useState<ClassExportSortOrder>('number_asc');
  const [exportStatusFilter, setExportStatusFilter] =
    useState<ClassExportStatusFilter>('all');
  const [includeSummarySheet, setIncludeSummarySheet] = useState<boolean>(true);
  const [exportFileFormat, setExportFileFormat] = useState<'xls' | 'xlsx'>('xls');
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [exportSuccessToast, setExportSuccessToast] = useState<string | null>(null);

  const saveSelectedColumns = (nextCols: string[]) => {
    setSelectedColumnIds(nextCols);
    try {
      localStorage.setItem('emeb_turma_xls_columns_v1', JSON.stringify(nextCols));
    } catch {
      // ignore
    }
  };

  const handleToggleColumn = (colId: string) => {
    if (selectedColumnIds.includes(colId)) {
      if (selectedColumnIds.length <= 1) return; // Keep at least 1 column
      saveSelectedColumns(selectedColumnIds.filter((id) => id !== colId));
    } else {
      saveSelectedColumns([...selectedColumnIds, colId]);
    }
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const next = [...selectedColumnIds];
    const [removed] = next.splice(index, 1);
    if (direction === 'up' && index > 0) {
      next.splice(index - 1, 0, removed);
    } else if (direction === 'down' && index < selectedColumnIds.length - 1) {
      next.splice(index + 1, 0, removed);
    } else if (direction === 'top') {
      next.unshift(removed);
    } else if (direction === 'bottom') {
      next.push(removed);
    } else {
      return;
    }
    saveSelectedColumns(next);
  };

  const handleExecuteDownloadXLS = () => {
    downloadClassCustomXLS(classGroup, {
      columnIds: selectedColumnIds,
      sortBy: exportSortBy,
      statusFilter: exportStatusFilter,
      includeSummarySheet,
      fileFormat: exportFileFormat,
    });
    setIsExportXlsModalOpen(false);
    setExportSuccessToast(
      `Planilha_${classGroup.name.replace(/\s+/g, '_')}_2027.${exportFileFormat} baixada com ${selectedColumnIds.length} colunas!`
    );
    window.setTimeout(() => setExportSuccessToast(null), 4000);
  };

  const diasLetivosMes = classGroup.classesHeld || 20;
  const isInfantilClass =
    classGroup.name.toUpperCase().startsWith('GRUPO') ||
    classGroup.grade.toUpperCase().includes('INFANTIL');
  const minLegalPresence = isInfantilClass ? 60 : 75;

  // Strict numerical ordering by Nº da chamada (1, 2, 3...)
  const orderedStudents = useMemo(() => {
    return [...classGroup.students].sort((a, b) => a.number - b.number);
  }, [classGroup.students]);

  // Complete Top Class Summary (Resumo da Alta da Turma: Ativos, Feminino, Masculino, Transferidos, Remanejados, Presença e Faltas)
  const classSummary = useMemo(() => {
    let ativos = 0;
    let feminino = 0;
    let masculino = 0;
    let transferidos = 0;
    let remanejados = 0;
    let pcdCount = 0;
    let alertaLegalCount = 0;
    let somaDiasMatriculados = 0;
    let somaPresencas = 0;
    let somaFaltas = 0;
    let somaAtestados = 0;

    orderedStudents.forEach((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const gen = (s.genero || '').toUpperCase().trim();
      if (sit.includes('BXTR') || sit.includes('TRANSF')) {
        transferidos++;
      } else if (sit.includes('REMAN') || sit.includes('RM')) {
        remanejados++;
      } else {
        ativos++;
      }

      if (gen.startsWith('F')) feminino++;
      else if (gen.startsWith('M')) masculino++;

      if (s.deficiencia && s.deficiencia.trim().length > 0) pcdCount++;

      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      if (m.isBelowLegalThreshold) alertaLegalCount++;

      somaDiasMatriculados += m.diasLetivosMatriculados;
      somaPresencas += m.presencas;
      somaFaltas += m.faltas;
      somaAtestados += m.atestados;
    });

    const pctPresencaTotal =
      somaDiasMatriculados > 0
        ? Math.round((somaPresencas / somaDiasMatriculados) * 100)
        : 100;
    const pctFaltaTotal =
      somaDiasMatriculados > 0
        ? Math.round((somaFaltas / somaDiasMatriculados) * 100)
        : 0;

    return {
      totalMatriculados: orderedStudents.length,
      ativos,
      feminino,
      masculino,
      transferidos,
      remanejados,
      pcdCount,
      alertaLegalCount,
      somaDiasMatriculados,
      somaPresencas,
      somaFaltas,
      somaAtestados,
      pctPresencaTotal,
      pctFaltaTotal,
    };
  }, [orderedStudents, diasLetivosMes]);

  const filteredStudents = useMemo(() => {
    const q = searchStudent.toLowerCase().trim();
    return orderedStudents.filter((s) => {
      const matchesQuery =
        q === '' ||
        s.name.toLowerCase().includes(q) ||
        s.number.toString().padStart(2, '0').includes(q) ||
        (s.ra && s.ra.toLowerCase().includes(q)) ||
        (s.filiacao1 && s.filiacao1.toLowerCase().includes(q)) ||
        (s.filiacao2 && s.filiacao2.toLowerCase().includes(q));
      if (!matchesQuery) return false;

      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const isMov =
        sit.includes('BXTR') ||
        sit.includes('TRANSF') ||
        sit.includes('REMAN') ||
        sit.includes('RM');

      if (statusFilter === 'ativos') return !isMov;
      if (statusFilter === 'movimentados') return isMov;
      if (statusFilter === 'alerta') {
        const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
        return m.isBelowLegalThreshold;
      }
      return true;
    });
  }, [orderedStudents, searchStudent, statusFilter, diasLetivosMes]);

  return (
    <div className="flex flex-col w-full max-w-xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto space-y-4 pb-28 animate-gentle-fade">
      {/* Se a professora PEB I tiver 2 ou mais turmas vinculadas, seletor estilo Segmented Control iOS */}
      {userRole === 'usuario' && assignedClasses.length > 1 && onSwitchAssignedClass && (
        <section className="bg-white/90 backdrop-blur-md rounded-2xl p-3 border border-black/[0.06] flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-[#005035]">
              swap_horiz
            </span>
            <span className="text-[0.8rem] font-bold text-[#003440]">
              Suas Turmas ({assignedClasses.length}):
            </span>
          </div>
          <div className="ios-segmented">
            {assignedClasses.map((cls) => {
              const isSelected = cls.id === classGroup.id;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => onSwitchAssignedClass(cls)}
                  className={`ios-segmented-item ${
                    isSelected ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  {cls.name} ({cls.shift.replace('Turno ', '')})
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ALTA DA TURMA: Cabeçalho iOS Clean + Quadro Docente Oficial + Resumo Completo de Estudantes */}
      <section className="card-welcoming bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {classGroup.turmaAbrev && (
                <span className="text-[0.74rem] font-black uppercase tracking-wider text-white bg-[#003440] px-2.5 py-0.5 rounded-lg font-mono">
                  {classGroup.turmaAbrev}
                </span>
              )}
              <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#005035] bg-[#eaf6ef] px-2.5 py-0.5 rounded-full">
                {classGroup.shift} · {classGroup.room}
              </span>
              {classGroup.classeSedCode && (
                <span className="text-[0.72rem] font-mono font-bold text-[#004e64] bg-[#e6f4f8] px-2.5 py-0.5 rounded-full">
                  CLASSE SED: {classGroup.classeSedCode}
                </span>
              )}
              <span className="text-[0.72rem] font-semibold text-[#5a676b] bg-[#f4f6f5] px-2.5 py-0.5 rounded-full">
                Mínimo Legal: {minLegalPresence}% ({isInfantilClass ? 'Ed. Infantil' : 'Ens. Fundamental'})
              </span>
            </div>
            <h1 className="text-[1.75rem] sm:text-[2rem] font-extrabold text-[#003440] tracking-tight leading-tight mt-1">
              Turma {classGroup.name}
            </h1>
            <p className="text-[0.84rem] text-[#5a676b] font-medium">
              {classGroup.sedClassName
                ? `${classGroup.sedClassName} · Qtd Prevista SED: ${classGroup.sedExpectedStudents ?? classSummary.totalMatriculados}`
                : `${classGroup.grade} · ${classGroup.room}`}{' '}
              · {diasLetivosMes} dias letivos no mês
            </p>
          </div>

          {/* Botões superiores discretos estilo iOS (Sem botão redundante de preencher faltas, que já fica no rodapé) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onGoToMonthlySummary}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#f2f4f3] hover:bg-[#e5e9e7] text-[#003440] font-semibold text-[0.8rem] flex items-center gap-1.5 cursor-pointer transition-all active:scale-97"
            >
              <span className="material-symbols-outlined text-[18px] text-[#005035]">
                assessment
              </span>
              <span>Relatório Bimestral / Bolsa Família</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExportXlsModalOpen(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#005035] hover:bg-[#003d28] text-white font-bold text-[0.82rem] flex items-center gap-2 cursor-pointer shadow-xs transition-all active:scale-97"
            >
              <span className="material-symbols-outlined text-[19px]">download</span>
              <span>Baixar Planilha (.xls)</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[0.68rem] font-extrabold">
                Colunas &amp; Ordem
              </span>
            </button>

            {userRole !== 'usuario' && (
              <button
                type="button"
                onClick={onBackToClasses}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#f2f4f3] hover:bg-[#e5e9e7] text-[#3c3c43] font-semibold text-[0.8rem] flex items-center gap-1.5 cursor-pointer transition-all active:scale-97"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back_ios_new</span>
                <span>39 Turmas</span>
              </button>
            )}
          </div>
        </div>

        {/* Quadro Docente Oficial da Turma: Professor(a) Regente PEB I + Especialistas PEB II (Arte, Educação Física e Língua Inglesa) */}
        {(classGroup.teacherName || classGroup.artTeacher || classGroup.peTeacher || classGroup.englishTeacher) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-black/[0.06]">
            <div className="rounded-2xl bg-[#eaf6ef]/70 border border-[#005035]/20 p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#005035] text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">school</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.63rem] font-extrabold uppercase tracking-wider text-[#005035]">
                    {classGroup.pronoun || 'PROFESSORA'} REGENTE (PEB I)
                  </span>
                  {classGroup.teacherFirstName && (
                    <span className="px-1.5 py-0.2 rounded bg-[#005035]/15 text-[#005035] text-[0.62rem] font-black">
                      {classGroup.teacherFirstName}
                    </span>
                  )}
                </div>
                <p className="text-[0.8rem] font-extrabold text-[#003440] truncate mt-0.5">
                  {classGroup.teacherName || 'Não atribuído'}
                </p>
                {classGroup.teacherEmail && (
                  <p className="text-[0.66rem] font-mono text-[#436370] truncate">
                    {classGroup.teacherEmail}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-[#fdf7fa] border border-[#8f2d56]/20 p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#8f2d56] text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">palette</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[0.63rem] font-extrabold uppercase tracking-wider text-[#8f2d56] block">
                  ARTE (ESPECIALISTA PEB II)
                </span>
                <p className="text-[0.8rem] font-extrabold text-[#1c1c1e] truncate mt-0.5">
                  {classGroup.artTeacher || '—'}
                </p>
                {classGroup.artTeacherEmail && (
                  <p className="text-[0.66rem] font-mono text-[#5a676b] truncate">
                    {classGroup.artTeacherEmail}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-[#f4f9fc] border border-[#004e64]/20 p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#004e64] text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">sports_soccer</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[0.63rem] font-extrabold uppercase tracking-wider text-[#004e64] block">
                  EDUCAÇÃO FÍSICA (PEB II)
                </span>
                <p className="text-[0.8rem] font-extrabold text-[#1c1c1e] truncate mt-0.5">
                  {classGroup.peTeacher || '—'}
                </p>
                {classGroup.peTeacherEmail && (
                  <p className="text-[0.66rem] font-mono text-[#5a676b] truncate">
                    {classGroup.peTeacherEmail}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-[#f5f3ff] border border-[#5b21b6]/20 p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#5b21b6] text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">translate</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[0.63rem] font-extrabold uppercase tracking-wider text-[#5b21b6] block">
                  LÍNGUA INGLESA (PEB II)
                </span>
                <p className="text-[0.8rem] font-extrabold text-[#1c1c1e] truncate mt-0.5">
                  {classGroup.englishTeacher || '—'}
                </p>
                {classGroup.englishTeacherEmail && (
                  <p className="text-[0.66rem] font-mono text-[#5a676b] truncate">
                    {classGroup.englishTeacherEmail}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Grade de Indicadores da Alta da Turma (iOS Health/Summary Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5 pt-2 border-t border-black/[0.06]">
          {/* 1. Ativos */}
          <div className="bg-[#f7f9f8] rounded-2xl p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#005035] block">
              Estudantes Ativos
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.4rem] font-extrabold text-[#003440] tabular-nums">
                {classSummary.ativos}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#6e777a]">
                / {classSummary.totalMatriculados} matr.
              </span>
            </div>
          </div>

          {/* 2. Feminino */}
          <div className="bg-[#fdf7fa] rounded-2xl p-3 border border-[#e5c7d6]/40">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#8f2d56] block">
              Feminino (Meninas)
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.4rem] font-extrabold text-[#8f2d56] tabular-nums">
                {classSummary.feminino}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#8f2d56]/75">
                {classSummary.totalMatriculados > 0
                  ? `${Math.round((classSummary.feminino / classSummary.totalMatriculados) * 100)}%`
                  : '0%'}
              </span>
            </div>
          </div>

          {/* 3. Masculino */}
          <div className="bg-[#f4f9fc] rounded-2xl p-3 border border-[#b9dced]/50">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#004e64] block">
              Masculino (Meninos)
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.4rem] font-extrabold text-[#004e64] tabular-nums">
                {classSummary.masculino}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#004e64]/75">
                {classSummary.totalMatriculados > 0
                  ? `${Math.round((classSummary.masculino / classSummary.totalMatriculados) * 100)}%`
                  : '0%'}
              </span>
            </div>
          </div>

          {/* 4. Transferidos (BXTR) */}
          <div className="bg-[#fff8f6] rounded-2xl p-3 border border-[#ba1a1a]/15">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#ba1a1a] block">
              Transferidos (BXTR)
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.4rem] font-extrabold text-[#ba1a1a] tabular-nums">
                {classSummary.transferidos}
              </span>
              <span className="text-[0.7rem] font-medium text-[#8c5000]">
                baixa transf.
              </span>
            </div>
          </div>

          {/* 5. Remanejados */}
          <div className="bg-[#fffaf2] rounded-2xl p-3 border border-[#d99b26]/25">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#8c5000] block">
              Remanejados
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.4rem] font-extrabold text-[#8c5000] tabular-nums">
                {classSummary.remanejados}
              </span>
              <span className="text-[0.7rem] font-medium text-[#8c5000]/80">
                entre turmas
              </span>
            </div>
          </div>

          {/* 6. Presença Total (% e Qtd) */}
          <div className="bg-[#eaf6ef]/80 rounded-2xl p-3 border border-[#005035]/20">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#005035] block">
              Presença Total
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.4rem] font-extrabold text-[#005035] tabular-nums">
                {classSummary.pctPresencaTotal}%
              </span>
              <span className="text-[0.72rem] font-bold text-[#005035]/80 tabular-nums">
                ({classSummary.somaPresencas}d)
              </span>
            </div>
          </div>

          {/* 7. Falta Total (% e Qtd) */}
          <div className="bg-[#fff8f7] rounded-2xl p-3 border border-[#ba1a1a]/20">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#ba1a1a] block">
              Falta Total
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.4rem] font-extrabold text-[#ba1a1a] tabular-nums">
                {classSummary.somaFaltas}
              </span>
              <span className="text-[0.72rem] font-bold text-[#ba1a1a]/80 tabular-nums">
                ({classSummary.pctFaltaTotal}%)
              </span>
            </div>
          </div>

          {/* 8. Atestados & Educação Especial */}
          <div className="bg-[#f4f7f6] rounded-2xl p-3 border border-black/[0.05]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#436370] block">
              Atestados · AEE
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[1.35rem] font-extrabold text-[#003440] tabular-nums">
                {classSummary.somaAtestados}
              </span>
              <span className="text-[0.7rem] font-semibold text-[#005035]">
                at. · {classSummary.pcdCount} AEE
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Barra de Controles iOS: Busca + Filtros de Situação + Múltiplas Opções de Visualização */}
      <section className="bg-white/90 backdrop-blur-md rounded-2xl p-3.5 border border-black/[0.06] flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs">
        {/* Campo de busca estilo Spotlight iOS */}
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8e8e93] text-[20px]">
            search
          </span>
          <input
            type="text"
            value={searchStudent}
            onChange={(e) => setSearchStudent(e.target.value)}
            placeholder="Buscar por Nº, nome, RA, mãe ou pai..."
            className="w-full min-h-[40px] pl-10 pr-8 rounded-xl bg-[#767680]/[0.09] border border-transparent text-[0.86rem] font-medium text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:bg-white focus:border-[#005035]/40 transition-all"
          />
          {searchStudent && (
            <button
              type="button"
              onClick={() => setSearchStudent('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8e8e93] hover:text-[#1c1c1e] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
            </button>
          )}
        </div>

        {/* Filtro Rápido de Situação */}
        <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-end">
          <div className="ios-segmented">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`ios-segmented-item ${
                statusFilter === 'all' ? 'ios-segmented-item-active' : ''
              }`}
            >
              Todos ({orderedStudents.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ativos')}
              className={`ios-segmented-item ${
                statusFilter === 'ativos' ? 'ios-segmented-item-active' : ''
              }`}
            >
              Ativos ({classSummary.ativos})
            </button>
            {(classSummary.transferidos + classSummary.remanejados > 0) && (
              <button
                type="button"
                onClick={() => setStatusFilter('movimentados')}
                className={`ios-segmented-item ${
                  statusFilter === 'movimentados' ? 'ios-segmented-item-active' : ''
                }`}
              >
                Transf./Reman. ({classSummary.transferidos + classSummary.remanejados})
              </button>
            )}
            {classSummary.alertaLegalCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('alerta')}
                className={`ios-segmented-item ${
                  statusFilter === 'alerta'
                    ? 'bg-[#ba1a1a] text-white font-bold shadow-xs'
                    : 'text-[#ba1a1a]'
                }`}
              >
                Alerta &lt;{minLegalPresence}% ({classSummary.alertaLegalCount})
              </button>
            )}
          </div>

          {/* Seletor de Múltiplas Opções de Visualização (Preferência do Usuário) */}
          <div className="ios-segmented" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Visualização em Cards Completos"
              className={`ios-segmented-item flex items-center gap-1 ${
                viewMode === 'grid' ? 'ios-segmented-item-active' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              title="Visualização em Lista Compacta iOS"
              className={`ios-segmented-item flex items-center gap-1 ${
                viewMode === 'compact' ? 'ios-segmented-item-active' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">view_agenda</span>
              <span className="hidden sm:inline">Compacto</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Visualização em Tabela Nominal"
              className={`ios-segmented-item flex items-center gap-1 ${
                viewMode === 'table' ? 'ios-segmented-item-active' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">table_rows</span>
              <span className="hidden sm:inline">Tabela</span>
            </button>
          </div>
        </div>
      </section>

      {/* MODO 1: CARDS EM ORDEM NUMÉRICA DA TURMA (Padrão iOS Apple) */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 items-stretch">
          {filteredStudents.map((student) => {
            const m = getStudentAttendanceMetrics(
              student,
              diasLetivosMes,
              OFFICIAL_OCTOBER_DAYS
            );
            const pctFalta =
              m.diasLetivosMatriculados > 0
                ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
                : 0;
            const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
            const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
            const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
            const isOtherNonActive =
              !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';
            const isNonActive = isTransferred || isRemanejado || isOtherNonActive;

            const cleanPhotoFileName = `${student.name
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toUpperCase()
              .trim()}.jpg`;

            const cardColorClasses = isTransferred
              ? 'bg-gradient-to-br from-[#fef3c7] via-[#fffbeb] to-[#fde68a]/65 border-2 border-[#d97706]/60 ring-1 ring-[#f59e0b]/25 shadow-xs'
              : isRemanejado
              ? 'bg-gradient-to-br from-[#ede9fe] via-[#f5f3ff] to-[#ddd6fe]/65 border-2 border-[#7c3aed]/55 ring-1 ring-[#8b5cf6]/25 shadow-xs'
              : isOtherNonActive
              ? 'bg-gradient-to-br from-[#e2e8f0] via-[#f1f5f9] to-[#cbd5e1]/65 border-2 border-[#64748b]/55 shadow-xs'
              : m.isBelowLegalThreshold
              ? 'bg-[#fff9f8] border-[#ba1a1a]/35'
              : 'bg-white border-black/[0.06]';

            const numberBadgeClasses = isTransferred
              ? 'bg-[#b45309] text-white'
              : isRemanejado
              ? 'bg-[#6d28d9] text-white'
              : isOtherNonActive
              ? 'bg-[#475569] text-white'
              : 'bg-[#003440] text-white';

            return (
              <div
                key={student.id}
                onClick={() => {
                  if (onOpenStudentGrid) onOpenStudentGrid(student);
                }}
                title="Toque no card para abrir todos os 48 campos SED da criança"
                className={`card-welcoming rounded-3xl p-4 flex flex-col justify-between gap-3 cursor-pointer select-none transition-all ${cardColorClasses}`}
              >
                {/* Faixa Superior Destacada para Estudantes Não Ativos (Nova Coloração) */}
                {isNonActive && (
                  <div
                    className={`-mx-1 -mt-1 px-3 py-1.5 rounded-2xl text-[0.68rem] font-black uppercase tracking-wider flex items-center justify-between gap-2 shadow-2xs ${
                      isTransferred
                        ? 'bg-[#b45309] text-white'
                        : isRemanejado
                        ? 'bg-[#6d28d9] text-white'
                        : 'bg-[#475569] text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px]">
                        {isTransferred ? 'transfer_within_a_station' : 'swap_horiz'}
                      </span>
                      <span>
                        {isTransferred
                          ? 'NÃO ATIVO • TRANSFERIDO (BXTR)'
                          : isRemanejado
                          ? 'NÃO ATIVO • REMANEJADO'
                          : `NÃO ATIVO • ${sit}`}
                      </span>
                    </span>
                    {student.dataMovimentacao && (
                      <span className="font-mono text-[0.64rem] bg-white/20 px-1.5 py-0.5 rounded">
                        {student.dataMovimentacao}
                      </span>
                    )}
                  </div>
                )}

                {/* Topo do Card: Foto Expansível ao Clicar + Nº Ordem Numérica + RA + Hyperlink Doc Drive */}
                <div className="flex items-start gap-3">
                  <StudentAvatar
                    student={student}
                    size="lg"
                    expandableOnClick={true}
                    onUploadPhotoClick={
                      onOpenPhotoModal ? () => onOpenPhotoModal(student) : undefined
                    }
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono font-extrabold text-[0.73rem] tabular-nums ${numberBadgeClasses}`}
                        >
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        {student.ra && (
                          <span
                            className={`font-mono text-[0.71rem] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${
                              isNonActive
                                ? 'bg-white/80 text-[#1c1c1e] border border-black/10'
                                : 'text-[#436370] bg-[#f2f4f3]'
                            }`}
                          >
                            RA {student.ra}-{student.digRa}
                          </span>
                        )}
                      </div>

                      {isTransferred ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#b45309] text-white text-[0.65rem] font-extrabold uppercase shadow-2xs">
                          Transferido
                        </span>
                      ) : isRemanejado ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#6d28d9] text-white text-[0.65rem] font-extrabold uppercase shadow-2xs">
                          Remanejado
                        </span>
                      ) : isOtherNonActive ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#475569] text-white text-[0.65rem] font-extrabold uppercase shadow-2xs">
                          {sit}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[#eaf6ef] text-[#005035] text-[0.65rem] font-bold">
                          Ativo
                        </span>
                      )}
                    </div>

                    {/* Hyperlink direto para abrir o Documento PDF Escaneado no Drive */}
                    <a
                      href={
                        student.fichaPdfDriveUrl ||
                        (student.fichaPdfDriveId
                          ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
                          : `#doc-${student.id}`)
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onOpenStudentPdf) {
                          onOpenStudentPdf(student);
                        } else if (onOpenStudentGrid) {
                          onOpenStudentGrid(student);
                        }
                      }}
                      title={`Abrir Documento Escaneado (${student.name}.pdf) no Google Drive`}
                      className={`doc-hyperlink text-[0.95rem] font-extrabold leading-snug line-clamp-2 mt-1 block cursor-pointer ${
                        isTransferred
                          ? '!text-[#78350f]'
                          : isRemanejado
                          ? '!text-[#4c1d95]'
                          : ''
                      }`}
                    >
                      {student.name}
                    </a>
                  </div>
                </div>

                {/* Indicadores de Presença Total (% e Qtd) e Falta Total (% e Qtd) no Card */}
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`rounded-2xl px-3 py-2 border flex items-center justify-between ${
                      isNonActive
                        ? 'bg-white/85 border-black/[0.08]'
                        : 'bg-[#eaf6ef]/70 border-[#005035]/15'
                    }`}
                  >
                    <div>
                      <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#005035] block">
                        Presença Total
                      </span>
                      <span className="text-[0.72rem] font-bold text-[#003723] tabular-nums">
                        {m.presencas}/{m.diasLetivosMatriculados} dias
                      </span>
                    </div>
                    <span
                      className={`text-[1.05rem] font-black tabular-nums ${
                        m.isBelowLegalThreshold ? 'text-[#ba1a1a]' : 'text-[#005035]'
                      }`}
                    >
                      {m.frequenciaPercent}%
                    </span>
                  </div>

                  <div
                    className={`rounded-2xl px-3 py-2 border flex items-center justify-between ${
                      m.faltas > 0
                        ? 'bg-[#fff8f7] border-[#ba1a1a]/20'
                        : isNonActive
                        ? 'bg-white/85 border-black/[0.08]'
                        : 'bg-[#f6f8f7] border-black/[0.05]'
                    }`}
                  >
                    <div>
                      <span
                        className={`text-[0.64rem] font-bold uppercase tracking-wider block ${
                          m.faltas > 0 ? 'text-[#ba1a1a]' : 'text-[#5a676b]'
                        }`}
                      >
                        Falta Total
                      </span>
                      <span className="text-[0.72rem] font-bold text-[#374346] tabular-nums">
                        {m.faltas} {m.faltas === 1 ? 'falta' : 'faltas'}
                        {m.atestados > 0 ? ` (${m.atestados} at.)` : ''}
                      </span>
                    </div>
                    <span
                      className={`text-[1.05rem] font-black tabular-nums ${
                        m.faltas > 0 ? 'text-[#ba1a1a]' : 'text-[#5a676b]'
                      }`}
                    >
                      {pctFalta}%
                    </span>
                  </div>
                </div>

                {/* Bloco Filiação (Nome da Mãe e Nome do Pai), Telefones e E-mail Institucional */}
                <div
                  className={`rounded-2xl border p-2.5 space-y-1.5 text-[0.73rem] ${
                    isTransferred
                      ? 'bg-white/85 border-[#d97706]/25'
                      : isRemanejado
                      ? 'bg-white/85 border-[#7c3aed]/25'
                      : 'bg-[#f7f9f8] border-black/[0.04]'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-[#5a676b] font-bold shrink-0 w-10">Mãe:</span>
                    <span className="font-semibold text-[#0f1715] truncate block flex-1">
                      {student.filiacao1 || student.guardianName || 'Não informado'}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-[#5a676b] font-bold shrink-0 w-10">Pai:</span>
                    <span className="font-semibold text-[#0f1715] truncate block flex-1">
                      {student.filiacao2 || 'Não informado'}
                    </span>
                  </div>
                  <div className="pt-1 border-t border-black/[0.05] flex items-center justify-between gap-2 text-[0.7rem]">
                    <span className="font-mono font-semibold text-[#005035] truncate">
                      {student.telefones || student.guardianPhone || 'Sem telefone'}
                    </span>
                    {student.dataNascimento && (
                      <span className="font-mono text-[#5a676b] shrink-0">
                        {student.dataNascimento}
                      </span>
                    )}
                  </div>
                  {student.emailMunicipal && (
                    <div className="text-[0.68rem] font-mono text-[#436370] truncate">
                      {student.emailMunicipal}
                    </div>
                  )}
                </div>

                {/* Alerta Legal se <60% Infantil ou <75% Fundamental */}
                {m.isBelowLegalThreshold && (
                  <div className="px-2.5 py-1.5 rounded-xl bg-[#ffdad6]/85 border border-[#ba1a1a]/30 text-[#93000a] text-[0.7rem] font-bold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] shrink-0">
                      warning
                    </span>
                    <span className="leading-tight">
                      Abaixo de {m.minLegalPresencePercent}% (Alerta Busca Ativa / Bolsa Família)
                    </span>
                  </div>
                )}

                {/* Rodapé Minimalista do Card: Doc Escaneado Drive + Foto + Ver Tudo (48 Campos) */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pt-2 border-t border-black/[0.06] flex items-center justify-between gap-1.5 text-[0.72rem]"
                >
                  <div className="flex items-center gap-1">
                    {onOpenStudentPdf && (
                      <a
                        href={
                          student.fichaPdfDriveUrl ||
                          (student.fichaPdfDriveId
                            ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
                            : `#doc-${student.id}`)
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenStudentPdf(student);
                        }}
                        title="Abrir Documento PDF Escaneado no Google Drive"
                        className="px-2.5 py-1 rounded-xl bg-white/90 hover:bg-[#003440] text-[#003440] hover:text-white border border-black/[0.06] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          document_scanner
                        </span>
                        <span>Doc PDF</span>
                      </a>
                    )}

                    {onOpenPhotoModal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPhotoModal(student);
                        }}
                        title={`Subir foto para ${OFFICIAL_FOLDER_NAME}/${cleanPhotoFileName}`}
                        className="px-2.5 py-1 rounded-xl bg-[#eaf6ef] hover:bg-[#005035] text-[#005035] hover:text-white font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          add_a_photo
                        </span>
                        <span>Foto</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenStudentGrid) onOpenStudentGrid(student);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#003440]/10 hover:bg-[#003440] text-[#003440] hover:text-white font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Ver Dados</span>
                    <span className="material-symbols-outlined text-[14px]">
                      chevron_right
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODO 2: LISTA COMPACTA ESTILO iOS CONTACTS (Ordem Numérica) */}
      {viewMode === 'compact' && (
        <div className="bg-white rounded-3xl border border-black/[0.06] divide-y divide-black/[0.05] overflow-hidden shadow-2xs">
          {filteredStudents.map((student) => {
            const m = getStudentAttendanceMetrics(
              student,
              diasLetivosMes,
              OFFICIAL_OCTOBER_DAYS
            );
            const pctFalta =
              m.diasLetivosMatriculados > 0
                ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
                : 0;
            const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
            const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
            const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
            const isOtherNonActive =
              !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';

            return (
              <div
                key={student.id}
                onClick={() => onOpenStudentGrid && onOpenStudentGrid(student)}
                className={`p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                  isTransferred
                    ? 'bg-gradient-to-r from-[#fef3c7]/80 to-[#fffbeb] border-l-4 border-l-[#b45309] hover:from-[#fde68a]/70'
                    : isRemanejado
                    ? 'bg-gradient-to-r from-[#ede9fe]/80 to-[#f5f3ff] border-l-4 border-l-[#6d28d9] hover:from-[#ddd6fe]/70'
                    : isOtherNonActive
                    ? 'bg-[#e2e8f0]/75 border-l-4 border-l-[#475569]'
                    : m.isBelowLegalThreshold
                    ? 'bg-[#fff9f8] hover:bg-[#fff0ee]'
                    : 'hover:bg-[#f7f9f8]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={`w-8 h-8 rounded-xl text-white font-mono font-extrabold text-[0.76rem] flex items-center justify-center shrink-0 tabular-nums ${
                      isTransferred
                        ? 'bg-[#b45309]'
                        : isRemanejado
                        ? 'bg-[#6d28d9]'
                        : isOtherNonActive
                        ? 'bg-[#475569]'
                        : 'bg-[#003440]'
                    }`}
                  >
                    {student.number.toString().padStart(2, '0')}
                  </span>

                  <StudentAvatar
                    student={student}
                    size="md"
                    expandableOnClick={true}
                    onUploadPhotoClick={
                      onOpenPhotoModal ? () => onOpenPhotoModal(student) : undefined
                    }
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={
                          student.fichaPdfDriveUrl ||
                          (student.fichaPdfDriveId
                            ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
                            : `#doc-${student.id}`)
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onOpenStudentPdf) onOpenStudentPdf(student);
                        }}
                        className="doc-hyperlink font-extrabold text-[0.92rem] truncate"
                      >
                        {student.name}
                      </a>
                      <span className="font-mono text-[0.72rem] text-[#436370] bg-white/80 px-1.5 py-0.5 rounded border border-black/5">
                        RA {student.ra}-{student.digRa}
                      </span>
                      {isTransferred && (
                        <span className="px-2 py-0.5 rounded-full bg-[#b45309] text-white text-[0.64rem] font-black uppercase">
                          NÃO ATIVO • TRANSFERIDO (BXTR)
                        </span>
                      )}
                      {isRemanejado && (
                        <span className="px-2 py-0.5 rounded-full bg-[#6d28d9] text-white text-[0.64rem] font-black uppercase">
                          NÃO ATIVO • REMANEJADO
                        </span>
                      )}
                    </div>
                    <div className="text-[0.74rem] text-[#5a676b] truncate mt-0.5">
                      <strong>Mãe:</strong> {student.filiacao1 || '—'} ·{' '}
                      <strong>Pai:</strong> {student.filiacao2 || '—'} ·{' '}
                      <span className="font-mono text-[#005035]">
                        {student.telefones || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                  <div className="flex items-center gap-2 font-mono text-[0.76rem] tabular-nums">
                    <span className="px-2.5 py-1 rounded-xl bg-[#eaf6ef] text-[#005035] font-bold">
                      Presença: {m.presencas}d ({m.frequenciaPercent}%)
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-xl font-bold ${
                        m.faltas > 0
                          ? 'bg-[#ffdad6]/70 text-[#ba1a1a]'
                          : 'bg-[#f2f4f3] text-[#5a676b]'
                      }`}
                    >
                      Faltas: {m.faltas} ({pctFalta}%)
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-[#8e8e93]">
                    chevron_right
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODO 3: TABELA NOMINAL COMPLETA (Ordem Numérica + Filiação 1 e 2 + Contatos + Presença/Falta) */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-3xl border border-black/[0.06] overflow-x-auto shadow-2xs">
          <table className="w-full text-left text-[0.78rem] border-collapse min-w-[1080px]">
            <thead className="bg-[#f7f9f8] text-[#003440] border-b border-black/[0.06] font-extrabold uppercase tracking-wider text-[0.68rem]">
              <tr>
                <th className="py-3 px-3 text-center">Nº</th>
                <th className="py-3 px-3">Estudante (Foto + Doc PDF)</th>
                <th className="py-3 px-2.5">RA</th>
                <th className="py-3 px-3">Filiação 1 (Nome da Mãe)</th>
                <th className="py-3 px-3">Filiação 2 (Nome do Pai)</th>
                <th className="py-3 px-2.5">Telefone / E-mail</th>
                <th className="py-3 px-2.5 text-center">Presença Total</th>
                <th className="py-3 px-2.5 text-center">Falta Total</th>
                <th className="py-3 px-2.5 text-center">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {filteredStudents.map((student) => {
                const m = getStudentAttendanceMetrics(
                  student,
                  diasLetivosMes,
                  OFFICIAL_OCTOBER_DAYS
                );
                const pctFalta =
                  m.diasLetivosMatriculados > 0
                    ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
                    : 0;
                const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
                const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
                const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
                const isOtherNonActive =
                  !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';

                return (
                  <tr
                    key={student.id}
                    onClick={() => onOpenStudentGrid && onOpenStudentGrid(student)}
                    className={`cursor-pointer transition-colors ${
                      isTransferred
                        ? 'bg-[#fef3c7]/75 hover:bg-[#fde68a]/75'
                        : isRemanejado
                        ? 'bg-[#ede9fe]/75 hover:bg-[#ddd6fe]/75'
                        : isOtherNonActive
                        ? 'bg-[#e2e8f0]/75'
                        : m.isBelowLegalThreshold
                        ? 'bg-[#fff9f8] hover:bg-[#fff0ee]'
                        : 'hover:bg-[#f4f8f6]'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono font-extrabold text-[#003440]">
                      {student.number.toString().padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <StudentAvatar
                          student={student}
                          size="sm"
                          expandableOnClick={true}
                        />
                        <a
                          href={
                            student.fichaPdfDriveUrl || `#doc-${student.id}`
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (onOpenStudentPdf) onOpenStudentPdf(student);
                          }}
                          className="doc-hyperlink font-bold text-[#003440]"
                        >
                          {student.name}
                        </a>
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 font-mono text-[#436370]">
                      {student.ra}-{student.digRa}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#1c1c1e]">
                      {student.filiacao1 || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#1c1c1e]">
                      {student.filiacao2 || '—'}
                    </td>
                    <td className="py-2.5 px-2.5 font-mono text-[0.72rem]">
                      <div className="text-[#005035] font-semibold">
                        {student.telefones || '—'}
                      </div>
                      <div className="text-[#5a676b] truncate max-w-[180px]">
                        {student.emailMunicipal || '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-center font-mono font-bold text-[#005035]">
                      {m.presencas}/{m.diasLetivosMatriculados}d ({m.frequenciaPercent}%)
                    </td>
                    <td className="py-2.5 px-2.5 text-center font-mono font-bold text-[#ba1a1a]">
                      {m.faltas} ({pctFalta}%)
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[0.68rem] font-extrabold uppercase ${
                          isTransferred
                            ? 'bg-[#b45309] text-white'
                            : isRemanejado
                            ? 'bg-[#6d28d9] text-white'
                            : isOtherNonActive
                            ? 'bg-[#475569] text-white'
                            : 'bg-[#eaf6ef] text-[#005035]'
                        }`}
                      >
                        {isTransferred
                          ? 'TRANSFERIDO (BXTR)'
                          : isRemanejado
                          ? 'REMANEJADO'
                          : student.situacao || 'ATIVO'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast de Confirmação de Download .XLS */}
      {exportSuccessToast && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-200">
          <div className="bg-[#003440] text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-white/15 flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px] text-[#a4f3ca]">
              download_done
            </span>
            <p className="text-[0.82rem] font-bold leading-snug">{exportSuccessToast}</p>
          </div>
        </div>
      )}

      {/* MODAL iOS DE DOWNLOAD .XLS DA TURMA (SELECIONAR COLUNAS, CAMPOS E ORDEM) */}
      {isExportXlsModalOpen && (() => {
        const categories: ClassExportCategory[] = [
          'Identificação & Matrícula',
          'Filiação (Mãe e Pai) & Contatos',
          'Frequência, Presença & Faltas',
          'Documentos, Saúde & AEE',
          'Endereço & Transporte',
          'Outros Campos SED',
        ];

        const qCol = columnSearchTerm.toLowerCase().trim();
        const availableColumnsFiltered = CLASS_EXPORT_COLUMNS.filter((col) => {
          const matchesCat =
            activeCategoryFilter === 'all' || col.category === activeCategoryFilter;
          const matchesText =
            qCol === '' ||
            col.label.toLowerCase().includes(qCol) ||
            col.shortLabel.toLowerCase().includes(qCol) ||
            col.category.toLowerCase().includes(qCol);
          return matchesCat && matchesText;
        });

        const selectedColDefs = selectedColumnIds
          .map((id) => CLASS_EXPORT_COLUMNS.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));

        const previewData = buildCustomClassExportPreview(
          classGroup,
          {
            columnIds: selectedColumnIds,
            sortBy: exportSortBy,
            statusFilter: exportStatusFilter,
            includeSummarySheet,
            fileFormat: exportFileFormat,
          },
          OFFICIAL_OCTOBER_DAYS
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setIsExportXlsModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[#f5f7f6] w-full max-w-6xl rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Cabeçalho iOS do Modal de Exportação .XLS */}
              <div className="bg-white px-5 py-4 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#eaf6ef] text-[#005035] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[24px]">table_view</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[0.68rem] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#005035] text-white">
                        Exportação Exclusiva da Turma · Formato .XLS
                      </span>
                      <span className="text-[0.72rem] font-bold text-[#5a676b]">
                        {selectedColDefs.length} colunas selecionadas · {previewData.rows.length} estudantes
                      </span>
                    </div>
                    <h2 className="text-[1.2rem] sm:text-[1.35rem] font-extrabold text-[#003440] tracking-tight leading-tight mt-0.5">
                      Baixar Planilha da Turma {classGroup.name} (.xls)
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExecuteDownloadXLS}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#005035] hover:bg-[#003d28] text-white font-extrabold text-[0.84rem] flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-97"
                  >
                    <span className="material-symbols-outlined text-[19px]">download</span>
                    <span>Baixar Planilha (.{exportFileFormat})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExportXlsModalOpen(false)}
                    className="w-10 h-10 rounded-xl bg-[#f2f4f3] hover:bg-[#e4e8e6] text-[#3c3c43] flex items-center justify-center cursor-pointer"
                    aria-label="Fechar"
                  >
                    <span className="material-symbols-outlined text-[22px]">close</span>
                  </button>
                </div>
              </div>

              {/* Corpo Principal Rolável */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* 1. Modelos Rápidos (Presets de Colunas) */}
                <div className="bg-white rounded-2xl p-4 border border-black/[0.06] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.76rem] font-extrabold uppercase tracking-wider text-[#003440] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[17px] text-[#005035]">
                        auto_awesome
                      </span>
                      <span>1. Modelos Rápidos de Colunas (ou personalize abaixo)</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          saveSelectedColumns(CLASS_EXPORT_COLUMNS.map((c) => c.id))
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#eaf6ef] hover:bg-[#d5f0e0] text-[#005035] font-bold text-[0.72rem] cursor-pointer"
                      >
                        Marcar Todas ({CLASS_EXPORT_COLUMNS.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSelectedColumns(DEFAULT_CLASS_EXPORT_COLUMN_IDS)}
                        className="px-2.5 py-1 rounded-lg bg-[#f2f4f3] hover:bg-[#e5e9e7] text-[#003440] font-bold text-[0.72rem] cursor-pointer"
                      >
                        Restaurar Padrão
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSelectedColumns(['numeroChamada', 'estudante'])}
                        className="px-2.5 py-1 rounded-lg bg-[#fff8f7] hover:bg-[#ffdad6] text-[#ba1a1a] font-bold text-[0.72rem] cursor-pointer"
                      >
                        Mínimo (Nº + Nome)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {CLASS_EXPORT_PRESETS.map((preset) => {
                      const isCurrentPreset =
                        preset.columnIds.length === selectedColumnIds.length &&
                        preset.columnIds.every((id, idx) => selectedColumnIds[idx] === id);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => saveSelectedColumns(preset.columnIds)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                            isCurrentPreset
                              ? 'bg-[#eaf6ef] border-[#005035] shadow-2xs'
                              : 'bg-[#f8faf9] hover:bg-white border-black/[0.06]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-[0.78rem] text-[#003440]">
                              {preset.label}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#003440]/10 text-[#003440] font-mono font-bold text-[0.66rem]">
                              {preset.columnIds.length} col.
                            </span>
                          </div>
                          <p className="text-[0.68rem] text-[#5a676b] line-clamp-2 leading-snug">
                            {preset.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Opções de Ordenação das Linhas, Filtro de Situação e Formato (.xls / .xlsx) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-2xl p-3.5 border border-black/[0.06] space-y-1">
                    <label className="text-[0.7rem] font-extrabold uppercase tracking-wider text-[#5a676b] block">
                      Ordem dos Estudantes (Linhas)
                    </label>
                    <select
                      value={exportSortBy}
                      onChange={(e) => setExportSortBy(e.target.value as ClassExportSortOrder)}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f5f7f6] border border-black/[0.08] text-[0.8rem] font-bold text-[#003440]"
                    >
                      <option value="number_asc">Nº da Chamada (01, 02, 03...)</option>
                      <option value="name_asc">Ordem Alfabética (A → Z)</option>
                      <option value="name_desc">Ordem Alfabética (Z → A)</option>
                      <option value="absences_desc">Maior Falta Total primeiro</option>
                      <option value="presence_asc">Menor % Presença primeiro</option>
                    </select>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 border border-black/[0.06] space-y-1">
                    <label className="text-[0.7rem] font-extrabold uppercase tracking-wider text-[#5a676b] block">
                      Filtrar Estudantes na Planilha
                    </label>
                    <select
                      value={exportStatusFilter}
                      onChange={(e) =>
                        setExportStatusFilter(e.target.value as ClassExportStatusFilter)
                      }
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f5f7f6] border border-black/[0.08] text-[0.8rem] font-bold text-[#003440]"
                    >
                      <option value="all">
                        Todos da Turma ({classGroup.students.length})
                      </option>
                      <option value="ativos">
                        Somente Ativos ({classSummary.ativos})
                      </option>
                      <option value="movimentados">
                        Somente Transferidos / Remanejados (
                        {classSummary.transferidos + classSummary.remanejados})
                      </option>
                      <option value="alerta">
                        Somente em Alerta Legal &lt;{minLegalPresence}% (
                        {classSummary.alertaLegalCount})
                      </option>
                    </select>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 border border-black/[0.06] space-y-1">
                    <label className="text-[0.7rem] font-extrabold uppercase tracking-wider text-[#5a676b] block">
                      Formato do Arquivo Excel
                    </label>
                    <div className="ios-segmented w-full flex">
                      <button
                        type="button"
                        onClick={() => setExportFileFormat('xls')}
                        className={`flex-1 ios-segmented-item text-center ${
                          exportFileFormat === 'xls' ? 'ios-segmented-item-active' : ''
                        }`}
                      >
                        .XLS (Padrão)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFileFormat('xlsx')}
                        className={`flex-1 ios-segmented-item text-center ${
                          exportFileFormat === 'xlsx' ? 'ios-segmented-item-active' : ''
                        }`}
                      >
                        .XLSX
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 border border-black/[0.06] flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[0.75rem] font-extrabold text-[#003440] block">
                        Aba Resumo / Alta da Turma
                      </span>
                      <span className="text-[0.68rem] text-[#5a676b] block">
                        Ativos, Fem., Masc., Transf., Reman.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeSummarySheet}
                      onChange={(e) => setIncludeSummarySheet(e.target.checked)}
                      className="w-5 h-5 accent-[#005035] rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* 3. Grade Dupla: Selecionar Campos (Esquerda) + Definir Ordem das Colunas (Direita) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Coluna Esquerda (7 cols): Selecionar Colunas / Campos disponíveis */}
                  <div className="lg:col-span-7 bg-white rounded-2xl p-4 border border-black/[0.06] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-[0.84rem] font-extrabold text-[#003440] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-[#005035]">
                          checklist
                        </span>
                        <span>2. Selecionar Campos / Colunas ({CLASS_EXPORT_COLUMNS.length} disponíveis)</span>
                      </h3>

                      <div className="relative w-full sm:w-56">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8e8e93] text-[16px]">
                          search
                        </span>
                        <input
                          type="text"
                          value={columnSearchTerm}
                          onChange={(e) => setColumnSearchTerm(e.target.value)}
                          placeholder="Buscar coluna (ex: Mãe, Pai, RA)..."
                          className="w-full min-h-[34px] pl-8 pr-2.5 rounded-xl bg-[#f5f7f6] text-[0.76rem] font-medium text-[#1c1c1e] focus:outline-none focus:bg-white border border-black/[0.06]"
                        />
                      </div>
                    </div>

                    {/* Filtro por Categoria */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setActiveCategoryFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-[0.7rem] font-bold whitespace-nowrap cursor-pointer ${
                          activeCategoryFilter === 'all'
                            ? 'bg-[#003440] text-white'
                            : 'bg-[#f2f4f3] text-[#436370] hover:bg-[#e5e9e7]'
                        }`}
                      >
                        Todas Categorias
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[0.7rem] font-bold whitespace-nowrap cursor-pointer ${
                            activeCategoryFilter === cat
                              ? 'bg-[#005035] text-white'
                              : 'bg-[#f2f4f3] text-[#436370] hover:bg-[#e5e9e7]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Lista de Checkboxes de Colunas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[310px] overflow-y-auto pr-1">
                      {availableColumnsFiltered.map((col) => {
                        const isChecked = selectedColumnIds.includes(col.id);
                        const orderPos = selectedColumnIds.indexOf(col.id);
                        return (
                          <label
                            key={col.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer select-none transition-all ${
                              isChecked
                                ? 'bg-[#eaf6ef]/70 border-[#005035]/40 text-[#003440]'
                                : 'bg-[#f9faf9] hover:bg-[#f2f4f3] border-black/[0.05] text-[#5a676b]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleColumn(col.id)}
                                className="w-4 h-4 accent-[#005035] rounded cursor-pointer shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="font-bold text-[0.76rem] block truncate">
                                  {col.shortLabel}
                                </span>
                                <span className="font-mono text-[0.64rem] opacity-75 block truncate">
                                  {col.label}
                                </span>
                              </div>
                            </div>

                            {isChecked && (
                              <span className="px-1.5 py-0.5 rounded-md bg-[#005035] text-white font-mono font-extrabold text-[0.65rem] shrink-0">
                                {orderPos + 1}ª
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Coluna Direita (5 cols): Definir a Ordem Exata das Colunas na Planilha (.xls) */}
                  <div className="lg:col-span-5 bg-white rounded-2xl p-4 border border-black/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-[0.84rem] font-extrabold text-[#003440] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px] text-[#005035]">
                            swap_vert
                          </span>
                          <span>3. Ordem das Colunas ({selectedColDefs.length})</span>
                        </h3>
                        <p className="text-[0.68rem] text-[#5a676b]">
                          Use as setas ↑ ↓ ou arraste para mudar a ordem das colunas no .xls
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                      {selectedColDefs.map((col, idx) => (
                        <div
                          key={col.id}
                          draggable
                          onDragStart={() => setDraggedColIndex(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (draggedColIndex === null || draggedColIndex === idx) return;
                            const next = [...selectedColumnIds];
                            const [moved] = next.splice(draggedColIndex, 1);
                            next.splice(idx, 0, moved);
                            saveSelectedColumns(next);
                            setDraggedColIndex(null);
                          }}
                          className="p-2 rounded-xl bg-[#f7f9f8] hover:bg-[#eef3f1] border border-black/[0.06] flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-lg bg-[#003440] text-white font-mono font-extrabold text-[0.7rem] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <span className="font-bold text-[0.76rem] text-[#003440] block truncate">
                                {col.shortLabel}
                              </span>
                              <span className="font-mono text-[0.63rem] text-[#5a676b] block truncate">
                                Coluna Excel: {col.label}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveColumn(idx, 'top')}
                              title="Mover para 1ª coluna"
                              className="w-7 h-7 rounded-lg bg-white hover:bg-[#eaf6ef] text-[#003440] border border-black/[0.06] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                keyboard_double_arrow_up
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveColumn(idx, 'up')}
                              title="Subir posição"
                              className="w-7 h-7 rounded-lg bg-white hover:bg-[#eaf6ef] text-[#003440] border border-black/[0.06] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                arrow_upward
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={idx === selectedColDefs.length - 1}
                              onClick={() => handleMoveColumn(idx, 'down')}
                              title="Descer posição"
                              className="w-7 h-7 rounded-lg bg-white hover:bg-[#eaf6ef] text-[#003440] border border-black/[0.06] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                arrow_downward
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={selectedColDefs.length <= 1}
                              onClick={() => handleToggleColumn(col.id)}
                              title="Remover coluna"
                              className="w-7 h-7 rounded-lg bg-[#fff8f7] hover:bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]/20 flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. Pré-visualização em Tempo Real da Planilha (.xls) */}
                <div className="bg-white rounded-2xl p-4 border border-black/[0.06] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.76rem] font-extrabold uppercase tracking-wider text-[#003440] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[17px] text-[#005035]">
                        preview
                      </span>
                      <span>
                        Prévia das Colunas e Ordem na Planilha .
                        {exportFileFormat.toUpperCase()} (Primeiros 4 registros)
                      </span>
                    </span>
                    <span className="text-[0.7rem] font-semibold text-[#5a676b]">
                      Total a exportar: {previewData.rows.length} linhas ×{' '}
                      {previewData.headers.length} colunas
                    </span>
                  </div>

                  <div className="border border-black/[0.08] rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-[0.72rem] border-collapse">
                      <thead className="bg-[#003440] text-white font-bold uppercase whitespace-nowrap">
                        <tr>
                          {previewData.headers.map((h, i) => (
                            <th key={`${h}-${i}`} className="py-2 px-2.5 border-r border-white/10">
                              <span className="text-[#a4f3ca] mr-1">{i + 1}.</span>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.05] whitespace-nowrap">
                        {previewData.rows.slice(0, 4).map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={rIdx % 2 === 0 ? 'bg-white' : 'bg-[#f8faf9]'}
                          >
                            {previewData.headers.map((h, cIdx) => (
                              <td
                                key={`${rIdx}-${cIdx}`}
                                className="py-1.5 px-2.5 border-r border-black/[0.04] text-[#1c1c1e] font-medium max-w-[220px] truncate"
                              >
                                {String(row[h] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Rodapé do Modal */}
              <div className="bg-white px-5 py-3.5 border-t border-black/[0.06] flex flex-wrap items-center justify-between gap-3">
                <div className="text-[0.76rem] text-[#5a676b] font-medium">
                  Arquivo:{' '}
                  <strong className="font-mono text-[#003440]">
                    Planilha_{classGroup.name.replace(/\s+/g, '_')}_2027.{exportFileFormat}
                  </strong>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsExportXlsModalOpen(false)}
                    className="min-h-[42px] px-4 rounded-xl bg-[#f2f4f3] hover:bg-[#e5e9e7] text-[#3c3c43] font-bold text-[0.82rem] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteDownloadXLS}
                    className="min-h-[42px] px-5 rounded-xl bg-[#005035] hover:bg-[#003d28] text-white font-extrabold text-[0.86rem] flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-97"
                  >
                    <span className="material-symbols-outlined text-[20px]">download</span>
                    <span>
                      Baixar Planilha .{exportFileFormat.toUpperCase()} ({selectedColDefs.length}{' '}
                      Colunas)
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
