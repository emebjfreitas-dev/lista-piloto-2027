import React, { useState, useMemo, useRef } from 'react';
import { AuthorizedUser, ClassGroup, UserRole } from '../types';
import {
  ParsedHtmDisabilityRow,
  ParsedHtmFileResult,
  parseSedHtmDisabilitiesFile,
} from '../utils/htmDisabilityParser';
import {
  addSecurityAuditLog,
  pushClassesToServer,
  saveStoredClasses,
} from '../services/db';
import { saveClassesToFirestoreCloud } from '../services/firebaseSync';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileCode2,
  Lock,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface ImportarDeficienciasHtmScreenProps {
  classes: ClassGroup[];
  userRole: UserRole;
  userEmail: string;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  onUpdateClasses: (updatedClasses: ClassGroup[]) => void;
  onBack: () => void;
}

type PreviewFilter = 'all' | 'ready' | 'unchanged' | 'unmatched';
type ApplyMode = 'replace_matched' | 'append_existing';

interface EditableParsedRow extends ParsedHtmDisabilityRow {
  selected: boolean;
  editedDeficiencia: string;
}

export const ImportarDeficienciasHtmScreen: React.FC<ImportarDeficienciasHtmScreenProps> = ({
  classes,
  userRole,
  userEmail,
  teacherRoleType,
  onUpdateClasses,
  onBack,
}) => {
  const isStrictAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [parsedFiles, setParsedFiles] = useState<ParsedHtmFileResult[]>([]);
  const [rows, setRows] = useState<EditableParsedRow[]>([]);
  const [fallbackDisabilityTag, setFallbackDisabilityTag] = useState('');
  const [applyMode, setApplyMode] = useState<ApplyMode>('replace_matched');
  const [allowClearWhenNoDisability, setAllowClearWhenNoDisability] = useState(true);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const currentAeeStudentsCount = useMemo(() => {
    let count = 0;
    classes.forEach((cls) => {
      cls.students.forEach((st) => {
        if ((st.deficiencia || '').trim().length > 0) count++;
      });
    });
    return count;
  }, [classes]);

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => {
      const lower = f.name.toLowerCase();
      return lower.endsWith('.htm') || lower.endsWith('.html') || f.type.includes('html');
    });

    if (files.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Selecione apenas arquivos no formato .htm ou .html exportados da SED.',
      });
      return;
    }

    setIsParsing(true);
    setFeedback(null);
    try {
      const results: ParsedHtmFileResult[] = [];
      const collectedRows: EditableParsedRow[] = [];

      for (const file of files) {
        const res = await parseSedHtmDisabilitiesFile(
          file,
          classes,
          fallbackDisabilityTag.trim()
        );
        results.push(res);
        res.rows.forEach((r) => {
          collectedRows.push({
            ...r,
            selected: r.matchStatus === 'matched' && r.willChange,
            editedDeficiencia: r.normalizedDeficiencia,
          });
        });
      }

      setParsedFiles(results);
      setRows(collectedRows);

      const matchedCount = collectedRows.filter((r) => r.matchStatus === 'matched').length;
      if (collectedRows.length === 0) {
        setFeedback({
          type: 'error',
          text: 'Nenhuma linha de estudante reconhecida no arquivo .htm. Verifique se é um relatório nominal ou lista com coluna RA/Nome.',
        });
      } else {
        setFeedback({
          type: 'success',
          text: `${results.length} arquivo(s) lido(s): ${collectedRows.length} registro(s) extraído(s), ${matchedCount} vinculado(s) à base escolar.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Erro ao ler arquivo .htm: ${err?.message || 'Formato inválido'}`,
      });
    } finally {
      setIsParsing(false);
    }
  };

  const applyFallbackToEmptyRows = () => {
    const tag = fallbackDisabilityTag.trim();
    if (!tag) return;
    setRows((prev) =>
      prev.map((row) => {
        if (row.editedDeficiencia.trim()) return row;
        const willChange =
          row.matchStatus === 'matched' &&
          tag.toUpperCase() !== row.currentDeficiencia.toUpperCase();
        return {
          ...row,
          editedDeficiencia: tag,
          isClearSignal: false,
          willChange,
          selected: row.matchStatus === 'matched' && willChange,
        };
      })
    );
    setFeedback({
      type: 'success',
      text: `Deficiência "${tag}" aplicada aos registros sem coluna explícita.`,
    });
  };

  const stats = useMemo(() => {
    const matched = rows.filter((r) => r.matchStatus === 'matched');
    const ready = matched.filter((r) => {
      const target = r.editedDeficiencia.trim();
      if (target) return target.toUpperCase() !== r.currentDeficiencia.toUpperCase();
      return allowClearWhenNoDisability && r.isClearSignal && r.currentDeficiencia !== '';
    });
    const unchanged = matched.filter((r) => !ready.includes(r));
    const unmatched = rows.filter((r) => r.matchStatus !== 'matched');
    const selectedToApply = ready.filter((r) => r.selected);
    return {
      total: rows.length,
      matchedCount: matched.length,
      readyCount: ready.length,
      unchangedCount: unchanged.length,
      unmatchedCount: unmatched.length,
      selectedCount: selectedToApply.length,
    };
  }, [rows, allowClearWhenNoDisability]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      const target = r.editedDeficiencia.trim();
      const isReady =
        r.matchStatus === 'matched' &&
        ((target !== '' && target.toUpperCase() !== r.currentDeficiencia.toUpperCase()) ||
          (allowClearWhenNoDisability && r.isClearSignal && r.currentDeficiencia !== ''));

      if (previewFilter === 'ready' && !isReady) return false;
      if (previewFilter === 'unchanged' && !(r.matchStatus === 'matched' && !isReady)) return false;
      if (previewFilter === 'unmatched' && r.matchStatus === 'matched') return false;

      if (!q) return true;
      return (
        r.rawName.toLowerCase().includes(q) ||
        (r.matchedStudentName || '').toLowerCase().includes(q) ||
        r.rawRa.toLowerCase().includes(q) ||
        (r.matchedClassName || r.rawTurma).toLowerCase().includes(q) ||
        r.editedDeficiencia.toLowerCase().includes(q)
      );
    });
  }, [rows, previewFilter, searchTerm, allowClearWhenNoDisability]);

  const handleApplyToDatabase = async () => {
    const toApply = rows.filter((r) => {
      if (!r.selected || r.matchStatus !== 'matched' || !r.matchedStudentId) return false;
      const target = r.editedDeficiencia.trim();
      if (target) return true;
      return allowClearWhenNoDisability && r.isClearSignal && r.currentDeficiencia !== '';
    });

    if (toApply.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Nenhum registro selecionado para atualização.',
      });
      return;
    }

    setIsApplying(true);
    try {
      const updatesByStudentId = new Map<string, string>();
      toApply.forEach((r) => {
        if (!r.matchedStudentId) return;
        const incoming = r.editedDeficiencia.trim();
        if (!incoming) {
          updatesByStudentId.set(r.matchedStudentId, '');
        } else if (applyMode === 'append_existing' && r.currentDeficiencia.trim()) {
          const existingParts = r.currentDeficiencia
            .split(/[/|;,]/)
            .map((p) => p.trim())
            .filter(Boolean);
          const alreadyHas = existingParts.some(
            (p) => p.toUpperCase() === incoming.toUpperCase()
          );
          updatesByStudentId.set(
            r.matchedStudentId,
            alreadyHas ? r.currentDeficiencia : `${r.currentDeficiencia} / ${incoming}`
          );
        } else {
          updatesByStudentId.set(r.matchedStudentId, incoming);
        }
      });

      const nowMs = Date.now();
      let appliedCount = 0;

      const updatedClasses = classes.map((cls) => {
        let clsModified = false;
        const nextStudents = cls.students.map((st) => {
          if (!updatesByStudentId.has(st.id)) return st;
          const nextDef = updatesByStudentId.get(st.id) || '';
          if (nextDef === (st.deficiencia || '').trim()) return st;
          clsModified = true;
          appliedCount++;
          return {
            ...st,
            deficiencia: nextDef,
            updatedAtMs: nowMs,
          };
        });
        return clsModified
          ? { ...cls, students: nextStudents, updatedAtMs: nowMs }
          : cls;
      });

      onUpdateClasses(updatedClasses);
      saveStoredClasses(updatedClasses);

      try {
        await saveClassesToFirestoreCloud(updatedClasses, nowMs);
        await pushClassesToServer(updatedClasses);
      } catch {
        // Offline queue persists automatically
      }

      addSecurityAuditLog({
        userEmail,
        userName: 'Administrador Escolar',
        userRole: 'admin',
        eventType: 'SYSTEM_CONFIG_UPDATED',
        actionTitle: 'Importação de Deficiências (AEE) via .HTM',
        details: `${appliedCount} estudante(s) atualizado(s) a partir de ${parsedFiles
          .map((f) => f.fileName)
          .join(', ')}.`,
        severity: 'info',
      });

      setRows((prev) =>
        prev.map((row) => {
          if (!row.matchedStudentId || !updatesByStudentId.has(row.matchedStudentId)) {
            return row;
          }
          const newVal = updatesByStudentId.get(row.matchedStudentId) || '';
          return {
            ...row,
            currentDeficiencia: newVal,
            willChange: false,
            selected: false,
          };
        })
      );

      setFeedback({
        type: 'success',
        text: `${appliedCount} estudante(s) atualizado(s) com sucesso no banco e sincronizados com a nuvem.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Falha ao aplicar alterações: ${err?.message || 'Erro desconhecido'}`,
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (!isStrictAdmin) {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 bg-white rounded-3xl shadow-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#fee2e2] text-[#991b1b] flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-semibold text-[#111827]">
          Acesso Exclusivo da Administração
        </h1>
        <p className="text-xs sm:text-sm text-[#48484a] leading-relaxed">
          A importação de arquivos .HTM de deficiências (SED / AEE) é permitida somente para a conta Administradora.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-5 rounded-2xl bg-[#111827] text-white text-xs sm:text-sm font-semibold cursor-pointer"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4 pb-20 text-[#111827] animate-gentle-fade">
      {feedback && (
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-[#eaf6ef] text-[#005035]'
              : 'bg-[#fee2e2] text-[#991b1b]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="break-words">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cabeçalho */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#48484a] hover:text-[#111827] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#111827]">
                Subir Deficiências dos Estudantes (.HTM)
              </h1>
              <span className="px-2.5 py-0.5 rounded-lg bg-[#e9e9ef] text-[#111827] text-[11px] font-semibold">
                Exclusivo Admin
              </span>
            </div>

            <p className="text-xs sm:text-sm text-[#48484a]">
              Envie arquivos .htm / .html exportados da SED para atualizar o campo Educação Especial / AEE · Atualmente <strong>{currentAeeStudentsCount}</strong> estudante(s) possuem deficiência registrada na base.
            </p>
          </div>

          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setParsedFiles([]);
                setRows([]);
                setFeedback(null);
              }}
              className="min-h-[40px] px-4 rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start lg:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Lista</span>
            </button>
          )}
        </div>

        {/* Zona de Arraste & Solte .HTM */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              void handleFilesSelected(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-colors duration-100 space-y-3 ${
            isDragging ? 'bg-[#e8f0fe]' : 'bg-[#f2f2f7] hover:bg-[#e9e9ef]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".htm,.html,text/html"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleFilesSelected(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <div className="w-12 h-12 rounded-2xl bg-white text-[#1a4fa3] flex items-center justify-center mx-auto shadow-xs">
            {isParsing ? (
              <Sparkles className="w-6 h-6 animate-spin" />
            ) : (
              <FileCode2 className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm sm:text-base font-semibold text-[#111827]">
              {isParsing
                ? 'Analisando arquivo .htm...'
                : 'Arraste aqui o(s) arquivo(s) .htm da SED ou toque para escolher'}
            </p>
            <p className="text-xs text-[#48484a] max-w-xl mx-auto">
              Compatível com tabelas e fichas da SED (UTF-8 e ISO-8859-1 / Windows-1252). O cruzamento é feito automaticamente por RA, CPF ou Nome + Turma antes de salvar.
            </p>
          </div>

          <div className="pt-1">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#111827] text-white text-xs font-semibold">
              <Upload className="w-3.5 h-3.5" />
              <span>Selecionar arquivo .htm / .html</span>
            </span>
          </div>
        </div>

        {/* Opções de Mesclagem & Etiqueta Padrão para Relatórios Filtrados */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end bg-[#f8f8fb] rounded-2xl p-4">
          <div className="lg:col-span-5 space-y-1">
            <label className="block text-[11px] font-semibold text-[#374151]">
              Deficiência padrão (opcional — útil se o .htm for uma lista filtrada sem coluna de deficiência)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fallbackDisabilityTag}
                onChange={(e) => setFallbackDisabilityTag(e.target.value)}
                placeholder="Ex: Transtorno do Espectro Autista"
                className="flex-1 min-h-[40px] px-3 rounded-xl bg-white text-xs sm:text-sm text-[#111827] placeholder:text-[#6b7280] focus:outline-none"
              />
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={applyFallbackToEmptyRows}
                  disabled={!fallbackDisabilityTag.trim()}
                  className="min-h-[40px] px-3 rounded-xl bg-[#e8f0fe] hover:bg-[#d6e4fc] text-[#1a4fa3] text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Preencher vazios
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-1">
            <label className="block text-[11px] font-semibold text-[#374151]">
              Regra quando o estudante já possui registro AEE
            </label>
            <select
              value={applyMode}
              onChange={(e) => setApplyMode(e.target.value as ApplyMode)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-white text-xs font-semibold text-[#111827] cursor-pointer focus:outline-none"
            >
              <option value="replace_matched">Substituir pelo valor do .htm</option>
              <option value="append_existing">Mesclar (manter atual + novo do .htm)</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="flex items-center gap-2 min-h-[40px] px-3 rounded-xl bg-white cursor-pointer text-xs font-medium text-[#111827]">
              <input
                type="checkbox"
                checked={allowClearWhenNoDisability}
                onChange={(e) => setAllowClearWhenNoDisability(e.target.checked)}
                className="w-4 h-4 accent-[#111827]"
              />
              <span>Limpar se .htm indicar &ldquo;Não possui&rdquo;</span>
            </label>
          </div>
        </div>
      </section>

      {/* Pré-visualização e Confirmação */}
      {rows.length > 0 && (
        <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
          {parsedFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#48484a]">
              {parsedFiles.map((pf) => (
                <span
                  key={pf.fileName}
                  className="px-2.5 py-1 rounded-lg bg-[#f2f2f7] text-[#111827] font-medium"
                >
                  {pf.fileName} · {pf.detectedCharset} · {pf.totalRowsExtracted} linha(s)
                </span>
              ))}
            </div>
          )}

          {/* Resumo + Botão Aplicar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Todos (${stats.total})` },
                  { id: 'ready', label: `Atualizações (${stats.readyCount})` },
                  { id: 'unchanged', label: `Já iguais (${stats.unchangedCount})` },
                  { id: 'unmatched', label: `Não encontrados (${stats.unmatchedCount})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPreviewFilter(t.id)}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium cursor-pointer transition-colors duration-100 ${
                    previewFilter === t.id
                      ? 'bg-[#111827] text-white font-semibold'
                      : 'bg-[#f2f2f7] text-[#374151] hover:bg-[#e9e9ef]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative sm:w-64">
                <Search className="w-4 h-4 text-[#48484a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar estudante, RA ou tipo..."
                  className="w-full min-h-[40px] pl-9 pr-8 rounded-xl bg-[#f2f2f7] text-xs sm:text-sm text-[#111827] focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={isApplying || stats.selectedCount === 0}
                onClick={handleApplyToDatabase}
                className="min-h-[42px] px-5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isApplying
                    ? 'Salvando...'
                    : `Aplicar ${stats.selectedCount} no Banco de Dados`}
                </span>
              </button>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:hidden">
            {filteredRows.map((row) => {
              const isMatched = row.matchStatus === 'matched';
              return (
                <article
                  key={row.rowKey}
                  className={`p-3.5 rounded-2xl space-y-2.5 ${
                    isMatched ? 'bg-[#f2f2f7]' : 'bg-[#fef3c7]/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#111827] break-words">
                        {row.matchedStudentName || row.rawName}
                      </p>
                      <p className="text-[11px] text-[#48484a] tabular-nums">
                        RA {row.matchedStudentRa || row.rawRa} · {row.matchedClassName || row.rawTurma}
                      </p>
                    </div>
                    {isMatched ? (
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setRows((prev) =>
                            prev.map((item) =>
                              item.rowKey === row.rowKey ? { ...item, selected: checked } : item
                            )
                          );
                        }}
                        className="w-5 h-5 accent-[#047857] shrink-0 cursor-pointer"
                        aria-label={`Selecionar ${row.matchedStudentName || row.rawName}`}
                      />
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-[#fee2e2] text-[#991b1b] text-[10px] font-semibold shrink-0">
                        Não encontrado
                      </span>
                    )}
                  </div>

                  {row.currentDeficiencia && (
                    <p className="text-[11px] text-[#48484a]">
                      Atual na base: <strong className="text-[#111827]">{row.currentDeficiencia}</strong>
                    </p>
                  )}

                  <div>
                    <label className="block text-[11px] font-medium text-[#48484a] mb-1">
                      Deficiência / AEE a gravar
                    </label>
                    <input
                      type="text"
                      value={row.editedDeficiencia}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRows((prev) =>
                          prev.map((item) =>
                            item.rowKey === row.rowKey
                              ? {
                                  ...item,
                                  editedDeficiencia: val,
                                  selected: item.matchStatus === 'matched' && val.trim().length > 0,
                                }
                              : item
                          )
                        );
                      }}
                      placeholder={row.isClearSignal ? 'Limpar (sem deficiência)' : 'Digite a deficiência...'}
                      className="w-full min-h-[38px] px-3 rounded-xl bg-white text-xs text-[#111827] focus:outline-none"
                    />
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop Zebra Table */}
          <div className="hidden lg:block overflow-x-auto rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f2f2f7] text-[#374151] font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-3 w-10 rounded-tl-xl">Aplicar</th>
                  <th className="py-3 px-3">Estudante (Base Escolar)</th>
                  <th className="py-3 px-3">Turma &amp; RA</th>
                  <th className="py-3 px-3">Vínculo</th>
                  <th className="py-3 px-3">Atual no Banco</th>
                  <th className="py-3 px-3 rounded-tr-xl">Deficiência / AEE (.HTM)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const isMatched = row.matchStatus === 'matched';
                  return (
                    <tr
                      key={row.rowKey}
                      className="odd:bg-[#f8f8fb] even:bg-white hover:bg-[#eef0f5] transition-colors duration-100"
                    >
                      <td className="py-2.5 px-3 align-middle text-center">
                        {isMatched ? (
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setRows((prev) =>
                                prev.map((item) =>
                                  item.rowKey === row.rowKey ? { ...item, selected: checked } : item
                                )
                              );
                            }}
                            className="w-4 h-4 accent-[#047857] cursor-pointer"
                            aria-label={`Selecionar ${row.matchedStudentName || row.rawName}`}
                          />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#b45309] mx-auto" />
                        )}
                      </td>
                      <td className="py-2.5 px-3 align-middle">
                        <span className="font-semibold text-[#111827] block">
                          {row.matchedStudentName || row.rawName}
                        </span>
                        {row.matchedStudentName &&
                          row.rawName &&
                          row.matchedStudentName.toUpperCase() !== row.rawName.toUpperCase() && (
                            <span className="text-[11px] text-[#48484a] block">
                              No .htm: {row.rawName}
                            </span>
                          )}
                      </td>
                      <td className="py-2.5 px-3 align-middle tabular-nums text-[#374151]">
                        <span className="font-medium block">
                          {row.matchedClassName || row.rawTurma}
                        </span>
                        <span className="text-[11px] text-[#48484a]">
                          RA {row.matchedStudentRa || row.rawRa}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        {isMatched ? (
                          <span className="px-2 py-0.5 rounded-md bg-[#eaf6ef] text-[#005035] text-[11px] font-semibold">
                            {row.matchConfidence === 'ra'
                              ? 'Por RA'
                              : row.matchConfidence === 'cpf'
                              ? 'Por CPF'
                              : 'Por Nome'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-[#fee2e2] text-[#991b1b] text-[11px] font-semibold">
                            Sem vínculo
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 align-middle text-[#374151]">
                        {row.currentDeficiencia || <span className="text-[#6b7280]">—</span>}
                      </td>
                      <td className="py-2.5 px-3 align-middle min-w-[260px]">
                        <input
                          type="text"
                          value={row.editedDeficiencia}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRows((prev) =>
                              prev.map((item) =>
                                item.rowKey === row.rowKey
                                  ? {
                                      ...item,
                                      editedDeficiencia: val,
                                      selected:
                                        item.matchStatus === 'matched' && val.trim().length > 0,
                                    }
                                  : item
                              )
                            );
                          }}
                          placeholder={
                            row.isClearSignal
                              ? 'Sem deficiência (limpar registro)'
                              : 'Deficiência / CID'
                          }
                          className="w-full min-h-[34px] px-2.5 rounded-lg bg-white text-xs text-[#111827] focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
