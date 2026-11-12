import React, { useState, useRef, useMemo } from 'react';
import { ClassGroup, Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  uploadBatchStudentPhotosViaApi,
  clearAllStudentPhotosViaApi,
} from '../services/db';

interface AdminArrasteFotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  onBatchPhotosSaved: (updatedClasses: ClassGroup[]) => void;
}

interface DroppedPhotoItem {
  id: string;
  file: File;
  filename: string;
  previewUrl: string;
  matchedStudent?: Student;
  matchedClass?: ClassGroup;
  matchReason?: string;
  manualStudentId?: string;
}

export const AdminArrasteFotosModal: React.FC<AdminArrasteFotosModalProps> = ({
  isOpen,
  onClose,
  classes,
  onBatchPhotosSaved,
}) => {
  const [items, setItems] = useState<DroppedPhotoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [isClearingAll, setIsClearingAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mapeamento de todos os estudantes da escola para busca ultrarrápida
  const allStudentsWithClass = useMemo(() => {
    const list: { student: Student; classGroup: ClassGroup }[] = [];
    classes.forEach((cls) => {
      cls.students.forEach((st) => {
        list.push({ student: st, classGroup: cls });
      });
    });
    return list;
  }, [classes]);

  // Função utilitária para normalizar strings (sem acentos, sem pontuação, caixa alta)
  const normalize = (str: string): string =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Partículas portuguesas comuns ignoradas na busca por tokens
  const CORE_STOP_WORDS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);

  // Identificador automático de estudante a partir do nome do arquivo
  const matchStudentFromFilename = (
    filename: string
  ): { student?: Student; classGroup?: ClassGroup; reason?: string } => {
    // 1. Remover extensão
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const cleanDigits = (baseName.match(/\d{5,12}/) || [])[0];

    // REGRA 1: Correspondência por RA oficial (se contiver número de 5 a 10 dígitos)
    if (cleanDigits) {
      for (const item of allStudentsWithClass) {
        const studentRaDigits = (item.student.ra || '').replace(/\D/g, '');
        if (studentRaDigits && studentRaDigits.includes(cleanDigits)) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: `RA Oficial (${cleanDigits})`,
          };
        }
      }
    }

    // REGRA 2: Correspondência por Turma + Número de Chamada (ex: "1F_01", "1F-02", "1º ANO F - 05")
    const numCallMatch = baseName.match(/(?:N[ºo]?\s*|chamada\s*|[-_\s])(\d{1,2})(?:[-_\s.]|$)/i);
    const classAbrevMatch = baseName.match(/([1-5][A-Z]|G[45][A-Z]|INF[A-Z])/i);

    if (numCallMatch && classAbrevMatch) {
      const callNum = parseInt(numCallMatch[1], 10);
      const abrev = classAbrevMatch[1].toUpperCase();
      for (const item of allStudentsWithClass) {
        const clsAbrev = (item.classGroup.turmaAbrev || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (clsAbrev.includes(abrev) && item.student.number === callNum) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: `Turma ${abrev} + Nº ${callNum}`,
          };
        }
      }
    }

    // REGRA 3: Correspondência por Nome Completo Normalizado
    const normFile = normalize(baseName)
      .replace(/^(IMG|FOTO|ALUNO|ESTUDANTE|DOC|DSC|DSCN|SCAN)\s*[-_]?\s*/i, '')
      .replace(/\s*\(\d+\)$/, '') // remove sufixos como (1)
      .replace(/^[0-9]{1,3}\s*[-_]\s*/, '') // remove número inicial como "01 - "
      .trim();

    if (normFile.length >= 4) {
      // 3.1. Match Exato
      for (const item of allStudentsWithClass) {
        const normStudentName = normalize(item.student.name);
        if (normStudentName === normFile) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: 'Nome Completo Exato',
          };
        }
      }

      // 3.2. Match por Tokens Core (ignorando preposições DE, DA, DO)
      const fileTokens = normFile.split(' ').filter((t) => !CORE_STOP_WORDS.has(t) && t.length > 1);
      if (fileTokens.length >= 2) {
        for (const item of allStudentsWithClass) {
          const studentTokens = normalize(item.student.name)
            .split(' ')
            .filter((t) => !CORE_STOP_WORDS.has(t) && t.length > 1);

          if (studentTokens.length >= 2) {
            // Primeiro e último nome devem ser idênticos
            const sameFirst = studentTokens[0] === fileTokens[0];
            const sameLast = studentTokens[studentTokens.length - 1] === fileTokens[fileTokens.length - 1];

            if (sameFirst && sameLast) {
              return {
                student: item.student,
                classGroup: item.classGroup,
                reason: 'Primeiro e Último Nome',
              };
            }

            // Se o arquivo contiver todos os tokens principais do estudante
            const allMatch = studentTokens.every((st) => fileTokens.includes(st));
            if (allMatch) {
              return {
                student: item.student,
                classGroup: item.classGroup,
                reason: 'Tokens Semânticos Coincidentes',
              };
            }
          }
        }
      }
    }

    return {};
  };

  // Comprime e gera Data URL otimizado
  const processImageFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = e.target?.result as string;
        if (!raw) return resolve('');

        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 400;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
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
          resolve(raw);
        };
        img.onerror = () => resolve(raw);
        img.src = raw;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Manipulador de novos arquivos adicionados (via drop ou file input)
  const handleAddFiles = async (files: FileList | File[]) => {
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|bmp)$/i.test(f.name)) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      setStatusMessage('Nenhuma imagem válida encontrada nos arquivos soltos.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(`Processando e identificando ${validFiles.length} foto(s)...`);

    const newItems: DroppedPhotoItem[] = [];

    for (const file of validFiles) {
      const previewUrl = await processImageFile(file);
      const match = matchStudentFromFilename(file.name);
      newItems.push({
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        filename: file.name,
        previewUrl,
        matchedStudent: match.student,
        matchedClass: match.classGroup,
        matchReason: match.reason,
      });
    }

    setItems((prev) => [...prev, ...newItems]);
    setIsProcessing(false);
    setStatusMessage(`✓ ${validFiles.length} arquivo(s) carregado(s). Verifique as associações.`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleAddFiles(e.target.files);
    }
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleManualStudentChange = (itemId: string, studentId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        if (!studentId) {
          return { ...it, matchedStudent: undefined, matchedClass: undefined, matchReason: undefined };
        }
        const found = allStudentsWithClass.find((x) => x.student.id === studentId);
        return {
          ...it,
          matchedStudent: found?.student,
          matchedClass: found?.classGroup,
          matchReason: 'Associação Manual pelo Admin',
        };
      })
    );
  };

  // Contadores
  const totalCount = items.length;
  const matchedCount = items.filter((it) => it.matchedStudent).length;
  const unmatchedCount = totalCount - matchedCount;

  const filteredItems = useMemo(() => {
    if (filterMode === 'matched') return items.filter((it) => it.matchedStudent);
    if (filterMode === 'unmatched') return items.filter((it) => !it.matchedStudent);
    return items;
  }, [items, filterMode]);

  // Salvar lote de fotos no servidor e sincronizar com todas as turmas
  const handleConfirmBatch = async () => {
    const validPairs = items
      .filter((it) => it.matchedStudent && it.previewUrl)
      .map((it) => ({
        studentId: it.matchedStudent!.id,
        photoDataUrl: it.previewUrl,
      }));

    if (validPairs.length === 0) {
      setStatusMessage('Nenhum estudante identificado para vincular as fotos.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(`Sincronizando ${validPairs.length} foto(s) com o servidor oficial...`);

    try {
      // 1. Enviar lote para o backend Express
      const res = await uploadBatchStudentPhotosViaApi(validPairs);

      // 2. Atualizar estado local das turmas
      const now = Date.now();
      const updatedClasses = classes.map((cls) => {
        const hasAny = cls.students.some((s) => validPairs.some((p) => p.studentId === s.id));
        if (!hasAny) return cls;

        return {
          ...cls,
          updatedAtMs: now,
          students: cls.students.map((s) => {
            const pair = validPairs.find((p) => p.studentId === s.id);
            if (!pair) return s;
            return {
              ...s,
              photo: `/api/photos/${s.id.replace(/[^a-zA-Z0-9-_]/g, '_')}.jpg?v=${now}`,
              photoManualLink: true,
              updatedAtMs: now,
            };
          }),
        };
      });

      onBatchPhotosSaved(updatedClasses);
      setStatusMessage(`✓ Sucesso! ${res.updatedCount || validPairs.length} fotos salvas e sincronizadas para todos os usuários.`);

      setTimeout(() => {
        setItems([]);
        setIsSaving(false);
        onClose();
      }, 1200);
    } catch {
      setIsSaving(false);
      setStatusMessage('Falha ao sincronizar fotos com o servidor. Tente novamente.');
    }
  };

  // Limpeza de todas as fotos atuais (Reset de fotos solicitado pelo usuário)
  const handleClearAllPhotos = async () => {
    const confirmed = window.confirm(
      'ATENÇÃO: Deseja realmente LIMPAR TODAS as fotos atuais dos alunos de todas as turmas da escola? Os alunos começarão do zero sem fotos.'
    );
    if (!confirmed) return;

    setIsClearingAll(true);
    setStatusMessage('Limpando todas as fotos atuais do sistema...');

    try {
      const res = await clearAllStudentPhotosViaApi();
      const now = Date.now();
      const resetClasses = classes.map((cls) => ({
        ...cls,
        updatedAtMs: now,
        students: cls.students.map((s) => ({
          ...s,
          photo: '',
          photoDriveId: '',
          photoDriveUrl: '',
          photoManualLink: false,
          updatedAtMs: now,
        })),
      }));

      onBatchPhotosSaved(resetClasses);
      setItems([]);
      setStatusMessage(`✓ Todas as fotos foram limpas (${res.clearedCount} fotos removidas). O sistema está limpo.`);
    } catch {
      setStatusMessage('Falha ao limpar fotos atuais.');
    } finally {
      setIsClearingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]"
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">drive_folder_upload</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-950 truncate">
                  Arraste &amp; Solte de Fotos Nomeadas
                </h3>
                <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-950 text-[10px] font-bold uppercase tracking-wider shrink-0">
                  Exclusivo Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate font-normal">
                Vincule fotos em massa por RA, Nome ou Turma e sincronize com todos os professores
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-black flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="modal-scroll-body flex-1 p-4 sm:p-6 space-y-4">
          {/* Status Message */}
          {statusMessage && (
            <div className="p-3.5 rounded-2xl bg-blue-50 text-xs font-semibold text-blue-950 flex items-center justify-between gap-2 shadow-2xs">
              <span>{statusMessage}</span>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-blue-600 hover:text-blue-900 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Área de Arraste e Solte (Dropzone - Zero Contorno) */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all shadow-2xs ${
              isDragging
                ? 'bg-blue-100/80 scale-[0.995]'
                : 'bg-slate-100/70 hover:bg-slate-100'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-blue-600">
                <span className="material-symbols-outlined text-[32px]">
                  {isDragging ? 'downloading' : 'add_photo_alternate'}
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                Arraste as fotos dos alunos nomeadas e solte aqui
              </h4>
              <p className="text-xs text-slate-500 max-w-md font-medium leading-relaxed">
                Você pode soltar dezenas ou centenas de fotos de uma só vez. O sistema identifica automaticamente pelo <strong>RA</strong>, pelo <strong>Nome</strong> ou pelo padrão <strong>Turma_Nº</strong> (ex: <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">12405139.jpg</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">ADRYAN GABRIEL.jpg</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">1F_01.jpg</code>).
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-2 h-9 px-4 rounded-xl bg-slate-950 hover:bg-black text-white text-xs font-bold cursor-pointer shadow-xs transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">folder_open</span>
                <span>Ou selecione fotos do computador</span>
              </button>
            </div>
          </div>

          {/* Painel de Itens e Conferência */}
          {items.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Barra de Filtros e Estatísticas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 text-xs">
                    <button
                      type="button"
                      onClick={() => setFilterMode('all')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        filterMode === 'all'
                          ? 'bg-white text-slate-950 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      Todas ({totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('matched')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        filterMode === 'matched'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-emerald-800 hover:text-emerald-950'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Identificados ({matchedCount})</span>
                    </button>
                    {unmatchedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterMode('unmatched')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          filterMode === 'unmatched'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'text-amber-800 hover:text-amber-950'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>Pendentes ({unmatchedCount})</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="h-8 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Limpar Lista
                  </button>
                </div>
              </div>

              {/* Lista dos Arquivos com Preview e Aluno Correspondente */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredItems.map((item) => {
                  const isMatched = Boolean(item.matchedStudent);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                        isMatched
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : 'bg-amber-50/60 border-amber-200'
                      }`}
                    >
                      {/* Miniatura da Foto + Nome do Arquivo */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={item.previewUrl}
                          alt={item.filename}
                          className="w-12 h-12 rounded-xl object-cover bg-slate-200 shrink-0 border border-black/10 shadow-2xs"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {item.filename}
                          </p>
                          {isMatched ? (
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px]">
                              <span className="font-bold text-emerald-950">
                                ✓ {item.matchedStudent?.name}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="text-emerald-800 font-semibold">
                                {item.matchedClass?.name} (Nº {item.matchedStudent?.number.toString().padStart(2, '0')})
                              </span>
                              {item.matchReason && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    via {item.matchReason}
                                  </span>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] font-bold text-amber-900">
                                ⚠️ Aluno não identificado. Selecione:
                              </span>
                              <select
                                value={item.matchedStudent?.id || ''}
                                onChange={(e) => handleManualStudentChange(item.id, e.target.value)}
                                className="h-7 text-xs bg-white border border-slate-300 rounded-lg px-2 text-slate-900 focus:outline-none focus:border-slate-950 max-w-[220px]"
                              >
                                <option value="">Escolher estudante...</option>
                                {allStudentsWithClass.map(({ student: s, classGroup: c }) => (
                                  <option key={s.id} value={s.id}>
                                    {c.name} - Nº {s.number} - {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botão Remover Arquivo */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                        title="Remover este arquivo da lista"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Opção de Reset Total das Fotos Atuais */}
          <div className="pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl">
            <div>
              <h5 className="text-xs font-bold text-slate-900">
                Limpeza Total de Fotos Atuais
              </h5>
              <p className="text-[11px] text-slate-500 font-medium">
                Remove todas as fotos de todos os alunos da escola para você testar ambos os métodos do zero.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearAllPhotos}
              disabled={isClearingAll}
              className="h-8 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-rose-700">cleaning_services</span>
              <span>{isClearingAll ? 'Limpando...' : 'Limpar Todas as Fotos Atuais'}</span>
            </button>
          </div>
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-medium">
            {matchedCount > 0 ? (
              <span>
                <strong>{matchedCount} foto(s)</strong> prontas para serem vinculadas e sincronizadas.
              </span>
            ) : (
              <span>Arraste os arquivos para começar.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-10 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmBatch}
              disabled={isSaving || isProcessing || matchedCount === 0}
              className={`h-10 px-5 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer ${
                matchedCount > 0 && !isSaving
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isSaving ? 'sync' : 'cloud_upload'}
              </span>
              <span>
                {isSaving
                  ? 'Sincronizando...'
                  : `Vincular e Sincronizar Fotos (${matchedCount})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
