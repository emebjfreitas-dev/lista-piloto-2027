import React, { useState } from 'react';
import { ClassGroup } from '../types';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface AnotacoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  classGroup: ClassGroup;
  onSaveNotes: (notes: string) => void;
}

export const AnotacoesModal: React.FC<AnotacoesModalProps> = ({
  isOpen,
  onClose,
  classGroup,
  onSaveNotes,
}) => {
  useModalScrollLock(isOpen);

  const [notes, setNotes] = useState(classGroup.pedagogicalNotes);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveNotes(notes);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 text-slate-900">
            <span className="material-symbols-outlined text-[22px] text-blue-600">rate_review</span>
            <h3 className="text-base font-semibold">
              Anotações da Turma — {classGroup.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="modal-scroll-body flex-1 p-5 py-4 space-y-3">
          <p className="text-xs text-slate-500 font-medium">
            Registre ocorrências da turma, recados da coordenação ou observações para as reuniões pedagógicas:
          </p>

          <textarea
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Digite os comentários e recados sobre a turma aqui..."
            className="w-full p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 text-xs sm:text-sm focus:bg-white focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/20 resize-none leading-relaxed transition-colors"
          />

          {savedSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
              <span>Anotações salvas com sucesso no diário!</span>
            </div>
          )}
        </div>

        {/* Actions Sticky */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200/90 p-4 flex gap-3 shrink-0 z-10">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 min-h-[46px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            type="button"
            className="flex-1 min-h-[46px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            <span>Salvar Anotações</span>
          </button>
        </div>
      </div>
    </div>
  );
};
