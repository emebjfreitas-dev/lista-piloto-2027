import React, { useMemo, useState } from 'react';
import {
  AuthorizedUser,
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
  BarChart3,
  Bell,
  Clock,
  ShieldAlert,
  Search,
  Sun,
  Sunset,
  ChevronRight,
  HeartHandshake,
  CalendarDays,
  Database,
  FileCode2,
  ShieldCheck,
  Images,
  FileText,
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
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  userName?: string;
  userEmail?: string;
  classes: ClassGroup[];
  assignedClassId: string;
  assignedClassIds?: string[];
  schoolNotices?: SchoolNotice[];
  attendanceWindowConfig: AttendanceWindowConfig;
  onNavigateToScreen: (screen: ScreenType) => void;
  onSelectClassForDetails?: (cls: ClassGroup) => void;
  onSelectClassForMonthlyAttendance: (cls: ClassGroup) => void;
  onSelectStudentForConsecutiveScreen?: (classId: string, studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student, className: string) => void;
  onSaveSchoolNotices?: (updatedNotices: SchoolNotice[]) => void;
  onNavigateToAcessos?: () => void;
  onOpenAdminPhotosModal?: () => void;
  onOpenAdminPdfsModal?: () => void;
}

interface QuickActionItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentBg: string;
  accentText: string;
  onClick: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userRole,
  teacherRoleType,
  userName = 'Educador(a)',
  userEmail,
  classes = [],
  assignedClassId,
  assignedClassIds = [],
  schoolNotices = [],
  attendanceWindowConfig,
  onNavigateToScreen,
  onSelectClassForDetails,
  onSelectClassForMonthlyAttendance,
  onSelectStudentForConsecutiveScreen,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onSaveSchoolNotices,
  onNavigateToAcessos,
  onOpenAdminPhotosModal,
  onOpenAdminPdfsModal,
}) => {
  const isStrictAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';
  const canLaunchAttendance =
    isStrictAdmin || userRole === 'usuario';

  const [selectedShiftFilter, setSelectedShiftFilter] = useState<'TODOS' | 'MANHÃ' | 'TARDE'>('TODOS');
  const [turmaSearchInput, setTurmaSearchInput] = useState('');
  const [showAllClassesGrid, setShowAllClassesGrid] = useState(false);
  const [activeHubTab, setActiveHubTab] = useState<'avisos' | 'prazos' | 'busca_ativa'>('avisos');
  const [chartFilterShift, setChartFilterShift] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');

  const referencePeriod = useMemo(() => getDefaultReferencePeriod(new Date()), []);
  const windowEval = useMemo(
    () => evaluateAttendanceLaunchWindow(attendanceWindowConfig),
    [attendanceWindowConfig]
  );

  const visibleBaseClasses = useMemo(() => {
    if (userRole !== 'usuario') return classes;
    const allowedIds =
      assignedClassIds.length > 0 ? assignedClassIds : assignedClassId ? [assignedClassId] : [];
    const matched = classes.filter((c) => allowedIds.includes(c.id));
    return matched.length > 0 ? matched : classes.slice(0, 1);
  }, [classes, userRole, assignedClassId, assignedClassIds]);

  const schoolStats = useMemo(() => {
    let totalStudents = 0;
    let activeStudents = 0;
    let aeeCount = 0;
    let sumPresence = 0;
    let countedClasses = 0;
    let criticalConsecutiveCount = 0;
    let morningCount = 0;
    let afternoonCount = 0;

    visibleBaseClasses.forEach((cls) => {
      totalStudents += cls.students.length;
      if (typeof cls.presenceRate === 'number' && cls.presenceRate > 0) {
        sumPresence += cls.presenceRate;
        countedClasses++;
      }

      cls.students.forEach((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        const isMoved =
          sit.includes('BXTR') || sit.includes('TRANSF') || sit.includes('REMAN') || sit.includes('RM');
        if (!isMoved) {
          activeStudents++;
          if ((s.deficiencia || '').trim().length > 0) aeeCount++;
        }
        if (s.consecutiveAbsenceAlert?.active) {
          criticalConsecutiveCount++;
        }
      });

      const isMorning =
        (cls.shift || '').toUpperCase().includes('MANHÃ') || cls.periodo === 'MANHÃ';
      if (isMorning) morningCount++;
      else afternoonCount++;
    });

    const avgPresence = countedClasses > 0 ? Math.round(sumPresence / countedClasses) : 95;

    return {
      totalClasses: visibleBaseClasses.length,
      morningCount,
      afternoonCount,
      totalStudents,
      activeStudents,
      aeeCount,
      avgPresence,
      criticalConsecutiveCount,
    };
  }, [visibleBaseClasses]);

  const filteredClasses = useMemo(() => {
    let list = visibleBaseClasses;
    if (selectedShiftFilter === 'MANHÃ') {
      list = list.filter(
        (c) => (c.shift || '').toUpperCase().includes('MANHÃ') || c.periodo === 'MANHÃ'
      );
    } else if (selectedShiftFilter === 'TARDE') {
      list = list.filter(
        (c) => (c.shift || '').toUpperCase().includes('TARDE') || c.periodo === 'TARDE'
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
  }, [visibleBaseClasses, selectedShiftFilter, turmaSearchInput]);

  const isSearchingOrFiltering =
    selectedShiftFilter !== 'TODOS' || turmaSearchInput.trim().length > 0;
  const displayedClasses =
    showAllClassesGrid || isSearchingOrFiltering
      ? filteredClasses
      : filteredClasses.slice(0, 12);

  const chartData = useMemo(() => {
    const filtered = visibleBaseClasses.filter((c) => {
      if (chartFilterShift === 'all') return true;
      return (c.shift || '').toUpperCase().includes(chartFilterShift);
    });

    return filtered.map((c) => ({
      id: c.id,
      name: c.name,
      presence: typeof c.presenceRate === 'number' && c.presenceRate > 0 ? c.presenceRate : 92,
      studentsCount: c.students.length,
      shift: c.shift || 'Integral',
    }));
  }, [visibleBaseClasses, chartFilterShift]);

  const todayFormatted = useMemo(() => {
    try {
      const str = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return 'Hoje';
    }
  }, []);

  const formattedGreetingName = useMemo(() => {
    if (!userName) return 'Educador(a)';
    const trimmed = userName.trim();
    if (
      trimmed.includes('EMEB Professor Joaquim Candelário') ||
      trimmed.includes('Direção / Admin') ||
      trimmed.includes('Direção') ||
      trimmed.startsWith('EMEB')
    ) {
      return 'Equipe Gestora';
    }
    const clean = trimmed.replace(/\s*\(.*?\)\s*/g, '').trim();
    return clean || 'Educador(a)';
  }, [userName]);

  const roleLabel = isStrictAdmin
    ? 'Direção / Administração'
    : teacherRoleType === 'aee'
    ? 'Educação Especial (AEE)'
    : teacherRoleType === 'apoio'
    ? 'Apoio Pedagógico'
    : userRole === 'peb2'
    ? 'Especialista PEB II'
    : 'Regente PEB I';

  // Ações essenciais estritamente filtradas pelo perfil (nunca expõe ferramentas Admin para PEB I, PEB II ou AEE)
  const quickActions = useMemo<QuickActionItem[]>(() => {
    const items: QuickActionItem[] = [
      {
        id: 'turmas',
        title: userRole === 'usuario' ? 'Minha Turma e Alunos' : 'Turmas e Estudantes',
        subtitle: `${schoolStats.totalClasses} turma(s) · ${schoolStats.activeStudents} ativos`,
        icon: <Users className="w-6 h-6" />,
        accentBg: 'bg-[#111827]',
        accentText: 'text-white',
        onClick: () => onNavigateToScreen('turmas'),
      },
    ];

    if (canLaunchAttendance) {
      items.push({
        id: 'frequencia_mensal',
        title: 'Informar Faltas do Mês',
        subtitle: `${referencePeriod.monthName}/${referencePeriod.year} · ${
          windowEval.isAllowedToLaunch ? 'Janela aberta' : 'Consultar prazo'
        }`,
        icon: <CalendarCheck className="w-6 h-6" />,
        accentBg: 'bg-[#047857]',
        accentText: 'text-white',
        onClick: () => onNavigateToScreen('frequencia_mensal'),
      });
    }

    items.push({
      id: 'faltas_consecutivas',
      title: 'Busca Ativa (ECA)',
      subtitle: `${schoolStats.criticalConsecutiveCount} caso(s) em atenção`,
      icon: <AlertTriangle className="w-6 h-6" />,
      accentBg: 'bg-[#be123c]',
      accentText: 'text-white',
      onClick: () => onNavigateToScreen('faltas_consecutivas'),
    });

    if (isStrictAdmin) {
      items.push(
        {
          id: 'diagnostico_bd',
          title: 'Diagnóstico do Banco',
          subtitle: 'Auditoria de consistência, RAs e sincronia',
          icon: <Database className="w-6 h-6" />,
          accentBg: 'bg-[#1a4fa3]',
          accentText: 'text-white',
          onClick: () => onNavigateToScreen('diagnostico_bd'),
        },
        {
          id: 'importar_deficiencias_htm',
          title: 'Subir Deficiências (.HTM)',
          subtitle: `${schoolStats.aeeCount} estudante(s) AEE vinculados`,
          icon: <FileCode2 className="w-6 h-6" />,
          accentBg: 'bg-[#0f766e]',
          accentText: 'text-white',
          onClick: () => onNavigateToScreen('importar_deficiencias_htm'),
        },
        {
          id: 'resumo',
          title: 'Resumo Mensal e Mapa',
          subtitle: 'Frequência consolidada por dia e turma',
          icon: <BarChart3 className="w-6 h-6" />,
          accentBg: 'bg-[#f2f2f7]',
          accentText: 'text-[#111827]',
          onClick: () => onNavigateToScreen('resumo'),
        },
        {
          id: 'usuarios_acesso',
          title: 'Acessos e Docentes',
          subtitle: 'Contas, turmas e permissões RBAC',
          icon: <ShieldCheck className="w-6 h-6" />,
          accentBg: 'bg-[#f2f2f7]',
          accentText: 'text-[#111827]',
          onClick: () => onNavigateToScreen('usuarios_acesso'),
        },
        {
          id: 'bolsa_familia',
          title: 'Bolsa Família & Fretado',
          subtitle: 'Acompanhamento bimestral e transporte',
          icon: <HeartHandshake className="w-6 h-6" />,
          accentBg: 'bg-[#f2f2f7]',
          accentText: 'text-[#111827]',
          onClick: () => onNavigateToScreen('bolsa_familia'),
        },
        {
          id: 'dias_letivos',
          title: '200 Dias Letivos',
          subtitle: 'Calendário oficial e feriados 2027',
          icon: <CalendarDays className="w-6 h-6" />,
          accentBg: 'bg-[#f2f2f7]',
          accentText: 'text-[#111827]',
          onClick: () => onNavigateToScreen('dias_letivos'),
        }
      );
    } else {
      items.push(
        {
          id: 'mapa_estudantes',
          title: 'Mapa de Estudantes',
          subtitle: 'Distribuição territorial escolar',
          icon: <MapPin className="w-6 h-6" />,
          accentBg: 'bg-[#f2f2f7]',
          accentText: 'text-[#111827]',
          onClick: () => onNavigateToScreen('mapa_estudantes'),
        },
        {
          id: 'avisos',
          title: 'Quadro de Avisos',
          subtitle: `${schoolNotices.length} comunicado(s) ativo(s)`,
          icon: <Bell className="w-6 h-6" />,
          accentBg: 'bg-[#f2f2f7]',
          accentText: 'text-[#111827]',
          onClick: () => {
            setActiveHubTab('avisos');
            document.getElementById('central-comunicados')?.scrollIntoView({ behavior: 'smooth' });
          },
        }
      );
    }

    return items;
  }, [
    userRole,
    isStrictAdmin,
    canLaunchAttendance,
    schoolStats,
    referencePeriod,
    windowEval.isAllowedToLaunch,
    schoolNotices.length,
    onNavigateToScreen,
  ]);

  return (
    <div className="flex flex-col w-full min-w-0 max-w-[1600px] mx-auto space-y-5 pb-20 text-[#111827] animate-gentle-fade">
      {/* 1. CABEÇALHO LIMPO + INDICADORES ESSENCIAIS */}
      <section className="bg-white rounded-3xl p-5 sm:p-7 shadow-xs space-y-5 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs sm:text-[13px] font-bold text-[#0052cc] text-balance break-words">
              EMEB Prof. Joaquim Candelário de Freitas · Ano Letivo 2027
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 text-balance break-words">
              Olá, {formattedGreetingName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-600 break-words">
              <span className="font-semibold text-slate-900">{roleLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{todayFormatted}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto min-w-0 shrink-0">
            {canLaunchAttendance ? (
              <button
                type="button"
                onClick={() => onNavigateToScreen('frequencia_mensal')}
                className="w-full sm:w-auto min-h-[48px] py-2.5 px-6 rounded-2xl bg-[#047857] hover:bg-[#065f46] text-white text-sm font-bold inline-flex items-center justify-center text-center whitespace-normal gap-2.5 cursor-pointer transition-colors duration-100 shadow-xs"
              >
                <CalendarCheck className="w-5 h-5 shrink-0" />
                <span>Informar Faltas · {referencePeriod.monthName}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateToScreen('turmas')}
                className="w-full sm:w-auto min-h-[48px] py-2.5 px-6 rounded-2xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white text-sm font-bold inline-flex items-center justify-center text-center whitespace-normal gap-2.5 cursor-pointer transition-colors duration-100 shadow-xs"
              >
                <Users className="w-5 h-5 shrink-0" />
                <span>Ver Turmas ({schoolStats.totalClasses})</span>
              </button>
            )}
          </div>
        </div>

        {/* Faixa Unificada de KPIs Reais */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 min-w-0">
          <div className="p-4 sm:p-5 rounded-2xl bg-[#f3f6fb] min-w-0 break-words">
            <span className="text-xs sm:text-[13px] font-semibold text-slate-600 block">Estudantes Ativos</span>
            <span className="text-2xl sm:text-3xl font-bold text-slate-950 tabular-nums block mt-1">
              {schoolStats.activeStudents}
            </span>
            <span className="text-xs text-slate-600 font-medium tabular-nums block mt-1">
              {schoolStats.aeeCount} em AEE
            </span>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#f3f6fb] min-w-0 break-words">
            <span className="text-xs sm:text-[13px] font-semibold text-slate-600 block">Turmas</span>
            <span className="text-2xl sm:text-3xl font-bold text-slate-950 tabular-nums block mt-1">
              {schoolStats.totalClasses}
            </span>
            <span className="text-xs text-slate-600 font-medium tabular-nums block mt-1">
              {schoolStats.morningCount} manhã · {schoolStats.afternoonCount} tarde
            </span>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 min-w-0 break-words">
            <span className="text-xs sm:text-[13px] font-semibold text-[#047857] block">Presença Média</span>
            <span className="text-2xl sm:text-3xl font-bold text-[#047857] tabular-nums block mt-1">
              {schoolStats.avgPresence}%
            </span>
            <span className="text-xs text-emerald-900/80 font-medium block mt-1">Meta MEC ≥ 75%</span>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="text-left p-4 sm:p-5 rounded-2xl bg-rose-50 hover:bg-rose-100 cursor-pointer transition-colors duration-100 min-w-0 break-words"
          >
            <span className="text-xs sm:text-[13px] font-semibold text-[#be123c] block">Busca Ativa (ECA)</span>
            <span className="text-2xl sm:text-3xl font-bold text-[#be123c] tabular-nums block mt-1">
              {schoolStats.criticalConsecutiveCount}
            </span>
            <span className="text-xs text-rose-900 font-medium block mt-1">Casos em atenção</span>
          </button>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#e8f0fe] col-span-2 sm:col-span-1 min-w-0 break-words">
            <span className="text-xs sm:text-[13px] font-semibold text-[#0b3b8c] block">Referência</span>
            <span className="text-lg sm:text-xl font-bold text-slate-950 block mt-1 break-words leading-snug">
              {referencePeriod.monthName} / {referencePeriod.year}
            </span>
            <span
              className={`text-xs font-bold block mt-1 ${
                windowEval.isAllowedToLaunch ? 'text-[#047857]' : 'text-slate-600'
              }`}
            >
              {windowEval.isAllowedToLaunch ? 'Janela de lançamento aberta' : 'Consulta disponível'}
            </span>
          </div>
        </div>
      </section>

      {/* 2. ACESSO RÁPIDO (SEM PILLS, SEM CLUTTER, COM FERRAMENTAS ESSENCIAIS POR PERFIL) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 px-1">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#111827]">
              Acesso Rápido
            </h2>
            <p className="text-xs sm:text-sm text-[#48484a]">
              Ferramentas principais para {isStrictAdmin ? 'gestão escolar' : 'rotina docente'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 min-w-0">
          {quickActions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="w-full min-w-0 min-h-[82px] text-left bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 active:scale-[0.99] rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-100 cursor-pointer flex items-center justify-between gap-3.5 group"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div
                  className={`w-12 h-12 rounded-2xl ${item.accentBg} ${item.accentText} flex items-center justify-center shrink-0`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-[17px] font-bold text-slate-950 break-words leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-600 break-words leading-snug mt-0.5">{item.subtitle}</p>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-[#0b3b8c] group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>

        {/* Atalhos Compactos de Importação em Lote (Exclusivo Admin) */}
        {isStrictAdmin && (onOpenAdminPhotosModal || onOpenAdminPdfsModal) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1 min-w-0">
            {onOpenAdminPhotosModal && (
              <button
                type="button"
                onClick={onOpenAdminPhotosModal}
                className="w-full min-w-0 min-h-[78px] text-left bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors duration-100 cursor-pointer flex items-center justify-between gap-3.5 group"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-[#0b3b8c] flex items-center justify-center shrink-0">
                    <Images className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm sm:text-base font-bold text-slate-950 break-words leading-snug">
                      Enviar Fotos em Lote (Arraste e Solte)
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-600 break-words leading-snug mt-0.5">
                      Vincular fotos por RA, Nome ou Turma
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-[#0b3b8c] shrink-0" />
              </button>
            )}

            {onOpenAdminPdfsModal && (
              <button
                type="button"
                onClick={onOpenAdminPdfsModal}
                className="w-full min-w-0 min-h-[78px] text-left bg-white hover:bg-rose-50/40 border border-slate-200 hover:border-rose-300 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors duration-100 cursor-pointer flex items-center justify-between gap-3.5 group"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-[#be123c] flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm sm:text-base font-bold text-slate-950 break-words leading-snug">
                      Enviar Fichas Informativas em Lote (Arraste e Solte)
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-600 break-words leading-snug mt-0.5">
                      Vincular Ficha Informativa do Estudante por RA, Nome ou Turma + Nº
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-[#be123c] shrink-0" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. SELETOR DIRETO DE TURMAS */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-950 break-words">
              Turmas da Escola ({filteredClasses.length})
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5 break-words">
              Toque em uma turma para abrir a lista nominal, chamadas e Fichas Informativas
            </p>
          </div>

          {visibleBaseClasses.length > 1 && (
            <div className="flex flex-wrap sm:inline-flex w-full sm:w-auto max-w-full min-w-0 p-1.5 bg-slate-100 border border-slate-200 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setSelectedShiftFilter('TODOS')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold inline-flex items-center justify-center text-center whitespace-normal transition-colors duration-100 cursor-pointer ${
                  selectedShiftFilter === 'TODOS'
                    ? 'bg-[#0b3b8c] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                Todas ({schoolStats.totalClasses})
              </button>
              <button
                type="button"
                onClick={() => setSelectedShiftFilter('MANHÃ')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold inline-flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                  selectedShiftFilter === 'MANHÃ'
                    ? 'bg-[#0b3b8c] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Manhã ({schoolStats.morningCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedShiftFilter('TARDE')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold inline-flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                  selectedShiftFilter === 'TARDE'
                    ? 'bg-[#0b3b8c] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <Sunset className="w-4 h-4 text-sky-500 shrink-0" />
                <span>Tarde ({schoolStats.afternoonCount})</span>
              </button>
            </div>
          )}
        </div>

        {visibleBaseClasses.length > 3 && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={turmaSearchInput}
              onChange={(e) => setTurmaSearchInput(e.target.value)}
              placeholder="Buscar turma ou professora (ex: G4 A, 1º B, 5º A)..."
              className="w-full min-h-[46px] pl-11 pr-4 rounded-xl bg-slate-100 focus:bg-slate-200/70 text-sm sm:text-[15px] text-slate-950 placeholder:text-slate-600 focus:outline-none transition-colors duration-100"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 min-w-0">
          {displayedClasses.map((cls) => {
            const isMorning =
              (cls.shift || '').toUpperCase().includes('MANHÃ') || cls.periodo === 'MANHÃ';

            return (
              <button
                key={cls.id}
                type="button"
                onClick={() =>
                  onSelectClassForDetails
                    ? onSelectClassForDetails(cls)
                    : onNavigateToScreen('detalhes')
                }
                className="w-full min-w-0 min-h-[120px] text-left bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 active:scale-[0.99] rounded-2xl p-4 sm:p-5 transition-all duration-100 flex flex-col justify-between gap-2.5 cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2 w-full min-w-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-[17px] font-bold text-slate-950 leading-snug break-words">
                      {cls.name}
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-600 break-words leading-snug mt-0.5">
                      {isMorning ? 'Manhã' : 'Tarde'} · {cls.room || '—'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <span className="font-mono text-xs sm:text-[13px] font-bold text-[#047857] tabular-nums">
                      {cls.presenceRate}%
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#0b3b8c] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>

                <div className="w-full space-y-0.5 pt-0.5 min-w-0">
                  <p className="text-xs sm:text-[13px] text-slate-800 font-semibold break-words leading-snug">
                    {cls.teacherName || 'Professor(a) atribuído'}
                  </p>
                  <p className="text-xs text-slate-600 font-medium tabular-nums">
                    {cls.students.length} estudantes
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {!isSearchingOrFiltering && filteredClasses.length > 12 && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setShowAllClassesGrid((prev) => !prev)}
              className="min-h-[44px] px-6 rounded-2xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-xs sm:text-sm font-semibold text-[#111827] cursor-pointer transition-colors duration-100"
            >
              {showAllClassesGrid
                ? 'Mostrar menos turmas'
                : `Exibir todas as ${filteredClasses.length} turmas`}
            </button>
          </div>
        )}

        {filteredClasses.length === 0 && (
          <div className="p-8 text-center bg-[#f2f2f7] rounded-2xl space-y-1">
            <p className="text-sm font-semibold text-[#111827]">
              Nenhuma turma encontrada com esse termo.
            </p>
            <p className="text-xs text-[#48484a]">
              Tente buscar por &ldquo;G4&rdquo;, &ldquo;1º&rdquo;, &ldquo;Manhã&rdquo; ou limpe a busca.
            </p>
          </div>
        )}
      </section>

      {/* 4. CENTRAL DE AVISOS, PRAZOS E BUSCA ATIVA */}
      <section
        id="central-comunicados"
        className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-5 min-w-0"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#111827] break-words">
              Central de Informações e Prazos
            </h2>
            <p className="text-xs sm:text-sm text-[#48484a] mt-0.5 break-words">
              Recados da coordenação, calendário de chamada e casos de busca ativa
            </p>
          </div>

          <div className="flex flex-wrap sm:inline-flex w-full sm:w-auto max-w-full min-w-0 p-1.5 bg-[#f2f2f7] rounded-2xl text-xs sm:text-[13px] font-semibold gap-1">
            <button
              type="button"
              onClick={() => setActiveHubTab('avisos')}
              className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl inline-flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                activeHubTab === 'avisos'
                  ? 'bg-[#111827] text-white'
                  : 'text-[#374151] hover:bg-[#e5e5ea]'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>Avisos ({schoolNotices.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('prazos')}
              className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl inline-flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                activeHubTab === 'prazos'
                  ? 'bg-[#111827] text-white'
                  : 'text-[#374151] hover:bg-[#e5e5ea]'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>Prazos do Mês</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveHubTab('busca_ativa')}
              className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl inline-flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                activeHubTab === 'busca_ativa'
                  ? 'bg-[#be123c] text-white'
                  : 'text-[#991b1b] hover:bg-[#fee2e2]'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
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
            userEmail={userEmail}
            userName={userName}
            classes={classes}
            assignedClassId={assignedClassId}
            assignedClassIds={assignedClassIds}
            onOpenMonthlyAttendance={onSelectClassForMonthlyAttendance}
            onNavigateToAcessos={isStrictAdmin ? onNavigateToAcessos : undefined}
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
              onOpenStudentGrid ? (student) => onOpenStudentGrid(student) : undefined
            }
            onOpenStudentPdf={
              onOpenStudentPdf ? (student, className) => onOpenStudentPdf(student, className) : undefined
            }
          />
        )}
      </section>

      {/* 5. GRÁFICO COMPARATIVO POR TURMA */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#111827] flex flex-wrap items-center gap-2 min-w-0 break-words">
              <BarChart3 className="w-5 h-5 text-[#111827] shrink-0" />
              <span>Frequência das Turmas — Meta LDB</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#48484a] mt-0.5 break-words">
              Comparativo por turma com referência mínima de 75%
            </p>
          </div>

          {visibleBaseClasses.length > 1 && (
            <div className="flex flex-wrap sm:inline-flex w-full sm:w-auto max-w-full min-w-0 p-1.5 bg-[#f2f2f7] rounded-2xl text-xs sm:text-[13px] font-semibold gap-1">
              <button
                type="button"
                onClick={() => setChartFilterShift('all')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-1.5 rounded-xl text-center whitespace-normal transition-colors duration-100 cursor-pointer ${
                  chartFilterShift === 'all'
                    ? 'bg-[#111827] text-white'
                    : 'text-[#374151] hover:bg-[#e5e5ea]'
                }`}
              >
                Todas ({schoolStats.totalClasses})
              </button>
              <button
                type="button"
                onClick={() => setChartFilterShift('MANHÃ')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-1.5 rounded-xl text-center whitespace-normal transition-colors duration-100 cursor-pointer ${
                  chartFilterShift === 'MANHÃ'
                    ? 'bg-[#111827] text-white'
                    : 'text-[#374151] hover:bg-[#e5e5ea]'
                }`}
              >
                Manhã ({schoolStats.morningCount})
              </button>
              <button
                type="button"
                onClick={() => setChartFilterShift('TARDE')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-1.5 rounded-xl text-center whitespace-normal transition-colors duration-100 cursor-pointer ${
                  chartFilterShift === 'TARDE'
                    ? 'bg-[#111827] text-white'
                    : 'text-[#374151] hover:bg-[#e5e5ea]'
                }`}
              >
                Tarde ({schoolStats.afternoonCount})
              </button>
            </div>
          )}
        </div>

        <div className="w-full h-[260px] sm:h-[300px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 12, right: 12, left: -18, bottom: 26 }}
            >
              <XAxis
                dataKey="name"
                interval={0}
                angle={-40}
                textAnchor="end"
                height={48}
                tick={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
              />
              <YAxis
                domain={[50, 100]}
                tick={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
                unit="%"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#111827] text-white px-4 py-3 rounded-2xl text-xs sm:text-[13px] shadow-xl space-y-0.5">
                        <div className="font-semibold text-white">{data.name}</div>
                        <div className="text-white/75">{data.shift}</div>
                        <div className="text-[#34d399] font-semibold tabular-nums">
                          Frequência: {data.presence}%
                        </div>
                        <div className="text-white/70 tabular-nums">
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
                stroke="#b91c1c"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: 'Meta 75%',
                  fill: '#b91c1c',
                  fontSize: 11,
                  fontWeight: 700,
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

        <div className="flex flex-wrap items-center justify-between text-xs text-[#374151] pt-2 gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#047857] shrink-0" />
              ≥ 85% (Regular)
            </span>
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#b45309] shrink-0" />
              75% a 84% (Atenção)
            </span>
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#b91c1c] shrink-0" />
              &lt; 75% (Abaixo da Meta)
            </span>
          </div>
          <span className="font-semibold text-[#111827] tabular-nums">
            {chartData.length} turma(s)
          </span>
        </div>
      </section>
    </div>
  );
};
