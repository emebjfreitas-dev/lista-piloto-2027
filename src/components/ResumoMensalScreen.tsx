import React, { useState, useMemo } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { MONTHLY_SCHOOL_DAYS_2027 } from '../data/mockData';
import {
  isStudentEducacaoInfantil,
  getStudentConsecutiveAlertInfo,
} from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';

interface ResumoMensalScreenProps {
  currentClass: ClassGroup;
  allClasses: ClassGroup[];
  userRole?: UserRole;
  initialTab?: 'resumo_turma' | 'metricas_uso';
  onSelectClass: (cls: ClassGroup) => void;
  onSaveNotes?: (notes: string) => void;
  onOpenMonthlyLaunchForClass?: (cls: ClassGroup) => void;
  onOpenReportPrint: () => void;
  onNavigateToSheet: () => void;
}

export interface ClassUsageMetricItem {
  cls: ClassGroup;
  activeStudentsCount: number;
  verifiedStudentsCount: number;
  completionRate: number;
  classesHeld: number;
  expectedDaysTarget: number;
  frequencyRate: number;
  totalAbsencesMonth: number;
  consecutiveAlertsCount: number;
  pendingCount: number;
  pendingReasons: string[];
  status: 'atualizado' | 'parcial' | 'pendente';
  lastUpdateLabel: string;
}

interface EvaluatedStudentMonth {
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
  hasFamilyFeedback: boolean;
  familyFeedback?: string;
}

const getStudentMonthSnapshot = (
  student: Student,
  cls: ClassGroup,
  monthName: string,
  defaultMonthDays: number
): EvaluatedStudentMonth => {
  const configuredDays =
    (cls.monthlySchoolDays && cls.monthlySchoolDays[monthName]) ||
    (monthName === 'Outubro' ? cls.classesHeld : undefined) ||
    defaultMonthDays;

  const explicit = student.monthlyAttendanceByMonth?.[monthName];
  let diasLetivos = configuredDays;
  let faltas = 0;
  let atestados = 0;

  if (explicit) {
    diasLetivos = Math.max(
      1,
      Math.min(configuredDays, explicit.diasLetivosRecorte || configuredDays)
    );
    faltas = Math.max(0, Math.min(diasLetivos, explicit.faltas || 0));
    atestados = Math.max(0, Math.min(faltas, explicit.atestados || 0));
  } else if (monthName === 'Outubro') {
    diasLetivos = Math.max(
      1,
      Math.min(configuredDays, student.diasLetivosRecorte || configuredDays)
    );
    faltas = Math.max(0, Math.min(diasLetivos, student.totalAbsencesMonth || 0));
    atestados = Math.max(0, Math.min(faltas, student.justifiedAbsences || 0));
  } else {
    const baseFaltas = student.totalAbsencesMonth || 0;
    const baseAtest = Math.min(baseFaltas, student.justifiedAbsences || 0);
    const monthIndex = MONTHLY_SCHOOL_DAYS_2027.findIndex((m) => m.month === monthName);
    if (baseFaltas >= 4) {
      faltas = Math.min(configuredDays, Math.max(1, baseFaltas - (monthIndex % 2)));
      atestados = Math.min(faltas, baseAtest);
    } else if (baseFaltas > 0) {
      faltas =
        (student.number + monthIndex) % 2 === 0
          ? baseFaltas
          : Math.max(0, baseFaltas - 1);
      atestados = Math.min(faltas, baseAtest);
    }
  }

  const presencas = Math.max(0, diasLetivos - faltas);
  const frequenciaPercent =
    diasLetivos > 0 ? Math.round((presencas / diasLetivos) * 100) : 100;
  const isInfantil = isStudentEducacaoInfantil(student, cls.name);
  const minLegalPercent = isInfantil ? 60 : 75;
  const isBelowLegal = frequenciaPercent < minLegalPercent;

  const alertInfo = getStudentConsecutiveAlertInfo(student);
  const hasConsecutiveAlert = alertInfo.tier !== 'none';

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
    hasConsecutiveAlert,
    consecutiveAlertDays: alertInfo.days,
    consecutiveAlertTier: alertInfo.tier,
    alertLabel: alertInfo.label,
    hasFamilyFeedback: alertInfo.hasFamilyFeedback,
    familyFeedback: alertInfo.familyFeedback,
  };
};

