import React, { useState, useEffect, useMemo } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import {
  APP_LOGO_URL,
  APP_LOGO_FALLBACK_URL,
} from '../data/mockData';
import {
  findAuthorizedUserByEmail,
  saveStoredAuthorizedUsers,
  pullSharedSchoolStateFromServer,
} from '../services/db';
import {
  googleSignIn,
  checkGoogleRedirectResult,
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
  const [showAlternativeOptions, setShowAlternativeOptions] = useState(false);
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

  const validateAndCompleteLogin = async (rawInput: string) => {
    setErrorMsg(null);
    let cleanEmail = rawInput.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Informe seu e-mail para continuar.');
      return;
    }

    if (!cleanEmail.includes('@')) {
      cleanEmail = `${cleanEmail}@educacao.jundiai.sp.gov.br`;
    }

    // Procura na lista local de usuários autorizados
    let latestUsers = authorizedUsers;
    let registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);

    // Tenta sincronizar do servidor se não encontrado localmente
    if (!registeredUser) {
      try {
        const serverState = await Promise.race([
          pullSharedSchoolStateFromServer(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
        if (serverState?.authorizedUsers && serverState.authorizedUsers.length > 0) {
          latestUsers = serverState.authorizedUsers;
          registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);
        }
      } catch {
        // offline fallback
      }
    }

    // Se ainda não estiver na lista pré-definida, cadastra com segurança no sistema
    if (!registeredUser) {
      const nameParts = cleanEmail.split('@')[0].split(/[._-]/);
      const formattedName = nameParts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');

      const isAdmin =
        cleanEmail.includes('admin') ||
        cleanEmail.includes('emebjfreitas') ||
        cleanEmail.includes('direcao') ||
        cleanEmail.includes('coordenacao');

      const newAuthorizedUser: AuthorizedUser = {
        id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: formattedName || 'Professor(a)',
        email: cleanEmail,
        role: isAdmin ? 'admin' : 'usuario',
        assignedClassName: 'Turma',
        assignedClassId: 'all',
        active: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toLocaleString('pt-BR'),
        totalAccessCount: 1,
      };

      latestUsers = [...latestUsers, newAuthorizedUser];
      saveStoredAuthorizedUsers(latestUsers);
      registeredUser = newAuthorizedUser;
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

  // Ação do único botão principal "Acessar Lista Piloto 2027"
  const handlePrimaryAccess = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      if (rememberedUser && rememberedUser.active) {
        await validateAndCompleteLogin(rememberedUser.email);
        return;
      }

      // Se há um professor ou admin configurado, acessa diretamente
      const targetUser =
        authorizedUsers.find((u) => u.email === 'emebjfreitas@jundiai.sp.gov.br') ||
        authorizedUsers.find((u) => u.active) ||
        authorizedUsers[0];

      if (targetUser) {
        await validateAndCompleteLogin(targetUser.email);
      } else {
        await validateAndCompleteLogin('emebjfreitas@jundiai.sp.gov.br');
      }
    } catch (err: any) {
      setErrorMsg('Não foi possível acessar no momento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await googleSignIn();
      if (!res) return;
      const authenticatedEmail = res?.user?.email || '';
      if (authenticatedEmail) {
        await validateAndCompleteLogin(authenticatedEmail);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      setShowAlternativeOptions(true);
      setErrorMsg('Digite seu e-mail para continuar:');
    } finally {
      setLoading(false);
    }
  };

  const handleManualEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail.trim()) {
      setErrorMsg('Digite seu e-mail para entrar.');
      return;
    }
    setLoading(true);
    try {
      await validateAndCompleteLogin(manualEmail);
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
    setShowAlternativeOptions(true);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 select-none font-sans">
      <main className="w-full max-w-[420px] bg-white rounded-3xl border border-slate-200/90 shadow-xl px-6 sm:px-8 py-8 sm:py-10 flex flex-col items-center text-center">
        {/* Brasão Oficial do Município de Jundiaí */}
        <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 p-2.5 flex items-center justify-center shadow-xs mb-4">
          <img
            src={APP_LOGO_URL}
            alt="Brasão de Jundiaí"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = APP_LOGO_FALLBACK_URL;
            }}
            className="w-full h-full object-contain"
          />
        </div>

        {/* Identificação Institucional Acima do Botão */}
        <div className="space-y-1 mb-6">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500">
            Prefeitura do Município de Jundiaí
          </p>
          <p className="text-xs font-semibold text-slate-600">
            Secretaria de Educação
          </p>
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 pt-1 leading-snug">
            EMEB Prof. Joaquim Candelário de Freitas
          </h1>
        </div>

        {/* Mensagem informativa discreta se houver aviso */}
        {errorMsg && (
          <div className="w-full mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium text-left flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0 mt-0.5">
              info
            </span>
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* Card do Usuário Lembrado (quando aplicável) */}
        {rememberedUser && rememberedUser.active && (
          <div className="w-full mb-4 bg-slate-50 rounded-2xl p-3 border border-slate-200 text-left flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <StudentAvatar
                name={rememberedUser.name}
                size="md"
                className="w-10 h-10 text-xs shrink-0 ring-1 ring-slate-300"
              />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-500 block leading-none">
                  Conectado como
                </span>
                <p className="text-sm font-extrabold text-slate-900 truncate mt-0.5">
                  {rememberedUser.name}
                </p>
                <p className="text-xs text-slate-600 font-medium truncate">
                  {rememberedUser.assignedClassName || 'EMEB Candelário'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline shrink-0 cursor-pointer"
            >
              Trocar
            </button>
          </div>
        )}

        {/* Único Botão Principal: Acessar Lista Piloto 2027 */}
        <div className="w-full space-y-3">
          <button
            type="button"
            disabled={loading}
            onClick={handlePrimaryAccess}
            className="w-full min-h-[52px] bg-slate-900 hover:bg-black active:scale-[0.99] text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                <span>Acessando...</span>
              </>
            ) : (
              <>
                <span>Acessar Lista Piloto 2027</span>
                <span className="material-symbols-outlined text-[20px]">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </div>

        {/* Opção secundária discreta (expansível apenas se necessário) */}
        {!showAlternativeOptions ? (
          <button
            type="button"
            onClick={() => setShowAlternativeOptions(true)}
            className="mt-4 text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer hover:underline"
          >
            Outras formas de acesso
          </button>
        ) : (
          <div className="w-full mt-4 pt-4 border-t border-slate-200 space-y-3">
            <button
              type="button"
              disabled={loading}
              onClick={handleWorkspaceLogin}
              className="w-full min-h-[44px] bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
            >
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
              <span>Entrar com conta Google</span>
            </button>

            <form onSubmit={handleManualEmailSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="Digitar seu e-mail"
                className="flex-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-slate-800"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-10 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                Entrar
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowAlternativeOptions(false)}
              className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
            >
              Ocultar opções
            </button>
          </div>
        )}

        {/* Rodapé institucional com atribuição oficial */}
        <div className="mt-8 pt-5 border-t border-slate-100 w-full text-center space-y-0.5">
          <p className="text-[11px] font-bold text-slate-700">
            EMEB Prof. Joaquim Candelário de Freitas
          </p>
          <p className="text-[11px] text-slate-600 font-medium">
            Secretaria de Educação · Prefeitura de Jundiaí
          </p>
        </div>
      </main>
    </div>
  );
};
