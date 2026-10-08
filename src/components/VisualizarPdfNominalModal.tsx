import React, { useState } from 'react';
import { Student } from '../types';
import {
  OFFICIAL_FICHAS_PDF_FOLDER_NAME,
  getSavedFichasPdfDriveFolderInfo,
  saveFichasPdfDriveFolderUrl,
  extractDriveFileOrFolderId,
} from '../services/googleSheetsApi';
import { StudentAvatar } from './StudentAvatar';

interface VisualizarPdfNominalModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  onSyncDrivePdfs?: () => Promise<void>;
  onSaveStudentDirectPdfUrl?: (studentId: string, driveUrl: string) => void;
}

export const VisualizarPdfNominalModal: React.FC<VisualizarPdfNominalModalProps> = ({
  isOpen,
  onClose,
  student,
  className,
  onSyncDrivePdfs,
  onSaveStudentDirectPdfUrl,
}) => {
  const savedFolder = getSavedFichasPdfDriveFolderInfo();
  const [folderUrlInput, setFolderUrlInput] = useState(savedFolder.folderUrl || '');
  const [directFileUrlInput, setDirectFileUrlInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showFolderConfig, setShowFolderConfig] = useState(false);

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

  const handleSaveDirectLink = () => {
    if (!directFileUrlInput.trim()) return;
    if (onSaveStudentDirectPdfUrl) {
      onSaveStudentDirectPdfUrl(student.id, directFileUrlInput.trim());
    }
    setDirectFileUrlInput('');
    setShowFolderConfig(false);
  };

  const handleSaveAndSyncSubfolders = async () => {
    if (folderUrlInput.trim()) {
      saveFichasPdfDriveFolderUrl(folderUrlInput.trim());
    }
    if (onSyncDrivePdfs) {
      setIsSyncing(true);
      try {
        await onSyncDrivePdfs();
      } finally {
        setIsSyncing(false);
      }
    }
    setShowFolderConfig(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
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
                <span className="px-2 py-0.5 rounded-md bg-[#006644] text-[#a4f3ca] text-[0.68rem] font-extrabold uppercase tracking-wider">
                  PDF Escaneado • Google Drive
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
              onClick={() => setShowFolderConfig((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[0.76rem] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[17px]">folder_Special</span>
              <span>Vincular Link do Drive</span>
            </button>

            <a
              href={externalViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-[#006644] hover:bg-[#005035] text-white text-[0.78rem] font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[17px]">open_in_new</span>
              <span>Abrir Ficha Escaneada no Google Drive</span>
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

        {/* Configurador de Pasta / Link do PDF Escaneado no Google Drive */}
        {showFolderConfig && (
          <div className="bg-[#f8fafc] border-b border-black/10 p-4 space-y-3 shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-2xl border border-black/10 space-y-1.5">
                <label className="text-[0.75rem] font-extrabold text-[#0b3b49] block">
                  1. Link da Pasta &quot;{OFFICIAL_FICHAS_PDF_FOLDER_NAME}&quot; no Google Drive (Sincroniza Subpastas):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderUrlInput}
                    onChange={(e) => setFolderUrlInput(e.target.value)}
                    placeholder="Cole o link da pasta Fichas Informativas do Google Drive..."
                    className="flex-1 px-3 py-1.5 text-[0.8rem] bg-[#f1f5f9] rounded-xl border border-black/10 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAndSyncSubfolders}
                    disabled={isSyncing}
                    className="px-3 py-1.5 bg-[#0b3b49] hover:bg-[#164e63] text-white font-bold text-[0.76rem] rounded-xl cursor-pointer shrink-0"
                  >
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Drive'}
                  </button>
                </div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-black/10 space-y-1.5">
                <label className="text-[0.75rem] font-extrabold text-[#006644] block">
                  2. Ou cole o link direto do PDF escaneado de {student.name.split(' ')[0]} no Drive:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directFileUrlInput}
                    onChange={(e) => setDirectFileUrlInput(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view"
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

        {/* Área Principal: Apenas o PDF Escaneado do Google Drive (Sem geração de ficha sintética com dados) */}
        <div className="flex-1 overflow-y-auto bg-[#e2e8f0] p-3 sm:p-5 flex flex-col items-center justify-center">
          {embedUrl ? (
            <div className="w-full h-[76vh] bg-white rounded-2xl overflow-hidden shadow-xl border border-black/10 flex flex-col">
              <div className="bg-[#f8fafc] px-4 py-2 border-b border-black/10 flex items-center justify-between text-[0.78rem]">
                <span className="font-bold text-[#0b3b49] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-[#006644]">
                    document_scanner
                  </span>
                  <span>
                    Documento Escaneado no Google Drive: <strong>{cleanFileName}</strong>
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
            <div className="bg-white max-w-xl w-full rounded-3xl p-6 sm:p-8 shadow-lg border border-black/5 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#0b3b49]/10 text-[#0b3b49] flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[34px]">document_scanner</span>
              </div>
              <div className="space-y-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-[#eaf6ef] text-[#006644] text-[0.72rem] font-extrabold uppercase">
                  Ficha Informativa Escaneada (PDF do Drive)
                </span>
                <h4 className="text-[1.15rem] font-extrabold text-[#0f172a]">
                  {cleanFileName}
                </h4>
                <p className="text-[0.84rem] text-[#475569] leading-relaxed">
                  Este atalho exibe exclusivamente a <strong>ficha informativa física escaneada em PDF</strong> armazenada na pasta{' '}
                  <strong>{OFFICIAL_FICHAS_PDF_FOLDER_NAME} / {className}</strong> do Google Drive da escola.
                </p>
              </div>

              <div className="bg-[#f8fafc] p-4 rounded-2xl border border-black/5 text-left space-y-2">
                <label className="text-[0.76rem] font-extrabold text-[#0b3b49] block">
                  Vincular link do PDF escaneado no Google Drive para {student.name}:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directFileUrlInput}
                    onChange={(e) => setDirectFileUrlInput(e.target.value)}
                    placeholder="Cole aqui o link https://drive.google.com/file/d/.../view"
                    className="flex-1 px-3 py-2 text-[0.82rem] bg-white rounded-xl border border-black/15 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveDirectLink}
                    className="px-4 py-2 bg-[#006644] hover:bg-[#005035] text-white font-extrabold text-[0.8rem] rounded-xl cursor-pointer shrink-0"
                  >
                    Salvar Link
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={externalViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-2xl bg-[#0b3b49] hover:bg-[#164e63] text-white font-extrabold text-[0.82rem] flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span>Abrir Pasta Fichas Informativas no Google Drive</span>
                </a>
                {onSyncDrivePdfs && (
                  <button
                    type="button"
                    onClick={handleSaveAndSyncSubfolders}
                    disabled={isSyncing}
                    className="px-4 py-2.5 rounded-2xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0b3b49] font-extrabold text-[0.82rem] flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">sync</span>
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar PDFs do Drive'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
