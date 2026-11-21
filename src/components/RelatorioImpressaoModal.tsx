import React, { useState } from 'react';
import { ClassGroup } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME, CITY_NAME, SECRETARY_NAME, OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getClassAttendanceMetrics,
  getStudentBimesterReport,
  OFFICIAL_BIMESTERS_2027,
  getDefaultReferencePeriod,
} from '../utils/attendanceRules';
import { FileText, Printer, X } from 'lucide-react';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ModalPortal } from './ui/ModalPortal';

interface RelatorioImpressaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  classGroup: ClassGroup;
}

export const RelatorioImpressaoModal: React.FC<RelatorioImpressaoModalProps> = ({
  isOpen,
  onClose,
  classGroup,
}) => {
  useModalScrollLock(isOpen);

  const [reportMode, setReportMode] = useState<'mensal' | 'bimestral'>('bimestral');
  const [selectedBimesterId, setSelectedBimesterId] = useState<string>('5bim');

  if (!isOpen) return null;

  const defaultRefPeriod = getDefaultReferencePeriod();
  const classMetrics = getClassAttendanceMetrics(classGroup, OFFICIAL_OCTOBER_DAYS);
  const isInfantilClass = classGroup.name.toUpperCase().startsWith('GRUPO');
  const minLegalPresencePercent = isInfantilClass ? 60 : 75;
  const criticalStudentsCount = classGroup.students.filter((s) =>
    getStudentAttendanceMetrics(s, classGroup.classesHeld || 20, OFFICIAL_OCTOBER_DAYS).isBelowLegalThreshold
  ).length;
  const currentBimester =
    OFFICIAL_BIMESTERS_2027.find((b) => b.id === selectedBimesterId) ||
    OFFICIAL_BIMESTERS_2027[4];

  const bimesterRows = [...classGroup.students]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
    .map((s) => getStudentBimesterReport(s, classGroup, currentBimester.id));
  const bimesterAlertsCount = bimesterRows.filter((r) => r.isBelowLegalThresholdBimestre).length;

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[110] overflow-hidden flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in">
        <div className="modal-shell w-full max-w-4xl rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[88dvh] animate-apple-pop">
        {/* Modal Controls */}
        <div className="modal-header-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#14428c] shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-slate-950 leading-tight">
                Relatórios Oficiais — Bimestral (Bolsa Família) e Mensal
              </h3>
              <p className="text-xs text-slate-700">
                Alerta Legal LDB/MEC: &lt;60% Educação Infantil • &lt;75% Ensino Fundamental
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#eef3f9] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setReportMode('bimestral')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 ${
                  reportMode === 'bimestral'
                    ? 'bg-[#14428c] text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Bimestral / Bolsa Família
              </button>
              <button
                type="button"
                onClick={() => setReportMode('mensal')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 ${
                  reportMode === 'mensal'
                    ? 'bg-[#14428c] text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Fechamento Mensal
              </button>
            </div>

            {reportMode === 'bimestral' && (
              <select
                value={selectedBimesterId}
                onChange={(e) => setSelectedBimesterId(e.target.value)}
                className="min-h-[38px] px-3 rounded-xl bg-emerald-100/85 text-emerald-950 font-semibold text-xs cursor-pointer"
              >
                {OFFICIAL_BIMESTERS_2027.map((bim) => (
                  <option key={bim.id} value={bim.id}>
                    {bim.label} ({bim.periodLabel})
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handlePrint}
              type="button"
              className="min-h-[38px] px-4 bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-xs sm:text-sm rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-all duration-200 active:scale-[0.97]"
            >
              <Printer className="w-[18px] h-[18px]" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              aria-label="Fechar"
              className="w-9 h-9 rounded-xl bg-[#eef3f9] text-slate-700 hover:text-slate-950 hover:bg-[#e2e8f0] flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="modal-scroll-body flex-1 min-h-0 py-6 px-4 sm:px-6 bg-white text-[#0f172a] space-y-5 print:p-0">
          {/* Official Letterhead */}
          <div>
            <div className="pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={APP_LOGO_URL}
                  alt="Brasão Oficial do Município de Jundiaí"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = APP_LOGO_FALLBACK_URL;
                  }}
                  className="h-14 w-auto object-contain"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide block">
                    {CITY_NAME} • {SECRETARY_NAME}
                  </span>
                  <h1 className="text-lg font-semibold text-[#14428c] uppercase tracking-wide">
                    LISTA PILOTO 2027 • {SCHOOL_NAME}
                  </h1>
                  <p className="text-sm text-[#065f46] font-bold">
                    {reportMode === 'bimestral'
                      ? `Relatório Bimestral de Frequência e Atestados por Mês — Sistema Bolsa Família / MEC (${currentBimester.label})`
                      : 'Relatório Consolidado de Frequência e Atestados Mensais'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-700 block">ANO LETIVO 2027</span>
                <span className="text-base font-semibold text-[#14428c]">
                  {reportMode === 'bimestral' ? currentBimester.periodLabel.toUpperCase() : defaultRefPeriod.label.toUpperCase()}
                </span>
                <span className="text-xs text-[#065f46] font-bold block">
                  Mínimo Legal: {minLegalPresencePercent}% ({isInfantilClass ? 'Ed. Infantil' : 'Ens. Fundamental'})
                </span>
              </div>
            </div>
            <div className="h-[2px] bg-[#14428c]" />
          </div>

          {/* Class Identifiers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f3f6fb] p-3.5 rounded-xl text-sm">
            <div>
              <span className="text-slate-700 font-bold block text-xs">TURMA / ANO</span>
              <span className="font-semibold text-[#14428c] text-base">{classGroup.name}</span>
            </div>
            <div>
              <span className="text-slate-700 font-bold block text-xs">ETAPA / EXIGÊNCIA MEC</span>
              <span className="font-bold text-slate-950">
                {classGroup.grade} (≥{minLegalPresencePercent}%)
              </span>
            </div>
            <div>
              <span className="text-slate-700 font-bold block text-xs">TURNO / SALA</span>
              <span className="font-bold text-slate-950">{classGroup.shift} • {classGroup.room}</span>
            </div>
            <div>
              <span className="text-slate-700 font-bold block text-xs">ALERTAS LEGAIS NA TURMA</span>
              <span className={`font-semibold ${bimesterAlertsCount > 0 ? 'text-[#9f1239]' : 'text-[#065f46]'}`}>
                {reportMode === 'bimestral' ? bimesterAlertsCount : criticalStudentsCount} estudante(s) &lt;{minLegalPresencePercent}%
              </span>
            </div>
          </div>

          {reportMode === 'bimestral' ? (
            <div className="rounded-xl overflow-x-auto shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)]">
              <table className="w-full text-left text-sm min-w-[680px]">
                <thead>
                  <tr className="bg-[#14428c] text-white font-bold">
                    <th className="py-2.5 px-2.5 w-10 text-center">Nº</th>
                    <th className="py-2.5 px-3">Estudante (RA / NIS Bolsa Família)</th>
                    {currentBimester.months.map((mObj) => (
                      <th key={mObj.name} className="py-2.5 px-2 text-center bg-[#065f46]">
                        {mObj.name.slice(0, 3)}. / 27
                        <span className="block text-xs font-normal text-emerald-100">Faltas | Atest.</span>
                      </th>
                    ))}
                    <th className="py-2.5 px-2 text-center">Total Faltas</th>
                    <th className="py-2.5 px-2 text-center">Total Atest.</th>
                    <th className="py-2.5 px-2 text-center">% Bimestre</th>
                    <th className="py-2.5 px-2.5 text-center">Parecer Bolsa Família / MEC</th>
                  </tr>
                </thead>
                <tbody>
                  {bimesterRows.map((r, idx) => (
                    <tr
                      key={r.student.id}
                      className={
                        r.isBelowLegalThresholdBimestre
                          ? 'bg-rose-50/90'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-[#f3f6fb]'
                      }
                    >
                      <td className="py-2.5 px-2.5 text-center font-bold text-slate-700 tabular-nums">
                        {r.student.number.toString().padStart(2, '0')}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-950 block break-words">{r.student.name}</span>
                        <span className="text-xs font-mono text-slate-700">
                          RA: {r.student.ra}-{r.student.digRa} • NIS: {r.student.nis || '—'}
                        </span>
                      </td>
                      {r.monthsBreakdown.map((mb) => (
                        <td key={mb.monthName} className="py-2.5 px-2 text-center">
                          <span className={`font-semibold tabular-nums ${mb.faltas > 0 ? 'text-[#9f1239]' : 'text-slate-700'}`}>
                            {mb.faltas}F
                          </span>
                          <span className="mx-1 text-slate-600">|</span>
                          <span className={`font-semibold tabular-nums ${mb.atestados > 0 ? 'text-[#065f46]' : 'text-slate-700'}`}>
                            {mb.atestados}A
                          </span>
                          <span className="block text-xs text-slate-700 tabular-nums">
                            ({mb.frequenciaPercent}% em {mb.diasLetivos}d)
                          </span>
                        </td>
                      ))}
                      <td className="py-2.5 px-2 text-center font-semibold text-[#9f1239] tabular-nums">
                        {r.totalFaltasBimestre}
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold text-[#065f46] tabular-nums">
                        {r.totalAtestadosBimestre}
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold text-[#14428c] tabular-nums">
                        {r.frequenciaBimestrePercent}%
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {r.isBelowLegalThresholdBimestre ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-950">
                            Alerta &lt;{r.minLegalPresencePercent}%
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-950">
                            Regular (≥{r.minLegalPresencePercent}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Compact Monthly Students Table */
            <div className="rounded-xl overflow-x-auto shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)]">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-[#eef3f9] text-[#14428c] font-bold">
                    <th className="py-2.5 px-3 w-12 text-center">Nº</th>
                    <th className="py-2.5 px-3">Nome do Estudante</th>
                    <th className="py-2.5 px-2 text-center">Dias (Recorte)</th>
                    <th className="py-2.5 px-2 text-center">Faltas</th>
                    <th className="py-2.5 px-2 text-center">Atestados</th>
                    <th className="py-2.5 px-2 text-center">% Presença</th>
                    <th className="py-2.5 px-3 text-center w-36">Situação Legal</th>
                  </tr>
                </thead>
                <tbody>
                  {classGroup.students.map((student, idx) => {
                    const m = getStudentAttendanceMetrics(
                      student,
                      classGroup.classesHeld || 20,
                      OFFICIAL_OCTOBER_DAYS
                    );
                    return (
                      <tr
                        key={student.id}
                        className={
                          m.isBelowLegalThreshold
                            ? 'bg-rose-50/90'
                            : idx % 2 === 0
                            ? 'bg-white'
                            : 'bg-[#f3f6fb]'
                        }
                      >
                        <td className="py-2.5 px-3 text-center font-bold text-slate-700 tabular-nums">
                          {student.number.toString().padStart(2, '0')}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-950">
                          {student.name}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-slate-800 tabular-nums">
                          {m.diasLetivosMatriculados}/{m.diasLetivosMes}d
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-[#9f1239] tabular-nums">
                          {m.faltas}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-[#065f46] tabular-nums">
                          {m.atestados}
                        </td>
                        <td className="py-2.5 px-2 text-center font-semibold text-[#14428c] tabular-nums">
                          {m.frequenciaPercent}%
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {m.isBelowLegalThreshold ? (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-950">
                              Alerta &lt;{m.minLegalPresencePercent}%
                            </span>
                          ) : m.faltas === 0 ? (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-950">
                              100% Presença
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#eef3f9] text-slate-900">
                              Regular (≥{m.minLegalPresencePercent}%)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pedagogical Observations Box */}
          <div className="rounded-xl p-3.5 bg-[#f3f6fb]">
            <span className="text-xs font-bold text-slate-700 block uppercase">
              Parecer Pedagógico e Observações Gerais
            </span>
            <p className="text-sm text-slate-950 mt-1 leading-relaxed italic">
              "{classGroup.pedagogicalNotes}"
            </p>
          </div>

          {/* Signatures Area */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs sm:text-sm print:pt-10 break-inside-avoid">
            <div>
              <div className="h-px bg-slate-400 mx-4 mb-1.5" />
              <span className="font-semibold text-slate-950 block">
                {classGroup.isVaga || classGroup.teacherName === 'TURMA VAGA'
                  ? 'Docente Regente (Aguardando Atribuição)'
                  : classGroup.teacherName || 'Docente Regente Responsável'}
              </span>
              <span className="text-slate-700 text-xs">Docente Regente · Turma {classGroup.name} ({classGroup.shift})</span>
            </div>
            <div>
              <div className="h-px bg-slate-400 mx-4 mb-1.5" />
              <span className="font-semibold text-slate-950 block">Direção / Coordenação Pedagógica</span>
              <span className="text-slate-700 text-xs">{SCHOOL_NAME}</span>
            </div>
          </div>
        </div>

        {/* Footer Sticky */}
        <div className="p-4 sm:p-5 sticky bottom-0 bg-white/95 backdrop-blur-md shadow-[0_-6px_20px_-8px_rgba(9,15,29,0.08)] flex flex-wrap items-center justify-between gap-3 shrink-0 z-10 no-print">
          <span className="text-xs text-slate-700 font-medium">
            Turma {classGroup.name} · {classGroup.shift} · {classGroup.students.length} estudantes
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#eef3f9] hover:bg-[#e2e8f0] text-slate-900 font-bold text-xs cursor-pointer transition-colors"
            >
              Fechar Visualização
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white font-bold text-xs cursor-pointer transition-all duration-200 active:scale-[0.97] inline-flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Relatório</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

