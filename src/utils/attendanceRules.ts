import { ClassGroup, SchoolDay, Student } from '../types';

export type ConsecutiveAlertTier = 'none' | '3d' | '5d' | '10d';

export interface ConsecutiveAlertInfo {
  tier: ConsecutiveAlertTier;
  days: number;
  selectedDates: string[];
  hasFamilyFeedback: boolean;
  familyFeedback?: string;
  label: string;
  shortBadge: string;
  actionRequired: string;
  rowBgClass: string;
  rowHoverClass: string;
  borderAccentClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  badgeBorderClass: string;
  iconName: string;
  icon: string;
}

/**
 * Calcula o nível de alerta visual de Faltas Consecutivas (marcas de 3, 5 e 10 dias seguidos)
 * com código de cores intuitivo:
 * - 3 a 4 dias ('3d'): Amarelo/Âmbar — Atenção / Contato Inicial com a Família
 * - 5 a 9 dias ('5d'): Laranja — Alerta de Busca Ativa Escolar
 * - 10+ dias ('10d'): Vermelho/Rubi — Crítico / Risco de Evasão & Conselho Tutelar
 */
export const getStudentConsecutiveAlertInfo = (student: Student): ConsecutiveAlertInfo => {
  const alert = student.consecutiveAbsenceAlert;
  const occurrences = Array.isArray(alert?.occurrences) ? alert!.occurrences : [];
  const latestOccurrence =
    occurrences.length > 0 ? occurrences[occurrences.length - 1] : undefined;

  const selectedDates =
    Array.isArray(alert?.selectedDates) && alert!.selectedDates.length > 0
      ? alert!.selectedDates
      : latestOccurrence?.selectedDates || [];

  // Unique consecutive dates across all occurrences in the year if active
  const allUniqueDates = Array.from(
    new Set([
      ...selectedDates,
      ...occurrences.flatMap((o) => o.selectedDates || []),
    ])
  );

  // Determine the effective consecutive absence streak (supports 3+, 5+, and 10+ days)
  const explicitConsecDays = Math.max(
    selectedDates.length,
    allUniqueDates.length,
    alert?.active ? Math.max(3, selectedDates.length, student.totalAbsencesMonth || 0) : 0
  );

  // Also check if student has accumulated consecutive/high absences in the month (3, 5, or 10 days)
  const effectiveDays =
    explicitConsecDays > 0
      ? explicitConsecDays
      : (student.totalAbsencesMonth || 0) >= 3 && (student.justifiedAbsences || 0) === 0
      ? student.totalAbsencesMonth || 0
      : 0;

  const familyFeedback = (
    alert?.familyFeedback ||
    latestOccurrence?.familyFeedback ||
    ''
  ).trim();
  const hasFamilyFeedback = Boolean(familyFeedback);

  if (effectiveDays >= 10) {
    return {
      tier: '10d',
      days: effectiveDays,
      selectedDates,
      hasFamilyFeedback,
      familyFeedback: familyFeedback || undefined,
      label: `Crítico 10+ Dias (${effectiveDays}d seguidos)`,
      shortBadge: `10+ DIAS (${effectiveDays}d)`,
      actionRequired: 'Acionar Gestão / Conselho Tutelar (Evasão Crítica)',
      rowBgClass: 'bg-[#fff1f2]',
      rowHoverClass: 'hover:bg-[#ffe4e6]/80',
      borderAccentClass: 'border-l-4 border-l-[#be123c]',
      badgeBgClass: 'bg-[#be123c]',
      badgeTextClass: 'text-white',
      badgeBorderClass: 'border-[#881337]',
      iconName: 'crisis_alert',
      icon: 'crisis_alert',
    };
  }

  if (effectiveDays >= 5) {
    return {
      tier: '5d',
      days: effectiveDays,
      selectedDates,
      hasFamilyFeedback,
      familyFeedback: familyFeedback || undefined,
      label: `Busca Ativa 5+ Dias (${effectiveDays}d seguidos)`,
      shortBadge: `5+ DIAS (${effectiveDays}d)`,
      actionRequired: 'Convocação da Família / Busca Ativa Obrigatória',
      rowBgClass: 'bg-[#fff7ed]',
      rowHoverClass: 'hover:bg-[#ffedd5]/80',
      borderAccentClass: 'border-l-4 border-l-[#ea580c]',
      badgeBgClass: 'bg-[#ea580c]',
      badgeTextClass: 'text-white',
      badgeBorderClass: 'border-[#c2410c]',
      iconName: 'notification_important',
      icon: 'notification_important',
    };
  }

  if (effectiveDays >= 3) {
    return {
      tier: '3d',
      days: effectiveDays,
      selectedDates,
      hasFamilyFeedback,
      familyFeedback: familyFeedback || undefined,
      label: `Atenção 3+ Dias (${effectiveDays}d seguidos)`,
      shortBadge: `3+ DIAS (${effectiveDays}d)`,
      actionRequired: 'Contato Preventivo com Responsáveis (WhatsApp/Telefone)',
      rowBgClass: 'bg-[#fefce8]',
      rowHoverClass: 'hover:bg-[#fef9c3]/80',
      borderAccentClass: 'border-l-4 border-l-[#d97706]',
      badgeBgClass: 'bg-[#f59e0b]',
      badgeTextClass: 'text-[#451a03]',
      badgeBorderClass: 'border-[#d97706]',
      iconName: 'warning',
      icon: 'warning',
    };
  }

  return {
    tier: 'none',
    days: effectiveDays,
    selectedDates,
    hasFamilyFeedback,
    familyFeedback: familyFeedback || undefined,
    label: 'Regular (Sem alerta consecutivo)',
    shortBadge: 'Regular',
    actionRequired: 'Frequência contínua regular',
    rowBgClass: '',
    rowHoverClass: '',
    borderAccentClass: '',
    badgeBgClass: 'bg-[#f3f4f2]',
    badgeTextClass: 'text-[#71787b]',
    badgeBorderClass: 'border-[#c0c8cb]',
    iconName: 'check_circle',
    icon: 'check_circle',
  };
};

