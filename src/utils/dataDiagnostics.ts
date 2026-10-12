import { ClassGroup, Student, AuthorizedUser, SyncStateStatus } from '../types';
import { getStudentAttendanceMetrics } from './attendanceRules';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';
import { resolveGuardianRelationshipInfo } from './genderDictionary';

export type DiagnosticCategory =
  | 'cadastral_sed'
  | 'busca_ativa'
  | 'frequencia_legal'
  | 'sincronia_cloud'
  | 'docencia';

export type DiagnosticSeverity = 'critical' | 'warning' | 'info';

export interface DiagnosticIssue {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  categoryLabel: string;
  classId?: string;
  className?: string;
  studentId?: string;
  studentNumber?: number;
  studentName?: string;
  affectedField: string;
  currentValue: string;
  expectedValue: string;
  description: string;
  suggestedAction: string;
  firebaseStatus: 'synced' | 'pending' | 'alinhado';
}

export interface SchoolDiagnosticReport {
  generatedAtISO: string;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  byCategory: Record<DiagnosticCategory, DiagnosticIssue[]>;
  issues: DiagnosticIssue[];
  isFullyAligned: boolean;
  scorePercentage: number;
}

/**
 * Realiza diagnóstico profundo de inconsistências entre dados cadastrais SED,
 * lançamentos de frequência, Busca Ativa, perfil docente e sincronia com Firebase / Sheets.
 */
