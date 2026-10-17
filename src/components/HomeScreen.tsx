import React, { useMemo, useState } from 'react';
import {
  ClassGroup,
  Student,
  UserRole,
  SchoolNotice,
  AttendanceWindowConfig,
  ScreenType,
} from '../types';
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

  const schoolStats = useMemo(() => {
    let totalStudents = 0;
    let sumPresence = 0;
    let countedClasses = 0;
    let criticalConsecutiveCount = 0;

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
    });

    const avgPresence = countedClasses > 0 ? Math.round(sumPresence / countedClasses) : 92;

    return {
      totalClasses: classes.length,
      totalStudents,
      avgPresence,
      criticalConsecutiveCount,
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
      ? 'Gestão Escolar'
      : userRole === 'peb2'
      ? 'Educador(a) Especialista PEB II'
      : 'Professora Regente PEB I';

  const todayFormatted = useMemo(() => {
    try {
      const now = new Date();
      const str = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return 'Ano Letivo 2027';
    }
  }, []);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-14 animate-gentle-fade text-[#1d1d1f]">
      {/* 1. Header Minimalista e Acolhedor */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#86868b]">
              <span>EMEB Prof. Joaquim Candelário de Freitas</span>
              <span aria-hidden="true">·</span>
              <span>Jundiaí</span>
              <span aria-hidden="true">·</span>
              <span>{todayFormatted}</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f]">
              Visão Geral Escolar
            </h1>

            <p className="text-xs sm:text-sm text-[#6e6e73]">
              Olá, <strong className="text-[#1d1d1f] font-semibold">{userName}</strong> · {userRoleLabel}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => onNavigateToScreen('turmas')}
              className="h-10 px-4.5 rounded-2xl bg-[#1d1d1f] hover:bg-black text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-98 select-none"
            >
              <Users className="w-4 h-4 text-white" />
              <span>{userRole === 'usuario' ? 'Acessar Minha Turma' : 'Quadro de Turmas'}</span>
            </button>
          </div>
        </div>

        {/* 4 Indicadores Macro em Linha Limpa */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-black/[0.04]">
          <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.03]">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] block">
              Total de Turmas
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-mono text-[#1d1d1f] tabular-nums">
                {schoolStats.totalClasses}
              </span>
              <span className="text-xs text-[#6e6e73]">ativas</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.03]">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] block">
              Estudantes Matriculados
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-mono text-[#1d1d1f] tabular-nums">
                {schoolStats.totalStudents}
              </span>
              <span className="text-xs text-[#6e6e73]">ativos</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.03]">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] block">
              Frequência Média
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-mono text-[#005035] tabular-nums">
                {schoolStats.avgPresence}%
              </span>
              <span className="text-xs text-[#6e6e73]">meta LDB ≥ 75%</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.03]">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] block">
              Busca Ativa (ECA)
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-mono text-[#ba1a1a] tabular-nums">
                {schoolStats.criticalConsecutiveCount}
              </span>
              <span className="text-xs text-[#6e6e73]">alertas</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 4 Portas de Entrada / Ações Rápidas */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          onClick={() => onNavigateToScreen('turmas')}
          className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-black/[0.14] transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
              <Users className="w-4 h-4" />
            </div>
            <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#1d1d1f] group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <h2 className="text-sm font-bold text-[#1d1d1f]">
              {userRole === 'usuario' ? 'Minha Turma' : 'Quadro de Turmas'}
            </h2>
            <p className="text-xs text-[#86868b] mt-0.5">
              Relação nominal, turmas e dados cadastrais.
            </p>
          </div>
        </div>

        {userRole !== 'peb2' && (
          <div
            onClick={() => onNavigateToScreen('frequencia_mensal')}
            className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-black/[0.14] transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#eaf6ef] text-[#005035] flex items-center justify-center group-hover:bg-[#005035] group-hover:text-white transition-colors">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#1d1d1f] group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="mt-3">
              <h2 className="text-sm font-bold text-[#1d1d1f]">Faltas do Mês</h2>
              <p className="text-xs text-[#86868b] mt-0.5">
                Lançamento rápido de faltas e atestados.
              </p>
            </div>
          </div>
        )}

        <div
          onClick={() => onNavigateToScreen('mapa_estudantes')}
          className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-black/[0.14] transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
              <MapPin className="w-4 h-4" />
            </div>
            <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#1d1d1f] group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <h2 className="text-sm font-bold text-[#1d1d1f]">Mapa de Trajetos</h2>
            <p className="text-xs text-[#86868b] mt-0.5">
              Geolocalização, fotos e distâncias até a escola.
            </p>
          </div>
        </div>

        <div
          onClick={() =>
            onNavigateToScreen(userRole === 'admin' ? 'resumo' : 'faltas_consecutivas')
          }
          className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-black/[0.14] transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-[#fff2f2] text-[#ba1a1a] flex items-center justify-center group-hover:bg-[#ba1a1a] group-hover:text-white transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#1d1d1f] group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <h2 className="text-sm font-bold text-[#1d1d1f]">
              {userRole === 'admin' ? 'Resumo Mensal MEC' : 'Busca Ativa (ECA)'}
            </h2>
            <p className="text-xs text-[#86868b] mt-0.5">
              {userRole === 'admin'
                ? 'Indicadores consolidados e matriz escolar.'
                : 'Alertas de 3+, 5+ e 10+ faltas consecutivas.'}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Gráfico Executivo Limpo (Recharts) */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f]">
              Frequência por Turma
            </h3>
            <p className="text-xs text-[#86868b]">
              Taxa de presença em conformidade com o Artigo 12 da LDB (meta mínima 75%).
            </p>
          </div>

          <div className="inline-flex items-center p-1 bg-[#f5f5f7] rounded-xl text-xs font-medium self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setChartFilterShift('all')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                chartFilterShift === 'all'
                  ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('MANHÃ')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                chartFilterShift === 'MANHÃ'
                  ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Manhã
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('TARDE')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                chartFilterShift === 'TARDE'
                  ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Tarde
            </button>
          </div>
        </div>

        <div className="w-full h-[200px] sm:h-[230px] pt-2">
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
                tick={{ fontSize: 10, fill: '#86868b' }}
              />
              <YAxis
                domain={[50, 100]}
                tick={{ fontSize: 10, fill: '#86868b' }}
                unit="%"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#1d1d1f] text-white px-3 py-2 rounded-xl text-xs shadow-lg space-y-0.5">
                        <div className="font-semibold">{data.name}</div>
                        <div className="text-white/70">Turno: {data.shift}</div>
                        <div className="text-emerald-400 font-semibold font-mono tabular-nums">
                          Frequência: {data.presence}%
                        </div>
                        <div className="text-white/60 text-[0.68rem]">
                          {data.studentsCount} estudantes
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={75}
                stroke="#ba1a1a"
                strokeDasharray="3 3"
                label={{
                  value: '75%',
                  fill: '#ba1a1a',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
              <Bar dataKey="presence" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => {
                  let barColor = '#005035';
                  if (entry.presence < 75) barColor = '#ba1a1a';
                  else if (entry.presence < 85) barColor = '#f59e0b';
                  return <Cell key={`cell-${entry.id}`} fill={barColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-between text-xs text-[#86868b] pt-2 border-t border-black/[0.04]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#005035]" />
              ≥ 85%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
              75% a 84%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ba1a1a]" />
              &lt; 75%
            </span>
          </div>
          <span>Ano Letivo 2027</span>
        </div>
      </section>

      {/* 4. Central Institucional Unificada (Tabs Enxutas: Quadro de Avisos / Prazos / Busca Ativa) */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <div className="inline-flex items-center p-1 bg-[#f5f5f7] rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveHubTab('avisos')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeHubTab === 'avisos'
                  ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Avisos ({schoolNotices.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('prazos')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeHubTab === 'prazos'
                  ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Prazos do Mês</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('busca_ativa')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeHubTab === 'busca_ativa'
                  ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#ba1a1a]" />
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
