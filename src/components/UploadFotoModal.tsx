import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { uploadStudentPhotoViaApi } from '../services/db';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { isSupportedImageFile } from '../utils/photoCompressor';
import {
  compressPhotoLosslessWithCanvas,
  persistSingleStudentPhotoToIndexedDb,
} from '../services/photoIndexedDbCache';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  FileUp,
  Info,
  Trash2,
  X,
} from 'lucide-react';

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

  const processAndUploadFile = async (file: File) => {
    if (!file || !student) return;
    if (!isSupportedImageFile(file)) {
      setStatusMsg('Formato não suportado. Envie uma imagem válida (JPG, PNG, WebP, HEIC, AVIF, BMP, GIF, SVG, TIFF).');
      return;
    }

    setIsProcessing(true);
    setUploadSuccess(false);
    setStatusMsg('Decodificando e otimizando foto sem perdas visuais...');

    try {
      const optimized = await compressPhotoLosslessWithCanvas(file, {
        maxDimension: 520,
        initialQuality: 0.9,
        minQuality: 0.75,
        targetMaxBytes: 56 * 1024,
        includeDataUrl: true,
      });

      const dataUrl = optimized.dataUrl || '';
      if (!dataUrl) {
        setIsProcessing(false);
        setStatusMsg('Não foi possível ler a imagem selecionada.');
        return;
      }

      setPreviewUrl(dataUrl);

      if (student.photoSha256 && student.photoSha256 === optimized.sha256 && student.photo) {
        setStatusMsg('✓ Foto idêntica (SHA-256) já cadastrada — envio redundante evitado.');
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2500);
        return;
      }

      const apiRes = await uploadStudentPhotoViaApi(student.id, {
        bytes: optimized.bytes,
        sha256: optimized.sha256,
        mimeType: optimized.mimeType,
        fallbackDataUrl: dataUrl,
      });

      const savedPercent = optimized.reductionPercent;
      const finalUrl = apiRes.photoUrl || dataUrl;

      void persistSingleStudentPhotoToIndexedDb({
        studentId: student.id,
        ra: student.ra,
        name: student.estudante || student.name,
        photoUrl: finalUrl,
        isManualLink: true,
        sha256: optimized.sha256,
        blob: optimized.blob,
        updatedAtMs: Date.now(),
      });

      onSavePhoto(student.id, finalUrl, undefined, undefined, true);
      setStatusMsg(
        `✓ Foto otimizada (${optimized.extension.toUpperCase()}${
          savedPercent > 0 ? `, -${savedPercent}% de espaço` : ''
        }) e sincronizada!`
      );
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2500);
    } catch {
      setStatusMsg('Erro ao processar imagem. Verifique se o arquivo não está corrompido.');
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
    if (file && isSupportedImageFile(file)) {
      await processAndUploadFile(file);
    } else if (file) {
      setStatusMsg('Arquivo solto não é uma imagem suportada.');
    }
  };

  if (!isOpen || !student) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-shell w-full max-w-xl rounded-3xl overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh] animate-apple-pop"
      >
        {/* Header Modal com Título e Fechar */}
        <div className="modal-header-surface flex items-center justify-between p-4 sm:p-5 pb-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-950 flex items-center justify-center shrink-0">
              <Camera className="w-[22px] h-[22px]" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-950 break-words leading-snug">
                Foto do Estudante (PEB I)
              </h3>
              <p className="text-xs text-slate-700 break-words font-semibold">
                {className} · EMEB Prof. Joaquim Candelário de Freitas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* CARROSSEL DE ALUNOS DA TURMA */}
        {totalStudents > 1 && (
          <div className="bg-[#f4f7fb] px-4 py-2.5 shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handlePrevStudent}
                disabled={!canGoPrev}
                className="flex items-center gap-1 font-bold text-slate-800 hover:text-slate-950 disabled:opacity-30 disabled:hover:text-slate-800 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                <span>Anterior</span>
              </button>

              <div className="flex items-center gap-1.5 font-medium text-slate-700">
                <span className="font-bold text-slate-950 tabular-nums">
                  {currentIndex >= 0 ? currentIndex + 1 : 1}
                </span>
                <span>de</span>
                <span className="font-bold text-slate-950 tabular-nums">{totalStudents}</span>
                <span className="text-xs text-slate-700">alunos</span>
              </div>

              <button
                type="button"
                onClick={handleNextStudent}
                disabled={!canGoNext}
                className="flex items-center gap-1 font-bold text-slate-800 hover:text-slate-950 disabled:opacity-30 disabled:hover:text-slate-800 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <span>Próximo</span>
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
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
                    className={`shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-200 cursor-pointer active:scale-[0.97] ${
                      isCurrent
                        ? 'bg-slate-950 text-white shadow-sm'
                        : 'bg-white hover:bg-[#edf2f7] text-slate-900 shadow-xs'
                    }`}
                    title={`Nº ${st.number} - ${st.name} (${hasPhoto ? 'Com foto' : 'Sem foto'})`}
                  >
                    <div className="relative shrink-0">
                      <StudentAvatar
                        student={st}
                        size="sm"
                        expandableOnClick={false}
                        className="w-6 h-6 rounded-lg object-cover"
                      />
                      {hasPhoto && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-600 rounded-full shadow-xs" />
                      )}
                    </div>
                    <span className="text-xs font-bold tabular-nums">
                      Nº {st.number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs font-semibold whitespace-nowrap">
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
          <div className="flex items-center justify-between gap-3 p-3.5 bg-[#f4f7fb] rounded-2xl">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative shrink-0">
                <StudentAvatar
                  student={{ ...student, photo: previewUrl }}
                  size="lg"
                  className="w-16 h-16 rounded-2xl shadow-sm object-cover"
                />
                {previewUrl && (
                  <span className="absolute -bottom-1 -right-1 p-1 bg-emerald-600 text-white rounded-full shadow-xs">
                    <Check className="w-[13px] h-[13px] block" strokeWidth={2.5} />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white text-slate-950 tabular-nums shrink-0 shadow-xs">
                    Nº {student.number.toString().padStart(2, '0')}
                  </span>
                  <span className="text-sm font-bold text-slate-950 break-words leading-snug">
                    {student.name}
                  </span>
                </div>
                <span className="text-xs text-slate-700 font-medium block break-words mt-0.5">
                  RA: {student.ra || '—'}-{student.digRa || ''} ·{' '}
                  <strong className={previewUrl ? 'text-emerald-900' : 'text-amber-900'}>
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
                className="min-h-[38px] px-3 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-950 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                title="Remover foto deste estudante"
              >
                <Trash2 className="w-4 h-4" strokeWidth={2} />
                <span className="hidden sm:inline">Remover</span>
              </button>
            )}
          </div>

          {/* Upload Dropzone & Actions */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="p-6 bg-emerald-100/70 hover:bg-emerald-100 rounded-2xl transition-all duration-200 flex flex-col items-center justify-center text-center space-y-3 shadow-[0_6px_20px_-8px_rgba(4,120,87,0.16)]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif,.avif,.webp,.bmp,.svg,.tif,.tiff,.jfif"
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

            <div className="w-14 h-14 rounded-2xl bg-white text-emerald-800 flex items-center justify-center shadow-sm">
              <Camera className="w-8 h-8" strokeWidth={2} />
            </div>

            <div>
              <p className="text-sm font-bold text-slate-950">
                Arraste a foto do estudante aqui ou clique para escolher
              </p>
              <p className="text-xs text-slate-700 mt-0.5">
                Otimização automática. Visível em tempo real para toda a escola.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="h-10 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
              >
                <FileUp className="w-[18px] h-[18px]" strokeWidth={2} />
                <span>Escolher do Arquivo</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => cameraInputRef.current?.click()}
                className="h-10 px-4 bg-white hover:bg-[#edf2f7] text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
              >
                <Camera className="w-[18px] h-[18px] text-emerald-800" strokeWidth={2} />
                <span>Tirar com Câmera</span>
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-xl bg-[#f4f7fb] text-xs text-slate-900 font-medium flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-700 shrink-0" strokeWidth={2} />
              <span>{statusMsg}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 bg-emerald-100 text-emerald-950 rounded-xl font-bold text-xs flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-[18px] h-[18px] text-emerald-800 shrink-0" strokeWidth={2} />
              <span>Foto salva e sincronizada para todos os usuários!</span>
            </div>
          )}
        </div>

        {/* Modal Actions Sticky */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md shadow-[0_-6px_20px_-8px_rgba(9,15,29,0.08)] p-4 flex gap-2 shrink-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-950 font-bold text-xs sm:text-sm rounded-2xl transition-colors cursor-pointer"
          >
            Concluir
          </button>

          {canGoNext && (
            <button
              type="button"
              onClick={handleNextStudent}
              className="flex-1 h-11 bg-slate-950 hover:bg-black text-white font-bold text-xs sm:text-sm rounded-2xl transition-all duration-200 active:scale-[0.97] cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Próximo Aluno</span>
              <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
