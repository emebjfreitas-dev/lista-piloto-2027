import { ClassGroup, SchoolDay, Student } from '../types';

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
}

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
