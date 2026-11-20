import {
  AuthorizedUser,
  ClassGroup,
  SchoolDay,
  Student,
  UserAccessSessionLog,
} from '../types';
import { MONTHLY_SCHOOL_DAYS_2027, OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import {
  getClassAttendanceMetrics,
  getStudentAttendanceMetrics,
  getStudentBimesterReport,
  OFFICIAL_BIMESTERS_2027,
} from '../utils/attendanceRules';
import {
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
  resolveStudentGender,
} from '../utils/genderDictionary';
import {
  formatAccessExpirationDateBR,
  formatDurationHuman,
  isUserAccessExpired,
} from './authSessionService';

const USERS_STORAGE_KEY_REF = 'emeb_candelario_authorized_users_2027_v4';
const ACCESS_LOGS_STORAGE_KEY_REF = 'emeb_candelario_access_session_logs_2027_v1';

const readAuthorizedUsersFallback = (): AuthorizedUser[] => {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY_REF);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
};

const readSessionLogsFallback = (): UserAccessSessionLog[] => {
  try {
    const raw = localStorage.getItem(ACCESS_LOGS_STORAGE_KEY_REF);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
};

export const exportOfficialMatrixToXLS = async (
  classes: ClassGroup[],
  authorizedUsers: AuthorizedUser[]
): Promise<void> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const matrixRows = classes.map((cls) => {
    const activeCount = cls.students.filter((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      return (
        !sit.includes('BXTR') &&
        !sit.includes('TRANSF') &&
        !sit.includes('REMAN') &&
        !sit.includes('RM')
      );
    }).length;
    const transfCount = cls.students.filter((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      return sit.includes('BXTR') || sit.includes('TRANSF');
    }).length;
    const remanCount = cls.students.filter((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      return sit.includes('REMAN') || sit.includes('RM');
    }).length;
    const regenteUser = authorizedUsers.find(
      (u) =>
        u.role === 'usuario' &&
        ((u.assignedClassIds && u.assignedClassIds.includes(cls.id)) ||
          u.assignedClassId === cls.id)
    );
    const periodo = cls.shift.toUpperCase().includes('TARDE') ? 'TARDE' : 'MANHÃ';

    return {
      'TURMA ABREV': cls.turmaAbrev || cls.id.toUpperCase(),
      'PROFESSOR(A)': regenteUser?.name || cls.teacherName || '',
      'E-MAIL INSTITUCIONAL REGENTE': regenteUser?.email || cls.teacherEmail || '',
      'TURMA': cls.name,
      'SALA DE AULA': cls.room,
      'PERÍODO': periodo,
      'TURMA SED': cls.sedClassName || '',
      'QTD SED': cls.sedExpectedStudents ?? cls.students.length,
      'QTD ATIVOS REAIS': activeCount,
      'TRANSFERIDOS (BXTR)': transfCount,
      'REMANEJADOS': remanCount,
      'CLASSE SED': cls.classeSedCode || '',
      'PRONOME TRAT': regenteUser?.pronoun || cls.pronoun || 'PROFESSORA',
      'PRINOME': regenteUser?.firstName || cls.teacherFirstName || '',
      'ARTE': cls.artTeacher || '',
      'E-MAIL ARTE': cls.artTeacherEmail || '',
      'EDUCAÇÃO FÍSICA': cls.peTeacher || '',
      'E-MAIL EDUCAÇÃO FÍSICA': cls.peTeacherEmail || '',
      'LÍNGUA INGLESA': cls.englishTeacher || '',
      'E-MAIL LÍNGUA INGLESA': cls.englishTeacherEmail || '',
    };
  });

  const wsMatrix = XLSX.utils.json_to_sheet(matrixRows);
  wsMatrix['!cols'] = [
    { wch: 13 },
    { wch: 36 },
    { wch: 40 },
    { wch: 15 },
    { wch: 20 },
    { wch: 11 },
    { wch: 36 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 15 },
    { wch: 18 },
    { wch: 30 },
    { wch: 38 },
    { wch: 40 },
    { wch: 38 },
    { wch: 30 },
    { wch: 38 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'QUADRO TURMAS E PROFESSORES');

  const accessRows = authorizedUsers.map((u, idx) => ({
    'ORDEM': idx + 1,
    'NOME DO(A) SERVIDOR(A)': u.name,
    'PRONOME': u.pronoun || '',
    'PRINOME': u.firstName || '',
    'E-MAIL INSTITUCIONAL': u.email,
    'PERFIL / FUNÇÃO':
      u.role === 'admin'
        ? 'ADMINISTRADOR (Acesso Pleno)'
        : u.role === 'usuario'
        ? 'PROFESSOR(A) REGENTE PEB I'
        : `ESPECIALISTA PEB II (${u.subjectName || 'Arte / Ed. Física / Inglês'})`,
    'TURMAS VINCULADAS':
      u.assignedClassNames && u.assignedClassNames.length > 0
        ? u.assignedClassNames.join(' + ')
        : u.assignedClassName,
    'STATUS': isUserAccessExpired(u)
      ? 'EXPIRADO'
      : u.active
      ? 'ATIVO'
      : 'BLOQUEADO',
    'VALIDADE DO ACESSO': u.accessExpiresAt
      ? formatAccessExpirationDateBR(u.accessExpiresAt)
      : 'Permanente',
    'ACESSOS TOTAIS': u.totalAccessCount || 0,
    'TEMPO CONECTADO': formatDurationHuman(u.totalDurationSeconds || 0),
    'ÚLTIMO ACESSO': u.lastLoginAt || 'Ainda não acessou',
  }));
  const wsAccess = XLSX.utils.json_to_sheet(accessRows);
  wsAccess['!cols'] = [
    { wch: 8 },
    { wch: 38 },
    { wch: 14 },
    { wch: 18 },
    { wch: 42 },
    { wch: 38 },
    { wch: 48 },
    { wch: 12 },
    { wch: 15 },
    { wch: 18 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAccess, 'ACESSOS E EMAILS');

  XLSX.writeFile(wb, 'Quadro_Oficial_Turmas_Professores_Acessos_EMEB_Candelario_2027.xls', {
    bookType: 'biff8',
  });
};

const isEducacaoInfantilClass = (cls: ClassGroup): boolean => {
  return (
    cls.name.toUpperCase().startsWith('GRUPO') ||
    cls.grade.toUpperCase().includes('INFANTIL')
  );
};

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
        'FILIAÇÃO 1 (NOME DA MÃE)': s.filiacao1 || s.guardianName || '',
        'FILIAÇÃO 2 (NOME DO PAI)': s.filiacao2 || '',
        'TELEFONE DE CONTATO': s.telefones || s.guardianPhone || '',
        'E-MAIL INSTITUCIONAL': s.emailMunicipal || '',
      });
    });
  });

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
      'FILIAÇÃO 1 (NOME DA MÃE)': '—',
      'FILIAÇÃO 2 (NOME DO PAI)': '—',
      'TELEFONE DE CONTATO': '—',
      'E-MAIL INSTITUCIONAL': '—',
    });
  }

  return rows;
};

