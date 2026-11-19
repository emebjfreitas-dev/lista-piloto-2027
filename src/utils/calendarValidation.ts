import type {
  DayType,
  HolidayScopeType,
  OfficialCalendarConfig,
  OfficialCalendarDay,
  SchoolHoliday,
} from '../types';

export const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const DAYS_OF_WEEK_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

/**
 * Feriados Oficiais Oficiais (Nacionais, Estado de SP e Município de Jundiaí/SP)
 * com suporte para os anos letivos de 2026 e 2027.
 */
export const OFFICIAL_DEFAULT_HOLIDAYS_2027: SchoolHoliday[] = [
  { id: 'hol-01', date: '01/01/2027', name: 'Confraternização Universal', type: 'nacional', isOfficial: true },
  { id: 'hol-02', date: '08/02/2027', name: 'Carnaval (Recesso Escolar)', type: 'recesso', isOfficial: true },
  { id: 'hol-03', date: '09/02/2027', name: 'Terça-feira de Carnaval', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-04', date: '10/02/2027', name: 'Quarta-feira de Cinzas', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-05', date: '26/03/2027', name: 'Sexta-feira Santa (Paixão de Cristo)', type: 'nacional', isOfficial: true },
  { id: 'hol-06', date: '21/04/2027', name: 'Tiradentes', type: 'nacional', isOfficial: true },
  { id: 'hol-07', date: '01/05/2027', name: 'Dia Mundial do Trabalho', type: 'nacional', isOfficial: true },
  { id: 'hol-08', date: '27/05/2027', name: 'Corpus Christi', type: 'municipal', isOfficial: true },
  { id: 'hol-09', date: '28/05/2027', name: 'Emenda Corpus Christi (Ponto Facultativo)', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-10', date: '09/07/2027', name: 'Revolução Constitucionalista de 1932', type: 'estadual', isOfficial: true },
  { id: 'hol-11', date: '15/08/2027', name: 'Nossa Senhora do Desterro (Padroeira de Jundiaí)', type: 'municipal', isOfficial: true },
  { id: 'hol-12', date: '07/09/2027', name: 'Independência do Brasil', type: 'nacional', isOfficial: true },
  { id: 'hol-13', date: '12/10/2027', name: 'Nossa Senhora Aparecida / Dia das Crianças', type: 'nacional', isOfficial: true },
  { id: 'hol-14', date: '15/10/2027', name: 'Dia do Professor (Recesso Escolar SME)', type: 'recesso', isOfficial: true },
  { id: 'hol-15', date: '28/10/2027', name: 'Dia do Servidor Público', type: 'ponto_facultativo', isOfficial: true },
  { id: 'hol-16', date: '02/11/2027', name: 'Finados', type: 'nacional', isOfficial: true },
  { id: 'hol-17', date: '15/11/2027', name: 'Proclamação da República', type: 'nacional', isOfficial: true },
  { id: 'hol-18', date: '20/11/2027', name: 'Dia da Consciência Negra', type: 'nacional', isOfficial: true },
  { id: 'hol-19', date: '14/12/2027', name: 'Aniversário de Jundiaí (371 anos)', type: 'municipal', isOfficial: true },
  { id: 'hol-20', date: '25/12/2027', name: 'Natal', type: 'nacional', isOfficial: true },
];

export const OFFICIAL_MONTHLY_TARGETS_2027: Record<string, number> = {
  Janeiro: 0,
  Fevereiro: 16,
  Março: 22,
  Abril: 20,
  Maio: 20,
  Junho: 20,
  Julho: 10,
  Agosto: 22,
  Setembro: 20,
  Outubro: 20,
  Novembro: 18,
  Dezembro: 12,
};

const sortDatesChronologically = (dates: string[]): string[] =>
  Array.from(new Set(dates)).sort((a, b) => {
    const [da, ma, ya] = a.split('/').map(Number);
    const [db, mb, yb] = b.split('/').map(Number);
    return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
  });

/**
 * Gera a matriz exata de 200 dias letivos oficiais para o ano informado respeitando os
 * feriados cadastrados e as metas mensais da SME de Jundiaí (soma = 200 dias).
 */
export const generateOfficial200SchoolDaysForYear = (
  year: number = 2027,
  holidays: SchoolHoliday[] = OFFICIAL_DEFAULT_HOLIDAYS_2027
): string[] => {
  const holidayDateSet = new Set(holidays.map((h) => h.date.trim()));
  const holidayDayMonthSet = new Set(
    holidays.map((h) => h.date.trim().slice(0, 5)) // DD/MM para suportar outros anos letivos
  );
  const isHolidayDate = (dateStr: string): boolean =>
    holidayDateSet.has(dateStr) || holidayDayMonthSet.has(dateStr.slice(0, 5));

  const targets: Record<number, number> = {
    2: 16, // Fevereiro
    3: 22, // Março
    4: 20, // Abril
    5: 20, // Maio
    6: 20, // Junho
    7: 10, // Julho (férias de inverno)
    8: 22, // Agosto
    9: 20, // Setembro
    10: 20, // Outubro (inclui sábado letivo quando necessário)
    11: 18, // Novembro
    12: 12, // Dezembro
  };

  const pad = (n: number) => n.toString().padStart(2, '0');
  const schoolDays: string[] = [];

  for (let month = 2; month <= 12; month++) {
    const targetCount = targets[month] || 20;
    let addedForMonth = 0;
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      if (addedForMonth >= targetCount) break;
      if (month === 7 && day < 19) continue;

      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${pad(day)}/${pad(month)}/${year}`;

      if (dayOfWeek >= 1 && dayOfWeek <= 5 && !isHolidayDate(dateStr)) {
        schoolDays.push(dateStr);
        addedForMonth++;
      }
    }

    // Completa eventual meta com sábado letivo ou início de julho se necessário
    if (addedForMonth < targetCount) {
      for (let day = 1; day <= daysInMonth; day++) {
        if (addedForMonth >= targetCount) break;
        const dateObj = new Date(year, month - 1, day);
        const dayOfWeek = dateObj.getDay();
        const dateStr = `${pad(day)}/${pad(month)}/${year}`;
        if (dayOfWeek === 6 && !isHolidayDate(dateStr) && !schoolDays.includes(dateStr)) {
          schoolDays.push(dateStr);
          addedForMonth++;
        }
      }
    }
  }

  // Garante exatamente 200 dias mesmo em anos bissextos/variações de calendário
  if (schoolDays.length < 200) {
    for (let month = 2; month <= 12 && schoolDays.length < 200; month++) {
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth && schoolDays.length < 200; day++) {
        const dateObj = new Date(year, month - 1, day);
        const dow = dateObj.getDay();
        const dateStr = `${pad(day)}/${pad(month)}/${year}`;
        if (dow >= 1 && dow <= 5 && !isHolidayDate(dateStr) && !schoolDays.includes(dateStr)) {
          schoolDays.push(dateStr);
        }
      }
    }
  }

  return sortDatesChronologically(schoolDays).slice(0, 200);
};

/**
 * Gera a matriz exata de 200 dias letivos oficiais respeitando o calendário SME de Jundiaí.
 */
export const generateOfficial200SchoolDays2027 = (
  holidays: SchoolHoliday[] = OFFICIAL_DEFAULT_HOLIDAYS_2027
): string[] => generateOfficial200SchoolDaysForYear(2027, holidays);

export interface ParsedDateResult {
  validDates: string[]; // datas únicas DD/MM/AAAA ordenadas
  calendarDays: OfficialCalendarDay[];
  monthlyDistribution: Record<string, number>;
  totalCount: number;
  remainingCount: number;
  exceededCount: number;
  isExactly200: boolean;
  hasErrors: boolean;
  duplicateEntries: Array<{ date: string; occurrences: number }>;
  invalidEntries: Array<{ line: number; raw: string; reason: string }>;
  holidayConflicts: Array<{ date: string; holidayName: string; holidayType: HolidayScopeType }>;
  weekendDays: Array<{ date: string; dayOfWeek: string; isSaturday: boolean }>;
}

/**
 * Validação rigorosa de datas coladas no formato DD/MM/AAAA (uma por linha ou separadas por espaço/vírgula).
 */
export const parseAndValidateSchoolDates = (
  rawText: string,
  holidays: SchoolHoliday[] = OFFICIAL_DEFAULT_HOLIDAYS_2027
): ParsedDateResult => {
  if (!rawText || !rawText.trim()) {
    return {
      validDates: [],
      calendarDays: [],
      monthlyDistribution: {},
      totalCount: 0,
      remainingCount: 200,
      exceededCount: 0,
      isExactly200: false,
      hasErrors: true,
      duplicateEntries: [],
      invalidEntries: [{ line: 1, raw: '', reason: 'Nenhuma data informada. Cole as datas uma por linha.' }],
      holidayConflicts: [],
      weekendDays: [],
    };
  }

  const holidayMap = new Map<string, SchoolHoliday>();
  holidays.forEach((h) => {
    const cleanDate = h.date.trim();
    if (cleanDate) holidayMap.set(cleanDate, h);
  });

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const seenOccurrences = new Map<string, number>();
  const validDatesSet = new Set<string>();
  const invalidEntries: Array<{ line: number; raw: string; reason: string }> = [];
  const weekendDays: Array<{ date: string; dayOfWeek: string; isSaturday: boolean }> = [];
  const holidayConflicts: Array<{ date: string; holidayName: string; holidayType: HolidayScopeType }> = [];

  const dateRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/;

  let lineCounter = 1;
  for (const rawLine of lines) {
    // Permite que uma linha tenha várias datas separadas por espaço ou tabulação
    const tokens = rawLine.split(/[\s,;]+/).filter((t) => t.trim().length > 0);

    for (const token of tokens) {
      const match = token.match(dateRegex);
      if (!match) {
        invalidEntries.push({
          line: lineCounter,
          raw: token,
          reason: 'Formato inválido. Use estritamente o formato DD/MM/AAAA (ex: 03/02/2026).',
        });
        continue;
      }

      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);

      if (month < 1 || month > 12) {
        invalidEntries.push({
          line: lineCounter,
          raw: token,
          reason: `Mês inválido (${month}). Deve estar entre 01 e 12.`,
        });
        continue;
      }

      if (year < 2020 || year > 2035) {
        invalidEntries.push({
          line: lineCounter,
          raw: token,
          reason: `Ano fora da faixa permitida (${year}). Utilize o ano letivo da escola.`,
        });
        continue;
      }

      const daysInTargetMonth = new Date(year, month, 0).getDate();
      if (day < 1 || day > daysInTargetMonth) {
        invalidEntries.push({
          line: lineCounter,
          raw: token,
          reason: `Dia inválido para o mês ${month.toString().padStart(2, '0')}/${year} (máximo ${daysInTargetMonth} dias).`,
        });
        continue;
      }

      const normalizedDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;

      // Registra contagem de ocorrência para checar duplicidade
      const count = (seenOccurrences.get(normalizedDate) || 0) + 1;
      seenOccurrences.set(normalizedDate, count);

      if (count === 1) {
        validDatesSet.add(normalizedDate);

        const dateObj = new Date(year, month - 1, day);
        const dayOfWeekIndex = dateObj.getDay();
        const dayOfWeekName = DAYS_OF_WEEK_PT[dayOfWeekIndex];

        if (dayOfWeekIndex === 0 || dayOfWeekIndex === 6) {
          weekendDays.push({
            date: normalizedDate,
            dayOfWeek: dayOfWeekName,
            isSaturday: dayOfWeekIndex === 6,
          });
        }

        if (holidayMap.has(normalizedDate)) {
          const hol = holidayMap.get(normalizedDate)!;
          holidayConflicts.push({
            date: normalizedDate,
            holidayName: hol.name,
            holidayType: hol.type,
          });
        }
      }
    }
    lineCounter++;
  }

  // Identifica duplicidades
  const duplicateEntries: Array<{ date: string; occurrences: number }> = [];
  seenOccurrences.forEach((count, date) => {
    if (count > 1) {
      duplicateEntries.push({ date, occurrences: count });
    }
  });

  // Ordena cronologicamente
  const sortedDates = Array.from(validDatesSet).sort((a, b) => {
    const [da, ma, ya] = a.split('/').map(Number);
    const [db, mb, yb] = b.split('/').map(Number);
    return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
  });

  // Constrói estrutura completa de dias do calendário
  const monthlyDistribution: Record<string, number> = {};
  MONTH_NAMES_PT.forEach((m) => {
    monthlyDistribution[m] = 0;
  });

  const calendarDays: OfficialCalendarDay[] = sortedDates.map((dateStr, idx) => {
    const [d, m, y] = dateStr.split('/').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekIndex = dateObj.getDay();
    const monthName = MONTH_NAMES_PT[m - 1] || 'Outro';

    monthlyDistribution[monthName] = (monthlyDistribution[monthName] || 0) + 1;

    const isSat = dayOfWeekIndex === 6;
    const isSun = dayOfWeekIndex === 0;
    const conflict = holidayMap.get(dateStr);

    let type: DayType = 'dia_letivo';
    if (isSat) type = 'sabado_letivo';
    else if (conflict) type = conflict.type === 'recesso' ? 'recesso' : 'feriado';

    return {
      id: `cal-day-${idx + 1}`,
      date: dateStr,
      isoDate: `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
      dayOfWeek: DAYS_OF_WEEK_PT[dayOfWeekIndex],
      dayNumber: d,
      month: monthName,
      monthNumber: m,
      year: y,
      isSaturday: isSat,
      isSunday: isSun,
      holidayConflict: conflict ? `${conflict.name} (${conflict.type})` : undefined,
      type,
      description: conflict ? conflict.name : isSat ? 'Sábado Letivo Temático' : 'Dia Letivo Regular',
    };
  });

  const totalCount = sortedDates.length;
  const isExactly200 = totalCount === 200;
  const remainingCount = Math.max(0, 200 - totalCount);
  const exceededCount = Math.max(0, totalCount - 200);
  const hasErrors = invalidEntries.length > 0 || duplicateEntries.length > 0;

  return {
    validDates: sortedDates,
    calendarDays,
    monthlyDistribution,
    totalCount,
    remainingCount,
    exceededCount,
    isExactly200,
    hasErrors,
    duplicateEntries,
    invalidEntries,
    holidayConflicts,
    weekendDays,
  };
};

