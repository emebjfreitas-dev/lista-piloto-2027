import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { List, useDynamicRowHeight, useVirtualizer, RowComponentProps } from 'react-window';
import { ClassGroup, Student, UserRole, SchoolNotice } from '../types';
import {
  DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  ClassExportSortOrder,
  ClassExportStatusFilter,
  downloadClassCustomXLS,
} from '../services/db';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import {
  getStudentAttendanceMetrics,
  getStudentConsecutiveAlertInfo,
} from '../utils/attendanceRules';
import {
  resolveStudentGender,
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
} from '../utils/genderDictionary';
import { StudentAvatar } from './StudentAvatar';
import { StudentDataExpansionPanel } from './StudentDataExpansionPanel';
import { DetalhesExportModal } from './DetalhesExportModal';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BellRing,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  FileWarning,
  FilterX,
  LayoutGrid,
  List as ListIcon,
  MessageCircle,
  Rows3,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

type ViewMode = 'grid' | 'compact' | 'table';
type StatusFilter =
  | 'all'
  | 'ativos'
  | 'sem_ficha_pdf'
  | 'movimentados'
  | 'bolsa_familia'
  | 'alerta';

interface DetalhesTurmaScreenProps {
  classGroup: ClassGroup;
  assignedClasses?: ClassGroup[];
  onSwitchAssignedClass?: (cls: ClassGroup) => void;
  userRole?: UserRole;
  userEmail?: string;
  userName?: string;
  schoolNotices?: SchoolNotice[];
  onSaveSchoolNotices?: (updatedNotices: SchoolNotice[]) => void;
  isMainAdminAccount?: boolean;
  onReturnToAdminMode?: () => void;
  canLaunchAttendance?: boolean;
  onGoToMonthlyAttendance: () => void;
  onGoToMonthlySummary: () => void;
  onOpenStudentList: () => void;
  onOpenNotes: () => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onNavigateToBolsaFamilia?: () => void;
  onNavigateToConsecutiveAbsences?: () => void;
  onNavigateToSheet: () => void;
  onBackToClasses: () => void;
  initialStatusFilter?: StatusFilter;
}

