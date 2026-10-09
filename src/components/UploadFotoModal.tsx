import React, { useState, useRef } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  getAccessToken,
  uploadStudentPhotoToDrive,
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

  const [previewUrl, setPreviewUrl] = useState<string>(student.photo || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setStatusMsg('Carregando e otimizando foto do armazenamento interno...');

    const dataUrl = await compressImageFileToDataUrl(file);
    if (!dataUrl) {
      setIsProcessing(false);
      setStatusMsg('Não foi possível ler a imagem selecionada.');
      return;
    }

    setPreviewUrl(dataUrl);
    onSavePhoto(student.id, dataUrl);
    setStatusMsg('✓ Foto do armazenamento interno carregada e aplicada ao perfil!');
    setUploadSuccess(true);

    // Se já houver sessão autenticada em segundo plano, sincroniza silenciosamente sem exibir links
    try {
      const token = await getAccessToken();
      if (token) {
        const uploaded = await uploadStudentPhotoToDrive(
          student,
          className,
          dataUrl
        );
        onSavePhoto(student.id, dataUrl, uploaded.webViewLink);
      }
    } catch {
      // Mantém a foto salva do armazenamento interno normalmente
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    if (!previewUrl) return;
    onSavePhoto(student.id, previewUrl);
    setUploadSuccess(true);
    setTimeout(() => {
      setUploadSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#003440]/15 p-4 sm:p-6 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#edeeec]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#eaf6ef] text-[#005035] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">add_a_photo</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-[1.08rem] sm:text-[1.15rem] font-extrabold text-[#003440] truncate">
                Enviar Foto do Dispositivo
              </h3>
              <p className="text-[0.8rem] font-bold text-[#436370] truncate">
                Nº {student.number.toString().padStart(2, '0')} • {student.name} ({className})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#f3f4f2] hover:bg-[#e7e8e6] text-[#41484b] flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Fechar"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body content: Exclusivamente Upload do Armazenamento Interno */}
        <div className="overflow-y-auto py-4 space-y-4">
          {/* Photo Preview */}
          <div className="flex items-center gap-4 p-4 bg-[#f5f7f6] rounded-2xl border border-[#b4c0c4]/70">
            <div className="relative shrink-0">
              <StudentAvatar
                student={{ ...student, photo: previewUrl }}
                size="xl"
                className="w-24 h-24 text-[1.8rem] ring-4 ring-[#003440]/15 shadow-sm"
              />
              {previewUrl && (
                <span className="absolute bottom-0 right-0 p-1.5 bg-[#005035] text-white rounded-full shadow-2xs">
                  <span className="material-symbols-outlined text-[15px] block">check</span>
                </span>
              )}
            </div>

            <div className="text-left min-w-0 flex-1">
              <span className="text-[1rem] font-extrabold text-[#003440] block leading-tight">
                {student.name}
              </span>
              <span className="text-[0.78rem] font-semibold text-[#5a676b] block mt-1">
                Selecione uma foto salva no armazenamento interno do computador ou celular.
              </span>
            </div>
          </div>

          {/* Internal Storage File Selector */}
          <div className="space-y-3">
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
              className="w-full min-h-[60px] px-4 bg-[#eaf6ef] hover:bg-[#d3f2e0] text-[#003723] font-extrabold text-[0.94rem] rounded-2xl flex items-center justify-center gap-2.5 border-2 border-dashed border-[#005035] cursor-pointer active:scale-98 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[26px]">folder_open</span>
              <span>
                {isProcessing
                  ? 'Carregando foto...'
                  : 'Escolher Foto do Armazenamento Interno'}
              </span>
            </button>

            {statusMsg && (
              <div className="p-3 rounded-xl bg-[#f3f4f2] border border-[#b4c0c4]/80 text-[0.8rem] font-bold text-[#003440]">
                {statusMsg}
              </div>
            )}
          </div>

          {uploadSuccess && (
            <div className="p-3 bg-[#a4f3ca]/70 text-[#003723] rounded-xl font-bold text-[0.84rem] flex items-center gap-2 border border-[#005035]/25">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <span>Foto salva com sucesso!</span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-[#edeeec] flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[46px] bg-[#edeeec] hover:bg-[#e2e4e1] text-[#374144] font-bold text-[0.88rem] rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !previewUrl}
            className="flex-1 min-h-[46px] bg-[#005035] hover:bg-[#003723] text-white font-extrabold text-[0.88rem] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[19px]">save</span>
            <span>Salvar Foto</span>
          </button>
        </div>
      </div>
    </div>
  );
};

