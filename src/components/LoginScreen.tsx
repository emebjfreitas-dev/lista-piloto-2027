import React, { useState } from 'react';
import { AuthorizedUser } from '../types';
import {
  APP_LOGO_URL,
  APP_LOGO_FALLBACK_URL,
  SCHOOL_NAME,
  CITY_NAME,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import { isValidInstitutionalEmail, findAuthorizedUserByEmail } from '../services/db';
import { googleSignIn, logoutGoogle } from '../services/googleSheetsApi';

interface LoginScreenProps {
  authorizedUsers: AuthorizedUser[];
  onLoginSuccess: (authorizedUser: AuthorizedUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authorizedUsers,
  onLoginSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await googleSignIn();
      const authenticatedEmail = res?.user?.email?.trim().toLowerCase() || '';

      if (!authenticatedEmail) {
        await logoutGoogle();
        setErrorMsg('Selecione sua conta institucional Google Workspace.');
        return;
      }

      if (!isValidInstitutionalEmail(authenticatedEmail)) {
        await logoutGoogle();
        setErrorMsg(
          `Acesso restrito a contas ${INSTITUTIONAL_EMAIL_DOMAIN} (${authenticatedEmail} recusado).`
        );
        return;
      }

      const registeredUser = findAuthorizedUserByEmail(
        authenticatedEmail,
        authorizedUsers
      );
      if (!registeredUser) {
        await logoutGoogle();
        setErrorMsg(
          `O e-mail ${authenticatedEmail} não consta na lista de acessos autorizados da EMEB.`
        );
        return;
      }

      if (!registeredUser.active) {
        await logoutGoogle();
        setErrorMsg(`O acesso de ${authenticatedEmail} encontra-se suspenso.`);
        return;
      }

      onLoginSuccess(registeredUser);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Autenticação cancelada.');
      } else {
        setErrorMsg(
          `Utilize exclusivamente sua conta Google Workspace ${INSTITUTIONAL_EMAIL_DOMAIN}.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#0f1614] flex items-center justify-center p-4 animate-gentle-fade">
      <main className="w-full max-w-[390px] bg-white rounded-3xl shadow-sm border border-[#d5dddf] px-7 py-9 flex flex-col items-center text-center space-y-7">
        {/* Brasão Oficial Solitário de Jundiaí */}
        <div className="w-20 h-20 flex items-center justify-center">
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

        {/* Tipografia Minimalista */}
        <div className="space-y-1.5">
          <p className="text-[0.72rem] font-bold uppercase tracking-widest text-[#566366]">
            {CITY_NAME}
          </p>
          <h1 className="text-[1.18rem] font-extrabold text-[#003440] leading-snug">
            {SCHOOL_NAME}
          </h1>
          <p className="text-[0.86rem] font-bold text-[#005035]">
            Lista Piloto 2027
          </p>
          <p className="text-[0.76rem] font-semibold text-[#566366] uppercase tracking-wider">
            Uso Exclusivo de Professores
          </p>
        </div>

        {/* Mensagem de erro concisa (se houver) */}
        {errorMsg && (
          <div className="w-full p-3.5 rounded-2xl bg-[#fff8f7] border border-[#ba1a1a]/40 text-[#ba1a1a] text-[0.8rem] font-bold flex items-center gap-2 text-left">
            <span className="material-symbols-outlined text-[18px] shrink-0">
              error
            </span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Botão Único Google Workspace */}
        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={handleWorkspaceLogin}
            disabled={loading}
            className="w-full min-h-[54px] bg-[#003440] hover:bg-[#004c5c] text-white rounded-2xl font-extrabold text-[0.94rem] flex items-center justify-center gap-3 px-5 shadow-xs cursor-pointer active:scale-[0.99] transition-all disabled:opacity-60"
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
            <span>
              {loading ? 'Autenticando...' : 'Entrar com Google Workspace'}
            </span>
          </button>

          <p className="text-[0.74rem] font-semibold text-[#566366] font-mono">
            {INSTITUTIONAL_EMAIL_DOMAIN}
          </p>
        </div>
      </main>
    </div>
  );
};
