import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { List, useDynamicRowHeight, useVirtualizer, RowComponentProps } from 'react-window';
import { ClassGroup, Student, UserRole, SchoolNotice } from '../types';
import {
  CLASS_EXPORT_COLUMNS,
  CLASS_EXPORT_PRESETS,
  DEFAULT_CLASS_EXPORT_COLUMN_IDS,
  ClassExportCategory,
  ClassExportSortOrder,
  ClassExportStatusFilter,
  buildCustomClassExportPreview,
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
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';

type ViewMode = 'grid' | 'compact' | 'table';
type StatusFilter =
  | 'all'
  | 'ativos'
  | 'sem_ficha_pdf'
  | 'movimentados'
  | 'onibus_fretado'
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
            <div
              onClick={(e) => {
                if (onOpenPhotoModal) {
                  e.stopPropagation();
                  onOpenPhotoModal(student);
                }
              }}
              className={`shrink-0 ${onOpenPhotoModal ? 'cursor-pointer' : ''}`}
            >
              <StudentAvatar
                student={student}
                size="lg"
                className="border-0 bg-[#f1f5f9]"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium tracking-[-0.006em] text-[#64748b] tabular-nums">
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
                    <span className="font-semibold text-[#64748b]">
                      {isTransferred
                        ? studentGenderInfo.transferidoTerm
                        : isRemanejado
                        ? studentGenderInfo.remanejadoTerm
                        : sit}
                    </span>
                  </>
                )}
                {student.rotaOnibus && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#0b3b8c] font-semibold">
                      Rota {student.rotaOnibus.replace(/[^0-9]/g, '') || student.rotaOnibus.split('-')[0].trim()}
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
                  isNonActive ? 'text-[#64748b]' : 'text-[#0f172a]'
                }`}
              >
                {student.name}
              </h3>
            </div>
          </div>

          <span
            className={`material-symbols-outlined text-[20px] text-[#94a3b8] shrink-0 mt-0.5 transition-transform duration-150 ${
              isExpanded ? 'rotate-180 text-[#0b3b8c]' : ''
            }`}
            aria-hidden="true"
          >
            expand_more
          </span>
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
                <span className="material-symbols-outlined text-[14px]">chat</span>
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
              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                photo_camera
              </span>
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
                  ? 'bg-[#eef4ff] hover:bg-[#e0ebff] text-[#0b3b8c]'
                  : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#64748b]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">
                picture_as_pdf
              </span>
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
              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                grid_view
              </span>
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
          <div
            onClick={(e) => {
              if (onOpenPhotoModal) {
                e.stopPropagation();
                onOpenPhotoModal(student);
              }
            }}
            className={`shrink-0 ${onOpenPhotoModal ? 'cursor-pointer' : ''}`}
          >
            <StudentAvatar
              student={student}
              size="md"
              className="border-0 bg-[#f1f5f9]"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-medium tracking-[-0.006em] text-[#64748b] tabular-nums">
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
                isNonActive ? 'text-[#64748b]' : 'text-[#0f172a]'
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
              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                photo_camera
              </span>
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
                  ? 'bg-[#eef4ff] hover:bg-[#e0ebff] text-[#0b3b8c]'
                  : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#64748b]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">
                picture_as_pdf
              </span>
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
              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                grid_view
              </span>
              <span>Ficha</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleExpand(student.id)}
            aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <span
              className={`material-symbols-outlined text-[19px] transition-transform duration-150 ${
                isExpanded ? 'rotate-180 text-[#0b3b8c]' : ''
              }`}
            >
              expand_more
            </span>
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
              <span
                className={`material-symbols-outlined text-[16px] transition-transform ${
                  isExpanded ? 'rotate-180 text-[#0b3b8c]' : ''
                }`}
              >
                expand_more
              </span>
            </button>
            <span className="font-semibold text-[#475569] text-[12px] tabular-nums">
              {student.number.toString().padStart(2, '0')}
            </span>
          </div>
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                onClick={(e) => {
                  if (onOpenPhotoModal) {
                    e.stopPropagation();
                    onOpenPhotoModal(student);
                  }
                }}
                className={`shrink-0 ${onOpenPhotoModal ? 'cursor-pointer' : ''}`}
              >
                <StudentAvatar
                  student={student}
                  size="sm"
                  className="border-0 bg-[#f1f5f9]"
                />
              </div>
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
                  <span className="material-symbols-outlined text-[15px] text-[#475569]">
                    photo_camera
                  </span>
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
                      ? 'bg-[#eef4ff] hover:bg-[#e0ebff] text-[#0b3b8c]'
                      : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#64748b]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    picture_as_pdf
                  </span>
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
                  <span className="material-symbols-outlined text-[15px] text-[#475569]">
                    grid_view
                  </span>
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
                <span className="material-symbols-outlined text-[14px]">
                  {consecInfo.icon}
                </span>
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
          <div
            onClick={(e) => {
              if (onOpenPhotoModal) {
                e.stopPropagation();
                onOpenPhotoModal(student);
              }
            }}
            title={onOpenPhotoModal ? 'Atualizar foto' : undefined}
            className={`shrink-0 ${onOpenPhotoModal ? 'cursor-pointer' : ''}`}
          >
            <StudentAvatar
              student={student}
              size="lg"
              className="border-0 bg-[#f1f5f9]"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium tracking-[-0.006em] text-[#64748b] tabular-nums">
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
                  <span className="font-semibold text-[#64748b]">
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
                isNonActive ? 'text-[#64748b]' : 'text-[#0f172a]'
              }`}
            >
              {student.name}
            </h2>
          </div>
        </div>

        <span
          className={`material-symbols-outlined text-[20px] text-[#94a3b8] shrink-0 mt-0.5 transition-transform duration-150 ${
            isExpanded ? 'rotate-180 text-[#0b3b8c]' : ''
          }`}
          aria-hidden="true"
        >
          expand_more
        </span>
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
              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                photo_camera
              </span>
              <span>Foto</span>
            </button>
          )}

          {onOpenStudentPdf && (
            <button
              type="button"
              onClick={() => onOpenStudentPdf(student)}
              className={`min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                hasStudentPdf
                  ? 'bg-[#eef4ff] hover:bg-[#e0ebff] text-[#0b3b8c]'
                  : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#64748b]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">
                picture_as_pdf
              </span>
              <span>PDF</span>
            </button>
          )}

          {onOpenStudentGrid && (
            <button
              type="button"
              onClick={() => onOpenStudentGrid(student)}
              className="min-h-[44px] sm:min-h-[40px] px-2.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-[#475569] shrink-0">
                grid_view
              </span>
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
}) => {
  const isPeb1 = userRole === 'usuario';
  const [searchStudent, setSearchStudent] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [tableElement, setTableElement] = useState<HTMLTableElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    setExpandedStudentId(null);
  }, [classGroup.id]);

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
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [exportSuccessToast, setExportSuccessToast] = useState<string | null>(null);

  const saveSelectedColumns = (nextCols: string[]) => {
    setSelectedColumnIds(nextCols);
    try {
      localStorage.setItem('emeb_turma_xls_columns_v1', JSON.stringify(nextCols));
    } catch {
      // ignore
    }
  };

  const handleToggleColumn = (colId: string) => {
    if (selectedColumnIds.includes(colId)) {
      if (selectedColumnIds.length <= 1) return; // Keep at least 1 column
      saveSelectedColumns(selectedColumnIds.filter((id) => id !== colId));
    } else {
      saveSelectedColumns([...selectedColumnIds, colId]);
    }
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const next = [...selectedColumnIds];
    const [removed] = next.splice(index, 1);
    if (direction === 'up' && index > 0) {
      next.splice(index - 1, 0, removed);
    } else if (direction === 'down' && index < selectedColumnIds.length - 1) {
      next.splice(index + 1, 0, removed);
    } else if (direction === 'top') {
      next.unshift(removed);
    } else if (direction === 'bottom') {
      next.push(removed);
    } else {
      return;
    }
    saveSelectedColumns(next);
  };

  const handleExecuteDownloadXLS = () => {
    downloadClassCustomXLS(classGroup, {
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
    let onibusFretadoCount = 0;
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
      if (s.rotaOnibus && s.rotaOnibus.trim().length > 0) onibusFretadoCount++;

      const hasScannedPdf = Boolean(
        (s.fichaPdfDriveUrl && s.fichaPdfDriveUrl.trim().length > 0) ||
          (s.fichaPdfDriveId && s.fichaPdfDriveId.trim().length > 0)
      );
      if (hasScannedPdf) comFichaEscaneadaCount++;
      else semFichaEscaneadaCount++;

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
      onibusFretadoCount,
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
        (s.rotaOnibus && s.rotaOnibus.toLowerCase().includes(q)) ||
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
      if (statusFilter === 'sem_ficha_pdf') return !hasScannedPdf;
      if (statusFilter === 'movimentados') return isMov;
      if (statusFilter === 'onibus_fretado') {
        return Boolean(s.rotaOnibus && s.rotaOnibus.trim().length > 0);
      }
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
    defaultRowHeight: viewportWidth < 640 ? 172 : 164,
    key: `peb1-${classGroup.id}-${peb1ColumnCount}-${filteredStudents.length}-${peb1LayoutKey}`,
  });

  const adminGridDynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: viewportWidth < 640 ? 228 : 220,
    key: `grid-${classGroup.id}-${adminGridColumnCount}-${filteredStudents.length}-${adminGridLayoutKey}`,
  });

  const adminCompactDynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: viewportWidth < 640 ? 132 : 84,
    key: `compact-${classGroup.id}-${viewportWidth < 640 ? 'm' : 'd'}-${filteredStudents.length}-${
      expandedStudentId === '__ALL__' ? 'all' : 'single'
    }`,
  });

  const tableDynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: 62,
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
            <h1 className="text-[26px] sm:text-[30px] font-bold text-[#0f172a] tracking-[-0.028em] leading-[1.15] break-words">
              {classGroup.name}
            </h1>
            <span className="text-[13px] font-medium tracking-[-0.008em] text-[#64748b] tabular-nums">
              {searchStudent.trim()
                ? `${filteredStudents.length} de ${orderedStudents.length} estudantes`
                : `${orderedStudents.length} estudantes`}
              {classGroup.shift ? ` · ${classGroup.shift.replace('Turno ', '')}` : ''}
            </span>
          </div>

          <div className="relative min-w-0">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Buscar estudante por nome ou número..."
              aria-label="Buscar estudante"
              className="w-full min-h-[46px] pl-11 pr-12 rounded-2xl bg-white text-[15px] font-normal tracking-[-0.012em] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:bg-[#f8fafc] shadow-2xs transition-colors"
            />
            {searchStudent && (
              <button
                type="button"
                onClick={() => setSearchStudent('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-[#64748b] hover:text-[#0f172a] cursor-pointer"
                aria-label="Limpar busca"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] tracking-[-0.008em] text-[#64748b] py-0.5 min-w-0">
        <button
          type="button"
          onClick={onBackToClasses}
          className="text-[#475569] hover:text-[#0f172a] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Turmas</span>
        </button>
        <span className="text-[#64748b] font-medium tabular-nums shrink-0">
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
                <span className="text-[12px] font-medium tracking-[-0.006em] text-[#64748b] tabular-nums">
                  SED {classGroup.classeSedCode}
                </span>
              )}
            </div>
            <p className="text-[13px] tracking-[-0.008em] text-[#64748b] font-normal break-words leading-relaxed">
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
                <span className="material-symbols-outlined text-[17px] text-emerald-300 shrink-0">checklist</span>
                <span>Informar Faltas</span>
              </button>
            )}

            {userRole === 'admin' && (
              <button
                type="button"
                onClick={() => setIsExportXlsModalOpen(true)}
                className="w-full sm:w-auto min-h-[40px] py-2 px-3.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] tracking-[-0.01em] flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[17px] text-[#475569] shrink-0">download</span>
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
              <span className="material-symbols-outlined text-[15px]">verified</span>
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

          {classSummary.onibusFretadoCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'onibus_fretado' ? 'all' : 'onibus_fretado')}
              className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] tracking-[-0.006em] font-semibold transition-colors cursor-pointer flex items-center gap-1 tabular-nums ${
                statusFilter === 'onibus_fretado'
                  ? 'bg-slate-800 text-white'
                  : 'bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155]'
              }`}
            >
              <span>Ônibus</span>
              <span className="font-bold">{classSummary.onibusFretadoCount}</span>
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
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[19px]">
              search
            </span>
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Buscar por Nº, nome, RA ou responsável..."
              aria-label="Buscar estudante"
              className="w-full min-h-[44px] pl-10 pr-9 rounded-2xl bg-[#f1f5f9] text-[15px] font-normal tracking-[-0.012em] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:bg-[#e2e8f0]/70 transition-colors"
            />
            {searchStudent && (
              <button
                type="button"
                onClick={() => setSearchStudent('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] cursor-pointer"
                aria-label="Limpar busca"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
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
                <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
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
              <span className="material-symbols-outlined text-[17px]">
                {expandedStudentId === '__ALL__' ? 'unfold_less' : 'unfold_more'}
              </span>
              <span>{expandedStudentId === '__ALL__' ? 'Recolher' : 'Expandir'}</span>
            </button>

            <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Cartões"
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-xl text-[12.5px] tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#0f172a] font-semibold shadow-2xs'
                    : 'text-[#64748b] hover:text-[#0f172a] font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                title="Lista"
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-xl text-[12.5px] tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'compact'
                    ? 'bg-white text-[#0f172a] font-semibold shadow-2xs'
                    : 'text-[#64748b] hover:text-[#0f172a] font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">view_agenda</span>
                <span className="hidden sm:inline">Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Tabela"
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-xl text-[12.5px] tracking-[-0.01em] flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-[#0f172a] font-semibold shadow-2xs'
                    : 'text-[#64748b] hover:text-[#0f172a] font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">table_rows</span>
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
                    className="w-full text-left text-[13px] tracking-[-0.008em] border-collapse min-w-[1160px]"
                  >
                    <thead className="bg-[#f8fafc] text-[#475569] font-semibold uppercase tracking-[0.03em] text-[11px]">
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
                          <td colSpan={10} className="p-0 border-0" style={{ height: topSpacerPx }} />
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
                          <td colSpan={10} className="p-0 border-0" style={{ height: bottomSpacerPx }} />
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
            <span className="material-symbols-outlined text-[22px] text-emerald-400">
              download_done
            </span>
            <p className="text-[13.5px] font-semibold tracking-[-0.01em] leading-snug">{exportSuccessToast}</p>
          </div>
        </div>
      )}

      {/* MODAL iOS DE DOWNLOAD .XLS DA TURMA (SELECIONAR COLUNAS, CAMPOS E ORDEM) */}
      {isExportXlsModalOpen && (() => {
        const categories: ClassExportCategory[] = [
          'Identificação & Matrícula',
          'Filiação (Mãe e Pai) & Contatos',
          'Frequência, Presença & Faltas',
          'Documentos, Saúde & AEE',
          'Endereço & Transporte',
          'Outros Campos SED',
        ];

        const qCol = columnSearchTerm.toLowerCase().trim();
        const availableColumnsFiltered = CLASS_EXPORT_COLUMNS.filter((col) => {
          const matchesCat =
            activeCategoryFilter === 'all' || col.category === activeCategoryFilter;
          const matchesText =
            qCol === '' ||
            col.label.toLowerCase().includes(qCol) ||
            col.shortLabel.toLowerCase().includes(qCol) ||
            col.category.toLowerCase().includes(qCol);
          return matchesCat && matchesText;
        });

        const selectedColDefs = selectedColumnIds
          .map((id) => CLASS_EXPORT_COLUMNS.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));

        const previewData = buildCustomClassExportPreview(
          classGroup,
          {
            columnIds: selectedColumnIds,
            sortBy: exportSortBy,
            statusFilter: exportStatusFilter,
            includeSummarySheet,
            fileFormat: exportFileFormat,
          },
          OFFICIAL_OCTOBER_DAYS
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-gentle-fade"
            onClick={() => setIsExportXlsModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[#f1f5f9] w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-apple-pop"
            >
              {/* Cabeçalho do Modal de Exportação .XLS */}
              <div className="bg-white px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#f1f5f9] text-[#0f172a] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">table_view</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] tracking-[-0.006em] text-[#64748b] tabular-nums">
                      <span className="font-semibold uppercase tracking-[0.03em]">
                        .{exportFileFormat}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {selectedColDefs.length} colunas · {previewData.rows.length} estudantes
                      </span>
                    </div>
                    <h2 className="text-[18px] sm:text-[20px] font-semibold text-[#0f172a] tracking-[-0.022em] leading-tight mt-0.5 break-words">
                      Exportação · {classGroup.name}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExecuteDownloadXLS}
                    className="min-h-[40px] px-4 rounded-2xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-semibold text-[13px] tracking-[-0.01em] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>Baixar .{exportFileFormat.toUpperCase()}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExportXlsModalOpen(false)}
                    className="w-10 h-10 rounded-2xl bg-[#f1f5f9] text-[#475569] hover:text-[#0f172a] hover:bg-[#e2e8f0] flex items-center justify-center cursor-pointer transition-colors"
                    aria-label="Fechar"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>

              {/* Corpo Principal Rolável */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* 1. Modelos Rápidos */}
                <div className="bg-white rounded-2xl p-4 space-y-2.5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.03em] text-[#334155]">
                      Modelos de Colunas
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          saveSelectedColumns(CLASS_EXPORT_COLUMNS.map((c) => c.id))
                        }
                        className="px-2.5 py-1 rounded-xl bg-[#ecfdf5] hover:bg-[#d1fae5] text-[#047857] font-semibold text-[12px] cursor-pointer"
                      >
                        Todas ({CLASS_EXPORT_COLUMNS.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSelectedColumns(DEFAULT_CLASS_EXPORT_COLUMN_IDS)}
                        className="px-2.5 py-1 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[12px] cursor-pointer"
                      >
                        Padrão
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSelectedColumns(['numeroChamada', 'estudante'])}
                        className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-[12px] cursor-pointer"
                      >
                        Mínimo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {CLASS_EXPORT_PRESETS.map((preset) => {
                      const isCurrentPreset =
                        preset.columnIds.length === selectedColumnIds.length &&
                        preset.columnIds.every((id, idx) => selectedColumnIds[idx] === id);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => saveSelectedColumns(preset.columnIds)}
                          className={`p-3 rounded-2xl text-left transition-colors cursor-pointer flex flex-col justify-between gap-1 ${
                            isCurrentPreset
                              ? 'bg-[#eef4ff] text-[#0b3b8c]'
                              : 'bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#0f172a]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-[13px] tracking-[-0.01em]">
                              {preset.label}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-white/80 text-[#334155] font-semibold text-[11px] tabular-nums">
                              {preset.columnIds.length}
                            </span>
                          </div>
                          <p className="text-[12px] text-[#64748b] break-words leading-snug">
                            {preset.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Ordenação, Filtro e Formato */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-2xl p-3.5 space-y-1 shadow-2xs">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                      Ordenação
                    </label>
                    <select
                      value={exportSortBy}
                      onChange={(e) => setExportSortBy(e.target.value as ClassExportSortOrder)}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f1f5f9] text-[13px] font-semibold text-[#0f172a]"
                    >
                      <option value="number_asc">Nº da Chamada (01, 02...)</option>
                      <option value="name_asc">Alfabética (A → Z)</option>
                      <option value="name_desc">Alfabética (Z → A)</option>
                      <option value="absences_desc">Maior Falta primeiro</option>
                      <option value="presence_asc">Menor % Presença</option>
                    </select>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 space-y-1 shadow-2xs">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                      Estudantes
                    </label>
                    <select
                      value={exportStatusFilter}
                      onChange={(e) =>
                        setExportStatusFilter(e.target.value as ClassExportStatusFilter)
                      }
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#f1f5f9] text-[13px] font-semibold text-[#0f172a]"
                    >
                      <option value="all">
                        Todos ({classGroup.students.length})
                      </option>
                      <option value="ativos">
                        Ativos ({classSummary.ativos})
                      </option>
                      <option value="movimentados">
                        Movimentados ({classSummary.transferidos + classSummary.remanejados})
                      </option>
                      <option value="alerta">
                        Em Alerta &lt;{minLegalPresence}% ({classSummary.alertaLegalCount})
                      </option>
                    </select>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 space-y-1 shadow-2xs">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748b] block">
                      Formato
                    </label>
                    <div className="ios-segmented w-full flex">
                      <button
                        type="button"
                        onClick={() => setExportFileFormat('xls')}
                        className={`flex-1 ios-segmented-item text-center ${
                          exportFileFormat === 'xls' ? 'ios-segmented-item-active' : ''
                        }`}
                      >
                        .XLS
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFileFormat('xlsx')}
                        className={`flex-1 ios-segmented-item text-center ${
                          exportFileFormat === 'xlsx' ? 'ios-segmented-item-active' : ''
                        }`}
                      >
                        .XLSX
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 flex items-center justify-between gap-2 shadow-2xs">
                    <div>
                      <span className="text-[13px] font-semibold text-[#0f172a] block">
                        Aba Resumo
                      </span>
                      <span className="text-[12px] text-[#64748b] block">
                        Totais e presença da turma
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeSummarySheet}
                      onChange={(e) => setIncludeSummarySheet(e.target.checked)}
                      className="w-5 h-5 accent-[#0b3b8c] rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* 3. Grade Dupla: Campos e Ordem */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  <div className="lg:col-span-7 bg-white rounded-2xl p-4 space-y-3 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-[14px] font-semibold text-[#0f172a] tracking-[-0.015em]">
                        Campos disponíveis ({CLASS_EXPORT_COLUMNS.length})
                      </h3>

                      <div className="relative w-full sm:w-56">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[16px]">
                          search
                        </span>
                        <input
                          type="text"
                          value={columnSearchTerm}
                          onChange={(e) => setColumnSearchTerm(e.target.value)}
                          placeholder="Buscar campo..."
                          className="w-full min-h-[38px] pl-8 pr-2.5 rounded-xl bg-[#f1f5f9] text-[13px] font-normal text-[#0f172a] focus:outline-none focus:bg-[#e2e8f0]/70"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setActiveCategoryFilter('all')}
                        className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] font-semibold whitespace-nowrap cursor-pointer ${
                          activeCategoryFilter === 'all'
                            ? 'bg-[#0b3b8c] text-white'
                            : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
                        }`}
                      >
                        Todas
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveCategoryFilter(cat)}
                          className={`min-h-[32px] px-3 py-1 rounded-xl text-[12px] font-semibold whitespace-nowrap cursor-pointer ${
                            activeCategoryFilter === cat
                              ? 'bg-[#0b3b8c] text-white'
                              : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[310px] overflow-y-auto pr-1">
                      {availableColumnsFiltered.map((col) => {
                        const isChecked = selectedColumnIds.includes(col.id);
                        const orderPos = selectedColumnIds.indexOf(col.id);
                        return (
                          <label
                            key={col.id}
                            className={`p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer select-none transition-colors min-w-0 ${
                              isChecked
                                ? 'bg-[#eef4ff] text-[#0b3b8c]'
                                : 'bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#475569]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleColumn(col.id)}
                                className="w-4 h-4 accent-[#0b3b8c] rounded cursor-pointer shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-[12.5px] block break-words leading-snug text-[#0f172a]">
                                  {col.shortLabel}
                                </span>
                                <span className="text-[11px] text-[#64748b] block break-words leading-snug">
                                  {col.label}
                                </span>
                              </div>
                            </div>

                            {isChecked && (
                              <span className="px-2 py-0.5 rounded-lg bg-[#0b3b8c] text-white font-semibold text-[11px] tabular-nums shrink-0">
                                {orderPos + 1}ª
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-5 bg-white rounded-2xl p-4 space-y-3 shadow-2xs">
                    <div>
                      <h3 className="text-[14px] font-semibold text-[#0f172a] tracking-[-0.015em]">
                        Ordem ({selectedColDefs.length})
                      </h3>
                      <p className="text-[12px] text-[#64748b]">
                        Arraste ou use as setas para reordenar
                      </p>
                    </div>

                    <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                      {selectedColDefs.map((col, idx) => (
                        <div
                          key={col.id}
                          draggable
                          onDragStart={() => setDraggedColIndex(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (draggedColIndex === null || draggedColIndex === idx) return;
                            const next = [...selectedColumnIds];
                            const [moved] = next.splice(draggedColIndex, 1);
                            next.splice(idx, 0, moved);
                            saveSelectedColumns(next);
                            setDraggedColIndex(null);
                          }}
                          className="p-2.5 rounded-xl bg-[#f8fafc] hover:bg-[#f1f5f9] flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-7 h-7 rounded-lg bg-[#0b3b8c] text-white font-semibold text-[12px] tabular-nums flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-[12.5px] text-[#0f172a] block break-words leading-snug">
                                {col.shortLabel}
                              </span>
                              <span className="text-[11px] text-[#64748b] block break-words leading-snug">
                                {col.label}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveColumn(idx, 'top')}
                              title="Mover para 1ª"
                              className="w-8 h-8 rounded-lg bg-white hover:bg-[#eef4ff] text-[#0f172a] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                keyboard_double_arrow_up
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveColumn(idx, 'up')}
                              title="Subir"
                              className="w-8 h-8 rounded-lg bg-white hover:bg-[#eef4ff] text-[#0f172a] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                arrow_upward
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={idx === selectedColDefs.length - 1}
                              onClick={() => handleMoveColumn(idx, 'down')}
                              title="Descer"
                              className="w-8 h-8 rounded-lg bg-white hover:bg-[#eef4ff] text-[#0f172a] flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                arrow_downward
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={selectedColDefs.length <= 1}
                              onClick={() => handleToggleColumn(col.id)}
                              title="Remover"
                              className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. Pré-visualização */}
                <div className="bg-white rounded-2xl p-4 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.03em] text-[#334155]">
                      Prévia (.{exportFileFormat.toUpperCase()})
                    </span>
                    <span className="text-[12px] font-medium text-[#64748b] tabular-nums">
                      {previewData.rows.length} linhas × {previewData.headers.length} colunas
                    </span>
                  </div>

                  <div className="rounded-xl overflow-x-auto bg-[#f8fafc]">
                    <table className="w-full text-left text-[12px] border-collapse">
                      <thead className="bg-[#0f172a] text-white font-semibold uppercase whitespace-nowrap">
                        <tr>
                          {previewData.headers.map((h, i) => (
                            <th key={`${h}-${i}`} className="py-2 px-2.5">
                              <span className="text-sky-300 mr-1 tabular-nums">{i + 1}.</span>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="whitespace-nowrap">
                        {previewData.rows.slice(0, 4).map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={rIdx % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}
                          >
                            {previewData.headers.map((h, cIdx) => (
                              <td
                                key={`${rIdx}-${cIdx}`}
                                className="py-1.5 px-2.5 text-[#0f172a] font-medium max-w-[220px] truncate"
                              >
                                {String(row[h] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Rodapé do Modal */}
              <div className="bg-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[12px] text-[#64748b] font-medium tabular-nums">
                  Relatorio_{classGroup.name.replace(/\s+/g, '_')}_2027.{exportFileFormat}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsExportXlsModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-semibold text-[13px] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteDownloadXLS}
                    className="min-h-[40px] px-5 rounded-2xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-semibold text-[13px] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>
                      Baixar .{exportFileFormat.toUpperCase()} ({selectedColDefs.length})
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
