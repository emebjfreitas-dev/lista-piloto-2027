import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  Copy,
  FileSpreadsheet,
  History,
  ListChecks,
  Wand2,
  RotateCcw,
  Lock,
  ArrowLeft,
  CalendarPlus,
  Check,
  X,
} from 'lucide-react';
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
  generateOfficial200SchoolDaysForYear,
  toggleDateInSchoolDaysList,
  fillMonthWeekdaysInSchoolDaysList,
  clearMonthInSchoolDaysList,
  removeHolidayConflictsFromSchoolDays,
  autoBalanceSchoolDaysTo200,
  OFFICIAL_MONTHLY_TARGETS_2027,
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
  pullSharedSchoolStateFromServer,
} from '../services/db';
import { SCHOOL_NAME } from '../data/mockData';
import {
  getGoogleSheetsSyncFrequency,
  saveGoogleSheetsSyncFrequency,
  GoogleSheetsSyncFrequency,
} from '../services/googleSheetsApi';

interface DiasLetivosScreenProps {
  userRole?: UserRole;
  userEmail?: string;
  userName?: string;
  classes?: ClassGroup[];
  onUpdateClasses?: (updatedClasses: ClassGroup[]) => void;
  onNavigateToSheet?: () => void;
  onBack: () => void;
  embedded?: boolean;
}

type ActiveTab = 'calendario' | 'editor' | 'feriados' | 'auditoria';
type CalendarClickMode = 'toggle_school_day' | 'mark_holiday';

