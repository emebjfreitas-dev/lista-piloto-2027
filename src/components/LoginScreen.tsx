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
import { Loader2, Mail, ShieldCheck, Users, ChevronDown, Search, ArrowRight } from 'lucide-react';

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
  const [emailInput, setEmailInput] = useState('');
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

  // Valida o e-mail contra o domínio institucional e a lista de usuários autorizados
  const verifyAndAuthorizeEmail = async (rawEmail: string, signOutOnFail = false) => {
    let authEmail = rawEmail.trim().toLowerCase();
    if (authEmail && !authEmail.includes('@')) {
      authEmail =
        authEmail === 'emebjfreitas'
          ? 'emebjfreitas@jundiai.sp.gov.br'
          : `${authEmail}${INSTITUTIONAL_EMAIL_DOMAIN}`;
    }

    if (!authEmail) {
      setErrorMsg('Informe o seu e-mail institucional para acessar.');
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

    // Busca também a lista atualizada de usuários autorizados na nuvem (Firestore) caso a Equipe Administrativa tenha adicionado novos docentes
    let cloudUsers: AuthorizedUser[] = [];
    try {
      const cloudState = await fetchStateFromFirestoreCloud();
      if (cloudState?.authorizedUsers && cloudState.authorizedUsers.length > 0) {
        cloudUsers = cloudState.authorizedUsers;
        saveStoredAuthorizedUsers(cloudUsers);
      }
    } catch {
      // prossegue com a lista local e oficial se offline
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
        `Acesso restrito: a conta "${authEmail}" não está cadastrada na lista de usuários autorizados da EMEB Prof. Joaquim Candelário de Freitas. Solicite à Equipe Administrativa a liberação do seu acesso.`
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
        )} e foi revogado automaticamente. Contate a Equipe Administrativa.`
      );
      return;
    }

    if (!found.active) {
      if (signOutOnFail) {
        await logoutGoogle().catch(() => {});
      }
      setErrorMsg(
        `Acesso bloqueado: o usuário "${authEmail}" está com o acesso desativado no sistema. Contate a Equipe Administrativa.`
      );
      return;
    }

    onLoginSuccess(found);
  };

  // Verifica retorno de autenticação via redirect (quando pop-up é bloqueado pelo navegador)
  useEffect(() => {
    let mounted = true;
    const handleRedirectCheck = async () => {
      try {
        const res = await checkGoogleRedirectResult();
        if (mounted && res?.user?.email) {
          setLoading(true);
          await verifyAndAuthorizeEmail(res.user.email, true);
        }
      } catch {
        // ignore redirect absence
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void handleRedirectCheck();
    return () => {
      mounted = false;
    };
  }, []);

  const handleInstitutionalEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      await verifyAndAuthorizeEmail(emailInput, false);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectAccountLogin = async (targetEmail: string) => {
    setErrorMsg(null);
    setEmailInput(targetEmail);
    setLoading(true);
    try {
      await verifyAndAuthorizeEmail(targetEmail, false);
    } finally {
      setLoading(false);
    }
  };

  // Login via Google Workspace
  const handleGoogleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await googleSignIn();
      if (!res?.user?.email) {
        return;
      }
      await verifyAndAuthorizeEmail(res.user.email, true);
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg(
          'Autenticação Google cancelada. Você também pode entrar digitando seu e-mail institucional abaixo.'
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(
          'O pop-up do Google foi bloqueado pelo navegador. Utilize o campo de E-mail Institucional acima para acessar.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          'Login via pop-up indisponível neste domínio. Utilize o acesso com seu E-mail Institucional acima.'
        );
      } else {
        setErrorMsg(
          'Não foi possível concluir o login via Google. Utilize o acesso direto com seu e-mail institucional autorizado.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#091f48] flex items-center justify-center px-4 py-6 font-sans">
      <div className="w-full max-w-[420px] min-w-0 break-words bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.28)] px-6 py-7 sm:px-8 sm:py-8 flex flex-col items-center text-center animate-apple-pop">
        {/* Brasão Oficial */}
        <img
          src={APP_LOGO_URL}
          alt="Brasão de Jundiaí"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = APP_LOGO_FALLBACK_URL;
          }}
          className="w-14 h-14 object-contain mb-3.5 shrink-0"
        />

        {/* Identificação Institucional */}
        <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-slate-500">
          Prefeitura de Jundiaí · SME
        </p>

        <h1 className="text-xl sm:text-[22px] font-bold tracking-tight text-[#0b3b8c] leading-snug mt-1.5 text-balance">
          Lista Piloto Candelário 2027
        </h1>

        <p className="text-xs sm:text-[13px] font-medium text-slate-600 leading-snug mt-1 mb-5 text-balance">
          EMEB Prof. Joaquim Candelário de Freitas
        </p>

        {/* Formulário Direto de E-mail Institucional */}
        <form onSubmit={handleInstitutionalEmailSubmit} className="w-full space-y-3 text-left">
          <div>
            <label
              htmlFor="institutional-email-login"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              E-mail Institucional Autorizado
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                id="institutional-email-login"
                type="text"
                inputMode="email"
                autoComplete="email"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="ex: emebjfreitas@jundiai.sp.gov.br"
                disabled={loading}
                className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b3b8c] focus:bg-white transition-colors"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Admin: <span className="font-semibold text-slate-700">emebjfreitas@jundiai.sp.gov.br</span> · Docentes: <span className="font-medium">@educacao.jundiai.sp.gov.br</span>
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
                <span>Verificando acesso...</span>
              </>
            ) : (
              <>
                <span>Entrar com E-mail Institucional</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Acesso Rápido: Admin Oficial ou Lista de Docentes Autorizados */}
        <div className="w-full mt-3 space-y-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDirectAccountLogin('emebjfreitas@jundiai.sp.gov.br')}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100/80 border border-rose-200/70 text-[#991b1b] text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 shrink-0 text-[#b91c1c]" />
              <span className="truncate">Entrar como Direção / Admin</span>
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

              <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
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
                        onClick={() => handleDirectAccountLogin(u.email)}
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

        {/* Divisor */}
        <div className="w-full flex items-center gap-3 my-4">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            ou via Google
          </span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        {/* Botão Google Workspace */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleWorkspaceLogin}
          className="w-full min-h-[44px] py-2 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 whitespace-nowrap transition-colors cursor-pointer active:scale-[0.99] disabled:opacity-60"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
          <span>Entrar com minha conta Google</span>
        </button>

        {errorMsg && (
          <div className="w-full mt-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-900 text-xs font-medium leading-relaxed break-words text-left">
            {errorMsg}
          </div>
        )}

        {/* Rodapé Discreto de Acesso Restrito */}
        <div className="w-full mt-5 pt-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 leading-relaxed text-balance">
            Administração exclusiva <span className="font-semibold text-slate-700">emebjfreitas@jundiai.sp.gov.br</span> · Docentes autorizados (<span className="font-medium text-slate-700">@educacao.jundiai.sp.gov.br</span>).
          </p>
        </div>
      </div>
    </div>
  );
};

