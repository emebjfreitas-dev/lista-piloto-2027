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
import { saveClassesToFirestoreCloud } from '../services/firebaseSync';

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
  const [isSavingFirebase, setIsSavingFirebase] = useState(false);

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

  const handleSaveAll = async () => {
    const cleanId = extractSpreadsheetId(sheetUrlInput);
    if (cleanId) {
      saveSpreadsheetInfo(cleanId, 'BD_Oficial_EMEB_Joaquim_Candelario_2027');
    }
    savePhotosDriveFolderUrl(drivePhotosUrlInput);
    onSaveClassesConfig(draftClasses);

    setIsSavingFirebase(true);
    try {
      await saveClassesToFirestoreCloud(draftClasses, Date.now());
    } catch (e) {
      console.warn('Erro ao sincronizar com Firebase Firestore:', e);
    } finally {
      setIsSavingFirebase(false);
    }

    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
    }, 2800);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Clean Modern Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
              Painel do Administrador · Ano Letivo 2027
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Configuração dos 200 Dias Letivos por Turma
            </h2>
            <p className="text-xs text-slate-500">
              Calendário oficial sincronizado com a aba <span className="font-mono text-slate-700 font-medium">Dias_Letivos_SME_2027</span> da Planilha Oficial e Firebase Firestore.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            aria-label="Fechar modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-5 bg-slate-50/50">
          {/* 1. Direct Links Box: Planilha Manual & Pasta de Fotos Google Drive */}
          <section className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-slate-500">
                link
              </span>
              <span>Links Institucionais Oficiais (Google Sheets &amp; Drive)</span>
            </h3>

            {/* Link 1: Planilha Google Sheets */}
            <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  Planilha Banco de Dados (Aba: <span className="font-mono">Dias_Letivos_SME_2027</span>)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText('sheet', sheetUrlInput)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-medium text-xs border border-slate-200 cursor-pointer transition-colors"
                  >
                    {copiedKey === 'sheet' ? '✓ Copiado' : 'Copiar Link'}
                  </button>
                  <a
                    href={sheetUrlInput}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1 transition-colors"
                  >
                    <span>Abrir Planilha ↗</span>
                  </a>
                </div>
              </div>
              <input
                type="text"
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
                className="w-full px-3 py-1.5 bg-white text-slate-900 font-mono text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-slate-800"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                <span>
                  Backup/Exportação: baixe o arquivo <strong className="text-slate-700">.xlsx</strong> completo:
                </span>
                <button
                  type="button"
                  onClick={() => downloadSpreadsheetXLSX(draftClasses, OFFICIAL_OCTOBER_DAYS)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-medium text-xs border border-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  <span>Baixar Planilha Modelo (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Link 2: Pasta de Fotos no Google Drive */}
            <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  Pasta de Fotos dos Alunos (Google Drive)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText('drive', drivePhotosUrlInput)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-medium text-xs border border-slate-200 cursor-pointer transition-colors"
                  >
                    {copiedKey === 'drive' ? '✓ Copiado' : 'Copiar Link'}
                  </button>
                  <a
                    href={drivePhotosUrlInput}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1 transition-colors"
                  >
                    <span>Abrir Pasta ↗</span>
                  </a>
                </div>
              </div>
              <input
                type="text"
                value={drivePhotosUrlInput}
                onChange={(e) => setDrivePhotosUrlInput(e.target.value)}
                className="w-full px-3 py-1.5 bg-white text-slate-900 font-mono text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-slate-800"
              />
            </div>
          </section>

          {/* 2. Resumo dos 200 Dias Letivos Oficiais por Mês */}
          <section className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Distribuição Oficial dos {TOTAL_ANNUAL_SCHOOL_DAYS} Dias Letivos (Ano Letivo 2027)
                </h3>
                <p className="text-xs text-slate-500">
                  Selecione o mês para visualizar e ajustar os dias letivos das turmas:
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetToOfficial200Days}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition-colors cursor-pointer"
              >
                Restaurar Padrão Oficial (200 Dias)
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => {
                const isSelected = selectedMonth === m.month;
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => setSelectedMonth(m.month)}
                    className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-normal'
                    }`}
                  >
                    <span className="text-[11px] block truncate">{m.month}</span>
                    <span className="font-mono text-sm font-semibold block tabular-nums">{m.schoolDays}d</span>
                  </button>
                );
              })}
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-center flex flex-col justify-center">
                <span className="text-[10px] uppercase font-medium block">Total</span>
                <span className="font-mono text-sm font-semibold block tabular-nums">200d</span>
              </div>
            </div>
          </section>

          {/* 3. Configuração dos Dias Letivos por Turma no Mês Selecionado */}
          <section className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Dias Letivos por Turma em <span className="font-semibold text-blue-700">{selectedMonth}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ajuste em lote ou personalize individualmente cada turma:
                </p>
              </div>

              {/* Bulk Apply Bar */}
              <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <span className="text-xs font-medium text-slate-600 pl-1">
                  Aplicar a todas:
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={bulkDaysValue}
                  onChange={(e) => setBulkDaysValue(Number(e.target.value) || 20)}
                  className="w-14 px-2 py-0.5 bg-white text-slate-900 font-mono text-xs font-semibold text-center rounded border border-slate-200 focus:outline-none focus:border-slate-800 tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleApplyBulkForMonth}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded cursor-pointer transition-colors"
                >
                  Aplicar
                </button>
              </div>
            </div>

            {/* Shift Filter (Segmented control style) */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
              {[
                { id: 'all', label: 'Todas as Turmas (40)' },
                { id: 'Turno Manhã', label: 'Manhã (20)' },
                { id: 'Turno Tarde', label: 'Tarde (20)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterShift(tab.id as any)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    filterShift === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Classes List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
              {visibleDraftClasses.map((cls) => {
                const monthDays = getMonthDaysForClass(cls, selectedMonth);
                const annualTotal = getAnnualTotalForClass(cls);
                return (
                  <div
                    key={cls.id}
                    className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900 text-xs block truncate">
                        {cls.name}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        Ano: {annualTotal}/200 dias
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateSingleClassDays(cls.id, monthDays - 1)}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
                        aria-label={`Diminuir dias letivos da turma ${cls.name}`}
                      >
                        —
                      </button>
                      <span className="w-9 text-center font-mono font-semibold text-xs text-slate-900 tabular-nums">
                        {monthDays}d
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateSingleClassDays(cls.id, monthDays + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center cursor-pointer transition-colors"
                        aria-label={`Aumentar dias letivos da turma ${cls.name}`}
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

        {/* Footer Sticky */}
        <div className="p-4 sm:p-5 sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200/90 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
          {savedFeedback ? (
            <span className="text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg font-medium text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
              <span>Configuração sincronizada com sucesso no Firebase e Planilha!</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToSheet();
              }}
              className="px-3.5 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[17px]">cloud_sync</span>
              <span>Sincronização Google Sheets</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSavingFirebase}
              className="px-4 h-9 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium text-xs cursor-pointer transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSavingFirebase}
              className="px-4 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <span className={`material-symbols-outlined text-[17px] ${isSavingFirebase ? 'animate-spin' : ''}`}>
                {isSavingFirebase ? 'sync' : 'save'}
              </span>
              <span>{isSavingFirebase ? 'Salvando...' : 'Salvar no Firebase'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
