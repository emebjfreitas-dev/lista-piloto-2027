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
  userRole = 'admin',
  onOpenConfigDaysModal,
  onNavigateToSheet,
  onBack,
}) => {
  const savedSheet = getSavedSpreadsheetInfo();
  const isAdmin = userRole === 'admin';

  return (
    <div className="flex flex-col w-full max-w-[1100px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {/* Breadcrumb Limpo */}
      <div className="flex items-center justify-between text-xs text-slate-500 py-0.5">
        <div className="flex items-center gap-1.5">
          {onBack && (
            <>
              <button
                type="button"
                onClick={onBack}
                className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Voltar</span>
              </button>
              <span className="text-slate-300">/</span>
            </>
          )}
          <span className="font-semibold text-slate-800">200 Dias Letivos</span>
        </div>
        <span className="text-slate-400 text-xs hidden sm:inline">
          Calendário Escolar Oficial 2027
        </span>
      </div>

      <section className="bg-white p-5 sm:p-6 space-y-4 rounded-xl border border-slate-200/90">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium">
              <span className="material-symbols-outlined text-[15px]">calendar_month</span>
              Calendário Oficial 2027 · SME Jundiaí
            </span>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight leading-tight">
              Listagem de Dias Letivos (200 Dias)
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl leading-normal">
              Controle anual dos 200 dias letivos e meses específicos de {SCHOOL_NAME} ({CITY_NAME}).
              Totalmente integrado com o estado das turmas no <strong>Firebase Firestore</strong> e na aba oficial <span className="font-mono font-medium text-slate-900">Dias_Letivos_SME_2027</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenConfigDaysModal && (
              <button
                type="button"
                onClick={onOpenConfigDaysModal}
                className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                <span>Configurar Dias &amp; Meses</span>
              </button>
            )}

            <a
              href={savedSheet.fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors border border-slate-200"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              <span>Abrir na Planilha ↗</span>
            </a>
          </div>
        </div>

        {/* Resumo dos 200 Dias Letivos */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">
              Referência Anual na Planilha ({TOTAL_ANNUAL_SCHOOL_DAYS} Dias Letivos)
            </span>
            <button
              type="button"
              onClick={onNavigateToSheet}
              className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
            >
              Ver sincronização no app →
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2 text-center">
            {MONTHLY_SCHOOL_DAYS_2027.map((m) => (
              <div
                key={m.month}
                className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80"
              >
                <span className="text-xs text-slate-500 block truncate">
                  {m.month.substring(0, 3)}
                </span>
                <span className="text-base font-semibold text-slate-900 block font-mono tabular-nums mt-0.5">
                  {m.schoolDays}d
                </span>
              </div>
            ))}
            <div className="p-2.5 rounded-lg bg-slate-900 text-white font-medium">
              <span className="text-[11px] block opacity-80">TOTAL</span>
              <span className="text-base font-semibold block font-mono tabular-nums mt-0.5">
                {TOTAL_ANNUAL_SCHOOL_DAYS}d
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
