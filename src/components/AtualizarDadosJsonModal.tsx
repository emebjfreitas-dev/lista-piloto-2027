import React, { useState, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  CheckCheck,
  CheckCircle2,
  CloudUpload,
  Download,
  FileText,
  FileUp,
  Loader2,
  Lock,
  RotateCcw,
  Shield,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { ClassGroup } from '../types';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ModalPortal } from './ui/ModalPortal';
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
  embedded?: boolean;
}

export const AtualizarDadosJsonModal: React.FC<AtualizarDadosJsonModalProps> = ({
  isOpen,
  onClose,
  classes,
  onUpdateClasses,
  currentUserEmail = 'emebjfreitas@jundiai.sp.gov.br',
  embedded = false,
}) => {
  useModalScrollLock(isOpen && !embedded);

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);
  const [validatedData, setValidatedData] = useState<{
    classes: ClassGroup[];
    totalStudents: number;
    importedClassesCount?: number;
    importedStudentsCount?: number;
    meta?: any;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmResetPending, setConfirmResetPending] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentTotalStudents = classes.reduce((acc, c) => acc + c.students.length, 0);

  if (!isOpen && !embedded) return null;

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
    setConfirmOverwriteOpen(false);

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
          importedClassesCount: result.importedClassesCount,
          importedStudentsCount: result.importedStudentsCount,
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
      const countTurmas = validatedData.importedClassesCount ?? validatedData.classes.length;
      const countAlunos = validatedData.importedStudentsCount ?? validatedData.totalStudents;
      setFeedbackSuccess(
        `✓ Base escolar atualizada com sucesso! Foram processadas ${countTurmas} turma(s) e ${countAlunos} estudante(s) do JSON (${validatedData.totalStudents} ativos/matriculados no total).`
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
    setIsResetting(true);
    setErrorMessage(null);
    try {
      const cleanClasses = await resetEntireAppData(currentUserEmail);
      onUpdateClasses(cleanClasses);
      setValidatedData(null);
      setSelectedFileName(null);
      setSelectedFileSize(null);
      setConfirmResetPending(false);
      setFeedbackSuccess(
        '✓ Todos os dados foram limpos com sucesso! Contas autorizadas, 40 turmas e calendário de 200 dias foram preservados para você começar do zero.'
      );
    } catch (err: any) {
      setErrorMessage(`Falha ao limpar banco escolar: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDownloadCurrentBackup = () => {
    exportSchoolDataToJsonFile(classes, currentUserEmail);
  };

  const contentNode = (
    <div
      onClick={embedded ? undefined : (e) => e.stopPropagation()}
      className={
        embedded
          ? 'bg-white w-full rounded-3xl shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] overflow-hidden flex flex-col min-w-0'
          : 'modal-shell bg-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[min(92vh,calc(100dvh-1rem))] sm:max-h-[88vh] min-w-0 animate-apple-pop'
      }
    >
      {/* Header Institucional */}
      <div
        className={`modal-header-surface px-5 sm:px-6 py-4 flex items-start justify-between gap-3 shrink-0 min-w-0 ${
          embedded ? 'bg-[#f4f7fb]' : 'bg-[#edf2f7]'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#0b3b8c] text-white flex items-center justify-center shrink-0 mt-0.5">
            <FileUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-slate-950 leading-tight break-words">
              Backup e Restauração via JSON (Protocolo SED)
            </h2>
            <p className="text-xs text-slate-700 mt-0.5 break-words">
              Exporte backup completo ou arraste um arquivo <strong className="text-slate-950 font-semibold">.json</strong> para atualizar turmas e estudantes.
            </p>
          </div>
        </div>

        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-200/70 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className={embedded ? 'p-5 sm:p-6 space-y-5 min-w-0' : 'modal-scroll-body flex-1 p-5 sm:p-6 space-y-5 min-w-0'}>
          {/* Alerta de Feedback de Sucesso */}
          {feedbackSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-950 flex items-start gap-3 animate-gentle-fade">
              <CheckCircle2 className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 text-xs sm:text-sm font-semibold break-words">
                {feedbackSuccess}
              </div>
            </div>
          )}

          {/* Alerta de Erro */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-100 text-rose-950 flex items-start gap-3 animate-gentle-fade">
              <AlertCircle className="w-5 h-5 text-rose-800 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 text-xs sm:text-sm font-medium break-words">
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
            className={`rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 select-none ${
              isDragging
                ? 'bg-blue-100 scale-[1.01]'
                : 'bg-[#eef2f7] hover:bg-slate-200/70'
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
                  ? 'bg-[#0b3b8c] text-white shadow-md'
                  : 'bg-white text-[#0b3b8c] shadow-sm'
              }`}
            >
              {isDragging ? <Download className="w-7 h-7" /> : <CloudUpload className="w-7 h-7" />}
            </div>

            <div className="space-y-1">
              <p className="text-sm sm:text-base font-bold text-slate-950">
                {isDragging
                  ? 'Solte o arquivo .json aqui agora'
                  : 'Arraste e solte o arquivo .json aqui'}
              </p>
              <p className="text-xs text-slate-600">
                ou <span className="text-[#0052cc] font-bold underline underline-offset-2">clique para selecionar do seu dispositivo</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-600 font-medium pt-1">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                Backup Escolar ou Base SED em .json
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" />
                Até 25 MB
              </span>
            </div>
          </div>

          {/* Pré-visualização do Arquivo Validado */}
          {validatedData && (
            <div className="bg-[#eef2f7] rounded-2xl p-4 sm:p-5 space-y-4 animate-gentle-fade">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
                    <BadgeCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-950 truncate">
                      {selectedFileName}
                    </p>
                    <p className="text-[11px] text-slate-600 font-mono">
                      Tamanho: {selectedFileSize} · Todos os campos reconhecidos
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="px-3 py-1 rounded-full bg-white text-slate-900 font-mono text-xs font-bold tabular-nums shadow-2xs">
                    {validatedData.importedClassesCount ?? validatedData.classes.length} Turma(s)
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#0b3b8c] text-white font-mono text-xs font-bold tabular-nums shadow-2xs">
                    {validatedData.importedStudentsCount ?? validatedData.totalStudents} Estudante(s)
                  </span>
                </div>
              </div>

              {/* Checklist de Segurança */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-800">
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Sintaxe JSON válida e estruturada</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Colunas SED &amp; extras preservadas</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Proteção contra injeção e tags maliciosas</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Autorização institucional auditada</span>
                </div>
              </div>

              {confirmOverwriteOpen ? (
                <div className="p-4 rounded-2xl bg-amber-100 shadow-xs space-y-3 animate-gentle-fade">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs text-amber-950">
                      <p className="font-bold">
                        Confirmação de Substituição da Base Escolar
                      </p>
                      <p className="leading-relaxed">
                        Esta ação substituirá as <strong>{classes.length} turma(s) ({currentTotalStudents} estudantes)</strong> atuais pelas{' '}
                        <strong>{validatedData.importedClassesCount ?? validatedData.classes.length} turma(s) ({validatedData.importedStudentsCount ?? validatedData.totalStudents} estudantes)</strong> deste arquivo tanto no dispositivo quanto na nuvem.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadCurrentBackup}
                      className="min-h-[38px] px-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Backup Atual Primeiro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmOverwriteOpen(false)}
                      disabled={isApplying}
                      className="min-h-[38px] px-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      disabled={isApplying}
                      className="min-h-[38px] px-4 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Atualizando Base...</span>
                        </>
                      ) : (
                        <>
                          <CheckCheck className="w-4 h-4 text-emerald-300" />
                          <span>Confirmar Substituição Agora</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setValidatedData(null);
                      setSelectedFileName(null);
                      setSelectedFileSize(null);
                      setConfirmOverwriteOpen(false);
                    }}
                    className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                  >
                    Cancelar Seleção
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOverwriteOpen(true)}
                    disabled={isApplying}
                    className="w-full sm:w-auto min-h-[44px] px-6 rounded-xl bg-[#0b3b8c] hover:bg-[#082d6b] disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    <CheckCheck className="w-[18px] h-[18px] text-emerald-300" />
                    <span>Aplicar Dados na Base Escolar</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Seção de Ferramentas Auxiliares: Backup JSON & Reset */}
          <div className="pt-2 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-slate-600" />
              <span>Ferramentas Rápidas de Teste e Segurança</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Baixar Backup JSON */}
              <div className="p-4 rounded-2xl bg-[#eef2f7] flex flex-col justify-between gap-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-950 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-[#0052cc]" />
                    <span>Baixar Backup JSON Atual</span>
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    Exporte o arquivo .json oficial com todas as turmas e estudantes para conferência ou restauração.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCurrentBackup}
                  className="min-h-[40px] px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full shadow-2xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Arquivo JSON ({classes.length} turmas)</span>
                </button>
              </div>

              {/* Limpar Apenas os Dados do Banco */}
              <div className="p-4 rounded-2xl bg-rose-50 flex flex-col justify-between gap-2.5">
                <div>
                  <h4 className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-rose-700" />
                    <span>Limpar Apenas os Dados (Começar do Zero)</span>
                  </h4>
                  <p className="text-[11px] text-rose-900/80 mt-0.5 leading-relaxed">
                    Remove estudantes, faltas, alertas, avisos e logs mantendo contas, 40 turmas e calendário intactos.
                  </p>
                </div>
                {confirmResetPending ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-rose-950">
                      Confirmar limpeza completa de {classes.length} turmas e {currentTotalStudents} estudantes?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmResetPending(false)}
                        disabled={isResetting}
                        className="min-h-[38px] px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs flex-1 cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleResetEntireApp}
                        disabled={isResetting}
                        className="min-h-[38px] px-3 rounded-xl bg-[#be123c] hover:bg-[#9f1239] disabled:opacity-50 text-white font-bold text-xs flex-1 cursor-pointer transition-colors"
                      >
                        {isResetting ? 'Limpando...' : 'Confirmar Limpeza'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmResetPending(true)}
                    disabled={isResetting}
                    className="min-h-[40px] px-3 rounded-xl bg-[#be123c] hover:bg-[#9f1239] disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full shadow-2xs"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Limpar Dados Agora</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {!embedded && (
          <div className="px-5 sm:px-6 py-3 bg-[#edf2f7] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-700 font-medium">
              <Lock className="w-3.5 h-3.5 text-slate-700" />
              <span>Apenas Administradores Autorizados (@educacao.jundiai.sp.gov.br)</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs transition-colors cursor-pointer shadow-2xs"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
  );

  if (embedded) {
    return contentNode;
  }

  return (
    <ModalPortal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[110] overflow-hidden flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-backdrop-in"
      >
        {contentNode}
      </div>
    </ModalPortal>
  );
};
