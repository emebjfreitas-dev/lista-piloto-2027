import React, { useState, useMemo } from 'react';
import {
  AuthorizedUser,
  ClassGroup,
  ScreenType,
  UserRole,
} from '../types';
import {
  DiagnosticCategory,
  DiagnosticIssue,
  DiagnosticSeverity,
  runSchoolDataDiagnostics,
} from '../utils/dataDiagnostics';
import { SyncStatusSnapshot, saveClassesToFirestoreCloud } from '../services/firebaseSync';
import {
  addSecurityAuditLog,
  flushPendingOfflineQueue,
  pushClassesToServer,
  saveStoredClasses,
} from '../services/db';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  FileCode2,
  Info,
  Lock,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';

interface DiagnosticoBancoDadosScreenProps {
  classes: ClassGroup[];
  authorizedUsers: AuthorizedUser[];
  syncSnapshot: SyncStatusSnapshot;
  userRole: UserRole;
  userEmail: string;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  onUpdateClasses: (updatedClasses: ClassGroup[]) => void;
  onOpenClassDetails: (cls: ClassGroup) => void;
  onNavigateScreen: (screen: ScreenType) => void;
  onBack: () => void;
}

type CategoryFilter = 'all' | DiagnosticCategory | 'estrutural';
type SeverityFilter = 'all' | DiagnosticSeverity;

