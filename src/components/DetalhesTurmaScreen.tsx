import React, { useState, useMemo } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { downloadClassCSV } from '../services/db';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentAttendanceMetrics } from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';
import { getSavedPhotosDriveFolderInfo, OFFICIAL_FOLDER_NAME } from '../services/googleSheetsApi';

interface DetalhesTurmaScreenProps {
  classGroup: ClassGroup;
  assignedClasses?: ClassGroup[];
  onSwitchAssignedClass?: (cls: ClassGroup) => void;
  userRole?: UserRole;
  isMainAdminAccount?: boolean;
  onReturnToAdminMode?: () => void;
  canLaunchAttendance?: boolean;
  onGoToMonthlyAttendance: () => void;
  onGoToMonthlySummary: () => void;
  onOpenStudentList: () => void;
  onOpenNotes: () => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onNavigateToSheet: () => void;
  onBackToClasses: () => void;
}

export const DetalhesTurmaScreen: React.FC<DetalhesTurmaScreenProps> = ({
  classGroup,
  assignedClasses = [],
  onSwitchAssignedClass,
  userRole = 'admin',
  canLaunchAttendance = true,
  onGoToMonthlyAttendance,
  onOpenStudentList,
  onOpenStudentGrid,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onBackToClasses,
}) => {
  const [searchStudent, setSearchStudent] = useState('');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [filterAlertOnly, setFilterAlertOnly] = useState(false);
  const savedDriveFolder = getSavedPhotosDriveFolderInfo();
  const diasLetivosMes = classGroup.classesHeld || 20;
  const isInfantilClass =
    classGroup.name.toUpperCase().startsWith('GRUPO') ||
    classGroup.grade.toUpperCase().includes('INFANTIL');
  const minLegalPresence = isInfantilClass ? 60 : 75;

  const alertStudentsCount = useMemo(() => {
    return classGroup.students.filter((s) => {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      return m.isBelowLegalThreshold;
    }).length;
  }, [classGroup.students, diasLetivosMes]);

  const filteredStudents = useMemo(() => {
    const q = searchStudent.toLowerCase().trim();
    return classGroup.students.filter((s) => {
      const matchesQuery =
        q === '' ||
        s.name.toLowerCase().includes(q) ||
        s.number.toString().includes(q) ||
        (s.ra && s.ra.toLowerCase().includes(q));
      if (!matchesQuery) return false;
      if (filterAlertOnly) {
        const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
        return m.isBelowLegalThreshold;
      }
      return true;
    });
  }, [classGroup.students, searchStudent, filterAlertOnly, diasLetivosMes]);

  return (
    <div className="flex flex-col w-full max-w-xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto space-y-5 pb-36 animate-gentle-fade">
      {/* Se a professora PEB I tiver 2 ou mais turmas vinculadas (ex: Manhã + Tarde), mostra barra rápida para alternar entre suas turmas */}
      {userRole === 'usuario' && assignedClasses.length > 1 && onSwitchAssignedClass && (
        <section className="bg-white rounded-2xl p-3.5 shadow-xs border-2 border-[#005035]/30 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#005035]">
              swap_horiz
            </span>
            <span className="text-[0.82rem] font-extrabold text-[#003440]">
              Suas Turmas Vinculadas ({assignedClasses.length}):
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {assignedClasses.map((cls) => {
              const isSelected = cls.id === classGroup.id;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => onSwitchAssignedClass(cls)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl font-black text-[0.8rem] flex items-center gap-1.5 transition-all cursor-pointer border-2 ${
                    isSelected
                      ? 'bg-[#005035] text-white border-[#005035] shadow-xs'
                      : 'bg-[#f4f7f5] text-[#003440] border-[#c0c8cb] hover:bg-[#e8f8ef]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {isSelected ? 'check_circle' : 'groups'}
                  </span>
                  <span>
                    {cls.name} ({cls.shift.replace('Turno ', '')})
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {/* Top Overview & Actions Row: Stacked on Mobile, 12-Col Widescreen on Desktop */}
      <div className="space-y-4 xl:space-y-0 xl:grid xl:grid-cols-12 xl:gap-5 xl:items-stretch">
        {/* Class Identity Card */}
        <section className="xl:col-span-6 card-welcoming bg-white rounded-2xl p-5 sm:p-6 border border-[#003440]/12 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-[0.76rem] font-extrabold uppercase tracking-wider text-[#005035] block">
                {classGroup.shift} · Ano Letivo 2027
              </span>
              <h1 className="text-[1.85rem] sm:text-[2.1rem] font-extrabold text-[#003440] leading-tight mt-1">
                Turma {classGroup.name}
              </h1>
              <p className="text-[0.96rem] text-[#436370] font-semibold mt-0.5">
                {classGroup.grade} · {classGroup.room}
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f1f4f3] text-[#003440] border border-[#003440]/12 font-bold text-[0.76rem]">
              <span className="material-symbols-outlined text-[16px] text-[#005035]">link</span>
              <span>Fichas PDF por Hyperlink</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3.5 border-t border-[#003440]/10 text-center">
            <div className="bg-[#f5f7f6] p-3 rounded-xl border border-[#003440]/8">
              <span className="text-[0.7rem] font-bold text-[#5a676b] block uppercase tracking-wider">
                Estudantes
              </span>
              <span className="text-[1.45rem] font-black text-[#003440] tabular-nums">
                {classGroup.totalStudents}
              </span>
            </div>
            <div className="bg-[#fff8f7] p-3 rounded-xl border border-[#ba1a1a]/15">
              <span className="text-[0.7rem] font-bold text-[#ba1a1a] block uppercase tracking-wider">
                Faltas no Mês
              </span>
              <span className="text-[1.45rem] font-black text-[#ba1a1a] tabular-nums">
                {classGroup.monthlyAbsences}
              </span>
            </div>
            <div className="bg-[#eaf6ef]/70 p-3 rounded-xl border border-[#005035]/20">
              <span className="text-[0.7rem] font-bold text-[#005035] block uppercase tracking-wider">
                Presença
              </span>
              <span className="text-[1.45rem] font-black text-[#005035] tabular-nums">
                {classGroup.presenceRate}%
              </span>
            </div>
          </div>
        </section>

        {/* Big Action Buttons Column */}
        <section className="xl:col-span-6 flex flex-col justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            {/* Main Action 1: Lançar Faltas / Estudantes */}
            {userRole === 'peb2' ? (
              <button
                onClick={onGoToMonthlyAttendance}
                type="button"
                className="w-full min-h-[78px] bg-[#7a4100] hover:bg-[#5c3000] text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3 text-left transition-all active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[28px]">
                      fact_check
                    </span>
                  </div>
                  <div>
                    <span className="text-[1.05rem] font-black leading-tight block">
                      Frequência do Mês
                    </span>
                    <span className="text-[0.78rem] text-white/85 font-semibold">
                      Modo consulta (PEB II)
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[24px]">
                  arrow_forward
                </span>
              </button>
            ) : canLaunchAttendance ? (
              <button
                onClick={onGoToMonthlyAttendance}
                type="button"
                className="w-full min-h-[78px] bg-[#005035] hover:bg-[#003824] text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3 text-left transition-all active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[28px] text-[#a4f3ca]">
                      edit_calendar
                    </span>
                  </div>
                  <div>
                    <span className="text-[1.05rem] font-black leading-tight block">
                      Lançar Faltas
                    </span>
                    <span className="text-[0.78rem] text-[#a4f3ca] font-semibold">
                      Salva automático na Planilha
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[24px] text-[#a4f3ca]">
                  arrow_forward
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                title="Abertura no último dia letivo do mês + 2 primeiros do próximo mês"
                className="w-full min-h-[78px] bg-[#edeeec] text-[#566366] border border-[#c0c8cb] rounded-2xl p-4 flex items-center justify-between gap-3 text-left cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#e1e3e1] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[26px] text-[#566366]">
                      lock_clock
                    </span>
                  </div>
                  <div>
                    <span className="text-[1rem] font-black leading-tight block text-[#41484b]">
                      Lançar Faltas
                    </span>
                    <span className="text-[0.75rem] text-[#566366] font-semibold">
                      Abre no fecho mensal
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[22px] text-[#71787b]">
                  lock
                </span>
              </button>
            )}

            {/* Main Action 2: Visualizar Estudantes */}
            <button
              onClick={onOpenStudentList}
              type="button"
              className="w-full min-h-[78px] bg-[#003440] hover:bg-[#004c5c] text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3 text-left transition-all active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/15 text-[#bdeafa] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[28px]">badge</span>
                </div>
                <div>
                  <span className="text-[1.05rem] font-black leading-tight block">
                    Ver Estudantes
                  </span>
                  <span className="text-[0.78rem] text-[#bdeafa] font-semibold">
                    {classGroup.totalStudents} fichas • Livre 24h
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[24px] text-[#bdeafa]">
                visibility
              </span>
            </button>
          </div>

          <div
            className={`grid grid-cols-1 ${
              userRole !== 'usuario' ? 'sm:grid-cols-2' : ''
            } gap-3`}
          >
            <button
              onClick={() => downloadClassCSV(classGroup)}
              type="button"
              className="w-full min-h-[52px] bg-white hover:bg-[#f3f4f2] text-[#005035] rounded-2xl px-4 shadow-2xs border-2 border-[#a4f3ca] flex items-center justify-center gap-2 font-extrabold text-[0.92rem] transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">download</span>
              <span>Baixar Planilha da Turma (.csv)</span>
            </button>

            {userRole !== 'usuario' && (
              <button
                onClick={onBackToClasses}
                type="button"
                className="w-full min-h-[52px] bg-[#edeeec] hover:bg-[#e7e8e6] text-[#003440] font-extrabold text-[0.92rem] rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-colors border border-[#b4c0c4]"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                <span>Voltar às 40 Turmas</span>
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Direct Responsive Student Grid (1 col Mobile, 2 cols Tablet, 3 cols Laptop, 4 cols Widescreen 1920x1080) */}
      <section className="card-welcoming bg-white rounded-2xl p-4 sm:p-6 border border-[#003440]/12 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1.18rem] font-extrabold text-[#003440] flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#005035]">
                  groups
                </span>
                <span>
                  Estudantes da Turma {classGroup.name} ({filteredStudents.length})
                </span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#f1f4f3] text-[#003440] text-[0.73rem] font-bold border border-[#003440]/12">
                Mínimo Legal LDB / Bolsa Família: {minLegalPresence}% ({isInfantilClass ? 'Ed. Infantil' : 'Ens. Fundamental'})
              </span>
              {alertStudentsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterAlertOnly(!filterAlertOnly)}
                  className={`px-2.5 py-0.5 rounded-full text-[0.73rem] font-extrabold flex items-center gap-1 cursor-pointer transition-colors ${
                    filterAlertOnly
                      ? 'bg-[#ba1a1a] text-white'
                      : 'bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  <span>
                    {alertStudentsCount} abaixo de {minLegalPresence}% {filterAlertOnly ? '(Ver Todos)' : '(Filtrar)'}
                  </span>
                </button>
              )}
            </div>
            <p className="text-[0.83rem] text-[#436370] font-medium mt-0.5">
              Toque na <strong>foto</strong> para expandir · no <strong>hyperlink do nome</strong> para abrir o Doc Escaneado no Drive · ou em <strong>Expandir Dados</strong> no balão.
            </p>
          </div>

          <div className="relative w-full lg:w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5a676b] text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Buscar estudante por nome ou RA..."
              className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#f5f7f6] border border-[#003440]/15 text-[0.86rem] font-semibold focus:outline-none focus:bg-white focus:border-[#003440]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 items-start">
          {filteredStudents.map((student) => {
            const m = getStudentAttendanceMetrics(
              student,
              diasLetivosMes,
              OFFICIAL_OCTOBER_DAYS
            );
            const isExpanded = expandedStudentId === student.id;
            const cleanPhotoFileName = `${student.name
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toUpperCase()
              .trim()}.jpg`;

            return (
              <div
                key={student.id}
                onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                className={`card-welcoming rounded-2xl p-4 border flex flex-col justify-between gap-3 cursor-pointer transition-all ${
                  m.isBelowLegalThreshold
                    ? 'bg-[#fff8f7] border-[#ba1a1a]/45'
                    : isExpanded
                    ? 'bg-white border-[#003440]/40 ring-2 ring-[#003440]/10'
                    : 'bg-[#fafbfa] hover:bg-white border-[#003440]/12'
                }`}
              >
                {/* Top Header inside Student Balloon: Expandable Photo + Direct Hyperlink to Scanned PDF + Quick Preview */}
                <div className="flex items-start gap-3">
                  <StudentAvatar
                    student={student}
                    size="md"
                    expandableOnClick={true}
                    onUploadPhotoClick={
                      onOpenPhotoModal ? () => onOpenPhotoModal(student) : undefined
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[0.72rem] font-bold text-[#436370] tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#003440] font-extrabold">
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        {student.ra && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[#003440]">
                              RA {student.ra}-{student.digRa}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-[18px] text-[#5a676b]">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>

                    {/* Direct Hyperlink to Scanned PDF in Google Drive right on the student name */}
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
                        } else if (onOpenStudentGrid) {
                          onOpenStudentGrid(student);
                        }
                      }}
                      title={`Abrir Documento Escaneado (${student.name}.pdf) no Google Drive`}
                      className="doc-hyperlink text-[0.94rem] font-extrabold leading-snug truncate mt-0.5 block cursor-pointer"
                    >
                      {student.name}
                    </a>

                    {/* Compact Data Preview always visible on the card */}
                    <div className="text-[0.73rem] text-[#5a676b] font-medium mt-1 space-y-0.5">
                      <p className="truncate">
                        <strong className="text-[#374346]">Resp.:</strong>{' '}
                        {student.filiacao1 || student.guardianName || 'Não informado'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] font-mono">
                        {student.dataNascimento && (
                          <span>Nasc: {student.dataNascimento}</span>
                        )}
                        {student.telefones && (
                          <>
                            <span>·</span>
                            <span className="text-[#005035] font-semibold">
                              {student.telefones}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legal Attendance Alert Banner (Pertinent only when < 60% Infantil or < 75% Fundamental) */}
                {m.isBelowLegalThreshold && (
                  <div className="px-2.5 py-1.5 rounded-xl bg-[#ffdad6]/85 border border-[#ba1a1a]/30 text-[#93000a] text-[0.72rem] font-bold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] shrink-0">
                      warning
                    </span>
                    <span className="leading-tight">
                      Presença {m.frequenciaPercent}% abaixo do mínimo legal ({m.minLegalPresencePercent}% · Bolsa Família)
                    </span>
                  </div>
                )}

                {/* Inline Expandable SED Preview Drawer when clicking the card */}
                {isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="p-3 rounded-xl bg-[#f5f7f6] border border-[#003440]/12 space-y-2 text-[0.74rem] animate-gentle-fade"
                  >
                    <div className="flex items-center justify-between border-b border-[#003440]/10 pb-1.5">
                      <span className="font-extrabold text-[#003440] uppercase tracking-wider text-[0.68rem]">
                        Prévia Rápida · Dados SED & Drive
                      </span>
                      <span className="font-mono text-[0.68rem] text-[#005035] font-bold">
                        Recorte: {m.diasLetivosMatriculados}/{m.diasLetivosMes}d
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[#374346]">
                      <div>
                        <span className="text-[#5a676b] block text-[0.66rem]">NIS (Bolsa Família)</span>
                        <span className="font-mono font-bold text-[#003440]">
                          {student.nis || 'Não cadastrado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5a676b] block text-[0.66rem]">CPF / SUS</span>
                        <span className="font-mono font-bold text-[#003440] truncate block">
                          {student.cpf || student.cartaoSus || '—'}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#5a676b] block text-[0.66rem]">Filiação 1 e 2</span>
                        <span className="font-semibold text-[#0f1715] block truncate">
                          {student.filiacao1 || '—'} {student.filiacao2 ? `/ ${student.filiacao2}` : ''}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#5a676b] block text-[0.66rem]">Endereço Residencial</span>
                        <span className="font-medium text-[#0f1715] block truncate">
                          {student.logradouro
                            ? `${student.logradouro}, ${student.numeroResidencia || 'S/N'} - ${student.bairro || ''}`
                            : 'Endereço na ficha completa'}
                        </span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-[#003440]/8 flex items-center justify-between text-[0.68rem]">
                        <span className="text-[#5a676b] truncate" title={OFFICIAL_FOLDER_NAME}>
                          Pasta Foto: <code className="font-mono text-[#005035]">{cleanPhotoFileName}</code>
                        </span>
                        <span className="font-bold text-[#003440]">
                          Atestados: {m.atestados}
                        </span>
                      </div>
                    </div>

                    {onOpenStudentGrid && (
                      <button
                        type="button"
                        onClick={() => onOpenStudentGrid(student)}
                        className="w-full min-h-[34px] mt-1 rounded-lg bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.74rem] flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">open_in_full</span>
                        <span>Abrir / Editar Todos os 48 Campos SED</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Bottom Action Bar in Student Balloon: Attendance + Direct Scanned Doc Hyperlink + Photo Upload + Expand */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pt-2.5 border-t border-[#003440]/8 flex items-center justify-between gap-1.5 text-[0.74rem]"
                >
                  <div className="flex items-center gap-1 font-mono font-bold tabular-nums">
                    <span className={m.faltas > 0 ? 'text-[#ba1a1a]' : 'text-[#005035]'}>
                      {m.faltas}f
                    </span>
                    {m.atestados > 0 && (
                      <span className="text-[#005035]" title="Atestados apresentados">
                        ({m.atestados}at)
                      </span>
                    )}
                    <span aria-hidden="true" className="text-[#a8b5b9]">·</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md ${
                        m.isBelowLegalThreshold
                          ? 'bg-[#ba1a1a] text-white font-black'
                          : 'text-[#003440]'
                      }`}
                    >
                      {m.frequenciaPercent}%
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
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
                        title={`Hyperlink direto para abrir o Documento Escaneado (${student.name}.pdf) no Google Drive`}
                        className="px-2 py-1 rounded-lg bg-[#ffdad6]/85 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          document_scanner
                        </span>
                        <span>Doc Drive</span>
                      </a>
                    )}
                    {onOpenPhotoModal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPhotoModal(student);
                        }}
                        title={`Subir foto salva automaticamente na pasta nomeada (${OFFICIAL_FOLDER_NAME}/${cleanPhotoFileName})`}
                        className="px-2 py-1 rounded-lg bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#005035] font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          add_a_photo
                        </span>
                        <span>Foto</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedStudentId(isExpanded ? null : student.id);
                      }}
                      title="Expandir prévia de dados ou abrir 48 campos"
                      className={`px-2 py-1 rounded-lg font-extrabold flex items-center gap-0.5 cursor-pointer transition-colors ${
                        isExpanded
                          ? 'bg-[#005035] text-white'
                          : 'bg-[#003440] hover:bg-[#1e4b58] text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isExpanded ? 'unfold_less' : 'unfold_more'}
                      </span>
                      <span>Dados</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
