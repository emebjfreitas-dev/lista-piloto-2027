import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { uploadStudentPhotoViaApi } from '../services/db';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface UploadFotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  classStudents?: Student[];
  onSelectStudent?: (student: Student) => void;
  onSavePhoto: (
    studentId: string,
    newPhotoUrl: string,
    driveLink?: string,
    driveFileId?: string,
    isManualLink?: boolean
  ) => void;
  onSyncDrivePhotos?: () => Promise<void>;
}

export const UploadFotoModal: React.FC<UploadFotoModalProps> = ({
  isOpen,
  onClose,
  student,
  className,
  classStudents = [],
  onSelectStudent,
  onSavePhoto,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>(student?.photo || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);

  // Bloqueio de rolagem da página de fundo enquanto o modal estiver aberto
  useModalScrollLock(isOpen);

  // Sync state whenever active student changes (e.g. via carousel navigation)
  useEffect(() => {
    if (student) {
      setPreviewUrl(student.photo || '');
      setStatusMsg(null);
      setUploadSuccess(false);
    }
  }, [student?.id, student?.photo]);

  // Order students in class numerically
  const sortedStudents = useMemo(() => {
    if (!classStudents || classStudents.length === 0) {
      return student ? [student] : [];
    }
    return [...classStudents].sort((a, b) => (a.number || 0) - (b.number || 0));
  }, [classStudents, student]);

  const currentIndex = useMemo(() => {
    if (!student) return -1;
    return sortedStudents.findIndex((s) => s.id === student.id);
  }, [sortedStudents, student?.id]);

  const totalStudents = sortedStudents.length;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < totalStudents - 1;

  const handlePrevStudent = () => {
    if (canGoPrev && onSelectStudent) {
      onSelectStudent(sortedStudents[currentIndex - 1]);
    }
  };

  const handleNextStudent = () => {
    if (canGoNext && onSelectStudent) {
      onSelectStudent(sortedStudents[currentIndex + 1]);
    }
  };

  // Auto-scroll active student in carousel strip into view
  useEffect(() => {
    if (!student || !carouselContainerRef.current) return;
    const activeBtn = carouselContainerRef.current.querySelector<HTMLButtonElement>(
      `[data-student-id="${student.id}"]`
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [student?.id]);

  // Keyboard navigation with Left and Right arrow keys when not typing
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevStudent();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextStudent();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canGoPrev, canGoNext, currentIndex, sortedStudents]);

  const compressImageFileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawDataUrl = (ev.target?.result as string) || '';
        if (!rawDataUrl) {
          resolve('');
          return;
        }
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 600;
            let width = img.width;
            let height = img.height;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.85));
              return;
            }
          } catch {
            // fallback
          }
          resolve(rawDataUrl);
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const processAndUploadFile = async (file: File) => {
    if (!file || !student) return;

    setIsProcessing(true);
    setStatusMsg('Carregando e otimizando foto...');

    const dataUrl = await compressImageFileToDataUrl(file);
    if (!dataUrl) {
      setIsProcessing(false);
      setStatusMsg('Não foi possível ler a imagem selecionada.');
      return;
    }

    setPreviewUrl(dataUrl);

    try {
      const apiRes = await uploadStudentPhotoViaApi(student.id, dataUrl);
      const finalUrl = apiRes.photoUrl || dataUrl;
      onSavePhoto(student.id, finalUrl, undefined, undefined, true);
      setStatusMsg('✓ Foto enviada e sincronizada para toda a escola!');
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2500);
    } catch {
      onSavePhoto(student.id, dataUrl, undefined, undefined, true);
      setStatusMsg('Foto salva localmente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processAndUploadFile(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleRemovePhoto = async () => {
    if (!student) return;
    setIsProcessing(true);
    try {
      // Remover salvando vazio
      setPreviewUrl('');
      onSavePhoto(student.id, '', '', '', false);
      setStatusMsg('Foto do estudante removida.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!student || isProcessing) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await processAndUploadFile(file);
    }
  };

  if (!isOpen || !student) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]"
      >
        {/* Header Modal com Título e Fechar */}
        <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">photo_camera</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-950 truncate">
                Foto do Estudante (PEB I)
              </h3>
              <p className="text-xs text-slate-700 truncate font-semibold">
                {className} · EMEB Prof. Joaquim Candelário de Freitas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-black flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Fechar"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* CARROSSEL DE ALUNOS DA TURMA (Navegação Rápida entre alunos sem fechar o modal) */}
        {totalStudents > 1 && (
          <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-2.5 shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handlePrevStudent}
                disabled={!canGoPrev}
                className="flex items-center gap-1 font-bold text-slate-700 hover:text-slate-950 disabled:opacity-30 disabled:hover:text-slate-700 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Anterior</span>
              </button>

              <div className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="font-bold text-slate-950 tabular-nums">
                  {currentIndex >= 0 ? currentIndex + 1 : 1}
                </span>
                <span>de</span>
                <span className="font-bold text-slate-950 tabular-nums">{totalStudents}</span>
                <span className="text-[11px] text-slate-400">alunos</span>
              </div>

              <button
                type="button"
                onClick={handleNextStudent}
                disabled={!canGoNext}
                className="flex items-center gap-1 font-bold text-slate-700 hover:text-slate-950 disabled:opacity-30 disabled:hover:text-slate-700 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <span>Próximo</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>

            {/* Strip horizontal rolável de alunos */}
            <div
              ref={carouselContainerRef}
              className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin scrollbar-thumb-slate-300"
            >
              {sortedStudents.map((st) => {
                const isCurrent = st.id === student.id;
                const hasPhoto = Boolean(st.photo);
                return (
                  <button
                    key={st.id}
                    type="button"
                    data-student-id={st.id}
                    onClick={() => onSelectStudent?.(st)}
                    className={`shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-slate-950 text-white border-slate-950 shadow-xs'
                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                    title={`Nº ${st.number} - ${st.name} (${hasPhoto ? 'Com foto' : 'Sem foto'})`}
                  >
                    <div className="relative shrink-0">
                      <StudentAvatar
                        student={st}
                        size="sm"
                        className="w-6 h-6 rounded-lg object-cover"
                      />
                      {hasPhoto && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-1 ring-white" />
                      )}
                    </div>
                    <span className="text-[11px] font-bold tabular-nums">
                      Nº {st.number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs font-semibold truncate max-w-[90px]">
                      {st.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="modal-scroll-body flex-1 p-4 sm:p-5 space-y-4">
          {/* Card do Estudante Atual */}
          <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative shrink-0">
                <StudentAvatar
                  student={{ ...student, photo: previewUrl }}
                  size="lg"
                  className="w-16 h-16 rounded-2xl border-2 border-white shadow-sm object-cover"
                />
                {previewUrl && (
                  <span className="absolute -bottom-1 -right-1 p-1 bg-emerald-600 text-white rounded-full shadow-xs">
                    <span className="material-symbols-outlined text-[13px] block">check</span>
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-900 tabular-nums">
                    Nº {student.number.toString().padStart(2, '0')}
                  </span>
                  <span className="text-sm font-bold text-slate-950 truncate">
                    {student.name}
                  </span>
                </div>
                <span className="text-xs text-slate-600 font-medium block truncate mt-0.5">
                  RA: {student.ra || '—'}-{student.digRa || ''} ·{' '}
                  <strong className={previewUrl ? 'text-emerald-700' : 'text-amber-700'}>
                    {previewUrl ? 'Foto Atualizada' : 'Sem foto cadastrada'}
                  </strong>
                </span>
              </div>
            </div>

            {previewUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={isProcessing}
                className="h-8 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 border border-rose-200 disabled:opacity-50"
                title="Remover foto deste estudante"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span className="hidden sm:inline">Remover</span>
              </button>
            )}
          </div>

          {/* Upload Dropzone & Actions */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="p-6 bg-emerald-50/50 hover:bg-emerald-50 rounded-2xl border-2 border-dashed border-emerald-300 transition-colors flex flex-col items-center justify-center text-center space-y-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[32px]">add_a_photo</span>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-950">
                Arraste a foto do estudante aqui ou clique para escolher
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Otimização automática. Visível em tempo real para toda a escola.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="h-10 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-98 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                <span>Escolher do Arquivo</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => cameraInputRef.current?.click()}
                className="h-10 px-4 bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-98 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px] text-emerald-700">photo_camera</span>
                <span>Tirar com Câmera</span>
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-slate-600">info</span>
              <span>{statusMsg}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl font-bold text-xs flex items-center gap-2 border border-emerald-200 animate-in fade-in">
              <span className="material-symbols-outlined text-[18px] text-emerald-700">
                check_circle
              </span>
              <span>Foto salva e sincronizada para todos os usuários!</span>
            </div>
          )}
        </div>

        {/* Modal Actions Sticky */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 p-4 flex gap-2 shrink-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-2xl transition-colors cursor-pointer"
          >
            Concluir
          </button>

          {canGoNext && (
            <button
              type="button"
              onClick={handleNextStudent}
              className="flex-1 h-11 bg-slate-950 hover:bg-black text-white font-bold text-xs sm:text-sm rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Próximo Aluno</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
