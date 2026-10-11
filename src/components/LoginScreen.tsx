import React, { useState, useEffect, useMemo } from 'react';
import { AuthorizedUser } from '../types';
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
import { QuadroAvisosCard } from './QuadroAvisosCard';
import { SchoolNotice } from '../types';

const LAST_REMEMBERED_EMAIL_KEY = 'emeb_candelario_last_remembered_email_2027';

interface LoginScreenProps {
  authorizedUsers: AuthorizedUser[];
  schoolNotices?: SchoolNotice[];
  onLoginSuccess: (authorizedUser: AuthorizedUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authorizedUsers,
  schoolNotices = [],
  onLoginSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);
  const [authTab, setAuthTab] = useState<'google' | 'rapido'>('google');
  const [fallbackEmailInput, setFallbackEmailInput] = useState('');
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

  const activeUsersByRole = useMemo(() => {
    const active = authorizedUsers.filter((u) => u.active);
    return {
      admins: active.filter((u) => u.role === 'admin'),
      peb1: active.filter((u) => u.role === 'usuario'),
      peb2: active.filter((u) => u.role === 'peb2'),
      all: active,
    };
  }, [authorizedUsers]);

  const filteredQuickUsers = useMemo(() => {
    const q = fallbackEmailInput.trim().toLowerCase();
    if (!q) return activeUsersByRole.all.slice(0, 6);
    return activeUsersByRole.all
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.assignedClassName || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [activeUsersByRole.all, fallbackEmailInput]);

  const validateAndCompleteLogin = async (authenticatedEmail: string) => {
    const cleanEmail = authenticatedEmail.trim().toLowerCase();
    if (!cleanEmail) {
      await logoutGoogle();
      setErrorMsg('Selecione sua conta institucional Google Workspace.');
      return;
    }

    if (!isValidInstitutionalEmail(cleanEmail)) {
      await logoutGoogle();
      setErrorMsg(
        `Acesso restrito a contas ${INSTITUTIONAL_EMAIL_DOMAIN} (${cleanEmail} recusado).`
      );
      return;
    }

    // Fast path: check local authorizedUsers first for zero-latency validation, while refreshing in background
    let latestUsers = authorizedUsers;
    let registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);

    // If not found locally or to ensure fresh class assignments, pull from Server with fast timeout
    try {
      const serverState = await Promise.race([
        pullSharedSchoolStateFromServer(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2200)),
      ]);
      if (serverState?.authorizedUsers && serverState.authorizedUsers.length > 0) {
        latestUsers = serverState.authorizedUsers;
        registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);
      }
    } catch {
      // ignore if offline
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
        // fallback to server/local list
      }
    }

    if (!registeredUser) {
      await logoutGoogle();
      setErrorMsg(
        `O e-mail ${cleanEmail} não consta na lista de acessos autorizados da EMEB.`
      );
      return;
    }

    if (!registeredUser.active) {
      await logoutGoogle();
      setErrorMsg(`O acesso de ${cleanEmail} encontra-se suspenso.`);
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
    setUnauthorizedHost(null);
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
      const currentHostname = window.location.hostname;

      if (
        code === 'auth/unauthorized-domain' ||
        msg.includes('unauthorized-domain') ||
        msg.includes('domain is not authorized')
      ) {
        setUnauthorizedHost(currentHostname);
        setAuthTab('rapido');
        setErrorMsg(
          `Domínio "${currentHostname}" aguardando liberação no Firebase. Use o Acesso Rápido Institucional abaixo para entrar imediatamente.`
        );
      } else if (
        code === 'auth/popup-blocked' ||
        msg.includes('popup-blocked') ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        setAuthTab('rapido');
        setErrorMsg(
          'Pop-up bloqueado pelo navegador. Selecione ou digite seu e-mail institucional abaixo para entrar sem pop-up:'
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthTab('rapido');
        setErrorMsg('Janela fechada. Você também pode entrar pelo Acesso Rápido abaixo:');
      } else if (code === 'auth/cancelled-popup-request') {
        // ignore duplicate click
      } else {
        setUnauthorizedHost(currentHostname);
        setAuthTab('rapido');
        setErrorMsg(
          `Pop-up indisponível em "${currentHostname}". Selecione seu perfil institucional abaixo para acessar:`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDirectInstitutionalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    let trimmed = fallbackEmailInput.trim().toLowerCase();
    if (!trimmed) {
      setErrorMsg('Informe ou selecione seu e-mail institucional.');
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

  const handleQuickSelectUser = async (email: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await validateAndCompleteLogin(email);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden select-none">
      {/* Subtle Ambient iOS 18 Radial Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,113,227,0.07),transparent_55%)]"
      />

      <main className="relative z-10 w-full max-w-[420px] bg-white/95 backdrop-blur-2xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.04)] px-6 sm:px-8 py-8 sm:py-9 flex flex-col items-center text-center space-y-6 animate-ios-sheet">
        {/* Top iOS App Squircle Icon & Official Header */}
        <div className="flex flex-col items-center space-y-3">
          <div className="w-16 h-16 rounded-[18px] bg-[#f5f5f7] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] p-2.5 flex items-center justify-center">
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
            <p className="text-[0.72rem] font-semibold tracking-tight text-[#0066cc]">
              Unidade de Gestão de Educação · Jundiaí
            </p>
            <h1 className="text-[1.65rem] sm:text-[1.8rem] font-bold tracking-tight text-[#1d1d1f] leading-tight">
              Lista Piloto 2027
            </h1>
            <p className="text-[0.84rem] font-normal text-[#6e6e73] leading-snug">
              EMEB Prof. Joaquim Candelário de Freitas
            </p>
          </div>
        </div>

        {/* Fast Return Card (iOS Apple ID style) if user logged in previously on this device */}
        {rememberedUser && rememberedUser.active && (
          <div className="w-full bg-[#f5f5f7] rounded-2xl p-3 text-left transition-all">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <StudentAvatar
                  name={rememberedUser.name}
                  size="sm"
                  className="w-10 h-10 text-[0.78rem] shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-medium text-[#6e6e73] leading-none">
                    Último acesso neste dispositivo
                  </p>
                  <p className="text-[0.84rem] font-semibold text-[#1d1d1f] truncate mt-0.5">
                    {rememberedUser.name}
                  </p>
                  <p className="text-[0.7rem] text-[#0066cc] truncate">
                    {rememberedUser.role === 'admin'
                      ? 'Direção / Secretaria (Admin)'
                      : rememberedUser.assignedClassName || 'Docente EMEB'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickSelectUser(rememberedUser.email)}
                className="h-9 px-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[0.76rem] shrink-0 cursor-pointer ios-spring-btn shadow-2xs disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* iOS Segmented Mode Switcher: Google OAuth vs Acesso Direto */}
        <div className="w-full bg-[#e8e8ed]/90 p-1 rounded-full grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              setAuthTab('google');
              setErrorMsg(null);
            }}
            className={`h-8 rounded-full text-[0.76rem] font-semibold transition-all cursor-pointer ${
              authTab === 'google'
                ? 'bg-white text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            Conta Google
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthTab('rapido');
              setErrorMsg(null);
            }}
            className={`h-8 rounded-full text-[0.76rem] font-semibold transition-all cursor-pointer ${
              authTab === 'rapido'
                ? 'bg-white text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            Acesso Direto EMEB
          </button>
        </div>

        {/* Mensagem de Alerta / Domínio Firebase */}
        {errorMsg && (
          <div className="w-full p-3.5 rounded-2xl bg-[#fff2f2] text-[#d70015] text-[0.76rem] font-medium space-y-2.5 text-left animate-gentle-fade">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[17px] shrink-0 mt-0.5">
                info
              </span>
              <span className="leading-snug">{errorMsg}</span>
            </div>

            {unauthorizedHost && (
              <div className="p-2.5 rounded-xl bg-white/90 text-[#1d1d1f] space-y-2">
                <p className="text-[0.7rem] text-[#6e6e73]">
                  Domínio atual para liberar no Firebase Console:
                </p>
                <div className="flex items-center justify-between gap-2 bg-[#f5f5f7] px-2.5 py-1.5 rounded-lg">
                  <code className="font-mono text-[0.72rem] font-semibold text-[#1d1d1f] truncate">
                    {unauthorizedHost}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(unauthorizedHost);
                      setCopiedHost(true);
                      setTimeout(() => setCopiedHost(false), 2000);
                    }}
                    className="px-2.5 py-1 rounded-md bg-[#1d1d1f] text-white text-[0.68rem] font-semibold cursor-pointer shrink-0"
                  >
                    {copiedHost ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: Login Oficial Google Workspace */}
        {authTab === 'google' ? (
          <div className="w-full space-y-4">
            <button
              type="button"
              onClick={handleWorkspaceLogin}
              disabled={loading}
              className="w-full h-[54px] bg-[#1d1d1f] hover:bg-black text-white rounded-2xl px-4 flex items-center justify-center gap-3 cursor-pointer ios-spring-btn shadow-[0_4px_14px_rgba(0,0,0,0.12)] disabled:opacity-60"
            >
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              </div>
              <span className="font-semibold text-[0.9rem] tracking-tight text-white">
                {loading ? 'Autenticando...' : 'Continuar com Google Workspace'}
              </span>
            </button>

            <div className="pt-1 flex items-center justify-between text-[0.72rem] text-[#86868b] px-1">
              <span>Domínio exclusivo</span>
              <span className="font-mono text-[#1d1d1f] font-medium">
                {INSTITUTIONAL_EMAIL_DOMAIN}
              </span>
            </div>
          </div>
        ) : (
          /* TAB 2: Acesso Rápido Institucional (Sem Pop-up / Lista iOS Inset Grouped) */
          <div className="w-full space-y-3 text-left animate-gentle-fade">
            <form onSubmit={handleDirectInstitutionalSubmit} className="relative">
              <span className="material-symbols-outlined text-[18px] text-[#86868b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={fallbackEmailInput}
                onChange={(e) => setFallbackEmailInput(e.target.value)}
                placeholder="Buscar educador(a), turma ou e-mail..."
                className="w-full h-10 pl-10 pr-20 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] placeholder-[#86868b] text-[0.82rem] font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0071e3]/30"
              />
              {fallbackEmailInput.trim().length > 0 && (
                <button
                  type="submit"
                  disabled={loading}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 rounded-lg bg-[#0071e3] text-white text-[0.72rem] font-semibold cursor-pointer"
                >
                  Entrar
                </button>
              )}
            </form>

            {/* Lista iOS Inset Grouped de Educadores Autorizados */}
            <div className="bg-[#f5f5f7] rounded-2xl p-1.5 max-h-[230px] overflow-y-auto divide-y divide-black/[0.05]">
              {filteredQuickUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickSelectUser(u.email)}
                  className="w-full px-2.5 py-2 flex items-center justify-between gap-2.5 hover:bg-white rounded-xl transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StudentAvatar
                      name={u.name}
                      size="sm"
                      className="w-8 h-8 text-[0.68rem] shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[0.8rem] font-semibold text-[#1d1d1f] truncate">
                        {u.name}
                      </p>
                      <p className="text-[0.68rem] text-[#6e6e73] truncate">
                        {u.role === 'admin'
                          ? 'Admin · Todas as Turmas'
                          : u.role === 'usuario'
                          ? `PEB I · ${u.assignedClassName}`
                          : `PEB II · ${u.subject || 'Especialista'}`}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-[#86868b] group-hover:text-[#0071e3] shrink-0">
                    chevron_right
                  </span>
                </button>
              ))}

              {filteredQuickUsers.length === 0 && (
                <div className="py-5 text-center text-[0.76rem] text-[#86868b]">
                  Pressione <strong>Entrar</strong> para validar{' '}
                  <span className="text-[#1d1d1f] font-medium">{fallbackEmailInput}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quadro de Avisos da Gestão (Aparece para todos os educadores no Login) */}
        <QuadroAvisosCard notices={schoolNotices} variant="login" />
      </main>

      {/* Quiet Minimalist Footer */}
      <footer className="relative z-10 mt-5 text-center text-[0.72rem] text-[#86868b]">
        <span>EMEB Prof. Joaquim Candelário de Freitas · Jundiaí/SP</span>
      </footer>
    </div>
  );
};
