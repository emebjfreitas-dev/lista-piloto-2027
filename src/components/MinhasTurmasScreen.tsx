import React, { useState, useMemo } from 'react';
import {
  ClassGroup,
  Student,
  UserRole,
  AttendanceWindowConfig,
  SchoolNotice,
} from '../types';
import { evaluateAttendanceLaunchWindow } from '../services/db';
import {
  Search,
  X,
  LayoutGrid,
  Table as TableIcon,
  Users,
  CalendarCheck,
  FileText,
  Lock,
  Unlock,
  Plus,
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
}) => {
  const [selectedShift, setSelectedShift] = useState<'Todos' | 'Turno Manhã' | 'Turno Tarde'>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [turmasViewMode, setTurmasViewMode] = useState<'grid' | 'table'>('grid');

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

  const missingScannedFichasSummary = useMemo(() => {
    let totalMissing = 0;
    let classesWithMissing = 0;
    classes.forEach((cls) => {
      if (userRole === 'usuario' && !assignedClassIds.includes(cls.id) && cls.id !== assignedClassId) {
        return;
      }
      let classMissing = 0;
      cls.students.forEach((s) => {
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
    return { totalMissing, classesWithMissing };
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
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-14 animate-gentle-fade text-[#1d1d1f]">
      {/* Header Institucional Limpo e Enxuto */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#86868b]">
              <span className="font-semibold text-[#1d1d1f]">
                {userRole === 'usuario' ? 'Área da Professora Regente' : 'Gestão de Turmas'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Ano Letivo 2027</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums font-medium">
                {classes.length} turmas cadastradas
              </span>
              {missingScannedFichasSummary.totalMissing > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#ba1a1a] font-semibold tabular-nums">
                    {missingScannedFichasSummary.totalMissing} estudantes sem ficha PDF
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Minha Turma
              </h1>
              {userRole !== 'peb2' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6e6e73]">
                  {isLaunchButtonOpen ? (
                    <Unlock className="w-3.5 h-3.5 text-[#005035]" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-[#c93400]" />
                  )}
                  <span>{isLaunchButtonOpen ? 'Lançamento aberto' : windowEval.reasonLabel}</span>
                </span>
              )}
            </div>
          </div>

          {/* Ações da Gestão */}
          {userRole === 'admin' && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Simulador de Perfil em Segmented Control Limpo */}
              <div className="inline-flex items-center p-1 bg-[#f5f5f7] rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => onChangeRole('admin')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    userRole === 'admin'
                      ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRole('usuario')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    (userRole as string) === 'usuario'
                      ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                  title="Simular visão PEB I"
                >
                  Regente
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRole('peb2')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    (userRole as string) === 'peb2'
                      ? 'bg-white text-[#1d1d1f] shadow-xs font-semibold'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
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
                  className="h-9 px-3 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CalendarDays className="w-3.5 h-3.5 text-[#6e6e73]" />
                  <span className="hidden sm:inline">200 Dias Letivos</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenNewClassModal}
                className="h-9 px-3.5 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Turma</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Turma Prioritária do Professor Regente */}
      {primaryTeacherClass && (
        <section className="bg-white rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-slate-950 text-white flex items-center justify-center font-bold text-base shrink-0">
                {primaryTeacherClass.turmaAbrev || primaryTeacherClass.name.slice(0, 3)}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase text-slate-700 tracking-wider block">
                  {userRole === 'usuario' ? 'Sua Turma de Regência' : 'Turma em Destaque'}
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-950 leading-tight truncate">
                  Turma {primaryTeacherClass.name}
                </h2>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-700 font-semibold mt-1 truncate">
                  <span>{primaryTeacherClass.shift.replace('Turno ', '')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{primaryTeacherClass.room}</span>
                  <span aria-hidden="true">·</span>
                  <span>Prof. {primaryTeacherClass.teacherName || 'Regente'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5 shrink-0">
              <div className="text-right">
                <span className="text-xs font-bold text-slate-700 uppercase block">Presença Mês</span>
                <span className="text-2xl font-bold text-emerald-900 font-mono tabular-nums">
                  {primaryTeacherClass.presenceRate}%
                </span>
              </div>
              <div className="text-right border-l border-slate-200 pl-5">
                <span className="text-xs font-bold text-slate-700 uppercase block">Faltas no Mês</span>
                <span className="text-2xl font-bold text-rose-800 font-mono tabular-nums">
                  {primaryTeacherClass.monthlyAbsences}
                </span>
              </div>
            </div>
          </div>

          {/* Ações Didáticas: 1) Informar Faltas do Mês e 2) Ver Alunos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {userRole !== 'peb2' && (
              <button
                type="button"
                onClick={() => onSelectClassForMonthlyAttendance(primaryTeacherClass)}
                disabled={!isLaunchButtonOpen}
                className={`h-11 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  isLaunchButtonOpen
                    ? 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={isLaunchButtonOpen ? 'Informar faltas do mês de referência' : windowEval.reasonLabel}
              >
                <span className="material-symbols-outlined text-[19px]">checklist</span>
                <span>Informar Faltas do Mês</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onSelectClassForDetails(primaryTeacherClass)}
              className="h-11 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <Users className="w-4 h-4 text-slate-800" />
              <span>Ver Alunos ({primaryTeacherClass.totalStudents})</span>
            </button>
          </div>
        </section>
      )}

      {/* Barra de Busca e Filtros de Turno */}
      {userRole !== 'usuario' && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Segmented Filter de Turnos */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/60 text-xs font-medium shrink-0">
            <button
              onClick={() => setSelectedShift('Todos')}
              type="button"
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                selectedShift === 'Todos'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas ({classes.length})
            </button>
            <button
              onClick={() => setSelectedShift('Turno Manhã')}
              type="button"
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedShift === 'Turno Manhã'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sun className="w-3 h-3 text-slate-500" />
              <span>Manhã ({manhaCount})</span>
            </button>
            <button
              onClick={() => setSelectedShift('Turno Tarde')}
              type="button"
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedShift === 'Turno Tarde'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sunset className="w-3 h-3 text-slate-500" />
              <span>Tarde ({tardeCount})</span>
            </button>
          </div>

          {/* Campo de Busca e Alternador de Visão */}
          <div className="flex items-center gap-2 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar turma, regente ou código SED..."
                className="w-full h-8 pl-8 pr-8 bg-white text-slate-900 text-xs rounded-lg border border-slate-200/90 focus:border-slate-400 focus:outline-none transition-colors placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/60 shrink-0">
              <button
                type="button"
                onClick={() => setTurmasViewMode('grid')}
                title="Grade de Cartões"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  turmasViewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTurmasViewMode('table')}
                title="Tabela de Dados"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  turmasViewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exibição: Tabela ou Cartões */}
      {turmasViewMode === 'table' ? (
        <div className="bg-white rounded-xl border border-slate-200/90 overflow-x-auto shadow-none">
          <table className="w-full text-left text-xs border-collapse min-w-[850px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200/80 font-medium uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-4">Turma</th>
                <th className="py-2.5 px-3">Turno &amp; Sala</th>
                <th className="py-2.5 px-3">Regente</th>
                <th className="py-2.5 px-3 text-center">Estudantes</th>
                <th className="py-2.5 px-3 text-center">Frequência</th>
                <th className="py-2.5 px-3 text-center">Faltas no Mês</th>
                <th className="py-2.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-normal">
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
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200/70 flex items-center justify-center font-medium text-xs text-slate-800 shrink-0">
                            {shortBadge}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block">
                              {cls.name}
                            </span>
                            {cls.classeSedCode && (
                              <span className="font-mono text-[10px] text-slate-400">
                                SED: {cls.classeSedCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <span className="font-medium text-slate-900 block">
                          {cls.shift.replace('Turno ', '')}
                        </span>
                        <span className="text-[11px] text-slate-400">{cls.room}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {cls.isVaga || cls.teacherName === 'TURMA VAGA' ? (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200">
                            TURMA VAGA
                          </span>
                        ) : (
                          <span className="font-medium text-slate-800 block truncate max-w-[220px]">
                            {cls.teacherName || 'Regente a atribuir'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums font-medium text-slate-900">
                        {cls.totalStudents}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums font-semibold text-emerald-800">
                        {cls.presenceRate}%
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums font-medium">
                        <span className={cls.monthlyAbsences > 0 ? 'text-rose-700 font-semibold' : 'text-slate-400'}>
                          {cls.monthlyAbsences}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectClassForDetails(cls)}
                            className="h-7 px-2.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>Ver Alunos</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                          {userRole !== 'peb2' && isLaunchButtonOpen && (
                            <button
                              type="button"
                              onClick={() => onSelectClassForMonthlyAttendance(cls)}
                              className="h-7 px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors"
                              title="Informar faltas do mês"
                            >
                              <CalendarCheck className="w-3 h-3" />
                              <span className="hidden sm:inline">Faltas do Mês</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Modo Grade de Cartões Limpos */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 items-stretch">
          {filteredClasses.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200/90 col-span-full">
              <p className="text-xs text-slate-400 font-normal">
                Nenhuma turma encontrada para "{searchTerm}".
              </p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-3 px-3 py-1.5 bg-slate-900 text-white font-medium rounded-lg text-xs cursor-pointer hover:bg-slate-800 transition-colors"
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
                <div
                  key={cls.id}
                  className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3"
                >
                  <div
                    onClick={() => onSelectClassForDetails(cls)}
                    className="cursor-pointer group space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {shortBadge}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-slate-950 group-hover:text-blue-700 transition-colors truncate">
                            {cls.name}
                          </h2>
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {cls.shift.replace('Turno ', '')} · {cls.room}
                          </p>
                        </div>
                      </div>

                      <span className="font-mono font-bold text-xs text-emerald-950 bg-emerald-100 px-2.5 py-1 rounded-lg tabular-nums shrink-0">
                        {cls.presenceRate}%
                      </span>
                    </div>

                    <div className="text-xs text-slate-800 space-y-0.5">
                      {cls.isVaga || cls.teacherName === 'TURMA VAGA' ? (
                        <span className="inline-flex items-center text-amber-950 font-bold text-xs bg-amber-100 px-2 py-0.5 rounded-lg">
                          TURMA VAGA
                        </span>
                      ) : (
                        <p className="font-bold text-slate-900 truncate">
                          Prof. {cls.teacherName || 'Regente a atribuir'}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold">
                        <span>{cls.totalStudents} estudantes</span>
                        <span aria-hidden="true">·</span>
                        <span className={cls.monthlyAbsences > 0 ? 'text-rose-800 font-bold' : ''}>
                          {cls.monthlyAbsences} faltas
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`grid ${
                      userRole === 'peb2' ? 'grid-cols-1' : 'grid-cols-2'
                    } gap-2 pt-3 border-t border-slate-100`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectClassForDetails(cls)}
                      className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Users className="w-4 h-4 text-slate-800" />
                      <span>Alunos</span>
                    </button>

                    {userRole !== 'peb2' && (
                      <button
                        type="button"
                        onClick={() => onSelectClassForMonthlyAttendance(cls)}
                        disabled={!isLaunchButtonOpen}
                        className={`h-9 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          isLaunchButtonOpen
                            ? 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                        title={isLaunchButtonOpen ? 'Informar faltas do mês' : windowEval.reasonLabel}
                      >
                        <CalendarCheck className="w-4 h-4" />
                        <span>Faltas</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
