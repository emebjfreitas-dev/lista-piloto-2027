import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from 'recharts';
import { ClassGroup, Student, SchoolHoliday } from '../types';
import {
  getStoredOfficialCalendarConfig,
  getStoredHolidays,
} from '../services/db';
import {
  OFFICIAL_DEFAULT_HOLIDAYS_2027,
  generateOfficial200SchoolDays2027,
  DAYS_OF_WEEK_PT,
} from '../utils/calendarValidation';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';

export interface HeatmapEvaluatedStudent {
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
}

interface AttendanceDailyHeatmapProps {
  selectedMonthName: string;
  monthNumber: number;
  defaultSchoolDays: number;
  filteredClasses: ClassGroup[];
  evaluatedStudents: HeatmapEvaluatedStudent[];
  onSelectClass?: (cls: ClassGroup) => void;
  onOpenStudentGrid?: (student: Student) => void;
}

type HeatmapMetricMode = 'frequency' | 'absences' | 'unjustified';

interface AbsentStudentDayEntry {
  student: Student;
  cls: ClassGroup;
  justified: boolean;
  isConsecutiveAlert: boolean;
  isExplicitDate: boolean;
}

interface ClassAbsenceDayBreakdown {
  cls: ClassGroup;
  className: string;
  shortName: string;
  absences: number;
  unjustified: number;
  ratePercent: number;
}

interface DayHeatmapCell {
  isoDate: string;
  brDate: string;
  shortDate: string;
  dayNumber: number;
  weekdayCol: number; // 0=Dom .. 6=Sáb
  weekdayShort: string;
  weekdayFull: string;
  weekRow: number; // 0..totalWeeks-1
  isSchoolDay: boolean;
  isSaturdaySchoolDay: boolean;
  isHoliday: boolean;
  isWeekendNonSchool: boolean;
  dayTypeLabel: string;
  enrolledCount: number;
  presences: number;
  absencesTotal: number;
  justifiedAbsences: number;
  unjustifiedAbsences: number;
  attendanceRate: number; // 0..100
  absenceRate: number; // 0..100
  heatValue: number;
  hasExplicitLogs: boolean;
  classBreakdown: ClassAbsenceDayBreakdown[];
  absentStudents: AbsentStudentDayEntry[];
}

interface WeekdayPatternRow {
  weekdayCol: number;
  weekdayShort: string;
  weekdayFull: string;
  schoolDaysCount: number;
  avgAttendanceRate: number;
  avgAbsenceRate: number;
  avgAbsencesPerDay: number;
  totalAbsences: number;
  totalUnjustified: number;
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

const hashSeed = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const parseShortOrFullDate = (
  raw: string,
  fallbackMonth: number
): { day: number; month: number } | null => {
  const clean = raw.trim();
  const parts = clean.split('/');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) || fallbackMonth;
  if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  return { day, month };
};

const getTilePalette = (
  cell: DayHeatmapCell,
  metricMode: HeatmapMetricMode,
  maxAbsencesInMonth: number
): { bg: string; text: string; subtext: string } => {
  if (cell.isHoliday) {
    return { bg: '#e9e9ef', text: '#374151', subtext: '#48484a' };
  }
  if (!cell.isSchoolDay) {
    return { bg: '#f4f4f8', text: '#6e6e73', subtext: '#8e8e93' };
  }

  if (metricMode === 'frequency') {
    const rate = cell.attendanceRate;
    if (rate >= 96) return { bg: '#d1fae5', text: '#064e3b', subtext: '#065f46' };
    if (rate >= 92) return { bg: '#ecfdf5', text: '#065f46', subtext: '#047857' };
    if (rate >= 88) return { bg: '#fef3c7', text: '#78350f', subtext: '#92400e' };
    if (rate >= 82) return { bg: '#fed7aa', text: '#7c2d12', subtext: '#9a3412' };
    if (rate >= 75) return { bg: '#fecdd3', text: '#881337', subtext: '#9f1239' };
    return { bg: '#be123c', text: '#ffffff', subtext: '#ffe4e6' };
  }

  const count = metricMode === 'unjustified' ? cell.unjustifiedAbsences : cell.absencesTotal;
  const denom = Math.max(4, maxAbsencesInMonth);
  const ratio = count / denom;

  if (count === 0) return { bg: '#d1fae5', text: '#064e3b', subtext: '#065f46' };
  if (ratio <= 0.25) return { bg: '#ecfdf5', text: '#065f46', subtext: '#047857' };
  if (ratio <= 0.5) return { bg: '#fef3c7', text: '#78350f', subtext: '#92400e' };
  if (ratio <= 0.75) return { bg: '#fed7aa', text: '#7c2d12', subtext: '#9a3412' };
  if (ratio < 0.92) return { bg: '#fecdd3', text: '#881337', subtext: '#9f1239' };
  return { bg: '#be123c', text: '#ffffff', subtext: '#ffe4e6' };
};

interface HeatmapTooltipCardProps {
  cell: DayHeatmapCell;
  interactive?: boolean;
  onClose?: () => void;
  onOpenStudentGrid?: (student: Student) => void;
}

