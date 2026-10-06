import React, { useState, useEffect } from 'react';
import { ClassGroup } from '../types';
import {
  MONTHLY_SCHOOL_DAYS_2027,
  OFFICIAL_OCTOBER_DAYS,
  TOTAL_ANNUAL_SCHOOL_DAYS,
  getDefaultMonthlySchoolDaysMap,
} from '../data/mockData';
import { getClassAttendanceMetrics } from '../utils/attendanceRules';
import { downloadSpreadsheetXLSX } from '../services/db';
import {
  getSavedSpreadsheetInfo,
  getSavedPhotosDriveFolderUrl,
  savePhotosDriveFolderUrl,
  saveSpreadsheetInfo,
  extractSpreadsheetId,
} from '../services/googleSheetsApi';

interface ConfigurarDiasLetivosTurmasModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  onSaveClassesConfig: (updatedClasses: ClassGroup[]) => void;
  onNavigateToSheet: () => void;
}

export const ConfigurarDiasLetivosTurmasModal: React.FC<
  ConfigurarDiasLetivosTurmasModalProps
> = ({
  isOpen,
  onClose,
  classes,
  onSaveClassesConfig,
  onNavigateToSheet,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('Outubro');
  const [draftClasses, setDraftClasses] = useState<ClassGroup[]>(classes);
  const [bulkDaysValue, setBulkDaysValue] = useState<number>(20);
  const [filterShift, setFilterShift] = useState<'all' | 'Turno Manhã' | 'Turno Tarde'>('all');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editable Links for Manual Sheet & Drive Photos Folder
  const savedSheet = getSavedSpreadsheetInfo();
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(savedSheet.fullUrl);
  const [drivePhotosUrlInput, setDrivePhotosUrlInput] = useState<string>(
    getSavedPhotosDriveFolderUrl()
  );

  useEffect(() => {
    setDraftClasses(classes);
  }, [classes, isOpen]);

  useEffect(() => {
    const found = MONTHLY_SCHOOL_DAYS_2027.find((m) => m.month === selectedMonth);
    if (found) {
      setBulkDaysValue(found.schoolDays);
    }
  }, [selectedMonth]);

  if (!isOpen) return null;

  const getMonthDaysForClass = (cls: ClassGroup, monthName: string): number => {
    if (cls.monthlySchoolDays && typeof cls.monthlySchoolDays[monthName] === 'number') {
      return cls.monthlySchoolDays[monthName];
    }
    const found = MONTHLY_SCHOOL_DAYS_2027.find((m) => m.month === monthName);
    return found ? found.schoolDays : 20;
  };

  const getAnnualTotalForClass = (cls: ClassGroup): number => {
    return MONTHLY_SCHOOL_DAYS_2027.reduce(
      (sum, m) => sum + getMonthDaysForClass(cls, m.month),
      0
    );
  };

  // Change school days of a single class in the selected month
  const handleUpdateSingleClassDays = (classId: string, newDays: number) => {
    const clamped = Math.max(1, Math.min(31, newDays));
    setDraftClasses((prev) =>
      prev.map((cls) => {
        if (cls.id !== classId) return cls;
        const currentMap = cls.monthlySchoolDays || getDefaultMonthlySchoolDaysMap();
        const updatedMap = { ...currentMap, [selectedMonth]: clamped };

        const updatedStudents = cls.students.map((s) => {
          const nextRecorte =
            !s.diasLetivosRecorte || s.diasLetivosRecorte >= (cls.classesHeld || 20)
              ? clamped
              : Math.min(clamped, s.diasLetivosRecorte);
          const nextFaltas = Math.min(nextRecorte, s.totalAbsencesMonth);
          const nextAtestados = Math.min(nextFaltas, s.justifiedAbsences || 0);
          return {
            ...s,
            diasLetivosRecorte: nextRecorte,
            totalAbsencesMonth: nextFaltas,
            justifiedAbsences: nextAtestados,
          };
        });

        const nextClassesHeld = selectedMonth === 'Outubro' ? clamped : cls.classesHeld;
        const tempCls: ClassGroup = {
          ...cls,
          classesHeld: nextClassesHeld,
          classesPlanned: nextClassesHeld,
          monthlySchoolDays: updatedMap,
          students: updatedStudents,
        };
        const cm = getClassAttendanceMetrics(tempCls, OFFICIAL_OCTOBER_DAYS);
        return {
          ...tempCls,
          presenceRate: cm.presenceRate,
          monthlyAbsences: cm.totalFaltasTurma,
        };
      })
    );
  };

  // Apply bulk days value to all visible classes for the selected month
  const handleApplyBulkForMonth = () => {
    const clamped = Math.max(1, Math.min(31, bulkDaysValue));
    setDraftClasses((prev) =>
      prev.map((cls) => {
        if (filterShift !== 'all' && cls.shift !== filterShift) return cls;
        const currentMap = cls.monthlySchoolDays || getDefaultMonthlySchoolDaysMap();
        const updatedMap = { ...currentMap, [selectedMonth]: clamped };

        const updatedStudents = cls.students.map((s) => {
          const nextRecorte =
            !s.diasLetivosRecorte || s.diasLetivosRecorte >= (cls.classesHeld || 20)
              ? clamped
              : Math.min(clamped, s.diasLetivosRecorte);
          const nextFaltas = Math.min(nextRecorte, s.totalAbsencesMonth);
          const nextAtestados = Math.min(nextFaltas, s.justifiedAbsences || 0);
          return {
            ...s,
            diasLetivosRecorte: nextRecorte,
            totalAbsencesMonth: nextFaltas,
            justifiedAbsences: nextAtestados,
          };
        });

        const nextClassesHeld = selectedMonth === 'Outubro' ? clamped : cls.classesHeld;
        const tempCls: ClassGroup = {
          ...cls,
          classesHeld: nextClassesHeld,
          classesPlanned: nextClassesHeld,
          monthlySchoolDays: updatedMap,
          students: updatedStudents,
        };
        const cm = getClassAttendanceMetrics(tempCls, OFFICIAL_OCTOBER_DAYS);
        return {
          ...tempCls,
          presenceRate: cm.presenceRate,
          monthlyAbsences: cm.totalFaltasTurma,
        };
      })
    );
  };

  // Reset all 40 classes to the official 200 school days calendar
  const handleResetToOfficial200Days = () => {
    const officialMap = getDefaultMonthlySchoolDaysMap();
    setDraftClasses((prev) =>
      prev.map((cls) => {
        const tempCls: ClassGroup = {
          ...cls,
          classesHeld: officialMap['Outubro'] || 20,
          classesPlanned: officialMap['Outubro'] || 20,
          monthlySchoolDays: { ...officialMap },
        };
        const cm = getClassAttendanceMetrics(tempCls, OFFICIAL_OCTOBER_DAYS);
        return {
          ...tempCls,
          presenceRate: cm.presenceRate,
          monthlyAbsences: cm.totalFaltasTurma,
        };
      })
    );
  };

  const handleSaveAll = () => {
    const cleanId = extractSpreadsheetId(sheetUrlInput);
    if (cleanId) {
      saveSpreadsheetInfo(cleanId, 'BD_Oficial_EMEB_Joaquim_Candelario_2027');
    }
    savePhotosDriveFolderUrl(drivePhotosUrlInput);
    onSaveClassesConfig(draftClasses);
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
    }, 2500);
  };

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const visibleDraftClasses = draftClasses.filter(
    (c) => filterShift === 'all' || c.shift === filterShift
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border-2 border-[#003440]/20 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="bg-[#003440] text-white p-4 sm:p-5 flex items-center justify-between gap-3">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#a4f3ca] text-[#003723] font-black text-[0.75rem] mb-1">
              PAINEL EXCLUSIVO DO ADMINISTRADOR • 200 DIAS LETIVOS
            </span>
            <h2 className="text-[1.25rem] sm:text-[1.4rem] font-black leading-tight">
              Configuração dos 200 Dias Letivos & Links Oficiais
            </h2>
            <p className="text-[0.82rem] text-[#c3e5f4] font-medium">
              Alimentado pela aba específica <strong>Dias_Letivos_SME_2027</strong> da Planilha Banco de Dados
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-5 bg-[#f8faf9]">
          {/* 1. Direct Links Box: Planilha Manual & Pasta de Fotos Google Drive */}
          <section className="bg-white rounded-2xl p-4 shadow-xs border-2 border-[#005035]/25 space-y-3">
            <h3 className="text-[1rem] font-black text-[#003440] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[22px] text-[#005035]">
                link
              </span>
              <span>Links Oficiais para Acesso Manual (Planilha & Pasta de Fotos)</span>
            </h3>

            {/* Link 1: Planilha Google Sheets */}
            <div className="bg-[#f3f4f2] p-3 rounded-xl border border-[#c0c8cb] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.8rem] font-extrabold text-[#003440] uppercase">
                  1. Link da Planilha Banco de Dados (Aba: Dias_Letivos_SME_2027):
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText('sheet', sheetUrlInput)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#e7e8e6] text-[#003440] font-bold text-[0.75rem] border border-[#c0c8cb] cursor-pointer"
                  >
                    {copiedKey === 'sheet' ? '✓ Link Copiado!' : 'Copiar Link'}
                  </button>
                  <a
                    href={sheetUrlInput}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-[#005035] hover:bg-[#003723] text-white font-bold text-[0.75rem] flex items-center gap-1"
                  >
                    <span>Abrir Planilha</span>
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                </div>
              </div>
              <input
                type="text"
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
                className="w-full px-3 py-2 bg-white text-[#003440] font-mono text-[0.82rem] rounded-lg border border-[#c0c8cb]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[0.75rem] text-[#41484b]">
                  Para fazer manualmente: baixe o arquivo <strong>.xlsx</strong> já com as 4 abas (incluindo os 200 dias letivos) e importe no Google Sheets:
                </span>
                <button
                  type="button"
                  onClick={() => downloadSpreadsheetXLSX(draftClasses, OFFICIAL_OCTOBER_DAYS)}
                  className="px-3 py-1.5 rounded-lg bg-[#003440] hover:bg-[#1e4b58] text-white font-extrabold text-[0.78rem] flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Baixar Planilha Modelo (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Link 2: Pasta de Fotos no Google Drive */}
            <div className="bg-[#f3f4f2] p-3 rounded-xl border border-[#c0c8cb] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.8rem] font-extrabold text-[#003440] uppercase">
                  2. Link da Pasta de Fotos dos Estudantes (Google Drive):
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText('drive', drivePhotosUrlInput)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#e7e8e6] text-[#003440] font-bold text-[0.75rem] border border-[#c0c8cb] cursor-pointer"
                  >
                    {copiedKey === 'drive' ? '✓ Link Copiado!' : 'Copiar Link'}
                  </button>
                  <a
                    href={drivePhotosUrlInput}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.75rem] flex items-center gap-1"
                  >
                    <span>Abrir Pasta de Fotos</span>
                    <span className="material-symbols-outlined text-[14px]">folder_shared</span>
                  </a>
                </div>
              </div>
              <input
                type="text"
                value={drivePhotosUrlInput}
                onChange={(e) => setDrivePhotosUrlInput(e.target.value)}
                className="w-full px-3 py-2 bg-white text-[#003440] font-mono text-[0.82rem] rounded-lg border border-[#c0c8cb]"
              />
            </div>
          </section>

          {/* 2. Summary of the 200 Official School Days across the 11 Months */}
          <section className="bg-white rounded-2xl p-4 shadow-xs border border-[#e1e3e1] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[1rem] font-black text-[#003440]">
                  Distribuição Oficial dos {TOTAL_ANNUAL_SCHOOL_DAYS} Dias Letivos Anuais (2027)
                </h3>
                <p className="text-[0.8rem] text-[#41484b]">
                  Toque em um mês abaixo para configurar os dias letivos das 40 turmas naquele mês:
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetToOfficial200Days}
                className="px-3 py-1.5 rounded-xl bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#003723] font-extrabold text-[0.78rem] border border-[#a4f3ca] cursor-pointer"
              >
                Restaurar Padrão 200 Dias Letivos
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => {
                const isSelected = selectedMonth === m.month;
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => setSelectedMonth(m.month)}
                    className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#003440] text-white border-[#003440] shadow-xs'
                        : 'bg-[#f3f4f2] text-[#003440] border-[#c0c8cb] hover:bg-[#e7e8e6]'
                    }`}
                  >
                    <span className="text-[0.75rem] font-bold block truncate">{m.month}</span>
                    <span className="text-[1.1rem] font-black block">{m.schoolDays}d</span>
                  </button>
                );
              })}
              <div className="p-2 rounded-xl bg-[#a4f3ca] text-[#003723] border border-[#005035]/30 text-center flex flex-col justify-center">
                <span className="text-[0.7rem] font-black uppercase block">Total Ano</span>
                <span className="text-[1.15rem] font-black block">200 dias</span>
              </div>
            </div>
          </section>

          {/* 3. Per-Class Monthly Configuration for Selected Month */}
          <section className="bg-white rounded-2xl p-4 shadow-xs border border-[#e1e3e1] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#edeeec]">
              <div>
                <h3 className="text-[1rem] font-black text-[#003440]">
                  Dias Letivos por Turma em <span className="underline">{selectedMonth}</span>
                </h3>
                <p className="text-[0.8rem] text-[#41484b]">
                  Ajuste todas as turmas de uma vez ou individualmente por sala:
                </p>
              </div>

              {/* Bulk Apply Bar */}
              <div className="flex items-center gap-2 bg-[#f3f4f2] p-2 rounded-xl border border-[#c0c8cb]">
                <span className="text-[0.78rem] font-bold text-[#003440] pl-1">
                  Aplicar a todas:
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={bulkDaysValue}
                  onChange={(e) => setBulkDaysValue(Number(e.target.value) || 20)}
                  className="w-16 px-2 py-1 bg-white text-[#003440] font-black text-center rounded-lg border border-[#c0c8cb]"
                />
                <button
                  type="button"
                  onClick={handleApplyBulkForMonth}
                  className="px-3 py-1.5 bg-[#005035] hover:bg-[#003723] text-white font-extrabold text-[0.78rem] rounded-lg cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>

            {/* Shift Filter */}
            <div className="flex gap-2">
              {[
                { id: 'all', label: 'Todas as 40 Turmas' },
                { id: 'Turno Manhã', label: '☀️ Manhã (20)' },
                { id: 'Turno Tarde', label: '⛅ Tarde (20)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterShift(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-[0.8rem] cursor-pointer ${
                    filterShift === tab.id
                      ? 'bg-[#003440] text-white'
                      : 'bg-[#f3f4f2] text-[#41484b]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Classes List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
              {visibleDraftClasses.map((cls) => {
                const monthDays = getMonthDaysForClass(cls, selectedMonth);
                const annualTotal = getAnnualTotalForClass(cls);
                return (
                  <div
                    key={cls.id}
                    className="p-3 rounded-xl bg-[#f9faf8] border border-[#e1e3e1] flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-black text-[#003440] text-[0.95rem] block">
                        {cls.name}
                      </span>
                      <span
                        className={`text-[0.72rem] font-bold ${
                          annualTotal === 200 ? 'text-[#005035]' : 'text-[#8c5000]'
                        }`}
                      >
                        Soma no Ano: {annualTotal}/200 dias letivos
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateSingleClassDays(cls.id, monthDays - 1)}
                        className="w-8 h-8 rounded-lg bg-white border border-[#c0c8cb] font-black text-[#003440] cursor-pointer"
                      >
                        —
                      </button>
                      <span className="w-10 text-center font-black text-[1.05rem] text-[#003440]">
                        {monthDays}d
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateSingleClassDays(cls.id, monthDays + 1)}
                        className="w-8 h-8 rounded-lg bg-[#003440] text-white font-black cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-[#edeeec] flex flex-wrap items-center justify-between gap-3">
          {savedFeedback ? (
            <span className="text-[#005035] font-black text-[0.95rem] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[22px]">check_circle</span>
              <span>Configuração salva no banco local e pronta para a Planilha Google!</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToSheet();
              }}
              className="px-4 min-h-[46px] rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#005035] font-extrabold text-[0.85rem] border border-[#a4f3ca] flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
              <span>Ir para Sincronização Google Sheets</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 min-h-[46px] rounded-xl bg-[#edeeec] text-[#41484b] font-bold text-[0.9rem] cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-5 min-h-[46px] rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.95rem] flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">save</span>
              <span>Salvar Dias Letivos e Links</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
