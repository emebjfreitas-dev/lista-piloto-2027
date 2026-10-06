import React, { useState } from 'react';
import { SchoolDay, UserRole } from '../types';
import {
  OFFICIAL_OCTOBER_DAYS,
  MONTHLY_SCHOOL_DAYS_2027,
  TOTAL_ANNUAL_SCHOOL_DAYS,
  SCHOOL_NAME,
  CITY_NAME,
} from '../data/mockData';
import {
  getSavedSpreadsheetInfo,
  getSavedPhotosDriveFolderUrl,
} from '../services/googleSheetsApi';

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
  const [days] = useState<SchoolDay[]>(OFFICIAL_OCTOBER_DAYS);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const savedSheet = getSavedSpreadsheetInfo();
  const drivePhotosUrl = getSavedPhotosDriveFolderUrl();

  const letivosCount = days.filter((d) => d.type === 'dia_letivo' || d.type === 'sabado_letivo').length;
  const feriadosCount = days.filter((d) => d.type === 'feriado').length;
  const planejamentoCount = days.filter((d) => d.type === 'planejamento').length;
  const recessoCount = days.filter((d) => d.type === 'recesso').length;

  const filteredDays = days.filter((d) => {
    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'letivo' && (d.type === 'dia_letivo' || d.type === 'sabado_letivo')) ||
      (filterType === 'nao_letivo' && (d.type === 'feriado' || d.type === 'recesso')) ||
      (filterType === 'planejamento' && d.type === 'planejamento');

    const matchesSearch =
      d.date.includes(searchQuery) ||
      d.dayOfWeek.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'dia_letivo':
        return 'bg-[#a4f3ca]/60 text-[#003723]';
      case 'sabado_letivo':
        return 'bg-[#c3e5f4] text-[#001f29] font-bold';
      case 'feriado':
        return 'bg-[#ffdad6] text-[#ba1a1a] font-bold';
      case 'planejamento':
        return 'bg-[#fef08a] text-[#854d0e] font-bold';
      default:
        return 'bg-[#f3f4f2] text-[#71787b]';
    }
  };

  const getLabel = (type: string) => {
    switch (type) {
      case 'dia_letivo':
        return 'Dia Letivo';
      case 'sabado_letivo':
        return 'Sábado Letivo';
      case 'feriado':
        return 'Feriado';
      case 'planejamento':
        return 'Planejamento';
      default:
        return 'Fim de Semana';
    }
  };

  return (
    <div className="flex flex-col w-full max-w-xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-4 pb-32">
      {/* Institutional School Header Banner */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#edeeec]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#c3e5f4] text-[#001f29] text-[0.75rem] font-bold">
                <span className="material-symbols-outlined text-[14px]">event_available</span>
                Calendário Escolar Oficial
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#a4f3ca]/60 text-[#003723] text-[0.75rem] font-bold">
                <span className="material-symbols-outlined text-[14px]">table_chart</span>
                Aba: Dias_Letivos_SME
              </span>
            </div>
            <h2 className="text-[1.25rem] font-bold text-[#003440] leading-tight mt-1">
              Dias Letivos — Outubro / 2027
            </h2>
            <p className="text-[0.85rem] text-[#436370] font-medium mt-0.5">
              {SCHOOL_NAME} • {CITY_NAME}
            </p>
          </div>
          <button
            onClick={onNavigateToSheet}
            title="Ver Planilha Google"
            className="w-11 h-11 rounded-xl bg-[#edeeec] hover:bg-[#e7e8e6] text-[#005035] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[24px]">table_chart</span>
          </button>
        </div>

        {/* Calendar KPI Summary */}
        <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-[#edeeec] text-center">
          <div className="bg-[#eaf6ef] p-2.5 rounded-xl border border-[#a4f3ca]">
            <span className="text-[0.7rem] font-bold text-[#005035] block uppercase">Total Ano</span>
            <span className="text-[1.375rem] font-extrabold text-[#005035] block">
              {TOTAL_ANNUAL_SCHOOL_DAYS}
            </span>
            <span className="text-[0.675rem] text-[#005035] font-semibold">dias letivos</span>
          </div>

          <div className="bg-[#f3f4f2] p-2.5 rounded-xl">
            <span className="text-[0.7rem] font-bold text-[#71787b] block uppercase">Outubro</span>
            <span className="text-[1.375rem] font-extrabold text-[#003440] block">{letivosCount}</span>
            <span className="text-[0.675rem] text-[#71787b]">dias no mês</span>
          </div>

          <div className="bg-[#f3f4f2] p-2.5 rounded-xl">
            <span className="text-[0.7rem] font-bold text-[#71787b] block uppercase">Feriados</span>
            <span className="text-[1.375rem] font-extrabold text-[#ba1a1a] block">{feriadosCount}</span>
            <span className="text-[0.675rem] text-[#71787b]">suspensões</span>
          </div>

          <div className="bg-[#f3f4f2] p-2.5 rounded-xl">
            <span className="text-[0.7rem] font-bold text-[#71787b] block uppercase">Planej.</span>
            <span className="text-[1.375rem] font-extrabold text-[#854d0e] block">{planejamentoCount}</span>
            <span className="text-[0.675rem] text-[#71787b]">pedagógico</span>
          </div>
        </div>

        {/* 11-Month Breakdown of the 200 School Days */}
        <div className="mt-4 pt-3 border-t border-[#edeeec] space-y-2">
          <p className="text-[0.8rem] font-extrabold text-[#003440]">
            Distribuição Oficial na Aba <span className="font-mono text-[#005035]">Dias_Letivos_SME_2027</span> (Soma = 200 Dias):
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 text-center">
            {MONTHLY_SCHOOL_DAYS_2027.map((m) => (
              <div
                key={m.month}
                className="p-1.5 rounded-lg bg-[#f3f4f2] border border-[#e1e3e1]"
              >
                <span className="text-[0.68rem] font-bold text-[#41484b] block truncate">
                  {m.month.substring(0, 3)}
                </span>
                <span className="text-[0.95rem] font-black text-[#003440] block">
                  {m.schoolDays}d
                </span>
              </div>
            ))}
            <div className="p-1.5 rounded-lg bg-[#a4f3ca] text-[#003723] font-black">
              <span className="text-[0.68rem] block">SOMA</span>
              <span className="text-[0.95rem] block">200d</span>
            </div>
          </div>
        </div>

        {/* Direct Links to Manual Spreadsheet & Photos Folder */}
        <div className="mt-4 pt-3 border-t border-[#edeeec] space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={savedSheet.fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-extrabold text-[0.82rem] flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">table_chart</span>
              <span>Abrir Link da Planilha (Aba 200 Dias) ↗</span>
            </a>

            <a
              href={drivePhotosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-extrabold text-[0.82rem] flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">folder_shared</span>
              <span>Abrir Link da Pasta de Fotos (Drive) ↗</span>
            </a>
          </div>

          {userRole === 'admin' && onOpenConfigDaysModal && (
            <button
              type="button"
              onClick={onOpenConfigDaysModal}
              className="w-full min-h-[46px] px-4 py-2 rounded-xl bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#003723] border border-[#005035]/30 font-extrabold text-[0.85rem] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">settings_applications</span>
              <span>Configurar Dias Letivos de Cada Turma por Mês & Editar Links (Admin)</span>
            </button>
          )}
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#edeeec] space-y-3">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-[#71787b] text-xl">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por data, dia ou evento..."
            className="w-full min-h-[44px] pl-10 pr-4 bg-[#f3f4f2] text-[#191c1b] text-[0.925rem] rounded-xl border border-[#c0c8cb] focus:bg-white focus:outline-none focus:border-[#003440]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[0.8rem] font-bold">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-[#003440] text-white'
                : 'bg-[#edeeec] text-[#41484b] hover:bg-[#e7e8e6]'
            }`}
          >
            Todos ({days.length})
          </button>
          <button
            onClick={() => setFilterType('letivo')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              filterType === 'letivo'
                ? 'bg-[#005035] text-white'
                : 'bg-[#a4f3ca]/60 text-[#003723] hover:bg-[#a4f3ca]'
            }`}
          >
            Dias Letivos ({letivosCount})
          </button>
          <button
            onClick={() => setFilterType('nao_letivo')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              filterType === 'nao_letivo'
                ? 'bg-[#ba1a1a] text-white'
                : 'bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ffdad6]/80'
            }`}
          >
            Feriados / Recessos ({feriadosCount + recessoCount})
          </button>
          <button
            onClick={() => setFilterType('planejamento')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              filterType === 'planejamento'
                ? 'bg-[#854d0e] text-white'
                : 'bg-[#fef08a] text-[#854d0e] hover:bg-[#fef08a]/80'
            }`}
          >
            Planejamento ({planejamentoCount})
          </button>
        </div>
      </section>

      {/* Days Table List */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#edeeec] space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-[#edeeec]">
          <span className="text-[0.85rem] font-bold text-[#436370]">
            Lista Oficial do Calendário Letivo
          </span>
          <span className="text-[0.75rem] font-semibold text-[#71787b]">
            {filteredDays.length} registros exibidos
          </span>
        </div>

        <div className="divide-y divide-[#edeeec] overflow-hidden">
          {filteredDays.map((day) => {
            const isSchoolDay = day.type === 'dia_letivo' || day.type === 'sabado_letivo';

            return (
              <div
                key={day.id}
                className="py-3 px-1 flex items-center justify-between gap-3 hover:bg-[#f9faf8] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold ${
                      isSchoolDay
                        ? 'bg-[#a4f3ca]/40 text-[#003723] border border-[#a4f3ca]'
                        : 'bg-[#f3f4f2] text-[#71787b]'
                    }`}
                  >
                    <span className="text-[1rem] leading-none">{day.date.split('/')[0]}</span>
                    <span className="text-[0.625rem] uppercase">OUT</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.875rem] font-bold text-[#003440]">
                        {day.dayOfWeek}
                      </span>
                      <span className={`text-[0.7rem] px-2 py-0.2 rounded-full ${getBadgeStyle(day.type)}`}>
                        {getLabel(day.type)}
                      </span>
                    </div>
                    <p className="text-[0.825rem] text-[#41484b] truncate mt-0.5">
                      {day.description}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {isSchoolDay ? (
                    <span className="inline-flex items-center gap-1 text-[0.8rem] font-bold text-[#005035]">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Contabilizado
                    </span>
                  ) : (
                    <span className="text-[0.75rem] font-semibold text-[#71787b]">
                      Sem aula
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Integration Explanation Card */}
      <section className="bg-[#edeeec] rounded-2xl p-4 border border-[#e1e3e1]">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[22px] text-[#003440] shrink-0 mt-0.5">
            sync_alt
          </span>
          <div>
            <h4 className="text-[0.95rem] font-bold text-[#003440]">
              Alimentação do Banco de Dados
            </h4>
            <p className="text-[0.875rem] text-[#41484b] mt-1 leading-relaxed">
              Esta lista de dias letivos vem diretamente da aba <strong>"Dias_Letivos_Calendário_SME"</strong> da Planilha Google da Secretaria de Educação. O total de <strong>20 dias letivos</strong> é utilizado como denominador para calcular a frequência mensal de todos os estudantes da EMEB Prof. Joaquim Candelário de Freitas.
            </p>
          </div>
        </div>
      </section>

      {/* Back button */}
      <button
        onClick={onBack}
        type="button"
        className="w-full min-h-[50px] bg-[#edeeec] hover:bg-[#e7e8e6] text-[#003440] font-bold text-[0.95rem] rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        <span>Voltar para o Painel de Turmas</span>
      </button>
    </div>
  );
};
