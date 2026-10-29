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
  Users,
  CalendarCheck,
  MapPin,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Clock,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  Search,
  Sun,
  Sunset,
  FileSpreadsheet,
  Eye,
  Edit3,
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
  const [currentClock, setCurrentClock] = useState(() => new Date());
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<'TODOS' | 'MANHÃ' | 'TARDE'>('TODOS');
  const [turmaSearchInput, setTurmaSearchInput] = useState('');
  const [activeHubTab, setActiveHubTab] = useState<'avisos' | 'prazos' | 'busca_ativa'>('avisos');
  const [chartFilterShift, setChartFilterShift] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Período oficial: A chamada refere-se ao mês anterior ao mês vigente
  const referencePeriod = useMemo(
    () => getDefaultReferencePeriod(currentClock),
    [currentClock]
  );

  const windowEval = useMemo(
    () => evaluateAttendanceLaunchWindow(attendanceWindowConfig),
    [attendanceWindowConfig]
  );

  // Estatísticas gerais
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

  // Turmas filtradas para o Seletor Rápido
  const filteredClasses = useMemo(() => {
    let list = classes;
    if (selectedShiftFilter === 'MANHÃ') {
      list = list.filter((c) =>
        (c.shift || '').toUpperCase().includes('MANHÃ') || c.periodo === 'MANHÃ'
      );
    } else if (selectedShiftFilter === 'TARDE') {
      list = list.filter((c) =>
        (c.shift || '').toUpperCase().includes('TARDE') || c.periodo === 'TARDE'
      );
    }

    if (turmaSearchInput.trim()) {
      const q = turmaSearchInput.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.turmaAbrev && c.turmaAbrev.toLowerCase().includes(q)) ||
          (c.teacherName && c.teacherName.toLowerCase().includes(q)) ||
          (c.room && c.room.toLowerCase().includes(q))
      );
    }

    return list;
  }, [classes, selectedShiftFilter, turmaSearchInput]);

  // Dados para o gráfico
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

  const clockHours = currentClock.getHours();
  const shiftInfo = useMemo(() => {
    if (clockHours >= 7 && clockHours < 12) {
      return {
        label: 'Turno Manhã em Andamento',
        desc: '07h00 às 12h00',
        dotColor: 'bg-amber-600',
      };
    }
    if (clockHours >= 12 && clockHours < 18) {
      return {
        label: 'Turno Tarde em Andamento',
        desc: '12h30 às 17h30',
        dotColor: 'bg-sky-600',
      };
    }
    return {
      label: 'Plantão Administrativo',
      desc: 'Fora do horário de aula',
      dotColor: 'bg-slate-700',
    };
  }, [clockHours]);

  const todayFormatted = useMemo(() => {
    try {
      const str = format(currentClock, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return 'Hoje';
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
    <div className="flex flex-col w-full max-w-[1560px] mx-auto space-y-6 pb-16 text-slate-950 font-sans">
      {/* 1. CABEÇALHO ACOLHEDOR COM CONTRASTE DE TONS (SEM CONTORNOS) */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-950 text-xs font-bold mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0" />
              <span>SISTEMA CONECTADO · Suas ações são salvas automaticamente na escola</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-950">
              Olá, {userName}!
            </h1>
            <p className="text-sm sm:text-base font-semibold text-slate-800">
              EMEB Prof. Joaquim Candelário de Freitas · Ano Letivo 2027 · Secretaria de Educação de Jundiaí
            </p>
          </div>

          {/* Marcadores de Data, Hora e Turno em Superfícies Sólidas */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 bg-slate-100 rounded-2xl flex items-center gap-2.5 text-sm text-slate-950 font-bold">
              <Calendar className="w-4 h-4 text-slate-800 shrink-0" />
              <span>{todayFormatted}</span>
            </div>

            <div className="px-4 py-2.5 bg-slate-100 rounded-2xl flex items-center gap-2.5 text-sm text-slate-950 font-bold font-mono tabular-nums">
              <Clock className="w-4 h-4 text-slate-800 shrink-0" />
              <span>{timeFormatted}</span>
            </div>

            <div className="px-4 py-2.5 bg-slate-100 rounded-2xl flex items-center gap-2.5 text-sm text-slate-950 font-bold">
              <span className={`w-3 h-3 rounded-full ${shiftInfo.dotColor}`} />
              <span>{shiftInfo.label}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. O GRANDE PAINEL DE SELEÇÃO TÁTIL (CONTRASTE DE SUPERFÍCIES — SEM CONTORNOS) */}
      <section className="bg-slate-200/70 rounded-3xl p-6 sm:p-8 space-y-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-950 flex items-center gap-2.5">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-950" />
            <span>O que você deseja fazer agora?</span>
          </h2>
          <p className="text-sm sm:text-base font-semibold text-slate-800 mt-1">
            Selecione uma das opções abaixo para abrir diretamente:
          </p>
        </div>

        {/* Grade de Blocos Táteis Grandes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Opção 1: Ver Turmas e Estudantes */}
          <button
            type="button"
            onClick={() => onNavigateToScreen('turmas')}
            className="w-full text-left bg-white hover:bg-slate-50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center shrink-0">
                <Users className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Lista Nominal
                </span>
                <h3 className="text-lg font-bold text-slate-950 truncate">
                  Ver Turmas e Alunos
                </h3>
                <p className="text-xs font-semibold text-slate-700 truncate mt-1">
                  Fotos, chamada e telefones dos responsáveis
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold">
                40 Turmas
              </span>
              <span className="text-xs text-slate-950 font-bold flex items-center gap-1 mt-2.5">
                Abrir <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* Opção 2: Informar Faltas do Mês (Destaque em Superfície Verde Sólida) */}
          {userRole !== 'peb2' ? (
            <button
              type="button"
              onClick={() => onNavigateToScreen('frequencia_mensal')}
              className="w-full text-left bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-white text-emerald-900 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-200 block">
                    Chamada Mensal Oficial
                  </span>
                  <h3 className="text-lg font-bold text-white truncate">
                    Informar Faltas do Mês
                  </h3>
                  <p className="text-xs font-semibold text-emerald-100 truncate mt-1">
                    Mês de {referencePeriod.monthName} / {referencePeriod.year}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="px-3 py-1 rounded-xl bg-emerald-950 text-white text-xs font-bold">
                  {windowEval.isAllowedToLaunch ? 'Janela Aberta' : 'Lançar'}
                </span>
                <span className="text-xs text-white font-bold flex items-center gap-1 mt-2.5">
                  Acessar <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </button>
          ) : (
            <div className="w-full bg-white rounded-2xl p-6 shadow-sm text-slate-800 text-xs flex items-center gap-4">
              <CalendarCheck className="w-7 h-7 text-slate-600 shrink-0" />
              <div>
                <p className="font-bold text-slate-950 text-base">Lançamento de Faltas</p>
                <p className="font-semibold text-slate-700 mt-0.5">Perfil PEB II opera em modo consulta de turmas.</p>
              </div>
            </div>
          )}

          {/* Opção 3: Busca Ativa & Alertas de Faltas (ECA) */}
          <button
            type="button"
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="w-full text-left bg-white hover:bg-rose-50/50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-rose-700 text-white flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 block">
                  Busca Ativa &amp; ECA
                </span>
                <h3 className="text-lg font-bold text-slate-950 truncate">
                  Alunos em Atenção
                </h3>
                <p className="text-xs font-semibold text-slate-700 truncate mt-1">
                  Faltas consecutivas e contato familiar
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="px-3 py-1 rounded-xl bg-rose-100 text-rose-950 text-xs font-bold">
                {schoolStats.criticalConsecutiveCount} alertas
              </span>
              <span className="text-xs text-rose-800 font-bold flex items-center gap-1 mt-2.5">
                Ver Casos <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* Opção 4: Ônibus Escolar e Rotas Fretadas */}
          <button
            type="button"
            onClick={() => onNavigateToScreen('mapa_estudantes')}
            className="w-full text-left bg-white hover:bg-slate-50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center shrink-0">
                <MapPin className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Transporte &amp; Geografia
                </span>
                <h3 className="text-lg font-bold text-slate-950 truncate">
                  Rotas de Ônibus &amp; Mapa
                </h3>
                <p className="text-xs font-semibold text-slate-700 truncate mt-1">
                  Rotas 01 e 02 e endereços dos estudantes
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold">
                Rotas 01 / 02
              </span>
              <span className="text-xs text-slate-950 font-bold flex items-center gap-1 mt-2.5">
                Ver Mapa <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* Opção 5: Planilha Google ou Resumo Mensal */}
          {userRole === 'admin' ? (
            <button
              type="button"
              onClick={() => onNavigateToScreen('planilha')}
              className="w-full text-left bg-white hover:bg-slate-50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                    Gestão Oficial SED
                  </span>
                  <h3 className="text-lg font-bold text-slate-950 truncate">
                    Planilha Google &amp; Fotos
                  </h3>
                  <p className="text-xs font-semibold text-slate-700 truncate mt-1">
                    Conexão ao Drive oficial e fichas escaneadas
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold">
                  Google Drive
                </span>
                <span className="text-xs text-slate-950 font-bold flex items-center gap-1 mt-2.5">
                  Acessar <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateToScreen('resumo')}
              className="w-full text-left bg-white hover:bg-slate-50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center shrink-0">
                  <BarChart3 className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                    Indicadores Gerais
                  </span>
                  <h3 className="text-lg font-bold text-slate-950 truncate">
                    Resumo Mensal MEC
                  </h3>
                  <p className="text-xs font-semibold text-slate-700 truncate mt-1">
                    Percentuais consolidados da escola
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold">
                  Relatório
                </span>
                <span className="text-xs text-slate-950 font-bold flex items-center gap-1 mt-2.5">
                  Ver <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </button>
          )}

          {/* Opção 6: Quadro de Avisos e Recados da Escola */}
          <button
            type="button"
            onClick={() => {
              setActiveHubTab('avisos');
              const el = document.getElementById('central-comunicados');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full text-left bg-white hover:bg-slate-50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center shrink-0">
                <Bell className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Comunicação Interna
                </span>
                <h3 className="text-lg font-bold text-slate-950 truncate">
                  Quadro de Avisos
                </h3>
                <p className="text-xs font-semibold text-slate-700 truncate mt-1">
                  Recados da direção e prazos da coordenação
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold">
                {schoolNotices.length} avisos
              </span>
              <span className="text-xs text-slate-950 font-bold flex items-center gap-1 mt-2.5">
                Ler <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* 3. SELETOR DIRETO DE TURMAS (SEM CONTORNOS BOBOS — SUPERFÍCIES LIMPAS) */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-950 flex items-center gap-2.5">
              <Users className="w-7 h-7 text-slate-900" />
              <span>Escolha sua Turma para Trabalhar</span>
            </h2>
            <p className="text-sm sm:text-base font-semibold text-slate-800 mt-1">
              Clique em <strong className="font-bold text-slate-950">"Ver Alunos"</strong> para consultar a lista ou em <strong className="font-bold text-slate-950">"Lançar Faltas"</strong> para a chamada:
            </p>
          </div>

          {/* Botoeira de Filtro de Turnos Grandes em Superfície Sólida */}
          <div className="inline-flex p-1.5 bg-slate-100 rounded-2xl gap-1 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setSelectedShiftFilter('TODOS')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                selectedShiftFilter === 'TODOS'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              Todas (40)
            </button>
            <button
              type="button"
              onClick={() => setSelectedShiftFilter('MANHÃ')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                selectedShiftFilter === 'MANHÃ'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Manhã (20)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedShiftFilter('TARDE')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                selectedShiftFilter === 'TARDE'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Sunset className="w-4 h-4 text-sky-500" />
              <span>Tarde (20)</span>
            </button>
          </div>
        </div>

        {/* Campo de Busca em Superfície Suave */}
        <div className="relative">
          <Search className="w-5 h-5 text-slate-700 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={turmaSearchInput}
            onChange={(e) => setTurmaSearchInput(e.target.value)}
            placeholder="Digite o nome da turma ou da professora para encontrar rápido (ex: G4 A, 1º B, 5º A)..."
            className="w-full h-13 pl-12 pr-4 rounded-2xl bg-slate-100 text-slate-950 text-sm sm:text-base font-semibold placeholder:text-slate-500 focus:outline-none focus:bg-slate-200/80 transition-all"
          />
        </div>

        {/* Grade de Cartões de Turmas — Limpos, sem contornos, em Superfície Suave */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredClasses.map((cls) => {
            const isMorning =
              (cls.shift || '').toUpperCase().includes('MANHÃ') || cls.periodo === 'MANHÃ';

            return (
              <div
                key={cls.id}
                className="bg-slate-50 hover:bg-slate-100/90 rounded-2xl p-5 transition-all flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                        isMorning
                          ? 'bg-amber-200 text-amber-950'
                          : 'bg-sky-200 text-sky-950'
                      }`}
                    >
                      {isMorning ? <Sun className="w-3.5 h-3.5" /> : <Sunset className="w-3.5 h-3.5" />}
                      <span>{isMorning ? 'Manhã' : 'Tarde'}</span>
                    </span>
                    <span className="text-xs text-slate-900 font-bold">
                      Sala {cls.room || '—'}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-950 mt-3 leading-snug">
                    {cls.name}
                  </h3>
                  <p className="text-sm text-slate-800 font-semibold truncate mt-1">
                    {cls.teacherName || 'Professor(a) atribuído'}
                  </p>
                  <p className="text-xs text-slate-700 font-bold mt-1">
                    {cls.students.length} estudantes matriculados
                  </p>
                </div>

                {/* Dois Botões Táteis em Superfícies Sólidas */}
                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigateToScreen('detalhes')}
                    className="h-11 px-3 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Eye className="w-4 h-4 text-slate-900" />
                    <span>Ver Alunos</span>
                  </button>

                  {userRole !== 'peb2' ? (
                    <button
                      type="button"
                      onClick={() => onSelectClassForMonthlyAttendance(cls)}
                      className="h-11 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Edit3 className="w-4 h-4 text-white" />
                      <span>Faltas</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="h-11 px-3 bg-slate-200 text-slate-500 rounded-xl text-xs font-semibold flex items-center justify-center cursor-not-allowed"
                    >
                      <span>Consulta</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredClasses.length === 0 && (
          <div className="p-8 text-center bg-slate-100 rounded-2xl space-y-1">
            <p className="text-base font-bold text-slate-950">Nenhuma turma encontrada com esse termo.</p>
            <p className="text-sm font-semibold text-slate-700">Tente buscar por "G4", "1º", "Manhã" ou limpe a busca.</p>
          </div>
        )}
      </section>

      {/* 4. FAIXA DE INDICADORES (NÚMEROS GRANDES EM SUPERFÍCIE LIMPA) */}
      <section className="bg-white rounded-3xl shadow-sm py-6 px-6 sm:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className="flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Mês da Chamada
            </span>
            <div className="mt-2">
              <span className="text-xl font-bold text-slate-950 block">
                {referencePeriod.monthName} / {referencePeriod.year}
              </span>
              <span className="text-xs font-semibold text-slate-600 block mt-0.5">
                Apuração legal vigente
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Total de Alunos
            </span>
            <div className="mt-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-slate-950 block">
                {schoolStats.totalStudents}
              </span>
              <span className="text-xs font-semibold text-slate-600 block mt-0.5">
                Matriculados na escola
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Turmas Ativas
            </span>
            <div className="mt-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-slate-950 block">
                {schoolStats.totalClasses}
              </span>
              <span className="text-xs font-semibold text-slate-600 block mt-0.5">
                20 Manhã · 20 Tarde
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Presença Média
            </span>
            <div className="mt-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-emerald-800 block">
                {schoolStats.avgPresence}%
              </span>
              <span className="text-xs text-emerald-900 block font-bold mt-0.5">
                Dentro da meta MEC (≥75%)
              </span>
            </div>
          </div>

          <div
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="flex flex-col justify-between cursor-pointer group"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 group-hover:underline block">
              Busca Ativa (ECA) →
            </span>
            <div className="mt-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-rose-800 block">
                {schoolStats.criticalConsecutiveCount}
              </span>
              <span className="text-xs font-semibold text-slate-600 block mt-0.5">
                Casos em acompanhamento
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. CENTRAL DE AVISOS, PRAZOS E BUSCA ATIVA */}
      <section id="central-comunicados" className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-950">
              Central de Informações e Prazos da Escola
            </h3>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              Acompanhe recados importantes da coordenação e datas oficiais
            </p>
          </div>

          <div className="inline-flex items-center p-1.5 bg-slate-100 rounded-2xl text-sm font-bold gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveHubTab('avisos')}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer ${
                activeHubTab === 'avisos'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Avisos ({schoolNotices.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('prazos')}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer ${
                activeHubTab === 'prazos'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Prazos do Mês</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('busca_ativa')}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer ${
                activeHubTab === 'busca_ativa'
                  ? 'bg-rose-700 text-white shadow-sm'
                  : 'text-rose-900 hover:bg-rose-100'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
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

      {/* 6. GRÁFICO COMPARATIVO SIMPLES POR TURNO */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-950 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-slate-900" />
              <span>Frequência das Turmas — Meta da LDB</span>
            </h3>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              Colunas verdes indicam presença acima de 85%; colunas vermelhas indicam turmas abaixo da meta de 75%.
            </p>
          </div>

          <div className="inline-flex items-center p-1.5 bg-slate-100 rounded-2xl text-sm font-bold self-start sm:self-auto gap-1">
            <button
              type="button"
              onClick={() => setChartFilterShift('all')}
              className={`px-4 py-2 rounded-xl transition-colors cursor-pointer ${
                chartFilterShift === 'all'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              Todas (40)
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('MANHÃ')}
              className={`px-4 py-2 rounded-xl transition-colors cursor-pointer ${
                chartFilterShift === 'MANHÃ'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              Manhã (20)
            </button>
            <button
              type="button"
              onClick={() => setChartFilterShift('TARDE')}
              className={`px-4 py-2 rounded-xl transition-colors cursor-pointer ${
                chartFilterShift === 'TARDE'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-800 hover:bg-slate-200'
              }`}
            >
              Tarde (20)
            </button>
          </div>
        </div>

        <div className="w-full h-[240px] sm:h-[270px] pt-2">
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
                tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 700 }}
              />
              <YAxis
                domain={[50, 100]}
                tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 700 }}
                unit="%"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-950 text-white px-4 py-3 rounded-2xl text-xs shadow-lg space-y-1 border border-slate-800">
                        <div className="font-bold text-white text-sm">{data.name}</div>
                        <div className="text-slate-200 font-semibold">Turno: {data.shift}</div>
                        <div className="text-emerald-400 font-bold font-mono tabular-nums text-sm">
                          Frequência: {data.presence}%
                        </div>
                        <div className="text-slate-300 text-xs font-medium">
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
                stroke="#b91c1c"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: 'Meta MEC 75%',
                  fill: '#b91c1c',
                  fontSize: 11,
                  fontWeight: 800,
                  position: 'insideTopLeft',
                }}
              />
              <Bar dataKey="presence" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => {
                  let barColor = '#047857';
                  if (entry.presence < 75) barColor = '#b91c1c';
                  else if (entry.presence < 85) barColor = '#b45309';
                  return <Cell key={`cell-${entry.id}`} fill={barColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between text-xs sm:text-sm text-slate-800 pt-4 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-2 font-bold text-emerald-950">
              <span className="w-3 h-3 rounded-xs bg-emerald-700" />
              ≥ 85% (Frequência Alta)
            </span>
            <span className="flex items-center gap-2 font-bold text-amber-950">
              <span className="w-3 h-3 rounded-xs bg-amber-600" />
              75% a 84% (Atenção)
            </span>
            <span className="flex items-center gap-2 font-bold text-rose-950">
              <span className="w-3 h-3 rounded-xs bg-rose-700" />
              &lt; 75% (Abaixo da Meta)
            </span>
          </div>
          <span className="font-bold text-slate-900">
            {chartData.length} turmas apuradas
          </span>
        </div>
      </section>
    </div>
  );
};