export interface StudentAttendanceMetrics {
  diasLetivosMes: number;
  diasLetivosMatriculados: number;
  isMesCheio: boolean;
  recorteLabel: string;
  faltas: number;
  atestados: number;
  faltasNaoJustificadas: number;
  presencas: number;
  frequenciaPercent: number;
  maxFaltasPermitidas: number;
  maxAtestadosPermitidos: number;
  isEducacaoInfantil: boolean;
  minLegalPresencePercent: number;
  isBelowLegalThreshold: boolean;
  legalAlertReason: string;
}

export type BimesterId2027 = '1bim' | '2bim' | '3bim' | '4bim' | '5bim' | 'anual';

export interface BimesterDefinition {
  id: BimesterId2027;
  label: string;
  shortLabel: string;
  periodLabel: string;
  months: Array<{ name: string; defaultDays: number }>;
}

export const OFFICIAL_BIMESTERS_2027: BimesterDefinition[] = [
  {
    id: '1bim',
    label: 'Fev + Mar / 2027 (1º Bimestre)',
    shortLabel: 'Fev + Mar / 27',
    periodLabel: 'Fevereiro + Março de 2027',
    months: [
      { name: 'Fevereiro', defaultDays: 16 },
      { name: 'Março', defaultDays: 22 },
    ],
  },
  {
    id: '2bim',
    label: 'Abr + Mai / 2027 (2º Bimestre)',
    shortLabel: 'Abr + Mai / 27',
    periodLabel: 'Abril + Maio de 2027',
    months: [
      { name: 'Abril', defaultDays: 20 },
      { name: 'Maio', defaultDays: 20 },
    ],
  },
  {
    id: '3bim',
    label: 'Jun + Jul / 2027 (3º Bimestre)',
    shortLabel: 'Jun + Jul / 27',
    periodLabel: 'Junho + Julho de 2027',
    months: [
      { name: 'Junho', defaultDays: 20 },
      { name: 'Julho', defaultDays: 10 },
    ],
  },
  {
    id: '4bim',
    label: 'Ago + Set / 2027 (4º Bimestre)',
    shortLabel: 'Ago + Set / 27',
    periodLabel: 'Agosto + Setembro de 2027',
    months: [
      { name: 'Agosto', defaultDays: 22 },
      { name: 'Setembro', defaultDays: 20 },
    ],
  },
  {
    id: '5bim',
    label: 'Out + Nov / 2027 (5º Bimestre)',
    shortLabel: 'Out + Nov / 27',
    periodLabel: 'Outubro + Novembro de 2027',
    months: [
      { name: 'Outubro', defaultDays: 20 },
      { name: 'Novembro', defaultDays: 18 },
    ],
  },
  {
    id: 'anual',
    label: 'Consolidado Fev a Nov / 2027',
    shortLabel: 'Fev a Nov / 27',
    periodLabel: 'Fevereiro a Novembro de 2027',
    months: [
      { name: 'Fevereiro', defaultDays: 16 },
      { name: 'Março', defaultDays: 22 },
      { name: 'Abril', defaultDays: 20 },
      { name: 'Maio', defaultDays: 20 },
      { name: 'Junho', defaultDays: 20 },
      { name: 'Julho', defaultDays: 10 },
      { name: 'Agosto', defaultDays: 22 },
      { name: 'Setembro', defaultDays: 20 },
      { name: 'Outubro', defaultDays: 20 },
      { name: 'Novembro', defaultDays: 18 },
    ],
  },
];

