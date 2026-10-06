import React, { useState } from 'react';
import { ClassGroup } from '../types';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#edeeec] p-5 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#edeeec]">
          <div className="flex items-center gap-2 text-[#003440]">
            <span className="material-symbols-outlined text-[26px]">rate_review</span>
            <h3 className="text-[1.25rem] font-bold">
              Anotações da Turma — {classGroup.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#41484b] flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-3">
          <p className="text-[0.9rem] text-[#41484b]">
            Registre ocorrências da turma, recados da coordenação ou observações para as reuniões pedagógicas:
          </p>

          <textarea
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Digite os comentários e recados sobre a turma aqui..."
            className="w-full p-3.5 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] text-[#191c1b] text-[0.95rem] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#003440]/20 resize-none leading-relaxed"
          />

          {savedSuccess && (
            <div className="p-3 bg-[#a4f3ca]/40 text-[#003723] rounded-xl font-bold text-[0.9rem] flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <span>Anotações salvas com sucesso no diário!</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-[#edeeec] flex gap-3">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 min-h-[50px] bg-[#edeeec] hover:bg-[#e7e8e6] text-[#41484b] font-bold text-[0.95rem] rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            type="button"
            className="flex-1 min-h-[50px] bg-[#003440] hover:bg-[#1e4b58] text-white font-bold text-[0.95rem] rounded-xl shadow-sm transition-all cursor-pointer"
          >
            Salvar Anotações
          </button>
        </div>
      </div>
    </div>
  );
};
