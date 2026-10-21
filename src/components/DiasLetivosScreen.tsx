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
      {/* Botão Voltar Didático e Visível */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-black text-sm flex items-center gap-2 border-2 border-slate-300 shadow-xs cursor-pointer active:scale-98 transition-all"
        >
          <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
          <span>Voltar para Minha Turma</span>
        </button>
        <span className="text-xs sm:text-sm font-bold text-slate-500">
          Calendário Escolar • 200 Dias Letivos
        </span>
      </div>

      <section className="card-welcoming bg-white p-6 sm:p-8 space-y-5 rounded-3xl border border-[#003440]/10 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#005035]/10 text-[#005035] text-[0.72rem] font-bold uppercase tracking-wider">
              <span className="material-symbols-outlined text-[15px]">calendar_month</span>
              Calendário Oficial 2027 · SME Jundiaí
            </span>
            <h1 className="text-[1.45rem] sm:text-[1.75rem] font-black text-[#003440] tracking-tight leading-tight">
              Listagem de Dias Letivos (200 Dias)
            </h1>
            <p className="text-[0.86rem] text-[#436370] max-w-2xl">
              Controle anual dos 200 dias letivos e meses específicos de {SCHOOL_NAME} ({CITY_NAME}).
              Totalmente integrado com o estado das turmas no <strong>Firebase Firestore</strong> e na aba oficial <span className="font-mono font-semibold text-[#003440]">Dias_Letivos_SME_2027</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenConfigDaysModal && (
              <button
                type="button"
                onClick={onOpenConfigDaysModal}
                className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.84rem] inline-flex items-center justify-center gap-2 shrink-0 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">tune</span>
                <span>Configurar Dias &amp; Meses (Firebase)</span>
              </button>
            )}

            <a
              href={savedSheet.fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#f5f7f6] hover:bg-[#e3e8e6] text-[#003440] font-bold text-[0.82rem] inline-flex items-center justify-center gap-1.5 shrink-0 transition-all border border-[#003440]/15"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              <span>Abrir na Planilha ↗</span>
            </a>
          </div>
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
