import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ClassGroup } from '../types';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import {
  clearSpecificClassPhotoCacheFromIndexedDb,
  clearStudentPhotoIndexedDbCache,
  inspectDetailedPhotoCacheUsage,
  PhotoCacheDetailedUsageReport,
  pruneLegacyClassPhotoCacheFromIndexedDb,
} from '../services/photoIndexedDbCache';
import { addSecurityAuditLog } from '../services/db';

interface IndexedDbPhotoStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  currentUserEmail?: string;
  onCacheUpdated?: (message: string) => void;
}

type ClassCacheFilter = 'all' | 'with_cache' | 'without_cache';

const formatStorageBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const normalizeSearch = (val?: string): string =>
  (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const IndexedDbPhotoStorageModal: React.FC<IndexedDbPhotoStorageModalProps> = ({
  isOpen,
  onClose,
  classes,
  currentUserEmail = '',
  onCacheUpdated,
}) => {
  const [report, setReport] = useState<PhotoCacheDetailedUsageReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPruningLegacy, setIsPruningLegacy] = useState(false);
  const [clearingClassId, setClearingClassId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<ClassCacheFilter>('all');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  useModalScrollLock(isOpen);

  const loadStorageReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await inspectDetailedPhotoCacheUsage(classes);
      setReport(next);
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Não foi possível inspecionar o armazenamento IndexedDB neste navegador.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [classes]);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmClearAll(false);
    setStatusBanner(null);
    void loadStorageReport();
  }, [isOpen, loadStorageReport]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handlePruneLegacyOneClick = async () => {
    if (isPruningLegacy) return;
    setIsPruningLegacy(true);
    setStatusBanner(null);
    try {
      const res = await pruneLegacyClassPhotoCacheFromIndexedDb(classes);
      await loadStorageReport();
      const totalRemoved = res.removedUrlRecords + res.removedBlobRecords;
      const msg =
        totalRemoved > 0
          ? `Cache de turmas antigas limpo: ${formatStorageBytes(res.freedBytes)} liberados (${res.removedBlobRecords} arquivo(s) e ${res.removedUrlRecords} índice(s) removidos).`
          : 'Nenhum resíduo de turmas antigas encontrado no cache local.';

      setStatusBanner({ type: totalRemoved > 0 ? 'success' : 'info', text: msg });
      if (totalRemoved > 0) {
        addSecurityAuditLog({
          userEmail: currentUserEmail || 'admin@escola',
          userName: 'Administrador Escolar',
          userRole: 'admin',
          eventType: 'SYSTEM_CONFIG_UPDATED',
          actionTitle: 'Limpeza de Cache IndexedDB (Turmas Antigas)',
          details: msg,
          targetResource: 'IndexedDB Photo Cache',
          severity: 'info',
        });
        onCacheUpdated?.(msg);
      }
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Falha ao limpar registros antigos do IndexedDB.',
      });
    } finally {
      setIsPruningLegacy(false);
    }
  };

  const handleClearSingleClass = async (classId: string, className: string) => {
    const targetCls = classes.find((c) => c.id === classId);
    if (!targetCls || clearingClassId) return;
    setClearingClassId(classId);
    setStatusBanner(null);
    try {
      const res = await clearSpecificClassPhotoCacheFromIndexedDb(targetCls, classes);
      await loadStorageReport();
      const msg = `Cache da turma ${className} limpo (${formatStorageBytes(res.freedBytes)} liberados).`;
      setStatusBanner({ type: 'success', text: msg });
      onCacheUpdated?.(msg);
    } catch {
      setStatusBanner({
        type: 'error',
        text: `Erro ao limpar cache da turma ${className}.`,
      });
    } finally {
      setClearingClassId(null);
    }
  };

  const handleClearAllCache = async () => {
    if (isClearingAll) return;
    setIsClearingAll(true);
    setConfirmClearAll(false);
    setStatusBanner(null);
    try {
      const prevBytes = report?.totalCachedBytes || 0;
      await clearStudentPhotoIndexedDbCache();
      await loadStorageReport();
      const msg = `Todo o cache local de fotos IndexedDB foi zerado (${formatStorageBytes(prevBytes)} liberados).`;
      setStatusBanner({ type: 'success', text: msg });
      addSecurityAuditLog({
        userEmail: currentUserEmail || 'admin@escola',
        userName: 'Administrador Escolar',
        userRole: 'admin',
        eventType: 'SYSTEM_CONFIG_UPDATED',
        actionTitle: 'Limpeza Total do Cache IndexedDB de Fotos',
        details: msg,
        targetResource: 'IndexedDB Photo Cache',
        severity: 'warning',
      });
      onCacheUpdated?.(msg);
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Erro ao limpar completamente o IndexedDB de fotos.',
      });
    } finally {
      setIsClearingAll(false);
    }
  };

  const filteredClasses = useMemo(() => {
    const rows = report?.classBreakdown || [];
    const q = normalizeSearch(searchTerm);
    return rows
      .filter((r) => {
        if (filterMode === 'with_cache' && r.cachedStudentsCount === 0 && r.cachedBytes === 0) {
          return false;
        }
        if (filterMode === 'without_cache' && (r.cachedStudentsCount > 0 || r.cachedBytes > 0)) {
          return false;
        }
        if (q) {
          return (
            normalizeSearch(r.className).includes(q) ||
            normalizeSearch(r.turmaAbrev).includes(q) ||
            normalizeSearch(r.shift).includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.cachedBytes - a.cachedBytes || b.cachedStudentsCount - a.cachedStudentsCount);
  }, [report?.classBreakdown, searchTerm, filterMode]);

  if (!isOpen) return null;

  const totalBytes = report?.totalCachedBytes || 0;
  const maxBytes = report?.maxBudgetBytes || 140 * 1024 * 1024;
  const activeBytes = report?.activeClassesBytes || 0;
  const legacyBytes = report?.legacyBytes || 0;
  const legacyItemsCount =
    (report?.legacyUrlRecordsCount || 0) + (report?.legacyBlobRecordsCount || 0);
  const hasLegacyCache = legacyItemsCount > 0 || legacyBytes > 0;

  const activePct = Math.min(100, Math.round((activeBytes / maxBytes) * 100));
  const legacyPct = Math.min(100 - activePct, Math.round((legacyBytes / maxBytes) * 100));
  const totalBudgetPct = Math.min(100, Math.round((totalBytes / maxBytes) * 100));

  return (
    <div
      className="fixed inset-0 z-[130] bg-slate-950/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-2 sm:p-4 animate-gentle-fade"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Armazenamento IndexedDB de Fotos"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[min(92vh,calc(100dvh-1rem))] text-[#111827]"
      >
        {/* Cabeçalho */}
        <div className="flex items-start sm:items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-200/80 shrink-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#f2f2f7] text-[#0b3b8c] flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-[#111827] leading-snug">
                Armazenamento IndexedDB · Cache de Fotos
              </h2>
              <p className="text-xs text-[#48484a] leading-relaxed mt-0.5">
                Uso local offline de fotos compactadas via Canvas WebP e limpeza rápida de turmas antigas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadStorageReport()}
              disabled={isLoading}
              className="min-h-[38px] px-3 rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar modal de armazenamento"
              className="w-9 h-9 rounded-full bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] flex items-center justify-center cursor-pointer transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conteúdo rolável */}
        <div className="modal-scroll-body flex-1 p-4 sm:p-6 space-y-5 overflow-y-auto">
          {statusBanner && (
            <div
              role="status"
              className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
                statusBanner.type === 'success'
                  ? 'bg-[#eaf6ef] text-[#005035]'
                  : statusBanner.type === 'error'
                  ? 'bg-[#fee2e2] text-[#991b1b]'
                  : 'bg-[#e8f0fe] text-[#1a4fa3]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="break-words">{statusBanner.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Indicadores Principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#f5f5f7] min-w-0">
              <span className="text-xs font-medium text-[#48484a] block">Uso IndexedDB (Fotos)</span>
              <span className="text-xl sm:text-2xl font-semibold text-[#111827] font-mono tabular-nums block mt-0.5">
                {isLoading && !report ? '...' : formatStorageBytes(totalBytes)}
              </span>
              <span className="text-xs text-[#6e6e73] tabular-nums block mt-0.5">
                {totalBudgetPct}% do limite ({formatStorageBytes(maxBytes)})
              </span>
            </div>

            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#f5f5f7] min-w-0">
              <span className="text-xs font-medium text-[#48484a] block">Arquivos em Cache</span>
              <span className="text-xl sm:text-2xl font-semibold text-[#111827] font-mono tabular-nums block mt-0.5">
                {isLoading && !report ? '...' : (report?.canonicalBlobsCount || 0).toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#6e6e73] tabular-nums block mt-0.5">
                {(report?.urlRecordsCount || 0).toLocaleString('pt-BR')} índices nominais
              </span>
            </div>

            <div
              className={`p-3.5 sm:p-4 rounded-2xl min-w-0 ${
                hasLegacyCache ? 'bg-[#fef3c7]' : 'bg-[#eaf6ef]'
              }`}
            >
              <span
                className={`text-xs font-medium block ${
                  hasLegacyCache ? 'text-[#92400e]' : 'text-[#005035]'
                }`}
              >
                Turmas Antigas / Órfãs
              </span>
              <span
                className={`text-xl sm:text-2xl font-semibold font-mono tabular-nums block mt-0.5 ${
                  hasLegacyCache ? 'text-[#92400e]' : 'text-[#047857]'
                }`}
              >
                {isLoading && !report ? '...' : formatStorageBytes(legacyBytes)}
              </span>
              <span
                className={`text-xs tabular-nums block mt-0.5 ${
                  hasLegacyCache ? 'text-[#78350f]' : 'text-[#005035]'
                }`}
              >
                {hasLegacyCache
                  ? `${legacyItemsCount.toLocaleString('pt-BR')} registro(s) removíveis`
                  : 'Nenhum resíduo antigo'}
              </span>
            </div>

            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#f5f5f7] min-w-0">
              <span className="text-xs font-medium text-[#48484a] block">Economia SHA-256</span>
              <span className="text-xl sm:text-2xl font-semibold text-[#047857] font-mono tabular-nums block mt-0.5">
                {isLoading && !report ? '...' : (report?.deduplicatedAliasCount || 0).toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#6e6e73] tabular-nums block mt-0.5">
                {report?.browserEstimateUsageBytes !== undefined && report?.browserEstimateQuotaBytes
                  ? `Navegador: ${formatStorageBytes(report.browserEstimateUsageBytes)} / ${formatStorageBytes(report.browserEstimateQuotaBytes)}`
                  : 'Ponteiros sem duplicação'}
              </span>
            </div>
          </div>

          {/* Barra visual de distribuição e Ação Principal em 1 Clique */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[#111827]">
                  Ocupação do Cache Local (Limite 2.000+ fotos / 140 MB)
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#48484a] tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#0b3b8c] inline-block" />
                    Turmas Atuais: {formatStorageBytes(activeBytes)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#d97706] inline-block" />
                    Turmas Antigas / Órfãs: {formatStorageBytes(legacyBytes)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePruneLegacyOneClick}
                  disabled={isPruningLegacy || isLoading}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    hasLegacyCache
                      ? 'bg-[#0b3b8c] hover:bg-[#082d6b] text-white'
                      : 'bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827]'
                  }`}
                >
                  {isPruningLegacy ? (
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {isPruningLegacy
                      ? 'Limpando...'
                      : 'Limpar Cache de Turmas Antigas'}
                  </span>
                </button>

                {!confirmClearAll ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    disabled={isClearingAll || totalBytes === 0 && (report?.urlRecordsCount || 0) === 0}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-45"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Zerar Cache Completo</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleClearAllCache}
                      disabled={isClearingAll}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isClearingAll ? 'Zerando...' : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#f2f2f7] text-[#111827] text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
              {activePct > 0 && (
                <div
                  className="h-full bg-[#0b3b8c] transition-all duration-300"
                  style={{ width: `${Math.max(1, activePct)}%` }}
                  title={`Turmas Atuais: ${formatStorageBytes(activeBytes)}`}
                />
              )}
              {legacyPct > 0 && (
                <div
                  className="h-full bg-[#d97706] transition-all duration-300"
                  style={{ width: `${Math.max(1, legacyPct)}%` }}
                  title={`Turmas Antigas / Órfãs: ${formatStorageBytes(legacyBytes)}`}
                />
              )}
            </div>
          </div>

          {/* Destaque direto para remoção de Turmas Antigas se houver resíduos */}
          {hasLegacyCache && (
            <div className="p-4 rounded-2xl bg-[#fef3c7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#78350f]">
                  Registros de Turmas Antigas / Ex-alunos Detectados
                </p>
                <p className="text-xs text-[#92400e] tabular-nums">
                  {report?.legacyUrlRecordsCount || 0} índice(s) e {report?.legacyBlobRecordsCount || 0} registro(s) de mídia ({formatStorageBytes(legacyBytes)}) não pertencem mais às {classes.length} turmas ativas.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePruneLegacyOneClick}
                disabled={isPruningLegacy}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#92400e] hover:bg-[#78350f] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Limpar em 1 Clique</span>
              </button>
            </div>
          )}

          {/* Lista por Turma */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#48484a] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar turma ou turno..."
                  className="w-full min-h-[42px] pl-10 pr-8 rounded-xl bg-[#f5f5f7] text-xs sm:text-sm text-[#111827] placeholder:text-[#6e6e73] focus:outline-none focus:bg-[#ededf0]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#48484a] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#f5f5f7] rounded-xl shrink-0">
                {(
                  [
                    { id: 'all', label: `Todas (${report?.classBreakdown.length || classes.length})` },
                    {
                      id: 'with_cache',
                      label: `Com Cache (${(report?.classBreakdown || []).filter((c) => c.cachedBytes > 0 || c.cachedStudentsCount > 0).length})`,
                    },
                    {
                      id: 'without_cache',
                      label: `Sem Cache (${(report?.classBreakdown || []).filter((c) => c.cachedBytes === 0 && c.cachedStudentsCount === 0).length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterMode(tab.id)}
                    className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      filterMode === tab.id
                        ? 'bg-white text-[#111827] shadow-2xs font-semibold'
                        : 'text-[#48484a] hover:text-[#111827]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredClasses.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#f5f5f7] text-center space-y-1.5">
                <Database className="w-6 h-6 text-[#6e6e73] mx-auto" />
                <p className="text-sm font-semibold text-[#111827]">
                  Nenhuma turma encontrada neste filtro
                </p>
                <p className="text-xs text-[#6e6e73]">
                  Ajuste a busca ou o filtro acima para visualizar as turmas.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f5f5f7] text-[#374151] font-semibold sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3.5">Turma</th>
                        <th className="py-2.5 px-3.5">Turno</th>
                        <th className="py-2.5 px-3.5 text-right">Cobertura</th>
                        <th className="py-2.5 px-3.5 text-right">Tamanho</th>
                        <th className="py-2.5 px-3.5 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClasses.map((row, idx) => {
                        const isClearingThis = clearingClassId === row.classId;
                        const hasData = row.cachedBytes > 0 || row.cachedStudentsCount > 0;
                        return (
                          <tr
                            key={row.classId}
                            className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f9f9fb]'}
                          >
                            <td className="py-2.5 px-3.5 font-semibold text-[#111827]">
                              {row.className}
                            </td>
                            <td className="py-2.5 px-3.5 text-[#48484a]">
                              {row.shift.replace('Turno ', '') || '—'}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-[#111827]">
                              {row.cachedStudentsCount}/{row.totalStudents}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-medium text-[#111827]">
                              {formatStorageBytes(row.cachedBytes)}
                            </td>
                            <td className="py-2.5 px-3.5 text-right">
                              <button
                                type="button"
                                disabled={!hasData || isClearingThis}
                                onClick={() => handleClearSingleClass(row.classId, row.className)}
                                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#f2f2f7] hover:bg-[#fee2e2] hover:text-[#991b1b] text-[#111827] text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                              >
                                <Trash2 className="w-3 h-3 shrink-0" />
                                <span>{isClearingThis ? 'Limpando...' : 'Limpar'}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
