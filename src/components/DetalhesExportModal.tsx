import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUp,
  Download,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { ClassGroup } from '../types';
import {
  CLASS_EXPORT_COLUMNS,
  CLASS_EXPORT_PRESETS,
  ClassExportCategory,
  ClassExportSortOrder,
  ClassExportStatusFilter,
  DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  buildCustomClassExportPreview,
} from '../services/db';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { ModalPortal } from './ui/ModalPortal';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface DetalhesExportModalProps {
  isOpen: boolean;
  classGroup: ClassGroup;
  totalAtivos: number;
  totalMovimentados: number;
  totalAlertaLegal: number;
  minLegalPresence: number;
  selectedColumnIds: string[];
  exportSortBy: ClassExportSortOrder;
  exportStatusFilter: ClassExportStatusFilter;
  includeSummarySheet: boolean;
  exportFileFormat: 'xls' | 'xlsx';
  onSaveSelectedColumns: (nextCols: string[]) => void;
  onChangeSortBy: (next: ClassExportSortOrder) => void;
  onChangeStatusFilter: (next: ClassExportStatusFilter) => void;
  onChangeIncludeSummarySheet: (next: boolean) => void;
  onChangeFileFormat: (next: 'xls' | 'xlsx') => void;
  onExecuteDownload: () => void;
  onClose: () => void;
}

const EXPORT_CATEGORIES: ClassExportCategory[] = [
  'Identificação & Matrícula',
  'Filiação (Mãe e Pai) & Contatos',
  'Frequência, Presença & Faltas',
  'Documentos, Saúde & AEE',
  'Endereço',
  'Outros Campos SED',
];