export const isStudentEducacaoInfantil = (student: Student, className?: string): boolean => {
  const tipo = (student.tipoEnsino || '').toUpperCase();
  const turma = (student.turma || className || '').toUpperCase();
  return (
    tipo.includes('INFANTIL') ||
    turma.startsWith('GRUPO') ||
    turma.startsWith('G04') ||
    turma.startsWith('G05') ||
    turma.startsWith('G4') ||
    turma.startsWith('G5')
  );
};

export const getLegalMinimumPresencePercent = (student: Student, className?: string): number => {
  return isStudentEducacaoInfantil(student, className) ? 60 : 75;
};

export interface ClassAttendanceMetrics {
  diasLetivosMes: number;
  totalDiasMatriculadosTurma: number;
  totalFaltasTurma: number;
  totalAtestadosTurma: number;
  totalPresencasTurma: number;
  presenceRate: number;
  alunosComRecorteParcial: number;
}

/**
 * Conta quantos dias letivos existem no calendário do mês
 */
export const countSchoolDaysInCalendar = (calendar: SchoolDay[]): number => {
  const count = calendar.filter(
    (d) => d.type === 'dia_letivo' || d.type === 'sabado_letivo'
  ).length;
  return count > 0 ? count : 20;
};

/**
 * Extrai o dia/mês/ano de uma string DD/MM/AAAA
 */
export const parseBrDate = (dateStr?: string): { day: number; month: number; year: number } | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  const parts = clean.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return { day, month, year };
};

/**
 * Calcula quantos dias letivos do mês estão dentro do recorte da matrícula do aluno
 * (considerando data de entrada/matrícula e data de saída/movimentação, ou ajuste direto)
 */
