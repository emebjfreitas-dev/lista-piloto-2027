import React, { useState, useMemo } from 'react';
import { ClassGroup, UserRole, AttendanceWindowConfig } from '../types';
import { downloadSpreadsheetXLSX, evaluateAttendanceLaunchWindow } from '../services/db';

interface MinhasTurmasScreenProps {
  classes: ClassGroup[];
  userRole: UserRole;
  assignedClassId: string;
  assignedClassIds?: string[];
  attendanceWindowConfig: AttendanceWindowConfig;
  onChangeRole: (role: UserRole) => void;
  onChangeAssignedClassId: (classId: string) => void;
  onSelectClassForDetails: (classGroup: ClassGroup) => void;
  onSelectClassForMonthlyAttendance: (classGroup: ClassGroup) => void;
  onOpenClassStudentList?: (classGroup: ClassGroup) => void;
  onOpenNewClassModal: () => void;
  onOpenConfigDaysModal?: () => void;
  onNavigateToSheet: () => void;
  onNavigateToAcessos?: () => void;
}

export const MinhasTurmasScreen: React.FC<MinhasTurmasScreenProps> = ({
  classes,
  userRole,
  assignedClassId,
  assignedClassIds = [],
  attendanceWindowConfig,
  onChangeRole,
  onChangeAssignedClassId,
  onSelectClassForDetails,
  onSelectClassForMonthlyAttendance,
  onOpenClassStudentList,
  onOpenNewClassModal,
  onOpenConfigDaysModal,
  onNavigateToSheet,
  onNavigateToAcessos,
}) => {
  const [selectedShift, setSelectedShift] = useState<'Turno Manhã' | 'Turno Tarde'>('Turno Manhã');
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadFeedback, setDownloadFeedback] = useState(false);

  const windowEval = evaluateAttendanceLaunchWindow(attendanceWindowConfig);
  const isLaunchButtonOpen = windowEval.isAllowedToLaunch;

  // Flexible search for senior teachers (supports G4, Grupo 04, 1A, 1º Ano A)
  const cleanSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Role-based class visibility:
  // - ADMIN: all 40 classes (full access)
  // - USUÁRIO (PEB I): ONLY their assigned class(es)
  // - PEB II: all 40 classes (view-only)
  const allowedClassIdsForUsuario = useMemo(() => {
    const valid = assignedClassIds.filter((id) => id && id !== 'all');
    if (valid.length > 0) return valid;
    return [assignedClassId];
  }, [assignedClassIds, assignedClassId]);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (userRole === 'usuario') {
        return allowedClassIdsForUsuario.includes(c.id);
      }

      const matchesShift = c.shift === selectedShift;
      const cleanClassName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanRoom = c.room.toLowerCase().replace(/[^a-z0-9]/g, '');

      const matchesAlias =
        (cleanSearch.startsWith('g4') && cleanClassName.includes('grupo04')) ||
        (cleanSearch.startsWith('g5') && cleanClassName.includes('grupo05'));

      const matchesSearch =
        cleanSearch === '' ||
        cleanClassName.includes(cleanSearch) ||
        cleanRoom.includes(cleanSearch) ||
        matchesAlias;

      return matchesShift && matchesSearch;
    });
  }, [classes, userRole, assignedClassId, selectedShift, cleanSearch]);

  const handleDownloadSheet = () => {
    downloadSpreadsheetXLSX(classes);
    setDownloadFeedback(true);
    setTimeout(() => setDownloadFeedback(false), 3500);
  };

  return (
    <div className="flex flex-col w-full max-w-xl md:max-w-5xl lg:max-w-7xl xl:max-w-[1780px] mx-auto space-y-5 pb-36 animate-gentle-fade">
      {/* Download Alert Toast */}
      {downloadFeedback && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-[#003723] text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-[#a4f3ca]">
            <span className="material-symbols-outlined text-[32px] text-[#a4f3ca]">download_done</span>
            <div>
              <p className="font-extrabold text-[1rem]">Planilha Oficial 2027 Gerada!</p>
              <p className="text-[0.85rem] text-[#a4f3ca]">
                Arquivo com todas as 40 turmas da EMEB baixado com sucesso.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Control Row: Perfil de Acesso Ativo visible ONLY for ADMIN */}
      <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-12 xl:gap-5 xl:items-stretch">
        {userRole === 'admin' && (
          <section className="xl:col-span-5 card-welcoming bg-white rounded-2xl p-5 border border-[#003440]/12 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[0.78rem] font-extrabold text-[#003440] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#005035]">admin_panel_settings</span>
                <span>Simulador de Perfil (Admin)</span>
              </span>
              <span className="text-[0.72rem] font-bold text-[#005035]">
                Acesso Pleno · 40 Turmas
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onChangeRole('admin')}
                className="p-2.5 rounded-xl font-extrabold text-[0.85rem] flex flex-col items-center justify-center gap-1 border-2 cursor-pointer transition-all bg-[#003440] text-white border-[#003440] shadow-sm"
              >
                <span className="material-symbols-outlined text-[22px]">verified_user</span>
                <span>ADMIN</span>
                <span className="text-[0.65rem] font-semibold opacity-80">Acesso Pleno</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeRole('usuario')}
                className="p-2.5 rounded-xl font-extrabold text-[0.85rem] flex flex-col items-center justify-center gap-1 border-2 cursor-pointer transition-all bg-[#f3f4f2] text-[#41484b] border-[#c0c8cb] hover:bg-[#e7e8e6]"
              >
                <span className="material-symbols-outlined text-[22px]">person</span>
                <span>PEB I</span>
                <span className="text-[0.65rem] font-semibold opacity-80 truncate max-w-full">
                  {classes.find((c) => c.id === assignedClassId)?.name || 'Simular Turma'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onChangeRole('peb2')}
                className="p-2.5 rounded-xl font-extrabold text-[0.85rem] flex flex-col items-center justify-center gap-1 border-2 cursor-pointer transition-all bg-[#f3f4f2] text-[#41484b] border-[#c0c8cb] hover:bg-[#e7e8e6]"
              >
                <span className="material-symbols-outlined text-[22px]">visibility</span>
                <span>PEB II</span>
                <span className="text-[0.65rem] font-semibold opacity-80">Simular Leitura</span>
              </button>
            </div>

            {/* Seletor rápido da Turma para quando o Admin clicar em "PEB I" */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#edeeec]">
              <span className="text-[0.72rem] font-bold text-[#41484b]">
                Turma ao testar PEB I:
              </span>
              <select
                value={assignedClassId}
                onChange={(e) => onChangeAssignedClassId(e.target.value)}
                className="px-2.5 py-1 rounded-lg bg-[#f3f4f2] border border-[#c0c8cb] text-[#003440] font-extrabold text-[0.76rem] cursor-pointer"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.shift.replace('Turno ', '')})
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* Senior Friendly Top Card */}
        <section
          className={`${
            userRole === 'admin' ? 'xl:col-span-7' : 'xl:col-span-12'
          } card-welcoming bg-white rounded-2xl p-5 border border-[#003440]/12 space-y-4 flex flex-col justify-between`}
        >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[0.75rem] font-extrabold uppercase tracking-wider text-[#005035] block mb-0.5">
              {userRole === 'usuario'
                ? 'Acesso Exclusivo à Sua Turma · Ano Letivo 2027'
                : 'Ano Letivo 2027 · 40 Turmas Oficiais'}
            </span>
            <h1 className="text-[1.45rem] font-extrabold text-[#003440] leading-tight">
              {userRole === 'usuario' ? 'Minha Turma Regente' : 'Quadro Oficial de Turmas'}
            </h1>
            <p className="text-[0.92rem] text-[#374346] mt-1 font-medium leading-relaxed">
              {userRole === 'admin' &&
                'Acesso pleno: gerencie faltas, atestados, grade de dados de cada estudante e planilha geral.'}
              {userRole === 'usuario' &&
                'Gerencie as faltas, atestados e a grade interativa de dados dos estudantes da sua turma.'}
              {userRole === 'peb2' &&
                'Modo PEB II (Somente Visualização): consulte qualquer uma das 40 turmas e veja a grade de dados dos estudantes.'}
            </p>
          </div>

          {userRole === 'admin' && (
            <button
              type="button"
              onClick={onOpenNewClassModal}
              className="px-3 py-2 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#003440] font-extrabold text-[0.8rem] border border-[#c0c8cb] flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Nova Turma</span>
            </button>
          )}
        </div>

          {userRole === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              <button
                onClick={handleDownloadSheet}
                type="button"
                className="w-full min-h-[56px] bg-[#005035] hover:bg-[#003723] text-white font-extrabold text-[0.95rem] px-3 rounded-2xl flex items-center justify-center gap-2.5 shadow-md active:scale-98 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[24px]">table_chart</span>
                <span>Baixar Planilha (.xlsx - 200 Dias)</span>
              </button>

              {onOpenConfigDaysModal && (
                <button
                  onClick={onOpenConfigDaysModal}
                  type="button"
                  className="w-full min-h-[56px] bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#003723] border-2 border-[#005035]/30 font-extrabold text-[0.92rem] px-3 rounded-2xl flex items-center justify-center gap-2 shadow-2xs active:scale-98 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[24px]">edit_calendar</span>
                  <span>Configurar 200 Dias & Links</span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Clear Banner Explaining Attendance Launch Window vs Always-Available View Students */}
      <div
        className={`rounded-2xl p-4 border flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
          isLaunchButtonOpen
            ? 'bg-[#eaf6ef]/90 border-[#005035]/25 text-[#003723]'
            : 'bg-[#fff9f2] border-[#7a4100]/25 text-[#374346]'
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`material-symbols-outlined text-[26px] shrink-0 mt-0.5 ${
              isLaunchButtonOpen ? 'text-[#005035]' : 'text-[#7a4100]'
            }`}
          >
            {isLaunchButtonOpen ? 'lock_open' : 'event_upcoming'}
          </span>
          <div className="space-y-0.5">
            <p className="font-black text-[0.95rem] text-[#003440]">
              {isLaunchButtonOpen
                ? 'Período de Lançamento de Faltas ABERTO • Salvamento 100% Automático na Planilha'
                : 'Botão "Lançar Faltas" abre no Último Dia Letivo do mês e nos 2 Primeiros do próximo mês'}
            </p>
            <p className="text-[0.82rem] font-semibold">
              • <strong>Visualizar Estudantes:</strong> Disponível o tempo todo (24h).{' '}
              • <strong>Status do Lançamento:</strong> {windowEval.reasonLabel}.
            </p>
          </div>
        </div>

        {userRole === 'admin' && onNavigateToAcessos && (
          <button
            type="button"
            onClick={onNavigateToAcessos}
            className="min-h-[44px] px-4 rounded-xl bg-[#003440] hover:bg-[#004c5c] text-white font-black text-[0.82rem] flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">key</span>
            <span>
              {attendanceWindowConfig.exceptionalOverrideOpen
                ? 'Gerenciar Abertura Excepcional (Ativa)'
                : 'Abrir Lançamento Excepcionalmente (Aba Acessos)'}
            </span>
          </button>
        )}
      </div>

      {/* Big Shift Selector & Search: Stacked on Mobile, Side-by-Side on PC 1920x1080 */}
      {userRole !== 'usuario' && (
        <div className="space-y-3 xl:space-y-0 xl:grid xl:grid-cols-12 xl:gap-4 xl:items-center">
          <div className="grid grid-cols-2 gap-3 xl:col-span-5">
            <button
              onClick={() => setSelectedShift('Turno Manhã')}
              type="button"
              className={`min-h-[60px] rounded-2xl p-3 flex items-center justify-center gap-2.5 font-extrabold text-[1.1rem] transition-all cursor-pointer border-2 ${
                selectedShift === 'Turno Manhã'
                  ? 'bg-[#003440] text-white border-[#003440] shadow-md scale-[1.01]'
                  : 'bg-white text-[#41484b] border-[#c0c8cb] hover:bg-[#f3f4f2]'
              }`}
            >
              <span className="text-[24px]">☀️</span>
              <span>MANHÃ (20)</span>
            </button>

            <button
              onClick={() => setSelectedShift('Turno Tarde')}
              type="button"
              className={`min-h-[60px] rounded-2xl p-3 flex items-center justify-center gap-2.5 font-extrabold text-[1.1rem] transition-all cursor-pointer border-2 ${
                selectedShift === 'Turno Tarde'
                  ? 'bg-[#003440] text-white border-[#003440] shadow-md scale-[1.01]'
                  : 'bg-white text-[#41484b] border-[#c0c8cb] hover:bg-[#f3f4f2]'
              }`}
            >
              <span className="text-[24px]">⛅</span>
              <span>TARDE (20)</span>
            </button>
          </div>

          <div className="relative xl:col-span-7">
            <span className="material-symbols-outlined absolute left-4 text-[#71787b] text-[24px] top-4">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar turma rápido (ex: GRUPO 04 A, G4B, 1º ANO B, 4º G)..."
              className="w-full min-h-[60px] pl-12 pr-10 bg-white text-[#191c1b] text-[1.05rem] rounded-2xl border-2 border-[#c0c8cb] focus:border-[#003440] focus:outline-none shadow-xs font-semibold placeholder:text-[#71787b]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3.5 top-4 text-[#71787b] hover:text-[#191c1b] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[24px]">cancel</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* List of Classes: 1 col Mobile, 2 cols Tablet/Laptop, 3 cols Full HD 1920x1080 21" */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredClasses.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-[#edeeec] md:col-span-2 xl:col-span-3">
            <p className="text-[1.1rem] font-bold text-[#41484b]">
              Nenhuma turma encontrada com a busca "{searchTerm}".
            </p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-3 px-4 py-2 bg-[#003440] text-white font-bold rounded-xl text-[0.95rem] cursor-pointer"
            >
              Mostrar Todas as Turmas
            </button>
          </div>
        ) : (
          filteredClasses.map((cls) => {
            const isInfantil = cls.name.startsWith('GRUPO');
            const shortBadge = isInfantil
              ? cls.name.replace(/^GRUPO\s*0?/i, 'G').replace(/\s+/g, '')
              : cls.name.replace(/\s*ANO\s*/i, '');

            return (
              <div
                key={cls.id}
                className="card-welcoming bg-white rounded-2xl p-5 border border-[#003440]/12 flex flex-col justify-between gap-4"
              >
                {/* Class Details Header */}
                <div
                  onClick={() => {
                    onSelectClassForDetails(cls);
                  }}
                  className="cursor-pointer flex items-start gap-3.5 min-w-0 group"
                >
                  <div
                    className={`w-13 h-13 rounded-2xl flex items-center justify-center font-black text-[1.08rem] tracking-tight shrink-0 transition-transform group-hover:scale-[1.03] ${
                      isInfantil
                        ? 'bg-[#e8f8ef] text-[#005035] border border-[#005035]/20'
                        : 'bg-[#e6f4fa] text-[#003440] border border-[#003440]/15'
                    }`}
                  >
                    {shortBadge}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-[1.2rem] font-extrabold text-[#003440] group-hover:text-[#005035] transition-colors leading-tight">
                        {cls.name}
                      </h2>
                      <span className="font-mono font-extrabold text-[0.82rem] text-[#005035] tabular-nums shrink-0">
                        {cls.presenceRate}% presença
                      </span>
                    </div>
                    <p className="text-[0.84rem] text-[#436370] font-semibold mt-0.5">
                      {cls.grade} · {cls.room}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[0.78rem] font-bold text-[#374346] tabular-nums">
                      <span>{cls.totalStudents} estudantes</span>
                      <span aria-hidden="true" className="text-[#a8b5b9]">·</span>
                      <span className={cls.monthlyAbsences > 0 ? 'text-[#ba1a1a]' : 'text-[#005035]'}>
                        {cls.monthlyAbsences} faltas no mês
                      </span>
                    </div>
                  </div>
                </div>

                {/* Clear, Cohesive & Intelligent Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-3.5 border-t border-[#003440]/8">
                  {/* Botão 1: Ver Estudantes (SEMPRE DISPONÍVEL O TEMPO TODO) */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectClassForDetails(cls);
                    }}
                    className="w-full min-h-[58px] px-3 py-2.5 rounded-xl bg-[#003440] hover:bg-[#004c5c] text-white flex items-center justify-between gap-2 shadow-xs cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2 min-w-0 text-left">
                      <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px] text-[#bdeafa]">
                          badge
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="block font-extrabold text-[0.86rem] leading-tight">
                          Ver Estudantes
                        </span>
                        <span className="block text-[0.7rem] text-[#bdeafa] font-semibold leading-tight mt-0.5">
                          {cls.totalStudents} fichas • Livre 24h
                        </span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-[#bdeafa] shrink-0">
                      visibility
                    </span>
                  </button>

                  {/* Botão 2: Lançar Faltas / Consultar Frequência */}
                  {userRole === 'peb2' ? (
                    <button
                      type="button"
                      onClick={() => onSelectClassForMonthlyAttendance(cls)}
                      className="w-full min-h-[58px] px-3 py-2.5 rounded-xl bg-[#7a4100] hover:bg-[#5c3000] text-white flex items-center justify-between gap-2 shadow-xs cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-2 min-w-0 text-left">
                        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[20px]">
                            fact_check
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="block font-extrabold text-[0.86rem] leading-tight">
                            Ver Frequência
                          </span>
                          <span className="block text-[0.7rem] text-white/85 font-semibold leading-tight mt-0.5">
                            Modo Leitura
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[18px] shrink-0 opacity-90">
                        arrow_forward
                      </span>
                    </button>
                  ) : isLaunchButtonOpen ? (
                    <button
                      type="button"
                      onClick={() => onSelectClassForMonthlyAttendance(cls)}
                      className="w-full min-h-[58px] px-3 py-2.5 rounded-xl bg-[#005035] hover:bg-[#003824] text-white flex items-center justify-between gap-2 shadow-xs cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-2 min-w-0 text-left">
                        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[20px] text-[#a4f3ca]">
                            edit_calendar
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="block font-extrabold text-[0.86rem] leading-tight">
                            Lançar Faltas
                          </span>
                          <span className="block text-[0.7rem] text-[#a4f3ca] font-semibold leading-tight mt-0.5">
                            Aberto • Salva auto
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[18px] text-[#a4f3ca] shrink-0">
                        arrow_forward
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="O lançamento de faltas abre no último dia letivo do mês e nos 2 primeiros dias letivos do próximo mês (ou mediante liberação excepcional na aba Acessos)."
                      className="w-full min-h-[58px] px-3 py-2.5 rounded-xl bg-[#f4f7f5] text-[#566366] border border-[#c0c8cb] flex items-center justify-between gap-2 cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2 min-w-0 text-left">
                        <div className="w-8 h-8 rounded-lg bg-[#e2e8e5] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[19px] text-[#566366]">
                            lock_clock
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="block font-extrabold text-[0.85rem] text-[#41484b] leading-tight">
                            Lançar Faltas
                          </span>
                          <span className="block text-[0.68rem] text-[#566366] font-semibold leading-tight mt-0.5">
                            Abre no fecho mensal
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[17px] text-[#71787b] shrink-0">
                        lock
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
