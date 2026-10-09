import React, { useState, useEffect, useRef } from 'react';
import { Student, UserRole } from '../types';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentAttendanceMetrics } from '../utils/attendanceRules';
import { getStudentCumulativeOccurrences } from '../services/pushNotificationService';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import {
  findPhotoInDiscoveredCache,
  toEmbeddableDrivePhotoUrl,
  getAccessToken,
  uploadStudentPhotoToDrive,
} from '../services/googleSheetsApi';

interface GradeDadosCriancaModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  classStudents?: Student[];
  onSelectStudent?: (student: Student) => void;
  className: string;
  diasLetivosMes: number;
  userRole: UserRole;
  canEdit: boolean;
  onSaveStudent: (updatedStudent: Student) => void;
  onOpenPhotoModal?: (student: Student) => void;
  onOpenStudentPdf?: (student: Student) => void;
}

type GridCategory = 'todos' | 'escolar' | 'pessoal' | 'familia' | 'endereco';

interface SedFieldDef {
  key: keyof Student;
  label: string;
  category: GridCategory;
  placeholder?: string;
}

function isConsecutiveDaysBadgeLabel(
  consecutiveDays: number,
  totalOccurrences: number
): string {
  if (consecutiveDays >= 5) {
    return `Risco Crítico · ${consecutiveDays} faltas seguidas`;
  }
  if (consecutiveDays >= 3) {
    return `Em Alerta · ${consecutiveDays} faltas seguidas${
      totalOccurrences > 1 ? ` (${totalOccurrences}ª seq.)` : ''
    }`;
  }
  return '0 faltas seguidas';
}