export const toggleDateInSchoolDaysList = (
  currentDates: string[],
  dateStr: string
): { dates: string[]; added: boolean } => {
  const exists = currentDates.includes(dateStr);
  const next = exists
    ? currentDates.filter((d) => d !== dateStr)
    : [...currentDates, dateStr];
  return {
    dates: sortDatesChronologically(next),
    added: !exists,
  };
};

export const fillMonthWeekdaysInSchoolDaysList = (
  currentDates: string[],
  year: number,
  monthNumber: number,
  holidays: SchoolHoliday[]
): string[] => {
  const holidaySet = new Set(holidays.map((h) => h.date.trim()));
  const pad = (n: number) => n.toString().padStart(2, '0');
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const next = new Set(currentDates);

  for (let d = 1; d <= daysInMonth; d++) {
    if (monthNumber === 7 && d < 19) continue; // Preserva recesso de inverno padrão
    const dateObj = new Date(year, monthNumber - 1, d);
    const dow = dateObj.getDay();
    const dateStr = `${pad(d)}/${pad(monthNumber)}/${year}`;
    if (dow >= 1 && dow <= 5 && !holidaySet.has(dateStr)) {
      next.add(dateStr);
    }
  }

  return sortDatesChronologically(Array.from(next));
};

export const clearMonthInSchoolDaysList = (
  currentDates: string[],
  year: number,
  monthNumber: number
): string[] => {
  const suffix = `/${monthNumber.toString().padStart(2, '0')}/${year}`;
  return sortDatesChronologically(currentDates.filter((d) => !d.endsWith(suffix)));
};

