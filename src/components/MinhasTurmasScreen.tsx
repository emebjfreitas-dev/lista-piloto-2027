import React, { useState, useMemo } from 'react';
import { ClassGroup, Student, UserRole, AttendanceWindowConfig } from '../types';
import { evaluateAttendanceLaunchWindow } from '../services/db';
import { ResumoFaltasCriticasCard } from './ResumoFaltasCriticasCard';

interface MinhasTurmasScreenProps {
  classes: ClassGroup[];
  userRole: UserRole;
  assignedClassId: string;
  assignedClassIds?: string[];
  attendanceWindowConfig: AttendanceWindowConfig;
  onChangeRole: (role: UserRole) => void;
  onChangeAssignedClassId: (classId: string) => void;
  onSelectClassForDetails: (classGroup: ClassGroup) => void;
  onSelectClassForMonthlyAttendance: (classGroup: ClassGroup) => void;
  onOpenClassStudentList?: (classGroup: ClassGroup) => void;
  onOpenNewClassModal: () => void;
  onOpenConfigDaysModal?: () => void;
  onNavigateToSheet: () => void;
  onNavigateToAcessos?: () => void;
  onSelectStudentForConsecutiveScreen?: (cls: ClassGroup, student: Student) => void;
  onOpenStudentGrid?: (
    student: Student,
    classId: string,
    className: string,
    diasLetivosMes: number
  ) => void;
  onOpenStudentPdf?: (student: Student, className: string) => void;
}

