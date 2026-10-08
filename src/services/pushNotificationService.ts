import { ClassGroup, ScreenType } from '../types';

export type PushNoticeCategory = 'prazo' | 'aviso' | 'busca_ativa';

export interface PushNoticeItem {
  id: string;
  title: string;
  body: string;
  category: PushNoticeCategory;
  targetClassId?: string; // 'all' ou id da turma
  targetScreen?: ScreenType;
  createdAt: string;
  authorName?: string;
  read?: boolean;
}

export interface PushPreferences {
  enabled: boolean;
  deadlinesEnabled: boolean;
  noticesEnabled: boolean;
  activeSearchEnabled: boolean;
}

const PUSH_NOTICES_STORAGE_KEY = 'emeb_candelario_push_notices_2027_v1';
const PUSH_READ_IDS_STORAGE_KEY = 'emeb_candelario_push_read_ids_2027_v1';
const PUSH_PREFS_STORAGE_KEY = 'emeb_candelario_push_prefs_2027_v1';

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
type BannerCallback = (notice: PushNoticeItem) => void;
const bannerListeners = new Set<BannerCallback>();

export function onInAppPushBanner(cb: BannerCallback): () => void {
  bannerListeners.add(cb);
  return () => {
    bannerListeners.delete(cb);
  };
}

function emitInAppPushBanner(notice: PushNoticeItem) {
  bannerListeners.forEach((cb) => cb(notice));
}

/**
 * Registra o Service Worker (/sw.js) para suporte a Web Push e alertas em segundo plano.
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => reg)
      .catch(() => null);
  }

  return swRegistrationPromise;
}

export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function getStoredPushPreferences(): PushPreferences {
  try {
    const raw = localStorage.getItem(PUSH_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? true,
        deadlinesEnabled: parsed.deadlinesEnabled ?? true,
        noticesEnabled: parsed.noticesEnabled ?? true,
        activeSearchEnabled: parsed.activeSearchEnabled ?? true,
      };
    }
  } catch {
    // ignore
  }
  return {
    enabled: true,
    deadlinesEnabled: true,
    noticesEnabled: true,
    activeSearchEnabled: true,
  };
}

export function saveStoredPushPreferences(prefs: PushPreferences): void {
  try {
    localStorage.setItem(PUSH_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export async function requestPushNotificationPermission(): Promise<{
  granted: boolean;
  permission: NotificationPermission | 'unsupported';
  swReady: boolean;
}> {
  const reg = await registerPushServiceWorker();
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      granted: false,
      permission: 'unsupported',
      swReady: Boolean(reg),
    };
  }

  try {
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    if (granted) {
      const prefs = getStoredPushPreferences();
      saveStoredPushPreferences({ ...prefs, enabled: true });
    }
    return {
      granted,
      permission,
      swReady: Boolean(reg),
    };
  } catch {
    return {
      granted: Notification.permission === 'granted',
      permission: Notification.permission,
      swReady: Boolean(reg),
    };
  }
}

/**
 * Dispara uma notificação Push real através do Service Worker ativo (ou fallback nativo + banner Apple no topo).
 */
