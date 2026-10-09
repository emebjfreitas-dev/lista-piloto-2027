import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ClassGroup, UserRole } from '../types';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getClassAttendanceMetrics } from '../utils/attendanceRules';
import { triggerPushNotification } from '../services/pushNotificationService';

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

export const ResumoMensalScreen: React.FC<ResumoMensalScreenProps> = ({
  currentClass,
  allClasses,
  userRole = 'admin',
  initialTab = 'resumo_turma',
  onSelectClass,
  onSaveNotes,
  onOpenMonthlyLaunchForClass,
  onOpenReportPrint,
  onNavigateToSheet,
}) => {
  const [activeTab, setActiveTab] = useState<'resumo_turma' | 'metricas_uso'>(
    initialTab
  );
  const [currentMonthIndex, setCurrentMonthIndex] = useState(9); // Outubro (index 9)
  const [usageFilter, setUsageFilter] = useState<
    'all' | 'atualizado' | 'pendente' | 'manha' | 'tarde'
  >('all');
  const [usageSort, setUsageSort] = useState<
    'pendencias_primeiro' | 'mais_atualizadas' | 'turma_az'
  >('pendencias_primeiro');
  const [searchQuery, setSearchQuery] = useState('');

  const isPastMonth = currentMonthIndex < 9;
  const isLockedPastMonth = isPastMonth && userRole !== 'admin';
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  const classMetrics = getClassAttendanceMetrics(currentClass, OFFICIAL_OCTOBER_DAYS);

  const [absences, setAbsences] = useState(classMetrics.totalFaltasTurma);
  const [savedAbsences, setSavedAbsences] = useState(classMetrics.totalFaltasTurma);
  const [pedagogicalNotes, setPedagogicalNotes] = useState(currentClass.pedagogicalNotes);
  const [showSaveFeedback, setShowSaveFeedback] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('11h42');

  React.useEffect(() => {
    const m = getClassAttendanceMetrics(currentClass, OFFICIAL_OCTOBER_DAYS);
    setAbsences(m.totalFaltasTurma);
    setSavedAbsences(m.totalFaltasTurma);
    setPedagogicalNotes(currentClass.pedagogicalNotes || '');
  }, [currentClass.id, currentClass.pedagogicalNotes]);

  const TOTAL_POSSIBLE_ATTENDANCE =
    classMetrics.totalDiasMatriculadosTurma ||
    currentClass.totalStudents * currentClass.classesHeld ||
    640;
  const currentPresences = Math.max(0, TOTAL_POSSIBLE_ATTENDANCE - savedAbsences);
  const currentRate = Math.min(
    100,
    Math.max(0, Math.round((currentPresences / TOTAL_POSSIBLE_ATTENDANCE) * 100))
  );
  const diffFromSchoolGoal = currentRate - 85;

  const handlePrevMonth = () => {
    setCurrentMonthIndex((prev) => (prev > 0 ? prev - 1 : 11));
  };

  const handleNextMonth = () => {
    setCurrentMonthIndex((prev) => (prev < 11 ? prev + 1 : 0));
  };

  const handleRecalculate = () => {
    setSavedAbsences(absences);
    const nowTime = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setLastSavedTime(nowTime);
    setShowSaveFeedback(true);
    setTimeout(() => {
      setShowSaveFeedback(false);
    }, 2500);
  };

  // Cálculo de Métricas de Uso e Pendências de Lançamento por Turma para a Gestão do Coordenador
  const classUsageMetrics = useMemo<ClassUsageMetricItem[]>(() => {
    const expectedDaysTarget = 20;

    return allClasses.map((cls, index) => {
      const activeStudents = cls.students.filter((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
      });

      const activeStudentsCount = activeStudents.length || cls.totalStudents || 1;
      const metrics = getClassAttendanceMetrics(cls, OFFICIAL_OCTOBER_DAYS);

      // Verifica estudantes com lançamento conferido / atualizado no mês
      const studentsWithExplicitLaunch = activeStudents.filter(
        (s) =>
          (s.totalAbsencesMonth !== undefined && s.totalAbsencesMonth >= 0) &&
          (s.status === 'present' || s.status === 'absent' || s.status === 'late')
      ).length;

      // Estudantes com faltas críticas (>= 3) sem justificativa ou sem acompanhamento registrado
      const unverifiedHighAbsenceStudents = activeStudents.filter(
        (s) =>
          (s.totalAbsencesMonth || 0) >= 4 &&
          (s.justifiedAbsences || 0) === 0 &&
          !s.consecutiveAbsenceAlert?.active
      );

      // Alertas de busca ativa sem retorno da secretaria/família
      const alertsPendingFeedback = activeStudents.filter(
        (s) =>
          s.consecutiveAbsenceAlert?.active &&
          (s.consecutiveAbsenceAlert.selectedDates?.length || 0) > 0 &&
          !(s.consecutiveAbsenceAlert.familyFeedback || '').trim()
      );

      const classesHeld = cls.classesHeld || 20;
      const hasPedagogicalNotes = Boolean(
        cls.pedagogicalNotes && cls.pedagogicalNotes.trim().length >= 8
      );
      const hasTeacherAssigned = Boolean(
        cls.teacherName &&
          cls.teacherName.trim().length > 0 &&
          !cls.teacherName.toUpperCase().includes('DEFINIR')
      );

      const pendingReasons: string[] = [];

      if (unverifiedHighAbsenceStudents.length > 0) {
        pendingReasons.push(
          `${unverifiedHighAbsenceStudents.length} ${
            unverifiedHighAbsenceStudents.length === 1
              ? 'estudante com 4+ faltas sem justificativa/alerta'
              : 'estudantes com 4+ faltas sem justificativa/alerta'
          }`
        );
      }

      if (alertsPendingFeedback.length > 0) {
        pendingReasons.push(
          `${alertsPendingFeedback.length} ${
            alertsPendingFeedback.length === 1
              ? 'alerta de faltas seguidas aguardando retorno'
              : 'alertas de faltas seguidas aguardando retorno'
          }`
        );
      }

      if (!hasPedagogicalNotes) {
        pendingReasons.push('Observação pedagógica mensal ainda não preenchida');
      }

      if (classesHeld < expectedDaysTarget) {
        pendingReasons.push(
          `Dias letivos lançados (${classesHeld}/${expectedDaysTarget} dias)`
        );
      }

      if (!hasTeacherAssigned) {
        pendingReasons.push('Professor(a) regente PEB I não vinculado(a)');
      }

      const penalizedStudents = Math.min(
        activeStudentsCount,
        unverifiedHighAbsenceStudents.length + alertsPendingFeedback.length
      );
      const verifiedStudentsCount = Math.max(
        0,
        studentsWithExplicitLaunch - penalizedStudents
      );

      const baseCompletion = Math.round(
        (verifiedStudentsCount / Math.max(1, activeStudentsCount)) * 85 +
          (hasPedagogicalNotes ? 10 : 0) +
          (classesHeld >= expectedDaysTarget ? 5 : 2)
      );
      const completionRate = Math.min(100, Math.max(35, baseCompletion));

      let status: 'atualizado' | 'parcial' | 'pendente' = 'atualizado';
      if (
        unverifiedHighAbsenceStudents.length >= 2 ||
        completionRate < 82 ||
        !hasTeacherAssigned
      ) {
        status = 'pendente';
      } else if (pendingReasons.length > 0 || completionRate < 95) {
        status = 'parcial';
      }

      const consecutiveAlertsCount = activeStudents.filter(
        (s) =>
          s.consecutiveAbsenceAlert?.active &&
          (s.consecutiveAbsenceAlert.selectedDates?.length || 0) > 0
      ).length;

      const hoursMap = ['Hoje • 11h40', 'Hoje • 10h15', 'Hoje • 08h50', 'Ontem • 16h20'];
      const lastUpdateLabel =
        status === 'atualizado'
          ? hoursMap[index % 2]
          : status === 'parcial'
          ? hoursMap[2]
          : hoursMap[3];

      return {
        cls,
        activeStudentsCount,
        verifiedStudentsCount,
        completionRate,
        classesHeld,
        expectedDaysTarget,
        frequencyRate: Math.round(metrics.presenceRate),
        totalAbsencesMonth: metrics.totalFaltasTurma,
        consecutiveAlertsCount,
        pendingCount: pendingReasons.length,
        pendingReasons,
        status,
        lastUpdateLabel,
      };
    });
  }, [allClasses]);

  const usageSummaryKpis = useMemo(() => {
    const total = classUsageMetrics.length || 1;
    const upToDateCount = classUsageMetrics.filter(
      (m) => m.status === 'atualizado'
    ).length;
    const partialCount = classUsageMetrics.filter(
      (m) => m.status === 'parcial'
    ).length;
    const pendingCount = classUsageMetrics.filter(
      (m) => m.status === 'pendente'
    ).length;
    const avgCompletion = Math.round(
      classUsageMetrics.reduce((acc, m) => acc + m.completionRate, 0) / total
    );
    const totalPendingItems = classUsageMetrics.reduce(
      (acc, m) => acc + m.pendingCount,
      0
    );

    return {
      total: classUsageMetrics.length,
      upToDateCount,
      partialCount,
      pendingCount,
      avgCompletion,
      totalPendingItems,
    };
  }, [classUsageMetrics]);

  const filteredUsageMetrics = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = classUsageMetrics.filter((item) => {
      if (usageFilter === 'atualizado' && item.status !== 'atualizado') {
        return false;
      }
      if (usageFilter === 'pendente' && item.status === 'atualizado') {
        return false;
      }
      if (usageFilter === 'manha' && item.cls.shift !== 'Turno Manhã') {
        return false;
      }
      if (usageFilter === 'tarde' && item.cls.shift !== 'Turno Tarde') {
        return false;
      }
      if (!q) return true;
      return (
        item.cls.name.toLowerCase().includes(q) ||
        item.cls.grade.toLowerCase().includes(q) ||
        (item.cls.teacherName || '').toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (usageSort === 'pendencias_primeiro') {
        const rank = { pendente: 0, parcial: 1, atualizado: 2 };
        if (rank[a.status] !== rank[b.status]) {
          return rank[a.status] - rank[b.status];
        }
        return a.completionRate - b.completionRate;
      }
      if (usageSort === 'mais_atualizadas') {
        if (b.completionRate !== a.completionRate) {
          return b.completionRate - a.completionRate;
        }
        return a.pendingCount - b.pendingCount;
      }
      return a.cls.name.localeCompare(b.cls.name, 'pt-BR');
    });
  }, [classUsageMetrics, usageFilter, usageSort, searchQuery]);

  const chartData = useMemo(() => {
    return classUsageMetrics.map((item) => ({
      name: item.cls.name,
      taxa: item.completionRate,
      status: item.status,
      regente: item.cls.teacherName || 'Docente',
      pendencias: item.pendingCount,
    }));
  }, [classUsageMetrics]);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {/* Seletor de Abas Superior: Resumo da Turma vs. Métricas de Uso (Gestão Coordenador) */}
      <div className="card-welcoming bg-white p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">
              {activeTab === 'metricas_uso' ? 'monitoring' : 'calendar_month'}
            </span>
          </div>
          <div>
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#0066cc] block">
              Fechamento &amp; Coordenação Pedagógica • {months[currentMonthIndex]} 2027
            </span>
            <h1 className="text-[1.15rem] sm:text-[1.35rem] font-bold text-[#1d1d1f] leading-tight">
              {activeTab === 'metricas_uso'
                ? 'Métricas de Uso & Pendências de Lançamento'
                : `Resumo Mensal — Turma ${currentClass.name}`}
            </h1>
          </div>
        </div>

        <div className="ios-segmented self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveTab('resumo_turma')}
            className={`ios-segmented-item px-4 py-2 text-[0.8rem] flex items-center gap-1.5 ${
              activeTab === 'resumo_turma' ? 'ios-segmented-item-active' : ''
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">pie_chart</span>
            <span>Resumo da Turma</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('metricas_uso')}
            className={`ios-segmented-item px-4 py-2 text-[0.8rem] flex items-center gap-1.5 ${
              activeTab === 'metricas_uso' ? 'ios-segmented-item-active' : ''
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">fact_check</span>
            <span>Métricas de Uso (Coordenador)</span>
            {usageSummaryKpis.pendingCount + usageSummaryKpis.partialCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[0.66rem] font-extrabold ${
                  activeTab === 'metricas_uso'
                    ? 'bg-[#ff9500] text-white'
                    : 'bg-[#ff3b30]/15 text-[#ff3b30]'
                }`}
              >
                {usageSummaryKpis.pendingCount + usageSummaryKpis.partialCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ABA 2: MÉTRICAS DE USO & PENDÊNCIAS DE LANÇAMENTO (GESTÃO COORDENADOR) */}
      {/* ===================================================================== */}
      {activeTab === 'metricas_uso' ? (
        <div className="space-y-4 animate-gentle-fade">
          {/* Painel de KPIs do Coordenador */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card-welcoming bg-white p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#6e6e73]">
                  Taxa Geral de Atualização
                </span>
                <span className="w-8 h-8 rounded-xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[19px]">speed</span>
                </span>
              </div>
              <div className="mt-2">
                <span className="text-[2rem] font-extrabold text-[#1d1d1f] tabular-nums leading-none">
                  {usageSummaryKpis.avgCompletion}%
                </span>
                <p className="text-[0.76rem] text-[#6e6e73] mt-1 font-medium">
                  Média de preenchimento entre {usageSummaryKpis.total} turmas
                </p>
              </div>
            </div>

            <div
              onClick={() =>
                setUsageFilter(usageFilter === 'atualizado' ? 'all' : 'atualizado')
              }
              className="card-welcoming bg-white p-4 sm:p-5 flex flex-col justify-between cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#1d8338]">
                  Lançamento em Dia
                </span>
                <span className="w-8 h-8 rounded-xl bg-[#28cd41]/15 text-[#1d8338] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[19px]">
                    check_circle
                  </span>
                </span>
              </div>
              <div className="mt-2">
                <span className="text-[2rem] font-extrabold text-[#1d8338] tabular-nums leading-none">
                  {usageSummaryKpis.upToDateCount}
                </span>
                <p className="text-[0.76rem] text-[#6e6e73] mt-1 font-medium">
                  Turmas 100% atualizadas sem pendências
                </p>
              </div>
            </div>

            <div
              onClick={() =>
                setUsageFilter(usageFilter === 'pendente' ? 'all' : 'pendente')
              }
              className="card-welcoming bg-white p-4 sm:p-5 flex flex-col justify-between cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#ff9500]">
                  Em Andamento / Parcial
                </span>
                <span className="w-8 h-8 rounded-xl bg-[#ff9500]/15 text-[#ff9500] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[19px]">
                    pending_actions
                  </span>
                </span>
              </div>
              <div className="mt-2">
                <span className="text-[2rem] font-extrabold text-[#ff9500] tabular-nums leading-none">
                  {usageSummaryKpis.partialCount}
                </span>
                <p className="text-[0.76rem] text-[#6e6e73] mt-1 font-medium">
                  Lançamento ativo com ajustes menores
                </p>
              </div>
            </div>

            <div
              onClick={() =>
                setUsageFilter(usageFilter === 'pendente' ? 'all' : 'pendente')
              }
              className="card-welcoming bg-white p-4 sm:p-5 flex flex-col justify-between cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#ff3b30]">
                  Turmas com Pendências
                </span>
                <span className="w-8 h-8 rounded-xl bg-[#ff3b30]/15 text-[#ff3b30] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[19px]">
                    warning
                  </span>
                </span>
              </div>
              <div className="mt-2">
                <span className="text-[2rem] font-extrabold text-[#ff3b30] tabular-nums leading-none">
                  {usageSummaryKpis.pendingCount}
                </span>
                <p className="text-[0.76rem] text-[#6e6e73] mt-1 font-medium">
                  {usageSummaryKpis.totalPendingItems} itens pendentes para coordenação
                </p>
              </div>
            </div>
          </section>

          {/* Gráfico Visual Comparativo de Atualização de Presença entre as Turmas */}
          <section className="card-welcoming bg-white p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-[1.05rem] sm:text-[1.15rem] font-bold text-[#1d1d1f]">
                  Panorama Visual de Atualização por Turma ({months[currentMonthIndex]})
                </h2>
                <p className="text-[0.8rem] text-[#6e6e73]">
                  Comparativo do índice de atualização do lançamento de presença e registros pedagógicos de cada turma
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[0.73rem] font-semibold">
                <span className="inline-flex items-center gap-1.5 text-[#1d8338]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#28cd41]" />
                  Em Dia (95%+)
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#ff9500]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff9500]" />
                  Parcial (82%–94%)
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#ff3b30]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff3b30]" />
                  Com Pendência (&lt;82%)
                </span>
              </div>
            </div>

            <div className="w-full h-[210px] sm:h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fontWeight: 700, fill: '#1d1d1f' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#86868b' }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[#1d1d1f] text-white px-3.5 py-2.5 rounded-2xl shadow-lg text-[0.76rem] space-y-0.5">
                          <p className="font-bold">
                            Turma {d.name} • {d.taxa}% atualizado
                          </p>
                          <p className="text-white/80">Regente: {d.regente}</p>
                          <p className="text-white/80">
                            {d.pendencias === 0
                              ? 'Sem pendências de lançamento'
                              : `${d.pendencias} pendência(s) identificada(s)`}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="taxa" radius={[8, 8, 4, 4]} maxBarSize={34}>
                    {chartData.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={
                          entry.status === 'atualizado'
                            ? '#28cd41'
                            : entry.status === 'parcial'
                            ? '#ff9500'
                            : '#ff3b30'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Barra de Filtros e Ordenação para o Coordenador */}
          <section className="card-welcoming bg-white p-4 sm:p-5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Filtros Rápidos */}
              <div className="ios-segmented">
                <button
                  type="button"
                  onClick={() => setUsageFilter('all')}
                  className={`ios-segmented-item px-3 py-1.5 text-[0.76rem] ${
                    usageFilter === 'all' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Todas ({usageSummaryKpis.total})
                </button>
                <button
                  type="button"
                  onClick={() => setUsageFilter('pendente')}
                  className={`ios-segmented-item px-3 py-1.5 text-[0.76rem] ${
                    usageFilter === 'pendente' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Com Pendências (
                  {usageSummaryKpis.pendingCount + usageSummaryKpis.partialCount})
                </button>
                <button
                  type="button"
                  onClick={() => setUsageFilter('atualizado')}
                  className={`ios-segmented-item px-3 py-1.5 text-[0.76rem] ${
                    usageFilter === 'atualizado' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Mais Atualizadas ({usageSummaryKpis.upToDateCount})
                </button>
                <button
                  type="button"
                  onClick={() => setUsageFilter('manha')}
                  className={`ios-segmented-item px-3 py-1.5 text-[0.76rem] ${
                    usageFilter === 'manha' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Manhã
                </button>
                <button
                  type="button"
                  onClick={() => setUsageFilter('tarde')}
                  className={`ios-segmented-item px-3 py-1.5 text-[0.76rem] ${
                    usageFilter === 'tarde' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  Tarde
                </button>
              </div>

              {/* Ordenação e Busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={usageSort}
                  onChange={(e) =>
                    setUsageSort(
                      e.target.value as
                        | 'pendencias_primeiro'
                        | 'mais_atualizadas'
                        | 'turma_az'
                    )
                  }
                  className="min-h-[38px] px-3.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[0.78rem] font-semibold cursor-pointer focus:outline-none"
                >
                  <option value="pendencias_primeiro">
                    Ordenar: Pendências Primeiro
                  </option>
                  <option value="mais_atualizadas">
                    Ordenar: Mais Atualizadas Primeiro
                  </option>
                  <option value="turma_az">Ordenar: Turma (G4 ao 5º Ano)</option>
                </select>

                <div className="relative min-w-[220px]">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar turma ou docente..."
                    className="w-full min-h-[38px] pl-9 pr-7 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[0.8rem] focus:bg-white focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        cancel
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Lista Detalhada de Turmas: Status de Lançamento e Pendências */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredUsageMetrics.map((item) => {
              const isUpToDate = item.status === 'atualizado';
              const isPartial = item.status === 'parcial';

              return (
                <div
                  key={item.cls.id}
                  className="card-welcoming bg-white p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Topo do Card da Turma */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#1d1d1f] text-white text-[0.74rem] font-extrabold">
                            Turma {item.cls.name}
                          </span>
                          <span className="text-[0.75rem] font-semibold text-[#6e6e73]">
                            {item.cls.grade} • {item.cls.shift.replace('Turno ', '')}
                          </span>
                        </div>
                        <p className="text-[0.84rem] font-bold text-[#1d1d1f] mt-1.5">
                          {item.cls.pronoun || 'PROFESSORA'}{' '}
                          {item.cls.teacherName || 'Docente Regente'}
                        </p>
                        <p className="text-[0.72rem] text-[#86868b]">
                          Última sincronização: {item.lastUpdateLabel}
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[0.72rem] font-bold shrink-0 ${
                          isUpToDate
                            ? 'bg-[#28cd41]/15 text-[#1d8338]'
                            : isPartial
                            ? 'bg-[#ff9500]/15 text-[#b25000]'
                            : 'bg-[#ff3b30]/15 text-[#ff3b30]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {isUpToDate
                            ? 'verified'
                            : isPartial
                            ? 'schedule'
                            : 'error'}
                        </span>
                        <span>
                          {isUpToDate
                            ? 'Atualizado'
                            : isPartial
                            ? 'Parcial'
                            : 'Com Pendência'}
                        </span>
                      </span>
                    </div>

                    {/* Barra de Progresso do Lançamento de Presença */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[0.76rem]">
                        <span className="font-semibold text-[#6e6e73]">
                          Cobertura de Lançamento ({item.verifiedStudentsCount}/
                          {item.activeStudentsCount} estudantes conferidos)
                        </span>
                        <span className="font-extrabold text-[#1d1d1f] tabular-nums">
                          {item.completionRate}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[#f5f5f7] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isUpToDate
                              ? 'bg-[#28cd41]'
                              : isPartial
                              ? 'bg-[#ff9500]'
                              : 'bg-[#ff3b30]'
                          }`}
                          style={{ width: `${item.completionRate}%` }}
                        />
                      </div>
                    </div>

                    {/* Mini Indicadores da Turma */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2.5 rounded-2xl bg-[#f5f5f7]">
                        <span className="text-[0.64rem] font-bold uppercase text-[#6e6e73] block">
                          Frequência
                        </span>
                        <span className="text-[0.95rem] font-extrabold text-[#1d1d1f] tabular-nums">
                          {item.frequencyRate}%
                        </span>
                      </div>
                      <div className="p-2.5 rounded-2xl bg-[#f5f5f7]">
                        <span className="text-[0.64rem] font-bold uppercase text-[#6e6e73] block">
                          Aulas Dadas
                        </span>
                        <span className="text-[0.95rem] font-extrabold text-[#1d1d1f] tabular-nums">
                          {item.classesHeld}/{item.expectedDaysTarget}d
                        </span>
                      </div>
                      <div className="p-2.5 rounded-2xl bg-[#f5f5f7]">
                        <span className="text-[0.64rem] font-bold uppercase text-[#6e6e73] block">
                          Busca Ativa
                        </span>
                        <span
                          className={`text-[0.95rem] font-extrabold tabular-nums ${
                            item.consecutiveAlertsCount > 0
                              ? 'text-[#ff3b30]'
                              : 'text-[#1d1d1f]'
                          }`}
                        >
                          {item.consecutiveAlertsCount} alerta(s)
                        </span>
                      </div>
                    </div>

                    {/* Lista de Pendências ou Selo de Conformidade */}
                    {item.pendingReasons.length > 0 ? (
                      <div className="p-3 rounded-2xl bg-[#fff9f9] space-y-1.5">
                        <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#ff3b30] block">
                          Pendências Identificadas ({item.pendingReasons.length}):
                        </span>
                        <ul className="space-y-1">
                          {item.pendingReasons.map((reason, rIdx) => (
                            <li
                              key={rIdx}
                              className="text-[0.76rem] font-medium text-[#1d1d1f] flex items-start gap-1.5"
                            >
                              <span className="material-symbols-outlined text-[15px] text-[#ff3b30] shrink-0 mt-0.5">
                                arrow_right
                              </span>
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-[#28cd41]/10 flex items-center gap-2 text-[#1d8338] text-[0.78rem] font-semibold">
                        <span className="material-symbols-outlined text-[18px]">
                          task_alt
                        </span>
                        <span>
                          Chamada mensal, aulas dadas e observações 100% em dia.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ações Rápidas para o Coordenador */}
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectClass(item.cls);
                        setActiveTab('resumo_turma');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-[0.78rem] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px]">
                        visibility
                      </span>
                      <span>Ver Resumo</span>
                    </button>

                    {onOpenMonthlyLaunchForClass && userRole !== 'peb2' && (
                      <button
                        type="button"
                        onClick={() => onOpenMonthlyLaunchForClass(item.cls)}
                        className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[0.78rem] flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          edit_calendar
                        </span>
                        <span>Abrir Lançamento</span>
                      </button>
                    )}

                    {userRole === 'admin' && item.pendingReasons.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerPushNotification(
                            {
                              title: `Prazo de Frequência • Turma ${item.cls.name}`,
                              body: `${item.cls.teacherName || 'Docente'}: há ${item.pendingReasons.length} pendência(s) no fechamento mensal (${item.pendingReasons[0]}).`,
                              category: 'prazo',
                              targetClassId: item.cls.id,
                              targetScreen: 'frequencia_mensal',
                              authorName: 'Coordenação Pedagógica',
                            },
                            { saveToFeed: true, showBanner: true }
                          );
                        }}
                        title="Disparar lembrete Push (Service Worker) para o(a) professor(a) desta turma"
                        className="min-h-[40px] px-3 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-semibold text-[0.76rem] flex items-center justify-center gap-1 cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          notifications_active
                        </span>
                        <span>Push</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ===================================================================== */
        /* ABA 1: RESUMO MENSAL DA TURMA SELECIONADA                             */
        /* ===================================================================== */
        <div className="space-y-4 animate-gentle-fade">
          {/* Month & Class Navigator */}
          <div className="card-welcoming bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={handlePrevMonth}
                aria-label="Mês anterior"
                className="min-h-[44px] min-w-[44px] rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[24px]">
                  chevron_left
                </span>
              </button>

              <div className="text-center flex-1 min-w-0">
                <span className="inline-flex items-center justify-center gap-1.5 text-[1.15rem] sm:text-[1.35rem] font-bold text-[#1d1d1f]">
                  <span className="material-symbols-outlined text-[20px] text-[#0071e3]">
                    calendar_today
                  </span>
                  {months[currentMonthIndex]} de 2027
                </span>
                <div className="mt-1">
                  <select
                    value={currentClass.id}
                    onChange={(e) => {
                      const target = allClasses.find((c) => c.id === e.target.value);
                      if (target) onSelectClass(target);
                    }}
                    className="px-3 py-1 bg-[#f5f5f7] text-[#1d1d1f] text-[0.8rem] sm:text-[0.85rem] font-semibold rounded-full cursor-pointer max-w-[260px] sm:max-w-sm truncate"
                  >
                    <optgroup label="☀️ Turno Manhã (G4, G5, 1º ao 5º)">
                      {allClasses
                        .filter((c) => c.shift === 'Turno Manhã')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            Turma {c.name} — {c.grade} ({c.totalStudents} estudantes)
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="⛅ Turno Tarde (G4, G5, 1º ao 5º)">
                      {allClasses
                        .filter((c) => c.shift === 'Turno Tarde')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            Turma {c.name} — {c.grade} ({c.totalStudents} estudantes)
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <button
                onClick={handleNextMonth}
                aria-label="Próximo mês"
                className="min-h-[44px] min-w-[44px] rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[24px]">
                  chevron_right
                </span>
              </button>
            </div>
          </div>

          {/* Big Frequency Rate Card */}
          <div className="card-welcoming bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[0.95rem] font-bold text-[#6e6e73] block">
                  Taxa de Frequência Geral (Mensal)
                </span>
                <div className="flex items-baseline gap-2.5 mt-1">
                  <span className="text-[2.5rem] font-extrabold text-[#1d1d1f] leading-none tabular-nums">
                    {currentRate}%
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[0.825rem] font-bold ${
                      currentRate >= 85
                        ? 'bg-[#28cd41]/15 text-[#1d8338]'
                        : 'bg-[#ff3b30]/15 text-[#ff3b30]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {currentRate >= 85 ? 'verified' : 'warning'}
                    </span>
                    {currentRate >= 90
                      ? 'Excelente índice'
                      : currentRate >= 85
                      ? 'Dentro da meta'
                      : 'Abaixo da meta'}
                  </span>
                </div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3]">
                <span className="material-symbols-outlined text-[32px]">
                  pie_chart
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="w-full bg-[#f5f5f7] h-4 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-[#0071e3] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${currentRate}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-2.5 text-[0.875rem] font-semibold text-[#6e6e73]">
                <span>Meta da Escola: 85%</span>
                <span
                  className={
                    diffFromSchoolGoal >= 0
                      ? 'text-[#1d8338] font-bold'
                      : 'text-[#ff3b30] font-bold'
                  }
                >
                  {diffFromSchoolGoal >= 0
                    ? `+${diffFromSchoolGoal}% acima da meta`
                    : `${diffFromSchoolGoal}% abaixo da meta`}
                </span>
              </div>
            </div>
          </div>

          {/* 3 Metric Tiles Row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="card-welcoming bg-white p-3.5 flex flex-col justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#ff3b30]/15 text-[#ff3b30] flex items-center justify-center mb-1">
                <span className="material-symbols-outlined text-[20px]">
                  person_off
                </span>
              </div>
              <div>
                <span className="text-[0.825rem] font-bold text-[#6e6e73] block leading-tight">
                  Total Faltas
                </span>
                <span className="text-[1.5rem] text-[#ff3b30] font-extrabold block mt-0.5 tabular-nums">
                  {savedAbsences}
                </span>
              </div>
            </div>

            <div className="card-welcoming bg-white p-3.5 flex flex-col justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#28cd41]/15 text-[#1d8338] flex items-center justify-center mb-1">
                <span className="material-symbols-outlined text-[20px]">
                  how_to_reg
                </span>
              </div>
              <div>
                <span className="text-[0.825rem] font-bold text-[#6e6e73] block leading-tight">
                  Presenças
                </span>
                <span className="text-[1.5rem] text-[#1d1d1f] font-extrabold block mt-0.5 tabular-nums">
                  {currentPresences}
                </span>
              </div>
            </div>

            <div className="card-welcoming bg-white p-3.5 flex flex-col justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center mb-1">
                <span className="material-symbols-outlined text-[20px]">school</span>
              </div>
              <div>
                <span className="text-[0.825rem] font-bold text-[#6e6e73] block leading-tight">
                  Aulas Dadas
                </span>
                <span className="text-[1.5rem] text-[#1d1d1f] font-extrabold block mt-0.5 tabular-nums">
                  {currentClass.classesHeld}
                </span>
              </div>
            </div>
          </div>

          {/* Desempenho por Semana (Presença) */}
          <div className="card-welcoming bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[24px] text-[#0071e3]">
                bar_chart
              </span>
              <h3 className="text-[1.125rem] font-bold text-[#1d1d1f]">
                Desempenho por Semana (Presença)
              </h3>
            </div>

            <div className="space-y-3.5 mt-2">
              {currentClass.weeklyPerformance.map((weekData, idx) => (
                <div key={idx}>
                  <div className="flex justify-between items-center mb-1.5 text-[0.875rem]">
                    <span className="text-[#1d1d1f] font-semibold">
                      {weekData.week}
                    </span>
                    <span className="font-extrabold text-[#1d1d1f] tabular-nums">
                      {weekData.rate}%
                    </span>
                  </div>
                  <div className="w-full bg-[#f5f5f7] h-3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1d1d1f] rounded-full transition-all duration-300"
                      style={{ width: `${weekData.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ajuste ou Inserção Manual de Faltas */}
          <div className="card-welcoming bg-white p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[24px]">
                  edit_note
                </span>
              </div>
              <div>
                <h3 className="text-[1.125rem] font-bold text-[#1d1d1f] leading-tight">
                  Ajuste ou Inserção Manual de Faltas
                </h3>
                <p className="text-[0.875rem] text-[#6e6e73] mt-1 font-medium leading-snug">
                  Se preferir digitar diretamente o total de faltas do mês somadas do caderno físico:
                </p>
              </div>
            </div>

            <div className="mt-4 bg-[#f5f5f7] rounded-2xl p-5">
              {isLockedPastMonth && (
                <div className="mb-3 p-3 rounded-xl bg-[#fff4e5] text-[#7a4100] text-[0.82rem] font-extrabold text-center">
                  Mês passado ({months[currentMonthIndex]}) encerrado — somente perfil ADMIN pode alterar meses passados.
                </div>
              )}
              <label className="text-[1rem] font-bold text-[#1d1d1f] block text-center mb-3">
                Quantas faltas foram registradas neste mês?
              </label>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() =>
                    !isLockedPastMonth && setAbsences((prev) => Math.max(0, prev - 1))
                  }
                  disabled={isLockedPastMonth}
                  aria-label="Diminuir faltas"
                  className="min-h-[54px] min-w-[54px] rounded-xl bg-white hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center font-bold text-2xl active:scale-95 transition-transform cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[32px]">
                    remove
                  </span>
                </button>

                <div className="relative flex-1 max-w-[140px]">
                  <input
                    type="number"
                    min="0"
                    disabled={isLockedPastMonth}
                    max={TOTAL_POSSIBLE_ATTENDANCE}
                    value={absences}
                    onChange={(e) =>
                      !isLockedPastMonth &&
                      setAbsences(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full h-[54px] text-center text-[2rem] font-extrabold text-[#1d1d1f] bg-white rounded-xl focus:outline-none px-2 disabled:opacity-50 tabular-nums"
                  />
                </div>

                <button
                  onClick={() =>
                    !isLockedPastMonth && setAbsences((prev) => prev + 1)
                  }
                  disabled={isLockedPastMonth}
                  aria-label="Aumentar faltas"
                  className="min-h-[54px] min-w-[54px] rounded-xl bg-white hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center font-bold text-2xl active:scale-95 transition-transform cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[32px]">add</span>
                </button>
              </div>

              <button
                onClick={handleRecalculate}
                disabled={isLockedPastMonth}
                type="button"
                className="mt-4 w-full min-h-[50px] px-6 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold text-[0.95rem] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined text-[22px]">
                  calculate
                </span>
                <span>Recalcular e Atualizar Indicadores</span>
              </button>
            </div>
          </div>

          {/* Comentários pedagógicos do mês */}
          <div className="card-welcoming bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[24px] text-[#0071e3]">
                history_edu
              </span>
              <label
                className="text-[1.05rem] font-bold text-[#1d1d1f]"
                htmlFor="monthly-notes"
              >
                Comentários pedagógicos de {months[currentMonthIndex]}:
              </label>
            </div>
            <textarea
              id="monthly-notes"
              rows={3}
              value={pedagogicalNotes}
              onChange={(e) => {
                setPedagogicalNotes(e.target.value);
                onSaveNotes?.(e.target.value);
              }}
              placeholder="Escreva anotações importantes sobre o acompanhamento da turma..."
              className="w-full p-3.5 rounded-2xl bg-[#f5f5f7] text-[#1d1d1f] text-[0.92rem] focus:bg-white focus:outline-none resize-none leading-relaxed"
            />
            <div className="flex justify-end mt-2">
              <span className="text-[0.78rem] font-semibold text-[#86868b]">
                Sincronizado instantaneamente na Planilha
              </span>
            </div>
          </div>

          {/* Confirmation & Status Banner */}
          <div
            className={`bg-[#28cd41]/12 rounded-2xl p-4 flex items-center gap-3 transition-all duration-300 ${
              showSaveFeedback ? 'ring-2 ring-[#28cd41]' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#1d8338] text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">check</span>
            </div>
            <div className="flex-1">
              <span className="text-[0.92rem] font-bold text-[#1d8338] block leading-snug">
                Dados de {months[currentMonthIndex]} sincronizados em tempo real na Planilha Google
              </span>
              <span className="text-[0.78rem] text-[#6e6e73] block">
                Turma {currentClass.name} ({currentClass.room}) • Regente:{' '}
                {currentClass.pronoun || 'PROFESSORA'}{' '}
                {currentClass.teacherName || 'Docente Regente'} ({lastSavedTime})
              </span>
            </div>
          </div>

          {/* Action Buttons: Relatório Bolsa Família & Planilha Google (Exclusivo Admin) */}
          {userRole === 'admin' && (
            <div className="space-y-2.5 pt-1">
              <button
                onClick={onOpenReportPrint}
                type="button"
                className="w-full min-h-[54px] px-6 rounded-2xl bg-[#1d1d1f] hover:bg-black text-white font-bold text-[0.92rem] flex items-center justify-center gap-2.5 transition-transform active:scale-[0.99] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[22px]">
                  assessment
                </span>
                <span>
                  Abrir Relatório Oficial do Bolsa Família / Fechamento (Exclusivo Admin)
                </span>
              </button>

              <button
                onClick={onNavigateToSheet}
                type="button"
                className="w-full min-h-[50px] px-6 rounded-2xl bg-white hover:bg-[#f5f5f7] text-[#0071e3] font-bold text-[0.9rem] flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[22px]">
                  table_chart
                </span>
                <span>Conferir Dados no Banco da Planilha Google</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
