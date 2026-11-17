import React, { useState, useEffect } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, INITIAL_AUTHORIZED_USERS } from '../data/mockData';
import {
  findAuthorizedUserByEmail,
  isValidInstitutionalEmail,
  saveStoredAuthorizedUsers,
} from '../services/db';
import {
  googleSignIn,
  checkGoogleRedirectResult,
  logoutGoogle,
} from '../services/googleSheetsApi';
import { fetchStateFromFirestoreCloud } from '../services/firebaseSync';
import { Loader2 } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(externalError || null);

  useEffect(() => {
    if (externalError) {
      setErrorMsg(externalError);
    }
  }, [externalError]);

  // Valida o e-mail retornado pelo Google contra o domínio institucional e a lista de usuários autorizados
  const verifyAndAuthorizeEmail = async (rawEmail: string) => {
    const authEmail = rawEmail.trim().toLowerCase();

    if (!isValidInstitutionalEmail(authEmail)) {
      await logoutGoogle().catch(() => {});
      setErrorMsg(
        `Acesso negado: o e-mail "${authEmail}" não pertence ao domínio institucional autorizado (@educacao.jundiai.sp.gov.br). Apenas usuários autorizados podem acessar.`
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
      await logoutGoogle().catch(() => {});
      setErrorMsg(
        `Acesso restrito: a conta "${authEmail}" não está cadastrada na lista de usuários autorizados da EMEB Prof. Joaquim Candelário de Freitas. Solicite à Equipe Administrativa a liberação do seu acesso.`
      );
      return;
    }

    if (!found.active) {
      await logoutGoogle().catch(() => {});
      setErrorMsg(
        `Acesso bloqueado: o usuário "${authEmail}" está com o acesso desativado no sistema. Contate a Equipe Administrativa.`
      );
      return;
    }

    try {
      localStorage.setItem('emeb_candelario_last_remembered_email_2027', found.email);
    } catch {
      // safe fallback
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
          await verifyAndAuthorizeEmail(res.user.email);
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

  // Login exclusivo e obrigatório via Google Workspace
  const handleGoogleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await googleSignIn();
      if (!res?.user?.email) {
        // Quando signInWithRedirect é acionado, o navegador redirecionará
        return;
      }
      await verifyAndAuthorizeEmail(res.user.email);
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg(
          'Autenticação cancelada. Clique no botão acima e faça login com sua conta Google institucional autorizada.'
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(
          'O pop-up de login do Google foi bloqueado pelo navegador. Libere os pop-ups para este site e tente novamente.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          'Este domínio ainda não está autorizado no Firebase Authentication. Contate a Equipe Administrativa.'
        );
      } else {
        setErrorMsg(
          'Não foi possível concluir o login com o Google. Verifique se está usando uma conta @educacao.jundiai.sp.gov.br autorizada e tente novamente.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#091f48] flex items-center justify-center px-4 py-6 select-none font-sans">
      <div className="w-full max-w-[380px] min-w-0 break-words bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.28)] px-7 py-8 sm:px-9 sm:py-9 flex flex-col items-center text-center animate-apple-pop">
        {/* Brasão Oficial */}
        <img
          src={APP_LOGO_URL}
          alt="Brasão de Jundiaí"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = APP_LOGO_FALLBACK_URL;
          }}
          className="w-14 h-14 object-contain mb-4 shrink-0"
        />

        {/* Identificação Institucional */}
        <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-slate-500">
          Prefeitura de Jundiaí · SME
        </p>

        <h1 className="text-xl sm:text-[22px] font-bold tracking-tight text-[#0b3b8c] leading-snug mt-2 text-balance">
          Lista Piloto Candelário 2027
        </h1>

        <p className="text-xs sm:text-[13px] font-medium text-slate-600 leading-snug mt-1 mb-7 text-balance">
          EMEB Prof. Joaquim Candelário de Freitas
        </p>

        {/* Botão Único Google Workspace */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleWorkspaceLogin}
          className="w-full min-h-[48px] py-2.5 px-5 bg-[#0b3b8c] hover:bg-[#082d6b] rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-3 whitespace-nowrap transition-colors cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3b8c]"
        >
          <span className="w-6 h-6 rounded-md bg-white flex items-center justify-center shrink-0">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0b3b8c]" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
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
            )}
          </span>
          <span>{loading ? 'Conectando...' : 'Entrar com minha conta Google'}</span>
        </button>

        {errorMsg && (
          <div className="w-full mt-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-900 text-xs font-medium leading-relaxed break-words">
            {errorMsg}
          </div>
        )}

        {/* Rodapé Discreto de Acesso Restrito */}
        <div className="w-full mt-6 pt-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 leading-relaxed text-balance">
            Acesso restrito a usuários autorizados (<span className="font-medium text-slate-700">@educacao.jundiai.sp.gov.br</span>).
          </p>
        </div>
      </div>
    </div>
  );
};
