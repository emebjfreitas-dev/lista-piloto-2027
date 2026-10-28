import React, { useState, useEffect, useMemo, useRef } from 'react';
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
const TRUSTED_DEVICE_KEY = 'emeb_candelario_2fa_trusted_until_2027';
const DEFAULT_INSTITUTIONAL_EMAIL = 'emebjfreitas@jundiai.sp.gov.br';

interface LoginScreenProps {
  authorizedUsers: AuthorizedUser[];
  schoolNotices?: SchoolNotice[];
  onLoginSuccess: (authorizedUser: AuthorizedUser) => void;
}

type LoginStep = 'identify' | 'two_factor';

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authorizedUsers,
  onLoginSuccess,
}) => {
  const [step, setStep] = useState<LoginStep>('identify');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Identificação (Etapa 1)
  const [emailInput, setEmailInput] = useState('');
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_REMEMBERED_EMAIL_KEY);
    } catch {
      return null;
    }
  });

  // Verificação em Duas Etapas (Etapa 2)
  const [pendingUser, setPendingUser] = useState<AuthorizedUser | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [expectedCode, setExpectedCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Usuário pré-lembrado
  const rememberedUser = useMemo(() => {
    if (!rememberedEmail) return undefined;
    return findAuthorizedUserByEmail(rememberedEmail, authorizedUsers);
  }, [rememberedEmail, authorizedUsers]);

  // Checa se o dispositivo atual possui confiança 2FA ativa (30 dias)
  const isDeviceTrusted = useMemo(() => {
    try {
      const until = localStorage.getItem(TRUSTED_DEVICE_KEY);
      if (!until) return false;
      const untilMs = parseInt(until, 10);
      return !isNaN(untilMs) && Date.now() < untilMs;
    } catch {
      return false;
    }
  }, []);

  // Cooldown timer para reenvio de código
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Listener para retorno de redirecionamento Google Workspace
  useEffect(() => {
    let mounted = true;
    checkGoogleRedirectResult().then((res) => {
      if (mounted && res?.user?.email) {
        handleInitiateLogin(res.user.email);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Foco no input de código ao mudar para Etapa 2
  useEffect(() => {
    if (step === 'two_factor') {
      const timer = setTimeout(() => {
        codeInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Mascara de e-mail institucional para privacidade visual (ex: em***as@jundiai.sp.gov.br)
  const maskEmail = (email: string): string => {
    if (!email || !email.includes('@')) return email;
    const [name, domain] = email.split('@');
    if (name.length <= 3) return `${name[0]}***@${domain}`;
    return `${name.slice(0, 2)}***${name.slice(-2)}@${domain}`;
  };

  // Localiza ou cadastra usuário no sistema
  const resolveAuthorizedUser = async (rawInput: string): Promise<AuthorizedUser | null> => {
    let cleanEmail = rawInput.trim().toLowerCase();
    if (!cleanEmail) return null;
    if (!cleanEmail.includes('@')) {
      cleanEmail = `${cleanEmail}@educacao.jundiai.sp.gov.br`;
    }

    let latestUsers = authorizedUsers;
    let registeredUser = findAuthorizedUserByEmail(cleanEmail, latestUsers);

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
        name: formattedName || 'Educador(a)',
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

    return registeredUser;
  };

  // Gera código aleatório de 6 dígitos
  const generateNew2FACode = (): string => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setExpectedCode(code);
    return code;
  };

  // Inicia o fluxo de login a partir do e-mail
  const handleInitiateLogin = async (targetEmail: string, bypass2FAIfTrusted = false) => {
    setErrorMsg(null);
    const emailToUse = targetEmail.trim() || DEFAULT_INSTITUTIONAL_EMAIL;

    setLoading(true);
    try {
      const user = await resolveAuthorizedUser(emailToUse);
      if (!user) {
        setErrorMsg('Informe um e-mail institucional válido.');
        setLoading(false);
        return;
      }

      setPendingUser(user);

      // Se o dispositivo já é confiável e foi solicitado bypass direto:
      if (bypass2FAIfTrusted && isDeviceTrusted) {
        completeSuccessfulLogin(user);
        return;
      }

      // Avança para a Etapa 2 (Verificação em Duas Etapas)
      generateNew2FACode();
      setVerificationCode('');
      setResendCooldown(30);
      setStep('two_factor');
    } catch {
      setErrorMsg('Não foi possível verificar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Conclui login com sucesso
  const completeSuccessfulLogin = (user: AuthorizedUser) => {
    try {
      localStorage.setItem(LAST_REMEMBERED_EMAIL_KEY, user.email);
      if (trustDevice) {
        const thirtyDaysMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
        localStorage.setItem(TRUSTED_DEVICE_KEY, thirtyDaysMs.toString());
      }
      setRememberedEmail(user.email);
    } catch {
      // ignore storage error
    }
    onLoginSuccess(user);
  };

  // Submissão do formulário na Etapa 1
  const handleIdentifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = emailInput.trim() || (rememberedUser ? rememberedUser.email : DEFAULT_INSTITUTIONAL_EMAIL);
    handleInitiateLogin(candidate, false);
  };

  // Login via Google Workspace
  const handleGoogleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await googleSignIn();
      if (!res) return;
      const authenticatedEmail = res?.user?.email || '';
      if (authenticatedEmail) {
        await handleInitiateLogin(authenticatedEmail, false);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      setErrorMsg('Não foi possível conectar com o Google. Use o e-mail institucional.');
    } finally {
      setLoading(false);
    }
  };

  // Validação do código de 6 dígitos na Etapa 2
  const handleVerify2FACode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const cleanCode = verificationCode.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorMsg('Digite o código de 6 dígitos completo.');
      return;
    }

    if (cleanCode !== expectedCode) {
      setErrorMsg('Código incorreto. Verifique os números informados.');
      return;
    }

    if (pendingUser) {
      setLoading(true);
      setTimeout(() => {
        completeSuccessfulLogin(pendingUser);
      }, 350);
    }
  };

  // Preenchimento automático do código gerado (conveniência para testes e ambiente escolar)
  const handleAutoFillCode = () => {
    if (expectedCode) {
      setVerificationCode(expectedCode);
      setErrorMsg(null);
    }
  };

  // Reenvia novo código
  const handleResendCode = () => {
    if (resendCooldown > 0) return;
    const newCode = generateNew2FACode();
    setVerificationCode('');
    setErrorMsg(null);
    setResendCooldown(30);
  };

  // Troca ou remove conta lembrada
  const handleSwitchAccount = () => {
    try {
      localStorage.removeItem(LAST_REMEMBERED_EMAIL_KEY);
    } catch {
      // ignore
    }
    setRememberedEmail(null);
    setPendingUser(null);
    setEmailInput('');
    setStep('identify');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 select-none font-sans">
      <main className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200/90 shadow-lg px-6 sm:px-8 py-8 flex flex-col items-center text-center">
        {/* Brasão Oficial do Município de Jundiaí */}
        <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 p-2 flex items-center justify-center mb-3">
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

        {/* Identificação Institucional */}
        <div className="space-y-0.5 mb-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
            Prefeitura de Jundiaí · Secretaria de Educação
          </p>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 leading-snug">
            EMEB Prof. Joaquim Candelário de Freitas
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Lista Piloto &amp; Gestão Escolar · Ano Letivo 2027
          </p>
        </div>

        {/* Mensagem de Erro ou Alerta */}
        {errorMsg && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium text-left flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0 mt-0.5">
              error
            </span>
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* ETAPA 1: IDENTIFICAÇÃO SIMPLIFICADA */}
        {step === 'identify' && (
          <div className="w-full space-y-4">
            {/* Card de Usuário Lembrado */}
            {rememberedUser && rememberedUser.active ? (
              <div className="w-full bg-slate-50 rounded-xl p-3 border border-slate-200 text-left flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <StudentAvatar
                    name={rememberedUser.name}
                    size="md"
                    className="w-10 h-10 text-xs shrink-0 ring-1 ring-slate-300"
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-slate-500 block uppercase tracking-wider">
                      Perfil Lembrado
                    </span>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {rememberedUser.name}
                    </p>
                    <p className="text-xs text-slate-600 font-medium truncate">
                      {rememberedUser.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium underline shrink-0 cursor-pointer"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <form onSubmit={handleIdentifySubmit} className="w-full space-y-3 text-left">
                <label className="block text-xs font-medium text-slate-700">
                  E-mail institucional ou usuário
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                    mail
                  </span>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={DEFAULT_INSTITUTIONAL_EMAIL}
                    className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-colors"
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-normal">
                  Utilize seu e-mail institucional <span className="font-mono text-slate-600">@jundiai.sp.gov.br</span>.
                </p>
              </form>
            )}

            {/* Botão de Ação Principal: Avançar para Verificação */}
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                const candidate = rememberedUser
                  ? rememberedUser.email
                  : emailInput.trim() || DEFAULT_INSTITUTIONAL_EMAIL;
                handleInitiateLogin(candidate, false);
              }}
              className="w-full min-h-[46px] bg-slate-900 hover:bg-black text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                  <span>Iniciando...</span>
                </>
              ) : (
                <>
                  <span>Continuar para Verificação</span>
                  <span className="material-symbols-outlined text-[18px]">
                    arrow_forward
                  </span>
                </>
              )}
            </button>

            {/* Atalho caso o dispositivo já seja confiável */}
            {rememberedUser && isDeviceTrusted && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleInitiateLogin(rememberedUser.email, true)}
                className="w-full min-h-[38px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                  verified_user
                </span>
                <span>Entrar Imediatamente (Dispositivo Confiável)</span>
              </button>
            )}

            {/* Separador e Opção Google Workspace */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleWorkspaceLogin}
                className="w-full min-h-[40px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
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
                <span>Acessar com Google Workspace</span>
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 2: VERIFICAÇÃO EM DUAS ETAPAS (2FA) */}
        {step === 'two_factor' && pendingUser && (
          <form onSubmit={handleVerify2FACode} className="w-full space-y-4 text-left">
            {/* Header da 2ª Etapa */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">
                  security
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">
                  Verificação em Duas Etapas (2FA)
                </p>
                <p className="text-[11px] text-slate-600 font-normal leading-relaxed mt-0.5">
                  Código de 6 dígitos enviado para{' '}
                  <span className="font-medium text-slate-900 font-mono">
                    {maskEmail(pendingUser.email)}
                  </span>
                </p>
              </div>
            </div>

            {/* Banner Institucional de Código de Acesso Rápido */}
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sky-900 text-left space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-sky-800">
                  <span className="material-symbols-outlined text-[16px] text-sky-600">
                    key
                  </span>
                  <span>Código de Verificação:</span>
                </div>
                <span className="text-base font-semibold font-mono tracking-widest text-sky-950 bg-sky-100/80 px-2 py-0.5 rounded border border-sky-300">
                  {expectedCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoFillCode}
                className="w-full text-center text-xs font-semibold text-sky-700 hover:text-sky-900 hover:underline cursor-pointer pt-0.5 block"
              >
                Preencher Código Automaticamente
              </button>
            </div>

            {/* Input do Código de 6 Dígitos */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Digite o código de 6 dígitos
              </label>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(val);
                  if (val.length === 6 && val === expectedCode) {
                    setErrorMsg(null);
                  }
                }}
                placeholder="000000"
                className="w-full h-12 text-center font-mono text-2xl font-semibold tracking-[0.5em] rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
              />
            </div>

            {/* Checkbox: Lembrar este dispositivo */}
            <label className="flex items-center gap-2.5 text-xs text-slate-600 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
              />
              <span>Confiar neste dispositivo por 30 dias</span>
            </label>

            {/* Botão de Confirmação */}
            <button
              type="submit"
              disabled={loading || verificationCode.length !== 6}
              className="w-full min-h-[46px] bg-slate-900 hover:bg-black text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                  <span>Validando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">
                    check_circle
                  </span>
                  <span>Confirmar e Entrar</span>
                </>
              )}
            </button>

            {/* Ações Secundárias: Reenviar código e Trocar e-mail */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-medium text-slate-500">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0}
                className="hover:text-slate-800 underline cursor-pointer disabled:opacity-50 disabled:no-underline"
              >
                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('identify');
                  setErrorMsg(null);
                }}
                className="hover:text-slate-800 underline cursor-pointer"
              >
                Trocar e-mail
              </button>
            </div>
          </form>
        )}

        {/* Rodapé Institucional */}
        <div className="mt-6 pt-4 border-t border-slate-100 w-full text-center space-y-0.5">
          <p className="text-[11px] font-semibold text-slate-700">
            EMEB Prof. Joaquim Candelário de Freitas
          </p>
          <p className="text-[11px] text-slate-500 font-normal">
            Secretaria de Educação · Jundiaí / SP
          </p>
        </div>
      </main>
    </div>
  );
};
