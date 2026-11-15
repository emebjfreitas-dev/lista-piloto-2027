/* Service Worker Oficial — EMEB Joaquim Candelário de Freitas (FCM Web Push & Alertas de Fechamento) */
const SW_VERSION = 'candelario-fcm-sw-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Escuta eventos Web Push / Firebase Cloud Messaging (FCM HTTP v1) em segundo plano
 */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'EMEB Candelário · Fechamento de Frequência',
    body: 'A janela de lançamento mensal de presença está próxima do encerramento.',
    icon: '/pwa-192x192.png',
    badge: '/favicon-32x32.png',
    tag: 'candelario-fcm-' + Date.now(),
    requireInteraction: false,
    data: {
      targetScreen: 'frequencia_mensal',
      category: 'prazo',
      urgency: 'warning',
      url: '/?screen=frequencia_mensal',
    },
  };

  if (event.data) {
    try {
      const raw = event.data.json();
      const notif = raw.notification || (raw.webpush && raw.webpush.notification) || {};
      const dataObj = raw.data || {};
      const fcmLink =
        (raw.fcmOptions && raw.fcmOptions.link) ||
        (raw.webpush && raw.webpush.fcm_options && raw.webpush.fcm_options.link);
      const urgency = dataObj.urgency || raw.urgency || 'warning';
      const targetScreen = dataObj.targetScreen || 'frequencia_mensal';
      const targetClassId =
        dataObj.targetClassId && dataObj.targetClassId !== 'all'
          ? dataObj.targetClassId
          : '';
      const computedUrl =
        fcmLink ||
        dataObj.url ||
        `/?screen=${encodeURIComponent(targetScreen)}${
          targetClassId ? `&classId=${encodeURIComponent(targetClassId)}` : ''
        }`;

      payload = {
        ...payload,
        title: notif.title || dataObj.title || raw.title || payload.title,
        body: notif.body || dataObj.body || raw.body || payload.body,
        icon: notif.icon || raw.icon || payload.icon,
        badge: notif.badge || raw.badge || payload.badge,
        tag:
          notif.tag ||
          raw.collapseKey ||
          dataObj.alertId ||
          raw.tag ||
          payload.tag,
        requireInteraction: urgency === 'urgent' || dataObj.category === 'prazo',
        data: {
          ...payload.data,
          ...dataObj,
          targetScreen,
          ...(targetClassId ? { targetClassId } : {}),
          url: computedUrl,
        },
      };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const targetScreen = (payload.data && payload.data.targetScreen) || 'frequencia_mensal';
  const actions =
    targetScreen === 'frequencia_mensal'
      ? [{ action: 'open_attendance', title: 'Abrir Frequência Mensal' }]
      : [];

  const options = {
    body: payload.body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/favicon-32x32.png',
    tag: payload.tag,
    renotify: true,
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: [150, 70, 150],
    actions,
    data: payload.data,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

/**
 * Escuta mensagens diretas da aplicação cliente (ex: FCM foreground relay, alertas automáticos da janela ou avisos da coordenação)
 */
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SHOW_PUSH_NOTIFICATION' && msg.notification) {
    const { title, body, tag, targetScreen, targetClassId, category, urgency } = msg.notification;
    const isUrgent = urgency === 'urgent' || category === 'prazo';
    const resolvedScreen = targetScreen || 'turmas';
    const classQuery =
      targetClassId && targetClassId !== 'all'
        ? `&classId=${encodeURIComponent(targetClassId)}`
        : '';
    const options = {
      body: body || '',
      icon: '/pwa-192x192.png',
      badge: '/favicon-32x32.png',
      tag: tag || 'candelario-notice-' + Date.now(),
      renotify: true,
      requireInteraction: isUrgent,
      vibrate: [120, 60, 120],
      actions:
        resolvedScreen === 'frequencia_mensal'
          ? [{ action: 'open_attendance', title: 'Lançar Faltas' }]
          : [],
      data: {
        targetScreen: resolvedScreen,
        targetClassId: targetClassId || undefined,
        category: category || 'aviso',
        urgency: urgency || 'info',
        url: `/?screen=${encodeURIComponent(resolvedScreen)}${classQuery}`,
      },
    };

    event.waitUntil(
      self.registration.showNotification(
        title || 'EMEB Candelário de Freitas',
        options
      )
    );
  }
});

/**
 * Notifica clientes ativos caso o navegador rotacione a assinatura Push/FCM
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'FCM_SUBSCRIPTION_REFRESH_NEEDED' });
      });
    })
  );
});

/**
 * Ao clicar na notificação Push (FCM ou local), foca a janela do app e navega direto para a tela de destino (ex: frequencia_mensal)
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetScreen = notifData.targetScreen || 'frequencia_mensal';
  const targetClassId =
    notifData.targetClassId && notifData.targetClassId !== 'all'
      ? notifData.targetClassId
      : undefined;
  const alertId = notifData.alertId || undefined;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({
              type: 'PUSH_NOTIFICATION_CLICKED',
              targetScreen,
              targetClassId,
              alertId,
            });
            return;
          }
        }
        if (self.clients.openWindow) {
          const classQuery = targetClassId
            ? `&classId=${encodeURIComponent(targetClassId)}`
            : '';
          const targetUrl =
            notifData.url || `/?screen=${encodeURIComponent(targetScreen)}${classQuery}`;
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
