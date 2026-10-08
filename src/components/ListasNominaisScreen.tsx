import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ClassGroup, Student, UserRole } from '../types';
import { OFFICIAL_OCTOBER_DAYS, SCHOOL_NAME } from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getStudentBimesterReport,
  OFFICIAL_BIMESTERS_2027,
} from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';

interface ListasNominaisScreenProps {
  activeTab: 'bolsa_familia' | 'onibus_fretado';
  onSwitchTab: (tab: 'bolsa_familia' | 'onibus_fretado') => void;
  classes: ClassGroup[];
  userRole: UserRole;
  onUpdateStudentField: (classId: string, updatedStudent: Student) => void;
  onOpenStudentGrid: (student: Student, classId: string, className: string, diasLetivos: number) => void;
  onOpenPhotoModal: (student: Student, className: string) => void;
  onOpenStudentPdf: (student: Student, className: string) => void;
}

export const ListasNominaisScreen: React.FC<ListasNominaisScreenProps> = ({
  activeTab,
  onSwitchTab,
  classes,
  userRole,
  onUpdateStudentField,
  onOpenStudentGrid,
  onOpenPhotoModal,
  onOpenStudentPdf,
}) => {
  const effectiveTab =
    userRole !== 'admin' && activeTab === 'bolsa_familia' ? 'onibus_fretado' : activeTab;

  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bolsaStatusFilter, setBolsaStatusFilter] = useState<'beneficiarios' | 'alerta' | 'todos_escola'>('beneficiarios');
  const [selectedBimesterId, setSelectedBimesterId] = useState<'1bim' | '2bim' | '3bim' | '4bim' | 'anual'>('4bim');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [onibusListMode, setOnibusListMode] = useState<'usuarios_fretado' | 'todos_escola'>('usuarios_fretado');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3200);
  };

  // Flatten all students across visible classes preserving numerical order within each class
  const allFlattened = useMemo(() => {
    const list: Array<{
      student: Student;
      cls: ClassGroup;
    }> = [];
    classes.forEach((cls) => {
      const sorted = [...cls.students].sort((a, b) => a.number - b.number);
      sorted.forEach((student) => {
        list.push({ student, cls });
      });
    });
    return list;
  }, [classes]);

  // Distinct bus routes
  const availableRoutes = useMemo(() => {
    const routes = new Set<string>();
    allFlattened.forEach(({ student }) => {
      if (student.rotaOnibus && student.rotaOnibus.trim()) {
        routes.add(student.rotaOnibus.trim());
      }
    });
    return Array.from(routes).sort();
  }, [allFlattened]);

  // Filtered rows for Bolsa Família (Admin only)
  const bolsaFamiliaRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allFlattened
      .map(({ student, cls }) => {
        const m = getStudentAttendanceMetrics(
          student,
          cls.classesHeld || 20,
          OFFICIAL_OCTOBER_DAYS
        );
        const bim = getStudentBimesterReport(student, cls, selectedBimesterId);
        const hasNis = Boolean(student.nis && student.nis.trim().length > 0);
        return {
          student,
          cls,
          m,
          bim,
          hasNis,
        };
      })
      .filter((row) => {
        if (selectedClassFilter !== 'all' && row.cls.id !== selectedClassFilter) return false;
        const shiftClean = row.cls.shift.toUpperCase().includes('MANH') ? 'MANHÃ' : 'TARDE';
        if (selectedShiftFilter !== 'all' && shiftClean !== selectedShiftFilter) return false;

        if (bolsaStatusFilter === 'beneficiarios' && !row.hasNis) return false;
        if (bolsaStatusFilter === 'alerta' && !(row.hasNis && (row.m.isBelowLegalThreshold || row.bim.isBelowLegalThresholdBimestre))) {
          return false;
        }

        if (q !== '') {
          const match =
            row.student.name.toLowerCase().includes(q) ||
            (row.student.ra && row.student.ra.toLowerCase().includes(q)) ||
            (row.student.nis && row.student.nis.toLowerCase().includes(q)) ||
            (row.student.filiacao1 && row.student.filiacao1.toLowerCase().includes(q)) ||
            row.cls.name.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      });
  }, [
    allFlattened,
    selectedClassFilter,
    selectedShiftFilter,
    bolsaStatusFilter,
    selectedBimesterId,
    searchQuery,
  ]);

  // Filtered rows for Ônibus Fretado
  const onibusFretadoRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allFlattened
      .map(({ student, cls }) => {
        const m = getStudentAttendanceMetrics(
          student,
          cls.classesHeld || 20,
          OFFICIAL_OCTOBER_DAYS
        );
        const hasRoute = Boolean(student.rotaOnibus && student.rotaOnibus.trim().length > 0);
        return {
          student,
          cls,
          m,
          hasRoute,
        };
      })
      .filter((row) => {
        if (selectedClassFilter !== 'all' && row.cls.id !== selectedClassFilter) return false;
        const shiftClean = row.cls.shift.toUpperCase().includes('MANH') ? 'MANHÃ' : 'TARDE';
        if (selectedShiftFilter !== 'all' && shiftClean !== selectedShiftFilter) return false;

        if (onibusListMode === 'usuarios_fretado' && !row.hasRoute) return false;
        if (selectedRouteFilter !== 'all' && (row.student.rotaOnibus || '').trim() !== selectedRouteFilter) {
          return false;
        }

        if (q !== '') {
          const match =
            row.student.name.toLowerCase().includes(q) ||
            (row.student.ra && row.student.ra.toLowerCase().includes(q)) ||
            (row.student.rotaOnibus && row.student.rotaOnibus.toLowerCase().includes(q)) ||
            (row.student.bairro && row.student.bairro.toLowerCase().includes(q)) ||
            (row.student.logradouro && row.student.logradouro.toLowerCase().includes(q)) ||
            (row.student.filiacao1 && row.student.filiacao1.toLowerCase().includes(q)) ||
            row.cls.name.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      });
  }, [
    allFlattened,
    selectedClassFilter,
    selectedShiftFilter,
    onibusListMode,
    selectedRouteFilter,
    searchQuery,
  ]);

  // Global KPIs
  const stats = useMemo(() => {
    let totalBolsa = 0;
    let totalBolsaAlerta = 0;
    let totalOnibus = 0;
    let totalOnibusManha = 0;
    let totalOnibusTarde = 0;

    allFlattened.forEach(({ student, cls }) => {
      const m = getStudentAttendanceMetrics(student, cls.classesHeld || 20, OFFICIAL_OCTOBER_DAYS);
      if (student.nis && student.nis.trim().length > 0) {
        totalBolsa++;
        if (m.isBelowLegalThreshold) totalBolsaAlerta++;
      }
      if (student.rotaOnibus && student.rotaOnibus.trim().length > 0) {
        totalOnibus++;
        if (cls.shift.toUpperCase().includes('MANH')) totalOnibusManha++;
        else totalOnibusTarde++;
      }
    });

    return {
      totalBolsa,
      totalBolsaAlerta,
      totalBolsaRegular: Math.max(0, totalBolsa - totalBolsaAlerta),
      totalOnibus,
      totalOnibusManha,
      totalOnibusTarde,
    };
  }, [allFlattened]);

  // Export Bolsa Família Nominal .XLS (Admin Only)
  const handleExportBolsaFamiliaXLS = () => {
    if (userRole !== 'admin') return;
    const rows = bolsaFamiliaRows.map((r, index) => ({
      'ORDEM': index + 1,
      'TURMA ABREV': r.cls.turmaAbrev || r.cls.name,
      'TURMA': r.cls.name,
      'PERÍODO': r.cls.shift.replace('Turno ', '').toUpperCase(),
      'SALA': r.cls.room,
      'PROFESSOR(A) REGENTE': r.cls.teacherName || '',
      'Nº CHAMADA': r.student.number,
      'ESTUDANTE (NOMINAL)': r.student.name,
      'RA': `${r.student.ra}-${r.student.digRa}/${r.student.ufRa || 'SP'}`,
      'NIS (BOLSA FAMÍLIA)': r.student.nis || 'NÃO CADASTRADO',
      'DATA DE NASCIMENTO': r.student.dataNascimento || '',
      'FILIAÇÃO 1 (MÃE)': r.student.filiacao1 || r.student.guardianName || '',
      'FILIAÇÃO 2 (PAI)': r.student.filiacao2 || '',
      'TELEFONES': r.student.telefones || r.student.guardianPhone || '',
      'DIAS LETIVOS (MÊS)': r.m.diasLetivosMatriculados,
      'PRESENÇAS (MÊS)': r.m.presencas,
      'FALTAS (MÊS)': r.m.faltas,
      'ATESTADOS (MÊS)': r.m.atestados,
      '% PRESENÇA MENSAL': `${r.m.frequenciaPercent}%`,
      '% PRESENÇA BIMESTRE': `${r.bim.frequenciaBimestrePercent}%`,
      'EXIGÊNCIA LEGAL MEC': `≥${r.m.minLegalPresencePercent}%`,
      'SITUAÇÃO BOLSA FAMÍLIA': r.m.isBelowLegalThreshold
        ? `ALERTA (<${r.m.minLegalPresencePercent}%)`
        : 'REGULAR',
      'PARECER / MOTIVO': r.bim.bolsaFamiliaMotivoPadrao,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Bolsa_Familia_Nominal');
    XLSX.writeFile(wb, `Relatorio_Nominal_Bolsa_Familia_2027.xls`, { bookType: 'biff8' });
    showToast(`Planilha Relatorio_Nominal_Bolsa_Familia_2027.xls exportada com ${rows.length} estudantes!`);
  };

  // Export Ônibus Fretado Nominal .XLS
  const handleExportOnibusFretadoXLS = () => {
    const rows = onibusFretadoRows.map((r, index) => ({
      'ORDEM': index + 1,
      'ROTA DO ÔNIBUS FRETADO': r.student.rotaOnibus || 'SEM ROTA',
      'TURMA ABREV': r.cls.turmaAbrev || r.cls.name,
      'TURMA': r.cls.name,
      'PERÍODO': r.cls.shift.replace('Turno ', '').toUpperCase(),
      'SALA': r.cls.room,
      'PROFESSOR(A) REGENTE': r.cls.teacherName || '',
      'Nº CHAMADA': r.student.number,
      'ESTUDANTE (NOMINAL)': r.student.name,
      'RA': `${r.student.ra}-${r.student.digRa}/${r.student.ufRa || 'SP'}`,
      'FILIAÇÃO 1 (MÃE)': r.student.filiacao1 || r.student.guardianName || '',
      'FILIAÇÃO 2 (PAI)': r.student.filiacao2 || '',
      'TELEFONES': r.student.telefones || r.student.guardianPhone || '',
      'ENDEREÇO RESIDENCIAL': `${r.student.logradouro || ''}, ${r.student.numeroResidencia || 'S/N'} ${r.student.complemento || ''}`.trim(),
      'BAIRRO': r.student.bairro || '',
      'CEP': r.student.cep || '',
      '% PRESENÇA': `${r.m.frequenciaPercent}%`,
      'FALTAS NO MÊS': r.m.faltas,
      'SITUAÇÃO MATRÍCULA': r.student.situacao || 'ATIVO',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Onibus_Fretado_Nominal');
    XLSX.writeFile(wb, `Lista_Nominal_Onibus_Fretado_2027.xls`, { bookType: 'biff8' });
    showToast(`Planilha Lista_Nominal_Onibus_Fretado_2027.xls exportada com ${rows.length} estudantes!`);
  };

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-3.5 sm:space-y-4 pb-12 animate-gentle-fade">
      {toastMsg && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-200">
          <div className="bg-[#1d1d1f] text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-white/15 flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-[#28cd41]">check_circle</span>
            <p className="text-[0.82rem] font-semibold leading-snug">{toastMsg}</p>
          </div>
        </div>
      )}

      {/* Cabeçalho com Alternador entre as Duas Abas Nominais */}
      <section className="card-welcoming bg-white p-4 sm:p-6 border border-black/[0.06] space-y-3.5 sm:space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-[#1d1d1f] text-white text-[0.68rem] font-bold uppercase tracking-wider">
                Listagens Nominais • {SCHOOL_NAME}
              </span>
              {effectiveTab === 'bolsa_familia' && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#ff9500]/15 text-[#92400e] text-[0.68rem] font-semibold uppercase">
                  Exclusivo Admin
                </span>
              )}
            </div>
            <h1 className="text-[1.25rem] sm:text-[1.55rem] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              {effectiveTab === 'bolsa_familia'
                ? 'Aba Nominal — Beneficiários do Bolsa Família'
                : 'Aba Nominal — Estudantes do Ônibus Fretado'}
            </h1>
            <p className="text-[0.78rem] sm:text-[0.84rem] text-[#6e6e73] font-normal">
              {effectiveTab === 'bolsa_familia'
                ? 'Relatório nominal exclusivo da Direção/Admin com acompanhamento de NIS, frequência mensal/bimestral e mínimo legal (≥60% Ed. Infantil e ≥75% Fundamental).'
                : 'Relação nominal completa dos estudantes que utilizam o transporte escolar / ônibus fretado por rota, turma, turno, endereço e contatos.'}
            </p>
          </div>

          {/* Seletor das Duas Abas Nominais */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="ios-segmented p-1">
              {userRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => onSwitchTab('bolsa_familia')}
                  className={`ios-segmented-item flex items-center gap-1.5 px-3 py-1.5 text-[0.78rem] sm:text-[0.8rem] ${
                    effectiveTab === 'bolsa_familia' ? 'ios-segmented-item-active' : ''
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">
                    family_restroom
                  </span>
                  <span>Bolsa Família ({stats.totalBolsa})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onSwitchTab('onibus_fretado')}
                className={`ios-segmented-item flex items-center gap-1.5 px-3 py-1.5 text-[0.78rem] sm:text-[0.8rem] ${
                  effectiveTab === 'onibus_fretado' ? 'ios-segmented-item-active' : ''
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">
                  directions_bus
                </span>
                <span>Ônibus Fretado ({stats.totalOnibus})</span>
              </button>
            </div>

            {effectiveTab === 'bolsa_familia' && userRole === 'admin' ? (
              <button
                type="button"
                onClick={handleExportBolsaFamiliaXLS}
                className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[0.78rem] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[17px]">download</span>
                <span>Baixar .XLS</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExportOnibusFretadoXLS}
                className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[0.78rem] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[17px]">download</span>
                <span>Baixar .XLS</span>
              </button>
            )}
          </div>
        </div>

        {/* Cards de Indicadores Rápidos da Aba Ativa */}
        {effectiveTab === 'bolsa_familia' && userRole === 'admin' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="rounded-2xl bg-[#f8fafc] border border-black/[0.06] p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#475569] block">
                Total Beneficiários (NIS)
              </span>
              <span className="text-[1.5rem] font-black text-[#0b3b49] tabular-nums block mt-0.5">
                {stats.totalBolsa}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#64748b]">
                estudantes listados nominalmente
              </span>
            </div>

            <div className="rounded-2xl bg-[#eaf6ef]/80 border border-[#006644]/20 p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#006644] block">
                Frequência Regular MEC
              </span>
              <span className="text-[1.5rem] font-black text-[#006644] tabular-nums block mt-0.5">
                {stats.totalBolsaRegular}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#005035]">
                cumprindo ≥60% (Inf.) / ≥75% (Fund.)
              </span>
            </div>

            <div className="rounded-2xl bg-[#fff1f2] border border-[#e11d48]/25 p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#be123c] block">
                Em Alerta Bolsa Família
              </span>
              <span className="text-[1.5rem] font-black text-[#be123c] tabular-nums block mt-0.5">
                {stats.totalBolsaAlerta}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#9f1239]">
                abaixo do mínimo legal no mês
              </span>
            </div>

            <div className="rounded-2xl bg-[#f8fafc] border border-black/[0.06] p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#475569] block">
                Exibidos no Filtro Atual
              </span>
              <span className="text-[1.5rem] font-black text-[#0f172a] tabular-nums block mt-0.5">
                {bolsaFamiliaRows.length}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#64748b]">
                registros prontos para conferência
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="rounded-2xl bg-[#f0f9ff] border border-[#0284c7]/20 p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#0369a1] block">
                Total no Ônibus Fretado
              </span>
              <span className="text-[1.5rem] font-black text-[#0c4a6e] tabular-nums block mt-0.5">
                {stats.totalOnibus}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#0369a1]">
                estudantes vinculados a rotas
              </span>
            </div>

            <div className="rounded-2xl bg-[#fffbeb] border border-[#d97706]/25 p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#b45309] block">
                Fretado • Turno Manhã
              </span>
              <span className="text-[1.5rem] font-black text-[#92400e] tabular-nums block mt-0.5">
                {stats.totalOnibusManha}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#b45309]">
                estudantes no período da manhã
              </span>
            </div>

            <div className="rounded-2xl bg-[#f5f3ff] border border-[#7c3aed]/20 p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#6d28d9] block">
                Fretado • Turno Tarde
              </span>
              <span className="text-[1.5rem] font-black text-[#4c1d95] tabular-nums block mt-0.5">
                {stats.totalOnibusTarde}
              </span>
              <span className="text-[0.72rem] font-semibold text-[#6d28d9]">
                estudantes no período da tarde
              </span>
            </div>

            <div className="rounded-2xl bg-[#f8fafc] border border-black/[0.06] p-3.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#475569] block">
                Rotas Ativas / Filtrados
              </span>
              <span className="text-[1.5rem] font-black text-[#0f172a] tabular-nums block mt-0.5">
                {availableRoutes.length} rotas • {onibusFretadoRows.length} alunos
              </span>
              <span className="text-[0.72rem] font-semibold text-[#64748b]">
                listados nominalmente abaixo
              </span>
            </div>
          </div>
        )}

        {/* Barra de Filtros: Busca, Turma, Turno e Filtros Específicos da Aba */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-2 border-t border-black/[0.06]">
          <div className="lg:col-span-4 relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748b] text-[19px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                effectiveTab === 'bolsa_familia'
                  ? 'Buscar por nome, RA, NIS, mãe ou turma...'
                  : 'Buscar por nome, RA, rota de ônibus, bairro ou mãe...'
              }
              className="w-full min-h-[42px] pl-10 pr-8 bg-[#f1f5f9] text-[#0f172a] text-[0.84rem] rounded-xl border border-transparent focus:border-[#006644]/40 focus:bg-white focus:outline-none font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">cancel</span>
              </button>
            )}
          </div>

          <div className="lg:col-span-3">
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.82rem] rounded-xl border border-black/[0.06] cursor-pointer"
            >
              <option value="all">Todas as Turmas ({classes.length} turmas)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.turmaAbrev || c.name} — {c.name} ({c.shift.replace('Turno ', '')})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={selectedShiftFilter}
              onChange={(e) => setSelectedShiftFilter(e.target.value as any)}
              className="w-full min-h-[42px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.82rem] rounded-xl border border-black/[0.06] cursor-pointer"
            >
              <option value="all">Todos os Períodos</option>
              <option value="MANHÃ">☀️ Período Manhã</option>
              <option value="TARDE">⛅ Período Tarde</option>
            </select>
          </div>

          {effectiveTab === 'bolsa_familia' ? (
            <div className="lg:col-span-3 flex gap-2">
              <select
                value={bolsaStatusFilter}
                onChange={(e) => setBolsaStatusFilter(e.target.value as any)}
                className="flex-1 min-h-[42px] px-3 bg-[#eaf6ef] text-[#005035] font-extrabold text-[0.8rem] rounded-xl border border-[#006644]/25 cursor-pointer"
              >
                <option value="beneficiarios">Somente Beneficiários Bolsa Família</option>
                <option value="alerta">⚠️ Somente em Alerta de Frequência</option>
                <option value="todos_escola">Todos os Alunos (Incluir / Editar NIS)</option>
              </select>
              <select
                value={selectedBimesterId}
                onChange={(e) => setSelectedBimesterId(e.target.value as any)}
                className="w-36 min-h-[42px] px-2.5 bg-[#f1f5f9] text-[#0b3b49] font-extrabold text-[0.78rem] rounded-xl border border-black/[0.08] cursor-pointer"
              >
                {OFFICIAL_BIMESTERS_2027.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortLabel}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="lg:col-span-3 flex gap-2">
              <select
                value={selectedRouteFilter}
                onChange={(e) => setSelectedRouteFilter(e.target.value)}
                className="flex-1 min-h-[42px] px-3 bg-[#f0f9ff] text-[#0c4a6e] font-extrabold text-[0.8rem] rounded-xl border border-[#0284c7]/25 cursor-pointer"
              >
                <option value="all">Todas as Rotas de Ônibus</option>
                {availableRoutes.map((route) => (
                  <option key={route} value={route}>
                    {route}
                  </option>
                ))}
              </select>
              <select
                value={onibusListMode}
                onChange={(e) => setOnibusListMode(e.target.value as any)}
                className="w-40 min-h-[42px] px-2.5 bg-[#f1f5f9] text-[#0b3b49] font-extrabold text-[0.78rem] rounded-xl border border-black/[0.08] cursor-pointer"
              >
                <option value="usuarios_fretado">Usuários do Fretado</option>
                <option value="todos_escola">Todos (Vincular Rota)</option>
              </select>
            </div>
          )}
        </div>
      </section>

      {/* CONTEÚDO DA ABA 1: LISTA NOMINAL BOLSA FAMÍLIA (EXCLUSIVO ADMIN) */}
      {effectiveTab === 'bolsa_familia' && userRole === 'admin' && (
        <div className="bg-white rounded-3xl border border-black/[0.07] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.78rem] border-collapse min-w-[1160px]">
              <thead className="bg-[#f8fafc] text-[#0b3b49] border-b border-black/[0.07] font-extrabold uppercase tracking-wider text-[0.68rem]">
                <tr>
                  <th className="py-3 px-3 text-center">Turma / Nº</th>
                  <th className="py-3 px-3">Estudante (Nominal) &amp; Ficha Escaneada (Drive)</th>
                  <th className="py-3 px-2.5">RA</th>
                  <th className="py-3 px-3">NIS (Bolsa Família)</th>
                  <th className="py-3 px-3">Filiação 1 (Mãe) &amp; Telefone</th>
                  <th className="py-3 px-2.5 text-center">Presença Mês</th>
                  <th className="py-3 px-2.5 text-center">Faltas / Atest.</th>
                  <th className="py-3 px-2.5 text-center">% Bimestre</th>
                  <th className="py-3 px-3 text-center">Situação MEC / Bolsa Família</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {bolsaFamiliaRows.map(({ student, cls, m, bim }) => {
                  const isEditingThis = editingStudentId === `nis-${student.id}`;
                  return (
                    <tr
                      key={`${cls.id}-${student.id}`}
                      onClick={() =>
                        onOpenStudentGrid(student, cls.id, cls.name, cls.classesHeld || 20)
                      }
                      className={`cursor-pointer transition-colors ${
                        m.isBelowLegalThreshold
                          ? 'bg-[#fff1f2]/70 hover:bg-[#ffe4e6]/80'
                          : 'hover:bg-[#f8fafc]'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0b3b49] text-white font-mono font-extrabold text-[0.72rem]">
                          {cls.turmaAbrev || cls.name} • Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        <span className="block text-[0.66rem] font-semibold text-[#64748b] mt-0.5">
                          {cls.shift.replace('Turno ', '')} · {cls.room}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StudentAvatar
                              student={student}
                              size="sm"
                              expandableOnClick={true}
                              onUploadPhotoClick={() => onOpenPhotoModal(student, cls.name)}
                            />
                            <div className="min-w-0">
                              <span className="font-extrabold text-[#0f172a] block truncate">
                                {student.name}
                              </span>
                              <span className="text-[0.68rem] text-[#475569] block truncate">
                                Prof(a): {cls.teacherFirstName || cls.teacherName}
                              </span>
                            </div>
                          </div>

                          {/* Único Hyperlink: Ficha Informativa Escaneada em PDF do Drive */}
                          <a
                            href={
                              student.fichaPdfDriveUrl ||
                              (student.fichaPdfDriveId
                                ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
                                : `#doc-${student.id}`)
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenStudentPdf(student, cls.name);
                            }}
                            title={`Abrir Ficha Informativa Escaneada (${student.name}.pdf) no Google Drive`}
                            className="doc-hyperlink px-2.5 py-1 rounded-xl bg-white hover:bg-[#0b3b49] text-[#0b3b49] hover:!text-white border border-black/[0.09] font-extrabold text-[0.68rem] flex items-center gap-1 shrink-0 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              document_scanner
                            </span>
                            <span>Ficha (Drive)</span>
                          </a>
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5 font-mono text-[0.74rem] text-[#475569]">
                        {student.ra}-{student.digRa}
                      </td>

                      <td
                        className="py-2.5 px-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isEditingThis ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              placeholder="Ex: 207.41017.82-1"
                              className="w-36 px-2 py-1 text-[0.75rem] font-mono bg-white border border-[#006644] rounded-lg focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateStudentField(cls.id, {
                                  ...student,
                                  nis: draftValue.trim() || undefined,
                                });
                                setEditingStudentId(null);
                                showToast(`NIS de ${student.name} atualizado!`);
                              }}
                              className="px-2 py-1 rounded-lg bg-[#006644] text-white font-bold text-[0.7rem] cursor-pointer"
                            >
                              Salvar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1.5">
                            {student.nis ? (
                              <span className="font-mono font-extrabold text-[#006644] bg-[#eaf6ef] px-2 py-0.5 rounded-lg text-[0.74rem]">
                                {student.nis}
                              </span>
                            ) : (
                              <span className="text-[0.7rem] text-[#94a3b8] italic">
                                Sem NIS
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStudentId(`nis-${student.id}`);
                                setDraftValue(student.nis || '');
                              }}
                              title="Editar ou cadastrar NIS Bolsa Família"
                              className="text-[#64748b] hover:text-[#0b3b49] p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-[#0f172a] block truncate max-w-[210px]">
                          {student.filiacao1 || student.guardianName || '—'}
                        </span>
                        <span className="font-mono text-[0.7rem] text-[#006644] font-bold">
                          {student.telefones || student.guardianPhone || '—'}
                        </span>
                      </td>

                      <td className="py-2.5 px-2.5 text-center font-mono">
                        <span
                          className={`font-black text-[0.86rem] ${
                            m.isBelowLegalThreshold ? 'text-[#be123c]' : 'text-[#006644]'
                          }`}
                        >
                          {m.frequenciaPercent}%
                        </span>
                        <span className="block text-[0.68rem] text-[#64748b]">
                          {m.presencas}/{m.diasLetivosMatriculados}d
                        </span>
                      </td>

                      <td className="py-2.5 px-2.5 text-center font-mono">
                        <span className="font-bold text-[#be123c]">{m.faltas}F</span>
                        <span className="mx-1 text-[#cbd5e1]">/</span>
                        <span className="font-bold text-[#006644]">{m.atestados}A</span>
                      </td>

                      <td className="py-2.5 px-2.5 text-center font-mono">
                        <span
                          className={`px-2 py-0.5 rounded-lg font-extrabold text-[0.76rem] ${
                            bim.isBelowLegalThresholdBimestre
                              ? 'bg-[#ffe4e6] text-[#be123c]'
                              : 'bg-[#f1f5f9] text-[#0b3b49]'
                          }`}
                        >
                          {bim.frequenciaBimestrePercent}%
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {m.isBelowLegalThreshold ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#be123c] text-white text-[0.68rem] font-extrabold">
                            <span className="material-symbols-outlined text-[13px]">warning</span>
                            <span>Alerta &lt;{m.minLegalPresencePercent}%</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#eaf6ef] text-[#006644] text-[0.68rem] font-extrabold">
                            <span className="material-symbols-outlined text-[13px]">verified</span>
                            <span>Regular (≥{m.minLegalPresencePercent}%)</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: LISTA NOMINAL ÔNIBUS FRETADO (TRANSPORTE ESCOLAR) */}
      {effectiveTab === 'onibus_fretado' && (
        <div className="bg-white rounded-3xl border border-black/[0.07] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.78rem] border-collapse min-w-[1160px]">
              <thead className="bg-[#f8fafc] text-[#0b3b49] border-b border-black/[0.07] font-extrabold uppercase tracking-wider text-[0.68rem]">
                <tr>
                  <th className="py-3 px-3 text-center">Turma / Nº</th>
                  <th className="py-3 px-3">Estudante (Nominal) &amp; Ficha Escaneada (Drive)</th>
                  <th className="py-3 px-3">Rota do Ônibus Fretado</th>
                  <th className="py-3 px-3">Endereço / Bairro / CEP</th>
                  <th className="py-3 px-3">Filiação (Mãe e Pai)</th>
                  <th className="py-3 px-2.5">Telefones</th>
                  <th className="py-3 px-2.5 text-center">Presença / Faltas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {onibusFretadoRows.map(({ student, cls, m }) => {
                  const isEditingRoute = editingStudentId === `route-${student.id}`;
                  return (
                    <tr
                      key={`${cls.id}-${student.id}`}
                      onClick={() =>
                        onOpenStudentGrid(student, cls.id, cls.name, cls.classesHeld || 20)
                      }
                      className="hover:bg-[#f8fafc] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0b3b49] text-white font-mono font-extrabold text-[0.72rem]">
                          {cls.turmaAbrev || cls.name} • Nº {student.number.toString().padStart(2, '0')}
                        </span>
                        <span className="block text-[0.66rem] font-semibold text-[#64748b] mt-0.5">
                          {cls.shift.replace('Turno ', '')} · {cls.room}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StudentAvatar
                              student={student}
                              size="sm"
                              expandableOnClick={true}
                              onUploadPhotoClick={() => onOpenPhotoModal(student, cls.name)}
                            />
                            <div className="min-w-0">
                              <span className="font-extrabold text-[#0f172a] block truncate">
                                {student.name}
                              </span>
                              <span className="font-mono text-[0.68rem] text-[#64748b]">
                                RA {student.ra}-{student.digRa}
                              </span>
                            </div>
                          </div>

                          {/* Único Hyperlink: Ficha Informativa Escaneada em PDF do Drive */}
                          <a
                            href={
                              student.fichaPdfDriveUrl ||
                              (student.fichaPdfDriveId
                                ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
                                : `#doc-${student.id}`)
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenStudentPdf(student, cls.name);
                            }}
                            title={`Abrir Ficha Informativa Escaneada (${student.name}.pdf) no Google Drive`}
                            className="doc-hyperlink px-2.5 py-1 rounded-xl bg-white hover:bg-[#0b3b49] text-[#0b3b49] hover:!text-white border border-black/[0.09] font-extrabold text-[0.68rem] flex items-center gap-1 shrink-0 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              document_scanner
                            </span>
                            <span>Ficha (Drive)</span>
                          </a>
                        </div>
                      </td>

                      <td
                        className="py-2.5 px-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isEditingRoute ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              placeholder="Ex: ROTA 01 - TERRA DA UVA"
                              className="w-48 px-2 py-1 text-[0.75rem] bg-white border border-[#0284c7] rounded-lg focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateStudentField(cls.id, {
                                  ...student,
                                  rotaOnibus: draftValue.trim() || undefined,
                                });
                                setEditingStudentId(null);
                                showToast(`Rota de ônibus de ${student.name} atualizada!`);
                              }}
                              className="px-2 py-1 rounded-lg bg-[#0b3b49] text-white font-bold text-[0.7rem] cursor-pointer"
                            >
                              Salvar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1.5">
                            {student.rotaOnibus ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#f0f9ff] text-[#0369a1] border border-[#0284c7]/20 font-extrabold text-[0.72rem]">
                                <span className="material-symbols-outlined text-[14px]">
                                  directions_bus
                                </span>
                                <span>{student.rotaOnibus}</span>
                              </span>
                            ) : (
                              <span className="text-[0.7rem] text-[#94a3b8] italic">
                                Sem rota vinculada
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStudentId(`route-${student.id}`);
                                setDraftValue(
                                  student.rotaOnibus ||
                                    'ROTA 01 - RESIDENCIAL TERRA DA UVA / SANTOS DUMONT'
                                );
                              }}
                              title="Editar ou vincular Rota do Ônibus Fretado"
                              className="text-[#64748b] hover:text-[#0b3b49] p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-[0.74rem]">
                        <span className="font-semibold text-[#0f172a] block truncate max-w-[230px]">
                          {student.logradouro || '—'}, {student.numeroResidencia || 'S/N'}
                        </span>
                        <span className="text-[0.68rem] text-[#475569] block">
                          {student.bairro || 'Jundiaí'} • CEP {student.cep || '—'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-[0.73rem]">
                        <div className="truncate max-w-[210px]">
                          <strong>Mãe:</strong> {student.filiacao1 || student.guardianName || '—'}
                        </div>
                        <div className="truncate max-w-[210px] text-[#475569]">
                          <strong>Pai:</strong> {student.filiacao2 || '—'}
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5 font-mono text-[0.72rem] font-bold text-[#006644]">
                        {student.telefones || student.guardianPhone || '—'}
                      </td>

                      <td className="py-2.5 px-2.5 text-center font-mono">
                        <span className="px-2 py-0.5 rounded-lg bg-[#eaf6ef] text-[#006644] font-bold text-[0.74rem]">
                          {m.frequenciaPercent}% ({m.presencas}d)
                        </span>
                        {m.faltas > 0 && (
                          <span className="block text-[0.68rem] text-[#be123c] font-bold mt-0.5">
                            {m.faltas} falta(s)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
