import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
} from '../utils/genderDictionary';
import { getSavedPhotosDriveFolderInfo, OFFICIAL_FOLDER_NAME } from '../services/googleSheetsApi';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { findStudentSiblings } from '../utils/siblingDetection';
import { StudentSiblingsCard } from './StudentSiblingsCard';
import { ChevronRight, FileSpreadsheet, FileText, Search, Users, X, XCircle } from 'lucide-react';

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
  useModalScrollLock(isOpen);

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

  // Cruzamento automático de irmãos por Mãe, Pai ou Ambos
  const detectedSiblings = useMemo(() => {
    if (!selectedStudent) return [];
    return findStudentSiblings(selectedStudent);
  }, [selectedStudent]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-shell w-full max-w-4xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh] animate-apple-pop"
      >
        {/* Header: Proporcional e Elegante */}
        <div className="flex items-center justify-between gap-3 pb-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Users className="w-5 h-5 text-[#0b3b8c] shrink-0" strokeWidth={2} />
              <h3 className="text-base sm:text-lg font-semibold text-slate-950 break-words leading-snug">
                {className} · Relação de Estudantes
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-[#edf2f7] text-slate-900 text-xs font-mono font-semibold tabular-nums shrink-0">
                {students.length}
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5 break-words">
              Selecione o estudante para visualizar detalhes, fotos e Ficha Informativa.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-[#edf2f7] text-slate-700 hover:text-slate-950 hover:bg-[#e2e8f0] flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Fechar visualização da turma"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Search Bar Minimalista */}
        <div className="py-2.5 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-[18px] h-[18px] absolute left-3.5 text-slate-600" strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, nº da chamada ou RA..."
              className="w-full h-10 pl-10 pr-9 bg-[#edf2f7] text-slate-950 placeholder:text-slate-600 font-medium text-xs sm:text-sm rounded-xl focus:bg-white transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 text-slate-600 hover:text-slate-950 cursor-pointer"
                aria-label="Limpar busca"
              >
                <XCircle className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Main Content: 1-Col on Mobile, 12-Col Master-Detail Split on Widescreen Desktop */}
        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-5 overflow-hidden">
          {/* Left Column (7 cols on Widescreen): Responsive Grid of Students */}
          <div className="lg:col-span-7 modal-scroll-body pr-1 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-2.5 content-start flex-1">
            {filtered.map((student) => {
              const isSelected = selectedStudent?.id === student.id;
              const hasAlert = student.totalAbsencesMonth >= 4;

              return (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  className={`p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#dce7fb] shadow-[0_6px_18px_-6px_rgba(11,59,140,0.22)] -translate-y-px'
                      : hasAlert
                      ? 'bg-rose-50 hover:bg-rose-100/80'
                      : 'bg-[#f4f7fb] hover:bg-[#edf2f7]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <StudentAvatar student={student} size="lg" />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-800">
                          Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        {student.ra && (
                          <span className="text-xs bg-white px-1.5 py-0.5 rounded font-mono font-bold text-[#003440]">
                            RA: {student.ra}-{student.digRa}
                          </span>
                        )}
                        {student.deficiencia && (
                          <span className="text-xs font-semibold text-emerald-950 bg-emerald-100 px-2 py-0.5 rounded-full break-words">
                            {student.deficiencia}
                          </span>
                        )}
                      </div>
                      <span className="text-base font-semibold text-[#003440] break-words leading-snug mt-0.5 block">
                        {student.name}
                      </span>
                      <p className="text-xs font-semibold text-slate-700 break-words">
                        {student.filiacao1 || student.guardianName || 'Responsável cadastrado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                        student.totalAbsencesMonth > 0
                          ? 'bg-rose-100 text-rose-950'
                          : 'bg-emerald-100 text-emerald-950'
                      }`}
                    >
                      {student.totalAbsencesMonth}{' '}
                      {student.totalAbsencesMonth === 1 ? 'falta' : 'faltas'}
                    </span>
                    <ChevronRight className="w-[18px] h-[18px] text-[#003440] mt-0.5" strokeWidth={2} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column (5 cols on Widescreen, Bottom Card on Mobile): Selected Student Detail Ficha */}
          {selectedStudent && (
            <div className="mt-3 lg:mt-0 lg:col-span-5 p-4 sm:p-5 bg-[#f4f7fb] rounded-2xl flex flex-col justify-between gap-3 max-h-[42vh] lg:max-h-full modal-scroll-body">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-sm font-semibold text-[#003440] uppercase tracking-wide">
                    Ficha {getStudentGenderLabel(selectedStudent).doEstudante} — Nº{' '}
                    {selectedStudent.number.toString().padStart(2, '0')}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#dce7fb] text-[#090f1d] font-semibold text-xs">
                    {className}
                  </span>
                </div>

                {/* Avatar + Name + Ficha Informativa Escaneada (Drive) */}
                <div className="flex items-center gap-4 bg-white p-3.5 rounded-2xl shadow-[0_4px_14px_-6px_rgba(9,15,29,0.06)]">
                  <StudentAvatar
                    student={selectedStudent}
                    size="xl"
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
                          className="doc-hyperlink px-3 py-1.5 bg-[#edf2f7] hover:bg-[#003440] text-[#003440] hover:!text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <FileText className="w-4 h-4" strokeWidth={2} />
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
                          className="px-3 py-1.5 bg-[#003440] hover:bg-[#1e4b58] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97]"
                        >
                          <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
                          <span>Abrir 48 Campos SED</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Student Data Grid (Mobile + Widescreen friendly) */}
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 text-sm">
                  <div className="bg-white p-2.5 rounded-xl shadow-[0_3px_10px_-5px_rgba(9,15,29,0.06)] min-w-0">
                    <span className="text-xs font-semibold text-slate-700 uppercase block">
                      Nascimento / Idade
                    </span>
                    <span className="font-semibold text-[#003440] break-words">
                      {selectedStudent.dataNascimento || '—'}{' '}
                      {selectedStudent.idade ? `(${selectedStudent.idade})` : ''}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl shadow-[0_3px_10px_-5px_rgba(9,15,29,0.06)] min-w-0">
                    <span className="text-xs font-semibold text-slate-700 uppercase block">
                      Frequência no Mês
                    </span>
                    <span className="font-semibold text-[#065f46] break-words">
                      {selectedStudent.totalAbsencesMonth} faltas •{' '}
                      {selectedStudent.justifiedAbsences || 0} atestados
                    </span>
                  </div>

                  <div className="min-[400px]:col-span-2 bg-white p-2.5 rounded-xl shadow-[0_3px_10px_-5px_rgba(9,15,29,0.06)] min-w-0">
                    <span className="text-xs font-semibold text-slate-700 uppercase block">
                      Filiação / Responsáveis (Gênero &amp; Vínculo)
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
                          <span className="font-bold text-slate-950 block break-words">
                            1. {g1.roleLabel}: {g1.cleanName || '—'}
                          </span>
                          {selectedStudent.filiacao2 && (
                            <span className="font-bold text-slate-800 block break-words">
                              2. {g2.roleLabel}: {g2.cleanName}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {detectedSiblings.length > 0 && (
                    <div className="min-[400px]:col-span-2 min-w-0">
                      <StudentSiblingsCard
                        siblings={detectedSiblings}
                        compact
                        onSelectSibling={(sibSt) => {
                          if (students.some((s) => s.id === sibSt.id)) {
                            setSelectedStudentId(sibSt.id);
                          } else if (onOpenStudentGrid) {
                            onOpenStudentGrid(sibSt);
                          }
                        }}
                      />
                    </div>
                  )}

                  <div className="min-[400px]:col-span-2 bg-white p-2.5 rounded-xl shadow-[0_3px_10px_-5px_rgba(9,15,29,0.06)] min-w-0">
                    <span className="text-xs font-semibold text-slate-700 uppercase block">
                      Telefones &amp; Contato
                    </span>
                    <span className="font-semibold text-[#003440] break-words">
                      {selectedStudent.telefones || selectedStudent.guardianPhone || '(11) 98765-4321'}
                    </span>
                    {selectedStudent.emailMunicipal && (
                      <span className="block font-mono text-xs text-[#065f46] mt-0.5 break-all">
                        {selectedStudent.emailMunicipal}
                      </span>
                    )}
                  </div>

                  <div className="min-[400px]:col-span-2 bg-white p-2.5 rounded-xl shadow-[0_3px_10px_-5px_rgba(9,15,29,0.06)] min-w-0">
                    <span className="text-xs font-semibold text-slate-700 uppercase block">
                      Endereço Residencial
                    </span>
                    <span className="font-semibold text-slate-950 break-words">
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

        <div className="pt-3 mt-2 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-w-[160px] h-10 px-5 bg-slate-950 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center transition-all duration-200 active:scale-[0.97] cursor-pointer shadow-xs"
          >
            Fechar Relação
          </button>
        </div>
      </div>
    </div>
  );
};
