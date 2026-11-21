import React, { useState, useEffect, useRef } from 'react';
import { Student, UserRole } from '../types';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentAttendanceMetrics } from '../utils/attendanceRules';
import {
  getStudentGenderLabel,
  resolveGuardianRelationshipInfo,
} from '../utils/genderDictionary';
import {
  getStudentCumulativeOccurrences,
  triggerConsecutiveAbsencePushNotification,
} from '../services/pushNotificationService';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { StudentAvatar } from './StudentAvatar';
import {
  findPhotoInDiscoveredCache,
  toEmbeddableDrivePhotoUrl,
  getAccessToken,
  uploadStudentPhotoToDrive,
} from '../services/googleSheetsApi';
import { isBackendApiAvailable } from '../services/apiEnvironment';
import {
  maskSensitiveText,
  getStoredLgpdConfig,
  addSecurityAuditLog,
  getStoredClasses,
} from '../services/db';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ModalPortal } from './ui/ModalPortal';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BellRing,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Lock,
  MapPin,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Save,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { findStudentSiblings } from '../utils/siblingDetection';
import { StudentSiblingsCard } from './StudentSiblingsCard';

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
  onNavigateToConsecutiveAbsences?: () => void;
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
  if (consecutiveDays >= 10) {
    return `Evasão Crítica (10+d) · ${consecutiveDays} faltas seguidas`;
  }
  if (consecutiveDays >= 5) {
    return `Busca Ativa (5+d) · ${consecutiveDays} faltas seguidas`;
  }
  if (consecutiveDays >= 3) {
    return `Atenção (3+d) · ${consecutiveDays} faltas seguidas${
      totalOccurrences > 1 ? ` (${totalOccurrences}ª seq.)` : ''
    }`;
  }
  return '0 faltas seguidas';
}

