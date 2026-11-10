import React, { useState, useRef } from 'react';
import { ClassGroup } from '../types';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import {
  exportSchoolDataToJsonFile,
  validateAndSanitizeJsonPayload,
  importSchoolDataFromJson,
  resetEntireAppData,
} from '../services/db';

interface AtualizarDadosJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  onUpdateClasses: (updatedClasses: ClassGroup[]) => void;
  currentUserEmail?: string;
}

export const AtualizarDadosJsonModal: React.FC<AtualizarDadosJsonModalProps> = ({
  isOpen,
  onClose,
  classes,
  onUpdateClasses,
  currentUserEmail = 'emebjfreitas@jundiai.sp.gov.br',
}) => {
  useModalScrollLock(isOpen);

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);
  const [validatedData, setValidatedData] = useState<{
    classes: ClassGroup[];
    totalStudents: number;
    meta?: any;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const handleProcessFile = (file: File) => {
    setErrorMessage(null);
    setFeedbackSuccess(null);
    setValidatedData(null);

    if (!file.name.toLowerCase().endsWith('.json')) {
      setErrorMessage('Por favor, selecione um arquivo com formato .json válido.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('O arquivo excede o limite máximo seguro de 25 MB.');
      return;
    }

    setSelectedFileName(file.name);
    setSelectedFileSize(formatBytes(file.size));

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        const result = validateAndSanitizeJsonPayload(parsed);

        if (!result.isValid || !result.classes) {
          setErrorMessage(result.error || 'Estrutura JSON incompatível com a base escolar.');
          return;
        }

        setValidatedData({
          classes: result.classes,
          totalStudents: result.totalStudents || 0,
          meta: result.backupMeta,
        });
      } catch (err: any) {
        setErrorMessage(`Falha na leitura do arquivo JSON: ${err?.message || 'Sintaxe inválida'}`);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Erro ao ler o arquivo selecionado.');
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleProcessFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleProcessFile(files[0]);
    }
    e.target.value = '';
  };

  const handleApplyImport = async () => {
    if (!validatedData) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      const result = await importSchoolDataFromJson(
        validatedData.classes,
        selectedFileName || 'importacao_escolar.json',
        selectedFileSize || '0 KB',
        currentUserEmail
      );

      if (!result.ok) {
        setErrorMessage(result.error || 'Erro ao persistir dados importados.');
        return;
      }

      onUpdateClasses(validatedData.classes);
      setFeedbackSuccess(
        `✓ Base escolar atualizada com sucesso! Foram carregadas ${validatedData.classes.length} turmas e ${validatedData.totalStudents} estudantes.`
      );

      setTimeout(() => {
        setFeedbackSuccess(null);
        setValidatedData(null);
        setSelectedFileName(null);
        setSelectedFileSize(null);
        onClose();
      }, 1600);
    } catch (err: any) {
      setErrorMessage(`Falha na importação: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleResetEntireApp = async () => {
    const confirmed = window.confirm(
      'ATENÇÃO: Deseja redefinir TODOS os dados de todo o app para testar o recurso de importação JSON do zero?\n\n' +
      '• Todas as 40 turmas serão restauradas para a base oficial limpa.\n' +
      '• Todas as faltas de todos os estudantes serão zeradas.\n' +
      '• O banco de dados no servidor e no Firebase serão resetados.\n\n' +
      'Confirma o reset completo de teste?'
    );
    if (!confirmed) return;

    setIsResetting(true);
    setErrorMessage(null);
    try {
      const cleanClasses = await resetEntireAppData(currentUserEmail);
      onUpdateClasses(cleanClasses);
      setValidatedData(null);
      setSelectedFileName(null);
      setSelectedFileSize(null);
      setFeedbackSuccess(
        '✓ Todos os dados de todo o app foram resetados com sucesso! Base limpa oficial pronta para teste.'
      );
    } catch (err: any) {
      setErrorMessage(`Falha ao resetar banco escolar: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDownloadCurrentBackup = () => {
    exportSchoolDataToJsonFile(classes, currentUserEmail);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh]"
      >
        {/* Header Institucional */}
        <div className="px-5 sm:px-6 py-4 bg-white border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200/60 mt-0.5">
              <span className="material-symbols-outlined text-[22px]">upload_file</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/50">
                  Importação &amp; Atualização Segura
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Protocolo SED Jundiaí
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-950 leading-tight mt-1">
                Atualizar Dados via Arquivo JSON
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Arraste e solte o arquivo <strong className="text-slate-700 font-semibold">.json</strong> para sincronizar e atualizar instantaneamente turmas, estudantes e frequências com total integridade e segurança.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Fechar janela"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Scroll Body */}
        <div className="modal-scroll-body flex-1 p-5 sm:p-6 space-y-5">
          {/* Alerta de Feedback de Sucesso */}
          {feedbackSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3 animate-gentle-fade">
              <span className="material-symbols-outlined text-emerald-700 text-[22px] shrink-0 mt-0.5">
                check_circle
              </span>
              <div className="min-w-0 flex-1 text-xs sm:text-sm font-semibold">
                {feedbackSuccess}
              </div>
            </div>
          )}

          {/* Alerta de Erro */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex items-start gap-3 animate-gentle-fade">
              <span className="material-symbols-outlined text-rose-700 text-[22px] shrink-0 mt-0.5">
                error
              </span>
              <div className="min-w-0 flex-1 text-xs sm:text-sm font-medium">
                <strong className="block font-bold">Inconsistência identificada:</strong>
                {errorMessage}
              </div>
            </div>
          )}

          {/* Área de Arraste e Solte (Dropzone) */}
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 select-none ${
              isDragging
                ? 'border-blue-600 bg-blue-50/80 scale-[1.01]'
                : 'border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                isDragging
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
              }`}
            >
              <span className="material-symbols-outlined text-[32px]">
                {isDragging ? 'download' : 'cloud_upload'}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-sm sm:text-base font-bold text-slate-900">
                {isDragging
                  ? 'Solte o arquivo .json aqui agora'
                  : 'Arraste e solte o arquivo .json aqui'}
              </p>
              <p className="text-xs text-slate-500">
                ou <span className="text-blue-600 font-semibold underline underline-offset-2">clique para selecionar do seu computador</span>
              </p>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium pt-1">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">description</span>
                Apenas arquivos .json
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">shield</span>
                Até 25 MB
              </span>
            </div>
          </div>

          {/* Pré-visualização do Arquivo Validado */}
          {validatedData && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 animate-gentle-fade">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {selectedFileName}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Tamanho: {selectedFileSize} · Integridade verificada
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-800 font-mono text-xs font-bold tabular-nums shadow-2xs">
                    {validatedData.classes.length} Turmas
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-blue-100 border border-blue-200 text-blue-900 font-mono text-xs font-bold tabular-nums shadow-2xs">
                    {validatedData.totalStudents} Alunos
                  </span>
                </div>
              </div>

              {/* Checklist de Segurança */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
                  <span>Sintaxe JSON válida e estruturada</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
                  <span>Campos de estudantes normalizados</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
                  <span>Proteção contra injeção e tags maliciosas</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
                  <span>Autorização institucional auditada</span>
                </div>
              </div>

              {/* Ações de Confirmação */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setValidatedData(null);
                    setSelectedFileName(null);
                    setSelectedFileSize(null);
                  }}
                  className="w-full sm:w-auto h-11 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs sm:text-sm hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar Seleção
                </button>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={isApplying}
                  className="w-full sm:w-auto h-11 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  {isApplying ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">
                        progress_activity
                      </span>
                      <span>Atualizando Todo o App...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px] text-emerald-400">
                        done_all
                      </span>
                      <span>Confirmar e Atualizar Todo o App</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Seção de Ferramentas Auxiliares: Backup JSON & Reset */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-slate-500">build</span>
              <span>Ferramentas Rápidas de Teste e Segurança</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Baixar Backup JSON */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between gap-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-blue-600">
                      download
                    </span>
                    <span>Baixar Backup JSON Atual</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Exporte o arquivo .json oficial com todas as 40 turmas e 1.237 alunos para conferência ou restauração.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCurrentBackup}
                  className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full"
                >
                  <span className="material-symbols-outlined text-[16px]">file_download</span>
                  <span>Baixar Arquivo JSON ({classes.length} turmas)</span>
                </button>
              </div>

              {/* Resetar Todo o App */}
              <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200/70 flex flex-col justify-between gap-2.5">
                <div>
                  <h4 className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-rose-700">
                      restart_alt
                    </span>
                    <span>Resetar Todo o App (Base Limpa)</span>
                  </h4>
                  <p className="text-[11px] text-rose-800/80 mt-0.5 leading-relaxed">
                    Restaura as 40 turmas com 0 faltas e dados limpos no navegador e servidor para testar o arraste e solte.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetEntireApp}
                  disabled={isResetting}
                  className="h-9 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isResetting ? 'progress_activity' : 'delete_sweep'}
                  </span>
                  <span>{isResetting ? 'Resetando...' : 'Resetar Dados Agora'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="material-symbols-outlined text-[15px] text-slate-400">lock</span>
            <span>Apenas Administradores Autorizados (@educacao.jundiai.sp.gov.br)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-white transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
