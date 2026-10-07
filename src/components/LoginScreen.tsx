import React, { useState, useEffect } from 'react';
import { AuthorizedUser } from '../types';
import {
  APP_LOGO_URL,
  APP_LOGO_FALLBACK_URL,
  SCHOOL_PATRON_WATERMARK_URL,
  INSTITUTIONAL_EMAIL_DOMAIN,
} from '../data/mockData';
import {
  isValidInstitutionalEmail,
  findAuthorizedUserByEmail,
  getStoredClasses,
  saveStoredAuthorizedUsers,
} from '../services/db';
import {
  googleSignIn,
  logoutGoogle,
  checkGoogleRedirectResult,
  readAuthorizedUsersFromGoogleSheet,
} from '../services/googleSheetsApi';

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
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);

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

    // Pull latest authorizedUsers from Google Sheet first so if Admin changed this teacher's class (e.g., Giulia Patez -> GRUPO 04 C), she opens GRUPO 04 C immediately!
    let latestUsers = authorizedUsers;
    try {
      const sheetUsers = await readAuthorizedUsersFromGoogleSheet(
        authorizedUsers,
        getStoredClasses()
      );
      if (sheetUsers && sheetUsers.length > 0) {
        latestUsers = sheetUsers;
        saveStoredAuthorizedUsers(sheetUsers);
      }
    } catch {
      // fallback to local list if offline
    }

    const registeredUser = findAuthorizedUserByEmail(
      cleanEmail,
      latestUsers
    );
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

    onLoginSuccess(registeredUser);
  };

  // Recover login if browser used redirect flow (e.g. mobile Safari/Chrome or blocked popup)
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
        // Redirect flow initiated
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
        setErrorMsg(
          `Falta autorizar o endereço "${currentHostname}" no Firebase para abrir a janela do Google.`
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Janela de login fechada antes de concluir.');
      } else if (code === 'auth/cancelled-popup-request') {
        // ignore duplicate click
      } else {
        setUnauthorizedHost(currentHostname);
        setErrorMsg(
          `Não foi possível abrir o login Google em "${currentHostname}". Verifique se este domínio está autorizado no Firebase.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f4f7f5] text-[#0f1614] flex items-center justify-center p-4 overflow-hidden animate-gentle-fade">
      {/* Marca d'água de fundo em tela cheia com a Foto Oficial da Escola (Flickr) */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none fixed inset-0 flex items-center justify-center overflow-hidden z-0"
      >
        <img
          src={SCHOOL_PATRON_WATERMARK_URL}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-[0.13] scale-105 mix-blend-multiply"
        />
      </div>

      <main className="relative z-10 w-full max-w-[420px] bg-white/94 backdrop-blur-md rounded-3xl shadow-sm border border-[#d5dddf] px-7 py-9 flex flex-col items-center text-center space-y-6 overflow-hidden">
        {/* Marca d'água sutil interna no cartão com a Foto Oficial */}
        <img
          src={SCHOOL_PATRON_WATERMARK_URL}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover opacity-[0.055] mix-blend-multiply"
        />

        {/* Brasão Oficial de Jundiaí */}
        <div className="relative z-10 w-24 h-24 rounded-2xl overflow-hidden border border-[#d5dddf] shadow-xs flex items-center justify-center bg-white p-2">
          <img
            src={APP_LOGO_URL}
            alt="Prefeitura Municipal de Jundiaí - Secretaria Municipal de Educação"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = APP_LOGO_FALLBACK_URL;
            }}
            className="w-full h-full object-contain"
          />
        </div>

        {/* Tipografia Minimalista */}
        <div className="relative z-10 space-y-1">
          <h1 className="text-[1.35rem] font-extrabold text-[#003440] leading-tight">
            Lista Piloto 2027
          </h1>
          <p className="text-[0.96rem] font-bold text-[#005035] leading-snug">
            EMEB Professor Joaquim Candelário de Freitas
          </p>
          <div className="pt-1 space-y-0.5">
            <p className="text-[0.76rem] font-extrabold uppercase tracking-wide text-[#003440]">
              Prefeitura do Município de Jundiaí
            </p>
            <p className="text-[0.73rem] font-bold uppercase tracking-wide text-[#2c373a]">
              Secretaria Municipal de Educação
            </p>
          </div>
          <p className="text-[0.72rem] font-semibold text-[#566366] uppercase tracking-wider pt-1">
            Uso Exclusivo de Professores
          </p>
        </div>

        {/* Mensagem de erro + Ajuda Direta caso falte autorizar o domínio do GitHub no Firebase */}
        {errorMsg && (
          <div className="w-full p-3.5 rounded-2xl bg-[#fff8f7] border border-[#ba1a1a]/40 text-[#ba1a1a] text-[0.78rem] font-bold space-y-2.5 text-left">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                error
              </span>
              <span>{errorMsg}</span>
            </div>

            {unauthorizedHost && (
              <div className="p-2.5 rounded-xl bg-white border border-[#ba1a1a]/25 text-[#0f1614] space-y-2">
                <p className="text-[0.74rem] font-semibold text-[#2c373a]">
                  Para liberar a janela do Google no GitHub (leva 15 segundos):
                </p>
                <div className="flex items-center justify-between gap-2 bg-[#f4f7f5] px-2.5 py-1.5 rounded-lg border border-[#a8b5b9]">
                  <code className="font-mono text-[0.74rem] font-bold text-[#003440] truncate">
                    {unauthorizedHost}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(unauthorizedHost);
                      setCopiedHost(true);
                      setTimeout(() => setCopiedHost(false), 2000);
                    }}
                    className="px-2 py-0.5 rounded bg-[#003440] text-white text-[0.68rem] font-bold cursor-pointer shrink-0"
                  >
                    {copiedHost ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <a
                  href="https://console.firebase.google.com/project/gen-lang-client-0243513788/authentication/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-lg bg-[#005035] hover:bg-[#003723] text-white font-extrabold text-[0.74rem] flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    open_in_new
                  </span>
                  <span>Abrir Painel Firebase e Colar Domínio</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Botão Único E-mail Institucional @educacao.jundiai.sp.gov.br */}
        <div className="relative z-10 w-full space-y-2.5">
          <button
            type="button"
            onClick={handleWorkspaceLogin}
            disabled={loading}
            className="w-full min-h-[64px] bg-[#003440] hover:bg-[#004c5c] text-white rounded-2xl px-4 py-3 shadow-sm cursor-pointer active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-3.5"
          >
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-2xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            <div className="flex flex-col items-start text-left min-w-0">
              <span className="font-extrabold text-[0.9rem] leading-tight text-white">
                {loading
                  ? 'Autenticando E-mail Institucional...'
                  : 'Entrar somente com E-mail Institucional'}
              </span>
              <span className="font-mono font-bold text-[0.75rem] text-[#bdeafa] leading-tight mt-0.5">
                {INSTITUTIONAL_EMAIL_DOMAIN}
              </span>
            </div>
          </button>
        </div>
      </main>
    </div>
  );
};