export const downloadSpreadsheetXLSX = async (
  classes: ClassGroup[],
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS,
  authorizedUsersOverride?: AuthorizedUser[],
  sessionLogsOverride?: UserAccessSessionLog[]
): Promise<void> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const rowsNominalInfantil = buildNominalAttendanceRowsForStage(
    classes,
    'EDUCACAO INFANTIL',
    calendar
  );
  const wsInfantil = XLSX.utils.json_to_sheet(rowsNominalInfantil);
  XLSX.utils.book_append_sheet(wb, wsInfantil, 'Faltas_Atestados_Infantil');

  const rowsNominalFundamental = buildNominalAttendanceRowsForStage(
    classes,
    'ENSINO FUNDAMENTAL',
    calendar
  );
  const wsFundamental = XLSX.utils.json_to_sheet(rowsNominalFundamental);
  XLSX.utils.book_append_sheet(wb, wsFundamental, 'Faltas_Atestados_Fundamental');

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
        'TIPO DE ENSINO':
          s.tipoEnsino ||
          (cls.name.startsWith('GRUPO') ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL'),
        'SÉRIE':
          s.serie || (cls.name.includes('04') ? '1' : cls.name.includes('05') ? '2' : cls.name[0]),
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
        'SUCESSÃO ESCOLAR': s.sucessaoEscolar || '',
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
        'LINK FOTO GOOGLE DRIVE': s.photoDriveUrl || '',
        'ID FOTO DRIVE': s.photoDriveId || '',
        'VÍNCULO FOTO': s.photoManualLink ? 'MANUAL' : 'AUTO',
        'ID FICHA PDF DRIVE': s.fichaPdfDriveId || '',
        'LINK FICHA PDF DRIVE': s.fichaPdfDriveUrl || '',
        'SUBPASTA FICHA PDF': s.fichaPdfSubfolder || '',
        'ATESTADO / ANOTAÇÕES': s.notes || '',
      });
    });
  });

  const wsSed = XLSX.utils.json_to_sheet(rowsSedFrequencia);
  XLSX.utils.book_append_sheet(wb, wsSed, 'SED_Matrículas_e_Frequência');

  const rowsBuscaAtiva: any[] = [];
  classes.forEach((cls) => {
    const periodo = cls.shift.replace('Turno ', '').toUpperCase();
    cls.students.forEach((s) => {
      const alert = s.consecutiveAbsenceAlert;
      if (!alert) return;
      const occurrences =
        alert.occurrences && alert.occurrences.length > 0
          ? alert.occurrences
          : alert.active || (alert.selectedDates && alert.selectedDates.length > 0) || alert.familyFeedback
          ? [
              {
                id: `${s.id}_occ_1`,
                sequenceNumber: 1,
                selectedDates: alert.selectedDates || [],
                reportedAt: alert.reportedAt || '',
                reportedByTeacher: alert.reportedByTeacher || cls.teacherName || 'PEB I',
                familyFeedback: alert.familyFeedback || '',
                feedbackUpdatedAt: alert.feedbackUpdatedAt || '',
              },
            ]
          : [];
      occurrences.forEach((occ, idx) => {
        const datesList = occ.selectedDates || [];
        if (datesList.length === 0 && !occ.familyFeedback) return;
        rowsBuscaAtiva.push({
          'TURMA': cls.name,
          'PERÍODO': periodo,
          'PROFESSOR(A) PEB I': occ.reportedByTeacher || cls.teacherName || 'PEB I',
          'Nº CHAMADA': s.number,
          'ESTUDANTE': s.name,
          'RA': s.ra ? `${s.ra}-${s.digRa || ''}` : '',
          'DIAS DE FALTA CONSECUTIVA': datesList.join(', '),
          'QTD DIAS SEGUIDOS': datesList.length,
          'DATA DO AVISO': occ.reportedAt || '',
          'RESPONSÁVEL': s.filiacao1 || s.guardianName || '',
          'TELEFONE / WHATSAPP': s.telefones || s.guardianPhone || '',
          'DEVOLUTIVA DA SECRETARIA / FAMÍLIA': occ.familyFeedback || '',
          'DATA DA DEVOLUTIVA': occ.feedbackUpdatedAt || '',
          'SEQUÊNCIA NO ANO': `${occ.sequenceNumber || idx + 1}ª Ocorrência`,
        });
      });
    });
  });
  if (rowsBuscaAtiva.length > 0) {
    const wsBusca = XLSX.utils.json_to_sheet(rowsBuscaAtiva);
    XLSX.utils.book_append_sheet(wb, wsBusca, 'Busca_Ativa_Consecutivas');
  }

  const bimesters = OFFICIAL_BIMESTERS_2027.filter((b) => b.id !== 'anual');
  const allEntries: Array<{ cls: ClassGroup; student: Student }> = [];
  classes.forEach((cls) =>
    cls.students.forEach((student) => allEntries.push({ cls, student }))
  );
  allEntries.sort((a, b) =>
    a.student.name.localeCompare(b.student.name, 'pt-BR', { sensitivity: 'base' })
  );
  const rowsBolsaBimestral = allEntries.map(({ cls, student }) => {
    const annualRep = getStudentBimesterReport(student, cls, 'anual');
    const rowObj: Record<string, any> = {
      'SEGMENTO': annualRep.isEducacaoInfantil ? 'EDUCAÇÃO INFANTIL' : 'ENSINO FUNDAMENTAL',
      'TURMA': cls.name,
      'PERÍODO': annualRep.shift,
      'Nº CHAMADA': student.number,
      'ESTUDANTE': student.name,
      'NIS (BOLSA FAMÍLIA)': student.nis || '—',
      'RA OFICIAL': student.ra ? `${student.ra}-${student.digRa || ''}` : '',
      'META MÍNIMA LDB': `${annualRep.minLegalPresencePercent}%`,
    };
    bimesters.forEach((b) => {
      const rep = getStudentBimesterReport(student, cls, b.id);
      rowObj[b.shortLabel] = `${rep.frequenciaBimestrePercent}%`;
    });
    rowObj['TOTAL FALTAS ANO'] = annualRep.totalFaltasBimestre;
    rowObj['TOTAL ATESTADOS ANO'] = annualRep.totalAtestadosBimestre;
    rowObj['POSSUI ATESTADO?'] =
      annualRep.totalAtestadosBimestre > 0
        ? `SIM (${annualRep.totalAtestadosBimestre})`
        : 'NÃO';
    rowObj['% PRESENÇA CONSOLIDADA'] = `${annualRep.frequenciaBimestrePercent}%`;
    rowObj['STATUS META'] = annualRep.isBelowLegalThresholdBimestre
      ? `ABAIXO DA META (<${annualRep.minLegalPresencePercent}%)`
      : `DENTRO DA META (≥${annualRep.minLegalPresencePercent}%)`;
    rowObj['PROVIDÊNCIA MEC'] = annualRep.bolsaFamiliaMotivoPadrao;
    return rowObj;
  });
  const wsBolsaBim = XLSX.utils.json_to_sheet(rowsBolsaBimestral);
  XLSX.utils.book_append_sheet(wb, wsBolsaBim, 'Bolsa_Familia_Bimestral');

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

  const authorizedUsers = authorizedUsersOverride || readAuthorizedUsersFallback();
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
    'STATUS DO ACESSO': isUserAccessExpired(u)
      ? 'EXPIRADO (REVOGADO)'
      : u.active
      ? 'ATIVO / LIBERADO'
      : 'BLOQUEADO / SUSPENSO',
    'VALIDADE DO ACESSO': u.accessExpiresAt
      ? formatAccessExpirationDateBR(u.accessExpiresAt)
      : 'Permanente',
    'DATA DE CADASTRO': u.createdAt,
    'TOTAL DE ACESSOS': u.totalAccessCount || 0,
    'TEMPO TOTAL CONECTADO': formatDurationHuman(u.totalDurationSeconds),
    'TEMPO ÚLTIMA SESSÃO': formatDurationHuman(u.lastSessionDurationSeconds),
    'ÚLTIMO LOGIN': u.lastLoginAt || 'Nunca acessou',
    'ÚLTIMA ATIVIDADE': u.lastActiveAt || '—',
  }));
  const wsUsuarios = XLSX.utils.json_to_sheet(rowsUsuarios);
  XLSX.utils.book_append_sheet(wb, wsUsuarios, 'Usuarios_Autorizados_2027');

  const sessionLogs = sessionLogsOverride || readSessionLogsFallback();
  const rowsLogs = sessionLogs.map((log, idx) => ({
    'Nº SESSÃO': idx + 1,
    'E-MAIL INSTITUCIONAL': log.email,
    'NOME DO EDUCADOR / SERVIDOR': log.name,
    'PERFIL':
      log.role === 'admin'
        ? 'ADMIN'
        : log.role === 'usuario'
        ? 'PEB I'
        : 'PEB II',
    'TURMA VINCULADA': log.assignedClassName,
    'ENTRADA (DATA / HORA)': new Date(log.loginTimeISO).toLocaleString('pt-BR'),
    'ÚLTIMO PULSO / SAÍDA': new Date(
      log.logoutTimeISO || log.lastHeartbeatISO
    ).toLocaleString('pt-BR'),
    'TEMPO DE ACESSO (FORMATADO)': formatDurationHuman(log.durationSeconds),
    'TEMPO DE ACESSO (SEGUNDOS)': log.durationSeconds,
    'TELA VISITADA': log.lastScreen || 'Turmas',
    'STATUS SESSÃO': log.logoutTimeISO ? 'Encerrada' : 'Ativa / Recente',
  }));
  if (rowsLogs.length > 0) {
    const wsLogs = XLSX.utils.json_to_sheet(rowsLogs);
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Monitoramento_Acessos_2027');
  }

  XLSX.writeFile(wb, 'Base_Oficial_SED_EMEB_Candelario_Freitas_2027.xlsx');
};

