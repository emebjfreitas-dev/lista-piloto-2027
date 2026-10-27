import React, { useMemo, useState, useEffect } from 'react';
import {
  ClassGroup,
  Student,
  UserRole,
  SchoolNotice,
  AttendanceWindowConfig,
  ScreenType,
} from '../types';
import { evaluateAttendanceLaunchWindow } from '../services/db';
import { getDefaultReferencePeriod } from '../utils/attendanceRules';
import { QuadroAvisosCard } from './QuadroAvisosCard';
import { LembretePrazoFrequenciaCard } from './LembretePrazoFrequenciaCard';
import { ResumoFaltasCriticasCard } from './ResumoFaltasCriticasCard';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  School,
  Users,
  CalendarCheck,
  MapPin,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Clock,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  Clock3,
  UserCheck,
  UserX,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';

interface HomeScreenProps {
  userRole: UserRole;
  userName?: string;
  userEmail?: string;
  classes: ClassGroup[];
  assignedClassId: string;
  assignedClassIds?: string[];
  schoolNotices?: SchoolNotice[];
  attendanceWindowConfig: AttendanceWindowConfig;
  onNavigateToScreen: (screen: ScreenType) => void;
  onSelectClassForMonthlyAttendance: (cls: ClassGroup) => void;
  onSelectStudentForConsecutiveScreen?: (classId: string, studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student, className: string) => void;
  onSaveSchoolNotices?: (updatedNotices: SchoolNotice[]) => void;
  onNavigateToAcessos?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userRole,
  userName = 'Educador(a)',
  userEmail,
  classes = [],
  assignedClassId,
  assignedClassIds = [],
  schoolNotices = [],
  attendanceWindowConfig,
  onNavigateToScreen,
  onSelectClassForMonthlyAttendance,
  onSelectStudentForConsecutiveScreen,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onSaveSchoolNotices,
  onNavigateToAcessos,
}) => {
  const [chartFilterShift, setChartFilterShift] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');
  const [activeHubTab, setActiveHubTab] = useState<'avisos' | 'prazos' | 'busca_ativa'>('avisos');
  const [currentClock, setCurrentClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Regra Oficial do Sistema: A chamada informa os registros mensais referentes ao mês anterior ao mês vigente
  const referencePeriod = useMemo(
    () => getDefaultReferencePeriod(currentClock),
    [currentClock]
  );

  const schoolStats = useMemo(() => {
    let totalStudents = 0;
    let sumPresence = 0;
    let countedClasses = 0;
    let criticalConsecutiveCount = 0;
    let morningCount = 0;
    let afternoonCount = 0;
    let vacantCount = 0;
    let pendingCount = 0;
    let completedCount = 0;

    classes.forEach((cls) => {
      totalStudents += cls.students.length;
      if (typeof cls.presenceRate === 'number' && cls.presenceRate > 0) {
        sumPresence += cls.presenceRate;
        countedClasses++;
      }
      cls.students.forEach((s) => {
        if (s.consecutiveAbsenceAlert?.active) {
          criticalConsecutiveCount++;
        }
      });

      const isMorning =
        (cls.shift || '').toUpperCase().includes('MANHÃ') || cls.periodo === 'MANHÃ';
      if (isMorning) morningCount++;
      else afternoonCount++;

      if (cls.isVaga || (cls.teacherName || '').toUpperCase().includes('VAGA')) {
        vacantCount++;
      }

      if (cls.isPending) {
        pendingCount++;
      } else {
        completedCount++;
      }
    });

    const avgPresence = countedClasses > 0 ? Math.round(sumPresence / countedClasses) : 95;
    const assignedTeachers = Math.max(0, classes.length - vacantCount);

    return {
      totalClasses: classes.length,
      morningCount,
      afternoonCount,
      totalStudents,
      avgPresence,
      criticalConsecutiveCount,
      vacantCount,
      assignedTeachers,
      pendingCount,
      completedCount,
    };
  }, [classes]);

  const chartData = useMemo(() => {
    const filtered = classes.filter((c) => {
      if (chartFilterShift === 'all') return true;
      return (c.shift || '').toUpperCase().includes(chartFilterShift);
    });

    return filtered.map((c) => {
      const rate = typeof c.presenceRate === 'number' && c.presenceRate > 0 ? c.presenceRate : 92;
      return {
        id: c.id,
        name: c.name,
        presence: rate,
        studentsCount: c.students.length,
        shift: c.shift || 'Integral',
      };
    });
  }, [classes, chartFilterShift]);

  const userRoleLabel =
    userRole === 'admin'
      ? 'Gestão Escolar / Direção'
      : userRole === 'peb2'
      ? 'Educador(a) Especialista PEB II'
      : 'Professora Regente PEB I';

  const clockHours = currentClock.getHours();
  const shiftInfo = useMemo(() => {
    if (clockHours >= 7 && clockHours < 12) {
      return {
        label: 'Turno Manhã em Andamento',
        desc: '07h00 às 12h00 · Período Letivo Matutino',
        badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        dotColor: 'bg-emerald-600',
      };
    }
    if (clockHours >= 12 && clockHours < 18) {
      return {
        label: 'Turno Tarde em Andamento',
        desc: '12h30 às 17h30 · Período Letivo Vespertino',
        badgeColor: 'bg-sky-50 text-sky-800 border-sky-300',
        dotColor: 'bg-sky-600',
      };
    }
    return {
      label: 'Horário Administrativo / Plantão',
      desc: 'Fora do horário regular de aulas',
      badgeColor: 'bg-slate-50 text-slate-700 border-slate-300',
      dotColor: 'bg-slate-400',
    };
  }, [clockHours]);

  const windowEval = useMemo(
    () => evaluateAttendanceLaunchWindow(attendanceWindowConfig),
    [attendanceWindowConfig]
  );

  const todayFormatted = useMemo(() => {
    try {
      const str = format(currentClock, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return 'Data Atual';
    }
  }, [currentClock]);

  const timeFormatted = useMemo(() => {
    try {
      return format(currentClock, 'HH:mm:ss');
    } catch {
      return '--:--:--';
    }
  }, [currentClock]);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-14 text-slate-900">
      {/* 1. Header Horizontal de Gestão Escolar */}
      <section className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Painel de Gestão Escolar
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">EMEB Prof. Joaquim Candelário de Freitas</span>
              <span aria-hidden="true">·</span>
              <span>Ano Letivo 2027</span>
              <span aria-hidden="true">·</span>
              <span>{userName}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-600 font-medium">{userRoleLabel}</span>
            </div>
          </div>

          {/* Marcadores de Data, Hora e CTA Rápido */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center gap-2 text-xs text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-medium">{todayFormatted}</span>
            </div>

            <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center gap-2 text-xs text-slate-600">
              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-mono tabular-nums font-medium">{timeFormatted}</span>
            </div>

            <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center gap-2 text-xs text-slate-600">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="font-medium">{shiftInfo.label}</span>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToScreen('turmas')}
              className="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-white" />
              <span>Ver Turmas</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Faixa Horizontal de Indicadores Estratégicos (Zero Cards-Within-Cards) */}
      <section className="bg-white rounded-xl border border-slate-200/90 shadow-none py-4 px-4 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 gap-y-3 sm:gap-y-0">
          {/* Indicador 1: Mês de Referência */}
          <div className="px-2 sm:px-4 flex flex-col justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Referência
            </span>
            <div className="mt-1.5">
              <span className="text-base sm:text-lg font-semibold text-slate-900 block truncate">
                {referencePeriod.monthName} / {referencePeriod.year}
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                Mês anterior ao vigente
              </span>
            </div>
          </div>

          {/* Indicador 2: Total de Turmas */}
          <div className="px-2 sm:px-4 pt-2 sm:pt-0 flex flex-col justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Turmas 2027
            </span>
            <div className="mt-1.5">
              <span className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-900 block">
                {schoolStats.totalClasses}
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                20 Manhã · 20 Tarde
              </span>
            </div>
          </div>

          {/* Indicador 3: Docência & Vagas */}
          <div className="px-2 sm:px-4 pt-2 sm:pt-0 flex flex-col justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Docência
            </span>
            <div className="mt-1.5">
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-900">
                  {schoolStats.assignedTeachers}
                </span>
                <span className="text-xs text-slate-400">atribuídos</span>
              </div>
              <span className="text-[11px] text-amber-700 block truncate font-medium">
                {schoolStats.vacantCount} vagas de regência
              </span>
            </div>
          </div>

          {/* Indicador 4: Faltas do Mês */}
          <div className="px-2 sm:px-4 pt-2 sm:pt-0 flex flex-col justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Faltas do Mês
            </span>
            <div className="mt-1.5">
              <div className="flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {schoolStats.completedCount}
                </span>
                <span className="text-xs text-slate-400">ok /</span>
                <span className="text-xs font-mono tabular-nums font-medium text-amber-700">
                  {schoolStats.pendingCount} pend.
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block truncate">
                {windowEval.isAllowedToLaunch ? 'Janela Aberta' : 'Aguardando Prazo'}
              </span>
            </div>
          </div>

          {/* Indicador 5: Busca Ativa */}
          <div
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="px-2 sm:px-4 pt-2 sm:pt-0 flex flex-col justify-between cursor-pointer group"
            title="Ver estudantes em alerta de Busca Ativa"
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 group-hover:text-rose-700 transition-colors">
              Busca Ativa (ECA)
            </span>
            <div className="mt-1.5">
              <span className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-rose-700 block">
                {schoolStats.criticalConsecutiveCount}
              </span>
              <span className="text-[11px] text-slate-400 group-hover:text-rose-700 transition-colors block truncate">
                Casos em acompanhamento →
              </span>
            </div>
          </div>

          {/* Indicador 6: Frequência Geral */}
          <div className="px-2 sm:px-4 pt-2 sm:pt-0 flex flex-col justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Frequência Geral
            </span>
            <div className="mt-1.5">
              <span className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-900 block">
                {schoolStats.avgPresence}%
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                {schoolStats.totalStudents} estudantes
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Módulos de Acesso aos Fluxos Principais */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Módulos de Trabalho
          </h2>
          <span className="text-xs text-slate-400">Selecione para navegar diretamente</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Minhas Turmas */}
          <div
            onClick={() => onNavigateToScreen('turmas')}
            className="bg-white rounded-xl p-5 border border-slate-200/90 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between group shadow-none"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-400 group-hover:text-slate-900 transition-colors inline-flex items-center gap-1 font-medium">
                Acessar →
              </span>
            </div>
            <div className="mt-4 space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">
                Minhas Turmas
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Relação das 40 turmas da unidade (20 Manhã / 20 Tarde), salas, professores e estudantes.
              </p>
            </div>
          </div>

          {/* Card 2: Informar Faltas do Mês */}
          {userRole !== 'peb2' && (
            <div
              onClick={() => onNavigateToScreen('frequencia_mensal')}
              className="bg-white rounded-xl p-5 border border-slate-200/90 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between group shadow-none"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-900 transition-colors inline-flex items-center gap-1 font-medium">
                  Informar →
                </span>
              </div>
              <div className="mt-4 space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">
                  Informar Faltas do Mês
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Lançamento mensal de faltas ({referencePeriod.monthName}/{referencePeriod.year}) com apuração legal.
                </p>
              </div>
            </div>
          )}

          {/* Card 3: Busca Ativa Escolar */}
          <div
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="bg-white rounded-xl p-5 border border-slate-200/90 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between group shadow-none"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-400 group-hover:text-slate-900 transition-colors inline-flex items-center gap-1 font-medium">
                Monitorar →
              </span>
            </div>
            <div className="mt-4 space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">
                Busca Ativa Escolar
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Estudantes com 3, 5 ou 10 faltas consecutivas, avisos imediatos e ações de contato com responsáveis.
              </p>
            </div>
          </div>

          {/* Card 4: Rotas de Ônibus e Mapa */}
          <div
            onClick={() => onNavigateToScreen('mapa_estudantes')}
            className="bg-white rounded-xl p-5 border border-slate-200/90 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between group shadow-none"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <MapPin className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-400 group-hover:text-slate-900 transition-colors inline-flex items-center gap-1 font-medium">
                Consultar →
              </span>
            </div>
            <div className="mt-4 space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">
                Rotas de Ônibus &amp; Mapa
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Geolocalização de endereços, linhas de transporte fretado e rotas a pé até a escola.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Gráfico Institucional de Frequência por Turma */}
      <section className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-none space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-700" />
              <span>Frequência das Turmas — Ano Letivo 2027</span>
            </h3>
            <p className="text-xs text-slate-500">
              Taxa de presença apurada com base nas metas da LDB (≥60% Ed. Infantil e ≥75% Ensino Fundamental).
            </p>
          </div>

          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium self-start sm:self-auto border border-slate-200/60">
            <button
              type="button"
              onClick={() => setChartFilterShift('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                chartFilterShift === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas (40)
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('MANHÃ')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                chartFilterShift === 'MANHÃ'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Manhã (20)
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('TARDE')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                chartFilterShift === 'TARDE'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tarde (20)
            </button>
          </div>
        </div>

        <div className="w-full h-[210px] sm:h-[240px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -25, bottom: 20 }}
            >
              <XAxis
                dataKey="name"
                interval={0}
                angle={-45}
                textAnchor="end"
                height={40}
                tick={{ fontSize: 10, fill: '#64748b' }}
              />
              <YAxis
                domain={[50, 100]}
                tick={{ fontSize: 10, fill: '#64748b' }}
                unit="%"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs shadow-md space-y-0.5 border border-slate-800">
                        <div className="font-semibold text-white">{data.name}</div>
                        <div className="text-slate-400">Turno: {data.shift}</div>
                        <div className="text-emerald-400 font-semibold font-mono tabular-nums">
                          Frequência Média: {data.presence}%
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {data.studentsCount} estudantes matriculados
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={75}
                stroke="#dc2626"
                strokeDasharray="3 3"
                label={{
                  value: 'Meta 75%',
                  fill: '#dc2626',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
              <Bar dataKey="presence" radius={[3, 3, 0, 0]}>
                {chartData.map((entry) => {
                  let barColor = '#059669';
                  if (entry.presence < 75) barColor = '#dc2626';
                  else if (entry.presence < 85) barColor = '#d97706';
                  return <Cell key={`cell-${entry.id}`} fill={barColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
              ≥ 85% (Frequência Alta)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
              75% a 84% (Atenção)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-600" />
              &lt; 75% (Abaixo da Meta)
            </span>
          </div>
          <span className="font-medium text-slate-500 text-xs">
            {chartData.length} turmas filtradas
          </span>
        </div>
      </section>

      {/* 5. Central de Avisos, Prazos da Frequência e Busca Ativa */}
      <section className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-none space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium border border-slate-200/60">
            <button
              type="button"
              onClick={() => setActiveHubTab('avisos')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeHubTab === 'avisos'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Avisos ({schoolNotices.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('prazos')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeHubTab === 'prazos'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Prazos do Mês</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('busca_ativa')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeHubTab === 'busca_ativa'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
              <span>Busca Ativa ({schoolStats.criticalConsecutiveCount})</span>
            </button>
          </div>
        </div>

        {activeHubTab === 'avisos' && (
          <QuadroAvisosCard
            notices={schoolNotices}
            userRole={userRole}
            userEmail={userEmail}
            userName={userName}
            variant="dashboard"
            onSaveNotices={onSaveSchoolNotices}
          />
        )}

        {activeHubTab === 'prazos' && (
          <LembretePrazoFrequenciaCard
            attendanceWindowConfig={attendanceWindowConfig}
            userRole={userRole}
            classes={classes}
            assignedClassId={assignedClassId}
            assignedClassIds={assignedClassIds}
            onOpenMonthlyAttendance={onSelectClassForMonthlyAttendance}
            onNavigateToAcessos={onNavigateToAcessos}
          />
        )}

        {activeHubTab === 'busca_ativa' && (
          <ResumoFaltasCriticasCard
            classes={classes}
            userRole={userRole}
            onSelectStudentForConsecutiveScreen={(cls, student) => {
              onSelectStudentForConsecutiveScreen?.(cls.id, student.id);
            }}
            onOpenStudentGrid={
              onOpenStudentGrid
                ? (student) => onOpenStudentGrid(student)
                : undefined
            }
            onOpenStudentPdf={
              onOpenStudentPdf
                ? (student, className) => onOpenStudentPdf(student, className)
                : undefined
            }
          />
        )}
      </section>
    </div>
  );
};
