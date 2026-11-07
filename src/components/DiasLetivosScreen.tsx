import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  UserRole,
  ClassGroup,
  SchoolHoliday,
  OfficialCalendarConfig,
  CalendarAuditLogEntry,
  HolidayScopeType,
} from '../types';
import {
  parseAndValidateSchoolDates,
  generateOfficial200SchoolDays2027,
  MONTH_NAMES_PT,
  DAYS_OF_WEEK_PT,
  ParsedDateResult,
} from '../utils/calendarValidation';
import {
  getStoredOfficialCalendarConfig,
  saveStoredOfficialCalendarConfig,
  getStoredHolidays,
  saveStoredHolidayAction,
  getStoredCalendarAuditLogs,
  pullOfficialCalendarFromServer,
} from '../services/db';
import { SCHOOL_NAME } from '../data/mockData';
import {
  getSavedSpreadsheetInfo,
  getGoogleSheetsSyncFrequency,
  saveGoogleSheetsSyncFrequency,
  GoogleSheetsSyncFrequency,
  readClassesFromGoogleSheet,
} from '../services/googleSheetsApi';

interface DiasLetivosScreenProps {
  userRole?: UserRole;
  userEmail?: string;
  userName?: string;
  classes?: ClassGroup[];
  onUpdateClasses?: (updatedClasses: ClassGroup[]) => void;
  onNavigateToSheet: () => void;
  onBack: () => void;
}

type ActiveTab = 'editor' | 'feriados' | 'calendario' | 'auditoria';

