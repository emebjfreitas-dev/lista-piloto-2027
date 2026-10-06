import * as XLSX from 'xlsx';
import { ClassGroup, SchoolDay, AuthorizedUser, AttendanceWindowConfig } from '../types';
import {
  INITIAL_CLASSES,
  OFFICIAL_OCTOBER_DAYS,
  MONTHLY_SCHOOL_DAYS_2027,
  INITIAL_AUTHORIZED_USERS,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import { getStudentAttendanceMetrics, getClassAttendanceMetrics } from '../utils/attendanceRules';

const STORAGE_KEY = 'emeb_candelario_sed_classes_2027_v4';
const USERS_STORAGE_KEY = 'emeb_candelario_authorized_users_2027_v2';
const ATTENDANCE_WINDOW_STORAGE_KEY = 'emeb_candelario_attendance_window_2027_v1';

export const getStoredAttendanceWindowConfig = (): AttendanceWindowConfig => {
  try {
    const raw = localStorage.getItem(ATTENDANCE_WINDOW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.exceptionalOverrideOpen === 'boolean') {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Erro ao ler configuração de janela de lançamento:', err);
  }
  return {
    exceptionalOverrideOpen: false,
  };
};

export const saveStoredAttendanceWindowConfig = (
  config: AttendanceWindowConfig
): void => {
  try {
    localStorage.setItem(ATTENDANCE_WINDOW_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Erro ao salvar configuração de janela de lançamento:', err);
  }
};

/**
 * Evaluates whether a given date (or current date) falls within the official monthly attendance launch window:
 * - Last school day (último dia letivo) of the month, OR
 * - First 2 school days (dois primeiros dias letivos) of the next month
 * OR if exceptional override is enabled in the Access Management tab.
 */
export const evaluateAttendanceLaunchWindow = (
  config: AttendanceWindowConfig,
  referenceDate?: Date
): {
  isWithinCalendarWindow: boolean;
  isAllowedToLaunch: boolean;
  reasonLabel: string;
  currentDateFormatted: string;
  windowRuleDescription: string;
} => {
  const dateObj = config.simulatedDateISO
    ? new Date(`${config.simulatedDateISO}T12:00:00`)
    : referenceDate || new Date();

  const currentDateFormatted = dateObj.toLocaleDateString('pt-BR');
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth(); // 0..11
  const dayOfMonth = dateObj.getDate();

  // Compute all weekday school days (Mon-Fri) in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const schoolDaysInMonth: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const dow = dt.getDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5) {
      schoolDaysInMonth.push(d);
    }
  }

  const firstTwoSchoolDays = schoolDaysInMonth.slice(0, 2);
  const lastSchoolDay =
    schoolDaysInMonth.length > 0
      ? schoolDaysInMonth[schoolDaysInMonth.length - 1]
      : daysInMonth;

  const isLastSchoolDayOfMonth = dayOfMonth === lastSchoolDay;
  const isFirstTwoSchoolDaysOfNextMonth = firstTwoSchoolDays.includes(dayOfMonth);
  const isWithinCalendarWindow =
    isLastSchoolDayOfMonth || isFirstTwoSchoolDaysOfNextMonth;

  const isAllowedToLaunch =
    isWithinCalendarWindow || config.exceptionalOverrideOpen;

  let reasonLabel = '';
  if (isLastSchoolDayOfMonth) {
    reasonLabel = `Aberto Automaticamente: Último Dia Letivo do Mês (${currentDateFormatted})`;
  } else if (isFirstTwoSchoolDaysOfNextMonth) {
    reasonLabel = `Aberto Automaticamente: 2 Primeiros Dias Letivos do Mês (${currentDateFormatted})`;
  } else if (config.exceptionalOverrideOpen) {
    reasonLabel = `Aberto Excepcionalmente pela Direção na Aba Acessos`;
  } else {
    reasonLabel = `Fechado Hoje (${currentDateFormatted}) — Abre no último dia letivo (dia ${String(
      lastSchoolDay
    ).padStart(2, '0')}) e nos 2 primeiros dias letivos do próximo mês`;
  }

  return {
    isWithinCalendarWindow,
    isAllowedToLaunch,
    reasonLabel,
    currentDateFormatted,
    windowRuleDescription:
      'Liberado apenas no último dia letivo do mês e nos 2 primeiros dias letivos do mês seguinte (ou abertura excepcional na aba Acessos).',
  };
};

// Validate institutional domain @educacao.jundiai.sp.gov.br (plus official school owner emebjfreitas@jundiai.sp.gov.br)
export const isValidInstitutionalEmail = (email: string): boolean => {
  const normalized = email.trim().toLowerCase();
  if (normalized === 'emebjfreitas@jundiai.sp.gov.br') {
    return true;
  }
  return (
    normalized.endsWith(INSTITUTIONAL_EMAIL_DOMAIN) &&
    normalized.length > INSTITUTIONAL_EMAIL_DOMAIN.length &&
    !normalized.includes(' ')
  );
};

export const getStoredAuthorizedUsers = (): AuthorizedUser[] => {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Erro ao ler usuários autorizados:', err);
  }
  return INITIAL_AUTHORIZED_USERS;
};

