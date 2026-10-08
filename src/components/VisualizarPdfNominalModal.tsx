import React, { useEffect } from 'react';
import { ClassGroup, Student } from '../types';
import {
  extractDriveFileOrFolderId,
  getStoredDiscoveredNominalPdfs,
  normalizeStudentNameForPhoto,
} from '../services/googleSheetsApi';
import { StudentAvatar } from './StudentAvatar';

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
    subfolder: string
  ) => void;
  onSyncDrivePdfs?: () => Promise<void>;
  onSaveStudentDirectPdfUrl?: (studentId: string, driveUrl: string) => void;
}

/**
 * Extrai todos os números de telefone válidos de uma string (ex: "(11) 99876-5432 / 11 91234-5678")
 * e gera o link direto para abrir conversa no WhatsApp (https://wa.me/55...).
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
  onSaveStudentPdfLink,
}) => {
  // Sincronização silenciosa se o PDF já tiver sido descoberto em cache
  useEffect(() => {
    if (!isOpen || !student) return;
    const cachedPdfs = getStoredDiscoveredNominalPdfs();

    if (!student.fichaPdfDriveId && !student.fichaPdfDriveUrl && cachedPdfs.length > 0) {
      const normStudent = normalizeStudentNameForPhoto(student.name);
      const exactOrPrefix = cachedPdfs.find(
        (p) =>
          p.normalizedStudentName === normStudent ||
          (normStudent.length >= 6 &&
            (p.normalizedStudentName.startsWith(normStudent) ||
              normStudent.startsWith(p.normalizedStudentName)))
      );
      if (exactOrPrefix && onSaveStudentPdfLink) {
        onSaveStudentPdfLink(
          student.id,
          exactOrPrefix.id,
          exactOrPrefix.webViewLink,
          exactOrPrefix.subfolderName
        );
      }
    }
  }, [isOpen, student?.id]);

  // Fecha também com a tecla ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !student) return null;

  const driveFileId =
    student.fichaPdfDriveId ||
    (student.fichaPdfDriveUrl ? extractDriveFileOrFolderId(student.fichaPdfDriveUrl) : '');

  const embedUrl = driveFileId
    ? `https://drive.google.com/file/d/${driveFileId}/preview`
    : '';

  const rawPhoneText = student.telefones || student.guardianPhone || '';
  const whatsappLinks = buildWhatsAppLinksFromPhoneString(rawPhoneText, student.name);
  const whatsappRequestFichaLinks = buildWhatsAppLinksFromPhoneString(
    rawPhoneText,
    student.name,
    `Olá, família de ${student.name}! Por gentileza, pedimos que preencham e entreguem a Ficha Informativa atualizada da criança na EMEB Prof. Joaquim Candelário de Freitas. Muito obrigado(a)!`
  );

  // CASO 1: ESTUDANTE SEM FICHA ESCANEADA -> Exibe apenas notificação simples pedindo para o(a) professor(a) solicitar à família o preenchimento
  if (!embedUrl) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-gentle-fade"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 text-center space-y-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#fff2f2] text-[#ff3b30] flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[30px]">notification_important</span>
          </div>

          <div className="space-y-1.5">
            <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#ff3b30] block">
              Aviso de Ficha Pendente • {className}
            </span>
            <h3 className="text-[1.12rem] font-bold text-[#1d1d1f] leading-snug">
              {student.name}
            </h3>
            <p className="text-[0.9rem] text-[#1d1d1f] font-medium leading-relaxed pt-1">
              Professor(a), este(a) estudante ainda está <strong>sem Ficha Informativa</strong>. Por favor, <strong>peça para a família preencher</strong> e devolver a ficha na escola.
            </p>
          </div>

          {/* Se houver telefone, exibe atalho direto opcional para chamar a família no WhatsApp */}
          {whatsappRequestFichaLinks.length > 0 && (
            <div className="pt-1 flex flex-col items-center gap-2">
              {whatsappRequestFichaLinks.map((ph, idx) => (
                <a
                  key={idx}
                  href={ph.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-[#25D366]/14 hover:bg-[#25D366] text-[#128C7E] hover:text-white font-semibold text-[0.84rem] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  <span>Avisar família no WhatsApp ({ph.display})</span>
                </a>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[46px] rounded-full bg-[#1d1d1f] hover:bg-black text-white font-semibold text-[0.9rem] flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
          >
            <span>Entendi, fechar</span>
          </button>
        </div>
      </div>
    );
  }

  // CASO 2: ESTUDANTE COM FICHA ESCANEADA -> Exibe o PDF diretamente com cabeçalho minimalista
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/65 backdrop-blur-sm animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
      >
        {/* CABEÇALHO ULTRA-MINIMALISTA: Apenas Nome da Criança, Hyperlink de Telefone p/ WhatsApp e Botão Grande "Fechar" */}
        <div className="bg-white px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <StudentAvatar
              student={student}
              size="md"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[0.72rem] font-semibold text-[#6e6e73] uppercase tracking-wider">
                  {className} • Nº {student.number.toString().padStart(2, '0')}
                </span>
                {student.filiacao1 && (
                  <span className="text-[0.72rem] text-[#86868b] truncate hidden sm:inline">
                    • Mãe: {student.filiacao1}
                  </span>
                )}
              </div>

              <h3 className="text-[1rem] sm:text-[1.15rem] font-bold text-[#1d1d1f] truncate leading-tight">
                {student.name}
              </h3>

              {/* Hyperlink(s) Direto(s) de Telefone para abrir conversa no WhatsApp */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {whatsappLinks.length > 0 ? (
                  whatsappLinks.map((ph, idx) => (
                    <a
                      key={idx}
                      href={ph.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Conversar no WhatsApp: ${ph.display}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25D366]/12 hover:bg-[#25D366] text-[#128C7E] hover:text-white font-mono font-semibold text-[0.76rem] sm:text-[0.8rem] transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">chat</span>
                      <span>WhatsApp: {ph.display}</span>
                    </a>
                  ))
                ) : (
                  <span className="text-[0.74rem] text-[#86868b]">
                    Sem telefone cadastrado
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Botão de Fechar Grande, Nítido e Intuitivo para Qualquer Usuário */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualização da ficha escaneada"
            className="min-h-[42px] sm:min-h-[44px] px-4 sm:px-5 rounded-full bg-[#1d1d1f] hover:bg-[#ff3b30] text-white font-semibold text-[0.84rem] sm:text-[0.88rem] flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95 transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
            <span>Fechar</span>
          </button>
        </div>

        {/* ÁREA PRINCIPAL: Visualização Direta e Limpa do PDF Escaneado */}
        <div className="flex-1 overflow-y-auto bg-[#f5f5f7] p-2 sm:p-3 flex flex-col items-center justify-center">
          <div className="w-full h-[80vh] bg-white rounded-2xl overflow-hidden flex flex-col">
            <iframe
              src={embedUrl}
              title={`Ficha Informativa Escaneada de ${student.name}`}
              className="w-full flex-1 border-0"
              allow="autoplay"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