interface EstudanteCardProps {
  student: Student;
  classGroup: ClassGroup;
  diasLetivosMes: number;
  minLegalPresence: number;
  isExpanded: boolean;
  onToggleExpand: (studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  showMissingPdfAction?: boolean;
  renderStudentDetailedExpansion: (student: Student) => React.ReactNode;
}

const EstudanteCard: React.FC<EstudanteCardProps> = memo(({
  student,
  diasLetivosMes,
  isExpanded,
  onToggleExpand,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onOpenPhotoModal,
  showMissingPdfAction = true,
  renderStudentDetailedExpansion,
}) => {
  const m = getStudentAttendanceMetrics(student, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
  const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
  const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
  const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
  const isOtherNonActive = !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';
  const isNonActive = isTransferred || isRemanejado || isOtherNonActive;

  const cardSurfaceClasses = isExpanded
    ? 'bg-white shadow-sm'
    : isTransferred
    ? 'bg-amber-50/75 hover:bg-amber-50 shadow-2xs'
    : isRemanejado
    ? 'bg-purple-50/75 hover:bg-purple-50 shadow-2xs'
    : isOtherNonActive
    ? 'bg-slate-100/90 shadow-2xs'
    : 'bg-white hover:bg-[#fafbfd] shadow-2xs';

  const cumulativeOccs = getStudentCumulativeOccurrences(student);
  const latestConsecOcc = cumulativeOccs.length > 0 ? cumulativeOccs[cumulativeOccs.length - 1] : null;
  const consecDaysCount = latestConsecOcc ? latestConsecOcc.selectedDates.length : 0;

  const studentGenderInfo = getStudentGenderLabel(student);
  const guardian1Info = resolveGuardianRelationshipInfo(student.filiacao1 || student.guardianName, 'filiacao1', student.notes);
  const hasStudentPdf = Boolean(
    (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
      (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
  );
  const waList = buildWhatsAppLinksFromPhoneString(
    student.telefones || student.guardianPhone,
    student.name
  );

  return (
    <article
      onClick={() => onToggleExpand(student.id)}
      className={`rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 cursor-pointer select-none transition-colors duration-100 min-w-0 ${
        isExpanded ? '' : 'h-full'
      } ${cardSurfaceClasses}`}
    >
      <div className="space-y-3 min-w-0">
        <div className="flex items-start justify-between gap-2.5 min-w-0">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <StudentAvatar
              student={student}
              size={isExpanded ? 'xl' : 'lg'}
              onUploadPhotoClick={onOpenPhotoModal ? () => onOpenPhotoModal(student) : undefined}
              className="bg-[#edf2f7]"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-semibold tracking-[-0.006em] text-slate-700 tabular-nums">
                <span>{student.number.toString().padStart(2, '0')}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    m.isBelowLegalThreshold && !isNonActive
                      ? 'text-[#b42318] font-semibold'
                      : undefined
                  }
                >
                  {m.frequenciaPercent}%
                </span>
                {isNonActive && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-700">
                      {isTransferred
                        ? studentGenderInfo.transferidoTerm
                        : isRemanejado
                        ? studentGenderInfo.remanejadoTerm
                        : sit}
                    </span>
                  </>
                )}
                {student.deficiencia && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-purple-800 font-semibold">AEE</span>
                  </>
                )}
                {consecDaysCount >= 3 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        consecDaysCount >= 5
                          ? 'text-[#b42318] font-semibold'
                          : 'text-[#b45309] font-semibold'
                      }
                    >
                      {consecDaysCount} faltas seguidas
                    </span>
                  </>
                )}
              </div>

              <h3
                className={`mt-1 text-[18px] font-semibold tracking-[-0.024em] leading-[1.22] break-words ${
                  isNonActive ? 'text-slate-700' : 'text-slate-950'
                }`}
              >
                {student.name}
              </h3>
            </div>
          </div>

          <ChevronDown
            className={`w-5 h-5 text-slate-600 shrink-0 mt-0.5 transition-transform duration-200 ${
              isExpanded ? 'rotate-180 text-[#092e70]' : ''
            }`}
            aria-hidden="true"
          />
        </div>

        {(guardian1Info.cleanName || waList.length > 0) && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-between gap-2 text-[12.5px] font-normal tracking-[-0.008em] text-[#475569] min-w-0"
          >
            <span className="truncate min-w-0">
              {guardian1Info.cleanName}
            </span>
            {waList.length > 0 && (
              <a
                href={waList[0].waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#047857] hover:underline tabular-nums shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{waList[0].display}</span>
              </a>
            )}
          </div>
        )}
      </div>

      {isExpanded && renderStudentDetailedExpansion(student)}

      {!isExpanded && (onOpenPhotoModal || onOpenStudentPdf || onOpenStudentGrid) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="grid grid-cols-3 gap-2 min-w-0"
        >
          {onOpenPhotoModal && (
            <button
              type="button"
              onClick={() => onOpenPhotoModal(student)}
              className="min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Camera className="w-4 h-4 text-[#475569] shrink-0" />
              <span>Foto</span>
            </button>
          )}

          {onOpenStudentPdf && (hasStudentPdf || showMissingPdfAction) && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenStudentPdf(student);
              }}
              className={`min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                hasStudentPdf
                  ? 'bg-[#dce7fb] hover:bg-[#c8daf9] text-[#092e70]'
                  : 'bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>PDF</span>
            </button>
          )}

          {onOpenStudentGrid && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenStudentGrid(student);
              }}
              className="min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LayoutGrid className="w-4 h-4 text-[#475569] shrink-0" />
              <span>Ficha</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}, (prev, next) => {
  return (
    prev.student === next.student &&
    prev.isExpanded === next.isExpanded &&
    prev.diasLetivosMes === next.diasLetivosMes &&
    prev.minLegalPresence === next.minLegalPresence &&
    prev.showMissingPdfAction === next.showMissingPdfAction &&
    prev.onOpenPhotoModal === next.onOpenPhotoModal &&
    prev.onOpenStudentPdf === next.onOpenStudentPdf &&
    prev.onOpenStudentGrid === next.onOpenStudentGrid &&
    prev.renderStudentDetailedExpansion === next.renderStudentDetailedExpansion
  );
});
EstudanteCard.displayName = 'EstudanteCard';

interface LinhaEstudanteProps {
  student: Student;
  classGroup: ClassGroup;
  diasLetivosMes: number;
  minLegalPresence: number;
  isExpanded: boolean;
  onToggleExpand: (studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  showMissingPdfAction?: boolean;
  renderStudentDetailedExpansion: (student: Student) => React.ReactNode;
}

const LinhaEstudante: React.FC<LinhaEstudanteProps> = memo(({
  student,
  diasLetivosMes,
  isExpanded,
  onToggleExpand,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onOpenPhotoModal,
  showMissingPdfAction = true,
  renderStudentDetailedExpansion,
}) => {
  const m = getStudentAttendanceMetrics(student, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
  const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
  const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
  const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
  const isOtherNonActive = !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';
  const isNonActive = isTransferred || isRemanejado || isOtherNonActive;
  const studentGenderInfo = getStudentGenderLabel(student);
  const guardian1Info = resolveGuardianRelationshipInfo(student.filiacao1 || student.guardianName, 'filiacao1', student.notes);
  const hasPdf = Boolean(
    (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
      (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
  );

  return (
    <div
      onClick={() => onToggleExpand(student.id)}
      className={`p-4 sm:px-5 rounded-3xl flex flex-col gap-3 cursor-pointer transition-colors shadow-2xs ${
        isTransferred
          ? 'bg-amber-50/75 hover:bg-amber-50'
          : isRemanejado
          ? 'bg-purple-50/75 hover:bg-purple-50'
          : isOtherNonActive
          ? 'bg-slate-100'
          : 'bg-white hover:bg-[#fafbfd]'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <StudentAvatar
            student={student}
            size="lg"
            onUploadPhotoClick={onOpenPhotoModal ? () => onOpenPhotoModal(student) : undefined}
            className="bg-[#edf2f7]"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-semibold tracking-[-0.006em] text-slate-700 tabular-nums">
              <span>{student.number.toString().padStart(2, '0')}</span>
              <span aria-hidden="true">·</span>
              <span className={m.isBelowLegalThreshold && !isNonActive ? 'text-[#b42318] font-semibold' : undefined}>
                {m.frequenciaPercent}%
              </span>
              {isTransferred && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{studentGenderInfo.transferidoTerm}</span>
                </>
              )}
              {isRemanejado && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{studentGenderInfo.remanejadoTerm}</span>
                </>
              )}
            </div>
            <span
              className={`block font-semibold text-[17px] tracking-[-0.022em] leading-[1.24] break-words mt-0.5 ${
                isNonActive ? 'text-slate-700' : 'text-slate-950'
              }`}
            >
              {student.name}
            </span>
            {(guardian1Info.cleanName || student.telefones) && (
              <div className="text-[12.5px] font-normal tracking-[-0.008em] text-[#475569] truncate leading-snug mt-0.5 min-w-0">
                <span>{guardian1Info.cleanName}</span>
                {student.telefones && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-[#047857] tabular-nums font-medium">
                      {student.telefones}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-end gap-2 w-full sm:w-auto shrink-0"
        >
          {onOpenPhotoModal && (
            <button
              type="button"
              onClick={() => onOpenPhotoModal(student)}
              className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-[40px] px-3.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Camera className="w-4 h-4 text-[#475569] shrink-0" />
              <span>Foto</span>
            </button>
          )}

          {onOpenStudentPdf && (hasPdf || showMissingPdfAction) && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenStudentPdf(student);
              }}
              className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[40px] px-3.5 rounded-2xl font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                hasPdf
                  ? 'bg-[#dce7fb] hover:bg-[#c8daf9] text-[#092e70]'
                  : 'bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>PDF</span>
            </button>
          )}

          {onOpenStudentGrid && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenStudentGrid(student);
              }}
              className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-[40px] px-3.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LayoutGrid className="w-4 h-4 text-[#475569] shrink-0" />
              <span>Ficha</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleExpand(student.id)}
            aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <ChevronDown
              className={`w-[19px] h-[19px] transition-transform duration-150 ${
                isExpanded ? 'rotate-180 text-[#0b3b8c]' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {isExpanded && renderStudentDetailedExpansion(student)}
    </div>
  );
}, (prev, next) => {
  return (
    prev.student === next.student &&
    prev.isExpanded === next.isExpanded &&
    prev.diasLetivosMes === next.diasLetivosMes &&
    prev.showMissingPdfAction === next.showMissingPdfAction &&
    prev.onOpenPhotoModal === next.onOpenPhotoModal &&
    prev.onOpenStudentPdf === next.onOpenStudentPdf &&
    prev.onOpenStudentGrid === next.onOpenStudentGrid &&
    prev.renderStudentDetailedExpansion === next.renderStudentDetailedExpansion
  );
});
LinhaEstudante.displayName = 'LinhaEstudante';

interface EstudanteTabelaRowProps {
  student: Student;
  classGroup: ClassGroup;
  diasLetivosMes: number;
  minLegalPresence: number;
  rowIndex: number;
  tbodyRef?: (element: Element | null) => void;
  isExpanded: boolean;
  onToggleExpand: (studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  showMissingPdfAction?: boolean;
  renderStudentDetailedExpansion: (student: Student) => React.ReactNode;
}

const EstudanteTabelaRow: React.FC<EstudanteTabelaRowProps> = memo(({
  student,
  diasLetivosMes,
  rowIndex,
  tbodyRef,
  isExpanded,
  onToggleExpand,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onOpenPhotoModal,
  showMissingPdfAction = true,
  renderStudentDetailedExpansion,
}) => {
  const m = getStudentAttendanceMetrics(student, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
  const consecInfo = getStudentConsecutiveAlertInfo(student);
  const pctFalta =
    m.diasLetivosMatriculados > 0
      ? Math.round((m.faltas / m.diasLetivosMatriculados) * 100)
      : 0;
  const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
  const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
  const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
  const isOtherNonActive = !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';

  const studentGenderInfo = getStudentGenderLabel(student);
  const guardian1Info = resolveGuardianRelationshipInfo(student.filiacao1 || student.guardianName, 'filiacao1', student.notes);
  const guardian2Info = resolveGuardianRelationshipInfo(student.filiacao2, 'filiacao2', student.notes);

  const zebraBgClass = rowIndex % 2 === 1 ? 'bg-[#f8fafc]/70' : 'bg-white';
  const rowColorClass = isTransferred
    ? 'bg-[#fef3c7]/75 hover:bg-[#fde68a]/75'
    : isRemanejado
    ? 'bg-[#ede9fe]/75 hover:bg-[#ddd6fe]/75'
    : isOtherNonActive
    ? 'bg-[#e2e8f0]/75'
    : consecInfo.tier === '10d'
    ? 'bg-[#fff1f2] hover:bg-[#ffe4e6]'
    : consecInfo.tier === '5d'
    ? 'bg-[#fff7ed] hover:bg-[#ffedd5]'
    : consecInfo.tier === '3d'
    ? 'bg-[#fffbeb] hover:bg-[#fef3c7]'
    : m.isBelowLegalThreshold
    ? 'bg-[#fff9f8] hover:bg-[#fff0ee]'
    : `${zebraBgClass} hover:bg-[#f1f5f9]/70`;

  const hasPdf = Boolean(
    (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
      (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
  );

  return (
    <tbody ref={tbodyRef} data-index={rowIndex}>
      <tr
        onClick={() => onToggleExpand(student.id)}
        className={`cursor-pointer transition-colors ${rowColorClass} ${
          isExpanded ? 'bg-[#f1f5f9]' : ''
        }`}
      >
        <td className="py-2.5 px-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(student.id);
              }}
              title={isExpanded ? 'Recolher detalhes' : 'Expandir dados completos'}
              className="p-1 rounded-lg hover:bg-black/5 text-[#0f172a] cursor-pointer"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  isExpanded ? 'rotate-180 text-[#0b3b8c]' : ''
                }`}
              />
            </button>
            <span className="font-semibold text-[#475569] text-[12px] tabular-nums">
              {student.number.toString().padStart(2, '0')}
            </span>
          </div>
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <StudentAvatar
                student={student}
                size="md"
                onUploadPhotoClick={onOpenPhotoModal ? () => onOpenPhotoModal(student) : undefined}
                className="bg-[#edf2f7]"
              />
              <div className="min-w-0">
                <span className="font-semibold text-[15px] text-[#0f172a] tracking-[-0.018em] break-words block leading-snug">
                  {student.name}
                </span>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 shrink-0">
              {onOpenPhotoModal && (
                <button
                  type="button"
                  onClick={() => onOpenPhotoModal(student)}
                  title={`Foto (${student.name})`}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[12px] tracking-[-0.008em] flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                >
                  <Camera className="w-[15px] h-[15px] text-[#475569]" />
                  <span>Foto</span>
                </button>
              )}
              {onOpenStudentPdf && (hasPdf || showMissingPdfAction) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenStudentPdf(student);
                  }}
                  title={`PDF (${student.name})`}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl font-semibold text-[12px] tracking-[-0.008em] flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                    hasPdf
                      ? 'bg-[#dce7fb] hover:bg-[#c8daf9] text-[#092e70]'
                      : 'bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-700'
                  }`}
                >
                  <FileText className="w-[15px] h-[15px]" />
                  <span>PDF</span>
                </button>
              )}
              {onOpenStudentGrid && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenStudentGrid(student);
                  }}
                  title={`Ficha (${student.name})`}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[12px] tracking-[-0.008em] flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                >
                  <LayoutGrid className="w-[15px] h-[15px] text-[#475569]" />
                  <span>Ficha</span>
                </button>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2.5 text-center">
          {consecInfo.tier !== 'none' ? (
            <div className="inline-flex flex-col items-center">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-xs uppercase tabular-nums ${consecInfo.badgeBgClass} ${consecInfo.badgeTextClass}`}
              >
                {consecInfo.tier === '10d' ? (
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                ) : consecInfo.tier === '5d' ? (
                  <BellRing className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{consecInfo.shortBadge}</span>
              </span>
              <span className="text-[11px] font-semibold text-[#475569] mt-0.5">
                {consecInfo.tier === '10d'
                  ? 'Evasão Crítica'
                  : consecInfo.tier === '5d'
                  ? 'Busca Ativa'
                  : 'Contato Família'}
              </span>
            </div>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-[#ecfdf5] text-[#047857] font-semibold text-[11.5px]">
              Em dia
            </span>
          )}
        </td>
        <td className="py-2.5 px-2.5 tabular-nums text-slate-700 font-medium">
          {student.ra}-{student.digRa}
        </td>
        <td className="py-2.5 px-3 font-medium text-[#1c1c1e]">
          <span className="text-xs font-semibold uppercase text-[#005035] block">
            {guardian1Info.roleLabel}
          </span>
          <span className="break-words">{guardian1Info.cleanName}</span>
        </td>
        <td className="py-2.5 px-3 font-medium text-[#1c1c1e]">
          <span className="text-xs font-semibold uppercase text-[#003440] block">
            {guardian2Info.roleLabel}
          </span>
          <span className="break-words">{guardian2Info.cleanName}</span>
        </td>
        <td className="py-2.5 px-2.5 text-xs">
          <div className="text-[#005035] font-semibold tabular-nums">
            {student.telefones || '—'}
          </div>
          <div className="text-[#5a676b] break-all max-w-[200px] leading-snug">
            {student.emailMunicipal || '—'}
          </div>
        </td>
        <td className="py-2.5 px-2.5 text-center font-bold tabular-nums text-[#005035]">
          {m.presencas}/{m.diasLetivosMatriculados} dias ({m.frequenciaPercent}%)
        </td>
        <td className="py-2.5 px-2.5 text-center font-bold tabular-nums text-[#ba1a1a]">
          {m.faltas} ({pctFalta}%)
        </td>
        <td className="py-2.5 px-2.5 text-center">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
              isTransferred
                ? 'bg-[#b45309] text-white'
                : isRemanejado
                ? 'bg-[#6d28d9] text-white'
                : isOtherNonActive
                ? 'bg-[#475569] text-white'
                : 'bg-[#eaf6ef] text-[#005035]'
            }`}
          >
            {isTransferred
              ? studentGenderInfo.transferidoTerm.toUpperCase()
              : isRemanejado
              ? studentGenderInfo.remanejadoTerm.toUpperCase()
              : studentGenderInfo.ativoTerm.toUpperCase()}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-slate-50/70 animate-gentle-fade">
          <td colSpan={10} className="p-3 sm:p-4">
            <div className="sticky left-0 w-[calc(100vw-2.5rem)] max-w-full lg:w-full">
              {renderStudentDetailedExpansion(student)}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}, (prev, next) => {
  return (
    prev.student === next.student &&
    prev.rowIndex === next.rowIndex &&
    prev.isExpanded === next.isExpanded &&
    prev.diasLetivosMes === next.diasLetivosMes &&
    prev.showMissingPdfAction === next.showMissingPdfAction &&
    prev.tbodyRef === next.tbodyRef &&
    prev.onOpenPhotoModal === next.onOpenPhotoModal &&
    prev.onOpenStudentPdf === next.onOpenStudentPdf &&
    prev.onOpenStudentGrid === next.onOpenStudentGrid &&
    prev.renderStudentDetailedExpansion === next.renderStudentDetailedExpansion
  );
});
EstudanteTabelaRow.displayName = 'EstudanteTabelaRow';

