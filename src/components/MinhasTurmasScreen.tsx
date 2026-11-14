import React, { useState, useMemo } from 'react';
import {
  ClassGroup,
  Student,
  UserRole,
  AttendanceWindowConfig,
  SchoolNotice,
} from '../types';
import {
  Search,
  X,
  LayoutGrid,
  Table as TableIcon,
  Users,
  CalendarDays,
  ChevronRight,
  Sun,
  Sunset,
} from 'lucide-react';

interface MinhasTurmasScreenProps {
  classes: ClassGroup[];
  userRole: UserRole;
  userEmail?: string;
  userName?: string;
  schoolNotices?: SchoolNotice[];
  onSaveSchoolNotices?: (updatedNotices: SchoolNotice[]) => void;
  assignedClassId: string;
  assignedClassIds?: string[];
  attendanceWindowConfig: AttendanceWindowConfig;
  onChangeRole: (role: UserRole) => void;
  onChangeAssignedClassId: (classId: string) => void;
  onSelectClassForDetails: (classGroup: ClassGroup) => void;
  onSelectClassForMonthlyAttendance: (classGroup: ClassGroup) => void;
  onOpenClassStudentList?: (classGroup: ClassGroup) => void;
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
  onChangeRole,
  onSelectClassForDetails,
  onOpenConfigDaysModal,
}) => {
  const [selectedShift, setSelectedShift] = useState<'Todos' | 'Turno Manhã' | 'Turno Tarde'>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [turmasViewMode, setTurmasViewMode] = useState<'grid' | 'table'>('grid');

  const manhaCount = useMemo(
    () => classes.filter((c) => c.shift === 'Turno Manhã').length,
    [classes]
  );
  const tardeCount = useMemo(
    () => classes.filter((c) => c.shift === 'Turno Tarde').length,
    [classes]
  );

  const missingScannedFichasSummary = useMemo(() => {
    let totalMissing = 0;
    classes.forEach((cls) => {
      if (
        userRole === 'usuario' &&
        !assignedClassIds.includes(cls.id) &&
        cls.id !== assignedClassId
      ) {
        return;
      }
      cls.students.forEach((s) => {
        const hasPdf = Boolean(
          (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
            (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
        );
        if (!hasPdf) totalMissing++;
      });
    });
    return { totalMissing };
  }, [classes, userRole, assignedClassIds, assignedClassId]);

  const cleanSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawSearchLower = searchTerm.toLowerCase().trim();

  const allowedClassIdsForUsuario = useMemo(() => {
    const valid = assignedClassIds.filter((id) => id && id !== 'all');
    if (valid.length > 0) return valid;
    return [assignedClassId];
  }, [assignedClassIds, assignedClassId]);

  const primaryTeacherClass = useMemo(() => {
    return (
      classes.find(
        (c) =>
          allowedClassIdsForUsuario.includes(c.id) ||
          allowedClassIdsForUsuario.includes(c.name) ||
          c.id === assignedClassId
      ) || classes[0]
    );
  }, [classes, allowedClassIdsForUsuario, assignedClassId]);

  const filteredClasses = useMemo(() => {
    return classes.filter((cls) => {
      if (userRole === 'usuario') {
        const isAssigned =
          allowedClassIdsForUsuario.includes(cls.id) ||
          allowedClassIdsForUsuario.includes(cls.name) ||
          cls.id === assignedClassId;
        if (!isAssigned) return false;
      }

      if (selectedShift !== 'Todos' && cls.shift !== selectedShift) {
        return false;
      }

      if (!searchTerm.trim()) {
        return true;
      }

      const nameNormalized = cls.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const teacherNormalized = (cls.teacherName || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const sedNormalized = (cls.classeSedCode || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const artNormalized = (cls.artTeacher || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const peNormalized = (cls.peTeacher || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const englishNormalized = (cls.englishTeacher || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      return (
        nameNormalized.includes(cleanSearch) ||
        cls.name.toLowerCase().includes(rawSearchLower) ||
        (cls.turmaAbrev &&
          cls.turmaAbrev.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanSearch)) ||
        teacherNormalized.includes(cleanSearch) ||
        cls.room.toLowerCase().includes(rawSearchLower) ||
        sedNormalized.includes(cleanSearch) ||
        artNormalized.includes(cleanSearch) ||
        peNormalized.includes(cleanSearch) ||
        englishNormalized.includes(cleanSearch)
      );
    });
  }, [
    classes,
    userRole,
    allowedClassIdsForUsuario,
    assignedClassId,
    selectedShift,
    searchTerm,
    cleanSearch,
    rawSearchLower,
  ]);

  return (
    <div className="flex flex-col w-full min-w-0 max-w-[1600px] mx-auto space-y-4 pb-16 animate-gentle-fade text-[#1d1d1f]">
      {/* Cabeçalho Institucional */}
      <section className="bg-white border border-slate-200 rounded-3xl px-5 py-5 sm:px-6 sm:py-6 shadow-xs min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
          <div className="space-y-1.5 min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 break-words">
              {userRole === 'usuario' ? 'Minha Turma' : 'Turmas'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-600 break-words">
              <span className="font-semibold text-slate-800">Ano Letivo 2027</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-medium">
                {classes.length} turmas ({manhaCount} Manhã · {tardeCount} Tarde)
              </span>
              {missingScannedFichasSummary.totalMissing > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#be123c] font-bold tabular-nums">
                    {missingScannedFichasSummary.totalMissing} sem Ficha Informativa
                  </span>
                </>
              )}
            </div>
          </div>

          {userRole === 'admin' && (
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto min-w-0 shrink-0">
              <div className="flex flex-wrap sm:inline-flex items-center p-1.5 bg-slate-100 border border-slate-200 rounded-2xl text-xs sm:text-[13px] font-bold w-full sm:w-auto max-w-full gap-1">
                <button
                  type="button"
                  onClick={() => onChangeRole('admin')}
                  className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl text-center whitespace-normal transition-colors duration-100 cursor-pointer ${
                    userRole === 'admin'
                      ? 'bg-[#0b3b8c] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRole('usuario')}
                  className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl text-center whitespace-normal transition-colors duration-100 cursor-pointer ${
                    (userRole as string) === 'usuario'
                      ? 'bg-[#0b3b8c] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                  title="Simular visão PEB I"
                >
                  Regente
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRole('peb2')}
                  className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl text-center whitespace-normal transition-colors duration-100 cursor-pointer ${
                    (userRole as string) === 'peb2'
                      ? 'bg-[#0b3b8c] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                  title="Simular visão PEB II"
                >
                  Especialista
                </button>
              </div>

              {onOpenConfigDaysModal && (
                <button
                  onClick={onOpenConfigDaysModal}
                  type="button"
                  className="w-full sm:w-auto min-h-[44px] py-2 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-950 font-bold text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-2 cursor-pointer transition-colors duration-100"
                >
                  <CalendarDays className="w-4 h-4 text-[#0b3b8c] shrink-0" />
                  <span>200 Dias Letivos</span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Destaque enxuto apenas para Professora Regente */}
      {userRole === 'usuario' && primaryTeacherClass && (
        <button
          type="button"
          onClick={() => onSelectClassForDetails(primaryTeacherClass)}
          className="w-full min-w-0 text-left bg-white hover:bg-[#fafafb] rounded-3xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.05)] transition-all duration-100 cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4 min-w-0 flex-1 w-full">
            <div className="w-13 h-13 rounded-2xl bg-[#1d1d1f] text-white flex items-center justify-center font-semibold text-sm sm:text-base shrink-0">
              {primaryTeacherClass.turmaAbrev || primaryTeacherClass.name.slice(0, 3)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="text-xs sm:text-[13px] text-[#48484a] font-medium block">Sua Turma de Regência</span>
              <h2 className="text-xl sm:text-2xl font-semibold text-[#111827] leading-snug break-words">
                {primaryTeacherClass.name}
              </h2>
              <p className="text-xs sm:text-sm text-[#3c3c43] break-words leading-snug">
                {primaryTeacherClass.shift.replace('Turno ', '')} · {primaryTeacherClass.room} ·{' '}
                {primaryTeacherClass.teacherName || 'Regente'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 sm:gap-5 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
            <div className="flex items-center gap-5 tabular-nums">
              <div className="text-left sm:text-right">
                <span className="text-xs text-[#48484a] font-medium block">Estudantes</span>
                <span className="text-lg font-semibold text-[#111827]">
                  {primaryTeacherClass.totalStudents}
                </span>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-xs text-[#48484a] font-medium block">Presença</span>
                <span className="text-lg font-semibold text-[#006644]">
                  {primaryTeacherClass.presenceRate}%
                </span>
              </div>
            </div>
            <span className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center text-center whitespace-normal gap-2 text-xs sm:text-sm font-semibold text-[#111827] bg-[#e9e9ef] group-hover:bg-[#dcdce4] px-4 py-2.5 rounded-2xl transition-colors duration-100">
              <Users className="w-4 h-4 text-[#3c3c43] shrink-0" />
              <span>Abrir Turma</span>
              <ChevronRight className="w-4 h-4 text-[#48484a] group-hover:translate-x-0.5 transition-transform shrink-0" />
            </span>
          </div>
        </button>
      )}

      {/* Barra de Filtros e Busca */}
      {userRole !== 'usuario' && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 min-w-0">
          <div className="flex flex-wrap sm:inline-flex items-center p-1.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-[13px] font-bold w-full sm:w-auto max-w-full gap-1 shadow-xs">
            <button
              onClick={() => setSelectedShift('Todos')}
              type="button"
              className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl transition-colors duration-100 cursor-pointer text-center whitespace-normal ${
                selectedShift === 'Todos'
                  ? 'bg-[#0b3b8c] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Todas ({classes.length})
            </button>
            <button
              onClick={() => setSelectedShift('Turno Manhã')}
              type="button"
              className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl transition-colors duration-100 cursor-pointer flex items-center justify-center text-center whitespace-normal gap-1.5 ${
                selectedShift === 'Turno Manhã'
                  ? 'bg-[#0b3b8c] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Manhã ({manhaCount})</span>
            </button>
            <button
              onClick={() => setSelectedShift('Turno Tarde')}
              type="button"
              className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl transition-colors duration-100 cursor-pointer flex items-center justify-center text-center whitespace-normal gap-1.5 ${
                selectedShift === 'Turno Tarde'
                  ? 'bg-[#0b3b8c] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Sunset className="w-4 h-4 text-sky-500 shrink-0" />
              <span>Tarde ({tardeCount})</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-1 min-w-0 sm:max-w-md">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar turma, regente ou código SED..."
                className="w-full min-h-[48px] pl-10 pr-9 bg-white border border-slate-200 text-slate-950 text-sm rounded-2xl focus:border-[#0052cc] focus:outline-none transition-colors placeholder:text-slate-500 shadow-xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950 cursor-pointer"
                  aria-label="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="inline-flex items-center p-1.5 bg-white border border-slate-200 rounded-2xl shrink-0 shadow-xs gap-1">
              <button
                type="button"
                onClick={() => setTurmasViewMode('grid')}
                title="Grade de Cartões"
                aria-label="Visualizar em cartões"
                className={`min-h-[38px] min-w-[38px] p-2 rounded-xl transition-colors duration-100 cursor-pointer flex items-center justify-center ${
                  turmasViewMode === 'grid'
                    ? 'bg-[#0b3b8c] text-white'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTurmasViewMode('table')}
                title="Tabela de Dados"
                aria-label="Visualizar em tabela"
                className={`min-h-[38px] min-w-[38px] p-2 rounded-xl transition-colors duration-100 cursor-pointer flex items-center justify-center ${
                  turmasViewMode === 'table'
                    ? 'bg-[#0b3b8c] text-white'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <TableIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exibição: Tabela ou Cartões Minimalistas */}
      {turmasViewMode === 'table' ? (
        <div className="bg-white rounded-3xl overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <table className="w-full text-left text-xs sm:text-[13px] border-collapse min-w-[780px]">
            <thead className="bg-[#e9e9ef] text-[#3c3c43] font-semibold text-xs">
              <tr>
                <th className="py-3.5 px-4">Turma</th>
                <th className="py-3.5 px-3">Turno e Sala</th>
                <th className="py-3.5 px-3">Regente</th>
                <th className="py-3.5 px-3 text-center">Estudantes</th>
                <th className="py-3.5 px-3 text-center">Frequência</th>
                <th className="py-3.5 px-3 text-center">Faltas</th>
                <th className="py-3.5 px-4 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#48484a] text-sm">
                    Nenhuma turma encontrada.
                  </td>
                </tr>
              ) : (
                filteredClasses.map((cls) => {
                  const isInfantil = cls.name.startsWith('GRUPO');
                  const shortBadge =
                    cls.turmaAbrev ||
                    (isInfantil
                      ? cls.name.replace(/^GRUPO\s*0?/i, 'G').replace(/\s+/g, '')
                      : cls.name.replace(/\s*ANO\s*/i, ''));

                  return (
                    <tr
                      key={cls.id}
                      onClick={() => onSelectClassForDetails(cls)}
                      className="odd:bg-[#f8f8fb] hover:bg-[#ebebf0] cursor-pointer transition-colors group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#e9e9ef] text-[#111827] flex items-center justify-center font-semibold text-xs shrink-0">
                            {shortBadge}
                          </div>
                          <div>
                            <span className="font-semibold text-sm text-[#111827] block">
                              {cls.name}
                            </span>
                            {cls.classeSedCode && (
                              <span className="font-mono text-xs text-[#48484a] tabular-nums">
                                SED {cls.classeSedCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-[#3c3c43]">
                        <span className="block font-medium text-xs sm:text-sm">{cls.shift.replace('Turno ', '')}</span>
                        <span className="text-xs text-[#48484a]">{cls.room}</span>
                      </td>
                      <td className="py-3.5 px-3">
                        {cls.isVaga || cls.teacherName === 'TURMA VAGA' ? (
                          <span className="text-[#9a5b00] font-semibold">Turma vaga</span>
                        ) : (
                          <span className="text-[#111827] block break-words max-w-[260px] leading-snug">
                            {cls.teacherName || 'Regente a atribuir'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums font-medium text-[#111827]">
                        {cls.totalStudents}
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums font-semibold text-[#006644]">
                        {cls.presenceRate}%
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums">
                        <span className={cls.monthlyAbsences > 0 ? 'text-[#b42318] font-semibold' : 'text-[#48484a]'}>
                          {cls.monthlyAbsences}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-xs sm:text-[13px] font-semibold text-[#3c3c43] group-hover:text-[#111827] transition-colors">
                          <span>Alunos</span>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Cartões Ultra-Minimalistas (Clique direto abre os estudantes) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 items-stretch">
          {filteredClasses.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)] col-span-full space-y-3">
              <p className="text-sm sm:text-base text-[#3c3c43]">
                Nenhuma turma encontrada para "{searchTerm}".
              </p>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="min-h-[44px] px-5 py-2 bg-[#1d1d1f] text-white font-semibold rounded-2xl text-xs sm:text-sm cursor-pointer hover:bg-black transition-colors"
              >
                Limpar Busca
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
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => onSelectClassForDetails(cls)}
                  className="w-full min-w-0 text-left bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 active:scale-[0.99] rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-100 flex flex-col justify-between gap-3 cursor-pointer group min-h-[124px]"
                >
                  <div className="flex items-start justify-between gap-2.5 w-full min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 group-hover:bg-[#0b3b8c] text-[#0b3b8c] group-hover:text-white flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 transition-colors">
                        {shortBadge}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base sm:text-[17px] font-bold text-slate-950 leading-snug break-words">
                          {cls.name}
                        </h2>
                        <p className="text-xs sm:text-[13px] text-slate-600 break-words leading-snug">
                          {cls.shift.replace('Turno ', '')} · {cls.room}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      <span className="font-mono font-bold text-xs sm:text-[13px] text-[#047857] tabular-nums">
                        {cls.presenceRate}%
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#0b3b8c] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>

                  <div className="w-full min-w-0 space-y-1 pt-0.5">
                    {cls.isVaga || cls.teacherName === 'TURMA VAGA' ? (
                      <p className="text-xs sm:text-[13px] font-bold text-[#b45309] break-words leading-snug">
                        Turma vaga
                      </p>
                    ) : (
                      <p className="text-xs sm:text-[13px] font-semibold text-slate-800 break-words leading-snug">
                        {cls.teacherName || 'Regente a atribuir'}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 font-medium tabular-nums">
                      <span>{cls.totalStudents} estudantes</span>
                      <span aria-hidden="true">·</span>
                      <span className={cls.monthlyAbsences > 0 ? 'text-[#be123c] font-bold' : ''}>
                        {cls.monthlyAbsences} faltas
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

