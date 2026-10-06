import React from 'react';
import { ClassGroup } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME, CITY_NAME, SECRETARY_NAME, OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentAttendanceMetrics, getClassAttendanceMetrics } from '../utils/attendanceRules';

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
  if (!isOpen) return null;

  const classMetrics = getClassAttendanceMetrics(classGroup, OFFICIAL_OCTOBER_DAYS);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-[#edeeec] p-6 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Controls */}
        <div className="flex items-center justify-between pb-4 border-b border-[#edeeec] no-print">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-[#003440]">picture_as_pdf</span>
            <h3 className="text-[1.25rem] font-bold text-[#003440]">
              Relatório Mensal Oficial para Impressão
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              type="button"
              className="px-4 py-2 bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.9rem] rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">print</span>
              <span>Imprimir / Gerar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#41484b] flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="overflow-y-auto py-6 px-4 bg-white text-[#191c1b] space-y-6 print:p-0">
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
                className="h-16 w-auto object-contain"
              />
              <div>
                <span className="text-[0.8rem] font-extrabold text-[#71787b] uppercase tracking-wide block">
                  {CITY_NAME} • {SECRETARY_NAME}
                </span>
                <h1 className="text-[1.25rem] font-extrabold text-[#003440] uppercase tracking-wide">
                  {SCHOOL_NAME}
                </h1>
                <p className="text-[0.85rem] text-[#436370] font-bold">
                  Diário Oficial de Classe e Frequência Mensal
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[0.75rem] font-bold text-[#71787b] block">ANO LETIVO 2027</span>
              <span className="text-[1.125rem] font-extrabold text-[#003440]">OUTUBRO / 2027</span>
              <span className="text-[0.725rem] text-[#005035] font-bold block">20 DIAS LETIVOS SME</span>
            </div>
          </div>

          {/* Class Identifiers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f3f4f2] p-3 rounded-xl border border-[#c0c8cb]/60 text-[0.875rem]">
            <div>
              <span className="text-[#71787b] font-bold block text-[0.75rem]">TURMA / ANO</span>
              <span className="font-extrabold text-[#003440] text-[1rem]">{classGroup.name}</span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-[0.75rem]">ETAPA</span>
              <span className="font-bold text-[#191c1b]">{classGroup.grade}</span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-[0.75rem]">TURNO / SALA</span>
              <span className="font-bold text-[#191c1b]">{classGroup.shift} • {classGroup.room}</span>
            </div>
            <div>
              <span className="text-[#71787b] font-bold block text-[0.75rem]">PROFESSORA REGENTE</span>
              <span className="font-bold text-[#003440]">Profª Maria Helena</span>
            </div>
          </div>

          {/* Indicators Summary Table */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-[#f9faf8] rounded-xl border border-[#c0c8cb] text-center">
              <span className="text-[0.75rem] font-bold text-[#71787b] block">ÍNDICE DE FREQUÊNCIA</span>
              <span className="text-[1.75rem] font-extrabold text-[#003440]">{classMetrics.presenceRate}%</span>
              <span className="text-[0.75rem] text-[#005035] font-bold block">Pelo Recorte da Matrícula</span>
            </div>
            <div className="p-3 bg-[#f9faf8] rounded-xl border border-[#c0c8cb] text-center">
              <span className="text-[0.75rem] font-bold text-[#71787b] block">TOTAL DE FALTAS</span>
              <span className="text-[1.75rem] font-extrabold text-[#ba1a1a]">{classMetrics.totalFaltasTurma}</span>
              <span className="text-[0.75rem] text-[#71787b] font-medium block">Atestados: {classMetrics.totalAtestadosTurma}</span>
            </div>
            <div className="p-3 bg-[#f9faf8] rounded-xl border border-[#c0c8cb] text-center">
              <span className="text-[0.75rem] font-bold text-[#71787b] block">TOTAL DE ESTUDANTES</span>
              <span className="text-[1.75rem] font-extrabold text-[#003440]">{classGroup.totalStudents}</span>
              <span className="text-[0.75rem] text-[#71787b] font-medium block">{classMetrics.diasLetivosMes} dias letivos no mês</span>
            </div>
          </div>

          {/* Compact Students Table */}
          <div className="border border-[#c0c8cb] rounded-xl overflow-hidden">
            <table className="w-full text-left text-[0.85rem] border-collapse">
              <thead>
                <tr className="bg-[#edeeec] text-[#003440] font-bold border-b border-[#c0c8cb]">
                  <th className="py-2 px-3 w-12 text-center">Nº</th>
                  <th className="py-2 px-3">Nome do Estudante</th>
                  <th className="py-2 px-2 text-center">Dias (Recorte)</th>
                  <th className="py-2 px-2 text-center">Faltas</th>
                  <th className="py-2 px-2 text-center">Atestados</th>
                  <th className="py-2 px-2 text-center">% Freq.</th>
                  <th className="py-2 px-3 text-center w-28">Situação</th>
                </tr>
              </thead>
              <tbody>
                {classGroup.students.map((student, idx) => {
                  const m = getStudentAttendanceMetrics(student, classGroup.classesHeld || 20, OFFICIAL_OCTOBER_DAYS);
                  const isCritical = m.faltas >= 4;
                  return (
                    <tr
                      key={student.id}
                      className={`border-b border-[#edeeec] ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-[#f9faf8]'
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
                        {isCritical ? (
                          <span className="px-2 py-0.5 rounded text-[0.75rem] font-bold bg-[#ffdad6] text-[#ba1a1a]">
                            Alerta (≥4)
                          </span>
                        ) : m.faltas === 0 ? (
                          <span className="px-2 py-0.5 rounded text-[0.75rem] font-bold bg-[#a4f3ca]/60 text-[#003723]">
                            100% Presença
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[0.75rem] font-bold bg-[#f3f4f2] text-[#436370]">
                            Regular
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
              <span className="font-bold text-[#003440] block">Profª Maria Helena</span>
              <span className="text-[#71787b] text-[0.75rem]">Docente Responsável</span>
            </div>
            <div>
              <div className="border-t border-[#191c1b] mx-4 mb-1"></div>
              <span className="font-bold text-[#003440] block">Coordenação Pedagógica</span>
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