export const removeHolidayConflictsFromSchoolDays = (
  currentDates: string[],
  holidays: SchoolHoliday[]
): { dates: string[]; removedCount: number } => {
  const holidaySet = new Set(holidays.map((h) => h.date.trim()));
  const filtered = currentDates.filter((d) => !holidaySet.has(d.trim()));
  return {
    dates: sortDatesChronologically(filtered),
    removedCount: currentDates.length - filtered.length,
  };
};

export const autoBalanceSchoolDaysTo200 = (
  currentDates: string[],
  year: number,
  holidays: SchoolHoliday[]
): { dates: string[]; addedCount: number; removedCount: number } => {
  const holidaySet = new Set(holidays.map((h) => h.date.trim()));
  const working = new Set(sortDatesChronologically(currentDates));
  let addedCount = 0;
  let removedCount = 0;

  if (working.size < 200) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    // 1. Tenta adicionar dias úteis não-feriados (Fev–Dez, respeitando férias de julho inicialmente)
    const addCandidate = (allowEarlyJuly: boolean, allowSaturday: boolean) => {
      for (let m = 2; m <= 12 && working.size < 200; m++) {
        const daysInM = new Date(year, m, 0).getDate();
        for (let d = 1; d <= daysInM && working.size < 200; d++) {
          if (!allowEarlyJuly && m === 7 && d < 19) continue;
          const dateObj = new Date(year, m - 1, d);
          const dow = dateObj.getDay();
          const dateStr = `${pad(d)}/${pad(m)}/${year}`;
          const validDow = allowSaturday ? dow === 6 : dow >= 1 && dow <= 5;
          if (validDow && !holidaySet.has(dateStr) && !working.has(dateStr)) {
            working.add(dateStr);
            addedCount++;
          }
        }
      }
    };
    addCandidate(false, false);
    if (working.size < 200) addCandidate(false, true);
    if (working.size < 200) addCandidate(true, false);
  } else if (working.size > 200) {
    const sorted = sortDatesChronologically(Array.from(working));
    // Prioriza remover finais de semana / excesso de dezembro de trás para frente
    const removableOrder = [
      ...sorted.filter((d) => {
        const [dd, mm, yy] = d.split('/').map(Number);
        const dow = new Date(yy, mm - 1, dd).getDay();
        return dow === 0 || dow === 6;
      }).reverse(),
      ...sorted.slice().reverse(),
    ];
    for (const candidate of removableOrder) {
      if (working.size <= 200) break;
      if (working.delete(candidate)) {
        removedCount++;
      }
    }
  }

  return {
    dates: sortDatesChronologically(Array.from(working)),
    addedCount,
    removedCount,
  };
};
