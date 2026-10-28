import React, { useState, useMemo, useEffect } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { MONTHLY_SCHOOL_DAYS_2027 } from '../data/mockData';
import {
  isStudentEducacaoInfantil,
  getStudentConsecutiveAlertInfo,
  getDefaultReferencePeriod,
} from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';

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
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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

  const handleCopyStudentRecord = (item: EvaluatedStudentSnapshot) => {
    const text = [
      `REGISTRO OFICIAL - BUSCA ATIVA / FREQUÊNCIA`,
      `Estudante: ${item.student.name} | RA: ${item.student.ra}-${item.student.digRa || '0'}`,
      `Turma: ${item.cls.name} (${item.cls.shift})`,
      `Mês de Referência: ${selectedMonthName}/2027`,
      `Presenças: ${item.presencas}/${item.diasLetivos} (${item.frequenciaPercent}%)`,
      `Meta Legal MEC: Mínimo ${item.minLegalPercent}% (${item.isBelowLegal ? 'ABAIXO DA META' : 'CONFORME'})`,
      `Faltas: ${item.faltas} (${item.atestados} c/ atestado, ${item.semAtestado} injustificadas)`,
      item.hasConsecutiveAlert ? `Alerta de Busca Ativa: ${item.alertLabel}` : `Sem alerta consecutivo`,
      item.student.telefones ? `Telefones de Contato: ${item.student.telefones}` : '',
      item.familyFeedback ? `Retorno Família: ${item.familyFeedback}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard?.writeText(text);
    setCopyFeedback(item.student.id);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-20 animate-gentle-fade text-slate-800">
      {/* Breadcrumb Limpo */}
      <div className="flex items-center justify-between text-xs text-slate-500 py-0.5">
        <div className="flex items-center gap-1.5">
          {onBack && (
            <>
              <button
                type="button"
                onClick={onBack}
                className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Voltar</span>
              </button>
              <span className="text-slate-300">/</span>
            </>
          )}
          <span className="font-semibold text-slate-800">Resumo Mensal MEC</span>
          <span className="text-slate-400">·</span>
          <span>{selectedMonthName}/2027</span>
        </div>
        <span className="text-slate-400 text-xs hidden sm:inline">
          Painel Executivo de Frequência Escolar
        </span>
      </div>

      {/* CABEÇALHO EXECUTIVO POWER BI (SÓBRIO, SEM ATALHOS REDUNDANTES) */}
      <section className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
              <span className="bg-sky-950 text-sky-400 px-2.5 py-0.5 rounded border border-sky-800/60 uppercase tracking-widest text-[11px]">
                DIREÇÃO &amp; COORDENAÇÃO
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300">SECRETARIA DE EDUCAÇÃO DO MUNICÍPIO DE JUNDIAÍ</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">EMEB PROF. JOAQUIM CANDELÁRIO DE FREITAS</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span className="material-symbols-outlined text-sky-400 text-[26px]">
                query_stats
              </span>
              <span>Resumo Mensal — Power BI Executivo</span>
            </h1>

            <p className="text-xs text-slate-400">
              Painel institucional de metas MEC (LDB 60% Infantil / 75% Fundamental) e inteligência de busca ativa •{' '}
              <span className="text-slate-200 font-semibold">
                {selectedMonthName}/2027 ({monthDef.schoolDays} dias letivos) • {filteredClasses.length} turmas consolidadas
              </span>
            </p>
          </div>

          {/* Ação Dedicada Exclusiva (Sem atalhos pra outras telas) */}
          {onOpenReportPrint && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenReportPrint}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-xs"
                title="Emitir relatório executivo e ata oficial"
              >
                <span className="material-symbols-outlined text-[18px]">
                  print
                </span>
                <span>Relatório Executivo</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* BARRA DE SLICERS (POWER BI - MINIMALISTA E SÓBRIA) */}
      <section className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100 text-xs font-bold text-slate-600">
          <div className="flex items-center gap-1.5 uppercase tracking-wider text-slate-700">
            <span className="material-symbols-outlined text-slate-500 text-[18px]">
              tune
            </span>
            <span>Segmentadores Analíticos</span>
          </div>
          {(scopeFilter !== 'all_classes' || segmentFilter !== 'all' || shiftFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setScopeFilter('all_classes');
                setSegmentFilter('all');
                setShiftFilter('all');
              }}
              className="text-sky-600 hover:text-sky-800 cursor-pointer flex items-center gap-1 text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-[15px]">refresh</span>
              Restaurar Visão Geral
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Slicer: Mês Letivo */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Mês Letivo (2027)
            </label>
            <select
              value={selectedMonthName}
              onChange={(e) => setSelectedMonthName(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
            >
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.month} / 2027 ({m.schoolDays} dias letivos)
                </option>
              ))}
            </select>
          </div>

          {/* Slicer: Segmento & Metas MEC */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Segmento • Metas MEC
            </label>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value as any)}
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
            >
              <option value="all">Todos os Segmentos (Infantil + Fundamental)</option>
              <option value="fundamental">Ensino Fundamental (Piso Legal LDB ≥ 75%)</option>
              <option value="infantil">Educação Infantil (Piso Legal LDB ≥ 60%)</option>
            </select>
          </div>

          {/* Slicer: Turno */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Turno Escolar
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value as any)}
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
            >
              <option value="all">Todos os Turnos (Manhã + Tarde)</option>
              <option value="MANHÃ">Período Manhã</option>
              <option value="TARDE">Período Tarde</option>
            </select>
          </div>

          {/* Slicer: Turma */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
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
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
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
      <section className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sky-600 text-[22px]">
              analytics
            </span>
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Scorecard Executivo MEC — Indicadores Oficiais de Desempenho
              </h2>
              <p className="text-xs text-slate-500">
                Métricas oficiais de permanência escolar, frequência mínima por aluno e proteção contra abandono.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100 self-start sm:self-auto">
            {kpiData.totalActiveStudents} estudantes ativos
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* KPI 1: Taxa de Permanência Escolar */}
          <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Permanência Escolar
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                  kpiData.permanenceRate >= 95
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {kpiData.permanenceRate >= 95 ? 'Conforme' : 'Atenção'}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-slate-900 font-mono tracking-tight tabular-nums">
                  {kpiData.permanenceRate}%
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  meta ≥95%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    kpiData.permanenceRate >= 95 ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                  style={{ width: `${Math.min(100, kpiData.permanenceRate)}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200/60">
              {kpiData.severeDropRiskCount === 0
                ? 'Sem risco de evasão crítica'
                : `${kpiData.severeDropRiskCount} em risco de evasão`}
            </p>
          </div>

          {/* KPI 2: Frequência Mínima por Aluno (Piso LDB) */}
          <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Alunos no Piso MEC
              </span>
              <span className="text-[11px] font-mono text-slate-500 font-bold">
                {kpiData.studentsMeetingMecTargetCount}/{kpiData.totalActiveStudents}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-slate-900 font-mono tracking-tight tabular-nums">
                  {kpiData.studentsMeetingMecTargetPercent}%
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  atingem piso
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-sky-600"
                  style={{ width: `${kpiData.studentsMeetingMecTargetPercent}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200/60 truncate">
              Média geral escolar: <strong className="text-slate-800">{kpiData.overallFrequencyRate}%</strong>
            </p>
          </div>

          {/* KPI 3: Alunos Abaixo da Meta MEC */}
          <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Abaixo do Piso MEC
              </span>
              <span
                className={`material-symbols-outlined text-[18px] ${
                  kpiData.totalBelowLegal === 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {kpiData.totalBelowLegal === 0 ? 'check_circle' : 'warning'}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-semibold font-mono tracking-tight tabular-nums ${
                    kpiData.totalBelowLegal === 0 ? 'text-slate-900' : 'text-rose-700'
                  }`}
                >
                  {kpiData.totalBelowLegal}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  em risco legal
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {kpiData.totalActiveStudents > 0
                  ? `${((kpiData.totalBelowLegal / kpiData.totalActiveStudents) * 100).toFixed(1)}% do total`
                  : '0%'}
              </p>
            </div>

            <div className="text-[11px] pt-2 border-t border-slate-200/60 flex justify-between font-medium">
              <span className="text-slate-700">Fund: {kpiData.totalBelowFundamental}</span>
              <span className="text-slate-700">Infantil: {kpiData.totalBelowInfantil}</span>
            </div>
          </div>

          {/* KPI 4: Atestados & Cobertura Legal */}
          <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Cobertura Atestados
              </span>
              <span className="material-symbols-outlined text-[18px] text-emerald-600">
                medical_services
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-slate-900 font-mono tracking-tight tabular-nums">
                  {kpiData.justifiedSharePercent}%
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  justificadas
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 flex overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5"
                  style={{ width: `${kpiData.justifiedSharePercent}%` }}
                />
                <div
                  className="bg-rose-500 h-1.5"
                  style={{ width: `${100 - kpiData.justifiedSharePercent}%` }}
                />
              </div>
            </div>

            <div className="text-[11px] pt-2 border-t border-slate-200/60 flex justify-between font-medium">
              <span className="text-emerald-700">Com atestado: {kpiData.totalAtestados}</span>
              <span className="text-rose-700">S/ atestado: {kpiData.totalSemAtestado}</span>
            </div>
          </div>

          {/* KPI 5: Busca Ativa / Consecutivas */}
          <div
            className={`rounded-xl p-4 border flex flex-col justify-between transition-all ${
              kpiData.totalConsecutiveAlerts > 0
                ? kpiData.tier10Count > 0
                  ? 'bg-rose-50/70 border-rose-300 animate-pulse-subtle-rose'
                  : 'bg-amber-50/70 border-amber-300 animate-pulse-subtle-amber'
                : 'bg-slate-50/70 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {kpiData.totalConsecutiveAlerts > 0 && (
                  <span className="relative flex h-2 w-2">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        kpiData.tier10Count > 0 ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        kpiData.tier10Count > 0 ? 'bg-rose-600' : 'bg-amber-600'
                      }`}
                    />
                  </span>
                )}
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Busca Ativa (ECA)
                </span>
              </div>
              <span
                className={`material-symbols-outlined text-[18px] ${
                  kpiData.totalConsecutiveAlerts === 0
                    ? 'text-emerald-600'
                    : kpiData.tier10Count > 0
                    ? 'text-rose-600'
                    : 'text-amber-600'
                }`}
              >
                {kpiData.totalConsecutiveAlerts === 0 ? 'verified' : 'crisis_alert'}
              </span>
            </div>

            <div className="my-2.5">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-semibold font-mono tracking-tight tabular-nums ${
                    kpiData.totalConsecutiveAlerts === 0
                      ? 'text-slate-900'
                      : kpiData.tier10Count > 0
                      ? 'text-rose-800'
                      : 'text-amber-800'
                  }`}
                >
                  {kpiData.totalConsecutiveAlerts}
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  casos ativos
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Faltas consecutivas não abonadas
              </p>
            </div>

            <div className="text-[11px] pt-2 border-t border-slate-200/60 flex justify-between font-bold">
              <span className="text-amber-700">3d: {kpiData.tier3Count}</span>
              <span className="text-orange-700">5d: {kpiData.tier5Count}</span>
              <span className="text-rose-700">10d+: {kpiData.tier10Count}</span>
            </div>
          </div>
        </div>
      </section>

      {/* PAINEL CENTRAL: GRÁFICO POR TURMA & MATRIZ EXECUTIVA */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Gráfico de Colunas Power BI */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Desempenho por Turma ({selectedMonthName})
              </h2>
              <span className="text-[11px] text-slate-400 font-medium">
                Clique na coluna para isolar
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Linha tracejada de referência institucional (meta 85%).
            </p>
          </div>

          <div className="w-full h-[260px] relative pt-6 pb-8 px-2 flex flex-col justify-end select-none mt-2">
            {/* Linhas de grade e referências */}
            <div className="absolute inset-x-2 top-6 bottom-8 pointer-events-none">
              {[100, 75, 60, 0].map((val) => (
                <div
                  key={val}
                  className="absolute left-0 right-0 flex items-center gap-2"
                  style={{ bottom: `${val}%`, transform: 'translateY(50%)' }}
                >
                  <span className="w-6 text-right text-[10px] font-mono text-slate-400">
                    {val}%
                  </span>
                  <div className="flex-1 border-t border-dashed border-slate-200" />
                </div>
              ))}

              {/* Linha Meta 85% */}
              <div
                className="absolute left-8 right-0 border-t-2 border-dashed border-slate-800 z-10 flex items-center justify-end"
                style={{ bottom: '85%' }}
              >
                <span className="bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded -mt-4 mr-1">
                  Meta 85%
                </span>
              </div>
            </div>

            {/* Colunas */}
            <div className="relative z-20 pl-8 pr-1 h-full flex items-end justify-around gap-2">
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
                    className={`group relative flex-1 h-full flex flex-col justify-end items-center focus:outline-none transition-all cursor-pointer ${
                      scopeFilter !== 'all_classes' && !isSelected
                        ? 'opacity-35 hover:opacity-85'
                        : 'opacity-100'
                    }`}
                    title={`Turma ${entry.className} (${entry.shift}) — Frequência: ${entry.frequencyRate}% • Abaixo Meta MEC: ${entry.belowLegalCount}`}
                  >
                    {/* Tooltip */}
                    <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-30 w-max max-w-[200px] bg-slate-900 text-white px-2.5 py-1.5 rounded-lg shadow-lg text-left text-[11px] space-y-0.5">
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

                    <span className="text-[10px] font-bold font-mono text-slate-800 tabular-nums mb-1">
                      {entry.frequencyRate}%
                    </span>

                    <div className="w-full max-w-[32px] h-full flex items-end justify-center">
                      <div
                        className={`w-full rounded-t-md transition-all duration-300 ${
                          isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : ''
                        }`}
                        style={{
                          height: `${Math.max(8, Math.min(100, entry.frequencyRate))}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>

                    <span
                      className={`absolute -bottom-6 text-[10px] truncate max-w-[50px] ${
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

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
            <div className="flex items-center gap-3">
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
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Matriz Consolidada de Turmas ({selectedMonthName})
              </h2>
              <p className="text-xs text-slate-500">
                Frequência escolar, faltas, cobertura documental e risco legal por turma.
              </p>
            </div>
            {scopeFilter !== 'all_classes' && (
              <button
                type="button"
                onClick={() => setScopeFilter('all_classes')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Ver Todas
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[11px] sticky top-0 z-10">
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
              <tbody className="divide-y divide-slate-100">
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
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900 block">
                          {row.className}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {row.shift} · Prof. {row.teacherName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-medium text-slate-600">
                        {row.activeStudents}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono">
                        <span
                          className={`font-semibold ${
                            row.frequencyRate >= 85
                              ? 'text-emerald-700'
                              : isCompliant
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {row.frequencyRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-semibold text-slate-900">
                        {row.totalFaltas}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-semibold text-emerald-700">
                        {row.totalAtestados}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-semibold text-rose-700">
                        {row.totalSemAtestado}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {row.belowLegalCount > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            {row.belowLegalCount} aluno(s)
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold text-xs">
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
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-[20px]">
                  contact_support
                </span>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Painel de Busca Ativa &amp; Alertas de Frequência ({filteredStudents.length})
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Clique na linha do estudante para visualizar a expansão completa de dados e contatos.
              </p>
            </div>

            {/* Campo de Busca & Filtros Rápidos */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar aluno ou RA..."
                  className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">
                  search
                </span>
              </div>

              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('all_alerts')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    alertFilterMode === 'all_alerts'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Alertas
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('below_mec')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    alertFilterMode === 'below_mec'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  &lt; Meta MEC
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('consecutive')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    alertFilterMode === 'consecutive'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Consecutivas
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('no_certificate')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    alertFilterMode === 'no_certificate'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  S/ Atestado
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilterMode('all')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    alertFilterMode === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>
          </div>

          {/* Cartão de Alerta Imediato para a Gestão Escolar (Pulsação Suave) */}
          {kpiData.totalConsecutiveAlerts > 0 && (
            <div
              className={`mx-4 sm:mx-5 my-3 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                kpiData.tier10Count > 0
                  ? 'bg-rose-50/70 border-rose-300 animate-pulse-subtle-rose text-rose-950'
                  : 'bg-amber-50/70 border-amber-300 animate-pulse-subtle-amber text-amber-950'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      kpiData.tier10Count > 0 ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      kpiData.tier10Count > 0 ? 'bg-rose-600' : 'bg-amber-600'
                    }`}
                  />
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-bold block">
                    Atenção Imediata da Gestão: {kpiData.totalConsecutiveAlerts} caso(s) ativo(s) de Busca Ativa (ECA)
                  </span>
                  <span className="text-xs opacity-80 block truncate">
                    {kpiData.tier10Count > 0
                      ? `${kpiData.tier10Count} aluno(s) no gatilho crítico (≥10 faltas consecutivas) exigindo notificação urgente ao Conselho Tutelar.`
                      : `${kpiData.totalConsecutiveAlerts} estudante(s) com faltas consecutivas sem atestado médico aguardando busca ativa.`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-bold">
                {kpiData.tier10Count > 0 && (
                  <span className="px-2 py-0.5 rounded bg-rose-200/80 text-rose-900 border border-rose-300">
                    {kpiData.tier10Count} Crítico (10d)
                  </span>
                )}
                {kpiData.tier5Count > 0 && (
                  <span className="px-2 py-0.5 rounded bg-orange-200/80 text-orange-900 border border-orange-300">
                    {kpiData.tier5Count} Intermediário (5d)
                  </span>
                )}
                {kpiData.tier3Count > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 border border-amber-300">
                    {kpiData.tier3Count} Preventivo (3d)
                  </span>
                )}
              </div>
            </div>
          )}

          {filteredStudents.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <span className="material-symbols-outlined text-4xl text-emerald-600">
                check_circle
              </span>
              <p className="text-sm font-bold text-slate-800">
                Nenhum estudante em situação de risco com estes filtros
              </p>
              <p className="text-xs text-slate-500">
                Todos os estudantes selecionados estão em conformidade com as metas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[11px] sticky top-0 z-10">
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
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((item) => {
                    const isExpanded = expandedStudentId === item.student.id;
                    return (
                      <React.Fragment key={`${item.cls.id}-${item.student.id}`}>
                        <tr
                          onClick={() => setExpandedStudentId(isExpanded ? null : item.student.id)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded ? 'bg-sky-50/80 font-medium' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <StudentAvatar student={item.student} size="sm" expandableOnClick={false} />
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900 block truncate">
                                  {item.student.name}
                                </span>
                                <span className="text-[11px] text-slate-400 block font-mono">
                                  RA {item.student.ra || 'S/N'}-{item.student.digRa || '0'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 font-medium text-slate-700">
                            {item.cls.name}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-rose-700">
                            {item.faltas}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono">
                            {item.atestados > 0 ? (
                              <span className="text-emerald-700 font-bold">
                                {item.atestados}d
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono">
                            <span className={`font-semibold ${item.isBelowLegal ? 'text-rose-700' : 'text-slate-800'}`}>
                              {item.frequenciaPercent}%
                            </span>
                            <span className="text-[11px] text-slate-400 ml-1">
                              (piso ≥{item.minLegalPercent}%)
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.hasConsecutiveAlert && (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                                    item.consecutiveAlertTier === '10d'
                                      ? 'bg-rose-100 text-rose-900 border border-rose-300 animate-pulse-subtle-rose'
                                      : item.consecutiveAlertTier === '5d'
                                      ? 'bg-orange-100 text-orange-900 border border-orange-300 animate-pulse-subtle-amber'
                                      : 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse-subtle-amber'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      item.consecutiveAlertTier === '10d'
                                        ? 'bg-rose-600 animate-ping'
                                        : 'bg-amber-600 animate-pulse'
                                    }`}
                                  />
                                  {item.alertLabel || `${item.consecutiveAlertDays}d Consecutivas`}
                                </span>
                              )}
                              {item.isBelowLegal && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                  &lt; Piso MEC ({item.minLegalPercent}%)
                                </span>
                              )}
                              {item.familyFeedback && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700"
                                  title={item.familyFeedback}
                                >
                                  C/ Retorno
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center text-slate-400">
                            <span className={`material-symbols-outlined text-[18px] transition-transform ${isExpanded ? 'rotate-180 text-sky-600' : ''}`}>
                              expand_more
                            </span>
                          </td>
                        </tr>

                        {/* EXPANSÃO VISUAL MELHORADA DO ESTUDANTE (DEDICADA, SEM NAVEGAÇÃO EXTERNA) */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-y border-slate-200">
                            <td colSpan={7} className="p-4 sm:p-5">
                              <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-4">
                                {/* Topo da Expansão */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                                  <div className="flex items-center gap-3">
                                    <StudentAvatar student={item.student} size="md" expandableOnClick={false} />
                                    <div>
                                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <span>{item.student.name}</span>
                                        <span className="text-[11px] font-normal text-slate-500">
                                          (Nº {item.student.numeroChamada || item.student.number || '—'})
                                        </span>
                                      </h3>
                                      <p className="text-xs text-slate-500 font-mono">
                                        RA: {item.student.ra || 'S/N'}-{item.student.digRa || '0'} • Turma {item.cls.name} ({item.cls.shift}) • Nasc: {item.student.dataNascimento || '—'} {item.student.idade ? `(${item.student.idade} anos)` : ''}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    {onOpenStudentPdf && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenStudentPdf(item.student);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all border border-sky-200"
                                      >
                                        <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                                        <span>Ficha PDF</span>
                                      </button>
                                    )}

                                    {onOpenStudentGrid && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenStudentGrid(item.student);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                                      >
                                        <span className="material-symbols-outlined text-[15px]">open_in_full</span>
                                        <span>Ficha Completa (48 Dados)</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyStudentRecord(item);
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">
                                        {copyFeedback === item.student.id ? 'check' : 'content_copy'}
                                      </span>
                                      <span>{copyFeedback === item.student.id ? 'Copiado!' : 'Copiar Dados'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedStudentId(null);
                                      }}
                                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                                      title="Fechar detalhes"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Grade de Indicadores Visuais do Aluno */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                  {/* Visual Gauge de Frequência */}
                                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                                      Balanço de Frequência no Mês
                                    </span>
                                    <div className="flex items-baseline justify-between">
                                      <span className={`text-xl font-semibold font-mono ${item.isBelowLegal ? 'text-rose-700' : 'text-slate-900'}`}>
                                        {item.frequenciaPercent}%
                                      </span>
                                      <span className="text-[11px] text-slate-500">
                                        {item.presencas} presenças em {item.diasLetivos} dias
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                                      <div
                                        className="bg-emerald-600 h-2"
                                        style={{ width: `${item.frequenciaPercent}%` }}
                                      />
                                      <div
                                        className="bg-rose-500 h-2"
                                        style={{ width: `${100 - item.frequenciaPercent}%` }}
                                      />
                                    </div>
                                    <div className="flex justify-between text-[11px] text-slate-600 pt-1">
                                      <span>Atestados: <strong className="text-emerald-700">{item.atestados}d</strong></span>
                                      <span>Sem justificativa: <strong className="text-rose-700">{item.semAtestado}d</strong></span>
                                    </div>
                                  </div>

                                  {/* Situação Legal MEC */}
                                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                                      Conformidade Legal MEC (LDB)
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className={`material-symbols-outlined text-[20px] ${item.isBelowLegal ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {item.isBelowLegal ? 'gpp_bad' : 'verified_user'}
                                      </span>
                                      <span className={`text-xs font-bold ${item.isBelowLegal ? 'text-rose-800' : 'text-emerald-800'}`}>
                                        {item.isBelowLegal ? 'Abaixo do Piso Legal' : 'Conforme a LDB'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-600">
                                      {item.isInfantil
                                        ? 'Educação Infantil: Piso mínimo LDB Art. 31 de 60% de frequência.'
                                        : 'Ensino Fundamental: Piso mínimo LDB Art. 24 de 75% de frequência.'}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      {item.isBelowLegal
                                        ? 'Requer acompanhamento pedagógico e intervenção da gestão escolar.'
                                        : 'Frequência regular dentro dos parâmetros institucionais.'}
                                    </p>
                                  </div>

                                  {/* Alerta de Busca Ativa ECA com Pulsação Suave */}
                                  <div
                                    className={`p-3.5 rounded-xl border space-y-2 transition-all ${
                                      item.hasConsecutiveAlert
                                        ? item.consecutiveAlertTier === '10d'
                                          ? 'bg-rose-50/80 border-rose-300 animate-pulse-subtle-rose'
                                          : 'bg-amber-50/80 border-amber-300 animate-pulse-subtle-amber'
                                        : 'bg-slate-50 border-slate-200/70'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span
                                        className={`text-[11px] font-bold uppercase tracking-wider block ${
                                          item.hasConsecutiveAlert
                                            ? item.consecutiveAlertTier === '10d'
                                              ? 'text-rose-800'
                                              : 'text-amber-800'
                                            : 'text-slate-500'
                                        }`}
                                      >
                                        Protocolo de Busca Ativa
                                      </span>
                                      {item.hasConsecutiveAlert && (
                                        <span className="relative flex h-2 w-2">
                                          <span
                                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                              item.consecutiveAlertTier === '10d'
                                                ? 'bg-rose-500'
                                                : 'bg-amber-500'
                                            }`}
                                          />
                                          <span
                                            className={`relative inline-flex rounded-full h-2 w-2 ${
                                              item.consecutiveAlertTier === '10d'
                                                ? 'bg-rose-600'
                                                : 'bg-amber-600'
                                            }`}
                                          />
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`material-symbols-outlined text-[20px] ${
                                          item.hasConsecutiveAlert
                                            ? item.consecutiveAlertTier === '10d'
                                              ? 'text-rose-600'
                                              : 'text-amber-600'
                                            : 'text-emerald-600'
                                        }`}
                                      >
                                        {item.hasConsecutiveAlert ? 'notification_important' : 'task_alt'}
                                      </span>
                                      <span
                                        className={`text-xs font-bold ${
                                          item.hasConsecutiveAlert
                                            ? item.consecutiveAlertTier === '10d'
                                              ? 'text-rose-900'
                                              : 'text-amber-900'
                                            : 'text-slate-700'
                                        }`}
                                      >
                                        {item.hasConsecutiveAlert ? item.alertLabel : 'Sem Alerta de Consecutivas'}
                                      </span>
                                    </div>
                                    <p
                                      className={`text-xs ${
                                        item.hasConsecutiveAlert
                                          ? item.consecutiveAlertTier === '10d'
                                            ? 'text-rose-900'
                                            : 'text-amber-900'
                                          : 'text-slate-600'
                                      }`}
                                    >
                                      {item.hasConsecutiveAlert
                                        ? item.consecutiveAlertTier === '10d'
                                          ? 'Gatilho crítico: Notificação formal ao Conselho Tutelar e Busca Ativa emergencial.'
                                          : item.consecutiveAlertTier === '5d'
                                          ? 'Gatilho intermediário: Contato imediato com responsável legal e busca escolar.'
                                          : 'Gatilho preventivo: Observação atenta da equipe pedagógica.'
                                        : 'Nenhum ciclo contínuo de faltas não justificadas detectado.'}
                                    </p>
                                  </div>
                                </div>

                                {/* Dados Cadastrais, Família e Logística Escolar */}
                                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      Telefones &amp; Contato Direto
                                    </span>
                                    {(() => {
                                      const rawPhone = item.student.telefones || item.student.guardianPhone;
                                      const waList = buildWhatsAppLinksFromPhoneString(
                                        rawPhone,
                                        item.student.name,
                                        `Olá! Somos da Secretaria de Educação de Jundiaí / EMEB Joaquim Candelário de Freitas. Gostaríamos de conversar sobre o acompanhamento escolar de ${item.student.name}.`
                                      );
                                      if (!rawPhone || waList.length === 0) {
                                        return <span className="text-slate-400 italic">Sem telefone cadastrado</span>;
                                      }
                                      return (
                                        <div className="space-y-1">
                                          <div className="font-semibold text-slate-800 font-mono text-xs">
                                            {rawPhone}
                                          </div>
                                          <div className="flex items-center gap-1.5 pt-0.5">
                                            <a
                                              href={waList[0].waUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#25d366]/15 hover:bg-[#25d366]/25 text-[#075e54] font-bold text-[11px] transition-colors"
                                              title={`Abrir WhatsApp: ${waList[0].display}`}
                                            >
                                              <span className="material-symbols-outlined text-[13px]">chat</span>
                                              <span>WhatsApp</span>
                                            </a>
                                            <a
                                              href={`tel:${rawPhone.replace(/\D/g, '')}`}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px] transition-colors"
                                              title="Ligar"
                                            >
                                              <span className="material-symbols-outlined text-[13px]">call</span>
                                              <span>Ligar</span>
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  <div>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      Filiação / Responsável
                                    </span>
                                    <span className="font-semibold text-slate-800 truncate block">
                                      {item.student.filiacao1 || item.student.guardianName || 'Responsável não informado'}
                                    </span>
                                    {item.student.filiacao2 && (
                                      <span className="text-[11px] text-slate-500 truncate block">
                                        {item.student.filiacao2}
                                      </span>
                                    )}
                                  </div>

                                  <div>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      Programas Sociais / AEE
                                    </span>
                                    <div className="space-y-1">
                                      <span className="font-semibold text-slate-800 block">
                                        {item.student.nis ? (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono text-[11px] font-bold border border-emerald-200">
                                            Bolsa Família (NIS {item.student.nis})
                                          </span>
                                        ) : (
                                          <span className="text-slate-500">Sem NIS informado</span>
                                        )}
                                      </span>
                                      {item.student.deficiencia && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 text-[11px] font-bold border border-purple-200 block truncate">
                                          AEE: {item.student.deficiencia}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      Logística &amp; Endereço
                                    </span>
                                    <span className="font-semibold text-slate-800 block">
                                      {item.student.rotaOnibus ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 font-bold text-[11px] border border-sky-200">
                                          🚌 Ônibus Fretado: {item.student.rotaOnibus}
                                        </span>
                                      ) : (
                                        <span className="text-slate-500">Transporte individual</span>
                                      )}
                                    </span>
                                    {(item.student.logradouro || item.student.bairro) && (
                                      <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                                        {item.student.logradouro} {item.student.numeroResidencia ? `nº ${item.student.numeroResidencia}` : ''} {item.student.bairro ? `· ${item.student.bairro}` : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Retorno da Família Registrado */}
                                {item.familyFeedback && (
                                  <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                                    <span className="material-symbols-outlined text-amber-700 text-[18px] shrink-0 mt-0.5">
                                      feedback
                                    </span>
                                    <div>
                                      <span className="font-bold block">Último retorno da família / justificativa:</span>
                                      <p className="mt-0.5 text-slate-800">{item.familyFeedback}</p>
                                    </div>
                                  </div>
                                )}
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
        <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Despacho da Gestão • {currentClass.name}
              </span>
              {notesSavedFeedback && (
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">done</span>
                  Salvo
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Acompanhamento &amp; Despacho ({selectedMonthName})
            </h3>
            <p className="text-xs text-slate-500">
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
            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-none resize-none leading-relaxed transition-all"
          />

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>
              Regente: {currentClass.teacherFirstName || currentClass.teacherName || 'Não atribuído'}
            </span>
            <span>Salvamento em tempo real</span>
          </div>
        </div>
      </section>

      {/* Rodapé com Navegação entre Períodos e Retorno */}
      <section className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Fechamento de {selectedMonthName}/2027
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-0.5">
            Relatório gerado a partir da base oficial do Google Sheets da EMEB Prof. Joaquim Candelário de Freitas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previousPeriodName && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonthName(previousPeriodName);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="h-9 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200/90 transition-colors"
              title={`Ir para ${previousPeriodName}`}
            >
              <span className="material-symbols-outlined text-[16px] text-slate-500">history</span>
              <span>Período Anterior ({previousPeriodName})</span>
            </button>
          )}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Voltar</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