export type ClassExportCategory =
  | 'Identificação & Matrícula'
  | 'Filiação (Mãe e Pai) & Contatos'
  | 'Frequência, Presença & Faltas'
  | 'Documentos, Saúde & AEE'
  | 'Endereço'
  | 'Outros Campos SED';

export interface ClassExportColumnDef {
  id: string;
  label: string;
  shortLabel: string;
  category: ClassExportCategory;
  width?: number;
  getValue: (s: Student, cls: ClassGroup, calendar: SchoolDay[]) => string | number;
}

export const CLASS_EXPORT_COLUMNS: ClassExportColumnDef[] = [
  {
    id: 'numeroChamada',
    label: 'Nº CHAMADA',
    shortLabel: 'Nº Chamada',
    category: 'Identificação & Matrícula',
    width: 12,
    getValue: (s) => s.numeroChamada || s.number,
  },
  {
    id: 'estudante',
    label: 'ESTUDANTE',
    shortLabel: 'Nome do Estudante',
    category: 'Identificação & Matrícula',
    width: 34,
    getValue: (s) => s.estudante || s.name,
  },
  {
    id: 'raCompleto',
    label: 'RA COMPLETO',
    shortLabel: 'RA Completo (RA-Dig/UF)',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => (s.ra ? `${s.ra}-${s.digRa || ''}/${s.ufRa || 'SP'}` : ''),
  },
  {
    id: 'ra',
    label: 'RA',
    shortLabel: 'RA (Número)',
    category: 'Identificação & Matrícula',
    width: 15,
    getValue: (s) => s.ra || '',
  },
  {
    id: 'digRa',
    label: 'DIG. RA',
    shortLabel: 'Dígito RA',
    category: 'Identificação & Matrícula',
    width: 10,
    getValue: (s) => s.digRa || '',
  },
  {
    id: 'ufRa',
    label: 'UF RA',
    shortLabel: 'UF do RA',
    category: 'Identificação & Matrícula',
    width: 10,
    getValue: (s) => s.ufRa || 'SP',
  },
  {
    id: 'dataNascimento',
    label: 'DATA DE NASCIMENTO',
    shortLabel: 'Data de Nascimento',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => s.dataNascimento || '',
  },
  {
    id: 'idade',
    label: 'IDADE',
    shortLabel: 'Idade',
    category: 'Identificação & Matrícula',
    width: 10,
    getValue: (s) => s.idade || '',
  },
  {
    id: 'genero',
    label: 'GÊNERO',
    shortLabel: 'Gênero (Fem./Masc.)',
    category: 'Identificação & Matrícula',
    width: 14,
    getValue: (s) => getStudentGenderLabel(s).label.toUpperCase(),
  },
  {
    id: 'situacao',
    label: 'SITUAÇÃO',
    shortLabel: 'Situação (Ativo/Transf./Reman.)',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => s.situacao || 'ATIVO',
  },
  {
    id: 'dataMatriculaSed',
    label: 'DATA DE MATRÍCULA (SED)',
    shortLabel: 'Data Matrícula SED',
    category: 'Identificação & Matrícula',
    width: 20,
    getValue: (s) => s.dataMatriculaSed || '03/02/2027',
  },
  {
    id: 'dataMovimentacao',
    label: 'DATA MOVIMENTAÇÃO',
    shortLabel: 'Data Movimentação',
    category: 'Identificação & Matrícula',
    width: 18,
    getValue: (s) => s.dataMovimentacao || '',
  },
  {
    id: 'turma',
    label: 'TURMA',
    shortLabel: 'Turma',
    category: 'Identificação & Matrícula',
    width: 16,
    getValue: (s, cls) => s.turma || cls.name,
  },
  {
    id: 'periodo',
    label: 'PERÍODO',
    shortLabel: 'Período / Turno',
    category: 'Identificação & Matrícula',
    width: 14,
    getValue: (s, cls) => s.periodo || (cls.shift === 'Turno Manhã' ? 'MANHÃ' : 'TARDE'),
  },
  {
    id: 'serie',
    label: 'SÉRIE',
    shortLabel: 'Série / Etapa',
    category: 'Identificação & Matrícula',
    width: 14,
    getValue: (s, cls) =>
      s.serie || (cls.name.includes('04') ? '1' : cls.name.includes('05') ? '2' : cls.name[0]),
  },
  {
    id: 'tipoEnsino',
    label: 'TIPO DE ENSINO',
    shortLabel: 'Tipo de Ensino',
    category: 'Identificação & Matrícula',
    width: 22,
    getValue: (s, cls) =>
      s.tipoEnsino ||
      (cls.name.startsWith('GRUPO') ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL'),
  },
  {
    id: 'filiacao1',
    label: 'FILIAÇÃO 1',
    shortLabel: 'Filiação 1 (Mãe / Resp.)',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 34,
    getValue: (s) => {
      const raw = s.filiacao1 || s.guardianName || '';
      if (!raw) return '';
      const info = resolveGuardianRelationshipInfo(raw, 'filiacao1', s.notes);
      return `${info.cleanName} (${info.roleLabel})`;
    },
  },
  {
    id: 'filiacao2',
    label: 'FILIAÇÃO 2',
    shortLabel: 'Filiação 2 (Pai / Resp.)',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 34,
    getValue: (s) => {
      const raw = s.filiacao2 || '';
      if (!raw) return '';
      const info = resolveGuardianRelationshipInfo(raw, 'filiacao2', s.notes);
      return `${info.cleanName} (${info.roleLabel})`;
    },
  },
  {
    id: 'telefones',
    label: 'TELEFONES',
    shortLabel: 'Telefones de Contato',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 26,
    getValue: (s) => s.telefones || s.guardianPhone || '',
  },
  {
    id: 'emailMunicipal',
    label: 'EMAIL MUNICIPAL',
    shortLabel: 'E-mail Institucional (@educacao)',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 34,
    getValue: (s) => s.emailMunicipal || '',
  },
  {
    id: 'emailGoogle',
    label: 'E-MAIL GOOGLE',
    shortLabel: 'E-mail Google',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 30,
    getValue: (s) => s.emailGoogle || '',
  },
  {
    id: 'emailMicrosoft',
    label: 'E-MAIL MICROSOFT',
    shortLabel: 'E-mail Microsoft',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 30,
    getValue: (s) => s.emailMicrosoft || '',
  },
  {
    id: 'irmaos',
    label: 'IRMÃOS',
    shortLabel: 'Irmãos na Escola',
    category: 'Filiação (Mãe e Pai) & Contatos',
    width: 16,
    getValue: (s) => s.irmaos || '',
  },
  {
    id: 'presencasQtd',
    label: 'PRESENÇA TOTAL (DIAS)',
    shortLabel: 'Presença Total (Dias)',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).presencas,
  },
  {
    id: 'presencaPercent',
    label: '% PRESENÇA TOTAL',
    shortLabel: '% Presença Total',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) =>
      `${getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).frequenciaPercent}%`,
  },
  {
    id: 'faltasQtd',
    label: 'FALTA TOTAL (QTD)',
    shortLabel: 'Falta Total (Qtd)',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).faltas,
  },
  {
    id: 'faltasPercent',
    label: '% FALTA TOTAL',
    shortLabel: '% Falta Total',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      const pct =
        m.diasLetivosMatriculados > 0
          ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
          : 0;
      return `${pct}%`;
    },
  },
  {
    id: 'atestadosQtd',
    label: 'QTD ATESTADOS APRESENTADOS',
    shortLabel: 'Atestados (Qtd)',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).atestados,
  },
  {
    id: 'atestadosPercent',
    label: '% ATESTADOS SOBRE FALTAS',
    shortLabel: '% Atestados s/ Faltas',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      const pct = m.faltas > 0 ? Math.round((m.atestados / m.faltas) * 100) : 0;
      return `${pct}%`;
    },
  },
  {
    id: 'faltasSemAtestado',
    label: 'QTD FALTAS SEM ATESTADO',
    shortLabel: 'Faltas s/ Atestado',
    category: 'Frequência, Presença & Faltas',
    width: 18,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      return Math.max(0, m.faltas - m.atestados);
    },
  },
  {
    id: 'diasLetivosMes',
    label: 'DIAS LETIVOS DO MÊS',
    shortLabel: 'Dias Letivos Mês',
    category: 'Frequência, Presença & Faltas',
    width: 16,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).diasLetivosMes,
  },
  {
    id: 'diasLetivosRecorte',
    label: 'DIAS LETIVOS NO RECORTE DA MATRÍCULA',
    shortLabel: 'Dias no Recorte Matrícula',
    category: 'Frequência, Presença & Faltas',
    width: 20,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).diasLetivosMatriculados,
  },
  {
    id: 'detalheRecorte',
    label: 'DETALHE DO RECORTE',
    shortLabel: 'Detalhe do Recorte',
    category: 'Frequência, Presença & Faltas',
    width: 24,
    getValue: (s, cls, cal) =>
      getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal).recorteLabel,
  },
  {
    id: 'statusLegal',
    label: 'STATUS FREQUÊNCIA / BOLSA FAMÍLIA',
    shortLabel: 'Status Legal (<60% / <75%)',
    category: 'Frequência, Presença & Faltas',
    width: 24,
    getValue: (s, cls, cal) => {
      const m = getStudentAttendanceMetrics(s, cls.classesHeld || 20, cal);
      return m.isBelowLegalThreshold
        ? `ALERTA (<${m.minLegalPresencePercent}%)`
        : `REGULAR (>=${m.minLegalPresencePercent}%)`;
    },
  },
  {
    id: 'observacoes',
    label: 'ATESTADO / ANOTAÇÕES',
    shortLabel: 'Anotações & Atestados',
    category: 'Frequência, Presença & Faltas',
    width: 28,
    getValue: (s) => s.notes || '',
  },
  {
    id: 'cpf',
    label: 'CPF',
    shortLabel: 'CPF',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.cpf || '',
  },
  {
    id: 'rg',
    label: 'RG',
    shortLabel: 'RG',
    category: 'Documentos, Saúde & AEE',
    width: 15,
    getValue: (s) => s.rg || '',
  },
  {
    id: 'dataEmissaoRg',
    label: 'DATA EMISSÃO RG',
    shortLabel: 'Data Emissão RG',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.dataEmissaoRg || '',
  },
  {
    id: 'nis',
    label: 'NIS',
    shortLabel: 'NIS (Bolsa Família)',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.nis || '',
  },
  {
    id: 'cartaoSus',
    label: 'CARTÃO SUS',
    shortLabel: 'Cartão SUS',
    category: 'Documentos, Saúde & AEE',
    width: 20,
    getValue: (s) => s.cartaoSus || '',
  },
  {
    id: 'deficiencia',
    label: 'DEFICIÊNCIA',
    shortLabel: 'Deficiência / AEE',
    category: 'Documentos, Saúde & AEE',
    width: 24,
    getValue: (s) => s.deficiencia || '',
  },
  {
    id: 'tipoSanguineo',
    label: 'TIPO SANGUÍNEO',
    shortLabel: 'Tipo Sanguíneo',
    category: 'Documentos, Saúde & AEE',
    width: 14,
    getValue: (s) => s.tipoSanguineo || '',
  },
  {
    id: 'racaCor',
    label: 'RAÇA/COR',
    shortLabel: 'Raça / Cor',
    category: 'Documentos, Saúde & AEE',
    width: 14,
    getValue: (s) => s.racaCor || '',
  },
  {
    id: 'nomeSocial',
    label: 'NOME SOCIAL',
    shortLabel: 'Nome Social',
    category: 'Documentos, Saúde & AEE',
    width: 20,
    getValue: (s) => s.nomeSocial || '',
  },
  {
    id: 'nacionalidade',
    label: 'NACIONALIDADE',
    shortLabel: 'Nacionalidade',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.nacionalidade || 'BRASILEIRA',
  },
  {
    id: 'paisOrigem',
    label: 'PAÍS DE ORIGEM',
    shortLabel: 'País de Origem',
    category: 'Documentos, Saúde & AEE',
    width: 16,
    getValue: (s) => s.paisOrigem || 'BRASIL',
  },
  {
    id: 'municipioNascimento',
    label: 'MUNICÍPIO DE NASCIMENTO',
    shortLabel: 'Município de Nascimento',
    category: 'Documentos, Saúde & AEE',
    width: 22,
    getValue: (s) => s.municipioNascimento || 'JUNDIAI - SP',
  },
  {
    id: 'arquivo',
    label: 'ARQUIVO',
    shortLabel: 'Nº Arquivo / Pasta',
    category: 'Documentos, Saúde & AEE',
    width: 12,
    getValue: (s) => s.arquivo || '',
  },
  {
    id: 'cep',
    label: 'CEP',
    shortLabel: 'CEP',
    category: 'Endereço',
    width: 14,
    getValue: (s) => s.cep || '13.214-000',
  },
  {
    id: 'logradouro',
    label: 'LOGRADOURO',
    shortLabel: 'Logradouro (Rua/Av.)',
    category: 'Endereço',
    width: 28,
    getValue: (s) => s.logradouro || '',
  },
  {
    id: 'numeroResidencia',
    label: 'N. RESIDENCIA',
    shortLabel: 'Nº Residência',
    category: 'Endereço',
    width: 12,
    getValue: (s) => s.numeroResidencia || '',
  },
  {
    id: 'complemento',
    label: 'COMPLEMENTO',
    shortLabel: 'Complemento',
    category: 'Endereço',
    width: 18,
    getValue: (s) => s.complemento || '',
  },
  {
    id: 'bairro',
    label: 'BAIRRO',
    shortLabel: 'Bairro',
    category: 'Endereço',
    width: 20,
    getValue: (s) => s.bairro || '',
  },
  {
    id: 'cidade',
    label: 'CIDADE',
    shortLabel: 'Cidade',
    category: 'Endereço',
    width: 16,
    getValue: (s) => s.cidade || 'JUNDIAI',
  },
  {
    id: 'uf',
    label: 'UF',
    shortLabel: 'UF',
    category: 'Endereço',
    width: 8,
    getValue: (s) => s.uf || 'SP',
  },
  {
    id: 'tipoAlocacao',
    label: 'TIPO ALOCAÇÃO',
    shortLabel: 'Tipo Alocação',
    category: 'Outros Campos SED',
    width: 16,
    getValue: (s) => s.tipoAlocacao || '',
  },
  {
    id: 'categoriaProfissionalCenso',
    label: 'CATEGORIA PROFISSIONAL CENSO',
    shortLabel: 'Cat. Profissional Censo',
    category: 'Outros Campos SED',
    width: 22,
    getValue: (s) => s.categoriaProfissionalCenso || '',
  },
  {
    id: 'posDataCenso',
    label: 'PÓS DATA CENSO',
    shortLabel: 'Pós Data Censo',
    category: 'Outros Campos SED',
    width: 16,
    getValue: (s) => s.posDataCenso || '',
  },
  {
    id: 'procedenciaEscolar',
    label: 'PROCEDÊNCIA ESCOLAR',
    shortLabel: 'Procedência Escolar',
    category: 'Outros Campos SED',
    width: 24,
    getValue: (s) => s.procedenciaEscolar || '',
  },
  {
    id: 'sucessaoEscolar',
    label: 'SUCESSÃO ESCOLAR',
    shortLabel: 'Sucessão Escolar',
    category: 'Outros Campos SED',
    width: 20,
    getValue: (s) => s.sucessaoEscolar || '',
  },
];

