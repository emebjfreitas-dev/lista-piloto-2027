import React, { useMemo } from 'react';
import {
  ClassGroup,
  Student,
  UserRole,
  SchoolNotice,
  AttendanceWindowConfig,
  ScreenType,
} from '../types';
import { QuadroAvisosCard } from './QuadroAvisosCard';
import { LembretePrazoFrequenciaCard } from './LembretePrazoFrequenciaCard';
import { ResumoFaltasCriticasCard } from './ResumoFaltasCriticasCard';

export interface HomeScreenProps {
  userRole: UserRole;
  userEmail: string;
  userName: string;
  classes: ClassGroup[];
  assignedClassId: string;
  assignedClassIds: string[];
  attendanceWindowConfig: AttendanceWindowConfig;
  schoolNotices: SchoolNotice[];
  onSaveSchoolNotices?: (notices: SchoolNotice[]) => void;
  onNavigateToScreen: (screen: ScreenType) => void;
  onSelectClassForMonthlyAttendance?: (cls: ClassGroup) => void;
  onSelectStudentForConsecutiveScreen?: (classId: string, studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student, className?: string) => void;
  onNavigateToAcessos?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userRole,
  userEmail,
  userName,
  classes,
  assignedClassId,
  assignedClassIds,
  attendanceWindowConfig,
  schoolNotices,
  onSaveSchoolNotices,
  onNavigateToScreen,
  onSelectClassForMonthlyAttendance,
  onSelectStudentForConsecutiveScreen,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onNavigateToAcessos,
}) => {
  // Compute overall school statistics
  const schoolStats = useMemo(() => {
    let totalStudents = 0;
    let sumPresence = 0;
    let countedClasses = 0;
    let criticalConsecutiveCount = 0;

    classes.forEach((cls) => {
      totalStudents += cls.students.length;
      if (typeof cls.presenceRate === 'number' && cls.presenceRate > 0) {
        sumPresence += cls.presenceRate;
        countedClasses++;
      }
      cls.students.forEach((s) => {
        if (s.consecutiveAbsenceAlert?.active) {
          criticalConsecutiveCount++;
        }
      });
    });

    const avgPresence = countedClasses > 0 ? Math.round(sumPresence / countedClasses) : 92;

    return {
      totalClasses: classes.length,
      totalStudents,
      avgPresence,
      criticalConsecutiveCount,
    };
  }, [classes]);

  const userRoleLabel =
    userRole === 'admin'
      ? 'Gestão Escolar (Direção / Coordenação)'
      : userRole === 'peb2'
      ? 'Educador(a) Especialista PEB II'
      : 'Professora Regente PEB I';

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto space-y-4 pb-16 animate-gentle-fade text-[#1d1d1f]">
      {/* CABEÇALHO EXECUTIVO INSTITUCIONAL */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[0.72rem] font-bold text-[#86868b]">
              <span className="px-2.5 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0066cc] uppercase tracking-wider font-extrabold text-[0.66rem]">
                PORTAL INSTITUCIONAL
              </span>
              <span>•</span>
              <span className="text-[#1d1d1f] font-semibold">
                SECRETARIA DE EDUCAÇÃO DO MUNICÍPIO DE JUNDIAÍ
              </span>
              <span>•</span>
              <span className="text-[#6e6e73]">
                EMEB PROF. JOAQUIM CANDELÁRIO DE FREITAS
              </span>
            </div>

            <h1 className="text-[1.45rem] sm:text-[1.8rem] font-black text-[#1d1d1f] tracking-tight leading-tight">
              Visão Geral &amp; Diário Escolar
            </h1>

            <p className="text-[0.8rem] text-[#6e6e73]">
              Bem-vindo(a), <strong className="text-[#1d1d1f]">{userName}</strong> · Perfil:{' '}
              <span className="font-semibold text-[#0066cc]">{userRoleLabel}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => onNavigateToScreen('turmas')}
              className="h-[40px] px-4 rounded-full bg-[#1d1d1f] hover:bg-black text-white font-bold text-[0.78rem] flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-97"
            >
              <span className="material-symbols-outlined text-[18px]">groups</span>
              <span>{userRole === 'usuario' ? 'Acessar Minha Turma' : 'Ver Quadro de Turmas'}</span>
            </button>
          </div>
        </div>

        {/* Linha de Indicadores Macro da Escola */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-black/[0.04]">
          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Total de Turmas
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#1d1d1f] tabular-nums">
                {schoolStats.totalClasses}
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">turmas ativas</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Estudantes Ativos
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#1d1d1f] tabular-nums">
                {schoolStats.totalStudents}
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">matriculados</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Frequência Média
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#005035] tabular-nums">
                {schoolStats.avgPresence}%
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">meta MEC ≥ 75%</span>
            </div>
          </div>

          <div className="bg-[#f5f5f7] rounded-2xl p-3 border border-black/[0.04]">
            <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Busca Ativa (ECA)
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono text-[#ba1a1a] tabular-nums">
                {schoolStats.criticalConsecutiveCount}
              </span>
              <span className="text-[0.7rem] font-medium text-[#6e6e73]">alertas ativos</span>
            </div>
          </div>
        </div>
      </section>

      {/* PORTAS DE ENTRADA / ATALHOS DE ALTO NÍVEL */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Cartão 1: Turmas */}
        <div
          onClick={() => onNavigateToScreen('turmas')}
          className="bg-white rounded-3xl p-4 border border-black/[0.06] hover:border-[#0071e3]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[22px]">groups</span>
            </div>
            <span className="material-symbols-outlined text-[#86868b] text-[18px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </div>

          <div className="mt-3">
            <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">
              {userRole === 'usuario' ? 'Minha Turma' : 'Quadro de Turmas'}
            </h2>
            <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
              {userRole === 'usuario'
                ? 'Relação nominal, matrículas e dados cadastrais dos estudantes.'
                : 'Todas as 40 turmas da escola com filtros de turno e busca.'}
            </p>
          </div>
        </div>

        {/* Cartão 2: Faltas do Mês */}
        {userRole !== 'peb2' && (
          <div
            onClick={() => onNavigateToScreen('frequencia_mensal')}
            className="bg-white rounded-3xl p-4 border border-black/[0.06] hover:border-[#005035]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-[#eaf6ef] text-[#005035] flex items-center justify-center group-hover:bg-[#005035] group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">edit_calendar</span>
              </div>
              <span className="material-symbols-outlined text-[#86868b] text-[18px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>

            <div className="mt-3">
              <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Faltas do Mês</h2>
              <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
                Lançamento rápido de faltas e atestados com sincronização contínua.
              </p>
            </div>
          </div>
        )}

        {/* Cartão 3: Mapa de Trajetos & KM */}
        <div
          onClick={() => onNavigateToScreen('mapa_estudantes')}
          className="bg-white rounded-3xl p-4 border border-black/[0.06] hover:border-[#0071e3]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[22px]">distance</span>
            </div>
            <span className="material-symbols-outlined text-[#86868b] text-[18px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </div>

          <div className="mt-3">
            <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Mapa de Trajetos</h2>
            <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
              Geolocalização com fotos dos alunos, distâncias e tempos de percurso até a EMEB.
            </p>
          </div>
        </div>

        {/* Cartão 4: Resumo Mensal MEC (Admin) ou Faltas Consecutivas */}
        {userRole === 'admin' ? (
          <div
            onClick={() => onNavigateToScreen('resumo')}
            className="bg-white rounded-3xl p-4 border border-black/[0.06] hover:border-[#1d1d1f]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center group-hover:bg-[#1d1d1f] group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">analytics</span>
              </div>
              <span className="material-symbols-outlined text-[#86868b] text-[18px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>

            <div className="mt-3">
              <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Scorecard Executivo MEC</h2>
              <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
                Permanência escolar, conformidade com a LDB e matriz comparativa.
              </p>
            </div>
          </div>
        ) : (
          <div
            onClick={() => onNavigateToScreen('faltas_consecutivas')}
            className="bg-white rounded-3xl p-4 border border-black/[0.06] hover:border-[#ba1a1a]/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-[#fff2f2] text-[#ba1a1a] flex items-center justify-center group-hover:bg-[#ba1a1a] group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">crisis_alert</span>
              </div>
              <span className="material-symbols-outlined text-[#86868b] text-[18px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>

            <div className="mt-3">
              <h2 className="text-[0.95rem] font-extrabold text-[#1d1d1f]">Busca Ativa (ECA)</h2>
              <p className="text-[0.72rem] text-[#6e6e73] mt-0.5 leading-snug">
                Acompanhamento e notificação de ciclos de 3+, 5+ e 10+ faltas consecutivas.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SISTEMA DE LEMBRETES AUTOMÁTICOS DE PRAZOS DE ENCERRAMENTO DA FREQUÊNCIA */}
      <LembretePrazoFrequenciaCard
        attendanceWindowConfig={attendanceWindowConfig}
        userRole={userRole}
        classes={classes}
        assignedClassId={assignedClassId}
        assignedClassIds={assignedClassIds}
        onOpenMonthlyAttendance={onSelectClassForMonthlyAttendance}
        onNavigateToAcessos={onNavigateToAcessos}
      />

      {/* QUADRO DE AVISOS INSTITUCIONAL (COMUNICADOS DA ESCOLA) */}
      <QuadroAvisosCard
        notices={schoolNotices}
        userRole={userRole}
        userEmail={userEmail}
        userName={userName}
        variant="dashboard"
        onSaveNotices={onSaveSchoolNotices}
      />

      {/* RESUMO DE FALTAS CRÍTICAS (BUSCA ATIVA ESCOLAR • ECA) */}
      <ResumoFaltasCriticasCard
        classes={classes}
        userRole={userRole}
        onSelectStudentForConsecutiveScreen={(cls, student) => {
          onSelectStudentForConsecutiveScreen?.(cls.id, student.id);
        }}
        onOpenStudentGrid={
          onOpenStudentGrid
            ? (student) => onOpenStudentGrid(student)
            : undefined
        }
        onOpenStudentPdf={
          onOpenStudentPdf
            ? (student, className) => onOpenStudentPdf(student, className)
            : undefined
        }
      />
    </div>
  );
};
