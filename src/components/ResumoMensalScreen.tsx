import React, { useState, useMemo, useEffect } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { MONTHLY_SCHOOL_DAYS_2027 } from '../data/mockData';
import {
  isStudentEducacaoInfantil,
  getStudentConsecutiveAlertInfo,
  getDefaultReferencePeriod,
} from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';
import { StudentDataExpansionPanel } from './StudentDataExpansionPanel';
import { AttendanceDailyHeatmap } from './AttendanceDailyHeatmap';

export interface ResumoMensalScreenProps {
  currentClass: ClassGroup;
  allClasses: ClassGroup[];
  userRole?: UserRole;
  onSelectClass: (cls: ClassGroup) => void;
  onSaveNotes?: (notes: string) => void;
  onOpenMonthlyLaunchForClass?: (cls: ClassGroup) => void;
  onOpenReportPrint?: () => void;
  onNavigateToSheet?: () => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onBack?: () => void;
}

interface EvaluatedStudentSnapshot {
  student: Student;
  cls: ClassGroup;
  diasLetivos: number;
  presencas: number;
  faltas: number;
  atestados: number;
  semAtestado: number;
  frequenciaPercent: number;
  minLegalPercent: number;
  isInfantil: boolean;
  isBelowLegal: boolean;
  hasConsecutiveAlert: boolean;
  consecutiveAlertDays: number;
  consecutiveAlertTier: 'none' | '3d' | '5d' | '10d';
  alertLabel: string;
  familyFeedback?: string;
}

const computeStudentSnapshot = (
  student: Student,
  cls: ClassGroup,
  monthName: string,
  defaultDays: number
): EvaluatedStudentSnapshot => {
  const configuredDays =
    (cls.monthlySchoolDays && cls.monthlySchoolDays[monthName]) ||
    (monthName === 'Outubro' ? cls.classesHeld : undefined) ||
    defaultDays;

  const explicit = student.monthlyAttendanceByMonth?.[monthName];
  let diasLetivos = configuredDays;
  let faltas = 0;
  let atestados = 0;

  if (explicit) {
    diasLetivos = Math.max(1, Math.min(configuredDays, explicit.diasLetivosRecorte || configuredDays));
    faltas = Math.max(0, Math.min(diasLetivos, explicit.faltas || 0));
    atestados = Math.max(0, Math.min(faltas, explicit.atestados || 0));
  } else if (monthName === 'Outubro') {
    diasLetivos = Math.max(1, Math.min(configuredDays, student.diasLetivosRecorte || configuredDays));
    faltas = Math.max(0, Math.min(diasLetivos, student.totalAbsencesMonth || 0));
    atestados = Math.max(0, Math.min(faltas, student.justifiedAbsences || 0));
  } else {
    const baseFaltas = student.totalAbsencesMonth || 0;
    const baseAtest = Math.min(baseFaltas, student.justifiedAbsences || 0);
    const mIdx = MONTHLY_SCHOOL_DAYS_2027.findIndex((m) => m.month === monthName);
    if (baseFaltas >= 4) {
      faltas = Math.min(configuredDays, Math.max(1, baseFaltas - (mIdx % 2)));
      atestados = Math.min(faltas, baseAtest);
    } else if (baseFaltas > 0) {
      faltas = (student.number + mIdx) % 2 === 0 ? baseFaltas : Math.max(0, baseFaltas - 1);
      atestados = Math.min(faltas, baseAtest);
    }
  }

  const presencas = Math.max(0, diasLetivos - faltas);
  const frequenciaPercent = diasLetivos > 0 ? Math.round((presencas / diasLetivos) * 100) : 100;
  const isInfantil = isStudentEducacaoInfantil(student, cls.name);
  const minLegalPercent = isInfantil ? 60 : 75;
  const isBelowLegal = frequenciaPercent < minLegalPercent;

  const alertInfo = getStudentConsecutiveAlertInfo(student);

  return {
    student,
    cls,
    diasLetivos,
    presencas,
    faltas,
    atestados,
    semAtestado: Math.max(0, faltas - atestados),
    frequenciaPercent,
    minLegalPercent,
    isInfantil,
    isBelowLegal,
    hasConsecutiveAlert: alertInfo.tier !== 'none',
    consecutiveAlertDays: alertInfo.days,
    consecutiveAlertTier: alertInfo.tier,
    alertLabel: alertInfo.label,
    familyFeedback: alertInfo.familyFeedback,
  };
};