export const MinhasTurmasScreen: React.FC<MinhasTurmasScreenProps> = ({
  classes,
  userRole,
  assignedClassId,
  assignedClassIds = [],
  attendanceWindowConfig,
  onChangeRole,
  onChangeAssignedClassId,
  onSelectClassForDetails,
  onSelectClassForMonthlyAttendance,
  onOpenNewClassModal,
  onOpenConfigDaysModal,
  onNavigateToAcessos,
  onSelectStudentForConsecutiveScreen,
  onOpenStudentGrid,
  onOpenStudentPdf,
}) => {
  const [selectedShift, setSelectedShift] = useState<'Todos' | 'Turno Manhã' | 'Turno Tarde'>('Todos');
  const [searchTerm, setSearchTerm] = useState('');

  const windowEval = evaluateAttendanceLaunchWindow(attendanceWindowConfig);
  const isLaunchButtonOpen = windowEval.isAllowedToLaunch;

  const manhaCount = useMemo(
    () => classes.filter((c) => c.shift === 'Turno Manhã').length,
    [classes]
  );
  const tardeCount = useMemo(
    () => classes.filter((c) => c.shift === 'Turno Tarde').length,
    [classes]
  );

  // Alerta Geral: Estudantes sem Ficha Informativa Escaneada (PDF no Drive)
  const missingScannedFichasSummary = useMemo(() => {
    let totalMissing = 0;
    let totalStudentsCount = 0;
    let classesWithMissing = 0;
    classes.forEach((cls) => {
      if (userRole === 'usuario' && !assignedClassIds.includes(cls.id) && cls.id !== assignedClassId) {
        return;
      }
      let classMissing = 0;
      cls.students.forEach((s) => {
        totalStudentsCount++;
        const hasPdf = Boolean(
          (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
            (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
        );
        if (!hasPdf) {
          totalMissing++;
          classMissing++;
        }
      });
      if (classMissing > 0) classesWithMissing++;
    });
    return { totalMissing, totalStudentsCount, classesWithMissing };
  }, [classes, userRole, assignedClassIds, assignedClassId]);

  // Flexible search for senior teachers (supports G4, Grupo 04, 1A, 1º Ano A, Teacher name, SED code, Specialist)
  const cleanSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawSearchLower = searchTerm.toLowerCase().trim();

  // Role-based class visibility:
  // - ADMIN: all 39 classes (full access)
  // - USUÁRIO (PEB I): ONLY their assigned class(es)
  // - PEB II: all 39 classes (view-only)
  const allowedClassIdsForUsuario = useMemo(() => {
    const valid = assignedClassIds.filter((id) => id && id !== 'all');
    if (valid.length > 0) return valid;
    return [assignedClassId];
  }, [assignedClassIds, assignedClassId]);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (userRole === 'usuario') {
        return allowedClassIdsForUsuario.includes(c.id);
      }

      const matchesShift =
        selectedShift === 'Todos' || c.shift === selectedShift;
      const cleanClassName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanRoom = c.room.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanAbrev = (c.turmaAbrev || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const matchesAlias =
        (cleanSearch.startsWith('g4') && cleanClassName.includes('grupo04')) ||
        (cleanSearch.startsWith('g5') && cleanClassName.includes('grupo05'));

      const matchesTeacherOrSed =
        rawSearchLower !== '' &&
        ((c.teacherName || '').toLowerCase().includes(rawSearchLower) ||
          (c.teacherFirstName || '').toLowerCase().includes(rawSearchLower) ||
          (c.classeSedCode || '').toLowerCase().includes(rawSearchLower) ||
          (c.artTeacher || '').toLowerCase().includes(rawSearchLower) ||
          (c.peTeacher || '').toLowerCase().includes(rawSearchLower) ||
          (c.englishTeacher || '').toLowerCase().includes(rawSearchLower));

      const matchesSearch =
        cleanSearch === '' ||
        cleanClassName.includes(cleanSearch) ||
        cleanRoom.includes(cleanSearch) ||
        cleanAbrev.includes(cleanSearch) ||
        matchesAlias ||
        matchesTeacherOrSed;

      return matchesShift && matchesSearch;
    });
  }, [classes, userRole, allowedClassIdsForUsuario, selectedShift, cleanSearch, rawSearchLower]);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-5 pb-12 animate-gentle-fade">
      {/* Barra Executiva Consolidada: Título + Simulador Rápido (Admin) + Status de Janela & Fichas PDF em 1 Bloco Limpo */}
      <section className="card-welcoming bg-white rounded-3xl p-4 sm:p-5 border border-black/[0.06] space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.7rem] font-extrabold uppercase tracking-wider text-[#0066cc]">
                {userRole === 'usuario'
                  ? 'Acesso Exclusivo · Ano Letivo 2027'
                  : `Ano Letivo 2027 · ${classes.length} Turmas Oficiais`}
              </span>
              {userRole !== 'peb2' && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold ${
                    isLaunchButtonOpen
                      ? 'bg-[#eaf6ef] text-[#005035]'
                      : 'bg-[#fff9eb] text-[#c93400]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {isLaunchButtonOpen ? 'lock_open' : 'schedule'}
                  </span>
                  <span>
                    {isLaunchButtonOpen
                      ? 'Lançamento Aberto'
                      : `Lançamento: ${windowEval.reasonLabel}`}
                  </span>
                </span>
              )}
              {missingScannedFichasSummary.totalMissing > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#fff2f2] text-[#ff3b30] text-[0.68rem] font-extrabold tabular-nums">
                  <span className="material-symbols-outlined text-[13px]">
                    picture_as_pdf
                  </span>
                  <span>
                    {missingScannedFichasSummary.totalMissing} s/ Ficha PDF ({missingScannedFichasSummary.classesWithMissing} turmas)
                  </span>
                </span>
              )}
            </div>

            <h1 className="text-[1.35rem] sm:text-[1.6rem] font-extrabold text-[#1d1d1f] leading-tight tracking-tight mt-0.5">
              {userRole === 'usuario' ? 'Minha Turma Regente' : 'Quadro Oficial de Turmas'}
            </h1>
          </div>

          {/* Controles Rápidos do Admin na Mesma Linha */}
          {userRole === 'admin' && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Simulador Compacto de Perfil */}
              <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-full border border-black/[0.05]">
                <button
                  type="button"
                  onClick={() => onChangeRole('admin')}
                  className="px-3 py-1 rounded-full bg-[#1d1d1f] text-white font-bold text-[0.72rem] cursor-pointer"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRole('usuario')}
                  className="px-2.5 py-1 rounded-full hover:bg-white text-[#1d1d1f] font-semibold text-[0.72rem] cursor-pointer"
                  title="Simular visão de Professora Regente PEB I"
                >
                  Simular PEB I
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRole('peb2')}
                  className="px-2.5 py-1 rounded-full hover:bg-white text-[#1d1d1f] font-semibold text-[0.72rem] cursor-pointer"
                  title="Simular visão de Especialista PEB II"
                >
                  Simular PEB II
                </button>
              </div>

              <select
                value={assignedClassId}
                onChange={(e) => onChangeAssignedClassId(e.target.value)}
                aria-label="Selecionar turma para simulação PEB I"
                className="h-[34px] px-2.5 rounded-full bg-[#f5f5f7] border border-black/[0.06] text-[#1d1d1f] font-semibold text-[0.74rem] cursor-pointer max-w-[165px] truncate"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    PEB I: {c.name}
                  </option>
                ))}
              </select>

              {onOpenConfigDaysModal && (
                <button
                  onClick={onOpenConfigDaysModal}
                  type="button"
                  className="h-[34px] px-3 rounded-full bg-[#0071e3]/10 hover:bg-[#0071e3]/18 text-[#0066cc] font-bold text-[0.74rem] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
                  <span className="hidden sm:inline">200 Dias &amp; Links</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenNewClassModal}
                className="h-[34px] px-3 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-bold text-[0.74rem] flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span className="hidden sm:inline">Nova Turma</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Resumo de Faltas Críticas (Busca Ativa Escolar • Limiar de Faltas Consecutivas com Detalhes ao Clicar) */}
      <ResumoFaltasCriticasCard
        classes={filteredClasses}
        userRole={userRole}
        onSelectStudentForConsecutiveScreen={onSelectStudentForConsecutiveScreen}
        onOpenStudentGrid={onOpenStudentGrid}
        onOpenStudentPdf={onOpenStudentPdf}
      />

      {/* Shift Selector & Search: Responsive Proportions on Mobile, Tablet & Desktop */}
      {userRole !== 'usuario' && (
        <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-3 lg:items-center">
          <div className="grid grid-cols-3 gap-2 lg:col-span-5">
            <button
              onClick={() => setSelectedShift('Todos')}
              type="button"
              className={`min-h-[44px] sm:min-h-[48px] rounded-xl sm:rounded-2xl px-2.5 py-2 flex items-center justify-center gap-1.5 font-semibold text-[0.8rem] sm:text-[0.86rem] transition-all cursor-pointer border ${
                selectedShift === 'Todos'
                  ? 'bg-[#1d1d1f] text-white border-[#1d1d1f] shadow-xs'
                  : 'bg-white text-[#6e6e73] border-black/[0.08] hover:text-[#1d1d1f]'
              }`}
            >
              <span>Todas ({classes.length})</span>
            </button>

            <button
              onClick={() => setSelectedShift('Turno Manhã')}
              type="button"
              className={`min-h-[44px] sm:min-h-[48px] rounded-xl sm:rounded-2xl px-2.5 py-2 flex items-center justify-center gap-1.5 font-semibold text-[0.8rem] sm:text-[0.86rem] transition-all cursor-pointer border ${
                selectedShift === 'Turno Manhã'
                  ? 'bg-[#1d1d1f] text-white border-[#1d1d1f] shadow-xs'
                  : 'bg-white text-[#6e6e73] border-black/[0.08] hover:text-[#1d1d1f]'
              }`}
            >
              <span className="text-[16px]">☀️</span>
              <span>Manhã ({manhaCount})</span>
            </button>

            <button
              onClick={() => setSelectedShift('Turno Tarde')}
              type="button"
              className={`min-h-[44px] sm:min-h-[48px] rounded-xl sm:rounded-2xl px-2.5 py-2 flex items-center justify-center gap-1.5 font-semibold text-[0.8rem] sm:text-[0.86rem] transition-all cursor-pointer border ${
                selectedShift === 'Turno Tarde'
                  ? 'bg-[#1d1d1f] text-white border-[#1d1d1f] shadow-xs'
                  : 'bg-white text-[#6e6e73] border-black/[0.08] hover:text-[#1d1d1f]'
              }`}
            >
              <span className="text-[16px]">⛅</span>
              <span>Tarde ({tardeCount})</span>
            </button>
          </div>

          <div className="relative lg:col-span-7">
            <span className="material-symbols-outlined absolute left-3.5 text-[#86868b] text-[20px] top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar turma, professor(a) regente, especialista ou Classe SED..."
              className="w-full min-h-[44px] sm:min-h-[48px] pl-10 pr-9 bg-white text-[#1d1d1f] text-[0.86rem] sm:text-[0.92rem] rounded-xl sm:rounded-2xl border border-black/[0.08] focus:border-[#0071e3] focus:outline-none shadow-2xs font-medium placeholder:text-[#86868b]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">cancel</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* List of Classes: 1 col Mobile, 2 cols Tablet (sm/md), 3 cols Laptop (lg), 4 cols Widescreen (2xl) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5 sm:gap-4">
        {filteredClasses.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-black/[0.06] sm:col-span-2 lg:col-span-3 2xl:col-span-4">
            <p className="text-[1rem] font-semibold text-[#6e6e73]">
              Nenhuma turma encontrada com a busca "{searchTerm}".
            </p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-3 px-4 py-2 bg-[#0071e3] text-white font-semibold rounded-full text-[0.86rem] cursor-pointer"
            >
              Mostrar Todas as Turmas
            </button>
          </div>
        ) : (
          filteredClasses.map((cls) => {
            const isInfantil = cls.name.startsWith('GRUPO');
            const shortBadge =
              cls.turmaAbrev ||
              (isInfantil
                ? cls.name.replace(/^GRUPO\s*0?/i, 'G').replace(/\s+/g, '')
                : cls.name.replace(/\s*ANO\s*/i, ''));

            return (
              <div
                key={cls.id}
                className="card-welcoming bg-white p-4 sm:p-5 border border-black/[0.06] flex flex-col justify-between gap-3.5"
              >
                {/* Class Details Header */}
                <div
                  onClick={() => {
                    onSelectClassForDetails(cls);
                  }}
                  className="cursor-pointer flex items-start gap-3 min-w-0 group"
                >
                  <div
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold text-[0.95rem] sm:text-[1.02rem] tracking-tight shrink-0 transition-transform group-hover:scale-[1.03] ${
                      isInfantil
                        ? 'bg-[#0071e3]/10 text-[#0066cc] border border-[#0071e3]/20'
                        : 'bg-[#f5f5f7] text-[#1d1d1f] border border-black/[0.08]'
                    }`}
                  >
                    {shortBadge}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-[1.02rem] sm:text-[1.1rem] font-bold text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors leading-tight truncate">
                        {cls.name}
                      </h2>
                      <span className="font-mono font-semibold text-[0.76rem] text-[#1d8338] tabular-nums shrink-0">
                        {cls.presenceRate}%
                      </span>
                    </div>
                    <p className="text-[0.75rem] text-[#6e6e73] font-medium mt-0.5 truncate">
                      {cls.shift.replace('Turno ', '')} · {cls.room}
                      {cls.classeSedCode ? ` · SED ${cls.classeSedCode}` : ''}
                    </p>
                    {cls.teacherName && (
                      <p className="text-[0.75rem] font-semibold text-[#0066cc] truncate mt-0.5">
                        {cls.teacherPronoun || 'PROF.'}: {cls.teacherName}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[0.72rem] font-medium text-[#6e6e73] tabular-nums">
                      <span>{cls.totalStudents} alunos</span>
                      <span aria-hidden="true" className="text-[#d2d2d7]">·</span>
                      <span className={cls.monthlyAbsences > 0 ? 'text-[#ff3b30] font-semibold' : 'text-[#1d8338]'}>
                        {cls.monthlyAbsences} faltas
                      </span>
                      {(() => {
                        const missingCount = cls.students.filter(
                          (s) =>
                            !(
                              (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
                              (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
                            )
                        ).length;
                        if (missingCount === 0) return null;
                        return (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-[#fff2f2] border border-[#ff3b30]/30 text-[#ff3b30] text-[0.65rem] font-semibold">
                            <span>{missingCount} s/ PDF</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Clear, Proportional Action Buttons */}
                <div
                  className={`grid ${
                    userRole === 'peb2' ? 'grid-cols-1' : 'grid-cols-2'
                  } gap-2 pt-3 border-t border-black/[0.06]`}
                >
                  {/* Botão 1: Ver Estudantes (SEMPRE DISPONÍVEL O TEMPO TODO) */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectClassForDetails(cls);
                    }}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-[#1d1d1f] hover:bg-black text-white flex items-center justify-between gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2 min-w-0 text-left">
                      <span className="material-symbols-outlined text-[18px] text-white/80 shrink-0">
                        badge
                      </span>
                      <div className="min-w-0">
                        <span className="block font-semibold text-[0.8rem] leading-tight truncate">
                          Ver Estudantes
                        </span>
                        <span className="block text-[0.66rem] text-white/70 font-normal leading-tight mt-0.5 truncate">
                          {cls.totalStudents} fichas
                        </span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-white/70 shrink-0">
                      chevron_right
                    </span>
                  </button>

                  {/* Botão 2: Lançar Faltas (Apenas para PEB I e Admin — PEB II não exibe tela de frequência) */}
                  {userRole !== 'peb2' &&
                    (isLaunchButtonOpen ? (
                      <button
                        type="button"
                        onClick={() => onSelectClassForMonthlyAttendance(cls)}
                        className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white flex items-center justify-between gap-2 cursor-pointer transition-all active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-2 min-w-0 text-left">
                          <span className="material-symbols-outlined text-[18px] text-white/90 shrink-0">
                            edit_calendar
                          </span>
                          <div className="min-w-0">
                            <span className="block font-semibold text-[0.8rem] leading-tight truncate">
                              Lançar Faltas
                            </span>
                            <span className="block text-[0.66rem] text-white/80 font-normal leading-tight mt-0.5 truncate">
                              Auto-sync
                            </span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[16px] text-white/85 shrink-0">
                          arrow_forward
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="O lançamento de faltas abre no último dia letivo do mês e nos 2 primeiros dias letivos do próximo mês."
                        className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-[#f5f5f7] text-[#86868b] border border-black/[0.06] flex items-center justify-between gap-2 cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2 min-w-0 text-left">
                          <span className="material-symbols-outlined text-[18px] text-[#86868b] shrink-0">
                            lock_clock
                          </span>
                          <div className="min-w-0">
                            <span className="block font-semibold text-[0.8rem] text-[#6e6e73] leading-tight truncate">
                              Lançar Faltas
                            </span>
                            <span className="block text-[0.65rem] text-[#86868b] font-normal leading-tight mt-0.5 truncate">
                              No fecho mensal
                            </span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[15px] text-[#86868b] shrink-0">
                          lock
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
