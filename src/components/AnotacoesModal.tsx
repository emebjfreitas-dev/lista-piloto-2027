import React, { useState } from 'react';
import { ClassGroup } from '../types';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ModalPortal } from './ui/ModalPortal';
import { CheckCircle2, FileEdit, Save, X } from 'lucide-react';

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
    <ModalPortal>
      <div className="fixed inset-0 z-[110] overflow-hidden flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-sm animate-backdrop-in">
        <div className="modal-shell w-full max-w-lg rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[88dvh] animate-apple-pop">
        {/* Header */}
        <div className="modal-header-surface flex items-start sm:items-center justify-between gap-3 p-5 pb-4 shrink-0">
          <div className="flex items-start sm:items-center gap-2 text-slate-950 min-w-0 flex-1">
            <FileEdit className="w-[22px] h-[22px] text-[#0f3370] shrink-0 mt-0.5 sm:mt-0" strokeWidth={2} />
            <h3 className="text-base font-bold break-words leading-snug">
              Anotações da Turma — {classGroup.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#e8f0fe] text-slate-800 hover:text-slate-950 flex items-center justify-center cursor-pointer transition-colors duration-150 shrink-0 shadow-xs"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5 shrink-0" strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-scroll-body flex-1 min-h-0 p-5 py-4 space-y-3">
          <p className="text-xs text-slate-700 font-medium leading-relaxed">
            Registre ocorrências da turma, recados da coordenação ou observações para as reuniões pedagógicas:
          </p>

          <textarea
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Digite os comentários e recados sobre a turma aqui..."
            className="w-full p-3.5 bg-[#f3f6fb] rounded-xl text-slate-950 text-xs sm:text-sm focus:bg-white resize-none leading-relaxed transition-colors shadow-[inset_0_1px_2px_rgba(9,15,29,0.06)]"
          />

          {savedSuccess && (
            <div className="p-3 bg-emerald-100/90 text-emerald-950 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-[18px] h-[18px] text-[#047857] shrink-0" strokeWidth={2} />
              <span>Anotações salvas com sucesso no diário!</span>
            </div>
          )}
        </div>

        {/* Actions Sticky */}
        <div className="sticky bottom-0 bg-[#f3f6fb]/95 backdrop-blur-sm p-4 flex gap-3 shrink-0 z-10">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 min-h-[46px] bg-white hover:bg-[#eef3f9] text-slate-900 font-bold text-sm rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            type="button"
            className="flex-1 min-h-[46px] bg-[#14428c] hover:bg-[#0f3370] text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Save className="w-[18px] h-[18px]" strokeWidth={2} />
            <span>Salvar Anotações</span>
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
