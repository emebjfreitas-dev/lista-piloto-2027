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
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f]">
                {userRole === 'usuario' ? 'Minha Turma' : 'Quadro de Turmas'}
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

      {/* Barra de Busca e Filtros de Turno (Direta, Compacta e Intuitiva) */}
      {userRole !== 'usuario' && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Segmented Filter de Turnos */}
          <div className="inline-flex items-center p-1 bg-white rounded-2xl border border-black/[0.06] text-xs font-medium shrink-0">
            <button
              onClick={() => setSelectedShift('Todos')}
              type="button"
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                selectedShift === 'Todos'
                  ? 'bg-[#1d1d1f] text-white font-semibold shadow-xs'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Todas ({classes.length})
            </button>
            <button
              onClick={() => setSelectedShift('Turno Manhã')}
              type="button"
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedShift === 'Turno Manhã'
                  ? 'bg-[#1d1d1f] text-white font-semibold shadow-xs'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Manhã ({manhaCount})</span>
            </button>
            <button
              onClick={() => setSelectedShift('Turno Tarde')}
              type="button"
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedShift === 'Turno Tarde'
                  ? 'bg-[#1d1d1f] text-white font-semibold shadow-xs'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <Sunset className="w-3.5 h-3.5" />
              <span>Tarde ({tardeCount})</span>
            </button>
          </div>

          {/* Campo de Busca e Alternador de Visão */}
          <div className="flex items-center gap-2 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868b]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar turma, regente ou código SED..."
                className="w-full h-10 pl-10 pr-9 bg-white text-[#1d1d1f] text-xs sm:text-sm rounded-2xl border border-black/[0.08] focus:border-[#0071e3] focus:outline-none transition-all placeholder:text-[#86868b]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="inline-flex items-center p-1 bg-white rounded-2xl border border-black/[0.06] shrink-0">
              <button
                type="button"
                onClick={() => setTurmasViewMode('grid')}
                title="Grade de Cartões"
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  turmasViewMode === 'grid'
                    ? 'bg-[#1d1d1f] text-white'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTurmasViewMode('table')}
                title="Tabela de Dados"
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  turmasViewMode === 'table'
                    ? 'bg-[#1d1d1f] text-white'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                <TableIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exibição: Tabela ou Cartões */}
      {turmasViewMode === 'table' ? (
        <div className="bg-white rounded-3xl border border-black/[0.06] overflow-x-auto shadow-xs">
          <table className="w-full text-left text-xs border-collapse min-w-[850px]">
            <thead className="bg-[#fafafc] text-[#86868b] border-b border-black/[0.06] font-semibold uppercase tracking-wider text-[0.66rem]">
              <tr>
                <th className="py-3 px-4">Turma</th>
                <th className="py-3 px-3">Turno &amp; Sala</th>
                <th className="py-3 px-3">Regente</th>
                <th className="py-3 px-3 text-center">Estudantes</th>
                <th className="py-3 px-3 text-center">Frequência</th>
                <th className="py-3 px-3 text-center">Faltas no Mês</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#86868b] font-normal">
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
                      className="hover:bg-[#fafafc] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isInfantil
                                ? 'bg-[#0071e3]/10 text-[#0066cc]'
                                : 'bg-[#f5f5f7] text-[#1d1d1f]'
                            }`}
                          >
                            {shortBadge}
                          </div>
                          <div>
                            <span className="font-semibold text-[#1d1d1f] block">
                              {cls.name}
                            </span>
                            {cls.classeSedCode && (
                              <span className="font-mono text-[0.66rem] text-[#86868b]">
                                SED: {cls.classeSedCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[#6e6e73]">
                        <span className="font-medium text-[#1d1d1f] block">
                          {cls.shift.replace('Turno ', '')}
                        </span>
                        <span className="text-[0.68rem]">{cls.room}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-[#1d1d1f] block truncate max-w-[220px]">
                          {cls.teacherName || 'Regente a atribuir'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums font-medium text-[#1d1d1f]">
                        {cls.totalStudents}
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums font-semibold text-[#005035]">
                        {cls.presenceRate}%
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums font-medium">
                        <span className={cls.monthlyAbsences > 0 ? 'text-[#ba1a1a]' : 'text-[#6e6e73]'}>
                          {cls.monthlyAbsences}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectClassForDetails(cls)}
                            className="h-8 px-3 rounded-lg bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>Ver Alunos</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          {userRole !== 'peb2' && isLaunchButtonOpen && (
                            <button
                              type="button"
                              onClick={() => onSelectClassForMonthlyAttendance(cls)}
                              className="h-8 px-2.5 rounded-lg bg-[#1d1d1f] hover:bg-black text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors"
                              title="Lançar faltas do mês"
                            >
                              <CalendarCheck className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Lançar</span>
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
            <div className="bg-white rounded-3xl p-8 text-center border border-black/[0.06] col-span-full">
              <p className="text-sm font-medium text-[#86868b]">
                Nenhuma turma encontrada para "{searchTerm}".
              </p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-3 px-4 py-2 bg-[#1d1d1f] text-white font-medium rounded-xl text-xs cursor-pointer hover:bg-black transition-colors"
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
                  className="bg-white rounded-3xl p-5 border-2 border-slate-200 hover:border-blue-500 transition-all flex flex-col justify-between gap-4 shadow-xs"
                >
                  <div
                    onClick={() => onSelectClassForDetails(cls)}
                    className="cursor-pointer group space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 transition-transform group-hover:scale-105 shadow-xs ${
                            isInfantil
                              ? 'bg-blue-100 text-blue-900 border-2 border-blue-200'
                              : 'bg-slate-100 text-slate-900 border-2 border-slate-200'
                          }`}
                        >
                          {shortBadge}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                            {cls.name}
                          </h2>
                          <p className="text-xs sm:text-sm font-bold text-slate-600 truncate">
                            {cls.shift.replace('Turno ', '')} · {cls.room}
                          </p>
                        </div>
                      </div>

                      <span className="font-mono font-black text-sm text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-xl tabular-nums shrink-0 border border-emerald-300">
                        {cls.presenceRate}%
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm text-slate-700 space-y-1">
                      <p className="font-bold text-slate-900 truncate">
                        Prof. {cls.teacherName || 'Regente a atribuir'}
                      </p>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <span>{cls.totalStudents} estudantes</span>
                        <span aria-hidden="true">·</span>
                        <span className={cls.monthlyAbsences > 0 ? 'text-rose-700 font-bold' : ''}>
                          {cls.monthlyAbsences} faltas no mês
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`grid ${
                      userRole === 'peb2' ? 'grid-cols-1' : 'grid-cols-2'
                    } gap-2.5 pt-3 border-t-2 border-slate-100`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectClassForDetails(cls)}
                      className="min-h-[48px] px-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs active:scale-98"
                    >
                      <Users className="w-4 h-4 text-slate-700" />
                      <span>Ver Alunos</span>
                    </button>

                    {userRole !== 'peb2' && (
                      <button
                        type="button"
                        onClick={() => onSelectClassForMonthlyAttendance(cls)}
                        disabled={!isLaunchButtonOpen}
                        className={`min-h-[48px] px-3.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs active:scale-98 ${
                          isLaunchButtonOpen
                            ? 'bg-slate-900 hover:bg-black text-white'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                        title={isLaunchButtonOpen ? 'Lançar faltas do mês' : windowEval.reasonLabel}
                      >
                        <CalendarCheck className="w-4 h-4" />
                        <span>Fazer Chamada</span>
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
