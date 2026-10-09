import React, { useState, useRef, useMemo } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  getAccessToken,
  uploadStudentPhotoToDrive,
  getStoredDiscoveredDrivePhotos,
  DiscoveredDrivePhotoFile,
  extractDriveFileOrFolderId,
  toEmbeddableDrivePhotoUrl,
} from '../services/googleSheetsApi';

interface UploadFotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  onSavePhoto: (
    studentId: string,
    newPhotoUrl: string,
    driveLink?: string,
    driveFileId?: string,
    isManualLink?: boolean
  ) => void;
  onSyncDrivePhotos?: () => Promise<void>;
}

export const UploadFotoModal: React.FC<UploadFotoModalProps> = ({
  isOpen,
  onClose,
  student,
  className,
  onSavePhoto,
  onSyncDrivePhotos,
}) => {
  if (!isOpen || !student) return null;

  const [activeTab, setActiveTab] = useState<'drive_catalog' | 'device_upload'>('drive_catalog');
  const [previewUrl, setPreviewUrl] = useState<string>(student.photo || '');
  const [selectedDriveFile, setSelectedDriveFile] = useState<DiscoveredDrivePhotoFile | null>(null);
  const [manualDriveUrlInput, setManualDriveUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [catalogTick, setCatalogTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const discoveredPhotos = useMemo(() => {
    void catalogTick;
    return getStoredDiscoveredDrivePhotos();
  }, [catalogTick, isOpen]);

  const filteredDrivePhotos = useMemo(() => {
    const q = searchQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();

    if (!q) {
      // Prioritize files matching the student's first name or class
      const firstToken = (student.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .split(' ')[0];
      return [...discoveredPhotos]
        .sort((a, b) => {
          const aMatch = firstToken && a.normName.includes(firstToken) ? 1 : 0;
          const bMatch = firstToken && b.normName.includes(firstToken) ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          return a.name.localeCompare(b.name, 'pt-BR');
        })
        .slice(0, 60);
    }

    return discoveredPhotos
      .filter((item) => {
        const cleanName = item.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        const cleanSub = (item.subfolderName || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        return (
          cleanName.includes(q) ||
          item.normName.includes(q) ||
          cleanSub.includes(q) ||
          item.id.toUpperCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [discoveredPhotos, searchQuery, student.name]);

  const compressImageFileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const rawDataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 360;
            let width = img.width;
            let height = img.height;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height >= width && height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.82));
              return;
            }
          } catch {
            // fallback to original dataUrl
          }
          resolve(rawDataUrl);
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusMsg('Carregando e otimizando foto do dispositivo...');

    const dataUrl = await compressImageFileToDataUrl(file);
    if (!dataUrl) {
      setIsProcessing(false);
      setStatusMsg('Não foi possível ler a imagem selecionada.');
      return;
    }

    setPreviewUrl(dataUrl);
    onSavePhoto(student.id, dataUrl, undefined, undefined, true);
    setStatusMsg('✓ Foto do dispositivo aplicada e vinculada manualmente ao estudante!');
    setUploadSuccess(true);

    try {
      const token = await getAccessToken();
      if (token) {
        const uploaded = await uploadStudentPhotoToDrive(
          student,
          className,
          dataUrl
        );
        onSavePhoto(student.id, dataUrl, uploaded.webViewLink, uploaded.fileId, true);
      }
    } catch {
      // Mantém a foto salva localmente e no servidor
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectDrivePhoto = (item: DiscoveredDrivePhotoFile) => {
    setSelectedDriveFile(item);
    setPreviewUrl(item.photoUrl);
    setStatusMsg(`Arquivo selecionado: "${item.name}" (ID: ${item.id.slice(0, 10)}...)`);
  };

  const handleApplyDirectDriveUrl = () => {
    const extractedId = extractDriveFileOrFolderId(manualDriveUrlInput);
    if (!extractedId || extractedId.length < 10) {
      setStatusMsg('Informe um link ou ID válido de imagem do Google Drive.');
      return;
    }
    const embedUrl = toEmbeddableDrivePhotoUrl(extractedId);
    const webLink = `https://drive.google.com/file/d/${extractedId}/view`;
    setSelectedDriveFile({
      id: extractedId,
      name: `Foto Vinculada Manualmente (${extractedId.slice(0, 8)})`,
      normName: student.name,
      coreName: student.name,
      subfolderName: className,
      photoUrl: embedUrl,
      driveLink: webLink,
    });
    setPreviewUrl(embedUrl);
    setStatusMsg(`✓ ID do Drive identificado (${extractedId.slice(0, 12)}...). Clique em Confirmar Vínculo.`);
  };

  const handleRemoveLink = () => {
    setPreviewUrl('');
    setSelectedDriveFile(null);
    onSavePhoto(student.id, '', '', '', false);
    setStatusMsg('Vínculo de foto removido. O sistema usará as iniciais ou futura correspondência.');
  };

  const handleRefreshCatalog = async () => {
    if (!onSyncDrivePhotos || isSyncingCatalog) return;
    setIsSyncingCatalog(true);
    setStatusMsg('Atualizando lista de fotos da pasta do Google Drive...');
    try {
      await onSyncDrivePhotos();
      setCatalogTick((t) => t + 1);
      setStatusMsg('✓ Lista de fotos do Google Drive atualizada.');
    } catch {
      setStatusMsg('Não foi possível atualizar a pasta agora. Verifique a conexão Drive.');
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const handleSave = () => {
    if (!previewUrl) return;
    if (selectedDriveFile) {
      onSavePhoto(
        student.id,
        selectedDriveFile.photoUrl,
        selectedDriveFile.driveLink,
        selectedDriveFile.id,
        true
      );
    } else {
      onSavePhoto(student.id, previewUrl, student.photoDriveUrl, student.photoDriveId, true);
    }
    setUploadSuccess(true);
    setTimeout(() => {
      setUploadSuccess(false);
      onClose();
    }, 500);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-black/[0.08] p-4 sm:p-6 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#eaf6ef] text-[#005035] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">photo_camera</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[1.05rem] sm:text-[1.15rem] font-extrabold text-[#1d1d1f] truncate">
                  Foto e Vínculo Google Drive
                </h3>
                {student.photoManualLink && (
                  <span className="px-2 py-0.5 rounded-full bg-[#0071e3]/12 text-[#0066cc] text-[0.65rem] font-bold uppercase shrink-0">
                    Vínculo Manual
                  </span>
                )}
              </div>
              <p className="text-[0.78rem] font-semibold text-[#6e6e73] truncate">
                Nº {student.number.toString().padStart(2, '0')} • {student.name} ({className})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Fechar"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Student Preview & Current Association Status */}
        <div className="flex items-center justify-between gap-3 p-3.5 mt-3 bg-[#f5f5f7] rounded-2xl border border-black/[0.05]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <StudentAvatar
                student={{ ...student, photo: previewUrl }}
                size="lg"
                className="w-16 h-16 rounded-2xl ring-2 ring-white shadow-xs"
              />
              {previewUrl && (
                <span className="absolute -bottom-1 -right-1 p-1 bg-[#005035] text-white rounded-full shadow-2xs">
                  <span className="material-symbols-outlined text-[13px] block">check</span>
                </span>
              )}
            </div>

            <div className="min-w-0">
              <span className="text-[0.92rem] font-extrabold text-[#1d1d1f] block truncate">
                {student.name}
              </span>
              <span className="text-[0.72rem] font-medium text-[#6e6e73] block truncate">
                RA: {student.ra || '—'}-{student.digRa || ''} •{' '}
                {student.photoManualLink
                  ? 'Associação manual protegida (ID estável)'
                  : previewUrl
                  ? 'Correspondência automática da pasta Drive'
                  : 'Sem foto associada'}
              </span>
            </div>
          </div>

          {previewUrl && (
            <button
              type="button"
              onClick={handleRemoveLink}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#fff2f2] text-[#ff3b30] border border-black/[0.08] font-bold text-[0.72rem] flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
              title="Remover vínculo atual de foto"
            >
              <span className="material-symbols-outlined text-[15px]">link_off</span>
              <span>Desvincular</span>
            </button>
          )}
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 mt-3 bg-[#f5f5f7] p-1 rounded-xl border border-black/[0.05]">
          <button
            type="button"
            onClick={() => setActiveTab('drive_catalog')}
            className={`py-2 px-3 rounded-lg font-bold text-[0.76rem] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'drive_catalog'
                ? 'bg-white text-[#1d1d1f] shadow-2xs'
                : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            <span className="material-symbols-outlined text-[17px] text-[#0071e3]">cloud_search</span>
            <span>Vincular da Pasta Drive ({discoveredPhotos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('device_upload')}
            className={`py-2 px-3 rounded-lg font-bold text-[0.76rem] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'device_upload'
                ? 'bg-white text-[#1d1d1f] shadow-2xs'
                : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            <span className="material-symbols-outlined text-[17px] text-[#005035]">upload_file</span>
            <span>Enviar do Dispositivo</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="overflow-y-auto py-3 space-y-3 flex-1 min-h-[240px]">
          {activeTab === 'drive_catalog' ? (
            <div className="space-y-3">
              {/* Search bar in Drive Catalog */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar foto por nome, abreviação, turma ou extensão (.jpg, .png)..."
                    className="w-full h-10 pl-9 pr-8 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-[0.8rem] font-medium text-[#1d1d1f] focus:bg-white focus:border-[#0071e3] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                    </button>
                  )}
                </div>

                {onSyncDrivePhotos && (
                  <button
                    type="button"
                    onClick={handleRefreshCatalog}
                    disabled={isSyncingCatalog}
                    className="h-10 px-3 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] border border-black/[0.08] font-bold text-[0.74rem] flex items-center gap-1 cursor-pointer shrink-0"
                    title="Recarregar arquivos da pasta Fotos Estudantes no Google Drive"
                  >
                    <span
                      className={`material-symbols-outlined text-[16px] text-[#0071e3] ${
                        isSyncingCatalog ? 'animate-spin' : ''
                      }`}
                    >
                      sync
                    </span>
                    <span className="hidden sm:inline">Atualizar Lista</span>
                  </button>
                )}
              </div>

              {/* Results list */}
              {filteredDrivePhotos.length === 0 ? (
                <div className="p-5 text-center bg-[#f5f5f7]/70 rounded-2xl border border-black/[0.05] space-y-1">
                  <p className="text-[0.82rem] font-bold text-[#1d1d1f]">
                    Nenhum arquivo de foto localizado com esse filtro.
                  </p>
                  <p className="text-[0.74rem] text-[#6e6e73]">
                    Você pode colar o link/ID direto do arquivo abaixo ou enviar do dispositivo.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[210px] overflow-y-auto pr-1">
                  {filteredDrivePhotos.map((item) => {
                    const isSelected =
                      selectedDriveFile?.id === item.id || student.photoDriveId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectDrivePhoto(item)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#0071e3]/10 border-[#0071e3] ring-1 ring-[#0071e3]/30'
                            : 'bg-white hover:bg-[#f5f5f7] border-black/[0.07]'
                        }`}
                      >
                        <img
                          src={item.photoUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover bg-[#e8e8ed] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.76rem] font-bold text-[#1d1d1f] truncate">
                            {item.name}
                          </p>
                          <p className="text-[0.66rem] text-[#6e6e73] truncate">
                            {item.subfolderName || 'Pasta Fotos Estudantes'} • ID:{' '}
                            {item.id.slice(0, 7)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Direct Google Drive URL / File ID input for files with custom sharing */}
              <div className="pt-2 border-t border-black/[0.06] flex items-center gap-2">
                <input
                  type="text"
                  value={manualDriveUrlInput}
                  onChange={(e) => setManualDriveUrlInput(e.target.value)}
                  placeholder="Ou cole aqui o link / ID direto da foto no Google Drive..."
                  className="flex-1 h-9 px-3 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-[0.75rem] font-mono text-[#1d1d1f] focus:bg-white focus:border-[#0071e3] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyDirectDriveUrl}
                  className="h-9 px-3 rounded-xl bg-[#1d1d1f] hover:bg-black text-white font-bold text-[0.74rem] cursor-pointer shrink-0"
                >
                  Usar Link/ID
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[76px] px-4 bg-[#eaf6ef] hover:bg-[#d3f2e0] text-[#003723] font-extrabold text-[0.9rem] rounded-2xl flex items-center justify-center gap-2.5 border-2 border-dashed border-[#005035] cursor-pointer active:scale-98 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[26px]">folder_open</span>
                <span>
                  {isProcessing
                    ? 'Processando e otimizando foto...'
                    : 'Escolher Foto do Computador ou Celular'}
                </span>
              </button>
            </div>
          )}

          {statusMsg && (
            <div className="p-2.5 rounded-xl bg-[#f5f5f7] border border-black/[0.07] text-[0.76rem] font-semibold text-[#1d1d1f]">
              {statusMsg}
            </div>
          )}

          {uploadSuccess && (
            <div className="p-2.5 bg-[#eaf6ef] text-[#005035] rounded-xl font-bold text-[0.8rem] flex items-center gap-2 border border-[#005035]/25">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              <span>Vínculo de foto confirmado e salvo com ID estável!</span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-black/[0.06] flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-bold text-[0.84rem] rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !previewUrl}
            className="flex-1 min-h-[44px] bg-[#005035] hover:bg-[#003723] text-white font-extrabold text-[0.84rem] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span>Confirmar Vínculo da Foto</span>
          </button>
        </div>
      </div>
    </div>
  );
};
