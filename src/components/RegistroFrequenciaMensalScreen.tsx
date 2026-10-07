import React, { useState, useEffect, useMemo } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { downloadClassCSV } from '../services/db';
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

const CURRENT_ACTIVE_MONTH_NUMBER = 10; // Outubro é o mês ativo de referência; meses anteriores (Fev..Set) são meses passados

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
  onNavigateToSheet,
  onBack,
}) => {
  const [selectedMonthName, setSelectedMonthName] = useState<string>('Outubro');
  const [diasLetivosMes, setDiasLetivosMes] = useState<number>(classGroup.classesHeld || 20);
  const [students, setStudents] = useState<Student[]>(classGroup.students);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    students: Student[];
    description: string;
  } | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [ruleAlertMessage, setRuleAlertMessage] = useState<string | null>(null);
  const [searchName, setSearchName] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'faltas' | 'atestados'>('all');

  // Check if selectedMonthName is a past month (Meses passados: usuários comuns não podem alterar, apenas ADMIN)
  const selectedMonthMeta = useMemo(
    () => MONTHLY_SCHOOL_DAYS_2027.find((m) => m.month === selectedMonthName),
    [selectedMonthName]
  );
  const isPastMonth = Boolean(
    selectedMonthMeta && selectedMonthMeta.monthNumber < CURRENT_ACTIVE_MONTH_NUMBER
  );
  const isLockedBecausePastMonth = isPastMonth && userRole !== 'admin';
  const effectiveCanEdit = canEdit && !isLockedBecausePastMonth;

  // Sync students when classGroup updates (e.g. from interactive grid modal)
  useEffect(() => {
    setStudents(classGroup.students);
  }, [classGroup.students]);

  // Modal for Atestado Notes
  const [justifyingStudent, setJustifyingStudent] = useState<Student | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Modal for Student Enrollment Window ("Recorte da Matrícula no Mês")
  const [recorteStudent, setRecorteStudent] = useState<Student | null>(null);
  const [recorteDaysInput, setRecorteDaysInput] = useState<number>(20);
  const [entryDateInput, setEntryDateInput] = useState<string>('');
  const [exitDateInput, setExitDateInput] = useState<string>('');
  const [situacaoInput, setSituacaoInput] = useState<string>('ATIVO');

  const triggerRuleAlert = (msg: string) => {
    setRuleAlertMessage(msg);
    setTimeout(() => {
      setRuleAlertMessage(null);
    }, 3200);
  };

  // Helper that immediately propagates updated students to App state + Nominal Tabs + Google Sheets (0ms wait for PEB I / Usuário)
  const commitInstantUpdate = (
    nextStudents: Student[],
    customMonthDays: number = diasLetivosMes,
    customMonthName: string = selectedMonthName,
    actionDescription?: string
  ) => {
    if (actionDescription) {
      setUndoSnapshot({
        students: [...students],
        description: actionDescription,
      });
    }
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
      statusText: `Fechamento de ${customMonthName}: Sincronizado Instantaneamente (${classMetrics.presenceRate}% de presença no recorte)`,
    };
    onSaveMonthlyAttendance(updatedClass);
  };

  const handleUndoLastAction = () => {
    if (!undoSnapshot || !effectiveCanEdit) return;
    const restored = undoSnapshot.students;
    setUndoSnapshot(null);
    commitInstantUpdate(restored, diasLetivosMes, selectedMonthName);
  };

  // Switch month and adjust total school days of that month (per class configuration)
  const handleMonthChange = (monthName: string) => {
    const newMonthDays = getClassSchoolDaysForMonth(classGroup, monthName);
    setSelectedMonthName(monthName);
    setDiasLetivosMes(newMonthDays);

    const nextStudents = students.map((s) => {
      const currentMetrics = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      const nextRecorte = currentMetrics.isMesCheio
        ? newMonthDays
        : Math.min(newMonthDays, currentMetrics.diasLetivosMatriculados);
      const nextFaltas = Math.min(nextRecorte, s.totalAbsencesMonth);
      const nextAtestados = Math.min(nextFaltas, s.justifiedAbsences || 0);
      return {
        ...s,
        diasLetivosRecorte: nextRecorte,
        totalAbsencesMonth: nextFaltas,
        justifiedAbsences: nextAtestados,
      };
    });
    commitInstantUpdate(nextStudents, newMonthDays, monthName);
  };

  // Change absences (+1 or -1) enforcing:
  // 1) 0 <= faltas <= diasLetivosMatriculados (recorte da matrícula no mês)
  // 2) atestados <= faltas (se diminuir faltas, atestados acompanha)
  // 3) Instantaneous update to the Nominal Sheet Tab & Google Sheets on every click
  const handleDeltaAbsence = (studentId: string, delta: number) => {
    if (!effectiveCanEdit) return;
    let blocked = false;
    let studentLabel = '';
    const nextStudents: Student[] = students.map((s) => {
      if (s.id !== studentId) return s;
      studentLabel = s.name.split(' ')[0];
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);

      if (delta > 0 && m.faltas >= m.diasLetivosMatriculados) {
        triggerRuleAlert(
          `Limite atingido: ${s.name} possui ${m.diasLetivosMatriculados} dias letivos no recorte da matrícula neste mês.`
        );
        blocked = true;
        return s;
      }

      const nextFaltas = Math.max(0, Math.min(m.diasLetivosMatriculados, m.faltas + delta));
      const nextAtestados = Math.min(nextFaltas, m.atestados);

      return {
        ...s,
        totalAbsencesMonth: nextFaltas,
        justifiedAbsences: nextAtestados,
        status: nextFaltas > 0 ? 'absent' : 'present',
        alert: nextFaltas >= 4 ? `Atenção: ${nextFaltas} faltas acumuladas` : undefined,
      };
    });

    if (!blocked) {
      commitInstantUpdate(
        nextStudents,
        diasLetivosMes,
        selectedMonthName,
        `Falta de ${studentLabel}`
      );
    }
  };

  // Change quantity of medical certificates/atestados presented (+1 or -1) enforcing:
  // 0 <= atestados <= faltas
  // Instantaneous update to the Nominal Sheet Tab & Google Sheets on every click
  const handleDeltaAtestado = (studentId: string, delta: number) => {
    if (!effectiveCanEdit) return;
    let blocked = false;
    let studentLabel = '';
    const nextStudents: Student[] = students.map((s) => {
      if (s.id !== studentId) return s;
      studentLabel = s.name.split(' ')[0];
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);

      if (delta > 0 && m.faltas === 0) {
        triggerRuleAlert(
          `Não é possível adicionar atestado para ${s.name} pois o(a) estudante tem 0 faltas.`
        );
        blocked = true;
        return s;
      }

      if (delta > 0 && m.atestados >= m.faltas) {
        triggerRuleAlert(
          `A quantidade de atestados (${m.atestados}) não pode ser maior que o total de faltas (${m.faltas}).`
        );
        blocked = true;
        return s;
      }

      const nextAtestados = Math.max(0, Math.min(m.faltas, m.atestados + delta));
      return {
        ...s,
        justifiedAbsences: nextAtestados,
      };
    });

    if (!blocked) {
      commitInstantUpdate(
        nextStudents,
        diasLetivosMes,
        selectedMonthName,
        `Atestado de ${studentLabel}`
      );
    }
  };

  // Open Recorte da Matrícula modal for a student
  const handleOpenRecorteModal = (student: Student) => {
    if (!effectiveCanEdit) return;
    const m = getStudentAttendanceMetrics(student, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
    setRecorteStudent(student);
    setRecorteDaysInput(m.diasLetivosMatriculados);
    setEntryDateInput(student.dataMatriculaSed || '03/02/2027');
    setExitDateInput(student.dataMovimentacao || '');
    setSituacaoInput(student.situacao || 'ATIVO');
  };

  // Save Recorte da Matrícula and automatically clamp Faltas and Atestados
  const handleSaveRecorteModal = () => {
    if (!recorteStudent || !effectiveCanEdit) return;
    const validDays = Math.max(1, Math.min(diasLetivosMes, recorteDaysInput));

    const nextStudents: Student[] = students.map((s) => {
      if (s.id !== recorteStudent.id) return s;
      const clampedFaltas = Math.min(validDays, s.totalAbsencesMonth);
      const clampedAtestados = Math.min(clampedFaltas, s.justifiedAbsences || 0);
      return {
        ...s,
        diasLetivosRecorte: validDays,
        dataMatriculaSed: entryDateInput.trim() || '03/02/2027',
        dataMovimentacao: exitDateInput.trim() || undefined,
        situacao: situacaoInput,
        totalAbsencesMonth: clampedFaltas,
        justifiedAbsences: clampedAtestados,
        status: clampedFaltas > 0 ? 'absent' : 'present',
      };
    });
    commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName, `Recorte de ${recorteStudent.name.split(' ')[0]}`);
    setRecorteStudent(null);
  };

  // Save changes to database calculating class rate over the enrollment window
  const handleSave = () => {
    if (!effectiveCanEdit) return;
    commitInstantUpdate(students);
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
    }, 3500);
  };

  const handleOpenJustifyModal = (student: Student) => {
    if (!effectiveCanEdit) return;
    setJustifyingStudent(student);
    setNoteInput(student.notes || '');
  };

  const handleSaveNote = () => {
    if (!justifyingStudent || !effectiveCanEdit) return;
    const nextStudents = students.map((s) =>
      s.id === justifyingStudent.id ? { ...s, notes: noteInput } : s
    );
    commitInstantUpdate(nextStudents);
    setJustifyingStudent(null);
  };

  // 1-Click Helper for Lay Users: Mark all students as 0 absences (100% presence)
  const handleMarkAllZeroAbsences = () => {
    if (!effectiveCanEdit) return;
    const nextStudents: Student[] = students.map((s) => ({
      ...s,
      totalAbsencesMonth: 0,
      justifiedAbsences: 0,
      status: 'present',
      alert: undefined,
    }));
    commitInstantUpdate(nextStudents, diasLetivosMes, selectedMonthName, 'Zerar faltas da turma');
  };

  // Memoized live class metrics based on current students state (0ms lag)
  const liveClassMetrics = useMemo(
    () =>
      getClassAttendanceMetrics(
        { ...classGroup, classesHeld: diasLetivosMes, students },
        OFFICIAL_OCTOBER_DAYS
      ),
    [classGroup, diasLetivosMes, students]
  );

  const countWithFaltas = useMemo(
    () => students.filter((s) => (s.totalAbsencesMonth || 0) > 0).length,
    [students]
  );
  const countWithAtestados = useMemo(
    () => students.filter((s) => (s.justifiedAbsences || 0) > 0).length,
    [students]
  );

  // Memoized filter for students
  const displayedStudents = useMemo(() => {
    const q = searchName.toLowerCase().trim();
    return students.filter((s) => {
      const matchesText =
        q === '' ||
        s.name.toLowerCase().includes(q) ||
        s.number.toString() === q;
      if (!matchesText) return false;
      if (quickFilter === 'faltas') return (s.totalAbsencesMonth || 0) > 0;
      if (quickFilter === 'atestados') return (s.justifiedAbsences || 0) > 0;
      return true;
    });
  }, [students, searchName, quickFilter]);

  return (
    <div className="flex flex-col w-full max-w-xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto space-y-4 pb-48">
      {/* Toast Feedback */}
      {showSavedToast && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-200">
          <div className="bg-[#003723] text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-[#a4f3ca]">
            <span className="material-symbols-outlined text-[36px] text-[#a4f3ca]">check_circle</span>
            <div>
              <p className="font-extrabold text-[1.125rem]">Tudo Salvo na Planilha!</p>
              <p className="text-[0.875rem] text-[#a4f3ca]">
                Frequência da turma ({liveClassMetrics.presenceRate}%) calculada pelo recorte de matrícula de cada estudante.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rule Alert Toast */}
      {ruleAlertMessage && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-200">
          <div className="bg-[#ba1a1a] text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-[#ffdad6]">
            <span className="material-symbols-outlined text-[32px] text-[#ffdad6]">warning</span>
            <p className="font-bold text-[0.95rem] leading-snug">{ruleAlertMessage}</p>
          </div>
        </div>
      )}

      {/* Past Month Lock Banner for Non-Admin Users */}
      {isLockedBecausePastMonth && (
        <div className="bg-[#fff4e5] border-2 border-[#7a4100]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[#7a4100] animate-gentle-fade">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[30px] shrink-0">history_toggle_off</span>
            <div>
              <p className="font-black text-[1rem]">
                Mês Passado ({selectedMonthName}) — Fechado para Alterações de Usuários
              </p>
              <p className="text-[0.85rem] font-semibold">
                Meses já encerrados só podem ser alterados por perfil <strong>ADMIN</strong>. Para lançar faltas, selecione o mês ativo (<strong>Outubro</strong>).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleMonthChange('Outubro')}
            className="min-h-[42px] px-4 rounded-xl bg-[#003440] text-white font-black text-[0.82rem] shrink-0 cursor-pointer"
          >
            Voltar para Outubro (Mês Ativo)
          </button>
        </div>
      )}

      {/* Read-Only Banner for PEB II or Closed Launch Window */}
      {!canEdit && !isLockedBecausePastMonth && (
        <div className="bg-[#fff4e5] border-2 border-[#ffd89e] rounded-2xl p-4 flex items-center gap-3 text-[#7a4100] animate-gentle-fade">
          <span className="material-symbols-outlined text-[30px] shrink-0">visibility</span>
          <div>
            <p className="font-black text-[1rem]">
              Modo Consulta — Somente Visualização
            </p>
            <p className="text-[0.85rem] font-medium">
              Você pode consultar qualquer estudante e tocar no cartão para abrir a <strong>Grade de Dados Interativa</strong>. O lançamento de faltas está bloqueado neste momento.
            </p>
          </div>
        </div>
      )}

      {/* Senior-Friendly Header Box */}
      <section className="card-welcoming bg-white rounded-2xl p-5 border border-[#003440]/12 space-y-4 animate-gentle-fade">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1 text-[0.76rem] font-extrabold uppercase tracking-wider text-[#005035]">
              <span>{classGroup.shift} · Ano Letivo 2027</span>
              {effectiveCanEdit && (
                <>
                  <span aria-hidden="true" className="text-[#a8b5b9]">·</span>
                  <span className="inline-flex items-center gap-1.5 text-[#005035] normal-case tracking-normal font-bold">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        instantSyncStatus === 'syncing'
                          ? 'bg-[#e5b324] animate-ping'
                          : 'bg-[#005035]'
                      }`}
                    ></span>
                    <span>
                      {instantSyncStatus === 'syncing'
                        ? 'Salvando automaticamente na Planilha...'
                        : 'Salvo automaticamente na Planilha da Escola'}
                    </span>
                  </span>
                </>
              )}
              {isPastMonth && userRole === 'admin' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#003440] text-white font-bold text-[0.72rem] normal-case tracking-normal">
                  <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                  <span>Admin · Mês Passado ({selectedMonthName}) Liberado</span>
                </span>
              )}
            </div>
            <h1 className="text-[1.55rem] font-extrabold text-[#003440] leading-tight">
              {classGroup.name}
            </h1>
            <p className="text-[0.88rem] text-[#374346] font-medium">
              Toque em <strong>+</strong> ou <strong>—</strong> para registrar faltas e atestados: o sistema grava automaticamente na Planilha Google.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {effectiveCanEdit && undoSnapshot && (
              <button
                onClick={handleUndoLastAction}
                type="button"
                title={`Desfazer última alteração: ${undoSnapshot.description}`}
                className="px-3.5 min-h-[44px] bg-[#fff4e5] hover:bg-[#ffe4bd] text-[#7a4100] rounded-xl font-black text-[0.84rem] flex items-center gap-1.5 border-2 border-[#7a4100]/30 cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">undo</span>
                <span>Desfazer ({undoSnapshot.description})</span>
              </button>
            )}

            {effectiveCanEdit && (
              <button
                onClick={handleMarkAllZeroAbsences}
                type="button"
                title="Marcar todos os estudantes com 0 faltas neste mês"
                className="px-3.5 min-h-[44px] bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#003723] rounded-xl font-extrabold text-[0.85rem] flex items-center gap-1.5 border-2 border-[#005035]/30 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">done_all</span>
                <span>Zerar Faltas (100% Presença)</span>
              </button>
            )}

            {userRole === 'admin' && (
              <button
                onClick={onNavigateToSheet}
                type="button"
                title="Ver Tabulação Nominal de Faltas e Atestados na Planilha Banco de Dados"
                className="px-3.5 min-h-[44px] bg-[#003440] hover:bg-[#1e4b58] text-white rounded-xl font-extrabold text-[0.85rem] flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">table_chart</span>
                <span>Ver Aba Nominal na Planilha</span>
              </button>
            )}

            <button
              onClick={() =>
                downloadClassCSV({
                  ...classGroup,
                  classesHeld: diasLetivosMes,
                  students,
                })
              }
              type="button"
              title="Baixar planilha desta turma"
              className="px-3.5 min-h-[44px] bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#005035] rounded-xl font-bold text-[0.85rem] flex items-center gap-1.5 border-2 border-[#a4f3ca] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              <span>Baixar Turma</span>
            </button>
          </div>
        </div>

        {/* Month & Official School Days Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#f3f4f2] p-3.5 rounded-2xl border-2 border-[#b4c0c4]/80">
          <div>
            <label className="block text-[0.8rem] font-extrabold text-[#003440] uppercase mb-1">
              Mês de Referência (2027) — Meses Passados Somente Admin:
            </label>
            <select
              value={selectedMonthName}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="w-full min-h-[46px] px-3 bg-white text-[#003440] font-extrabold text-[0.96rem] rounded-xl border-2 border-[#b4c0c4] cursor-pointer"
            >
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => {
                const daysForClass = getClassSchoolDaysForMonth(classGroup, m.month);
                const isPast = m.monthNumber < CURRENT_ACTIVE_MONTH_NUMBER;
                const isCurrent = m.monthNumber === CURRENT_ACTIVE_MONTH_NUMBER;
                return (
                  <option key={m.month} value={m.month}>
                    {m.month} ({daysForClass} dias letivos)
                    {isCurrent
                      ? ' • [MÊS ATUAL ABERTO]'
                      : isPast
                      ? userRole === 'admin'
                        ? ' • [Mês Passado - Liberado p/ Admin]'
                        : ' • [Mês Passado - Somente Leitura]'
                      : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex flex-col justify-center bg-white rounded-xl p-3 border border-[#e1e3e1]">
            <div className="flex items-center justify-between">
              <span className="text-[0.8rem] font-bold text-[#71787b]">Dias Letivos no Mês:</span>
              <span className="text-[1.1rem] font-black text-[#003440]">{diasLetivosMes} dias</span>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-[#edeeec]">
              <span className="text-[0.8rem] font-bold text-[#005035]">Frequência da Turma:</span>
              <span className="text-[1.15rem] font-black text-[#005035]">
                {liveClassMetrics.presenceRate}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Quick Filter Bar: Stacked on Mobile, Side-by-Side on PC 1920x1080 */}
      <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center">
        <div className="relative lg:col-span-7">
          <span className="material-symbols-outlined absolute left-4 text-[#71787b] text-[24px] top-3.5">
            search
          </span>
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Buscar estudante por nome ou número da chamada..."
            className="w-full min-h-[52px] pl-12 pr-10 bg-white text-[#191c1b] text-[1rem] rounded-2xl border-2 border-[#c0c8cb] focus:border-[#003440] focus:outline-none shadow-xs font-semibold placeholder:text-[#71787b]"
          />
          {searchName && (
            <button
              onClick={() => setSearchName('')}
              className="absolute right-3.5 top-3.5 text-[#71787b] hover:text-[#191c1b] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">cancel</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 lg:col-span-5">
          <button
            type="button"
            onClick={() => setQuickFilter('all')}
            className={`min-h-[50px] rounded-2xl font-extrabold text-[0.84rem] border-2 cursor-pointer transition-all ${
              quickFilter === 'all'
                ? 'bg-[#003440] text-white border-[#003440]'
                : 'bg-white text-[#41484b] border-[#c0c8cb] hover:bg-[#f3f4f2]'
            }`}
          >
            Todos ({students.length})
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter('faltas')}
            className={`min-h-[50px] rounded-2xl font-extrabold text-[0.84rem] border-2 cursor-pointer transition-all ${
              quickFilter === 'faltas'
                ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]'
                : 'bg-white text-[#ba1a1a] border-[#ffdad6] hover:bg-[#fff8f7]'
            }`}
          >
            Com Faltas ({countWithFaltas})
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter('atestados')}
            className={`min-h-[50px] rounded-2xl font-extrabold text-[0.84rem] border-2 cursor-pointer transition-all ${
              quickFilter === 'atestados'
                ? 'bg-[#005035] text-white border-[#005035]'
                : 'bg-white text-[#005035] border-[#a4f3ca] hover:bg-[#eaf6ef]'
            }`}
          >
            Com Atestado ({countWithAtestados})
          </button>
        </div>
      </div>

      {/* Student Rows List: 1 col Mobile, 2 cols Tablet/Laptop, 3 cols Full HD 1920x1080 21" */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayedStudents.map((student) => {
          const m = getStudentAttendanceMetrics(student, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
          const hasAbsence = m.faltas > 0;
          const isMaxFaltasReached = m.faltas >= m.maxFaltasPermitidas;
          const isMaxAtestadosReached = m.atestados >= m.maxAtestadosPermitidos;

          return (
            <div
              key={student.id}
              className={`card-welcoming bg-white rounded-2xl p-4 shadow-xs border-2 ${
                m.faltas >= 4
                  ? 'border-[#ba1a1a]/60 bg-[#fff8f7]'
                  : !m.isMesCheio
                  ? 'border-[#003440]/40'
                  : 'border-[#b4c0c4]/80'
              }`}
            >
              {/* Student Header (Clickable to open Interactive Data Grid) */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b-2 border-[#edeeec]">
                <div
                  onClick={() => onOpenStudentGrid(student)}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
                  title="Clique para abrir a Ficha Completa deste(a) estudante"
                >
                  <div className="relative shrink-0">
                    <StudentAvatar student={student} size="lg" />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#003440] text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-[13px]">grid_on</span>
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.8rem] font-bold text-[#71787b]">
                        Nº {student.number.toString().padStart(2, '0')}
                      </span>
                      {student.ra && (
                        <span className="text-[0.7rem] bg-[#edeeec] px-1.5 py-0.2 rounded font-mono text-[#003440]">
                          RA: {student.ra}-{student.digRa}
                        </span>
                      )}
                      {student.situacao && student.situacao !== 'ATIVO' && (
                        <span className="text-[0.7rem] font-extrabold bg-[#ffdad6] text-[#ba1a1a] px-2 py-0.5 rounded-full">
                          {student.situacao}
                        </span>
                      )}
                      {student.deficiencia && (
                        <span className="text-[0.7rem] font-extrabold bg-[#a4f3ca] text-[#003723] px-2 py-0.5 rounded-full">
                          {student.deficiencia}
                        </span>
                      )}
                    </div>
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
                        if (onOpenStudentPdf) {
                          onOpenStudentPdf(student);
                        } else {
                          onOpenStudentGrid(student);
                        }
                      }}
                      title={`Abrir Documento PDF Nominal de ${student.name} por Hyperlink`}
                      className="doc-hyperlink text-[1.14rem] font-extrabold leading-snug truncate mt-0.5 block"
                    >
                      {student.name}
                    </a>
                    <span className="text-[0.76rem] font-bold text-[#005035] flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">link</span>
                      <span>Hyperlink no nome abre o Doc PDF • Foto abre os 48 Campos</span>
                    </span>
                  </div>
                </div>

                {/* Live Student Attendance Percentage Pill */}
                <div
                  onClick={() => onOpenStudentGrid(student)}
                  className="text-right shrink-0 bg-[#f3f4f2] hover:bg-[#e7e8e6] px-3 py-1.5 rounded-xl border border-[#e1e3e1] cursor-pointer"
                >
                  <span
                    className={`text-[1.25rem] font-black block leading-none ${
                      m.frequenciaPercent < 75
                        ? 'text-[#ba1a1a]'
                        : m.frequenciaPercent < 85
                        ? 'text-[#8c5000]'
                        : 'text-[#005035]'
                    }`}
                  >
                    {m.frequenciaPercent}%
                  </span>
                  <span className="text-[0.7rem] font-bold text-[#41484b] block mt-0.5">
                    {m.presencas}/{m.diasLetivosMatriculados} dias
                  </span>
                </div>
              </div>

              {/* Enrollment Window Bar (Recorte da Matrícula no Mês) */}
              <div
                className={`mt-2.5 px-3 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[0.82rem] ${
                  m.isMesCheio
                    ? 'bg-[#f8faf9] text-[#41484b] border border-[#edeeec]'
                    : 'bg-[#c3e5f4]/50 text-[#001f29] border border-[#003440]/20 font-semibold'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-[#003440]">
                    date_range
                  </span>
                  <span>
                    <strong>Recorte no Mês:</strong> {m.recorteLabel}
                  </span>
                </div>

                {effectiveCanEdit && (
                  <button
                    type="button"
                    onClick={() => handleOpenRecorteModal(student)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#e7e8e6] text-[#003440] font-extrabold text-[0.78rem] border border-[#c0c8cb] shadow-2xs cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit_calendar</span>
                    <span>Alterar Entrada/Saída</span>
                  </button>
                )}
              </div>

              {/* Dual Counters: Faltas e Atestados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                {/* 1. Botão de Faltas no Mês (Máx = diasLetivosMatriculados) */}
                <div className="bg-[#f3f4f2] p-3 rounded-2xl border-2 border-[#b4c0c4]/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[0.85rem] font-extrabold text-[#003440] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px] text-[#ba1a1a]">
                        event_busy
                      </span>
                      <span>Faltas no Mês:</span>
                    </span>
                    <span className="text-[0.72rem] font-bold text-[#647073]">
                      Máx: {m.maxFaltasPermitidas}d
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeltaAbsence(student.id, -1)}
                      disabled={!effectiveCanEdit || m.faltas === 0}
                      className="w-12 h-12 rounded-xl bg-white hover:bg-[#e7e8e6] text-[#003440] font-black text-[1.5rem] flex items-center justify-center cursor-pointer transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none border-2 border-[#b4c0c4] shadow-xs"
                      aria-label={`Diminuir falta de ${student.name}`}
                    >
                      —
                    </button>

                    <div className="text-center min-w-[70px]">
                      <span
                        className={`text-[1.5rem] font-black block leading-none ${
                          hasAbsence ? 'text-[#ba1a1a]' : 'text-[#005035]'
                        }`}
                      >
                        {m.faltas}
                      </span>
                      <span className="text-[0.75rem] font-bold text-[#647073]">
                        de {m.diasLetivosMatriculados} dias
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeltaAbsence(student.id, 1)}
                      disabled={!effectiveCanEdit || isMaxFaltasReached}
                      className="w-12 h-12 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-black text-[1.5rem] flex items-center justify-center cursor-pointer transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none shadow-sm"
                      aria-label={`Adicionar falta para ${student.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 2. Botão de Quantidade de Atestados Apresentados (Máx = Faltas do Estudante) */}
                <div className="bg-[#eaf6ef] p-3 rounded-2xl border-2 border-[#005035]/30 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[0.85rem] font-extrabold text-[#005035] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px] text-[#005035]">
                        medical_services
                      </span>
                      <span>Qtd. de Atestados:</span>
                    </span>
                    <span className="text-[0.72rem] font-bold text-[#005035]">
                      {m.faltas === 0 ? 'Sem faltas' : `Máx: ${m.maxAtestadosPermitidos}`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeltaAtestado(student.id, -1)}
                      disabled={!effectiveCanEdit || m.atestados === 0}
                      className="w-12 h-12 rounded-xl bg-white hover:bg-[#e7e8e6] text-[#005035] font-black text-[1.5rem] flex items-center justify-center cursor-pointer transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none border-2 border-[#005035]/30 shadow-xs"
                      aria-label={`Diminuir atestado de ${student.name}`}
                    >
                      —
                    </button>

                    <div className="text-center min-w-[70px]">
                      <span
                        className={`text-[1.5rem] font-black block leading-none ${
                          m.atestados > 0 ? 'text-[#005035]' : 'text-[#647073]'
                        }`}
                      >
                        {m.atestados}
                      </span>
                      <span className="text-[0.75rem] font-bold text-[#005035]">
                        {m.atestados === 1 ? 'atestado' : 'atestados'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeltaAtestado(student.id, 1)}
                      disabled={!effectiveCanEdit || isMaxAtestadosReached}
                      className="w-12 h-12 rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-black text-[1.5rem] flex items-center justify-center cursor-pointer transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none shadow-sm"
                      aria-label={`Adicionar atestado para ${student.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Bar: Grade de Dados Interativa + PDF Nominal + Detalhe Atestado + Foto */}
              <div className="mt-3 pt-2.5 border-t border-[#edeeec] flex flex-wrap items-center justify-between gap-2 text-[0.8rem]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenStudentGrid(student)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-extrabold flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">grid_on</span>
                    <span>Ficha (48 Campos)</span>
                  </button>

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
                        onOpenStudentPdf(student);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#ba1a1a] hover:bg-[#93000a] text-white font-extrabold flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Abrir Documento PDF Nominal por Hyperlink"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        link
                      </span>
                      <span>Hyperlink Doc PDF</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {effectiveCanEdit && (
                    <button
                      type="button"
                      onClick={() => handleOpenJustifyModal(student)}
                      className="text-[#005035] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">description</span>
                      <span>{student.notes ? 'Obs.' : '+ Obs.'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenPhotoModal(student)}
                    className="text-[#003440] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                    <span>Foto</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Summary / Conclude Bar (Above Interactive Bottom Nav) */}
      <div className="bg-white rounded-2xl p-4 border-2 border-[#b4c0c4]/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-center sm:text-left">
          <span className="material-symbols-outlined text-[26px] text-[#005035]">
            cloud_done
          </span>
          <div>
            <p className="font-black text-[0.95rem] text-[#003440]">
              Salvamento Automático Ativo ({liveClassMetrics.presenceRate}% de presença da turma)
            </p>
            <p className="text-[0.8rem] text-[#374144] font-semibold">
              Todas as alterações feitas acima já estão gravadas na Planilha da Escola.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 sm:flex-initial min-h-[48px] px-4 bg-[#edeeec] hover:bg-[#e1e3e1] text-[#003440] font-black text-[0.9rem] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            <span>Voltar às Turmas</span>
          </button>

          {effectiveCanEdit && (
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-initial min-h-[48px] px-5 bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.9rem] rounded-xl flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">verified</span>
              <span>Concluir Chamada do Mês</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal: Recorte da Matrícula no Mês (Entrada Depois / Saída Antes) */}
      {recorteStudent && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-[#edeeec] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#edeeec]">
              <h3 className="text-[1.15rem] font-black text-[#003440]">
                Recorte da Matrícula no Mês
              </h3>
              <button
                onClick={() => setRecorteStudent(null)}
                className="w-9 h-9 rounded-xl bg-[#f3f4f2] text-[#41484b] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-[1rem] font-extrabold text-[#003440]">
                {recorteStudent.name}
              </p>
              <p className="text-[0.85rem] text-[#41484b] mt-0.5">
                Mês de <strong>{selectedMonthName}</strong> possui <strong>{diasLetivosMes} dias letivos</strong> no total.
                Se o(a) estudante entrou depois ou saiu antes, ajuste abaixo quantos dias letivos valem para a matrícula dele(a):
              </p>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecorteDaysInput(diasLetivosMes);
                  setExitDateInput('');
                  setSituacaoInput('ATIVO');
                }}
                className={`p-2.5 rounded-xl font-bold text-[0.85rem] border cursor-pointer ${
                  recorteDaysInput === diasLetivosMes
                    ? 'bg-[#003440] text-white border-[#003440]'
                    : 'bg-[#f3f4f2] text-[#003440] border-[#c0c8cb]'
                }`}
              >
                Mês Cheio ({diasLetivosMes} dias)
              </button>

              <button
                type="button"
                onClick={() => {
                  setRecorteDaysInput(Math.max(1, Math.round(diasLetivosMes / 2)));
                }}
                className={`p-2.5 rounded-xl font-bold text-[0.85rem] border cursor-pointer ${
                  recorteDaysInput < diasLetivosMes
                    ? 'bg-[#003440] text-white border-[#003440]'
                    : 'bg-[#f3f4f2] text-[#003440] border-[#c0c8cb]'
                }`}
              >
                Meio Mês ({Math.round(diasLetivosMes / 2)} dias)
              </button>
            </div>

            {/* Big Counter for Student's Enrolled School Days */}
            <div className="bg-[#f3f4f2] p-4 rounded-2xl border border-[#c0c8cb] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRecorteDaysInput((prev) => Math.max(1, prev - 1))}
                disabled={recorteDaysInput <= 1}
                className="w-12 h-12 rounded-xl bg-white text-[#003440] font-black text-[1.5rem] border border-[#c0c8cb] disabled:opacity-30 cursor-pointer"
              >
                —
              </button>

              <div className="text-center">
                <span className="text-[1.75rem] font-black text-[#003440] block leading-none">
                  {recorteDaysInput}
                </span>
                <span className="text-[0.8rem] font-bold text-[#41484b]">
                  de {diasLetivosMes} dias letivos no mês
                </span>
              </div>

              <button
                type="button"
                onClick={() => setRecorteDaysInput((prev) => Math.min(diasLetivosMes, prev + 1))}
                disabled={recorteDaysInput >= diasLetivosMes}
                className="w-12 h-12 rounded-xl bg-[#003440] text-white font-black text-[1.5rem] disabled:opacity-30 cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Optional Entry / Exit Dates */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[0.78rem] font-bold text-[#41484b] mb-1">
                  Data de Matrícula (Entrada):
                </label>
                <input
                  type="text"
                  value={entryDateInput}
                  onChange={(e) => setEntryDateInput(e.target.value)}
                  placeholder="Ex: 14/10/2027"
                  className="w-full p-2.5 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] text-[0.9rem] font-semibold"
                />
              </div>

              <div>
                <label className="block text-[0.78rem] font-bold text-[#41484b] mb-1">
                  Data de Saída (Se saiu):
                </label>
                <input
                  type="text"
                  value={exitDateInput}
                  onChange={(e) => {
                    setExitDateInput(e.target.value);
                    if (e.target.value.trim()) {
                      setSituacaoInput('BXTR');
                    }
                  }}
                  placeholder="Ex: 19/10/2027"
                  className="w-full p-2.5 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] text-[0.9rem] font-semibold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRecorteStudent(null)}
                className="flex-1 py-3 bg-[#edeeec] text-[#41484b] font-bold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRecorteModal}
                className="flex-1 py-3 bg-[#005035] hover:bg-[#003723] text-white font-bold rounded-xl shadow-xs cursor-pointer"
              >
                Aplicar Recorte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Justify / Atestado Notes Modal */}
      {justifyingStudent && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-[#edeeec] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#edeeec]">
              <h3 className="text-[1.15rem] font-bold text-[#003440]">
                Detalhes do Atestado Médico
              </h3>
              <button
                onClick={() => setJustifyingStudent(null)}
                className="w-9 h-9 rounded-xl bg-[#f3f4f2] text-[#41484b] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-[0.95rem] text-[#191c1b]">
              Estudante: <strong>{justifyingStudent.name}</strong> (Nº {justifyingStudent.number})
            </p>

            <div>
              <label className="block text-[0.85rem] font-bold text-[#41484b] mb-1">
                Anotação / CID / Data de Emissão:
              </label>
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Ex: Atestado entregue em 15/10 (Dr. Carlos - CRM 12345, 2 dias de repouso)..."
                rows={3}
                className="w-full p-3 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] text-[0.95rem] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setJustifyingStudent(null)}
                className="flex-1 py-3 bg-[#edeeec] text-[#41484b] font-bold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="flex-1 py-3 bg-[#005035] hover:bg-[#003723] text-white font-bold rounded-xl shadow-xs cursor-pointer"
              >
                Salvar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
