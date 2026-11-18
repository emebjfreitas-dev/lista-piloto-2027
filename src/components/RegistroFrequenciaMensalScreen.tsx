import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { ClassGroup, Student, UserRole } from '../types';
import {
  MONTHLY_SCHOOL_DAYS_2027,
  OFFICIAL_OCTOBER_DAYS,
  getClassSchoolDaysForMonth,
} from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getClassAttendanceMetrics,
  getDefaultReferencePeriod,
} from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';

const CURRENT_ACTIVE_MONTH_NUMBER = 10;

interface RegistroFrequenciaMensalScreenProps {
  classGroup: ClassGroup;
  userRole: UserRole;
  canEdit: boolean;
  instantSyncStatus?: 'idle' | 'syncing' | 'synced';
  onSaveMonthlyAttendance: (updatedClass: ClassGroup) => void;
  onOpenPhotoModal: (student: Student) => void;
  onOpenStudentGrid: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onNavigateToSheet: () => void;
  onBack: () => void;
}

export const RegistroFrequenciaMensalScreen: React.FC<RegistroFrequenciaMensalScreenProps> = ({
  classGroup,
  userRole,
  canEdit,
  instantSyncStatus = 'synced',
  onSaveMonthlyAttendance,
  onOpenPhotoModal,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onBack,
}) => {
  const defaultRef = useMemo(() => getDefaultReferencePeriod(), []);
  const [selectedMonthName, setSelectedMonthName] = useState<string>(() => {
    const match = MONTHLY_SCHOOL_DAYS_2027.find(
      (m) => m.month.toLowerCase() === defaultRef.monthName.toLowerCase()
    );
    return match ? match.month : 'Setembro';
  });
  const [diasLetivosMes, setDiasLetivosMes] = useState<number>(() => {
    const match = MONTHLY_SCHOOL_DAYS_2027.find(
      (m) => m.month.toLowerCase() === defaultRef.monthName.toLowerCase()
    );
    return match ? match.schoolDays : (classGroup.classesHeld || 20);
  });
  const [students, setStudents] = useState<Student[]>(classGroup.students);
  const [searchName, setSearchName] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'faltas' | 'atestados'>('all');
  const [attendanceViewMode, setAttendanceViewMode] = useState<'compact' | 'cards'>('compact');

  // Estado de feedback visual e tátil de salvamento com animação flash, Sonner toast e transição de cores
  const [saveFlashState, setSaveFlashState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedStudentId, setLastSavedStudentId] = useState<string | null>(null);
  const saveFlashTimerRef = useRef<number | null>(null);
  const prevSaveFlashStateRef = useRef<'idle' | 'saving' | 'saved'>('idle');
  const lastSavedInfoRef = useRef<{
    studentName?: string;
    studentNumber?: number;
    faltas?: number;
    atestados?: number;
    frequenciaPercent?: number;
    monthName: string;
    presenceRate: number;
    totalFaltasTurma: number;
    savedAt: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (saveFlashTimerRef.current !== null) {
        window.clearTimeout(saveFlashTimerRef.current);
      }
    };
  }, []);

  // Dispara toast informativo com animação suave via Sonner + feedback tátil assim que o salvamento é concluído
  useEffect(() => {
    if (prevSaveFlashStateRef.current !== 'saved' && saveFlashState === 'saved') {
      const info = lastSavedInfoRef.current;

      // Feedback tátil progressivo para dispositivos móveis compatíveis
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(12);
        }
      } catch {
        // Ignora caso o navegador bloqueie vibração
      }

      if (info) {
        const shortName = info.studentName
          ? info.studentName.trim().split(/\s+/).slice(0, 2).join(' ')
          : '';
        const numberPrefix =
          typeof info.studentNumber === 'number'
            ? `Nº ${info.studentNumber.toString().padStart(2, '0')} · `
            : '';

        const title = shortName
          ? `Faltas salvas · ${numberPrefix}${shortName}`
          : `Frequência de ${info.monthName} salva`;

        const description =
          typeof info.faltas === 'number' && typeof info.atestados === 'number'
            ? `${info.faltas} ${info.faltas === 1 ? 'falta' : 'faltas'} · ${info.atestados} ${
                info.atestados === 1 ? 'atestado' : 'atestados'
              } · ${info.frequenciaPercent ?? info.presenceRate}% de presença (${info.monthName})`
            : `Turma ${classGroup.name} · ${info.presenceRate}% de presença global (${info.totalFaltasTurma} faltas)`;

        toast.success(title, {
          id: 'registro-frequencia-save-toast',
          description,
          duration: 2800,
          className: 'sonner-sf-toast sonner-attendance-toast',
          icon: (
            <span
              key={info.savedAt}
              className="sonner-tactile-pop w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs"
            >
              <span className="material-symbols-outlined text-[14px]">check</span>
            </span>
          ),
        });
      }
    }
    prevSaveFlashStateRef.current = saveFlashState;
  }, [saveFlashState, classGroup.name]);

  const selectedMonthMeta = useMemo(
    () => MONTHLY_SCHOOL_DAYS_2027.find((m) => m.month === selectedMonthName),
    [selectedMonthName]
  );
  const currentMonthIdx = useMemo(
    () =>
      MONTHLY_SCHOOL_DAYS_2027.findIndex(
        (m) => m.month.toLowerCase() === selectedMonthName.toLowerCase()
      ),
    [selectedMonthName]
  );
  const previousPeriodMeta = currentMonthIdx > 0 ? MONTHLY_SCHOOL_DAYS_2027[currentMonthIdx - 1] : null;
  const previousPeriodName = previousPeriodMeta?.month || null;
  const nextPeriodMeta =
    currentMonthIdx >= 0 && currentMonthIdx < MONTHLY_SCHOOL_DAYS_2027.length - 1
      ? MONTHLY_SCHOOL_DAYS_2027[currentMonthIdx + 1]
      : null;
  const nextPeriodName = nextPeriodMeta?.month || null;

  const isPastMonth = Boolean(
    selectedMonthMeta && selectedMonthMeta.monthNumber < CURRENT_ACTIVE_MONTH_NUMBER
  );
  const isLockedBecausePastMonth = isPastMonth && userRole !== 'admin';
  const effectiveCanEdit = canEdit && !isLockedBecausePastMonth;

  useEffect(() => {
    setStudents(classGroup.students);
  }, [classGroup.students]);

  const triggerRuleAlert = (msg: string) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([16, 40, 16]);
      }
    } catch {
      // ignore
    }
    toast.warning(msg, {
      id: 'registro-frequencia-rule-alert',
      duration: 3200,
      className: 'sonner-sf-toast',
    });
  };

  const commitInstantUpdate = (
    nextStudents: Student[],
    customMonthDays: number = diasLetivosMes,
    customMonthName: string = selectedMonthName,
    studentIdSaved?: string
  ) => {
    setStudents(nextStudents);
    if (!effectiveCanEdit) return;

    if (studentIdSaved) {
      setLastSavedStudentId(studentIdSaved);
    }
    // Estado de loading/saving com alteração de cor suave
    setSaveFlashState('saving');

    const tempClass: ClassGroup = {
      ...classGroup,
      classesHeld: customMonthDays,
      classesPlanned: customMonthDays,
      students: nextStudents,
    };
    const classMetrics = getClassAttendanceMetrics(tempClass, OFFICIAL_OCTOBER_DAYS);
    const updatedStudent = studentIdSaved
      ? nextStudents.find((s) => s.id === studentIdSaved)
      : undefined;
    const updatedStudentMetrics = updatedStudent
      ? getStudentAttendanceMetrics(updatedStudent, customMonthDays, OFFICIAL_OCTOBER_DAYS)
      : undefined;

    lastSavedInfoRef.current = {
      studentName: updatedStudent?.name,
      studentNumber: updatedStudent?.number,
      faltas: updatedStudentMetrics?.faltas,
      atestados: updatedStudentMetrics?.atestados,
      frequenciaPercent: updatedStudentMetrics?.frequenciaPercent,
      monthName: customMonthName,
      presenceRate: classMetrics.presenceRate,
      totalFaltasTurma: classMetrics.totalFaltasTurma,
      savedAt: Date.now(),
    };

    const updatedClass: ClassGroup = {
      ...tempClass,
      presenceRate: classMetrics.presenceRate,
      monthlyAbsences: classMetrics.totalFaltasTurma,
      isPending: false,
      statusText: `Fechamento de ${customMonthName}: Sincronizado (${classMetrics.presenceRate}% de presença)`,
    };
    onSaveMonthlyAttendance(updatedClass);

    if (saveFlashTimerRef.current !== null) {
      window.clearTimeout(saveFlashTimerRef.current);
    }

    // Transição para o estado 'saved' com animação suave confirmando gravação
    saveFlashTimerRef.current = window.setTimeout(() => {
      setSaveFlashState('saved');
      saveFlashTimerRef.current = window.setTimeout(() => {
        setSaveFlashState('idle');
        setLastSavedStudentId(null);
      }, 2200);
    }, 150);
  };

  const handleMonthChange = (monthName: string) => {
    const newMonthDays = getClassSchoolDaysForMonth(classGroup, monthName);
    setSelectedMonthName(monthName);
    setDiasLetivosMes(newMonthDays);

    const nextStudents = students.map((s) => {
      const prevMap = { ...(s.monthlyAttendanceByMonth || {}) };
      prevMap[selectedMonthName] = {
        diasLetivosRecorte: s.diasLetivosRecorte || diasLetivosMes,
        faltas: s.totalAbsencesMonth || 0,
        atestados: Math.min(s.totalAbsencesMonth || 0, s.justifiedAbsences || 0),
        observacao: s.notes,
      };

      const savedTarget = prevMap[monthName];
      if (savedTarget) {
        const nextRecorte = Math.max(
          1,
          Math.min(newMonthDays, savedTarget.diasLetivosRecorte || newMonthDays)
        );
        const nextFaltas = Math.max(0, Math.min(nextRecorte, savedTarget.faltas || 0));
        const nextAtestados = Math.max(0, Math.min(nextFaltas, savedTarget.atestados || 0));
        return {
          ...s,
          diasLetivosRecorte: nextRecorte,
          totalAbsencesMonth: nextFaltas,
          justifiedAbsences: nextAtestados,
          monthlyAttendanceByMonth: prevMap,
        };
      }

      const currentMetrics = getStudentAttendanceMetrics(
        s,
        diasLetivosMes,
        OFFICIAL_OCTOBER_DAYS
      );
      const nextRecorte = currentMetrics.isMesCheio
        ? newMonthDays
        : Math.min(newMonthDays, currentMetrics.diasLetivosMatriculados);
      const nextFaltas = Math.min(nextRecorte, s.totalAbsencesMonth);
      const nextAtestados = Math.min(nextFaltas, s.justifiedAbsences || 0);
      prevMap[monthName] = {
        diasLetivosRecorte: nextRecorte,
        faltas: nextFaltas,
        atestados: nextAtestados,
      };
      return {
        ...s,
        diasLetivosRecorte: nextRecorte,
        totalAbsencesMonth: nextFaltas,
        justifiedAbsences: nextAtestados,
        monthlyAttendanceByMonth: prevMap,
      };
    });
    commitInstantUpdate(nextStudents, newMonthDays, monthName);
  };

  // Contador 1: Faltas do Mês (+1 ou -1)
  const handleDeltaAbsence = (studentId: string, delta: number) => {
    if (!effectiveCanEdit) return;
    let blocked = false;
    const nextStudents: Student[] = students.map((s) => {
      if (s.id !== studentId) return s;
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);

      if (delta > 0 && m.faltas >= m.diasLetivosMatriculados) {
        triggerRuleAlert(
          `Limite atingido: ${s.name} possui ${m.diasLetivosMatriculados} dias letivos no mês.`
        );
        blocked = true;
        return s;
      }

      const nextFaltas = Math.max(0, Math.min(m.diasLetivosMatriculados, m.faltas + delta));
      const nextAtestados = Math.min(nextFaltas, m.atestados);
      const nextPresencas = Math.max(0, m.diasLetivosMatriculados - nextFaltas);
      const nextFreqPct =
        m.diasLetivosMatriculados > 0
          ? Math.round((nextPresencas / m.diasLetivosMatriculados) * 100)
          : 100;
      const isBelowLegal = nextFreqPct < m.minLegalPresencePercent;

      const nextMonthMap = {
        ...(s.monthlyAttendanceByMonth || {}),
        [selectedMonthName]: {
          diasLetivosRecorte: m.diasLetivosMatriculados,
          faltas: nextFaltas,
          atestados: nextAtestados,
          observacao: s.notes,
        },
      };

      return {
        ...s,
        totalAbsencesMonth: nextFaltas,
        justifiedAbsences: nextAtestados,
        monthlyAttendanceByMonth: nextMonthMap,
        status: nextFaltas > 0 ? 'absent' : 'present',
        alert: isBelowLegal
          ? `Presença (${nextFreqPct}%) abaixo de ${m.minLegalPresencePercent}%`
          : undefined,
      };
    });

    if (!blocked) {
      commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName, studentId);
    }
  };

  // Contador 2: Atestados (+1 ou -1)
  const handleDeltaAtestado = (studentId: string, delta: number) => {
    if (!effectiveCanEdit) return;
    let blocked = false;
    const nextStudents: Student[] = students.map((s) => {
      if (s.id !== studentId) return s;
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);

      if (delta > 0 && m.faltas === 0) {
        triggerRuleAlert(
          `Para registrar atestado, lance primeiro a falta correspondente de ${s.name}.`
        );
        blocked = true;
        return s;
      }

      if (delta > 0 && m.atestados >= m.faltas) {
        triggerRuleAlert(
          `O número de atestados (${m.atestados}) não pode ultrapassar o total de faltas (${m.faltas}).`
        );
        blocked = true;
        return s;
      }

      const nextAtestados = Math.max(0, Math.min(m.faltas, m.atestados + delta));
      const nextMonthMap = {
        ...(s.monthlyAttendanceByMonth || {}),
        [selectedMonthName]: {
          diasLetivosRecorte: m.diasLetivosMatriculados,
          faltas: m.faltas,
          atestados: nextAtestados,
          observacao: s.notes,
        },
      };
      return {
        ...s,
        justifiedAbsences: nextAtestados,
        monthlyAttendanceByMonth: nextMonthMap,
      };
    });

    if (!blocked) {
      commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName, studentId);
    }
  };

  // Digitação direta do número de Faltas no teclado
  const handleDirectSetAbsence = (studentId: string, rawVal: string) => {
    if (!effectiveCanEdit) return;
    const digitsOnly = rawVal.replace(/\D/g, '');
    const parsed = digitsOnly === '' ? 0 : parseInt(digitsOnly, 10);
    const nextStudents: Student[] = students.map((s) => {
      if (s.id !== studentId) return s;
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      const nextFaltas = Math.max(0, Math.min(m.diasLetivosMatriculados, parsed));
      const nextAtestados = Math.min(nextFaltas, m.atestados);
      const nextPresencas = Math.max(0, m.diasLetivosMatriculados - nextFaltas);
      const nextFreqPct =
        m.diasLetivosMatriculados > 0
          ? Math.round((nextPresencas / m.diasLetivosMatriculados) * 100)
          : 100;
      const isBelowLegal = nextFreqPct < m.minLegalPresencePercent;
      const nextMonthMap = {
        ...(s.monthlyAttendanceByMonth || {}),
        [selectedMonthName]: {
          diasLetivosRecorte: m.diasLetivosMatriculados,
          faltas: nextFaltas,
          atestados: nextAtestados,
          observacao: s.notes,
        },
      };
      return {
        ...s,
        totalAbsencesMonth: nextFaltas,
        justifiedAbsences: nextAtestados,
        monthlyAttendanceByMonth: nextMonthMap,
        status: nextFaltas > 0 ? 'absent' : 'present',
        alert: isBelowLegal
          ? `Presença (${nextFreqPct}%) abaixo de ${m.minLegalPresencePercent}%`
          : undefined,
      };
    });
    commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName, studentId);
  };

  // Digitação direta do número de Atestados no teclado
  const handleDirectSetAtestado = (studentId: string, rawVal: string) => {
    if (!effectiveCanEdit) return;
    const digitsOnly = rawVal.replace(/\D/g, '');
    const parsed = digitsOnly === '' ? 0 : parseInt(digitsOnly, 10);
    const nextStudents: Student[] = students.map((s) => {
      if (s.id !== studentId) return s;
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      const nextAtestados = Math.max(0, Math.min(m.faltas, parsed));
      const nextMonthMap = {
        ...(s.monthlyAttendanceByMonth || {}),
        [selectedMonthName]: {
          diasLetivosRecorte: m.diasLetivosMatriculados,
          faltas: m.faltas,
          atestados: nextAtestados,
          observacao: s.notes,
        },
      };
      return {
        ...s,
        justifiedAbsences: nextAtestados,
        monthlyAttendanceByMonth: nextMonthMap,
      };
    });
    commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName, studentId);
  };

  // Indicativos e Contadores Consolidados da Turma no Mês
  const liveClassMetrics = useMemo(
    () =>
      getClassAttendanceMetrics(
        { ...classGroup, classesHeld: diasLetivosMes, students },
        OFFICIAL_OCTOBER_DAYS
      ),
    [classGroup, diasLetivosMes, students]
  );

  const detailedIndicators = useMemo(() => {
    let countWithFaltas = 0;
    let countZeroFaltas = 0;
    let countWithAtestados = 0;
    let countBelowLegal = 0;
    let ativosCount = 0;

    students.forEach((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const isMov =
        sit.includes('BXTR') ||
        sit.includes('TRANSF') ||
        sit.includes('REMAN') ||
        sit.includes('RM');
      if (!isMov) ativosCount++;

      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      if (m.faltas > 0) countWithFaltas++;
      else countZeroFaltas++;
      if (m.atestados > 0) countWithAtestados++;
      if (m.isBelowLegalThreshold) countBelowLegal++;
    });

    const pctFaltaTurma = Math.max(0, 100 - liveClassMetrics.presenceRate);
    const pctAtestadosSobreFaltas =
      liveClassMetrics.totalFaltasTurma > 0
        ? Math.round(
            (liveClassMetrics.totalAtestadosTurma / liveClassMetrics.totalFaltasTurma) * 100
          )
        : 0;
    const faltasSemAtestadoTurma = Math.max(
      0,
      liveClassMetrics.totalFaltasTurma - liveClassMetrics.totalAtestadosTurma
    );

    return {
      ativosCount,
      countWithFaltas,
      countZeroFaltas,
      countWithAtestados,
      countBelowLegal,
      pctFaltaTurma,
      pctAtestadosSobreFaltas,
      faltasSemAtestadoTurma,
    };
  }, [students, diasLetivosMes, liveClassMetrics]);

  const displayedStudents = useMemo(() => {
    const q = searchName.toLowerCase().trim();
    return [...students]
      .sort((a, b) => a.number - b.number)
      .filter((s) => {
        const matchesText =
          q === '' ||
          s.name.toLowerCase().includes(q) ||
          s.number.toString() === q ||
          s.number.toString().padStart(2, '0') === q;
        if (!matchesText) return false;
        if (quickFilter === 'faltas') return (s.totalAbsencesMonth || 0) > 0;
        if (quickFilter === 'atestados') return (s.justifiedAbsences || 0) > 0;
        return true;
      });
  }, [students, searchName, quickFilter]);

  const isInfantilClass =
    classGroup.name.toUpperCase().startsWith('GRUPO') ||
    classGroup.grade.toUpperCase().includes('INFANTIL');
  const minLegalPresence = isInfantilClass ? 60 : 75;

  return (
    <div className="flex flex-col w-full min-w-0 space-y-5 pb-16 animate-gentle-fade">
      {/* Breadcrumb e Contexto */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 py-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            <span>Turma {classGroup.name}</span>
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800 break-words">Informar Faltas do Mês</span>
          <span className="text-slate-400">·</span>
          <span>{selectedMonthName}/2027</span>
        </div>
        <span className="hidden sm:inline text-slate-500 text-xs font-semibold shrink-0">
          {diasLetivosMes} dias letivos no mês
        </span>
      </div>

      {/* Painel Coeso de Faltas do Mês & Controles (Alunos Visíveis Imediatamente) */}
      <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5 min-w-0">
        {/* Linha 1: Contexto da Turma + Mês de Referência + Badge de Salvamento com Animação Flash + Concluir */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-950 tracking-tight break-words">
                Faltas do Mês — {selectedMonthName}
              </h1>
              <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg break-words">
                Turma {classGroup.name}
              </span>
              {classGroup.turmaAbrev && (
                <span className="font-mono font-bold text-slate-950 bg-slate-100 px-2 py-0.5 rounded-lg">
                  {classGroup.turmaAbrev}
                </span>
              )}
              <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
                {classGroup.shift.replace('Turno ', '')} · {classGroup.room}
              </span>
            </div>

            <p className="text-xs text-slate-600 font-medium break-words leading-relaxed">
              <span className="font-bold text-slate-800">Regente:</span> {classGroup.teacherName || 'Docente Regente'} · {detailedIndicators.ativosCount} estudantes ativos · {diasLetivosMes} dias letivos
            </p>
          </div>

          {/* Feedback Visual Flash / Salvamento no Banco + Seletor de Mês + Concluir */}
          <div className="flex flex-wrap items-center gap-2 justify-between lg:justify-end shrink-0">
            {/* Badge Dinâmico com Animação Flash e Alteração de Cor */}
            {saveFlashState === 'saving' ? (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-950 font-bold text-xs shadow-xs animate-pulse transition-all duration-200"
                title="Gravando no banco de dados local e nuvem..."
              >
                <span className="material-symbols-outlined text-[16px] animate-spin text-amber-800">
                  sync
                </span>
                <span>Salvando no banco...</span>
              </div>
            ) : saveFlashState === 'saved' ? (
              <div
                className="sonner-tactile-pop inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md transition-all duration-300"
                title="Dados persistidos com sucesso no banco de dados e nuvem!"
              >
                <span className="material-symbols-outlined text-[17px] text-white">
                  check_circle
                </span>
                <span>Salvo com sucesso!</span>
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 font-semibold text-xs"
                title="Dados sincronizados e seguros"
              >
                <span className="material-symbols-outlined text-[15px] text-emerald-700">
                  cloud_done
                </span>
                <span>{instantSyncStatus === 'syncing' ? 'Sincronizando...' : '✓ Sincronizado'}</span>
              </div>
            )}

            {/* Seletor de Mês Compacto */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {previousPeriodName && (
                <button
                  type="button"
                  onClick={() => handleMonthChange(previousPeriodName)}
                  className="min-h-[34px] px-2 rounded-lg bg-white hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center cursor-pointer transition-colors shadow-2xs"
                  title={`Mês anterior: ${previousPeriodName}`}
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </button>
              )}

              <select
                value={selectedMonthName}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="bg-transparent text-slate-950 font-bold text-xs sm:text-sm focus:outline-none cursor-pointer px-2 py-1"
              >
                {MONTHLY_SCHOOL_DAYS_2027.map((m) => {
                  const daysForClass = getClassSchoolDaysForMonth(classGroup, m.month);
                  return (
                    <option key={m.month} value={m.month}>
                      {m.month} ({daysForClass}d)
                    </option>
                  );
                })}
              </select>

              {nextPeriodName && (
                <button
                  type="button"
                  onClick={() => handleMonthChange(nextPeriodName)}
                  className="min-h-[34px] px-2 rounded-lg bg-white hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center cursor-pointer transition-colors shadow-2xs"
                  title={`Próximo mês: ${nextPeriodName}`}
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onBack}
              className="min-h-[36px] px-3.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              title="Salvo automaticamente. Concluir e voltar à turma"
            >
              <span className="material-symbols-outlined text-[16px] text-emerald-400">check</span>
              <span>Concluir</span>
            </button>
          </div>
        </div>

        {/* Linha 2: Faixa de Indicadores Rápidos em Linha Única (Sem 4 Cards Gigantes) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 min-w-0">
          <div className="min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-[#005035] flex items-center gap-1.5">
            <span>Presença Mês:</span>
            <span className="tabular-nums font-black">{liveClassMetrics.presenceRate}%</span>
            <span className="text-[11px] opacity-75">
              ({liveClassMetrics.totalPresencasTurma}/{liveClassMetrics.totalDiasMatriculadosTurma} dias)
            </span>
          </div>

          <div className="min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold bg-rose-50 text-rose-950 flex items-center gap-1.5">
            <span>Total Faltas:</span>
            <span className="tabular-nums font-black">{liveClassMetrics.totalFaltasTurma}</span>
            <span className="text-[11px] opacity-80">
              ({detailedIndicators.faltasSemAtestadoTurma} s/ atestado · {liveClassMetrics.totalAtestadosTurma} atestados)
            </span>
          </div>

          <div className="min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 text-slate-800 flex items-center gap-1.5">
            <span>Assiduidade:</span>
            <span className="tabular-nums font-bold text-slate-950">
              {detailedIndicators.countZeroFaltas} sem faltas
            </span>
            {detailedIndicators.countBelowLegal > 0 && (
              <span className="text-rose-700 font-bold text-[11px]">
                · {detailedIndicators.countBelowLegal} &lt; {minLegalPresence}%
              </span>
            )}
          </div>
        </div>

        {/* Linha 3: Busca Rápida + Filtros + Alternador de Visualização */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-[19px]">
              search
            </span>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Buscar por Nº da chamada ou nome do estudante..."
              className="w-full min-h-[44px] pl-10 pr-9 bg-slate-100 text-slate-950 text-xs sm:text-sm rounded-xl font-semibold placeholder:text-slate-500 focus:outline-none focus:bg-slate-200/70 transition-colors"
            />
            {searchName && (
              <button
                type="button"
                onClick={() => setSearchName('')}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setQuickFilter('all')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  quickFilter === 'all'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                Todos ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter('faltas')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  quickFilter === 'faltas'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'text-rose-900 hover:bg-rose-100'
                }`}
              >
                Com Faltas ({detailedIndicators.countWithFaltas})
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter('atestados')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  quickFilter === 'atestados'
                    ? 'bg-blue-800 text-white shadow-xs'
                    : 'text-blue-900 hover:bg-blue-100'
                }`}
              >
                Atestados ({detailedIndicators.countWithAtestados})
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setAttendanceViewMode('compact')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                  attendanceViewMode === 'compact'
                    ? 'bg-white text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">view_list</span>
                <span>Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setAttendanceViewMode('cards')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                  attendanceViewMode === 'cards'
                    ? 'bg-white text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                <span>Cartões</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* VISUALIZAÇÃO 1: LISTA LIMPA E DIRETA COM SUPERFÍCIES DE ALTO CONTRASTE TONAL */}
      {attendanceViewMode === 'compact' && (
        <div className="space-y-3">
          {displayedStudents.map((student) => {
            const m = getStudentAttendanceMetrics(student, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
            const pctFalta =
              m.diasLetivosMatriculados > 0
                ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
                : 0;
            const isMaxFaltasReached = m.faltas >= m.maxFaltasPermitidas;
            const isMaxAtestadosReached = m.atestados >= m.maxAtestadosPermitidos;

            const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
            const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
            const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
            const isOtherNonActive =
              !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';

            const isJustSaved = lastSavedStudentId === student.id && saveFlashState === 'saved';
            const isSavingThis = lastSavedStudentId === student.id && saveFlashState === 'saving';

            return (
              <div
                key={student.id}
                className={`p-4 sm:px-6 rounded-2xl shadow-sm hover:shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all duration-300 min-w-0 ${
                  isJustSaved
                    ? 'bg-emerald-50 ring-2 ring-emerald-500 shadow-md text-emerald-950 scale-[1.01]'
                    : isSavingThis
                    ? 'bg-amber-50 ring-2 ring-amber-400 text-amber-950 opacity-90'
                    : isTransferred
                    ? 'bg-amber-100/90 text-amber-950'
                    : isRemanejado
                    ? 'bg-purple-100/90 text-purple-950'
                    : isOtherNonActive
                    ? 'bg-slate-200 text-slate-900'
                    : m.isBelowLegalThreshold
                    ? 'bg-rose-100/70 text-slate-950'
                    : 'bg-white hover:bg-slate-50 text-slate-950'
                }`}
              >
                {/* Identificação Enxuta do Estudante + Indicativo Visual */}
                <div
                  onClick={() => onOpenStudentGrid(student)}
                  className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer"
                >
                  <span
                    className={`w-9 h-9 rounded-xl text-white font-mono font-bold text-sm flex items-center justify-center shrink-0 tabular-nums shadow-xs ${
                      isJustSaved
                        ? 'bg-emerald-700'
                        : isTransferred
                        ? 'bg-amber-900'
                        : isRemanejado
                        ? 'bg-purple-900'
                        : isOtherNonActive
                        ? 'bg-slate-700'
                        : 'bg-slate-950'
                    }`}
                  >
                    {student.number.toString().padStart(2, '0')}
                  </span>

                  <StudentAvatar
                    student={student}
                    size="lg"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-bold text-base sm:text-lg text-slate-950 break-words leading-snug">
                        {student.name}
                      </span>
                      {isJustSaved && (
                        <span className="sonner-tactile-pop px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">check</span>
                          <span>Salvo!</span>
                        </span>
                      )}
                      {isSavingThis && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-200 text-amber-950 text-xs font-bold flex items-center gap-1 animate-pulse">
                          <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                          <span>Salvando...</span>
                        </span>
                      )}
                      {isTransferred && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-900 text-white text-xs font-bold uppercase tracking-wide">
                          Transferido
                        </span>
                      )}
                      {isRemanejado && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-purple-900 text-white text-xs font-bold uppercase tracking-wide">
                          Remanejado
                        </span>
                      )}
                    </div>

                    {/* Indicadores Claros de Presença e Falta do Estudante */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-bold tabular-nums ${
                          m.isBelowLegalThreshold
                            ? 'bg-rose-200 text-rose-950'
                            : 'bg-emerald-100 text-emerald-950'
                        }`}
                      >
                        <span>Presença: {m.frequenciaPercent}%</span>
                        <span className="opacity-80">({m.presencas} de {m.diasLetivosMatriculados} dias)</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-bold tabular-nums ${
                          m.faltas > 0
                            ? 'bg-rose-200/90 text-rose-950'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        <span>Faltas: {m.faltas} ({pctFalta}%)</span>
                        <span>· Atestados: {m.atestados}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* CONTADORES INTERATIVOS DE ALTO CONTRASTE TONAL — SEM CONTORNOS, TÁTEIS */}
                <div className="grid grid-cols-1 min-[520px]:grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2.5 sm:gap-3 shrink-0 w-full lg:w-auto">
                  {/* Contador 1: Faltas do Mês */}
                  <div
                    className={`flex items-center justify-between sm:justify-start gap-2 sm:gap-3 px-3 sm:px-3.5 py-2.5 rounded-2xl transition-colors min-w-0 ${
                      m.faltas > 0
                        ? 'bg-rose-100 text-rose-950'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="pr-1 min-w-0">
                      <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-950 block leading-tight">
                        Faltas
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums block break-words">
                        máx {m.diasLetivosMatriculados}d
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeltaAbsence(student.id, -1)}
                        disabled={!effectiveCanEdit || m.faltas === 0}
                        aria-label={`Diminuir falta de ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        —
                      </button>

                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!effectiveCanEdit}
                        value={m.faltas}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleDirectSetAbsence(student.id, e.target.value)}
                        aria-label={`Digitar faltas de ${student.name}`}
                        title="Toque para digitar o número de faltas diretamente"
                        className={`w-11 sm:w-14 h-10 sm:h-12 rounded-xl text-center font-mono font-bold text-lg sm:text-2xl tabular-nums bg-white shadow-xs focus:ring-2 focus:ring-rose-600 focus:outline-none transition-all ${
                          m.faltas > 0 ? 'text-rose-950 font-bold' : 'text-slate-950 font-bold'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleDeltaAbsence(student.id, 1)}
                        disabled={!effectiveCanEdit || isMaxFaltasReached}
                        aria-label={`Adicionar falta para ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-950 hover:bg-black text-white font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Contador 2: Atestados */}
                  <div
                    className={`flex items-center justify-between sm:justify-start gap-2 sm:gap-3 px-3 sm:px-3.5 py-2.5 rounded-2xl transition-colors min-w-0 ${
                      m.atestados > 0
                        ? 'bg-sky-100 text-sky-950'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="pr-1 min-w-0">
                      <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-950 block leading-tight">
                        Atestado
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums block break-words">
                        {m.faltas === 0 ? '0 faltas' : `de ${m.faltas}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeltaAtestado(student.id, -1)}
                        disabled={!effectiveCanEdit || m.atestados === 0}
                        aria-label={`Diminuir atestado de ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white hover:bg-slate-200 text-sky-950 font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        —
                      </button>

                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!effectiveCanEdit || m.faltas === 0}
                        value={m.atestados}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleDirectSetAtestado(student.id, e.target.value)}
                        aria-label={`Digitar atestados de ${student.name}`}
                        title="Toque para digitar o número de atestados diretamente"
                        className={`w-11 sm:w-14 h-10 sm:h-12 rounded-xl text-center font-mono font-bold text-lg sm:text-2xl tabular-nums bg-white shadow-xs focus:ring-2 focus:ring-sky-600 focus:outline-none transition-all ${
                          m.atestados > 0 ? 'text-sky-950 font-bold' : 'text-slate-950 font-bold'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleDeltaAtestado(student.id, 1)}
                        disabled={!effectiveCanEdit || m.faltas === 0 || isMaxAtestadosReached}
                        aria-label={`Adicionar atestado para ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-800 hover:bg-sky-900 text-white font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VISUALIZAÇÃO 2: CARDS ENXUTOS (SOMENTE CONTADORES DE FALTAS DO MÊS E ATESTADOS) */}
      {attendanceViewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayedStudents.map((student) => {
            const m = getStudentAttendanceMetrics(student, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
            const pctFalta =
              m.diasLetivosMatriculados > 0
                ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
                : 0;
            const isMaxFaltasReached = m.faltas >= m.maxFaltasPermitidas;
            const isMaxAtestadosReached = m.atestados >= m.maxAtestadosPermitidos;

            const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
            const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
            const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
            const isOtherNonActive =
              !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';

            const isJustSaved = lastSavedStudentId === student.id && saveFlashState === 'saved';
            const isSavingThis = lastSavedStudentId === student.id && saveFlashState === 'saving';

            return (
              <div
                key={student.id}
                className={`rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md space-y-3.5 transition-all duration-300 min-w-0 ${
                  isJustSaved
                    ? 'bg-emerald-50 ring-2 ring-emerald-500 shadow-md text-emerald-950 scale-[1.01]'
                    : isSavingThis
                    ? 'bg-amber-50 ring-2 ring-amber-400 text-amber-950 opacity-90'
                    : isTransferred
                    ? 'bg-amber-100/90 text-amber-950'
                    : isRemanejado
                    ? 'bg-purple-100/90 text-purple-950'
                    : isOtherNonActive
                    ? 'bg-slate-200 text-slate-900'
                    : m.isBelowLegalThreshold
                    ? 'bg-rose-100/70 text-slate-950'
                    : 'bg-white hover:bg-slate-50 text-slate-950'
                }`}
              >
                {/* Topo do Card: Clique abre o perfil da criança + Nome + Indicativo de % */}
                <div
                  onClick={() => onOpenStudentGrid(student)}
                  className="flex items-start justify-between gap-3 cursor-pointer min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <StudentAvatar
                      student={student}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded-lg text-white font-mono text-xs font-bold tabular-nums ${
                          isJustSaved ? 'bg-emerald-700' : 'bg-slate-950'
                        }`}>
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        {isJustSaved && (
                          <span className="sonner-tactile-pop px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">check</span>
                            <span>Salvo!</span>
                          </span>
                        )}
                        {isSavingThis && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-200 text-amber-950 text-xs font-bold flex items-center gap-1 animate-pulse">
                            <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                            <span>Salvando...</span>
                          </span>
                        )}
                        {isTransferred && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-900 text-white text-xs font-bold uppercase">
                            Transferido
                          </span>
                        )}
                        {isRemanejado && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-purple-900 text-white text-xs font-bold uppercase">
                            Remanejado
                          </span>
                        )}
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-950 leading-snug break-words mt-1">
                        {student.name}
                      </h3>
                    </div>
                  </div>

                  {/* Indicativo de Presença & Falta */}
                  <div className="text-right shrink-0">
                    <span
                      className={`px-3 py-1 rounded-xl font-mono font-bold text-base tabular-nums inline-block ${
                        m.isBelowLegalThreshold
                          ? 'bg-rose-200 text-rose-950'
                          : 'bg-emerald-100 text-emerald-950'
                      }`}
                    >
                      {m.frequenciaPercent}%
                    </span>
                    <span className="block font-mono text-xs font-bold text-slate-700 mt-1 tabular-nums">
                      {m.presencas}/{m.diasLetivosMatriculados}d • {pctFalta}% falta
                    </span>
                  </div>
                </div>

                {/* Barra de Progresso de Presença do Estudante */}
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-100 ${
                      m.isBelowLegalThreshold ? 'bg-rose-600' : 'bg-emerald-700'
                    }`}
                    style={{ width: `${Math.min(100, m.frequenciaPercent)}%` }}
                  />
                </div>

                {/* CONTADORES: FALTAS DO MÊS E ATESTADOS — SEM CONTORNOS, SUPERFÍCIES SÓLIDAS */}
                <div className="grid grid-cols-1 min-[460px]:grid-cols-2 gap-2.5 pt-1">
                  {/* 1. Contador Faltas do Mês */}
                  <div
                    className={`p-3 rounded-2xl flex flex-col justify-between transition-colors min-w-0 ${
                      m.faltas > 0
                        ? 'bg-rose-100 text-rose-950'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2 gap-1">
                      <span className="text-xs sm:text-sm font-bold uppercase text-rose-950">
                        Faltas
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-700">
                        máx {m.diasLetivosMatriculados}d
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeltaAbsence(student.id, -1)}
                        disabled={!effectiveCanEdit || m.faltas === 0}
                        aria-label={`Diminuir falta de ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white text-slate-950 font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        —
                      </button>

                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!effectiveCanEdit}
                        value={m.faltas}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleDirectSetAbsence(student.id, e.target.value)}
                        aria-label={`Digitar faltas de ${student.name}`}
                        className={`w-12 sm:w-14 h-10 sm:h-12 rounded-xl text-center font-mono text-lg sm:text-2xl font-bold tabular-nums bg-white shadow-xs focus:ring-2 focus:ring-rose-600 focus:outline-none ${
                          m.faltas > 0 ? 'text-rose-950' : 'text-slate-950'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleDeltaAbsence(student.id, 1)}
                        disabled={!effectiveCanEdit || isMaxFaltasReached}
                        aria-label={`Adicionar falta para ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-950 text-white font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* 2. Contador Atestados */}
                  <div
                    className={`p-3 rounded-2xl flex flex-col justify-between transition-colors min-w-0 ${
                      m.atestados > 0
                        ? 'bg-sky-100 text-sky-950'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2 gap-1">
                      <span className="text-xs sm:text-sm font-bold uppercase text-sky-950">
                        Atestados
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {m.faltas === 0 ? '0 faltas' : `máx ${m.faltas}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeltaAtestado(student.id, -1)}
                        disabled={!effectiveCanEdit || m.atestados === 0}
                        aria-label={`Diminuir atestado de ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white text-sky-950 font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        —
                      </button>

                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!effectiveCanEdit || m.faltas === 0}
                        value={m.atestados}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleDirectSetAtestado(student.id, e.target.value)}
                        aria-label={`Digitar atestados de ${student.name}`}
                        className={`w-12 sm:w-14 h-10 sm:h-12 rounded-xl text-center font-mono text-lg sm:text-2xl font-bold tabular-nums bg-white shadow-xs focus:ring-2 focus:ring-sky-600 focus:outline-none ${
                          m.atestados > 0 ? 'text-sky-950' : 'text-slate-950'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleDeltaAtestado(student.id, 1)}
                        disabled={!effectiveCanEdit || m.faltas === 0 || isMaxAtestadosReached}
                        aria-label={`Adicionar atestado para ${student.name}`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-800 text-white font-bold text-xl sm:text-2xl flex items-center justify-center shadow-xs disabled:opacity-25 cursor-pointer active:scale-95 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resumo e Conclusão de Faltas do Mês */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 break-words">
            Faltas do Mês de {selectedMonthName}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5 break-words">
            Total de {liveClassMetrics.totalFaltasTurma} falta(s) registradas · {liveClassMetrics.presenceRate}% de presença global · Salvo automaticamente
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
          {previousPeriodName && (
            <button
              type="button"
              onClick={() => handleMonthChange(previousPeriodName)}
              className="w-full sm:w-auto min-h-[44px] py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors"
              title={`Voltar ao período anterior: ${previousPeriodName}`}
            >
              <span className="material-symbols-outlined text-[18px] text-slate-500 shrink-0">history</span>
              <span>Período Anterior ({previousPeriodName})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto min-h-[44px] py-2 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-emerald-400 shrink-0">check</span>
            <span>Concluir e Voltar</span>
          </button>
        </div>
      </section>
    </div>
  );
};