export function runSchoolDataDiagnostics(
  classes: ClassGroup[],
  authorizedUsers: AuthorizedUser[] = [],
  syncStatus?: { status?: SyncStateStatus; pendingCount?: number; lastError?: string | null }
): SchoolDiagnosticReport {
  const issues: DiagnosticIssue[] = [];

  // 1. Diagnóstico de Turmas e Docência
  classes.forEach((cls) => {
    if (!cls.teacherFirstName || cls.teacherFirstName.trim() === '—' || cls.teacherFirstName.trim() === '') {
      issues.push({
        id: `docencia_regente_${cls.id}`,
        severity: 'warning',
        category: 'docencia',
        categoryLabel: 'Docência e Turmas',
        classId: cls.id,
        className: cls.name,
        affectedField: 'Professor(a) Regente PEB I',
        currentValue: cls.teacherFirstName || 'Não informado',
        expectedValue: 'Nome do Docente Regente Cadastrado',
        description: `A turma ${cls.name} está sem professor regente PEB I atribuído.`,
        suggestedAction: 'Atribuir o docente regente na aba de Turmas ou no gerenciamento de acessos.',
        firebaseStatus: 'alinhado',
      });
    }

    const isFundamental =
      cls.grade.toUpperCase().includes('FUNDAMENTAL') ||
      cls.name.toUpperCase().includes('ANO');

    if (isFundamental && (!cls.englishTeacher || cls.englishTeacher.trim() === '—')) {
      issues.push({
        id: `docencia_ingles_${cls.id}`,
        severity: 'info',
        category: 'docencia',
        categoryLabel: 'Docência e Especialistas',
        classId: cls.id,
        className: cls.name,
        affectedField: 'Língua Inglesa (PEB II)',
        currentValue: cls.englishTeacher || '—',
        expectedValue: 'Docente Especialista de Inglês Atribuído',
        description: `A turma de Ensino Fundamental ${cls.name} não possui especialista de inglês identificado.`,
        suggestedAction: 'Informar o especialista de Língua Inglesa na aba Turmas.',
        firebaseStatus: 'alinhado',
      });
    }

    // 2. Diagnóstico Estudante por Estudante
    const diasLetivosMes = cls.classesHeld || 20;
    const isInfantil =
      cls.name.toUpperCase().startsWith('GRUPO') ||
      cls.grade.toUpperCase().includes('INFANTIL');
    const minPresencaLegal = isInfantil ? 60 : 75;

    (cls.students || []).forEach((st) => {
      const sit = (st.situacao || 'ATIVO').toUpperCase().trim();
      const isMovimentado =
        sit.includes('BXTR') ||
        sit.includes('TRANSF') ||
        sit.includes('REMAN') ||
        sit.includes('RM');

      // A) Cadastral SED: RA
      const raLimpo = (st.ra || '').replace(/\D/g, '');
      if (!isMovimentado && raLimpo.length < 5) {
        issues.push({
          id: `cadastral_ra_${cls.id}_${st.id}`,
          severity: 'critical',
          category: 'cadastral_sed',
          categoryLabel: 'Integridade Cadastral SED',
          classId: cls.id,
          className: cls.name,
          studentId: st.id,
          studentNumber: st.number,
          studentName: st.name,
          affectedField: 'Registro do Estudante (RA)',
          currentValue: st.ra || 'Vazio',
          expectedValue: 'Número de RA Oficial SED (mínimo 5 dígitos)',
          description: `Estudante Nº ${st.number} (${st.name}) está sem Registro do Estudante (RA) válido.`,
          suggestedAction: 'Consultar na SED e preencher o RA na Ficha Cadastral.',
          firebaseStatus: 'alinhado',
        });
      }

      // B) Cadastral SED: Data de Nascimento
      if (!isMovimentado && (!st.dataNascimento || !st.dataNascimento.includes('/'))) {
        issues.push({
          id: `cadastral_nasc_${cls.id}_${st.id}`,
          severity: 'critical',
          category: 'cadastral_sed',
          categoryLabel: 'Integridade Cadastral SED',
          classId: cls.id,
          className: cls.name,
          studentId: st.id,
          studentNumber: st.number,
          studentName: st.name,
          affectedField: 'Data de Nascimento',
          currentValue: st.dataNascimento || 'Vazio',
          expectedValue: 'Data no formato DD/MM/AAAA',
          description: `Estudante ${st.name} sem data de nascimento informada.`,
          suggestedAction: 'Completar data de nascimento no formulário SED.',
          firebaseStatus: 'alinhado',
        });
      }

      // C) Cadastral SED: Filiação e Responsável
      const guardianInfo = resolveGuardianRelationshipInfo(
        st.filiacao1 || st.guardianName,
        'filiacao1',
        st.notes
      );
      if (!isMovimentado && guardianInfo.cleanName === 'Não informado') {
        issues.push({
          id: `cadastral_filiacao_${cls.id}_${st.id}`,
          severity: 'warning',
          category: 'cadastral_sed',
          categoryLabel: 'Integridade Cadastral SED',
          classId: cls.id,
          className: cls.name,
          studentId: st.id,
          studentNumber: st.number,
          studentName: st.name,
          affectedField: 'Filiação 1 / Responsável Principal',
          currentValue: 'Não informado',
          expectedValue: 'Nome do Pai, Mãe ou Responsável Legal',
          description: `Estudante ${st.name} sem nome de responsável ou filiação primária.`,
          suggestedAction: 'Cadastrar o nome do responsável para garantir comunicação escolar.',
          firebaseStatus: 'alinhado',
        });
      }

      // D) Busca Ativa & Comunicação: Telefones
      const telDigits = (st.telefones || st.guardianPhone || '').replace(/\D/g, '');
      if (!isMovimentado && telDigits.length < 8) {
        issues.push({
          id: `comunicacao_tel_${cls.id}_${st.id}`,
          severity: 'critical',
          category: 'busca_ativa',
          categoryLabel: 'Busca Ativa & Comunicação',
          classId: cls.id,
          className: cls.name,
          studentId: st.id,
          studentNumber: st.number,
          studentName: st.name,
          affectedField: 'Telefones e WhatsApp da Família',
          currentValue: st.telefones || st.guardianPhone || 'Sem telefone',
          expectedValue: 'Número com DDD (celular ou fixo da família)',
          description: `Família do estudante ${st.name} está incontactável por falta de telefone cadastrado.`,
          suggestedAction: 'Solicitar número de WhatsApp/celular com a família ou na secretaria escolar.',
          firebaseStatus: 'alinhado',
        });
      }

      // E) Busca Ativa: Faltas Consecutivas sem Retorno da Família
      const occs = getStudentCumulativeOccurrences(st);
      const latestOcc = occs.length > 0 ? occs[occs.length - 1] : undefined;
      const consecStreak = Math.max(
        latestOcc?.selectedDates?.length || 0,
        st.consecutiveAbsenceAlert?.active
          ? Math.max(3, st.consecutiveAbsenceAlert?.selectedDates?.length || 0)
          : (st.totalAbsencesMonth || 0) >= 3 && (st.justifiedAbsences || 0) === 0
          ? st.totalAbsencesMonth || 0
          : 0
      );

      if (!isMovimentado && consecStreak >= 3) {
        const hasFeedback = Boolean(
          latestOcc?.familyFeedback?.trim() ||
            st.consecutiveAbsenceAlert?.familyFeedback?.trim()
        );
        if (!hasFeedback) {
          issues.push({
            id: `busca_ativa_feedback_${cls.id}_${st.id}`,
            severity: consecStreak >= 5 ? 'critical' : 'warning',
            category: 'busca_ativa',
            categoryLabel: 'Busca Ativa Escolar',
            classId: cls.id,
            className: cls.name,
            studentId: st.id,
            studentNumber: st.number,
            studentName: st.name,
            affectedField: 'Retorno da Família (Busca Ativa)',
            currentValue: 'Aguardando contato / Sem retorno',
            expectedValue: 'Justificativa registrada da família ou contato ativo',
            description: `Estudante ${st.name} acumula ${consecStreak} faltas seguidas sem justificativa da família registrada.`,
            suggestedAction: 'Realizar Contato de Busca Ativa e registrar retorno na aba Faltas Seguidas.',
            firebaseStatus: 'alinhado',
          });
        }
      }

      // F) Frequência Legal (Abaixo de 60% / 75%)
      if (!isMovimentado) {
        const metrics = getStudentAttendanceMetrics(st, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
        if (metrics.frequenciaPercent < minPresencaLegal && metrics.faltas > 0) {
          issues.push({
            id: `freq_legal_${cls.id}_${st.id}`,
            severity: 'critical',
            category: 'frequencia_legal',
            categoryLabel: 'Limiar Legal Obrigatório',
            classId: cls.id,
            className: cls.name,
            studentId: st.id,
            studentNumber: st.number,
            studentName: st.name,
            affectedField: 'Frequência do Mês',
            currentValue: `${metrics.frequenciaPercent}% (${metrics.faltas} faltas)`,
            expectedValue: `Mínimo de ${minPresencaLegal}% (${isInfantil ? 'Ed. Infantil' : 'Ens. Fundamental'})`,
            description: `Presença do estudante ${st.name} está em ${metrics.frequenciaPercent}%, abaixo do limite legal (${minPresencaLegal}%).`,
            suggestedAction: 'Conferir atestados médicos ou notificar coordenação pedagógica para acompanhamento.',
            firebaseStatus: 'alinhado',
          });
        }
      }
    });
  });

  // 3. Diagnóstico de Sincronia Cloud / Firebase
  if (syncStatus) {
    if (syncStatus.status === 'error' || syncStatus.lastError) {
      issues.push({
        id: 'sync_cloud_error',
        severity: 'critical',
        category: 'sincronia_cloud',
        categoryLabel: 'Sincronização Cloud & Firebase',
        affectedField: 'Fila de Sincronia Cloud',
        currentValue: `Status: ${syncStatus.status || 'Erro'}`,
        expectedValue: 'Sincronizado (synced)',
        description: `Há falha registrada na sincronização com Firebase: "${syncStatus.lastError || 'Conexão instável'}"`,
        suggestedAction: 'Verificar conexão e tocar em Sincronizar Tudo na tela da Planilha Google.',
        firebaseStatus: 'pending',
      });
    } else if (syncStatus.pendingCount && syncStatus.pendingCount > 0) {
      issues.push({
        id: 'sync_cloud_pending',
        severity: 'info',
        category: 'sincronia_cloud',
        categoryLabel: 'Sincronização Cloud & Firebase',
        affectedField: 'Operações Pendentes',
        currentValue: `${syncStatus.pendingCount} operação(ões) na fila`,
        expectedValue: '0 pendências',
        description: 'Existem atualizações locais aguardando envio para a nuvem.',
        suggestedAction: 'Aguardar processamento automático do heartbeat ou acionar sincronização imediata.',
        firebaseStatus: 'pending',
      });
    }
  }

  // 4. Diagnóstico de Usuários sem turmas
  authorizedUsers.forEach((u) => {
    if (u.active && u.role === 'usuario' && (!u.assignedClassId || u.assignedClassId === '')) {
      issues.push({
        id: `user_no_class_${u.id}`,
        severity: 'warning',
        category: 'docencia',
        categoryLabel: 'Docência e Acessos',
        affectedField: 'Turma Atribuída ao Docente',
        currentValue: 'Nenhuma turma vinculada',
        expectedValue: 'Código da Turma Atribuída (ex: G4A, 1A)',
        description: `O educador ${u.name} (${u.email}) está ativo sem turma atribuída.`,
        suggestedAction: 'Vincular a turma correspondente na tela de Acessos.',
        firebaseStatus: 'alinhado',
      });
    }
  });

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  const byCategory: Record<DiagnosticCategory, DiagnosticIssue[]> = {
    cadastral_sed: issues.filter((i) => i.category === 'cadastral_sed'),
    busca_ativa: issues.filter((i) => i.category === 'busca_ativa'),
    frequencia_legal: issues.filter((i) => i.category === 'frequencia_legal'),
    sincronia_cloud: issues.filter((i) => i.category === 'sincronia_cloud'),
    docencia: issues.filter((i) => i.category === 'docencia'),
  };

  const totalStudents = classes.reduce((sum, c) => sum + (c.students?.length || 0), 0);
  const penalty = criticalCount * 3 + warningCount * 1.5 + infoCount * 0.5;
  const scorePercentage = Math.max(
    0,
    Math.min(100, Math.round(100 - (penalty / Math.max(1, totalStudents)) * 100))
  );

  return {
    generatedAtISO: new Date().toISOString(),
    totalIssues: issues.length,
    criticalCount,
    warningCount,
    infoCount,
    byCategory,
    issues,
    isFullyAligned: criticalCount === 0 && warningCount === 0,
    scorePercentage,
  };
}

/**
 * Constrói as linhas no formato bidimensional (matriz) para preenchimento
 * da aba oficial `Diagnostico_Inconsistencias_2027` na Planilha Google Sheets.
 */
export function buildDiagnosticoInconsistenciasSheetValues(
  classes: ClassGroup[],
  authorizedUsers: AuthorizedUser[] = [],
  syncStatus?: any
): string[][] {
  const report = runSchoolDataDiagnostics(classes, authorizedUsers, syncStatus);

  const headers = [
    'ID_INCONSISTÊNCIA',
    'GRAVIDADE',
    'CATEGORIA',
    'TURMA',
    'Nº CHAMADA',
    'NOME_ESTUDANTE_OU_DOCENTE',
    'CAMPO_AFETADO',
    'VALOR_ATUAL_NO_SISTEMA',
    'VALOR_ESPERADO_REGULAMENTAR',
    'DIAGNÓSTICO_E_AÇÃO_CORRETIVA',
    'STATUS_SINCRONIA_FIREBASE',
    'HORA_DIAGNÓSTICO',
  ];

  const nowStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (report.issues.length === 0) {
    return [
      headers,
      [
        'DIAG_OK_001',
        'REGULAR (100% EM DIA)',
        'SINCRONIA_TOTAL',
        'TODAS AS TURMAS',
        '—',
        'SISTEMA_INTEGRADO_EMEB',
        'TODOS OS CAMPOS CADASTRAIS',
        'DADOS CONFORMES',
        'CONFORME PROTOCOLO SME',
        'Nenhuma inconsistência detectada. Dados do App, Firestore Firebase e Google Sheets operando em perfeita sincronia.',
        '100% SINCRONIZADO',
        nowStr,
      ],
    ];
  }

  const rows = report.issues.map((issue) => [
    issue.id,
    issue.severity === 'critical'
      ? 'CRÍTICA (AÇÃO IMEDIATA)'
      : issue.severity === 'warning'
      ? 'ALERTA (ATENÇÃO)'
      : 'INFORMATIVA',
    issue.categoryLabel,
    issue.className || 'EMEB Geral',
    issue.studentNumber ? String(issue.studentNumber) : '—',
    issue.studentName || '—',
    issue.affectedField,
    issue.currentValue,
    issue.expectedValue,
    `${issue.description} Recomendação: ${issue.suggestedAction}`,
    issue.firebaseStatus.toUpperCase(),
    nowStr,
  ]);

  return [headers, ...rows];
}
