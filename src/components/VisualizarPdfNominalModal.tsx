import React, { useEffect, useState, useRef } from 'react';
import { ClassGroup, Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { uploadStudentPdfViaApi } from '../services/db';

interface VisualizarPdfNominalModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  allClasses?: ClassGroup[];
  onUpdateAllClasses?: (updated: ClassGroup[]) => void;
  onSaveStudentPdfLink?: (
    studentId: string,
    pdfId: string,
    pdfUrl: string,
    subfolder: string,
    isManualLink?: boolean
  ) => void;
  onSyncDrivePdfs?: () => Promise<void>;
  onSaveStudentDirectPdfUrl?: (studentId: string, driveUrl: string) => void;
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
  allClasses = [],
  onUpdateAllClasses,
  onSaveStudentPdfLink,
  onOpenAdminPdfsModal,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [showReplaceView, setShowReplaceView] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStatusFeedback(null);
    setShowReplaceView(false);
  }, [isOpen, student?.id]);

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

  // Determina URL para visualização
  let embedUrl = '';
  if (rawUrl) {
    if (rawUrl.startsWith('/api/pdfs/') || rawUrl.startsWith('data:application/pdf') || rawUrl.startsWith('blob:')) {
      embedUrl = rawUrl;
    } else if (rawUrl.includes('drive.google.com')) {
      embedUrl = rawUrl.replace(/\/view(\?.*)?$/, '/preview');
    } else {
      embedUrl = rawUrl;
    }
  } else if (rawId) {
    embedUrl = `https://drive.google.com/file/d/${rawId}/preview`;
  }

  const rawPhoneText = student.telefones || student.guardianPhone || '';
  const whatsappRequestFichaLinks = buildWhatsAppLinksFromPhoneString(
    rawPhoneText,
    student.name,
    `Olá, família de ${student.name}! Por gentileza, pedimos que enviem a Ficha Informativa / Cadastral atualizada da criança para a secretaria da EMEB Prof. Joaquim Candelário de Freitas. Muito obrigado(a)!`
  );

  const handleProcessPdfFile = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setStatusFeedback('Erro: O arquivo selecionado não é um PDF válido.');
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setStatusFeedback('Erro: Arquivo muito grande. O limite máximo é de 30 MB.');
      return;
    }

    setIsUploading(true);
    setStatusFeedback(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const res = await uploadStudentPdfViaApi(student.id, dataUrl);
          if (res.success && res.student) {
            setStatusFeedback('✓ Ficha PDF salva e sincronizada com sucesso!');
            setShowReplaceView(false);

            // Atualiza o estado global das turmas
            if (onUpdateAllClasses && allClasses.length > 0) {
              const updated = allClasses.map((cls) => {
                const sIdx = cls.students.findIndex((s) => s.id === student.id);
                if (sIdx === -1) return cls;
                const nextStudents = [...cls.students];
                nextStudents[sIdx] = {
                  ...nextStudents[sIdx],
                  fichaPdfDriveUrl: res.student.fichaPdfDriveUrl,
                  fichaPdfDriveId: res.student.fichaPdfDriveId,
                  fichaPdfSubfolder: res.student.fichaPdfSubfolder || className,
                  updatedAtMs: Date.now(),
                };
                return { ...cls, students: nextStudents, updatedAtMs: Date.now() };
              });
              onUpdateAllClasses(updated);
            } else if (onSaveStudentPdfLink) {
              onSaveStudentPdfLink(
                student.id,
                res.student.fichaPdfDriveId || `pdf_${student.id}`,
                res.student.fichaPdfDriveUrl || '',
                className,
                true
              );
            }
          } else {
            setStatusFeedback(`Erro ao salvar PDF: ${res.error || 'Falha no servidor'}`);
          }
        } catch (innerErr: any) {
          setStatusFeedback(`Erro no processamento: ${innerErr?.message || innerErr}`);
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        setStatusFeedback('Erro ao ler arquivo PDF do disco.');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setStatusFeedback(`Falha ao carregar: ${err?.message || err}`);
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleProcessPdfFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemovePdf = async () => {
    if (!confirm(`Deseja desvincular a Ficha PDF de ${student.name}?`)) return;
    setIsUploading(true);
    try {
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
      setStatusFeedback('✓ Ficha PDF desvinculada com sucesso.');
      setShowReplaceView(false);
    } finally {
      setIsUploading(false);
    }
  };

  // CASO 1: SEM PDF OU EM MODO DE SUBSTITUIÇÃO/UPLOAD DIRETO
  if (!hasPdf || showReplaceView) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-gentle-fade"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-xl rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[26px]">picture_as_pdf</span>
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 block">
                  {hasPdf ? 'Substituir Ficha PDF' : 'Ficha Informativa Pendente'} · {className}
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

          {/* Área de Arraste e Solte Direta de PDF (Único Método Seguro) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-7 rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              isDragOver
                ? 'bg-blue-50 text-blue-900 scale-[1.01]'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void handleProcessPdfFile(e.target.files[0]);
                }
              }}
            />

            <div className="w-14 h-14 rounded-2xl bg-white shadow-xs text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[30px]">
                {isUploading ? 'sync' : 'upload_file'}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-sm sm:text-base font-bold text-slate-900">
                {isUploading
                  ? 'Processando e salvando PDF...'
                  : 'Arraste o arquivo PDF da ficha aqui'}
              </p>
              <p className="text-xs text-slate-500 font-normal">
                ou clique para selecionar o arquivo no seu computador (.pdf até 30 MB)
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-slate-800 text-xs font-semibold shadow-2xs">
              <span className="material-symbols-outlined text-[16px] text-blue-600">touch_app</span>
              <span>Escolher Arquivo PDF</span>
            </span>
          </div>

          {/* Atalho para Arraste em Lote (Admin) */}
          {onOpenAdminPdfsModal && (
            <div className="p-4 rounded-2xl bg-slate-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  Tem muitos PDFs para subir de uma vez?
                </p>
                <p className="text-xs text-slate-500 truncate">
                  Use o Arraste em Lote para vincular a escola inteira por RA ou nome.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminPdfsModal();
                }}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs whitespace-nowrap cursor-pointer transition-colors shrink-0"
              >
                Arraste em Lote
              </button>
            </div>
          )}

          {/* Notificação à família no WhatsApp */}
          {whatsappRequestFichaLinks.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-50 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Ficha ainda não foi entregue pela família?
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

          {statusFeedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-semibold ${
                statusFeedback.startsWith('✓')
                  ? 'bg-emerald-50 text-emerald-900'
                  : 'bg-rose-50 text-rose-900'
              }`}
            >
              {statusFeedback}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            {hasPdf && showReplaceView && (
              <button
                type="button"
                onClick={() => setShowReplaceView(false)}
                className="h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer transition-colors"
              >
                Voltar à Visualização
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // CASO 2: COM PDF VINCULADO -> Exibe o PDF diretamente em tela limpa sem contornos
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
        <div className="bg-white px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-100">
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
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase bg-emerald-50 text-emerald-800">
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

            <button
              type="button"
              onClick={() => setShowReplaceView(true)}
              className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors"
              title="Substituir PDF por outro arquivo"
            >
              <span className="material-symbols-outlined text-[17px] text-blue-600">swap_horiz</span>
              <span className="hidden sm:inline">Substituir</span>
            </button>

            <button
              type="button"
              onClick={handleRemovePdf}
              className="h-10 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors"
              title="Remover Ficha PDF vinculada"
            >
              <span className="material-symbols-outlined text-[17px]">delete</span>
              <span className="hidden sm:inline">Remover</span>
            </button>

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
          <div className="pt-2 px-1 flex items-center justify-between text-xs text-slate-500 font-medium">
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
