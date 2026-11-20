import { getAuth } from 'firebase/auth';
import { AuthorizedUser } from '../types';
import { isBackendApiAvailable } from './apiEnvironment';
import { CLEAN_DB_RESET_EPOCH_ID } from './firebaseSync';

export const getActiveUserAuthHeaders = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem('emeb_candelario_active_session_2027_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.email) {
        const email = String(parsed.email).trim().toLowerCase();
        const role = String(
          parsed.role || (email.startsWith('emebjfreitas@') ? 'admin' : 'usuario')
        )
          .trim()
          .toLowerCase();
        return {
          'x-user-email': email,
          'x-user-role': role,
          'x-user-name': encodeURIComponent(String(parsed.name || '')),
          'x-clean-epoch': CLEAN_DB_RESET_EPOCH_ID,
        };
      }
    }
  } catch {
    // fallback
  }
  return {
    'x-clean-epoch': CLEAN_DB_RESET_EPOCH_ID,
  };
};

export const getActiveUserAuthHeadersAsync = async (
  forceRefresh = false
): Promise<Record<string, string>> => {
  const base = getActiveUserAuthHeaders();
  try {
    const currentUser = getAuth().currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken(forceRefresh);
      if (idToken) {
        return {
          ...base,
          Authorization: `Bearer ${idToken}`,
        };
      }
    }
  } catch {
    // fallback to signed HttpOnly session cookie
  }
  return base;
};

export const establishServerAuthSessionCookie = async (
  explicitIdToken?: string
): Promise<boolean> => {
  if (!isBackendApiAvailable()) return false;
  try {
    const token =
      explicitIdToken ||
      (await getAuth().currentUser?.getIdToken().catch(() => null)) ||
      '';
    if (!token) return false;
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify({ idToken: token }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

export const clearServerAuthSessionCookie = async (): Promise<void> => {
  if (!isBackendApiAvailable()) return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // ignore logout error
  }
};

export const formatDurationHuman = (seconds?: number): string => {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s === 0) return '0s';
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  }
  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
};

export const getLocalTodayDateISO = (referenceDate: Date = new Date()): string => {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isUserAccessExpired = (
  user: Pick<AuthorizedUser, 'accessExpiresAt'>,
  referenceDate: Date = new Date()
): boolean => {
  const raw = typeof user.accessExpiresAt === 'string' ? user.accessExpiresAt.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  return getLocalTodayDateISO(referenceDate) > raw;
};

export const isUserAccessEffectivelyActive = (
  user: Pick<AuthorizedUser, 'active' | 'accessExpiresAt'>,
  referenceDate: Date = new Date()
): boolean => Boolean(user.active) && !isUserAccessExpired(user, referenceDate);

export const formatAccessExpirationDateBR = (dateISO?: string): string => {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO.trim())) return '';
  const [y, m, d] = dateISO.trim().split('-');
  return `${d}/${m}/${y}`;
};