export const saveStoredAuthorizedUsers = (users: AuthorizedUser[]): void => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(classesOrUsersSanitize(users)));
  } catch (err) {
    console.error('Erro ao salvar usuários autorizados:', err);
  }
};

const classesOrUsersSanitize = (users: AuthorizedUser[]): AuthorizedUser[] => {
  return users.map((u) => ({
    ...u,
    email: u.email.trim().toLowerCase(),
  }));
};

export const findAuthorizedUserByEmail = (
  email: string,
  usersList?: AuthorizedUser[]
): AuthorizedUser | undefined => {
  const normalized = email.trim().toLowerCase();
  const list = usersList || getStoredAuthorizedUsers();
  return list.find((u) => u.email.trim().toLowerCase() === normalized);
};

// Load classes from localStorage or fallback to defaults
export const getStoredClasses = (): ClassGroup[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.name?.startsWith('GRUPO')) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Erro ao ler dados locais:', err);
  }
  return INITIAL_CLASSES;
};

// Save classes to localStorage
export const saveStoredClasses = (classes: ClassGroup[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
  } catch (err) {
    console.error('Erro ao salvar no banco local:', err);
  }
};

// Reset database to initial classes
export const resetDatabase = (): ClassGroup[] => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error(e);
  }
  return INITIAL_CLASSES;
};

const isEducacaoInfantilClass = (cls: ClassGroup): boolean => {
  return (
    cls.name.toUpperCase().startsWith('GRUPO') ||
    cls.grade.toUpperCase().includes('INFANTIL')
  );
};

