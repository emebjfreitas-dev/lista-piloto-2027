import React, { useEffect } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { StudentAvatar } from './StudentAvatar';

interface VisualizarPdfNominalModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  userRole?: UserRole;
  allClasses?: ClassGroup[];
  onUpdateAllClasses?: (updated: ClassGroup[]) => void;
  onSaveStudentPdfLink?: (
    studentId: string,
    pdfId: string,
    pdfUrl: string,
    subfolder: string,
    isManualLink?: boolean
  ) => void;
  onOpenAdminPdfsModal?: () => void;
}

/**
 * Extrai todos os números de telefone válidos de uma string (ex: "(11) 99876-5432 / 11 91234-5678")
 * e gera o link direto para abrir conversa no WhatsApp.
 */
export function buildWhatsAppLinksFromPhoneString(
  rawPhones?: string,
  studentName?: string,
  customMessage?: string
): Array<{ display: string; waUrl: string }> {
  if (!rawPhones || !rawPhones.trim()) return [];
  const parts = rawPhones
    .split(/[\/|;•,\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const results: Array<{ display: string; waUrl: string }> = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const digits = part.replace(/\D/g, '');
    if (digits.length < 8) continue;
    let normalized = digits;
    if (normalized.length === 8 || normalized.length === 9) {
      normalized = `5511${normalized}`;
    } else if (normalized.length === 10 || normalized.length === 11) {
      normalized = `55${normalized}`;
    } else if (!normalized.startsWith('55')) {
      normalized = `55${normalized}`;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const textMsg = customMessage
      ? encodeURIComponent(customMessage)
      : studentName
      ? encodeURIComponent(
          `Olá! Contato referente ao(à) estudante ${studentName} (EMEB Prof. Joaquim Candelário de Freitas).`
        )
      : '';
    const waUrl = textMsg
      ? `https://wa.me/${normalized}?text=${textMsg}`
      : `https://wa.me/${normalized}`;

    results.push({
      display: part,
      waUrl,
    });
  }

  return results;
}

export const VisualizarPdfNominalModal: React.FC<VisualizarPdfNominalModalProps> = ({
  isOpen,
  onClose,
  student,
  className,
  userRole = 'admin',
  allClasses = [],
  onUpdateAllClasses,
  onSaveStudentPdfLink,
  onOpenAdminPdfsModal,
}) => {
  // Fecha com ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !student) return null;

  const rawUrl = student.fichaPdfDriveUrl || '';
  const rawId = student.fichaPdfDriveId || '';
  const hasPdf = Boolean(rawUrl || rawId);

  let embedUrl = '';
  if (rawUrl) {
    if (
      rawUrl.startsWith('/api/pdfs/') ||
      rawUrl.startsWith('data:application/pdf') ||
      rawUrl.startsWith('blob:')
    ) {
      embedUrl = rawUrl;
    } else if (rawUrl.includes('drive.google.com')) {
      embedUrl = rawUrl.replace(/\/view(\?.*)?$/, '/preview');
    } else {
      embedUrl = rawUrl;
    }
  } else if (rawId) {
    embedUrl = `/api/pdfs/${rawId}.pdf`;
  }

  const rawPhoneText = student.telefones || student.guardianPhone || '';
  const whatsappRequestFichaLinks = buildWhatsAppLinksFromPhoneString(
    rawPhoneText,
    student.name,
    `Olá, família de ${student.name}! Por gentileza, pedimos que enviem a Ficha Informativa / Cadastral atualizada da criança para a secretaria da EMEB Prof. Joaquim Candelário de Freitas. Muito obrigado(a)!`
  );

  const handleRemovePdf = () => {
    if (!confirm(`Deseja desvincular a Ficha PDF de ${student.name}?`)) return;
    if (onUpdateAllClasses && allClasses.length > 0) {
      const updated = allClasses.map((cls) => {
        const sIdx = cls.students.findIndex((s) => s.id === student.id);
        if (sIdx === -1) return cls;
        const nextStudents = [...cls.students];
        nextStudents[sIdx] = {
          ...nextStudents[sIdx],
          fichaPdfDriveUrl: '',
          fichaPdfDriveId: '',
          fichaPdfSubfolder: '',
          fichaPdfManualLink: false,
          updatedAtMs: Date.now(),
        };
        return { ...cls, students: nextStudents, updatedAtMs: Date.now() };
      });
      onUpdateAllClasses(updated);
    } else if (onSaveStudentPdfLink) {
      onSaveStudentPdfLink(student.id, '', '', '', false);
    }
    onClose();
  };

  // CASO 1: ESTUDANTE SEM FICHA PDF -> Direciona exclusivamente para o Arraste & Solte em Lote
  if (!hasPdf) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-gentle-fade"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[26px]">picture_as_pdf</span>
              </div>
              <div className="min-w-0">
                <span className="text-xs font-medium uppercase tracking-wider text-rose-600 block">
                  Ficha PDF Pendente · {className}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-950 truncate">
                  {student.name}
                </h3>
                <p className="text-xs text-slate-500 font-normal">
                  Nº {student.number.toString().padStart(2, '0')} · RA {student.ra || '—'}-{student.digRa || ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Aviso de Método Único (Arraste em Lote) */}
          <div className="p-5 rounded-2xl bg-slate-50 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <span className="material-symbols-outlined text-[20px] text-rose-600">
                folder_zip
              </span>
              <h4 className="text-sm font-bold">
                Nenhuma Ficha PDF vinculada a este estudante
              </h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              As fichas PDF dos alunos são vinculadas exclusivamente por meio do{' '}
              <strong className="font-semibold text-slate-900">
                Arraste &amp; Solte em Lote
              </strong>{' '}
              (por RA, Nome Completo ou Turma + Nº de Chamada).
            </p>

            {userRole === 'admin' && onOpenAdminPdfsModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminPdfsModal();
                }}
                className="w-full h-11 px-4 rounded-xl bg-slate-950 hover:bg-black text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                <span>Abrir Arraste &amp; Solte em Lote de PDFs</span>
              </button>
            )}
          </div>

          {/* Notificação à família no WhatsApp */}
          {whatsappRequestFichaLinks.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-50 space-y-2.5">
              <p className="text-xs font-medium text-slate-700">
                Solicitar Ficha Cadastral atualizada à família:
              </p>
              <div className="flex flex-wrap gap-2">
                {whatsappRequestFichaLinks.map((ph, idx) => (
                  <a
                    key={idx}
                    href={ph.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366] text-[#128C7E] hover:text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    <span>Pedir no WhatsApp ({ph.display})</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs cursor-pointer transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // CASO 2: ESTUDANTE COM FICHA PDF -> Exibe o PDF diretamente em tela limpa sem contornos
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Cabeçalho */}
        <div className="bg-white px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <StudentAvatar
              student={student}
              size="sm"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider font-mono tabular-nums">
                  {className} · Nº {student.number.toString().padStart(2, '0')}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium uppercase bg-emerald-50 text-emerald-800">
                  Ficha Digitalizada
                </span>
              </div>

              <h3 className="text-sm sm:text-base font-bold text-slate-950 truncate leading-tight mt-0.5">
                {student.name}
              </h3>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 shrink-0">
            {embedUrl && (
              <a
                href={embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Abrir PDF em nova aba / tela cheia"
              >
                <span className="material-symbols-outlined text-[17px]">open_in_new</span>
                <span>Tela Cheia</span>
              </a>
            )}

            {userRole === 'admin' && onOpenAdminPdfsModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminPdfsModal();
                }}
                className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Atualizar via Arraste & Solte em Lote"
              >
                <span className="material-symbols-outlined text-[17px] text-rose-600">upload_file</span>
                <span className="hidden sm:inline">Substituir em Lote</span>
              </button>
            )}

            {userRole === 'admin' && (
              <button
                type="button"
                onClick={handleRemovePdf}
                className="h-10 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                title="Remover Ficha PDF vinculada"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
                <span className="hidden sm:inline">Remover</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[17px]">close</span>
              <span>Fechar</span>
            </button>
          </div>
        </div>

        {/* Visualização Direta do PDF */}
        <div className="flex-1 overflow-hidden bg-slate-100 p-2 sm:p-3 flex flex-col">
          <div className="w-full h-[62vh] sm:h-[68vh] bg-white rounded-2xl overflow-hidden flex flex-col shadow-xs">
            <iframe
              src={embedUrl}
              title={`Ficha de ${student.name}`}
              className="w-full flex-1 border-0"
              allow="autoplay"
            />
          </div>
          <div className="pt-2 px-1 flex items-center justify-between text-xs text-slate-500 font-normal">
            <span>Ficha Oficial Digitalizada · SME Jundiaí</span>
            {embedUrl && (
              <a
                href={embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <span>Download / Imprimir</span>
                <span className="material-symbols-outlined text-[14px]">arrow_outward</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
