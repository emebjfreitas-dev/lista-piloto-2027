import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ClassGroup, Student, UserRole } from '../types';
import { SCHOOL_NAME } from '../data/mockData';
import {
  BimesterId2027,
  getStudentBimesterReport,
  OFFICIAL_BIMESTERS_2027,
  StudentBimesterReportRow,
} from '../utils/attendanceRules';
import { getAccessToken, googleSignIn } from '../services/googleSheetsApi';
import { StudentAvatar } from './StudentAvatar';

interface ListasNominaisScreenProps {
  classes: ClassGroup[];
  userRole: UserRole;
  onUpdateStudentField: (classId: string, updatedStudent: Student) => void;
  onOpenStudentGrid: (
    student: Student,
    classId: string,
    className: string,
    diasLetivos: number
  ) => void;
  onOpenPhotoModal: (student: Student, className: string) => void;
  onOpenStudentPdf: (student: Student, className: string) => void;
}

export const ListasNominaisScreen: React.FC<ListasNominaisScreenProps> = ({
  classes,
  userRole,
  onOpenStudentGrid,
}) => {
  const [selectedBimesterId, setSelectedBimesterId] = useState<BimesterId2027>('5bim');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedSegmentFilter, setSelectedSegmentFilter] = useState<
    'all' | 'fundamental' | 'infantil'
  >('all');
  const [selectedAtestadoFilter, setSelectedAtestadoFilter] = useState<
    'all' | 'com_atestado' | 'sem_atestado'
  >('all');
  const [onlyBelowTarget, setOnlyBelowTarget] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExportingGoogleSheet, setIsExportingGoogleSheet] = useState<boolean>(false);
  const [createdSheetUrl, setCreatedSheetUrl] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3800);
  };

  const currentBimester = useMemo(
    () =>
      OFFICIAL_BIMESTERS_2027.find((b) => b.id === selectedBimesterId) ||
      OFFICIAL_BIMESTERS_2027[4],
    [selectedBimesterId]
  );

  // Avalia todos os estudantes ativos nas turmas em relação ao bimestre selecionado
  const allEvaluatedRows = useMemo(() => {
    const list: Array<{
      student: Student;
      cls: ClassGroup;
      rep: StudentBimesterReportRow;
      hasAtestado: boolean;
      isBelowTarget: boolean;
      worstMonthPercent: number;
      worstMonthName: string;
    }> = [];

    classes.forEach((cls) => {
      cls.students.forEach((student) => {
        const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
        if (sit.includes('BXTR') || sit.includes('TRANSF') || sit.includes('REMAN')) {
          return;
        }

        const rep = getStudentBimesterReport(student, cls, selectedBimesterId);
        const hasAtestado = rep.totalAtestadosBimestre > 0;
        const isBelowTarget =
          rep.isBelowLegalThresholdBimestre || rep.hasAnyMonthBelowThreshold;

        let worstMonthPercent = 100;
        let worstMonthName = rep.monthsBreakdown[0]?.monthName || 'Outubro';
        rep.monthsBreakdown.forEach((mb) => {
          if (mb.frequenciaPercent <= worstMonthPercent) {
            worstMonthPercent = mb.frequenciaPercent;
            worstMonthName = mb.monthName;
          }
        });

        list.push({
          student,
          cls,
          rep,
          hasAtestado,
          isBelowTarget,
          worstMonthPercent,
          worstMonthName,
        });
      });
    });

    // Ordem alfabética estrita pelo nome do estudante (A -> Z)
    return list.sort((a, b) =>
      a.student.name.localeCompare(b.student.name, 'pt-BR', { sensitivity: 'base' })
    );
  }, [classes, selectedBimesterId]);

  // Destaques / KPIs do Bimestre Selecionado (respeitando filtro de Turma se selecionado)
  const kpiStats = useMemo(() => {
    const classScoped = allEvaluatedRows.filter((r) =>
      selectedClassFilter === 'all' ? true : r.cls.id === selectedClassFilter
    );
    const belowTargetRows = classScoped.filter((r) => r.isBelowTarget);
    const belowFundamental = belowTargetRows.filter((r) => !r.rep.isEducacaoInfantil);
    const belowInfantil = belowTargetRows.filter((r) => r.rep.isEducacaoInfantil);
    const belowWithAtestado = belowTargetRows.filter((r) => r.hasAtestado);
    const belowWithoutAtestado = belowTargetRows.filter((r) => !r.hasAtestado);

    return {
      totalEvaluated: classScoped.length,
      totalBelowTarget: belowTargetRows.length,
      belowFundamentalCount: belowFundamental.length,
      belowInfantilCount: belowInfantil.length,
      belowWithAtestadoCount: belowWithAtestado.length,
      belowWithoutAtestadoCount: belowWithoutAtestado.length,
    };
  }, [allEvaluatedRows, selectedClassFilter]);

  // Linhas filtradas e em ordem alfabética (A -> Z)
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allEvaluatedRows.filter((row) => {
      if (onlyBelowTarget && !row.isBelowTarget) return false;
      if (selectedClassFilter !== 'all' && row.cls.id !== selectedClassFilter) {
        return false;
      }
      if (
        selectedSegmentFilter === 'fundamental' &&
        row.rep.isEducacaoInfantil
      ) {
        return false;
      }
      if (
        selectedSegmentFilter === 'infantil' &&
        !row.rep.isEducacaoInfantil
      ) {
        return false;
      }
      if (selectedAtestadoFilter === 'com_atestado' && !row.hasAtestado) {
        return false;
      }
      if (selectedAtestadoFilter === 'sem_atestado' && row.hasAtestado) {
        return false;
      }

      if (q !== '') {
        const match =
          row.student.name.toLowerCase().includes(q) ||
          (row.student.ra && row.student.ra.toLowerCase().includes(q)) ||
          (row.student.nis && row.student.nis.toLowerCase().includes(q)) ||
          row.cls.name.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [
    allEvaluatedRows,
    onlyBelowTarget,
    selectedClassFilter,
    selectedSegmentFilter,
    selectedAtestadoFilter,
    searchQuery,
  ]);

  // Monta os dados tabulares limpos para exportação (.XLS e Nova Google Sheet)
  const buildExportObjects = () => {
    return filteredRows.map((r, index) => {
      const monthCols: Record<string, string | number> = {};
      r.rep.monthsBreakdown.forEach((mb) => {
        const shortM = mb.monthName.slice(0, 3).toUpperCase();
        monthCols[`${shortM} (% PRESENÇA)`] = `${mb.frequenciaPercent}%`;
        monthCols[`${shortM} (FALTAS / ATEST.)`] = `${mb.faltas}F / ${mb.atestados}A`;
      });

      return {
        'ORDEM (A-Z)': index + 1,
        'ESTUDANTE (ORDEM ALFABÉTICA)': r.student.name,
        'TURMA': r.cls.name,
        'PERÍODO': r.cls.shift.replace('Turno ', '').toUpperCase(),
        'ETAPA DE ENSINO': r.rep.isEducacaoInfantil
          ? 'EDUCAÇÃO INFANTIL'
          : 'ENSINO FUNDAMENTAL',
        'META MÍNIMA LEGAL': `≥${r.rep.minLegalPresencePercent}%`,
        'BIMESTRE DE REFERÊNCIA': currentBimester.shortLabel,
        ...monthCols,
        'FALTAS NO BIMESTRE': r.rep.totalFaltasBimestre,
        'ATESTADOS NO BIMESTRE': r.rep.totalAtestadosBimestre,
        'POSSUI ATESTADO?': r.hasAtestado
          ? `SIM (${r.rep.totalAtestadosBimestre} atestado(s))`
          : 'NÃO (Sem atestado)',
        '% PRESENÇA BIMESTRE': `${r.rep.frequenciaBimestrePercent}%`,
        'PIOR MÊS NO BIMESTRE': `${r.worstMonthName} (${r.worstMonthPercent}%)`,
        'STATUS META MEC / BOLSA FAMÍLIA': r.isBelowTarget
          ? `ABAIXO DA META (<${r.rep.minLegalPresencePercent}%)`
          : `DENTRO DA META (≥${r.rep.minLegalPresencePercent}%)`,
        'RA': `${r.student.ra}-${r.student.digRa}`,
        'NIS': r.student.nis || '—',
        'RESPONSÁVEL / TELEFONE': `${r.student.filiacao1 || r.student.guardianName || '—'} (${r.student.telefones || r.student.guardianPhone || '—'})`,
      };
    });
  };

  // Exportação 1: Arquivo Excel (.XLS)
  const handleExportXLS = () => {
    const rows = buildExportObjects();
    if (rows.length === 0) {
      showToast('Nenhum estudante listado no filtro atual para exportar.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    const safeSheetName = `Bolsa_${currentBimester.id.toUpperCase()}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    const fileName = `Bolsa_Familia_Abaixo_Meta_${currentBimester.id}_2027.xls`;
    XLSX.writeFile(wb, fileName, { bookType: 'biff8' });
    showToast(`Planilha ${fileName} exportada com ${rows.length} estudantes em ordem alfabética!`);
  };

  // Exportação 2: Criar Nova Google Sheet na Nuvem
  const handleExportNewGoogleSheet = async () => {
    const rows = buildExportObjects();
    if (rows.length === 0) {
      showToast('Nenhum estudante listado no filtro atual para exportar.');
      return;
    }

    setIsExportingGoogleSheet(true);
    setCreatedSheetUrl(null);
    try {
      let token = await getAccessToken();
      if (!token) {
        const authRes = await googleSignIn();
        token = authRes?.accessToken || (await getAccessToken());
      }
      if (!token) {
        showToast('Conecte sua conta Google para gerar a Nova Google Sheet.');
        setIsExportingGoogleSheet(false);
        return;
      }

      const classLabel =
        selectedClassFilter === 'all'
          ? 'Todas as Turmas'
          : classes.find((c) => c.id === selectedClassFilter)?.name || 'Turma';

      const sheetTitle = `Bolsa Família • ${currentBimester.shortLabel} • ${classLabel} (${new Date().toLocaleDateString('pt-BR')})`;

      const createRes = await fetch(
        'https://sheets.googleapis.com/v4/spreadsheets',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties: {
              title: sheetTitle,
              locale: 'pt_BR',
            },
            sheets: [
              {
                properties: {
                  title: 'Abaixo_da_Meta_Bimestre',
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
              },
            ],
          }),
        }
      );

      if (!createRes.ok) {
        throw new Error('Falha ao criar nova planilha no Google Sheets.');
      }

      const createdData = await createRes.json();
      const newSpreadsheetId = createdData.spreadsheetId;
      const newSpreadsheetUrl =
        createdData.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}/edit`;

      const headers = Object.keys(rows[0]);
      const values = [
        headers,
        ...rows.map((rowObj) =>
          headers.map((h) => String((rowObj as Record<string, any>)[h] ?? ''))
        ),
      ];

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}/values/Abaixo_da_Meta_Bimestre!A1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values,
          }),
        }
      );

      setCreatedSheetUrl(newSpreadsheetUrl);
      showToast(
        `Nova Google Sheet criada com sucesso (${rows.length} estudantes em ordem alfabética)!`
      );
    } catch (err) {
      console.error('Erro ao exportar para Nova Google Sheet:', err);
      showToast('Não foi possível criar a Google Sheet agora. Verifique a conexão Google.');
    } finally {
      setIsExportingGoogleSheet(false);
    }
  };

  if (userRole !== 'admin') {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-white rounded-3xl border border-black/[0.08] text-center space-y-2">
        <span className="material-symbols-outlined text-[36px] text-[#ff3b30]">
          lock
        </span>
        <h2 className="text-[1.1rem] font-bold text-[#1d1d1f]">
          Acesso Restrito à Gestão / Secretaria
        </h2>
        <p className="text-[0.84rem] text-[#6e6e73]">
          O painel consolidado do Bolsa Família e metas bimestrais é exclusivo do perfil Administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {toastMsg && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-lg mx-auto animate-in fade-in duration-200">
          <div className="bg-[#1d1d1f] text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-white/15 flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-[#28cd41]">
              check_circle
            </span>
            <p className="text-[0.82rem] font-semibold leading-snug">{toastMsg}</p>
          </div>
        </div>
      )}

      {/* CABEÇALHO SIMPLIFICADO & EXPORTAÇÃO (.XLS OU NOVA GOOGLE SHEET) */}
      <section className="card-welcoming bg-white p-4 sm:p-6 border border-black/[0.06] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[0.72rem] font-semibold text-[#6e6e73]">
              <span className="text-[#1d1d1f] font-bold uppercase tracking-wider">
                Bolsa Família &amp; Busca Ativa Bimestral
              </span>
              <span aria-hidden="true">·</span>
              <span>{SCHOOL_NAME}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#be123c] font-bold">
                Ens. Fundamental &lt; 75% | Ed. Infantil &lt; 60%
              </span>
            </div>
            <h1 className="text-[1.3rem] sm:text-[1.55rem] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Estudantes Abaixo da Meta de Presença — {currentBimester.shortLabel}
            </h1>
            <p className="text-[0.8rem] text-[#6e6e73]">
              Relação simplificada em <strong>ordem alfabética (A–Z)</strong> por bimestre (Fev+Mar até Out+Nov/2027), destacando etapa de ensino e existência de atestado médico.
            </p>
          </div>

          {/* Ações de Exportação Direta: .XLS ou Nova Google Sheet */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportXLS}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-semibold text-[0.8rem] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Exportar .XLS</span>
            </button>

            <button
              type="button"
              onClick={handleExportNewGoogleSheet}
              disabled={isExportingGoogleSheet}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#006644] hover:bg-[#005035] text-white font-semibold text-[0.8rem] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95 disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${
                  isExportingGoogleSheet ? 'animate-spin' : ''
                }`}
              >
                {isExportingGoogleSheet ? 'sync' : 'add_to_drive'}
              </span>
              <span>
                {isExportingGoogleSheet
                  ? 'Criando Google Sheet...'
                  : 'Exportar Nova Google Sheet'}
              </span>
            </button>
          </div>
        </div>

        {/* Link imediato quando uma Nova Google Sheet é gerada */}
        {createdSheetUrl && (
          <div className="p-3.5 rounded-2xl bg-[#eaf6ef] border border-[#006644]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#005035] text-[0.82rem] font-semibold">
              <span className="material-symbols-outlined text-[20px]">
                task_alt
              </span>
              <span>
                Nova planilha criada no seu Google Drive com os estudantes filtrados ({currentBimester.shortLabel}):
              </span>
            </div>
            <a
              href={createdSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-[#006644] text-white font-bold text-[0.76rem] inline-flex items-center gap-1.5 self-start sm:self-auto hover:bg-[#005035]"
            >
              <span>Abrir Planilha no Google Sheets</span>
              <span className="material-symbols-outlined text-[15px]">
                open_in_new
              </span>
            </a>
          </div>
        )}

        {/* SELETOR VISUAL DE BIMESTRES (FEV+MAR ATÉ OUT+NOV DE 2027) */}
        <div className="pt-1">
          <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#6e6e73] block mb-2">
            Recorte Bimestral (2027)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {OFFICIAL_BIMESTERS_2027.map((bim) => {
              const isSelected = bim.id === selectedBimesterId;
              return (
                <button
                  key={bim.id}
                  type="button"
                  onClick={() => setSelectedBimesterId(bim.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1d1d1f] text-white border-[#1d1d1f] shadow-xs'
                      : 'bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#0f172a] border-black/[0.07]'
                  }`}
                >
                  <span
                    className={`text-[0.65rem] font-bold uppercase block ${
                      isSelected ? 'text-white/75' : 'text-[#64748b]'
                    }`}
                  >
                    {bim.id === 'anual' ? 'Consolidado' : `${bim.id.replace('bim', 'º Bimestre')}`}
                  </span>
                  <span className="text-[0.86rem] font-extrabold block mt-0.5">
                    {bim.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* DESTAQUES VISUAIS (KPI CARDS CLICÁVEIS) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Card 1: Total Abaixo da Meta */}
          <button
            type="button"
            onClick={() => {
              setOnlyBelowTarget(true);
              setSelectedSegmentFilter('all');
              setSelectedAtestadoFilter('all');
            }}
            className={`text-left rounded-2xl p-3.5 border transition-all cursor-pointer ${
              onlyBelowTarget &&
              selectedSegmentFilter === 'all' &&
              selectedAtestadoFilter === 'all'
                ? 'bg-[#fff1f2] border-[#be123c] ring-2 ring-[#be123c]/20'
                : 'bg-[#fff1f2]/70 border-[#e11d48]/20 hover:bg-[#fff1f2]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#be123c]">
                Total Abaixo da Meta
              </span>
              <span className="material-symbols-outlined text-[18px] text-[#be123c]">
                warning
              </span>
            </div>
            <span className="text-[1.65rem] font-black text-[#be123c] tabular-nums block mt-0.5 leading-none">
              {kpiStats.totalBelowTarget}
            </span>
            <span className="text-[0.72rem] font-medium text-[#9f1239] block mt-1">
              de {kpiStats.totalEvaluated} estudantes ativos
            </span>
          </button>

          {/* Card 2: Ensino Fundamental (< 75%) */}
          <button
            type="button"
            onClick={() => {
              setOnlyBelowTarget(true);
              setSelectedSegmentFilter(
                selectedSegmentFilter === 'fundamental' ? 'all' : 'fundamental'
              );
            }}
            className={`text-left rounded-2xl p-3.5 border transition-all cursor-pointer ${
              selectedSegmentFilter === 'fundamental'
                ? 'bg-[#eff6ff] border-[#0284c7] ring-2 ring-[#0284c7]/20'
                : 'bg-[#f8fafc] border-black/[0.07] hover:bg-[#f1f5f9]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#0369a1]">
                Ens. Fundamental (&lt; 75%)
              </span>
              <span className="material-symbols-outlined text-[18px] text-[#0284c7]">
                menu_book
              </span>
            </div>
            <span className="text-[1.65rem] font-black text-[#0c4a6e] tabular-nums block mt-0.5 leading-none">
              {kpiStats.belowFundamentalCount}
            </span>
            <span className="text-[0.72rem] font-medium text-[#475569] block mt-1">
              1º ao 5º Ano abaixo de 75%
            </span>
          </button>

          {/* Card 3: Educação Infantil (< 60%) */}
          <button
            type="button"
            onClick={() => {
              setOnlyBelowTarget(true);
              setSelectedSegmentFilter(
                selectedSegmentFilter === 'infantil' ? 'all' : 'infantil'
              );
            }}
            className={`text-left rounded-2xl p-3.5 border transition-all cursor-pointer ${
              selectedSegmentFilter === 'infantil'
                ? 'bg-[#fef3c7] border-[#d97706] ring-2 ring-[#d97706]/20'
                : 'bg-[#f8fafc] border-black/[0.07] hover:bg-[#f1f5f9]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#b45309]">
                Ed. Infantil (&lt; 60%)
              </span>
              <span className="material-symbols-outlined text-[18px] text-[#d97706]">
                child_care
              </span>
            </div>
            <span className="text-[1.65rem] font-black text-[#92400e] tabular-nums block mt-0.5 leading-none">
              {kpiStats.belowInfantilCount}
            </span>
            <span className="text-[0.72rem] font-medium text-[#475569] block mt-1">
              G4 e G5 abaixo de 60%
            </span>
          </button>

          {/* Card 4: Com Atestado vs Sem Atestado */}
          <div className="rounded-2xl bg-[#f8fafc] border border-black/[0.07] p-3.5 flex flex-col justify-between">
            <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#475569] block">
              Justificativa Médica (Atestado)
            </span>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() =>
                  setSelectedAtestadoFilter(
                    selectedAtestadoFilter === 'com_atestado' ? 'all' : 'com_atestado'
                  )
                }
                className={`p-1.5 rounded-xl border text-center cursor-pointer transition-all ${
                  selectedAtestadoFilter === 'com_atestado'
                    ? 'bg-[#006644] text-white border-[#006644]'
                    : 'bg-[#eaf6ef] text-[#005035] border-[#006644]/20'
                }`}
              >
                <span className="text-[1.1rem] font-black tabular-nums block leading-none">
                  {kpiStats.belowWithAtestadoCount}
                </span>
                <span className="text-[0.64rem] font-bold block mt-0.5">
                  Com Atestado
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedAtestadoFilter(
                    selectedAtestadoFilter === 'sem_atestado' ? 'all' : 'sem_atestado'
                  )
                }
                className={`p-1.5 rounded-xl border text-center cursor-pointer transition-all ${
                  selectedAtestadoFilter === 'sem_atestado'
                    ? 'bg-[#be123c] text-white border-[#be123c]'
                    : 'bg-[#fff1f2] text-[#be123c] border-[#be123c]/20'
                }`}
              >
                <span className="text-[1.1rem] font-black tabular-nums block leading-none">
                  {kpiStats.belowWithoutAtestadoCount}
                </span>
                <span className="text-[0.64rem] font-bold block mt-0.5">
                  Sem Atestado
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* BARRA DE FILTROS SIMPLIFICADA: POR TURMA / TODAS AS TURMAS, ETAPA, ATESTADO E BUSCA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-2 border-t border-black/[0.06]">
          {/* Filtro 1: Por Turma ou Todas as Turmas */}
          <div className="lg:col-span-3">
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.8rem] rounded-xl border border-black/[0.07] cursor-pointer"
            >
              <option value="all">Todas as Turmas ({classes.length} turmas)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Turma {c.name} ({c.shift.replace('Turno ', '')})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro 2: Etapa (Infantil <60% vs Fundamental <75%) */}
          <div className="lg:col-span-3">
            <select
              value={selectedSegmentFilter}
              onChange={(e) => setSelectedSegmentFilter(e.target.value as any)}
              className="w-full min-h-[42px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.8rem] rounded-xl border border-black/[0.07] cursor-pointer"
            >
              <option value="all">Todas as Etapas (Inf. &lt;60% | Fund. &lt;75%)</option>
              <option value="fundamental">Ensino Fundamental (Meta &lt; 75%)</option>
              <option value="infantil">Educação Infantil (Meta &lt; 60%)</option>
            </select>
          </div>

          {/* Filtro 3: Se tem Atestado ou Não */}
          <div className="lg:col-span-2">
            <select
              value={selectedAtestadoFilter}
              onChange={(e) => setSelectedAtestadoFilter(e.target.value as any)}
              className="w-full min-h-[42px] px-3 bg-[#f1f5f9] text-[#0f172a] font-bold text-[0.8rem] rounded-xl border border-black/[0.07] cursor-pointer"
            >
              <option value="all">Com e Sem Atestado</option>
              <option value="com_atestado">Com Atestado Médico</option>
              <option value="sem_atestado">Sem Atestado (Injustificadas)</option>
            </select>
          </div>

          {/* Filtro 4: Modo de Exibição (Somente Abaixo da Meta vs Todos) */}
          <div className="lg:col-span-2">
            <select
              value={onlyBelowTarget ? 'abaixo_meta' : 'todos'}
              onChange={(e) => setOnlyBelowTarget(e.target.value === 'abaixo_meta')}
              className="w-full min-h-[42px] px-3 bg-[#fff1f2] text-[#be123c] font-extrabold text-[0.8rem] rounded-xl border border-[#be123c]/25 cursor-pointer"
            >
              <option value="abaixo_meta">Apenas Abaixo da Meta</option>
              <option value="todos">Todos os Estudantes (A–Z)</option>
            </select>
          </div>

          {/* Busca Rápida por Nome */}
          <div className="lg:col-span-2 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar aluno..."
              className="w-full min-h-[42px] pl-9 pr-7 bg-[#f1f5f9] text-[#0f172a] text-[0.8rem] rounded-xl border border-transparent focus:border-[#0f172a]/30 focus:bg-white focus:outline-none font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* TABELA NOMINAL SIMPLIFICADA E VISUAL EM ORDEM ALFABÉTICA (A-Z) */}
      <div className="bg-white rounded-3xl border border-black/[0.07] overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 bg-[#f8fafc] border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[0.8rem] font-bold text-[#0f172a]">
            <span className="material-symbols-outlined text-[18px] text-[#0071e3]">
              sort_by_alpha
            </span>
            <span>
              Listagem em Ordem Alfabética (A–Z) • {filteredRows.length}{' '}
              {filteredRows.length === 1 ? 'estudante listado' : 'estudantes listados'}
            </span>
          </div>
          <span className="text-[0.74rem] text-[#64748b] font-medium">
            Clique em qualquer estudante para abrir a Ficha Individual Completa
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <span className="material-symbols-outlined text-[38px] text-[#28cd41]">
              verified
            </span>
            <h3 className="text-[1.02rem] font-bold text-[#1d1d1f]">
              Nenhum estudante abaixo da meta para os filtros selecionados
            </h3>
            <p className="text-[0.82rem] text-[#6e6e73]">
              Altere o bimestre, a turma ou selecione &ldquo;Todos os Estudantes (A–Z)&rdquo; para visualizar toda a relação.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.8rem] border-collapse min-w-[980px]">
              <thead className="bg-[#f8fafc] text-[#475569] border-b border-black/[0.07] font-bold uppercase tracking-wider text-[0.68rem]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Estudante (Ordem Alfabética A–Z)</th>
                  <th className="py-3 px-3">Turma &amp; Etapa</th>
                  {currentBimester.months.length <= 2 ? (
                    currentBimester.months.map((mObj) => (
                      <th
                        key={mObj.name}
                        className="py-3 px-3 text-center bg-[#f1f5f9]/70 border-x border-black/[0.05]"
                      >
                        {mObj.name.slice(0, 3)}/27
                      </th>
                    ))
                  ) : (
                    <th className="py-3 px-3 text-center bg-[#f1f5f9]/70 border-x border-black/[0.05]">
                      Pior Mês no Período
                    </th>
                  )}
                  <th className="py-3 px-3 text-center">Faltas no Bimestre</th>
                  <th className="py-3 px-3 text-center">Tem Atestado?</th>
                  <th className="py-3 px-4 text-center">% Presença vs Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {filteredRows.map((row, idx) => {
                  const { student, cls, rep, hasAtestado, isBelowTarget } = row;
                  return (
                    <tr
                      key={`${cls.id}-${student.id}`}
                      onClick={() =>
                        onOpenStudentGrid(
                          student,
                          cls.id,
                          cls.name,
                          cls.classesHeld || 20
                        )
                      }
                      className={`cursor-pointer transition-colors ${
                        isBelowTarget
                          ? 'bg-[#fff1f2]/55 hover:bg-[#ffe4e6]/70'
                          : 'hover:bg-[#f8fafc]'
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-mono text-[0.74rem] font-bold text-[#64748b]">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>

                      {/* Estudante em Ordem Alfabética */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <StudentAvatar
                            student={student}
                            size="sm"
                            expandableOnClick={false}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-[#0f172a] block truncate text-[0.85rem]">
                              {student.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[0.7rem] text-[#64748b]">
                              <span>RA {student.ra}-{student.digRa}</span>
                              {student.nis && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono font-semibold text-[#006644]">
                                    NIS {student.nis}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Turma & Etapa (Infantil ≥60% ou Fundamental ≥75%) */}
                      <td className="py-3 px-3">
                        <span className="font-bold text-[#0f172a] block">
                          {cls.name}
                        </span>
                        <span className="text-[0.7rem] text-[#64748b] block">
                          {rep.isEducacaoInfantil
                            ? 'Ed. Infantil (Meta ≥60%)'
                            : 'Ens. Fundamental (Meta ≥75%)'}
                        </span>
                      </td>

                      {/* Meses do Bimestre (Ex: Fev + Mar) */}
                      {currentBimester.months.length <= 2 ? (
                        rep.monthsBreakdown.map((mb) => (
                          <td
                            key={mb.monthName}
                            className="py-3 px-3 text-center font-mono border-x border-black/[0.04]"
                          >
                            <span
                              className={`font-extrabold text-[0.84rem] block ${
                                mb.isBelowLegalThreshold
                                  ? 'text-[#be123c]'
                                  : 'text-[#0f172a]'
                              }`}
                            >
                              {mb.frequenciaPercent}%
                            </span>
                            <span className="text-[0.68rem] text-[#64748b] block">
                              {mb.faltas}F · {mb.atestados}A
                            </span>
                          </td>
                        ))
                      ) : (
                        <td className="py-3 px-3 text-center font-mono border-x border-black/[0.04]">
                          <span className="font-extrabold text-[0.82rem] text-[#be123c] block">
                            {row.worstMonthName}: {row.worstMonthPercent}%
                          </span>
                        </td>
                      )}

                      {/* Total de Faltas no Bimestre */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="font-extrabold text-[0.88rem] text-[#be123c]">
                          {rep.totalFaltasBimestre}
                        </span>
                        <span className="text-[0.7rem] text-[#64748b] block">
                          em {rep.totalDiasBimestre}d letivos
                        </span>
                      </td>

                      {/* Se Tem Atestado ou Não (Destaque Visual Limpo) */}
                      <td className="py-3 px-3 text-center">
                        {hasAtestado ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-[0.76rem] font-extrabold text-[#006644]">
                              SIM ({rep.totalAtestadosBimestre} atestado{rep.totalAtestadosBimestre > 1 ? 's' : ''})
                            </span>
                            <span className="text-[0.66rem] text-[#64748b]">
                              {rep.totalSemAtestadoBimestre} s/ justificativa
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-[0.76rem] font-extrabold text-[#be123c]">
                              NÃO
                            </span>
                            <span className="text-[0.66rem] text-[#9f1239]">
                              100% sem atestado
                            </span>
                          </div>
                        )}
                      </td>

                      {/* % Presença no Bimestre e Destaque de Meta */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-baseline gap-1.5 font-mono">
                            <span
                              className={`text-[0.95rem] font-black ${
                                isBelowTarget ? 'text-[#be123c]' : 'text-[#006644]'
                              }`}
                            >
                              {rep.frequenciaBimestrePercent}%
                            </span>
                            <span className="text-[0.68rem] text-[#64748b]">
                              / meta {rep.minLegalPresencePercent}%
                            </span>
                          </div>
                          <div className="w-28 h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isBelowTarget ? 'bg-[#be123c]' : 'bg-[#006644]'
                              }`}
                              style={{
                                width: `${Math.min(100, Math.max(8, rep.frequenciaBimestrePercent))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
