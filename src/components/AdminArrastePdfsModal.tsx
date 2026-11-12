import React, { useState, useRef, useMemo } from 'react';
import { ClassGroup, Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  uploadBatchStudentPdfsViaApi,
  clearAllStudentPdfsViaApi,
} from '../services/db';

interface AdminArrastePdfsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  onBatchPdfsSaved: (updatedClasses: ClassGroup[]) => void;
}

interface DroppedPdfItem {
  id: string;
  file: File;
  filename: string;
  fileSizeBytes: number;
  dataUrl?: string;
  matchedStudent?: Student;
  matchedClass?: ClassGroup;
  matchReason?: string;
  manualStudentId?: string;
}

export const AdminArrastePdfsModal: React.FC<AdminArrastePdfsModalProps> = ({
  isOpen,
  onClose,
  classes,
  onBatchPdfsSaved,
}) => {
  const [items, setItems] = useState<DroppedPdfItem[]>([]);
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

  // Identificador automático de estudante a partir do nome do arquivo PDF
  const matchStudentFromFilename = (
    filename: string
  ): { student?: Student; classGroup?: ClassGroup; reason?: string } => {
    // 1. Remover extensão .pdf
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

    // REGRA 2: Correspondência por Turma + Número de Chamada (ex: "1F_01.pdf", "1º F - 02.pdf", "G5B_15.pdf")
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
      .replace(/^(FICHA|CADASTRO|MATRICULA|DOC|PDF|SCAN|SCANNER|RELATORIO)\s*[-_]?\s*/i, '')
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
            reason: 'Nome Exato Completo',
          };
        }
      }

      // 3.2. Match por Inclusão (O nome do arquivo contém o nome do aluno ou vice-versa)
      for (const item of allStudentsWithClass) {
        const normStudentName = normalize(item.student.name);
        if (
          normStudentName.length >= 8 &&
          (normFile.includes(normStudentName) || normStudentName.includes(normFile))
        ) {
          return {
            student: item.student,
            classGroup: item.classGroup,
            reason: 'Correspondência de Nome',
          };
        }
      }

      // 3.3. Match por Tokens (Primeiro Nome + Último Sobrenome)
      const fileTokens = normFile.split(' ').filter((t) => t.length > 2 && !CORE_STOP_WORDS.has(t));
      if (fileTokens.length >= 2) {
        const firstToken = fileTokens[0];
        const lastToken = fileTokens[fileTokens.length - 1];

        for (const item of allStudentsWithClass) {
          const studentTokens = normalize(item.student.name)
            .split(' ')
            .filter((t) => t.length > 2 && !CORE_STOP_WORDS.has(t));

          if (studentTokens.length >= 2) {
            const stFirst = studentTokens[0];
            const stLast = studentTokens[studentTokens.length - 1];

            if (stFirst === firstToken && stLast === lastToken) {
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

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve((e.target?.result as string) || '');
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAddFiles = async (fileList: FileList | File[]) => {
    setIsProcessing(true);
    setStatusMessage('Lendo e identificando fichas PDF...');

    const validFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (
        f.type === 'application/pdf' ||
        f.name.toLowerCase().endsWith('.pdf')
      ) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      setIsProcessing(false);
      setStatusMessage('Nenhum arquivo PDF válido encontrado no lote.');
      return;
    }

    const newItems: DroppedPdfItem[] = [];

    for (const file of validFiles) {
      const dataUrl = await readFileAsDataUrl(file);
      const match = matchStudentFromFilename(file.name);

      newItems.push({
        id: `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        filename: file.name,
        fileSizeBytes: file.size,
        dataUrl,
        matchedStudent: match.student,
        matchedClass: match.classGroup,
        matchReason: match.reason,
      });
    }

    setItems((prev) => [...prev, ...newItems]);
    setIsProcessing(false);
    setStatusMessage(`✓ ${validFiles.length} arquivo(s) PDF carregado(s). Verifique as associações.`);
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

  // Salvar lote de PDFs no servidor e sincronizar com todas as turmas
  const handleConfirmBatch = async () => {
    const validPairs = items
      .filter((it) => it.matchedStudent && it.dataUrl)
      .map((it) => ({
        studentId: it.matchedStudent!.id,
        pdfDataUrl: it.dataUrl!,
      }));

    if (validPairs.length === 0) {
      setStatusMessage('Nenhum estudante identificado para vincular os PDFs.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(`Sincronizando ${validPairs.length} ficha(s) PDF com o servidor oficial...`);

    try {
      // 1. Enviar lote para o backend Express
      const res = await uploadBatchStudentPdfsViaApi(validPairs);

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
            const cleanId = s.id.replace(/[^a-zA-Z0-9-_]/g, '_');
            return {
              ...s,
              fichaPdfDriveUrl: `/api/pdfs/${cleanId}.pdf?v=${now}`,
              fichaPdfDriveId: cleanId,
              fichaPdfManualLink: true,
              updatedAtMs: now,
            };
          }),
        };
      });

      onBatchPdfsSaved(updatedClasses);
      setStatusMessage(`✓ Sucesso! ${res.updatedCount || validPairs.length} ficha(s) PDF vinculadas e salvas no sistema.`);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch {
      setStatusMessage('Falha ao sincronizar lote de PDFs.');
    } finally {
      setIsSaving(false);
    }
  };

  // Limpar todas as fichas PDF de todos os estudantes (Reset de fichas)
  const handleClearAllPdfs = async () => {
    const confirmed = window.confirm(
      'ATENÇÃO: Deseja realmente LIMPAR TODAS as fichas PDF dos alunos de todas as turmas da escola? Os alunos começarão do zero sem fichas PDF anexadas.'
    );
    if (!confirmed) return;

    setIsClearingAll(true);
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
          fichaPdfManualLink: false,
          updatedAtMs: now,
        })),
      }));

      onBatchPdfsSaved(resetClasses);
      setItems([]);
      setStatusMessage(`✓ Todas as fichas PDF foram limpas (${res.clearedCount} fichas removidas). O sistema está limpo.`);
    } catch {
      setStatusMessage('Falha ao limpar fichas PDF atuais.');
    } finally {
      setIsClearingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]"
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-900 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">picture_as_pdf</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-950 truncate">
                  Arraste &amp; Solte de Fichas PDF dos Alunos
                </h3>
                <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-950 text-[10px] font-bold uppercase tracking-wider shrink-0">
                  Exclusivo Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate font-normal">
                Vincule fichas PDF em massa por RA, Nome ou Turma e sincronize com toda a escola
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
            <div className="p-3.5 rounded-2xl bg-slate-100 text-xs font-semibold text-slate-900 flex items-center justify-between gap-2 shadow-2xs">
              <span>{statusMessage}</span>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-slate-500 hover:text-slate-900 text-xs font-bold"
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
                ? 'bg-rose-100/80 scale-[0.995]'
                : 'bg-slate-100/70 hover:bg-slate-100'
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
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-xs flex items-center justify-center text-rose-600">
                <span className="material-symbols-outlined text-[32px]">
                  {isDragging ? 'downloading' : 'upload_file'}
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                Arraste as fichas PDF dos alunos nomeadas e solte aqui
              </h4>
              <p className="text-xs text-slate-500 max-w-md font-normal leading-relaxed">
                Você pode soltar dezenas ou centenas de arquivos PDF de uma só vez. O sistema identifica automaticamente pelo <strong>RA</strong>, pelo <strong>Nome</strong> ou pelo padrão <strong>Turma_Nº</strong> (ex: <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">12405139.pdf</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">ADRYAN GABRIEL.pdf</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">1F_01.pdf</code>).
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-2 h-10 px-5 rounded-xl bg-slate-950 hover:bg-black text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">folder_open</span>
                <span>Ou selecione PDFs do computador</span>
              </button>
            </div>
          </div>

          {/* Painel de Itens e Conferência */}
          {items.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Barra de Filtros e Estatísticas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => setFilterMode('all')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                        filterMode === 'all'
                          ? 'bg-white text-slate-950 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      Todos ({totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('matched')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        filterMode === 'matched'
                          ? 'bg-emerald-700 text-white font-semibold shadow-2xs'
                          : 'text-emerald-800 hover:text-emerald-950'
                      }`}
                    >
                      <span>Identificados</span>
                      <span className="tabular-nums">({matchedCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('unmatched')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        filterMode === 'unmatched'
                          ? 'bg-amber-700 text-white font-semibold shadow-2xs'
                          : 'text-amber-800 hover:text-amber-950'
                      }`}
                    >
                      <span>Não Identificados</span>
                      <span className="tabular-nums">({unmatchedCount})</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="h-8 px-3 rounded-lg text-slate-600 hover:text-slate-900 text-xs font-medium cursor-pointer"
                  >
                    Limpar Lista
                  </button>
                </div>
              </div>

              {/* Grade de Cards de Arquivos PDF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredItems.map((item) => {
                  const isMatched = Boolean(item.matchedStudent);

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 transition-all shadow-2xs ${
                        isMatched
                          ? 'bg-white'
                          : 'bg-amber-50/60'
                      }`}
                    >
                      {/* Topo: Ícone PDF + Nome do Arquivo + Excluir */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[22px]">picture_as_pdf</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-950 truncate" title={item.filename}>
                              {item.filename}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {formatFileSize(item.fileSizeBytes)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                          title="Remover este arquivo"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>

                      {/* Bloco de Associação com Estudante */}
                      <div className="p-2.5 rounded-xl bg-slate-50 space-y-1.5">
                        {isMatched ? (
                          <>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                <span>{item.matchReason}</span>
                              </span>
                              <span className="text-[10px] font-medium text-slate-500 tabular-nums">
                                Nº {item.matchedStudent!.number.toString().padStart(2, '0')}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 min-w-0">
                              <StudentAvatar
                                student={item.matchedStudent!}
                                size="sm"
                                className="w-7 h-7 rounded-lg object-cover shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-950 truncate">
                                  {item.matchedStudent!.name}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {item.matchedClass?.turmaAbrev || item.matchedClass?.name} · RA {item.matchedStudent!.ra || '—'}
                                </p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">help</span>
                              <span>Estudante não identificado</span>
                            </span>
                            <p className="text-[11px] text-slate-500 font-normal">
                              Selecione o estudante manualmente:
                            </p>
                          </div>
                        )}

                        {/* Seletor manual de estudante */}
                        <div className="pt-1">
                          <select
                            value={item.matchedStudent?.id || ''}
                            onChange={(e) => handleManualStudentChange(item.id, e.target.value)}
                            className="w-full h-8 px-2 bg-white rounded-lg text-xs font-normal text-slate-950 focus:outline-none cursor-pointer"
                          >
                            <option value="">
                              {isMatched ? 'Trocar estudante...' : 'Escolher aluno da escola...'}
                            </option>
                            {allStudentsWithClass.map(({ student, classGroup }) => (
                              <option key={student.id} value={student.id}>
                                {classGroup.turmaAbrev || classGroup.name} · Nº {student.number.toString().padStart(2, '0')} - {student.name} (RA: {student.ra || '—'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Fixo de Ações (Apple Clean) */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm p-4 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearAllPdfs}
              disabled={isClearingAll}
              className="h-10 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-800 font-medium text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              title="Limpar todos os PDFs de todos os estudantes da escola"
            >
              <span className="material-symbols-outlined text-[16px] text-rose-600">delete_sweep</span>
              <span>{isClearingAll ? 'Limpando...' : 'Limpar Todos os PDFs Atuais'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>

            <button
              type="button"
              onClick={handleConfirmBatch}
              disabled={isSaving || matchedCount === 0}
              className="h-10 px-6 bg-slate-950 hover:bg-black text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-40 shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>
                {isSaving
                  ? 'Sincronizando Fichas...'
                  : `Vincular e Sincronizar ${matchedCount} Ficha(s)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