interface VirtualCardRowData {
  key: string;
  students: Student[];
  isExpandedRow: boolean;
}

function buildVirtualCardRows(
  students: Student[],
  columns: number,
  expandedStudentId: string | null
): VirtualCardRowData[] {
  const rows: VirtualCardRowData[] = [];
  let buffer: Student[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    rows.push({
      key: buffer.map((s) => s.id).join('_'),
      students: buffer,
      isExpandedRow: false,
    });
    buffer = [];
  };

  for (const student of students) {
    const isExpanded =
      expandedStudentId === '__ALL__' || expandedStudentId === student.id;
    if (isExpanded && columns > 1) {
      flushBuffer();
      rows.push({
        key: `exp_${student.id}`,
        students: [student],
        isExpandedRow: true,
      });
    } else {
      buffer.push(student);
      if (buffer.length >= columns) {
        flushBuffer();
      }
    }
  }
  flushBuffer();
  return rows;
}

interface Peb1StudentCardProps {
  student: Student;
  diasLetivosMes: number;
  isExpanded: boolean;
  onToggleExpand: (studentId: string) => void;
  onOpenPhotoModal?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenStudentGrid?: (student: Student) => void;
  renderStudentDetailedExpansion: (student: Student) => React.ReactNode;
}

const Peb1StudentCard: React.FC<Peb1StudentCardProps> = memo(({
  student,
  diasLetivosMes,
  isExpanded,
  onToggleExpand,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onOpenStudentGrid,
  renderStudentDetailedExpansion,
}) => {
  const sit = (student.situacao || 'ATIVO').toUpperCase().trim();
  const isTransferred = sit.includes('BXTR') || sit.includes('TRANSF');
  const isRemanejado = sit.includes('REMAN') || sit.includes('RM');
  const isOtherNonActive =
    !isTransferred && !isRemanejado && sit !== 'ATIVO' && sit !== '';
  const isNonActive = isTransferred || isRemanejado || isOtherNonActive;
  const studentGenderInfo = getStudentGenderLabel(student);
  const metrics = getStudentAttendanceMetrics(
    student,
    diasLetivosMes,
    OFFICIAL_OCTOBER_DAYS
  );
  const cumulativeOccs = getStudentCumulativeOccurrences(student);
  const latestConsecOcc =
    cumulativeOccs.length > 0 ? cumulativeOccs[cumulativeOccs.length - 1] : null;
  const consecDaysCount = latestConsecOcc ? latestConsecOcc.selectedDates.length : 0;
  const hasStudentPdf = Boolean(
    (student.fichaPdfDriveUrl && student.fichaPdfDriveUrl.trim().length > 0) ||
      (student.fichaPdfDriveId && student.fichaPdfDriveId.trim().length > 0)
  );

  return (
    <article
      className={`rounded-3xl bg-white p-4 sm:p-5 transition-colors duration-100 min-w-0 ${
        isExpanded ? 'shadow-sm' : 'shadow-2xs hover:bg-[#fafbfd]'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => onToggleExpand(student.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand(student.id);
          }
        }}
        className="flex items-start justify-between gap-3 cursor-pointer select-none min-w-0"
      >
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <StudentAvatar
            student={student}
            size={isExpanded ? 'xl' : 'lg'}
            onUploadPhotoClick={onOpenPhotoModal ? () => onOpenPhotoModal(student) : undefined}
            className="bg-[#edf2f7]"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-semibold tracking-[-0.006em] text-slate-700 tabular-nums">
              <span>{student.number.toString().padStart(2, '0')}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  metrics.isBelowLegalThreshold && !isNonActive
                    ? 'text-[#b42318] font-semibold'
                    : undefined
                }
              >
                {metrics.frequenciaPercent}%
              </span>
              {isNonActive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-slate-700">
                    {isTransferred
                      ? studentGenderInfo.transferidoTerm
                      : isRemanejado
                      ? studentGenderInfo.remanejadoTerm
                      : sit}
                  </span>
                </>
              )}
              {consecDaysCount >= 3 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      consecDaysCount >= 5
                        ? 'text-[#b42318] font-semibold'
                        : 'text-[#b45309] font-semibold'
                    }
                  >
                    {consecDaysCount} faltas seguidas
                  </span>
                </>
              )}
            </div>

            <h2
              className={`mt-1 text-[18px] sm:text-[19px] font-semibold tracking-[-0.024em] leading-[1.22] break-words ${
                isNonActive ? 'text-slate-700' : 'text-slate-950'
              }`}
            >
              {student.name}
            </h2>
          </div>
        </div>

        <ChevronDown
          className={`w-5 h-5 text-slate-600 shrink-0 mt-0.5 transition-transform duration-150 ${
            isExpanded ? 'rotate-180 text-[#092e70]' : ''
          }`}
          aria-hidden="true"
        />
      </div>

      {(onOpenPhotoModal || onOpenStudentPdf || onOpenStudentGrid) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-4 grid grid-cols-3 gap-2 min-w-0"
        >
          {onOpenPhotoModal && (
            <button
              type="button"
              onClick={() => onOpenPhotoModal(student)}
              className="min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Camera className="w-4 h-4 text-[#475569] shrink-0" />
              <span>Foto</span>
            </button>
          )}

          {onOpenStudentPdf && (
            <button
              type="button"
              onClick={() => onOpenStudentPdf(student)}
              className={`min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                hasStudentPdf
                  ? 'bg-[#dce7fb] hover:bg-[#c8daf9] text-[#092e70]'
                  : 'bg-[#edf2f7] hover:bg-[#e2e8f0] text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>PDF</span>
            </button>
          )}

          {onOpenStudentGrid && (
            <button
              type="button"
              onClick={() => onOpenStudentGrid(student)}
              className="min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <LayoutGrid className="w-4 h-4 text-[#475569] shrink-0" />
              <span>Ficha</span>
            </button>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="pt-2">{renderStudentDetailedExpansion(student)}</div>
      )}
    </article>
  );
}, (prev, next) => {
  return (
    prev.student === next.student &&
    prev.isExpanded === next.isExpanded &&
    prev.diasLetivosMes === next.diasLetivosMes &&
    prev.onOpenPhotoModal === next.onOpenPhotoModal &&
    prev.onOpenStudentPdf === next.onOpenStudentPdf &&
    prev.onOpenStudentGrid === next.onOpenStudentGrid &&
    prev.renderStudentDetailedExpansion === next.renderStudentDetailedExpansion
  );
});
Peb1StudentCard.displayName = 'Peb1StudentCard';

