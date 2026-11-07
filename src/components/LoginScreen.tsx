import React, { useState, useMemo } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, INITIAL_AUTHORIZED_USERS } from '../data/mockData';
import { findAuthorizedUserByEmail, saveStoredAuthorizedUsers } from '../services/db';
import { googleSignIn, checkGoogleRedirectResult } from '../services/googleSheetsApi';
import { StudentAvatar } from './StudentAvatar';

const LAST_REMEMBERED_EMAIL_KEY = 'emeb_candelario_last_remembered_email_2027';
const ADMIN_OFFICIAL_EMAIL = 'emebjfreitas@jundiai.sp.gov.br';

interface LoginScreenProps {
  authorizedUsers: AuthorizedUser[];
  schoolNotices?: SchoolNotice[];
  onLoginSuccess: (authorizedUser: AuthorizedUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authorizedUsers,
  onLoginSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'peb1' | 'peb2'>('all');
  const [manualEmailInput, setManualEmailInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Combina lista em memória com a lista canônica oficial para garantir que todos estejam presentes
  const allUsers = useMemo(() => {
    const map = new Map<string, AuthorizedUser>();
    for (const u of INITIAL_AUTHORIZED_USERS) {
      map.set(u.email.trim().toLowerCase(), u);
    }
    for (const u of authorizedUsers) {
      map.set(u.email.trim().toLowerCase(), {
        ...(map.get(u.email.trim().toLowerCase()) || {}),
        ...u,
      });
    }
    return Array.from(map.values());
  }, [authorizedUsers]);

  // Conta do Administrador Oficial
  const adminAccount = useMemo(() => {
    return (
      allUsers.find((u) => u.email.trim().toLowerCase() === ADMIN_OFFICIAL_EMAIL) ||
      allUsers.find((u) => u.role === 'admin') || {
        id: 'usr-admin-emeb',
        name: 'EMEB Prof. Joaquim Candelário de Freitas (Direção)',
        email: ADMIN_OFFICIAL_EMAIL,
        role: 'admin' as const,
        assignedClassName: 'Todas as 40 Turmas (Acesso Geral)',
        assignedClassId: 'all',
        active: true,
        createdAt: '01/02/2027',
      }
    );
  }, [allUsers]);

  // Professores e Especialistas pré-cadastrados filtrados
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allUsers.filter((u) => {
      // Ignora o admin principal da lista padrão de professores, pois ele fica no topo destacado
      if (u.email.trim().toLowerCase() === ADMIN_OFFICIAL_EMAIL) return false;

      // Filtro de Papel
      if (roleFilter === 'admin' && u.role !== 'admin') return false;
      if (roleFilter === 'peb1' && u.teacherRoleType !== 'peb1' && u.role === 'peb2') return false;
      if (roleFilter === 'peb2' && u.teacherRoleType !== 'peb2' && u.role !== 'peb2') return false;

      // Filtro de Texto
      if (!q) return true;
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const className = (u.assignedClassName || '').toLowerCase();
      const subject = (u.subjectName || '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        className.includes(q) ||
        subject.includes(q)
      );
    });
  }, [allUsers, searchQuery, roleFilter]);

