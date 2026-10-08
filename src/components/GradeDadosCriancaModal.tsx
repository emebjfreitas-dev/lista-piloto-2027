import React, { useState, useEffect } from 'react';
import { Student, UserRole } from '../types';
import { OFFICIAL_OCTOBER_DAYS } from '../data/mockData';
import { getStudentAttendanceMetrics } from '../utils/attendanceRules';
import { StudentAvatar } from './StudentAvatar';
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

  useEffect(() => {
    setDraft(student);
    setEditingKey(null);
    setSavedBanner(false);
  }, [student]);

  if (!isOpen || !draft) return null;

  const metrics = getStudentAttendanceMetrics(draft, diasLetivosMes, OFFICIAL_OCTOBER_DAYS);

  // Update interactive attendance inside the modal with instant propagation to Nominal Tabs & Google Sheets
  const handleDeltaRecorte = (delta: number) => {
    if (!canEdit) return;
    const nextRecorte = Math.max(1, Math.min(diasLetivosMes, metrics.diasLetivosMatriculados + delta));
    const nextFaltas = Math.min(nextRecorte, metrics.faltas);
    const nextAtestados = Math.min(nextFaltas, metrics.atestados);
    const updated: Student = {
      ...draft,
      diasLetivosRecorte: nextRecorte,
      totalAbsencesMonth: nextFaltas,
      justifiedAbsences: nextAtestados,
      status: nextFaltas > 0 ? 'absent' : 'present',
    };
    setDraft(updated);
    onSaveStudent(updated);
    setSavedBanner(true);
  };

  const handleDeltaFaltas = (delta: number) => {
    if (!canEdit) return;
    const nextFaltas = Math.max(0, Math.min(metrics.diasLetivosMatriculados, metrics.faltas + delta));
    const nextAtestados = Math.min(nextFaltas, metrics.atestados);
    const updated: Student = {
      ...draft,
      totalAbsencesMonth: nextFaltas,
      justifiedAbsences: nextAtestados,
      status: nextFaltas > 0 ? 'absent' : 'present',
    };
    setDraft(updated);
    onSaveStudent(updated);
    setSavedBanner(true);
  };

  const handleDeltaAtestados = (delta: number) => {
    if (!canEdit) return;
    const nextAtestados = Math.max(0, Math.min(metrics.faltas, metrics.atestados + delta));
    const updated: Student = {
      ...draft,
      justifiedAbsences: nextAtestados,
    };
    setDraft(updated);
    onSaveStudent(updated);
    setSavedBanner(true);
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

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-black/60 backdrop-blur-sm animate-gentle-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-xl md:max-w-4xl lg:max-w-6xl xl:max-w-[1440px] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
      >
        {/* Top Modal Header — Minimalist with Direct WhatsApp Link & Prominent Close Button */}
        <div className="bg-white text-[#1d1d1f] px-4 sm:px-6 py-4 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <StudentAvatar
              student={draft}
              size="lg"
              expandableOnClick={true}
              onUploadPhotoClick={onOpenPhotoModal ? () => onOpenPhotoModal(draft) : undefined}
              className="w-14 h-14 sm:w-16 sm:h-16 shrink-0"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] font-bold text-[0.72rem]">
                  {className} • Nº {draft.number.toString().padStart(2, '0')}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#f5f5f7] text-[#6e6e73] font-mono text-[0.72rem]">
                  RA: {draft.ra}-{draft.digRa}/{draft.ufRa || 'SP'}
                </span>
              </div>
              <h2 className="text-[1.15rem] sm:text-[1.35rem] font-bold text-[#1d1d1f] leading-tight truncate mt-1">
                {draft.name}
              </h2>

              <div className="flex flex-wrap items-center gap-2 mt-1">
                {whatsappLinks.length > 0 ? (
                  whatsappLinks.map((ph, idx) => (
                    <a
                      key={idx}
                      href={ph.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25D366]/12 hover:bg-[#25D366] text-[#128C7E] hover:text-white font-mono font-semibold text-[0.75rem] transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">chat</span>
                      <span>WhatsApp: {ph.display}</span>
                    </a>
                  ))
                ) : (
                  <span className="text-[0.74rem] text-[#86868b]">Sem telefone cadastrado</span>
                )}

                {onOpenStudentPdf && (
                  <a
                    href={
                      draft.fichaPdfDriveUrl ||
                      (draft.fichaPdfDriveId
                        ? `https://drive.google.com/file/d/${draft.fichaPdfDriveId}/view`
                        : `#doc-${draft.id}`)
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenStudentPdf(draft);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#0071e3]/10 hover:bg-[#0071e3] text-[#0066cc] hover:text-white font-semibold text-[0.74rem] transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">document_scanner</span>
                    <span>Ver Ficha PDF</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-h-[42px] px-4 sm:px-5 rounded-full bg-[#1d1d1f] hover:bg-[#ff3b30] text-white font-semibold text-[0.84rem] flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
            aria-label="Fechar grade de dados"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
            <span>Fechar</span>
          </button>
        </div>

        {/* Role Permission Banner */}
        <div
          className={`px-4 py-2.5 flex items-center justify-between text-[0.85rem] font-bold border-b ${
            canEdit
              ? 'bg-[#eaf6ef] text-[#003723] border-[#a4f3ca]'
              : 'bg-[#fff4e5] text-[#7a4100] border-[#ffd89e]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">
              {canEdit ? 'edit_square' : 'visibility'}
            </span>
            <span>
              {userRole === 'admin'
                ? 'Perfil ADMIN: Acesso pleno para editar qualquer dado ou frequência do(a) estudante.'
                : canEdit
                ? 'Perfil Regente (Sua Turma): Toque nos botões ou em qualquer célula da grade para editar.'
                : 'Perfil PEB II (Somente Visualização): Consulta liberada, edição bloqueada.'}
            </span>
          </div>
          {savedBanner && (
            <span className="px-2.5 py-0.5 rounded-full bg-[#005035] text-white text-[0.75rem] font-black">
              ✓ Salvo!
            </span>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-5 bg-[#f8faf9]">
          {/* 1. Interactive Attendance & Enrollment Cut Dashboard */}
          <section className="bg-white rounded-2xl p-4 shadow-xs border border-[#e1e3e1] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[1rem] font-black text-[#003440] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[22px] text-[#005035]">
                  analytics
                </span>
                <span>Painel Interativo de Frequência no Mês</span>
              </h3>
              <span className="text-[0.8rem] font-bold text-[#41484b]">
                {metrics.recorteLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              {/* Card 1: Recorte da Matrícula */}
              <div className="p-3 rounded-xl bg-[#f3f4f2] border border-[#c0c8cb] flex flex-col justify-between">
                <span className="text-[0.72rem] font-extrabold text-[#41484b] uppercase">
                  Dias no Recorte
                </span>
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    disabled={!canEdit || metrics.diasLetivosMatriculados <= 1}
                    onClick={() => handleDeltaRecorte(-1)}
                    className="w-8 h-8 rounded-lg bg-white border border-[#c0c8cb] font-black text-[#003440] disabled:opacity-30 cursor-pointer"
                  >
                    —
                  </button>
                  <div className="text-center">
                    <span className="text-[1.25rem] font-black text-[#003440]">
                      {metrics.diasLetivosMatriculados}
                    </span>
                    <span className="text-[0.7rem] text-[#71787b] block">
                      de {metrics.diasLetivosMes}d
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!canEdit || metrics.diasLetivosMatriculados >= metrics.diasLetivosMes}
                    onClick={() => handleDeltaRecorte(1)}
                    className="w-8 h-8 rounded-lg bg-[#003440] text-white font-black disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Card 2: Faltas no Mês */}
              <div className="p-3 rounded-xl bg-[#fff8f7] border border-[#ffdad6] flex flex-col justify-between">
                <span className="text-[0.72rem] font-extrabold text-[#ba1a1a] uppercase">
                  Faltas (Máx {metrics.maxFaltasPermitidas})
                </span>
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    disabled={!canEdit || metrics.faltas <= 0}
                    onClick={() => handleDeltaFaltas(-1)}
                    className="w-8 h-8 rounded-lg bg-white border border-[#c0c8cb] font-black text-[#003440] disabled:opacity-30 cursor-pointer"
                  >
                    —
                  </button>
                  <div className="text-center">
                    <span className="text-[1.25rem] font-black text-[#ba1a1a]">
                      {metrics.faltas}
                    </span>
                    <span className="text-[0.7rem] text-[#71787b] block">faltas</span>
                  </div>
                  <button
                    type="button"
                    disabled={!canEdit || metrics.faltas >= metrics.maxFaltasPermitidas}
                    onClick={() => handleDeltaFaltas(1)}
                    className="w-8 h-8 rounded-lg bg-[#ba1a1a] text-white font-black disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Card 3: Atestados Apresentados */}
              <div className="p-3 rounded-xl bg-[#eaf6ef] border border-[#a4f3ca] flex flex-col justify-between">
                <span className="text-[0.72rem] font-extrabold text-[#005035] uppercase">
                  Atestados (Máx {metrics.maxAtestadosPermitidos})
                </span>
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    disabled={!canEdit || metrics.atestados <= 0}
                    onClick={() => handleDeltaAtestados(-1)}
                    className="w-8 h-8 rounded-lg bg-white border border-[#a4f3ca] font-black text-[#005035] disabled:opacity-30 cursor-pointer"
                  >
                    —
                  </button>
                  <div className="text-center">
                    <span className="text-[1.25rem] font-black text-[#005035]">
                      {metrics.atestados}
                    </span>
                    <span className="text-[0.7rem] text-[#005035] block">atestados</span>
                  </div>
                  <button
                    type="button"
                    disabled={!canEdit || metrics.atestados >= metrics.maxAtestadosPermitidos}
                    onClick={() => handleDeltaAtestados(1)}
                    className="w-8 h-8 rounded-lg bg-[#005035] text-white font-black disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Card 4: Porcentagem no Recorte */}
              <div className="p-3 rounded-xl bg-[#c3e5f4]/40 border border-[#003440]/20 flex flex-col justify-between text-center">
                <span className="text-[0.72rem] font-extrabold text-[#003440] uppercase">
                  % Frequência (Recorte)
                </span>
                <div className="my-1">
                  <span className="text-[1.6rem] font-black text-[#003440] leading-none">
                    {metrics.frequenciaPercent}%
                  </span>
                  <span className="text-[0.72rem] font-bold text-[#41484b] block">
                    {metrics.presencas} presenças em {metrics.diasLetivosMatriculados}d
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Interactive Data Grid of All 48 SED Fields */}
          <section className="bg-white rounded-2xl p-4 shadow-xs border border-[#e1e3e1] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-[1rem] font-black text-[#003440] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[22px] text-[#003440]">
                  grid_on
                </span>
                <span>Grade Interativa de Dados Cadastrais (48 Campos SED)</span>
              </h3>

              <input
                type="text"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                placeholder="Buscar campo (ex: CPF, SUS, Mãe, CEP)..."
                className="px-3 py-1.5 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] text-[0.85rem] font-semibold focus:bg-white focus:outline-none"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'todos', label: 'Todos (48)' },
                { id: 'escolar', label: '🏫 Escolar & Matrícula' },
                { id: 'pessoal', label: '👧 Pessoal & Saúde' },
                { id: 'familia', label: '👨‍👩‍👧 Família & Contatos' },
                { id: 'endereco', label: '🏠 Endereço & Ônibus' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id as GridCategory)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-[0.8rem] cursor-pointer transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-[#003440] text-white'
                      : 'bg-[#f3f4f2] text-[#41484b] hover:bg-[#e7e8e6]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Interactive Cells Grid: 1 col Mobile, 2 cols Tablet, 3 cols Laptop, 4 cols Widescreen 1920x1080 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[420px] overflow-y-auto pr-1 pt-1">
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
                        ? 'bg-white border-2 border-[#005035] shadow-sm'
                        : canEdit
                        ? 'bg-[#f9faf8] hover:bg-[#f3f4f2] border-[#e1e3e1] cursor-pointer'
                        : 'bg-[#f9faf8] border-[#edeeec]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[0.68rem] font-extrabold text-[#436370] uppercase tracking-tight">
                        {field.label}
                      </span>
                      {canEdit && (
                        <span className="material-symbols-outlined text-[14px] text-[#71787b]">
                          edit
                        </span>
                      )}
                    </div>

                    {isEditingThis ? (
                      <input
                        type="text"
                        autoFocus
                        value={String(draft[field.key] ?? '')}
                        placeholder={field.placeholder || 'Digite o valor...'}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        onBlur={() => setEditingKey(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setEditingKey(null);
                        }}
                        className="w-full mt-1 px-2 py-1 bg-[#f3f4f2] text-[#003440] font-bold text-[0.9rem] rounded-lg border border-[#005035] focus:outline-none"
                      />
                    ) : (
                      <p
                        className={`text-[0.9rem] font-bold mt-0.5 break-words ${
                          displayVal === '—' ? 'text-[#9aa0a3] font-normal' : 'text-[#191c1b]'
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
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-[#edeeec] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 min-h-[48px] rounded-xl bg-[#edeeec] hover:bg-[#e7e8e6] text-[#003440] font-extrabold text-[0.95rem] cursor-pointer"
          >
            Fechar
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex-1 min-h-[48px] rounded-xl bg-[#005035] hover:bg-[#003723] text-white font-black text-[1rem] flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">save</span>
              <span>Salvar Dados e Frequência do(a) Estudante</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
