import React, { useState, useMemo } from 'react';
import { ClassGroup, Student } from '../types';
import { OFFICIAL_OCTOBER_DAYS, SCHOOL_NAME } from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getStudentConsecutiveAlertInfo,
} from '../utils/attendanceRules';
import { resolveGuardianRelationshipInfo } from '../utils/genderDictionary';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { findStudentSiblings } from '../utils/siblingDetection';
import { StudentSiblingsCard } from './StudentSiblingsCard';

interface StudentDataExpansionPanelProps {
  student: Student;
  classGroup: ClassGroup;
  diasLetivosMes?: number;
  minLegalPresence?: number;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onCollapse?: () => void;
  showHeaderMeta?: boolean;
  familyFeedback?: string;
}

type ExpansionTab = 'frequencia' | 'familia' | 'endereco';

export const StudentDataExpansionPanel: React.FC<StudentDataExpansionPanelProps> = ({
  student,
  classGroup,
  diasLetivosMes,
  minLegalPresence,
  onOpenStudentPdf,
  onOpenStudentGrid,
  onCollapse,
  showHeaderMeta = true,
  familyFeedback,
}) => {
  const [activeTab, setActiveTab] = useState<ExpansionTab>('frequencia');
  const [copied, setCopied] = useState(false);

  const effectiveDiasLetivos = diasLetivosMes ?? classGroup.classesHeld ?? 20;
  const isInfantilClass =
    classGroup.name.toUpperCase().startsWith('GRUPO') ||
    classGroup.grade.toUpperCase().includes('INFANTIL');
  const effectiveMinPresence = minLegalPresence ?? (isInfantilClass ? 60 : 75);

  const metrics = getStudentAttendanceMetrics(
    student,
    effectiveDiasLetivos,
    OFFICIAL_OCTOBER_DAYS
  );
  const consecInfo = getStudentConsecutiveAlertInfo(student);
  const guardian1Info = resolveGuardianRelationshipInfo(
    student.filiacao1 || student.guardianName,
    'filiacao1',
    student.notes
  );
  const guardian2Info = resolveGuardianRelationshipInfo(
    student.filiacao2,
    'filiacao2',
    student.notes
  );

  // Cruzamento automático de dados para identificar irmãos na escola (Mãe, Pai ou Ambos)
  const detectedSiblings = useMemo(() => findStudentSiblings(student), [student]);

  const isCompliant = metrics.frequenciaPercent >= effectiveMinPresence;
  const unexcusedAbsences = Math.max(0, metrics.faltas - metrics.atestados);
  const totalBase = Math.max(1, metrics.diasLetivosMatriculados);
  const presenceBarPct = Math.min(100, Math.round((metrics.presencas / totalBase) * 100));
  const excusedBarPct = Math.min(100 - presenceBarPct, Math.round((metrics.atestados / totalBase) * 100));
  const unexcusedBarPct = Math.max(0, 100 - presenceBarPct - excusedBarPct);

  const hasPdf = Boolean(
    (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
      (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
  );

  const rawPhones = student.telefones || student.guardianPhone || '';
  const waList = buildWhatsAppLinksFromPhoneString(
    rawPhones,
    student.name,
    `Olá! Somos da ${SCHOOL_NAME}. Gostaríamos de conversar sobre o acompanhamento escolar de ${student.name}.`
  );

  const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
  const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
  const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
  const enrollmentStatusText = isTransferred
    ? `Transferência realizada${student.dataMovimentacao ? ` em ${student.dataMovimentacao}` : ''}`
    : isRemanejado
    ? `Mudou de turma${student.dataMovimentacao ? ` em ${student.dataMovimentacao}` : ''}`
    : sit && sit !== 'ATIVO'
    ? `${student.situacao}${student.dataMovimentacao ? ` (${student.dataMovimentacao})` : ''}`
    : 'Matriculado e frequentando';

  const hasGuardian1 = Boolean(
    guardian1Info.cleanName &&
      guardian1Info.cleanName.trim() !== '' &&
      guardian1Info.cleanName.toLowerCase() !== 'não informado'
  );
  const hasGuardian2 = Boolean(
    guardian2Info.cleanName &&
      guardian2Info.cleanName.trim() !== '' &&
      guardian2Info.cleanName.toLowerCase() !== 'não informado'
  );

  const formattedAddress = [
    student.logradouro
      ? `${student.logradouro}${student.numeroResidencia ? `, nº ${student.numeroResidencia}` : ''}`
      : null,
    student.bairro || null,
    student.cep ? `CEP ${student.cep}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleCopyPlainSummary = (e: React.MouseEvent) => {
    e.stopPropagation();
    const summary = [
      `ESTUDANTE: ${student.name} (Nº ${student.number.toString().padStart(2, '0')} · Turma ${classGroup.name})`,
      student.ra ? `RA: ${student.ra}${student.digRa ? `-${student.digRa}` : ''}` : '',
      `Frequência no mês: ${metrics.frequenciaPercent}% (${metrics.presencas} de ${metrics.diasLetivosMatriculados} dias de aula)`,
      `Faltas: ${metrics.faltas} (${metrics.atestados} com atestado, ${unexcusedAbsences} sem justificativa)`,
      `Responsável 1 (${guardian1Info.shortRoleLabel}): ${hasGuardian1 ? guardian1Info.cleanName : 'Não informado'}`,
      hasGuardian2 ? `Responsável 2 (${guardian2Info.shortRoleLabel}): ${guardian2Info.cleanName}` : '',
      rawPhones ? `Telefones: ${rawPhones}` : 'Telefone: Não cadastrado',
      formattedAddress ? `Endereço: ${formattedAddress}` : '',
      student.rotaOnibus ? `Transporte escolar: ${student.rotaOnibus}` : 'Transporte: Próprio / Família',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-3 rounded-2xl bg-[#f1f5f9] p-3.5 sm:p-4 space-y-3 text-[#0f172a] animate-gentle-fade min-w-0 break-words"
    >
      {/* Topo Compacto: Identificação + Ações Principais */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 min-w-0">
        {showHeaderMeta && (
          <div className="min-w-0 flex-1 space-y-0.5">
            <h4 className="font-semibold text-[16px] sm:text-[17px] tracking-[-0.02em] text-[#0f172a] leading-snug break-words min-w-0">
              {student.name}
            </h4>
            <p className="text-[12px] tracking-[-0.006em] text-[#64748b] font-medium flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
              {student.ra && (
                <span>
                  RA {student.ra}
                  {student.digRa ? `-${student.digRa}` : ''}
                </span>
              )}
              {student.dataNascimento && (
                <>
                  {student.ra && <span aria-hidden="true">·</span>}
                  <span>
                    {student.dataNascimento}
                    {student.idade ? ` (${student.idade}a)` : ''}
                  </span>
                </>
              )}
              {(student.ra || student.dataNascimento) && <span aria-hidden="true">·</span>}
              <span>{classGroup.name}</span>
            </p>
          </div>
        )}

        {/* Ações Rápidas */}
        <div
          className={`flex flex-wrap items-center gap-2 min-w-0 shrink-0 ${
            showHeaderMeta ? 'w-full lg:w-auto' : 'w-full justify-end'
          }`}
        >
          {onOpenStudentGrid && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudentGrid(student);
              }}
              className="flex-1 sm:flex-initial min-h-[38px] py-2 px-3.5 rounded-2xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-semibold text-[12.5px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100"
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">grid_view</span>
              <span>Ficha</span>
            </button>
          )}

          {onOpenStudentPdf && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudentPdf(student);
              }}
              className={`flex-1 sm:flex-initial min-h-[38px] py-2 px-3.5 rounded-2xl font-semibold text-[12.5px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100 ${
                hasPdf
                  ? 'bg-white hover:bg-[#e2e8f0] text-[#0b3b8c]'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">
                picture_as_pdf
              </span>
              <span>{hasPdf ? 'PDF' : 'Enviar PDF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyPlainSummary}
            className="min-h-[38px] py-2 px-3 rounded-2xl bg-white hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[12.5px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100"
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>

          {onCollapse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
              aria-label="Fechar resumo do estudante"
              className="min-h-[38px] min-w-[38px] py-2 px-2.5 rounded-2xl bg-white hover:bg-[#e2e8f0] text-[#475569] flex items-center justify-center cursor-pointer transition-colors duration-100"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Faixa Visual de Frequência */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-[24px] sm:text-[26px] font-bold tracking-[-0.025em] tabular-nums ${
                isCompliant ? 'text-[#047857]' : 'text-[#b42318]'
              }`}
            >
              {metrics.frequenciaPercent}%
            </span>
            <span className="text-[13px] font-medium tracking-[-0.008em] text-[#475569] tabular-nums">
              {metrics.presencas}/{metrics.diasLetivosMatriculados} dias
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold tabular-nums ${
              isCompliant
                ? 'bg-[#ecfdf5] text-[#047857]'
                : 'bg-rose-50 text-[#b42318]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] shrink-0">
              {isCompliant ? 'check_circle' : 'warning'}
            </span>
            <span>
              {isCompliant
                ? `Meta ${effectiveMinPresence}%`
                : `Abaixo de ${effectiveMinPresence}%`}
            </span>
          </span>
        </div>

        {/* Barra Segmentada Proporcional + Marcador da Meta Legal */}
        <div className="relative pt-1">
          <div className="w-full h-3 rounded-full bg-[#e2e8f0] overflow-hidden flex">
            {presenceBarPct > 0 && (
              <div
                style={{ width: `${presenceBarPct}%` }}
                className="h-full bg-emerald-600 transition-all duration-150"
                title={`Presenças: ${metrics.presencas} dias`}
              />
            )}
            {excusedBarPct > 0 && (
              <div
                style={{ width: `${excusedBarPct}%` }}
                className="h-full bg-sky-600 transition-all duration-150"
                title={`Atestados: ${metrics.atestados} dias`}
              />
            )}
            {unexcusedBarPct > 0 && (
              <div
                style={{ width: `${unexcusedBarPct}%` }}
                className="h-full bg-rose-600 transition-all duration-150"
                title={`Faltas sem justificativa: ${unexcusedAbsences} dias`}
              />
            )}
          </div>
          <div
            style={{ left: `${effectiveMinPresence}%` }}
            title={`Mínimo legal: ${effectiveMinPresence}%`}
            className="absolute top-0 bottom-0 w-0.5 bg-slate-950/70"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold tracking-[-0.006em] tabular-nums pt-0.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[#047857]">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              Presenças {metrics.presencas}d
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-800">
              <span className="w-2 h-2 rounded-full bg-sky-600 shrink-0" />
              Atestados {metrics.atestados}d
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#b42318]">
              <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
              Sem just. {unexcusedAbsences}d
            </span>
          </div>
          <span className="text-[#64748b]">Meta {effectiveMinPresence}%</span>
        </div>
      </div>

      {/* Alerta de Faltas Consecutivas */}
      {consecInfo.tier !== 'none' && (
        <div
          className={`rounded-2xl p-3 sm:p-3.5 flex items-start gap-2.5 text-[12.5px] tracking-[-0.008em] ${
            consecInfo.tier === '10d'
              ? 'bg-rose-50 text-rose-950'
              : 'bg-amber-50 text-amber-950'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
            warning
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {consecInfo.tier === '10d'
                ? '10+ faltas seguidas · Alerta Crítico'
                : consecInfo.tier === '5d'
                ? '5+ faltas seguidas · Busca Ativa'
                : '3+ faltas seguidas'}
            </p>
            <p className="text-[12px] opacity-85 mt-0.5">
              {consecInfo.tier === '10d'
                ? 'Acionar Busca Ativa e registrar justificativa ou comunicar Conselho Tutelar.'
                : 'Recomendado entrar em contato com a família.'}
            </p>
          </div>
        </div>
      )}

      {/* Irmãos Identificados na Escola (Aparece Imediatamente ao Clicar no Estudante) */}
      {detectedSiblings.length > 0 && (
        <StudentSiblingsCard
          siblings={detectedSiblings}
          onOpenSiblingFicha={onOpenStudentGrid}
        />
      )}

      {/* Abas Rápidas */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div
          role="tablist"
          aria-label="Dados do estudante"
          className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#f1f5f9]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'frequencia'}
            onClick={() => setActiveTab('frequencia')}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[12.5px] tracking-[-0.01em] font-semibold flex items-center justify-center gap-1.5 text-center whitespace-normal cursor-pointer transition-colors duration-100 ${
              activeTab === 'frequencia'
                ? 'bg-white text-[#0b3b8c] shadow-2xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] shrink-0">bar_chart</span>
            <span>Frequência</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'familia'}
            onClick={() => setActiveTab('familia')}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[12.5px] tracking-[-0.01em] font-semibold flex items-center justify-center gap-1.5 text-center whitespace-normal cursor-pointer transition-colors duration-100 ${
              activeTab === 'familia'
                ? 'bg-white text-[#0b3b8c] shadow-2xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] shrink-0">family_restroom</span>
            <span>Família</span>
            {detectedSiblings.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-extrabold tabular-nums">
                {detectedSiblings.length}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'endereco'}
            onClick={() => setActiveTab('endereco')}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[12.5px] tracking-[-0.01em] font-semibold flex items-center justify-center gap-1.5 text-center whitespace-normal cursor-pointer transition-colors duration-100 ${
              activeTab === 'endereco'
                ? 'bg-white text-[#0b3b8c] shadow-2xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] shrink-0">location_on</span>
            <span>Endereço</span>
          </button>
        </div>

        {/* Aba 1: Frequência */}
        {activeTab === 'frequencia' && (
          <div className="space-y-3 animate-gentle-fade">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 tabular-nums">
              <div className="p-3 rounded-2xl bg-[#ecfdf5] flex items-center justify-between sm:block">
                <span className="text-[12px] font-semibold text-[#047857] block">Presenças</span>
                <span className="text-[19px] font-bold tracking-[-0.02em] text-[#064e3b]">{metrics.presencas}d</span>
              </div>
              <div className="p-3 rounded-2xl bg-sky-50 flex items-center justify-between sm:block">
                <span className="text-[12px] font-semibold text-sky-800 block">Atestados</span>
                <span className="text-[19px] font-bold tracking-[-0.02em] text-sky-950">{metrics.atestados}d</span>
              </div>
              <div className="p-3 rounded-2xl bg-rose-50 flex items-center justify-between sm:block">
                <span className="text-[12px] font-semibold text-[#b42318] block">Sem Just.</span>
                <span className="text-[19px] font-bold tracking-[-0.02em] text-rose-950">{unexcusedAbsences}d</span>
              </div>
            </div>

            {familyFeedback ? (
              <div className="rounded-2xl p-3 bg-[#ecfdf5] text-[#064e3b] flex items-start gap-2 text-[13px]">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5 text-[#047857]">
                  mark_chat_read
                </span>
                <div>
                  <p className="font-semibold text-[11px] uppercase tracking-[0.03em] text-[#047857]">
                    Devolutiva da Família
                  </p>
                  <p className="font-medium text-[#0f172a] mt-0.5">“{familyFeedback}”</p>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-[#64748b] font-medium tabular-nums">
                {enrollmentStatusText} · {metrics.diasLetivosMatriculados} dias letivos
              </p>
            )}
          </div>
        )}

        {/* Aba 2: Família e Contato */}
        {activeTab === 'familia' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-gentle-fade">
            <div className="space-y-2">
              <div className="p-3 rounded-2xl bg-[#f8fafc]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                  {guardian1Info.shortRoleLabel || 'Responsável 1'}
                </span>
                <p
                  className={`text-[14px] font-semibold tracking-[-0.012em] leading-snug mt-0.5 ${
                    hasGuardian1 ? 'text-[#0f172a]' : 'text-[#94a3b8] font-normal'
                  }`}
                >
                  {hasGuardian1 ? guardian1Info.cleanName : 'Não informado'}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-[#f8fafc]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                  {guardian2Info.shortRoleLabel || 'Responsável 2'}
                </span>
                <p
                  className={`text-[14px] font-semibold tracking-[-0.012em] leading-snug mt-0.5 ${
                    hasGuardian2 ? 'text-[#0f172a]' : 'text-[#94a3b8] font-normal'
                  }`}
                >
                  {hasGuardian2 ? guardian2Info.cleanName : 'Não informado'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f8fafc] flex flex-col justify-between gap-3">
              {waList.length > 0 ? (
                <>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                      Telefone
                    </span>
                    <p className="text-[16px] font-semibold tracking-[-0.015em] text-[#0f172a] tabular-nums mt-0.5">
                      {waList[0].display}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={waList[0].waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-h-[40px] py-2 px-3.5 rounded-2xl bg-[#047857] hover:bg-[#065f46] text-white font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 transition-colors duration-100 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px] shrink-0">chat</span>
                      <span>WhatsApp</span>
                    </a>
                    <a
                      href={`tel:${rawPhones.replace(/\D/g, '')}`}
                      className="flex-1 sm:flex-initial min-h-[40px] py-2 px-3.5 rounded-2xl bg-white hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 transition-colors duration-100 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[17px] shrink-0">call</span>
                      <span>Ligar</span>
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-[13px] font-normal text-[#64748b]">
                  Nenhum telefone cadastrado.
                </p>
              )}
            </div>
            {detectedSiblings.length > 0 && (
              <div className="md:col-span-2 pt-1">
                <StudentSiblingsCard
                  siblings={detectedSiblings}
                  onOpenSiblingFicha={onOpenStudentGrid}
                />
              </div>
            )}
          </div>
        )}

        {/* Aba 3: Endereço e Apoios */}
        {activeTab === 'endereco' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-gentle-fade">
            <div className="p-3.5 rounded-2xl bg-[#f8fafc] space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                Endereço
              </span>
              <p
                className={`text-[13.5px] font-medium leading-snug ${
                  formattedAddress ? 'text-[#0f172a]' : 'text-[#94a3b8]'
                }`}
              >
                {formattedAddress || 'Não cadastrado'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f8fafc] space-y-2">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                  Transporte
                </span>
                <p className="text-[13.5px] font-semibold text-[#0f172a] mt-0.5">
                  {student.rotaOnibus
                    ? `Ônibus (${student.rotaOnibus})`
                    : 'Próprio'}
                </p>
              </div>

              {student.deficiencia && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                    AEE
                  </span>
                  <p className="text-[13.5px] font-semibold text-purple-900 mt-0.5">
                    {student.deficiencia}
                  </p>
                </div>
              )}

              {(student.nis || student.emailMunicipal) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12px] text-[#475569] tabular-nums">
                  {student.nis && (
                    <span>
                      NIS <strong className="font-semibold text-[#047857]">{student.nis}</strong>
                    </span>
                  )}
                  {student.emailMunicipal && (
                    <span className="break-all">{student.emailMunicipal}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
