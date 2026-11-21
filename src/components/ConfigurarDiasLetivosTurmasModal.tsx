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
import { CheckCircle2, Download, Package, RefreshCw, Save, X } from 'lucide-react';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ModalPortal } from './ui/ModalPortal';

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
  useModalScrollLock(isOpen);

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
    <ModalPortal>
      <div className="fixed inset-0 z-[110] overflow-hidden flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in">
        <div className="modal-shell w-full max-w-4xl rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[88dvh] animate-apple-pop">
        {/* Clean Modern Header */}
        <div className="modal-header-surface px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider uppercase text-slate-700">
              Painel do Administrador · Ano Letivo 2027
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950 break-words">
              Configuração dos 200 Dias Letivos por Turma
            </h2>
            <p className="text-xs text-slate-700 break-words">
              Calendário oficial sincronizado em tempo real com o banco na nuvem (Firebase Firestore).
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-[#eef3f9] text-slate-700 hover:text-slate-950 hover:bg-[#e2e8f0] flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="modal-scroll-body flex-1 min-h-0 p-5 sm:p-6 space-y-5 bg-[#f3f6fb]">
          {/* 1. Direct Links Box: Exportação Excel & Pasta de Fotos Google Drive */}
          <section className="bg-white rounded-xl p-5 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Package className="w-[18px] h-[18px] text-slate-700 shrink-0" />
              <span>Exportação Oficial &amp; Armazenamento de Fotos (Drive)</span>
            </h3>

            {/* Exportação Excel (.xlsx) das Turmas e Estudantes */}
            <div className="bg-[#f3f6fb] p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-950">
                  Backup Completo da Base Oficial SED Jundiaí
                </p>
                <p className="text-xs text-slate-700 break-words">
                  Exporta todas as {draftClasses.length} turmas e {draftClasses.reduce((acc, c) => acc + c.students.length, 0)} estudantes em arquivo Excel estruturado (.xlsx).
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadSpreadsheetXLSX(draftClasses, OFFICIAL_OCTOBER_DAYS)}
                className="h-9 px-3.5 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97] shadow-xs"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Exportar Base SED (.xlsx)</span>
              </button>
            </div>

            {/* Link 2: Pasta de Fotos no Google Drive */}
            <div className="bg-[#f3f6fb] p-3.5 rounded-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-800">
                  Pasta de Fotos dos Alunos (Google Drive)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText('drive', drivePhotosUrlInput)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#eef3f9] text-slate-900 font-medium text-xs cursor-pointer transition-colors shadow-xs"
                  >
                    {copiedKey === 'drive' ? '✓ Copiado' : 'Copiar Link'}
                  </button>
                  <a
                    href={drivePhotosUrlInput}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-[#14428c] hover:bg-[#0f3370] text-white font-medium text-xs flex items-center gap-1 transition-colors"
                  >
                    <span>Abrir Pasta ↗</span>
                  </a>
                </div>
              </div>
              <input
                type="text"
                value={drivePhotosUrlInput}
                onChange={(e) => setDrivePhotosUrlInput(e.target.value)}
                className="w-full px-3 py-1.5 bg-white text-slate-950 font-mono text-xs rounded-lg"
              />
            </div>
          </section>

          {/* 2. Resumo dos 200 Dias Letivos Oficiais por Mês */}
          <section className="bg-white rounded-xl p-5 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Distribuição Oficial dos {TOTAL_ANNUAL_SCHOOL_DAYS} Dias Letivos (Ano Letivo 2027)
                </h3>
                <p className="text-xs text-slate-700">
                  Selecione o mês para visualizar e ajustar os dias letivos das turmas:
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetToOfficial200Days}
                className="px-2.5 py-1 rounded-lg bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-900 font-medium text-xs transition-colors cursor-pointer"
              >
                Restaurar Padrão Oficial (200 Dias)
              </button>
            </div>

            <div className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
              {MONTHLY_SCHOOL_DAYS_2027.map((m) => {
                const isSelected = selectedMonth === m.month;
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => setSelectedMonth(m.month)}
                    className={`p-2 rounded-lg text-center cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97] min-w-0 ${
                      isSelected
                        ? 'bg-[#14428c] text-white font-semibold shadow-sm'
                        : 'bg-[#eef3f9] text-slate-900 hover:bg-[#e2e8f0] font-normal'
                    }`}
                  >
                    <span className="text-xs block break-words">{m.month}</span>
                    <span className="font-mono text-sm font-semibold block tabular-nums">{m.schoolDays}d</span>
                  </button>
                );
              })}
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-950 text-center flex flex-col justify-center">
                <span className="text-xs uppercase font-semibold block">Total</span>
                <span className="font-mono text-sm font-bold block tabular-nums">200d</span>
              </div>
            </div>
          </section>

          {/* 3. Configuração dos Dias Letivos por Turma no Mês Selecionado */}
          <section className="bg-white rounded-xl p-5 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Dias Letivos por Turma em <span className="font-semibold text-[#14428c]">{selectedMonth}</span>
                </h3>
                <p className="text-xs text-slate-700">
                  Ajuste em lote ou personalize individualmente cada turma:
                </p>
              </div>

              {/* Bulk Apply Bar */}
              <div className="flex items-center gap-1.5 bg-[#eef3f9] p-1.5 rounded-lg">
                <span className="text-xs font-medium text-slate-800 pl-1">
                  Aplicar a todas:
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={bulkDaysValue}
                  onChange={(e) => setBulkDaysValue(Number(e.target.value) || 20)}
                  className="w-14 px-2 py-0.5 bg-white text-slate-950 font-mono text-xs font-semibold text-center rounded tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleApplyBulkForMonth}
                  className="px-2.5 py-1 bg-[#14428c] hover:bg-[#0f3370] text-white font-medium text-xs rounded cursor-pointer transition-colors"
                >
                  Aplicar
                </button>
              </div>
            </div>

            {/* Shift Filter (Segmented control style) */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#eef3f9] rounded-xl w-full sm:w-fit">
              {[
                { id: 'all', label: 'Todas as Turmas (40)' },
                { id: 'Turno Manhã', label: 'Manhã (20)' },
                { id: 'Turno Tarde', label: 'Tarde (20)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterShift(tab.id as any)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                    filterShift === tab.id
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Classes List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-0.5">
              {visibleDraftClasses.map((cls) => {
                const monthDays = getMonthDaysForClass(cls, selectedMonth);
                const annualTotal = getAnnualTotalForClass(cls);
                return (
                  <div
                    key={cls.id}
                    className="p-3 rounded-xl bg-[#f3f6fb] hover:bg-[#eef3f9] flex items-center justify-between gap-3 transition-colors min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-950 text-xs block break-words leading-snug">
                        {cls.name}
                      </span>
                      <span className="text-xs text-slate-700 font-mono tabular-nums">
                        Ano: {annualTotal}/200 dias
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateSingleClassDays(cls.id, monthDays - 1)}
                        className="w-9 h-9 rounded-lg bg-white hover:bg-slate-100 text-slate-900 flex items-center justify-center cursor-pointer transition-colors shadow-xs"
                        aria-label={`Diminuir dias letivos da turma ${cls.name}`}
                      >
                        —
                      </button>
                      <span className="w-10 text-center font-mono font-semibold text-xs text-slate-950 tabular-nums">
                        {monthDays}d
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateSingleClassDays(cls.id, monthDays + 1)}
                        className="w-9 h-9 rounded-lg bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-xs flex items-center justify-center cursor-pointer transition-colors"
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
        <div className="p-4 sm:p-5 sticky bottom-0 bg-white/95 backdrop-blur-md shadow-[0_-6px_20px_-8px_rgba(9,15,29,0.08)] flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
          {savedFeedback ? (
            <span className="text-emerald-950 bg-emerald-100 px-3 py-1.5 rounded-xl font-medium text-xs flex items-center gap-1.5">
              <CheckCircle2 className="w-[18px] h-[18px] text-emerald-800 shrink-0" />
              <span>Configuração do calendário gravada com sucesso!</span>
            </span>
          ) : (
            <span className="text-xs text-slate-700 font-medium">
              40 turmas ativas · Meta oficial: 200 dias
            </span>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSavingFirebase}
              className="px-4 h-10 sm:h-11 rounded-xl bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-900 font-semibold text-xs sm:text-sm cursor-pointer transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSavingFirebase}
              className="px-5 h-10 sm:h-11 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.97] shadow-xs whitespace-nowrap"
            >
              {isSavingFirebase ? (
                <RefreshCw className="w-[17px] h-[17px] animate-spin shrink-0" />
              ) : (
                <Save className="w-[17px] h-[17px] shrink-0" />
              )}
              <span>{isSavingFirebase ? 'Salvando...' : 'Salvar Calendário'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
