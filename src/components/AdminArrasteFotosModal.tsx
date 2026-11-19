import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ClassGroup, Student } from '../types';
import {
  uploadBatchStudentPhotosViaApi,
  clearAllStudentPhotosViaApi,
  BinaryPhotoUploadInput,
  BatchUploadProgress,
} from '../services/db';
import {
  isSupportedImageFile,
  collectFilesFromDataTransfer,
} from '../utils/photoCompressor';
import {
  compressAndCachePhotoBatch,
  cacheUploadedStudentPhotosBatchToIndexedDb,
  MAX_BATCH_PHOTO_FILES_LIMIT,
  UploadedPhotoCacheEntry,
} from '../services/photoIndexedDbCache';
import { IndexedDbPhotoStorageModal } from './IndexedDbPhotoStorageModal';

interface AdminArrasteFotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  onBatchPhotosSaved: (updatedClasses: ClassGroup[]) => void;
  onOpenStorageManager?: () => void;
  embedded?: boolean;
}

interface DroppedPhotoItem {
  id: string;
  file: File;
  filename: string;
  relativePath: string;
  fileSizeBytes: number;
  matchedStudent?: Student;
  matchedClass?: ClassGroup;
  matchReason?: string;
  status: 'ready' | 'skipped_identical' | 'error' | 'uploaded';
  errorMsg?: string;
  optimizedResult?: {
    blob: Blob;
    bytes: Uint8Array;
    sha256: string;
    mimeType: string;
    ext: string;
    originalBytes: number;
    compressedBytes: number;
  };
}

const PAGE_SIZE = 40;
const WORKER_CONCURRENCY = 4;
const HEIC_LIKE_REGEX = /\.(heic|heif|tiff?)$/i;

