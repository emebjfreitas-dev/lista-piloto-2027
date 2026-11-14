import React, { useState, useMemo } from 'react';
import { ClassGroup, Student, UserRole, SchoolNotice } from '../types';
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
import {
  getStudentAttendanceMetrics,
  getStudentConsecutiveAlertInfo,
} from '../utils/attendanceRules';
import {
  resolveStudentGender,
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
} from '../utils/genderDictionary';
import { StudentAvatar } from './StudentAvatar';
import { StudentDataExpansionPanel } from './StudentDataExpansionPanel';
import { OFFICIAL_FOLDER_NAME } from '../services/googleSheetsApi';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';

import {
  getStudentCumulativeOccurrences,
  triggerConsecutiveAbsencePushNotification,
} from '../services/pushNotificationService';

type ViewMode = 'grid' | 'compact' | 'table';
type StatusFilter =
  | 'all'
  | 'ativos'
  | 'sem_ficha_pdf'
  | 'movimentados'
  | 'onibus_fretado'
  | 'bolsa_familia'
  | 'alerta';

interface DetalhesTurmaScreenProps {
  classGroup: ClassGroup;
  assignedClasses?: ClassGroup[];
  onSwitchAssignedClass?: (cls: ClassGroup) => void;
  userRole?: UserRole;
  userEmail?: string;
  userName?: string;
  schoolNotices?: SchoolNotice[];
  onSaveSchoolNotices?: (updatedNotices: SchoolNotice[]) => void;
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
  onNavigateToBolsaFamilia?: () => void;
  onNavigateToConsecutiveAbsences?: () => void;
  onNavigateToMap?: (student: Student) => void;
  onNavigateToSheet: () => void;
  onBackToClasses: () => void;
}

