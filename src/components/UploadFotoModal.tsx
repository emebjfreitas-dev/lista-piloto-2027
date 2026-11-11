import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  getAccessToken,
  uploadStudentPhotoToDrive,
  getStoredDiscoveredDrivePhotos,
  DiscoveredDrivePhotoFile,
} from '../services/googleSheetsApi';
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
  onSyncDrivePhotos,
}) => {
  const [activeTab, setActiveTab] = useState<'device_upload' | 'drive_catalog'>('device_upload');
  const [previewUrl, setPreviewUrl] = useState<string>(student?.photo || '');
  const [selectedDriveFile, setSelectedDriveFile] = useState<DiscoveredDrivePhotoFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [catalogTick, setCatalogTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);

  // Bloqueio de rolagem da página de fundo enquanto o modal estiver aberto
  useModalScrollLock(isOpen);

  // Sync state whenever active student changes (e.g. via carousel navigation)
  useEffect(() => {
    if (student) {
      setPreviewUrl(student.photo || '');
      setSelectedDriveFile(null);
      setStatusMsg(null);
      setUploadSuccess(false);
      setSearchQuery('');
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

  const discoveredPhotos = useMemo(() => {
    void catalogTick;
    return getStoredDiscoveredDrivePhotos();
  }, [catalogTick, isOpen]);

  const filteredDrivePhotos = useMemo(() => {
    const q = searchQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();

    if (!q) {
      // Prioritize files matching the student's first name
      const firstToken = (student?.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .split(' ')[0];
      return [...discoveredPhotos]
        .sort((a, b) => {
          const aMatch = firstToken && a.normName.includes(firstToken) ? 1 : 0;
          const bMatch = firstToken && b.normName.includes(firstToken) ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          return a.name.localeCompare(b.name, 'pt-BR');
        })
        .slice(0, 60);
    }

    return discoveredPhotos
      .filter((item) => {
        const cleanName = item.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        const cleanSub = (item.subfolderName || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        return (
          cleanName.includes(q) ||
          item.normName.includes(q) ||
          cleanSub.includes(q) ||
          item.id.toUpperCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [discoveredPhotos, searchQuery, student?.name]);

  const compressImageFileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const rawDataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 360;
            let width = img.width;
            let height = img.height;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height >= width && height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.82));
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !student) return;

    setIsProcessing(true);
    setStatusMsg('Carregando e otimizando foto do estudante...');

    const dataUrl = await compressImageFileToDataUrl(file);
    if (!dataUrl) {
      setIsProcessing(false);
      setStatusMsg('Não foi possível ler a imagem selecionada.');
      return;
    }

    setPreviewUrl(dataUrl);

    try {
      // 1. Salvar no servidor central para todos os usuários
      const apiRes = await uploadStudentPhotoViaApi(student.id, dataUrl);
      const finalUrl = apiRes.photoUrl || dataUrl;
      onSavePhoto(student.id, finalUrl, undefined, undefined, true);
      setStatusMsg('✓ Foto enviada e sincronizada para toda a escola!');
      setUploadSuccess(true);
    } catch {
      onSavePhoto(student.id, dataUrl, undefined, undefined, true);
      setStatusMsg('✓ Foto aplicada localmente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemovePhoto = () => {
    if (!student) return;
    setPreviewUrl('');
    onSavePhoto(student.id, '', '', '', false);
    setStatusMsg('Foto removida deste estudante.');
  };

  const handleSelectDrivePhoto = (item: DiscoveredDrivePhotoFile) => {
    setSelectedDriveFile(item);
    setPreviewUrl(item.photoUrl);
    setStatusMsg(`Foto selecionada: "${item.name}"`);
  };

  const handleRefreshCatalog = async () => {
    if (!onSyncDrivePhotos || isSyncingCatalog) return;
    setIsSyncingCatalog(true);
    setStatusMsg('Atualizando lista de fotos da pasta oficial do Drive...');
    try {
      await onSyncDrivePhotos();
      setCatalogTick((t) => t + 1);
      setStatusMsg('✓ Lista de fotos atualizada.');
    } catch {
      setStatusMsg('Não foi possível atualizar a pasta agora. Verifique a conexão Drive.');
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const handleSave = async () => {
    if (!student) return;
    setIsProcessing(true);
    let finalUrl = previewUrl;
    if (selectedDriveFile) {
      onSavePhoto(
        student.id,
        selectedDriveFile.photoUrl,
        selectedDriveFile.driveLink,
        selectedDriveFile.id,
        true
      );
    } else {
      if (previewUrl && previewUrl.startsWith('data:image')) {
        try {
          const apiRes = await uploadStudentPhotoViaApi(student.id, previewUrl);
          if (apiRes.photoUrl) finalUrl = apiRes.photoUrl;
        } catch {}
      }
      onSavePhoto(student.id, finalUrl, student.photoDriveUrl, student.photoDriveId, true);
    }
    setUploadSuccess(true);
    setIsProcessing(false);
    setTimeout(() => {
      setUploadSuccess(false);
      // Se houver próximo aluno na turma, avança direto para agilizar a conferência!
      if (canGoNext && onSelectStudent) {
        handleNextStudent();
      } else {
        onClose();
      }
    }, 450);
  };

  if (!isOpen || !student) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]"
      >
        {/* Header Modal com Título e Fechar */}
        <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">photo_camera</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-950 truncate">
                Foto do Estudante
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

        {/* CARROSSEL DE ALUNOS DA TURMA (Navegação Rápida sem fechar o Modal) */}
        {totalStudents > 1 && (
          <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-2.5 shrink-0 space-y-2">
            {/* Controles Anterior / Próximo e Contador */}
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handlePrevStudent}
                disabled={!canGoPrev}
                className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-900 font-bold flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                title="Aluno anterior (ou use a seta ← no teclado)"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Anterior</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">
                  Estudante {currentIndex + 1} de {totalStudents}
                </span>
                <span className="hidden sm:inline text-[11px] text-slate-500 font-mono">
                  (Dica: use setas ← e →)
                </span>
              </div>

              <button
                type="button"
                onClick={handleNextStudent}
                disabled={!canGoNext}
                className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-900 font-bold flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                title="Próximo aluno (ou use a seta → no teclado)"
              >
                <span>Próximo</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>

            {/* Fita Horizontal com Miniaturas de Todos os Alunos */}
            <div
              ref={carouselContainerRef}
              className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth touch-pan-x overscroll-x-contain"
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
                    className={`shrink-0 flex items-center gap-2 px-2 py-1.5 rounded-xl border transition-all cursor-pointer ${
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
                    <span className="text-[11px] font-semibold tabular-nums">
                      Nº {st.number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs font-semibold truncate max-w-[85px]">
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
          <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3 min-w-0">
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
                    {previewUrl ? 'Foto Vinculada' : 'Sem foto cadastrada'}
                  </strong>
                </span>
              </div>
            </div>

            {previewUrl && (
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl('');
                  setSelectedDriveFile(null);
                  setStatusMsg('Foto removida da visualização. Clique em Confirmar Foto para salvar.');
                }}
                className="h-8 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 border border-rose-200"
                title="Desvincular foto deste estudante"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span className="hidden sm:inline">Desvincular</span>
              </button>
            )}
          </div>

          {/* Mode Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('drive_catalog')}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeTab === 'drive_catalog'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <span className="material-symbols-outlined text-[17px] text-blue-600">cloud_search</span>
              <span>Pasta Google Drive ({discoveredPhotos.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('device_upload')}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeTab === 'device_upload'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <span className="material-symbols-outlined text-[17px] text-emerald-700">upload_file</span>
              <span>Enviar do Dispositivo</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="py-2 space-y-3 min-h-[220px]">
            {activeTab === 'drive_catalog' ? (
              <div className="space-y-3">
                {/* Search bar in Drive Catalog */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                      search
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar foto por nome, sobrenome ou turma..."
                      className="w-full h-10 pl-9 pr-8 bg-slate-100 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:border-slate-950 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">cancel</span>
                      </button>
                    )}
                  </div>

                  {onSyncDrivePhotos && (
                    <button
                      type="button"
                      onClick={handleRefreshCatalog}
                      disabled={isSyncingCatalog}
                      className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                      title="Recarregar fotos da pasta oficial do Google Drive"
                    >
                      <span
                        className={`material-symbols-outlined text-[16px] text-blue-600 ${
                          isSyncingCatalog ? 'animate-spin' : ''
                        }`}
                      >
                        sync
                      </span>
                      <span className="hidden sm:inline">Atualizar</span>
                    </button>
                  )}
                </div>

                {/* Results list */}
                {filteredDrivePhotos.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                    <p className="text-xs sm:text-sm font-bold text-slate-900">
                      Nenhuma foto localizada com esse nome.
                    </p>
                    <p className="text-xs text-slate-600 font-medium">
                      Você pode limpar a busca ou enviar a foto diretamente do computador/celular na aba ao lado.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-0.5">
                    {filteredDrivePhotos.map((item) => {
                      const isSelected =
                        selectedDriveFile?.id === item.id ||
                        student.photoDriveId === item.id ||
                        previewUrl === item.photoUrl;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectDrivePhoto(item)}
                          className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-600/20'
                              : 'bg-white hover:bg-slate-50 border-slate-200'
                          }`}
                        >
                          <img
                            src={item.photoUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-xl object-cover bg-slate-100 shrink-0 border border-slate-200"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-slate-600 font-mono tabular-nums truncate">
                              {item.subfolderName || 'Fotos Estudantes'}
                            </p>
                          </div>
                          {isSelected && (
                            <span className="material-symbols-outlined text-blue-600 text-[20px] shrink-0">
                              check_circle
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-14 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold text-sm rounded-2xl flex items-center justify-center gap-2.5 border-2 border-dashed border-emerald-300 cursor-pointer active:scale-98 transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[24px] text-emerald-700">
                    add_photo_alternate
                  </span>
                  <span>
                    {isProcessing
                      ? 'Otimizando e comprimindo foto...'
                      : 'Escolher Foto do Computador ou Celular'}
                  </span>
                </button>
                <p className="text-[11px] text-center text-slate-500">
                  Formatos aceitos: JPG, PNG, WEBP. A imagem é otimizada e salva automaticamente.
                </p>
              </div>
            )}

            {statusMsg && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-slate-600">info</span>
                <span>{statusMsg}</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl font-bold text-xs flex items-center gap-2 border border-emerald-200">
                <span className="material-symbols-outlined text-[18px] text-emerald-700">
                  check_circle
                </span>
                <span>Foto confirmada e associada com sucesso!</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions Sticky */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 p-4 flex gap-2 shrink-0 z-10">
          {previewUrl && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="h-11 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs rounded-2xl transition-colors cursor-pointer flex items-center gap-1 border border-rose-200"
              title="Remover foto deste aluno"
            >
              <span className="material-symbols-outlined text-[16px] text-rose-600">delete</span>
              <span className="hidden sm:inline">Remover</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-2xl transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !previewUrl}
            className="flex-1 h-11 bg-slate-950 hover:bg-black text-white font-bold text-xs sm:text-sm rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span>Confirmar Foto</span>
          </button>
        </div>
      </div>
    </div>
  );
};
