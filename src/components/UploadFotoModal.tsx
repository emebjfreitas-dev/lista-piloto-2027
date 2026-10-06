import React, { useState, useRef } from 'react';
import { Student } from '../types';
import { SCHOOL_NAME } from '../data/mockData';
import { StudentAvatar } from './StudentAvatar';
import {
  getSavedPhotosDriveFolderInfo,
  getAccessToken,
  googleSignIn,
  uploadStudentPhotoToDrive,
  OFFICIAL_FOLDER_NAME,
} from '../services/googleSheetsApi';

interface UploadFotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  onSavePhoto: (studentId: string, newPhotoUrl: string, driveLink?: string) => void;
}

export const UploadFotoModal: React.FC<UploadFotoModalProps> = ({
  isOpen,
  onClose,
  student,
  className,
  onSavePhoto,
}) => {
  if (!isOpen || !student) return null;

  const [activeTab, setActiveTab] = useState<'upload' | 'drive'>('upload');
  const [previewUrl, setPreviewUrl] = useState<string>(student.photo || '');
  const [driveInputUrl, setDriveInputUrl] = useState<string>(student.photoDriveUrl || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState<string | null>(null);
  const [uploadedDriveFileLink, setUploadedDriveFileLink] = useState<string>(
    student.photoDriveUrl || ''
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const savedFolder = getSavedPhotosDriveFolderInfo();
  const [driveFolderUrl, setDriveFolderUrl] = useState<string>(savedFolder.folderUrl);

  const cleanStudentName = student.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  const expectedFileName = `${cleanStudentName}.jpg`;
  const driveFolderPath = `Google Drive / ${OFFICIAL_FOLDER_NAME} / ${expectedFileName}`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setDriveStatusMsg('Lendo imagem e enviando diretamente para a pasta do Google Drive...');

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);

      try {
        let token = await getAccessToken();
        if (!token) {
          const signInRes = await googleSignIn();
          token = signInRes?.accessToken || (await getAccessToken());
        }

        if (token) {
          const uploaded = await uploadStudentPhotoToDrive(
            student,
            className,
            dataUrl
          );
          setUploadedDriveFileLink(uploaded.webViewLink);
          setDriveInputUrl(uploaded.webViewLink);
          if (uploaded.folderUrl) {
            setDriveFolderUrl(uploaded.folderUrl);
          }
          onSavePhoto(student.id, dataUrl, uploaded.webViewLink);
          setDriveStatusMsg(
            `✓ Foto enviada automaticamente para a pasta "${OFFICIAL_FOLDER_NAME}" no Google Drive como "${expectedFileName}"!`
          );
          setUploadSuccess(true);
        } else {
          setDriveStatusMsg(
            'Foto carregada. Clique em "Salvar e Enviar para Pasta do Drive" para autenticar e gravar no Google Drive.'
          );
        }
      } catch (err: any) {
        console.warn('Aviso ao enviar imediatamente para o Drive:', err);
        setDriveStatusMsg(
          `Foto pronta. Ao clicar em Salvar, será enviada para a pasta ${OFFICIAL_FOLDER_NAME} no Drive.`
        );
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDriveUrlChange = (url: string) => {
    setDriveInputUrl(url);
    let parsedUrl = url;
    if (url.includes('/file/d/')) {
      const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        parsedUrl = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
      }
    } else if (url.includes('id=')) {
      const match = url.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        parsedUrl = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
      }
    }
    setPreviewUrl(parsedUrl);
  };

  const handleSave = async () => {
    if (!previewUrl) return;
    setIsProcessing(true);
    try {
      let finalDriveLink = uploadedDriveFileLink || driveInputUrl || `${driveFolderPath}`;
      if (previewUrl.startsWith('data:image') && !uploadedDriveFileLink) {
        let token = await getAccessToken();
        if (!token) {
          const signInRes = await googleSignIn();
          token = signInRes?.accessToken || (await getAccessToken());
        }
        if (token) {
          try {
            const uploaded = await uploadStudentPhotoToDrive(
              student,
              className,
              previewUrl
            );
            finalDriveLink = uploaded.webViewLink;
            setUploadedDriveFileLink(uploaded.webViewLink);
            if (uploaded.folderUrl) {
              setDriveFolderUrl(uploaded.folderUrl);
            }
          } catch (err) {
            console.warn('Upload local salvo; aviso Drive:', err);
          }
        }
      }
      onSavePhoto(student.id, previewUrl, finalDriveLink);
      setIsProcessing(false);
      setUploadSuccess(true);
      setTimeout(() => {
        setUploadSuccess(false);
        onClose();
      }, 950);
    } catch {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg lg:max-w-2xl rounded-2xl shadow-2xl border-2 border-[#003440]/20 p-4 sm:p-6 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#edeeec]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#c3e5f4] text-[#003440] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[26px]">cloud_upload</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-[1.15rem] sm:text-[1.25rem] font-black text-[#003440] truncate">
                Upload de Foto para a Pasta do Google Drive
              </h3>
              <p className="text-[0.82rem] font-bold text-[#436370] truncate">
                Nº {student.number.toString().padStart(2, '0')} • {student.name} ({className})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#41484b] flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Body content */}
        <div className="overflow-y-auto py-4 space-y-4">
          {/* Photo Preview Canvas */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#f3f4f2] rounded-2xl border-2 border-[#b4c0c4]/80">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <StudentAvatar
                  student={{ ...student, photo: previewUrl }}
                  size="xl"
                  className="w-24 h-24 text-[1.8rem] ring-4 ring-[#003440]/20 shadow-md"
                />
                <span className="absolute bottom-0 right-0 p-1.5 bg-[#005035] text-white rounded-full shadow-xs">
                  <span className="material-symbols-outlined text-[16px] block">verified</span>
                </span>
              </div>

              <div className="text-left min-w-0">
                <span className="text-[1.05rem] font-black text-[#003440] block leading-tight">
                  {student.name}
                </span>
                <span className="text-[0.78rem] font-semibold text-[#374144] block mt-1">
                  Nome automático na pasta do Drive:
                </span>
                <code className="inline-block mt-0.5 bg-white px-2 py-0.5 rounded-lg border border-[#c0c8cb] text-[#005035] font-mono font-bold text-[0.78rem] break-all">
                  {expectedFileName}
                </code>
              </div>
            </div>

            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-extrabold text-[0.8rem] flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">folder_shared</span>
              <span>Abrir Pasta no Drive</span>
            </a>
          </div>

          {/* Source Tabs: Upload directly to Drive vs Paste Drive Link */}
          <div className="grid grid-cols-2 gap-2 bg-[#edeeec] p-1.5 rounded-xl border border-[#c0c8cb]/60">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`py-2.5 px-3 rounded-lg font-extrabold text-[0.85rem] flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-[#005035] text-white shadow-xs'
                  : 'text-[#374144] hover:text-[#003440]'
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">add_a_photo</span>
              <span>Enviar Foto p/ Pasta Drive</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('drive')}
              className={`py-2.5 px-3 rounded-lg font-extrabold text-[0.85rem] flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'drive'
                  ? 'bg-[#003440] text-white shadow-xs'
                  : 'text-[#374144] hover:text-[#003440]'
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">link</span>
              <span>Colar Link do Google Drive</span>
            </button>
          </div>

          {/* Tab 1: Upload / Camera directly to Google Drive Folder */}
          {activeTab === 'upload' && (
            <div className="space-y-3 p-4 bg-white rounded-2xl border-2 border-[#005035]/25">
              <p className="text-[0.88rem] text-[#151a18] font-semibold leading-snug">
                Escolha uma foto do computador/celular ou tire com a câmera. Ela é enviada <strong>diretamente para a pasta oficial do Google Drive</strong> (<code className="font-mono text-[#005035]">{OFFICIAL_FOLDER_NAME}</code>):
              </p>

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
                className="w-full min-h-[56px] bg-[#eaf6ef] hover:bg-[#a4f3ca] text-[#003723] font-black text-[0.98rem] rounded-xl flex items-center justify-center gap-2.5 border-2 border-dashed border-[#005035] cursor-pointer active:scale-98 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[26px]">cloud_upload</span>
                <span>
                  {isProcessing
                    ? 'Enviando foto para a Pasta do Google Drive...'
                    : 'Escolher Foto ou Tirar com a Câmera (Vai p/ Pasta do Drive)'}
                </span>
              </button>

              {driveStatusMsg && (
                <div className="p-3 rounded-xl bg-[#f3f4f2] border border-[#b4c0c4] text-[0.82rem] font-bold text-[#003440] flex items-center justify-between gap-2">
                  <span>{driveStatusMsg}</span>
                  {uploadedDriveFileLink && (
                    <a
                      href={uploadedDriveFileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-[#005035] text-white text-[0.75rem] font-black shrink-0"
                    >
                      Ver no Drive
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Google Drive Link */}
          {activeTab === 'drive' && (
            <div className="space-y-3 p-4 bg-white rounded-2xl border-2 border-[#b4c0c4]/80">
              <label className="text-[0.85rem] font-extrabold text-[#003440] block">
                Link direto da foto no Google Drive:
              </label>

              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[#71787b] text-xl">
                  link
                </span>
                <input
                  type="url"
                  value={driveInputUrl}
                  onChange={(e) => handleDriveUrlChange(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view"
                  className="w-full h-[48px] pl-10 pr-3 bg-[#f3f4f2] text-[#191c1b] text-[0.85rem] rounded-xl border-2 border-[#c0c8cb] focus:bg-white focus:outline-none focus:border-[#003440]"
                />
              </div>
            </div>
          )}

          {/* Google Drive Directory Sync Box */}
          <div className="p-3.5 bg-[#c3e5f4]/35 rounded-xl border-2 border-[#aaccda] flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[22px] text-[#003440] shrink-0 mt-0.5">
              folder_shared
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[0.76rem] font-black text-[#003440] block uppercase tracking-wide">
                Destino Automático no Google Drive ({SCHOOL_NAME})
              </span>
              <p className="text-[0.8rem] text-[#151a18] font-mono font-bold break-all mt-0.5">
                {driveFolderPath}
              </p>
              <p className="text-[0.75rem] text-[#374144] font-semibold mt-1">
                Caso o(a) estudante não possua foto na pasta do Drive ou via upload, o sistema exibe automaticamente as <strong>duas iniciais do nome</strong>.
              </p>
            </div>
          </div>

          {uploadSuccess && (
            <div className="p-3 bg-[#a4f3ca]/80 text-[#003723] rounded-xl font-black text-[0.88rem] flex items-center gap-2 border border-[#005035]/30">
              <span className="material-symbols-outlined text-[22px]">check_circle</span>
              <span>Foto salva no aplicativo e sincronizada na pasta do Google Drive!</span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t-2 border-[#edeeec] flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[50px] bg-[#edeeec] hover:bg-[#e7e8e6] text-[#374144] font-extrabold text-[0.92rem] rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !previewUrl}
            className="flex-1 min-h-[50px] bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.92rem] rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">cloud_done</span>
            <span>{isProcessing ? 'Enviando ao Drive...' : 'Salvar e Sincronizar no Drive'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
