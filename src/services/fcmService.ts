import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getMessaging,
  getToken,
  onMessage,
  deleteToken,
  isSupported as isMessagingSupported,
  Messaging,
  MessagePayload,
} from 'firebase/messaging';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AttendanceWindowConfig,
  AuthorizedUser,
  ClassGroup,
  FcmDeviceSubscription,
  FcmSystemConfig,
  FcmWindowAlert,
  ScreenType,
  UserRole,
} from '../types';
import { evaluateAttendanceLaunchWindow, getActiveUserAuthHeaders } from './db';
import { firestoreDb, saveConfigMetaToFirestoreCloud } from './firebaseSync';
import { isBackendApiAvailable } from './apiEnvironment';
import {
  PushNoticeItem,
  getPushPermissionState,
  getStoredPushPreferences,
  registerPushServiceWorker,
  saveStoredPushPreferences,
  triggerPushNotification,
} from './pushNotificationService';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const FCM_TOKEN_STORAGE_KEY = 'emeb_candelario_fcm_device_token_v1';
const PUSH_SUB_ACTIVE_STORAGE_KEY = 'emeb_candelario_webpush_active_v1';
const FCM_CONFIG_STORAGE_KEY = 'emeb_candelario_fcm_system_config_v1';
const FCM_SEEN_ALERTS_STORAGE_KEY = 'emeb_candelario_fcm_seen_alerts_v1';
const FCM_DAILY_WINDOW_REMINDER_KEY = 'emeb_candelario_fcm_window_reminder_day_v1';

const DEFAULT_FCM_CONFIG: FcmSystemConfig = {
  vapidPublicKey: '',
  autoWindowAlertsEnabled: true,
  notifyDaysBeforeClose: 2,
  remindPendingTeachersOnly: true,
};

let messagingInstance: Messaging | null = null;

export interface FcmRegistrationResult {
  ok: boolean;
  supported: boolean;
  channel: 'fcm_push' | 'sw_realtime';
  fcmToken: string | null;
  hasPushSubscription: boolean;
  permission: NotificationPermission | 'unsupported';
  swReady: boolean;
  message: string;
}

export interface FcmBackendStatus {
  autoConfigured?: boolean;
  autoVapidPublicKey?: string;
  hasServiceAccountConfigured: boolean;
  hasFirebaseAdminAccount?: boolean;
  hasVapidKey: boolean;
  totalRegisteredDevices: number;
  activeFcmTokensCount: number;
  teachersCoveredEmails: string[];
  recentDispatches: FcmWindowAlert[];
  fcmConfig: FcmSystemConfig;
  tokensSummary: Array<{
    id: string;
    userEmail: string;
    userName: string;
    userRole: UserRole;
    assignedClassIds: string[];
    channel: 'fcm_push' | 'sw_realtime';
    deviceLabel: string;
    active: boolean;
    updatedAtMs: number;
    hasFcmToken: boolean;
  }>;
}

export function getFcmDeviceSubscriptionId(email: string): string {
  const clean = (email || 'anonimo')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 90);
  return `fcm_sub_${clean}`;
}

export function getStoredFcmToken(): string | null {
  try {
    return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredFcmToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage quota errors
  }
}