export const DetalhesExportModal: React.FC<DetalhesExportModalProps> = ({
  isOpen,
  classGroup,
  totalAtivos,
  totalMovimentados,
  totalAlertaLegal,
  minLegalPresence,
  selectedColumnIds,
  exportSortBy,
  exportStatusFilter,
  includeSummarySheet,
  exportFileFormat,
  onSaveSelectedColumns,
  onChangeSortBy,
  onChangeStatusFilter,
  onChangeIncludeSummarySheet,
  onChangeFileFormat,
  onExecuteDownload,
  onClose,
}) => {
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  useModalScrollLock(isOpen);

  const availableColumnsFiltered = useMemo(() => {
    const qCol = columnSearchTerm.toLowerCase().trim();
    return CLASS_EXPORT_COLUMNS.filter((col) => {
      const matchesCat =
        activeCategoryFilter === 'all' || col.category === activeCategoryFilter;
      const matchesText =
        qCol === '' ||
        col.label.toLowerCase().includes(qCol) ||
        col.shortLabel.toLowerCase().includes(qCol) ||
        col.category.toLowerCase().includes(qCol);
      return matchesCat && matchesText;
    });
  }, [columnSearchTerm, activeCategoryFilter]);

  const selectedColDefs = useMemo(
    () =>
      selectedColumnIds
        .map((id) => CLASS_EXPORT_COLUMNS.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [selectedColumnIds]
  );

  const previewData = useMemo(
    () =>
      buildCustomClassExportPreview(
        classGroup,
        {
          columnIds: selectedColumnIds,
          sortBy: exportSortBy,
          statusFilter: exportStatusFilter,
          includeSummarySheet,
          fileFormat: exportFileFormat,
        },
        OFFICIAL_OCTOBER_DAYS
      ),
    [classGroup, selectedColumnIds, exportSortBy, exportStatusFilter, includeSummarySheet, exportFileFormat]
  );

  if (!isOpen) return null;

  const handleToggleColumn = (colId: string) => {
    if (selectedColumnIds.includes(colId)) {
      if (selectedColumnIds.length <= 1) return;
      onSaveSelectedColumns(selectedColumnIds.filter((id) => id !== colId));
    } else {
      onSaveSelectedColumns([...selectedColumnIds, colId]);
    }
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const next = [...selectedColumnIds];
    const [removed] = next.splice(index, 1);
    if (direction === 'up' && index > 0) {
      next.splice(index - 1, 0, removed);
    } else if (direction === 'down' && index < selectedColumnIds.length - 1) {
      next.splice(index + 1, 0, removed);
    } else if (direction === 'top') {
      next.unshift(removed);
    } else if (direction === 'bottom') {
      next.push(removed);
    } else {
      return;
    }
    onSaveSelectedColumns(next);
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-xs overflow-hidden animate-backdrop-in"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="modal-shell bg-[#eef3f9] w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] animate-apple-pop"
        >
        {/* Cabeçalho do Modal de Exportação .XLS */}
        <div className="modal-header-surface bg-white px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl surface-secondary text-[#0f172a] flex items-center justify-center shrink-0">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[12px] tracking-[-0.006em] text-slate-700 tabular-nums">
                <span className="font-semibold uppercase tracking-[0.03em]">
                  .{exportFileFormat}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {selectedColDefs.length} colunas · {previewData.rows.length} estudantes
                </span>
              </div>
              <h2 className="text-[18px] sm:text-[20px] font-semibold text-[#0f172a] tracking-[-0.022em] leading-tight mt-0.5 break-words">
                Exportação · {classGroup.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExecuteDownload}
              className="min-h-[40px] px-4 rounded-2xl bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-[13px] tracking-[-0.01em] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-[18px] h-[18px]" />
              <span>Baixar .{exportFileFormat.toUpperCase()}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-2xl bg-[#f1f5f9] text-[#475569] hover:text-[#0f172a] hover:bg-[#e2e8f0] flex items-center justify-center cursor-pointer transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo Principal Rolável */}
        <div className="flex-1 min-h-0 modal-scroll-body p-4 sm:p-5 space-y-4">
          {/* 1. Modelos Rápidos */}
          <div className="bg-white rounded-2xl p-4 space-y-2.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.03em] text-[#334155]">
                Modelos de Colunas
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSaveSelectedColumns(CLASS_EXPORT_COLUMNS.map((c) => c.id))}
                  className="px-2.5 py-1 rounded-xl bg-[#ecfdf5] hover:bg-[#d1fae5] text-[#047857] font-semibold text-[12px] cursor-pointer"
                >
                  Todas ({CLASS_EXPORT_COLUMNS.length})
                </button>
                <button
                  type="button"
                  onClick={() => onSaveSelectedColumns(DEFAULT_CLASS_EXPORT_COLUMN_IDS)}
                  className="px-2.5 py-1 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[12px] cursor-pointer"
                >
                  Padrão
                </button>
                <button
                  type="button"
                  onClick={() => onSaveSelectedColumns(['numeroChamada', 'estudante'])}
                  className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-[12px] cursor-pointer"
                >
                  Mínimo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {CLASS_EXPORT_PRESETS.map((preset) => {
                const isCurrentPreset =
                  preset.columnIds.length === selectedColumnIds.length &&
                  preset.columnIds.every((id, idx) => selectedColumnIds[idx] === id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSaveSelectedColumns(preset.columnIds)}
                    className={`p-3 rounded-2xl text-left transition-colors cursor-pointer flex flex-col justify-between gap-1 ${
                      isCurrentPreset
                        ? 'bg-[#e8f0fe] text-[#14428c]'
                        : 'bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#0f172a]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-[13px] tracking-[-0.01em]">
                        {preset.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-white/80 text-[#334155] font-semibold text-[11px] tabular-nums">
                        {preset.columnIds.length}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-700 break-words leading-snug">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Ordenação, Filtro e Formato */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-3.5 space-y-1 shadow-2xs">
              <label className="text-[11px] font-semibold uppercase tracking-[0.03em] text-slate-700 block">
                Ordenação
              </label>
              <select
                value={exportSortBy}
                onChange={(e) => onChangeSortBy(e.target.value as ClassExportSortOrder)}
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f1f5f9] text-[13px] font-semibold text-slate-950"
              >
                <option value="number_asc">Nº da Chamada (01, 02...)</option>
                <option value="name_asc">Alfabética (A → Z)</option>
                <option value="name_desc">Alfabética (Z → A)</option>
                <option value="absences_desc">Maior Falta primeiro</option>
                <option value="presence_asc">Menor % Presença</option>
              </select>
            </div>

            <div className="bg-white rounded-2xl p-3.5 space-y-1 shadow-2xs">
              <label className="text-[11px] font-semibold uppercase tracking-[0.03em] text-slate-700 block">
                Estudantes
              </label>
              <select
                value={exportStatusFilter}
                onChange={(e) => onChangeStatusFilter(e.target.value as ClassExportStatusFilter)}
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f1f5f9] text-[13px] font-semibold text-slate-950"
              >
                <option value="all">Todos ({classGroup.students.length})</option>
                <option value="ativos">Ativos ({totalAtivos})</option>
                <option value="movimentados">Movimentados ({totalMovimentados})</option>
                <option value="alerta">
                  Em Alerta &lt;{minLegalPresence}% ({totalAlertaLegal})
                </option>
              </select>
            </div>

            <div className="bg-white rounded-2xl p-3.5 space-y-1 shadow-2xs">
              <label className="text-[11px] font-semibold uppercase tracking-[0.03em] text-slate-700 block">
                Formato
              </label>
              <div className="ios-segmented w-full flex">
                <button
                  type="button"
                  onClick={() => onChangeFileFormat('xls')}
                  className={`flex-1 ios-segmented-item text-center ${
                    exportFileFormat === 'xls' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  .XLS
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFileFormat('xlsx')}
                  className={`flex-1 ios-segmented-item text-center ${
                    exportFileFormat === 'xlsx' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  .XLSX
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-3.5 flex items-center justify-between gap-2 shadow-2xs">
              <div>
                <span className="text-[13px] font-semibold text-slate-950 block">Aba Resumo</span>
                <span className="text-[12px] text-slate-700 block">
                  Totais e presença da turma
                </span>
              </div>
              <input
                type="checkbox"
                checked={includeSummarySheet}
                onChange={(e) => onChangeIncludeSummarySheet(e.target.checked)}
                className="w-5 h-5 accent-[#14428c] rounded cursor-pointer"
              />
            </div>
          </div>

          {/* 3. Grade Dupla: Campos e Ordem */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 bg-white rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-[#0f172a] tracking-[-0.015em]">
                  Campos disponíveis ({CLASS_EXPORT_COLUMNS.length})
                </h3>

                <div className="relative w-full sm:w-56">
                  <Search className="w-4 h-4 text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={columnSearchTerm}
                    onChange={(e) => setColumnSearchTerm(e.target.value)}
                    placeholder="Buscar campo..."
                    className="w-full min-h-[38px] pl-8 pr-2.5 rounded-xl bg-[#f3f6fb] text-[13px] font-normal text-slate-950 placeholder:text-slate-600 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('all')}
                  className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] font-semibold whitespace-nowrap cursor-pointer ${
                    activeCategoryFilter === 'all'
                      ? 'bg-[#14428c] text-white'
                      : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
                  }`}
                >
                  Todas
                </button>
                {EXPORT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategoryFilter(cat)}
                    className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] font-semibold whitespace-nowrap cursor-pointer ${
                      activeCategoryFilter === cat
                        ? 'bg-[#14428c] text-white'
                        : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[310px] overflow-y-auto pr-1">
                {availableColumnsFiltered.map((col) => {
                  const isChecked = selectedColumnIds.includes(col.id);
                  const orderPos = selectedColumnIds.indexOf(col.id);
                  return (
                    <label
                      key={col.id}
                      className={`p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer select-none transition-colors min-w-0 ${
                        isChecked
                          ? 'bg-[#e8f0fe] text-[#14428c]'
                          : 'bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#475569]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleColumn(col.id)}
                          className="w-4 h-4 accent-[#14428c] rounded cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-[12.5px] block break-words leading-snug text-[#0f172a]">
                            {col.shortLabel}
                          </span>
                          <span className="text-[11px] text-slate-700 block break-words leading-snug">
                            {col.label}
                          </span>
                        </div>
                      </div>

                      {isChecked && (
                        <span className="px-2 py-0.5 rounded-lg bg-[#14428c] text-white font-semibold text-[11px] tabular-nums shrink-0">
                          {orderPos + 1}ª
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white rounded-2xl p-4 space-y-3 shadow-2xs">
              <div>
                <h3 className="text-[14px] font-semibold text-slate-950 tracking-[-0.015em]">
                  Ordem ({selectedColDefs.length})
                </h3>
                <p className="text-[12px] text-slate-700">
                  Arraste ou use as setas para reordenar
                </p>
              </div>

              <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                {selectedColDefs.map((col, idx) => (
                  <div
                    key={col.id}
                    draggable
                    onDragStart={() => setDraggedColIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedColIndex === null || draggedColIndex === idx) return;
                      const next = [...selectedColumnIds];
                      const [moved] = next.splice(draggedColIndex, 1);
                      next.splice(idx, 0, moved);
                      onSaveSelectedColumns(next);
                      setDraggedColIndex(null);
                    }}
                    className="p-2.5 rounded-xl bg-[#f3f6fb] hover:bg-[#eef3f9] flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing min-w-0"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-7 h-7 rounded-lg bg-[#14428c] text-white font-semibold text-[12px] tabular-nums flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-[12.5px] text-slate-950 block break-words leading-snug">
                          {col.shortLabel}
                        </span>
                        <span className="text-[11px] text-slate-700 block break-words leading-snug">
                          {col.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveColumn(idx, 'top')}
                        title="Mover para 1ª"
                        className="w-8 h-8 rounded-lg bg-white hover:bg-[#e8f0fe] text-[#0f172a] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronsUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveColumn(idx, 'up')}
                        title="Subir"
                        className="w-8 h-8 rounded-lg bg-white hover:bg-[#e8f0fe] text-[#0f172a] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === selectedColDefs.length - 1}
                        onClick={() => handleMoveColumn(idx, 'down')}
                        title="Descer"
                        className="w-8 h-8 rounded-lg bg-white hover:bg-[#e8f0fe] text-[#0f172a] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={selectedColDefs.length <= 1}
                        onClick={() => handleToggleColumn(col.id)}
                        title="Remover"
                        className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Pré-visualização */}
          <div className="bg-white rounded-2xl p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.03em] text-[#334155]">
                Prévia (.{exportFileFormat.toUpperCase()})
              </span>
              <span className="text-[12px] font-medium text-slate-700 tabular-nums">
                {previewData.rows.length} linhas × {previewData.headers.length} colunas
              </span>
            </div>

            <div className="rounded-xl overflow-x-auto bg-[#f3f6fb]">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#0f3370] text-white font-semibold uppercase whitespace-nowrap">
                  <tr>
                    {previewData.headers.map((h, i) => (
                      <th key={`${h}-${i}`} className="py-2 px-2.5">
                        <span className="text-sky-200 mr-1 tabular-nums">{i + 1}.</span>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="whitespace-nowrap">
                  {previewData.rows.slice(0, 4).map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={rIdx % 2 === 0 ? 'bg-white' : 'bg-[#f3f6fb]'}
                    >
                      {previewData.headers.map((h, cIdx) => (
                        <td
                          key={`${rIdx}-${cIdx}`}
                          className="py-1.5 px-2.5 text-slate-950 font-medium max-w-[220px] truncate"
                        >
                          {String(row[h] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="bg-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] text-slate-700 font-medium tabular-nums">
            Relatorio_{classGroup.name.replace(/\s+/g, '_')}_2027.{exportFileFormat}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onExecuteDownload}
              className="min-h-[40px] px-5 rounded-2xl bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-[13px] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-[18px] h-[18px]" />
              <span>
                Baixar .{exportFileFormat.toUpperCase()} ({selectedColDefs.length})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