interface StructuralCheckIssue {
  id: string;
  severity: DiagnosticSeverity;
  category: 'estrutural';
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

type CombinedIssue = DiagnosticIssue | StructuralCheckIssue;

const INVALID_DISABILITY_PLACEHOLDERS = new Set([
  'NÃO',
  'NAO',
  'NÃO POSSUI',
  'NAO POSSUI',
  'NENHUM',
  'NENHUMA',
  'SEM DEFICIÊNCIA',
  'SEM DEFICIENCIA',
  '-',
  '--',
  '---',
  'N/A',
]);

export const DiagnosticoBancoDadosScreen: React.FC<DiagnosticoBancoDadosScreenProps> = ({
  classes,
  authorizedUsers,
  syncSnapshot,
  userRole,
  userEmail,
  teacherRoleType,
  onUpdateClasses,
  onOpenClassDetails,
  onNavigateScreen,
  onBack,
}) => {
  const isStrictAdmin =
    userRole === 'admin' && teacherRoleType !== 'apoio' && teacherRoleType !== 'aee';

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(40);
  const [lastAuditAt, setLastAuditAt] = useState<string>(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const baseReport = useMemo(
    () =>
      runSchoolDataDiagnostics(classes, authorizedUsers, {
        status: syncSnapshot.status,
        pendingCount: syncSnapshot.pendingCount,
        lastError: syncSnapshot.lastError,
      }),
    [classes, authorizedUsers, syncSnapshot.status, syncSnapshot.pendingCount, syncSnapshot.lastError]
  );

  // Verificações estruturais extras do banco de dados
  const structuralAnalysis = useMemo(() => {
    const extraIssues: StructuralCheckIssue[] = [];
    const raMap = new Map<string, Array<{ cls: ClassGroup; stName: string; stId: string; stNum: number }>>();
    const classIdSet = new Set<string>();

    let totalStudents = 0;
    let activeStudents = 0;
    let aeeCount = 0;
    let noisyAeeCount = 0;
    let duplicateRaCount = 0;
    let attendanceMismatchCount = 0;

    for (const cls of classes) {
      if (classIdSet.has(cls.id)) {
        extraIssues.push({
          id: `struct_dup_class_${cls.id}`,
          severity: 'critical',
          category: 'estrutural',
          categoryLabel: 'Integridade Estrutural BD',
          classId: cls.id,
          className: cls.name,
          affectedField: 'ID de Turma Duplicado',
          currentValue: cls.id,
          expectedValue: 'Identificador único por turma',
          description: `O identificador de turma "${cls.id}" aparece duplicado no banco.`,
          suggestedAction: 'Unificar ou restaurar a matriz oficial de turmas.',
          firebaseStatus: 'alinhado',
        });
      }
      classIdSet.add(cls.id);

      const diasLetivos = cls.classesHeld || 20;

      for (const st of cls.students || []) {
        totalStudents++;
        const sit = (st.situacao || 'ATIVO').toUpperCase().trim();
        const isMoved =
          sit.includes('BXTR') || sit.includes('TRANSF') || sit.includes('REMAN') || sit.includes('RM');
        if (!isMoved) activeStudents++;

        if (!st.id || !st.name?.trim()) {
          extraIssues.push({
            id: `struct_missing_identity_${cls.id}_${st.number}`,
            severity: 'critical',
            category: 'estrutural',
            categoryLabel: 'Integridade Estrutural BD',
            classId: cls.id,
            className: cls.name,
            studentId: st.id,
            studentNumber: st.number,
            studentName: st.name || 'Sem nome',
            affectedField: 'Identificação de Registro (ID/Nome)',
            currentValue: `ID: ${st.id || 'vazio'}`,
            expectedValue: 'ID e Nome válidos',
            description: `Registro de estudante nº ${st.number} na turma ${cls.name} sem ID ou nome completo.`,
            suggestedAction: 'Corrigir o registro cadastral na ficha da turma.',
            firebaseStatus: 'alinhado',
          });
        }

        // Checagem de RA duplicado entre alunos ativos
        const cleanRa = (st.ra || '').replace(/\D/g, '').replace(/^0+/, '');
        if (!isMoved && cleanRa.length >= 5) {
          const list = raMap.get(cleanRa) || [];
          list.push({ cls, stName: st.name, stId: st.id, stNum: st.number });
          raMap.set(cleanRa, list);
        }

        // Checagem de coerência de faltas mensais, histórico mensal e atestados
        const totalFaltas = st.totalAbsencesMonth || 0;
        const justified = st.justifiedAbsences || 0;
        const recorteLetivo = st.diasLetivosRecorte ?? diasLetivos;

        if (justified > totalFaltas) {
          attendanceMismatchCount++;
          extraIssues.push({
            id: `struct_just_${cls.id}_${st.id}`,
            severity: 'warning',
            category: 'estrutural',
            categoryLabel: 'Integridade Estrutural BD',
            classId: cls.id,
            className: cls.name,
            studentId: st.id,
            studentNumber: st.number,
            studentName: st.name,
            affectedField: 'Faltas Justificadas > Total de Faltas',
            currentValue: `${justified} atestado(s) / ${totalFaltas} falta(s)`,
            expectedValue: 'Justificadas ≤ Total de Faltas',
            description: `Estudante ${st.name} (${cls.name}) possui mais faltas justificadas (${justified}) que faltas no mês (${totalFaltas}).`,
            suggestedAction: 'Revisar lançamento na tela Faltas do Mês.',
            firebaseStatus: 'alinhado',
          });
        }

        if (totalFaltas > recorteLetivo) {
          attendanceMismatchCount++;
          extraIssues.push({
            id: `struct_days_overflow_${cls.id}_${st.id}`,
            severity: 'warning',
            category: 'estrutural',
            categoryLabel: 'Integridade Estrutural BD',
            classId: cls.id,
            className: cls.name,
            studentId: st.id,
            studentNumber: st.number,
            studentName: st.name,
            affectedField: 'Faltas Acima dos Dias Letivos',
            currentValue: `${totalFaltas} faltas / ${recorteLetivo} dias`,
            expectedValue: `≤ ${recorteLetivo} dias letivos`,
            description: `Total de faltas (${totalFaltas}) excede os dias letivos do recorte (${recorteLetivo}) em ${cls.name}.`,
            suggestedAction: 'Conferir total de dias letivos e marcações no diário mensal.',
            firebaseStatus: 'alinhado',
          });
        }

        if (st.monthlyAttendanceByMonth) {
          for (const [monthName, mEntry] of Object.entries(st.monthlyAttendanceByMonth)) {
            if (!mEntry) continue;
            if ((mEntry.atestados || 0) > (mEntry.faltas || 0) || (mEntry.faltas || 0) > (mEntry.diasLetivosRecorte || diasLetivos)) {
              attendanceMismatchCount++;
              extraIssues.push({
                id: `struct_month_hist_${cls.id}_${st.id}_${monthName}`,
                severity: 'info',
                category: 'estrutural',
                categoryLabel: 'Integridade Estrutural BD',
                classId: cls.id,
                className: cls.name,
                studentId: st.id,
                studentNumber: st.number,
                studentName: st.name,
                affectedField: `Coerência Mensal (${monthName})`,
                currentValue: `${mEntry.faltas}F / ${mEntry.atestados}A / ${mEntry.diasLetivosRecorte}DL`,
                expectedValue: 'Atestados ≤ Faltas ≤ Dias Letivos',
                description: `Registro histórico de ${monthName} de ${st.name} apresenta contagem inconsistente entre faltas, atestados e dias letivos.`,
                suggestedAction: 'Abrir o diário mensal da turma no referido mês e salvar novamente.',
                firebaseStatus: 'alinhado',
              });
            }
          }
        }

        // Checagem de campo Deficiência / AEE
        const rawDef = (st.deficiencia || '').trim();
        if (rawDef) {
          const upperDef = rawDef.toUpperCase();
          if (INVALID_DISABILITY_PLACEHOLDERS.has(upperDef)) {
            noisyAeeCount++;
            extraIssues.push({
              id: `struct_aee_noise_${cls.id}_${st.id}`,
              severity: 'info',
              category: 'estrutural',
              categoryLabel: 'Integridade Estrutural BD',
              classId: cls.id,
              className: cls.name,
              studentId: st.id,
              studentNumber: st.number,
              studentName: st.name,
              affectedField: 'Campo Deficiência / AEE com texto genérico',
              currentValue: `"${rawDef}"`,
              expectedValue: 'Vazio ou nome da deficiência/CID',
              description: `Estudante ${st.name} tem marcador genérico "${rawDef}" no campo AEE em vez de estar vazio.`,
              suggestedAction: 'Usar a limpeza automática ou subir o arquivo .htm oficial da SED.',
              firebaseStatus: 'alinhado',
            });
          } else {
            aeeCount++;
          }
        }
      }
    }

    raMap.forEach((occurrences, raDigits) => {
      if (occurrences.length > 1) {
        duplicateRaCount++;
        const first = occurrences[0];
        extraIssues.push({
          id: `struct_dup_ra_${raDigits}`,
          severity: 'critical',
          category: 'estrutural',
          categoryLabel: 'Integridade Estrutural BD',
          classId: first.cls.id,
          className: occurrences.map((o) => o.cls.name).join(' / '),
          studentId: first.stId,
          studentNumber: first.stNum,
          studentName: occurrences.map((o) => o.stName).join(' • '),
          affectedField: 'RA Duplicado em Estudantes Ativos',
          currentValue: `RA ${raDigits} (${occurrences.length}x)`,
          expectedValue: '1 registro ativo por RA',
          description: `O RA ${raDigits} aparece ativo em ${occurrences.length} turmas/registros: ${occurrences
            .map((o) => `${o.stName} (${o.cls.name})`)
            .join('; ')}.`,
          suggestedAction: 'Atualizar situação (BXTR/REMAN) no registro antigo.',
          firebaseStatus: 'alinhado',
        });
      }
    });

    return {
      extraIssues,
      totalStudents,
      activeStudents,
      aeeCount,
      noisyAeeCount,
      duplicateRaCount,
      attendanceMismatchCount,
    };
  }, [classes]);

  const allIssues: CombinedIssue[] = useMemo(() => {
    const severityOrder: Record<DiagnosticSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    return [...baseReport.issues, ...structuralAnalysis.extraIssues].sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  }, [baseReport.issues, structuralAnalysis.extraIssues]);

  const totalCritical = allIssues.filter((i) => i.severity === 'critical').length;
  const totalWarning = allIssues.filter((i) => i.severity === 'warning').length;
  const totalInfo = allIssues.filter((i) => i.severity === 'info').length;

  const filteredIssues = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allIssues.filter((issue) => {
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (categoryFilter !== 'all' && issue.category !== categoryFilter) return false;
      if (classFilter !== 'all' && issue.classId !== classFilter) return false;
      if (!q) return true;
      return (
        (issue.studentName || '').toLowerCase().includes(q) ||
        (issue.className || '').toLowerCase().includes(q) ||
        issue.affectedField.toLowerCase().includes(q) ||
        issue.description.toLowerCase().includes(q) ||
        issue.currentValue.toLowerCase().includes(q)
      );
    });
  }, [allIssues, severityFilter, categoryFilter, classFilter, searchTerm]);

