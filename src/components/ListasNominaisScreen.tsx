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
  onBack?: () => void;
}

export const ListasNominaisScreen: React.FC<ListasNominaisScreenProps> = ({
  classes,
  userRole,
  onOpenStudentGrid,
  onBack,
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
      <div className="max-w-xl mx-auto my-12 p-6 bg-white rounded-3xl shadow-sm text-center space-y-2">
        <span className="material-symbols-outlined text-[36px] text-[#ff3b30]">
          lock
        </span>
        <h2 className="text-lg font-bold text-[#1d1d1f]">
          Acesso Restrito à Gestão / Secretaria
        </h2>
        <p className="text-sm text-[#6e6e73]">
          O painel consolidado do Bolsa Família e metas bimestrais é exclusivo do perfil Administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-w-0 max-w-[1600px] mx-auto space-y-4 pb-12 animate-gentle-fade">
      {toastMsg && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-lg mx-auto animate-in fade-in duration-100">
          <div className="bg-[#1d1d1f] text-white px-4 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-[#28cd41] shrink-0">
              check_circle
            </span>
            <p className="text-sm font-semibold leading-snug break-words min-w-0">{toastMsg}</p>
          </div>
        </div>
      )}

      {/* Breadcrumb Limpo */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#48484a] py-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {onBack && (
            <>
              <button
                type="button"
                onClick={onBack}
                className="text-[#3c3c43] hover:text-[#111827] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Voltar</span>
              </button>
              <span className="text-[#8e8e93]">/</span>
            </>
          )}
          <span className="font-semibold text-[#111827]">Bolsa Família &amp; Fretado</span>
        </div>
        <span className="text-[#48484a] text-xs hidden sm:inline">
          Listas Nominais e Condicionalidades Sociais
        </span>
      </div>

      {/* CABEÇALHO SIMPLIFICADO & EXPORTAÇÃO */}
      <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 min-w-0">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#48484a]">
              <span className="font-semibold text-[#111827]">Busca Ativa Bimestral</span>
              <span aria-hidden="true">·</span>
              <span className="break-words">{SCHOOL_NAME}</span>
            </div>
            <h1 className="text-[21px] sm:text-2xl font-semibold text-[#111827] tracking-tight leading-snug break-words">
              Abaixo da Meta — {currentBimester.shortLabel}
            </h1>
            <p className="text-[13px] sm:text-sm text-[#3c3c43] leading-relaxed break-words">
              Lista em <strong>ordem alfabética (A–Z)</strong> para Bolsa Família e Transporte Fretado.
              <span className="text-[#b42318] font-semibold"> Fundamental &lt; 75% · Infantil &lt; 60%</span>.
            </p>
          </div>

          {/* Ações de Exportação Proporcionais */}
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:inline-flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExportXLS}
              className="min-w-0 min-h-[44px] px-4 py-2 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-semibold text-[13px] flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-[0.98] whitespace-normal text-center"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">download</span>
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="min-w-0 min-h-[44px] px-4 py-2 rounded-xl bg-[#e9e9ef] hover:bg-[#dcdce4] text-[#111827] font-semibold text-[13px] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-[0.98] whitespace-normal text-center"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">print</span>
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>

        {/* Link imediato quando uma Nova Google Sheet é gerada */}
        {createdSheetUrl && (
          <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <span className="material-symbols-outlined text-[20px] text-emerald-800">
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
              className="px-4 py-2 rounded-xl bg-emerald-800 text-white font-semibold text-xs inline-flex items-center gap-1.5 self-start sm:self-auto hover:bg-emerald-900 shadow-2xs"
            >
              <span>Abrir Planilha no Google Sheets</span>
              <span className="material-symbols-outlined text-[15px]">
                open_in_new
              </span>
            </a>
          </div>
        )}

        {/* SELETOR VISUAL DE BIMESTRES */}
        <div className="pt-1">
          <span className="text-xs font-semibold text-[#3c3c43] block mb-2">
            Recorte Bimestral (2027)
          </span>
          <div className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-6 gap-2">
            {OFFICIAL_BIMESTERS_2027.map((bim) => {
              const isSelected = bim.id === selectedBimesterId;
              return (
                <button
                  key={bim.id}
                  type="button"
                  onClick={() => setSelectedBimesterId(bim.id)}
                  className={`p-3 rounded-2xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1d1d1f] text-white shadow-sm'
                      : 'bg-[#e9e9ef] hover:bg-[#dcdce4] text-[#111827]'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold block ${
                      isSelected ? 'text-white/85' : 'text-[#48484a]'
                    }`}
                  >
                    {bim.id === 'anual' ? 'Consolidado' : `${bim.id.replace('bim', 'º Bimestre')}`}
                  </span>
                  <span className="text-sm font-semibold block mt-0.5 tabular-nums">
                    {bim.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* DESTAQUES VISUAIS (SEM CONTORNO / ZERO RING) */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3 pt-1">
          {/* Card 1: Total Abaixo da Meta */}
          <button
            type="button"
            onClick={() => {
              setOnlyBelowTarget(true);
              setSelectedSegmentFilter('all');
              setSelectedAtestadoFilter('all');
            }}
            className={`text-left rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 transition-all cursor-pointer min-w-0 break-words ${
              onlyBelowTarget &&
              selectedSegmentFilter === 'all' &&
              selectedAtestadoFilter === 'all'
                ? 'bg-rose-200 text-rose-950 shadow-sm'
                : 'bg-rose-100/90 hover:bg-rose-200/80 text-rose-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-rose-900">
                Abaixo da Meta
              </span>
              <span className="material-symbols-outlined text-[18px] text-rose-800 shrink-0">
                warning
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-semibold text-rose-950 tabular-nums block mt-1.5 leading-none">
              {kpiStats.totalBelowTarget}
            </span>
            <span className="text-xs font-medium text-rose-900 block mt-1.5 tabular-nums">
              de {kpiStats.totalEvaluated} ativos
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
            className={`text-left rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 transition-all cursor-pointer min-w-0 break-words ${
              selectedSegmentFilter === 'fundamental'
                ? 'bg-sky-200 text-sky-950 shadow-sm'
                : 'bg-sky-100/90 hover:bg-sky-200/80 text-sky-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-sky-900">
                Fundamental (&lt; 75%)
              </span>
              <span className="material-symbols-outlined text-[18px] text-sky-800 shrink-0">
                menu_book
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-semibold text-sky-950 tabular-nums block mt-1.5 leading-none">
              {kpiStats.belowFundamentalCount}
            </span>
            <span className="text-xs font-medium text-sky-900 block mt-1.5">
              1º ao 5º Ano
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
            className={`text-left rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 transition-all cursor-pointer min-w-0 break-words ${
              selectedSegmentFilter === 'infantil'
                ? 'bg-amber-200 text-amber-950 shadow-sm'
                : 'bg-amber-100/90 hover:bg-amber-200/80 text-amber-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-amber-950">
                Infantil (&lt; 60%)
              </span>
              <span className="material-symbols-outlined text-[18px] text-amber-800 shrink-0">
                child_care
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-semibold text-amber-950 tabular-nums block mt-1.5 leading-none">
              {kpiStats.belowInfantilCount}
            </span>
            <span className="text-xs font-medium text-amber-900 block mt-1.5">
              G4 e G5
            </span>
          </button>

          {/* Card 4: Com Atestado vs Sem Atestado */}
          <div className="rounded-2xl sm:rounded-3xl bg-[#e9e9ef] p-3.5 sm:p-4 flex flex-col justify-between col-span-2 sm:col-span-1 min-w-0 break-words">
            <span className="text-xs font-semibold text-[#3c3c43] block">
              Justificativa Médica
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedAtestadoFilter(
                    selectedAtestadoFilter === 'com_atestado' ? 'all' : 'com_atestado'
                  )
                }
                className={`p-2 rounded-xl text-center cursor-pointer transition-all min-w-0 ${
                  selectedAtestadoFilter === 'com_atestado'
                    ? 'bg-emerald-800 text-white font-semibold'
                    : 'bg-emerald-100 text-emerald-950 hover:bg-emerald-200/80 font-semibold'
                }`}
              >
                <span className="text-lg font-semibold tabular-nums block leading-none">
                  {kpiStats.belowWithAtestadoCount}
                </span>
                <span className="text-xs font-medium block mt-1 break-words leading-tight">
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
                className={`p-2 rounded-xl text-center cursor-pointer transition-all min-w-0 ${
                  selectedAtestadoFilter === 'sem_atestado'
                    ? 'bg-rose-800 text-white font-semibold'
                    : 'bg-rose-100 text-rose-950 hover:bg-rose-200/80 font-semibold'
                }`}
              >
                <span className="text-lg font-semibold tabular-nums block leading-none">
                  {kpiStats.belowWithoutAtestadoCount}
                </span>
                <span className="text-xs font-medium block mt-1 break-words leading-tight">
                  Sem Atestado
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* BARRA DE FILTROS SIMPLIFICADA SEM CONTORNOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-2">
          {/* Filtro 1: Por Turma ou Todas as Turmas */}
          <div className="lg:col-span-3">
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full min-h-[44px] px-3.5 bg-[#e9e9ef] text-[#111827] font-semibold text-sm rounded-2xl cursor-pointer focus:outline-none"
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
              className="w-full min-h-[44px] px-3.5 bg-[#e9e9ef] text-[#111827] font-semibold text-sm rounded-2xl cursor-pointer focus:outline-none"
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
              className="w-full min-h-[44px] px-3.5 bg-[#e9e9ef] text-[#111827] font-semibold text-sm rounded-2xl cursor-pointer focus:outline-none"
            >
              <option value="all">Com e Sem Atestado</option>
              <option value="com_atestado">Com Atestado Médico</option>
              <option value="sem_atestado">Sem Atestado (Injustificadas)</option>
            </select>
          </div>

          {/* Filtro 4: Modo de Exibição */}
          <div className="lg:col-span-2">
            <select
              value={onlyBelowTarget ? 'abaixo_meta' : 'todos'}
              onChange={(e) => setOnlyBelowTarget(e.target.value === 'abaixo_meta')}
              className="w-full min-h-[44px] px-3.5 bg-rose-100 text-rose-950 font-semibold text-sm rounded-2xl cursor-pointer focus:outline-none"
            >
              <option value="abaixo_meta">Apenas Abaixo da Meta</option>
              <option value="todos">Todos os Estudantes (A–Z)</option>
            </select>
          </div>

          {/* Busca Rápida por Nome */}
          <div className="lg:col-span-2 relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#48484a] text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar aluno..."
              className="w-full min-h-[44px] pl-10 pr-8 bg-[#e9e9ef] text-[#111827] text-sm rounded-2xl focus:bg-white focus:outline-none font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-[#111827] cursor-pointer"
                aria-label="Limpar busca"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* RELAÇÃO NOMINAL RESPONSIVA (CARDS NO MOBILE + TABELA NO DESKTOP, ZERO CONTORNOS) */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 bg-[#f2f2f7] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
            <span className="material-symbols-outlined text-[20px] text-[#0066cc]">
              sort_by_alpha
            </span>
            <span>
              Ordem Alfabética (A–Z) · {filteredRows.length}{' '}
              {filteredRows.length === 1 ? 'estudante' : 'estudantes'}
            </span>
          </div>
          <span className="text-xs text-[#48484a] font-medium">
            Toque no estudante para abrir a Ficha Individual
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <span className="material-symbols-outlined text-[38px] text-[#047857]">
              verified
            </span>
            <h3 className="text-base font-semibold text-[#111827]">
              Nenhum estudante abaixo da meta para os filtros selecionados
            </h3>
            <p className="text-sm text-[#3c3c43]">
              Altere o bimestre, a turma ou selecione &ldquo;Todos os Estudantes (A–Z)&rdquo; para visualizar toda a relação.
            </p>
          </div>
        ) : (
          <>
            {/* Cartões Mobile / Tablet (< lg) — Zero corte ou rolagem lateral forçada */}
            <div className="lg:hidden p-3 sm:p-4 space-y-2.5">
              {filteredRows.map((row, idx) => {
                const { student, cls, rep, hasAtestado, isBelowTarget } = row;
                return (
                  <button
                    key={`mob-${cls.id}-${student.id}`}
                    type="button"
                    onClick={() =>
                      onOpenStudentGrid(
                        student,
                        cls.id,
                        cls.name,
                        cls.classesHeld || 20
                      )
                    }
                    className={`w-full min-w-0 text-left p-3.5 rounded-2xl transition-colors cursor-pointer space-y-2.5 ${
                      isBelowTarget
                        ? 'bg-rose-50/90 hover:bg-rose-100/80'
                        : 'bg-[#f4f4f8] hover:bg-[#ebebf0]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5 min-w-0">
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-xs font-semibold text-[#48484a] tabular-nums w-5 shrink-0 pt-0.5 sm:pt-0">
                          {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <StudentAvatar
                          student={student}
                          size="sm"
                          expandableOnClick={false}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-[#111827] block break-words leading-snug text-[14px]">
                            {student.name}
                          </span>
                          <span className="text-xs text-[#48484a] block break-words leading-snug">
                            {cls.name} · RA {student.ra}-{student.digRa}
                            {student.nis ? ` · NIS ${student.nis}` : ''}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums shrink-0 ${
                          isBelowTarget ? 'text-[#b42318]' : 'text-[#006644]'
                        }`}
                      >
                        {rep.frequenciaBimestrePercent}%
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-0.5">
                      <span className="text-[#3c3c43] tabular-nums font-medium break-words">
                        <strong className="text-[#b42318]">{rep.totalFaltasBimestre} faltas</strong> em {rep.totalDiasBimestre}d · Meta {rep.minLegalPresencePercent}%
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg font-semibold ${
                          hasAtestado
                            ? 'bg-emerald-100 text-emerald-950'
                            : 'bg-rose-100 text-rose-950'
                        }`}
                      >
                        {hasAtestado
                          ? `Com Atestado (${rep.totalAtestadosBimestre})`
                          : 'Sem Atestado'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tabela Desktop (>= lg) — Zebra tonal limpa sem divisores */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[920px]">
                <thead className="bg-[#f2f2f7] text-[#3c3c43] font-semibold text-xs">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">Estudante (Ordem Alfabética A–Z)</th>
                    <th className="py-3 px-3">Turma &amp; Etapa</th>
                    {currentBimester.months.length <= 2 ? (
                      currentBimester.months.map((mObj) => (
                        <th
                          key={mObj.name}
                          className="py-3 px-3 text-center bg-[#e9e9ef]"
                        >
                          {mObj.name.slice(0, 3)}/27
                        </th>
                      ))
                    ) : (
                      <th className="py-3 px-3 text-center bg-[#e9e9ef]">
                        Pior Mês no Período
                      </th>
                    )}
                    <th className="py-3 px-3 text-center">Faltas no Bimestre</th>
                    <th className="py-3 px-3 text-center">Tem Atestado?</th>
                    <th className="py-3 px-4 text-center">% Presença vs Meta</th>
                  </tr>
                </thead>
                <tbody>
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
                        className={`cursor-pointer transition-colors duration-100 ${
                          isBelowTarget
                            ? 'bg-rose-50/70 hover:bg-rose-100/75 odd:bg-rose-50'
                            : 'hover:bg-[#ebebf0] odd:bg-[#f8f8fb]'
                        }`}
                      >
                        <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-[#48484a] tabular-nums">
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
                              <span className="font-semibold text-[#111827] block break-words leading-snug text-sm sm:text-[15px]">
                                {student.name}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs text-[#48484a]">
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
                          <span className="font-semibold text-[#111827] block">
                            {cls.name}
                          </span>
                          <span className="text-xs text-[#48484a] block">
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
                              className="py-3 px-3 text-center font-mono tabular-nums"
                            >
                              <span
                                className={`font-semibold text-sm block ${
                                  mb.isBelowLegalThreshold
                                    ? 'text-[#b42318]'
                                    : 'text-[#111827]'
                                }`}
                              >
                                {mb.frequenciaPercent}%
                              </span>
                              <span className="text-xs text-[#48484a] block">
                                {mb.faltas}F · {mb.atestados}A
                              </span>
                            </td>
                          ))
                        ) : (
                          <td className="py-3 px-3 text-center font-mono tabular-nums">
                            <span className="font-semibold text-sm text-[#b42318] block">
                              {row.worstMonthName}: {row.worstMonthPercent}%
                            </span>
                          </td>
                        )}

                        {/* Total de Faltas no Bimestre */}
                        <td className="py-3 px-3 text-center font-mono tabular-nums">
                          <span className="font-semibold text-sm text-[#b42318]">
                            {rep.totalFaltasBimestre}
                          </span>
                          <span className="text-xs text-[#48484a] block">
                            em {rep.totalDiasBimestre}d letivos
                          </span>
                        </td>

                        {/* Se Tem Atestado ou Não */}
                        <td className="py-3 px-3 text-center">
                          {hasAtestado ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="text-xs font-semibold text-[#006644]">
                                SIM ({rep.totalAtestadosBimestre} atestado{rep.totalAtestadosBimestre > 1 ? 's' : ''})
                              </span>
                              <span className="text-xs text-[#48484a]">
                                {rep.totalSemAtestadoBimestre} s/ justificativa
                              </span>
                            </div>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <span className="text-xs font-semibold text-[#b42318]">
                                NÃO
                              </span>
                              <span className="text-xs text-[#9f1239]">
                                100% sem atestado
                              </span>
                            </div>
                          )}
                        </td>

                        {/* % Presença no Bimestre e Destaque de Meta */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
                              <span
                                className={`text-base font-semibold ${
                                  isBelowTarget ? 'text-[#b42318]' : 'text-[#006644]'
                                }`}
                              >
                                {rep.frequenciaBimestrePercent}%
                              </span>
                              <span className="text-xs text-[#48484a]">
                                / meta {rep.minLegalPresencePercent}%
                              </span>
                            </div>
                            <div className="w-28 h-1.5 rounded-full bg-[#dcdce4] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isBelowTarget ? 'bg-[#b42318]' : 'bg-[#006644]'
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
          </>
        )}
      </div>
    </div>
  );
};