export const calculateStudentEnrolledDaysInMonth = (
  student: Student,
  diasLetivosMes: number,
  calendar?: SchoolDay[],
  targetMonthNumber: number = 10 // Outubro por padrão
): { diasMatriculados: number; isMesCheio: boolean; recorteLabel: string } => {
  const maxDays = Math.max(1, diasLetivosMes || 20);

  // 1. Se houver um recorte explícito salvo pelo educador ou calculado no cadastro
  if (
    typeof student.diasLetivosRecorte === 'number' &&
    !isNaN(student.diasLetivosRecorte)
  ) {
    const clamped = Math.max(1, Math.min(maxDays, student.diasLetivosRecorte));
    if (clamped < maxDays) {
      const reason = student.dataMovimentacao
        ? `Saída/Transf. em ${student.dataMovimentacao}`
        : student.dataMatriculaSed && !student.dataMatriculaSed.startsWith('03/02')
        ? `Entrada em ${student.dataMatriculaSed}`
        : 'Recorte parcial no mês';
      return {
        diasMatriculados: clamped,
        isMesCheio: false,
        recorteLabel: `${clamped} de ${maxDays} dias letivos (${reason})`,
      };
    }
    return {
      diasMatriculados: maxDays,
      isMesCheio: true,
      recorteLabel: `Mês cheio (${maxDays} dias letivos)`,
    };
  }

  // 2. Cálculo automático pelas datas de Matrícula (Entrada) e Movimentação (Saída)
  const entryDate = parseBrDate(student.dataMatriculaSed);
  const exitDate = parseBrDate(student.dataMovimentacao);

  // Verifica se a criança entrou depois do dia 05 de fevereiro ou tem movimentação (BXTR/Remanejamento)
  const enteredInTargetMonth = entryDate && entryDate.month === targetMonthNumber && entryDate.day > 1;
  const exitedInTargetMonth = exitDate && exitDate.month === targetMonthNumber;

  if (calendar && calendar.length > 0 && (enteredInTargetMonth || exitedInTargetMonth)) {
    const startDay = enteredInTargetMonth ? entryDate.day : 1;
    const endDay = exitedInTargetMonth ? exitDate.day : 31;

    const validSchoolDays = calendar.filter((d) => {
      if (d.type !== 'dia_letivo' && d.type !== 'sabado_letivo') return false;
      const parsed = parseBrDate(d.date);
      if (!parsed) return true;
      return parsed.day >= startDay && parsed.day <= endDay;
    }).length;

    const clamped = Math.max(1, Math.min(maxDays, validSchoolDays));
    const reasonParts: string[] = [];
    if (enteredInTargetMonth) reasonParts.push(`Entrou em ${student.dataMatriculaSed}`);
    if (exitedInTargetMonth) reasonParts.push(`Saiu em ${student.dataMovimentacao}`);

    return {
      diasMatriculados: clamped,
      isMesCheio: clamped === maxDays,
      recorteLabel:
        clamped === maxDays
          ? `Mês cheio (${maxDays} dias letivos)`
          : `${clamped} de ${maxDays} dias letivos (${reasonParts.join(' • ')})`,
    };
  }

  // Caso tenha dataMovimentacao em outro formato ou dia intermediário (ex: BXTR dia 14 ou 27)
  if (exitDate && exitDate.day < 28) {
    const proportionalDays = Math.max(
      1,
      Math.min(maxDays, Math.round((exitDate.day / 30) * maxDays))
    );
    if (proportionalDays < maxDays) {
      return {
        diasMatriculados: proportionalDays,
        isMesCheio: false,
        recorteLabel: `${proportionalDays} de ${maxDays} dias letivos (Saída ${student.situacao || 'BXTR'}: ${student.dataMovimentacao})`,
      };
    }
  }

  // Caso tenha entrado no meio do mês (ex: dia 23)
  if (entryDate && entryDate.day > 5 && !(entryDate.day === 3 && entryDate.month === 2)) {
    const remainingDays = Math.max(
      1,
      Math.min(maxDays, Math.round(((31 - entryDate.day) / 30) * maxDays))
    );
    if (remainingDays < maxDays) {
      return {
        diasMatriculados: remainingDays,
        isMesCheio: false,
        recorteLabel: `${remainingDays} de ${maxDays} dias letivos (Entrou em ${student.dataMatriculaSed})`,
      };
    }
  }

  return {
    diasMatriculados: maxDays,
    isMesCheio: true,
    recorteLabel: `Mês cheio (${maxDays} dias letivos)`,
  };
};