const SED_GRID_FIELDS: SedFieldDef[] = [
  // Escolar & Matrícula
  { key: 'tipoEnsino', label: '1. TIPO DE ENSINO', category: 'escolar', placeholder: 'EDUCACAO INFANTIL / ENSINO FUNDAMENTAL' },
  { key: 'serie', label: '2. SÉRIE', category: 'escolar', placeholder: '1, 2, 3, 4, 5' },
  { key: 'numeroChamada', label: '3. Nº CHAMADA', category: 'escolar', placeholder: '1' },
  { key: 'estudante', label: '4. ESTUDANTE (NOME OFICIAL)', category: 'escolar' },
  { key: 'ra', label: '5. RA (REGISTRO DO ESTUDANTE)', category: 'escolar' },
  { key: 'digRa', label: '6. DIG. RA', category: 'escolar' },
  { key: 'ufRa', label: '7. UF RA', category: 'escolar', placeholder: 'SP' },
  { key: 'tipoAlocacao', label: '9. TIPO ALOCAÇÃO', category: 'escolar', placeholder: 'REGULAR' },
  { key: 'situacao', label: '10. SITUAÇÃO MATRÍCULA', category: 'escolar', placeholder: 'ATIVO / BXTR' },
  { key: 'dataMovimentacao', label: '11. DATA MOVIMENTAÇÃO (SAÍDA)', category: 'escolar', placeholder: 'DD/MM/AAAA' },
  { key: 'categoriaProfissionalCenso', label: '12. CATEGORIA PROFISSIONAL CENSO', category: 'escolar' },
  { key: 'posDataCenso', label: '14. PÓS DATA CENSO', category: 'escolar', placeholder: 'NÃO / SIM' },
  { key: 'turma', label: '15. TURMA', category: 'escolar' },
  { key: 'periodo', label: '16. PERÍODO', category: 'escolar', placeholder: 'MANHÃ / TARDE' },
  { key: 'dataMatriculaSed', label: '17. DATA DE MATRÍCULA (SED)', category: 'escolar', placeholder: 'DD/MM/AAAA' },
  { key: 'procedenciaEscolar', label: '18. PROCEDÊNCIA ESCOLAR', category: 'escolar' },
  { key: 'irmaos', label: '19. IRMÃOS NA ESCOLA', category: 'escolar' },
  { key: 'arquivo', label: '21. ARQUIVO PASSIVO / PASTA', category: 'escolar' },
  { key: 'sucessaoEscolar', label: '48. SUCESSÃO ESCOLAR', category: 'escolar' },

  // Pessoal & Saúde
  { key: 'dataNascimento', label: '8. DATA DE NASCIMENTO', category: 'pessoal', placeholder: 'DD/MM/AAAA' },
  { key: 'deficiencia', label: '13. DEFICIÊNCIA / AEE', category: 'pessoal', placeholder: 'Ex: AUTISTA INFANTIL' },
  { key: 'idade', label: '20. IDADE', category: 'pessoal' },
  { key: 'nomeSocial', label: '24. NOME SOCIAL', category: 'pessoal' },
  { key: 'genero', label: '25. GÊNERO', category: 'pessoal', placeholder: 'FEMININO / MASCULINO' },
  { key: 'tipoSanguineo', label: '26. TIPO SANGUÍNEO', category: 'pessoal', placeholder: 'O+, A+, B+, AB+...' },
  { key: 'racaCor', label: '27. RAÇA/COR', category: 'pessoal', placeholder: 'BRANCA, PARDA, PRETA...' },
  { key: 'nacionalidade', label: '28. NACIONALIDADE', category: 'pessoal', placeholder: 'BRASILEIRA' },
  { key: 'paisOrigem', label: '29. PAÍS DE ORIGEM', category: 'pessoal', placeholder: 'BRASIL' },
  { key: 'municipioNascimento', label: '30. MUNICÍPIO DE NASCIMENTO', category: 'pessoal', placeholder: 'JUNDIAI - SP' },
  { key: 'cpf', label: '31. CPF', category: 'pessoal', placeholder: '000.000.000-00' },
  { key: 'rg', label: '32. RG', category: 'pessoal' },
  { key: 'dataEmissaoRg', label: '33. DATA EMISSÃO RG', category: 'pessoal' },
  { key: 'cartaoSus', label: '34. CARTÃO SUS (CNS)', category: 'pessoal' },
  { key: 'nis', label: '35. NIS (AUXÍLIO / BOLSA)', category: 'pessoal' },

  // Família & Contatos
  { key: 'filiacao1', label: '22. FILIAÇÃO 1 (MÃE / RESP.)', category: 'familia' },
  { key: 'filiacao2', label: '23. FILIAÇÃO 2 (PAI / RESP.)', category: 'familia' },
  { key: 'telefones', label: '43. TELEFONES DE CONTATO', category: 'familia', placeholder: '(11) 90000-0000' },
  { key: 'emailGoogle', label: '44. E-MAIL GOOGLE', category: 'familia' },
  { key: 'emailMicrosoft', label: '45. E-MAIL MICROSOFT', category: 'familia' },
  { key: 'emailMunicipal', label: '46. E-MAIL MUNICIPAL (ESTUDANTE)', category: 'familia' },

  // Endereço & Transporte
  { key: 'cep', label: '36. CEP', category: 'endereco', placeholder: '13.214-000' },
  { key: 'logradouro', label: '37. LOGRADOURO (RUA / AV.)', category: 'endereco' },
  { key: 'numeroResidencia', label: '38. N. RESIDÊNCIA', category: 'endereco' },
  { key: 'complemento', label: '39. COMPLEMENTO', category: 'endereco' },
  { key: 'bairro', label: '40. BAIRRO', category: 'endereco' },
  { key: 'cidade', label: '41. CIDADE', category: 'endereco', placeholder: 'JUNDIAI' },
  { key: 'uf', label: '42. UF', category: 'endereco', placeholder: 'SP' },
  { key: 'rotaOnibus', label: '47. ROTA DE ÔNIBUS ESCOLAR', category: 'endereco', placeholder: 'Ex: ROTA 04 - JARDIM BÚFALO' },
];