const SED_GRID_FIELDS: SedFieldDef[] = [
  // Escolar & Matrícula
  { key: 'tipoEnsino', label: '1. Etapa de Ensino', category: 'escolar', placeholder: 'Educação Infantil / Ensino Fundamental' },
  { key: 'serie', label: '2. Série / Ano Escolar', category: 'escolar', placeholder: '1, 2, 3, 4, 5' },
  { key: 'numeroChamada', label: '3. Número de Chamada', category: 'escolar', placeholder: '1' },
  { key: 'estudante', label: '4. Nome Oficial do(a) Estudante', category: 'escolar' },
  { key: 'ra', label: '5. Registro do Estudante (RA)', category: 'escolar' },
  { key: 'digRa', label: '6. Dígito do RA', category: 'escolar' },
  { key: 'ufRa', label: '7. Estado Emissor do RA (UF)', category: 'escolar', placeholder: 'SP' },
  { key: 'tipoAlocacao', label: '9. Tipo de Alocação na Turma', category: 'escolar', placeholder: 'REGULAR' },
  { key: 'situacao', label: '10. Situação da Matrícula (Ativo / Transferido)', category: 'escolar', placeholder: 'ATIVO / TRANSFERIDO (BXTR)' },
  { key: 'dataMovimentacao', label: '11. Data de Transferência ou Saída', category: 'escolar', placeholder: 'DD/MM/AAAA' },
  { key: 'categoriaProfissionalCenso', label: '12. Categoria Profissional (Censo Escolar)', category: 'escolar' },
  { key: 'posDataCenso', label: '14. Matrícula Após o Censo Escolar', category: 'escolar', placeholder: 'NÃO / SIM' },
  { key: 'turma', label: '15. Turma Oficial', category: 'escolar' },
  { key: 'periodo', label: '16. Turno (Manhã / Tarde)', category: 'escolar', placeholder: 'MANHÃ / TARDE' },
  { key: 'dataMatriculaSed', label: '17. Data de Matrícula na SED', category: 'escolar', placeholder: 'DD/MM/AAAA' },
  { key: 'procedenciaEscolar', label: '18. Escola de Origem (Procedência)', category: 'escolar' },
  { key: 'irmaos', label: '19. Irmãos Matriculados na Escola', category: 'escolar' },
  { key: 'arquivo', label: '21. Número da Pasta / Arquivo Passivo', category: 'escolar' },
  { key: 'sucessaoEscolar', label: '48. Sucessão Escolar (Próxima Etapa)', category: 'escolar' },

  // Pessoal & Saúde
  { key: 'dataNascimento', label: '8. Data de Nascimento', category: 'pessoal', placeholder: 'DD/MM/AAAA' },
  { key: 'deficiencia', label: '13. Educação Especial / Deficiência (AEE)', category: 'pessoal', placeholder: 'Ex: Transtorno do Espectro Autista' },
  { key: 'idade', label: '20. Idade Atual', category: 'pessoal' },
  { key: 'nomeSocial', label: '24. Nome Social', category: 'pessoal' },
  { key: 'genero', label: '25. Gênero (Feminino / Masculino)', category: 'pessoal', placeholder: 'FEMININO / MASCULINO' },
  { key: 'tipoSanguineo', label: '26. Tipo Sanguíneo e Fator RH', category: 'pessoal', placeholder: 'O+, A+, B+, AB+...' },
  { key: 'racaCor', label: '27. Raça / Cor Declarada', category: 'pessoal', placeholder: 'BRANCA, PARDA, PRETA...' },
  { key: 'nacionalidade', label: '28. Nacionalidade', category: 'pessoal', placeholder: 'BRASILEIRA' },
  { key: 'paisOrigem', label: '29. País de Origem', category: 'pessoal', placeholder: 'BRASIL' },
  { key: 'municipioNascimento', label: '30. Cidade de Nascimento', category: 'pessoal', placeholder: 'JUNDIAI - SP' },
  { key: 'cpf', label: '31. Número do CPF', category: 'pessoal', placeholder: '000.000.000-00' },
  { key: 'rg', label: '32. Número do RG (Identidade)', category: 'pessoal' },
  { key: 'dataEmissaoRg', label: '33. Data de Emissão do RG', category: 'pessoal' },
  { key: 'cartaoSus', label: '34. Cartão Nacional de Saúde (SUS)', category: 'pessoal' },
  { key: 'nis', label: '35. Número de Identificação Social (NIS / Bolsa Família)', category: 'pessoal' },

  // Família & Contatos
  { key: 'filiacao1', label: '22. Filiação 1 (Mãe / Pai / Avó / Tia / Responsável)', category: 'familia' },
  { key: 'filiacao2', label: '23. Filiação 2 (Pai / Mãe / Avô / Tio / Responsável)', category: 'familia' },
  { key: 'telefones', label: '43. Telefones e WhatsApp da Família', category: 'familia', placeholder: '(11) 90000-0000' },
  { key: 'emailGoogle', label: '44. E-mail Educacional Google', category: 'familia' },
  { key: 'emailMicrosoft', label: '45. E-mail Educacional Microsoft', category: 'familia' },
  { key: 'emailMunicipal', label: '46. E-mail Institucional do(a) Estudante', category: 'familia' },

  // Endereço
  { key: 'cep', label: '36. Código Postal (CEP)', category: 'endereco', placeholder: '13.214-000' },
  { key: 'logradouro', label: '37. Endereço (Rua / Avenida)', category: 'endereco' },
  { key: 'numeroResidencia', label: '38. Número da Residência', category: 'endereco' },
  { key: 'complemento', label: '39. Complemento (Casa / Bloco / Apto)', category: 'endereco' },
  { key: 'bairro', label: '40. Bairro', category: 'endereco' },
  { key: 'cidade', label: '41. Cidade', category: 'endereco', placeholder: 'JUNDIAI' },
  { key: 'uf', label: '42. Estado (UF)', category: 'endereco', placeholder: 'SP' },
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
  onNavigateToConsecutiveAbsences,
}) => {
  const [draft, setDraft] = useState<Student | null>(student);
  const [activeCategory, setActiveCategory] = useState<GridCategory>('todos');
  const [searchField, setSearchField] = useState('');
  const [editingKey, setEditingKey] = useState<keyof Student | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const [pushAlertSent, setPushAlertSent] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [portraitFallbackIdx, setPortraitFallbackIdx] = useState(0);
  const [portraitImgError, setPortraitImgError] = useState(false);
  const internalPhotoInputRef = useRef<HTMLInputElement>(null);
  const activeStudentThumbRef = useRef<HTMLButtonElement>(null);
  const [isLgpdRevealed, setIsLgpdRevealed] = useState(false);

  useModalScrollLock(isOpen);

  const handleToggleLgpdReveal = () => {
    if (userRole !== 'admin') {
      addSecurityAuditLog({
        userEmail: 'educador@educacao.jundiai.sp.gov.br',
        userName: 'Educador(a) Institucional',
        userRole: userRole,
        eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
        actionTitle: 'Tentativa de Revelar Dados Sensíveis (LGPD Art. 14)',
        details: `Usuário com perfil "${userRole.toUpperCase()}" tentou revelar dados sensíveis da criança "${draft?.name || ''}". Acesso bloqueado por menor privilégio.`,
        targetResource: draft?.name,
        severity: 'warning',
      });
      return;
    }

    const next = !isLgpdRevealed;
    setIsLgpdRevealed(next);
    if (next && draft) {
      addSecurityAuditLog({
        userEmail: 'emebjfreitas@jundiai.sp.gov.br',
        userName: 'Administrador Escolar Candelário',
        userRole: 'admin',
        eventType: 'DATA_MASKING_TOGGLED',
        actionTitle: 'Visualização de Dados Sensíveis da Criança (Ação Auditada)',
        details: `Administrador solicitou exibição temporária de CPF/NIS/telefones da criança "${draft.name}" (RA ${draft.ra || 'N/A'}). Ação rastreada.`,
        targetResource: `Estudante: ${draft.name}`,
        severity: 'info',
      });
    }
  };


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
    setIsLightboxOpen(false);
    setPortraitFallbackIdx(0);
    setPortraitImgError(false);
  }, [student]);

  useEffect(() => {
    if (activeStudentThumbRef.current) {
      activeStudentThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [draft?.id]);

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
      if (isBackendApiAvailable()) {
        return [
          `/api/drive-photo/${portraitDriveId}`,
          `https://lh3.googleusercontent.com/d/${portraitDriveId}=w500`,
          `https://drive.google.com/thumbnail?id=${portraitDriveId}&sz=w500`,
          `https://drive.google.com/uc?export=view&id=${portraitDriveId}`,
        ];
      }
      return [
        `https://lh3.googleusercontent.com/d/${portraitDriveId}=w500`,
        `https://drive.google.com/thumbnail?id=${portraitDriveId}&sz=w500`,
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

  const effectiveConsecutiveDays = Math.max(
    currentConsecutiveDaysCount,
    draft.consecutiveAbsenceAlert?.active
      ? Math.max(3, draft.consecutiveAbsenceAlert.selectedDates?.length || 0)
      : (draft.totalAbsencesMonth || 0) >= 3 && (draft.justifiedAbsences || 0) === 0
      ? draft.totalAbsencesMonth || 0
      : 0
  );
  const isConsecutiveRisk = effectiveConsecutiveDays >= 3;
  const exceedsThreeConsecutive = effectiveConsecutiveDays >= 3;

  const datesList =
    latestConsecutiveOccurrence?.selectedDates && latestConsecutiveOccurrence.selectedDates.length > 0
      ? latestConsecutiveOccurrence.selectedDates.join(', ')
      : draft.consecutiveAbsenceAlert?.selectedDates && draft.consecutiveAbsenceAlert.selectedDates.length > 0
      ? draft.consecutiveAbsenceAlert.selectedDates.join(', ')
      : 'Datas registradas no lançamento mensal';

  const guardian1Info = resolveGuardianRelationshipInfo(
    draft.filiacao1 || draft.guardianName,
    'filiacao1',
    draft.notes
  );

  const hasFamilyFeedback = Boolean(
    latestConsecutiveOccurrence?.familyFeedback?.trim() ||
      draft.consecutiveAbsenceAlert?.familyFeedback?.trim()
  );
  const familyFeedbackText =
    latestConsecutiveOccurrence?.familyFeedback?.trim() ||
    draft.consecutiveAbsenceAlert?.familyFeedback?.trim() ||
    '';

  const buscaAtivaMessage = `Olá${
    guardian1Info.nomeLimpo ? ` ${guardian1Info.nomeLimpo}` : ''
  }! Somos da equipe pedagógica da EMEB Prof. Joaquim Candelário de Freitas. Notamos a ausência do(a) estudante ${draft.name} nas últimas aulas (${effectiveConsecutiveDays} faltas seguidas). Gostaríamos de conversar para saber se está tudo bem com a família e como a escola pode apoiar o retorno seguro aos estudos. Aguardamos seu contato!`;

  const buscaAtivaWaLinks = buildWhatsAppLinksFromPhoneString(
    draft.telefones || draft.guardianPhone,
    draft.name,
    buscaAtivaMessage
  );

  const primaryPhoneDigits = (draft.telefones || draft.guardianPhone || '').replace(/\D/g, '');

  const handleSendPushAlert = async () => {
    if (!draft) return;
    try {
      await triggerConsecutiveAbsencePushNotification(
        draft,
        className,
        effectiveConsecutiveDays,
        `Contato imediato de Busca Ativa sugerido com ${guardian1Info.parentesco} (${guardian1Info.nomeLimpo || draft.guardianName || 'Responsável'})`
      );
      setPushAlertSent(true);
      setTimeout(() => setPushAlertSent(false), 4500);
    } catch {
      // ignore
    }
  };

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

  // Cruzamento automático de dados de filiação (Mãe, Pai ou Ambos) em toda a escola
  const detectedSiblings = React.useMemo(() => {
    if (!draft) return [];
    return findStudentSiblings(draft);
  }, [draft]);

  const effectiveIrmaosText = React.useMemo(() => {
    const manual = (draft?.irmaos || '').trim();
    if (detectedSiblings.length === 0) return manual;
    const autoText = detectedSiblings
      .map((s) => `${s.student.name} [Turma ${s.className} · ${s.relationLabel}]`)
      .join(' | ');
    if (!manual || manual === '—') return autoText;
    const manualUpper = manual.toUpperCase();
    const missingAuto = detectedSiblings.filter(
      (s) => !manualUpper.includes(s.student.name.toUpperCase())
    );
    if (missingAuto.length === 0) return manual;
    return `${manual} | ${missingAuto
      .map((s) => `${s.student.name} [Turma ${s.className} · ${s.relationLabel}]`)
      .join(' | ')}`;
  }, [draft?.irmaos, detectedSiblings]);

  const getFieldDisplayRawValue = (key: keyof Student): string => {
    if (key === 'irmaos') return effectiveIrmaosText;
    const v = draft[key];
    return v !== undefined && v !== null ? String(v).trim() : '';
  };

  const hasPopulatedText = (val: string): boolean => {
    const t = val.trim();
    return t !== '' && t !== '—' && t.toLowerCase() !== 'null' && t.toLowerCase() !== 'undefined';
  };

  const populatedFieldsCount = SED_GRID_FIELDS.filter((f) =>
    hasPopulatedText(getFieldDisplayRawValue(f.key))
  ).length;

  const filteredFields = SED_GRID_FIELDS.filter((f) => {
    const matchesCat = activeCategory === 'todos' || f.category === activeCategory;
    const rawStr = getFieldDisplayRawValue(f.key);
    const hasText = hasPopulatedText(rawStr);
    const valStr = rawStr.toLowerCase();
    const matchesSearch =
      searchField.trim() === '' ||
      f.label.toLowerCase().includes(searchField.toLowerCase()) ||
      valStr.includes(searchField.toLowerCase());

    return matchesCat && matchesSearch && hasText;
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
    <ModalPortal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[105] overflow-hidden flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-backdrop-in"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="modal-shell w-full max-w-4xl rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[88dvh] min-w-0 animate-apple-pop"
        >
        {/* Top Clean Header + Navegação */}
        <div className="modal-header-surface px-4 sm:px-6 py-3.5 bg-[#eef3f9] flex flex-wrap items-center justify-between gap-2.5 shrink-0 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-semibold text-slate-950 tabular-nums shrink-0">
              Chamada Nº {draft.number.toString().padStart(2, '0')}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-xs font-medium text-slate-700 break-words">
              {className}
            </span>
            {orderedList.length > 1 && currentStudentIdx >= 0 && (
              <>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-xs font-medium text-slate-700 tabular-nums">
                  {currentStudentIdx + 1} de {orderedList.length}
                </span>
              </>
            )}
            {savedBanner && (
              <span className="text-emerald-700 text-xs font-medium pl-1">
                ✓ Atualizado
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onSelectStudent && orderedList.length > 1 && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  type="button"
                  disabled={!prevStudent}
                  onClick={() => prevStudent && onSelectStudent(prevStudent)}
                  title={
                    prevStudent
                      ? `Anterior: Nº ${prevStudent.number.toString().padStart(2, '0')} ${prevStudent.name}`
                      : 'Primeiro estudante da turma'
                  }
                  className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-30 disabled:pointer-events-none tabular-nums"
                >
                  <ArrowLeft className="w-[17px] h-[17px]" />
                  <span className="hidden sm:inline">
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
                      ? `Próximo: Nº ${nextStudent.number.toString().padStart(2, '0')} ${nextStudent.name}`
                      : 'Último estudante da turma'
                  }
                  className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-30 disabled:pointer-events-none tabular-nums"
                >
                  <span className="hidden sm:inline">
                    {nextStudent
                      ? `Nº ${nextStudent.number.toString().padStart(2, '0')}`
                      : 'Próximo'}
                  </span>
                  <ArrowRight className="w-[17px] h-[17px]" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-slate-700 hover:text-slate-950 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Fechar ficha do estudante"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Carousel / Switcher dos Estudantes da Turma com Efeito Tátil Suave */}
        {orderedList.length > 1 && onSelectStudent && (
          <div className="px-4 sm:px-6 py-2 bg-[#f3f6fb] overflow-x-auto modal-scroll-body flex items-center gap-2 shrink-0 select-none">
            <span className="text-[11px] font-semibold text-slate-600 shrink-0 mr-1 hidden sm:inline">
              Estudantes:
            </span>
            {orderedList.map((st) => {
              const isSelected = st.id === draft.id;
              return (
                <button
                  key={st.id}
                  ref={isSelected ? activeStudentThumbRef : undefined}
                  type="button"
                  onClick={() => onSelectStudent(st)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-2xl flex items-center gap-2 transition-all duration-150 ease-out cursor-pointer text-left min-w-[125px] sm:min-w-[145px] max-w-[195px] ${
                    isSelected
                      ? 'bg-white shadow-xs opacity-100 scale-[1.02] text-[#14428c]'
                      : 'bg-white/70 hover:bg-white opacity-80 hover:opacity-100 hover:scale-[1.03] active:scale-[0.97] active:opacity-90 text-slate-700 hover:text-slate-950 shadow-2xs'
                  }`}
                  title={`Nº ${st.number.toString().padStart(2, '0')} · ${st.name}`}
                >
                  <StudentAvatar
                    student={st}
                    size="xs"
                    className="shrink-0 bg-slate-100"
                    expandableOnClick={false}
                  />
                  <div className="min-w-0 flex-1 leading-tight">
                    <span className="text-[10px] font-semibold tabular-nums text-slate-700 block">
                      Nº {st.number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs font-semibold truncate block">
                      {st.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Organic & Visual Profile Layout */}
        <div className="modal-scroll-body flex-1 p-4 sm:p-7 space-y-6">
          {/* BANNER DE ALERTA NO TOPO DA GRADE DE DADOS — EXCEDEU 3 FALTAS CONSECUTIVAS */}
          {exceedsThreeConsecutive && (
            <div className="rounded-3xl p-5 bg-gradient-to-r from-orange-100 via-rose-100 to-amber-100 shadow-sm flex flex-col gap-3.5 animate-gentle-fade">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <BellRing className="w-[22px] h-[22px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-orange-600 text-white text-[11px] font-bold uppercase tracking-wider">
                        ⚠️ ALERTA DE FREQUÊNCIA · EXCEDEU 3 FALTAS CONSECUTIVAS
                      </span>
                      <span className="px-3 py-1 rounded-full bg-white font-bold text-xs text-orange-950 tabular-nums shadow-2xs">
                        {effectiveConsecutiveDays} DIAS SEGUIDOS
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight leading-snug mt-1">
                      Ação Sugerida: Contato de Busca Ativa com a Família
                    </h2>
                    <p className="text-xs sm:text-sm text-amber-950 font-medium leading-relaxed mt-0.5">
                      O(A) estudante acumulou <strong className="font-bold">{effectiveConsecutiveDays} faltas consecutivas</strong> sem justificativa legal. Pelo protocolo de Busca Ativa da SME Jundiaí, é prioritário o acolhimento imediato com os responsáveis para averiguar motivos e restabelecer o vínculo escolar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informações Resumidas do Contato */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs min-w-0">
                <div className="bg-white/90 rounded-2xl p-3 shadow-2xs min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95">
                  <span className="text-[11px] font-bold uppercase text-slate-600 block">Datas de Ausência</span>
                  <span className="font-semibold text-slate-950 block mt-0.5 break-words tabular-nums" title={datesList}>
                    {datesList}
                  </span>
                </div>
                <div className="bg-white/90 rounded-2xl p-3 shadow-2xs min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95">
                  <span className="text-[11px] font-bold uppercase text-slate-700 block">Responsável Principal</span>
                  <span className="font-semibold text-slate-950 block mt-0.5 break-words" title={`${guardian1Info.parentesco}: ${guardian1Info.nomeLimpo || draft.guardianName || 'Não informado'}`}>
                    {guardian1Info.parentesco}: {guardian1Info.nomeLimpo || draft.guardianName || 'Não informado'}
                  </span>
                </div>
                <div className="bg-white/90 rounded-2xl p-3 shadow-2xs min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95">
                  <span className="text-[11px] font-bold uppercase text-slate-700 block">Status do Acompanhamento</span>
                  <span className={`font-semibold block mt-0.5 break-words ${hasFamilyFeedback ? 'text-emerald-950' : 'text-orange-950'}`}>
                    {hasFamilyFeedback ? `Feedback: "${familyFeedbackText}"` : 'Pendente de contato'}
                  </span>
                </div>
              </div>

              {/* Barra de Ações Rápidas de Busca Ativa */}
              <div className="flex flex-wrap items-center gap-2 pt-1 min-w-0">
                {buscaAtivaWaLinks.length > 0 ? (
                  buscaAtivaWaLinks.map((link, idx) => (
                    <a
                      key={`wa-btn-${idx}`}
                      href={link.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs flex items-center justify-center text-center whitespace-normal gap-1.5 shadow-xs transition-all cursor-pointer"
                      title={`Abrir WhatsApp com mensagem preenchida de Busca Ativa para ${link.display}`}
                    >
                      <MessageCircle className="w-[18px] h-[18px] shrink-0" />
                      <span>Contato de Busca Ativa ({link.display})</span>
                    </a>
                  ))
                ) : (
                  <span className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-slate-600 text-white font-bold text-xs flex items-center justify-center text-center whitespace-normal gap-1.5 opacity-80">
                    <MessageCircle className="w-[17px] h-[17px] shrink-0" />
                    <span>Sem Telefone Cadastrado</span>
                  </span>
                )}

                {primaryPhoneDigits && (
                  <a
                    href={`tel:${primaryPhoneDigits}`}
                    className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center text-center whitespace-normal gap-1 transition-all cursor-pointer shadow-xs"
                    title="Realizar ligação telefônica para o responsável"
                  >
                    <Phone className="w-[18px] h-[18px] text-emerald-800 shrink-0" />
                    <span>Ligar</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleSendPushAlert}
                  className={`w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center text-center whitespace-normal gap-1.5 transition-all cursor-pointer shadow-xs ${
                    pushAlertSent
                      ? 'bg-emerald-200 text-emerald-950'
                      : 'bg-white hover:bg-slate-100 text-orange-950'
                  }`}
                  title="Disparar notificação push imediata para a equipe escolar e coordenação"
                >
                  {pushAlertSent ? (
                    <CheckCircle2 className="w-[18px] h-[18px] shrink-0" />
                  ) : (
                    <BellRing className="w-[18px] h-[18px] shrink-0" />
                  )}
                  <span>
                    {pushAlertSent
                      ? '✓ Notificação Push Enviada à Equipe!'
                      : 'Disparar Notificação Push'}
                  </span>
                </button>

                {onNavigateToConsecutiveAbsences && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToConsecutiveAbsences();
                    }}
                    className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center text-center whitespace-normal gap-1 transition-all cursor-pointer sm:ml-auto shadow-xs"
                    title="Ir para a aba de Faltas Seguidas para registrar ocorrência ou feedback oficial"
                  >
                    <ClipboardList className="w-[18px] h-[18px] text-slate-950 shrink-0" />
                    <span>Ficha de Faltas Seguidas</span>
                    <ArrowRight className="w-4 h-4 text-slate-700 shrink-0" />
                  </button>
                )}
              </div>
            </div>
          )}

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
                className="relative w-full flex-1 min-h-[320px] sm:min-h-[380px] rounded-[28px] overflow-hidden bg-gradient-to-br from-[#0f172a] to-[#1e293b] shadow-md flex items-center justify-center group cursor-pointer transition-all duration-150 ease-out hover:scale-[1.01] active:scale-[0.99] hover:opacity-95"
              >
                {hasPhoto ? (
                  <>
                    <img
                      src={effectivePhotoUrl}
                      alt={draft.name}
                      onError={handlePortraitImgError}
                      className="w-full h-full object-cover transition-transform duration-100 group-hover:scale-103"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/35 to-transparent flex items-center justify-between text-white">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Maximize2 className="w-[17px] h-[17px]" />
                        Ampliar foto
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          internalPhotoInputRef.current?.click();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/35 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-[15px] h-[15px]" />
                        Trocar Foto
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-white">
                    <span className="text-[4.8rem] font-semibold tracking-tight leading-none opacity-90 select-none">
                      {draft.initials ||
                        (draft.name || '')
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase() ||
                        'AL'}
                    </span>
                    <span className="mt-3 text-sm text-white/75 font-medium">
                      Estudante sem foto cadastrada
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        internalPhotoInputRef.current?.click();
                      }}
                      className="mt-5 px-4 py-2.5 rounded-2xl bg-white text-[#0f172a] hover:bg-[#f3f6fb] font-bold text-sm flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                    >
                      <Camera className="w-[18px] h-[18px]" />
                      <span>Subir Foto do Dispositivo</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA DIREITA (7 cols): COMPOSIÇÃO ORGÂNICA E VISUAL */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-4 min-w-0">
              {/* 1. Identidade Principal + Pílulas Numéricas Ultra-Legíveis (Manrope Tabular) */}
              <div className="bg-white rounded-[24px] p-5 shadow-sm space-y-4 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="px-3 py-1 rounded-full bg-[#ecfdf5] text-[#047857] font-bold text-xs uppercase tracking-wider">
                      {draft.situacao || 'MATRÍCULA ATIVA'}
                    </span>
                    {(() => {
                      const gInfo = getStudentGenderLabel(draft);
                      return (
                        <span
                          className={`px-3 py-1 rounded-full font-bold text-xs ${
                            gInfo.code === 'F'
                              ? 'bg-pink-100 text-pink-950'
                              : 'bg-sky-100 text-sky-950'
                          }`}
                        >
                          {gInfo.estudanteTitle} · {gInfo.label} ({gInfo.code})
                        </span>
                      );
                    })()}
                    {draft.deficiencia && (
                      <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-950 font-bold text-xs break-words">
                        AEE · {draft.deficiencia}
                      </span>
                    )}
                  </div>

                  {/* Badge Visual de Risco / Faltas Consecutivas Imediatamente Visível no Topo do Card (3, 5 e 10 dias) */}
                  <span
                    className={`px-3.5 py-1 rounded-full font-bold text-xs tabular-nums flex items-center gap-1.5 shadow-2xs ${
                      currentConsecutiveDaysCount >= 10
                        ? 'bg-rose-700 text-white'
                        : currentConsecutiveDaysCount >= 5
                        ? 'bg-orange-600 text-white'
                        : isConsecutiveRisk
                        ? 'bg-amber-200 text-amber-950'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {currentConsecutiveDaysCount >= 10 ? (
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                    ) : isConsecutiveRisk ? (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    ) : (
                      <BadgeCheck className="w-4 h-4 shrink-0" />
                    )}
                    <span>
                      {isConsecutiveDaysBadgeLabel(
                        currentConsecutiveDaysCount,
                        cumulativeOccurrences.length
                      )}
                    </span>
                  </span>
                </div>

                <h1 className="text-xl sm:text-2xl font-bold text-slate-950 tracking-tight leading-tight break-words">
                  {draft.name}
                </h1>

                {/* Cartões Visuais de Números-Chave (RA, Nascimento, Frequência e Faltas Seguidas) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 min-w-0">
                  <div className="rounded-2xl bg-slate-100 p-3 shadow-2xs min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95 opacity-100 cursor-default">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                      Registro (RA)
                    </span>
                    <span className="text-base font-bold text-slate-950 tabular-nums block mt-0.5 break-all">
                      {draft.ra ? (draft.digRa ? `${draft.ra}-${draft.digRa}` : draft.ra) : '—'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-slate-100 p-3 shadow-2xs min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95 opacity-100 cursor-default">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                      Nascimento
                    </span>
                    <span className="text-base font-bold text-slate-950 tabular-nums block mt-0.5">
                      {draft.dataNascimento || '—'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-slate-100 p-3 shadow-2xs min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95 opacity-100 cursor-default">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                      Frequência no Mês
                    </span>
                    <div className="flex flex-wrap items-baseline gap-1 mt-0.5">
                      <span className="text-base font-bold text-emerald-900 tabular-nums">
                        {metrics.frequenciaPercent}%
                      </span>
                      <span className="text-xs font-bold text-slate-600 tabular-nums">
                        ({metrics.faltas} {metrics.faltas === 1 ? 'falta' : 'faltas'})
                      </span>
                    </div>
                  </div>

                  {/* Card Dedicado de Faltas Consecutivas (Marcas de 3, 5 e 10 dias) */}
                  <div
                    className={`rounded-2xl p-3 shadow-2xs min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95 opacity-100 cursor-default ${
                      currentConsecutiveDaysCount >= 10
                        ? 'bg-rose-100 text-rose-950'
                        : currentConsecutiveDaysCount >= 5
                        ? 'bg-orange-100 text-orange-950'
                        : isConsecutiveRisk
                        ? 'bg-amber-100 text-amber-950'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        currentConsecutiveDaysCount >= 10
                          ? 'text-rose-950'
                          : currentConsecutiveDaysCount >= 5
                          ? 'text-orange-950'
                          : isConsecutiveRisk
                          ? 'text-amber-950'
                          : 'text-slate-600'
                      }`}
                    >
                      {isConsecutiveRisk ? (
                        <BellRing className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <CalendarCheck2 className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>Faltas Seguidas</span>
                    </span>
                    <div className="flex flex-wrap items-baseline gap-1 mt-0.5">
                      <span
                        className={`text-base font-bold tabular-nums ${
                          currentConsecutiveDaysCount >= 10
                            ? 'text-rose-950'
                            : currentConsecutiveDaysCount >= 5
                            ? 'text-orange-950'
                            : isConsecutiveRisk
                            ? 'text-amber-950'
                            : 'text-slate-950'
                        }`}
                      >
                        {currentConsecutiveDaysCount} {currentConsecutiveDaysCount === 1 ? 'dia' : 'dias'}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 tabular-nums break-words">
                        {currentConsecutiveDaysCount >= 10
                          ? 'crítico 10+d'
                          : currentConsecutiveDaysCount >= 5
                          ? 'alerta 5+d'
                          : isConsecutiveRisk
                          ? 'atenção 3+d'
                          : 'em dia'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Alerta Contextual de Datas Faltosas e Retorno da Família se houver Faltas Seguidas */}
                {isConsecutiveRisk && latestConsecutiveOccurrence && (
                  <div
                    className={`rounded-2xl p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-all duration-150 ease-out hover:scale-[1.01] active:scale-[0.99] hover:opacity-95 ${
                      latestConsecutiveOccurrence.familyFeedback
                        ? 'bg-emerald-100 text-emerald-950'
                        : 'bg-rose-100 text-rose-950'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {latestConsecutiveOccurrence.familyFeedback ? (
                        <MessageSquare className="w-5 h-5 shrink-0 mt-0.5 text-emerald-800" />
                      ) : (
                        <ClipboardList className="w-5 h-5 shrink-0 mt-0.5 text-rose-700" />
                      )}
                      <div className="min-w-0">
                        <span className="font-bold block">
                          Datas seguidas ({latestConsecutiveOccurrence.sequenceNumber}ª ocorrência):{' '}
                          <span className="tabular-nums font-bold">
                            {latestConsecutiveOccurrence.selectedDates.join(', ')}
                          </span>
                        </span>
                        <span className="text-xs text-slate-700 font-medium block mt-0.5">
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
                  className={`w-full min-w-0 p-4 rounded-2xl text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all duration-150 ease-out hover:scale-[1.015] active:scale-[0.985] hover:opacity-95 cursor-pointer shadow-xs ${
                    hasPdf
                      ? 'bg-[#14428c] hover:bg-[#0f3370] text-white'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-950'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 w-full">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        hasPdf ? 'bg-white/20 text-white' : 'bg-[#be123c] text-white'
                      }`}
                    >
                      {hasPdf ? (
                        <FileText className="w-[26px] h-[26px]" />
                      ) : (
                        <BellRing className="w-[26px] h-[26px]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider block break-words ${
                          hasPdf ? 'text-blue-100' : 'text-[#be123c]'
                        }`}
                      >
                        {hasPdf
                          ? 'Ficha Informativa Digitalizada · Documento Oficial'
                          : 'Documento Pendente na Pasta da Turma'}
                      </span>
                      <span className="text-base sm:text-lg font-bold block break-words leading-snug mt-0.5">
                        {hasPdf
                          ? 'Abrir Ficha Informativa do Estudante'
                          : 'Sem Ficha Informativa · Solicitar à Família'}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 shrink-0 self-end sm:self-center ${
                      hasPdf ? 'bg-white text-[#14428c]' : 'bg-[#be123c] text-white'
                    }`}
                  >
                    <span>{hasPdf ? 'Abrir Ficha' : 'Ver Aviso'}</span>
                    <ExternalLink className="w-[17px] h-[17px]" />
                  </div>
                </button>
              )}

              {/* 3. Cartão Orgânico da Família, WhatsApp e Endereço */}
              <div className="bg-white rounded-[24px] p-5 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {(() => {
                    const g1 = resolveGuardianRelationshipInfo(
                      draft.filiacao1 || draft.guardianName,
                      'filiacao1',
                      draft.notes
                    );
                    const g2 = resolveGuardianRelationshipInfo(
                      draft.filiacao2,
                      'filiacao2',
                      draft.notes
                    );
                    return (
                      <>
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                            <User className="w-[18px] h-[18px]" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-700 block">
                              {g1.shortRoleLabel || 'Mãe / Responsável 1'}
                            </span>
                            <p className="text-sm font-semibold text-slate-950 leading-snug mt-0.5 break-words">
                              {g1.cleanName || 'Não informado'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                            <User className="w-[18px] h-[18px]" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-700 block">
                              {g2.shortRoleLabel || 'Pai / Responsável 2'}
                            </span>
                            <p className="text-sm font-semibold text-slate-950 leading-snug mt-0.5 break-words">
                              {g2.cleanName || 'Não informado'}
                            </p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Bloco Visual: Vínculos Familiares (Cruzamento de Mãe, Pai ou Ambos) */}
                {detectedSiblings.length > 0 && (
                  <div className="pt-2">
                    <StudentSiblingsCard
                      title="Vínculos Familiares"
                      siblings={detectedSiblings}
                      onSelectSibling={(sibSt) => onSelectStudent?.(sibSt)}
                    />
                  </div>
                )}

                {/* Linha de Telefones com Botões Diretos de WhatsApp */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#25D366]/20 text-[#128C7E] flex items-center justify-center shrink-0">
                      <Phone className="w-[18px] h-[18px]" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block">
                        Telefone da família
                      </span>
                      <span className="text-sm font-semibold text-slate-950 tabular-nums">
                        {draft.telefones || draft.guardianPhone || 'Sem telefone cadastrado'}
                      </span>
                    </div>
                  </div>

                  {whatsappLinks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                      {whatsappLinks.map((ph, idx) => (
                        <a
                          key={idx}
                          href={ph.waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full sm:w-auto min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-semibold text-xs tabular-nums flex items-center justify-center text-center whitespace-normal gap-1.5 transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-4 h-4 shrink-0" />
                          <span>WhatsApp {ph.display}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Endereço */}
                {fullAddress && (
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                        <MapPin className="w-[18px] h-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-slate-700 block">
                          Endereço onde mora
                        </span>
                        <p className="text-sm font-semibold text-slate-950 leading-snug mt-0.5 break-words">
                          {fullAddress || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {canEdit && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveAll}
                      className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-xs flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Save className="w-4 h-4 shrink-0" />
                      <span>Salvar Alterações</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* FICHA CADASTRAL COMPLETA (48 CAMPOS OFICIAIS SED / SME JUNDIAÍ) */}
          <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#14428c] text-white flex items-center justify-center shrink-0">
                  <CreditCard className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-950 break-words">
                    Dados Preenchidos do Estudante ({populatedFieldsCount} Campos)
                  </h3>
                  <p className="text-xs text-slate-700 font-medium break-words">
                    Exibindo apenas os campos com informação registrada · Toque em uma categoria ou pesquise
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
                <input
                  type="text"
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value)}
                  placeholder="Procurar dado (ex: CPF, SUS, CEP)..."
                  className="min-h-[40px] px-3.5 bg-[#eef3f9] hover:bg-slate-200/70 focus:bg-white rounded-xl text-xs font-medium text-slate-950 placeholder:text-slate-600 transition-colors flex-1 min-w-0 sm:w-60"
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    className="min-h-[40px] py-2 px-4 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-xs flex items-center justify-center text-center whitespace-normal gap-1.5 cursor-pointer shadow-xs shrink-0 transition-colors"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span>Salvar</span>
                  </button>
                )}
              </div>
            </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'todos', label: `Todos (${populatedFieldsCount})` },
                  { id: 'escolar', label: 'Escola e Turma' },
                  { id: 'pessoal', label: 'Documentos e Saúde' },
                  { id: 'familia', label: 'Família e Telefones' },
                  { id: 'endereco', label: 'Endereço' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id as GridCategory)}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-xl font-semibold text-xs cursor-pointer transition-colors whitespace-normal text-center ${
                      activeCategory === cat.id
                        ? 'bg-[#14428c] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Barra de Privacidade dos Dados (Proteção LGPD) */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100/90">
                <div className="flex items-center gap-2 text-xs">
                  <ShieldCheck className="w-[17px] h-[17px] text-emerald-800 shrink-0" />
                  <span className="font-semibold text-slate-800">
                    Privacidade:
                  </span>
                  <span className="text-slate-600">
                    {isLgpdRevealed
                      ? 'Documentos e endereço completos estão visíveis agora'
                      : 'CPF, NIS, RG, endereço e telefones ficam protegidos com asteriscos'}
                  </span>
                </div>

                {userRole === 'admin' ? (
                  <button
                    type="button"
                    onClick={handleToggleLgpdReveal}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shadow-2xs ${
                      isLgpdRevealed
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-950'
                        : 'bg-[#14428c] hover:bg-[#0f3370] text-white'
                    }`}
                  >
                    {isLgpdRevealed ? (
                      <EyeOff className="w-[15px] h-[15px]" />
                    ) : (
                      <Eye className="w-[15px] h-[15px]" />
                    )}
                    <span>{isLgpdRevealed ? 'Ocultar Dados Protegidos' : 'Mostrar Todos os Dados'}</span>
                  </button>
                ) : (
                  <span className="text-xs font-medium text-slate-700">
                    Visível apenas para a direção
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-1">
                {filteredFields.map((field) => {
                  const rawVal = getFieldDisplayRawValue(field.key);
                  let displayVal = rawVal || '—';

                  // Mascaramento Automático LGPD uniforme para todos os campos sensíveis quando não revelado
                  const isSensitiveField = [
                    'cpf',
                    'nis',
                    'rg',
                    'cartaoSus',
                    'telefones',
                    'logradouro',
                    'numeroResidencia',
                    'complemento',
                    'cep',
                  ].includes(String(field.key));

                  if (isSensitiveField && !isLgpdRevealed && rawVal) {
                    if (field.key === 'cpf') displayVal = maskSensitiveText(rawVal, 'cpf');
                    else if (field.key === 'nis') displayVal = maskSensitiveText(rawVal, 'nis');
                    else if (field.key === 'cartaoSus') displayVal = maskSensitiveText(rawVal, 'sus');
                    else if (field.key === 'telefones') displayVal = maskSensitiveText(rawVal, 'phone');
                    else if (field.key === 'rg') displayVal = maskSensitiveText(rawVal, 'rg');
                    else if (field.key === 'cep') displayVal = maskSensitiveText(rawVal, 'cep');
                    else if (field.key === 'logradouro') displayVal = maskSensitiveText(rawVal, 'address');
                    else displayVal = '***';
                  }

                  const isEditingThis = editingKey === field.key && canEdit;

                  return (
                    <div
                      key={String(field.key)}
                      onClick={() => {
                        if (canEdit && editingKey !== field.key) {
                          setEditingKey(field.key);
                        }
                      }}
                      className={`p-3 rounded-xl shadow-2xs min-h-[70px] flex flex-col justify-between transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95 ${
                        isEditingThis
                          ? 'bg-[#e8f0fe] shadow-[0_6px_18px_-4px_rgba(9,46,112,0.22)] scale-[1.01] opacity-100'
                          : canEdit
                          ? 'bg-slate-100 hover:bg-slate-200 cursor-pointer opacity-100'
                          : 'bg-slate-100 opacity-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-tight flex items-center gap-1 break-words leading-snug">
                          {isSensitiveField && (
                            <span title="Dado Pessoal Sensível (LGPD Art. 14)" className="inline-flex shrink-0">
                              <Lock className="w-3.5 h-3.5 text-amber-700" />
                            </span>
                          )}
                          <span>{field.label}</span>
                        </span>
                        {canEdit && (
                          <Pencil className="w-3.5 h-3.5 text-slate-700 shrink-0" />
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
                          className="w-full mt-1.5 px-2.5 py-1 bg-white text-slate-950 font-semibold text-sm tabular-nums rounded-lg shadow-[0_0_0_2px_rgba(9,46,112,0.28)]"
                        />
                      ) : (
                        <p className="text-sm font-semibold tabular-nums mt-1.5 break-words text-slate-900 leading-snug">
                          {displayVal}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Campos Complementares vindos do Arquivo JSON (quando houver propriedades extras) */}
              {(() => {
                const knownSedKeys = new Set<string>(SED_GRID_FIELDS.map((f) => String(f.key)));
                const internalSkipKeys = new Set<string>([
                  'id',
                  'number',
                  'name',
                  'initials',
                  'status',
                  'active',
                  'classesHeld',
                  'classesAttended',
                  'absences',
                  'totalAbsencesMonth',
                  'justifiedAbsences',
                  'attendanceRate',
                  'consecutiveAbsences',
                  'consecutiveDays',
                  'consecutiveTier',
                  'consecutiveSelectedDates',
                  'consecutiveAbsenceAlert',
                  'consecutiveOccurrences',
                  'presenceDates',
                  'absentDates',
                  'justifiedAbsenceDates',
                  'schoolDaysCount',
                  'diasLetivosRecorte',
                  'hasPhoto',
                  'photo',
                  'photoDriveUrl',
                  'hasScannedPdf',
                  'fichaPdfDriveId',
                  'fichaPdfDriveUrl',
                  'fichaPdfSubfolder',
                  'fichaPdfManualLink',
                  'updatedAtMs',
                  'isDeleted',
                  'deletedAtISO',
                  'alert',
                  'guardianName',
                  'guardianPhone',
                ]);
                const extraEntries = Object.entries(draft as Record<string, any>).filter(
                  ([k, v]) => {
                    if (knownSedKeys.has(k) || internalSkipKeys.has(k)) return false;
                    if (v === undefined || v === null || typeof v === 'object') return false;
                    const strVal = String(v).trim();
                    if (!hasPopulatedText(strVal)) return false;
                    if (searchField.trim() !== '') {
                      const q = searchField.toLowerCase();
                      return k.toLowerCase().includes(q) || strVal.toLowerCase().includes(q);
                    }
                    return activeCategory === 'todos';
                  }
                );
                if (extraEntries.length === 0) return null;
                return (
                  <div className="pt-3 space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#14428c]">
                      Dados Complementares Importados do JSON ({extraEntries.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                      {extraEntries.map(([extraKey, extraVal]) => {
                        const rawStr = String(extraVal).trim();
                        const keyLow = extraKey.toLowerCase();
                        let displayExtra = rawStr;
                        let isExtraSensitive = false;
                        if (!isLgpdRevealed) {
                          if (keyLow.includes('cpf')) {
                            displayExtra = maskSensitiveText(rawStr, 'cpf');
                            isExtraSensitive = true;
                          } else if (keyLow.includes('nis')) {
                            displayExtra = maskSensitiveText(rawStr, 'nis');
                            isExtraSensitive = true;
                          } else if (keyLow.includes('sus')) {
                            displayExtra = maskSensitiveText(rawStr, 'sus');
                            isExtraSensitive = true;
                          } else if (keyLow.includes('tel') || keyLow.includes('cel') || keyLow.includes('fone') || keyLow.includes('whats')) {
                            displayExtra = maskSensitiveText(rawStr, 'phone');
                            isExtraSensitive = true;
                          } else if (keyLow === 'rg' || keyLow.includes('_rg') || keyLow.includes('identidade')) {
                            displayExtra = maskSensitiveText(rawStr, 'rg');
                            isExtraSensitive = true;
                          } else if (keyLow.includes('cep')) {
                            displayExtra = maskSensitiveText(rawStr, 'cep');
                            isExtraSensitive = true;
                          } else if (keyLow.includes('ender') || keyLow.includes('lograd') || keyLow.includes('rua')) {
                            displayExtra = maskSensitiveText(rawStr, 'address');
                            isExtraSensitive = true;
                          }
                        }
                        return (
                          <div
                            key={`extra-${extraKey}`}
                            className="p-3 rounded-xl bg-slate-100 shadow-2xs min-h-[70px] flex flex-col justify-between min-w-0 break-words transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98] hover:opacity-95"
                          >
                            <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-tight flex items-center gap-1 break-words leading-snug">
                              {isExtraSensitive && (
                                <span title="Dado Pessoal Sensível (LGPD Art. 14)" className="inline-flex shrink-0">
                                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                                </span>
                              )}
                              <span>{extraKey}</span>
                            </span>
                            <p className="text-sm font-semibold text-slate-900 tabular-nums mt-1.5 break-words leading-snug">
                              {displayExtra}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </section>
        </div>

        {/* Sticky Action Footer — Sempre visível sem scroll */}
        <footer className="shrink-0 sticky bottom-0 bg-white/95 backdrop-blur-sm px-4 sm:px-6 py-2.5 sm:py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 z-20 min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0 break-words">
            {savedBanner ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Alterações salvas com sucesso!
              </span>
            ) : (
              <span className="tabular-nums break-words">Chamada Nº {draft.number} · RA {draft.ra || '—'} · {className}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial min-h-[40px] py-2 px-4 text-xs sm:text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl flex items-center justify-center text-center whitespace-normal cursor-pointer transition-colors"
            >
              Fechar
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveAll}
                className="flex-1 sm:flex-initial min-h-[40px] py-2 px-5 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white font-semibold text-xs sm:text-sm flex items-center justify-center text-center whitespace-normal gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <Save className="w-[17px] h-[17px] text-emerald-400 shrink-0" />
                <span>Salvar Alterações</span>
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* Lightbox em Tela Cheia ao Clicar na Foto Gigante */}
      {isLightboxOpen && hasPhoto && (
        <div
          onClick={() => setIsLightboxOpen(false)}
          className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-backdrop-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full flex flex-col items-center animate-apple-pop"
          >
            <img
              src={effectivePhotoUrl}
              alt={draft.name}
              className="max-h-[78vh] w-auto rounded-3xl shadow-2xl object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="mt-4 flex items-center gap-3">
              <span className="text-white font-bold text-[1rem]">{draft.name}</span>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="px-4 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-semibold cursor-pointer"
              >
                Fechar Foto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ModalPortal>
  );
};
