import React, { useState } from 'react';
import {
  AuthorizedUser,
  ClassGroup,
  UserRole,
  AttendanceWindowConfig,
  UserAccessSessionLog,
} from '../types';
import { INSTITUTIONAL_EMAIL_DOMAIN } from '../data/mockData';
import {
  isValidInstitutionalEmail,
  evaluateAttendanceLaunchWindow,
  formatDurationHuman,
} from '../services/db';
import { StudentAvatar } from './StudentAvatar';

interface UsuariosAcessoScreenProps {
  authorizedUsers: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  onClearAccessLogs?: () => void;
  classes: ClassGroup[];
  currentUserEmail: string;
  userRole: UserRole;
  attendanceWindowConfig: AttendanceWindowConfig;
  onUpdateAttendanceWindowConfig: (nextConfig: AttendanceWindowConfig) => void;
  onSaveAuthorizedUsers: (updatedUsers: AuthorizedUser[]) => void;
  onNavigateToDatabaseEmailsTab?: () => void;
  onBack: () => void;
}

export const UsuariosAcessoScreen: React.FC<UsuariosAcessoScreenProps> = ({
  authorizedUsers,
  accessSessionLogs = [],
  onClearAccessLogs,
  classes,
  currentUserEmail,
  userRole,
  attendanceWindowConfig,
  onUpdateAttendanceWindowConfig,
  onSaveAuthorizedUsers,
  onNavigateToDatabaseEmailsTab,
  onBack,
}) => {
  const [emailPrefix, setEmailPrefix] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('usuario');
  const [assignedClassId, setAssignedClassId] = useState<string>(classes[0]?.id || 'g04a');
  const [searchTerm, setSearchTerm] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [onlyAccessedFilter, setOnlyAccessedFilter] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [customDomain, setCustomDomain] = useState<string>(() => {
    try {
      return localStorage.getItem('emeb_candelario_custom_domain_2027') || 'emebjfreitas.educacao.jundiai.sp.gov.br';
    } catch {
      return 'emebjfreitas.educacao.jundiai.sp.gov.br';
    }
  });
  const [githubRepoUrl, setGithubRepoUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('emeb_candelario_github_repo_2027') || 'https://github.com/emebjfreitas/diario-frequencia-2027';
    } catch {
      return 'https://github.com/emebjfreitas/diario-frequencia-2027';
    }
  });
  const [copiedDeployKey, setCopiedDeployKey] = useState<string | null>(null);

  const canManage = userRole === 'admin';

  const triggerFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    window.setTimeout(() => setFeedbackMsg(null), 4500);
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    // Clean user input: if they typed the full email or only the prefix before @educacao.jundiai.sp.gov.br
    let fullEmail = emailPrefix.trim().toLowerCase();
    if (!fullEmail.includes('@')) {
      fullEmail = `${fullEmail}${INSTITUTIONAL_EMAIL_DOMAIN}`;
    }

    if (!isValidInstitutionalEmail(fullEmail)) {
      triggerFeedback(
        'error',
        `Somente e-mails institucionais com final ${INSTITUTIONAL_EMAIL_DOMAIN} podem ser cadastrados.`
      );
      return;
    }

    const localPart = fullEmail.replace(INSTITUTIONAL_EMAIL_DOMAIN, '').trim();
    if (!localPart || localPart.length < 2) {
      triggerFeedback('error', 'Informe o identificador do e-mail antes do @educacao.jundiai.sp.gov.br.');
      return;
    }

    const exists = authorizedUsers.some(
      (u) => u.email.trim().toLowerCase() === fullEmail
    );
    if (exists) {
      triggerFeedback('error', `O e-mail ${fullEmail} já está cadastrado na lista de acessos.`);
      return;
    }

    const targetClass = classes.find((c) => c.id === assignedClassId);
    const assignedClassName =
      role === 'admin'
        ? 'Todas as 40 Turmas (Acesso Pleno)'
        : role === 'peb2'
        ? 'Todas as Turmas (Somente Visualização)'
        : targetClass
        ? `${targetClass.name} (${targetClass.shift.replace('Turno ', '')})`
        : 'GRUPO 04 A (Manhã)';

    const newUser: AuthorizedUser = {
      id: `usr-${Date.now()}`,
      email: fullEmail,
      name: name.trim() || `Servidor(a) ${localPart}`,
      role,
      assignedClassId: role === 'usuario' ? assignedClassId : 'all',
      assignedClassName,
      active: true,
      createdAt: new Date().toLocaleDateString('pt-BR'),
    };

    onSaveAuthorizedUsers([newUser, ...authorizedUsers]);
    setEmailPrefix('');
    setName('');
    triggerFeedback(
      'success',
      `Acesso concedido para ${fullEmail} (${
        role === 'admin'
          ? 'ADMIN'
          : role === 'usuario'
          ? `PEB I • ${assignedClassName}`
          : 'PEB II • Visualização'
      }).`
    );
  };

  const handleChangeUserRole = (userId: string, newRole: UserRole) => {
    if (!canManage) return;
    const next = authorizedUsers.map((u) => {
      if (u.id !== userId) return u;
      const defaultClass = classes.find((c) => c.id === (u.assignedClassId !== 'all' ? u.assignedClassId : classes[0]?.id)) || classes[0];
      const nextAssignedClassId = newRole === 'usuario' ? (defaultClass?.id || 'g04a') : 'all';
      const nextAssignedClassName =
        newRole === 'admin'
          ? 'Todas as 40 Turmas (Acesso Pleno)'
          : newRole === 'peb2'
          ? 'Todas as Turmas (Somente Visualização)'
          : defaultClass
          ? `${defaultClass.name} (${defaultClass.shift.replace('Turno ', '')})`
          : 'GRUPO 04 A (Manhã)';
      return {
        ...u,
        role: newRole,
        assignedClassId: nextAssignedClassId,
        assignedClassName: nextAssignedClassName,
      };
    });
    onSaveAuthorizedUsers(next);
    triggerFeedback('success', 'Nível de permissão atualizado instantaneamente.');
  };

  const handleChangeUserClass = (userId: string, newClassId: string) => {
    if (!canManage) return;
    const targetClass = classes.find((c) => c.id === newClassId);
    if (!targetClass) return;
    const next = authorizedUsers.map((u) =>
      u.id === userId
        ? {
            ...u,
            assignedClassId: targetClass.id,
            assignedClassName: `${targetClass.name} (${targetClass.shift.replace('Turno ', '')})`,
          }
        : u
    );
    onSaveAuthorizedUsers(next);
    triggerFeedback('success', `Turma vinculada alterada para ${targetClass.name}.`);
  };

  const handleToggleActive = (userId: string) => {
    if (!canManage) return;
    const next = authorizedUsers.map((u) =>
      u.id === userId ? { ...u, active: !u.active } : u
    );
    onSaveAuthorizedUsers(next);
  };

  const handleRemoveUser = (user: AuthorizedUser) => {
    if (!canManage) return;
    const adminsActive = authorizedUsers.filter((u) => u.role === 'admin' && u.active);
    if (user.role === 'admin' && adminsActive.length <= 1) {
      triggerFeedback('error', 'É obrigatório manter pelo menos 1 e-mail Administrador ativo.');
      return;
    }
    const next = authorizedUsers.filter((u) => u.id !== user.id);
    onSaveAuthorizedUsers(next);
    triggerFeedback('success', `Acesso de ${user.email} revogado.`);
  };

  const filteredUsers = authorizedUsers.filter((u) => {
    const matchesText =
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.assignedClassName.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesText) return false;
    if (onlyAccessedFilter) {
      return (u.totalAccessCount || 0) > 0;
    }
    return true;
  });

  const filteredLogs = accessSessionLogs.filter(
    (l) =>
      l.email.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
      l.name.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
      l.assignedClassName.toLowerCase().includes(logSearchTerm.toLowerCase())
  );

  // KPIs de Monitoramento de Acessos e Tempo de Uso
  const totalUsersWhoAccessed = authorizedUsers.filter(
    (u) => (u.totalAccessCount || 0) > 0
  ).length;
  const totalAccessesCount = authorizedUsers.reduce(
    (acc, u) => acc + (u.totalAccessCount || 0),
    0
  );
  const totalPlatformDurationSeconds = authorizedUsers.reduce(
    (acc, u) => acc + (u.totalDurationSeconds || 0),
    0
  );
  const activeNowSessionsCount = accessSessionLogs.filter((l) => {
    if (l.logoutTimeISO) return false;
    const diffMs = Date.now() - new Date(l.lastHeartbeatISO).getTime();
    return diffMs < 120000; // heartbeat nos últimos 2 minutos
  }).length;

  const windowEval = evaluateAttendanceLaunchWindow(attendanceWindowConfig);

  const handleToggleExceptionalLaunch = () => {
    if (!canManage) return;
    const nextState = !attendanceWindowConfig.exceptionalOverrideOpen;
    onUpdateAttendanceWindowConfig({
      ...attendanceWindowConfig,
      exceptionalOverrideOpen: nextState,
      updatedByEmail: currentUserEmail,
      updatedAt: new Date().toLocaleString('pt-BR'),
    });
    triggerFeedback(
      'success',
      nextState
        ? 'Botão "Lançar Faltas" LIBERADO EXCEPCIONALMENTE para todas as turmas!'
        : 'Liberação excepcional encerrada. O botão "Lançar Faltas" segue a regra automática do calendário (último dia letivo e 2 primeiros do próximo mês).'
    );
  };

  return (
    <div className="pb-28 space-y-5">
      {/* Header Banner */}
      <section className="bg-[#003440] text-white rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-md bg-[#a4f3ca] text-[#003440] text-[0.72rem] font-black uppercase">
              Controle de Acesso Restrito & Janela de Lançamento
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-white/15 text-white text-[0.72rem] font-bold font-mono">
              Somente {INSTITUTIONAL_EMAIL_DOMAIN}
            </span>
          </div>
          <h1 className="text-[1.35rem] sm:text-[1.5rem] font-extrabold tracking-tight">
            Gerenciamento de Acessos e Liberação do Botão Lançar Faltas
          </h1>
          <p className="text-[0.88rem] text-[#c3e5f4] max-w-3xl">
            Gerencie os e-mails institucionais autorizados e controle a abertura excepcional do botão de lançamento mensal de faltas. O salvamento na Planilha Google é 100% automático a cada clique.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigateToDatabaseEmailsTab && (
            <button
              type="button"
              onClick={onNavigateToDatabaseEmailsTab}
              className="min-h-[46px] px-4 rounded-xl bg-[#a4f3ca] hover:bg-[#8ee8b9] text-[#003440] font-black text-[0.85rem] flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">table_chart</span>
              <span>Ver Aba E-mails na Planilha</span>
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="min-h-[46px] px-4 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[0.875rem] flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            <span>Voltar às Turmas</span>
          </button>
        </div>
      </section>

      {/* Painel de Controle da Janela do Botão "Lançar Faltas" (Último dia letivo + 2 primeiros do próximo mês + Liberação Excepcional) */}
      <section
        className={`rounded-2xl p-5 shadow-xs border-2 transition-all ${
          windowEval.isAllowedToLaunch
            ? 'bg-[#e8f8ef] border-[#005035]'
            : 'bg-[#fff8f0] border-[#7a4100]/40'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-[0.76rem] font-black uppercase inline-flex items-center gap-1.5 ${
                  windowEval.isAllowedToLaunch
                    ? 'bg-[#005035] text-white'
                    : 'bg-[#7a4100] text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {windowEval.isAllowedToLaunch ? 'lock_open' : 'schedule'}
                </span>
                <span>
                  {windowEval.isAllowedToLaunch
                    ? 'BOTÃO "LANÇAR FALTAS" ABERTO AGORA'
                    : 'BOTÃO "LANÇAR FALTAS" AGUARDANDO DATA DE FECHAMENTO'}
                </span>
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-white text-[#003440] font-extrabold text-[0.75rem] border border-[#c0c8cb]">
                Botão "Visualizar Estudantes": Sempre Disponível (24h)
              </span>
            </div>

            <h2 className="text-[1.15rem] font-black text-[#003440]">
              Regra Oficial do Botão "Lançar Faltas" + Liberação Excepcional
            </h2>
            <p className="text-[0.86rem] text-[#191c1b] font-semibold">
              • <strong>Regra Automática:</strong> O botão de <em>Lançar Faltas</em> abre sozinho apenas no <strong>último dia letivo do mês</strong> e nos <strong>2 primeiros dias letivos do próximo mês</strong>. O botão de <em>Visualizar Estudantes</em> fica aberto o tempo todo.
            </p>
            <p className="text-[0.83rem] font-bold text-[#005035]">
              • <strong>Status Atual:</strong> {windowEval.reasonLabel}
              {attendanceWindowConfig.updatedAt && (
                <span className="text-[#41484b] font-normal">
                  {' '}
                  (Última alteração excepcional em {attendanceWindowConfig.updatedAt})
                </span>
              )}
            </p>
          </div>

          {canManage && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleToggleExceptionalLaunch}
                className={`min-h-[56px] px-5 py-3 rounded-2xl font-black text-[0.92rem] flex items-center justify-center gap-2.5 shadow-sm cursor-pointer transition-all active:scale-98 ${
                  attendanceWindowConfig.exceptionalOverrideOpen
                    ? 'bg-[#ba1a1a] hover:bg-[#93000a] text-white'
                    : 'bg-[#005035] hover:bg-[#003824] text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">
                  {attendanceWindowConfig.exceptionalOverrideOpen
                    ? 'lock_reset'
                    : 'key'}
                </span>
                <div className="text-left">
                  <span className="block leading-tight">
                    {attendanceWindowConfig.exceptionalOverrideOpen
                      ? 'Encerrar Abertura Excepcional'
                      : 'Abrir Excepcionalmente o Botão Lançar'}
                  </span>
                  <span className="block text-[0.72rem] opacity-90 font-semibold">
                    {attendanceWindowConfig.exceptionalOverrideOpen
                      ? 'Voltar para regra automática do calendário'
                      : 'Liberar preenchimento agora para os professores'}
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>
      </section>

      {feedbackMsg && (
        <div
          className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 font-bold text-[0.9rem] ${
            feedbackMsg.type === 'success'
              ? 'bg-[#e8f8ef] border-[#005035] text-[#005035]'
              : 'bg-[#ffdad6]/70 border-[#ba1a1a] text-[#ba1a1a]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px]">
              {feedbackMsg.type === 'success' ? 'verified' : 'error'}
            </span>
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-[0.8rem] underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Cadastrar Novo E-mail Autorizado */}
      {canManage ? (
        <section className="bg-white rounded-2xl p-5 shadow-xs border-2 border-[#003440]/20">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[#005035] text-[24px]">
              person_add
            </span>
            <div>
              <h2 className="text-[1.1rem] font-extrabold text-[#003440]">
                Conceder Acesso a Novo E-mail Institucional
              </h2>
              <p className="text-[0.8rem] text-[#41484b]">
                Cadastre o e-mail <span className="font-mono font-bold text-[#003440]">{INSTITUTIONAL_EMAIL_DOMAIN}</span> e defina o limite de acesso (Turma específica ou Visualização).
              </p>
            </div>
          </div>

          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
            {/* E-mail Institucional */}
            <div className="md:col-span-4">
              <label className="block text-[0.78rem] font-extrabold text-[#003440] uppercase mb-1">
                1. E-mail Institucional *
              </label>
              <div className="flex items-stretch rounded-xl border-2 border-[#c0c8cb] focus-within:border-[#003440] bg-[#f3f4f2] overflow-hidden">
                <input
                  type="text"
                  value={emailPrefix}
                  onChange={(e) => setEmailPrefix(e.target.value)}
                  placeholder="nome.sobrenome"
                  required
                  className="w-full min-h-[48px] px-3 bg-transparent text-[#191c1b] font-bold text-[0.9rem] focus:outline-none"
                />
                {!emailPrefix.includes('@') && (
                  <span className="px-2.5 bg-[#e1e3e1] text-[#003440] font-mono font-bold text-[0.76rem] flex items-center shrink-0 border-l border-[#c0c8cb]">
                    {INSTITUTIONAL_EMAIL_DOMAIN}
                  </span>
                )}
              </div>
            </div>

            {/* Nome do Professor / Servidor */}
            <div className="md:col-span-3">
              <label className="block text-[0.78rem] font-extrabold text-[#003440] uppercase mb-1">
                2. Nome do(a) Docente / Servidor(a) *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Profª Juliana Martins"
                required
                className="w-full min-h-[48px] px-3.5 rounded-xl border-2 border-[#c0c8cb] bg-[#f3f4f2] focus:bg-white focus:border-[#003440] text-[#191c1b] font-bold text-[0.9rem] focus:outline-none"
              />
            </div>

            {/* Tipo de Permissão / Limite */}
            <div className="md:col-span-2">
              <label className="block text-[0.78rem] font-extrabold text-[#003440] uppercase mb-1">
                3. Limite de Acesso *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full min-h-[48px] px-3 rounded-xl border-2 border-[#c0c8cb] bg-[#f3f4f2] text-[#003440] font-extrabold text-[0.85rem] focus:outline-none focus:border-[#003440] cursor-pointer"
              >
                <option value="usuario">PEB I • Limitar a 1 Turma</option>
                <option value="peb2">PEB II • Só Visualização</option>
                <option value="admin">ADMIN • Acesso Total</option>
              </select>
            </div>

            {/* Turma Vinculada (quando PEB I / Usuário Limitado) */}
            <div className="md:col-span-3">
              <label className="block text-[0.78rem] font-extrabold text-[#003440] uppercase mb-1">
                4. Turma Liberada {role !== 'usuario' && '(Automático)'}
              </label>
              {role === 'usuario' ? (
                <select
                  value={assignedClassId}
                  onChange={(e) => setAssignedClassId(e.target.value)}
                  className="w-full min-h-[48px] px-3 rounded-xl border-2 border-[#005035] bg-[#e8f8ef] text-[#005035] font-extrabold text-[0.85rem] focus:outline-none cursor-pointer"
                >
                  <optgroup label="☀️ Turno Manhã (20 Turmas)">
                    {classes
                      .filter((c) => c.shift === 'Turno Manhã')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.room}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="🌤️ Turno Tarde (20 Turmas)">
                    {classes
                      .filter((c) => c.shift === 'Turno Tarde')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.room}
                        </option>
                      ))}
                  </optgroup>
                </select>
              ) : (
                <div className="min-h-[48px] px-3 rounded-xl border-2 border-[#c0c8cb] bg-[#edeeec] text-[#41484b] font-bold text-[0.82rem] flex items-center">
                  {role === 'admin'
                    ? 'Todas as 40 Turmas (Edição)'
                    : 'Todas as 40 Turmas (Leitura)'}
                </div>
              )}
            </div>

            <div className="md:col-span-12 flex justify-end pt-1">
              <button
                type="submit"
                className="min-h-[48px] px-6 rounded-xl bg-[#005035] hover:bg-[#003824] text-white font-black text-[0.92rem] flex items-center gap-2 shadow-xs cursor-pointer active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">verified_user</span>
                <span>Autorizar e Cadastrar E-mail</span>
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div className="bg-[#fff4e5] border-2 border-[#7a4100]/40 rounded-2xl p-4 text-[#7a4100] font-bold text-[0.9rem] flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[22px]">lock</span>
          <span>
            Somente usuários com perfil <strong>ADMIN</strong> podem adicionar ou alterar permissões de e-mails cadastrados. Seu e-mail atual: <span className="font-mono">{currentUserEmail}</span>
          </span>
        </div>
      )}

      {/* Painel de Monitoramento de Acessos e Tempo Conectado por Usuário */}
      <section className="bg-white rounded-2xl p-5 shadow-xs border-2 border-[#005035]/25 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#edeeec]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#005035] text-white font-black text-[0.72rem] uppercase inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#a4f3ca] animate-pulse" />
                <span>Telemetria em Tempo Real (Acesso & Tempo de Uso)</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#eaf6ef] text-[#003440] font-bold text-[0.72rem]">
                Sincronizado na aba Monitoramento_Acessos_2027 da Planilha
              </span>
            </div>
            <h2 className="text-[1.15rem] font-extrabold text-[#003440] mt-1">
              Monitoramento de Acessos e Tempo Conectado de Cada Professor(a)
            </h2>
            <p className="text-[0.82rem] text-[#2c373a] font-medium">
              Acompanhe quantas vezes cada educador entrou na Lista Piloto 2027, o horário exato de entrada/saída, a tela visitada e a duração de cada sessão.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setOnlyAccessedFilter(!onlyAccessedFilter)}
              className={`min-h-[42px] px-3.5 rounded-xl font-extrabold text-[0.78rem] flex items-center gap-1.5 cursor-pointer border transition-all ${
                onlyAccessedFilter
                  ? 'bg-[#003440] text-white border-[#003440]'
                  : 'bg-[#f4f7f5] text-[#003440] border-[#a8b5b9] hover:bg-[#e7ece9]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt</span>
              <span>
                {onlyAccessedFilter
                  ? 'Mostrando Só Quem Já Acessou'
                  : 'Filtrar Quem Já Acessou'}
              </span>
            </button>
          </div>
        </div>

        {/* 4 Cards de Resumo de Telemetria */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#f4f7f5] p-3.5 rounded-xl border border-[#d5dddf]">
            <span className="text-[0.7rem] font-extrabold uppercase text-[#566366] block">
              Online Agora (Sessão Ativa)
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[1.45rem] font-black text-[#005035] tabular-nums">
                {activeNowSessionsCount}
              </span>
              <span className="text-[0.75rem] font-bold text-[#005035]">
                conectado(s)
              </span>
            </div>
          </div>

          <div className="bg-[#f4f7f5] p-3.5 rounded-xl border border-[#d5dddf]">
            <span className="text-[0.7rem] font-extrabold uppercase text-[#566366] block">
              Professores que Acessaram
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[1.45rem] font-black text-[#003440] tabular-nums">
                {totalUsersWhoAccessed}
              </span>
              <span className="text-[0.75rem] font-bold text-[#566366]">
                de {authorizedUsers.length} cadastrados
              </span>
            </div>
          </div>

          <div className="bg-[#f4f7f5] p-3.5 rounded-xl border border-[#d5dddf]">
            <span className="text-[0.7rem] font-extrabold uppercase text-[#566366] block">
              Total de Logins Realizados
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[1.45rem] font-black text-[#003440] tabular-nums">
                {totalAccessesCount}
              </span>
              <span className="text-[0.75rem] font-bold text-[#566366]">
                acessos registrados
              </span>
            </div>
          </div>

          <div className="bg-[#f4f7f5] p-3.5 rounded-xl border border-[#d5dddf]">
            <span className="text-[0.7rem] font-extrabold uppercase text-[#566366] block">
              Tempo Total de Uso Acumulado
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[1.45rem] font-black text-[#005035] tabular-nums">
                {formatDurationHuman(totalPlatformDurationSeconds)}
              </span>
              <span className="text-[0.75rem] font-bold text-[#566366]">
                em todas as sessões
              </span>
            </div>
          </div>
        </div>

        {/* Histórico Cronológico de Sessões (Entrada, Saída e Tempo de Cada Acesso) */}
        <div className="space-y-2.5 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-[0.95rem] font-extrabold text-[#003440] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[20px] text-[#005035]">
                history
              </span>
              <span>
                Histórico Detalhado de Sessões ({filteredLogs.length})
              </span>
            </h3>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={logSearchTerm}
                onChange={(e) => setLogSearchTerm(e.target.value)}
                placeholder="Filtrar histórico por professor ou turma..."
                className="min-h-[38px] px-3 rounded-xl bg-[#f4f7f5] border border-[#c0c8cb] text-[0.78rem] font-semibold text-[#003440] w-full sm:w-64"
              />
              {canManage && accessSessionLogs.length > 0 && onClearAccessLogs && (
                <button
                  type="button"
                  onClick={onClearAccessLogs}
                  className="min-h-[38px] px-3 rounded-xl bg-[#ffdad6]/60 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white font-bold text-[0.74rem] shrink-0 cursor-pointer transition-colors"
                >
                  Limpar Histórico
                </button>
              )}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#f4f7f5] border border-[#d5dddf] text-[0.82rem] text-[#566366] font-semibold text-center">
              Nenhuma sessão registrada ainda neste navegador/planilha. Assim que os professores entrarem pelo login Google Workspace, cada acesso e o tempo conectado aparecerão aqui em tempo real.
            </div>
          ) : (
            <div className="border border-[#c0c8cb] rounded-xl overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[780px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#003440] text-white text-[0.7rem] uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-extrabold">Status</th>
                    <th className="py-2.5 px-3 font-extrabold">Educador(a) / E-mail</th>
                    <th className="py-2.5 px-3 font-extrabold">Turma / Perfil</th>
                    <th className="py-2.5 px-3 font-extrabold">Entrada (Login)</th>
                    <th className="py-2.5 px-3 font-extrabold">Último Pulso / Saída</th>
                    <th className="py-2.5 px-3 font-extrabold">Tempo Conectado</th>
                    <th className="py-2.5 px-3 font-extrabold">Tela Visitada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edeeec] text-[0.78rem]">
                  {filteredLogs.slice(0, 80).map((log) => {
                    const isOnline =
                      !log.logoutTimeISO &&
                      Date.now() - new Date(log.lastHeartbeatISO).getTime() < 120000;
                    return (
                      <tr key={log.id} className="hover:bg-[#f4f7f5]">
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-black text-[0.68rem] inline-flex items-center gap-1 ${
                              isOnline
                                ? 'bg-[#a4f3ca] text-[#003723]'
                                : 'bg-[#edeeec] text-[#41484b]'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isOnline ? 'bg-[#005035] animate-ping' : 'bg-[#71787b]'
                              }`}
                            />
                            {isOnline ? 'ONLINE' : 'ENCERRADA'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-[#003440] leading-tight">
                            {log.name}
                          </p>
                          <p className="font-mono text-[0.7rem] text-[#566366]">
                            {log.email}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#2c373a]">
                          {log.assignedClassName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[0.74rem] text-[#003440] font-bold">
                          {new Date(log.loginTimeISO).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[0.74rem] text-[#41484b]">
                          {new Date(
                            log.logoutTimeISO || log.lastHeartbeatISO
                          ).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2.5 py-1 rounded-lg bg-[#e8f8ef] text-[#005035] font-mono font-black text-[0.76rem] tabular-nums">
                            {formatDurationHuman(log.durationSeconds)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#003440]">
                          {log.lastScreen || '1. Turmas'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Tabela Nominal de E-mails Autorizados */}
      <section className="bg-white rounded-2xl p-5 shadow-xs border border-[#e1e3e1] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[1.05rem] font-extrabold text-[#003440]">
              E-mails Institucionais Cadastrados ({filteredUsers.length})
            </h3>
            <p className="text-[0.8rem] text-[#41484b]">
              Qualquer e-mail fora desta lista ou sem o domínio <span className="font-mono font-bold">{INSTITUTIONAL_EMAIL_DOMAIN}</span> tem o login bloqueado.
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#71787b] text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar e-mail, docente ou turma..."
              className="w-full min-h-[42px] pl-10 pr-3 rounded-xl bg-[#f3f4f2] border border-[#c0c8cb] text-[0.85rem] font-semibold focus:outline-none focus:bg-white focus:border-[#003440]"
            />
          </div>
        </div>

        <div className="border border-[#c0c8cb] rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1040px]">
            <thead>
              <tr className="bg-[#003440] text-white text-[0.72rem] uppercase tracking-wider">
                <th className="py-3 px-3 font-extrabold">Status</th>
                <th className="py-3 px-3 font-extrabold">E-mail Institucional ({INSTITUTIONAL_EMAIL_DOMAIN})</th>
                <th className="py-3 px-3 font-extrabold">Servidor(a) / Docente</th>
                <th className="py-3 px-3 font-extrabold">Nível de Acesso Concedido</th>
                <th className="py-3 px-3 font-extrabold">Turma Liberada (Limite)</th>
                <th className="py-3 px-3 font-extrabold text-center">Acessos</th>
                <th className="py-3 px-3 font-extrabold">Tempo Conectado</th>
                <th className="py-3 px-3 font-extrabold">Último Acesso</th>
                <th className="py-3 px-3 font-extrabold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edeeec] text-[0.82rem]">
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  className={`transition-colors ${
                    !u.active ? 'bg-[#ffdad6]/20 opacity-70' : 'hover:bg-[#f3f4f2]/70'
                  }`}
                >
                  <td className="py-3 px-3">
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => handleToggleActive(u.id)}
                      className={`px-2.5 py-1 rounded-lg font-black text-[0.7rem] inline-flex items-center gap-1 cursor-pointer ${
                        u.active
                          ? 'bg-[#a4f3ca]/60 text-[#005035]'
                          : 'bg-[#ffdad6] text-[#ba1a1a]'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-current"></span>
                      {u.active ? 'AUTORIZADO' : 'BLOQUEADO'}
                    </button>
                  </td>

                  <td className="py-3 px-3 font-mono font-bold text-[#003440]">
                    {u.email}
                  </td>

                  <td className="py-3 px-3 font-bold text-[#151a18]">
                    <div className="flex items-center gap-2.5">
                      <StudentAvatar name={u.name || u.email} size="sm" />
                      <span>{u.name}</span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    {canManage ? (
                      <select
                        value={u.role}
                        onChange={(e) =>
                          handleChangeUserRole(u.id, e.target.value as UserRole)
                        }
                        className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[0.76rem] border cursor-pointer ${
                          u.role === 'admin'
                            ? 'bg-[#003440] text-white border-[#003440]'
                            : u.role === 'usuario'
                            ? 'bg-[#e8f8ef] text-[#005035] border-[#005035]'
                            : 'bg-[#fff4e5] text-[#7a4100] border-[#7a4100]'
                        }`}
                      >
                        <option value="usuario">PEB I (Limitado à Turma)</option>
                        <option value="peb2">PEB II (Só Visualização)</option>
                        <option value="admin">ADMIN (Acesso Pleno)</option>
                      </select>
                    ) : (
                      <span className="font-extrabold text-[#003440]">
                        {u.role === 'admin'
                          ? 'ADMIN (Acesso Pleno)'
                          : u.role === 'usuario'
                          ? 'PEB I (Limitado à Turma)'
                          : 'PEB II (Só Visualização)'}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    {canManage && u.role === 'usuario' ? (
                      <select
                        value={u.assignedClassId}
                        onChange={(e) => handleChangeUserClass(u.id, e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#f3f4f2] border border-[#c0c8cb] text-[#003440] font-extrabold text-[0.78rem] cursor-pointer"
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.shift.replace('Turno ', '')})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-bold text-[#41484b]">
                        {u.assignedClassName}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-mono font-black text-[0.76rem] tabular-nums ${
                        (u.totalAccessCount || 0) > 0
                          ? 'bg-[#c3e5f4] text-[#001f29]'
                          : 'bg-[#f3f4f2] text-[#71787b]'
                      }`}
                    >
                      {u.totalAccessCount || 0}x
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex flex-col">
                      <span className="font-mono font-black text-[0.78rem] text-[#005035] tabular-nums">
                        Total: {formatDurationHuman(u.totalDurationSeconds)}
                      </span>
                      <span className="font-mono text-[0.68rem] text-[#566366] tabular-nums">
                        Última: {formatDurationHuman(u.lastSessionDurationSeconds)}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    {u.lastLoginAt ? (
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-[0.74rem] text-[#003440]">
                          {u.lastLoginAt}
                        </span>
                        {u.lastScreenVisited && (
                          <span className="text-[0.68rem] text-[#005035] font-semibold">
                            Tela: {u.lastScreenVisited}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[0.74rem] text-[#71787b] font-semibold">
                        Nunca acessou
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-center">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(u)}
                        title="Revogar acesso deste e-mail"
                        className="px-2.5 py-1 rounded-lg bg-[#ffdad6]/60 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white font-bold text-[0.75rem] inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          delete
                        </span>
                        <span>Remover</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Hospedagem no GitHub Pages + Endereço Personalizado (CNAME) + Updates em Tempo Real */}
      <section className="bg-white rounded-2xl p-5 shadow-xs border-2 border-[#003440]/20 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#edeeec]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#003440] text-white font-black text-[0.72rem] uppercase">
                GitHub Pages + CI/CD Actions Configurado
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#eaf6ef] text-[#005035] font-black text-[0.72rem]">
                Updates em Tempo Real (Sheets + Drive + GitHub)
              </span>
            </div>
            <h3 className="text-[1.15rem] font-extrabold text-[#003440] mt-1">
              Hospedagem no GitHub com Endereço Personalizado e Atualização em Tempo Real
            </h3>
            <p className="text-[0.84rem] text-[#2c373a] font-medium">
              O projeto já inclui o workflow oficial <code className="font-mono bg-[#f3f4f2] px-1.5 py-0.5 rounded">.github/workflows/deploy-github-pages.yml</code>, suporte a rotas <code className="font-mono">404.html</code> e arquivo <code className="font-mono bg-[#f3f4f2] px-1.5 py-0.5 rounded">public/CNAME</code> para domínio personalizado.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              const cnameBlob = new Blob([`${customDomain.trim()}\n`], {
                type: 'text/plain;charset=utf-8',
              });
              const url = URL.createObjectURL(cnameBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'CNAME';
              a.click();
              URL.revokeObjectURL(url);
              triggerFeedback('success', `Arquivo CNAME gerado para o endereço ${customDomain}`);
            }}
            className="min-h-[44px] px-4 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-black text-[0.82rem] flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Baixar Arquivo CNAME</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Endereço Personalizado (CNAME) */}
          <div className="bg-[#f4f7f5] p-4 rounded-xl border border-[#a8b5b9] space-y-2">
            <label className="block text-[0.78rem] font-extrabold text-[#003440] uppercase">
              1. Endereço Personalizado (Custom Domain / CNAME)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customDomain}
                onChange={(e) => {
                  setCustomDomain(e.target.value);
                  try {
                    localStorage.setItem('emeb_candelario_custom_domain_2027', e.target.value);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="ex: frequencia.educacao.jundiai.sp.gov.br"
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-white border border-[#a8b5b9] font-mono text-[0.82rem] font-bold text-[#003440]"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(customDomain);
                  setCopiedDeployKey('domain');
                  setTimeout(() => setCopiedDeployKey(null), 2000);
                }}
                className="min-h-[42px] px-3 rounded-xl bg-[#005035] text-white font-black text-[0.76rem] cursor-pointer shrink-0"
              >
                {copiedDeployKey === 'domain' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-[0.74rem] text-[#2c373a] font-semibold">
              No DNS do seu domínio, aponte um registro <code className="font-mono">CNAME</code> para <code className="font-mono">&lt;seu-usuario&gt;.github.io</code> e ative <strong>Enforce HTTPS</strong> em <em>Settings → Pages</em>.
            </p>
          </div>

          {/* Repositório GitHub + Deploy Automático */}
          <div className="bg-[#f4f7f5] p-4 rounded-xl border border-[#a8b5b9] space-y-2">
            <label className="block text-[0.78rem] font-extrabold text-[#003440] uppercase">
              2. Repositório GitHub (Updates Automáticos via GitHub Actions)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={githubRepoUrl}
                onChange={(e) => {
                  setGithubRepoUrl(e.target.value);
                  try {
                    localStorage.setItem('emeb_candelario_github_repo_2027', e.target.value);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="https://github.com/emebjfreitas/diario-frequencia-2027"
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-white border border-[#a8b5b9] font-mono text-[0.82rem] font-bold text-[#003440]"
              />
              <a
                href={githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-3 rounded-xl bg-[#003440] text-white font-black text-[0.76rem] flex items-center gap-1 shrink-0"
              >
                <span>GitHub</span>
                <span className="material-symbols-outlined text-[15px]">open_in_new</span>
              </a>
            </div>
            <p className="text-[0.74rem] text-[#2c373a] font-semibold">
              Cada <code className="font-mono">git push</code> na branch <code className="font-mono">main</code> publica a nova versão em ~40 segundos, e os dados de faltas/fotos/PDFs sincronizam ao vivo com o Google Sheets e Google Drive.
            </p>
          </div>
        </div>

        {/* Passo a Passo Guiado para Subir no GitHub e Deixar Online */}
        <div className="bg-[#eaf6ef] border-2 border-[#005035]/30 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-[0.95rem] font-black text-[#003440] flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px] text-[#005035]">
                rocket_launch
              </span>
              <span>Passo a Passo Rápido: Como Subir Tudo Certinho e Deixar Online pelo GitHub</span>
            </h4>
            <button
              type="button"
              onClick={() => {
                const cmds = `git init\ngit add .\ngit commit -m "Lista Piloto 2027 - EMEB Joaquim Candelario de Freitas"\ngit branch -M main\ngit remote add origin ${githubRepoUrl.trim()}.git\ngit push -u origin main`;
                navigator.clipboard?.writeText(cmds);
                setCopiedDeployKey('git_cmds');
                setTimeout(() => setCopiedDeployKey(null), 2500);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#003440] hover:bg-[#1e4b58] text-white font-black text-[0.76rem] flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copiedDeployKey === 'git_cmds' ? 'check' : 'content_copy'}
              </span>
              <span>
                {copiedDeployKey === 'git_cmds'
                  ? 'Comandos Copiados!'
                  : 'Copiar Comandos Git'}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[0.8rem] text-[#0f1614]">
            <div className="bg-white p-3.5 rounded-xl border border-[#a8b5b9] space-y-1">
              <span className="inline-block px-2 py-0.5 rounded-md bg-[#003440] text-white font-black text-[0.7rem]">
                PASSO 1 • EXPORTAR P/ GITHUB
              </span>
              <p className="font-bold text-[#003440] mt-1">
                Enviar do AI Studio direto ao GitHub
              </p>
              <p className="text-[0.75rem] text-[#2c373a] font-medium">
                No topo direito aqui do Google AI Studio, clique no ícone do <strong>GitHub (Save to GitHub)</strong> ou em <strong>Download ZIP</strong> para criar o repositório <code className="font-mono">lista-piloto-2027</code>.
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-[#a8b5b9] space-y-1">
              <span className="inline-block px-2 py-0.5 rounded-md bg-[#005035] text-white font-black text-[0.7rem]">
                PASSO 2 • ATIVAR PAGES
              </span>
              <p className="font-bold text-[#003440] mt-1">
                Ligar o GitHub Actions no Repositório
              </p>
              <p className="text-[0.75rem] text-[#2c373a] font-medium">
                No seu repositório no GitHub, abra <strong>Settings → Pages</strong> e em <strong>Build and deployment (Source)</strong> escolha <strong>GitHub Actions</strong>. Em 40 segundos seu site estará online!
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-[#a8b5b9] space-y-1">
              <span className="inline-block px-2 py-0.5 rounded-md bg-[#003440] text-white font-black text-[0.7rem]">
                PASSO 3 • ENDEREÇO PERSONALIZADO
              </span>
              <p className="font-bold text-[#003440] mt-1">
                Domínio Próprio (Opcional)
              </p>
              <p className="text-[0.75rem] text-[#2c373a] font-medium">
                Na mesma tela <strong>Settings → Pages</strong>, digite seu domínio em <strong>Custom domain</strong>, clique em <strong>Save</strong> e marque <strong>Enforce HTTPS</strong>.
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-[#a8b5b9] space-y-1">
              <span className="inline-block px-2 py-0.5 rounded-md bg-[#ba1a1a] text-white font-black text-[0.7rem]">
                PASSO 4 • LIBERAR LOGIN GOOGLE
              </span>
              <p className="font-bold text-[#003440] mt-1">
                Autorizar URL no Firebase / Google
              </p>
              <p className="text-[0.75rem] text-[#2c373a] font-medium">
                Para o botão <em>Entrar com Google Workspace</em> funcionar na URL nova (<code className="font-mono">seu-usuario.github.io</code>), adicione esse domínio em <strong>Firebase Console → Authentication → Settings → Authorized domains</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