function getStoredPushSubscriptionActive(): boolean {
  try {
    return localStorage.getItem(PUSH_SUB_ACTIVE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setStoredPushSubscriptionActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(PUSH_SUB_ACTIVE_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(PUSH_SUB_ACTIVE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function fetchAutoVapidKeysFromServer(): Promise<{
  publicKey: string;
  firebaseVapidKey: string;
}> {
  if (!isBackendApiAvailable()) {
    return { publicKey: '', firebaseVapidKey: '' };
  }
  try {
    const res = await fetch('/api/fcm/vapid-public-key', {
      headers: getActiveUserAuthHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return { publicKey: '', firebaseVapidKey: '' };
    const data = await res.json();
    return {
      publicKey: typeof data?.publicKey === 'string' ? data.publicKey.trim() : '',
      firebaseVapidKey:
        typeof data?.firebaseVapidKey === 'string' ? data.firebaseVapidKey.trim() : '',
    };
  } catch {
    return { publicKey: '', firebaseVapidKey: '' };
  }
}

export function getStoredFcmSystemConfig(): FcmSystemConfig {
  try {
    const raw = localStorage.getItem(FCM_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_FCM_CONFIG,
        ...parsed,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_FCM_CONFIG;
}

export function saveStoredFcmSystemConfig(config: FcmSystemConfig): void {
  try {
    localStorage.setItem(FCM_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function getEffectiveVapidKey(overrideKey?: string): string {
  if (overrideKey && overrideKey.trim()) return overrideKey.trim();
  const envKey = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_FIREBASE_VAPID_KEY;
  if (envKey && envKey.trim()) return envKey.trim();
  const cfgKey = getStoredFcmSystemConfig().vapidPublicKey;
  return (cfgKey || '').trim();
}

function getCompactDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Safari / PWA';
  if (/Android/i.test(ua)) return 'Android Chrome / PWA';
  if (/Edg\//i.test(ua)) return 'Desktop Edge';
  if (/Chrome\//i.test(ua)) return 'Desktop Chrome';
  if (/Firefox\//i.test(ua)) return 'Desktop Firefox';
  if (/Safari\//i.test(ua)) return 'macOS Safari';
  return 'Navegador Web';
}

function getSeenAlertIds(): string[] {
  try {
    const raw = localStorage.getItem(FCM_SEEN_ALERTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function markAlertIdSeen(alertId: string): boolean {
  const seen = getSeenAlertIds();
  if (seen.includes(alertId)) return false;
  try {
    localStorage.setItem(
      FCM_SEEN_ALERTS_STORAGE_KEY,
      JSON.stringify([alertId, ...seen].slice(0, 120))
    );
  } catch {
    // ignore
  }
  return true;
}

async function getSafeMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await isMessagingSupported();
    if (!supported) return null;
    if (!messagingInstance) {
      messagingInstance = getMessaging(app);
    }
    return messagingInstance;
  } catch {
    return null;
  }
}

/**
 * Registra o dispositivo do professor no Firebase Cloud Messaging (FCM),
 * obtém o Token Push quando suportado pelo navegador/VAPID e persiste no servidor + Firestore.
 */
export async function registerDeviceForFcm(params: {
  userEmail: string;
  userName: string;
  userRole: UserRole;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  assignedClassIds?: string[];
  vapidKeyOverride?: string;
}): Promise<FcmRegistrationResult> {
  const reg = await registerPushServiceWorker();
  const swReady = Boolean(reg);
  const messagingSupported = await isMessagingSupported().catch(() => false);
  const pushManagerSupported = Boolean(reg && 'pushManager' in reg);
  const supported = messagingSupported || pushManagerSupported;

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      ok: false,
      supported: false,
      channel: 'sw_realtime',
      fcmToken: null,
      hasPushSubscription: false,
      permission: 'unsupported',
      swReady,
      message: 'Navegador sem suporte à API de Notificações. Alertas internos continuam ativos.',
    };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }

  if (permission !== 'granted') {
    return {
      ok: false,
      supported,
      channel: 'sw_realtime',
      fcmToken: null,
      hasPushSubscription: false,
      permission,
      swReady,
      message:
        permission === 'denied'
          ? 'Permissão de notificações bloqueada no navegador. Libere nas configurações do site para receber alertas Push.'
          : 'Permissão de notificações não concedida.',
    };
  }

  const prefs = getStoredPushPreferences();
  saveStoredPushPreferences({ ...prefs, enabled: true, deadlinesEnabled: true });

  // Busca chave pública VAPID gerada automaticamente pelo servidor (zero configuração manual)
  const serverVapid = await fetchAutoVapidKeysFromServer();
  const autoPublicKey = serverVapid.publicKey;
  const firebaseVapidKey =
    serverVapid.firebaseVapidKey || getEffectiveVapidKey(params.vapidKeyOverride);

  let obtainedFcmToken: string | null = getStoredFcmToken();
  let pushSubscriptionPayload: FcmDeviceSubscription['pushSubscription'] | undefined = undefined;
  let statusDetail = 'Alertas em tempo real ativos via Service Worker.';

  // 1. Inscrição Web Push padrão RFC 8291 (usa a chave VAPID automática do servidor -> entrega pelo FCM Web Push do navegador)
  if (reg && 'pushManager' in reg && autoPublicKey) {
    try {
      let existingSub = await reg.pushManager.getSubscription();
      if (!existingSub) {
        existingSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(autoPublicKey),
        });
      }
      if (existingSub) {
        const subJson = existingSub.toJSON();
        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
          pushSubscriptionPayload = {
            endpoint: subJson.endpoint,
            expirationTime: subJson.expirationTime ?? null,
            keys: {
              p256dh: subJson.keys.p256dh,
              auth: subJson.keys.auth,
            },
          };
          setStoredPushSubscriptionActive(true);
          statusDetail =
            'Notificações Push configuradas e ativadas automaticamente neste dispositivo.';
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('Web Push PushManager fallback para FCM/SW:', errMsg);
    }
  }

  // 2. Complemento Firebase Cloud Messaging getToken quando VAPID do Firebase estiver disponível
  const messaging = await getSafeMessagingInstance();
  if (messaging && reg && firebaseVapidKey) {
    try {
      const token = await getToken(messaging, {
        vapidKey: firebaseVapidKey,
        serviceWorkerRegistration: reg,
      });
      if (token) {
        obtainedFcmToken = token;
        setStoredFcmToken(token);
        setStoredPushSubscriptionActive(true);
        statusDetail = 'Dispositivo conectado ao Firebase Cloud Messaging (FCM) e Web Push.';
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('FCM getToken fallback para Web Push/SW:', errMsg);
    }
  }

  const hasPushChannel = Boolean(obtainedFcmToken || pushSubscriptionPayload);
  const channel: 'fcm_push' | 'sw_realtime' = hasPushChannel ? 'fcm_push' : 'sw_realtime';

  if (!hasPushChannel && swReady) {
    statusDetail =
      'Notificações em tempo real ativadas neste dispositivo (modo compatível com navegador embutido).';
  }

  const cleanEmail = (params.userEmail || '').trim().toLowerCase();
  const subId = getFcmDeviceSubscriptionId(cleanEmail);
  const nowMs = Date.now();
  const subscription: FcmDeviceSubscription = {
    id: subId,
    userEmail: cleanEmail,
    userName: params.userName || cleanEmail.split('@')[0],
    userRole: params.userRole,
    teacherRoleType: params.teacherRoleType,
    assignedClassIds: Array.isArray(params.assignedClassIds) ? params.assignedClassIds : [],
    ...(obtainedFcmToken ? { fcmToken: obtainedFcmToken } : {}),
    ...(pushSubscriptionPayload ? { pushSubscription: pushSubscriptionPayload } : {}),
    channel,
    permission,
    deviceLabel: getCompactDeviceLabel(),
    active: true,
    createdAtISO: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
  };

  // 3. Persistir no backend Express (para disparo automático e manual em segundo plano)
  if (isBackendApiAvailable()) {
    try {
      await fetch('/api/fcm/register-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getActiveUserAuthHeaders(),
        },
        body: JSON.stringify(subscription),
      });
    } catch {
      // ignore offline
    }
  }

  // 4. Persistir no Firestore se sessão Firebase Auth estiver ativa
  try {
    const auth = getAuth(app);
    if (auth.currentUser) {
      await setDoc(doc(firestoreDb, 'school_fcm_tokens_2027', subId), subscription, {
        merge: true,
      });
    }
  } catch {
    // fallback silencioso caso iframe não possua token Firebase Auth
  }

  return {
    ok: true,
    supported,
    channel,
    fcmToken: obtainedFcmToken,
    hasPushSubscription: Boolean(pushSubscriptionPayload || obtainedFcmToken),
    permission,
    swReady,
    message: statusDetail,
  };
}

/**
 * Desativa e remove o token FCM / inscrição Web Push deste dispositivo.
 */
export async function unregisterDeviceFromFcm(userEmail: string): Promise<void> {
  const messaging = await getSafeMessagingInstance();
  if (messaging) {
    try {
      await deleteToken(messaging);
    } catch {
      // ignore
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const existingSub = await reg?.pushManager?.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }
    } catch {
      // ignore
    }
  }

  setStoredFcmToken(null);
  setStoredPushSubscriptionActive(false);

  const prefs = getStoredPushPreferences();
  saveStoredPushPreferences({ ...prefs, enabled: false });

  const cleanEmail = (userEmail || '').trim().toLowerCase();
  const subId = getFcmDeviceSubscriptionId(cleanEmail);

  if (isBackendApiAvailable()) {
    try {
      await fetch('/api/fcm/unregister-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getActiveUserAuthHeaders(),
        },
        body: JSON.stringify({ id: subId, userEmail: cleanEmail }),
      });
    } catch {
      // ignore
    }
  }

  try {
    const auth = getAuth(app);
    if (auth.currentUser) {
      await setDoc(
        doc(firestoreDb, 'school_fcm_tokens_2027', subId),
        {
          id: subId,
          userEmail: cleanEmail,
          channel: 'sw_realtime',
          active: false,
          updatedAtMs: Date.now(),
        },
        { merge: true }
      );
    }
  } catch {
    // ignore
  }
}

/**
 * Inscreve o aplicativo em:
 * 1) Mensagens FCM em primeiro plano (`onMessage`)
 * 2) Feed em tempo real do Firestore (`school_fcm_alerts_2027`)
 * 3) Sincronismo periódico de alertas no backend (`/api/fcm/alerts`)
 */
export function subscribeToFcmNotifications(params: {
  userEmail: string;
  userRole: UserRole;
  assignedClassIds: string[];
  onAlertReceived?: (notice: PushNoticeItem) => void;
}): () => void {
  let cancelled = false;
  let unsubFcmForeground: (() => void) | null = null;
  let unsubFirestoreAlerts: (() => void) | null = null;
  let pollIntervalId: number | null = null;

  const processIncomingAlert = async (alert: FcmWindowAlert) => {
    if (cancelled || !alert || !alert.id) return;
    // Filtra por audiência/turma do professor (Admin vê todos os broadcasts)
    if (params.userRole !== 'admin') {
      if (
        alert.targetAudience === 'peb1' &&
        params.userRole !== 'usuario'
      ) {
        return;
      }
      if (
        Array.isArray(alert.targetClassIds) &&
        alert.targetClassIds.length > 0 &&
        !alert.targetClassIds.includes('all') &&
        params.assignedClassIds.length > 0
      ) {
        const hasMatch = params.assignedClassIds.some((cid) =>
          alert.targetClassIds.includes(cid)
        );
        if (!hasMatch) return;
      }
    }

    // Evita disparar duplicado no mesmo dispositivo
    const isNew = markAlertIdSeen(alert.id);
    if (!isNew) return;

    const notice = await triggerPushNotification(
      {
        id: alert.id,
        title: alert.title,
        body: alert.body,
        category: alert.category || 'prazo',
        targetClassId:
          alert.targetClassIds && alert.targetClassIds.length === 1
            ? alert.targetClassIds[0]
            : 'all',
        targetScreen: alert.targetScreen || 'frequencia_mensal',
        authorName: alert.createdByName || 'Coordenação EMEB Candelário',
        createdAt: new Date(alert.createdAtMs || Date.now()).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
      { showBanner: true, saveToFeed: true }
    );
    params.onAlertReceived?.(notice);
  };

  // 1. FCM Foreground (`onMessage`)
  getSafeMessagingInstance().then((messaging) => {
    if (cancelled || !messaging) return;
    try {
      unsubFcmForeground = onMessage(messaging, async (payload: MessagePayload) => {
        const notif = payload.notification || {};
        const data = payload.data || {};
        const msgId = data.alertId || payload.messageId || `fcm_fg_${Date.now()}`;
        if (!markAlertIdSeen(msgId)) return;

        const notice = await triggerPushNotification(
          {
            id: msgId,
            title: notif.title || data.title || 'Prazo de Frequência Mensal',
            body:
              notif.body ||
              data.body ||
              'A janela de lançamento de presença está se encerrando. Confira sua turma.',
            category: (data.category as PushNoticeItem['category']) || 'prazo',
            targetClassId: data.targetClassId || 'all',
            targetScreen: (data.targetScreen as ScreenType) || 'frequencia_mensal',
            authorName: data.authorName || 'Firebase Cloud Messaging',
          },
          { showBanner: true, saveToFeed: true }
        );
        params.onAlertReceived?.(notice);
      });
    } catch {
      // ignore if browser blocks messaging listener
    }
  });

  // 2. Firestore real-time alerts (`school_fcm_alerts_2027`) quando autenticado no Firebase Auth
  try {
    const auth = getAuth(app);
    if (auth.currentUser) {
      const q = query(
        collection(firestoreDb, 'school_fcm_alerts_2027'),
        orderBy('createdAtMs', 'desc'),
        limit(10)
      );
      const bootThresholdMs = Date.now() - 1000 * 60 * 60 * 12; // últimas 12h
      unsubFirestoreAlerts = onSnapshot(
        q,
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const alert = change.doc.data() as FcmWindowAlert;
              if ((alert.createdAtMs || 0) >= bootThresholdMs) {
                void processIncomingAlert(alert);
              }
            }
          });
        },
        () => {
          // ignore permission errors if Firebase Auth session expired
        }
      );
    }
  } catch {
    // ignore
  }

  // 3. Backend fallback polling para ambientes embutidos sem Firebase Auth popup
  const pollBackendAlerts = async () => {
    if (cancelled || !isBackendApiAvailable()) return;
    try {
      const res = await fetch('/api/fcm/alerts', {
        headers: getActiveUserAuthHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      const alerts: FcmWindowAlert[] = Array.isArray(data?.alerts) ? data.alerts : [];
      const thresholdMs = Date.now() - 1000 * 60 * 60 * 12;
      for (const alert of alerts) {
        if ((alert.createdAtMs || 0) >= thresholdMs) {
          await processIncomingAlert(alert);
        }
      }
    } catch {
      // ignore offline
    }
  };

  if (isBackendApiAvailable()) {
    void pollBackendAlerts();
    pollIntervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void pollBackendAlerts();
      }
    }, 30000);
  }

  return () => {
    cancelled = true;
    if (unsubFcmForeground) unsubFcmForeground();
    if (unsubFirestoreAlerts) unsubFirestoreAlerts();
    if (pollIntervalId !== null) window.clearInterval(pollIntervalId);
  };
}

/**
 * Verifica automaticamente se a janela de lançamento está em fase crítica de abertura/fechamento
 * e envia um lembrete push diário (deduplicado) para que o professor não esqueça de lançar as faltas.
 */
export async function evaluateAndTriggerWindowClosingReminder(params: {
  attendanceWindowConfig: AttendanceWindowConfig;
  visibleClasses: ClassGroup[];
  userEmail: string;
  userRole: UserRole;
  forceNotify?: boolean;
}): Promise<PushNoticeItem | null> {
  const prefs = getStoredPushPreferences();
  if (!prefs.enabled || !prefs.deadlinesEnabled) return null;

  const win = evaluateAttendanceLaunchWindow(params.attendanceWindowConfig);
  const pendingClasses = params.visibleClasses.filter((c) => c.isPending);

  const isCriticalPhase =
    win.windowPhase === 'next_month_closing' ||
    win.windowPhase === 'last_day' ||
    win.windowPhase === 'closing_soon' ||
    win.windowPhase === 'override_open';

  if (!isCriticalPhase && !params.forceNotify) {
    return null;
  }

  // Se não houver turmas pendentes visíveis para este professor e não for disparo forçado, não incomodar
  if (pendingClasses.length === 0 && !params.forceNotify) {
    return null;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const dedupKey = `${todayKey}|${win.windowPhase}|${win.urgencyLevel}|${pendingClasses.length}|${(
    params.userEmail || ''
  )
    .trim()
    .toLowerCase()}`;

  if (!params.forceNotify) {
    try {
      const lastSentKey = localStorage.getItem(FCM_DAILY_WINDOW_REMINDER_KEY);
      if (lastSentKey === dedupKey) {
        return null;
      }
      localStorage.setItem(FCM_DAILY_WINDOW_REMINDER_KEY, dedupKey);
    } catch {
      // ignore
    }
  }

  const classPreview =
    pendingClasses.length > 0
      ? pendingClasses
          .slice(0, 3)
          .map((c) => c.name)
          .join(', ') + (pendingClasses.length > 3 ? ` e +${pendingClasses.length - 3}` : '')
      : `${params.visibleClasses.length} turma(s)`;

  let title = `Lembrete de Janela • ${win.targetMonthName}`;
  let body = `Confira o lançamento de presença até ${win.closingDateFormatted}.`;

  if (win.windowPhase === 'next_month_closing' && win.urgencyLevel === 'urgent') {
    title = `ÚLTIMO DIA: Fechamento da Janela Hoje (${win.closingDateFormatted})`;
    body = `Restam poucas horas! ${pendingClasses.length} turma(s) pendente(s) (${classPreview}). Conclua as faltas e atestados hoje para não perder o prazo.`;
  } else if (win.windowPhase === 'next_month_closing') {
    title = `Janela Fecha Amanhã (${win.closingDateFormatted})`;
    body = `${pendingClasses.length} turma(s) ainda aguardam fechamento (${classPreview}). Toque para lançar a frequência mensal.`;
  } else if (win.windowPhase === 'last_day') {
    title = `Janela de Frequência Aberta Hoje (${win.targetMonthName})`;
    body = `Último dia letivo do mês! Lançamento liberado até ${win.closingDateFormatted} para ${classPreview}.`;
  } else if (win.windowPhase === 'closing_soon') {
    title = `Fechamento em ${win.daysRemaining} dia(s) • ${win.targetMonthName}`;
    body = `Prepare os registros e atestados de ${classPreview}. A janela oficial abre em ${win.nextWindowOpenDateFormatted} e encerra em ${win.closingDateFormatted}.`;
  } else if (win.windowPhase === 'override_open') {
    title = `Liberação Excepcional Ativa • ${win.targetMonthName}`;
    body = `A gestão abriu o lançamento de presença para regularização (${classPreview}). Confira suas pendências antes do encerramento.`;
  }

  return triggerPushNotification(
    {
      id: `window_auto_${todayKey}_${win.windowPhase}`,
      title,
      body,
      category: 'prazo',
      targetClassId: pendingClasses[0]?.id || 'all',
      targetScreen: 'frequencia_mensal',
      authorName: 'FCM · Monitoramento de Prazos',
    },
    { showBanner: true, saveToFeed: true }
  );
}

/**
 * Dispara alerta FCM oficial sobre o fechamento da janela de lançamento de presença
 * para professores (com suporte a envio HTTP v1 em background + Firestore realtime + Service Worker).
 */
export async function dispatchWindowClosingFcmAlert(params: {
  title?: string;
  body?: string;
  targetAudience?: 'all' | 'pending_only' | 'peb1';
  targetClassIds?: string[];
  attendanceWindowConfig: AttendanceWindowConfig;
  classes: ClassGroup[];
  senderEmail: string;
  senderName: string;
}): Promise<{
  ok: boolean;
  alert: FcmWindowAlert;
  deliveredFcmCount: number;
  realtimeNotified: boolean;
  message: string;
}> {
  const win = evaluateAttendanceLaunchWindow(params.attendanceWindowConfig);
  const pendingClasses = params.classes.filter((c) => c.isPending);
  const audience = params.targetAudience || 'pending_only';

  const resolvedClassIds =
    params.targetClassIds && params.targetClassIds.length > 0
      ? params.targetClassIds
      : audience === 'pending_only' && pendingClasses.length > 0
      ? pendingClasses.map((c) => c.id)
      : ['all'];

  const urgency: FcmWindowAlert['urgency'] =
    win.urgencyLevel === 'urgent'
      ? 'urgent'
      : win.windowPhase === 'next_month_closing' || win.windowPhase === 'last_day'
      ? 'warning'
      : 'info';

  const defaultTitle =
    win.urgencyLevel === 'urgent'
      ? `ÚLTIMO DIA: Fechamento de Frequência Hoje (${win.closingDateFormatted})`
      : win.isAllowedToLaunch
      ? `Janela de Frequência Aberta — Encerra em ${win.closingDateFormatted}`
      : `Aviso de Fechamento • Próxima Janela em ${win.nextWindowOpenDateFormatted}`;

  const defaultBody =
    pendingClasses.length > 0
      ? `Atenção docentes: ${pendingClasses.length} turma(s) ainda com fechamento pendente (${pendingClasses
          .slice(0, 4)
          .map((c) => c.name)
          .join(', ')}${pendingClasses.length > 4 ? '...' : ''}). Conclua os lançamentos até ${win.closingDateFormatted}.`
      : `Lembrete oficial de conferência da frequência de ${win.targetMonthName}. Prazo final: ${win.closingDateFormatted}.`;

  const nowMs = Date.now();
  const alertId = `fcm_win_${nowMs}_${Math.random().toString(36).slice(2, 6)}`;
  const alert: FcmWindowAlert = {
    id: alertId,
    title: (params.title || defaultTitle).slice(0, 175),
    body: (params.body || defaultBody).slice(0, 580),
    category: 'prazo',
    urgency,
    targetScreen: 'frequencia_mensal',
    targetClassIds: resolvedClassIds,
    targetAudience: audience,
    closingDateFormatted: win.closingDateFormatted,
    windowPhase: win.windowPhase,
    createdAtMs: nowMs,
    createdAtISO: new Date(nowMs).toISOString(),
    createdByEmail: params.senderEmail,
    createdByName: params.senderName || 'Gestão Escolar',
    pendingClassesCount: pendingClasses.length,
  };

  let deliveredFcmCount = 0;
  let serverMessage = 'Alerta publicado em tempo real para os dispositivos conectados.';

  // 1. Disparo backend (FCM HTTP v1 + persistência no estado compartilhado)
  if (isBackendApiAvailable()) {
    try {
      const res = await fetch('/api/fcm/send-window-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getActiveUserAuthHeaders(),
        },
        body: JSON.stringify({ alert }),
      });
      if (res.ok) {
        const data = await res.json();
        deliveredFcmCount = Number(data?.deliveredFcmCount || 0);
        if (data?.message) serverMessage = data.message;
      }
    } catch {
      // fallback Firestore/local abaixo
    }
  }

  // 2. Publicar no Firestore `school_fcm_alerts_2027` para entrega realtime aos clientes
  try {
    const auth = getAuth(app);
    if (auth.currentUser) {
      await setDoc(doc(firestoreDb, 'school_fcm_alerts_2027', alertId), alert);
    }
  } catch {
    // ignore if auth session not active
  }

  // 3. Garantir feedback imediato local na central e Service Worker
  markAlertIdSeen(alertId);
  await triggerPushNotification(
    {
      id: alert.id,
      title: alert.title,
      body: alert.body,
      category: 'prazo',
      targetClassId: resolvedClassIds[0] || 'all',
      targetScreen: 'frequencia_mensal',
      authorName: alert.createdByName,
    },
    { showBanner: true, saveToFeed: true }
  );

  return {
    ok: true,
    alert: { ...alert, deliveredFcmCount },
    deliveredFcmCount,
    realtimeNotified: true,
    message: serverMessage,
  };
}

export async function fetchFcmBackendStatus(): Promise<FcmBackendStatus | null> {
  if (!isBackendApiAvailable()) return null;
  try {
    const res = await fetch('/api/fcm/status', {
      headers: getActiveUserAuthHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.fcmConfig) {
      saveStoredFcmSystemConfig(data.fcmConfig);
    }
    return data as FcmBackendStatus;
  } catch {
    return null;
  }
}

export async function saveFcmSystemConfiguration(
  config: FcmSystemConfig
): Promise<boolean> {
  const nextConfig: FcmSystemConfig = {
    ...config,
    updatedAtMs: Date.now(),
  };
  saveStoredFcmSystemConfig(nextConfig);

  try {
    await saveConfigMetaToFirestoreCloud({});
  } catch {
    // ignore
  }

  if (isBackendApiAvailable()) {
    try {
      const res = await fetch('/api/fcm/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getActiveUserAuthHeaders(),
        },
        body: JSON.stringify({ fcmConfig: nextConfig }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  return true;
}

export function getFcmCapabilitySnapshot(): {
  permission: NotificationPermission | 'unsupported';
  hasFcmToken: boolean;
  hasVapidKey: boolean;
} {
  return {
    permission: getPushPermissionState(),
    hasFcmToken: Boolean(getStoredFcmToken()) || getStoredPushSubscriptionActive(),
    hasVapidKey: true,
  };
}
