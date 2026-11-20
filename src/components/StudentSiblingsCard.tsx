import React from 'react';
import { Student } from '../types';
import { DetectedSibling } from '../utils/siblingDetection';
import { StudentAvatar } from './StudentAvatar';
import { Eye, User, Users } from 'lucide-react';

interface StudentSiblingsCardProps {
  siblings: DetectedSibling[];
  onSelectSibling?: (student: Student) => void;
  onOpenSiblingFicha?: (student: Student, classId?: string) => void;
  className?: string;
  compact?: boolean;
  title?: string;
}

export const StudentSiblingsCard: React.FC<StudentSiblingsCardProps> = ({
  siblings,
  onSelectSibling,
  onOpenSiblingFicha,
  className = '',
  compact = false,
  title = 'Irmãos Identificados na Escola',
}) => {
  if (!siblings || siblings.length === 0) return null;

  const otherClassSiblings = siblings.filter((s) => !s.isSameClass);
  const sameClassSiblings = siblings.filter((s) => s.isSameClass);

  const getBadgeStyle = (type: DetectedSibling['relationType']) => {
    switch (type) {
      case 'both':
        return 'bg-emerald-100 text-emerald-950';
      case 'mother':
        return 'bg-teal-100 text-teal-950';
      case 'father':
        return 'bg-blue-100 text-blue-950';
      case 'guardian':
        return 'bg-indigo-100 text-indigo-950';
      default:
        return 'bg-[#edf2f7] text-slate-900';
    }
  };

  const renderRelationIcon = (type: DetectedSibling['relationType']) => {
    switch (type) {
      case 'both':
        return <Users className="w-[13px] h-[13px] shrink-0" strokeWidth={2} />;
      case 'mother':
      case 'father':
        return <User className="w-[13px] h-[13px] shrink-0" strokeWidth={2} />;
      default:
        return <Users className="w-[13px] h-[13px] shrink-0" strokeWidth={2} />;
    }
  };

  const handleAction = (sib: DetectedSibling) => {
    if (onOpenSiblingFicha) {
      onOpenSiblingFicha(sib.student, sib.classId);
    } else if (onSelectSibling) {
      onSelectSibling(sib.student);
    }
  };

  return (
    <div
      className={`rounded-2xl bg-emerald-100/75 p-3 sm:p-3.5 space-y-2.5 shadow-[0_6px_20px_-8px_rgba(4,120,87,0.16)] ${className}`}
    >
      {/* Cabeçalho de Destaque */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs shrink-0">
            <Users className="w-4 h-4" strokeWidth={2} />
          </div>
          <div>
            <h5 className="font-bold text-xs uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
              <span>{title}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-950 text-[10.5px] font-extrabold tabular-nums">
                {siblings.length}
              </span>
            </h5>
            <p className="text-[11px] text-emerald-900 font-medium leading-tight">
              Cruzamento automático de filiação (Mãe, Pai ou Ambos)
            </p>
          </div>
        </div>

        {otherClassSiblings.length > 0 && (
          <span className="text-[11px] font-semibold text-emerald-950 bg-white px-2.5 py-1 rounded-xl shadow-xs">
            {otherClassSiblings.length}{' '}
            {otherClassSiblings.length === 1 ? 'irmão em outra turma' : 'irmãos em outras turmas'}
          </span>
        )}
      </div>

      {/* Lista de Irmãos Identificados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
        {siblings.map((sib) => {
          const hasAction = Boolean(onSelectSibling || onOpenSiblingFicha);
          return (
            <div
              key={sib.student.id}
              className={`rounded-xl bg-white p-2.5 flex items-center justify-between gap-2.5 shadow-[0_3px_10px_-5px_rgba(9,15,29,0.08)] transition-all duration-200 ${
                hasAction ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(4,120,87,0.22)]' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <StudentAvatar
                  student={sib.student}
                  name={sib.student.name}
                  photo={sib.student.photo}
                  size={compact ? 'md' : 'lg'}
                />

                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-[13px] tracking-[-0.01em] text-slate-950 truncate block">
                      {sib.student.name}
                    </span>
                  </div>

                  {/* Turma e Turno */}
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-700 font-medium">
                    <span className="font-semibold text-emerald-950 bg-emerald-100 px-1.5 py-0.2 rounded-md">
                      Turma {sib.className}
                    </span>
                    {sib.shift && (
                      <span className="text-slate-700 text-[10.5px]">· {sib.shift}</span>
                    )}
                    {sib.student.idade && (
                      <span className="text-slate-700 text-[10.5px]">· {sib.student.idade} anos</span>
                    )}
                    {sib.isSameClass && (
                      <span className="text-[10px] bg-[#edf2f7] text-slate-800 px-1 py-0.2 rounded font-semibold">
                        Mesma turma
                      </span>
                    )}
                  </div>

                  {/* Relação Detectada (Mãe, Pai ou Ambos) */}
                  <div className="pt-0.5 flex items-center gap-1">
                    <span
                      title={sib.matchedReason}
                      className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-md ${getBadgeStyle(
                        sib.relationType
                      )}`}
                    >
                      {renderRelationIcon(sib.relationType)}
                      <span>{sib.relationLabel}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão de Ação Rápida */}
              {hasAction && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(sib);
                  }}
                  title={`Abrir dados de ${sib.student.name}`}
                  className="shrink-0 min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-[11.5px] flex items-center justify-center gap-1 cursor-pointer transition-all duration-200 shadow-xs active:scale-[0.97]"
                >
                  <Eye className="w-[15px] h-[15px]" strokeWidth={2} />
                  <span className="hidden sm:inline">Ver</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
