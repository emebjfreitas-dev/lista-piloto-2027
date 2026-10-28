import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
} from '../utils/genderDictionary';
import { getSavedPhotosDriveFolderInfo, OFFICIAL_FOLDER_NAME } from '../services/googleSheetsApi';

interface AlunosModalProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  students: Student[];
  onOpenPhotoModal: (student: Student) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
}

export const AlunosModal: React.FC<AlunosModalProps> = ({
  isOpen,
  onClose,
  className,
  students,
  onOpenPhotoModal,
  onOpenStudentGrid,
  onOpenStudentPdf,
}) => {
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    students[0]?.id || null
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return students.filter(
      (s) =>
        q === '' ||
        s.name.toLowerCase().includes(q) ||
        s.number.toString().includes(q) ||
        (s.ra && s.ra.toLowerCase().includes(q))
    );
  }, [students, search]);

  if (!isOpen) return null;

  const selectedStudent =
    students.find((s) => s.id === selectedStudentId) || filtered[0] || students[0] || null;
  const savedDriveFolder = getSavedPhotosDriveFolderInfo();

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-black/[0.08] p-4 sm:p-6 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header: Proporcional e Elegante */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-black/[0.06] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px] text-[#0071e3]">groups</span>
              <h3 className="text-base sm:text-lg font-bold text-[#1d1d1f] truncate leading-tight">
                {className} · Relação de Estudantes
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold tabular-nums">
                {students.length}
              </span>
            </div>
            <p className="text-xs text-[#86868b] mt-0.5 truncate">
              Selecione o estudante para visualizar detalhes, fotos e Ficha Informativa.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Fechar visualização da turma"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Search Bar Minimalista */}
        <div className="py-2.5 shrink-0">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3.5 text-[#86868b] text-[20px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, nº da chamada ou RA..."
              className="w-full h-10 pl-10 pr-9 bg-[#f5f5f7] text-[#1d1d1f] font-medium text-xs sm:text-sm rounded-xl border border-black/[0.06] focus:outline-none focus:bg-white focus:border-[#0071e3] transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">cancel</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Content: 1-Col on Mobile, 12-Col Master-Detail Split on Widescreen Desktop */}
        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-5 overflow-hidden">
          {/* Left Column (7 cols on Widescreen): Responsive Grid of Students */}
          <div className="lg:col-span-7 overflow-y-auto pr-1 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-2.5 content-start flex-1">
            {filtered.map((student) => {
              const isSelected = selectedStudent?.id === student.id;
              const hasAlert = student.totalAbsencesMonth >= 4;

              return (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  className={`p-3 rounded-xl border-2 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#c3e5f4]/45 border-[#003440] shadow-xs'
                      : hasAlert
                      ? 'bg-[#fff8f7] hover:bg-[#ffdad6]/30 border-[#ba1a1a]/40'
                      : 'bg-[#f9faf8] hover:bg-[#f3f4f2] border-[#b4c0c4]/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StudentAvatar student={student} size="md" />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-[#374144]">
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        {student.ra && (
                          <span className="text-[11px] bg-[#edeeec] px-1.5 py-0.2 rounded font-mono font-bold text-[#003440]">
                            RA: {student.ra}-{student.digRa}
                          </span>
                        )}
                        {student.deficiencia && (
                          <span className="text-[11px] font-semibold text-[#003723] bg-[#a4f3ca] px-2 py-0.2 rounded-full">
                            {student.deficiencia}
                          </span>
                        )}
                      </div>
                      <span className="text-base font-semibold text-[#003440] truncate mt-0.5 block">
                        {student.name}
                      </span>
                      <p className="text-xs font-semibold text-[#2c373a] truncate">
                        {student.filiacao1 || student.guardianName || 'Responsável cadastrado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                        student.totalAbsencesMonth > 0
                          ? 'bg-[#ffdad6] text-[#ba1a1a]'
                          : 'bg-[#eaf6ef] text-[#005035]'
                      }`}
                    >
                      {student.totalAbsencesMonth}{' '}
                      {student.totalAbsencesMonth === 1 ? 'falta' : 'faltas'}
                    </span>
                    <span className="material-symbols-outlined text-[#003440] text-[18px] mt-0.5">
                      chevron_right
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column (5 cols on Widescreen, Bottom Card on Mobile): Selected Student Detail Ficha */}
          {selectedStudent && (
            <div className="mt-3 lg:mt-0 lg:col-span-5 p-4 sm:p-5 bg-[#f4f7f5] rounded-2xl border-2 border-[#003440]/25 flex flex-col justify-between gap-3 max-h-[42vh] lg:max-h-full overflow-y-auto">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b-2 border-[#b4c0c4]/70">
                  <span className="text-sm font-semibold text-[#003440] uppercase tracking-wide">
                    Ficha {getStudentGenderLabel(selectedStudent).doEstudante} — Nº{' '}
                    {selectedStudent.number.toString().padStart(2, '0')}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#c3e5f4] text-[#001f29] font-semibold text-xs">
                    {className}
                  </span>
                </div>

                {/* Avatar + Name + Ficha Informativa Escaneada (Drive) */}
                <div className="flex items-center gap-3.5 bg-white p-3.5 rounded-2xl border border-[#b4c0c4]">
                  <StudentAvatar
                    student={selectedStudent}
                    size="lg"
                    expandableOnClick={true}
                    onUploadPhotoClick={() => onOpenPhotoModal(selectedStudent)}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-lg font-semibold text-[#003440] leading-tight block">
                      {selectedStudent.name}
                    </h4>
                    <p className="text-sm font-mono font-bold text-[#2c373a] mt-0.5">
                      RA: {selectedStudent.ra || '—'}-{selectedStudent.digRa || ''}/{selectedStudent.ufRa || 'SP'} •{' '}
                      {getStudentGenderLabel(selectedStudent).label}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {onOpenStudentPdf && (
                        <a
                          href={
                            selectedStudent.fichaPdfDriveUrl ||
                            (selectedStudent.fichaPdfDriveId
                              ? `https://drive.google.com/file/d/${selectedStudent.fichaPdfDriveId}/view`
                              : `#doc-${selectedStudent.id}`)
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenStudentPdf(selectedStudent);
                          }}
                          className="doc-hyperlink px-3 py-1.5 bg-white hover:bg-[#003440] text-[#003440] hover:!text-white border border-black/[0.08] rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            document_scanner
                          </span>
                          <span>Ficha Informativa Escaneada (Drive)</span>
                        </a>
                      )}

                      {onOpenStudentGrid && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenStudentGrid(selectedStudent);
                          }}
                          className="px-3 py-1.5 bg-[#003440] hover:bg-[#1e4b58] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">grid_on</span>
                          <span>Abrir 48 Campos SED</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Student Data Grid (Mobile + Widescreen friendly) */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[11px] font-semibold text-[#647073] uppercase block">
                      Nascimento / Idade
                    </span>
                    <span className="font-semibold text-[#003440]">
                      {selectedStudent.dataNascimento || '—'}{' '}
                      {selectedStudent.idade ? `(${selectedStudent.idade})` : ''}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[11px] font-semibold text-[#647073] uppercase block">
                      Frequência no Mês
                    </span>
                    <span className="font-semibold text-[#005035]">
                      {selectedStudent.totalAbsencesMonth} faltas •{' '}
                      {selectedStudent.justifiedAbsences || 0} atestados
                    </span>
                  </div>

                  <div className="col-span-2 bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[11px] font-semibold text-[#647073] uppercase block">
                      Filiação / Responsáveis (Gênero &amp; Vínculo via Planilha)
                    </span>
                    {(() => {
                      const g1 = resolveGuardianRelationshipInfo(
                        selectedStudent.filiacao1 || selectedStudent.guardianName,
                        'filiacao1',
                        selectedStudent.notes
                      );
                      const g2 = resolveGuardianRelationshipInfo(
                        selectedStudent.filiacao2,
                        'filiacao2',
                        selectedStudent.notes
                      );
                      return (
                        <>
                          <span className="font-bold text-[#151a18] block">
                            1. {g1.roleLabel}: {g1.cleanName || '—'}
                          </span>
                          {selectedStudent.filiacao2 && (
                            <span className="font-bold text-[#374144] block">
                              2. {g2.roleLabel}: {g2.cleanName}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div className="col-span-2 bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[11px] font-semibold text-[#647073] uppercase block">
                      Telefones & Contato
                    </span>
                    <span className="font-semibold text-[#003440]">
                      {selectedStudent.telefones || selectedStudent.guardianPhone || '(11) 98765-4321'}
                    </span>
                    {selectedStudent.emailMunicipal && (
                      <span className="block font-mono text-xs text-[#005035] mt-0.5 truncate">
                        {selectedStudent.emailMunicipal}
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[11px] font-semibold text-[#647073] uppercase block">
                      Endereço Residencial
                    </span>
                    <span className="font-semibold text-[#151a18]">
                      {selectedStudent.logradouro || '—'}, {selectedStudent.numeroResidencia || 'S/N'}{' '}
                      {selectedStudent.complemento ? `(${selectedStudent.complemento})` : ''} —{' '}
                      {selectedStudent.bairro || 'Jundiaí/SP'} (CEP: {selectedStudent.cep || '—'})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t-2 border-[#edeeec] mt-2 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto min-w-[200px] min-h-[48px] px-6 bg-[#003440] hover:bg-[#1e4b58] text-white font-semibold text-base rounded-xl flex items-center justify-center transition-colors cursor-pointer"
          >
            Fechar Visualização da Turma
          </button>
        </div>
      </div>
    </div>
  );
};