interface Peb1CardRowProps {
  rows: VirtualCardRowData[];
  columnCount: number;
  diasLetivosMes: number;
  expandedStudentId: string | null;
  onToggleExpand: (studentId: string) => void;
  onOpenPhotoModal?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenStudentGrid?: (student: Student) => void;
  renderStudentDetailedExpansion: (student: Student) => React.ReactNode;
}

const Peb1CardRow = ({
  ariaAttributes,
  index,
  style,
  rows,
  columnCount,
  diasLetivosMes,
  expandedStudentId,
  onToggleExpand,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onOpenStudentGrid,
  renderStudentDetailedExpansion,
}: RowComponentProps<Peb1CardRowProps>) => {
  const row = rows[index];
  if (!row) return null;

  const gridColsClass =
    row.isExpandedRow || columnCount <= 1
      ? 'grid-cols-1'
      : columnCount === 2
      ? 'grid-cols-2'
      : 'grid-cols-3';

  return (
    <div {...ariaAttributes} style={style} className="pb-3.5">
      <div className={`grid ${gridColsClass} gap-3.5 items-start`}>
        {row.students.map((student) => (
          <Peb1StudentCard
            key={student.id}
            student={student}
            diasLetivosMes={diasLetivosMes}
            isExpanded={expandedStudentId === '__ALL__' || expandedStudentId === student.id}
            onToggleExpand={onToggleExpand}
            onOpenPhotoModal={onOpenPhotoModal}
            onOpenStudentPdf={onOpenStudentPdf}
            onOpenStudentGrid={onOpenStudentGrid}
            renderStudentDetailedExpansion={renderStudentDetailedExpansion}
          />
        ))}
      </div>
    </div>
  );
};

interface AdminGridRowProps {
  rows: VirtualCardRowData[];
  columnCount: number;
  classGroup: ClassGroup;
  diasLetivosMes: number;
  minLegalPresence: number;
  expandedStudentId: string | null;
  onToggleExpand: (studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  renderStudentDetailedExpansion: (student: Student) => React.ReactNode;
}

const AdminGridRow = ({
  ariaAttributes,
  index,
  style,
  rows,
  columnCount,
  classGroup,
  diasLetivosMes,
  minLegalPresence,
  expandedStudentId,
  onToggleExpand,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onOpenPhotoModal,
  renderStudentDetailedExpansion,
}: RowComponentProps<AdminGridRowProps>) => {
  const row = rows[index];
  if (!row) return null;

  const gridColsClass =
    row.isExpandedRow || columnCount <= 1
      ? 'grid-cols-1'
      : columnCount === 2
      ? 'grid-cols-2'
      : columnCount === 3
      ? 'grid-cols-3'
      : 'grid-cols-4';

  return (
    <div {...ariaAttributes} style={style} className="pb-3.5">
      <div className={`grid ${gridColsClass} gap-3.5 items-stretch`}>
        {row.students.map((student) => (
          <EstudanteCard
            key={student.id}
            student={student}
            classGroup={classGroup}
            diasLetivosMes={diasLetivosMes}
            minLegalPresence={minLegalPresence}
            isExpanded={expandedStudentId === '__ALL__' || expandedStudentId === student.id}
            onToggleExpand={onToggleExpand}
            onOpenStudentGrid={onOpenStudentGrid}
            onOpenStudentPdf={onOpenStudentPdf}
            onOpenPhotoModal={onOpenPhotoModal}
            showMissingPdfAction={true}
            renderStudentDetailedExpansion={renderStudentDetailedExpansion}
          />
        ))}
      </div>
    </div>
  );
};

interface AdminCompactRowProps {
  students: Student[];
  classGroup: ClassGroup;
  diasLetivosMes: number;
  minLegalPresence: number;
  expandedStudentId: string | null;
  onToggleExpand: (studentId: string) => void;
  onOpenStudentGrid?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  renderStudentDetailedExpansion: (student: Student) => React.ReactNode;
}

const AdminCompactRow = ({
  ariaAttributes,
  index,
  style,
  students,
  classGroup,
  diasLetivosMes,
  minLegalPresence,
  expandedStudentId,
  onToggleExpand,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onOpenPhotoModal,
  renderStudentDetailedExpansion,
}: RowComponentProps<AdminCompactRowProps>) => {
  const student = students[index];
  if (!student) return null;

  return (
    <div {...ariaAttributes} style={style} className="pb-2.5">
      <LinhaEstudante
        student={student}
        classGroup={classGroup}
        diasLetivosMes={diasLetivosMes}
        minLegalPresence={minLegalPresence}
        isExpanded={expandedStudentId === '__ALL__' || expandedStudentId === student.id}
        onToggleExpand={onToggleExpand}
        onOpenStudentGrid={onOpenStudentGrid}
        onOpenStudentPdf={onOpenStudentPdf}
        onOpenPhotoModal={onOpenPhotoModal}
        showMissingPdfAction={true}
        renderStudentDetailedExpansion={renderStudentDetailedExpansion}
      />
    </div>
  );
};

export const DetalhesTurmaScreen: React.FC<DetalhesTurmaScreenProps> = ({
  classGroup,
  userRole = 'admin',
  canLaunchAttendance = true,
  onGoToMonthlyAttendance,
  onOpenStudentGrid,
  onOpenPhotoModal,
  onOpenStudentPdf,
  onBackToClasses,
  initialStatusFilter = 'all',
}) => {
  const isPeb1 = userRole === 'usuario';
  const [searchStudent, setSearchStudent] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [copiedFichaAlert, setCopiedFichaAlert] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [tableElement, setTableElement] = useState<HTMLTableElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    setExpandedStudentId(null);
    setStatusFilter(initialStatusFilter);
  }, [classGroup.id, initialStatusFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const viewportWidth = viewportSize.width;
  const defaultVirtualViewportHeight = Math.max(460, viewportSize.height - 180);
  const peb1ColumnCount = viewportWidth >= 1280 ? 3 : viewportWidth >= 768 ? 2 : 1;
  const adminGridColumnCount =
    viewportWidth >= 1280 ? 4 : viewportWidth >= 1024 ? 3 : viewportWidth >= 640 ? 2 : 1;

  // Referências estáveis para callbacks externos evitando re-renderizações em massa durante scroll virtualizado
  const onOpenStudentGridRef = useRef(onOpenStudentGrid);
  const onOpenPhotoModalRef = useRef(onOpenPhotoModal);
  const onOpenStudentPdfRef = useRef(onOpenStudentPdf);
  useEffect(() => {
    onOpenStudentGridRef.current = onOpenStudentGrid;
    onOpenPhotoModalRef.current = onOpenPhotoModal;
    onOpenStudentPdfRef.current = onOpenStudentPdf;
  }, [onOpenStudentGrid, onOpenPhotoModal, onOpenStudentPdf]);

  const hasGridAction = Boolean(onOpenStudentGrid);
  const hasPhotoAction = Boolean(onOpenPhotoModal);
  const hasPdfAction = Boolean(onOpenStudentPdf);

  const stableOpenStudentGrid = useMemo(
    () => (hasGridAction ? (student: Student) => onOpenStudentGridRef.current?.(student) : undefined),
    [hasGridAction]
  );
  const stableOpenPhotoModal = useMemo(
    () => (hasPhotoAction ? (student: Student) => onOpenPhotoModalRef.current?.(student) : undefined),
    [hasPhotoAction]
  );
  const stableOpenStudentPdf = useMemo(
    () => (hasPdfAction ? (student: Student) => onOpenStudentPdfRef.current?.(student) : undefined),
    [hasPdfAction]
  );

  // Estado do Configurador de Download .XLS da Turma (Colunas, Campos e Ordem)
  const [isExportXlsModalOpen, setIsExportXlsModalOpen] = useState(false);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('emeb_turma_xls_columns_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CLASS_EXPORT_COLUMN_IDS;
  });
  const [exportSortBy, setExportSortBy] = useState<ClassExportSortOrder>('number_asc');
  const [exportStatusFilter, setExportStatusFilter] =
    useState<ClassExportStatusFilter>('all');
  const [includeSummarySheet, setIncludeSummarySheet] = useState<boolean>(true);
  const [exportFileFormat, setExportFileFormat] = useState<'xls' | 'xlsx'>('xls');
  const [exportSuccessToast, setExportSuccessToast] = useState<string | null>(null);

