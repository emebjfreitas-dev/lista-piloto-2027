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
      className="mt-3 rounded-2xl bg-[#f5f5f7] p-4 sm:p-5 space-y-4 text-slate-900 animate-gentle-fade"
    >
      {/* Cabeçalho simples e sem excesso de etiquetas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {showHeaderMeta ? (
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-slate-900 text-white font-semibold text-xs flex items-center justify-center shrink-0 tabular-nums">
                {student.number.toString().padStart(2, '0')}
              </span>
              <h4 className="font-semibold text-base sm:text-lg text-slate-950 leading-snug truncate">
                {student.name}
              </h4>
            </div>
            <p className="text-xs sm:text-[13px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
              <span>{studentGenderInfo.code === 'F' ? 'Menina' : 'Menino'}</span>
              {student.ra && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    RA {student.ra}
                    {student.digRa ? `-${student.digRa}` : ''}
                  </span>
                </>
              )}
              {student.dataNascimento && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Nascimento: {student.dataNascimento}
                    {student.idade ? ` (${student.idade} anos)` : ''}
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>Turma {classGroup.name}</span>
            </p>
          </div>
        ) : (
          <div className="text-xs text-slate-600 font-medium">
            Resumo rápido em linguagem simples
          </div>
        )}

        {/* Botões de ação com rótulos claros e linha única */}
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          {onOpenStudentGrid && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudentGrid(student);
              }}
              className="min-h-[42px] px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">badge</span>
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
              className={`min-h-[42px] px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                hasPdf
                  ? 'bg-[#0071e3] hover:bg-[#005bb5] text-white'
                  : 'bg-rose-100 hover:bg-rose-200 text-rose-900'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {hasPdf ? 'picture_as_pdf' : 'description'}
              </span>
              <span>{hasPdf ? 'Abrir Ficha PDF' : 'Sem Ficha PDF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyPlainSummary}
            className="min-h-[42px] px-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Resumo Copiado' : 'Copiar Resumo'}</span>
          </button>

          {onCollapse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
              aria-label="Fechar resumo do estudante"
              className="min-h-[42px] min-w-[42px] px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-600 font-medium text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[17px]">close</span>
              <span className="sm:hidden">Fechar</span>
            </button>
          )}
        </div>
      </div>

      {/* Aviso simples se houver sequência de faltas seguidas */}
      {consecInfo.tier !== 'none' && (
        <div
          className={`rounded-2xl p-3.5 sm:p-4 flex items-start gap-2.5 text-xs sm:text-[13px] ${
            consecInfo.tier === '10d'
              ? 'bg-rose-100 text-rose-950'
              : 'bg-amber-100 text-amber-950'
          }`}
        >
          <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
            warning
          </span>
          <div className="space-y-0.5">
            <p className="font-semibold">
              {consecInfo.tier === '10d'
                ? 'Alerta importante: 10 ou mais faltas seguidas'
                : consecInfo.tier === '5d'
                ? 'Atenção: 5 ou mais faltas seguidas (Busca Ativa)'
                : 'Atenção: 3 ou mais faltas seguidas neste período'}
            </p>
            <p className="text-xs opacity-90">
              {consecInfo.tier === '10d'
                ? 'A escola precisa acionar a Busca Ativa com urgência e registrar justificativa ou comunicar o Conselho Tutelar.'
                : 'Recomendado entrar em contato com a família para saber se está tudo bem com a criança.'}
            </p>
          </div>
        </div>
      )}

      {/* Retorno da família registrado na Busca Ativa, quando existir */}
      {familyFeedback && (
        <div className="rounded-2xl p-3.5 sm:p-4 bg-emerald-50 text-emerald-950 flex items-start gap-2.5 text-xs sm:text-[13px]">
          <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5 text-emerald-700">
            mark_chat_read
          </span>
          <div className="space-y-0.5">
            <p className="font-semibold">Resposta da família já registrada</p>
            <p className="text-xs sm:text-[13px] text-slate-900">“{familyFeedback}”</p>
          </div>
        </div>
      )}

      {/* 4 blocos claros e diretos, fáceis de ler por qualquer pessoa */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Bloco 1: Presença e Faltas */}
        <section className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">
              Frequência nas aulas
            </p>

            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
                  isCompliant ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {metrics.frequenciaPercent}%
              </span>
              <span className="text-xs sm:text-[13px] text-slate-700 font-medium">
                Veio em <strong className="tabular-nums">{metrics.presencas}</strong> de{' '}
                <strong className="tabular-nums">{metrics.diasLetivosMatriculados}</strong> dias
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  isCompliant ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(0, metrics.frequenciaPercent))}%`,
                }}
              />
            </div>

            <div
              className={`flex items-start gap-1.5 text-xs font-medium pt-0.5 ${
                isCompliant ? 'text-emerald-800' : 'text-rose-800'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">
                {isCompliant ? 'check_circle' : 'info'}
              </span>
              <span>
                {isCompliant
                  ? `Presença em dia (mínimo esperado: ${effectiveMinPresence}%)`
                  : `Poucas presenças: abaixo do mínimo de ${effectiveMinPresence}%`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 bg-slate-50 rounded-xl p-2.5 text-center tabular-nums">
            <div>
              <span className="block text-[11px] text-slate-500">Presenças</span>
              <span className="text-sm font-semibold text-emerald-800">
                {metrics.presencas}d
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500">Atestados</span>
              <span className="text-sm font-semibold text-sky-800">
                {metrics.atestados}d
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500">Sem just.</span>
              <span className="text-sm font-semibold text-rose-800">
                {unexcusedAbsences}d
              </span>
            </div>
          </div>
        </section>

        {/* Bloco 2: Família e Contato */}
        <section className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500">
              Família e telefone para contato
            </p>

            <div className="space-y-2.5">
              <div>
                <span className="text-[11px] font-medium text-slate-500 block">
                  {guardian1Info.shortRoleLabel || 'Mãe / Responsável 1'}
                </span>
                <p
                  className={`text-sm font-semibold leading-snug ${
                    hasGuardian1 ? 'text-slate-950' : 'text-slate-400 font-normal'
                  }`}
                >
                  {hasGuardian1 ? guardian1Info.cleanName : 'Não informado na ficha'}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-500 block">
                  {guardian2Info.shortRoleLabel || 'Pai / Responsável 2'}
                </span>
                <p
                  className={`text-sm font-semibold leading-snug ${
                    hasGuardian2 ? 'text-slate-950' : 'text-slate-400 font-normal'
                  }`}
                >
                  {hasGuardian2 ? guardian2Info.cleanName : 'Não informado na ficha'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            {waList.length > 0 ? (
              <>
                <p className="text-xs text-slate-600 tabular-nums font-medium">
                  Telefone: <span className="text-slate-900 font-semibold">{waList[0].display}</span>
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={waList[0].waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-h-[42px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    <span>WhatsApp</span>
                  </a>
                  <a
                    href={`tel:${rawPhones.replace(/\D/g, '')}`}
                    className="min-h-[42px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">call</span>
                    <span>Ligar</span>
                  </a>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
                Nenhum telefone cadastrado ainda.
              </p>
            )}
          </div>
        </section>

        {/* Bloco 3: Endereço e Transporte */}
        <section className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-500">
              Endereço e caminho até a escola
            </p>

            <div>
              <span className="text-[11px] font-medium text-slate-500 block">
                Onde mora
              </span>
              <p
                className={`text-sm font-medium leading-snug mt-0.5 ${
                  formattedAddress ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {formattedAddress || 'Endereço não cadastrado'}
              </p>
            </div>

            <div className="bg-sky-50/80 rounded-xl p-2.5 text-xs text-sky-950 space-y-1">
              <span className="font-semibold block">
                Distância aproximada da escola ({travel.distanceRoadKm} km)
              </span>
              <p className="text-sky-900 tabular-nums">
                Cerca de {travel.walkMinutes} min a pé · {travel.carMinutes} min de carro
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="text-xs text-slate-700">
              <span className="text-[11px] text-slate-500 block">Transporte escolar</span>
              <span className="font-semibold text-slate-900">
                {student.rotaOnibus
                  ? `Ônibus escolar (${student.rotaOnibus})`
                  : 'Vai com a família ou transporte próprio'}
              </span>
            </div>

            {onNavigateToMap && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToMap(student);
                }}
                className="w-full min-h-[42px] px-3 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">map</span>
                <span>Ver Localização no Mapa</span>
              </button>
            )}
          </div>
        </section>

        {/* Bloco 4: Situação Escolar e Apoios */}
        <section className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-500">
              Situação na escola e apoios
            </p>

            <div>
              <span className="text-[11px] font-medium text-slate-500 block">
                Situação da matrícula
              </span>
              <p className="text-sm font-semibold text-slate-950 leading-snug">
                {enrollmentStatusText}
              </p>
            </div>

            <div>
              <span className="text-[11px] font-medium text-slate-500 block">
                Apoio escolar especial (AEE)
              </span>
              <p
                className={`text-sm font-medium leading-snug ${
                  student.deficiencia ? 'text-purple-900 font-semibold' : 'text-slate-600'
                }`}
              >
                {student.deficiencia
                  ? student.deficiencia
                  : 'Não necessita de apoio especial registrado'}
              </p>
            </div>

            <div>
              <span className="text-[11px] font-medium text-slate-500 block">
                Benefício social (Bolsa Família / NIS)
              </span>
              <p
                className={`text-sm font-medium leading-snug tabular-nums ${
                  student.nis ? 'text-emerald-800 font-semibold' : 'text-slate-600'
                }`}
              >
                {student.nis ? `Cadastrado (NIS ${student.nis})` : 'Não cadastrado'}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <span className="text-[11px] font-medium text-slate-500 block">
              E-mail escolar
            </span>
            <p className="text-xs font-medium text-slate-700 truncate tabular-nums">
              {student.emailMunicipal || 'Ainda não gerado'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
