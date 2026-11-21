import React, { useState, useEffect } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import {
  APP_LOGO_URL,
  APP_LOGO_FALLBACK_URL,
  INITIAL_AUTHORIZED_USERS,
  SCHOOL_WATERMARK_GALLERY,
} from '../data/mockData';
import {
  findAuthorizedUserByEmail,
  isOfficialSchoolAdminEmail,
  isValidInstitutionalEmail,
  saveStoredAuthorizedUsers,
  isUserAccessExpired,
  formatAccessExpirationDateBR,
  establishServerAuthSessionCookie,
  addSecurityAuditLog,
} from '../services/db';
import {
  googleSignIn,
  logoutGoogle,
  detectAuthEnvironmentInfo,
  initGoogleIdentityFedCM,
  triggerGoogleIdentityPrompt,
} from '../services/googleSheetsApi';
import { fetchStateFromFirestoreCloud } from '../services/firebaseSync';
import { Loader2, AlertCircle, Copy, Check, ExternalLink } from 'lucide-react';

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
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [canTryFedCmFallback, setCanTryFedCmFallback] = useState(false);
  const [copiedPortalUrl, setCopiedPortalUrl] = useState(false);
  const [buttonMounted, setButtonMounted] = useState(false);
  const authEnv = React.useMemo(() => detectAuthEnvironmentInfo(), []);
  const localFallbackPhoto = `${import.meta.env.BASE_URL || '/'}escola-candelario.jpg`;
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Record<string, boolean>>({});
  const [photoSlide, setPhotoSlide] = useState<{ active: number; previous: number | null }>(() => ({
    active: Math.floor(Math.random() * Math.max(1, SCHOOL_WATERMARK_GALLERY.length - 1)),
    previous: null,
  }));

  const availableGallery = React.useMemo(() => {
    const filtered = SCHOOL_WATERMARK_GALLERY.filter((url) => !failedPhotoUrls[url]);
    return filtered.length > 0 ? filtered : [localFallbackPhoto];
  }, [failedPhotoUrls, localFallbackPhoto]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setButtonMounted(true);
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Alterna com transição esmaecida contínua (dissolve sobreposto sem cortes) entre fotos da EMEB Candelário
  useEffect(() => {
    if (availableGallery.length <= 1) return;

    const interval = setInterval(() => {
      setPhotoSlide((prev) => ({
        previous: prev.active,
        active: (prev.active + 1) % availableGallery.length,
      }));
    }, 7500);

    return () => clearInterval(interval);
  }, [availableGallery.length]);

  // Pré-carrega apenas a próxima foto da galeria
  useEffect(() => {
    if (availableGallery.length <= 1) return;
    const currentIdx = photoSlide.active % availableGallery.length;
    const nextIdx = (currentIdx + 1) % availableGallery.length;
    const preloadImg = new Image();
    preloadImg.referrerPolicy = 'no-referrer';
    preloadImg.src = availableGallery[nextIdx];
  }, [availableGallery, photoSlide.active]);

  useEffect(() => {
    if (externalError) {
      setErrorMsg(externalError);
    }
  }, [externalError]);

  // Validação segura e autorização da conta institucional retornada pelo Google
  const verifyAndAuthorizeEmail = async (
    rawEmail: string,
    displayName?: string | null,
    emailVerified = false,
    idToken?: string
  ) => {
    const authEmail = rawEmail.trim().toLowerCase();

    if (!emailVerified) {
      await logoutGoogle().catch(() => {});
      addSecurityAuditLog({
        userEmail: authEmail || 'desconhecido',
        userName: displayName || 'Não Verificado',
        userRole: 'usuario',
        eventType: 'LOGIN_FAILURE',
        actionTitle: 'Login bloqueado — E-mail não verificado',
        details: `Tentativa com conta sem e-mail verificado (${authEmail}).`,
        severity: 'warning',
      });
      setErrorMsg('Acesso bloqueado: sua conta Google precisa estar com o e-mail verificado.');
      return;
    }

    if (!isValidInstitutionalEmail(authEmail)) {
      await logoutGoogle().catch(() => {});
      addSecurityAuditLog({
        userEmail: authEmail,
        userName: displayName || authEmail,
        userRole: 'usuario',
        eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
        actionTitle: 'Tentativa de acesso fora do domínio institucional',
        details: `Conta "${authEmail}" bloqueada automaticamente na triagem Google Auth.`,
        severity: 'warning',
      });
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
      addSecurityAuditLog({
        userEmail: authEmail,
        userName: found.name,
        userRole: found.role,
        eventType: 'LOGIN_FAILURE',
        actionTitle: 'Acesso temporário expirado bloqueado',
        details: `Conta expirou após ${formatAccessExpirationDateBR(found.accessExpiresAt)}.`,
        severity: 'warning',
      });
      setErrorMsg(
        `Acesso expirado: o acesso temporário de "${authEmail}" venceu após ${formatAccessExpirationDateBR(
          found.accessExpiresAt
        )} e foi revogado automaticamente.`
      );
      return;
    }

    if (!found.active) {
      await logoutGoogle().catch(() => {});
      addSecurityAuditLog({
        userEmail: authEmail,
        userName: found.name,
        userRole: found.role,
        eventType: 'LOGIN_FAILURE',
        actionTitle: 'Tentativa de login de usuário desativado',
        details: `Conta "${authEmail}" está marcada como inativa.`,
        severity: 'warning',
      });
      setErrorMsg(
        `Acesso bloqueado: o usuário "${authEmail}" está desativado no sistema. Contate a Equipe Administrativa.`
      );
      return;
    }

    // Troca o Firebase ID Token por cookie de sessão HMAC HttpOnly no backend Express antes de montar a tela principal
    if (idToken) {
      await establishServerAuthSessionCookie(idToken).catch(() => false);
    }

    addSecurityAuditLog({
      userEmail: found.email,
      userName: found.name,
      userRole: found.role,
      eventType: 'LOGIN_SUCCESS',
      actionTitle: 'Autenticação Google Institucional concluída',
      details: `Sessão criptográfica iniciada com e-mail verificado (${found.role}).`,
      severity: 'info',
    });

    setErrorMsg(null);
    onLoginSuccess(found);
  };

  const verifyAndAuthorizeRef = React.useRef(verifyAndAuthorizeEmail);
  verifyAndAuthorizeRef.current = verifyAndAuthorizeEmail;

  // Inicializa Google Identity Services (FedCM / ITP-safe) em segundo plano sem bloquear o botão principal
  useEffect(() => {
    let active = true;
    void initGoogleIdentityFedCM(async (fbUser) => {
      if (!active || !fbUser.email) return;
      setLoading(true);
      try {
        const idToken = await fbUser.getIdToken().catch(() => undefined);
        await verifyAndAuthorizeRef.current(
          fbUser.email,
          fbUser.displayName,
          Boolean(fbUser.emailVerified),
          idToken
        );
      } finally {
        if (active) setLoading(false);
      }
    }).then((ready) => {
      if (active && ready) {
        setCanTryFedCmFallback(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const executePopupSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await googleSignIn();
      if (res?.user?.email) {
        const idToken = await res.user.getIdToken().catch(() => undefined);
        await verifyAndAuthorizeEmail(
          res.user.email,
          res.user.displayName,
          Boolean(res.user.emailVerified),
          idToken
        );
        return;
      }
    } catch (error: unknown) {
      const authErr = error as { code?: unknown; message?: unknown };
      const code = typeof authErr?.code === 'string' ? authErr.code : '';
      const message = typeof authErr?.message === 'string' ? authErr.message : '';

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
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
      } else if (
        code === 'auth/missing-initial-state' ||
        code === 'auth/web-storage-unsupported' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        message.includes('missing initial state') ||
        message.includes('sessionStorage')
      ) {
        setShowIosHelp(true);
        setErrorMsg(
          authEnv.isIOS
            ? 'O Safari/iOS bloqueou os dados temporários da janela de login do Google. Use o navegador Safari diretamente (fora da Tela de Início ou navegador interno) e verifique se pop-ups estão permitidos.'
            : 'O navegador bloqueou o armazenamento temporário (sessionStorage/cookies) necessário para o pop-up do Google. Permita cookies de sessão ou tente o login direto.'
        );
      } else if (code === 'auth/popup-blocked') {
        setShowIosHelp(authEnv.isIOS);
        setErrorMsg(
          'O pop-up de login do Google foi bloqueado pelo seu navegador. Permita pop-ups para este site e tente novamente.'
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

  // Executa o login com a conta Google preservando o gesto síncrono do usuário para pop-ups
  const handleGoogleLogin = () => {
    if (authEnv.isIOSStandalone || authEnv.isInAppBrowser) {
      setErrorMsg(null);
      if (canTryFedCmFallback && authEnv.supportsFedCM) {
        setLoading(true);
        void triggerGoogleIdentityPrompt().then((outcome) => {
          setLoading(false);
          if (outcome === 'unavailable') {
            setShowIosHelp(true);
          }
        });
        return;
      }
      setShowIosHelp(true);
      return;
    }
    void executePopupSignIn();
  };

  const handleCopyPortalUrl = async () => {
    if (typeof window === 'undefined') return;
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    try {
      await navigator.clipboard.writeText(cleanUrl);
      setCopiedPortalUrl(true);
      window.setTimeout(() => setCopiedPortalUrl(false), 3000);
    } catch {
      setCopiedPortalUrl(false);
    }
  };

  const handleTryFedCmSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const outcome = await triggerGoogleIdentityPrompt();
      if (outcome === 'unavailable') {
        setErrorMsg(
          'O login direto nativo não está disponível neste navegador/domínio. Abra o portal diretamente no navegador Safari ou Chrome.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const safeActiveIndex = photoSlide.active % availableGallery.length;
  const safePrevIndex =
    photoSlide.previous !== null &&
    photoSlide.previous % availableGallery.length !== safeActiveIndex
      ? photoSlide.previous % availableGallery.length
      : null;

  return (
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none font-sans bg-[#0a1529]">
      {/* Galeria alternada com dissolução esmaecida contínua (camada anterior firme sob camada nova em fade-in) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#0a1529]">
        {safePrevIndex !== null && (
          <img
            key={`prev-${availableGallery[safePrevIndex]}`}
            src={availableGallery[safePrevIndex]}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="absolute inset-0 z-0 w-full h-full object-cover object-center filter brightness-[0.92] contrast-[1.03] saturate-[1.04]"
          />
        )}
        <img
          key={`active-${safeActiveIndex}-${availableGallery[safeActiveIndex]}`}
          src={availableGallery[safeActiveIndex]}
          alt="EMEB Prof. Joaquim Candelário de Freitas"
          referrerPolicy="no-referrer"
          loading="eager"
          onError={() => {
            const failedUrl = availableGallery[safeActiveIndex];
            if (failedUrl && failedUrl !== localFallbackPhoto) {
              setFailedPhotoUrls((prev) => ({ ...prev, [failedUrl]: true }));
            }
          }}
          className="absolute inset-0 z-[1] w-full h-full object-cover object-center filter brightness-[0.92] contrast-[1.03] saturate-[1.04] animate-login-photo-dissolve"
        />
        {/* Véu escuro suave para manter a foto nítida, colorida e levemente escurecida sem esbranquiçar */}
        <div className="absolute inset-0 z-[2] bg-[#071226]/22" />
        <div className="absolute inset-0 z-[2] bg-[radial-gradient(ellipse_at_center,rgba(7,18,38,0.16)_0%,rgba(5,12,26,0.46)_100%)]" />
      </div>

      {/* Card Minimalista e Focado Sem Bordas */}
      <div className="relative z-10 w-full max-w-[390px] min-w-0 bg-white/97 backdrop-blur-md rounded-3xl shadow-[0_28px_68px_rgba(2,6,23,0.42)] px-7 py-9 sm:px-9 sm:py-10 flex flex-col items-center text-center animate-apple-pop">
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
        <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-slate-700">
          Prefeitura de Jundiaí · SME
        </p>

        {/* Nome do Aplicativo */}
        <h1 className="text-xl sm:text-[22px] font-bold tracking-tight text-[#14428c] leading-snug mt-1.5 text-balance">
          Lista Piloto Candelário 2027
        </h1>

        <p className="text-xs sm:text-[13px] font-semibold text-slate-700 leading-snug mt-1 mb-8 text-balance">
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
            className="w-full min-h-[52px] py-2.5 px-5 bg-[#eef3f9] hover:bg-[#e2e8f0] rounded-full text-slate-950 font-semibold text-sm sm:text-[15px] flex items-center justify-center gap-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.08)] hover:shadow-[0_8px_20px_rgba(11,59,140,0.16)] hover:-translate-y-px active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#14428c]" />
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
          <div className="w-full mt-4 px-3.5 py-2.5 rounded-2xl bg-[#fff1f2] text-[#9f1239] text-xs font-semibold leading-relaxed break-words text-left flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-[#be123c] shrink-0 mt-0.5" />
            <p className="flex-1">{errorMsg}</p>
          </div>
        )}

        {/* Orientação prática para iPhone (Modo Tela de Início / Navegador Interno / Storage Particionado) */}
        {showIosHelp && (
          <div className="w-full mt-3.5 p-3.5 rounded-2xl bg-[#f3f6fb] text-[#0f172a] text-left space-y-2.5 animate-fade-in">
            <p className="text-xs font-bold text-[#14428c] leading-snug">
              {authEnv.isIOSStandalone
                ? 'Abertura pela Tela de Início (iOS)'
                : authEnv.isInAppBrowser
                ? 'Navegador interno detectado'
                : 'Compatibilidade de login no Safari / iOS'}
            </p>
            <p className="text-[11.5px] text-[#334155] leading-relaxed">
              {authEnv.isIOSStandalone
                ? 'No iPhone, o modo Tela de Início isola a janela de login do Google. Copie o endereço abaixo e abra diretamente no navegador Safari para entrar.'
                : authEnv.isInAppBrowser
                ? 'Apps como WhatsApp, Gmail ou navegadores internos bloqueiam o retorno do login. Toque em Abrir no Safari ou copie o link abaixo.'
                : 'Se o Safari bloquear a janela do Google, verifique em Ajustes > Safari se "Bloquear Pop-ups" não está impedindo a janela ou abra em uma nova aba do Safari.'}
            </p>
            <div className="flex flex-col gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleCopyPortalUrl}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedPortalUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Link copiado! Cole no Safari</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                    <span>Copiar Link para Abrir no Safari</span>
                  </>
                )}
              </button>

              {canTryFedCmFallback && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleTryFedCmSignIn}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#e8f0fe] hover:bg-[#d4e2fc] text-[#14428c] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>Tentar Login Direto Google</span>
                </button>
              )}

              {(authEnv.isIOSStandalone || authEnv.isInAppBrowser) && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void executePopupSignIn()}
                  className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-[#eef3f9] hover:bg-[#dfe8f4] text-[#334155] text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
                >
                  Tentar janela de login mesmo assim
                </button>
              )}
            </div>
          </div>
        )}

        {/* Rodapé Institucional Discreto Sem Linha Divisória */}
        <div className="w-full mt-6 pt-3">
          <p className="text-[11px] text-slate-600 leading-relaxed text-balance">
            Acesso exclusivo para contas institucionais autorizadas (<span className="font-bold text-slate-900">@educacao.jundiai.sp.gov.br</span>).
          </p>
        </div>
      </div>
    </div>
  );
};