export async function triggerPushNotification(
  notice: Omit<PushNoticeItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
  options?: { showBanner?: boolean; saveToFeed?: boolean }
): Promise<PushNoticeItem> {
  const fullNotice: PushNoticeItem = {
    id: notice.id || `push_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: notice.title,
    body: notice.body,
    category: notice.category,
    targetClassId: notice.targetClassId || 'all',
    targetScreen: notice.targetScreen || 'turmas',
    createdAt:
      notice.createdAt ||
      new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    authorName: notice.authorName || 'Coordenação EMEB Candelário',
    read: false,
  };

  if (options?.saveToFeed !== false) {
    const existing = getStoredCustomPushNotices();
    const updated = [fullNotice, ...existing.filter((n) => n.id !== fullNotice.id)].slice(
      0,
      40
    );
    saveStoredCustomPushNotices(updated);
  }

  if (options?.showBanner !== false) {
    emitInAppPushBanner(fullNotice);
  }

  const prefs = getStoredPushPreferences();
  if (!prefs.enabled) {
    return fullNotice;
  }

  // Dispara via Service Worker se a permissão do navegador estiver concedida
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await registerPushServiceWorker();
      if (reg && reg.active) {
        reg.active.postMessage({
          type: 'SHOW_PUSH_NOTIFICATION',
          notification: {
            title: fullNotice.title,
            body: fullNotice.body,
            tag: fullNotice.id,
            targetScreen: fullNotice.targetScreen,
            category: fullNotice.category,
          },
        });
        return fullNotice;
      } else if (reg && 'showNotification' in reg) {
        await reg.showNotification(fullNotice.title, {
          body: fullNotice.body,
          icon: '/brasao-jundiai.svg',
          badge: '/brasao-jundiai.svg',
          tag: fullNotice.id,
          data: {
            targetScreen: fullNotice.targetScreen,
            category: fullNotice.category,
          },
        });
        return fullNotice;
      } else {
        new Notification(fullNotice.title, {
          body: fullNotice.body,
          icon: '/brasao-jundiai.svg',
          tag: fullNotice.id,
        });
      }
    } catch {
      // Caso o contexto restrinja notificações do SO, o banner Apple in-app já garante o alerta visual
    }
  }

  return fullNotice;
}

const DEFAULT_SCHOOL_NOTICES: PushNoticeItem[] = [
  {
    id: 'prazo_fechamento_outubro_2027',
    title: 'Prazo Próximo • Fechamento de Outubro',
    body: 'Lembrete aos docentes PEB I: conferir o lançamento de faltas e observações pedagógicas até o 5º dia útil.',
    category: 'prazo',
    targetClassId: 'all',
    targetScreen: 'frequencia_mensal',
    createdAt: 'Hoje • 08:00',
    authorName: 'Coordenação Pedagógica',
  },
  {
    id: 'aviso_busca_ativa_consecutivas',
    title: 'Busca Ativa • Faltas Seguidas (3+ Dias)',
    body: 'Ao identificar 3 ou mais faltas consecutivas, registre os dias na aba Faltas Seguidas para contato imediato da secretaria.',
    category: 'busca_ativa',
    targetClassId: 'all',
    targetScreen: 'faltas_consecutivas',
    createdAt: 'Hoje • 07:30',
    authorName: 'Secretaria Escolar',
  },
];

export function getStoredCustomPushNotices(): PushNoticeItem[] {
  try {
    const raw = localStorage.getItem(PUSH_NOTICES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SCHOOL_NOTICES;
}

export function saveStoredCustomPushNotices(notices: PushNoticeItem[]): void {
  try {
    localStorage.setItem(PUSH_NOTICES_STORAGE_KEY, JSON.stringify(notices));
  } catch {
    // ignore
  }
}

export function getReadPushNoticeIds(): string[] {
  try {
    const raw = localStorage.getItem(PUSH_READ_IDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function markPushNoticeAsRead(id: string): string[] {
  const current = getReadPushNoticeIds();
  if (current.includes(id)) return current;
  const next = [...current, id];
  try {
    localStorage.setItem(PUSH_READ_IDS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function markAllPushNoticesAsRead(ids: string[]): string[] {
  const current = getReadPushNoticeIds();
  const merged = Array.from(new Set([...current, ...ids]));
  try {
    localStorage.setItem(PUSH_READ_IDS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

/**
 * Gera avisos inteligentes automáticos de prazos e retornos da secretaria
 * com base nas turmas visíveis do professor ou coordenador.
 */
export function buildContextualPushNotices(
  visibleClasses: ClassGroup[],
  customNotices: PushNoticeItem[],
  readIds: string[]
): PushNoticeItem[] {
  const dynamicNotices: PushNoticeItem[] = [];

  for (const cls of visibleClasses) {
    const activeStudents = cls.students.filter((s) => {
      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
      return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
    });

    // 1. Retornos da família registrados pela secretaria na Busca Ativa
    const studentsWithFeedback = activeStudents.filter(
      (s) =>
        s.consecutiveAbsenceAlert?.active &&
        (s.consecutiveAbsenceAlert.familyFeedback || '').trim().length > 0
    );

    if (studentsWithFeedback.length > 0) {
      const first = studentsWithFeedback[0];
      dynamicNotices.push({
        id: `auto_feedback_${cls.id}_${first.id}`,
        title: `Retorno da Família • Turma ${cls.name}`,
        body: `${first.name.split(' ')[0]}: "${first.consecutiveAbsenceAlert?.familyFeedback}"`,
        category: 'busca_ativa',
        targetClassId: cls.id,
        targetScreen: 'faltas_consecutivas',
        createdAt: first.consecutiveAbsenceAlert?.feedbackUpdatedAt || 'Recente',
        authorName: 'Secretaria Escolar',
      });
    }

    // 2. Prazo / Pendência de observação pedagógica ou estudantes com faltas elevadas
    const highAbsenceUnjustified = activeStudents.filter(
      (s) => (s.totalAbsencesMonth || 0) >= 4 && (s.justifiedAbsences || 0) === 0
    );

    if (highAbsenceUnjustified.length > 0) {
      dynamicNotices.push({
        id: `auto_prazo_faltas_${cls.id}`,
        title: `Atenção ao Prazo • Turma ${cls.name}`,
        body: `${highAbsenceUnjustified.length} estudante(s) com 4+ faltas no mês aguardando conferência ou alerta de busca ativa.`,
        category: 'prazo',
        targetClassId: cls.id,
        targetScreen: 'frequencia_mensal',
        createdAt: 'Prazo Mensal',
        authorName: 'Monitoramento Automático',
      });
    }
  }

  const allowedClassIds = new Set(visibleClasses.map((c) => c.id));
  const filteredCustom = customNotices.filter(
    (n) => !n.targetClassId || n.targetClassId === 'all' || allowedClassIds.has(n.targetClassId)
  );

  const combined = [...dynamicNotices, ...filteredCustom];
  return combined.map((item) => ({
    ...item,
    read: readIds.includes(item.id),
  }));
}