export const ResumoMensalScreen: React.FC<ResumoMensalScreenProps> = ({
  currentClass,
  allClasses,
  userRole = 'admin',
  onSelectClass,
  onSaveNotes,
  onOpenMonthlyLaunchForClass,
  onOpenReportPrint,
  onNavigateToSheet,
}) => {
  const [selectedMonthName, setSelectedMonthName] = useState<string>('Outubro');
  const [scopeFilter, setScopeFilter] = useState<'all_classes' | string>(() =>
    userRole === 'usuario' ? currentClass.id : 'all_classes'
  );
  const [shiftFilter, setShiftFilter] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'infantil' | 'fundamental'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSearchFilter, setActiveSearchFilter] = useState<
    'all_alerts' | 'below_mec' | 'consecutive' | 'all_students'
  >('all_alerts');

  const [pedagogicalNotes, setPedagogicalNotes] = useState(
    currentClass.pedagogicalNotes || ''
  );
  const [notesSavedFeedback, setNotesSavedFeedback] = useState(false);

  React.useEffect(() => {
    setPedagogicalNotes(currentClass.pedagogicalNotes || '');
  }, [currentClass.id, currentClass.pedagogicalNotes]);

  const monthDef = useMemo(
    () =>
      MONTHLY_SCHOOL_DAYS_2027.find((m) => m.month === selectedMonthName) ||
      MONTHLY_SCHOOL_DAYS_2027[8],
    [selectedMonthName]
  );

  // Turmas no escopo selecionado pelos slicers
  const scopedClasses = useMemo(() => {
    return allClasses.filter((cls) => {
      if (scopeFilter !== 'all_classes' && cls.id !== scopeFilter) return false;
      const shiftClean = cls.shift.toUpperCase().includes('MANH') ? 'MANHÃ' : 'TARDE';
      if (shiftFilter !== 'all' && shiftClean !== shiftFilter) return false;
      const isInf =
        cls.name.toUpperCase().startsWith('GRUPO') ||
        cls.name.toUpperCase().startsWith('G');
      if (segmentFilter === 'infantil' && !isInf) return false;
      if (segmentFilter === 'fundamental' && isInf) return false;
      return true;
    });
  }, [allClasses, scopeFilter, shiftFilter, segmentFilter]);

  // Consolidação analítica estilo Power BI
  const powerBiData = useMemo(() => {
    const classBars: Array<{
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
      clsRef: ClassGroup;
    }> = [];

    const allStudentsEvaluated: EvaluatedStudentMonth[] = [];

    let sumDiasMatriculados = 0;
    let sumPresencas = 0;
    let sumFaltas = 0;
    let sumAtestados = 0;
    let sumBelowLegal = 0;
    let sumBelowInfantil = 0;
    let sumBelowFundamental = 0;
    let sumConsecutiveAlerts = 0;
    let sumTier3d = 0;
    let sumTier5d = 0;
    let sumTier10d = 0;

    scopedClasses.forEach((cls) => {
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
        const snap = getStudentMonthSnapshot(
          st,
          cls,
          selectedMonthName,
          monthDef.schoolDays
        );
        allStudentsEvaluated.push(snap);

        clsDias += snap.diasLetivos;
        clsPres += snap.presencas;
        clsFaltas += snap.faltas;
        clsAtest += snap.atestados;

        if (snap.isBelowLegal) {
          clsBelow += 1;
          if (snap.isInfantil) sumBelowInfantil += 1;
          else sumBelowFundamental += 1;
        }

        if (snap.hasConsecutiveAlert) {
          clsConsec += 1;
          if (snap.consecutiveAlertTier === '3d') sumTier3d += 1;
          else if (snap.consecutiveAlertTier === '5d') sumTier5d += 1;
          else if (snap.consecutiveAlertTier === '10d') sumTier10d += 1;
        }
      });

      sumDiasMatriculados += clsDias;
      sumPresencas += clsPres;
      sumFaltas += clsFaltas;
      sumAtestados += clsAtest;
      sumBelowLegal += clsBelow;
      sumConsecutiveAlerts += clsConsec;

      const freqRate = clsDias > 0 ? Math.round((clsPres / clsDias) * 100) : 100;
      const isInfantil =
        cls.name.toUpperCase().startsWith('GRUPO') ||
        cls.name.toUpperCase().startsWith('G');

      classBars.push({
        classId: cls.id,
        className: cls.name,
        shortName: cls.turmaAbrev || cls.name.replace('GRUPO ', 'G'),
        shift: cls.shift.replace('Turno ', ''),
        teacherName: cls.teacherFirstName || cls.teacherName || 'Regente',
        isInfantil,
        minLegalPercent: isInfantil ? 60 : 75,
        activeStudents: activeStudents.length,
        frequencyRate: freqRate,
        totalFaltas: clsFaltas,
        totalAtestados: clsAtest,
        totalSemAtestado: Math.max(0, clsFaltas - clsAtest),
        belowLegalCount: clsBelow,
        consecutiveAlertsCount: clsConsec,
        clsRef: cls,
      });
    });

    const overallFrequencyRate =
      sumDiasMatriculados > 0
        ? Math.round((sumPresencas / sumDiasMatriculados) * 100)
        : 100;

    const sumSemAtestado = Math.max(0, sumFaltas - sumAtestados);
    const justifiedSharePercent =
      sumFaltas > 0 ? Math.round((sumAtestados / sumFaltas) * 100) : 0;

    // Meta Legal MEC Média Ponderada
    const targetLegalPonderada =
      segmentFilter === 'infantil'
        ? 60
        : segmentFilter === 'fundamental'
        ? 75
        : 70; // Média estimada do conjunto escolar

    const overallMeetsLegal = overallFrequencyRate >= targetLegalPonderada;
    const overallMeetsSchoolTarget = overallFrequencyRate >= 85;

    return {
      totalActiveStudents: allStudentsEvaluated.length,
      sumDiasMatriculados,
      sumPresencas,
      overallFrequencyRate,
      targetLegalPonderada,
      overallMeetsLegal,
      overallMeetsSchoolTarget,
      sumFaltas,
      sumAtestados,
      sumSemAtestado,
      justifiedSharePercent,
      sumBelowLegal,
      sumBelowInfantil,
      sumBelowFundamental,
      sumConsecutiveAlerts,
      sumTier3d,
      sumTier5d,
      sumTier10d,
      classBars,
      allStudentsEvaluated,
    };
  }, [scopedClasses, selectedMonthName, monthDef.schoolDays, segmentFilter]);

  // Lista filtrada de estudantes para o painel de Busca Ativa
  const displayedStudents = useMemo(() => {
    let list = powerBiData.allStudentsEvaluated;

    if (activeSearchFilter === 'all_alerts') {
      list = list.filter((i) => i.isBelowLegal || i.hasConsecutiveAlert || i.faltas >= 3);
    } else if (activeSearchFilter === 'below_mec') {
      list = list.filter((i) => i.isBelowLegal);
    } else if (activeSearchFilter === 'consecutive') {
      list = list.filter((i) => i.hasConsecutiveAlert);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.student.name.toLowerCase().includes(q) ||
          i.student.ra?.toLowerCase().includes(q) ||
          i.cls.name.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      // Ordena primeiro por gravidade (alertas críticos no topo), depois alfabético
      if (a.hasConsecutiveAlert && !b.hasConsecutiveAlert) return -1;
      if (!a.hasConsecutiveAlert && b.hasConsecutiveAlert) return 1;
      if (a.isBelowLegal && !b.isBelowLegal) return -1;
      if (!a.isBelowLegal && b.isBelowLegal) return 1;
      return a.student.name.localeCompare(b.student.name, 'pt-BR', { sensitivity: 'base' });
    });
  }, [powerBiData.allStudentsEvaluated, activeSearchFilter, searchQuery]);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-16 animate-gentle-fade">
      {/* CABEÇALHO EXECUTIVO POWER BI */}
      <header className="bg-[#0f172a] text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[0.72rem] font-bold text-slate-400">
              <span className="bg-[#1e293b] text-sky-400 px-2 py-0.5 rounded border border-sky-900/60 uppercase tracking-widest text-[0.66rem]">
                POWER BI EXECUTIVO
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">EMEB PROF. JOAQUIM CANDELÁRIO DE FREITAS</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">JUNDIAÍ/SP</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span>Resumo Mensal — Frequência &amp; Busca Ativa</span>
            </h1>
            <p className="text-[0.78rem] text-slate-400 font-medium">
              Monitoramento institucional de metas MEC (LDB 9.394/96) e contingenciamento de evasão escolar • Referência:{' '}
              <span className="text-white font-semibold">{selectedMonthName}/2027 ({monthDef.schoolDays} dias letivos)</span>
            </p>
          </div>

          {/* Ações Executivas Rápidas */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenMonthlyLaunchForClass && userRole !== 'peb2' && (
              <button
                type="button"
                onClick={() => onOpenMonthlyLaunchForClass(currentClass)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[0.76rem] flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
                title="Lançamento e Justificativas de Faltas"
              >
                <span className="material-symbols-outlined text-[17px] text-sky-400">
                  edit_calendar
                </span>
                <span>Lançar Faltas ({currentClass.name})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateToSheet}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[0.76rem] flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
              title="Abrir Planilha de Diagnóstico Google"
            >
              <span className="material-symbols-outlined text-[17px] text-emerald-400">
                table_chart
              </span>
              <span>Sync Google Sheets</span>
            </button>

            <button
              type="button"
              onClick={onOpenReportPrint}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[0.76rem] flex items-center gap-1.5 cursor-pointer transition-all shadow-sm active:scale-[0.98]"
              title="Imprimir Ata e Relatório Oficial"
            >
              <span className="material-symbols-outlined text-[17px]">
                print
              </span>
              <span>Imprimir Relatório</span>
            </button>
          </div>
        </div>
      </header>

      {/* BARRA DE SLICERS & SEGMENTAÇÃO DE DADOS (POWER BI CONTROLS) */}
      <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-500 text-[18px]">
              filter_alt
            </span>
            <span className="text-[0.75rem] font-bold text-slate-700 uppercase tracking-wider">
              Segmentadores de Dados (Slicers)
            </span>
          </div>
          {(scopeFilter !== 'all_classes' || shiftFilter !== 'all' || segmentFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setScopeFilter('all_classes');
                setShiftFilter('all');
                setSegmentFilter('all');
              }}
              className="text-[0.72rem] font-bold text-sky-600 hover:text-sky-800 cursor-pointer flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[15px]">clear_all</span>
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Slicer 1: Mês de Referência */}
          <div className="space-y-1">
            <label className="text-[0.66rem] font-bold uppercase tracking-wider text-slate-500 block">
              Mês Letivo (2027)
            </label>
            <select
              value={selectedMonthName}
              onChange={(e) => setSelectedMonthName(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100/70 text-slate-800 font-bold text-[0.8rem] rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
            >
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.month} / 2027 ({m.schoolDays} dias letivos)
                </option>
              ))}
            </select>
          </div>

          {/* Slicer 2: Escopo de Turma */}
          <div className="space-y-1">
            <label className="text-[0.66rem] font-bold uppercase tracking-wider text-slate-500 block">
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
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100/70 text-slate-800 font-bold text-[0.8rem] rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
            >
              {userRole !== 'usuario' && (
                <option value="all_classes">
                  Todas as Turmas ({allClasses.length} turmas consolidadas)
                </option>
              )}
              {allClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  Turma {c.name} — {c.shift.replace('Turno ', '')}
                </option>
              ))}
            </select>
          </div>

          {/* Slicer 3: Etapa / Meta MEC */}
          <div className="space-y-1">
            <label className="text-[0.66rem] font-bold uppercase tracking-wider text-slate-500 block">
              Segmento • Metas MEC
            </label>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value as any)}
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100/70 text-slate-800 font-bold text-[0.8rem] rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
            >
              <option value="all">Todas as Etapas (Infantil + Fundamental)</option>
              <option value="fundamental">Ensino Fundamental (Meta Legal ≥ 75%)</option>
              <option value="infantil">Educação Infantil (Meta Legal ≥ 60%)</option>
            </select>
          </div>

          {/* Slicer 4: Turno */}
          <div className="space-y-1">
            <label className="text-[0.66rem] font-bold uppercase tracking-wider text-slate-500 block">
              Turno Escolar
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value as any)}
              className="w-full h-10 px-3 bg-slate-50 hover:bg-slate-100/70 text-slate-800 font-bold text-[0.8rem] rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer transition-all"
            >
              <option value="all">Manhã + Tarde</option>
              <option value="MANHÃ">Apenas Manhã</option>
              <option value="TARDE">Apenas Tarde</option>
            </select>
          </div>
        </div>
      </section>

      {/* POWER BI SCORECARD: 4 CARTÕES EXECUTIVOS DE METAS & ALERTAS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: Frequência Global vs Meta MEC */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">
              Taxa de Frequência Geral
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[0.65rem] font-extrabold uppercase ${
                powerBiData.overallMeetsSchoolTarget
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : powerBiData.overallMeetsLegal
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {powerBiData.overallMeetsSchoolTarget
                ? 'Meta Superada'
                : powerBiData.overallMeetsLegal
                ? 'Legal OK'
                : 'Abaixo da Meta'}
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-mono tracking-tight tabular-nums">
                {powerBiData.overallFrequencyRate}%
              </span>
              <span className="text-[0.72rem] font-semibold text-slate-500">
                meta MEC: {powerBiData.targetLegalPonderada}%
              </span>
            </div>

            {/* Bullet bar executiva */}
            <div className="w-full bg-slate-100 rounded-full h-2 mt-2 relative overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  powerBiData.overallMeetsSchoolTarget
                    ? 'bg-emerald-600'
                    : powerBiData.overallMeetsLegal
                    ? 'bg-amber-500'
                    : 'bg-rose-600'
                }`}
                style={{ width: `${Math.min(100, powerBiData.overallFrequencyRate)}%` }}
              />
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[0.7rem] text-slate-500 font-medium">
            <span>Presenças: {powerBiData.sumPresencas}</span>
            <span>Total: {powerBiData.sumDiasMatriculados} dias-aluno</span>
          </div>
        </div>

        {/* CARD 2: Alunos Abaixo da Meta Legal MEC */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">
              Risco Legal MEC (&lt;60% / &lt;75%)
            </span>
            <span
              className={`material-symbols-outlined text-[20px] ${
                powerBiData.sumBelowLegal === 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {powerBiData.sumBelowLegal === 0 ? 'verified' : 'gpp_maybe'}
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums ${
                  powerBiData.sumBelowLegal === 0 ? 'text-slate-900' : 'text-rose-700'
                }`}
              >
                {powerBiData.sumBelowLegal}
              </span>
              <span className="text-[0.72rem] font-semibold text-slate-500">
                estudantes em risco
              </span>
            </div>
            <p className="text-[0.72rem] text-slate-500 mt-1">
              {powerBiData.totalActiveStudents > 0
                ? `${((powerBiData.sumBelowLegal / powerBiData.totalActiveStudents) * 100).toFixed(1)}% do corpo discente ativo`
                : '0% do total'}
            </p>
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[0.7rem] font-semibold">
            <span className="text-slate-700">
              Fund. (&lt;75%):{' '}
              <strong className={powerBiData.sumBelowFundamental > 0 ? 'text-rose-700' : 'text-slate-900'}>
                {powerBiData.sumBelowFundamental}
              </strong>
            </span>
            <span className="text-slate-700">
              Infantil (&lt;60%):{' '}
              <strong className={powerBiData.sumBelowInfantil > 0 ? 'text-amber-700' : 'text-slate-900'}>
                {powerBiData.sumBelowInfantil}
              </strong>
            </span>
          </div>
        </div>

        {/* CARD 3: Alertas de Busca Ativa */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">
              Alertas de Busca Ativa
            </span>
            <span
              className={`material-symbols-outlined text-[20px] ${
                powerBiData.sumConsecutiveAlerts === 0 ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              crisis_alert
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums ${
                  powerBiData.sumConsecutiveAlerts === 0 ? 'text-slate-900' : 'text-amber-700'
                }`}
              >
                {powerBiData.sumConsecutiveAlerts}
              </span>
              <span className="text-[0.72rem] font-semibold text-slate-500">
                casos prioritários
              </span>
            </div>
            <p className="text-[0.72rem] text-slate-500 mt-1">
              Gatilhos de 3+, 5+ ou 10+ faltas consecutivas
            </p>
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[0.68rem] font-semibold">
            <span className="text-amber-800">3-4d: {powerBiData.sumTier3d}</span>
            <span className="text-orange-800">5-9d: {powerBiData.sumTier5d}</span>
            <span className="text-rose-800">10d+: {powerBiData.sumTier10d}</span>
          </div>
        </div>

        {/* CARD 4: Absenteísmo & Atestados */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">
              Absenteísmo &amp; Atestados
            </span>
            <span className="material-symbols-outlined text-[20px] text-sky-600">
              medical_information
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-mono tracking-tight tabular-nums">
                {powerBiData.sumFaltas}
              </span>
              <span className="text-[0.72rem] font-semibold text-slate-500">
                faltas registradas
              </span>
            </div>

            {/* Proporção visual justificada vs não justificada */}
            <div className="w-full bg-slate-100 rounded-full h-2 mt-2 flex overflow-hidden">
              <div
                className="bg-emerald-600 h-2 transition-all"
                style={{ width: `${powerBiData.justifiedSharePercent}%` }}
                title={`Atestados: ${powerBiData.justifiedSharePercent}%`}
              />
              <div
                className="bg-rose-500 h-2 transition-all"
                style={{ width: `${100 - powerBiData.justifiedSharePercent}%` }}
                title={`Injustificadas: ${100 - powerBiData.justifiedSharePercent}%`}
              />
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[0.7rem] font-semibold">
            <span className="text-emerald-700">
              Atestados: {powerBiData.sumAtestados} ({powerBiData.justifiedSharePercent}%)
            </span>
            <span className="text-rose-700">
              Injustificadas: {powerBiData.sumSemAtestado}
            </span>
          </div>
        </div>
      </section>

      {/* PAINEL CENTRAL: GRÁFICO SÓBRIO POR TURMA + MATRIZ ANALÍTICA */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Gráfico de Colunas Sóbrio Power BI */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Desempenho por Turma vs. Metas
              </h2>
              <span className="text-[0.68rem] text-slate-400 font-medium">
                Clique na barra para filtrar
              </span>
            </div>
            <p className="text-[0.74rem] text-slate-500">
              Linha tracejada: Meta institucional de frequência (85%).
            </p>
          </div>

          {/* Gráfico SVG / Flex Bar Chart */}
          <div className="w-full h-[260px] relative pt-6 pb-8 px-2 flex flex-col justify-end select-none mt-2">
            {/* Linhas de Referência do Eixo Y */}
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

              {/* Linha da Meta Escolar (85%) */}
              <div
                className="absolute left-8 right-0 border-t-2 border-dashed border-slate-800 z-10 flex items-center justify-end"
                style={{ bottom: '85%' }}
              >
                <span className="bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded -mt-4 mr-1">
                  Meta 85%
                </span>
              </div>
            </div>

            {/* Colunas por Turma */}
            <div className="relative z-20 pl-8 pr-1 h-full flex items-end justify-around gap-2">
              {powerBiData.classBars.map((entry) => {
                const isSelected = scopeFilter === entry.classId;
                const meetsSchool = entry.frequencyRate >= 85;
                const meetsMec = entry.frequencyRate >= entry.minLegalPercent;

                const barColor = meetsSchool
                  ? '#047857' // emerald-700
                  : meetsMec
                  ? '#d97706' // amber-600
                  : '#be123c'; // rose-700

                return (
                  <button
                    key={entry.classId}
                    type="button"
                    onClick={() => {
                      setScopeFilter((prev) =>
                        prev === entry.classId ? 'all_classes' : entry.classId
                      );
                      onSelectClass(entry.clsRef);
                    }}
                    className={`group relative flex-1 h-full flex flex-col justify-end items-center focus:outline-none transition-all ${
                      scopeFilter !== 'all_classes' && !isSelected
                        ? 'opacity-35 hover:opacity-85'
                        : 'opacity-100'
                    }`}
                    title={`Turma ${entry.className} (${entry.shift}) — Frequência: ${entry.frequencyRate}% • Abaixo da Meta MEC: ${entry.belowLegalCount}`}
                  >
                    {/* Tooltip flutuante */}
                    <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-30 w-max max-w-[200px] bg-slate-900 text-white px-2.5 py-1.5 rounded-lg shadow-lg text-left text-[0.68rem] space-y-0.5">
                      <p className="font-bold">
                        {entry.className} ({entry.shift})
                      </p>
                      <p className="text-slate-300">Frequência: {entry.frequencyRate}%</p>
                      <p className="text-slate-300">
                        Faltas: {entry.totalFaltas} ({entry.totalAtestados} c/ atestado)
                      </p>
                      <p className="text-slate-300">
                        Risco MEC (&lt;{entry.minLegalPercent}%): {entry.belowLegalCount}
                      </p>
                    </div>

                    {/* Rótulo percentual */}
                    <span className="text-[10px] font-bold font-mono text-slate-800 tabular-nums mb-1">
                      {entry.frequencyRate}%
                    </span>

                    {/* Barra */}
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

                    {/* Nome da Turma */}
                    <span
                      className={`absolute -bottom-6 text-[10px] font-bold truncate max-w-[50px] ${
                        isSelected ? 'text-slate-900 underline font-extrabold' : 'text-slate-600'
                      }`}
                    >
                      {entry.shortName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[0.68rem] text-slate-500 font-semibold">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#047857]" /> ≥85%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#d97706]" /> Atenção
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#be123c]" /> Crítico (&lt;MEC)
              </span>
            </div>
            <span>Base: {selectedMonthName}/2027</span>
          </div>
        </div>

        {/* Matriz Analítica por Turma */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Matriz Consolidada de Turmas ({selectedMonthName})
              </h2>
              <p className="text-[0.74rem] text-slate-500">
                Métricas diretas de frequência, atestados médicos e contagem de alunos em risco legal.
              </p>
            </div>
            {scopeFilter !== 'all_classes' && (
              <button
                type="button"
                onClick={() => setScopeFilter('all_classes')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[0.7rem] cursor-pointer"
              >
                Ver Todas
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-[0.76rem] border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[0.65rem] sticky top-0 z-10">
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
                {powerBiData.classBars.map((row) => {
                  const isSelected = scopeFilter === row.classId;
                  const isCompliant = row.frequencyRate >= row.minLegalPercent;

                  return (
                    <tr
                      key={row.classId}
                      onClick={() => {
                        setScopeFilter((prev) =>
                          prev === row.classId ? 'all_classes' : row.classId
                        );
                        onSelectClass(row.clsRef);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900 block">
                          {row.className}
                        </span>
                        <span className="text-[0.66rem] text-slate-500 block">
                          {row.shift} · Prof. {row.teacherName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-medium text-slate-600">
                        {row.activeStudents}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono">
                        <span
                          className={`font-extrabold ${
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
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[0.68rem] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            {row.belowLegalCount} aluno(s)
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold text-[0.7rem]">
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

      {/* PAINEL DE OPERAÇÃO: BUSCA ATIVA & ESTUDANTES EM PONTO DE ATENÇÃO */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Tabela de Estudantes em Alerta */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-[20px]">
                  contact_support
                </span>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Painel de Busca Ativa &amp; Alertas de Frequência ({displayedStudents.length})
                </h2>
              </div>
              <p className="text-[0.74rem] text-slate-500">
                Estudantes abaixo da meta legal MEC (&lt;60% Infantil / &lt;75% Fundamental) ou com alertas de faltas consecutivas.
              </p>
            </div>

            {/* Filtros rápidos e busca */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar aluno ou RA..."
                  className="h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-[0.75rem] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">
                  search
                </span>
              </div>

              {/* Botões de filtro */}
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[0.68rem] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveSearchFilter('all_alerts')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    activeSearchFilter === 'all_alerts'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Alertas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSearchFilter('below_mec')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    activeSearchFilter === 'below_mec'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  &lt; Meta MEC
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSearchFilter('consecutive')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    activeSearchFilter === 'consecutive'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Consecutivas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSearchFilter('all_students')}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    activeSearchFilter === 'all_students'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>
          </div>

          {displayedStudents.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <span className="material-symbols-outlined text-4xl text-emerald-600">
                check_circle
              </span>
              <p className="text-sm font-bold text-slate-800">
                Nenhuma ocorrência encontrada com estes filtros
              </p>
              <p className="text-xs text-slate-500">
                Todos os estudantes selecionados estão em conformidade neste mês.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-[0.76rem] border-collapse">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[0.65rem] sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Estudante</th>
                    <th className="py-2.5 px-2">Turma</th>
                    <th className="py-2.5 px-2 text-center">Faltas</th>
                    <th className="py-2.5 px-2 text-center">Atestados</th>
                    <th className="py-2.5 px-2 text-center">% Presença vs Meta</th>
                    <th className="py-2.5 px-3">Motivo / Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedStudents.map((item) => (
                    <tr
                      key={`${item.cls.id}-${item.student.id}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <StudentAvatar
                            student={item.student}
                            size="sm"
                            expandableOnClick={false}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate">
                              {item.student.name}
                            </span>
                            <span className="text-[0.66rem] text-slate-400 block font-mono">
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
                        <span
                          className={`font-black ${
                            item.isBelowLegal ? 'text-rose-700' : 'text-slate-800'
                          }`}
                        >
                          {item.frequenciaPercent}%
                        </span>
                        <span className="text-[0.66rem] text-slate-400 ml-1">
                          (meta ≥{item.minLegalPercent}%)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {item.hasConsecutiveAlert && (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.64rem] font-bold ${
                                  item.consecutiveAlertTier === '10d'
                                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                    : item.consecutiveAlertTier === '5d'
                                    ? 'bg-orange-100 text-orange-900 border border-orange-300'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {item.alertLabel || `${item.consecutiveAlertDays}d Consecutivas`}
                              </span>
                            )}
                            {item.isBelowLegal && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.64rem] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                Abaixo Meta MEC
                              </span>
                            )}
                            {item.hasFamilyFeedback && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.64rem] font-semibold bg-slate-100 text-slate-700"
                                title={item.familyFeedback}
                              >
                                C/ Retorno Família
                              </span>
                            )}
                          </div>

                          {onOpenMonthlyLaunchForClass && userRole !== 'peb2' && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectClass(item.cls);
                                onOpenMonthlyLaunchForClass(item.cls);
                              }}
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[0.68rem] font-bold shrink-0 cursor-pointer"
                              title="Lançar faltas ou justificar com atestado"
                            >
                              Justificar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Parecer Pedagógico & Despacho Executivo */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">
                Parecer Pedagógico • {currentClass.name}
              </span>
              {notesSavedFeedback && (
                <span className="text-[0.68rem] font-bold text-emerald-700 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">done</span>
                  Salvo
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Despacho &amp; Acompanhamento ({selectedMonthName})
            </h3>
            <p className="text-[0.74rem] text-slate-500">
              Registro formal de busca ativa e intervenções para a Turma {currentClass.name}.
            </p>
          </div>

          <textarea
            rows={6}
            value={pedagogicalNotes}
            onChange={(e) => {
              setPedagogicalNotes(e.target.value);
              onSaveNotes?.(e.target.value);
              setNotesSavedFeedback(true);
            }}
            placeholder="Registre as tratativas de busca ativa, contatos realizados com as famílias, justificativas de atestados e alinhamento com a equipe gestora..."
            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-[0.8rem] focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:outline-none resize-none leading-relaxed transition-all"
          />

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[0.7rem] text-slate-500 font-medium">
            <span>
              Regente: {currentClass.teacherFirstName || currentClass.teacherName || 'Não atribuído'}
            </span>
            <span>Gravação instantânea</span>
          </div>
        </div>
      </section>
    </div>
  );
};
