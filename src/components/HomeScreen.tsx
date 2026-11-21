import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AuthorizedUser,
  ClassGroup,
  Student,
  UserRole,
  SchoolNotice,
  AttendanceWindowConfig,
  ScreenType,
} from '../types';
import {
  evaluateAttendanceLaunchWindow,
  getStoredOfficialCalendarConfig,
} from '../services/db';
import { getDefaultReferencePeriod } from '../utils/attendanceRules';
import { QuadroAvisosDirecao } from './QuadroAvisosDirecao';
import { LembretePrazoFrequenciaCard } from './LembretePrazoFrequenciaCard';
import { ResumoFaltasCriticasCard } from './ResumoFaltasCriticasCard';
import { PaginationBar } from './ui/PaginationBar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  CalendarCheck,
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
  ShieldCheck,
  ArrowUpDown,
  FileWarning,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
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
  onMarkNoticeRead?: (
    noticeIds: string[],
    reader: { userEmail: string; userName: string; userRole?: string }
  ) => void;
  onNavigateToAcessos?: () => void;
  onOpenClassPendingFichas?: (cls: ClassGroup) => void;
  onOpenSpotlightSearch?: () => void;
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
  onMarkNoticeRead,
  onNavigateToAcessos,
  onOpenClassPendingFichas,
  onOpenSpotlightSearch,
}) => {
  const isStrictAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';
  const canLaunchAttendance =
    isStrictAdmin || userRole === 'usuario';

  const [selectedShiftFilter, setSelectedShiftFilter] = useState<'TODOS' | 'MANHÃ' | 'TARDE'>('TODOS');
  const [turmaSearchInput, setTurmaSearchInput] = useState('');
  const [classesPage, setClassesPage] = useState(1);
  const classesSectionRef = useRef<HTMLElement | null>(null);
  const HOME_CLASSES_PAGE_SIZE = 8;
  const [activeHubTab, setActiveHubTab] = useState<'prazos' | 'busca_ativa'>('prazos');
  const [chartFilterShift, setChartFilterShift] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');
  const [chartSortMode, setChartSortMode] = useState<'default' | 'asc'>('default');
  const [showAllMissingFichasClasses, setShowAllMissingFichasClasses] = useState(false);
  const [copiedFamilyFichaPrompt, setCopiedFamilyFichaPrompt] = useState(false);

  const referencePeriod = useMemo(() => getDefaultReferencePeriod(new Date()), []);
  const activeSchoolYear = useMemo(
    () => getStoredOfficialCalendarConfig().year || referencePeriod.year || 2027,
    [referencePeriod.year]
  );
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

    const avgPresence = countedClasses > 0 ? Math.round(sumPresence / countedClasses) : 0;

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

  // Levantamento de estudantes ativos ainda sem Ficha Informativa preenchida/anexada
  const missingFichasSummary = useMemo(() => {
    const classesWithMissing: Array<{
      classGroup: ClassGroup;
      missingStudents: Student[];
    }> = [];
    let totalMissing = 0;

    visibleBaseClasses.forEach((cls) => {
      const missingStudents = cls.students.filter((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        const isMoved =
          sit.includes('BXTR') || sit.includes('TRANSF') || sit.includes('REMAN') || sit.includes('RM');
        if (isMoved) return false;
        const hasFicha = Boolean(
          (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
            (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
        );
        return !hasFicha;
      });
      if (missingStudents.length > 0) {
        totalMissing += missingStudents.length;
        classesWithMissing.push({
          classGroup: cls,
          missingStudents: [...missingStudents].sort((a, b) => a.number - b.number),
        });
      }
    });

    return {
      totalMissing,
      classesWithMissing,
      firstPendingClass: classesWithMissing[0]?.classGroup || visibleBaseClasses[0],
    };
  }, [visibleBaseClasses]);

  const handleCopyFamilyFichaRequest = async () => {
    const message =
      'Prezados responsáveis, solicitamos a gentileza de preencher e encaminhar a Ficha Informativa do(a) estudante para atualização do prontuário escolar na EMEB Prof. Joaquim Candelário de Freitas. Contamos com a colaboração da família!';
    try {
      await navigator.clipboard.writeText(message);
      setCopiedFamilyFichaPrompt(true);
      toast.success('Recado copiado! Basta repassar no WhatsApp ou bilhete das famílias.');
      window.setTimeout(() => setCopiedFamilyFichaPrompt(false), 3000);
    } catch {
      toast.info(message);
    }
  };

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

  useEffect(() => {
    setClassesPage(1);
  }, [selectedShiftFilter, turmaSearchInput]);

  const totalClassesPages = Math.max(1, Math.ceil(filteredClasses.length / HOME_CLASSES_PAGE_SIZE));
  const safeClassesPage = Math.min(classesPage, totalClassesPages);
  const displayedClasses = useMemo(() => {
    const start = (safeClassesPage - 1) * HOME_CLASSES_PAGE_SIZE;
    return filteredClasses.slice(start, start + HOME_CLASSES_PAGE_SIZE);
  }, [filteredClasses, safeClassesPage]);

  const chartData = useMemo(() => {
    const filtered = visibleBaseClasses.filter((c) => {
      if (chartFilterShift === 'all') return true;
      return (c.shift || '').toUpperCase().includes(chartFilterShift);
    });

    const mapped = filtered.map((c) => {
      const compactLabel =
        c.turmaAbrev ||
        c.name
          .replace(/GRUPO\s*0?(\d)\s*/i, 'G$1')
          .replace(/(\d+º)\s*ANO\s*/i, '$1')
          .replace(/\s+/g, '');
      const presenceVal =
        c.students.length === 0
          ? 0
          : typeof c.presenceRate === 'number' && !Number.isNaN(c.presenceRate)
          ? Math.max(0, Math.min(100, Math.round(c.presenceRate)))
          : 0;
      return {
        id: c.id,
        classRef: c,
        name: c.name,
        shortName: compactLabel,
        presence: presenceVal,
        studentsCount: c.students.length,
        shift: c.shift || 'Integral',
        teacherName: c.teacherName || 'Regente atribuído',
      };
    });

    if (chartSortMode === 'asc') {
      return [...mapped].sort((a, b) => a.presence - b.presence);
    }
    return mapped;
  }, [visibleBaseClasses, chartFilterShift, chartSortMode]);

  const chartBandSummary = useMemo(() => {
    if (chartData.length === 0) {
      return { avg: 0, regular: 0, attention: 0, below: 0 };
    }
    let sum = 0;
    let regular = 0;
    let attention = 0;
    let below = 0;
    chartData.forEach((d) => {
      sum += d.presence;
      if (d.presence < 75) below++;
      else if (d.presence < 85) attention++;
      else regular++;
    });
    return {
      avg: Math.round(sum / chartData.length),
      regular,
      attention,
      below,
    };
  }, [chartData]);

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
    ? 'Equipe Administrativa'
    : teacherRoleType === 'aee'
    ? 'Educação Especial (AEE)'
    : teacherRoleType === 'apoio'
    ? 'Apoio Pedagógico'
    : userRole === 'peb2'
    ? 'Especialista PEB II'
    : 'Regente PEB I';

  const primaryTeacherClass = visibleBaseClasses[0];

  // Ações essenciais estritamente filtradas pelo perfil com ícones minimalistas estilo Apple SF
  const quickActions = useMemo<QuickActionItem[]>(() => {
    const items: QuickActionItem[] = [
      {
        id: 'turmas',
        title: userRole === 'usuario' ? 'Minha Turma e Alunos' : 'Turmas e Estudantes',
        subtitle:
          userRole === 'usuario' && primaryTeacherClass
            ? `${primaryTeacherClass.name} · ${schoolStats.activeStudents} estudantes`
            : `${schoolStats.totalClasses} turma(s) · ${schoolStats.activeStudents} ativos`,
        icon: <Users className="w-5 h-5 stroke-[1.5]" />,
        accentBg: 'bg-slate-100',
        accentText: 'text-slate-700',
        onClick: () =>
          userRole === 'usuario'
            ? onNavigateToScreen('detalhes')
            : onNavigateToScreen('turmas'),
      },
    ];

    if (canLaunchAttendance) {
      items.push({
        id: 'frequencia_mensal',
        title: 'Informar faltas do mês…',
        subtitle: `${referencePeriod.monthName}/${referencePeriod.year} · ${
          windowEval.isAllowedToLaunch ? 'Janela aberta' : 'Consultar prazo'
        }`,
        icon: <CalendarCheck className="w-5 h-5 stroke-[1.5]" />,
        accentBg: 'bg-emerald-500/12',
        accentText: 'text-emerald-700',
        onClick: () => onNavigateToScreen('frequencia_mensal'),
      });
    }

    items.push({
      id: 'faltas_consecutivas',
      title: 'Busca Ativa (ECA)',
      subtitle: `${schoolStats.criticalConsecutiveCount} caso(s) em atenção`,
      icon: <AlertTriangle className="w-5 h-5 stroke-[1.5]" />,
      accentBg: 'bg-rose-500/12',
      accentText: 'text-rose-600',
      onClick: () => onNavigateToScreen('faltas_consecutivas'),
    });

    if (isStrictAdmin) {
      items.push(
        {
          id: 'usuarios_acesso',
          title: 'Central Administrativa',
          subtitle: `Acessos, ano letivo ${activeSchoolYear} (200 dias), segurança e ${schoolStats.aeeCount} AEE`,
          icon: <ShieldCheck className="w-5 h-5 stroke-[1.5]" />,
          accentBg: 'bg-[#14428c]/12',
          accentText: 'text-[#14428c]',
          onClick: () => onNavigateToScreen('usuarios_acesso'),
        },
        {
          id: 'bolsa_familia',
          title: 'Bolsa Família',
          subtitle: 'Estudantes beneficiados e frequência LDB',
          icon: <HeartHandshake className="w-5 h-5 stroke-[1.5]" />,
          accentBg: 'bg-amber-500/12',
          accentText: 'text-amber-700',
          onClick: () => onNavigateToScreen('bolsa_familia'),
        }
      );
    } else {
      items.push({
        id: 'avisos',
        title: 'Quadro de Avisos da Direção',
        subtitle: `${schoolNotices.filter((n) => n.active !== false).length} comunicado(s) ativo(s)`,
        icon: <Bell className="w-5 h-5 stroke-[1.5]" />,
        accentBg: 'bg-[#14428c]/12',
        accentText: 'text-[#14428c]',
        onClick: () => {
          document.getElementById('quadro-avisos-direcao')?.scrollIntoView({ behavior: 'smooth' });
        },
      });
    }

    return items;
  }, [
    userRole,
    primaryTeacherClass,
    isStrictAdmin,
    canLaunchAttendance,
    schoolStats,
    referencePeriod,
    activeSchoolYear,
    windowEval.isAllowedToLaunch,
    schoolNotices.length,
    onNavigateToScreen,
  ]);

  return (
    <div className="flex flex-col w-full min-w-0 max-w-[1600px] mx-auto space-y-5 pb-20 text-[#0f172a] animate-gentle-fade">
      {/* 1. CABEÇALHO LIMPO + INDICADORES ESSENCIAIS */}
      <section className="bg-white rounded-3xl p-5 sm:p-7 shadow-xs space-y-5 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs sm:text-[13px] font-bold text-[#14428c] text-balance break-words">
              EMEB Prof. Joaquim Candelário de Freitas · Ano Letivo {activeSchoolYear}
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
                className="w-full sm:w-auto min-h-[46px] py-2.5 px-5 rounded-2xl bg-[#047857] hover:bg-[#065f46] text-white text-sm font-semibold inline-flex items-center justify-center text-center whitespace-nowrap gap-2 cursor-pointer transition-colors duration-100 shadow-xs"
              >
                <CalendarCheck className="w-[18px] h-[18px] stroke-[1.6] shrink-0" />
                <span>Informar Faltas · {referencePeriod.monthName}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateToScreen('turmas')}
                className="w-full sm:w-auto min-h-[46px] py-2.5 px-5 rounded-2xl bg-[#14428c] hover:bg-[#0f3370] text-white text-sm font-semibold inline-flex items-center justify-center text-center whitespace-nowrap gap-2 cursor-pointer transition-colors duration-100 shadow-xs"
              >
                <Users className="w-[18px] h-[18px] stroke-[1.6] shrink-0" />
                <span>Ver Turmas ({schoolStats.totalClasses})</span>
              </button>
            )}
          </div>
        </div>

        {onOpenSpotlightSearch && (
          <button
            type="button"
            onClick={onOpenSpotlightSearch}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#eef3f9] hover:bg-[#e2e8f0] flex items-center justify-between gap-3 text-left cursor-pointer transition-all duration-200 hover:shadow-[0_4px_14px_rgba(11,59,140,0.12)] group"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Search className="w-4 h-4 text-[#14428c] shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-slate-700 group-hover:text-slate-950 truncate">
                Buscar estudante por nome, RA ou turma em toda a escola...
              </span>
            </div>
            <kbd className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white text-[11px] font-mono font-bold text-slate-700 shrink-0 shadow-[0_1px_3px_rgba(15,23,42,0.12)]">
              Ctrl + K
            </kbd>
          </button>
        )}

        {/* Faixa Unificada de KPIs Alinhados */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 min-w-0 items-stretch">
          <div className="p-4 sm:p-5 rounded-2xl bg-[#eef3f9] min-w-0 flex flex-col justify-between h-full">
            <span className="text-xs sm:text-[13px] font-bold text-slate-700 block">Estudantes Ativos</span>
            <span className="text-2xl sm:text-[28px] font-bold text-slate-950 tabular-nums block my-1 leading-tight">
              {schoolStats.activeStudents}
            </span>
            <span className="text-xs text-slate-700 font-semibold tabular-nums block">
              {schoolStats.aeeCount} em AEE
            </span>
          </div>

          {userRole === 'usuario' && primaryTeacherClass ? (
            <button
              type="button"
              onClick={() => onNavigateToScreen('detalhes')}
              className="text-left p-4 sm:p-5 rounded-2xl bg-[#eef3f9] hover:bg-[#e2e8f0] card-interactive cursor-pointer min-w-0 flex flex-col justify-between h-full"
            >
              <span className="text-xs sm:text-[13px] font-bold text-slate-700 block">Minha Turma</span>
              <span className="text-xl sm:text-2xl font-bold text-slate-950 block my-1 leading-tight truncate">
                {primaryTeacherClass.name}
              </span>
              <span className="text-xs text-slate-700 font-semibold block truncate">
                {primaryTeacherClass.shift.replace('Turno ', '')} · {primaryTeacherClass.room || 'Sala'}
              </span>
            </button>
          ) : (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#eef3f9] min-w-0 flex flex-col justify-between h-full">
              <span className="text-xs sm:text-[13px] font-bold text-slate-700 block">Turmas</span>
              <span className="text-2xl sm:text-[28px] font-bold text-slate-950 tabular-nums block my-1 leading-tight">
                {schoolStats.totalClasses}
              </span>
              <span className="text-xs text-slate-700 font-semibold tabular-nums block">
                {schoolStats.morningCount} manhã · {schoolStats.afternoonCount} tarde
              </span>
            </div>
          )}

          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-100/80 min-w-0 flex flex-col justify-between h-full">
            <span className="text-xs sm:text-[13px] font-bold text-emerald-950 block">Presença Média</span>
            <span className="text-2xl sm:text-[28px] font-bold text-[#065f46] tabular-nums block my-1 leading-tight">
              {schoolStats.avgPresence}%
            </span>
            <span className="text-xs text-emerald-950 font-semibold block">Meta MEC ≥ 75%</span>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="text-left p-4 sm:p-5 rounded-2xl bg-rose-100/80 hover:bg-rose-200/80 card-interactive cursor-pointer min-w-0 flex flex-col justify-between h-full"
          >
            <span className="text-xs sm:text-[13px] font-bold text-rose-950 block">Busca Ativa (ECA)</span>
            <span className="text-2xl sm:text-[28px] font-bold text-[#9f1239] tabular-nums block my-1 leading-tight">
              {schoolStats.criticalConsecutiveCount}
            </span>
            <span className="text-xs text-rose-950 font-semibold block">Casos em atenção</span>
          </button>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#e8f0fe] col-span-2 sm:col-span-1 min-w-0 flex flex-col justify-between h-full">
            <span className="text-xs sm:text-[13px] font-bold text-[#0f3370] block">Referência</span>
            <span className="text-lg sm:text-xl font-bold text-slate-950 block my-1 leading-tight whitespace-nowrap">
              {referencePeriod.monthName}/{referencePeriod.year}
            </span>
            <span
              className={`text-xs font-bold block ${
                windowEval.isAllowedToLaunch ? 'text-[#065f46]' : 'text-slate-700'
              }`}
            >
              {windowEval.isAllowedToLaunch ? 'Janela aberta' : 'Consulta disponível'}
            </span>
          </div>
        </div>
      </section>

      {/* AVISO INICIAL: FICHAS INFORMATIVAS NÃO PREENCHIDAS (Alerta ao Professor para Repassar à Família) */}
      {missingFichasSummary.totalMissing > 0 && (
        <section
          aria-label="Aviso de Fichas Informativas Pendentes"
          className="bg-white rounded-3xl p-5 sm:p-6 shadow-xs space-y-4 min-w-0"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/12 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <FileWarning className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight break-words">
                    Fichas Informativas não preenchidas · Repassar pedido às famílias
                  </h2>
                </div>
                <p className="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed break-words">
                  Há{' '}
                  <strong className="font-bold text-[#b45309] tabular-nums">
                    {missingFichasSummary.totalMissing} estudante(s) ativo(s)
                  </strong>{' '}
                  em{' '}
                  <strong className="font-semibold text-slate-900 tabular-nums">
                    {missingFichasSummary.classesWithMissing.length} turma(s)
                  </strong>{' '}
                  ainda sem Ficha Informativa preenchida/anexada. Por favor, repasse o pedido de
                  preenchimento às respectivas famílias para atualizar o prontuário escolar.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyFamilyFichaRequest}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                {copiedFamilyFichaPrompt ? (
                  <>
                    <Check className="w-4 h-4 text-[#047857] stroke-[1.8]" />
                    <span>Recado copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-600 stroke-[1.5]" />
                    <span>Copiar recado para família</span>
                  </>
                )}
              </button>

              {missingFichasSummary.firstPendingClass && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenClassPendingFichas) {
                      onOpenClassPendingFichas(missingFichasSummary.firstPendingClass);
                    } else if (onSelectClassForDetails) {
                      onSelectClassForDetails(missingFichasSummary.firstPendingClass);
                    } else {
                      onNavigateToScreen('detalhes');
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#b45309] hover:bg-[#92400e] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <span>Ver pendentes</span>
                  <ChevronRight className="w-4 h-4 stroke-[1.6]" />
                </button>
              )}
            </div>
          </div>

          {/* Lista compacta de estudantes/turmas com Ficha Informativa pendente */}
          {userRole === 'usuario' && missingFichasSummary.classesWithMissing[0] ? (
            <div className="p-3.5 rounded-2xl bg-amber-50/70 space-y-2">
              <span className="text-xs font-semibold text-amber-950 block">
                Estudantes sem Ficha Informativa em {missingFichasSummary.classesWithMissing[0].classGroup.name}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(showAllMissingFichasClasses
                  ? missingFichasSummary.classesWithMissing[0].missingStudents
                  : missingFichasSummary.classesWithMissing[0].missingStudents.slice(0, 8)
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      onOpenStudentPdf
                        ? onOpenStudentPdf(st, missingFichasSummary.classesWithMissing[0].classGroup.name)
                        : onOpenClassPendingFichas?.(missingFichasSummary.classesWithMissing[0].classGroup)
                    }
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100/70 text-xs font-medium text-slate-900 tabular-nums cursor-pointer transition-colors"
                  >
                    {st.number.toString().padStart(2, '0')} · {st.name}
                  </button>
                ))}
                {missingFichasSummary.classesWithMissing[0].missingStudents.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMissingFichasClasses((prev) => !prev)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#14428c] hover:underline cursor-pointer"
                  >
                    {showAllMissingFichasClasses
                      ? 'Mostrar menos'
                      : `+${missingFichasSummary.classesWithMissing[0].missingStudents.length - 8} estudantes`}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {(showAllMissingFichasClasses
                ? missingFichasSummary.classesWithMissing
                : missingFichasSummary.classesWithMissing.slice(0, 8)
              ).map(({ classGroup: cls, missingStudents }) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() =>
                    onOpenClassPendingFichas
                      ? onOpenClassPendingFichas(cls)
                      : onSelectClassForDetails
                      ? onSelectClassForDetails(cls)
                      : onNavigateToScreen('detalhes')
                  }
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums cursor-pointer transition-colors"
                >
                  <span>{cls.name}</span>
                  <span className="font-bold text-[#b45309]">({missingStudents.length})</span>
                </button>
              ))}
              {missingFichasSummary.classesWithMissing.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllMissingFichasClasses((prev) => !prev)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-[#14428c] hover:underline cursor-pointer"
                >
                  {showAllMissingFichasClasses
                    ? 'Ocultar turmas extras'
                    : `Ver todas (${missingFichasSummary.classesWithMissing.length} turmas)`}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* QUADRO DE AVISOS DA DIREÇÃO (Visível para toda a equipe escolar · Admins postam mensagens curtas) */}
      <QuadroAvisosDirecao
        notices={schoolNotices}
        canManage={isStrictAdmin}
        userEmail={userEmail}
        userName={userName}
        userRoleLabel={roleLabel}
        onSaveNotices={onSaveSchoolNotices}
        onMarkNoticesRead={onMarkNoticeRead}
      />

      {/* 2. ACESSO RÁPIDO (ÍCONES MINIMALISTAS E ALINHAMENTO UNIFORME) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 px-1">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
              Acesso Rápido
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium">
              Ferramentas principais para {isStrictAdmin ? 'gestão escolar' : 'rotina docente'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 min-w-0 items-stretch">
          {quickActions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="w-full h-full min-w-0 min-h-[82px] text-left bg-white hover:bg-[#f8fafc] card-interactive rounded-2xl p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.10)] cursor-pointer flex items-center justify-between gap-3.5 group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl ${item.accentBg} ${item.accentText} flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] sm:text-base font-bold text-slate-950 break-words leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-700 break-words leading-snug mt-0.5">{item.subtitle}</p>
                </div>
              </div>

              <ChevronRight className="w-[18px] h-[18px] stroke-[1.7] text-slate-600 group-hover:text-[#14428c] group-hover:translate-x-1 transition-all duration-200 shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* 3. SELETOR DIRETO DE TURMAS (Apenas para quem gerencia múltiplas turmas) */}
      {userRole !== 'usuario' && (
      <section ref={classesSectionRef} className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.10)] space-y-5 min-w-0 scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-950 break-words">
              Turmas da Escola ({filteredClasses.length})
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 mt-0.5 break-words">
              Toque em uma turma para abrir a lista nominal, chamadas e Fichas Informativas
            </p>
          </div>

          {visibleBaseClasses.length > 1 && (
            <div className="flex flex-wrap sm:inline-flex w-full sm:w-auto max-w-full min-w-0 p-1.5 bg-[#e2e8f0] rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setSelectedShiftFilter('TODOS')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold inline-flex items-center justify-center text-center whitespace-normal transition-all duration-200 cursor-pointer ${
                  selectedShiftFilter === 'TODOS'
                    ? 'bg-[#14428c] text-white shadow-[0_4px_12px_rgba(11,59,140,0.28)]'
                    : 'text-slate-800 hover:bg-white/60'
                }`}
              >
                Todas ({schoolStats.totalClasses})
              </button>
              <button
                type="button"
                onClick={() => setSelectedShiftFilter('MANHÃ')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold inline-flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                  selectedShiftFilter === 'MANHÃ'
                    ? 'bg-[#14428c] text-white shadow-xs'
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
                    ? 'bg-[#14428c] text-white shadow-xs'
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
            <Search className="w-4 h-4 text-slate-700 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={turmaSearchInput}
              onChange={(e) => setTurmaSearchInput(e.target.value)}
              placeholder="Buscar turma ou professora (ex: G4 A, 1º B, 5º A)..."
              className="w-full min-h-[46px] pl-11 pr-4 rounded-xl bg-slate-100 focus:bg-[#e8f0fe]/60 text-sm sm:text-[15px] text-slate-950 placeholder:text-slate-600 transition-colors duration-150"
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
                className="w-full min-w-0 min-h-[120px] text-left bg-[#eef3f9] hover:bg-[#e8f0fe] card-interactive rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2.5 cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2 w-full min-w-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-[17px] font-bold text-slate-950 leading-snug break-words">
                      {cls.name}
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-700 break-words leading-snug mt-0.5">
                      {isMorning ? 'Manhã' : 'Tarde'} · {cls.room || '—'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <span
                      className={`font-mono text-xs sm:text-[13px] font-bold tabular-nums ${
                        cls.students.length === 0 ? 'text-slate-600' : 'text-[#065f46]'
                      }`}
                    >
                      {cls.students.length === 0 ? '—' : `${cls.presenceRate}%`}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#14428c] group-hover:translate-x-1 transition-all duration-200" />
                  </div>
                </div>

                <div className="w-full space-y-0.5 pt-0.5 min-w-0">
                  <p className="text-xs sm:text-[13px] text-slate-900 font-semibold break-words leading-snug">
                    {cls.teacherName || 'Professor(a) atribuído'}
                  </p>
                  <p className="text-xs text-slate-700 font-semibold tabular-nums">
                    {cls.students.length} estudantes
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {filteredClasses.length > HOME_CLASSES_PAGE_SIZE && (
          <PaginationBar
            currentPage={safeClassesPage}
            totalItems={filteredClasses.length}
            pageSize={HOME_CLASSES_PAGE_SIZE}
            onPageChange={(nextPage) => {
              setClassesPage(nextPage);
              classesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            itemLabel="turmas"
          />
        )}

        {filteredClasses.length === 0 && (
          <div className="p-8 text-center bg-[#eef3f9] rounded-2xl space-y-1">
            <p className="text-sm font-semibold text-slate-950">
              Nenhuma turma encontrada com esse termo.
            </p>
            <p className="text-xs text-slate-700">
              Tente buscar por &ldquo;G4&rdquo;, &ldquo;1º&rdquo;, &ldquo;Manhã&rdquo; ou limpe a busca.
            </p>
          </div>
        )}
      </section>
      )}

      {/* 4. PRAZOS E BUSCA ATIVA */}
      <section
        id="central-comunicados"
        className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-5 min-w-0"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 break-words">
              Prazos e Busca Ativa
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 mt-0.5 break-words">
              Calendário de chamada mensal e casos prioritários de busca ativa
            </p>
          </div>

          <div className="flex flex-wrap sm:inline-flex w-full sm:w-auto max-w-full min-w-0 p-1.5 bg-[#f3f6fb] rounded-2xl text-xs sm:text-[13px] font-semibold gap-1">
            <button
              type="button"
              onClick={() => setActiveHubTab('prazos')}
              className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl inline-flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer ${
                activeHubTab === 'prazos'
                  ? 'bg-[#14428c] text-white'
                  : 'text-[#334155] hover:bg-[#dfe8f4]'
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

        {activeHubTab === 'prazos' && (
          <LembretePrazoFrequenciaCard
            attendanceWindowConfig={attendanceWindowConfig}
            userRole={userRole}
            teacherRoleType={teacherRoleType}
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
            classes={visibleBaseClasses}
            userRole={userRole}
            teacherRoleType={teacherRoleType}
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

      {/* 5. GRÁFICO COMPARATIVO POR TURMA (Exibido apenas para múltiplas turmas) */}
      {userRole !== 'usuario' && visibleBaseClasses.length > 1 && (
      <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-5 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-950 flex items-center gap-2.5 min-w-0">
              <BarChart3 className="w-5 h-5 text-[#14428c] shrink-0" />
              <span>Frequência das Turmas — Meta LDB</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 mt-0.5 break-words">
              Comparativo por turma com referência mínima de 75% · Clique em uma barra para abrir a turma
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setChartSortMode((prev) => (prev === 'default' ? 'asc' : 'default'))}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
                chartSortMode === 'asc'
                  ? 'bg-[#14428c] text-white shadow-[0_6px_16px_rgba(2,6,23,0.24)]'
                  : 'bg-[#eef3f9] text-slate-800 hover:bg-[#e2e8f0]'
              }`}
              title="Alternar entre ordem das turmas e menor frequência primeiro"
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
              <span>{chartSortMode === 'asc' ? 'Menor % primeiro' : 'Ordem das turmas'}</span>
            </button>

            <div className="inline-flex p-1 bg-[#e2e8f0] rounded-xl text-xs font-bold gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setChartFilterShift('all')}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
                  chartFilterShift === 'all'
                    ? 'bg-[#14428c] text-white shadow-sm'
                    : 'text-slate-800 hover:bg-white/60'
                }`}
              >
                Todas ({schoolStats.totalClasses})
              </button>
              <button
                type="button"
                onClick={() => setChartFilterShift('MANHÃ')}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
                  chartFilterShift === 'MANHÃ'
                    ? 'bg-[#14428c] text-white shadow-sm'
                    : 'text-slate-800 hover:bg-white/60'
                }`}
              >
                Manhã ({schoolStats.morningCount})
              </button>
              <button
                type="button"
                onClick={() => setChartFilterShift('TARDE')}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer ${
                  chartFilterShift === 'TARDE'
                    ? 'bg-[#14428c] text-white shadow-sm'
                    : 'text-slate-800 hover:bg-white/60'
                }`}
              >
                Tarde ({schoolStats.afternoonCount})
              </button>
            </div>
          </div>
        </div>

        {/* Faixa de Indicadores Quantitativos (Separação Tonal Sem Linhas) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-[#f3f6fb] text-xs sm:text-[13px]">
          <div className="flex items-baseline justify-between sm:justify-start sm:gap-2.5">
            <span className="text-slate-700 font-semibold">Média do recorte</span>
            <span className="font-mono font-bold text-slate-950 text-sm sm:text-base tabular-nums">
              {chartBandSummary.avg}%
            </span>
          </div>
          <div className="flex items-baseline justify-between sm:justify-start sm:gap-2.5">
            <span className="text-slate-700 font-semibold">Regular (≥ 85%)</span>
            <span className="font-mono font-bold text-[#065f46] text-sm sm:text-base tabular-nums">
              {chartBandSummary.regular}
            </span>
          </div>
          <div className="flex items-baseline justify-between sm:justify-start sm:gap-2.5">
            <span className="text-slate-700 font-semibold">Atenção (75–84%)</span>
            <span className="font-mono font-bold text-[#92400e] text-sm sm:text-base tabular-nums">
              {chartBandSummary.attention}
            </span>
          </div>
          <div className="flex items-baseline justify-between sm:justify-start sm:gap-2.5">
            <span className="text-slate-700 font-semibold">Abaixo de 75%</span>
            <span className="font-mono font-bold text-[#991b1b] text-sm sm:text-base tabular-nums">
              {chartBandSummary.below}
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto pb-1">
          <div className="min-w-[680px] sm:min-w-0 w-full h-[270px] sm:h-[310px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 16, right: 64, left: -12, bottom: 14 }}
                barCategoryGap="18%"
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="shortName"
                  interval={0}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  height={44}
                  tick={(props: any) => {
                    const { x, y, payload } = props;
                    const item = chartData.find((d) => d.shortName === payload?.value);
                    const isBelow = item ? item.presence < 75 : false;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          x={0}
                          y={0}
                          dy={10}
                          textAnchor="end"
                          fill={isBelow ? '#b91c1c' : '#475569'}
                          fontSize={10.5}
                          fontWeight={isBelow ? 700 : 600}
                          transform="rotate(-35)"
                        >
                          {payload?.value}
                        </text>
                      </g>
                    );
                  }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tick={{
                    fontSize: 11,
                    fill: '#64748b',
                    fontWeight: 600,
                  }}
                  unit="%"
                />
                <Tooltip
                  cursor={{ fill: 'rgba(11, 59, 140, 0.06)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const statusText =
                        data.presence < 75
                          ? 'Abaixo da meta LDB'
                          : data.presence < 85
                          ? 'Em atenção'
                          : 'Frequência regular';
                      const statusColor =
                        data.presence < 75
                          ? 'text-rose-300'
                          : data.presence < 85
                          ? 'text-amber-300'
                          : 'text-emerald-300';
                      return (
                        <div className="bg-slate-950 text-white px-4 py-3 rounded-2xl text-xs sm:text-[13px] shadow-[0_18px_40px_rgba(2,6,23,0.45)] space-y-1.5 min-w-[200px]">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-white">{data.name}</span>
                            <span className={`font-mono font-bold tabular-nums ${statusColor}`}>
                              {data.presence}%
                            </span>
                          </div>
                          <div className="text-slate-200 text-xs">
                            {data.shift} · {data.teacherName}
                          </div>
                          <div className="pt-1.5 bg-white/10 -mx-2 px-2 py-1 rounded-xl flex items-center justify-between gap-3 text-[11px]">
                            <span className={`font-semibold ${statusColor}`}>
                              {statusText}
                            </span>
                            <span className="text-slate-200 tabular-nums">
                              {data.studentsCount} estudantes
                            </span>
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
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  label={{
                    value: 'Meta 75%',
                    fill: '#dc2626',
                    fontSize: 11,
                    fontWeight: 700,
                    position: 'right',
                  }}
                />
                <Bar
                  dataKey="presence"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={26}
                  className="cursor-pointer"
                  onClick={(barEntry: any) => {
                    const cls = barEntry?.payload?.classRef || barEntry?.classRef;
                    if (cls) {
                      if (onSelectClassForDetails) onSelectClassForDetails(cls);
                      else onNavigateToScreen('detalhes');
                    }
                  }}
                >
                  {chartData.map((entry) => {
                    let barColor = '#047857';
                    if (entry.presence < 75) barColor = '#dc2626';
                    else if (entry.presence < 85) barColor = '#d97706';
                    return (
                      <Cell
                        key={`cell-${entry.id}`}
                        fill={barColor}
                        className="hover:opacity-85 transition-opacity"
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1 gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#047857] shrink-0" />
              ≥ 85% (Regular)
            </span>
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#d97706] shrink-0" />
              75% a 84% (Atenção)
            </span>
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#dc2626] shrink-0" />
              &lt; 75% (Abaixo da Meta)
            </span>
          </div>
          <span className="font-semibold text-slate-900 tabular-nums">
            {chartData.length} turma(s) exibida(s)
          </span>
        </div>
      </section>
      )}
    </div>
  );
};