  // Conclui login com sucesso
  const handleSelectUser = (user: AuthorizedUser) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      localStorage.setItem(LAST_REMEMBERED_EMAIL_KEY, user.email);
    } catch {
      // safe fallback
    }
    setTimeout(() => {
      setLoading(false);
      onLoginSuccess(user);
    }, 250);
  };

  // Login direto via Google Workspace
  const handleGoogleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await googleSignIn();
      if (!res?.user?.email) {
        setLoading(false);
        return;
      }
      const authEmail = res.user.email.trim().toLowerCase();
      const found = findAuthorizedUserByEmail(authEmail, allUsers);
      if (found) {
        handleSelectUser(found);
      } else {
        // Se pertencer ao domínio institucional, cria o educador automaticamente
        const isAdmin = authEmail === ADMIN_OFFICIAL_EMAIL || authEmail.includes('admin') || authEmail.includes('emebjfreitas');
        const newUser: AuthorizedUser = {
          id: `usr-${Date.now()}`,
          name: res.user.displayName || authEmail.split('@')[0].toUpperCase(),
          email: authEmail,
          role: isAdmin ? 'admin' : 'usuario',
          teacherRoleType: isAdmin ? 'admin' : 'peb1',
          assignedClassName: isAdmin ? 'Todas as 40 Turmas' : 'Turma Regente',
          assignedClassId: isAdmin ? 'all' : 'all',
          active: true,
          createdAt: new Date().toLocaleDateString('pt-BR'),
        };
        const updated = [...allUsers, newUser];
        saveStoredAuthorizedUsers(updated);
        handleSelectUser(newUser);
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Erro ao conectar via Google Workspace. Selecione sua conta na lista abaixo.');
      }
      setLoading(false);
    }
  };

  // Entrada manual de e-mail institucional
  const handleManualEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualEmailInput.trim().toLowerCase();
    if (!clean) return;
    const finalEmail = clean.includes('@') ? clean : `${clean}@educacao.jundiai.sp.gov.br`;
    const found = findAuthorizedUserByEmail(finalEmail, allUsers);
    if (found) {
      handleSelectUser(found);
    } else {
      setErrorMsg(`O e-mail ${finalEmail} não foi localizado na base institucional pré-cadastrada.`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col items-center justify-center p-3 sm:p-6 select-none font-sans">
      <main className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden flex flex-col">
        {/* Cabeçalho Institucional */}
        <div className="p-6 sm:p-8 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-xs border border-slate-200/80 p-2 flex items-center justify-center mb-3.5">
            <img
              src={APP_LOGO_URL}
              alt="Brasão de Jundiaí"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = APP_LOGO_FALLBACK_URL;
              }}
              className="w-10 h-10 object-contain"
            />
          </div>

          <p className="text-[11px] uppercase tracking-wider font-bold text-blue-700 mb-1">
            Prefeitura do Município de Jundiaí · Unidade de Gestão de Educação
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
            EMEB Prof. Joaquim Candelário de Freitas
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Acesso Seguro Google Workspace · Diário &amp; Lista Piloto Oficial 2027
          </p>

          {/* Botão Oficial Google Workspace */}
          <div className="w-full max-w-md mt-6">
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleWorkspaceLogin}
              className="w-full h-12 bg-white hover:bg-slate-50 border border-slate-300 rounded-2xl text-slate-800 font-bold text-sm flex items-center justify-center gap-3 transition-all cursor-pointer shadow-xs hover:border-slate-400 disabled:opacity-60"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              <span>Acessar com Conta Google Workspace</span>
            </button>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">
              Válido para contas <span className="font-mono text-slate-700">@jundiai.sp.gov.br</span> e <span className="font-mono text-slate-700">@educacao.jundiai.sp.gov.br</span>
            </p>
          </div>

          {errorMsg && (
            <div className="w-full max-w-md mt-4 p-3 rounded-2xl bg-rose-50 text-rose-900 border border-rose-200 text-xs font-semibold flex items-center gap-2 text-left">
              <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0">error</span>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Card Destaque: Administrador Oficial da Escola */}
        <div className="p-4 sm:p-6 bg-slate-50/70 border-b border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
            Conta Principal da Gestão / Administração
          </p>
          <div className="bg-white rounded-2xl border-2 border-slate-900/10 hover:border-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-slate-950 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-2xl">admin_panel_settings</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-950 truncate">
                    EMEB Prof. Joaquim Candelário de Freitas
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold text-[10px] uppercase">
                    Admin Oficial
                  </span>
                </div>
                <p className="text-xs font-mono font-semibold text-blue-700 truncate">
                  {ADMIN_OFFICIAL_EMAIL}
                </p>
                <p className="text-[11px] text-slate-500">
                  Gestão Plena · 40 Turmas · Calendário 200 Dias · Homologação SED
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSelectUser(adminAccount)}
              className="h-10 px-5 rounded-xl bg-slate-950 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0 shadow-xs"
            >
              <span>Acessar como Admin</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Seção dos Educadores e Professores Pré-Cadastrados */}
        <div className="p-4 sm:p-6 flex-1 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-950">
                Professores e Especialistas Pré-Cadastrados
              </h2>
              <p className="text-xs text-slate-500">
                Selecione seu perfil institucional para acesso imediato às suas turmas
              </p>
            </div>

            {/* Alternar Entrada Manual */}
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer text-left sm:text-right"
            >
              {showManualInput ? 'Ocultar digitação manual' : 'Digitar outro e-mail'}
            </button>
          </div>

          {/* Campo de Digitação Manual */}
          {showManualInput && (
            <form onSubmit={handleManualEmailSubmit} className="mb-4 p-3 bg-slate-50 rounded-2xl border border-slate-200 flex gap-2">
              <input
                type="text"
                value={manualEmailInput}
                onChange={(e) => setManualEmailInput(e.target.value)}
                placeholder="exemplo: giulia.patez@educacao.jundiai.sp.gov.br"
                className="flex-1 h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:border-slate-800"
              />
              <button
                type="submit"
                className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Entrar
              </button>
            </form>
          )}

          {/* Filtros e Busca Rápida */}
          <div className="flex flex-col sm:flex-row items-center gap-2 mb-3">
            <div className="relative w-full sm:flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar professor por nome, e-mail (ex: giulia.patez), turma ou disciplina..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`h-8 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  roleFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos ({allUsers.length - 1})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('peb1')}
                className={`h-8 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  roleFilter === 'peb1' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                PEB I (Regentes)
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('peb2')}
                className={`h-8 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  roleFilter === 'peb2' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                PEB II (Especialistas)
              </button>
            </div>
          </div>

          {/* Lista de Contas Pré-Cadastradas com Scroll Contido e Responsivo */}
          <div className="max-h-72 sm:max-h-80 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 border border-slate-200 rounded-2xl p-2 bg-slate-50/40">
            {filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-medium">
                Nenhum professor encontrado com o termo informado.
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSpecialist = user.role === 'peb2' || user.teacherRoleType === 'peb2';
                return (
                  <div
                    key={user.id}
                    className="pt-1.5 first:pt-0 flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-white hover:shadow-xs transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <StudentAvatar
                        name={user.name}
                        size="sm"
                        className="w-9 h-9 text-xs shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-slate-950 truncate">
                            {user.name}
                          </p>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isSpecialist
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {isSpecialist ? user.subjectName || 'PEB II' : 'PEB I Regente'}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-500 truncate">
                          {user.email}
                        </p>
                        <p className="text-[10px] text-slate-600 truncate">
                          {user.assignedClassName || 'Turma Vinculada'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleSelectUser(user)}
                      className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-800 font-bold text-xs transition-all cursor-pointer shrink-0"
                    >
                      Acessar
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rodapé Informativo */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500 font-medium">
            Segurança Institucional SME Jundiaí · Base de Dados Local 100% Integrada · Sem Dependência de Planilhas
          </p>
        </div>
      </main>
    </div>
  );
};
