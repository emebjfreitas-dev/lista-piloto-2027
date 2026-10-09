import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';

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
  onNavigateToScreen: (
    screen:
      | 'turmas'
      | 'detalhes'
      | 'frequencia_mensal'
      | 'faltas_consecutivas'
      | 'bolsa_familia'
      | 'planilha'
      | 'usuarios_acesso'
  ) => void;
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
          st.rotaOnibus,
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
      className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-md flex items-start justify-center pt-12 sm:pt-20 p-3 sm:p-4 animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-[28px] shadow-[0_28px_70px_rgba(0,0,0,0.28)] border border-black/[0.08] overflow-hidden flex flex-col max-h-[82vh]"
      >
        {/* Barra Superior de Busca Instantânea */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-black/[0.06] flex items-center gap-3 bg-[#fbfbfd]">
          <span className="material-symbols-outlined text-[22px] text-[#0071e3] shrink-0">
            search
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar estudante por nome, RA, mãe, pai, ônibus ou turma..."
            className="flex-1 bg-transparent text-[#1d1d1f] text-[0.98rem] font-semibold placeholder:text-[#86868b] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="w-7 h-7 rounded-full bg-black/[0.06] hover:bg-black/[0.12] text-[#6e6e73] flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-lg bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] font-bold text-[0.7rem] uppercase tracking-wider cursor-pointer shrink-0"
          >
            ESC
          </button>
        </div>

        {/* Corpo de Resultados Instantâneos */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* Atalhos Rápidos de Telas */}
          {!normalizedQuery && (
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#86868b] mr-1">
                Ir para:
              </span>
              <button
                type="button"
                onClick={() => {
                  onNavigateToScreen(userRole === 'usuario' ? 'detalhes' : 'turmas');
                  onClose();
                }}
                className="px-3 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#1d1d1f] text-[#1d1d1f] hover:text-white text-[0.74rem] font-bold transition-colors cursor-pointer"
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
                  className="px-3 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#1d1d1f] text-[#1d1d1f] hover:text-white text-[0.74rem] font-bold transition-colors cursor-pointer"
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
                className="px-3 py-1 rounded-full bg-[#fff2f2] hover:bg-[#ff3b30] text-[#ff3b30] hover:text-white text-[0.74rem] font-bold transition-colors cursor-pointer"
              >
                Faltas Consecutivas
              </button>
              {userRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateToScreen('bolsa_familia');
                    onClose();
                  }}
                  className="px-3 py-1 rounded-full bg-[#eaf6ef] hover:bg-[#005035] text-[#005035] hover:text-white text-[0.74rem] font-bold transition-colors cursor-pointer"
                >
                  Bolsa Família
                </button>
              )}
            </div>
          )}

          {/* Turmas Encontradas */}
          {matchingClasses.length > 0 && (
            <div className="space-y-1.5">
              <span className="px-2 text-[0.68rem] font-extrabold uppercase tracking-wider text-[#86868b] block">
                Turmas ({matchingClasses.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {matchingClasses.map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => {
                      onSelectClass(cls);
                      onClose();
                    }}
                    className="p-2.5 rounded-2xl bg-[#f5f5f7] hover:bg-[#1d1d1f] text-[#1d1d1f] hover:text-white text-left transition-colors cursor-pointer flex items-center justify-between gap-2 group"
                  >
                    <div className="min-w-0">
                      <span className="text-[0.82rem] font-extrabold block truncate">
                        {cls.name}
                      </span>
                      <span className="text-[0.68rem] opacity-70 block truncate tabular-nums">
                        {cls.students.length} estudantes · {cls.shift.replace('Turno ', '')}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[16px] opacity-60 group-hover:opacity-100">
                      arrow_forward
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Estudantes Encontrados */}
          <div className="space-y-1.5">
            <div className="px-2 flex items-center justify-between">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#86868b]">
                {normalizedQuery
                  ? `Estudantes Encontrados (${matchingStudents.length})`
                  : 'Acesso Rápido a Estudantes'}
              </span>
              <span className="text-[0.66rem] text-[#86868b] hidden sm:inline">
                Use ↑ ↓ e Enter para abrir o perfil
              </span>
            </div>

            {matchingStudents.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#f5f5f7]">
                <p className="text-[0.88rem] font-bold text-[#1d1d1f]">
                  Nenhum estudante encontrado para “{query}”
                </p>
                <p className="text-[0.76rem] text-[#6e6e73] mt-0.5">
                  Tente buscar por parte do nome, RA, nome da mãe ou rota de ônibus.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {matchingStudents.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
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
                      className={`p-2.5 sm:px-3.5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#f0f6ff] ring-1 ring-[#0071e3]/30' : 'hover:bg-[#f5f5f7]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-8 h-8 rounded-xl bg-[#1d1d1f] text-white font-extrabold text-[0.74rem] tabular-nums flex items-center justify-center shrink-0">
                          {item.student.number.toString().padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-extrabold text-[0.88rem] text-[#1d1d1f] truncate">
                              {item.student.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-black/[0.06] text-[#1d1d1f] font-bold text-[0.66rem]">
                              {item.cls.name}
                            </span>
                            {item.consecutiveCount >= 3 && (
                              <span className="px-2 py-0.5 rounded-full bg-[#ff3b30]/12 text-[#ff3b30] font-extrabold text-[0.65rem] tabular-nums">
                                {item.consecutiveCount}d seguidos
                              </span>
                            )}
                            {item.student.rotaOnibus && (
                              <span className="px-2 py-0.5 rounded-md bg-[#f0f9ff] text-[#0369a1] font-bold text-[0.65rem]">
                                🚌 {item.student.rotaOnibus.split('-')[0].trim()}
                              </span>
                            )}
                          </div>
                          <div className="text-[0.72rem] text-[#6e6e73] truncate tabular-nums mt-0.5">
                            RA {item.student.ra}-{item.student.digRa}
                            {item.student.filiacao1 ? ` · Mãe: ${item.student.filiacao1}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenStudentPdf(item.student, item.cls.name);
                            onClose();
                          }}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[0.7rem] flex items-center gap-1 cursor-pointer ${
                            item.hasPdf
                              ? 'bg-[#0071e3] text-white hover:bg-[#005bb5]'
                              : 'bg-[#fff2f2] text-[#ff3b30] border border-[#ff3b30]/25'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            picture_as_pdf
                          </span>
                          <span className="hidden sm:inline">
                            {item.hasPdf ? 'PDF' : 'Sem PDF'}
                          </span>
                        </button>

                        <span className="px-2.5 py-1.5 rounded-xl bg-white border border-black/[0.08] text-[#1d1d1f] font-bold text-[0.7rem] flex items-center gap-1">
                          <span>Perfil</span>
                          <span className="material-symbols-outlined text-[14px]">
                            open_in_full
                          </span>
                        </span>
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
