import React, { useState } from 'react';
import { ClassGroup } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME, CITY_NAME, SECRETARY_NAME, OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getClassAttendanceMetrics,
  getStudentBimesterReport,
  OFFICIAL_BIMESTERS_2027,
} from '../utils/attendanceRules';

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
  const [reportMode, setReportMode] = useState<'mensal' | 'bimestral'>('bimestral');
  const [selectedBimesterId, setSelectedBimesterId] = useState<string>('4_bim_2027');

  if (!isOpen) return null;

  const classMetrics = getClassAttendanceMetrics(classGroup, OFFICIAL_OCTOBER_DAYS);
  const currentBimester =
    OFFICIAL_BIMESTERS_2027.find((b) => b.id === selectedBimesterId) ||
    OFFICIAL_BIMESTERS_2027[3];

  const bimesterRows = classGroup.students.map((s) =>
    getStudentBimesterReport(s, classGroup, currentBimester.id)
  );
  const bimesterAlertsCount = bimesterRows.filter((r) => r.isBelowLegalThreshold).length;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-[#edeeec] p-6 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#edeeec] no-print">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-[#003440]">picture_as_pdf</span>
            <div>
              <h3 className="text-[1.15rem] font-black text-[#003440] leading-tight">
                Relatórios Oficiais — Bimestral (Bolsa Família) e Mensal
              </h3>
              <p className="text-[0.76rem] font-semibold text-[#41484b]">
                Alerta Legal LDB/MEC: &lt;60% Educação Infantil • &lt;75% Ensino Fundamental
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#f3f4f2] p-1 rounded-xl border border-[#c0c8cb]">
              <button
                type="button"
                onClick={() => setReportMode('bimestral')}
                className={`px-3 py-1.5 rounded-lg text-[0.78rem] font-black cursor-pointer transition-all ${
                  reportMode === 'bimestral'
                    ? 'bg-[#003440] text-white shadow-2xs'
                    : 'text-[#41484b] hover:text-[#003440]'
                }`}
              >
                Bimestral / Bolsa Família
              </button>
              <button
                type="button"
                onClick={() => setReportMode('mensal')}
                className={`px-3 py-1.5 rounded-lg text-[0.78rem] font-black cursor-pointer transition-all ${
                  reportMode === 'mensal'
                    ? 'bg-[#003440] text-white shadow-2xs'
                    : 'text-[#41484b] hover:text-[#003440]'
                }`}
              >
                Fechamento Mensal
              </button>
            </div>

            {reportMode === 'bimestral' && (
              <select
                value={selectedBimesterId}
                onChange={(e) => setSelectedBimesterId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#eaf6ef] text-[#005035] border border-[#a4f3ca] font-black text-[0.78rem] cursor-pointer"
              >
                {OFFICIAL_BIMESTERS_2027.map((bim) => (
                  <option key={bim.id} value={bim.id}>
                    {bim.label} ({bim.period})
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handlePrint}
              type="button"
              className="px-4 py-2 bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.85rem] rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[19px]">print</span>
              <span>Imprimir / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#41484b] flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="overflow-y-auto py-6 px-4 bg-white text-[#191c1b] space-y-5 print:p-0">
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
                <span className="text-[0.76rem] font-extrabold text-[#71787b] uppercase tracking-wide block">
                  {CITY_NAME} • {SECRETARY_NAME}
                </span>
                <h1 className="text-[1.18rem] font-extrabold text-[#003440] uppercase tracking-wide">
                  LISTA PILOTO 2027 • {SCHOOL_NAME}
                </h1>
                <p className="text-[0.82rem] text-[#005035] font-bold">
                  {reportMode === 'bimestral'
                    ? `Relatório Bimestral de Frequência e Atestados por Mês — Sistema Bolsa Família / MEC (${currentBimester.label})`
                    : 'Relatório Consolidado de Frequência e Atestados Mensais'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[0.72rem] font-bold text-[#71787b] block">ANO LETIVO 2027</span>
              <span className="text-[1.05rem] font-extrabold text-[#003440]">
                {reportMode === 'bimestral' ? currentBimester.period.toUpperCase() : 'OUTUBRO / 2027'}
              </span>
              <span className="text-[0.7rem] text-[#005035] font-bold block">
                Mínimo Legal: {classMetrics.minLegalPresencePercent}% ({classMetrics.isEducacaoInfantil ? 'Ed. Infantil' : 'Ens. Fundamental'})
              </span>
            </div>
          </div>

          {/* Class Identifiers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f3f4f2] p-3 rounded-xl border border-[#c0c8cb]/60 text-[0.85rem]">
            <div>
              <span className="text-[#71787b] font-bold block text-[0.72rem]">TURMA / ANO</span>
              <span className="font-extrabold text-[#003440] text-[0.98rem]">{classGroup.name}</span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-[0.72rem]">ETAPA / EXIGÊNCIA MEC</span>
              <span className="font-bold text-[#191c1b]">
                {classGroup.grade} (≥{classMetrics.minLegalPresencePercent}%)
              </span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-[0.72rem]">TURNO / SALA</span>
              <span className="font-bold text-[#191c1b]">{classGroup.shift} • {classGroup.room}</span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-[0.72rem]">ALERTAS LEGAIS NA TURMA</span>
              <span className={`font-black ${bimesterAlertsCount > 0 ? 'text-[#ba1a1a]' : 'text-[#005035]'}`}>
                {reportMode === 'bimestral' ? bimesterAlertsCount : classMetrics.criticalStudentsCount} estudante(s) &lt;{classMetrics.minLegalPresencePercent}%
              </span>
            </div>
          </div>

          {reportMode === 'bimestral' ? (
            <div className="border border-[#c0c8cb] rounded-xl overflow-hidden">
              <table className="w-full text-left text-[0.8rem] border-collapse">
                <thead>
                  <tr className="bg-[#003440] text-white font-bold">
                    <th className="py-2 px-2.5 w-10 text-center">Nº</th>
                    <th className="py-2 px-3">Estudante (RA / NIS Bolsa Família)</th>
                    {currentBimester.months.map((mName) => (
                      <th key={mName} className="py-2 px-2 text-center bg-[#004632] border-x border-white/15">
                        {mName.slice(0, 3)}. / 27
                        <span className="block text-[0.62rem] font-normal opacity-85">Faltas | Atest.</span>
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
                        r.isBelowLegalThreshold
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
                        <span className="text-[0.68rem] font-mono text-[#71787b]">
                          RA: {r.student.ra}-{r.student.digRa} • NIS: {r.nis}
                        </span>
                      </td>
                      {r.monthsBreakdown.map((mb) => (
                        <td key={mb.monthName} className="py-2 px-2 text-center border-x border-[#edeeec]">
                          <span className={`font-black ${mb.faltas > 0 ? 'text-[#ba1a1a]' : 'text-[#71787b]'}`}>
                            {mb.faltas}F
                          </span>
                          <span className="mx-1 text-[#c0c8cb]">|</span>
                          <span className={`font-black ${mb.atestados > 0 ? 'text-[#005035]' : 'text-[#71787b]'}`}>
                            {mb.atestados}A
                          </span>
                          <span className="block text-[0.64rem] text-[#71787b]">
                            ({mb.frequenciaPercent}% em {mb.diasLetivos}d)
                          </span>
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-black text-[#ba1a1a]">
                        {r.totalFaltasBimestre}
                      </td>
                      <td className="py-2 px-2 text-center font-black text-[#005035]">
                        {r.totalAtestadosBimestre}
                      </td>
                      <td className="py-2 px-2 text-center font-black text-[#003440]">
                        {r.frequenciaBimestrePercent}%
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        {r.isBelowLegalThreshold ? (
                          <span className="px-2 py-0.5 rounded text-[0.7rem] font-black bg-[#ffdad6] text-[#ba1a1a]">
                            ⚠️ Alerta &lt;{r.minLegalPresencePercent}%
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[0.7rem] font-black bg-[#a4f3ca]/60 text-[#003723]">
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
              <table className="w-full text-left text-[0.82rem] border-collapse">
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
                      OFFICIAL_OCTOBER_DAYS,
                      classGroup
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
                        <td className="py-2 px-2 text-center font-extrabold text-[#003440]">
                          {m.frequenciaPercent}%
                        </td>
                        <td className="py-2 px-3 text-center">
                          {m.isBelowLegalThreshold ? (
                            <span className="px-2 py-0.5 rounded text-[0.72rem] font-black bg-[#ffdad6] text-[#ba1a1a]">
                              ⚠️ Alerta &lt;{m.minLegalPresencePercent}%
                            </span>
                          ) : m.faltas === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[0.72rem] font-bold bg-[#a4f3ca]/60 text-[#003723]">
                              100% Presença
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[0.72rem] font-bold bg-[#f3f4f2] text-[#436370]">
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
            <span className="text-[0.75rem] font-bold text-[#71787b] block uppercase">
              Parecer Pedagógico e Observações Gerais
            </span>
            <p className="text-[0.9rem] text-[#191c1b] mt-1 leading-relaxed italic">
              "{classGroup.pedagogicalNotes}"
            </p>
          </div>

          {/* Signatures Area */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center text-[0.85rem]">
            <div>
              <div className="border-t border-[#191c1b] mx-4 mb-1"></div>
              <span className="font-bold text-[#003440] block">Docente Regente da Turma {classGroup.name}</span>
              <span className="text-[#71787b] text-[0.75rem]">Responsável pelo Lançamento</span>
            </div>
            <div>
              <div className="border-t border-[#191c1b] mx-4 mb-1"></div>
              <span className="font-bold text-[#003440] block">Direção / Coordenação Pedagógica</span>
              <span className="text-[#71787b] text-[0.75rem]">{SCHOOL_NAME}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#edeeec] flex justify-end no-print">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#edeeec] hover:bg-[#e7e8e6] text-[#003440] font-bold text-[0.95rem] cursor-pointer"
          >
            Fechar Visualização
          </button>
        </div>
      </div>
    </div>
  );
};