// Helper to build detailed nominal rows for a specific education stage (Educação Infantil or Ensino Fundamental)
const buildNominalAttendanceRowsForStage = (
  classes: ClassGroup[],
  stage: 'EDUCACAO INFANTIL' | 'ENSINO FUNDAMENTAL',
  calendar: SchoolDay[]
): any[] => {
  const stageClasses = classes.filter((cls) =>
    stage === 'EDUCACAO INFANTIL'
      ? isEducacaoInfantilClass(cls)
      : !isEducacaoInfantilClass(cls)
  );

  const rows: any[] = [];
  let totalDiasRecorte = 0;
  let totalPresencas = 0;
  let totalFaltas = 0;
  let totalAtestados = 0;
  let totalSemAtestado = 0;
  let totalEstudantes = 0;

  stageClasses.forEach((cls) => {
    const diasLetivosMes = cls.classesHeld || 20;
    const turnoLabel = cls.shift.replace('Turno ', '').toUpperCase();

    cls.students.forEach((s) => {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      const faltasSemAtestado = Math.max(0, m.faltas - m.atestados);
      const percentFaltas =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
          : 0;
      const percentAtestadosSobreFaltas =
        m.faltas > 0 ? Math.round((m.atestados / m.faltas) * 100) : 0;
      const percentAtestadosSobreDias =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.atestados / m.diasLetivosMatriculados) * 100)
          : 0;

      totalEstudantes += 1;
      totalDiasRecorte += m.diasLetivosMatriculados;
      totalPresencas += m.presencas;
      totalFaltas += m.faltas;
      totalAtestados += m.atestados;
      totalSemAtestado += faltasSemAtestado;

      rows.push({
        'SEGMENTO DE ENSINO': stage,
        'ETAPA / SÉRIE': cls.grade,
        'TURMA': cls.name,
        'TURNO': turnoLabel,
        'SALA': cls.room,
        'Nº CHAMADA': s.number,
        'NOME NOMINAL DO(A) ESTUDANTE': s.name,
        'RA': s.ra ? `${s.ra}-${s.digRa || ''}/${s.ufRa || 'SP'}` : '',
        'DATA DE MATRÍCULA (SED)': s.dataMatriculaSed || '03/02/2027',
        'DATA DE MOVIMENTAÇÃO': s.dataMovimentacao || '',
        'SITUAÇÃO DO RECORTE': m.recorteLabel,
        'QTD DIAS LETIVOS DO MÊS': m.diasLetivosMes,
        'QTD DIAS NO RECORTE DA MATRÍCULA': m.diasLetivosMatriculados,
        'QTD PRESENÇAS NO PERÍODO': m.presencas,
        '% PRESENÇA (FREQUÊNCIA)': `${m.frequenciaPercent}%`,
        'QTD TOTAL DE FALTAS NO MÊS': m.faltas,
        '% FALTAS SOBRE DIAS MATRICULADOS': `${percentFaltas}%`,
        'QTD ATESTADOS APRESENTADOS (FALTAS JUSTIFICADAS)': m.atestados,
        '% ATESTADOS SOBRE O TOTAL DE FALTAS': `${percentAtestadosSobreFaltas}%`,
        '% ATESTADOS SOBRE DIAS MATRICULADOS': `${percentAtestadosSobreDias}%`,
        'QTD FALTAS NÃO JUSTIFICADAS (SEM ATESTADO)': faltasSemAtestado,
        'STATUS DE FREQUÊNCIA':
          m.faltas >= 4
            ? 'ALERTA DE INFREQUÊNCIA'
            : m.frequenciaPercent === 100
            ? '100% PRESENÇA'
            : 'REGULAR',
        'OBSERVAÇÕES / DETALHE DO ATESTADO': s.notes || '',
        'FILIAÇÃO / RESPONSÁVEL': s.filiacao1 || s.guardianName || '',
        'TELEFONE DE CONTATO': s.telefones || s.guardianPhone || '',
      });
    });
  });

  // Add consolidated summary row at the bottom of the nominal sheet
  if (totalEstudantes > 0) {
    const mediaPresenca =
      totalDiasRecorte > 0 ? Math.round((totalPresencas / totalDiasRecorte) * 100) : 100;
    const mediaFaltas =
      totalDiasRecorte > 0 ? Math.round((totalFaltas / totalDiasRecorte) * 100) : 0;
    const mediaAtestadosSobreFaltas =
      totalFaltas > 0 ? Math.round((totalAtestados / totalFaltas) * 100) : 0;
    const mediaAtestadosSobreDias =
      totalDiasRecorte > 0 ? Math.round((totalAtestados / totalDiasRecorte) * 100) : 0;

    rows.push({
      'SEGMENTO DE ENSINO': `TOTAL CONSOLIDADO — ${stage}`,
      'ETAPA / SÉRIE': `${stageClasses.length} TURMAS`,
      'TURMA': 'TODAS',
      'TURNO': 'MANHÃ + TARDE',
      'SALA': '—',
      'Nº CHAMADA': totalEstudantes,
      'NOME NOMINAL DO(A) ESTUDANTE': `TOTAL: ${totalEstudantes} ESTUDANTES TABULADOS`,
      'RA': '—',
      'DATA DE MATRÍCULA (SED)': '—',
      'DATA DE MOVIMENTAÇÃO': '—',
      'SITUAÇÃO DO RECORTE': 'SOMA DO SEGMENTO',
      'QTD DIAS LETIVOS DO MÊS': 20,
      'QTD DIAS NO RECORTE DA MATRÍCULA': totalDiasRecorte,
      'QTD PRESENÇAS NO PERÍODO': totalPresencas,
      '% PRESENÇA (FREQUÊNCIA)': `${mediaPresenca}%`,
      'QTD TOTAL DE FALTAS NO MÊS': totalFaltas,
      '% FALTAS SOBRE DIAS MATRICULADOS': `${mediaFaltas}%`,
      'QTD ATESTADOS APRESENTADOS (FALTAS JUSTIFICADAS)': totalAtestados,
      '% ATESTADOS SOBRE O TOTAL DE FALTAS': `${mediaAtestadosSobreFaltas}%`,
      '% ATESTADOS SOBRE DIAS MATRICULADOS': `${mediaAtestadosSobreDias}%`,
      'QTD FALTAS NÃO JUSTIFICADAS (SEM ATESTADO)': totalSemAtestado,
      'STATUS DE FREQUÊNCIA': `FREQUÊNCIA MÉDIA: ${mediaPresenca}%`,
      'OBSERVAÇÕES / DETALHE DO ATESTADO': '—',
      'FILIAÇÃO / RESPONSÁVEL': '—',
      'TELEFONE DE CONTATO': '—',
    });
  }

  return rows;
};

