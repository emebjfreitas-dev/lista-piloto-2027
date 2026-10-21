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

  const [currentClock, setCurrentClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const clockHours = currentClock.getHours();
  const shiftInfo = useMemo(() => {
    if (clockHours >= 7 && clockHours < 12) {
      return {
        label: 'Turno Manhã',
        desc: '07h00 às 12h00 · Período Letivo Regular',
        badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
        dotColor: 'bg-emerald-500',
      };
    }
    if (clockHours >= 12 && clockHours < 18) {
      return {
        label: 'Turno Tarde',
        desc: '12h30 às 17h30 · Período Letivo Regular',
        badgeColor: 'bg-sky-50 text-sky-800 border-sky-200/60',
        dotColor: 'bg-sky-500',
      };
    }
    return {
      label: 'Plantão / Administrativo',
      desc: 'Fora do horário regular de aulas',
      badgeColor: 'bg-slate-50 text-slate-700 border-slate-200/60',
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
      return 'Ano Letivo 2027';
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
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-14 animate-gentle-fade text-[#1d1d1f]">
      {/* 1. Header Minimalista com Relógio Dinâmico e Marcadores Inteligentes */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#86868b]">
              <span>EMEB Prof. Joaquim Candelário de Freitas</span>
              <span aria-hidden="true">·</span>
              <span>Jundiaí/SP</span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-[#1d1d1f]">{todayFormatted}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f]">
                Visão Geral Escolar
              </h1>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.72rem] font-bold border ${shiftInfo.badgeColor}`}>
                <span className={`w-2 h-2 rounded-full ${shiftInfo.dotColor} animate-pulse`} />
                <span>{shiftInfo.label}</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#6e6e73]">
              Olá, <strong className="text-[#1d1d1f] font-semibold">{userName}</strong> · {userRoleLabel}
            </p>
          </div>

          {/* Marcador Dinâmico de Hora ao Vivo + Ação Rápida */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-4 py-2 bg-[#f5f5f7] rounded-2xl border border-black/[0.04] flex items-center gap-2.5 shadow-2xs">
              <Clock className="w-4 h-4 text-[#0071e3] shrink-0" />
              <div>
                <span className="text-[0.62rem] uppercase font-bold tracking-wider text-[#86868b] block leading-none">
                  Horário Oficial
                </span>
                <span className="font-mono text-base sm:text-lg font-bold text-[#1d1d1f] tabular-nums tracking-tight">
                  {timeFormatted}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToScreen('turmas')}
              className="h-11 px-4.5 rounded-2xl bg-[#1d1d1f] hover:bg-black text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-98 select-none"
            >
              <Users className="w-4 h-4 text-white" />
              <span>{userRole === 'usuario' ? 'Acessar Minha Turma' : 'Quadro de Turmas'}</span>
            </button>
          </div>
        </div>

        {/* 4 Marcadores Inteligentes da Escola */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-black/[0.04]">
          {/* Marcador Inteligente 1: Janela de Lançamento */}
          <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.03] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] block">
                Janela de Frequência
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  windowEval.isAllowedToLaunch ? 'bg-[#005035]' : 'bg-amber-500'
                }`}
              />
            </div>
            <div className="mt-2">
              <span
                className={`text-sm sm:text-base font-bold truncate block ${
                  windowEval.isAllowedToLaunch ? 'text-[#005035]' : 'text-amber-800'
                }`}
              >
                {windowEval.isAllowedToLaunch ? 'Liberada para Registro' : 'Aguardando Período'}
              </span>
              <span className="text-[0.7rem] text-[#6e6e73] block truncate mt-0.5">
                {windowEval.reasonLabel || windowEval.statusTitle}
              </span>
            </div>
          </div>

          {/* Marcador Inteligente 2: Frequência Geral & Meta LDB */}
          <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.03] flex flex-col justify-between">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] block">
              Frequência Global
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-bold font-mono text-[#005035] tabular-nums">
                {schoolStats.avgPresence}%
              </span>
              <span className="text-xs text-[#6e6e73]">meta LDB ≥ 75%</span>
            </div>
          </div>

          {/* Marcador Inteligente 3: Alertas de Busca Ativa */}
          <div
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="bg-[#f5f5f7] hover:bg-[#fff2f2]/60 rounded-2xl p-3.5 border border-black/[0.03] hover:border-rose-200/60 transition-all cursor-pointer flex flex-col justify-between group"
            title="Ver relação de estudantes em alerta de Busca Ativa"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] group-hover:text-rose-700 block transition-colors">
                Busca Ativa (ECA)
              </span>
              <ShieldAlert className="w-3.5 h-3.5 text-[#ba1a1a]" />
            </div>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-bold font-mono text-[#ba1a1a] tabular-nums">
                {schoolStats.criticalConsecutiveCount}
              </span>
              <span className="text-xs text-[#6e6e73]">com 3+ faltas seguidas</span>
            </div>
          </div>

          {/* Marcador Inteligente 4: Total de Estudantes & Turmas */}
          <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.03] flex flex-col justify-between">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#86868b] block">
              Comunidade Escolar
            </span>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-2xl font-bold font-mono text-[#1d1d1f] tabular-nums">
                {schoolStats.totalStudents}
              </span>
              <span className="text-xs text-[#6e6e73]">
                estudantes · {schoolStats.totalClasses} turmas
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. As 4 Portas Principais — Grandes, Visíveis e Fáceis de Tocar */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#0071e3]">touch_app</span>
            <span>O que você deseja fazer agora? (Toque em um cartão)</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Cartão 1: Meus Alunos */}
          <div
            onClick={() => onNavigateToScreen('turmas')}
            className="bg-white rounded-3xl p-5 border-2 border-black/[0.08] hover:border-[#0071e3] transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.98] select-none shadow-xs hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="w-13 h-13 rounded-2xl bg-[#0071e3]/12 text-[#0071e3] flex items-center justify-center group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
                <Users className="w-7 h-7" />
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold group-hover:bg-[#0071e3]/10 group-hover:text-[#0071e3] transition-colors">
                Abrir →
              </span>
            </div>
            <div className="mt-4 space-y-1">
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                {userRole === 'usuario' ? 'Meus Alunos (Turma)' : 'Lista de Turmas'}
              </h3>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                Ver a lista de todos os alunos da sala com foto, chamada e telefone.
              </p>
            </div>
          </div>

          {/* Cartão 2: Faltas do Mês / Chamada */}
          {userRole !== 'peb2' && (
            <div
              onClick={() => onNavigateToScreen('frequencia_mensal')}
              className="bg-white rounded-3xl p-5 border-2 border-black/[0.08] hover:border-[#005035] transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.98] select-none shadow-xs hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="w-13 h-13 rounded-2xl bg-[#eaf6ef] text-[#005035] flex items-center justify-center group-hover:bg-[#005035] group-hover:text-white transition-colors">
                  <CalendarCheck className="w-7 h-7" />
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold group-hover:bg-emerald-200 transition-colors">
                  Fazer Chamada →
                </span>
              </div>
              <div className="mt-4 space-y-1">
                <h3 className="text-lg font-bold text-slate-900 leading-tight">
                  Fazer a Chamada do Mês
                </h3>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  Anotar faltas com botões grandes de mais (+) e menos (—). Salva na hora.
                </p>
              </div>
            </div>
          )}

          {/* Cartão 3: Alertas de Faltas / Busca Ativa */}
          <div
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="bg-white rounded-3xl p-5 border-2 border-black/[0.08] hover:border-[#ba1a1a] transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.98] select-none shadow-xs hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="w-13 h-13 rounded-2xl bg-[#fff2f2] text-[#ba1a1a] flex items-center justify-center group-hover:bg-[#ba1a1a] group-hover:text-white transition-colors">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold group-hover:bg-rose-200 transition-colors">
                Ver Alertas →
              </span>
            </div>
            <div className="mt-4 space-y-1">
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                Alunos com Muitas Faltas
              </h3>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                Lista de crianças com 3 ou mais faltas seguidas para acolher a família.
              </p>
            </div>
          </div>

          {/* Cartão 4: Ônibus e Trajetos */}
          <div
            onClick={() => onNavigateToScreen('mapa_estudantes')}
            className="bg-white rounded-3xl p-5 border-2 border-black/[0.08] hover:border-indigo-600 transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.98] select-none shadow-xs hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="w-13 h-13 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <MapPin className="w-7 h-7" />
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold group-hover:bg-indigo-200 transition-colors">
                Consultar →
              </span>
            </div>
            <div className="mt-4 space-y-1">
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                Mapa e Caminho dos Alunos
              </h3>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                Veja onde os alunos moram, tempo a pé, de carro, de ônibus e rotas pelas ruas 100% grátis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Guia de Uso Passo a Passo — Simples e Tranquilizador para Pessoas Idosas */}
      <section className="bg-amber-50/80 rounded-3xl p-5 sm:p-6 border-2 border-amber-200/90 space-y-3.5 shadow-xs">
        <div className="flex items-center gap-2.5 text-amber-950">
          <span className="material-symbols-outlined text-[26px] text-amber-800">help</span>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              Instruções Fáceis: Como usar este aplicativo?
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 font-medium">
              Tudo o que você faz é salvo sozinho na mesma hora. Você não precisa ter medo de errar!
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-amber-950 font-medium">
          <div className="bg-white p-4 rounded-2xl border border-amber-200 flex items-start gap-3 shadow-2xs">
            <span className="w-8 h-8 rounded-full bg-amber-500 text-white font-extrabold flex items-center justify-center shrink-0 text-sm">
              1
            </span>
            <div>
              <strong className="block text-slate-900 font-bold mb-0.5 text-base">Fazer a Chamada</strong>
              <span className="text-slate-700 text-xs sm:text-sm leading-relaxed block">
                Toque no cartão verde <strong className="text-slate-900">Fazer a Chamada do Mês</strong>. Use o botão <strong className="text-emerald-700 text-base font-black">+</strong> para marcar falta.
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-amber-200 flex items-start gap-3 shadow-2xs">
            <span className="w-8 h-8 rounded-full bg-amber-500 text-white font-extrabold flex items-center justify-center shrink-0 text-sm">
              2
            </span>
            <div>
              <strong className="block text-slate-900 font-bold mb-0.5 text-base">Ver Telefones e Fotos</strong>
              <span className="text-slate-700 text-xs sm:text-sm leading-relaxed block">
                Toque em <strong className="text-slate-900">Meus Alunos</strong>. Você pode ver as fotos das crianças e abrir o WhatsApp dos pais em 1 toque.
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-amber-200 flex items-start gap-3 shadow-2xs">
            <span className="w-8 h-8 rounded-full bg-amber-500 text-white font-extrabold flex items-center justify-center shrink-0 text-sm">
              3
            </span>
            <div>
              <strong className="block text-slate-900 font-bold mb-0.5 text-base">Aumentar a Letra</strong>
              <span className="text-slate-700 text-xs sm:text-sm leading-relaxed block">
                Se as letras estiverem pequenas para sua visão, toque no botão amarelo <strong className="text-amber-900">Letra</strong> no topo da tela.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Gráfico da Frequência */}
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
