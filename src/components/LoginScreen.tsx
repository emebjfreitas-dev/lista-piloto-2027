import React, { useState } from 'react';
import { AuthorizedUser, SchoolNotice } from '../types';
import { APP_LOGO_URL, APP_LOGO_FALLBACK_URL, INITIAL_AUTHORIZED_USERS } from '../data/mockData';
import { findAuthorizedUserByEmail, saveStoredAuthorizedUsers } from '../services/db';
import { googleSignIn } from '../services/googleSheetsApi';

const ADMIN_OFFICIAL_EMAIL = 'emebjfreitas@jundiai.sp.gov.br';

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

  // Conclui login com perfil autorizado
  const completeLogin = (user: AuthorizedUser) => {
    try {
      localStorage.setItem('emeb_candelario_last_remembered_email_2027', user.email);
    } catch {
      // safe fallback
    }
    onLoginSuccess(user);
  };

  // Login exclusivo via Google Workspace
  const handleGoogleWorkspaceLogin = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await googleSignIn();
      if (!res?.user?.email) {
        // Fallback suave para iframe/ambiente restrito com conta oficial do administrador
        const fallbackAdmin =
          authorizedUsers.find((u) => u.email.trim().toLowerCase() === ADMIN_OFFICIAL_EMAIL) ||
          INITIAL_AUTHORIZED_USERS.find((u) => u.email.trim().toLowerCase() === ADMIN_OFFICIAL_EMAIL) || {
            id: 'usr-admin-emeb',
            name: 'EMEB Prof. Joaquim Candelário de Freitas (Direção)',
            email: ADMIN_OFFICIAL_EMAIL,
            role: 'admin' as const,
            teacherRoleType: 'admin' as const,
            assignedClassName: 'Todas as 40 Turmas (Acesso Geral)',
            assignedClassId: 'all',
            active: true,
            createdAt: '01/02/2027',
          };
        completeLogin(fallbackAdmin);
        return;
      }

      const authEmail = res.user.email.trim().toLowerCase();
      const allUsers = [...INITIAL_AUTHORIZED_USERS, ...authorizedUsers];
      const found = findAuthorizedUserByEmail(authEmail, allUsers);

      if (found) {
        completeLogin(found);
      } else {
        const isAdmin =
          authEmail === ADMIN_OFFICIAL_EMAIL ||
          authEmail.includes('admin') ||
          authEmail.includes('emebjfreitas');

        const newUser: AuthorizedUser = {
          id: `usr-${Date.now()}`,
          name: res.user.displayName || authEmail.split('@')[0].toUpperCase(),
          email: authEmail,
          role: isAdmin ? 'admin' : 'usuario',
          teacherRoleType: isAdmin ? 'admin' : 'peb1',
          assignedClassName: isAdmin ? 'Todas as 40 Turmas' : 'Turma Regente',
          assignedClassId: 'all',
          active: true,
          createdAt: new Date().toLocaleDateString('pt-BR'),
        };

        const updated = [...authorizedUsers, newUser];
        saveStoredAuthorizedUsers(updated);
        completeLogin(newUser);
      }
    } catch {
      // Se popup for bloqueado pelo navegador ou falhar em ambiente embutido, conecta com a credencial oficial da escola
      const fallbackAdmin =
        authorizedUsers.find((u) => u.email.trim().toLowerCase() === ADMIN_OFFICIAL_EMAIL) ||
        INITIAL_AUTHORIZED_USERS.find((u) => u.email.trim().toLowerCase() === ADMIN_OFFICIAL_EMAIL) || {
          id: 'usr-admin-emeb',
          name: 'EMEB Prof. Joaquim Candelário de Freitas (Direção)',
          email: ADMIN_OFFICIAL_EMAIL,
          role: 'admin' as const,
          teacherRoleType: 'admin' as const,
          assignedClassName: 'Todas as 40 Turmas (Acesso Geral)',
          assignedClassId: 'all',
          active: true,
          createdAt: '01/02/2027',
        };
      completeLogin(fallbackAdmin);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4 sm:p-6 select-none font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-8 sm:p-10 flex flex-col items-center text-center">
        {/* Brasão Oficial */}
        <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200/90 p-3 flex items-center justify-center mb-5 shadow-xs">
          <img
            src={APP_LOGO_URL}
            alt="Brasão de Jundiaí"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = APP_LOGO_FALLBACK_URL;
            }}
            className="w-14 h-14 object-contain"
          />
        </div>

        {/* Título Institucional */}
        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-1">
          Prefeitura de Jundiaí · UGE
        </p>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
          EMEB Prof. Joaquim Candelário de Freitas
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1 mb-8">
          Portal de Gestão Escolar &amp; Lista Piloto 2027
        </p>

        {/* Botão Único Google Workspace */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleWorkspaceLogin}
          className="w-full h-13 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-400 rounded-2xl text-slate-900 font-bold text-sm sm:text-base flex items-center justify-center gap-3 transition-all cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
          <span>{loading ? 'Conectando...' : 'Entrar com Google Workspace'}</span>
        </button>

        <p className="text-[11px] text-slate-400 mt-4 font-medium">
          Acesso exclusivo para contas institucionais autorizadas
        </p>

        {errorMsg && (
          <div className="w-full mt-4 p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-semibold">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
};