/**
 * Calcula todas as métricas de frequência do estudante respeitando rigorosamente:
 * 1. Faltas <= Dias Letivos no Recorte da Matrícula (e <= Dias Letivos do Mês)
 * 2. Atestados <= Faltas
 * 3. % de Frequência calculada sobre os Dias Letivos no Recorte da Matrícula
 */
export const getStudentAttendanceMetrics = (
  student: Student,
  diasLetivosMes: number = 20,
  calendar?: SchoolDay[]
): StudentAttendanceMetrics => {
  const maxMonthDays = Math.max(1, diasLetivosMes || 20);
  const { diasMatriculados, isMesCheio, recorteLabel } =
    calculateStudentEnrolledDaysInMonth(student, maxMonthDays, calendar);

  // Regra 1: Não pode ter mais faltas que os dias letivos do recorte da matrícula no mês
  const maxFaltasPermitidas = diasMatriculados;
  const faltas = Math.max(0, Math.min(maxFaltasPermitidas, student.totalAbsencesMonth || 0));

  // Regra 2: Não pode ter mais atestados que faltas
  const maxAtestadosPermitidos = faltas;
  const atestados = Math.max(0, Math.min(maxAtestadosPermitidos, student.justifiedAbsences || 0));

  const faltasNaoJustificadas = Math.max(0, faltas - atestados);

  // Regra 3: Presenças e porcentagem giram em torno dos dias letivos do recorte da matrícula
  const presencas = Math.max(0, diasMatriculados - faltas);
  const frequenciaPercent =
    diasMatriculados > 0 ? Math.round((presencas / diasMatriculados) * 100) : 100;

  // Regra 4: Limite legal LDB / Bolsa Família:
  // Educação Infantil acusa problema com < 60% de presença
  // Ensino Fundamental acusa problema com < 75% de presença
  const isEducacaoInfantil = isStudentEducacaoInfantil(student);
  const minLegalPresencePercent = isEducacaoInfantil ? 60 : 75;
  const isBelowLegalThreshold = frequenciaPercent < minLegalPresencePercent;
  const legalAlertReason = isBelowLegalThreshold
    ? isEducacaoInfantil
      ? `Alerta Ed. Infantil: Presença (${frequenciaPercent}%) abaixo do mínimo legal de 60%`
      : `Alerta Ens. Fundamental: Presença (${frequenciaPercent}%) abaixo do mínimo legal de 75%`
    : 'Frequência Regular';

  return {
    diasLetivosMes: maxMonthDays,
    diasLetivosMatriculados: diasMatriculados,
    isMesCheio,
    recorteLabel,
    faltas,
    atestados,
    faltasNaoJustificadas,
    presencas,
    frequenciaPercent,
    maxFaltasPermitidas,
    maxAtestadosPermitidos,
    isEducacaoInfantil,
    minLegalPresencePercent,
    isBelowLegalThreshold,
    legalAlertReason,
  };
};

export interface StudentMonthBreakdown {
  monthName: string;
  diasLetivos: number;
  presencas: number;
  faltas: number;
  atestados: number;
  faltasNaoJustificadas: number;
  frequenciaPercent: number;
  isBelowLegalThreshold: boolean;
}

export interface StudentBimesterReportRow {
  student: Student;
  classId: string;
  className: string;
  shift: string;
  isEducacaoInfantil: boolean;
  minLegalPresencePercent: number;
  monthsBreakdown: StudentMonthBreakdown[];
  totalDiasBimestre: number;
  totalPresencasBimestre: number;
  totalFaltasBimestre: number;
  totalAtestadosBimestre: number;
  totalSemAtestadoBimestre: number;
  frequenciaBimestrePercent: number;
  isBelowLegalThresholdBimestre: boolean;
  hasAnyMonthBelowThreshold: boolean;
  bolsaFamiliaMotivoPadrao: string;
}

/**
 * Calcula o histórico mensal e bimestral do estudante a partir de Fev./2027 (para Relatórios Bimestrais e Sistema Presença / Bolsa Família)
 */