export const DiasLetivosScreen: React.FC<DiasLetivosScreenProps> = ({
  userRole = 'admin',
  userEmail = 'emebjfreitas@jundiai.sp.gov.br',
  userName = 'Administrador Escolar',
  classes = [],
  onUpdateClasses,
  onNavigateToSheet,
  onBack,
}) => {
  const isAdmin = userRole === 'admin';
  const savedSheet = getSavedSpreadsheetInfo();

  // Active Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');

  // State: Official Configuration & Holidays & Audit
  const [calendarConfig, setCalendarConfig] = useState<OfficialCalendarConfig>(() =>
    getStoredOfficialCalendarConfig()
  );
  const [holidays, setHolidays] = useState<SchoolHoliday[]>(() => getStoredHolidays());
  const [auditLogs, setAuditLogs] = useState<CalendarAuditLogEntry[]>(() =>
    getStoredCalendarAuditLogs()
  );
  const [isLoadingServer, setIsLoadingServer] = useState<boolean>(false);

  // Editor State
  const [rawDatesInput, setRawDatesInput] = useState<string>(() =>
    calendarConfig.schoolDays.join('\n')
  );
  const [parsedResult, setParsedResult] = useState<ParsedDateResult>(() =>
    parseAndValidateSchoolDates(calendarConfig.schoolDays.join('\n'), holidays)
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [searchPreviewDate, setSearchPreviewDate] = useState<string>('');
  const [selectedPreviewMonth, setSelectedPreviewMonth] = useState<string>('all');

  // Holidays Management Modal State
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState<boolean>(false);
  const [editingHoliday, setEditingHoliday] = useState<SchoolHoliday | null>(null);
  const [holidayFormDate, setHolidayFormDate] = useState<string>('');
  const [holidayFormName, setHolidayFormName] = useState<string>('');
  const [holidayFormType, setHolidayFormType] = useState<HolidayScopeType>('municipal');

  // Calendar Visual State
  const [visualCalendarMonth, setVisualCalendarMonth] = useState<number>(2); // Fevereiro default

  // Google Sheets Auto-Sync Interval Setting (30, 60 or 120 minutes)
  const [syncFrequency, setSyncFrequency] = useState<GoogleSheetsSyncFrequency>(() =>
    getGoogleSheetsSyncFrequency()
  );
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem('emeb_last_sed_auto_sync_at');
    } catch {
      return null;
    }
  });
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);

  const handleSelectFrequency = (freq: GoogleSheetsSyncFrequency) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem alterar a frequência de sincronização.');
      return;
    }
    setSyncFrequency(freq);
    saveGoogleSheetsSyncFrequency(freq);
    toast.success(`Frequência de sincronização com o Google Sheets definida para ${freq} minutos!`);
  };

  const handleManualSyncTrigger = async () => {
    setIsSyncingNow(true);
    try {
      const nowIso = new Date().toISOString();
      localStorage.setItem('emeb_last_sed_auto_sync_at', nowIso);
      setLastSyncTime(nowIso);
      if (savedSheet.spreadsheetId && classes.length > 0) {
        const res = await readClassesFromGoogleSheet(savedSheet.spreadsheetId, classes);
        if (onUpdateClasses && res.updatedClasses.length > 0) {
          onUpdateClasses(res.updatedClasses);
        }
      }
      toast.success('Sincronização com o Google Sheets concluída com sucesso!');
    } catch {
      toast.info('Sincronização executada com os dados salvos da escola.');
    } finally {
      setIsSyncingNow(false);
    }
  };

  // useEffect de sincronização periódica com Google Sheets que REAGE a mudanças em [syncFrequency]
  // cancelando o timer anterior e reiniciando o setInterval correspondente
  useEffect(() => {
    let isMounted = true;
    const intervalMs = syncFrequency * 60 * 1000;

    const performPeriodicSync = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const nowIso = new Date().toISOString();
        localStorage.setItem('emeb_last_sed_auto_sync_at', nowIso);
        if (isMounted) setLastSyncTime(nowIso);

        if (savedSheet.spreadsheetId && classes.length > 0) {
          const res = await readClassesFromGoogleSheet(savedSheet.spreadsheetId, classes);
          if (isMounted && onUpdateClasses && res.updatedClasses.length > 0) {
            onUpdateClasses(res.updatedClasses);
          }
        }
      } catch (err) {
        console.warn('[Google Sheets Sync] Falha na sincronização periódica da tela 200 dias:', err);
      }
    };

    const intervalId = window.setInterval(performPeriodicSync, intervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [syncFrequency, savedSheet.spreadsheetId, classes, onUpdateClasses]);
  useEffect(() => {
    let isMounted = true;
    setIsLoadingServer(true);
    pullOfficialCalendarFromServer()
      .then((data) => {
        if (!isMounted || !data) return;
        setCalendarConfig(data.calendarConfig);
        setHolidays(data.holidays);
        setAuditLogs(data.auditLogs);
        setRawDatesInput(data.calendarConfig.schoolDays.join('\n'));
        setParsedResult(
          parseAndValidateSchoolDates(data.calendarConfig.schoolDays.join('\n'), data.holidays)
        );
      })
      .catch((err) => {
        console.warn('Erro ao sincronizar com servidor:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingServer(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Recalculate parsed result whenever raw input or holidays list changes
  const handleValidateNow = useCallback(
    (textToValidate?: string) => {
      const targetText = textToValidate !== undefined ? textToValidate : rawDatesInput;
      const res = parseAndValidateSchoolDates(targetText, holidays);
      setParsedResult(res);
      return res;
    },
    [rawDatesInput, holidays]
  );

  // Keyboard shortcut handler: Ctrl + Enter / Cmd + Enter
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const res = handleValidateNow();
      if (res.isExactly200 && !res.hasErrors) {
        toast.success(`200 dias válidos identificados! Pronto para salvar.`);
      } else if (res.hasErrors) {
        toast.error(`Foram encontrados erros de formatação ou duplicidades.`);
      } else {
        toast.info(
          `Processado: ${res.totalCount}/200 dias (${
            res.remainingCount > 0 ? `faltam ${res.remainingCount}` : `excedente de ${res.exceededCount}`
          }).`
        );
      }
    }
  };

  // Helper: Load official 200 days template
  const handleLoadOfficialDefault = () => {
    const defaultDays = generateOfficial200SchoolDays2027(holidays);
    const joined = defaultDays.join('\n');
    setRawDatesInput(joined);
    handleValidateNow(joined);
    toast.success(`Padrão Oficial de 200 Dias da SME carregado no editor.`);
  };

  // Helper: Clear textarea
  const handleClearInput = () => {
    if (rawDatesInput.trim().length > 0) {
      if (window.confirm('Deseja realmente limpar o campo de datas?')) {
        setRawDatesInput('');
        setParsedResult(parseAndValidateSchoolDates('', holidays));
      }
    }
  };

  // Save calendar configuration with backend authorization check and audit trail
  const handleConfirmSaveCalendar = async () => {
    if (!isAdmin) {
      toast.error('Apenas administradores possuem permissão para alterar o calendário oficial.');
      return;
    }

    if (!parsedResult.isExactly200 || parsedResult.hasErrors) {
      toast.error('O calendário deve conter exatamente 200 dias válidos e sem erros.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveStoredOfficialCalendarConfig(
        rawDatesInput,
        userEmail,
        userName,
        calendarConfig.year || 2027
      );

      if (!res.ok || !res.calendarConfig) {
        toast.error(res.error || 'Falha ao salvar calendário oficial.');
        setIsSaving(false);
        return;
      }

      setCalendarConfig(res.calendarConfig);
      setAuditLogs(getStoredCalendarAuditLogs());
      setIsConfirmModalOpen(false);

      // Sincroniza distribuição mensal com todas as turmas da escola
      if (classes.length > 0 && onUpdateClasses) {
        const dist = res.calendarConfig.monthlyDistribution;
        const updatedClasses = classes.map((cls) => {
          const updatedMonthlyDays = {
            fevereiro: dist['Fevereiro'] || 16,
            marco: dist['Março'] || 22,
            abril: dist['Abril'] || 20,
            maio: dist['Maio'] || 20,
            junho: dist['Junho'] || 20,
            julho: dist['Julho'] || 10,
            agosto: dist['Agosto'] || 22,
            setembro: dist['Setembro'] || 20,
            outubro: dist['Outubro'] || 20,
            novembro: dist['Novembro'] || 18,
            dezembro: dist['Dezembro'] || 12,
          };
          return {
            ...cls,
            diasLetivosMes: updatedMonthlyDays,
          };
        });
        onUpdateClasses(updatedClasses);
      }

      toast.success(
        `Calendário Oficial de 200 Dias publicado com sucesso e replicado para as turmas!`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Erro inesperado ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  // Holiday management actions
  const handleOpenAddHoliday = () => {
    setEditingHoliday(null);
    setHolidayFormDate('');
    setHolidayFormName('');
    setHolidayFormType('municipal');
    setIsHolidayModalOpen(true);
  };

  const handleOpenEditHoliday = (h: SchoolHoliday) => {
    setEditingHoliday(h);
    setHolidayFormDate(h.date);
    setHolidayFormName(h.name);
    setHolidayFormType(h.type);
    setIsHolidayModalOpen(true);
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Apenas administradores podem gerenciar feriados.');
      return;
    }

    const cleanDate = holidayFormDate.trim();
    const cleanName = holidayFormName.trim();
    if (!cleanDate || !cleanName) {
      toast.error('Preencha a data e a descrição do feriado.');
      return;
    }

    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(cleanDate)) {
      toast.error('Data deve estar estritamente no formato DD/MM/AAAA.');
      return;
    }

    const holidayToSave: SchoolHoliday = {
      id: editingHoliday?.id || `hol-${Date.now()}`,
      date: cleanDate,
      name: cleanName,
      type: holidayFormType,
      isOfficial: true,
    };

    const action = editingHoliday ? 'edit' : 'add';
    const res = await saveStoredHolidayAction(
      action,
      holidayToSave,
      holidayToSave.id,
      userEmail,
      userName
    );
    if (!res.ok) {
      toast.error(res.error || 'Falha ao salvar feriado.');
      return;
    }

    setHolidays(res.holidays);
    setAuditLogs(getStoredCalendarAuditLogs());
    setIsHolidayModalOpen(false);

    // Revalida datas do editor com a lista atualizada de feriados
    handleValidateNow();
    toast.success(
      editingHoliday
        ? `Feriado "${cleanName}" atualizado!`
        : `Feriado "${cleanName}" cadastrado com sucesso!`
    );
  };

  const handleDeleteHoliday = async (holiday: SchoolHoliday) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem excluir feriados.');
      return;
    }
    if (!window.confirm(`Deseja realmente excluir o feriado "${holiday.name}" (${holiday.date})?`)) {
      return;
    }

    const res = await saveStoredHolidayAction(
      'delete',
      holiday,
      holiday.id,
      userEmail,
      userName
    );
    if (!res.ok) {
      toast.error(res.error || 'Falha ao excluir feriado.');
      return;
    }

    setHolidays(res.holidays);
    setAuditLogs(getStoredCalendarAuditLogs());
    handleValidateNow();
    toast.success(`Feriado "${holiday.name}" excluído.`);
  };

  // Preview filtering
  const filteredPreviewDays = useMemo(() => {
    let list = parsedResult.calendarDays;
    if (selectedPreviewMonth !== 'all') {
      list = list.filter((d) => d.month === selectedPreviewMonth);
    }
    if (searchPreviewDate.trim()) {
      const q = searchPreviewDate.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.date.includes(q) ||
          d.dayOfWeek.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [parsedResult.calendarDays, selectedPreviewMonth, searchPreviewDate]);

  // Calendar visual generation for selected month
  const visualMonthDays = useMemo(() => {
    const year = calendarConfig.year || 2027;
    const daysInMonth = new Date(year, visualCalendarMonth, 0).getDate();
    const firstDayOfWeek = new Date(year, visualCalendarMonth - 1, 1).getDay(); // 0 = Dom
    const pad = (n: number) => n.toString().padStart(2, '0');

    const activeSchoolDayMap = new Map<string, string>();
    parsedResult.calendarDays.forEach((d) => {
      activeSchoolDayMap.set(d.date, d.type);
    });

    const holidayMap = new Map<string, SchoolHoliday>();
    holidays.forEach((h) => {
      holidayMap.set(h.date, h);
    });

    const slots = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      slots.push({ isEmpty: true, id: `empty-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${pad(day)}/${pad(visualCalendarMonth)}/${year}`;
      const dateObj = new Date(year, visualCalendarMonth - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const schoolDayType = activeSchoolDayMap.get(dateStr);
      const holiday = holidayMap.get(dateStr);

      slots.push({
        isEmpty: false,
        id: dateStr,
        dayNumber: day,
        dateStr,
        dayOfWeek: DAYS_OF_WEEK_PT[dayOfWeek],
        isWeekend,
        isSchoolDay: !!schoolDayType,
        schoolDayType,
        holiday,
      });
    }

    return slots;
  }, [calendarConfig.year, visualCalendarMonth, parsedResult.calendarDays, holidays]);

  return (
    <div className="flex flex-col h-[calc(100dvh-5.5rem)] lg:h-[calc(100vh-6rem)] max-w-7xl mx-auto w-full bg-slate-50/70 rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden animate-gentle-fade">
      {/* ========================================================================= */}
      {/* 1. CABEÇALHO FIXO (SHRINK-0) — NUNCA ROLA FORA DA TELA                     */}
      {/* ========================================================================= */}
      <header className="shrink-0 bg-white/95 backdrop-blur-md px-4 sm:px-6 pt-3 pb-2.5 border-b border-slate-200/90 space-y-2 z-10">
        {/* Breadcrumb e Informações Rápidas */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 flex-wrap">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Voltar</span>
              </button>
            )}
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">200 Dias Letivos</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600 truncate max-w-[220px] sm:max-w-none">{SCHOOL_NAME}</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            {isLoadingServer && (
              <span className="text-slate-400 inline-flex items-center gap-1 font-mono text-[11px]">
                <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                <span className="hidden sm:inline">Sincronizando...</span>
              </span>
            )}
            <a
              href={savedSheet.fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors text-xs"
            >
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              <span className="hidden sm:inline">Planilha Oficial ↗</span>
            </a>
          </div>
        </div>

        {/* Título Principal e Tabs em Linha Única Compacta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight shrink-0">
              Calendário Oficial
            </h1>
            <span className="text-xs text-slate-500 hidden md:inline">
              Ano Letivo {calendarConfig.year || 2027} · LDB 200 Dias
            </span>
          </div>

          {/* Segmented Tabs */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'editor'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">edit_note</span>
              <span>Editor de 200 Dias</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('feriados')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'feriados'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">celebration</span>
              <span>Feriados ({holidays.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calendario')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'calendario'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">calendar_month</span>
              <span>Grade Anual</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('auditoria')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'auditoria'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">history_edu</span>
              <span>Auditoria ({auditLogs.length})</span>
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. ÁREA DE ROLAGEM INTERNA CONTIDA (FLEX-1 OVERFLOW-Y-AUTO)              */}
      {/* ========================================================================= */}
      <main className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 focus:outline-none">
        {/* Alerta Não-Admin */}
        {!isAdmin && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-700 text-base shrink-0">lock</span>
            <span>Acesso Somente Leitura: apenas administradores podem salvar ou alterar o calendário e a sincronização.</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SELETOR VISUAL: FREQUÊNCIA DE SINCRONIZAÇÃO AUTOMÁTICA (30, 60, 120 MIN)  */}
        {/* ========================================================================= */}
        <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">cloud_sync</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-slate-900">
                    Sincronização Automática com o Google Sheets
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                    Ativo: a cada {syncFrequency} min
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Ajuste o intervalo de atualização em segundo plano para calibrar dados recentes, cota da API Google e desempenho.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Dropdown Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 rounded-xl px-2.5 py-1">
                <label htmlFor="sheets-sync-select" className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                  Intervalo:
                </label>
                <select
                  id="sheets-sync-select"
                  value={syncFrequency}
                  onChange={(e) => handleSelectFrequency(Number(e.target.value) as GoogleSheetsSyncFrequency)}
                  disabled={!isAdmin}
                  className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer disabled:opacity-50"
                  aria-label="Selecionar frequência de sincronização automática com o Google Sheets"
                >
                  <option value={30}>30 minutos (Alta Frequência)</option>
                  <option value={60}>60 minutos (Recomendado SME)</option>
                  <option value={120}>120 minutos (Econômico)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleManualSyncTrigger}
                disabled={isSyncingNow}
                className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-slate-200/90 cursor-pointer disabled:opacity-50"
                title="Forçar sincronização com a Planilha Oficial agora"
              >
                <span className={`material-symbols-outlined text-[15px] ${isSyncingNow ? 'animate-spin' : ''}`}>
                  sync
                </span>
                <span>{isSyncingNow ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
              </button>
            </div>
          </div>

          {/* Seletor de Botões de Rádio com Cards Visuais: 30 min, 60 min, 120 min */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Intervalo de Sincronização Automática com o Google Sheets">
            {/* Opção 30 Minutos */}
            <label
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-2 select-none ${
                syncFrequency === 30
                  ? 'bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-600/20 shadow-xs'
                  : 'bg-slate-50/60 border-slate-200/90 hover:bg-slate-100/70 hover:border-slate-300'
              } ${!isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="syncIntervalRadio"
                    value={30}
                    checked={syncFrequency === 30}
                    onChange={() => handleSelectFrequency(30)}
                    disabled={!isAdmin}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                  <span className="font-bold text-slate-900 text-sm font-mono tabular-nums">30 Minutos</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                  Alta Frequência
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Ideal para períodos de fechamento bimestral e lançamento ativo de faltas pelos professores.
              </p>
              <div className="text-[10px] text-slate-500 font-medium pt-1.5 border-t border-slate-200/50 flex items-center justify-between">
                <span>Consumo da API: Maior</span>
                {syncFrequency === 30 && (
                  <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span> Ativo
                  </span>
                )}
              </div>
            </label>

            {/* Opção 60 Minutos (Recomendado) */}
            <label
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-2 select-none ${
                syncFrequency === 60
                  ? 'bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-600/20 shadow-xs'
                  : 'bg-slate-50/60 border-slate-200/90 hover:bg-slate-100/70 hover:border-slate-300'
              } ${!isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="syncIntervalRadio"
                    value={60}
                    checked={syncFrequency === 60}
                    onChange={() => handleSelectFrequency(60)}
                    disabled={!isAdmin}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                  <span className="font-bold text-slate-900 text-sm font-mono tabular-nums">60 Minutos</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                  Recomendado
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Padrão institucional balanceado: dados sempre recentes com estabilidade total.
              </p>
              <div className="text-[10px] text-slate-500 font-medium pt-1.5 border-t border-slate-200/50 flex items-center justify-between">
                <span>Consumo da API: Equilibrado</span>
                {syncFrequency === 60 && (
                  <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span> Ativo
                  </span>
                )}
              </div>
            </label>

            {/* Opção 120 Minutos */}
            <label
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-2 select-none ${
                syncFrequency === 120
                  ? 'bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-600/20 shadow-xs'
                  : 'bg-slate-50/60 border-slate-200/90 hover:bg-slate-100/70 hover:border-slate-300'
              } ${!isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="syncIntervalRadio"
                    value={120}
                    checked={syncFrequency === 120}
                    onChange={() => handleSelectFrequency(120)}
                    disabled={!isAdmin}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                  <span className="font-bold text-slate-900 text-sm font-mono tabular-nums">120 Minutos</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                  Econômico
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Máxima preservação de cota e performance, ideal para períodos letivos regulares.
              </p>
              <div className="text-[10px] text-slate-500 font-medium pt-1.5 border-t border-slate-200/50 flex items-center justify-between">
                <span>Consumo da API: Mínimo</span>
                {syncFrequency === 120 && (
                  <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span> Ativo
                  </span>
                )}
              </div>
            </label>
          </div>
        </section>

        {/* --------------------------------------------------------------------- */}
        {/* ABA 1: EDITOR DE 200 DIAS                                             */}
        {/* --------------------------------------------------------------------- */}
        {activeTab === 'editor' && (
          <div className="space-y-4">
            {/* Split em 2 Colunas */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Coluna Esquerda: Editor de Texto */}
              <div className="lg:col-span-7 bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-bold text-slate-900">
                      Inserção Oficial de Datas (DD/MM/AAAA)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Cole uma data por linha. Ex: <code className="font-mono text-slate-800">03/02/2027</code>.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleLoadOfficialDefault}
                      disabled={!isAdmin}
                      className="h-7 px-2.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors border border-slate-200 disabled:opacity-50 cursor-pointer"
                      title="Carregar matriz oficial de 200 dias da SME Jundiaí"
                    >
                      <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
                      <span>Padrão 200 Dias</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearInput}
                      disabled={!isAdmin || !rawDatesInput}
                      className="h-7 px-2 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-[11px] font-medium inline-flex items-center gap-0.5 transition-colors disabled:opacity-40 cursor-pointer"
                      title="Limpar campo de datas"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                      <span>Limpar</span>
                    </button>
                  </div>
                </div>

                {/* Textarea */}
                <div className="relative">
                  <textarea
                    value={rawDatesInput}
                    onChange={(e) => {
                      setRawDatesInput(e.target.value);
                      handleValidateNow(e.target.value);
                    }}
                    onKeyDown={handleTextareaKeyDown}
                    disabled={!isAdmin}
                    placeholder={`03/02/2027\n04/02/2027\n05/02/2027\n08/02/2027...`}
                    className="w-full h-44 sm:h-52 font-mono text-xs p-3 rounded-lg border border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none leading-relaxed text-slate-900 bg-slate-50/50 resize-y disabled:bg-slate-100 disabled:text-slate-500"
                  />

                  <div className="absolute right-2 bottom-2 text-[10px] text-slate-400 font-mono bg-white/90 px-1.5 py-0.5 rounded border border-slate-200 pointer-events-none">
                    <strong>Ctrl + Enter</strong> para processar
                  </div>
                </div>

                {/* Erros / Alertas */}
                {parsedResult.hasErrors && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-950 space-y-1.5 text-xs">
                    <div className="font-semibold text-rose-900 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-rose-700">error</span>
                      <span>Erros que impedem a homologação:</span>
                    </div>
                    {parsedResult.duplicateEntries.length > 0 && (
                      <div className="text-[11px] text-rose-800">
                        <strong>Duplicadas ({parsedResult.duplicateEntries.length}):</strong>{' '}
                        {parsedResult.duplicateEntries.map((d) => `${d.date} (${d.occurrences}x)`).join(', ')}
                      </div>
                    )}
                    {parsedResult.invalidEntries.length > 0 && (
                      <div className="max-h-24 overflow-y-auto space-y-0.5 text-[11px] font-mono bg-white p-2 rounded border border-rose-200">
                        {parsedResult.invalidEntries.map((inv, idx) => (
                          <div key={idx} className="text-rose-800">
                            Linha {inv.line}: "{inv.raw}" — {inv.reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Coluna Direita: Distribuição Mensal e Diagnóstico */}
              <div className="lg:col-span-5 bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Distribuição Mensal dos Dias
                  </h3>
                  <span className="text-xs font-mono font-bold text-slate-800">
                    Total: {parsedResult.totalCount}d
                  </span>
                </div>

                {/* Grid 4x3 dos 12 Meses */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 text-center">
                  {MONTH_NAMES_PT.map((m) => {
                    const count = parsedResult.monthlyDistribution[m] || 0;
                    return (
                      <div
                        key={m}
                        className={`p-1.5 rounded-md border text-center transition-all ${
                          count > 0
                            ? 'bg-slate-50 border-slate-200 text-slate-900'
                            : 'bg-slate-50/30 border-slate-100 text-slate-400'
                        }`}
                      >
                        <span className="text-[10px] block truncate font-medium text-slate-500">
                          {m.substring(0, 3)}
                        </span>
                        <span className="text-xs font-bold font-mono tabular-nums block">
                          {count}d
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Indicadores Compactos */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                    <span className="text-[10px] text-slate-500 block">Sábados Letivos</span>
                    <span className="font-bold text-slate-900 font-mono tabular-nums">
                      {parsedResult.weekendDays.filter((w) => w.isSaturday).length}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                    <span className="text-[10px] text-slate-500 block">Feriados Coincidentes</span>
                    <span className={`font-bold font-mono tabular-nums ${
                      parsedResult.holidayConflicts.length > 0 ? 'text-amber-800' : 'text-slate-900'
                    }`}>
                      {parsedResult.holidayConflicts.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabela de Pré-visualização com Altura Delimitada */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Pré-visualização Cronológica ({filteredPreviewDays.length} de {parsedResult.totalCount} Dias)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Rolagem interna suave com filtro instantâneo por mês.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <select
                    value={selectedPreviewMonth}
                    onChange={(e) => setSelectedPreviewMonth(e.target.value)}
                    className="h-7 px-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 bg-white"
                  >
                    <option value="all">Todos os Meses ({parsedResult.totalCount}d)</option>
                    {MONTH_NAMES_PT.map((m) => (
                      <option key={m} value={m}>
                        {m} ({parsedResult.monthlyDistribution[m] || 0}d)
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={searchPreviewDate}
                    onChange={(e) => setSearchPreviewDate(e.target.value)}
                    placeholder="Buscar data..."
                    className="h-7 px-2 rounded-md border border-slate-200 text-xs text-slate-800 w-28 sm:w-36 outline-none"
                  />
                </div>
              </div>

              <div className="max-h-56 sm:max-h-64 overflow-y-auto border border-slate-200 rounded-lg overscroll-contain">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold z-10">
                    <tr>
                      <th className="py-2 px-3 w-12 font-mono text-center">Nº</th>
                      <th className="py-2 px-3 w-28 font-mono">Data</th>
                      <th className="py-2 px-3">Dia da Semana</th>
                      <th className="py-2 px-3">Mês</th>
                      <th className="py-2 px-3">Classificação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredPreviewDays.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-slate-400 font-sans text-xs">
                          Nenhuma data corresponde aos filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredPreviewDays.map((d, idx) => (
                        <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-1.5 px-3 text-slate-400 text-center font-mono tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-3 font-semibold text-slate-900 font-mono tabular-nums">
                            {d.date}
                          </td>
                          <td className="py-1.5 px-3 text-slate-700 font-sans">{d.dayOfWeek}</td>
                          <td className="py-1.5 px-3 text-slate-600 font-sans">{d.month}</td>
                          <td className="py-1.5 px-3 font-sans">
                            {d.isSaturday ? (
                              <span className="text-indigo-800 font-semibold">
                                Sábado Letivo Temático
                              </span>
                            ) : d.holidayConflict ? (
                              <span className="text-amber-800 font-medium">
                                {d.holidayConflict}
                              </span>
                            ) : (
                              <span className="text-slate-700">Dia Letivo Regular</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------------- */}
        {/* ABA 2: FERIADOS & RECESSOS                                            */}
        {/* --------------------------------------------------------------------- */}
        {activeTab === 'feriados' && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Feriados Oficiais e Recessos Escolares ({holidays.length})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Datas não-letivas com detecção automática de conflitos com os 200 dias.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddHoliday}
                disabled={!isAdmin}
                className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-auto"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                <span>Novo Feriado</span>
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg overscroll-contain">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold z-10">
                  <tr>
                    <th className="py-2 px-3 w-28 font-mono">Data</th>
                    <th className="py-2 px-3">Nome / Motivo</th>
                    <th className="py-2 px-3 w-36">Âmbito</th>
                    <th className="py-2 px-3 w-32">Status 200 Dias</th>
                    <th className="py-2 px-3 w-20 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holidays.map((h) => {
                    const isConflict = parsedResult.validDates.includes(h.date);
                    return (
                      <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900 tabular-nums">
                          {h.date}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800">{h.name}</td>
                        <td className="py-2 px-3 text-slate-600 capitalize">
                          {h.type.replace('_', ' ')}
                        </td>
                        <td className="py-2 px-3">
                          {isConflict ? (
                            <span className="text-rose-700 font-medium inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">warning</span>
                              Dia Letivo Ativo
                            </span>
                          ) : (
                            <span className="text-slate-400">Sem conflito</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditHoliday(h)}
                              disabled={!isAdmin}
                              className="p-1 text-slate-500 hover:text-slate-900 rounded disabled:opacity-40 cursor-pointer"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHoliday(h)}
                              disabled={!isAdmin}
                              className="p-1 text-slate-500 hover:text-rose-600 rounded disabled:opacity-40 cursor-pointer"
                              title="Excluir"
                            >
                              <span className="material-symbols-outlined text-[15px]">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------------- */}
        {/* ABA 3: GRADE VISUAL ANUAL                                             */}
        {/* --------------------------------------------------------------------- */}
        {activeTab === 'calendario' && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Grade Visual do Calendário Escolar {calendarConfig.year || 2027}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Selecione o mês para inspecionar os dias letivos e feriados.
                </p>
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {MONTH_NAMES_PT.map((m, idx) => {
                  const monthNum = idx + 1;
                  const isSelected = visualCalendarMonth === monthNum;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setVisualCalendarMonth(monthNum)}
                      className={`px-2 py-1 text-xs font-semibold rounded transition-colors cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {m.substring(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <span className="text-base font-bold text-slate-900">
                {MONTH_NAMES_PT[visualCalendarMonth - 1]} {calendarConfig.year || 2027}
              </span>
              <span className="text-xs text-slate-600 font-mono">
                Dias Letivos:{' '}
                <strong>
                  {parsedResult.monthlyDistribution[MONTH_NAMES_PT[visualCalendarMonth - 1]] || 0}d
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, idx) => (
                <div
                  key={dayName}
                  className={`py-1.5 font-semibold text-slate-500 border-b border-slate-200 ${
                    idx === 0 || idx === 6 ? 'bg-slate-50/70' : ''
                  }`}
                >
                  {dayName}
                </div>
              ))}

              {visualMonthDays.map((slot) => {
                if (slot.isEmpty) {
                  return <div key={slot.id} className="min-h-12 p-1 bg-slate-50/30 rounded-md" />;
                }

                let badgeColor = 'bg-white border-slate-200 text-slate-800';
                if (slot.holiday) {
                  badgeColor = 'bg-rose-50 border-rose-300 text-rose-900';
                } else if (slot.schoolDayType === 'sabado_letivo') {
                  badgeColor = 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold';
                } else if (slot.isSchoolDay) {
                  badgeColor = 'bg-slate-900 text-white font-semibold border-slate-900';
                } else if (slot.isWeekend) {
                  badgeColor = 'bg-slate-50 border-slate-200/60 text-slate-400';
                }

                return (
                  <div
                    key={slot.id}
                    className={`min-h-12 p-1.5 rounded-md border flex flex-col justify-between transition-all ${badgeColor}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs tabular-nums">{slot.dayNumber}</span>
                      {slot.isSchoolDay && (
                        <span className="text-[9px] font-sans opacity-90">Letivo</span>
                      )}
                    </div>
                    <div className="text-[9px] truncate text-left mt-0.5">
                      {slot.holiday ? slot.holiday.name : slot.schoolDayType === 'sabado_letivo' ? 'Sábado' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------------- */}
        {/* ABA 4: AUDITORIA                                                      */}
        {/* --------------------------------------------------------------------- */}
        {activeTab === 'auditoria' && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Histórico Sequencial de Auditoria ({auditLogs.length} Registros)
              </h2>
              <p className="text-[11px] text-slate-500">
                Registro auditável de todas as publicações de dias letivos e alterações de feriados.
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg overscroll-contain">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold z-10">
                  <tr>
                    <th className="py-2 px-3 w-36 font-mono">Data/Hora</th>
                    <th className="py-2 px-3 w-56">Responsável</th>
                    <th className="py-2 px-3 w-40">Operação</th>
                    <th className="py-2 px-3 w-28 font-mono">Dias</th>
                    <th className="py-2 px-3">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-5 text-center text-slate-400">
                        Nenhum registro de auditoria gravado ainda.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-1.5 px-3 font-mono text-slate-600 tabular-nums text-[11px]">
                          {new Date(log.timestampISO).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-1.5 px-3">
                          <span className="font-semibold text-slate-900 block truncate">{log.adminName}</span>
                          <span className="text-[10px] text-slate-500 font-mono block truncate">
                            {log.adminEmail}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 font-medium text-slate-800">
                          {log.action === 'UPDATE_200_DAYS'
                            ? 'Publicação de 200 Dias'
                            : log.action === 'ADD_HOLIDAY'
                            ? 'Adição de Feriado'
                            : log.action === 'EDIT_HOLIDAY'
                            ? 'Edição de Feriado'
                            : log.action === 'DELETE_HOLIDAY'
                            ? 'Exclusão de Feriado'
                            : log.action === 'RESTORE_DEFAULT'
                            ? 'Restauração Padrão'
                            : 'Operação'}
                        </td>
                        <td className="py-1.5 px-3 font-mono tabular-nums text-slate-700 text-[11px]">
                          {log.previousDaysCount !== undefined && log.newDaysCount !== undefined ? (
                            <span>
                              {log.previousDaysCount}d → <strong>{log.newDaysCount}d</strong>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600 text-[11px]">{log.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 3. RODAPÉ DE AÇÃO FIXO (STICKY FOOTER SHRINK-0) — SEMPRE VISÍVEL          */}
      {/* ========================================================================= */}
      <footer className="shrink-0 sticky bottom-0 bg-white/95 backdrop-blur-sm px-4 sm:px-6 py-2.5 sm:py-3 border-t border-slate-200/90 shadow-sm z-20 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
        {/* Zona Esquerda: Indicadores e Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-950">
              {parsedResult.totalCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ 200 dias</span>
          </div>

          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 ${
              parsedResult.isExactly200 && !parsedResult.hasErrors
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                : parsedResult.hasErrors
                ? 'bg-rose-100 text-rose-900 border border-rose-200'
                : 'bg-amber-100 text-amber-900 border border-amber-200'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">
              {parsedResult.isExactly200 && !parsedResult.hasErrors
                ? 'check_circle'
                : parsedResult.hasErrors
                ? 'error'
                : 'schedule'}
            </span>
            <span>
              {parsedResult.isExactly200 && !parsedResult.hasErrors
                ? 'Meta de 200 Dias Atingida'
                : parsedResult.hasErrors
                ? 'Corrija os erros'
                : parsedResult.remainingCount > 0
                ? `Faltam ${parsedResult.remainingCount} dias`
                : `Excesso de ${parsedResult.exceededCount} dias`}
            </span>
          </span>

          <span className="text-[11px] text-slate-500 hidden md:inline">
            · 40 turmas vinculadas · Base Oficial SED
          </span>
        </div>

        {/* Zona Direita: Botões de Ação Imediata */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {activeTab === 'editor' && (
            <>
              <button
                type="button"
                onClick={() => {
                  const res = handleValidateNow();
                  if (res.isExactly200 && !res.hasErrors) {
                    toast.success('200 dias válidos identificados.');
                  } else if (res.hasErrors) {
                    toast.error('Corrija os erros apontados.');
                  } else {
                    toast.info(`Total: ${res.totalCount}/200 dias.`);
                  }
                }}
                className="h-10 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                <span>Processar</span>
                <kbd className="hidden sm:inline px-1.5 py-0.5 text-[10px] bg-slate-200 rounded font-mono">
                  Ctrl+↵
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(true)}
                disabled={!isAdmin || !parsedResult.isExactly200 || parsedResult.hasErrors || isSaving}
                className="h-10 px-4 sm:px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Confirmar &amp; Publicar (200 Dias)</span>
              </button>
            </>
          )}

          {activeTab === 'feriados' && (
            <button
              type="button"
              onClick={handleOpenAddHoliday}
              disabled={!isAdmin}
              className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Novo Feriado</span>
            </button>
          )}

          {activeTab === 'calendario' && (
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span>
              <span>Abrir Editor de Datas</span>
            </button>
          )}

          {activeTab === 'auditoria' && (
            <span className="text-xs text-slate-500 font-mono">
              Registros criptografados no servidor
            </span>
          )}
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMAR PUBLICAÇÃO — RESPONSIVO, SEM SCROLL INFINITO             */}
      {/* ========================================================================= */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/65 backdrop-blur-xs overflow-hidden animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-scale-up">
            {/* Header Fixo */}
            <div className="shrink-0 p-4 sm:p-5 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">verified</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-slate-950 truncate">
                  Confirmar e Publicar Calendário Oficial
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Ano Letivo {calendarConfig.year || 2027} · {SCHOOL_NAME}
                </p>
              </div>
            </div>

            {/* Conteúdo com Scroll Contido Interno */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 overscroll-contain text-xs text-slate-700 leading-normal">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <p className="font-bold text-slate-900 text-sm">
                  Homologação de exatos 200 dias letivos:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                  <li>Replicado automaticamente para as 40 turmas da escola.</li>
                  <li>Base oficial para cálculo de frequência escolar e relatórios SED.</li>
                  <li>
                    Gravado sob o usuário: <span className="font-mono font-bold text-slate-900">{userEmail}</span>.
                  </li>
                </ul>
              </div>
              <p className="text-[11px] text-slate-500">
                Após a homologação, as datas letivas passam a vigorar imediatamente em todo o sistema.
              </p>
            </div>

            {/* Rodapé Sticky Sempre Visível Sem Scroll */}
            <div className="shrink-0 p-4 border-t border-slate-100 bg-white/95 backdrop-blur-xs sticky bottom-0 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSaving}
                className="h-10 sm:h-11 px-4 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveCalendar}
                disabled={isSaving}
                className="h-10 sm:h-11 px-5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs whitespace-nowrap"
              >
                {isSaving ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>Gravando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px] text-emerald-400">done_all</span>
                    <span>Confirmar Homologação (200 Dias)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADICIONAR / EDITAR FERIADO                                         */}
      {/* ========================================================================= */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/65 backdrop-blur-xs overflow-hidden animate-fade-in">
          <form
            onSubmit={handleSaveHoliday}
            className="bg-white rounded-2xl max-w-sm sm:max-w-md w-full shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-scale-up"
          >
            <div className="shrink-0 p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-950">
                {editingHoliday ? 'Editar Feriado / Recesso' : 'Cadastrar Novo Feriado'}
              </h3>
              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Data (formato DD/MM/AAAA)
                </label>
                <input
                  type="text"
                  required
                  placeholder="20/11/2027"
                  value={holidayFormDate}
                  onChange={(e) => setHolidayFormDate(e.target.value)}
                  className="w-full font-mono px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-slate-900 text-xs sm:text-sm font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nome / Motivo do Feriado
                </label>
                <input
                  type="text"
                  required
                  placeholder="Dia da Consciência Negra"
                  value={holidayFormName}
                  onChange={(e) => setHolidayFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-slate-900 text-xs sm:text-sm font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Classificação / Âmbito</label>
                <select
                  value={holidayFormType}
                  onChange={(e) => setHolidayFormType(e.target.value as HolidayScopeType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-slate-900 bg-white text-xs sm:text-sm font-medium"
                >
                  <option value="municipal">Municipal (Jundiaí / SP)</option>
                  <option value="estadual">Estadual (São Paulo)</option>
                  <option value="nacional">Nacional</option>
                  <option value="recesso">Recesso Escolar (SME)</option>
                  <option value="ponto_facultativo">Ponto Facultativo</option>
                </select>
              </div>
            </div>

            <div className="shrink-0 p-3 sm:p-4 border-t border-slate-100 bg-white/95 backdrop-blur-xs flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(false)}
                className="h-10 px-4 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-10 px-5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                {editingHoliday ? 'Salvar Alterações' : 'Cadastrar Feriado'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
