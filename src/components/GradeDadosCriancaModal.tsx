import React, { useState, useEffect } from 'react';
import { Student, UserRole } from '../types';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentAttendanceMetrics } from '../utils/attendanceRules';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';

interface GradeDadosCriancaModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
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

  useEffect(() => {
    setDraft(student);
    setEditingKey(null);
    setSavedBanner(false);
    setShowAllSedFields(false);
    setIsLightboxOpen(false);
  }, [student]);

  if (!isOpen || !draft) return null;

  const metrics = getStudentAttendanceMetrics(draft, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);
  const hasPhoto = Boolean(draft.photo && draft.photo.trim().length > 0);
  const hasPdf = Boolean(
    (draft.fichaPdfDriveUrl && draft.fichaPdfDriveUrl.trim().length > 0) ||
      (draft.fichaPdfDriveId && draft.fichaPdfDriveId.trim().length > 0)
  );

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
        {/* Top Minimalist Apple Bar */}
        <div className="px-5 sm:px-7 py-3.5 bg-white/95 backdrop-blur-md border-b border-black/[0.05] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-3 py-1 rounded-xl bg-[#1d1d1f] text-white font-extrabold text-[0.78rem] tabular-nums">
              Chamada Nº {draft.number.toString().padStart(2, '0')}
            </span>
            <span className="px-3 py-1 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] font-bold text-[0.78rem] truncate">
              {className}
            </span>
            {savedBanner && (
              <span className="px-2.5 py-1 rounded-xl bg-[#eaf6ef] text-[#005035] text-[0.74rem] font-bold">
                ✓ Atualizado
              </span>
            )}
          </div>

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

        {/* Main Organic & Visual Profile Layout */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-7 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* COLUNA ESQUERDA (5 cols): RETRATO GIGANTE DO ESTUDANTE */}
            <div className="md:col-span-5 flex flex-col">
              <div
                onClick={() => {
                  if (hasPhoto) setIsLightboxOpen(true);
                  else if (onOpenPhotoModal) onOpenPhotoModal(draft);
                }}
                className="relative w-full flex-1 min-h-[320px] sm:min-h-[380px] rounded-[28px] overflow-hidden bg-gradient-to-br from-[#1d1d1f] to-[#2c2c2e] shadow-md border border-black/[0.06] flex items-center justify-center group cursor-pointer"
              >
                {hasPhoto ? (
                  <>
                    <img
                      src={draft.photo}
                      alt={draft.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/35 to-transparent flex items-center justify-between text-white">
                      <span className="text-[0.75rem] font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[17px]">fullscreen</span>
                        Ampliar foto
                      </span>
                      {onOpenPhotoModal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPhotoModal(draft);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/35 backdrop-blur-md text-white text-[0.73rem] font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">photo_camera</span>
                          Trocar Foto
                        </button>
                      )}
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
                    {onOpenPhotoModal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPhotoModal(draft);
                        }}
                        className="mt-5 px-4 py-2.5 rounded-2xl bg-white text-[#1d1d1f] hover:bg-[#f5f5f7] font-bold text-[0.8rem] flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
                        <span>Adicionar Foto</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA DIREITA (7 cols): COMPOSIÇÃO ORGÂNICA E VISUAL */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-4">
              {/* 1. Identidade Principal + Pílulas Numéricas Ultra-Legíveis (Manrope Tabular) */}
              <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#eaf6ef] text-[#005035] font-bold text-[0.7rem] uppercase tracking-wider">
                    {draft.situacao || 'MATRÍCULA ATIVA'}
                  </span>
                  {draft.deficiencia && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#f5f3ff] text-[#5b21b6] font-bold text-[0.72rem]">
                      AEE · {draft.deficiencia}
                    </span>
                  )}
                </div>

                <h1 className="text-[1.45rem] sm:text-[1.7rem] font-extrabold text-[#1d1d1f] tracking-tight leading-tight">
                  {draft.name}
                </h1>

                {/* Cartões Visuais de Números-Chave (RA, Nascimento/Idade e Frequência) */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div className="rounded-2xl bg-[#f5f5f7] p-3">
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#86868b] block">
                      Registro (RA)
                    </span>
                    <span className="text-[0.98rem] sm:text-[1.06rem] font-extrabold text-[#1d1d1f] tabular-nums block mt-0.5">
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
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-[1.02rem] sm:text-[1.1rem] font-extrabold text-[#005035] tabular-nums">
                        {metrics.frequenciaPercent}%
                      </span>
                      <span className="text-[0.72rem] font-semibold text-[#6e6e73] tabular-nums">
                        ({metrics.faltas} {metrics.faltas === 1 ? 'falta' : 'faltas'})
                      </span>
                    </div>
                  </div>
                </div>
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
              src={draft.photo}
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