const HeatmapTooltipCard: React.FC<HeatmapTooltipCardProps> = ({
  cell,
  interactive = false,
  onClose,
  onOpenStudentGrid,
}) => {
  const maxPreview = interactive ? 12 : 6;
  const previewStudents = cell.absentStudents.slice(0, maxPreview);
  const remainingCount = Math.max(0, cell.absentStudents.length - previewStudents.length);

  return (
    <div
      className="bg-[#111827] text-white px-3.5 py-3 rounded-2xl text-xs shadow-2xl space-y-2 w-full"
      role="status"
      aria-live="polite"
    >
      {/* Cabeçalho: Data Exata + Tipo de Dia */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white text-sm leading-snug tabular-nums break-words">
            {cell.brDate} · {cell.weekdayFull}
          </div>
          <div className="text-[#d1d5db] text-xs break-words">{cell.dayTypeLabel}</div>
        </div>
        {interactive && onClose && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold shrink-0 cursor-pointer"
            aria-label="Fechar tooltip"
          >
            Fechar
          </button>
        )}
      </div>

      {cell.isSchoolDay ? (
        <>
          {/* Totais de Presentes e Faltantes */}
          <div className="grid grid-cols-2 gap-1.5 bg-white/10 rounded-xl p-2 tabular-nums">
            <div className="min-w-0">
              <span className="text-xs font-medium text-[#d1d5db] block">
                Presentes
              </span>
              <span className="text-sm font-semibold text-emerald-300">
                {cell.presences}{' '}
                <span className="text-xs font-normal text-[#d1d5db]">
                  / {cell.enrolledCount} ({cell.attendanceRate}%)
                </span>
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-xs font-medium text-[#d1d5db] block">
                Faltantes
              </span>
              <span className="text-sm font-semibold text-rose-300">
                {cell.absencesTotal}{' '}
                <span className="text-xs font-normal text-[#d1d5db]">
                  ({cell.unjustifiedAbsences} s/ atest.)
                </span>
              </span>
            </div>
          </div>

          {/* Lista Nominal de Faltantes */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-semibold text-[#d1d5db]">
              <span>Faltantes ({cell.absentStudents.length})</span>
              {cell.justifiedAbsences > 0 && (
                <span>{cell.justifiedAbsences} c/ atestado</span>
              )}
            </div>

            {cell.absentStudents.length === 0 ? (
              <p className="text-xs text-emerald-300 font-medium py-0.5">
                100% de presença — nenhum estudante faltante nesta data.
              </p>
            ) : (
              <div
                className={`space-y-1 ${
                  interactive ? 'max-h-[176px] overflow-y-auto pr-0.5' : ''
                }`}
              >
                {previewStudents.map((entry) => {
                  const classShort = entry.cls.turmaAbrev || entry.cls.name.replace('GRUPO ', 'G');
                  const rowContent = (
                    <div className="flex items-start justify-between gap-2 text-xs py-1 px-2 rounded-lg bg-white/5 min-w-0">
                      <span className="text-white font-medium break-words leading-snug min-w-0 flex-1">
                        {entry.student.name}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0 tabular-nums">
                        <span className="text-[#d1d5db] text-xs">{classShort}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                            entry.justified
                              ? 'bg-emerald-500/25 text-emerald-200'
                              : 'bg-rose-500/30 text-rose-200'
                          }`}
                        >
                          {entry.justified ? 'Atest.' : 'S/ Atest.'}
                        </span>
                      </span>
                    </div>
                  );

                  if (interactive && onOpenStudentGrid) {
                    return (
                      <button
                        key={`${entry.cls.id}-${entry.student.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenStudentGrid(entry.student);
                        }}
                        className="w-full text-left hover:bg-white/10 rounded-lg transition-colors duration-100 cursor-pointer"
                      >
                        {rowContent}
                      </button>
                    );
                  }

                  return (
                    <div key={`${entry.cls.id}-${entry.student.id}`}>
                      {rowContent}
                    </div>
                  );
                })}
              </div>
            )}

            {remainingCount > 0 && (
              <div className="text-xs text-[#9ca3af] pt-0.5 tabular-nums">
                + {remainingCount} outro(s) faltante(s) ·{' '}
                {interactive ? 'consulte a lista ao lado' : 'clique para ver todos'}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white/10 rounded-xl p-2 text-xs text-[#d1d5db]">
          <div className="font-semibold text-white">Presentes: 0 (Dia não letivo)</div>
          <div className="text-[#9ca3af] mt-0.5">
            Sem registro de faltantes nesta data.
          </div>
        </div>
      )}
    </div>
  );
};

export const AttendanceDailyHeatmap: React.FC<AttendanceDailyHeatmapProps> = ({
  selectedMonthName,
  monthNumber,
  defaultSchoolDays,
  filteredClasses,
  evaluatedStudents,
  onSelectClass,
  onOpenStudentGrid,
}) => {
  const [metricMode, setMetricMode] = useState<HeatmapMetricMode>('frequency');
  const [selectedDayNum, setSelectedDayNum] = useState<number | null>(null);
  const [showAllAbsentStudents, setShowAllAbsentStudents] = useState(false);
  const [hoveredTile, setHoveredTile] = useState<{
    dayNumber: number;
    anchorX: number;
    anchorY: number;
  } | null>(null);
  const [touchTooltip, setTouchTooltip] = useState<{
    dayNumber: number;
    anchorX: number;
    anchorY: number;
  } | null>(null);
  const isTouchInteractionRef = useRef(false);

  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  const chartInnerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(680);

  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setChartWidth(el.clientWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const {
    cells,
    totalWeeks,
    weekdayPatterns,
    peakAbsenceDay,
    worstWeekday,
    maxAbsencesInMonth,
    totalSchoolDaysInGrid,
    totalExplicitEntries,
  } = useMemo(() => {
    const year = 2027;
    const daysInMonth = new Date(year, monthNumber, 0).getDate();

    // Carrega feriados e dias letivos oficiais do armazenamento (com fallback oficial 2027)
    let holidays: SchoolHoliday[] = OFFICIAL_DEFAULT_HOLIDAYS_2027;
    let officialSchoolDates: string[] = [];
    try {
      const storedHolidays = getStoredHolidays();
      if (Array.isArray(storedHolidays) && storedHolidays.length > 0) {
        holidays = storedHolidays;
      }
      const calConfig = getStoredOfficialCalendarConfig();
      if (Array.isArray(calConfig?.schoolDays) && calConfig.schoolDays.length > 0) {
        officialSchoolDates = calConfig.schoolDays;
      }
    } catch {
      // Fallback silencioso para matriz oficial 2027
    }

    if (officialSchoolDates.length === 0) {
      officialSchoolDates = generateOfficial200SchoolDays2027(holidays);
    }

    const holidayMap = new Map<string, SchoolHoliday>();
    holidays.forEach((h) => {
      if (h.date) holidayMap.set(h.date.trim(), h);
    });

    const octoberMap = new Map<string, (typeof OFFICIAL_OCTOBER_DAYS)[number]>();
    if (monthNumber === 10) {
      OFFICIAL_OCTOBER_DAYS.forEach((d) => octoberMap.set(d.date, d));
    }

    const schoolDateSet = new Set(officialSchoolDates.map((d) => d.trim()));

    // Identifica todos os dias do mês e quais são letivos
    const firstWeekday = new Date(year, monthNumber - 1, 1).getDay();
    const daysMeta: Array<{
      dayNumber: number;
      brDate: string;
      isoDate: string;
      shortDate: string;
      weekdayCol: number;
      weekRow: number;
      isSchoolDay: boolean;
      isSaturdaySchoolDay: boolean;
      isHoliday: boolean;
      isWeekendNonSchool: boolean;
      dayTypeLabel: string;
    }> = [];

    const schoolDayNumbers: number[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, monthNumber - 1, d);
      const weekdayCol = dateObj.getDay();
      const weekRow = Math.floor((firstWeekday + d - 1) / 7);
      const brDate = `${pad2(d)}/${pad2(monthNumber)}/${year}`;
      const isoDate = `${year}-${pad2(monthNumber)}-${pad2(d)}`;
      const shortDate = `${pad2(d)}/${pad2(monthNumber)}`;

      const octEntry = octoberMap.get(brDate);
      const holiday = holidayMap.get(brDate);

      let isSchoolDay = schoolDateSet.has(brDate);
      let isHoliday = Boolean(holiday);
      let dayTypeLabel = 'Dia Letivo Regular';

      if (octEntry) {
        isSchoolDay = octEntry.type === 'dia_letivo' || octEntry.type === 'sabado_letivo';
        isHoliday = octEntry.type === 'feriado';
        dayTypeLabel = octEntry.description;
      } else if (holiday) {
        isSchoolDay = false;
        isHoliday = true;
        dayTypeLabel = holiday.name;
      } else if (!isSchoolDay) {
        if (weekdayCol === 0 || weekdayCol === 6) {
          dayTypeLabel = 'Fim de semana (não letivo)';
        } else if (monthNumber === 7 && d < 19) {
          dayTypeLabel = 'Recesso Escolar de Julho';
        } else {
          dayTypeLabel = 'Dia não letivo';
        }
      } else if (weekdayCol === 6) {
        dayTypeLabel = 'Sábado Letivo Temático';
      }

      const isSaturdaySchoolDay = isSchoolDay && weekdayCol === 6;
      const isWeekendNonSchool = !isSchoolDay && !isHoliday && (weekdayCol === 0 || weekdayCol === 6);

      if (isSchoolDay) {
        schoolDayNumbers.push(d);
      }

      daysMeta.push({
        dayNumber: d,
        brDate,
        isoDate,
        shortDate,
        weekdayCol,
        weekRow,
        isSchoolDay,
        isSaturdaySchoolDay,
        isHoliday,
        isWeekendNonSchool,
        dayTypeLabel,
      });
    }

    // Fallback se a lista de dias letivos estiver vazia para o mês
    if (schoolDayNumbers.length === 0) {
      daysMeta.forEach((m) => {
        if (m.weekdayCol >= 1 && m.weekdayCol <= 5 && !m.isHoliday && schoolDayNumbers.length < defaultSchoolDays) {
          m.isSchoolDay = true;
          m.dayTypeLabel = 'Dia Letivo Regular';
          schoolDayNumbers.push(m.dayNumber);
        }
      });
    }

    const totalWeeks = Math.max(
      1,
      daysMeta.length > 0 ? daysMeta[daysMeta.length - 1].weekRow + 1 : 5
    );

    // Identifica dias próximos a feriados ou segundas/sextas para ponderar distribuição determinística realista
    const holidayDayNums = new Set(daysMeta.filter((m) => m.isHoliday).map((m) => m.dayNumber));
    const dayMetaByNum = new Map(daysMeta.map((m) => [m.dayNumber, m]));

    const rankedSchoolDaysForPattern = (seed: number): number[] => {
      return [...schoolDayNumbers].sort((a, b) => {
        const metaA = dayMetaByNum.get(a)!;
        const metaB = dayMetaByNum.get(b)!;
        const weightDay = (m: typeof metaA) => {
          let w = 0;
          if (m.weekdayCol === 1 || m.weekdayCol === 5) w += 18; // Segundas / Sextas
          if (m.isSaturdaySchoolDay) w += 22; // Sábado letivo
          if (holidayDayNums.has(m.dayNumber - 1) || holidayDayNums.has(m.dayNumber + 1)) w += 15; // Emenda feriado
          const jitter = hashSeed(`${seed}-${m.dayNumber}-${monthNumber}`) % 40;
          return w + jitter;
        };
        return weightDay(metaB) - weightDay(metaA);
      });
    };

    // Estruturas acumuladoras por dia
    const dayAbsencesMap = new Map<number, AbsentStudentDayEntry[]>();
    const dayEnrolledCountMap = new Map<number, number>();
    const dayExplicitLogMap = new Map<number, boolean>();

    schoolDayNumbers.forEach((d) => {
      dayAbsencesMap.set(d, []);
      dayEnrolledCountMap.set(d, 0);
      dayExplicitLogMap.set(d, false);
    });

    let totalExplicitEntries = 0;

    // Distribui matrículas e faltas de cada estudante avaliado de forma 100% consistente com o mês
    evaluatedStudents.forEach((snap) => {
      const st = snap.student;
      const activeDaysForStudent = Math.max(
        1,
        Math.min(schoolDayNumbers.length, snap.diasLetivos || schoolDayNumbers.length)
      );

      // Se recorte parcial no mês, considera os dias finais/iniciais da matrícula
      const studentSchoolDays =
        activeDaysForStudent === schoolDayNumbers.length
          ? schoolDayNumbers
          : schoolDayNumbers.slice(schoolDayNumbers.length - activeDaysForStudent);

      studentSchoolDays.forEach((d) => {
        dayEnrolledCountMap.set(d, (dayEnrolledCountMap.get(d) || 0) + 1);
      });

      if (snap.faltas <= 0) return;

      const assignedDays = new Set<number>();
      const explicitDays = new Set<number>();

      // 1) Primeiro utiliza datas reais registradas na Busca Ativa / Consecutivas que pertençam a este mês
      const alertDates = [
        ...(st.consecutiveAbsenceAlert?.selectedDates || []),
        ...((st.consecutiveAbsenceAlert?.occurrences || []).flatMap((o) => o.selectedDates || [])),
      ];

      for (const rawDate of alertDates) {
        if (assignedDays.size >= snap.faltas) break;
        const parsed = parseShortOrFullDate(rawDate, monthNumber);
        if (parsed && parsed.month === monthNumber && studentSchoolDays.includes(parsed.day)) {
          if (!assignedDays.has(parsed.day)) {
            assignedDays.add(parsed.day);
            explicitDays.add(parsed.day);
            dayExplicitLogMap.set(parsed.day, true);
            totalExplicitEntries += 1;
          }
        }
      }

      // 2) Completa o restante das faltas mensais do estudante de forma determinística
      const remaining = snap.faltas - assignedDays.size;
      if (remaining > 0) {
        const seed = hashSeed(`${st.id}-${st.ra || st.number}-${monthNumber}`);
        const ranked = rankedSchoolDaysForPattern(seed).filter((d) =>
          studentSchoolDays.includes(d) && !assignedDays.has(d)
        );

        // Se o aluno tem 3+ faltas mas sem datas explícitas neste mês, agrupa em bloco consecutivo realista
        if (remaining >= 3 && explicitDays.size === 0 && studentSchoolDays.length >= remaining) {
          const maxStartIdx = Math.max(0, studentSchoolDays.length - remaining);
          const startIdx = seed % (maxStartIdx + 1);
          for (let k = 0; k < remaining; k++) {
            assignedDays.add(studentSchoolDays[startIdx + k]);
          }
        } else {
          for (let k = 0; k < remaining && k < ranked.length; k++) {
            assignedDays.add(ranked[k]);
          }
        }
      }

      // 3) Atribui status (Com Atestado vs Sem Atestado) preservando o total exato de snap.atestados
      const orderedAssigned = Array.from(assignedDays).sort((a, b) => a - b);
      // Prioriza deixar datas explícitas de Busca Ativa como "sem atestado" quando aplicável
      const nonExplicitDays = orderedAssigned.filter((d) => !explicitDays.has(d));
      const explicitList = orderedAssigned.filter((d) => explicitDays.has(d));
      const priorityForJustified = [...nonExplicitDays, ...explicitList];
      const justifiedSet = new Set(priorityForJustified.slice(0, snap.atestados));

      orderedAssigned.forEach((dayNum) => {
        const list = dayAbsencesMap.get(dayNum);
        if (list) {
          list.push({
            student: st,
            cls: snap.cls,
            justified: justifiedSet.has(dayNum),
            isConsecutiveAlert: snap.hasConsecutiveAlert,
            isExplicitDate: explicitDays.has(dayNum),
          });
        }
      });
    });

    // Constrói células finais do Heatmap
    let maxAbsencesInMonth = 0;
    const classLookup = new Map(filteredClasses.map((c) => [c.id, c]));

    const cells: DayHeatmapCell[] = daysMeta.map((meta) => {
      const absentEntries = dayAbsencesMap.get(meta.dayNumber) || [];
      const enrolledCount = meta.isSchoolDay
        ? Math.max(absentEntries.length, dayEnrolledCountMap.get(meta.dayNumber) || evaluatedStudents.length)
        : 0;
      const absencesTotal = absentEntries.length;
      const justifiedAbsences = absentEntries.filter((e) => e.justified).length;
      const unjustifiedAbsences = absencesTotal - justifiedAbsences;
      const presences = Math.max(0, enrolledCount - absencesTotal);
      const attendanceRate =
        enrolledCount > 0 ? Math.round((presences / enrolledCount) * 1000) / 10 : 100;
      const absenceRate =
        enrolledCount > 0 ? Math.round((absencesTotal / enrolledCount) * 1000) / 10 : 0;

      if (absencesTotal > maxAbsencesInMonth) {
        maxAbsencesInMonth = absencesTotal;
      }

      // Quebra por turma naquele dia
      const byClassMap = new Map<string, { absences: number; unjustified: number }>();
      absentEntries.forEach((entry) => {
        const prev = byClassMap.get(entry.cls.id) || { absences: 0, unjustified: 0 };
        prev.absences += 1;
        if (!entry.justified) prev.unjustified += 1;
        byClassMap.set(entry.cls.id, prev);
      });

      const classBreakdown: ClassAbsenceDayBreakdown[] = Array.from(byClassMap.entries())
        .map(([classId, counts]) => {
          const cls = classLookup.get(classId) || absentEntries.find((e) => e.cls.id === classId)!.cls;
          const activeInClass = Math.max(
            counts.absences,
            cls.students.filter((s) => {
              const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
              return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
            }).length
          );
          const ratePercent =
            activeInClass > 0 ? Math.round(((activeInClass - counts.absences) / activeInClass) * 100) : 100;
          return {
            cls,
            className: cls.name,
            shortName: cls.turmaAbrev || cls.name.replace('GRUPO ', 'G'),
            absences: counts.absences,
            unjustified: counts.unjustified,
            ratePercent,
          };
        })
        .sort((a, b) => b.absences - a.absences || a.ratePercent - b.ratePercent);

      const sortedStudents = [...absentEntries].sort((a, b) => {
        if (a.justified !== b.justified) return a.justified ? 1 : -1;
        if (a.isConsecutiveAlert !== b.isConsecutiveAlert) return a.isConsecutiveAlert ? -1 : 1;
        return a.student.name.localeCompare(b.student.name, 'pt-BR');
      });

      return {
        isoDate: meta.isoDate,
        brDate: meta.brDate,
        shortDate: meta.shortDate,
        dayNumber: meta.dayNumber,
        weekdayCol: meta.weekdayCol,
        weekdayShort: WEEKDAY_SHORT[meta.weekdayCol],
        weekdayFull: DAYS_OF_WEEK_PT[meta.weekdayCol],
        weekRow: meta.weekRow,
        isSchoolDay: meta.isSchoolDay,
        isSaturdaySchoolDay: meta.isSaturdaySchoolDay,
        isHoliday: meta.isHoliday,
        isWeekendNonSchool: meta.isWeekendNonSchool,
        dayTypeLabel: meta.dayTypeLabel,
        enrolledCount,
        presences,
        absencesTotal,
        justifiedAbsences,
        unjustifiedAbsences,
        attendanceRate,
        absenceRate,
        heatValue: meta.isSchoolDay ? Math.max(5, absencesTotal) : 1,
        hasExplicitLogs: Boolean(dayExplicitLogMap.get(meta.dayNumber)),
        classBreakdown,
        absentStudents: sortedStudents,
      };
    });

    // Padrão por dia da semana (Seg..Sáb para dias letivos)
    const weekdayPatterns: WeekdayPatternRow[] = [1, 2, 3, 4, 5, 6]
      .map((col): WeekdayPatternRow | null => {
        const dayCells = cells.filter((c) => c.weekdayCol === col && c.isSchoolDay);
        if (dayCells.length === 0) return null;
        const totalEnrolled = dayCells.reduce((acc, c) => acc + c.enrolledCount, 0);
        const totalPres = dayCells.reduce((acc, c) => acc + c.presences, 0);
        const totalAbs = dayCells.reduce((acc, c) => acc + c.absencesTotal, 0);
        const totalUnjust = dayCells.reduce((acc, c) => acc + c.unjustifiedAbsences, 0);
        const avgAttendanceRate =
          totalEnrolled > 0 ? Math.round((totalPres / totalEnrolled) * 1000) / 10 : 100;
        const avgAbsenceRate =
          totalEnrolled > 0 ? Math.round((totalAbs / totalEnrolled) * 1000) / 10 : 0;
        const avgAbsencesPerDay = Math.round((totalAbs / dayCells.length) * 10) / 10;

        return {
          weekdayCol: col,
          weekdayShort: WEEKDAY_SHORT[col],
          weekdayFull: DAYS_OF_WEEK_PT[col],
          schoolDaysCount: dayCells.length,
          avgAttendanceRate,
          avgAbsenceRate,
          avgAbsencesPerDay,
          totalAbsences: totalAbs,
          totalUnjustified: totalUnjust,
        };
      })
      .filter((r): r is WeekdayPatternRow => r !== null);

    const schoolCells = cells.filter((c) => c.isSchoolDay);
    const peakAbsenceDay =
      schoolCells.length > 0
        ? [...schoolCells].sort(
            (a, b) => b.absencesTotal - a.absencesTotal || a.attendanceRate - b.attendanceRate
          )[0]
        : null;

    const worstWeekday =
      weekdayPatterns.length > 0
        ? [...weekdayPatterns].sort(
            (a, b) => b.avgAbsenceRate - a.avgAbsenceRate || b.avgAbsencesPerDay - a.avgAbsencesPerDay
          )[0]
        : null;

    return {
      cells,
      totalWeeks,
      weekdayPatterns,
      peakAbsenceDay,
      worstWeekday,
      maxAbsencesInMonth,
      totalSchoolDaysInGrid: schoolCells.length,
      totalExplicitEntries,
    };
  }, [evaluatedStudents, filteredClasses, monthNumber, defaultSchoolDays]);

  // Mantém o dia selecionado válido quando o mês ou filtros mudam
  const activeDayCell = useMemo(() => {
    if (selectedDayNum !== null) {
      const found = cells.find((c) => c.dayNumber === selectedDayNum && c.isSchoolDay);
      if (found) return found;
    }
    return peakAbsenceDay || cells.find((c) => c.isSchoolDay) || null;
  }, [cells, selectedDayNum, peakAbsenceDay]);

  useEffect(() => {
    setSelectedDayNum(null);
    setShowAllAbsentStudents(false);
    setHoveredTile(null);
    setTouchTooltip(null);
  }, [monthNumber, filteredClasses.length]);

  useEffect(() => {
    if (!touchTooltip) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (chartWrapperRef.current && !chartWrapperRef.current.contains(event.target as Node)) {
        setTouchTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [touchTooltip]);

  // Calcula geometria responsiva dos blocos do ScatterChart
  const tileWidth = Math.max(36, Math.min(112, Math.floor((chartWidth - 68) / 7) - 6));
  const tileHeight = chartWidth < 460 ? 44 : 52;
  const chartHeight = totalWeeks * (tileHeight + 8) + 46;

  const activeTooltipInfo = touchTooltip || hoveredTile;
  const activeTooltipCell = activeTooltipInfo
    ? cells.find((c) => c.dayNumber === activeTooltipInfo.dayNumber) || null
    : null;

  // Renderizador customizado do bloco de calor dentro do Recharts Scatter
  const renderHeatmapTile = (props: unknown) => {
    const { cx, cy, payload } = (props || {}) as {
      cx?: number;
      cy?: number;
      payload?: DayHeatmapCell;
    };
    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
      return <g />;
    }

    const cell = payload;
    const isSelected = activeDayCell?.dayNumber === cell.dayNumber;
    const isHovered = activeTooltipInfo?.dayNumber === cell.dayNumber;
    const palette = getTilePalette(cell, metricMode, maxAbsencesInMonth);
    const x = cx - tileWidth / 2;
    const y = cy - tileHeight / 2;

    const mainMetricText = !cell.isSchoolDay
      ? cell.isHoliday
        ? 'Feriado'
        : '—'
      : metricMode === 'frequency'
      ? `${cell.attendanceRate.toFixed(cell.attendanceRate % 1 === 0 ? 0 : 1)}%`
      : metricMode === 'absences'
      ? `${cell.absencesTotal}f`
      : `${cell.unjustifiedAbsences} s/a`;

    return (
      <g
        transform={`translate(${x}, ${y})`}
        role="button"
        tabIndex={0}
        aria-label={`${cell.brDate}, ${cell.weekdayFull}, ${cell.presences} presentes, ${cell.absencesTotal} faltantes`}
        onPointerDown={(e) => {
          isTouchInteractionRef.current = e.pointerType !== 'mouse';
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') {
            isTouchInteractionRef.current = false;
            setTouchTooltip(null);
            setHoveredTile({ dayNumber: cell.dayNumber, anchorX: cx, anchorY: cy });
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') {
            setHoveredTile((prev) => (prev?.dayNumber === cell.dayNumber ? null : prev));
          }
        }}
        onTouchStart={() => {
          isTouchInteractionRef.current = true;
        }}
        onFocus={() => {
          setHoveredTile({ dayNumber: cell.dayNumber, anchorX: cx, anchorY: cy });
        }}
        onBlur={() => {
          setHoveredTile((prev) => (prev?.dayNumber === cell.dayNumber ? null : prev));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (cell.isSchoolDay) {
              setSelectedDayNum(cell.dayNumber);
              setShowAllAbsentStudents(false);
            }
            setTouchTooltip((prev) =>
              prev?.dayNumber === cell.dayNumber
                ? null
                : { dayNumber: cell.dayNumber, anchorX: cx, anchorY: cy }
            );
          }
        }}
        onClick={() => {
          if (cell.isSchoolDay) {
            setSelectedDayNum(cell.dayNumber);
            setShowAllAbsentStudents(false);
          }
          if (isTouchInteractionRef.current || !cell.isSchoolDay) {
            setTouchTooltip((prev) =>
              prev?.dayNumber === cell.dayNumber
                ? null
                : { dayNumber: cell.dayNumber, anchorX: cx, anchorY: cy }
            );
          }
        }}
        style={{ cursor: 'pointer', outline: 'none' }}
      >
        <rect
          width={tileWidth}
          height={tileHeight}
          rx={10}
          ry={10}
          fill={palette.bg}
          stroke={isSelected || isHovered ? '#111827' : 'none'}
          strokeWidth={isSelected ? 2.25 : isHovered ? 1.5 : 0}
          pointerEvents="all"
        />

        {/* Número do dia no canto superior esquerdo */}
        <text
          x={8}
          y={15}
          fill={palette.subtext}
          fontSize={11}
          fontWeight={600}
          style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}
        >
          {pad2(cell.dayNumber)}
        </text>

        {/* Indicador de sábado letivo ou registro nominal */}
        {cell.isSaturdaySchoolDay && (
          <text
            x={tileWidth - 7}
            y={14}
            textAnchor="end"
            fill={palette.subtext}
            fontSize={10}
            fontWeight={600}
            style={{ pointerEvents: 'none' }}
          >
            Sáb.L
          </text>
        )}

        {/* Valor principal centralizado */}
        <text
          x={tileWidth / 2}
          y={tileHeight - 11}
          textAnchor="middle"
          fill={palette.text}
          fontSize={chartWidth < 460 ? 11 : 13}
          fontWeight={700}
          style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}
        >
          {mainMetricText}
        </text>
      </g>
    );
  };

  if (evaluatedStudents.length === 0) {
    return (
      <section className="bg-white rounded-3xl p-6 shadow-sm text-center space-y-2">
        <span className="material-symbols-outlined text-3xl text-[#48484a]">calendar_month</span>
        <h2 className="text-sm font-semibold text-[#111827]">
          Mapa de Calor Diário Indisponível
        </h2>
        <p className="text-xs text-[#48484a]">
          Nenhum estudante ativo encontrado nos filtros atuais para exibir a distribuição diária de {selectedMonthName}/2027.
        </p>
      </section>
    );
  }

  const displayedAbsentStudents =
    activeDayCell && showAllAbsentStudents
      ? activeDayCell.absentStudents
      : activeDayCell?.absentStudents.slice(0, 6) || [];

  return (
    <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm space-y-5">
      {/* Cabeçalho do Mapa de Calor */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="material-symbols-outlined text-[#0066cc] text-[22px] shrink-0">
              calendar_view_month
            </span>
            <h2 className="text-sm sm:text-base font-semibold text-[#111827] tracking-tight">
              Mapa de Calor da Frequência Diária · {selectedMonthName}/2027
            </h2>
          </div>
          <p className="text-xs text-[#48484a]">
            Distribuição por dia do mês ({totalSchoolDaysInGrid} dias letivos) para identificar picos de ausência, emendas de feriados e dias da semana críticos.
          </p>
        </div>

        {/* Alternador de Métrica do Heatmap */}
        <div className="ios-segmented self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setMetricMode('frequency')}
            className={`ios-segmented-item whitespace-nowrap shrink-0 ${
              metricMode === 'frequency' ? 'ios-segmented-item-active' : ''
            }`}
          >
            % Frequência
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('absences')}
            className={`ios-segmented-item whitespace-nowrap shrink-0 ${
              metricMode === 'absences' ? 'ios-segmented-item-active' : ''
            }`}
          >
            Total de Faltas
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('unjustified')}
            className={`ios-segmented-item whitespace-nowrap shrink-0 ${
              metricMode === 'unjustified' ? 'ios-segmented-item-active' : ''
            }`}
          >
            S/ Atestado
          </button>
        </div>
      </div>

      {/* Destaques de Padrão (Resumo Executivo Imediato) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[#f2f2f7] rounded-2xl p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#48484a] block">
              Dia com Maior Ausência
            </span>
            {peakAbsenceDay ? (
              <>
                <span className="text-base sm:text-lg font-semibold text-[#111827] tabular-nums block mt-0.5 break-words">
                  {peakAbsenceDay.shortDate} · {peakAbsenceDay.weekdayFull.replace('-feira', '')}
                </span>
                <span className="text-xs text-[#b42318] font-medium tabular-nums break-words">
                  {peakAbsenceDay.absencesTotal} faltas ({peakAbsenceDay.attendanceRate}% presença)
                </span>
              </>
            ) : (
              <span className="text-xs text-[#48484a]">Sem registros</span>
            )}
          </div>
          {peakAbsenceDay && (
            <button
              type="button"
              onClick={() => {
                setSelectedDayNum(peakAbsenceDay.dayNumber);
                setShowAllAbsentStudents(false);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-[#e9e9ef] text-[#111827] text-xs font-semibold shrink-0 shadow-2xs cursor-pointer"
            >
              Inspecionar
            </button>
          )}
        </div>

        <div className="bg-[#f2f2f7] rounded-2xl p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#48484a] block">
              Dia da Semana Mais Crítico
            </span>
            {worstWeekday ? (
              <>
                <span className="text-base sm:text-lg font-semibold text-[#111827] block mt-0.5 break-words">
                  {worstWeekday.weekdayFull}
                </span>
                <span className="text-xs text-[#374151] font-medium tabular-nums break-words">
                  Média {worstWeekday.avgAbsencesPerDay} faltas/dia ({worstWeekday.avgAttendanceRate}% freq.)
                </span>
              </>
            ) : (
              <span className="text-xs text-[#48484a]">Sem dados</span>
            )}
          </div>
          <span className="material-symbols-outlined text-[#b45309] text-[22px] shrink-0">
            insights
          </span>
        </div>

        <div className="bg-[#f2f2f7] rounded-2xl p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#48484a] block">
              Origem das Datas no Mês
            </span>
            <span className="text-base sm:text-lg font-semibold text-[#111827] tabular-nums block mt-0.5 break-words">
              {totalExplicitEntries > 0
                ? `${totalExplicitEntries} datas nominais ECA`
                : 'Matriz mensal consolidada'}
            </span>
            <span className="text-xs text-[#48484a] block break-words">
              {totalExplicitEntries > 0
                ? 'Datas da Busca Ativa + apuração mensal'
                : 'Base oficial dos 200 dias letivos 2027'}
            </span>
          </div>
          <span className="material-symbols-outlined text-[#006644] text-[22px] shrink-0">
            event_available
          </span>
        </div>
      </div>

      {/* Área Principal: Heatmap Recharts (Esquerda) + Padrão por Dia da Semana & Detalhe do Dia (Direita) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Calendário Heatmap Recharts */}
        <div className="xl:col-span-7 space-y-3 min-w-0">
          <div
            ref={chartWrapperRef}
            onMouseLeave={() => setHoveredTile(null)}
            className="relative w-full bg-[#f8f8fb] rounded-2xl p-2 sm:p-3"
          >
            <div ref={chartInnerRef} className="relative" style={{ width: '100%', height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 26, right: 6, bottom: 8, left: 2 }}>
                  <XAxis
                    type="number"
                    dataKey="weekdayCol"
                    domain={[-0.5, 6.5]}
                    ticks={[0, 1, 2, 3, 4, 5, 6]}
                    orientation="top"
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => WEEKDAY_SHORT[Number(v)] || ''}
                    tick={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="weekRow"
                    domain={[-0.5, totalWeeks - 0.5]}
                    reversed
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    ticks={Array.from({ length: totalWeeks }, (_, i) => i)}
                    tickFormatter={(v) => `Sem ${Number(v) + 1}`}
                    tick={{ fontSize: 11, fontWeight: 500, fill: '#48484a' }}
                  />
                  <ZAxis type="number" dataKey="heatValue" range={[100, 100]} />
                  <Tooltip
                    cursor={false}
                    allowEscapeViewBox={{ x: true, y: true }}
                    wrapperStyle={{ zIndex: 50, pointerEvents: 'none', maxWidth: '300px' }}
                    content={({ active, payload }) => {
                      // Evita tooltip duplicado quando o tooltip ancorado por hover/toque da célula está ativo
                      if (activeTooltipCell) return null;
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0].payload as DayHeatmapCell;
                      if (!d) return null;
                      return (
                        <div className="w-[270px] sm:w-[290px]">
                          <HeatmapTooltipCard cell={d} />
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={cells}
                    isAnimationActive={true}
                    animationDuration={220}
                    shape={renderHeatmapTile}
                  />
                </ScatterChart>
              </ResponsiveContainer>

              {/* Tooltip Customizado Ancorado à Célula (Hover preciso em toda a área da célula + Toque em dispositivos móveis) */}
              {activeTooltipCell && activeTooltipInfo && (() => {
                const innerW = chartInnerRef.current?.clientWidth || Math.max(280, chartWidth - 24);
                const tooltipW = Math.min(300, Math.max(244, innerW - 8));
                const leftPx = Math.max(
                  4,
                  Math.min(innerW - tooltipW - 4, activeTooltipInfo.anchorX - tooltipW / 2)
                );
                const placeBelow = activeTooltipCell.weekRow <= 1;
                const isPinnedByTouch = Boolean(touchTooltip);

                return (
                  <div
                    className={`absolute z-50 animate-gentle-fade ${
                      isPinnedByTouch ? 'pointer-events-auto' : 'pointer-events-none'
                    }`}
                    style={{
                      width: `${tooltipW}px`,
                      left: `${leftPx}px`,
                      ...(placeBelow
                        ? { top: `${activeTooltipInfo.anchorY + tileHeight / 2 + 8}px` }
                        : { bottom: `${chartHeight - (activeTooltipInfo.anchorY - tileHeight / 2) + 8}px` }),
                    }}
                  >
                    <HeatmapTooltipCard
                      cell={activeTooltipCell}
                      interactive={isPinnedByTouch}
                      onClose={() => setTouchTooltip(null)}
                      onOpenStudentGrid={onOpenStudentGrid}
                    />
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Legenda Explícita de Cores e Significado */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#374151]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-semibold text-[#111827]">Legenda:</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#d1fae5] inline-block" />
                {metricMode === 'frequency' ? '≥96% (Ótimo)' : '0–25% faltas'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#fef3c7] inline-block" />
                {metricMode === 'frequency' ? '88–91%' : '26–50%'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#fed7aa] inline-block" />
                {metricMode === 'frequency' ? '82–87%' : '51–75%'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#fecdd3] inline-block" />
                {metricMode === 'frequency' ? '75–81%' : '76–91%'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#be123c] inline-block" />
                {metricMode === 'frequency' ? '<75% (Crítico)' : 'Pico de faltas'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#e9e9ef] inline-block" />
                Feriado
              </span>
            </div>
            <span className="text-[#48484a]">Passe o mouse ou toque na célula para ver presentes e faltantes</span>
          </div>
        </div>

        {/* Coluna Direita: Padrão por Dia da Semana (Recharts BarChart) + Inspeção do Dia */}
        <div className="xl:col-span-5 space-y-4 min-w-0">
          {/* Padrão por Dia da Semana com Recharts BarChart */}
          <div className="bg-[#f8f8fb] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#111827]">
                  Padrão de Ausências por Dia da Semana
                </h3>
                <p className="text-xs text-[#48484a]">
                  Média de faltas por dia letivo em {selectedMonthName}/2027
                </p>
              </div>
              <span className="text-xs font-semibold text-[#374151] tabular-nums shrink-0">
                Seg → Sáb
              </span>
            </div>

            <div className="w-full h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weekdayPatterns}
                  margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="weekdayShort"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#48484a' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0].payload as WeekdayPatternRow;
                      return (
                        <div className="bg-[#111827] text-white px-3 py-2 rounded-xl text-xs shadow-lg space-y-0.5 tabular-nums">
                          <div className="font-semibold">{row.weekdayFull}</div>
                          <div className="text-[#d1d5db]">
                            Média: {row.avgAbsencesPerDay} faltas/dia ({row.schoolDaysCount} dias letivos)
                          </div>
                          <div className="text-emerald-300 font-medium">
                            Frequência média: {row.avgAttendanceRate}%
                          </div>
                          <div className="text-rose-300">
                            Total no mês: {row.totalAbsences} faltas ({row.totalUnjustified} s/ atestado)
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="avgAbsencesPerDay" radius={[6, 6, 0, 0]} maxBarSize={32}>
                    {weekdayPatterns.map((entry) => {
                      const isPeak = worstWeekday?.weekdayCol === entry.weekdayCol;
                      return (
                        <Cell
                          key={`wd-${entry.weekdayCol}`}
                          fill={isPeak ? '#be123c' : '#334155'}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Painel de Detalhamento do Dia Selecionado */}
          {activeDayCell && (
            <div className="bg-[#f2f2f7] rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#48484a]">
                    <span>DIA SELECIONADO</span>
                    <span>·</span>
                    <span className="text-[#111827] break-words">{activeDayCell.dayTypeLabel}</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#111827] mt-0.5 break-words">
                    {activeDayCell.brDate} ({activeDayCell.weekdayFull})
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold tabular-nums shrink-0 ${
                    activeDayCell.attendanceRate >= 90
                      ? 'bg-[#d1fae5] text-[#064e3b]'
                      : activeDayCell.attendanceRate >= 80
                      ? 'bg-[#fef3c7] text-[#78350f]'
                      : 'bg-[#fecdd3] text-[#881337]'
                  }`}
                >
                  {activeDayCell.attendanceRate}% presença
                </span>
              </div>

              {/* Resumo Numérico do Dia */}
              <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2 text-center">
                <div className="bg-white rounded-xl p-2.5">
                  <span className="text-xs text-[#48484a] block">Presentes</span>
                  <span className="text-base font-semibold text-[#006644] tabular-nums">
                    {activeDayCell.presences}/{activeDayCell.enrolledCount}
                  </span>
                </div>
                <div className="bg-white rounded-xl p-2.5">
                  <span className="text-xs text-[#48484a] block">C/ Atestado</span>
                  <span className="text-base font-semibold text-[#111827] tabular-nums">
                    {activeDayCell.justifiedAbsences}
                  </span>
                </div>
                <div className="bg-white rounded-xl p-2.5">
                  <span className="text-xs text-[#48484a] block">S/ Atestado</span>
                  <span className="text-base font-semibold text-[#b42318] tabular-nums">
                    {activeDayCell.unjustifiedAbsences}
                  </span>
                </div>
              </div>

              {/* Turmas mais impactadas no dia */}
              {activeDayCell.classBreakdown.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#48484a] block">
                    Turmas com mais ausências neste dia
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeDayCell.classBreakdown.slice(0, 5).map((cb) => (
                      <button
                        key={cb.cls.id}
                        type="button"
                        onClick={() => onSelectClass?.(cb.cls)}
                        className="min-h-[36px] px-3 py-1 rounded-xl bg-white hover:bg-[#e9e9ef] text-xs font-medium text-[#111827] tabular-nums transition-colors duration-100 cursor-pointer"
                        title={`Selecionar turma ${cb.className} (${cb.ratePercent}% neste dia)`}
                      >
                        {cb.shortName} · <strong className="text-[#b42318]">{cb.absences}f</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista nominal de ausentes no dia */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#48484a]">
                    Estudantes ausentes ({activeDayCell.absentStudents.length})
                  </span>
                  {activeDayCell.absentStudents.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllAbsentStudents((prev) => !prev)}
                      className="text-xs font-semibold text-[#0066cc] hover:underline cursor-pointer"
                    >
                      {showAllAbsentStudents
                        ? 'Mostrar menos'
                        : `Ver todos (${activeDayCell.absentStudents.length})`}
                    </button>
                  )}
                </div>

                {activeDayCell.absentStudents.length === 0 ? (
                  <p className="text-xs text-[#006644] bg-white rounded-xl p-3 font-medium">
                    Nenhuma ausência registrada neste dia para o recorte atual.
                  </p>
                ) : (
                  <div className="bg-white rounded-xl overflow-hidden max-h-[210px] overflow-y-auto">
                    {displayedAbsentStudents.map((item) => (
                      <button
                        key={`${item.cls.id}-${item.student.id}`}
                        type="button"
                        onClick={() => onOpenStudentGrid?.(item.student)}
                        className="w-full text-left px-3 py-2.5 odd:bg-[#f8f8fb] hover:bg-[#e9e9ef] flex items-center justify-between gap-2 transition-colors duration-100 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-sm font-semibold text-[#111827] block break-words leading-snug">
                            {item.student.name}
                          </span>
                          <span className="text-xs text-[#48484a] block break-words">
                            {item.cls.name}
                            {item.isExplicitDate ? ' · Data nominal Busca Ativa' : ''}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 ${
                            item.justified
                              ? 'bg-[#d1fae5] text-[#064e3b]'
                              : item.isConsecutiveAlert
                              ? 'bg-[#fecdd3] text-[#881337]'
                              : 'bg-[#fef3c7] text-[#78350f]'
                          }`}
                        >
                          {item.justified ? 'Atestado' : 'S/ Atestado'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