export const DetalhesTurmaScreen: React.FC<DetalhesTurmaScreenProps> = ({
  classGroup,
  assignedClasses = [],
  onSwitchAssignedClass,
  userRole = 'admin',
  userEmail,
  userName,
  schoolNotices = [],
  onSaveSchoolNotices,
  canLaunchAttendance = true,
  onGoToMonthlyAttendance,
  onGoToMonthlySummary,
  onOpenStudentGrid,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onNavigateToBolsaFamilia,
  onNavigateToConsecutiveAbsences,
  onNavigateToMap,
  onBackToClasses,
}) => {
  const [searchStudent, setSearchStudent] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

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
    let bolsaFamiliaCount = 0;
    let onibusFretadoCount = 0;
    let semFichaEscaneadaCount = 0;
    let comFichaEscaneadaCount = 0;
    let somaDiasMatriculados = 0;
    let somaPresencas = 0;
    let somaFaltas = 0;
    let somaAtestados = 0;

    orderedStudents.forEach((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const genCode = resolveStudentGender(s);
      if (sit.includes('BXTR') || sit.includes('TRANSF')) {
        transferidos++;
      } else if (sit.includes('REMAN') || sit.includes('RM')) {
        remanejados++;
      } else {
        ativos++;
      }

      if (genCode === 'F') feminino++;
      else masculino++;

      if (s.deficiencia && s.deficiencia.trim().length > 0) pcdCount++;
      if (s.nis && s.nis.trim().length > 0) bolsaFamiliaCount++;
      if (s.rotaOnibus && s.rotaOnibus.trim().length > 0) onibusFretadoCount++;

      const hasScannedPdf = Boolean(
        (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
          (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
      );
      if (hasScannedPdf) comFichaEscaneadaCount++;
      else semFichaEscaneadaCount++;

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
      bolsaFamiliaCount,
      onibusFretadoCount,
      semFichaEscaneadaCount,
      comFichaEscaneadaCount,
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
        (s.nis && s.nis.toLowerCase().includes(q)) ||
        (s.rotaOnibus && s.rotaOnibus.toLowerCase().includes(q)) ||
        (s.filiacao1 && s.filiacao1.toLowerCase().includes(q)) ||
        (s.filiacao2 && s.filiacao2.toLowerCase().includes(q));
      if (!matchesQuery) return false;

      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const isMov =
        sit.includes('BXTR') ||
        sit.includes('TRANSF') ||
        sit.includes('REMAN') ||
        sit.includes('RM');

      const hasScannedPdf = Boolean(
        (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
          (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
      );

      if (statusFilter === 'ativos') return !isMov;
      if (statusFilter === 'sem_ficha_pdf') return !hasScannedPdf;
      if (statusFilter === 'movimentados') return isMov;
      if (statusFilter === 'onibus_fretado') {
        return Boolean(s.rotaOnibus && s.rotaOnibus.trim().length > 0);
      }
      if (statusFilter === 'bolsa_familia' && userRole === 'admin') {
        return Boolean(s.nis && s.nis.trim().length > 0);
      }
      if (statusFilter === 'alerta') {
        const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
        return m.isBelowLegalThreshold;
      }
      return true;
    });
  }, [orderedStudents, searchStudent, statusFilter, userRole, diasLetivosMes, minLegalPresence]);
  const renderStudentDetailedExpansion = (
    student: Student
  ) => {
    return (
      <StudentDataExpansionPanel
        student={student}
        classGroup={classGroup}
        diasLetivosMes={diasLetivosMes}
        minLegalPresence={minLegalPresence}
        onOpenStudentPdf={onOpenStudentPdf}
        onOpenStudentGrid={onOpenStudentGrid}
        onNavigateToMap={onNavigateToMap}
        onCollapse={() => setExpandedStudentId(null)}
      />
    );
  };

  return (
    <div className="flex flex-col w-full min-w-0 space-y-5 pb-16 animate-gentle-fade">

      {/* Se a professora PEB I tiver 2 ou mais turmas vinculadas, seletor estilo Segmented Control iOS */}
      {userRole === 'usuario' && assignedClasses.length > 1 && onSwitchAssignedClass && (
        <section className="bg-white rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-xs min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px] text-blue-700 shrink-0">
              swap_horiz
            </span>
            <span className="text-xs font-bold text-slate-950 break-words">
              Suas Turmas ({assignedClasses.length}):
            </span>
          </div>
          <div className="ios-segmented w-full sm:w-auto">
            {assignedClasses.map((cls) => {
              const isSelected = cls.id === classGroup.id;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => onSwitchAssignedClass(cls)}
                  className={`ios-segmented-item flex-1 sm:flex-initial ${
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

      {/* Contexto da Turma e Navegação */}
      {/* Breadcrumb Limpo */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 py-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onBackToClasses}
            className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            <span>Turmas</span>
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800 break-words">{classGroup.name}</span>
          <span className="text-slate-400">·</span>
          <span className="break-words">{classGroup.shift}</span>
        </div>
        <span className="hidden sm:inline text-slate-500 font-medium text-xs tabular-nums shrink-0">
          {classGroup.room}
        </span>
      </div>

      {/* Painel Principal da Turma */}
      <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 lg:p-7 shadow-sm space-y-5 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {classGroup.turmaAbrev && (
                <span className="text-xs font-bold uppercase tracking-wider text-white bg-[#0b3b8c] px-2.5 py-1 rounded-lg tabular-nums">
                  {classGroup.turmaAbrev}
                </span>
              )}
              <span className="text-xs font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg break-words">
                {classGroup.shift} · {classGroup.room}
              </span>
              {classGroup.classeSedCode && (
                <span className="text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg tabular-nums">
                  SED: {classGroup.classeSedCode}
                </span>
              )}
              <span className="text-xs font-bold text-slate-700">
                Mín. Legal: {minLegalPresence}%
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight mt-1.5 break-words">
              Turma {classGroup.name}
            </h1>
            <p className="text-sm text-slate-700 font-medium mt-0.5 break-words">
              {classGroup.sedClassName
                ? `${classGroup.sedClassName} · Previsto SED: ${classGroup.sedExpectedStudents ?? classSummary.totalMatriculados}`
                : `${classGroup.grade} · ${classGroup.room}`}{' '}
              · {diasLetivosMes} dias letivos no mês
            </p>
          </div>

          {/* Ações da Turma */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto min-w-0 shrink-0">
            {canLaunchAttendance && (
              <button
                type="button"
                onClick={onGoToMonthlyAttendance}
                className="w-full sm:w-auto min-h-[44px] py-2 px-5 rounded-2xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-bold text-sm flex items-center justify-center text-center whitespace-normal gap-2 cursor-pointer transition-colors shadow-xs"
                title="Informar faltas do mês de referência"
              >
                <span className="material-symbols-outlined text-[18px] text-emerald-300 shrink-0">checklist</span>
                <span>Informar Faltas do Mês</span>
              </button>
            )}

            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => setIsExportXlsModalOpen(true)}
                className="w-full sm:w-auto min-h-[44px] py-2 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 font-bold text-xs sm:text-sm flex items-center justify-center text-center whitespace-normal gap-2 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[18px] text-slate-700 shrink-0">download</span>
                <span>Exportar .XLS</span>
              </button>
            )}
          </div>
        </div>

        {/* Quadro Docente Oficial da Turma */}
        {(classGroup.teacherName || classGroup.artTeacher || classGroup.peTeacher || classGroup.englishTeacher) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4 items-stretch min-w-0">
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3 h-full min-h-[88px] transition-colors min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#0b3b8c] text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">school</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    {classGroup.pronoun || 'PROFESSORA'} REGENTE
                  </span>
                  {classGroup.teacherFirstName && (
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-[#0b3b8c] text-xs font-bold">
                      {classGroup.teacherFirstName}
                    </span>
                  )}
                </div>
                {classGroup.isVaga || classGroup.teacherName === 'TURMA VAGA' ? (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      Turma Vaga
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-950 break-words leading-snug mt-0.5" title={classGroup.teacherName || undefined}>
                      {classGroup.teacherName || 'Não atribuído'}
                    </p>
                    <p className="text-xs font-mono text-slate-600 font-medium break-all leading-snug mt-0.5" title={classGroup.teacherEmail || undefined}>
                      {classGroup.teacherEmail || 'Docente Regente'}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3 h-full min-h-[88px] transition-colors min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">palette</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Arte (PEB II)
                </span>
                <p className="text-sm font-bold text-slate-950 break-words leading-snug mt-0.5" title={classGroup.artTeacher || undefined}>
                  {classGroup.artTeacher || '—'}
                </p>
                <p className="text-xs font-mono text-slate-600 font-medium break-all leading-snug mt-0.5" title={classGroup.artTeacherEmail || undefined}>
                  {classGroup.artTeacherEmail || 'Especialista'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3 h-full min-h-[88px] transition-colors min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">sports_soccer</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Ed. Física (PEB II)
                </span>
                <p className="text-sm font-bold text-slate-950 break-words leading-snug mt-0.5" title={classGroup.peTeacher || undefined}>
                  {classGroup.peTeacher || '—'}
                </p>
                <p className="text-xs font-mono text-slate-600 font-medium break-all leading-snug mt-0.5" title={classGroup.peTeacherEmail || undefined}>
                  {classGroup.peTeacherEmail || 'Especialista'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3 h-full min-h-[88px] transition-colors min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">translate</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Inglês (PEB II)
                </span>
                <p className="text-sm font-bold text-slate-950 break-words leading-snug mt-0.5" title={classGroup.englishTeacher || undefined}>
                  {classGroup.englishTeacher || '—'}
                </p>
                <p className="text-xs font-mono text-slate-600 font-medium break-all leading-snug mt-0.5" title={classGroup.englishTeacherEmail || undefined}>
                  {classGroup.englishTeacherEmail || 'Especialista'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Indicadores Cadastrais da Turma */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 pt-4 items-stretch min-w-0">
          {/* 1. Estudantes Ativos */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'ativos' ? 'all' : 'ativos')}
            className={`rounded-2xl border p-4 cursor-pointer transition-all duration-100 flex flex-col justify-between h-full min-h-[88px] min-w-0 break-words ${
              statusFilter === 'ativos'
                ? 'bg-blue-50 border-[#0b3b8c] shadow-xs'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="text-xs font-bold text-slate-600 block">
              Estudantes Ativos
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1">
              <span className="text-2xl sm:text-3xl font-bold text-slate-950 tabular-nums">
                {classSummary.ativos}
              </span>
              <span className="text-xs sm:text-[13px] text-slate-600 font-medium tabular-nums">
                de {classSummary.totalMatriculados} matriculados
              </span>
            </div>
          </div>

          {/* 2. Composição por Gênero */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between h-full min-h-[88px] min-w-0 break-words">
            <span className="text-xs font-bold text-slate-600 block">
              Gênero
            </span>
            <div className="flex flex-wrap items-baseline gap-2 mt-1 tabular-nums text-sm">
              <span className="font-bold text-slate-950">
                {classSummary.feminino} <span className="text-slate-600 font-medium">Feminino</span>
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-bold text-slate-950">
                {classSummary.masculino} <span className="text-slate-600 font-medium">Masculino</span>
              </span>
            </div>
          </div>

          {/* 3. Movimentação */}
          <div
            onClick={() =>
              classSummary.transferidos + classSummary.remanejados > 0 &&
              setStatusFilter(statusFilter === 'movimentados' ? 'all' : 'movimentados')
            }
            className={`rounded-2xl border p-4 transition-all duration-100 flex flex-col justify-between h-full min-h-[88px] min-w-0 break-words ${
              statusFilter === 'movimentados'
                ? 'bg-blue-50 border-[#0b3b8c] shadow-xs'
                : classSummary.transferidos + classSummary.remanejados > 0
                ? 'bg-slate-50 border-slate-200 cursor-pointer hover:bg-slate-100'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-xs font-bold text-slate-600 block">
              Movimentados
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1 tabular-nums">
              <span className="text-2xl sm:text-3xl font-bold text-slate-950">
                {classSummary.transferidos + classSummary.remanejados}
              </span>
              <span className="text-xs sm:text-[13px] text-slate-600 font-medium">
                ({classSummary.transferidos} transf. · {classSummary.remanejados} reman.)
              </span>
            </div>
          </div>

          {/* 4. Fichas Informativas do Estudante */}
          <div
            onClick={() =>
              classSummary.semFichaEscaneadaCount > 0 &&
              setStatusFilter(statusFilter === 'sem_ficha_pdf' ? 'all' : 'sem_ficha_pdf')
            }
            className={`rounded-2xl border p-4 transition-all duration-100 flex flex-col justify-between h-full min-h-[88px] min-w-0 break-words ${
              classSummary.semFichaEscaneadaCount > 0
                ? statusFilter === 'sem_ficha_pdf'
                  ? 'bg-rose-100 border-rose-500 shadow-xs cursor-pointer'
                  : 'bg-rose-50 border-rose-300 hover:bg-rose-100/80 cursor-pointer'
                : 'bg-emerald-50 border-emerald-300'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span
                className={`text-xs font-bold ${
                  classSummary.semFichaEscaneadaCount > 0 ? 'text-rose-900' : 'text-emerald-900'
                }`}
              >
                {classSummary.semFichaEscaneadaCount > 0
                  ? 'Sem Ficha Informativa'
                  : 'Fichas Informativas em Dia'}
              </span>
              {classSummary.semFichaEscaneadaCount > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-rose-200 text-xs font-bold text-rose-950">
                  {statusFilter === 'sem_ficha_pdf' ? 'Ver todos' : 'Filtrar'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1 tabular-nums">
              <span
                className={`text-2xl sm:text-3xl font-bold ${
                  classSummary.semFichaEscaneadaCount > 0 ? 'text-rose-950' : 'text-emerald-950'
                }`}
              >
                {classSummary.semFichaEscaneadaCount > 0
                  ? classSummary.semFichaEscaneadaCount
                  : classSummary.comFichaEscaneadaCount}
              </span>
              <span className={`text-xs sm:text-[13px] font-medium ${
                classSummary.semFichaEscaneadaCount > 0 ? 'text-rose-800' : 'text-emerald-800'
              }`}>
                {classSummary.semFichaEscaneadaCount > 0
                  ? `pendente(s) · ${classSummary.comFichaEscaneadaCount} em dia`
                  : '100% digitalizadas'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Barra de Filtros e Busca */}
      <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Campo de busca */}
        <div className="relative flex-1 min-w-0 w-full">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 text-[20px]">
            search
          </span>
          <input
            type="text"
            value={searchStudent}
            onChange={(e) => setSearchStudent(e.target.value)}
            placeholder="Buscar estudante por Nº, nome, RA, responsável..."
            className="w-full min-h-[48px] pl-11 pr-10 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-950 placeholder:text-slate-600 focus:outline-none focus:bg-slate-200/70 transition-colors"
          />
          {searchStudent && (
            <button
              type="button"
              onClick={() => setSearchStudent('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-black cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Filtros de Situação & Modos de Visualização */}
        <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-end w-full lg:w-auto min-w-0">
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl max-w-full">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-semibold transition-colors duration-100 cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#0b3b8c] text-white shadow-xs font-bold'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Todos ({orderedStudents.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ativos')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-semibold transition-colors duration-100 cursor-pointer ${
                statusFilter === 'ativos'
                  ? 'bg-[#0b3b8c] text-white shadow-xs font-bold'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Ativos ({classSummary.ativos})
            </button>
            {classSummary.semFichaEscaneadaCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('sem_ficha_pdf')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-semibold transition-colors duration-100 cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'sem_ficha_pdf'
                    ? 'bg-rose-700 text-white shadow-xs font-bold'
                    : 'text-rose-800 hover:bg-rose-100'
                }`}
              >
                <span>Sem Ficha Info. ({classSummary.semFichaEscaneadaCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatusFilter('onibus_fretado')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-colors duration-100 cursor-pointer ${
                statusFilter === 'onibus_fretado'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ônibus ({classSummary.onibusFretadoCount})
            </button>
            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => setStatusFilter('bolsa_familia')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-colors duration-100 cursor-pointer ${
                  statusFilter === 'bolsa_familia'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bolsa Família ({classSummary.bolsaFamiliaCount})
              </button>
            )}
            {(classSummary.transferidos + classSummary.remanejados > 0) && (
              <button
                type="button"
                onClick={() => setStatusFilter('movimentados')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-colors duration-100 cursor-pointer ${
                  statusFilter === 'movimentados'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Movimentados ({classSummary.transferidos + classSummary.remanejados})
              </button>
            )}
            {userRole === 'admin' && classSummary.alertaLegalCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('alerta')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-colors duration-100 cursor-pointer ${
                  statusFilter === 'alerta'
                    ? 'bg-rose-600 text-white shadow-2xs font-semibold'
                    : 'text-rose-700 hover:text-rose-900'
                }`}
              >
                Abaixo {minLegalPresence}% ({classSummary.alertaLegalCount})
              </button>
            )}
          </div>

          {/* Botão Expandir Todos */}
          <button
            type="button"
            onClick={() =>
              setExpandedStudentId((prev) => (prev === '__ALL__' ? null : '__ALL__'))
            }
            title="Expandir ou recolher resumo de todos"
            className="min-h-[42px] px-4 rounded-2xl text-xs sm:text-[13px] font-bold text-slate-900 hover:text-black bg-slate-100 hover:bg-slate-200/80 flex items-center gap-1.5 cursor-pointer transition-colors duration-100"
          >
            <span className="material-symbols-outlined text-[18px]">
              {expandedStudentId === '__ALL__' ? 'unfold_less' : 'unfold_more'}
            </span>
            <span>{expandedStudentId === '__ALL__' ? 'Recolher' : 'Expandir'}</span>
          </button>

          {/* Seletor de visualização */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Cartões"
              className={`min-h-[38px] px-3 rounded-lg text-xs sm:text-[13px] flex items-center gap-1.5 cursor-pointer transition-colors duration-100 ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">grid_view</span>
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              title="Lista"
              className={`min-h-[38px] px-3 rounded-lg text-xs sm:text-[13px] flex items-center gap-1.5 cursor-pointer transition-colors duration-100 ${
                viewMode === 'compact'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">view_agenda</span>
              <span className="hidden sm:inline">Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Tabela"
              className={`min-h-[38px] px-3 rounded-lg text-xs sm:text-[13px] flex items-center gap-1.5 cursor-pointer transition-colors duration-100 ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">table_rows</span>
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
              ? 'bg-amber-50 border-amber-300 text-slate-950 shadow-xs hover:shadow-md'
              : isRemanejado
              ? 'bg-purple-50 border-purple-300 text-slate-950 shadow-xs hover:shadow-md'
              : isOtherNonActive
              ? 'bg-slate-100 border-slate-300 text-slate-800 shadow-xs'
              : m.isBelowLegalThreshold
              ? 'bg-rose-50/90 border-rose-300 text-slate-950 shadow-xs hover:shadow-md'
              : 'bg-white border-slate-200 text-slate-950 shadow-xs hover:border-slate-300 hover:shadow-md';

            const numberBadgeClasses = isTransferred
              ? 'text-amber-900'
              : isRemanejado
              ? 'text-purple-900'
              : isOtherNonActive
              ? 'text-slate-700'
              : 'text-[#0b3b8c]';

            const cumulativeOccs = getStudentCumulativeOccurrences(student);
            const latestConsecOcc =
              cumulativeOccs.length > 0
                ? cumulativeOccs[cumulativeOccs.length - 1]
                : null;
            const consecDaysCount = latestConsecOcc
              ? latestConsecOcc.selectedDates.length
              : 0;

            const studentGenderInfo = getStudentGenderLabel(student);
            const guardian1Info = resolveGuardianRelationshipInfo(
              student.filiacao1 || student.guardianName,
              'filiacao1',
              student.notes
            );
            const guardian2Info = resolveGuardianRelationshipInfo(
              student.filiacao2,
              'filiacao2',
              student.notes
            );
            const isExpanded =
              expandedStudentId === '__ALL__' || expandedStudentId === student.id;
            const hasStudentPdf = Boolean(
              (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
                (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
            );

            return (
              <div
                key={student.id}
                onClick={() => {
                  setExpandedStudentId((prev) => (prev === student.id ? null : student.id));
                }}
                title={isExpanded ? 'Clique para recolher detalhes' : `Clique para expandir dados de ${studentGenderInfo.estudanteTerm}`}
                className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-3.5 cursor-pointer select-none transition-all duration-100 min-w-0 ${
                  isExpanded
                    ? 'col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 bg-white border-[#0b3b8c]/40 shadow-md'
                    : 'h-full min-h-[220px]'
                } ${cardColorClasses}`}
              >
                {/* Faixa para Estudantes Não Ativos */}
                {isNonActive && (
                  <div
                    className={`-mx-2 -mt-2 px-3 py-1.5 rounded-t-lg text-xs font-bold flex items-center justify-between gap-1.5 ${
                      isTransferred
                        ? 'bg-amber-200 text-amber-950'
                        : isRemanejado
                        ? 'bg-purple-200 text-purple-950'
                        : 'bg-slate-200 text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px]">
                        {isTransferred ? 'transfer_within_a_station' : 'swap_horiz'}
                      </span>
                      <span>
                        {isTransferred
                          ? `${studentGenderInfo.transferidoTerm} (Baixa)`
                          : isRemanejado
                          ? `${studentGenderInfo.remanejadoTerm} de Turma`
                          : `Não ativo · ${sit}`}
                      </span>
                    </span>
                    {student.dataMovimentacao && (
                      <span className="font-mono text-xs bg-white/80 px-1.5 py-0.5 rounded">
                        {student.dataMovimentacao}
                      </span>
                    )}
                  </div>
                )}

                {/* Topo do Card: Foto + Nº Ordem Numérica + RA + Gênero + Ação Expandir */}
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
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-700 font-medium min-w-0">
                        <span className={`text-xs font-bold tabular-nums shrink-0 ${numberBadgeClasses}`}>
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        {student.ra && (
                          <>
                            <span className="text-xs text-slate-700 tabular-nums font-semibold break-all">
                              RA {student.ra}{student.digRa ? `-${student.digRa}` : ''}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">·</span>
                          </>
                        )}
                        <span className="text-xs text-slate-700 shrink-0">
                          {studentGenderInfo.code === 'F' ? 'Menina' : 'Menino'}
                        </span>
                      </div>

                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedStudentId((prev) =>
                              prev === student.id ? null : student.id
                            );
                          }}
                          title={
                            isExpanded
                              ? 'Recolher detalhes'
                              : 'Expandir dados completos'
                          }
                          aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir dados completos'}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <span
                            className={`material-symbols-outlined text-[18px] transition-transform duration-100 ${
                              isExpanded ? 'rotate-180 text-[#0b3b8c]' : ''
                            }`}
                          >
                            expand_more
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Nome Oficial do Estudante */}
                    <h3
                      className={`text-base font-bold leading-snug break-words mt-1 ${
                        isTransferred
                          ? 'text-amber-950'
                          : isRemanejado
                          ? 'text-purple-950'
                          : 'text-slate-950'
                      }`}
                    >
                      {student.name}
                    </h3>

                    {/* Metadados por Exceção (Alto Contraste) */}
                    {(isNonActive || student.rotaOnibus || student.deficiencia || consecDaysCount >= 3) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                        {isTransferred ? (
                          <span className="text-amber-900 text-xs font-bold">
                            {studentGenderInfo.transferidoTerm}
                          </span>
                        ) : isRemanejado ? (
                          <span className="text-purple-900 text-xs font-bold">
                            {studentGenderInfo.remanejadoTerm}
                          </span>
                        ) : isOtherNonActive ? (
                          <span className="text-slate-700 text-xs font-bold">
                            {sit}
                          </span>
                        ) : null}

                        {student.rotaOnibus && (
                          <>
                            {isNonActive && <span className="text-slate-400" aria-hidden="true">·</span>}
                            <span className="text-xs text-[#0b3b8c] font-semibold">
                              Rota {student.rotaOnibus.replace(/[^0-9]/g, '') || student.rotaOnibus.split('-')[0].trim()}
                            </span>
                          </>
                        )}

                        {student.deficiencia && (
                          <>
                            {(isNonActive || student.rotaOnibus) && <span className="text-slate-400" aria-hidden="true">·</span>}
                            <span className="text-xs text-purple-800 font-bold">
                              AEE
                            </span>
                          </>
                        )}

                        {consecDaysCount >= 3 && (
                          <>
                            {(isNonActive || student.rotaOnibus || student.deficiencia) && <span className="text-slate-400" aria-hidden="true">·</span>}
                            <span
                              className={`text-xs font-bold flex items-center gap-0.5 ${
                                consecDaysCount >= 5 ? 'text-rose-800' : 'text-amber-800'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                warning
                              </span>
                              <span>{consecDaysCount} faltas</span>
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Vínculo Familiar e Contato Rápido */}
                <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-xs sm:text-[13px] min-w-0">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-xs uppercase tracking-wider text-slate-600 font-bold w-9 shrink-0">
                      {guardian1Info.shortRoleLabel}
                    </span>
                    <span className="text-slate-900 font-semibold min-w-0 flex-1 break-words leading-snug">
                      {guardian1Info.cleanName}
                    </span>
                  </div>
                  {guardian2Info.cleanName && (
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-xs uppercase tracking-wider text-slate-600 font-bold w-9 shrink-0">
                        {guardian2Info.shortRoleLabel}
                      </span>
                      <span className="text-slate-900 font-semibold min-w-0 flex-1 break-words leading-snug">
                        {guardian2Info.cleanName}
                      </span>
                    </div>
                  )}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs min-w-0"
                  >
                    {(() => {
                      const waList = buildWhatsAppLinksFromPhoneString(
                        student.telefones || student.guardianPhone,
                        student.name
                      );
                      if (waList.length === 0) {
                        return (
                          <span className="text-xs font-medium text-slate-600">
                            Sem telefone
                          </span>
                        );
                      }
                      return (
                        <a
                          href={waList[0].waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`WhatsApp: ${waList[0].display}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950 hover:underline tabular-nums cursor-pointer min-w-0 max-w-full"
                        >
                          <span className="material-symbols-outlined text-[15px] shrink-0">chat</span>
                          <span className="break-all leading-snug">{waList[0].display}</span>
                        </a>
                      );
                    })()}
                    {student.dataNascimento && (
                      <span className="text-xs tabular-nums text-slate-600 shrink-0 font-semibold">
                        {student.dataNascimento}
                      </span>
                    )}
                  </div>
                </div>

                {/* Visualização Prévia e Expansão de Dados Fluida */}
                {isExpanded && renderStudentDetailedExpansion(student)}

                {/* Ações do Cartão recolhido: Ficha Completa & Ficha Informativa do Estudante */}
                {!isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="pt-2 grid grid-cols-1 min-[360px]:grid-cols-2 sm:flex items-center gap-2 min-w-0"
                  >
                    {onOpenStudentGrid && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenStudentGrid(student);
                        }}
                        className="flex-1 min-h-[42px] py-2 px-3 rounded-xl text-xs sm:text-[13px] font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors duration-100"
                      >
                        <span className="material-symbols-outlined text-[17px] text-[#0b3b8c] shrink-0">
                          badge
                        </span>
                        <span>Ver Ficha</span>
                      </button>
                    )}

                    {onOpenStudentPdf && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenStudentPdf(student);
                        }}
                        title={
                          hasStudentPdf
                            ? `Abrir Ficha Informativa do Estudante (${student.name})`
                            : `Estudante sem Ficha Informativa digitalizada`
                        }
                        className={`flex-1 min-h-[42px] py-2 px-3 rounded-xl text-xs sm:text-[13px] font-bold flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                          hasStudentPdf
                            ? 'bg-[#0052cc] hover:bg-[#003e99] text-white shadow-xs'
                            : 'bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-900'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[17px] shrink-0">
                          {hasStudentPdf ? 'picture_as_pdf' : 'upload_file'}
                        </span>
                        <span>
                          {hasStudentPdf ? 'Ficha Informativa' : 'Sem Ficha Info.'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODO 2: LISTA COMPACTA (Ordem Numérica + Expansão Fluida Inline) */}
      {viewMode === 'compact' && (
        <div className="space-y-2.5">
          {filteredStudents.map((student) => {
            const m = getStudentAttendanceMetrics(
              student,
              diasLetivosMes,
              OFFICIAL_OCTOBER_DAYS
            );
            const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
            const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
            const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
            const isOtherNonActive =
              !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';
            const studentGenderInfo = getStudentGenderLabel(student);
            const guardian1Info = resolveGuardianRelationshipInfo(
              student.filiacao1 || student.guardianName,
              'filiacao1',
              student.notes
            );
            const guardian2Info = resolveGuardianRelationshipInfo(
              student.filiacao2,
              'filiacao2',
              student.notes
            );
            const isExpanded =
              expandedStudentId === '__ALL__' || expandedStudentId === student.id;

            const hasPdf = Boolean(
              (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
                (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
            );

            return (
              <div
                key={student.id}
                onClick={() =>
                  setExpandedStudentId((prev) => (prev === student.id ? null : student.id))
                }
                title={isExpanded ? 'Clique para fechar detalhes' : 'Clique para expandir dados'}
                className={`p-3.5 sm:px-5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all shadow-2xs ${
                  isTransferred
                    ? 'bg-amber-50 hover:bg-amber-100/70'
                    : isRemanejado
                    ? 'bg-purple-50 hover:bg-purple-100/70'
                    : isOtherNonActive
                    ? 'bg-slate-100'
                    : m.isBelowLegalThreshold
                    ? 'bg-rose-50/70 hover:bg-rose-50'
                    : 'bg-white hover:bg-slate-50/80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`w-8 h-8 rounded-xl text-white font-semibold text-xs flex items-center justify-center shrink-0 tabular-nums ${
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
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                        <span className="font-semibold text-sm sm:text-base text-[#003440] break-words leading-snug">
                          {student.name}
                        </span>
                        {isTransferred && (
                          <span className="text-xs font-semibold text-amber-800">
                            · {studentGenderInfo.transferidoTerm}
                          </span>
                        )}
                        {isRemanejado && (
                          <span className="text-xs font-semibold text-purple-800">
                            · Mudou de Turma
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 break-words leading-snug mt-0.5 min-w-0">
                        <span>
                          {guardian1Info.shortRoleLabel}: {guardian1Info.cleanName}
                        </span>
                        {guardian2Info.cleanName && guardian2Info.cleanName.toLowerCase() !== 'não informado' && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>
                              {guardian2Info.shortRoleLabel}: {guardian2Info.cleanName}
                            </span>
                          </>
                        )}
                        {student.telefones && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-emerald-800 tabular-nums font-medium break-all">
                              {student.telefones}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto shrink-0">
                    {onOpenStudentPdf && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenStudentPdf(student);
                        }}
                        title={`Abrir Ficha Informativa do Estudante (${student.name})`}
                        className={`flex-1 sm:flex-initial min-h-[42px] py-2 px-4 rounded-xl font-bold text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors duration-100 ${
                          hasPdf
                            ? 'bg-[#0052cc] hover:bg-[#003e99] text-white shadow-xs'
                            : 'bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-900'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[17px] shrink-0">
                          {hasPdf ? 'picture_as_pdf' : 'description'}
                        </span>
                        <span>{hasPdf ? 'Ficha Informativa' : 'Sem Ficha Info.'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedStudentId((prev) =>
                          prev === student.id ? null : student.id
                        );
                      }}
                      className="flex-1 sm:flex-initial min-h-[42px] py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-1 cursor-pointer transition-colors duration-100"
                    >
                      <span>{isExpanded ? 'Fechar' : 'Ver Dados'}</span>
                      <span
                        className={`material-symbols-outlined text-[18px] shrink-0 transition-transform duration-100 ${
                          isExpanded ? 'rotate-180 text-[#0071e3]' : ''
                        }`}
                      >
                        expand_more
                      </span>
                    </button>
                  </div>
                </div>

                {isExpanded && renderStudentDetailedExpansion(student)}
              </div>
            );
          })}
        </div>
      )}

      {/* MODO 3: TABELA NOMINAL COMPLETA (Expansão ajustada à largura da tela em qualquer dispositivo) */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-3xl overflow-x-auto shadow-2xs">
          {/* Legenda Visual Rápida de Faltas Consecutivas (3, 5 e 10 Dias) */}
          <div className="px-4 py-3 bg-[#f7f9f8] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[#003440]">
              <span className="material-symbols-outlined text-[17px] text-[#ba1a1a]">
                notification_important
              </span>
              <span>Código de Cores — Faltas Seguidas na Tabela:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fffbeb] text-[#92400e] border border-[#f59e0b]/40 font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                <span>3+ Dias Seguidos (Atenção)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fff7ed] text-[#9a3412] border border-[#ea580c]/40 font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#ea580c]" />
                <span>5+ Dias Seguidos (Busca Ativa)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fff1f2] text-[#9f1239] border border-[#e11d48]/40 font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#e11d48]" />
                <span>10+ Dias Seguidos (Evasão Crítica)</span>
              </span>
            </div>
          </div>

          <table className="w-full text-left text-xs sm:text-[13px] border-collapse min-w-[1160px]">
            <thead className="bg-[#f7f9f8] text-[#003440] border-b border-black/[0.06] font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="py-3 px-3 text-center">Nº</th>
                <th className="py-3 px-3">Estudante &amp; Ficha Informativa do Estudante</th>
                <th className="py-3 px-2.5 text-center">Alerta Faltas Seguidas (3 / 5 / 10 dias)</th>
                <th className="py-3 px-2.5">Registro (RA)</th>
                <th className="py-3 px-3">Filiação 1 (Mãe / Pai / Avó / Tia...)</th>
                <th className="py-3 px-3">Filiação 2 (Pai / Mãe / Avô / Tio...)</th>
                <th className="py-3 px-2.5">Telefone / E-mail</th>
                <th className="py-3 px-2.5 text-center">Presença no Mês</th>
                <th className="py-3 px-2.5 text-center">Faltas no Mês</th>
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
                const consecInfo = getStudentConsecutiveAlertInfo(student);
                const pctFalta =
                  m.diasLetivosMatriculados > 0
                    ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
                    : 0;
                const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
                const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
                const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
                const isOtherNonActive =
                  !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';

                const studentGenderInfo = getStudentGenderLabel(student);
                const guardian1Info = resolveGuardianRelationshipInfo(
                  student.filiacao1 || student.guardianName,
                  'filiacao1',
                  student.notes
                );
                const guardian2Info = resolveGuardianRelationshipInfo(
                  student.filiacao2,
                  'filiacao2',
                  student.notes
                );

                const rowColorClass = isTransferred
                  ? 'bg-[#fef3c7]/75 hover:bg-[#fde68a]/75'
                  : isRemanejado
                  ? 'bg-[#ede9fe]/75 hover:bg-[#ddd6fe]/75'
                  : isOtherNonActive
                  ? 'bg-[#e2e8f0]/75'
                  : consecInfo.tier === '10d'
                  ? 'bg-[#fff1f2] hover:bg-[#ffe4e6]'
                  : consecInfo.tier === '5d'
                  ? 'bg-[#fff7ed] hover:bg-[#ffedd5]'
                  : consecInfo.tier === '3d'
                  ? 'bg-[#fffbeb] hover:bg-[#fef3c7]'
                  : m.isBelowLegalThreshold
                  ? 'bg-[#fff9f8] hover:bg-[#fff0ee]'
                  : 'hover:bg-[#f4f8f6]';

                const isExpanded =
                  expandedStudentId === '__ALL__' || expandedStudentId === student.id;

                return (
                  <React.Fragment key={student.id}>
                    <tr
                      onClick={() =>
                        setExpandedStudentId((prev) => (prev === student.id ? null : student.id))
                      }
                      className={`cursor-pointer transition-colors ${rowColorClass} ${
                        isExpanded ? 'ring-1 ring-[#003440]/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedStudentId((prev) =>
                                prev === student.id ? null : student.id
                              );
                            }}
                            title={isExpanded ? 'Recolher detalhes' : 'Expandir dados completos'}
                            className="p-0.5 rounded hover:bg-black/10 text-[#003440] cursor-pointer"
                          >
                            <span
                              className={`material-symbols-outlined text-[16px] transition-transform ${
                                isExpanded ? 'rotate-180 text-[#0071e3]' : ''
                              }`}
                            >
                              expand_more
                            </span>
                          </button>
                          <span className="font-mono font-semibold text-[#003440] text-xs tabular-nums">
                            {student.number.toString().padStart(2, '0')}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StudentAvatar
                              student={student}
                              size="sm"
                              expandableOnClick={true}
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-[#003440] break-words block leading-snug">
                                {student.name}
                              </span>
                              <span
                                className={`inline-block px-2 py-0.5 rounded font-semibold text-xs mt-0.5 ${
                                  studentGenderInfo.code === 'F'
                                    ? 'bg-[#ffdad6]/60 text-[#93000a]'
                                    : 'bg-[#d3e4ff]/75 text-[#001c38]'
                                }`}
                              >
                                {studentGenderInfo.estudanteTitle}
                              </span>
                            </div>
                          </div>
                          {onOpenStudentPdf && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onOpenStudentPdf(student);
                              }}
                              title={`Abrir Ficha Informativa do Estudante (${student.name})`}
                              className={`min-h-[36px] px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                                (student.fichaPdfDriveUrl &&
                                  student.fichaPdfDriveUrl.trim().length > 0) ||
                                (student.fichaPdfDriveId &&
                                  student.fichaPdfDriveId.trim().length > 0)
                                  ? 'bg-[#0052cc] hover:bg-[#003e99] text-white'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                picture_as_pdf
                              </span>
                              <span>
                                {(student.fichaPdfDriveUrl &&
                                  student.fichaPdfDriveUrl.trim().length > 0) ||
                                (student.fichaPdfDriveId &&
                                  student.fichaPdfDriveId.trim().length > 0)
                                  ? 'Ficha Informativa'
                                  : 'Sem Ficha Info.'}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {consecInfo.tier !== 'none' ? (
                          <div className="inline-flex flex-col items-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-xs uppercase tabular-nums ${consecInfo.badgeBgClass} ${consecInfo.badgeTextClass}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                {consecInfo.icon}
                              </span>
                              <span>{consecInfo.shortBadge}</span>
                            </span>
                            <span className="text-xs font-semibold text-[#41484b] mt-0.5">
                              {consecInfo.tier === '10d'
                                ? 'Evasão Crítica'
                                : consecInfo.tier === '5d'
                                ? 'Busca Ativa'
                                : 'Contato Família'}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-md bg-[#eaf6ef] text-[#005035] font-bold text-xs">
                            Em dia (sem alerta)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 tabular-nums text-slate-700 font-medium">
                        {student.ra}-{student.digRa}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#1c1c1e]">
                        <span className="text-xs font-semibold uppercase text-[#005035] block">
                          {guardian1Info.roleLabel}
                        </span>
                        <span className="break-words">{guardian1Info.cleanName}</span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#1c1c1e]">
                        <span className="text-xs font-semibold uppercase text-[#003440] block">
                          {guardian2Info.roleLabel}
                        </span>
                        <span className="break-words">{guardian2Info.cleanName}</span>
                      </td>
                      <td className="py-2.5 px-2.5 text-xs">
                        <div className="text-[#005035] font-semibold tabular-nums">
                          {student.telefones || '—'}
                        </div>
                        <div className="text-[#5a676b] break-all max-w-[200px] leading-snug">
                          {student.emailMunicipal || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-bold tabular-nums text-[#005035]">
                        {m.presencas}/{m.diasLetivosMatriculados} dias ({m.frequenciaPercent}%)
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-bold tabular-nums text-[#ba1a1a]">
                        {m.faltas} ({pctFalta}%)
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
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
                            ? studentGenderInfo.transferidoTerm.toUpperCase()
                            : isRemanejado
                            ? studentGenderInfo.remanejadoTerm.toUpperCase()
                            : studentGenderInfo.ativoTerm.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/70 animate-gentle-fade">
                        <td colSpan={10} className="p-3 sm:p-4">
                          <div className="sticky left-0 w-[calc(100vw-2.5rem)] max-w-full lg:w-full">
                            {renderStudentDetailedExpansion(student)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast de Confirmação de Download .XLS */}
      {exportSuccessToast && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-100">
          <div className="bg-[#003440] text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-white/15 flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px] text-[#a4f3ca]">
              download_done
            </span>
            <p className="text-sm font-bold leading-snug">{exportSuccessToast}</p>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-gentle-fade"
            onClick={() => setIsExportXlsModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-6xl rounded-3xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[92vh] animate-apple-pop"
            >
              {/* Cabeçalho do Modal de Exportação .XLS */}
              <div className="bg-white px-5 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">table_view</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Exportação da Turma · Formato .{exportFileFormat}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {selectedColDefs.length} colunas · {previewData.rows.length} estudantes
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight leading-tight mt-0.5 break-words">
                      Baixar Planilha da Turma {classGroup.name}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExecuteDownloadXLS}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-[13px] flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>Baixar Planilha (.{exportFileFormat})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExportXlsModalOpen(false)}
                    className="w-10 h-10 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
                    aria-label="Fechar"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>

              {/* Corpo Principal Rolável */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* 1. Modelos Rápidos (Presets de Colunas) */}
                <div className="bg-white rounded-2xl p-4 border border-black/[0.06] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#003440] flex items-center gap-1.5">
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
                        className="px-2.5 py-1 rounded-lg bg-[#eaf6ef] hover:bg-[#d5f0e0] text-[#005035] font-bold text-xs cursor-pointer"
                      >
                        Marcar Todas ({CLASS_EXPORT_COLUMNS.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSelectedColumns(DEFAULT_CLASS_EXPORT_COLUMN_IDS)}
                        className="px-2.5 py-1 rounded-lg bg-[#f2f4f3] hover:bg-[#e5e9e7] text-[#003440] font-bold text-xs cursor-pointer"
                      >
                        Restaurar Padrão
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSelectedColumns(['numeroChamada', 'estudante'])}
                        className="px-2.5 py-1 rounded-lg bg-[#fff8f7] hover:bg-[#ffdad6] text-[#ba1a1a] font-bold text-xs cursor-pointer"
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
                            <span className="font-semibold text-xs sm:text-[13px] text-[#003440]">
                              {preset.label}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#003440]/10 text-[#003440] font-mono font-bold text-xs">
                              {preset.columnIds.length} colunas
                            </span>
                          </div>
                          <p className="text-xs text-[#5a676b] break-words leading-snug">
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
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#5a676b] block">
                      Ordem dos Estudantes (Linhas)
                    </label>
                    <select
                      value={exportSortBy}
                      onChange={(e) => setExportSortBy(e.target.value as ClassExportSortOrder)}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f5f7f6] border border-black/[0.08] text-sm font-bold text-[#003440]"
                    >
                      <option value="number_asc">Nº da Chamada (01, 02, 03...)</option>
                      <option value="name_asc">Ordem Alfabética (A → Z)</option>
                      <option value="name_desc">Ordem Alfabética (Z → A)</option>
                      <option value="absences_desc">Maior Falta Total primeiro</option>
                      <option value="presence_asc">Menor % Presença primeiro</option>
                    </select>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 border border-black/[0.06] space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#5a676b] block">
                      Filtrar Estudantes na Planilha
                    </label>
                    <select
                      value={exportStatusFilter}
                      onChange={(e) =>
                        setExportStatusFilter(e.target.value as ClassExportStatusFilter)
                      }
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f5f7f6] border border-black/[0.08] text-sm font-bold text-[#003440]"
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
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#5a676b] block">
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
                      <span className="text-xs font-semibold text-[#003440] block">
                        Aba Resumo / Alta da Turma
                      </span>
                      <span className="text-xs text-[#5a676b] block">
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
                      <h3 className="text-sm font-semibold text-[#003440] flex items-center gap-1.5">
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
                          className="w-full min-h-[38px] pl-8 pr-2.5 rounded-xl bg-[#f5f7f6] text-xs font-medium text-[#1c1c1e] focus:outline-none focus:bg-white border border-black/[0.06]"
                        />
                      </div>
                    </div>

                    {/* Filtro por Categoria */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setActiveCategoryFilter('all')}
                        className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
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
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
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
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer select-none transition-all min-w-0 ${
                              isChecked
                                ? 'bg-[#eaf6ef]/70 border-[#005035]/40 text-[#003440]'
                                : 'bg-[#f9faf9] hover:bg-[#f2f4f3] border-black/[0.05] text-[#5a676b]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleColumn(col.id)}
                                className="w-4 h-4 accent-[#005035] rounded cursor-pointer shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-xs block break-words leading-snug">
                                  {col.shortLabel}
                                </span>
                                <span className="font-mono text-xs opacity-75 block break-words leading-snug">
                                  {col.label}
                                </span>
                              </div>
                            </div>

                            {isChecked && (
                              <span className="px-2 py-0.5 rounded-md bg-[#005035] text-white font-mono font-semibold text-xs shrink-0">
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
                        <h3 className="text-sm font-semibold text-[#003440] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px] text-[#005035]">
                            swap_vert
                          </span>
                          <span>3. Ordem das Colunas ({selectedColDefs.length})</span>
                        </h3>
                        <p className="text-xs text-[#5a676b]">
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
                          className="p-2.5 rounded-xl bg-[#f7f9f8] hover:bg-[#eef3f1] border border-black/[0.06] flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-7 h-7 rounded-lg bg-[#003440] text-white font-mono font-semibold text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-xs text-[#003440] block break-words leading-snug">
                                {col.shortLabel}
                              </span>
                              <span className="font-mono text-xs text-[#5a676b] block break-words leading-snug">
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
                              className="w-8 h-8 rounded-lg bg-white hover:bg-[#eaf6ef] text-[#003440] border border-black/[0.06] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                keyboard_double_arrow_up
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveColumn(idx, 'up')}
                              title="Subir posição"
                              className="w-8 h-8 rounded-lg bg-white hover:bg-[#eaf6ef] text-[#003440] border border-black/[0.06] flex items-center justify-center disabled:opacity-30 cursor-pointer"
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
                              className="w-8 h-8 rounded-lg bg-white hover:bg-[#eaf6ef] text-[#003440] border border-black/[0.06] flex items-center justify-center disabled:opacity-30 cursor-pointer"
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
                              className="w-8 h-8 rounded-lg bg-[#fff8f7] hover:bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]/20 flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#003440] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[17px] text-[#005035]">
                        preview
                      </span>
                      <span>
                        Prévia das Colunas e Ordem na Planilha .
                        {exportFileFormat.toUpperCase()} (Primeiros 4 registros)
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-[#5a676b]">
                      Total a exportar: {previewData.rows.length} linhas ×{' '}
                      {previewData.headers.length} colunas
                    </span>
                  </div>

                  <div className="border border-black/[0.08] rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
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
                <div className="text-xs text-[#5a676b] font-medium">
                  Arquivo:{' '}
                  <strong className="font-mono text-[#003440]">
                    Planilha_{classGroup.name.replace(/\s+/g, '_')}_2027.{exportFileFormat}
                  </strong>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsExportXlsModalOpen(false)}
                    className="min-h-[42px] px-4 rounded-xl bg-[#f2f4f3] hover:bg-[#e5e9e7] text-[#3c3c43] font-bold text-sm cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteDownloadXLS}
                    className="min-h-[42px] px-5 rounded-xl bg-[#005035] hover:bg-[#003d28] text-white font-semibold text-sm flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-97"
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