  const saveSelectedColumns = (nextCols: string[]) => {
    setSelectedColumnIds(nextCols);
    try {
      localStorage.setItem('emeb_turma_xls_columns_v1', JSON.stringify(nextCols));
    } catch {
      // ignore
    }
  };

  const handleExecuteDownloadXLS = async () => {
    await downloadClassCustomXLS(classGroup, {
      columnIds: selectedColumnIds,
      sortBy: exportSortBy,
      statusFilter: exportStatusFilter,
      includeSummarySheet,
      fileFormat: exportFileFormat,
    });
    setIsExportXlsModalOpen(false);
    setExportSuccessToast(
      `Relatorio_${classGroup.name.replace(/\s+/g, '_')}_2027.${exportFileFormat} baixado com ${selectedColumnIds.length} colunas!`
    );
    window.setTimeout(() => setExportSuccessToast(null), 4000);
  };

  const diasLetivosMes = classGroup.classesHeld || 20;
  const isInfantilClass =
    classGroup.name.toUpperCase().startsWith('GRUPO') ||
    classGroup.grade.toUpperCase().includes('INFANTIL');
  const minLegalPresence = isInfantilClass ? 60 : 75;

  // Strict numerical ordering by Nº da chamada (1, 2, 3...)
  const orderedStudents = useMemo(() => {
    return [...classGroup.students].sort((a, b) => a.number - b.number);
  }, [classGroup.students]);


