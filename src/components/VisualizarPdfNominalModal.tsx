import React, { useState, useEffect } from 'react';
import { Student, DriveNominalPdfFile, ClassGroup } from '../types';
import {
  getStoredDiscoveredNominalPdfs,
  syncNominalPdfsFromDriveSubfolders,
  getAccessToken,
  googleSignIn,
} from '../services/googleSheetsApi';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, SCHOOL_NAME, CITY_NAME } from '../data/mockData';
import { StudentAvatar } from './StudentAvatar';

interface VisualizarPdfNominalModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  allClasses?: ClassGroup[];
  onUpdateAllClasses?: (updatedClasses: ClassGroup[]) => void;
  onSaveStudentPdfLink?: (studentId: string, pdfId: string, pdfUrl: string, subfolder?: string) => void;
}

export const VisualizarPdfNominalModal: React.FC<VisualizarPdfNominalModalProps> = ({
  isOpen,
  onClose,
  student,
  className,
  allClasses = [],
  onUpdateAllClasses,
  onSaveStudentPdfLink,
}) => {
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [manualDriveUrlInput, setManualDriveUrlInput] = useState('');
  const [showLinkConfig, setShowLinkConfig] = useState(false);
  const [copiedHyperlink, setCopiedHyperlink] = useState(false);
  const [discoveredPdfs, setDiscoveredPdfs] = useState<DriveNominalPdfFile[]>(() =>
    getStoredDiscoveredNominalPdfs()
  );
  const [activePdf, setActivePdf] = useState<{
    id: string;
    name: string;
    subfolderName: string;
    webViewLink: string;
    embedPreviewUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!student) {
      setActivePdf(null);
      return;
    }

    if (student.fichaPdfDriveId) {
      setActivePdf({
        id: student.fichaPdfDriveId,
        name: `${student.name}.pdf`,
        subfolderName: student.fichaPdfSubfolder || className,
        webViewLink:
          student.fichaPdfDriveUrl ||
          `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`,
        embedPreviewUrl: `https://drive.google.com/file/d/${student.fichaPdfDriveId}/preview`,
      });
      return;
    }

    // Try matching from cached discovered PDFs in localStorage
    const cached = getStoredDiscoveredNominalPdfs();
    setDiscoveredPdfs(cached);
    const cleanTarget = student.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();

    const matched = cached.find(
      (p) =>
        p.normalizedStudentName === cleanTarget ||
        (cleanTarget.length >= 6 &&
          (p.normalizedStudentName.startsWith(cleanTarget) ||
            cleanTarget.startsWith(p.normalizedStudentName)))
    );

    if (matched) {
      setActivePdf({
        id: matched.id,
        name: matched.name,
        subfolderName: matched.subfolderName,
        webViewLink: matched.webViewLink,
        embedPreviewUrl: matched.embedPreviewUrl,
      });
    } else {
      setActivePdf(null);
    }
  }, [student, className]);

  // If no PDF is linked yet and user has a Google token, auto-locate the student's PDF hyperlink silently
  useEffect(() => {
    let isMounted = true;
    const autoLocateStudentPdf = async () => {
      if (!isOpen || !student || activePdf) return;
      const token = await getAccessToken();
      if (!token) return;
      setIsSyncingDrive(true);
      try {
        const result = await syncNominalPdfsFromDriveSubfolders(allClasses);
        if (!isMounted) return;
        setDiscoveredPdfs(result.discoveredPdfs);
        if (onUpdateAllClasses && result.updatedClasses.length > 0) {
          onUpdateAllClasses(result.updatedClasses);
        }
        const cleanTarget = student.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim();
        const matched = result.discoveredPdfs.find(
          (p) =>
            p.normalizedStudentName === cleanTarget ||
            (cleanTarget.length >= 6 &&
              (p.normalizedStudentName.startsWith(cleanTarget) ||
                cleanTarget.startsWith(p.normalizedStudentName)))
        );
        if (matched) {
          setActivePdf({
            id: matched.id,
            name: matched.name,
            subfolderName: matched.subfolderName,
            webViewLink: matched.webViewLink,
            embedPreviewUrl: matched.embedPreviewUrl,
          });
          if (onSaveStudentPdfLink) {
            onSaveStudentPdfLink(
              student.id,
              matched.id,
              matched.webViewLink,
              matched.subfolderName
            );
          }
        }
      } catch {
        // silent fallback
      } finally {
        if (isMounted) setIsSyncingDrive(false);
      }
    };
    autoLocateStudentPdf();
    return () => {
      isMounted = false;
    };
  }, [isOpen, student?.id]);

  if (!isOpen || !student) return null;

  const handleSyncStudentDocHyperlinkNow = async () => {
    setIsSyncingDrive(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        const signInRes = await googleSignIn();
        token = signInRes?.accessToken || (await getAccessToken());
      }
      if (!token) {
        setIsSyncingDrive(false);
        return;
      }

      const result = await syncNominalPdfsFromDriveSubfolders(allClasses);
      setDiscoveredPdfs(result.discoveredPdfs);
      if (onUpdateAllClasses && result.updatedClasses.length > 0) {
        onUpdateAllClasses(result.updatedClasses);
      }

      const cleanTarget = student.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();

      const matched = result.discoveredPdfs.find(
        (p) =>
          p.normalizedStudentName === cleanTarget ||
          (cleanTarget.length >= 6 &&
            (p.normalizedStudentName.startsWith(cleanTarget) ||
              cleanTarget.startsWith(p.normalizedStudentName)))
      );

      if (matched) {
        setActivePdf({
          id: matched.id,
          name: matched.name,
          subfolderName: matched.subfolderName,
          webViewLink: matched.webViewLink,
          embedPreviewUrl: matched.embedPreviewUrl,
        });
        if (onSaveStudentPdfLink) {
          onSaveStudentPdfLink(
            student.id,
            matched.id,
            matched.webViewLink,
            matched.subfolderName
          );
        }
      }
    } catch (err) {
      console.warn('Erro ao localizar hyperlink do documento PDF:', err);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleApplyManualPdfLink = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manualDriveUrlInput.trim();
    if (!raw) return;

    const match =
      raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || raw.match(/id=([a-zA-Z0-9_-]+)/);
    const fileId = match && match[1] ? match[1] : raw;

    const nextPdf = {
      id: fileId,
      name: `${student.name}.pdf`,
      subfolderName: className,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      embedPreviewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
    };
    setActivePdf(nextPdf);
    if (onSaveStudentPdfLink) {
      onSaveStudentPdfLink(student.id, fileId, nextPdf.webViewLink, className);
    }
    setManualDriveUrlInput('');
    setShowLinkConfig(false);
  };

  const handleCopyDocHyperlink = (url: string) => {
    navigator.clipboard?.writeText(url);
    setCopiedHyperlink(true);
    setTimeout(() => setCopiedHyperlink(false), 2200);
  };

  const handlePrintOfficialSheet = () => {
    window.print();
  };

  const directDocHyperlink =
    activePdf?.webViewLink ||
    (student.fichaPdfDriveId
      ? `https://drive.google.com/file/d/${student.fichaPdfDriveId}/view`
      : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-3 lg:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl md:max-w-5xl lg:max-w-6xl xl:max-w-[1620px] h-[94vh] rounded-2xl shadow-2xl border-2 border-[#003440]/30 overflow-hidden flex flex-col">
        {/* Top Header Bar: Direct Hyperlink to the Nominal PDF Document (Never opens a folder) */}
        <div className="bg-[#003440] text-white px-4 py-3.5 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-[#ba1a1a] text-white flex items-center justify-center shrink-0 shadow-xs border border-white/25">
              <span className="material-symbols-outlined text-[28px]">picture_as_pdf</span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#a4f3ca] text-[#003723] font-black text-[0.74rem] uppercase tracking-wide">
                  Hyperlink Direto do Documento PDF Nominal
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-white font-bold text-[0.74rem]">
                  {activePdf?.subfolderName || className} • Nº {student.number.toString().padStart(2, '0')}
                </span>
              </div>
              <h2 className="text-[1.15rem] sm:text-[1.38rem] font-extrabold leading-tight truncate mt-1">
                {student.name}.pdf
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activePdf ? (
              <>
                <a
                  href={activePdf.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3.5 rounded-xl bg-[#a4f3ca] hover:bg-[#88d6af] text-[#002113] font-black text-[0.82rem] flex items-center gap-1.5 shadow-xs"
                  title="Abrir Hyperlink Direto do Documento PDF"
                >
                  <span className="material-symbols-outlined text-[18px]">link</span>
                  <span>Hyperlink do Doc PDF</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleCopyDocHyperlink(activePdf.webViewLink)}
                  className="min-h-[42px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-[0.78rem] flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {copiedHyperlink ? 'check' : 'content_copy'}
                  </span>
                  <span>{copiedHyperlink ? 'Hyperlink Copiado!' : 'Copiar Hyperlink'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSyncingDrive}
                onClick={handleSyncStudentDocHyperlinkNow}
                className="min-h-[42px] px-3.5 rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.8rem] flex items-center gap-1.5 border border-[#a4f3ca]/40 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">sync</span>
                <span>
                  {isSyncingDrive
                    ? 'Localizando Hyperlink do PDF...'
                    : 'Localizar Hyperlink do PDF Nominal'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowLinkConfig(!showLinkConfig)}
              className="min-h-[42px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-[0.78rem] flex items-center gap-1 cursor-pointer"
              title="Colar ou trocar o Hyperlink direto do documento PDF deste(a) estudante"
            >
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
              <span className="hidden sm:inline">Trocar Hyperlink</span>
            </button>

            <button
              type="button"
              onClick={handlePrintOfficialSheet}
              className="min-h-[42px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-[0.78rem] flex items-center gap-1 cursor-pointer"
              title="Imprimir ou Salvar Ficha Nominal em PDF"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span className="hidden md:inline">Imprimir / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
              aria-label="Fechar documento PDF"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>
        </div>

        {/* Direct Hyperlink Bar (Always shows the direct document hyperlink, never a folder link) */}
        <div className="bg-[#f4f7f5] px-4 py-2.5 border-b border-[#b4c0c4] flex flex-wrap items-center justify-between gap-2 text-[0.82rem] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="material-symbols-outlined text-[19px] text-[#ba1a1a] shrink-0">
              description
            </span>
            <span className="font-extrabold text-[#003440] shrink-0">
              Hyperlink do Documento:
            </span>
            {directDocHyperlink ? (
              <a
                href={directDocHyperlink}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[0.78rem] text-[#005035] hover:text-[#003440] underline font-bold truncate"
              >
                {activePdf?.name || `${student.name}.pdf`} — {directDocHyperlink}
              </a>
            ) : (
              <span className="font-semibold text-[#2c373a] truncate">
                Ficha Informativa Nominal Integrada ({student.name}.pdf) — Clique em "Trocar Hyperlink" se desejar colar um link específico
              </span>
            )}
          </div>

          {discoveredPdfs.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[0.75rem] font-extrabold text-[#003440]">
                Documento PDF:
              </span>
              <select
                value={activePdf?.id || ''}
                onChange={(e) => {
                  const found = discoveredPdfs.find((p) => p.id === e.target.value);
                  if (found) {
                    setActivePdf({
                      id: found.id,
                      name: found.name,
                      subfolderName: found.subfolderName,
                      webViewLink: found.webViewLink,
                      embedPreviewUrl: found.embedPreviewUrl,
                    });
                    if (onSaveStudentPdfLink) {
                      onSaveStudentPdfLink(
                        student.id,
                        found.id,
                        found.webViewLink,
                        found.subfolderName
                      );
                    }
                  }
                }}
                className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#a8b5b9] text-[0.76rem] font-bold text-[#003440] max-w-xs cursor-pointer"
              >
                <option value="">Selecionar documento nominal (.pdf)...</option>
                {discoveredPdfs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.subfolderName})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Optional Direct Document Hyperlink Input Bar */}
        {showLinkConfig && (
          <div className="bg-[#eaf6ef] px-4 py-3 border-b-2 border-[#005035]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
            <form onSubmit={handleApplyManualPdfLink} className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={manualDriveUrlInput}
                onChange={(e) => setManualDriveUrlInput(e.target.value)}
                placeholder="Cole aqui o Hyperlink direto do documento PDF deste(a) estudante (https://drive.google.com/file/d/.../view)"
                className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-white border-2 border-[#005035]/40 text-[0.84rem] font-semibold text-[#0f1614] focus:outline-none focus:border-[#003440]"
              />
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-black text-[0.82rem] cursor-pointer shrink-0"
              >
                Salvar Hyperlink do Doc
              </button>
            </form>
          </div>
        )}

        {/* Main PDF Document Viewer: Embedded Google Drive PDF Document OR Official Ficha Informativa Digital Document */}
        <div className="flex-1 bg-[#e7ece9] overflow-y-auto flex flex-col">
          {activePdf ? (
            <div className="flex-1 flex flex-col w-full h-full">
              <iframe
                src={activePdf.embedPreviewUrl}
                title={`Documento PDF Nominal - ${student.name}`}
                className="w-full flex-1 border-0 bg-white min-h-[560px]"
                allow="autoplay"
              />
            </div>
          ) : (
            <div className="flex-1 p-3 sm:p-6 overflow-y-auto space-y-5">
              {/* Official Printable/In-App "FICHA INFORMATIVA DO ESTUDANTE E AUTORIZAÇÕES" Document */}
              <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg border-2 border-[#003440]/35 p-5 sm:p-8 text-[#0f1614] space-y-5">
                {/* Official Jundiaí Header */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b-2 border-[#003440]">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={APP_LOGO_URL}
                      alt="Brasão de Jundiaí"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = APP_LOGO_FALLBACK_URL;
                      }}
                      className="w-15 h-15 object-contain"
                    />
                    <div>
                      <p className="text-[0.8rem] font-extrabold uppercase tracking-wider text-[#003440]">
                        {CITY_NAME} • Unidade de Gestão de Educação
                      </p>
                      <h3 className="text-[1.2rem] sm:text-[1.35rem] font-black text-[#003440] uppercase">
                        {SCHOOL_NAME}
                      </h3>
                      <p className="text-[0.88rem] font-black text-[#ba1a1a] uppercase mt-0.5">
                        DOCUMENTO NOMINAL — FICHA INFORMATIVA DO ESTUDANTE E AUTORIZAÇÕES
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-[#f4f7f5] p-3.5 rounded-xl border-2 border-[#a8b5b9]">
                    <StudentAvatar student={student} size="lg" />
                    <div className="text-right">
                      <span className="block text-[0.72rem] font-extrabold text-[#566366] uppercase">
                        Turma / Período
                      </span>
                      <span className="block text-[1.1rem] font-black text-[#003440]">
                        {className} ({student.periodo || 'REGULAR'})
                      </span>
                      <span className="block text-[0.78rem] font-mono font-bold text-[#005035]">
                        Nº Chamada: {student.number.toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 1: Identificação do(a) Estudante */}
                <div className="space-y-3">
                  <h4 className="text-[0.88rem] font-black uppercase tracking-wider bg-[#003440] text-white px-3.5 py-2 rounded-lg">
                    1. Identificação Nominal do(a) Estudante
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-[0.92rem]">
                    <div className="sm:col-span-8 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Nome Oficial do(a) Estudante:
                      </span>
                      <span className="text-[1.12rem] font-black text-[#003440]">
                        {student.name}
                      </span>
                    </div>

                    <div className="sm:col-span-4 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Data de Nascimento / Idade:
                      </span>
                      <span className="font-black text-[#0f1614] text-[1rem]">
                        {student.dataNascimento || '—'}{' '}
                        {student.idade ? `(${student.idade})` : ''}
                      </span>
                    </div>

                    <div className="sm:col-span-4 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        RA / UF:
                      </span>
                      <span className="font-mono font-bold text-[#003440] text-[0.98rem]">
                        {student.ra || '—'}-{student.digRa || ''}/{student.ufRa || 'SP'}
                      </span>
                    </div>

                    <div className="sm:col-span-4 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Cadastro SUS (Cartão Postinho):
                      </span>
                      <span className="font-mono font-bold text-[#005035] text-[0.96rem]">
                        {student.cartaoSus || 'Cadastrado no prontuário'}
                      </span>
                    </div>

                    <div className="sm:col-span-4 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        CPF / RG:
                      </span>
                      <span className="font-mono font-bold text-[#0f1614] text-[0.94rem]">
                        {student.cpf || '—'} {student.rg ? `/ RG: ${student.rg}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Endereço e Contatos de Emergência */}
                <div className="space-y-3">
                  <h4 className="text-[0.88rem] font-black uppercase tracking-wider bg-[#003440] text-white px-3.5 py-2 rounded-lg">
                    2. Endereço Residencial, Filiação e Telefones para Recado / Emergência
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-[0.92rem]">
                    <div className="sm:col-span-8 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Endereço Completo (Logradouro / Nº / Complemento):
                      </span>
                      <span className="font-black text-[#0f1614] text-[1rem]">
                        {student.logradouro || '—'}, Nº {student.numeroResidencia || 'S/N'}{' '}
                        {student.complemento ? `(${student.complemento})` : ''}
                      </span>
                    </div>

                    <div className="sm:col-span-4 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Bairro / CEP / Cidade:
                      </span>
                      <span className="font-bold text-[#0f1614]">
                        {student.bairro || '—'} • CEP {student.cep || '—'}
                      </span>
                    </div>

                    <div className="sm:col-span-6 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Filiação 1 (Mãe / Responsável Legal):
                      </span>
                      <span className="font-black text-[#003440] text-[1rem]">
                        {student.filiacao1 || student.guardianName || '—'}
                      </span>
                    </div>

                    <div className="sm:col-span-6 p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Filiação 2 (Pai / Responsável Legal):
                      </span>
                      <span className="font-black text-[#003440] text-[1rem]">
                        {student.filiacao2 || '—'}
                      </span>
                    </div>

                    <div className="sm:col-span-12 p-3.5 bg-[#eaf6ef] rounded-xl border-2 border-[#005035]/35">
                      <span className="text-[0.74rem] font-extrabold text-[#005035] uppercase block">
                        Telefones de Contato / Emergência:
                      </span>
                      <span className="text-[1.12rem] font-mono font-bold text-[#003723]">
                        {student.telefones || student.guardianPhone || '(11) 98765-4321'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Saúde, Deficiência, Raça/Cor e Transporte */}
                <div className="space-y-3">
                  <h4 className="text-[0.88rem] font-black uppercase tracking-wider bg-[#003440] text-white px-3.5 py-2 rounded-lg">
                    3. Informações de Saúde, Inclusão e Dados Complementares
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[0.9rem]">
                    <div className="p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Tipo Sanguíneo / Raça-Cor:
                      </span>
                      <span className="font-black text-[#0f1614]">
                        Sangue: {student.tipoSanguineo || '—'} • Raça/Cor: {student.racaCor || '—'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Deficiência / AEE:
                      </span>
                      <span className="font-black text-[#005035]">
                        {student.deficiencia || 'Não declarada'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#f9faf8] rounded-xl border border-[#a8b5b9]">
                      <span className="text-[0.72rem] font-extrabold text-[#566366] uppercase block">
                        Irmãos na EMEB / Prontuário:
                      </span>
                      <span className="font-bold text-[#0f1614]">
                        {student.irmaos || 'Não consta'}{' '}
                        {student.arquivo ? `(Prontuário Nº ${student.arquivo})` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