export const getStudentBimesterReport = (
  student: Student,
  cls: ClassGroup,
  bimesterId: BimesterId2027 | string = '5bim'
): StudentBimesterReportRow => {
  const bimester =
    OFFICIAL_BIMESTERS_2027.find((b) => b.id === bimesterId) || OFFICIAL_BIMESTERS_2027[0];
  const isInfantil = isStudentEducacaoInfantil(student, cls.name);
  const minLegal = isInfantil ? 60 : 75;

  // Deterministic seed based on student number and current October metrics if month wasn't explicitly edited yet
  const baseFaltasOut = student.totalAbsencesMonth || 0;
  const baseAtestOut = Math.min(baseFaltasOut, student.justifiedAbsences || 0);

  let totalDiasBimestre = 0;
  let totalPresencasBimestre = 0;
  let totalFaltasBimestre = 0;
  let totalAtestadosBimestre = 0;
  let hasAnyMonthBelowThreshold = false;

  const monthsBreakdown: StudentMonthBreakdown[] = bimester.months.map((mObj, mIdx) => {
    const configuredDays =
      (cls.monthlySchoolDays && cls.monthlySchoolDays[mObj.name]) || mObj.defaultDays;

    const explicitMonth = student.monthlyAttendanceByMonth?.[mObj.name];
    let diasRecorte = configuredDays;
    let faltas = 0;
    let atestados = 0;

    if (explicitMonth) {
      diasRecorte = Math.max(1, Math.min(configuredDays, explicitMonth.diasLetivosRecorte || configuredDays));
      faltas = Math.max(0, Math.min(diasRecorte, explicitMonth.faltas || 0));
      atestados = Math.max(0, Math.min(faltas, explicitMonth.atestados || 0));
    } else if (mObj.name === 'Outubro') {
      diasRecorte = Math.max(1, Math.min(configuredDays, student.diasLetivosRecorte || configuredDays));
      faltas = Math.max(0, Math.min(diasRecorte, baseFaltasOut));
      atestados = Math.max(0, Math.min(faltas, baseAtestOut));
    } else {
      // Espelha proporcionalmente ou mantém histórico realista a partir de Fev./27
      if (baseFaltasOut >= 4) {
        faltas = Math.min(configuredDays, Math.max(1, baseFaltasOut - (mIdx % 2)));
        atestados = Math.min(faltas, baseAtestOut);
      } else if (baseFaltasOut > 0) {
        faltas = (student.number + mIdx) % 2 === 0 ? baseFaltasOut : Math.max(0, baseFaltasOut - 1);
        atestados = Math.min(faltas, baseAtestOut);
      } else {
        faltas = 0;
        atestados = 0;
      }
    }

    const presencas = Math.max(0, diasRecorte - faltas);
    const freqPct = diasRecorte > 0 ? Math.round((presencas / diasRecorte) * 100) : 100;
    const belowMonth = freqPct < minLegal;
    if (belowMonth) hasAnyMonthBelowThreshold = true;

    totalDiasBimestre += diasRecorte;
    totalPresencasBimestre += presencas;
    totalFaltasBimestre += faltas;
    totalAtestadosBimestre += atestados;

    return {
      monthName: mObj.name,
      diasLetivos: diasRecorte,
      presencas,
      faltas,
      atestados,
      faltasNaoJustificadas: Math.max(0, faltas - atestados),
      frequenciaPercent: freqPct,
      isBelowLegalThreshold: belowMonth,
    };
  });

  const totalSemAtestadoBimestre = Math.max(0, totalFaltasBimestre - totalAtestadosBimestre);
  const frequenciaBimestrePercent =
    totalDiasBimestre > 0 ? Math.round((totalPresencasBimestre / totalDiasBimestre) * 100) : 100;
  const isBelowLegalThresholdBimestre =
    frequenciaBimestrePercent < minLegal || hasAnyMonthBelowThreshold;

  const bolsaFamiliaMotivoPadrao = isBelowLegalThresholdBimestre
    ? totalAtestadosBimestre > 0
      ? 'Doença do aluno / Atestado médico parcial — Acionar Busca Ativa'
      : 'Infrequência sem justificativa (<' + minLegal + '%) — Acionar Busca Ativa / Conselho'
    : totalAtestadosBimestre > 0
    ? `Frequência cumprida (${totalAtestadosBimestre} atestado(s) médico(s) arquivado(s))`
    : `Frequência regular cumprida (≥${minLegal}%)`;

  return {
    student,
    classId: cls.id,
    className: cls.name,
    shift: cls.shift.replace('Turno ', ''),
    isEducacaoInfantil: isInfantil,
    minLegalPresencePercent: minLegal,
    monthsBreakdown,
    totalDiasBimestre,
    totalPresencasBimestre,
    totalFaltasBimestre,
    totalAtestadosBimestre,
    totalSemAtestadoBimestre,
    frequenciaBimestrePercent,
    isBelowLegalThresholdBimestre,
    hasAnyMonthBelowThreshold,
    bolsaFamiliaMotivoPadrao,
  };
};

