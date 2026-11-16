/* Service Worker Oficial — EMEB Joaquim Candelário de Freitas (PWA Offline & Web Push) */
const SW_VERSION = 'candelario-pwa-v4';
const CACHE_NAME = 'candelario-offline-v4';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './favicon.svg',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('Aviso ao pré-carregar cache PWA:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Estratégia de Cache Offline:
 * - Requisições para API (/api/), Firebase, Google Docs/Sheets e autenticação vão direto para a rede (sem cache)
 * - Navegações HTML: Network First com fallback para index.html em cache
 * - Assets estáticos (JS, CSS, imagens locais, fontes): Stale-While-Revalidate / Cache First
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Aceita apenas requisições GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignora APIs, WebSocket, extensões de navegador e serviços externos em nuvem
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // Requisições de navegação (páginas HTML)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback =
            (await caches.match('./index.html')) ||
            (await caches.match('/index.html')) ||
            (await caches.match('./'));
          if (fallback) return fallback;
          return new Response('Modo Offline — Lista Piloto Candelário 2027', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // Assets estáticos da mesma origem (JS, CSS, imagens, fontes)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) {
          // Revalida em segundo plano (Stale-While-Revalidate)
          fetch(req)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
              }
            })
            .catch(() => {});
          return cachedRes;
        }

        return fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkRes;
          })
          .catch(() => {
            // Fallback para imagens
            if (req.destination === 'image') {
              return caches.match('./pwa-192x192.png');
            }
          });
      })
    );
  }
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