// Generate and trigger download of a real Excel/Google Sheets (.xlsx) workbook with SED modeling & nominal tabs separated by Educação Infantil and Ensino Fundamental
export const downloadSpreadsheetXLSX = (
  classes: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): void => {
  const wb = XLSX.utils.book_new();

  // Tab 1: Faltas e Atestados Nominais — EDUCAÇÃO INFANTIL (G4 e G5 separados, quantidade e porcentagem)
  const rowsNominalInfantil = buildNominalAttendanceRowsForStage(
    classes,
    'EDUCACAO INFANTIL',
    calendar
  );
  const wsInfantil = XLSX.utils.json_to_sheet(rowsNominalInfantil);
  XLSX.utils.book_append_sheet(wb, wsInfantil, 'Faltas_Atestados_Infantil');

  // Tab 2: Faltas e Atestados Nominais — ENSINO FUNDAMENTAL (1º ao 5º Ano separados, quantidade e porcentagem)
  const rowsNominalFundamental = buildNominalAttendanceRowsForStage(
    classes,
    'ENSINO FUNDAMENTAL',
    calendar
  );
  const wsFundamental = XLSX.utils.json_to_sheet(rowsNominalFundamental);
  XLSX.utils.book_append_sheet(wb, wsFundamental, 'Faltas_Atestados_Fundamental');

  // Tab 3: Matrículas e Frequência SED 2027 (Com todas as 48 colunas SED + Recorte da Matrícula e Frequência)
  const rowsSedFrequencia: any[] = [];
  classes.forEach((cls) => {
    const diasLetivosMes = cls.classesHeld || 20;
    cls.students.forEach((s) => {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      const faltasSemAtestado = Math.max(0, m.faltas - m.atestados);
      const percentFaltas =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
          : 0;
      const percentAtestados =
        m.faltas > 0 ? Math.round((m.atestados / m.faltas) * 100) : 0;

      rowsSedFrequencia.push({
        'TIPO DE ENSINO': s.tipoEnsino || (cls.name.startsWith('GRUPO') ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL'),
        'SÉRIE': s.serie || (cls.name.includes('04') ? '1' : cls.name.includes('05') ? '2' : cls.name[0]),
        'Nº CHAMADA': s.numeroChamada || s.number,
        'ESTUDANTE': s.estudante || s.name,
        'RA': s.ra || '',
        'DIG. RA': s.digRa || '',
        'UF RA': s.ufRa || 'SP',
        'DATA DE NASCIMENTO': s.dataNascimento || '',
        'TIPO ALOCAÇÃO': s.tipoAlocacao || '',
        'SITUAÇÃO': s.situacao || (m.faltas >= 4 ? 'ALERTA INFREQUÊNCIA' : 'ATIVO'),
        'DATA MOVIMENTAÇÃO': s.dataMovimentacao || '',
        'CATEGORIA PROFISSIONAL CENSO': s.categoriaProfissionalCenso || '',
        'DEFICIÊNCIA': s.deficiencia || '',
        'PÓS DATA CENSO': s.posDataCenso || '',
        'TURMA': s.turma || cls.name,
        'PERÍODO': s.periodo || (cls.shift === 'Turno Manhã' ? 'MANHÃ' : 'TARDE'),
        'DATA DE MATRÍCULA (SED)': s.dataMatriculaSed || '03/02/2027',
        'PROCEDÊNCIA ESCOLAR': s.procedenciaEscolar || '',
        'IRMÃOS': s.irmaos || '',
        'IDADE': s.idade || '',
        'ARQUIVO': s.arquivo || '',
        'FILIAÇÃO 1': s.filiacao1 || s.guardianName || '',
        'FILIAÇÃO 2': s.filiacao2 || '',
        'NOME SOCIAL': s.nomeSocial || '',
        'GÊNERO': s.genero || '',
        'TIPO SANGUÍNEO': s.tipoSanguineo || '',
        'RAÇA/COR': s.racaCor || '',
        'NACIONALIDADE': s.nacionalidade || 'BRASILEIRA',
        'PAÍS DE ORIGEM': s.paisOrigem || '',
        'MUNICÍPIO DE NASCIMENTO': s.municipioNascimento || 'JUNDIAI - SP',
        'CPF': s.cpf || '',
        'RG': s.rg || '',
        'DATA EMISSÃO RG': s.dataEmissaoRg || '',
        'CARTÃO SUS': s.cartaoSus || '',
        'NIS': s.nis || '',
        'CEP': s.cep || '13.214-000',
        'LOGRADOURO': s.logradouro || '',
        'N. RESIDENCIA': s.numeroResidencia || '',
        'COMPLEMENTO': s.complemento || '',
        'BAIRRO': s.bairro || '',
        'CIDADE': s.cidade || 'JUNDIAI',
        'UF': s.uf || 'SP',
        'TELEFONES': s.telefones || s.guardianPhone || '',
        'E-MAIL GOOGLE': s.emailGoogle || '',
        'E-MAIL MICROSOFT': s.emailMicrosoft || '',
        'EMAIL MUNICIPAL': s.emailMunicipal || '',
        'ROTA DE ÔNIBUS': s.rotaOnibus || '',
        'SUCESSÃO ESCOLAR': s.sucessaoEscolar || '',
        // Colunas de Controle de Frequência pelo Recorte da Matrícula no Mês
        'DIAS LETIVOS DO MÊS': m.diasLetivosMes,
        'DIAS LETIVOS NO RECORTE DA MATRÍCULA': m.diasLetivosMatriculados,
        'DETALHE DO RECORTE': m.recorteLabel,
        'QTD FALTAS NO MÊS': m.faltas,
        '% FALTAS NO RECORTE': `${percentFaltas}%`,
        'QTD ATESTADOS APRESENTADOS': m.atestados,
        '% ATESTADOS SOBRE FALTAS': `${percentAtestados}%`,
        'QTD FALTAS SEM ATESTADO': faltasSemAtestado,
        'QTD PRESENÇAS NO PERÍODO': m.presencas,
        '% FREQUÊNCIA NO RECORTE': `${m.frequenciaPercent}%`,
        'ATESTADO / ANOTAÇÕES': s.notes || '',
      });
    });
  });

  const wsSed = XLSX.utils.json_to_sheet(rowsSedFrequencia);
  XLSX.utils.book_append_sheet(wb, wsSed, 'SED_Matrículas_e_Frequência');

  // Tab 4: Dias Letivos por Mês e Calendário SME Jundiaí 2027
  const rowsCalendario = calendar.map((d) => ({
    'Data': d.date,
    'Dia da Semana': d.dayOfWeek,
    'Mês': d.month,
    'Ano': 2027,
    'Tipo':
      d.type === 'dia_letivo'
        ? 'Dia Letivo'
        : d.type === 'feriado'
        ? 'Feriado'
        : d.type === 'sabado_letivo'
        ? 'Sábado Letivo'
        : d.type === 'planejamento'
        ? 'Planejamento'
        : 'Recesso',
    'Descrição Oficial': d.description,
  }));
  const wsCalendario = XLSX.utils.json_to_sheet(rowsCalendario);
  XLSX.utils.book_append_sheet(wb, wsCalendario, 'Dias_Letivos_SME_2027');

  // Tab 5: Dias Letivos por Turma e Mês (Configuração Mensal do Administrador 2027)
  const rowsMesesPorTurma = classes.map((c) => {
    const row: Record<string, any> = {
      'Segmento': isEducacaoInfantilClass(c) ? 'EDUCAÇÃO INFANTIL' : 'ENSINO FUNDAMENTAL',
      'Turma': c.name,
      'Turno': c.shift,
      'Etapa / Ano': c.grade,
    };
    let somaAnual = 0;
    MONTHLY_SCHOOL_DAYS_2027.forEach((m) => {
      const days =
        c.monthlySchoolDays && typeof c.monthlySchoolDays[m.month] === 'number'
          ? c.monthlySchoolDays[m.month]
          : m.schoolDays;
      row[m.month] = days;
      somaAnual += days;
    });
    row['TOTAL ANUAL DE DIAS LETIVOS'] = somaAnual;
    return row;
  });
  const wsMeses = XLSX.utils.json_to_sheet(rowsMesesPorTurma);
  XLSX.utils.book_append_sheet(wb, wsMeses, 'Dias_Letivos_Turma_Mês');

  // Tab 6: Resumo das 40 Turmas (Ano 2027)
  const rowsTurmas = classes.map((c) => {
    const cm = getClassAttendanceMetrics(c, calendar);
    const percentFaltasTurma =
      cm.totalDiasMatriculadosTurma > 0
        ? Math.round((cm.totalFaltasTurma / cm.totalDiasMatriculadosTurma) * 100)
        : 0;
    const percentAtestadosTurma =
      cm.totalFaltasTurma > 0
        ? Math.round((cm.totalAtestadosTurma / cm.totalFaltasTurma) * 100)
        : 0;

    return {
      'Segmento': isEducacaoInfantilClass(c) ? 'EDUCAÇÃO INFANTIL' : 'ENSINO FUNDAMENTAL',
      'Turma': c.name,
      'Turno': c.shift,
      'Etapa / Ano': c.grade,
      'Sala': c.room,
      'Total de Estudantes': c.totalStudents,
      'Dias Letivos do Mês': cm.diasLetivosMes,
      'Soma Dias Letivos (Recorte Matrículas)': cm.totalDiasMatriculadosTurma,
      'Qtd Presenças Acumuladas': cm.totalPresencasTurma,
      '% Presença Média (Recorte)': `${cm.presenceRate}%`,
      'Qtd Faltas Acumuladas': cm.totalFaltasTurma,
      '% Faltas da Turma': `${percentFaltasTurma}%`,
      'Qtd Atestados Apresentados': cm.totalAtestadosTurma,
      '% Atestados sobre Faltas': `${percentAtestadosTurma}%`,
      'Status Fechamento': c.isPending ? 'Pendente' : 'Concluído',
    };
  });
  const wsTurmas = XLSX.utils.json_to_sheet(rowsTurmas);
  XLSX.utils.book_append_sheet(wb, wsTurmas, 'Turmas_Salas_2027');

  // ABA 6: USUÁRIOS CADASTRADOS (@educacao.jundiai.sp.gov.br)
  const authorizedUsers = getStoredAuthorizedUsers();
  const rowsUsuarios = authorizedUsers.map((u, idx) => ({
    'Nº': idx + 1,
    'E-MAIL INSTITUCIONAL (@educacao.jundiai.sp.gov.br)': u.email,
    'NOME DO SERVIDOR / DOCENTE': u.name,
    'NÍVEL DE ACESSO CONCEDIDO':
      u.role === 'admin'
        ? 'ADMIN (Acesso Pleno)'
        : u.role === 'usuario'
        ? 'PROFESSOR PEB I (Acesso Limitado à Turma)'
        : 'PROFESSOR PEB II (Somente Visualização)',
    'TURMA VINCULADA': u.assignedClassName,
    'STATUS DO ACESSO': u.active ? 'ATIVO / LIBERADO' : 'BLOQUEADO / SUSPENSO',
    'DATA DE CADASTRO': u.createdAt,
  }));
  const wsUsuarios = XLSX.utils.json_to_sheet(rowsUsuarios);
  XLSX.utils.book_append_sheet(wb, wsUsuarios, 'Usuarios_Autorizados_2027');

  // Generate binary and trigger download
  XLSX.writeFile(wb, 'Planilha_Oficial_SED_EMEB_Candelario_Freitas_2027.xlsx');
};

// Generate and trigger download of CSV for a specific class with exact SED columns & enrollment window metrics
export const downloadClassCSV = (cls: ClassGroup): void => {
  const diasLetivosMes = cls.classesHeld || 20;
  const headers = [
    'TIPO DE ENSINO', 'SÉRIE', 'Nº CHAMADA', 'ESTUDANTE', 'RA', 'DIG. RA', 'UF RA',
    'DATA DE NASCIMENTO', 'SITUAÇÃO', 'DATA DE MATRÍCULA (SED)', 'DATA MOVIMENTAÇÃO',
    'DEFICIÊNCIA', 'TURMA', 'PERÍODO', 'IDADE',
    'FILIAÇÃO 1', 'FILIAÇÃO 2', 'CPF', 'TELEFONES', 'EMAIL MUNICIPAL',
    'DIAS_LETIVOS_MES', 'DIAS_NO_RECORTE_MATRICULA',
    'QTD_FALTAS_NO_MES', 'PERCENTUAL_FALTAS', 'QTD_ATESTADOS_APRESENTADOS', 'PERCENTUAL_ATESTADOS', 'QTD_PRESENCAS_NO_PERIODO', 'FREQUENCIA_PERCENTUAL'
  ].join(',') + '\n';

  const rows = cls.students
    .map((s) => {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      const pctFaltas =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
          : 0;
      const pctAtestados =
        m.faltas > 0 ? Math.round((m.atestados / m.faltas) * 100) : 0;

      return [
        `"${s.tipoEnsino || 'EDUCACAO'}"`,
        `"${s.serie || '1'}"`,
        s.number,
        `"${s.name}"`,
        `"${s.ra || ''}"`,
        `"${s.digRa || ''}"`,
        `"${s.ufRa || 'SP'}"`,
        `"${s.dataNascimento || ''}"`,
        `"${s.situacao || 'ATIVO'}"`,
        `"${s.dataMatriculaSed || '03/02/2027'}"`,
        `"${s.dataMovimentacao || ''}"`,
        `"${s.deficiencia || ''}"`,
        `"${cls.name}"`,
        `"${cls.shift === 'Turno Manhã' ? 'MANHÃ' : 'TARDE'}"`,
        `"${s.idade || ''}"`,
        `"${s.filiacao1 || s.guardianName || ''}"`,
        `"${s.filiacao2 || ''}"`,
        `"${s.cpf || ''}"`,
        `"${s.telefones || s.guardianPhone || ''}"`,
        `"${s.emailMunicipal || ''}"`,
        m.diasLetivosMes,
        m.diasLetivosMatriculados,
        m.faltas,
        `"${pctFaltas}%"`,
        m.atestados,
        `"${pctAtestados}%"`,
        m.presencas,
        `"${m.frequenciaPercent}%"`
      ].join(',');
    })
    .join('\n');

  const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `SED_Frequencia_${cls.name}_2027.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
