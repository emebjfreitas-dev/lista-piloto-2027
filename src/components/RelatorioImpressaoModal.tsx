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
import { useModalScrollLock } from '../hooks/useModalScrollLock';

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
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="bg-white w-full max-w-4xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]">
        {/* Modal Controls */}
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 no-print shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-blue-600">picture_as_pdf</span>
            <div>
              <h3 className="text-base font-semibold text-slate-900 leading-tight">
                Relatórios Oficiais — Bimestral (Bolsa Família) e Mensal
              </h3>
              <p className="text-xs text-slate-500">
                Alerta Legal LDB/MEC: &lt;60% Educação Infantil • &lt;75% Ensino Fundamental
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setReportMode('bimestral')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  reportMode === 'bimestral'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bimestral / Bolsa Família
              </button>
              <button
                type="button"
                onClick={() => setReportMode('mensal')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  reportMode === 'mensal'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Fechamento Mensal
              </button>
            </div>

            {reportMode === 'bimestral' && (
              <select
                value={selectedBimesterId}
                onChange={(e) => setSelectedBimesterId(e.target.value)}
                className="h-9 px-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-xs cursor-pointer focus:outline-none"
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
              className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span>Imprimir / PDF</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="modal-scroll-body flex-1 py-6 px-4 sm:px-6 bg-white text-[#191c1b] space-y-5 print:p-0">
          {/* Official Letterhead */}
          <div className="border-b-2 border-[#003440] pb-4 flex items-center justify-between">
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
                <span className="text-xs font-semibold text-[#71787b] uppercase tracking-wide block">
                  {CITY_NAME} • {SECRETARY_NAME}
                </span>
                <h1 className="text-lg font-semibold text-[#003440] uppercase tracking-wide">
                  LISTA PILOTO 2027 • {SCHOOL_NAME}
                </h1>
                <p className="text-sm text-[#005035] font-bold">
                  {reportMode === 'bimestral'
                    ? `Relatório Bimestral de Frequência e Atestados por Mês — Sistema Bolsa Família / MEC (${currentBimester.label})`
                    : 'Relatório Consolidado de Frequência e Atestados Mensais'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-[#71787b] block">ANO LETIVO 2027</span>
              <span className="text-base font-semibold text-[#003440]">
                {reportMode === 'bimestral' ? currentBimester.periodLabel.toUpperCase() : defaultRefPeriod.label.toUpperCase()}
              </span>
              <span className="text-xs text-[#005035] font-bold block">
                Mínimo Legal: {minLegalPresencePercent}% ({isInfantilClass ? 'Ed. Infantil' : 'Ens. Fundamental'})
              </span>
            </div>
          </div>

          {/* Class Identifiers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f3f4f2] p-3 rounded-xl border border-[#c0c8cb]/60 text-sm">
            <div>
              <span className="text-[#71787b] font-bold block text-xs">TURMA / ANO</span>
              <span className="font-semibold text-[#003440] text-base">{classGroup.name}</span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-xs">ETAPA / EXIGÊNCIA MEC</span>
              <span className="font-bold text-[#191c1b]">
                {classGroup.grade} (≥{minLegalPresencePercent}%)
              </span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-xs">TURNO / SALA</span>
              <span className="font-bold text-[#191c1b]">{classGroup.shift} • {classGroup.room}</span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-xs">ALERTAS LEGAIS NA TURMA</span>
              <span className={`font-semibold ${bimesterAlertsCount > 0 ? 'text-[#ba1a1a]' : 'text-[#005035]'}`}>
                {reportMode === 'bimestral' ? bimesterAlertsCount : criticalStudentsCount} estudante(s) &lt;{minLegalPresencePercent}%
              </span>
            </div>
          </div>

          {reportMode === 'bimestral' ? (
            <div className="border border-[#c0c8cb] rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[#003440] text-white font-bold">
                    <th className="py-2 px-2.5 w-10 text-center">Nº</th>
                    <th className="py-2 px-3">Estudante (RA / NIS Bolsa Família)</th>
                    {currentBimester.months.map((mObj) => (
                      <th key={mObj.name} className="py-2 px-2 text-center bg-[#004632] border-x border-white/15">
                        {mObj.name.slice(0, 3)}. / 27
                        <span className="block text-[11px] font-normal opacity-85">Faltas | Atest.</span>
                      </th>
                    ))}
                    <th className="py-2 px-2 text-center">Total Faltas</th>
                    <th className="py-2 px-2 text-center">Total Atest.</th>
                    <th className="py-2 px-2 text-center">% Bimestre</th>
                    <th className="py-2 px-2.5 text-center">Parecer Bolsa Família / MEC</th>
                  </tr>
                </thead>
                <tbody>
                  {bimesterRows.map((r, idx) => (
                    <tr
                      key={r.student.id}
                      className={`border-b border-[#edeeec] ${
                        r.isBelowLegalThresholdBimestre
                          ? 'bg-[#fff8f7]'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-[#f9faf8]'
                      }`}
                    >
                      <td className="py-2 px-2.5 text-center font-bold text-[#71787b]">
                        {r.student.number.toString().padStart(2, '0')}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-bold text-[#191c1b] block">{r.student.name}</span>
                        <span className="text-[11px] font-mono text-[#71787b]">
                          RA: {r.student.ra}-{r.student.digRa} • NIS: {r.student.nis || '—'}
                        </span>
                      </td>
                      {r.monthsBreakdown.map((mb) => (
                        <td key={mb.monthName} className="py-2 px-2 text-center border-x border-[#edeeec]">
                          <span className={`font-semibold ${mb.faltas > 0 ? 'text-[#ba1a1a]' : 'text-[#71787b]'}`}>
                            {mb.faltas}F
                          </span>
                          <span className="mx-1 text-[#c0c8cb]">|</span>
                          <span className={`font-semibold ${mb.atestados > 0 ? 'text-[#005035]' : 'text-[#71787b]'}`}>
                            {mb.atestados}A
                          </span>
                          <span className="block text-[11px] text-[#71787b]">
                            ({mb.frequenciaPercent}% em {mb.diasLetivos}d)
                          </span>
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-semibold text-[#ba1a1a]">
                        {r.totalFaltasBimestre}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-[#005035]">
                        {r.totalAtestadosBimestre}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-[#003440]">
                        {r.frequenciaBimestrePercent}%
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        {r.isBelowLegalThresholdBimestre ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#ffdad6] text-[#ba1a1a]">
                            ⚠️ Alerta &lt;{r.minLegalPresencePercent}%
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#a4f3ca]/60 text-[#003723]">
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
            <div className="border border-[#c0c8cb] rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[#edeeec] text-[#003440] font-bold border-b border-[#c0c8cb]">
                    <th className="py-2 px-3 w-12 text-center">Nº</th>
                    <th className="py-2 px-3">Nome do Estudante</th>
                    <th className="py-2 px-2 text-center">Dias (Recorte)</th>
                    <th className="py-2 px-2 text-center">Faltas</th>
                    <th className="py-2 px-2 text-center">Atestados</th>
                    <th className="py-2 px-2 text-center">% Presença</th>
                    <th className="py-2 px-3 text-center w-36">Situação Legal</th>
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
                        className={`border-b border-[#edeeec] ${
                          m.isBelowLegalThreshold
                            ? 'bg-[#fff8f7]'
                            : idx % 2 === 0
                            ? 'bg-white'
                            : 'bg-[#f9faf8]'
                        }`}
                      >
                        <td className="py-2 px-3 text-center font-bold text-[#71787b]">
                          {student.number.toString().padStart(2, '0')}
                        </td>
                        <td className="py-2 px-3 font-semibold text-[#191c1b]">
                          {student.name}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-[#41484b]">
                          {m.diasLetivosMatriculados}/{m.diasLetivosMes}d
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-[#ba1a1a]">
                          {m.faltas}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-[#005035]">
                          {m.atestados}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold text-[#003440]">
                          {m.frequenciaPercent}%
                        </td>
                        <td className="py-2 px-3 text-center">
                          {m.isBelowLegalThreshold ? (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#ffdad6] text-[#ba1a1a]">
                              ⚠️ Alerta &lt;{m.minLegalPresencePercent}%
                            </span>
                          ) : m.faltas === 0 ? (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#a4f3ca]/60 text-[#003723]">
                              100% Presença
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#f3f4f2] text-[#436370]">
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
          <div className="border border-[#c0c8cb] rounded-xl p-3.5 bg-[#f9faf8]">
            <span className="text-xs font-bold text-[#71787b] block uppercase">
              Parecer Pedagógico e Observações Gerais
            </span>
            <p className="text-sm text-[#191c1b] mt-1 leading-relaxed italic">
              "{classGroup.pedagogicalNotes}"
            </p>
          </div>

          {/* Signatures Area */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs sm:text-sm print:pt-10 break-inside-avoid">
            <div>
              <div className="border-t border-slate-300 mx-4 mb-1.5"></div>
              <span className="font-semibold text-slate-900 block">
                {classGroup.isVaga || classGroup.teacherName === 'TURMA VAGA'
                  ? 'Docente Regente (Aguardando Atribuição)'
                  : classGroup.teacherName || 'Docente Regente Responsável'}
              </span>
              <span className="text-slate-500 text-xs">Docente Regente · Turma {classGroup.name} ({classGroup.shift})</span>
            </div>
            <div>
              <div className="border-t border-slate-300 mx-4 mb-1.5"></div>
              <span className="font-semibold text-slate-900 block">Direção / Coordenação Pedagógica</span>
              <span className="text-slate-500 text-xs">{SCHOOL_NAME}</span>
            </div>
          </div>
        </div>

        {/* Footer Sticky */}
        <div className="p-4 sm:p-5 sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200/90 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10 no-print">
          <span className="text-xs text-slate-500 font-medium">
            Turma {classGroup.name} · {classGroup.shift} · {classGroup.students.length} estudantes
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
            >
              Fechar Visualização
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Imprimir Relatório</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

