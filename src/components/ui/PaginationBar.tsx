import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  itemLabel?: string;
  tone?: 'light' | 'dark';
  extraAction?: React.ReactNode;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'registros',
  tone = 'light',
  extraAction,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  if (totalItems <= pageSize && !extraAction) {
    return null;
  }

  const isDark = tone === 'dark';

  // Gera até 5 números de página com foco na página atual
  const pageNumbers: number[] = [];
  const maxVisible = 5;
  let startPage = Math.max(1, safePage - 2);
  const endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  for (let p = startPage; p <= endPage; p++) {
    pageNumbers.push(p);
  }

  return (
    <div
      className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 min-w-0 ${
        isDark
          ? 'bg-white/10 text-white'
          : 'bg-white text-slate-950 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs tabular-nums min-w-0">
        <span className={isDark ? 'text-slate-200 font-medium' : 'text-slate-700 font-medium'}>
          Mostrando{' '}
          <strong className={isDark ? 'text-white' : 'text-slate-950'}>
            {startIdx}–{endIdx}
          </strong>{' '}
          de{' '}
          <strong className={isDark ? 'text-white' : 'text-slate-950'}>
            {totalItems}
          </strong>{' '}
          {itemLabel}
        </span>
        {totalPages > 1 && (
          <span
            className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
              isDark ? 'bg-white/15 text-white' : 'bg-[#eef3f9] text-slate-800'
            }`}
          >
            Pág. {safePage}/{totalPages}
          </span>
        )}
        {extraAction}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-center">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Página anterior"
            className={`min-h-[38px] px-2.5 sm:px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:pointer-events-none transition-colors ${
              isDark
                ? 'bg-white/15 hover:bg-white/25 text-white'
                : 'bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-950'
            }`}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>Anterior</span>
          </button>

          <div className="hidden min-[420px]:flex items-center gap-1">
            {pageNumbers.map((pageNum) => {
              const isActive = pageNum === safePage;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  aria-label={`Página ${pageNum}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`min-w-[36px] min-h-[36px] px-2 rounded-xl text-xs font-bold tabular-nums cursor-pointer transition-colors ${
                    isActive
                      ? isDark
                        ? 'bg-white text-slate-950'
                        : 'bg-[#14428c] text-white'
                      : isDark
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : 'bg-[#f3f6fb] hover:bg-[#e2e8f0] text-slate-800'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Próxima página"
            className={`min-h-[38px] px-2.5 sm:px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:pointer-events-none transition-colors ${
              isDark
                ? 'bg-white/15 hover:bg-white/25 text-white'
                : 'bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-950'
            }`}
          >
            <span>Próxima</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
};
