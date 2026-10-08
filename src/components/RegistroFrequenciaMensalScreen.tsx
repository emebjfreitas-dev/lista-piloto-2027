import React, { useState, useEffect, useMemo } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import {
  MONTHLY_SCHOOL_DAYS_2027,
  OFFICIAL_OCTOBER_DAYS,
  getClassSchoolDaysForMonth,
} from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getClassAttendanceMetrics,
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
  onOpenStudentPdf,
}) => {
  const [selectedMonthName, setSelectedMonthName] = useState<string>('Outubro');
  const [diasLetivosMes, setDiasLetivosMes] = useState<number>(classGroup.classesHeld || 20);
  const [students, setStudents] = useState<Student[]>(classGroup.students);
  const [ruleAlertMessage, setRuleAlertMessage] = useState<string | null>(null);
  const [searchName, setSearchName] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'faltas' | 'atestados'>('all');
  const [attendanceViewMode, setAttendanceViewMode] = useState<'compact' | 'cards'>('compact');

  const selectedMonthMeta = useMemo(
    () => MONTHLY_SCHOOL_DAYS_2027.find((m) => m.month === selectedMonthName),
    [selectedMonthName]
  );
  const isPastMonth = Boolean(
    selectedMonthMeta && selectedMonthMeta.monthNumber < CURRENT_ACTIVE_MONTH_NUMBER
  );
  const isLockedBecausePastMonth = isPastMonth && userRole !== 'admin';
  const effectiveCanEdit = canEdit && !isLockedBecausePastMonth;

  useEffect(() => {
    setStudents(classGroup.students);
  }, [classGroup.students]);

  const triggerRuleAlert = (msg: string) => {
    setRuleAlertMessage(msg);
    window.setTimeout(() => {
      setRuleAlertMessage(null);
    }, 3000);
  };

  const commitInstantUpdate = (
    nextStudents: Student[],
    customMonthDays: number = diasLetivosMes,
    customMonthName: string = selectedMonthName
  ) => {
    setStudents(nextStudents);
    if (!effectiveCanEdit) return;

    const tempClass: ClassGroup = {
      ...classGroup,
      classesHeld: customMonthDays,
      classesPlanned: customMonthDays,
      students: nextStudents,
    };
    const classMetrics = getClassAttendanceMetrics(tempClass, OFFICIAL_OCTOBER_DAYS);
    const updatedClass: ClassGroup = {
      ...tempClass,
      presenceRate: classMetrics.presenceRate,
      monthlyAbsences: classMetrics.totalFaltasTurma,
      isPending: false,
      statusText: `Fechamento de ${customMonthName}: Sincronizado (${classMetrics.presenceRate}% de presença)`,
    };
    onSaveMonthlyAttendance(updatedClass);
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
      commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName);
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
      commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName);
    }
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
    <div className="flex flex-col w-full max-w-[1680px] mx-auto space-y-4 pb-36 animate-gentle-fade">
      {/* Alerta de regra caso tente ultrapassar limite de dias ou atestados */}
      {ruleAlertMessage && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-200">
          <div className="bg-[#be123c] text-white px-4 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20">
            <span className="material-symbols-outlined text-[24px]">warning</span>
            <p className="font-bold text-[0.86rem] leading-snug">{ruleAlertMessage}</p>
          </div>
        </div>
      )}

      {/* CABEÇALHO ENXUTO E COERENTE DA TURMA + CONTADORES E INDICATIVOS MELHORADOS */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 border border-black/[0.07] shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {classGroup.turmaAbrev && (
                <span className="px-2.5 py-0.5 rounded-lg bg-[#0b3b49] text-white font-mono text-[0.74rem] font-extrabold">
                  {classGroup.turmaAbrev}
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full bg-[#eaf6ef] text-[#006644] text-[0.72rem] font-extrabold uppercase tracking-wider">
                {classGroup.shift} • {classGroup.room}
              </span>
              {classGroup.classeSedCode && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#f1f5f9] text-[#334155] font-mono text-[0.72rem] font-bold">
                  Classe SED: {classGroup.classeSedCode}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#f8fafc] border border-black/[0.06] text-[0.72rem] font-bold text-[#006644]">
                <span
                  className={`w-2 h-2 rounded-full ${
                    instantSyncStatus === 'syncing'
                      ? 'bg-[#f59e0b] animate-ping'
                      : 'bg-[#006644]'
                  }`}
                />
                <span>
                  {instantSyncStatus === 'syncing'
                    ? 'Sincronizando na Planilha...'
                    : 'Sincronização Automática em Tempo Real'}
                </span>
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-[1.45rem] sm:text-[1.7rem] font-extrabold text-[#0f172a] tracking-tight">
                Lançamento de Faltas • Turma {classGroup.name}
              </h1>
              <span className="text-[0.82rem] font-semibold text-[#475569]">
                {classGroup.pronoun || 'PROFESSORA'} {classGroup.teacherName || 'Regente'} • {detailedIndicators.ativosCount} ativos ({students.length} na base)
              </span>
            </div>
          </div>

          {/* Seletor de Mês Enxuto */}
          <div className="flex items-center gap-2.5 bg-[#f8fafc] px-3.5 py-2 rounded-2xl border border-black/[0.07] shrink-0">
            <span className="material-symbols-outlined text-[20px] text-[#0b3b49]">
              calendar_month
            </span>
            <div>
              <label className="block text-[0.64rem] font-extrabold uppercase tracking-wider text-[#64748b]">
                Mês de Referência (2027)
              </label>
              <select
                value={selectedMonthName}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="bg-transparent text-[#0f172a] font-extrabold text-[0.9rem] focus:outline-none cursor-pointer pr-2"
              >
                {MONTHLY_SCHOOL_DAYS_2027.map((m) => {
                  const daysForClass = getClassSchoolDaysForMonth(classGroup, m.month);
                  return (
                    <option key={m.month} value={m.month}>
                      {m.month} ({daysForClass} dias letivos)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* PAINEL DE CONTADORES E INDICATIVOS DA TURMA (VISUAL CLARO E PRECISO) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Indicativo 1: Taxa de Presença da Turma */}
          <div className="rounded-2xl bg-[#eaf6ef]/75 border border-[#006644]/20 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#006644]">
                Presença Geral no Mês
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#006644] text-white font-mono text-[0.68rem] font-bold">
                {diasLetivosMes} dias letivos
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="text-[1.75rem] font-black text-[#006644] tabular-nums leading-none">
                {liveClassMetrics.presenceRate}%
              </span>
              <span className="text-[0.76rem] font-bold text-[#005035] tabular-nums">
                {liveClassMetrics.totalPresencasTurma}/{liveClassMetrics.totalDiasMatriculadosTurma} presenças
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#006644]/15 overflow-hidden mt-2">
              <div
                className="h-full bg-[#006644] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, liveClassMetrics.presenceRate)}%` }}
              />
            </div>
          </div>

          {/* Indicativo 2: Total de Faltas no Mês */}
          <div className="rounded-2xl bg-[#fff1f2]/85 border border-[#e11d48]/20 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#be123c]">
                Faltas Registradas ({selectedMonthName})
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#ffe4e6] text-[#be123c] font-mono text-[0.68rem] font-extrabold">
                {detailedIndicators.pctFaltaTurma}% ausência
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="text-[1.75rem] font-black text-[#be123c] tabular-nums leading-none">
                {liveClassMetrics.totalFaltasTurma}
              </span>
              <span className="text-[0.75rem] font-bold text-[#9f1239] tabular-nums">
                {detailedIndicators.countWithFaltas} aluno(s) c/ falta
              </span>
            </div>
            <div className="flex items-center justify-between text-[0.7rem] font-semibold text-[#9f1239] mt-2 pt-1.5 border-t border-[#e11d48]/15">
              <span>Sem atestado: {detailedIndicators.faltasSemAtestadoTurma}</span>
              <span>Com atestado: {liveClassMetrics.totalAtestadosTurma}</span>
            </div>
          </div>

          {/* Indicativo 3: Atestados Médicos no Mês */}
          <div className="rounded-2xl bg-[#f0f9ff]/90 border border-[#0284c7]/20 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#0369a1]">
                Atestados Apresentados
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#e0f2fe] text-[#0369a1] font-mono text-[0.68rem] font-extrabold">
                {detailedIndicators.pctAtestadosSobreFaltas}% das faltas
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="text-[1.75rem] font-black text-[#0c4a6e] tabular-nums leading-none">
                {liveClassMetrics.totalAtestadosTurma}
              </span>
              <span className="text-[0.75rem] font-bold text-[#0369a1] tabular-nums">
                {detailedIndicators.countWithAtestados} aluno(s) c/ atestado
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#0284c7]/15 overflow-hidden mt-2">
              <div
                className="h-full bg-[#0284c7] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, detailedIndicators.pctAtestadosSobreFaltas)}%` }}
              />
            </div>
          </div>

          {/* Indicativo 4: Assiduidade Plena vs Atenção de Frequência */}
          <div className="rounded-2xl bg-[#f8fafc] border border-black/[0.07] p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#475569]">
                Resumo de Assiduidade
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#f1f5f9] text-[#0b3b49] font-mono text-[0.68rem] font-bold">
                Mín. ≥{minLegalPresence}%
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1.5">
              <div>
                <span className="text-[1.5rem] font-black text-[#006644] tabular-nums leading-none">
                  {detailedIndicators.countZeroFaltas}
                </span>
                <span className="text-[0.72rem] font-bold text-[#475569] ml-1">
                  com 100% presença
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-lg font-mono text-[0.74rem] font-extrabold ${
                  detailedIndicators.countBelowLegal > 0
                    ? 'bg-[#ffe4e6] text-[#be123c]'
                    : 'bg-[#eaf6ef] text-[#006644]'
                }`}
              >
                {detailedIndicators.countBelowLegal} &lt;{minLegalPresence}%
              </span>
            </div>
            <div className="text-[0.7rem] font-semibold text-[#64748b] mt-2 pt-1.5 border-t border-black/[0.05]">
              Use apenas os botões <strong>—</strong> e <strong>+</strong> de Faltas e Atestados
            </div>
          </div>
        </div>

        {/* Barra Minimalista: Busca + Filtro Rápido + 2 Modos Limpos (Lista Rápida / Cards) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-black/[0.06]">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748b] text-[19px]">
              search
            </span>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Buscar por Nº da chamada ou nome do estudante..."
              className="w-full min-h-[40px] pl-10 pr-8 bg-[#f1f5f9] text-[#0f172a] text-[0.86rem] rounded-xl border border-transparent focus:border-[#006644]/40 focus:bg-white focus:outline-none font-medium placeholder:text-[#64748b]"
            />
            {searchName && (
              <button
                type="button"
                onClick={() => setSearchName('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">cancel</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <div className="ios-segmented">
              <button
                type="button"
                onClick={() => setQuickFilter('all')}
                className={`ios-segmented-item ${
                  quickFilter === 'all' ? 'ios-segmented-item-active' : ''
                }`}
              >
                Todos ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter('faltas')}
                className={`ios-segmented-item ${
                  quickFilter === 'faltas' ? 'ios-segmented-item-active text-[#be123c]' : ''
                }`}
              >
                Com Faltas ({detailedIndicators.countWithFaltas})
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter('atestados')}
                className={`ios-segmented-item ${
                  quickFilter === 'atestados' ? 'ios-segmented-item-active text-[#0369a1]' : ''
                }`}
              >
                Com Atestados ({detailedIndicators.countWithAtestados})
              </button>
            </div>

            <div className="ios-segmented">
              <button
                type="button"
                onClick={() => setAttendanceViewMode('compact')}
                className={`ios-segmented-item flex items-center gap-1 ${
                  attendanceViewMode === 'compact' ? 'ios-segmented-item-active' : ''
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">view_list</span>
                <span>Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setAttendanceViewMode('cards')}
                className={`ios-segmented-item flex items-center gap-1 ${
                  attendanceViewMode === 'cards' ? 'ios-segmented-item-active' : ''
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                <span>Cards</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* VISUALIZAÇÃO 1: LISTA LIMPA E DIRETA (SOMENTE CONTADORES DE FALTAS DO MÊS E ATESTADOS) */}
      {attendanceViewMode === 'compact' && (
        <div className="bg-white rounded-3xl border border-black/[0.07] divide-y divide-black/[0.05] overflow-hidden shadow-xs">
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

            return (
              <div
                key={student.id}
                className={`p-3.5 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors ${
                  isTransferred
                    ? 'bg-gradient-to-r from-[#fef3c7]/80 to-[#fffbeb] border-l-4 border-l-[#b45309]'
                    : isRemanejado
                    ? 'bg-gradient-to-r from-[#ede9fe]/80 to-[#f5f3ff] border-l-4 border-l-[#6d28d9]'
                    : isOtherNonActive
                    ? 'bg-[#e2e8f0]/75 border-l-4 border-l-[#475569]'
                    : m.isBelowLegalThreshold
                    ? 'bg-[#fff1f2]/60'
                    : 'hover:bg-[#f8fafc]'
                }`}
              >
                {/* Identificação Enxuta do Estudante + Indicativo Visual */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={`w-8 h-8 rounded-xl text-white font-mono font-extrabold text-[0.76rem] flex items-center justify-center shrink-0 tabular-nums ${
                      isTransferred
                        ? 'bg-[#b45309]'
                        : isRemanejado
                        ? 'bg-[#6d28d9]'
                        : isOtherNonActive
                        ? 'bg-[#475569]'
                        : 'bg-[#0b3b49]'
                    }`}
                  >
                    {student.number.toString().padStart(2, '0')}
                  </span>

                  <StudentAvatar
                    student={student}
                    size="md"
                    expandableOnClick={true}
                    onUploadPhotoClick={() => onOpenPhotoModal(student)}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-[0.95rem] text-[#0f172a] truncate">
                        {student.name}
                      </span>
                      {isTransferred && (
                        <span className="px-2 py-0.5 rounded-full bg-[#b45309] text-white text-[0.63rem] font-extrabold uppercase">
                          Transferido
                        </span>
                      )}
                      {isRemanejado && (
                        <span className="px-2 py-0.5 rounded-full bg-[#6d28d9] text-white text-[0.63rem] font-extrabold uppercase">
                          Remanejado
                        </span>
                      )}
                      {onOpenStudentPdf && (
                        <a
                          href={
                            student.fichaPdfDriveUrl ||
                            (student.fichaPdfDriveId
                              ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
                              : `#doc-${student.id}`)
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenStudentPdf(student);
                          }}
                          title={`Abrir Ficha Informativa Escaneada (${student.name}.pdf) no Google Drive`}
                          className="doc-hyperlink px-2 py-0.5 rounded-lg bg-white hover:bg-[#0b3b49] text-[#0b3b49] hover:!text-white border border-black/[0.08] font-bold text-[0.68rem] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            document_scanner
                          </span>
                          <span>Ficha (Drive)</span>
                        </a>
                      )}
                    </div>

                    {/* Indicadores Claros de Presença e Falta do Estudante */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[0.72rem] font-extrabold tabular-nums ${
                          m.isBelowLegalThreshold
                            ? 'bg-[#ffe4e6] text-[#be123c]'
                            : 'bg-[#eaf6ef] text-[#006644]'
                        }`}
                      >
                        <span>Presença: {m.frequenciaPercent}%</span>
                        <span className="opacity-75">({m.presencas}/{m.diasLetivosMatriculados}d)</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[0.72rem] font-extrabold tabular-nums ${
                          m.faltas > 0
                            ? 'bg-[#fff1f2] text-[#be123c] border border-[#e11d48]/20'
                            : 'bg-[#f1f5f9] text-[#64748b]'
                        }`}
                      >
                        <span>Falta: {pctFalta}%</span>
                        <span>({m.faltas}F · {m.atestados}A)</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* APENAS OS 2 CONTADORES INTERATIVOS: 1) FALTAS DO MÊS e 2) ATESTADOS */}
                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                  {/* Contador 1: Faltas do Mês */}
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-colors ${
                      m.faltas > 0
                        ? 'bg-[#fff1f2] border-[#e11d48]/30'
                        : 'bg-[#f8fafc] border-black/[0.08]'
                    }`}
                  >
                    <div className="pr-1">
                      <span className="text-[0.65rem] font-extrabold uppercase tracking-wider text-[#be123c] block leading-none">
                        Faltas do Mês
                      </span>
                      <span className="text-[0.65rem] font-mono font-semibold text-[#64748b] tabular-nums">
                        máx. {m.diasLetivosMatriculados}d
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeltaAbsence(student.id, -1)}
                      disabled={!effectiveCanEdit || m.faltas === 0}
                      aria-label={`Diminuir falta de ${student.name}`}
                      className="w-9 h-9 rounded-xl bg-white hover:bg-[#f1f5f9] text-[#0f172a] font-black text-[1.15rem] flex items-center justify-center shadow-2xs border border-black/[0.1] disabled:opacity-30 cursor-pointer active:scale-90 transition-transform"
                    >
                      —
                    </button>

                    <div className="w-10 text-center">
                      <span
                        className={`font-mono font-black text-[1.2rem] tabular-nums block leading-none ${
                          m.faltas > 0 ? 'text-[#be123c]' : 'text-[#006644]'
                        }`}
                      >
                        {m.faltas}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeltaAbsence(student.id, 1)}
                      disabled={!effectiveCanEdit || isMaxFaltasReached}
                      aria-label={`Adicionar falta para ${student.name}`}
                      className="w-9 h-9 rounded-xl bg-[#0b3b49] hover:bg-[#164e63] text-white font-black text-[1.15rem] flex items-center justify-center shadow-2xs disabled:opacity-30 cursor-pointer active:scale-90 transition-transform"
                    >
                      +
                    </button>
                  </div>

                  {/* Contador 2: Atestados */}
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-colors ${
                      m.atestados > 0
                        ? 'bg-[#f0f9ff] border-[#0284c7]/35'
                        : 'bg-[#f8fafc] border-black/[0.08]'
                    }`}
                  >
                    <div className="pr-1">
                      <span className="text-[0.65rem] font-extrabold uppercase tracking-wider text-[#0369a1] block leading-none">
                        Atestados
                      </span>
                      <span className="text-[0.65rem] font-mono font-semibold text-[#64748b] tabular-nums">
                        {m.faltas === 0 ? '0 faltas' : `de ${m.faltas} falta(s)`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeltaAtestado(student.id, -1)}
                      disabled={!effectiveCanEdit || m.atestados === 0}
                      aria-label={`Diminuir atestado de ${student.name}`}
                      className="w-9 h-9 rounded-xl bg-white hover:bg-[#f1f5f9] text-[#0369a1] font-black text-[1.15rem] flex items-center justify-center shadow-2xs border border-[#0284c7]/25 disabled:opacity-30 cursor-pointer active:scale-90 transition-transform"
                    >
                      —
                    </button>

                    <div className="w-9 text-center">
                      <span
                        className={`font-mono font-black text-[1.2rem] tabular-nums block leading-none ${
                          m.atestados > 0 ? 'text-[#0369a1]' : 'text-[#64748b]'
                        }`}
                      >
                        {m.atestados}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeltaAtestado(student.id, 1)}
                      disabled={!effectiveCanEdit || m.faltas === 0 || isMaxAtestadosReached}
                      aria-label={`Adicionar atestado para ${student.name}`}
                      className="w-9 h-9 rounded-xl bg-[#0369a1] hover:bg-[#075985] text-white font-black text-[1.15rem] flex items-center justify-center shadow-2xs disabled:opacity-30 cursor-pointer active:scale-90 transition-transform"
                    >
                      +
                    </button>
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

            return (
              <div
                key={student.id}
                className={`card-welcoming rounded-3xl p-4 border space-y-3 ${
                  isTransferred
                    ? 'bg-gradient-to-br from-[#fef3c7] via-[#fffbeb] to-[#fde68a]/60 border-2 border-[#d97706]/55'
                    : isRemanejado
                    ? 'bg-gradient-to-br from-[#ede9fe] via-[#f5f3ff] to-[#ddd6fe]/60 border-2 border-[#7c3aed]/50'
                    : isOtherNonActive
                    ? 'bg-[#e2e8f0] border-[#64748b]/50'
                    : m.isBelowLegalThreshold
                    ? 'bg-[#fff9f9] border-[#e11d48]/40'
                    : 'bg-white border-black/[0.07]'
                }`}
              >
                {/* Topo do Card: Foto (upload apenas ao clicar na foto) + Nome + Indicativo de % */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <StudentAvatar
                      student={student}
                      size="lg"
                      expandableOnClick={true}
                      onUploadPhotoClick={() => onOpenPhotoModal(student)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-lg bg-[#0b3b49] text-white font-mono text-[0.72rem] font-extrabold tabular-nums">
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        {isTransferred && (
                          <span className="px-2 py-0.5 rounded-full bg-[#b45309] text-white text-[0.64rem] font-extrabold uppercase">
                            Transferido
                          </span>
                        )}
                        {isRemanejado && (
                          <span className="px-2 py-0.5 rounded-full bg-[#6d28d9] text-white text-[0.64rem] font-extrabold uppercase">
                            Remanejado
                          </span>
                        )}
                      </div>
                      <h3 className="text-[0.96rem] font-extrabold text-[#0f172a] leading-snug truncate mt-1">
                        {student.name}
                      </h3>
                      {onOpenStudentPdf && (
                        <a
                          href={
                            student.fichaPdfDriveUrl ||
                            (student.fichaPdfDriveId
                              ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
                              : `#doc-${student.id}`)
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenStudentPdf(student);
                          }}
                          className="doc-hyperlink inline-flex items-center gap-1 text-[0.7rem] font-bold text-[#0b3b49] hover:underline mt-0.5"
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            document_scanner
                          </span>
                          <span>Ficha Informativa (Drive)</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Indicativo de Presença & Falta */}
                  <div className="text-right shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-xl font-mono font-black text-[1.05rem] tabular-nums inline-block ${
                        m.isBelowLegalThreshold
                          ? 'bg-[#ffe4e6] text-[#be123c]'
                          : 'bg-[#eaf6ef] text-[#006644]'
                      }`}
                    >
                      {m.frequenciaPercent}%
                    </span>
                    <span className="block font-mono text-[0.68rem] font-bold text-[#475569] mt-0.5 tabular-nums">
                      {m.presencas}/{m.diasLetivosMatriculados}d • {pctFalta}% falta
                    </span>
                  </div>
                </div>

                {/* Barra de Progresso de Presença do Estudante */}
                <div className="w-full h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      m.isBelowLegalThreshold ? 'bg-[#be123c]' : 'bg-[#006644]'
                    }`}
                    style={{ width: `${Math.min(100, m.frequenciaPercent)}%` }}
                  />
                </div>

                {/* APENAS OS 2 CONTADORES: FALTAS DO MÊS E ATESTADOS */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {/* 1. Contador Faltas do Mês */}
                  <div
                    className={`p-2.5 rounded-2xl border flex flex-col justify-between ${
                      m.faltas > 0
                        ? 'bg-[#fff1f2] border-[#e11d48]/30'
                        : 'bg-[#f8fafc] border-black/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[0.7rem] font-extrabold uppercase text-[#be123c]">
                        Faltas Mês
                      </span>
                      <span className="font-mono text-[0.66rem] font-bold text-[#64748b]">
                        máx {m.diasLetivosMatriculados}d
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeltaAbsence(student.id, -1)}
                        disabled={!effectiveCanEdit || m.faltas === 0}
                        className="w-10 h-10 rounded-xl bg-white text-[#0f172a] font-black text-[1.25rem] flex items-center justify-center border border-black/[0.1] shadow-2xs disabled:opacity-30 cursor-pointer active:scale-90"
                      >
                        —
                      </button>

                      <div className="text-center">
                        <span
                          className={`font-mono text-[1.35rem] font-black tabular-nums leading-none block ${
                            m.faltas > 0 ? 'text-[#be123c]' : 'text-[#006644]'
                          }`}
                        >
                          {m.faltas}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeltaAbsence(student.id, 1)}
                        disabled={!effectiveCanEdit || isMaxFaltasReached}
                        className="w-10 h-10 rounded-xl bg-[#0b3b49] text-white font-black text-[1.25rem] flex items-center justify-center shadow-2xs disabled:opacity-30 cursor-pointer active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* 2. Contador Atestados */}
                  <div
                    className={`p-2.5 rounded-2xl border flex flex-col justify-between ${
                      m.atestados > 0
                        ? 'bg-[#f0f9ff] border-[#0284c7]/30'
                        : 'bg-[#f8fafc] border-black/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[0.7rem] font-extrabold uppercase text-[#0369a1]">
                        Atestados
                      </span>
                      <span className="font-mono text-[0.66rem] font-bold text-[#64748b]">
                        {m.faltas === 0 ? '0 faltas' : `máx ${m.faltas}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeltaAtestado(student.id, -1)}
                        disabled={!effectiveCanEdit || m.atestados === 0}
                        className="w-10 h-10 rounded-xl bg-white text-[#0369a1] font-black text-[1.25rem] flex items-center justify-center border border-[#0284c7]/25 shadow-2xs disabled:opacity-30 cursor-pointer active:scale-90"
                      >
                        —
                      </button>

                      <div className="text-center">
                        <span
                          className={`font-mono text-[1.35rem] font-black tabular-nums leading-none block ${
                            m.atestados > 0 ? 'text-[#0369a1]' : 'text-[#64748b]'
                          }`}
                        >
                          {m.atestados}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeltaAtestado(student.id, 1)}
                        disabled={!effectiveCanEdit || m.faltas === 0 || isMaxAtestadosReached}
                        className="w-10 h-10 rounded-xl bg-[#0369a1] text-white font-black text-[1.25rem] flex items-center justify-center shadow-2xs disabled:opacity-30 cursor-pointer active:scale-90"
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
    </div>
  );
};
