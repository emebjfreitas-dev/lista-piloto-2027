import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClassGroup, Student, UserRole, ScreenType } from '../types';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';
import { ArrowRight, FileText, Maximize2, Search, X } from 'lucide-react';
import {
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
} from '../utils/genderDictionary';

interface SpotlightCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  userRole: UserRole;
  onSelectClass: (cls: ClassGroup) => void;
  onOpenStudentGrid: (
    student: Student,
    classId: string,
    className: string,
    diasLetivosMes: number
  ) => void;
  onOpenStudentPdf: (student: Student, className: string) => void;
  onNavigateToScreen: (screen: ScreenType) => void;
}

export const SpotlightCommandModal: React.FC<SpotlightCommandModalProps> = ({
  isOpen,
  onClose,
  classes,
  userRole,
  onSelectClass,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onNavigateToScreen,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
    }
  }, [isOpen]);

  const allStudentsIndex = useMemo(() => {
    const items: Array<{
      cls: ClassGroup;
      student: Student;
      searchText: string;
      hasPdf: boolean;
      consecutiveCount: number;
    }> = [];

    for (const cls of classes) {
      for (const st of cls.students) {
        const occs = getStudentCumulativeOccurrences(st);
        const latestOcc = occs.length > 0 ? occs[occs.length - 1] : null;
        const consecutiveCount = latestOcc ? latestOcc.selectedDates.length : 0;
        const hasPdf = Boolean(
          (st.fichaPdfDriveUrl && st.fichaPdfDriveUrl.trim().length > 0) ||
            (st.fichaPdfDriveId && st.fichaPdfDriveId.trim().length > 0)
        );
        const searchText = [
          st.name,
          st.estudante,
          st.ra,
          `${st.ra}-${st.digRa}`,
          cls.name,
          st.filiacao1,
          st.filiacao2,
          st.guardianName,
          st.telefones,
          st.guardianPhone,
          st.deficiencia,
          `chamada ${st.number}`,
          `nº ${st.number}`,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        items.push({
          cls,
          student: st,
          searchText,
          hasPdf,
          consecutiveCount,
        });
      }
    }
    return items;
  }, [classes]);

  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const matchingClasses = useMemo(() => {
    if (!normalizedQuery) return classes.slice(0, 6);
    return classes
      .filter((c) => {
        const text = `${c.name} ${c.shift} ${c.teacherName || ''}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return text.includes(normalizedQuery);
      })
      .slice(0, 6);
  }, [classes, normalizedQuery]);

  const matchingStudents = useMemo(() => {
    if (!normalizedQuery) {
      // Quando vazio, sugere primeiro quem está com alerta de faltas seguidas ou os primeiros alunos
      return [...allStudentsIndex]
        .sort((a, b) => b.consecutiveCount - a.consecutiveCount)
        .slice(0, 8);
    }
    return allStudentsIndex
      .filter((item) => item.searchText.includes(normalizedQuery))
      .slice(0, 12);
  }, [allStudentsIndex, normalizedQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, Math.max(0, matchingStudents.length - 1))
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter' && matchingStudents[selectedIndex]) {
        e.preventDefault();
        const item = matchingStudents[selectedIndex];
        onOpenStudentGrid(
          item.student,
          item.cls.id,
          item.cls.name,
          item.cls.classesHeld || 20
        );
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, matchingStudents, selectedIndex, onOpenStudentGrid, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] bg-slate-950/50 backdrop-blur-sm flex items-start justify-center pt-12 sm:pt-20 p-3 sm:p-4 animate-backdrop-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-shell w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[82vh] animate-apple-pop"
      >
        {/* Barra Superior de Busca Instantânea */}
        <div className="px-4 sm:px-5 py-3.5 flex items-center gap-3 bg-[#edf2f7]">
          <Search className="w-5 h-5 text-[#092e70] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar estudante por nome, RA, mãe, pai ou turma..."
            className="flex-1 bg-transparent text-slate-950 text-sm sm:text-base font-medium placeholder:text-slate-600"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="w-8 h-8 rounded-lg bg-white hover:bg-[#dce7fb] text-slate-800 flex items-center justify-center cursor-pointer shrink-0 transition-colors shadow-xs"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] px-2.5 rounded-lg bg-white hover:bg-[#dce7fb] text-slate-800 font-bold text-xs uppercase tracking-wider cursor-pointer shrink-0 transition-colors shadow-xs"
          >
            ESC
          </button>
        </div>

        {/* Corpo de Resultados Instantâneos */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* Atalhos Rápidos de Telas */}
          {!normalizedQuery && (
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 mr-1">
                Ir para:
              </span>
              <button
                type="button"
                onClick={() => {
                  onNavigateToScreen(userRole === 'usuario' ? 'detalhes' : 'turmas');
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              >
                Turmas
              </button>
              {userRole !== 'peb2' && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateToScreen('frequencia_mensal');
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  Faltas do Mês
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onNavigateToScreen('faltas_consecutivas');
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              >
                Faltas Consecutivas
              </button>
              {userRole === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToScreen('bolsa_familia');
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Bolsa Família
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToScreen('usuarios_acesso');
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Central Admin
                  </button>
                </>
              )}
            </div>
          )}

          {/* Turmas Encontradas */}
          {matchingClasses.length > 0 && (
            <div className="space-y-1.5">
              <span className="px-2 text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Turmas ({matchingClasses.length})
              </span>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2">
                {matchingClasses.map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => {
                      onSelectClass(cls);
                      onClose();
                    }}
                    className="p-3 rounded-xl bg-slate-50 hover:bg-slate-900 text-slate-800 hover:text-white text-left transition-colors cursor-pointer flex items-center justify-between gap-2 group min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold block break-words leading-snug">
                        {cls.name}
                      </span>
                      <span className="text-xs opacity-75 block break-words tabular-nums font-mono mt-0.5">
                        {cls.students.length} estudantes · {cls.shift.replace('Turno ', '')}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Estudantes Encontrados */}
          <div className="space-y-1.5">
            <div className="px-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {normalizedQuery
                  ? `Estudantes Encontrados (${matchingStudents.length})`
                  : 'Acesso Rápido a Estudantes'}
              </span>
              <span className="text-xs font-medium text-slate-700 hidden sm:inline">
                Use ↑ ↓ e Enter para abrir o perfil
              </span>
            </div>

            {matchingStudents.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-50">
                <p className="text-sm font-semibold text-slate-950">
                  Nenhum estudante encontrado para “{query}”
                </p>
                <p className="text-xs text-slate-700 mt-0.5">
                  Tente buscar por parte do nome, RA, nome da mãe ou turma.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {matchingStudents.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const gStudent = getStudentGenderLabel(item.student);
                  const gGuardian = resolveGuardianRelationshipInfo(
                    item.student.filiacao1 || item.student.guardianName,
                    'filiacao1',
                    item.student.notes
                  );
                  return (
                    <div
                      key={`${item.cls.id}-${item.student.id}`}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => {
                        onOpenStudentGrid(
                          item.student,
                          item.cls.id,
                          item.cls.name,
                          item.cls.classesHeld || 20
                        );
                        onClose();
                      }}
                      className={`p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all min-w-0 ${
                        isSelected
                          ? 'bg-[#dce7fb] shadow-[0_4px_14px_-4px_rgba(9,46,112,0.16)]'
                          : 'hover:bg-[#f4f7fb]'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        <span className="w-8 h-8 rounded-lg bg-slate-900 text-white font-mono font-semibold text-xs tabular-nums flex items-center justify-center shrink-0">
                          {item.student.number.toString().padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-sm text-slate-900 break-words leading-snug">
                              {item.student.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded font-medium text-xs ${
                                gStudent.code === 'F'
                                  ? 'bg-rose-50 text-rose-800'
                                  : 'bg-blue-50 text-blue-800'
                              }`}
                            >
                              {gStudent.estudanteTitle}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-medium text-xs">
                              {item.cls.name}
                            </span>
                            {item.consecutiveCount >= 3 && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-semibold text-xs font-mono tabular-nums">
                                {item.consecutiveCount} dias seguidos
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-700 break-words tabular-nums font-mono mt-0.5">
                            RA {item.student.ra}-{item.student.digRa}
                            {gGuardian.cleanName !== '—'
                              ? ` · ${gGuardian.shortRoleLabel}: ${gGuardian.cleanName}`
                              : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenStudentPdf(item.student, item.cls.name);
                            onClose();
                          }}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-normal text-center ${
                            item.hasPdf
                              ? 'bg-[#0047b3] text-white hover:bg-[#092e70]'
                              : 'bg-rose-100/90 text-rose-950 hover:bg-rose-200'
                          }`}
                        >
                          <FileText className="w-[15px] h-[15px] shrink-0" />
                          <span>{item.hasPdf ? 'Ficha Informativa' : 'Sem Ficha Info.'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onOpenStudentGrid(
                              item.student,
                              item.cls.id,
                              item.cls.name,
                              item.cls.classesHeld || 20
                            );
                            onClose();
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-normal text-center"
                        >
                          <span>Ficha Completa</span>
                          <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
