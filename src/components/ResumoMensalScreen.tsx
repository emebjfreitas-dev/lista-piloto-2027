import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { ClassGroup, Student, UserRole } from '../types';
import { MONTHLY_SCHOOL_DAYS_2027 } from '../data/mockData';
import { isStudentEducacaoInfantil } from '../utils/attendanceRules';
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
  const hasConsecutiveAlert = Boolean(
    student.consecutiveAbsenceAlert?.active &&
      (student.consecutiveAbsenceAlert.selectedDates?.length || 0) >= 3
  );

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
}) => {
  const [selectedMonthName, setSelectedMonthName] = useState<string>('Outubro');
  const [scopeFilter, setScopeFilter] = useState<'all_classes' | string>(() =>
    userRole === 'usuario' ? currentClass.id : 'all_classes'
  );
  const [shiftFilter, setShiftFilter] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'infantil' | 'fundamental'>('all');
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

  // Turmas no escopo selecionado (Visão Geral da Escola vs Turma Específica)
  const scopedClasses = useMemo(() => {
    return allClasses.filter((cls) => {
      if (scopeFilter !== 'all_classes' && cls.id !== scopeFilter) return false;
      const shiftClean = cls.shift.toUpperCase().includes('MANH') ? 'MANHÃ' : 'TARDE';
      if (shiftFilter !== 'all' && shiftClean !== shiftFilter) return false;
      const isInf = cls.name.toUpperCase().startsWith('GRUPO') || cls.name.toUpperCase().startsWith('G');
      if (segmentFilter === 'infantil' && !isInf) return false;
      if (segmentFilter === 'fundamental' && isInf) return false;
      return true;
    });
  }, [allClasses, scopeFilter, shiftFilter, segmentFilter]);

  // Consolidação por Turma e por Estudante para o Power BI Educacional
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

    // Estudantes em Ponto de Atenção (Abaixo da Meta Legal ou Com Faltas Consecutivas), ordenados de A a Z
    const criticalStudentsAlphabetical = allStudentsEvaluated
      .filter((item) => item.isBelowLegal || item.hasConsecutiveAlert || item.faltas >= 4)
      .sort((a, b) =>
        a.student.name.localeCompare(b.student.name, 'pt-BR', {
          sensitivity: 'base',
        })
      );

    return {
      totalActiveStudents: allStudentsEvaluated.length,
      overallFrequencyRate,
      sumFaltas,
      sumAtestados,
      sumSemAtestado,
      justifiedSharePercent,
      sumBelowLegal,
      sumBelowInfantil,
      sumBelowFundamental,
      sumConsecutiveAlerts,
      classBars,
      criticalStudentsAlphabetical,
    };
  }, [scopedClasses, selectedMonthName, monthDef.schoolDays]);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {/* BARRA EXECUTIVA POWER BI: TÍTULO E SLICERS (MÊS, TURMA, PERÍODO, ETAPA) */}
      <section className="card-welcoming bg-white p-4 sm:p-5 border border-black/[0.07] space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-[0.7rem] font-semibold text-[#64748b]">
              <span className="text-[#0f172a] font-extrabold uppercase tracking-wider">
                Painel Analítico Educacional
              </span>
              <span aria-hidden="true">·</span>
              <span>{selectedMonthName} 2027 ({monthDef.schoolDays} dias letivos)</span>
              <span aria-hidden="true">·</span>
              <span>
                {scopeFilter === 'all_classes'
                  ? `${scopedClasses.length} turmas consolidadas`
                  : `Turma ${currentClass.name}`}
              </span>
            </div>
            <h1 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-[#0f172a] tracking-tight">
              Resumo Mensal — Inteligência de Frequência &amp; Busca Ativa
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenMonthlyLaunchForClass && userRole !== 'peb2' && (
              <button
                type="button"
                onClick={() => onOpenMonthlyLaunchForClass(currentClass)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[0.78rem] flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-[17px]">
                  edit_calendar
                </span>
                <span>Faltas do Mês ({currentClass.name})</span>
              </button>
            )}

            {userRole === 'admin' && (
              <button
                type="button"
                onClick={onOpenReportPrint}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0f172a] hover:bg-black text-white font-semibold text-[0.78rem] flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-[17px]">
                  print
                </span>
                <span>Imprimir Relatório</span>
              </button>
            )}
          </div>
        </div>

        {/* Slicers estilo Power BI (Filtros Diretos Sem Redundância) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-black/[0.06]">
          {/* Slicer 1: Mês de Referência */}
          <div>
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b] block mb-1">
              Mês Letivo (2027)
            </label>
            <select
              value={selectedMonthName}
              onChange={(e) => setSelectedMonthName(e.target.value)}
              className="w-full min-h-[38px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.8rem] rounded-xl border border-black/[0.07] cursor-pointer"
            >
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.month} / 2027 ({m.schoolDays} dias letivos)
                </option>
              ))}
            </select>
          </div>

          {/* Slicer 2: Escopo (Escola Inteira vs Turma Específica) */}
          <div>
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b] block mb-1">
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
              className="w-full min-h-[38px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.8rem] rounded-xl border border-black/[0.07] cursor-pointer"
            >
              {userRole !== 'usuario' && (
                <option value="all_classes">
                  Todas as Turmas ({allClasses.length} turmas)
                </option>
              )}
              {allClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  Turma {c.name} — {c.shift.replace('Turno ', '')}
                </option>
              ))}
            </select>
          </div>

          {/* Slicer 3: Período */}
          <div>
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b] block mb-1">
              Período
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value as any)}
              className="w-full min-h-[38px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.8rem] rounded-xl border border-black/[0.07] cursor-pointer"
            >
              <option value="all">Manhã + Tarde</option>
              <option value="MANHÃ">Período Manhã</option>
              <option value="TARDE">Período Tarde</option>
            </select>
          </div>

          {/* Slicer 4: Etapa de Ensino */}
          <div>
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b] block mb-1">
              Etapa de Ensino (Meta MEC)
            </label>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value as any)}
              className="w-full min-h-[38px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.8rem] rounded-xl border border-black/[0.07] cursor-pointer"
            >
              <option value="all">Educação Infantil + Fundamental</option>
              <option value="fundamental">Ensino Fundamental (Meta ≥75%)</option>
              <option value="infantil">Educação Infantil (Meta ≥60%)</option>
            </select>
          </div>
        </div>
      </section>

      {/* LINHA 1: 4 CARTÕES EXECUTIVOS DE ALTA DENSIDADE (POWER BI KPI ROW) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Frequência Média vs Meta */}
        <div className="card-welcoming bg-white p-4 border border-black/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#64748b]">
              Frequência Média ({selectedMonthName})
            </span>
            <span
              className={`material-symbols-outlined text-[19px] ${
                powerBiData.overallFrequencyRate >= 85
                  ? 'text-[#006644]'
                  : 'text-[#be123c]'
              }`}
            >
              monitoring
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[2rem] font-black text-[#0f172a] tabular-nums leading-none">
              {powerBiData.overallFrequencyRate}%
            </span>
            <span
              className={`text-[0.74rem] font-bold ${
                powerBiData.overallFrequencyRate >= 85
                  ? 'text-[#006644]'
                  : 'text-[#be123c]'
              }`}
            >
              {powerBiData.overallFrequencyRate >= 85
                ? `Meta escolar cumprida (≥85%)`
                : `${powerBiData.overallFrequencyRate - 85}% vs meta (85%)`}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden mt-2.5">
            <div
              className={`h-full rounded-full ${
                powerBiData.overallFrequencyRate >= 85
                  ? 'bg-[#006644]'
                  : 'bg-[#be123c]'
              }`}
              style={{ width: `${powerBiData.overallFrequencyRate}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Decomposição das Faltas (Com Atestado vs Sem Atestado) */}
        <div className="card-welcoming bg-white p-4 border border-black/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#64748b]">
              Faltas do Mês &amp; Atestados
            </span>
            <span className="material-symbols-outlined text-[19px] text-[#0284c7]">
              medical_information
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[2rem] font-black text-[#0f172a] tabular-nums leading-none">
              {powerBiData.sumFaltas}
            </span>
            <span className="text-[0.74rem] text-[#64748b] font-semibold">
              faltas totais ({powerBiData.justifiedSharePercent}% c/ atestado)
            </span>
          </div>
          <div className="flex items-center justify-between text-[0.72rem] font-bold pt-2 border-t border-black/[0.05] mt-2">
            <span className="text-[#006644]">
              Com Atestado: {powerBiData.sumAtestados}
            </span>
            <span className="text-[#be123c]">
              Sem Atestado: {powerBiData.sumSemAtestado}
            </span>
          </div>
        </div>

        {/* KPI 3: Estudantes Abaixo da Meta Legal (Infantil <60% | Fundamental <75%) */}
        <div className="card-welcoming bg-white p-4 border border-black/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#be123c]">
              Abaixo da Meta Legal MEC
            </span>
            <span className="material-symbols-outlined text-[19px] text-[#be123c]">
              warning
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[2rem] font-black text-[#be123c] tabular-nums leading-none">
              {powerBiData.sumBelowLegal}
            </span>
            <span className="text-[0.74rem] text-[#64748b] font-semibold">
              de {powerBiData.totalActiveStudents} estudantes ativos
            </span>
          </div>
          <div className="flex items-center justify-between text-[0.72rem] font-bold pt-2 border-t border-black/[0.05] mt-2">
            <span className="text-[#0369a1]">
              Fund. (&lt;75%): {powerBiData.sumBelowFundamental}
            </span>
            <span className="text-[#b45309]">
              Infantil (&lt;60%): {powerBiData.sumBelowInfantil}
            </span>
          </div>
        </div>

        {/* KPI 4: Faltas Consecutivas (Busca Ativa 3+ Dias) */}
        <div className="card-welcoming bg-white p-4 border border-black/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#64748b]">
              Faltas Consecutivas (3+ Dias)
            </span>
            <span className="material-symbols-outlined text-[19px] text-[#d97706]">
              event_busy
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[2rem] font-black text-[#0f172a] tabular-nums leading-none">
              {powerBiData.sumConsecutiveAlerts}
            </span>
            <span className="text-[0.74rem] text-[#64748b] font-semibold">
              alertas ativos de busca ativa
            </span>
          </div>
          <div className="flex items-center justify-between text-[0.72rem] font-semibold text-[#64748b] pt-2 border-t border-black/[0.05] mt-2">
            <span>Monitoramento diário</span>
            <span className="text-[#0f172a] font-bold">
              {scopedClasses.length} turma(s)
            </span>
          </div>
        </div>
      </section>

      {/* LINHA 2: GRÁFICO COMPARATIVO POR TURMA (ESQUERDA) + MATRIZ ANALÍTICA POR TURMA (DIREITA) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Gráfico Power BI: Taxa de Presença por Turma vs Linha de Meta */}
        <div className="lg:col-span-5 card-welcoming bg-white p-4 sm:p-5 border border-black/[0.06] flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[0.98rem] font-bold text-[#0f172a]">
                Presença Mensal por Turma ({selectedMonthName})
              </h2>
              <span className="text-[0.7rem] font-semibold text-[#64748b]">
                Clique na barra para filtrar
              </span>
            </div>
            <p className="text-[0.75rem] text-[#64748b]">
              Comparativo direto entre turmas com linha de referência na meta escolar (85%).
            </p>
          </div>

          <div className="w-full h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={powerBiData.classBars}
                margin={{ top: 10, right: 8, left: -24, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="shortName"
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <ReferenceLine
                  y={85}
                  stroke="#0f172a"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-[#0f172a] text-white px-3.5 py-2.5 rounded-xl shadow-lg text-[0.74rem] space-y-0.5">
                        <p className="font-bold">
                          Turma {d.className} ({d.shift}) — {d.frequencyRate}%
                        </p>
                        <p className="text-white/80">
                          Faltas: {d.totalFaltas} ({d.totalAtestados} c/ atestado · {d.totalSemAtestado} s/ atestado)
                        </p>
                        <p className="text-white/80">
                          Abaixo da meta (&lt;{d.minLegalPercent}%): {d.belowLegalCount} aluno(s)
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="frequencyRate"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={32}
                  className="cursor-pointer"
                  onClick={(barData: any) => {
                    const clickedId = barData?.classId || barData?.payload?.classId;
                    const clickedCls = barData?.clsRef || barData?.payload?.clsRef;
                    if (clickedId) {
                      setScopeFilter((prev) =>
                        prev === clickedId ? 'all_classes' : clickedId
                      );
                      if (clickedCls) onSelectClass(clickedCls);
                    }
                  }}
                >
                  {powerBiData.classBars.map((entry, idx) => (
                    <Cell
                      key={`bar-${idx}`}
                      fill={
                        entry.frequencyRate >= 85
                          ? '#006644'
                          : entry.frequencyRate >= entry.minLegalPercent
                          ? '#d97706'
                          : '#be123c'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/[0.05] text-[0.7rem] font-semibold text-[#64748b]">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#006644]" />
                ≥85% (Meta)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#d97706]" />
                Atenção
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#be123c]" />
                Crítico
              </span>
            </div>
            <span>Linha tracejada: Meta 85%</span>
          </div>
        </div>

        {/* Matriz Consolidada por Turma (Tabela Analítica Enxuta) */}
        <div className="lg:col-span-7 card-welcoming bg-white border border-black/[0.06] overflow-hidden flex flex-col justify-between">
          <div className="p-4 sm:p-5 border-b border-black/[0.06] flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.98rem] font-bold text-[#0f172a]">
                Matriz Analítica por Turma ({selectedMonthName}/2027)
              </h2>
              <p className="text-[0.75rem] text-[#64748b]">
                Visão consolidada sem redundância: presença, faltas com/sem atestado e estudantes abaixo da meta.
              </p>
            </div>
            {scopeFilter !== 'all_classes' && (
              <button
                type="button"
                onClick={() => setScopeFilter('all_classes')}
                className="px-2.5 py-1 rounded-lg bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-bold text-[0.72rem] cursor-pointer shrink-0"
              >
                Ver Todas as Turmas
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[290px] overflow-y-auto">
            <table className="w-full text-left text-[0.76rem] border-collapse">
              <thead className="bg-[#f8fafc] text-[#475569] border-b border-black/[0.06] font-bold uppercase text-[0.66rem] sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">Turma</th>
                  <th className="py-2.5 px-2.5 text-center">Ativos</th>
                  <th className="py-2.5 px-2.5 text-center">% Presença</th>
                  <th className="py-2.5 px-2.5 text-center">Faltas</th>
                  <th className="py-2.5 px-2.5 text-center">C/ Atestado</th>
                  <th className="py-2.5 px-2.5 text-center">S/ Atestado</th>
                  <th className="py-2.5 px-3 text-center">Abaixo da Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {powerBiData.classBars.map((row) => {
                  const isSelectedRow = scopeFilter === row.classId;
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
                        isSelectedRow
                          ? 'bg-[#eff6ff]'
                          : 'hover:bg-[#f8fafc]'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-[#0f172a] block">
                          {row.className}
                        </span>
                        <span className="text-[0.66rem] text-[#64748b] block">
                          {row.shift} · Prof. {row.teacherName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-semibold text-[#475569]">
                        {row.activeStudents}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        <span
                          className={`font-black ${
                            row.frequencyRate >= 85
                              ? 'text-[#006644]'
                              : 'text-[#be123c]'
                          }`}
                        >
                          {row.frequencyRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold text-[#0f172a]">
                        {row.totalFaltas}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold text-[#006644]">
                        {row.totalAtestados}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold text-[#be123c]">
                        {row.totalSemAtestado}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {row.belowLegalCount > 0 ? (
                          <span className="font-extrabold text-[#be123c]">
                            {row.belowLegalCount} (&lt;{row.minLegalPercent}%)
                          </span>
                        ) : (
                          <span className="text-[#006644] font-bold">0</span>
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

      {/* LINHA 3: RELAÇÃO NOMINAL PRIORITÁRIA (ORDEM ALFABÉTICA A-Z) + OBSERVAÇÃO PEDAGÓGICA */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Lista de Atenção Prioritária em Ordem Alfabética */}
        <div className="lg:col-span-8 card-welcoming bg-white border border-black/[0.06] overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.98rem] font-bold text-[#0f172a]">
                Estudantes em Ponto de Atenção — Ordem Alfabética ({powerBiData.criticalStudentsAlphabetical.length})
              </h2>
              <p className="text-[0.75rem] text-[#64748b]">
                Estudantes abaixo da meta legal (&lt;60% Ed. Infantil / &lt;75% Fundamental) ou com alerta de faltas em {selectedMonthName}.
              </p>
            </div>
          </div>

          {powerBiData.criticalStudentsAlphabetical.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <span className="material-symbols-outlined text-[32px] text-[#006644]">
                verified
              </span>
              <p className="text-[0.88rem] font-bold text-[#0f172a]">
                Nenhum estudante abaixo da meta legal neste recorte
              </p>
              <p className="text-[0.76rem] text-[#64748b]">
                Todos os estudantes ativos cumpriram o mínimo exigido em {selectedMonthName}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-left text-[0.76rem] border-collapse">
                <thead className="bg-[#f8fafc] text-[#475569] border-b border-black/[0.06] font-bold uppercase text-[0.66rem] sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Estudante (A–Z)</th>
                    <th className="py-2.5 px-2.5">Turma</th>
                    <th className="py-2.5 px-2.5 text-center">Faltas</th>
                    <th className="py-2.5 px-2.5 text-center">Tem Atestado?</th>
                    <th className="py-2.5 px-3 text-center">% Presença vs Meta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {powerBiData.criticalStudentsAlphabetical.map((item) => (
                    <tr
                      key={`${item.cls.id}-${item.student.id}`}
                      onClick={() => {
                        onSelectClass(item.cls);
                        if (onOpenMonthlyLaunchForClass && userRole !== 'peb2') {
                          onOpenMonthlyLaunchForClass(item.cls);
                        }
                      }}
                      className="hover:bg-[#f8fafc] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <StudentAvatar
                            student={item.student}
                            size="sm"
                            expandableOnClick={false}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-[#0f172a] block truncate">
                              {item.student.name}
                            </span>
                            <span className="text-[0.66rem] text-[#64748b] block">
                              RA {item.student.ra}-{item.student.digRa}
                              {item.hasConsecutiveAlert ? ' · 3+ Faltas Consecutivas' : ''}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 font-semibold text-[#334155]">
                        {item.cls.name}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold text-[#be123c]">
                        {item.faltas}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.atestados > 0 ? (
                          <span className="font-bold text-[#006644]">
                            SIM ({item.atestados})
                          </span>
                        ) : (
                          <span className="font-bold text-[#be123c]">NÃO</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        <span
                          className={`font-black ${
                            item.isBelowLegal ? 'text-[#be123c]' : 'text-[#d97706]'
                          }`}
                        >
                          {item.frequenciaPercent}%
                        </span>
                        <span className="text-[0.66rem] text-[#64748b] ml-1">
                          (meta ≥{item.minLegalPercent}%)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Registro Pedagógico Sintético da Turma */}
        <div className="lg:col-span-4 card-welcoming bg-white p-4 sm:p-5 border border-black/[0.06] flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#64748b]">
                Parecer Pedagógico • Turma {currentClass.name}
              </span>
              {notesSavedFeedback && (
                <span className="text-[0.68rem] font-bold text-[#006644]">
                  Salvo
                </span>
              )}
            </div>
            <h3 className="text-[0.95rem] font-bold text-[#0f172a]">
              Observações de Fechamento ({selectedMonthName})
            </h3>
            <p className="text-[0.74rem] text-[#64748b]">
              Síntese qualitativa de busca ativa e acompanhamento de frequência da Turma {currentClass.name}.
            </p>
          </div>

          <textarea
            rows={5}
            value={pedagogicalNotes}
            onChange={(e) => {
              setPedagogicalNotes(e.target.value);
              onSaveNotes?.(e.target.value);
              setNotesSavedFeedback(true);
            }}
            placeholder="Registre observações objetivas sobre atestados, busca ativa e retenção da turma..."
            className="w-full p-3 rounded-xl bg-[#f8fafc] border border-black/[0.08] text-[#0f172a] text-[0.82rem] focus:bg-white focus:border-[#0071e3] focus:outline-none resize-none leading-relaxed"
          />

          <div className="pt-1 flex items-center justify-between text-[0.7rem] text-[#64748b]">
            <span>
              Regente: {currentClass.teacherFirstName || currentClass.teacherName}
            </span>
            <span>Sincronização automática</span>
          </div>
        </div>
      </section>
    </div>
  );
};
