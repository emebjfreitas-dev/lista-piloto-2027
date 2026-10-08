import React from 'react';
import { UserRole } from '../types';
import {
  MONTHLY_SCHOOL_DAYS_2027,
  TOTAL_ANNUAL_SCHOOL_DAYS,
  SCHOOL_NAME,
  CITY_NAME,
} from '../data/mockData';
import { getSavedSpreadsheetInfo } from '../services/googleSheetsApi';

interface DiasLetivosScreenProps {
  userRole?: UserRole;
  onOpenConfigDaysModal?: () => void;
  onNavigateToSheet: () => void;
  onBack: () => void;
}

export const DiasLetivosScreen: React.FC<DiasLetivosScreenProps> = ({
  onNavigateToSheet,
}) => {
  const savedSheet = getSavedSpreadsheetInfo();

  return (
    <div className="flex flex-col w-full max-w-[1100px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      <section className="card-welcoming bg-white p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0071e3]/10 text-[#0066cc] text-[0.72rem] font-bold uppercase tracking-wider">
              <span className="material-symbols-outlined text-[15px]">table_chart</span>
              Gestão Manual Direta na Planilha Oficial
            </span>
            <h1 className="text-[1.45rem] sm:text-[1.75rem] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Listagem de Dias Letivos (200 Dias)
            </h1>
            <p className="text-[0.86rem] text-[#6e6e73] max-w-2xl">
              A listagem e o controle dos dias letivos de {SCHOOL_NAME} ({CITY_NAME}) são realizados exclusivamente de forma manual na própria Planilha Google oficial (<span className="font-mono font-semibold text-[#1d1d1f]">Dias_Letivos_SME_2027</span>) e sincronizados instantaneamente com o aplicativo.
            </p>
          </div>

          <a
            href={savedSheet.fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[46px] px-5 py-2.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[0.84rem] inline-flex items-center justify-center gap-2 shrink-0 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            <span>Editar Dias Letivos na Planilha ↗</span>
          </a>
        </div>

        {/* Resumo dos 200 Dias Letivos */}
        <div className="pt-4 border-t border-black/[0.05] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.8rem] font-bold text-[#1d1d1f]">
              Referência Anual na Planilha ({TOTAL_ANNUAL_SCHOOL_DAYS} Dias Letivos)
            </span>
            <button
              type="button"
              onClick={onNavigateToSheet}
              className="text-[0.78rem] font-semibold text-[#0066cc] hover:underline cursor-pointer"
            >
              Ver sincronização no app →
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2 text-center">
            {MONTHLY_SCHOOL_DAYS_2027.map((m) => (
              <div
                key={m.month}
                className="p-3 rounded-2xl bg-[#f5f5f7]"
              >
                <span className="text-[0.68rem] font-semibold text-[#6e6e73] block truncate">
                  {m.month.substring(0, 3)}
                </span>
                <span className="text-[1.05rem] font-extrabold text-[#1d1d1f] block tabular-nums mt-0.5">
                  {m.schoolDays}d
                </span>
              </div>
            ))}
            <div className="p-3 rounded-2xl bg-[#1d1d1f] text-white font-bold">
              <span className="text-[0.65rem] block opacity-80">TOTAL</span>
              <span className="text-[1.05rem] block tabular-nums mt-0.5">
                {TOTAL_ANNUAL_SCHOOL_DAYS}d
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
