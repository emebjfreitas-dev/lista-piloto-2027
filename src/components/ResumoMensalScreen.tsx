import React, { useState } from 'react';
import { ClassGroup, UserRole } from '../types';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getClassAttendanceMetrics } from '../utils/attendanceRules';

interface ResumoMensalScreenProps {
  currentClass: ClassGroup;
  allClasses: ClassGroup[];
  userRole?: UserRole;
  onSelectClass: (cls: ClassGroup) => void;
  onOpenReportPrint: () => void;
  onNavigateToSheet: () => void;
}

export const ResumoMensalScreen: React.FC<ResumoMensalScreenProps> = ({
  currentClass,
  allClasses,
  userRole = 'admin',
  onSelectClass,
  onOpenReportPrint,
  onNavigateToSheet,
}) => {
  const [currentMonthIndex, setCurrentMonthIndex] = useState(9); // October (index 9)
  const isPastMonth = currentMonthIndex < 9;
  const isLockedPastMonth = isPastMonth && userRole !== 'admin';
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const classMetrics = getClassAttendanceMetrics(currentClass, OFFICIAL_OCTOBER_DAYS);

  const [absences, setAbsences] = useState(classMetrics.totalFaltasTurma);
  const [savedAbsences, setSavedAbsences] = useState(classMetrics.totalFaltasTurma);
  const [pedagogicalNotes, setPedagogicalNotes] = useState(currentClass.pedagogicalNotes);
  const [showSaveFeedback, setShowSaveFeedback] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('11h42');

  const TOTAL_POSSIBLE_ATTENDANCE = classMetrics.totalDiasMatriculadosTurma || currentClass.totalStudents * currentClass.classesHeld || 640;
  const currentPresences = Math.max(0, TOTAL_POSSIBLE_ATTENDANCE - savedAbsences);
  const currentRate = Math.min(100, Math.max(0, Math.round((currentPresences / TOTAL_POSSIBLE_ATTENDANCE) * 100)));
  const diffFromSchoolGoal = currentRate - 85;

  const handlePrevMonth = () => {
    setCurrentMonthIndex((prev) => (prev > 0 ? prev - 1 : 11));
  };

  const handleNextMonth = () => {
    setCurrentMonthIndex((prev) => (prev < 11 ? prev + 1 : 0));
  };

  const handleRecalculate = () => {
    setSavedAbsences(absences);
    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setLastSavedTime(nowTime);
    setShowSaveFeedback(true);
    setTimeout(() => {
      setShowSaveFeedback(false);
    }, 2500);
  };

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-3.5 sm:space-y-4 pb-12 animate-gentle-fade">
      {/* Month & Class Navigator */}
      <div className="card-welcoming bg-white p-4 border border-black/[0.06]">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handlePrevMonth}
            aria-label="Mês anterior"
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[24px]">chevron_left</span>
          </button>

          <div className="text-center flex-1 min-w-0">
            <span className="inline-flex items-center justify-center gap-1.5 text-[1.15rem] sm:text-[1.35rem] font-bold text-[#1d1d1f]">
              <span className="material-symbols-outlined text-[20px] text-[#0071e3]">calendar_today</span>
              {months[currentMonthIndex]} de 2027
            </span>
            <div className="mt-1">
              <select
                value={currentClass.id}
                onChange={(e) => {
                  const target = allClasses.find((c) => c.id === e.target.value);
                  if (target) onSelectClass(target);
                }}
                className="px-3 py-1 bg-[#f5f5f7] text-[#1d1d1f] text-[0.8rem] sm:text-[0.85rem] font-semibold rounded-full border border-black/[0.08] cursor-pointer max-w-[260px] sm:max-w-sm truncate"
              >
                <optgroup label="☀️ Turno Manhã (G4, G5, 1º ao 5º)">
                  {allClasses
                    .filter((c) => c.shift === 'Turno Manhã')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Turma {c.name} — {c.grade} ({c.totalStudents} estudantes)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="⛅ Turno Tarde (G4, G5, 1º ao 5º)">
                  {allClasses
                    .filter((c) => c.shift === 'Turno Tarde')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Turma {c.name} — {c.grade} ({c.totalStudents} estudantes)
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
          </div>

          <button
            onClick={handleNextMonth}
            aria-label="Próximo mês"
            className="min-h-[52px] min-w-[52px] rounded-xl bg-white hover:bg-[#e7e8e6] text-[#003440] flex items-center justify-center transition-transform active:scale-95 shadow-xs cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[32px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Big Frequency Rate Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#edeeec]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[0.95rem] font-bold text-[#436370] block">
              Taxa de Frequência Geral (Mensal)
            </span>
            <div className="flex items-baseline gap-2.5 mt-1">
              <span className="text-[2.5rem] font-extrabold text-[#003440] leading-none">
                {currentRate}%
              </span>
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[0.825rem] font-bold ${
                  currentRate >= 85
                    ? 'bg-[#a4f3ca] text-[#003723]'
                    : 'bg-[#ffdad6] text-[#ba1a1a]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {currentRate >= 85 ? 'verified' : 'warning'}
                </span>
                {currentRate >= 90
                  ? 'Excelente índice'
                  : currentRate >= 85
                  ? 'Dentro da meta'
                  : 'Abaixo da meta'}
              </span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#c3e5f4] flex items-center justify-center text-[#003440] shadow-xs">
            <span className="material-symbols-outlined text-[32px]">pie_chart</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="w-full bg-[#e1e3e1] h-4 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-[#1e4b58] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${currentRate}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center mt-2.5 text-[0.875rem] font-semibold text-[#41484b]">
            <span>Meta da Escola: 85%</span>
            <span className={diffFromSchoolGoal >= 0 ? 'text-[#005035] font-bold' : 'text-[#ba1a1a] font-bold'}>
              {diffFromSchoolGoal >= 0 ? `+${diffFromSchoolGoal}% acima da meta` : `${diffFromSchoolGoal}% abaixo da meta`}
            </span>
          </div>
        </div>
      </div>

      {/* 3 Metric Tiles Row */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-[#edeeec] flex flex-col justify-between">
          <div className="w-9 h-9 rounded-xl bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mb-1">
            <span className="material-symbols-outlined text-[20px]">person_off</span>
          </div>
          <div>
            <span className="text-[0.825rem] font-bold text-[#436370] block leading-tight">
              Total Faltas
            </span>
            <span className="text-[1.5rem] text-[#ba1a1a] font-extrabold block mt-0.5">
              {savedAbsences}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-[#edeeec] flex flex-col justify-between">
          <div className="w-9 h-9 rounded-xl bg-[#a4f3ca] text-[#003723] flex items-center justify-center mb-1">
            <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
          </div>
          <div>
            <span className="text-[0.825rem] font-bold text-[#436370] block leading-tight">
              Presenças
            </span>
            <span className="text-[1.5rem] text-[#003440] font-extrabold block mt-0.5">
              {currentPresences}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-[#edeeec] flex flex-col justify-between">
          <div className="w-9 h-9 rounded-xl bg-[#c3e5f4] text-[#001f29] flex items-center justify-center mb-1">
            <span className="material-symbols-outlined text-[20px]">school</span>
          </div>
          <div>
            <span className="text-[0.825rem] font-bold text-[#436370] block leading-tight">
              Aulas Dadas
            </span>
            <span className="text-[1.5rem] text-[#003440] font-extrabold block mt-0.5">
              {currentClass.classesHeld}
            </span>
          </div>
        </div>
      </div>

      {/* Desempenho por Semana (Presença) */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#edeeec]">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[24px] text-[#003440]">bar_chart</span>
          <h3 className="text-[1.125rem] font-bold text-[#003440]">
            Desempenho por Semana (Presença)
          </h3>
        </div>

        <div className="space-y-3.5 mt-2">
          {currentClass.weeklyPerformance.map((weekData, idx) => (
            <div key={idx}>
              <div className="flex justify-between items-center mb-1.5 text-[0.875rem]">
                <span className="text-[#191c1b] font-semibold">{weekData.week}</span>
                <span className="font-extrabold text-[#003440]">{weekData.rate}%</span>
              </div>
              <div className="w-full bg-[#e1e3e1] h-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#003440] rounded-full transition-all duration-300"
                  style={{ width: `${weekData.rate}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ajuste ou Inserção Manual de Faltas */}
      <div className="bg-[#c3e5f4]/40 rounded-2xl p-5 shadow-sm border border-[#aaccda]/60">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#c3e5f4] text-[#001f29] flex items-center justify-center shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-[24px]">edit_note</span>
          </div>
          <div>
            <h3 className="text-[1.125rem] font-bold text-[#003440] leading-tight">
              Ajuste ou Inserção Manual de Faltas
            </h3>
            <p className="text-[0.875rem] text-[#41484b] mt-1 font-medium leading-snug">
              Se preferir digitar diretamente o total de faltas do mês somadas do caderno físico:
            </p>
          </div>
        </div>

        <div className="mt-4 bg-white rounded-2xl p-5 shadow-sm border border-[#edeeec]">
          {isLockedPastMonth && (
            <div className="mb-3 p-3 rounded-xl bg-[#fff4e5] border border-[#7a4100]/40 text-[#7a4100] text-[0.82rem] font-extrabold text-center">
              Mês passado ({months[currentMonthIndex]}) encerrado — somente perfil ADMIN pode alterar meses passados.
            </div>
          )}
          <label className="text-[1rem] font-bold text-[#191c1b] block text-center mb-3">
            Quantas faltas foram registradas neste mês?
          </label>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => !isLockedPastMonth && setAbsences((prev) => Math.max(0, prev - 1))}
              disabled={isLockedPastMonth}
              aria-label="Diminuir faltas"
              className="min-h-[54px] min-w-[54px] rounded-xl bg-[#e7e8e6] hover:bg-[#e1e3e1] active:bg-[#c3e5f4] text-[#003440] flex items-center justify-center font-bold text-2xl active:scale-95 transition-transform shadow-xs cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
              type="button"
            >
              <span className="material-symbols-outlined text-[32px]">remove</span>
            </button>

            <div className="relative flex-1 max-w-[140px]">
              <input
                type="number"
                min="0"
                disabled={isLockedPastMonth}
                max={TOTAL_POSSIBLE_ATTENDANCE}
                value={absences}
                onChange={(e) => !isLockedPastMonth && setAbsences(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full h-[54px] text-center text-[2rem] font-extrabold text-[#003440] bg-[#f9faf8] rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#003440]/20 border border-[#c0c8cb] shadow-inner px-2 disabled:opacity-50"
              />
            </div>

            <button
              onClick={() => !isLockedPastMonth && setAbsences((prev) => prev + 1)}
              disabled={isLockedPastMonth}
              aria-label="Aumentar faltas"
              className="min-h-[54px] min-w-[54px] rounded-xl bg-[#e7e8e6] hover:bg-[#e1e3e1] active:bg-[#c3e5f4] text-[#003440] flex items-center justify-center font-bold text-2xl active:scale-95 transition-transform shadow-xs cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
              type="button"
            >
              <span className="material-symbols-outlined text-[32px]">add</span>
            </button>
          </div>

          <p className="text-center text-[0.825rem] text-[#71787b] mt-2 font-medium">
            Toque nos botões de + e - ou clique no número para digitar.
          </p>

          <button
            onClick={handleRecalculate}
            disabled={isLockedPastMonth}
            type="button"
            className="mt-4 w-full min-h-[52px] px-6 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.95rem] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-md cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-[24px]">calculate</span>
            <span>Recalcular e Atualizar Indicadores</span>
          </button>
        </div>
      </div>

      {/* Comentários pedagógicos do mês */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#edeeec]">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-[24px] text-[#003440]">history_edu</span>
          <label className="text-[1.05rem] font-bold text-[#003440]" htmlFor="monthly-notes">
            Comentários pedagógicos de {months[currentMonthIndex]}:
          </label>
        </div>
        <textarea
          id="monthly-notes"
          rows={3}
          value={pedagogicalNotes}
          onChange={(e) => setPedagogicalNotes(e.target.value)}
          placeholder="Escreva anotações importantes sobre o comportamento, feira de ciências ou avisos sobre os estudantes..."
          className="w-full p-3 rounded-xl bg-[#f3f4f2] text-[#191c1b] text-[0.95rem] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#003440]/20 border border-[#c0c8cb] resize-none leading-relaxed"
        />
        <div className="flex justify-end mt-2">
          <span className="text-[0.8rem] font-semibold text-[#71787b]">Salvo automaticamente na Planilha</span>
        </div>
      </div>

      {/* Confirmation & Status Banner */}
      <div
        className={`bg-[#005035]/15 rounded-2xl p-4 flex items-center gap-3 border border-[#a4f3ca] transition-all duration-300 ${
          showSaveFeedback ? 'ring-2 ring-[#005035]' : ''
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-[#005035] text-white flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">check</span>
        </div>
        <div className="flex-1">
          <span className="text-[0.95rem] font-bold text-[#003723] block leading-snug">
            Dados de {months[currentMonthIndex]} registrados e sincronizados na Planilha Google!
          </span>
          <span className="text-[0.8rem] text-[#436370] block">
            Turma {currentClass.name} ({currentClass.room} • Classe SED {currentClass.classeSedCode || '—'}) • Regente: {currentClass.pronoun || 'PROFESSORA'} {currentClass.teacherName || 'Docente Regente'} ({lastSavedTime})
          </span>
        </div>
      </div>

      {/* Action Buttons: Relatório Bolsa Família & Planilha Google (Exclusivo Admin) */}
      {userRole === 'admin' && (
        <div className="space-y-2.5 pt-1">
          <button
            onClick={onOpenReportPrint}
            type="button"
            className="w-full min-h-[56px] px-6 rounded-xl bg-[#e7e8e6] hover:bg-[#c3e5f4] text-[#003440] font-bold text-[0.95rem] flex items-center justify-center gap-2.5 shadow-sm transition-transform active:scale-[0.98] cursor-pointer border border-[#c0c8cb]/60"
          >
            <span className="material-symbols-outlined text-[26px] text-[#003440]">assessment</span>
            <span>Abrir Relatório Oficial do Bolsa Família / Fechamento (Exclusivo Admin)</span>
          </button>

          <button
            onClick={onNavigateToSheet}
            type="button"
            className="w-full min-h-[54px] px-6 rounded-xl bg-white hover:bg-[#f3f4f2] text-[#005035] font-bold text-[0.95rem] flex items-center justify-center gap-2.5 shadow-sm transition-transform active:scale-[0.98] cursor-pointer border border-[#a4f3ca]"
          >
            <span className="material-symbols-outlined text-[24px]">table_chart</span>
            <span>Conferir Dados no Banco da Planilha Google</span>
          </button>
        </div>
      )}
    </div>
  );
};
