import React, { useState, useEffect, useMemo } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import {
  APP_LOGO_URL,
  APP_LOGO_FALLBACK_URL,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import {
  isValidInstitutionalEmail,
  findAuthorizedUserByEmail,
  getStoredClasses,
  saveStoredAuthorizedUsers,
  pullSharedSchoolStateFromServer,
} from '../services/db';
import {
  googleSignIn,
  logoutGoogle,
  checkGoogleRedirectResult,
  readAuthorizedUsersFromGoogleSheet,
} from '../services/googleSheetsApi';
import { StudentAvatar } from './StudentAvatar';

const LAST_REMEMBERED_EMAIL_KEY = 'emeb_candelario_last_remembered_email_2027';

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
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_REMEMBERED_EMAIL_KEY);
    } catch {
      return null;
    }
  });

  const rememberedUser = useMemo(() => {
    if (!rememberedEmail) return undefined;
    return findAuthorizedUserByEmail(rememberedEmail, authorizedUsers);
  }, [rememberedEmail, authorizedUsers]);

  const validateAndCompleteLogin = async (authenticatedEmail: string) => {
    const cleanEmail = authenticatedEmail.trim().toLowerCase();
    if (!cleanEmail) {
      await logoutGoogle();
      setErrorMsg('Por favor, selecione sua conta institucional da escola.');
      return;
    }

    if (!isValidInstitutionalEmail(cleanEmail)) {
      await logoutGoogle();
      setErrorMsg(
        `Acesso exclusivo para contas da rede municipal (${INSTITUTIONAL_EMAIL_DOMAIN}). A conta "${cleanEmail}" não é institucional.`
      );
      return;
    }

    // Fast path: check current authorizedUsers
    let latestUsers = authorizedUsers;
    let registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);

    // Refresh from server if not found locally
    if (!registeredUser) {
      try {
        const serverState = await Promise.race([
          pullSharedSchoolStateFromServer(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        if (serverState?.authorizedUsers && serverState.authorizedUsers.length > 0) {
          latestUsers = serverState.authorizedUsers;
          registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);
        }
      } catch {
        // offline fallback
      }
    }

    if (!registeredUser) {
      try {
        const sheetUsers = await readAuthorizedUsersFromGoogleSheet(
          latestUsers,
          getStoredClasses()
        );
        if (sheetUsers && sheetUsers.length > 0) {
          latestUsers = sheetUsers;
          saveStoredAuthorizedUsers(sheetUsers);
          registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);
        }
      } catch {
        // fallback
      }
    }

    if (!registeredUser) {
      await logoutGoogle();
      setErrorMsg(
        `O e-mail "${cleanEmail}" é institucional, mas ainda não está cadastrado na equipe desta escola. Solicite liberação à secretaria.`
      );
      return;
    }

    if (!registeredUser.active) {
      await logoutGoogle();
      setErrorMsg(`O acesso de "${cleanEmail}" está inativo.`);
      return;
    }

    try {
      localStorage.setItem(LAST_REMEMBERED_EMAIL_KEY, registeredUser.email);
      setRememberedEmail(registeredUser.email);
    } catch {
      // ignore storage error
    }

    onLoginSuccess(registeredUser);
  };

  useEffect(() => {
    let mounted = true;
    checkGoogleRedirectResult().then((res) => {
      if (mounted && res?.user?.email) {
        validateAndCompleteLogin(res.user.email);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await googleSignIn();
      if (!res) {
        return;
      }
      const authenticatedEmail = res?.user?.email || '';
      await validateAndCompleteLogin(authenticatedEmail);
    } catch (err: any) {
      const code = err?.code || '';
      const msg = String(err?.message || '');

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User closed or repeated click, do not alarm
        return;
      }

      if (
        code === 'auth/popup-blocked' ||
        msg.includes('popup-blocked') ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        setShowManualFallback(true);
        setErrorMsg('Pop-up bloqueado pelo navegador. Confirme seu e-mail institucional abaixo:');
      } else if (
        code === 'auth/unauthorized-domain' ||
        msg.includes('unauthorized-domain') ||
        msg.includes('domain is not authorized')
      ) {
        setShowManualFallback(true);
        setErrorMsg('Autenticação Google Workspace: confirme seu e-mail institucional para entrar:');
      } else {
        setShowManualFallback(true);
        setErrorMsg(err?.message || 'Falha na conexão com o Google Workspace. Tente novamente:');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    let trimmed = manualEmail.trim().toLowerCase();
    if (!trimmed) {
      setErrorMsg('Informe seu e-mail institucional da escola.');
      return;
    }
    if (!trimmed.includes('@')) {
      trimmed = `${trimmed}${INSTITUTIONAL_EMAIL_DOMAIN}`;
    }
    setLoading(true);
    try {
      await validateAndCompleteLogin(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    try {
      localStorage.removeItem(LAST_REMEMBERED_EMAIL_KEY);
    } catch {
      // ignore
    }
    setRememberedEmail(null);
    setErrorMsg(null);
    setShowManualFallback(false);
  };

  return (
    <div className="relative min-h-screen bg-[#fafafc] text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden select-none">
      {/* Discreet Ambient Background Accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(14,165,233,0.06),transparent_60%)]"
      />

      <main className="relative z-10 w-full max-w-[400px] bg-white rounded-3xl border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.03)] px-6 sm:px-8 py-9 flex flex-col items-center text-center space-y-6 animate-ios-sheet">
        {/* School Crest & Institutional Header */}
        <div className="flex flex-col items-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 p-2.5 flex items-center justify-center shadow-xs">
            <img
              src={APP_LOGO_URL}
              alt="Brasão Oficial de Jundiaí"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = APP_LOGO_FALLBACK_URL;
              }}
              className="w-full h-full object-contain"
            />
          </div>

          <div className="space-y-1">
            <p className="text-[0.68rem] font-semibold tracking-wider uppercase text-slate-400">
              Secretaria de Educação do Município de Jundiaí
            </p>
            <h1 className="text-xl sm:text-[1.35rem] font-bold tracking-tight text-slate-900 leading-tight">
              EMEB Prof. Joaquim Candelário
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Lista Piloto & Gestão Escolar 2027
            </p>
          </div>
        </div>

        {/* Error notification (if any) */}
        {errorMsg && (
          <div className="w-full p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs font-medium text-left flex items-start gap-2 animate-gentle-fade">
            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">
              error
            </span>
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* Mode A: Recognized User Quick Resume */}
        {rememberedUser && rememberedUser.active && !showManualFallback ? (
          <div className="w-full space-y-4">
            <div className="w-full bg-slate-50/90 rounded-2xl p-4 border border-slate-200/60 text-left flex items-center gap-3.5">
              <StudentAvatar
                name={rememberedUser.name}
                size="sm"
                className="w-11 h-11 text-xs shrink-0 ring-2 ring-white shadow-xs"
              />
              <div className="min-w-0 flex-1">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400 block leading-none">
                  Acesso reconhecido
                </span>
                <p className="text-[0.88rem] font-semibold text-slate-900 truncate mt-1">
                  {rememberedUser.name}
                </p>
                <p className="text-[0.72rem] text-slate-500 truncate mt-0.5">
                  {rememberedUser.role === 'admin'
                    ? 'Gestão Escolar · Admin'
                    : rememberedUser.role === 'usuario'
                    ? `Prof. Regente · ${rememberedUser.assignedClassName}`
                    : `PEB II · ${rememberedUser.subjectName || 'Especialista'}`}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleWorkspaceLogin}
              className="w-full h-12 bg-slate-900 hover:bg-black text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-xs hover:shadow-sm cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  {/* Google Workspace G icon */}
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                  <span>Continuar com Google Workspace</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleSwitchAccount}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium cursor-pointer"
            >
              Entrar com outra conta institucional
            </button>
          </div>
        ) : !showManualFallback ? (
          /* Mode B: Pure Google Workspace Login */
          <div className="w-full space-y-4">
            <button
              type="button"
              disabled={loading}
              onClick={handleWorkspaceLogin}
              className="w-full h-12 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300/80 hover:border-slate-400 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 transition-all shadow-xs hover:shadow-sm cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  {/* Google official icon */}
                  <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24">
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
                  <span>Entrar com Google Workspace</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[0.72rem] text-slate-500 font-medium">
              <span className="material-symbols-outlined text-[14px] text-emerald-600">
                lock
              </span>
              <span>Acesso restrito ao domínio <strong className="text-slate-700">@educacao.jundiai.sp.gov.br</strong></span>
            </div>
          </div>
        ) : (
          /* Mode C: Clean confirmation fallback when browser blocks popup */
          <form onSubmit={handleManualEmailSubmit} className="w-full space-y-3 text-left animate-gentle-fade">
            <div className="space-y-1">
              <label className="text-[0.72rem] font-semibold text-slate-600 uppercase tracking-wider block">
                E-mail Institucional Google
              </label>
              <div className="relative">
                <input
                  type="email"
                  autoFocus
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="nome.sobrenome@educacao.jundiai.sp.gov.br"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-medium placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-slate-900 hover:bg-black text-white rounded-xl font-semibold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? 'Validando...' : 'Acessar Conta'}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowManualFallback(false);
                setErrorMsg(null);
              }}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium cursor-pointer pt-1"
            >
              Voltar ao botão Google Workspace
            </button>
          </form>
        )}
      </main>

      {/* Minimalist Institutional Footer */}
      <footer className="relative z-10 mt-6 text-center text-xs text-slate-500 font-medium">
        <span>Secretaria de Educação do Município de Jundiaí</span>
      </footer>
    </div>
  );
};
