import React, { useEffect, useState } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { getActiveUserAuthHeadersAsync } from '../services/db';

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
  const [resolvedBlobUrl, setResolvedBlobUrl] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<boolean>(false);

  const rawUrl = student?.fichaPdfDriveUrl || '';
  const rawId = student?.fichaPdfDriveId || '';
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

  const isProtectedApiPdf = embedUrl.startsWith('/api/pdfs/');

  useEffect(() => {
    setConfirmRemove(false);
  }, [isOpen, student?.id]);

  // Busca autenticada com Bearer Token para PDFs protegidos (garante renderização em iframes mesmo sem cookies 3P)
  useEffect(() => {
    if (!isOpen || !student || !isProtectedApiPdf) {
      setResolvedBlobUrl('');
      setPdfLoadError(null);
      setPdfLoading(false);
      return;
    }

    let cancelled = false;
    let createdObjectUrl = '';
    setPdfLoading(true);
    setPdfLoadError(null);

    const loadAuthenticatedPdf = async () => {
      try {
        const headers = await getActiveUserAuthHeadersAsync();
        const res = await fetch(embedUrl, {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(
            res.status === 401 || res.status === 403
              ? 'Sessão institucional necessária para visualizar este PDF.'
              : `Ficha PDF não disponível (HTTP ${res.status}).`
          );
        }
        const blob = await res.blob();
        if (cancelled) return;
        createdObjectUrl = URL.createObjectURL(blob);
        setResolvedBlobUrl(createdObjectUrl);
      } catch (err: any) {
        if (!cancelled) {
          setPdfLoadError(err?.message || 'Não foi possível carregar a Ficha Informativa.');
        }
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    };

    void loadAuthenticatedPdf();

    return () => {
      cancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [isOpen, student?.id, embedUrl, isProtectedApiPdf]);

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

  const displaySrc = isProtectedApiPdf ? resolvedBlobUrl : embedUrl;

  const rawPhoneText = student.telefones || student.guardianPhone || '';
  const whatsappRequestFichaLinks = buildWhatsAppLinksFromPhoneString(
    rawPhoneText,
    student.name,
    `Olá, família de ${student.name}! Por gentileza, pedimos que enviem a Ficha Informativa do Estudante atualizada para a secretaria da EMEB Prof. Joaquim Candelário de Freitas. Muito obrigado(a)!`
  );

  const handleRemovePdf = () => {
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
          fichaPdfSha256: '',
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

  if (!hasPdf) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/55 backdrop-blur-xs animate-gentle-fade"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white border border-slate-300 w-full max-w-lg rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[88dvh] overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 text-[#be123c] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-[#be123c] block">
                  Ficha Informativa do Estudante · Pendente · {className}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-950 break-words leading-snug">
                  {student.name}
                </h3>
                <p className="text-xs text-slate-600 font-medium break-words">
                  Nº {student.number.toString().padStart(2, '0')} · RA {student.ra || '—'}-{student.digRa || ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-950">
              <span className="material-symbols-outlined text-[20px] text-[#be123c]">folder_zip</span>
              <h4 className="text-sm font-bold">Nenhuma Ficha Informativa do Estudante vinculada</h4>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed font-normal">
              As Fichas Informativas dos Estudantes em PDF são vinculadas exclusivamente por meio do{' '}
              <strong className="font-bold text-slate-950">Arraste &amp; Solte em Lote</strong> (por RA, Nome Completo ou Turma + Nº de Chamada).
            </p>

            {userRole === 'admin' && onOpenAdminPdfsModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminPdfsModal();
                }}
                className="w-full h-11 px-4 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                <span>Abrir Arraste &amp; Solte de Fichas Informativas</span>
              </button>
            )}
          </div>

          {whatsappRequestFichaLinks.length > 0 && (
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
              <p className="text-xs font-bold text-slate-800">
                Solicitar Ficha Informativa do Estudante à família:
              </p>
              <div className="flex flex-wrap gap-2">
                {whatsappRequestFichaLinks.map((ph, idx) => (
                  <a
                    key={idx}
                    href={ph.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-normal text-center shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] shrink-0">chat</span>
                    <span className="break-words">Pedir no WhatsApp ({ph.display})</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 font-bold text-xs cursor-pointer transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/55 backdrop-blur-xs animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-300 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
      >
        {/* Cabeçalho */}
        <div className="bg-white px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <StudentAvatar student={student} size="md" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider font-mono tabular-nums">
                  {className} · Nº {student.number.toString().padStart(2, '0')}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-50 border border-emerald-200 text-[#047857]">
                  Ficha Informativa do Estudante
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-950 break-words leading-snug mt-0.5">
                {student.name}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {displaySrc && (
              <a
                href={displaySrc}
                download={`Ficha_${student.name.replace(/\s+/g, '_')}.pdf`}
                className="h-10 px-3.5 rounded-xl bg-[#0052cc] hover:bg-[#0b3b8c] text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Baixar Ficha Informativa em PDF"
              >
                <span className="material-symbols-outlined text-[17px]">download</span>
                <span>Baixar PDF</span>
              </a>
            )}

            {userRole === 'admin' && onOpenAdminPdfsModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminPdfsModal();
                }}
                className="h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Atualizar via Arraste & Solte em Lote"
              >
                <span className="material-symbols-outlined text-[17px] text-[#be123c]">upload_file</span>
                <span className="hidden sm:inline">Substituir em Lote</span>
              </button>
            )}

            {userRole === 'admin' &&
              (confirmRemove ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRemovePdf}
                    className="h-10 px-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs cursor-pointer"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="h-10 px-2.5 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="h-10 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-300 text-[#be123c] font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  title="Desvincular Ficha Informativa"
                >
                  <span className="material-symbols-outlined text-[17px]">delete</span>
                  <span className="hidden sm:inline">Desvincular</span>
                </button>
              ))}

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="h-10 px-4 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[17px]">close</span>
              <span>Fechar</span>
            </button>
          </div>
        </div>

        {/* Visualização Direta da Ficha Informativa do Estudante */}
        <div className="flex-1 overflow-hidden bg-slate-100 p-2 sm:p-3 flex flex-col">
          <div className="w-full h-[62vh] sm:h-[68vh] bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-xs items-center justify-center">
            {pdfLoading ? (
              <div className="flex flex-col items-center gap-3 text-slate-600 p-6">
                <div className="w-8 h-8 border-3 border-slate-300 border-t-[#0b3b8c] rounded-full animate-spin" />
                <span className="text-xs font-semibold">Carregando Ficha Informativa segura...</span>
              </div>
            ) : pdfLoadError ? (
              <div className="text-center p-6 space-y-2 max-w-md">
                <span className="material-symbols-outlined text-[36px] text-rose-600">error</span>
                <p className="text-sm font-bold text-slate-900">Não foi possível exibir o PDF</p>
                <p className="text-xs text-slate-600">{pdfLoadError}</p>
              </div>
            ) : displaySrc ? (
              <iframe
                src={displaySrc}
                title={`Ficha Informativa do Estudante — ${student.name}`}
                className="w-full flex-1 border-0"
                allow="autoplay"
              />
            ) : null}
          </div>
          <div className="pt-2 px-1 flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>Ficha Informativa do Estudante · SME Jundiaí</span>
            {displaySrc && (
              <a
                href={displaySrc}
                download={`Ficha_${student.name.replace(/\s+/g, '_')}.pdf`}
                className="text-[#0052cc] hover:text-[#0b3b8c] font-bold flex items-center gap-1"
              >
                <span>Download / Imprimir</span>
                <span className="material-symbols-outlined text-[14px]">download</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
