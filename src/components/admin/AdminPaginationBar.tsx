import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AdminPaginationBarProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  itemLabel?: string;
  onPageChange: (nextPage: number) => void;
}

export const AdminPaginationBar: React.FC<AdminPaginationBarProps> = ({
  currentPage,
  totalItems,
  pageSize,
  itemLabel = 'registros',
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 text-xs">
      <span className="text-slate-700 tabular-nums">
        Mostrando <strong className="text-slate-950">{startIdx}–{endIdx}</strong> de{' '}
        <strong className="text-slate-950">{totalItems}</strong> {itemLabel}
      </span>

      <div className="flex items-center gap-1.5 self-start sm:self-auto">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className="min-h-[36px] px-3 rounded-xl bg-[#edf2f7] hover:bg-[#dce7fb] hover:text-[#092e70] disabled:opacity-45 text-slate-900 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.97]"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Anterior</span>
        </button>

        <span className="px-3 py-1.5 rounded-xl bg-[#f4f7fb] font-semibold text-slate-950 tabular-nums shadow-[0_2px_8px_-2px_rgba(9,15,29,0.06)]">
          Página {safePage} de {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className="min-h-[36px] px-3 rounded-xl bg-[#edf2f7] hover:bg-[#dce7fb] hover:text-[#092e70] disabled:opacity-45 text-slate-900 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.97]"
        >
          <span>Próxima</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