export const GradeDadosCriancaModal: React.FC<GradeDadosCriancaModalProps> = ({
  isOpen,
  onClose,
  student,
  classStudents = [],
  onSelectStudent,
  className,
  diasLetivosMes,
  userRole,
  canEdit,
  onSaveStudent,
  onOpenPhotoModal,
  onOpenStudentPdf,
}) => {
  const [draft, setDraft] = useState<Student | null>(student);
  const [activeCategory, setActiveCategory] = useState<GridCategory>('todos');
  const [searchField, setSearchField] = useState('');
  const [editingKey, setEditingKey] = useState<keyof Student | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const [showAllSedFields, setShowAllSedFields] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [portraitFallbackIdx, setPortraitFallbackIdx] = useState(0);
  const [portraitImgError, setPortraitImgError] = useState(false);
  const internalPhotoInputRef = useRef<HTMLInputElement>(null);

  const handleInternalPhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !draft) return;

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        let finalDataUrl = rawDataUrl;
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
            finalDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          }
        } catch {
          // fallback to original dataUrl
        }

        const updated: Student = {
          ...draft,
          photo: finalDataUrl,
        };
        setPortraitFallbackIdx(0);
        setPortraitImgError(false);
        setDraft(updated);
        onSaveStudent(updated);
        setSavedBanner(true);
        setTimeout(() => setSavedBanner(false), 2500);

        // Sincroniza silenciosamente em segundo plano se já houver sessão ativa
        getAccessToken()
          .then((token) => {
            if (token) {
              return uploadStudentPhotoToDrive(updated, className, finalDataUrl);
            }
            return null;
          })
          .then((uploaded) => {
            if (uploaded?.webViewLink) {
              onSaveStudent({
                ...updated,
                photoDriveUrl: uploaded.webViewLink,
              });
            }
          })
          .catch(() => {});
      };
      img.onerror = () => {
        const updated: Student = { ...draft, photo: rawDataUrl };
        setDraft(updated);
        onSaveStudent(updated);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const orderedList = React.useMemo(
    () => [...classStudents].sort((a, b) => a.number - b.number),
    [classStudents]
  );

  const currentStudentIdx = React.useMemo(() => {
    if (!draft || orderedList.length === 0) return -1;
    return orderedList.findIndex((s) => s.id === draft.id);
  }, [draft, orderedList]);

  const prevStudent =
    currentStudentIdx > 0 ? orderedList[currentStudentIdx - 1] : null;
  const nextStudent =
    currentStudentIdx >= 0 && currentStudentIdx < orderedList.length - 1
      ? orderedList[currentStudentIdx + 1]
      : null;

  useEffect(() => {
    setDraft(student);
    setEditingKey(null);
    setSavedBanner(false);
    setShowAllSedFields(false);
    setIsLightboxOpen(false);
    setPortraitFallbackIdx(0);
    setPortraitImgError(false);
  }, [student]);

  useEffect(() => {
    if (!isOpen || !onSelectStudent || editingKey !== null || isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && prevStudent) {
        e.preventDefault();
        onSelectStudent(prevStudent);
      } else if (e.key === 'ArrowRight' && nextStudent) {
        e.preventDefault();
        onSelectStudent(nextStudent);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onSelectStudent, prevStudent, nextStudent, editingKey, isLightboxOpen]);

  if (!isOpen || !draft) return null;

  const metrics = getStudentAttendanceMetrics(draft, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
  const cachedDriveHit = findPhotoInDiscoveredCache(
    draft.estudante || draft.name,
    draft.ra,
    draft.turma
  );
  const rawPhotoCandidate = (
    draft.photo ||
    (draft.photoDriveUrl ? toEmbeddableDrivePhotoUrl(draft.photoDriveUrl) : '') ||
    cachedDriveHit?.photoUrl ||
    (cachedDriveHit?.driveLink
      ? toEmbeddableDrivePhotoUrl(cachedDriveHit.driveLink)
      : '') ||
    ''
  ).trim();

  const extractDriveFileId = (url: string): string => {
    if (!url || url.startsWith('data:image/')) return '';
    const m0 = url.match(/\/api\/drive-photo\/([a-zA-Z0-9-_]+)/);
    if (m0 && m0[1]) return m0[1];
    const m1 = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (m1 && m1[1]) return m1[1];
    const m2 = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (m2 && m2[1]) return m2[1];
    const m3 = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9-_]+)/);
    if (m3 && m3[1]) return m3[1];
    return '';
  };

  const portraitDriveId =
    extractDriveFileId(rawPhotoCandidate) ||
    extractDriveFileId(draft.photoDriveUrl || '') ||
    extractDriveFileId(cachedDriveHit?.driveLink || '');
  const portraitCandidates = (() => {
    if (!rawPhotoCandidate && !portraitDriveId) return [];
    if (rawPhotoCandidate.startsWith('data:image/') || rawPhotoCandidate.startsWith('blob:')) {
      return [rawPhotoCandidate];
    }
    if (portraitDriveId) {
      return [
        `/api/drive-photo/${portraitDriveId}`,
        `https://drive.google.com/thumbnail?id=${portraitDriveId}&sz=w500`,
        `https://lh3.googleusercontent.com/d/${portraitDriveId}=w500`,
        `https://drive.google.com/uc?export=view&id=${portraitDriveId}`,
      ];
    }
    if (rawPhotoCandidate.startsWith('http://') || rawPhotoCandidate.startsWith('https://')) {
      return [rawPhotoCandidate];
    }
    return [];
  })();

  const effectivePhotoUrl = portraitCandidates[portraitFallbackIdx] || '';
  const hasPhoto = Boolean(effectivePhotoUrl.length > 0 && !portraitImgError);

  const handlePortraitImgError = () => {
    if (portraitFallbackIdx + 1 < portraitCandidates.length) {
      setPortraitFallbackIdx((prev) => prev + 1);
    } else {
      setPortraitImgError(true);
    }
  };
  const hasPdf = Boolean(
    (draft.fichaPdfDriveUrl && draft.fichaPdfDriveUrl.trim().length > 0) ||
      (draft.fichaPdfDriveId && draft.fichaPdfDriveId.trim().length > 0)
  );

  // Contagem atual de faltas consecutivas do aluno (sequência mais recente e acumulado no ano)
  const cumulativeOccurrences = getStudentCumulativeOccurrences(draft);
  const latestConsecutiveOccurrence =
    cumulativeOccurrences.length > 0
      ? cumulativeOccurrences[cumulativeOccurrences.length - 1]
      : null;
  const currentConsecutiveDaysCount = latestConsecutiveOccurrence
    ? latestConsecutiveOccurrence.selectedDates.length
    : 0;
  const totalUniqueConsecutiveDaysYear = Array.from(
    new Set(cumulativeOccurrences.flatMap((o) => o.selectedDates))
  ).length;
  const isConsecutiveRisk = currentConsecutiveDaysCount >= 3;

  const handleFieldChange = (key: keyof Student, value: string) => {
    if (!canEdit) return;
    const updated: Student = {
      ...draft,
      [key]: key === 'numeroChamada' ? Number(value) || draft.number : value,
    };
    if (key === 'estudante') {
      updated.name = value;
    }
    if (key === 'filiacao1') {
      updated.guardianName = value;
    }
    if (key === 'telefones') {
      updated.guardianPhone = value;
    }
    setDraft(updated);
  };

  const handleSaveAll = () => {
    if (!canEdit) return;
    onSaveStudent(draft);
    setSavedBanner(true);
    setEditingKey(null);
    setTimeout(() => {
      setSavedBanner(false);
    }, 2500);
  };

  const filteredFields = SED_GRID_FIELDS.filter((f) => {
    const matchesCat = activeCategory === 'todos' || f.category === activeCategory;
    const valStr = String(draft[f.key] ?? '').toLowerCase();
    const matchesSearch =
      searchField.trim() === '' ||
      f.label.toLowerCase().includes(searchField.toLowerCase()) ||
      valStr.includes(searchField.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const whatsappLinks = buildWhatsAppLinksFromPhoneString(
    draft.telefones || draft.guardianPhone,
    draft.name
  );

  const fullAddress = [
    draft.logradouro,
    draft.numeroResidencia ? `nº ${draft.numeroResidencia}` : '',
    draft.complemento,
    draft.bairro ? `— ${draft.bairro}` : '',
    draft.cidade ? `${draft.cidade}/${draft.uf || 'SP'}` : '',
    draft.cep ? `· CEP ${draft.cep}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-black/65 backdrop-blur-md animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#f5f5f7] w-full max-w-4xl lg:max-w-5xl rounded-[32px] shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Top Minimalist Apple Bar + Navegação Anterior / Próximo Estudante */}
        <div className="px-5 sm:px-7 py-3.5 bg-white/95 backdrop-blur-md border-b border-black/[0.05] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-3 py-1 rounded-xl bg-[#1d1d1f] text-white font-extrabold text-[0.78rem] tabular-nums">
              Chamada Nº {draft.number.toString().padStart(2, '0')}
            </span>
            <span className="px-3 py-1 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] font-bold text-[0.78rem] truncate">
              {className}
            </span>
            {orderedList.length > 1 && currentStudentIdx >= 0 && (
              <span className="hidden sm:inline-block text-[0.72rem] font-semibold text-[#86868b] tabular-nums">
                ({currentStudentIdx + 1} de {orderedList.length})
              </span>
            )}
            {savedBanner && (
              <span className="px-2.5 py-1 rounded-xl bg-[#eaf6ef] text-[#005035] text-[0.74rem] font-bold">
                ✓ Atualizado
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onSelectStudent && orderedList.length > 1 && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  type="button"
                  disabled={!prevStudent}
                  onClick={() => prevStudent && onSelectStudent(prevStudent)}
                  title={
                    prevStudent
                      ? `Anterior: Nº ${prevStudent.number.toString().padStart(2, '0')} ${prevStudent.name} (Seta ←)`
                      : 'Primeiro estudante da turma'
                  }
                  className="h-9 px-3 rounded-full bg-[#f5f5f7] hover:bg-[#1d1d1f] text-[#1d1d1f] hover:text-white font-bold text-[0.75rem] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-30 disabled:pointer-events-none tabular-nums"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    arrow_back
                  </span>
                  <span className="hidden md:inline">
                    {prevStudent
                      ? `Nº ${prevStudent.number.toString().padStart(2, '0')}`
                      : 'Anterior'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!nextStudent}
                  onClick={() => nextStudent && onSelectStudent(nextStudent)}
                  title={
                    nextStudent
                      ? `Próximo: Nº ${nextStudent.number.toString().padStart(2, '0')} ${nextStudent.name} (Seta →)`
                      : 'Último estudante da turma'
                  }
                  className="h-9 px-3 rounded-full bg-[#f5f5f7] hover:bg-[#1d1d1f] text-[#1d1d1f] hover:text-white font-bold text-[0.75rem] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-30 disabled:pointer-events-none tabular-nums"
                >
                  <span className="hidden md:inline">
                    {nextStudent
                      ? `Nº ${nextStudent.number.toString().padStart(2, '0')}`
                      : 'Próximo'}
                  </span>
                  <span className="material-symbols-outlined text-[16px]">
                    arrow_forward
                  </span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-full bg-[#f5f5f7] hover:bg-[#ff3b30] text-[#1d1d1f] hover:text-white font-bold text-[0.78rem] flex items-center gap-1 cursor-pointer transition-colors shrink-0"
              aria-label="Fechar perfil do estudante"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
              <span>Fechar</span>
            </button>
          </div>
        </div>

        {/* Main Organic & Visual Profile Layout */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-7 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* COLUNA ESQUERDA (5 cols): RETRATO GIGANTE DO ESTUDANTE */}
            <div className="md:col-span-5 flex flex-col">
              <input
                ref={internalPhotoInputRef}
                type="file"
                accept="image/*"
                onChange={handleInternalPhotoSelected}
                className="hidden"
              />
              <div
                onClick={() => {
                  if (hasPhoto) setIsLightboxOpen(true);
                  else internalPhotoInputRef.current?.click();
                }}
                className="relative w-full flex-1 min-h-[320px] sm:min-h-[380px] rounded-[28px] overflow-hidden bg-gradient-to-br from-[#1d1d1f] to-[#2c2c2e] shadow-md border border-black/[0.06] flex items-center justify-center group cursor-pointer"
              >
                {hasPhoto ? (
                  <>
                    <img
                      src={effectivePhotoUrl}
                      alt={draft.name}
                      onError={handlePortraitImgError}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/35 to-transparent flex items-center justify-between text-white">
                      <span className="text-[0.75rem] font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[17px]">fullscreen</span>
                        Ampliar foto
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          internalPhotoInputRef.current?.click();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/35 backdrop-blur-md text-white text-[0.73rem] font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">photo_camera</span>
                        Trocar Foto
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-white">
                    <span className="text-[4.8rem] font-extrabold tracking-tight leading-none opacity-90 select-none">
                      {draft.initials}
                    </span>
                    <span className="mt-3 text-[0.82rem] text-white/75 font-medium">
                      Estudante sem foto cadastrada
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        internalPhotoInputRef.current?.click();
                      }}
                      className="mt-5 px-4 py-2.5 rounded-2xl bg-white text-[#1d1d1f] hover:bg-[#f5f5f7] font-bold text-[0.8rem] flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
                      <span>Subir Foto do Dispositivo</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA DIREITA (7 cols): COMPOSIÇÃO ORGÂNICA E VISUAL */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-4">
              {/* 1. Identidade Principal + Pílulas Numéricas Ultra-Legíveis (Manrope Tabular) */}
              <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#eaf6ef] text-[#005035] font-bold text-[0.7rem] uppercase tracking-wider">
                      {draft.situacao || 'MATRÍCULA ATIVA'}
                    </span>
                    {draft.deficiencia && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#f5f3ff] text-[#5b21b6] font-bold text-[0.72rem]">
                        AEE · {draft.deficiencia}
                      </span>
                    )}
                  </div>

                  {/* Badge Visual de Risco / Faltas Consecutivas Imediatamente Visível no Topo do Card */}
                  <span
                    className={`px-3 py-1 rounded-full font-extrabold text-[0.72rem] tabular-nums flex items-center gap-1.5 ${
                      currentConsecutiveDaysCount >= 5
                        ? 'bg-[#ff3b30] text-white shadow-2xs'
                        : isConsecutiveRisk
                        ? 'bg-[#ff9500]/15 text-[#c93400] border border-[#ff9500]/35'
                        : 'bg-[#f5f5f7] text-[#6e6e73]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {isConsecutiveRisk ? 'warning' : 'verified'}
                    </span>
                    <span>
                      {isConsecutiveDaysBadgeLabel(
                        currentConsecutiveDaysCount,
                        cumulativeOccurrences.length
                      )}
                    </span>
                  </span>
                </div>

                <h1 className="text-[1.45rem] sm:text-[1.7rem] font-extrabold text-[#1d1d1f] tracking-tight leading-tight">
                  {draft.name}
                </h1>

                {/* Cartões Visuais de Números-Chave (RA, Nascimento, Frequência e Faltas Seguidas) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="rounded-2xl bg-[#f5f5f7] p-3">
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#86868b] block">
                      Registro (RA)
                    </span>
                    <span className="text-[0.95rem] sm:text-[1.02rem] font-extrabold text-[#1d1d1f] tabular-nums block mt-0.5">
                      {draft.ra ? `${draft.ra}-${draft.digRa}` : '—'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-[#f5f5f7] p-3">
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#86868b] block">
                      Nascimento
                    </span>
                    <span className="text-[0.95rem] sm:text-[1.02rem] font-extrabold text-[#1d1d1f] tabular-nums block mt-0.5">
                      {draft.dataNascimento || '—'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-[#f5f5f7] p-3">
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#86868b] block">
                      Frequência Mês
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-[0.98rem] sm:text-[1.05rem] font-extrabold text-[#005035] tabular-nums">
                        {metrics.frequenciaPercent}%
                      </span>
                      <span className="text-[0.7rem] font-semibold text-[#6e6e73] tabular-nums">
                        ({metrics.faltas}f)
                      </span>
                    </div>
                  </div>

                  {/* Card Dedicado de Faltas Consecutivas (Risco de Busca Ativa) */}
                  <div
                    className={`rounded-2xl p-3 border ${
                      currentConsecutiveDaysCount >= 5
                        ? 'bg-[#fff2f2] border-[#ff3b30]/35'
                        : isConsecutiveRisk
                        ? 'bg-[#fff9eb] border-[#ff9500]/35'
                        : 'bg-[#f5f5f7] border-transparent'
                    }`}
                  >
                    <span
                      className={`text-[0.65rem] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        currentConsecutiveDaysCount >= 5
                          ? 'text-[#ff3b30]'
                          : isConsecutiveRisk
                          ? 'text-[#c93400]'
                          : 'text-[#86868b]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {isConsecutiveRisk ? 'notification_important' : 'event_available'}
                      </span>
                      <span>Faltas Seguidas</span>
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span
                        className={`text-[0.98rem] sm:text-[1.05rem] font-extrabold tabular-nums ${
                          currentConsecutiveDaysCount >= 5
                            ? 'text-[#ff3b30]'
                            : isConsecutiveRisk
                            ? 'text-[#c93400]'
                            : 'text-[#1d1d1f]'
                        }`}
                      >
                        {currentConsecutiveDaysCount}d
                      </span>
                      <span className="text-[0.68rem] font-semibold text-[#6e6e73] tabular-nums truncate">
                        {totalUniqueConsecutiveDaysYear > currentConsecutiveDaysCount
                          ? `(${totalUniqueConsecutiveDaysYear}d ano)`
                          : isConsecutiveRisk
                          ? 'em alerta'
                          : 'sem risco'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Alerta Contextual de Datas Faltosas e Retorno da Família se houver Faltas Seguidas */}
                {isConsecutiveRisk && latestConsecutiveOccurrence && (
                  <div
                    className={`rounded-2xl p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[0.76rem] ${
                      latestConsecutiveOccurrence.familyFeedback
                        ? 'bg-[#eaf6ef]/70 border-[#28cd41]/30 text-[#1d1d1f]'
                        : 'bg-[#fff2f2] border-[#ff3b30]/25 text-[#1d1d1f]'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${
                          latestConsecutiveOccurrence.familyFeedback
                            ? 'text-[#1d8338]'
                            : 'text-[#ff3b30]'
                        }`}
                      >
                        {latestConsecutiveOccurrence.familyFeedback
                          ? 'mark_chat_read'
                          : 'rule'}
                      </span>
                      <div className="min-w-0">
                        <span className="font-bold block">
                          Datas seguidas ({latestConsecutiveOccurrence.sequenceNumber}ª ocorrência):{' '}
                          <span className="tabular-nums font-extrabold">
                            {latestConsecutiveOccurrence.selectedDates.join(', ')}
                          </span>
                        </span>
                        <span className="text-[0.72rem] text-[#6e6e73] block mt-0.5">
                          {latestConsecutiveOccurrence.familyFeedback
                            ? `Retorno da família: "${latestConsecutiveOccurrence.familyFeedback}"`
                            : 'Aguardando retorno / justificativa da família na Busca Ativa.'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. BOTÃO DE DESTAQUE MODERNO: ABRIR PDF DA FICHA INFORMATIVA */}
              {onOpenStudentPdf && (
                <button
                  type="button"
                  onClick={() => onOpenStudentPdf(draft)}
                  className={`w-full p-4 rounded-[24px] border text-left flex items-center justify-between gap-3.5 transition-all cursor-pointer shadow-xs active:scale-[0.99] ${
                    hasPdf
                      ? 'bg-[#0071e3] hover:bg-[#005bb5] border-[#0071e3] text-white'
                      : 'bg-[#fff2f2] hover:bg-[#ffe5e5] border-[#ff3b30]/35 text-[#1d1d1f]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        hasPdf ? 'bg-white/20 text-white' : 'bg-[#ff3b30] text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[26px]">
                        {hasPdf ? 'picture_as_pdf' : 'notification_important'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span
                        className={`text-[0.68rem] font-bold uppercase tracking-wider block ${
                          hasPdf ? 'text-white/85' : 'text-[#ff3b30]'
                        }`}
                      >
                        {hasPdf
                          ? 'Ficha Informativa Escaneada · Google Drive'
                          : 'Documento Pendente na Pasta da Turma'}
                      </span>
                      <span className="text-[1.02rem] sm:text-[1.1rem] font-extrabold block truncate mt-0.5">
                        {hasPdf
                          ? 'Abrir PDF da Ficha Informativa'
                          : 'Sem Ficha PDF · Solicitar à Família'}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`px-4 py-2 rounded-xl font-bold text-[0.8rem] flex items-center gap-1.5 shrink-0 ${
                      hasPdf ? 'bg-white text-[#0071e3]' : 'bg-[#ff3b30] text-white'
                    }`}
                  >
                    <span>{hasPdf ? 'Abrir PDF' : 'Ver Aviso'}</span>
                    <span className="material-symbols-outlined text-[17px]">open_in_new</span>
                  </div>
                </button>
              )}

              {/* 3. Cartão Orgânico da Família, WhatsApp e Endereço */}
              <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-2xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#f5f5f7] text-[#6e6e73] flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[18px]">person</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
                        Mãe / Filiação 1
                      </span>
                      <p className="text-[0.9rem] font-bold text-[#1d1d1f] leading-snug mt-0.5">
                        {draft.filiacao1 || draft.guardianName || 'Não informado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#f5f5f7] text-[#6e6e73] flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[18px]">person</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
                        Pai / Filiação 2
                      </span>
                      <p className="text-[0.9rem] font-bold text-[#1d1d1f] leading-snug mt-0.5">
                        {draft.filiacao2 || 'Não informado'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Linha de Telefones com Botões Diretos de WhatsApp */}
                <div className="pt-3 border-t border-black/[0.05] flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#25D366]/15 text-[#128C7E] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">call</span>
                    </div>
                    <div>
                      <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
                        Contato Rápido (WhatsApp)
                      </span>
                      <span className="text-[0.9rem] font-bold text-[#1d1d1f] tabular-nums">
                        {draft.telefones || draft.guardianPhone || 'Sem telefone cadastrado'}
                      </span>
                    </div>
                  </div>

                  {whatsappLinks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {whatsappLinks.map((ph, idx) => (
                        <a
                          key={idx}
                          href={ph.waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-[0.78rem] tabular-nums flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-[16px]">chat</span>
                          <span>Chamar {ph.display}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Endereço e Rota de Ônibus */}
                {(fullAddress || draft.rotaOnibus) && (
                  <div className="pt-3 border-t border-black/[0.05] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-[#f5f5f7] text-[#6e6e73] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px]">location_on</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
                          Endereço Residencial
                        </span>
                        <p className="text-[0.83rem] font-semibold text-[#1d1d1f] leading-snug mt-0.5">
                          {fullAddress || '—'}
                        </p>
                      </div>
                    </div>

                    {draft.rotaOnibus && (
                      <span className="px-3 py-1 rounded-xl bg-[#f0f9ff] text-[#0369a1] font-bold text-[0.74rem] tabular-nums shrink-0">
                        🚌 {draft.rotaOnibus}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Ação Discreta para Expandir os 48 Campos SED */}
              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowAllSedFields((prev) => !prev)}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#e8e8ed] text-[#6e6e73] hover:text-[#1d1d1f] border border-black/[0.05] font-semibold text-[0.76rem] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showAllSedFields ? 'expand_less' : 'expand_more'}
                  </span>
                  <span>
                    {showAllSedFields
                      ? 'Ocultar Ficha Cadastral Completa (48 campos SED)'
                      : 'Expandir Ficha Cadastral Completa (48 campos SED)'}
                  </span>
                </button>

                {canEdit && showAllSedFields && (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    className="px-4 py-2 rounded-xl bg-[#0071e3] hover:bg-[#005bb5] text-white font-bold text-[0.8rem] flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[17px]">save</span>
                    <span>Salvar Alterações</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SEÇÃO EXPANSÍVEL OPCIONAL: GRADE DE 48 CAMPOS SED */}
          {showAllSedFields && (
            <section className="bg-white rounded-[24px] p-5 shadow-2xs border border-black/[0.06] space-y-3.5 animate-gentle-fade">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-[0.92rem] font-bold text-[#1d1d1f] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[19px] text-[#0071e3]">
                    grid_on
                  </span>
                  <span>Todos os 48 Campos Cadastrais SED</span>
                </h3>

                <input
                  type="text"
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value)}
                  placeholder="Filtrar campo (ex: CPF, SUS, CEP)..."
                  className="px-3.5 py-1.5 bg-[#f5f5f7] rounded-xl border border-black/[0.08] text-[0.8rem] font-medium focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'todos', label: 'Todos (48)' },
                  { id: 'escolar', label: 'Escolar & Matrícula' },
                  { id: 'pessoal', label: 'Pessoal & Saúde' },
                  { id: 'familia', label: 'Família & Contatos' },
                  { id: 'endereco', label: 'Endereço & Ônibus' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id as GridCategory)}
                    className={`px-3 py-1 rounded-lg font-semibold text-[0.75rem] cursor-pointer transition-colors ${
                      activeCategory === cat.id
                        ? 'bg-[#1d1d1f] text-white'
                        : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[340px] overflow-y-auto pr-1 pt-1">
                {filteredFields.map((field) => {
                  const rawVal = draft[field.key];
                  const displayVal =
                    rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
                      ? String(rawVal)
                      : '—';
                  const isEditingThis = editingKey === field.key && canEdit;

                  return (
                    <div
                      key={String(field.key)}
                      onClick={() => {
                        if (canEdit && editingKey !== field.key) {
                          setEditingKey(field.key);
                        }
                      }}
                      className={`p-2.5 rounded-xl border transition-all ${
                        isEditingThis
                          ? 'bg-white border-[#0071e3] shadow-2xs'
                          : canEdit
                          ? 'bg-[#fbfbfd] hover:bg-[#f5f5f7] border-black/[0.06] cursor-pointer'
                          : 'bg-[#fbfbfd] border-black/[0.05]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[0.65rem] font-bold text-[#86868b] uppercase tracking-tight">
                          {field.label}
                        </span>
                        {canEdit && (
                          <span className="material-symbols-outlined text-[13px] text-[#86868b]">
                            edit
                          </span>
                        )}
                      </div>

                      {isEditingThis ? (
                        <input
                          type="text"
                          autoFocus
                          value={String(draft[field.key] ?? '')}
                          placeholder={field.placeholder || 'Digite...'}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          onBlur={() => setEditingKey(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditingKey(null);
                          }}
                          className="w-full mt-1 px-2 py-1 bg-[#f5f5f7] text-[#1d1d1f] font-semibold text-[0.84rem] tabular-nums rounded-lg border border-[#0071e3] focus:outline-none"
                        />
                      ) : (
                        <p
                          className={`text-[0.84rem] font-semibold tabular-nums mt-0.5 break-words ${
                            displayVal === '—' ? 'text-[#c7c7cc] font-normal' : 'text-[#1d1d1f]'
                          }`}
                        >
                          {displayVal}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Lightbox em Tela Cheia ao Clicar na Foto Gigante */}
      {isLightboxOpen && hasPhoto && (
        <div
          onClick={() => setIsLightboxOpen(false)}
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-gentle-fade"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full flex flex-col items-center"
          >
            <img
              src={effectivePhotoUrl}
              alt={draft.name}
              className="max-h-[78vh] w-auto rounded-3xl shadow-2xl border border-white/15 object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="mt-4 flex items-center gap-3">
              <span className="text-white font-bold text-[1rem]">{draft.name}</span>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="px-4 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-[0.8rem] font-semibold cursor-pointer"
              >
                Fechar Foto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
