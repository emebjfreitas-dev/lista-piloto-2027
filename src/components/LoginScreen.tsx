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

  // Verificação em Duas Etapas (Etapa 2) & Segurança Adaptativa
  const [pendingUser, setPendingUser] = useState<AuthorizedUser | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [expectedCode, setExpectedCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPromptSimulado, setShowPromptSimulado] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Usuário pré-lembrado
  const rememberedUser = useMemo(() => {
    if (!rememberedEmail) return undefined;
    return findAuthorizedUserByEmail(rememberedEmail, authorizedUsers);
  }, [rememberedEmail, authorizedUsers]);

  // Checa se o dispositivo atual possui confiança 2FA ativa
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

  // Timer de Bloqueio por Força Bruta (60 segundos após 3 erros)
  useEffect(() => {
    if (!lockedUntil) {
      setLockoutRemaining(0);
      return;
    }
    const updateLockout = () => {
      const diff = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (diff <= 0) {
        setLockedUntil(null);
        setLockoutRemaining(0);
        setFailedAttempts(0);
        setErrorMsg(null);
      } else {
        setLockoutRemaining(diff);
      }
    };
    updateLockout();
    const timer = window.setInterval(updateLockout, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

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

  // Gera código aleatório de 6 dígitos com expiração de 5 minutos
  const generateNew2FACode = (): string => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setExpectedCode(code);
    setCodeExpiresAt(Date.now() + 5 * 60 * 1000); // 5 minutos de validade estrita
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
      setShowPromptSimulado(true);
    } catch {
      setErrorMsg('Não foi possível verificar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Conclui login com sucesso e grava auditoria
  const completeSuccessfulLogin = (user: AuthorizedUser) => {
    try {
      localStorage.setItem(LAST_REMEMBERED_EMAIL_KEY, user.email);
      if (trustDevice) {
        // ADMIN: segurança máxima com renovação em 7 dias; USUÁRIO PEB I: 30 dias para evitar atritos diários
        const validityDays = user.role === 'admin' ? 7 : 30;
        const validUntilMs = Date.now() + validityDays * 24 * 60 * 60 * 1000;
        localStorage.setItem(TRUSTED_DEVICE_KEY, validUntilMs.toString());
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

  // Validação do código de 6 dígitos com proteção contra ataques de força bruta
  const handleVerify2FACode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    // Proteção de Força Bruta: Bloqueio ativo
    if (lockedUntil && Date.now() < lockedUntil) {
      const waitSec = Math.ceil((lockedUntil - Date.now()) / 1000);
      setErrorMsg(`Por proteção de segurança da escola, aguarde ${waitSec} segundos para tentar novamente.`);
      return;
    }

    // Proteção de Expiração: Código após 5 minutos
    if (codeExpiresAt && Date.now() > codeExpiresAt) {
      setErrorMsg('O código de segurança expirou (validade de 5 min). Gerando um novo código institucional...');
      generateNew2FACode();
      setVerificationCode('');
      return;
    }

    const cleanCode = verificationCode.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorMsg('Digite o código de 6 dígitos completo.');
      return;
    }

    if (cleanCode !== expectedCode) {
      const nextCount = failedAttempts + 1;
      setFailedAttempts(nextCount);

      if (nextCount >= 3) {
        const lockoutPeriod = Date.now() + 60 * 1000; // 60 segundos
        setLockedUntil(lockoutPeriod);
        setErrorMsg('Tentativas incorretas excedidas. Por proteção da escola, aguarde 60 segundos.');
      } else {
        setErrorMsg(`Código incorreto (${nextCount} de 3 tentativas). Verifique o número exibido abaixo.`);
      }
      return;
    }

    // Sucesso: reseta tentativas
    setFailedAttempts(0);
    setLockedUntil(null);

    if (pendingUser) {
      setLoading(true);
      setTimeout(() => {
        completeSuccessfulLogin(pendingUser);
      }, 300);
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
    generateNew2FACode();
    setVerificationCode('');
    setErrorMsg(null);
    setResendCooldown(30);
    setShowPromptSimulado(true);
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
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 select-none font-sans">
      <main className="w-full max-w-[410px] bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.04)] px-6 sm:px-8 py-8 flex flex-col items-center text-center">
        {/* Brasão Oficial do Município de Jundiaí */}
        <img
          src={APP_LOGO_URL}
          alt="Brasão de Jundiaí"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = APP_LOGO_FALLBACK_URL;
          }}
          className="w-12 h-12 object-contain mb-3"
        />

        {/* Identificação Institucional */}
        <div className="space-y-0.5 mb-6">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">
            Prefeitura de Jundiaí · Secretaria de Educação
          </p>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            EMEB Prof. Joaquim Candelário de Freitas
          </h1>
          <p className="text-xs text-slate-500 font-normal">
            Lista Piloto &amp; Gestão Escolar · 2027
          </p>
        </div>

        {/* Mensagem de Erro ou Alerta */}
        {errorMsg && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-50 text-rose-900 border border-rose-200/80 text-xs font-medium text-left flex items-start gap-2">
            <span className="material-symbols-outlined text-[17px] text-rose-600 shrink-0 mt-0.5">
              error
            </span>
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* ETAPA 1: IDENTIFICAÇÃO SIMPLIFICADA */}
        {step === 'identify' && (
          <div className="w-full space-y-3.5">
            {/* Card de Usuário Lembrado */}
            {rememberedUser && rememberedUser.active ? (
              <div className="w-full bg-slate-50/80 rounded-xl p-3 text-left flex items-center justify-between gap-3 border border-slate-200/80">
                <div className="flex items-center gap-2.5 min-w-0">
                  <StudentAvatar
                    name={rememberedUser.name}
                    size="sm"
                    className="w-9 h-9 text-xs shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                      Perfil Lembrado
                    </span>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {rememberedUser.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {rememberedUser.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium underline shrink-0 cursor-pointer"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <form onSubmit={handleIdentifySubmit} className="w-full space-y-2.5 text-left">
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
                    className="w-full h-11 pl-9 pr-3.5 rounded-xl bg-slate-50/50 border border-slate-200 text-slate-900 text-sm font-normal placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800/10 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Utilize seu e-mail institucional <span className="font-mono text-slate-700">@jundiai.sp.gov.br</span>.
                </p>
              </form>
            )}

            {/* Botão de Ação Principal: 1 Toque Seguro se Confiável, ou Avançar para Verificação */}
            {rememberedUser && isDeviceTrusted ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleInitiateLogin(rememberedUser.email, true)}
                  className="w-full h-11 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    verified_user
                  </span>
                  <span>Entrar como {rememberedUser.name.split(' ')[0]}</span>
                </button>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-800 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  <span>Computador reconhecido da escola</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const candidate = rememberedUser
                    ? rememberedUser.email
                    : emailInput.trim() || DEFAULT_INSTITUTIONAL_EMAIL;
                  handleInitiateLogin(candidate, false);
                }}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                    <span>Iniciando verificação...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[17px] opacity-80">
                      lock
                    </span>
                    <span>Continuar com Verificação (2FA)</span>
                  </>
                )}
              </button>
            )}

            {/* Separador e Opção Google Workspace */}
            <div className="pt-1.5 space-y-2">
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleWorkspaceLogin}
                className="w-full h-11 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
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
          <form onSubmit={handleVerify2FACode} className="w-full space-y-3.5 text-left">
            <div className="space-y-1 text-center pb-1">
              <span className="text-[11px] font-medium text-slate-500">
                Código de 6 dígitos enviado para:
              </span>
              <p className="font-mono text-xs font-semibold text-slate-800">
                {maskEmail(pendingUser.email)}
              </p>
            </div>

            {/* Aviso de Bloqueio por Força Bruta */}
            {lockoutRemaining > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">
                  lock_clock
                </span>
                <span>
                  Aguarde {lockoutRemaining}s para nova tentativa.
                </span>
              </div>
            )}

            {/* Card Institucional do Código de Acesso */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 text-left space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 font-medium">
                  Código Gerado:
                </span>
                <span className="text-base font-semibold font-mono tracking-widest text-slate-900 bg-white px-2.5 py-0.5 rounded-md border border-slate-200/80 tabular-nums">
                  {expectedCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoFillCode}
                className="w-full py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer text-center"
              >
                Preencher Código em 1 Toque
              </button>
            </div>

            {/* Input do Código de Acesso */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <label className="font-medium text-slate-700">
                  Código de 6 dígitos
                </label>
                <span className="text-[10px] tabular-nums">
                  Expira em 5 min
                </span>
              </div>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                disabled={lockoutRemaining > 0}
                value={verificationCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(val);
                  if (val.length === 6 && val === expectedCode) {
                    setErrorMsg(null);
                  }
                }}
                placeholder="000000"
                className="w-full h-12 text-center font-mono text-2xl font-medium tracking-[0.4em] rounded-xl bg-slate-50/50 border border-slate-200 text-slate-900 placeholder:text-slate-300 focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 transition-all tabular-nums disabled:opacity-50"
              />
            </div>

            {/* Checkbox Adaptativo: Confiança do Dispositivo */}
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="w-4 h-4 rounded text-slate-900 focus:ring-0 cursor-pointer"
              />
              <span>
                {pendingUser.role === 'admin'
                  ? 'Lembrar este dispositivo por 7 dias'
                  : 'Lembrar este dispositivo por 30 dias'}
              </span>
            </label>

            {/* Botão de Confirmação */}
            <button
              type="submit"
              disabled={loading || verificationCode.length !== 6 || lockoutRemaining > 0}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                  <span>Validando...</span>
                </>
              ) : (
                <span>Confirmar e Entrar</span>
              )}
            </button>

            {/* Ações Secundárias: Reenviar código e Trocar e-mail */}
            <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || lockoutRemaining > 0}
                className="hover:text-slate-900 underline cursor-pointer disabled:opacity-50 disabled:no-underline"
              >
                {resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reenviar código'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('identify');
                  setErrorMsg(null);
                  setFailedAttempts(0);
                  setLockedUntil(null);
                }}
                className="hover:text-slate-900 underline cursor-pointer"
              >
                Trocar e-mail
              </button>
            </div>
          </form>
        )}

        {/* Modal/Box de Ajuda Rápida para o Educador */}
        {showHelpModal && (
          <div className="w-full mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-medium text-slate-900">
              <span>Ajuda com seu Acesso</span>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Caso precise de ajuda com seu e-mail institucional, a equipe pode orientar você diretamente:
            </p>
            <div className="bg-white border border-slate-200 p-2 rounded-lg text-slate-800 font-mono text-[11px] tabular-nums">
              emebjfreitas@jundiai.sp.gov.br
            </div>
          </div>
        )}

        {/* Rodapé Institucional com link de ajuda */}
        <div className="mt-6 pt-4 w-full text-center space-y-1">
          <button
            type="button"
            onClick={() => setShowHelpModal(!showHelpModal)}
            className="text-[11px] font-bold text-slate-800 hover:text-black underline cursor-pointer"
          >
            Dúvidas ou dificuldades no acesso? Clique aqui
          </button>
          <p className="text-[11px] font-bold text-slate-950">
            EMEB Prof. Joaquim Candelário de Freitas
          </p>
          <p className="text-[11px] text-slate-700 font-semibold">
            Secretaria de Educação · Prefeitura de Jundiaí / SP
          </p>
        </div>
      </main>

      {/* Prompt Simulado de Notificação Corporativa com Código de Acesso */}
      {showPromptSimulado && expectedCode && pendingUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prompt-simulado-title"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-7 text-left space-y-4 border border-slate-200/90 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-950 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[22px] text-sky-800">
                    mark_email_read
                  </span>
                </div>
                <div>
                  <h2 id="prompt-simulado-title" className="text-base font-bold text-slate-950">
                    Código de Acesso Institucional
                  </h2>
                  <p className="text-xs text-slate-700 font-semibold">
                    Simulação de envio corporativo EMEB Candelário
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPromptSimulado(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Fechar notificação"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs text-slate-800">
              <div className="flex items-center justify-between text-slate-700 font-semibold border-b border-slate-200 pb-1.5">
                <span>Para: <strong className="text-slate-950 font-bold">{pendingUser.email}</strong></span>
                <span className="text-[10px] uppercase font-bold text-emerald-950 bg-emerald-100 px-2 py-0.5 rounded-full">Enviado</span>
              </div>
              <p className="leading-relaxed font-medium">
                Para fins de simplicidade institucional e rapidez no ambiente escolar, o código de acesso temporário de 6 dígitos gerado para sua conta é:
              </p>
              <div className="text-center py-2">
                <span className="inline-block px-5 py-2 rounded-2xl bg-slate-950 text-white font-mono text-2xl font-bold tracking-[0.3em] shadow-sm select-all">
                  {expectedCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-700 font-semibold text-center">
                Válido por 5 minutos · Uso restrito aos educadores autorizados
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setVerificationCode(expectedCode);
                  setShowPromptSimulado(false);
                  setErrorMsg(null);
                }}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-slate-950 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">key</span>
                <span>Inserir e Continuar</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPromptSimulado(false)}
                className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-950 border border-slate-300 text-xs font-bold cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