export const ResumoMensalScreen: React.FC<ResumoMensalScreenProps> = ({
  currentClass,
  allClasses,
  onSelectClass,
  onSaveNotes,
  onOpenReportPrint,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onBack,
}) => {
  // Slicers de controle analítico sóbrio - padrão mês anterior ao vigente
  const [selectedMonthName, setSelectedMonthName] = useState<string>(() => {
    const defaultRef = getDefaultReferencePeriod();
    const match = MONTHLY_SCHOOL_DAYS_2027.find(
      (m) => m.month.toLowerCase() === defaultRef.monthName.toLowerCase()
    );
    return match ? match.month : 'Setembro';
  });
  const [scopeFilter, setScopeFilter] = useState<'all_classes' | string>('all_classes');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'infantil' | 'fundamental'>('all');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');

  // Filtros operacionais e busca do painel
  const [searchQuery, setSearchQuery] = useState('');
  const [alertFilterMode, setAlertFilterMode] = useState<
    'all_alerts' | 'below_mec' | 'consecutive' | 'no_certificate' | 'all'
  >('all_alerts');

  // Expansão visual detalhada de estudantes (sem sair da tela)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // Despacho da gestão escolar
  const [pedagogicalNotes, setPedagogicalNotes] = useState(currentClass.pedagogicalNotes || '');
  const [notesSavedFeedback, setNotesSavedFeedback] = useState(false);

  useEffect(() => {
    setPedagogicalNotes(currentClass.pedagogicalNotes || '');
  }, [currentClass.id, currentClass.pedagogicalNotes]);

  const monthDef = useMemo(
    () =>
      MONTHLY_SCHOOL_DAYS_2027.find((m) => m.month === selectedMonthName) ||
      MONTHLY_SCHOOL_DAYS_2027[8],
    [selectedMonthName]
  );
  const currentMonthIdx = useMemo(
    () =>
      MONTHLY_SCHOOL_DAYS_2027.findIndex(
        (m) => m.month.toLowerCase() === selectedMonthName.toLowerCase()
      ),
    [selectedMonthName]
  );
  const previousPeriodMeta = currentMonthIdx > 0 ? MONTHLY_SCHOOL_DAYS_2027[currentMonthIdx - 1] : null;
  const previousPeriodName = previousPeriodMeta?.month || null;
  const nextPeriodMeta =
    currentMonthIdx >= 0 && currentMonthIdx < MONTHLY_SCHOOL_DAYS_2027.length - 1
      ? MONTHLY_SCHOOL_DAYS_2027[currentMonthIdx + 1]
      : null;
  const nextPeriodName = nextPeriodMeta?.month || null;

  // Turmas no escopo
  const filteredClasses = useMemo(() => {
    return allClasses.filter((cls) => {
      if (scopeFilter !== 'all_classes' && cls.id !== scopeFilter) return false;
      const shiftClean = cls.shift.toUpperCase().includes('MANH') ? 'MANHÃ' : 'TARDE';
      if (shiftFilter !== 'all' && shiftClean !== shiftFilter) return false;
      const isInf =
        cls.name.toUpperCase().startsWith('GRUPO') || cls.name.toUpperCase().startsWith('G');
      if (segmentFilter === 'infantil' && !isInf) return false;
      if (segmentFilter === 'fundamental' && isInf) return false;
      return true;
    });
  }, [allClasses, scopeFilter, shiftFilter, segmentFilter]);

  // Agregações analíticas e KPIs MEC
  const kpiData = useMemo(() => {
    const classMetrics: Array<{
      cls: ClassGroup;
      classId: string;
      className: string;
      shortName: string;
      shift: string;
      teacherName: string;
      isInfantil: boolean;
      minLegalPercent: number;
      activeStudents: number;
      frequencyRate: number;
      totalFaltas: number;
      totalAtestados: number;
      totalSemAtestado: number;
      belowLegalCount: number;
      consecutiveAlertsCount: number;
    }> = [];

    const evaluatedStudents: EvaluatedStudentSnapshot[] = [];

    let totalDiasLetivosMatriculados = 0;
    let totalPresencas = 0;
    let totalFaltas = 0;
    let totalAtestados = 0;
    let totalBelowLegal = 0;
    let totalBelowInfantil = 0;
    let totalBelowFundamental = 0;
    let totalConsecutiveAlerts = 0;
    let tier3Count = 0;
    let tier5Count = 0;
    let tier10Count = 0;

    filteredClasses.forEach((cls) => {
      const activeStudents = cls.students.filter((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
      });

      let clsDias = 0;
      let clsPres = 0;
      let clsFaltas = 0;
      let clsAtest = 0;
      let clsBelow = 0;
      let clsConsec = 0;

      activeStudents.forEach((st) => {
        const snap = computeStudentSnapshot(st, cls, selectedMonthName, monthDef.schoolDays);
        evaluatedStudents.push(snap);

        clsDias += snap.diasLetivos;
        clsPres += snap.presencas;
        clsFaltas += snap.faltas;
        clsAtest += snap.atestados;

        if (snap.isBelowLegal) {
          clsBelow += 1;
          if (snap.isInfantil) totalBelowInfantil += 1;
          else totalBelowFundamental += 1;
        }

        if (snap.hasConsecutiveAlert) {
          clsConsec += 1;
          if (snap.consecutiveAlertTier === '3d') tier3Count += 1;
          else if (snap.consecutiveAlertTier === '5d') tier5Count += 1;
          else if (snap.consecutiveAlertTier === '10d') tier10Count += 1;
        }
      });

      totalDiasLetivosMatriculados += clsDias;
      totalPresencas += clsPres;
      totalFaltas += clsFaltas;
      totalAtestados += clsAtest;
      totalBelowLegal += clsBelow;
      totalConsecutiveAlerts += clsConsec;

      const freqRate = clsDias > 0 ? Math.round((clsPres / clsDias) * 100) : 100;
      const isInf =
        cls.name.toUpperCase().startsWith('GRUPO') || cls.name.toUpperCase().startsWith('G');

      classMetrics.push({
        cls,
        classId: cls.id,
        className: cls.name,
        shortName: cls.turmaAbrev || cls.name.replace('GRUPO ', 'G'),
        shift: cls.shift.replace('Turno ', ''),
        teacherName: cls.teacherFirstName || cls.teacherName || 'Regente',
        isInfantil: isInf,
        minLegalPercent: isInf ? 60 : 75,
        activeStudents: activeStudents.length,
        frequencyRate: freqRate,
        totalFaltas: clsFaltas,
        totalAtestados: clsAtest,
        totalSemAtestado: Math.max(0, clsFaltas - clsAtest),
        belowLegalCount: clsBelow,
        consecutiveAlertsCount: clsConsec,
      });
    });

    const totalActiveStudents = evaluatedStudents.length;

    const overallFrequencyRate =
      totalDiasLetivosMatriculados > 0
        ? Math.round((totalPresencas / totalDiasLetivosMatriculados) * 100)
        : 100;

    const totalSemAtestado = Math.max(0, totalFaltas - totalAtestados);
    const justifiedSharePercent =
      totalFaltas > 0 ? Math.round((totalAtestados / totalFaltas) * 100) : 0;

    const targetLegalMec =
      segmentFilter === 'infantil' ? 60 : segmentFilter === 'fundamental' ? 75 : 70;

    // Cálculo oficial de Permanência Escolar (MEC)
    // Estudantes sem risco severo de abandono (10+ faltas consecutivas ou frequência < 50%)
    const severeDropRiskCount = evaluatedStudents.filter(
      (s) => s.consecutiveAlertTier === '10d' || s.frequenciaPercent < 50
    ).length;

    const permanenceRate =
      totalActiveStudents > 0
        ? Number((((totalActiveStudents - severeDropRiskCount) / totalActiveStudents) * 100).toFixed(1))
        : 100;

    // Alunos que atingem a frequência mínima exigida por lei (LDB 60% infantil / 75% fundamental)
    const studentsMeetingMecTargetCount = totalActiveStudents - totalBelowLegal;
    const studentsMeetingMecTargetPercent =
      totalActiveStudents > 0
        ? Math.round((studentsMeetingMecTargetCount / totalActiveStudents) * 100)
        : 100;

    return {
      totalActiveStudents,
      totalDiasLetivosMatriculados,
      totalPresencas,
      overallFrequencyRate,
      targetLegalMec,
      meetsLegalMec: overallFrequencyRate >= targetLegalMec,
      meetsSchoolTarget: overallFrequencyRate >= 85,
      permanenceRate,
      severeDropRiskCount,
      studentsMeetingMecTargetCount,
      studentsMeetingMecTargetPercent,
      totalFaltas,
      totalAtestados,
      totalSemAtestado,
      justifiedSharePercent,
      totalBelowLegal,
      totalBelowInfantil,
      totalBelowFundamental,
      totalConsecutiveAlerts,
      tier3Count,
      tier5Count,
      tier10Count,
      classMetrics,
      evaluatedStudents,
    };
  }, [filteredClasses, selectedMonthName, monthDef.schoolDays, segmentFilter]);

  // Lista de estudantes no painel de intervenção
  const filteredStudents = useMemo(() => {
    let list = kpiData.evaluatedStudents;

    if (alertFilterMode === 'all_alerts') {
      list = list.filter((s) => s.isBelowLegal || s.hasConsecutiveAlert || s.faltas >= 3);
    } else if (alertFilterMode === 'below_mec') {
      list = list.filter((s) => s.isBelowLegal);
    } else if (alertFilterMode === 'consecutive') {
      list = list.filter((s) => s.hasConsecutiveAlert);
    } else if (alertFilterMode === 'no_certificate') {
      list = list.filter((s) => s.semAtestado > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.student.name.toLowerCase().includes(q) ||
          s.student.ra?.toLowerCase().includes(q) ||
          s.cls.name.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      if (a.hasConsecutiveAlert && !b.hasConsecutiveAlert) return -1;
      if (!a.hasConsecutiveAlert && b.hasConsecutiveAlert) return 1;
      if (a.isBelowLegal && !b.isBelowLegal) return -1;
      if (!a.isBelowLegal && b.isBelowLegal) return 1;
      return a.student.name.localeCompare(b.student.name, 'pt-BR', { sensitivity: 'base' });
    });
  }, [kpiData.evaluatedStudents, alertFilterMode, searchQuery]);

  return (
    <div className="flex flex-col w-full min-w-0 space-y-5 pb-16 animate-gentle-fade text-[#111827]">
      {/* Breadcrumb Limpo */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#48484a] py-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {onBack && (
            <>
              <button
                type="button"
                onClick={onBack}
                className="text-[#374151] hover:text-[#111827] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Voltar</span>
              </button>
              <span className="text-[#6e6e73]">/</span>
            </>
          )}
          <span className="font-semibold text-[#111827]">Resumo Mensal MEC</span>
          <span className="text-[#48484a]">·</span>
          <span>{selectedMonthName}/2027</span>
        </div>
        <span className="text-[#48484a] text-xs hidden sm:inline">
          Painel Executivo de Frequência Escolar
        </span>
      </div>

      {/* CABEÇALHO EXECUTIVO POWER BI (SÓBRIO, SEM ATALHOS REDUNDANTES) */}
      <section className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-sm min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
              <span className="bg-sky-950 text-sky-300 px-2.5 py-0.5 rounded-lg uppercase tracking-widest text-xs font-bold">
                DIREÇÃO &amp; COORDENAÇÃO
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300 break-words">SECRETARIA DE EDUCAÇÃO DO MUNICÍPIO DE JUNDIAÍ</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 break-words">EMEB PROF. JOAQUIM CANDELÁRIO DE FREITAS</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5 break-words min-w-0">
              <span className="material-symbols-outlined text-sky-400 text-[26px] shrink-0">
                query_stats
              </span>
              <span className="min-w-0 break-words">Resumo Mensal — Power BI Executivo</span>
            </h1>

            <p className="text-xs text-slate-400 break-words leading-relaxed">
              Painel institucional de metas MEC (LDB 60% Infantil / 75% Fundamental) e inteligência de busca ativa •{' '}
              <span className="text-slate-200 font-semibold">
                {selectedMonthName}/2027 ({monthDef.schoolDays} dias letivos) • {filteredClasses.length} turmas consolidadas
              </span>
            </p>
          </div>

          {/* Ação Dedicada Exclusiva (Sem atalhos pra outras telas) */}
          {onOpenReportPrint && (
            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onClick={onOpenReportPrint}
                className="w-full md:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs whitespace-normal text-center"
                title="Emitir relatório executivo e ata oficial"
              >
                <span className="material-symbols-outlined text-[18px] shrink-0">
                  print
                </span>
                <span>Relatório Executivo</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* BARRA DE SLICERS (POWER BI - MINIMALISTA E SÓBRIA) */}
      <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs font-bold text-slate-800">
          <div className="flex items-center gap-1.5 uppercase tracking-wider text-slate-900 font-bold min-w-0">
            <span className="material-symbols-outlined text-slate-700 text-[18px] shrink-0">
              tune
            </span>
            <span className="break-words">Segmentadores Analíticos</span>
          </div>
          {(scopeFilter !== 'all_classes' || segmentFilter !== 'all' || shiftFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setScopeFilter('all_classes');
                setSegmentFilter('all');
                setShiftFilter('all');
              }}
              className="text-sky-700 hover:text-sky-950 font-bold cursor-pointer flex items-center gap-1 text-xs"
            >
              <span className="material-symbols-outlined text-[15px]">refresh</span>
              Restaurar Visão Geral
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Slicer: Mês Letivo */}
          <div className="min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">
              Mês Letivo (2027)
            </label>
            <select
              value={selectedMonthName}
              onChange={(e) => setSelectedMonthName(e.target.value)}
              className="w-full min-h-[44px] px-3 bg-[#e9e9ef] hover:bg-[#dfe0e6] text-[#111827] font-semibold text-xs sm:text-sm rounded-2xl focus:outline-none cursor-pointer transition-colors duration-100"
            >
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.month} / 2027 ({m.schoolDays} dias letivos)
                </option>
              ))}
            </select>
          </div>

          {/* Slicer: Segmento & Metas MEC */}
          <div className="min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">
              Segmento · Metas MEC
            </label>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value as 'all' | 'infantil' | 'fundamental')}
              className="w-full min-h-[44px] px-3 bg-[#e9e9ef] hover:bg-[#dfe0e6] text-[#111827] font-semibold text-xs sm:text-sm rounded-2xl focus:outline-none cursor-pointer transition-colors duration-100"
            >
              <option value="all">Todos os Segmentos (Infantil + Fundamental)</option>
              <option value="fundamental">Ensino Fundamental (Piso Legal LDB ≥ 75%)</option>
              <option value="infantil">Educação Infantil (Piso Legal LDB ≥ 60%)</option>
            </select>
          </div>

          {/* Slicer: Turno */}
          <div className="min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">
              Turno Escolar
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value as 'all' | 'MANHÃ' | 'TARDE')}
              className="w-full min-h-[44px] px-3 bg-[#e9e9ef] hover:bg-[#dfe0e6] text-[#111827] font-semibold text-xs sm:text-sm rounded-2xl focus:outline-none cursor-pointer transition-colors duration-100"
            >
              <option value="all">Todos os Turnos (Manhã + Tarde)</option>
              <option value="MANHÃ">Período Manhã</option>
              <option value="TARDE">Período Tarde</option>
            </select>
          </div>

          {/* Slicer: Turma */}
          <div className="min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">
              Recorte de Turma
            </label>
            <select
              value={scopeFilter}
              onChange={(e) => {
                const val = e.target.value;
                setScopeFilter(val);
                if (val !== 'all_classes') {
                  const found = allClasses.find((c) => c.id === val);
                  if (found) onSelectClass(found);
                }
              }}
              className="w-full h-11 px-3 bg-[#e9e9ef] hover:bg-[#dfe0e6] text-[#111827] font-semibold text-xs rounded-2xl focus:outline-none cursor-pointer transition-all"
            >
              <option value="all_classes">
                Todas as Turmas ({allClasses.length} turmas consolidadas)
              </option>
              {allClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  Turma {c.name} — {c.shift.replace('Turno ', '')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* BLOCO SCORECARD MEC: KPIS OFICIAIS DE DESEMPENHO (DESIGN MINIMALISTA POWER BI) */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-2 min-w-0">
          <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
            <span className="material-symbols-outlined text-sky-700 text-[24px] shrink-0">
              analytics
            </span>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-slate-950 uppercase tracking-wider break-words">
                Scorecard Executivo MEC — Indicadores Oficiais de Desempenho
              </h2>
              <p className="text-xs text-slate-600 font-medium break-words">
                Métricas oficiais de permanência escolar, frequência mínima por aluno e proteção contra abandono.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-3 py-1.5 rounded-xl self-start sm:self-auto shrink-0">
            {kpiData.totalActiveStudents} estudantes ativos
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {/* KPI 1: Taxa de Permanência Escolar */}
          <div className="bg-slate-100 rounded-2xl p-4 flex flex-col justify-between shadow-xs min-w-0 break-words">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Permanência Escolar
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${
                  kpiData.permanenceRate >= 95
                    ? 'bg-emerald-200 text-emerald-950'
                    : 'bg-rose-200 text-rose-950'
                }`}
              >
                {kpiData.permanenceRate >= 95 ? 'Conforme' : 'Atenção'}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-950 font-mono tracking-tight tabular-nums">
                  {kpiData.permanenceRate}%
                </span>
                <span className="text-xs text-slate-600 font-bold">
                  meta ≥95%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full ${
                    kpiData.permanenceRate >= 95 ? 'bg-emerald-700' : 'bg-rose-700'
                  }`}
                  style={{ width: `${Math.min(100, kpiData.permanenceRate)}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-slate-700 font-semibold pt-1 break-words">
              {kpiData.severeDropRiskCount === 0
                ? 'Sem risco de evasão crítica'
                : `${kpiData.severeDropRiskCount} em risco de evasão`}
            </p>
          </div>

          {/* KPI 2: Frequência Mínima por Aluno (Piso LDB) */}
          <div className="bg-slate-100 rounded-2xl p-4 flex flex-col justify-between shadow-xs min-w-0 break-words">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Alunos no Piso MEC
              </span>
              <span className="text-xs font-mono text-slate-700 font-bold">
                {kpiData.studentsMeetingMecTargetCount}/{kpiData.totalActiveStudents}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-950 font-mono tracking-tight tabular-nums">
                  {kpiData.studentsMeetingMecTargetPercent}%
                </span>
                <span className="text-xs text-slate-600 font-bold">
                  atingem piso
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-sky-700"
                  style={{ width: `${kpiData.studentsMeetingMecTargetPercent}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-slate-700 font-semibold pt-1 break-words leading-snug">
              Média geral escolar: <strong className="text-slate-950">{kpiData.overallFrequencyRate}%</strong>
            </p>
          </div>

          {/* KPI 3: Alunos Abaixo da Meta MEC */}
          <div className="bg-slate-100 rounded-2xl p-4 flex flex-col justify-between shadow-xs min-w-0 break-words">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Abaixo do Piso MEC
              </span>
              <span
                className={`material-symbols-outlined text-[20px] ${
                  kpiData.totalBelowLegal === 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {kpiData.totalBelowLegal === 0 ? 'check_circle' : 'warning'}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span
                  className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight tabular-nums ${
                    kpiData.totalBelowLegal === 0 ? 'text-slate-950' : 'text-rose-900'
                  }`}
                >
                  {kpiData.totalBelowLegal}
                </span>
                <span className="text-xs text-slate-600 font-bold">
                  em risco legal
                </span>
              </div>
              <p className="text-xs text-slate-700 font-semibold mt-1">
                {kpiData.totalActiveStudents > 0
                  ? `${((kpiData.totalBelowLegal / kpiData.totalActiveStudents) * 100).toFixed(1)}% do total`
                  : '0%'}
              </p>
            </div>

            <div className="text-xs pt-1 flex flex-wrap justify-between gap-x-2 gap-y-1 font-bold">
              <span className="text-slate-800">Fund: {kpiData.totalBelowFundamental}</span>
              <span className="text-slate-800">Infantil: {kpiData.totalBelowInfantil}</span>
            </div>
          </div>

          {/* KPI 4: Atestados & Cobertura Legal */}
          <div className="bg-slate-100 rounded-2xl p-4 flex flex-col justify-between shadow-xs min-w-0 break-words">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Cobertura Atestados
              </span>
              <span className="material-symbols-outlined text-[20px] text-emerald-800">
                medical_services
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-950 font-mono tracking-tight tabular-nums">
                  {kpiData.justifiedSharePercent}%
                </span>
                <span className="text-xs text-slate-600 font-bold">
                  justificadas
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2 flex overflow-hidden">
                <div
                  className="bg-emerald-700 h-2"
                  style={{ width: `${kpiData.justifiedSharePercent}%` }}
                />
                <div
                  className="bg-rose-600 h-2"
                  style={{ width: `${100 - kpiData.justifiedSharePercent}%` }}
                />
              </div>
            </div>

            <div className="text-xs pt-1 flex flex-wrap justify-between gap-x-2 gap-y-1 font-bold">
              <span className="text-emerald-900">Com atestado: {kpiData.totalAtestados}</span>
              <span className="text-rose-900">S/ atestado: {kpiData.totalSemAtestado}</span>
            </div>
          </div>

          {/* KPI 5: Busca Ativa / Consecutivas */}
          <div
            className={`rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-colors duration-100 min-w-0 break-words ${
              kpiData.totalConsecutiveAlerts > 0
                ? kpiData.tier10Count > 0
                  ? 'bg-rose-100/90 text-rose-950'
                  : 'bg-amber-100/90 text-amber-950'
                : 'bg-slate-100 text-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Busca Ativa (ECA)
                </span>
              </div>
              <span
                className={`material-symbols-outlined text-[20px] ${
                  kpiData.totalConsecutiveAlerts === 0
                    ? 'text-emerald-800'
                    : kpiData.tier10Count > 0
                    ? 'text-rose-900'
                    : 'text-amber-900'
                }`}
              >
                {kpiData.totalConsecutiveAlerts === 0 ? 'verified' : 'crisis_alert'}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span
                  className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight tabular-nums ${
                    kpiData.totalConsecutiveAlerts === 0
                      ? 'text-slate-950'
                      : kpiData.tier10Count > 0
                      ? 'text-rose-950'
                      : 'text-amber-950'
                  }`}
                >
                  {kpiData.totalConsecutiveAlerts}
                </span>
                <span className="text-xs text-slate-700 font-bold">
                  casos ativos
                </span>
              </div>
              <p className="text-xs text-slate-700 font-medium mt-1">
                Faltas consecutivas não abonadas
              </p>
            </div>

            <div className="text-xs pt-1 flex flex-wrap justify-between gap-x-2 gap-y-1 font-bold">
              <span className="text-amber-950">3d: {kpiData.tier3Count}</span>
              <span className="text-orange-950">5d: {kpiData.tier5Count}</span>
              <span className="text-rose-950">10d+: {kpiData.tier10Count}</span>
            </div>
          </div>
        </div>
      </section>

      {/* MAPA DE CALOR DA FREQUÊNCIA DIÁRIA (RECHARTS) */}
      <AttendanceDailyHeatmap
        selectedMonthName={selectedMonthName}
        monthNumber={monthDef.monthNumber}
        defaultSchoolDays={monthDef.schoolDays}
        filteredClasses={filteredClasses}
        evaluatedStudents={kpiData.evaluatedStudents}
        onSelectClass={(cls) => {
          setScopeFilter((prev) => (prev === cls.id ? 'all_classes' : cls.id));
          onSelectClass(cls);
        }}
        onOpenStudentGrid={onOpenStudentGrid}
      />

      {/* PAINEL CENTRAL: GRÁFICO POR TURMA & MATRIZ EXECUTIVA */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Gráfico de Colunas Power BI */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col justify-between min-w-0">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-slate-950 uppercase tracking-wider">
                Desempenho por Turma ({selectedMonthName})
              </h2>
              <span className="text-xs text-slate-500 font-bold">
                Clique na coluna para isolar
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              Linha tracejada de referência institucional (meta 85%).
            </p>
          </div>

          <div className="w-full overflow-x-auto pb-1 mt-2">
            <div className={`h-[268px] relative pt-6 pb-8 px-2 flex flex-col justify-end select-none ${
              kpiData.classMetrics.length > 8 ? 'min-w-[580px]' : 'w-full'
            }`}>
              {/* Linhas de grade e referências */}
              <div className="absolute inset-x-2 top-6 bottom-8 pointer-events-none">
                {[100, 75, 60, 0].map((val) => (
                  <div
                    key={val}
                    className="absolute left-0 right-0 flex items-center gap-2"
                    style={{ bottom: `${val}%`, transform: 'translateY(50%)' }}
                  >
                    <span className="w-8 text-right text-[11px] font-mono text-slate-500">
                      {val}%
                    </span>
                    <div className="flex-1 h-px bg-slate-200/60" />
                  </div>
                ))}

                {/* Linha Meta 85% */}
                <div
                  className="absolute left-10 right-0 h-0.5 bg-slate-800 z-10 flex items-center justify-end"
                  style={{ bottom: '85%' }}
                >
                  <span className="bg-slate-900 text-white text-[11px] font-bold px-2 py-0.5 rounded-md -mt-5 mr-1">
                    Meta 85%
                  </span>
                </div>
              </div>

              {/* Colunas */}
              <div className="relative z-20 pl-10 pr-1 h-full flex items-end justify-around gap-2">
              {kpiData.classMetrics.map((entry) => {
                const isSelected = scopeFilter === entry.classId;
                const meetsSchool = entry.frequencyRate >= 85;
                const meetsMec = entry.frequencyRate >= entry.minLegalPercent;

                const barColor = meetsSchool ? '#047857' : meetsMec ? '#d97706' : '#be123c';

                return (
                  <button
                    key={entry.classId}
                    type="button"
                    onClick={() => {
                      setScopeFilter((prev) => (prev === entry.classId ? 'all_classes' : entry.classId));
                      onSelectClass(entry.cls);
                    }}
                    className={`group relative flex-1 h-full flex flex-col justify-end items-center focus:outline-none transition-opacity duration-100 cursor-pointer ${
                      scopeFilter !== 'all_classes' && !isSelected
                        ? 'opacity-35 hover:opacity-85'
                        : 'opacity-100'
                    }`}
                    title={`Turma ${entry.className} (${entry.shift}) — Frequência: ${entry.frequencyRate}% • Abaixo Meta MEC: ${entry.belowLegalCount}`}
                  >
                    {/* Tooltip */}
                    <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-100 absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-30 w-max max-w-[220px] bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-left text-xs space-y-0.5">
                      <p className="font-bold">
                        {entry.className} ({entry.shift})
                      </p>
                      <p className="text-slate-300">Frequência: {entry.frequencyRate}%</p>
                      <p className="text-slate-300">
                        Faltas: {entry.totalFaltas} ({entry.totalAtestados} c/ atestado)
                      </p>
                      <p className="text-slate-300">
                        Abaixo Meta MEC (&lt;{entry.minLegalPercent}%): {entry.belowLegalCount}
                      </p>
                    </div>

                    <span className="text-[11px] font-bold font-mono text-slate-800 tabular-nums mb-1">
                      {entry.frequencyRate}%
                    </span>

                    <div className="w-full max-w-[34px] h-full flex items-end justify-center">
                      <div
                        className={`w-full rounded-t-md transition-all duration-100 ${
                          isSelected ? 'shadow-md scale-x-105' : ''
                        }`}
                        style={{
                          height: `${Math.max(8, Math.min(100, entry.frequencyRate))}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>

                    <span
                      className={`absolute -bottom-6 text-[11px] whitespace-nowrap ${
                        isSelected ? 'text-slate-900 underline font-semibold' : 'text-slate-600 font-medium'
                      }`}
                    >
                      {entry.shortName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-bold">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#047857]" /> ≥85%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#d97706]" /> Conforme MEC
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#be123c]" /> Crítico (&lt;MEC)
              </span>
            </div>
            <span>Base: {selectedMonthName}/2027</span>
          </div>
        </div>

        {/* Matriz Consolidada de Turmas */}
        <div className="lg:col-span-7 bg-white rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between min-w-0">
          <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold text-slate-950 uppercase tracking-wider break-words">
                Matriz Consolidada de Turmas ({selectedMonthName})
              </h2>
              <p className="text-xs text-slate-600 font-medium break-words">
                Frequência escolar, faltas, cobertura documental e risco legal por turma.
              </p>
            </div>
            {scopeFilter !== 'all_classes' && (
              <button
                type="button"
                onClick={() => setScopeFilter('all_classes')}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs cursor-pointer shadow-2xs shrink-0"
              >
                Ver Todas
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-xs sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">Turma</th>
                  <th className="py-2.5 px-2 text-center">Ativos</th>
                  <th className="py-2.5 px-2 text-center">Frequência</th>
                  <th className="py-2.5 px-2 text-center">Faltas</th>
                  <th className="py-2.5 px-2 text-center">Atestados</th>
                  <th className="py-2.5 px-2 text-center">S/ Atestado</th>
                  <th className="py-2.5 px-3 text-center">Risco MEC</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {kpiData.classMetrics.map((row) => {
                  const isSelected = scopeFilter === row.classId;
                  const isCompliant = row.frequencyRate >= row.minLegalPercent;

                  return (
                    <tr
                      key={row.classId}
                      onClick={() => {
                        setScopeFilter((prev) => (prev === row.classId ? 'all_classes' : row.classId));
                        onSelectClass(row.cls);
                      }}
                      className={`cursor-pointer transition-colors duration-100 ${
                        isSelected ? 'bg-[#e8f0fe]' : 'odd:bg-[#f8f8fb] hover:bg-[#e9e9ef]'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-950 block break-words">
                          {row.className}
                        </span>
                        <span className="text-xs text-slate-600 block break-words">
                          {row.shift} · Prof. {row.teacherName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-medium text-slate-700">
                        {row.activeStudents}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono">
                        <span
                          className={`font-semibold ${
                            row.frequencyRate >= 85
                              ? 'text-emerald-800 font-bold'
                              : isCompliant
                              ? 'text-amber-800 font-bold'
                              : 'text-rose-800 font-bold'
                          }`}
                        >
                          {row.frequencyRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-semibold text-slate-950">
                        {row.totalFaltas}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-semibold text-emerald-800">
                        {row.totalAtestados}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-semibold text-rose-800">
                        {row.totalSemAtestado}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {row.belowLegalCount > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-rose-200 text-rose-950">
                            {row.belowLegalCount} aluno(s)
                          </span>
                        ) : (
                          <span className="text-emerald-800 font-bold text-xs">
                            Nenhum
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PAINEL DE OPERAÇÃO: BUSCA ATIVA COM EXPANSÃO VISUAL DE DADOS DO ESTUDANTE */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Tabela de Estudantes em Alerta com Expansão Detalhada */}
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between min-w-0">
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-700 text-[22px]">
                  contact_support
                </span>
                <h2 className="text-xs font-bold text-slate-950 uppercase tracking-wider">
                  Painel de Busca Ativa &amp; Alertas de Frequência ({filteredStudents.length})
                </h2>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                Clique na linha do estudante para visualizar a expansão completa de dados e contatos.
              </p>
            </div>

            {/* Campo de Busca & Filtros Rápidos */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar aluno ou RA..."
                  className="w-full min-h-[44px] pl-9 pr-3 bg-[#e9e9ef] focus:bg-white rounded-xl text-xs sm:text-sm text-[#111827] font-medium placeholder-[#5c5c60] focus:outline-none transition-colors duration-100"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#48484a] text-[18px]">
                  search
                </span>
              </div>

              <div className="flex flex-wrap sm:inline-flex w-full sm:w-auto max-w-full rounded-xl bg-slate-100 p-1 text-xs font-bold gap-1">
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('all_alerts')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-colors duration-100 cursor-pointer whitespace-normal text-center ${
                    alertFilterMode === 'all_alerts'
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Alertas
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('below_mec')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-colors duration-100 cursor-pointer whitespace-normal text-center ${
                    alertFilterMode === 'below_mec'
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  &lt; Meta MEC
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('consecutive')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-colors duration-100 cursor-pointer whitespace-normal text-center ${
                    alertFilterMode === 'consecutive'
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Consecutivas
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('no_certificate')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-colors duration-100 cursor-pointer whitespace-normal text-center ${
                    alertFilterMode === 'no_certificate'
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  S/ Atestado
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('all')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-colors duration-100 cursor-pointer whitespace-normal text-center ${
                    alertFilterMode === 'all'
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>
          </div>

          {/* Cartão de Alerta Imediato para a Gestão Escolar */}
          {kpiData.totalConsecutiveAlerts > 0 && (
            <div
              className={`mx-3 sm:mx-5 my-3 p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 ${
                kpiData.tier10Count > 0
                  ? 'bg-rose-100/90 text-rose-950'
                  : 'bg-amber-100/90 text-amber-950'
              }`}
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <span className="material-symbols-outlined text-[22px] shrink-0">
                  warning
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold block break-words">
                    Atenção Imediata da Gestão: {kpiData.totalConsecutiveAlerts} caso(s) ativo(s) de Busca Ativa (ECA)
                  </span>
                  <span className="text-xs opacity-90 block break-words leading-snug font-medium">
                    {kpiData.tier10Count > 0
                      ? `${kpiData.tier10Count} aluno(s) no gatilho crítico (≥10 faltas consecutivas) exigindo notificação urgente ao Conselho Tutelar.`
                      : `${kpiData.totalConsecutiveAlerts} estudante(s) com faltas consecutivas sem atestado médico aguardando busca ativa.`}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0 text-xs font-bold">
                {kpiData.tier10Count > 0 && (
                  <span className="px-2.5 py-1 rounded-xl bg-rose-200 text-rose-950">
                    {kpiData.tier10Count} Crítico (10d)
                  </span>
                )}
                {kpiData.tier5Count > 0 && (
                  <span className="px-2.5 py-1 rounded-xl bg-orange-200 text-orange-950">
                    {kpiData.tier5Count} Intermediário (5d)
                  </span>
                )}
                {kpiData.tier3Count > 0 && (
                  <span className="px-2.5 py-1 rounded-xl bg-amber-200 text-amber-950">
                    {kpiData.tier3Count} Preventivo (3d)
                  </span>
                )}
              </div>
            </div>
          )}

          {filteredStudents.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <span className="material-symbols-outlined text-4xl text-emerald-700">
                check_circle
              </span>
              <p className="text-sm font-bold text-slate-900">
                Nenhum estudante em situação de risco com estes filtros
              </p>
              <p className="text-xs text-slate-600 font-medium">
                Todos os estudantes selecionados estão em conformidade com as metas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-xs sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Estudante</th>
                    <th className="py-2.5 px-2">Turma</th>
                    <th className="py-2.5 px-2 text-center">Faltas</th>
                    <th className="py-2.5 px-2 text-center">Atestados</th>
                    <th className="py-2.5 px-2 text-center">% Frequência</th>
                    <th className="py-2.5 px-3">Situação / Alerta</th>
                    <th className="py-2.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filteredStudents.map((item) => {
                    const isExpanded = expandedStudentId === item.student.id;
                    return (
                      <React.Fragment key={`${item.cls.id}-${item.student.id}`}>
                        <tr
                          onClick={() => setExpandedStudentId(isExpanded ? null : item.student.id)}
                          className={`cursor-pointer transition-colors duration-100 ${
                            isExpanded ? 'bg-[#e8f0fe] font-medium' : 'odd:bg-[#f8f8fb] hover:bg-[#e9e9ef]'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <StudentAvatar student={item.student} size="sm" expandableOnClick={false} />
                              <div className="min-w-0">
                                <span className="font-bold text-slate-950 block break-words leading-snug">
                                  {item.student.name}
                                </span>
                                <span className="text-xs text-slate-500 block font-mono">
                                  RA {item.student.ra || 'S/N'}-{item.student.digRa || '0'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 font-bold text-slate-800">
                            {item.cls.name}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-rose-800">
                            {item.faltas}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono">
                            {item.atestados > 0 ? (
                              <span className="text-emerald-800 font-bold">
                                {item.atestados}d
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono">
                            <span className={`font-semibold ${item.isBelowLegal ? 'text-rose-800 font-bold' : 'text-slate-900 font-bold'}`}>
                              {item.frequenciaPercent}%
                            </span>
                            <span className="text-xs text-slate-500 ml-1 font-semibold">
                              (piso ≥{item.minLegalPercent}%)
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.hasConsecutiveAlert && (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                                    item.consecutiveAlertTier === '10d'
                                      ? 'bg-rose-200 text-rose-950'
                                      : item.consecutiveAlertTier === '5d'
                                      ? 'bg-orange-200 text-orange-950'
                                      : 'bg-amber-200 text-amber-950'
                                  }`}
                                >
                                  {item.alertLabel || `${item.consecutiveAlertDays}d Consecutivas`}
                                </span>
                              )}
                              {item.isBelowLegal && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-rose-200 text-rose-950">
                                  &lt; Piso MEC ({item.minLegalPercent}%)
                                </span>
                              )}
                              {item.familyFeedback && (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-900"
                                  title={item.familyFeedback}
                                >
                                  C/ Retorno
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center text-slate-400">
                            <span className={`material-symbols-outlined text-[18px] transition-transform duration-100 ${isExpanded ? 'rotate-180 text-sky-700' : ''}`}>
                              expand_more
                            </span>
                          </td>
                        </tr>

                        {/* EXPANSÃO UNIFICADA E SIMPLES DE ENTENDER PARA LEIGOS */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={7} className="p-3 sm:p-4">
                              <div className="sticky left-0 w-[calc(100vw-2.5rem)] max-w-full lg:w-full">
                                <StudentDataExpansionPanel
                                  student={item.student}
                                  classGroup={item.cls}
                                  diasLetivosMes={item.diasLetivos}
                                  minLegalPresence={item.minLegalPercent}
                                  onOpenStudentPdf={onOpenStudentPdf}
                                  onOpenStudentGrid={onOpenStudentGrid}
                                  onCollapse={() => setExpandedStudentId(null)}
                                  familyFeedback={item.familyFeedback}
                                />
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
        </div>

        {/* Parecer Pedagógico & Despacho da Gestão */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col justify-between space-y-4 min-w-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 break-words">
                Despacho da Gestão • {currentClass.name}
              </span>
              {notesSavedFeedback && (
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1 shrink-0">
                  <span className="material-symbols-outlined text-[15px]">done</span>
                  Salvo
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-950 break-words">
              Acompanhamento &amp; Despacho ({selectedMonthName})
            </h3>
            <p className="text-xs text-slate-600 font-medium break-words">
              Parecer executivo da coordenação/direção sobre busca ativa e retenção para a Turma {currentClass.name}.
            </p>
          </div>

          <textarea
            rows={7}
            value={pedagogicalNotes}
            onChange={(e) => {
              setPedagogicalNotes(e.target.value);
              onSaveNotes?.(e.target.value);
              setNotesSavedFeedback(true);
            }}
            placeholder="Registre aqui as providências da gestão, contatos com famílias, encaminhamentos ao Conselho Tutelar ou justificativas administrativas..."
            className="w-full p-3.5 rounded-2xl bg-[#e9e9ef] text-[#111827] text-sm focus:bg-white focus:outline-none resize-none leading-relaxed transition-all"
          />

          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#48484a] font-medium">
            <span className="break-words">
              Regente: {currentClass.teacherFirstName || currentClass.teacherName || 'Não atribuído'}
            </span>
            <span>Salvamento em tempo real</span>
          </div>
        </div>
      </section>

      {/* Rodapé com Navegação entre Períodos e Retorno */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[#111827] break-words">
            Fechamento de {selectedMonthName}/2027
          </h3>
          <p className="text-xs text-[#48484a] font-medium mt-0.5 break-words">
            Relatório gerado a partir da base oficial do SED da EMEB Prof. Joaquim Candelário de Freitas (1.237 alunos)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          {previousPeriodName && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonthName(previousPeriodName);
                window.scrollTo(0, 0);
              }}
              className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-[#e9e9ef] hover:bg-[#dfe0e6] text-[#111827] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-normal text-center"
              title={`Ir para ${previousPeriodName}`}
            >
              <span className="material-symbols-outlined text-[16px] text-[#374151] shrink-0">history</span>
              <span>Período Anterior ({previousPeriodName})</span>
            </button>
          )}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs whitespace-normal text-center"
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">arrow_back</span>
              <span>Voltar</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