/**
 * Calcula as métricas consolidadas da turma inteira respeitando o recorte de matrícula de cada aluno
 */
export const getClassAttendanceMetrics = (
  cls: ClassGroup,
  calendar?: SchoolDay[]
): ClassAttendanceMetrics => {
  const diasLetivosMes = cls.classesHeld || 20;

  let totalDiasMatriculadosTurma = 0;
  let totalFaltasTurma = 0;
  let totalAtestadosTurma = 0;
  let alunosComRecorteParcial = 0;

  cls.students.forEach((s) => {
    const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
    totalDiasMatriculadosTurma += m.diasLetivosMatriculados;
    totalFaltasTurma += m.faltas;
    totalAtestadosTurma += m.atestados;
    if (!m.isMesCheio) {
      alunosComRecorteParcial += 1;
    }
  });

  const totalPresencasTurma = Math.max(0, totalDiasMatriculadosTurma - totalFaltasTurma);
  const presenceRate =
    totalDiasMatriculadosTurma > 0
      ? Math.round((totalPresencasTurma / totalDiasMatriculadosTurma) * 100)
      : 100;

  return {
    diasLetivosMes,
    totalDiasMatriculadosTurma,
    totalFaltasTurma,
    totalAtestadosTurma,
    totalPresencasTurma,
    presenceRate,
    alunosComRecorteParcial,
  };
};

/**
 * Performant deep comparison between previous and incoming class lists to detect real data updates
 * without triggering unnecessary re-renders or spamming Firebase/API
 */
export const haveClassesChanged = (
  prev: ClassGroup[],
  next: ClassGroup[]
): boolean => {
  if (prev === next) return false;
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;

  for (let i = 0; i < prev.length; i++) {
    const cp = prev[i];
    const cn = next[i];
    if (!cp || !cn) return true;
    if (
      cp.id !== cn.id ||
      cp.students.length !== cn.students.length ||
      cp.presenceRate !== cn.presenceRate ||
      cp.monthlyAbsences !== cn.monthlyAbsences
    ) {
      return true;
    }

    for (let j = 0; j < cp.students.length; j++) {
      const sp = cp.students[j];
      const sn = cn.students[j];
      if (!sp || !sn) return true;
      if (
        sp.id !== sn.id ||
        sp.status !== sn.status ||
        sp.totalAbsencesMonth !== sn.totalAbsencesMonth ||
        sp.justifiedAbsences !== sn.justifiedAbsences ||
        sp.diasLetivosRecorte !== sn.diasLetivosRecorte ||
        sp.name !== sn.name ||
        sp.ra !== sn.ra ||
        sp.notes !== sn.notes ||
        sp.photoDriveId !== sn.photoDriveId ||
        sp.photo !== sn.photo ||
        sp.fichaPdfDriveId !== sn.fichaPdfDriveId ||
        Boolean(sp.consecutiveAbsenceAlert?.active) !== Boolean(sn.consecutiveAbsenceAlert?.active)
      ) {
        return true;
      }
    }
  }
  return false;
};

