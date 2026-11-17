import React, { useState, useEffect, useMemo } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import {
  APP_LOGO_URL,
  APP_LOGO_FALLBACK_URL,
  INITIAL_AUTHORIZED_USERS,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import {
  findAuthorizedUserByEmail,
  isOfficialSchoolAdminEmail,
  isValidInstitutionalEmail,
  saveStoredAuthorizedUsers,
  isUserAccessExpired,
  isUserAccessEffectivelyActive,
  formatAccessExpirationDateBR,
} from '../services/db';
import {
  googleSignIn,
  checkGoogleRedirectResult,
  logoutGoogle,
} from '../services/googleSheetsApi';
import { fetchStateFromFirestoreCloud } from '../services/firebaseSync';
import { Loader2, Mail, ShieldCheck, Users, Search, ArrowRight, ArrowLeft, CheckCircle2, ChevronDown } from 'lucide-react';

interface LoginScreenProps {
  authorizedUsers: AuthorizedUser[];
  schoolNotices?: SchoolNotice[];
  externalError?: string | null;
  onLoginSuccess: (authorizedUser: AuthorizedUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authorizedUsers,
  externalError,
  onLoginSuccess,
}) => {
  const [step, setStep] = useState<'email' | 'verify'>('email');
  const [emailInput, setEmailInput] = useState('');
  const [pendingUser, setPendingUser] = useState<AuthorizedUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(externalError || null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => {
    if (externalError) {
      setErrorMsg(externalError);
    }
  }, [externalError]);

  const selectableAccounts = useMemo(() => {
    const map = new Map<string, AuthorizedUser>();
    [...INITIAL_AUTHORIZED_USERS, ...authorizedUsers].forEach((u) => {
      const key = u.email.trim().toLowerCase();
      map.set(key, u);
    });
    const list = Array.from(map.values())
      .filter((u) => isUserAccessEffectivelyActive(u))
      .sort((a, b) => {
        const aAdmin = isOfficialSchoolAdminEmail(a.email) ? 0 : 1;
        const bAdmin = isOfficialSchoolAdminEmail(b.email) ? 0 : 1;
        if (aAdmin !== bAdmin) return aAdmin - bAdmin;
        return a.name.localeCompare(b.name, 'pt-BR');
      });

    const term = pickerSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.assignedClassName || '').toLowerCase().includes(term)
    );
  }, [authorizedUsers, pickerSearch]);

  // Passo 1: Valida o e-mail e localiza o usuário para o Passo 2 de confirmação
  const handleVerifyEmailStep = async (rawEmail: string, signOutOnFail = false) => {
    let authEmail = rawEmail.trim().toLowerCase();
    if (authEmail && !authEmail.includes('@')) {
      authEmail =
        authEmail === 'emebjfreitas'
          ? 'emebjfreitas@jundiai.sp.gov.br'
          : `${authEmail}${INSTITUTIONAL_EMAIL_DOMAIN}`;
    }

    if (!authEmail) {
      setErrorMsg('Informe o seu e-mail institucional para prosseguir.');
      return;
    }

    if (!isValidInstitutionalEmail(authEmail)) {
      if (signOutOnFail) {
        await logoutGoogle().catch(() => {});
      }
      setErrorMsg(
        `Acesso negado: o e-mail "${authEmail}" não pertence ao domínio institucional autorizado (${INSTITUTIONAL_EMAIL_DOMAIN} ou emebjfreitas@jundiai.sp.gov.br).`
      );
      return;
    }

    let cloudUsers: AuthorizedUser[] = [];
    try {
      const cloudState = await fetchStateFromFirestoreCloud();
      if (cloudState?.authorizedUsers && cloudState.authorizedUsers.length > 0) {
        cloudUsers = cloudState.authorizedUsers;
        saveStoredAuthorizedUsers(cloudUsers);
      }
    } catch {
      // prossegue com a lista local
    }

    const mergedUsers =
      cloudUsers.length > 0
        ? [...cloudUsers, ...authorizedUsers, ...INITIAL_AUTHORIZED_USERS]
        : [...authorizedUsers, ...INITIAL_AUTHORIZED_USERS];

    const found = findAuthorizedUserByEmail(authEmail, mergedUsers);

    if (!found) {
      if (signOutOnFail) {
        await logoutGoogle().catch(() => {});
      }
      setErrorMsg(
        `Acesso restrito: a conta "${authEmail}" não está cadastrada na lista de usuários autorizados da EMEB Prof. Joaquim Candelário de Freitas.`
      );
      return;
    }

    if (isUserAccessExpired(found)) {
      if (signOutOnFail) {
        await logoutGoogle().catch(() => {});
      }
      setErrorMsg(
        `Acesso expirado: o acesso temporário de "${authEmail}" venceu após ${formatAccessExpirationDateBR(
          found.accessExpiresAt
        )} e foi revogado automaticamente.`
      );
      return;
    }

    if (!found.active) {
      if (signOutOnFail) {
        await logoutGoogle().catch(() => {});
      }
      setErrorMsg(
        `Acesso bloqueado: o usuário "${authEmail}" está com o acesso desativado no sistema.`
      );
      return;
    }

    setErrorMsg(null);
    setPendingUser(found);
    setStep('verify');
  };

  // Verifica retorno de autenticação via redirect
  useEffect(() => {
    let mounted = true;
    const handleRedirectCheck = async () => {
      try {
        const res = await checkGoogleRedirectResult();
        if (mounted && res?.user?.email) {
          setLoading(true);
          await handleVerifyEmailStep(res.user.email, true);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void handleRedirectCheck();
    return () => {
      mounted = false;
    };
  }, []);

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      await handleVerifyEmailStep(emailInput, false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuickAccount = async (targetEmail: string) => {
    setErrorMsg(null);
    setEmailInput(targetEmail);
    setLoading(true);
    try {
      await handleVerifyEmailStep(targetEmail, false);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmLogin = () => {
    if (!pendingUser) return;
    onLoginSuccess(pendingUser);
  };

  const handleGoogleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await googleSignIn();
      if (!res?.user?.email) {
        return;
      }
      await handleVerifyEmailStep(res.user.email, true);
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg('Autenticação Google cancelada. Informe seu e-mail institucional acima.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('O pop-up do Google foi bloqueado. Utilize o campo de e-mail institucional.');
      } else {
        setErrorMsg('Não foi possível concluir o login com o Google. Utilize o e-mail institucional.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#071a3d] flex items-center justify-center px-4 py-6 font-sans">
      <div className="w-full max-w-[400px] min-w-0 break-words bg-white rounded-3xl shadow-[0_24px_54px_rgba(0,0,0,0.32)] px-6 py-7 sm:px-8 sm:py-8 flex flex-col items-center text-center animate-apple-pop">
        {/* Brasão Oficial */}
        <img
          src={APP_LOGO_URL}
          alt="Brasão de Jundiaí"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = APP_LOGO_FALLBACK_URL;
          }}
          className="w-13 h-13 object-contain mb-3 shrink-0"
        />

        <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-slate-500">
          Prefeitura de Jundiaí · SME
        </p>

        <h1 className="text-xl font-bold tracking-tight text-[#0b3b8c] leading-snug mt-1 text-balance">
          Lista Piloto Candelário 2027
        </h1>

        <p className="text-xs font-medium text-slate-500 leading-snug mt-0.5 mb-5 text-balance">
          EMEB Prof. Joaquim Candelário de Freitas
        </p>

        {/* Indicador Minimalista das 2 Etapas */}
        <div className="w-full flex items-center justify-center gap-2 mb-5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                step === 'email'
                  ? 'bg-[#0b3b8c] text-white shadow-xs'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {step === 'verify' ? <CheckCircle2 className="w-3.5 h-3.5" /> : '1'}
            </span>
            <span className={`text-xs font-medium ${step === 'email' ? 'text-[#0b3b8c] font-semibold' : 'text-slate-500'}`}>
              E-mail
            </span>
          </div>

          <div className="w-8 h-px bg-slate-200" />

          <div className="flex items-center gap-1.5">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                step === 'verify' ? 'bg-[#0b3b8c] text-white shadow-xs' : 'bg-slate-200 text-slate-600'
              }`}
            >
              2
            </span>
            <span className={`text-xs font-medium ${step === 'verify' ? 'text-[#0b3b8c] font-semibold' : 'text-slate-500'}`}>
              Confirmação
            </span>
          </div>
        </div>

        {/* ETAPA 1: Digitar ou selecionar e-mail */}
        {step === 'email' && (
          <div className="w-full space-y-4 animate-gentle-fade">
            <form onSubmit={handleStep1Submit} className="space-y-3 text-left">
              <div>
                <label
                  htmlFor="institutional-email-step1"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Digite seu e-mail institucional
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    id="institutional-email-step1"
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="ex: nome.sobrenome"
                    disabled={loading}
                    className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b3b8c] focus:bg-white transition-colors"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Uso exclusivo de e-mails <span className="font-medium text-slate-700">@educacao.jundiai.sp.gov.br</span>.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[46px] py-2.5 px-4 bg-[#0b3b8c] hover:bg-[#082d6b] rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <span>Continuar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Ativação Rápida: Direção Admin ou Lista de Docentes */}
            <div className="w-full pt-1 space-y-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSelectQuickAccount('emebjfreitas@jundiai.sp.gov.br')}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100/80 border border-rose-200/70 text-[#991b1b] text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-[#b91c1c]" />
                  <span className="truncate">Acesso Direto Direção / Admin</span>
                </span>
                <span className="text-[11px] font-medium text-rose-700 shrink-0">
                  emebjfreitas@
                </span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setShowUserPicker((prev) => !prev)}
                className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-700 text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Users className="w-4 h-4 shrink-0 text-[#0b3b8c]" />
                  <span className="truncate">
                    Selecionar docente / conta autorizada ({selectableAccounts.length})
                  </span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    showUserPicker ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showUserPicker && (
                <div className="w-full rounded-2xl bg-slate-50 border border-slate-200 p-2.5 space-y-2 text-left animate-gentle-fade">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Buscar docente, e-mail ou turma..."
                      className="w-full min-h-[36px] pl-8 pr-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0b3b8c]"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                    {selectableAccounts.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-3">
                        Nenhuma conta encontrada para &ldquo;{pickerSearch}&rdquo;.
                      </p>
                    ) : (
                      selectableAccounts.map((u) => {
                        const isSchoolAdmin = isOfficialSchoolAdminEmail(u.email);
                        return (
                          <button
                            key={u.email}
                            type="button"
                            disabled={loading}
                            onClick={() => handleSelectQuickAccount(u.email)}
                            className="w-full px-2.5 py-2 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200/80 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-900 truncate">
                                {u.name}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                            </div>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                isSchoolAdmin
                                  ? 'bg-rose-100 text-rose-800'
                                  : u.role === 'usuario'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isSchoolAdmin ? 'ADMIN' : u.role === 'usuario' ? 'PEB I' : 'PEB II'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="w-full flex items-center gap-3 my-3">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                ou
              </span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleWorkspaceLogin}
              className="w-full min-h-[42px] py-2 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold text-xs flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer active:scale-[0.99] disabled:opacity-60"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
              <span>Entrar com conta Google Workspace</span>
            </button>
          </div>
        )}

        {/* ETAPA 2: Confirmação e Entrada Instantânea */}
        {step === 'verify' && pendingUser && (
          <div className="w-full space-y-4 animate-gentle-fade text-left">
            <div className="p-4 rounded-2xl bg-[#f2f2f7] border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Conta Verificada
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    isOfficialSchoolAdminEmail(pendingUser.email)
                      ? 'bg-rose-100 text-rose-800'
                      : pendingUser.role === 'usuario'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isOfficialSchoolAdminEmail(pendingUser.email)
                    ? 'ADMINISTRADOR'
                    : pendingUser.role === 'usuario'
                    ? 'DOCENTE PEB I'
                    : 'ESPECIALISTA PEB II'}
                </span>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-900 break-words">
                  {pendingUser.name}
                </p>
                <p className="text-xs text-[#0b3b8c] font-medium break-all mt-0.5">
                  {pendingUser.email}
                </p>
              </div>

              {pendingUser.assignedClassName && (
                <div className="pt-2 border-t border-slate-200/70 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700 block mb-0.5">Atribuição:</span>
                  <p className="break-words leading-snug">{pendingUser.assignedClassName}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={loading}
                onClick={handleConfirmLogin}
                className="w-full min-h-[46px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Iniciando sessão...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setStep('email');
                  setPendingUser(null);
                  setErrorMsg(null);
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Usar outro e-mail</span>
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="w-full mt-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-900 text-xs font-medium leading-relaxed break-words text-left">
            {errorMsg}
          </div>
        )}

        {/* Rodapé Discreto */}
        <div className="w-full mt-5 pt-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 leading-relaxed text-balance">
            Segurança institucional · <span className="font-semibold text-slate-700">EMEB Jundiaí</span>
          </p>
        </div>
      </div>
    </div>
  );
};
