import React, { useState, useEffect } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import {
  APP_LOGO_URL,
  APP_LOGO_FALLBACK_URL,
  INITIAL_AUTHORIZED_USERS,
  SCHOOL_PATRON_WATERMARK_URL,
} from '../data/mockData';
import {
  findAuthorizedUserByEmail,
  isOfficialSchoolAdminEmail,
  isValidInstitutionalEmail,
  saveStoredAuthorizedUsers,
  isUserAccessExpired,
  formatAccessExpirationDateBR,
} from '../services/db';
import {
  googleSignIn,
  checkGoogleRedirectResult,
  logoutGoogle,
} from '../services/googleSheetsApi';
import { fetchStateFromFirestoreCloud } from '../services/firebaseSync';
import { Loader2, AlertCircle } from 'lucide-react';

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
  const [buttonMounted, setButtonMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setButtonMounted(true);
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (externalError) {
      setErrorMsg(externalError);
    }
  }, [externalError]);

  // Validação segura e autorização da conta institucional retornada pelo Google
  const verifyAndAuthorizeEmail = async (rawEmail: string, displayName?: string | null) => {
    const authEmail = rawEmail.trim().toLowerCase();

    if (!isValidInstitutionalEmail(authEmail)) {
      await logoutGoogle().catch(() => {});
      setErrorMsg(
        `Acesso restrito: o e-mail "${authEmail}" não pertence ao domínio institucional (@educacao.jundiai.sp.gov.br) ou à conta oficial da escola.`
      );
      return;
    }

    // Busca usuários sincronizados no Firestore
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

    let found = findAuthorizedUserByEmail(authEmail, mergedUsers);

    // Se o usuário possui um e-mail institucional válido (@educacao.jundiai.sp.gov.br ou emebjfreitas@),
    // mas ainda não estava pré-cadastrado na lista estática, auto-provisiona para NUNCA barrar um servidor real
    if (!found) {
      const isSchoolAdmin = isOfficialSchoolAdminEmail(authEmail);
      const cleanName =
        displayName && displayName.trim().length > 2
          ? displayName.trim().toUpperCase()
          : authEmail
              .split('@')[0]
              .replace(/\./g, ' ')
              .toUpperCase();

      found = {
        id: `usr-auto-${Date.now()}`,
        email: authEmail,
        name: isSchoolAdmin ? 'Equipe Administrativa' : `Prof(a). ${cleanName}`,
        role: isSchoolAdmin ? 'admin' : 'usuario',
        teacherRoleType: isSchoolAdmin ? 'admin' : 'peb1',
        pronoun: 'PROFESSOR(A)',
        firstName: isSchoolAdmin ? 'DIREÇÃO' : cleanName.split(' ')[0],
        subjectName: isSchoolAdmin ? 'GESTÃO / ADMIN' : 'REGENTE PEB I',
        assignedClassId: isSchoolAdmin ? 'all' : 'g04a',
        assignedClassIds: isSchoolAdmin ? ['all'] : ['g04a'],
        assignedClassName: isSchoolAdmin
          ? 'Todas as 40 Turmas (Acesso Pleno)'
          : 'GRUPO 04 A (Manhã)',
        assignedClassNames: isSchoolAdmin
          ? ['Todas as 40 Turmas (Acesso Pleno)']
          : ['GRUPO 04 A (Manhã)'],
        active: true,
        createdAt: new Date().toLocaleDateString('pt-BR'),
      };

      const updated = [found, ...mergedUsers];
      saveStoredAuthorizedUsers(updated);
    }

    if (isUserAccessExpired(found)) {
      await logoutGoogle().catch(() => {});
      setErrorMsg(
        `Acesso expirado: o acesso temporário de "${authEmail}" venceu após ${formatAccessExpirationDateBR(
          found.accessExpiresAt
        )} e foi revogado automaticamente.`
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

    setErrorMsg(null);
    onLoginSuccess(found);
  };

  // Verifica retorno de autenticação via redirect do Google (quando pop-up não pode ser aberto)
  useEffect(() => {
    let mounted = true;
    const handleRedirectCheck = async () => {
      try {
        const res = await checkGoogleRedirectResult();
        if (mounted && res?.user?.email) {
          setLoading(true);
          await verifyAndAuthorizeEmail(res.user.email, res.user.displayName);
        }
      } catch {
        // sem redirecionamento pendente
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void handleRedirectCheck();
    return () => {
      mounted = false;
    };
  }, []);

  // Executa o login com a conta Google com validação estrita de segurança (sem bypass)
  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await googleSignIn();
      if (res?.user?.email) {
        await verifyAndAuthorizeEmail(res.user.email, res.user.displayName);
        return;
      }
      // Se não retornou e-mail imediato (ex: redirecionamento em andamento), não efetua login e aguarda o fluxo seguro
    } catch (error: any) {
      const code = String(error?.code || '');
      const message = String(error?.message || '');

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // Usuário fechou ou cancelou o pop-up do Google
        setErrorMsg(null);
      } else if (
        code === 'auth/unauthorized-domain' ||
        message.includes('unauthorized domain') ||
        message.includes('auth/unauthorized-domain')
      ) {
        const currentHost =
          typeof window !== 'undefined' && window.location.hostname
            ? window.location.hostname
            : 'deste ambiente';
        setErrorMsg(
          `Domínio não autorizado no Firebase Auth (${currentHost}). Por segurança, adicione "${currentHost}" no Firebase Console (Authentication > Configurações > Domínios autorizados) para permitir o login seguro com o Google nesta hospedagem.`
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(
          'O pop-up de login do Google foi bloqueado pelo seu navegador. Por favor, permita pop-ups para este site e tente novamente.'
        );
      } else {
        setErrorMsg(
          'Não foi possível concluir a autenticação com o Google. Verifique sua conexão e tente novamente.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const schoolPhotoSrc = `${import.meta.env.BASE_URL || '/'}escola-candelario.jpg`;

  return (
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none font-sans bg-slate-200">
      {/* Foto da EMEB Professor Joaquim Candelário de Freitas em marca d'água visível e natural ao fundo */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-slate-100">
        <img
          src={schoolPhotoSrc}
          alt="EMEB Prof. Joaquim Candelário de Freitas"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = SCHOOL_PATRON_WATERMARK_URL;
          }}
          className="w-full h-full object-cover object-center opacity-85 filter brightness-105 contrast-100 saturate-95 transition-opacity duration-700"
        />
        {/* Véu claro translúcido para garantir que a foto da escola fique nítida, clara e luminosa sem escurecer */}
        <div className="absolute inset-0 bg-white/40" />
      </div>

      {/* Card Minimalista e Focado */}
      <div className="relative z-10 w-full max-w-[390px] min-w-0 bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_24px_60px_rgba(15,23,42,0.22)] border border-white/80 px-7 py-9 sm:px-9 sm:py-10 flex flex-col items-center text-center animate-apple-pop">
        {/* Brasão Oficial de Jundiaí */}
        <img
          src={APP_LOGO_URL}
          alt="Brasão de Jundiaí"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = APP_LOGO_FALLBACK_URL;
          }}
          className="w-16 h-16 object-contain mb-4 shrink-0 drop-shadow-xs"
        />

        {/* Identificação Institucional */}
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-500">
          Prefeitura de Jundiaí · SME
        </p>

        {/* Nome do Aplicativo */}
        <h1 className="text-xl sm:text-[22px] font-bold tracking-tight text-[#0b3b8c] leading-snug mt-1.5 text-balance">
          Lista Piloto Candelário 2027
        </h1>

        <p className="text-xs sm:text-[13px] font-medium text-slate-600 leading-snug mt-1 mb-8 text-balance">
          EMEB Prof. Joaquim Candelário de Freitas
        </p>

        {/* Botão Oficial de 'Entrar com o Google' com transição de entrada suave (fade-in) */}
        <div
          className={`w-full transition-all duration-700 ease-out animate-google-btn-fade-in ${
            buttonMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleLogin}
            aria-label="Fazer login com a conta Google"
            className="w-full min-h-[50px] py-2.5 px-5 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-full text-[#3c4043] font-medium text-sm sm:text-[15px] flex items-center justify-center gap-3.5 shadow-sm hover:shadow active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3b8c]"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#0b3b8c]" />
            ) : (
              <svg
                className="w-5 h-5 shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
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
            <span className="truncate">
              {loading ? 'Acessando...' : 'Fazer login com o Google'}
            </span>
          </button>
        </div>

        {/* Mensagem de Erro com Design Limpo e Acessível */}
        {errorMsg && (
          <div className="w-full mt-4 px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-900 text-xs font-medium leading-relaxed break-words text-left flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="flex-1">{errorMsg}</p>
          </div>
        )}

        {/* Rodapé Institucional Discreto */}
        <div className="w-full mt-7 pt-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 leading-relaxed text-balance">
            Acesso exclusivo para contas institucionais autorizadas (<span className="font-medium text-slate-700">@educacao.jundiai.sp.gov.br</span>).
          </p>
        </div>
      </div>
    </div>
  );
};
