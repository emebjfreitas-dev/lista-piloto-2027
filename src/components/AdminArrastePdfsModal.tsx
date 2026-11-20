import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ClassGroup, Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  uploadBatchStudentPdfsViaApi,
  clearAllStudentPdfsViaApi,
  BinaryPdfUploadInput,
  BatchUploadProgress,
} from '../services/db';
import { isSupportedPdfFile, collectFilesFromDataTransfer } from '../utils/photoCompressor';
import { validateAndOptimizePdf } from '../utils/pdfOptimizer';
import {
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  FolderUp,
  HelpCircle,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

interface AdminArrastePdfsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  onBatchPdfsSaved: (updatedClasses: ClassGroup[]) => void;
  embedded?: boolean;
}

interface DroppedPdfItem {
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
    bytes: Uint8Array;
    sha256: string;
    originalBytes: number;
    optimizedBytes: number;
    pageCount?: number;
  };
}

const PAGE_SIZE = 40;
const WORKER_CONCURRENCY = 4;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatEtaRemaining = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const rounded = Math.ceil(seconds);
  if (rounded < 60) return `~${rounded}s restantes`;
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `~${mins}m ${secs.toString().padStart(2, '0')}s restantes`;
};

export const AdminArrastePdfsModal: React.FC<AdminArrastePdfsModalProps> = ({
  isOpen,
  onClose,
  classes,
  onBatchPdfsSaved,
  embedded = false,
}) => {
  const [items, setItems] = useState<DroppedPdfItem[]>([]);
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
  const [optimizeProgress, setOptimizeProgress] = useState({
    done: 0,
    total: 0,
    savedBytes: 0,
    skippedIdentical: 0,
    failed: 0,
  });
  const [uploadProgress, setUploadProgress] = useState<BatchUploadProgress | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef(false);
  const pauseWaitersRef = useRef<Array<() => void>>([]);
  const batchStartMsRef = useRef<number>(0);
  const pausedAccumMsRef = useRef<number>(0);
  const pauseStartedMsRef = useRef<number | null>(null);

  const resumePausedWorkers = () => {
    if (pauseStartedMsRef.current !== null) {
      pausedAccumMsRef.current += Date.now() - pauseStartedMsRef.current;
      pauseStartedMsRef.current = null;
    }
    isPausedRef.current = false;
    setIsPaused(false);
    const waiters = pauseWaitersRef.current.splice(0, pauseWaitersRef.current.length);
    waiters.forEach((resolve) => resolve());
  };

  const waitIfPaused = () => {
    if (!isPausedRef.current || abortControllerRef.current?.signal.aborted) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      pauseWaitersRef.current.push(resolve);
    });
  };

  const handleTogglePause = () => {
    if (isPausedRef.current) {
      resumePausedWorkers();
    } else {
      isPausedRef.current = true;
      pauseStartedMsRef.current = Date.now();
      setIsPaused(true);
    }
  };

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, [isOpen, embedded]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      resumePausedWorkers();
    };
  }, []);

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
    const cleanDigits = (baseName.match(/\d{5,12}/) || [])[0];

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

    // 2. Turma + Nº Chamada
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
      .replace(/^(FICHA|CADASTRO|MATRICULA|DOC|PDF|SCAN|SCANNER|RELATORIO|INFORMATIVA)\s*[-_]?\s*/i, '')
      .replace(/\s*\(\d+\)$/, '')
      .replace(/^[0-9]{1,3}\s*[-_]\s*/, '')
      .trim();

    if (normFile.length >= 4) {
      for (const item of prioritizePool) {
        if (item.normName === normFile) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: 'Nome Exato Completo',
          };
        }
      }

      for (const item of prioritizePool) {
        if (
          item.normName.length >= 8 &&
          (normFile.includes(item.normName) || item.normName.includes(normFile))
        ) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: 'Correspondência de Nome',
          };
        }
      }

      const fileTokens = normFile.split(' ').filter((t) => t.length > 2 && !CORE_STOP_WORDS.has(t));
      if (fileTokens.length >= 2) {
        const firstToken = fileTokens[0];
        const lastToken = fileTokens[fileTokens.length - 1];
        for (const item of prioritizePool) {
          const studentTokens = item.normName
            .split(' ')
            .filter((t) => t.length > 2 && !CORE_STOP_WORDS.has(t));
          if (studentTokens.length >= 2) {
            if (studentTokens[0] === firstToken && studentTokens[studentTokens.length - 1] === lastToken) {
              const matchedCount = fileTokens.filter((ft) => studentTokens.includes(ft)).length;
              if (matchedCount >= 2) {
                return {
                  student: item.student,
                  classGroup: item.classGroup,
                  reason: `Primeiro + Último Nome (${firstToken} ${lastToken})`,
                };
              }
            }
          }
        }
      }
    }

    return {};
  };

  // Enfileira 2.000+ PDFs instantaneamente (sem ler DataURL em RAM no drop)
  const addCollectedFiles = (collected: Array<{ file: File; relativePath: string }>) => {
    const valid = collected.filter((c) => isSupportedPdfFile(c.file));
    if (valid.length === 0) {
      setStatusMessage('Nenhum arquivo PDF válido encontrado no lote.');
      return;
    }

    setIsProcessing(true);
    setItems((prev) => {
      const existingSignatures = new Set(
        prev.map((p) => `${p.filename.toLowerCase()}::${p.fileSizeBytes}::${p.relativePath}`)
      );

      let skippedDuplicates = 0;
      const added: DroppedPdfItem[] = [];

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
          id: `pdf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
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
        `✓ ${added.length} ficha(s) PDF na fila leve${
          skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicado(s) ignorado(s))` : ''
        }. Validação %PDF-, compactação lossless e deduplicação SHA-256 ocorrerão ao sincronizar.`
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
    setStatusMessage('Lendo arquivos e subpastas PDF...');
    try {
      const collected = await collectFilesFromDataTransfer(e.dataTransfer, isSupportedPdfFile);
      addCollectedFiles(collected);
    } catch {
      setIsProcessing(false);
      setStatusMessage('Falha ao ler arquivos PDF soltos.');
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
    const results =
      q || qDigits
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
      setStatusMessage('Nenhum estudante identificado para vincular os PDFs.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    batchStartMsRef.current = Date.now();
    pausedAccumMsRef.current = 0;
    pauseStartedMsRef.current = null;
    isPausedRef.current = false;
    setIsPaused(false);

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
      `Validando assinatura %PDF- e compactando ${targetItems.length} ficha(s) de forma 100% lossless...`
    );

    try {
      const dedupByStudent = new Map<string, DroppedPdfItem>();
      for (const it of targetItems) {
        dedupByStudent.set(it.matchedStudent!.id, it);
      }
      const uniqueTargets = Array.from(dedupByStudent.values());

      const seenBatchSha = new Map<string, Uint8Array>();
      const readyPayloads: BinaryPdfUploadInput[] = [];
      const itemUpdates = new Map<string, Partial<DroppedPdfItem>>();

      let doneCount = 0;
      let savedBytes = 0;
      let skippedIdentical = 0;
      let failedOptimize = 0;
      let nextIndex = 0;

      const runWorker = async () => {
        while (nextIndex < uniqueTargets.length) {
          await waitIfPaused();
          if (controller.signal.aborted) break;
          const idx = nextIndex++;
          if (idx >= uniqueTargets.length) break;
          const it = uniqueTargets[idx];
          const student = it.matchedStudent!;

          try {
            let opt = it.optimizedResult;
            if (!opt) {
              const res = await validateAndOptimizePdf(it.file);
              if (!res.valid) {
                failedOptimize++;
                itemUpdates.set(it.id, {
                  status: 'error',
                  errorMsg: res.reason || 'PDF inválido ou corrompido.',
                });
                continue;
              }
              opt = {
                bytes: res.bytes,
                sha256: res.sha256,
                originalBytes: res.originalBytes,
                optimizedBytes: res.optimizedBytes,
                pageCount: res.pageCount,
              };
            }

            savedBytes += Math.max(0, opt.originalBytes - opt.optimizedBytes);

            if (student.fichaPdfSha256 && student.fichaPdfSha256 === opt.sha256 && student.fichaPdfDriveUrl) {
              skippedIdentical++;
              itemUpdates.set(it.id, {
                status: 'skipped_identical',
                errorMsg: undefined,
                optimizedResult: opt,
              });
            } else {
              if (!seenBatchSha.has(opt.sha256)) {
                seenBatchSha.set(opt.sha256, opt.bytes);
              }
              readyPayloads.push({
                studentId: student.id,
                bytes: seenBatchSha.get(opt.sha256)!,
                sha256: opt.sha256,
              });
              itemUpdates.set(it.id, {
                status: 'ready',
                errorMsg: undefined,
                optimizedResult: opt,
              });
            }
          } catch (err: any) {
            failedOptimize++;
            itemUpdates.set(it.id, {
              status: 'error',
              errorMsg: err?.message || 'Erro ao ler/compactar PDF.',
            });
          } finally {
            doneCount++;
            if (doneCount % 4 === 0 || doneCount === uniqueTargets.length) {
              setOptimizeProgress({
                done: doneCount,
                total: uniqueTargets.length,
                savedBytes,
                skippedIdentical,
                failed: failedOptimize,
              });
            }
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(WORKER_CONCURRENCY, uniqueTargets.length) }, () => runWorker())
      );

      if (controller.signal.aborted) {
        setStatusMessage('Sincronização interrompida pelo usuário.');
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
            ? `✓ Nenhuma alteração necessária: ${skippedIdentical} ficha(s) PDF já estavam atualizadas (mesmo SHA-256).`
            : 'Nenhuma ficha PDF válida pronta para envio.'
        );
        return;
      }

      setPipelinePhase('uploading');
      batchStartMsRef.current = Date.now();
      pausedAccumMsRef.current = 0;
      pauseStartedMsRef.current = isPausedRef.current ? Date.now() : null;
      setStatusMessage(
        `Enviando ${readyPayloads.length} ficha(s) PDF em pacotes binários... (Economia lossless: ${formatFileSize(savedBytes)})`
      );

      const res = await uploadBatchStudentPdfsViaApi(readyPayloads, {
        signal: controller.signal,
        waitIfPaused,
        onProgress: (p) => setUploadProgress(p),
      });

      const now = Date.now();
      const resultMap = new Map(res.results.map((r) => [r.studentId, r]));
      const failedSet = new Set(res.failedStudentIds);

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
            return {
              ...s,
              fichaPdfDriveUrl: r?.pdfUrl || `/api/pdfs/${cleanId}.pdf?v=${now}`,
              fichaPdfDriveId: r?.pdfId || cleanId,
              fichaPdfSha256: r?.sha256 || payload?.sha256 || s.fichaPdfSha256,
              fichaPdfManualLink: true,
              updatedAtMs: now,
            };
          }),
        };
      });

      onBatchPdfsSaved(updatedClasses);
      setPipelinePhase('done');

      const totalSkippedAll = skippedIdentical + (res.skippedCount || 0);
      const totalFailedAll = failedOptimize + res.failedStudentIds.length;

      setStatusMessage(
        `✓ Concluído: ${res.updatedCount} ficha(s) salva(s) · ${totalSkippedAll} idêntica(s) economizada(s) · ${formatFileSize(
          savedBytes
        )} economizados${totalFailedAll > 0 ? ` · ${totalFailedAll} com falha (clique em Reenviar Falhas)` : '.'}`
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setStatusMessage('Sincronização cancelada pelo usuário.');
      } else {
        setStatusMessage('Falha ao sincronizar lote de PDFs. Você pode clicar em Reenviar.');
      }
      setPipelinePhase('idle');
    } finally {
      abortControllerRef.current = null;
      resumePausedWorkers();
      setIsSaving(false);
    }
  };

  const handleCancelSync = () => {
    abortControllerRef.current?.abort();
    resumePausedWorkers();
  };

  const handleClearAllPdfs = async () => {
    setIsClearingAll(true);
    setConfirmClearAll(false);
    setStatusMessage('Limpando todas as fichas PDF do sistema...');
    try {
      const res = await clearAllStudentPdfsViaApi();
      const now = Date.now();
      const resetClasses = classes.map((cls) => ({
        ...cls,
        updatedAtMs: now,
        students: cls.students.map((s) => ({
          ...s,
          fichaPdfDriveId: '',
          fichaPdfDriveUrl: '',
          fichaPdfSubfolder: '',
          fichaPdfSha256: '',
          fichaPdfManualLink: false,
          updatedAtMs: now,
        })),
      }));
      onBatchPdfsSaved(resetClasses);
      setItems([]);
      setStatusMessage(`✓ Todas as fichas PDF foram limpas (${res.clearedCount} removidas).`);
    } catch {
      setStatusMessage('Falha ao limpar fichas PDF atuais.');
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

  const activeElapsedMs =
    batchStartMsRef.current > 0
      ? Math.max(
          0,
          Date.now() -
            batchStartMsRef.current -
            pausedAccumMsRef.current -
            (pauseStartedMsRef.current ? Date.now() - pauseStartedMsRef.current : 0)
        )
      : 0;

  let etaLabel = '';
  if (isPaused && isSaving) {
    etaLabel = 'Pausado';
  } else if (
    pipelinePhase === 'optimizing' &&
    optimizeProgress.done >= 2 &&
    optimizeProgress.done < optimizeProgress.total &&
    activeElapsedMs > 0
  ) {
    const ratePerMs = optimizeProgress.done / activeElapsedMs;
    const remainingSec = (optimizeProgress.total - optimizeProgress.done) / ratePerMs / 1000;
    etaLabel = formatEtaRemaining(remainingSec);
  } else if (
    pipelinePhase === 'uploading' &&
    uploadProgress &&
    uploadProgress.processedItems >= 1 &&
    uploadProgress.processedItems < uploadProgress.totalItems &&
    activeElapsedMs > 0
  ) {
    const ratePerMs = uploadProgress.processedItems / activeElapsedMs;
    const remainingSec = (uploadProgress.totalItems - uploadProgress.processedItems) / ratePerMs / 1000;
    etaLabel = formatEtaRemaining(remainingSec);
  }

  const contentNode = (
    <div
      onClick={embedded ? undefined : (e) => e.stopPropagation()}
      className={
        embedded
          ? 'bg-white w-full rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col min-w-0'
          : 'modal-shell w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]'
      }
    >
      {/* Cabeçalho */}
      <div
        className={`flex items-start sm:items-center justify-between gap-3 p-4 sm:p-5 shrink-0 ${
          embedded ? 'bg-[#f4f7fb]' : 'modal-header-surface'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-[#9f1239] flex items-center justify-center shrink-0">
            <FileText className="w-[22px] h-[22px] shrink-0" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-slate-950 break-words leading-snug">
              Importar Fichas Informativas (PDF) em Lote (2.000+)
            </h3>
            <p className="text-xs text-slate-700 break-words leading-relaxed font-medium mt-0.5">
              Suporta pastas inteiras, validação %PDF-, compactação estrutural 100% lossless e deduplicação SHA-256
            </p>
          </div>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#e2e8f0] text-slate-900 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5 shrink-0" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Corpo */}
      <div className={embedded ? 'p-4 sm:p-6 space-y-4' : 'modal-scroll-body flex-1 p-4 sm:p-6 space-y-4'}>
        {statusMessage && (
          <div className="p-3.5 rounded-xl bg-[#edf2f7] text-xs font-bold text-slate-950 flex items-center justify-between gap-2">
            <span className="break-words">{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-700 hover:text-slate-950 text-xs font-bold shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Progresso */}
        {(isSaving || pipelinePhase === 'done') && optimizeProgress.total > 0 && (
          <div className="p-4 rounded-2xl bg-[#edf2f7] space-y-2.5 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-950">
              <span>
                {pipelinePhase === 'optimizing'
                  ? `Fase 1/2 · Validando e Compactando PDFs (${optimizeProgress.done}/${optimizeProgress.total}) · ${pctOptimize}%`
                  : pipelinePhase === 'uploading'
                  ? `Fase 2/2 · Enviando Pacotes Binários (${uploadProgress?.completedChunks || 0}/${uploadProgress?.totalChunks || 1}) · ${pctUpload}%`
                  : 'Processamento Concluído'}
              </span>
              <div className="flex items-center gap-3">
                {etaLabel && (
                  <span className={`tabular-nums font-bold ${isPaused ? 'text-amber-800' : 'text-[#0b3b8c]'}`}>
                    {etaLabel}
                  </span>
                )}
                <span className="tabular-nums font-bold text-[#065f46]">
                  Economia: {formatFileSize(optimizeProgress.savedBytes)}
                </span>
                {isSaving && (
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className={`min-h-[28px] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                      isPaused
                        ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                        : 'bg-amber-200 hover:bg-amber-300 text-amber-950'
                    }`}
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-3 h-3" strokeWidth={2.5} />
                        <span>Retomar</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3" strokeWidth={2.5} />
                        <span>Pausar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="w-full h-2.5 bg-[#dbe4f0] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-[#0b3b8c]'}`}
                style={{
                  width: `${pipelinePhase === 'optimizing' ? pctOptimize : pipelinePhase === 'uploading' ? pctUpload : 100}%`,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-700">
              <span>Idênticos ignorados: {optimizeProgress.skippedIdentical + (uploadProgress?.skippedCount || 0)}</span>
              {uploadProgress && <span>Gravados no servidor: {uploadProgress.updatedCount}</span>}
              {(optimizeProgress.failed > 0 || (uploadProgress?.failedCount || 0) > 0) && (
                <span className="text-rose-800 font-bold">
                  Inválidos/Erros: {optimizeProgress.failed + (uploadProgress?.failedCount || 0)}
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
          className={`rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'bg-[#dce7fb] scale-[0.99] shadow-[0_14px_34px_rgba(11,59,140,0.2)]'
              : 'bg-[#edf2f7] hover:bg-[#e2e8f0]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
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
            <div className="w-14 h-14 rounded-2xl bg-white shadow-[0_6px_16px_rgba(15,23,42,0.08)] flex items-center justify-center text-[#0b3b8c]">
              {isDragging ? (
                <Download className="w-8 h-8 animate-bounce" strokeWidth={2} />
              ) : (
                <FileUp className="w-8 h-8" strokeWidth={2} />
              )}
            </div>
            <h4 className="text-sm sm:text-base font-bold text-slate-950 mt-1">
              Arraste as Fichas Informativas (PDF) ou pastas inteiras e solte aqui
            </h4>
            <p className="text-xs text-slate-700 max-w-lg font-medium leading-relaxed break-words">
              Suporta <strong>2.000+ fichas PDF</strong> sem travar a memória. Identificação automática pelo{' '}
              <strong>RA</strong>, <strong>Nome</strong> ou <strong>Turma_Nº</strong>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white text-xs font-bold cursor-pointer shadow-[0_4px_12px_rgba(11,59,140,0.28)] transition-all flex items-center gap-2"
              >
                <FileText className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
                <span>Selecionar PDFs</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  folderInputRef.current?.click();
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-[#f4f7fb] text-slate-950 text-xs font-bold cursor-pointer shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-all flex items-center gap-2"
              >
                <FolderUp className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
                <span>Selecionar Pasta Completa</span>
              </button>
            </div>
          </div>
        </div>

        {/* Lista Paginada */}
        {items.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-1">
              <div className="flex flex-wrap items-center gap-1 bg-[#e2e8f0] p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('all');
                    setCurrentPage(1);
                  }}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                    filterMode === 'all' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-800'
                  }`}
                >
                  Todos ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('matched');
                    setCurrentPage(1);
                  }}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                    filterMode === 'matched' ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-950'
                  }`}
                >
                  Identificados ({matchedCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('unmatched');
                    setCurrentPage(1);
                  }}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                    filterMode === 'unmatched' ? 'bg-amber-700 text-white shadow-xs' : 'text-amber-950'
                  }`}
                >
                  Pendentes ({unmatchedCount})
                </button>
                {errorCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('errors');
                      setCurrentPage(1);
                    }}
                    className={`min-h-[34px] px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      filterMode === 'errors' ? 'bg-rose-700 text-white shadow-xs' : 'text-rose-950'
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
                  placeholder="Filtrar por nome, PDF ou RA..."
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#edf2f7] focus:bg-white text-xs text-slate-950 w-full sm:w-56"
                />
                <button
                  type="button"
                  onClick={() => {
                    setItems([]);
                    setPipelinePhase('idle');
                  }}
                  disabled={isSaving}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 font-bold text-xs cursor-pointer disabled:opacity-40"
                >
                  Limpar Lista
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pagedItems.map((item) => {
                const isMatched = Boolean(item.matchedStudent);
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 min-w-0 transition-colors ${
                      item.status === 'error'
                        ? 'bg-rose-100/80'
                        : item.status === 'uploaded' || item.status === 'skipped_identical'
                        ? 'bg-emerald-100/80'
                        : isMatched
                        ? 'bg-[#edf2f7]'
                        : 'bg-amber-100/75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                          <FileText className="w-[22px] h-[22px] shrink-0" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-950 break-all leading-snug" title={item.relativePath}>
                            {item.filename}
                          </p>
                          <p className="text-xs text-slate-700 font-mono tabular-nums mt-0.5">
                            {formatFileSize(item.fileSizeBytes)}
                            {item.optimizedResult?.pageCount ? ` · ${item.optimizedResult.pageCount} pág.` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={isSaving}
                        className="w-8 h-8 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40 transition-colors"
                        title="Remover arquivo"
                      >
                        <X className="w-[18px] h-[18px]" strokeWidth={2} />
                      </button>
                    </div>

                    {item.status === 'error' && item.errorMsg && (
                      <p className="text-[11px] font-semibold text-rose-700">{item.errorMsg}</p>
                    )}

                    {item.status === 'skipped_identical' && (
                      <p className="text-[11px] font-semibold text-emerald-800">
                        ✓ Idêntico ao arquivo atual (SHA-256)
                      </p>
                    )}

                    <div className="p-2.5 rounded-xl bg-slate-50 space-y-2 min-w-0">
                      {isMatched ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1 min-w-0">
                              <CheckCircle2 className="w-[14px] h-[14px] shrink-0" strokeWidth={2} />
                              <span className="break-words">{item.matchReason}</span>
                            </span>
                            <span className="text-[11px] font-medium text-slate-700 tabular-nums shrink-0">
                              Nº {item.matchedStudent!.number.toString().padStart(2, '0')}
                            </span>
                          </div>
                          <div className="flex items-start gap-2 min-w-0">
                            <StudentAvatar
                              student={item.matchedStudent!}
                              size="sm"
                              expandableOnClick={false}
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-950 break-words leading-snug">
                                {item.matchedStudent!.name}
                              </p>
                              <p className="text-[11px] text-slate-700 break-words mt-0.5">
                                {item.matchedClass?.turmaAbrev || item.matchedClass?.name} · RA{' '}
                                {item.matchedStudent!.ra || '—'}
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                          <HelpCircle className="w-[15px] h-[15px] shrink-0" strokeWidth={2} />
                          <span>Estudante não identificado</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setPickerItemId(item.id);
                          setPickerSearch('');
                        }}
                        className="w-full min-h-[34px] px-2.5 bg-white hover:bg-[#e2e8f0] rounded-lg text-xs font-bold text-slate-950 cursor-pointer"
                      >
                        {isMatched ? 'Trocar estudante...' : 'Escolher aluno da escola...'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-slate-700 font-semibold">
                <span>
                  Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredItems.length)} de {filteredItems.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-3 rounded-lg bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 disabled:opacity-40 cursor-pointer"
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
                    className="h-8 px-3 rounded-lg bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 disabled:opacity-40 cursor-pointer"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="sticky bottom-0 bg-[#f4f7fb] p-4 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
        <div className="flex items-center gap-2">
          {confirmClearAll ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearAllPdfs}
                disabled={isClearingAll}
                className="min-h-[38px] px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                {isClearingAll ? 'Limpando...' : 'Confirmar Limpeza'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[38px] px-3 py-2 bg-slate-100 text-slate-800 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              disabled={isClearingAll || isSaving}
              className="min-h-[40px] px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 font-medium text-xs rounded-xl cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4 text-rose-600 shrink-0" strokeWidth={2} />
              <span>Limpar Todos os PDFs Atuais</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="min-h-[40px] px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs sm:text-sm rounded-xl cursor-pointer"
            >
              Fechar
            </button>
          )}

          {isSaving && (
            <>
              <button
                type="button"
                onClick={handleTogglePause}
                className="min-h-[40px] px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                {isPaused ? (
                  <>
                    <Play className="w-4 h-4" strokeWidth={2.2} />
                    <span>Retomar</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" strokeWidth={2.2} />
                    <span>Pausar</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelSync}
                className="min-h-[40px] px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar Envio
              </button>
            </>
          )}

          {errorCount > 0 && !isSaving && (
            <button
              type="button"
              onClick={() => void handleConfirmBatch(true)}
              className="min-h-[40px] px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-[17px] h-[17px]" strokeWidth={2} />
              <span>Reenviar Falhas ({errorCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleConfirmBatch(false)}
            disabled={isSaving || isProcessing || matchedCount === 0}
            className="min-h-[40px] px-6 py-2 bg-slate-950 hover:bg-black text-white font-semibold text-xs sm:text-sm rounded-xl cursor-pointer flex items-center gap-2 disabled:opacity-40 shadow-xs"
          >
            {isSaving ? (
              <RefreshCw className="w-[18px] h-[18px] shrink-0 animate-spin" strokeWidth={2} />
            ) : (
              <CheckCheck className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
            )}
            <span>
              {isSaving
                ? isPaused
                  ? 'Envio Pausado...'
                  : 'Sincronizando Fichas...'
                : `Otimizar e Sincronizar ${matchedCount} Ficha(s)`}
            </span>
          </button>
        </div>
      </div>

      {/* Modal leve sob demanda de estudante */}
      {pickerItemId && (
        <div
          onClick={() => setPickerItemId(null)}
          className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-backdrop-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-shell w-full max-w-md rounded-3xl overflow-hidden flex flex-col max-h-[80vh] animate-apple-pop"
          >
            <div className="p-4 modal-header-surface flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-950">Vincular Estudante Manualmente</h4>
              <button
                type="button"
                onClick={() => setPickerItemId(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-[#e2e8f0] text-slate-900 flex items-center justify-center cursor-pointer"
                aria-label="Fechar seleção"
              >
                <X className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
            </div>
            <div className="p-3 bg-[#f4f7fb]">
              <input
                type="search"
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Buscar por nome, turma ou RA..."
                className="w-full min-h-[40px] px-3 rounded-xl bg-white text-xs text-slate-950"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {pickerResults.map(({ student, classGroup }) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => handleManualStudentChange(pickerItemId, student.id)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl even:bg-[#f4f7fb] hover:bg-[#dce7fb] transition-colors cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-950 truncate">{student.name}</p>
                    <p className="text-[11px] font-medium text-slate-700">
                      {classGroup.turmaAbrev || classGroup.name} · Nº {student.number.toString().padStart(2, '0')} · RA{' '}
                      {student.ra || '—'}
                    </p>
                  </div>
                  <ArrowRight className="w-[18px] h-[18px] text-slate-600 shrink-0" strokeWidth={2} />
                </button>
              ))}
              {pickerResults.length === 0 && (
                <p className="p-6 text-center text-xs font-medium text-slate-700">Nenhum estudante encontrado.</p>
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
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in"
    >
      {contentNode}
    </div>
  );
};
