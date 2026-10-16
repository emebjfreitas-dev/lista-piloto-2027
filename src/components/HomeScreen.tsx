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
import {
  Users,
  CalendarCheck,
  MapPin,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  School,
  Sparkles,
  BarChart3,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface HomeScreenProps {
  userRole: UserRole;
  userEmail: string;
  userName: string;
  classes: ClassGroup[];
  assignedClassId: string;
  assignedClassIds: string[];
  attendanceWindowConfig: AttendanceWindowConfig;
  schoolNotices: SchoolNotice[];
  onSaveSchoolNotices?: (notices: SchoolNotice[]) => void;
  onNavigateToScreen: (screen: ScreenType) => void;
  onSelectClassForMonthlyAttendance?: (cls: ClassGroup) => void;
  onSelectStudentForConsecutiveScreen?: (classId: string, studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student, className?: string) => void;
  onNavigateToAcessos?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userRole,
  userEmail,
  userName,
  classes,
  assignedClassId,
  assignedClassIds,
  attendanceWindowConfig,
  schoolNotices,
  onSaveSchoolNotices,
  onNavigateToScreen,
  onSelectClassForMonthlyAttendance,
  onSelectStudentForConsecutiveScreen,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onNavigateToAcessos,
}) => {
  const [chartFilterShift, setChartFilterShift] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');

  // Compute overall school statistics
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

  // Executive chart data for classes attendance
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
      ? 'Gestão Escolar (Direção / Coordenação)'
      : userRole === 'peb2'
      ? 'Educador(a) Especialista PEB II'
      : 'Professora Regente PEB I';

  const todayFormatted = useMemo(() => {
    try {
      const now = new Date();
      const str = format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return 'Ano Letivo 2026';
    }
  }, []);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-16 animate-gentle-fade text-[#1d1d1f]">
      {/* CABEÇALHO EXECUTIVO INSTITUCIONAL */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[0.72rem] font-bold text-[#86868b]">
              <span className="px-2.5 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0066cc] uppercase tracking-wider font-extrabold text-[0.66rem] inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#0071e3]" />
                PORTAL INSTITUCIONAL
              </span>
              <span>•</span>
              <span className="text-[#1d1d1f] font-semibold">
                SECRETARIA DE EDUCAÇÃO DO MUNICÍPIO DE JUNDIAÍ
              </span>
              <span>•</span>
              <span className="text-[#6e6e73]">
                EMEB PROF. JOAQUIM CANDELÁRIO DE FREITAS
              </span>
            </div>

            <h1 className="text-[1.45rem] sm:text-[1.8rem] font-black text-[#1d1d1f] tracking-tight leading-tight flex items-center gap-2.5">
              <School className="w-6 h-6 text-[#0071e3] shrink-0 hidden sm:inline-block" />
              Visão Geral &amp; Diário Escolar
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-[#6e6e73]">
              <span>
                Bem-vindo(a), <strong className="text-[#1d1d1f]">{userName}</strong>
              </span>
              <span>•</span>
              <span>
                Perfil: <strong className="text-[#0066cc]">{userRoleLabel}</strong>
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-[#86868b] font-medium text-[0.76rem]">
                <Calendar className="w-3.5 h-3.5 text-[#86868b]" />
                {todayFormatted}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => onNavigateToScreen('turmas')}
              className="h-[42px] px-4.5 rounded-full bg-[#1d1d1f] hover:bg-black text-white font-bold text-[0.8rem] flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-97 select-none"
            >
              <Users className="w-4 h-4 text-white" />
              <span>{userRole === 'usuario' ? 'Acessar Minha Turma' : 'Ver Quadro de Turmas'}</span>
            </button>
          </div>
        </div>

        {/* Linha de Indicadores Macro da Escola */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-black/[0.04]">
          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <div className="flex items-center justify-between">
              <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
                Total de Turmas
              </span>
              <School className="w-3.5 h-3.5 text-[#86868b]" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#1d1d1f] tabular-nums">
                {schoolStats.totalClasses}
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">turmas ativas</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <div className="flex items-center justify-between">
              <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
                Estudantes Ativos
              </span>
              <Users className="w-3.5 h-3.5 text-[#86868b]" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#1d1d1f] tabular-nums">
                {schoolStats.totalStudents}
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">matriculados</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <div className="flex items-center justify-between">
              <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
                Frequência Média
              </span>
              <TrendingUp className="w-3.5 h-3.5 text-[#005035]" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#005035] tabular-nums">
                {schoolStats.avgPresence}%
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">meta MEC ≥ 75%</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <div className="flex items-center justify-between">
              <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
                Busca Ativa (ECA)
              </span>
              <AlertTriangle className="w-3.5 h-3.5 text-[#ba1a1a]" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#ba1a1a] tabular-nums">
                {schoolStats.criticalConsecutiveCount}
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">alertas ativos</span>
            </div>
          </div>
        </div>
      </section>

      {/* PORTAS DE ENTRADA / ATALHOS DE ALTO NÍVEL */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Cartão 1: Turmas */}
        <div
          onClick={() => onNavigateToScreen('turmas')}
          className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-[#0071e3]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
              <Users className="w-5 h-5 transition-transform group-hover:scale-105" />
            </div>
            <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#0071e3] group-hover:translate-x-1 transition-all" />
          </div>

          <div className="mt-3.5">
            <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">
              {userRole === 'usuario' ? 'Minha Turma' : 'Quadro de Turmas'}
            </h2>
            <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
              {userRole === 'usuario'
                ? 'Relação nominal, matrículas e dados cadastrais dos estudantes.'
                : 'Todas as 40 turmas da escola com filtros de turno e busca.'}
            </p>
          </div>
        </div>

        {/* Cartão 2: Faltas do Mês */}
        {userRole !== 'peb2' && (
          <div
            onClick={() => onNavigateToScreen('frequencia_mensal')}
            className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-[#005035]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-[#eaf6ef] text-[#005035] flex items-center justify-center group-hover:bg-[#005035] group-hover:text-white transition-colors">
                <CalendarCheck className="w-5 h-5 transition-transform group-hover:scale-105" />
              </div>
              <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#005035] group-hover:translate-x-1 transition-all" />
            </div>

            <div className="mt-3.5">
              <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Faltas do Mês</h2>
              <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
                Lançamento rápido de faltas e atestados com sincronização contínua.
              </p>
            </div>
          </div>
        )}

        {/* Cartão 3: Mapa de Trajetos & KM */}
        <div
          onClick={() => onNavigateToScreen('mapa_estudantes')}
          className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-[#0071e3]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
              <MapPin className="w-5 h-5 transition-transform group-hover:scale-105" />
            </div>
            <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#0071e3] group-hover:translate-x-1 transition-all" />
          </div>

          <div className="mt-3.5">
            <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Mapa de Trajetos</h2>
            <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
              Geolocalização com fotos dos alunos, distâncias e tempos de percurso até a EMEB.
            </p>
          </div>
        </div>

        {/* Cartão 4: Resumo Mensal MEC (Admin) ou Faltas Consecutivas */}
        {userRole === 'admin' ? (
          <div
            onClick={() => onNavigateToScreen('resumo')}
            className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-[#1d1d1f]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center group-hover:bg-[#1d1d1f] group-hover:text-white transition-colors">
                <BarChart3 className="w-5 h-5 transition-transform group-hover:scale-105" />
              </div>
              <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#1d1d1f] group-hover:translate-x-1 transition-all" />
            </div>

            <div className="mt-3.5">
              <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Scorecard Executivo MEC</h2>
              <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
                Permanência escolar, conformidade com a LDB e matriz comparativa.
              </p>
            </div>
          </div>
        ) : (
          <div
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="bg-white rounded-3xl p-4.5 border border-black/[0.06] hover:border-[#ba1a1a]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98 select-none"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-[#fff2f2] text-[#ba1a1a] flex items-center justify-center group-hover:bg-[#ba1a1a] group-hover:text-white transition-colors">
                <AlertTriangle className="w-5 h-5 transition-transform group-hover:scale-105" />
              </div>
              <ArrowRight className="w-4 h-4 text-[#86868b] group-hover:text-[#ba1a1a] group-hover:translate-x-1 transition-all" />
            </div>

            <div className="mt-3.5">
              <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Busca Ativa (ECA)</h2>
              <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
                Acompanhamento e notificação de ciclos de 3+, 5+ e 10+ faltas consecutivas.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* PAINEL GRÁFICO RECHARTS DE FREQUÊNCIA DA ESCOLA (100% LOCAL, SEM API KEY) */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0071e3]" />
              <h3 className="text-[1.05rem] font-extrabold text-[#1d1d1f] tracking-tight">
                Indicadores Executivos de Frequência por Turma
              </h3>
            </div>
            <p className="text-[0.76rem] text-[#6e6e73]">
              Acompanhamento visual em conformidade com o Artigo 12 da LDB (Meta mínima de 75%).
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-[#f5f5f7] p-1 rounded-2xl border border-black/[0.04] text-[0.74rem] font-bold">
            <button
              type="button"
              onClick={() => setChartFilterShift('all')}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                chartFilterShift === 'all'
                  ? 'bg-white text-[#1d1d1f] shadow-xs'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('MANHÃ')}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                chartFilterShift === 'MANHÃ'
                  ? 'bg-white text-[#1d1d1f] shadow-xs'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Manhã
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('TARDE')}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                chartFilterShift === 'TARDE'
                  ? 'bg-white text-[#1d1d1f] shadow-xs'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Tarde
            </button>
          </div>
        </div>

        {/* Gráfico Recharts */}
        <div className="w-full h-[220px] sm:h-[260px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
            >
              <XAxis
                dataKey="name"
                interval={0}
                angle={-45}
                textAnchor="end"
                height={45}
                tick={{ fontSize: 10, fill: '#6e6e73', fontWeight: 600 }}
              />
              <YAxis
                domain={[50, 100]}
                tick={{ fontSize: 11, fill: '#86868b' }}
                unit="%"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#1d1d1f] text-white p-2.5 rounded-xl text-[0.76rem] shadow-lg space-y-1">
                        <div className="font-bold">{data.name}</div>
                        <div className="text-[#a1a1a6]">Turno: {data.shift}</div>
                        <div className="text-emerald-400 font-bold">
                          Frequência: {data.presence}%
                        </div>
                        <div className="text-white/70 text-[0.7rem]">
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
                stroke="#ba1a1a"
                strokeDasharray="3 3"
                label={{
                  value: 'Meta LDB 75%',
                  fill: '#ba1a1a',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
              <Bar dataKey="presence" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => {
                  let barColor = '#005035'; // verde ótimo
                  if (entry.presence < 75) {
                    barColor = '#ba1a1a'; // crítico abaixo do MEC
                  } else if (entry.presence < 85) {
                    barColor = '#ff9500'; // atenção
                  }
                  return <Cell key={`cell-${entry.id}`} fill={barColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/[0.04] text-[0.72rem] text-[#6e6e73]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#005035]" />
              Excelente (≥ 85%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff9500]" />
              Atenção (75% - 84%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ba1a1a]" />
              Abaixo da LDB (&lt; 75%)
            </span>
          </div>

          <span className="font-semibold text-[#1d1d1f] flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#005035]" />
            Meta Institucional 2026: 100% das turmas acima de 75%
          </span>
        </div>
      </section>

      {/* SISTEMA DE LEMBRETES AUTOMÁTICOS DE PRAZOS DE ENCERRAMENTO DA FREQUÊNCIA */}
      <LembretePrazoFrequenciaCard
        attendanceWindowConfig={attendanceWindowConfig}
        userRole={userRole}
        classes={classes}
        assignedClassId={assignedClassId}
        assignedClassIds={assignedClassIds}
        onOpenMonthlyAttendance={onSelectClassForMonthlyAttendance}
        onNavigateToAcessos={onNavigateToAcessos}
      />

      {/* QUADRO DE AVISOS INSTITUCIONAL (COMUNICADOS DA ESCOLA) */}
      <QuadroAvisosCard
        notices={schoolNotices}
        userRole={userRole}
        userEmail={userEmail}
        userName={userName}
        variant="dashboard"
        onSaveNotices={onSaveSchoolNotices}
      />

      {/* RESUMO DE FALTAS CRÍTICAS (BUSCA ATIVA ESCOLAR • ECA) */}
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
    </div>
  );
};