export const DiasLetivosScreen: React.FC<DiasLetivosScreenProps> = ({
  userRole = 'admin',
  userEmail = 'emebjfreitas@jundiai.sp.gov.br',
  userName = 'Administrador Escolar',
  classes = [],
  onUpdateClasses,
  onBack,
  embedded = false,
}) => {
  const isAdmin =
    userRole === 'admin' ||
    userEmail.startsWith('emebjfreitas@') ||
    userEmail.includes('admin') ||
    userEmail.includes('direcao') ||
    userEmail.includes('coordenacao');

  const [activeTab, setActiveTab] = useState<ActiveTab>('calendario');
  const [clickMode, setClickMode] = useState<CalendarClickMode>('toggle_school_day');

  // Official Calendar State
  const [calendarConfig, setCalendarConfig] = useState<OfficialCalendarConfig>(() =>
    getStoredOfficialCalendarConfig()
  );
  const [selectedYear, setSelectedYear] = useState<number>(() => calendarConfig.year || 2027);
  const [holidays, setHolidays] = useState<SchoolHoliday[]>(() => getStoredHolidays());
  const [auditLogs, setAuditLogs] = useState<CalendarAuditLogEntry[]>(() =>
    getStoredCalendarAuditLogs()
  );
  const [isLoadingServer, setIsLoadingServer] = useState<boolean>(false);

  // Two-way synchronized dates input & validation
  const [rawDatesInput, setRawDatesInput] = useState<string>(() =>
    calendarConfig.schoolDays.join('\n')
  );
  const [parsedResult, setParsedResult] = useState<ParsedDateResult>(() =>
    parseAndValidateSchoolDates(calendarConfig.schoolDays.join('\n'), holidays)
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const hasUnsavedRef = useRef<boolean>(false);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmClearInput, setConfirmClearInput] = useState<boolean>(false);

  // Filters & Month focus
  const [visualCalendarMonth, setVisualCalendarMonth] = useState<number>(2); // Fevereiro padrão
  const [searchPreviewDate, setSearchPreviewDate] = useState<string>('');
  const [selectedPreviewMonth, setSelectedPreviewMonth] = useState<string>('all');
  const [holidayScopeFilter, setHolidayScopeFilter] = useState<'all' | HolidayScopeType>('all');
  const [confirmDeleteHolidayId, setConfirmDeleteHolidayId] = useState<string | null>(null);

  // Holidays Management Modal State
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState<boolean>(false);
  const [editingHoliday, setEditingHoliday] = useState<SchoolHoliday | null>(null);
  const [holidayFormDate, setHolidayFormDate] = useState<string>('');
  const [holidayFormName, setHolidayFormName] = useState<string>('');
  const [holidayFormType, setHolidayFormType] = useState<HolidayScopeType>('municipal');
  const [removeHolidayFromSchoolDays, setRemoveHolidayFromSchoolDays] = useState<boolean>(true);

  // Sync frequency
  const [syncFrequency, setSyncFrequency] = useState<GoogleSheetsSyncFrequency>(() =>
    getGoogleSheetsSyncFrequency()
  );
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);

  const applyDatesList = useCallback(
    (nextDates: string[], holidayList: SchoolHoliday[] = holidays, markDirty = true) => {
      const joined = nextDates.join('\n');
      setRawDatesInput(joined);
      const res = parseAndValidateSchoolDates(joined, holidayList);
      setParsedResult(res);
      if (markDirty) {
        hasUnsavedRef.current = true;
        setHasUnsavedChanges(true);
      }
      return res;
    },
    [holidays]
  );

  const handleValidateNow = useCallback(
    (textToValidate?: string, customHolidays?: SchoolHoliday[], markDirty = false) => {
      const targetText = textToValidate !== undefined ? textToValidate : rawDatesInput;
      const res = parseAndValidateSchoolDates(targetText, customHolidays || holidays);
      setParsedResult(res);
      if (markDirty) {
        hasUnsavedRef.current = true;
        setHasUnsavedChanges(true);
      }
      return res;
    },
    [rawDatesInput, holidays]
  );

  const handleSelectFrequency = (freq: GoogleSheetsSyncFrequency) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem alterar a frequência de sincronização.');
      return;
    }
    setSyncFrequency(freq);
    saveGoogleSheetsSyncFrequency(freq);
    toast.success(`Sincronização automática ajustada para ${freq} minutos.`);
  };

  const handleManualSyncTrigger = async () => {
    setIsSyncingNow(true);
    try {
      localStorage.setItem('emeb_last_sed_auto_sync_at', new Date().toISOString());
      const [calData, sState] = await Promise.all([
        pullOfficialCalendarFromServer(),
        pullSharedSchoolStateFromServer(),
      ]);
      if (calData?.calendarConfig) {
        setCalendarConfig(calData.calendarConfig);
        setSelectedYear(calData.calendarConfig.year || 2027);
        setHolidays(calData.holidays);
        setAuditLogs(calData.auditLogs);
        if (!hasUnsavedRef.current) {
          const joined = calData.calendarConfig.schoolDays.join('\n');
          setRawDatesInput(joined);
          setParsedResult(parseAndValidateSchoolDates(joined, calData.holidays));
        }
      }
      if (sState && Array.isArray(sState.classes) && onUpdateClasses) {
        onUpdateClasses(sState.classes);
      }
      toast.success('Calendário e turmas sincronizados com o servidor.');
    } catch {
      toast.info('Dados locais verificados.');
    } finally {
      setIsSyncingNow(false);
    }
  };

  // Pull initial calendar state from backend once
  useEffect(() => {
    let isMounted = true;
    setIsLoadingServer(true);
    pullOfficialCalendarFromServer()
      .then((data) => {
        if (!isMounted || !data) return;
        setCalendarConfig(data.calendarConfig);
        setHolidays(data.holidays);
        setAuditLogs(data.auditLogs);
        if (!hasUnsavedRef.current) {
          setSelectedYear(data.calendarConfig.year || 2027);
          const joined = data.calendarConfig.schoolDays.join('\n');
          setRawDatesInput(joined);
          setParsedResult(parseAndValidateSchoolDates(joined, data.holidays));
        }
      })
      .catch(() => {
        // offline fallback silently handled
      })
      .finally(() => {
        if (isMounted) setIsLoadingServer(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Periodic background sync
  useEffect(() => {
    let isMounted = true;
    const intervalMs = syncFrequency * 60 * 1000;
    const performPeriodicSync = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        localStorage.setItem('emeb_last_sed_auto_sync_at', new Date().toISOString());
        const sState = await pullSharedSchoolStateFromServer();
        if (isMounted && onUpdateClasses && sState && Array.isArray(sState.classes)) {
          onUpdateClasses(sState.classes);
        }
      } catch {
        // ignore periodic background failure
      }
    };
    const intervalId = window.setInterval(performPeriodicSync, intervalMs);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [syncFrequency, onUpdateClasses]);

  // Actions: Template, Year Switch, Auto-Balance, Month Tools, Interactive Day Click
  const handleLoadOfficialDefault = (targetYear: number = selectedYear) => {
    if (!isAdmin) return;
    const defaultDays = generateOfficial200SchoolDaysForYear(targetYear, holidays);
    applyDatesList(defaultDays, holidays, true);
    toast.success(`Padrão SME de 200 dias gerado para ${targetYear}.`);
  };

  const handleYearChange = (nextYear: number) => {
    setSelectedYear(nextYear);
    if (!isAdmin) return;
    const defaultDays = generateOfficial200SchoolDaysForYear(nextYear, holidays);
    applyDatesList(defaultDays, holidays, true);
    toast.info(`Ano letivo alterado para ${nextYear} com matriz base de 200 dias.`);
  };

  const handleAutoBalance200 = () => {
    if (!isAdmin) return;
    const { dates, addedCount, removedCount } = autoBalanceSchoolDaysTo200(
      parsedResult.validDates,
      selectedYear,
      holidays
    );
    applyDatesList(dates, holidays, true);
    if (addedCount > 0) {
      toast.success(`Completado automaticamente: +${addedCount} dia(s) letivo(s) adicionado(s) para atingir 200.`);
    } else if (removedCount > 0) {
      toast.success(`Ajustado automaticamente: ${removedCount} dia(s) excedente(s) removido(s) para atingir 200.`);
    } else {
      toast.info('O calendário já totaliza exatamente 200 dias.');
    }
  };

  const handleRemoveHolidayConflicts = () => {
    if (!isAdmin) return;
    const { dates, removedCount } = removeHolidayConflictsFromSchoolDays(
      parsedResult.validDates,
      holidays
    );
    applyDatesList(dates, holidays, true);
    toast.success(`${removedCount} data(s) coincidente(s) com feriados removida(s) dos dias letivos.`);
  };

  const handleFillSelectedMonth = () => {
    if (!isAdmin) return;
    const updated = fillMonthWeekdaysInSchoolDaysList(
      parsedResult.validDates,
      selectedYear,
      visualCalendarMonth,
      holidays
    );
    applyDatesList(updated, holidays, true);
    toast.success(`Dias úteis de ${MONTH_NAMES_PT[visualCalendarMonth - 1]} preenchidos.`);
  };

  const handleClearSelectedMonth = () => {
    if (!isAdmin) return;
    const updated = clearMonthInSchoolDaysList(
      parsedResult.validDates,
      selectedYear,
      visualCalendarMonth
    );
    applyDatesList(updated, holidays, true);
    toast.info(`Dias de ${MONTH_NAMES_PT[visualCalendarMonth - 1]} removidos do rascunho.`);
  };

  const handleCalendarDayClick = (slot: {
    dateStr: string;
    isWeekend: boolean;
    isSchoolDay: boolean;
    holiday?: SchoolHoliday;
  }) => {
    if (!isAdmin) {
      toast.info('Modo somente leitura para perfil não administrador.');
      return;
    }

    if (clickMode === 'mark_holiday') {
      if (slot.holiday) {
        handleOpenEditHoliday(slot.holiday);
      } else {
        setEditingHoliday(null);
        setHolidayFormDate(slot.dateStr);
        setHolidayFormName('');
        setHolidayFormType('municipal');
        setRemoveHolidayFromSchoolDays(true);
        setIsHolidayModalOpen(true);
      }
      return;
    }

    // Modo 'toggle_school_day'
    if (slot.holiday && !slot.isSchoolDay) {
      toast.info(
        `${slot.dateStr} é "${slot.holiday.name}". Use o modo "Marcar Feriado" para editar ou remover.`,
        { duration: 3500 }
      );
      return;
    }

    const { dates, added } = toggleDateInSchoolDaysList(parsedResult.validDates, slot.dateStr);
    applyDatesList(dates, holidays, true);
    const label = slot.isWeekend ? 'Sábado letivo' : 'Dia letivo';
    toast.success(
      added ? `${slot.dateStr} adicionado como ${label}.` : `${slot.dateStr} marcado como não letivo.`,
      { duration: 1800 }
    );
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const res = handleValidateNow(rawDatesInput, holidays, true);
      if (res.isExactly200 && !res.hasErrors) {
        toast.success('200 dias válidos processados e prontos para publicação.');
      } else if (res.hasErrors) {
        toast.error('Foram encontrados erros de formatação ou duplicidades.');
      } else {
        toast.info(
          `Processado: ${res.totalCount}/200 dias (${
            res.remainingCount > 0
              ? `faltam ${res.remainingCount}`
              : `excedente de ${res.exceededCount}`
          }).`
        );
      }
    }
  };

  const handleCopyDatesList = async () => {
    try {
      await navigator.clipboard.writeText(parsedResult.validDates.join('\n'));
      toast.success(`${parsedResult.validDates.length} datas copiadas para a área de transferência.`);
    } catch {
      toast.error('Não foi possível copiar automaticamente neste navegador.');
    }
  };

  const handleExportCsv = () => {
    const header = 'Ordem,Data,DiaDaSemana,Mes,Tipo\n';
    const rows = parsedResult.calendarDays
      .map(
        (d, idx) =>
          `${idx + 1},${d.date},"${d.dayOfWeek}","${d.month}","${
            d.isSaturday ? 'Sábado Letivo' : d.holidayConflict || 'Dia Letivo Regular'
          }"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calendario_oficial_200_dias_${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV do calendário ${selectedYear} exportado.`);
  };

  // Publish Calendar Config
  const handleConfirmSaveCalendar = async () => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem publicar o calendário oficial.');
      return;
    }
    if (!parsedResult.isExactly200 || parsedResult.hasErrors) {
      toast.error('O calendário precisa totalizar exatamente 200 dias válidos e sem erros.');
      return;
    }

    setIsSaving(true);
    try {
      const normalizedText = parsedResult.validDates.join('\n');
      const res = await saveStoredOfficialCalendarConfig(
        normalizedText,
        userEmail,
        userName,
        selectedYear
      );

      if (!res.ok || !res.calendarConfig) {
        toast.error(res.error || 'Falha ao salvar calendário oficial.');
        setIsSaving(false);
        return;
      }

      hasUnsavedRef.current = false;
      setHasUnsavedChanges(false);
      setCalendarConfig(res.calendarConfig);
      setRawDatesInput(res.calendarConfig.schoolDays.join('\n'));
      setAuditLogs(getStoredCalendarAuditLogs());
      setIsConfirmModalOpen(false);

      if (classes.length > 0 && onUpdateClasses) {
        const dist = res.calendarConfig.monthlyDistribution;
        const updatedClasses = classes.map((cls) => ({
          ...cls,
          classesHeld: dist['Outubro'] || cls.classesHeld || 20,
          monthlySchoolDays: {
            ...(cls.monthlySchoolDays || {}),
            ...dist,
          },
          updatedAtMs: Date.now(),
        }));
        onUpdateClasses(updatedClasses);
      }

      toast.success(
        `Calendário Oficial ${selectedYear} (200 dias) publicado e replicado para as ${classes.length} turmas!`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Erro inesperado ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  // Holiday management actions
  const handleOpenAddHoliday = (presetDate: string = '') => {
    setEditingHoliday(null);
    setHolidayFormDate(presetDate);
    setHolidayFormName('');
    setHolidayFormType('municipal');
    setRemoveHolidayFromSchoolDays(true);
    setIsHolidayModalOpen(true);
  };

  const handleOpenEditHoliday = (h: SchoolHoliday) => {
    setEditingHoliday(h);
    setHolidayFormDate(h.date);
    setHolidayFormName(h.name);
    setHolidayFormType(h.type);
    setRemoveHolidayFromSchoolDays(true);
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

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(cleanDate)) {
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

    if (removeHolidayFromSchoolDays && parsedResult.validDates.includes(cleanDate)) {
      const nextDates = parsedResult.validDates.filter((d) => d !== cleanDate);
      applyDatesList(nextDates, res.holidays, true);
      toast.success(
        `${cleanName} salvo e removido dos dias letivos. Use "Completar 200 Dias" para compensar a data.`
      );
    } else {
      handleValidateNow(rawDatesInput, res.holidays, false);
      toast.success(
        editingHoliday ? `Feriado "${cleanName}" atualizado.` : `Feriado "${cleanName}" cadastrado.`
      );
    }
  };

  const handleDeleteHoliday = async (holiday: SchoolHoliday) => {
    if (!isAdmin) return;
    const res = await saveStoredHolidayAction('delete', holiday, holiday.id, userEmail, userName);
    if (!res.ok) {
      toast.error(res.error || 'Falha ao excluir feriado.');
      return;
    }
    setConfirmDeleteHolidayId(null);
    setHolidays(res.holidays);
    setAuditLogs(getStoredCalendarAuditLogs());
    handleValidateNow(rawDatesInput, res.holidays, false);
    toast.success(`Feriado "${holiday.name}" excluído.`);
  };

  const handleRestoreDefaultHolidays = async () => {
    if (!isAdmin) return;
    const res = await saveStoredHolidayAction(
      'restore_defaults',
      undefined,
      undefined,
      userEmail,
      userName
    );
    if (!res.ok) {
      toast.error(res.error || 'Falha ao restaurar feriados padrão.');
      return;
    }
    setHolidays(res.holidays);
    setAuditLogs(getStoredCalendarAuditLogs());
    handleValidateNow(rawDatesInput, res.holidays, false);
    toast.success('Lista padrão de feriados SME Jundiaí restaurada.');
  };

  // Filtered preview list
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

  const filteredHolidays = useMemo(() => {
    if (holidayScopeFilter === 'all') return holidays;
    return holidays.filter((h) => h.type === holidayScopeFilter);
  }, [holidays, holidayScopeFilter]);

  // Interactive visual grid slots for current month
  const visualMonthDays = useMemo(() => {
    const daysInMonth = new Date(selectedYear, visualCalendarMonth, 0).getDate();
    const firstDayOfWeek = new Date(selectedYear, visualCalendarMonth - 1, 1).getDay();
    const pad = (n: number) => n.toString().padStart(2, '0');

    const activeSchoolDayMap = new Map<string, string>();
    parsedResult.calendarDays.forEach((d) => {
      activeSchoolDayMap.set(d.date, d.type);
    });

    const holidayMap = new Map<string, SchoolHoliday>();
    holidays.forEach((h) => {
      holidayMap.set(h.date.trim(), h);
    });

    const slots: Array<
      | { isEmpty: true; id: string }
      | {
          isEmpty: false;
          id: string;
          dayNumber: number;
          dateStr: string;
          dayOfWeek: string;
          isWeekend: boolean;
          isSchoolDay: boolean;
          schoolDayType?: string;
          holiday?: SchoolHoliday;
        }
    > = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      slots.push({ isEmpty: true, id: `empty-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${pad(day)}/${pad(visualCalendarMonth)}/${selectedYear}`;
      const dateObj = new Date(selectedYear, visualCalendarMonth - 1, day);
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
        isSchoolDay: Boolean(schoolDayType),
        schoolDayType,
        holiday,
      });
    }

    return slots;
  }, [selectedYear, visualCalendarMonth, parsedResult.calendarDays, holidays]);

  const progressPercent = Math.min(100, Math.round((parsedResult.totalCount / 200) * 100));
  const selectedMonthName = MONTH_NAMES_PT[visualCalendarMonth - 1];
  const selectedMonthCount = parsedResult.monthlyDistribution[selectedMonthName] || 0;
  const selectedMonthTarget = OFFICIAL_MONTHLY_TARGETS_2027[selectedMonthName] || 0;
  const saturdayCount = parsedResult.weekendDays.filter((w) => w.isSaturday).length;
  const isPublishReady = parsedResult.isExactly200 && !parsedResult.hasErrors && isAdmin;

  return (
    <div
      className={
        embedded
          ? 'w-full min-w-0 space-y-4 text-[#111827] animate-gentle-fade'
          : 'flex flex-col min-h-[calc(100dvh-9.5rem)] max-w-7xl mx-auto w-full min-w-0 space-y-4 pb-20 text-[#111827] animate-gentle-fade'
      }
    >
      {/* 1. CABEÇALHO UNIFICADO + BARRA DE PROGRESSO DINÂMICA 200 DIAS */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-4 min-w-0">
        {!embedded && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 font-medium">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 font-semibold hover:text-slate-950 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </button>
            <span>
              {SCHOOL_NAME} · Base Oficial SED {selectedYear}
            </span>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-950">
                Configurador do Calendário Oficial
              </h2>
              <span className="text-xs font-semibold text-slate-700 tabular-nums">
                Ano {selectedYear} · LDB 200 Dias · {classes.length} turmas
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-700">
              Clique nos dias da grade para alternar datas letivas, ajuste feriados e publique direto para todas as turmas.
            </p>
          </div>

          {/* Controles Compactos: Ano + Sync + Restaurar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="Selecionar ano letivo"
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              disabled={!isAdmin}
              className="min-h-[38px] px-3 rounded-xl bg-[#edf2f7] text-xs font-bold text-slate-950 cursor-pointer disabled:opacity-50"
            >
              <option value={2026}>Ano Letivo 2026</option>
              <option value={2027}>Ano Letivo 2027</option>
              <option value={2028}>Ano Letivo 2028</option>
            </select>

            <select
              aria-label="Intervalo de sincronização automática"
              value={syncFrequency}
              onChange={(e) => handleSelectFrequency(Number(e.target.value) as GoogleSheetsSyncFrequency)}
              disabled={!isAdmin}
              className="min-h-[38px] px-3 rounded-xl bg-[#edf2f7] text-xs font-semibold text-slate-900 cursor-pointer disabled:opacity-50"
            >
              <option value={30}>Sync: 30 min</option>
              <option value={60}>Sync: 60 min</option>
              <option value={120}>Sync: 120 min</option>
            </select>

            <button
              type="button"
              onClick={handleManualSyncTrigger}
              disabled={isSyncingNow || isLoadingServer}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingNow || isLoadingServer ? 'animate-spin' : ''}`}
              />
              <span>{isSyncingNow ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>
          </div>
        </div>

        {/* Medidor Vivo LDB 200 Dias + Ações Dinâmicas */}
        <div className="p-4 rounded-2xl bg-[#f4f7fb] space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-950">
                  {parsedResult.totalCount}
                </span>
                <span className="text-xs sm:text-sm font-mono text-slate-700 tabular-nums">
                  / 200 dias letivos
                </span>
              </div>

              <span
                className={`text-xs font-semibold inline-flex items-center gap-1.5 ${
                  parsedResult.isExactly200 && !parsedResult.hasErrors
                    ? 'text-[#047857]'
                    : parsedResult.hasErrors
                    ? 'text-rose-700'
                    : 'text-amber-800'
                }`}
              >
                {parsedResult.isExactly200 && !parsedResult.hasErrors ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Meta de 200 dias atingida</span>
                  </>
                ) : parsedResult.hasErrors ? (
                  <>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Há erros de formatação ou duplicidades na lista</span>
                  </>
                ) : parsedResult.remainingCount > 0 ? (
                  <>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="tabular-nums">Faltam {parsedResult.remainingCount} dia(s) para 200</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="tabular-nums">Excedente de {parsedResult.exceededCount} dia(s) acima de 200</span>
                  </>
                )}
              </span>

              {hasUnsavedChanges && (
                <span className="text-xs font-semibold text-[#0b3b8c]">
                  · Alterações pendentes de publicação
                </span>
              )}
            </div>

            {/* Ações Dinâmicas Rápidas */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {parsedResult.totalCount !== 200 && !parsedResult.hasErrors && isAdmin && (
                <button
                  type="button"
                  onClick={handleAutoBalance200}
                  className="min-h-[38px] px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>
                    {parsedResult.remainingCount > 0 ? 'Completar 200 Dias' : 'Ajustar para 200 Dias'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleLoadOfficialDefault(selectedYear)}
                disabled={!isAdmin}
                className="min-h-[38px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0b3b8c]" />
                <span>Padrão SME (200d)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(true)}
                disabled={!isPublishReady || isSaving}
                className="min-h-[38px] px-4 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                <span>Publicar Calendário</span>
              </button>
            </div>
          </div>

          {/* Barra visual de progresso */}
          <div className="w-full h-2.5 rounded-full bg-[#dbe4f0] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                parsedResult.isExactly200 && !parsedResult.hasErrors
                  ? 'bg-[#047857]'
                  : parsedResult.totalCount > 200
                  ? 'bg-rose-600'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Alerta dinâmico de conflito com feriados */}
          {parsedResult.holidayConflicts.length > 0 && (
            <div className="p-3 rounded-2xl bg-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-950">
              <div className="flex items-start sm:items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words">
                  <strong>{parsedResult.holidayConflicts.length} conflito(s):</strong> há dia(s)
                  letivo(s) marcado(s) em data de feriado/recesso (
                  {parsedResult.holidayConflicts
                    .slice(0, 3)
                    .map((c) => `${c.date} - ${c.holidayName}`)
                    .join('; ')}
                  ).
                </span>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleRemoveHolidayConflicts}
                  className="min-h-[32px] px-3 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Remover Feriados dos Dias Letivos
                </button>
              )}
            </div>
          )}

          {!isAdmin && (
            <div className="p-3 rounded-2xl bg-slate-100 text-slate-700 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Acesso somente leitura: apenas administradores podem publicar alterações.</span>
            </div>
          )}
        </div>

        {/* Sub-abas do Configurador */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('calendario')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'calendario'
                ? 'bg-[#091b3b] text-white'
                : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Planejador Visual</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'editor'
                ? 'bg-[#091b3b] text-white'
                : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Lista &amp; Importação</span>
            <span className="tabular-nums opacity-85">({parsedResult.totalCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('feriados')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'feriados'
                ? 'bg-[#091b3b] text-white'
                : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
            }`}
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Feriados &amp; Recessos</span>
            <span className="tabular-nums opacity-85">({holidays.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auditoria')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'auditoria'
                ? 'bg-[#091b3b] text-white'
                : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Auditoria</span>
            <span className="tabular-nums opacity-85">({auditLogs.length})</span>
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* ABA 1: PLANEJADOR VISUAL INTERATIVO (MÊS A MÊS + CLIQUE NO DIA)       */}
      {/* ===================================================================== */}
      {activeTab === 'calendario' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start animate-fade-in">
          {/* Coluna Esquerda: Navegador Dinâmico de Meses & Metas SME */}
          <section className="lg:col-span-4 bg-white rounded-3xl p-4 sm:p-5 shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-950">Distribuição por Mês</h3>
              <span className="text-xs font-mono font-bold tabular-nums text-slate-700">
                Meta: 200d
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
              {MONTH_NAMES_PT.map((mName, idx) => {
                const monthNum = idx + 1;
                const count = parsedResult.monthlyDistribution[mName] || 0;
                const target = OFFICIAL_MONTHLY_TARGETS_2027[mName] || 0;
                const isSelected = visualCalendarMonth === monthNum;
                const matchesTarget = target > 0 ? count === target : count === 0;

                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => setVisualCalendarMonth(monthNum)}
                    className={`p-2.5 rounded-2xl text-left transition-all duration-200 cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-[#0b3b8c] text-white shadow-[0_8px_18px_rgba(11,59,140,0.3)]'
                        : 'bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-950'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate">{mName}</span>
                      {target > 0 && matchesTarget && (
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? 'text-emerald-300' : 'text-[#047857]'
                          }`}
                        />
                      )}
                    </div>
                    <div className="flex items-baseline justify-between gap-1 font-mono tabular-nums">
                      <span className="text-sm font-bold">{count}d</span>
                      {target > 0 && (
                        <span
                          className={`text-[11px] font-medium ${
                            isSelected ? 'text-blue-100' : 'text-slate-700'
                          }`}
                        >
                          meta {target}d
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2.5 rounded-xl bg-[#edf2f7]">
                <span className="text-[11px] font-semibold text-slate-700 block">Sábados</span>
                <span className="text-sm font-bold font-mono tabular-nums text-slate-950">
                  {saturdayCount}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#edf2f7]">
                <span className="text-[11px] font-semibold text-slate-700 block">Feriados</span>
                <span className="text-sm font-bold font-mono tabular-nums text-slate-950">
                  {holidays.length}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#edf2f7]">
                <span className="text-[11px] font-semibold text-slate-700 block">Conflitos</span>
                <span
                  className={`text-sm font-bold font-mono tabular-nums ${
                    parsedResult.holidayConflicts.length > 0 ? 'text-amber-800' : 'text-slate-950'
                  }`}
                >
                  {parsedResult.holidayConflicts.length}
                </span>
              </div>
            </div>
          </section>

          {/* Coluna Direita: Grade Mensal Clicável e Dinâmica */}
          <section className="lg:col-span-8 bg-white rounded-3xl p-4 sm:p-5 shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-3.5">
            {/* Barra do Mês + Modo de Clique */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setVisualCalendarMonth((prev) => (prev <= 1 ? 12 : prev - 1))
                  }
                  aria-label="Mês anterior"
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-950 leading-tight">
                    {selectedMonthName} {selectedYear}
                  </h3>
                  <p className="text-xs text-slate-700 font-mono tabular-nums">
                    {selectedMonthCount} dia(s) selecionado(s)
                    {selectedMonthTarget > 0 ? ` · referência SME ${selectedMonthTarget}d` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setVisualCalendarMonth((prev) => (prev >= 12 ? 1 : prev + 1))
                  }
                  aria-label="Próximo mês"
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Modo do Clique */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setClickMode('toggle_school_day')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      clickMode === 'toggle_school_day'
                        ? 'bg-white text-slate-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Alternar Dia Letivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setClickMode('mark_holiday')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      clickMode === 'mark_holiday'
                        ? 'bg-white text-rose-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Marcar Feriado
                  </button>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleFillSelectedMonth}
                      title="Adicionar todos os dias úteis (seg–sex) não feriados deste mês"
                      className="min-h-[34px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Preencher Úteis
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelectedMonth}
                      title="Remover todas as datas selecionadas deste mês"
                      className="min-h-[34px] px-3 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Limpar Mês
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Grade Clicável 7 Colunas Sem Bordas */}
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-1.5 min-w-[520px]">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, idx) => (
                  <div
                    key={dayName}
                    className={`py-2 text-center text-xs font-bold rounded-lg bg-[#f4f7fb] ${
                      idx === 0 || idx === 6 ? 'text-slate-600' : 'text-slate-900'
                    }`}
                  >
                    {dayName}
                  </div>
                ))}

                {visualMonthDays.map((slot) => {
                  if (slot.isEmpty) {
                    return <div key={slot.id} className="min-h-[64px] rounded-xl bg-[#f4f7fb]/60" />;
                  }

                  let cellClass =
                    'bg-[#edf2f7] text-slate-900 hover:bg-[#dce7fb]';
                  let statusLabel = 'Não letivo';

                  if (slot.holiday && slot.isSchoolDay) {
                    cellClass =
                      'bg-amber-200 text-amber-950 hover:bg-amber-300 shadow-[0_4px_12px_rgba(217,119,6,0.2)]';
                    statusLabel = `Conflito: ${slot.holiday.name}`;
                  } else if (slot.holiday) {
                    cellClass = 'bg-rose-100 text-rose-950 hover:bg-rose-200';
                    statusLabel = slot.holiday.name;
                  } else if (slot.schoolDayType === 'sabado_letivo') {
                    cellClass =
                      'bg-indigo-700 text-white hover:bg-indigo-800 shadow-[0_6px_14px_rgba(67,56,202,0.28)]';
                    statusLabel = 'Sáb. Letivo';
                  } else if (slot.isSchoolDay) {
                    cellClass =
                      'bg-[#090f1d] text-white hover:bg-black shadow-[0_6px_14px_rgba(9,15,29,0.22)]';
                    statusLabel = 'Dia Letivo';
                  } else if (slot.isWeekend) {
                    cellClass =
                      'bg-[#f4f7fb] text-slate-600 hover:bg-[#e2e8f0] hover:text-slate-900';
                    statusLabel = slot.dayOfWeek.startsWith('Sáb') ? 'Sábado' : 'Domingo';
                  }

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => handleCalendarDayClick(slot)}
                      title={`${slot.dateStr} (${slot.dayOfWeek}) — ${statusLabel}`}
                      className={`min-h-[64px] p-2 rounded-xl flex flex-col justify-between text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer select-none ${cellClass}`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span className="font-mono text-xs font-bold tabular-nums">
                          {slot.dayNumber}
                        </span>
                        {slot.isSchoolDay && !slot.holiday && (
                          <Check className="w-3 h-3 opacity-90 shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] font-medium leading-tight line-clamp-2 break-words w-full">
                        {statusLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Legenda Limpa Sem Contorno */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 p-3 rounded-2xl bg-[#f4f7fb] text-xs font-semibold text-slate-800">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#090f1d] inline-block" />
                Dia Letivo Regular
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-indigo-700 inline-block" />
                Sábado Letivo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-rose-200 inline-block" />
                Feriado / Recesso
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#dbe4f0] inline-block" />
                Não Letivo
              </span>
            </div>
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 2: EDITOR EM LOTE (SINCRONIZADO 2 VIAS COM O PLANEJADOR VISUAL)   */}
      {/* ===================================================================== */}
      {activeTab === 'editor' && (
        <div className="space-y-4 animate-fade-in">
          <section className="bg-white p-4 sm:p-5 rounded-3xl shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Editor em Lote de Datas (DD/MM/AAAA)
                </h3>
                <p className="text-xs text-slate-700">
                  Sincronizado em tempo real com o Planejador Visual. Cole uma data por linha ou exporte o calendário atual.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDatesList}
                  className="min-h-[36px] px-3 rounded-xl bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Datas</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="min-h-[36px] px-3 rounded-xl bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Exportar CSV</span>
                </button>

                {isAdmin && rawDatesInput.trim().length > 0 && (
                  confirmClearInput ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          applyDatesList([], holidays, true);
                          setConfirmClearInput(false);
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Confirmar Limpeza
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearInput(false)}
                        className="min-h-[36px] px-2.5 rounded-xl bg-[#edf2f7] text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearInput(true)}
                      className="min-h-[36px] px-3 rounded-xl text-rose-800 hover:bg-rose-100 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar Lista</span>
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="relative">
              <textarea
                value={rawDatesInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setRawDatesInput(val);
                  handleValidateNow(val, holidays, true);
                }}
                onKeyDown={handleTextareaKeyDown}
                disabled={!isAdmin}
                placeholder={`03/02/${selectedYear}\n04/02/${selectedYear}\n05/02/${selectedYear}...`}
                className="w-full h-48 font-mono text-xs p-3.5 rounded-2xl leading-relaxed text-slate-950 bg-[#edf2f7] focus:bg-white resize-y disabled:bg-slate-200 disabled:text-slate-600"
              />
            </div>

            {parsedResult.hasErrors && (
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-950 space-y-1.5 text-xs">
                <p className="font-bold text-rose-950">
                  Erros detectados ({parsedResult.duplicateEntries.length} duplicidades ·{' '}
                  {parsedResult.invalidEntries.length} formatos inválidos):
                </p>
                {parsedResult.duplicateEntries.length > 0 && (
                  <p className="text-rose-900 break-words font-semibold">
                    Duplicadas:{' '}
                    {parsedResult.duplicateEntries
                      .map((d) => `${d.date} (${d.occurrences}x)`)
                      .join(', ')}
                  </p>
                )}
                {parsedResult.invalidEntries.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-0.5 font-mono bg-white p-2.5 rounded-xl">
                    {parsedResult.invalidEntries.map((inv, idx) => (
                      <div key={idx} className="text-rose-900 break-words">
                        Linha {inv.line}: "{inv.raw}" — {inv.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Pré-visualização Cronológica */}
          <section className="bg-white p-4 sm:p-5 rounded-3xl shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Lista Cronológica ({filteredPreviewDays.length} de {parsedResult.totalCount} Dias)
                </h3>
                <p className="text-xs text-slate-700">
                  Filtre por mês ou pesquise qualquer data para conferência rápida.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedPreviewMonth}
                  onChange={(e) => setSelectedPreviewMonth(e.target.value)}
                  className="min-h-[36px] px-3 rounded-xl text-xs font-semibold text-slate-950 bg-[#edf2f7]"
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
                  placeholder="Filtrar data ou dia..."
                  className="min-h-[36px] px-3 rounded-xl bg-[#edf2f7] focus:bg-white text-xs text-slate-950 w-40"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto overflow-x-auto bg-[#f4f7fb] rounded-2xl">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="sticky top-0 bg-[#e2e8f0] text-slate-950 font-bold z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-12 font-mono text-center">Nº</th>
                    <th className="py-2.5 px-3 w-28 font-mono">Data</th>
                    <th className="py-2.5 px-3">Dia da Semana</th>
                    <th className="py-2.5 px-3">Mês</th>
                    <th className="py-2.5 px-3">Classificação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreviewDays.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-600 text-xs font-medium">
                        Nenhuma data corresponde aos filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredPreviewDays.map((d, idx) => (
                      <tr key={d.id} className="odd:bg-white even:bg-[#f4f7fb] hover:bg-[#dce7fb]/60 transition-colors">
                        <td className="py-2 px-3 text-slate-600 text-center font-mono tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-950 font-mono tabular-nums">
                          {d.date}
                        </td>
                        <td className="py-2 px-3 text-slate-800">{d.dayOfWeek}</td>
                        <td className="py-2 px-3 text-slate-700">{d.month}</td>
                        <td className="py-2 px-3">
                          {d.isSaturday ? (
                            <span className="text-indigo-900 font-bold">Sábado Letivo</span>
                          ) : d.holidayConflict ? (
                            <span className="text-amber-900 font-bold">{d.holidayConflict}</span>
                          ) : (
                            <span className="text-slate-800 font-medium">Dia Letivo Regular</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 3: FERIADOS & RECESSOS                                            */}
      {/* ===================================================================== */}
      {activeTab === 'feriados' && (
        <section className="bg-white p-4 sm:p-5 rounded-3xl shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-3.5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">
                Feriados Oficiais e Recessos ({filteredHolidays.length})
              </h3>
              <p className="text-xs text-slate-700">
                Conflitos com dias letivos ativos são sinalizados e podem ser removidos automaticamente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={holidayScopeFilter}
                onChange={(e) => setHolidayScopeFilter(e.target.value as 'all' | HolidayScopeType)}
                className="min-h-[36px] px-3 rounded-xl text-xs font-semibold text-slate-950 bg-[#edf2f7]"
              >
                <option value="all">Todos os Âmbitos</option>
                <option value="municipal">Municipal (Jundiaí)</option>
                <option value="estadual">Estadual (SP)</option>
                <option value="nacional">Nacional</option>
                <option value="recesso">Recesso Escolar</option>
                <option value="ponto_facultativo">Ponto Facultativo</option>
              </select>

              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={handleRestoreDefaultHolidays}
                    className="min-h-[36px] px-3 rounded-xl bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar Padrão SME</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAddHoliday('')}
                    className="min-h-[36px] px-3.5 rounded-xl bg-slate-950 hover:bg-black text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Feriado</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto overflow-x-auto bg-[#f4f7fb] rounded-2xl">
            <table className="w-full min-w-[540px] text-left text-xs">
              <thead className="sticky top-0 bg-[#e2e8f0] text-slate-950 font-bold z-10">
                <tr>
                  <th className="py-2.5 px-3 w-28 font-mono">Data</th>
                  <th className="py-2.5 px-3">Descrição</th>
                  <th className="py-2.5 px-3 w-36">Âmbito</th>
                  <th className="py-2.5 px-3 w-36">Status 200 Dias</th>
                  <th className="py-2.5 px-3 w-28 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolidays.map((h) => {
                  const isConflict = parsedResult.validDates.includes(h.date);
                  const isConfirmingDel = confirmDeleteHolidayId === h.id;
                  return (
                    <tr key={h.id} className="odd:bg-white even:bg-[#f4f7fb] hover:bg-[#dce7fb]/60 transition-colors">
                      <td className="py-2 px-3 font-mono font-bold text-slate-950 tabular-nums">
                        {h.date}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{h.name}</td>
                      <td className="py-2 px-3 text-slate-700 capitalize font-medium">
                        {h.type.replace('_', ' ')}
                      </td>
                      <td className="py-2 px-3">
                        {isConflict ? (
                          <span className="text-rose-800 font-bold inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Conflito ativo
                          </span>
                        ) : (
                          <span className="text-slate-600 font-medium">Sem conflito</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {isConfirmingDel ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteHoliday(h)}
                              className="px-2 py-1 rounded-lg bg-rose-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Excluir
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteHolidayId(null)}
                              className="px-2 py-1 rounded-lg bg-[#e2e8f0] text-slate-900 text-[11px] font-semibold cursor-pointer"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditHoliday(h)}
                              disabled={!isAdmin}
                              className="p-1.5 text-slate-700 hover:text-slate-950 rounded-lg disabled:opacity-40 cursor-pointer"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteHolidayId(h.id)}
                              disabled={!isAdmin}
                              className="p-1.5 text-slate-700 hover:text-rose-700 rounded-lg disabled:opacity-40 cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* ABA 4: AUDITORIA                                                      */}
      {/* ===================================================================== */}
      {activeTab === 'auditoria' && (
        <section className="bg-white p-4 sm:p-5 rounded-3xl shadow-[0_12px_34px_-8px_rgba(2,6,23,0.34)] space-y-3 animate-fade-in">
          <div>
            <h3 className="text-sm font-bold text-slate-950">
              Histórico de Auditoria ({auditLogs.length} registros)
            </h3>
            <p className="text-xs text-slate-700">
              Registro sequencial das publicações dos 200 dias e movimentações de feriados.
            </p>
          </div>

          <div className="max-h-96 overflow-x-auto overflow-y-auto bg-[#f4f7fb] rounded-2xl">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="sticky top-0 bg-[#e2e8f0] text-slate-950 font-bold z-10">
                <tr>
                  <th className="py-2.5 px-3 w-36 font-mono">Data/Hora</th>
                  <th className="py-2.5 px-3 w-56">Responsável</th>
                  <th className="py-2.5 px-3 w-40">Operação</th>
                  <th className="py-2.5 px-3 w-24 font-mono">Dias</th>
                  <th className="py-2.5 px-3">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-600 font-medium">
                      Nenhum registro de auditoria gravado ainda.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="odd:bg-white even:bg-[#f4f7fb] hover:bg-[#dce7fb]/60 transition-colors">
                      <td className="py-2 px-3 font-mono text-slate-700 tabular-nums">
                        {new Date(log.timestampISO).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-bold text-slate-950 block break-words">
                          {log.adminName}
                        </span>
                        <span className="text-slate-700 font-mono block break-all">
                          {log.adminEmail}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {log.action === 'UPDATE_200_DAYS'
                          ? 'Publicação 200 Dias'
                          : log.action === 'ADD_HOLIDAY'
                          ? 'Novo Feriado'
                          : log.action === 'EDIT_HOLIDAY'
                          ? 'Edição de Feriado'
                          : log.action === 'DELETE_HOLIDAY'
                          ? 'Exclusão de Feriado'
                          : 'Operação'}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-800">
                        {log.previousDaysCount !== undefined && log.newDaysCount !== undefined
                          ? `${log.previousDaysCount}d → ${log.newDaysCount}d`
                          : '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-700 break-words">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL: CONFIRMAR PUBLICAÇÃO DOS 200 DIAS */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-[0_28px_68px_rgba(2,6,23,0.45)] overflow-hidden animate-apple-pop">
            <div className="p-5 bg-[#f4f7fb] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-950">
                    Publicar Calendário Oficial
                  </h3>
                  <p className="text-xs text-slate-700">
                    Ano Letivo {selectedYear} · {SCHOOL_NAME}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-[#e2e8f0] text-slate-700 hover:text-slate-950 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-800 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-[#edf2f7] space-y-1.5">
                <p className="font-bold text-slate-950">
                  Homologação oficial de 200 dias letivos:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-700 font-medium">
                  <li>Atualiza imediatamente a carga letiva mensal das {classes.length} turmas.</li>
                  <li>Recalcula os limites LDB de presença e faltas em toda a escola.</li>
                  <li className="break-all">
                    Responsável: <span className="font-mono font-bold text-slate-950">{userEmail}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-[#f4f7fb] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSaving}
                className="min-h-[40px] px-4 text-xs font-semibold text-slate-800 hover:bg-[#e2e8f0] rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveCalendar}
                disabled={isSaving}
                className="min-h-[40px] px-5 text-xs font-bold text-white bg-[#047857] hover:bg-[#065f46] rounded-xl inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Publicando...' : 'Confirmar e Publicar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR / EDITAR FERIADO */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in">
          <form
            onSubmit={handleSaveHoliday}
            className="bg-white rounded-3xl max-w-md w-full shadow-[0_28px_68px_rgba(2,6,23,0.45)] overflow-hidden animate-apple-pop"
          >
            <div className="p-4 sm:p-5 bg-[#f4f7fb] flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-950">
                {editingHoliday ? 'Editar Feriado / Recesso' : 'Novo Feriado / Recesso'}
              </h3>
              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-[#e2e8f0] text-slate-700 hover:text-slate-950 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Data (DD/MM/AAAA)
                </label>
                <input
                  type="text"
                  required
                  placeholder={`20/11/${selectedYear}`}
                  value={holidayFormDate}
                  onChange={(e) => setHolidayFormDate(e.target.value)}
                  className="w-full font-mono px-3 py-2.5 bg-[#edf2f7] focus:bg-white rounded-xl text-sm text-slate-950"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Nome / Descrição
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Consciência Negra / Recesso SME"
                  value={holidayFormName}
                  onChange={(e) => setHolidayFormName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#edf2f7] focus:bg-white rounded-xl text-sm text-slate-950"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Âmbito</label>
                <select
                  value={holidayFormType}
                  onChange={(e) => setHolidayFormType(e.target.value as HolidayScopeType)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#edf2f7] text-sm font-medium text-slate-950"
                >
                  <option value="municipal">Municipal (Jundiaí / SP)</option>
                  <option value="estadual">Estadual (São Paulo)</option>
                  <option value="nacional">Nacional</option>
                  <option value="recesso">Recesso Escolar (SME)</option>
                  <option value="ponto_facultativo">Ponto Facultativo</option>
                </select>
              </div>

              <label className="flex items-center gap-2 pt-1 text-slate-800 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeHolidayFromSchoolDays}
                  onChange={(e) => setRemoveHolidayFromSchoolDays(e.target.checked)}
                  className="w-4 h-4 accent-[#047857] rounded cursor-pointer"
                />
                <span>Remover automaticamente esta data dos dias letivos</span>
              </label>
            </div>

            <div className="p-4 bg-[#f4f7fb] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(false)}
                className="min-h-[40px] px-4 text-xs font-semibold text-slate-800 hover:bg-[#e2e8f0] rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-5 text-xs font-bold text-white bg-slate-950 hover:bg-black rounded-xl cursor-pointer"
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