  const visibleIssues = filteredIssues.slice(0, visibleLimit);

  const handleRerunCheck = () => {
    setLastAuditAt(
      new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    setFeedback({
      type: 'success',
      text: `Verificação concluída: ${allIssues.length} apontamento(s) analisado(s) em ${classes.length} turmas.`,
    });
  };

  const handleForceCloudSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await flushPendingOfflineQueue();
      await saveClassesToFirestoreCloud(classes, Date.now());
      setFeedback({
        type: 'success',
        text: 'Banco sincronizado com sucesso com a nuvem (Firebase Firestore).',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Falha ao sincronizar com a nuvem: ${err?.message || 'Erro de conexão'}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCleanNoisyAeeMarkers = async () => {
    const nowMs = Date.now();
    let cleanedCount = 0;
    const updated = classes.map((cls) => {
      let clsChanged = false;
      const nextStudents = cls.students.map((st) => {
        const rawDef = (st.deficiencia || '').trim();
        if (rawDef && INVALID_DISABILITY_PLACEHOLDERS.has(rawDef.toUpperCase())) {
          cleanedCount++;
          clsChanged = true;
          return { ...st, deficiencia: '', updatedAtMs: nowMs };
        }
        return st;
      });
      return clsChanged ? { ...cls, students: nextStudents, updatedAtMs: nowMs } : cls;
    });

    if (cleanedCount === 0) return;

    onUpdateClasses(updated);
    saveStoredClasses(updated);
    try {
      await saveClassesToFirestoreCloud(updated, nowMs);
      await pushClassesToServer(updated);
    } catch {
      // offline queue handles retry
    }
    addSecurityAuditLog({
      userEmail,
      userName: 'Administrador Escolar',
      userRole: 'admin',
      eventType: 'SYSTEM_CONFIG_UPDATED',
      actionTitle: 'Limpeza de marcadores genéricos AEE',
      details: `${cleanedCount} registro(s) com texto genérico ("NÃO"/"—") limpos no campo Deficiência.`,
      severity: 'info',
    });
    setFeedback({
      type: 'success',
      text: `${cleanedCount} marcador(es) genérico(s) limpo(s) e salvo(s) na base.`,
    });
  };

  const handleExportCsv = () => {
    const escapeCsv = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;
    const headers = [
      'Gravidade',
      'Categoria',
      'Turma',
      'Chamada',
      'Estudante',
      'Campo',
      'Valor Atual',
      'Valor Esperado',
      'Diagnostico',
      'Acao Sugerida',
    ];
    const rows = filteredIssues.map((i) => [
      i.severity.toUpperCase(),
      i.categoryLabel,
      i.className || 'Geral',
      i.studentNumber ? String(i.studentNumber) : '—',
      i.studentName || '—',
      i.affectedField,
      i.currentValue,
      i.expectedValue,
      i.description,
      i.suggestedAction,
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(escapeCsv).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostico-bd-candelario-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categoryCards: Array<{
    id: CategoryFilter;
    label: string;
    count: number;
  }> = [
    { id: 'all', label: 'Todos', count: allIssues.length },
    { id: 'estrutural', label: 'Integridade BD', count: structuralAnalysis.extraIssues.length },
    { id: 'cadastral_sed', label: 'Cadastro SED', count: baseReport.byCategory.cadastral_sed.length },
    { id: 'busca_ativa', label: 'Busca Ativa', count: baseReport.byCategory.busca_ativa.length },
    { id: 'frequencia_legal', label: 'Frequência Legal', count: baseReport.byCategory.frequencia_legal.length },
    { id: 'docencia', label: 'Docência', count: baseReport.byCategory.docencia.length },
    { id: 'sincronia_cloud', label: 'Nuvem Firebase', count: baseReport.byCategory.sincronia_cloud.length },
  ];

  if (!isStrictAdmin) {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 bg-white rounded-3xl shadow-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#fee2e2] text-[#991b1b] flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-semibold text-[#111827]">
          Acesso Exclusivo da Administração
        </h1>
        <p className="text-xs sm:text-sm text-[#48484a] leading-relaxed">
          O Diagnóstico de Consistência do Banco de Dados é restrito ao perfil Administrador e não fica disponível para docentes PEB I, PEB II ou AEE.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-5 rounded-2xl bg-[#111827] text-white text-xs sm:text-sm font-semibold cursor-pointer"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-[1600px] mx-auto space-y-4 pb-20 text-[#111827] animate-gentle-fade">
      {feedback && (
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-[#eaf6ef] text-[#005035]'
              : 'bg-[#fee2e2] text-[#991b1b]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="break-words">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cabeçalho Administrativo */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
          <div className="space-y-1 min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#48484a] hover:text-[#111827] cursor-pointer transition-colors duration-100"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-[#111827] break-words">
                Diagnóstico de Consistência do Banco
              </h1>
              <span className="px-2.5 py-0.5 rounded-lg bg-[#e9e9ef] text-[#111827] text-xs font-semibold">
                Exclusivo Admin
              </span>
            </div>

            <p className="text-xs sm:text-sm text-[#48484a] break-words leading-relaxed">
              Auditoria técnica de {classes.length} turmas, {structuralAnalysis.activeStudents} estudantes ativos ({structuralAnalysis.aeeCount} AEE) e sincronia Firebase · Atualizado às {lastAuditAt}
            </p>
          </div>

          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={handleRerunCheck}
              className="min-w-0 min-h-[44px] px-4 py-2 rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] text-xs sm:text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100 whitespace-normal text-center"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>Reverificar</span>
            </button>

            <button
              type="button"
              onClick={handleForceCloudSync}
              disabled={isSyncing}
              className="min-w-0 min-h-[44px] px-4 py-2 rounded-xl bg-[#eaf6ef] hover:bg-[#d5efe0] text-[#005035] text-xs sm:text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100 disabled:opacity-60 whitespace-normal text-center"
            >
              {isSyncing ? (
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4 shrink-0" />
              )}
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Nuvem'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateScreen('importar_deficiencias_htm')}
              className="min-w-0 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#e8f0fe] hover:bg-[#d6e4fc] text-[#1a4fa3] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100 whitespace-normal text-center"
            >
              <FileCode2 className="w-3.5 h-3.5 shrink-0" />
              <span>Subir .HTM (AEE)</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="min-w-0 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#111827] hover:bg-black text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100 whitespace-normal text-center"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* KPIs Estruturais e de Consistência */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#f2f2f7] min-w-0 break-words">
            <span className="text-xs font-medium text-[#48484a] block">Índice de Saúde</span>
            <span
              className={`text-2xl sm:text-3xl font-semibold tabular-nums block mt-0.5 ${
                baseReport.scorePercentage >= 90
                  ? 'text-[#047857]'
                  : baseReport.scorePercentage >= 70
                  ? 'text-[#b45309]'
                  : 'text-[#b3261e]'
              }`}
            >
              {baseReport.scorePercentage}%
            </span>
            <span className="text-xs text-[#48484a] block mt-0.5">Base SED + Diário</span>
          </div>

          <button
            type="button"
            onClick={() => setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical')}
            className={`text-left p-3.5 sm:p-4 rounded-2xl cursor-pointer transition-colors duration-100 min-w-0 break-words ${
              severityFilter === 'critical' ? 'bg-[#fee2e2]' : 'bg-[#f2f2f7] hover:bg-[#e9e9ef]'
            }`}
          >
            <span className="text-xs font-medium text-[#991b1b] block">Críticas</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#991b1b] tabular-nums block mt-0.5">
              {totalCritical}
            </span>
            <span className="text-xs text-[#48484a] block mt-0.5">Ação imediata</span>
          </button>

          <button
            type="button"
            onClick={() => setSeverityFilter(severityFilter === 'warning' ? 'all' : 'warning')}
            className={`text-left p-3.5 sm:p-4 rounded-2xl cursor-pointer transition-colors duration-100 min-w-0 break-words ${
              severityFilter === 'warning' ? 'bg-[#fef3c7]' : 'bg-[#f2f2f7] hover:bg-[#e9e9ef]'
            }`}
          >
            <span className="text-xs font-medium text-[#92400e] block">Alertas</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#92400e] tabular-nums block mt-0.5">
              {totalWarning}
            </span>
            <span className="text-xs text-[#48484a] block mt-0.5">Revisar cadastro</span>
          </button>

          <button
            type="button"
            onClick={() => setSeverityFilter(severityFilter === 'info' ? 'all' : 'info')}
            className={`text-left p-3.5 sm:p-4 rounded-2xl cursor-pointer transition-colors duration-100 min-w-0 break-words ${
              severityFilter === 'info' ? 'bg-[#e8f0fe]' : 'bg-[#f2f2f7] hover:bg-[#e9e9ef]'
            }`}
          >
            <span className="text-xs font-medium text-[#1a4fa3] block">Informativas</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#1a4fa3] tabular-nums block mt-0.5">
              {totalInfo}
            </span>
            <span className="text-xs text-[#48484a] block mt-0.5">Melhorias</span>
          </button>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#f2f2f7] min-w-0 break-words">
            <span className="text-xs font-medium text-[#48484a] block">RAs Duplicados</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#111827] tabular-nums block mt-0.5">
              {structuralAnalysis.duplicateRaCount}
            </span>
            <span className="text-xs text-[#48484a] block mt-0.5">
              {structuralAnalysis.attendanceMismatchCount} diverg. faltas
            </span>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#f2f2f7] min-w-0 break-words">
            <span className="text-xs font-medium text-[#48484a] block">Nuvem Firebase</span>
            <span className="text-base sm:text-lg font-semibold text-[#111827] block mt-1 break-words">
              {syncSnapshot.pendingCount > 0
                ? `${syncSnapshot.pendingCount} pendente(s)`
                : syncSnapshot.status === 'error'
                ? 'Atenção'
                : 'Sincronizado'}
            </span>
            <span className="text-xs text-[#48484a] block mt-0.5">
              {structuralAnalysis.aeeCount} alunos com AEE
            </span>
          </div>
        </div>

        {/* Ação Rápida de Limpeza se houver marcadores genéricos no campo AEE */}
        {structuralAnalysis.noisyAeeCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-[#fef3c7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 text-xs text-[#78350f]">
              <Wrench className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                Detectados <strong>{structuralAnalysis.noisyAeeCount}</strong> estudante(s) com texto genérico (ex: &ldquo;NÃO&rdquo;, &ldquo;—&rdquo;) no campo Deficiência/AEE.
              </span>
            </div>
            <button
              type="button"
              onClick={handleCleanNoisyAeeMarkers}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#92400e] hover:bg-[#78350f] text-white text-xs font-semibold shrink-0 cursor-pointer"
            >
              Limpar marcadores agora
            </button>
          </div>
        )}
      </section>

      {/* Filtros e Lista de Apontamentos */}
      <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
        {/* Categorias */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1 min-w-0">
          {categoryCards.map((cat) => {
            const active = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat.id);
                  setVisibleLimit(40);
                }}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 whitespace-normal text-center cursor-pointer transition-colors duration-100 ${
                  active
                    ? 'bg-[#111827] text-white font-semibold'
                    : 'bg-[#f2f2f7] text-[#374151] hover:bg-[#e9e9ef]'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-xs tabular-nums ${
                    active ? 'bg-white/15 text-white' : 'bg-white text-[#111827]'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Busca + Filtro por Turma */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#48484a] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setVisibleLimit(40);
              }}
              placeholder="Buscar por estudante, turma, campo afetado ou descrição..."
              className="w-full min-h-[46px] pl-10 pr-9 rounded-2xl bg-[#f2f2f7] focus:bg-[#e9e9ef] text-sm text-[#111827] placeholder:text-[#6b7280] focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#48484a] p-1 cursor-pointer"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setVisibleLimit(40);
            }}
            aria-label="Filtrar por turma"
            className="min-h-[42px] px-3.5 rounded-2xl bg-[#f2f2f7] text-xs font-semibold text-[#111827] cursor-pointer focus:outline-none"
          >
            <option value="all">Todas as turmas ({classes.length})</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name} ({cls.shift.replace('Turno ', '')})
              </option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as SeverityFilter);
              setVisibleLimit(40);
            }}
            aria-label="Filtrar por gravidade"
            className="min-h-[42px] px-3.5 rounded-2xl bg-[#f2f2f7] text-xs font-semibold text-[#111827] cursor-pointer focus:outline-none"
          >
            <option value="all">Todas gravidades</option>
            <option value="critical">Críticas ({totalCritical})</option>
            <option value="warning">Alertas ({totalWarning})</option>
            <option value="info">Informativas ({totalInfo})</option>
          </select>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="p-10 rounded-2xl bg-[#eaf6ef] text-center space-y-2">
            <Sparkles className="w-7 h-7 text-[#047857] mx-auto" />
            <p className="text-sm font-semibold text-[#005035]">
              Nenhuma inconsistência encontrada neste filtro
            </p>
            <p className="text-xs text-[#374151]">
              Todos os registros verificados para os critérios atuais estão consistentes.
            </p>
          </div>
        ) : (
          <>
            {/* Cards Mobile / Tablet */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:hidden">
              {visibleIssues.map((issue) => {
                const isCrit = issue.severity === 'critical';
                const isWarn = issue.severity === 'warning';
                const targetCls = issue.classId
                  ? classes.find((c) => c.id === issue.classId)
                  : undefined;

                return (
                  <article
                    key={issue.id}
                    className="p-4 rounded-2xl bg-[#f2f2f7] space-y-2.5 flex flex-col justify-between min-w-0 break-words"
                  >
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 shrink-0 ${
                            isCrit
                              ? 'bg-[#fee2e2] text-[#991b1b]'
                              : isWarn
                              ? 'bg-[#fef3c7] text-[#92400e]'
                              : 'bg-[#e8f0fe] text-[#1a4fa3]'
                          }`}
                        >
                          {isCrit ? (
                            <AlertCircle className="w-3.5 h-3.5" />
                          ) : isWarn ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : (
                            <Info className="w-3.5 h-3.5" />
                          )}
                          <span>{isCrit ? 'Crítica' : isWarn ? 'Alerta' : 'Info'}</span>
                        </span>
                        <span className="text-xs font-semibold text-[#374151] break-words text-right min-w-0">
                          {issue.categoryLabel}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[#111827] break-words">
                          {issue.affectedField}
                        </h3>
                        <p className="text-xs text-[#374151] mt-0.5 break-words">
                          {issue.className ? `${issue.className} · ` : ''}
                          {issue.studentName
                            ? `${issue.studentNumber ? `Nº ${issue.studentNumber} ` : ''}${issue.studentName}`
                            : 'Escopo Escolar'}
                        </p>
                      </div>

                      <div className="bg-white rounded-xl p-2.5 text-xs space-y-1 min-w-0 break-words">
                        <p className="text-[#991b1b] break-words">
                          <strong className="font-semibold">Atual:</strong> {issue.currentValue}
                        </p>
                        <p className="text-[#005035] break-words">
                          <strong className="font-semibold">Esperado:</strong> {issue.expectedValue}
                        </p>
                      </div>

                      <p className="text-xs text-[#374151] leading-relaxed break-words">
                        {issue.description}
                      </p>
                    </div>

                    {targetCls && (
                      <button
                        type="button"
                        onClick={() => onOpenClassDetails(targetCls)}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white hover:bg-[#e5e5ea] text-[#111827] text-xs font-semibold cursor-pointer transition-colors duration-100 whitespace-normal text-center"
                      >
                        Abrir Turma {targetCls.turmaAbrev || targetCls.name}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Tabela Desktop com Zebra Striping (Sem divide-y, Sem contornos) */}
            <div className="hidden lg:block overflow-x-auto rounded-2xl">
              <table className="w-full text-left text-xs sm:text-[13px] border-collapse">
                <thead className="bg-[#f2f2f7] text-[#374151] font-semibold text-xs">
                  <tr>
                    <th className="py-3 px-3 rounded-tl-xl">Gravidade</th>
                    <th className="py-3 px-3">Categoria</th>
                    <th className="py-3 px-3">Turma / Estudante</th>
                    <th className="py-3 px-3">Campo Afetado</th>
                    <th className="py-3 px-3">Atual vs Esperado</th>
                    <th className="py-3 px-3">Diagnóstico e Ação</th>
                    <th className="py-3 px-3 text-right rounded-tr-xl">Acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleIssues.map((issue) => {
                    const isCrit = issue.severity === 'critical';
                    const isWarn = issue.severity === 'warning';
                    const targetCls = issue.classId
                      ? classes.find((c) => c.id === issue.classId)
                      : undefined;

                    return (
                      <tr
                        key={issue.id}
                        className="odd:bg-[#f8f8fb] even:bg-white hover:bg-[#eef0f5] transition-colors duration-100"
                      >
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${
                              isCrit
                                ? 'bg-[#fee2e2] text-[#991b1b]'
                                : isWarn
                                ? 'bg-[#fef3c7] text-[#92400e]'
                                : 'bg-[#e8f0fe] text-[#1a4fa3]'
                            }`}
                          >
                            {isCrit ? 'Crítica' : isWarn ? 'Alerta' : 'Info'}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-[#374151] font-medium whitespace-nowrap">
                          {issue.categoryLabel}
                        </td>
                        <td className="py-3 px-3 align-top">
                          <span className="font-semibold text-[#111827] block">
                            {issue.className || 'EMEB Geral'}
                          </span>
                          {issue.studentName && (
                            <span className="text-xs text-[#374151] block break-words">
                              {issue.studentNumber ? `Nº ${issue.studentNumber} · ` : ''}
                              {issue.studentName}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 align-top font-semibold text-[#111827] break-words">
                          {issue.affectedField}
                        </td>
                        <td className="py-3 px-3 align-top text-xs break-words">
                          <span className="text-[#991b1b] block">
                            Atual: <strong>{issue.currentValue}</strong>
                          </span>
                          <span className="text-[#005035] block mt-0.5">
                            Esperado: {issue.expectedValue}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-[#374151] max-w-md break-words">
                          <span className="block">{issue.description}</span>
                          <span className="text-xs text-[#48484a] block mt-0.5">
                            Sugestão: {issue.suggestedAction}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                          {targetCls ? (
                            <button
                              type="button"
                              onClick={() => onOpenClassDetails(targetCls)}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#e9e9ef] hover:bg-[#dcdce4] text-[#111827] text-xs font-semibold cursor-pointer"
                            >
                              Abrir Turma
                            </button>
                          ) : (
                            <span className="text-xs text-[#6b7280]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredIssues.length > visibleLimit && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 60)}
                  className="min-h-[42px] px-4 rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] text-xs sm:text-[13px] font-semibold cursor-pointer"
                >
                  Carregar mais (+60 de {filteredIssues.length - visibleLimit} restantes)
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleLimit(filteredIssues.length)}
                  className="min-h-[42px] px-4 rounded-xl bg-white text-[#48484a] hover:text-[#111827] text-xs sm:text-[13px] font-semibold cursor-pointer"
                >
                  Exibir todos ({filteredIssues.length})
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-[#48484a]">
        <span className="inline-flex items-center gap-1.5">
          <Database className="w-4 h-4 shrink-0" />
          <span>Auditoria local + Firestore em tempo real</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Activity className="w-4 h-4 shrink-0" />
          <span>{allIssues.length} apontamento(s) totais</span>
        </span>
      </div>
    </div>
  );
};
