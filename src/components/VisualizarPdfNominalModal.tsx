import React, { useEffect, useState, useMemo } from 'react';
import { ClassGroup, DriveNominalPdfFile, Student } from '../types';
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
    subfolder: string,
    isManualLink?: boolean
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
  onSyncDrivePdfs,
}) => {
  const [isCheckingDrive, setIsCheckingDrive] = useState(false);
  const [showManualLinker, setShowManualLinker] = useState(false);
  const [pdfSearchQuery, setPdfSearchQuery] = useState('');
  const [directUrlInput, setDirectUrlInput] = useState('');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [catalogTick, setCatalogTick] = useState(0);

  const discoveredPdfs = useMemo(() => {
    void catalogTick;
    return getStoredDiscoveredNominalPdfs();
  }, [catalogTick, isOpen]);

  const filteredPdfs = useMemo(() => {
    const q = pdfSearchQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();

    if (!q && student) {
      const tokens = normalizeStudentNameForPhoto(student.name)
        .split(' ')
        .filter((t) => t.length >= 3);
      const firstToken = tokens[0] || '';
      return [...discoveredPdfs]
        .sort((a, b) => {
          const aHasFirst = firstToken && a.normalizedStudentName.includes(firstToken) ? 1 : 0;
          const bHasFirst = firstToken && b.normalizedStudentName.includes(firstToken) ? 1 : 0;
          if (aHasFirst !== bHasFirst) return bHasFirst - aHasFirst;
          return a.name.localeCompare(b.name, 'pt-BR');
        })
        .slice(0, 60);
    }

    return discoveredPdfs
      .filter((p) => {
        const cleanName = p.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        const cleanSub = (p.subfolderName || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        return (
          cleanName.includes(q) ||
          p.normalizedStudentName.includes(q) ||
          cleanSub.includes(q) ||
          p.id.toUpperCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [discoveredPdfs, pdfSearchQuery, student]);

  // Sincronização silenciosa se o PDF já tiver sido descoberto em cache (apenas correspondência exata não ambígua)
  useEffect(() => {
    if (!isOpen || !student) return;
    setShowManualLinker(false);
    setStatusFeedback(null);

    const cachedPdfs = getStoredDiscoveredNominalPdfs();

    if (
      !student.fichaPdfManualLink &&
      !student.fichaPdfDriveId &&
      !student.fichaPdfDriveUrl &&
      cachedPdfs.length > 0
    ) {
      const normStudent = normalizeStudentNameForPhoto(student.name);
      const exactMatches = cachedPdfs.filter(
        (p) => p.normalizedStudentName === normStudent
      );
      if (exactMatches.length === 1 && onSaveStudentPdfLink) {
        onSaveStudentPdfLink(
          student.id,
          exactMatches[0].id,
          exactMatches[0].webViewLink,
          exactMatches[0].subfolderName,
          false
        );
        return;
      }
    }

    if (!student.fichaPdfDriveId && !student.fichaPdfDriveUrl && onSyncDrivePdfs) {
      setIsCheckingDrive(true);
      onSyncDrivePdfs()
        .then(() => setCatalogTick((t) => t + 1))
        .catch(() => {})
        .finally(() => setIsCheckingDrive(false));
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

  const handleConfirmManualPdf = (pdfItem: DriveNominalPdfFile) => {
    if (!onSaveStudentPdfLink) return;
    onSaveStudentPdfLink(
      student.id,
      pdfItem.id,
      pdfItem.webViewLink || `https://drive.google.com/file/d/${pdfItem.id}/view`,
      pdfItem.subfolderName || className,
      true
    );
    setShowManualLinker(false);
    setStatusFeedback(`✓ PDF "${pdfItem.name}" vinculado manualmente com sucesso!`);
  };

  const handleBindDirectPdfUrl = () => {
    const extractedId = extractDriveFileOrFolderId(directUrlInput);
    if (!extractedId || extractedId.length < 10 || !onSaveStudentPdfLink) {
      setStatusFeedback('Informe um link ou ID válido de arquivo PDF do Google Drive.');
      return;
    }
    const webUrl = `https://drive.google.com/file/d/${extractedId}/view`;
    onSaveStudentPdfLink(student.id, extractedId, webUrl, className, true);
    setDirectUrlInput('');
    setShowManualLinker(false);
    setStatusFeedback('✓ Link direto de Ficha PDF vinculado manualmente ao estudante!');
  };

  const handleUnlinkPdf = () => {
    if (!onSaveStudentPdfLink) return;
    onSaveStudentPdfLink(student.id, '', '', '', false);
    setShowManualLinker(true);
    setStatusFeedback('Vínculo de PDF removido. Selecione outro arquivo abaixo se desejar.');
  };

  const handleRefreshDrivePdfs = async () => {
    if (!onSyncDrivePdfs || isCheckingDrive) return;
    setIsCheckingDrive(true);
    try {
      await onSyncDrivePdfs();
      setCatalogTick((t) => t + 1);
      setStatusFeedback('✓ Catálogo de Fichas PDF do Google Drive atualizado.');
    } catch {
      setStatusFeedback('Não foi possível consultar o Drive agora. Verifique a conexão Google.');
    } finally {
      setIsCheckingDrive(false);
    }
  };

  // CASO 1: ESTUDANTE SEM FICHA ESCANEADA OU MODO DE VÍNCULO MANUAL ABERTO
  if (!embedUrl || showManualLinker) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-gentle-fade"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[#fff2f2] text-[#ff3b30] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
              </div>
              <div className="min-w-0">
                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#ff3b30] block">
                  {embedUrl ? 'Alterar Vínculo de Ficha PDF' : 'Ficha Informativa Pendente'} • {className}
                </span>
                <h3 className="text-[1.08rem] sm:text-[1.18rem] font-bold text-[#1d1d1f] truncate">
                  {student.name}
                </h3>
                <p className="text-[0.74rem] text-[#6e6e73]">
                  Nº {student.number.toString().padStart(2, '0')} • RA {student.ra || '—'}-{student.digRa || ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {!showManualLinker && (
            <div className="p-4 rounded-2xl bg-[#fff8f7] border border-[#ff3b30]/20 space-y-2">
              <p className="text-[0.86rem] text-[#1d1d1f] font-medium leading-relaxed">
                {isCheckingDrive
                  ? 'Verificando na pasta da turma no Google Drive se o PDF foi enviado...'
                  : 'Este(a) estudante ainda está sem Ficha Informativa vinculada automaticamente. Caso o arquivo no Google Drive esteja com nome abreviado ou grafia diferente, vincule manualmente abaixo em 1 clique ou solicite à família no WhatsApp.'}
              </p>

              {whatsappRequestFichaLinks.length > 0 && (
                <div className="pt-1 flex flex-wrap gap-2">
                  {whatsappRequestFichaLinks.map((ph, idx) => (
                    <a
                      key={idx}
                      href={ph.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#25D366]/14 hover:bg-[#25D366] text-[#128C7E] hover:text-white font-semibold text-[0.78rem] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>Pedir à família no WhatsApp ({ph.display})</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ferramenta de Vínculo Manual de PDF do Google Drive */}
          <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-black/[0.06] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-[0.86rem] font-extrabold text-[#1d1d1f] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-[#0071e3]">
                    add_link
                  </span>
                  <span>Localizar e Vincular PDF da Pasta do Google Drive ({discoveredPdfs.length} arquivos)</span>
                </h4>
                <p className="text-[0.72rem] text-[#6e6e73]">
                  Ideal para alunos recém-transferidos, nomes abreviados ou com diferença de grafia. O vínculo é salvo pelo ID estável do arquivo.
                </p>
              </div>

              {onSyncDrivePdfs && (
                <button
                  type="button"
                  onClick={handleRefreshDrivePdfs}
                  disabled={isCheckingDrive}
                  className="h-8 px-3 rounded-xl bg-white hover:bg-[#e8e8ed] text-[#1d1d1f] border border-black/[0.08] font-bold text-[0.72rem] flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span
                    className={`material-symbols-outlined text-[15px] text-[#0071e3] ${
                      isCheckingDrive ? 'animate-spin' : ''
                    }`}
                  >
                    sync
                  </span>
                  <span>Recarregar Drive</span>
                </button>
              )}
            </div>

            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={pdfSearchQuery}
                onChange={(e) => setPdfSearchQuery(e.target.value)}
                placeholder="Pesquisar PDF por nome, parte do nome, subpasta da turma ou ID..."
                className="w-full h-10 pl-9 pr-8 bg-white border border-black/[0.08] rounded-xl text-[0.8rem] font-medium text-[#1d1d1f] focus:border-[#0071e3] focus:outline-none"
              />
              {pdfSearchQuery && (
                <button
                  type="button"
                  onClick={() => setPdfSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              )}
            </div>

            {filteredPdfs.length === 0 ? (
              <div className="p-4 text-center bg-white rounded-xl border border-black/[0.05] text-[0.76rem] text-[#6e6e73]">
                Nenhum PDF encontrado na lista com esse termo. Cole o link direto abaixo ou clique em "Recarregar Drive".
              </div>
            ) : (
              <div className="max-h-[210px] overflow-y-auto space-y-1.5 pr-1">
                {filteredPdfs.map((pdf) => {
                  const isCurrent = student.fichaPdfDriveId === pdf.id;
                  return (
                    <div
                      key={pdf.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                        isCurrent
                          ? 'bg-[#0071e3]/10 border-[#0071e3]'
                          : 'bg-white hover:bg-[#f8fafc] border-black/[0.06]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.78rem] font-bold text-[#1d1d1f] truncate">
                          {pdf.name}
                        </p>
                        <p className="text-[0.68rem] text-[#6e6e73] truncate">
                          Pasta: <strong>{pdf.subfolderName || 'Fichas Informativas'}</strong> • ID: {pdf.id.slice(0, 8)}...
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={pdf.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[0.7rem] font-semibold"
                          title="Pré-visualizar PDF em nova guia"
                        >
                          Ver
                        </a>
                        <button
                          type="button"
                          onClick={() => handleConfirmManualPdf(pdf)}
                          className="px-3 py-1 rounded-lg bg-[#0071e3] hover:bg-[#005bb5] text-white text-[0.72rem] font-bold cursor-pointer"
                        >
                          {isCurrent ? 'Vinculado' : 'Vincular'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Colar Link ou ID Direto do PDF */}
            <div className="pt-2 border-t border-black/[0.06] flex items-center gap-2">
              <input
                type="text"
                value={directUrlInput}
                onChange={(e) => setDirectUrlInput(e.target.value)}
                placeholder="Ou cole o link / ID direto do PDF no Google Drive..."
                className="flex-1 h-9 px-3 bg-white border border-black/[0.08] rounded-xl text-[0.75rem] font-mono text-[#1d1d1f] focus:border-[#0071e3] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleBindDirectPdfUrl}
                className="h-9 px-3.5 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-bold text-[0.74rem] cursor-pointer shrink-0"
              >
                Vincular Link/ID
              </button>
            </div>
          </div>

          {statusFeedback && (
            <div className="p-3 rounded-xl bg-[#eaf6ef] text-[#005035] text-[0.78rem] font-bold border border-[#005035]/20">
              {statusFeedback}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {embedUrl && showManualLinker && (
              <button
                type="button"
                onClick={() => setShowManualLinker(false)}
                className="min-h-[42px] px-4 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-bold text-[0.82rem] cursor-pointer"
              >
                Voltar para o PDF
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-5 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-bold text-[0.84rem] cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // CASO 2: ESTUDANTE COM FICHA ESCANEADA -> Exibe o PDF com cabeçalho simétrico e opções de trocar/desvincular
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/65 backdrop-blur-sm animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
      >
        {/* CABEÇALHO SIMÉTRICO: Dados da Criança + Tipo de Vínculo + Ações de Correção/Fechar */}
        <div className="bg-white px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-black/[0.06]">
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
                <span
                  className={`px-2 py-0.5 rounded-full text-[0.64rem] font-bold uppercase ${
                    student.fichaPdfManualLink
                      ? 'bg-[#0071e3]/12 text-[#0066cc]'
                      : 'bg-[#eaf6ef] text-[#005035]'
                  }`}
                >
                  {student.fichaPdfManualLink ? 'Vínculo Manual (ID Fixo)' : 'Vínculo Automático'}
                </span>
                {student.fichaPdfSubfolder && (
                  <span className="text-[0.7rem] text-[#86868b] truncate hidden md:inline">
                    • Pasta: {student.fichaPdfSubfolder}
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25D366]/12 hover:bg-[#25D366] text-[#128C7E] hover:text-white font-mono font-semibold text-[0.74rem] transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">chat</span>
                      <span>WhatsApp: {ph.display}</span>
                    </a>
                  ))
                ) : (
                  <span className="text-[0.72rem] text-[#86868b]">
                    Sem telefone cadastrado
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controles de Troca/Remoção de Vínculo e Botão Fechar */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowManualLinker(true)}
              className="min-h-[38px] px-3 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-[0.76rem] flex items-center gap-1 cursor-pointer transition-colors"
              title="Trocar ou corrigir o arquivo PDF vinculado a este estudante"
            >
              <span className="material-symbols-outlined text-[16px] text-[#0071e3]">swap_horiz</span>
              <span className="hidden sm:inline">Trocar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleUnlinkPdf}
              className="min-h-[38px] px-3 rounded-full bg-[#fff2f2] hover:bg-[#ffe5e5] text-[#ff3b30] font-semibold text-[0.76rem] flex items-center gap-1 cursor-pointer transition-colors"
              title="Desvincular este PDF do estudante"
            >
              <span className="material-symbols-outlined text-[16px]">link_off</span>
              <span className="hidden sm:inline">Desvincular</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar visualização da ficha escaneada"
              className="min-h-[40px] px-4 rounded-full bg-[#1d1d1f] hover:bg-[#ff3b30] text-white font-semibold text-[0.82rem] flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[19px]">close</span>
              <span>Fechar</span>
            </button>
          </div>
        </div>

        {/* ÁREA PRINCIPAL: Visualização Direta e Limpa do PDF Escaneado */}
        <div className="flex-1 overflow-y-auto bg-[#f5f5f7] p-2 sm:p-3 flex flex-col items-center justify-center">
          <div className="w-full h-[78vh] bg-white rounded-2xl overflow-hidden flex flex-col">
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