const formatBytesCompact = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const LazyPhotoThumbnail: React.FC<{ file: File; filename: string }> = ({ file, filename }) => {
  const [thumbUrl, setThumbUrl] = useState<string>('');
  const [imgError, setImgError] = useState(false);
  const isNativeBrowserUnrenderable = HEIC_LIKE_REGEX.test(filename || file.name);

  useEffect(() => {
    if (isNativeBrowserUnrenderable) {
      setThumbUrl('');
      return;
    }
    const objUrl = URL.createObjectURL(file);
    setThumbUrl(objUrl);
    setImgError(false);
    return () => {
      URL.revokeObjectURL(objUrl);
    };
  }, [file, isNativeBrowserUnrenderable]);

  if (!thumbUrl || imgError) {
    return (
      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex flex-col items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[18px]">image</span>
        <span className="text-[9px] font-bold uppercase tracking-tight">
          {(filename.split('.').pop() || 'IMG').slice(0, 4)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={thumbUrl}
      alt={filename}
      loading="lazy"
      onError={() => setImgError(true)}
      className="w-12 h-12 rounded-xl object-cover bg-slate-200 shrink-0 border border-black/10 shadow-2xs"
    />
  );
};

export const AdminArrasteFotosModal: React.FC<AdminArrasteFotosModalProps> = ({
  isOpen,
  onClose,
  classes,
  onBatchPhotosSaved,
  onOpenStorageManager,
  embedded = false,
}) => {
  const [internalStorageOpen, setInternalStorageOpen] = useState(false);
  const [items, setItems] = useState<DroppedPhotoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'matched' | 'unmatched' | 'errors'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const [pipelinePhase, setPipelinePhase] = useState<'idle' | 'optimizing' | 'uploading' | 'done'>('idle');
  const [optimizeProgress, setOptimizeProgress] = useState({ done: 0, total: 0, savedBytes: 0, skippedIdentical: 0, failed: 0 });
  const [uploadProgress, setUploadProgress] = useState<BatchUploadProgress | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, [isOpen, embedded]);

  const allStudentsWithClass = useMemo(() => {
    const list: { student: Student; classGroup: ClassGroup; normName: string; raDigits: string; clsAbrev: string }[] = [];
    classes.forEach((cls) => {
      const clsAbrev = (cls.turmaAbrev || cls.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      cls.students.forEach((st) => {
        const normName = (st.name || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .replace(/[^A-Z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        list.push({
          student: st,
          classGroup: cls,
          normName,
          raDigits: (st.ra || '').replace(/\D/g, ''),
          clsAbrev,
        });
      });
    });
    return list;
  }, [classes]);

  const normalize = (str: string): string =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const CORE_STOP_WORDS = useMemo(() => new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']), []);

  const matchStudentFromFilename = (
    filename: string,
    relativePath?: string
  ): { student?: Student; classGroup?: ClassGroup; reason?: string } => {
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const pathUpper = normalize(relativePath || '');
    const cleanDigits = (baseName.match(/\d{5,12}/) || [])[0];

    // Hint opcional de turma a partir da pasta/caminho relativo
    const pathClassMatch = (relativePath || '').match(/(?:^|[\\/_\s-])([1-5][A-Z]|G0?[45][A-Z]|INF[A-Z])(?:[\\/_\s-]|$)/i);
    const preferredClassAbrev = pathClassMatch
      ? pathClassMatch[1].toUpperCase().replace('G04', 'G4').replace('G05', 'G5')
      : '';

    const prioritizePool = preferredClassAbrev
      ? [
          ...allStudentsWithClass.filter((x) => x.clsAbrev.includes(preferredClassAbrev)),
          ...allStudentsWithClass.filter((x) => !x.clsAbrev.includes(preferredClassAbrev)),
        ]
      : allStudentsWithClass;

    // 1. RA Oficial
    if (cleanDigits) {
      for (const item of prioritizePool) {
        if (item.raDigits && item.raDigits.includes(cleanDigits)) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: `RA Oficial (${cleanDigits})`,
          };
        }
      }
    }

    // 2. Turma + Nº Chamada (no nome ou pasta)
    const numCallMatch = baseName.match(/(?:N[ºo]?\s*|chamada\s*|[-_\s]|^)(\d{1,2})(?:[-_\s.]|$)/i);
    const classAbrevMatch = baseName.match(/([1-5][A-Z]|G0?[45][A-Z]|INF[A-Z])/i);
    const resolvedAbrev = (classAbrevMatch?.[1] || preferredClassAbrev || '').toUpperCase().replace('G04', 'G4').replace('G05', 'G5');

    if (numCallMatch && resolvedAbrev) {
      const callNum = parseInt(numCallMatch[1], 10);
      for (const item of prioritizePool) {
        if (item.clsAbrev.includes(resolvedAbrev) && item.student.number === callNum) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: `Turma ${resolvedAbrev} + Nº ${callNum}`,
          };
        }
      }
    }

    // 3. Nome Completo Normalizado
    const normFile = normalize(baseName)
      .replace(/^(IMG|FOTO|ALUNO|ALUNA|ESTUDANTE|DOC|DSC|DSCN|SCAN|WHATSAPP IMAGE)\s*[-_]?\s*/i, '')
      .replace(/\s*\(\d+\)$/, '')
      .replace(/^[0-9]{1,3}\s*[-_]\s*/, '')
      .trim();

    if (normFile.length >= 4) {
      for (const item of prioritizePool) {
        if (item.normName === normFile) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: preferredClassAbrev && pathUpper.includes(preferredClassAbrev)
              ? `Nome Exato (${preferredClassAbrev})`
              : 'Nome Completo Exato',
          };
        }
      }

      const fileTokens = normFile.split(' ').filter((t) => !CORE_STOP_WORDS.has(t) && t.length > 1);
      if (fileTokens.length >= 2) {
        for (const item of prioritizePool) {
          const studentTokens = item.normName
            .split(' ')
            .filter((t) => !CORE_STOP_WORDS.has(t) && t.length > 1);

          if (studentTokens.length >= 2) {
            const sameFirst = studentTokens[0] === fileTokens[0];
            const sameLast = studentTokens[studentTokens.length - 1] === fileTokens[fileTokens.length - 1];
            if (sameFirst && sameLast) {
              return {
                student: item.student,
                classGroup: item.classGroup,
                reason: 'Primeiro e Último Nome',
              };
            }
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

  // Adição imediata de 2.000+ arquivos sem travar o navegador (sem FileReader/canvas no drop)
  const addCollectedFiles = (collected: Array<{ file: File; relativePath: string }>) => {
    const valid = collected.filter((c) => isSupportedImageFile(c.file));
    if (valid.length === 0) {
      setStatusMessage('Nenhuma imagem válida encontrada (aceita JPG, PNG, WebP, HEIC/HEIF, AVIF, BMP, GIF, SVG, TIFF).');
      return;
    }

    setIsProcessing(true);
    setItems((prev) => {
      const existingSignatures = new Set(
        prev.map((p) => `${p.filename.toLowerCase()}::${p.fileSizeBytes}::${p.relativePath}`)
      );

      let skippedDuplicates = 0;
      const added: DroppedPhotoItem[] = [];

      for (let i = 0; i < valid.length; i++) {
        const { file, relativePath } = valid[i];
        const sig = `${file.name.toLowerCase()}::${file.size}::${relativePath}`;
        if (existingSignatures.has(sig)) {
          skippedDuplicates++;
          continue;
        }
        existingSignatures.add(sig);

        const match = matchStudentFromFilename(file.name, relativePath);
        added.push({
          id: `photo-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          filename: file.name,
          relativePath,
          fileSizeBytes: file.size,
          matchedStudent: match.student,
          matchedClass: match.classGroup,
          matchReason: match.reason,
          status: 'ready',
        });
      }

      setStatusMessage(
        `✓ ${added.length} foto(s) enfileirada(s) em modo leve${
          skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicado(s) ignorado(s))` : ''
        }. Otimização lossless WebP + deduplicação SHA-256 ocorre automaticamente ao sincronizar.`
      );
      return [...prev, ...added];
    });
    setCurrentPage(1);
    setPipelinePhase('idle');
    setIsProcessing(false);
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
    setIsProcessing(true);
    setStatusMessage('Lendo estrutura de arquivos e pastas...');
    try {
      const collected = await collectFilesFromDataTransfer(e.dataTransfer, isSupportedImageFile);
      addCollectedFiles(collected);
    } catch {
      setIsProcessing(false);
      setStatusMessage('Erro ao ler os arquivos soltos.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const list = Array.from(e.target.files).map((file) => ({
        file,
        relativePath: (file as any).webkitRelativePath || file.name,
      }));
      addCollectedFiles(list);
    }
    if (e.target) e.target.value = '';
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleManualStudentChange = (itemId: string, studentId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        if (!studentId) {
          return {
            ...it,
            matchedStudent: undefined,
            matchedClass: undefined,
            matchReason: undefined,
            status: 'ready',
            errorMsg: undefined,
          };
        }
        const found = allStudentsWithClass.find((x) => x.student.id === studentId);
        return {
          ...it,
          matchedStudent: found?.student,
          matchedClass: found?.classGroup,
          matchReason: 'Associação Manual pelo Admin',
          status: 'ready',
          errorMsg: undefined,
        };
      })
    );
    setPickerItemId(null);
    setPickerSearch('');
  };

  const totalCount = items.length;
  const matchedCount = useMemo(() => items.filter((it) => it.matchedStudent).length, [items]);
  const unmatchedCount = totalCount - matchedCount;
  const errorCount = useMemo(() => items.filter((it) => it.status === 'error').length, [items]);

  const filteredItems = useMemo(() => {
    const q = normalize(searchQuery);
    return items.filter((it) => {
      if (filterMode === 'matched' && !it.matchedStudent) return false;
      if (filterMode === 'unmatched' && it.matchedStudent) return false;
      if (filterMode === 'errors' && it.status !== 'error') return false;
      if (q) {
        const matchesFile = normalize(it.filename).includes(q) || normalize(it.relativePath).includes(q);
        const matchesStudent = it.matchedStudent && normalize(it.matchedStudent.name).includes(q);
        const matchesRa = it.matchedStudent?.ra && it.matchedStudent.ra.includes(searchQuery.trim());
        return Boolean(matchesFile || matchesStudent || matchesRa);
      }
      return true;
    });
  }, [items, filterMode, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const pickerResults = useMemo(() => {
    if (!pickerItemId) return [];
    const q = normalize(pickerSearch);
    const qDigits = pickerSearch.replace(/\D/g, '');
    const results = q || qDigits
      ? allStudentsWithClass.filter(
          (x) =>
            (q && (x.normName.includes(q) || x.clsAbrev.includes(q) || normalize(x.classGroup.name).includes(q))) ||
            (qDigits && x.raDigits.includes(qDigits))
        )
      : allStudentsWithClass;
    return results.slice(0, 60);
  }, [pickerItemId, pickerSearch, allStudentsWithClass]);

  const handleConfirmBatch = async (onlyFailed = false) => {
    const targetItems = items.filter(
      (it) => it.matchedStudent && (!onlyFailed || it.status === 'error')
    );

    if (targetItems.length === 0) {
      setStatusMessage('Nenhum estudante identificado para vincular fotos.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSaving(true);
    setPipelinePhase('optimizing');
    setUploadProgress(null);
    setOptimizeProgress({
      done: 0,
      total: targetItems.length,
      savedBytes: 0,
      skippedIdentical: 0,
      failed: 0,
    });
    setStatusMessage(
      `Otimizando ${targetItems.length} foto(s) em WebP visualmente lossless + verificando duplicidades SHA-256...`
    );

    try {
      // Último arquivo vence caso haja múltiplas fotos para o mesmo estudante
      const dedupByStudent = new Map<string, DroppedPhotoItem>();
      for (const it of targetItems) {
        dedupByStudent.set(it.matchedStudent!.id, it);
      }
      const uniqueTargets = Array.from(dedupByStudent.values());

      if (uniqueTargets.length > MAX_BATCH_PHOTO_FILES_LIMIT) {
        setStatusMessage(
          `Quantidade (${uniqueTargets.length}) excede o limite de segurança de ${MAX_BATCH_PHOTO_FILES_LIMIT} arquivos por lote.`
        );
        setIsSaving(false);
        setPipelinePhase('idle');
        return;
      }

      const targetById = new Map(uniqueTargets.map((t) => [t.id, t]));
      const preOptimizedMap = new Map<string, NonNullable<DroppedPhotoItem['optimizedResult']>>();
      const toCompressInputs = [];

      for (const it of uniqueTargets) {
        if (it.optimizedResult) {
          preOptimizedMap.set(it.id, it.optimizedResult);
        } else {
          toCompressInputs.push({
            id: it.id,
            file: it.file,
            studentId: it.matchedStudent!.id,
            ra: it.matchedStudent!.ra,
            studentName: it.matchedStudent!.estudante || it.matchedStudent!.name,
            existingSha256: it.matchedStudent!.photoSha256,
            existingPhotoUrl: it.matchedStudent!.photo,
          });
        }
      }

      const batchSummary = await compressAndCachePhotoBatch(toCompressInputs, {
        maxDimension: 440,
        initialQuality: 0.9,
        minQuality: 0.72,
        targetMaxBytes: 48 * 1024,
        concurrency: WORKER_CONCURRENCY,
        persistToIndexedDb: false,
        signal: controller.signal,
        onProgress: (p) => {
          setOptimizeProgress({
            done: p.processed + preOptimizedMap.size,
            total: uniqueTargets.length,
            savedBytes: p.savedBytes,
            skippedIdentical: p.skippedIdentical,
            failed: p.failed,
          });
        },
      });

      const readyPayloads: BinaryPhotoUploadInput[] = [];
      const itemUpdates = new Map<string, Partial<DroppedPhotoItem>>();
      const blobByStudentId = new Map<string, Blob>();

      let savedBytes = batchSummary.savedBytes;
      let skippedIdentical = batchSummary.skippedIdentical;
      let failedOptimize = batchSummary.failed;

      // Incluir itens que já tinham sido pré-otimizados anteriormente
      for (const [id, preOpt] of preOptimizedMap.entries()) {
        const it = targetById.get(id);
        if (!it || !it.matchedStudent) continue;
        const student = it.matchedStudent;
        savedBytes += Math.max(0, preOpt.originalBytes - preOpt.compressedBytes);
        if (student.photoSha256 && student.photoSha256 === preOpt.sha256 && student.photo) {
          skippedIdentical++;
          itemUpdates.set(id, { status: 'skipped_identical', errorMsg: undefined, optimizedResult: preOpt });
        } else {
          blobByStudentId.set(student.id, preOpt.blob);
          readyPayloads.push({
            studentId: student.id,
            bytes: preOpt.bytes,
            sha256: preOpt.sha256,
            mimeType: preOpt.mimeType,
            ext: preOpt.ext,
          });
          itemUpdates.set(id, { status: 'ready', errorMsg: undefined, optimizedResult: preOpt });
        }
      }

      for (const resItem of batchSummary.results) {
        const it = targetById.get(resItem.id);
        if (!it || !it.matchedStudent) continue;
        const student = it.matchedStudent;

        if (resItem.status === 'error' || !resItem.result) {
          itemUpdates.set(it.id, {
            status: 'error',
            errorMsg: resItem.errorMsg || 'Imagem corrompida ou formato não decodificável.',
          });
          continue;
        }

        const opt: NonNullable<DroppedPhotoItem['optimizedResult']> = {
          blob: resItem.result.blob,
          bytes: resItem.result.bytes,
          sha256: resItem.result.sha256,
          mimeType: resItem.result.mimeType,
          ext: resItem.result.extension,
          originalBytes: resItem.result.originalBytes,
          compressedBytes: resItem.result.compressedBytes,
        };

        if (resItem.status === 'skipped_identical') {
          itemUpdates.set(it.id, {
            status: 'skipped_identical',
            errorMsg: undefined,
            optimizedResult: opt,
          });
        } else {
          blobByStudentId.set(student.id, opt.blob);
          readyPayloads.push({
            studentId: student.id,
            bytes: opt.bytes,
            sha256: opt.sha256,
            mimeType: opt.mimeType,
            ext: opt.ext,
          });
          itemUpdates.set(it.id, {
            status: 'ready',
            errorMsg: undefined,
            optimizedResult: opt,
          });
        }
      }

      if (controller.signal.aborted) {
        setStatusMessage('Envio cancelado pelo usuário.');
        setIsSaving(false);
        setPipelinePhase('idle');
        return;
      }

      if (readyPayloads.length === 0) {
        setItems((prev) =>
          prev.map((p) => (itemUpdates.has(p.id) ? { ...p, ...itemUpdates.get(p.id)! } : p))
        );
        setIsSaving(false);
        setPipelinePhase('done');
        setStatusMessage(
          skippedIdentical > 0
            ? `✓ Nenhuma alteração necessária: ${skippedIdentical} foto(s) já estavam atualizadas com o mesmo SHA-256.`
            : 'Nenhuma foto válida pronta para envio. Verifique os arquivos marcados com erro.'
        );
        return;
      }

      // Fase 2: Upload binário em chunks
      setPipelinePhase('uploading');
      setStatusMessage(
        `Enviando ${readyPayloads.length} foto(s) otimizada(s) em pacotes binários... (Economia local: ${formatBytesCompact(savedBytes)})`
      );

      const res = await uploadBatchStudentPhotosViaApi(readyPayloads, {
        signal: controller.signal,
        onProgress: (p) => setUploadProgress(p),
      });

      const now = Date.now();
      const resultMap = new Map(res.results.map((r) => [r.studentId, r]));
      const failedSet = new Set(res.failedStudentIds);

      // Atualizar status dos itens na lista
      setItems((prev) =>
        prev.map((p) => {
          const patch = itemUpdates.get(p.id) || {};
          const stId = p.matchedStudent?.id;
          if (!stId) return { ...p, ...patch };
          if (failedSet.has(stId)) {
            return { ...p, ...patch, status: 'error', errorMsg: 'Falha de envio ao servidor neste pacote.' };
          }
          if (resultMap.has(stId) || patch.status === 'ready') {
            return { ...p, ...patch, status: 'uploaded', errorMsg: undefined };
          }
          return { ...p, ...patch };
        })
      );

      const cacheEntriesToPersist: UploadedPhotoCacheEntry[] = [];

      // Atualizar estado das turmas somente para fotos que obtiveram sucesso
      const updatedClasses = classes.map((cls) => {
        const hasAny = cls.students.some(
          (s) => resultMap.has(s.id) || (readyPayloads.some((rp) => rp.studentId === s.id) && !failedSet.has(s.id))
        );
        if (!hasAny) return cls;

        return {
          ...cls,
          updatedAtMs: now,
          students: cls.students.map((s) => {
            if (failedSet.has(s.id)) return s;
            const r = resultMap.get(s.id);
            const payload = readyPayloads.find((rp) => rp.studentId === s.id);
            if (!r && !payload) return s;
            const cleanId = s.id.replace(/[^a-zA-Z0-9-_]/g, '_');
            const ext = payload?.ext || 'webp';
            const finalPhotoUrl = r?.photoUrl || `/api/photos/${cleanId}.${ext}?v=${now}`;
            const finalSha = r?.sha256 || payload?.sha256 || s.photoSha256;
            const compressedBlob = blobByStudentId.get(s.id);

            if (compressedBlob) {
              cacheEntriesToPersist.push({
                studentId: s.id,
                ra: s.ra,
                name: s.estudante || s.name,
                photoUrl: finalPhotoUrl,
                isManualLink: true,
                sha256: finalSha,
                blob: compressedBlob,
                updatedAtMs: now,
              });
            }

            return {
              ...s,
              photo: finalPhotoUrl,
              photoSha256: finalSha,
              photoManualLink: true,
              updatedAtMs: now,
            };
          }),
        };
      });

      // Grava Blobs + URLs compactadas no IndexedDB em transações batched para carregamento instantâneo
      if (cacheEntriesToPersist.length > 0) {
        void cacheUploadedStudentPhotosBatchToIndexedDb(cacheEntriesToPersist);
      }

      onBatchPhotosSaved(updatedClasses);
      setPipelinePhase('done');

      const totalSkippedAll = skippedIdentical + (res.skippedCount || 0);
      const totalFailedAll = failedOptimize + res.failedStudentIds.length;

      setStatusMessage(
        `✓ Concluído: ${res.updatedCount} foto(s) salva(s) · ${totalSkippedAll} idêntica(s) economizada(s) · ${formatBytesCompact(
          savedBytes
        )} economizados${totalFailedAll > 0 ? ` · ${totalFailedAll} com falha (clique em Reenviar Falhas)` : '.'}`
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setStatusMessage('Sincronização interrompida pelo usuário.');
      } else {
        setStatusMessage('Falha ao sincronizar lote de fotos. Você pode clicar em Reenviar.');
      }
      setPipelinePhase('idle');
    } finally {
      abortControllerRef.current = null;
      setIsSaving(false);
    }
  };

  const handleCancelSync = () => {
    abortControllerRef.current?.abort();
  };

  const handleClearAllPhotos = async () => {
    setIsClearingAll(true);
    setConfirmClearAll(false);
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
          photoSha256: '',
          photoManualLink: false,
          updatedAtMs: now,
        })),
      }));
      onBatchPhotosSaved(resetClasses);
      setItems([]);
      setStatusMessage(`✓ Todas as fotos foram limpas (${res.clearedCount} fotos removidas).`);
    } catch {
      setStatusMessage('Falha ao limpar fotos atuais.');
    } finally {
      setIsClearingAll(false);
    }
  };

  if (!isOpen && !embedded) return null;

  const pctOptimize =
    optimizeProgress.total > 0 ? Math.round((optimizeProgress.done / optimizeProgress.total) * 100) : 0;
  const pctUpload =
    uploadProgress && uploadProgress.totalItems > 0
      ? Math.round((uploadProgress.processedItems / uploadProgress.totalItems) * 100)
      : 0;

  const contentNode = (
    <div
      onClick={embedded ? undefined : (e) => e.stopPropagation()}
      className={
        embedded
          ? 'bg-white w-full rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col min-w-0'
          : 'bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]'
      }
    >
      {/* Cabeçalho */}
      <div
        className={`flex items-start sm:items-center justify-between gap-3 p-4 sm:p-5 shrink-0 ${
          embedded ? 'border-b border-slate-100' : 'bg-slate-50/50 border-b border-slate-200'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-2xl bg-[#e8f0fe] text-[#1a4fa3] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px] shrink-0">drive_folder_upload</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-semibold text-[#1d1d1f] break-words leading-snug">
              Importar Fotos dos Estudantes em Lote (2.000+)
            </h3>
            <p className="text-xs text-[#6e6e73] break-words leading-relaxed font-normal mt-0.5">
              Aceita pastas e todos os formatos (JPG, PNG, WebP, HEIC/iPhone, AVIF, BMP, GIF, SVG, TIFF) com WebP lossless e deduplicação SHA-256
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (onOpenStorageManager) {
                onOpenStorageManager();
              } else {
                setInternalStorageOpen(true);
              }
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0b3b8c] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">hard_drive</span>
            <span>Cache IndexedDB</span>
          </button>

          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-black flex items-center justify-center cursor-pointer transition-colors duration-100 shrink-0"
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">close</span>
            </button>
          )}
        </div>
      </div>

      {!onOpenStorageManager && (
        <IndexedDbPhotoStorageModal
          isOpen={internalStorageOpen}
          onClose={() => setInternalStorageOpen(false)}
          classes={classes}
          onCacheUpdated={(msg) => setStatusMessage(msg)}
        />
      )}

      {/* Corpo */}
      <div className={embedded ? 'p-4 sm:p-6 space-y-4' : 'modal-scroll-body flex-1 p-4 sm:p-6 space-y-4'}>
        {statusMessage && (
          <div className="p-3.5 rounded-2xl bg-blue-50 text-xs font-semibold text-blue-950 flex items-center justify-between gap-2 shadow-2xs">
            <span className="break-words">{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-blue-600 hover:text-blue-900 text-xs font-bold shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Progresso em tempo real (Otimização + Envio Binário) */}
        {(isSaving || pipelinePhase === 'done') && optimizeProgress.total > 0 && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-900">
              <span>
                {pipelinePhase === 'optimizing'
                  ? `Fase 1/2 · Otimizando Lossless (${optimizeProgress.done}/${optimizeProgress.total})`
                  : pipelinePhase === 'uploading'
                  ? `Fase 2/2 · Enviando Pacotes Binários (${uploadProgress?.completedChunks || 0}/${uploadProgress?.totalChunks || 1})`
                  : 'Processamento Concluído'}
              </span>
              <span className="tabular-nums text-emerald-700">
                Economia: {formatBytesCompact(optimizeProgress.savedBytes)}
              </span>
            </div>

            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0b3b8c] transition-all duration-200 rounded-full"
                style={{
                  width: `${pipelinePhase === 'optimizing' ? pctOptimize : pipelinePhase === 'uploading' ? pctUpload : 100}%`,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
              <span>Idênticas ignoradas: {optimizeProgress.skippedIdentical + (uploadProgress?.skippedCount || 0)}</span>
              {uploadProgress && <span>Gravadas no servidor: {uploadProgress.updatedCount}</span>}
              {(optimizeProgress.failed > 0 || (uploadProgress?.failedCount || 0) > 0) && (
                <span className="text-rose-700 font-bold">
                  Erros: {optimizeProgress.failed + (uploadProgress?.failedCount || 0)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all shadow-2xs ${
            isDragging ? 'bg-blue-100/80 scale-[0.995]' : 'bg-slate-100/70 hover:bg-slate-100'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif,.avif,.webp,.bmp,.svg,.tif,.tiff,.jfif,.ico"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
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
              Arraste arquivos ou pastas inteiras com fotos dos alunos e solte aqui
            </h4>
            <p className="text-xs text-slate-500 max-w-lg font-medium leading-relaxed break-words">
              Suporta lotes de <strong>2.000+ fotos</strong> sem travar o navegador. Identifica automaticamente pelo{' '}
              <strong>RA</strong>, <strong>Nome</strong>, <strong>Turma_Nº</strong> ou nome da subpasta (ex:{' '}
              <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs">1F/01.heic</code>).
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-950 hover:bg-black text-white text-xs font-bold cursor-pointer shadow-xs transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px] shrink-0">photo_library</span>
                <span>Selecionar Fotos</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  folderInputRef.current?.click();
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold cursor-pointer shadow-xs transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px] shrink-0">drive_folder_upload</span>
                <span>Selecionar Pasta Completa</span>
              </button>
            </div>
          </div>
        </div>

        {/* Lista Paginada + Pesquisa */}
        {items.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-1">
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('all');
                    setCurrentPage(1);
                  }}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                    filterMode === 'all' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Todas ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('matched');
                    setCurrentPage(1);
                  }}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                    filterMode === 'matched' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-emerald-800'
                  }`}
                >
                  Identificados ({matchedCount})
                </button>
                {unmatchedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('unmatched');
                      setCurrentPage(1);
                    }}
                    className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      filterMode === 'unmatched' ? 'bg-amber-600 text-white shadow-2xs' : 'text-amber-800'
                    }`}
                  >
                    Pendentes ({unmatchedCount})
                  </button>
                )}
                {errorCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('errors');
                      setCurrentPage(1);
                    }}
                    className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      filterMode === 'errors' ? 'bg-rose-600 text-white shadow-2xs' : 'text-rose-800'
                    }`}
                  >
                    Erros ({errorCount})
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Filtrar por nome, arquivo ou RA..."
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 w-full sm:w-56 focus:outline-none focus:border-slate-950"
                />
                <button
                  type="button"
                  onClick={() => {
                    setItems([]);
                    setPipelinePhase('idle');
                  }}
                  disabled={isSaving}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer disabled:opacity-40"
                >
                  Limpar Lista
                </button>
              </div>
            </div>

            {/* Itens da página atual */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {pagedItems.map((item) => {
                const isMatched = Boolean(item.matchedStudent);
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border flex items-start sm:items-center justify-between gap-3 ${
                      item.status === 'error'
                        ? 'bg-rose-50/70 border-rose-200'
                        : item.status === 'uploaded' || item.status === 'skipped_identical'
                        ? 'bg-emerald-50/80 border-emerald-300'
                        : isMatched
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-amber-50/60 border-amber-200'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <LazyPhotoThumbnail file={item.file} filename={item.filename} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold text-slate-900 break-all leading-snug">
                            {item.relativePath !== item.filename ? item.relativePath : item.filename}
                          </p>
                          <span className="text-[11px] font-mono text-slate-500">
                            {formatBytesCompact(item.fileSizeBytes)}
                          </span>
                        </div>

                        {item.status === 'error' && item.errorMsg && (
                          <p className="text-xs font-semibold text-rose-700 mt-1">{item.errorMsg}</p>
                        )}

                        {item.status === 'skipped_identical' && (
                          <p className="text-[11px] font-semibold text-emerald-800 mt-0.5">
                            ✓ Foto idêntica (SHA-256) já armazenada — economizada sem reenvio
                          </p>
                        )}

                        {isMatched ? (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs leading-snug">
                            <span className="font-bold text-emerald-950 break-words">
                              ✓ {item.matchedStudent?.name}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-emerald-800 font-semibold">
                              {item.matchedClass?.turmaAbrev || item.matchedClass?.name} (Nº{' '}
                              {item.matchedStudent?.number.toString().padStart(2, '0')})
                            </span>
                            {item.matchReason && (
                              <span className="text-xs text-slate-500 font-medium">· {item.matchReason}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setPickerItemId(item.id);
                                setPickerSearch('');
                              }}
                              className="ml-1 text-[11px] font-bold text-[#0b3b8c] hover:underline cursor-pointer"
                            >
                              Alterar
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-xs font-bold text-amber-900">
                              Aluno não identificado automaticamente
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPickerItemId(item.id);
                                setPickerSearch('');
                              }}
                              className="min-h-[32px] px-3 py-1 rounded-lg bg-white border border-slate-300 hover:border-slate-950 text-xs font-bold text-slate-900 cursor-pointer"
                            >
                              Escolher estudante...
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={isSaving}
                      className="w-9 h-9 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40"
                      title="Remover da lista"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-slate-600 font-semibold">
                <span>
                  Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredItems.length)} de {filteredItems.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="px-2 tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reset Total das Fotos Atuais */}
        <div className="pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl">
          <div className="min-w-0 flex-1">
            <h5 className="text-xs font-bold text-slate-900">Limpeza Total de Fotos Atuais</h5>
            <p className="text-xs text-slate-500 font-medium break-words leading-relaxed mt-0.5">
              Remove todas as fotos armazenadas de todas as turmas da escola para recomeçar do zero.
            </p>
          </div>
          {confirmClearAll ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleClearAllPhotos}
                disabled={isClearingAll}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer"
              >
                {isClearingAll ? 'Limpando...' : 'Confirmar Limpeza'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[38px] px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              disabled={isClearingAll || isSaving}
              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-rose-700 shrink-0">cleaning_services</span>
              <span>Limpar Todas as Fotos Atuais</span>
            </button>
          )}
        </div>
      </div>

      {/* Rodapé */}
      <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-slate-600 font-medium">
          {matchedCount > 0 ? (
            <span>
              <strong>{matchedCount} foto(s)</strong> identificadas para otimização e envio econômico.
            </span>
          ) : (
            <span>Solte pastas ou arquivos de foto para iniciar.</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-10 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs cursor-pointer"
            >
              Fechar
            </button>
          )}

          {isSaving && (
            <button
              type="button"
              onClick={handleCancelSync}
              className="h-10 px-4 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs cursor-pointer"
            >
              Cancelar Envio
            </button>
          )}

          {errorCount > 0 && !isSaving && (
            <button
              type="button"
              onClick={() => void handleConfirmBatch(true)}
              className="h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[17px]">refresh</span>
              <span>Reenviar Falhas ({errorCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleConfirmBatch(false)}
            disabled={isSaving || isProcessing || matchedCount === 0}
            className={`h-10 px-5 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer ${
              matchedCount > 0 && !isSaving ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-400 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{isSaving ? 'sync' : 'cloud_upload'}</span>
            <span>{isSaving ? 'Sincronizando...' : `Otimizar e Sincronizar Fotos (${matchedCount})`}</span>
          </button>
        </div>
      </div>

      {/* Modal leve sob demanda para seleção manual de estudante (evita 2.4M nós DOM) */}
      {pickerItemId && (
        <div
          onClick={() => setPickerItemId(null)}
          className="fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-950">Vincular Estudante Manualmente</h4>
              <button
                type="button"
                onClick={() => setPickerItemId(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-3 border-b border-slate-100">
              <input
                type="search"
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Buscar por nome, turma ou RA..."
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-950"
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {pickerResults.map(({ student, classGroup }) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => handleManualStudentChange(pickerItemId, student.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{student.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {classGroup.turmaAbrev || classGroup.name} · Nº {student.number.toString().padStart(2, '0')} · RA{' '}
                      {student.ra || '—'}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">arrow_forward</span>
                </button>
              ))}
              {pickerResults.length === 0 && (
                <p className="p-6 text-center text-xs text-slate-500">Nenhum estudante encontrado.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) return contentNode;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-100"
    >
      {contentNode}
    </div>
  );
};
