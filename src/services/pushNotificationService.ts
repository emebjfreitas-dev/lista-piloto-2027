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
    const baseUrl =
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
    swRegistrationPromise = navigator.serviceWorker
      .register(`${baseUrl}sw.js`, { scope: baseUrl })
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
  // Notificações FCM/Push são compulsórias para todos os usuários
  return {
    enabled: true,
    deadlinesEnabled: true,
    noticesEnabled: true,
    activeSearchEnabled: true,
  };
}

export function saveStoredPushPreferences(prefs: PushPreferences): void {
  try {
    const enforced: PushPreferences = {
      ...prefs,
      enabled: true,
      deadlinesEnabled: true,
      noticesEnabled: true,
      activeSearchEnabled: true,
    };
    localStorage.setItem(PUSH_PREFS_STORAGE_KEY, JSON.stringify(enforced));
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

const getReadStorageKey = (userEmail?: string): string => {
  const clean = (userEmail || '').trim().toLowerCase();
  return clean ? `${PUSH_READ_IDS_STORAGE_KEY}_${clean}` : PUSH_READ_IDS_STORAGE_KEY;
};

/**
 * Dispara uma notificação Push real através do Service Worker ativo (ou fallback nativo + banner Apple no topo).
 */
export async function triggerPushNotification(
  notice: Omit<PushNoticeItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
  options?: { showBanner?: boolean; saveToFeed?: boolean; userEmail?: string }
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

  // Se este usuário já deu ciência nesta notificação, não reexibe banner nem OS push
  const alreadyReadByUser = getReadPushNoticeIds(options?.userEmail).includes(fullNotice.id);
  if (alreadyReadByUser) {
    return { ...fullNotice, read: true };
  }

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

  // Notificações Push/FCM compulsórias: sempre habilitadas sem bloqueio por preferência local
  getStoredPushPreferences();

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
        const baseUrl =
          (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
        await reg.showNotification(fullNotice.title, {
          body: fullNotice.body,
          icon: `${baseUrl}pwa-192x192.png`,
          badge: `${baseUrl}favicon-32x32.png`,
          tag: fullNotice.id,
          data: {
            targetScreen: fullNotice.targetScreen,
            category: fullNotice.category,
          },
        });
        return fullNotice;
      } else {
        const baseUrl =
          (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
        new Notification(fullNotice.title, {
          body: fullNotice.body,
          icon: `${baseUrl}pwa-192x192.png`,
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
    body: 'Ao identificar 3 ou mais faltas seguidas, o(a) docente PEB I solicita contato na aba Busca Ativa para que a secretaria contate a família e registre o feedback.',
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

export function getReadPushNoticeIds(userEmail?: string): string[] {
  try {
    const userKey = getReadStorageKey(userEmail);
    const rawUser = localStorage.getItem(userKey);
    const userIds: string[] = rawUser ? JSON.parse(rawUser) : [];
    if (userKey === PUSH_READ_IDS_STORAGE_KEY) {
      return Array.isArray(userIds) ? userIds : [];
    }
    const rawLegacy = localStorage.getItem(PUSH_READ_IDS_STORAGE_KEY);
    const legacyIds: string[] = rawLegacy ? JSON.parse(rawLegacy) : [];
    return Array.from(
      new Set([
        ...(Array.isArray(userIds) ? userIds : []),
        ...(Array.isArray(legacyIds) ? legacyIds : []),
      ])
    );
  } catch {
    return [];
  }
}

export function markPushNoticeAsRead(id: string, userEmail?: string): string[] {
  const current = getReadPushNoticeIds(userEmail);
  if (current.includes(id)) return current;
  const next = [...current, id];
  try {
    localStorage.setItem(getReadStorageKey(userEmail), JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function markAllPushNoticesAsRead(ids: string[], userEmail?: string): string[] {
  const current = getReadPushNoticeIds(userEmail);
  const merged = Array.from(new Set([...current, ...ids]));
  try {
    localStorage.setItem(getReadStorageKey(userEmail), JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

export function getStudentCumulativeOccurrences(student: ClassGroup['students'][number]) {
  const alert = student.consecutiveAbsenceAlert;
  if (!alert) return [];
  if (alert.occurrences && alert.occurrences.length > 0) {
    return alert.occurrences;
  }
  if (
    alert.active ||
    (alert.selectedDates && alert.selectedDates.length > 0) ||
    (alert.familyFeedback && alert.familyFeedback.trim().length > 0)
  ) {
    return [
      {
        id: `${student.id}_occ_1`,
        sequenceNumber: 1,
        selectedDates: alert.selectedDates || [],
        reportedAt: alert.reportedAt || '',
        reportedByTeacher: alert.reportedByTeacher,
        familyFeedback: alert.familyFeedback || '',
        feedbackUpdatedAt: alert.feedbackUpdatedAt || '',
        feedbackReadByTeacher: false,
      },
    ];
  }
  return [];
}

/**
 * Gera avisos inteligentes automáticos de prazos e retornos da secretaria
 * com base nas turmas visíveis do professor ou coordenador (incluindo múltiplas ocorrências acumuladas no ano).
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

    // 1. Todos os retornos da família registrados pela secretaria nas ocorrências acumuladas
    activeStudents.forEach((s) => {
      const occs = getStudentCumulativeOccurrences(s);
      occs.forEach((occ, idx) => {
        const fb = (occ.familyFeedback || '').trim();
        if (!fb) return;
        const seq = occ.sequenceNumber || idx + 1;
        dynamicNotices.push({
          id: `auto_feedback_${cls.id}_${s.id}_${occ.id || seq}`,
          title: `Feedback da Família • ${s.name.split(' ')[0]} (${seq}ª Ocorrência)`,
          body: `Turma ${cls.name} (${occ.selectedDates.join(', ')}): "${fb}"`,
          category: 'busca_ativa',
          targetClassId: cls.id,
          targetScreen: 'faltas_consecutivas',
          createdAt: occ.feedbackUpdatedAt || occ.reportedAt || 'Recente',
          authorName: 'Secretaria Escolar',
        });
      });
    });

    // 2. Alerta imediato de Busca Ativa quando estudante excede 3 faltas consecutivas
    activeStudents.forEach((s) => {
      const occs = getStudentCumulativeOccurrences(s);
      const latestOcc = occs.length > 0 ? occs[occs.length - 1] : undefined;
      const streak = Math.max(
        latestOcc?.selectedDates?.length || 0,
        s.consecutiveAbsenceAlert?.active
          ? Math.max(3, s.consecutiveAbsenceAlert?.selectedDates?.length || 0)
          : (s.totalAbsencesMonth || 0) >= 3 && (s.justifiedAbsences || 0) === 0
          ? s.totalAbsencesMonth || 0
          : 0
      );
      if (streak >= 3) {
        const hasFeedback = Boolean(
          latestOcc?.familyFeedback?.trim() ||
            s.consecutiveAbsenceAlert?.familyFeedback?.trim()
        );
        const datesStr =
          latestOcc?.selectedDates && latestOcc.selectedDates.length > 0
            ? ` (${latestOcc.selectedDates.join(', ')})`
            : '';
        dynamicNotices.push({
          id: `auto_busca_ativa_3d_${cls.id}_${s.id}`,
          title: `Busca Ativa • ${s.name.split(' ')[0]} (${streak} Faltas Seguidas)`,
          body: hasFeedback
            ? `Estudante da turma ${cls.name} excedeu 3 faltas consecutivas${datesStr}. Retorno da família já registrado.`
            : `Estudante da turma ${cls.name} excedeu 3 faltas consecutivas${datesStr}. Sugerida ação imediata de Contato de Busca Ativa com os responsáveis.`,
          category: 'busca_ativa',
          targetClassId: cls.id,
          targetScreen: 'faltas_consecutivas',
          createdAt: latestOcc?.reportedAt || 'Alerta Ativo',
          authorName: 'Busca Ativa Escolar',
        });
      }
    });

    // 3. Prazo / Pendência de observação pedagógica ou estudantes com faltas elevadas
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
  const classPendingById = new Map(visibleClasses.map((c) => [c.id, Boolean(c.isPending)]));
  const filteredCustom = customNotices.filter((n) => {
    if (n.targetClassId && n.targetClassId !== 'all' && !allowedClassIds.has(n.targetClassId)) {
      return false;
    }
    if (
      n.id.startsWith('eod_teacher_') &&
      n.targetClassId &&
      n.targetClassId !== 'all' &&
      classPendingById.get(n.targetClassId) === false
    ) {
      return false;
    }
    return true;
  });

  const combined = [...dynamicNotices, ...filteredCustom];
  return combined.map((item) => ({
    ...item,
    read: readIds.includes(item.id),
  }));
}

/**
 * Dispara notificação push instantânea (Web Push via Service Worker + banner Apple)
 * para toda a equipe escolar quando um estudante exceder 3 faltas consecutivas.
 */
export async function triggerConsecutiveAbsencePushNotification(
  student: {
    id: string;
    name: string;
    turma?: string;
    filiacao1?: string;
    guardianName?: string;
    guardianPhone?: string;
    telefones?: string;
  },
  className: string,
  consecutiveDays: number,
  customActionText?: string
): Promise<PushNoticeItem> {
  const shortName = student.name.split(' ')[0];
  const notice: Omit<PushNoticeItem, 'id' | 'createdAt'> = {
    title: `🚨 Busca Ativa Urgente • ${shortName} (${consecutiveDays} Faltas Seguidas)`,
    body: `${student.name} excedeu 3 faltas consecutivas na turma ${className}. ${
      customActionText || 'Sugerida ação de Contato de Busca Ativa com os responsáveis.'
    }`,
    category: 'busca_ativa',
    targetClassId: student.turma || 'all',
    targetScreen: 'faltas_consecutivas',
    authorName: 'Coordenação / Busca Ativa EMEB Candelário',
  };

  return triggerPushNotification(notice, {
    showBanner: true,
    saveToFeed: true,
  });
}
