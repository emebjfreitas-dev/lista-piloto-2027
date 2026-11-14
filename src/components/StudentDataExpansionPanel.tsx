import React, { useState } from 'react';
import { ClassGroup, Student } from '../types';
import { OFFICIAL_OCTOBER_DAYS, SCHOOL_NAME } from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getStudentConsecutiveAlertInfo,
} from '../utils/attendanceRules';
import {
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
} from '../utils/genderDictionary';
import {
  resolveStudentCoordinates,
  calculateTravelEstimates,
} from '../utils/geoRouting';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';

interface StudentDataExpansionPanelProps {
  student: Student;
  classGroup: ClassGroup;
  diasLetivosMes?: number;
  minLegalPresence?: number;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onNavigateToMap?: (student: Student) => void;
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
  onNavigateToMap,
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
  const studentGenderInfo = getStudentGenderLabel(student);
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

  const coords = resolveStudentCoordinates(student);
  const travel = calculateTravelEstimates(coords.lat, coords.lng);

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
      className="mt-3 rounded-2xl bg-[#eef2f7] p-3.5 sm:p-5 space-y-3.5 text-slate-950 animate-gentle-fade min-w-0 break-words"
    >
      {/* Topo Compacto: Identificação + Ações Principais */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
        {showHeaderMeta ? (
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-[#0b3b8c] text-white font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
                {student.number.toString().padStart(2, '0')}
              </span>
              <h4 className="font-bold text-base sm:text-lg text-slate-950 leading-snug break-words min-w-0">
                {student.name}
              </h4>
            </div>
            <p className="text-xs sm:text-[13px] text-slate-700 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
              <span>{studentGenderInfo.code === 'F' ? 'Menina' : 'Menino'}</span>
              {student.ra && (
                <>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span>
                    RA {student.ra}
                    {student.digRa ? `-${student.digRa}` : ''}
                  </span>
                </>
              )}
              {student.dataNascimento && (
                <>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span>
                    Nasc.: {student.dataNascimento}
                    {student.idade ? ` (${student.idade} anos)` : ''}
                  </span>
                </>
              )}
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span>Turma {classGroup.name}</span>
            </p>
          </div>
        ) : (
          <div className="text-xs font-semibold text-slate-700 min-w-0">
            Resumo visual do estudante
          </div>
        )}

        {/* Botões de Ação com Alto Contraste */}
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0 shrink-0">
          {onOpenStudentGrid && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudentGrid(student);
              }}
              className="min-h-[42px] py-2 px-4 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-bold text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors duration-100 shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">badge</span>
              <span>Ver Ficha Completa</span>
            </button>
          )}

          {onOpenStudentPdf && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudentPdf(student);
              }}
              title="Abrir Ficha Informativa do Estudante"
              className={`min-h-[42px] py-2 px-4 rounded-xl font-bold text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors duration-100 ${
                hasPdf
                  ? 'bg-[#0052cc] hover:bg-[#003e99] text-white shadow-xs'
                  : 'bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-900'
              }`}
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">
                {hasPdf ? 'picture_as_pdf' : 'description'}
              </span>
              <span>{hasPdf ? 'Ficha Informativa' : 'Sem Ficha Informativa'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyPlainSummary}
            className="min-h-[42px] py-2 px-3.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-900 font-semibold text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors duration-100"
          >
            <span className="material-symbols-outlined text-[18px] shrink-0">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copiado' : 'Copiar Resumo'}</span>
          </button>

          {onCollapse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
              aria-label="Fechar resumo do estudante"
              className="min-h-[42px] min-w-[42px] py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs sm:text-[13px] flex items-center justify-center text-center whitespace-normal gap-1 cursor-pointer transition-colors duration-100"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">close</span>
              <span className="sm:hidden">Fechar</span>
            </button>
          )}
        </div>
      </div>

      {/* Faixa Visual de Frequência (Sempre visível ao expandir para leitura instantânea) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span
              className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
                isCompliant ? 'text-emerald-800' : 'text-rose-800'
              }`}
            >
              {metrics.frequenciaPercent}%
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-800">
              de presença ({metrics.presencas} de {metrics.diasLetivosMatriculados} dias)
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
              isCompliant
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">
              {isCompliant ? 'check_circle' : 'warning'}
            </span>
            <span>
              {isCompliant
                ? `Dentro da meta (${effectiveMinPresence}%)`
                : `Abaixo da meta (${effectiveMinPresence}%)`}
            </span>
          </span>
        </div>

        {/* Barra Segmentada Proporcional + Marcador da Meta Legal */}
        <div className="relative pt-1">
          <div className="w-full h-3.5 rounded-full bg-slate-200 overflow-hidden flex">
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
          {/* Marcador da Meta Legal */}
          <div
            style={{ left: `${effectiveMinPresence}%` }}
            title={`Mínimo legal: ${effectiveMinPresence}%`}
            className="absolute top-0 bottom-0 w-0.5 bg-slate-950/75"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold tabular-nums pt-0.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-emerald-900">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 shrink-0" />
              Presenças: {metrics.presencas}d
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-900">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 shrink-0" />
              Atestados: {metrics.atestados}d
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-900">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 shrink-0" />
              Sem just.: {unexcusedAbsences}d
            </span>
          </div>
          <span className="text-slate-600">Meta legal: {effectiveMinPresence}%</span>
        </div>
      </div>

      {/* Alerta de Faltas Consecutivas (quando aplicável) */}
      {consecInfo.tier !== 'none' && (
        <div
          className={`rounded-2xl border p-3 sm:p-3.5 flex items-start gap-2.5 text-xs sm:text-[13px] ${
            consecInfo.tier === '10d'
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
            warning
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {consecInfo.tier === '10d'
                ? 'Alerta Crítico: 10 ou mais faltas seguidas'
                : consecInfo.tier === '5d'
                ? 'Atenção: 5 ou mais faltas seguidas (Busca Ativa)'
                : 'Atenção: 3 ou mais faltas seguidas no período'}
            </p>
            <p className="text-xs font-medium mt-0.5">
              {consecInfo.tier === '10d'
                ? 'Acionar Busca Ativa com urgência e registrar justificativa ou comunicar o Conselho Tutelar.'
                : 'Recomendado entrar em contato com a família para acompanhar a criança.'}
            </p>
          </div>
        </div>
      )}

      {/* Abas Rápidas (Alternância Fluida Sem Empilhar Blocos Gigantes) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3.5 shadow-2xs">
        <div
          role="tablist"
          aria-label="Seções de dados do estudante"
          className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'frequencia'}
            onClick={() => setActiveTab('frequencia')}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs sm:text-[13px] font-bold flex items-center justify-center gap-1.5 text-center whitespace-normal cursor-pointer transition-colors duration-100 ${
              activeTab === 'frequencia'
                ? 'bg-[#0b3b8c] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">bar_chart</span>
            <span>Frequência</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'familia'}
            onClick={() => setActiveTab('familia')}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs sm:text-[13px] font-bold flex items-center justify-center gap-1.5 text-center whitespace-normal cursor-pointer transition-colors duration-100 ${
              activeTab === 'familia'
                ? 'bg-[#0b3b8c] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">family_restroom</span>
            <span>Família &amp; Contato</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'endereco'}
            onClick={() => setActiveTab('endereco')}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs sm:text-[13px] font-bold flex items-center justify-center gap-1.5 text-center whitespace-normal cursor-pointer transition-colors duration-100 ${
              activeTab === 'endereco'
                ? 'bg-[#0b3b8c] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">location_on</span>
            <span>Endereço &amp; Apoios</span>
          </button>
        </div>

        {/* Conteúdo da Aba 1: Frequência & Retorno */}
        {activeTab === 'frequencia' && (
          <div className="space-y-3 animate-gentle-fade">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 tabular-nums">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between sm:block">
                <span className="text-xs font-bold text-emerald-900 block">Presenças</span>
                <span className="text-xl font-bold text-emerald-950">{metrics.presencas} dias</span>
              </div>
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between sm:block">
                <span className="text-xs font-bold text-sky-900 block">Faltas c/ Atestado</span>
                <span className="text-xl font-bold text-sky-950">{metrics.atestados} dias</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between sm:block">
                <span className="text-xs font-bold text-rose-900 block">Faltas Sem Just.</span>
                <span className="text-xl font-bold text-rose-950">{unexcusedAbsences} dias</span>
              </div>
            </div>

            {familyFeedback ? (
              <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5 text-xs sm:text-sm">
                <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5 text-emerald-700">
                  mark_chat_read
                </span>
                <div>
                  <p className="font-bold text-xs uppercase tracking-wider text-emerald-800">
                    Devolutiva da Família Registrada
                  </p>
                  <p className="font-semibold text-slate-950 mt-0.5">“{familyFeedback}”</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 font-medium">
                Situação da matrícula: <strong className="text-slate-950">{enrollmentStatusText}</strong> · Dias letivos considerados: <strong className="text-slate-950 tabular-nums">{metrics.diasLetivosMatriculados}</strong>.
              </p>
            )}
          </div>
        )}

        {/* Conteúdo da Aba 2: Família e Contato Direto */}
        {activeTab === 'familia' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 animate-gentle-fade">
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  {guardian1Info.shortRoleLabel || 'Mãe / Responsável 1'}
                </span>
                <p
                  className={`text-sm font-bold leading-snug mt-0.5 ${
                    hasGuardian1 ? 'text-slate-950' : 'text-slate-500 font-medium'
                  }`}
                >
                  {hasGuardian1 ? guardian1Info.cleanName : 'Não informado na ficha'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  {guardian2Info.shortRoleLabel || 'Pai / Responsável 2'}
                </span>
                <p
                  className={`text-sm font-bold leading-snug mt-0.5 ${
                    hasGuardian2 ? 'text-slate-950' : 'text-slate-500 font-medium'
                  }`}
                >
                  {hasGuardian2 ? guardian2Info.cleanName : 'Não informado na ficha'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
              {waList.length > 0 ? (
                <>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                      Telefone Principal
                    </span>
                    <p className="text-base font-bold text-slate-950 tabular-nums mt-0.5">
                      {waList[0].display}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={waList[0].waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-h-[44px] py-2 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px] shrink-0">chat</span>
                      <span>WhatsApp</span>
                    </a>
                    <a
                      href={`tel:${rawPhones.replace(/\D/g, '')}`}
                      className="flex-1 sm:flex-initial min-h-[44px] py-2 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors duration-100 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px] shrink-0">call</span>
                      <span>Ligar</span>
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-xs sm:text-sm font-medium text-slate-600">
                  Nenhum telefone cadastrado na ficha do estudante.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Conteúdo da Aba 3: Endereço, Trajeto e Apoios */}
        {activeTab === 'endereco' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 animate-gentle-fade">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Endereço Residencial
                </span>
                <p
                  className={`text-sm font-semibold leading-snug mt-0.5 ${
                    formattedAddress ? 'text-slate-950' : 'text-slate-500'
                  }`}
                >
                  {formattedAddress || 'Endereço não cadastrado'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#0b3b8c] bg-blue-50 border border-blue-200 rounded-xl p-2.5 tabular-nums">
                <span className="material-symbols-outlined text-[17px] shrink-0">route</span>
                <span>
                  {travel.distanceRoadKm} km da escola · {travel.walkMinutes} min a pé · {travel.carMinutes} min de carro
                </span>
              </div>

              {onNavigateToMap && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToMap(student);
                  }}
                  className="w-full min-h-[42px] py-2 px-3.5 rounded-xl bg-[#0052cc] hover:bg-[#003e99] text-white font-bold text-xs flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[17px] shrink-0">map</span>
                  <span>Ver Localização no Mapa</span>
                </button>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Transporte Escolar
                </span>
                <p className="text-sm font-bold text-slate-950 mt-0.5">
                  {student.rotaOnibus
                    ? `Ônibus escolar (${student.rotaOnibus})`
                    : 'Próprio / Família'}
                </p>
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Apoio Especial (AEE)
                </span>
                <p
                  className={`text-sm font-semibold mt-0.5 ${
                    student.deficiencia ? 'text-purple-900 font-bold' : 'text-slate-700'
                  }`}
                >
                  {student.deficiencia || 'Sem necessidade AEE registrada'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 text-xs">
                <div>
                  <span className="font-bold text-slate-600">NIS: </span>
                  <span className={student.nis ? 'font-bold text-emerald-900 tabular-nums' : 'text-slate-600'}>
                    {student.nis || 'Não cadastrado'}
                  </span>
                </div>
                <span className="text-slate-700 font-medium break-all tabular-nums">
                  {student.emailMunicipal || ''}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
