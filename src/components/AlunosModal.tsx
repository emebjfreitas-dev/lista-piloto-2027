import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-black/55 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl md:max-w-4xl lg:max-w-6xl xl:max-w-[1440px] rounded-2xl shadow-2xl border-2 border-[#003440]/20 p-4 sm:p-5 lg:p-6 overflow-hidden flex flex-col max-h-[93vh]">
        {/* Header: Mobile + Widescreen adaptive */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b-2 border-[#edeeec]">
          <div>
            <div className="flex items-center gap-2 text-[#003440]">
              <span className="material-symbols-outlined text-[28px]">groups</span>
              <h3 className="text-[1.2rem] sm:text-[1.45rem] font-black leading-tight">
                Visualização da Turma & Dados dos Estudantes — {className}
              </h3>
            </div>
            <p className="text-[0.86rem] sm:text-[0.94rem] text-[#2c373a] font-semibold mt-0.5">
              {students.length} estudantes cadastrados • Clique no <strong>hyperlink do nome</strong> ou em <strong>Doc PDF</strong> para abrir o documento nominal direto no aplicativo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#2c373a] flex items-center justify-center cursor-pointer transition-colors"
              aria-label="Fechar visualização da turma"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="py-3">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3.5 text-[#71787b] text-[22px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar estudante por nome, número da chamada ou RA..."
              className="w-full min-h-[48px] pl-11 pr-10 bg-[#f3f4f2] text-[#151a18] font-semibold text-[0.95rem] rounded-xl border-2 border-[#b4c0c4] focus:outline-none focus:bg-white focus:border-[#003440]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 text-[#71787b] hover:text-[#151a18] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">cancel</span>
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
                        <span className="text-[0.74rem] font-extrabold text-[#374144]">
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        {student.ra && (
                          <span className="text-[0.68rem] bg-[#edeeec] px-1.5 py-0.2 rounded font-mono font-bold text-[#003440]">
                            RA: {student.ra}-{student.digRa}
                          </span>
                        )}
                        {student.deficiencia && (
                          <span className="text-[0.66rem] font-black text-[#003723] bg-[#a4f3ca] px-2 py-0.2 rounded-full">
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
                          setSelectedStudentId(student.id);
                          if (onOpenStudentPdf) {
                            onOpenStudentPdf(student);
                          }
                        }}
                        title={`Abrir Documento PDF Nominal de ${student.name} por Hyperlink`}
                        className="doc-hyperlink text-[0.98rem] font-extrabold truncate mt-0.5 block"
                      >
                        {student.name}
                      </a>
                      <p className="text-[0.78rem] font-semibold text-[#2c373a] truncate">
                        {student.filiacao1 || student.guardianName || 'Responsável cadastrado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className={`text-[0.78rem] font-black px-2 py-0.5 rounded-lg ${
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
                  <span className="text-[0.82rem] font-black text-[#003440] uppercase tracking-wide">
                    Ficha do(a) Estudante — Nº {selectedStudent.number.toString().padStart(2, '0')}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#c3e5f4] text-[#001f29] font-extrabold text-[0.74rem]">
                    {className}
                  </span>
                </div>

                {/* Avatar + Name + Upload Photo to Drive */}
                <div className="flex items-center gap-3.5 bg-white p-3.5 rounded-2xl border border-[#b4c0c4]">
                  <StudentAvatar student={selectedStudent} size="lg" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={
                        selectedStudent.fichaPdfDriveUrl ||
                        (selectedStudent.fichaPdfDriveId
                          ? `https://drive.google.com/file/d/${selectedStudent.fichaPdfDriveId}/view`
                          : `#doc-${selectedStudent.id}`)
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (onOpenStudentPdf) onOpenStudentPdf(selectedStudent);
                      }}
                      className="doc-hyperlink text-[1.12rem] font-extrabold leading-tight block"
                      title="Clique no hyperlink para abrir o Documento PDF Nominal"
                    >
                      {selectedStudent.name}.pdf
                    </a>
                    <p className="text-[0.8rem] font-mono font-bold text-[#2c373a] mt-0.5">
                      RA: {selectedStudent.ra || '—'}-{selectedStudent.digRa || ''}/{selectedStudent.ufRa || 'SP'}
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
                          className="px-3 py-1.5 bg-[#ba1a1a] hover:bg-[#93000a] text-white rounded-xl text-[0.77rem] font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            link
                          </span>
                          <span>Hyperlink Doc PDF</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenPhotoModal(selectedStudent)}
                        className="px-3 py-1.5 bg-[#005035] hover:bg-[#003723] text-white rounded-xl text-[0.75rem] font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                        <span>Upload Foto (Pasta Drive)</span>
                      </button>

                      {onOpenStudentGrid && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenStudentGrid(selectedStudent);
                          }}
                          className="px-3 py-1.5 bg-[#003440] hover:bg-[#1e4b58] text-white rounded-xl text-[0.75rem] font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">grid_on</span>
                          <span>Abrir 48 Campos SED</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Student Data Grid (Mobile + Widescreen friendly) */}
                <div className="grid grid-cols-2 gap-2 text-[0.8rem]">
                  <div className="bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[0.68rem] font-extrabold text-[#647073] uppercase block">
                      Nascimento / Idade
                    </span>
                    <span className="font-black text-[#003440]">
                      {selectedStudent.dataNascimento || '—'}{' '}
                      {selectedStudent.idade ? `(${selectedStudent.idade})` : ''}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[0.68rem] font-extrabold text-[#647073] uppercase block">
                      Frequência no Mês
                    </span>
                    <span className="font-black text-[#005035]">
                      {selectedStudent.totalAbsencesMonth} faltas •{' '}
                      {selectedStudent.justifiedAbsences || 0} atestados
                    </span>
                  </div>

                  <div className="col-span-2 bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[0.68rem] font-extrabold text-[#647073] uppercase block">
                      Filiação / Responsáveis
                    </span>
                    <span className="font-bold text-[#151a18] block">
                      1. {selectedStudent.filiacao1 || selectedStudent.guardianName || '—'}
                    </span>
                    {selectedStudent.filiacao2 && (
                      <span className="font-bold text-[#374144] block">
                        2. {selectedStudent.filiacao2}
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[0.68rem] font-extrabold text-[#647073] uppercase block">
                      Telefones & Contato
                    </span>
                    <span className="font-black text-[#003440]">
                      {selectedStudent.telefones || selectedStudent.guardianPhone || '(11) 98765-4321'}
                    </span>
                    {selectedStudent.emailMunicipal && (
                      <span className="block font-mono text-[0.72rem] text-[#005035] mt-0.5 truncate">
                        {selectedStudent.emailMunicipal}
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 bg-white p-2.5 rounded-xl border border-[#d5dddf]">
                    <span className="text-[0.68rem] font-extrabold text-[#647073] uppercase block">
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
            className="w-full sm:w-auto min-w-[200px] min-h-[48px] px-6 bg-[#003440] hover:bg-[#1e4b58] text-white font-black text-[0.95rem] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
          >
            Fechar Visualização da Turma
          </button>
        </div>
      </div>
    </div>
  );
};
