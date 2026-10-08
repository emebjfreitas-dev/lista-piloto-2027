import React, { useState, useEffect, useMemo } from 'react';
import { ClassGroup, Student, DriveNominalPdfFile } from '../types';
import {
  OFFICIAL_FICHAS_PDF_FOLDER_NAME,
  getSavedFichasPdfDriveFolderInfo,
  saveFichasPdfDriveFolderUrl,
  extractDriveFileOrFolderId,
  syncNominalPdfsFromDriveSubfolders,
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

export const VisualizarPdfNominalModal: React.FC<VisualizarPdfNominalModalProps> = ({
  isOpen,
  onClose,
  student,
  className,
  allClasses = [],
  onUpdateAllClasses,
  onSaveStudentPdfLink,
  onSyncDrivePdfs,
  onSaveStudentDirectPdfUrl,
}) => {
  const savedFolder = getSavedFichasPdfDriveFolderInfo();
  const [folderUrlInput, setFolderUrlInput] = useState(savedFolder.folderUrl || '');
  const [directFileUrlInput, setDirectFileUrlInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showFolderConfig, setShowFolderConfig] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [discoveredPdfs, setDiscoveredPdfs] = useState<DriveNominalPdfFile[]>(() =>
    getStoredDiscoveredNominalPdfs()
  );

  // Auto-match or auto-sync in background when opened if student has no PDF link yet
  useEffect(() => {
    if (!isOpen || !student) return;
    setSyncMessage(null);
    const currentFolder = getSavedFichasPdfDriveFolderInfo();
    setFolderUrlInput(currentFolder.folderUrl || '');
    const cachedPdfs = getStoredDiscoveredNominalPdfs();
    setDiscoveredPdfs(cachedPdfs);

    // Instant match from cached discovered PDFs if student does not have a link yet
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

  // Suggestions of discovered PDFs in Drive that match the student or class
  const suggestedDrivePdfs = useMemo(() => {
    if (!student || discoveredPdfs.length === 0) return [];
    const normStudent = normalizeStudentNameForPhoto(student.name);
    const firstWord = normStudent.split(' ')[0] || '';
    return discoveredPdfs
      .filter(
        (p) =>
          p.normalizedStudentName.includes(firstWord) ||
          p.subfolderName.toUpperCase().includes(className.toUpperCase())
      )
      .slice(0, 6);
  }, [student, className, discoveredPdfs]);

  if (!isOpen || !student) return null;

  const cleanFileName = `${student.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()}.pdf`;

  const driveFileId =
    student.fichaPdfDriveId ||
    (student.fichaPdfDriveUrl ? extractDriveFileOrFolderId(student.fichaPdfDriveUrl) : '');

  const embedUrl = driveFileId
    ? `https://drive.google.com/file/d/${driveFileId}/preview`
    : '';

  const externalViewUrl =
    student.fichaPdfDriveUrl ||
    (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : '') ||
    savedFolder.folderUrl ||
    'https://drive.google.com';

  const applyDirectLinkValue = (rawLink: string) => {
    const trimmed = rawLink.trim();
    if (!trimmed) return;
    const extractedId = extractDriveFileOrFolderId(trimmed);
    const fullViewUrl = trimmed.startsWith('http')
      ? trimmed
      : `https://drive.google.com/file/d/${extractedId}/view`;

    if (onSaveStudentPdfLink) {
      onSaveStudentPdfLink(
        student.id,
        extractedId,
        fullViewUrl,
        student.fichaPdfSubfolder || className
      );
    } else if (onSaveStudentDirectPdfUrl) {
      onSaveStudentDirectPdfUrl(student.id, fullViewUrl);
    }
    setDirectFileUrlInput('');
    setShowFolderConfig(false);
    setSyncMessage('Link do PDF escaneado vinculado instantaneamente!');
  };

  const handleSaveDirectLink = () => {
    applyDirectLinkValue(directFileUrlInput);
  };

  const handleSaveAndSyncSubfolders = async (overrideFolderUrl?: string) => {
    const targetFolderInput = (overrideFolderUrl ?? folderUrlInput).trim();
    if (targetFolderInput) {
      saveFichasPdfDriveFolderUrl(targetFolderInput);
    }
    setIsSyncing(true);
    setSyncMessage('Sincronizando pastas e subpastas do Google Drive...');
    try {
      if (allClasses.length > 0 && onUpdateAllClasses) {
        const folderId = targetFolderInput
          ? extractDriveFileOrFolderId(targetFolderInput)
          : undefined;
        const pdfResult = await syncNominalPdfsFromDriveSubfolders(allClasses, folderId);
        onUpdateAllClasses(pdfResult.updatedClasses);
        setDiscoveredPdfs(pdfResult.discoveredPdfs);
        setSyncMessage(
          `Sincronizado! ${pdfResult.totalPdfFilesFound} PDFs lidos em ${pdfResult.subfoldersScannedCount} subpastas (${pdfResult.matchedPdfsCount} vinculados automaticamente).`
        );
      } else if (onSyncDrivePdfs) {
        await onSyncDrivePdfs();
        setSyncMessage('Pastas e subpastas sincronizadas com sucesso!');
      } else {
        setSyncMessage('Link da pasta salvo e sincronizado!');
      }
    } catch {
      setSyncMessage('Link da pasta salvo localmente.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-black/10 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Top Action Bar — Somente Ficha Informativa Escaneada em PDF do Google Drive */}
        <div className="bg-[#0b3b49] text-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <StudentAvatar
              student={student}
              size="md"
              className="ring-2 ring-[#a4f3ca]/60 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-[#006644] text-[#a4f3ca] text-[0.68rem] font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a4f3ca] animate-pulse"></span>
                  <span>PDF Escaneado • Sincronização Instantânea</span>
                </span>
                <span className="text-[0.76rem] text-white/80 font-mono truncate">
                  {OFFICIAL_FICHAS_PDF_FOLDER_NAME} / {student.fichaPdfSubfolder || className} / {cleanFileName}
                </span>
              </div>
              <h3 className="text-[1.05rem] sm:text-[1.15rem] font-extrabold text-white truncate mt-0.5">
                {student.name}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveAndSyncSubfolders()}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[0.76rem] font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Varredura automática nas subpastas do Google Drive pelo nome do estudante"
            >
              <span
                className={`material-symbols-outlined text-[17px] ${
                  isSyncing ? 'animate-spin' : ''
                }`}
              >
                sync
              </span>
              <span>{isSyncing ? 'Sincronizando...' : 'Auto-Vincular Drive'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFolderConfig((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[0.76rem] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[17px]">link</span>
              <span>Configurar Links</span>
            </button>

            <a
              href={externalViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-[#006644] hover:bg-[#005035] text-white text-[0.78rem] font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[17px]">open_in_new</span>
              <span>Abrir no Google Drive</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition-colors"
              aria-label="Fechar"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Notificação de sincronização instantânea */}
        {syncMessage && (
          <div className="bg-[#eaf6ef] border-b border-[#006644]/20 px-4 py-2 text-[0.78rem] font-extrabold text-[#005035] flex items-center justify-between gap-2 shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[17px]">bolt</span>
              <span>{syncMessage}</span>
            </span>
            <button
              type="button"
              onClick={() => setSyncMessage(null)}
              className="text-[#005035]/70 hover:text-[#005035] text-xs font-bold cursor-pointer"
            >
              OK
            </button>
          </div>
        )}

        {/* Configurador Instantâneo de Pasta / Link do PDF Escaneado no Google Drive */}
        {showFolderConfig && (
          <div className="bg-[#f8fafc] border-b border-black/10 p-4 space-y-3 shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-2xl border border-black/10 space-y-1.5">
                <label className="text-[0.75rem] font-extrabold text-[#0b3b49] block">
                  1. Link da Pasta &quot;{OFFICIAL_FICHAS_PDF_FOLDER_NAME}&quot; (Sincroniza Subpastas ao Colar):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderUrlInput}
                    onChange={(e) => setFolderUrlInput(e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (pasted && pasted.includes('drive.google.com')) {
                        setTimeout(() => handleSaveAndSyncSubfolders(pasted), 60);
                      }
                    }}
                    placeholder="Cole o link da pasta Fichas Informativas do Google Drive..."
                    className="flex-1 px-3 py-1.5 text-[0.8rem] bg-[#f1f5f9] rounded-xl border border-black/10 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveAndSyncSubfolders()}
                    disabled={isSyncing}
                    className="px-3 py-1.5 bg-[#0b3b49] hover:bg-[#164e63] text-white font-bold text-[0.76rem] rounded-xl cursor-pointer shrink-0"
                  >
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                </div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-black/10 space-y-1.5">
                <label className="text-[0.75rem] font-extrabold text-[#006644] block">
                  2. Link Direto do PDF de {student.name.split(' ')[0]} (Vincula Instantaneamente ao Colar):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directFileUrlInput}
                    onChange={(e) => setDirectFileUrlInput(e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (pasted && (pasted.includes('drive.google.com') || pasted.length > 15)) {
                        setTimeout(() => applyDirectLinkValue(pasted), 40);
                      }
                    }}
                    placeholder="Cole https://drive.google.com/file/d/.../view"
                    className="flex-1 px-3 py-1.5 text-[0.8rem] bg-[#f1f5f9] rounded-xl border border-black/10 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveDirectLink}
                    className="px-3 py-1.5 bg-[#006644] hover:bg-[#005035] text-white font-bold text-[0.76rem] rounded-xl cursor-pointer shrink-0"
                  >
                    Vincular PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Área Principal: Apenas o PDF Escaneado do Google Drive */}
        <div className="flex-1 overflow-y-auto bg-[#e2e8f0] p-3 sm:p-5 flex flex-col items-center justify-center">
          {embedUrl ? (
            <div className="w-full h-[76vh] bg-white rounded-2xl overflow-hidden shadow-xl border border-black/10 flex flex-col">
              <div className="bg-[#f8fafc] px-4 py-2 border-b border-black/10 flex items-center justify-between text-[0.78rem]">
                <span className="font-bold text-[#0b3b49] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-[#006644]">
                    document_scanner
                  </span>
                  <span>
                    Documento Escaneado Vinculado: <strong>{cleanFileName}</strong>
                  </span>
                </span>
                <a
                  href={externalViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="doc-hyperlink font-extrabold text-[#006644] hover:underline flex items-center gap-1"
                >
                  <span>Abrir aba original no Google Drive</span>
                  <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                </a>
              </div>
              <iframe
                src={embedUrl}
                title={`Ficha Informativa Escaneada de ${student.name}`}
                className="w-full flex-1 border-0"
                allow="autoplay"
              />
            </div>
          ) : (
            <div className="bg-white max-w-xl w-full rounded-3xl p-6 sm:p-7 shadow-lg border border-black/5 text-center space-y-4">
              <div className="w-15 h-15 rounded-2xl bg-[#fff1f2] text-[#be123c] border border-[#e11d48]/25 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[32px]">notification_important</span>
              </div>
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded-full bg-[#ffe4e6] text-[#9f1239] text-[0.7rem] font-extrabold uppercase">
                  Alerta • Sem Ficha Escaneada Vinculada
                </span>
                <h4 className="text-[1.12rem] font-extrabold text-[#0f172a]">
                  {cleanFileName}
                </h4>
                <p className="text-[0.82rem] text-[#475569] leading-relaxed">
                  Cole o link do PDF abaixo (o vínculo é salvo automaticamente ao colar) ou clique em{' '}
                  <strong>Sincronizar Pastas do Drive</strong> para associar todas as fichas pelo nome.
                </p>
              </div>

              <div className="bg-[#f8fafc] p-3.5 rounded-2xl border border-black/8 text-left space-y-2">
                <label className="text-[0.75rem] font-extrabold text-[#0b3b49] flex items-center justify-between">
                  <span>Link do PDF escaneado no Google Drive:</span>
                  <span className="text-[0.68rem] text-[#006644] font-bold">
                    Auto-salva ao colar (Ctrl+V)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directFileUrlInput}
                    onChange={(e) => setDirectFileUrlInput(e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (pasted && (pasted.includes('drive.google.com') || pasted.length > 15)) {
                        setTimeout(() => applyDirectLinkValue(pasted), 40);
                      }
                    }}
                    placeholder="Cole aqui o link https://drive.google.com/file/d/.../view"
                    className="flex-1 px-3 py-2 text-[0.82rem] bg-white rounded-xl border border-black/15 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveDirectLink}
                    className="px-4 py-2 bg-[#006644] hover:bg-[#005035] text-white font-extrabold text-[0.8rem] rounded-xl cursor-pointer shrink-0"
                  >
                    Vincular
                  </button>
                </div>
              </div>

              {suggestedDrivePdfs.length > 0 && (
                <div className="bg-[#f0fdf4] p-3 rounded-2xl border border-[#006644]/20 text-left space-y-1.5">
                  <span className="text-[0.72rem] font-extrabold text-[#005035] uppercase tracking-wider block">
                    PDFs encontrados na pasta do Drive (Clique para vincular em 1 toque):
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {suggestedDrivePdfs.map((pdf) => (
                      <button
                        key={pdf.id}
                        type="button"
                        onClick={() => {
                          if (onSaveStudentPdfLink) {
                            onSaveStudentPdfLink(
                              student.id,
                              pdf.id,
                              pdf.webViewLink,
                              pdf.subfolderName
                            );
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#dcfce7] border border-[#006644]/15 flex items-center justify-between gap-2 text-[0.75rem] font-bold text-[#0b3b49] cursor-pointer transition-colors"
                      >
                        <span className="truncate">
                          {pdf.subfolderName} / <strong>{pdf.name}</strong>
                        </span>
                        <span className="text-[#006644] font-extrabold shrink-0">Vincular</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSaveAndSyncSubfolders()}
                  disabled={isSyncing}
                  className="px-4 py-2.5 rounded-2xl bg-[#006644] hover:bg-[#005035] text-white font-extrabold text-[0.8rem] flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isSyncing ? 'animate-spin' : ''
                    }`}
                  >
                    bolt
                  </span>
                  <span>
                    {isSyncing
                      ? 'Sincronizando Subpastas...'
                      : 'Sincronizar Pastas do Drive Agora'}
                  </span>
                </button>
                <a
                  href={externalViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-2xl bg-[#0b3b49] hover:bg-[#164e63] text-white font-extrabold text-[0.8rem] flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span>Abrir Pasta no Google Drive</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