export const DEFAULT_CLASS_EXPORT_COLUMN_IDS: string[] = [
  'numeroChamada',
  'estudante',
  'raCompleto',
  'situacao',
  'genero',
  'filiacao1',
  'filiacao2',
  'telefones',
  'emailMunicipal',
  'presencasQtd',
  'presencaPercent',
  'faltasQtd',
  'faltasPercent',
  'atestadosQtd',
  'observacoes',
];

export const CLASS_EXPORT_PRESETS: {
  id: string;
  label: string;
  description: string;
  columnIds: string[];
}[] = [
  {
    id: 'padrao_turma',
    label: 'Padrão da Turma (Completo & Limpo)',
    description:
      'Nº, Estudante, RA, Situação, Gênero, Filiação 1 (Mãe), Filiação 2 (Pai), Telefones, E-mail, Presença Total e Falta Total',
    columnIds: DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  },
  {
    id: 'frequencia_bolsa',
    label: 'Frequência, Faltas & Bolsa Família',
    description: 'Focado em presença, faltas, atestados, NIS e status legal (<60% / <75%)',
    columnIds: [
      'numeroChamada',
      'estudante',
      'raCompleto',
      'nis',
      'dataNascimento',
      'situacao',
      'diasLetivosRecorte',
      'presencasQtd',
      'presencaPercent',
      'faltasQtd',
      'faltasPercent',
      'atestadosQtd',
      'faltasSemAtestado',
      'statusLegal',
      'observacoes',
    ],
  },
  {
    id: 'filiacao_contatos',
    label: 'Filiação (Mãe e Pai) & Contatos',
    description:
      'Lista nominal com Nome da Mãe (Filiação 1), Nome do Pai (Filiação 2), Telefones, E-mail e Endereço',
    columnIds: [
      'numeroChamada',
      'estudante',
      'raCompleto',
      'dataNascimento',
      'filiacao1',
      'filiacao2',
      'telefones',
      'emailMunicipal',
      'logradouro',
      'numeroResidencia',
      'bairro',
      'cep',
    ],
  },
  {
    id: 'completo_sed',
    label: 'Base Oficial SED Completa (Todos os Campos)',
    description: 'Todas as 60 colunas oficiais da SED + indicadores de frequência e recorte',
    columnIds: CLASS_EXPORT_COLUMNS.map((c) => c.id),
  },
];