  // Complete Top Class Summary (Resumo da Alta da Turma: Ativos, Feminino, Masculino, Transferidos, Remanejados, Presença e Faltas)
  const classSummary = useMemo(() => {
    let ativos = 0;
    let feminino = 0;
    let masculino = 0;
    let transferidos = 0;
    let remanejados = 0;
    let pcdCount = 0;
    let alertaLegalCount = 0;
    let bolsaFamiliaCount = 0;
    let semFichaEscaneadaCount = 0;
    let comFichaEscaneadaCount = 0;
    let somaDiasMatriculados = 0;
    let somaPresencas = 0;
    let somaFaltas = 0;
    let somaAtestados = 0;

    orderedStudents.forEach((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const genCode = resolveStudentGender(s);
      if (sit.includes('BXTR') || sit.includes('TRANSF')) {
        transferidos++;
      } else if (sit.includes('REMAN') || sit.includes('RM')) {
        remanejados++;
      } else {
        ativos++;
      }

      if (genCode === 'F') feminino++;
      else masculino++;

      if (s.deficiencia && s.deficiencia.trim().length > 0) pcdCount++;
      if (s.nis && s.nis.trim().length > 0) bolsaFamiliaCount++;

      const isMoved = sit.includes('BXTR') || sit.includes('TRANSF') || sit.includes('REMAN') || sit.includes('RM');
      const hasScannedPdf = Boolean(
        (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
          (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
      );
      if (hasScannedPdf) comFichaEscaneadaCount++;
      else if (!isMoved) semFichaEscaneadaCount++;

      const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
      if (m.isBelowLegalThreshold) alertaLegalCount++;

      somaDiasMatriculados += m.diasLetivosMatriculados;
      somaPresencas += m.presencas;
      somaFaltas += m.faltas;
      somaAtestados += m.atestados;
    });

    const pctPresencaTotal =
      somaDiasMatriculados > 0
        ? Math.round((somaPresencas / somaDiasMatriculados) * 100)
        : 100;
    const pctFaltaTotal =
      somaDiasMatriculados > 0
        ? Math.round((somaFaltas / somaDiasMatriculados) * 100)
        : 0;

    return {
      totalMatriculados: orderedStudents.length,
      ativos,
      feminino,
      masculino,
      transferidos,
      remanejados,
      pcdCount,
      alertaLegalCount,
      bolsaFamiliaCount,
      semFichaEscaneadaCount,
      comFichaEscaneadaCount,
      somaDiasMatriculados,
      somaPresencas,
      somaFaltas,
      somaAtestados,
      pctPresencaTotal,
      pctFaltaTotal,
    };
  }, [orderedStudents, diasLetivosMes]);

  const filteredStudents = useMemo(() => {
    const q = searchStudent.toLowerCase().trim();
    return orderedStudents.filter((s) => {
      const matchesQuery =
        q === '' ||
        s.name.toLowerCase().includes(q) ||
        s.number.toString().padStart(2, '0').includes(q) ||
        (s.ra && s.ra.toLowerCase().includes(q)) ||
        (s.nis && s.nis.toLowerCase().includes(q)) ||
        (s.filiacao1 && s.filiacao1.toLowerCase().includes(q)) ||
        (s.filiacao2 && s.filiacao2.toLowerCase().includes(q));
      if (!matchesQuery) return false;

      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      const isMov =
        sit.includes('BXTR') ||
        sit.includes('TRANSF') ||
        sit.includes('REMAN') ||
        sit.includes('RM');

      const hasScannedPdf = Boolean(
        (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
          (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
      );

      if (statusFilter === 'ativos') return !isMov;
      if (statusFilter === 'sem_ficha_pdf') return !isMov && !hasScannedPdf;
      if (statusFilter === 'movimentados') return isMov;
      if (statusFilter === 'bolsa_familia' && userRole === 'admin') {
        return Boolean(s.nis && s.nis.trim().length > 0);
      }
      if (statusFilter === 'alerta') {
        const m = getStudentAttendanceMetrics(s, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
        return m.isBelowLegalThreshold;
      }
      return true;
    });
  }, [orderedStudents, searchStudent, statusFilter, userRole, diasLetivosMes, minLegalPresence]);

  const handleToggleExpand = useCallback((studentId: string) => {
    setExpandedStudentId((prev) => (prev === studentId ? null : studentId));
  }, []);

  const renderStudentDetailedExpansion = useCallback(
    (student: Student) => {
      const occs = getStudentCumulativeOccurrences(student);
      const latestWithFeedback = [...occs]
        .reverse()
        .find((o) => (o.familyFeedback || '').trim().length > 0);
      const latestFeedback =
        latestWithFeedback?.familyFeedback ||
        student.consecutiveAbsenceAlert?.familyFeedback ||
        undefined;

      return (
        <StudentDataExpansionPanel
          student={student}
          classGroup={classGroup}
          diasLetivosMes={diasLetivosMes}
          minLegalPresence={minLegalPresence}
          onOpenStudentPdf={stableOpenStudentPdf}
          onOpenStudentGrid={stableOpenStudentGrid}
          onOpenPhotoModal={onOpenPhotoModal}
          onCollapse={() => setExpandedStudentId(null)}
          showHeaderMeta={!isPeb1}
          familyFeedback={latestFeedback}
        />
      );
    },
    [
      classGroup,
      diasLetivosMes,
      minLegalPresence,
      stableOpenStudentPdf,
      stableOpenStudentGrid,
      onOpenPhotoModal,
      isPeb1,
    ]
  );

  const peb1Rows = useMemo(
    () => buildVirtualCardRows(filteredStudents, peb1ColumnCount, expandedStudentId),
    [filteredStudents, peb1ColumnCount, expandedStudentId]
  );

  const adminGridRows = useMemo(
    () => buildVirtualCardRows(filteredStudents, adminGridColumnCount, expandedStudentId),
    [filteredStudents, adminGridColumnCount, expandedStudentId]
  );

  const peb1LayoutKey =
    peb1ColumnCount > 1
      ? `multi-${expandedStudentId ?? 'none'}`
      : expandedStudentId === '__ALL__'
      ? 'all'
      : 'single';

  const adminGridLayoutKey =
    adminGridColumnCount > 1
      ? `multi-${expandedStudentId ?? 'none'}`
      : expandedStudentId === '__ALL__'
      ? 'all'
      : 'single';

  const peb1DynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: viewportWidth < 640 ? 188 : 180,
    key: `peb1-${classGroup.id}-${peb1ColumnCount}-${filteredStudents.length}-${peb1LayoutKey}`,
  });

  const adminGridDynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: viewportWidth < 640 ? 242 : 236,
    key: `grid-${classGroup.id}-${adminGridColumnCount}-${filteredStudents.length}-${adminGridLayoutKey}`,
  });

  const adminCompactDynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: viewportWidth < 640 ? 148 : 112,
    key: `compact-${classGroup.id}-${viewportWidth < 640 ? 'm' : 'd'}-${filteredStudents.length}-${
      expandedStudentId === '__ALL__' ? 'all' : 'single'
    }`,
  });

  const tableDynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: 84,
    key: `table-${classGroup.id}-${filteredStudents.length}-${
      expandedStudentId === '__ALL__' ? 'all' : 'single'
    }`,
  });

  const tableVirtualizer = useVirtualizer({
    count: !isPeb1 && viewMode === 'table' ? filteredStudents.length : 0,
    element: tableElement,
    scrollElement: 'window',
    defaultSize: defaultVirtualViewportHeight,
    itemSize: tableDynamicRowHeight,
    overscanCount: 6,
  });

  const getVirtualCardRowKey = useCallback(
    (index: number, data: { rows: VirtualCardRowData[] }) => data.rows[index]?.key ?? index,
    []
  );

  const getCompactRowKey = useCallback(
    (index: number, data: { students: Student[] }) => data.students[index]?.id ?? index,
    []
  );

  const peb1RowProps = useMemo<Peb1CardRowProps>(
    () => ({
      rows: peb1Rows,
      columnCount: peb1ColumnCount,
      diasLetivosMes,
      expandedStudentId,
      onToggleExpand: handleToggleExpand,
      onOpenPhotoModal: stableOpenPhotoModal,
      onOpenStudentPdf: stableOpenStudentPdf,
      onOpenStudentGrid: stableOpenStudentGrid,
      renderStudentDetailedExpansion,
    }),
    [
      peb1Rows,
      peb1ColumnCount,
      diasLetivosMes,
      expandedStudentId,
      handleToggleExpand,
      stableOpenPhotoModal,
      stableOpenStudentPdf,
      stableOpenStudentGrid,
      renderStudentDetailedExpansion,
    ]
  );

  const adminGridRowProps = useMemo<AdminGridRowProps>(
    () => ({
      rows: adminGridRows,
      columnCount: adminGridColumnCount,
      classGroup,
      diasLetivosMes,
      minLegalPresence,
      expandedStudentId,
      onToggleExpand: handleToggleExpand,
      onOpenStudentGrid: stableOpenStudentGrid,
      onOpenStudentPdf: stableOpenStudentPdf,
      onOpenPhotoModal: stableOpenPhotoModal,
      renderStudentDetailedExpansion,
    }),
    [
      adminGridRows,
      adminGridColumnCount,
      classGroup,
      diasLetivosMes,
      minLegalPresence,
      expandedStudentId,
      handleToggleExpand,
      stableOpenStudentGrid,
      stableOpenStudentPdf,
      stableOpenPhotoModal,
      renderStudentDetailedExpansion,
    ]
  );

  const adminCompactRowProps = useMemo<AdminCompactRowProps>(
    () => ({
      students: filteredStudents,
      classGroup,
      diasLetivosMes,
      minLegalPresence,
      expandedStudentId,
      onToggleExpand: handleToggleExpand,
      onOpenStudentGrid: stableOpenStudentGrid,
      onOpenStudentPdf: stableOpenStudentPdf,
      onOpenPhotoModal: stableOpenPhotoModal,
      renderStudentDetailedExpansion,
    }),
    [
      filteredStudents,
      classGroup,
      diasLetivosMes,
      minLegalPresence,
      expandedStudentId,
      handleToggleExpand,
      stableOpenStudentGrid,
      stableOpenStudentPdf,
      stableOpenPhotoModal,
      renderStudentDetailedExpansion,
    ]
  );

  if (isPeb1) {
    return (
      <div className="flex flex-col w-full min-w-0 space-y-5 pb-16 animate-gentle-fade">
        <header className="space-y-3.5 min-w-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap min-w-0 px-0.5">
            <h1 className="text-[26px] sm:text-[30px] font-bold text-white tracking-[-0.028em] leading-[1.15] break-words">
              {classGroup.name}
            </h1>
            <span className="text-[13px] font-medium tracking-[-0.008em] text-slate-300 tabular-nums">
              {searchStudent.trim()
                ? `${filteredStudents.length} de ${orderedStudents.length} estudantes`
                : `${orderedStudents.length} estudantes`}
              {classGroup.shift ? ` · ${classGroup.shift.replace('Turno ', '')}` : ''}
            </span>
          </div>

          <div className="relative min-w-0">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-700" />
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Buscar estudante por nome ou número..."
              aria-label="Buscar estudante"
              className="w-full min-h-[46px] pl-11 pr-12 rounded-2xl bg-white text-[15px] font-medium tracking-[-0.012em] text-slate-950 placeholder:text-slate-600 focus:bg-[#f4f7fb] shadow-lg transition-colors"
            />
            {searchStudent && (
              <button
                type="button"
                onClick={() => setSearchStudent('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer"
                aria-label="Limpar busca"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>

          {classSummary.semFichaEscaneadaCount > 0 && (
            <div className="p-4 rounded-2xl bg-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-700 flex items-center justify-center shrink-0">
                  <FileWarning className="w-[18px] h-[18px] stroke-[1.5]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-slate-950">
                    {classSummary.semFichaEscaneadaCount} Ficha(s) Informativa(s) não preenchida(s)
                  </p>
                  <p className="text-xs text-slate-600 leading-snug">
                    Repasse o pedido de preenchimento da Ficha Informativa às famílias destes estudantes.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const msg =
                      'Prezados responsáveis, solicitamos a gentileza de preencher e enviar a Ficha Informativa do(a) estudante para atualização do prontuário escolar na EMEB Prof. Joaquim Candelário de Freitas.';
                    try {
                      await navigator.clipboard.writeText(msg);
                      setCopiedFichaAlert(true);
                      toast.success('Recado para família copiado!');
                      window.setTimeout(() => setCopiedFichaAlert(false), 3000);
                    } catch {
                      toast.info(msg);
                    }
                  }}
                  className="min-h-[34px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {copiedFichaAlert ? (
                    <Check className="w-3.5 h-3.5 text-[#047857] stroke-[1.8]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-600 stroke-[1.5]" />
                  )}
                  <span>{copiedFichaAlert ? 'Copiado' : 'Copiar recado'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter(statusFilter === 'sem_ficha_pdf' ? 'all' : 'sem_ficha_pdf')
                  }
                  className={`min-h-[34px] px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    statusFilter === 'sem_ficha_pdf'
                      ? 'bg-[#0b3b8c] text-white'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-950'
                  }`}
                >
                  {statusFilter === 'sem_ficha_pdf'
                    ? 'Mostrar toda a turma'
                    : `Filtrar pendentes (${classSummary.semFichaEscaneadaCount})`}
                </button>
              </div>
            </div>
          )}
        </header>

        {peb1Rows.length === 0 ? (
          <div className="bg-white rounded-3xl py-12 px-4 text-center space-y-2">
            <p className="text-sm font-medium text-[#3c3c43]">
              Nenhum estudante encontrado.
            </p>
            {searchStudent && (
              <button
                type="button"
                onClick={() => setSearchStudent('')}
                className="text-xs font-semibold text-[#0b3b8c] hover:underline cursor-pointer"
              >
                Limpar busca
              </button>
            )}
          </div>
        ) : (
          <section aria-label="Estudantes da turma" className="min-w-0 space-y-3.5">
            {peb1Rows.map((row, index) => (
              <div key={row.key || index} className="pb-1">
                <div className={`grid ${row.isExpandedRow || peb1ColumnCount <= 1 ? 'grid-cols-1' : peb1ColumnCount === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-3.5 items-start`}>
                  {row.students.map((student) => (
                    <Peb1StudentCard
                      key={student.id}
                      student={student}
                      diasLetivosMes={diasLetivosMes}
                      isExpanded={expandedStudentId === '__ALL__' || expandedStudentId === student.id}
                      onToggleExpand={handleToggleExpand}
                      onOpenPhotoModal={stableOpenPhotoModal}
                      onOpenStudentPdf={stableOpenStudentPdf}
                      onOpenStudentGrid={stableOpenStudentGrid}
                      renderStudentDetailedExpansion={renderStudentDetailedExpansion}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-w-0 space-y-5 pb-16 animate-gentle-fade">

      {/* Contexto da Turma e Navegação */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] tracking-[-0.008em] text-slate-300 py-0.5 min-w-0">
        <button
          type="button"
          onClick={onBackToClasses}
          className="text-slate-200 hover:text-white font-medium inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Turmas</span>
        </button>
        <span className="text-slate-300 font-medium tabular-nums shrink-0">
          {classGroup.shift.replace('Turno ', '')} · {classGroup.room} · {diasLetivosMes} dias letivos
        </span>
      </div>

      {/* Painel Coeso da Turma & Controles */}
      <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-2xs space-y-3.5 min-w-0">
        {/* Linha 1: Título da Turma + Docentes + Ações */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2 min-w-0">
              <h1 className="text-[24px] sm:text-[28px] font-bold text-[#0f172a] tracking-[-0.028em] leading-[1.15] break-words">
                {classGroup.name}
              </h1>
              {classGroup.turmaAbrev && (
                <span className="text-[11px] font-bold uppercase tracking-[0.02em] text-white bg-[#0b3b8c] px-2 py-0.5 rounded-lg tabular-nums">
                  {classGroup.turmaAbrev}
                </span>
              )}
              {classGroup.classeSedCode && (
                <span className="text-[12px] font-medium tracking-[-0.006em] text-slate-700 tabular-nums">
                  SED {classGroup.classeSedCode}
                </span>
              )}
            </div>
            <p className="text-[13px] tracking-[-0.008em] text-slate-700 font-normal break-words leading-relaxed">
              <span className="font-semibold text-[#334155]">Regente:</span> {classGroup.teacherName || 'Docente Regente'}
              {classGroup.artTeacher && (
                <> · <span className="font-semibold text-[#334155]">Arte:</span> {classGroup.artTeacher}</>
              )}
              {classGroup.peTeacher && (
                <> · <span className="font-semibold text-[#334155]">Ed. Física:</span> {classGroup.peTeacher}</>
              )}
              {classGroup.englishTeacher && (
                <> · <span className="font-semibold text-[#334155]">Inglês:</span> {classGroup.englishTeacher}</>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto min-w-0 shrink-0">
            {canLaunchAttendance && (
              <button
                type="button"
                onClick={onGoToMonthlyAttendance}
                className="w-full sm:w-auto min-h-[40px] py-2 px-4 rounded-2xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors"
              >
                <ClipboardCheck className="w-[17px] h-[17px] text-emerald-300 shrink-0" />
                <span>Informar Faltas</span>
              </button>
            )}

            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => setIsExportXlsModalOpen(true)}
                className="w-full sm:w-auto min-h-[40px] py-2 px-3.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-[17px] h-[17px] text-[#475569] shrink-0" />
                <span>Exportar .XLS</span>
              </button>
            )}
          </div>
        </div>

        {/* Linha 2: Indicadores Rápidos */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'ativos' ? 'all' : 'ativos')}
            className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 tabular-nums ${
              statusFilter === 'ativos'
                ? 'bg-[#0b3b8c] text-white'
                : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a]'
            }`}
          >
            <span>Ativos</span>
            <span className="font-bold">{classSummary.ativos}/{classSummary.totalMatriculados}</span>
          </button>

          <div className="min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold bg-[#ecfdf5] text-[#047857] flex items-center gap-1 tabular-nums">
            <span>Presença</span>
            <span className="font-bold">{classSummary.pctPresencaTotal}%</span>
            <span className="text-[11px] opacity-75">· meta {minLegalPresence}%</span>
          </div>

          <div className="min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-medium bg-[#f1f5f9] text-[#475569] flex items-center gap-1.5 tabular-nums">
            <span><strong className="font-semibold text-[#0f172a]">{classSummary.feminino}</strong> F</span>
            <span className="text-[#cbd5e1]">·</span>
            <span><strong className="font-semibold text-[#0f172a]">{classSummary.masculino}</strong> M</span>
          </div>

          {(classSummary.transferidos + classSummary.remanejados > 0) && (
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'movimentados' ? 'all' : 'movimentados')}
              className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold transition-colors cursor-pointer flex items-center gap-1 tabular-nums ${
                statusFilter === 'movimentados'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900'
              }`}
            >
              <span>Movimentados</span>
              <span className="font-bold">{classSummary.transferidos + classSummary.remanejados}</span>
            </button>
          )}

          {classSummary.semFichaEscaneadaCount > 0 ? (
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'sem_ficha_pdf' ? 'all' : 'sem_ficha_pdf')}
              className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold transition-colors cursor-pointer flex items-center gap-1 tabular-nums ${
                statusFilter === 'sem_ficha_pdf'
                  ? 'bg-rose-700 text-white'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
              }`}
            >
              <span>PDFs pendentes</span>
              <span className="font-bold">{classSummary.semFichaEscaneadaCount}</span>
            </button>
          ) : (
            <div className="min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold bg-[#ecfdf5] text-[#047857] flex items-center gap-1">
              <BadgeCheck className="w-[15px] h-[15px]" />
              <span>100% PDFs</span>
            </div>
          )}

          {classSummary.alertaLegalCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'alerta' ? 'all' : 'alerta')}
              className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold transition-colors cursor-pointer flex items-center gap-1 tabular-nums ${
                statusFilter === 'alerta'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
              }`}
            >
              <span>Alerta</span>
              <span className="font-bold">{classSummary.alertaLegalCount}</span>
            </button>
          )}

          {userRole === 'admin' && classSummary.bolsaFamiliaCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'bolsa_familia' ? 'all' : 'bolsa_familia')}
              className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold transition-colors cursor-pointer flex items-center gap-1 tabular-nums ${
                statusFilter === 'bolsa_familia'
                  ? 'bg-[#0b3b8c] text-white'
                  : 'bg-blue-50 hover:bg-blue-100 text-[#0b3b8c]'
              }`}
            >
              <span>Bolsa Família</span>
              <span className="font-bold">{classSummary.bolsaFamiliaCount}</span>
            </button>
          )}
        </div>

        {/* Linha 3: Busca + Controles */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-[19px] h-[19px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-700" />
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Buscar por Nº, nome, RA ou responsável..."
              aria-label="Buscar estudante"
              className="w-full min-h-[44px] pl-10 pr-9 rounded-2xl bg-[#f4f7fb] text-[15px] font-medium tracking-[-0.012em] text-slate-950 placeholder:text-slate-600 focus:bg-[#edf2f7] transition-colors"
            />
            {searchStudent && (
              <button
                type="button"
                onClick={() => setSearchStudent('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-950 cursor-pointer"
                aria-label="Limpar busca"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0">
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="min-h-[40px] px-3 rounded-2xl bg-[#e2e8f0] hover:bg-[#cbd5e1] text-[#0f172a] font-semibold text-[12.5px] tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <FilterX className="w-[15px] h-[15px]" />
                <span>Limpar</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setExpandedStudentId((prev) => (prev === '__ALL__' ? null : '__ALL__'))
              }
              title="Expandir ou recolher resumo de todos"
              className="min-h-[40px] px-3.5 rounded-2xl text-[12.5px] tracking-[-0.01em] font-semibold text-[#0f172a] bg-[#f1f5f9] hover:bg-[#e2e8f0] flex items-center gap-1 cursor-pointer transition-colors"
            >
              {expandedStudentId === '__ALL__' ? (
                <ChevronsDownUp className="w-[17px] h-[17px]" />
              ) : (
                <ChevronsUpDown className="w-[17px] h-[17px]" />
              )}
              <span>{expandedStudentId === '__ALL__' ? 'Recolher' : 'Expandir'}</span>
            </button>

            <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Cartões"
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-xl text-[12.5px] tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-950 font-semibold shadow-2xs'
                    : 'text-slate-700 hover:text-slate-950 font-medium'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                title="Lista"
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-xl text-[12.5px] tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'compact'
                    ? 'bg-white text-slate-950 font-semibold shadow-2xs'
                    : 'text-slate-700 hover:text-slate-950 font-medium'
                }`}
              >
                <ListIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Tabela"
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-xl text-[12.5px] tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-950 font-semibold shadow-2xs'
                    : 'text-slate-700 hover:text-slate-950 font-medium'
                }`}
              >
                <Rows3 className="w-4 h-4" />
                <span className="hidden sm:inline">Tabela</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {filteredStudents.length === 0 ? (
        <div className="bg-white rounded-3xl py-12 px-4 text-center space-y-2 shadow-2xs">
          <p className="text-[15px] font-medium tracking-[-0.012em] text-[#475569]">
            Nenhum estudante encontrado.
          </p>
          {(searchStudent || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchStudent('');
                setStatusFilter('all');
              }}
              className="text-[13px] font-semibold text-[#0b3b8c] hover:underline cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* MODO 1: CARDS EM ORDEM NUMÉRICA DA TURMA */}
          {viewMode === 'grid' && (
            <div className="min-w-0 space-y-3.5">
              {adminGridRows.map((row, index) => (
                <div key={row.key || index} className="pb-1">
                  <div className={`grid ${row.isExpandedRow || adminGridColumnCount <= 1 ? 'grid-cols-1' : adminGridColumnCount === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-3.5 items-start`}>
                    {row.students.map((student) => (
                      <EstudanteCard
                        key={student.id}
                        student={student}
                        classGroup={classGroup}
                        diasLetivosMes={diasLetivosMes}
                        minLegalPresence={minLegalPresence}
                        isExpanded={expandedStudentId === '__ALL__' || expandedStudentId === student.id}
                        onToggleExpand={handleToggleExpand}
                        onOpenStudentGrid={stableOpenStudentGrid}
                        onOpenStudentPdf={stableOpenStudentPdf}
                        onOpenPhotoModal={stableOpenPhotoModal}
                        showMissingPdfAction={userRole === 'admin'}
                        renderStudentDetailedExpansion={renderStudentDetailedExpansion}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MODO 2: LISTA COMPACTA (Ordem Numérica + Expansão Fluida Inline) */}
          {viewMode === 'compact' && (
            <div className="min-w-0 space-y-3.5">
              {filteredStudents.map((student) => (
                <LinhaEstudante
                  key={student.id}
                  student={student}
                  classGroup={classGroup}
                  diasLetivosMes={diasLetivosMes}
                  minLegalPresence={minLegalPresence}
                  isExpanded={expandedStudentId === '__ALL__' || expandedStudentId === student.id}
                  onToggleExpand={handleToggleExpand}
                  onOpenStudentGrid={stableOpenStudentGrid}
                  onOpenStudentPdf={stableOpenStudentPdf}
                  onOpenPhotoModal={stableOpenPhotoModal}
                  showMissingPdfAction={userRole === 'admin'}
                  renderStudentDetailedExpansion={renderStudentDetailedExpansion}
                />
              ))}
            </div>
          )}

          {/* MODO 3: TABELA NOMINAL VIRTUALIZADA */}
          {viewMode === 'table' && (() => {
            const vItems = tableVirtualizer.items;
            const topSpacerPx = vItems.length > 0 ? vItems[0].offset : 0;
            const lastVItem = vItems.length > 0 ? vItems[vItems.length - 1] : null;
            const bottomSpacerPx = lastVItem
              ? Math.max(0, tableVirtualizer.totalSize - (lastVItem.offset + lastVItem.size))
              : 0;

            return (
              <div className="space-y-4">
                <div className="bg-white rounded-3xl overflow-x-auto shadow-2xs">
                  <div className="px-4 py-3 bg-[#f8fafc] flex flex-wrap items-center justify-between gap-2 text-[12px] tracking-[-0.006em]">
                    <span className="font-semibold text-[#334155]">Faltas seguidas:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fffbeb] text-[#92400e] font-semibold tabular-nums">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                        <span>3+ Atenção</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fff7ed] text-[#9a3412] font-semibold tabular-nums">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ea580c]" />
                        <span>5+ Busca Ativa</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fff1f2] text-[#9f1239] font-semibold tabular-nums">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#e11d48]" />
                        <span>10+ Crítico</span>
                      </span>
                    </div>
                  </div>

                  <table
                    ref={setTableElement}
                    className="w-full text-left text-[13px] tracking-[-0.008em] min-w-[1160px]"
                  >
                    <thead className="bg-[#edf2f7] text-slate-800 font-bold uppercase tracking-[0.03em] text-[11px]">
                      <tr>
                        <th className="py-3 px-3 text-center">Nº</th>
                        <th className="py-3 px-3">Estudante</th>
                        <th className="py-3 px-2.5 text-center">Faltas Seguidas</th>
                        <th className="py-3 px-2.5">RA</th>
                        <th className="py-3 px-3">Filiação 1</th>
                        <th className="py-3 px-3">Filiação 2</th>
                        <th className="py-3 px-2.5">Contato</th>
                        <th className="py-3 px-2.5 text-center">Presença</th>
                        <th className="py-3 px-2.5 text-center">Faltas</th>
                        <th className="py-3 px-2.5 text-center">Situação</th>
                      </tr>
                    </thead>
                    {topSpacerPx > 0 && (
                      <tbody aria-hidden="true">
                        <tr>
                          <td colSpan={10} className="p-0" style={{ height: topSpacerPx }} />
                        </tr>
                      </tbody>
                    )}
                    {vItems.map((virtualItem) => {
                      const student = filteredStudents[virtualItem.index];
                      if (!student) return null;
                      return (
                        <EstudanteTabelaRow
                          key={student.id}
                          student={student}
                          classGroup={classGroup}
                          diasLetivosMes={diasLetivosMes}
                          minLegalPresence={minLegalPresence}
                          rowIndex={virtualItem.index}
                          tbodyRef={tableVirtualizer.measureElement}
                          isExpanded={expandedStudentId === '__ALL__' || expandedStudentId === student.id}
                          onToggleExpand={handleToggleExpand}
                          onOpenStudentGrid={stableOpenStudentGrid}
                          onOpenStudentPdf={stableOpenStudentPdf}
                          onOpenPhotoModal={stableOpenPhotoModal}
                          showMissingPdfAction={true}
                          renderStudentDetailedExpansion={renderStudentDetailedExpansion}
                        />
                      );
                    })}
                    {bottomSpacerPx > 0 && (
                      <tbody aria-hidden="true">
                        <tr>
                          <td colSpan={10} className="p-0" style={{ height: bottomSpacerPx }} />
                        </tr>
                      </tbody>
                    )}
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Toast de Confirmação de Download .XLS */}
      {exportSuccessToast && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in duration-100">
          <div className="bg-[#0f172a] text-white px-4 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3">
            <CheckCircle2 className="w-[22px] h-[22px] text-emerald-400 shrink-0" />
            <p className="text-[13.5px] font-semibold tracking-[-0.01em] leading-snug">{exportSuccessToast}</p>
          </div>
        </div>
      )}

      <DetalhesExportModal
        isOpen={isExportXlsModalOpen}
        classGroup={classGroup}
        totalAtivos={classSummary.ativos}
        totalMovimentados={classSummary.transferidos + classSummary.remanejados}
        totalAlertaLegal={classSummary.alertaLegalCount}
        minLegalPresence={minLegalPresence}
        selectedColumnIds={selectedColumnIds}
        exportSortBy={exportSortBy}
        exportStatusFilter={exportStatusFilter}
        includeSummarySheet={includeSummarySheet}
        exportFileFormat={exportFileFormat}
        onSaveSelectedColumns={saveSelectedColumns}
        onChangeSortBy={setExportSortBy}
        onChangeStatusFilter={setExportStatusFilter}
        onChangeIncludeSummarySheet={setIncludeSummarySheet}
        onChangeFileFormat={setExportFileFormat}
        onExecuteDownload={handleExecuteDownloadXLS}
        onClose={() => setIsExportXlsModalOpen(false)}
      />
    </div>
  );
};