export type ClassExportSortOrder =
  | 'number_asc'
  | 'name_asc'
  | 'name_desc'
  | 'absences_desc'
  | 'presence_asc';

export type ClassExportStatusFilter = 'all' | 'ativos' | 'movimentados' | 'alerta';

export interface ClassCustomExportOptions {
  columnIds: string[];
  sortBy: ClassExportSortOrder;
  statusFilter: ClassExportStatusFilter;
  includeSummarySheet: boolean;
  fileFormat?: 'xls' | 'xlsx';
}

export const buildCustomClassExportPreview = (
  cls: ClassGroup,
  options: ClassCustomExportOptions,
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): {
  headers: string[];
  rows: Record<string, string | number>[];
  orderedStudents: Student[];
} => {
  const diasLetivosMes = cls.classesHeld || 20;
  const colDefs = options.columnIds
    .map((id) => CLASS_EXPORT_COLUMNS.find((c) => c.id === id))
    .filter((c): c is ClassExportColumnDef => Boolean(c));

  const finalCols =
    colDefs.length > 0
      ? colDefs
      : DEFAULT_CLASS_EXPORT_COLUMN_IDS.map((id) =>
          CLASS_EXPORT_COLUMNS.find((c) => c.id === id)!
        ).filter(Boolean);

  const filtered = cls.students.filter((s) => {
    const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
    const isMov =
      sit.includes('BXTR') ||
      sit.includes('TRANSF') ||
      sit.includes('REMAN') ||
      sit.includes('RM');
    if (options.statusFilter === 'ativos') return !isMov;
    if (options.statusFilter === 'movimentados') return isMov;
    if (options.statusFilter === 'alerta') {
      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      return m.isBelowLegalThreshold;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (options.sortBy === 'name_asc') {
      return a.name.localeCompare(b.name, 'pt-BR');
    }
    if (options.sortBy === 'name_desc') {
      return b.name.localeCompare(a.name, 'pt-BR');
    }
    if (options.sortBy === 'absences_desc') {
      const ma = getStudentAttendanceMetrics(a, diasLetivosMes, calendar);
      const mb = getStudentAttendanceMetrics(b, diasLetivosMes, calendar);
      if (mb.faltas !== ma.faltas) return mb.faltas - ma.faltas;
      return a.number - b.number;
    }
    if (options.sortBy === 'presence_asc') {
      const ma = getStudentAttendanceMetrics(a, diasLetivosMes, calendar);
      const mb = getStudentAttendanceMetrics(b, diasLetivosMes, calendar);
      if (ma.frequenciaPercent !== mb.frequenciaPercent) {
        return ma.frequenciaPercent - mb.frequenciaPercent;
      }
      return a.number - b.number;
    }
    return a.number - b.number;
  });

  const rows = sorted.map((s) => {
    const rowObj: Record<string, string | number> = {};
    finalCols.forEach((col) => {
      rowObj[col.label] = col.getValue(s, cls, calendar);
    });
    return rowObj;
  });

  return {
    headers: finalCols.map((c) => c.label),
    rows,
    orderedStudents: sorted,
  };
};

export const downloadClassCustomXLS = async (
  cls: ClassGroup,
  options: ClassCustomExportOptions,
  calendar: SchoolDay[] = OFFICIAL_OCTOBER_DAYS
): Promise<void> => {
  const XLSX = await import('xlsx');
  const { headers, rows } = buildCustomClassExportPreview(cls, options, calendar);
  const colDefs = options.columnIds
    .map((id) => CLASS_EXPORT_COLUMNS.find((c) => c.id === id))
    .filter((c): c is ClassExportColumnDef => Boolean(c));

  const wb = XLSX.utils.book_new();
  const wsTurma = XLSX.utils.json_to_sheet(rows, { header: headers });
  wsTurma['!cols'] = colDefs.map((c) => ({ wch: c.width || 20 }));

  const safeSheetName = `Turma_${cls.name.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, wsTurma, safeSheetName);

  if (options.includeSummarySheet) {
    const diasLetivosMes = cls.classesHeld || 20;
    let ativos = 0;
    let feminino = 0;
    let masculino = 0;
    let transferidos = 0;
    let remanejados = 0;
    let pcd = 0;
    let somaDias = 0;
    let somaPresencas = 0;
    let somaFaltas = 0;
    let somaAtestados = 0;

    cls.students.forEach((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const genCode = resolveStudentGender(s);
      if (sit.includes('BXTR') || sit.includes('TRANSF')) transferidos++;
      else if (sit.includes('REMAN') || sit.includes('RM')) remanejados++;
      else ativos++;

      if (genCode === 'F') feminino++;
      else masculino++;

      if (s.deficiencia && s.deficiencia.trim().length > 0) pcd++;

      const m = getStudentAttendanceMetrics(s, diasLetivosMes, calendar);
      somaDias += m.diasLetivosMatriculados;
      somaPresencas += m.presencas;
      somaFaltas += m.faltas;
      somaAtestados += m.atestados;
    });

    const pctPresenca = somaDias > 0 ? Math.round((somaPresencas / somaDias) * 100) : 100;
    const pctFalta = somaDias > 0 ? Math.round((somaFaltas / somaDias) * 100) : 0;

    const resumoRows = [
      { INDICADOR: 'TURMA', VALOR: cls.name, DETALHE: `${cls.grade} • ${cls.shift}` },
      { INDICADOR: 'SALA', VALOR: cls.room, DETALHE: `${diasLetivosMes} dias letivos no mês` },
      { INDICADOR: 'TOTAL MATRICULADOS', VALOR: cls.students.length, DETALHE: '100% da lista nominal' },
      { INDICADOR: 'ESTUDANTES ATIVOS', VALOR: ativos, DETALHE: 'Frequentes na turma' },
      {
        INDICADOR: 'FEMININO (MENINAS)',
        VALOR: feminino,
        DETALHE:
          cls.students.length > 0
            ? `${Math.round((feminino / cls.students.length) * 100)}% da turma`
            : '0%',
      },
      {
        INDICADOR: 'MASCULINO (MENINOS)',
        VALOR: masculino,
        DETALHE:
          cls.students.length > 0
            ? `${Math.round((masculino / cls.students.length) * 100)}% da turma`
            : '0%',
      },
      { INDICADOR: 'TRANSFERIDOS (BXTR)', VALOR: transferidos, DETALHE: 'Baixa por transferência' },
      { INDICADOR: 'REMANEJADOS', VALOR: remanejados, DETALHE: 'Movimentação entre turmas' },
      { INDICADOR: 'EDUCAÇÃO ESPECIAL / AEE', VALOR: pcd, DETALHE: 'Estudantes com laudo/AEE' },
      {
        INDICADOR: 'PRESENÇA TOTAL DA TURMA',
        VALOR: `${pctPresenca}%`,
        DETALHE: `${somaPresencas} presenças em ${somaDias} dias matriculados`,
      },
      {
        INDICADOR: 'FALTA TOTAL DA TURMA',
        VALOR: somaFaltas,
        DETALHE: `${pctFalta}% de ausências no período`,
      },
      {
        INDICADOR: 'ATESTADOS APRESENTADOS',
        VALOR: somaAtestados,
        DETALHE: 'Faltas justificadas por documento médico',
      },
    ];

    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    wsResumo['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Alta_Resumo_Turma');
  }

  const format = options.fileFormat || 'xls';
  const cleanFileName = `Relatorio_${cls.name.replace(/\s+/g, '_')}_2027.${format}`;

  if (format === 'xls') {
    XLSX.writeFile(wb, cleanFileName, { bookType: 'biff8' });
  } else {
    XLSX.writeFile(wb, cleanFileName, { bookType: 'xlsx' });
  }
};

export const downloadClassCSV = async (cls: ClassGroup): Promise<void> => {
  await downloadClassCustomXLS(cls, {
    columnIds: DEFAULT_CLASS_EXPORT_COLUMN_IDS,
    sortBy: 'number_asc',
    statusFilter: 'all',
    includeSummarySheet: true,
    fileFormat: 'xls',
  });
};
